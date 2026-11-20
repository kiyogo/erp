// Sự cố có lộ, mất dữ liệu cá nhân: phải thông báo vi phạm cho cơ quan có thẩm quyền (Bộ Công an) trong 72 giờ kể từ khi phát hiện.
// Căn cứ: Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 (từ 01/01/2026), Nghị định 356/2025/NĐ-CP (Điều 28 thông báo cho cơ quan, Mẫu số 08;
// Điều 29 thông báo cho chủ thể dữ liệu, thay Nghị định 13/2023/NĐ-CP). Xác minh qua bài tổng hợp (EY, PwC, luatvietnam.vn), chưa đối chiếu
// văn bản gốc; chưa xác nhận được thời hạn báo cáo sự cố an ninh mạng khác theo Luật An ninh mạng 116/2025/QH15 (từ 01/07/2026).

export const BREACH_NOTIFICATION_HOURS = 72;
const HOUR_MS = 3_600_000;

const iso = (value, label) => {
  const text = String(value || '').trim();
  const time = Date.parse(text);
  if (!text || !Number.isFinite(time)) throw new Error(`${label} không hợp lệ.`);
  return new Date(time).toISOString();
};

export const breachDeadline = (discoveredAt) => new Date(Date.parse(discoveredAt) + BREACH_NOTIFICATION_HOURS * HOUR_MS).toISOString();

// Trạng thái thông báo cho cơ quan: pending (còn hạn), overdue (quá hạn chưa thông báo), on_time (đã thông báo trong hạn), late (thông báo trễ).
export function breachNotificationState(breach, nowMs = Date.now()) {
  const deadline = Date.parse(breachDeadline(breach.discoveredAt));
  if (breach.authorityNotifiedAt) return Date.parse(breach.authorityNotifiedAt) <= deadline ? 'on_time' : 'late';
  return nowMs > deadline ? 'overdue' : 'pending';
}

// Chuẩn hóa khối vi phạm dữ liệu cá nhân của sự cố. Ném Error tiếng Việt khi sai.
export function normalizeBreach(input, nowMs = Date.now()) {
  const source = input && typeof input === 'object' ? input : {};
  const discoveredAt = iso(source.discoveredAt, 'Thời điểm phát hiện vi phạm');
  if (Date.parse(discoveredAt) > nowMs + 60_000) throw new Error('Thời điểm phát hiện không được ở tương lai.');
  const subjects = Number(source.dataSubjectsCount);
  if (!Number.isSafeInteger(subjects) || subjects < 0) throw new Error('Số chủ thể dữ liệu bị ảnh hưởng phải là số nguyên không âm (nhập 0 nếu chưa xác định).');
  const categories = String(source.dataCategories || '').trim();
  if (!categories) throw new Error('Nhập loại dữ liệu cá nhân bị ảnh hưởng.');
  if (categories.length > 500) throw new Error('Loại dữ liệu cá nhân dài tối đa 500 ký tự.');
  const breach = { discoveredAt, dataSubjectsCount: subjects, dataCategories: categories, sensitive: source.sensitive === true };
  for (const [field, label] of [['authorityNotifiedAt', 'Thời điểm thông báo cho cơ quan có thẩm quyền'], ['subjectsNotifiedAt', 'Thời điểm thông báo cho chủ thể dữ liệu']]) {
    if (!source[field]) continue;
    const value = iso(source[field], label);
    if (Date.parse(value) < Date.parse(discoveredAt)) throw new Error(`${label} không được trước thời điểm phát hiện.`);
    if (Date.parse(value) > nowMs + 60_000) throw new Error(`${label} không được ở tương lai.`);
    breach[field] = value;
  }
  return {
    ...breach,
    notificationDeadline: breachDeadline(discoveredAt),
    notificationState: breachNotificationState(breach, nowMs),
  };
}
