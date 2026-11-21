import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAccountingScope, isInternalLink, retainedThrough, trashPurgeProblem } from '../retentionRules.mjs';

test('phạm vi kế toán và lương phải lưu 10 năm trước khi xóa vĩnh viễn', () => {
  assert.equal(isAccountingScope('finance_general_ledger'), true);
  assert.equal(isAccountingScope('payroll'), true);
  assert.equal(isAccountingScope('plan_items'), false);
  assert.equal(retainedThrough('2020-05-01T00:00:00Z'), '2030-12-31');
  assert.match(trashPurgeProblem({ scope: 'finance_tax', created_at: '2020-05-01T00:00:00Z' }, '2026-11-21'), /Điều 41 Luật Kế toán/);
  assert.equal(trashPurgeProblem({ scope: 'finance_tax', created_at: '2015-05-01T00:00:00Z' }, '2026-11-21'), '');
  assert.match(trashPurgeProblem({ scope: 'finance_tax', created_at: '2016-05-01T00:00:00Z' }, '2026-12-31'), /đến hết 2026-12-31/);
  assert.equal(trashPurgeProblem({ scope: 'finance_tax', created_at: '2016-05-01T00:00:00Z' }, '2027-01-01'), '');
  assert.equal(trashPurgeProblem({ scope: 'doc_notes', created_at: '2026-01-01T00:00:00Z' }, '2026-11-21'), '');
});

test('đường dẫn thông báo chỉ nhận đường dẫn nội bộ', () => {
  assert.equal(isInternalLink(''), true);
  assert.equal(isInternalLink('/admin/documents/notes'), true);
  assert.equal(isInternalLink('https://evil.example'), false);
  assert.equal(isInternalLink('//evil.example'), false);
  assert.equal(isInternalLink('/\\evil.example'), false);
  assert.equal(isInternalLink('javascript:alert(1)'), false);
});
