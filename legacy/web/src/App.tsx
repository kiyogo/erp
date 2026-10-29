import React, { useState, useEffect, useLayoutEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  ControlOutlined,
  DashboardOutlined,
  RightOutlined,
  HomeOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useAuth } from './context/AuthContext';
import { useAppearanceSettings } from './hooks/useAppearanceSettings';
import { KIYOVN_MENU_ITEMS, EMPLOYEE_PORTAL_MENU_ITEMS, ADMIN_PORTAL_MENU_ITEMS } from './data/menuData';
import { SidebarAccordion } from './components/sidebar/SidebarAccordion';
import { SidebarFlyout } from './components/sidebar/SidebarFlyout';
import { WorkspaceTabBar } from './components/sidebar/WorkspaceTabBar';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { AppearanceSettingsModule } from './modules/settings/AppearanceSettingsModule';
import { GenericModulePage, EmployeePortalEntry } from './components/generic/GenericModulePage';
import { IdentityVerificationPage } from './modules/employee/IdentityVerificationPage';
import { IdentityVerificationSuccessPage } from './modules/employee/IdentityVerificationSuccessPage';
import { ChatPage } from './modules/chat';
import Files from './pages/Files';
import FileSharePage from './pages/FileSharePage';
import Login from './pages/Login';
import ActivateAccount from './pages/ActivateAccount';
import NotFoundPage from './pages/NotFoundPage';
import { DocumentEditorPage } from './pages/DocumentEditorPage';
import { WorkspaceTab, MenuItem } from './types/menu';
import { findItemByPath } from './utils/routeHelper';
import { NotificationDropdown } from './components/notification/NotificationDropdown';
import { MobileBottomNav } from './components/navigation/MobileBottomNav';
import { AppLauncher } from './components/navigation/AppLauncher';
import { getEmployeeOnboardingStorage, isEmployeeOnboardingComplete } from './modules/employee/onboardingStorage';
import { EmployeeProfileWizard } from './modules/employee/EmployeeProfileWizard';
import { EkycService } from './modules/ekyc/services/ekycService';
import { adminUsageApi } from './api/endpoints';
import { applicationCategoryForPath } from './modules/admin/usageRules';
import PublicRecruitmentPage from './modules/hr/PublicRecruitmentPage';

export const isAdminUser = (user: { role?: string } | null | undefined): boolean => {
  if (!user || !user.role) return false;
  const r = String(user.role).trim().toUpperCase();
  return r === 'ADMIN' || r === 'SUPERADMIN' || r === 'SYSTEM_ADMIN' || r === 'HR_MANAGER' || r === 'MANAGER';
};


const SIDEBAR_COLLAPSED_KEY = 'kiyovn_sidebar_collapsed';
const MOBILE_LAYOUT_BREAKPOINT = 992;

const readSidebarCollapsed = () => {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
};

// ===== Error Boundary =====
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('KIYOVN Error Boundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
          <div style={{
            boxSizing: 'border-box',
            padding: '20px 24px',
            color: '#DC2626',
            background: '#FEF2F2',
            borderRadius: 8,
            width: '100%',
            border: '1px solid #FECACA',
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px 0' }}>Đã xảy ra lỗi giao diện</h2>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, background: '#FFFFFF', padding: 14, borderRadius: 6, border: '1px solid #FCA5A5' }}>
              {this.state.error?.toString()}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 12,
                padding: '6px 14px',
                borderRadius: 6,
                background: '#DC2626',
                color: '#FFFFFF',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ===== App Layout =====
const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { settings } = useAppearanceSettings();

  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const [layoutReady, setLayoutReady] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= MOBILE_LAYOUT_BREAKPOINT);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  const isEmployeePortal = location.pathname.startsWith('/employee');
  const isEkycPage = location.pathname.toLowerCase().includes('/employee/identity/verification');
  const appliedTheme = settings.theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : settings.theme;
  const isDark = appliedTheme === 'dark';
  const layoutBg = isDark ? '#0B0F19' : '#FDFDFD';
  const sidebarBg = isDark ? '#111827' : '#F5F5F5';
  const headerBg = isDark ? '#111827' : '#FFFFFF';
  const borderColor = isDark ? '#1F2937' : '#E0E0E0';
  const textColor = isDark ? '#F9FAFB' : '#212121';
  const textSubColor = isDark ? '#9CA3AF' : '#757575';

  const isAdmin = isAdminUser(user);
  const canAccessEmployeePortal = Boolean(user);
  const onboardingStorage = React.useMemo(() => getEmployeeOnboardingStorage(user), [user?.id, user?.email]);
  const [onboardingDone, setOnboardingDone] = useState<boolean>(() => {
    if (!user || isAdmin) return true;
    return isEmployeeOnboardingComplete(onboardingStorage, user);
  });

  useEffect(() => {
    if (!user || isAdmin) {
      setOnboardingDone(true);
      return;
    }
    const check = isEmployeeOnboardingComplete(onboardingStorage, user);
    setOnboardingDone(check);
  }, [user, isAdmin, onboardingStorage, location.pathname]);

  const currentMenuItems = isEmployeePortal
    ? EMPLOYEE_PORTAL_MENU_ITEMS
    : KIYOVN_MENU_ITEMS;

  useEffect(() => {
    if (user) {
      if (!isAdmin && (location.pathname.startsWith('/admin') || location.pathname === '/dashboard')) {
        navigate('/employee/home', { replace: true });
      } else if (isAdmin && location.pathname.startsWith('/employee')) {
        navigate('/admin/dashboard', { replace: true });
      }
    }
  }, [user, isAdmin, location.pathname, navigate]);

  useEffect(() => {
    if (!user || (!isAdmin && location.pathname.startsWith('/admin')) || (isAdmin && location.pathname.startsWith('/employee'))) return;
    const application = applicationCategoryForPath(location.pathname);
    if (!application) return;
    void adminUsageApi.recordVisit(application).catch(() => undefined);
  }, [user?.id, isAdmin, location.pathname]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setLayoutReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handleWindowResize = () => {
      const mobile = window.innerWidth <= MOBILE_LAYOUT_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) setMobileDrawerOpen(false);
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = () => setSystemPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleThemeChange);
    return () => mediaQuery.removeEventListener('change', handleThemeChange);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    if (isMobile) {
      setMobileDrawerOpen(false);
    }
  }, [location.pathname, isMobile]);

  // Detect when sticky elements touch the bottom to toggle border radius (Minepanel standard)
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const isSmallScreen = window.innerWidth <= 992;
          const paginations = document.querySelectorAll('.ant-pagination-container, .ant-pagination');
          paginations.forEach((p) => {
            const rect = p.getBoundingClientRect();
            const viewportBottom = window.innerHeight;
            if (isSmallScreen || rect.bottom >= viewportBottom - 2) {
              p.classList.add('is-stuck');
            } else {
              p.classList.remove('is-stuck');
            }
          });
          ticking = false;
        });
        ticking = true;
      }
    };


    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [location.pathname]);

  // Dynamic Workspace Tabs
  const [tabs, setTabs] = useState<WorkspaceTab[]>([
    { id: 'tab-dashboard', title: 'Bảng điều khiển', path: '/admin/dashboard', closable: false },
  ]);

  // Sync active path with tabs
  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '/login') return;

    const allItems = [...KIYOVN_MENU_ITEMS, ...EMPLOYEE_PORTAL_MENU_ITEMS, ...ADMIN_PORTAL_MENU_ITEMS];
    const existing = tabs.find((t) => t.path === location.pathname);
    if (!existing) {
      const item = findItemByPath(allItems, location.pathname);
      const title = item ? item.title : location.pathname.split('/').filter(Boolean).pop() || 'Trang';
      setTabs((prev) => [...prev, { id: `tab-${location.pathname}`, title, path: location.pathname, closable: true }]);
    }
  }, [location.pathname]);

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const tabToClose = tabs.find((t) => t.id === id);
    if (!tabToClose) return;

    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);

    // If closing current tab, navigate to the last remaining tab
    if (location.pathname === tabToClose.path && remaining.length > 0) {
      navigate(remaining[remaining.length - 1].path);
    }
  };

  const handleSidebarItemClick = (item: MenuItem) => {
    if (isMobile) {
      setMobileDrawerOpen(false);
    }
  };

  const isStandaloneEkycSuccess =
    location.pathname.toLowerCase() === '/employee/identity/success' ||
    location.pathname.toLowerCase().startsWith('/employee/identity/success');

  if (isStandaloneEkycSuccess) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100dvh',
          maxHeight: '100dvh',
          margin: 0,
          padding: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          background: '#FFFFFF',
          zIndex: 9999,
        }}
      >
        <ErrorBoundary>
          <IdentityVerificationSuccessPage />
        </ErrorBoundary>
      </div>
    );
  }

  const isStandaloneEkyc =
    location.pathname.toLowerCase() === '/employee/identity/verification' ||
    location.pathname.toLowerCase().startsWith('/employee/identity/verification') ||
    location.pathname.toLowerCase() === '/identity-verification' ||
    location.pathname.toLowerCase().startsWith('/identity-verification');

  if (isStandaloneEkyc) {
    if (!EkycService.isMobileDevice()) {
      return <Navigate to="/employee/home" replace />;
    }
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100dvh',
          maxHeight: '100dvh',
          margin: 0,
          padding: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          background: '#FFFFFF',
          zIndex: 9999,
        }}
      >
        <ErrorBoundary>
          <IdentityVerificationPage />
        </ErrorBoundary>
      </div>
    );
  }

  const isStandaloneChat =
    location.pathname === '/chat' ||
    location.pathname.startsWith('/chat/') ||
    location.pathname === '/admin/chat' ||
    (location.pathname.startsWith('/admin/chat/') && !location.pathname.startsWith('/admin/chat/admin')) ||
    location.pathname === '/admin/channels' ||
    location.pathname.startsWith('/admin/channels/') ||
    location.pathname === '/channels' ||
    location.pathname.startsWith('/channels/');

  if (isStandaloneChat) {
    return (
      <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', background: '#313338' }}>
        <ErrorBoundary>
          <Routes>
            {/* Admin chat routes */}
            <Route path="/admin/chat" element={<ChatPage slug="@me" />} />
            <Route path="/admin/chat/channels/@me" element={<ChatPage slug="@me" />} />
            <Route path="/admin/chat/channels/@me/:channelId" element={<ChatPage slug="@me" />} />
            <Route path="/admin/chat/channels/:slug/:channelId" element={<ChatPage />} />
            <Route path="/admin/chat/channels/:slug" element={<ChatPage />} />
            <Route path="/admin/chat/*" element={<ChatPage />} />

            {/* Admin channels routes */}
            <Route path="/admin/channels" element={<Navigate to="/admin/channels/@me" replace />} />
            <Route path="/admin/channels/@me" element={<ChatPage slug="@me" />} />
            <Route path="/admin/channels/@me/:channelId" element={<ChatPage slug="@me" />} />
            <Route path="/admin/channels/:slug/:channelId" element={<ChatPage />} />
            <Route path="/admin/channels/:slug" element={<ChatPage />} />
            <Route path="/admin/channels/*" element={<ChatPage />} />

            {/* Chat routes */}
            <Route path="/chat" element={<Navigate to="/channels/@me" replace />} />
            <Route path="/chat/channels/@me" element={<ChatPage slug="@me" />} />
            <Route path="/chat/channels/@me/:channelId" element={<ChatPage slug="@me" />} />
            <Route path="/chat/channels/:slug/:channelId" element={<ChatPage />} />
            <Route path="/chat/channels/:slug" element={<ChatPage />} />
            <Route path="/chat/*" element={<ChatPage />} />

            {/* Channels standalone routes */}
            <Route path="/channels" element={<Navigate to="/channels/@me" replace />} />
            <Route path="/channels/@me" element={<ChatPage slug="@me" />} />
            <Route path="/channels/@me/:channelId" element={<ChatPage slug="@me" />} />
            <Route path="/channels/:slug/:channelId" element={<ChatPage />} />
            <Route path="/channels/:slug" element={<ChatPage />} />
            <Route path="/channels/*" element={<ChatPage />} />

            <Route path="*" element={<Navigate to="/channels/@me" replace />} />
          </Routes>
        </ErrorBoundary>
      </div>
    );
  }

  const isDocEditorPage = location.pathname.startsWith('/files/document') || location.pathname.startsWith('/document');
  if (isDocEditorPage) {
    return (
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <ErrorBoundary>
          <Routes>
            <Route path="/document/:type/*" element={<DocumentEditorPage />} />
            <Route path="/document/*" element={<DocumentEditorPage />} />
            <Route path="/files/document/:type/*" element={<DocumentEditorPage />} />
            <Route path="/files/document/*" element={<DocumentEditorPage />} />
          </Routes>
        </ErrorBoundary>
      </div>
    );
  }

  // Nếu là nhân sự chưa hoàn thành quy trình Onboarding 14 bước -> Khóa toàn bộ sidebar, header & các đường dẫn khác
  if (!isAdmin && !onboardingDone && !isEkycPage) {
    return (
      <div style={{ width: '100vw', height: '100vh', overflowY: 'auto', background: '#F8FAFC' }}>
        <ErrorBoundary>
          <div
            style={{
              height: 48,
              background: '#FFFFFF',
              borderBottom: '1px solid #E2E8F0',
              padding: '0 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'sticky',
              top: 0,
              zIndex: 100,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: '#009688',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 14 }}>E</span>
              </div>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#0F172A' }}>
                eNhân Viên
              </span>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#EF4444',
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 4,
              }}
            >
              <LogoutOutlined /> Đăng xuất
            </button>
          </div>

          <EmployeeProfileWizard
            storage={onboardingStorage}
            onDone={() => {
              setOnboardingDone(true);
              navigate('/employee/home', { replace: true });
            }}
          />
        </ErrorBoundary>
      </div>
    );
  }

  return (
    <div
      className={`kiyovn-app-layout ${appliedTheme === 'dark' ? 'theme-dark' : 'theme-light'}`}
      data-layout-ready={layoutReady ? 'true' : 'false'}
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        minWidth: 0,
        maxWidth: '100vw',
        overflow: 'hidden',
        background: layoutBg,
        fontFamily: 'var(--font)',
        position: 'relative',
        left: 0,
        top: 0,
        margin: 0,
        padding: 0,
      }}
    >
      {/* Mobile Drawer Backdrop */}
      {isMobile && mobileDrawerOpen && (
        <div
          onClick={() => setMobileDrawerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            zIndex: 1040,
            backdropFilter: 'blur(2px)',
            transition: 'opacity 0.2s ease',
          }}
        />
      )}

      {/* Sidebar (Desktop vs Mobile Drawer) */}
      <aside
        className={`kiyovn-sidebar ${isMobile ? 'kiyovn-sidebar-mobile' : ''} ${isMobile && mobileDrawerOpen ? 'kiyovn-sidebar-mobile-open' : ''}`}
        style={{
          width: isMobile ? 270 : collapsed ? 80 : 220,
          minWidth: isMobile ? 270 : collapsed ? 80 : 220,
          maxWidth: isMobile ? 270 : collapsed ? 80 : 220,
          flexShrink: 0,
          background: sidebarBg,
          borderRight: `1px solid ${borderColor}`,
          display: isMobile && !mobileDrawerOpen ? 'none' : 'flex',
          flexDirection: 'column',
          height: isMobile ? '100dvh' : '100vh',
          maxHeight: isMobile ? '100dvh' : '100vh',
          zIndex: isMobile ? 1050 : 200,
          transition: layoutReady ? 'width 0.15s ease, min-width 0.15s ease, max-width 0.15s ease' : 'none',
          userSelect: 'none',
          boxSizing: 'border-box',
          position: isMobile ? 'fixed' : 'relative',
          top: 0,
          bottom: 0,
          left: 0,
          boxShadow: isMobile && mobileDrawerOpen ? '4px 0 24px rgba(0,0,0,0.18)' : 'none',
        }}
      >
        {/* Logo Section */}
        <div
          onClick={() => {
            if (isEmployeePortal) navigate('/employee/home');
            else navigate('/admin/dashboard');
            if (isMobile) setMobileDrawerOpen(false);
          }}
          style={{
            height: 48,
            minHeight: 48,
            maxHeight: 48,
            display: 'flex',
            alignItems: 'center',
            padding: !isMobile && collapsed ? '0 24px' : '0 16px',
            borderBottom: `1px solid ${borderColor}`,
            gap: 10,
            cursor: 'pointer',
            flexShrink: 0,
            background: sidebarBg,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: isEmployeePortal ? '#009688' : isDark ? '#009688' : '#18181B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 14, letterSpacing: '0.02em' }}>
              {isEmployeePortal ? 'E' : 'K'}
            </span>
          </div>

          {(isMobile || !collapsed) && (
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
              <span style={{ fontWeight: 700, fontSize: 13.5, color: textColor, letterSpacing: '0.02em', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {isEmployeePortal ? 'CỔNG NHÂN VIÊN' : 'KIYOVN'}
              </span>
              <span style={{ fontSize: 10.5, color: textSubColor, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {isEmployeePortal ? 'Self-Service Portal' : 'Quản trị Doanh nghiệp'}
              </span>
            </div>
          )}
        </div>

        {/* Navigation Menu List */}
        <div
          className="kiyovn-sidebar-scroll"
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingTop: 6,
            paddingBottom: isMobile ? 'calc(96px + env(safe-area-inset-bottom, 28px))' : 24,
            WebkitOverflowScrolling: 'touch',
            overscrollBehaviorY: 'contain',
            touchAction: 'pan-y',
          }}
        >
          {isMobile || settings.sidebarMenuMode === 'accordion' ? (
            <SidebarAccordion
              items={currentMenuItems}
              inlineAccordionMode={settings.inlineAccordionMode}
              collapsed={isMobile ? false : collapsed}
              onItemClick={handleSidebarItemClick}
            />
          ) : (
            <SidebarFlyout
              items={currentMenuItems}
              hoverMode={settings.hoverMode}
              collapsed={collapsed}
              onItemClick={handleSidebarItemClick}
            />
          )}

        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className="kiyovn-main-container"
        style={{
          flex: 1,
          flexBasis: isMobile ? '100%' : 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          overflow: 'hidden',
          background: layoutBg,
        }}
      >
        {/* Header */}
        {!isEkycPage && (
        <header
          style={{
            height: 48,
            background: headerBg,
            borderBottom: `1px solid ${borderColor}`,
            padding: isMobile ? '0 12px' : '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            zIndex: 100,
            position: 'sticky',
            top: 0,
            minWidth: 0,
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        >
          {/* Left: Hamburger button */}
          <div className="kiyovn-header-left" style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <button
              onClick={() => {
                if (isMobile) {
                  setMobileDrawerOpen(!mobileDrawerOpen);
                } else {
                  const nextCollapsed = !collapsed;
                  setCollapsed(nextCollapsed);
                  try {
                    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, nextCollapsed ? '1' : '0');
                  } catch {}
                }
              }}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: '#757575',
                fontSize: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 6,
                borderRadius: 4,
                transition: 'background 0.12s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F3F4F6')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              title={isMobile ? 'Menu' : collapsed ? 'Mở rộng Sidebar' : 'Thu gọn Sidebar'}
            >
              {isMobile ? <MenuUnfoldOutlined /> : collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </button>
            <AppLauncher
              items={currentMenuItems}
              userKey={String(user?.id || user?.email || user?.name || 'current-user')}
              isDark={isDark}
              onNavigate={() => {
                if (isMobile) setMobileDrawerOpen(false);
              }}
            />
          </div>

          {/* Right: Notification Center & User Dropdown */}
          <div className="kiyovn-header-actions" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>

            <NotificationDropdown />

            <div
              className="kiyovn-user-menu-trigger"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 4,
                userSelect: 'none',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F3F4F6')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 4,
                  background: '#18181B',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                }}
              >
                <UserOutlined />
              </div>
              <span className="kiyovn-user-name" style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>
                {user?.name || (isAdmin ? 'Administrator' : 'Nhân viên')}
              </span>
            </div>

            {/* Dropdown Menu */}
            {userMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 42,
                  right: 0,
                  width: 210,
                  background: '#FFFFFF',
                  border: '1px solid #E0E0E0',
                  borderRadius: 6,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                  zIndex: 1000,
                  padding: 4,
                  display: 'flex',
                  flexDirection: 'column',
                }}
                onMouseLeave={() => setUserMenuOpen(false)}
              >
                {isAdmin ? (
                  <>
                    <div
                      onClick={() => {
                        navigate('/admin/dashboard');
                        setUserMenuOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        borderRadius: 4,
                        fontSize: 13,
                        color: '#374151',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F3F4F6')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <DashboardOutlined style={{ color: '#009688' }} />
                      <span>Bảng điều khiển</span>
                    </div>

                    <div style={{ height: 1, background: '#F0F0F0', margin: '4px 0' }} />

                    <div
                      onClick={() => {
                        navigate('/admin/settings/appearance');
                        setUserMenuOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        borderRadius: 4,
                        fontSize: 13,
                        color: '#374151',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F3F4F6')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <SettingOutlined />
                      <span>Cài đặt giao diện</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      onClick={() => {
                        navigate('/employee/home');
                        setUserMenuOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        borderRadius: 4,
                        fontSize: 13,
                        color: '#374151',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F3F4F6')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <HomeOutlined style={{ color: '#009688' }} />
                      <span>Trang chủ Nhân viên</span>
                    </div>

                    <div
                      onClick={() => {
                        navigate('/employee/profile');
                        setUserMenuOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        borderRadius: 4,
                        fontSize: 13,
                        color: '#374151',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F3F4F6')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <UserOutlined style={{ color: '#009688' }} />
                      <span>Hồ sơ của tôi</span>
                    </div>

                    <div
                      onClick={() => {
                        navigate('/employee/settings/security');
                        setUserMenuOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        borderRadius: 4,
                        fontSize: 13,
                        color: '#374151',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F3F4F6')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <SafetyCertificateOutlined style={{ color: '#009688' }} />
                      <span>Bảo mật & Mã PIN</span>
                    </div>

                    <div style={{ height: 1, background: '#F0F0F0', margin: '4px 0' }} />

                    <div
                      onClick={() => {
                        navigate('/employee/settings/appearance');
                        setUserMenuOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        borderRadius: 4,
                        fontSize: 13,
                        color: '#374151',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F3F4F6')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <SettingOutlined />
                      <span>Cài đặt giao diện</span>
                    </div>
                  </>
                )}

                <div
                  onClick={() => {
                    logout();
                    setUserMenuOpen(false);
                    navigate('/login');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 4,
                    fontSize: 13,
                    color: '#EF4444',
                    cursor: 'pointer',
                    borderTop: '1px solid #F3F4F6',
                    marginTop: 2,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#FEF2F2')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <LogoutOutlined />
                  <span>Đăng xuất</span>
                </div>
              </div>
            )}
          </div>
        </header>
        )}

        {/* Optional Workspace Tab Bar */}
        {settings.workspaceTabMode === 'on' && (
          <WorkspaceTabBar tabs={tabs} onCloseTab={handleCloseTab} />
        )}

        {/* Main Content Router */}
        <main
          className="kiyovn-main-content"
          style={{
            flex: 1,
            overflowY: isEkycPage ? 'hidden' : 'auto',
            overflowX: 'hidden',
            overscrollBehavior: isEkycPage ? 'none' : 'auto',
            background: layoutBg,
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            paddingBottom: isMobile ? 'calc(76px + env(safe-area-inset-bottom, 16px))' : 0,
          }}
        >
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={isAdmin ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/employee/home" replace />} />
              <Route path="/dashboard" element={isAdmin ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/employee/home" replace />} />
              <Route path="/admin" element={isAdmin ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/employee/home" replace />} />
              <Route path="/admin/dashboard" element={isAdmin ? <DashboardPage /> : <Navigate to="/employee/home" replace />} />
              <Route path="/employee" element={!isAdmin && canAccessEmployeePortal ? <EmployeePortalEntry /> : <Navigate to={isAdmin ? "/admin/dashboard" : "/login"} replace />} />
              <Route path="/employee/home" element={!isAdmin && canAccessEmployeePortal ? <GenericModulePage /> : <Navigate to={isAdmin ? "/admin/dashboard" : "/login"} replace />} />
              <Route path="/employee/Identity/verification" element={<GenericModulePage />} />
              <Route path="/employee/files" element={!isAdmin && canAccessEmployeePortal ? <Files /> : <Navigate to={isAdmin ? "/admin/dashboard" : "/login"} replace />} />
              <Route path="/files/share" element={<FileSharePage />} />
              <Route path="/files" element={isAdmin ? <Files /> : <Navigate to="/employee/files" replace />} />
              <Route path="/admin/files" element={isAdmin ? <Files /> : <Navigate to="/employee/files" replace />} />
              <Route path="/settings" element={isAdmin ? <Navigate to="/admin/settings/appearance" replace /> : <Navigate to="/employee/settings/appearance" replace />} />
              <Route path="/settings/appearance" element={isAdmin ? <Navigate to="/admin/settings/appearance" replace /> : <Navigate to="/employee/settings/appearance" replace />} />
              <Route path="/settings/security" element={isAdmin ? <Navigate to="/admin/settings/security" replace /> : <Navigate to="/employee/settings/security" replace />} />
              <Route path="/settings/account" element={isAdmin ? <Navigate to="/admin/settings/account" replace /> : <Navigate to="/employee/settings/account" replace />} />
              <Route path="/admin/settings/appearance" element={isAdmin ? <AppearanceSettingsModule /> : <Navigate to="/employee/settings/appearance" replace />} />
              <Route path="/employee/settings/appearance" element={!isAdmin && canAccessEmployeePortal ? <AppearanceSettingsModule /> : <Navigate to={isAdmin ? "/admin/dashboard" : "/login"} replace />} />
              <Route path="/404" element={<NotFoundPage />} />
              <Route path="/not-found" element={<NotFoundPage />} />
              <Route path="/admin/*" element={isAdmin ? <GenericModulePage /> : <Navigate to="/employee/home" replace />} />
              <Route path="/employee/*" element={!isAdmin && canAccessEmployeePortal ? <GenericModulePage /> : <Navigate to={isAdmin ? "/admin/dashboard" : "/login"} replace />} />
              <Route path="/*" element={<GenericModulePage />} />
            </Routes>
          </ErrorBoundary>
        </main>

        {/* Mobile Bottom Navigation Bar */}
        {isMobile && (
          <MobileBottomNav
            isEmployeePortal={isEmployeePortal}
            mobileMenuOpen={mobileDrawerOpen}
            onToggleMobileMenu={() => setMobileDrawerOpen(!mobileDrawerOpen)}
          />
        )}
      </div>
    </div>
  );
};


// ===== Top Loading Bar =====
const TopLoadingBar: React.FC = () => {
  const location = useLocation();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    setProgress(25);

    const t1 = setTimeout(() => setProgress(65), 90);
    const t2 = setTimeout(() => setProgress(90), 200);
    const t3 = setTimeout(() => setProgress(100), 350);
    const t4 = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [location.pathname]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: `${progress}%`,
        height: '2px',
        background: 'linear-gradient(90deg, #009688 0%, #26A69A 70%, #80CBC4 100%)',
        boxShadow: '0 0 8px rgba(0, 150, 136, 0.6)',
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease',
        zIndex: 999999,
        pointerEvents: 'none',
      }}
    />
  );
};

// ===== Auth Guard Route =====
const AuthGuardRoute: React.FC = () => {
  const { isLoggedIn } = useAuth();
  const location = useLocation();
  const path = location.pathname.toLowerCase();
  const isEkycRoute = path === '/employee/identity/verification' || path.startsWith('/employee/identity/verification');
  const isDocEditorRoute = path.startsWith('/files/document');
  const isFileShareRoute = path === '/files/share';

  if (isDocEditorRoute || isFileShareRoute) {
    return (
      <div style={{ width: '100vw', height: '100vh', overflow: isFileShareRoute ? 'auto' : 'hidden' }}>
        <ErrorBoundary>
          {isFileShareRoute ? <FileSharePage /> : <DocumentEditorPage />}
        </ErrorBoundary>
      </div>
    );
  }

  if (isLoggedIn) {
    return (
      <ErrorBoundary>
        <AppLayout />
      </ErrorBoundary>
    );
  }

  // Nếu chưa đăng nhập nhưng là điện thoại quét mã QR eKYC:
  if (isEkycRoute) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100dvh',
          maxHeight: '100dvh',
          margin: 0,
          padding: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          background: '#FFFFFF',
          zIndex: 9999,
        }}
      >
        <ErrorBoundary>
          <IdentityVerificationPage />
        </ErrorBoundary>
      </div>
    );
  }

  return <Navigate to="/login" replace />;
};

// ===== Root App =====
const App: React.FC = () => {
  const { loading } = useAuth();

  useLayoutEffect(() => {
    if (loading) return;
    document.documentElement.classList.remove('app-booting');
    document.documentElement.classList.add('app-ready');
  }, [loading]);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          background: '#FAFAFA',
          fontFamily: 'var(--font)',
        }}
      >
        <span style={{ fontSize: 14, color: '#6B7280', fontWeight: 500 }}>Đang tải hệ thống KIYOVN...</span>
      </div>
    );
  }

  return (
    <Router>
      <TopLoadingBar />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/activate-account" element={<ActivateAccount />} />
        <Route path="/files/document/:type/*" element={<DocumentEditorPage />} />
        <Route path="/files/document/*" element={<DocumentEditorPage />} />
        <Route path="/careers" element={<PublicRecruitmentPage />} />
        <Route path="/careers/:jobKey" element={<PublicRecruitmentPage />} />
        <Route path="/*" element={<AuthGuardRoute />} />
      </Routes>
    </Router>
  );
};

export default App;
