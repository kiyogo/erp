import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildWarehouseLayout } from '../src/modules/finance/warehouseLayoutRules.ts';

const locations = [
  { key: 'near', warehouse: 'Kho A', code: 'A-01', zone: 'A', shelf: '01', capacityItems: 1, pickOrder: 1, status: 'Đang hoạt động' },
  { key: 'far', warehouse: 'Kho A', code: 'A-02', zone: 'A', shelf: '02', capacityItems: 2, pickOrder: 2, status: 'Đang hoạt động' },
  { key: 'closed', warehouse: 'Kho A', code: 'A-03', capacityItems: 5, pickOrder: 0, status: 'Tạm ngưng' },
  { key: 'warehouse-b', warehouse: 'Kho B', code: 'B-01', capacityItems: 1, pickOrder: 1, status: 'Đang hoạt động' },
];
const items = [
  { key: 'fast', sku: 'SKU-FAST', name: 'Hàng bán chạy', unit: 'Cái', warehouse: 'Kho A', storageLocation: 'A-02', stockQty: 5, stockByWarehouse: [{ warehouse: 'Kho A', quantity: 5 }] },
  { key: 'slow', sku: 'SKU-SLOW', name: 'Hàng bán chậm', unit: 'Cái', warehouse: 'Kho A', storageLocation: 'A-01', stockQty: 2, stockByWarehouse: [{ warehouse: 'Kho A', quantity: 2 }] },
  { key: 'unlocated', sku: 'SKU-NEW', name: 'Hàng chưa xếp', unit: 'Cái', warehouse: 'Kho A', storageLocation: '', stockQty: 1 },
  { key: 'overflow', sku: 'SKU-OVER', name: 'Hàng dư sức chứa', unit: 'Cái', warehouse: 'Kho A', stockQty: 1 },
  { key: 'other-warehouse', sku: 'SKU-B', name: 'Hàng kho B', unit: 'Cái', warehouse: 'Kho A', storageLocation: '', stockQty: 2, stockByWarehouse: [{ warehouse: 'Kho B', quantity: 2 }], storageAssignments: [{ warehouse: 'Kho B', locationCode: 'B-01' }] },
];
const movements = [
  { type: 'Xuất kho', transactionDate: '2026-10-01', lines: [{ itemKey: 'fast', warehouse: 'Kho A', quantity: 4 }] },
  { type: 'Giao hàng', transactionDate: '2026-10-02', lines: [{ itemKey: 'fast', warehouse: 'Kho A', quantity: 1 }] },
  { type: 'Tháo dỡ', transactionDate: '2026-10-03', lines: [{ itemKey: 'fast', warehouse: 'Kho A', direction: 'Thành phẩm', quantity: 1 }] },
  { type: 'Kiểm kê', transactionDate: '2026-10-04', lines: [{ itemKey: 'slow', warehouse: 'Kho A', difference: -1 }] },
  { type: 'Nhập kho', transactionDate: '2026-10-05', lines: [{ itemKey: 'overflow', warehouse: 'Kho A', quantity: 50 }] },
  { type: 'Xuất kho', transactionDate: '2025-10-28', lines: [{ itemKey: 'slow', warehouse: 'Kho A', quantity: 99 }] },
];

test('warehouse map reports actual stock assignments, capacity and unlocated items', () => {
  const layout = buildWarehouseLayout(locations, items, movements, '2026-10-29');
  assert.equal(layout.totalSlots, 4);
  assert.equal(layout.occupiedSlots, 3);
  assert.equal(layout.locations.find(location => location.code === 'A-02').quantity, 5);
  assert.equal(layout.locations.find(location => location.code === 'A-03').occupiedItems, 0);
  assert.deepEqual(layout.unlocatedItems.map(row => [row.item.sku, row.warehouse]).sort(), [
    ['SKU-NEW', 'Kho A'],
    ['SKU-OVER', 'Kho A'],
  ]);
});

test('layout recommendations put the highest real pick activity first without exceeding bin capacity', () => {
  const layout = buildWarehouseLayout(locations, items, movements, '2026-10-29');
  assert.deepEqual(layout.suggestions.map(row => [row.item.sku, row.currentLocation, row.recommendedLocation, row.pickCount, row.pickedQuantity]), [
    ['SKU-FAST', 'A-02', 'A-01', 3, 6],
    ['SKU-SLOW', 'A-01', 'A-02', 1, 1],
    ['SKU-NEW', '', 'A-02', 0, 0],
  ]);
  assert.deepEqual(layout.itemsWithoutCapacity.map(row => row.item.sku), ['SKU-OVER']);
  assert.ok(!layout.suggestions.some(row => row.item.sku === 'SKU-B'), 'Other warehouses must be optimized against their own bins.');
});

test('movement ranking ignores receipts and movements outside the trailing year', () => {
  const layout = buildWarehouseLayout(locations, items, movements, '2026-10-29');
  const slow = layout.suggestions.find(row => row.item.sku === 'SKU-SLOW');
  assert.equal(slow.pickCount, 1);
  assert.equal(slow.pickedQuantity, 1);
});
