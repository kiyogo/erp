import type { EnterpriseTask } from '../../api/endpoints';

export type TaskReportKind = 'status' | 'assignee' | 'project' | 'created-month';
export type TaskReportRow = {
  label: string;
  count: number;
  percentage: number;
  averageProgress: number | null;
};

type ReportTask = Pick<EnterpriseTask, 'status' | 'assignee' | 'projectName' | 'createdAt' | 'progress'>;

export const TASK_REPORT_OPTIONS: ReadonlyArray<{ value: TaskReportKind; label: string }> = [
  { value: 'status', label: 'Theo trạng thái' },
  { value: 'assignee', label: 'Theo người thực hiện' },
  { value: 'project', label: 'Theo dự án / đơn vị' },
  { value: 'created-month', label: 'Nhiệm vụ tạo theo tháng' },
];

function reportLabel(task: ReportTask, kind: TaskReportKind): string {
  if (kind === 'status') return task.status?.trim() || 'Chưa cập nhật';
  if (kind === 'assignee') return task.assignee?.trim() || 'Chưa phân công';
  if (kind === 'project') return task.projectName?.trim() || 'Chưa thuộc dự án / đơn vị';

  const date = String(task.createdAt || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Không rõ ngày tạo';
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return 'Không rõ ngày tạo';
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function buildTaskReport<T extends ReportTask>(tasks: T[], kind: TaskReportKind): TaskReportRow[] {
  const groups = new Map<string, { count: number; progressTotal: number; progressCount: number }>();
  for (const task of tasks) {
    const label = reportLabel(task, kind);
    const group = groups.get(label) || { count: 0, progressTotal: 0, progressCount: 0 };
    group.count += 1;
    const progress = Number(task.progress);
    if (Number.isFinite(progress)) {
      group.progressTotal += Math.min(100, Math.max(0, progress));
      group.progressCount += 1;
    }
    groups.set(label, group);
  }

  const total = tasks.length;
  return [...groups.entries()]
    .map(([label, group]) => ({
      label,
      count: group.count,
      percentage: total ? Math.round((group.count / total) * 100) : 0,
      averageProgress: group.progressCount ? Math.round(group.progressTotal / group.progressCount) : null,
    }))
    .sort((left, right) => kind === 'created-month'
      ? left.label.localeCompare(right.label, 'vi')
      : right.count - left.count || left.label.localeCompare(right.label, 'vi'));
}

export function taskReportExportRows(kind: TaskReportKind, rows: TaskReportRow[]): Array<Array<string | number>> {
  const title = TASK_REPORT_OPTIONS.find(option => option.value === kind)?.label || 'Báo cáo nhiệm vụ';
  return [
    ['Báo cáo nhiệm vụ', title],
    ['Nhóm', 'Số nhiệm vụ', 'Tỷ trọng (%)', 'Tiến độ trung bình (%)'],
    ...rows.map(row => [row.label, row.count, row.percentage, row.averageProgress ?? '']),
  ];
}
