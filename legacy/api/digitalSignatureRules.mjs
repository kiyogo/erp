// Chứng thư số của doanh nghiệp: loại chữ ký, thời hạn tối đa, mã số thuế chủ thể, người ký và ủy quyền, tạm dừng và thu hồi.
// Căn cứ: Luật Giao dịch điện tử 20/2023/QH15 (chữ ký điện tử chuyên dùng, chữ ký số công cộng, chữ ký số chuyên dùng công vụ; hiệu lực từ
// 01/07/2024) và Nghị định 23/2025/NĐ-CP (từ 10/04/2025, thay Nghị định 130/2018/NĐ-CP): chứng thư chữ ký số công cộng có thời hạn tối đa
// 3 năm, chứng thư chữ ký điện tử chuyên dùng tối đa 10 năm. Xác minh qua bài tổng hợp (thuvienphapluat.vn, luatvietnam.vn, roedl.com),
// chưa đối chiếu văn bản gốc; chưa xác nhận điều kiện tạm dừng, thu hồi, điều khoản chuyển tiếp (Điều 47) và danh sách tổ chức cung cấp dịch vụ.

import { isValidTaxCode } from './invoiceRules.mjs';
import { partnerTaxCodeProblem } from './tradeRules.mjs';

export const CERT_KINDS = { public: { label: 'Chữ ký số công cộng', maxYears: 3 }, dedicated: { label: 'Chữ ký điện tử chuyên dùng', maxYears: 10 } };
export const CERT_LIFECYCLES = ['active', 'suspended', 'revoked'];
export const SIGNER_ROLES = ['legal_representative', 'authorized'];

const text = (value, label, max) => {
  const result = String(value ?? '').trim();
  if (result.length > max) throw new Error(`${label} dài tối đa ${max} ký tự.`);
  return result;
};
const isoDate = (value, label) => {
  const result = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || new Date(`${result}T00:00:00Z`).toISOString().slice(0, 10) !== result) throw new Error(`${label} không hợp lệ.`);
  return result;
};

// Ngày sau n năm, giữ ngày trong tháng (29/02 sang 28/02 khi năm không nhuận).
export function addYears(iso, years) {
  const [year, month, day] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(year + years, month - 1, day));
  if (target.getUTCMonth() !== month - 1) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

// Chuẩn hóa các trường pháp lý của chứng thư. current là bản ghi đã lưu (nếu có). Ném Error tiếng Việt khi sai.
export function normalizeCertificateLegal(record, current, { today, companyTaxCode = '' }) {
  const certKind = record.certKind === undefined || record.certKind === '' ? (current?.certKind || 'public') : record.certKind;
  if (!Object.hasOwn(CERT_KINDS, certKind)) throw new Error('Loại chữ ký không hợp lệ.');
  const datesChanged = !current || current.validFrom !== record.validFrom || current.validTo !== record.validTo;
  if (datesChanged && record.validTo > addYears(record.validFrom, CERT_KINDS[certKind].maxYears)) {
    throw new Error(`${CERT_KINDS[certKind].label} có thời hạn tối đa ${CERT_KINDS[certKind].maxYears} năm kể từ ngày bắt đầu hiệu lực.`);
  }
  const subjectTaxCode = text(record.subjectTaxCode, 'Mã số thuế chủ thể', 32);
  const taxProblem = partnerTaxCodeProblem(subjectTaxCode, isValidTaxCode);
  if (taxProblem) throw new Error(taxProblem);
  const signerRole = record.signerRole === undefined || record.signerRole === '' ? (current?.signerRole || 'legal_representative') : record.signerRole;
  if (!SIGNER_ROLES.includes(signerRole)) throw new Error('Vai trò người ký không hợp lệ.');
  let authorizationNo = '';
  let authorizationDate = '';
  if (signerRole === 'authorized') {
    authorizationNo = text(record.authorizationNo, 'Số giấy ủy quyền', 80);
    if (!authorizationNo) throw new Error('Người ký được ủy quyền cần số giấy ủy quyền.');
    authorizationDate = isoDate(record.authorizationDate, 'Ngày giấy ủy quyền');
    if (authorizationDate > today) throw new Error('Ngày giấy ủy quyền không được ở tương lai.');
  }
  const lifecycle = record.lifecycle === undefined || record.lifecycle === '' ? (current?.lifecycle || 'active') : record.lifecycle;
  if (!CERT_LIFECYCLES.includes(lifecycle)) throw new Error('Trạng thái chứng thư không hợp lệ.');
  if (current?.lifecycle === 'revoked') {
    if (lifecycle !== 'revoked') throw new Error('Chứng thư đã thu hồi không khôi phục được; đăng ký chứng thư mới.');
    if (datesChanged) throw new Error('Chứng thư đã thu hồi không gia hạn được; đăng ký chứng thư mới.');
  }
  let revokedAt = '';
  let revokeReason = '';
  if (lifecycle === 'revoked') {
    revokedAt = isoDate(record.revokedAt, 'Ngày thu hồi');
    if (revokedAt < record.validFrom || revokedAt > today) throw new Error('Ngày thu hồi phải sau ngày bắt đầu hiệu lực và không ở tương lai.');
    revokeReason = text(record.revokeReason, 'Lý do thu hồi', 500);
    if (!revokeReason) throw new Error('Nhập lý do thu hồi.');
    if (current?.lifecycle === 'revoked' && (current.revokedAt !== revokedAt || current.revokeReason !== revokeReason)) throw new Error('Không sửa thông tin thu hồi đã ghi.');
  }
  const warnings = [];
  if (!subjectTaxCode) warnings.push('Chưa ghi mã số thuế trên chứng thư; chứng thư dùng ký hóa đơn, tờ khai phải có mã số thuế của doanh nghiệp.');
  else if (companyTaxCode && subjectTaxCode !== companyTaxCode) warnings.push('Mã số thuế trên chứng thư khác mã số thuế trong hồ sơ doanh nghiệp: không dùng ký hóa đơn, tờ khai thuế của doanh nghiệp.');
  return { fields: { certKind, subjectTaxCode, signerRole, authorizationNo, authorizationDate, lifecycle, revokedAt, revokeReason }, warnings };
}
