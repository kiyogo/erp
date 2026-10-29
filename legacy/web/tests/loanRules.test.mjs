import test from 'node:test';
import assert from 'node:assert/strict';
import { hasUniqueLoanContractCode, isValidLoanDateRange, loanDirectionOf } from '../src/modules/finance/loanRules.ts';

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
