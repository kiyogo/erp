import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDepreciationSchedule } from '../src/modules/assets/depreciationCalculations.ts';

test('straight-line depreciation uses depreciable cost, reaches residual value, and labels calendar periods', () => {
  const rows = buildDepreciationSchedule({
    originalCost: 1000,
    residualValue: 100,
    lifeMonths: 3,
    startDate: '2026-11-15',
    depreciatedMonths: 1,
    method: 'Đường thẳng',
  });
  assert.deepEqual(rows.map((row) => row.period), ['2026-11', '2026-12', '2027-01']);
  assert.deepEqual(rows.map((row) => row.monthlyAmount), [300, 300, 300]);
  assert.deepEqual(rows.map((row) => row.remainingAmount), [700, 400, 100]);
  assert.deepEqual(rows.map((row) => row.posted), [true, false, false]);
});

test('declining balance does not depreciate below the residual value', () => {
  const rows = buildDepreciationSchedule({
    originalCost: 1200,
    residualValue: 200,
    lifeMonths: 48,
    startDate: '2026-01-01',
    method: 'Số dư giảm dần có điều chỉnh',
  });
  assert.ok(rows[0].monthlyAmount > Math.round((1200 - 200) / 48));
  assert.equal(rows.at(-1).remainingAmount, 200);
  assert.equal(rows.reduce((sum, row) => sum + row.monthlyAmount, 0), 1000);
});

test('production depreciation requires actual capacity and only posts entered production', () => {
  const rows = buildDepreciationSchedule({
    originalCost: 1000,
    residualValue: 100,
    lifeMonths: 3,
    startDate: '2026-01-01',
    method: 'Theo sản lượng / Công suất',
    productionCapacity: 90,
    productionByPeriod: { '2026-01': 30 },
  });
  assert.equal(rows[0].monthlyAmount, 300);
  assert.equal(rows[1].monthlyAmount, 0);
  assert.equal(rows[0].productionUnits, 30);
  assert.throws(() => buildDepreciationSchedule({
    originalCost: 1000,
    residualValue: 0,
    lifeMonths: 3,
    startDate: '2026-01-01',
    method: 'Theo sản lượng / Công suất',
  }), /công suất/i);
});

test('depreciation rejects invalid cost, life, and date instead of inventing values', () => {
  const base = { originalCost: 1000, residualValue: 0, lifeMonths: 12, startDate: '2026-01-01', method: 'Đường thẳng' };
  assert.throws(() => buildDepreciationSchedule({ ...base, originalCost: 0 }), /nguyên giá/i);
  assert.throws(() => buildDepreciationSchedule({ ...base, lifeMonths: 0 }), /thời gian/i);
  assert.throws(() => buildDepreciationSchedule({ ...base, startDate: '2026-13-01' }), /ngày bắt đầu/i);
});
