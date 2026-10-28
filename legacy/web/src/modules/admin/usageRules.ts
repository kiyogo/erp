export type ApplicationUsageCategory = 'finance' | 'business' | 'hr' | 'digital_office';

export function applicationCategoryForPath(pathname: string): ApplicationUsageCategory | null {
  const path = String(pathname || '').toLowerCase().replace(/\/+$/, '') || '/';
  const starts = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

  if (starts('/admin/finance/sales') || starts('/admin/finance/purchasing') || starts('/admin/finance/inventory')) return 'business';
  if (starts('/admin/finance') || starts('/admin/assets') || starts('/employee/finance') || starts('/employee/assets')) return 'finance';
  if (starts('/admin/crm') || starts('/admin/business') || starts('/employee/crm') || starts('/employee/sales')) return 'business';
  if (starts('/admin/hr') || starts('/admin/attendance') || starts('/admin/insurance') || starts('/employee/hr') || starts('/employee/attendance') || starts('/employee/home')) return 'hr';

  const digitalOfficeRoots = [
    '/admin/chat', '/admin/channels', '/admin/documents', '/admin/files', '/admin/workflows', '/admin/plans',
    '/admin/tasks', '/admin/meeting-rooms', '/admin/notifications', '/admin/system', '/admin/settings',
    '/admin/users', '/admin/roles', '/admin/permissions', '/admin/audit', '/admin/sessions', '/admin/drop-menu',
    '/employee/chat', '/employee/channels', '/employee/documents', '/employee/files', '/employee/workflows',
    '/employee/tasks', '/employee/meeting-rooms', '/employee/notifications', '/employee/settings',
  ];
  return digitalOfficeRoots.some(starts) ? 'digital_office' : null;
}

export function filterApplicationUsage<T extends { name: string; email: string; department: string; loginCount: number; operationCount: number }>(
  rows: T[], query: string, activityFilter: 'all' | 'logged_in' | 'operated',
): T[] {
  const normalized = String(query || '').trim().toLocaleLowerCase('vi');
  return rows.filter(row => {
    const matchesQuery = !normalized || [row.name, row.email, row.department].some(value => String(value || '').toLocaleLowerCase('vi').includes(normalized));
    const matchesActivity = activityFilter === 'all'
      || (activityFilter === 'logged_in' && row.loginCount > 0)
      || (activityFilter === 'operated' && row.operationCount > 0);
    return matchesQuery && matchesActivity;
  });
}
