import React, { useState } from 'react';
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
import { dataService } from '../../services/dataService';

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
  status: 'Toàn vẹn 100%' | 'Đang nén dữ liệu';
}

const INITIAL_BACKUPS: EnterpriseBackupItem[] = [];

export const AdminBackupModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseBackupItem[]>(INITIAL_BACKUPS);
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<EnterpriseBackupItem | null>(null);
  const [form] = Form.useForm();

  const handleCreate = (values: any) => {
    const newBackup: EnterpriseBackupItem = {
      key: String(Date.now()),
      code: `SNAP-2026-0827-0${data.length + 1}`,
      name: values.name,
      type: values.type || 'Full System',
      size: '14.5 GB',
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
      creator: 'Trần Tuấn Anh (CTO)',
      location: 'IDC Tân Thuận Cold S3 Bucket #01',
      checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      rtoEstimated: '≤ 35 giây',
      status: 'Toàn vẹn 100%',
    };
    setData([newBackup, ...data]);
    message.success('Đã tạo bản sao lưu snapshot hệ thống thành công!');
    setModalOpen(false);
    form.resetFields();
  };

  const handleRestore = (code: string) => {
    Modal.confirm({
      title: `Khôi phục dữ liệu từ bản Snapshot ${code}?`,
      content: 'Hệ thống sẽ đồng bộ lại toàn bộ dữ liệu cơ sở dữ liệu và tệp tin theo bản sao lưu này. Quá trình mất khoảng 30 giây.',
      okText: 'Xác nhận khôi phục',
      cancelText: 'Hủy bỏ',
      okButtonProps: { danger: true },
      onOk: () => {
        message.success(`Đã khôi phục thành công toàn bộ hệ thống từ bản sao lưu ${code}`);
      },
    });
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
      render: (s: string) => <span style={{ color: '#1E40AF', fontWeight: 700 }}>{s}</span>,
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
        <Tag color="success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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
            onClick={() => message.success(`Đang tải xuống tệp sao lưu ${record.code}.tar.gz`)}
          >
            Tải tệp
          </Button>
          <Button
            size="small"
            type="primary"
            onClick={() => handleRestore(record.code)}
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
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Phân tán 2 Data Center (Tân Thuận &amp; Duy Tân)</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Độ tin cậy toàn vẹn khôi phục</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            100% SHA-256
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Tự động kiểm tra Checksum hàng ngày</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thời gian phục hồi mục tiêu (RTO)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            ≤ 30 Giây
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Phục hồi nóng không cần dừng server</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chu kỳ tự động hóa sao lưu</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#EA580C', marginTop: 4 }}>
            02:00 Sáng Mỗi Ngày
          </div>
          <div style={{ fontSize: 11.5, color: '#EA580C', marginTop: 2 }}>Ghi đè bản cũ sau 30 ngày lưu trữ</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả bản lưu' },
            { key: 'full', label: 'Toàn hệ thống (Full)', icon: <SafetyCertificateOutlined style={{ color: '#10B981' }} /> },
            { key: 'db', label: 'Cơ sở dữ liệu (DB)', icon: <DatabaseOutlined style={{ color: '#6366F1' }} /> },
            { key: 'blob', label: 'Kho tài liệu (Blob)', icon: <FolderOutlined style={{ color: '#3B82F6' }} /> },
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
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({ type: 'Full System' });
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
                { label: 'Toàn bộ hệ thống (Full System DB + Files)', value: 'Full System' },
                { label: 'Chỉ Cơ sở dữ liệu PostgreSQL', value: 'Database' },
                { label: 'Chỉ Kho tài liệu số hóa (Storage Blob)', value: 'Storage Blob' },
              ]}
            />
          </Form.Item>

          <div style={{ padding: '12px 14px', background: '#F8FAFC', borderRadius: 6, fontSize: 12.5, color: '#334155', border: '1px solid #E2E8F0' }}>
            Hệ thống sẽ tạo bản snapshot đầy đủ gồm cơ sở dữ liệu PostgreSQL, kho tài liệu văn thư số, và toàn bộ nhật ký kiểm toán với mã băm SHA-256 an toàn.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
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
                <Tag color="success">{selectedBackup.status}</Tag>
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
                <div>Dung lượng nén: <strong style={{ color: '#1E40AF' }}>{selectedBackup.size}</strong></div>
                <div>Phân loại: <Tag color="blue">{selectedBackup.type}</Tag></div>
                <div>Vị trí lưu trữ vật lý: <strong>{selectedBackup.location}</strong></div>
                <div>Thời gian phục hồi ước tính (RTO): <strong style={{ color: '#16A34A' }}>{selectedBackup.rtoEstimated}</strong></div>
              </div>
            </div>

            {/* Checksum SHA-256 */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <SafetyCertificateOutlined /> Mã Băm Toàn Vẹn (SHA-256 Checksum):
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#0F172A', wordBreak: 'break-all', background: '#F1F5F9', padding: 8, borderRadius: 4 }}>
                {selectedBackup.checksumSha256}
              </div>
              <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircleOutlined /> Khớp 100% với bản ghi lưu trữ gốc, sẵn sàng cho công tác DR (Disaster Recovery)
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => handleRestore(selectedBackup.code)}
              >
                Khôi Phục Bản Này Ngay
              </Button>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã in biên bản bàn giao sao lưu ${selectedBackup.code}`)}
              >
                In Biên Bản (A4)
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

