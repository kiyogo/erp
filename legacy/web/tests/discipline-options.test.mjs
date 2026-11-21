import assert from 'node:assert/strict';
import test from 'node:test';
import * as api from '../../api/disciplineRules.mjs';
import * as web from '../src/modules/hr/disciplineOptions.ts';

test('danh mục kỷ luật ở web khớp với máy chủ', () => {
  assert.deepEqual(web.DISCIPLINE_FORMS, api.DISCIPLINE_FORMS);
  assert.deepEqual(web.VIOLATION_KINDS, api.VIOLATION_KINDS);
  assert.deepEqual(web.DISMISSAL_GROUNDS, api.DISMISSAL_GROUNDS);
  assert.deepEqual(web.PROTECTED_STATUSES, api.PROTECTED_STATUSES);
  assert.deepEqual(web.DISCIPLINE_ATTENDANCE, api.ATTENDANCE);
});
