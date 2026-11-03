import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  CalendarOutlined,
  WarningOutlined,
  SafetyCertificateOutlined,
  FilePdfOutlined,
  SendOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Card, Tag, Alert } from '../../custom-ui';
import { FinancePaymentAccount, FinancePaymentRequest, financePaymentAccountsApi, financePaymentsApi } from '../../api/endpoints';

interface TaxFiling {
  key: string;
  code: string;
  taxType: 'Thuế GTGT' | 'Thuế TNDN tạm tính' | 'Thuế TNCN khấu trừ' | 'Lệ phí Môn bài';
  period: string;
  taxAuthority: string;
  amountPayable: number;
  amountPaid: number;
  deadline: string;
  status: 'Đã nộp đủ' | 'Chờ nộp thuế' | 'Quá hạn nộp' | 'Đã ghi nhận đủ theo chứng từ nội bộ' | 'Đã ghi nhận một phần theo chứng từ nội bộ';
  externalStatus?: string;
}

const INITIAL_TAX_DATA: TaxFiling[] = [];

export const TaxModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const isTypes = currentPath === '/finance/tax/types';
  const isPeriods = currentPath === '/finance/tax/periods';
  const isDeadlines = currentPath === '/finance/tax/deadlines';
  const isOrders = currentPath === '/finance/tax/orders';
  const isRisky = currentPath === '/finance/tax/risky';
  const isDeclaration = currentPath === '/finance/tax/declaration';

  const [data, setData] = useState<TaxFiling[]>(INITIAL_TAX_DATA);
  const [payments, setPayments] = useState<FinancePaymentRequest[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<FinancePaymentAccount[]>([]);

  useEffect(() => {
    const list = dataService.getGenericData('finance_tax');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('finance_tax');
      setData(Array.isArray(updated) ? updated : []);
    });
    void financePaymentsApi.getAll().then(response => {
      if (!Array.isArray(response.data?.data)) throw new Error('Dữ liệu đề nghị nộp thuế không hợp lệ.');
      setPayments(response.data.data.filter(payment => payment.sourceModule === 'finance_tax'));
    }).catch(() => message.error('Không tải được đề nghị nộp thuế.'));
    void financePaymentAccountsApi.getAccounts().then(response => setPaymentAccounts(response.data.accounts)).catch(() => setPaymentAccounts([]));
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [paymentForm] = Form.useForm();
  const [settlementForm] = Form.useForm();
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [settlementModalOpen, setSettlementModalOpen] = useState(false);
  const [selectedTax, setSelectedTax] = useState<TaxFiling | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<FinancePaymentRequest | null>(null);

  const loadPayments = async () => {
    const response = await financePaymentsApi.getAll(1, 200);
    if (!Array.isArray(response.data?.data)) throw new Error('Dữ liệu đề nghị nộp thuế không hợp lệ.');
    const remainingPages = Array.from({ length: Math.max(0, response.data.pagination.totalPages - 1) }, (_, index) => index + 2);
    const otherPages = await Promise.all(remainingPages.map(page => financePaymentsApi.getAll(page, 200)));
    setPayments([...response.data.data, ...otherPages.flatMap(page => page.data.data)].filter(payment => payment.sourceModule === 'finance_tax'));
  };

  const totalPayable = data.reduce((sum, item) => sum + item.amountPayable, 0);
  const totalPaid = data.reduce((sum, item) => sum + item.amountPaid, 0);
  const totalPending = Math.max(0, totalPayable - totalPaid);
  const declaredTaxTypes = Array.from(new Set(data.map(item => item.taxType).filter(Boolean)));
  const deadlineRows = data.filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.deadline || '')).sort((a, b) => a.deadline.localeCompare(b.deadline));

  const handleCreate = async (values: any) => {
    const payable = Number(values.amountPayable) || 0;
    const newTax: TaxFiling = {
      ...values,
      key: String(Date.now()),
      amountPayable: payable,
      amountPaid: 0,
      status: 'Chờ nộp thuế',
    };
    try {
      await dataService.createGenericRecord('finance_tax', newTax);
      message.success(`Đã lưu hồ sơ thuế ${values.taxType} - ${values.period} ở trạng thái chờ nộp.`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể lưu hồ sơ thuế.');
    }
  };

  const openTaxPayment = (record: TaxFiling) => {
    setSelectedTax(record);
    paymentForm.setFieldsValue({ amount: Math.max(0, record.amountPayable - record.amountPaid) });
    setPaymentModalOpen(true);
  };

  const submitTaxPayment = async (values: { amount: number; debitAccount: string }) => {
    if (!selectedTax) return;
    try {
      const response = await financePaymentsApi.create({
        beneficiary: selectedTax.taxAuthority || 'Ngân sách Nhà nước',
        bankAccountInfo: 'Nộp ngân sách Nhà nước theo hồ sơ thuế nội bộ',
        category: `Nộp ${selectedTax.taxType} kỳ ${selectedTax.period}`,
        amount: Number(values.amount),
        paymentMethod: 'Nộp ngân sách nhà nước',
        debitAccount: values.debitAccount,
        sourceModule: 'finance_tax',
        sourceReference: selectedTax.key,
      });
      setPaymentModalOpen(false);
      paymentForm.resetFields();
      setSelectedTax(null);
      await loadPayments();
      message.success(`Đã tạo đề nghị ${response.data.payment.code}; cần phê duyệt và ghi nhận giao dịch ngân hàng.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tạo đề nghị nộp thuế.');
    }
  };

  const approveTaxPayment = async (payment: FinancePaymentRequest) => {
    try {
      await financePaymentsApi.approve(payment.key);
      await loadPayments();
      message.success(`Đã phê duyệt đề nghị ${payment.code}.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể phê duyệt đề nghị nộp thuế.');
    }
  };

  const openTaxSettlement = (payment: FinancePaymentRequest) => {
    setSelectedPayment(payment);
    settlementForm.resetFields();
    setSettlementModalOpen(true);
  };

  const submitTaxSettlement = async (values: { sourceAccountId: string; settlementReference: string }) => {
    if (!selectedPayment) return;
    try {
      await financePaymentsApi.execute(selectedPayment.key, values);
      setSettlementModalOpen(false);
      settlementForm.resetFields();
      setSelectedPayment(null);
      const refreshedTaxes = await dataService.refreshGenericData('finance_tax');
      setData(Array.isArray(refreshedTaxes) ? refreshedTaxes as TaxFiling[] : []);
      await Promise.all([
        loadPayments(),
        financePaymentAccountsApi.getAccounts().then(response => setPaymentAccounts(response.data.accounts)),
      ]);
      message.success('Đã ghi nhận khoản thanh toán nội bộ và cập nhật Sổ Cái. Trạng thái với cơ quan thuế vẫn chưa được xác minh.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể ghi nhận giao dịch nộp thuế.');
    }
  };

  const filteredData = data.filter(
    (item) =>
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.taxType || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.period || '').toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng nghĩa vụ theo hồ sơ đã lưu</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {totalPayable.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã ghi nhận trong dữ liệu nội bộ</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalPaid.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nghĩa vụ thuế chờ nộp sắp tới</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {totalPending.toLocaleString('vi-VN')} ₫
          </div>
        </div>
      </div>

      <Alert
        message="Hồ sơ trong web chưa được gửi cơ quan thuế"
        description="Các bản ghi ở đây chỉ là dữ liệu nội bộ. Web hiện chưa kết nối eTax hoặc dịch vụ xác nhận thanh toán, nên không thể đánh dấu một khoản thuế là đã nộp."
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
      />

      {/* VIEW: TYPES (Danh mục các loại sắc thuế doanh nghiệp) */}
      {isTypes && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Danh Mục Các Sắc Thuế Doanh Nghiệp Áp Dụng</h3>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => message.warning('Chức năng đăng ký sắc thuế cần kết nối cơ quan thuế; chưa có xác nhận trực tuyến.')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Thêm sắc thuế
            </Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {declaredTaxTypes.map((taxType) => (
              <Card key={taxType} style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <strong style={{ color: '#009688', fontSize: 14 }}>Theo hồ sơ đã nhập</strong>
                  <Tag color="warning">Chưa xác minh</Tag>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A', marginBottom: 4 }}>{taxType}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>Mức thuế và kỳ kê khai cần xác nhận theo hồ sơ doanh nghiệp và quy định áp dụng.</div>
              </Card>
            ))}
            {!declaredTaxTypes.length && <div style={{ color: '#64748B', padding: 16 }}>Chưa có sắc thuế nào được khai báo trong hồ sơ nội bộ.</div>}
          </div>
        </div>
      )}

      {/* VIEW: PERIODS (Kỳ kê khai thuế) */}
      {isPeriods && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Kỳ kê khai theo hồ sơ nội bộ</h3>
            <Button icon={<DownloadOutlined />} disabled title="Chưa có dữ liệu kỳ kê khai đã xác nhận">
              Xuất Danh Sách Kỳ Kê Khai
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={data.map(item => ({ ...item, type: item.taxType }))}
              columns={[
                { title: 'Kỳ kê khai', dataIndex: 'period', key: 'period', render: (p: string) => <strong>{p}</strong> },
                { title: 'Sắc thuế áp dụng', dataIndex: 'type', key: 'type' },
                { title: 'Thời gian kỳ', dataIndex: 'period', key: 'time' },
                { title: 'Hạn chót đã khai báo', dataIndex: 'deadline', key: 'deadline', render: (d: string) => <strong style={{ color: '#DC2626' }}>{d || 'Chưa khai báo'}</strong> },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s.includes('hoàn tất') ? 'success' : s.includes('Sắp') ? 'warning' : 'processing'}>{s}</Tag> },
                { title: 'Thao tác', key: 'act', render: () => <Button size="small" disabled>Chưa có tờ khai điện tử</Button> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: DEADLINES (Lịch hạn chót nộp thuế) */}
      {isDeadlines && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Hạn chót đã khai báo</h3>
            <Button icon={<CalendarOutlined />} disabled title="Chưa tích hợp lịch ngoài">
              Đồng bộ Lịch
            </Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {deadlineRows.map((item) => {
              const days = Math.ceil((Date.parse(`${item.deadline}T00:00:00`) - Date.now()) / 86_400_000);
              return <Card key={item.key} style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ color: '#DC2626', fontSize: 14 }}>Hạn: {item.deadline}</strong>
                  <Tag color={days < 0 ? 'error' : days <= 7 ? 'warning' : 'processing'}>{days < 0 ? `Quá hạn ${Math.abs(days)} ngày` : days === 0 ? 'Đến hạn hôm nay' : `Còn ${days} ngày`}</Tag>
                </div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0F172A', marginBottom: 6 }}>{item.taxType} · {item.period}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>Hạn do người dùng khai báo; chưa đồng bộ với CQT.</div>
              </Card>;
            })}
            {!deadlineRows.length && <div style={{ color: '#64748B', padding: 16 }}>Chưa có hạn nộp được khai báo.</div>}
          </div>
        </div>
      )}

      {/* VIEW: ORDERS (Giấy nộp tiền NSNN Mẫu C1-02/NS) */}
      {isOrders && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Đề nghị nộp thuế qua quy trình thanh toán</h3>
          </div>
          <Alert message="Ghi nhận nội bộ, chưa xác nhận với cơ quan thuế" description="Đề nghị phải được phê duyệt và ghi nhận bằng mã giao dịch ngân hàng. Phần mềm cập nhật số đã thanh toán và Sổ Cái nội bộ; trạng thái nộp trên eTax hoặc Kho bạc vẫn cần xác minh bên ngoài." type="warning" showIcon />
          <div className="transparent-table-card">
            <KTable
              dataSource={payments}
              columns={[
                { title: 'Mã đề nghị', dataIndex: 'code', key: 'code', render: (code: string) => <span>{code}</span> },
                { title: 'Loại thuế và kỳ', key: 'tax', render: (_: unknown, payment: FinancePaymentRequest) => <span>{payment.taxType} · {payment.taxPeriod}</span> },
                { title: 'Cơ quan thuế', dataIndex: 'taxAuthority', key: 'authority', render: (value: string) => value || 'Chưa khai báo' },
                { title: 'Số tiền', dataIndex: 'amount', key: 'amount', render: (value: number) => `${Number(value).toLocaleString('vi-VN')} ₫` },
                { title: 'Mã giao dịch', dataIndex: 'settlementReference', key: 'reference', render: (value: string) => value || 'Chưa ghi nhận' },
                { title: 'Trạng thái nội bộ', dataIndex: 'status', key: 'status', render: (status: string) => <Tag color={status === 'Đã thanh toán' ? 'success' : status === 'Từ chối' ? 'error' : 'warning'}>{status}</Tag> },
                { title: 'Thao tác', key: 'actions', render: (_: unknown, payment: FinancePaymentRequest) => payment.status === 'Chờ duyệt'
                  ? <Button onClick={() => void approveTaxPayment(payment)}>Phê duyệt</Button>
                  : payment.status === 'Đã phê duyệt'
                    ? <Button type="primary" onClick={() => openTaxSettlement(payment)}>Ghi nhận giao dịch</Button>
                    : <span>{payment.financeTransactionId ? 'Đã liên kết phiếu chi' : 'Không có'}</span> },
              ]}
              pagination={{ pageSize: 10 }}
            />
          </div>
        </div>
      )}

      {/* VIEW: RISKY (Doanh nghiệp rủi ro về thuế CQT) */}
      {isRisky && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Alert
            message="Cảnh báo an toàn thuế đầu vào"
            description="Web chưa kết nối danh sách cảnh báo hoặc API tra cứu mã số thuế của cơ quan thuế; không thể xác nhận trạng thái thuế hay tự động chặn hóa đơn."
            type="warning"
            showIcon
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Danh Sách Doanh Nghiệp Có Cảnh Báo Rủi Ro Thuế</h3>
            <Input prefix={<SearchOutlined style={{ color: '#bbb' }} />} placeholder="Chưa kết nối nguồn tra cứu thuế" style={{ width: 340, borderRadius: 6 }} allowClear disabled />
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={[]}
              columns={[
                { title: 'Mã số thuế', dataIndex: 'taxCode', key: 'taxCode', render: (t: string) => <code style={{ color: '#DC2626', fontWeight: 700 }}>{t}</code> },
                { title: 'Tên doanh nghiệp vi phạm', dataIndex: 'name', key: 'name', render: (n: string) => <strong>{n}</strong> },
                { title: 'Lý do cảnh báo của CQT', dataIndex: 'reason', key: 'reason' },
                { title: 'Ngày CQT công bố', dataIndex: 'date', key: 'date' },
                { title: 'Mức độ', dataIndex: 'risk', key: 'risk', render: (r: string) => <Tag color="error">{r}</Tag> },
                { title: 'Hành động hệ thống', dataIndex: 'action', key: 'action', render: (a: string) => <span style={{ color: '#DC2626', fontWeight: 600 }}>{a}</span> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: DECLARATION & DEFAULT */}
      {!isTypes && !isPeriods && !isDeadlines && !isOrders && !isRisky && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Tìm theo mã tờ khai, loại thuế, kỳ kê khai..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 340, borderRadius: 6 }}
              allowClear
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.resetFields();
                setModalOpen(true);
              }}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Thêm kỳ kê khai thuế
            </Button>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={filteredData}
              columns={[
                {
                  title: 'Mã tờ khai',
                  dataIndex: 'code',
                  key: 'code',
                  render: (code: string) => (
                    <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AuditOutlined /> {code}
                    </span>
                  ),
                },
                {
                  title: 'Sắc thuế kê khai',
                  dataIndex: 'taxType',
                  key: 'taxType',
                  render: (t: string) => <strong>{t}</strong>,
                },
                {
                  title: 'Kỳ tính thuế',
                  dataIndex: 'period',
                  key: 'period',
                },
                {
                  title: 'Cơ quan thuế quản lý',
                  dataIndex: 'taxAuthority',
                  key: 'taxAuthority',
                  render: (auth: string) => <span style={{ color: '#475569', fontSize: 12.5 }}>{auth}</span>,
                },
                {
                  title: 'Số tiền thuế (VNĐ)',
                  dataIndex: 'amountPayable',
                  key: 'amountPayable',
                  render: (val: number) => (
                    <strong style={{ fontSize: 13.5, color: '#0F172A' }}>
                      {val.toLocaleString('vi-VN')} ₫
                    </strong>
                  ),
                },
                {
                  title: 'Còn phải nộp',
                  key: 'remaining',
                  render: (_: unknown, record: TaxFiling) => `${Math.max(0, record.amountPayable - record.amountPaid).toLocaleString('vi-VN')} ₫`,
                },
                {
                  title: 'Hạn nộp',
                  dataIndex: 'deadline',
                  key: 'deadline',
                  render: (d: string) => <span style={{ color: '#DC2626', fontWeight: 500 }}>{d}</span>,
                },
                {
                  title: 'Trạng thái',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status: string) => (
                    <Tag color={status === 'Đã nộp đủ' ? 'success' : status.includes('nội bộ') ? 'processing' : 'warning'}>
                      {status}
                    </Tag>
                  ),
                },
                {
                  title: 'Thao tác',
                  key: 'action',
                  render: (_: any, record: TaxFiling) => (
                    <Button
                      type="primary"
                      disabled={record.amountPayable <= record.amountPaid}
                      onClick={() => openTaxPayment(record)}
                      style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                    >
                      {record.amountPayable <= record.amountPaid ? 'Đã ghi nhận đủ' : 'Lập đề nghị nộp'}
                    </Button>
                  ),
                },
              ]}
              pagination={{ pageSize: 10 }}
            />
          </div>
        </div>
      )}

      {/* Modal Add Tax Filing */}
      <Modal
        title="Thêm kỳ kê khai thuế doanh nghiệp mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã hồ sơ thuế" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="taxType" label="Loại thuế" rules={[{ required: true, message: 'Chọn loại thuế' }]}>
              <Select
                options={[
                  { label: 'Thuế GTGT', value: 'Thuế GTGT' },
                  { label: 'Thuế TNDN tạm tính', value: 'Thuế TNDN tạm tính' },
                  { label: 'Thuế TNCN khấu trừ', value: 'Thuế TNCN khấu trừ' },
                  { label: 'Lệ phí Môn bài', value: 'Lệ phí Môn bài' },
                ]}
              />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="period" label="Kỳ kê khai" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="amountPayable" label="Số tiền phải nộp (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={1000000} />
            </Form.Item>
          </div>
          <Form.Item name="taxAuthority" label="Cơ quan thuế quản lý">
            <Input />
          </Form.Item>
          <Form.Item name="deadline" label="Hạn chót nộp" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu tờ khai
            </Button>
          </div>
        </Form>
      </Modal>
      <Modal
        title={`Lập đề nghị nộp ${selectedTax?.taxType || 'thuế'}${selectedTax ? ` kỳ ${selectedTax.period}` : ''}`}
        open={paymentModalOpen}
        onCancel={() => { setPaymentModalOpen(false); paymentForm.resetFields(); setSelectedTax(null); }}
        footer={null}
        width={500}
      >
        <Form form={paymentForm} layout="vertical" onFinish={submitTaxPayment}>
          <div style={{ marginBottom: 14, color: '#64748B' }}>
            Còn phải nộp: {selectedTax ? Math.max(0, selectedTax.amountPayable - selectedTax.amountPaid).toLocaleString('vi-VN') : '0'} ₫. Đề nghị sẽ đi qua bước phê duyệt và ghi nhận giao dịch riêng.
          </div>
          <Form.Item name="amount" label="Số tiền đề nghị" rules={[{ required: true, message: 'Nhập số tiền đề nghị.' }]}>
            <Input type="number" min={1} step={1} />
          </Form.Item>
          <Form.Item name="debitAccount" label="Tài khoản Nợ phải trả thuế" rules={[{ required: true, whitespace: true, message: 'Nhập tài khoản Nợ theo hệ thống tài khoản doanh nghiệp.' }]}>
            <Input maxLength={24} placeholder="Nhập mã tài khoản thuế phải trả" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Button onClick={() => { setPaymentModalOpen(false); paymentForm.resetFields(); setSelectedTax(null); }}>Hủy</Button>
            <Button type="primary" htmlType="submit">Tạo đề nghị</Button>
          </div>
        </Form>
      </Modal>
      <Modal
        title={`Ghi nhận giao dịch nộp thuế ${selectedPayment?.code || ''}`}
        open={settlementModalOpen}
        onCancel={() => { setSettlementModalOpen(false); settlementForm.resetFields(); setSelectedPayment(null); }}
        footer={null}
        width={500}
      >
        <Form form={settlementForm} layout="vertical" onFinish={submitTaxSettlement}>
          <Alert message="Chỉ ghi nhận sau khi giao dịch thực tế đã được thực hiện." description="Nhập mã tham chiếu ngân hàng. Thao tác cập nhật số đã thanh toán trong dữ liệu nội bộ, không xác nhận trạng thái từ eTax hoặc Kho bạc." type="warning" showIcon style={{ marginBottom: 14 }} />
          <Form.Item name="sourceAccountId" label="Tài khoản ngân hàng trích tiền" rules={[{ required: true, message: 'Chọn tài khoản ngân hàng.' }]}>
            <Select placeholder="Chọn tài khoản" options={paymentAccounts.filter(account => account.source === 'bank' && account.status === 'Đang hoạt động').map(account => ({ value: account.key, label: `${account.name} · ${Number(account.balance).toLocaleString('vi-VN')} ₫` }))} />
          </Form.Item>
          <Form.Item name="settlementReference" label="Mã giao dịch ngân hàng" rules={[{ required: true, min: 3, whitespace: true, message: 'Nhập mã giao dịch ngân hàng, tối thiểu 3 ký tự.' }]}>
            <Input maxLength={120} placeholder="Mã giao dịch trên chứng từ ngân hàng" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Button onClick={() => { setSettlementModalOpen(false); settlementForm.resetFields(); setSelectedPayment(null); }}>Hủy</Button>
            <Button type="primary" htmlType="submit">Ghi nhận giao dịch</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
