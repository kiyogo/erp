import React, { useState, useEffect } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  CustomerServiceOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  AlertOutlined,
  UserOutlined,
  PrinterOutlined,
  EyeOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip, Progress } from '../../custom-ui';
import { dataService, HelpdeskTicket } from '../../services/dataService';

export const TicketsModule: React.FC = () => {
  const [data, setData] = useState<HelpdeskTicket[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<{ label: string; value: string }[]>([]);
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'Khẩn cấp' | 'Cao' | 'Mới tạo' | 'Đang xử lý' | 'Đã hoàn thành'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<HelpdeskTicket | null>(null);

  const loadData = () => {
    setData(dataService.getTickets());
    dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
  };

  useEffect(() => {
    loadData();
    const unsub = dataService.subscribe(loadData);
    return unsub;
  }, []);

  const inProgressCount = data.filter((d) => d.status === 'Đang xử lý' || d.status === 'Mới tạo').length;
  const completedCount = data.filter((d) => d.status === 'Đã hoàn thành').length;
  const urgentCount = data.filter((d) => d.priority === 'Khẩn cấp').length;

  const handleCreate = (values: any) => {
    dataService.addTicket({
      ...values,
      status: 'Mới tạo',
      createdDate: new Date().toISOString().replace('T', ' ').substring(0, 16),
    });
    message.success(`Đã mở ticket mới: ${values.title}`);
    setModalOpen(false);
    form.resetFields();
    loadData();
  };

  const handleStatusChange = (ticket: HelpdeskTicket, newStatus: 'Đang xử lý' | 'Đã hoàn thành') => {
    dataService.updateTicketStatus(ticket.key, newStatus);
    message.success(`Đã cập nhật trạng thái ticket ${ticket.code} -> ${newStatus}`);
    if (selectedTicket && selectedTicket.key === ticket.key) {
      setSelectedTicket({ ...selectedTicket, status: newStatus });
    }
    loadData();
  };

  const filteredData = data.filter((t) => {
    let matchTab = true;
    if (filterTab === 'Khẩn cấp') matchTab = t.priority === 'Khẩn cấp';
    else if (filterTab === 'Cao') matchTab = t.priority === 'Cao';
    else if (filterTab === 'Đang xử lý') matchTab = t.status === 'Đang xử lý' || t.status === 'Mới tạo';
    else if (filterTab === 'Đã hoàn thành') matchTab = t.status === 'Đã hoàn thành';

    const matchSearch =
      (t.title || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (t.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (t.requester || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (t.department || '').toLowerCase().includes(searchText.toLowerCase());

    return matchTab && matchSearch;
  });

  const columns = [
    {
      title: 'Mã Ticket & Thời gian',
      key: 'code',
      render: (_: any, record: HelpdeskTicket) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CustomerServiceOutlined /> {record.code}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{record.createdDate}</div>
        </div>
      ),
    },
    {
      title: 'Tiêu đề sự cố / Yêu cầu IT',
      dataIndex: 'title',
      key: 'title',
      render: (t: string) => <span style={{ fontWeight: 600, color: '#0F172A', fontSize: 13 }}>{t}</span>,
    },
    {
      title: 'Người gửi & Phòng ban',
      key: 'requester',
      render: (_: any, record: HelpdeskTicket) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0F172A' }}>{record.requester}</div>
          <div style={{ fontSize: 11.5, color: '#2563EB' }}>{record.department}</div>
        </div>
      ),
    },
    {
      title: 'Mức độ ưu tiên',
      dataIndex: 'priority',
      key: 'priority',
      width: 140,
      render: (pri: string) => {
        let color = 'default';
        if (pri === 'Khẩn cấp') color = 'error';
        else if (pri === 'Cao') color = 'warning';
        else if (pri === 'Trung bình') color = 'processing';
        return <Tag color={color}>{pri}</Tag>;
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: string) => {
        let color = 'default';
        if (status === 'Đang xử lý') color = 'processing';
        else if (status === 'Đã hoàn thành') color = 'success';
        else if (status === 'Mới tạo') color = 'warning';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 180,
      render: (_: any, record: HelpdeskTicket) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedTicket(record);
              setDrawerOpen(true);
            }}
          >
            Chi tiết
          </Button>
          {record.status !== 'Đã hoàn thành' && (
            <Button
              size="small"
              type="primary"
              onClick={() => handleStatusChange(record, record.status === 'Mới tạo' ? 'Đang xử lý' : 'Đã hoàn thành')}
              style={{
                backgroundColor: record.status === 'Mới tạo' ? '#009688' : '#10B981',
                borderColor: record.status === 'Mới tạo' ? '#009688' : '#10B981',
              }}
            >
              {record.status === 'Mới tạo' ? 'Tiếp nhận' : 'Hoàn tất'}
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số ticket tiếp nhận</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} ticket
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Cổng tiếp nhận hỗ trợ tập trung ITIL</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Ticket đang trong tiến trình xử lý</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            {inProgressCount} yêu cầu
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>{completedCount} yêu cầu đã đóng hoàn tất</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thời gian phản hồi bình quân (MTTA)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            ≤ 10 phút
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đạt chuẩn SLA ServiceDesk 98.6%</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Yêu cầu mức độ Khẩn cấp</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: urgentCount > 0 ? '#DC2626' : '#16A34A', marginTop: 4 }}>
            {urgentCount} yêu cầu
          </div>
          <div style={{ fontSize: 11.5, color: urgentCount > 0 ? '#DC2626' : '#16A34A', marginTop: 2 }}>Ưu tiên xử lý giải quyết trong 2 giờ</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all' as const, label: 'Tất cả ticket' },
            { key: 'Khẩn cấp' as const, label: 'Khẩn cấp', icon: <CloseCircleOutlined style={{ color: '#EF4444' }} /> },
            { key: 'Cao' as const, label: 'Mức Cao', icon: <ExclamationCircleOutlined style={{ color: '#F97316' }} /> },
            { key: 'Đang xử lý' as const, label: 'Đang xử lý', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Đã hoàn thành' as const, label: 'Đã hoàn tất', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setFilterTab(tab.key)}
              style={{
                backgroundColor: filterTab === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: filterTab === tab.key ? '#009688' : '#CBD5E1',
                color: filterTab === tab.key ? '#00796B' : '#475569',
                fontWeight: filterTab === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã, tiêu đề, người gửi..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất danh sách ticket ra Excel')}>
            Xuất Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                code: `TK-${String(Date.now()).slice(-4)}`,
                priority: 'Trung bình',
                requester: 'Trần Tuấn Anh (CTO)',
                department: 'Phòng Ban Kỹ Thuật',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Tạo Ticket mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Mở Ticket mới */}
      <Modal
        title="Mở Ticket Yêu Cầu Hỗ Trợ IT ServiceDesk Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={580}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã Ticket" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="priority" label="Mức độ ưu tiên" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Khẩn cấp (Xử lý ngay)', value: 'Khẩn cấp' },
                  { label: 'Cao (Xử lý trong 2h)', value: 'Cao' },
                  { label: 'Trung bình (Trong 8h)', value: 'Trung bình' },
                  { label: 'Thấp', value: 'Thấp' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="title" label="Tiêu đề yêu cầu / Sự cố" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Cấp quyền truy cập cụm máy chủ hoặc Báo lỗi mạng..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="requester" label="Người gửi yêu cầu" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban" rules={[{ required: true, message: 'Vui lòng chọn phòng ban' }]}>
              <Select
                placeholder="Chọn phòng ban..."
                options={departmentOptions}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Gửi Ticket
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Ticket */}
      <Drawer
        title="Chi Tiết Phiếu Yêu Cầu Hỗ Trợ IT ServiceDesk"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedTicket && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ TICKET: {selectedTicket.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedTicket.title}
                  </div>
                </div>
                <Tag color={selectedTicket.status === 'Đã hoàn thành' ? 'success' : 'processing'}>
                  {selectedTicket.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Người gửi: <strong>{selectedTicket.requester}</strong> · Phòng ban: <strong>{selectedTicket.department}</strong>
              </div>
            </div>

            {/* SLA Priority Card */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Cam Kết Mức Độ Dịch Vụ (SLA ServiceDesk):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                <div>Thời điểm gửi yêu cầu: <strong>{selectedTicket.createdDate}</strong></div>
                <div>Mức độ ưu tiên: <Tag color={selectedTicket.priority === 'Khẩn cấp' ? 'error' : 'warning'}>{selectedTicket.priority}</Tag></div>
                <div>Thời gian phản hồi cam kết (MTTA): <strong style={{ color: '#16A34A' }}>≤ 10 phút</strong></div>
                <div>Thời hạn xử lý hoàn tất (MTTR): <strong style={{ color: '#2563EB' }}>{selectedTicket.priority === 'Khẩn cấp' ? 'Trong vòng 2 giờ' : 'Trong vòng 8 giờ làm việc'}</strong></div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              {selectedTicket.status !== 'Đã hoàn thành' && (
                <Button
                  type="primary"
                  style={{ flex: 1, backgroundColor: '#10B981', borderColor: '#10B981' }}
                  onClick={() => handleStatusChange(selectedTicket, 'Đã hoàn thành')}
                >
                  Đánh Dấu Hoàn Thành Ticket
                </Button>
              )}
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã in phiếu yêu cầu hỗ trợ ${selectedTicket.code}`)}
              >
                In Phiếu Yêu Cầu (A4)
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

