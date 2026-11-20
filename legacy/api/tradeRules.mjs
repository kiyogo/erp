// Quy tắc chứng từ mua hàng, bán hàng: thuế GTGT khớp tiền hàng, điều khoản hợp đồng thương mại, hình thức thanh toán.
// Căn cứ: Luật Thương mại 36/2005/QH11 (Điều 301 phạt vi phạm tối đa 8% giá trị phần nghĩa vụ bị vi phạm,
// Điều 306 lãi chậm thanh toán), Bộ luật Dân sự 91/2015/QH13 (Điều 357 lãi chậm trả, Điều 468 trần lãi suất 20%/năm),
// Luật Thuế GTGT 48/2024/QH15 Điều 14 và Nghị định 181/2025/NĐ-CP Điều 26 (thanh toán không dùng tiền mặt từ 5 triệu đồng).
// Xác minh qua bài tổng hợp (lsvn.vn, tapchitoaan.vn, luatvietnam.vn, misa.vn), chưa đối chiếu văn bản gốc.
// Các nguồn không thống nhất về việc trần phạt 8% có áp dụng khi hai bên thỏa thuận cao hơn hay không (tòa án thường
// áp dụng 8%); hệ thống chặn trên 8%. Trần lãi 20%/năm chỉ cảnh báo vì Điều 306 Luật Thương mại cho phép thỏa thuận.

import { vatNonCashThreshold } from './taxRules.mjs';

export const PAYMENT_METHODS = ['Tiền mặt', 'Chuyển khoản', 'Tiền mặt hoặc chuyển khoản', 'Thẻ', 'Bù trừ công nợ', 'Khác'];
// Hình thức có chứng từ thanh toán không dùng tiền mặt (chuyển khoản, thẻ ngân hàng, bù trừ công nợ qua ngân hàng).
const NON_CASH_METHODS = new Set(['Chuyển khoản', 'Thẻ', 'Bù trừ công nợ']);
export const isNonCashPayment = (method) => NON_CASH_METHODS.has(method);

export const MAX_PENALTY_RATE = 8;
export const LATE_INTEREST_WARNING_RATE = 20;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (value, label, max) => {
  const result = String(value ?? '').trim();
  if (result.length > max) throw new Error(`${label} dài tối đa ${max} ký tự.`);
  return result;
};
const isoDate = (value, label) => {
  const result = String(value ?? '').trim();
  if (!result) return '';
  if (!ISO_DATE.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`)) || new Date(`${result}T00:00:00Z`).toISOString().slice(0, 10) !== result) {
    throw new Error(`${label} không hợp lệ.`);
  }
  return result;
};
const number = (value, label, { min, max, integer = false }) => {
  if (value === undefined || value === null || value === '') return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isInteger(result))) {
    throw new Error(`${label} phải ${integer ? 'là số nguyên ' : 'là số '}từ ${min} đến ${max}.`);
  }
  return integer ? result : Math.round(result * 100) / 100;
};

// Thuế GTGT phải khớp tiền hàng: tiền hàng chưa thuế là tổng trừ tiền thuế; sai lệch tối đa 1 đồng do làm tròn.
export function vatConsistencyProblem({ amount, vatRate, vatAmount }) {
  if (vatRate === 0) return vatAmount === 0 ? '' : 'Thuế suất 0% thì tiền thuế GTGT phải bằng 0.';
  const net = amount - vatAmount;
  const expected = Math.round((net * vatRate) / 100);
  if (net <= 0 || Math.abs(vatAmount - expected) > 1) {
    return `Tiền thuế GTGT ${vatAmount.toLocaleString('vi-VN')} đồng không khớp thuế suất ${vatRate}% trên tiền hàng chưa thuế ${Math.max(net, 0).toLocaleString('vi-VN')} đồng (đúng là ${expected.toLocaleString('vi-VN')} đồng).`;
  }
  return '';
}

// Mã số thuế của đối tác trên chứng từ: mã số thuế đúng số kiểm tra, hoặc số định danh 12 số của cá nhân.
export function partnerTaxCodeProblem(code, isValidTaxCode) {
  const value = String(code || '').trim();
  if (!value || isValidTaxCode(value) || /^\d{12}$/.test(value)) return '';
  return 'Mã số thuế đối tác không hợp lệ (10 số, hoặc 13 số dạng 0123456789-001, đúng số kiểm tra; cá nhân dùng số định danh 12 số).';
}

// Điều khoản thương mại của đơn, hợp đồng. Ném Error tiếng Việt khi sai; mọi trường đều tùy chọn.
export function normalizeTradeTerms(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const terms = {
    invoiceNo: text(source.invoiceNo, 'Số hóa đơn', 30),
    invoiceSymbol: text(source.invoiceSymbol, 'Ký hiệu hóa đơn', 30),
    contractNo: text(source.contractNo, 'Số hợp đồng', 80),
    signedDate: isoDate(source.signedDate, 'Ngày ký'),
    effectiveDate: isoDate(source.effectiveDate, 'Ngày hiệu lực'),
    expiryDate: isoDate(source.expiryDate, 'Ngày hết hạn'),
    deliveryDate: isoDate(source.deliveryDate, 'Ngày giao hàng'),
    deliveryAddress: text(source.deliveryAddress, 'Địa điểm giao hàng', 300),
    paymentMethod: text(source.paymentMethod, 'Hình thức thanh toán', 40),
    paymentTermDays: number(source.paymentTermDays, 'Thời hạn thanh toán (ngày)', { min: 0, max: 720, integer: true }),
    penaltyRate: number(source.penaltyRate, 'Mức phạt vi phạm (%)', { min: 0, max: MAX_PENALTY_RATE }),
    lateInterestRate: number(source.lateInterestRate, 'Lãi chậm thanh toán (%/năm)', { min: 0, max: 100 }),
    warrantyMonths: number(source.warrantyMonths, 'Thời gian bảo hành (tháng)', { min: 0, max: 600, integer: true }),
    note: text(source.note, 'Ghi chú điều khoản', 1000),
  };
  if (terms.paymentMethod && !PAYMENT_METHODS.includes(terms.paymentMethod)) throw new Error('Hình thức thanh toán không hợp lệ.');
  if (terms.effectiveDate && terms.signedDate && terms.effectiveDate < terms.signedDate) throw new Error('Ngày hiệu lực không được trước ngày ký.');
  if (terms.expiryDate && terms.expiryDate < (terms.effectiveDate || terms.signedDate || '0000-01-01')) throw new Error('Ngày hết hạn không được trước ngày hiệu lực hoặc ngày ký.');
  if (terms.deliveryDate && terms.signedDate && terms.deliveryDate < terms.signedDate) throw new Error('Ngày giao hàng không được trước ngày ký.');
  const clean = Object.fromEntries(Object.entries(terms).filter(([, value]) => value !== '' && value !== null));
  return clean;
}

// Cảnh báo không chặn lưu. document: chứng từ đã kiểm tra; terms: điều khoản đã chuẩn hóa.
export function tradeWarnings(document, terms = {}) {
  const warnings = [];
  const isContract = /^Hợp đồng/.test(document.subtype);
  if (isContract && !terms.contractNo) warnings.push('Hợp đồng chưa ghi số hợp đồng.');
  if (isContract && !terms.signedDate) warnings.push('Hợp đồng chưa ghi ngày ký.');
  if (terms.lateInterestRate > LATE_INTEREST_WARNING_RATE) {
    warnings.push(`Lãi chậm thanh toán ${terms.lateInterestRate}%/năm cao hơn trần 20%/năm của Bộ luật Dân sự 2015 (Điều 357, 468); tòa án có thể chỉ chấp nhận tới mức trần.`);
  }
  if ((document.documentType === 'purchase' || /Đầu vào/.test(document.subtype)) && document.vatAmount > 0 && document.amount >= vatNonCashThreshold(document.documentDate)) {
    if (terms.paymentMethod === 'Tiền mặt') {
      warnings.push('Hóa đơn từ ngưỡng thanh toán không dùng tiền mặt mà trả bằng tiền mặt thì thuế GTGT đầu vào không được khấu trừ.');
    } else if (!isNonCashPayment(terms.paymentMethod)) {
      warnings.push('Hóa đơn từ ngưỡng thanh toán không dùng tiền mặt: cần chọn hình thức thanh toán không dùng tiền mặt và giữ chứng từ để được khấu trừ thuế GTGT đầu vào.');
    }
  }
  return warnings;
}
