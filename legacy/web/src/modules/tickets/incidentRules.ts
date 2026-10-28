export interface IncidentMetricRecord {
  occurredAt?: string;
  resolvedAt?: string;
  downtimeMinutes?: number | null;
  status?: string;
}

export interface IncidentExportRecord extends IncidentMetricRecord {
  code: string;
  incidentTitle: string;
  affectedSystem: string;
  severity: string;
  handler: string;
  rootCause: string;
}

function incidentTimestamp(value?: string): number | null {
  if (!value) return null;
  const localTime = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (localTime) {
    const [, year, month, day, hour, minute, second = '00'] = localTime;
    const local = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
    if (local.getUTCFullYear() !== Number(year) || local.getUTCMonth() !== Number(month) - 1 || local.getUTCDate() !== Number(day)) return null;
    // The previous screen stored ISO UTC timestamps after removing the T and zone suffix.
    return local.getTime();
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function localYear(timestamp: number): number {
  return Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(timestamp));
}

export function calculateIncidentDowntimeMinutes(occurredAt?: string, resolvedAt?: string): number | null {
  const start = incidentTimestamp(occurredAt);
  const end = incidentTimestamp(resolvedAt);
  return start === null || end === null ? null : Math.max(0, Math.round((end - start) / 60_000));
}

export function formatIncidentTimestamp(value?: string, emptyLabel = 'Chưa ghi nhận'): string {
  const timestamp = incidentTimestamp(value);
  if (timestamp === null) return value ? String(value) : emptyLabel;
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(timestamp));
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(timestamp));
  return `${date}, ${time}`;
}

export function getIncidentMetrics(records: IncidentMetricRecord[], year = new Date().getFullYear(), nowMs = Date.now()) {
  const resolved = records.filter((record) => record.status === 'Đã xử lý & Hoàn tất RCA');
  const inYear = records.filter((record) => {
    const timestamp = incidentTimestamp(record.occurredAt);
    return timestamp !== null && localYear(timestamp) === year;
  });
  const durations = inYear.flatMap((record) => {
    const recorded = Number(record.downtimeMinutes);
    const hasRecordedDuration = record.downtimeMinutes != null && Number.isFinite(recorded) && recorded >= 0;
    if (record.status === 'Đang xử lý khẩn cấp') {
      const liveDuration = calculateIncidentDowntimeMinutes(record.occurredAt, new Date(nowMs).toISOString());
      return liveDuration === null ? (hasRecordedDuration ? [recorded] : []) : [liveDuration];
    }
    const calculated = calculateIncidentDowntimeMinutes(record.occurredAt, record.resolvedAt);
    return calculated !== null ? [calculated] : (hasRecordedDuration ? [recorded] : []);
  });
  const totalDowntime = durations.reduce((sum, duration) => sum + duration, 0);
  const resolvedDurations = resolved.flatMap((record) => {
    const calculated = calculateIncidentDowntimeMinutes(record.occurredAt, record.resolvedAt);
    const recorded = Number(record.downtimeMinutes);
    return calculated !== null ? [calculated] : record.downtimeMinutes != null && Number.isFinite(recorded) && recorded >= 0 ? [recorded] : [];
  });
  const yearStart = Date.parse(`${year}-01-01T00:00:00+07:00`);
  const yearEnd = Date.parse(`${year + 1}-01-01T00:00:00+07:00`);
  const elapsedMinutes = Math.max(1, (Math.min(nowMs, yearEnd) - yearStart) / 60_000);
  const hasDowntime = durations.length > 0;

  return {
    year,
    openCount: records.filter((record) => record.status === 'Đang xử lý khẩn cấp').length,
    totalDowntime: hasDowntime ? totalDowntime : null,
    averageRepairMinutes: resolvedDurations.length
      ? resolvedDurations.reduce((sum, duration) => sum + duration, 0) / resolvedDurations.length
      : null,
    availabilityPercent: hasDowntime
      ? Math.max(0, Math.min(100, 100 - (totalDowntime / elapsedMinutes) * 100))
      : null,
    resolvedCount: resolved.length,
    completionPercent: records.length ? Math.round((resolved.length / records.length) * 100) : null,
  };
}

export function incidentExportRows(records: IncidentExportRecord[]) {
  return [
    ['Mã sự cố', 'Thời điểm xảy ra', 'Tiêu đề', 'Hệ thống ảnh hưởng', 'Mức độ', 'Người phụ trách', 'Thời điểm khắc phục', 'Gián đoạn (phút)', 'Nguyên nhân gốc', 'Trạng thái'],
    ...records.map((record) => [
      record.code,
      formatIncidentTimestamp(record.occurredAt),
      record.incidentTitle,
      record.affectedSystem,
      record.severity,
      record.handler,
      formatIncidentTimestamp(record.resolvedAt, 'Đang xử lý'),
      record.downtimeMinutes ?? '',
      record.rootCause,
      record.status || '',
    ]),
  ];
}
