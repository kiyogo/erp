import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  HomeOutlined,
  CheckSquareOutlined,
  FormOutlined,
  UserOutlined,
  SettingOutlined,
  MenuOutlined,
  DashboardOutlined,
} from '@ant-design/icons';

interface MobileBottomNavProps {
  isEmployeePortal: boolean;
  mobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
  unreadNotificationsCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  isEmployeePortal,
  mobileMenuOpen,
  onToggleMobileMenu,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const homePath = isEmployeePortal ? '/employee/home' : '/admin/dashboard';
  const tasksPath = isEmployeePortal ? '/employee/tasks' : '/admin/plans/tasks';
  const proposalsPath = isEmployeePortal ? '/employee/proposals' : '/admin/hr/proposals';
  const profilePath = isEmployeePortal ? '/employee/profile' : '/admin/system';

  const isHomeActive = currentPath === homePath || (homePath === '/admin/dashboard' && currentPath === '/');
  const isTasksActive = currentPath.includes('/tasks');
  const isProposalsActive = currentPath.includes('/proposals');
  const isProfileActive = currentPath.includes('/profile') || currentPath === '/admin/system';

  const navItems = [
    {
      key: 'home',
      label: 'Trang chủ',
      icon: isEmployeePortal ? <HomeOutlined /> : <DashboardOutlined />,
      active: isHomeActive,
      onClick: () => navigate(homePath),
    },
    {
      key: 'tasks',
      label: 'Nhiệm vụ',
      icon: <CheckSquareOutlined />,
      active: isTasksActive,
      onClick: () => navigate(tasksPath),
    },
    {
      key: 'proposals',
      label: 'Kiến nghị',
      icon: <FormOutlined />,
      active: isProposalsActive,
      onClick: () => navigate(proposalsPath),
    },
    {
      key: 'profile',
      label: isEmployeePortal ? 'Hồ sơ' : 'Cài đặt',
      icon: isEmployeePortal ? <UserOutlined /> : <SettingOutlined />,
      active: isProfileActive,
      onClick: () => navigate(profilePath),
    },
    {
      key: 'menu',
      label: 'Danh mục',
      icon: <MenuOutlined />,
      active: mobileMenuOpen,
      onClick: onToggleMobileMenu,
    },
  ];

  return (
    <div
      className="kiyovn-mobile-bottom-nav"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 56,
        backgroundColor: '#FFFFFF',
        borderTop: '1px solid #E2E8F0',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        zIndex: 1000,
        boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.05)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        userSelect: 'none',
      }}
    >
      {navItems.map((item) => {
        const color = item.active ? '#009688' : '#64748B';
        return (
          <button
            key={item.key}
            onClick={item.onClick}
            type="button"
            style={{
              flex: 1,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              padding: '4px 0',
              cursor: 'pointer',
              color: color,
              transition: 'color 0.15s ease',
              outline: 'none',
            }}
          >
            <div style={{ fontSize: 18, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {item.icon}
            </div>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: item.active ? 600 : 400,
                marginTop: 2,
                color: color,
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
