import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import { collectionsApi, employeesApi, type EnterpriseEmployee } from '../../api/endpoints';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { customerFeedbackExportRows, customerFeedbackMetrics } from './customerFeedbackRules';
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
  StarOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer } from '../../custom-ui';

export interface EnterpriseFeedbackItem {
  key: string;
  feedbackCode: string;
  clientName: string;
  contactPerson: string;
  phone: string;
  serviceName: string;
  rating: number | null;
  content: string;
  priority: 'Khẩn cấp' | 'Cao' | 'Trung bình';
  resolutionAction: string;
  assignedStaff: string;
  assignedStaffId: string;
  receivedDate: string;
  resolvedDate?: string;
  resolvedBy?: string;
  resolvedById?: string;
  status: 'Đã giải quyết thỏa đáng' | 'Đang xử lý';
}

const INITIAL_FEEDBACK: EnterpriseFeedbackItem[] = [];

export const CustomerFeedbackModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseFeedbackItem[]>(INITIAL_FEEDBACK);
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const list = dataService.getGenericData('crm_feedback');
    setData(Array.isArray(list) ? list : []);
    let mounted = true;
    setLoading(true);
    void Promise.all([dataService.refreshGenericData('crm_feedback'), employeesApi.getAll()])
      .then(([records, response]) => {
        if (!mounted) return;
        setData(Array.isArray(records) ? records : []);
        setEmployees((response.data.data || []).filter((employee) => employee.isActive && employee.status !== 'Đã nghỉ việc'));
      })
      .catch((error: any) => { if (mounted) message.error(error?.response?.data?.message || 'Không tải được phản ánh khách hàng hoặc danh sách nhân viên.'); })
      .finally(() => { if (mounted) setLoading(false); });
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('crm_feedback');
      if (mounted) setData(Array.isArray(updated) ? updated : []);
    });
    return () => { mounted = false; unsub(); };
  }, []);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [resolutionForm] = Form.useForm();
  const [resolveModalOpen, setResolveModalOpen] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<EnterpriseFeedbackItem | null>(null);

  const metrics = customerFeedbackMetrics(data);

  const handleCreate = async (values: any) => {
    setSaving(true);
    try {
      const key = crypto.randomUUID();
      const saved = await dataService.createGenericRecord('crm_feedback', {
        key,
        feedbackCode: values.feedbackCode,
        clientName: values.clientName,
        contactPerson: values.contactPerson || '',
        phone: values.phone || '',
        serviceName: values.serviceName,
        rating: values.rating === undefined || values.rating === '' ? null : Number(values.rating),
        content: values.content,
        priority: values.priority,
        assignedStaffId: values.assignedStaffId,
      }) as EnterpriseFeedbackItem;
      await dataService.refreshGenericData('crm_feedback');
      message.success(`Đã tiếp nhận phản ánh từ khách hàng: ${saved.clientName}`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tiếp nhận phản ánh. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const handleResolve = (record: EnterpriseFeedbackItem) => {
    setSelectedFeedback(record);
    resolutionForm.resetFields();
    setResolveModalOpen(true);
  };

  const submitResolution = async (values: { resolutionAction: string }) => {
    if (!selectedFeedback) return;
    setSaving(true);
    try {
      const response = await collectionsApi.patch<EnterpriseFeedbackItem>('crm_feedback', selectedFeedback.key, {
        status: 'Đã giải quyết thỏa đáng',
        resolutionAction: values.resolutionAction,
      });
      setSelectedFeedback(response.data.record);
      await dataService.refreshGenericData('crm_feedback');
      message.success(`Đã cập nhật biện pháp xử lý cho phản ánh ${selectedFeedback.feedbackCode}`);
      setResolveModalOpen(false);
      resolutionForm.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể cập nhật trạng thái phản ánh. Vui lòng tải lại dữ liệu.');
    } finally {
      setSaving(false);
    }
  };

  const exportFeedback = () => downloadFile('Bao_cao_phan_anh_khach_hang.xlsx', generateValidXlsxBlob(customerFeedbackExportRows(filteredData)));
  const printFeedback = (record: EnterpriseFeedbackItem) => downloadFile(`${record.feedbackCode}_bien_ban_phan_anh.pdf`, generateValidPdfBlob(
    'BIEN BAN TIEP NHAN PHAN ANH KHACH HANG', `${record.feedbackCode} | ${record.clientName}`,
    [`Ngay nhan: ${record.receivedDate}`, `Nguoi phan anh: ${record.contactPerson || 'Chua cung cap'}`, `Dien thoai: ${record.phone || 'Chua cung cap'}`,
      `Dich vu: ${record.serviceName}`, `Danh gia: ${record.rating == null ? 'Chua danh gia' : `${record.rating}/5`}`, `Uu tien: ${record.priority}`,
      `Can bo phu trach: ${record.assignedStaff}`, `Trang thai: ${record.status}`, `Noi dung: ${record.content}`,
      `Bien phap xu ly: ${record.resolutionAction || 'Chua ghi nhan'}`, `Ngay dong ho so: ${record.resolvedDate || 'Chua dong'}`, `Nguoi dong ho so: ${record.resolvedBy || 'Chua ghi nhan'}`],
  ));

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
      render: (r: number | null) => r == null ? <span style={{ color: '#64748B' }}>Chưa đánh giá</span> : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, color: '#F59E0B' }}>
          {[...Array(5)].map((_, i) => (
            <StarFilled key={i} style={{ color: i < r ? '#F59E0B' : '#E2E8F0', fontSize: 13 }} />
          ))}
          <span style={{ fontWeight: 700, color: '#0F172A', marginLeft: 4, fontSize: 12.5 }}>{r}/5</span>
        </div>
      ),
      sorter: (a: EnterpriseFeedbackItem, b: EnterpriseFeedbackItem) => (a.rating ?? 0) - (b.rating ?? 0),
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
    <div aria-busy={loading} style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Điểm hài lòng trung bình</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <StarFilled style={{ fontSize: 22 }} /> {metrics.averageRating?.toFixed(1) ?? '—'} / 5 sao
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Trên {data.filter((item) => item.rating != null).length} lượt có đánh giá</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ phản ánh đã đóng hồ sơ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {metrics.resolutionRate == null ? '—' : `${metrics.resolutionRate}%`} đã đóng
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>{metrics.resolvedCount} / {metrics.feedbackCount} phản ánh đã đóng hồ sơ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Vụ việc đang theo dõi &amp; xử lý</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: metrics.inProgressCount > 0 ? '#2563EB' : '#64748B', marginTop: 4 }}>
            {metrics.inProgressCount} phản ánh
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Đang xử lý</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Sự cố mức độ Khẩn cấp</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: metrics.urgentCount > 0 ? '#DC2626' : '#16A34A', marginTop: 4 }}>
            {metrics.urgentCount} phản ánh
          </div>
          <div style={{ fontSize: 11.5, color: metrics.urgentCount > 0 ? '#DC2626' : '#16A34A', marginTop: 2 }}>Khẩn cấp đang xử lý</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả phản ánh' },
            { key: '5sao', label: '5 Sao', icon: <StarOutlined style={{ color: '#F59E0B' }} /> },
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

          <Button icon={<DownloadOutlined />} onClick={exportFeedback} disabled={loading}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              const today = new Date();
              const dateCode = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
              form.setFieldsValue({
                feedbackCode: `FB-${dateCode}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
              });
              setModalOpen(true);
            }}
            disabled={loading || employees.length === 0}
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
              <Input readOnly />
            </Form.Item>
            <Form.Item name="rating" label="Đánh giá sao CSAT">
              <Select
                allowClear
                placeholder="Chọn mức đánh giá"
                options={[
                  { label: '5 Sao', value: 5 },
                  { label: '4 Sao', value: 4 },
                  { label: '3 Sao', value: 3 },
                  { label: '2 Sao', value: 2 },
                  { label: '1 Sao', value: 1 },
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="serviceName" label="Dịch vụ liên quan" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="Số điện thoại liên hệ">
              <Input />
            </Form.Item>
          </div>

          <Form.Item name="content" label="Nội dung ý kiến phản ánh" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="Chi tiết phản ánh, khiếu nại hoặc góp ý của khách hàng..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="priority" label="Độ ưu tiên" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Khẩn cấp', value: 'Khẩn cấp' },
                  { label: 'Cao', value: 'Cao' },
                  { label: 'Trung bình', value: 'Trung bình' },
                ]}
              />
            </Form.Item>
            <Form.Item name="assignedStaffId" label="Cán bộ phụ trách xử lý" rules={[{ required: true }]}>
              <Select
                showSearch
                placeholder="Chọn nhân viên"
                options={employees.map((employee) => ({
                  value: employee.userId || employee.id,
                  label: `${employee.fullName || employee.name}${employee.employeeCode ? ` · ${employee.employeeCode}` : ''}`,
                }))}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Tiếp nhận ý kiến
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Phản Ánh & Biên Bản Xử Lý */}
      <Drawer
        title="Biên Bản Tiếp Nhận &amp; Xử Lý Ý Kiến Khách Hàng"
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
                Người gửi: <strong>{selectedFeedback.contactPerson || 'Chưa cung cấp'}</strong> · Điện thoại: {selectedFeedback.phone || 'Chưa cung cấp'} · Ngày: {selectedFeedback.receivedDate}
              </div>
            </div>

            {/* Satisfaction Rating */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
                Đánh Giá Hài Lòng Khách Hàng:
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#F59E0B', fontSize: 16 }}>
                  {[...Array(5)].map((_, i) => (
                  <StarFilled key={i} style={{ color: selectedFeedback.rating != null && i < selectedFeedback.rating ? '#F59E0B' : '#CBD5E1' }} />
                ))}
                <span style={{ fontWeight: 800, color: '#0F172A', marginLeft: 8, fontSize: 15 }}>
                  {selectedFeedback.rating == null ? 'Chưa đánh giá' : `${selectedFeedback.rating} / 5 Điểm`}
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
                {selectedFeedback.resolutionAction || 'Chưa ghi nhận biện pháp xử lý'}
              </div>
              <div style={{ fontSize: 12, color: '#166534', marginTop: 6 }}>
                Cán bộ phụ trách: <strong>{selectedFeedback.assignedStaff}</strong>
                {selectedFeedback.resolvedDate && <span> · Ngày đóng hồ sơ: {selectedFeedback.resolvedDate}</span>}
                {selectedFeedback.resolvedBy && <span> · Người đóng hồ sơ: {selectedFeedback.resolvedBy}</span>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {selectedFeedback.status !== 'Đã giải quyết thỏa đáng' && (
                <Button
                  type="primary"
                  style={{ flex: 1, backgroundColor: '#10B981', borderColor: '#10B981' }}
                  onClick={() => handleResolve(selectedFeedback)}
                >
                  Ghi nhận kết quả và đóng hồ sơ
                </Button>
              )}
              <Button
                icon={<PrinterOutlined />}
                onClick={() => printFeedback(selectedFeedback)}
              >
                Tải biên bản PDF
              </Button>
            </div>
          </div>
        )}
      </Drawer>
      <Modal
        title="Ghi nhận biện pháp xử lý"
        open={resolveModalOpen}
        onCancel={() => setResolveModalOpen(false)}
        footer={null}
        width={560}
      >
        <Form form={resolutionForm} layout="vertical" onFinish={submitResolution} style={{ marginTop: 14 }}>
          <Form.Item name="resolutionAction" label="Biện pháp xử lý và kết quả" rules={[{ required: true, whitespace: true, message: 'Vui lòng ghi biện pháp xử lý.' }]}>
            <Input.TextArea rows={4} maxLength={4000} showCount />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setResolveModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#10B981', borderColor: '#10B981' }}>
              Lưu kết quả và đóng hồ sơ
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

