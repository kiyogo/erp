import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { auditActionLabel, auditScopeLabel } from '../auditLabels.mjs';

const source = readFileSync(new URL('../index.mjs', import.meta.url), 'utf8');
// Mã hành động ghi bằng chuỗi cố định, kể cả hai nhánh của biểu thức điều kiện (a ? 'x' : 'y'); bỏ chuỗi đứng sau === (giá trị so sánh).
const literalActions = new Set();
for (const match of source.matchAll(/recordAuditEvent\([^,]+,\s*([^,]+),/g)) {
  for (const code of match[1].matchAll(/(?<!===\s*)'([a-z0-9_]+)'/g)) literalActions.add(code[1]);
}

test('every literal audit action written by the server has a Vietnamese label', () => {
  assert.ok(literalActions.size > 50);
  const missing = [...literalActions].filter((code) => auditActionLabel(code) === code);
  assert.deepEqual(missing, []);
});

test('dynamic action names and scopes map to Vietnamese, unknown codes stay readable', () => {
  for (const code of ['payment_approve', 'payment_execute', 'asset_repair_complete', 'receive_asset_transfer']) assert.notEqual(auditActionLabel(code), code);
  assert.equal(auditActionLabel('ekyc_verified'), 'Xác minh danh tính eKYC');
  assert.equal(auditScopeLabel('employee_profiles'), 'Hồ sơ nhân viên');
  assert.equal(auditScopeLabel('finance_something_new'), 'Tài chính (finance_something_new)');
  assert.equal(auditScopeLabel('dropdown_banks'), 'Danh mục chọn (dropdown_banks)');
  assert.equal(auditScopeLabel('mystery'), 'mystery');
  assert.equal(auditActionLabel('Cập nhật hồ sơ'), 'Cập nhật hồ sơ');
});
