import React, { useEffect, useState } from 'react';
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
import { adminSessionsApi, type AdminSessionRecord } from '../../api/endpoints';

export type EnterpriseSessionRecord = AdminSessionRecord;

export const AdminSessionsModule: React.FC = () => {
  const [sessions, setSessions] = useState<EnterpriseSessionRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSessions = async () => {
    setLoading(true);
    try {
      setSessions((await adminSessionsApi.getAll()).data.data);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải danh sách phiên truy cập.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSessions();
  }, []);

  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState('all');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<EnterpriseSessionRecord | null>(null);

  const activeCount = sessions.filter((s) => s.status === 'Đang hoạt động').length;
  const vpnCount = sessions.filter((s) => s.ipType.includes('Mạng ngoài') && !['Đã thu hồi', 'Đã hết hạn'].includes(s.status)).length;
  const mfaCount = sessions.filter(s => s.mfaVerified).length;

  const handleRevoke = (key: string, user: string) => {
    Modal.confirm({
      title: 'Cưỡng chế ngắt phiên truy cập bảo mật?',
      content: `Thu hồi phiên đã chọn của ${user}. Các yêu cầu API tiếp theo của phiên này sẽ bị từ chối và yêu cầu đăng nhập lại.`,
      okText: 'Ngắt phiên ngay',
      cancelText: 'Hủy bỏ',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const response = await adminSessionsApi.revoke(key, 'Quản trị viên ngắt phiên từ giao diện giám sát');
          setSessions(items => items.map(item => item.key === key ? response.data.session : item));
          if (selectedSession?.key === key) setSelectedSession(response.data.session);
          message.success(`Đã thu hồi phiên làm việc của ${user}.`);
          if (response.data.session.current) await loadSessions();
        } catch (error: any) {
          message.error(error?.response?.data?.message || 'Không thể thu hồi phiên đăng nhập.');
        }
      },
    });
  };

  const filteredSessions = sessions.filter((s) => {
    let matchTab = true;
    if (filterTab === 'active') matchTab = s.status === 'Đang hoạt động';
    else if (filterTab === 'idle') matchTab = s.status.includes('Treo');
    else if (filterTab === 'admin') matchTab = s.role === 'ADMIN';
    else if (filterTab === 'vpn') matchTab = s.ipType.includes('Mạng ngoài');
    else if (filterTab === 'revoked') matchTab = s.status === 'Đã thu hồi';
    else if (filterTab === 'expired') matchTab = s.status === 'Đã hết hạn';

    const matchSearch =
      (s.user || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (s.ip || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (s.device || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (s.location || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (s.role || '').toLowerCase().includes(searchText.toLowerCase());

    return matchTab && matchSearch;
  });

  const printSession = () => {
    if (!selectedSession) return;
    const popup = window.open('', '_blank');
    if (!popup) { message.error('Trình duyệt đã chặn cửa sổ in. Vui lòng cho phép mở cửa sổ.'); return; }
    popup.document.write('<!doctype html><html lang="vi"><head><meta charset="UTF-8"><title>Thông tin phiên truy cập</title><style>@page{size:A4;margin:20mm}body{font-family:Arial,sans-serif;line-height:1.6}h1{font-size:20px}</style></head><body></body></html>');
    const heading = popup.document.createElement('h1');
    heading.textContent = 'THÔNG TIN PHIÊN TRUY CẬP';
    popup.document.body.appendChild(heading);
    for (const text of [
      `Mã phiên: ${selectedSession.key}`, `Tài khoản: ${selectedSession.user} (${selectedSession.empCode})`,
      `Vai trò: ${selectedSession.role}`, `IP kết nối tới máy chủ: ${selectedSession.ip}`,
      `Thiết bị / trình duyệt khai báo: ${selectedSession.device} / ${selectedSession.browser}`,
      `User-Agent: ${selectedSession.userAgent}`, `Bắt đầu: ${selectedSession.loginTime}`,
      `Hoạt động cuối: ${selectedSession.lastActive}`, `Hết hạn: ${selectedSession.expiresAt}`,
      `Trạng thái: ${selectedSession.status}`, `Phương thức: ${selectedSession.method}`,
      ...(selectedSession.revokedAt ? [`Thu hồi: ${selectedSession.revokedAt}; lý do: ${selectedSession.revokeReason}`] : []),
      `Xuất lúc: ${new Date().toISOString()}`,
    ]) {
      const paragraph = popup.document.createElement('p');
      paragraph.textContent = text;
      popup.document.body.appendChild(paragraph);
    }
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const columns = [
    {
      title: 'Tài khoản & Vai trò',
      key: 'user',
      render: (_: any, record: EnterpriseSessionRecord) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <UserOutlined /> {record.user}{record.current ? '' : ''}
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
          <Tag color={record.ipType.includes('nội bộ') ? 'green' : 'orange'} style={{ marginTop: 2 }}>
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
            disabled={record.status === 'Đã thu hồi' || record.status === 'Đã hết hạn'}
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
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Lịch sử phiên đã được máy chủ xác thực ghi nhận</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Phiên có hoạt động trong 5 phút gần đây</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {activeCount} phiên online
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Theo thời điểm yêu cầu API được xác thực gần nhất</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Truy cập từ địa chỉ mạng ngoài</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#EA580C', marginTop: 4 }}>
            {vpnCount} kết nối từ xa
          </div>
          <div style={{ fontSize: 11.5, color: '#EA580C', marginTop: 2 }}>Theo địa chỉ kết nối trực tiếp đến máy chủ API</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Bảo mật xác thực 2 bước (MFA)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            {mfaCount}/{sessions.length} phiên được xác minh
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Hiện chưa có bằng chứng xác thực MFA từ máy chủ</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả phiên' },
            { key: 'active', label: 'Đang hoạt động', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'idle', label: 'Phiên treo / Chờ', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'admin', label: 'Quản trị viên', icon: <LockOutlined style={{ color: '#009688' }} /> },
            { key: 'vpn', label: 'Mạng ngoài', icon: <GlobalOutlined style={{ color: '#06B6D4' }} /> },
            { key: 'revoked', label: 'Đã thu hồi' },
            { key: 'expired', label: 'Đã hết hạn' },
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
            loading={loading}
            onClick={() => void loadSessions()}
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
          loading={loading}
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* DRAWER: Chi Tiết Phiên Truy Cập */}
      <Drawer
        title="Giám Sát Chi Tiết Phiên Làm Việc"
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
                <div>IP kết nối tới máy chủ: <strong style={{ color: '#1E40AF' }}>{selectedSession.ip}</strong></div>
                <div>Phân loại kết nối: <Tag color="blue">{selectedSession.ipType}</Tag></div>
                <div>Vị trí địa lý: <strong>{selectedSession.location}</strong></div>
                <div>Giao thức kết nối API: <strong>{selectedSession.tlsProtocol ? `${selectedSession.tlsProtocol} / ${selectedSession.cipher}` : 'HTTP; chưa có thông tin TLS tại API'}</strong></div>
                <div>Xác thực 2 yếu tố (2FA): <strong>{selectedSession.mfaVerified ? 'Đã xác minh' : 'Chưa được máy chủ xác minh MFA'}</strong></div>
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
                <div>Hết hạn: <strong>{selectedSession.expiresAt}</strong></div>
                <div>Phương thức đăng nhập: <strong>{selectedSession.method}</strong></div>
                <div>User-Agent khai báo: <strong>{selectedSession.userAgent || 'Chưa có'}</strong></div>
                {selectedSession.revokedAt && <div>Thu hồi: <strong>{selectedSession.revokedAt}</strong> · {selectedSession.revokeReason}</div>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Button
                danger
                disabled={selectedSession.status === 'Đã thu hồi' || selectedSession.status === 'Đã hết hạn'}
                type="primary"
                style={{ flex: 1 }}
                icon={<StopOutlined />}
                onClick={() => handleRevoke(selectedSession.key, selectedSession.user)}
              >
                Cưỡng Chế Ngắt Phiên Này
              </Button>
              <Button
                icon={<PrinterOutlined />}
                onClick={printSession}
              >
                In Thông Tin Phiên (A4)
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

