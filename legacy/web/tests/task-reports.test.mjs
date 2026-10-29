import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTaskReport, taskReportExportRows } from '../src/modules/plans/taskReportRules.ts';

const sampleTasks = [
  { taskCode: 'TASK-1', taskTitle: 'Cập nhật kế hoạch', dueDate: '2026-10-31', dueDatePostponementCount: 1, dueDateHistory: [{ previousDueDate: '2026-10-10', newDueDate: '2026-10-20', changedAt: '2026-10-09T08:00:00.000Z', actor: 'Admin', isPostponement: true }, { previousDueDate: '2026-10-20', newDueDate: '2026-10-15', changedAt: '2026-10-09T09:00:00.000Z', actor: 'Admin', isPostponement: false }], status: 'Đang thực hiện', assignee: 'An', assigneeId: 'viewer', createdById: 'other', projectName: 'ERP', createdAt: '2026-10-02T08:00:00Z', progress: 25 },
  { taskCode: 'TASK-2', taskTitle: 'Đối chiếu', dueDate: '2026-10-28', dueDatePostponementCount: 0, dueDateHistory: [], status: 'Hoàn thành', assignee: 'An', assigneeId: 'other', createdById: 'viewer', projectName: 'ERP', createdAt: '2026-10-09', progress: 100 },
  { taskCode: 'TASK-3', taskTitle: 'Nhiệm vụ thiếu ngày', dueDate: '', dueDatePostponementCount: 0, dueDateHistory: [], status: 'Đang thực hiện', assignee: '', assigneeId: 'other', createdById: 'viewer', projectName: '', createdAt: 'ngày không hợp lệ', progress: 150 },
];

test('task reports aggregate by status, assignee, project, and valid creation month', () => {
  assert.deepEqual(buildTaskReport(sampleTasks, 'status'), [
    { label: 'Đang thực hiện', count: 2, percentage: 67, averageProgress: 63 },
    { label: 'Hoàn thành', count: 1, percentage: 33, averageProgress: 100 },
  ]);
  assert.equal(buildTaskReport(sampleTasks, 'assignee')[0].label, 'An');
  assert.equal(buildTaskReport(sampleTasks, 'project')[0].label, 'ERP');
  assert.deepEqual(buildTaskReport(sampleTasks, 'created-month').map(row => row.label), ['2026-10', 'Không rõ ngày tạo']);
  assert.deepEqual(buildTaskReport(sampleTasks, 'assigned-to-me', 'viewer'), [
    { label: 'Đang thực hiện', count: 1, percentage: 100, averageProgress: 25 },
  ]);
  assert.deepEqual(buildTaskReport(sampleTasks, 'my-created', 'viewer'), [
    { label: 'Đang thực hiện', count: 1, percentage: 50, averageProgress: 100 },
    { label: 'Hoàn thành', count: 1, percentage: 50, averageProgress: 100 },
  ]);
  assert.deepEqual(buildTaskReport(sampleTasks, 'my-created'), []);
  assert.deepEqual(buildTaskReport(sampleTasks, 'postponed'), [{
    label: 'TASK-1 · Cập nhật kế hoạch', count: 1, percentage: 100, averageProgress: 25,
    details: '2026-10-10 → 2026-10-20 · Admin · 2026-10-09T08:00:00.000Z',
  }]);
});

test('task report leaves empty data empty and exports the displayed aggregates', () => {
  assert.deepEqual(buildTaskReport([], 'status'), []);
  assert.deepEqual(taskReportExportRows('status', buildTaskReport(sampleTasks, 'status'))[2], [
    'Đang thực hiện', 2, 67, 63,
  ]);
  assert.deepEqual(taskReportExportRows('postponed', buildTaskReport(sampleTasks, 'postponed'))[2], [
    'TASK-1 · Cập nhật kế hoạch', 1, 100, 25, '2026-10-10 → 2026-10-20 · Admin · 2026-10-09T08:00:00.000Z',
  ]);
});

test('related-person report counts each collaborator once and reports shared task progress', () => {
  const tasks = [
    { ...sampleTasks[0], collaborators: [
      { id: 'user-a', name: 'An', employeeCode: 'NV-001' },
      { id: 'user-a', name: 'An', employeeCode: 'NV-001' },
      { id: 'user-b', name: 'Bình', employeeCode: 'NV-002' },
    ] },
    { ...sampleTasks[1], collaborators: [{ id: 'user-a', name: 'An', employeeCode: 'NV-001' }] },
  ];
  assert.deepEqual(buildTaskReport(tasks, 'related'), [
    { label: 'An (NV-001)', count: 2, percentage: 67, averageProgress: 63 },
    { label: 'Bình (NV-002)', count: 1, percentage: 33, averageProgress: 25 },
  ]);
  assert.deepEqual(taskReportExportRows('related', buildTaskReport(tasks, 'related'))[2], ['An (NV-001)', 2, 67, 63]);
});
