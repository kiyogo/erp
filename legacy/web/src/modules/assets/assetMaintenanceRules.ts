export type MaintenanceFrequency = 'Hàng tháng' | 'Hàng quý (3 tháng)' | 'Định kỳ 6 tháng' | 'Hàng năm';

export const MAINTENANCE_CHECKLIST = [
  'Kiểm tra ngoại quan, ốc vít và các điểm tiếp xúc cáp',
  'Vệ sinh bụi bẩn khe thông gió và bộ làm mát',
  'Kiểm tra thông số điện áp, nhiệt độ và công suất tải',
  'Cập nhật bản ghi nhật ký vận hành kỹ thuật',
] as const;

const FREQUENCY_DAYS: Record<MaintenanceFrequency, number> = {
  'Hàng tháng': 30,
  'Hàng quý (3 tháng)': 90,
  'Định kỳ 6 tháng': 180,
  'Hàng năm': 365,
};

export type MaintenanceScheduleStatus = 'Đã lên lịch' | 'Sắp đến hạn' | 'Quá hạn bảo dưỡng' | 'Đang tiến hành bảo dưỡng' | 'Đã hoàn thành đúng lịch';

export function deriveMaintenanceStatus(nextDate: string, today = localIsoDate()): Exclude<MaintenanceScheduleStatus, 'Đã hoàn thành đúng lịch'> {
  const dueAt = Date.parse(`${String(nextDate).slice(0, 10)}T00:00:00Z`);
  const todayAt = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(dueAt) || !Number.isFinite(todayAt)) return 'Đã lên lịch';
  if (dueAt < todayAt) return 'Quá hạn bảo dưỡng';
  if (dueAt - todayAt <= 7 * 86_400_000) return 'Sắp đến hạn';
  return 'Đã lên lịch';
}

export function addMaintenanceCycle(date: string, frequency: MaintenanceFrequency): string {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) throw new Error('Ngày thực hiện không hợp lệ.');
  const next = new Date(timestamp);
  next.setUTCDate(next.getUTCDate() + FREQUENCY_DAYS[frequency]);
  return next.toISOString().slice(0, 10);
}

export function localIsoDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function validateMaintenanceCompletion(input: {
  performedDate: unknown;
  today?: string;
  lastDate?: string;
  checklist: Array<{ item: string; done: boolean }>;
  healthScore: unknown;
  actualCost: unknown;
  notes: unknown;
}): { performedDate: string; healthScore: number; actualCost: number; notes: string } {
  const performedDate = String(input.performedDate || '').trim();
  const timestamp = Date.parse(`${performedDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(performedDate) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== performedDate) {
    throw new Error('Chọn ngày thực hiện hợp lệ.');
  }
  if (performedDate > (input.today || localIsoDate())) throw new Error('Ngày thực hiện không được ở tương lai.');
  if (input.lastDate && performedDate < input.lastDate) throw new Error('Ngày thực hiện không được trước lần bảo dưỡng gần nhất.');
  if (!input.checklist.length || input.checklist.some((entry) => entry.done !== true)) throw new Error('Hoàn thành mọi mục checklist trước khi nghiệm thu.');
  if (input.healthScore === '' || input.healthScore === null || input.healthScore === undefined) throw new Error('Nhập điểm sức khỏe sau bảo dưỡng.');
  if (input.actualCost === '' || input.actualCost === null || input.actualCost === undefined) throw new Error('Nhập chi phí thực tế; nhập 0 nếu không phát sinh.');
  const healthScore = Number(input.healthScore);
  if (!Number.isSafeInteger(healthScore) || healthScore < 0 || healthScore > 100) throw new Error('Điểm sức khỏe phải từ 0 đến 100.');
  const actualCost = Number(input.actualCost);
  if (!Number.isSafeInteger(actualCost) || actualCost < 0 || actualCost > 1_000_000_000_000) throw new Error('Chi phí thực tế phải là số nguyên không âm hợp lệ.');
  const notes = String(input.notes || '').trim();
  if (notes.length > 2_000) throw new Error('Ghi chú nghiệm thu vượt quá độ dài cho phép.');
  return { performedDate, healthScore, actualCost, notes };
}
