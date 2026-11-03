import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postedLedgerRecords, summarizeLedgerAccounts } from '../src/modules/finance/ledgerCalculations.ts';

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
