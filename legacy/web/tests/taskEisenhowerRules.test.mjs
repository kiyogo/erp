import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEisenhowerMatrix, classifyEisenhowerTask, vietnamCalendarDate } from '../src/modules/plans/taskEisenhowerRules.ts';

const today = '2026-04-26';

test('Eisenhower matrix groups unfinished tasks into all four quadrants', () => {
  const tasks = [
    { key: 'now', priority: 'Khẩn cấp', dueDate: '2026-05-10', status: 'Đang thực hiện' },
    { key: 'schedule', priority: 'Cao', dueDate: '2026-05-10', status: 'Chưa bắt đầu' },
    { key: 'delegate', priority: 'Trung bình', dueDate: today, status: 'Đang thực hiện' },
    { key: 'low', priority: 'Thấp', dueDate: '2026-05-10', status: 'Chưa bắt đầu' },
    { key: 'done', priority: 'Khẩn cấp', dueDate: today, status: 'Hoàn thành' },
  ];

  const matrix = buildEisenhowerMatrix(tasks, today);
  assert.deepEqual(matrix.map(item => item.tasks.map(task => task.key)), [
    ['now'], ['schedule'], ['delegate'], ['low'],
  ]);
});

test('due today and overdue are urgent; future dates are not urgent unless priority is Khẩn cấp', () => {
  assert.equal(classifyEisenhowerTask({ priority: 'Cao', dueDate: today, status: 'Đang thực hiện' }, today), 'do-now');
  assert.equal(classifyEisenhowerTask({ priority: 'Cao', dueDate: '2026-04-25', status: 'Đang thực hiện' }, today), 'do-now');
  assert.equal(classifyEisenhowerTask({ priority: 'Cao', dueDate: '2026-04-27', status: 'Đang thực hiện' }, today), 'schedule');
  assert.equal(classifyEisenhowerTask({ priority: 'Thấp', dueDate: '2026-04-25', status: 'Đang thực hiện' }, today), 'delegate');
});

test('invalid or missing dates do not manufacture urgency and completed tasks are omitted', () => {
  assert.equal(classifyEisenhowerTask({ priority: 'Trung bình', dueDate: '2026-02-30', status: 'Đang thực hiện' }, today), 'low-priority');
  assert.equal(classifyEisenhowerTask({ priority: 'Khẩn cấp', dueDate: '', status: 'Đang thực hiện' }, today), 'do-now');
  assert.equal(classifyEisenhowerTask({ priority: 'Cao', dueDate: today, status: 'Hoàn thành' }, today), null);
});

test('Vietnam calendar date changes at midnight in Ho Chi Minh City', () => {
  assert.equal(vietnamCalendarDate(new Date('2026-04-26T16:59:59.000Z')), '2026-04-26');
  assert.equal(vietnamCalendarDate(new Date('2026-04-26T17:00:00.000Z')), '2026-04-27');
});
