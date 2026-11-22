import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyAuditScan, auditBook, auditSummary, missingAssets } from '../src/modules/assets/assetAuditRules.ts';

const assets = [
  { code: 'TS-1', barcode: 'BC001', name: 'Laptop', department: 'Kỹ thuật', originalPrice: 30_000_000, accumulatedDepreciation: 10_000_000, netBookValue: 20_000_000, status: 'Đang sử dụng' },
  { code: 'TS-2', barcode: 'BC002', name: 'Máy in', department: 'Kỹ thuật', originalPrice: 8_000_000, accumulatedDepreciation: 0, status: 'Trong kho' },
  { code: 'TS-3', barcode: 'BC003', name: 'Màn hình', department: 'Kế toán', netBookValue: 3_000_000, status: 'Đang sử dụng' },
  { code: 'TS-4', name: 'Ghế cũ', department: 'Kỹ thuật', netBookValue: 0, status: 'Đã thanh lý' },
];

test('số theo sổ lấy từ danh mục theo phạm vi, bỏ tài sản đã thanh lý', () => {
  assert.deepEqual(auditBook(assets, 'Kỹ thuật'), { bookCount: 2, bookValue: 28_000_000 });
  assert.deepEqual(auditBook(assets, 'Toàn bộ công ty'), { bookCount: 3, bookValue: 31_000_000 });
});

test('quét mã: khớp trong phạm vi, thừa khi khác đơn vị hoặc không có trong danh mục, không ghi trùng', () => {
  let audit = { scope: 'Kỹ thuật', ...auditBook(assets, 'Kỹ thuật'), itemsList: [] };
  const first = applyAuditScan(audit, assets, ' bc001 ', '2026-11-22 10:00');
  assert.equal(first.outcome, 'matched');
  assert.equal(first.line.value, 20_000_000);
  audit = { ...audit, itemsList: first.itemsList };
  assert.equal(applyAuditScan(audit, assets, 'TS-1', 'x').outcome, 'duplicate');
  const other = applyAuditScan(audit, assets, 'BC003', 'x');
  assert.deepEqual([other.outcome, other.line.auditStatus], ['surplus', 'Thừa']);
  audit = { ...audit, itemsList: other.itemsList };
  const unknown = applyAuditScan(audit, assets, 'ZZ9', 'x');
  assert.equal(unknown.outcome, 'unknown');
  audit = { ...audit, itemsList: unknown.itemsList };
  assert.deepEqual(auditSummary(audit), { actualCount: 3, matchedCount: 1, surplusCount: 2, damagedCount: 0, missingCount: 1, discrepancy: 1, actualValue: 20_000_000, diffValue: -8_000_000 });
  assert.deepEqual(missingAssets(audit, assets).map((asset) => asset.code), ['TS-2']);
  assert.throws(() => applyAuditScan(audit, assets, '  ', 'x'));
});

test('tài sản hỏng trong phạm vi được tính là có mặt nhưng ghi hỏng hóc', () => {
  const audit = { scope: 'Kỹ thuật', ...auditBook(assets, 'Kỹ thuật'), itemsList: [] };
  const scan = applyAuditScan(audit, assets, 'BC002', 'x', true);
  assert.equal(scan.line.auditStatus, 'Hỏng hóc');
  assert.equal(auditSummary({ ...audit, itemsList: scan.itemsList }).missingCount, 1);
});
