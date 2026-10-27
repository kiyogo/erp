export type PlanMilestoneRecord = {
  key: string;
  code: string;
  quarter: string;
  name: string;
  acceptanceCriteria: string;
  owner: string;
  deadline: string;
  progress: number;
  status: 'Đã đạt mốc' | 'Đang thực hiện' | 'Chưa bắt đầu';
};

export function quarterForDate(dateText: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `Q${Math.ceil(month / 3)}/${year}`;
}

export function createPlanMilestone(values: Record<string, unknown>, existing: PlanMilestoneRecord[]): PlanMilestoneRecord {
  const code = String(values.code || '').trim();
  const quarter = String(values.quarter || '');
  const name = String(values.name || '').trim();
  const acceptanceCriteria = String(values.acceptanceCriteria || '').trim();
  const owner = String(values.owner || '').trim();
  const deadline = String(values.deadline || '');
  if (!code || !name || !acceptanceCriteria || !owner) throw new Error('Nhập đủ mã mốc, tên, tiêu chuẩn nghiệm thu và người phụ trách.');
  if (existing.some((item) => item.code.trim().toLowerCase() === code.toLowerCase())) throw new Error('Mã mốc đã tồn tại.');
  const actualQuarter = quarterForDate(deadline);
  if (!actualQuarter || quarter !== actualQuarter) throw new Error('Kỳ quý phải khớp với hạn hoàn thành.');
  return { key: code, code, quarter, name, acceptanceCriteria, owner, deadline, progress: 0, status: 'Chưa bắt đầu' };
}

export function planMilestoneMetrics(records: PlanMilestoneRecord[], now = new Date()) {
  const completedCount = records.filter((item) => item.status === 'Đã đạt mốc').length;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const overdueCount = records.filter((item) => item.status !== 'Đã đạt mốc' && quarterForDate(item.deadline) !== null && item.deadline < today).length;
  return {
    totalCount: records.length,
    completedCount,
    pendingCount: records.length - completedCount,
    completionRate: records.length ? Math.round(completedCount / records.length * 100) : null,
    overdueCount,
  };
}

export function completePlanMilestone(record: PlanMilestoneRecord): PlanMilestoneRecord {
  return { ...record, progress: 100, status: 'Đã đạt mốc' };
}

export function planMilestoneExportRows(records: PlanMilestoneRecord[]) {
  return [
    ['Mã mốc', 'Kỳ quý', 'Tên mốc', 'Tiêu chuẩn nghiệm thu', 'Người phụ trách', 'Hạn hoàn thành', 'Tiến độ', 'Trạng thái'],
    ...records.map((item) => [item.code, item.quarter, item.name, item.acceptanceCriteria, item.owner, item.deadline, item.progress, item.status]),
  ];
}
