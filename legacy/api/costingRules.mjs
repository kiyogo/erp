// Tính giá thành sản phẩm theo kỳ: giản đơn và hệ số, đánh giá sản phẩm dở dang theo sản lượng hoàn thành tương đương,
// chi phí sản xuất chung cố định phân bổ theo công suất bình thường, hao hụt nguyên vật liệu vượt mức tính vào giá vốn.
// Căn cứ: Chuẩn mực kế toán VAS 02 (chi phí sản xuất chung cố định không phân bổ do sản lượng thấp hơn công suất bình thường và
// hao hụt vượt mức bình thường ghi vào giá vốn hàng bán trong kỳ), Thông tư 99/2025/TT-BTC (TK 621, 622, 627, 154, 155, 632).
// Xác minh qua bài tổng hợp (amis.misa.vn, ketoanleanh.edu.vn), chưa đối chiếu văn bản gốc. Bút toán chỉ là gợi ý, hệ thống không ghi sổ cái.
// Nguyên vật liệu chính giả định bỏ ngay từ đầu quy trình; chi phí chế biến (nhân công, sản xuất chung) theo mức độ hoàn thành.

export const COSTING_METHODS = ['simple', 'coefficient'];

const amount = (value, label) => {
  if (value === undefined || value === null || String(value).trim() === '') throw new Error(`Nhập ${label}; nhập 0 nếu không phát sinh.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} phải là số nguyên không âm.`);
  return number;
};
const quantity = (value, label, { allowZero = false } = {}) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < (allowZero ? 0 : 0.001) || number > 1e12 || Math.round(number * 1000) !== number * 1000) {
    throw new Error(`${label} phải ${allowZero ? 'không âm' : 'lớn hơn 0'} và có tối đa 3 chữ số thập phân.`);
  }
  return number;
};
const isoDate = (value, label) => {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text) throw new Error(`${label} không hợp lệ.`);
  return text;
};
const text = (value, label, max) => {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`${label} là thông tin bắt buộc.`);
  if (result.length > max) throw new Error(`${label} dài tối đa ${max} ký tự.`);
  return result;
};

export function normalizeCostingInput(input) {
  const method = COSTING_METHODS.includes(input.method) ? input.method : (() => { throw new Error('Phương pháp tính giá thành không hợp lệ.'); })();
  const periodStart = isoDate(input.periodStart, 'Ngày bắt đầu kỳ');
  const periodEnd = isoDate(input.periodEnd, 'Ngày kết thúc kỳ');
  if (periodStart > periodEnd) throw new Error('Ngày bắt đầu kỳ không được sau ngày kết thúc kỳ.');
  const normalized = {
    method, periodStart, periodEnd,
    productName: text(input.productName, 'Tên sản phẩm hoặc nhóm sản phẩm', 200),
    unit: text(input.unit || 'cái', 'Đơn vị tính', 30),
    openingWipMaterial: amount(input.openingWipMaterial, 'giá trị nguyên vật liệu dở dang đầu kỳ'),
    openingWipConversion: amount(input.openingWipConversion, 'giá trị chi phí chế biến dở dang đầu kỳ'),
    materialCost: amount(input.materialCost, 'chi phí nguyên vật liệu trực tiếp (TK 621)'),
    laborCost: amount(input.laborCost, 'chi phí nhân công trực tiếp (TK 622)'),
    variableOverhead: amount(input.variableOverhead, 'chi phí sản xuất chung biến đổi (TK 627)'),
    fixedOverhead: amount(input.fixedOverhead, 'chi phí sản xuất chung cố định (TK 627)'),
    abnormalMaterialLoss: amount(input.abnormalMaterialLoss ?? 0, 'giá trị nguyên vật liệu hao hụt vượt mức'),
    normalCapacity: input.normalCapacity === undefined || input.normalCapacity === '' || input.normalCapacity === null ? 0 : quantity(input.normalCapacity, 'Công suất bình thường'),
    wipQuantity: input.wipQuantity === undefined || input.wipQuantity === '' || input.wipQuantity === null ? 0 : quantity(input.wipQuantity, 'Số lượng sản phẩm dở dang cuối kỳ', { allowZero: true }),
    wipCompletionRate: input.wipCompletionRate === undefined || input.wipCompletionRate === '' || input.wipCompletionRate === null ? 0 : Number(input.wipCompletionRate),
  };
  if (!Number.isFinite(normalized.wipCompletionRate) || normalized.wipCompletionRate < 0 || normalized.wipCompletionRate > 100) throw new Error('Mức độ hoàn thành của sản phẩm dở dang phải từ 0 đến 100%.');
  if (normalized.abnormalMaterialLoss > normalized.materialCost) throw new Error('Hao hụt nguyên vật liệu vượt mức không được lớn hơn chi phí nguyên vật liệu phát sinh trong kỳ.');
  if (method === 'simple') {
    normalized.completedQuantity = quantity(input.completedQuantity, 'Sản lượng hoàn thành trong kỳ');
  } else {
    const products = Array.isArray(input.products) ? input.products : [];
    if (products.length < 2 || products.length > 50) throw new Error('Phương pháp hệ số cần từ 2 đến 50 loại sản phẩm.');
    const names = new Set();
    normalized.products = products.map((product, index) => {
      const name = text(product?.name, `Tên sản phẩm dòng ${index + 1}`, 200);
      if (names.has(name.toLocaleLowerCase('vi-VN'))) throw new Error('Không nhập trùng tên sản phẩm.');
      names.add(name.toLocaleLowerCase('vi-VN'));
      const coefficient = Number(product?.coefficient);
      if (!Number.isFinite(coefficient) || coefficient <= 0 || coefficient > 1e6 || Math.round(coefficient * 10000) !== coefficient * 10000) throw new Error(`Hệ số của ${name} phải lớn hơn 0 và có tối đa 4 chữ số thập phân.`);
      return { name, quantity: quantity(product?.quantity, `Sản lượng của ${name}`), coefficient };
    });
    normalized.completedQuantity = normalized.products.reduce((sum, product) => sum + product.quantity, 0);
  }
  return normalized;
}

export function calculateCosting(input) {
  const n = normalizeCostingInput(input);
  const completedUnits = n.method === 'simple' ? n.completedQuantity : n.products.reduce((sum, product) => sum + product.quantity * product.coefficient, 0);
  const wipEquivalent = n.wipQuantity * (n.wipCompletionRate / 100);
  // Chi phí sản xuất chung cố định: sản lượng thực tế thấp hơn công suất bình thường thì chỉ phân bổ theo tỷ lệ, phần còn lại vào giá vốn.
  const output = n.method === 'simple' ? n.completedQuantity : completedUnits;
  const fixedAllocated = n.normalCapacity > 0 && output < n.normalCapacity ? Math.round(n.fixedOverhead * (output / n.normalCapacity)) : n.fixedOverhead;
  const fixedUnallocated = n.fixedOverhead - fixedAllocated;
  const materialsPool = n.openingWipMaterial + n.materialCost - n.abnormalMaterialLoss;
  const conversionPool = n.openingWipConversion + n.laborCost + n.variableOverhead + fixedAllocated;
  const materialUnits = completedUnits + n.wipQuantity;
  const conversionUnits = completedUnits + wipEquivalent;
  const closingWipMaterial = n.wipQuantity > 0 ? Math.round((materialsPool / materialUnits) * n.wipQuantity) : 0;
  const closingWipConversion = wipEquivalent > 0 ? Math.round((conversionPool / conversionUnits) * wipEquivalent) : 0;
  const closingWip = closingWipMaterial + closingWipConversion;
  const totalCost = materialsPool + conversionPool - closingWip;
  if (totalCost < 0) throw new Error('Tổng giá thành âm; kiểm tra lại giá trị dở dang và chi phí phát sinh.');
  const result = {
    ...n, fixedAllocated, fixedUnallocated, materialsPool, conversionPool, closingWipMaterial, closingWipConversion, closingWip, totalCost,
    completedUnits, unitCost: Math.round(totalCost / completedUnits),
  };
  if (n.method === 'coefficient') {
    const perCoefficient = totalCost / completedUnits;
    let assigned = 0;
    result.coefficientUnitCost = Math.round(perCoefficient);
    result.productResults = n.products.map((product, index) => {
      const last = index === n.products.length - 1;
      const cost = last ? totalCost - assigned : Math.round(product.quantity * product.coefficient * perCoefficient);
      assigned += cost;
      return { ...product, totalCost: cost, unitCost: Math.round(cost / product.quantity) };
    });
  }
  result.journal = costingJournal(result);
  return result;
}

// Bút toán kết chuyển gợi ý của kỳ: chi phí phát sinh vào 154, phần không tính giá thành vào 632, thành phẩm nhập kho từ 154 sang 155.
function costingJournal(r) {
  const lines = [];
  const add = (account, debit, credit, note) => { if (debit > 0 || credit > 0) lines.push({ account, debit, credit, note }); };
  const toWip = r.materialCost - r.abnormalMaterialLoss + r.laborCost + r.variableOverhead + r.fixedAllocated;
  add('154', toWip, 0, 'Kết chuyển chi phí sản xuất phát sinh trong kỳ vào chi phí dở dang');
  add('632', r.abnormalMaterialLoss, 0, 'Nguyên vật liệu hao hụt vượt mức tính vào giá vốn');
  add('632', r.fixedUnallocated, 0, 'Chi phí sản xuất chung cố định không phân bổ (sản lượng thấp hơn công suất bình thường)');
  add('621', 0, r.materialCost, 'Kết chuyển chi phí nguyên vật liệu trực tiếp');
  add('622', 0, r.laborCost, 'Kết chuyển chi phí nhân công trực tiếp');
  add('627', 0, r.variableOverhead + r.fixedOverhead, 'Kết chuyển chi phí sản xuất chung');
  add('155', r.totalCost, 0, 'Nhập kho thành phẩm hoàn thành trong kỳ');
  add('154', 0, r.totalCost, 'Giá thành thành phẩm hoàn thành');
  return lines;
}
