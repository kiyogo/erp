import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  HomeOutlined,
  CheckSquareOutlined,
  FormOutlined,
  UserOutlined,
  MenuOutlined,
  DashboardOutlined,
  TeamOutlined,
  FolderOpenOutlined,
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

  const isActivePath = (path: string, aliases: string[] = []) => {
    const paths = [path, ...aliases];
    return paths.some((item) => currentPath === item || currentPath.startsWith(`${item}/`));
  };

  const employeeNavItems = [
    {
      key: 'home',
      label: 'Trang chủ',
      icon: <HomeOutlined />,
      active: isActivePath('/employee/home'),
      onClick: () => navigate('/employee/home'),
    },
    {
      key: 'tasks',
      label: 'Nhiệm vụ',
      icon: <CheckSquareOutlined />,
      active: isActivePath('/employee/tasks'),
      onClick: () => navigate('/employee/tasks'),
    },
    {
      key: 'proposals',
      label: 'Kiến nghị',
      icon: <FormOutlined />,
      active: isActivePath('/employee/proposals'),
      onClick: () => navigate('/employee/proposals'),
    },
    {
      key: 'profile',
      label: 'Hồ sơ',
      icon: <UserOutlined />,
      active: isActivePath('/employee/profile'),
      onClick: () => navigate('/employee/profile'),
    },
    {
      key: 'menu',
      label: 'Danh mục',
      icon: <MenuOutlined />,
      active: mobileMenuOpen,
      onClick: onToggleMobileMenu,
    },
  ];

  const adminNavItems = [
    {
      key: 'dashboard',
      label: 'Tổng quan',
      icon: <DashboardOutlined />,
      active: currentPath === '/' || isActivePath('/admin/dashboard'),
      onClick: () => navigate('/admin/dashboard'),
    },
    {
      key: 'employees',
      label: 'Nhân sự',
      icon: <TeamOutlined />,
      active: isActivePath('/admin/hr'),
      onClick: () => navigate('/admin/hr/employees'),
    },
    {
      key: 'approvals',
      label: 'Duyệt',
      icon: <CheckSquareOutlined />,
      active: isActivePath('/admin/workflows/requests'),
      onClick: () => navigate('/admin/workflows/requests'),
    },
    {
      key: 'files',
      label: 'Tài liệu',
      icon: <FolderOpenOutlined />,
      active: isActivePath('/admin/files') || isActivePath('/files'),
      onClick: () => navigate('/admin/files'),
    },
    {
      key: 'menu',
      label: 'Danh mục',
      icon: <MenuOutlined />,
      active: mobileMenuOpen,
      onClick: onToggleMobileMenu,
    },
  ];

  const navItems = isEmployeePortal ? employeeNavItems : adminNavItems;

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
