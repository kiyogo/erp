import assert from 'node:assert/strict';
import test from 'node:test';
import { ASSET_LIFE_GROUPS as apiGroups, ASSET_CLASSES } from '../../api/assetRules.mjs';
import { ASSET_CLASS_OPTIONS, ASSET_LIFE_GROUPS as webGroups } from '../src/modules/assets/assetLifeGroups.ts';

test('khung khấu hao và phân loại tài sản ở web khớp với máy chủ', () => {
  assert.deepEqual(webGroups, apiGroups);
  assert.deepEqual(ASSET_CLASS_OPTIONS.map(option => option.value), ASSET_CLASSES);
});
