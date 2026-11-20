import assert from 'node:assert/strict';
import test from 'node:test';
import { PAYMENT_METHODS as apiMethods } from '../../api/tradeRules.mjs';
import { PAYMENT_METHODS as webMethods, termsFromValues, vatOf } from '../src/modules/finance/tradeTerms.ts';

test('hình thức thanh toán ở web khớp với máy chủ', () => {
  assert.deepEqual(webMethods, apiMethods);
});

test('đọc ô điều khoản của form: bỏ ô trống, đổi số', () => {
  assert.deepEqual(termsFromValues({ terms_contractNo: ' HD-1 ', terms_penaltyRate: '5', terms_paymentTermDays: 0, terms_note: '   ', terms_warrantyMonths: '' }), { contractNo: 'HD-1', penaltyRate: 5, paymentTermDays: 0 });
  assert.equal(vatOf(1_000_000, 10), 100_000);
  assert.equal(vatOf(333, 8), 27);
});
