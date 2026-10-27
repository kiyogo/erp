import assert from 'node:assert/strict';
import { test } from 'node:test';
import { derivePromotionStatus, promotionExportRows, promotionMetrics } from '../src/modules/crm/promotionRules.ts';

const today = '2026-10-27';
const record = (overrides = {}) => ({
  key: 'promo-1', code: 'KM-01', name: 'Khuyến mại tháng 10', startDate: '2026-10-01', endDate: '2026-10-31',
  promotionType: 'Chiết khấu', target: 'Khách hàng thành viên', enabled: true, allowConcurrent: false,
  eligibleItemCodes: ['SP-1'], amountBasis: 'Thành tiền trước thuế', orgUnitKeys: [], employeeIds: [],
  applyOnce: true, owner: 'Admin', ownerId: 'admin-1', combinablePromotionKeys: [], taxCondition: 'Bất kỳ',
  minimumSubtotal: 100_000, unitPrice: 0, unit: 'đơn hàng', customerKeys: [], discountKind: 'Phần trăm',
  discountValue: 10, status: 'Đang hoạt động', createdAt: today, updatedAt: today, ...overrides,
});

test('promotion status follows enabled flag and the campaign date range', () => {
  assert.equal(derivePromotionStatus(record({ enabled: false }), today), 'Tạm dừng');
  assert.equal(derivePromotionStatus(record({ startDate: '2026-11-01' }), today), 'Nháp');
  assert.equal(derivePromotionStatus(record({ endDate: '2026-10-26' }), today), 'Đã kết thúc');
  assert.equal(derivePromotionStatus(record({ enabled: false, endDate: '2026-10-26' }), today), 'Đã kết thúc');
  assert.equal(derivePromotionStatus(record(), today), 'Đang hoạt động');
});

test('promotion metrics report actual campaign counts without inventing values', () => {
  assert.deepEqual(promotionMetrics([
    record(), record({ key: 'promo-2', startDate: '2026-11-01' }),
    record({ key: 'promo-3', enabled: false }), record({ key: 'promo-4', endDate: '2026-10-20' }),
  ], today), { total: 4, active: 1, scheduled: 1, ended: 1 });
});

test('promotion export uses the supplied filtered records and derived status', () => {
  const rows = promotionExportRows([record()], today);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'KM-01');
  assert.equal(rows[1][6], 'Đang hoạt động');
  assert.equal(rows[1][14], 'SP-1');
});
