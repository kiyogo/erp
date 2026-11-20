import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addWorkingDays, noticeRequirement, settleTermination, severanceYears, wholeMonthsBetween, workingDaysBetween } from '../terminationRules.mjs';

const base = { type: 'mutual', contractKind: 'indefinite', workStartDate: '2022-01-15', lastWorkingDate: '2026-09-30', averageSalary: 20_000_000 };
const ctx = { today: '2026-11-21' };

test('số tháng tròn và làm tròn thời gian tính trợ cấp', () => {
  assert.equal(wholeMonthsBetween('2022-01-15', '2026-09-30'), 56);
  assert.equal(wholeMonthsBetween('2022-01-15', '2026-09-14'), 55);
  assert.equal(severanceYears(56), 5, '4 năm 8 tháng lẻ tính tròn 5 năm');
  assert.equal(severanceYears(53), 4.5, '4 năm 5 tháng lẻ tính 4,5 năm');
  assert.equal(severanceYears(60), 5);
  assert.equal(severanceYears(66), 6);
  assert.equal(severanceYears(12), 1);
  assert.equal(severanceYears(11), 1, '11 tháng lẻ tính 1 năm');
  assert.equal(severanceYears(7), 1);
  assert.equal(severanceYears(6), 1);
  assert.equal(severanceYears(5), 0.5);
  assert.equal(severanceYears(0), 0);
});

test('ngày làm việc: bỏ thứ bảy, chủ nhật', () => {
  assert.equal(workingDaysBetween('2026-11-20', '2026-11-27'), 5);
  assert.equal(addWorkingDays('2026-09-30', 14), '2026-10-20');
});

test('báo trước theo loại hợp đồng', () => {
  assert.deepEqual(noticeRequirement({ type: 'employee_unilateral', contractKind: 'indefinite' }), { days: 45, unit: 'ngày' });
  assert.deepEqual(noticeRequirement({ type: 'employer_unilateral', contractKind: 'fixed', termMonths: 24 }), { days: 30, unit: 'ngày' });
  assert.deepEqual(noticeRequirement({ type: 'employee_unilateral', contractKind: 'fixed', termMonths: 6 }), { days: 3, unit: 'ngày làm việc' });
  assert.deepEqual(noticeRequirement({ type: 'mutual', contractKind: 'indefinite' }), { days: 0, unit: 'ngày' });
});

test('trợ cấp thôi việc: nửa tháng lương mỗi năm, trừ tháng bảo hiểm thất nghiệp', () => {
  const r = settleTermination(base, ctx);
  assert.equal(r.monthsWorked, 56);
  assert.equal(r.severanceYears, 5);
  assert.equal(r.allowance, 50_000_000);
  const withInsurance = settleTermination({ ...base, unemploymentInsuredMonths: 20 }, ctx);
  assert.equal(withInsurance.effectiveMonths, 36);
  assert.equal(withInsurance.allowance, 30_000_000);
  assert.equal(settleTermination({ ...base, lastWorkingDate: '2022-12-14' }, ctx).allowance, 0, 'chưa đủ 12 tháng');
  assert.match(settleTermination({ ...base, lastWorkingDate: '2022-12-14' }, ctx).notes.join(' '), /12 tháng/);
});

test('trợ cấp mất việc làm: một tháng lương mỗi năm, tối thiểu hai tháng', () => {
  assert.equal(settleTermination({ ...base, type: 'restructuring' }, ctx).allowance, 100_000_000);
  assert.equal(settleTermination({ ...base, type: 'restructuring', lastWorkingDate: '2023-03-14' }, ctx).allowance, 40_000_000, 'dưới 2 năm vẫn tối thiểu 2 tháng');
  assert.equal(settleTermination({ ...base, type: 'restructuring' }, ctx).allowanceType, 'job_loss');
});

test('không có trợ cấp khi sa thải, nghỉ hưu hoặc người lao động bỏ ngang trái luật', () => {
  assert.equal(settleTermination({ ...base, type: 'discipline' }, ctx).allowance, 0);
  assert.equal(settleTermination({ ...base, type: 'retirement' }, ctx).allowance, 0);
  const quit = settleTermination({ ...base, type: 'employee_unilateral', noticeGivenDate: '2026-09-20' }, ctx);
  assert.equal(quit.noticeRequiredDays, 45);
  assert.equal(quit.noticeGivenDays, 10);
  assert.equal(quit.shortNoticeDays, 35);
  assert.equal(quit.allowance, 0);
  assert.equal(quit.employeeOwes, 10_000_000 + 35 * Math.round(20_000_000 / 26));
  assert.match(quit.notes.join(' '), /Điều 40/);
  const lawful = settleTermination({ ...base, type: 'employee_unilateral', noticeGivenDate: '2026-08-10' }, ctx);
  assert.equal(lawful.shortNoticeDays, 0);
  assert.equal(lawful.allowance, 50_000_000);
  assert.equal(lawful.employeeOwes, 0);
  const exempt = settleTermination({ ...base, type: 'employee_unilateral', exemptFromNotice: true }, ctx);
  assert.equal(exempt.shortNoticeDays, 0);
  assert.equal(exempt.allowance, 50_000_000);
});

test('người sử dụng lao động báo trước thiếu phải trả lương những ngày thiếu; hợp đồng dưới 12 tháng tính ngày làm việc', () => {
  const r = settleTermination({ ...base, type: 'employer_unilateral', contractKind: 'fixed', termMonths: 6, noticeGivenDate: '2026-09-29' }, ctx);
  assert.equal(r.noticeUnit, 'ngày làm việc');
  assert.equal(r.noticeGivenDays, 1);
  assert.equal(r.shortNoticeDays, 2);
  assert.equal(r.employerPays, r.allowance + r.shortNoticeAmount);
});

test('tiền phép chưa nghỉ, hạn thanh toán 14 ngày làm việc và kiểm tra đầu vào', () => {
  const r = settleTermination({ ...base, unusedLeaveDays: 4.5 }, ctx);
  assert.equal(r.leavePayout, Math.round(4.5 * Math.round(20_000_000 / 26)));
  assert.equal(r.settlementDueDate, '2026-10-20');
  assert.equal(r.settlementOverdue, true);
  assert.equal(settleTermination({ ...base, lastWorkingDate: '2026-11-20' }, ctx).settlementOverdue, false);
  assert.throws(() => settleTermination({ ...base, type: 'x' }, ctx), /Loại chấm dứt/);
  assert.throws(() => settleTermination({ ...base, lastWorkingDate: '2021-01-01' }, ctx), /trước ngày bắt đầu/);
  assert.throws(() => settleTermination({ ...base, noticeGivenDate: '2026-10-05' }, ctx), /sau ngày chấm dứt/);
  assert.throws(() => settleTermination({ ...base, averageSalary: 0 }, ctx), /lớn hơn 0/);
  assert.throws(() => settleTermination({ ...base, unemploymentInsuredMonths: 60 }, ctx), /không được vượt/);
  assert.throws(() => settleTermination({ ...base, unusedLeaveDays: 1.3 }, ctx), /bội số/);
  assert.throws(() => settleTermination({ ...base, contractKind: 'fixed' }, ctx), /Thời hạn hợp đồng/);
});
