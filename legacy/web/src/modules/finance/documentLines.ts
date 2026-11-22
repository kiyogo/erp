// Dòng hàng của chứng từ mua, bán, hóa đơn: bản sao cách tính của legacy/api/documentLineRules.mjs (test web/tests/document-lines.test.mjs so khớp).
export type DocumentLineDraft = { id: string; itemKey?: string; name: string; unit: string; quantity: string; unitPrice: string; discount: string };
export type { FinanceDocumentLine as DocumentLine } from '../../api/endpoints';

const num = (value: unknown) => Number(String(value ?? '').trim()) || 0;

export const lineAmount = (line: { quantity: unknown; unitPrice: unknown; discount?: unknown }) => Math.round(num(line.quantity) * num(line.unitPrice)) - num(line.discount);

export const linesNet = (lines: DocumentLineDraft[]) => lines.reduce((sum, line) => sum + lineAmount(line), 0);

export const emptyLine = (): DocumentLineDraft => ({ id: crypto.randomUUID(), name: '', unit: '', quantity: '1', unitPrice: '', discount: '' });

/** Dữ liệu gửi máy chủ; máy chủ kiểm tra lại từng dòng và tổng. */
export const linesPayload = (lines: DocumentLineDraft[]) => lines.map((line) => ({
  ...(line.itemKey ? { itemKey: line.itemKey } : {}),
  name: line.name.trim(),
  unit: line.unit.trim(),
  quantity: num(line.quantity),
  unitPrice: num(line.unitPrice),
  ...(num(line.discount) ? { discount: num(line.discount) } : {}),
}));

/** Lỗi nhập ở trình duyệt, trước khi gửi (trả về chuỗi rỗng khi hợp lệ). */
export function linesDraftProblem(lines: DocumentLineDraft[]) {
  for (const [index, line] of lines.entries()) {
    const label = `Dòng ${index + 1}`;
    if (!line.name.trim()) return `${label}: nhập tên hàng hóa, dịch vụ.`;
    if (num(line.quantity) <= 0) return `${label}: số lượng phải lớn hơn 0.`;
    if (num(line.unitPrice) < 0 || String(line.unitPrice).trim() === '') return `${label}: nhập đơn giá.`;
    if (lineAmount(line) < 0) return `${label}: chiết khấu không được lớn hơn số lượng nhân đơn giá.`;
  }
  return '';
}
