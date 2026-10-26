import React, { useState, useEffect, useRef, useMemo, useCallback, useId, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Link } from 'react-router-dom';
import {
  EyeOutlined, EyeInvisibleOutlined, CloseCircleFilled, CheckCircleFilled, InfoCircleFilled,
  ExclamationCircleFilled, CheckOutlined, WarningFilled, UploadOutlined, FileOutlined, DeleteOutlined,
  FolderOutlined, ArrowLeftOutlined, SearchOutlined, UnorderedListOutlined, AppstoreOutlined,
  FilePdfOutlined, FileWordOutlined, FileExcelOutlined, FileImageOutlined, FileTextOutlined,
  ReloadOutlined, PlusOutlined, RightOutlined, ScissorOutlined, CopyOutlined,
  SnippetsOutlined, EditOutlined, FileZipOutlined, ArrowRightOutlined,
  SafetyCertificateOutlined, InfoCircleOutlined, DownloadOutlined,
} from '@ant-design/icons';
import { DatePicker, DatePickerProps } from './DatePicker';
import { createSystemCode, isSystemGeneratedCodeField } from '../utils/systemCode';
import { filesApi } from '../api/endpoints';
import { formatFileSize } from '../utils/fileStorage';
export { DatePicker };
export type { DatePickerProps };
import './theme.css';

// Global trigger tracker for origin-based animations
if (typeof window !== 'undefined') {
  const handlePointer = (e: MouseEvent | TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0]?.clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY : (e as MouseEvent).clientY;
    if (clientX !== undefined && clientY !== undefined) {
      (window as any).__lastClickPos = { x: clientX, y: clientY };
    }
    const target = e.target as HTMLElement | null;
    if (target) {
      const triggerEl = target.closest('button, a, [role="button"], .ant-btn, .win11-cmd-btn, .k-action-btn, tr, td, .ant-table-row, .ant-select, .ant-dropdown, .ant-menu-item');
      if (triggerEl) {
        (window as any).__lastTriggerRect = triggerEl.getBoundingClientRect();
      } else {
        (window as any).__lastTriggerRect = target.getBoundingClientRect();
      }
    }
  };

  window.addEventListener('mousedown', handlePointer as any, true);
  window.addEventListener('touchstart', handlePointer as any, true);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        (window as any).__lastTriggerRect = active.getBoundingClientRect();
        (window as any).__lastClickPos = {
          x: (window as any).__lastTriggerRect.left + (window as any).__lastTriggerRect.width / 2,
          y: (window as any).__lastTriggerRect.top + (window as any).__lastTriggerRect.height / 2,
        };
      }
    }
  }, true);
}

export function useOverlayAnimation(open: boolean, durationMs = 180) {
  const [shouldRender, setShouldRender] = useState(open);
  const [animClass, setAnimClass] = useState<'enter' | 'exit'>(open ? 'enter' : 'exit');
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const lockedOriginRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setAnimClass('enter');
    } else if (shouldRender) {
      setAnimClass('exit');
      const timer = setTimeout(() => {
        setShouldRender(false);
        lockedOriginRef.current = null;
      }, durationMs);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Synchronously compute and lock transform-origin relative to overlay element bounding box
  React.useLayoutEffect(() => {
    if (shouldRender && overlayRef.current) {
      if (open && !lockedOriginRef.current) {
        let triggerX = window.innerWidth / 2;
        let triggerY = window.innerHeight / 2;

        const lastRect = (window as any).__lastTriggerRect;
        const lastPos = (window as any).__lastClickPos;

        if (lastRect) {
          triggerX = lastRect.left + lastRect.width / 2;
          triggerY = lastRect.top + lastRect.height / 2;
        } else if (lastPos) {
          triggerX = lastPos.x;
          triggerY = lastPos.y;
        }

        const rect = overlayRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const originX = triggerX - rect.left;
          const originY = triggerY - rect.top;
          lockedOriginRef.current = `${originX}px ${originY}px`;
        }
      }

      if (lockedOriginRef.current) {
        overlayRef.current.style.transformOrigin = lockedOriginRef.current;
      } else {
        overlayRef.current.style.transformOrigin = 'top center';
      }
    }
  }, [shouldRender, open]);

  return { shouldRender, animClass, overlayRef };
}

// ==========================================
// 1. ConfigProvider
// ==========================================
export const ConfigContext = createContext<{ locale?: any; renderEmpty?: () => React.ReactNode }>({});
export const ConfigProvider: React.FC<{ locale?: any; renderEmpty?: () => React.ReactNode; children: React.ReactNode }> = ({ locale, renderEmpty, children }) => {
  return (
    <ConfigContext.Provider value={{ locale, renderEmpty }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const ModalContext = createContext<{
  setModalLoading: (loading: boolean) => void;
  isModalLoading: boolean;
}>({
  setModalLoading: () => {},
  isModalLoading: false,
});

// ==========================================
// 2. Empty
// ==========================================
export const Empty: React.FC<{ image?: React.ReactNode; description?: React.ReactNode }> & { PRESENTED_IMAGE_SIMPLE: React.ReactNode } = ({ image, description }) => {
  return (
    <div className="ant-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 0', color: 'var(--antd-text-secondary)' }}>
      <div className="ant-empty-image" style={{ marginBottom: 8, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {image || (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#b0bec5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <path d="M2 10h20" strokeDasharray="3 3" />
          </svg>
        )}
      </div>
      <div className="ant-empty-description" style={{ fontSize: 14 }}>{description || 'No Data'}</div>
    </div>
  );
};
Empty.PRESENTED_IMAGE_SIMPLE = (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cfd8dc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <path d="M2 10h20" strokeDasharray="3 3" />
  </svg>
);

// ==========================================
// 3. Layout (Layout, Header, Sider, Content)
// ==========================================
interface LayoutProps {
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export const Layout: React.FC<LayoutProps> & {
  Header: React.FC<LayoutProps>;
  Sider: React.FC<any>;
  Content: React.FC<LayoutProps>;
} = ({ children, style, className }) => {
  const hasSider = React.Children.toArray(children).some(
    (child) => React.isValidElement(child) && (child.type as any).name === 'Sider'
  );
  return (
    <div
      className={`ant-layout ${hasSider ? 'ant-layout-has-sider' : ''} ${className || ''}`}
      style={style}
    >
      {children}
    </div>
  );
};

Layout.Header = ({ children, style, className }) => {
  return (
    <header className={`ant-layout-header ${className || ''}`} style={{ padding: '0 24px', display: 'flex', alignItems: 'center', height: 56, ...style }}>
      {children}
    </header>
  );
};

Layout.Content = ({ children, style, className }) => {
  return (
    <main className={`ant-layout-content ${className || ''}`} style={style}>
      {children}
    </main>
  );
};

Layout.Sider = ({ children, style, className, collapsible, collapsed, onCollapse, trigger, width = 200 }) => {
  const siderWidth = collapsed ? 80 : width;
  return (
    <aside
      className={`ant-layout-sider ${collapsed ? 'ant-layout-sider-collapsed' : ''} ${className || ''}`}
      style={{
        width: siderWidth,
        minWidth: siderWidth,
        maxWidth: siderWidth,
        flex: `0 0 ${siderWidth}px`,
        transition: 'all 0.2s',
        ...style,
      }}
    >
      <div className="ant-layout-sider-children" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      {collapsible && trigger !== null && (
        <div
          className="ant-layout-sider-trigger"
          onClick={() => onCollapse && onCollapse(!collapsed)}
          style={{
            height: 48,
            lineHeight: '48px',
            textAlign: 'center',
            background: 'rgba(0,0,0,0.1)',
            cursor: 'pointer',
            borderTop: '1px solid rgba(0,0,0,0.15)',
          }}
        >
          {trigger || (collapsed ? '>' : '<')}
        </div>
      )}
    </aside>
  );
};

// ==========================================
// 4. Space
// ==========================================
interface SpaceProps {
  children?: React.ReactNode;
  direction?: 'horizontal' | 'vertical';
  size?: number | 'small' | 'middle' | 'large';
  align?: 'start' | 'end' | 'center' | 'baseline';
  style?: React.CSSProperties;
  className?: string;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
}

export const Space: React.FC<SpaceProps> = ({
  children,
  direction = 'horizontal',
  size = 'small',
  align = 'center',
  style,
  className,
}) => {
  let gapVal = 8;
  if (typeof size === 'number') gapVal = size;
  else if (size === 'small') gapVal = 8;
  else if (size === 'middle') gapVal = 16;
  else if (size === 'large') gapVal = 24;

  return (
    <div
      className={`ant-space ant-space-${direction} ant-space-align-${align} ${className || ''}`}
      style={{
        display: 'inline-flex',
        flexDirection: direction === 'vertical' ? 'column' : 'row',
        gap: gapVal,
        ...style,
      }}
    >
      {React.Children.map(children, (child) => {
        if (child === null || child === undefined) return null;
        return <div className="ant-space-item">{child}</div>;
      })}
    </div>
  );
};

// ==========================================
// 5. Typography
// ==========================================
interface TypographyTextProps {
  children?: React.ReactNode;
  type?: 'secondary' | 'success' | 'warning' | 'danger';
  strong?: boolean;
  style?: React.CSSProperties;
  className?: string;
  code?: boolean;
}

export const Typography: React.FC<{ children?: React.ReactNode; style?: React.CSSProperties; className?: string }> & {
  Text: React.FC<TypographyTextProps>;
  Title: React.FC<any>;
  Link: React.FC<any>;
  Paragraph: React.FC<any>;
} = ({ children, style, className }) => {
  return <div className={`ant-typography ${className || ''}`} style={style}>{children}</div>;
};

Typography.Text = ({ children, type, strong, style, className }) => {
  const typeClass = type ? `ant-typography-${type}` : '';
  const weightStyle = strong ? { fontWeight: 600 } : {};
  return (
    <span className={`ant-typography ${typeClass} ${className || ''}`} style={{ ...weightStyle, ...style }}>
      {children}
    </span>
  );
};

Typography.Title = ({ children, level = 1, style, className }) => {
  const Tag = `h${level}` as any;
  return (
    <Tag className={`ant-typography ant-typography-h${level} ${className || ''}`} style={style}>
      {children}
    </Tag>
  );
};

Typography.Link = ({ children, href, style, className, onClick }) => {
  return (
    <a href={href} onClick={onClick} className={`ant-typography ant-typography-link ${className || ''}`} style={{ color: 'var(--antd-primary)', textDecoration: 'none', cursor: 'pointer', ...style }}>
      {children}
    </a>
  );
};

Typography.Paragraph = ({ children, style, className }) => {
  return (
    <div className={`ant-typography ${className || ''}`} style={{ marginBottom: '1em', ...style }}>
      {children}
    </div>
  );
};

// ==========================================
// 6. Menu
// ==========================================
export interface MenuProps {
  items?: Array<{
    key?: string;
    label?: React.ReactNode;
    icon?: React.ReactNode;
    danger?: boolean;
    disabled?: boolean;
    type?: 'divider' | 'group' | string;
    children?: any[];
    onClick?: (info: any) => void;
  }>;
  selectedKeys?: string[];
  onClick?: (info: { key: string; domEvent: React.MouseEvent }) => void;
  mode?: 'vertical' | 'horizontal' | 'inline';
  compact?: boolean;
  style?: React.CSSProperties;
}

export const Menu: React.FC<MenuProps> = ({ items = [], selectedKeys = [], onClick, style }) => {
  return (
    <ul
      className="ant-menu"
      style={{
        listStyle: 'none',
        margin: 0,
        padding: '2px 2px',
        background: '#ffffff',
        backgroundColor: '#ffffff',
        borderRadius: 6,
        userSelect: 'none',
        width: 'max-content',
        minWidth: 0,
        ...style,
      }}
    >
      {items.map((item, idx) => {
        if (!item) return null;
        if (item.type === 'divider') {
          return (
            <li
              key={item.key || `divider-${idx}`}
              className="ant-menu-item-divider"
              style={{
                height: 1,
                minHeight: 1,
                maxHeight: 1,
                margin: '2px 0',
                padding: 0,
                overflow: 'hidden',
                lineHeight: 0,
                backgroundColor: '#F1F5F9',
                border: 'none',
                listStyle: 'none',
              }}
            />
          );
        }
        const itemKey = item.key || `menu-item-${idx}`;
        const isSelected = selectedKeys.includes(itemKey);

        let linkTo: string | undefined;
        let linkHref: string | undefined;
        let labelContent = item.label;

        if (React.isValidElement(item.label)) {
          const props = item.label.props as any;
          if (props.to) {
            linkTo = props.to;
            labelContent = props.children;
          } else if (props.href) {
            linkHref = props.href;
            labelContent = props.children;
          }
        }

        const handleItemClick = (e: React.MouseEvent) => {
          if (item.disabled) return;
          onClick && onClick({ key: itemKey, domEvent: e });
          item.onClick && item.onClick({ key: itemKey, domEvent: e });
        };

        const innerContent = (
          <>
            {item.icon && (
              <span className="ant-menu-item-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 14, fontSize: 13, flexShrink: 0 }}>
                {item.icon}
              </span>
            )}
            <span className="ant-menu-title-content" style={{ flex: '0 1 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'nowrap', width: 'max-content', margin: 0 }}>
              {labelContent}
            </span>
          </>
        );

        const itemStyle: React.CSSProperties = {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          cursor: item.disabled ? 'not-allowed' : 'pointer',
          borderRadius: 4,
          margin: '1px 2px',
          color: item.danger ? '#EF4444' : item.disabled ? '#94A3B8' : isSelected ? '#009688' : '#334155',
          background: isSelected ? '#F1F5F9' : 'transparent',
          opacity: item.disabled ? 0.6 : 1,
          transition: 'all 0.1s ease',
          padding: 0,
          textAlign: 'left',
          height: 24,
          minHeight: 24,
          maxHeight: 24,
          boxSizing: 'border-box',
          width: '100%',
        };

        const linkStyle: React.CSSProperties = {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          width: '100%',
          height: '100%',
          padding: '2px 4px',
          textDecoration: 'none',
          color: 'inherit',
          gap: 4,
          fontSize: 12,
          fontWeight: 400,
          lineHeight: '18px',
          userSelect: 'none',
          textAlign: 'left',
          boxSizing: 'border-box',
          whiteSpace: 'nowrap',
        };

        return (
          <li
            key={itemKey}
            className={`ant-menu-item ${isSelected ? 'ant-menu-item-selected' : ''} ${item.danger ? 'ant-menu-item-danger' : ''}`}
            onClick={handleItemClick}
            style={itemStyle}
            onMouseEnter={(e) => {
              if (!item.disabled && !isSelected) {
                e.currentTarget.style.background = item.danger ? '#FEF2F2' : '#F1F5F9';
                if (item.danger) e.currentTarget.style.color = '#DC2626';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = 'transparent';
                if (item.danger) e.currentTarget.style.color = '#EF4444';
                else if (!item.disabled) e.currentTarget.style.color = '#334155';
              }
            }}
          >
            {linkTo ? (
              <Link to={linkTo} style={linkStyle}>
                {innerContent}
              </Link>
            ) : linkHref ? (
              <a href={linkHref} style={linkStyle}>
                {innerContent}
              </a>
            ) : (
              <div style={linkStyle}>
                {innerContent}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};


// ==========================================
// 7. Avatar
// ==========================================
export const Avatar: React.FC<{ size?: number | 'small' | 'large' | 'default'; icon?: React.ReactNode; src?: string; style?: React.CSSProperties }> = ({ size = 'default', icon, src, style }) => {
  let sizePx = 32;
  if (typeof size === 'number') sizePx = size;
  else if (size === 'small') sizePx = 24;
  else if (size === 'large') sizePx = 40;

  return (
    <span
      className="ant-avatar"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: sizePx,
        height: sizePx,
        borderRadius: '50%',
        background: '#ccc',
        color: '#fff',
        overflow: 'hidden',
        fontSize: sizePx / 2,
        ...style,
      }}
    >
      {src ? <img src={src} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : icon}
    </span>
  );
};

// ==========================================
// 8. Dropdown
// ==========================================
export const Dropdown: React.FC<{
  menu?: MenuProps;
  placement?: 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight' | string;
  children: React.ReactNode;
  trigger?: ('click' | 'hover')[];
  open?: boolean;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
  overlayStyle?: React.CSSProperties;
  dropdownRender?: (menu: React.ReactNode) => React.ReactNode;
}> = ({ menu, children, open: openProp, disabled, placement, onOpenChange, overlayStyle, dropdownRender }) => {
  const [open, setOpen] = useState(false);
  const [computedVertical, setComputedVertical] = useState<'bottom' | 'top'>('bottom');
  const containerRef = useRef<HTMLDivElement>(null);

  const isControlled = openProp !== undefined;
  const isDropdownOpen = isControlled ? !!openProp : open;
  const { shouldRender, animClass, overlayRef } = useOverlayAnimation(isDropdownOpen, 140);

  const setOpenState = (val: boolean) => {
    if (!isControlled) setOpen(val);
    onOpenChange?.(val);
  };

  const [fixedCoords, setFixedCoords] = useState<{ top: number; left?: number; right?: number } | null>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        overlayRef.current && !overlayRef.current.contains(target)
      ) {
        setOpenState(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  React.useLayoutEffect(() => {
    if (isDropdownOpen && containerRef.current && overlayStyle?.position !== 'fixed') {
      const updateCoords = () => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        const overlayEl = overlayRef.current;
        const itemsCount = menu?.items?.length || 5;
        const estimatedHeight = Math.min(380, itemsCount * 36 + 16);
        const overlayWidth = overlayEl && overlayEl.offsetWidth > 0 ? overlayEl.offsetWidth : 190;
        const overlayHeight = overlayEl && overlayEl.offsetHeight > 0 ? overlayEl.offsetHeight : estimatedHeight;

        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;

        const spaceBelow = viewportHeight - rect.bottom;
        const spaceAbove = rect.top;

        // Auto flip top if not enough room below and more room above
        const shouldFlipTop =
          placement === 'topLeft' ||
          placement === 'topRight' ||
          (spaceBelow < overlayHeight + 12 && spaceAbove >= overlayHeight + 12) ||
          (spaceBelow < overlayHeight + 12 && spaceAbove > spaceBelow);

        let top = rect.bottom + 4;
        if (shouldFlipTop) {
          top = Math.max(8, rect.top - overlayHeight - 4);
        } else {
          if (top + overlayHeight > viewportHeight - 8) {
            top = Math.max(8, viewportHeight - overlayHeight - 8);
          }
        }

        const isRightAligned =
          placement === 'bottomRight' ||
          placement === 'topRight' ||
          rect.left + overlayWidth > viewportWidth - 16;

        if (isRightAligned) {
          const right = Math.max(12, viewportWidth - rect.right);
          setFixedCoords({ top, right, left: undefined });
        } else {
          const left = Math.max(12, Math.min(rect.left, viewportWidth - overlayWidth - 12));
          setFixedCoords({ top, left, right: undefined });
        }
      };

      updateCoords();
      const timer1 = requestAnimationFrame(updateCoords);
      const timer2 = setTimeout(updateCoords, 30);

      window.addEventListener('resize', updateCoords);
      window.addEventListener('scroll', updateCoords, true);

      return () => {
        cancelAnimationFrame(timer1);
        clearTimeout(timer2);
        window.removeEventListener('resize', updateCoords);
        window.removeEventListener('scroll', updateCoords, true);
      };
    }
  }, [isDropdownOpen, placement, overlayStyle?.position, menu?.items?.length]);

  const defaultMenuEl = menu ? (
    <Menu
      items={menu.items}
      selectedKeys={menu.selectedKeys}
      onClick={(info) => {
        setOpenState(false);
        menu.onClick && menu.onClick(info);
      }}
      compact={true}
      style={{
        margin: 0,
        padding: '3px 3px',
        background: '#ffffff',
        backgroundColor: '#ffffff',
        width: 'max-content',
        minWidth: '100%',
        maxHeight: menu.style?.maxHeight || '320px',
        overflowY: menu.style?.overflowY || 'auto',
        ...menu.style,
      }}
    />
  ) : null;

  const menuContent = dropdownRender ? dropdownRender(defaultMenuEl) : defaultMenuEl;

  const overlayEl = shouldRender && menuContent ? (
    <div
      ref={overlayRef}
      className={`custom-dropdown-menu ${animClass === 'enter' ? 'k-pop-enter' : 'k-pop-exit'}`}
      style={{
        position: 'fixed',
        top: overlayStyle?.position === 'fixed' ? (overlayStyle.top ?? fixedCoords?.top ?? 0) : (fixedCoords?.top ?? 0),
        left: overlayStyle?.position === 'fixed' ? overlayStyle.left : fixedCoords?.left,
        right: overlayStyle?.position === 'fixed' ? overlayStyle.right : fixedCoords?.right,
        background: '#ffffff',
        backgroundColor: '#ffffff',
        border: '1px solid #E2E8F0',
        borderRadius: 8,
        boxShadow: '0 10px 28px rgba(0,0,0,0.14), 0 3px 10px rgba(0,0,0,0.08)',
        zIndex: 100060,
        minWidth: 180,
        width: 'max-content',
        maxWidth: 'calc(100vw - 24px)',
        padding: '4px 4px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        ...overlayStyle,
      }}
    >
      {menuContent}
    </div>
  ) : null;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
      <div
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpenState(!isDropdownOpen);
        }}
        style={{ cursor: disabled ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center' }}
      >
        {children}
      </div>
      {overlayEl ? createPortal(overlayEl, document.body) : null}
    </div>
  );
};

// ==========================================
// 9. Spin
// ==========================================
export const Spin: React.FC<{ size?: 'small' | 'default' | 'large'; tip?: string; spinning?: boolean; children?: React.ReactNode; style?: React.CSSProperties }> = ({ size = 'default', tip, spinning = true, children, style }) => {
  if (!spinning) return <>{children}</>;

  return (
    <div style={{ position: 'relative', display: children ? 'block' : 'inline-block', width: children ? '100%' : undefined, ...style }}>
      {children && (
        <div style={{ opacity: 0.45, pointerEvents: 'none', filter: 'blur(0.5px)', transition: 'all 0.2s ease-in-out', userSelect: 'none' }}>
          {children}
        </div>
      )}
      <div
        className={`ant-spin ant-spin-spinning ant-spin-${size}`}
        style={{
          position: children ? 'absolute' : 'static',
          top: '50%',
          left: '50%',
          transform: children ? 'translate(-50%, -50%)' : 'none',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          pointerEvents: 'none',
        }}
      >
        <span className="ant-spin-dot ant-spin-dot-spin">
          <i className="ant-spin-dot-item"></i>
          <i className="ant-spin-dot-item"></i>
          <i className="ant-spin-dot-item"></i>
          <i className="ant-spin-dot-item"></i>
        </span>
        {tip && <div style={{ color: 'var(--antd-primary, #009688)', fontSize: 13.5, fontWeight: 600, letterSpacing: '0.2px' }}>{tip}</div>}
      </div>
    </div>
  );
};

// ==========================================
// 10. Button
// ==========================================
interface ButtonProps {
  type?: 'primary' | 'dashed' | 'link' | 'text' | 'default';
  danger?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  shape?: 'circle' | 'round';
  loading?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  style?: React.CSSProperties;
  className?: string;
  htmlType?: 'submit' | 'button' | 'reset';
  children?: React.ReactNode;
  size?: 'small' | 'middle' | 'large';
  block?: boolean;
  title?: string;
}

export const Button: React.FC<ButtonProps> = ({
  type = 'default',
  danger,
  disabled,
  icon,
  shape,
  loading,
  onClick,
  style,
  className = '',
  htmlType = 'button',
  children,
  size = 'middle',
  block,
  title,
}) => {
  const modalCtx = useContext(ModalContext);
  const isAutoLoading = htmlType === 'submit' && modalCtx?.isModalLoading;
  const isLoading = Boolean(loading || isAutoLoading);
  const isDisabled = Boolean(disabled || isLoading || modalCtx?.isModalLoading);

  const btnTypeClass = type ? `ant-btn-${type}` : '';
  const dangerClass = danger ? 'ant-btn-dangerous' : '';
  const shapeClass = shape ? `ant-btn-${shape}` : '';
  const loadingClass = isLoading ? 'ant-btn-loading' : '';
  const sizeClass = size ? `ant-btn-${size}` : '';
  const blockClass = block ? 'ant-btn-block' : '';

  return (
    <button
      type={htmlType}
      title={title}
      disabled={isDisabled}
      onClick={onClick}
      className={`ant-btn ${btnTypeClass} ${dangerClass} ${shapeClass} ${loadingClass} ${sizeClass} ${blockClass} ${className}`}
      style={{
        display: block ? 'flex' : 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        cursor: isDisabled ? (isLoading ? 'wait' : 'not-allowed') : 'pointer',
        ...style,
      }}
    >
      {isLoading ? (
        <span className="ant-btn-loading-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <svg viewBox="0 0 50 50" style={{ width: 14, height: 14, animation: 'antSpin 1s linear infinite' }}>
            <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="5" strokeDasharray="80, 200" strokeDashoffset="0" strokeLinecap="round" />
          </svg>
        </span>
      ) : (
        icon
      )}
      {children}
    </button>
  );
};

export const Divider: React.FC<{
  type?: 'horizontal' | 'vertical';
  orientation?: 'left' | 'right' | 'center';
  style?: React.CSSProperties;
  className?: string;
  children?: React.ReactNode;
}> = ({ type = 'horizontal', orientation = 'center', style, className = '', children }) => {
  if (type === 'vertical') {
    return <span className={`ant-divider ant-divider-vertical ${className}`} style={{ display: 'inline-block', width: 1, height: '0.9em', margin: '0 8px', verticalAlign: 'middle', background: 'var(--antd-border)', ...style }} />;
  }
  if (!children) {
    return <div className={`ant-divider ant-divider-horizontal ${className}`} style={{ display: 'block', height: 1, width: '100%', margin: '16px 0', background: 'var(--antd-border)', ...style }} />;
  }
  return (
    <div
      className={`ant-divider ant-divider-horizontal ant-divider-with-text ant-divider-with-text-${orientation} ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        margin: '16px 0',
        color: 'var(--antd-text)',
        fontSize: 14,
        ...style,
      }}
    >
      <span className="ant-divider-inner-text" style={{ padding: '0 12px', whiteSpace: 'nowrap' }}>
        {children}
      </span>
    </div>
  );
};

// ==========================================
// 12. Badge
// ==========================================
export const Badge: React.FC<{ status?: 'success' | 'processing' | 'default' | 'error' | 'warning'; text?: React.ReactNode; count?: React.ReactNode; style?: React.CSSProperties; children?: React.ReactNode }> = ({ status, text, count, style, children }) => {
  if (status) {
    return (
      <span className={`ant-badge ant-badge-status ant-badge-status-${status}`} style={style}>
        <span className={`ant-badge-status-dot ant-badge-status-${status}`} />
        {text && <span className="ant-badge-status-text">{text}</span>}
      </span>
    );
  }

  return (
    <span className="ant-badge" style={{ position: 'relative', display: 'inline-block', ...style }}>
      {children}
      {count !== undefined && count !== null && (
        <span
          className="ant-badge-count"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            transform: 'translate(50%, -50%)',
            background: 'var(--antd-danger)',
            color: '#fff',
            fontSize: 12,
            padding: '0 6px',
            borderRadius: 10,
            lineHeight: '20px',
            height: 20,
            minWidth: 20,
            textAlign: 'center',
            boxShadow: '0 0 0 1px #fff',
          }}
        >
          {count}
        </span>
      )}
    </span>
  );
};

// ==========================================
// 13. Tag
// ==========================================
export const Tag: React.FC<{ color?: string; icon?: React.ReactNode; style?: React.CSSProperties; children?: React.ReactNode; closable?: boolean; onClose?: () => void; onClick?: (e: any) => void; title?: string }> = ({ color, icon, style, children, closable, onClose, onClick, title }) => {
  const PRESET_TAG_STYLES: Record<string, { bg: string; border: string; color: string }> = {
    default: { bg: '#fafafa', border: '#d9d9d9', color: '#595959' },
    success: { bg: '#f6ffed', border: '#b7eb8f', color: '#389e0d' },
    processing: { bg: '#e6f7ff', border: '#91d5ff', color: '#096dd9' },
    error: { bg: '#fff2f0', border: '#ffccc7', color: '#cf1322' },
    warning: { bg: '#fffbe6', border: '#ffe58f', color: '#d48806' },
    blue: { bg: '#e6f7ff', border: '#91d5ff', color: '#096dd9' },
    green: { bg: '#f6ffed', border: '#b7eb8f', color: '#389e0d' },
    orange: { bg: '#fffbe6', border: '#ffe58f', color: '#d48806' },
    red: { bg: '#fff2f0', border: '#ffccc7', color: '#cf1322' },
    cyan: { bg: '#e6fffb', border: '#87e8de', color: '#08979c' },
    purple: { bg: '#f9f0ff', border: '#d3ade6', color: '#531dab' },
    geekblue: { bg: '#f0f5ff', border: '#adc6ff', color: '#1d39c4' },
    magenta: { bg: '#fff0f6', border: '#ffadd2', color: '#c41d7f' },
    volcano: { bg: '#fff2e8', border: '#ffbb96', color: '#d4380d' },
    gold: { bg: '#fffbe6', border: '#ffe58f', color: '#d48806' },
    lime: { bg: '#fcffe6', border: '#eaff8f', color: '#7cb305' },
  };

  const presetStyle = color && PRESET_TAG_STYLES[color];
  const customStyle = presetStyle
    ? { background: presetStyle.bg, borderColor: presetStyle.border, color: presetStyle.color }
    : color
    ? { background: color, color: '#fff', borderColor: color }
    : {};

  return (
    <span
      className={`ant-tag ${presetStyle ? `ant-tag-${color}` : ''}`}
      style={{ display: 'inline-flex', alignItems: 'center', ...customStyle, ...style }}
      onClick={onClick}
      title={title}
    >
      {icon && <span style={{ marginRight: 4, display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
      {children}
      {closable && (
        <span
          className="ant-tag-close-icon"
          onClick={(e) => {
            e.stopPropagation();
            onClose && onClose();
          }}
          style={{ marginLeft: 4, cursor: 'pointer' }}
        >
          ×
        </span>
      )}
    </span>
  );
};

// ==========================================
// 14. Alert
// ==========================================
export const Alert: React.FC<{ message: React.ReactNode; description?: React.ReactNode; type?: 'success' | 'info' | 'warning' | 'error'; showIcon?: boolean; closable?: boolean; onClose?: () => void; style?: React.CSSProperties }> = ({ message, description, type = 'info', showIcon, closable, onClose, style }) => {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  let bg = '#e0f2f1';
  let border = '#b2dfdb';
  let color = '#00796b';
  if (type === 'success') { bg = '#f6ffed'; border = '#b7eb8f'; color = '#389e0d'; }
  else if (type === 'warning') { bg = '#fffbe6'; border = '#ffe58f'; color = '#d48806'; }
  else if (type === 'error') { bg = '#fff2f0'; border = '#ffccc7'; color = '#d9363e'; }

  return (
    <div
      className={`ant-alert ant-alert-${type}`}
      style={{
        display: 'flex',
        padding: '8px 15px',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 6,
        color: 'var(--antd-text)',
        marginBottom: 16,
        alignItems: description ? 'flex-start' : 'center',
        gap: 12,
        ...style,
      }}
    >
      {showIcon && (
        <span style={{ color, fontSize: 16, marginTop: description ? 2 : 0, display: 'inline-flex', alignItems: 'center' }}>
          {type === 'success' && <CheckCircleFilled />}
          {type === 'info' && <InfoCircleFilled />}
          {type === 'warning' && <ExclamationCircleFilled />}
          {type === 'error' && <CloseCircleFilled />}
        </span>
      )}
      <div style={{ flex: 1 }}>
        <div className="ant-alert-message" style={{ fontWeight: 500 }}>
          {Array.isArray(message) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {message.map((msg, i) => (
                <div key={i}>{msg}</div>
              ))}
            </div>
          ) : typeof message === 'string' && message.includes('\n') ? (
            message.split('\n').map((line, i) => <div key={i}>{line}</div>)
          ) : (
            message
          )}
        </div>
        {description && <div className="ant-alert-description" style={{ fontSize: 13, marginTop: 4, color: 'var(--antd-text-secondary)' }}>{description}</div>}
      </div>
      {closable && (
        <span
          onClick={() => {
            setVisible(false);
            onClose && onClose();
          }}
          style={{ cursor: 'pointer', fontWeight: 'bold', opacity: 0.5 }}
        >
          ×
        </span>
      )}
    </div>
  );
};

// ==========================================
// 15. Statistic
// ==========================================
export const Statistic: React.FC<{ title?: React.ReactNode; value?: number | string; prefix?: React.ReactNode; suffix?: React.ReactNode; valueStyle?: React.CSSProperties; style?: React.CSSProperties }> = ({ title, value, prefix, suffix, valueStyle, style }) => {
  return (
    <div className="ant-statistic" style={style}>
      {title && <div className="ant-statistic-title" style={{ color: 'var(--antd-text-secondary)', marginBottom: 4, fontSize: 14 }}>{title}</div>}
      <div className="ant-statistic-content" style={{ display: 'flex', alignItems: 'baseline', fontSize: 24, fontWeight: 'bold', color: 'var(--antd-text)', ...valueStyle }}>
        {prefix && <span className="ant-statistic-content-prefix" style={{ marginRight: 4 }}>{prefix}</span>}
        <span className="ant-statistic-content-value">{value}</span>
        {suffix && <span className="ant-statistic-content-suffix" style={{ marginLeft: 4 }}>{suffix}</span>}
      </div>
    </div>
  );
};

// ==========================================
// 16. Progress
// ==========================================
export const Progress: React.FC<{ percent?: number; status?: 'success' | 'exception' | 'normal' | 'active'; size?: 'small' | 'default'; type?: 'line' | 'circle' | 'dashboard'; strokeColor?: string; showInfo?: boolean; style?: React.CSSProperties }> = ({ percent = 0, status, size, type = 'line', strokeColor, showInfo = true, style }) => {
  const isSmall = size === 'small';
  const height = isSmall ? 6 : 8;

  let color = 'var(--antd-primary)';
  if (status === 'success') color = 'var(--antd-success)';
  else if (status === 'exception') color = 'var(--antd-danger)';
  if (strokeColor) color = strokeColor;

  if (type === 'circle' || type === 'dashboard') {
    const radius = 50;
    const strokeWidth = 8;
    const circ = 2 * Math.PI * radius;
    const offset = circ - (percent / 100) * circ;
    return (
      <div className="ant-progress ant-progress-circle" style={{ display: 'inline-block', position: 'relative', width: 120, height: 120, ...style }}>
        <svg viewBox="0 0 120 120" style={{ transform: type === 'dashboard' ? 'rotate(-125deg)' : 'none' }}>
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#f5f5f5" strokeWidth={strokeWidth} />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.3s ease' }}
          />
        </svg>
        {showInfo && <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: 16, fontWeight: 'bold' }}>{percent}%</span>}
      </div>
    );
  }

  return (
    <div className="ant-progress ant-progress-line" style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 8, ...style }}>
      <div style={{ flex: 1, background: '#f5f5f5', borderRadius: 100, height, overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, background: color, height: '100%', borderRadius: 100, transition: 'width 0.3s ease' }} />
      </div>
      {showInfo && <span className="ant-progress-text" style={{ fontSize: 12, minWidth: 32 }}>{percent}%</span>}
    </div>
  );
};

// ==========================================
// 17. Checkbox
// ==========================================
export const Checkbox: React.FC<{ checked?: boolean; indeterminate?: boolean; onChange?: (e: any) => void; disabled?: boolean; children?: React.ReactNode; style?: React.CSSProperties }> = ({ checked, onChange, disabled, children, style }) => {
  const isChecked = !!checked;
  return (
    <label className={`ant-checkbox-wrapper ${disabled ? 'ant-checkbox-wrapper-disabled' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', cursor: disabled ? 'not-allowed' : 'pointer', ...style }}>
      <span className={`ant-checkbox ${isChecked ? 'ant-checkbox-checked' : ''} ${disabled ? 'ant-checkbox-disabled' : ''}`}>
        <input
          type="checkbox"
          checked={isChecked}
          disabled={disabled}
          onChange={(e) => onChange && onChange({ target: { checked: e.target.checked } })}
          className="ant-checkbox-input"
        />
        <span className="ant-checkbox-inner" />
      </span>
      {children !== undefined && <span>{children}</span>}
    </label>
  );
};

// ==========================================
// 18. Switch
// ==========================================
interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  checkedChildren?: React.ReactNode;
  unCheckedChildren?: React.ReactNode;
  style?: React.CSSProperties;
}

export const Switch: React.FC<SwitchProps> = ({ checked, defaultChecked = false, onChange, disabled, checkedChildren, unCheckedChildren, style }) => {
  const [uncontrolledChecked, setUncontrolledChecked] = useState(defaultChecked);
  const isChecked = checked ?? uncontrolledChecked;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isChecked}
      disabled={disabled}
      onClick={() => {
        if (checked === undefined) setUncontrolledChecked(!isChecked);
        onChange && onChange(!isChecked);
      }}
      className={`ant-switch ${isChecked ? 'ant-switch-checked' : ''} ${disabled ? 'ant-switch-disabled' : ''}`}
      style={style}
    >
      <div className="ant-switch-handle" />
      <span className="ant-switch-inner">
        {isChecked ? checkedChildren : unCheckedChildren}
      </span>
    </button>
  );
};

// ==========================================
// 19. Input (Input, Password, Search, TextArea)
// ==========================================
interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'size'> {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  allowClear?: boolean;
  onPressEnter?: React.KeyboardEventHandler<HTMLInputElement>;
  bordered?: boolean;
}

export const Input: React.FC<InputProps> & {
  Password: React.FC<InputProps>;
  Search: React.FC<any>;
  TextArea: React.FC<any>;
} = ({ prefix, suffix, allowClear, value, onChange, onPressEnter, bordered, style, className = '', ...props }) => {
  const effectivePlaceholder = typeof props.placeholder === 'string'
    ? props.placeholder.replace(/\s*\([tT][ùuỳ][yY]\s*[cC]họn\)/gi, '')
    : props.placeholder;

  if (props.type === 'date') {
    return (
      <DatePicker
        value={value !== undefined ? String(value) : undefined}
        onChange={(val) => {
          onChange && onChange({ target: { value: val } } as any);
        }}
        placeholder={effectivePlaceholder || 'YYYY-MM-DD'}
        disabled={props.disabled}
        style={style}
        className={className}
      />
    );
  }

  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onPressEnter) {
      onPressEnter(e);
    }
  };

  const hasAffix = prefix || suffix || allowClear;

  const isBorderedFalse = bordered === false;
  const mergedStyle: React.CSSProperties = isBorderedFalse
    ? { border: 'none', outline: 'none', boxShadow: 'none', background: 'transparent', ...style }
    : { ...style };

  if (!hasAffix) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        className={`ant-input ${className}`}
        style={mergedStyle}
        {...props}
        placeholder={effectivePlaceholder}
      />
    );
  }

  return (
    <span
      className={`ant-input-affix-wrapper ${className}`}
      style={mergedStyle}
      onClick={() => inputRef.current?.focus()}
    >
      {prefix && <span style={{ marginRight: 8, display: 'inline-flex', alignItems: 'center' }}>{prefix}</span>}
      <input
        ref={inputRef}
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        {...props}
        placeholder={effectivePlaceholder}
      />
      {allowClear && value && (
        <span
          onClick={(e) => { e.stopPropagation(); onChange && onChange({ target: { value: '' } } as any); }}
          style={{ cursor: 'pointer', margin: '0 4px', fontWeight: 'bold' }}
        >
          ×
        </span>
      )}
      {suffix && <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center' }}>{suffix}</span>}
    </span>
  );
};

Input.Password = ({ ...props }) => {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      type={visible ? 'text' : 'password'}
      suffix={
        <span
          onClick={(e) => { e.stopPropagation(); setVisible(!visible); }}
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', color: 'var(--antd-text-secondary)', fontSize: 16, padding: '0 4px' }}
        >
          {visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
        </span>
      }
      {...props}
    />
  );
};

Input.Search = ({ onSearch, enterButton, ...props }) => {
  const [val, setVal] = useState(props.value || '');
  useEffect(() => {
    if (props.value !== undefined) setVal(props.value);
  }, [props.value]);

  return (
    <div style={{ display: 'flex' }}>
      <Input
        value={val}
        onChange={(e) => {
          setVal(e.target.value);
          props.onChange && props.onChange(e);
        }}
        onPressEnter={() => onSearch && onSearch(val)}
        style={{ borderTopRightRadius: enterButton ? 0 : undefined, borderBottomRightRadius: enterButton ? 0 : undefined, flex: 1 }}
        {...props}
      />
      {enterButton && (
        <Button
          type="primary"
          onClick={() => onSearch && onSearch(val)}
          style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 32 }}
        >
          {enterButton === true ? 'Search' : enterButton}
        </Button>
      )}
    </div>
  );
};

Input.TextArea = ({ rows, style, ...props }) => {
  const effectivePlaceholder = typeof props.placeholder === 'string'
    ? props.placeholder.replace(/\s*\([tT][ùuỳ][yY]\s*[cC]họn\)/gi, '')
    : props.placeholder;
  return (
    <textarea
      className="ant-input"
      rows={rows}
      style={{ width: '100%', resize: 'vertical', minHeight: rows ? rows * 20 : 160, ...style }}
      {...props}
      placeholder={effectivePlaceholder}
    />
  );
};

// ==========================================
// 20. InputNumber
// ==========================================
export const InputNumber: React.FC<{
  value?: number | null;
  onChange?: (val: number | null) => void;
  min?: number;
  max?: number;
  step?: number | string;
  addonAfter?: React.ReactNode;
  suffix?: React.ReactNode;
  style?: React.CSSProperties;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, min, max, step, addonAfter, suffix, style, disabled, placeholder, className = '' }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let num: number | null = e.target.value === '' ? null : Number(e.target.value);
    if (num !== null && !isNaN(num)) {
      if (min !== undefined && num < min) num = min;
      if (max !== undefined && num > max) num = max;
      onChange && onChange(num);
    } else if (e.target.value === '') {
      onChange && onChange(null);
    }
  };

  const inputEl = (
    <input
      type="number"
      value={value === null || value === undefined ? '' : value}
      onChange={handleChange}
      disabled={disabled}
      placeholder={placeholder}
      className={`ant-input ${className}`}
      style={{ width: 90, ...style }}
      min={min}
      max={max}
      step={step}
    />
  );

  if (addonAfter || suffix) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {inputEl}
        {(addonAfter || suffix) && (
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>
            {addonAfter || suffix}
          </span>
        )}
      </div>
    );
  }

  return inputEl;
};

// ==========================================
// 21. Select
// ==========================================
export const DownOutlined: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ transition: 'none', color: 'rgba(0, 0, 0, 0.25)', flexShrink: 0, ...style }}>
    <path d="M1.5 3.5L5 7L8.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface SelectOption {
  label: React.ReactNode;
  value: any;
}

interface SelectProps {
  value?: any;
  onChange?: (value: any) => void;
  options?: SelectOption[];
  placeholder?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  mode?: 'multiple' | 'tags';
  maxTagCount?: number | 'responsive';
  allowClear?: boolean;
  showSearch?: boolean;
  filterOption?: any;
  className?: string;
  size?: 'small' | 'middle' | 'large';
}

export const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  style,
  disabled,
  mode,
  maxTagCount,
  showSearch,
  allowClear,
  filterOption,
  className = '',
  size = 'middle',
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownCoords, setDropdownCoords] = useState<{
    top: number;
    left: number;
    width: number;
    placement: 'bottom' | 'top';
    maxHeight?: number;
  }>({
    top: 0,
    left: 0,
    width: 0,
    placement: 'bottom',
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const effectivePlaceholder = typeof placeholder === 'string'
    ? placeholder.replace(/\s*\([tT][ùuỳ][yY]\s*[cC]họn\)/gi, '')
    : placeholder;

  const isMultiple = mode === 'multiple' || mode === 'tags';
  const effectiveShowSearch = showSearch !== undefined ? showSearch : (isMultiple ? true : false);
  const hasValue = value !== undefined && value !== null && value !== '';
  const values = isMultiple
    ? (Array.isArray(value)
        ? value
        : (typeof value === 'string' && value.includes(',')
            ? value.split(',').map((s) => s.trim()).filter(Boolean)
            : (hasValue ? [value] : [])))
    : (hasValue ? [value] : []);

  const displayedOptions = React.useMemo(() => {
    if (!effectiveShowSearch || !searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase().trim();
    return options.filter((opt) => {
      if (filterOption && typeof filterOption === 'function') {
        return filterOption(searchQuery, opt);
      }
      const labelStr = typeof opt.label === 'string' ? opt.label : String(opt.label ?? opt.value ?? '');
      return labelStr.toLowerCase().includes(q) || String(opt.value ?? '').toLowerCase().includes(q);
    });
  }, [options, effectiveShowSearch, searchQuery, filterOption]);

  const triggerHeight = size === 'small' ? 26 : size === 'large' ? 40 : 32;
  const itemHeight = size === 'small' ? 26 : size === 'large' ? 40 : 32;
  const dropdownMaxHeight = Math.max(itemHeight * 30, 480); // Hiển thị full toàn bộ danh sách, không giới hạn 1 trang

  const updateCoords = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    // Nếu phần tử select chưa hiển thị hoặc bị cuộn ra khỏi viewport -> tự động đóng dropdown ngay lập tức
    if ((rect.width === 0 && rect.height === 0) || rect.bottom <= 10 || rect.top >= window.innerHeight - 10) {
      setOpen(false);
      return;
    }

    const count = displayedOptions.length;
    const naturalHeight = count > 0 ? count * itemHeight + 8 : 45;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;

    let computedPlacement: 'bottom' | 'top' = 'bottom';
    let computedMaxHeight = Math.min(dropdownMaxHeight, Math.max(spaceBelow, 60));
    let top = rect.bottom + 4;

    // Lật lên trên nếu không gian bên dưới không đủ và phía trên rộng hơn
    if (spaceBelow < Math.min(dropdownMaxHeight, naturalHeight) && spaceAbove > spaceBelow) {
      computedPlacement = 'top';
      computedMaxHeight = Math.min(dropdownMaxHeight, Math.max(spaceAbove, 60));
      const actualHeight = dropdownRef.current
        ? Math.min(dropdownRef.current.scrollHeight || dropdownRef.current.offsetHeight, computedMaxHeight)
        : Math.min(naturalHeight, computedMaxHeight);
      top = Math.max(8, rect.top - actualHeight - 4);
    }

    setDropdownCoords({
      top,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: rect.width,
      placement: computedPlacement,
      maxHeight: computedMaxHeight,
    });
  };

  React.useLayoutEffect(() => {
    if (open) {
      updateCoords();
      const timer = setTimeout(updateCoords, 0);
      return () => clearTimeout(timer);
    }
  }, [open, displayedOptions.length, values.length]);

  useEffect(() => {
    if (open) {
      const handleScroll = (e: Event) => {
        // Nếu sự kiện cuộn nằm bên trong danh sách options của chính dropdown -> cho phép cuộn
        if (dropdownRef.current && (e.target === dropdownRef.current || dropdownRef.current.contains(e.target as Node))) {
          return;
        }
        // Khi cuộn trang, cuộn form hoặc vùng chứa ngoài -> đóng dropdown ngay lập tức
        setOpen(false);
      };

      const handleResize = () => {
        updateCoords();
      };

      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [open]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Focus search input when open
  useEffect(() => {
    if (open && effectiveShowSearch) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [open, effectiveShowSearch]);

  // Auto scroll to active item
  React.useLayoutEffect(() => {
    if (open && dropdownRef.current && !effectiveShowSearch) {
      const activeEl = dropdownRef.current.querySelector('.ant-select-item-selected') as HTMLElement;
      if (activeEl) {
        dropdownRef.current.scrollTop = activeEl.offsetTop - 60;
      }
    }
  }, [open, effectiveShowSearch]);

  const { shouldRender: shouldRenderSelect, animClass: selectAnimClass, overlayRef: selectOverlayRef } = useOverlayAnimation(open, 130);

  // Clear search query ONLY after dropdown is completely closed
  useEffect(() => {
    if (!shouldRenderSelect) {
      setSearchQuery('');
    }
  }, [shouldRenderSelect]);

  const handleSelect = (val: any) => {
    if (disabled) return;
    if (isMultiple) {
      const isAlreadySelected = values.some(v => String(v) === String(val));
      const nextValues = isAlreadySelected
        ? values.filter(v => String(v) !== String(val))
        : [...values, val];
      onChange && onChange(nextValues);
    } else {
      const isAlreadySelected = values.some(v => String(v) === String(val));
      if (isAlreadySelected) {
        onChange && onChange(undefined);
      } else {
        onChange && onChange(val);
      }
      setOpen(false);
    }
  };

  const handleRemove = (e: React.MouseEvent, val: any) => {
    e.stopPropagation();
    if (disabled) return;
    const nextValues = values.filter(v => String(v) !== String(val));
    onChange && onChange(nextValues);
  };

  return (
    <div
      ref={containerRef}
      className={`ant-select ${open ? 'ant-select-open ant-select-focused' : ''} ${disabled ? 'ant-select-disabled' : ''} ${isMultiple ? 'ant-select-multiple' : ''} ${className}`}
      style={{ ...style, position: 'relative', width: style?.width || '100%' }}
      onClick={() => {
        if (!disabled) {
          setOpen(!open);
        }
      }}
    >
      <div
        className="ant-select-selector"
        style={{
          display: 'flex',
          flexWrap: isMultiple ? 'wrap' : 'nowrap',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 4,
          height: isMultiple && values.length > 0 ? 'auto' : triggerHeight,
          minHeight: triggerHeight,
          overflow: isMultiple ? 'visible' : 'hidden',
          padding: isMultiple && values.length > 0 ? '2px 8px' : (size === 'small' ? '0 6px' : '0 8px'),
          boxSizing: 'border-box',
          width: '100%',
          flex: 1,
        }}
      >
        {isMultiple ? (
          <>
            {values.length > 0 && (() => {
              const maxDisplay = typeof maxTagCount === 'number' ? maxTagCount : 10;
              const shouldTruncate = values.length > maxDisplay;
              const visibleValues = shouldTruncate ? values.slice(0, maxDisplay) : values;
              const hiddenCount = values.length - visibleValues.length;

              return (
                <>
                  {visibleValues.map(val => {
                    const opt = options.find(o => String(o.value) === String(val));
                    const label = opt ? opt.label : val;
                    return (
                      <span
                        key={String(val)}
                        className="ant-select-selection-item"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          background: '#F1F5F9',
                          border: '1px solid #E2E8F0',
                          borderRadius: 4,
                          padding: '0 5px 0 6px',
                          fontSize: 12,
                          height: 22,
                          lineHeight: 1,
                          gap: 4,
                          maxWidth: 'calc(100% - 10px)',
                          flexShrink: 1,
                          boxSizing: 'border-box',
                        }}
                      >
                        <span className="ant-select-selection-item-content" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1, display: 'inline-block' }}>{label}</span>
                        <span
                          className="ant-select-selection-item-remove"
                          style={{ cursor: 'pointer', color: '#94A3B8', fontWeight: 'bold', marginLeft: 2, display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}
                          onClick={(e) => handleRemove(e, val)}
                        >
                          ×
                        </span>
                      </span>
                    );
                  })}
                  {hiddenCount > 0 && (
                    <span
                      className="ant-select-selection-item ant-select-selection-overflow-item"
                      title={`${hiddenCount} mục khác`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#E0F2F1',
                        border: '1px solid #B2DFDB',
                        color: '#00796B',
                        borderRadius: 4,
                        padding: '0 6px',
                        fontSize: 12,
                        fontWeight: 600,
                        height: 22,
                        lineHeight: 1,
                        boxSizing: 'border-box',
                        flexShrink: 0,
                      }}
                    >
                      +{hiddenCount}...
                    </span>
                  )}
                </>
              );
            })()}

            {effectiveShowSearch ? (
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                placeholder={values.length === 0 ? effectivePlaceholder : ''}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (!open) setOpen(true);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!open) setOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setOpen(false);
                  } else if (e.key === 'Backspace' && !searchQuery && values.length > 0) {
                    const nextValues = values.slice(0, -1);
                    onChange && onChange(nextValues);
                  } else if (e.key === 'Enter' && displayedOptions.length > 0) {
                    e.preventDefault();
                    handleSelect(displayedOptions[0].value);
                  }
                }}
                style={{
                  border: 'none',
                  outline: 'none',
                  boxShadow: 'none',
                  background: 'transparent',
                  flex: 1,
                  minWidth: values.length === 0 ? '60px' : (searchQuery ? Math.max(searchQuery.length * 8 + 16, 50) : 20),
                  fontSize: size === 'small' ? '12px' : '13px',
                  fontFamily: 'inherit',
                  fontWeight: 400,
                  color: '#1E293B',
                  padding: 0,
                  margin: 0,
                  height: 24,
                  boxSizing: 'border-box',
                }}
              />
            ) : (
              values.length === 0 && (
                <span className="ant-select-selection-placeholder" style={{ color: '#94A3B8', fontSize: size === 'small' ? 12 : 13 }}>
                  {effectivePlaceholder}
                </span>
              )
            )}
          </>
        ) : (
          (() => {
            const selectedOption = hasValue ? options.find(o => String(o.value) === String(value)) : undefined;
            const selectedLabel = selectedOption ? (selectedOption.label !== undefined ? selectedOption.label : String(selectedOption.value)) : null;

            if (effectiveShowSearch && open) {
              return (
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  placeholder={typeof selectedLabel === 'string' ? selectedLabel : (selectedLabel !== null ? String(selectedLabel) : effectivePlaceholder)}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setOpen(false);
                    } else if (e.key === 'Enter' && displayedOptions.length > 0) {
                      e.preventDefault();
                      handleSelect(displayedOptions[0].value);
                    }
                  }}
                  style={{
                    border: 'none',
                    outline: 'none',
                    boxShadow: 'none',
                    background: 'transparent',
                    width: '100%',
                    fontSize: size === 'small' ? '12px' : '13px',
                    fontFamily: 'inherit',
                    fontWeight: 400,
                    color: '#1E293B',
                    padding: 0,
                    margin: 0,
                    height: '100%',
                    boxSizing: 'border-box',
                    flex: 1,
                    minWidth: 0,
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              );
            }

            return (
              <span 
                className={selectedOption ? "ant-select-selection-item" : "ant-select-selection-placeholder"}
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  textAlign: 'left',
                  fontSize: size === 'small' ? '12px' : '13px',
                  fontFamily: 'inherit',
                  fontWeight: 400,
                  color: selectedOption ? '#1E293B' : '#94A3B8',
                  padding: 0,
                  margin: 0,
                  height: '100%',
                  minWidth: 0,
                }}
              >
                {selectedLabel !== null ? selectedLabel : effectivePlaceholder}
              </span>
            );
          })()
        )}
        {allowClear && ((isMultiple && values.length > 0) || (!isMultiple && hasValue)) && (
          <span
            className="ant-select-clear"
            style={{
              paddingLeft: 4,
              cursor: 'pointer',
              color: '#94A3B8',
              fontSize: 13,
              fontWeight: 'bold',
              display: 'inline-flex',
              alignItems: 'center',
              lineHeight: 1,
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (disabled) return;
              setSearchQuery('');
              onChange && onChange(isMultiple ? [] : undefined);
            }}
          >
            ×
          </span>
        )}
        <span className="ant-select-arrow" style={{ marginLeft: 'auto', paddingLeft: 6, display: 'inline-flex', alignItems: 'center', flexShrink: 0, pointerEvents: 'none' }}>
          <DownOutlined />
        </span>
      </div>

      {shouldRenderSelect && !disabled && createPortal(
        <div
          ref={(node) => {
            dropdownRef.current = node;
            selectOverlayRef.current = node;
          }}
          className={`ant-select-dropdown ${size === 'small' ? 'ant-select-dropdown-small' : ''} ${selectAnimClass === 'enter' ? 'k-select-enter' : 'k-select-exit'}`}
          style={{
            position: 'fixed',
            top: dropdownCoords.top,
            left: dropdownCoords.left,
            width: dropdownCoords.width,
            minWidth: dropdownCoords.width,
            maxWidth: dropdownCoords.width,
            maxHeight: dropdownCoords.maxHeight || dropdownMaxHeight,
            overflowY: 'auto',
            scrollbarWidth: 'none' as any,
            msOverflowStyle: 'none' as any,
            zIndex: 100050,
            background: '#FFFFFF',
            backgroundColor: '#FFFFFF',
            border: '1px solid #D9D9D9',
            borderRadius: 6,
            boxShadow: '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
            boxSizing: 'border-box',
            padding: 0,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {displayedOptions.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: '#94A3B8', fontSize: 13, fontWeight: 400 }}>
              Không có dữ liệu
            </div>
          ) : (
            displayedOptions.map((opt, idx) => {
              const isSelected = values.some(v => String(v) === String(opt.value));
              const isFirst = idx === 0;
              const isLast = idx === displayedOptions.length - 1;
              return (
                <div
                  key={String(opt.value)}
                  className={`ant-select-item ${isSelected ? 'ant-select-item-selected' : ''}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    height: itemHeight,
                    minHeight: itemHeight,
                    fontSize: size === 'small' ? '12px' : '14px',
                    padding: size === 'small' ? '0 8px' : '0 12px',
                    margin: 0,
                    borderTopLeftRadius: isFirst ? 5 : 0,
                    borderTopRightRadius: isFirst ? 5 : 0,
                    borderBottomLeftRadius: isLast ? 5 : 0,
                    borderBottomRightRadius: isLast ? 5 : 0,
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                    color: isSelected ? '#009688' : '#000000e0',
                    fontWeight: isSelected ? 600 : 400,
                    background: isSelected ? '#E0F2F1' : 'transparent',
                    overflow: 'hidden',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = '#F5F5F5';
                    } else {
                      e.currentTarget.style.backgroundColor = '#E0F2F1';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    } else {
                      e.currentTarget.style.backgroundColor = '#E0F2F1';
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(opt.value);
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left', fontWeight: isSelected ? 600 : 400, fontSize: size === 'small' ? '12px' : '14px' }}>
                    {opt.label !== undefined ? opt.label : String(opt.value)}
                  </span>
                  {isSelected && (
                    <span style={{ color: '#009688', fontSize: 13, marginLeft: 8, flexShrink: 0, fontWeight: 'bold' }}>✓</span>
                  )}
                </div>
              );
            })
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

// ==========================================
// 21b. CompactSelect — for small dropdowns (pagination, batch actions, etc.)
//      Opens below trigger; auto-flips up if not enough space below.
//      No overlay math — no jump, no bug.
// ==========================================
export const CompactSelect: React.FC<Omit<SelectProps, 'mode' | 'showSearch' | 'filterOption'>> = ({
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  style,
  disabled,
  className = '',
  size = 'small',
}) => {
  const [open, setOpen] = useState(false);
  const [dropdownCoords, setDropdownCoords] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { shouldRender: shouldRenderCompact, animClass: compactAnimClass, overlayRef: compactOverlayRef } = useOverlayAnimation(open, 130);

  const updateCoords = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if ((rect.width === 0 && rect.height === 0) || rect.bottom <= 10 || rect.top >= window.innerHeight - 10) {
      setOpen(false);
      return;
    }
    const estimatedHeight = Math.min(220, options.length * 28 + 8);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;

    let computedMaxHeight = Math.min(220, Math.max(spaceBelow, 60));
    let top = rect.bottom + 2;

    if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
      computedMaxHeight = Math.min(220, Math.max(spaceAbove, 60));
      top = Math.max(8, rect.top - Math.min(estimatedHeight, computedMaxHeight) - 2);
    }

    setDropdownCoords({
      top,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 90) - 8)),
      width: Math.max(rect.width, 90),
    });
  };

  React.useLayoutEffect(() => {
    if (open) {
      updateCoords();
    }
  }, [open, options.length]);

  useEffect(() => {
    if (open) {
      const handleScroll = (e: Event) => {
        if (dropdownRef.current && (e.target === dropdownRef.current || dropdownRef.current.contains(e.target as Node))) {
          return;
        }
        setOpen(false);
      };
      const handleResize = () => updateCoords();
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const triggerHeight = size === 'small' ? 24 : size === 'large' ? 40 : 32;
  const effectivePlaceholder = typeof placeholder === 'string'
    ? placeholder.replace(/\s*\([tT][ùuỳ][yY]\s*[cC]họn\)/gi, '')
    : placeholder;
  const hasValue = value !== undefined && value !== null && value !== '';
  const selectedOption = hasValue ? options.find(o => String(o.value) === String(value)) : undefined;

  const handleSelect = (val: any) => {
    if (disabled) return;
    const isAlreadySelected = hasValue && String(value) === String(val);
    if (isAlreadySelected) {
      onChange && onChange(undefined);
    } else {
      onChange && onChange(val);
    }
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`ant-select compact-select ${open ? 'ant-select-open' : ''} ${disabled ? 'ant-select-disabled' : ''} ${className}`}
      style={style}
      onClick={() => !disabled && setOpen(prev => !prev)}
    >
      <div
        className="ant-select-selector"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          height: triggerHeight,
          minHeight: triggerHeight,
          padding: '0 8px',
        }}
      >
        <span
          className={selectedOption ? 'ant-select-selection-item' : 'ant-select-selection-placeholder'}
          style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left', fontSize: size === 'small' ? 12 : 14 }}
        >
          {selectedOption
            ? (selectedOption.label !== undefined ? selectedOption.label : String(selectedOption.value))
            : effectivePlaceholder}
        </span>
        <DownOutlined />
      </div>

      {shouldRenderCompact && !disabled && createPortal(
        <div
          ref={(node) => {
            dropdownRef.current = node;
            compactOverlayRef.current = node;
          }}
          className={`compact-select-dropdown ${compactAnimClass === 'enter' ? 'k-select-enter' : 'k-select-exit'}`}
          style={{
            position: 'fixed',
            top: dropdownCoords.top,
            left: dropdownCoords.left,
            width: dropdownCoords.width,
            zIndex: 100050,
            background: '#FFFFFF',
            border: '1px solid #D9D9D9',
            borderRadius: 6,
            boxShadow: '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
            padding: 0,
            maxHeight: 220,
            overflowY: 'auto',
          }}
          onClick={e => e.stopPropagation()}
        >
          {options.map((opt, idx) => {
            const isSelected = hasValue && String(opt.value) === String(value);
            const isFirst = idx === 0;
            const isLast = idx === options.length - 1;
            return (
              <div
                key={String(opt.value)}
                className={`compact-select-item${isSelected ? ' compact-select-item-selected' : ''}`}
                style={{
                  fontSize: size === 'small' ? 12 : 13,
                  padding: size === 'small' ? '4px 8px' : '6px 12px',
                  margin: 0,
                  borderTopLeftRadius: isFirst ? 5 : 0,
                  borderTopRightRadius: isFirst ? 5 : 0,
                  borderBottomLeftRadius: isLast ? 5 : 0,
                  borderBottomRightRadius: isLast ? 5 : 0,
                  color: isSelected ? '#009688' : '#000000e0',
                  fontWeight: isSelected ? 600 : 400,
                  backgroundColor: isSelected ? '#E0F2F1' : 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={e => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = '#F5F5F5';
                  } else {
                    e.currentTarget.style.backgroundColor = '#E0F2F1';
                  }
                }}
                onMouseLeave={e => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  } else {
                    e.currentTarget.style.backgroundColor = '#E0F2F1';
                  }
                }}
                onClick={() => handleSelect(opt.value)}
              >
                <span>{opt.label !== undefined ? opt.label : String(opt.value)}</span>
                {isSelected && <span style={{ color: '#009688', fontWeight: 'bold', marginLeft: 6 }}>✓</span>}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};




// ==========================================
// 23. Slider
// ==========================================
export const Slider: React.FC<{ value?: number; onChange?: (val: number) => void; min?: number; max?: number; disabled?: boolean; style?: React.CSSProperties }> = ({ value = 0, onChange, min = 0, max = 100, disabled, style }) => {
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange && onChange(Number(e.target.value))}
      disabled={disabled}
      style={{ width: '100%', cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
    />
  );
};

// ==========================================
// 24. ColorPicker
// ==========================================
export const ColorPicker: React.FC<{ value?: any; onChange?: (val: any) => void; disabled?: boolean; style?: React.CSSProperties }> = ({ value = '#009688', onChange, disabled, style }) => {
  const hexVal = typeof value === 'object' && value?.toHexString ? value.toHexString() : String(value);
  return (
    <input
      type="color"
      value={hexVal}
      onChange={(e) => onChange && onChange({ toHexString: () => e.target.value, _hex: e.target.value })}
      disabled={disabled}
      style={{
        border: '1px solid var(--antd-border)',
        borderRadius: 4,
        width: 32,
        height: 32,
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 2,
        background: '#fff',
        ...style,
      }}
    />
  );
};

// ==========================================
// 25. Card
// ==========================================
export const Card: React.FC<any> = ({ title, extra, children, style, className = '', actions, cover, bodyStyle, styles }) => {
  const mergedBodyStyle = { ...bodyStyle, ...(styles?.body || {}) };
  return (
    <div className={`ant-card ${className}`} style={style}>
      {cover && <div className="ant-card-cover">{cover}</div>}
      {(title || extra) && (
        <div className="ant-card-head">
          <div className="ant-card-head-title">{title}</div>
          {extra && <div className="ant-card-extra">{extra}</div>}
        </div>
      )}
      <div className="ant-card-body" style={mergedBodyStyle}>
        {children}
      </div>
      {actions && (
        <ul className="ant-card-actions" style={{ display: 'flex', listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--antd-border)' }}>
          {actions.map((act: any, idx: number) => (
            <li key={idx} style={{ flex: 1, textAlign: 'center', padding: '12px 0', borderRight: idx < actions.length - 1 ? '1px solid var(--antd-border)' : 'none' }}>
              {act}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ==========================================
// 26. Form & Form.Item
// ==========================================
const FormContext = createContext<{
  values: any;
  isSubmitting?: boolean;
  form?: FormStore;
  setFieldValue: (name: string, value: any) => void;
}>({ values: {}, setFieldValue: () => { } });

class FormStore {
  private values: any = {};
  private initialValues: any = {};
  private listeners: (() => void)[] = [];
  private fields = new Map<string, { rules: any[]; label: string }>();
  private errors: Record<string, string[]> = {};
  private submitHandler?: () => Promise<void>;

  constructor(initialValues = {}) {
    this.values = { ...initialValues };
    this.initialValues = { ...initialValues };
  }

  getFieldsValue() {
    return this.values;
  }

  getFieldValue(name: string) {
    return this.values ? this.values[name] : undefined;
  }

  setFieldsValue(newValues: any) {
    this.values = { ...this.values, ...newValues };
    for (const name of Object.keys(newValues)) delete this.errors[name];
    this.notify();
  }

  setFieldValue(name: string, value: any) {
    this.setFieldsValue({ [name]: value });
  }

  setInitialValues(values: any) {
    this.initialValues = { ...this.initialValues, ...values };
    this.values = { ...values, ...this.values };
    this.notify();
  }

  registerField(name: string, rules: any[] = [], label = name, initialValue?: any) {
    const field = { rules, label };
    this.fields.set(name, field);
    if (initialValue !== undefined) {
      if (!(name in this.initialValues)) this.initialValues[name] = initialValue;
      if (this.values[name] === undefined) this.setFieldValue(name, initialValue);
    }
    return () => {
      if (this.fields.get(name) === field) this.fields.delete(name);
    };
  }

  getFieldError(name: string): string[] {
    return this.errors[name] || [];
  }

  setSubmitHandler(handler: () => Promise<void>) {
    this.submitHandler = handler;
    return () => { if (this.submitHandler === handler) this.submitHandler = undefined; };
  }

  submit() {
    return this.submitHandler ? this.submitHandler() : Promise.reject(new Error('Biểu mẫu chưa được mở.'));
  }

  resetFields() {
    this.values = { ...this.initialValues };
    this.errors = {};
    this.notify();
  }

  async validateFields(names?: string[]) {
    const errorFields: { name: string[]; errors: string[] }[] = [];
    for (const [name, field] of this.fields) {
      if (names && !names.includes(name)) continue;
      const value = this.values[name];
      const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
      const errors: string[] = [];
      for (const rule of field.rules) {
        let invalid = Boolean(rule.required && empty);
        let detail = 'không hợp lệ';
        if (rule.required && empty) detail = 'là bắt buộc';
        if (!empty) {
          if ((rule.whitespace || rule.required) && typeof value === 'string' && !value.trim()) invalid = true;
          if (rule.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) invalid = true;
          if (rule.type === 'url') {
            try { const url = new URL(String(value)); if (!['http:', 'https:'].includes(url.protocol)) invalid = true; } catch { invalid = true; }
          }
          if (rule.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) invalid = true;
          const size = typeof value === 'number' ? value : value.length;
          if (rule.min !== undefined && size < rule.min) { invalid = true; detail = `phải tối thiểu ${rule.min}`; }
          if (rule.max !== undefined && size > rule.max) { invalid = true; detail = `phải tối đa ${rule.max}`; }
          if (rule.len !== undefined && size !== rule.len) invalid = true;
          if (rule.enum && !rule.enum.includes(value)) invalid = true;
          if (rule.pattern) {
            const pattern = new RegExp(rule.pattern);
            if (!pattern.test(String(value))) invalid = true;
          }
        }
        if (invalid) { errors.push(rule.message || `${field.label} ${detail}.`); break; }
        if (rule.validator) {
          try { await rule.validator(rule, value); } catch (error: any) { errors.push(error?.message || rule.message || `${field.label} không hợp lệ.`); break; }
        }
      }
      this.errors[name] = errors;
      if (errors.length) errorFields.push({ name: [name], errors });
    }
    this.notify();
    if (errorFields.length) throw Object.assign(new Error(errorFields[0].errors[0]), { errorFields, values: this.values });
    return this.values;
  }

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l());
  }
}

export const useForm = (formInstance?: any) => {
  const formRef = useRef<any>(null);
  if (!formRef.current) {
    if (formInstance) {
      formRef.current = formInstance;
    } else {
      formRef.current = new FormStore();
    }
  }
  return [formRef.current];
};

export const Form: React.FC<any> & { Item: React.FC<any>; useForm: typeof useForm } = ({
  layout,
  onFinish,
  onFinishFailed,
  initialValues = {},
  form: formProp,
  children,
  autoComplete,
  style,
}) => {
  const [localForm] = useForm();
  const form = formProp || localForm;
  const modalCtx = useContext(ModalContext);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [, forceUpdate] = useState({});
  useEffect(() => {
    return form.subscribe(() => {
      forceUpdate({});
    });
  }, [form]);
  useEffect(() => { form.setInitialValues(initialValues); }, [form]);

  const setFieldValue = (name: string, value: any) => {
    form.setFieldsValue({ [name]: value });
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isSubmitting || modalCtx?.isModalLoading) return;
    setIsSubmitting(true);
    if (modalCtx?.setModalLoading) modalCtx.setModalLoading(true);
    try {
      if (onFinish) {
        const values = await form.validateFields();
        const res = onFinish(values);
        if (res instanceof Promise) {
          await res;
        }
      }
    } catch (error: any) {
      if (error?.errorFields) onFinishFailed?.(error);
      else message.error(error?.message || 'Không thể gửi biểu mẫu.');
    } finally {
      setIsSubmitting(false);
      if (modalCtx?.setModalLoading) modalCtx.setModalLoading(false);
    }
  };
  useEffect(() => form.setSubmitHandler(() => handleSubmit()), [form, handleSubmit]);

  return (
    <FormContext.Provider value={{ values: form.getFieldsValue(), setFieldValue, form, isSubmitting: isSubmitting || Boolean(modalCtx?.isModalLoading) }}>
      <form
        onSubmit={handleSubmit}
        autoComplete={autoComplete}
        className={`ant-form ant-form-${layout || 'horizontal'}`}
        style={{
          ...style,
          pointerEvents: (isSubmitting || modalCtx?.isModalLoading) ? 'none' : 'auto',
        }}
      >
        {children}
      </form>
    </FormContext.Provider>
  );
};

Form.useForm = useForm;

Form.Item = ({ name, label, rules, initialValue, valuePropName = 'value', children, style, autoCode = false }) => {
  const { values, setFieldValue, form } = useContext(FormContext);
  const inputId = useId();
  useEffect(() => {
    if (name && form) return form.registerField(name, rules, typeof label === 'string' ? label.replace(/\s*\*$/, '') : name, initialValue);
  }, [form, name, rules, label, initialValue]);
  const errors = name ? form?.getFieldError(name) || [] : [];
  const formChild = React.isValidElement(children) ? children as React.ReactElement<any> : null;
  const isTextInput = formChild?.type === Input || formChild?.type === Input.TextArea;
  const isAutoGeneratedCode = typeof name === 'string' && isTextInput && isSystemGeneratedCodeField(name, autoCode);

  useEffect(() => {
    if (!isAutoGeneratedCode || !name || values[name]) return;
    setFieldValue(name, createSystemCode(name, label));
  }, [isAutoGeneratedCode, label, name, setFieldValue, values, values[name]]);

  let child: React.ReactNode = children;
  if (name && formChild) {
    const childVal = values[name];
    const childProps: any = {
      id: formChild.props.id || inputId,
      'aria-invalid': errors.length > 0 || undefined,
      'aria-describedby': errors.length ? `${inputId}-error` : formChild.props['aria-describedby'],
      [valuePropName]: childVal !== undefined ? childVal : '',
      readOnly: isAutoGeneratedCode || formChild.props.readOnly,
      title: isAutoGeneratedCode ? 'Mã do hệ thống tự tạo và không thể chỉnh sửa.' : formChild.props.title,
      onChange: (e: any) => {
        if (isAutoGeneratedCode) return;
        let newVal = e;
        if (e && e.target) {
          if (e.target.type === 'checkbox') {
            newVal = e.target.checked;
          } else {
            newVal = e.target.value;
          }
        }
        setFieldValue(name, newVal);
        if (formChild.props.onChange) {
          formChild.props.onChange(e);
        }
      }
    };
    child = React.cloneElement(formChild, childProps);
  }

  const childVal = name ? values[name] : undefined;
  const isRequired = rules?.some((r: any) => r?.required);
  const isFilled = childVal !== undefined && childVal !== null && String(childVal).trim() !== '';

  let labelNode = label;
  if (typeof label === 'string') {
    const hasAsterisk = isRequired || label.includes('*');
    const cleanText = label.replace(/\s*\*\s*$/, '').trim();
    labelNode = (
      <>
        {cleanText}
        {hasAsterisk && !isFilled && (
          <span style={{ color: '#EF4444', marginLeft: 4, fontWeight: 700 }}>*</span>
        )}
      </>
    );
  }

  return (
    <div className="ant-form-item" style={style}>
      <div className="ant-form-item-row">
        {label && (
          <div className="ant-form-item-label">
            <label htmlFor={formChild?.props.id || inputId}>{labelNode}</label>
          </div>
        )}
        <div className="ant-form-item-control">
          <div className="ant-form-item-control-input">
            <div className="ant-form-item-control-input-content">
              {child}
            </div>
          </div>
          {errors.length > 0 && <div id={`${inputId}-error`} role="alert" style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{errors[0]}</div>}
        </div>
      </div>
    </div>
  );
};

const TableFilterDropdown: React.FC<{
  isOpen: boolean;
  filterDropdownRef: React.RefObject<HTMLDivElement>;
  filters: any[];
  tempSelectedFilters: any[];
  setTempSelectedFilters: React.Dispatch<React.SetStateAction<any[]>>;
  onApply: (selected: any[]) => void;
}> = ({ isOpen, filterDropdownRef, filters, tempSelectedFilters, setTempSelectedFilters, onApply }) => {
  const { shouldRender, animClass, overlayRef: filterOverlayRef } = useOverlayAnimation(isOpen, 130);
  if (!shouldRender) return null;

  return (
    <div
      ref={(node) => {
        if (typeof filterDropdownRef === 'function') (filterDropdownRef as any)(node);
        else if (filterDropdownRef) (filterDropdownRef as any).current = node;
        filterOverlayRef.current = node;
      }}
      className={`${animClass === 'enter' ? 'k-pop-enter' : 'k-pop-exit'}`}
      style={{
        position: 'absolute',
        right: 0,
        top: '100%',
        marginTop: 8,
        background: '#fff',
        border: '1px solid var(--antd-border)',
        borderRadius: 4,
        boxShadow: '0 6px 16px rgba(0, 0, 0, 0.08)',
        padding: 8,
        zIndex: 1000,
        minWidth: 145,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto', paddingBottom: 8 }}>
        {filters && filters.map((filterOpt: any) => {
          const isChecked = tempSelectedFilters.includes(filterOpt.value);
          return (
            <Checkbox
              key={String(filterOpt.value)}
              checked={isChecked}
              onChange={(e) => {
                if (e.target.checked) {
                  setTempSelectedFilters([...tempSelectedFilters, filterOpt.value]);
                } else {
                  setTempSelectedFilters(tempSelectedFilters.filter((v: any) => v !== filterOpt.value));
                }
              }}
            >
              {filterOpt.text}
            </Checkbox>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f0f0f0', paddingTop: 6, gap: 8 }}>
        <Button
          size="small"
          type="link"
          style={{ padding: 0, fontSize: 12, border: 'none', background: 'transparent', color: 'var(--antd-text-secondary)', height: 'auto' }}
          onClick={() => {
            setTempSelectedFilters([]);
            onApply([]);
          }}
        >
          Reset
        </Button>
        <Button
          size="small"
          type="primary"
          style={{ fontSize: 12, height: 22, padding: '0 8px' }}
          onClick={() => {
            onApply(tempSelectedFilters);
          }}
        >
          OK
        </Button>
      </div>
    </div>
  );
};

// ==========================================
// 27. Table
// ==========================================
export interface TableProps<T = any> {
  columns?: any[];
  dataSource?: T[];
  rowKey?: string | ((record: T, index: number) => string | number);
  loading?: boolean;
  pagination?: any;
  rowSelection?: any;
  className?: string;
  style?: React.CSSProperties;
  locale?: any;
  size?: 'large' | 'middle' | 'small';
  onRow?: (record: T, index?: number) => React.HTMLAttributes<any>;
  rowClassName?: (record: T, index: number) => string;
  scroll?: { x?: number | string; y?: number | string };
}

export function Table<T = any>({
  columns = [],
  dataSource = [],
  rowKey = 'id',
  loading,
  pagination,
  rowSelection,
  className = '',
  style,
  locale,
  size = 'small',
  onRow,
  rowClassName,
  scroll,
}: TableProps<T>) {
  const [sortColumnKey, setSortColumnKey] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend' | null>(null);
  const [activeFilters, setActiveFilters] = useState<Record<string, any[]>>({});
  const [openFilterColumnKey, setOpenFilterColumnKey] = useState<string | null>(null);
  const [tempSelectedFilters, setTempSelectedFilters] = useState<any[]>([]);

  const filterDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setOpenFilterColumnKey(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const getRowKey = (record: any, index: number) => {
    if (typeof rowKey === 'function') return rowKey(record, index);
    if (record[rowKey] !== undefined) return record[rowKey];
    if (record.key !== undefined) return record.key;
    if (record.id !== undefined) return record.id;
    return String(index);
  };

  const isPaginationEnabled = pagination !== false;
  const pageSize = pagination?.pageSize || 10;
  const current = pagination?.current || 1;
  const startIdx = isPaginationEnabled ? (current - 1) * pageSize : 0;

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>, pageItems: any[]) => {
    if (!rowSelection) return;
    if (e.target.checked) {
      const pageKeys = pageItems.map((r: any, idx: number) => getRowKey(r, startIdx + idx));
      const allKeys = Array.from(new Set([...(rowSelection.selectedRowKeys || []), ...pageKeys]));
      const allRows = dataSource.filter((r: any, idx: number) => allKeys.includes(getRowKey(r, idx)));
      rowSelection.onChange(allKeys, allRows);
    } else {
      const pageKeys = pageItems.map((r: any, idx: number) => getRowKey(r, startIdx + idx));
      const nextKeys = (rowSelection.selectedRowKeys || []).filter((k: any) => !pageKeys.includes(k));
      const nextRows = dataSource.filter((r: any, idx: number) => nextKeys.includes(getRowKey(r, idx)));
      rowSelection.onChange(nextKeys, nextRows);
    }
  };

  const handleSelectOne = (record: any, index: number, checked: boolean) => {
    if (!rowSelection) return;
    const key = getRowKey(record, index);
    let nextKeys = [...(rowSelection.selectedRowKeys || [])];
    if (checked) {
      nextKeys.push(key);
    } else {
      nextKeys = nextKeys.filter((k) => k !== key);
    }
    const nextRows = dataSource.filter((r: any, idx: number) => nextKeys.includes(getRowKey(r, idx)));
    rowSelection.onChange(nextKeys, nextRows);
  };

  const handleSort = (colKey: string) => {
    if (sortColumnKey !== colKey) {
      setSortColumnKey(colKey);
      setSortOrder('ascend');
    } else if (sortOrder === 'ascend') {
      setSortOrder('descend');
    } else {
      setSortColumnKey(null);
      setSortOrder(null);
    }
  };

  const handleFilterIconClick = (e: React.MouseEvent, colKey: string) => {
    e.stopPropagation();
    if (openFilterColumnKey === colKey) {
      setOpenFilterColumnKey(null);
    } else {
      setOpenFilterColumnKey(colKey);
      setTempSelectedFilters(activeFilters[colKey] || []);
    }
  };

  const handleApplyFilters = (colKey: string, selectedValues: any[]) => {
    setActiveFilters((prev) => ({
      ...prev,
      [colKey]: selectedValues,
    }));
    setOpenFilterColumnKey(null);
  };

  // 1. Apply Filtering
  let processedData = [...dataSource];
  Object.keys(activeFilters).forEach((colKey) => {
    const selectedValues = activeFilters[colKey];
    if (selectedValues && selectedValues.length > 0) {
      const col = columns.find(c => (c.key || c.dataIndex) === colKey);
      if (col && col.onFilter) {
        processedData = processedData.filter((record) => {
          return selectedValues.some((val) => col.onFilter(val, record));
        });
      }
    }
  });

  // 2. Apply Sorting
  if (sortColumnKey && sortOrder) {
    const col = columns.find(c => (c.key || c.dataIndex) === sortColumnKey);
    if (col && typeof col.sorter === 'function') {
      processedData.sort((a, b) => {
        const res = col.sorter(a, b);
        return sortOrder === 'ascend' ? res : -res;
      });
    }
  }

  const total = pagination?.total || processedData.length;
  const pageData = isPaginationEnabled ? processedData.slice(startIdx, startIdx + pageSize) : processedData;

  const isAllSelected = rowSelection && pageData.length > 0 &&
    pageData.every((r: any, idx: number) => (rowSelection.selectedRowKeys || []).includes(getRowKey(r, startIdx + idx)));

  const sizeClass = size ? `ant-table-${size}` : 'ant-table-large';

  const SortCaret = ({ direction, active }: { direction: 'up' | 'down'; active: boolean }) => (
    <svg
      viewBox="0 0 1024 1024"
      width="8"
      height="8"
      style={{
        display: 'block',
        color: active ? 'var(--antd-primary, #009688)' : '#bfbfbf',
        transform: direction === 'down' ? 'rotate(180deg)' : 'none',
        transition: 'color 0.3s',
        marginTop: direction === 'down' ? 1 : 0,
      }}
    >
      <path d="M858.9 689L530.5 308.2c-9.4-10.9-26.3-10.9-35.7 0L165.1 689c-8 9.3-1.4 23.4 10.7 23.4h672.4c12.1 0 18.7-14.1 10.7-23.4z" fill="currentColor" />
    </svg>
  );

  const FilterIcon = ({ active }: { active: boolean }) => (
    <svg
      viewBox="64 64 896 896"
      width="11"
      height="11"
      style={{
        color: active ? 'var(--antd-primary, #009688)' : '#bfbfbf',
        transition: 'color 0.3s',
      }}
    >
      <path d="M880.1 154H143.9c-24.5 0-39.8 26.7-27.5 48L349 597.4V838c0 17.7 14.2 32 31.8 32h262.4c17.6 0 31.8-14.3 31.8-32V597.4L907.7 202c12.2-21.3-3-48-27.6-48zM604 564.9v239.1H420V564.9L228.3 226h567.4L604 564.9z" fill="currentColor" />
    </svg>
  );

  const tableMinWidth = scroll?.x && scroll.x !== 'max-content' ? scroll.x : '100%';

  return (
    <div
      className={`ant-table-wrapper ${sizeClass} ${className}`}
      style={{ ...style, width: '100%', maxWidth: '100%', minWidth: 0 }}
    >
      <div className="ant-spin-nested-loading">
        <div className="ant-spin-container">
          <Spin spinning={!!loading}>
            <div className="ant-table" style={{ background: '#FFFFFF', border: '1px solid var(--antd-border, #E2E8F0)', borderRadius: 8, overflow: 'hidden' }}>
              <div className="ant-table-container">
                <div className="ant-table-content" style={{ overflowX: 'auto', overflowY: scroll?.y ? 'auto' : undefined, maxHeight: scroll?.y, width: '100%', maxWidth: '100%', minWidth: 0 }}>
                  <table style={{ width: '100%', minWidth: tableMinWidth, borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead className="ant-table-thead">
                      <tr>
                        {rowSelection && (
                          <th className="ant-table-selection-column" style={{ width: rowSelection.columnWidth || 28, minWidth: rowSelection.columnWidth || 28, padding: '8px 2px 8px 8px', textAlign: 'center', borderBottom: '1px solid var(--antd-border, #E0E0E0)' }}>
                            <Checkbox checked={isAllSelected} onChange={(e) => handleSelectAll(e, pageData)} />
                          </th>
                        )}
                        {columns.map((col: any, idx: number) => {
                          const colKey = col.key || col.dataIndex || String(idx);
                          const isSorted = sortColumnKey === colKey;
                          const hasFilter = !!col.filters;
                          const isFiltered = hasFilter && activeFilters[colKey] && activeFilters[colKey].length > 0;

                          let tooltipText = 'Nhấp để sắp xếp';
                          if (isSorted) {
                            if (sortOrder === 'ascend') tooltipText = 'Nhấp để sắp xếp giảm dần';
                            else if (sortOrder === 'descend') tooltipText = 'Nhấp để hủy sắp xếp';
                          } else {
                            tooltipText = 'Nhấp để sắp xếp tăng dần';
                          }

                          const headerContent = (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', position: 'relative' }}>
                              {col.sorter ? (
                                <Tooltip title={tooltipText}>
                                  <span
                                    style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: 6, userSelect: 'none' }}
                                    onClick={() => handleSort(colKey)}
                                  >
                                    <span className="ant-table-header-cell-title">{col.title}</span>
                                    <span className="ant-table-column-sorter" style={{ display: 'inline-flex', flexDirection: 'column', justifyContent: 'center' }}>
                                      <SortCaret direction="up" active={isSorted && sortOrder === 'ascend'} />
                                      <SortCaret direction="down" active={isSorted && sortOrder === 'descend'} />
                                    </span>
                                  </span>
                                </Tooltip>
                              ) : (
                                <span className="ant-table-header-cell-title">{col.title}</span>
                              )}

                              {hasFilter && (
                                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                                  <span
                                    className="ant-table-filter-trigger"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      padding: '0 4px',
                                      borderRadius: 2,
                                      background: openFilterColumnKey === colKey ? '#e0f2f1' : 'transparent',
                                      cursor: 'pointer',
                                    }}
                                    onClick={(e) => handleFilterIconClick(e, colKey)}
                                  >
                                    <FilterIcon active={isFiltered} />
                                  </span>

                                  <TableFilterDropdown
                                    isOpen={openFilterColumnKey === colKey}
                                    filterDropdownRef={filterDropdownRef}
                                    filters={col.filters}
                                    tempSelectedFilters={tempSelectedFilters}
                                    setTempSelectedFilters={setTempSelectedFilters}
                                    onApply={(selected) => handleApplyFilters(colKey, selected)}
                                  />
                                </div>
                              )}
                            </div>
                          );

                          const padLeft = (idx === 0 && rowSelection) ? '4px' : undefined;

                          return (
                            <th
                              key={colKey}
                              style={{
                                width: col.width,
                                minWidth: col.width,
                                textAlign: 'left',
                                background: 'var(--color-bg-sub, #f5f5f5)',
                                borderBottom: '1px solid var(--antd-border, #E0E0E0)',
                                padding: size === 'small' ? '4px 8px' : size === 'middle' ? '12px 12px' : '16px 16px',
                                paddingLeft: padLeft || (size === 'small' ? 8 : 12),
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {headerContent}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="ant-table-tbody">
                      {pageData.map((record: any, recordIdx: number) => {
                        const absIdx = startIdx + recordIdx;
                        const key = getRowKey(record, absIdx);
                        const isSelected = rowSelection && (rowSelection.selectedRowKeys || []).includes(key);
                        const rowProps = onRow ? onRow(record, absIdx) : {};
                        const customRowClass = rowClassName ? rowClassName(record, absIdx) : '';
                        const cellBorderBottom = recordIdx === pageData.length - 1 ? 'none' : '1px solid var(--antd-border, #E0E0E0)';

                        return (
                          <tr
                            key={key}
                            data-row-key={key}
                            className={`ant-table-row ${isSelected ? 'ant-table-row-selected' : ''} ${customRowClass}`}
                            {...rowProps}
                          >
                            {rowSelection && (
                              <td className="ant-table-selection-column" style={{ width: rowSelection.columnWidth || 28, minWidth: rowSelection.columnWidth || 28, padding: '8px 2px 8px 8px', textAlign: 'center', borderBottom: cellBorderBottom }}>
                                <Checkbox
                                  checked={isSelected}
                                  onChange={(e) => handleSelectOne(record, absIdx, e.target.checked)}
                                />
                              </td>
                            )}
                            {columns.map((col: any, colIdx: number) => {
                              const text = col.dataIndex ? record[col.dataIndex] : undefined;
                              const padLeft = (colIdx === 0 && rowSelection) ? '4px' : undefined;
                              return (
                                <td
                                  key={col.key || col.dataIndex || colIdx}
                                  style={{
                                    width: col.width,
                                    minWidth: col.width,
                                    padding: size === 'small' ? '4px 8px' : size === 'middle' ? '12px 12px' : '16px 16px',
                                    paddingLeft: padLeft || (size === 'small' ? 8 : 12),
                                    borderBottom: cellBorderBottom,
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {col.render ? col.render(text, record, absIdx) : text}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      {pageData.length === 0 && (
                        <tr className="ant-table-placeholder" style={{ background: 'transparent' }}>
                          <td colSpan={columns.length + (rowSelection ? 1 : 0)} style={{ textAlign: 'center', padding: 24, borderBottom: 'none', background: 'transparent' }}>
                            <Empty />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {isPaginationEnabled && (
              <div
                className="ant-pagination-container"
                style={{
                  marginTop: 12,
                  background: '#FFFFFF',
                  border: '1px solid var(--antd-border, #E2E8F0)',
                  borderRadius: 8,
                  padding: '10px 16px',
                  display: 'flex',
                  justifyContent: pagination?.showTotal ? 'space-between' : 'flex-end',
                  alignItems: 'center',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
                  width: '100%',
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                }}
              >
                {pagination?.showTotal && (
                  <div className="ant-pagination-total-text" style={{ fontSize: 13, color: '#64748B' }}>
                    {pagination.showTotal(total, [startIdx + 1, Math.min(startIdx + pageSize, total)])}
                  </div>
                )}
                <Pagination
                  current={current}
                  pageSize={pageSize}
                  total={total}
                  showSizeChanger={pagination?.showSizeChanger !== false}
                  onChange={(page, pSize) => pagination.onChange && pagination.onChange(page, pSize)}
                />
              </div>
            )}
          </Spin>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 28. Modal
// ==========================================
type ModalComponent = React.FC<any> & {
  confirm: (config: any) => void;
  success: (config: any) => void;
  info: (config: any) => void;
  error: (config: any) => void;
  warning: (config: any) => void;
};

export const Modal: ModalComponent = ({
  title,
  open,
  visible,
  onOk,
  onCancel,
  confirmLoading,
  loading,
  maskClosable = false,
  okText = 'OK',
  cancelText = 'Hủy',
  width = 520,
  children,
  footer,
  closable = true,
  closeIcon,
  bodyStyle,
  style,
  styles,
  centered,
  className = '',
}) => {
  const isOpen = open !== undefined ? open : visible;
  const [internalLoading, setInternalLoading] = useState(false);
  const isBusy = Boolean(confirmLoading || loading || internalLoading);
  const { shouldRender, animClass, overlayRef } = useOverlayAnimation(!!isOpen, 220);

  // 100% dialogs must strictly be closed by clicking the 'X' button or explicit action buttons.
  // Escape key and backdrop clicks are disabled.

  if (!shouldRender) return null;

  const topOffset = style?.top !== undefined ? style.top : undefined;
  const isCentered = centered !== undefined ? centered : (topOffset === undefined);
  const hasExistingDialog = typeof document !== 'undefined' && Boolean(
    document.querySelectorAll('.ant-modal-root').length > 1,
  );

  const handleOkClick = async (e: any) => {
    if (isBusy) return;
    if (onOk) {
      setInternalLoading(true);
      try {
        const res = onOk(e);
        if (res instanceof Promise) {
          await res;
        }
      } finally {
        setInternalLoading(false);
      }
    }
  };

  return createPortal(
    <div
      className="ant-modal-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        pointerEvents: isBusy ? 'all' : 'auto',
      }}
    >
      <div
        className={`ant-modal-mask ${animClass === 'enter' ? 'k-mask-enter' : 'k-mask-exit'}`}
        style={{
          position: 'fixed',
          inset: 0,
          background: hasExistingDialog ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.5)',
          zIndex: 10000,
          cursor: isBusy ? 'wait' : 'default',
        }}
      />
      <div
        className="ant-modal-wrap"
        style={{
          position: 'fixed',
          inset: 0,
          overflowY: 'auto',
          outline: 0,
          zIndex: 10001,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '24px 16px',
          boxSizing: 'border-box',
        }}
      >
        <div
          ref={overlayRef}
          className={`ant-modal ${animClass === 'enter' ? 'k-modal-enter' : 'k-modal-exit'} ${className}`}
          style={{
            width,
            maxWidth: 'calc(100vw - 24px)',
            margin: 'auto',
            background: '#fff',
            borderRadius: 8,
            boxShadow: 'var(--antd-shadow-base, 0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12))',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 'calc(100vh - 48px)',
            minWidth: 0,
            boxSizing: 'border-box',
            zIndex: 10002,
            overflow: 'visible',
            padding: 16,
            gap: 16,
            border: 'none',
            ...style,
            top: undefined,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Busy Loading Overlay (Blocks interaction & shows progress) */}
          {isBusy && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(255, 255, 255, 0.88)',
                zIndex: 10020,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                borderRadius: 8,
                backdropFilter: 'blur(3px)',
                cursor: 'wait',
                pointerEvents: 'all',
              }}
            >
              <Spin size="large" tip="Đang lưu dữ liệu, vui lòng chờ..." />
            </div>
          )}

          {closable !== false && !isBusy && (
            <button
              type="button"
              className="ant-modal-close custom-modal-close"
              onClick={(e) => {
                e.stopPropagation();
                onCancel && onCancel();
              }}
              aria-label="Close"
              style={{ position: 'absolute', top: -11, right: -11 }}
            >
              {closeIcon ? (
                closeIcon
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              )}
            </button>
          )}

          {title && (
            <div className="ant-modal-header" style={{ padding: 0, fontWeight: 600, fontSize: 16, lineHeight: '24px', border: 'none', borderBottom: 'none', margin: 0, ...(styles?.header || {}) }}>
              <div className="ant-modal-title" style={{ color: styles?.header?.color || 'var(--antd-text, #0F172A)', fontSize: 16, fontWeight: 600, lineHeight: '24px', margin: 0, padding: 0 }}>{title}</div>
            </div>
          )}

          <div
            className="ant-modal-body"
            style={{
              padding: 0,
              overflowY: bodyStyle?.overflowY !== undefined ? bodyStyle.overflowY : 'auto',
              overflowX: 'hidden',
              flex: 1,
              color: 'var(--antd-text)',
              fontSize: 14,
              minWidth: 0,
              boxSizing: 'border-box',
              pointerEvents: isBusy ? 'none' : 'auto',
              border: 'none',
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              ...bodyStyle,
              ...(styles?.body || {}),
            }}
          >
            <ModalContext.Provider value={{ setModalLoading: setInternalLoading, isModalLoading: isBusy }}>
              {children}
            </ModalContext.Provider>
          </div>

          {footer !== null && (
            <div className="ant-modal-footer" style={{ padding: 0, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 12, border: 'none', borderTop: 'none', margin: 0, ...(styles?.footer || {}) }}>
              {footer !== undefined ? (
                footer
              ) : (
                <>
                  <Button disabled={isBusy} onClick={onCancel}>{cancelText}</Button>
                  <Button type="primary" loading={isBusy} disabled={isBusy} onClick={handleOkClick}>{okText}</Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

Modal.confirm = (config: any) => {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const ConfirmModalWrapper = () => {
    const [open, setOpen] = useState(true);

    const handleClose = (isOk: boolean) => {
      setOpen(false);
      setTimeout(() => {
        if (isOk && config.onOk) config.onOk();
        if (!isOk && config.onCancel) config.onCancel();
        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }, 200);
    };

    return (
      <Modal
        open={open}
        title={config.title}
        onOk={() => handleClose(true)}
        onCancel={() => handleClose(false)}
        okText={config.okText || 'OK'}
        cancelText={config.cancelText || 'Cancel'}
        width={config.width || 420}
      >
        {config.content}
      </Modal>
    );
  };

  const root = createRoot(container);
  root.render(<ConfirmModalWrapper />);
};

Modal.success = (config: any) => Modal.confirm({ ...config, okText: config.okText || 'Đồng ý', cancelText: null });
Modal.info = (config: any) => Modal.confirm({ ...config, okText: config.okText || 'Đồng ý', cancelText: null });
Modal.error = (config: any) => Modal.confirm({ ...config, okText: config.okText || 'Đóng', cancelText: null });
Modal.warning = (config: any) => Modal.confirm({ ...config, okText: config.okText || 'Đồng ý', cancelText: null });

// ==========================================
// 29. Tooltip
// ==========================================
export const Tooltip: React.FC<any> = ({ title, children, placement = 'top', overlayStyle, style }) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const { shouldRender, animClass } = useOverlayAnimation(visible, 100);

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;

      let top = rect.top + scrollY;
      let left = rect.left + scrollX + rect.width / 2;

      if (placement === 'top') {
        top = rect.top + scrollY;
      } else if (placement === 'bottom') {
        top = rect.bottom + scrollY;
      } else if (placement === 'left') {
        top = rect.top + scrollY + rect.height / 2;
        left = rect.left + scrollX;
      } else if (placement === 'right') {
        top = rect.top + scrollY + rect.height / 2;
        left = rect.right + scrollX;
      }

      // Clamp left coordinate so it never overflows offscreen left or right
      const tooltipWidth = tooltipRef.current ? tooltipRef.current.offsetWidth : 100;
      const minLeft = scrollX + tooltipWidth / 2 + 10;
      const maxLeft = scrollX + window.innerWidth - tooltipWidth / 2 - 10;
      if (placement === 'top' || placement === 'bottom') {
        left = Math.max(minLeft, Math.min(maxLeft, left));
      }

      setCoords({ top, left });
    }
  };

  useEffect(() => {
    if (visible) {
      updateCoords();
      const timer = setTimeout(updateCoords, 0);
      window.addEventListener('scroll', updateCoords, true);
      window.addEventListener('resize', updateCoords);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('scroll', updateCoords, true);
        window.removeEventListener('resize', updateCoords);
      };
    }
  }, [visible, placement]);

  const tooltipElement = shouldRender && title && createPortal(
    <div
      ref={tooltipRef}
      className={`ant-tooltip ${animClass === 'enter' ? 'k-tooltip-enter' : 'k-tooltip-exit'}`}
      style={{
        position: 'absolute',
        top: coords.top,
        left: coords.left,
        transform: placement === 'top'
          ? 'translate(-50%, -100%)'
          : placement === 'bottom'
            ? 'translate(-50%, 0)'
            : placement === 'left'
              ? 'translate(-100%, -50%)'
              : 'translate(0, -50%)',
        marginTop: placement === 'top' ? -8 : placement === 'bottom' ? 8 : 0,
        marginLeft: placement === 'left' ? -8 : placement === 'right' ? 8 : 0,
        background: 'rgba(0,0,0,0.85)',
        color: '#fff',
        padding: '5px 9px',
        borderRadius: 4,
        fontSize: 12,
        whiteSpace: 'nowrap',
        zIndex: 2000,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        pointerEvents: 'none',
        maxWidth: 'calc(100vw - 20px)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        ...overlayStyle
      }}
    >
      {title}
    </div>,
    document.body
  );

  return (
    <div
      ref={triggerRef}
      style={{ position: 'relative', display: 'inline-block', ...style }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={() => setVisible(false)}
    >
      {children}
      {tooltipElement}
    </div>
  );
};

// ==========================================
// 30. Drawer
// ==========================================
export const Drawer: React.FC<any> = ({ title, open, onClose, width = 378, children, footer, mask = false }) => {
  const { shouldRender, animClass, overlayRef } = useOverlayAnimation(!!open, 220);

  // 100% dialogs/drawers must strictly be closed by clicking the 'X' button or explicit action buttons.

  if (!shouldRender) return null;

  return (
    <div className="ant-drawer-root" style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'none' }}>
      {mask && (
        <div
          className={`ant-drawer-mask ${animClass === 'enter' ? 'k-mask-enter' : 'k-mask-exit'}`}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.2)',
            zIndex: 10000,
            pointerEvents: 'auto',
          }}
          onClick={onClose}
        />
      )}
      <div
        ref={overlayRef}
        className={`ant-drawer-content-wrapper ${animClass === 'enter' ? 'k-drawer-enter' : 'k-drawer-exit'}`}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width,
          maxWidth: '100vw',
          background: '#fff',
          zIndex: 10001,
          boxShadow: '-6px 0 24px rgba(0, 0, 0, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          boxSizing: 'border-box',
          pointerEvents: 'auto',
        }}
      >
        <div className="ant-drawer-header" style={{ padding: '16px 24px', border: 'none', borderBottom: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="ant-drawer-title" style={{ fontWeight: 600, fontSize: 16 }}>{title}</div>
          <button
            type="button"
            className="ant-drawer-close custom-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="ant-drawer-body" style={{ flex: 1, padding: '20px 24px 28px 24px', overflowY: 'auto', overflowX: 'hidden', minWidth: 0, border: 'none' }}>
          {children}
        </div>
        {footer && (
          <div className="ant-drawer-footer" style={{ padding: '14px 24px 20px 24px', border: 'none', borderTop: 'none', background: '#fff' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// 31. Popconfirm
// ==========================================
export const Popconfirm: React.FC<any> = ({
  title,
  onConfirm,
  onCancel,
  okText = 'Yes',
  cancelText = 'No',
  children,
  okButtonProps,
}) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [arrowOffset, setArrowOffset] = useState(0);
  const [placement, setPlacement] = useState<'top' | 'bottom' | 'left' | 'right'>('top');
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { shouldRender: shouldRenderPopconfirm, animClass: popconfirmAnimClass, overlayRef: popconfirmOverlayRef } = useOverlayAnimation(open, 140);

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;
      
      const spaceTop = rect.top;
      const spaceBottom = window.innerHeight - rect.bottom;
      const spaceLeft = rect.left;
      const spaceRight = window.innerWidth - rect.right;
      
      let computedPlacement: 'top' | 'bottom' | 'left' | 'right' = 'top';
      
      if (spaceTop < 140) {
        if (spaceBottom >= 140) {
          computedPlacement = 'bottom';
        } else if (spaceLeft >= 280) {
          computedPlacement = 'left';
        } else if (spaceRight >= 280) {
          computedPlacement = 'right';
        } else {
          computedPlacement = 'bottom';
        }
      } else if (spaceRight < 160) {
        if (spaceLeft >= 280) {
          computedPlacement = 'left';
        } else if (spaceBottom >= 140) {
          computedPlacement = 'bottom';
        } else {
          computedPlacement = 'top';
        }
      } else if (spaceLeft < 160) {
        if (spaceRight >= 280) {
          computedPlacement = 'right';
        } else if (spaceBottom >= 140) {
          computedPlacement = 'bottom';
        } else {
          computedPlacement = 'top';
        }
      }
      
      setPlacement(computedPlacement);

      const popWidth = 270;
      const popHeight = popoverRef.current ? popoverRef.current.offsetHeight : 120;

      let top = rect.top + scrollY;
      let left = rect.left + scrollX;
      let calculatedArrowOffset = 0;

      if (computedPlacement === 'top' || computedPlacement === 'bottom') {
        const rawLeft = rect.left + rect.width / 2;
        const clampedLeft = Math.max(popWidth / 2 + 16, Math.min(window.innerWidth - popWidth / 2 - 16, rawLeft));
        left = clampedLeft + scrollX;
        calculatedArrowOffset = rawLeft - clampedLeft;

        if (computedPlacement === 'top') {
          top = rect.top + scrollY;
        } else {
          top = rect.bottom + scrollY;
        }
      } else if (computedPlacement === 'left' || computedPlacement === 'right') {
        const rawTop = rect.top + rect.height / 2;
        const clampedTop = Math.max(popHeight / 2 + 16, Math.min(window.innerHeight - popHeight / 2 - 16, rawTop));
        top = clampedTop + scrollY;
        calculatedArrowOffset = rawTop - clampedTop;

        if (computedPlacement === 'left') {
          left = rect.left + scrollX;
        } else {
          left = rect.right + scrollX;
        }
      }

      setCoords({ top, left });
      setArrowOffset(calculatedArrowOffset);
    }
  };

  useEffect(() => {
    if (open) {
      updateCoords();
      const timer = setTimeout(updateCoords, 10);
      window.addEventListener('scroll', updateCoords, true);
      window.addEventListener('resize', updateCoords);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('scroll', updateCoords, true);
        window.removeEventListener('resize', updateCoords);
      };
    }
  }, [open]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        popoverRef.current && !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const popoverElement = shouldRenderPopconfirm && createPortal(
    <div
      ref={(node) => {
        popoverRef.current = node;
        popconfirmOverlayRef.current = node;
      }}
      className={`ant-popover ${popconfirmAnimClass === 'enter' ? 'k-pop-enter' : 'k-pop-exit'}`}
      style={{
        position: 'absolute',
        top: coords.top,
        left: coords.left,
        transform: 
          placement === 'left' ? 'translate(calc(-100% - 8px), -50%)' : 
          placement === 'right' ? 'translate(8px, -50%)' :
          placement === 'bottom' ? 'translate(-50%, 8px)' :
          'translate(-50%, calc(-100% - 8px))',
        zIndex: 9999,
        width: 270,
        boxSizing: 'border-box',
        pointerEvents: 'auto',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="ant-popover-content"
        style={{
          background: '#ffffff',
          border: '1px solid var(--antd-border)',
          borderRadius: 6,
          boxShadow: '0 6px 16px rgba(0, 0, 0, 0.08)',
          padding: 12,
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div className="ant-popover-inner-content">
          <div style={{ display: 'flex', gap: 8, alignItems: 'start', fontSize: 14 }}>
            <WarningFilled style={{ color: 'var(--antd-warning)', fontSize: 16, marginTop: 2, flexShrink: 0 }} />
            <div style={{ color: 'var(--antd-text)', wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4' }}>{title}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <Button size="small" onClick={() => { setOpen(false); onCancel && onCancel(); }}>
              {cancelText}
            </Button>
            <Button type="primary" size="small" onClick={() => { setOpen(false); onConfirm && onConfirm(); }} {...okButtonProps}>
              {okText}
            </Button>
          </div>
        </div>
      </div>
      {/* Dynamic Arrow Pointer */}
      <div
        style={{
          position: 'absolute',
          width: 8,
          height: 8,
          background: '#ffffff',
          transform: 'rotate(45deg)',
          zIndex: 3,
          boxSizing: 'border-box',
          ...(
            placement === 'top' ? {
              bottom: -4,
              left: `calc(50% + ${arrowOffset}px)`,
              marginLeft: -4,
              borderRight: '1px solid var(--antd-border)',
              borderBottom: '1px solid var(--antd-border)',
            } : placement === 'bottom' ? {
              top: -4,
              left: `calc(50% + ${arrowOffset}px)`,
              marginLeft: -4,
              borderLeft: '1px solid var(--antd-border)',
              borderTop: '1px solid var(--antd-border)',
            } : placement === 'left' ? {
              right: -4,
              top: `calc(50% + ${arrowOffset}px)`,
              marginTop: -4,
              borderRight: '1px solid var(--antd-border)',
              borderTop: '1px solid var(--antd-border)',
            } : { // right
              left: -4,
              top: `calc(50% + ${arrowOffset}px)`,
              marginTop: -4,
              borderLeft: '1px solid var(--antd-border)',
              borderBottom: '1px solid var(--antd-border)',
            }
          )
        }}
      />
    </div>,
    document.body
  );

  return (
    <>
      <div
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        style={{ display: 'inline-block', cursor: 'pointer' }}
      >
        {children}
      </div>
      {popoverElement}
    </>
  );
};

// ==========================================
// 32. Skeleton
// ==========================================
export const Skeleton: React.FC<any> = ({ active, children, loading = true }) => {
  if (!loading) return <>{children}</>;
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, opacity: active ? 0.7 : 1 }}>
      <div style={{ height: 16, background: '#f2f2f2', borderRadius: 4, width: '40%' }} />
      <div style={{ height: 16, background: '#f2f2f2', borderRadius: 4, width: '100%' }} />
      <div style={{ height: 16, background: '#f2f2f2', borderRadius: 4, width: '80%' }} />
    </div>
  );
};

// ==========================================
// 33. List & List.Item & Meta
// ==========================================
export const List: React.FC<any> & { Item: React.FC<any> } = ({ dataSource = [], renderItem, header, footer, style }) => {
  return (
    <div className="ant-list" style={style}>
      {header && <div className="ant-list-header" style={{ padding: '12px 24px', borderBottom: '1px solid var(--antd-border)' }}>{header}</div>}
      <div className="ant-list-items">
        {dataSource.map((item: any, idx: number) => renderItem(item, idx))}
      </div>
      {footer && <div className="ant-list-footer" style={{ padding: '12px 24px', borderTop: '1px solid var(--antd-border)' }}>{footer}</div>}
    </div>
  );
};

List.Item = ({ children, actions, style }) => {
  return (
    <div className="ant-list-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid var(--antd-border)', ...style }}>
      <div className="ant-list-item-content" style={{ flex: 1 }}>{children}</div>
      {actions && (
        <ul className="ant-list-item-action" style={{ display: 'flex', listStyle: 'none', margin: 0, padding: 0, gap: 16 }}>
          {actions.map((act: any, idx: number) => (
            <li key={idx}>{act}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

const ListItemMeta: React.FC<any> = ({ avatar, title, description }) => {
  return (
    <div className="ant-list-item-meta" style={{ display: 'flex', gap: 16, alignItems: 'start' }}>
      {avatar && <div className="ant-list-item-meta-avatar">{avatar}</div>}
      <div className="ant-list-item-meta-content" style={{ flex: 1 }}>
        {title && <h4 className="ant-list-item-meta-title" style={{ margin: '0 0 4px 0', fontSize: 14 }}>{title}</h4>}
        {description && <div className="ant-list-item-meta-description" style={{ color: 'var(--antd-text-secondary)', fontSize: 13 }}>{description}</div>}
      </div>
    </div>
  );
};
(List.Item as any).Meta = ListItemMeta;

// ==========================================
// 34. Breadcrumb
// ==========================================
export const Breadcrumb: React.FC<any> = ({ items = [] }) => {
  return (
    <nav className="ant-breadcrumb" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 14 }}>
      {items.map((item: any, idx: number) => (
        <React.Fragment key={idx}>
          {idx > 0 && <span className="ant-breadcrumb-separator" style={{ color: 'var(--antd-text-secondary)' }}>/</span>}
          <span className="ant-breadcrumb-link" style={{ color: idx === items.length - 1 ? 'var(--antd-text)' : 'var(--color-accent, #009688)' }}>
            {item.title}
          </span>
        </React.Fragment>
      ))}
    </nav>
  );
};

// ==========================================
// 35. Tree
// ==========================================
export const Tree: React.FC<any> = ({
  treeData = [],
  checkedKeys = [],
  expandedKeys = [],
  onCheck,
  onExpand,
  checkable,
  selectable,
  selectedKeys = [],
  onSelect,
}) => {
  const [expanded, setExpanded] = useState<string[]>(expandedKeys);

  const toggleExpand = (key: string) => {
    let nextExpanded = [...expanded];
    if (nextExpanded.includes(key)) {
      nextExpanded = nextExpanded.filter((k) => k !== key);
    } else {
      nextExpanded.push(key);
    }
    setExpanded(nextExpanded);
    onExpand && onExpand(nextExpanded);
  };

  const handleCheck = (key: string, checked: boolean) => {
    if (!onCheck) return;
    let nextChecked = [...checkedKeys];
    if (checked) {
      nextChecked.push(key);
    } else {
      nextChecked = nextChecked.filter((k) => k !== key);
    }
    onCheck(nextChecked);
  };

  const handleSelect = (key: string) => {
    if (!onSelect) return;
    onSelect([key]);
  };

  const renderNode = (node: any, depth = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expanded.includes(node.key);
    const isChecked = checkedKeys.includes(node.key);
    const isSelected = selectedKeys.includes(node.key);

    return (
      <div key={node.key} style={{ paddingLeft: depth * 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 28, gap: 4 }}>
          {hasChildren ? (
            <span
              onClick={() => toggleExpand(node.key)}
              style={{ cursor: 'pointer', width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}
            >
              ▶
            </span>
          ) : (
            <span style={{ width: 16 }} />
          )}

          {checkable && (
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => handleCheck(node.key, e.target.checked)}
              style={{ margin: 0 }}
            />
          )}

          <span
            onClick={() => handleSelect(node.key)}
            style={{
              cursor: selectable ? 'pointer' : 'default',
              padding: '2px 6px',
              borderRadius: 4,
              background: isSelected ? 'rgba(22, 119, 255,0.15)' : 'transparent',
              color: isSelected ? 'var(--color-accent, #009688)' : 'inherit',
            }}
          >
            {node.title}
          </span>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {node.children.map((child: any) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return <div className="ant-tree">{treeData.map((node: any) => renderNode(node))}</div>;
};

// ==========================================
// 36. Segmented
// ==========================================
export const Segmented: React.FC<any> = ({ options = [], value, onChange, style }) => {
  const [localVal, setLocalVal] = useState(options[0]);
  const currentVal = value !== undefined ? value : localVal;

  const handleSelect = (val: any) => {
    if (onChange) onChange(val);
    else setLocalVal(val);
  };

  return (
    <div
      className="ant-segmented"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 28,
        padding: 2,
        background: 'rgba(0, 0, 0, 0.06)',
        borderRadius: 6,
        gap: 2,
        boxSizing: 'border-box',
        flexShrink: 0,
        userSelect: 'none',
        ...style,
      }}
    >
      {options.map((opt: any) => {
        const val = typeof opt === 'object' ? opt.value : opt;
        const label = typeof opt === 'object' ? opt.label : opt;
        const isSelected = val === currentVal;
        return (
          <div
            key={String(val)}
            onClick={(e) => {
              e.stopPropagation();
              handleSelect(val);
            }}
            style={{
              height: 24,
              padding: '0 10px',
              borderRadius: 4,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              background: isSelected ? '#FFFFFF' : 'transparent',
              boxShadow: isSelected ? '0 1px 3px rgba(0, 0, 0, 0.12)' : 'none',
              fontWeight: isSelected ? 500 : 400,
              fontSize: 12.5,
              color: isSelected ? '#1E293B' : '#64748B',
              boxSizing: 'border-box',
              flexShrink: 0,
              userSelect: 'none',
              transition: 'background-color 0.12s ease, box-shadow 0.12s ease, color 0.12s ease',
            }}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
};

// ==========================================
// 37. AutoComplete
// ==========================================
export const AutoComplete: React.FC<any> = ({
  options = [],
  value,
  onChange,
  onSelect,
  onBlur,
  placeholder,
  style,
  children,
  bordered,
  ...props
}) => {
  const [open, setOpen] = useState(false);
  const [filtered, setFiltered] = useState(options);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      const valStr = String(value).toLowerCase();
      const matched = options.filter((opt: any) => {
        const str = String(typeof opt === 'object' && opt.value !== undefined ? opt.value : opt).toLowerCase();
        return str.includes(valStr);
      });
      setFiltered(matched.length > 0 ? matched : options);
    } else {
      setFiltered(options);
    }
  }, [options, value]);

  const { shouldRender: shouldRenderAuto, animClass: autoAnimClass, overlayRef: autoOverlayRef } = useOverlayAnimation(open && filtered.length > 0, 130);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        onBlur && onBlur(e);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [onBlur]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange && onChange(val);
    const matched = options.filter((opt: any) => {
      const str = String(typeof opt === 'object' && opt.value !== undefined ? opt.value : opt).toLowerCase();
      return str.includes(val.toLowerCase());
    });
    setFiltered(matched.length > 0 ? matched : options);
    setOpen(true);
  };

  const handleOptionSelect = (optVal: any) => {
    if (onSelect) onSelect(optVal);
    if (onChange) onChange(optVal);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', height: '100%', ...style }}>
      {children ? (
        React.isValidElement(children) ? (
          React.cloneElement(children as React.ReactElement<any>, {
            value: value !== undefined ? value : (children as React.ReactElement<any>).props.value,
            onChange: (e: any) => {
              handleInputChange(e);
              (children as React.ReactElement<any>).props.onChange && (children as React.ReactElement<any>).props.onChange(e);
            },
            onFocus: (e: any) => {
              setOpen(true);
              (children as React.ReactElement<any>).props.onFocus && (children as React.ReactElement<any>).props.onFocus(e);
            },
          })
        ) : (
          children
        )
      ) : (
        <Input
          value={value}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          bordered={bordered}
          style={bordered === false ? { border: 'none', background: 'transparent', boxShadow: 'none', padding: 0 } : undefined}
          {...props}
        />
      )}
      {shouldRenderAuto && (
        <div
          ref={autoOverlayRef}
          className={`${autoAnimClass === 'enter' ? 'k-select-enter' : 'k-select-exit'}`}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: '#fff',
            border: '1px solid var(--antd-border)',
            borderRadius: 4,
            boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
            zIndex: 1000,
            maxHeight: 200,
            overflowY: 'auto',
            transformOrigin: 'top center',
          }}
        >
          {filtered.map((opt: any) => {
            const optVal = typeof opt === 'object' && opt.value !== undefined ? opt.value : opt;
            const optLabel = typeof opt === 'object' && opt.label !== undefined ? opt.label : optVal;
            return (
              <div
                key={String(optVal)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleOptionSelect(optVal);
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleOptionSelect(optVal);
                }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: '#212121',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f5f5')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span>{optLabel}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ==========================================
// 38. Timeline
// ==========================================
export const Timeline: React.FC<any> = ({ items = [] }) => {
  return (
    <div className="ant-timeline" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item: any, idx: number) => (
        <li key={idx} style={{ display: 'flex', gap: 16, paddingBottom: 20, position: 'relative' }}>
          {idx < items.length - 1 && (
            <div style={{ position: 'absolute', top: 16, left: 5, bottom: -4, width: 2, background: 'var(--antd-border)' }} />
          )}
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--antd-primary)', border: '2px solid #fff', marginTop: 4, zIndex: 1, flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 14 }}>
            {item.children}
          </div>
        </li>
      ))}
    </div>
  );
};

// ==========================================
// 39. Tabs
// ==========================================
export const Tabs: React.FC<any> = ({ items = [], activeKey, onChange, tabPosition = 'top', style, hideHeader }) => {
  const [localActiveKey, setLocalActiveKey] = useState(items[0]?.key);
  const currentKey = activeKey !== undefined ? activeKey : localActiveKey;
  const listRef = useRef<HTMLDivElement>(null);
  const [inkStyle, setInkStyle] = useState<React.CSSProperties>({});

  const handleTabClick = (key: string) => {
    if (onChange) onChange(key);
    else setLocalActiveKey(key);
  };

  const isLeft = tabPosition === 'left';

  useEffect(() => {
    const updateInk = () => {
      const activeEl = listRef.current?.querySelector('.ant-tabs-tab-active') as HTMLElement;
      if (activeEl) {
        if (isLeft) {
          setInkStyle({
            position: 'absolute',
            top: activeEl.offsetTop,
            height: activeEl.offsetHeight,
            right: 0,
            width: 2,
          });
        } else {
          setInkStyle({
            position: 'absolute',
            left: activeEl.offsetLeft,
            width: activeEl.offsetWidth,
            bottom: 0,
            height: 2,
          });
        }
      }
    };

    updateInk();
    const timer = setTimeout(updateInk, 0); // extra layout recalculation pass

    window.addEventListener('resize', updateInk);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateInk);
    };
  }, [currentKey, isLeft, items]);

  return (
    <div
      className={`ant-tabs ant-tabs-${tabPosition}`}
      style={{
        display: isLeft ? 'flex' : hideHeader ? 'flex' : 'block',
        flexDirection: hideHeader ? 'column' : isLeft ? 'row' : undefined,
        height: hideHeader ? '100%' : undefined,
        ...style
      }}
    >
      {!hideHeader && (
        <div
          className="ant-tabs-nav"
          style={{
            display: 'flex',
            flexDirection: isLeft ? 'column' : 'row',
            borderBottom: 'none',
            borderRight: 'none',
            paddingBottom: isLeft ? 0 : 8,
            paddingRight: isLeft ? 12 : 0,
            marginRight: isLeft ? 16 : 0,
          }}
        >
          <div className="ant-tabs-nav-wrap">
            <div
              ref={listRef}
              className="ant-tabs-nav-list"
              style={{
                display: 'flex',
                gap: 8,
                flexDirection: isLeft ? 'column' : 'row',
                position: 'relative',
              }}
            >
              {items.map((tab: any) => {
                if (!tab) return null;
                const isActive = tab.key === currentKey;
                return (
                  <div
                    key={tab.key}
                    onClick={() => !tab.disabled && handleTabClick(tab.key)}
                    className={`ant-tabs-tab ${isActive ? 'ant-tabs-tab-active' : ''} ${tab.disabled ? 'ant-tabs-tab-disabled' : ''}`}
                  >
                    <button type="button" disabled={tab.disabled} role="tab" className="ant-tabs-tab-btn" style={{ background: 'transparent', border: 'none', cursor: tab.disabled ? 'not-allowed' : 'pointer', outline: 'none' }}>
                      {tab.label}
                    </button>
                  </div>
                );
              })}
              <div className="ant-tabs-ink-bar" style={inkStyle} />
            </div>
          </div>
        </div>
      )}
      <div className="ant-tabs-content-holder" style={hideHeader ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : undefined}>
        <div className="ant-tabs-content" style={{ flex: 1, minHeight: 0, padding: hideHeader ? 0 : '6px 0', ...(hideHeader ? { display: 'flex', flexDirection: 'column', height: '100%' } : {}) }}>
          {items.find((tab: any) => tab && tab.key === currentKey)?.children}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 40. Upload
// ==========================================
export type FileUploadDialogProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (files: File[]) => void | Promise<void>;
  title?: string;
  accept?: string;
  multiple?: boolean;
  confirmText?: string;
};

interface FileExplorerItem {
  key: string;
  name: string;
  type: 'dir' | 'file';
  size: string;
  modified: string;
  owner?: string;
  group?: string;
  permission?: string;
  mime?: string;
  nativeFile?: File;
}

const DEFAULT_FS_EXPLORER: Record<string, FileExplorerItem[]> = {
  '/': [],
};

export const FileUploadDialog: React.FC<FileUploadDialogProps> = ({
  open,
  onClose,
  onSelect,
  title = 'Chọn tệp để tải lên',
  accept,
  multiple = true,
  confirmText = 'Chọn tệp',
}) => {
  const localInputRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState<string[]>(['/']);
  const [pathIds, setPathIds] = useState<Array<string | null>>([null]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedItems, setSelectedItems] = useState<FileExplorerItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [fs, setFs] = useState<Record<string, FileExplorerItem[]>>(DEFAULT_FS_EXPLORER);
  const [isVirtualEmployeeRoot, setIsVirtualEmployeeRoot] = useState(false);
  const [virtualRootLabel, setVirtualRootLabel] = useState('');
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [pathInput, setPathInput] = useState('');

  const currentPathStr = path.length === 1 ? '/' : '/' + path.slice(1).join('/');
  const currentDisplayPath = currentPathStr;
  const currentDirectoryId = pathIds[pathIds.length - 1] || null;

  const loadDirectory = React.useCallback(async (directoryId: string | null, pathKey: string) => {
    try {
      const res = await filesApi.list(directoryId, false);
      const payload = res.data;
      const listed: FileExplorerItem[] = (payload?.data || []).map((node: any) => ({
        key: node.id,
        name: node.name,
        type: node.type,
        size: node.type === 'dir' ? '—' : formatFileSize(node.sizeBytes),
        modified: node.modified,
        owner: node.owner,
        group: node.group,
        permission: node.permission,
        mime: node.mime,
      }));
      setFs(prev => ({ ...prev, [pathKey]: listed }));
      if (!directoryId && payload?.context) {
        setIsVirtualEmployeeRoot(payload.context.isVirtualEmployeeRoot);
        setVirtualRootLabel(payload.context.rootLabel || '');
        setPathIds(prev => prev.length === 1 && prev[0] === null ? [payload.context.parentId] : prev);
      }
    } catch (err) {}
  }, []);

  useEffect(() => {
    if (open) {
      setSelectedItems([]);
      setSearchQuery('');
      setPath(['/']);
      setPathIds([null]);
      void loadDirectory(null, '/');
    }
  }, [open, loadDirectory]);

  const currentEntries = fs[currentPathStr] || [];

  const filteredEntries = React.useMemo(() => {
    let list = currentEntries;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(item => (item.name || '').toLowerCase().includes(q));
    }
    if (accept && accept.trim() && accept !== '*/*') {
      const exts = accept.split(',').map(e => e.trim().toLowerCase());
      list = list.filter(item => {
        if (item.type === 'dir') return true;
        const name = (item.name || '').toLowerCase();
        return exts.some(ext => {
          if (ext.startsWith('.')) return name.endsWith(ext);
          if (ext.includes('/*')) {
            const group = ext.replace('/*', '');
            if (group === 'image') return name.match(/\.(png|jpe?g|gif|webp|svg|bmp|tiff?|avif|heic|heif|ico)$/i);
            if (group === 'video') return name.match(/\.(mp4|mkv|webm|avi)$/i);
            if (group === 'audio') return name.match(/\.(mp3|wav|ogg|m4a)$/i);
          }
          return false;
        });
      });
    }
    return list;
  }, [currentEntries, searchQuery, accept]);

  const handleSelectAll = (checked: boolean) => {
    const selectable = filteredEntries.filter(i => i.type === 'file');
    if (!checked) {
      setSelectedItems(prev => prev.filter(s => !selectable.some(i => i.key === s.key)));
    } else {
      setSelectedItems(prev => {
        const remaining = selectable.filter(i => !prev.some(s => s.key === i.key));
        return [...prev, ...remaining];
      });
    }
  };

  const handleOpenDir = (dirItem: FileExplorerItem) => {
    const newPathStr = path.length === 1 ? '/' + dirItem.name : '/' + path.slice(1).join('/') + '/' + dirItem.name;
    setPath(prev => [...prev, dirItem.name]);
    setPathIds(prev => [...prev, dirItem.key]);
    setSearchQuery('');
    void loadDirectory(dirItem.key, newPathStr);
  };

  const handleBreadcrumbClick = (i: number) => {
    const newPath = path.slice(0, i + 1);
    const newPathIds = pathIds.slice(0, i + 1);
    setPath(newPath);
    setPathIds(newPathIds);
    setSearchQuery('');
    const targetPathStr = i === 0 ? '/' : '/' + newPath.slice(1).join('/');
    const targetDirId = newPathIds[newPathIds.length - 1] || null;
    void loadDirectory(targetDirId, targetPathStr);
  };

  const handleGoBack = () => {
    if (path.length > 1) {
      const newPath = path.slice(0, -1);
      const newPathIds = pathIds.slice(0, -1);
      setPath(newPath);
      setPathIds(newPathIds);
      setSearchQuery('');
      const targetPathStr = newPath.length === 1 ? '/' : '/' + newPath.slice(1).join('/');
      const targetDirId = newPathIds[newPathIds.length - 1] || null;
      void loadDirectory(targetDirId, targetPathStr);
    }
  };

  const handlePathInputSubmit = (inputVal: string) => {
    setIsEditingPath(false);
    const trimmed = (inputVal || '').trim();
    if (!trimmed || trimmed === '/') {
      setPath(['/']);
      setPathIds([null]);
      setSearchQuery('');
      void loadDirectory(null, '/');
      return;
    }

    const parts = trimmed.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (parts.length === 0) {
      setPath(['/']);
      setPathIds([null]);
      setSearchQuery('');
      void loadDirectory(null, '/');
      return;
    }

    let currentKey: string | null = null;
    const newPath = ['/'];
    const newPathIds: Array<string | null> = [null];

    for (let idx = 0; idx < parts.length; idx++) {
      const partName = parts[idx];
      const checkPathStr = idx === 0 ? '/' : '/' + parts.slice(0, idx).join('/');
      const dirEntries = fs[checkPathStr] || [];
      const found = dirEntries.find(d => d.type === 'dir' && (d.name || '').toLowerCase() === (partName || '').toLowerCase());
      if (found) {
        newPath.push(found.name);
        newPathIds.push(found.key);
        currentKey = found.key;
      } else {
        newPath.push(partName);
        newPathIds.push(null);
      }
    }

    setPath(newPath);
    setPathIds(newPathIds);
    setSearchQuery('');
    const finalPathStr = '/' + parts.join('/');
    void loadDirectory(currentKey, finalPathStr);
  };

  const handleToggleSelect = (item: FileExplorerItem) => {
    if (item.type === 'dir') {
      handleOpenDir(item);
      return;
    }
    if (multiple) {
      const exists = selectedItems.some(i => i.key === item.key);
      if (exists) {
        setSelectedItems(selectedItems.filter(i => i.key !== item.key));
      } else {
        setSelectedItems([...selectedItems, item]);
      }
    } else {
      setSelectedItems([item]);
    }
  };

  const [isDialogDragging, setIsDialogDragging] = useState(false);
  const dialogDragCounterRef = useRef(0);

  const handleDialogDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dialogDragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDialogDragging(true);
    }
  };

  const handleDialogDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDialogDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dialogDragCounterRef.current -= 1;
    if (dialogDragCounterRef.current === 0) {
      setIsDialogDragging(false);
    }
  };

  const handleDialogDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDialogDragging(false);
    dialogDragCounterRef.current = 0;

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;

    const newItems: FileExplorerItem[] = files.map(file => {
      return {
        key: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        type: 'file',
        size: formatFileSize(file.size),
        modified: new Date().toLocaleString('vi-VN', { hour12: false }),
        owner: 'user.local',
        group: 'users',
        permission: '-rw-r--r--',
        mime: file.type || undefined,
        nativeFile: file,
      };
    });

    if (multiple) {
      setSelectedItems(prev => [...prev, ...newItems]);
    } else {
      setSelectedItems([newItems[0]]);
    }
  };

  const handleLocalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newItems: FileExplorerItem[] = files.map(file => {
      return {
        key: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        type: 'file',
        size: formatFileSize(file.size),
        modified: new Date().toLocaleString('vi-VN', { hour12: false }),
        owner: 'user.local',
        group: 'users',
        permission: '-rw-r--r--',
        mime: file.type || undefined,
        nativeFile: file,
      };
    });

    if (multiple) {
      setSelectedItems(prev => [...prev, ...newItems]);
    } else {
      setSelectedItems([newItems[0]]);
    }
    if (localInputRef.current) localInputRef.current.value = '';
  };

  const handleConfirm = async () => {
    if (!selectedItems.length || submitting) return;
    setSubmitting(true);
    try {
      const resolvedFiles: File[] = [];
      for (const item of selectedItems) {
        if (item.nativeFile) {
          resolvedFiles.push(item.nativeFile);
        } else {
          try {
            const res = await filesApi.download(item.key);
            const blob = res.data;
            const mime = item.mime || blob.type || 'application/octet-stream';
            const file = new File([blob], item.name, { type: mime, lastModified: Date.now() });
            resolvedFiles.push(file);
          } catch {
            const mime = item.mime || (
              item.name.endsWith('.pdf') ? 'application/pdf'
              : item.name.match(/\.docx?$/i) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : item.name.match(/\.xlsx?$/i) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              : item.name.match(/\.(png|jpe?g|webp|gif)$/i) ? 'image/jpeg'
              : 'text/plain'
            );
            const dummyContent = `Tài liệu: ${item.name}\nKích thước: ${item.size}\nNgày tạo: ${item.modified}`;
            const blob = new Blob([dummyContent], { type: mime });
            const file = new File([blob], item.name, { type: mime, lastModified: Date.now() });
            resolvedFiles.push(file);
          }
        }
      }
      await onSelect(resolvedFiles);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const allFilesSelected = filteredEntries.filter(i => i.type === 'file').length > 0 &&
    filteredEntries.filter(i => i.type === 'file').every(i => selectedItems.some(s => s.key === i.key));

  return (
    <Modal
      open={open}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: '#1E293B' }}>
          <FolderOutlined style={{ color: '#0078d4', fontSize: 18 }} />
          <span>{title}</span>
        </div>
      }
      width="95vw"
      style={{ top: 20, maxWidth: '1400px' }}
      onCancel={onClose}
      bodyStyle={{ padding: 0, height: '70vh', minHeight: '540px', display: 'flex', flexDirection: 'column', overflowY: 'hidden' }}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', flex: 1, marginRight: 16 }}>
            <span style={{ fontSize: 13, color: '#475569', fontWeight: 500, whiteSpace: 'nowrap' }}>
              {selectedItems.length ? `Đã chọn (${selectedItems.length}):` : 'Chưa chọn tệp nào'}
            </span>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', maxWidth: '65vw' }}>
              {selectedItems.map(item => (
                <span
                  key={item.key}
                  style={{
                    fontSize: 12,
                    background: '#CCE8FF',
                    color: '#005A9E',
                    border: '1px solid #99D1FF',
                    borderRadius: 4,
                    padding: '2px 8px',
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{item.name}</span>
                  <span style={{ color: '#64748B', fontSize: 11 }}>({item.size})</span>
                  <span
                    style={{ cursor: 'pointer', fontWeight: 'bold', fontSize: 14, color: '#D13438', marginLeft: 2 }}
                    onClick={() => setSelectedItems(selectedItems.filter(i => i.key !== item.key))}
                  >
                    ×
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Button onClick={onClose}>Hủy</Button>
            <Button
              type="primary"
              disabled={!selectedItems.length || submitting}
              loading={submitting}
              onClick={() => void handleConfirm()}
              style={{ background: '#0078d4' }}
            >
              {confirmText}{selectedItems.length ? ` (${selectedItems.length})` : ''}
            </Button>
          </div>
        </div>
      }
    >
      <input
        ref={localInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: 'none' }}
        onChange={handleLocalFileChange}
      />

      <div
        className="win11-frame"
        onDragEnter={handleDialogDragEnter}
        onDragOver={handleDialogDragOver}
        onDragLeave={handleDialogDragLeave}
        onDrop={handleDialogDrop}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', height: '100%', border: 'none', borderRadius: 0, position: 'relative' }}
      >
        {/* Drag & Drop Visual Overlay */}
        {isDialogDragging && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1000,
              background: 'rgba(224, 242, 241, 0.92)',
              backdropFilter: 'blur(3px)',
              border: '2px dashed #009688',
              borderRadius: '6px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(0, 150, 136, 0.25)',
              }}
            >
              <UploadOutlined style={{ fontSize: 32, color: '#009688' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#00796B', margin: '0 0 4px 0' }}>
                Thả tệp tin vào đây để tự động thêm & chọn
              </p>
              <p style={{ fontSize: 12.5, color: '#004D40', margin: 0 }}>
                Hỗ trợ chọn nhiều tệp tin cùng lúc
              </p>
            </div>
          </div>
        )}

        {/* Command Bar - 100% Identical to Files.tsx */}
        <div className="win11-cmd-bar">
          <div className="win11-cmd-group">
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'new-file',
                    icon: <FileTextOutlined style={{ color: '#0F6CBD', fontSize: 15 }} />,
                    label: 'Tệp tin trống',
                    onClick: () => {
                      const key = `file-${Date.now()}`;
                      const newItem: FileExplorerItem = {
                        key,
                        name: 'Tep_Tin_Moi.txt',
                        type: 'file',
                        size: '0 KB',
                        modified: new Date().toLocaleString('vi-VN', { hour12: false }),
                        owner: 'admin.minh',
                        group: 'legal',
                        permission: '644',
                        mime: 'text/plain',
                      };
                      setFs(prev => ({
                        ...prev,
                        [currentPathStr]: [...(prev[currentPathStr] || []), newItem],
                      }));
                      setSelectedItems([newItem]);
                    },
                  },
                  {
                    key: 'new-folder',
                    icon: <FolderOutlined style={{ color: '#FF9800', fontSize: 15 }} />,
                    label: 'Thư mục',
                    onClick: () => {
                      const key = `dir-${Date.now()}`;
                      const newItem: FileExplorerItem = {
                        key,
                        name: 'Thu_Muc_Moi',
                        type: 'dir',
                        size: '0 MB',
                        modified: new Date().toLocaleString('vi-VN', { hour12: false }),
                        owner: 'admin.minh',
                        group: 'legal',
                        permission: '755',
                      };
                      setFs(prev => ({
                        ...prev,
                        [currentPathStr]: [...(prev[currentPathStr] || []), newItem],
                      }));
                    },
                  },
                  { type: 'divider' as const },
                  {
                    key: 'upload-file',
                    icon: <UploadOutlined style={{ color: '#009688', fontSize: 15 }} />,
                    label: 'Tải lên',
                    onClick: () => localInputRef.current?.click(),
                  },
                ],
              }}
              placement="bottomLeft"
            >
              <button className="win11-cmd-btn">
                <PlusOutlined style={{ color: '#0078d4' }} /> Mới
              </button>
            </Dropdown>
          </div>
          <div className="win11-cmd-group">
            <button className="win11-cmd-btn disabled"><ScissorOutlined /> Cắt</button>
            <button className="win11-cmd-btn disabled"><CopyOutlined /> Sao chép</button>
            <button className="win11-cmd-btn disabled"><SnippetsOutlined /> Dán</button>
          </div>
          <div className="win11-cmd-group">
            <button className="win11-cmd-btn disabled"><EditOutlined /> Đổi tên</button>
            <button className="win11-cmd-btn disabled"><DeleteOutlined style={{ color: '#d13438' }} /> Xóa</button>
          </div>
          <div className="win11-cmd-group" style={{ borderRight: 'none', marginLeft: 'auto' }}>
            <button className="win11-cmd-btn"><EyeOutlined style={{ color: '#0078d4' }} /> Hiển thị</button>
            <Segmented
              options={[
                { label: <><UnorderedListOutlined /> Danh sách</>, value: 'list' },
                { label: <><AppstoreOutlined /> Lưới</>, value: 'grid' },
              ]}
              value={viewMode}
              onChange={(v) => setViewMode(v as 'list' | 'grid')}
            />
          </div>
        </div>

        {/* Address Bar - 100% Identical to Files.tsx */}
        <div className="win11-address-bar">
          <button className="win11-nav-btn" onClick={handleGoBack} disabled={path.length <= 1} title="Quay lại"><ArrowLeftOutlined /></button>
          <button className="win11-nav-btn" disabled><ArrowRightOutlined /></button>

          <div
            className="win11-path-container"
            style={{ cursor: 'text', flex: 1, display: 'flex', alignItems: 'center' }}
            onClick={() => {
              setPathInput(currentDisplayPath);
              setIsEditingPath(true);
            }}
          >
            {isEditingPath ? (
              <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%' }}>
                <FolderOutlined style={{ color: '#FF9800', marginRight: 8, flexShrink: 0 }} />
                <input
                  autoFocus
                  value={pathInput}
                  onChange={e => setPathInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handlePathInputSubmit(pathInput);
                    else if (e.key === 'Escape') setIsEditingPath(false);
                  }}
                  onBlur={() => handlePathInputSubmit(pathInput)}
                  style={{
                    padding: 0,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    boxShadow: 'none',
                    height: '100%',
                    fontSize: 13,
                    color: '#202020',
                    width: '100%',
                  }}
                />
              </div>
            ) : (
              <>
                <FolderOutlined style={{ color: '#FF9800', marginRight: 8, flexShrink: 0 }} />
                <div style={{ display: 'flex', alignItems: 'center', height: '100%', overflow: 'hidden', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {path.map((p, i) => (
                    <React.Fragment key={i}>
                      <span
                        className="win11-breadcrumb-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBreadcrumbClick(i);
                        }}
                        style={{ cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}
                      >
                        {i === 0 ? '/' : p}
                      </span>
                      <span className="win11-breadcrumb-separator" style={{ margin: '0 4px', color: '#94A3B8' }}>
                        &gt;
                      </span>
                    </React.Fragment>
                  ))}
                </div>
                <div
                  style={{ flex: 1, height: '100%', cursor: 'text' }}
                  onClick={() => {
                    setPathInput(currentDisplayPath);
                    setIsEditingPath(true);
                  }}
                />
              </>
            )}
          </div>

          <input
            type="text"
            className="win11-search-input"
            placeholder="Tìm kiếm..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 8, outline: 'none' }}
          />
        </div>

        {/* Main Content Area */}
        <div className="win11-main" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {filteredEntries.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8', gap: 10 }}>
              <FolderOutlined style={{ fontSize: 52, color: '#CBD5E1' }} />
              <span style={{ fontSize: 14 }}>Thư mục trống hoặc không tìm thấy tệp phù hợp</span>
            </div>
          ) : viewMode === 'grid' ? (
            <div style={{ padding: '12px 16px', width: '100%', boxSizing: 'border-box' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(115px, 1fr))',
                  gap: '8px 12px',
                  width: '100%',
                }}
              >
                {filteredEntries.map(item => {
                  const isSelected = selectedItems.some(i => i.key === item.key);
                  const ext = item.name.split('.').pop()?.toLowerCase() || '';

                  let fileIcon = <FileOutlined style={{ fontSize: 46, color: '#64748B' }} />;
                  if (item.type === 'dir') {
                    fileIcon = <FolderOutlined style={{ fontSize: 46, color: '#F59E0B' }} />;
                  } else if (ext === 'pdf') {
                    fileIcon = <FilePdfOutlined style={{ fontSize: 46, color: '#E11D48' }} />;
                  } else if (['doc', 'docx'].includes(ext)) {
                    fileIcon = <FileWordOutlined style={{ fontSize: 46, color: '#2563EB' }} />;
                  } else if (['xls', 'xlsx', 'csv'].includes(ext)) {
                    fileIcon = <FileExcelOutlined style={{ fontSize: 46, color: '#16A34A' }} />;
                  } else if (['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'].includes(ext)) {
                    fileIcon = <FileImageOutlined style={{ fontSize: 46, color: '#8B5CF6' }} />;
                  } else if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) {
                    fileIcon = <FileZipOutlined style={{ fontSize: 46, color: '#D97706' }} />;
                  } else if (['txt', 'log', 'md', 'json', 'xml', 'yml', 'yaml'].includes(ext)) {
                    fileIcon = <FileTextOutlined style={{ fontSize: 46, color: '#009688' }} />;
                  }

                  return (
                    <div
                      key={item.key}
                      className={`win11-grid-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleToggleSelect(item)}
                      onDoubleClick={() => {
                        if (item.type === 'dir') handleOpenDir(item);
                        else {
                          setSelectedItems([item]);
                          setTimeout(() => handleConfirm(), 50);
                        }
                      }}
                      style={{
                        background: isSelected ? '#CCE8FF' : 'transparent',
                        border: isSelected ? '1px solid #99D1FF' : '1px solid transparent',
                        borderRadius: '4px',
                        padding: '6px 4px',
                        textAlign: 'center',
                        cursor: 'default',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        height: '115px',
                        boxSizing: 'border-box',
                        position: 'relative',
                        userSelect: 'none',
                      }}
                    >
                      <div style={{ margin: '4px 0' }}>{fileIcon}</div>
                      <span
                        style={{
                          fontSize: 12,
                          color: '#202020',
                          lineHeight: '14px',
                          maxHeight: '28px',
                          overflow: 'hidden',
                          wordBreak: 'break-word',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          width: '100%',
                        }}
                        title={item.name}
                      >
                        {item.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E5E7EB', color: '#64748B', height: 38, fontSize: 13, fontWeight: 600, background: '#FAFAFA' }}>
                    <th style={{ padding: '0 8px 0 16px', width: 36 }}>
                      <input
                        type="checkbox"
                        checked={allFilesSelected}
                        onChange={e => handleSelectAll(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th style={{ padding: '0 12px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        Tên <span style={{ fontSize: 10, color: '#94A3B8' }}>⇅</span>
                      </span>
                    </th>
                    <th style={{ padding: '0 12px', width: 100 }}>Loại</th>
                    <th style={{ padding: '0 12px', width: 120 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        Dung lượng <span style={{ fontSize: 10, color: '#94A3B8' }}>⇅</span>
                      </span>
                    </th>
                    <th style={{ padding: '0 12px', width: 130 }}>Chủ sở hữu</th>
                    <th style={{ padding: '0 12px', width: 100 }}>Nhóm</th>
                    <th style={{ padding: '0 12px', width: 100 }}>Quyền hạn</th>
                    <th style={{ padding: '0 12px', width: 120 }}>Định dạng</th>
                    <th style={{ padding: '0 12px', width: 150 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        Chỉnh sửa <span style={{ fontSize: 10, color: '#94A3B8' }}>⇅</span>
                      </span>
                    </th>
                    <th style={{ padding: '0 12px', width: 85, textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map(item => {
                    const isSelected = selectedItems.some(i => i.key === item.key);
                    const ext = item.name.split('.').pop()?.toLowerCase() || '';
                    let formatStr = 'File folder';
                    if (item.type !== 'dir') {
                      formatStr = ext ? `${ext.toUpperCase()} File` : 'File';
                    }

                    const rowActionMenu = {
                      items: [
                        {
                          key: 'preview',
                          icon: <EyeOutlined style={{ fontSize: 14 }} />,
                          label: 'Xem trước',
                          onClick: () => {
                            if (item.type === 'dir') handleOpenDir(item);
                            else handleToggleSelect(item);
                          },
                        },
                        {
                          key: 'sign',
                          icon: <SafetyCertificateOutlined style={{ color: '#009688', fontSize: 14 }} />,
                          label: 'Ký số',
                          disabled: item.type === 'dir',
                          onClick: () => handleToggleSelect(item),
                        },
                        {
                          key: 'rename',
                          icon: <EditOutlined style={{ fontSize: 14 }} />,
                          label: 'Đổi tên',
                          onClick: () => {},
                        },
                        {
                          key: 'copy',
                          icon: <CopyOutlined style={{ fontSize: 14 }} />,
                          label: 'Sao chép',
                          onClick: () => {},
                        },
                        {
                          key: 'cut',
                          icon: <ScissorOutlined style={{ fontSize: 14 }} />,
                          label: 'Cắt',
                          onClick: () => {},
                        },
                        {
                          key: 'compress',
                          icon: <FileZipOutlined style={{ fontSize: 14 }} />,
                          label: 'Nén',
                          onClick: () => {},
                        },
                        {
                          key: 'permission',
                          icon: <InfoCircleOutlined style={{ fontSize: 14 }} />,
                          label: 'Phân quyền',
                          onClick: () => {},
                        },
                        { type: 'divider' as const },
                        {
                          key: 'download',
                          icon: <DownloadOutlined style={{ fontSize: 14 }} />,
                          label: 'Tải xuống',
                          disabled: item.type === 'dir',
                          onClick: () => {},
                        },
                        {
                          key: 'delete',
                          icon: <DeleteOutlined style={{ color: '#D13438', fontSize: 14 }} />,
                          label: 'Xóa',
                          danger: true,
                          onClick: () => {
                            setFs(prev => ({
                              ...prev,
                              [currentPathStr]: (prev[currentPathStr] || []).filter(i => i.key !== item.key),
                            }));
                            setSelectedItems(prev => prev.filter(i => i.key !== item.key));
                          },
                        },
                      ],
                    };

                    return (
                      <tr
                        key={item.key}
                        onClick={() => handleToggleSelect(item)}
                        onDoubleClick={() => {
                          if (item.type === 'dir') handleOpenDir(item);
                          else {
                            setSelectedItems([item]);
                            setTimeout(() => handleConfirm(), 50);
                          }
                        }}
                        style={{
                          borderBottom: '1px solid #F3F4F6',
                          height: 38,
                          cursor: 'pointer',
                          backgroundColor: isSelected ? '#CCE8FF' : 'transparent',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba';
                        }}
                        onMouseLeave={e => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <td style={{ padding: '0 8px 0 16px', width: 36 }} onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={item.type === 'dir'}
                            onChange={() => handleToggleSelect(item)}
                            style={{ cursor: item.type === 'dir' ? 'default' : 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, height: 38 }}>
                          {item.type === 'dir' ? (
                            <FolderOutlined style={{ color: '#FF9800', fontSize: 16 }} />
                          ) : (
                            <FileOutlined style={{ color: '#999', fontSize: 16 }} />
                          )}
                          <span style={{ color: item.type === 'dir' ? '#009688' : '#333', fontWeight: item.type === 'dir' ? 600 : 400 }}>
                            {item.name}
                          </span>
                        </td>
                        <td style={{ padding: '0 12px' }}>
                          <span style={{
                            background: item.type === 'dir' ? '#FFF7ED' : '#F1F5F9',
                            border: item.type === 'dir' ? '1px solid #FED7AA' : '1px solid #E2E8F0',
                            color: item.type === 'dir' ? '#EA580C' : '#475569',
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontSize: 12,
                          }}>
                            {item.type === 'dir' ? 'Thư mục' : 'Tệp'}
                          </span>
                        </td>
                        <td style={{ padding: '0 12px', color: '#475569', fontSize: 12.5 }}>
                          {item.size}
                        </td>
                        <td style={{ padding: '0 12px', fontSize: 12.5, color: '#333' }}>
                          {item.owner || 'admin.minh'}
                        </td>
                        <td style={{ padding: '0 12px', fontSize: 12.5, color: '#333' }}>
                          {item.group || 'legal'}
                        </td>
                        <td style={{ padding: '0 12px', fontSize: 12, color: '#475569', fontFamily: 'monospace' }}>
                          {item.permission || '644'}
                        </td>
                        <td style={{ padding: '0 12px', fontSize: 12, color: '#64748B' }}>
                          {formatStr}
                        </td>
                        <td style={{ padding: '0 12px', fontSize: 12, color: '#475569' }}>
                          {item.modified}
                        </td>
                        <td style={{ padding: '0 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'inline-flex', gap: 4 }}>
                            <Dropdown
                              menu={rowActionMenu}
                              placement="bottomRight"
                            >
                              <button
                                style={{
                                  width: 22,
                                  height: 22,
                                  border: '1px solid #D9D9D9',
                                  background: '#FFF',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  padding: 0,
                                }}
                              >
                                <DownOutlined style={{ fontSize: 9, color: '#666' }} />
                              </button>
                            </Dropdown>
                            <button
                              onClick={() => {
                                setFs(prev => ({
                                  ...prev,
                                  [currentPathStr]: (prev[currentPathStr] || []).filter(i => i.key !== item.key),
                                }));
                                setSelectedItems(prev => prev.filter(i => i.key !== item.key));
                              }}
                              style={{
                                width: 22,
                                height: 22,
                                border: '1px solid #FFCCC7',
                                background: '#FFF',
                                borderRadius: 4,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 0,
                              }}
                            >
                              <DeleteOutlined style={{ fontSize: 11, color: '#FF4D4F' }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export interface UploadProps {
  children?: React.ReactNode;
  customRequest?: (options: { file: File; onSuccess: (value?: any) => void; onError: (error: any) => void }) => void;
  onChange?: (info: { file: File; fileList: File[] }) => void;
  beforeUpload?: (file: File, files: File[]) => boolean | Promise<boolean>;
  maxCount?: number;
  showUploadList?: boolean;
  accept?: string;
  multiple?: boolean;
}

export const Upload: React.FC<UploadProps> & { Dragger: React.FC<any> } = (({ children, customRequest, onChange, beforeUpload, maxCount, accept, multiple }) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const processFiles = async (files: File[]) => {
    const selected = maxCount ? files.slice(0, maxCount) : files;
    for (const file of selected) {
      if (beforeUpload) {
        const allowed = await beforeUpload(file, selected);
        if (allowed === false) continue;
      }
      if (customRequest) {
        customRequest({
          file,
          onSuccess: () => onChange && onChange({ file, fileList: [file] }),
          onError: (err: any) => console.error(err),
        });
      } else {
        onChange && onChange({ file, fileList: [file] });
      }
    }
  };

  return <><div onClick={() => setPickerOpen(true)} style={{ display: 'inline-block' }}>{children}</div><FileUploadDialog open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={processFiles} accept={accept} multiple={multiple ?? (maxCount ? maxCount > 1 : true)} /></>;
}) as any;

const UploadDragger: React.FC<any> = ({ children, onChange, beforeUpload, maxCount, accept, multiple, style }) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const processFiles = async (files: File[]) => {
    const selected = maxCount ? files.slice(0, maxCount) : files;
    for (const file of selected) {
      if (beforeUpload) {
        const allowed = await beforeUpload(file, selected);
        if (allowed === false) continue;
      }
      onChange && onChange({ file, fileList: [file] });
    }
  };

  return <><div onClick={() => setPickerOpen(true)} style={{ border: '2px dashed #CBD5E1', borderRadius: 8, padding: '20px 16px', textAlign: 'center', background: '#FAFAFA', cursor: 'pointer', transition: 'all 0.2s', ...style }}>{children}</div><FileUploadDialog open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={processFiles} accept={accept} multiple={multiple ?? (maxCount ? maxCount > 1 : true)} /></>;
};

Upload.Dragger = UploadDragger;

// ==========================================
// 41. message
// ==========================================
let messageContainer: HTMLDivElement | null = null;
const activeMessages = new Map<string | number, HTMLDivElement>();
let msgId = 0;

const createMessage = (
  content: any,
  type: 'success' | 'error' | 'warning' | 'info' | 'loading',
  explicitDuration?: number,
): Promise<void> => {
  let contentText = '';
  let msgKey: string | number | undefined = undefined;
  let duration = explicitDuration ?? 3;

  if (typeof content === 'object' && content !== null) {
    contentText = content.content || '';
    msgKey = content.key;
    if (typeof content.duration === 'number') {
      duration = content.duration;
    }
  } else {
    contentText = String(content);
  }

  if (!messageContainer) {
    messageContainer = document.createElement('div');
    messageContainer.style.position = 'fixed';
    messageContainer.style.top = '20px';
    messageContainer.style.left = '50%';
    messageContainer.style.transform = 'translateX(-50%)';
    messageContainer.style.zIndex = '999999';
    messageContainer.style.display = 'flex';
    messageContainer.style.flexDirection = 'column';
    messageContainer.style.alignItems = 'center';
    messageContainer.style.gap = '10px';
    messageContainer.style.pointerEvents = 'none';
    messageContainer.style.width = 'max-content';
    messageContainer.style.maxWidth = 'calc(100vw - 32px)';
    document.body.appendChild(messageContainer);
  }

  // Prevent duplicate toast spamming (e.g. 10 identical error popups stacking)
  const existingSameMsg = Array.from(messageContainer.children).find((child: any) => {
    return child.dataset && child.dataset.msgType === type && child.dataset.msgContent === contentText;
  }) as HTMLDivElement | undefined;

  let msgEl: HTMLDivElement;
  let isUpdate = false;

  if (existingSameMsg) {
    msgEl = existingSameMsg;
    isUpdate = true;
  } else if (msgKey !== undefined && activeMessages.has(msgKey)) {
    msgEl = activeMessages.get(msgKey)!;
    isUpdate = true;
  } else {
    msgEl = document.createElement('div');
    msgEl.style.background = '#fff';
    msgEl.style.padding = '9px 16px';
    msgEl.style.borderRadius = '8px';
    msgEl.style.border = '1px solid rgba';
    msgEl.style.boxShadow = '0 8px 24px rgba, 0 2px 6px rgba';
    msgEl.style.display = 'inline-flex';
    msgEl.style.alignItems = 'center';
    msgEl.style.justifyContent = 'center';
    msgEl.style.gap = '8px';
    msgEl.style.fontSize = '14px';
    msgEl.style.width = 'fit-content';
    msgEl.style.maxWidth = 'min(500px, calc(100vw - 32px))';
    msgEl.style.boxSizing = 'border-box';
    msgEl.style.pointerEvents = 'auto';
    msgEl.style.transition = 'all 0.3s cubic-bezier';
    msgEl.style.transform = 'translateY';
    msgEl.style.opacity = '0';
  }

  let iconSvg = '';
  let color = '';

  if (type === 'success') {
    iconSvg = `<svg viewBox="64 64 896 896" width="16" height="16" fill="currentColor" style="display: inline-block; vertical-align: middle;"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm193.5 301.7l-210.6 292a31.8 31.8 0 01-51.7 0L318.5 484.9c-3.8-5.3 0-12.7 6.5-12.7h46.9c10.2 0 19.9 4.9 25.9 13.3l71.2 98.8 157.2-218c6-8.3 15.6-13.3 25.9-13.3H699c6.5 0 10.3 7.4 6.5 12.7z"></path></svg>`;
    color = 'var(--antd-success, #52c41a)';
  } else if (type === 'error') {
    iconSvg = `<svg viewBox="64 64 896 896" width="16" height="16" fill="currentColor" style="display: inline-block; vertical-align: middle;"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm165.4 618.2l-60.6 60.6L512 638.1 407.2 742.8l-60.6-60.6L451.3 577 346.6 472.2l60.6-60.6L512 515.9l104.8-104.7 60.6 60.6L572.7 577l104.7 104.8z"></path></svg>`;
    color = 'var(--antd-danger, #ff4d4f)';
  } else if (type === 'warning') {
    iconSvg = `<svg viewBox="64 64 896 896" width="16" height="16" fill="currentColor" style="display: inline-block; vertical-align: middle;"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm-32 232c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v328c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V296zm32 440a48.01 48.01 0 010-96 48.01 48.01 0 010 96z"></path></svg>`;
    color = 'var(--antd-warning, #faad14)';
  } else if (type === 'loading') {
    iconSvg = `<svg viewBox="0 0 1024 1024" width="16" height="16" fill="currentColor" style="display: inline-block; vertical-align: middle; animation: spin 1s infinite linear;" class="anticon-spin"><path d="M988 548c-19.9 0-36-16.1-36-36 0-226.2-184-410.2-410.2-410.2-19.9 0-36-16.1-36-36s16.1-36 36-36c265.9 0 482.2 216.3 482.2 482.2 0 19.9-16.1 36-36 36z"></path></svg>`;
    color = 'var(--antd-primary, #009688)';
  } else {
    iconSvg = `<svg viewBox="64 64 896 896" width="16" height="16" fill="currentColor" style="display: inline-block; vertical-align: middle;"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm32 664c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V456c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v272zm-32-344a48.01 48.01 0 010-96 48.01 48.01 0 010 96z"></path></svg>`;
    color = 'var(--antd-primary, #009688)';
  }

  msgEl.dataset.msgType = type;
  msgEl.dataset.msgContent = contentText;

  msgEl.innerHTML = `
    <span style="color: ${color}; display: inline-flex; align-items: center;">${iconSvg}</span>
    <span style="color: var(--antd-text); font-weight: normal;">${contentText}</span>
  `;

  if (!isUpdate) {
    messageContainer.appendChild(msgEl);
    setTimeout(() => {
      msgEl.style.transform = 'translateY';
      msgEl.style.opacity = '1';
    }, 10);
  } else {
    msgEl.style.transform = 'scale';
    setTimeout(() => {
      msgEl.style.transform = 'scale(1)';
    }, 120);
    msgEl.style.opacity = '1';
  }

  if (msgKey !== undefined) {
    activeMessages.set(msgKey, msgEl);
  }

  const oldTimeout = (msgEl as any).timeoutId;
  if (oldTimeout) {
    clearTimeout(oldTimeout);
  }

  return new Promise((resolve) => {
    const removeMsg = () => {
    msgEl.style.transform = 'translateY';
    msgEl.style.opacity = '0';
    setTimeout(() => {
      msgEl.remove();
      if (msgKey !== undefined) {
        activeMessages.delete(msgKey);
      }
        resolve();
    }, 300);
    };

    if (duration > 0) {
      (msgEl as any).timeoutId = setTimeout(removeMsg, duration * 1000);
    }
  });
};

export const message = {
  success: (content: any, duration?: number) => createMessage(content, 'success', duration),
  error: (content: any, duration?: number) => createMessage(content, 'error', duration),
  warning: (content: any, duration?: number) => createMessage(content, 'warning', duration),
  info: (content: any, duration?: number) => createMessage(content, 'info', duration),
  loading: (content: any, duration?: number) => createMessage(content, 'loading', duration),
};

// ==========================================
// 42. Row & Col
// ==========================================
export const RowContext = createContext<{ gutter?: [number, number] }>({});

export const Row: React.FC<any> = ({
  children,
  gutter = 0,
  align,
  justify,
  style,
  className = '',
}) => {
  const gutterVal: [number, number] = Array.isArray(gutter)
    ? [gutter[0] ?? 0, gutter[1] ?? gutter[0] ?? 0]
    : typeof gutter === 'number'
      ? [gutter, gutter]
      : [0, 0];

  const flexAlign = align === 'middle' ? 'center' : align;
  const flexJustify = justify === 'start' || justify === 'end' ? `flex-${justify}` : justify;

  return (
    <RowContext.Provider value={{ gutter: gutterVal }}>
      <div
        className={`ant-row ${className}`}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          marginLeft: -gutterVal[0] / 2,
          marginRight: -gutterVal[0] / 2,
          rowGap: gutterVal[1],
          alignItems: flexAlign,
          justifyContent: flexJustify,
          ...style,
        }}
      >
        {children}
      </div>
    </RowContext.Provider>
  );
};

export const Col: React.FC<any> = ({
  children,
  span,
  xs,
  sm,
  md,
  lg,
  xl,
  xxl,
  style,
  className = '',
}) => {
  const { gutter } = useContext(RowContext);
  const paddingX = gutter ? gutter[0] / 2 : 0;

  let widthPercent: string | undefined;
  if (span !== undefined) {
    widthPercent = `${(span / 24) * 100}%`;
  } else {
    // Basic media query width detection mock or just 100% width
    const screenVal = xxl || xl || lg || md || sm || xs;
    if (typeof screenVal === 'number') {
      widthPercent = `${(screenVal / 24) * 100}%`;
    }
  }

  return (
    <div
      className={`ant-col ${className}`}
      style={{
        boxSizing: 'border-box',
        paddingLeft: paddingX,
        paddingRight: paddingX,
        flex: widthPercent ? `0 0 ${widthPercent}` : '1',
        maxWidth: widthPercent,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// ==========================================
// 43. Collapse & Collapse.Panel
// ==========================================
interface CollapseProps {
  children?: React.ReactNode;
  activeKey?: string | string[];
  defaultActiveKey?: string | string[];
  onChange?: (key: string | string[]) => void;
  ghost?: boolean;
  style?: React.CSSProperties;
}

export const Collapse: React.FC<CollapseProps> & { Panel: React.FC<any> } = ({
  children,
  activeKey,
  defaultActiveKey,
  onChange,
  ghost,
  style,
}) => {
  const initKeys = activeKey !== undefined
    ? activeKey
    : defaultActiveKey !== undefined
      ? defaultActiveKey
      : [];

  const [keys, setKeys] = useState<string[]>(Array.isArray(initKeys) ? initKeys.map(String) : [String(initKeys)]);

  useEffect(() => {
    if (activeKey !== undefined) {
      setKeys(Array.isArray(activeKey) ? activeKey.map(String) : [String(activeKey)]);
    }
  }, [activeKey]);

  const togglePanel = (key: string) => {
    let nextKeys = [...keys];
    if (nextKeys.includes(key)) {
      nextKeys = nextKeys.filter((k) => k !== key);
    } else {
      nextKeys.push(key);
    }
    if (activeKey === undefined) {
      setKeys(nextKeys);
    }
    onChange && onChange(nextKeys);
  };

  return (
    <div className={`ant-collapse ${ghost ? 'ant-collapse-ghost' : ''}`} style={style}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          const panelKey = String(child.key || '');
          const isActive = keys.includes(panelKey);
          return React.cloneElement(child as React.ReactElement<any>, {
            isActive,
            onToggle: () => togglePanel(panelKey),
            ghost,
          });
        }
        return child;
      })}
    </div>
  );
};

Collapse.Panel = ({ header, children, isActive, onToggle, ghost, style }) => {
  return (
    <div
      className={`ant-collapse-item ${isActive ? 'ant-collapse-item-active' : ''}`}
      style={{
        borderBottom: ghost ? 'none' : '1px solid var(--antd-border)',
        ...style,
      }}
    >
      <div
        className="ant-collapse-header"
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          cursor: 'pointer',
          background: ghost ? 'transparent' : '#fafafa',
          fontWeight: 500,
          gap: 8,
          userSelect: 'none',
        }}
      >
        <span style={{ transition: 'transform 0.2s', transform: isActive ? 'rotate(90deg)' : 'none', fontSize: 10 }}>▶</span>
        <div style={{ flex: 1 }}>{header}</div>
      </div>
      {isActive && (
        <div
          className="ant-collapse-content"
          style={{
            padding: '16px',
            background: '#fff',
            borderTop: ghost ? 'none' : '1px solid var(--antd-border)',
          }}
        >
          <div className="ant-collapse-content-box">{children}</div>
        </div>
      )}
    </div>
  );
};

const RadioGroupContext = createContext<{ value?: any; onChange?: (e: any) => void; disabled?: boolean }>({});

export const RadioGroup: React.FC<{ value?: any; onChange?: (e: any) => void; disabled?: boolean; children?: React.ReactNode; style?: React.CSSProperties; optionType?: string; buttonStyle?: string }> = ({ value, onChange, disabled, children, style }) => {
  return (
    <RadioGroupContext.Provider value={{ value, onChange, disabled }}>
      <div className="ant-radio-group" style={{ display: 'inline-flex', gap: 16, ...style }}>
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            const radioChild = child as React.ReactElement<any>;
            const childProps = radioChild.props;
            return React.cloneElement(radioChild, {
              checked: String(value) === String(childProps.value),
              disabled: disabled || childProps.disabled,
              onChange: (e: any) => {
                onChange && onChange(e);
                childProps.onChange && childProps.onChange(e);
              }
            });
          }
          return child;
        })}
      </div>
    </RadioGroupContext.Provider>
  );
};

export const RadioButton: React.FC<{
  checked?: boolean;
  onChange?: (e: any) => void;
  disabled?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  value?: any;
}> = ({ checked, onChange, disabled, children, style, value }) => {
  const isChecked = !!checked;
  return (
    <label
      className={`ant-radio-button-wrapper ${isChecked ? 'ant-radio-button-wrapper-checked' : ''} ${disabled ? 'ant-radio-button-wrapper-disabled' : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 32,
        padding: '4px 12px',
        border: '1px solid var(--antd-border)',
        borderRadius: 6,
        background: isChecked ? '#E0F2F1' : '#FFFFFF',
        color: isChecked ? '#00796B' : '#475569',
        fontWeight: isChecked ? 700 : 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        gap: 6,
        opacity: disabled ? 0.65 : 1,
        ...style,
      }}
    >
      <input
        type="radio"
        checked={isChecked}
        disabled={disabled}
        onChange={(e) => onChange && onChange({ target: { checked: e.target.checked, value } })}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
      />
      {children}
    </label>
  );
};

interface RadioComponentType extends React.FC<{ checked?: boolean; onChange?: (e: any) => void; disabled?: boolean; children?: React.ReactNode; style?: React.CSSProperties; value?: any }> {
  Group: typeof RadioGroup;
  Button: typeof RadioButton;
}

export const Radio: RadioComponentType = Object.assign(
  (({ checked, onChange, disabled, children, style, value }: any) => {
    const isChecked = !!checked;
    return (
      <label className={`ant-radio-wrapper ${disabled ? 'ant-radio-wrapper-disabled' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', cursor: disabled ? 'not-allowed' : 'pointer', ...style }}>
        <span className={`ant-radio ${isChecked ? 'ant-radio-checked' : ''} ${disabled ? 'ant-radio-disabled' : ''}`}>
          <input
            type="radio"
            checked={isChecked}
            disabled={disabled}
            onChange={(e) => onChange && onChange({ target: { checked: e.target.checked, value } })}
            className="ant-radio-input"
          />
          <span className="ant-radio-inner" />
        </span>
        {children !== undefined && <span>{children}</span>}
      </label>
    );
  }) as any,
  {
    Group: RadioGroup,
    Button: RadioButton,
  }
);

// ==========================================
// 45. Steps
// ==========================================
interface StepItem {
  title: React.ReactNode;
  description?: React.ReactNode;
  status?: 'finish' | 'process' | 'wait';
}
interface StepsProps {
  current?: number;
  items?: StepItem[];
  style?: React.CSSProperties;
  className?: string;
  direction?: 'horizontal' | 'vertical' | string;
  size?: 'default' | 'small' | string;
}

export const Steps: React.FC<StepsProps> = ({ current = 0, items = [], style, className = '', direction = 'horizontal' }) => {
  return (
    <div className={`ant-steps ${className}`} style={{ display: 'flex', flexDirection: direction === 'vertical' ? 'column' : 'row', alignItems: direction === 'vertical' ? 'flex-start' : 'center', width: '100%', gap: 16, ...style }}>
      {items.map((item, idx) => {
        let status: 'finish' | 'process' | 'wait' = 'wait';
        if (item.status) {
          status = item.status;
        } else {
          if (idx < current) status = 'finish';
          else if (idx === current) status = 'process';
        }

        const isLast = idx === items.length - 1;

        return (
          <React.Fragment key={idx}>
            <div className={`ant-steps-item ant-steps-item-${status}`} style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div
                className="ant-steps-item-icon"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  fontWeight: 500,
                  transition: 'all 0.2s',
                  ...(status === 'finish' ? {
                    background: '#e0f2f1',
                    border: '1px solid #b2dfdb',
                    color: '#009688',
                  } : status === 'process' ? {
                    background: '#009688',
                    border: '1px solid #009688',
                    color: '#ffffff',
                  } : {
                    background: '#f5f5f5',
                    border: '1px solid #d9d9d9',
                    color: 'rgba(0, 0, 0, 0.45)',
                  })
                }}
              >
                {status === 'finish' ? (
                  <CheckOutlined style={{ fontSize: 12, fontWeight: 'bold' }} />
                ) : (
                  idx + 1
                )}
              </div>
              <div
                className="ant-steps-item-title"
                style={{
                  fontSize: 14,
                  fontWeight: status === 'process' ? 600 : 400,
                  color: status === 'wait' ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.88)',
                }}
              >
                {item.title}
              </div>
            </div>
            {!isLast && (
              <div
                className="ant-steps-item-tail"
                style={{
                  flex: 1,
                  height: 1,
                  background: status === 'finish' ? '#009688' : '#f0f0f0',
                  transition: 'background 0.2s',
                  minWidth: 40,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ==========================================
// 46. Popover
// ==========================================
export const Popover: React.FC<{
  title?: React.ReactNode;
  content?: React.ReactNode;
  open?: boolean;
  onClose?: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  arrow?: boolean;
}> = ({ title, content, open, onClose, children, style, placement = 'top', arrow = true }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeOpen = open !== undefined ? open : isOpen;
  const { shouldRender: shouldRenderPopover, animClass: popoverAnimClass, overlayRef: popoverOverlayRef } = useOverlayAnimation(activeOpen, 140);

  useEffect(() => {
    if (open !== undefined) setIsOpen(open);
  }, [open]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (open === undefined) setIsOpen(false);
        onClose && onClose();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open, onClose]);

  const toggle = () => {
    if (open === undefined) setIsOpen(!isOpen);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <div onClick={toggle} style={{ display: 'inline-block' }}>
        {children}
      </div>
      {shouldRenderPopover && (
        <div
          ref={popoverOverlayRef}
          className={`ant-popover ant-popover-placement-${placement} ${popoverAnimClass === 'enter' ? 'k-pop-enter' : 'k-pop-exit'}`}
          style={{
            position: 'absolute',
            ...(placement === 'top' ? { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 12 } : {}),
            ...(placement === 'bottom' ? { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 12 } : {}),
            background: '#ffffff',
            border: 'none',
            borderRadius: 8,
            boxShadow: '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12)',
            zIndex: 1050,
            minWidth: 180,
            padding: 0,
            color: 'rgba(0, 0, 0, 0.88)',
            ...style,
          }}
        >
          <div className="ant-popover-inner" style={{ padding: '12px 16px' }}>
            {title && (
              <div className="ant-popover-title" style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{title}</span>
                {onClose && (
                  <span onClick={(e) => { e.stopPropagation(); setIsOpen(false); onClose(); }} style={{ cursor: 'pointer', color: 'rgba(0,0,0,0.45)', fontWeight: 'normal', fontSize: 16 }}>×</span>
                )}
              </div>
            )}
            <div className="ant-popover-inner-content" style={{ fontSize: 14 }}>
              {content}
            </div>
          </div>
          {arrow && (
            <div
              className="ant-popover-arrow"
              style={{
                position: 'absolute',
                width: 8,
                height: 8,
                background: '#ffffff',
                transform: 'rotate(45deg)',
                boxShadow: placement === 'top' ? '2px 2px 5px rgba(0,0,0,0.03)' : '-1px -1px 3px rgba(0,0,0,0.03)',
                ...(placement === 'top' ? { bottom: -4, left: 'calc(50% - 4px)', borderRight: '1px solid rgba(0,0,0,0.05)', borderBottom: '1px solid rgba(0,0,0,0.05)' } : {}),
                ...(placement === 'bottom' ? { top: -4, left: 'calc(50% - 4px)', borderLeft: '1px solid rgba(0,0,0,0.05)', borderTop: '1px solid rgba(0,0,0,0.05)' } : {}),
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};

// ==========================================
// 47. Tour
// ==========================================
interface TourProps {
  open?: boolean;
  current?: number;
  onClose?: () => void;
  onChange?: (current: number) => void;
  steps: {
    title: React.ReactNode;
    description: React.ReactNode;
    cover?: React.ReactNode;
  }[];
  style?: React.CSSProperties;
}

export const Tour: React.FC<TourProps> = ({ open, current = 0, onClose, onChange, steps = [], style }) => {
  if (!open || steps.length === 0) return null;
  const step = steps[current] || steps[0];

  const handleNext = () => {
    if (current < steps.length - 1) {
      onChange && onChange(current + 1);
    } else {
      onClose && onClose();
    }
  };

  const handlePrev = () => {
    if (current > 0) {
      onChange && onChange(current - 1);
    }
  };

  return (
    <div className="ant-tour" style={{ position: 'fixed', zIndex: 1100, inset: 0, pointerEvents: 'none' }}>
      <div className="ant-tour-mask" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.15)', pointerEvents: 'auto' }} />
      <div className="ant-tour-step" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'auto' }}>
        <div
          className="ant-tour-inner"
          style={{
            background: '#ffffff',
            borderRadius: 8,
            boxShadow: '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12)',
            width: 350,
            padding: 16,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            ...style,
          }}
        >
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              border: 'none',
              background: 'transparent',
              fontSize: 16,
              cursor: 'pointer',
              color: 'rgba(0, 0, 0, 0.45)',
            }}
          >
            ×
          </button>

          {step.cover && <div className="ant-tour-cover">{step.cover}</div>}

          <div className="ant-tour-title" style={{ fontWeight: 600, fontSize: 16, color: 'rgba(0,0,0,0.88)', paddingRight: 24 }}>
            {step.title}
          </div>

          <div className="ant-tour-description" style={{ fontSize: 14, color: 'rgba(0, 0, 0, 0.88)', lineHeight: 1.57 }}>
            {step.description}
          </div>

          <div className="ant-tour-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <div className="ant-tour-sliders" style={{ display: 'flex', gap: 6 }}>
              {steps.map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: idx === current ? '#009688' : 'rgba(0, 0, 0, 0.15)',
                    transition: 'all 0.2s',
                  }}
                />
              ))}
            </div>
            <div className="ant-tour-buttons" style={{ display: 'flex', gap: 8 }}>
              {current > 0 && (
                <Button size="small" onClick={handlePrev}>
                  Previous
                </Button>
              )}
              <Button type="primary" size="small" onClick={handleNext}>
                {current === steps.length - 1 ? 'OK' : 'Next'}
              </Button>
            </div>
          </div>
        </div>
        <div
          className="ant-tour-arrow"
          style={{
            position: 'absolute',
            width: 8,
            height: 8,
            background: '#ffffff',
            transform: 'rotate(45deg) translateX(-50%)',
            bottom: -4,
            left: '50%',
          }}
        />
      </div>
    </div>
  );
};

// ==========================================
// 48. Pagination
// ==========================================
export interface PaginationProps {
  current?: number;
  pageSize?: number;
  total?: number;
  onChange?: (page: number, pageSize: number) => void;
  showSizeChanger?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export const Pagination: React.FC<PaginationProps> = ({
  current = 1,
  pageSize = 10,
  total = 0,
  onChange,
  showSizeChanger = true,
  disabled = false,
  style,
}) => {
  const totalPages = Math.ceil(total / pageSize) || 1;

  const handlePageChange = (page: number) => {
    if (disabled) return;
    if (page < 1 || page > totalPages) return;
    onChange && onChange(page, pageSize);
  };

  const handlePageSizeChange = (val: any) => {
    if (disabled) return;
    const newPageSize = Number(val);
    onChange && onChange(1, newPageSize);
  };

  const getPages = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (current <= 3) {
        pages.push(1, 2, 3, 4, 5, '...', totalPages);
      } else if (current >= totalPages - 2) {
        pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', current - 1, current, current + 1, '...', totalPages);
      }
    }
    return pages;
  };

  const pages = getPages();

  return (
    <div className={`ant-pagination ${disabled ? 'ant-pagination-disabled' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...style }}>
      {/* Previous button */}
      <button
        type="button"
        disabled={disabled || current <= 1}
        onClick={() => handlePageChange(current - 1)}
        className="ant-pagination-item-link"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          border: '1px solid var(--antd-border)',
          borderRadius: 4,
          background: '#ffffff',
          cursor: disabled || current <= 1 ? 'not-allowed' : 'pointer',
          color: disabled || current <= 1 ? 'var(--antd-text-disabled)' : 'var(--antd-text)',
          transition: 'all 0.15s',
        }}
      >
        <svg width="6" height="10" viewBox="0 0 6 10" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 9L1 5L5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Pages */}
      {pages.map((p, idx) => {
        const isCurrent = p === current;
        const isEllipsis = p === '...';

        return (
          <button
            key={idx}
            type="button"
            disabled={disabled || isEllipsis}
            onClick={() => handlePageChange(p as number)}
            className={`ant-pagination-item ${isCurrent ? 'ant-pagination-item-active' : ''} ${isEllipsis ? 'ant-pagination-item-jump-prev' : ''}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              border: isEllipsis ? 'none' : '1px solid var(--antd-border)',
              borderColor: isCurrent ? 'var(--antd-primary)' : 'var(--antd-border)',
              borderRadius: 4,
              background: isCurrent ? 'var(--antd-primary-bg, #ffffff)' : '#ffffff',
              color: isCurrent ? 'var(--antd-primary)' : isEllipsis ? 'rgba(0, 0, 0, 0.25)' : 'var(--antd-text)',
              cursor: disabled || isEllipsis ? 'not-allowed' : 'pointer',
              fontWeight: isCurrent ? 600 : 400,
              fontSize: 13,
              transition: 'all 0.15s',
            }}
          >
            {p}
          </button>
        );
      })}

      {/* Next button */}
      <button
        type="button"
        disabled={disabled || current >= totalPages}
        onClick={() => handlePageChange(current + 1)}
        className="ant-pagination-item-link"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          border: '1px solid var(--antd-border)',
          borderRadius: 4,
          background: '#ffffff',
          cursor: disabled || current >= totalPages ? 'not-allowed' : 'pointer',
          color: disabled || current >= totalPages ? 'var(--antd-text-disabled)' : 'var(--antd-text)',
          transition: 'all 0.15s',
        }}
      >
        <svg width="6" height="10" viewBox="0 0 6 10" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 9L5 5L1 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Size Changer */}
      {showSizeChanger && (
        <Select
          size="small"
          className="ant-pagination-size-changer"
          value={pageSize}
          onChange={handlePageSizeChange}
          disabled={disabled}
          options={(() => {
            const defaultSizes = [10, 20, 50, 100];
            const allSizes = pageSize && !defaultSizes.includes(pageSize)
              ? [pageSize, ...defaultSizes].sort((a, b) => a - b)
              : defaultSizes;
            const unit = typeof window !== 'undefined' && localStorage.getItem('minepanel_lang') === 'vi' ? 'trang' : 'page';
            return allSizes.map(s => ({ label: `${s} / ${unit}`, value: s }));
          })()}
          style={{ width: 100, marginLeft: 8 }}
        />
      )}
    </div>
  );
};
