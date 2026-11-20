// Quy tắc văn thư: độ mật, độ khẩn, số và ký hiệu, ngày vào sổ.
// Căn cứ: Nghị định 30/2020/NĐ-CP về công tác văn thư (Điều 8 thể thức số và ký hiệu, ngày ban hành; Điều 15 độ khẩn gồm hỏa tốc, thượng
// khẩn, khẩn; Phụ lục I chữ viết tắt tên loại văn bản), Luật Bảo vệ bí mật nhà nước 2018 (Điều 8 ba độ mật: tuyệt mật, tối mật, mật;
// Điều 5 cấm soạn thảo, lưu giữ tài liệu bí mật nhà nước trên máy tính hoặc thiết bị đã kết nối mạng, trừ cơ sở dữ liệu theo pháp luật cơ yếu).
// Xác minh qua trí nhớ văn bản và bài tổng hợp, chưa đối chiếu bản gốc; chữ viết tắt loại văn bản chỉ kiểm cho 4 loại có trong danh mục.

export const ARCHIVE_SECURITY_LEVELS = ['Tuyệt mật', 'Tối mật', 'Mật', 'Nội bộ', 'Thường'];
export const ARCHIVE_URGENCY_LEVELS = ['Hỏa tốc', 'Thượng khẩn', 'Khẩn', 'Bình thường'];
export const STATE_SECRET_LEVELS = ['Tuyệt mật', 'Tối mật', 'Mật'];

// Chữ viết tắt trong ký hiệu của văn bản có tên loại; công văn chỉ ghi chữ viết tắt tên cơ quan nên không có mục.
export const DOC_TYPE_ABBREVIATIONS = { 'Quyết định': 'QĐ', 'Thông báo': 'TB', 'Tờ trình': 'TTr', 'Hợp đồng': 'HĐ', 'Giấy mời': 'GM' };

// Số và ký hiệu: số thứ tự (kèm năm tùy chọn) rồi "/" và ký hiệu viết tắt nối bằng dấu gạch, ví dụ 12/QĐ-ABC hoặc 05/2026/QĐ-ABC.
const NUMBER_PATTERN = /^\d{1,6}(\/\d{4})?\/[\p{L}\d]+(-[\p{L}\d]+)*$/u;

export function docNumberWarnings(code, { outgoingDocType = '' } = {}) {
  const value = String(code || '').trim();
  if (!value) return [];
  if (!NUMBER_PATTERN.test(value)) return ['Số và ký hiệu chưa theo dạng số/ký hiệu của Nghị định 30/2020 (ví dụ 12/QĐ-ABC): số thứ tự, dấu gạch chéo, chữ viết tắt loại văn bản rồi tên cơ quan.'];
  const abbreviation = DOC_TYPE_ABBREVIATIONS[outgoingDocType];
  if (abbreviation && !value.includes(`/${abbreviation}-`)) return [`Ký hiệu của ${outgoingDocType.toLowerCase()} nên có chữ viết tắt ${abbreviation} (ví dụ 12/${abbreviation}-ABC).`];
  return [];
}

// Lỗi chặn lưu và cảnh báo cho một hồ sơ sổ văn thư.
export function archiveDateIssues({ dispatchType, docDate, dateReceivedOrIssued }, today) {
  const errors = [];
  const warnings = [];
  if (dateReceivedOrIssued > today) errors.push('Ngày vào sổ không được ở tương lai.');
  if (dispatchType === 'Văn bản đến') {
    if (docDate > today) errors.push('Ngày ghi trên văn bản đến không được ở tương lai.');
    if (dateReceivedOrIssued < docDate) errors.push('Ngày vào sổ của văn bản đến không được trước ngày ghi trên văn bản.');
  } else if (docDate !== dateReceivedOrIssued) {
    warnings.push('Văn bản đi lấy số vào ngày ban hành (ngày ký): ngày ghi trên văn bản và ngày vào sổ đang khác nhau.');
  }
  return { errors, warnings };
}

export function secretDocumentWarnings(securityLevel, hasFile) {
  if (!STATE_SECRET_LEVELS.includes(securityLevel)) return [];
  return [`Văn bản ${securityLevel.toLowerCase()} thuộc bí mật nhà nước${hasFile ? ': bản scan đang được lưu trên hệ thống này' : ''}; Luật Bảo vệ bí mật nhà nước 2018 cấm lưu tài liệu này trên máy tính hoặc thiết bị kết nối mạng, nên chỉ ghi sổ thông tin cần thiết và không tải bản scan.`];
}
