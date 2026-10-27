export type StrategicPlanRecord = {
  key: string;
  code: string;
  name: string;
  department: string;
  startDate: string;
  endDate: string;
  budget: number;
  manager: string;
  priority: 'Chiến lược cấp 1' | 'Trọng điểm cấp 2' | 'Thường xuyên';
  status: 'Đang triển khai' | 'Đã phê duyệt' | 'Đã hoàn thành';
};

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function createStrategicPlan(values: Record<string, unknown>, existing: StrategicPlanRecord[]): StrategicPlanRecord {
  const code = String(values.code || '').trim();
  const name = String(values.name || '').trim();
  const department = String(values.department || '').trim();
  const manager = String(values.manager || '').trim();
  const startDate = String(values.startDate || '');
  const endDate = String(values.endDate || '');
  const budget = typeof values.budget === 'number' ? values.budget : Number(String(values.budget ?? ''));
  if (!code || !name || !department || !manager) throw new Error('Nhập đủ mã, tên kế hoạch, đơn vị và chủ nhiệm.');
  if (existing.some((plan) => plan.code.trim().toLowerCase() === code.toLowerCase())) throw new Error('Mã kế hoạch đã tồn tại.');
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) throw new Error('Ngày bắt đầu và kết thúc không hợp lệ.');
  if (!Number.isSafeInteger(budget) || budget < 0) throw new Error('Ngân sách phải là số nguyên không âm.');
  const priority = values.priority;
  if (priority !== 'Chiến lược cấp 1' && priority !== 'Trọng điểm cấp 2' && priority !== 'Thường xuyên') {
    throw new Error('Cấp độ ưu tiên không hợp lệ.');
  }
  return { key: code, code, name, department, startDate, endDate, budget, manager, priority, status: 'Đang triển khai' };
}

export function strategicPlanCompletionRate(plans: StrategicPlanRecord[]) {
  return plans.length ? Math.round((plans.filter((plan) => plan.status === 'Đã hoàn thành').length / plans.length) * 100) : null;
}

export function strategicPlanExportRows(plans: StrategicPlanRecord[]) {
  return [
    ['Mã kế hoạch', 'Tên kế hoạch', 'Đơn vị', 'Chủ nhiệm', 'Ngày bắt đầu', 'Ngày kết thúc', 'Ngân sách', 'Ưu tiên', 'Trạng thái'],
    ...plans.map((plan) => [plan.code, plan.name, plan.department, plan.manager, plan.startDate, plan.endDate, plan.budget, plan.priority, plan.status]),
  ];
}
