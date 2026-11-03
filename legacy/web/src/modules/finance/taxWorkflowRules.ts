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
}

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(filing.deadline)) return 'Chọn hạn nộp hợp lệ.';
  const [year, month, day] = filing.deadline.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return 'Hạn nộp không phải ngày hợp lệ.';
  }
  if (!Number.isSafeInteger(filing.amountPayable) || filing.amountPayable < 0) return 'Số tiền phải nộp phải là số nguyên không âm.';
  return null;
};
