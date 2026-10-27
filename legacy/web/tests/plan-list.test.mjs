import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStrategicPlan, strategicPlanCompletionRate, strategicPlanExportRows } from '../src/modules/plans/planListRules.ts';

const values = {
  code: 'KH-2026-001', name: 'Mở rộng chi nhánh', department: 'Kinh doanh', manager: 'Lê An',
  startDate: '2026-10-01', endDate: '2026-12-31', budget: 0, priority: 'Trọng điểm cấp 2',
};

test('plan creation validates real inputs and preserves a zero budget', () => {
  assert.deepEqual(createStrategicPlan(values, []), { ...values, key: values.code, status: 'Đang triển khai' });
});

test('plan creation rejects duplicate codes, impossible dates and invalid budgets', () => {
  assert.throws(() => createStrategicPlan(values, [{ ...values, key: values.code, status: 'Đang triển khai' }]), /Mã kế hoạch/);
  assert.throws(() => createStrategicPlan({ ...values, startDate: '2026-02-30' }, []), /Ngày bắt đầu/);
  assert.throws(() => createStrategicPlan({ ...values, endDate: '2026-09-30' }, []), /Ngày bắt đầu/);
  assert.throws(() => createStrategicPlan({ ...values, budget: -1 }, []), /Ngân sách/);
  assert.throws(() => createStrategicPlan({ ...values, budget: 1.5 }, []), /Ngân sách/);
});

test('plan completion percentage uses saved statuses and stays blank for an empty list', () => {
  assert.equal(strategicPlanCompletionRate([]), null);
  assert.equal(strategicPlanCompletionRate([
    { ...values, key: 'a', status: 'Đã hoàn thành' },
    { ...values, key: 'b', status: 'Đang triển khai' },
  ]), 50);
});

test('plan workbook contains the selected plan records and actual budget values', () => {
  const plan = { ...createStrategicPlan(values, []), status: 'Đã phê duyệt' };
  const rows = strategicPlanExportRows([plan]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'KH-2026-001');
  assert.equal(rows[1][6], 0);
  assert.equal(rows[1][8], 'Đã phê duyệt');
  assert.equal(strategicPlanExportRows([]).length, 1);
});
