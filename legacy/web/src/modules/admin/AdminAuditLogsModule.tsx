import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AuditOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  EyeOutlined,
  LockOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Drawer, Input, message, Pagination, Tag } from '../../custom-ui';
import { auditLogsApi, type AuditLogCategory, type AuditLogEntry } from '../../api/endpoints';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';

const PAGE_SIZE = 25;

function classifyAction(action: string, module: string): AuditLogCategory {
  const value = `${action} ${module}`.toLocaleLowerCase('vi');
  if (/delete|xóa|replace|revoke|update|cập nhật|đổi trạng thái/.test(value)) return 'sensitive';
  if (/approve|duyệt|ký số|ký duyệt/.test(value)) return 'approve';
  if (/create|tạo|thêm mới/.test(value)) return 'create';
  if (/auth|login|logout|password|đăng nhập|mật khẩu|phiên|bảo mật/.test(value)) return 'auth';
  return 'all';
}

function actionTag(action: string, module: string) {
  const category = classifyAction(action, module);
  const color = category === 'sensitive' ? 'warning' : category === 'approve' ? 'success' : category === 'create' ? 'processing' : category === 'auth' ? 'purple' : 'default';
  return <Tag color={color}>{action || 'Thao tác hệ thống'}</Tag>;
}

function formatDetails(record: AuditLogEntry): string {
  const details = record.details || {};
  const hasDetails = Object.keys(details).length > 0;
  return hasDetails ? JSON.stringify(details, null, 2) : 'Không có dữ liệu chi tiết bổ sung.';
}

export const AdminAuditLogsModule: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState<AuditLogCategory>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await auditLogsApi.getAll(page, pageSize, searchText.trim(), filterTab);
      setLogs(response.data.data || []);
      setTotal(response.data.pagination?.total || 0);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải nhật ký kiểm toán.');
    } finally {
      setLoading(false);
    }
  }, [filterTab, page, pageSize, searchText]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLogs(), 250);
    return () => window.clearTimeout(timer);
  }, [loadLogs]);

  const sensitiveCount = useMemo(() => logs.filter(log => classifyAction(log.action, log.module) === 'sensitive').length, [logs]);
  const createCount = useMemo(() => logs.filter(log => classifyAction(log.action, log.module) === 'create').length, [logs]);
  const totalPages = Math.ceil(total / pageSize);

  const columns = [
    {
      title: 'Mã sự kiện và thời gian',
      key: 'time',
      width: 260,
      render: (_: unknown, record: AuditLogEntry) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 12, wordBreak: 'break-all' }}>{record.eventId || record.id}</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 3 }}>{record.timestamp}</div>
        </div>
      ),
    },
    {
      title: 'Tài khoản thực hiện',
      dataIndex: 'user',
      key: 'user',
      width: 220,
      render: (user: string, record: AuditLogEntry) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 5 }}>
            <UserOutlined style={{ color: '#009688' }} /> {user || 'Hệ thống'}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 3 }}>{record.role || 'Hệ thống'}</div>
        </div>
      ),
    },
    { title: 'Hành động', dataIndex: 'action', key: 'action', render: (action: string, record: AuditLogEntry) => actionTag(action, record.module) },
    { title: 'Phân hệ', dataIndex: 'module', key: 'module', width: 180, render: (module: string) => <Tag color="blue">{module || 'Hệ thống'}</Tag> },
    { title: 'Đối tượng và nội dung', dataIndex: 'detail', key: 'detail', render: (detail: string) => <span style={{ fontSize: 12.5, color: '#334155', overflowWrap: 'anywhere' }}>{detail || 'Không có mô tả'}</span> },
    {
      title: 'Chi tiết',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: AuditLogEntry) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => { setSelectedLog(record); setDrawerOpen(true); }}>
          Xem
        </Button>
      ),
    },
  ];

  const exportLogs = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const firstPage = await auditLogsApi.getAll(1, 500, searchText.trim(), filterTab);
      const rows = [...(firstPage.data.data || [])];
      const lastPage = firstPage.data.pagination?.totalPages || 0;
      for (let nextPage = 2; nextPage <= lastPage; nextPage += 1) {
        const response = await auditLogsApi.getAll(nextPage, 500, searchText.trim(), filterTab);
        rows.push(...(response.data.data || []));
      }
      const sheet: Array<Array<string | number | boolean | null>> = [
        ['Mã sự kiện', 'Thời gian', 'Tài khoản', 'Vai trò', 'Hành động', 'Phân hệ', 'Mã đối tượng', 'Chi tiết'],
        ...rows.map(record => [record.eventId || record.id, record.timestamp, record.user, record.role || '', record.action, record.module, record.resourceId || '', formatDetails(record)]),
      ];
      downloadFile('Nhat_ky_kiem_toan.xlsx', generateValidXlsxBlob(sheet));
      message.success(`Đã xuất ${rows.length} bản ghi nhật ký.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể xuất nhật ký kiểm toán.');
    } finally {
      setExporting(false);
    }
  };

  const printSelectedLog = () => {
    if (!selectedLog) return;
    downloadFile(`${String(selectedLog.eventId || selectedLog.id).replace(/[^a-z0-9_-]/gi, '_')}_nhat_ky.pdf`, generateValidPdfBlob(
      'NHẬT KÝ KIỂM TOÁN',
      selectedLog.eventId || selectedLog.id,
      [`Thời gian: ${selectedLog.timestamp}`, `Tài khoản: ${selectedLog.user}`, `Vai trò: ${selectedLog.role || 'Hệ thống'}`, `Hành động: ${selectedLog.action}`, `Phân hệ: ${selectedLog.module}`, `Mã đối tượng: ${selectedLog.resourceId || 'Không có'}`, `Chi tiết: ${formatDetails(selectedLog)}`],
    ));
  };

  const downloadSelectedJson = () => {
    if (!selectedLog) return;
    downloadFile(`${String(selectedLog.eventId || selectedLog.id).replace(/[^a-z0-9_-]/gi, '_')}_nhat_ky.json`, new Blob([JSON.stringify(selectedLog, null, 2)], { type: 'application/json;charset=utf-8' }));
  };

  const tabs: Array<{ key: AuditLogCategory; label: string; icon?: React.ReactNode }> = [
    { key: 'all', label: 'Tất cả nhật ký' },
    { key: 'sensitive', label: 'Thao tác nhạy cảm', icon: <WarningOutlined style={{ color: '#F59E0B' }} /> },
    { key: 'approve', label: 'Phê duyệt và ký', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
    { key: 'create', label: 'Tạo dữ liệu', icon: <PlusOutlined style={{ color: '#10B981' }} /> },
    { key: 'auth', label: 'Bảo mật và phiên', icon: <LockOutlined style={{ color: '#009688' }} /> },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <AuditOutlined style={{ fontSize: 21, color: '#009688' }} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>Nhật ký kiểm toán</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>Dữ liệu lấy từ nhật ký máy chủ, có phân trang và lọc theo nội dung.</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Bản ghi phù hợp bộ lọc</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>{total.toLocaleString('vi-VN')}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thao tác nhạy cảm trong trang</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#EA580C', marginTop: 4 }}>{sensitiveCount}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tạo dữ liệu trong trang</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{createCount}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Trang đang xem</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>{totalPages ? `${page} / ${totalPages}` : '0 / 0'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tabs.map(tab => (
            <Button key={tab.key} size="small" icon={tab.icon} onClick={() => { setFilterTab(tab.key); setPage(1); }} style={{
              backgroundColor: filterTab === tab.key ? '#E0F2F1' : '#FFFFFF',
              borderColor: filterTab === tab.key ? '#009688' : '#CBD5E1',
              color: filterTab === tab.key ? '#00796B' : '#475569',
              fontWeight: filterTab === tab.key ? 700 : 500,
            }}>{tab.label}</Button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input prefix={<SearchOutlined style={{ color: '#94A3B8' }} />} placeholder="Tìm tài khoản, hành động, mã sự kiện, phân hệ..." value={searchText} onChange={event => { setSearchText(event.target.value); setPage(1); }} style={{ width: 310, maxWidth: '100%' }} allowClear />
          <Button icon={<ReloadOutlined />} onClick={() => void loadLogs()} loading={loading}>Làm mới</Button>
          <Button icon={<DownloadOutlined />} onClick={() => void exportLogs()} loading={exporting}>Xuất nhật ký</Button>
        </div>
      </div>

      <div className="transparent-table-card">
        <KTable dataSource={logs} columns={columns} rowKey="key" pagination={false} locale={{ emptyText: loading ? 'Đang tải nhật ký...' : 'Không có nhật ký phù hợp.' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px' }}>
          <span style={{ fontSize: 12.5, color: '#64748B' }}>{total ? `Hiển thị ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} trên ${total.toLocaleString('vi-VN')} bản ghi` : 'Không có bản ghi'}</span>
          <Pagination current={page} pageSize={pageSize} total={total} showSizeChanger disabled={loading} onChange={(nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); }} />
        </div>
      </div>

      <Drawer title="Chi tiết nhật ký kiểm toán" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={600}>
        {selectedLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 12, color: '#009688', fontWeight: 800, overflowWrap: 'anywhere' }}>MÃ SỰ KIỆN: {selectedLog.eventId || selectedLog.id}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 5 }}>{selectedLog.action}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 5 }}>Thời gian: <strong>{selectedLog.timestamp}</strong></div>
            </div>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, color: '#334155', fontSize: 12.5 }}>
              <div>Tài khoản: <strong>{selectedLog.user || 'Hệ thống'}</strong></div>
              <div>Vai trò: <strong>{selectedLog.role || 'Hệ thống'}</strong></div>
              <div>Phân hệ: <strong>{selectedLog.module || 'Hệ thống'}</strong></div>
              <div>Mã đối tượng: <strong>{selectedLog.resourceId || 'Không có'}</strong></div>
              <div>Nội dung: <strong>{selectedLog.detail || 'Không có mô tả'}</strong></div>
            </div>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Dữ liệu chi tiết do máy chủ ghi nhận</div>
              <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 260, overflow: 'auto', fontFamily: 'monospace', fontSize: 11.5, color: '#334155', background: '#F8FAFC', padding: 10, borderRadius: 5 }}>{formatDetails(selectedLog)}</pre>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="primary" style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }} icon={<PrinterOutlined />} onClick={printSelectedLog}>Tải biên bản PDF</Button>
              <Button icon={<DownloadOutlined />} onClick={downloadSelectedJson}>Tải dữ liệu JSON</Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
