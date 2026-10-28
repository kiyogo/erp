import test from 'node:test';
import assert from 'node:assert/strict';
import { getEligibleDepreciationAssets } from '../src/modules/assets/assetDepreciationRules.ts';

test('depreciation setup only offers eligible inventory assets once', () => {
  const assets = [
    { key: 'available', code: 'AST-1', status: 'Trong kho', originalPrice: 30_000_000, depreciationMonths: 36 },
    { key: 'in-use', code: 'AST-2', status: 'Đang sử dụng', originalPrice: 24_000_000, depreciationMonths: 24 },
    { key: 'opening-balance', code: 'AST-8', status: 'Trong kho', originalPrice: 30_000_000, accumulatedDepreciation: 2_500_000, netBookValue: 27_500_000, depreciationMonths: 36 },
    { key: 'fully-depreciated', code: 'AST-10', status: 'Đang sử dụng', originalPrice: 30_000_000, accumulatedDepreciation: 30_000_000, netBookValue: 0, depreciationMonths: 36 },
    { key: 'retired', code: 'AST-3', status: 'Đã thanh lý', originalPrice: 30_000_000, depreciationMonths: 36 },
    { key: 'written-down', code: 'AST-4', status: 'Trong kho', originalPrice: 30_000_000, accumulatedDepreciation: 10, depreciationMonths: 36 },
    { key: 'opening-mismatch', code: 'AST-9', status: 'Trong kho', originalPrice: 30_000_000, accumulatedDepreciation: 2_500_000, netBookValue: 27_499_999, depreciationMonths: 36 },
    { key: 'invalid-life', code: 'AST-5', status: 'Trong kho', originalPrice: 30_000_000, depreciationMonths: 121 },
    { key: 'registered', code: 'AST-6', status: 'Trong kho', originalPrice: 30_000_000, depreciationMonths: 36 },
    { key: 'legacy-registered', code: 'AST-7', status: 'Trong kho', originalPrice: 30_000_000, depreciationMonths: 36 },
  ];
  const previous = [
    { assetKey: 'registered', assetCode: 'AST-6' },
    { assetCode: 'ast-7' },
  ];
  assert.deepEqual(getEligibleDepreciationAssets(assets, previous).map((asset) => asset.key), ['available', 'in-use', 'opening-balance', 'fully-depreciated']);
});
