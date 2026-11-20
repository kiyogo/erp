import assert from 'node:assert/strict';
import { test } from 'node:test';
import { archiveDateIssues, docNumberWarnings, secretDocumentWarnings } from '../documentRules.mjs';

test('số và ký hiệu theo Nghị định 30/2020', () => {
  assert.deepEqual(docNumberWarnings('12/QĐ-ABC'), []);
  assert.deepEqual(docNumberWarnings('05/2026/QĐ-ABC'), []);
  assert.deepEqual(docNumberWarnings('31/UBND-VP'), []);
  assert.deepEqual(docNumberWarnings(''), []);
  assert.equal(docNumberWarnings('abc 12').length, 1);
  assert.equal(docNumberWarnings('QĐ-12').length, 1);
  assert.match(docNumberWarnings('12/CV-ABC', { outgoingDocType: 'Quyết định' })[0], /QĐ/);
  assert.deepEqual(docNumberWarnings('12/QĐ-ABC', { outgoingDocType: 'Quyết định' }), []);
  assert.deepEqual(docNumberWarnings('12/ABC-VP', { outgoingDocType: 'Công văn' }), []);
});

test('ngày vào sổ của văn bản đến và văn bản đi', () => {
  const today = '2026-11-21';
  assert.deepEqual(archiveDateIssues({ dispatchType: 'Văn bản đến', docDate: '2026-11-01', dateReceivedOrIssued: '2026-11-03' }, today), { errors: [], warnings: [] });
  assert.equal(archiveDateIssues({ dispatchType: 'Văn bản đến', docDate: '2026-11-05', dateReceivedOrIssued: '2026-11-03' }, today).errors.length, 1);
  assert.equal(archiveDateIssues({ dispatchType: 'Văn bản đến', docDate: '2026-11-01', dateReceivedOrIssued: '2026-11-25' }, today).errors.length, 1);
  assert.equal(archiveDateIssues({ dispatchType: 'Văn bản đi', docDate: '2026-11-01', dateReceivedOrIssued: '2026-11-03' }, today).warnings.length, 1);
  assert.equal(archiveDateIssues({ dispatchType: 'Văn bản đi', docDate: '2026-11-03', dateReceivedOrIssued: '2026-11-03' }, today).warnings.length, 0);
});

test('văn bản bí mật nhà nước có cảnh báo, văn bản thường không', () => {
  assert.equal(secretDocumentWarnings('Tối mật', true).length, 1);
  assert.match(secretDocumentWarnings('Mật', true)[0], /đang được lưu/);
  assert.doesNotMatch(secretDocumentWarnings('Mật', false)[0], /đang được lưu/);
  assert.deepEqual(secretDocumentWarnings('Nội bộ', true), []);
});
