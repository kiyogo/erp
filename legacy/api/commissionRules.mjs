// Hoa hồng bán hàng của nhân viên: tính theo chứng từ bán đã ghi nhân viên bán hàng (salespersonId), theo chính sách doanh nghiệp tự quy định
// (crm_commission_policies: tỷ lệ %, căn cứ tính khi đã bàn giao hoặc khi đã thu đủ tiền, thời gian áp dụng). Hoa hồng tính trên doanh số chưa thuế GTGT
// của đơn bán, hợp đồng bán (không tính báo giá, chứng từ đã hủy, chứng từ điều chỉnh; trừ phần hàng trả lại, giảm giá). Khi chốt tháng, hoa hồng được
// cộng vào khoản thưởng chịu thuế TNCN của bảng lương tháng đó: hoa hồng trả cho người lao động là thu nhập từ tiền lương, tiền công (Thông tư
// 111/2013/TT-BTC Điều 2 khoản 2, công văn 3450/CT-TTHT năm 2020 của Cục Thuế TP.HCM, xác minh qua bài tổng hợp, chưa đối chiếu bản gốc). Chưa xác
// nhận được hoa hồng có tính vào tiền lương đóng bảo hiểm xã hội bắt buộc hay không nên bảo hiểm vẫn tính theo lương hợp đồng.

export const COMMISSION_BASES = {
  delivered: 'Khi đã bàn giao',
  paid: 'Khi đã thu đủ tiền',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function commissionPolicyProblem(policy, others = []) {
  const name = String(policy.name || '').trim();
  if (!name) return 'Nhập tên chính sách hoa hồng.';
  const rate = Number(policy.rate);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100 || Math.round(rate * 100) !== rate * 100) return 'Tỷ lệ hoa hồng phải lớn hơn 0, tối đa 100% và tối đa 2 chữ số thập phân.';
  if (!COMMISSION_BASES[policy.basis]) return 'Chọn căn cứ tính hoa hồng: khi đã bàn giao hoặc khi đã thu đủ tiền.';
  if (!ISO_DATE.test(String(policy.effectiveFrom || ''))) return 'Nhập ngày bắt đầu áp dụng.';
  if (policy.effectiveTo && (!ISO_DATE.test(policy.effectiveTo) || policy.effectiveTo < policy.effectiveFrom)) return 'Ngày kết thúc phải sau ngày bắt đầu áp dụng.';
  const end = (item) => item.effectiveTo || '9999-12-31';
  const overlap = others.find((item) => item.key !== policy.key && item.effectiveFrom <= end(policy) && policy.effectiveFrom <= end(item));
  if (overlap) return `Thời gian áp dụng trùng với chính sách "${overlap.name}"; mỗi thời điểm chỉ một chính sách.`;
  return '';
}

export const policyOn = (policies, date) => policies.find((item) => item.effectiveFrom <= date && date <= (item.effectiveTo || '9999-12-31')) || null;

/** Doanh số chưa thuế GTGT của chứng từ sau khi trừ hàng trả lại, giảm giá (theo tỷ lệ thuế của chứng từ). */
export function preTaxNet(doc) {
  const amount = Number(doc.amount) || 0;
  if (amount <= 0) return 0;
  const net = Math.max(0, amount - (Number(doc.adjustedAmount) || 0));
  const vatShare = Math.min(1, Math.max(0, (Number(doc.vatAmount) || 0) / amount));
  return Math.round(net * (1 - vatShare));
}

/** Hoa hồng của tháng (YYYY-MM) theo ngày chứng từ. Trả về từng nhân viên kèm chứng từ, và các chứng từ chưa gán nhân viên hoặc chưa có chính sách. */
export function calculateCommissions({ docs, policies, month }) {
  const byPerson = new Map();
  const unassigned = [];
  const noPolicy = [];
  for (const doc of docs) {
    if (doc.documentType !== 'sale' || doc.status === 'Đã hủy' || doc.subtype === 'Báo giá' || doc.adjustsDocumentId) continue;
    if (!String(doc.documentDate || '').startsWith(`${month}-`)) continue;
    const policy = policyOn(policies, doc.documentDate);
    if (!policy) { noPolicy.push({ key: doc.key, code: doc.code }); continue; }
    const eligible = policy.basis === 'paid' ? doc.remainingAmount !== undefined && doc.remainingAmount !== null && Number(doc.remainingAmount) <= 0 : doc.status === 'Đã bàn giao';
    if (!eligible) continue;
    if (!doc.salespersonId) { unassigned.push({ key: doc.key, code: doc.code }); continue; }
    const revenue = preTaxNet(doc);
    const commission = Math.round(revenue * Number(policy.rate) / 100);
    const entry = byPerson.get(doc.salespersonId) || { salespersonId: doc.salespersonId, salespersonName: doc.salespersonName || '', salespersonCode: doc.salespersonCode || '', salespersonDepartment: doc.salespersonDepartment || '', revenue: 0, commission: 0, documents: [] };
    entry.revenue += revenue;
    entry.commission += commission;
    entry.documents.push({ key: doc.key, code: doc.code, documentDate: doc.documentDate, revenue, rate: Number(policy.rate), commission, policy: policy.name });
    byPerson.set(doc.salespersonId, entry);
  }
  const rows = [...byPerson.values()].sort((a, b) => b.commission - a.commission);
  return { month, rows, totalCommission: rows.reduce((sum, row) => sum + row.commission, 0), unassigned, noPolicy };
}

/** Hoa hồng đã chốt của tháng theo nhân viên, để cộng vào bảng lương. */
export function commissionBonusByEmployee(closings, month) {
  const closing = closings.find((item) => item.month === month);
  return new Map((closing?.rows || []).map((row) => [row.salespersonId, row.commission]));
}
