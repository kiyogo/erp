import type { MenuItem } from '../../types/menu';

export type RoleAction = 'read' | 'create' | 'edit' | 'delete';
export type RolePermissions = Record<string, Partial<Record<RoleAction, boolean>>>;

export const ROLE_ACTIONS: Array<{ key: RoleAction; label: string }> = [
  { key: 'read', label: 'Xem' },
  { key: 'create', label: 'Thêm mới' },
  { key: 'edit', label: 'Sửa và duyệt' },
  { key: 'delete', label: 'Xóa' },
];

// Khớp với quy tắc ở máy chủ (legacy/api/index.mjs): mỗi tiền tố trang quản trị thuộc đúng một module có thể ủy quyền.
const ADMIN_PATH_MODULES: Array<[string, RegExp]> = [
  ['hr', /^\/admin\/hr(\/|$)/],
  ['insurance', /^\/admin\/insurance(\/|$)/],
  ['attendance', /^\/admin\/attendance(\/|$)/],
  ['crm', /^\/admin\/crm(\/|$)/],
  ['finance', /^\/admin\/finance(\/|$)/],
  ['assets', /^\/admin\/assets(\/|$)/],
  ['workflows', /^\/admin\/workflows(\/|$)/],
  ['documents', /^\/admin\/documents(\/|$)/],
  ['tickets', /^\/admin\/tickets(\/|$)/],
  ['plans', /^\/admin\/(tasks|plans)(\/|$)/],
  ['reports', /^\/admin\/reports(\/|$)/],
  ['business', /^\/admin\/business(\/|$)/],
];

export const moduleForAdminPath = (pathname: string | undefined): string | null =>
  (pathname && ADMIN_PATH_MODULES.find(([, pattern]) => pattern.test(pathname))?.[0]) || null;

export const canOpenAdminPath = (permissions: RolePermissions | null | undefined, pathname: string | undefined): boolean => {
  const module = moduleForAdminPath(pathname);
  return Boolean(module && permissions?.[module]?.read);
};

export const hasDelegatedAccess = (permissions: RolePermissions | null | undefined): boolean =>
  Object.values(permissions || {}).some((actions) => actions?.read === true);

/** Các mục menu quản trị mà tài khoản được xem; mục con ngoài phạm vi được lược bỏ. */
export const delegatedMenuItems = (items: MenuItem[], permissions: RolePermissions | null | undefined): MenuItem[] =>
  items
    .filter((item) => canOpenAdminPath(permissions, item.path))
    .map((item) => (item.children ? { ...item, children: item.children.filter((child) => canOpenAdminPath(permissions, child.path)) } : item));

/** Làm sạch dữ liệu quyền từ máy chủ: chỉ giữ module có ít nhất một quyền và ép về boolean. */
export const normalizeRolePermissions = (value: unknown): RolePermissions | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result: RolePermissions = {};
  for (const [module, actions] of Object.entries(value as Record<string, unknown>)) {
    if (!actions || typeof actions !== 'object') continue;
    const row = Object.fromEntries(ROLE_ACTIONS.map(({ key }) => [key, (actions as Record<string, unknown>)[key] === true])) as Record<RoleAction, boolean>;
    if (Object.values(row).some(Boolean)) result[module] = row;
  }
  return result;
};

/** Chèn các mục được ủy quyền trước nhóm Cài đặt của cổng nhân viên, hoặc cuối menu nếu không có nhóm đó. */
export const insertDelegatedMenu = (employeeItems: MenuItem[], delegated: MenuItem[]): MenuItem[] => {
  if (!delegated.length) return employeeItems;
  const index = employeeItems.findIndex((item) => item.id === 'emp-settings');
  return index < 0 ? [...employeeItems, ...delegated] : [...employeeItems.slice(0, index), ...delegated, ...employeeItems.slice(index)];
};
