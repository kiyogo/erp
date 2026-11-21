// Ghi sổ theo sao kê ngân hàng: giao dịch có trên sao kê (giấy báo Nợ, giấy báo Có) mà sổ kế toán chưa có phiếu thì lập phiếu ngân hàng theo số
// liệu của ngân hàng. Chênh lệch chưa xác định được nguyên nhân ghi tạm vào 1388 (tiền ra) hoặc 3388 (tiền vào) để xử lý sau.
// Căn cứ: Thông tư 200/2014/TT-BTC Điều 13 (nguyên tắc kế toán tiền gửi ngân hàng), Thông tư 99/2025/TT-BTC (thay thế từ 2026, giữ tài khoản 112,
// 1388, 3388). Xác minh qua trí nhớ văn bản, chưa đối chiếu bản gốc.

// Phân loại -> chiều giao dịch bắt buộc (nếu có) và tài khoản đối ứng gợi ý theo thứ tự ưu tiên (tài khoản chi tiết có trong danh mục được chọn trước).
export const STATEMENT_POSTING_RULES = {
  'Thu khách hàng': { direction: 'Thu', accounts: ['131'] },
  'Thanh toán nhà cung cấp': { direction: 'Chi', accounts: ['331'] },
  'Phí ngân hàng': { direction: 'Chi', accounts: ['6427', '6422', '642'] },
  'Lãi tiền gửi': { direction: 'Thu', accounts: ['515'] },
  'Chuyển khoản nội bộ': { accounts: ['1131', '113'] },
  'Khác': { accounts: { Thu: ['3388', '338'], Chi: ['1388', '138'] } },
};

export function suggestedStatementAccounts(classification, direction) {
  const accounts = STATEMENT_POSTING_RULES[classification]?.accounts;
  return Array.isArray(accounts) ? accounts : accounts?.[direction] || [];
}

// Trả về thông báo lỗi tiếng Việt, chuỗi rỗng khi được ghi sổ.
export function statementPostingProblem({ classification, direction, counterAccount }) {
  const rule = STATEMENT_POSTING_RULES[classification];
  if (!rule) return 'Chọn phân loại giao dịch trước khi ghi sổ.';
  if (rule.direction && rule.direction !== direction) return `Giao dịch ${direction === 'Thu' ? 'tiền vào' : 'tiền ra'} không thể phân loại là ${classification}.`;
  const code = String(counterAccount || '').trim();
  if (!/^\d{3,6}$/.test(code)) return 'Tài khoản đối ứng phải là mã tài khoản dạng số.';
  if (/^11[12]/.test(code)) return 'Chuyển tiền giữa ngân hàng và quỹ dùng chức năng chuyển tiền nội bộ, không ghi sổ theo sao kê.';
  return '';
}
