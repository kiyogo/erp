import assert from 'node:assert/strict';
import test from 'node:test';
import { breachNotificationState as apiState, breachDeadline } from '../../api/incidentRules.mjs';
import { breachDeadlineMs, breachHoursLeft, breachNotificationState as webState } from '../src/modules/tickets/incidentRules.ts';

const base = { discoveredAt: '2026-11-01T01:00:00.000Z' };
const hours = (n) => Date.parse(base.discoveredAt) + n * 3_600_000;

test('hạn và trạng thái thông báo vi phạm dữ liệu ở web khớp với máy chủ', () => {
  assert.equal(new Date(breachDeadlineMs(base.discoveredAt)).toISOString(), breachDeadline(base.discoveredAt));
  for (const authorityNotifiedAt of [undefined, '2026-11-02T00:00:00.000Z', '2026-11-04T01:00:00.000Z', '2026-11-04T01:00:01.000Z']) {
    for (const offset of [1, 71, 72, 73, 200]) {
      const breach = { ...base, authorityNotifiedAt };
      assert.equal(webState(breach, hours(offset)), apiState(breach, hours(offset)), `${authorityNotifiedAt} ${offset}`);
    }
  }
  assert.equal(breachHoursLeft(base, hours(48)), 24);
  assert.equal(breachHoursLeft(base, hours(80)), -8);
});
