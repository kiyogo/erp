import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  UserAddOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  CheckOutlined,
  CalendarOutlined,
  UserOutlined,
  BookOutlined,
  IdcardOutlined,
  LaptopOutlined,
  RocketOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Progress, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseOnboardingTask {
  key: string;
  employeeName: string;
  empCode: string;
  position: string;
  department: string;
  startDate: string;
  evaluationDate: string;
  mentor: string;
  mentorPhone: string;
  progress: number;
  currentStep: string;
  laptopProvided: boolean;
  emailCreated: boolean;
  contractSigned: boolean;
  status: 'Đang hội nhập' | 'Đã hoàn thành' | 'Cần hỗ trợ';
}

const INITIAL_ONBOARDING: EnterpriseOnboardingTask[] = [];

export const OnboardingModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseOnboardingTask[]>(INITIAL_ONBOARDING);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<EnterpriseOnboardingTask | null>(null);

  const ongoingCount = data.filter((d) => d.status === 'Đang hội nhập').length;
  const completedCount = data.filter((d) => d.status === 'Đã hoàn thành').length;

  const handleCreate = (values: any) => {
    const start = values.startDate || new Date().toISOString().substring(0, 10);
    const evalDate = new Date(new Date(start).getTime() + 60 * 86400000).toISOString().substring(0, 10);
    const newHire: EnterpriseOnboardingTask = {
      ...values,
      key: String(Date.now()),
      empCode: values.empCode || `KY-${Math.floor(100 + Math.random() * 900)}`,
      startDate: start,
      evaluationDate: evalDate,
      progress: 15,
      currentStep: 'Tiếp nhận bàn giao thiết bị & Đào tạo văn hóa hội nhập',
      laptopProvided: true,
      emailCreated: true,
      contractSigned: false,
      status: 'Đang hội nhập',
    };
    setData([newHire, ...data]);
    message.success(`Đã tạo lộ trình Onboarding 60 ngày cho: ${values.employeeName}`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.position || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.mentor || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Nhân sự mới & Vị trí',
      key: 'name',
      render: (_: any, record: EnterpriseOnboardingTask) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <UserAddOutlined style={{ color: '#009688', fontSize: 15 }} />
            {record.employeeName}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, marginTop: 2 }}>
            Mã: <code>{record.empCode}</code> · {record.position}
          </div>
        </div>
      ),
    },
    {
      title: 'Khối phòng ban & Mentor',
      key: 'mentor',
      width: 220,
      render: (_: any, record: EnterpriseOnboardingTask) => (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#2563EB' }}>{record.mentor}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>{record.department}</div>
        </div>
      ),
    },
    {
      title: 'Tiến độ hội nhập 60 ngày',
      key: 'progress',
      width: 190,
      render: (_: any, record: EnterpriseOnboardingTask) => (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 2 }}>
            <span>Checklist hoàn tất:</span>
            <strong style={{ color: record.progress === 100 ? '#16A34A' : '#009688' }}>{record.progress}%</strong>
          </div>
          <Progress percent={record.progress} size="small" strokeColor={record.progress === 100 ? '#16A34A' : '#009688'} showInfo={false} />
        </div>
      ),
    },
    {
      title: 'Thời gian thử việc',
      key: 'dates',
      width: 170,
      render: (_: any, record: EnterpriseOnboardingTask) => (
        <div style={{ fontSize: 11.5 }}>
          <div>Bắt đầu: <strong>{record.startDate}</strong></div>
          <div style={{ color: '#64748B' }}>Đánh giá: <strong>{record.evaluationDate}</strong></div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => {
        let color = 'default';
        if (status === 'Đang hội nhập') color = 'processing';
        if (status === 'Đã hoàn thành') color = 'success';
        if (status === 'Cần hỗ trợ') color = 'error';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 120,
      render: (_: any, record: EnterpriseOnboardingTask) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedTask(record);
            setDrawerOpen(true);
          }}
        >
          Checklist
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhân sự mới tiếp nhận Onboarding</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} Nhân sự
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Quy trình hội nhập chuẩn hóa 60 ngày</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đang trong lộ trình thử việc</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {ongoingCount} Nhân viên mới
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Có Buddy &amp; Mentor 1:1 kèm cặp sát sao</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã hoàn tất &amp; Ký HĐ chính thức</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {completedCount} Cán bộ xuất sắc
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Vượt qua bài sát hạch thử việc 100%</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ vượt qua thử việc chung</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            96.8% Đạt chuẩn
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Đánh giá chất lượng tuyển dụng xuất sắc</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả tân tuyển' },
            { key: 'Đang hội nhập', label: 'Đang hội nhập', icon: <RocketOutlined style={{ color: '#6366F1' }} /> },
            { key: 'Đã hoàn thành', label: 'Đã hoàn thành', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'Cần hỗ trợ', label: 'Cần hỗ trợ', icon: <WarningOutlined style={{ color: '#F59E0B' }} /> },
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
            placeholder="Tìm theo tên, phòng ban, Mentor..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất báo cáo Onboarding')}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                department: 'Phòng Ban Kỹ Thuật',
                startDate: new Date().toISOString().substring(0, 10),
                mentor: 'Trần Tuấn Anh (CTO)',
                mentorPhone: '0988.776.655',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Tiếp nhận nhân sự mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Thêm Onboarding Mới */}
      <Modal
        title="Tiếp Nhận Nhân Sự Mới &amp; Khởi Tạo Lộ Trình Onboarding"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Họ tên nhân viên mới" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Đỗ Hải Nam" />
            </Form.Item>
            <Form.Item name="position" label="Vị trí / Chức danh tuyển dụng" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Senior Backend Engineer" />
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
            <Form.Item name="startDate" label="Ngày bắt đầu đi làm" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="mentor" label="Người hướng dẫn (Mentor / Buddy)" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Hoàng Quốc Dũng (Senior Lead)" />
            </Form.Item>
            <Form.Item name="mentorPhone" label="Số điện thoại Mentor">
              <Input placeholder="Ví dụ: 0912.345.678" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Khởi tạo lộ trình Onboarding
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Checklist Onboarding */}
      <Drawer
        title="Lộ Trình Hội Nhập 60 Ngày &amp; Checklist Tân Tuyển"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedTask && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedTask.empCode}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedTask.employeeName}
                  </div>
                </div>
                <Tag color={selectedTask.status === 'Đã hoàn thành' ? 'success' : 'processing'}>
                  {selectedTask.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Vị trí: <strong>{selectedTask.position}</strong> · {selectedTask.department}
              </div>
            </div>

            {/* Mentor Info */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Thông Tin Kèm Cặp &amp; Thời Hạn:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Người hướng dẫn (Mentor):</span>
                  <strong style={{ color: '#2563EB' }}>{selectedTask.mentor} ({selectedTask.mentorPhone || 'N/A'})</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thời gian thử việc:</span>
                  <strong>{selectedTask.startDate} ➔ {selectedTask.evaluationDate}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Giai đoạn hiện tại:</span>
                  <strong style={{ color: '#009688' }}>{selectedTask.currentStep}</strong>
                </div>
              </div>
            </div>

            {/* 5-Step Checklist */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Checklist 5 Giai Đoạn Onboarding Bắt Buộc:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircleOutlined style={{ color: '#16A34A', fontSize: 16 }} />
                  <div>
                    <strong>Giai đoạn 1: Trang bị thiết bị &amp; Tài khoản</strong>
                    <div style={{ fontSize: 11.5, color: '#64748B' }}>Laptop cấu hình cao, Email @kiyovn.com, VPN, Thẻ nhân viên</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircleOutlined style={{ color: '#16A34A', fontSize: 16 }} />
                  <div>
                    <strong>Giai đoạn 2: Đào tạo văn hóa &amp; Quy định công ty</strong>
                    <div style={{ fontSize: 11.5, color: '#64748B' }}>Nội quy lao động, Bảo mật ISO 27001, Cấu trúc phòng ban</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircleOutlined style={{ color: selectedTask.progress >= 40 ? '#16A34A' : '#94A3B8', fontSize: 16 }} />
                  <div>
                    <strong>Giai đoạn 3: Training chuyên môn 1:1 cùng Mentor</strong>
                    <div style={{ fontSize: 11.5, color: '#64748B' }}>Tìm hiểu source code, bộ giải pháp Cloud &amp; quy trình làm việc</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircleOutlined style={{ color: selectedTask.progress >= 80 ? '#16A34A' : '#94A3B8', fontSize: 16 }} />
                  <div>
                    <strong>Giai đoạn 4: Thực thi Task thực tế &amp; Đánh giá giữa kỳ</strong>
                    <div style={{ fontSize: 11.5, color: '#64748B' }}>Bàn giao module đầu tiên, họp 1:1 phản hồi tiến độ tháng 1</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircleOutlined style={{ color: selectedTask.progress === 100 ? '#16A34A' : '#94A3B8', fontSize: 16 }} />
                  <div>
                    <strong>Giai đoạn 5: Báo cáo thử việc &amp; Ký HĐLĐ chính thức</strong>
                    <div style={{ fontSize: 11.5, color: '#64748B' }}>Hội đồng đánh giá thử việc nghiệm thu và chuyển tiếp nhân sự chính thức</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            {selectedTask.status === 'Đang hội nhập' && (
              <Button
                type="primary"
                icon={<CheckOutlined />}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => {
                  setData(data.map((d) => (d.key === selectedTask.key ? { ...d, progress: 100, status: 'Đã hoàn thành' } : d)));
                  message.success(`Đã nghiệm thu và phê duyệt ký hợp đồng chính thức cho ${selectedTask.employeeName}`);
                  setDrawerOpen(false);
                }}
              >
                Nghiệm Thu Thử Việc Xuất Sắc &amp; Ký HĐLĐ
              </Button>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

