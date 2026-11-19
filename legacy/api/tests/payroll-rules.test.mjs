import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePayslip, countActiveDependents, normalizePeriod, payrollParameters, progressiveTax } from '../payrollRules.mjs';

test('kỳ 2026 dùng giảm trừ 15,5 triệu, 6,2 triệu và biểu 5 bậc', () => {
  const slip = calculatePayslip({ period: '2026-03', region: 'I', baseSalary: 30_000_000, dependents: 1 });
  assert.deepEqual(slip.employeeInsurance, { social: 2_400_000, health: 450_000, unemployment: 300_000, total: 3_150_000 });
  assert.equal(slip.taxableIncome, 30_000_000 - 3_150_000 - 15_500_000 - 6_200_000);
  assert.equal(slip.tax, 257_500);
  assert.equal(slip.netSalary, 30_000_000 - 3_150_000 - 257_500);
});

test('thu nhập cao: trần BHXH BHYT 20 lần lương cơ sở và thuế nhiều bậc', () => {
  const slip = calculatePayslip({ period: '2026-03', region: 'I', baseSalary: 80_000_000 });
  assert.equal(slip.socialHealthBase, 46_800_000);
  assert.equal(slip.employeeInsurance.social, 3_744_000);
  assert.equal(slip.employeeInsurance.health, 702_000);
  assert.equal(slip.employeeInsurance.unemployment, 800_000);
  assert.equal(slip.taxableIncome, 59_254_000);
  assert.equal(slip.tax, 8_350_800);
  assert.equal(slip.tax, Math.round(0.2 * 59_254_000 - 3_500_000));
});

test('từ 01/07/2026 trần đóng theo lương cơ sở 2,53 triệu', () => {
  const slip = calculatePayslip({ period: '2026-08', region: 'I', baseSalary: 80_000_000 });
  assert.equal(slip.socialHealthBase, 50_600_000);
  assert.equal(slip.employeeInsurance.social, 4_048_000);
  assert.equal(slip.employeeInsurance.health, 759_000);
});

test('kỳ 2025 vẫn dùng giảm trừ 11 triệu và biểu 7 bậc', () => {
  const slip = calculatePayslip({ period: '2025-06', region: 'I', baseSalary: 20_000_000 });
  assert.equal(slip.employeeInsurance.total, 2_100_000);
  assert.equal(slip.taxableIncome, 6_900_000);
  assert.equal(slip.tax, 440_000);
});

test('trần bảo hiểm thất nghiệp theo vùng và cảnh báo dưới lương tối thiểu vùng', () => {
  const high = calculatePayslip({ period: '2026-03', region: 'IV', baseSalary: 150_000_000 });
  assert.equal(high.unemploymentBase, 20 * 3_700_000);
  const low = calculatePayslip({ period: '2026-03', region: 'I', baseSalary: 4_000_000 });
  assert.ok(low.warnings.some((text) => text.includes('lương tối thiểu vùng I')));
  assert.equal(low.tax, 0);
});

test('thuế tính từng phần và không âm', () => {
  const { brackets } = payrollParameters('2026-01', 'I').pit;
  assert.equal(progressiveTax(-5, brackets), 0);
  assert.equal(progressiveTax(10_000_000, brackets), 500_000);
  assert.equal(progressiveTax(30_000_000, brackets), 2_500_000);
  assert.equal(progressiveTax(100_000_000, brackets), 500_000 + 2_000_000 + 6_000_000 + 12_000_000);
  assert.equal(progressiveTax(120_000_000, brackets), 20_500_000 + 7_000_000);
});

test('đếm người phụ thuộc theo ngày đăng ký trong kỳ', () => {
  const members = [
    { isDependent: true, dependentStartDate: '2026-01-01', dependentEndDate: '' },
    { isDependent: true, dependentStartDate: '2026-04-01' },
    { isDependent: true, dependentStartDate: '2025-01-01', dependentEndDate: '2026-02-28' },
    { isDependent: false },
  ];
  assert.equal(countActiveDependents(members, '2026-03'), 1);
  assert.equal(countActiveDependents(members, '2026-04'), 2);
  assert.equal(countActiveDependents(members, '2026-02'), 2);
  assert.equal(countActiveDependents(undefined, '2026-02'), 0);
});

test('từ chối kỳ chưa hỗ trợ, vùng sai và số tiền không hợp lệ', () => {
  assert.throws(() => calculatePayslip({ period: '2024-06', region: 'I', baseSalary: 1 }), /Chưa hỗ trợ/);
  assert.throws(() => calculatePayslip({ period: '2026-03', region: 'V', baseSalary: 1 }), /Vùng/);
  assert.throws(() => calculatePayslip({ period: '2026-03', region: 'I', baseSalary: -1 }), /không âm/);
  assert.throws(() => calculatePayslip({ period: '2026-03', region: 'I', baseSalary: 1_000_000, exemptIncome: 2_000_000 }), /miễn thuế/);
  assert.equal(normalizePeriod('3/2026'), '2026-03');
  assert.throws(() => normalizePeriod('2026-13'), /Kỳ lương/);
});
