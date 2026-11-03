import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLoanDebtReport, buildLoanDueReport, hasUniqueLoanContractCode, isValidLoanDateRange, loanDirectionOf } from '../src/modules/finance/loanRules.ts';

test('loan contract codes are unique case-insensitively but allow the edited record', () => {
  const loans = [{ key: '1', contractCode: 'KU-001' }];
  assert.equal(hasUniqueLoanContractCode(loans, 'ku-001'), false);
  assert.equal(hasUniqueLoanContractCode(loans, ' ku-001 ', '1'), true);
  assert.equal(hasUniqueLoanContractCode(loans, 'KU-002'), true);
});

test('loan due date cannot precede disbursement or contain an impossible date', () => {
  assert.equal(isValidLoanDateRange('2026-10-29', '2026-10-29'), true);
  assert.equal(isValidLoanDateRange('2026-10-29', '2026-10-28'), false);
  assert.equal(isValidLoanDateRange('2026-02-30', '2026-03-01'), false);
});

test('older loan records remain visible as borrow records while lend records stay separate', () => {
  assert.equal(loanDirectionOf({ loanType: 'Khế ước cho vay' }), 'lend');
  assert.equal(loanDirectionOf({}), 'borrow');
});

test('loan debt reports derive principal and settled interest from recorded events', () => {
  const loans = [{ key: 'loan-1', contractCode: 'L-1', principalAmount: 100000, dueDate: '2027-10-01' }];
  const events = [
    { loanKey: 'loan-1', eventType: 'disbursement', eventDate: '2026-01-01', principalAmount: 100000, interestAmount: 0 },
    { loanKey: 'loan-1', eventType: 'repayment', eventDate: '2026-02-01', principalAmount: 25000, interestAmount: 1250 },
  ];
  assert.deepEqual(buildLoanDebtReport(loans, events)[0], {
    contractCode: 'L-1', direction: 'Đi vay', counterparty: '', principalContracted: 100000,
    principalDrawn: 100000, principalRepaid: 25000, outstandingPrincipal: 75000, interestSettled: 1250, dueDate: '2027-10-01',
  });
});

test('loan due reports use schedule balances and leave unknown interest blank for legacy loans', () => {
  const loans = [
    { key: 'scheduled', contractCode: 'L-1', principalAmount: 100000, dueDate: '2027-10-01', loanSchedules: [{ key: 'period-1', dueDate: '2026-02-01', principalAmount: 25000, interestAmount: 1500 }] },
    { key: 'legacy', contractCode: 'L-2', principalAmount: 50000, dueDate: '2026-03-01' },
  ];
  const events = [
    { loanKey: 'scheduled', eventType: 'repayment', eventDate: '2026-02-01', scheduleKey: 'period-1', principalAmount: 10000, interestAmount: 500 },
    { loanKey: 'legacy', eventType: 'disbursement', eventDate: '2026-01-01', principalAmount: 50000, interestAmount: 0 },
    { loanKey: 'legacy', eventType: 'repayment', eventDate: '2026-02-01', principalAmount: 5000, interestAmount: 100 },
  ];
  assert.deepEqual(buildLoanDueReport(loans, events, '2026-04-01'), [
    { contractCode: 'L-1', direction: 'Trả nợ', counterparty: '', dueDate: '2026-02-01', principalDue: 15000, interestDue: 1000, status: 'Quá hạn' },
    { contractCode: 'L-2', direction: 'Trả nợ', counterparty: '', dueDate: '2026-03-01', principalDue: 45000, interestDue: null, status: 'Chưa lập lịch hợp đồng' },
  ]);
});
