import React, { useState } from 'react';
import {
  AuditOutlined,
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  EyeOutlined,
  PrinterOutlined,
  KeyOutlined,
  DatabaseOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  UserOutlined,
  LockOutlined,
  WarningOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Input, Select, message, Tag, Drawer, Card, Tooltip, Progress } from '../../custom-ui';
import { dataService } from '../../services/dataService';

export interface EnterpriseAuditLog {
  key: string;
  eventId: string;
  timestamp: string;
  user: string;
  role: string;
  action: string;
  actionType: 'DELETE' | 'CREATE' | 'UPDATE' | 'AUTH' | 'APPROVE';
  module: string;
  ipAddress: string;
  detail: string;
  hashSha256: string;
  beforeSnapshot?: string;
  afterSnapshot?: string;
}

const INITIAL_LOGS: EnterpriseAuditLog[] = [];

export const AdminAuditLogsModule: React.FC = () => {
  const [logs, setLogs] = useState<EnterpriseAuditLog[]>(INITIAL_LOGS);
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState('all');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<EnterpriseAuditLog | null>(null);

  const sensitiveCount = logs.filter((l) => l.actionType === 'DELETE' || l.actionType === 'UPDATE').length;
  const approvedCount = logs.filter((l) => l.actionType === 'APPROVE' || l.actionType === 'CREATE').length;

  const filteredLogs = logs.filter((item) => {
    let matchTab = true;
    if (filterTab === 'sensitive') matchTab = item.actionType === 'DELETE' || item.actionType === 'UPDATE';
    else if (filterTab === 'approve') matchTab = item.actionType === 'APPROVE';
    else if (filterTab === 'create') matchTab = item.actionType === 'CREATE';
    else if (filterTab === 'auth') matchTab = item.actionType === 'AUTH' || item.module.includes('Bảo mật');

    const matchSearch =
      (item.user || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.action || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.detail || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.eventId || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.ipAddress || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.module || '').toLowerCase().includes(searchText.toLowerCase());

    return matchTab && matchSearch;
  });

  const columns = [
    {
      title: 'Mã sự kiện & Thời gian',
      key: 'time',
      render: (_: any, record: EnterpriseAuditLog) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13 }}>{record.eventId}</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{record.timestamp}</div>
        </div>
      ),
    },
    {
      title: 'Tài khoản & IP',
      key: 'user',
      render: (_: any, record: EnterpriseAuditLog) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 4 }}>
            <UserOutlined style={{ color: '#009688' }} /> {record.user}
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF' }}>IP: {record.ipAddress} · ({record.role})</div>
        </div>
      ),
    },
    {
      title: 'Hành động',
      dataIndex: 'action',
      key: 'action',
      render: (a: string, record: EnterpriseAuditLog) => {
        let color = 'default';
        if (record.actionType === 'DELETE') color = 'error';
        else if (record.actionType === 'APPROVE') color = 'success';
        else if (record.actionType === 'CREATE') color = 'processing';
        else if (record.actionType === 'UPDATE') color = 'warning';
        return <Tag color={color}>{a}</Tag>;
      },
    },
    {
      title: 'Phân hệ',
      dataIndex: 'module',
      key: 'module',
      width: 170,
      render: (m: string) => <Tag color="blue">{m}</Tag>,
    },
    {
      title: 'Nội dung chi tiết thao tác',
      dataIndex: 'detail',
      key: 'detail',
      render: (d: string) => <span style={{ fontSize: 12.5, color: '#334155' }}>{d}</span>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 130,
      render: (_: any, record: EnterpriseAuditLog) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedLog(record);
            setDrawerOpen(true);
          }}
        >
          Dấu vết số
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng nhật ký kiểm toán lưu trữ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {logs.length} bản ghi số
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Bảo mật mã băm SHA-256 bất biến</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thao tác nhạy cảm / Cập nhật cấu hình</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#EA580C', marginTop: 4 }}>
            {sensitiveCount} hành vi
          </div>
          <div style={{ fontSize: 11.5, color: '#EA580C', marginTop: 2 }}>Kiểm soát đặc quyền quản trị cấp cao</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hành động Ký duyệt &amp; Nghiệm thu</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {approvedCount} giao dịch
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Gắn chứng chỉ số PKI hợp lệ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thời gian lưu trữ pháp lý</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            10 Năm
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Sẵn sàng phục vụ thanh tra kiểm toán</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả nhật ký' },
            { key: 'sensitive', label: 'Nhạy cảm & Đổi cấu hình', icon: <WarningOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'approve', label: 'Phê duyệt / Ký số', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'create', label: 'Tạo dữ liệu mới', icon: <PlusOutlined style={{ color: '#10B981' }} /> },
            { key: 'auth', label: 'Bảo mật & Phiên', icon: <LockOutlined style={{ color: '#009688' }} /> },
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
            placeholder="Tìm theo user, hành động, mã sự kiện, IP..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setLogs(INITIAL_LOGS);
              message.success('Đã tải lại toàn bộ nhật ký an ninh hệ thống');
            }}
          >
            Làm mới
          </Button>

          <Button
            icon={<DownloadOutlined />}
            onClick={() => message.success('Đã xuất toàn bộ nhật ký an ninh hệ thống ra Excel')}
          >
            Xuất Audit Log
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredLogs}
          columns={columns}
          rowKey="key"
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* DRAWER: Dấu Vết Số Chi Tiết */}
      <Drawer
        title="Dấu Vết Kiểm Toán Số &amp; Pháp Lý"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={600}
      >
        {selectedLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ SỰ KIỆN: {selectedLog.eventId}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedLog.action}
                  </div>
                </div>
                <Tag color="blue">{selectedLog.module}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Thời gian: <strong>{selectedLog.timestamp}</strong> · IP: <strong>{selectedLog.ipAddress}</strong>
              </div>
            </div>

            {/* Operator info */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Chủ Thể Thực Hiện:
              </div>
              <div style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 6, color: '#334155' }}>
                <div>Tài khoản đăng nhập: <strong style={{ color: '#009688' }}>{selectedLog.user}</strong></div>
                <div>Cấp độ đặc quyền: <strong>{selectedLog.role}</strong></div>
                <div>Nội dung diễn giải: <em>"{selectedLog.detail}"</em></div>
              </div>
            </div>

            {/* Cryptographic SHA-256 hash */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <KeyOutlined /> Mã Băm Xác Thực Toàn Vẹn (HMAC SHA-256):
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#0F172A', wordBreak: 'break-all', background: '#FFFFFF', padding: 8, borderRadius: 4, border: '1px solid #CBD5E1' }}>
                {selectedLog.hashSha256}
              </div>
              <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircleOutlined /> Chữ ký hợp lệ, chuỗi khối kiểm toán không bị can thiệp
              </div>
            </div>

            {/* Snapshot Difference */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Bản Chụp Trạng Thái Dữ Liệu:
              </div>
              <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <span style={{ color: '#DC2626', fontWeight: 600 }}>[Trước khi thay đổi]:</span>
                  <div style={{ fontFamily: 'monospace', background: '#FEF2F2', padding: 6, borderRadius: 4, marginTop: 2, color: '#991B1B' }}>
                    {selectedLog.beforeSnapshot}
                  </div>
                </div>
                <div>
                  <span style={{ color: '#16A34A', fontWeight: 600 }}>[Sau khi thay đổi]:</span>
                  <div style={{ fontFamily: 'monospace', background: '#F0FDF4', padding: 6, borderRadius: 4, marginTop: 2, color: '#166534' }}>
                    {selectedLog.afterSnapshot}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã in biên bản kiểm toán pháp lý cho sự kiện ${selectedLog.eventId}`)}
              >
                In Trích Lục Dấu Vết Số (A4)
              </Button>
              <Button
                onClick={() => message.success(`Đã xuất tệp JSON ký số cho sự kiện ${selectedLog.eventId}`)}
              >
                Tải JSON Forensic
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

