import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SwapOutlined,
  EyeOutlined,
  FileDoneOutlined,
  AuditOutlined,
  PrinterOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseAdvanceItem {
  key: string;
  code: string;
  employeeName: string;
  empCode: string;
  department: string;
  purpose: string;
  advanceType: 'Công tác phí' | 'Mua vật tư / Thiết bị' | 'Tiếp khách đối tác' | 'Hành chính sự vụ';
  advancedAmount: number;
  spentAmount: number;
  balance: number; // Chênh lệch (dương: hoàn trả lại công ty, âm: công ty thanh toán bù)
  requestDate: string;
  settleDeadline: string;
  approver: string;
  invoicesSummary?: string;
  status: 'Đã hoàn ứng' | 'Chờ thanh quyết toán' | 'Quá hạn quyết toán';
}

const INITIAL_ADVANCES: EnterpriseAdvanceItem[] = [];

export const AdvancesModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseAdvanceItem[]>(INITIAL_ADVANCES);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAdvance, setSelectedAdvance] = useState<EnterpriseAdvanceItem | null>(null);

  const totalAdvanced = data.reduce((sum, item) => sum + item.advancedAmount, 0);
  const totalSettled = data.filter((d) => d.status === 'Đã hoàn ứng').reduce((sum, item) => sum + item.spentAmount, 0);
  const totalPending = totalAdvanced - totalSettled;
  const overdueCount = data.filter((d) => d.status === 'Quá hạn quyết toán').length;

  const handleCreate = (values: any) => {
    const adv = Number(values.advancedAmount) || 0;
    const newItem: EnterpriseAdvanceItem = {
      ...values,
      key: String(Date.now()),
      empCode: values.empCode || `KY-${Math.floor(100 + Math.random() * 900)}`,
      advancedAmount: adv,
      spentAmount: 0,
      balance: adv,
      requestDate: new Date().toISOString().substring(0, 10),
      approver: 'Trần Tuấn Anh (CTO) & Kế Toán Trưởng',
      invoicesSummary: 'Chờ nhân viên nộp bảng kê hóa đơn',
      status: 'Chờ thanh quyết toán',
    };
    setData([newItem, ...data]);
    message.success(`Đã lập phiếu tạm ứng mới cho: ${values.employeeName}`);
    setModalOpen(false);
    form.resetFields();
  };

  const handleSettle = (record: EnterpriseAdvanceItem) => {
    setData(
      data.map((d) =>
        d.key === record.key ? { ...d, spentAmount: d.advancedAmount, balance: 0, status: 'Đã hoàn ứng' as const } : d
      )
    );
    message.success(`Đã hoàn tất thanh quyết toán phiếu tạm ứng ${record.code}`);
    if (selectedAdvance && selectedAdvance.key === record.key) {
      setSelectedAdvance({ ...selectedAdvance, spentAmount: selectedAdvance.advancedAmount, balance: 0, status: 'Đã hoàn ứng' });
    }
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.purpose || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã phiếu & Thời gian',
      key: 'code',
      render: (_: any, record: EnterpriseAdvanceItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <DollarOutlined /> {record.code}
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', fontWeight: 600, marginTop: 2 }}>
            {record.advanceType}
          </div>
        </div>
      ),
    },
    {
      title: 'Nhân viên & Phòng ban',
      key: 'employeeName',
      render: (_: any, record: EnterpriseAdvanceItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            Mã: <code>{record.empCode}</code> · {record.department}
          </div>
        </div>
      ),
    },
    {
      title: 'Mục đích tạm ứng',
      dataIndex: 'purpose',
      key: 'purpose',
      render: (p: string) => <span style={{ color: '#334155', fontSize: 12.5 }}>{p}</span>,
    },
    {
      title: 'Số tiền tạm ứng',
      dataIndex: 'advancedAmount',
      key: 'advancedAmount',
      width: 160,
      render: (val: number) => (
        <span style={{ fontWeight: 800, color: '#1E40AF', fontSize: 13.5 }}>
          {val.toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Đã quyết toán / Hoàn quỹ',
      key: 'spentAmount',
      width: 180,
      render: (_: any, record: EnterpriseAdvanceItem) => (
        <div>
          <div style={{ color: '#16A34A', fontWeight: 600 }}>Thực chi: {record.spentAmount.toLocaleString('vi-VN')} ₫</div>
          <div style={{ fontSize: 11.5, color: record.balance > 0 ? '#D97706' : '#64748B' }}>
            Còn nợ: {record.balance.toLocaleString('vi-VN')} ₫
          </div>
        </div>
      ),
    },
    {
      title: 'Hạn hoàn ứng',
      dataIndex: 'settleDeadline',
      key: 'settleDeadline',
      width: 130,
      render: (d: string, record: EnterpriseAdvanceItem) => (
        <span style={{ color: record.status === 'Quá hạn quyết toán' ? '#DC2626' : '#334155', fontWeight: record.status === 'Quá hạn quyết toán' ? 700 : 500 }}>
          {d}
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (status: string) => {
        let color = 'default';
        if (status === 'Đã hoàn ứng') color = 'success';
        if (status === 'Chờ thanh quyết toán') color = 'warning';
        if (status === 'Quá hạn quyết toán') color = 'error';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterpriseAdvanceItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedAdvance(record);
            setDrawerOpen(true);
          }}
        >
          Chứng từ
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng tiền tạm ứng phát sinh (TK 141)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            {totalAdvanced.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>{data.length} Phiếu tạm ứng nội bộ CBNV</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã thanh quyết toán hoàn ứng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalSettled.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đã nghiệm thu và đủ hóa đơn chứng từ hợp lệ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Công nợ tạm ứng đang theo dõi</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {totalPending.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Thời hạn nộp chứng từ quyết toán: 15 ngày</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tạm ứng quá hạn thanh quyết toán</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: overdueCount > 0 ? '#DC2626' : '#16A34A', marginTop: 4 }}>
            {overdueCount} Khoản quá hạn
          </div>
          <div style={{ fontSize: 11.5, color: overdueCount > 0 ? '#DC2626' : '#16A34A', marginTop: 2 }}>Cần gửi thông báo nhắc hoàn ứng tự động</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả phiếu tạm ứng' },
            { key: 'Chờ thanh quyết toán', label: 'Chờ quyết toán', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Đã hoàn ứng', label: 'Đã hoàn ứng đủ', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'Quá hạn quyết toán', label: 'Quá hạn hoàn ứng', icon: <WarningOutlined style={{ color: '#F59E0B' }} /> },
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
            placeholder="Tìm theo mã phiếu, tên nhân viên, lý do..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất sổ tạm ứng ra Excel')}>
            Xuất Sổ Tạm Ứng
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                code: `TU-2026-00${data.length + 1}`,
                advanceType: 'Công tác phí',
                department: 'Khối Kinh Doanh & Tiếp Thị',
                advancedAmount: 10000000,
                settleDeadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập phiếu tạm ứng mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Lập phiếu đề nghị tạm ứng mới */}
      <Modal
        title="Lập Phiếu Đề Nghị Tạm Ứng Tiền Mặt / Chuyển Khoản (TK 141)"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã phiếu tạm ứng" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="advanceType" label="Loại hình tạm ứng" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Công tác phí', value: 'Công tác phí' },
                  { label: 'Mua vật tư / Thiết bị', value: 'Mua vật tư / Thiết bị' },
                  { label: 'Tiếp khách đối tác', value: 'Tiếp khách đối tác' },
                  { label: 'Hành chính sự vụ', value: 'Hành chính sự vụ' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Họ tên nhân viên tạm ứng" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Lê Hoàng Yến" />
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

          <Form.Item name="purpose" label="Mục đích tạm ứng chi tiết" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Chi tiết lý do tạm ứng và nội dung công việc thực hiện..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="advancedAmount" label="Số tiền tạm ứng (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={1000000} />
            </Form.Item>
            <Form.Item name="settleDeadline" label="Hạn hoàn ứng / Nộp hóa đơn" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Trình duyệt tạm ứng
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Bảng Quyết Toán & Hóa Đơn Kèm Theo */}
      <Drawer
        title="Bảng Quyết Toán Tạm Ứng &amp; Chứng Từ Thanh Toán"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedAdvance && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedAdvance.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedAdvance.employeeName}
                  </div>
                </div>
                <Tag color={selectedAdvance.status === 'Đã hoàn ứng' ? 'success' : selectedAdvance.status === 'Quá hạn quyết toán' ? 'error' : 'warning'}>
                  {selectedAdvance.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedAdvance.department} (Mã: {selectedAdvance.empCode}) · Hạn quyết toán: {selectedAdvance.settleDeadline}
              </div>
            </div>

            {/* Advance numbers summary */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Đối Chiếu Số Liệu Tạm Ứng (TK 141):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Số tiền đã tạm ứng:</span>
                  <strong style={{ color: '#1E40AF', fontSize: 14 }}>{selectedAdvance.advancedAmount.toLocaleString('vi-VN')} ₫</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thực chi theo hóa đơn:</span>
                  <strong style={{ color: '#16A34A', fontSize: 14 }}>{selectedAdvance.spentAmount.toLocaleString('vi-VN')} ₫</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: 8 }}>
                  <span style={{ color: '#0F172A', fontWeight: 700 }}>Chênh lệch thừa/thiếu:</span>
                  <strong style={{ color: selectedAdvance.balance > 0 ? '#D97706' : '#16A34A', fontSize: 15 }}>
                    {selectedAdvance.balance > 0 ? `Hoàn trả quỹ két: ${selectedAdvance.balance.toLocaleString('vi-VN')} ₫` : 'Đã tất toán 0 ₫'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Invoices breakdown */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AuditOutlined /> Bảng Kê Hóa Đơn &amp; Chứng Từ Thanh Toán Kèm Theo:
              </div>
              <div style={{ fontSize: 12.5, color: '#334155', fontStyle: 'italic', background: '#FFFFFF', padding: '10px 12px', borderRadius: 4, border: '1px solid #E2E8F0' }}>
                "{selectedAdvance.invoicesSummary}"
              </div>
            </div>

            {/* Approver info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 12 }}>
              <span style={{ color: '#64748B' }}>Cấp thẩm quyền phê duyệt:</span>
              <strong style={{ color: '#0F172A' }}>{selectedAdvance.approver}</strong>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {selectedAdvance.status !== 'Đã hoàn ứng' && (
                <Button
                  type="primary"
                  style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                  onClick={() => handleSettle(selectedAdvance)}
                >
                  Xác Nhận Quyết Toán &amp; Hoàn Ứng
                </Button>
              )}
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã in Giấy thanh toán tiền tạm ứng ${selectedAdvance.code}`)}
              >
                In Giấy Thanh Toán
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

