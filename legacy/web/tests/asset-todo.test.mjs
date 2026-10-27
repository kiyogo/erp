import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveTaskSlaStatus, todoChecklistComplete, validateTodoCompletion } from '../src/modules/assets/assetTodoRules.ts';

test('task SLA is derived from the deadline and current business day', () => {
  assert.equal(deriveTaskSlaStatus('2026-10-26', '2026-10-27'), 'Trễ hạn SLA');
  assert.equal(deriveTaskSlaStatus('2026-10-28', '2026-10-27'), 'Sắp chạm hạn SLA');
  assert.equal(deriveTaskSlaStatus('2026-11-01', '2026-10-27'), 'Trong hạn SLA');
});

test('task completion requires a nonempty, fully completed checklist', () => {
  assert.equal(todoChecklistComplete([]), false);
  assert.equal(todoChecklistComplete([{ item: 'One', done: true }, { item: 'Two', done: false }]), false);
  assert.equal(todoChecklistComplete([{ item: 'One', done: true }]), true);
});

test('task completion requires approval, recorded hours and an actual resolution', () => {
  const checklist = [{ item: 'Check device', done: true }];
  assert.throws(() => validateTodoCompletion({ status: 'Đang thực hiện', checklist, actualHours: 1, resolution: 'Done' }), /gửi duyệt/);
  assert.throws(() => validateTodoCompletion({ status: 'Chờ phê duyệt cấp trên', checklist: [{ ...checklist[0], done: false }], actualHours: 1, resolution: 'Done' }), /checklist/);
  assert.throws(() => validateTodoCompletion({ status: 'Chờ phê duyệt cấp trên', checklist, actualHours: 0, resolution: 'Done' }), /Thời gian thực tế/);
  assert.throws(() => validateTodoCompletion({ status: 'Chờ phê duyệt cấp trên', checklist, actualHours: 1, resolution: ' ' }), /kết quả nghiệm thu/);
  assert.deepEqual(validateTodoCompletion({ status: 'Chờ phê duyệt cấp trên', checklist, actualHours: '2.5', resolution: '  Đã kiểm tra và lưu biên bản.  ' }), {
    actualHours: 2.5,
    resolution: 'Đã kiểm tra và lưu biên bản.',
  });
});
