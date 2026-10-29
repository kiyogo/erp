import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLauncherEntries, filterLauncherEntries, readLauncherFavorites, toggleLauncherFavorite } from '../src/components/navigation/appLauncherRules.ts';

const items = [
  {
    id: 'finance', title: 'Tài chính', path: '/admin/finance', children: [
      { id: 'finance-payroll', title: 'Tiền lương', path: '/admin/finance/payroll' },
      { id: 'finance-bank', title: 'Ngân hàng', path: '/admin/finance/cash/bank' },
    ],
  },
  { id: 'crm', title: 'Khách hàng & đối tác', path: '/admin/crm', children: [{ id: 'crm-marketing', title: 'aiMarketing', path: '/admin/crm/marketing' }] },
  { id: 'without-route', title: 'Nhóm không có đường dẫn', children: [] },
];

test('launcher includes real root and direct submenu routes with their parent category', () => {
  const entries = buildLauncherEntries(items);
  assert.deepEqual(entries.map(({ id, path, category }) => [id, path, category]), [
    ['finance', '/admin/finance', 'Tài chính'],
    ['finance/finance-payroll', '/admin/finance/payroll', 'Tài chính'],
    ['finance/finance-bank', '/admin/finance/cash/bank', 'Tài chính'],
    ['crm', '/admin/crm', 'Kinh doanh'],
    ['crm/crm-marketing', '/admin/crm/marketing', 'Kinh doanh'],
  ]);
});

test('launcher search is accent-insensitive and category filters do not change route data', () => {
  const entries = buildLauncherEntries(items);
  assert.deepEqual(filterLauncherEntries(entries, { query: 'tien luong', category: 'Tài chính' }).map((entry) => entry.path), ['/admin/finance/payroll']);
  assert.deepEqual(filterLauncherEntries(entries, { query: 'marketing', category: 'Kinh doanh' }).map((entry) => entry.path), ['/admin/crm/marketing']);
});

test('favorites storage ignores malformed values and toggles an item only once', () => {
  assert.deepEqual(readLauncherFavorites('{'), []);
  assert.deepEqual(readLauncherFavorites('["crm","crm",3,""]'), ['crm']);
  assert.deepEqual(toggleLauncherFavorite(['finance'], 'crm'), ['finance', 'crm']);
  assert.deepEqual(toggleLauncherFavorite(['finance', 'crm'], 'crm'), ['finance']);
});

test('favorites view returns only saved launcher entries', () => {
  const entries = buildLauncherEntries(items);
  assert.deepEqual(filterLauncherEntries(entries, { tab: 'favorites', favoriteIds: ['crm/crm-marketing'] }).map((entry) => entry.id), ['crm/crm-marketing']);
});

test('employee portal apps are grouped by their real work area', () => {
  const entries = buildLauncherEntries([
    { id: 'emp-payslip', title: 'Phiếu lương điện tử', path: '/employee/payslip' },
    { id: 'emp-profile', title: 'Hồ sơ cá nhân', path: '/employee/profile' },
    { id: 'emp-tasks', title: 'Nhiệm vụ', path: '/employee/tasks' },
  ]);
  assert.deepEqual(entries.map(({ title, category }) => [title, category]), [
    ['Phiếu lương điện tử', 'Tài chính'],
    ['Hồ sơ cá nhân', 'Nhân sự'],
    ['Nhiệm vụ', 'Văn phòng số'],
  ]);
});
