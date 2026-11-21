// Xác minh danh tính điện tử (eKYC) hai thiết bị: máy tính đã đăng nhập tạo phiên, điện thoại quét mã QR (mã phiên 64 ký tự hex là
// quyền ghi duy nhất của điện thoại) rồi gửi kết quả đọc thẻ căn cước và so khớp khuôn mặt. Ảnh khuôn mặt, video và ảnh giấy tờ là dữ liệu
// cá nhân nhạy cảm (dữ liệu sinh trắc học) nên phải có sự đồng ý rõ ràng của chính người được xác minh trước khi xử lý.
// Căn cứ: Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 và Nghị định 356/2025/NĐ-CP (đồng ý xử lý dữ liệu nhạy cảm), Luật Căn cước 2023 (số định
// danh cá nhân 12 chữ số). Xác minh qua trí nhớ văn bản, chưa đối chiếu bản gốc.

export const EKYC_SESSION_TTL_MS = 30 * 60 * 1000;
export const isEkycToken = (value) => /^[a-f0-9]{64}$/.test(String(value || ''));

// Trả về thông báo lỗi tiếng Việt, chuỗi rỗng khi kết quả xác minh đủ điều kiện lưu vào hồ sơ.
export function ekycVerificationProblem(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Kết quả xác minh không hợp lệ.';
  if (data.biometricConsent !== true) return 'Người được xác minh phải đồng ý cho xử lý dữ liệu sinh trắc học và ảnh giấy tờ trước khi lưu.';
  if (!/^\d{12}$/.test(String(data.idNumber || '').trim())) return 'Số định danh cá nhân trên thẻ căn cước phải gồm 12 chữ số.';
  if (!String(data.name || '').trim()) return 'Chưa đọc được họ tên trên thẻ căn cước.';
  return '';
}
