import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adjustmentSalaryCheck, normalizeInsuranceMonth, regimeDaysProblem } from '../insuranceRules.mjs';

test('tháng áp dụng nhận YYYY-MM, MM/YYYY và "Tháng MM/YYYY"', () => {
  assert.equal(normalizeInsuranceMonth('2026-09'), '2026-09');
  assert.equal(normalizeInsuranceMonth('Tháng 09/2026'), '2026-09');
  assert.throws(() => normalizeInsuranceMonth('09-2026x'));
});

test('mức lương đóng: sàn lương tối thiểu vùng, trần 20 lần, hạn báo tăng 30 ngày', () => {
  assert.match(adjustmentSalaryCheck({ adjustType: 'Điều chỉnh tăng lương', newSalary: 5_000_000, region: 'I', month: '2026-03' }).error, /5\.310\.000/);
  assert.equal(adjustmentSalaryCheck({ adjustType: 'Điều chỉnh tăng lương', newSalary: 5_000_000, region: 'IV', month: '2026-03' }).error, '');
  assert.equal(adjustmentSalaryCheck({ adjustType: 'Báo giảm hẳn', newSalary: 0, region: 'I', month: '2026-03' }).error, '');
  assert.match(adjustmentSalaryCheck({ adjustType: 'Điều chỉnh tăng lương', newSalary: 60_000_000, region: 'I', month: '2026-03' }).warnings[0], /46\.800\.000/);
  assert.match(adjustmentSalaryCheck({ adjustType: 'Điều chỉnh tăng lương', newSalary: 60_000_000, region: 'I', month: '2026-08' }).warnings[0], /50\.600\.000/);
  assert.match(adjustmentSalaryCheck({ adjustType: 'Báo tăng mới', newSalary: 10_000_000, region: 'I', month: '2026-03', filingDate: '2026-04-15' }).warnings[0], /30 ngày/);
  assert.deepEqual(adjustmentSalaryCheck({ adjustType: 'Báo tăng mới', newSalary: 10_000_000, region: 'I', month: '2026-03', filingDate: '2026-03-20' }).warnings, []);
  assert.match(adjustmentSalaryCheck({ adjustType: 'Báo tăng mới', newSalary: 10_000_000, region: 'V', month: '2026-03' }).error, /Vùng/);
});

test('số ngày hưởng chế độ', () => {
  assert.equal(regimeDaysProblem({ regimeType: 'Thai sản (6 tháng)', leaveDays: 180 }), '');
  assert.match(regimeDaysProblem({ regimeType: 'Thai sản (6 tháng)', leaveDays: 200 }), /180 ngày/);
  assert.equal(regimeDaysProblem({ regimeType: 'Thai sản (6 tháng)', leaveDays: 210, childrenCount: 2 }), '');
  assert.match(regimeDaysProblem({ regimeType: 'Dưỡng sức sau sinh', leaveDays: 11 }), /10 ngày/);
  assert.match(regimeDaysProblem({ regimeType: 'Khám thai định kỳ', leaveDays: 3 }), /2 ngày/);
  assert.match(regimeDaysProblem({ regimeType: 'Ốm đau ngắn ngày', leaveDays: 10, sickDaysThisYear: 55 }), /60 ngày/);
  assert.equal(regimeDaysProblem({ regimeType: 'Ốm đau ngắn ngày', leaveDays: 5, sickDaysThisYear: 55 }), '');
  assert.match(regimeDaysProblem({ regimeType: 'Khác', leaveDays: 1 }), /không hợp lệ/);
});
