import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { RightOutlined } from '@ant-design/icons';
import { MenuItem, HoverMode } from '../../types/menu';
import { isItemActive, hasActiveChild } from '../../utils/routeHelper';

interface SidebarFlyoutProps {
  items: MenuItem[];
  hoverMode: HoverMode;
  collapsed?: boolean;
  onItemClick?: (item: MenuItem) => void;
}

interface FlyoutState {
  level1Item: MenuItem | null;
  anchorRect: DOMRect | null;
  activeLevel2Id: string | null;
  level2AnchorRect: DOMRect | null;
  activeLevel3Id: string | null;
  level3AnchorRect: DOMRect | null;
}

export const SidebarFlyout: React.FC<SidebarFlyoutProps> = ({
  items,
  hoverMode,
  collapsed = false,
  onItemClick,
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  const [flyoutState, setFlyoutState] = useState<FlyoutState>({
    level1Item: null,
    anchorRect: null,
    activeLevel2Id: null,
    level2AnchorRect: null,
    activeLevel3Id: null,
    level3AnchorRect: null,
  });

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setFlyoutState({
        level1Item: null,
        anchorRect: null,
        activeLevel2Id: null,
        level2AnchorRect: null,
        activeLevel3Id: null,
        level3AnchorRect: null,
      });
    }, 160);
  };

  // Close on route change
  useEffect(() => {
    setFlyoutState({
      level1Item: null,
      anchorRect: null,
      activeLevel2Id: null,
      level2AnchorRect: null,
      activeLevel3Id: null,
      level3AnchorRect: null,
    });
  }, [location.pathname]);

  // Close on global click outside
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      if (
        containerRef.current?.contains(target) ||
        target.closest('.kiyovn-flyout-portal') ||
        target.closest('.kiyovn-menu-item')
      ) {
        return;
      }
      setFlyoutState({
        level1Item: null,
        anchorRect: null,
        activeLevel2Id: null,
        level2AnchorRect: null,
        activeLevel3Id: null,
        level3AnchorRect: null,
      });
    };

    window.addEventListener('mousedown', handleGlobalClick);
    return () => window.removeEventListener('mousedown', handleGlobalClick);
  }, []);

  const handleLevel1Enter = (item: MenuItem, el: HTMLElement) => {
    clearCloseTimer();
    const hasChildren = Boolean(item.children && item.children.length > 0);
    if (!hasChildren) {
      setFlyoutState({
        level1Item: null,
        anchorRect: null,
        activeLevel2Id: null,
        level2AnchorRect: null,
        activeLevel3Id: null,
        level3AnchorRect: null,
      });
      return;
    }

    const rect = el.getBoundingClientRect();
    setFlyoutState((prev) => ({
      level1Item: item,
      anchorRect: rect,
      activeLevel2Id: prev.level1Item?.id === item.id ? prev.activeLevel2Id : null,
      level2AnchorRect: prev.level1Item?.id === item.id ? prev.level2AnchorRect : null,
      activeLevel3Id: null,
      level3AnchorRect: null,
    }));
  };

  const handleLevel1Click = (item: MenuItem, el: HTMLElement, e: React.MouseEvent) => {
    e.stopPropagation();
    const hasChildren = Boolean(item.children && item.children.length > 0);
    if (hasChildren) {
      handleLevel1Enter(item, el);
    } else if (item.path) {
      navigate(item.path);
      onItemClick?.(item);
      setFlyoutState({
        level1Item: null,
        anchorRect: null,
        activeLevel2Id: null,
        level2AnchorRect: null,
        activeLevel3Id: null,
        level3AnchorRect: null,
      });
    }
  };

  const handleLevel2Enter = (child: MenuItem, el: HTMLElement) => {
    clearCloseTimer();
    const hasChildren = Boolean(child.children && child.children.length > 0);
    const rect = el.getBoundingClientRect();

    setFlyoutState((prev) => ({
      ...prev,
      activeLevel2Id: hasChildren ? child.id : null,
      level2AnchorRect: hasChildren ? rect : null,
      activeLevel3Id: null,
      level3AnchorRect: null,
    }));
  };

  const handleLevel3Enter = (subChild: MenuItem, el: HTMLElement) => {
    clearCloseTimer();
    const hasChildren = Boolean(subChild.children && subChild.children.length > 0);
    const rect = el.getBoundingClientRect();

    setFlyoutState((prev) => ({
      ...prev,
      activeLevel3Id: hasChildren ? subChild.id : null,
      level3AnchorRect: hasChildren ? rect : null,
    }));
  };

  const navigateAndClose = (path?: string, item?: MenuItem) => {
    if (path) {
      navigate(path);
      if (item) onItemClick?.(item);
      setFlyoutState({
        level1Item: null,
        anchorRect: null,
        activeLevel2Id: null,
        level2AnchorRect: null,
        activeLevel3Id: null,
        level3AnchorRect: null,
      });
    }
  };

  const calculateFlyoutPos = (anchorRect: DOMRect, width = 220, minHeight = 150) => {
    let left = anchorRect.right + 4;
    let top = anchorRect.top - 6;

    if (left + width > window.innerWidth) {
      left = Math.max(10, anchorRect.left - width - 4);
    }

    if (top + minHeight > window.innerHeight) {
      top = Math.max(10, window.innerHeight - minHeight - 20);
    }

    return { top, left };
  };

  const activeLevel2Item = flyoutState.level1Item?.children?.find(
    (c) => c.id === flyoutState.activeLevel2Id
  );

  const activeLevel3Item = activeLevel2Item?.children?.find(
    (c) => c.id === flyoutState.activeLevel3Id
  );

  return (
    <div ref={containerRef} className="kiyovn-sidebar-flyout" style={{ width: '100%' }}>
      {/* Primary Items List (Level 1) */}
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '4px 0 24px 0' }}>
        {items.map((item) => {
          const hasChildren = Boolean(item.children && item.children.length > 0);
          const active = isItemActive(item, location.pathname);
          const activeChild = hasActiveChild(item, location.pathname);
          const isSelected = active || activeChild;
          const isCurrentFlyout = flyoutState.level1Item?.id === item.id;

          return (
            <div
              key={item.id}
              onMouseEnter={(e) => handleLevel1Enter(item, e.currentTarget)}
              onMouseLeave={scheduleClose}
              onClick={(e) => handleLevel1Click(item, e.currentTarget, e)}
              className={`kiyovn-menu-item level-1 ${isSelected ? 'is-active' : ''} ${
                activeChild ? 'has-active-child' : ''
              } ${isCurrentFlyout ? 'is-flyout-open' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                minHeight: 34,
                padding: '6px 12px',
                margin: '1px 6px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13.5,
                fontWeight: 400,
                color: isSelected ? '#009688' : '#212121',
                background: isCurrentFlyout
                  ? '#EAEAEA'
                  : isSelected
                  ? '#EBF3FB'
                  : 'transparent',
                transition: 'all 0.12s ease',
                userSelect: 'none',
              }}
              title={collapsed ? item.title : undefined}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flex: 1,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.icon && (
                  <span
                    style={{
                      fontSize: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isSelected ? '#009688' : '#555555',
                      flexShrink: 0,
                    }}
                  >
                    {item.icon}
                  </span>
                )}
                {!collapsed && (
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: isSelected ? '#009688' : '#212121',
                      fontWeight: 400,
                    }}
                  >
                    {item.title}
                  </span>
                )}
              </div>

              {!collapsed && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {item.badge && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: '1px 6px',
                        borderRadius: 10,
                        background: '#009688',
                        color: '#ffffff',
                        fontWeight: 400,
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                  {hasChildren && (
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        color: isSelected ? '#009688' : isCurrentFlyout ? '#1E293B' : '#94A3B8',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Level 2 Flyout Portal */}
      {flyoutState.level1Item && flyoutState.anchorRect && typeof document !== 'undefined' &&
        createPortal(
          (() => {
            const pos = calculateFlyoutPos(
              flyoutState.anchorRect,
              230,
              (flyoutState.level1Item.children?.length || 3) * 36 + 45
            );
            return (
              <div
                className="kiyovn-flyout-portal kiyovn-flyout-level-2"
                onMouseEnter={clearCloseTimer}
                onMouseLeave={scheduleClose}
                style={{
                  position: 'fixed',
                  top: pos.top,
                  left: pos.left,
                  width: 230,
                  maxHeight: 'calc(100vh - 40px)',
                  overflowY: 'auto',
                  background: '#FFFFFF',
                  border: '1px solid #E0E0E0',
                  borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                  zIndex: 9999,
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  animation: 'flyoutFadeIn 0.15s ease-out',
                }}
              >
                <div
                  style={{
                    padding: '8px 10px 6px 10px',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: '#64748B',
                    borderBottom: '1px solid #F0F0F0',
                    marginBottom: 4,
                  }}
                >
                  {flyoutState.level1Item.title}
                </div>

                {flyoutState.level1Item.children?.map((child) => {
                  const hasSub = Boolean(child.children && child.children.length > 0);
                  const active = isItemActive(child, location.pathname);
                  const activeChild = hasActiveChild(child, location.pathname);
                  const isSelected = active || activeChild;
                  const isOpen = flyoutState.activeLevel2Id === child.id;

                  return (
                    <div
                      key={child.id}
                      onMouseEnter={(e) => handleLevel2Enter(child, e.currentTarget)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (hasSub) {
                          handleLevel2Enter(child, e.currentTarget);
                        } else {
                          navigateAndClose(child.path, child);
                        }
                      }}
                      className={`kiyovn-flyout-item ${isSelected ? 'is-active' : ''} ${isOpen ? 'is-open' : ''}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        minHeight: 34,
                        padding: '6px 10px',
                        margin: '1px 0',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 400,
                        color: isSelected ? '#009688' : '#212121',
                        background: isOpen
                          ? '#F5F5F5'
                          : isSelected
                          ? '#EBF3FB'
                          : 'transparent',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                          color: isSelected ? '#009688' : '#212121',
                          fontWeight: 400,
                        }}
                      >
                        {child.title}
                      </span>
                      {hasSub && (
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            color: isSelected ? '#009688' : isOpen ? '#1E293B' : '#94A3B8',
                            marginLeft: 8,
                            flexShrink: 0,
                          }}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })(),
          document.body
        )}

      {/* Level 3 Flyout Portal */}
      {activeLevel2Item && flyoutState.level2AnchorRect && typeof document !== 'undefined' &&
        createPortal(
          (() => {
            const pos = calculateFlyoutPos(
              flyoutState.level2AnchorRect,
              230,
              (activeLevel2Item.children?.length || 3) * 36 + 45
            );
            return (
              <div
                className="kiyovn-flyout-portal kiyovn-flyout-level-3"
                onMouseEnter={clearCloseTimer}
                onMouseLeave={scheduleClose}
                style={{
                  position: 'fixed',
                  top: pos.top,
                  left: pos.left,
                  width: 230,
                  maxHeight: 'calc(100vh - 40px)',
                  overflowY: 'auto',
                  background: '#FFFFFF',
                  border: '1px solid #E0E0E0',
                  borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                  zIndex: 10000,
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  animation: 'flyoutFadeIn 0.15s ease-out',
                }}
              >
                <div
                  style={{
                    padding: '8px 10px 6px 10px',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: '#64748B',
                    borderBottom: '1px solid #F0F0F0',
                    marginBottom: 4,
                  }}
                >
                  {activeLevel2Item.title}
                </div>

                {activeLevel2Item.children?.map((subChild) => {
                  const hasSub4 = Boolean(subChild.children && subChild.children.length > 0);
                  const active = isItemActive(subChild, location.pathname);
                  const activeChild = hasActiveChild(subChild, location.pathname);
                  const isSelected = active || activeChild;
                  const isOpen = flyoutState.activeLevel3Id === subChild.id;

                  return (
                    <div
                      key={subChild.id}
                      onMouseEnter={(e) => handleLevel3Enter(subChild, e.currentTarget)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (hasSub4) {
                          handleLevel3Enter(subChild, e.currentTarget);
                        } else {
                          navigateAndClose(subChild.path, subChild);
                        }
                      }}
                      className={`kiyovn-flyout-item ${isSelected ? 'is-active' : ''} ${isOpen ? 'is-open' : ''}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        minHeight: 34,
                        padding: '6px 10px',
                        margin: '1px 0',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 400,
                        color: isSelected ? '#009688' : '#212121',
                        background: isOpen
                          ? '#F5F5F5'
                          : isSelected
                          ? '#EBF3FB'
                          : 'transparent',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                          color: isSelected ? '#009688' : '#212121',
                          fontWeight: 400,
                        }}
                      >
                        {subChild.title}
                      </span>
                      {hasSub4 && (
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            color: isSelected ? '#009688' : isOpen ? '#1E293B' : '#94A3B8',
                            marginLeft: 8,
                            flexShrink: 0,
                          }}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })(),
          document.body
        )}

      {/* Level 4 Flyout Portal */}
      {activeLevel3Item && flyoutState.level3AnchorRect && typeof document !== 'undefined' &&
        createPortal(
          (() => {
            const pos = calculateFlyoutPos(
              flyoutState.level3AnchorRect,
              230,
              (activeLevel3Item.children?.length || 3) * 36 + 45
            );
            return (
              <div
                className="kiyovn-flyout-portal kiyovn-flyout-level-4"
                onMouseEnter={clearCloseTimer}
                onMouseLeave={scheduleClose}
                style={{
                  position: 'fixed',
                  top: pos.top,
                  left: pos.left,
                  width: 230,
                  maxHeight: 'calc(100vh - 40px)',
                  overflowY: 'auto',
                  background: '#FFFFFF',
                  border: '1px solid #E0E0E0',
                  borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                  zIndex: 10001,
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  animation: 'flyoutFadeIn 0.15s ease-out',
                }}
              >
                <div
                  style={{
                    padding: '8px 10px 6px 10px',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: '#64748B',
                    borderBottom: '1px solid #F0F0F0',
                    marginBottom: 4,
                  }}
                >
                  {activeLevel3Item.title}
                </div>

                {activeLevel3Item.children?.map((sub4) => {
                  const active = isItemActive(sub4, location.pathname);

                  return (
                    <div
                      key={sub4.id}
                      onClick={() => navigateAndClose(sub4.path, sub4)}
                      className={`kiyovn-flyout-item ${active ? 'is-active' : ''}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        minHeight: 34,
                        padding: '6px 10px',
                        margin: '1px 0',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 400,
                        color: active ? '#009688' : '#212121',
                        background: active ? '#EBF3FB' : 'transparent',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                          color: active ? '#009688' : '#212121',
                          fontWeight: 400,
                        }}
                      >
                        {sub4.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })(),
          document.body
        )}
    </div>
  );
};
