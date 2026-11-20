import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateCosting, normalizeCostingInput } from '../costingRules.mjs';

const base = { method: 'simple', periodStart: '2026-10-01', periodEnd: '2026-10-31', productName: 'Bàn ghế', unit: 'bộ', openingWipMaterial: 0, openingWipConversion: 0,
  materialCost: 60_000_000, laborCost: 20_000_000, variableOverhead: 10_000_000, fixedOverhead: 10_000_000, completedQuantity: 100 };
const sum = (lines, key) => lines.reduce((total, line) => total + line[key], 0);

test('giản đơn không dở dang: giá thành bằng tổng chi phí, đơn giá chia sản lượng', () => {
  const r = calculateCosting(base);
  assert.equal(r.totalCost, 100_000_000);
  assert.equal(r.unitCost, 1_000_000);
  assert.equal(r.closingWip, 0);
  assert.equal(sum(r.journal, 'debit'), sum(r.journal, 'credit'));
});

test('dở dang cuối kỳ theo sản lượng tương đương: nguyên liệu bỏ một lần, chế biến theo mức hoàn thành', () => {
  const r = calculateCosting({ ...base, completedQuantity: 80, wipQuantity: 20, wipCompletionRate: 50 });
  assert.equal(r.closingWipMaterial, 12_000_000, '60 triệu / 100 sản phẩm x 20');
  assert.equal(r.closingWipConversion, 4_444_444, '40 triệu / 90 đơn vị tương đương x 10');
  assert.equal(r.totalCost, 100_000_000 - 12_000_000 - 4_444_444);
  assert.equal(r.unitCost, 1_044_444);
  assert.equal(sum(r.journal, 'debit'), sum(r.journal, 'credit'));
});

test('dở dang đầu kỳ cộng vào giá thành', () => {
  const r = calculateCosting({ ...base, openingWipMaterial: 5_000_000, openingWipConversion: 3_000_000 });
  assert.equal(r.totalCost, 108_000_000);
});

test('chi phí chung cố định chỉ phân bổ theo công suất bình thường khi sản lượng thấp hơn', () => {
  const r = calculateCosting({ ...base, normalCapacity: 200 });
  assert.equal(r.fixedAllocated, 5_000_000);
  assert.equal(r.fixedUnallocated, 5_000_000);
  assert.equal(r.totalCost, 95_000_000);
  assert.ok(r.journal.some((line) => line.account === '632' && line.debit === 5_000_000));
  assert.equal(calculateCosting({ ...base, normalCapacity: 50 }).fixedUnallocated, 0, 'vượt công suất: phân bổ hết');
  assert.equal(sum(r.journal, 'debit'), sum(r.journal, 'credit'));
});

test('hao hụt nguyên liệu vượt mức không vào giá thành mà vào giá vốn', () => {
  const r = calculateCosting({ ...base, abnormalMaterialLoss: 4_000_000 });
  assert.equal(r.totalCost, 96_000_000);
  assert.ok(r.journal.some((line) => line.account === '632' && line.debit === 4_000_000));
  assert.equal(sum(r.journal, 'debit'), sum(r.journal, 'credit'));
  assert.throws(() => calculateCosting({ ...base, abnormalMaterialLoss: 70_000_000 }), /Hao hụt/);
});

test('hệ số: giá thành từng loại theo sản lượng quy đổi, tổng khớp tuyệt đối', () => {
  const r = calculateCosting({ ...base, method: 'coefficient', completedQuantity: undefined, products: [{ name: 'Loại A', quantity: 100, coefficient: 1 }, { name: 'Loại B', quantity: 50, coefficient: 1.5 }, { name: 'Loại C', quantity: 25, coefficient: 2 }] });
  assert.equal(r.completedUnits, 225);
  assert.equal(r.productResults.reduce((total, p) => total + p.totalCost, 0), r.totalCost);
  assert.equal(r.productResults[0].totalCost, Math.round(100 * 1 * (100_000_000 / 225)));
  assert.equal(r.productResults[1].unitCost, Math.round(r.productResults[1].totalCost / 50));
  assert.equal(r.coefficientUnitCost, Math.round(100_000_000 / 225));
});

test('kiểm tra đầu vào', () => {
  assert.throws(() => normalizeCostingInput({ ...base, method: 'x' }), /Phương pháp/);
  assert.throws(() => normalizeCostingInput({ ...base, periodStart: '2026-11-01' }), /không được sau/);
  assert.throws(() => normalizeCostingInput({ ...base, periodEnd: '2026-02-30' }), /không hợp lệ/);
  assert.throws(() => normalizeCostingInput({ ...base, materialCost: -1 }), /không âm/);
  assert.throws(() => normalizeCostingInput({ ...base, laborCost: '' }), /Nhập/);
  assert.throws(() => normalizeCostingInput({ ...base, completedQuantity: 0 }), /lớn hơn 0/);
  assert.throws(() => normalizeCostingInput({ ...base, wipCompletionRate: 120 }), /0 đến 100/);
  assert.throws(() => normalizeCostingInput({ ...base, method: 'coefficient', products: [{ name: 'A', quantity: 1, coefficient: 1 }] }), /2 đến 50/);
  assert.throws(() => normalizeCostingInput({ ...base, method: 'coefficient', products: [{ name: 'A', quantity: 1, coefficient: 1 }, { name: 'a', quantity: 1, coefficient: 1 }] }), /trùng/);
  assert.throws(() => normalizeCostingInput({ ...base, method: 'coefficient', products: [{ name: 'A', quantity: 1, coefficient: 0 }, { name: 'B', quantity: 1, coefficient: 1 }] }), /Hệ số/);
});
