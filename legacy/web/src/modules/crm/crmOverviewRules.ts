// Số liệu của CRM Tổng quan tính từ chứng từ bán hàng thật (finance_documents loại sale) và hồ sơ khách hàng (crm_contacts). Doanh số là giá trị
// đơn bán, hợp đồng bán (không tính báo giá, chứng từ đã hủy và chứng từ hàng trả lại, giảm giá), trừ phần đã điều chỉnh giảm của chính chứng từ đó.

export interface SaleDoc {
  key: string;
  code?: string;
  subtype?: string;
  status?: string;
  partnerName?: string;
  customerId?: string;
  amount?: number;
  adjustedAmount?: number;
  remainingAmount?: number;
  documentDate?: string;
  dueDate?: string;
  adjustsDocumentId?: string;
}

export interface CustomerLite {
  key: string;
  name?: string;
  details?: { entityKind?: 'organization' | 'person'; customerGroup?: string };
}

export const QUOTE_SUBTYPE = 'Báo giá';

export const saleNet = (doc: SaleDoc) => Math.max(0, (Number(doc.amount) || 0) - (Number(doc.adjustedAmount) || 0));

const isLive = (doc: SaleDoc) => doc.status !== 'Đã hủy' && !doc.adjustsDocumentId;

/** Chứng từ tạo doanh số: đơn bán, hợp đồng bán còn hiệu lực. */
export const revenueDocs = (docs: SaleDoc[]) => docs.filter((doc) => isLive(doc) && doc.subtype !== QUOTE_SUBTYPE);

/** Doanh số 12 tháng của một năm theo ngày chứng từ. */
export function monthlySales(docs: SaleDoc[], year: number): number[] {
  const months = Array.from({ length: 12 }, () => 0);
  for (const doc of revenueDocs(docs)) {
    const match = /^(\d{4})-(\d{2})/.exec(String(doc.documentDate || ''));
    if (match && Number(match[1]) === year) months[Number(match[2]) - 1] += saleNet(doc);
  }
  return months;
}

/** Doanh số theo loại khách hàng (tổ chức, cá nhân, nhóm khách hàng nếu có); chứng từ chưa gắn khách hàng xếp riêng. */
export function salesByCustomerKind(docs: SaleDoc[], customers: CustomerLite[]): Array<{ label: string; value: number }> {
  const byKey = new Map(customers.map((customer) => [customer.key, customer]));
  const totals = new Map<string, number>();
  for (const doc of revenueDocs(docs)) {
    const customer = doc.customerId ? byKey.get(doc.customerId) : undefined;
    const label = !customer ? 'Chưa gắn hồ sơ khách hàng' : customer.details?.entityKind === 'person' ? 'Khách hàng cá nhân' : 'Khách hàng tổ chức';
    totals.set(label, (totals.get(label) || 0) + saleNet(doc));
  }
  return [...totals.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

/** Khách hàng có doanh số cao nhất (theo hồ sơ khách hàng, chưa gắn hồ sơ thì theo tên đối tác trên chứng từ). */
export function topCustomers(docs: SaleDoc[], customers: CustomerLite[], limit = 5): Array<{ label: string; value: number; count: number }> {
  const byKey = new Map(customers.map((customer) => [customer.key, customer]));
  const totals = new Map<string, { label: string; value: number; count: number }>();
  for (const doc of revenueDocs(docs)) {
    const label = (doc.customerId && byKey.get(doc.customerId)?.name) || doc.partnerName || 'Chưa ghi khách hàng';
    const id = doc.customerId || `name:${label}`;
    const current = totals.get(id) || { label, value: 0, count: 0 };
    totals.set(id, { label, value: current.value + saleNet(doc), count: current.count + 1 });
  }
  return [...totals.values()].sort((a, b) => b.value - a.value).slice(0, limit);
}

/** Tình hình thực hiện: báo giá, đơn đang triển khai, đã bàn giao (số chứng từ và giá trị). */
export function activitySummary(docs: SaleDoc[]) {
  const live = docs.filter(isLive);
  const pick = (filter: (doc: SaleDoc) => boolean) => {
    const rows = live.filter(filter);
    return { count: rows.length, value: rows.reduce((sum, doc) => sum + saleNet(doc), 0) };
  };
  return {
    quotes: pick((doc) => doc.subtype === QUOTE_SUBTYPE),
    inProgress: pick((doc) => doc.subtype !== QUOTE_SUBTYPE && doc.status !== 'Đã bàn giao'),
    delivered: pick((doc) => doc.subtype !== QUOTE_SUBTYPE && doc.status === 'Đã bàn giao'),
  };
}

/** Công nợ phải thu đã quá hạn thanh toán tính đến ngày today (YYYY-MM-DD). */
export function overdueReceivables(docs: SaleDoc[], today: string) {
  const rows = revenueDocs(docs).filter((doc) => (Number(doc.remainingAmount) || 0) > 0 && doc.dueDate && doc.dueDate < today);
  return { count: rows.length, value: rows.reduce((sum, doc) => sum + (Number(doc.remainingAmount) || 0), 0) };
}

/** Mục tiêu doanh số theo tháng (khóa YYYY-MM) so với doanh số thực hiện của một năm. */
export function targetProgress(actualMonths: number[], targets: Record<string, number>, year: number) {
  const rows = actualMonths.map((actual, index) => ({ month: index + 1, actual, target: Number(targets[`${year}-${String(index + 1).padStart(2, '0')}`]) || 0 }));
  const targetTotal = rows.reduce((sum, row) => sum + row.target, 0);
  const actualTotal = rows.reduce((sum, row) => sum + row.actual, 0);
  return { rows, targetTotal, actualTotal, percent: targetTotal ? Math.round(actualTotal / targetTotal * 1000) / 10 : null };
}

/** Các kỳ tháng (YYYY-MM) thuộc bộ lọc thời gian; hôm nay và tuần này không so được với mục tiêu tháng. */
export function targetPeriodsForFilter(filter: string, now = new Date()): string[] {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const key = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
  if (filter === 'this_month') return [key(year, month)];
  if (filter === 'this_quarter') { const first = Math.floor((month - 1) / 3) * 3 + 1; return [first, first + 1, first + 2].map((m) => key(year, m)); }
  if (filter === 'this_year') return Array.from({ length: 12 }, (_, i) => key(year, i + 1));
  if (/^\d{4}$/.test(filter)) return Array.from({ length: 12 }, (_, i) => key(Number(filter), i + 1));
  return [];
}
