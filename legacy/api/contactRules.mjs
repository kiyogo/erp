// Quy tắc dữ liệu khách hàng, nhà cung cấp, đối tác: mã số thuế, số định danh, điện thoại, ngày tháng, đồng ý xử lý dữ liệu cá nhân.
// Căn cứ: Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 (từ 01/01/2026) và Nghị định 356/2025/NĐ-CP thay Nghị định 13/2023/NĐ-CP:
// đồng ý phải tự nguyện, cụ thể theo từng mục đích, lưu được dưới dạng văn bản hoặc điện tử, im lặng không phải đồng ý, được rút lại;
// quảng cáo dùng dữ liệu cá nhân cần đồng ý (Nghị định 330/2026/NĐ-CP xử phạt); Nghị định 91/2020/NĐ-CP về tin nhắn, thư, cuộc gọi rác
// cần đồng ý trước; Luật Căn cước 26/2023/QH15 (số định danh 12 số, chứng minh nhân dân 9 số hết giá trị từ 01/01/2025).
// Xác minh qua bài tổng hợp, chưa đối chiếu văn bản gốc; thời hạn xử lý yêu cầu rút đồng ý và thời gian lưu bằng chứng chưa xác nhận.
import { isPersonalIdNumber, isValidTaxCode } from './invoiceRules.mjs';

export const todayInVietnam = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// Di động và máy bàn trong nước 10 đến 11 số bắt đầu bằng 0; số quốc tế dạng +mã nước tối đa 15 số.
export function isValidPhone(value) {
  const compact = String(value || '').replace(/[\s.\-()]/g, '');
  return /^0\d{9,10}$/.test(compact) || /^\+\d{8,15}$/.test(compact);
}

export const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
export const isValidWebsite = (value) => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(String(value || '').trim());
export const isValidPassportNumber = (value) => /^[A-Z0-9]{6,12}$/i.test(String(value || '').trim());

// Tổ chức dùng mã số thuế; cá nhân dùng mã số thuế hoặc số định danh 12 số.
export function contactTaxCodeProblem(code, entityKind) {
  const value = String(code || '').trim();
  if (!value || isValidTaxCode(value)) return '';
  if (entityKind === 'person' && isPersonalIdNumber(value)) return '';
  return entityKind === 'person'
    ? 'Mã số thuế hoặc số định danh không hợp lệ (mã số thuế 10 hoặc 13 số đúng số kiểm tra, số định danh 12 số).'
    : 'Mã số thuế không hợp lệ (10 số, hoặc 13 số dạng 0123456789-001, đúng số kiểm tra).';
}

// Danh sách email nhận hóa đơn, phân cách bằng dấu chấm phẩy hoặc phẩy.
export function invoiceEmailsProblem(list) {
  const emails = String(list || '').split(/[;,]/).map(item => item.trim()).filter(Boolean);
  if (emails.length > 10) return 'Email nhận hóa đơn tối đa 10 địa chỉ.';
  const bad = emails.find(email => !isValidEmail(email));
  return bad ? `Email nhận hóa đơn không đúng định dạng: ${bad}.` : '';
}

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

// Ngày không được sau hôm nay (giờ Việt Nam) và không trước năm 1900. Trả về thông báo lỗi hoặc chuỗi rỗng.
export function pastDateProblem(value, label, today = todayInVietnam()) {
  if (!value) return '';
  if (!isIsoDate(value)) return `${label} không phải ngày hợp lệ.`;
  if (value > today) return `${label} không được sau ngày hôm nay.`;
  if (value < '1900-01-01') return `${label} không hợp lệ.`;
  return '';
}

// Đồng ý xử lý dữ liệu cá nhân phải ghi rõ ngày và mục đích; gửi tin quảng cáo cần đã có đồng ý.
export function dataConsentProblem(details, today = todayInVietnam()) {
  if (details.marketingOptIn && !details.dataConsent) return 'Chỉ đánh dấu đồng ý nhận quảng cáo khi đã ghi nhận đồng ý xử lý dữ liệu cá nhân.';
  if (!details.dataConsent) return '';
  if (!details.dataConsentDate) return 'Nhập ngày khách hàng đồng ý xử lý dữ liệu cá nhân.';
  if (!details.dataConsentPurposes) return 'Nhập mục đích xử lý dữ liệu cá nhân mà khách hàng đã đồng ý.';
  return pastDateProblem(details.dataConsentDate, 'Ngày đồng ý xử lý dữ liệu', today);
}
