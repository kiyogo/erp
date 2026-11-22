// Dòng hàng của chứng từ mua, bán, hóa đơn: tên hàng hóa, dịch vụ, đơn vị tính, số lượng, đơn giá, chiết khấu của dòng và thành tiền
// (nội dung hóa đơn theo Nghị định 123/2020 Điều 10 khoản 6 và văn bản thay thế từ 01/07/2026, Nghị định 254/2026; xác minh qua bài tổng
// hợp, chưa đối chiếu bản gốc). Thành tiền dòng = làm tròn(số lượng × đơn giá) − chiết khấu; tổng thành tiền các dòng phải bằng tiền hàng
// chưa thuế GTGT của chứng từ (tổng tiền trừ tiền thuế). Chứng từ dùng một thuế suất chung nên dòng không có thuế suất riêng.

export const MAX_DOCUMENT_LINES = 200;

const text = (value, label, max, required = false) => {
  const result = String(value ?? '').trim();
  if (required && !result) throw new Error(`${label} không được để trống.`);
  if (result.length > max) throw new Error(`${label} dài tối đa ${max} ký tự.`);
  return result;
};

const decimal = (value, label, places, { min, max }) => {
  const result = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  const factor = 10 ** places;
  if (value === '' || value === null || value === undefined || !Number.isFinite(result) || result < min || result > max || Math.abs(Math.round(result * factor) - result * factor) > 1e-6) {
    throw new Error(`${label} phải là số từ ${min.toLocaleString('vi-VN')} đến ${max.toLocaleString('vi-VN')}, tối đa ${places} chữ số thập phân.`);
  }
  return result;
};

export const lineAmount = (line) => Math.round(Number(line.quantity) * Number(line.unitPrice)) - (Number(line.discount) || 0);

/** Chuẩn hóa dòng hàng; `items` là Map khóa mặt hàng kho -> mặt hàng (lấy mã SKU, tên, đơn vị tính khi chọn từ danh mục). Ném Error tiếng Việt khi sai. */
export function normalizeDocumentLines(input, items = new Map()) {
  if (input === undefined || input === null) return { lines: [], net: 0 };
  if (!Array.isArray(input)) throw new Error('Dòng hàng phải là danh sách.');
  if (input.length > MAX_DOCUMENT_LINES) throw new Error(`Chứng từ có tối đa ${MAX_DOCUMENT_LINES} dòng hàng.`);
  const lines = input.map((source, index) => {
    const label = `Dòng ${index + 1}`;
    if (!source || typeof source !== 'object') throw new Error(`${label}: dữ liệu không hợp lệ.`);
    const itemKey = text(source.itemKey, `${label}: mặt hàng`, 160);
    const item = itemKey ? items.get(itemKey) : null;
    if (itemKey && !item) throw new Error(`${label}: mặt hàng không còn trong danh mục kho.`);
    const quantity = decimal(source.quantity, `${label}: số lượng`, 3, { min: 0.001, max: 1_000_000_000 });
    const unitPrice = decimal(source.unitPrice, `${label}: đơn giá`, 2, { min: 0, max: 1_000_000_000_000 });
    const gross = Math.round(quantity * unitPrice);
    const discount = source.discount === undefined || source.discount === null || source.discount === '' ? 0 : decimal(source.discount, `${label}: chiết khấu`, 0, { min: 0, max: 1_000_000_000_000 });
    if (discount > gross) throw new Error(`${label}: chiết khấu không được lớn hơn số lượng nhân đơn giá.`);
    const line = {
      ...(item ? { itemKey, sku: item.sku || '' } : {}),
      name: text(String(source.name ?? '').trim() || item?.name, `${label}: tên hàng hóa, dịch vụ`, 300, true),
      unit: text(item?.unit || source.unit, `${label}: đơn vị tính`, 30),
      quantity,
      unitPrice,
      ...(discount ? { discount } : {}),
    };
    return { ...line, amount: gross - discount };
  });
  return { lines, net: lines.reduce((sum, line) => sum + line.amount, 0) };
}

/** Tổng thành tiền các dòng phải bằng tiền hàng chưa thuế của chứng từ. */
export function documentLinesProblem(net, document) {
  const expected = document.amount - document.vatAmount;
  if (net !== expected) return `Tổng thành tiền các dòng hàng ${net.toLocaleString('vi-VN')} đồng phải bằng tiền hàng chưa thuế ${expected.toLocaleString('vi-VN')} đồng của chứng từ.`;
  return '';
}
