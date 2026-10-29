import type { MenuItem } from '../../types/menu';

export type AppLauncherCategory = 'Tài chính' | 'Kinh doanh' | 'Nhân sự' | 'Văn phòng số' | 'Quản trị' | 'Điều hành';
export type AppLauncherTab = 'all' | 'favorites';

export interface AppLauncherEntry {
  id: string;
  title: string;
  path: string;
  icon?: MenuItem['icon'];
  category: AppLauncherCategory;
  parentTitle?: string;
}

const categoryByMenuId: Record<string, AppLauncherCategory> = {
  dashboard: 'Điều hành',
  reports: 'Điều hành',
  finance: 'Tài chính',
  crm: 'Kinh doanh',
  hr: 'Nhân sự',
  attendance: 'Nhân sự',
  insurance: 'Nhân sự',
  employee: 'Nhân sự',
  'employee-home': 'Nhân sự',
  'emp-home': 'Điều hành',
  'emp-profile': 'Nhân sự',
  'emp-tasks': 'Văn phòng số',
  'emp-payslip': 'Tài chính',
  'emp-contracts': 'Văn phòng số',
  'emp-proposals': 'Văn phòng số',
  'emp-finance-payments': 'Tài chính',
  'emp-workflow-requests': 'Văn phòng số',
  'emp-assets': 'Văn phòng số',
  'emp-asset-tasks': 'Văn phòng số',
  'emp-files': 'Văn phòng số',
  'emp-notifications': 'Văn phòng số',
  'emp-digisig': 'Văn phòng số',
  'emp-settings': 'Quản trị',
  business: 'Quản trị',
  admin: 'Quản trị',
  digisig: 'Quản trị',
  notifications: 'Quản trị',
  settings: 'Quản trị',
  assets: 'Văn phòng số',
  plans: 'Văn phòng số',
  documents: 'Văn phòng số',
  files: 'Văn phòng số',
  chat: 'Văn phòng số',
  tickets: 'Văn phòng số',
  workflows: 'Văn phòng số',
  'meeting-rooms': 'Văn phòng số',
  services: 'Văn phòng số',
};

export const APP_LAUNCHER_CATEGORIES: AppLauncherCategory[] = [
  'Tài chính',
  'Kinh doanh',
  'Nhân sự',
  'Văn phòng số',
  'Quản trị',
  'Điều hành',
];

export function buildLauncherEntries(items: MenuItem[]): AppLauncherEntry[] {
  const entries: AppLauncherEntry[] = [];

  for (const root of items) {
    const category = categoryByMenuId[root.id] || 'Văn phòng số';
    if (root.path) {
      entries.push({ id: root.id, title: root.title, path: root.path, icon: root.icon, category });
    }

    for (const child of root.children || []) {
      if (!child.path) continue;
      entries.push({
        id: `${root.id}/${child.id}`,
        title: child.title,
        path: child.path,
        icon: child.icon || root.icon,
        category,
        parentTitle: root.title,
      });
    }
  }

  return entries;
}

export function normalizeLauncherSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
    .trim();
}

export function filterLauncherEntries(
  entries: AppLauncherEntry[],
  options: { query?: string; category?: AppLauncherCategory | 'Tất cả'; tab?: AppLauncherTab; favoriteIds?: string[] } = {},
): AppLauncherEntry[] {
  const query = normalizeLauncherSearch(options.query || '');
  const category = options.category || 'Tất cả';
  const favoriteIds = new Set(options.favoriteIds || []);

  return entries.filter((entry) => {
    if (options.tab === 'favorites' && !favoriteIds.has(entry.id)) return false;
    if (category !== 'Tất cả' && entry.category !== category) return false;
    if (!query) return true;
    return normalizeLauncherSearch(`${entry.title} ${entry.parentTitle || ''} ${entry.category}`).includes(query);
  });
}

export function readLauncherFavorites(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((item): item is string => typeof item === 'string' && item.length > 0))];
  } catch {
    return [];
  }
}

export function toggleLauncherFavorite(favoriteIds: string[], id: string): string[] {
  return favoriteIds.includes(id)
    ? favoriteIds.filter((favoriteId) => favoriteId !== id)
    : [...favoriteIds, id];
}
