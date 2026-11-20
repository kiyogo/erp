import assert from 'node:assert/strict';
import { test } from 'node:test';
import { breachDeadline, breachNotificationState, normalizeBreach } from '../incidentRules.mjs';

const base = { discoveredAt: '2026-11-01T01:00:00.000Z', dataSubjectsCount: 120, dataCategories: 'Họ tên, số điện thoại', sensitive: false };
const hours = (n) => Date.parse(base.discoveredAt) + n * 3_600_000;

test('hạn thông báo là 72 giờ kể từ khi phát hiện', () => {
  assert.equal(breachDeadline(base.discoveredAt), '2026-11-04T01:00:00.000Z');
});

test('trạng thái thông báo: còn hạn, quá hạn, đúng hạn, trễ', () => {
  assert.equal(breachNotificationState(base, hours(71)), 'pending');
  assert.equal(breachNotificationState(base, hours(73)), 'overdue');
  assert.equal(breachNotificationState({ ...base, authorityNotifiedAt: '2026-11-03T23:59:00.000Z' }, hours(200)), 'on_time');
  assert.equal(breachNotificationState({ ...base, authorityNotifiedAt: '2026-11-04T01:00:00.000Z' }, hours(200)), 'on_time', 'đúng 72 giờ vẫn đúng hạn');
  assert.equal(breachNotificationState({ ...base, authorityNotifiedAt: '2026-11-04T01:01:00.000Z' }, hours(200)), 'late');
});

test('chuẩn hóa vi phạm: tính hạn và trạng thái, kiểm tra thời điểm và dữ liệu', () => {
  const ok = normalizeBreach({ ...base, authorityNotifiedAt: '2026-11-02T01:00:00Z', sensitive: true }, hours(30));
  assert.equal(ok.notificationDeadline, '2026-11-04T01:00:00.000Z');
  assert.equal(ok.notificationState, 'on_time');
  assert.equal(ok.sensitive, true);
  assert.equal(normalizeBreach(base, hours(80)).notificationState, 'overdue');
  assert.throws(() => normalizeBreach({ ...base, discoveredAt: 'x' }, hours(1)), /phát hiện/);
  assert.throws(() => normalizeBreach(base, hours(-2)), /tương lai/);
  assert.throws(() => normalizeBreach({ ...base, dataSubjectsCount: -1 }, hours(1)), /không âm/);
  assert.throws(() => normalizeBreach({ ...base, dataSubjectsCount: 1.5 }, hours(1)), /không âm/);
  assert.throws(() => normalizeBreach({ ...base, dataCategories: ' ' }, hours(1)), /loại dữ liệu/i);
  assert.throws(() => normalizeBreach({ ...base, authorityNotifiedAt: '2026-10-31T00:00:00Z' }, hours(10)), /trước thời điểm phát hiện/);
  assert.throws(() => normalizeBreach({ ...base, subjectsNotifiedAt: '2026-12-31T00:00:00Z' }, hours(10)), /tương lai/);
});
