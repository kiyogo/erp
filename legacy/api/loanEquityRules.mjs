// Quy tắc pháp lý cho khế ước vay, cho vay và sổ đăng ký cổ đông.
// Vay: Bộ luật Dân sự 2015 Điều 468 (lãi suất thỏa thuận không quá 20%/năm, trừ luật khác quy định: tổ chức tín dụng theo Luật Các tổ chức
// tín dụng), Điều 466 (lãi trên nợ gốc quá hạn bằng 150% lãi suất trong hạn), Thông tư 39/2016/TT-NHNN (lãi quá hạn của tổ chức tín dụng tối
// đa 150% lãi suất trong hạn), Nghị định 222/2013/NĐ-CP và Thông tư 09/2015/TT-BTC (doanh nghiệp không dùng tiền mặt khi vay, cho vay, trả nợ vay
// lẫn nhau), Luật Thuế TNCN Điều 23 (lãi tiền vay trả cho cá nhân là thu nhập từ đầu tư vốn, thuế suất 5%), Thông tư 96/2015/TT-BTC (chi phí lãi
// vay của tổ chức không phải tổ chức tín dụng vượt 1,5 lần lãi suất cơ bản không được trừ khi tính thuế TNDN; lãi suất cơ bản 9%/năm).
// Cổ phần: Luật Doanh nghiệp 59/2020/QH14 Điều 113 (thanh toán đủ cổ phần đăng ký mua trong 90 ngày), Điều 114 (các loại cổ phần), Điều 116
// (cổ phần ưu đãi biểu quyết chỉ tổ chức được Chính phủ ủy quyền và cổ đông sáng lập nắm giữ), Điều 122 (nội dung sổ đăng ký cổ đông: quốc tịch,
// số giấy tờ pháp lý của cá nhân, mã số doanh nghiệp của tổ chức, loại và số cổ phần). Xác minh qua trí nhớ văn bản, chưa đối chiếu bản gốc;
// Luật Thuế TNDN 67/2025/QH15 có thể đã đổi điều kiện chi phí lãi vay nên mục đó chỉ cảnh báo.

import { isPersonalIdNumber, isValidTaxCode } from './invoiceRules.mjs';
import { isValidPassportNumber } from './contactRules.mjs';

export const COUNTERPARTY_TYPES = {
  credit_institution: 'Tổ chức tín dụng, chi nhánh ngân hàng nước ngoài',
  enterprise: 'Doanh nghiệp, tổ chức khác',
  individual: 'Cá nhân',
};
export const CIVIL_INTEREST_CAP = 20;
export const OVERDUE_MULTIPLIER = 1.5;
export const DEDUCTIBLE_INTEREST_CAP = 13.5;

export function loanRateProblem(rates, counterpartyType) {
  for (const row of rates) {
    if (counterpartyType !== 'credit_institution' && row.rate !== null && row.rate > CIVIL_INTEREST_CAP) return `Lãi suất ${row.rate}%/năm vượt mức tối đa ${CIVIL_INTEREST_CAP}%/năm khi bên cho vay không phải tổ chức tín dụng (Điều 468 Bộ luật Dân sự 2015).`;
    if (row.rate !== null && row.overdueRate !== null && row.overdueRate > Math.round(row.rate * OVERDUE_MULTIPLIER * 100) / 100) return `Lãi suất quá hạn ${row.overdueRate}%/năm vượt 150% lãi suất trong hạn (${Math.round(row.rate * OVERDUE_MULTIPLIER * 100) / 100}%/năm) theo Điều 466 Bộ luật Dân sự 2015 và Thông tư 39/2016/TT-NHNN.`;
  }
  return '';
}

const mentionsCash = (value) => /tiền\s*mặt/i.test(String(value || ''));

export function loanWarnings(loan) {
  const warnings = [];
  const maxRate = Math.max(0, ...loan.rates.map((row) => row.rate ?? 0));
  if (loan.counterpartyType === 'enterprise' && [loan.disbursementMethod, loan.repaymentMethod].some(mentionsCash)) warnings.push('Doanh nghiệp không dùng tiền mặt khi vay, cho vay và trả nợ vay lẫn nhau (Nghị định 222/2013, Thông tư 09/2015); hãy giải ngân và trả nợ qua tài khoản ngân hàng.');
  if (loan.direction === 'borrow' && loan.counterpartyType === 'individual') warnings.push('Tiền lãi trả cho cá nhân cho vay là thu nhập từ đầu tư vốn: doanh nghiệp khấu trừ thuế TNCN 5% khi trả lãi (Luật Thuế TNCN Điều 23).');
  if (loan.direction === 'borrow' && loan.counterpartyType !== 'credit_institution' && maxRate > DEDUCTIBLE_INTEREST_CAP) warnings.push(`Lãi suất vay từ tổ chức, cá nhân không phải tổ chức tín dụng vượt ${DEDUCTIBLE_INTEREST_CAP}%/năm (1,5 lần lãi suất cơ bản): phần chi phí lãi vượt có thể không được trừ khi tính thuế TNDN; kiểm tra quy định hiện hành.`);
  return warnings;
}

export const SHARE_CLASSES = {
  ordinary: 'Cổ phần phổ thông',
  voting_preference: 'Cổ phần ưu đãi biểu quyết',
  dividend_preference: 'Cổ phần ưu đãi cổ tức',
  redeemable_preference: 'Cổ phần ưu đãi hoàn lại',
};
export const HOLDER_KINDS = { individual: 'Cá nhân', organization: 'Tổ chức' };
export const PAYMENT_DEADLINE_DAYS = 90;

const isVietnamese = (nationality) => /^(việt nam|viet nam|vn)$/i.test(String(nationality || '').trim());

// Kiểm tra hồ sơ cổ đông khi tạo mới hoặc khi các trường pháp lý đổi; trả về lỗi đầu tiên hoặc chuỗi rỗng.
export function shareholderProblem(record) {
  if (!SHARE_CLASSES[record.shareClass]) return 'Chọn loại cổ phần (Điều 114 Luật Doanh nghiệp 2020).';
  if (!HOLDER_KINDS[record.holderKind]) return 'Chọn cổ đông là cá nhân hay tổ chức.';
  if (record.shareClass === 'voting_preference' && record.type !== 'Cổ đông sáng lập' && record.governmentAuthorized !== true) return 'Cổ phần ưu đãi biểu quyết chỉ do cổ đông sáng lập hoặc tổ chức được Chính phủ ủy quyền nắm giữ (Điều 116 Luật Doanh nghiệp 2020).';
  if (record.holderKind === 'individual') {
    if (!String(record.nationality || '').trim()) return 'Sổ đăng ký cổ đông phải ghi quốc tịch của cổ đông cá nhân (Điều 122).';
    if (isVietnamese(record.nationality) ? !isPersonalIdNumber(record.idNumber) : !isValidPassportNumber(record.idNumber)) return isVietnamese(record.nationality) ? 'Cổ đông cá nhân quốc tịch Việt Nam ghi số định danh cá nhân 12 chữ số.' : 'Cổ đông cá nhân nước ngoài ghi số hộ chiếu hợp lệ.';
  } else if (record.governmentAuthorized !== true && (!record.nationality || isVietnamese(record.nationality)) && !isValidTaxCode(record.idNumber)) {
    return 'Cổ đông tổ chức trong nước ghi mã số doanh nghiệp hợp lệ (đúng số kiểm tra).';
  }
  if (record.paidValue !== undefined && record.paidValue > record.capitalValue) return 'Số vốn đã góp không được lớn hơn giá trị cổ phần đăng ký mua.';
  return '';
}

export function shareholderWarnings(record, { today, legalForm }) {
  const warnings = [];
  if (legalForm && !['joint_stock', 'public_company'].includes(legalForm)) warnings.push('Sổ đăng ký cổ đông áp dụng cho công ty cổ phần; công ty trách nhiệm hữu hạn và hợp danh dùng sổ đăng ký thành viên.');
  if (record.paidValue !== undefined && record.paidValue < record.capitalValue) {
    const deadline = new Date(`${record.joinDate}T00:00:00Z`);
    deadline.setUTCDate(deadline.getUTCDate() + PAYMENT_DEADLINE_DAYS);
    const iso = deadline.toISOString().slice(0, 10);
    if (today > iso) warnings.push(`Cổ đông chưa thanh toán đủ cổ phần đăng ký mua sau ${PAYMENT_DEADLINE_DAYS} ngày (hạn ${iso}); phần chưa thanh toán phải xử lý theo Điều 113 Luật Doanh nghiệp 2020 (điều chỉnh vốn, chào bán lại).`);
  }
  return warnings;
}
