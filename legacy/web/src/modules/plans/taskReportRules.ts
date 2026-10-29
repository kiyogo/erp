import type { EnterpriseTask } from '../../api/endpoints';

export type TaskReportKind = 'status' | 'assignee' | 'project' | 'created-month' | 'assigned-to-me' | 'my-created' | 'postponed' | 'related';
export type TaskReportRow = {
  label: string;
  count: number;
  percentage: number;
  averageProgress: number | null;
  details?: string;
};

type ReportTask = Pick<EnterpriseTask, 'status' | 'assignee' | 'assigneeId' | 'createdById' | 'projectName' | 'createdAt' | 'progress' | 'taskCode' | 'taskTitle' | 'dueDate' | 'dueDatePostponementCount' | 'dueDateHistory' | 'collaborators'>;

export const TASK_REPORT_OPTIONS: ReadonlyArray<{ value: TaskReportKind; label: string }> = [
  { value: 'status', label: 'Theo trạng thái' },
  { value: 'assignee', label: 'Theo người thực hiện' },
  { value: 'project', label: 'Theo dự án / đơn vị' },
  { value: 'created-month', label: 'Nhiệm vụ tạo theo tháng' },
  { value: 'assigned-to-me', label: 'Việc giao cho tôi' },
  { value: 'my-created', label: 'Việc tôi tạo' },
  { value: 'postponed', label: 'Tình hình lùi hạn công việc' },
  { value: 'related', label: 'Theo người liên quan' },
];

function reportLabel(task: ReportTask, kind: TaskReportKind): string {
  if (kind === 'status' || kind === 'assigned-to-me' || kind === 'my-created') return task.status?.trim() || 'Chưa cập nhật';
  if (kind === 'assignee') return task.assignee?.trim() || 'Chưa phân công';
  if (kind === 'project') return task.projectName?.trim() || 'Chưa thuộc dự án / đơn vị';
  if (kind === 'postponed') return `${task.taskCode} · ${task.taskTitle}`;

  const date = String(task.createdAt || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Không rõ ngày tạo';
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return 'Không rõ ngày tạo';
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function buildTaskReport<T extends ReportTask>(tasks: T[], kind: TaskReportKind, actorId?: string): TaskReportRow[] {
  if (kind === 'related') {
    const groups = new Map<string, { count: number; progressTotal: number; progressCount: number }>();
    let relationshipCount = 0;
    for (const task of tasks) {
      const uniqueCollaborators = new Map((task.collaborators || []).map(person => [person.id, person]));
      for (const collaborator of uniqueCollaborators.values()) {
        const label = `${collaborator.name} (${collaborator.employeeCode})`;
        const group = groups.get(label) || { count: 0, progressTotal: 0, progressCount: 0 };
        group.count += 1;
        relationshipCount += 1;
        const progress = Number(task.progress);
        if (Number.isFinite(progress)) {
          group.progressTotal += Math.min(100, Math.max(0, progress));
          group.progressCount += 1;
        }
        groups.set(label, group);
      }
    }
    return [...groups.entries()].map(([label, group]) => ({
      label,
      count: group.count,
      percentage: relationshipCount ? Math.round((group.count / relationshipCount) * 100) : 0,
      averageProgress: group.progressCount ? Math.round(group.progressTotal / group.progressCount) : null,
    })).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'vi'));
  }

  if (kind === 'postponed') {
    const postponedTasks = tasks
      .map(task => {
        const events = (task.dueDateHistory || []).filter(event => event.isPostponement);
        const count = Math.max(0, Number(task.dueDatePostponementCount) || events.length);
        return { task, events, count };
      })
      .filter(item => item.count > 0);
    const totalEvents = postponedTasks.reduce((sum, item) => sum + item.count, 0);
    return postponedTasks.map(({ task, events, count }) => ({
      label: reportLabel(task, kind),
      count,
      percentage: totalEvents ? Math.round((count / totalEvents) * 100) : 0,
      averageProgress: Number.isFinite(Number(task.progress)) ? Math.min(100, Math.max(0, Math.round(Number(task.progress)))) : null,
      details: events.length
        ? events.map(event => `${event.previousDueDate} → ${event.newDueDate} · ${event.actor} · ${event.changedAt}`).join('\n')
        : `Hạn hiện tại: ${task.dueDate}`,
    })).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'vi'));
  }

  const scopedTasks = kind === 'assigned-to-me'
    ? tasks.filter(task => Boolean(actorId) && task.assigneeId === actorId)
    : kind === 'my-created'
      ? tasks.filter(task => Boolean(actorId) && task.createdById === actorId)
      : tasks;
  const groupKind = kind === 'assigned-to-me' || kind === 'my-created' ? 'status' : kind;
  const groups = new Map<string, { count: number; progressTotal: number; progressCount: number }>();
  for (const task of scopedTasks) {
    const label = reportLabel(task, groupKind);
    const group = groups.get(label) || { count: 0, progressTotal: 0, progressCount: 0 };
    group.count += 1;
    const progress = Number(task.progress);
    if (Number.isFinite(progress)) {
      group.progressTotal += Math.min(100, Math.max(0, progress));
      group.progressCount += 1;
    }
    groups.set(label, group);
  }

  const total = scopedTasks.length;
  return [...groups.entries()]
    .map(([label, group]) => ({
      label,
      count: group.count,
      percentage: total ? Math.round((group.count / total) * 100) : 0,
      averageProgress: group.progressCount ? Math.round(group.progressTotal / group.progressCount) : null,
    }))
    .sort((left, right) => groupKind === 'created-month'
      ? left.label.localeCompare(right.label, 'vi')
      : right.count - left.count || left.label.localeCompare(right.label, 'vi'));
}

export function taskReportExportRows(kind: TaskReportKind, rows: TaskReportRow[]): Array<Array<string | number>> {
  const title = TASK_REPORT_OPTIONS.find(option => option.value === kind)?.label || 'Báo cáo nhiệm vụ';
  if (kind === 'postponed') {
    return [
      ['Báo cáo nhiệm vụ', title],
      ['Công việc', 'Số lần lùi hạn', 'Tỷ trọng lượt lùi (%)', 'Tiến độ hiện tại (%)', 'Lịch sử hạn'],
      ...rows.map(row => [row.label, row.count, row.percentage, row.averageProgress ?? '', row.details || '']),
    ];
  }
  return [
    ['Báo cáo nhiệm vụ', title],
    ['Nhóm', 'Số nhiệm vụ', 'Tỷ trọng (%)', 'Tiến độ trung bình (%)'],
    ...rows.map(row => [row.label, row.count, row.percentage, row.averageProgress ?? '']),
  ];
}
