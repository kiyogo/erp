import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  SendOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Progress } from '../../custom-ui';
import { crmContactsApi, crmPromotionsApi, financeDocumentsApi, type CrmContact, type CrmPromotion, type FinanceDocument, type SalePromotionPreview } from '../../api/endpoints';

const formatMoney = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;
const currentBusinessDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const salesStatusOptions = [
  { label: 'Báo giá', value: 'Báo giá' },
  { label: 'Đang triển khai', value: 'Đang triển khai' },
  { label: 'Đã bàn giao', value: 'Đã bàn giao' },
  { label: 'Đã hủy', value: 'Đã hủy' },
];

export const SalesModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const [data, setData] = useState<FinanceDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<CrmContact[]>([]);
  const [promotions, setPromotions] = useState<CrmPromotion[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedPromotions, setSelectedPromotions] = useState<string[]>([]);
  const [promotionPreview, setPromotionPreview] = useState<(SalePromotionPreview & { context: string }) | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [linkTarget, setLinkTarget] = useState<FinanceDocument | null>(null);
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [linkForm] = Form.useForm();

  const isCharts = currentPath === '/finance/sales/charts';
  const isQuotes = currentPath === '/finance/sales/quotes';
  const isContracts = currentPath === '/finance/sales/contracts';
  const isOutputInvoices = currentPath === '/finance/sales/output-invoices';

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await financeDocumentsApi.getAll({ documentType: 'sale' });
      setData(response.data.data);
    } catch (error: any) {
      setData([]);
      message.error(error?.response?.data?.message || 'Không tải được dữ liệu bán hàng.');
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    try {
      const response = await crmContactsApi.getAll('customer');
      setCustomers(response.data.data || []);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được danh bạ khách hàng.');
    }
  };

  const loadPromotions = async () => {
    try {
      const response = await crmPromotionsApi.getAll();
      setPromotions(response.data.data || []);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được chương trình khuyến mại.');
    }
  };

  useEffect(() => {
    void loadData();
    void loadCustomers();
    void loadPromotions();
  }, []);

  const filteredData = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return data.filter((item) => {
      const matchSearch =
        !keyword ||
        (item.code || '').toLowerCase().includes(keyword) ||
        (item.partnerName || '').toLowerCase().includes(keyword) ||
        (item.description || '').toLowerCase().includes(keyword);
      if (isQuotes) return matchSearch && item.subtype === 'Báo giá';
      if (isContracts) return matchSearch && item.subtype !== 'Báo giá';
      return matchSearch;
    });
  }, [data, searchText, isQuotes, isContracts]);

  const totalSales = data.filter((item) => item.status !== 'Đã hủy').reduce((sum, item) => sum + item.amount, 0);
  const totalCollected = data.filter((item) => item.status !== 'Đã hủy').reduce((sum, item) => sum + item.paidAmount, 0);
  const totalReceivable = Math.max(0, totalSales - totalCollected);

  const bySubtype = useMemo(() => {
    const totals = new Map<string, number>();
    data.filter((item) => item.status !== 'Đã hủy').forEach((item) => totals.set(item.subtype, (totals.get(item.subtype) || 0) + item.amount));
    return Array.from(totals, ([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  }, [data]);

  const promotionContext = (values: any) => ({
    customerId: String(values.customerId || ''), promotionKeys: Array.isArray(values.promotionKeys) ? values.promotionKeys : [],
    subtype: String(values.subtype || ''), status: String(values.status || ''), amount: Number(values.amount),
    documentDate: String(values.documentDate || ''), vatRate: 0, vatAmount: 0,
  });

  const calculatePromotions = async () => {
    if (previewing) return;
    try {
      const values = await form.validateFields(['subtype', 'amount', 'documentDate', 'status']);
      const context = promotionContext(values);
      if (!context.customerId || !context.promotionKeys.length) {
        message.error('Chọn khách hàng trong danh bạ và chương trình khuyến mại.');
        return;
      }
      setPreviewing(true);
      const response = await financeDocumentsApi.previewSalePromotions(context);
      if (JSON.stringify(promotionContext(form.getFieldsValue())) !== JSON.stringify(context)) {
        message.warning('Thông tin chứng từ đã thay đổi. Vui lòng tính lại khuyến mại.');
        return;
      }
      setPromotionPreview({ ...response.data, context: JSON.stringify(context) });
    } catch (error: any) {
      setPromotionPreview(null);
      message.error(error?.response?.data?.message || error?.message || 'Không thể tính khuyến mại.');
    } finally {
      setPreviewing(false);
    }
  };

  const handleCreate = async (values: any) => {
    if (saving) return;
    const context = promotionContext(values);
    if (context.promotionKeys.length && (!promotionPreview || promotionPreview.context !== JSON.stringify(context))) {
      message.error('Vui lòng tính lại khuyến mại trước khi lưu chứng từ.');
      return;
    }
    const amount = Number(values.amount) || 0;
    const paidAmount = Number(values.paidAmount) || 0;
    setSaving(true);
    try {
      await financeDocumentsApi.create({
        documentType: 'sale',
        code: values.code,
        subtype: values.subtype || 'Đơn bán hàng',
        partnerName: values.partnerName,
        description: values.description || '',
        amount,
        paidAmount,
        documentDate: values.documentDate || currentBusinessDate(),
        dueDate: values.dueDate || '',
        status: values.status || (paidAmount >= amount ? 'Đã bàn giao' : 'Đang triển khai'),
        taxCode: values.taxCode || '',
        vatRate: 0,
        vatAmount: 0,
        ...(values.customerId ? { customerId: values.customerId } : {}),
        ...(context.promotionKeys.length && promotionPreview ? { promotionKeys: context.promotionKeys, promotionFingerprint: promotionPreview.fingerprint, requestId } : {}),
      });
      message.success('Đã lưu chứng từ bán hàng và đồng bộ sang dòng tiền nếu có khoản đã thu.');
      setModalOpen(false);
      setSelectedCustomerId('');
      setSelectedPromotions([]);
      setPromotionPreview(null);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu chứng từ bán hàng.');
    } finally {
      setSaving(false);
    }
  };

  const normalizeName = (name: string) => String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
  const linkOptions = linkTarget ? customers.filter((item) => !item.status.toLocaleLowerCase().includes('tạm') && normalizeName(item.name) === normalizeName(linkTarget.partnerName)) : [];
  const linkCustomer = async (values: { customerId: string }) => {
    if (!linkTarget || saving) return;
    setSaving(true);
    try {
      await financeDocumentsApi.linkSaleCustomer(linkTarget.key, values.customerId);
      setLinkTarget(null);
      linkForm.resetFields();
      await loadData();
      message.success('Đã liên kết chứng từ với khách hàng.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể liên kết khách hàng với chứng từ.');
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
          {record.subtype === 'Báo giá' ? <SendOutlined /> : <FileDoneOutlined />} {code}
        </span>
      ),
    },
    {
      title: 'Khách hàng và nội dung',
      key: 'partnerName',
      render: (_: any, record: FinanceDocument) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A' }}>{record.partnerName}{record.customerCode ? ` · ${record.customerCode}` : ''}</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>{record.description || 'Không có diễn giải'}</div>
        </div>
      ),
    },
    { title: 'Phân loại', dataIndex: 'subtype', key: 'subtype', render: (value: string) => <Tag color={value === 'Báo giá' ? 'warning' : 'processing'}>{value}</Tag> },
    { title: 'Ngày', dataIndex: 'documentDate', key: 'documentDate', width: 120 },
    { title: 'Tổng tiền', dataIndex: 'amount', key: 'amount', width: 150, render: (value: number) => <strong>{formatMoney(value)}</strong> },
    { title: 'Khuyến mại', key: 'promotion', width: 180, render: (_: unknown, record: FinanceDocument) => record.appliedPromotions?.length ? <span>{record.appliedPromotions.map((item) => item.code).join(', ')}<br /><strong style={{ color: '#16A34A' }}>−{formatMoney(record.discountAmount || 0)}</strong></span> : '—' },
    { title: 'Đã thu', dataIndex: 'paidAmount', key: 'paidAmount', width: 150, render: (value: number) => <span style={{ color: '#16A34A', fontWeight: 700 }}>{formatMoney(value)}</span> },
    { title: 'Còn phải thu', dataIndex: 'remainingAmount', key: 'remainingAmount', width: 150, render: (value: number) => <strong style={{ color: value > 0 ? '#DC2626' : '#16A34A' }}>{formatMoney(value)}</strong> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 140, render: (value: string) => <Tag color={value === 'Đã hủy' ? 'error' : value === 'Đã bàn giao' ? 'success' : 'processing'}>{value}</Tag> },
    { title: 'Khách hàng CRM', key: 'customerLink', width: 150, render: (_: unknown, record: FinanceDocument) => record.customerId ? 'Đã liên kết' : record.status !== 'Đã hủy' ? <Button size="small" onClick={() => { linkForm.resetFields(); setLinkTarget(record); }}>Liên kết</Button> : '—' },
  ];

  const renderDynamicChart = () => (
    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>Cơ cấu doanh số theo chứng từ đã lưu</h3>
      {bySubtype.length ? bySubtype.map((item) => {
        const percent = totalSales > 0 ? Math.round((item.amount / totalSales) * 1000) / 10 : 0;
        return (
          <div key={item.name} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4, fontSize: 13 }}>
              <strong>{item.name}</strong>
              <span style={{ color: '#009688', fontWeight: 700 }}>{formatMoney(item.amount)} ({percent}%)</span>
            </div>
            <Progress percent={percent} strokeColor="#009688" showInfo={false} />
          </div>
        );
      }) : <div style={{ color: '#64748B' }}>Chưa có chứng từ bán hàng để phân tích.</div>}
    </div>
  );

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Tổng doanh số đã ghi nhận</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>{formatMoney(totalSales)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Đã thu từ khách hàng</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{formatMoney(totalCollected)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Còn phải thu</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>{formatMoney(totalReceivable)}</div>
        </div>
      </div>

      {isCharts ? renderDynamicChart() : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Tìm mã chứng từ, khách hàng, nội dung..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              style={{ width: 340, borderRadius: 6 }}
              allowClear
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<ReloadOutlined />} loading={loading} onClick={() => { void loadData(); void loadCustomers(); void loadPromotions(); }}>Làm mới</Button>
              {!isOutputInvoices && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    form.resetFields();
                    setSelectedCustomerId('');
                    setSelectedPromotions([]);
                    setPromotionPreview(null);
                    setRequestId(crypto.randomUUID());
                    form.setFieldsValue({ subtype: isQuotes ? 'Báo giá' : 'Đơn bán hàng', documentDate: currentBusinessDate(), paidAmount: 0, promotionKeys: [] });
                    setModalOpen(true);
                  }}
                  style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                >
                  Thêm chứng từ bán
                </Button>
              )}
            </div>
          </div>

          {isOutputInvoices ? (
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16, color: '#64748B' }}>
              <FileTextOutlined /> Hóa đơn đầu ra được quản lý tại mục Hóa đơn để đồng bộ VAT, công nợ và dòng tiền.
            </div>
          ) : (
            <div className="transparent-table-card">
              <KTable dataSource={filteredData} columns={columns} loading={loading} pagination={{ pageSize: 8 }} locale={{ emptyText: 'Chưa có chứng từ bán hàng.' }} />
            </div>
          )}
        </div>
      )}

      <Modal title="Thêm chứng từ bán hàng" open={modalOpen} onCancel={() => { setModalOpen(false); setSelectedCustomerId(''); }} footer={null} width={620}>
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14, maxHeight: '72vh', overflowY: 'auto', paddingRight: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="code" label="Mã chứng từ" rules={[{ required: true, whitespace: true }]}>
              <Input placeholder="Ví dụ: SO-2026-001" />
            </Form.Item>
            <Form.Item name="subtype" label="Phân loại" rules={[{ required: true }]}>
              <Select options={[{ label: 'Báo giá', value: 'Báo giá' }, { label: 'Đơn bán hàng', value: 'Đơn bán hàng' }, { label: 'Hợp đồng bán', value: 'Hợp đồng bán' }]} onChange={() => setPromotionPreview(null)} />
            </Form.Item>
          </div>
          <Form.Item name="customerId" label="Khách hàng trong danh bạ">
            <Select allowClear showSearch options={customers.filter((item) => !item.status.toLocaleLowerCase().includes('tạm')).map((item) => ({ value: item.key, label: `${item.code} · ${item.name}` }))} onChange={(value) => {
              const id = String(value || '');
              setSelectedCustomerId(id);
              setPromotionPreview(null);
              const selected = customers.find((item) => item.key === id);
              if (selected) form.setFieldsValue({ partnerName: selected.name });
            }} />
          </Form.Item>
          <Form.Item name="partnerName" label="Tên khách hàng" rules={[{ required: true, whitespace: true }]}>
            <Input disabled={!!selectedCustomerId} />
          </Form.Item>
          <Form.Item name="description" label="Nội dung hàng hóa / dịch vụ">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="amount" label="Tổng tiền trước khuyến mại" rules={[{ required: true }]}>
              <Input type="number" min={1} onChange={() => setPromotionPreview(null)} />
            </Form.Item>
            <Form.Item name="paidAmount" label="Đã thu">
              <Input type="number" min={0} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="documentDate" label="Ngày chứng từ" rules={[{ required: true }]}>
              <Input type="date" onChange={() => setPromotionPreview(null)} />
            </Form.Item>
            <Form.Item name="dueDate" label="Hạn thanh toán">
              <Input type="date" />
            </Form.Item>
          </div>
          <Form.Item name="status" label="Trạng thái" initialValue="Đang triển khai">
            <Select options={salesStatusOptions} onChange={() => setPromotionPreview(null)} />
          </Form.Item>
          <Form.Item name="promotionKeys" label="Chương trình khuyến mại">
            <Select mode="multiple" placeholder="Chọn chương trình" options={promotions.filter((item) => item.enabled && item.promotionType === 'Chiết khấu').map((item) => ({ value: item.key, label: `${item.code} · ${item.name}` }))} onChange={(value) => { setSelectedPromotions(Array.isArray(value) ? value : []); setPromotionPreview(null); }} />
          </Form.Item>
          {selectedPromotions.length > 0 && <div style={{ marginBottom: 14 }}>
            <Button onClick={() => void calculatePromotions()} loading={previewing}>Tính khuyến mại</Button>
            {promotionPreview && <div style={{ marginTop: 14, border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              {promotionPreview.applications.map((item) => <div key={item.key}>{item.code} · {item.name}: −{formatMoney(item.discount)}</div>)}
              <div style={{ marginTop: 8 }}><strong>Tổng chiết khấu:</strong> {formatMoney(promotionPreview.discountAmount)}</div>
              <div><strong>Tổng tiền sau khuyến mại:</strong> {formatMoney(promotionPreview.netAmount)}</div>
            </div>}
          </div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginTop: 14 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu chứng từ
            </Button>
          </div>
        </Form>
      </Modal>
      <Modal title="Liên kết khách hàng với chứng từ" open={!!linkTarget} onCancel={() => setLinkTarget(null)} footer={null} width={560}>
        <Form form={linkForm} layout="vertical" onFinish={linkCustomer} style={{ marginTop: 14 }}>
          <div style={{ marginBottom: 14 }}>{linkTarget?.code} · {linkTarget?.partnerName}</div>
          <Form.Item name="customerId" label="Khách hàng trong danh bạ" rules={[{ required: true }]}>
            <Select showSearch options={linkOptions.map((item) => ({ value: item.key, label: `${item.code} · ${item.name}` }))} />
          </Form.Item>
          {!linkOptions.length && <div style={{ color: '#64748B', marginBottom: 14 }}>Không có khách hàng hoạt động có tên khớp chứng từ.</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14 }}>
            <Button onClick={() => setLinkTarget(null)}>Hủy</Button>
            <Button type="primary" htmlType="submit" disabled={!linkOptions.length} loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu liên kết</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
