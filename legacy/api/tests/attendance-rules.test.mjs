import assert from 'node:assert/strict';
import { test } from 'node:test';
import { annualLeaveEntitlement, carryOverDays, isMinor, leaveDaysProblem, nightHoursOfShift, normalizeLeaveType, overtimeMinMultiplier, restBetweenShiftsHours, shiftLegalProblems } from '../attendanceRules.mjs';

test('loại nghỉ nhận tên cũ và chặn số ngày vượt luật', () => {
  assert.equal(normalizeLeaveType('Nghỉ ốm'), 'Nghỉ ốm BHXH');
  assert.equal(normalizeLeaveType('Nghỉ việc riêng không lương'), 'Nghỉ không lương');
  assert.equal(normalizeLeaveType('Du lịch'), '');
  assert.match(leaveDaysProblem('Nghỉ kết hôn', 4), /tối đa 3 ngày/);
  assert.equal(leaveDaysProblem('Nghỉ kết hôn', 3), '');
  assert.match(leaveDaysProblem('Nghỉ khi con kết hôn', 2), /tối đa 1 ngày/);
  assert.equal(leaveDaysProblem('Nghỉ không lương', 30), '');
});

test('phép năm: 12 ngày, thêm 1 ngày mỗi 5 năm, vào giữa năm tính theo tháng', () => {
  assert.deepEqual(annualLeaveEntitlement({ baseDays: 12, joinDate: '2020-03-01', year: 2026 }), { baseDays: 12, seniorityDays: 1, monthsWorked: 12, standardQuota: 12, seniorityQuota: 1, entitled: 13 });
  assert.equal(annualLeaveEntitlement({ baseDays: 12, joinDate: '2022-01-10', year: 2026 }).seniorityDays, 0);
  assert.equal(annualLeaveEntitlement({ baseDays: 14, joinDate: '', year: 2026 }).entitled, 14);
  // vào ngày 01/07/2026: làm đủ 6 tháng, 12 x 6 / 12 = 6 ngày
  const midYear = annualLeaveEntitlement({ baseDays: 12, joinDate: '2026-07-01', year: 2026 });
  assert.equal(midYear.monthsWorked, 6);
  assert.equal(midYear.entitled, 6);
  // vào ngày 28/07/2026: tháng 7 chỉ có 3 ngày làm việc nên không tính tròn tháng
  assert.equal(annualLeaveEntitlement({ baseDays: 12, joinDate: '2026-07-28', year: 2026 }).monthsWorked, 5);
  assert.equal(annualLeaveEntitlement({ baseDays: 12, joinDate: '2027-01-05', year: 2026 }).entitled, 0);
});

test('ca làm việc: giờ làm, nghỉ giữa giờ và phụ cấp ban đêm theo Điều 105, 109, 98', () => {
  assert.equal(nightHoursOfShift('22:00', '06:00'), 8);
  assert.equal(nightHoursOfShift('08:00', '17:00'), 0);
  assert.equal(nightHoursOfShift('18:00', '23:00'), 1);
  assert.deepEqual(shiftLegalProblems({ startTime: '08:00', endTime: '17:00', workingHours: 8, breakMinutes: 60 }).problems, []);
  assert.match(shiftLegalProblems({ startTime: '08:00', endTime: '16:00', workingHours: 8, breakMinutes: 0 }).problems[0], /30 phút/);
  assert.match(shiftLegalProblems({ startTime: '22:00', endTime: '07:00', workingHours: 8, breakMinutes: 30, nightAllowancePct: 30 }).problems[0], /45 phút/);
  assert.match(shiftLegalProblems({ startTime: '22:00', endTime: '07:00', workingHours: 8, breakMinutes: 60, nightAllowancePct: 20 }).problems[0], /30%/);
  assert.match(shiftLegalProblems({ startTime: '06:00', endTime: '19:00', workingHours: 11, breakMinutes: 60 }).problems[0], /10 giờ/);
  assert.deepEqual(shiftLegalProblems({ startTime: '08:00', endTime: '12:00', workingHours: 4 }).problems, []);
});

test('nghỉ giữa hai ca liền nhau ít nhất 12 giờ', () => {
  // ca đêm 22:00 đến 06:00 sáng hôm sau rồi ca ngày 08:00 ngày kế tiếp: chỉ nghỉ 2 giờ
  assert.equal(restBetweenShiftsHours({ startTime: '22:00', endTime: '06:00' }, { startTime: '08:00', endTime: '17:00' }), 2);
  // ca ngày 08:00 đến 17:00 rồi ca ngày hôm sau 08:00: nghỉ 15 giờ
  assert.equal(restBetweenShiftsHours({ startTime: '08:00', endTime: '17:00' }, { startTime: '08:00', endTime: '17:00' }), 15);
  // ca ngày 08:00 đến 20:00 rồi ca sáng 06:00 hôm sau: nghỉ 10 giờ
  assert.equal(restBetweenShiftsHours({ startTime: '08:00', endTime: '20:00' }, { startTime: '06:00', endTime: '14:00' }), 10);
});

test('làm thêm: hệ số tối thiểu theo loại ngày và người chưa đủ 18 tuổi', () => {
  assert.equal(overtimeMinMultiplier('2026-11-17'), 1.5);
  assert.equal(overtimeMinMultiplier('2026-11-22'), 2);
  assert.equal(overtimeMinMultiplier('2026-09-02'), 3);
  assert.equal(overtimeMinMultiplier('2026-04-30'), 3);
  assert.equal(isMinor('2009-12-01', '2026-11-21'), true);
  assert.equal(isMinor('2008-11-21', '2026-11-21'), false);
  assert.equal(isMinor('', '2026-11-21'), false);
});

test('unused annual leave carries over within the three-year consolidation limit and the company cap', () => {
  assert.deepEqual(carryOverDays({ remaining: 5, quota: 12 }), { days: 5, legalCap: 12, limitedBy: null });
  // Còn 20 ngày nhưng chỉ có 12 ngày phép của năm và 3 ngày gốc năm liền trước được chuyển: phần gốc từ hai năm trước bị loại.
  assert.deepEqual(carryOverDays({ remaining: 20, quota: 12, previousCarry: 3 }), { days: 15, legalCap: 15, limitedBy: 'law' });
  assert.deepEqual(carryOverDays({ remaining: 7.5, quota: 12, maxDays: 5 }), { days: 5, legalCap: 12, limitedBy: 'policy' });
  assert.equal(carryOverDays({ remaining: 2.7, quota: 12 }).days, 2.5);
  assert.equal(carryOverDays({ remaining: -1, quota: 12 }).days, 0);
});
