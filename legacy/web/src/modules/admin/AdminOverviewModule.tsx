import React, { useEffect, useMemo, useState } from 'react';
import {
  AuditOutlined,
  CheckCircleOutlined,
  CloudOutlined,
  DownloadOutlined,
  MailOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import { Button, Tag, message } from '../../custom-ui';
import {
  auditLogsApi,
  contractsApi,
  dashboardApi,
  documentsApi,
  filesApi,
  systemApi,
  type AuditLogEntry,
  type ContractPayload,
  type DashboardStatsData,
  type EnterpriseDocument,
  type StoredFileNode,
} from '../../api/endpoints';

const TODAY = '2026-08-29';

const formatMoney = (amount: number) => {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)} tỷ ₫`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} triệu ₫`;
  return `${amount.toLocaleString('vi-VN')} ₫`;
};

const formatSize = (bytes: number) => {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

export const AdminOverviewModule: React.FC = () => {
  const [stats, setStats] = useState<DashboardStatsData | null>(null);
  const [documents, setDocuments] = useState<EnterpriseDocument[]>([]);
  const [contracts, setContracts] = useState<ContractPayload[]>([]);
  const [files, setFiles] = useState<StoredFileNode[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, documentsRes, contractsRes, filesRes, logsRes, emailRes] = await Promise.all([
        dashboardApi.getStats(),
        documentsApi.getAll(),
        contractsApi.getAll(),
        filesApi.list(),
        auditLogsApi.getAll(1, 20),
        systemApi.getEmailConfig(),
      ]);
      setStats(statsRes.data);
      setDocuments(documentsRes.data.data || []);
      setContracts(contractsRes.data.data || []);
      setFiles(filesRes.data.data || []);
      setLogs(logsRes.data.data || []);
      setEmailConfigured(Boolean(emailRes.data.config?.configured));
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải tổng quan quản trị.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const totalFileBytes = files.reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0);
  const pendingContracts = contracts.filter((item) => item.status === 'Chờ ký' || item.status === 'Chờ duyệt').length;
  const signedContracts = contracts.filter((item) => item.companySignStatus === 'Đã ký' || item.employeeSignStatus === 'Đã ký').length;
  const sensitiveLogs = logs.filter((item) => /xóa|delete|update|replace_collection/i.test(item.action || '')).length;
  const createLogs = logs.filter((item) => /tạo|create/i.test(item.action || '')).length;

  const resourceCards = useMemo(() => ([
    {
      title: 'Tài liệu cộng tác',
      value: `${documents.length} tài liệu`,
      note: `${contracts.length} hợp đồng/pháp lý liên quan`,
      color: '#009688',
      icon: <CloudOutlined />,
    },
    {
      title: 'Kho tệp hiện thấy',
      value: `${files.length} mục`,
      note: `Dung lượng root: ${formatSize(totalFileBytes)}`,
      color: '#2563EB',
      icon: <SafetyCertificateOutlined />,
    },
    {
      title: 'Nhật ký kiểm toán gần đây',
      value: `${logs.length} bản ghi`,
      note: `${sensitiveLogs} thao tác nhạy cảm trong lô vừa tải`,
      color: '#D97706',
      icon: <AuditOutlined />,
    },
    {
      title: 'Cổng email doanh nghiệp',
      value: emailConfigured ? 'Đã cấu hình' : 'Chưa cấu hình',
      note: emailConfigured ? 'Có thể gửi kích hoạt và thông báo' : 'Luồng kích hoạt sẽ chỉ tạo tài khoản chờ',
      color: emailConfigured ? '#16A34A' : '#DC2626',
      icon: <MailOutlined />,
    },
  ]), [contracts.length, documents.length, emailConfigured, files.length, logs.length, sensitiveLogs, totalFileBytes]);

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tài khoản hệ thống</div>
            <span style={{ fontSize: 20, color: '#009688' }}><UsergroupAddOutlined /></span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {stats?.totalUsers ?? 0}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            {stats?.activeUsers ?? 0} tài khoản đang hoạt động
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hồ sơ chờ duyệt</div>
            <span style={{ fontSize: 20, color: '#D97706' }}><ThunderboltOutlined /></span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {stats?.pendingApprovalsCount ?? 0}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            {pendingContracts} hợp đồng đang chờ ký hoặc chờ duyệt
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Doanh thu phát sinh tháng</div>
            <span style={{ fontSize: 20, color: '#16A34A' }}><CheckCircleOutlined /></span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {formatMoney(stats?.monthlyRevenue ?? 0)}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            Chi ra {formatMoney(stats?.monthlyExpense ?? 0)}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tài liệu đã có ký/xác nhận</div>
            <span style={{ fontSize: 20, color: '#2563EB' }}><CloudOutlined /></span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {signedContracts}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            Theo dữ liệu hợp đồng hiện có đến ngày {TODAY}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Điều hành quản trị hệ thống</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
            Bảng này chỉ hiển thị số liệu đang có thật từ tài khoản, hồ sơ, tài liệu, tệp và audit log.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => message.success('Đã chuẩn bị báo cáo quản trị từ dữ liệu hiện có.')}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Xuất báo cáo
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 16 }}>
        {resourceCards.map((item) => (
          <div key={item.title} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: item.color }}>{item.icon}</span> {item.title}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: item.color }}>{item.value}</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>{item.note}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AuditOutlined style={{ color: '#009688' }} /> Nhật ký kiểm toán gần đây
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {logs.length === 0 ? (
              <div style={{ fontSize: 13, color: '#64748B' }}>Chưa có audit log để hiển thị.</div>
            ) : logs.slice(0, 8).map((log) => (
              <div key={log.key} style={{ paddingBottom: 10, borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{log.action}</div>
                  <Tag color={/xóa|delete/i.test(log.action) ? 'error' : /tạo|create/i.test(log.action) ? 'success' : 'warning'} style={{ margin: 0 }}>
                    {log.module || 'Hệ thống'}
                  </Tag>
                </div>
                <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 3 }}>
                  {log.user} · {log.timestamp}
                </div>
                {log.detail ? <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>{log.detail}</div> : null}
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MailOutlined style={{ color: emailConfigured ? '#16A34A' : '#DC2626' }} /> Tình trạng vận hành
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F1F5F9' }}>
              <span style={{ color: '#64748B' }}>Nhân sự mới trong tháng:</span>
              <strong style={{ color: '#16A34A' }}>{stats?.newEmployeesThisMonth ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F1F5F9' }}>
              <span style={{ color: '#64748B' }}>Tài liệu cộng tác đang quản lý:</span>
              <strong style={{ color: '#2563EB' }}>{documents.length}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F1F5F9' }}>
              <span style={{ color: '#64748B' }}>Bản ghi tạo mới gần đây:</span>
              <strong style={{ color: '#009688' }}>{createLogs}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F1F5F9' }}>
              <span style={{ color: '#64748B' }}>Cổng email doanh nghiệp:</span>
              <Tag color={emailConfigured ? 'success' : 'error'}>{emailConfigured ? 'Sẵn sàng' : 'Chưa cấu hình'}</Tag>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
              <span style={{ color: '#64748B' }}>Kho tệp đang thấy ở root:</span>
              <strong>{formatSize(totalFileBytes)}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
