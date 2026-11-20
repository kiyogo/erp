import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedVatRates, isAllowedVatRate, vatRateProblem } from '../vatRules.mjs';

test('thuế suất GTGT theo ngày lập: 8% chỉ trong các giai đoạn giảm thuế', () => {
  assert.deepEqual(allowedVatRates('2021-12-31'), [0, 5, 10]);
  assert.ok(isAllowedVatRate(8, '2022-02-01') && isAllowedVatRate(8, '2022-12-31'));
  assert.ok(!isAllowedVatRate(8, '2023-01-01') && !isAllowedVatRate(8, '2023-06-30'));
  assert.ok(isAllowedVatRate(8, '2023-07-01') && isAllowedVatRate(8, '2025-06-30') && isAllowedVatRate(8, '2026-12-31'));
  assert.ok(!isAllowedVatRate(8, '2027-01-01'));
  assert.ok([0, 5, 10].every(rate => isAllowedVatRate(rate, '2030-01-01')));
});

test('thuế suất ngoài luật bị từ chối kèm thông báo rõ mức hợp lệ', () => {
  for (const bad of [7.25, 15, 100, -1, NaN]) assert.notEqual(vatRateProblem(bad, '2026-10-10'), '');
  assert.equal(vatRateProblem(10, '2026-10-10'), '');
  assert.match(vatRateProblem(8, '2027-02-01'), /0%, 5%, 10%/);
});
