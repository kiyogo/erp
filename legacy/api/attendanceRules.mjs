// Quy tắc chấm công, nghỉ phép, ca làm việc và làm thêm giờ theo pháp luật lao động Việt Nam.
// Căn cứ: Bộ luật Lao động 45/2019/QH14 Điều 105 (thời giờ làm việc bình thường không quá 8 giờ một ngày và 48 giờ một tuần;
// quy định theo tuần thì không quá 10 giờ một ngày), Điều 106 (giờ làm việc ban đêm từ 22 giờ đến 6 giờ sáng), Điều 109 (nghỉ giữa giờ
// ít nhất 30 phút khi làm từ 6 giờ trở lên một ngày, 45 phút khi làm ban đêm), Điều 110 (nghỉ ít nhất 12 giờ khi chuyển ca),
// Điều 98 (làm đêm trả thêm ít nhất 30%; làm thêm 150% ngày thường, 200% ngày nghỉ hằng tuần, 300% ngày lễ, tết), Điều 113 và 114 (nghỉ hằng
// năm 12, 14, 16 ngày, cứ đủ 5 năm làm việc thêm 1 ngày), Điều 115 (nghỉ việc riêng: kết hôn 3 ngày, con kết hôn 1 ngày, cha mẹ, vợ chồng,
// con chết 3 ngày hưởng nguyên lương; 1 ngày không lương khi ông bà, anh chị em ruột chết hoặc cha mẹ kết hôn), Điều 146 (không dùng người
// chưa đủ 18 tuổi làm thêm giờ, làm đêm), Luật Bảo hiểm xã hội 41/2024/QH15 Điều 53 (lao động nam nghỉ 5 ngày làm việc khi vợ sinh, tối đa 14
// ngày khi sinh đôi phải phẫu thuật). Xác minh qua bài tổng hợp, chưa đối chiếu văn bản gốc: số ngày nghỉ khi sinh nhiều con (Điều 53) và
// Luật Dân số 2025 chưa kiểm tra; cách tính phép năm cho người làm chưa đủ 12 tháng (Nghị định 145/2020/NĐ-CP Điều 66) là gần đúng:
// một tháng tính khi làm từ 14 ngày làm việc trở lên, làm tròn đến nửa ngày.

import { isHoliday, isWeeklyRestDay, personalHolidays } from './holidayRules.mjs';

export const LEAVE_TYPES = [
  { label: 'Nghỉ phép năm', annual: true },
  { label: 'Nghỉ ốm BHXH', aliases: ['Nghỉ ốm'] },
  { label: 'Nghỉ kết hôn', maxDays: 3 },
  { label: 'Nghỉ khi con kết hôn', maxDays: 1 },
  { label: 'Nghỉ tang cha mẹ, vợ chồng, con', maxDays: 3 },
  { label: 'Nghỉ việc riêng 1 ngày không lương', maxDays: 1 },
  { label: 'Nghỉ thai sản' },
  { label: 'Nghỉ chăm vợ sinh con', maxDays: 14 },
  { label: 'Nghỉ không lương', aliases: ['Nghỉ việc riêng không lương'] },
  { label: 'Nghỉ việc riêng có lương', maxDays: 3 },
];

export const annualLeaveLabel = 'Nghỉ phép năm';

// Trả về tên chuẩn của loại nghỉ (nhận cả tên cũ), chuỗi rỗng khi không có trong danh mục.
export function normalizeLeaveType(value) {
  const text = String(value ?? '').trim();
  const found = LEAVE_TYPES.find((type) => type.label === text || type.aliases?.includes(text));
  return found ? found.label : '';
}

export function leaveDaysProblem(label, days) {
  const type = LEAVE_TYPES.find((item) => item.label === label);
  if (type?.maxDays && days > type.maxDays) return `${label} tối đa ${type.maxDays} ngày theo luật (Điều 115 Bộ luật Lao động 2019, Điều 53 Luật Bảo hiểm xã hội 2024).`;
  return '';
}

// Số ngày làm việc (thứ hai đến thứ sáu) từ ngày bắt đầu đến cuối tháng.
function weekdaysFrom(year, month, startDay) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let count = 0;
  for (let day = startDay; day <= last; day++) {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (weekday >= 1 && weekday <= 5) count++;
  }
  return count;
}

const roundHalf = (value) => Math.round(value * 2) / 2;

// Hạn mức phép năm của một năm: số ngày cơ bản theo hợp đồng (12, 14, 16 ngày), thêm 1 ngày cho mỗi 5 năm làm việc tính đến cuối năm;
// vào làm trong năm thì tính theo số tháng làm việc.
export function annualLeaveEntitlement({ baseDays, joinDate, year }) {
  const base = Number(baseDays) || 12;
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error('Năm phép không hợp lệ.');
  const joined = /^\d{4}-\d{2}-\d{2}$/.test(joinDate || '') ? joinDate : '';
  const [joinYear, joinMonth, joinDay] = joined ? joined.split('-').map(Number) : [0, 0, 0];
  if (joined && joinYear > year) return { baseDays: base, seniorityDays: 0, monthsWorked: 0, standardQuota: 0, seniorityQuota: 0, entitled: 0 };
  // Số năm tròn đến 31/12 của năm tính phép chính là hiệu hai năm.
  const seniorityDays = joined ? Math.floor((year - joinYear) / 5) : 0;
  let monthsWorked = 12;
  if (joined && joinYear === year) {
    monthsWorked = 12 - joinMonth + (weekdaysFrom(year, joinMonth, joinDay) >= 14 ? 1 : 0);
  }
  const factor = monthsWorked / 12;
  const standardQuota = monthsWorked === 12 ? base : roundHalf(base * factor);
  const seniorityQuota = monthsWorked === 12 ? seniorityDays : roundHalf(seniorityDays * factor);
  return { baseDays: base, seniorityDays, monthsWorked, standardQuota, seniorityQuota, entitled: standardQuota + seniorityQuota };
}

// Hệ số làm thêm tối thiểu: 150% ngày thường, 200% ngày nghỉ hằng tuần (theo thiết lập lịch nghỉ, mặc định thứ bảy, chủ nhật), 300% ngày lễ, tết, nghỉ bù
// có hưởng lương (holidayRules.mjs, gồm Tết Âm lịch và Giỗ Tổ theo lịch âm).
// details: hồ sơ người lao động; ngày nghỉ thêm của người nước ngoài (Tết cổ truyền, Quốc khánh nước họ) cũng là ngày lễ hưởng lương.
export function overtimeMinMultiplier(isoDate, details = null) {
  if (isHoliday(isoDate)) return 3;
  if (details && personalHolidays(details, Number(String(isoDate).slice(0, 4))).some((item) => item.date === isoDate)) return 3;
  return isWeeklyRestDay(isoDate) ? 2 : 1.5;
}

export function isMinor(birthDate, onDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate || '')) return false;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = String(onDate).split('-').map(Number);
  const age = y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
  return age < 18;
}

const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

// Số giờ của ca nằm trong khung 22 giờ đến 6 giờ sáng.
export function nightHoursOfShift(startTime, endTime) {
  const start = toMinutes(startTime);
  let length = (toMinutes(endTime) - start + 1440) % 1440;
  if (length === 0) length = 1440;
  let night = 0;
  for (let minute = 0; minute < length; minute++) {
    const clock = (start + minute) % 1440;
    if (clock >= 22 * 60 || clock < 6 * 60) night++;
  }
  return night / 60;
}

// Kiểm tra ca làm việc theo Điều 105, 106, 109 và 98: trả về nightHours và danh sách vi phạm (rỗng khi hợp lệ).
export function shiftLegalProblems({ startTime, endTime, workingHours, breakMinutes = 0, nightAllowancePct = 0 }) {
  const nightHours = nightHoursOfShift(startTime, endTime);
  const problems = [];
  if (workingHours > 10) problems.push('Giờ làm việc bình thường không quá 10 giờ một ngày (Điều 105 Bộ luật Lao động 2019; quy định theo tuần còn phải không quá 48 giờ một tuần).');
  const needed = nightHours > 0 ? 45 : 30;
  if (workingHours >= 6 && breakMinutes < needed) problems.push(`Ca làm từ 6 giờ trở lên phải có nghỉ giữa giờ liên tục ít nhất ${needed} phút${nightHours > 0 ? ' khi làm ban đêm' : ''} (Điều 109 Bộ luật Lao động 2019).`);
  if (nightHours > 0 && nightAllowancePct < 30) problems.push('Ca có giờ làm việc ban đêm (22 giờ đến 6 giờ) phải trả thêm ít nhất 30% tiền lương (Điều 98 Bộ luật Lao động 2019).');
  return { nightHours, problems };
}

// Giờ nghỉ giữa hai ca liền nhau: ca trước kết thúc ngày cuối, ca sau bắt đầu ngày kế tiếp (Điều 110 yêu cầu ít nhất 12 giờ).
export function restBetweenShiftsHours(previousShift, nextShift) {
  const previousStart = toMinutes(previousShift.startTime);
  const previousEnd = toMinutes(previousShift.endTime) + (toMinutes(previousShift.endTime) <= previousStart ? 1440 : 0);
  return (1440 + toMinutes(nextShift.startTime) - previousEnd) / 60;
}

export const MIN_REST_BETWEEN_SHIFTS_HOURS = 12;

export function addDaysIsoDate(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
