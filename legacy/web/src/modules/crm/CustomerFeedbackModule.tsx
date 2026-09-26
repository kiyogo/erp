import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CustomerServiceOutlined,
  StarFilled,
  CheckCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
  PrinterOutlined,
  EyeOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
  StarOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip, Progress } from '../../custom-ui';

export interface EnterpriseFeedbackItem {
  key: string;
  feedbackCode: string;
  clientName: string;
  contactPerson: string;
  phone: string;
  serviceName: string;
  rating: number; // 1-5 sao
  content: string;
  priority: 'Khẩn cấp' | 'Cao' | 'Trung bình';
  resolutionAction: string;
  assignedStaff: string;
  receivedDate: string;
  resolvedDate?: string;
  status: 'Đã giải quyết thỏa đáng' | 'Đang xử lý';
}

const INITIAL_FEEDBACK: EnterpriseFeedbackItem[] = [];

export const CustomerFeedbackModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseFeedbackItem[]>(INITIAL_FEEDBACK);

  useEffect(() => {
    const list = dataService.getGenericData('crm_feedback');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('crm_feedback');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<EnterpriseFeedbackItem | null>(null);

  const avgRating = (data.reduce((sum, item) => sum + item.rating, 0) / (data.length || 1)).toFixed(1);
  const resolvedCount = data.filter((d) => d.status === 'Đã giải quyết thỏa đáng').length;
  const inProgressCount = data.filter((d) => d.status === 'Đang xử lý').length;
  const urgentCount = data.filter((d) => d.priority === 'Khẩn cấp').length;

  const handleCreate = (values: any) => {
    const newFb: EnterpriseFeedbackItem = {
      ...values,
      key: String(Date.now()),
      rating: Number(values.rating) || 5,
      receivedDate: new Date().toISOString().substring(0, 10),
      contactPerson: values.contactPerson || 'Đại diện đối tác',
      phone: values.phone || '0900 000 000',
      status: 'Đang xử lý',
    };
    const nextItems = [newFb, ...data]; setData(nextItems); dataService.saveGenericData('crm_feedback', nextItems);
    message.success(`Đã tiếp nhận phản ánh từ khách hàng: ${values.clientName}`);
    setModalOpen(false);
    form.resetFields();
  };

  const handleResolve = (record: EnterpriseFeedbackItem) => {
    const updated = data.map((d) =>
      d.key === record.key
        ? {
            ...d,
            status: 'Đã giải quyết thỏa đáng' as const,
            resolvedDate: new Date().toISOString().substring(0, 10),
          }
        : d
    );
    setData(updated);
    dataService.saveGenericData('crm_feedback', updated);
    message.success(`Đã đánh dấu giải quyết thỏa đáng phản ánh: ${record.feedbackCode}`);
    if (selectedFeedback && selectedFeedback.key === record.key) {
      setSelectedFeedback({
        ...selectedFeedback,
        status: 'Đã giải quyết thỏa đáng',
        resolvedDate: new Date().toISOString().substring(0, 10),
      });
    }
  };

  const filteredData = data.filter((item) => {
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === '5sao' && item.rating === 5) ||
      (statusFilter === 'Đang xử lý' && item.status === 'Đang xử lý') ||
      (statusFilter === 'Khẩn cấp' && item.priority === 'Khẩn cấp');

    const matchSearch =
      (item.feedbackCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.clientName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.serviceName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.content || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.assignedStaff || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã phản ánh & Ngày nhận',
      key: 'feedbackCode',
      render: (_: any, record: EnterpriseFeedbackItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CustomerServiceOutlined /> {record.feedbackCode}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{record.receivedDate}</div>
        </div>
      ),
    },
    {
      title: 'Khách hàng & Dịch vụ',
      key: 'client',
      render: (_: any, record: EnterpriseFeedbackItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.clientName}</div>
          <div style={{ fontSize: 11.5, color: '#2563EB' }}>Dịch vụ: {record.serviceName}</div>
        </div>
      ),
    },
    {
      title: 'Đánh giá CSAT',
      dataIndex: 'rating',
      key: 'rating',
      width: 140,
      render: (r: number) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, color: '#F59E0B' }}>
          {[...Array(5)].map((_, i) => (
            <StarFilled key={i} style={{ color: i < r ? '#F59E0B' : '#E2E8F0', fontSize: 13 }} />
          ))}
          <span style={{ fontWeight: 700, color: '#0F172A', marginLeft: 4, fontSize: 12.5 }}>({r}/5)</span>
        </div>
      ),
      sorter: (a: EnterpriseFeedbackItem, b: EnterpriseFeedbackItem) => a.rating - b.rating,
    },
    {
      title: 'Mức độ ưu tiên',
      dataIndex: 'priority',
      key: 'priority',
      width: 120,
      render: (p: string) => {
        let color = 'default';
        if (p === 'Khẩn cấp') color = 'error';
        if (p === 'Cao') color = 'warning';
        if (p === 'Trung bình') color = 'processing';
        return <Tag color={color}>{p}</Tag>;
      },
    },
    {
      title: 'Cán bộ xử lý',
      dataIndex: 'assignedStaff',
      key: 'assignedStaff',
      render: (st: string) => (
        <span style={{ color: '#334155', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
          <UserOutlined /> {st}
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (status: string) => {
        const isDone = status === 'Đã giải quyết thỏa đáng';
        return <Tag color={isDone ? 'success' : 'warning'}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 160,
      render: (_: any, record: EnterpriseFeedbackItem) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedFeedback(record);
              setDrawerOpen(true);
            }}
          >
            Chi tiết
          </Button>
          {record.status !== 'Đã giải quyết thỏa đáng' && (
            <Button
              size="small"
              type="primary"
              onClick={() => handleResolve(record)}
              style={{ backgroundColor: '#10B981', borderColor: '#10B981' }}
            >
              Xong
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chỉ số hài lòng khách hàng (CSAT)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <StarFilled style={{ fontSize: 22 }} /> {avgRating} / 5.0 sao
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>94.2% Khách hàng đánh giá Rất Tốt</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ giải quyết thỏa đáng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {Math.round((resolvedCount / (data.length || 1)) * 100)}% hoàn thành
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>{resolvedCount} / {data.length} Vụ việc đã đóng hồ sơ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Vụ việc đang theo dõi &amp; xử lý</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: inProgressCount > 0 ? '#2563EB' : '#64748B', marginTop: 4 }}>
            {inProgressCount} sự vụ
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Cam kết thời gian phản hồi ≤ 2 giờ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Sự cố mức độ Khẩn cấp</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: urgentCount > 0 ? '#DC2626' : '#16A34A', marginTop: 4 }}>
            {urgentCount} vụ việc
          </div>
          <div style={{ fontSize: 11.5, color: urgentCount > 0 ? '#DC2626' : '#16A34A', marginTop: 2 }}>Không có vụ việc tồn đọng quá hạn</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả phản ánh' },
            { key: '5sao', label: '5 Sao (Rất hài lòng)', icon: <StarOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Đang xử lý', label: 'Đang xử lý', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Khẩn cấp', label: 'Khẩn cấp', icon: <CloseCircleOutlined style={{ color: '#EF4444' }} /> },
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
            placeholder="Tìm theo mã, khách hàng, dịch vụ, nội dung..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất báo cáo khảo sát CSAT')}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                feedbackCode: `FB-2026-0${data.length + 1}`,
                rating: 5,
                priority: 'Cao',
                assignedStaff: 'Lê Hoàng Yến (Sales Lead)',
                resolutionAction: 'Đã liên hệ trực tiếp và cập nhật phương án khắc phục',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Tiếp nhận phản ánh mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Thêm phản ánh mới */}
      <Modal
        title="Ghi Nhận Phản Ánh &amp; Khiếu Nại Khách Hàng"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={620}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="feedbackCode" label="Mã phản hồi" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="rating" label="Đánh giá sao CSAT" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: '5 Sao (Rất hài lòng)', value: 5 },
                  { label: '4 Sao (Hài lòng)', value: 4 },
                  { label: '3 Sao (Bình thường)', value: 3 },
                  { label: '2 Sao (Không hài lòng)', value: 2 },
                  { label: '1 Sao (Rất thất vọng)', value: 1 },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="clientName" label="Tên Đối tác / Khách hàng" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Công Ty TNHH Logistics VinaTrans" />
            </Form.Item>
            <Form.Item name="contactPerson" label="Người phản ánh">
              <Input placeholder="Ví dụ: Anh Đỗ Hải Nam" />
            </Form.Item>
          </div>

          <Form.Item name="serviceName" label="Dịch vụ liên quan" initialValue="Dịch vụ Hạ Tầng Cloud Server" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item name="content" label="Nội dung ý kiến phản ánh" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="Chi tiết phản ánh, khiếu nại hoặc góp ý của khách hàng..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="priority" label="Độ ưu tiên" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Khẩn cấp (Xử lý ngay lập tức)', value: 'Khẩn cấp' },
                  { label: 'Cao (Xử lý trong 4 giờ)', value: 'Cao' },
                  { label: 'Trung bình (Xử lý trong 24 giờ)', value: 'Trung bình' },
                ]}
              />
            </Form.Item>
            <Form.Item name="assignedStaff" label="Cán bộ phụ trách xử lý" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </div>

          <Form.Item name="resolutionAction" label="Biện pháp xử lý &amp; Cam kết khắc phục">
            <Input />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Tiếp nhận ý kiến
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Phản Ánh & Biên Bản Xử Lý */}
      <Drawer
        title="Biên Bản Tiếp Nhận &amp; Xử Lý Ý Kiến Khách Hàng (CSAT)"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedFeedback && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ VỤ VIỆC: {selectedFeedback.feedbackCode}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedFeedback.clientName}
                  </div>
                </div>
                <Tag color={selectedFeedback.status === 'Đã giải quyết thỏa đáng' ? 'success' : 'warning'}>
                  {selectedFeedback.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Người gửi: <strong>{selectedFeedback.contactPerson}</strong> ({selectedFeedback.phone}) · Ngày: {selectedFeedback.receivedDate}
              </div>
            </div>

            {/* Satisfaction Rating */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
                Đánh Giá Hài Lòng Khách Hàng (CSAT):
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#F59E0B', fontSize: 16 }}>
                {[...Array(5)].map((_, i) => (
                  <StarFilled key={i} style={{ color: i < selectedFeedback.rating ? '#F59E0B' : '#CBD5E1' }} />
                ))}
                <span style={{ fontWeight: 800, color: '#0F172A', marginLeft: 8, fontSize: 15 }}>
                  {selectedFeedback.rating} / 5 Điểm
                </span>
              </div>
              <div style={{ marginTop: 8, fontSize: 12.5, color: '#475569' }}>
                Dịch vụ liên quan: <strong>{selectedFeedback.serviceName}</strong> · Độ ưu tiên: <Tag color={selectedFeedback.priority === 'Khẩn cấp' ? 'error' : 'warning'}>{selectedFeedback.priority}</Tag>
              </div>
            </div>

            {/* Feedback Content */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
                Chi Tiết Nội Dung Ý Kiến Khách Hàng:
              </div>
              <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, fontStyle: 'italic' }}>
                "{selectedFeedback.content}"
              </div>
            </div>

            {/* Corrective Action CAPA */}
            <div style={{ border: '1px solid #BBF7D0', borderRadius: 8, padding: 14, background: '#F0FDF4' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircleOutlined /> Biện Pháp Khắc Phục &amp; Cam Kết Chất Lượng:
              </div>
              <div style={{ fontSize: 13, color: '#14532D', lineHeight: 1.5 }}>
                {selectedFeedback.resolutionAction}
              </div>
              <div style={{ fontSize: 12, color: '#166534', marginTop: 6 }}>
                Cán bộ phụ trách: <strong>{selectedFeedback.assignedStaff}</strong>
                {selectedFeedback.resolvedDate && <span> · Ngày đóng hồ sơ: {selectedFeedback.resolvedDate}</span>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {selectedFeedback.status !== 'Đã giải quyết thỏa đáng' && (
                <Button
                  type="primary"
                  style={{ flex: 1, backgroundColor: '#10B981', borderColor: '#10B981' }}
                  onClick={() => handleResolve(selectedFeedback)}
                >
                  Xác Nhận Khách Hàng Hài Lòng &amp; Đóng Hồ Sơ
                </Button>
              )}
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã in biên bản xử lý phản ánh ${selectedFeedback.feedbackCode}`)}
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

