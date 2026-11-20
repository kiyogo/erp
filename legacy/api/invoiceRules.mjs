// Quy tắc nội dung hóa đơn điện tử: mã số thuế, số tiền bằng chữ, thuế theo từng thuế suất, kiểm tra nội dung bắt buộc.
// Căn cứ: Nghị định 254/2026/NĐ-CP Điều 10 và Phụ lục nội dung hóa đơn, Thông tư 91/2026/TT-BTC (từ 01/07/2026, thay
// Nghị định 123/2020/NĐ-CP đã sửa bởi Nghị định 70/2025/NĐ-CP và Thông tư 32/2025/TT-BTC).
// Danh mục nội dung xác minh qua bài tổng hợp (einvoice.vn, ketoanleanh.edu.vn, luatvietnam.vn); chưa đối chiếu được
// văn bản gốc, nên số điều khoản và việc "số tiền bằng chữ", "hình thức thanh toán" có bắt buộc hay không chưa được xác nhận.

// Mã số thuế 10 số, đơn vị phụ thuộc 13 số dạng 10 số-3 số. Chữ số thứ 10 là số kiểm tra:
// 10 - (tổng các chữ số đầu nhân hệ số 31, 29, 23, 19, 17, 13, 7, 5, 3 chia 11 lấy dư).
const TAX_CODE_WEIGHTS = [31, 29, 23, 19, 17, 13, 7, 5, 3];

export function isValidTaxCode(value) {
  const code = String(value || '').trim();
  const match = /^(\d{10})(?:-(\d{3}))?$/.exec(code);
  if (!match || match[2] === '000') return false;
  const digits = match[1].split('').map(Number);
  const sum = TAX_CODE_WEIGHTS.reduce((total, weight, index) => total + weight * digits[index], 0);
  return 10 - (sum % 11) === digits[9];
}

// Từ 01/07/2025 số định danh cá nhân 12 số thay mã số thuế của cá nhân; chứng minh nhân dân 9 số không còn được dùng.
export const isPersonalIdNumber = (value) => /^\d{12}$/.test(String(value || '').trim());

// Trả về thông báo lỗi hoặc chuỗi rỗng. Người mua là cá nhân được dùng số định danh thay mã số thuế.
export function buyerTaxCodeProblem(code, buyerType) {
  const value = String(code || '').trim();
  if (!value) return '';
  if (isValidTaxCode(value)) return '';
  if (buyerType === 'person' && isPersonalIdNumber(value)) return '';
  return buyerType === 'person'
    ? 'Mã số thuế hoặc số định danh người mua không hợp lệ (mã số thuế 10 hoặc 13 số đúng số kiểm tra, số định danh cá nhân 12 số).'
    : 'Mã số thuế người mua không hợp lệ (10 số, hoặc 13 số dạng 0123456789-001, đúng số kiểm tra).';
}

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const SCALES = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

function readTriple(value, full) {
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const units = value % 10;
  const words = [];
  if (hundreds > 0 || full) words.push(`${DIGITS[hundreds]} trăm`);
  if (tens > 1) words.push(`${DIGITS[tens]} mươi`);
  else if (tens === 1) words.push('mười');
  else if (units > 0 && (hundreds > 0 || full)) words.push('lẻ');
  if (units > 0) {
    if (units === 1 && tens > 1) words.push('mốt');
    else if (units === 5 && tens > 0) words.push('lăm');
    else if (units === 4 && tens > 1) words.push('tư');
    else words.push(DIGITS[units]);
  }
  return words.join(' ');
}

// Số tiền đồng Việt Nam bằng chữ, ví dụ 1.234.567 là "Một triệu hai trăm ba mươi tư nghìn năm trăm sáu mươi bảy đồng chẵn".
export function vndInWords(amount) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Số tiền không hợp lệ.');
  if (amount === 0) return 'Không đồng';
  const groups = [];
  for (let rest = amount; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
  const parts = [];
  for (let index = groups.length - 1; index >= 0; index--) {
    if (groups[index] === 0) continue;
    parts.push(`${readTriple(groups[index], index < groups.length - 1)} ${SCALES[index]}`.trim());
  }
  const text = parts.join(' ').trim();
  return `${text[0].toUpperCase()}${text.slice(1)} đồng chẵn`;
}

// Thuế theo từng thuế suất: Điều 10 yêu cầu ghi thành tiền chưa thuế và tiền thuế theo từng loại thuế suất.
export function vatBreakdown(lines) {
  const byRate = new Map();
  for (const line of lines) {
    const row = byRate.get(line.vatRate) || { rate: line.vatRate, base: 0, vat: 0 };
    row.base += line.amount;
    row.vat += line.vatAmount;
    byRate.set(line.vatRate, row);
  }
  return [...byRate.values()].sort((a, b) => a.rate - b.rate);
}

// Danh sách nội dung bắt buộc còn thiếu của bản nháp (không chặn lưu nháp, vì chưa phát hành được).
export function invoiceContentIssues({ seller, invoice }) {
  const issues = [];
  if (!seller.name || !seller.taxCode || !seller.address) issues.push('Hồ sơ doanh nghiệp thiếu tên, mã số thuế hoặc địa chỉ người bán.');
  if (invoice.buyerType === 'organization') {
    if (!invoice.buyerTaxCode) issues.push('Người mua là doanh nghiệp cần có mã số thuế.');
    if (!invoice.buyerAddress) issues.push('Người mua là doanh nghiệp cần có địa chỉ.');
  }
  if (!invoice.templateCode || !invoice.symbol) issues.push('Chưa có ký hiệu mẫu số hóa đơn và ký hiệu hóa đơn (chọn mẫu hóa đơn).');
  return issues;
}
