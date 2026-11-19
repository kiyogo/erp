import assert from 'node:assert/strict';
import test from 'node:test';
import { canOpenAdminPath, delegatedMenuItems, hasDelegatedAccess, insertDelegatedMenu, moduleForAdminPath, normalizeRolePermissions } from './delegatedAccess.ts';

const permissions = normalizeRolePermissions({
  finance: { read: true, create: true },
  hr: { read: false, create: false },
  crm: { read: true },
  bogus: 'x',
});

test('chỉ giữ module có ít nhất một quyền và ép về boolean', () => {
  assert.deepEqual(Object.keys(permissions || {}).sort(), ['crm', 'finance']);
  assert.deepEqual(permissions?.finance, { read: true, create: true, edit: false, delete: false });
  assert.equal(normalizeRolePermissions(null), null);
  assert.equal(normalizeRolePermissions([]), null);
});

test('đường dẫn quản trị được gán đúng module, trang quản trị hệ thống không thuộc module nào', () => {
  assert.equal(moduleForAdminPath('/admin/finance/invoices'), 'finance');
  assert.equal(moduleForAdminPath('/admin/tasks'), 'plans');
  assert.equal(moduleForAdminPath('/admin/plans/list'), 'plans');
  assert.equal(moduleForAdminPath('/admin/financeX'), null);
  for (const path of ['/admin/users', '/admin/roles', '/admin/permissions', '/admin/audit-logs', '/admin/backup', '/admin/system/usage', '/admin/settings/security', '/admin/chat']) {
    assert.equal(moduleForAdminPath(path), null, path);
  }
});

test('chỉ mở được trang của module có quyền xem', () => {
  assert.equal(canOpenAdminPath(permissions, '/admin/finance/overview'), true);
  assert.equal(canOpenAdminPath(permissions, '/admin/hr/employees'), false);
  assert.equal(canOpenAdminPath(permissions, '/admin/users'), false);
  assert.equal(canOpenAdminPath(null, '/admin/finance/overview'), false);
  assert.equal(hasDelegatedAccess(permissions), true);
  assert.equal(hasDelegatedAccess(normalizeRolePermissions({ hr: { read: false } })), false);
});

test('menu chỉ còn các mục thuộc module được cấp', () => {
  const items = [
    { id: 'hr', title: 'Nhân sự', path: '/admin/hr', children: [{ id: 'hr-1', title: 'Nhân viên', path: '/admin/hr/employees' }] },
    { id: 'finance', title: 'Tài chính', path: '/admin/finance', children: [{ id: 'f-1', title: 'Hóa đơn', path: '/admin/finance/invoices' }, { id: 'f-2', title: 'Lạ', path: '/admin/users' }] },
    { id: 'admin', title: 'Quản trị', path: '/admin/system' },
  ];
  const result = delegatedMenuItems(items, permissions);
  assert.deepEqual(result.map((item) => item.id), ['finance']);
  assert.deepEqual(result[0].children?.map((child) => child.id), ['f-1']);
});

test('mục ủy quyền nằm trước nhóm Cài đặt của cổng nhân viên', () => {
  const employee = [{ id: 'emp-home', title: 'Trang chủ' }, { id: 'emp-settings', title: 'Cài đặt' }];
  const delegated = [{ id: 'finance', title: 'Tài chính', path: '/admin/finance' }];
  assert.deepEqual(insertDelegatedMenu(employee, delegated).map((item) => item.id), ['emp-home', 'finance', 'emp-settings']);
  assert.deepEqual(insertDelegatedMenu([{ id: 'emp-home', title: 'Trang chủ' }], delegated).map((item) => item.id), ['emp-home', 'finance']);
  assert.equal(insertDelegatedMenu(employee, []), employee);
});
