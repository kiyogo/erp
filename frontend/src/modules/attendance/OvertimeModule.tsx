import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  FieldTimeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  CheckOutlined,
  CloseOutlined,
  DollarOutlined,
  ProjectOutlined,
  ThunderboltOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseOvertimeRecord {
  key: string;
  code: string;
  employeeName: string;
  empCode: string;
  department: string;
  position: string;
  otDate: string;
  timeRange: string;
  totalHours: number;
  multiplier: number; // 1.5x, 2.0x, 3.0x
  project: string;
  reason: string;
  baseHourlyRate: number;
  approver: string;
  status: 'Đã duyệt OT' | 'Chờ phê duyệt' | 'Từ chối';
}

const INITIAL_OT_DATA: EnterpriseOvertimeRecord[] = [];

export const OvertimeModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseOvertimeRecord[]>(INITIAL_OT_DATA);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<EnterpriseOvertimeRecord | null>(null);

  const approvedList = data.filter((d) => d.status === 'Đã duyệt OT');
  const totalOTHours = approvedList.reduce((sum, item) => sum + item.totalHours, 0);
  const totalEstPay = approvedList.reduce((sum, item) => sum + item.totalHours * item.baseHourlyRate * item.multiplier, 0);
  const pendingCount = data.filter((d) => d.status === 'Chờ phê duyệt').length;

  const handleCreate = (values: any) => {
    const hours = Number(values.totalHours) || 2;
    const mult = Number(values.multiplier) || 1.5;
    const newOT: EnterpriseOvertimeRecord = {
      ...values,
      key: String(Date.now()),
      empCode: values.empCode || `KY-${Math.floor(100 + Math.random() * 900)}`,
      totalHours: hours,
      multiplier: mult,
      baseHourlyRate: Number(values.baseHourlyRate) || 180000,
      approver: 'Trần Tuấn Anh (CTO)',
      status: 'Chờ phê duyệt',
    };
    setData([newOT, ...data]);
    message.success(`Đã gửi đơn đăng ký làm thêm giờ (OT) của: ${values.employeeName}`);
    setModalOpen(false);
    form.resetFields();
  };

  const handleAction = (record: EnterpriseOvertimeRecord, newStatus: 'Đã duyệt OT' | 'Từ chối') => {
    setData(data.map((d) => (d.key === record.key ? { ...d, status: newStatus } : d)));
    if (newStatus === 'Đã duyệt OT') {
      message.success(`Đã phê duyệt ${record.totalHours} giờ OT cho ${record.employeeName}`);
    } else {
      message.warning(`Đã từ chối đơn làm thêm giờ của ${record.employeeName}`);
    }
    setDrawerOpen(false);
  };

  const filteredData = data.filter((item) => {
    const matchStatus =
      statusFilter === 'all' ||
      item.status === statusFilter ||
      (statusFilter === 'weekend' && item.multiplier >= 2.0);

    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.project || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã đơn OT & Dự án',
      key: 'code',
      render: (_: any, record: EnterpriseOvertimeRecord) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FieldTimeOutlined style={{ color: '#009688', fontSize: 15 }} />
            {record.project}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, marginTop: 2 }}>
            Mã phiếu: <code>{record.code}</code>
          </div>
        </div>
      ),
    },
    {
      title: 'Nhân viên làm OT',
      key: 'employeeName',
      width: 210,
      render: (_: any, record: EnterpriseOvertimeRecord) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            Mã: <code>{record.empCode}</code> · {record.department}
          </div>
        </div>
      ),
    },
    {
      title: 'Ngày làm & Khung giờ',
      key: 'time',
      width: 210,
      render: (_: any, record: EnterpriseOvertimeRecord) => (
        <div>
          <div style={{ fontWeight: 600, color: '#2563EB', fontSize: 12.5 }}>{record.otDate}</div>
          <div style={{ fontSize: 11.5, color: '#0F172A' }}>
            {record.timeRange} (<strong style={{ color: '#D97706' }}>{record.totalHours} Giờ</strong>)
          </div>
        </div>
      ),
    },
    {
      title: 'Hệ số tính lương',
      dataIndex: 'multiplier',
      key: 'multiplier',
      width: 170,
      render: (m: number) => {
        let label = 'x1.5 (Ngày thường)';
        let color = 'processing';
        if (m === 2.0) { label = 'x2.0 (Cuối tuần)'; color = 'warning'; }
        if (m === 3.0) { label = 'x3.0 (Lễ Tết)'; color = 'error'; }
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: 'Lý do làm thêm giờ',
      dataIndex: 'reason',
      key: 'reason',
      render: (r: string) => <span style={{ color: '#475569', fontSize: 12 }}>{r}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => {
        let color = 'default';
        if (status === 'Đã duyệt OT') color = 'success';
        if (status === 'Chờ phê duyệt') color = 'warning';
        if (status === 'Từ chối') color = 'error';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterpriseOvertimeRecord) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedRecord(record);
            setDrawerOpen(true);
          }}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số giờ OT đã phê duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalOTHours} Giờ làm việc
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Phục vụ các đợt phát hành &amp; Bảo trì IDC</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Dự toán phụ cấp OT trong tháng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalEstPay.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Tính trực tiếp vào kỳ trả lương tháng</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đơn đăng ký chờ lãnh đạo duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {pendingCount} Đơn đăng ký
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Yêu cầu phê duyệt trước giờ bắt đầu làm</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tuân thủ trần giờ OT quy định</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            100% An toàn (&lt;40h/tháng)
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đảm bảo sức khỏe người lao động</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả đơn OT' },
            { key: 'Chờ phê duyệt', label: 'Chờ phê duyệt', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Đã duyệt OT', label: 'Đã duyệt OT', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'weekend', label: 'Cuối tuần (x2.0)', icon: <ThunderboltOutlined style={{ color: '#F59E0B' }} /> },
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
            placeholder="Tìm theo mã đơn OT, tên nhân sự, dự án..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất bảng tổng hợp giờ làm OT')}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                code: `OT-2026-${Math.floor(100 + Math.random() * 900)}`,
                department: 'Phòng Ban Kỹ Thuật',
                otDate: new Date().toISOString().substring(0, 10),
                multiplier: 1.5,
                timeRange: '18:00 - 21:00',
                totalHours: 3,
                baseHourlyRate: 180000,
                project: 'Hệ Thống Core Engine Enterprise',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Đăng ký làm OT mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Đăng ký OT mới */}
      <Modal
        title="Đăng Ký Làm Thêm Giờ (OT) Phục Vụ Dự Án"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã phiếu OT" rules={[{ required: true }]}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Họ tên nhân viên làm OT" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Hoàng Quốc Dũng" />
            </Form.Item>
            <Form.Item name="position" label="Chức danh" initialValue="Senior Engineer" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="otDate" label="Ngày làm OT" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="multiplier" label="Loại hình & Hệ số OT" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Ngày thường (x1.5 lương giờ)', value: 1.5 },
                  { label: 'Nghỉ cuối tuần (x2.0 lương giờ)', value: 2.0 },
                  { label: 'Nghỉ Lễ Tết (x3.0 lương giờ)', value: 3.0 },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="timeRange" label="Khung giờ OT (HH:mm - HH:mm)" rules={[{ required: true }]}>
              <Input placeholder="18:00 - 21:00" />
            </Form.Item>
            <Form.Item name="totalHours" label="Số giờ làm thêm" rules={[{ required: true }]}>
              <Input type="number" min={1} max={12} step={0.5} />
            </Form.Item>
          </div>

          <Form.Item name="project" label="Phục vụ dự án / Khách hàng" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item name="reason" label="Lý do làm thêm giờ chi tiết" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Mô tả công việc cần xử lý ngoài giờ..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Gửi đơn đăng ký OT
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Đơn OT & Dự Toán Tiền Lương */}
      <Drawer
        title="Chi Tiết Đơn Đăng Ký OT &amp; Dự Toán Chi Phí"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedRecord.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedRecord.employeeName}
                  </div>
                </div>
                <Tag color={selectedRecord.status === 'Đã duyệt OT' ? 'success' : 'warning'}>
                  {selectedRecord.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedRecord.position} · {selectedRecord.department} (Mã: {selectedRecord.empCode})
              </div>
            </div>

            {/* Overtime details */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Tin Ca Làm Thêm Giờ:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Dự án phục vụ:</span>
                  <strong style={{ color: '#2563EB' }}>{selectedRecord.project}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Ngày &amp; Khung giờ làm:</span>
                  <strong>{selectedRecord.otDate} ({selectedRecord.timeRange})</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Tổng số giờ OT:</span>
                  <strong style={{ color: '#009688', fontSize: 14 }}>{selectedRecord.totalHours} Giờ</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Hệ số phụ cấp:</span>
                  <strong style={{ color: '#D97706' }}>x{selectedRecord.multiplier} Lương chuẩn</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Cán bộ phê duyệt:</span>
                  <span>{selectedRecord.approver}</span>
                </div>
                <div style={{ marginTop: 6, padding: '8px 10px', background: '#F1F5F9', borderRadius: 6, fontSize: 12 }}>
                  <strong>Lý do làm ngoài giờ:</strong> "{selectedRecord.reason}"
                </div>
              </div>
            </div>

            {/* Financial estimate */}
            <div style={{ border: '1px solid #BBF7D0', borderRadius: 8, padding: 14, background: '#F0FDF4' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 6 }}>
                Dự Toán Chi Trả Tiền Lương Làm Thêm (OT Pay):
              </div>
              <div style={{ fontSize: 12.5, color: '#14532D', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{selectedRecord.totalHours}h × {selectedRecord.baseHourlyRate.toLocaleString('vi-VN')} ₫ × {selectedRecord.multiplier}:</span>
                <strong style={{ fontSize: 18, color: '#16A34A' }}>
                  {(selectedRecord.totalHours * selectedRecord.baseHourlyRate * selectedRecord.multiplier).toLocaleString('vi-VN')} ₫
                </strong>
              </div>
            </div>

            {selectedRecord.status === 'Chờ phê duyệt' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  style={{ flex: 1, borderColor: '#DC2626', color: '#DC2626' }}
                  icon={<CloseOutlined />}
                  onClick={() => handleAction(selectedRecord, 'Từ chối')}
                >
                  Từ Chối
                </Button>
                <Button
                  type="primary"
                  style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                  icon={<CheckOutlined />}
                  onClick={() => handleAction(selectedRecord, 'Đã duyệt OT')}
                >
                  Phê Duyệt Đơn OT
                </Button>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

