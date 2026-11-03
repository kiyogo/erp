import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTT132ToTT58BalancePreview } from '../tt58BalanceTransition.mjs';

test('TT132 closing balances map to TT58 books without losing account balances or hiding detail reconciliation', () => {
  const records = [
    { key: 'cash-1', voucherCode: 'TT132-1', entryDate: '2026-06-30', accountingRegime: 'TT132', status: 'Đã ghi sổ cái', amount: 100, lines: [{ account: '1111', debit: 100, credit: 0 }, { account: '4111', debit: 0, credit: 100 }] },
    { key: 'inventory-1', voucherCode: 'TT132-2', entryDate: '2026-06-28', accountingRegime: 'TT132', status: 'Đã ghi sổ cái', amount: 40, lines: [{ account: '1526', debit: 40, credit: 0 }, { account: '3318', debit: 0, credit: 40 }] },
    { key: 'tax-1', voucherCode: 'TT132-3', entryDate: '2026-06-29', accountingRegime: 'TT132', status: 'Đã ghi sổ cái', amount: 10, debitAccount: '91122', creditAccount: '33134' },
    { key: 'after-opening', voucherCode: 'TT132-4', entryDate: '2026-07-01', accountingRegime: 'TT132', status: 'Đã ghi sổ cái', amount: 25, debitAccount: '1111', creditAccount: '91111' },
    { key: 'draft', voucherCode: 'TT132-5', entryDate: '2026-06-20', accountingRegime: 'TT132', status: 'Chờ duyệt', amount: 90, debitAccount: '1111', creditAccount: '91111' },
    { key: 'other-regime', voucherCode: 'TT133-1', entryDate: '2026-06-20', accountingRegime: 'TT133', status: 'Đã ghi sổ cái', amount: 50, debitAccount: '111', creditAccount: '511' },
  ];
  const preview = buildTT132ToTT58BalancePreview(records, {
    openingDate: '2026-07-01', vatMethod: 'deduction', citMethod: 'taxable_income',
  });
  assert.equal(preview.sourceEntryCount, 3);
  assert.equal(preview.totalDebitCents, 15000);
  assert.equal(preview.totalCreditCents, 15000);
  assert.equal(preview.balanced, true);
  assert.deepEqual(preview.accounts.map(({ accountCode, debitBalanceCents, creditBalanceCents, targetBookCode, detailRequired }) => [accountCode, debitBalanceCents, creditBalanceCents, targetBookCode, detailRequired]), [
    ['1111', 10000, 0, 'S2d-DNSN', false],
    ['1526', 4000, 0, 'S2c-DNSN', true],
    ['3318', 0, 4000, 'S4a-DNSN', true],
    ['3311', 0, 0, null, false],
    ['4111', 0, 10000, 'S4d-DNSN', false],
    ['33134', 0, 1000, 'S2b-DNSN', false],
    ['91122', 1000, 0, null, false],
  ].filter(row => row[1] || row[2]));
});

test('TT132 closing balance preview selects the relevant tax book and rejects unbalanced source records', () => {
  const records = [{
    key: 'cit-1', voucherCode: 'TT132-CIT', entryDate: '2026-06-30', accountingRegime: 'TT132', status: 'Đã ghi sổ cái', amount: 12,
    debitAccount: '91122', creditAccount: '33134',
  }];
  const preview = buildTT132ToTT58BalancePreview(records, {
    openingDate: '2026-07-01', vatMethod: 'direct_revenue', citMethod: 'revenue_percentage',
  });
  assert.equal(preview.accounts.find(account => account.accountCode === '33134').targetBookCode, 'S1-DNSN');
  assert.throws(() => buildTT132ToTT58BalancePreview([{
    ...records[0], amount: 13, lines: [{ account: '91122', debit: 13, credit: 0 }, { account: '33134', debit: 0, credit: 12 }],
  }], { openingDate: '2026-07-01', vatMethod: 'deduction', citMethod: 'taxable_income' }), /không cân bằng/);
});
