// Quy tắc hồ sơ bảo hiểm xã hội: báo tăng, giảm, điều chỉnh mức lương đóng (mẫu D02-LT) và hồ sơ hưởng chế độ.
// Căn cứ: Luật Bảo hiểm xã hội 41/2024/QH15 Điều 28 (đăng ký tham gia trong 30 ngày kể từ ngày hợp đồng lao động có hiệu lực), Điều 31
// (tiền lương đóng của người làm theo hợp đồng lao động là tiền lương tháng, tối đa 20 lần mức tham chiếu), Bộ luật Lao động 2019 Điều 90
// (tiền lương không thấp hơn lương tối thiểu vùng), Luật Việc làm (bảo hiểm thất nghiệp tối đa 20 lần lương tối thiểu vùng). Thời gian hưởng
// chế độ: thai sản 6 tháng, sinh đôi trở lên mỗi con thêm 1 tháng; dưỡng sức sau sinh tối đa 10 ngày; khám thai mỗi lần tối đa 2 ngày; ốm đau
// tối đa 60 ngày một năm (30, 40 hoặc 60 ngày tùy số năm đóng; hệ thống chỉ chặn mức cao nhất vì chưa có số năm đóng). Xác minh qua trí nhớ văn
// bản và bài tổng hợp, chưa đối chiếu bản gốc; mức tham chiếu lấy bằng lương cơ sở trong payrollRules.mjs.

import { normalizePeriod, payrollParameters } from './payrollRules.mjs';

export const ADJUST_TYPES = ['Báo tăng mới', 'Báo giảm hẳn', 'Điều chỉnh tăng lương', 'Nghỉ thai sản', 'Nghỉ ốm dài ngày'];
export const REGIME_TYPES = ['Ốm đau ngắn ngày', 'Thai sản (6 tháng)', 'Dưỡng sức sau sinh', 'Khám thai định kỳ'];
export const REGISTRATION_DEADLINE_DAYS = 30;
export const SICK_DAYS_YEARLY_CEILING = 60;

export function normalizeInsuranceMonth(value) {
  return normalizePeriod(String(value || '').replace(/^\s*tháng\s*/i, ''));
}

// Mức lương đóng mới của hồ sơ D02: không thấp hơn lương tối thiểu vùng (trừ báo giảm hẳn), vượt trần thì chỉ đóng bằng trần.
export function adjustmentSalaryCheck({ adjustType, newSalary, region, month, filingDate }) {
  const warnings = [];
  let params;
  try { params = payrollParameters(month, region); } catch (error) { return { error: error.message, warnings }; }
  if (adjustType !== 'Báo giảm hẳn' && newSalary < params.regionalMinimumWage) {
    return { error: `Mức lương đóng ${newSalary.toLocaleString('vi-VN')} đồng thấp hơn lương tối thiểu vùng ${region} (${params.regionalMinimumWage.toLocaleString('vi-VN')} đồng) của tháng ${month}.`, warnings };
  }
  if (newSalary > params.socialHealthCap) warnings.push(`Mức lương vượt trần: bảo hiểm xã hội, y tế chỉ tính trên mức trần ${params.socialHealthCap.toLocaleString('vi-VN')} đồng (20 lần mức tham chiếu).`);
  if (newSalary > params.unemploymentCap) warnings.push(`Bảo hiểm thất nghiệp chỉ tính trên mức trần ${params.unemploymentCap.toLocaleString('vi-VN')} đồng (20 lần lương tối thiểu vùng ${region}).`);
  if (adjustType === 'Báo tăng mới' && filingDate) {
    const deadline = new Date(`${month}-01T00:00:00Z`);
    deadline.setUTCDate(deadline.getUTCDate() + REGISTRATION_DEADLINE_DAYS);
    const iso = deadline.toISOString().slice(0, 10);
    if (filingDate > iso) warnings.push(`Báo tăng nộp sau ${REGISTRATION_DEADLINE_DAYS} ngày kể từ đầu tháng tham gia (hạn ${iso}); đăng ký chậm có thể bị truy thu, phạt (Luật Bảo hiểm xã hội 2024 Điều 28).`);
  }
  return { error: '', warnings };
}

// Số ngày tối đa của một hồ sơ hưởng chế độ; ốm đau còn bị cộng dồn theo năm.
export function regimeDaysProblem({ regimeType, leaveDays, childrenCount = 1, sickDaysThisYear = 0 }) {
  if (!REGIME_TYPES.includes(regimeType)) return 'Loại chế độ hưởng không hợp lệ.';
  if (!Number.isInteger(leaveDays * 2) || leaveDays <= 0) return 'Số ngày nghỉ hưởng chế độ phải lớn hơn 0 và theo nửa ngày.';
  if (regimeType === 'Thai sản (6 tháng)') {
    const children = Number.isInteger(childrenCount) && childrenCount > 0 ? childrenCount : 1;
    const max = 180 + 30 * (children - 1);
    if (leaveDays > max) return `Nghỉ thai sản khi sinh ${children} con tối đa ${max} ngày (6 tháng, mỗi con thứ hai trở đi thêm 1 tháng).`;
  }
  if (regimeType === 'Dưỡng sức sau sinh' && leaveDays > 10) return 'Nghỉ dưỡng sức, phục hồi sức khỏe sau thai sản tối đa 10 ngày.';
  if (regimeType === 'Khám thai định kỳ' && leaveDays > 2) return 'Mỗi lần khám thai được nghỉ tối đa 2 ngày.';
  if (regimeType === 'Ốm đau ngắn ngày' && sickDaysThisYear + leaveDays > SICK_DAYS_YEARLY_CEILING) return `Tổng ngày hưởng ốm đau trong năm vượt ${SICK_DAYS_YEARLY_CEILING} ngày (mức cao nhất khi đã đóng từ 30 năm).`;
  return '';
}
