import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  SkinOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  CheckOutlined,
  CalendarOutlined,
  UserOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseUniformItem {
  key: string;
  code: string;
  employeeName: string;
  empCode: string;
  department: string;
  itemType: string;
  size: 'S' | 'M' | 'L' | 'XL' | 'XXL';
  quantity: number;
  requestDate: string;
  deliveryDate?: string;
  receiverSign?: string;
  note?: string;
  status: 'Đã bàn giao' | 'Chờ cấp phát';
}

const INITIAL_UNIFORMS: EnterpriseUniformItem[] = [];

export const UniformsModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseUniformItem[]>(INITIAL_UNIFORMS);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUniform, setSelectedUniform] = useState<EnterpriseUniformItem | null>(null);

  const totalQuantity = data.reduce((sum, item) => sum + item.quantity, 0);
  const deliveredCount = data.filter((d) => d.status === 'Đã bàn giao').length;
  const pendingCount = data.filter((d) => d.status === 'Chờ cấp phát').length;

  const handleCreate = (values: any) => {
    const newUni: EnterpriseUniformItem = {
      ...values,
      key: String(Date.now()),
      empCode: values.empCode || `KY-${Math.floor(100 + Math.random() * 900)}`,
      quantity: Number(values.quantity) || 2,
      requestDate: new Date().toISOString().substring(0, 10),
      deliveryDate: new Date(Date.now() + 3 * 86400000).toISOString().substring(0, 10),
      status: 'Chờ cấp phát',
    };
    setData([newUni, ...data]);
    message.success(`Đã tạo yêu cầu cấp phát đồng phục cho: ${values.employeeName}`);
    setModalOpen(false);
    form.resetFields();
  };

  const handleHandover = (record: EnterpriseUniformItem) => {
    setData(
      data.map((d) =>
        d.key === record.key
          ? {
              ...d,
              status: 'Đã bàn giao' as const,
              deliveryDate: new Date().toISOString().substring(0, 10),
              receiverSign: `Xác nhận nhận đủ ${d.quantity} bộ trang phục`,
            }
          : d
      )
    );
    message.success(`Đã xác nhận bàn giao đồng phục cho ${record.employeeName}`);
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.itemType || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã phiếu',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (code: string) => <span style={{ fontWeight: 700, color: '#009688' }}>{code}</span>,
    },
    {
      title: 'Nhân sự tiếp nhận',
      key: 'employeeName',
      render: (_: any, record: EnterpriseUniformItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#2563EB' }}>
            Mã: <code>{record.empCode}</code> · {record.department}
          </div>
        </div>
      ),
    },
    {
      title: 'Loại trang phục',
      dataIndex: 'itemType',
      key: 'itemType',
      render: (item: string) => (
        <span style={{ fontWeight: 600, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
          <SkinOutlined style={{ color: '#009688', fontSize: 15 }} />
          {item}
        </span>
      ),
    },
    {
      title: 'Kích cỡ & Số lượng',
      key: 'size',
      width: 160,
      render: (_: any, record: EnterpriseUniformItem) => (
        <div>
          <Tag color="geekblue" style={{ fontWeight: 700 }}>Size {record.size}</Tag>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginLeft: 4 }}>
            {record.quantity} Bộ
          </span>
        </div>
      ),
    },
    {
      title: 'Ngày yêu cầu & Bàn giao',
      key: 'dates',
      width: 180,
      render: (_: any, record: EnterpriseUniformItem) => (
        <div>
          <div style={{ fontSize: 12, color: '#0F172A', fontWeight: 600 }}>
            <CalendarOutlined /> {record.requestDate}
          </div>
          <div style={{ fontSize: 11, color: '#64748B' }}>
            Hẹn giao: {record.deliveryDate || 'Đang may đo'}
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => (
        <Tag color={status === 'Đã bàn giao' ? 'success' : 'warning'}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 150,
      render: (_: any, record: EnterpriseUniformItem) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedUniform(record);
              setDrawerOpen(true);
            }}
          >
            Chi tiết
          </Button>
          {record.status === 'Chờ cấp phát' && (
            <Button
              size="small"
              type="primary"
              icon={<CheckOutlined />}
              onClick={() => handleHandover(record)}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Giao đồ
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng trang phục đăng ký cấp phát</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalQuantity} Bộ trang phục
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Định mức 2 bộ/nhân viên/năm</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã bàn giao cho nhân viên</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {deliveredCount} Phiếu ({Math.round((deliveredCount / (data.length || 1)) * 100)}%)
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Có ký nhận trực tiếp tại kho Hành chính</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đang chờ bàn giao / May đo</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {pendingCount} Phiếu cấp
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Dự kiến giao trước thứ 6 tuần này</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tồn kho đồng phục dự phòng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            120 Chiếc (Đủ size S-XXL)
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Luôn sẵn sàng cấp phát cho nhân sự mới</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả phiếu' },
            { key: 'Đã bàn giao', label: 'Đã bàn giao', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'Chờ cấp phát', label: 'Chờ cấp phát', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setStatusFilter(tab.key)}
              style={{
                backgroundColor: statusFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: statusFilter === tab.key ? '#009688' : '#CBD5E1',
                color: statusFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: statusFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo tên nhân viên, phòng ban, loại đồng phục..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất danh sách cấp phát đồng phục')}>
            Xuất Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                code: `DP-2026/0${data.length + 1}`,
                itemType: 'Áo Polo Doanh Nghiệp KIYOVN (Vải Cá Sấu Cotton)',
                size: 'L',
                quantity: 2,
                department: 'Phòng Ban Kỹ Thuật',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Đăng ký cấp đồng phục
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Thêm phiếu mới */}
      <Modal
        title="Đăng Ký Cấp Phát Đồng Phục Doanh Nghiệp Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã phiếu" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Phòng Ban Kỹ Thuật', value: 'Phòng Ban Kỹ Thuật' },
                  { label: 'Khối Kinh Doanh & Tiếp Thị', value: 'Khối Kinh Doanh & Tiếp Thị' },
                  { label: 'Phòng Tài Chính Kế Toán', value: 'Phòng Tài Chính Kế Toán' },
                  { label: 'Phòng Nhân Sự & Hành Chính', value: 'Phòng Nhân Sự & Hành Chính' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="employeeName" label="Họ tên nhân sự tiếp nhận" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Hoàng Quốc Dũng" />
          </Form.Item>

          <Form.Item name="itemType" label="Loại đồng phục" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'Áo Polo Doanh Nghiệp KIYOVN (Vải Cá Sấu Cotton)', value: 'Áo Polo Doanh Nghiệp KIYOVN' },
                { label: 'Áo Hoodie & Polo Kỹ Thuật (Chống Tĩnh Điện IDC)', value: 'Áo Hoodie & Polo Kỹ Thuật' },
                { label: 'Áo Sơ Mi & Vest Đồng Phục Công Sở Cao Cấp', value: 'Áo Sơ Mi & Vest Đồng Phục' },
              ]}
            />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="size" label="Kích cỡ (Size)" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Size S (Dưới 55kg)', value: 'S' },
                  { label: 'Size M (55 - 65kg)', value: 'M' },
                  { label: 'Size L (65 - 75kg)', value: 'L' },
                  { label: 'Size XL (75 - 85kg)', value: 'XL' },
                  { label: 'Size XXL (Trên 85kg)', value: 'XXL' },
                ]}
              />
            </Form.Item>
            <Form.Item name="quantity" label="Số lượng cấp (Bộ)" rules={[{ required: true }]}>
              <Input type="number" min={1} max={5} />
            </Form.Item>
          </div>

          <Form.Item name="note" label="Ghi chú cấp phát">
            <Input placeholder="Ví dụ: Tân tuyển Onboarding tháng 8 hoặc cấp bù size" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Tạo phiếu cấp phát
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Phiếu Bàn Giao */}
      <Drawer
        title="Chi Tiết Phiếu Cấp Đồng Phục &amp; Biên Bản Bàn Giao"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={540}
      >
        {selectedUniform && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedUniform.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedUniform.employeeName}
                  </div>
                </div>
                <Tag color={selectedUniform.status === 'Đã bàn giao' ? 'success' : 'warning'}>
                  {selectedUniform.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Phòng ban: <strong>{selectedUniform.department}</strong> · Mã: <code>{selectedUniform.empCode}</code>
              </div>
            </div>

            {/* Item Details */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Thông Tin Trang Phục Đăng Ký:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Loại trang phục:</span>
                  <strong>{selectedUniform.itemType}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Kích cỡ (Size chuẩn):</span>
                  <Tag color="geekblue" style={{ fontWeight: 700 }}>Size {selectedUniform.size}</Tag>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Số lượng định mức:</span>
                  <strong>{selectedUniform.quantity} Bộ</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Ngày lập phiếu yêu cầu:</span>
                  <strong>{selectedUniform.requestDate}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Ngày bàn giao thực tế:</span>
                  <strong>{selectedUniform.deliveryDate || 'Chờ nhận tại kho'}</strong>
                </div>
              </div>
            </div>

            {/* Handover Signature */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F0FDF4' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 4 }}>
                Xác Nhận Của Người Nhận:
              </div>
              <div style={{ fontSize: 12.5, color: '#15803D', fontStyle: 'italic' }}>
                "{selectedUniform.receiverSign || 'Chưa ký nhận bàn giao đồ'}"
              </div>
            </div>

            {/* Actions */}
            {selectedUniform.status === 'Chờ cấp phát' && (
              <Button
                type="primary"
                icon={<CheckOutlined />}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => {
                  handleHandover(selectedUniform);
                  setDrawerOpen(false);
                }}
              >
                Xác Nhận Bàn Giao Đồng Phục Ngay
              </Button>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

