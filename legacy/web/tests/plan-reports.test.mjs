import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  availablePlanReportYears,
  buildPlanReportRows,
  createPlanReportSnapshot,
  planReportExportRows,
  planReportSummary,
} from '../src/modules/plans/planReportRules.ts';

const plans = [
  { key: 'p1', code: 'KH-1', name: 'Nâng cấp hệ thống', department: 'Công nghệ', manager: 'An', startDate: '2026-02-01', endDate: '2026-11-30', budget: 900, status: 'Đã hoàn thành' },
  { key: 'p2', code: 'KH-2', name: 'Triển khai CRM', department: 'Kinh doanh', manager: 'Bình', startDate: '2025-10-01', endDate: '2026-02-01', budget: 500, status: 'Đang triển khai' },
  { key: 'p3', code: 'KH-3', name: 'Mở rộng kho', department: 'Công nghệ', manager: 'An', startDate: '2025-01-01', endDate: '2025-12-31', budget: 100, status: 'Đang triển khai' },
];
const progress = [
  { key: 't1', planName: 'Nâng cấp hệ thống', dueDate: '2026-03-01', progressPercent: 80, weightPercent: 25 },
  { key: 't2', planName: 'Nâng cấp hệ thống', dueDate: '2026-04-01', progressPercent: 100, weightPercent: 75 },
  { key: 't3', planName: 'Triển khai CRM', dueDate: '2025-12-20', progressPercent: 50, weightPercent: 100 },
];
const budgets = [
  { key: 'b1', department: 'Công nghệ', fiscalYear: 'Năm 2026', allocatedBudget: 1000, actualSpent: 600 },
  { key: 'b2', department: 'Tài chính', fiscalYear: '2026', allocatedBudget: 500, actualSpent: 0 },
  { key: 'b3', department: 'Kinh doanh', fiscalYear: 'Năm 2025', allocatedBudget: 400, actualSpent: 250 },
];

test('report aggregation uses only actual records in the selected year', () => {
  const rows = buildPlanReportRows(plans, progress, budgets, '2026');
  assert.deepEqual(rows.map((row) => row.department), ['Công nghệ', 'Kinh doanh', 'Tài chính']);
  assert.deepEqual(rows[0], {
    key: 'Công nghệ', department: 'Công nghệ', leader: 'An', totalPlans: 1, completedPlans: 1,
    approvedBudget: 1000, actualSpent: 600, variance: 400, progressScore: 95, progressWeight: 100,
    evaluation: 'Hoàn thành',
    projects: [{ code: 'KH-1', name: 'Nâng cấp hệ thống', budget: 900, status: 'Đã hoàn thành' }],
  });
  assert.equal(rows[1].totalPlans, 1);
  assert.equal(rows[1].progressScore, null);
  assert.equal(rows[2].totalPlans, 0);
  assert.equal(rows[2].actualSpent, 0);
});

test('report aggregation exposes missing spend and progress instead of inventing zero values', () => {
  const rows = buildPlanReportRows([
    { code: 'KH-4', name: 'Kế hoạch khác', department: 'Vận hành', manager: 'Chi', startDate: '2026-01-01', endDate: '2026-12-31', budget: 0, status: 'Đã phê duyệt' },
  ], [], [], '2026');
  assert.equal(rows[0].approvedBudget, 0);
  assert.equal(rows[0].actualSpent, null);
  assert.equal(rows[0].variance, null);
  assert.equal(rows[0].progressScore, null);
  assert.equal(rows[0].evaluation, 'Đang triển khai');
});

test('report summaries preserve known zero values and keep empty metrics blank', () => {
  const rows = buildPlanReportRows(plans, progress, budgets, '2026');
  assert.deepEqual(planReportSummary(rows), {
    departmentCount: 3, totalPlans: 2, completedPlans: 1,
    approvedBudget: 2000, budgetDepartments: 3, actualSpent: 600, spendDepartments: 2,
    variance: 900, averageProgress: 95,
  });
  assert.deepEqual(planReportSummary([]), {
    departmentCount: 0, totalPlans: 0, completedPlans: 0,
    approvedBudget: null, budgetDepartments: 0, actualSpent: null, spendDepartments: 0,
    variance: null, averageProgress: null,
  });
});

test('report periods, exports and persisted snapshots use real selected records', () => {
  assert.deepEqual(availablePlanReportYears(plans, budgets), ['2026', '2025']);
  const row = buildPlanReportRows(plans, progress, budgets, '2026')[0];
  const rows = planReportExportRows([row], '2026');
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], '2026');
  assert.equal(rows[1][3], 1);
  const snapshot = createPlanReportSnapshot(row, '2026', new Date('2026-10-27T08:30:00.000Z'));
  assert.equal(snapshot.reportPeriod, '2026');
  assert.equal(snapshot.generatedAt, '2026-10-27T08:30:00.000Z');
  assert.equal(snapshot.actualSpent, 600);
});
