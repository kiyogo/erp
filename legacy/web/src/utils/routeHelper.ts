import { MenuItem } from '../types/menu';

export function isItemActive(item: MenuItem, currentPath: string): boolean {
  if (item.path && currentPath === item.path) return true;
  // If item has children, it is a category; its active state is handled via hasActiveChild
  if (item.children && item.children.length > 0) {
    return false;
  }
  if (
    item.path &&
    item.path !== '/' &&
    item.path !== '/admin' &&
    item.path !== '/admin/dashboard' &&
    item.path !== '/dashboard' &&
    currentPath.startsWith(item.path + '/')
  ) {
    return true;
  }
  return false;
}

export function hasActiveChild(item: MenuItem, currentPath: string): boolean {
  if (!item.children || item.children.length === 0) return false;
  return item.children.some((child) => {
    if (child.path && currentPath === child.path) return true;
    if (
      child.path &&
      child.path !== '/' &&
      child.path !== '/admin' &&
      child.path !== '/admin/dashboard' &&
      child.path !== '/dashboard' &&
      currentPath.startsWith(child.path + '/')
    ) {
      return true;
    }
    return hasActiveChild(child, currentPath);
  });
}

export function findActiveParents(items: MenuItem[], currentPath: string): string[] {
  const activeIds: string[] = [];

  function search(item: MenuItem) {
    if (hasActiveChild(item, currentPath) || isItemActive(item, currentPath)) {
      activeIds.push(item.id);
      if (item.children) {
        item.children.forEach(search);
      }
    }
  }

  items.forEach(search);
  return activeIds;
}

export function findItemByPath(items: MenuItem[], path: string): MenuItem | null {
  for (const item of items) {
    if (item.path === path) return item;
    if (item.children) {
      const found = findItemByPath(item.children, path);
      if (found) return found;
    }
  }
  return null;
}
