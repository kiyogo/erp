import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendanceDate, attendanceDaySummary, attendanceNumber, dateRangeDays, leaveBalance, leaveDays, monthDayCount, timeRangeDetails } from './attendanceRules.ts';

test('leave requests reject impossible dates, backwards dates and excess/invalid day counts', () => {
  assert.equal(attendanceDate(new Date(2026, 9, 25, 0, 15)), '2026-10-25');
  assert.equal(dateRangeDays('2028-02-28', '2028-03-01'), 3);
  assert.equal(leaveDays('0.5', '2026-10-25', '2026-10-25'), 0.5);
  for (const dates of [['2026-02-29', '2026-03-01'], ['2026-10-26', '2026-10-25'], ['', '2026-10-25']]) {
    assert.throws(() => dateRangeDays(dates[0], dates[1]));
  }
  for (const count of [0, -1, 2, 0.75, 'abc']) assert.throws(() => leaveDays(count, '2026-10-25', '2026-10-25'));
});

test('overnight shifts and OT use elapsed clock time without accepting impossible clock values', () => {
  assert.deepEqual(timeRangeDetails('22:00 - 06:00'), { startTime: '22:00', endTime: '06:00', hours: 8 });
  assert.equal(timeRangeDetails('08:00 – 17:30').hours, 9.5);
  assert.equal(timeRangeDetails('12:00 - 13:30 (1.5h)').hours, 1.5);
  for (const range of ['25:00 - 06:00', '08:60 - 17:30', '08:00 - 08:00', 'morning']) assert.throws(() => timeRangeDetails(range));
});

test('zero allowances remain zero and empty/NaN/negative amounts are never replaced with fabricated defaults', () => {
  assert.equal(attendanceNumber('0', 'Phụ cấp', 0), 0);
  for (const value of ['', undefined, NaN, Infinity, -1]) assert.throws(() => attendanceNumber(value, 'Phụ cấp', 0));
});

test('leave funds support zero entitlement and reject balances that hide excessive usage', () => {
  assert.deepEqual(leaveBalance(0, 0, 0, 0), { totalEntitled: 0, usedLeaves: 0, remainingLeaves: 0, leaveUsagePct: 0, status: 'Đã hết phép' });
  assert.equal(leaveBalance(12, 1, 2, 5).remainingLeaves, 10);
  assert.throws(() => leaveBalance(12, 0, 0, 13));
  assert.throws(() => leaveBalance(12, -1, 1, 0));
});

test('timesheet calendar and employee cells never invent attendance or credit OT as regular work', () => {
  assert.equal(monthDayCount('2028-02'), 29);
  assert.equal(monthDayCount('2026-02'), 28);
  assert.throws(() => monthDayCount('2026-13'));
  const employee = { key: 'employee-a', code: 'NV01' };
  const date = '2026-10-25';
  assert.equal(attendanceDaySummary(employee, date, [], [], [], []).code, '—');
  const other = [{ employeeId: 'employee-b', date, checkIn: '08:00', checkOut: '17:00' }];
  assert.equal(attendanceDaySummary(employee, date, other, [], [], []).days, 0);
  const own = [{ employeeId: employee.key, date, checkIn: '08:00', checkOut: '17:00' }];
  const result = attendanceDaySummary(employee, date, own, [], [], [{ empCode: 'NV01', otDate: date, totalHours: 3, status: 'Đã duyệt OT' }]);
  assert.equal(result.days, 1);
  assert.equal(result.otHours, 3);
  assert.equal(attendanceDaySummary(employee, date, [], [], [], [{ empCode: 'NV01', otDate: date, totalHours: 3, status: 'Chờ duyệt' }]).code, '—');
  assert.equal(attendanceDaySummary(employee, date, [], [{ employeeCode: 'NV01', timestamp: `${date}T08:00:00`, status: 'Dữ liệu hợp lệ' }], [], []).days, 0);
  assert.equal(attendanceDaySummary(employee, date, [], [8, 17].map((hour) => ({ employeeCode: 'NV01', timestamp: `${date}T${hour}:00:00`, status: 'Dữ liệu hợp lệ' })), [], []).days, 0);
});
