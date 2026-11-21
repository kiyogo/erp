// Ngày nghỉ lễ, tết hưởng nguyên lương: Bộ luật Lao động 45/2019/QH14 Điều 112 (11 ngày: Tết Dương lịch 01/01; Tết Âm lịch 05 ngày; Chiến thắng
// 30/4; Quốc tế lao động 01/5; Quốc khánh 02/9 và 01 ngày liền kề trước hoặc sau; Giỗ Tổ Hùng Vương 10/3 âm lịch). Ngày nghỉ hằng tuần trùng ngày lễ
// thì nghỉ bù vào ngày làm việc kế tiếp (Điều 111 khoản 3). Thủ tướng hoặc Bộ Nội vụ quyết định cụ thể ngày nghỉ Tết Âm lịch và ngày liền kề Quốc
// khánh hằng năm (năm 2026: Thông báo 9441/TB-BNV); mặc định ở đây là ngày cuối năm âm lịch cùng mùng 1 đến mùng 4 và ngày 01/9, quản trị viên sửa
// theo thông báo chính thức (thêm, bỏ ngày, chọn ngày nghỉ hằng tuần). Xác minh qua bài tổng hợp (thuvienphapluat.vn, tuoitre.vn, luatvietnam.vn).
import { lunarToSolar } from './lunarCalendar.mjs';

const addDays = (iso, days) => { const date = new Date(`${iso}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const weekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

// Điều chỉnh do quản trị viên lưu (mặc định nghỉ thứ bảy, chủ nhật; doanh nghiệp làm thứ bảy thì bỏ chọn): { weeklyRestDays: [0, 6], years: { '2026': { extraDays: [{ date, name }], removedDates: [] } } }.
let overrides = { weeklyRestDays: [0, 6], years: {} };
const cache = new Map();

export function setHolidayOverrides(value) {
  overrides = { weeklyRestDays: Array.isArray(value?.weeklyRestDays) && value.weeklyRestDays.length ? value.weeklyRestDays : [0, 6], years: value?.years || {} };
  cache.clear();
}
export const holidayOverrides = () => overrides;
export const weeklyRestDays = () => overrides.weeklyRestDays;

// Các ngày lễ theo luật của năm dương lịch (chưa gồm điều chỉnh và nghỉ bù).
export function statutoryHolidays(year) {
  const tet = lunarToSolar(1, 1, year);
  return [
    { date: `${year}-01-01`, name: 'Tết Dương lịch' },
    { date: addDays(tet, -1), name: 'Tết Âm lịch (ngày cuối năm âm lịch)' },
    ...[0, 1, 2, 3].map((offset) => ({ date: addDays(tet, offset), name: `Tết Âm lịch (mùng ${offset + 1})` })),
    { date: lunarToSolar(10, 3, year), name: 'Giỗ Tổ Hùng Vương (10/3 âm lịch)' },
    { date: `${year}-04-30`, name: 'Ngày Chiến thắng' },
    { date: `${year}-05-01`, name: 'Ngày Quốc tế lao động' },
    { date: `${year}-09-01`, name: 'Quốc khánh (ngày liền kề)' },
    { date: `${year}-09-02`, name: 'Quốc khánh' },
  ].map((item) => ({ ...item, kind: 'statutory' }));
}

// Ngày nghỉ của năm: ngày lễ theo luật sau điều chỉnh, ngày thêm theo thông báo và ngày nghỉ bù khi ngày lễ trùng ngày nghỉ hằng tuần.
export function holidaysOf(year) {
  if (cache.has(year)) return cache.get(year);
  const adjust = overrides.years?.[String(year)] || {};
  const removed = new Set(adjust.removedDates || []);
  const rest = new Set(overrides.weeklyRestDays);
  const statutory = statutoryHolidays(year).filter((item) => !removed.has(item.date));
  const extra = (adjust.extraDays || []).filter((item) => !removed.has(item.date)).map((item) => ({ ...item, kind: 'announced' }));
  const taken = new Set([...statutory, ...extra].map((item) => item.date));
  const compensation = [];
  for (const item of statutory) {
    if (!rest.has(weekday(item.date))) continue;
    let day = addDays(item.date, 1);
    while (rest.has(weekday(day)) || taken.has(day)) day = addDays(day, 1);
    taken.add(day);
    compensation.push({ date: day, name: `Nghỉ bù ${item.name}`, kind: 'compensation' });
  }
  const list = [...statutory, ...extra, ...compensation].sort((a, b) => a.date.localeCompare(b.date));
  cache.set(year, list);
  return list;
}

export const isHoliday = (iso) => holidaysOf(Number(String(iso).slice(0, 4))).some((item) => item.date === iso);
export const isStatutoryHoliday = (iso) => statutoryHolidays(Number(String(iso).slice(0, 4))).some((item) => item.date === iso)
  && !(overrides.years?.[String(iso).slice(0, 4)]?.removedDates || []).includes(iso);
export const isWeeklyRestDay = (iso) => overrides.weeklyRestDays.includes(weekday(iso));
// Ngày làm việc của doanh nghiệp: không phải ngày nghỉ hằng tuần (đếm theo thứ bảy, chủ nhật như các thời hạn luật tính bằng ngày làm việc) và không
// phải ngày nghỉ lễ, tết, nghỉ bù.
export const isNonWorkingDay = (iso) => [0, 6].includes(weekday(iso)) || isHoliday(iso);
// Ngày nghỉ của cơ quan nhà nước (dời hạn nộp thuế): thứ bảy, chủ nhật, ngày lễ theo luật và ngày nghỉ theo thông báo (không dùng ngày nghỉ bù riêng
// của doanh nghiệp vì lịch nghỉ hằng tuần có thể khác).
export const isPublicNonWorkingDay = (iso) => [0, 6].includes(weekday(iso))
  || holidaysOf(Number(String(iso).slice(0, 4))).some((item) => item.date === iso && item.kind !== 'compensation');
