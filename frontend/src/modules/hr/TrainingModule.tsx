import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  BookOutlined,
  UsergroupAddOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  CalendarOutlined,
  ApartmentOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  TrophyOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Progress, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseTrainingCourse {
  key: string;
  courseCode: string;
  courseName: string;
  category: string;
  instructor: string;
  durationHours: number;
  startDate: string;
  endDate: string;
  participantsCount: number;
  completionRate: number; // %
  budget: number;
  location: string;
  status: 'Đang diễn ra' | 'Sắp khai giảng' | 'Đã hoàn thành';
}

const INITIAL_COURSES: EnterpriseTrainingCourse[] = [];

export const TrainingModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseTrainingCourse[]>(INITIAL_COURSES);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<EnterpriseTrainingCourse | null>(null);

  const totalParticipants = data.reduce((sum, item) => sum + item.participantsCount, 0);
  const totalHours = data.reduce((sum, item) => sum + item.durationHours, 0);
  const activeCourses = data.filter((d) => d.status === 'Đang diễn ra').length;

  const handleCreate = (values: any) => {
    const hours = Number(values.durationHours) || 8;
    const parts = Number(values.participantsCount) || 10;
    const newCourse: EnterpriseTrainingCourse = {
      ...values,
      key: String(Date.now()),
      durationHours: hours,
      participantsCount: parts,
      completionRate: 0,
      budget: Number(values.budget) || 10000000,
      location: values.location || 'Hội trường Tầng 3',
      endDate: values.endDate || '2026-09-30',
      status: 'Sắp khai giảng',
    };
    setData([newCourse, ...data]);
    message.success(`Đã tạo khóa đào tạo mới: ${values.courseName}`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.courseCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.courseName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.category || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.instructor || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã & Chương trình đào tạo',
      key: 'courseName',
      render: (_: any, r: EnterpriseTrainingCourse) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <BookOutlined style={{ color: '#009688', fontSize: 15 }} />
            {r.courseName}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, marginTop: 2 }}>
            Mã: <code>{r.courseCode}</code> · Nhóm: {r.category}
          </div>
        </div>
      ),
    },
    {
      title: 'Giảng viên',
      dataIndex: 'instructor',
      key: 'instructor',
      width: 180,
      render: (i: string) => <span style={{ fontWeight: 600, color: '#2563EB', fontSize: 12.5 }}>{i}</span>,
    },
    {
      title: 'Thời lượng & Học viên',
      key: 'info',
      width: 170,
      render: (_: any, r: EnterpriseTrainingCourse) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 12.5 }}>{r.durationHours} giờ đào tạo</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>{r.participantsCount} cán bộ nhân viên</div>
        </div>
      ),
    },
    {
      title: 'Tiến độ hoàn thành',
      key: 'rate',
      width: 180,
      render: (_: any, r: EnterpriseTrainingCourse) => (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 2 }}>
            <span>Đạt yêu cầu:</span>
            <strong style={{ color: r.completionRate === 100 ? '#16A34A' : '#009688' }}>{r.completionRate}%</strong>
          </div>
          <Progress percent={r.completionRate} size="small" strokeColor={r.completionRate === 100 ? '#16A34A' : '#009688'} showInfo={false} />
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
        if (status === 'Đang diễn ra') color = 'processing';
        if (status === 'Sắp khai giảng') color = 'warning';
        if (status === 'Đã hoàn thành') color = 'success';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 120,
      render: (_: any, record: EnterpriseTrainingCourse) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedCourse(record);
            setDrawerOpen(true);
          }}
        >
          Giáo trình
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng chương trình đào tạo nội bộ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} Khóa học
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>{activeCourses} khóa đang giảng dạy trực tiếp</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Lượt cán bộ nhân viên tham dự</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalParticipants} Lượt học viên
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>100% nhân sự tham gia tối thiểu 1 khóa/năm</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng giờ đào tạo tích lũy</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalHours * 4} Giờ chuẩn hóa
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Được cấp chứng chỉ năng lực nội bộ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ đạt chuẩn bài thi kiểm tra</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            96.4% Đạt yêu cầu
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Đánh giá sát hạch đầu ra nghiêm ngặt</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả chương trình' },
            { key: 'Đang diễn ra', label: 'Đang diễn ra', icon: <RocketOutlined style={{ color: '#6366F1' }} /> },
            { key: 'Sắp khai giảng', label: 'Sắp khai giảng', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Đã hoàn thành', label: 'Đã hoàn thành' },
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
            placeholder="Tìm theo mã khóa, tên khóa học, giảng viên..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất báo cáo kế hoạch đào tạo')}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                courseCode: `DT-2026/0${data.length + 1}`,
                category: 'Công nghệ & Kỹ thuật',
                durationHours: 16,
                participantsCount: 25,
                budget: 15000000,
                startDate: new Date().toISOString().substring(0, 10),
                endDate: new Date(Date.now() + 15 * 86400000).toISOString().substring(0, 10),
                location: 'Hội trường Tầng 3 & Trực tuyến',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Mở khóa đào tạo
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Mở khóa đào tạo mới */}
      <Modal
        title="Lập Kế Hoạch &amp; Khai Giảng Khóa Đào Tạo Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="courseCode" label="Mã khóa học" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="category" label="Chuyên ngành đào tạo" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Bảo mật & Tuân thủ ISO', value: 'Bảo mật & Tuân thủ' },
                  { label: 'Công nghệ & Kỹ thuật', value: 'Công nghệ & Kỹ thuật' },
                  { label: 'Kinh doanh & Kỹ năng mềm', value: 'Kinh doanh & Kỹ năng mềm' },
                  { label: 'Tài chính & Quản trị', value: 'Tài chính & Quản trị' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="courseName" label="Tên chương trình đào tạo" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Nâng cao kỹ năng phân tích Logs và bảo vệ chống tấn công DDoS" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="instructor" label="Giảng viên / Chuyên gia đào tạo" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Trần Tuấn Anh (CTO)" />
            </Form.Item>
            <Form.Item name="location" label="Địa điểm / Hình thức học">
              <Input placeholder="Ví dụ: Hội trường Tầng 3 / Google Meet" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="durationHours" label="Thời lượng (Giờ)">
              <Input type="number" min={1} />
            </Form.Item>
            <Form.Item name="participantsCount" label="Chỉ tiêu học viên">
              <Input type="number" min={1} />
            </Form.Item>
            <Form.Item name="budget" label="Kinh phí dự kiến (VNĐ)">
              <Input type="number" step={1000000} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="startDate" label="Ngày bắt đầu" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="endDate" label="Ngày kết thúc" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Ban hành khóa đào tạo
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Khóa Đào Tạo */}
      <Drawer
        title="Thông Tin Khóa Học &amp; Danh Sách Học Viên Đăng Ký"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedCourse && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedCourse.courseCode}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                {selectedCourse.courseName}
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Chuyên ngành: <strong>{selectedCourse.category}</strong> · <Tag color="processing">{selectedCourse.status}</Tag>
              </div>
            </div>

            {/* Course Details */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Thông Tin Khung Chương Trình:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Giảng viên hướng dẫn:</span>
                  <strong style={{ color: '#2563EB' }}>{selectedCourse.instructor}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Địa điểm tổ chức:</span>
                  <strong>{selectedCourse.location}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thời lượng đào tạo:</span>
                  <strong>{selectedCourse.durationHours} Giờ chuẩn hóa</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thời gian học:</span>
                  <strong>{selectedCourse.startDate} ➔ {selectedCourse.endDate}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Kinh phí đào tạo:</span>
                  <strong style={{ color: '#16A34A' }}>{selectedCourse.budget.toLocaleString('vi-VN')} ₫</strong>
                </div>
              </div>
            </div>

            {/* Completion */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Tỷ Lệ Tốt Nghiệp &amp; Cấp Chứng Nhận:
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12.5 }}>
                <span>Tiến độ hoàn thành bài kiểm tra cuối khóa:</span>
                <strong style={{ color: '#009688' }}>{selectedCourse.completionRate}%</strong>
              </div>
              <Progress percent={selectedCourse.completionRate} strokeColor="#009688" />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                style={{ flex: 1 }}
                onClick={() => message.success(`Đã xuất danh sách ${selectedCourse.participantsCount} học viên điểm danh`)}
              >
                Xuất DS Điểm Danh
              </Button>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => message.success(`Đã cấp chứng chỉ số cho học viên hoàn thành xuất sắc khóa học`)}
              >
                Cấp Chứng Chỉ Số
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
