import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/modules/finance/ledgerCalculations.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const ledger = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('ledger account summaries aggregate only actual debit and credit movements', () => {
  assert.deepEqual(ledger.summarizeLedgerAccounts([
    { debitAccount: 'TK 642', creditAccount: 'TK 334', amount: 1000 },
    { debitAccount: 'TK 642', creditAccount: 'TK 112', amount: 500 },
  ]), [
    { account: 'TK 642', debit: 1500, credit: 0 },
    { account: 'TK 334', debit: 0, credit: 1000 },
    { account: 'TK 112', debit: 0, credit: 500 },
  ]);
});

test('quarter results use posted records inside the chosen calendar quarter', () => {
  const result = ledger.calculateQuarterLedger([
    { entryDate: '2026-07-01', status: 'Đã ghi sổ cái', debitAccount: 'TK 632', creditAccount: 'TK 156', amount: 400 },
    { entryDate: '2026-09-30', status: 'Đã ghi sổ cái', debitAccount: 'TK 112', creditAccount: 'TK 511', amount: 1000 },
    { entryDate: '2026-10-01', status: 'Đã ghi sổ cái', debitAccount: 'TK 112', creditAccount: 'TK 511', amount: 2000 },
    { entryDate: '2026-08-01', status: 'Chờ duyệt kế toán trưởng', debitAccount: 'TK 112', creditAccount: 'TK 511', amount: 3000 },
  ], '2026-Q3');
  assert.equal(result.records.length, 2);
  assert.equal(result.revenue, 1000);
  assert.equal(result.expenses, 400);
  assert.equal(result.netResult, 600);
  assert.equal(result.debits, 1400);
  assert.equal(result.credits, 1400);
});

test('quarter closing lines clear income and expense balances and transfer the actual result once', () => {
  const summary = ledger.calculateQuarterLedger([
    { entryDate: '2026-08-01', status: 'Đã ghi sổ cái', debitAccount: 'TK 112', creditAccount: 'TK 511', amount: 1000 },
    { entryDate: '2026-08-02', status: 'Đã ghi sổ cái', debitAccount: 'TK 642', creditAccount: 'TK 112', amount: 400 },
  ], '2026-Q3');
  const lines = ledger.buildQuarterClosingLines(summary);
  assert.deepEqual(lines.map(({ debitAccount, creditAccount, amount }) => [debitAccount, creditAccount, amount]), [
    ['TK 511', 'TK 911', 1000],
    ['TK 911', 'TK 642', 400],
    ['TK 911', 'TK 4212', 600],
  ]);
  assert.equal(lines.reduce((sum, line) => sum + line.amount, 0), 2000);
});

test('fiscal quarters follow the configured non-calendar year start', () => {
  assert.equal(ledger.getFiscalQuarterPeriod(new Date('2026-10-01T12:00:00Z'), 10, 1), '2026-Q1');
  assert.equal(ledger.getFiscalQuarterPeriod(new Date('2027-01-01T12:00:00Z'), 10, 1), '2026-Q2');
  const result = ledger.calculateQuarterLedger([
    { entryDate: '2026-09-30', status: 'Đã ghi sổ cái', debitAccount: 'TK 112', creditAccount: 'TK 511', amount: 99 },
    { entryDate: '2026-10-01', status: 'Đã ghi sổ cái', debitAccount: 'TK 112', creditAccount: 'TK 511', amount: 100 },
    { entryDate: '2026-12-31', status: 'Đã ghi sổ cái', debitAccount: 'TK 112', creditAccount: 'TK 511', amount: 200 },
    { entryDate: '2027-01-01', status: 'Đã ghi sổ cái', debitAccount: 'TK 112', creditAccount: 'TK 511', amount: 300 },
  ], '2026-Q1', 10, 1);
  assert.equal(result.startDate, '2026-10-01');
  assert.equal(result.endDate, '2026-12-31');
  assert.deepEqual(result.records.map(record => record.amount), [100, 200]);
});
