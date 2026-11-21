// Quy tắc xử lý kỷ luật lao động.
// Căn cứ: Bộ luật Lao động 45/2019/QH14 Điều 122 (nguyên tắc, trình tự: chứng minh được lỗi, có tổ chức đại diện người lao động tại cơ sở tham
// gia, người lao động có mặt và tự bào chữa, lập biên bản; mỗi hành vi chỉ một hình thức kỷ luật; không xử lý khi đang nghỉ ốm đau, điều dưỡng,
// bị tạm giữ, tạm giam, chờ cơ quan có thẩm quyền kết luận, lao động nữ mang thai, nghỉ thai sản, nuôi con dưới 12 tháng), Điều 123 (thời hiệu 6
// tháng, 12 tháng với hành vi liên quan trực tiếp đến tài chính, tài sản, bí mật công nghệ, bí mật kinh doanh), Điều 124 (bốn hình thức: khiển
// trách, kéo dài thời hạn nâng lương tối đa 6 tháng, cách chức với người giữ chức vụ quản lý, sa thải), Điều 125 (các trường hợp sa thải), Điều 127
// (cấm phạt tiền, cắt lương thay xử lý kỷ luật), Nghị định 145/2020/NĐ-CP Điều 70 (thông báo họp xử lý kỷ luật trước ít nhất 5 ngày làm việc).
// Xác minh qua bài tổng hợp (thuvienphapluat.vn, lsvn.vn, luatminhkhue.vn), chưa đối chiếu bản gốc; chưa tính ngày lễ khi đếm ngày làm việc, chưa tính
// thời hiệu kéo dài tối đa 60 ngày khi người lao động đang trong thời gian không được xử lý, chưa kiểm tra thẩm quyền ký quyết định và thời hạn
// xóa kỷ luật.

import { addWorkingDays } from './terminationRules.mjs';

export const DISCIPLINE_FORMS = {
  warning: 'Khiển trách',
  delay_raise: 'Kéo dài thời hạn nâng lương',
  demotion: 'Cách chức',
  dismissal: 'Sa thải',
};
export const VIOLATION_KINDS = {
  general: 'Vi phạm thông thường (thời hiệu 6 tháng)',
  financial: 'Liên quan trực tiếp đến tài chính, tài sản, bí mật công nghệ, bí mật kinh doanh (thời hiệu 12 tháng)',
};
export const DISMISSAL_GROUNDS = {
  misconduct: 'Trộm cắp, tham ô, đánh bạc, cố ý gây thương tích, sử dụng ma túy tại nơi làm việc, tiết lộ bí mật, hành vi gây thiệt hại hoặc xâm hại tình dục',
  repeat: 'Tái phạm trong thời gian chưa xóa kỷ luật (đã bị kéo dài thời hạn nâng lương hoặc cách chức)',
  damage: 'Gây thiệt hại nghiêm trọng hoặc đe dọa gây thiệt hại đặc biệt nghiêm trọng',
  absence: 'Tự ý bỏ việc 5 ngày cộng dồn trong 30 ngày hoặc 20 ngày cộng dồn trong 365 ngày không có lý do chính đáng',
};
export const PROTECTED_STATUSES = {
  none: 'Không thuộc trường hợp được bảo vệ',
  sick_leave: 'Đang nghỉ ốm đau, điều dưỡng hoặc nghỉ việc được người sử dụng lao động đồng ý',
  detained: 'Đang bị tạm giữ, tạm giam',
  pending_investigation: 'Đang chờ cơ quan có thẩm quyền xác minh, kết luận',
  pregnant_or_maternity: 'Lao động nữ mang thai hoặc đang nghỉ thai sản',
  child_under_12_months: 'Đang nuôi con dưới 12 tháng tuổi',
  cognitive_impairment: 'Mắc bệnh tâm thần hoặc bệnh khác làm mất khả năng nhận thức',
};
export const ATTENDANCE = { attended: 'Người lao động có mặt và tự bào chữa', refused: 'Đã thông báo 3 lần nhưng người lao động không có mặt' };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value) => ISO.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function addMonthsIso(iso, months) {
  const date = new Date(`${iso}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}

// Chuẩn hóa và kiểm tra một hồ sơ kỷ luật. `leaves` là các đơn nghỉ đã duyệt của nhân viên để đối chiếu thời gian không được xử lý kỷ luật.
// Ném Error tiếng Việt ở vi phạm đầu tiên; trả về hồ sơ đã chuẩn hóa và các số máy chủ tính.
export function assessDiscipline(input, { today, leaves = [] }) {
  const source = input && typeof input === 'object' ? input : {};
  if (!DISCIPLINE_FORMS[source.form]) throw new Error('Chọn hình thức kỷ luật: khiển trách, kéo dài thời hạn nâng lương, cách chức hoặc sa thải (Điều 124).');
  if (!VIOLATION_KINDS[source.violationKind]) throw new Error('Chọn loại hành vi vi phạm để xác định thời hiệu xử lý.');
  const dates = {};
  for (const [field, label] of [['violationDate', 'Ngày xảy ra vi phạm'], ['discoveredDate', 'Ngày phát hiện'], ['noticeDate', 'Ngày thông báo họp xử lý kỷ luật'], ['hearingDate', 'Ngày họp xử lý kỷ luật'], ['decisionDate', 'Ngày ra quyết định']]) {
    const value = String(source[field] ?? '').trim();
    if (!validDate(value)) throw new Error(`${label} không hợp lệ.`);
    dates[field] = value;
  }
  if (dates.decisionDate > today) throw new Error('Ngày ra quyết định không được ở tương lai.');
  if (dates.discoveredDate < dates.violationDate) throw new Error('Ngày phát hiện không được trước ngày xảy ra vi phạm.');
  if (dates.noticeDate < dates.discoveredDate) throw new Error('Ngày thông báo họp không được trước ngày phát hiện vi phạm.');
  if (dates.hearingDate < dates.noticeDate) throw new Error('Ngày họp không được trước ngày thông báo.');
  if (dates.decisionDate < dates.hearingDate) throw new Error('Quyết định kỷ luật chỉ được ra sau cuộc họp xử lý kỷ luật.');
  const limitationMonths = source.violationKind === 'financial' ? 12 : 6;
  const limitationDeadline = addMonthsIso(dates.violationDate, limitationMonths);
  if (dates.decisionDate > limitationDeadline) throw new Error(`Đã quá thời hiệu xử lý kỷ luật ${limitationMonths} tháng (đến hết ${limitationDeadline}) theo Điều 123 Bộ luật Lao động 2019.`);
  const earliestHearing = addWorkingDays(dates.noticeDate, 5);
  if (dates.hearingDate < earliestHearing) throw new Error(`Phải thông báo họp xử lý kỷ luật trước ít nhất 5 ngày làm việc; sớm nhất được họp vào ${earliestHearing} (Nghị định 145/2020 Điều 70).`);
  if (!ATTENDANCE[source.attendance]) throw new Error('Cần ghi nhận người lao động đã có mặt tự bào chữa hoặc đã thông báo 3 lần mà không có mặt.');
  if (source.unionParticipated !== true && source.noUnionOrganization !== true) throw new Error('Cuộc họp phải có đại diện tổ chức đại diện người lao động tại cơ sở tham gia; nếu doanh nghiệp chưa có tổ chức này thì đánh dấu chưa có (Điều 122).');
  if (source.minutesRecorded !== true) throw new Error('Cuộc họp xử lý kỷ luật phải được lập thành biên bản.');
  const protectedStatus = source.protectedStatus || 'none';
  if (!PROTECTED_STATUSES[protectedStatus]) throw new Error('Trường hợp được bảo vệ không hợp lệ.');
  if (protectedStatus !== 'none') throw new Error(`Không được xử lý kỷ luật: ${PROTECTED_STATUSES[protectedStatus].toLowerCase()} (Điều 122 khoản 4).`);
  const covering = leaves.find((leave) => ['Nghỉ ốm BHXH', 'Nghỉ thai sản'].includes(leave.leaveType) && leave.status === 'Đã duyệt'
    && [dates.hearingDate, dates.decisionDate].some((date) => leave.startDate <= date && date <= leave.endDate));
  if (covering) throw new Error(`Người lao động đang nghỉ "${covering.leaveType}" (${covering.startDate} đến ${covering.endDate}); không được họp hoặc ra quyết định xử lý kỷ luật trong thời gian này (Điều 122 khoản 4).`);
  const result = { form: source.form, violationKind: source.violationKind, ...dates, attendance: source.attendance, unionParticipated: source.unionParticipated === true, noUnionOrganization: source.noUnionOrganization === true, minutesRecorded: true, protectedStatus };
  if (source.form === 'delay_raise') {
    const months = Number(source.delayMonths);
    if (!Number.isInteger(months) || months < 1 || months > 6) throw new Error('Kéo dài thời hạn nâng lương tối đa 6 tháng (Điều 124).');
    result.delayMonths = months;
  } else if (source.form === 'demotion') {
    if (source.managerialPosition !== true) throw new Error('Cách chức chỉ áp dụng với người lao động đang giữ chức vụ quản lý (Điều 124).');
    result.managerialPosition = true;
  } else if (source.form === 'dismissal') {
    if (!DISMISSAL_GROUNDS[source.dismissalGround]) throw new Error('Sa thải chỉ áp dụng trong các trường hợp của Điều 125; hãy chọn căn cứ sa thải.');
    result.dismissalGround = source.dismissalGround;
  }
  return { discipline: result, assessment: { limitationMonths, limitationDeadline, earliestHearingDate: earliestHearing, formLabel: DISCIPLINE_FORMS[source.form] } };
}
