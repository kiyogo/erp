import assert from 'node:assert/strict';
import { test } from 'node:test';
import { annualPitFinalization, authorizationProblems, finalizationDeadline } from '../pitFinalizationRules.mjs';

const month = (m, gross, tax) => ({ month: `2025-${String(m).padStart(2, '0')}`, gross, exemptIncome: 0, insuranceDeduction: 2_100_000, taxDeduction: tax });

test('quyết toán năm 2025: giảm trừ bản thân 12 tháng, biểu năm 7 bậc', () => {
  const payslips = Array.from({ length: 12 }, (_, i) => month(i + 1, 30_000_000, 1_000_000));
  const result = annualPitFinalization({ year: 2025, payslips, familyMembers: [] });
  assert.equal(result.totalIncome, 360_000_000);
  assert.equal(result.personalDeduction, 132_000_000);
  assert.equal(result.taxableIncome, 360_000_000 - 25_200_000 - 132_000_000);
  // 202,8 triệu: 60tr×5% + 60tr×10% + 82,8tr×15% = 3 + 6 + 12,42 triệu.
  assert.equal(result.annualTax, 21_420_000);
  assert.equal(result.withheld, 12_000_000);
  assert.equal(result.difference, 9_420_000);
  assert.equal(result.result, 'Nộp thêm');
});

test('người làm chưa đủ năm vẫn được giảm trừ đủ 12 tháng; người phụ thuộc theo số tháng đăng ký', () => {
  const payslips = [month(10, 20_000_000, 500_000), month(11, 20_000_000, 500_000), month(12, 20_000_000, 500_000)];
  const familyMembers = [{ isDependent: true, dependentStartDate: '2025-07-01' }];
  const result = annualPitFinalization({ year: 2025, payslips, familyMembers });
  assert.equal(result.dependentMonths, 6);
  assert.equal(result.annualTax, 0);
  assert.equal(result.difference, -1_500_000);
  assert.equal(result.result, 'Nộp thừa');
});

test('năm 2026 dùng mức giảm trừ 15,5 triệu, hạn nộp dời khỏi ngày nghỉ', () => {
  const result = annualPitFinalization({ year: 2026, payslips: [{ month: '2026-01', gross: 20_000_000, taxDeduction: 0 }], familyMembers: [] });
  assert.equal(result.personalDeduction, 186_000_000);
  assert.equal(finalizationDeadline(2025), '2026-03-31');
  assert.equal(finalizationDeadline(2026), '2027-03-31');
  assert.equal(finalizationDeadline(2029), '2030-04-01');
});

test('điều kiện ủy quyền: còn làm việc, hợp đồng từ 3 tháng, thu nhập vãng lai không quá 10 triệu', () => {
  assert.deepEqual(authorizationProblems({ employed: true, contractMonths: 12 }), []);
  assert.equal(authorizationProblems({ employed: false, contractMonths: 2, otherIncomeMonthlyAverage: 11_000_000 }).length, 3);
});
