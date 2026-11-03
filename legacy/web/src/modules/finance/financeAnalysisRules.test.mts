import test from 'node:test';
import assert from 'node:assert/strict';
import { quarterOptionsForFiscalYear, summarizeAnalysisPeriod, summarizeBudgetComparison, summarizeOutstandingDocuments } from './financeAnalysisRules.ts';

test('financial analysis orders fiscal quarters across year boundaries', () => {
  assert.deepEqual(quarterOptionsForFiscalYear('2026-Q1', 4), ['2025-Q2', '2025-Q3', '2025-Q4', '2026-Q1']);
  assert.deepEqual(quarterOptionsForFiscalYear('invalid'), []);
});

test('accounting result comes from posted ledger while cash flow comes from completed cash vouchers', () => {
  const result = summarizeAnalysisPeriod([
    { entryDate: '2026-01-05', status: 'Đã ghi sổ cái', lines: [
      { account: 'TK 511', debit: 0, credit: 1_000 },
      { account: 'TK 632', debit: 400, credit: 0 },
    ] },
    { entryDate: '2026-01-06', status: 'Chờ duyệt kế toán trưởng', lines: [{ account: 'TK 511', debit: 0, credit: 700 }] },
  ], [
    { date: '2026-01-05', type: 'Thu', amount: 250, status: 'Đã hoàn thành' },
    { date: '2026-01-06', type: 'Chi', amount: 40, status: 'Đã hoàn thành' },
    { date: '2026-01-07', type: 'Thu', amount: 900, status: 'Đã hủy' },
  ], { startDate: '2026-01-01', endExclusive: '2026-04-01' });

  assert.equal(result.revenue, 1_000);
  assert.equal(result.expenses, 400);
  assert.equal(result.profit, 600);
  assert.equal(result.netMargin, 0.6);
  assert.equal(result.cashIn, 250);
  assert.equal(result.cashOut, 40);
  assert.equal(result.netCash, 210);
});

test('analysis leaves profitability unavailable when source accounts or revenue are missing', () => {
  const noAccounts = summarizeAnalysisPeriod([], [], { startDate: '2026-01-01', endExclusive: '2026-04-01' });
  assert.equal(noAccounts.revenue, null);
  assert.equal(noAccounts.expenses, null);
  assert.equal(noAccounts.profit, null);
  assert.equal(noAccounts.netMargin, null);

  const noRevenue = summarizeAnalysisPeriod([
    { entryDate: '2026-01-05', status: 'Đã ghi sổ cái', lines: [{ account: 'TK 642', debit: 10, credit: 0 }] },
  ], [], { startDate: '2026-01-01', endExclusive: '2026-04-01' });
  assert.equal(noRevenue.netMargin, null);
});

test('receivables and payables use remaining balances and keep overdue status explicit', () => {
  const result = summarizeOutstandingDocuments([
    { documentType: 'sale', subtype: 'Đầu ra', partnerName: 'A', remainingAmount: 100, dueDate: '2026-01-10', status: 'Chưa thanh toán' },
    { documentType: 'purchase', subtype: 'Đầu vào', partnerName: 'B', remainingAmount: 50, dueDate: '2026-02-01', status: 'Chưa thanh toán' },
    { documentType: 'sale', subtype: 'Đầu ra', partnerName: 'C', remainingAmount: 900, dueDate: '2026-01-01', status: 'Đã hủy' },
  ], '2026-01-20');

  assert.equal(result.receivable, 100);
  assert.equal(result.overdueReceivable, 100);
  assert.equal(result.payable, 50);
  assert.equal(result.overduePayable, 0);
  assert.deepEqual(result.receivablesByPartner, [{ partner: 'A', amount: 100, overdue: 100, count: 1 }]);
});

test('budget analysis compares saved allocations with saved actuals by fiscal year and department', () => {
  const result = summarizeBudgetComparison([
    { fiscalYear: 'Năm 2026', department: 'Kinh doanh', allocatedBudget: 1_000, actualSpent: 700 },
    { fiscalYear: 2026, department: 'Kinh doanh', allocatedBudget: 500, actualSpent: 600 },
    { fiscalYear: 2025, department: 'Kinh doanh', allocatedBudget: 900, actualSpent: 400 },
    { fiscalYear: 2026, department: 'Sai dữ liệu', allocatedBudget: 1.5, actualSpent: 1 },
  ], '2026');

  assert.equal(result.recordCount, 2);
  assert.equal(result.allocated, 1_500);
  assert.equal(result.actualSpent, 1_300);
  assert.equal(result.variance, 200);
  assert.deepEqual(result.byDepartment, [{ department: 'Kinh doanh', allocated: 1_500, actualSpent: 1_300 }]);
});
