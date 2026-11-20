import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  ShoppingOutlined,
  FileProtectOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Progress } from '../../custom-ui';
import { financeDocumentsApi, FinanceDocument } from '../../api/endpoints';
import { ContactSelect } from '../crm/ContactSelect';
import { TradeTermsFields } from './TradeTermsFields';
import { termsFromValues, vatOf } from './tradeTerms';
import { vatRateOptions } from './vatRateRules';
import { PurchaseRequestsModule } from './PurchaseRequestsModule';

const formatMoney = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;
const currentBusinessDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const purchaseStatusOptions = [
  { label: 'Chờ xử lý', value: 'Chờ xử lý' },
  { label: 'Đang nhận hàng', value: 'Đang nhận hàng' },
  { label: 'Đã nhận hàng', value: 'Đã nhận hàng' },
  { label: 'Đã hủy', value: 'Đã hủy' },
];

const PurchasingDocumentsModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const [data, setData] = useState<FinanceDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [subTotal, setSubTotal] = useState(0);
  const [vatRate, setVatRate] = useState(10);
  const [documentDate, setDocumentDate] = useState(currentBusinessDate());
  const [form] = Form.useForm();

  const isCharts = currentPath === '/finance/purchasing/charts';
  const isContracts = currentPath === '/finance/purchasing/contracts';
  const isReturns = currentPath === '/finance/purchasing/returns';
  const isInputInvoices = currentPath === '/finance/purchasing/input-invoices';

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await financeDocumentsApi.getAll({ documentType: 'purchase' });
      setData(response.data.data);
    } catch (error: any) {
      setData([]);
      message.error(error?.response?.data?.message || 'Không tải được dữ liệu mua hàng.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredData = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return data.filter((item) => {
      const matchSearch =
        !keyword ||
        (item.code || '').toLowerCase().includes(keyword) ||
        (item.partnerName || '').toLowerCase().includes(keyword) ||
        (item.description || '').toLowerCase().includes(keyword);
      if (isContracts) return matchSearch && item.subtype === 'Hợp đồng mua';
      if (isInputInvoices) return matchSearch && item.subtype === 'Hóa đơn đầu vào';
      return matchSearch;
    });
  }, [data, searchText, isContracts, isInputInvoices]);

  const validData = data.filter((item) => item.status !== 'Đã hủy');
  const totalSpend = validData.reduce((sum, item) => sum + item.amount, 0);
  const totalPaid = validData.reduce((sum, item) => sum + item.paidAmount, 0);
  const totalPayable = Math.max(0, totalSpend - totalPaid);

  const bySubtype = useMemo(() => {
    const totals = new Map<string, number>();
    validData.forEach((item) => totals.set(item.subtype, (totals.get(item.subtype) || 0) + item.amount));
    return Array.from(totals, ([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  }, [validData]);

  const vatAmount = vatOf(subTotal, vatRate);

  const handleCreate = async (values: any) => {
    if (saving) return;
    const net = Number(values.subTotal) || 0;
    const rate = Number(values.vatRate) || 0;
    const vat = vatOf(net, rate);
    const amount = net + vat;
    const paidAmount = Number(values.paidAmount) || 0;
    setSaving(true);
    try {
      await financeDocumentsApi.create({
        documentType: 'purchase',
        subtype: values.subtype || 'Đơn mua hàng',
        partnerName: values.partnerName,
        description: values.description || '',
        amount,
        paidAmount,
        documentDate: values.documentDate || currentBusinessDate(),
        dueDate: values.dueDate || '',
        status: values.status || 'Chờ xử lý',
        taxCode: values.taxCode || '',
        vatRate: rate,
        vatAmount: vat,
        ...(values.supplierId ? { supplierId: values.supplierId } : {}),
        terms: termsFromValues(values),
      });
      message.success('Đã lưu chứng từ mua hàng và đồng bộ sang dòng tiền nếu có khoản đã trả.');
      setModalOpen(false);
      setSupplierId('');
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu chứng từ mua hàng.');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Mã chứng từ',
      dataIndex: 'code',
      key: 'code',
      render: (code: string, record: FinanceDocument) => (
        <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
          {record.subtype === 'Hóa đơn đầu vào' ? <SafetyCertificateOutlined /> : <ShoppingOutlined />} {code}
        </span>
      ),
    },
    {
      title: 'Nhà cung cấp và nội dung',
      key: 'partnerName',
      render: (_: any, record: FinanceDocument) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A' }}>{record.partnerName}</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>{record.description || 'Không có diễn giải'}</div>
          {record.terms?.contractNo && <div style={{ fontSize: 12, color: '#64748B' }}>Hợp đồng {record.terms.contractNo}</div>}
          {(record.termWarnings || []).map((warning) => <div key={warning} style={{ fontSize: 12, color: '#D97706' }}>{warning}</div>)}
        </div>
      ),
    },
    { title: 'Phân loại', dataIndex: 'subtype', key: 'subtype', render: (value: string) => <Tag color={value === 'Hợp đồng mua' ? 'processing' : 'purple'}>{value}</Tag> },
    { title: 'Ngày', dataIndex: 'documentDate', key: 'documentDate', width: 120 },
    { title: 'Thuế GTGT', dataIndex: 'vatAmount', key: 'vatAmount', width: 140, render: (value: number, record: FinanceDocument) => <span>{formatMoney(value)} ({record.vatRate}%)</span> },
    { title: 'Tổng tiền', dataIndex: 'amount', key: 'amount', width: 150, render: (value: number) => <strong>{formatMoney(value)}</strong> },
    { title: 'Đã trả', dataIndex: 'paidAmount', key: 'paidAmount', width: 150, render: (value: number) => <span style={{ color: '#16A34A', fontWeight: 700 }}>{formatMoney(value)}</span> },
    { title: 'Còn phải trả', dataIndex: 'remainingAmount', key: 'remainingAmount', width: 150, render: (value: number) => <strong style={{ color: value > 0 ? '#DC2626' : '#16A34A' }}>{formatMoney(value)}</strong> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 140, render: (value: string) => <Tag color={value === 'Đã hủy' ? 'error' : value === 'Đã nhận hàng' ? 'success' : 'warning'}>{value}</Tag> },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Tổng mua hàng đã ghi nhận</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{formatMoney(totalSpend)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Đã thanh toán NCC</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{formatMoney(totalPaid)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Còn phải trả</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>{formatMoney(totalPayable)}</div>
        </div>
      </div>

      {isCharts ? (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>Cơ cấu chi phí mua hàng theo chứng từ đã lưu</h3>
          {bySubtype.length ? bySubtype.map((item) => {
            const percent = totalSpend > 0 ? Math.round((item.amount / totalSpend) * 1000) / 10 : 0;
            return (
              <div key={item.name} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4, fontSize: 13 }}>
                  <strong>{item.name}</strong>
                  <span style={{ color: '#009688', fontWeight: 700 }}>{formatMoney(item.amount)} ({percent}%)</span>
                </div>
                <Progress percent={percent} strokeColor="#009688" showInfo={false} />
              </div>
            );
          }) : <div style={{ color: '#64748B' }}>Chưa có chứng từ mua hàng để phân tích.</div>}
        </div>
      ) : isReturns ? (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16, color: '#64748B' }}>
          <FileProtectOutlined /> Trả hàng mua cần nghiệp vụ kho/hóa đơn điều chỉnh. Hiện chưa có nguồn dữ liệu backend cho luồng này nên không hiển thị số liệu mẫu.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Tìm mã chứng từ, nhà cung cấp, nội dung..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              style={{ width: 340, borderRadius: 6 }}
              allowClear
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>Làm mới</Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  form.resetFields();
                  setSupplierId('');
                  setSubTotal(0);
                  setVatRate(10);
                  setDocumentDate(currentBusinessDate());
                  form.setFieldsValue({ subtype: isContracts ? 'Hợp đồng mua' : isInputInvoices ? 'Hóa đơn đầu vào' : 'Đơn mua hàng', documentDate: currentBusinessDate(), paidAmount: 0, vatRate: 10 });
                  setModalOpen(true);
                }}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Thêm chứng từ mua
              </Button>
            </div>
          </div>

          <div className="transparent-table-card">
            <KTable dataSource={filteredData} columns={columns} loading={loading} pagination={{ pageSize: 8 }} locale={{ emptyText: 'Chưa có chứng từ mua hàng.' }} />
          </div>
        </div>
      )}

      <Modal title="Thêm chứng từ mua hàng" open={modalOpen} onCancel={() => { setModalOpen(false); setSupplierId(''); }} footer={null} width={680}>
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14, maxHeight: '72vh', overflowY: 'auto', paddingRight: 8 }}>
          <Form.Item name="subtype" label="Phân loại" rules={[{ required: true }]}>
            <Select options={[{ label: 'Đơn mua hàng', value: 'Đơn mua hàng' }, { label: 'Hợp đồng mua', value: 'Hợp đồng mua' }, { label: 'Hóa đơn đầu vào', value: 'Hóa đơn đầu vào' }]} />
          </Form.Item>
          <Form.Item name="supplierId" label="Nhà cung cấp trong danh bạ">
            <ContactSelect type="supplier" allowClear
              onSelectContact={(selected) => {
                setSupplierId(selected?.key || '');
                if (selected) form.setFieldsValue({ partnerName: selected.name, taxCode: selected.taxCode || '' });
              }} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="partnerName" label="Tên nhà cung cấp" rules={[{ required: true, whitespace: true }]}>
              <Input disabled={!!supplierId} />
            </Form.Item>
            <Form.Item name="taxCode" label="Mã số thuế nhà cung cấp">
              <Input placeholder="10 số, 13 số hoặc số định danh 12 số" />
            </Form.Item>
          </div>
          <Form.Item name="description" label="Nội dung hàng hóa, dịch vụ">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="documentDate" label="Ngày chứng từ" rules={[{ required: true }]}>
              <Input type="date" onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDocumentDate(event.target.value)} />
            </Form.Item>
            <Form.Item name="dueDate" label="Hạn thanh toán">
              <Input type="date" />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="subTotal" label="Tiền hàng chưa thuế" rules={[{ required: true }]}>
              <Input type="number" min={1} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSubTotal(Number(event.target.value) || 0)} />
            </Form.Item>
            <Form.Item name="vatRate" label="Thuế suất GTGT" rules={[{ required: true }]}>
              <Select options={vatRateOptions(documentDate)} onChange={(value: number) => setVatRate(Number(value) || 0)} />
            </Form.Item>
            <Form.Item name="paidAmount" label="Đã trả">
              <Input type="number" min={0} />
            </Form.Item>
          </div>
          <div style={{ marginBottom: 14, color: '#64748B' }}>
            Thuế GTGT {formatMoney(vatAmount)}, tổng thanh toán <strong style={{ color: '#0F172A' }}>{formatMoney(subTotal + vatAmount)}</strong>
          </div>
          <Form.Item name="status" label="Trạng thái" initialValue="Chờ xử lý">
            <Select options={purchaseStatusOptions} />
          </Form.Item>
          <TradeTermsFields withInvoice />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu chứng từ
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export const PurchasingModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');
  if (currentPath === '/finance/purchasing/requests') return <PurchaseRequestsModule />;
  return <PurchasingDocumentsModule />;
};
