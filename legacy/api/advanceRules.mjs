// Quy tắc tạm ứng (tài khoản 141): người nhận là người lao động của doanh nghiệp, phải thanh toán dứt điểm tạm ứng kỳ trước mới được nhận tạm
// ứng kỳ sau, số chi không hết phải nộp lại quỹ hoặc trừ lương, quyết toán theo chứng từ thực chi.
// Căn cứ: Thông tư 200/2014/TT-BTC Điều 22 (nguyên tắc kế toán tài khoản 141), Thông tư 99/2025/TT-BTC (thay thế từ 2026, giữ tài khoản 141).
// Xác minh qua trí nhớ văn bản, chưa đối chiếu bản gốc Thông tư 99/2025. Máy chủ tính số chênh lệch và trạng thái, bỏ qua số client gửi.

export const ADVANCE_TYPES = ['Công tác phí', 'Mua vật tư / Thiết bị', 'Tiếp khách đối tác', 'Hành chính sự vụ'];
export const SETTLED_STATUSES = ['Đã hoàn ứng', 'Đã quyết toán nội bộ'];
const PENDING = 'Chờ cấp tạm ứng';
const OPEN = 'Chờ thanh quyết toán';
const LOCKED_AFTER_ISSUE = ['code', 'employeeId', 'advanceType', 'advancedAmount'];

const text = (value, label, max) => {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`${label} là bắt buộc.`);
  if (result.length > max) throw new Error(`${label} dài tối đa ${max} ký tự.`);
  return result;
};
const money = (value, label, min) => {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min) throw new Error(`${label} phải là số tiền nguyên từ ${min.toLocaleString('vi-VN')} đồng.`);
  return result;
};
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export const isAdvanceSettled = (advance) => SETTLED_STATUSES.includes(advance?.status);

// Chuẩn hóa một phiếu tạm ứng theo bước: tạo đề nghị, ghi nhận đã cấp tiền, quyết toán. Ném Error tiếng Việt khi sai.
export function normalizeAdvance(input, current, { today }) {
  const record = { ...input };
  if (current && isAdvanceSettled(current)) throw new Error('Phiếu tạm ứng đã quyết toán được giữ nguyên làm chứng từ, không sửa được.');
  if (!current) {
    record.code = text(record.code, 'Mã phiếu tạm ứng', 80);
    if (!ADVANCE_TYPES.includes(record.advanceType)) throw new Error('Loại hình tạm ứng không hợp lệ.');
    record.purpose = text(record.purpose, 'Mục đích tạm ứng', 2000);
    record.advancedAmount = money(record.advancedAmount, 'Số tiền tạm ứng', 1);
    record.requestDate = today;
    if (!validDate(String(record.settleDeadline || '')) || record.settleDeadline < today) throw new Error('Hạn hoàn ứng phải là ngày hợp lệ từ hôm nay trở đi.');
    return { ...record, issuedAmount: 0, spentAmount: 0, balance: 0, approver: '', invoicesSummary: '', status: PENDING };
  }
  if (current.status !== PENDING) {
    for (const field of LOCKED_AFTER_ISSUE) if (JSON.stringify(record[field] ?? null) !== JSON.stringify(current[field] ?? null)) throw new Error('Không sửa mã, người nhận, loại hoặc số tiền đề nghị sau khi đã cấp tiền.');
  } else {
    if (!ADVANCE_TYPES.includes(record.advanceType)) throw new Error('Loại hình tạm ứng không hợp lệ.');
    record.advancedAmount = money(record.advancedAmount, 'Số tiền tạm ứng', 1);
  }
  const requested = record.status === 'Quá hạn quyết toán' ? OPEN : record.status;
  if (current.status === PENDING && requested === PENDING) return { ...record, status: PENDING, issuedAmount: 0, spentAmount: 0, balance: 0 };
  if (current.status === PENDING) {
    if (requested !== OPEN) throw new Error('Cần ghi nhận đã cấp tiền trước khi quyết toán.');
    const issuedAmount = money(record.issuedAmount, 'Số tiền đã cấp', 1);
    if (issuedAmount > record.advancedAmount) throw new Error('Số tiền cấp không được vượt số tiền đề nghị tạm ứng.');
    return { ...record, issuedAmount, issuedAt: today, disbursementReference: text(record.disbursementReference, 'Mã phiếu chi hoặc tham chiếu giao dịch', 160), spentAmount: 0, balance: issuedAmount, status: OPEN };
  }
  // Đã cấp tiền: quyết toán theo chứng từ thực chi.
  const issuedAmount = Number(current.issuedAmount) || 0;
  const spentAmount = money(record.spentAmount, 'Số thực chi', 0);
  const balance = issuedAmount - spentAmount;
  const balanceReconciled = record.balanceReconciled === true;
  const settled = balance === 0 || balanceReconciled;
  return {
    ...record, issuedAmount, issuedAt: current.issuedAt, disbursementReference: current.disbursementReference,
    spentAmount, balance, balanceReconciled, invoicesSummary: text(record.invoicesSummary, 'Bảng kê hoặc tham chiếu chứng từ', 4000),
    status: settled ? 'Đã quyết toán nội bộ' : OPEN, settledAt: settled ? today : undefined,
  };
}
