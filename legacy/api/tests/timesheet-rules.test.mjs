import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monthCalendar, overtimeBreakdown } from '../timesheetRules.mjs';
import { setHolidayOverrides } from '../holidayRules.mjs';

test('tháng 2/2026: 20 ngày công chuẩn, 5 ngày Tết hưởng lương', () => {
  setHolidayOverrides({});
  const calendar = monthCalendar('2026-02');
  assert.equal(calendar.days, 28);
  assert.equal(calendar.standardDays, 20);
  assert.equal(calendar.holidayDays, 5);
  assert.equal(calendar.workingDays, 15);
  // Tháng 4/2026: Giỗ Tổ chủ nhật 26/4 không tính, nghỉ bù 27/4 và 30/4 tính.
  assert.equal(monthCalendar('2026-04').holidayDays, 2);
});

test('giờ làm thêm xếp theo ngày thường, ngày nghỉ, ngày lễ và phần ban đêm', () => {
  setHolidayOverrides({});
  const result = overtimeBreakdown([
    { otDate: '2026-03-02', timeRange: '18:00 - 22:00', totalHours: 4 },
    { otDate: '2026-03-03', timeRange: '20:00 - 24:00'.replace('24:00', '00:00'), totalHours: 4 },
    { otDate: '2026-03-07', timeRange: '08:00 - 12:00', totalHours: 4 },
    { otDate: '2026-02-18', timeRange: '08:00 - 16:00', totalHours: 8 },
    { otDate: '2026-01-31', timeRange: '08:00 - 10:00', totalHours: 2 },
  ], '2026-03');
  assert.equal(result.otHoursWeekday, 6);
  assert.equal(result.otNightHoursWeekdayAfterOt, 2);
  assert.equal(result.otHoursWeekend, 4);
  assert.equal(result.otHoursHoliday, 0);
  assert.equal(overtimeBreakdown([{ otDate: '2026-02-18', timeRange: '08:00 - 16:00', totalHours: 8 }], '2026-02').otHoursHoliday, 8);
});
