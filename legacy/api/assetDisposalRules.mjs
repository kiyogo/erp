// Quy tắc thanh lý tài sản cố định: thuế GTGT trên giá bán, lãi lỗ, ngày hợp lệ và bút toán gợi ý.
// Căn cứ: Thông tư 45/2013/TT-BTC (thanh lý TSCĐ, phần nguyên giá, hao mòn lũy kế, giá trị còn lại), Luật Thuế GTGT 48/2024/QH15
// (bán tài sản là bán hàng hóa chịu thuế, phải lập hóa đơn), Thông tư 99/2025/TT-BTC (TK 211, 213, 214, 711, 811, 3331).
// Xác minh qua bài tổng hợp, chưa đối chiếu văn bản gốc. Bút toán chỉ là gợi ý để kế toán ghi sổ theo tài khoản chi tiết của
// danh mục đang dùng; hệ thống không tự ghi sổ cái, không tự tạo hóa đơn hay phiếu thu.

import { vatRateProblem } from './vatRules.mjs';
import { buyerTaxCodeProblem } from './invoiceRules.mjs';

export const SALE_DISPOSAL_METHODS = ['Bán đấu giá nội bộ CBNV', 'Bán thanh lý cho đơn vị thu mua ngoài'];
export const isSaleDisposal = (method) => SALE_DISPOSAL_METHODS.includes(method);

// Số tiền thu thực tế (actualDisposalPrice) là giá bán chưa thuế; thuế GTGT tính thêm theo thuế suất khi bán.
export function disposalFigures({ originalCost, accumulatedDepreciation, price, vatRate, cost, method }) {
  const vatAmount = isSaleDisposal(method) ? Math.round((price * vatRate) / 100) : 0;
  const netBookValue = originalCost - accumulatedDepreciation;
  return { vatAmount, totalReceived: price + vatAmount, netBookValue, netGainLoss: price - cost - netBookValue };
}

// Trả về thông báo lỗi hoặc chuỗi rỗng.
export function disposalFinalProblem({ method, disposalDate, proposalDate, today, assetStartDate, vatRate, invoiceNo, invoiceDate, buyerTaxCode }) {
  if (disposalDate > today) return 'Ngày xử lý thực tế không được ở tương lai.';
  if (proposalDate && disposalDate < proposalDate) return 'Ngày xử lý thực tế không được trước ngày đề xuất thanh lý.';
  if (assetStartDate && disposalDate < assetStartDate) return 'Ngày xử lý thực tế không được trước ngày mua hoặc đưa tài sản vào sử dụng.';
  if (!isSaleDisposal(method)) return '';
  if (!invoiceNo) return 'Bán tài sản phải lập hóa đơn: nhập số hóa đơn bán thanh lý.';
  if (invoiceDate > today) return 'Ngày hóa đơn không được ở tương lai.';
  const rateProblem = vatRateProblem(vatRate, invoiceDate, 'Thuế suất GTGT');
  if (rateProblem) return rateProblem;
  return buyerTaxCodeProblem(buyerTaxCode, 'person');
}

// Bút toán gợi ý (không tự ghi sổ). Tài khoản tiền theo hình thức thu: tiền mặt 111, chuyển khoản hoặc thẻ 112, còn lại phải thu 131.
export function disposalJournal({ method, originalCost, accumulatedDepreciation, netBookValue, price, vatAmount, cost, intangible, paymentMethod }) {
  const receiveAccount = paymentMethod === 'Tiền mặt' ? '111' : ['Chuyển khoản', 'Thẻ'].includes(paymentMethod) ? '112' : '131';
  const costAccount = receiveAccount === '112' ? '112' : '111';
  const lines = [];
  const add = (account, debit, credit, note) => { if (debit > 0 || credit > 0) lines.push({ account, debit, credit, note }); };
  add('214', accumulatedDepreciation, 0, 'Hao mòn lũy kế');
  add('811', netBookValue, 0, method.startsWith('Báo mất') ? 'Giá trị còn lại của tài sản bị mất (hoặc 1381 nếu chờ xử lý bồi thường)' : 'Giá trị còn lại của tài sản thanh lý');
  add(intangible ? '213' : '211', 0, originalCost, 'Nguyên giá tài sản');
  add(receiveAccount, price + vatAmount, 0, 'Tiền thu hoặc phải thu từ thanh lý');
  add('711', 0, price, 'Thu nhập từ thanh lý (chưa thuế)');
  add('3331', 0, vatAmount, 'Thuế GTGT đầu ra');
  add('811', cost, 0, 'Chi phí thanh lý');
  add(costAccount, 0, cost, 'Chi trả chi phí thanh lý');
  return lines;
}

export function disposalWarnings({ method, councilDecisionNo, price, netBookValue, invoiceDate, disposalDate }) {
  const warnings = [];
  if (!councilDecisionNo) warnings.push('Chưa ghi số quyết định thanh lý của hội đồng hoặc người có thẩm quyền; hồ sơ thanh lý cần quyết định và biên bản.');
  if (isSaleDisposal(method)) {
    if (price < netBookValue) warnings.push('Giá bán thấp hơn giá trị còn lại: phần lỗ hạch toán vào chi phí khác; kiểm tra bên mua có phải bên liên kết (giá giao dịch phải theo giá thị trường).');
    if (invoiceDate && invoiceDate !== disposalDate) warnings.push('Ngày hóa đơn khác ngày xử lý: hóa đơn lập vào thời điểm chuyển giao quyền sở hữu tài sản.');
  }
  if (method.startsWith('Tặng')) warnings.push('Tặng tài sản có thể phải kê khai thuế GTGT và thu nhập như bán; hệ thống chưa tính, cần kế toán thuế xác định.');
  if (method.startsWith('Báo mất')) warnings.push('Tổn thất tài sản chỉ được tính vào chi phí được trừ khi có hồ sơ chứng minh và sau khi trừ bồi thường; kiểm tra điều kiện trước khi quyết toán thuế TNDN.');
  return warnings;
}
