import assert from 'node:assert/strict';
import test from 'node:test';
import { TERMINATION_TYPES as apiTypes } from '../../api/terminationRules.mjs';
import { TERMINATION_TYPES as webTypes } from '../src/modules/hr/terminationTypes.ts';

test('loại chấm dứt hợp đồng ở web khớp với máy chủ', () => {
  assert.deepEqual(webTypes, apiTypes);
});
