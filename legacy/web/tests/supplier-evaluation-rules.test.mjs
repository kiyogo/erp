import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveSupplierScore, supplierEvaluationExportRows, supplierEvaluationMetrics } from '../src/modules/crm/supplierEvaluationRules.ts';

test('supplier score tier follows the four configured score ranges', () => {
  assert.deepEqual(deriveSupplierScore({ qualityScore: 40, deliveryScore: 30, priceScore: 20, serviceScore: 10 }), { totalScore: 100, tier: 'Hạng A' });
  assert.equal(deriveSupplierScore({ qualityScore: 30, deliveryScore: 24, priceScore: 15, serviceScore: 6 }).tier, 'Hạng B');
  assert.equal(deriveSupplierScore({ qualityScore: 20, deliveryScore: 20, priceScore: 10, serviceScore: 5 }).tier, 'Hạng C');
  assert.equal(deriveSupplierScore({ qualityScore: 0, deliveryScore: 0, priceScore: 0, serviceScore: 0 }).totalScore, 0);
});

test('supplier scores reject fractional and out-of-range values', () => {
  assert.throws(() => deriveSupplierScore({ qualityScore: 40.5, deliveryScore: 20, priceScore: 10, serviceScore: 5 }));
  assert.throws(() => deriveSupplierScore({ qualityScore: 41, deliveryScore: 20, priceScore: 10, serviceScore: 5 }));
});

test('supplier evaluation metrics and workbook rows use actual records', () => {
  const records = [
    { totalScore: 90, tier: 'Hạng A' },
    { totalScore: 75, tier: 'Hạng B' },
  ];
  assert.deepEqual(supplierEvaluationMetrics(records), { count: 2, tierACount: 1, tierBCount: 1, tierCCount: 0, averageScore: 82.5 });
  assert.equal(supplierEvaluationMetrics([]).averageScore, null);
  const rows = supplierEvaluationExportRows([{
    evalCode: 'E-1', supplierName: 'Supplier A', category: 'Cloud', evalPeriod: '2026 Q4', qualityScore: 36,
    deliveryScore: 28, priceScore: 18, serviceScore: 9, totalScore: 91, tier: 'Hạng A', evaluator: 'Admin',
  }]);
  assert.equal(rows[1][0], 'E-1');
  assert.equal(rows[1][8], 91);
});
