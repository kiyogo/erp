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
const IMMIGRATION_FIELDS = ['stayPeriods', 'taxResidentOverride', 'passportExpiryDate', 'visaType', 'visaNumber', 'visaIssueDate', 'visaExpiryDate', 'residenceCardType', 'residenceCardNumber', 'residenceCardIssueDate', 'residenceCardExpiryDate'];
const FIELDS = [...IMMIGRATION_FIELDS, 'foreignJobCategory', 'homeNationalDay', 'homeNewYearRule', 'homeNewYearDate', 'nationality', 'passportNumber', 'workPermitStatus', 'workPermitNumber', 'workPermitIssueDate', 'workPermitExpiryDate', 'workPermitExtended', 'workPermitPreviousExpiryDate', 'workPermitExemptReason', 'workPermitExemptExpiryDate'];
const isoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const addYears = (iso, years) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10); };

// Kiểm tra hồ sơ giấy phép khi các trường liên quan đổi (hồ sơ cũ không bị chặn lại). Trả về thông báo lỗi tiếng Việt hoặc chuỗi rỗng.
export function workPermitProblem(details, previous = {}) {
  if (!isForeignNationality(details.nationality)) return '';
  if (!FIELDS.some((field) => String(details[field] ?? '') !== String(previous[field] ?? ''))) return '';
  if (!String(details.passportNumber || '').trim()) return 'Người lao động nước ngoài phải có số hộ chiếu.';
  const immigration = immigrationProblem(details) || stayPeriodsProblem(details);
  if (immigration) return immigration;
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

// Thị thực và thẻ tạm trú lao động (Luật Nhập cảnh, xuất cảnh, quá cảnh, cư trú của người nước ngoài 47/2014/QH13, sửa đổi bởi Luật 51/2019/QH14 và
// 23/2023/QH15): ký hiệu LĐ1 cho người không thuộc diện cấp giấy phép lao động, LĐ2 cho người phải có giấy phép; thị thực và thẻ tạm trú LĐ1, LĐ2 thời
// hạn không quá 02 năm và phải ngắn hơn thời hạn còn lại của hộ chiếu ít nhất 30 ngày. Xác minh qua trí nhớ văn bản, chưa đối chiếu bản gốc.
export const IMMIGRATION_TYPES = { 'LĐ1': 'LĐ1 (không thuộc diện cấp giấy phép)', 'LĐ2': 'LĐ2 (có giấy phép lao động)', other: 'Ký hiệu khác' };
const addDays = (iso, days) => { const date = new Date(`${iso}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };

export function immigrationProblem(details) {
  if (details.passportExpiryDate && !isoDate(details.passportExpiryDate)) return 'Ngày hết hạn hộ chiếu không hợp lệ.';
  const documents = [
    { label: 'thị thực', type: details.visaType, number: details.visaNumber, issue: details.visaIssueDate, expiry: details.visaExpiryDate },
    { label: 'thẻ tạm trú', type: details.residenceCardType, number: details.residenceCardNumber, issue: details.residenceCardIssueDate, expiry: details.residenceCardExpiryDate },
  ];
  for (const doc of documents) {
    if (!doc.type && !doc.number && !doc.expiry) continue;
    if (!IMMIGRATION_TYPES[doc.type]) return `Chọn ký hiệu ${doc.label}: LĐ1, LĐ2 hoặc ký hiệu khác.`;
    if (!String(doc.number || '').trim()) return `Nhập số ${doc.label}.`;
    if (!isoDate(doc.issue) || !isoDate(doc.expiry) || doc.expiry <= doc.issue) return `Nhập ngày cấp và ngày hết hạn ${doc.label} hợp lệ.`;
    if (['LĐ1', 'LĐ2'].includes(doc.type) && doc.expiry > addYears(doc.issue, 2)) return `${doc.label[0].toUpperCase()}${doc.label.slice(1)} ký hiệu ${doc.type} có thời hạn không quá 02 năm.`;
    if (isoDate(details.passportExpiryDate) && doc.expiry > addDays(details.passportExpiryDate, -30)) return `${doc.label[0].toUpperCase()}${doc.label.slice(1)} phải hết hạn trước hộ chiếu ít nhất 30 ngày.`;
    if (doc.type === 'LĐ2' && details.workPermitStatus === 'exempt') return `Người không thuộc diện cấp giấy phép dùng ${doc.label} ký hiệu LĐ1, không phải LĐ2.`;
    if (doc.type === 'LĐ1' && details.workPermitStatus === 'permit') return `Người có giấy phép lao động dùng ${doc.label} ký hiệu LĐ2, không phải LĐ1.`;
  }
  return '';
}

// Các giấy tờ có hạn cần nhắc của người lao động nước ngoài: hộ chiếu, thị thực, thẻ tạm trú (ngày hết hạn đã nhập).
export function immigrationExpiries(details) {
  return [
    { kind: 'passport', label: 'Hộ chiếu', number: details.passportNumber, expiry: details.passportExpiryDate },
    { kind: 'visa', label: `Thị thực ${details.visaType || ''}`.trim(), number: details.visaNumber, expiry: details.visaExpiryDate },
    { kind: 'residence_card', label: `Thẻ tạm trú ${details.residenceCardType || ''}`.trim(), number: details.residenceCardNumber, expiry: details.residenceCardExpiryDate },
  ].filter((item) => isoDate(item.expiry));
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
        visa: details.visaNumber ? `${details.visaType || ''} ${details.visaNumber}`.trim() : '', visaExpiryDate: details.visaExpiryDate || '',
        residenceCard: details.residenceCardNumber ? `${details.residenceCardType || ''} ${details.residenceCardNumber}`.trim() : '', residenceCardExpiryDate: details.residenceCardExpiryDate || '',
        contractCode: person.contract?.code || '', contractStart: person.contract?.startDate || '', contractEnd: person.contract?.endDate || '',
        issues: [
          !details.workPermitStatus || details.workPermitStatus === 'pending' ? 'Chưa có giấy phép hoặc xác nhận miễn' : '',
          expiry && expiry < info.end ? `Giấy phép hết hạn ${expiry} trong kỳ` : '',
          person.contract?.endDate && expiry && person.contract.endDate > expiry ? 'Hợp đồng vượt thời hạn giấy phép' : '',
          !details.foreignJobCategory ? 'Chưa phân loại vị trí công việc' : '',
          !details.visaNumber && !details.residenceCardNumber ? 'Chưa có thị thực hoặc thẻ tạm trú' : '',
          ...immigrationExpiries(details).filter((item) => item.expiry < info.end).map((item) => `${item.label} hết hạn ${item.expiry} trong kỳ`),
        ].filter(Boolean),
      };
    });
  const count = (field) => Object.entries(rows.reduce((acc, row) => ({ ...acc, [row[field]]: (acc[row[field]] || 0) + 1 }), {})).map(([key, total]) => ({ key, total }));
  return { ...info, total: rows.length, byNationality: count('nationality'), byJobCategory: count('jobCategory'), byPermitStatus: count('permitStatus'), rows };
}

// Cư trú thuế TNCN (Luật Thuế TNCN Điều 2 khoản 2, Thông tư 111/2013/TT-BTC Điều 1 khoản 1): cá nhân cư trú khi có mặt tại Việt Nam từ 183 ngày trở lên
// trong năm dương lịch hoặc trong 12 tháng liên tục kể từ ngày đầu tiên có mặt (ngày đến và ngày đi tính là một ngày), hoặc có nơi ở thường xuyên (đăng ký
// thường trú hoặc có thẻ tạm trú). Công dân Việt Nam mặc định là cư trú. Hồ sơ ghi `stayPeriods` [{ entry, exit }] (exit trống là đang ở Việt Nam).
// Xác minh qua trí nhớ văn bản, chưa đối chiếu bản gốc; trường hợp có nhà thuê từ 183 ngày và chứng minh cư trú nước khác chưa hỗ trợ (nhập tay bằng
// `taxResidentOverride`).
const dayNumber = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

// Số ngày có mặt trong khoảng [from, to]: mỗi lần ở tính số ngày từ ngày đến tới ngày đi (ngày đến và ngày đi cộng lại là một ngày).
export function presenceDays(stayPeriods, from, to) {
  if (!Array.isArray(stayPeriods)) return 0;
  return stayPeriods.reduce((total, period) => {
    if (!isoDate(period?.entry)) return total;
    const exit = isoDate(period.exit) ? period.exit : to;
    const start = Math.max(dayNumber(period.entry), dayNumber(from));
    const end = Math.min(dayNumber(exit), dayNumber(to));
    if (end < start) return total;
    // Lần ở bắt đầu trước khoảng xét được tính trọn ngày đầu của khoảng; lần ở trong khoảng tính theo hiệu ngày đi trừ ngày đến.
    return total + (end - start) + (dayNumber(period.entry) < dayNumber(from) ? 1 : 0);
  }, 0);
}

export function taxResidency(details, year, asOf) {
  if (details?.taxResidentOverride === 'resident' || details?.taxResidentOverride === 'non_resident') {
    return { resident: details.taxResidentOverride === 'resident', basis: 'Xác định thủ công theo hồ sơ (taxResidentOverride).', days: null };
  }
  if (!isForeignNationality(details?.nationality)) return { resident: details?.taxResident !== false, basis: 'Công dân Việt Nam.', days: null };
  const end = asOf && asOf < `${year}-12-31` ? asOf : `${year}-12-31`;
  const days = presenceDays(details.stayPeriods, `${year}-01-01`, end);
  if (days >= 183) return { resident: true, basis: `Có mặt ${days} ngày trong năm ${year} (từ 183 ngày).`, days };
  const card = details.residenceCardNumber && isoDate(details.residenceCardIssueDate) && isoDate(details.residenceCardExpiryDate)
    && details.residenceCardIssueDate <= end && details.residenceCardExpiryDate >= `${year}-01-01`;
  if (card) return { resident: true, basis: 'Có thẻ tạm trú còn hiệu lực trong năm (nơi ở thường xuyên).', days };
  const entries = (Array.isArray(details.stayPeriods) ? details.stayPeriods : []).map((period) => period?.entry).filter(isoDate).sort();
  // Chưa khai thời gian ở Việt Nam và không có thẻ tạm trú: thiếu dữ liệu, tạm tính như cư trú (không tự đẩy thuế lên 20%) và báo cần bổ sung.
  if (!entries.length) return { resident: true, unknown: true, basis: 'Chưa khai thời gian ở Việt Nam hoặc thẻ tạm trú: tạm tính như cá nhân cư trú, cần bổ sung hồ sơ.', days };
  if (entries[0]) {
    const first = entries[0];
    const twelve = addDays(addYears(first, 1), -1);
    const rolling = presenceDays(details.stayPeriods, first, twelve < end ? twelve : end);
    if (rolling >= 183 && first <= end) return { resident: true, basis: `Có mặt ${rolling} ngày trong 12 tháng liên tục kể từ ${first}.`, days };
  }
  return { resident: false, basis: `Có mặt ${days} ngày trong năm ${year}, chưa đủ 183 ngày và không có thẻ tạm trú.`, days };
}

export function stayPeriodsProblem(details) {
  if (details.stayPeriods === undefined) return '';
  if (!Array.isArray(details.stayPeriods) || details.stayPeriods.length > 200) return 'Danh sách thời gian ở Việt Nam không hợp lệ.';
  const sorted = [...details.stayPeriods].sort((a, b) => String(a?.entry).localeCompare(String(b?.entry)));
  for (const [index, period] of sorted.entries()) {
    if (!isoDate(period?.entry)) return `Ngày nhập cảnh dòng ${index + 1} không hợp lệ.`;
    if (period.exit && (!isoDate(period.exit) || period.exit < period.entry)) return `Ngày xuất cảnh dòng ${index + 1} phải sau ngày nhập cảnh.`;
    if (!period.exit && index < sorted.length - 1) return 'Chỉ lần ở cuối cùng được để trống ngày xuất cảnh.';
    if (index > 0 && sorted[index - 1].exit > period.entry) return 'Các lần ở Việt Nam không được chồng thời gian.';
  }
  if (details.taxResidentOverride && !['resident', 'non_resident'].includes(details.taxResidentOverride)) return 'Xác định cư trú thủ công phải là cư trú hoặc không cư trú.';
  return '';
}
