import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTaskReport, taskReportExportRows } from '../src/modules/plans/taskReportRules.ts';

const sampleTasks = [
  { status: 'Đang thực hiện', assignee: 'An', projectName: 'ERP', createdAt: '2026-10-02T08:00:00Z', progress: 25 },
  { status: 'Hoàn thành', assignee: 'An', projectName: 'ERP', createdAt: '2026-10-09', progress: 100 },
  { status: 'Đang thực hiện', assignee: '', projectName: '', createdAt: 'ngày không hợp lệ', progress: 150 },
];

test('task reports aggregate by status, assignee, project, and valid creation month', () => {
  assert.deepEqual(buildTaskReport(sampleTasks, 'status'), [
    { label: 'Đang thực hiện', count: 2, percentage: 67, averageProgress: 63 },
    { label: 'Hoàn thành', count: 1, percentage: 33, averageProgress: 100 },
  ]);
  assert.equal(buildTaskReport(sampleTasks, 'assignee')[0].label, 'An');
  assert.equal(buildTaskReport(sampleTasks, 'project')[0].label, 'ERP');
  assert.deepEqual(buildTaskReport(sampleTasks, 'created-month').map(row => row.label), ['2026-10', 'Không rõ ngày tạo']);
});

test('task report leaves empty data empty and exports the displayed aggregates', () => {
  assert.deepEqual(buildTaskReport([], 'status'), []);
  assert.deepEqual(taskReportExportRows('status', buildTaskReport(sampleTasks, 'status'))[2], [
    'Đang thực hiện', 2, 67, 63,
  ]);
});
