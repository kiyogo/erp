export type PlanReportPeriod = 'all' | string;

export interface ReportPlanSource {
  key?: string;
  code?: string;
  name?: string;
  department?: string;
  manager?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  status?: string;
}

export interface ReportProgressSource {
  key?: string;
  code?: string;
  planName?: string;
  taskTitle?: string;
  assignee?: string;
  dueDate?: string;
  progressPercent?: number;
  weightPercent?: number;
  status?: string;
}

export interface ReportBudgetSource {
  key?: string;
  code?: string;
  department?: string;
  fiscalYear?: string;
  allocatedBudget?: number;
  actualSpent?: number;
}

export interface PlanReportProject {
  code: string;
  name: string;
  budget: number | null;
  status: string;
}

export interface PlanReportRow {
  key: string;
  department: string;
  leader: string;
  totalPlans: number;
  completedPlans: number;
  approvedBudget: number | null;
  actualSpent: number | null;
  variance: number | null;
  progressScore: number | null;
  progressWeight: number;
  evaluation: string;
  projects: PlanReportProject[];
}

function safeAmount(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function validDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function yearOf(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = value.match(/(?:^|\D)(20\d{2})(?:\D|$)/);
  return match?.[1] || null;
}

function belongsToPeriod(period: PlanReportPeriod, date: unknown) {
  return period === 'all' || (typeof date === 'string' && date.startsWith(`${period}-`));
}

function planOverlapsPeriod(plan: ReportPlanSource, period: PlanReportPeriod) {
  if (period === 'all') return true;
  const firstDay = `${period}-01-01`;
  const lastDay = `${period}-12-31`;
  if (!validDate(plan.startDate) || !validDate(plan.endDate)) return false;
  return plan.startDate! <= lastDay && plan.endDate! >= firstDay;
}

function normalizeName(value: unknown) {
  return String(value || '').trim().toLocaleLowerCase('vi');
}

function sumKnown(values: Array<number | null | undefined>) {
  const known = values.filter((value): value is number => value !== null && value !== undefined && Number.isSafeInteger(value));
  if (!known.length) return null;
  const total = known.reduce((sum, value) => sum + value, 0);
  return Number.isSafeInteger(total) ? total : null;
}

export function availablePlanReportYears(plans: ReportPlanSource[], budgets: ReportBudgetSource[]) {
  const years = new Set<string>();
  for (const plan of plans) {
    const from = yearOf(plan.startDate);
    const to = yearOf(plan.endDate);
    if (from) years.add(from);
    if (to) years.add(to);
  }
  for (const budget of budgets) {
    const year = yearOf(budget.fiscalYear);
    if (year) years.add(year);
  }
  return [...years].sort((a, b) => Number(b) - Number(a));
}

export function buildPlanReportRows(
  plans: ReportPlanSource[],
  progress: ReportProgressSource[],
  budgets: ReportBudgetSource[],
  period: PlanReportPeriod,
): PlanReportRow[] {
  const periodPlans = plans.filter((plan) => planOverlapsPeriod(plan, period));
  const planNamesByDepartment = new Map<string, Set<string>>();
  const departments = new Set<string>();
  for (const plan of periodPlans) {
    const department = String(plan.department || '').trim() || 'Chưa ghi nhận đơn vị';
    departments.add(department);
    const names = planNamesByDepartment.get(department) || new Set<string>();
    const normalized = normalizeName(plan.name);
    if (normalized) names.add(normalized);
    planNamesByDepartment.set(department, names);
  }

  const periodBudgets = budgets.filter((budget) => {
    if (period === 'all') return true;
    return yearOf(budget.fiscalYear) === period;
  });
  for (const budget of periodBudgets) departments.add(String(budget.department || '').trim() || 'Chưa ghi nhận đơn vị');

  return [...departments].sort((a, b) => a.localeCompare(b, 'vi')).map((department) => {
    const departmentPlans = periodPlans.filter((plan) => (String(plan.department || '').trim() || 'Chưa ghi nhận đơn vị') === department);
    const departmentBudgets = periodBudgets.filter((budget) => (String(budget.department || '').trim() || 'Chưa ghi nhận đơn vị') === department);
    const managers = [...new Set(departmentPlans.map((plan) => String(plan.manager || '').trim()).filter(Boolean))];
    const planNames = planNamesByDepartment.get(department) || new Set<string>();
    const linkedProgress = progress.filter((item) => planNames.has(normalizeName(item.planName)) && belongsToPeriod(period, item.dueDate));
    const weighted = linkedProgress.filter((item) => {
      const score = Number(item.progressPercent);
      const weight = Number(item.weightPercent);
      return Number.isFinite(score) && score >= 0 && score <= 100 && Number.isFinite(weight) && weight > 0;
    });
    const progressWeight = weighted.reduce((sum, item) => sum + Number(item.weightPercent), 0);
    const progressScore = progressWeight
      ? Math.round(weighted.reduce((sum, item) => sum + Number(item.progressPercent) * Number(item.weightPercent), 0) / progressWeight)
      : null;
    const planBudget = sumKnown(departmentPlans.map((plan) => safeAmount(plan.budget)));
    const approvedBudget = departmentBudgets.length
      ? sumKnown(departmentBudgets.map((budget) => safeAmount(budget.allocatedBudget)))
      : planBudget;
    const actualSpent = departmentBudgets.length
      ? sumKnown(departmentBudgets.map((budget) => safeAmount(budget.actualSpent)))
      : null;
    const completedPlans = departmentPlans.filter((plan) => plan.status === 'Đã hoàn thành').length;
    const evaluation = !departmentPlans.length
      ? 'Chưa có kế hoạch'
      : completedPlans === departmentPlans.length
        ? 'Hoàn thành'
        : 'Đang triển khai';
    return {
      key: department,
      department,
      leader: managers.join(', ') || 'Chưa ghi nhận',
      totalPlans: departmentPlans.length,
      completedPlans,
      approvedBudget,
      actualSpent,
      variance: approvedBudget !== null && actualSpent !== null ? approvedBudget - actualSpent : null,
      progressScore,
      progressWeight,
      evaluation,
      projects: departmentPlans.map((plan) => ({
        code: String(plan.code || plan.key || ''),
        name: String(plan.name || ''),
        budget: safeAmount(plan.budget),
        status: String(plan.status || 'Chưa ghi trạng thái'),
      })),
    };
  });
}

export function planReportSummary(rows: PlanReportRow[]) {
  const progressRows = rows.filter((row) => row.progressScore !== null && row.progressWeight > 0);
  const progressWeight = progressRows.reduce((sum, row) => sum + row.progressWeight, 0);
  return {
    departmentCount: rows.length,
    totalPlans: rows.reduce((sum, row) => sum + row.totalPlans, 0),
    completedPlans: rows.reduce((sum, row) => sum + row.completedPlans, 0),
    approvedBudget: sumKnown(rows.map((row) => row.approvedBudget)),
    budgetDepartments: rows.filter((row) => row.approvedBudget !== null).length,
    actualSpent: sumKnown(rows.map((row) => row.actualSpent)),
    spendDepartments: rows.filter((row) => row.actualSpent !== null).length,
    variance: sumKnown(rows.map((row) => row.variance)),
    averageProgress: progressWeight
      ? Math.round(progressRows.reduce((sum, row) => sum + Number(row.progressScore) * row.progressWeight, 0) / progressWeight)
      : null,
  };
}

export function planReportExportRows(rows: PlanReportRow[], period: PlanReportPeriod) {
  return [
    ['Kỳ báo cáo', 'Đơn vị', 'Người phụ trách', 'Tổng kế hoạch', 'Đã hoàn thành', 'Ngân sách phê duyệt', 'Chi phí thực tế', 'Chênh lệch ngân sách', 'Tiến độ có trọng số', 'Tình trạng'],
    ...rows.map((row) => [period, row.department, row.leader, row.totalPlans, row.completedPlans, row.approvedBudget, row.actualSpent, row.variance, row.progressScore, row.evaluation]),
  ];
}

export function createPlanReportSnapshot(row: PlanReportRow, period: PlanReportPeriod, now = new Date()) {
  if (!row.department || !period) throw new Error('Thiếu kỳ báo cáo hoặc đơn vị.');
  return {
    ...row,
    key: `RPT-${now.getTime()}-${encodeURIComponent(row.department).slice(0, 60)}`,
    reportPeriod: period,
    generatedAt: now.toISOString(),
  };
}
