import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addMonthsIso, assessDiscipline } from '../disciplineRules.mjs';

const today = '2026-11-21';
const base = {
  form: 'warning', violationKind: 'general', violationDate: '2026-10-01', discoveredDate: '2026-10-02', noticeDate: '2026-10-05', hearingDate: '2026-10-12', decisionDate: '2026-10-13',
  attendance: 'attended', unionParticipated: true, minutesRecorded: true,
};
const assess = (patch = {}, extra = {}) => assessDiscipline({ ...base, ...patch }, { today, ...extra });

test('hồ sơ khiển trách đủ trình tự được chấp nhận và máy chủ tính hạn', () => {
  const { discipline, assessment } = assess();
  assert.equal(discipline.form, 'warning');
  assert.equal(assessment.limitationDeadline, '2027-04-01');
  assert.equal(assessment.earliestHearingDate, '2026-10-12');
});

test('thời hiệu 6 tháng, 12 tháng với hành vi liên quan tài chính', () => {
  assert.equal(addMonthsIso('2026-08-31', 6), '2027-02-28');
  assert.throws(() => assess({ violationDate: '2026-04-01', discoveredDate: '2026-04-02', noticeDate: '2026-10-05' }), /quá thời hiệu.*6 tháng/);
  assert.equal(assess({ violationDate: '2026-04-01', discoveredDate: '2026-04-02', noticeDate: '2026-10-05', violationKind: 'financial' }).assessment.limitationMonths, 12);
  assert.throws(() => assess({ violationDate: '2025-10-01', discoveredDate: '2025-10-02', violationKind: 'financial' }), /quá thời hiệu.*12 tháng/);
});

test('trình tự: báo trước 5 ngày làm việc, biên bản, đại diện tổ chức người lao động, người lao động có mặt', () => {
  assert.throws(() => assess({ hearingDate: '2026-10-09' }), /5 ngày làm việc/);
  assert.throws(() => assess({ decisionDate: '2026-10-10' }), /sau cuộc họp/);
  assert.throws(() => assess({ minutesRecorded: false }), /biên bản/);
  assert.throws(() => assess({ unionParticipated: false }), /tổ chức đại diện/);
  assert.equal(assess({ unionParticipated: false, noUnionOrganization: true }).discipline.noUnionOrganization, true);
  assert.throws(() => assess({ attendance: '' }), /có mặt/);
  assert.equal(assess({ attendance: 'refused' }).discipline.attendance, 'refused');
  assert.throws(() => assess({ decisionDate: '2027-01-01' }), /tương lai/);
});

test('mỗi hình thức có điều kiện riêng', () => {
  assert.throws(() => assess({ form: 'delay_raise' }), /tối đa 6 tháng/);
  assert.throws(() => assess({ form: 'delay_raise', delayMonths: 7 }), /tối đa 6 tháng/);
  assert.equal(assess({ form: 'delay_raise', delayMonths: 3 }).discipline.delayMonths, 3);
  assert.throws(() => assess({ form: 'demotion' }), /chức vụ quản lý/);
  assert.equal(assess({ form: 'demotion', managerialPosition: true }).discipline.managerialPosition, true);
  assert.throws(() => assess({ form: 'dismissal' }), /Điều 125/);
  assert.throws(() => assess({ form: 'dismissal', dismissalGround: 'other' }), /Điều 125/);
  assert.equal(assess({ form: 'dismissal', dismissalGround: 'absence' }).discipline.dismissalGround, 'absence');
  assert.throws(() => assess({ form: 'fine' }), /hình thức kỷ luật/);
});

test('không xử lý kỷ luật người đang trong thời gian được bảo vệ', () => {
  assert.throws(() => assess({ protectedStatus: 'pregnant_or_maternity' }), /Điều 122 khoản 4/);
  assert.throws(() => assess({}, { leaves: [{ leaveType: 'Nghỉ ốm BHXH', status: 'Đã duyệt', startDate: '2026-10-10', endDate: '2026-10-20' }] }), /đang nghỉ/);
  assert.equal(assess({}, { leaves: [{ leaveType: 'Nghỉ ốm BHXH', status: 'Chờ duyệt', startDate: '2026-10-10', endDate: '2026-10-20' }] }).discipline.form, 'warning');
  assert.equal(assess({}, { leaves: [{ leaveType: 'Nghỉ phép năm', status: 'Đã duyệt', startDate: '2026-10-10', endDate: '2026-10-20' }] }).discipline.form, 'warning');
});
