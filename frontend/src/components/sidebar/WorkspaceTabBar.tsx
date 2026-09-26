import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CloseOutlined } from '@ant-design/icons';
import { WorkspaceTab } from '../../types/menu';

interface WorkspaceTabBarProps {
  tabs: WorkspaceTab[];
  onCloseTab: (id: string, e: React.MouseEvent) => void;
}

export const WorkspaceTabBar: React.FC<WorkspaceTabBarProps> = ({ tabs, onCloseTab }) => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div
      className="kiyovn-workspace-tabs-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        background: '#FAFAFA',
        borderBottom: 'none',
        height: 38,
        padding: '0 8px',
        gap: 4,
        overflowX: 'auto',
        flexShrink: 0,
      }}
    >
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.path;
        return (
          <div
            key={tab.id}
            onClick={() => navigate(tab.path)}
            className={`kiyovn-workspace-tab ${isActive ? 'is-active' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 28,
              padding: '0 12px',
              borderRadius: 6,
              background: isActive ? '#FFFFFF' : 'transparent',
              border: 'none',
              boxShadow: isActive ? '0 1px 3px rgba(0, 0, 0, 0.05)' : 'none',
              cursor: 'pointer',
              fontSize: 12.5,
              fontWeight: isActive ? 600 : 450,
              color: isActive ? '#111827' : '#6B7280',
              transition: 'all 0.12s ease',
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            <span>{tab.title}</span>
            {tab.closable !== false && tabs.length > 1 && (
              <span
                onClick={(e) => onCloseTab(tab.id, e)}
                style={{
                  fontSize: 10,
                  color: '#9CA3AF',
                  padding: 2,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = '#EF4444';
                  (e.currentTarget as HTMLElement).style.background = '#FEE2E2';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = '#9CA3AF';
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <CloseOutlined />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
