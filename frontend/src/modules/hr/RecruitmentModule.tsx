import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  UsergroupAddOutlined,
  CheckCircleOutlined,
  ScheduleOutlined,
  EyeOutlined,
  UserOutlined,
  DollarOutlined,
  CalendarOutlined,
  ApartmentOutlined,
  SolutionOutlined,
  SendOutlined,
  TeamOutlined,
  RocketOutlined,
  AimOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Progress, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseJobOpening {
  key: string;
  jobCode: string;
  title: string;
  department: string;
  level: 'Fresher' | 'Junior' | 'Senior' | 'Lead' | 'Manager';
  headcountNeeded: number;
  candidatesApplied: number;
  interviewedCount: number;
  offeredCount: number;
  salaryRange: string;
  deadline: string;
  recruiter: string;
  experienceReq: string;
  status: 'Đang tuyển dụng' | 'Đã đủ chỉ tiêu' | 'Tạm dừng';
}

const INITIAL_JOBS: EnterpriseJobOpening[] = [];

export const RecruitmentModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseJobOpening[]>(INITIAL_JOBS);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<EnterpriseJobOpening | null>(null);

  const totalNeeded = data.filter((d) => d.status === 'Đang tuyển dụng').reduce((sum, item) => sum + item.headcountNeeded, 0);
  const totalCVs = data.reduce((sum, item) => sum + item.candidatesApplied, 0);
  const totalHired = data.reduce((sum, item) => sum + item.offeredCount, 0);

  const handleCreate = (values: any) => {
    const newJob: EnterpriseJobOpening = {
      ...values,
      key: String(Date.now()),
      headcountNeeded: Number(values.headcountNeeded) || 1,
      candidatesApplied: 0,
      interviewedCount: 0,
      offeredCount: 0,
      status: 'Đang tuyển dụng',
    };
    setData([newJob, ...data]);
    message.success(`Đã đăng tin tuyển dụng: ${values.title} (${values.jobCode})`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.jobCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.title || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.recruiter || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã & Vị trí tuyển dụng',
      key: 'title',
      render: (_: any, r: EnterpriseJobOpening) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <SolutionOutlined style={{ color: '#009688', fontSize: 16 }} />
            {r.title}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2, fontWeight: 600 }}>
            Mã: <code>{r.jobCode}</code> · Cấp bậc: <Tag color="blue" style={{ fontSize: 10.5 }}>{r.level}</Tag> · {r.department}
          </div>
        </div>
      ),
    },
    {
      title: 'Tiến độ tuyển dụng',
      key: 'progress',
      width: 180,
      render: (_: any, r: EnterpriseJobOpening) => {
        const percent = Math.round((r.offeredCount / r.headcountNeeded) * 100);
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 2 }}>
              <span>Đã tuyển: <strong>{r.offeredCount}/{r.headcountNeeded}</strong></span>
              <span style={{ color: '#009688', fontWeight: 700 }}>{percent}%</span>
            </div>
            <Progress percent={percent} size="small" strokeColor="#009688" showInfo={false} />
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>
              {r.candidatesApplied} CV nộp · {r.interviewedCount} Phỏng vấn
            </div>
          </div>
        );
      },
    },
    {
      title: 'Mức lương dự kiến',
      dataIndex: 'salaryRange',
      key: 'salaryRange',
      width: 170,
      render: (sal: string) => <span style={{ fontWeight: 700, color: '#16A34A', fontSize: 13 }}>{sal}</span>,
    },
    {
      title: 'Hạn nộp & HR phụ trách',
      key: 'deadline',
      width: 180,
      render: (_: any, r: EnterpriseJobOpening) => (
        <div>
          <div style={{ fontSize: 12, color: '#0F172A', fontWeight: 600 }}>
            <CalendarOutlined /> {r.deadline}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 1 }}>
            HR: <strong style={{ color: '#009688' }}>{r.recruiter}</strong>
          </div>
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
        if (status === 'Đang tuyển dụng') color = 'success';
        if (status === 'Đã đủ chỉ tiêu') color = 'processing';
        if (status === 'Tạm dừng') color = 'warning';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 120,
      render: (_: any, record: EnterpriseJobOpening) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedJob(record);
            setDrawerOpen(true);
          }}
        >
          Phễu CV
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chỉ tiêu cần tuyển đang mở</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            {totalNeeded} Chỉ tiêu
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>Ưu tiên tuyển khối Kỹ thuật &amp; Kinh doanh</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng lượng hồ sơ CV tiếp nhận</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalCVs} Ứng viên
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Nguồn qua LinkedIn, TopCV &amp; Nội bộ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhân sự đã tuyển &amp; Nhận việc</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalHired} Ứng viên đỗ
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Tỷ lệ Offer Acceptance đạt 92%</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thời gian tuyển dụng trung bình (Time-to-Hire)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            16.5 Ngày
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Tối ưu nhanh hơn SLA thị trường 25%</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả vị trí' },
            { key: 'Đang tuyển dụng', label: 'Đang tuyển', icon: <RocketOutlined style={{ color: '#6366F1' }} /> },
            { key: 'Đã đủ chỉ tiêu', label: 'Đã đủ chỉ tiêu' },
            { key: 'Tạm dừng', label: 'Tạm dừng' },
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
            placeholder="Tìm theo mã vị trí, chức danh, phòng ban..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất báo cáo tuyển dụng')}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                jobCode: `TD-2026/0${data.length + 1}`,
                level: 'Senior',
                headcountNeeded: 2,
                salaryRange: '25 - 40 Triệu ₫',
                department: 'Phòng Ban Kỹ Thuật',
                recruiter: 'Nguyễn Thị Mai',
                deadline: new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10),
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Đăng tin tuyển dụng
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Thêm vị trí mới */}
      <Modal
        title="Đăng Tin Tuyển Dụng Vị Trí Mới (Job Description)"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="jobCode" label="Mã vị trí" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban tiếp nhận" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Phòng Ban Kỹ Thuật', value: 'Phòng Ban Kỹ Thuật' },
                  { label: 'Khối Kinh Doanh & Tiếp Thị', value: 'Khối Kinh Doanh & Tiếp Thị' },
                  { label: 'Phòng Tài Chính Kế Toán', value: 'Phòng Tài Chính Kế Toán' },
                  { label: 'Phòng Nhân Sự & Hành Chính', value: 'Phòng Nhân Sự & Hành Chính' },
                ]}
              />
            </Form.Item>
            <Form.Item name="level" label="Cấp bậc vị trí">
              <Select
                options={[
                  { label: 'Fresher', value: 'Fresher' },
                  { label: 'Junior', value: 'Junior' },
                  { label: 'Senior', value: 'Senior' },
                  { label: 'Lead / Chuyên gia', value: 'Lead' },
                  { label: 'Manager / Quản lý', value: 'Manager' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="title" label="Tên vị trí / Chức danh tuyển dụng" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Kỹ Sư Cloud Architecture & Kubernetes" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="headcountNeeded" label="Chỉ tiêu số lượng" rules={[{ required: true }]}>
              <Input type="number" min={1} />
            </Form.Item>
            <Form.Item name="salaryRange" label="Khung lương thỏa thuận">
              <Input placeholder="Ví dụ: 30 - 45 Triệu ₫" />
            </Form.Item>
          </div>

          <Form.Item name="experienceReq" label="Yêu cầu kinh nghiệm & Kỹ năng cốt lõi">
            <Input placeholder="Ví dụ: 3+ năm làm việc với Docker/K8s, CI/CD và kiến trúc Microservices" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="recruiter" label="HR Phụ trách tuyển dụng">
              <Input />
            </Form.Item>
            <Form.Item name="deadline" label="Hạn chót nhận hồ sơ" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Ban hành tin tuyển dụng
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Phễu Tuyển Dụng */}
      <Drawer
        title="Phễu Ứng Viên &amp; Tiến Độ Tuyển Dụng (Recruitment Pipeline)"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={620}
      >
        {selectedJob && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedJob.jobCode}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                {selectedJob.title}
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Phòng ban: <strong>{selectedJob.department}</strong> · Cấp bậc: <Tag color="blue">{selectedJob.level}</Tag>
              </div>
            </div>

            {/* Pipeline Stage Funnel */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>
                Phễu Chuyển Đổi Tuyển Dụng (Funnel Metrics):
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
                <div style={{ background: '#EFF6FF', padding: '10px 6px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#2563EB', fontWeight: 600 }}>1. CV Nộp</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#1D4ED8', marginTop: 2 }}>{selectedJob.candidatesApplied}</div>
                </div>
                <div style={{ background: '#FDF4FF', padding: '10px 6px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#9333EA', fontWeight: 600 }}>2. Phỏng vấn</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#7E22CE', marginTop: 2 }}>{selectedJob.interviewedCount}</div>
                </div>
                <div style={{ background: '#FEF3C7', padding: '10px 6px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#D97706', fontWeight: 600 }}>3. Gửi Offer</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#B45309', marginTop: 2 }}>{selectedJob.offeredCount}</div>
                </div>
                <div style={{ background: '#F0FDF4', padding: '10px 6px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>4. Mục tiêu</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#15803D', marginTop: 2 }}>{selectedJob.headcountNeeded}</div>
                </div>
              </div>
            </div>

            {/* Requirements */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Yêu Cầu &amp; Chế Độ Đãi Ngộ:
              </div>
              <div style={{ fontSize: 12.5, color: '#334155', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div><DollarOutlined style={{ color: '#10B981', marginRight: 6 }} />Mức lương: <strong style={{ color: '#16A34A' }}>{selectedJob.salaryRange}</strong></div>
                <div><AimOutlined style={{ color: '#EF4444', marginRight: 6 }} />Yêu cầu: <strong>{selectedJob.experienceReq}</strong></div>
                <div><CalendarOutlined style={{ color: '#3B82F6', marginRight: 6 }} />Hạn chót: <strong>{selectedJob.deadline}</strong></div>
                <div><UserOutlined style={{ color: '#6366F1', marginRight: 6 }} />HR phụ trách: <strong>{selectedJob.recruiter}</strong></div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                style={{ flex: 1 }}
                onClick={() => message.success(`Đã sao chép link JD tuyển dụng vị trí ${selectedJob.title}`)}
              >
                Copy Link Đăng Tuyển
              </Button>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => message.success(`Đã mở danh sách ${selectedJob.candidatesApplied} hồ sơ ứng viên`)}
              >
                Xem Hồ Sơ Ứng Viên ({selectedJob.candidatesApplied})
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

