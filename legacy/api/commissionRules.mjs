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

// Hoa hồng bậc thang theo doanh số chưa thuế trong tháng của từng nhân viên (theo từng chính sách): mỗi bậc { from, rate } áp dụng từ mức doanh số
// `from` trở lên, bậc đầu từ 0. Lũy tiến từng phần: phần doanh số trong mỗi bậc nhân tỷ lệ của bậc đó. Toàn bộ theo bậc: cả doanh số nhân tỷ lệ của
// bậc cao nhất đạt được. Đây là quy chế nội bộ của doanh nghiệp, không có căn cứ pháp luật riêng.
export const COMMISSION_TIER_MODES = {
  progressive: 'Lũy tiến từng phần',
  whole: 'Toàn bộ doanh số theo bậc đạt được',
};
export const MAX_COMMISSION_TIERS = 10;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const validRate = (rate) => Number.isFinite(rate) && rate > 0 && rate <= 100 && Math.round(rate * 100) === rate * 100;

function tiersProblem(policy) {
  const tiers = policy.tiers || [];
  if (!tiers.length) return '';
  if (!Array.isArray(tiers) || tiers.length > MAX_COMMISSION_TIERS) return `Hoa hồng bậc thang có tối đa ${MAX_COMMISSION_TIERS} bậc.`;
  if (!COMMISSION_TIER_MODES[policy.tierMode]) return 'Chọn cách tính bậc thang: lũy tiến từng phần hoặc toàn bộ doanh số theo bậc đạt được.';
  for (const [index, tier] of tiers.entries()) {
    const from = Number(tier?.from);
    if (!Number.isSafeInteger(from) || from < 0) return `Bậc ${index + 1}: mức doanh số phải là số nguyên không âm.`;
    if (index === 0 && from !== 0) return 'Bậc 1 phải bắt đầu từ doanh số 0.';
    if (index > 0 && from <= Number(tiers[index - 1].from)) return `Bậc ${index + 1}: mức doanh số phải lớn hơn bậc trước.`;
    if (!validRate(Number(tier?.rate))) return `Bậc ${index + 1}: tỷ lệ phải lớn hơn 0, tối đa 100% và tối đa 2 chữ số thập phân.`;
  }
  return '';
}

/** Hoa hồng của tổng doanh số theo bậc thang của chính sách. */
export function tierCommission(revenue, tiers, mode) {
  if (revenue <= 0) return 0;
  if (mode === 'whole') {
    const reached = [...tiers].reverse().find((tier) => revenue >= tier.from) || tiers[0];
    return Math.round(revenue * reached.rate / 100);
  }
  return Math.round(tiers.reduce((sum, tier, index) => {
    const upper = index + 1 < tiers.length ? Math.min(revenue, tiers[index + 1].from) : revenue;
    return sum + Math.max(0, upper - tier.from) * tier.rate / 100;
  }, 0));
}

export function commissionPolicyProblem(policy, others = []) {
  const name = String(policy.name || '').trim();
  if (!name) return 'Nhập tên chính sách hoa hồng.';
  const tierProblem = tiersProblem(policy);
  if (tierProblem) return tierProblem;
  if (!validRate(Number(policy.rate))) return 'Tỷ lệ hoa hồng phải lớn hơn 0, tối đa 100% và tối đa 2 chữ số thập phân.';
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

/**
 * Hoa hồng của tháng (YYYY-MM) theo ngày chứng từ. Trả về từng nhân viên kèm chứng từ, và các chứng từ chưa gán nhân viên hoặc chưa có chính sách.
 * Chính sách một tỷ lệ tính trên từng chứng từ; chính sách bậc thang tính trên tổng doanh số của nhân viên trong tháng theo chính sách đó rồi chia
 * lại cho từng chứng từ theo tỷ lệ doanh số (chứng từ cuối nhận phần chênh làm tròn), tỷ lệ của chứng từ là tỷ lệ bình quân.
 */
export function calculateCommissions({ docs, policies, month }) {
  const groups = new Map();
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
    const groupKey = `${doc.salespersonId}|${policy.key}`;
    const group = groups.get(groupKey) || { policy, doc, items: [] };
    group.items.push({ doc, revenue: preTaxNet(doc) });
    groups.set(groupKey, group);
  }
  const byPerson = new Map();
  for (const { policy, doc: first, items } of groups.values()) {
    const tiered = (policy.tiers || []).length > 0;
    const revenue = items.reduce((sum, item) => sum + item.revenue, 0);
    const total = tiered ? tierCommission(revenue, policy.tiers, policy.tierMode) : 0;
    const groupRate = revenue > 0 ? Math.round(total / revenue * 10_000) / 100 : 0;
    let allocated = 0;
    const entry = byPerson.get(first.salespersonId) || { salespersonId: first.salespersonId, salespersonName: first.salespersonName || '', salespersonCode: first.salespersonCode || '', salespersonDepartment: first.salespersonDepartment || '', revenue: 0, commission: 0, documents: [] };
    items.forEach(({ doc, revenue: docRevenue }, index) => {
      let commission;
      if (!tiered) commission = Math.round(docRevenue * Number(policy.rate) / 100);
      else commission = index === items.length - 1 ? total - allocated : (revenue > 0 ? Math.round(total * docRevenue / revenue) : 0);
      allocated += commission;
      entry.revenue += docRevenue;
      entry.commission += commission;
      entry.documents.push({ key: doc.key, code: doc.code, documentDate: doc.documentDate, revenue: docRevenue, rate: tiered ? groupRate : Number(policy.rate), commission, policy: policy.name, ...(tiered ? { tierMode: policy.tierMode, policyRevenue: revenue } : {}) });
    });
    byPerson.set(first.salespersonId, entry);
  }
  const rows = [...byPerson.values()].sort((a, b) => b.commission - a.commission);
  return { month, rows, totalCommission: rows.reduce((sum, row) => sum + row.commission, 0), unassigned, noPolicy };
}

/** Hoa hồng đã chốt của tháng theo nhân viên, để cộng vào bảng lương. */
export function commissionBonusByEmployee(closings, month) {
  const closing = closings.find((item) => item.month === month);
  return new Map((closing?.rows || []).map((row) => [row.salespersonId, row.commission]));
}
