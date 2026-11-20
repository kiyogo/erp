// Bản quyền phần mềm: chứng từ mua (hóa đơn, hợp đồng, nhà cung cấp, thuế GTGT) và cách hạch toán.
// Căn cứ: Thông tư 45/2013/TT-BTC (phần mềm đủ điều kiện và từ 30 triệu đồng là tài sản cố định vô hình; khung khấu hao 2 đến 20 năm),
// Thông tư 99/2025/TT-BTC (TK 213 tài sản cố định vô hình, TK 242 chi phí trả trước), Luật Thuế GTGT 48/2024/QH15 Điều 14 (hóa đơn,
// thanh toán không dùng tiền mặt từ 5 triệu đồng). Xác minh qua bài tổng hợp, chưa đối chiếu văn bản gốc. Nhà cung cấp nước ngoài còn chịu
// thuế nhà thầu nước ngoài (Thông tư 103/2014/TT-BTC); hệ thống chỉ cảnh báo, chưa tính thuế nhà thầu.

import { TSCD_MIN_COST } from './assetRules.mjs';
import { isValidTaxCode } from './invoiceRules.mjs';
import { vatNonCashThreshold } from './taxRules.mjs';
import { PAYMENT_METHODS, partnerTaxCodeProblem } from './tradeRules.mjs';
import { vatRateProblem } from './vatRules.mjs';

const text = (value, label, max) => {
  const result = String(value ?? '').trim();
  if (result.length > max) throw new Error(`${label} dài tối đa ${max} ký tự.`);
  return result;
};
const isoDate = (value, label) => {
  const result = String(value ?? '').trim();
  if (!result) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || new Date(`${result}T00:00:00Z`).toISOString().slice(0, 10) !== result) throw new Error(`${label} không hợp lệ.`);
  return result;
};

// Số tháng của thời hạn bản quyền, tính cả ngày hết hạn, làm tròn tới tháng gần nhất và tối thiểu 1 tháng.
export function licenseTermMonths(purchaseDate, expireDate) {
  const days = (Date.parse(`${expireDate}T00:00:00Z`) - Date.parse(`${purchaseDate}T00:00:00Z`)) / 86_400_000 + 1;
  return Math.max(1, Math.round(days / 30.4375));
}

export function licenseAccounting({ licenseType, billingCycle, purchaseCost, purchaseDate, expireDate }) {
  if (!(purchaseCost > 0)) return { treatment: 'none', note: 'Chưa có giá mua nên chưa xác định cách hạch toán.', amortizationMonths: 0, monthlyAmortization: 0 };
  const perpetual = licenseType === 'Vĩnh viễn' || billingCycle === 'Vĩnh viễn';
  if (perpetual && purchaseCost >= TSCD_MIN_COST) {
    return { treatment: 'intangible_asset', note: 'Bản quyền vĩnh viễn từ 30 triệu đồng: ghi nhận tài sản cố định vô hình (TK 213), khấu hao 2 đến 20 năm; thêm vào Tài sản, Danh mục với phân loại Tài sản cố định vô hình.', amortizationMonths: 0, monthlyAmortization: 0 };
  }
  if (perpetual) {
    return { treatment: 'prepaid', note: 'Bản quyền vĩnh viễn dưới 30 triệu đồng: ghi chi phí một lần hoặc chi phí trả trước (TK 242) phân bổ dần tối đa 36 tháng theo chính sách kế toán.', amortizationMonths: 36, monthlyAmortization: Math.round(purchaseCost / 36) };
  }
  if (billingCycle === 'Hàng tháng') {
    return { treatment: 'monthly_expense', note: 'Thuê bao trả hàng tháng: ghi vào chi phí (TK 642 hoặc chi phí sản xuất) của từng tháng.', amortizationMonths: 1, monthlyAmortization: purchaseCost };
  }
  const months = licenseTermMonths(purchaseDate, expireDate);
  return { treatment: 'prepaid', note: `Thuê bao trả trước: ghi chi phí trả trước (TK 242) và phân bổ đều ${months} tháng của thời hạn bản quyền.`, amortizationMonths: months, monthlyAmortization: Math.round(purchaseCost / months) };
}

// Chuẩn hóa chứng từ mua của bản quyền. context: { purchaseDate, expireDate, licenseType, billingCycle, today }. Ném Error tiếng Việt khi sai.
export function normalizeLicenseLegal(input, context) {
  const origin = input.vendorOrigin === 'foreign' ? 'foreign' : 'domestic';
  const vendorTaxCode = origin === 'domestic' ? text(input.vendorTaxCode, 'Mã số thuế nhà cung cấp', 32) : '';
  const taxProblem = partnerTaxCodeProblem(vendorTaxCode, isValidTaxCode);
  if (taxProblem) throw new Error(taxProblem);
  const invoiceDate = isoDate(input.invoiceDate, 'Ngày hóa đơn');
  if (invoiceDate && invoiceDate > context.today) throw new Error('Ngày hóa đơn không được ở tương lai.');
  const purchaseCost = input.purchaseCost === undefined || input.purchaseCost === '' || input.purchaseCost === null ? 0 : Number(input.purchaseCost);
  if (!Number.isSafeInteger(purchaseCost) || purchaseCost < 0) throw new Error('Giá mua phải là số nguyên không âm (chưa gồm thuế GTGT).');
  const paymentMethod = text(input.paymentMethod, 'Hình thức thanh toán', 40);
  if (paymentMethod && !PAYMENT_METHODS.includes(paymentMethod)) throw new Error('Hình thức thanh toán không hợp lệ.');
  let vatRate = 0;
  if (origin === 'domestic' && purchaseCost > 0) {
    vatRate = input.vatRate === undefined || input.vatRate === '' || input.vatRate === null ? 0 : Number(input.vatRate);
    const rateProblem = vatRateProblem(vatRate, invoiceDate || context.purchaseDate, 'Thuế suất GTGT');
    if (rateProblem) throw new Error(rateProblem);
  }
  const vatAmount = Math.round((purchaseCost * vatRate) / 100);
  const legal = {
    vendorOrigin: origin, vendorTaxCode, contractNo: text(input.contractNo, 'Số hợp đồng', 80), invoiceNo: text(input.invoiceNo, 'Số hóa đơn', 30),
    invoiceSymbol: text(input.invoiceSymbol, 'Ký hiệu hóa đơn', 30), invoiceDate, purchaseCost, vatRate, vatAmount, totalPayable: purchaseCost + vatAmount, paymentMethod,
  };
  const accounting = licenseAccounting({ ...context, purchaseCost });
  const warnings = [];
  if (origin === 'domestic' && purchaseCost > 0 && !legal.invoiceNo) warnings.push('Chưa ghi số hóa đơn: chi phí cần hóa đơn hợp lệ để được trừ khi tính thuế TNDN và khấu trừ thuế GTGT đầu vào.');
  if (origin === 'domestic' && vatAmount > 0 && legal.totalPayable >= vatNonCashThreshold(invoiceDate || context.purchaseDate)) {
    if (paymentMethod === 'Tiền mặt') warnings.push('Hóa đơn từ ngưỡng thanh toán không dùng tiền mặt mà trả tiền mặt thì thuế GTGT đầu vào không được khấu trừ.');
    else if (!['Chuyển khoản', 'Thẻ', 'Bù trừ công nợ'].includes(paymentMethod)) warnings.push('Hóa đơn từ ngưỡng thanh toán không dùng tiền mặt: ghi hình thức thanh toán không dùng tiền mặt và giữ chứng từ để được khấu trừ thuế GTGT.');
  }
  if (origin === 'foreign' && purchaseCost > 0) warnings.push('Nhà cung cấp nước ngoài: kiểm tra nghĩa vụ thuế nhà thầu nước ngoài (GTGT, TNDN) và việc kê khai, nộp thay; hệ thống chưa tính.');
  return { legal, accounting, warnings };
}
