export function attendanceDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dateRangeDays(from: string, to: string): number {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('Vui lòng chọn ngày hợp lệ.');
    const timestamp = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) throw new Error('Ngày không tồn tại.');
    return timestamp;
  };
  const days = (parse(to) - parse(from)) / 86400000 + 1;
  if (days < 1) throw new Error('Ngày kết thúc phải từ ngày bắt đầu trở đi.');
  return days;
}

export function attendanceNumber(value: unknown, label: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const result = Number(value);
  if (value == null || String(value).trim() === '' || !Number.isFinite(result) || result < min || result > max) {
    throw new Error(`${label} phải từ ${min} đến ${max === Number.MAX_SAFE_INTEGER ? 'giá trị hợp lệ' : max}.`);
  }
  return result;
}

export function leaveDays(value: unknown, from: string, to: string): number {
  const days = attendanceNumber(value, 'Số ngày nghỉ', 0.5, dateRangeDays(from, to));
  if (!Number.isInteger(days * 2)) throw new Error('Số ngày nghỉ phải là bội số của nửa ngày.');
  return days;
}

export function timeRangeDetails(value: string): { startTime: string; endTime: string; hours: number } {
  const match = /^(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})(?:\s*\([^)]*\))?$/.exec((value || '').trim());
  if (!match) throw new Error('Khung giờ phải theo định dạng HH:mm - HH:mm.');
  const minutes = (time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    if (hour > 23 || minute > 59) throw new Error('Giờ phải trong khoảng 00:00 đến 23:59.');
    return hour * 60 + minute;
  };
  const start = minutes(match[1]);
  let end = minutes(match[2]);
  if (end === start) throw new Error('Giờ bắt đầu và kết thúc phải khác nhau.');
  if (end < start) end += 1440;
  return { startTime: match[1], endTime: match[2], hours: (end - start) / 60 };
}

export function leaveBalance(standardQuota: number, seniorityQuota: number, carriedOver: number, usedLeaves: number) {
  for (const value of [standardQuota, seniorityQuota, carriedOver]) attendanceNumber(value, 'Hạn mức phép', 0);
  const totalEntitled = standardQuota + seniorityQuota + carriedOver;
  attendanceNumber(totalEntitled, 'Tổng quỹ phép', 0);
  attendanceNumber(usedLeaves, 'Phép đã sử dụng', 0, totalEntitled);
  const remainingLeaves = totalEntitled - usedLeaves;
  return {
    totalEntitled, usedLeaves, remainingLeaves,
    leaveUsagePct: totalEntitled === 0 ? 0 : Math.round(usedLeaves / totalEntitled * 100),
    status: remainingLeaves === 0 ? 'Đã hết phép' as const : remainingLeaves <= 3 ? 'Sắp hết phép' as const : 'Còn nhiều phép' as const,
  };
}

export function employeeAttendanceFields(employees: Array<{ key: string; code: string; name: string; department: string; position: string }>, key: string) {
  const employee = employees.find((item) => item.key === key);
  if (!employee) throw new Error('Vui lòng chọn nhân viên từ danh sách nhân sự hiện có.');
  return { employeeId: employee.key, employeeName: employee.name, empCode: employee.code, employeeCode: employee.code, department: employee.department, position: employee.position };
}

export function monthDayCount(month: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw new Error('Tháng phải có định dạng YYYY-MM.');
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number, 0)).getUTCDate();
}

export function attendanceDaySummary(employee: { key: string; code: string }, date: string, timesheets: Record<string, any>[], rawLogs: Record<string, any>[], leaves: Record<string, any>[], overtime: Record<string, any>[]) {
  const belongs = (item: Record<string, any>) => item.employeeId === employee.key || item.ownerId === employee.key || item.empCode === employee.code || item.employeeCode === employee.code;
  const leave = leaves.find((item) => belongs(item) && item.status === 'Đã duyệt' && (item.startDate || item.fromDate) <= date && (item.endDate || item.toDate) >= date);
  const daily = timesheets.find((item) => belongs(item) && item.date === date);
  const logs = rawLogs.filter((item) => belongs(item) && String(item.timestamp).slice(0, 10) === date && item.status === 'Dữ liệu hợp lệ');
  const otHours = overtime.filter((item) => belongs(item) && ['Đã duyệt OT', 'Đã duyệt'].includes(item.status) && (item.otDate || item.date) === date).reduce((sum, item) => sum + (Number(item.totalHours ?? item.hours) || 0), 0);
  let hours = 0;
  if (/^\d{2}:\d{2}/.test(daily?.checkIn || '') && /^\d{2}:\d{2}/.test(daily?.checkOut || '') && daily.checkIn.slice(0, 5) !== daily.checkOut.slice(0, 5)) {
    try { hours = timeRangeDetails(`${daily.checkIn.slice(0, 5)} - ${daily.checkOut.slice(0, 5)}`).hours; } catch { /* Invalid historical clock data carries no duration. */ }
  }
  const recorded = hours > 0;
  if (leave) return { code: 'P', label: `${leave.leaveType || leave.type} đã duyệt`, color: '#D97706', bg: '#FEF3C7', days: recorded ? 1 : 0, hours, otHours };
  if (daily || logs.length) return { code: daily?.status?.toLowerCase().includes('muộn') ? 'M' : 'CC', label: `Có dữ liệu điểm danh${hours ? `: ${hours.toFixed(2)} giờ giữa vào/ra` : ' chưa đủ cặp vào/ra'}${otHours ? `; OT duyệt ${otHours} giờ` : ''}`, color: '#16A34A', bg: '#DCFCE7', days: recorded ? 1 : 0, hours, otHours };
  if (otHours) return { code: 'OT', label: `OT đã duyệt ${otHours} giờ; chưa có điểm danh`, color: '#2563EB', bg: '#EFF6FF', days: 0, hours: 0, otHours };
  return { code: '—', label: 'Chưa có dữ liệu', color: '#64748B', bg: '#F8FAFC', days: 0, hours: 0, otHours: 0 };
}
