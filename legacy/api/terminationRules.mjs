// Chấm dứt hợp đồng lao động: thời hạn báo trước, trợ cấp thôi việc, trợ cấp mất việc làm, tiền phép năm chưa nghỉ và hạn thanh toán.
// Căn cứ: Bộ luật Lao động 45/2019/QH14 Điều 35, 36 (báo trước 45 ngày với hợp đồng không xác định thời hạn, 30 ngày với hợp đồng 12 đến 36
// tháng, 3 ngày làm việc với hợp đồng dưới 12 tháng), Điều 40, 41 (chấm dứt trái pháp luật), Điều 45 (thông báo chấm dứt khi hết hạn: 15 ngày),
// Điều 46 (trợ cấp thôi việc nửa tháng lương mỗi năm làm việc, từ đủ 12 tháng, trừ thời gian đã tham gia bảo hiểm thất nghiệp), Điều 47 (trợ
// cấp mất việc làm một tháng lương mỗi năm, tối thiểu 2 tháng), Điều 48 (thanh toán trong 14 ngày làm việc), Điều 113 (phép năm), Nghị định
// 145/2020/NĐ-CP Điều 8 (làm tròn tháng lẻ: từ 1 đến dưới 6 tháng tính nửa năm, từ 6 tháng tính một năm). Nghị định 337/2025/NĐ-CP (từ 01/01/2026)
// có thể sửa đổi hướng dẫn. Xác minh qua bài tổng hợp (thuvienphapluat.vn, luatvietnam.vn), chưa đối chiếu văn bản gốc; quy tắc làm tròn tháng lẻ,
// ngày công chuẩn 26 ngày và mức trả tiền phép chưa xác nhận. Trường hợp báo trước đặc biệt (ốm đau, thai sản, thiên tai, địch họa) chưa tính.

import { isNonWorkingDay } from './holidayRules.mjs';

export const TERMINATION_TYPES = {
  mutual: 'Hai bên thỏa thuận (Điều 34 khoản 3)',
  expiry: 'Hết hạn hợp đồng (Điều 34 khoản 1)',
  completed: 'Hoàn thành công việc theo hợp đồng (Điều 34 khoản 2)',
  employee_unilateral: 'Người lao động đơn phương chấm dứt (Điều 35)',
  employer_unilateral: 'Người sử dụng lao động đơn phương chấm dứt (Điều 36)',
  restructuring: 'Thay đổi cơ cấu, công nghệ, lý do kinh tế (Điều 42, 43)',
  discipline: 'Sa thải (Điều 125)',
  retirement: 'Nghỉ hưu',
};
export const STANDARD_WORKING_DAYS = 26;
const DAY_MS = 86_400_000;

const isoDate = (value, label) => {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text) throw new Error(`${label} không hợp lệ.`);
  return text;
};
const money = (value, label) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} phải là số nguyên không âm.`);
  return number;
};
const dayCount = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

// Số tháng tròn từ ngày bắt đầu đến ngày chấm dứt (tháng lẻ chưa đủ một tháng bỏ qua).
export function wholeMonthsBetween(from, to) {
  const a = from.split('-').map(Number);
  const b = to.split('-').map(Number);
  return Math.max(0, (b[0] - a[0]) * 12 + (b[1] - a[1]) - (b[2] < a[2] ? 1 : 0));
}
// Làm tròn thời gian tính trợ cấp: từ đủ 6 tháng lẻ tính một năm, từ 1 đến dưới 6 tháng lẻ tính nửa năm.
export function severanceYears(months) {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return years + (rest >= 6 ? 1 : rest >= 1 ? 0.5 : 0);
}
// Ngày làm việc: bỏ thứ bảy, chủ nhật và ngày nghỉ lễ, tết, nghỉ bù (holidayRules.mjs).
const isoOf = (time) => new Date(time).toISOString().slice(0, 10);
export function workingDaysBetween(from, to) {
  let count = 0;
  for (let time = Date.parse(`${from}T00:00:00Z`) + DAY_MS; time <= Date.parse(`${to}T00:00:00Z`); time += DAY_MS) {
    if (!isNonWorkingDay(isoOf(time))) count += 1;
  }
  return count;
}
export function addWorkingDays(from, days) {
  let time = Date.parse(`${from}T00:00:00Z`);
  let left = days;
  while (left > 0) {
    time += DAY_MS;
    if (!isNonWorkingDay(isoOf(time))) left -= 1;
  }
  return isoOf(time);
}

// Báo trước tối thiểu: { days, unit } với unit 'ngày' hoặc 'ngày làm việc'.
export function noticeRequirement({ type, contractKind, termMonths }) {
  if (type === 'employee_unilateral' || type === 'employer_unilateral') {
    if (contractKind === 'indefinite') return { days: 45, unit: 'ngày' };
    if (termMonths >= 12) return { days: 30, unit: 'ngày' };
    return { days: 3, unit: 'ngày làm việc' };
  }
  return { days: 0, unit: 'ngày' };
}

export function settleTermination(input, { today }) {
  if (!Object.hasOwn(TERMINATION_TYPES, input.type)) throw new Error('Loại chấm dứt hợp đồng không hợp lệ.');
  const type = input.type;
  const contractKind = input.contractKind === 'fixed' ? 'fixed' : 'indefinite';
  const termMonths = contractKind === 'fixed' ? money(input.termMonths, 'Thời hạn hợp đồng (tháng)') : 0;
  const workStartDate = isoDate(input.workStartDate, 'Ngày bắt đầu làm việc');
  const lastWorkingDate = isoDate(input.lastWorkingDate, 'Ngày chấm dứt hợp đồng');
  if (lastWorkingDate < workStartDate) throw new Error('Ngày chấm dứt không được trước ngày bắt đầu làm việc.');
  const noticeGivenDate = input.noticeGivenDate ? isoDate(input.noticeGivenDate, 'Ngày báo trước') : '';
  if (noticeGivenDate && noticeGivenDate > lastWorkingDate) throw new Error('Ngày báo trước không được sau ngày chấm dứt.');
  const averageSalary = money(input.averageSalary, 'Tiền lương bình quân 6 tháng');
  if (averageSalary <= 0) throw new Error('Tiền lương bình quân phải lớn hơn 0.');
  const monthsWorked = wholeMonthsBetween(workStartDate, lastWorkingDate);
  const insuredMonths = money(input.unemploymentInsuredMonths ?? 0, 'Số tháng đã tham gia bảo hiểm thất nghiệp');
  const paidSeveranceMonths = money(input.paidSeveranceMonths ?? 0, 'Số tháng đã được chi trả trợ cấp trước đó');
  if (insuredMonths + paidSeveranceMonths > monthsWorked) throw new Error('Tổng số tháng đã tham gia bảo hiểm thất nghiệp và đã nhận trợ cấp không được vượt thời gian làm việc.');
  const unusedLeaveDays = Number(input.unusedLeaveDays ?? 0);
  if (!Number.isFinite(unusedLeaveDays) || unusedLeaveDays < 0 || unusedLeaveDays > 60 || Math.round(unusedLeaveDays * 2) !== unusedLeaveDays * 2) throw new Error('Số ngày phép chưa nghỉ phải từ 0 đến 60, bội số của 0,5.');
  const exempt = input.exemptFromNotice === true;
  const notes = [];

  const required = exempt ? { days: 0, unit: 'ngày' } : noticeRequirement({ type, contractKind, termMonths });
  const given = noticeGivenDate
    ? (required.unit === 'ngày làm việc' ? workingDaysBetween(noticeGivenDate, lastWorkingDate) : dayCount(noticeGivenDate, lastWorkingDate))
    : 0;
  const shortNoticeDays = Math.max(0, required.days - given);
  const dailySalary = Math.round(averageSalary / STANDARD_WORKING_DAYS);
  const shortNoticeAmount = shortNoticeDays * dailySalary;
  const unlawfulByEmployee = type === 'employee_unilateral' && shortNoticeDays > 0;
  if (type === 'employee_unilateral' && exempt) notes.push('Thuộc trường hợp không cần báo trước (Điều 35 khoản 2): cần giữ chứng cứ lý do.');
  if (type === 'employer_unilateral' && shortNoticeDays > 0) notes.push('Người sử dụng lao động báo trước thiếu: phải trả tiền lương những ngày không báo trước (Điều 41).');
  if (type === 'expiry' && contractKind === 'fixed') {
    const early = noticeGivenDate ? dayCount(noticeGivenDate, lastWorkingDate) : 0;
    if (early < 15) notes.push('Hợp đồng xác định thời hạn hết hạn: người sử dụng lao động phải thông báo bằng văn bản trước ít nhất 15 ngày (Điều 45).');
  }
  if (type === 'discipline') notes.push('Sa thải: không có trợ cấp thôi việc; kiểm tra trình tự xử lý kỷ luật (Điều 122, 123, 125).');
  if (type === 'retirement') notes.push('Nghỉ hưu: không có trợ cấp thôi việc; người lao động hưởng lương hưu theo luật bảo hiểm xã hội.');
  if (unlawfulByEmployee) notes.push('Người lao động đơn phương chấm dứt không báo trước đủ: không được trợ cấp thôi việc, phải bồi thường nửa tháng lương và tiền lương những ngày không báo trước (Điều 40).');

  const effectiveMonths = Math.max(0, monthsWorked - insuredMonths - paidSeveranceMonths);
  const years = severanceYears(effectiveMonths);
  const eligibleTenure = monthsWorked >= 12;
  const allowanceType = type === 'restructuring' ? 'job_loss'
    : ['discipline', 'retirement'].includes(type) || unlawfulByEmployee ? 'none' : 'severance';
  let allowance = 0;
  if (allowanceType !== 'none' && eligibleTenure) {
    allowance = allowanceType === 'job_loss' ? Math.round(Math.max(years, 2) * averageSalary) : Math.round(years * 0.5 * averageSalary);
  } else if (allowanceType !== 'none') notes.push('Làm việc chưa đủ 12 tháng: chưa có trợ cấp thôi việc hoặc mất việc làm.');
  const leavePayout = Math.round(unusedLeaveDays * dailySalary);
  const employeeOwes = unlawfulByEmployee ? Math.round(averageSalary / 2) + shortNoticeAmount : 0;
  const employerPays = allowance + leavePayout + (type === 'employer_unilateral' ? shortNoticeAmount : 0);
  return {
    type, typeLabel: TERMINATION_TYPES[type], contractKind, termMonths, workStartDate, lastWorkingDate, noticeGivenDate, exemptFromNotice: exempt, averageSalary,
    unemploymentInsuredMonths: insuredMonths, paidSeveranceMonths, unusedLeaveDays, monthsWorked, effectiveMonths, severanceYears: years,
    noticeRequiredDays: required.days, noticeUnit: required.unit, noticeGivenDays: given, shortNoticeDays, dailySalary, shortNoticeAmount,
    allowanceType, allowance, leavePayout, employerPays, employeeOwes, settlementDueDate: addWorkingDays(lastWorkingDate, 14),
    settlementOverdue: addWorkingDays(lastWorkingDate, 14) < today, notes,
  };
}
