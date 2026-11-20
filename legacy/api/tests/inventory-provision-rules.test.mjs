import assert from 'node:assert/strict';
import { test } from 'node:test';
import { provisionLine, provisionTotals } from '../inventoryProvisionRules.mjs';

test('mức dự phòng là giá gốc trừ giá trị thuần, không âm', () => {
  assert.deepEqual(provisionLine({ quantity: 10, unitCost: 1000, nrvUnit: 700 }), { cost: 10000, nrv: 7000, required: 3000 });
  assert.equal(provisionLine({ quantity: 10, unitCost: 1000, nrvUnit: 1500 }).required, 0, 'giá thuần cao hơn giá gốc thì không lập');
  assert.deepEqual(provisionLine({ quantity: 3, unitCost: 333.33, nrvUnit: 100.4 }), { cost: 1000, nrv: 301, required: 699 });
});

test('tổng hợp kỳ lập: chênh lệch so với kỳ trước, âm khi hoàn nhập', () => {
  assert.deepEqual(provisionTotals([{ required: 500, previous: 200 }, { required: 0, previous: 100 }]), { totalRequired: 500, totalPrevious: 300, totalAdjustment: 200 });
  assert.equal(provisionTotals([{ required: 0, previous: 400 }]).totalAdjustment, -400);
});
