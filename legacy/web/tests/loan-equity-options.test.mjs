import assert from 'node:assert/strict';
import test from 'node:test';
import * as api from '../../api/loanEquityRules.mjs';
import * as web from '../src/modules/finance/loanEquityOptions.ts';

test('danh mục khế ước và cổ phần ở web khớp với máy chủ', () => {
  assert.deepEqual(web.COUNTERPARTY_TYPES, api.COUNTERPARTY_TYPES);
  assert.deepEqual(web.SHARE_CLASSES, api.SHARE_CLASSES);
  assert.deepEqual(web.HOLDER_KINDS, api.HOLDER_KINDS);
});
