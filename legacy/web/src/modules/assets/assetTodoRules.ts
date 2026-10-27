export interface TodoChecklistEntry {
  item: string;
  done: boolean;
}

export function deriveTaskSlaStatus(deadline: string, today?: string): 'Trong hạn SLA' | 'Sắp chạm hạn SLA' | 'Trễ hạn SLA' {
  const dueDay = String(deadline || '').slice(0, 10);
  const now = new Date();
  const currentDay = today || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dueTime = Date.parse(`${dueDay}T00:00:00Z`);
  const currentTime = Date.parse(`${currentDay}T00:00:00Z`);
  if (!Number.isFinite(dueTime) || !Number.isFinite(currentTime)) return 'Trong hạn SLA';
  if (dueTime < currentTime) return 'Trễ hạn SLA';
  return dueTime - currentTime <= 2 * 86_400_000 ? 'Sắp chạm hạn SLA' : 'Trong hạn SLA';
}

export function todoChecklistComplete(checklist: unknown): boolean {
  return Array.isArray(checklist) && checklist.length > 0
    && checklist.every((entry) => Boolean(entry && typeof entry === 'object' && (entry as TodoChecklistEntry).done === true));
}

export function validateTodoCompletion(input: {
  status: string;
  checklist: unknown;
  actualHours: unknown;
  resolution: unknown;
}): { actualHours: number; resolution: string } {
  if (input.status !== 'Chờ phê duyệt cấp trên') throw new Error('Nhiệm vụ phải được gửi duyệt trước khi nghiệm thu.');
  if (!todoChecklistComplete(input.checklist)) throw new Error('Hoàn thành tất cả mục checklist trước khi nghiệm thu.');
  const actualHours = Number(input.actualHours);
  if (!Number.isFinite(actualHours) || actualHours < 0.5 || actualHours > 1000) throw new Error('Thời gian thực tế phải từ 0,5 đến 1.000 giờ.');
  const resolution = String(input.resolution || '').trim();
  if (!resolution) throw new Error('Nhập kết quả nghiệm thu.');
  if (resolution.length > 2_000) throw new Error('Kết quả nghiệm thu vượt quá độ dài cho phép.');
  return { actualHours, resolution };
}
