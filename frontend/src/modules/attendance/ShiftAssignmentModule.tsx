import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  SwapOutlined,
  CheckOutlined,
  CloseOutlined,
  UserOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseShiftAssignment {
  key: string;
  code: string;
  employeeName: string;
  empCode: string;
  department: string;
  position: string;
  shiftName: string;
  shiftCode: string;
  workHours: string;
  effectiveFrom: string;
  effectiveTo: string;
  swapWithEmployee?: string;
  swapReason?: string;
  status: 'Đang áp dụng' | 'Chờ duyệt đổi ca' | 'Đã kết thúc';
}

const INITIAL_ASSIGNMENTS: EnterpriseShiftAssignment[] = [];

export const ShiftAssignmentModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseShiftAssignment[]>(INITIAL_ASSIGNMENTS);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<EnterpriseShiftAssignment | null>(null);

  const activeCount = data.filter((d) => d.status === 'Đang áp dụng').length;
  const pendingSwapCount = data.filter((d) => d.status === 'Chờ duyệt đổi ca').length;

  const handleCreate = (values: any) => {
    const newItem: EnterpriseShiftAssignment = {
      ...values,
      key: String(Date.now()),
      empCode: values.empCode || `KY-${Math.floor(100 + Math.random() * 900)}`,
      status: 'Đang áp dụng',
    };
    setData([newItem, ...data]);
    message.success(`Đã phân ca làm việc thành công cho: ${values.employeeName}`);
    setModalOpen(false);
    form.resetFields();
  };

  const handleApproveSwap = (record: EnterpriseShiftAssignment) => {
    setData(
      data.map((d) =>
        d.key === record.key ? { ...d, status: 'Đang áp dụng' as const } : d
      )
    );
    message.success(`Đã phê duyệt đổi ca trực cho nhân sự: ${record.employeeName}`);
    setDrawerOpen(false);
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.shiftName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.empCode || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã phân ca & Nhân sự',
      key: 'code',
      render: (_: any, record: EnterpriseShiftAssignment) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CalendarOutlined style={{ color: '#009688', fontSize: 15 }} />
            {record.employeeName}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, marginTop: 2 }}>
            Mã: <code>{record.empCode}</code> · Phiếu: <strong>{record.code}</strong>
          </div>
        </div>
      ),
    },
    {
      title: 'Khối phòng ban & Vị trí',
      key: 'dept',
      width: 220,
      render: (_: any, record: EnterpriseShiftAssignment) => (
        <div>
          <div style={{ fontWeight: 600, color: '#334155', fontSize: 12.5 }}>{record.position}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>{record.department}</div>
        </div>
      ),
    },
    {
      title: 'Ca làm việc & Khung giờ',
      key: 'shift',
      width: 230,
      render: (_: any, record: EnterpriseShiftAssignment) => (
        <div>
          <div style={{ fontWeight: 700, color: '#2563EB', fontSize: 13 }}>{record.shiftName}</div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600 }}>{record.workHours}</div>
        </div>
      ),
    },
    {
      title: 'Thời hạn áp dụng',
      key: 'dates',
      width: 180,
      render: (_: any, record: EnterpriseShiftAssignment) => (
        <div style={{ fontSize: 11.5 }}>
          <div>Từ: <strong>{record.effectiveFrom}</strong></div>
          <div style={{ color: '#64748B' }}>Đến: <strong>{record.effectiveTo}</strong></div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => {
        let color = 'default';
        if (status === 'Đang áp dụng') color = 'success';
        if (status === 'Chờ duyệt đổi ca') color = 'warning';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterpriseShiftAssignment) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedAssignment(record);
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng nhân sự được phân ca</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} Nhân sự
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Phân bổ đầy đủ 100% phòng ban</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Lịch phân ca đang hiệu lực</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {activeCount} Cán bộ
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Tự động kích hoạt trên máy FaceID</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đơn đổi ca trực chờ duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {pendingSwapCount} Yêu cầu
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Cần Trưởng phòng kỹ thuật phê duyệt</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Độ phủ ca trực 24/7 IDC</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            100% Liên tục
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Đảm bảo SLA hạ tầng 99.99%</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả phân ca' },
            { key: 'Đang áp dụng', label: 'Đang áp dụng', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'Chờ duyệt đổi ca', label: 'Chờ duyệt đổi ca', icon: <SwapOutlined style={{ color: '#10B981' }} /> },
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
            placeholder="Tìm theo nhân sự, mã ca, phòng ban..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất danh sách phân ca')}>
            Xuất Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                code: `PC-2026-0${data.length + 1}`,
                shiftName: 'Ca Hành Chính Chuẩn',
                shiftCode: 'CA-HC-01',
                workHours: '08:00 - 17:30',
                department: 'Phòng Ban Kỹ Thuật',
                effectiveFrom: new Date().toISOString().substring(0, 10),
                effectiveTo: '2026-12-31',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Phân ca nhân sự mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Thêm phân ca mới */}
      <Modal
        title="Phân Ca Làm Việc Cho Cán Bộ Nhân Viên"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã phiếu phân ca" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="shiftName" label="Ca làm việc chỉ định" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Ca Hành Chính Chuẩn (08:00 - 17:30)', value: 'Ca Hành Chính Chuẩn' },
                  { label: 'Ca Sáng (07:00 - 11:30)', value: 'Ca Sáng Sớm' },
                  { label: 'Ca Chiều (13:00 - 17:30)', value: 'Ca Chiều Tối' },
                  { label: 'Ca Đêm Trực NOC IDC 24/7 (22:00 - 06:00)', value: 'Ca Đêm Trực NOC IDC 24/7' },
                  { label: 'Ca Linh Hoạt R&D (09:00 - 18:30)', value: 'Ca Linh Hoạt' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Họ tên nhân viên" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Trần Tuấn Anh" />
            </Form.Item>
            <Form.Item name="position" label="Chức danh đảm nhiệm" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Senior DevOps Engineer" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="department" label="Phòng ban trực thuộc" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Phòng Ban Kỹ Thuật', value: 'Phòng Ban Kỹ Thuật' },
                  { label: 'Khối Kinh Doanh & Tiếp Thị', value: 'Khối Kinh Doanh & Tiếp Thị' },
                  { label: 'Phòng Tài Chính Kế Toán', value: 'Phòng Tài Chính Kế Toán' },
                  { label: 'Phòng Nhân Sự & Hành Chính', value: 'Phòng Nhân Sự & Hành Chính' },
                  { label: 'Khối Vận Hành & Khách Hàng', value: 'Khối Vận Hành & Khách Hàng' },
                ]}
              />
            </Form.Item>
            <Form.Item name="workHours" label="Khung giờ ca" rules={[{ required: true }]}>
              <Input placeholder="08:00 - 17:30" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="effectiveFrom" label="Hiệu lực từ ngày" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="effectiveTo" label="Hiệu lực đến ngày" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận phân ca
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Phân Ca & Duyệt Đổi Ca */}
      <Drawer
        title="Lịch Phân Ca &amp; Xét Duyệt Yêu Cầu Đổi Ca"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={560}
      >
        {selectedAssignment && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedAssignment.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedAssignment.employeeName}
                  </div>
                </div>
                <Tag color={selectedAssignment.status === 'Đang áp dụng' ? 'success' : 'warning'}>
                  {selectedAssignment.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedAssignment.position} · {selectedAssignment.department} (Mã: {selectedAssignment.empCode})
              </div>
            </div>

            {/* Schedule Details */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Tin Ca Làm Việc:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Tên ca phân công:</span>
                  <strong style={{ color: '#2563EB' }}>{selectedAssignment.shiftName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Khung giờ chuẩn:</span>
                  <strong style={{ color: '#009688' }}>{selectedAssignment.workHours}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thời hạn áp dụng:</span>
                  <span>{selectedAssignment.effectiveFrom} ➔ {selectedAssignment.effectiveTo}</span>
                </div>
              </div>
            </div>

            {/* Swap Request details if any */}
            {selectedAssignment.status === 'Chờ duyệt đổi ca' && (
              <div style={{ border: '1px solid #FED7AA', borderRadius: 8, padding: 14, background: '#FFFBEB' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#D97706', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <SwapOutlined /> Thông Tin Đề Xuất Đổi Ca Trực:
                </div>
                <div style={{ fontSize: 12.5, color: '#1E293B', marginBottom: 6 }}>
                  Đổi ca chéo với: <strong>{selectedAssignment.swapWithEmployee}</strong>
                </div>
                <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', background: '#FFFFFF', padding: '8px 10px', borderRadius: 4, border: '1px solid #FED7AA' }}>
                  Lý do: "{selectedAssignment.swapReason}"
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <Button
                    style={{ flex: 1, borderColor: '#DC2626', color: '#DC2626' }}
                    icon={<CloseOutlined />}
                    onClick={() => {
                      message.info(`Đã từ chối đơn đổi ca của ${selectedAssignment.employeeName}`);
                      setDrawerOpen(false);
                    }}
                  >
                    Từ Chối Đổi Ca
                  </Button>
                  <Button
                    type="primary"
                    style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                    icon={<CheckOutlined />}
                    onClick={() => handleApproveSwap(selectedAssignment)}
                  >
                    Phê Duyệt Đổi Ca
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

