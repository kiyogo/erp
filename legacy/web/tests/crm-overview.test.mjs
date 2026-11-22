import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activitySummary, monthlySales, overdueReceivables, salesByCustomerKind, salesByDepartment, salesBySalesperson, targetPeriodsForFilter, targetProgress, topCustomers } from '../src/modules/crm/crmOverviewRules.ts';

const customers = [
  { key: 'c1', name: 'Công ty A', details: { entityKind: 'organization' } },
  { key: 'c2', name: 'Anh B', details: { entityKind: 'person' } },
];
const docs = [
  { key: '1', subtype: 'Đơn bán hàng', status: 'Đã bàn giao', customerId: 'c1', amount: 10_000_000, adjustedAmount: 1_000_000, remainingAmount: 4_000_000, documentDate: '2026-03-05', dueDate: '2026-04-01' },
  { key: '2', subtype: 'Hợp đồng bán', status: 'Đang triển khai', customerId: 'c2', amount: 5_000_000, remainingAmount: 5_000_000, documentDate: '2026-03-20', dueDate: '2026-12-31' },
  { key: '3', subtype: 'Báo giá', status: 'Báo giá', customerId: 'c1', amount: 7_000_000, documentDate: '2026-04-02' },
  { key: '4', subtype: 'Đơn bán hàng', status: 'Đã hủy', customerId: 'c1', amount: 9_000_000, documentDate: '2026-04-03' },
  { key: '5', subtype: 'Hàng bán bị trả lại', status: 'Đã ghi nhận', customerId: 'c1', amount: 1_000_000, documentDate: '2026-04-04', adjustsDocumentId: '1' },
  { key: '6', subtype: 'Đơn bán hàng', status: 'Đã bàn giao', partnerName: 'Khách lẻ', amount: 2_000_000, documentDate: '2025-12-30' },
];

test('doanh số theo tháng chỉ tính đơn, hợp đồng bán còn hiệu lực, trừ phần điều chỉnh giảm', () => {
  const months = monthlySales(docs, 2026);
  assert.equal(months[2], 14_000_000);
  assert.equal(months[3], 0);
  assert.equal(monthlySales(docs, 2025)[11], 2_000_000);
});

test('doanh số theo loại khách hàng và khách hàng lớn nhất', () => {
  assert.deepEqual(salesByCustomerKind(docs, customers), [
    { label: 'Khách hàng tổ chức', value: 9_000_000 },
    { label: 'Khách hàng cá nhân', value: 5_000_000 },
    { label: 'Chưa gắn hồ sơ khách hàng', value: 2_000_000 },
  ]);
  assert.deepEqual(topCustomers(docs, customers, 2), [{ label: 'Công ty A', value: 9_000_000, count: 1 }, { label: 'Anh B', value: 5_000_000, count: 1 }]);
});

test('tình hình thực hiện và nợ quá hạn', () => {
  assert.deepEqual(activitySummary(docs), {
    quotes: { count: 1, value: 7_000_000 },
    inProgress: { count: 1, value: 5_000_000 },
    delivered: { count: 2, value: 11_000_000 },
  });
  assert.deepEqual(overdueReceivables(docs, '2026-11-22'), { count: 1, value: 4_000_000 });
});

test('mục tiêu doanh số theo tháng và kỳ của bộ lọc', () => {
  const progress = targetProgress(monthlySales(docs, 2026), { '2026-03': 20_000_000, '2026-04': 10_000_000, '2025-03': 99 }, 2026);
  assert.deepEqual([progress.targetTotal, progress.actualTotal, progress.percent], [30_000_000, 14_000_000, 46.7]);
  assert.equal(progress.rows[2].target, 20_000_000);
  assert.equal(targetProgress([0, 0], {}, 2026).percent, null);
  const now = new Date(2026, 10, 22);
  assert.deepEqual(targetPeriodsForFilter('this_month', now), ['2026-11']);
  assert.deepEqual(targetPeriodsForFilter('this_quarter', now), ['2026-10', '2026-11', '2026-12']);
  assert.equal(targetPeriodsForFilter('2025', now).length, 12);
  assert.deepEqual(targetPeriodsForFilter('this_week', now), []);
});

test('doanh số theo nhân viên bán hàng và đơn vị của nhân viên', () => {
  const sellerDocs = [
    { ...docs[0], salespersonId: 'u1', salespersonName: 'Lan', salespersonDepartment: 'Kinh doanh 1' },
    { ...docs[1], salespersonId: 'u2', salespersonName: 'Minh', salespersonDepartment: '' },
    docs[2], docs[5],
  ];
  assert.deepEqual(salesBySalesperson(sellerDocs), [
    { label: 'Lan', value: 9_000_000, count: 1 },
    { label: 'Minh', value: 5_000_000, count: 1 },
    { label: 'Chưa gán nhân viên bán', value: 2_000_000, count: 1 },
  ]);
  assert.deepEqual(salesByDepartment(sellerDocs), [
    { label: 'Kinh doanh 1', value: 9_000_000 },
    { label: 'Chưa xác định đơn vị', value: 5_000_000 },
    { label: 'Chưa gán nhân viên bán', value: 2_000_000 },
  ]);
});

test('doanh số chưa thuế theo hàng hóa: chia doanh số chứng từ theo dòng, gộp theo mặt hàng', async () => {
  const { salesByItem, preTaxSaleNet, NO_LINES } = await import('../src/modules/crm/crmOverviewRules.ts');
  const lineDocs = [
    // 1.100.000 gồm 10% thuế, đã trả lại 220.000 (gồm thuế) -> chưa thuế 800.000, chia theo dòng 700.000 : 300.000.
    { key: 'a', subtype: 'Đơn bán hàng', status: 'Đã bàn giao', amount: 1_100_000, vatAmount: 100_000, adjustedAmount: 220_000,
      lines: [{ itemKey: 'i1', sku: 'A4', name: 'Giấy A4', unit: 'Ram', quantity: 10, amount: 700_000 }, { name: 'Lắp đặt', unit: '', quantity: 1.5, amount: 300_000 }] },
    { key: 'b', subtype: 'Hợp đồng bán', status: 'Đang triển khai', amount: 220_000, vatAmount: 20_000,
      lines: [{ itemKey: 'i1', sku: 'A4', name: 'Giấy A4 loại 1', unit: 'Ram', quantity: 2.5, amount: 200_000 }] },
    { key: 'c', subtype: 'Đơn bán hàng', status: 'Đã bàn giao', amount: 500_000, vatAmount: 0 },
    { key: 'd', subtype: 'Báo giá', status: 'Báo giá', amount: 999_000, vatAmount: 0, lines: [{ name: 'X', quantity: 1, amount: 999_000 }] },
    { key: 'e', subtype: 'Hàng bán bị trả lại', status: 'Đã ghi nhận', amount: 220_000, vatAmount: 20_000, adjustsDocumentId: 'a' },
  ];
  assert.equal(preTaxSaleNet(lineDocs[0]), 800_000);
  assert.deepEqual(salesByItem(lineDocs), [
    { label: 'A4 · Giấy A4', value: 760_000, quantity: 12.5, unit: 'Ram', count: 2 },
    { label: NO_LINES, value: 500_000, quantity: 0, unit: '', count: 1 },
    { label: 'Lắp đặt', value: 240_000, quantity: 1.5, unit: '', count: 1 },
  ]);
});
