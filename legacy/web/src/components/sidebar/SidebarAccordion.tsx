import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { RightOutlined } from '@ant-design/icons';
import { MenuItem, InlineAccordionMode } from '../../types/menu';
import { isItemActive, hasActiveChild, findActiveParents } from '../../utils/routeHelper';

interface SidebarAccordionProps {
  items: MenuItem[];
  inlineAccordionMode: InlineAccordionMode;
  collapsed?: boolean;
  onItemClick?: (item: MenuItem) => void;
}

export const SidebarAccordion: React.FC<SidebarAccordionProps> = ({
  items,
  inlineAccordionMode,
  collapsed = false,
  onItemClick,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedKeys, setExpandedKeys] = useState<string[]>(() => {
    return findActiveParents(items, location.pathname);
  });

  useEffect(() => {
    const activeParents = findActiveParents(items, location.pathname);
    setExpandedKeys((prev) => {
      if (inlineAccordionMode === 'current-group') {
        return activeParents;
      }
      const merged = Array.from(new Set([...prev, ...activeParents]));
      return merged;
    });
  }, [location.pathname, inlineAccordionMode, items]);

  const toggleExpand = (id: string) => {
    setExpandedKeys((prev) => {
      const isExpanded = prev.includes(id);
      if (isExpanded) {
        return prev.filter((k) => k !== id);
      } else {
        if (inlineAccordionMode === 'current-group') {
          const isTopLevel = items.some((it) => it.id === id);
          if (isTopLevel) {
            return [id];
          }
        }
        return [...prev, id];
      }
    });
  };

  const handleRowClick = (item: MenuItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const hasChildren = item.children && item.children.length > 0;

    if (hasChildren) {
      toggleExpand(item.id);
    } else if (item.path) {
      navigate(item.path);
      onItemClick?.(item);
    }
  };

  const renderMenuItems = (menuList: MenuItem[], level = 1): React.ReactNode => {
    return menuList.map((item) => {
      const hasChildren = Boolean(item.children && item.children.length > 0);
      const isExpanded = expandedKeys.includes(item.id);
      const active = isItemActive(item, location.pathname);
      const activeChild = hasActiveChild(item, location.pathname);
      const isSelected = active || (hasChildren && activeChild);

      const paddingLeft = level === 1 ? (collapsed ? 12 : 14) : level === 2 ? 30 : level === 3 ? 42 : 54;

      return (
        <div key={item.id} className="kiyovn-accordion-node" style={{ width: '100%' }}>
          <div
            onClick={(e) => handleRowClick(item, e)}
            className={`kiyovn-menu-item level-${level} ${isSelected ? 'is-active' : ''} ${
              activeChild ? 'has-active-child' : ''
            } ${isExpanded ? 'is-expanded' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 34,
              padding: `6px 12px 6px ${paddingLeft}px`,
              margin: '1px 6px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: level === 1 ? 13.5 : 13,
              fontWeight: 400,
              color: isSelected ? '#009688' : '#212121',
              background: isSelected ? '#EBF3FB' : 'transparent',
              transition: 'all 0.12s ease',
              userSelect: 'none',
            }}
            title={collapsed ? item.title : undefined}
          >
            {/* Left: Icon + Title */}
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
                    fontSize: level === 1 ? 16 : 14,
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

            {/* Right: Badge & Chevron */}
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
                      color: isSelected ? '#009688' : '#94A3B8',
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s ease',
                      flexShrink: 0,
                    }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
              </div>
            )}
          </div>

          {/* Children Accordion Sub-tree */}
          {hasChildren && isExpanded && !collapsed && (
            <div className="kiyovn-accordion-subtree" style={{ width: '100%' }}>
              {renderMenuItems(item.children || [], level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="kiyovn-sidebar-accordion" style={{ width: '100%', padding: '4px 0 36px 0' }}>
      {renderMenuItems(items, 1)}
    </div>
  );
};
