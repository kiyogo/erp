import React, { useState, useEffect } from 'react';
import {
  CloudDownloadOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  DownloadOutlined,
  SearchOutlined,
  DatabaseOutlined,
  ReloadOutlined,
  EyeOutlined,
  PrinterOutlined,
  HistoryOutlined,
  CloudServerOutlined,
  FolderOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Button, message, Tag, Drawer, Card, Tooltip, Progress, Select } from '../../custom-ui';
import api from '../../api/axios';
import { downloadFile } from '../../utils/fileExporter';
import { formatFileSize } from '../../utils/fileStorage';

export interface EnterpriseBackupItem {
  key: string;
  code: string;
  name: string;
  type: 'Full System' | 'Database' | 'Storage Blob' | 'Auto Daily';
  size: string;
  createdAt: string;
  creator: string;
  location: string;
  checksumSha256: string;
  rtoEstimated: string;
  status: string;
  sizeBytes: number;
  verifiedAt?: string;
  actualChecksumSha256?: string;
  available?: boolean;
  restorable?: boolean;
}

type BackupCapabilities = { database: boolean; fullSystem: boolean; storageBlob: boolean; restore: boolean; autoDaily: boolean; engine: string; reason?: string; maxArchiveBytes?: number; maxEntries?: number };

export const AdminBackupModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseBackupItem[]>([]);
  const [capabilities, setCapabilities] = useState<BackupCapabilities>({ database: false, fullSystem: false, storageBlob: false, restore: false, autoDaily: false, engine: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await api.get<{ data: EnterpriseBackupItem[]; capabilities: BackupCapabilities }>('/admin/backups');
      setData(response.data.data);
      setCapabilities(response.data.capabilities);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được danh sách tệp sao lưu.');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<EnterpriseBackupItem | null>(null);
  const [form] = Form.useForm();

  const handleCreate = async (values: any) => {
    if (saving) return;
    if (!String(values.name || '').trim()) { message.error('Vui lòng nhập tên bản sao lưu.'); return; }
    const supported = values.type === 'Full System' ? capabilities.fullSystem : values.type === 'Database' ? capabilities.database : values.type === 'Storage Blob' && capabilities.storageBlob;
    if (!supported) { message.error(capabilities.reason || 'Phạm vi sao lưu chưa được máy chủ hỗ trợ.'); return; }
    setSaving(true);
    try {
      const response = await api.post<{ backup: EnterpriseBackupItem }>('/admin/backups', { name: String(values.name).trim(), type: values.type }, { timeout: 0 });
      setData(items => [response.data.backup, ...items.filter(item => item.key !== response.data.backup.key)]);
      message.success('Đã tạo tệp ZIP sao lưu thực tế trên máy chủ.');
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể tạo tệp sao lưu.'); }
    finally { setSaving(false); }
  };

  const handleRestore = (record: EnterpriseBackupItem) => {
    if (!capabilities.restore || !record.restorable) {
      Modal.info({ title: 'Khôi phục cần quy trình triển khai có kiểm soát', content: 'Máy chủ hiện hỗ trợ tạo, xác minh và tải bản sao lưu; chưa hỗ trợ khôi phục tự động. Hãy tải bản ZIP đã xác minh, bảo quản khóa mã hóa gốc riêng và thực hiện khôi phục trong môi trường bảo trì. Dữ liệu đang chạy chưa được thay đổi.' });
      return;
    }
    Modal.confirm({
      title: `Khôi phục dữ liệu từ bản Snapshot ${record.code}?`,
      content: 'Khôi phục sẽ thay đổi dữ liệu đang chạy. Chỉ tiếp tục sau khi đã kiểm tra bản sao lưu và chuẩn bị phương án phục hồi.',
      okText: 'Xác nhận khôi phục',
      cancelText: 'Hủy bỏ',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.post(`/admin/backups/${encodeURIComponent(record.key)}/restore`, { confirmation: record.code }, { timeout: 0 });
          message.success('Máy chủ đã hoàn tất khôi phục bản sao lưu.');
          await loadData();
        } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể khôi phục dữ liệu.'); }
      },
    });
  };

  const handleVerify = async (record: EnterpriseBackupItem) => {
    setBusyKey(record.key);
    try {
      const response = await api.post<{ backup: EnterpriseBackupItem }>(`/admin/backups/${encodeURIComponent(record.key)}/verify`, {}, { timeout: 0 });
      const backup = response.data.backup;
      setData(items => items.map(item => item.key === backup.key ? backup : item));
      setSelectedBackup(selected => selected?.key === backup.key ? backup : selected);
      if (backup.status === 'Đã xác minh SHA-256') message.success('Mã băm tệp sao lưu khớp với hồ sơ gốc.');
      else message.error('Tệp sao lưu không khớp mã băm đã ghi nhận.');
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể xác minh tệp sao lưu.'); }
    finally { setBusyKey(''); }
  };

  const handleDownload = async (record: EnterpriseBackupItem) => {
    setBusyKey(record.key);
    try {
      const response = await api.get<Blob>(`/admin/backups/${encodeURIComponent(record.key)}/download`, { responseType: 'blob', timeout: 0 });
      if (response.data.size === 0) throw new Error('Máy chủ trả tệp sao lưu rỗng.');
      downloadFile(`${record.code}.zip`, response.data);
    } catch (error: any) {
      let reason = error?.response?.data?.message || error?.message;
      if (error?.response?.data instanceof Blob) {
        try { reason = JSON.parse(await error.response.data.text()).message; } catch {}
      }
      message.error(reason || 'Không thể tải tệp sao lưu.');
    } finally { setBusyKey(''); }
  };

  const handlePrint = () => {
    if (!selectedBackup) return;
    const popup = window.open('', '_blank');
    if (!popup) { message.error('Trình duyệt đã chặn cửa sổ in. Vui lòng cho phép mở cửa sổ.'); return; }
    popup.document.write('<!doctype html><html lang="vi"><head><meta charset="UTF-8"><title>Hồ sơ sao lưu</title><style>@page{size:A4;margin:20mm}body{font-family:Arial,sans-serif;line-height:1.6;overflow-wrap:anywhere}</style></head><body></body></html>');
    for (const text of ['HỒ SƠ TỆP SAO LƯU', `Mã: ${selectedBackup.code}`, `Tên: ${selectedBackup.name}`, `Phạm vi: ${selectedBackup.type}`, `Người tạo: ${selectedBackup.creator}`, `Thời điểm: ${selectedBackup.createdAt}`, `Dung lượng: ${formatFileSize(selectedBackup.sizeBytes)}`, `SHA-256 gốc: ${selectedBackup.checksumSha256}`, `Xác minh gần nhất: ${selectedBackup.verifiedAt || 'Chưa có'}`, `Trạng thái: ${selectedBackup.status}`, 'Khôi phục tự động chưa được hỗ trợ; khóa mã hóa gốc phải được bảo quản riêng.']) {
      const paragraph = popup.document.createElement('p'); paragraph.textContent = text; popup.document.body.appendChild(paragraph);
    }
    popup.document.close(); popup.focus(); popup.print();
  };

  const filteredData = data.filter((d) => {
    let matchTab = true;
    if (filterTab === 'full') matchTab = d.type === 'Full System';
    else if (filterTab === 'db') matchTab = d.type === 'Database';
    else if (filterTab === 'blob') matchTab = d.type === 'Storage Blob';
    else if (filterTab === 'auto') matchTab = d.type === 'Auto Daily';

    const matchSearch =
      d.name?.toLowerCase().includes(searchText.toLowerCase()) ||
      d.code?.toLowerCase().includes(searchText.toLowerCase()) ||
      d.creator?.toLowerCase().includes(searchText.toLowerCase());

    return matchTab && matchSearch;
  });

  const columns = [
    {
      title: 'Mã Snapshot & Thời điểm',
      key: 'code',
      render: (_: any, record: EnterpriseBackupItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5 }}>{record.code}</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{record.createdAt}</div>
        </div>
      ),
    },
    {
      title: 'Tên bản sao lưu & Loại',
      key: 'name',
      render: (_: any, record: EnterpriseBackupItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.name}</div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>
            Loại: <strong>{record.type}</strong> · Vị trí: {record.location}
          </div>
        </div>
      ),
    },
    {
      title: 'Dung lượng',
      dataIndex: 'size',
      key: 'size',
      width: 110,
      render: (_: string, record: EnterpriseBackupItem) => <span style={{ color: '#1E40AF', fontWeight: 700 }}>{formatFileSize(record.sizeBytes)}</span>,
    },
    {
      title: 'Người thực hiện',
      dataIndex: 'creator',
      key: 'creator',
      render: (c: string) => <span style={{ fontSize: 12.5, color: '#334155' }}>{c}</span>,
    },
    {
      title: 'Trạng thái kiểm tra',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (s: string) => (
        <Tag color={s === 'Đã xác minh SHA-256' ? 'success' : 'error'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <SafetyCertificateOutlined /> {s}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 220,
      render: (_: any, record: EnterpriseBackupItem) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedBackup(record);
              setDrawerOpen(true);
            }}
          >
            Hồ sơ
          </Button>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            loading={busyKey === record.key}
            onClick={() => void handleDownload(record)}
          >
            Tải tệp
          </Button>
          <Button
            size="small"
            type="primary"
            onClick={() => handleRestore(record)}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Khôi phục
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số bản sao lưu Snapshot</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} bản snapshot
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Tệp ZIP vật lý được ghi nhận trên máy chủ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tệp có lần xác minh SHA-256 thành công</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {data.filter(item => item.available !== false && item.status === 'Đã xác minh SHA-256').length}/{data.length} tệp
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Xác minh lại theo yêu cầu hoặc trước khi tải</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thời gian phục hồi mục tiêu (RTO)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            Chưa đo kiểm
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Khôi phục cần quy trình triển khai có kiểm soát</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chu kỳ tự động hóa sao lưu</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#EA580C', marginTop: 4 }}>
            {capabilities.autoDaily ? 'Theo cấu hình máy chủ' : 'Chưa cấu hình lịch'}
          </div>
          <div style={{ fontSize: 11.5, color: '#EA580C', marginTop: 2 }}>Dung lượng tệp hiện có: {formatFileSize(data.filter(item => item.available !== false).reduce((sum, item) => sum + item.sizeBytes, 0))}</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả bản lưu' },
            { key: 'full', label: 'Toàn hệ thống', icon: <SafetyCertificateOutlined style={{ color: '#10B981' }} /> },
            { key: 'db', label: 'Cơ sở dữ liệu (DB)', icon: <DatabaseOutlined style={{ color: '#6366F1' }} /> },
            { key: 'blob', label: 'Kho tài liệu', icon: <FolderOutlined style={{ color: '#3B82F6' }} /> },
            { key: 'auto', label: 'Tự động định kỳ', icon: <ThunderboltOutlined style={{ color: '#F59E0B' }} /> },
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
            placeholder="Tìm theo mã snapshot, tên, người tạo..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void loadData()}
          >Làm mới</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({ type: capabilities.fullSystem ? 'Full System' : capabilities.database ? 'Database' : 'Storage Blob' });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Tạo Snapshot thủ công
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={columns}
          rowKey="key"
          pagination={{ pageSize: 8 }}
          loading={loading}
          locale={{ emptyText: 'Chưa có tệp sao lưu vật lý. Tạo một bản sao lưu để bắt đầu.' }}
        />
      </div>

      {/* MODAL: Tạo Snapshot */}
      <Modal
        title="Tạo Bản Sao Lưu Thủ Công Toàn Bộ Hệ Thống"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={540}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <Form.Item name="name" label="Tên gợi nhớ bản sao lưu" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Sao lưu trước đợt quyết toán thuế Q3/2026" />
          </Form.Item>

          <Form.Item name="type" label="Phân loại phạm vi sao lưu" rules={[{ required: true }]}>
            <Select
              options={[
                { label: `Toàn bộ dữ liệu (DB + Files)${capabilities.fullSystem ? '' : ' — chưa được hỗ trợ'}`, value: 'Full System' },
                { label: `Chỉ cơ sở dữ liệu ${capabilities.engine || ''}${capabilities.database ? '' : ' — chưa được hỗ trợ'}`, value: 'Database' },
                { label: `Chỉ kho tài liệu số hóa (Storage Blob)${capabilities.storageBlob ? '' : ' — chưa được hỗ trợ'}`, value: 'Storage Blob' },
              ]}
            />
          </Form.Item>

          <div style={{ padding: '12px 14px', background: '#F8FAFC', borderRadius: 6, fontSize: 12.5, color: '#334155', border: '1px solid #E2E8F0' }}>
            Máy chủ tạo tệp ZIP thật theo phạm vi đã chọn, có manifest và mã băm SHA-256. Khóa mã hóa gốc cần được bảo quản riêng. Khôi phục tự động và lịch sao lưu chưa được hỗ trợ.
            {capabilities.reason && <p>{capabilities.reason}</p>}
            {capabilities.maxArchiveBytes && <p>Giới hạn bản ZIP: {formatFileSize(capabilities.maxArchiveBytes)}, tối đa {capabilities.maxEntries?.toLocaleString('vi-VN')} tệp.</p>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Bắt đầu sao lưu
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Bản Sao Lưu */}
      <Drawer
        title="Hồ Sơ Snapshot &amp; Kiểm Định Toàn Vẹn Dữ Liệu"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedBackup && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ SNAPSHOT: {selectedBackup.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedBackup.name}
                  </div>
                </div>
                <Tag color={selectedBackup.status === 'Đã xác minh SHA-256' ? 'success' : 'error'}>{selectedBackup.status}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Thời điểm tạo: <strong>{selectedBackup.createdAt}</strong> · Bởi: <strong>{selectedBackup.creator}</strong>
              </div>
            </div>

            {/* Storage details */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CloudServerOutlined /> Thông Số Hạ Tầng Lưu Trữ:
              </div>
              <div style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 6, color: '#334155' }}>
                <div>Dung lượng ZIP: <strong style={{ color: '#1E40AF' }}>{formatFileSize(selectedBackup.sizeBytes)}</strong></div>
                <div>Phân loại: <Tag color="blue">{selectedBackup.type}</Tag></div>
                <div>Vị trí lưu trữ vật lý: <strong>{selectedBackup.location}</strong></div>
                <div>Thời gian phục hồi ước tính (RTO): <strong style={{ color: '#16A34A' }}>{selectedBackup.rtoEstimated}</strong></div>
              </div>
            </div>

            {/* Checksum SHA-256 */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <SafetyCertificateOutlined /> Mã Băm Toàn Vẹn:
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#0F172A', wordBreak: 'break-all', background: '#F1F5F9', padding: 8, borderRadius: 4 }}>
                {selectedBackup.checksumSha256}
              </div>
              <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircleOutlined /> Xác minh gần nhất: {selectedBackup.verifiedAt || 'Chưa có'} · {selectedBackup.status}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => handleRestore(selectedBackup)}
              >
                Khôi Phục Bản Này Ngay
              </Button>
              <Button
                icon={<PrinterOutlined />}
                onClick={handlePrint}
              >
                In Biên Bản (A4)
              </Button>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button loading={busyKey === selectedBackup.key} onClick={() => void handleVerify(selectedBackup)}>Xác minh SHA-256 lại</Button>
              <Button icon={<DownloadOutlined />} loading={busyKey === selectedBackup.key} onClick={() => void handleDownload(selectedBackup)}>Tải tệp ZIP</Button>
            </div>
            {selectedBackup.actualChecksumSha256 && selectedBackup.actualChecksumSha256 !== selectedBackup.checksumSha256 && <p>Mã băm hiện tại không khớp: {selectedBackup.actualChecksumSha256}</p>}
          </div>
        )}
      </Drawer>
    </div>
  );
};

