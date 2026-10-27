import test from 'node:test';
import assert from 'node:assert/strict';
import { getMeetingRoomMetrics, meetingTimesOverlap, parseMeetingTimeRange } from '../src/modules/meetingRooms/meetingRoomRules.ts';

test('meeting room time ranges identify partial overlaps and touching boundaries', () => {
  assert.deepEqual(parseMeetingTimeRange('09:30 - 10:30'), { start: 570, end: 630 });
  assert.equal(meetingTimesOverlap('09:00 - 10:00', '09:30 - 10:30'), true);
  assert.equal(meetingTimesOverlap('09:00 - 10:00', '10:00 - 11:00'), false);
  assert.equal(meetingTimesOverlap('10:00 - 09:00', '09:30 - 10:30'), false);
});

test('meeting room dashboard metrics count confirmed bookings for today and derive utilization', () => {
  const metrics = getMeetingRoomMetrics(
    [{ status: 'Trống' }, { status: 'Bảo trì' }],
    [
      { date: '2026-10-27', status: 'Đã xác nhận', timeSlot: '09:00 - 10:00' },
      { date: '2026-10-27', status: 'Đã hủy', timeSlot: '10:00 - 12:00' },
      { date: '2026-10-28', status: 'Đã xác nhận', timeSlot: '10:00 - 11:00' },
    ],
    '2026-10-27',
  );
  assert.deepEqual(metrics, { todayBookings: 1, unavailableRooms: 1, bookedHours: 1, utilizationPercent: 6 });
});
