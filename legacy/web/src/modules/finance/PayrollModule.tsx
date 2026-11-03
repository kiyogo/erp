import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  DownloadOutlined,
  EyeOutlined,
  AuditOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Select, Button, Input, message, Card, Tag } from '../../custom-ui';
import { dataService, PayrollRecord } from '../../services/dataService';
import { financeCashApi, financePaymentAccountsApi, FinancePaymentAccount, payrollLedgerApi, systemApi } from '../../api/endpoints';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { filterPayrollForMonth, normalizePayrollMonth, payrollBankRows, payrollReportRows } from './payrollExports';

export const PayrollModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const isAttendance = currentPath === '/finance/payroll/attendance';
  const isInsurance = currentPath === '/finance/payroll/insurance';
  const isDisburse = currentPath === '/finance/payroll/disburse';
  const isAccounting = currentPath === '/finance/payroll/accounting';

  const [data, setData] = useState<PayrollRecord[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(new Date()).split('-').reverse().join('/'));
  const [employerCharge, setEmployerCharge] = useState('');
  const [accountingRegime, setAccountingRegime] = useState('');
  const [chartAccounts, setChartAccounts] = useState<any[]>([]);
  const [costAccount, setCostAccount] = useState('');
  const [insuranceBreakdown, setInsuranceBreakdown] = useState({
    employerSocial: '', employerHealth: '', employerUnemployment: '',
    employeeSocial: '', employeeHealth: '', employeeUnemployment: '',
  });
  const [postingLedger, setPostingLedger] = useState(false);
  const [postedPeriods, setPostedPeriods] = useState<string[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sheetDialog, setSheetDialog] = useState(false);
  const [sheetType, setSheetType] = useState('Lương cố định (không dựa trên bảng chấm công)');
  const [sheetName, setSheetName] = useState('');
  const [sheetBase, setSheetBase] = useState(false);
  const [sheetStartDate, setSheetStartDate] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`);
  const [sheetEndDate, setSheetEndDate] = useState('');
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'Tiền mặt' | 'Tiền gửi'>('Tiền mặt');
  const [paymentDate, setPaymentDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()));
  const [paymentRows, setPaymentRows] = useState<PayrollRecord[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<FinancePaymentAccount[]>([]);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentReferences, setPaymentReferences] = useState<Record<string, string>>({});
  const [loadingPaymentAccounts, setLoadingPaymentAccounts] = useState(false);
  const [insuranceLoaded, setInsuranceLoaded] = useState(false);
  const [insuranceDialog, setInsuranceDialog] = useState(false);
  const [insuranceCashTransactions, setInsuranceCashTransactions] = useState<any[]>([]);
  const [insuranceAllocations, setInsuranceAllocations] = useState({ '3383': '', '3384': '', '3386': '' });
  const [insurancePaymentReference, setInsurancePaymentReference] = useState('');
  const [submittingInsurance, setSubmittingInsurance] = useState(false);
  const [accountingSheetKey, setAccountingSheetKey] = useState('');

  const loadData = () => {
    setData(dataService.getPayroll());
  };

  const downloadPayslip = (record: PayrollRecord) => {
    const lines = [
      `Nhan vien: ${record.employeeName} - ${record.employeeCode}`,
      `Phong ban: ${record.department}`,
      `Ky luong: ${selectedMonth}`,
      `Luong co ban: ${record.baseSalary.toLocaleString('vi-VN')} VND`,
      `Ngay cong: ${record.workDays}`,
      `Phu cap: ${record.allowance.toLocaleString('vi-VN')} VND`,
      `Thuong: ${record.bonus.toLocaleString('vi-VN')} VND`,
      `Khau tru bao hiem: ${record.insuranceDeduction.toLocaleString('vi-VN')} VND`,
      `Thuc linh: ${record.netSalary.toLocaleString('vi-VN')} VND`,
    ];
    downloadFile(`phieu_luong_${record.employeeCode}_${selectedMonth.replace('/', '-')}.pdf`, generateValidPdfBlob('PHIEU LUONG', 'Bang tinh luong theo du lieu hien co', lines));
  };

  const emailPayslip = async (record: PayrollRecord) => {
    const employee = dataService.getEmployees().find((item) => item.code === record.employeeCode);
    if (!employee?.email?.trim()) {
      message.error(`Hồ sơ ${record.employeeName} chưa có địa chỉ email.`);
      return;
    }
    const content = [
      `Xin chào ${record.employeeName},`,
      `Thông tin lương kỳ ${selectedMonth}:`,
      `Lương cơ bản: ${record.baseSalary.toLocaleString('vi-VN')} ₫`,
      `Ngày công: ${record.workDays}`,
      `Phụ cấp: ${record.allowance.toLocaleString('vi-VN')} ₫`,
      `Thưởng: ${record.bonus.toLocaleString('vi-VN')} ₫`,
      `Khấu trừ bảo hiểm: ${record.insuranceDeduction.toLocaleString('vi-VN')} ₫`,
      `Thực lĩnh: ${record.netSalary.toLocaleString('vi-VN')} ₫`,
    ].join('\n');
    try {
      const response = await systemApi.sendEmail({
        to: employee.email,
        subject: `Thông tin lương kỳ ${selectedMonth}`,
        content,
        category: 'payroll_payslip',
      });
      message.success(`Đã gửi thông tin lương đến ${employee.email}.`);
      return response.data;
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không gửi được email. Kiểm tra cấu hình SMTP và quyền tài khoản.');
    }
  };

  useEffect(() => {
    loadData();
    return dataService.subscribe(loadData);
  }, []);

  useEffect(() => {
    if (!isAccounting && !isInsurance) return;
    let active = true;
    systemApi.getCompanyProfile().then(async ({ data: response }) => {
      const regime = String(response.profile.accountingRegime || '');
      if (!active) return;
      setAccountingRegime(regime);
      const accounts = await dataService.refreshGenericData('finance_chart_of_accounts');
      if (active) setChartAccounts(accounts.filter((account) => account.accountingRegime === regime && account.status === 'Đang sử dụng'));
    }).catch(() => { if (active) message.error('Không tải được chế độ kế toán và danh mục tài khoản doanh nghiệp.'); });
    if (isAccounting) {
      payrollLedgerApi.postedPeriods().then(({ data: response }) => { if (active) setPostedPeriods(response.periods); })
        .catch(() => { if (active) message.error('Không tải được các kỳ lương đã ghi sổ.'); });
    }
    return () => { active = false; };
  }, [isAccounting, isInsurance]);

  useEffect(() => {
    if (!isDisburse && !isInsurance) return;
    let active = true;
    setLoadingPaymentAccounts(true);
    Promise.all([financePaymentAccountsApi.getAccounts(), financeCashApi.getAll()]).then(([{ data: response }, { data: transactions }]) => {
      if (!active) return;
      setPaymentAccounts(response.accounts);
      setPaymentAccountId((current) => current || response.accounts.find((account) => account.source === 'petty')?.key || response.accounts[0]?.key || '');
      setInsuranceCashTransactions(transactions.data);
    }).catch((error: any) => {
      if (active) message.error(error?.response?.data?.message || 'Không tải được danh sách tài khoản chi lương.');
    }).finally(() => { if (active) setLoadingPaymentAccounts(false); });
    return () => { active = false; };
  }, [isDisburse, isInsurance]);

  const periodData = filterPayrollForMonth(data, selectedMonth);
  const orgUnits = dataService.getOrgUnits();
  const payrollSheets = dataService.getGenericData('finance_payroll_sheets');
  const totalPayroll = periodData.reduce((sum, item) => sum + item.netSalary, 0);
  const grossPayroll = periodData.reduce((sum, item) => sum + item.baseSalary + item.allowance + item.bonus, 0);
  const employeeInsurance = periodData.reduce((sum, item) => sum + item.insuranceDeduction, 0);
  const payrollCostAccounts = chartAccounts.filter((account) => account.accountType === 'Chi phí' && !chartAccounts.some((item) => item.parentCode === account.code));
  const insuranceBreakdownValues = Object.fromEntries(Object.entries(insuranceBreakdown).map(([key, value]) => [key, Number(value)])) as Record<keyof typeof insuranceBreakdown, number>;
  const insuranceDueRows = [
    { code: '3383', name: 'Bảo hiểm xã hội', due: insuranceBreakdownValues.employerSocial + insuranceBreakdownValues.employeeSocial },
    { code: '3384', name: 'Bảo hiểm y tế', due: insuranceBreakdownValues.employerHealth + insuranceBreakdownValues.employeeHealth },
    { code: '3386', name: 'Bảo hiểm thất nghiệp', due: insuranceBreakdownValues.employerUnemployment + insuranceBreakdownValues.employeeUnemployment },
  ];
  const insurancePeriodPayments = insuranceCashTransactions.filter((transaction) => transaction.status === 'Đã hoàn thành'
    && transaction.category === 'Nộp bảo hiểm' && String(transaction.note || '').includes(`Nộp bảo hiểm kỳ ${selectedMonth}`));
  const insurancePaidAmount = (accountCode: string) => insurancePeriodPayments.reduce((sum, transaction) => sum + (transaction.journalLines || [])
    .filter((line: any) => String(line.debitAccount || '').replace(/^TK\s*/i, '').trim() === accountCode)
    .reduce((lineSum: number, line: any) => lineSum + Number(line.amount || 0), 0), 0);
  const availablePaymentAccounts = paymentAccounts.filter((account) => account.status === 'Đang hoạt động'
    && account.source === (paymentMethod === 'Tiền mặt' ? 'petty' : 'bank'));
  const loadInsuranceDue = () => {
    if (accountingRegime !== 'TT99') { message.error('Chức năng này cần danh mục tài khoản TT99 đã được xác minh.'); return; }
    if (insuranceDueRows.some((row) => !Number.isSafeInteger(row.due) || row.due < 0)) { message.error('Tổng nghĩa vụ bảo hiểm vượt giới hạn số tiền hợp lệ.'); return; }
    if (Object.values(insuranceBreakdown).some((value) => value.trim() === '')
      || Object.values(insuranceBreakdownValues).some((value) => !Number.isSafeInteger(value) || value < 0)) {
      message.error('Nhập số liệu BHXH, BHYT và BHTN đã đối chiếu tại mục Hạch toán lương trước.'); return;
    }
    const employeeTotal = insuranceBreakdownValues.employeeSocial + insuranceBreakdownValues.employeeHealth + insuranceBreakdownValues.employeeUnemployment;
    if (employeeTotal !== employeeInsurance) { message.error('Số bảo hiểm người lao động phải khớp khoản khấu trừ trên bảng lương.'); return; }
    if (['3383', '3384', '3386'].some((code) => !chartAccounts.some((account) => account.code === code && account.accountingRegime === 'TT99' && account.accountType === 'Nợ phải trả'))) {
      message.error('Danh mục TT99 cần có đủ tài khoản chi tiết 3383, 3384 và 3386 trước khi ghi phiếu chi.'); return;
    }
    setInsuranceAllocations({ '3383': '', '3384': '', '3386': '' });
    setInsuranceLoaded(true);
  };
  const submitInsurancePayment = async () => {
    if (!insuranceLoaded) { message.error('Hãy lấy nghĩa vụ bảo hiểm đã đối chiếu trước.'); return; }
    const source = availablePaymentAccounts.find((account) => account.key === paymentAccountId);
    if (!source) { message.error('Chọn tài khoản tiền mặt hoặc tiền gửi đang hoạt động.'); return; }
    if (!paymentDate || insurancePaymentReference.trim().length < 3) { message.error('Nhập ngày nộp và mã chứng từ hoặc mã giao dịch thực tế.'); return; }
    const allocations = insuranceDueRows.map((row) => {
      const value = insuranceAllocations[row.code as keyof typeof insuranceAllocations].trim();
      return { ...row, amount: value === '' ? 0 : Number(value), remaining: Math.max(0, row.due - insurancePaidAmount(row.code)) };
    });
    if (allocations.some(({ amount }) => !Number.isSafeInteger(amount) || amount < 0)) { message.error('Số tiền phân bổ phải là số nguyên không âm.'); return; }
    if (allocations.some(({ amount, remaining }) => amount > remaining)) { message.error('Số tiền nộp cho từng tài khoản không được vượt phần nghĩa vụ còn lại.'); return; }
    const total = allocations.reduce((sum, row) => sum + row.amount, 0);
    if (!Number.isSafeInteger(total) || total <= 0) { message.error('Nhập số tiền nộp lớn hơn 0 cho ít nhất một khoản bảo hiểm.'); return; }
    if (total > source.balance) { message.error('Số tiền nộp vượt số dư tài khoản thanh toán đã chọn.'); return; }
    const duplicateReference = insuranceCashTransactions.some((transaction) => transaction.status !== 'Đã hủy'
      && transaction.category === 'Nộp bảo hiểm' && transaction.reference?.trim().toLowerCase() === insurancePaymentReference.trim().toLowerCase());
    if (duplicateReference) { message.error('Mã chứng từ này đã được dùng cho một phiếu nộp bảo hiểm khác.'); return; }
    setSubmittingInsurance(true);
    try {
      await financeCashApi.create({
        type: 'Chi', source: source.source, category: 'Nộp bảo hiểm', amount: total, date: paymentDate,
        reference: insurancePaymentReference.trim(), recipientOrPayer: 'Cơ quan Bảo hiểm xã hội', account: source.name,
        status: 'Đã hoàn thành', note: `Nộp bảo hiểm kỳ ${selectedMonth}; mã chứng từ ${insurancePaymentReference.trim()}`,
        sourceAccountId: source.key, counterpartyType: 'other',
        journalLines: allocations.filter((row) => row.amount > 0).map((row) => ({
          description: `Nộp bảo hiểm kỳ ${selectedMonth} · ${row.name}`,
          debitAccount: `TK ${row.code}`, creditAccount: source.source === 'petty' ? 'TK 111' : 'TK 112', amount: row.amount,
        })),
      });
      const { data: latestTransactions } = await financeCashApi.getAll();
      setInsuranceCashTransactions(latestTransactions.data);
      await dataService.refreshGenericData('finance_general_ledger').catch(() => {});
      setPaymentAccounts((await financePaymentAccountsApi.getAccounts()).data.accounts);
      setInsuranceAllocations({ '3383': '', '3384': '', '3386': '' });
      setInsurancePaymentReference('');
      setInsuranceDialog(false);
      message.success('Đã ghi phiếu chi bảo hiểm và bút toán vào Sổ Cái.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không ghi được phiếu chi bảo hiểm.');
    } finally { setSubmittingInsurance(false); }
  };
  const availableMonths = Array.from(new Set([selectedMonth, ...postedPeriods, ...data.map((item) => normalizePayrollMonth(item.month)).filter((month): month is string => Boolean(month))]))
    .filter((month) => normalizePayrollMonth(month))
    .sort((a, b) => `${b.slice(3)}-${b.slice(0, 2)}`.localeCompare(`${a.slice(3)}-${a.slice(0, 2)}`))
    .map((value) => ({ value, label: `Tháng ${value.slice(0, 2)} / ${value.slice(3)}` }));
  if (data.some((item) => !normalizePayrollMonth(item.month))) availableMonths.push({ value: 'Chưa xác định kỳ', label: 'Chưa xác định kỳ' });

  const prepareLedgerRequest = () => {
    if (!normalizePayrollMonth(selectedMonth)) { message.error('Chọn kỳ lương hợp lệ để ghi sổ.'); return null; }
    if (!accountingRegime) { message.error('Chưa xác định được chế độ kế toán của doanh nghiệp.'); return null; }
    if (accountingRegime === 'TT99') {
      const values = Object.fromEntries(Object.entries(insuranceBreakdown).map(([key, value]) => [key, Number(value)])) as Record<keyof typeof insuranceBreakdown, number>;
      if (Object.values(insuranceBreakdown).some((value) => value.trim() === '')
        || Object.values(values).some((value) => !Number.isSafeInteger(value) || value < 0)) {
        message.error('Nhập số nguyên không âm cho từng khoản BHXH, BHYT và BHTN đã đối chiếu.'); return null;
      }
      const employerTotal = values.employerSocial + values.employerHealth + values.employerUnemployment;
      const employeeTotal = values.employeeSocial + values.employeeHealth + values.employeeUnemployment;
      if (!Number.isSafeInteger(employerTotal) || !Number.isSafeInteger(employeeTotal)) { message.error('Tổng các khoản bảo hiểm vượt giới hạn số tiền hợp lệ.'); return null; }
      if (employeeTotal !== employeeInsurance) { message.error('Tổng BHXH, BHYT và BHTN người lao động phải bằng tổng khấu trừ bảo hiểm của kỳ lương.'); return null; }
      if (!costAccount) { message.error('Chọn tài khoản chi phí phù hợp với bộ phận lương đã đối chiếu.'); return null; }
      return { period: selectedMonth, employerInsurance: employerTotal, insuranceBreakdown: values, costAccount };
    }
    if (employerCharge.trim() === '' || !Number.isSafeInteger(Number(employerCharge)) || Number(employerCharge) < 0) {
      message.error('Nhập số tiền bảo hiểm doanh nghiệp đã đối chiếu.'); return null;
    }
    return { period: selectedMonth, employerInsurance: Number(employerCharge) };
  };

  const payrollAccountingLines = accountingRegime === 'TT99' ? [
    { desc: 'Ghi nhận tiền lương phải trả', debit: `Nợ TK ${costAccount || '—'}`, credit: 'Có TK 334', amount: grossPayroll },
    ...([
      ['employerSocial', '3383', 'Trích bảo hiểm xã hội phần doanh nghiệp'],
      ['employerHealth', '3384', 'Trích bảo hiểm y tế phần doanh nghiệp'],
      ['employerUnemployment', '3386', 'Trích bảo hiểm thất nghiệp phần doanh nghiệp'],
    ] as const).map(([field, account, desc]) => ({ desc, debit: `Nợ TK ${costAccount || '—'}`, credit: `Có TK ${account}`, amount: Number(insuranceBreakdown[field]) || 0 })),
    ...([
      ['employeeSocial', '3383', 'Khấu trừ bảo hiểm xã hội người lao động'],
      ['employeeHealth', '3384', 'Khấu trừ bảo hiểm y tế người lao động'],
      ['employeeUnemployment', '3386', 'Khấu trừ bảo hiểm thất nghiệp người lao động'],
    ] as const).map(([field, account, desc]) => ({ desc, debit: 'Nợ TK 334', credit: `Có TK ${account}`, amount: Number(insuranceBreakdown[field]) || 0 })),
  ] : [
    { desc: 'Ghi nhận tiền lương phải trả', debit: 'Nợ TK 642', credit: 'Có TK 334', amount: grossPayroll },
    { desc: 'Trích bảo hiểm phần doanh nghiệp', debit: 'Nợ TK 642', credit: 'Có TK 338', amount: Number(employerCharge) || 0 },
    { desc: 'Khấu trừ bảo hiểm người lao động', debit: 'Nợ TK 334', credit: 'Có TK 338', amount: employeeInsurance },
  ];

  const exportPayrollReport = (report: 'payroll' | 'attendance' | 'insurance', fileName: string, successText: string) => {
    downloadFile(fileName, generateValidXlsxBlob(payrollReportRows(periodData, report, selectedMonth)));
    message.success(successText);
  };

  const getEmployeeBankAccount = (employeeCode: string) => dataService.getEmployeeBankAccounts()
    .filter((account: any) => account?.employeeCode === employeeCode && (account?.status === 'Đã duyệt' || account?.status === 'verified') && account?.accountNumber)
    .sort((a: any, b: any) => Number(Boolean(b?.isPrimary)) - Number(Boolean(a?.isPrimary)))[0];

  const exportBankPaymentFile = async () => {
    try {
      const accounts = await dataService.refreshGenericData('employee_bank_accounts');
      const result = payrollBankRows(periodData, accounts, selectedMonth);
      if (result.rows.length === 2) {
        message.warning('Chưa có nhân viên nào vừa có lương chưa chi trả vừa có tài khoản ngân hàng đã duyệt.');
        return;
      }
      downloadFile(`lenh_chi_luong_${selectedMonth.replace('/', '-')}.xlsx`, generateValidXlsxBlob(result.rows));
      message.success(`Đã xuất ${result.rows.length - 2} lệnh chuyển khoản. Bỏ qua ${result.skipped} nhân viên chưa có tài khoản nhận lương đã duyệt.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được danh sách tài khoản nhận lương.');
    }
  };

  const postPayrollToLedger = async () => {
    const request = prepareLedgerRequest();
    if (!request) return;
    setPostingLedger(true);
    try {
      const preview = (await payrollLedgerApi.preview(request)).data;
      Modal.confirm({
        title: `Ghi sổ các bút toán lương kỳ ${preview.period}?`,
        content: <div><div>{preview.employeeCount} phiếu lương</div>{preview.lines.map((line) => <div key={line.description}>{line.description}: Nợ {line.debitAccount}, Có {line.creditAccount}, {line.amount.toLocaleString('vi-VN')} ₫</div>)}</div>,
        okText: 'Ghi sổ', cancelText: 'Hủy',
        onOk: async () => {
          try {
            const saved = await payrollLedgerApi.post({ ...request, fingerprint: preview.fingerprint });
            await dataService.refreshGenericData('finance_general_ledger').catch(() => {});
            setPostedPeriods((periods) => Array.from(new Set([...periods, preview.period])));
            message.success(`Đã ghi ${saved.data.lines.length} bút toán lương kỳ ${preview.period} vào Sổ Cái.`);
          } catch (error: any) {
            message.error(error?.response?.data?.message || 'Không thể ghi bút toán lương vào Sổ Cái.');
            throw error;
          }
        },
      });
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể xem trước bút toán lương.'); }
    finally { setPostingLedger(false); }
  };

  const adjustPayrollLedger = async () => {
    const request = prepareLedgerRequest();
    if (!request) return;
    setPostingLedger(true);
    try {
      const preview = (await payrollLedgerApi.previewAdjustment(request)).data;
      Modal.confirm({
        title: `Ghi điều chỉnh lương kỳ ${preview.period}?`,
        content: <div><div>{preview.employeeCount} phiếu lương hiện tại</div>{preview.lines.map((line) => <div key={line.description}>{line.description}: Nợ {line.debitAccount}, Có {line.creditAccount}, {line.amount.toLocaleString('vi-VN')} ₫</div>)}</div>,
        okText: 'Ghi điều chỉnh', cancelText: 'Hủy',
        onOk: async () => {
          try {
            const saved = await payrollLedgerApi.postAdjustment({ ...request, fingerprint: preview.fingerprint });
            await dataService.refreshGenericData('finance_general_ledger').catch(() => {});
            message.success(`Đã ghi ${saved.data.lines.length} bút toán điều chỉnh kỳ ${preview.period}.`);
          } catch (error: any) {
            message.error(error?.response?.data?.message || 'Không thể ghi điều chỉnh lương.');
            throw error;
          }
        },
      });
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể xem trước điều chỉnh lương.'); }
    finally { setPostingLedger(false); }
  };

  const handlePayOut = (record: PayrollRecord) => {
    const source = availablePaymentAccounts.find((account) => account.key === paymentAccountId);
    const settlementReference = (paymentReferences[record.key] || '').trim();
    if (!source) { message.error('Chọn tài khoản chi đang hoạt động.'); return; }
    if (!paymentDate) { message.error('Chọn ngày chi lương.'); return; }
    if (settlementReference.length < 3) { message.error('Nhập mã giao dịch hoặc số chứng từ chi, tối thiểu 3 ký tự.'); return; }
    if (source.balance < record.netSalary) { message.error(`Số dư ${source.name} không đủ chi lương.`); return; }
    Modal.confirm({
      title: `Ghi nhận đã chi lương cho ${record.employeeName}?`,
      content: `Xác nhận chỉ sau khi đã thực hiện giao dịch ${record.netSalary.toLocaleString('vi-VN')} ₫ từ ${source.name}. Hệ thống sẽ lập phiếu chi, cập nhật số dư và ghi bút toán Nợ TK 334, Có ${source.source === 'petty' ? 'TK 111' : 'TK 112'} theo mã ${settlementReference}.`,
      okText: 'Đã thực hiện giao dịch',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await payrollLedgerApi.disburse(record.key, { sourceAccountId: source.key, paymentDate, settlementReference });
          const refreshed = await dataService.refreshGenericData('payroll');
          setData(refreshed as PayrollRecord[]);
          setPaymentRows((rows) => rows.filter((row) => row.key !== record.key));
          setPaymentReferences((references) => { const next = { ...references }; delete next[record.key]; return next; });
          await dataService.refreshGenericData('finance_general_ledger').catch(() => {});
          const accounts = (await financePaymentAccountsApi.getAccounts()).data.accounts;
          setPaymentAccounts(accounts);
          message.success(`Đã lập phiếu chi và ghi Sổ Cái cho ${record.employeeName}.`);
        } catch (error: any) {
          message.error(error?.response?.data?.message || 'Không thể ghi nhận nghiệp vụ chi lương.');
          throw error;
        }
      },
    });
  };

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {!isAttendance && !isInsurance && !isDisburse && !isAccounting && <Button onClick={() => setSheetDialog(true)}>Thêm bảng lương</Button>}
        <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>Kỳ lương:</span>
        <Select value={selectedMonth} onChange={(month) => { setSelectedMonth(month); setEmployerCharge(''); setInsuranceBreakdown({ employerSocial: '', employerHealth: '', employerUnemployment: '', employeeSocial: '', employeeHealth: '', employeeUnemployment: '' }); setInsuranceLoaded(false); setInsuranceAllocations({ '3383': '', '3384': '', '3386': '' }); setInsurancePaymentReference(''); }} options={availableMonths} style={{ width: 160 }} />
      </div>
      <Modal title="Thêm bảng lương" open={sheetDialog} onCancel={() => setSheetDialog(false)} onOk={() => {
        if (!sheetName.trim() || selectedUnits.length === 0) { message.error('Nhập tên bảng lương và chọn ít nhất một đơn vị.'); return; }
        const rows = dataService.getGenericData('finance_payroll_sheets');
        if (!sheetStartDate || !sheetEndDate || sheetEndDate < sheetStartDate) { message.error('Chọn khoảng ngày hợp lệ cho bảng lương.'); return; }
        dataService.saveGenericData('finance_payroll_sheets', [{ key: String(Date.now()), name: sheetName.trim(), type: sheetType, month: selectedMonth.slice(0, 2), year: selectedMonth.slice(3), startDate: sheetStartDate, endDate: sheetEndDate, unitKeys: selectedUnits, basedOnOther: sheetBase, status: 'Nháp' }, ...rows]);
        setSheetDialog(false); setSheetName(''); message.success('Đã tạo bảng lương.');
      }} okText="Lưu" width={760}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label>Loại bảng lương<Select value={sheetType} onChange={setSheetType} options={['Lương cố định (không dựa trên bảng chấm công)', 'Lương thời gian theo buổi', 'Lương thời gian theo giờ', 'Lương tạm ứng'].map((value) => ({ value, label: value }))} /></label>
          <label>Tháng<Input type="number" min={1} max={12} value={selectedMonth.slice(0, 2)} onChange={(e: any) => setSelectedMonth(`${String(e.target.value).padStart(2, '0')}/${selectedMonth.slice(3)}`)} /></label>
          <label>Năm<Input type="number" value={selectedMonth.slice(3)} onChange={(e: any) => setSelectedMonth(`${selectedMonth.slice(0, 2)}/${e.target.value}`)} /></label>
          <label>Từ ngày<Input type="date" value={sheetStartDate} onChange={(e: any) => setSheetStartDate(e.target.value)} /></label>
          <label>Đến ngày<Input type="date" value={sheetEndDate} onChange={(e: any) => setSheetEndDate(e.target.value)} /></label>
          <label style={{ gridColumn: '1 / -1' }}>Tên bảng lương<Input value={sheetName} onChange={(e: any) => setSheetName(e.target.value)} /></label>
          <label style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={sheetBase} onChange={(e) => setSheetBase(e.target.checked)} /> Tạo bảng lương dựa trên bảng lương khác</label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '14px 0 6px' }}><span>Đơn vị áp dụng</span><Button size="small" onClick={() => setSelectedUnits(orgUnits.map((unit) => unit.key))}>Chọn tất cả</Button></div>
        <div style={{ maxHeight: 210, overflow: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th></th><th>Mã đơn vị</th><th>Tên đơn vị</th><th>Cấp tổ chức</th></tr></thead><tbody>{orgUnits.map((unit) => <tr key={unit.key}><td><input type="checkbox" checked={selectedUnits.includes(unit.key)} onChange={(e) => setSelectedUnits((values) => e.target.checked ? [...values, unit.key] : values.filter((value) => value !== unit.key))} /></td><td>{unit.code}</td><td>{unit.name}</td><td>{unit.manager ? 'Phòng ban' : 'Tổng công ty/Công ty'}</td></tr>)}</tbody></table><div>Tổng số: {orgUnits.length} bản ghi</div></div>
      </Modal>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng quỹ lương thực lĩnh kỳ {selectedMonth}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalPayroll.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số nhân sự nhận lương</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {periodData.length} nhân viên
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tiến độ giải ngân lương</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {periodData.filter((d) => d.status === 'Đã chi trả').length}/{periodData.length} đã nhận lương
          </div>
        </div>
      </div>

      {/* VIEW: ATTENDANCE (Dữ liệu chấm công tính lương) */}
      {isAttendance && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Tổng Hợp Dữ Liệu Chấm Công &amp; Ngày Công Thực Tế ({selectedMonth})</h3>
            <Button icon={<DownloadOutlined />} onClick={() => exportPayrollReport('attendance', `tong_hop_ngay_cong_${selectedMonth.replace('/', '-')}.xlsx`, 'Đã tải bảng ngày công thực tế từ hồ sơ lương.')}>
              Xuất Bảng Công
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={periodData}
              columns={[
                { title: 'Mã NV', dataIndex: 'employeeCode', key: 'employeeCode', render: (c: string) => <strong>{c}</strong> },
                { title: 'Họ và tên', dataIndex: 'employeeName', key: 'employeeName', render: (n: string, r: any) => <div><strong>{n}</strong><div style={{ fontSize: 11.5, color: '#64748B' }}>{r.department}</div></div> },
                { title: 'Công làm thực tế', dataIndex: 'workDays', key: 'workDays', render: (d: number) => <Tag color="success">{d} ngày</Tag> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: INSURANCE (Khấu trừ BHXH, BHYT, BHTN) */}
      {isInsurance && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
            <label>Phương thức thanh toán<Select value={paymentMethod} onChange={setPaymentMethod} options={['Tiền mặt', 'Tiền gửi'].map((value) => ({ value, label: value }))} /></label>
            <label style={{ minWidth: 280 }}>Tài khoản chi<Select value={paymentAccountId || undefined} loading={loadingPaymentAccounts} onChange={setPaymentAccountId} options={availablePaymentAccounts.map((account) => ({ value: account.key, label: `${account.name} · Số dư ${account.balance.toLocaleString('vi-VN')} ₫` }))} placeholder="Chọn tài khoản chi" /></label>
            <label>Ngày nộp bảo hiểm<Input type="date" value={paymentDate} onChange={(e: any) => setPaymentDate(e.target.value)} /></label>
            <Button type="primary" onClick={loadInsuranceDue}>Lấy nghĩa vụ đã đối chiếu</Button>
          </div>
          <div style={{ color: '#64748B' }}>{accountingRegime === 'TT99' ? 'Nhập số liệu đã đối chiếu trong mục Hạch toán lương. Tỷ lệ và số phải nộp không được phần mềm tự ước tính.' : 'Thanh toán bảo hiểm hiện yêu cầu doanh nghiệp dùng danh mục tài khoản TT99 đã xác minh.'}</div>
          {insuranceLoaded && <div className="transparent-table-card"><KTable dataSource={insuranceDueRows.map((row) => ({ ...row, paid: insurancePaidAmount(row.code), remaining: Math.max(0, row.due - insurancePaidAmount(row.code)) }))}
            columns={[{ title: 'Khoản phải nộp', dataIndex: 'name', key: 'name' }, { title: 'Tài khoản', dataIndex: 'code', key: 'code' },
              { title: 'Nghĩa vụ đã đối chiếu', dataIndex: 'due', key: 'due', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
              { title: 'Đã nộp', dataIndex: 'paid', key: 'paid', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
              { title: 'Còn phải nộp', dataIndex: 'remaining', key: 'remaining', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
              { title: 'Nộp lần này', key: 'pay', render: (_: any, row: any) => <Input type="number" min={0} step={1} value={insuranceAllocations[row.code as keyof typeof insuranceAllocations]} onChange={(event: any) => setInsuranceAllocations((current) => ({ ...current, [row.code]: event.target.value }))} /> }]}
          /><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', padding: '10px 12px', gap: 12, flexWrap: 'wrap' }}>
            <label>Mã chứng từ hoặc mã giao dịch<Input value={insurancePaymentReference} onChange={(event: any) => setInsurancePaymentReference(event.target.value)} placeholder="Mã giao dịch đã thanh toán" /></label>
            <Button type="primary" disabled={!paymentAccountId} onClick={() => setInsuranceDialog(true)}>Lập phiếu chi bảo hiểm</Button>
          </div></div>}
          <Modal title="Xác nhận phiếu chi bảo hiểm" open={insuranceDialog} onCancel={() => setInsuranceDialog(false)} onOk={submitInsurancePayment} confirmLoading={submittingInsurance}
            okText="Ghi phiếu chi" cancelText="Hủy" width={460}>
            <div>Phương thức thanh toán: {paymentMethod}</div><div>Ngày nộp: {paymentDate}</div>
            <div>Số tiền: {insuranceDueRows.reduce((sum, row) => sum + (Number(insuranceAllocations[row.code as keyof typeof insuranceAllocations]) || 0), 0).toLocaleString('vi-VN')} ₫</div>
            <div>Mã chứng từ: {insurancePaymentReference || '—'}</div>
            <div style={{ marginTop: 10, color: '#64748B' }}>Hệ thống ghi nhận phiếu chi đã thanh toán và tạo bút toán Sổ Cái theo tài khoản nguồn đã chọn.</div>
          </Modal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12.5, color: '#1E40AF' }}>Doanh nghiệp đóng theo bảng kê đã đối chiếu</div>
              <div style={{ fontSize: 20, color: '#2563EB', marginTop: 4 }}>{(insuranceBreakdownValues.employerSocial + insuranceBreakdownValues.employerHealth + insuranceBreakdownValues.employerUnemployment).toLocaleString('vi-VN')} ₫</div>
              <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 4 }}>Số nhập tại mục Hạch toán lương</div>
            </div>
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12.5, color: '#92400E' }}>Người lao động bị khấu trừ</div>
              <div style={{ fontSize: 20, color: '#D97706', marginTop: 4 }}>{employeeInsurance.toLocaleString('vi-VN')} ₫</div>
              <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 4 }}>Theo dữ liệu bảng lương kỳ đã chọn</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Danh Sách Trích Nộp Bảo Hiểm Bắt Buộc Tháng {selectedMonth}</h3>
            <Button icon={<DownloadOutlined />} onClick={() => exportPayrollReport('insurance', `du_lieu_bao_hiem_${selectedMonth.replace('/', '-')}.xlsx`, 'Đã tải bảng dữ liệu bảo hiểm theo hồ sơ lương.')}>
              Xuất dữ liệu bảo hiểm
            </Button>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={periodData}
              columns={[
                { title: 'Mã NV & Họ tên', key: 'name', render: (_: any, r: PayrollRecord) => <div><strong>{r.employeeName}</strong><div style={{ fontSize: 11.5, color: '#64748B' }}>{r.employeeCode} - {r.department}</div></div> },
                { title: 'Lương đóng BH', dataIndex: 'baseSalary', key: 'baseSalary', render: (v: number) => `${v.toLocaleString('vi-VN')} ₫` },
                { title: 'Khấu trừ bảo hiểm theo bảng lương', dataIndex: 'insuranceDeduction', key: 'insuranceDeduction', render: (v: number) => `-${v.toLocaleString('vi-VN')} ₫` },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: DISBURSE (Lệnh chi trả lương & Chuyển khoản ngân hàng) */}
      {isDisburse && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
            <label>Phương thức thanh toán<Select value={paymentMethod} onChange={(value: 'Tiền mặt' | 'Tiền gửi') => {
              setPaymentMethod(value);
              const source = value === 'Tiền mặt' ? 'petty' : 'bank';
              setPaymentAccountId(paymentAccounts.find((account) => account.source === source && account.status === 'Đang hoạt động')?.key || '');
            }} options={['Tiền mặt', 'Tiền gửi'].map((value) => ({ value, label: value }))} /></label>
            <label style={{ minWidth: 280 }}>Tài khoản chi<Select value={paymentAccountId || undefined} loading={loadingPaymentAccounts} onChange={setPaymentAccountId}
              options={availablePaymentAccounts.map((account) => ({ value: account.key, label: `${account.name} · Số dư ${account.balance.toLocaleString('vi-VN')} ₫` }))}
              placeholder="Chọn tài khoản chi" /></label>
            <label>Ngày trả lương<Input type="date" value={paymentDate} onChange={(e: any) => setPaymentDate(e.target.value)} /></label>
            <Button type="primary" onClick={() => setPaymentRows(periodData.filter((row) => row.status === 'Chưa chi trả'))}>Lấy dữ liệu</Button>
          </div>
          <div>Thông tin trả lương</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Lập Lệnh Chi Trả Lương Tự Động Qua Ngân Hàng</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: 12.5, color: '#64748B' }}>
                Xuất danh sách lệnh chuyển khoản cho nhân viên có tài khoản nhận lương đã duyệt. Sau khi giao dịch hoàn tất, nhập mã giao dịch để ghi phiếu chi và Sổ Cái.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<DownloadOutlined />} onClick={exportBankPaymentFile}>
                Tải file lệnh chi
              </Button>
            </div>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={paymentRows}
              columns={[
                { title: 'Mã NV', dataIndex: 'employeeCode', key: 'employeeCode', render: (c: string) => <strong>{c}</strong> },
                { title: 'Tên nhân viên', dataIndex: 'employeeName', key: 'employeeName' },
                { title: 'Đơn vị', dataIndex: 'department', key: 'department' },
                { title: 'Số còn phải trả', dataIndex: 'netSalary', key: 'remaining', render: (v: number) => `${v.toLocaleString('vi-VN')} ₫` },
                { title: 'Số trả', dataIndex: 'netSalary', key: 'payAmount', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
                { title: 'Số tài khoản', key: 'account', render: (_: any, r: PayrollRecord) => getEmployeeBankAccount(r.employeeCode)?.accountNumber || '—' },
                { title: 'Tên ngân hàng', key: 'bank', render: (_: any, r: PayrollRecord) => getEmployeeBankAccount(r.employeeCode)?.bankName || '—' },
                { title: 'Mã giao dịch hoặc số chứng từ', key: 'reference', render: (_: any, r: PayrollRecord) => <Input value={paymentReferences[r.key] || ''} onChange={(event: any) => setPaymentReferences((references) => ({ ...references, [r.key]: event.target.value }))} placeholder="Nhập mã giao dịch hoặc số phiếu chi" /> },
                {
                  title: 'Thao tác',
                  key: 'act',
                  render: (_: any, r: PayrollRecord) => (
                    <Button type="primary" disabled={r.status !== 'Chưa chi trả' || !paymentAccountId || (paymentReferences[r.key] || '').trim().length < 3} onClick={() => handlePayOut(r)} style={r.status === 'Chưa chi trả' ? { backgroundColor: '#009688', borderColor: '#009688' } : {}}>
                      {r.status === 'Chưa chi trả' ? 'Ghi nhận chi' : 'Chờ duyệt'}
                    </Button>
                  ),
                },
              ]}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 28, padding: '10px 12px' }}><span>Tổng</span><span>Số còn phải trả: {paymentRows.reduce((sum, row) => sum + row.netSalary, 0).toLocaleString('vi-VN')} ₫</span><span>Số trả: {paymentRows.reduce((sum, row) => sum + row.netSalary, 0).toLocaleString('vi-VN')} ₫</span></div>
          </div>
        </div>
      )}

      {/* VIEW: ACCOUNTING (Hạch toán chi phí lương) */}
      {isAccounting && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 840 }}>
          <div style={{ display: 'flex', alignItems: 'end', gap: 8 }}><label style={{ flex: 1 }}>Chọn bảng lương<Select value={accountingSheetKey} onChange={setAccountingSheetKey} options={payrollSheets.map((sheet: any) => ({ value: sheet.key, label: sheet.name }))} placeholder="Bảng lương" /></label><Button onClick={() => { const sheet = payrollSheets.find((item: any) => item.key === accountingSheetKey); if (!sheet) { message.error('Chọn bảng lương trước.'); return; } setSelectedMonth(`${sheet.month}/${sheet.year}`); }}>Đồng ý</Button></div>
          <Card title={`Bút Toán Hạch Toán Kế Toán Lương Tháng ${selectedMonth}`} style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {payrollAccountingLines.filter((line) => line.amount > 0).map((bt, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                  <div>
                    <strong style={{ fontSize: 13, color: '#0F172A' }}>{bt.desc}</strong>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{bt.debit} ➔ {bt.credit}</div>
                  </div>
                  <strong style={{ color: '#009688', fontSize: 13.5 }}>{bt.amount.toLocaleString('vi-VN')} ₫</strong>
                </div>
              ))}
            </div>
            {accountingRegime === 'TT99' ? (
              <div style={{ marginBottom: 14 }}>
                <div style={{ marginBottom: 8, color: '#64748B' }}>Nhập số liệu đã đối chiếu với bảng lương và bảng kê bảo hiểm. Phần mềm không tự suy tính tỷ lệ đóng.</div>
                {payrollCostAccounts.length ? (
                  <label style={{ display: 'block', marginBottom: 10 }}>Tài khoản chi phí lương
                    <Select value={costAccount || undefined} onChange={setCostAccount} options={payrollCostAccounts.map((account) => ({ value: account.code, label: `${account.code} · ${account.name}` }))} placeholder="Chọn tài khoản chi tiết theo bộ phận" />
                  </label>
                ) : <div style={{ marginBottom: 10, color: '#B45309' }}>Chưa có tài khoản chi phí TT99. Hãy nạp mẫu tại Tổng hợp → Hệ thống tài khoản.</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                  {([
                    ['employerSocial', 'Doanh nghiệp đóng BHXH'], ['employerHealth', 'Doanh nghiệp đóng BHYT'], ['employerUnemployment', 'Doanh nghiệp đóng BHTN'],
                    ['employeeSocial', 'Người lao động đóng BHXH'], ['employeeHealth', 'Người lao động đóng BHYT'], ['employeeUnemployment', 'Người lao động đóng BHTN'],
                  ] as const).map(([field, label]) => (
                    <label key={field}>{label}
                      <Input type="number" min={0} step={1} value={insuranceBreakdown[field]} onChange={(event) => setInsuranceBreakdown((current) => ({ ...current, [field]: event.target.value }))} placeholder="Số tiền đã đối chiếu" />
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <label style={{ display: 'block', marginBottom: 14 }}>Bảo hiểm doanh nghiệp đã đối chiếu
                <Input type="number" min={0} value={employerCharge} onChange={(event) => setEmployerCharge(event.target.value)} placeholder="Nhập số tiền" />
              </label>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button icon={<AuditOutlined />} loading={postingLedger} disabled={!normalizePayrollMonth(selectedMonth)} onClick={adjustPayrollLedger}>Điều chỉnh bút toán</Button>
              <Button type="primary" icon={<AuditOutlined />} loading={postingLedger} disabled={periodData.length === 0 || !normalizePayrollMonth(selectedMonth)} onClick={postPayrollToLedger} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                Hạch toán ghi Sổ Cái
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* VIEW: DEFAULT (Bảng tính lương tháng) */}
      {!isAttendance && !isInsurance && !isDisburse && !isAccounting && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>Bảng lương kỳ {selectedMonth}</span>
            </div>
            <Button icon={<DownloadOutlined />} onClick={() => exportPayrollReport('payroll', `bang_luong_${selectedMonth.replace('/', '-')}.xlsx`, 'Đã tải bảng lương của kỳ đã chọn.')}>
              Xuất Bảng Lương
            </Button>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={periodData}
              columns={[
                {
                  title: 'Mã NV',
                  dataIndex: 'employeeCode',
                  key: 'employeeCode',
                  render: (code: string) => <strong style={{ color: '#009688' }}>{code}</strong>,
                },
                {
                  title: 'Họ và tên nhân viên',
                  dataIndex: 'employeeName',
                  key: 'employeeName',
                  render: (name: string, record: PayrollRecord) => (
                    <div>
                      <div style={{ fontWeight: 600, color: '#1E293B' }}>{name}</div>
                      <div style={{ fontSize: 11.5, color: '#64748B' }}>{record.department}</div>
                    </div>
                  ),
                },
                {
                  title: 'Lương cơ bản',
                  dataIndex: 'baseSalary',
                  key: 'baseSalary',
                  render: (val: number) => `${val.toLocaleString('vi-VN')} ₫`,
                },
                {
                  title: 'Ngày công',
                  dataIndex: 'workDays',
                  key: 'workDays',
                  render: (days: number) => <span>{days} công</span>,
                },
                {
                  title: 'Phụ cấp & Thưởng',
                  key: 'bonus',
                  render: (_: any, record: PayrollRecord) => (
                    <span style={{ color: '#16A34A', fontWeight: 600 }}>
                      +{(record.allowance + record.bonus).toLocaleString('vi-VN')} ₫
                    </span>
                  ),
                },
                {
                  title: 'Khấu trừ',
                  key: 'deductions',
                  render: (_: any, record: PayrollRecord) => (
                    <span style={{ color: '#DC2626' }}>
                      -{record.insuranceDeduction.toLocaleString('vi-VN')} ₫
                    </span>
                  ),
                },
                {
                  title: 'Thực lĩnh',
                  dataIndex: 'netSalary',
                  key: 'netSalary',
                  render: (val: number) => (
                    <strong style={{ fontSize: 13.5, color: '#0F172A' }}>
                      {val.toLocaleString('vi-VN')} ₫
                    </strong>
                  ),
                },
                {
                  title: 'Trạng thái',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status: string) => (
                    <Tag color={status === 'Đã chi trả' ? 'success' : 'warning'}>
                      {status}
                    </Tag>
                  ),
                },
                {
                  title: 'Thao tác',
                  key: 'action',
                  render: (_: any, record: PayrollRecord) => (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => {
                          setSelectedRecord(record);
                          setDrawerOpen(true);
                        }}
                      >
                        Phiếu
                      </Button>
                      <Button
                        size="small"
                        type="primary"
                        disabled={record.status === 'Đã chi trả'}
                        onClick={() => handlePayOut(record)}
                        style={record.status !== 'Đã chi trả' ? { backgroundColor: '#009688', borderColor: '#009688' } : {}}
                      >
                        Chi lương
                      </Button>
                    </div>
                  ),
                },
              ]}
              pagination={{ pageSize: 10 }}
            />
          </div>
        </div>
      )}

      {/* Drawer Payslip */}
      <Drawer
        title="Phiếu lương chi tiết cán bộ nhân viên"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={420}
      >
        {selectedRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{selectedRecord.employeeName}</div>
              <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>{selectedRecord.employeeCode} - {selectedRecord.department}</div>
              <Tag color="success" style={{ marginTop: 6 }}>Kỳ lương: {selectedMonth}</Tag>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Lương cơ bản hợp đồng:</span>
                <strong>{selectedRecord.baseSalary.toLocaleString('vi-VN')} ₫</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Ngày công làm việc:</span>
                <strong>{selectedRecord.workDays} / 22 ngày</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16A34A' }}>
                <span>Phụ cấp chức vụ &amp; ăn trưa:</span>
                <strong>+{selectedRecord.allowance.toLocaleString('vi-VN')} ₫</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16A34A' }}>
                <span>Thưởng hiệu suất KPI:</span>
                <strong>+{selectedRecord.bonus.toLocaleString('vi-VN')} ₫</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#DC2626' }}>
                <span>Khấu trừ BHXH (10.5%):</span>
                <strong>-{selectedRecord.insuranceDeduction.toLocaleString('vi-VN')} ₫</strong>
              </div>
              <div style={{ height: 1, background: '#E2E8F0', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: '#009688' }}>
                <span>LƯƠNG THỰC LĨNH:</span>
                <span>{selectedRecord.netSalary.toLocaleString('vi-VN')} ₫</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <Button style={{ width: '100%' }} icon={<DownloadOutlined />} onClick={() => downloadPayslip(selectedRecord)}>
                Tải phiếu lương PDF
              </Button>
              <Button
                type="primary"
                style={{ width: '100%', backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={async () => { await emailPayslip(selectedRecord); }}
              >
                Gửi thông tin lương qua Email
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
