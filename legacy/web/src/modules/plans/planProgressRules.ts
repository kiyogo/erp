export type PlanProgressRecord = {
  key: string;
  code: string;
  planName: string;
  taskTitle: string;
  assignee: string;
  dueDate: string;
  daysRemaining?: number;
  progressPercent: number;
  weightPercent: number;
  status: 'Đúng tiến độ' | 'Chậm tiến độ' | 'Hoàn thành';
};

export function daysUntilDueDate(dueDate: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  const [year, month, day] = dueDate.split('-').map(Number);
  const due = new Date(Date.UTC(year, month - 1, day));
  if (due.getUTCFullYear() !== year || due.getUTCMonth() !== month - 1 || due.getUTCDate() !== day) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today) / 86400000);
}

export function planProgressStatus(progressPercent: number, dueDate: string, now = new Date()): PlanProgressRecord['status'] {
  if (progressPercent === 100) return 'Hoàn thành';
  const remaining = daysUntilDueDate(dueDate, now);
  return remaining !== null && remaining < 0 ? 'Chậm tiến độ' : 'Đúng tiến độ';
}

export function planProgressMetrics(records: PlanProgressRecord[], now = new Date()) {
  const weightedRecords = records.filter((record) => Number.isFinite(record.weightPercent) && record.weightPercent > 0);
  const totalWeight = weightedRecords.reduce((sum, record) => sum + record.weightPercent, 0);
  const averageProgress = totalWeight > 0
    ? Math.round(weightedRecords.reduce((sum, record) => sum + record.progressPercent * record.weightPercent, 0) / totalWeight)
    : null;
  const completedCount = records.filter((record) => record.progressPercent === 100).length;
  return {
    averageProgress,
    completedCount,
    runningCount: records.length - completedCount,
    overdueCount: records.filter((record) => record.progressPercent < 100 && planProgressStatus(record.progressPercent, record.dueDate, now) === 'Chậm tiến độ').length,
  };
}

export function updatePlanProgress(record: PlanProgressRecord, value: unknown, now = new Date()): PlanProgressRecord {
  const progressPercent = typeof value === 'number' ? value : Number(String(value ?? ''));
  if (!Number.isInteger(progressPercent) || progressPercent < 0 || progressPercent > 100) throw new Error('Tiến độ phải là số nguyên từ 0 đến 100.');
  return {
    ...record,
    progressPercent,
    daysRemaining: daysUntilDueDate(record.dueDate, now) ?? undefined,
    status: planProgressStatus(progressPercent, record.dueDate, now),
  };
}

export function planProgressExportRows(records: PlanProgressRecord[], now = new Date()) {
  return [
    ['Mã nhiệm vụ', 'Kế hoạch', 'Hạng mục', 'Người phụ trách', 'Hạn chót', 'Còn ngày', 'Tiến độ', 'Tỷ trọng', 'Trạng thái'],
    ...records.map((record) => [
      record.code, record.planName, record.taskTitle, record.assignee, record.dueDate,
      record.progressPercent === 100 ? 0 : daysUntilDueDate(record.dueDate, now),
      record.progressPercent, record.weightPercent, planProgressStatus(record.progressPercent, record.dueDate, now),
    ]),
  ];
}
