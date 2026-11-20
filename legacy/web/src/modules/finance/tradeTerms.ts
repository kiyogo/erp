import type { FinanceDocumentTerms } from '../../api/endpoints';

// Giữ khớp với PAYMENT_METHODS trong legacy/api/tradeRules.mjs (căn cứ pháp lý ghi ở đó); tests/trade-terms.test.mjs so khớp hai bản.
export const PAYMENT_METHODS = ['Tiền mặt', 'Chuyển khoản', 'Tiền mặt hoặc chuyển khoản', 'Thẻ', 'Bù trừ công nợ', 'Khác'];
export const PAYMENT_METHOD_OPTIONS = PAYMENT_METHODS.map((value) => ({ value, label: value }));

export const vatOf = (net: number, rate: number) => Math.round((net * rate) / 100);

const TERM_NUMBER_FIELDS = ['paymentTermDays', 'penaltyRate', 'lateInterestRate', 'warrantyMonths'] as const;
const TERM_TEXT_FIELDS = ['reason', 'invoiceNo', 'invoiceSymbol', 'contractNo', 'signedDate', 'effectiveDate', 'expiryDate', 'deliveryDate', 'deliveryAddress', 'paymentMethod', 'note'] as const;

/** Đọc các ô `terms_*` của form thành đối tượng điều khoản, bỏ ô trống. */
export function termsFromValues(values: Record<string, unknown>): FinanceDocumentTerms {
  const terms: Record<string, unknown> = {};
  for (const field of TERM_TEXT_FIELDS) {
    const value = String(values[`terms_${field}`] ?? '').trim();
    if (value) terms[field] = value;
  }
  for (const field of TERM_NUMBER_FIELDS) {
    const raw = values[`terms_${field}`];
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') terms[field] = Number(raw);
  }
  return terms as FinanceDocumentTerms;
}
