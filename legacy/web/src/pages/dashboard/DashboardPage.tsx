import React, { useState, useEffect } from 'react';
import {
  TeamOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ArrowUpOutlined,
  CalendarOutlined,
  CloudServerOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Button, message } from '../../custom-ui';
import { dataService, WorkflowItem } from '../../services/dataService';
import { dashboardApi, type DashboardStatsData } from '../../api/endpoints';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [serverStats, setServerStats] = useState<DashboardStatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1024 : window.innerWidth));

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await dashboardApi.getStats();
      if (res.data) {
        setServerStats(res.data);
      }
    } catch (e) {
      console.warn('Load dashboard stats failed:', e);
    } finally {
      setLoading(false);
    }
    const localWfs = dataService.getWorkflows();
    setWorkflows(localWfs);
  };

  useEffect(() => {
    loadData();
    const unsub = dataService.subscribe(loadData);
    return unsub;
  }, []);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const openWorkflowQueue = (wf?: any) => {
    if (wf?.code || wf?.title) {
      message.info(`Đang mở hồ sơ ${wf.code || wf.title} trong hàng chờ xử lý thực tế.`);
    }
    navigate('/admin/workflows/requests');
  };

  const pendingList = serverStats?.pendingWorkflows && serverStats.pendingWorkflows.length > 0
    ? serverStats.pendingWorkflows
    : workflows.filter((w) => w.status === 'Đang xử lý');

  const totalEmp = serverStats?.totalEmployees ?? 0;
  const newEmp = serverStats?.newEmployeesThisMonth ?? 0;
  const revenue = serverStats?.monthlyRevenue ?? 0;
  const pendingCount = serverStats?.pendingApprovalsCount ?? pendingList.length;

  const formatMoney = (amount: number) => {
    if (amount >= 1000000000) return `${(amount / 1000000000).toFixed(2)} tỷ ₫`;
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)} tr ₫`;
    return `${amount.toLocaleString('vi-VN')} ₫`;
  };

  const stats = [
    {
      title: 'Tổng số cán bộ nhân viên',
      value: `${totalEmp} nhân sự`,
      change: newEmp > 0 ? `+${newEmp} tuyển dụng mới` : 'Hồ sơ nhân sự',
      icon: <TeamOutlined style={{ fontSize: 20, color: '#009688' }} />,
      bg: '#E0F2F1',
      link: '/admin/hr/employees',
    },
    {
      title: 'Doanh thu phát sinh thực tế',
      value: formatMoney(revenue),
      change: revenue > 0 ? 'Thu chi tài chính thực tế' : 'Chưa có phát sinh thu',
      icon: <DollarOutlined style={{ fontSize: 20, color: '#10B981' }} />,
      bg: '#D1FAE5',
      link: '/admin/finance/overview',
    },
    {
      title: 'Hồ sơ chờ phê duyệt',
      value: `${pendingCount} hồ sơ`,
      change: pendingCount > 0 ? 'Cần giải quyết' : 'Đã xử lý toàn bộ',
      icon: <ClockCircleOutlined style={{ fontSize: 20, color: '#F59E0B' }} />,
      bg: '#FEF3C7',
      link: '/admin/workflows/requests',
    },
    {
      title: 'Tài khoản đang hoạt động',
      value: `${serverStats?.activeUsers ?? 0} tài khoản`,
      change: 'Được phép đăng nhập hệ thống',
      icon: <CheckCircleOutlined style={{ fontSize: 20, color: '#6366F1' }} />,
      bg: '#EEF2FF',
      link: '/admin/hr/employees',
    },
  ];

  const quickActions = [
    { label: 'Thêm nhân viên mới', path: '/admin/hr/employees' },
    { label: 'Tạo đơn mua hàng (PO)', path: '/admin/finance/purchasing/orders' },
    { label: 'Lập đơn đặt hàng bán (SO)', path: '/admin/finance/sales/orders' },
    { label: 'Lập hóa đơn điện tử VAT', path: '/admin/finance/e-invoice/create' },
    { label: 'Đặt phòng họp hội nghị', path: '/admin/meeting-rooms/calendar' },
    { label: 'Đám mây Cloud Drive', path: '/admin/files' },
    { label: 'Tùy biến giao diện', path: '/admin/settings/appearance' },
  ];

  const recentLogs = serverStats?.recentAuditLogs && serverStats.recentAuditLogs.length > 0
    ? serverStats.recentAuditLogs
    : dataService.getAuditLogs().slice(0, 6).map((l) => ({
        key: l.key,
        time: l.timestamp ? l.timestamp.slice(11, 16) : 'Vừa xong',
        action: `${l.action}: ${l.detail}`,
        type: l.module,
        user: l.user,
      }));
  const isCompactLayout = viewportWidth <= 992;

  return (
    <div className="kiyovn-dashboard-page" style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* System Health Banner */}
      <div
        className="kiyovn-dashboard-banner"
        style={{
          background: 'linear-gradient(135deg, #004D40 0%, #00796B 100%)',
          color: '#FFFFFF',
          borderRadius: 8,
          padding: '14px 20px',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 240px' }}>
          <CloudServerOutlined style={{ fontSize: 24, color: '#A7F3D0', flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'normal', wordBreak: 'break-word' }}>
              Tổng quan vận hành ngày {new Date().toISOString().slice(0, 10)}
            </div>
            <div style={{ fontSize: 12, color: '#E0F2F1', whiteSpace: 'normal', wordBreak: 'break-word', marginTop: 2 }}>
              {serverStats?.activeUsers ?? 0} tài khoản hoạt động · {pendingCount} hồ sơ chờ xử lý · Thu tháng {formatMoney(revenue)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
          <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#E0F2F1' }}>
            <SafetyCertificateOutlined style={{ color: '#A7F3D0' }} /> Dữ liệu lấy từ backend hiện tại
          </span>
          <div className="kiyovn-dashboard-banner-actions" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Button
              icon={<CalendarOutlined />}
              size="small"
              onClick={() => navigate('/admin/meeting-rooms/calendar')}
              style={{ background: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)', color: '#FFFFFF' }}
            >
              Lịch phòng họp
            </Button>
            <Button
              type="primary"
              size="small"
              onClick={() => navigate('/admin/workflows/requests')}
              style={{ backgroundColor: '#10B981', borderColor: '#10B981' }}
            >
              Duyệt hồ sơ ({pendingList.length})
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div
        className="kiyovn-dashboard-kpi-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: isCompactLayout ? '1fr' : 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 14,
          marginBottom: 24,
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          minWidth: 0,
        }}
      >
        {stats.map((st, i) => (
          <div
            className="kiyovn-dashboard-card"
            key={i}
            onClick={() => navigate(st.link)}
            style={{
              background: '#FFFFFF',
              border: '1px solid #E0E0E0',
              borderRadius: 8,
              padding: '18px 20px',
              cursor: 'pointer',
              boxShadow: 'none',
              transition: 'all 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              minWidth: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#009688';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#E0E0E0';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, width: '100%', minWidth: 0 }}>
              <span style={{ fontSize: 13, color: '#757575', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {st.title}
              </span>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: st.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginLeft: 8,
                }}
              >
                {st.icon}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#212121', marginBottom: 4 }}>
                {st.value}
              </div>
              <div style={{ fontSize: 12, color: '#10B981', display: 'flex', alignItems: 'center', gap: 4 }}>
                <ArrowUpOutlined style={{ fontSize: 10 }} />
                <span>{st.change}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Approval Feed Widget */}
      {pendingList.length > 0 && (
        <div className="kiyovn-dashboard-card" style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 8, padding: '18px 20px', marginBottom: 20, width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#212121', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClockCircleOutlined style={{ color: '#F59E0B' }} /> Hàng chờ xử lý
            </h2>
            <span style={{ fontSize: 12, color: '#009688', cursor: 'pointer', fontWeight: 600 }} onClick={() => navigate('/admin/workflows/requests')}>
              Xem tất cả ({pendingList.length}) →
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', boxSizing: 'border-box' }}>
            {pendingList.slice(0, 3).map((wf) => (
              <div
                key={wf.key || wf.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: '#FAFAFA',
                  borderRadius: 6,
                  border: '1px solid #EEEEEE',
                  flexWrap: 'wrap',
                  gap: 8,
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#212121', fontSize: 13 }}>{wf.title} ({wf.code || 'HS'})</div>
                  <div style={{ fontSize: 11.5, color: '#757575' }}>Người lập: {wf.requester || 'Nhân sự'} · {wf.department || 'Doanh nghiệp'}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button size="small" type="primary" onClick={() => openWorkflowQueue(wf)} style={{ backgroundColor: '#2E7D32', borderColor: '#2E7D32' }}>
                    Mở hồ sơ
                  </Button>
                  <Button size="small" onClick={() => navigate('/admin/workflows/overview')}>
                    Tổng quan
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2-Column Content */}
      <div className="kiyovn-dashboard-content-grid" style={{ display: 'grid', gridTemplateColumns: isCompactLayout ? '1fr' : 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, width: '100%', maxWidth: '100%', boxSizing: 'border-box', minWidth: 0 }}>
        {/* Quick Actions */}
        <div
          className="kiyovn-dashboard-card"
          style={{
            background: '#FFFFFF',
            border: '1px solid #E0E0E0',
            borderRadius: 8,
            padding: 20,
            boxShadow: 'none',
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#212121', margin: '0 0 16px 0' }}>
            Lối tắt hành động nhanh
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {quickActions.map((qa, idx) => (
              <div
                key={idx}
                onClick={() => navigate(qa.path)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: 6,
                  border: '1px solid #E0E0E0',
                  background: '#FFFFFF',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#374151',
                  transition: 'all 0.12s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#F5F5F5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#FFFFFF';
                }}
              >
                <span>{qa.label}</span>
                <span style={{ fontSize: 12, color: '#009688', fontWeight: 600 }}>Truy cập →</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activities */}
        <div
          className="kiyovn-dashboard-card"
          style={{
            background: '#FFFFFF',
            border: '1px solid #E0E0E0',
            borderRadius: 8,
            padding: 20,
            boxShadow: 'none',
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#212121', margin: '0 0 16px 0' }}>
            Hoạt động hệ thống gần đây
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 260, overflowY: 'auto', paddingRight: 4 }}>
            {recentLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#9CA3AF', fontSize: 13 }}>
                Chưa có nhật ký hoạt động gần đây
              </div>
            ) : (
              recentLogs.map((log, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    paddingBottom: 12,
                    borderBottom: idx === recentLogs.length - 1 ? 'none' : '1px solid #F0F0F0',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#212121', marginBottom: 2 }}>
                      {log.action}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#757575' }}>
                      Bởi <span style={{ color: '#212121', fontWeight: 500 }}>{log.user}</span> · Phân hệ {log.type}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: '#757575',
                      background: '#F5F5F5',
                      padding: '2px 8px',
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  >
                    {log.time}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
