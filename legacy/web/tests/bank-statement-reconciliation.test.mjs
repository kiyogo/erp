import test from 'node:test';
import assert from 'node:assert/strict';
import { getActiveBankStatementMatches, getBankStatementMatchCandidates, summarizeBankStatementReconciliation } from '../src/modules/finance/bankStatementReconciliation.ts';

const statement = {
  key: 'statement-1', bankAccountId: 'bank-1', fileHash: 'hash', fileName: 'statement.csv', currency: 'VND',
  lines: [], importedAt: '', importedBy: '', status: 'Đã nhập · chưa đối soát',
};
const line = {
  key: 'line-1', rowNumber: 2, transactionDate: '2026-11-02', valueDate: '', direction: 'Chi', amount: 250000,
  description: 'Thanh toán', counterparty: '', counterpartyAccount: '', reference: 'REF-1', transactionId: '', currency: 'VND', duplicate: false,
};

test('bank statement match history derives the active match and preserves classification after unmatch', () => {
  const events = [
    { key: 'event-1', eventSequence: 1, action: 'match', statementKey: 'statement-1', bankAccountId: 'bank-1', lineKey: 'line-1', cashTransactionId: 'cash-1', cashTransactionCode: 'PC-1', createdAt: '', createdBy: 'A' },
    { key: 'event-2', eventSequence: 2, action: 'classify', statementKey: 'statement-1', bankAccountId: 'bank-1', lineKey: 'line-1', classification: 'Thanh toán nhà cung cấp', createdAt: '', createdBy: 'A' },
    { key: 'event-3', eventSequence: 3, action: 'unmatch', statementKey: 'statement-1', bankAccountId: 'bank-1', lineKey: 'line-1', reversesMatchKey: 'event-1', createdAt: '', createdBy: 'A' },
  ];
  const state = getActiveBankStatementMatches(events);

  assert.equal(state.activeByLine.has('statement-1|line-1'), false);
  assert.equal(state.activeByTransaction.has('cash-1'), false);
  assert.equal(state.classifications.get('statement-1|line-1'), 'Thanh toán nhà cung cấp');
});

test('match candidates require a posted voucher with exact account, direction, amount and currency', () => {
  const makeTransaction = (key, changes = {}) => ({
    key, code: key, type: 'Chi', source: 'bank', category: 'Thanh toán', amount: 250000, date: '2026-11-02',
    recipientOrPayer: '', account: '', status: 'Đã hoàn thành', note: '', createdAt: '', updatedAt: '',
    sourceAccountId: 'bank-1', currency: 'VND', ...changes,
  });
  const transactions = [
    makeTransaction('exact'),
    makeTransaction('wrong-account', { sourceAccountId: 'bank-2' }),
    makeTransaction('wrong-amount', { amount: 250001 }),
    makeTransaction('wrong-direction', { type: 'Thu' }),
    makeTransaction('pending', { status: 'Chờ duyệt' }),
  ];
  const events = [{ key: 'active-match', eventSequence: 1, action: 'match', statementKey: 'another', bankAccountId: 'bank-1', lineKey: 'line-2', cashTransactionId: 'already-used', createdAt: '', createdBy: 'A' }];

  assert.deepEqual(getBankStatementMatchCandidates(line, statement, transactions, events).map((item) => item.key), ['exact']);
  assert.equal(getBankStatementMatchCandidates(line, statement, [makeTransaction('already-used')], events).length, 0);
});

test('legacy bank vouchers without a stored account id resolve only through an unambiguous account label', () => {
  const account = { key: 'bank-1', bankName: 'VCB', accountNumber: '001234', accountHolder: 'Company', branch: '', balance: 0, status: 'Đang hoạt động', createdAt: '', updatedAt: '' };
  const legacyVoucher = {
    key: 'legacy', code: 'PC-OLD', type: 'Chi', source: 'bank', category: '', amount: 250000, date: '2026-11-02',
    recipientOrPayer: '', account: 'VCB (001234)', status: 'Đã hoàn thành', note: '', createdAt: '', updatedAt: '', sourceAccountId: '', currency: 'VND',
  };
  assert.equal(getBankStatementMatchCandidates(line, statement, [legacyVoucher], [], [account]).length, 1);
  const ambiguousNameVoucher = { ...legacyVoucher, key: 'legacy-name', account: 'VCB' };
  const sameNameAccounts = [account, { ...account, key: 'bank-2', accountNumber: '009999' }];
  assert.equal(getBankStatementMatchCandidates(line, statement, [legacyVoucher], [], sameNameAccounts).length, 1);
  assert.equal(getBankStatementMatchCandidates(line, statement, [ambiguousNameVoucher], [], sameNameAccounts).length, 0);
});

test('statement is reconciled only when posted vouchers and opening-to-closing balance both agree', () => {
  const account = { key: 'bank-1', bankName: 'VCB', accountNumber: '001234', accountHolder: 'Company', branch: '', balance: 150, status: 'Đang hoạt động', createdAt: '', updatedAt: '' };
  const statementLine = { ...line, direction: 'Thu', amount: 50 };
  const statementRecord = { ...statement, openingBalance: 100, closingBalance: 150, lines: [statementLine] };
  const transaction = { key: 'cash-1', code: 'PT-1', type: 'Thu', source: 'bank', category: '', amount: 50, date: line.transactionDate, recipientOrPayer: '', account: '001234', status: 'Đã hoàn thành', note: '', createdAt: '', updatedAt: '', sourceAccountId: 'bank-1', currency: 'VND' };
  const match = { key: 'match-1', eventSequence: 1, action: 'match', statementKey: 'statement-1', bankAccountId: 'bank-1', lineKey: 'line-1', cashTransactionId: 'cash-1', cashTransactionCode: 'PT-1', createdAt: '', createdBy: 'A' };

  const summary = summarizeBankStatementReconciliation(statementRecord, [transaction], [match], [account]);
  assert.equal(summary.matchedLineCount, 1);
  assert.equal(summary.unmatchedLineCount, 0);
  assert.equal(summary.balanceDifference, 0);
  assert.equal(summary.status, 'Đã đối soát');
  assert.equal(summary.reconciled, true);
});

test('classification alone does not complete reconciliation and legacy vouchers are included as outstanding', () => {
  const account = { key: 'bank-1', bankName: 'VCB', accountNumber: '001234', accountHolder: 'Company', branch: '', balance: 0, status: 'Đang hoạt động', createdAt: '', updatedAt: '' };
  const statementRecord = { ...statement, lines: [line] };
  const legacyVoucher = { key: 'legacy', code: 'PC-OLD', type: 'Chi', source: 'bank', category: '', amount: 250000, date: line.transactionDate, recipientOrPayer: '', account: 'VCB (001234)', status: 'Đã hoàn thành', note: '', createdAt: '', updatedAt: '', sourceAccountId: '', currency: 'VND' };
  const classification = { key: 'class-1', eventSequence: 1, action: 'classify', statementKey: 'statement-1', bankAccountId: 'bank-1', lineKey: 'line-1', classification: 'Thanh toán nhà cung cấp', createdAt: '', createdBy: 'A' };

  const summary = summarizeBankStatementReconciliation(statementRecord, [legacyVoucher], [classification], [account]);
  assert.equal(summary.classifiedUnmatchedCount, 1);
  assert.equal(summary.unmatchedLineCount, 1);
  assert.equal(summary.outstandingVoucherCount, 1);
  assert.equal(summary.status, 'Còn giao dịch chưa khớp');
});

test('balance mismatch and missing opening or closing balances are not reported as fully reconciled', () => {
  const statementRecord = { ...statement, openingBalance: 100, closingBalance: 149, lines: [{ ...line, direction: 'Thu', amount: 50 }] };
  const transaction = { key: 'cash-1', code: 'PT-1', type: 'Thu', source: 'bank', category: '', amount: 50, date: line.transactionDate, recipientOrPayer: '', account: '001234', status: 'Đã hoàn thành', note: '', createdAt: '', updatedAt: '', sourceAccountId: 'bank-1', currency: 'VND' };
  const match = { key: 'match-1', eventSequence: 1, action: 'match', statementKey: 'statement-1', bankAccountId: 'bank-1', lineKey: 'line-1', cashTransactionId: 'cash-1', cashTransactionCode: 'PT-1', createdAt: '', createdBy: 'A' };
  const withMismatch = summarizeBankStatementReconciliation(statementRecord, [transaction], [match]);
  assert.equal(withMismatch.balanceDifference, 1);
  assert.equal(withMismatch.status, 'Lệch số dư sao kê');

  const withoutBalances = summarizeBankStatementReconciliation({ ...statementRecord, openingBalance: undefined, closingBalance: undefined }, [transaction], [match]);
  assert.equal(withoutBalances.balanceDifference, null);
  assert.equal(withoutBalances.status, 'Đã khớp chứng từ · thiếu số dư');
  assert.equal(withoutBalances.reconciled, false);
});

test('a voucher matched to another statement remains outstanding for this statement', () => {
  const transaction = { key: 'cash-1', code: 'PT-1', type: 'Chi', source: 'bank', category: '', amount: 250000, date: line.transactionDate, recipientOrPayer: '', account: '001234', status: 'Đã hoàn thành', note: '', createdAt: '', updatedAt: '', sourceAccountId: 'bank-1', currency: 'VND' };
  const otherStatementMatch = { key: 'match-other', eventSequence: 1, action: 'match', statementKey: 'statement-other', bankAccountId: 'bank-1', lineKey: 'line-other', cashTransactionId: 'cash-1', cashTransactionCode: 'PT-1', createdAt: '', createdBy: 'A' };
  const summary = summarizeBankStatementReconciliation({ ...statement, lines: [line] }, [transaction], [otherStatementMatch]);

  assert.equal(summary.outstandingVoucherCount, 1);
  assert.equal(summary.status, 'Còn giao dịch chưa khớp');
});
