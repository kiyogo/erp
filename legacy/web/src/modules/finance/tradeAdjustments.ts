import type { FinanceDocument } from '../../api/endpoints';

// Giữ khớp với ADJUSTMENT_SUBTYPES trong legacy/api/tradeRules.mjs (căn cứ pháp lý ghi ở đó); tests/trade-terms.test.mjs so khớp hai bản.
export const ADJUSTMENT_SUBTYPES: Record<string, 'sale' | 'purchase'> = {
  'Hàng bán bị trả lại': 'sale',
  'Giảm giá hàng bán': 'sale',
  'Hàng mua trả lại': 'purchase',
  'Giảm giá hàng mua': 'purchase',
};

export type AdjustmentSide = 'sale' | 'purchase';
export type AdjustmentKind = 'return' | 'discount';

export const adjustmentSubtype = (side: AdjustmentSide, kind: AdjustmentKind) =>
  side === 'sale' ? (kind === 'return' ? 'Hàng bán bị trả lại' : 'Giảm giá hàng bán') : (kind === 'return' ? 'Hàng mua trả lại' : 'Giảm giá hàng mua');

export const isAdjustment = (document: Pick<FinanceDocument, 'subtype' | 'adjustsDocumentId'>) => Boolean(document.adjustsDocumentId) || document.subtype in ADJUSTMENT_SUBTYPES;

/** Chứng từ gốc còn điều chỉnh được (cùng phía, còn hiệu lực, còn phần giá trị chưa trả lại hoặc giảm giá), kèm số tiền còn điều chỉnh được. */
export function adjustableOriginals(side: AdjustmentSide, documents: FinanceDocument[]) {
  return documents
    .filter((document) => !isAdjustment(document) && document.status !== 'Đã hủy' && document.status !== 'Hóa đơn nháp')
    .filter((document) => side === 'sale'
      ? (document.documentType === 'sale' && document.subtype !== 'Báo giá') || (document.documentType === 'invoice' && /đầu ra/i.test(document.subtype))
      : document.documentType === 'purchase' || (document.documentType === 'invoice' && /đầu vào/i.test(document.subtype)))
    .map((document) => ({ document, room: document.amount - (document.adjustedAmount || 0) }))
    .filter((item) => item.room > 0);
}

/** Hướng thanh toán và số còn thanh toán được của chứng từ: thu từ khách, trả nhà cung cấp, hoàn tiền khách hoặc nhà cung cấp hoàn. */
export function documentPaymentInfo(document: FinanceDocument): { type: 'Thu' | 'Chi'; title: string; remaining: number } | null {
  if (document.status === 'Đã hủy' || document.subtype === 'Báo giá') return null;
  const adjustmentSide = ADJUSTMENT_SUBTYPES[document.subtype];
  if (adjustmentSide) {
    return { type: adjustmentSide === 'sale' ? 'Chi' : 'Thu', title: adjustmentSide === 'sale' ? 'Hoàn tiền cho khách hàng' : 'Nhà cung cấp hoàn tiền', remaining: Math.max(0, document.amount - document.paidAmount) };
  }
  const isSale = document.documentType === 'sale' || (document.documentType === 'invoice' && /đầu ra/i.test(document.subtype));
  const isPurchase = document.documentType === 'purchase' || (document.documentType === 'invoice' && /đầu vào/i.test(document.subtype));
  if (!isSale && !isPurchase) return null;
  return { type: isSale ? 'Thu' : 'Chi', title: isSale ? 'Thu tiền khách hàng' : 'Trả tiền nhà cung cấp', remaining: document.remainingAmount };
}

/** Tổng giá trị đơn đã trừ hàng trả lại, giảm giá, và tổng công nợ còn lại; bỏ chứng từ điều chỉnh khỏi phép cộng. */
export function netTradeTotals(documents: FinanceDocument[]) {
  const originals = documents.filter((document) => !isAdjustment(document) && document.status !== 'Đã hủy');
  return {
    total: originals.reduce((sum, document) => sum + document.amount - (document.adjustedAmount || 0), 0),
    paid: originals.reduce((sum, document) => sum + document.paidAmount, 0),
    remaining: originals.reduce((sum, document) => sum + document.remainingAmount, 0),
  };
}
