import type { EnterpriseTask } from '../../api/endpoints';

export type EisenhowerQuadrantKey = 'do-now' | 'schedule' | 'delegate' | 'low-priority';
export type EisenhowerTask = Pick<EnterpriseTask, 'priority' | 'dueDate' | 'status'>;

export const EISENHOWER_QUADRANTS: ReadonlyArray<{
  key: EisenhowerQuadrantKey;
  title: string;
  axis: string;
}> = [
  { key: 'do-now', title: 'Cần làm ngay', axis: 'Quan trọng · Khẩn cấp' },
  { key: 'schedule', title: 'Lên lịch làm sau', axis: 'Quan trọng · Không khẩn cấp' },
  { key: 'delegate', title: 'Giao cho người phù hợp', axis: 'Không quan trọng · Khẩn cấp' },
  { key: 'low-priority', title: 'Công việc ít ưu tiên', axis: 'Không quan trọng · Không khẩn cấp' },
];

export function vietnamCalendarDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function classifyEisenhowerTask(task: EisenhowerTask, today = vietnamCalendarDate()): EisenhowerQuadrantKey | null {
  if (task.status === 'Hoàn thành') return null;

  const important = task.priority === 'Khẩn cấp' || task.priority === 'Cao';
  const urgent = task.priority === 'Khẩn cấp' || (isValidCalendarDate(task.dueDate) && task.dueDate <= today);
  if (important) return urgent ? 'do-now' : 'schedule';
  return urgent ? 'delegate' : 'low-priority';
}

export function buildEisenhowerMatrix<T extends EisenhowerTask>(tasks: T[], today = vietnamCalendarDate()) {
  return EISENHOWER_QUADRANTS.map(quadrant => ({
    ...quadrant,
    tasks: tasks.filter(task => classifyEisenhowerTask(task, today) === quadrant.key),
  }));
}
