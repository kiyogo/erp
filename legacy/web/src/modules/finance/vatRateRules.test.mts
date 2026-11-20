import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedVatRates } from './vatRateRules.ts';

test('8% chỉ có trong các giai đoạn giảm thuế GTGT', () => {
  assert.deepEqual(allowedVatRates('2026-12-31'), [0, 5, 8, 10]);
  assert.deepEqual(allowedVatRates('2027-01-01'), [0, 5, 10]);
  assert.deepEqual(allowedVatRates('2023-03-01'), [0, 5, 10]);
});
