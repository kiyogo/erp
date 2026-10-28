import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calculateIncidentDowntimeMinutes,
  formatIncidentTimestamp,
  getIncidentMetrics,
  incidentExportRows,
} from '../src/modules/tickets/incidentRules.ts';

test('incident downtime supports local legacy timestamps and ISO timestamps', () => {
  assert.equal(calculateIncidentDowntimeMinutes('2026-10-28 09:00', '2026-10-28 09:25'), 25);
  assert.equal(calculateIncidentDowntimeMinutes('2026-10-28T02:00:00.000Z', '2026-10-28T02:25:00.000Z'), 25);
  assert.equal(calculateIncidentDowntimeMinutes('2026-10-28 10:00', '2026-10-28 09:00'), 0);
  assert.equal(calculateIncidentDowntimeMinutes('invalid', '2026-10-28 09:00'), null);
});

test('incident metrics report empty values instead of invented availability', () => {
  assert.deepEqual(getIncidentMetrics([], 2026, Date.parse('2026-10-28T03:00:00Z')), {
    year: 2026,
    openCount: 0,
    totalDowntime: null,
    averageRepairMinutes: null,
    availabilityPercent: null,
    resolvedCount: 0,
    completionPercent: null,
  });
});

test('incident metrics include actual completed downtime and current active duration', () => {
  const now = Date.parse('2026-10-28T03:30:00Z');
  const metrics = getIncidentMetrics([
    { occurredAt: '2026-10-28T02:00:00Z', resolvedAt: '2026-10-28T02:10:00Z', downtimeMinutes: 999, status: 'Đã xử lý & Hoàn tất RCA' },
    { occurredAt: '2026-10-28T03:00:00Z', downtimeMinutes: 0, status: 'Đang xử lý khẩn cấp' },
    { occurredAt: '2025-10-28T03:00:00Z', downtimeMinutes: 90, status: 'Đang xử lý khẩn cấp' },
  ], 2026, now);
  assert.equal(metrics.openCount, 2);
  assert.equal(metrics.totalDowntime, 40);
  assert.equal(metrics.averageRepairMinutes, 10);
  assert.equal(metrics.resolvedCount, 1);
  assert.equal(metrics.completionPercent, 33);
  assert.ok(metrics.availabilityPercent !== null && metrics.availabilityPercent < 100);
});

test('incident export reflects only supplied records and keeps unresolved fields explicit', () => {
  const rows = incidentExportRows([{
    code: 'INC-1', occurredAt: '2026-10-28T02:00:00Z', incidentTitle: 'Lỗi đăng nhập', affectedSystem: 'Cổng đăng nhập',
    severity: 'P2 - Cao', handler: 'Nhân viên A', resolvedAt: '', downtimeMinutes: 0, rootCause: '', status: 'Đang xử lý khẩn cấp',
  }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'INC-1');
  assert.equal(rows[1][6], 'Đang xử lý');
  assert.equal(rows[1][8], '');
});

test('incident timestamps display in Vietnam time', () => {
  assert.equal(formatIncidentTimestamp('2026-10-28T02:00:00Z'), '28/10/2026, 09:00');
  assert.equal(formatIncidentTimestamp('2026-10-28 02:00'), '28/10/2026, 09:00');
});
