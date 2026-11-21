import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateCasualIncomeTax, commitmentOverLimit } from '../casualIncomeRules.mjs';

test('cá nhân cư trú: khấu trừ 10% khi mỗi lần trả từ 2 triệu đồng', () => {
  assert.equal(calculateCasualIncomeTax({ amount: 2_000_000, paymentDate: '2026-03-01', residency: 'resident' }).tax, 200_000);
  assert.equal(calculateCasualIncomeTax({ amount: 1_999_999, paymentDate: '2026-03-01', residency: 'resident' }).tax, 0);
  const result = calculateCasualIncomeTax({ amount: 5_000_000, paymentDate: '2026-03-01', residency: 'resident' });
  assert.equal(result.netPayment, 4_500_000);
  assert.equal(result.journal.reduce((sum, line) => sum + line.debit, 0), result.journal.reduce((sum, line) => sum + line.credit, 0));
  assert.deepEqual(result.warnings, []);
});

test('cam kết 08/CK-TNCN cần mã số thuế; không cư trú 20% và không được cam kết', () => {
  assert.equal(calculateCasualIncomeTax({ amount: 5_000_000, paymentDate: '2026-03-01', residency: 'resident', commitment: true, taxCode: '8012345678' }).tax, 0);
  assert.throws(() => calculateCasualIncomeTax({ amount: 5_000_000, paymentDate: '2026-03-01', residency: 'resident', commitment: true }), /mã số thuế/);
  assert.equal(calculateCasualIncomeTax({ amount: 1_000_000, paymentDate: '2026-03-01', residency: 'non_resident' }).tax, 200_000);
  assert.throws(() => calculateCasualIncomeTax({ amount: 1_000_000, paymentDate: '2026-03-01', residency: 'non_resident', commitment: true }), /không cư trú/);
});

test('kỳ từ 01/7/2026 kèm cảnh báo ngưỡng chưa đối chiếu; cam kết vượt mức giảm trừ năm', () => {
  assert.equal(calculateCasualIncomeTax({ amount: 3_000_000, paymentDate: '2026-07-01', residency: 'resident' }).warnings.length, 1);
  assert.equal(commitmentOverLimit(190_000_000, 186_000_000), true);
});
