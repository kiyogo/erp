export function parseMeetingTimeRange(value: string): { start: number; end: number } | null {
  const match = /^(?:([01]\d|2[0-3]):([0-5]\d))\s*-\s*(?:([01]\d|2[0-3]):([0-5]\d))$/.exec(String(value || '').trim());
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  return end > start ? { start, end } : null;
}

export function meetingTimesOverlap(left: string, right: string): boolean {
  const first = parseMeetingTimeRange(left);
  const second = parseMeetingTimeRange(right);
  return Boolean(first && second && first.start < second.end && second.start < first.end);
}

export function getMeetingRoomMetrics(rooms: Array<{ status?: string }>, bookings: Array<{ date?: string; status?: string; timeSlot?: string }>, today: string) {
  const todayBookings = bookings.filter((booking) => booking.date === today && booking.status === 'Đã xác nhận');
  const minutesBooked = todayBookings.reduce((total, booking) => {
    const range = parseMeetingTimeRange(booking.timeSlot || '');
    return total + (range ? range.end - range.start : 0);
  }, 0);
  const operatingMinutes = rooms.length * 8 * 60;
  return {
    todayBookings: todayBookings.length,
    unavailableRooms: rooms.filter((room) => ['Bảo trì', 'Tạm ngưng'].includes(room.status || '')).length,
    bookedHours: Math.round(minutesBooked / 60 * 10) / 10,
    utilizationPercent: operatingMinutes ? Math.min(100, Math.round(minutesBooked / operatingMinutes * 100)) : 0,
  };
}
