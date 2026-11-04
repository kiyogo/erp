export interface TaxPaymentRecord {
  sourceModule?: string;
  sourceReference?: string;
  status: string;
}

export interface TaxFilingInput {
  code: string;
  taxType: string;
  period: string;
  deadline: string;
  amountPayable: number;
  filingMethod?: string;
  taxYear?: number;
  periodStart?: string;
  periodEnd?: string;
  filingDeadline?: string;
}

const isIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export const hasOpenTaxPayment = (payments: TaxPaymentRecord[], taxKey: string): boolean =>
  payments.some(payment =>
    payment.sourceModule === 'finance_tax' &&
    payment.sourceReference === taxKey &&
    !['Đã thanh toán', 'Từ chối', 'Đã hủy'].includes(payment.status)
  );

export const isValidTaxPaymentAmount = (amount: number, outstanding: number): boolean =>
  Number.isSafeInteger(amount) && amount > 0 &&
  Number.isSafeInteger(outstanding) && outstanding > 0 && amount <= outstanding;

export const validateTaxFiling = (filing: TaxFilingInput, existingCodes: string[]): string | null => {
  if (!filing.code.trim()) return 'Nhập mã hồ sơ thuế.';
  if (existingCodes.some(code => code.trim().toLocaleLowerCase('vi-VN') === filing.code.trim().toLocaleLowerCase('vi-VN'))) {
    return 'Mã hồ sơ thuế đã tồn tại.';
  }
  if (!filing.taxType.trim()) return 'Chọn loại thuế.';
  if (!filing.period.trim()) return 'Nhập kỳ kê khai.';
  if (!isIsoDate(filing.deadline)) return 'Hạn nộp không phải ngày hợp lệ.';
  if (filing.filingMethod && !['Tháng', 'Quý', 'Năm', 'Khác'].includes(filing.filingMethod)) return 'Chọn phương pháp kê khai hợp lệ.';
  if (filing.taxYear !== undefined && (!Number.isInteger(filing.taxYear) || filing.taxYear < 1900 || filing.taxYear > 2200)) return 'Năm tính thuế không hợp lệ.';
  if (Boolean(filing.periodStart) !== Boolean(filing.periodEnd)) return 'Cần chọn đầy đủ ngày bắt đầu và ngày kết thúc kỳ.';
  if (filing.periodStart && filing.periodEnd) {
    if (!isIsoDate(filing.periodStart) || !isIsoDate(filing.periodEnd)) return 'Khoảng ngày của kỳ kê khai không hợp lệ.';
    if (filing.periodStart > filing.periodEnd) return 'Ngày bắt đầu kỳ không được sau ngày kết thúc kỳ.';
  }
  if (filing.filingDeadline && !isIsoDate(filing.filingDeadline)) return 'Hạn nộp hồ sơ không phải ngày hợp lệ.';
  if (!Number.isSafeInteger(filing.amountPayable) || filing.amountPayable < 0) return 'Số tiền phải nộp phải là số nguyên không âm.';
  return null;
};
