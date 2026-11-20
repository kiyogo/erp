import assert from 'node:assert/strict';
import test from 'node:test';
import { LEAVE_TYPES } from '../../api/attendanceRules.mjs';
import { LEAVE_TYPE_LABELS } from '../src/modules/attendance/leaveTypes.ts';

test('loại nghỉ ở web khớp với máy chủ', () => {
  assert.deepEqual(LEAVE_TYPE_LABELS, LEAVE_TYPES.map((type) => type.label));
});
