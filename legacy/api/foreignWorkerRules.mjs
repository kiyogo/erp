// Người lao động nước ngoài làm việc tại Việt Nam: giấy phép lao động hoặc xác nhận không thuộc diện cấp giấy phép, thời hạn hợp đồng lao động.
// Căn cứ: Bộ luật Lao động 2019 Điều 151 (phải có giấy phép trừ trường hợp miễn; chỉ giao kết hợp đồng xác định thời hạn và thời hạn hợp đồng không vượt
// thời hạn giấy phép lao động), Điều 153, 154, 155; Nghị định 219/2025/NĐ-CP (từ 07/8/2025, thay Nghị định 152/2020 và 70/2023): giấy phép lao động
// tối đa 02 năm, gia hạn một lần tối đa 02 năm (Điều 29); Điều 7 các trường hợp không thuộc diện cấp giấy phép. Người nước ngoài không thuộc đối tượng
// bảo hiểm thất nghiệp (Luật Việc làm). Xác minh qua bài tổng hợp (ey.com, kpmg.com, luatvietan.vn), chưa đối chiếu bản gốc; số ngày phải nộp hồ sơ
// gia hạn trước khi hết hạn chưa xác nhận nên hệ thống nhắc từ 45 ngày.

const VIETNAM = new Set(['việt nam', 'viet nam', 'vietnam', 'vn', 'vnm']);
export const isForeignNationality = (value) => {
  const text = String(value ?? '').trim().toLocaleLowerCase('vi-VN');
  return Boolean(text) && !VIETNAM.has(text);
};

export const WORK_PERMIT_STATUSES = { permit: 'Có giấy phép lao động', exempt: 'Không thuộc diện cấp giấy phép (đã có xác nhận)', pending: 'Đang xin giấy phép' };
const FIELDS = ['nationality', 'passportNumber', 'workPermitStatus', 'workPermitNumber', 'workPermitIssueDate', 'workPermitExpiryDate', 'workPermitExtended', 'workPermitPreviousExpiryDate', 'workPermitExemptReason', 'workPermitExemptExpiryDate'];
const isoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const addYears = (iso, years) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10); };

// Kiểm tra hồ sơ giấy phép khi các trường liên quan đổi (hồ sơ cũ không bị chặn lại). Trả về thông báo lỗi tiếng Việt hoặc chuỗi rỗng.
export function workPermitProblem(details, previous = {}) {
  if (!isForeignNationality(details.nationality)) return '';
  if (!FIELDS.some((field) => String(details[field] ?? '') !== String(previous[field] ?? ''))) return '';
  if (!String(details.passportNumber || '').trim()) return 'Người lao động nước ngoài phải có số hộ chiếu.';
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
