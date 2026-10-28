export interface HelpdeskTimeRecord {
  createdDate?: string;
  acceptedAt?: string;
  resolvedAt?: string;
  priority?: string;
  status?: string;
}

export interface HelpdeskExportRecord extends HelpdeskTimeRecord {
  code: string;
  title: string;
  description?: string;
  requester: string;
  department: string;
}

function timestamp(value?: string): number | null {
  if (!value) return null;
  const legacyUtc = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (legacyUtc) {
    const [, year, month, day, hour, minute, second = '00'] = legacyUtc;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
    if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
    return date.getTime();
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function helpdeskMinutesBetween(start?: string, end?: string): number | null {
  const from = timestamp(start);
  const to = timestamp(end);
  return from === null || to === null ? null : Math.max(0, Math.round((to - from) / 60_000));
}

export function formatHelpdeskTimestamp(value?: string, emptyLabel = 'Chưa ghi nhận'): string {
  const parsed = timestamp(value);
  if (parsed === null) return value ? String(value) : emptyLabel;
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(parsed);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(parsed);
  return `${date}, ${time}`;
}

export function formatHelpdeskDuration(minutes: number | null): string {
  if (minutes === null) return 'Chưa đủ dữ liệu';
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} giờ ${remaining} phút` : `${hours} giờ`;
}

export function helpdeskMetrics(records: HelpdeskTimeRecord[]) {
  const responseTimes = records.flatMap((record) => {
    const value = helpdeskMinutesBetween(record.createdDate, record.acceptedAt);
    return value === null ? [] : [value];
  });
  const resolutionTimes = records.flatMap((record) => {
    const value = helpdeskMinutesBetween(record.createdDate, record.resolvedAt);
    return value === null ? [] : [value];
  });
  return {
    total: records.length,
    openCount: records.filter((record) => record.status === 'Mới tạo' || record.status === 'Đang xử lý').length,
    completedCount: records.filter((record) => record.status === 'Đã hoàn thành').length,
    urgentCount: records.filter((record) => record.priority === 'Khẩn cấp').length,
    averageResponseMinutes: responseTimes.length ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length) : null,
    averageResolutionMinutes: resolutionTimes.length ? Math.round(resolutionTimes.reduce((sum, value) => sum + value, 0) / resolutionTimes.length) : null,
  };
}

export function canTransitionHelpdeskTicket(currentStatus: string, nextStatus: string): boolean {
  if (currentStatus === 'Đã hoàn thành') return false;
  if (currentStatus === 'Mới tạo') return nextStatus === 'Đang xử lý' || nextStatus === 'Đã hoàn thành';
  return currentStatus === 'Đang xử lý' && nextStatus === 'Đã hoàn thành';
}

export function helpdeskExportRows(records: HelpdeskExportRecord[]) {
  return [
    ['Mã ticket', 'Ngày tạo', 'Tiêu đề', 'Mô tả', 'Người gửi', 'Phòng ban', 'Ưu tiên', 'Trạng thái', 'Thời điểm tiếp nhận', 'Thời điểm hoàn tất', 'Phản hồi (phút)', 'Thời gian xử lý (phút)'],
    ...records.map((record) => [
      record.code,
      formatHelpdeskTimestamp(record.createdDate),
      record.title,
      record.description || '',
      record.requester,
      record.department,
      record.priority || '',
      record.status || '',
      formatHelpdeskTimestamp(record.acceptedAt, 'Chưa tiếp nhận'),
      formatHelpdeskTimestamp(record.resolvedAt, 'Chưa hoàn tất'),
      helpdeskMinutesBetween(record.createdDate, record.acceptedAt) ?? '',
      helpdeskMinutesBetween(record.createdDate, record.resolvedAt) ?? '',
    ]),
  ];
}
