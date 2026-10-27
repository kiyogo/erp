import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysUntilDueDate, planProgressExportRows, planProgressMetrics, planProgressStatus, updatePlanProgress } from '../src/modules/plans/planProgressRules.ts';

const now = new Date('2026-10-27T12:00:00.000Z');
const record = {
  key: 'task-1', code: 'CV-001', planName: 'Kế hoạch A', taskTitle: 'Hoàn thiện hạng mục',
  assignee: 'Lê An', dueDate: '2026-10-26', daysRemaining: 99, progressPercent: 40, weightPercent: 75, status: 'Đúng tiến độ',
};

test('plan progress status and remaining days derive from a valid calendar deadline', () => {
  assert.equal(daysUntilDueDate('2026-10-26', now), -1);
  assert.equal(daysUntilDueDate('2026-10-28', now), 1);
  assert.equal(daysUntilDueDate('2026-02-30', now), null);
  assert.equal(planProgressStatus(40, record.dueDate, now), 'Chậm tiến độ');
  assert.equal(planProgressStatus(100, record.dueDate, now), 'Hoàn thành');
});

test('weighted plan progress and overdue metrics use saved task values', () => {
  assert.deepEqual(planProgressMetrics([], now), { averageProgress: null, completedCount: 0, runningCount: 0, overdueCount: 0 });
  assert.deepEqual(planProgressMetrics([
    record,
    { ...record, key: 'task-2', dueDate: '2026-11-01', progressPercent: 100, weightPercent: 25 },
  ], now), { averageProgress: 55, completedCount: 1, runningCount: 1, overdueCount: 1 });
});

test('progress updates preserve zero and reject fractional or out-of-range values', () => {
  const updated = updatePlanProgress(record, 0, now);
  assert.equal(updated.progressPercent, 0);
  assert.equal(updated.status, 'Chậm tiến độ');
  assert.equal(updated.daysRemaining, -1);
  assert.throws(() => updatePlanProgress(record, 25.5, now));
  assert.throws(() => updatePlanProgress(record, 101, now));
});

test('progress workbook export contains actual records and calculated deadline fields', () => {
  const rows = planProgressExportRows([record], now);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'CV-001');
  assert.equal(rows[1][5], -1);
  assert.equal(rows[1][8], 'Chậm tiến độ');
  assert.equal(planProgressExportRows([], now).length, 1);
});
