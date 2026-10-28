import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applicationCategoryForPath, filterApplicationUsage } from './usageRules.ts';

test('application usage categories group old admin and employee routes without collecting record identifiers', () => {
  assert.equal(applicationCategoryForPath('/admin/finance/cash/flow'), 'finance');
  assert.equal(applicationCategoryForPath('/admin/finance/sales/orders/secret-id'), 'business');
  assert.equal(applicationCategoryForPath('/admin/crm/customers/contact-id'), 'business');
  assert.equal(applicationCategoryForPath('/admin/attendance/timesheet'), 'hr');
  assert.equal(applicationCategoryForPath('/employee/home'), 'hr');
  assert.equal(applicationCategoryForPath('/admin/system/usage'), 'digital_office');
  assert.equal(applicationCategoryForPath('/admin/dashboard'), null);
  assert.equal(applicationCategoryForPath('/public/share/secret-id'), null);
});

test('application usage filtering searches real account fields and separates logins from app actions', () => {
  const rows = [
    { name: 'Nguyễn An', email: 'an@example.test', department: 'Kế toán', loginCount: 1, operationCount: 0 },
    { name: 'Trần Bình', email: 'binh@example.test', department: 'Nhân sự', loginCount: 0, operationCount: 3 },
  ];
  assert.deepEqual(filterApplicationUsage(rows, 'kế toán', 'all'), [rows[0]]);
  assert.deepEqual(filterApplicationUsage(rows, '', 'logged_in'), [rows[0]]);
  assert.deepEqual(filterApplicationUsage(rows, '', 'operated'), [rows[1]]);
  assert.deepEqual(filterApplicationUsage(rows, 'missing', 'all'), []);
});
