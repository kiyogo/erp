import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  WalletOutlined,
  EyeOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer } from '../../custom-ui';
import { financeCashApi, FinanceCashTransaction } from '../../api/endpoints';

export interface EnterprisePettyCashItem {
  key: string;
  voucherCode: string;
  payee: string;
  empCode: string;
  department: string;
  purpose: string;
  amount: number;
  date: string;
  time: string;
  invoiceCode?: string;
  status: 'Đã chi tiền mặt' | 'Đã hoàn ứng vào quỹ' | 'Tạm ứng chờ quyết toán' | 'Đã hủy';
}

const toPettyCashItem = (transaction: FinanceCashTransaction): EnterprisePettyCashItem => ({
  key: transaction.key,
  voucherCode: transaction.code,
  payee: transaction.recipientOrPayer,
  empCode: transaction.employeeCode || '—',
  department: transaction.department || 'Chưa khai báo',
  purpose: transaction.category,
  amount: transaction.amount,
  date: transaction.date,
  time: transaction.createdAt ? new Date(transaction.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '',
  invoiceCode: transaction.note,
  status: transaction.status === 'Đã hủy'
    ? 'Đã hủy'
    : transaction.type === 'Thu'
      ? 'Đã hoàn ứng vào quỹ'
      : transaction.status === 'Chờ duyệt'
        ? 'Tạm ứng chờ quyết toán'
        : 'Đã chi tiền mặt',
});

export const PettyCashModule: React.FC = () => {
  const [data, setData] = useState<EnterprisePettyCashItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<EnterprisePettyCashItem | null>(null);

  const completedItems = data.filter((item) => item.status !== 'Tạm ứng chờ quyết toán' && item.status !== 'Đã hủy');
  const totalReceipts = completedItems.filter((item) => item.status === 'Đã hoàn ứng vào quỹ').reduce((sum, item) => sum + item.amount, 0);
  const totalDisbursements = completedItems.filter((item) => item.status === 'Đã chi tiền mặt').reduce((sum, item) => sum + item.amount, 0);
  const currentBalance = totalReceipts - totalDisbursements;
  const pendingSettlementCount = data.filter((d) => d.status === 'Tạm ứng chờ quyết toán').length;

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await financeCashApi.getAll('petty');
      setData(response.data.data.map(toPettyCashItem));
    } catch (error: any) {
      setData([]);
      message.error(error?.response?.data?.message || 'Không tải được sổ quỹ tiền mặt. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleCreate = async (values: any) => {
    const val = Number(values.amount);
    const isRefund = values.status === 'Đã hoàn ứng vào quỹ';
    try {
      await financeCashApi.create({
        code: values.voucherCode,
        type: isRefund ? 'Thu' : 'Chi',
        source: 'petty',
        category: values.purpose,
        amount: val,
        date: values.date,
        recipientOrPayer: values.payee,
        account: 'Quỹ tiền mặt',
        status: values.status === 'Tạm ứng chờ quyết toán' ? 'Chờ duyệt' : 'Đã hoàn thành',
        note: values.invoiceCode || '',
        department: values.department,
        employeeCode: values.empCode || '',
      });
      message.success(`${isRefund ? 'Đã lập phiếu thu hoàn ứng' : 'Đã lập phiếu chi quỹ tiền mặt'}: ${val.toLocaleString('vi-VN')} ₫`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lập phiếu quỹ tiền mặt. Vui lòng kiểm tra lại dữ liệu.');
    }
  };

  const handleCancel = (item: EnterprisePettyCashItem) => {
    Modal.confirm({
      title: 'Xác nhận hủy phiếu quỹ?',
      content: `Chứng từ ${item.voucherCode} sẽ được chuyển sang trạng thái Đã hủy và không còn được tính vào số dư quỹ.`,
      okText: 'Xác nhận hủy',
      cancelText: 'Đóng',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await financeCashApi.cancel(item.key);
          message.success('Đã hủy phiếu quỹ tiền mặt');
          setDrawerOpen(false);
          await loadData();
        } catch (error: any) {
          message.error(error?.response?.data?.message || 'Không thể hủy phiếu quỹ tiền mặt.');
        }
      },
    });
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.voucherCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.payee || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.purpose || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Số phiếu & Thời gian',
      key: 'voucherCode',
      render: (_: any, record: EnterprisePettyCashItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <WalletOutlined /> {record.voucherCode}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            {record.date} ({record.time})
          </div>
        </div>
      ),
    },
    {
      title: 'Người nhận tiền & Phòng ban',
      key: 'payee',
      width: 220,
      render: (_: any, record: EnterprisePettyCashItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.payee}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            Mã: <code>{record.empCode}</code> · {record.department}
          </div>
        </div>
      ),
    },
    {
      title: 'Nội dung chi tiêu tiền mặt',
      dataIndex: 'purpose',
      key: 'purpose',
      render: (p: string) => <span style={{ color: '#334155', fontSize: 12.5 }}>{p}</span>,
    },
    {
      title: 'Số tiền chi (VNĐ)',
      dataIndex: 'amount',
      key: 'amount',
      width: 170,
      render: (val: number, record: EnterprisePettyCashItem) => (
        <span
          style={{
            fontWeight: 800,
            fontSize: 14,
            color: record.status.includes('hoàn ứng') ? '#16A34A' : record.status.includes('Tạm ứng') ? '#D97706' : '#DC2626',
          }}
        >
          {record.status.includes('hoàn ứng') ? '+' : '-'}{val.toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 170,
      render: (status: string) => {
        let color = 'default';
        if (status === 'Đã hoàn ứng vào quỹ') color = 'success';
        if (status === 'Đã chi tiền mặt') color = 'processing';
        if (status === 'Tạm ứng chờ quyết toán') color = 'warning';
        if (status === 'Đã hủy') color = 'error';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterprisePettyCashItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedItem(record);
            setDrawerOpen(true);
          }}
        >
          Biên lai
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng thu vào quỹ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            +{totalReceipts.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Các phiếu thu hoàn ứng đã hoàn thành</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng chi từ quỹ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            -{totalDisbursements.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>Các phiếu chi tiền mặt đã hoàn thành</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Biến động quỹ trong kỳ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: currentBalance >= 0 ? '#16A34A' : '#DC2626', marginTop: 4 }}>
            {currentBalance >= 0 ? '+' : ''}{currentBalance.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Tính từ sổ tiền mặt đang hiển thị</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tạm ứng chờ quyết toán</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {pendingSettlementCount} khoản
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Chưa được tính vào biến động quỹ</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả phiếu quỹ' },
            { key: 'Đã chi tiền mặt', label: 'Đã chi tiền', icon: <CloseCircleOutlined style={{ color: '#EF4444' }} /> },
            { key: 'Tạm ứng chờ quyết toán', label: 'Tạm ứng chờ quyết toán', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Đã hoàn ứng vào quỹ', label: 'Đã hoàn ứng (+)', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
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
            placeholder="Tìm theo số phiếu chi, người nhận, nội dung..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>
            Làm mới
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                date: new Date().toISOString().substring(0, 10),
                status: 'Đã chi tiền mặt',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập phiếu chi tiền mặt
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Lập phiếu chi tiền mặt */}
      <Modal
        title="Lập phiếu quỹ tiền mặt"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="voucherCode" label="Số phiếu chi quỹ" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="status" label="Loại nghiệp vụ chi" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Chi tiền mặt trực tiếp', value: 'Đã chi tiền mặt' },
                  { label: 'Tạm ứng tiền mặt chờ quyết toán', value: 'Tạm ứng chờ quyết toán' },
                  { label: 'Hoàn ứng nộp tiền vào quỹ (+)', value: 'Đã hoàn ứng vào quỹ' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="payee" label="Họ tên người nhận / nộp tiền" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Lê Hoàng Yến" />
            </Form.Item>
            <Form.Item name="empCode" label="Mã nhân viên">
              <Input placeholder="Ví dụ: NV-59124" />
            </Form.Item>
          </div>

          <Form.Item name="department" label="Phòng ban đề nghị" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'Phòng Ban Kỹ Thuật', value: 'Phòng Ban Kỹ Thuật' },
                { label: 'Khối Kinh Doanh & Tiếp Thị', value: 'Khối Kinh Doanh & Tiếp Thị' },
                { label: 'Phòng Tài Chính Kế Toán', value: 'Phòng Tài Chính Kế Toán' },
                { label: 'Phòng Nhân Sự & Hành Chính', value: 'Phòng Nhân Sự & Hành Chính' },
              ]}
            />
          </Form.Item>

          <Form.Item name="purpose" label="Lý do chi tiêu chi tiết" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Mua vật tư khẩn cấp, tiếp khách đối tác VIP..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="amount" label="Số tiền chi (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={10000} max={20000000} step={100000} />
            </Form.Item>
            <Form.Item name="date" label="Ngày chi tiền" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <Form.Item name="invoiceCode" label="Số hóa đơn / Chứng từ kèm theo">
            <Input />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận xuất quỹ tiền mặt
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Biên Lai & Bảng Đếm Mệnh Giá Két */}
      <Drawer
        title="Chi tiết phiếu quỹ tiền mặt"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Voucher */}
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedItem.voucherCode}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedItem.payee}
                  </div>
                </div>
                <Tag color={selectedItem.status === 'Đã hủy' ? 'error' : selectedItem.status.includes('hoàn ứng') ? 'success' : selectedItem.status.includes('Tạm ứng') ? 'warning' : 'processing'}>
                  {selectedItem.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedItem.department} (Mã NV: {selectedItem.empCode}) · Thời gian: {selectedItem.date} {selectedItem.time}
              </div>
            </div>

            {/* Payment info */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Chi Tiết Nghiệp Vụ Tiền Mặt:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Lý do chi:</span>
                  <strong>{selectedItem.purpose}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Chứng từ kèm theo:</span>
                  <span style={{ color: '#2563EB' }}>{selectedItem.invoiceCode}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: 8 }}>
                  <span style={{ color: '#0F172A', fontWeight: 700 }}>Số tiền thực chi / hoàn:</span>
                  <strong style={{ color: selectedItem.status.includes('hoàn ứng') ? '#16A34A' : '#DC2626', fontSize: 17 }}>
                    {selectedItem.amount.toLocaleString('vi-VN')} ₫
                  </strong>
                </div>
              </div>
            </div>

            {selectedItem.status !== 'Đã hủy' && (
              <Button danger icon={<CloseCircleOutlined />} onClick={() => handleCancel(selectedItem)}>
                Hủy phiếu quỹ
              </Button>
            )}

          </div>
        )}
      </Drawer>
    </div>
  );
};
