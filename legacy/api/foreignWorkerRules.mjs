// Người lao động nước ngoài làm việc tại Việt Nam: giấy phép lao động hoặc xác nhận không thuộc diện cấp giấy phép, thời hạn hợp đồng lao động.
// Căn cứ: Bộ luật Lao động 2019 Điều 151 (phải có giấy phép trừ trường hợp miễn; chỉ giao kết hợp đồng xác định thời hạn và thời hạn hợp đồng không vượt
// thời hạn giấy phép lao động), Điều 153, 154, 155; Nghị định 219/2025/NĐ-CP (từ 07/8/2025, thay Nghị định 152/2020 và 70/2023): giấy phép lao động
// tối đa 02 năm, gia hạn một lần tối đa 02 năm (Điều 29); Điều 7 các trường hợp không thuộc diện cấp giấy phép. Người nước ngoài không thuộc đối tượng
// bảo hiểm thất nghiệp (Luật Việc làm). Xác minh qua bài tổng hợp (ey.com, kpmg.com, luatvietan.vn), chưa đối chiếu bản gốc; số ngày phải nộp hồ sơ
// gia hạn trước khi hết hạn chưa xác nhận nên hệ thống nhắc từ 45 ngày.

import { isMonthDay } from './holidayRules.mjs';

const VIETNAM = new Set(['việt nam', 'viet nam', 'vietnam', 'vn', 'vnm']);
export const isForeignNationality = (value) => {
  const text = String(value ?? '').trim().toLocaleLowerCase('vi-VN');
  return Boolean(text) && !VIETNAM.has(text);
};

export const WORK_PERMIT_STATUSES = { permit: 'Có giấy phép lao động', exempt: 'Không thuộc diện cấp giấy phép (đã có xác nhận)', pending: 'Đang xin giấy phép' };
const FIELDS = ['foreignJobCategory', 'homeNationalDay', 'homeNewYearRule', 'homeNewYearDate', 'nationality', 'passportNumber', 'workPermitStatus', 'workPermitNumber', 'workPermitIssueDate', 'workPermitExpiryDate', 'workPermitExtended', 'workPermitPreviousExpiryDate', 'workPermitExemptReason', 'workPermitExemptExpiryDate'];
const isoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const addYears = (iso, years) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10); };

// Kiểm tra hồ sơ giấy phép khi các trường liên quan đổi (hồ sơ cũ không bị chặn lại). Trả về thông báo lỗi tiếng Việt hoặc chuỗi rỗng.
export function workPermitProblem(details, previous = {}) {
  if (!isForeignNationality(details.nationality)) return '';
  if (!FIELDS.some((field) => String(details[field] ?? '') !== String(previous[field] ?? ''))) return '';
  if (!String(details.passportNumber || '').trim()) return 'Người lao động nước ngoài phải có số hộ chiếu.';
  // Ngày nghỉ thêm Tết cổ truyền và Quốc khánh của nước người lao động (Điều 112 khoản 2): ngày dạng MM-DD.
  if (details.homeNationalDay && !isMonthDay(details.homeNationalDay)) return 'Ngày Quốc khánh của nước người lao động phải có dạng tháng-ngày (MM-DD).';
  if (details.foreignJobCategory && !FOREIGN_JOB_CATEGORIES[details.foreignJobCategory]) return 'Vị trí công việc của người lao động nước ngoài phải là nhà quản lý, giám đốc điều hành, chuyên gia hoặc lao động kỹ thuật.';
  if (details.homeNewYearRule && !['lunar', 'fixed'].includes(details.homeNewYearRule)) return 'Tết cổ truyền phải theo âm lịch hoặc ngày cố định.';
  if (details.homeNewYearRule === 'fixed' && !isMonthDay(details.homeNewYearDate)) return 'Nhập ngày Tết cổ truyền cố định dạng tháng-ngày (MM-DD).';
  const status = details.workPermitStatus;
  if (!WORK_PERMIT_STATUSES[status]) return 'Chọn tình trạng giấy phép lao động: có giấy phép, không thuộc diện cấp giấy phép hoặc đang xin giấy phép.';
  if (status === 'exempt') {
    if (!String(details.workPermitExemptReason || '').trim()) return 'Ghi trường hợp không thuộc diện cấp giấy phép và số văn bản xác nhận (Nghị định 219/2025 Điều 7).';
    if (details.workPermitExemptExpiryDate && !isoDate(details.workPermitExemptExpiryDate)) return 'Ngày hết hạn xác nhận không hợp lệ.';
    return '';
  }
  if (status === 'pending') return '';
  if (!String(details.workPermitNumber || '').trim()) return 'Nhập số giấy phép lao động.';
  if (!isoDate(details.workPermitIssueDate) || !isoDate(details.workPermitExpiryDate)) return 'Nhập ngày cấp và ngày hết hạn giấy phép lao động.';
  if (details.workPermitExpiryDate <= details.workPermitIssueDate) return 'Ngày hết hạn giấy phép phải sau ngày cấp.';
  if (details.workPermitExtended === true) {
    if (!isoDate(details.workPermitPreviousExpiryDate)) return 'Giấy phép đã gia hạn: nhập ngày hết hạn trước khi gia hạn.';
    if (details.workPermitPreviousExpiryDate > addYears(details.workPermitIssueDate, 2)) return 'Thời hạn giấy phép ban đầu tối đa 02 năm.';
    if (details.workPermitExpiryDate > addYears(details.workPermitPreviousExpiryDate, 2)) return 'Giấy phép chỉ được gia hạn một lần, tối đa 02 năm (Nghị định 219/2025 Điều 29).';
  } else if (details.workPermitExpiryDate > addYears(details.workPermitIssueDate, 2)) {
    return 'Thời hạn giấy phép lao động tối đa 02 năm; nếu đã gia hạn thì đánh dấu gia hạn và nhập ngày hết hạn trước đó.';
  }
  return '';
}

// Ngày hết hạn quyền làm việc: giấy phép hoặc xác nhận miễn (nếu có ghi).
export function permitExpiryDate(details) {
  if (details.workPermitStatus === 'permit') return details.workPermitExpiryDate || '';
  if (details.workPermitStatus === 'exempt') return details.workPermitExemptExpiryDate || '';
  return '';
}

// Điều 151: hợp đồng lao động với người nước ngoài phải xác định thời hạn và không vượt thời hạn giấy phép. Hợp đồng dự thảo chưa bị chặn.
export function foreignContractProblem(details, contract) {
  if (!isForeignNationality(details.nationality) || contract.status === 'Dự thảo') return '';
  if (!contract.endDate) return 'Người lao động nước ngoài chỉ được giao kết hợp đồng lao động xác định thời hạn (Điều 151 Bộ luật Lao động 2019): nhập ngày kết thúc.';
  if (details.workPermitStatus === 'pending' || !details.workPermitStatus) return 'Người lao động nước ngoài chưa có giấy phép lao động hoặc xác nhận không thuộc diện cấp: cập nhật hồ sơ trước khi hợp đồng có hiệu lực.';
  const expiry = permitExpiryDate(details);
  if (expiry && contract.endDate > expiry) return `Thời hạn hợp đồng không được vượt thời hạn giấy phép lao động (${expiry}) theo Điều 151 Bộ luật Lao động 2019.`;
  return '';
}

// Vị trí công việc của người lao động nước ngoài (Nghị định 219/2025: nhà quản lý, giám đốc điều hành, chuyên gia, lao động kỹ thuật).
export const FOREIGN_JOB_CATEGORIES = { manager: 'Nhà quản lý', executive: 'Giám đốc điều hành', expert: 'Chuyên gia', technical: 'Lao động kỹ thuật' };

// Kỳ báo cáo tình hình sử dụng lao động nước ngoài: 'YYYY-H1' (6 tháng đầu năm) hoặc 'YYYY' (cả năm). Hạn theo Nghị định 152/2020 trước đây (trước 05/7 và
// trước 05/01 năm sau); chưa xác nhận Nghị định 219/2025 có giữ kỳ và hạn này không.
export function foreignReportPeriod(period) {
  const text = String(period || '').trim().toUpperCase();
  const half = /^(\d{4})-H1$/.exec(text);
  const year = /^(\d{4})$/.exec(text);
  if (!half && !year) throw new Error('Kỳ báo cáo phải có dạng YYYY-H1 (6 tháng đầu năm) hoặc YYYY (cả năm).');
  const y = Number((half || year)[1]);
  return half
    ? { period: text, start: `${y}-01-01`, end: `${y}-06-30`, deadline: `${y}-07-05`, label: `6 tháng đầu năm ${y}` }
    : { period: text, start: `${y}-01-01`, end: `${y}-12-31`, deadline: `${y + 1}-01-05`, label: `Năm ${y}` };
}

// people: [{ name, employeeCode, details, joinDate, leftDate, contract: { code, startDate, endDate } }]. Chỉ tính người nước ngoài có làm việc trong kỳ.
export function buildForeignWorkerReport(people, period) {
  const info = foreignReportPeriod(period);
  const rows = people.filter((person) => isForeignNationality(person.details?.nationality))
    .filter((person) => (!person.joinDate || person.joinDate <= info.end) && (!person.leftDate || person.leftDate >= info.start))
    .map((person) => {
      const details = person.details || {};
      const expiry = permitExpiryDate(details);
      return {
        name: person.name, employeeCode: person.employeeCode, nationality: details.nationality, passportNumber: details.passportNumber || '',
        jobCategory: FOREIGN_JOB_CATEGORIES[details.foreignJobCategory] || 'Chưa phân loại', position: person.position || '',
        permitStatus: WORK_PERMIT_STATUSES[details.workPermitStatus] || 'Chưa khai báo', workPermitNumber: details.workPermitNumber || details.workPermitExemptReason || '',
        permitIssueDate: details.workPermitIssueDate || '', permitExpiryDate: expiry,
        contractCode: person.contract?.code || '', contractStart: person.contract?.startDate || '', contractEnd: person.contract?.endDate || '',
        issues: [
          !details.workPermitStatus || details.workPermitStatus === 'pending' ? 'Chưa có giấy phép hoặc xác nhận miễn' : '',
          expiry && expiry < info.end ? `Giấy phép hết hạn ${expiry} trong kỳ` : '',
          person.contract?.endDate && expiry && person.contract.endDate > expiry ? 'Hợp đồng vượt thời hạn giấy phép' : '',
          !details.foreignJobCategory ? 'Chưa phân loại vị trí công việc' : '',
        ].filter(Boolean),
      };
    });
  const count = (field) => Object.entries(rows.reduce((acc, row) => ({ ...acc, [row[field]]: (acc[row[field]] || 0) + 1 }), {})).map(([key, total]) => ({ key, total }));
  return { ...info, total: rows.length, byNationality: count('nationality'), byJobCategory: count('jobCategory'), byPermitStatus: count('permitStatus'), rows };
}
