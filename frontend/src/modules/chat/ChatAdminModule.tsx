import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  MessageOutlined,
  LockOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message } from '../../custom-ui';

interface ChannelItem {
  key: string;
  channelCode: string;
  channelName: string;
  category: 'Kênh Chung Toàn Cty' | 'Kênh Phòng Ban' | 'Kênh Dự Án Trọng Điểm' | 'Kênh Ban Lãnh Đạo (Bảo mật)';
  memberCount: number;
  encryption: 'Mã hóa đầu cuối AES-256 (E2EE)' | 'Mã hóa tiêu chuẩn TLS 1.3';
  moderator: string;
  retentionDays: number;
  status: 'Đang hoạt động' | 'Khóa tạm thời';
}

const INITIAL_CHANNELS: ChannelItem[] = [];

export const ChatAdminModule: React.FC = () => {
  const [data, setData] = useState<ChannelItem[]>(INITIAL_CHANNELS);
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const handleCreate = (values: any) => {
    const newItem: ChannelItem = {
      ...values,
      key: String(Date.now()),
      memberCount: Number(values.memberCount) || 10,
      retentionDays: Number(values.retentionDays) || 180,
      status: 'Đang hoạt động',
    };
    setData([newItem, ...data]);
    message.success(`Đã khởi tạo kênh giao tiếp mới: ${values.channelName}`);
    setModalOpen(false);
    form.resetFields();
  };

  const handleToggleStatus = (record: ChannelItem) => {
    const newStatus = record.status === 'Đang hoạt động' ? 'Khóa tạm thời' : 'Đang hoạt động';
    setData(
      data.map((d) =>
        d.key === record.key ? { ...d, status: newStatus as any } : d
      )
    );
    message.success(`Đã cập nhật trạng thái kênh ${record.channelName}: ${newStatus}`);
  };

  const filteredData = data.filter(
    (item) =>
      (item.channelCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.channelName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.moderator || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.category || '').toLowerCase().includes(searchText.toLowerCase())
  );

  const columns = [
    {
      title: 'Mã kênh',
      dataIndex: 'channelCode',
      key: 'channelCode',
      render: (code: string) => (
        <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
          <MessageOutlined /> {code}
        </span>
      ),
    },
    {
      title: 'Tên kênh & Phân loại',
      key: 'channel',
      render: (_: any, record: ChannelItem) => (
        <div>
          <div style={{ fontWeight: 600, color: '#212121', fontSize: 13.5 }}>{record.channelName}</div>
          <div style={{ fontSize: 11.5, color: '#1565C0' }}>{record.category} · Quản trị: {record.moderator}</div>
        </div>
      ),
    },
    {
      title: 'Thành viên',
      dataIndex: 'memberCount',
      key: 'memberCount',
      render: (count: number) => (
        <span style={{ fontWeight: 700, color: '#374151' }}>
          <TeamOutlined style={{ marginRight: 4, color: '#009688' }} /> {count} người
        </span>
      ),
    },
    {
      title: 'Chuẩn bảo mật mã hóa',
      dataIndex: 'encryption',
      key: 'encryption',
      render: (enc: string) => (
        <span style={{ fontSize: 12, color: enc.includes('E2EE') ? '#2E7D32' : '#555', fontWeight: enc.includes('E2EE') ? 600 : 400 }}>
          <LockOutlined style={{ marginRight: 4 }} /> {enc}
        </span>
      ),
    },
    {
      title: 'Lưu trữ tin nhắn',
      dataIndex: 'retentionDays',
      key: 'retentionDays',
      render: (days: number) => <span>{days} ngày</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const isRun = status === 'Đang hoạt động';
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              background: isRun ? '#E8F5E9' : '#FFF8E1',
              color: isRun ? '#2E7D32' : '#F57F17',
            }}
          >
            {status}
          </span>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      render: (_: any, record: ChannelItem) => (
        <Button
          size="small"
          onClick={() => handleToggleStatus(record)}
          style={{ color: record.status === 'Đang hoạt động' ? '#F57F17' : '#009688' }}
        >
          {record.status === 'Đang hoạt động' ? 'Khóa kênh' : 'Mở lại'}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#757575', fontWeight: 500 }}>Tổng số kênh giao tiếp trực tuyến</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} kênh chat
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#757575', fontWeight: 500 }}>Kênh bảo mật mã hóa đầu cuối E2EE</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2E7D32', marginTop: 4 }}>
            {data.filter((d) => d.encryption.includes('E2EE')).length} kênh bảo mật cao
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#757575', fontWeight: 500 }}>Tuân thủ chính sách lưu trữ ISO 27001</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1565C0', marginTop: 4 }}>
            100% đạt chuẩn an toàn
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          placeholder="Tìm theo mã kênh, tên kênh, người quản trị..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 360, borderRadius: 6 }}
          allowClear
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất danh sách kênh')}>
            Xuất Danh Sách
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Tạo kênh giao tiếp mới
          </Button>
        </div>
      </div>

      <div className="transparent-table-card" style={{ width: '100%' }}>
        <KTable
          dataSource={filteredData}
          columns={columns}
          pagination={{
            pageSize: 10,
            showTotal: (total) => (
              <span style={{ fontSize: 13, color: '#757575' }}>
                Tổng số {total} kênh giao tiếp nội bộ
              </span>
            ),
          }}
        />
      </div>

      {/* Modal Add Channel */}
      <Modal
        title="Tạo kênh giao tiếp nội bộ mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="channelCode" label="Mã kênh" initialValue={`CHN-2026-0${data.length + 1}`} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="category" label="Phân nhóm kênh" initialValue="Kênh Phòng Ban">
              <Select
                options={[
                  { label: 'Kênh Chung Toàn Cty', value: 'Kênh Chung Toàn Cty' },
                  { label: 'Kênh Phòng Ban', value: 'Kênh Phòng Ban' },
                  { label: 'Kênh Dự Án Trọng Điểm', value: 'Kênh Dự Án Trọng Điểm' },
                  { label: 'Kênh Ban Lãnh Đạo (Bảo mật)', value: 'Kênh Ban Lãnh Đạo (Bảo mật)' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="channelName" label="Tên kênh chat (bắt đầu bằng #)" rules={[{ required: true, message: 'Nhập tên kênh' }]}>
            <Input placeholder="Ví dụ: #du-an-minepanel-ui" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="moderator" label="Quản trị viên kênh" rules={[{ required: true }]}>
              <Input placeholder="Nhập người quản trị kênh" />
            </Form.Item>
            <Form.Item name="memberCount" label="Số thành viên ban đầu" initialValue={10} rules={[{ required: true }]}>
              <Input type="number" min={2} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="encryption" label="Mức độ mã hóa" initialValue="Mã hóa đầu cuối AES-256 (E2EE)">
              <Select
                options={[
                  { label: 'Mã hóa đầu cuối AES-256 (E2EE)', value: 'Mã hóa đầu cuối AES-256 (E2EE)' },
                  { label: 'Mã hóa tiêu chuẩn TLS 1.3', value: 'Mã hóa tiêu chuẩn TLS 1.3' },
                ]}
              />
            </Form.Item>
            <Form.Item name="retentionDays" label="Lưu trữ (ngày)" initialValue={180}>
              <Input type="number" min={30} max={1000} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Khởi tạo kênh
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
