// Bảng công tháng theo lịch nghỉ lễ: ngày lễ, tết, nghỉ bù rơi vào ngày làm việc là ngày nghỉ hưởng nguyên lương (Bộ luật Lao động 2019 Điều 112), được
// cộng vào ngày hưởng lương; giờ làm thêm lấy từ đơn đã duyệt và xếp theo loại ngày (ngày thường, ngày nghỉ hằng tuần, ngày lễ) và phần ban đêm
// (22 giờ đến 6 giờ, Điều 106) để tính tỷ lệ của payrollRules.mjs (Điều 98, Nghị định 145/2020 Điều 55 đến 57).
import { holidaysOf, isHoliday, isWeeklyRestDay, personalHolidays } from './holidayRules.mjs';
import { nightHoursOfShift } from './attendanceRules.mjs';

const pad = (value) => String(value).padStart(2, '0');

// details: hồ sơ người lao động (nếu có) để cộng ngày nghỉ thêm của người nước ngoài (Điều 112 khoản 2).
export function monthCalendar(month, details = null) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))) throw new Error('Kỳ công phải theo YYYY-MM.');
  const [year, monthNumber] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const dates = Array.from({ length: days }, (_, index) => `${month}-${pad(index + 1)}`);
  const restDates = dates.filter(isWeeklyRestDay);
  const holidays = [...holidaysOf(year), ...(details ? personalHolidays(details, year) : [])].filter((item) => item.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
  const paidHolidays = holidays.filter((item) => !isWeeklyRestDay(item.date));
  return {
    month, days,
    weeklyRestDays: restDates.length,
    // Ngày công chuẩn gợi ý: số ngày trong tháng trừ ngày nghỉ hằng tuần (ngày lễ vẫn tính vào công chuẩn và được trả lương).
    standardDays: days - restDates.length,
    holidayDays: paidHolidays.length,
    workingDays: days - restDates.length - paidHolidays.length,
    holidays,
  };
}

// overtimeRecords: đơn làm thêm đã duyệt của một người trong tháng ({ otDate, timeRange: 'HH:MM - HH:MM', totalHours }).
export function overtimeBreakdown(overtimeRecords, month, details = null) {
  const personal = new Set(details ? personalHolidays(details, Number(month.slice(0, 4))).map((item) => item.date) : []);
  const fields = { otHoursWeekday: 0, otHoursWeekend: 0, otHoursHoliday: 0, otNightHoursWeekday: 0, otNightHoursWeekdayAfterOt: 0, otNightHoursWeekend: 0, otNightHoursHoliday: 0 };
  const byDate = new Map();
  for (const record of overtimeRecords) {
    if (!String(record.otDate || '').startsWith(`${month}-`)) continue;
    const match = /^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/.exec(String(record.timeRange || ''));
    const total = Number(record.totalHours) || 0;
    const night = match ? Math.min(total, nightHoursOfShift(match[1], match[2])) : 0;
    const day = byDate.get(record.otDate) || { day: 0, night: 0 };
    byDate.set(record.otDate, { day: day.day + total - night, night: day.night + night });
  }
  for (const [date, hours] of byDate) {
    const kind = isHoliday(date) || personal.has(date) ? 'Holiday' : isWeeklyRestDay(date) ? 'Weekend' : 'Weekday';
    fields[`otHours${kind}`] += hours.day;
    if (hours.night) {
      // Ngày thường: làm thêm ban đêm sau khi đã làm thêm ban ngày cùng ngày trả 210%, không có thì 200%.
      const nightField = kind === 'Weekday' ? (hours.day > 0 ? 'otNightHoursWeekdayAfterOt' : 'otNightHoursWeekday') : `otNightHours${kind}`;
      fields[nightField] += hours.night;
    }
  }
  return Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, Math.round(value * 100) / 100]));
}
