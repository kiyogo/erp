import React, { useState } from 'react';
import {
  DesktopOutlined,
  StopOutlined,
  ReloadOutlined,
  EnvironmentOutlined,
  SearchOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  LockOutlined,
  EyeOutlined,
  PrinterOutlined,
  ThunderboltOutlined,
  GlobalOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, message, Modal, Input, Tag, Drawer, Card, Tooltip, Progress } from '../../custom-ui';
import { dataService } from '../../services/dataService';

export interface EnterpriseSessionRecord {
  key: string;
  user: string;
  empCode: string;
  role: string;
  ip: string;
  ipType: 'Nội bộ văn phòng Keangnam' | 'VPN Doanh nghiệp' | 'Mạng ngoài / 4G';
  device: string;
  browser: string;
  location: string;
  loginTime: string;
  lastActive: string;
  mfaVerified: boolean;
  status: 'Đang hoạt động' | 'Treo / Chờ thao tác';
}

import { useEffect } from 'react';

export const AdminSessionsModule: React.FC = () => {
  const [sessions, setSessions] = useState<EnterpriseSessionRecord[]>(INITIAL_SESSIONS);

  useEffect(() => {
    const list = dataService.getGenericData('admin_sessions');
    setSessions(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('admin_sessions');
      setSessions(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState('all');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<EnterpriseSessionRecord | null>(null);

  const activeCount = sessions.filter((s) => s.status === 'Đang hoạt động').length;
  const vpnCount = sessions.filter((s) => s.ipType.includes('VPN') || s.ipType.includes('Mạng ngoài')).length;

  const handleRevoke = (key: string, user: string) => {
    Modal.confirm({
      title: 'Cưỡng chế ngắt phiên truy cập bảo mật?',
      content: `Hệ thống sẽ ngay lập tức vô hiệu hóa Token xác thực và thu hồi quyền của ${user}. Người dùng sẽ bị đăng xuất khỏi toàn bộ hệ thống ngay tức thì.`,
      okText: 'Ngắt phiên ngay',
      cancelText: 'Hủy bỏ',
      okButtonProps: { danger: true },
      onOk: () => {
        const updated = sessions.filter((s) => s.key !== key);
        setSessions(updated);
        dataService.saveGenericData('admin_sessions', updated);
        message.success(`Đã ngắt kết nối phiên làm việc của ${user} thành công!`);
        if (selectedSession && selectedSession.key === key) {
          setDrawerOpen(false);
        }
      },
    });
  };

  const filteredSessions = sessions.filter((s) => {
    let matchTab = true;
    if (filterTab === 'active') matchTab = s.status === 'Đang hoạt động';
    else if (filterTab === 'idle') matchTab = s.status.includes('Treo');
    else if (filterTab === 'admin') matchTab = s.role.includes('Admin') || s.role.includes('Giám Đốc');
    else if (filterTab === 'vpn') matchTab = s.ipType.includes('VPN') || s.ipType.includes('Mạng ngoài');

    const matchSearch =
      (s.user || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (s.ip || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (s.device || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (s.location || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (s.role || '').toLowerCase().includes(searchText.toLowerCase());

    return matchTab && matchSearch;
  });

  const columns = [
    {
      title: 'Tài khoản & Vai trò',
      key: 'user',
      render: (_: any, record: EnterpriseSessionRecord) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <UserOutlined /> {record.user}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{record.role}</div>
        </div>
      ),
    },
    {
      title: 'Địa chỉ IP & Mạng',
      key: 'ip',
      render: (_: any, record: EnterpriseSessionRecord) => (
        <div>
          <div style={{ fontWeight: 600, color: '#1E40AF', fontSize: 13 }}>{record.ip}</div>
          <Tag color={record.ipType.includes('Keangnam') ? 'green' : 'orange'} style={{ marginTop: 2 }}>
            {record.ipType}
          </Tag>
        </div>
      ),
    },
    {
      title: 'Thiết bị & Trình duyệt',
      key: 'device',
      render: (_: any, record: EnterpriseSessionRecord) => (
        <div>
          <div style={{ fontWeight: 500, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
            <DesktopOutlined style={{ color: '#64748B' }} /> {record.device}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>{record.browser}</div>
        </div>
      ),
    },
    {
      title: 'Vị trí địa lý',
      dataIndex: 'location',
      key: 'location',
      render: (l: string) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#334155', fontSize: 12.5 }}>
          <EnvironmentOutlined style={{ color: '#EA580C' }} /> {l}
        </span>
      ),
    },
    {
      title: 'Hoạt động cuối',
      key: 'time',
      render: (_: any, record: EnterpriseSessionRecord) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#16A34A' }}>{record.lastActive}</div>
          <div style={{ fontSize: 11, color: '#64748B' }}>Bắt đầu: {record.loginTime.substring(11)}</div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (s: string) => (
        <Tag color={s.includes('Đang hoạt động') ? 'success' : 'warning'}>
          {s}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 160,
      render: (_: any, record: EnterpriseSessionRecord) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedSession(record);
              setDrawerOpen(true);
            }}
          >
            Chi tiết
          </Button>
          <Button
            size="small"
            danger
            icon={<StopOutlined />}
            onClick={() => handleRevoke(record.key, record.user)}
          >
            Ngắt
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng phiên truy cập hệ thống</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {sessions.length} phiên kết nối
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Được cấp phát Access Token hợp lệ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Phiên đang hoạt động thời gian thực</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {activeCount} phiên online
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đang gửi nhịp tim Heartbeat định kỳ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Truy cập qua VPN / Mạng ngoài</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#EA580C', marginTop: 4 }}>
            {vpnCount} kết nối từ xa
          </div>
          <div style={{ fontSize: 11.5, color: '#EA580C', marginTop: 2 }}>Xác thực đường truyền Zero Trust Shield</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Bảo mật xác thực 2 bước (MFA)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            100% Tuân thủ
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Mã khóa FIDO2 / OTP Authenticator</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả phiên' },
            { key: 'active', label: 'Đang hoạt động', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'idle', label: 'Phiên treo / Chờ', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'admin', label: 'Quản trị viên (Admin)', icon: <LockOutlined style={{ color: '#009688' }} /> },
            { key: 'vpn', label: 'VPN / Mạng ngoài', icon: <GlobalOutlined style={{ color: '#06B6D4' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setFilterTab(tab.key)}
              style={{
                backgroundColor: filterTab === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: filterTab === tab.key ? '#009688' : '#CBD5E1',
                color: filterTab === tab.key ? '#00796B' : '#475569',
                fontWeight: filterTab === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo user, IP, thiết bị, vị trí..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setSessions(INITIAL_SESSIONS);
              message.success('Đã làm mới danh sách phiên truy cập');
            }}
          >
            Làm mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredSessions}
          columns={columns}
          rowKey="key"
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* DRAWER: Chi Tiết Phiên Truy Cập */}
      <Drawer
        title="Giám Sát Chi Tiết Phiên Làm Việc (Session Audit)"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedSession && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>{selectedSession.user}</div>
                  <div style={{ fontSize: 12, color: '#2563EB', marginTop: 4 }}>
                    Mã nhân viên: <strong>{selectedSession.empCode}</strong> · Vai trò: <strong>{selectedSession.role}</strong>
                  </div>
                </div>
                <Tag color={selectedSession.status.includes('Đang hoạt động') ? 'success' : 'warning'}>
                  {selectedSession.status}
                </Tag>
              </div>
            </div>

            {/* Network & Security Info */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <SafetyCertificateOutlined /> Thông Số Mạng &amp; Mã Hóa:
              </div>
              <div style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 6, color: '#334155' }}>
                <div>Địa chỉ IP Public: <strong style={{ color: '#1E40AF' }}>{selectedSession.ip}</strong></div>
                <div>Phân loại kết nối: <Tag color="blue">{selectedSession.ipType}</Tag></div>
                <div>Vị trí địa lý: <strong>{selectedSession.location}</strong></div>
                <div>Giao thức an toàn: <strong>TLS 1.3 / ChaCha20-Poly1305</strong></div>
                <div>Xác thực 2 yếu tố (2FA): <strong style={{ color: '#16A34A' }}>✓ FIDO2 WebAuthn Đã xác thực</strong></div>
              </div>
            </div>

            {/* Device Info */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <DesktopOutlined /> Thiết Bị &amp; Trình Duyệt:
              </div>
              <div style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 6, color: '#334155' }}>
                <div>Thiết bị: <strong>{selectedSession.device}</strong></div>
                <div>Trình duyệt: <strong>{selectedSession.browser}</strong></div>
                <div>Thời điểm bắt đầu phiên: <strong>{selectedSession.loginTime}</strong></div>
                <div>Lần tương tác cuối: <strong style={{ color: '#16A34A' }}>{selectedSession.lastActive}</strong></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Button
                danger
                type="primary"
                style={{ flex: 1 }}
                icon={<StopOutlined />}
                onClick={() => handleRevoke(selectedSession.key, selectedSession.user)}
              >
                Cưỡng Chế Ngắt Phiên Này
              </Button>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã in chứng chỉ phiên truy cập ${selectedSession.user}`)}
              >
                In Chứng Chỉ Phiên (A4)
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

