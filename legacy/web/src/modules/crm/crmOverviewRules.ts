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

export interface SellerDoc extends SaleDoc { salespersonId?: string; salespersonName?: string; salespersonDepartment?: string }

export const NO_SALESPERSON = 'Chưa gán nhân viên bán';
export const NO_DEPARTMENT = 'Chưa xác định đơn vị';

/** Doanh số theo nhân viên bán hàng ghi trên chứng từ (chụp lại lúc gán). */
export function salesBySalesperson(docs: SellerDoc[]): Array<{ label: string; value: number; count: number }> {
  const totals = new Map<string, { label: string; value: number; count: number }>();
  for (const doc of revenueDocs(docs) as SellerDoc[]) {
    const id = doc.salespersonId || '';
    const current = totals.get(id) || { label: id ? doc.salespersonName || id : NO_SALESPERSON, value: 0, count: 0 };
    totals.set(id, { ...current, value: current.value + saleNet(doc), count: current.count + 1 });
  }
  return [...totals.values()].sort((a, b) => b.value - a.value);
}

/** Doanh số theo đơn vị: phòng ban của nhân viên bán hàng tại thời điểm gán. */
export function salesByDepartment(docs: SellerDoc[]): Array<{ label: string; value: number }> {
  const totals = new Map<string, number>();
  for (const doc of revenueDocs(docs) as SellerDoc[]) {
    const label = doc.salespersonId ? doc.salespersonDepartment || NO_DEPARTMENT : NO_SALESPERSON;
    totals.set(label, (totals.get(label) || 0) + saleNet(doc));
  }
  return [...totals.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export interface LineDoc extends SaleDoc { vatAmount?: number; lines?: Array<{ itemKey?: string; sku?: string; name: string; unit?: string; quantity: number; amount: number }> }

export const NO_LINES = 'Chứng từ chưa có dòng hàng';

/** Doanh số chưa thuế GTGT của chứng từ sau khi trừ hàng trả lại, giảm giá (bỏ phần thuế theo tỷ lệ thuế của chứng từ). */
export function preTaxSaleNet(doc: LineDoc) {
  const amount = Number(doc.amount) || 0;
  if (amount <= 0) return 0;
  const vatShare = Math.min(1, Math.max(0, (Number(doc.vatAmount) || 0) / amount));
  return Math.round(saleNet(doc) * (1 - vatShare));
}

/**
 * Doanh số chưa thuế theo hàng hóa, dịch vụ từ dòng hàng của chứng từ bán. Doanh số chưa thuế của chứng từ (đã trừ trả lại, giảm giá, khuyến mại)
 * được chia cho các dòng theo tỷ lệ thành tiền; số lượng giữ nguyên theo dòng. Gộp theo mặt hàng kho, không có thì theo tên và đơn vị tính.
 * Chứng từ không có dòng hàng xếp chung một dòng riêng.
 */
export function salesByItem(docs: LineDoc[]): Array<{ label: string; value: number; quantity: number; unit: string; count: number }> {
  const totals = new Map<string, { label: string; value: number; quantity: number; unit: string; docs: Set<string> }>();
  const add = (key: string, label: string, unit: string, value: number, quantity: number, docKey: string) => {
    const current = totals.get(key) || { label, value: 0, quantity: 0, unit, docs: new Set<string>() };
    current.value += value;
    current.quantity += quantity;
    current.docs.add(docKey);
    totals.set(key, current);
  };
  for (const doc of revenueDocs(docs) as LineDoc[]) {
    const net = preTaxSaleNet(doc);
    const lines = doc.lines || [];
    const linesTotal = lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
    if (!lines.length || linesTotal <= 0) { add('', NO_LINES, '', net, 0, doc.key); continue; }
    let allocated = 0;
    lines.forEach((line, index) => {
      // Dòng cuối nhận phần chênh làm tròn để tổng các dòng bằng doanh số chưa thuế của chứng từ.
      const value = index === lines.length - 1 ? net - allocated : Math.round((net * (Number(line.amount) || 0)) / linesTotal);
      allocated += value;
      const name = String(line.name || '').trim();
      const unit = String(line.unit || '').trim();
      const key = line.itemKey ? `item:${line.itemKey}` : `name:${name.toLocaleLowerCase('vi-VN')}|${unit.toLocaleLowerCase('vi-VN')}`;
      add(key, line.sku ? `${line.sku} · ${name}` : name, unit, value, Number(line.quantity) || 0, doc.key);
    });
  }
  return [...totals.values()]
    .map(({ docs: keys, quantity, ...row }) => ({ ...row, quantity: Math.round(quantity * 1000) / 1000, count: keys.size }))
    .sort((a, b) => b.value - a.value);
}
