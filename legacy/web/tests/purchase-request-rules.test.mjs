import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregatePendingPurchaseItems, filterPurchaseRequests } from '../src/modules/finance/purchaseRequestRules.ts';

const requests = [
  {
    key: 'YCMS-2026-0001', requestNumber: 'YCMS-2026-0001', requestDate: '2026-10-28',
    departmentName: 'Công nghệ', requester: 'Nguyễn An', deliveryDeadline: '2026-11-10', purpose: 'Thay máy tính',
    status: 'Chờ xác định nhà cung cấp', supplierName: '',
    items: [
      { itemName: 'Máy tính', unit: 'Bộ', quantity: 2, estimatedUnitPrice: 1000, lineTotal: 2000 },
      { itemName: 'Bàn phím', unit: 'Cái', quantity: 2, estimatedUnitPrice: 100, lineTotal: 200 },
    ],
  },
  {
    key: 'YCMS-2025-0001', requestNumber: 'YCMS-2025-0001', requestDate: '2025-05-02',
    departmentName: 'Công nghệ', requester: 'Trần Bình', deliveryDeadline: '2025-05-20', purpose: 'Nâng cấp thiết bị',
    status: 'Đã xác định nhà cung cấp', supplierName: 'Công ty Thiết bị',
    items: [{ itemName: 'Máy tính', unit: 'Bộ', quantity: 3, estimatedUnitPrice: 900, lineTotal: 2700 }],
  },
];

test('purchase request filters match year, status, purpose, supplier and item text', () => {
  assert.deepEqual(filterPurchaseRequests(requests, { year: '2026', status: 'Chờ xác định nhà cung cấp' }).map((item) => item.key), ['YCMS-2026-0001']);
  assert.deepEqual(filterPurchaseRequests(requests, { query: 'thiết bị' }).map((item) => item.key), ['YCMS-2025-0001']);
  assert.deepEqual(filterPurchaseRequests(requests, { query: 'bàn phím' }).map((item) => item.key), ['YCMS-2026-0001']);
  assert.equal(filterPurchaseRequests(requests, { year: '2024' }).length, 0);
});

test('purchase request aggregation combines only pending matching item and unit pairs', () => {
  const result = aggregatePendingPurchaseItems(requests);
  assert.deepEqual(result, [
    { itemName: 'Bàn phím', unit: 'Cái', quantity: 2, estimatedTotal: 200, requestCount: 1 },
    { itemName: 'Máy tính', unit: 'Bộ', quantity: 2, estimatedTotal: 2000, requestCount: 1 },
  ]);
});
