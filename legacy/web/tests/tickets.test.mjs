import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canTransitionHelpdeskTicket,
  formatHelpdeskDuration,
  formatHelpdeskTimestamp,
  helpdeskExportRows,
  helpdeskMetrics,
  helpdeskMinutesBetween,
} from '../src/modules/tickets/ticketRules.ts';

test('helpdesk duration parses stored UTC values and ISO timestamps consistently', () => {
  assert.equal(helpdeskMinutesBetween('2026-10-28 09:00', '2026-10-28 09:25'), 25);
  assert.equal(helpdeskMinutesBetween('2026-10-28T02:00:00Z', '2026-10-28T03:05:00Z'), 65);
  assert.equal(helpdeskMinutesBetween('invalid', '2026-10-28T03:05:00Z'), null);
  assert.equal(formatHelpdeskTimestamp('2026-10-28 02:00'), '28/10/2026, 09:00');
  assert.equal(formatHelpdeskDuration(125), '2 giờ 5 phút');
});

test('helpdesk metrics use recorded response and resolution times only', () => {
  assert.deepEqual(helpdeskMetrics([
    { createdDate: '2026-10-28T02:00:00Z', acceptedAt: '2026-10-28T02:10:00Z', resolvedAt: '2026-10-28T02:40:00Z', priority: 'Khẩn cấp', status: 'Đã hoàn thành' },
    { createdDate: '2026-10-28T03:00:00Z', status: 'Mới tạo', priority: 'Cao' },
  ]), {
    total: 2,
    openCount: 1,
    completedCount: 1,
    urgentCount: 1,
    averageResponseMinutes: 10,
    averageResolutionMinutes: 40,
  });
  assert.equal(helpdeskMetrics([]).averageResponseMinutes, null);
});

test('ticket UI only offers valid forward lifecycle transitions', () => {
  assert.equal(canTransitionHelpdeskTicket('Mới tạo', 'Đang xử lý'), true);
  assert.equal(canTransitionHelpdeskTicket('Mới tạo', 'Đã hoàn thành'), true);
  assert.equal(canTransitionHelpdeskTicket('Đang xử lý', 'Đã hoàn thành'), true);
  assert.equal(canTransitionHelpdeskTicket('Đã hoàn thành', 'Đang xử lý'), false);
  assert.equal(canTransitionHelpdeskTicket('Đang xử lý', 'Mới tạo'), false);
});

test('helpdesk export contains the supplied records and leaves unmeasured durations blank', () => {
  const rows = helpdeskExportRows([{
    code: 'TK-2', createdDate: '2026-10-28T02:00:00Z', title: 'Không vào được mạng', description: 'Văn phòng tầng 2',
    requester: 'Người gửi', department: 'Kỹ thuật', priority: 'Cao', status: 'Mới tạo',
  }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'TK-2');
  assert.equal(rows[1][3], 'Văn phòng tầng 2');
  assert.equal(rows[1][8], 'Chưa tiếp nhận');
  assert.equal(rows[1][10], '');
  assert.equal(rows[1][11], '');
});
