import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatNoteDate,
  formatNoteTimestamp,
  noteCompletionRate,
  noteExportRows,
  noteStatus,
  parseNoteActionItems,
  vietnamBusinessDate,
} from '../src/modules/documents/notesRules.ts';

test('directive progress ignores malformed legacy items and derives complete status from real actions', () => {
  const actions = [{ id: 1, text: 'Việc một', done: true }, null, { id: 2, text: 'Việc hai', done: false }];
  assert.equal(noteCompletionRate(actions), 50);
  assert.equal(noteStatus({ actionItems: actions, deadline: '2026-10-29', status: 'Đang thực hiện' }, '2026-10-28'), 'Đang thực hiện');
  assert.equal(noteStatus({ actionItems: [{ id: 1, text: 'Xong', done: true }], deadline: '2026-10-01', status: 'Quá hạn' }, '2026-10-28'), 'Đã hoàn thành');
});

test('directive status uses the Vietnam business date and does not mark incomplete items complete', () => {
  assert.equal(vietnamBusinessDate(new Date('2026-10-28T17:30:00.000Z')), '2026-10-29');
  assert.equal(noteStatus({ actionItems: [{ id: 1, text: 'Việc', done: false }], deadline: '2026-10-27', status: 'Đang thực hiện' }, '2026-10-28'), 'Quá hạn');
  assert.equal(noteStatus({ actionItems: [], deadline: '2026-10-27', status: 'Đang thực hiện' }, '2026-10-28'), 'Quá hạn');
  assert.equal(formatNoteDate('2026-10-28T18:00:00.000Z'), '29/10/2026');
  assert.equal(formatNoteTimestamp('2026-10-28T02:00:00.000Z'), '28/10/2026 09:00');
});

test('directive action parsing requires actual tasks, removes blank lines and enforces the server limit', () => {
  assert.throws(() => parseNoteActionItems(' \n\n '), /ít nhất một đầu việc/);
  assert.deepEqual(parseNoteActionItems('  Việc một \n\nViệc hai'), [
    { id: 1, text: 'Việc một', done: false },
    { id: 2, text: 'Việc hai', done: false },
  ]);
  assert.throws(() => parseNoteActionItems(Array.from({ length: 51 }, (_, index) => `Việc ${index + 1}`).join('\n')), /tối đa 50/);
});

test('directive XLSX rows reflect only the supplied records and actual status/progress/reminders', () => {
  const rows = noteExportRows([{
    key: 'CD-1', noteCode: 'CD-1', title: 'Kiểm tra điện', category: 'Ý kiến chỉ đạo BGĐ', priority: 'Khẩn cấp P1',
    author: 'Người chỉ đạo', authorRole: 'Giám đốc', assignedToDept: 'Kỹ thuật', deadline: '2026-10-30',
    createdDate: '2026-10-28T00:00:00.000Z', isPinned: true, content: 'Kiểm tra tủ điện',
    actionItems: [{ id: 1, text: 'Đo tải', done: true }, { id: 2, text: 'Lập biên bản', done: false }],
    reminderHistory: [{ actor: 'Admin', actorId: 'admin-1', at: '2026-10-28T01:00:00Z', recipientCount: 3 }], status: 'Đang thực hiện',
  }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'CD-1');
  assert.equal(rows[1][9], 'Đang thực hiện');
  assert.equal(rows[1][10], 50);
  assert.equal(rows[1][11], 'Có');
  assert.equal(rows[1][13], '[x] Đo tải\n[ ] Lập biên bản');
  assert.equal(rows[1][14], 1);
  assert.doesNotThrow(() => noteExportRows([{ ...{
    noteCode: 'CD-legacy', title: 'Dữ liệu cũ', category: '', priority: '', author: '', authorRole: '', assignedToDept: '',
    createdDate: '', deadline: '', content: '', status: '', isPinned: false,
  }, actionItems: [null], reminderHistory: [] }]));
});
