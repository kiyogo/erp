import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPitDeclaration, declarationPeriod } from '../pitDeclarationRules.mjs';

const people = [
  { key: 'a', name: 'A', resident: true, hasLaborContract: true, lines: [{ month: '2026-04', gross: 30_000_000, exemptIncome: 2_000_000, taxDeduction: 1_000_000 }, { month: '2026-05', gross: 30_000_000, taxDeduction: 1_000_000 }] },
  { key: 'b', name: 'B', resident: true, hasLaborContract: true, lines: [{ month: '2026-04', gross: 10_000_000, taxDeduction: 0 }] },
  { key: 'c', name: 'C', resident: false, hasLaborContract: false, lines: [{ month: '2026-06', gross: 5_000_000, taxDeduction: 1_000_000 }] },
  { key: 'd', name: 'D', resident: true, lines: [{ month: '2026-07', gross: 5_000_000, taxDeduction: 500_000 }] },
];

test('kỳ kê khai tháng hoặc quý', () => {
  assert.deepEqual(declarationPeriod('2026-q2').months, ['2026-04', '2026-05', '2026-06']);
  assert.equal(declarationPeriod('2026-Q2').periodEnd, '2026-06-30');
  assert.equal(declarationPeriod('2026-02').filingMethod, 'Tháng');
  assert.throws(() => declarationPeriod('2026-13'), /Kỳ kê khai/);
});

test('chỉ tiêu 05/KK: số người, thu nhập chịu thuế, thu nhập thuộc diện khấu trừ và số thuế', () => {
  const { indicators, mustFile, rows } = buildPitDeclaration({ period: '2026-Q2', people });
  assert.equal(rows.length, 3);
  assert.equal(indicators[21], 3);
  assert.equal(indicators[22], 2);
  assert.equal(indicators[23], 2);
  assert.equal(indicators[24], 1);
  assert.equal(indicators[25], 1);
  assert.equal(indicators[27], 68_000_000);
  assert.equal(indicators[28], 5_000_000);
  assert.equal(indicators[26], 73_000_000);
  assert.equal(indicators[31], 58_000_000);
  assert.equal(indicators[30], 63_000_000);
  assert.equal(indicators[33], 3_000_000);
  assert.equal(mustFile, true);
  assert.equal(buildPitDeclaration({ period: '2026-03', people }).mustFile, false);
});
