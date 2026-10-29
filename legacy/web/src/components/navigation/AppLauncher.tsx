import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppstoreOutlined, CloseOutlined, SearchOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { MenuItem } from '../../types/menu';
import {
  APP_LAUNCHER_CATEGORIES,
  buildLauncherEntries,
  filterLauncherEntries,
  readLauncherFavorites,
  toggleLauncherFavorite,
  type AppLauncherCategory,
  type AppLauncherTab,
} from './appLauncherRules';

interface AppLauncherProps {
  items: MenuItem[];
  userKey: string;
  isDark?: boolean;
  onNavigate?: () => void;
}

const panelBorder = (isDark: boolean) => isDark ? '#374151' : '#E2E8F0';
const panelSurface = (isDark: boolean) => isDark ? '#111827' : '#FFFFFF';
const panelText = (isDark: boolean) => isDark ? '#F9FAFB' : '#0F172A';
const panelMuted = (isDark: boolean) => isDark ? '#9CA3AF' : '#64748B';

export const AppLauncher: React.FC<AppLauncherProps> = ({ items, userKey, isDark = false, onNavigate }) => {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const storageKey = `kiyovn_app_launcher_favorites_v1:${userKey}`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<AppLauncherTab>('all');
  const [category, setCategory] = useState<AppLauncherCategory | 'Tất cả'>('Tất cả');
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      return readLauncherFavorites(window.localStorage.getItem(storageKey));
    } catch {
      return [];
    }
  });
  const entries = useMemo(() => buildLauncherEntries(items), [items]);
  const availableCategories = useMemo(
    () => APP_LAUNCHER_CATEGORIES.filter((item) => entries.some((entry) => entry.category === item)),
    [entries],
  );
  const visibleEntries = useMemo(
    () => filterLauncherEntries(entries, { query, category, tab, favoriteIds }),
    [entries, query, category, tab, favoriteIds],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(favoriteIds));
    } catch {
      // Favorites remain available for the current session if browser storage is disabled.
    }
  }, [favoriteIds, storageKey]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const openEntry = (path: string) => {
    navigate(path);
    setOpen(false);
    setQuery('');
    onNavigate?.();
  };

  const background = panelSurface(isDark);
  const text = panelText(isDark);
  const muted = panelMuted(isDark);
  const border = panelBorder(isDark);

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button
        type="button"
        aria-label="Mở trung tâm ứng dụng"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Ứng dụng"
        onClick={() => setOpen((value) => !value)}
        style={{
          width: 32,
          height: 32,
          border: 'none',
          borderRadius: 6,
          background: open ? (isDark ? '#1F2937' : '#F3F4F6') : 'transparent',
          color: isDark ? '#D1D5DB' : '#4B5563',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 17,
        }}
      >
        <AppstoreOutlined />
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Trung tâm ứng dụng"
          style={{
            position: 'absolute',
            top: 40,
            left: 0,
            width: 'min(660px, calc(100vw - 24px))',
            maxHeight: 'min(72vh, 620px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background,
            color: text,
            border: `1px solid ${border}`,
            borderRadius: 12,
            boxShadow: '0 16px 48px rgba(15, 23, 42, .2)',
            zIndex: 1500,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: text }}>Ứng dụng</h2>
              <div style={{ marginTop: 3, color: muted, fontSize: 12 }}>Mở nhanh các phân hệ bạn được phép sử dụng</div>
            </div>
            <button type="button" aria-label="Đóng trung tâm ứng dụng" onClick={() => setOpen(false)} style={{ width: 30, height: 30, border: 'none', borderRadius: 6, background: 'transparent', color: muted, cursor: 'pointer' }}>
              <CloseOutlined />
            </button>
          </div>

          <div style={{ padding: '0 18px 12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${border}`, borderRadius: 8, padding: '8px 10px', color: muted }}>
              <SearchOutlined />
              <input
                autoFocus
                aria-label="Tìm ứng dụng"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm ứng dụng hoặc phân hệ"
                style={{ width: '100%', border: 0, outline: 0, background: 'transparent', color: text, fontSize: 13 }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 18px', borderBottom: `1px solid ${border}` }}>
            {([
              { id: 'all', title: 'Tất cả' },
              { id: 'favorites', title: 'Yêu thích' },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={tab === item.id}
                onClick={() => setTab(item.id)}
                style={{ padding: '9px 0', border: 0, borderBottom: `2px solid ${tab === item.id ? '#009688' : 'transparent'}`, background: 'transparent', color: tab === item.id ? '#009688' : muted, fontSize: 13, fontWeight: tab === item.id ? 700 : 500, cursor: 'pointer' }}
              >
                {item.title}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '12px 18px 4px', flexShrink: 0 }}>
            {(['Tất cả', ...availableCategories] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
                style={{ flexShrink: 0, border: `1px solid ${category === item ? '#99F6E4' : border}`, borderRadius: 999, padding: '5px 10px', background: category === item ? (isDark ? '#064E49' : '#F0FDFA') : 'transparent', color: category === item ? '#0F766E' : muted, fontSize: 12, cursor: 'pointer' }}
              >
                {item}
              </button>
            ))}
          </div>

          <div style={{ overflowY: 'auto', padding: '10px 18px 18px' }}>
            {visibleEntries.length ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(142px, 1fr))', gap: 8 }}>
                {visibleEntries.map((entry) => {
                  const favorite = favoriteIds.includes(entry.id);
                  return (
                    <div key={entry.id} style={{ position: 'relative', minWidth: 0 }}>
                      <button
                        type="button"
                        onClick={() => openEntry(entry.path)}
                        title={entry.parentTitle ? `${entry.parentTitle} · ${entry.title}` : entry.title}
                        style={{
                          width: '100%',
                          minHeight: 82,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '12px 30px 12px 12px',
                          border: `1px solid ${border}`,
                          borderRadius: 9,
                          background,
                          color: text,
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ width: 34, height: 34, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, background: isDark ? '#1F2937' : '#F1F5F9', color: '#009688', fontSize: 16 }}>
                          {entry.icon || <AppstoreOutlined />}
                        </span>
                        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 600 }}>{entry.title}</span>
                          <span style={{ color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{entry.parentTitle || entry.category}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={favorite ? `Bỏ ${entry.title} khỏi yêu thích` : `Thêm ${entry.title} vào yêu thích`}
                        title={favorite ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
                        onClick={() => setFavoriteIds((current) => toggleLauncherFavorite(current, entry.id))}
                        style={{ position: 'absolute', top: 7, right: 7, width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 5, background: 'transparent', color: favorite ? '#EAB308' : muted, cursor: 'pointer' }}
                      >
                        {favorite ? <StarFilled /> : <StarOutlined />}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: '28px 12px', textAlign: 'center', color: muted, fontSize: 13 }}>
                {tab === 'favorites' && favoriteIds.length === 0 ? 'Chưa có ứng dụng yêu thích. Chọn biểu tượng ngôi sao để thêm.' : 'Không tìm thấy ứng dụng phù hợp.'}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
