import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assetDisposalMethodLabel, assetDisposalOutcome, assetDisposalSnapshot, calculateDisposalResult, disposalMoney, disposalNeedsDataWipe } from '../src/modules/assets/assetDisposalRules.ts';

test('disposal proposal takes identity and book value from an eligible real asset', () => {
  assert.deepEqual(assetDisposalSnapshot({ key: 'asset-1', code: 'TS-1', name: 'Workstation', category: 'Thiết bị IT', model: 'SN01', status: 'Đang sử dụng', originalPrice: 3000, accumulatedDepreciation: 2500 }), {
    assetKey: 'asset-1', assetCode: 'TS-1', assetName: 'Workstation', category: 'Thiết bị IT', serialNo: 'SN01', sourceAssetStatus: 'Đang sử dụng', originalCost: 3000, accumulatedDepreciation: 2500, netBookValue: 500,
  });
  for (const status of ['Đã thanh lý', 'Đang sửa chữa', '']) assert.throws(() => assetDisposalSnapshot({ key: 'asset-1', code: 'TS-1', status, originalPrice: 100 }));
  assert.throws(() => assetDisposalSnapshot({ key: 'asset-1', code: 'TS-1', status: 'Trong kho', originalPrice: 100, accumulatedDepreciation: 101 }));
});

test('disposal accounting uses actual proceeds, expenses and book value and preserves zero', () => {
  assert.deepEqual(calculateDisposalResult(3000, 2500, 800, 100), { originalCost: 3000, accumulatedDepreciation: 2500, netBookValue: 500, actualDisposalPrice: 800, disposalCost: 100, netGainLoss: 200 });
  assert.equal(calculateDisposalResult(3000, 2500, 0, 100).netGainLoss, -600);
  for (const value of ['', '-1', '1.1', Infinity, 'nope']) assert.throws(() => disposalMoney(value, 'Giá'));
  assert.throws(() => calculateDisposalResult(100, 101, 0, 0));
});

test('disposal completion preserves sale, destruction, and loss as distinct outcomes and requires data wipe for risky assets', () => {
  assert.equal(assetDisposalOutcome('Bán đấu giá nội bộ CBNV'), 'Đã thanh lý & Hoàn tất sổ sách');
  assert.equal(assetDisposalOutcome('Tiêu hủy an toàn (Data Wiping / Shredding)'), 'Đã tiêu hủy an toàn');
  assert.equal(assetDisposalOutcome('Báo mất / Thất lạc do rủi ro'), 'Đã xử lý mất');
  assert.equal(disposalNeedsDataWipe('Thiết bị IT', 'Bán thanh lý cho đơn vị thu mua ngoài'), true);
  assert.equal(disposalNeedsDataWipe('Nội thất văn phòng', 'Tiêu hủy an toàn (Data Wiping / Shredding)'), true);
  assert.equal(disposalNeedsDataWipe('Nội thất văn phòng', 'Tặng / Quyên góp từ thiện'), false);
  assert.equal(disposalNeedsDataWipe('Thiết bị IT', 'Báo mất / Thất lạc do rủi ro'), false);
  assert.equal(disposalNeedsDataWipe('Thiết bị IT', 'Bán thanh lý cho đơn vị thu mua ngoài'), true);
  assert.throws(() => assetDisposalOutcome('unknown'));
});

test('disposal list labels every handling method distinctly', () => {
  assert.equal(assetDisposalMethodLabel('Bán đấu giá nội bộ CBNV'), 'Đấu giá CBNV');
  assert.equal(assetDisposalMethodLabel('Bán thanh lý cho đơn vị thu mua ngoài'), 'Bán thanh lý ngoài');
  assert.equal(assetDisposalMethodLabel('Tiêu hủy an toàn (Data Wiping / Shredding)'), 'Tiêu hủy');
  assert.equal(assetDisposalMethodLabel('Tặng / Quyên góp từ thiện'), 'Tặng / Quyên góp');
  assert.equal(assetDisposalMethodLabel('Báo mất / Thất lạc do rủi ro'), 'Báo mất');
});
