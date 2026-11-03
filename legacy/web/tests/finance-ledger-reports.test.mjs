import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateQuarterLedger, postedLedgerRecords, summarizeLedgerAccounts } from '../src/modules/finance/ledgerCalculations.ts';

test('accounting summaries include posted journal entries and omit entries awaiting review', () => {
  const records = [
    { status: 'Đã ghi sổ cái', amount: 80, lines: [{ account: '1111', debit: 80, credit: 0 }, { account: '5111', debit: 0, credit: 80 }] },
    { status: 'Chờ duyệt kế toán trưởng', amount: 20, lines: [{ account: '1111', debit: 20, credit: 0 }, { account: '5111', debit: 0, credit: 20 }] },
  ];

  const posted = postedLedgerRecords(records);
  assert.equal(posted.length, 1);
  assert.deepEqual(summarizeLedgerAccounts(posted), [
    { account: '1111', debit: 80, credit: 0 },
    { account: '5111', debit: 0, credit: 80 },
  ]);
});

test('quarterly accounting report uses fiscal dates and excludes pending or out-of-period entries', () => {
  const records = [
    { status: 'Đã ghi sổ cái', entryDate: '2026-07-01', amount: 80, lines: [{ account: '1111', debit: 80, credit: 0 }, { account: '5111', debit: 0, credit: 80 }] },
    { status: 'Chờ duyệt kế toán trưởng', entryDate: '2026-08-01', amount: 20, lines: [{ account: '1111', debit: 20, credit: 0 }, { account: '5111', debit: 0, credit: 20 }] },
    { status: 'Đã ghi sổ cái', entryDate: '2026-10-01', amount: 5, lines: [{ account: '1111', debit: 5, credit: 0 }, { account: '5111', debit: 0, credit: 5 }] },
  ];

  const quarter = calculateQuarterLedger(records, '2026-Q1', 7, 1);
  assert.equal(quarter.startDate, '2026-07-01');
  assert.equal(quarter.endDate, '2026-09-30');
  assert.equal(quarter.records.length, 1);
  assert.equal(quarter.debits, 80);
  assert.equal(quarter.credits, 80);
});
