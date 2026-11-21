// Quy tắc hồ sơ nhân viên: giấy tờ tùy thân, ngày sinh, người phụ thuộc giảm trừ gia cảnh thuế TNCN.
// Căn cứ: Bộ luật Lao động 2019 Điều 143 (người lao động từ đủ 15 tuổi), Luật Căn cước 2023 (số định danh cá nhân 12 số), Luật Bảo hiểm xã
// hội 2024 (mã số bảo hiểm xã hội là số định danh cá nhân từ 01/07/2025, số cũ 10 số), Luật Thuế thu nhập cá nhân 04/2007/QH12 Điều 9 và
// Thông tư 111/2013/TT-BTC Điều 9 (người phụ thuộc: con dưới 18 tuổi; con từ đủ 18 tuổi bị khuyết tật hoặc đang học đại học, cao đẳng, trung
// cấp, dạy nghề không có thu nhập hoặc thu nhập không quá 1 triệu đồng một tháng; vợ, chồng, cha mẹ và người khác ngoài độ tuổi lao động
// (nam từ 60, nữ từ 55) không có thu nhập hoặc thu nhập không quá 1 triệu đồng; trong độ tuổi lao động thì phải khuyết tật, không có khả
// năng lao động; mỗi người phụ thuộc chỉ tính giảm trừ cho một người nộp thuế trong cùng thời gian). Xác minh qua trí nhớ văn bản, chưa đối
// chiếu bản gốc; mức thu nhập 1 triệu đồng chưa kiểm tra có đổi theo văn bản mới (Nghị quyết 110/2025/UBTVQH15 chỉ nâng mức giảm trừ).

import { isPersonalIdNumber, isValidTaxCode } from './invoiceRules.mjs';

export const DEPENDENT_BASES = ['student', 'disabled', 'low_income'];
export const MIN_WORKING_AGE = 15;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value) => ISO.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function ageOn(birthDate, onDate) {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = onDate.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

// Lỗi giấy tờ và ngày sinh; chỉ kiểm giá trị đã đổi để hồ sơ cũ không bị chặn lại khi sửa trường khác.
export function identityProblems(details, previous, today) {
  const changed = (field) => String(details[field] ?? '') !== String(previous[field] ?? '');
  if (changed('birthDate') && details.birthDate) {
    if (details.birthDate > today) return 'Ngày sinh không được ở tương lai.';
    if (ageOn(details.birthDate, today) < MIN_WORKING_AGE) return `Người lao động phải từ đủ ${MIN_WORKING_AGE} tuổi (Điều 143 Bộ luật Lao động 2019).`;
    if (ageOn(details.birthDate, today) > 100) return 'Ngày sinh không hợp lệ.';
  }
  if (changed('idNumber') && details.idNumber && !isPersonalIdNumber(details.idNumber)) return 'Số căn cước phải gồm đúng 12 chữ số.';
  if (changed('taxCode') && details.taxCode && !isValidTaxCode(details.taxCode) && !isPersonalIdNumber(details.taxCode)) return 'Mã số thuế cá nhân không hợp lệ (10 số đúng số kiểm tra, hoặc số định danh 12 số).';
  if (changed('insuranceNumber') && details.insuranceNumber && !/^(\d{10}|\d{12})$/.test(String(details.insuranceNumber).trim())) return 'Mã số bảo hiểm xã hội phải gồm 10 hoặc 12 chữ số.';
  return '';
}

const text = (value) => String(value ?? '').trim();

// Điều kiện phụ thuộc của một người theo quan hệ, tuổi tại ngày bắt đầu giảm trừ và căn cứ khai báo.
export function dependentEligibilityProblem(member) {
  const age = ageOn(member.birthDate, member.dependentStartDate);
  const relation = text(member.relation).toLowerCase();
  if (/^con/.test(relation)) {
    if (age < 18) return '';
    return ['student', 'disabled'].includes(member.dependentBasis) ? '' : 'Con từ đủ 18 tuổi chỉ được giảm trừ khi đang học đại học, cao đẳng, trung cấp, dạy nghề hoặc bị khuyết tật, không có khả năng lao động; hãy chọn căn cứ phụ thuộc.';
  }
  const retirementAge = member.gender === 'Nữ' ? 55 : 60;
  if (member.dependentBasis === 'disabled') return '';
  if (age >= retirementAge && member.dependentBasis === 'low_income') return '';
  return age >= retirementAge
    ? 'Người ngoài độ tuổi lao động chỉ được giảm trừ khi không có thu nhập hoặc thu nhập không quá 1 triệu đồng một tháng; hãy chọn căn cứ phụ thuộc.'
    : 'Người trong độ tuổi lao động chỉ được giảm trừ khi bị khuyết tật, không có khả năng lao động; hãy chọn căn cứ phụ thuộc.';
}

// Chuẩn hóa danh sách thân nhân. Người phụ thuộc phải đủ thông tin; trường dependentVerified chỉ quản trị viên được đặt, nhân viên tự
// khai hoặc sửa người phụ thuộc thì chờ quản trị viên xác minh hồ sơ.
export function normalizeFamilyMembers(input, previousMembers, { trusted, today }) {
  if (!Array.isArray(input)) throw new Error('Danh sách thân nhân không hợp lệ.');
  if (input.length > 50) throw new Error('Danh sách thân nhân tối đa 50 người.');
  const previous = new Map((Array.isArray(previousMembers) ? previousMembers : []).map((member) => [member?.id, member]));
  const seen = new Set();
  return input.map((raw) => {
    const member = { ...raw, isDependent: raw?.isDependent === true };
    if (!member.isDependent) {
      delete member.dependentVerified;
      return member;
    }
    // Người phụ thuộc đã lưu từ trước và không đổi thì giữ nguyên, không bị chặn lại khi sửa phần khác của hồ sơ.
    const before = previous.get(member.id);
    const unchanged = before?.isDependent === true && ['relation', 'birthDate', 'gender', 'dependentTaxCode', 'idNumber', 'dependentStartDate', 'dependentEndDate', 'dependentBasis']
      .every((field) => text(before[field]) === text(member[field]));
    const previousVerified = before?.dependentVerified !== false;
    member.dependentVerified = trusted ? (raw.dependentVerified === undefined ? previousVerified || !before : raw.dependentVerified !== false) : unchanged && previousVerified;
    if (unchanged) { const known = dependentIdentifier(member); if (known) seen.add(known); return member; }
    const label = text(member.name) || 'Người phụ thuộc';
    if (!text(member.name) || !text(member.relation)) throw new Error('Người phụ thuộc cần có họ tên và quan hệ với người nộp thuế.');
    if (!validDate(text(member.birthDate)) || member.birthDate > today) throw new Error(`${label}: ngày sinh không hợp lệ.`);
    if (!validDate(text(member.dependentStartDate))) throw new Error(`${label}: cần ngày bắt đầu giảm trừ hợp lệ.`);
    if (text(member.dependentEndDate)) {
      if (!validDate(text(member.dependentEndDate))) throw new Error(`${label}: ngày kết thúc giảm trừ không hợp lệ.`);
      if (member.dependentEndDate < member.dependentStartDate) throw new Error(`${label}: ngày kết thúc giảm trừ không được trước ngày bắt đầu.`);
    } else member.dependentEndDate = '';
    if (member.dependentStartDate < member.birthDate) throw new Error(`${label}: ngày bắt đầu giảm trừ không được trước ngày sinh.`);
    member.dependentTaxCode = text(member.dependentTaxCode);
    member.idNumber = text(member.idNumber);
    const identifier = dependentIdentifier(member);
    if (!identifier) throw new Error(`${label}: cần mã số thuế hoặc số căn cước của người phụ thuộc để đăng ký giảm trừ.`);
    if (member.dependentTaxCode && !isValidTaxCode(member.dependentTaxCode) && !isPersonalIdNumber(member.dependentTaxCode)) throw new Error(`${label}: mã số thuế người phụ thuộc không hợp lệ.`);
    if (!member.dependentTaxCode && !isPersonalIdNumber(member.idNumber)) throw new Error(`${label}: số căn cước phải gồm đúng 12 chữ số.`);
    if (seen.has(identifier)) throw new Error(`${label}: người phụ thuộc bị khai trùng trong cùng hồ sơ.`);
    seen.add(identifier);
    member.dependentBasis = DEPENDENT_BASES.includes(member.dependentBasis) ? member.dependentBasis : '';
    const problem = dependentEligibilityProblem(member);
    if (problem) throw new Error(`${label}: ${problem}`);
    return member;
  });
}

export function dependentIdentifier(member) {
  return text(member?.dependentTaxCode) || text(member?.idNumber);
}

// Một người phụ thuộc chỉ tính giảm trừ cho một người nộp thuế trong cùng thời gian.
export function dependentClaimConflict(members, otherProfiles) {
  for (const member of members.filter((item) => item.isDependent)) {
    const identifier = dependentIdentifier(member);
    const start = member.dependentStartDate;
    const end = member.dependentEndDate || '9999-12-31';
    for (const other of otherProfiles) {
      const claim = (other.members || []).find((item) => item?.isDependent === true && dependentIdentifier(item) === identifier
        && (item.dependentStartDate || '0000-01-01') <= end && (item.dependentEndDate || '9999-12-31') >= start);
      if (claim) return `${text(member.name) || 'Người phụ thuộc'} đã được nhân viên ${other.label} đăng ký giảm trừ trong cùng thời gian; mỗi người phụ thuộc chỉ tính cho một người nộp thuế.`;
    }
  }
  return '';
}
