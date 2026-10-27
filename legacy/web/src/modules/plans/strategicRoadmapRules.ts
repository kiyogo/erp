export const STRATEGIC_PILLARS = [
  'Tăng trưởng Doanh thu',
  'Hạ tầng Công nghệ & AI',
  'Tuân thủ An ninh & ISO',
  'Mở rộng Thị phần B2B',
] as const;

export type StrategicPillar = typeof STRATEGIC_PILLARS[number];

export interface StrategicOkrRecord {
  key: string;
  okrCode: string;
  title: string;
  pillar: StrategicPillar;
  owner: string;
  targetMetric: string;
  progressPct: number;
  deadline: string;
  status: string;
}

export function isValidCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function createStrategicOkr(values: Record<string, unknown>, existing: StrategicOkrRecord[]): StrategicOkrRecord {
  const okrCode = String(values.okrCode || '').trim();
  const title = String(values.title || '').trim();
  const pillar = String(values.pillar || '') as StrategicPillar;
  const owner = String(values.owner || '').trim();
  const targetMetric = String(values.targetMetric || '').trim();
  const deadline = String(values.deadline || '');
  const progressText = String(values.progressPct ?? '').trim();
  const progressPct = Number(progressText);

  if (!okrCode || !title || !owner || !targetMetric || !deadline) throw new Error('Nhập đủ mã, mục tiêu, trụ cột, người phụ trách, chỉ số và hạn chót.');
  if (existing.some((item) => item.okrCode.trim().toLowerCase() === okrCode.toLowerCase())) throw new Error('Mã OKR đã tồn tại.');
  if (!STRATEGIC_PILLARS.includes(pillar)) throw new Error('Trụ cột chiến lược không hợp lệ.');
  if (!isValidCalendarDate(deadline)) throw new Error('Hạn chót không hợp lệ.');
  if (!progressText || !Number.isInteger(progressPct) || progressPct < 0 || progressPct > 100) throw new Error('Tiến độ phải là số nguyên từ 0 đến 100.');

  return {
    key: okrCode,
    okrCode,
    title,
    pillar,
    owner,
    targetMetric,
    progressPct,
    deadline,
    status: strategicOkrStatus(progressPct, deadline),
  };
}

export function strategicOkrStatus(progressPct: number, deadline: string, now = new Date()) {
  if (progressPct >= 100) return 'Hoàn thành';
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (isValidCalendarDate(deadline) && deadline < today) return 'Cần tăng tốc';
  return 'Đang đúng tiến độ';
}

export function updateStrategicOkrProgress(record: StrategicOkrRecord, progress: unknown, now = new Date()): StrategicOkrRecord {
  const progressText = String(progress ?? '').trim();
  const progressPct = Number(progressText);
  if (!progressText || !Number.isInteger(progressPct) || progressPct < 0 || progressPct > 100) throw new Error('Tiến độ phải là số nguyên từ 0 đến 100.');
  return { ...record, progressPct, status: strategicOkrStatus(progressPct, record.deadline, now) };
}

export function strategicOkrMetrics(records: StrategicOkrRecord[], now = new Date()) {
  const validProgress = records.map((item) => Number(item.progressPct)).filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  const statuses = records.map((item) => strategicOkrStatus(Number(item.progressPct), item.deadline, now));
  return {
    totalCount: records.length,
    averageProgress: validProgress.length ? Math.round(validProgress.reduce((sum, value) => sum + value, 0) / validProgress.length) : null,
    completedCount: statuses.filter((status) => status === 'Hoàn thành').length,
    overdueCount: statuses.filter((status) => status === 'Cần tăng tốc').length,
    pillarCount: new Set(records.map((item) => item.pillar).filter((pillar) => STRATEGIC_PILLARS.includes(pillar))).size,
  };
}

export function strategicOkrExportRows(records: StrategicOkrRecord[]) {
  return [
    ['Mã OKR', 'Mục tiêu', 'Trụ cột', 'Người phụ trách', 'Chỉ số đo lường', 'Tiến độ (%)', 'Hạn chót', 'Trạng thái'],
    ...records.map((item) => [item.okrCode, item.title, item.pillar, item.owner, item.targetMetric, item.progressPct, item.deadline, strategicOkrStatus(Number(item.progressPct), item.deadline)]),
  ];
}
