import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activitySummary, monthlySales, overdueReceivables, salesByCustomerKind, topCustomers } from '../src/modules/crm/crmOverviewRules.ts';

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
