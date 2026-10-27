import type { PayrollRecord } from '../../services/dataService';

export type PayrollBankAccount = {
  employeeCode: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  isPrimary?: boolean;
  status: string;
};

export function normalizePayrollMonth(value: unknown): string | null {
  const text = String(value ?? '').trim();
  const match = text.match(/(?:^|\D)(\d{1,2})[/-](\d{4})(?:\D|$)/);
  if (match) return `${match[1].padStart(2, '0')}/${match[2]}`;
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?/);
  if (isoMatch) return `${isoMatch[2].padStart(2, '0')}/${isoMatch[1]}`;
  return null;
}

export function filterPayrollForMonth(records: PayrollRecord[], month: string): PayrollRecord[] {
  const wanted = normalizePayrollMonth(month);
  const datedRecords = records.filter((record) => normalizePayrollMonth(record.month));
  if (!wanted || datedRecords.length === 0) return records;
  return datedRecords.filter((record) => normalizePayrollMonth(record.month) === wanted);
}

export function payrollReportRows(records: PayrollRecord[], report: 'payroll' | 'attendance' | 'insurance' | 'tax', month: string): Array<Array<string | number | null>> {
  if (report === 'attendance') {
    return [
      ['Kỳ lương', month],
      ['Mã nhân viên', 'Họ tên', 'Phòng ban', 'Ngày công thực tế'],
      ...records.map((record) => [record.employeeCode, record.employeeName, record.department, Number(record.workDays) || 0]),
    ];
  }
  if (report === 'insurance') {
    return [
      ['Kỳ lương', month],
      ['Mã nhân viên', 'Họ tên', 'Lương cơ sở đóng bảo hiểm', 'BHXH người lao động 8%', 'BHYT người lao động 1.5%', 'BHTN người lao động 1%', 'Tổng khấu trừ bảo hiểm', 'Khoản doanh nghiệp đóng 21.5%'],
      ...records.map((record) => [record.employeeCode, record.employeeName, record.baseSalary, Math.round(record.baseSalary * 0.08), Math.round(record.baseSalary * 0.015), Math.round(record.baseSalary * 0.01), record.insuranceDeduction, Math.round(record.baseSalary * 0.215)]),
    ];
  }
  if (report === 'tax') {
    return [
      ['Kỳ lương', month],
      ['Mã nhân viên', 'Họ tên', 'Thu nhập trước khấu trừ', 'Khấu trừ bảo hiểm', 'Thuế TNCN đã tính trong hồ sơ lương'],
      ...records.map((record) => [record.employeeCode, record.employeeName, record.baseSalary + record.allowance + record.bonus, record.insuranceDeduction, record.taxDeduction]),
    ];
  }
  return [
    ['Kỳ lương', month],
    ['Mã nhân viên', 'Họ tên', 'Phòng ban', 'Lương cơ sở', 'Ngày công', 'Phụ cấp', 'Thưởng', 'Khấu trừ bảo hiểm', 'Khấu trừ thuế', 'Thực lĩnh', 'Trạng thái'],
    ...records.map((record) => [record.employeeCode, record.employeeName, record.department, record.baseSalary, record.workDays, record.allowance, record.bonus, record.insuranceDeduction, record.taxDeduction, record.netSalary, record.status]),
  ];
}

export function payrollBankRows(records: PayrollRecord[], accounts: PayrollBankAccount[], month: string): { rows: Array<Array<string | number | null>>; skipped: number } {
  const approvedByEmployee = new Map<string, PayrollBankAccount>();
  for (const account of accounts) {
    const status = account.status === 'verified' ? 'Đã duyệt' : account.status;
    if (status !== 'Đã duyệt' || !account.employeeCode || !account.accountNumber) continue;
    const current = approvedByEmployee.get(account.employeeCode);
    if (!current || (!current.isPrimary && account.isPrimary)) approvedByEmployee.set(account.employeeCode, account);
  }
  const unpaid = records.filter((record) => record.status === 'Chưa chi trả');
  const payable = unpaid.flatMap((record) => {
    const account = approvedByEmployee.get(record.employeeCode);
    if (!account) return [];
    return [[account.accountHolder || record.employeeName, account.accountNumber, account.bankName, record.netSalary, `Luong ${month.replace('/', '-')}`]];
  });
  return {
    rows: [
      ['Kỳ lương', month],
      ['Tên người thụ hưởng', 'Số tài khoản', 'Ngân hàng', 'Số tiền', 'Nội dung chuyển khoản'],
      ...payable,
    ],
    skipped: unpaid.length - payable.length,
  };
}
