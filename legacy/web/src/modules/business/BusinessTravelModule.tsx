import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CompassOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DollarOutlined,
  EnvironmentOutlined,
  CalendarOutlined,
  SendOutlined,
  AuditOutlined,
  EyeOutlined,
  PrinterOutlined,
  TeamOutlined,
  CreditCardOutlined,
  ClockCircleOutlined,
  RocketOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Progress, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseTravelRequest {
  key: string;
  travelCode: string;
  employeeName: string;
  empCode: string;
  department: string;
  position: string;
  destination: string;
  tripType: 'Nội địa' | 'Quốc tế';
  startDate: string;
  endDate: string;
  daysCount: number;
  purpose: string;
  flightTicket: string;
  hotelName: string;
  budgetEstimated: number;
  advanceAmount: number;
  actualExpense: number;
  settlementStatus: 'Đã quyết toán xong' | 'Chờ nộp hóa đơn đỏ' | 'Chưa quyết toán';
  approver: string;
  status: 'Đã duyệt công tác' | 'Đang diễn ra' | 'Chờ lãnh đạo duyệt' | 'Từ chối';
}

const INITIAL_TRAVELS: EnterpriseTravelRequest[] = [];

export const BusinessTravelModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseTravelRequest[]>(INITIAL_TRAVELS);

  useEffect(() => {
    const list = dataService.getGenericData('business_travels');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('business_travels');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTravel, setSelectedTravel] = useState<EnterpriseTravelRequest | null>(null);

  const totalBudget = data
    .filter((d) => d.status === 'Đã duyệt công tác' || d.status === 'Đang diễn ra')
    .reduce((sum, item) => sum + item.budgetEstimated, 0);

  const pendingCount = data.filter((d) => d.status === 'Chờ lãnh đạo duyệt').length;
  const ongoingCount = data.filter((d) => d.status === 'Đang diễn ra').length;

  const handleCreate = (values: any) => {
    const newTravel: EnterpriseTravelRequest = {
      ...values,
      key: String(Date.now()),
      budgetEstimated: Number(values.budgetEstimated) || 10000000,
      advanceAmount: Number(values.advanceAmount) || 8000000,
      actualExpense: 0,
      daysCount: Number(values.daysCount) || 3,
      settlementStatus: 'Chưa quyết toán',
      approver: values.approver || 'Ban Lãnh Đạo',
      status: 'Chờ lãnh đạo duyệt',
    };
    const nextItems = [newTravel, ...data]; setData(nextItems); dataService.saveGenericData('business_travels', nextItems);
    message.success(`Đã tạo đề xuất công tác: ${values.destination} (${values.travelCode})`);
    setModalOpen(false);
    form.resetFields();
  };

  const handleAction = (record: EnterpriseTravelRequest, newStatus: 'Đã duyệt công tác' | 'Từ chối') => {
    const updated = data.map((d) => (d.key === record.key ? { ...d, status: newStatus } : d));
    setData(updated);
    dataService.saveGenericData('business_travels', updated);
    if (newStatus === 'Đã duyệt công tác') {
      message.success(`Đã duyệt chuyến công tác ${record.destination} của ${record.employeeName}`);
    } else {
      message.error(`Đã từ chối chuyến công tác của ${record.employeeName}`);
    }
    if (selectedTravel && selectedTravel.key === record.key) {
      setSelectedTravel({ ...selectedTravel, status: newStatus });
    }
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.travelCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.destination || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.purpose || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã & Chuyến đi',
      key: 'code',
      width: 160,
      render: (_: any, record: EnterpriseTravelRequest) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CompassOutlined /> {record.travelCode}
          </div>
          <div style={{ marginTop: 2 }}>
            <Tag color={record.tripType === 'Quốc tế' ? 'purple' : 'blue'} style={{ margin: 0, fontSize: 10.5 }}>
              {record.tripType}
            </Tag>
          </div>
        </div>
      ),
    },
    {
      title: 'Nhân sự đi công tác',
      key: 'employee',
      width: 200,
      render: (_: any, record: EnterpriseTravelRequest) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>{record.position}</div>
          <div style={{ fontSize: 11, color: '#2563EB', marginTop: 1 }}>{record.department}</div>
        </div>
      ),
    },
    {
      title: 'Địa điểm & Thời gian',
      key: 'destination',
      render: (_: any, record: EnterpriseTravelRequest) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>
            <EnvironmentOutlined style={{ color: '#DC2626', marginRight: 4 }} />
            {record.destination}
          </div>
          <div style={{ fontSize: 12, color: '#334155', marginTop: 2 }}>{record.purpose}</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 3 }}>
            <CalendarOutlined /> {record.startDate} ➔ {record.endDate} ({record.daysCount} ngày) · {record.hotelName}
          </div>
        </div>
      ),
    },
    {
      title: 'Dự toán / Tạm ứng',
      key: 'financial',
      width: 170,
      render: (_: any, r: EnterpriseTravelRequest) => (
        <div>
          <div>
            Dự toán: <strong style={{ color: '#16A34A' }}>{r.budgetEstimated.toLocaleString('vi-VN')} ₫</strong>
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            Tạm ứng: <span style={{ color: '#2563EB', fontWeight: 600 }}>{r.advanceAmount.toLocaleString('vi-VN')} ₫</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: string) => {
        let color = 'default';
        if (status === 'Đã duyệt công tác') color = 'success';
        if (status === 'Đang diễn ra') color = 'processing';
        if (status === 'Chờ lãnh đạo duyệt') color = 'warning';
        if (status === 'Từ chối') color = 'error';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 190,
      render: (_: any, record: EnterpriseTravelRequest) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {record.status === 'Chờ lãnh đạo duyệt' && (
            <>
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => handleAction(record, 'Đã duyệt công tác')}
                style={{ backgroundColor: '#16A34A', borderColor: '#16A34A', fontSize: 11.5, padding: '0 6px' }}
              >
                Duyệt
              </Button>
              <Button
                size="small"
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => handleAction(record, 'Từ chối')}
                style={{ fontSize: 11.5, padding: '0 6px' }}
              >
                Từ chối
              </Button>
            </>
          )}
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedTravel(record);
              setDrawerOpen(true);
            }}
          >
            Chi tiết
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng kinh phí công tác phí duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalBudget.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Thanh toán qua chuyển khoản ngân hàng</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chuyến công tác đang diễn ra</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {ongoingCount} nhân sự tại thực địa
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Theo dõi định vị và công tác phí</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đề xuất chờ phê duyệt (SLA 24h)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {pendingCount} đề xuất mới
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Cần CEO/CTO phê duyệt ngân sách</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chế độ công tác chuẩn KIYOVN</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#7C3AED', marginTop: 6 }}>
            Vé máy bay + Khách sạn 4★ + Phụ cấp 600k/ngày
          </div>
        </div>
      </div>

      {/* Toolbar & Filter Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả chuyến đi' },
            { key: 'Đang diễn ra', label: 'Đang diễn ra', icon: <RocketOutlined style={{ color: '#6366F1' }} /> },
            { key: 'Đã duyệt công tác', label: 'Đã duyệt' },
            { key: 'Chờ lãnh đạo duyệt', label: 'Chờ duyệt' },
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã, tên nhân sự, địa điểm, mục đích..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất lịch trình công tác toàn công ty')}>
            Xuất Lịch Trình
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                travelCode: `CT-2026/0${data.length + 1}`,
                tripType: 'Nội địa',
                daysCount: 3,
                startDate: new Date().toISOString().substring(0, 10),
                endDate: new Date(Date.now() + 3 * 86400000).toISOString().substring(0, 10),
                budgetEstimated: 12000000,
                advanceAmount: 10000000,
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập đề xuất công tác
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Lập đề xuất công tác mới */}
      <Modal
        title="Lập Đề Xuất Công Tác &amp; Đặt Vé / Tạm Ứng Kinh Phí"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={680}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="travelCode" label="Mã đề xuất" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="tripType" label="Loại chuyến đi" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Nội địa (Việt Nam)', value: 'Nội địa' },
                  { label: 'Quốc tế (Nước ngoài)', value: 'Quốc tế' },
                ]}
              />
            </Form.Item>
            <Form.Item name="daysCount" label="Số ngày công tác" rules={[{ required: true }]}>
              <Input type="number" min={1} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Cán bộ công tác" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Lê Hoàng Yến" />
            </Form.Item>
            <Form.Item name="empCode" label="Mã nhân viên" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: KY-012" />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Khối Kinh Doanh" />
            </Form.Item>
          </div>

          <Form.Item name="destination" label="Địa điểm đến & Đối tác làm việc" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: TP. Hồ Chí Minh - Làm việc với Ngân hàng ACB" />
          </Form.Item>

          <Form.Item name="purpose" label="Mục đích công tác chi tiết" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Nội dung và kết quả dự kiến đạt được..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="flightTicket" label="Thông tin vé máy bay / Tàu xe">
              <Input placeholder="Ví dụ: Vietnam Airlines VN215 khứ hồi" />
            </Form.Item>
            <Form.Item name="hotelName" label="Khách sạn lưu trú">
              <Input placeholder="Ví dụ: Khách sạn Novotel Saigon Centre" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="startDate" label="Ngày bắt đầu" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="endDate" label="Ngày kết thúc" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="budgetEstimated" label="Dự toán tổng (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" step={1000000} />
            </Form.Item>
            <Form.Item name="advanceAmount" label="Số tiền tạm ứng">
              <Input type="number" step={1000000} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Gửi đề xuất duyệt
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Chuyến Công Tác & Quyết Toán */}
      <Drawer
        title="Hồ Sơ Chuyến Công Tác &amp; Quyết Toán Tài Chính"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={640}
      >
        {selectedTravel && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Box */}
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedTravel.travelCode}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedTravel.destination}
                  </div>
                </div>
                <Tag color={selectedTravel.status === 'Đã duyệt công tác' ? 'success' : 'processing'}>
                  {selectedTravel.status}
                </Tag>
              </div>

              <div style={{ fontSize: 12.5, color: '#334155', marginTop: 8 }}>
                Mục đích: <strong>{selectedTravel.purpose}</strong>
              </div>
            </div>

            {/* Travel Info Grid */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TeamOutlined style={{ color: '#009688' }} /> Nhân Sự &amp; Lịch Trình Chuyến Đi:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
                <div>
                  <span style={{ color: '#64748B' }}>Cán bộ đi công tác:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>
                    {selectedTravel.employeeName} ({selectedTravel.empCode})
                  </div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Chức danh / Phòng ban:</span>
                  <div style={{ fontWeight: 700, color: '#2563EB' }}>
                    {selectedTravel.position} · {selectedTravel.department}
                  </div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Thời gian:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>
                    {selectedTravel.startDate} ➔ {selectedTravel.endDate} ({selectedTravel.daysCount} ngày)
                  </div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Người phê duyệt:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedTravel.approver}</div>
                </div>
              </div>
            </div>

            {/* Logistics & Bookings */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CompassOutlined style={{ color: '#2563EB' }} /> Vé Máy Bay &amp; Khách Sạn Đã Đặt:
              </div>
              <div style={{ fontSize: 12.5, color: '#334155', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div><SendOutlined style={{ color: '#0284C7', marginRight: 6 }} />Vé máy bay: <strong>{selectedTravel.flightTicket}</strong></div>
                <div><HomeOutlined style={{ color: '#F59E0B', marginRight: 6 }} />Khách sạn: <strong>{selectedTravel.hotelName}</strong></div>
              </div>
            </div>

            {/* Financial Breakdown */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F0FDF4' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <DollarOutlined /> Quyết Toán Tài Chính &amp; Hoàn Ứng Công Tác Phí:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 12.5 }}>
                <div>
                  <span style={{ color: '#15803D' }}>Dự toán phê duyệt:</span>
                  <div style={{ fontWeight: 800, color: '#166534', fontSize: 13.5 }}>
                    {selectedTravel.budgetEstimated.toLocaleString('vi-VN')} ₫
                  </div>
                </div>
                <div>
                  <span style={{ color: '#15803D' }}>Đã chi tạm ứng:</span>
                  <div style={{ fontWeight: 800, color: '#2563EB', fontSize: 13.5 }}>
                    {selectedTravel.advanceAmount.toLocaleString('vi-VN')} ₫
                  </div>
                </div>
                <div>
                  <span style={{ color: '#15803D' }}>Chi phí thực tế:</span>
                  <div style={{ fontWeight: 800, color: '#DC2626', fontSize: 13.5 }}>
                    {selectedTravel.actualExpense > 0
                      ? `${selectedTravel.actualExpense.toLocaleString('vi-VN')} ₫`
                      : 'Đang gom hóa đơn'}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã xuất giấy đi đường & quyết định cử công tác ${selectedTravel.travelCode} (PDF)`)}
                style={{ flex: 1 }}
              >
                In Lệnh Điều Động (PDF)
              </Button>
              <Button
                type="primary"
                icon={<CreditCardOutlined />}
                onClick={() => message.success(`Đã mở giao diện quyết toán hoàn ứng cho chuyến ${selectedTravel.travelCode}`)}
                style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
              >
                Lập Quyết Toán Hoàn Ứng
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

