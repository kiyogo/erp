import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePayslip, countActiveDependents, normalizePeriod, payrollParameters, progressiveTax, workdayPay } from '../payrollRules.mjs';

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

test('lương theo ngày công: nhân theo ngày hưởng lương, giới hạn ở ngày công chuẩn', () => {
  const half = workdayPay({ baseSalary: 26_000_000, standardDays: 26, payDays: 13 });
  assert.equal(half.proratedBase, 13_000_000);
  assert.equal(half.payDays, 13);
  assert.deepEqual(half.warnings, []);
  assert.equal(workdayPay({ baseSalary: 26_000_000, standardDays: 26, payDays: 26 }).proratedBase, 26_000_000);
  const capped = workdayPay({ baseSalary: 26_000_000, standardDays: 26, payDays: 28 });
  assert.equal(capped.proratedBase, 26_000_000);
  assert.equal(capped.payDays, 26);
  assert.match(capped.warnings[0], /vượt ngày công chuẩn/);
  assert.equal(workdayPay({ baseSalary: 10_000_000, standardDays: 22, payDays: 10.5 }).proratedBase, Math.round(10_000_000 * 10.5 / 22));
  assert.equal(workdayPay({ baseSalary: 10_000_000, standardDays: 22, payDays: 0 }).proratedBase, 0);
});

test('làm thêm giờ: 150% ngày thường, 200% ngày nghỉ, phần cao hơn lương giờ bình thường được miễn thuế', () => {
  const pay = workdayPay({ baseSalary: 26_000_000, standardDays: 26, payDays: 26, otHoursWeekday: 10, otHoursWeekend: 8 });
  assert.equal(pay.hourlyWage, 125_000);
  assert.equal(pay.overtime.weekdayPay, 1_875_000);
  assert.equal(pay.overtime.weekendPay, 2_000_000);
  assert.equal(pay.overtime.pay, 3_875_000);
  assert.equal(pay.overtime.exempt, 625_000 + 1_000_000);
  // Lương giờ lấy theo lương hợp đồng, không giảm theo ngày công.
  const absent = workdayPay({ baseSalary: 26_000_000, standardDays: 26, payDays: 13, otHoursWeekday: 10 });
  assert.equal(absent.overtime.weekdayPay, 1_875_000);
  assert.equal(absent.proratedBase, 13_000_000);
  const slip = calculatePayslip({ period: '2026-03', region: 'I', baseSalary: absent.proratedBase, overtimePay: absent.overtime.pay, exemptIncome: absent.overtime.exempt, insuranceSalary: 26_000_000 });
  assert.equal(slip.gross, 13_000_000 + 1_875_000);
  assert.equal(slip.overtimePay, 1_875_000);
  assert.equal(slip.insuranceSalary, 26_000_000);
  assert.equal(slip.taxableIncome, Math.max(0, slip.gross - absent.overtime.exempt - slip.employeeInsurance.total - 15_500_000));
});

test('lương theo ngày công từ chối số liệu không hợp lệ', () => {
  assert.throws(() => workdayPay({ baseSalary: 1_000_000, standardDays: 0, payDays: 1 }), /Ngày công chuẩn/);
  assert.throws(() => workdayPay({ baseSalary: 1_000_000, standardDays: 26, payDays: -1 }), /Ngày công hưởng lương/);
  assert.throws(() => workdayPay({ baseSalary: 1_000_000, standardDays: 26, payDays: 1, otHoursWeekday: -2 }), /Giờ làm thêm/);
  assert.throws(() => workdayPay({ baseSalary: -1, standardDays: 26, payDays: 1 }), /Lương cơ bản/);
});
