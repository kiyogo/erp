// Thời hạn lưu trữ tài liệu kế toán trước khi được xóa vĩnh viễn khỏi thùng rác.
// Căn cứ: Luật Kế toán 88/2015/QH13 Điều 41: lưu tối thiểu 5 năm với tài liệu kế toán dùng cho quản lý, điều hành, tối thiểu 10 năm với
// chứng từ dùng ghi sổ, sổ kế toán và báo cáo tài chính năm, vĩnh viễn với tài liệu có tính sử liệu; thời hạn tính từ ngày kết thúc kỳ kế
// toán năm. Hệ thống không phân loại từng loại tài liệu nên áp mức 10 năm cho mọi phạm vi tài chính và lương. Xác minh qua trí nhớ văn bản,
// chưa đối chiếu bản gốc; nếu luật kế toán mới thay thế thì cần cập nhật.

export const ACCOUNTING_RETENTION_YEARS = 10;

export function isAccountingScope(scope) {
  return /^finance_/.test(scope) || ['payroll', 'employee_payslips'].includes(scope);
}

// Ngày cuối cùng còn phải lưu: hết năm thứ 10 kể từ năm tài liệu được tạo (kỳ kế toán năm kết thúc 31/12).
export function retainedThrough(createdAt) {
  const year = Number(String(createdAt || '').slice(0, 4));
  return Number.isInteger(year) && year > 1900 ? `${year + ACCOUNTING_RETENTION_YEARS}-12-31` : '9999-12-31';
}

export function trashPurgeProblem(entry, today) {
  if (!isAccountingScope(entry.scope)) return '';
  const until = retainedThrough(entry.created_at);
  if (today <= until) return `Tài liệu kế toán phải được lưu tối thiểu ${ACCOUNTING_RETENTION_YEARS} năm kể từ khi kết thúc kỳ kế toán năm (đến hết ${until}), nên chưa được xóa vĩnh viễn (Điều 41 Luật Kế toán 2015). Có thể khôi phục thay vì xóa.`;
  return '';
}

// Đường dẫn trong thông báo phải là đường dẫn nội bộ của hệ thống, không dẫn ra trang ngoài.
export function isInternalLink(link) {
  return link === '' || (/^\/[^/\\]/.test(link) && !/[\u0000-\u001f]/.test(link)) || link === '/';
}
