import React, { useEffect, useState } from 'react';
import {
  useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DollarOutlined,
  AuditOutlined,
  FileTextOutlined,
  EyeOutlined,
  FilterOutlined,
  PrinterOutlined,
  BankOutlined,
  UserOutlined,
  InfoCircleOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';
import { financePaymentsApi, type FinancePaymentAccount, type FinancePaymentRecord } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';

export type EnterprisePaymentItem = FinancePaymentRecord;

const INITIAL_PAYMENTS: EnterprisePaymentItem[] = [];

export const PaymentsModule: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const rawPath = location.pathname;
  const p = rawPath.replace(/^\/admin/, '');

  const [data, setData] = useState<EnterprisePaymentItem[]>(INITIAL_PAYMENTS);
  const [sourceAccounts, setSourceAccounts] = useState<FinancePaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingKey, setActingKey] = useState('');
  const [rejectingPayment, setRejectingPayment] = useState<EnterprisePaymentItem | null>(null);
  const [executingPayment, setExecutingPayment] = useState<EnterprisePaymentItem | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!user) {
      setLoading(false);
      return () => { mounted = false; };
    }
    setLoading(true);
    Promise.all([
      financePaymentsApi.getAll(),
      user?.role === 'ADMIN' ? financePaymentsApi.getAccounts() : Promise.resolve(null),
    ])
      .then(([paymentsResponse, accountsResponse]) => {
        if (!mounted) return;
        setData(Array.isArray(paymentsResponse.data?.data) ? paymentsResponse.data.data : []);
        setSourceAccounts(Array.isArray(accountsResponse?.data?.accounts) ? accountsResponse.data.accounts : []);
      })
      .catch((error: any) => { if (mounted) message.error(error?.response?.data?.message || 'Không tải được đề nghị thanh toán từ máy chủ.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [user?.id, user?.role]);

  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<EnterprisePaymentItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm();
  const [rejectForm] = Form.useForm();
  const [executeForm] = Form.useForm();

  const refreshPayments = async () => {
    const response = await financePaymentsApi.getAll();
    setData(Array.isArray(response.data?.data) ? response.data.data : []);
  };

  let defaultStatusFilter = 'all';
  let pageTitle = 'Quản Lý & Duyệt Chi Thanh Toán Doanh Nghiệp';

  if (p === '/finance/payments/create') {
    pageTitle = 'Lập Đề Nghị & Phiếu Yêu Cầu Thanh Toán';
  } else if (p === '/finance/payments/approve') {
    pageTitle = 'Hàng Chờ Phê Duyệt Thanh Toán';
    defaultStatusFilter = 'Chờ duyệt';
  } else if (p === '/finance/payments/history') {
    pageTitle = 'Sổ Nhật Ký & Lịch Sử Chi Trả Tiền Mặt / Chuyển Khoản';
    defaultStatusFilter = 'Đã thanh toán';
  }

  const [statusFilter, setStatusFilter] = useState<string>(defaultStatusFilter);

  useEffect(() => {
    setStatusFilter(defaultStatusFilter);
  }, [location.pathname, defaultStatusFilter]);

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);
  const totalPending = data.filter((d) => d.status === 'Chờ duyệt').reduce((sum, item) => sum + item.amount, 0);
  const totalApproved = data.filter((d) => d.status === 'Đã phê duyệt' || d.status === 'Đã thanh toán').reduce((sum, item) => sum + item.amount, 0);
  const totalRejected = data.filter((d) => d.status === 'Từ chối').reduce((sum, item) => sum + item.amount, 0);

  const handleCreate = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const response = await financePaymentsApi.create({
        beneficiary: String(values.beneficiary || '').trim(),
        taxCode: String(values.taxCode || '').trim(),
        bankAccountInfo: String(values.bankAccountInfo || '').trim(),
        category: String(values.category || '').trim(),
        amount: Number(values.amount),
        paymentMethod: values.paymentMethod,
        notes: String(values.notes || '').trim(),
      });
      const newItem = response.data.payment;
      setData((previous) => [newItem, ...previous]);
      message.success(`Đã lưu đề nghị thanh toán ${newItem.code} trên máy chủ.`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không lưu được đề nghị thanh toán.');
    } finally {
      setSaving(false);
    }
  };

  const applyDecision = async (item: EnterprisePaymentItem, operation: () => Promise<{ data: { payment: EnterprisePaymentItem } }>, successText: string) => {
    if (actingKey) return false;
    setActingKey(item.key);
    try {
      const response = await operation();
      const saved = response.data.payment;
      setData((previous) => previous.map((record) => record.key === item.key ? saved : record));
      setSelectedPayment((previous) => previous?.key === item.key ? saved : previous);
      message.success(successText);
      return true;
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không lưu được quyết định thanh toán.');
      void refreshPayments().catch(() => {});
      return false;
    } finally {
      setActingKey('');
    }
  };

  const handleApprove = (item: EnterprisePaymentItem) => Modal.confirm({
    title: `Phê duyệt đề nghị ${item.code}?`,
    content: 'Quyết định được lưu cùng tài khoản và thời điểm thực hiện.',
    okText: 'Phê duyệt', cancelText: 'Hủy',
    onOk: () => applyDecision(item, () => financePaymentsApi.approve(item.key), `Đã lưu phê duyệt ${item.code}.`),
  });

  const handleReject = (item: EnterprisePaymentItem) => {
    rejectForm.resetFields();
    setRejectingPayment(item);
  };

  const handleExecutePayment = (item: EnterprisePaymentItem) => {
    executeForm.resetFields();
    setExecutingPayment(item);
  };

  const submitRejection = async (values: any) => {
    if (!rejectingPayment) return;
    const succeeded = await applyDecision(rejectingPayment, () => financePaymentsApi.reject(rejectingPayment.key, String(values.reason || '').trim()), `Đã lưu quyết định từ chối ${rejectingPayment.code}.`);
    if (succeeded) { setRejectingPayment(null); rejectForm.resetFields(); }
  };

  const submitPaymentRecord = async (values: any) => {
    if (!executingPayment) return;
    const succeeded = await applyDecision(executingPayment, () => financePaymentsApi.recordPayment(executingPayment.key, String(values.sourceAccountId || ''), String(values.settlementReference || '').trim()), `Đã ghi sổ chi và lưu chứng từ cho ${executingPayment.code}.`);
    if (succeeded) { setExecutingPayment(null); executeForm.resetFields(); }
  };

  const executionAccounts = executingPayment
    ? sourceAccounts.filter((account) => {
      if (executingPayment.paymentMethod === 'Tiền mặt') return account.source === 'petty';
      if (account.source !== 'bank') return false;
      if (executingPayment.paymentMethod === 'Chuyển khoản VCB') return /vietcombank|\bvcb\b/i.test(account.name);
      if (executingPayment.paymentMethod === 'Chuyển khoản TCB') return /techcombank|\btcb\b/i.test(account.name);
      return true;
    })
    : [];

  const exportPayments = () => {
    const rows = [
      ['Mã phiếu', 'Ngày lập', 'Người lập', 'Mã nhân viên', 'Thụ hưởng', 'Mã số thuế', 'Thông tin nhận tiền', 'Nội dung', 'Số tiền', 'Phương thức', 'Trạng thái', 'Người duyệt', 'Lý do từ chối', 'Người ghi nhận chi', 'Ngày ghi nhận chi', 'Tài khoản nguồn', 'Mã giao dịch/chứng từ', 'Mã phiếu chi nội bộ'],
      ...filteredData.map((item) => [item.code, item.createdDate, item.creator, item.empCode, item.beneficiary, item.taxCode || '', item.bankAccountInfo, item.category, item.amount, item.paymentMethod, item.status, item.approver || '', item.rejectionReason || '', item.paidBy || '', item.paidAt || '', item.sourceAccount || '', item.settlementReference || '', item.financeTransactionId || '']),
    ];
    downloadFile('de_nghi_thanh_toan.xlsx', generateValidXlsxBlob(rows));
    message.success(`Đã xuất ${filteredData.length} đề nghị thanh toán đang hiển thị.`);
  };

  const printPayment = (item: EnterprisePaymentItem) => {
    const lines = [
      `Ma phieu: ${item.code}`, `Ngay lap: ${item.createdDate}`, `Nguoi lap: ${item.creator} - ${item.empCode}`,
      `Don vi thu huong: ${item.beneficiary}`, `Ma so thue: ${item.taxCode || 'Chua cap nhat'}`,
      `Thong tin nhan tien: ${item.bankAccountInfo}`, `Noi dung chi: ${item.category}`,
      `So tien: ${Number(item.amount).toLocaleString('vi-VN')} VND`, `Phuong thuc: ${item.paymentMethod}`,
      `Trang thai: ${item.status}`, `Nguoi duyet: ${item.approver || 'Chua duyet'}`,
      `Ly do tu choi: ${item.rejectionReason || ''}`, `Nguoi ghi nhan chi: ${item.paidBy || ''}`,
      `Tai khoan nguon: ${item.sourceAccount || ''}`, `Ma giao dich/chung tu: ${item.settlementReference || ''}`,
      `So thu chi noi bo: ${item.financeTransactionId || ''}`,
      ...(item.history || []).map((event) => `${event.at} | ${event.action} | ${event.actor}${event.reason ? ` | ${event.reason}` : ''}${event.reference ? ` | ${event.reference}` : ''}`),
    ];
    downloadFile(`de_nghi_thanh_toan_${item.code}.pdf`, generateValidPdfBlob(`DE NGHI THANH TOAN ${item.code}`, 'Ho so va lich su xu ly noi bo', lines));
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.beneficiary || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.category || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.creator || '').toLowerCase().includes(searchText.toLowerCase());
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const columns = [
    {
      title: 'Mã phiếu & Ngày lập',
      key: 'code',
      render: (_: any, record: EnterprisePaymentItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileTextOutlined /> {record.code}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{record.createdDate}</div>
        </div>
      ),
    },
    {
      title: 'Đơn vị thụ hưởng & Tài khoản',
      key: 'beneficiary',
      render: (_: any, record: EnterprisePaymentItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.beneficiary}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            TK: <code>{record.bankAccountInfo || 'N/A'}</code>
          </div>
        </div>
      ),
    },
    {
      title: 'Nội dung chi thanh toán',
      dataIndex: 'category',
      key: 'category',
      render: (c: string) => <span style={{ color: '#334155', fontSize: 12.5 }}>{c}</span>,
    },
    {
      title: 'Số tiền thanh toán',
      dataIndex: 'amount',
      key: 'amount',
      width: 170,
      render: (val: number) => (
        <span style={{ fontWeight: 800, color: '#DC2626', fontSize: 14 }}>
          {val.toLocaleString('vi-VN')} ₫
        </span>
      ),
      sorter: (a: EnterprisePaymentItem, b: EnterprisePaymentItem) => a.amount - b.amount,
    },
    {
      title: 'Hình thức chi',
      dataIndex: 'paymentMethod',
      key: 'paymentMethod',
      width: 150,
      render: (m: string) => <Tag color="blue">{m}</Tag>,
    },
    {
      title: 'Người lập đề nghị',
      key: 'creator',
      render: (_: any, record: EnterprisePaymentItem) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0F172A' }}>{record.creator}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>Mã NV: {record.empCode}</div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (st: string) => {
        let color = 'default';
        if (st === 'Đã thanh toán') color = 'success';
        if (st === 'Đã phê duyệt') color = 'processing';
        if (st === 'Chờ duyệt') color = 'warning';
        if (st === 'Từ chối') color = 'error';
        return <Tag color={color}>{st}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 180,
      render: (_: any, r: EnterprisePaymentItem) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedPayment(r);
              setDrawerOpen(true);
            }}
          >
            Chi tiết
          </Button>
          {r.status === 'Chờ duyệt' && (
            <>
              {user?.role === 'ADMIN' && <Button size="small" type="primary" loading={actingKey === r.key} disabled={Boolean(actingKey)} onClick={() => handleApprove(r)} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                Duyệt
              </Button>}
              {user?.role === 'ADMIN' && <Button size="small" danger disabled={Boolean(actingKey)} onClick={() => handleReject(r)}>
                Từ chối
              </Button>}
            </>
          )}
          {r.status === 'Đã phê duyệt' && user?.role === 'ADMIN' && (
            <Button size="small" type="primary" disabled={Boolean(actingKey)} onClick={() => handleExecutePayment(r)} style={{ backgroundColor: '#10B981', borderColor: '#10B981' }}>
              Ghi nhận chi
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng giá trị đề nghị chi phát sinh</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {totalAmount.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#0F172A', marginTop: 2 }}>{data.length} Phiếu đề nghị thanh toán</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hàng chờ phê duyệt quản trị</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {totalPending.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>
            {data.filter((d) => d.status === 'Chờ duyệt').length} Phiếu đang chờ phê duyệt
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã duyệt hoặc đã ghi nhận chi</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalApproved.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Theo hồ sơ đề nghị hiện có</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Bị từ chối / Yêu cầu bổ sung hồ sơ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: totalRejected > 0 ? '#DC2626' : '#64748B', marginTop: 4 }}>
            {totalRejected.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: totalRejected > 0 ? '#DC2626' : '#64748B', marginTop: 2 }}>{data.filter((d) => d.status === 'Từ chối').length} Phiếu chưa đạt chuẩn</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả phiếu chi' },
            { key: 'Chờ duyệt', label: 'Chờ phê duyệt', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Đã phê duyệt', label: 'Đã duyệt', icon: <InfoCircleOutlined style={{ color: '#3B82F6' }} /> },
            { key: 'Đã thanh toán', label: 'Đã ghi nhận chi', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'Từ chối', label: 'Từ chối', icon: <CloseCircleOutlined style={{ color: '#EF4444' }} /> },
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
            placeholder="Tìm theo mã phiếu, thụ hưởng, người lập..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={exportPayments}>
            Xuất Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                paymentMethod: 'Chuyển khoản VCB',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập phiếu chi mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
          <KTable dataSource={filteredData} columns={columns} loading={loading} pagination={{ pageSize: 8 }} />
      </div>

      {/* Create Modal */}
      <Modal
        title="Lập Giấy Đề Nghị Thanh Toán &amp; Duyệt Chi Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="beneficiary" label="Đơn vị / Người nhận tiền" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Công Ty TNHH Phân Phối Dell VN" />
            </Form.Item>
            <Form.Item name="taxCode" label="Mã số thuế bên thụ hưởng">
              <Input placeholder="Ví dụ: 0303882910" />
            </Form.Item>
          </div>

          <Form.Item name="bankAccountInfo" label="Thông tin tài khoản nhận tiền" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Vietcombank CN Ba Đình - 001100388912" />
          </Form.Item>

          <Form.Item name="category" label="Nội dung chi thanh toán chi tiết" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Ví dụ: Thanh toán chi phí hạ tầng Server Cloud Quý 3..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="amount" label="Số tiền thanh toán (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={1000} step={1} />
            </Form.Item>
            <Form.Item name="paymentMethod" label="Phương thức thanh toán" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Chuyển khoản VCB', value: 'Chuyển khoản VCB' },
                  { label: 'Chuyển khoản TCB', value: 'Chuyển khoản TCB' },
                  { label: 'Chi tiền mặt tại quỹ', value: 'Tiền mặt' },
                  { label: 'Thẻ tín dụng doanh nghiệp', value: 'Thẻ tín dụng DN' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="notes" label="Ghi chú hóa đơn chứng từ kèm theo">
            <Input placeholder="Ví dụ: Đã kèm HĐGTGT #8912 và Hợp đồng số 12/2026/KIYO" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Trình duyệt thanh toán
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal title={`Từ chối đề nghị ${rejectingPayment?.code || ''}`} open={Boolean(rejectingPayment)} onCancel={() => setRejectingPayment(null)} footer={null} width={520}>
        <Form form={rejectForm} layout="vertical" onFinish={submitRejection}>
          <Form.Item name="reason" label="Lý do từ chối" rules={[{ required: true, message: 'Nhập lý do từ chối.' }]}>
            <Input.TextArea rows={4} maxLength={1000} showCount placeholder="Nêu rõ lý do để người đề nghị biết nội dung cần xử lý." />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setRejectingPayment(null)}>Hủy</Button>
            <Button danger htmlType="submit" loading={actingKey === rejectingPayment?.key}>Lưu quyết định từ chối</Button>
          </div>
        </Form>
      </Modal>

      <Modal title={`Ghi nhận chi cho đề nghị ${executingPayment?.code || ''}`} open={Boolean(executingPayment)} onCancel={() => setExecutingPayment(null)} footer={null} width={520}>
        <div style={{ color: '#475569', marginBottom: 14 }}>
          Chọn tài khoản nguồn, nhập mã giao dịch hoặc phiếu chi sau khi giao dịch hoàn tất. Máy chủ sẽ kiểm tra số dư và ghi phiếu chi vào sổ quỹ nội bộ.
        </div>
        <Form form={executeForm} layout="vertical" onFinish={submitPaymentRecord}>
          <Form.Item name="sourceAccountId" label="Tài khoản nguồn" rules={[{ required: true, message: 'Chọn tài khoản nguồn.' }]}>
            <Select showSearch placeholder={executionAccounts.length ? 'Chọn tài khoản có đủ số dư' : 'Chưa có tài khoản phù hợp'} options={executionAccounts.map((account) => ({ value: account.key, label: `${account.name} · ${account.balance.toLocaleString('vi-VN')} ₫` }))} />
          </Form.Item>
          <Form.Item name="settlementReference" label="Mã giao dịch hoặc chứng từ chi" rules={[{ required: true, message: 'Nhập mã giao dịch hoặc chứng từ chi.' }]}>
            <Input maxLength={120} placeholder="Mã giao dịch ngân hàng hoặc số phiếu chi" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setExecutingPayment(null)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={actingKey === executingPayment?.key} disabled={!executionAccounts.length} style={{ backgroundColor: '#10B981', borderColor: '#10B981' }}>Ghi sổ và xác nhận chi</Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Giấy Đề Nghị Thanh Toán Chuẩn */}
      <Drawer
        title="Giấy Đề Nghị Thanh Toán &amp; Duyệt Chi Điện Tử"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedPayment && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ PHIẾU: {selectedPayment.code}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
                    {selectedPayment.amount.toLocaleString('vi-VN')} ₫
                  </div>
                </div>
                <Tag color={selectedPayment.status === 'Đã thanh toán' ? 'success' : selectedPayment.status === 'Từ chối' ? 'error' : 'warning'}>
                  {selectedPayment.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Phương thức: {selectedPayment.paymentMethod} · Ngày lập: {selectedPayment.createdDate}
              </div>
            </div>

            {/* Beneficiary */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Tin Bên Thụ Hưởng &amp; Tài Khoản:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Đơn vị thụ hưởng:</span>
                  <strong style={{ color: '#0F172A' }}>{selectedPayment.beneficiary}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Mã số thuế:</span>
                  <code>{selectedPayment.taxCode || 'Chưa cập nhật'}</code>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Tài khoản nhận:</span>
                  <strong style={{ color: '#2563EB' }}>{selectedPayment.bankAccountInfo}</strong>
                </div>
                <div style={{ marginTop: 6, color: '#334155' }}>
                  Nội dung chi: <em>"{selectedPayment.category}"</em>
                </div>
                {selectedPayment.notes && (
                  <div style={{ fontSize: 12, color: '#64748B', background: '#F1F5F9', padding: '8px 10px', borderRadius: 4 }}>
                    Chứng từ kèm theo: {selectedPayment.notes}
                  </div>
                )}
              </div>
            </div>

            {/* Approval status and server-recorded history */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AuditOutlined /> Tiến trình xử lý:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                <div style={{ background: '#FFFFFF', padding: 10, borderRadius: 6, border: '1px solid #E2E8F0' }}>
                  <span style={{ color: '#64748B' }}>Người Đề Nghị:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{selectedPayment.creator}</div>
                  <div style={{ fontSize: 11, color: '#16A34A', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><CheckOutlined /> Đã gửi đề nghị lên máy chủ</div>
                </div>
                <div style={{ background: '#FFFFFF', padding: 10, borderRadius: 6, border: '1px solid #E2E8F0' }}>
                  <span style={{ color: '#64748B' }}>Thẩm Quyền Phê Duyệt:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{selectedPayment.approver || 'Chờ quản trị phê duyệt'}</div>
                  <div style={{ fontSize: 11, color: selectedPayment.approver ? '#16A34A' : '#D97706', marginTop: 2 }}>
                    {selectedPayment.approver ? `Đã xử lý ${selectedPayment.approvedAt || selectedPayment.rejectedAt || ''}` : 'Đang chờ duyệt'}
                  </div>
                </div>
              </div>
              {selectedPayment.rejectionReason && <div style={{ marginTop: 10, color: '#B91C1C' }}>Lý do từ chối: {selectedPayment.rejectionReason}</div>}
              {selectedPayment.paidAt && <div style={{ marginTop: 10, color: '#334155' }}>Ghi nhận chi bởi {selectedPayment.paidBy} lúc {selectedPayment.paidAt}. Tài khoản nguồn: <strong>{selectedPayment.sourceAccount}</strong>. Mã giao dịch/chứng từ: <strong>{selectedPayment.settlementReference}</strong>. {selectedPayment.ledgerRecorded ? `Phiếu chi nội bộ ${selectedPayment.financeTransactionId} đã ghi sổ.` : ''}</div>}
              <div style={{ display: 'grid', gap: 5, marginTop: 10, fontSize: 11.5, color: '#475569' }}>
                {(selectedPayment.history || []).map((event, index) => <div key={`${event.at}-${index}`}>{event.at} · {event.action} · {event.actor}{event.reason ? ` · ${event.reason}` : ''}{event.reference ? ` · ${event.reference}` : ''}</div>)}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {selectedPayment.status === 'Chờ duyệt' && user?.role === 'ADMIN' && (
                <>
                  <Button
                    type="primary"
                    style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                    onClick={() => handleApprove(selectedPayment)}
                  >
                    Phê Duyệt Chi Tiền
                  </Button>
                  <Button danger onClick={() => handleReject(selectedPayment)}>
                    Từ Chối
                  </Button>
                </>
              )}
              {selectedPayment.status === 'Đã phê duyệt' && user?.role === 'ADMIN' && (
                <Button
                  type="primary"
                  style={{ flex: 1, backgroundColor: '#10B981', borderColor: '#10B981' }}
                  onClick={() => handleExecutePayment(selectedPayment)}
                >
                  Ghi nhận chứng từ chi
                </Button>
              )}
              <Button
                icon={<PrinterOutlined />}
                onClick={() => printPayment(selectedPayment)}
              >
                In Giấy Đề Nghị (A4)
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

