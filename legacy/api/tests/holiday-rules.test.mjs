import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lunarToSolar } from '../lunarCalendar.mjs';
import { holidaysOf, isHoliday, setHolidayOverrides, statutoryHolidays } from '../holidayRules.mjs';
import { nextWorkingDay } from '../taxRules.mjs';
import { addWorkingDays } from '../terminationRules.mjs';
import { overtimeMinMultiplier } from '../attendanceRules.mjs';

test('âm lịch: mùng 1 Tết và Giỗ Tổ khớp lịch đã công bố', () => {
  assert.deepEqual([2023, 2024, 2025, 2026, 2027].map((year) => lunarToSolar(1, 1, year)), ['2023-01-22', '2024-02-10', '2025-01-29', '2026-02-17', '2027-02-06']);
  assert.deepEqual([2024, 2025, 2026].map((year) => lunarToSolar(10, 3, year)), ['2024-04-18', '2025-04-07', '2026-04-26']);
});

test('11 ngày lễ theo luật, nghỉ bù khi trùng ngày nghỉ hằng tuần', () => {
  setHolidayOverrides({});
  assert.equal(statutoryHolidays(2026).length, 11);
  // Giỗ Tổ 26/4/2026 là chủ nhật: nghỉ bù thứ hai 27/4.
  assert.ok(holidaysOf(2026).some((item) => item.kind === 'compensation' && item.date === '2026-04-27'));
  setHolidayOverrides({ weeklyRestDays: [0, 6] });
  // Thứ bảy 02/5/2026 không phải ngày lễ; 30/4 thứ năm, 01/5 thứ sáu: không nghỉ bù.
  assert.ok(!holidaysOf(2026).some((item) => item.kind === 'compensation' && item.date.startsWith('2026-05')));
  setHolidayOverrides({});
});

test('hạn nộp, ngày làm việc và hệ số làm thêm dùng lịch ngày lễ', () => {
  setHolidayOverrides({});
  assert.equal(nextWorkingDay('2026-04-30'), '2026-05-04');
  assert.equal(nextWorkingDay('2026-02-16'), '2026-02-23');
  assert.equal(addWorkingDays('2026-02-13', 1), '2026-02-23');
  assert.equal(overtimeMinMultiplier('2026-02-18'), 3);
  assert.equal(overtimeMinMultiplier('2026-03-08'), 2);
  assert.equal(overtimeMinMultiplier('2026-03-09'), 1.5);
  assert.equal(isHoliday('2026-04-26'), true);
});
