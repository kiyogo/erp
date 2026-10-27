import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completePlanMilestone, createPlanMilestone, planMilestoneExportRows, planMilestoneMetrics, quarterForDate } from '../src/modules/plans/planMilestoneRules.ts';

const values = {
  code: 'MLS-2026-001', quarter: 'Q4/2026', name: 'Hoàn thiện hệ thống',
  acceptanceCriteria: 'Đạt tiêu chuẩn chạy thử', owner: 'Lê An', deadline: '2026-12-31',
};

test('milestone creation derives a unique key and starts as not started', () => {
  assert.deepEqual(createPlanMilestone(values, []), {
    ...values, key: values.code, progress: 0, status: 'Chưa bắt đầu',
  });
  assert.equal(quarterForDate('2026-10-01'), 'Q4/2026');
  assert.equal(quarterForDate('2026-02-30'), null);
});

test('milestone creation rejects duplicate codes and quarters that do not match deadline', () => {
  const existing = [{ ...values, key: values.code, progress: 0, status: 'Chưa bắt đầu' }];
  assert.throws(() => createPlanMilestone(values, existing), /Mã mốc/);
  assert.throws(() => createPlanMilestone({ ...values, quarter: 'Q3/2026' }, []), /Kỳ quý/);
  assert.throws(() => createPlanMilestone({ ...values, deadline: 'invalid-date' }, []), /Kỳ quý/);
});

test('milestone completion and metrics use persisted statuses and actual deadlines', () => {
  const late = { ...createPlanMilestone({ ...values, deadline: '2026-10-01' }, []), status: 'Đang thực hiện' };
  const done = completePlanMilestone(late);
  assert.equal(done.progress, 100);
  assert.equal(done.status, 'Đã đạt mốc');
  assert.deepEqual(planMilestoneMetrics([late, createPlanMilestone(values, [])], new Date('2026-10-27T12:00:00')), {
    totalCount: 2, completedCount: 0, pendingCount: 2, completionRate: 0, overdueCount: 1,
  });
  assert.equal(planMilestoneMetrics([], new Date('2026-10-27T12:00:00')).completionRate, null);
});

test('milestone report contains the actual filtered record values', () => {
  const record = createPlanMilestone(values, []);
  const rows = planMilestoneExportRows([record]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], values.code);
  assert.equal(rows[1][6], 0);
  assert.equal(rows[1][7], 'Chưa bắt đầu');
  assert.equal(planMilestoneExportRows([]).length, 1);
});
