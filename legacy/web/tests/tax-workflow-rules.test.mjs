import assert from 'node:assert/strict';
import test from 'node:test';
import { hasOpenTaxPayment, isValidTaxPaymentAmount, validateTaxFiling } from '../src/modules/finance/taxWorkflowRules.ts';

test('tax payment amount is positive, safe and cannot exceed the outstanding balance', () => {
  assert.equal(isValidTaxPaymentAmount(0, 500), false);
  assert.equal(isValidTaxPaymentAmount(501, 500), false);
  assert.equal(isValidTaxPaymentAmount(250, 500), true);
  assert.equal(isValidTaxPaymentAmount(1.5, 500), false);
  assert.equal(isValidTaxPaymentAmount(Number.MAX_SAFE_INTEGER + 1, 500), false);
});

test('tax filing creation requires a unique code and a real calendar date', () => {
  const filing = { code: 'VAT-2026-09', taxType: 'Thuế GTGT', period: '09/2026', deadline: '2026-10-20', amountPayable: 0 };
  assert.equal(validateTaxFiling(filing, []), null);
  assert.equal(validateTaxFiling({ ...filing, code: 'vat-2026-09' }, ['VAT-2026-09']), 'Mã hồ sơ thuế đã tồn tại.');
  assert.equal(validateTaxFiling({ ...filing, deadline: '2026-02-30' }, []), 'Hạn nộp không phải ngày hợp lệ.');
  assert.equal(validateTaxFiling({ ...filing, amountPayable: -1 }, []), 'Số tiền phải nộp phải là số nguyên không âm.');
});

test('only unsettled requests for the same tax filing block another request', () => {
  const payment = { sourceModule: 'finance_tax', sourceReference: 'tax-1', status: 'Chờ duyệt' };
  assert.equal(hasOpenTaxPayment([payment], 'tax-1'), true);
  assert.equal(hasOpenTaxPayment([{ ...payment, status: 'Đã phê duyệt' }], 'tax-1'), true);
  assert.equal(hasOpenTaxPayment([{ ...payment, status: 'Đã thanh toán' }], 'tax-1'), false);
  assert.equal(hasOpenTaxPayment([{ ...payment, status: 'Từ chối' }], 'tax-1'), false);
  assert.equal(hasOpenTaxPayment([payment], 'tax-2'), false);
});
