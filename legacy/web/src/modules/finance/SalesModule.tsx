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
import { financeDocumentsApi, FinanceDocument } from '../../api/endpoints';

const formatMoney = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;

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
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const isCharts = currentPath === '/finance/sales/charts';
  const isQuotes = currentPath === '/finance/sales/quotes';
  const isContracts = currentPath === '/finance/sales/contracts';
  const isOutputInvoices = currentPath === '/finance/sales/output-invoices';
  const isDebts = currentPath === '/finance/sales/debts';

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
      if (isQuotes) return matchSearch && item.subtype === 'Báo giá';
      if (isContracts) return matchSearch && item.subtype !== 'Báo giá';
      if (isDebts) return matchSearch && item.remainingAmount > 0;
      return matchSearch;
    });
  }, [data, searchText, isQuotes, isContracts, isDebts]);

  const totalSales = data.filter((item) => item.status !== 'Đã hủy').reduce((sum, item) => sum + item.amount, 0);
  const totalCollected = data.filter((item) => item.status !== 'Đã hủy').reduce((sum, item) => sum + item.paidAmount, 0);
  const totalReceivable = Math.max(0, totalSales - totalCollected);

  const bySubtype = useMemo(() => {
    const totals = new Map<string, number>();
    data.filter((item) => item.status !== 'Đã hủy').forEach((item) => totals.set(item.subtype, (totals.get(item.subtype) || 0) + item.amount));
    return Array.from(totals, ([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  }, [data]);

  const handleCreate = async (values: any) => {
    const amount = Number(values.amount) || 0;
    const paidAmount = Number(values.paidAmount) || 0;
    try {
      await financeDocumentsApi.create({
        documentType: 'sale',
        code: values.code,
        subtype: values.subtype || 'Đơn bán hàng',
        partnerName: values.partnerName,
        description: values.description || '',
        amount,
        paidAmount,
        documentDate: values.documentDate || new Date().toISOString().substring(0, 10),
        dueDate: values.dueDate || '',
        status: values.status || (paidAmount >= amount ? 'Đã bàn giao' : 'Đang triển khai'),
        taxCode: values.taxCode || '',
        vatRate: 0,
        vatAmount: 0,
      });
      message.success('Đã lưu chứng từ bán hàng và đồng bộ sang dòng tiền nếu có khoản đã thu.');
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu chứng từ bán hàng.');
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
          <div style={{ fontWeight: 700, color: '#0F172A' }}>{record.partnerName}</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>{record.description || 'Không có diễn giải'}</div>
        </div>
      ),
    },
    { title: 'Phân loại', dataIndex: 'subtype', key: 'subtype', render: (value: string) => <Tag color={value === 'Báo giá' ? 'warning' : 'processing'}>{value}</Tag> },
    { title: 'Ngày', dataIndex: 'documentDate', key: 'documentDate', width: 120 },
    { title: 'Tổng tiền', dataIndex: 'amount', key: 'amount', width: 150, render: (value: number) => <strong>{formatMoney(value)}</strong> },
    { title: 'Đã thu', dataIndex: 'paidAmount', key: 'paidAmount', width: 150, render: (value: number) => <span style={{ color: '#16A34A', fontWeight: 700 }}>{formatMoney(value)}</span> },
    { title: 'Còn phải thu', dataIndex: 'remainingAmount', key: 'remainingAmount', width: 150, render: (value: number) => <strong style={{ color: value > 0 ? '#DC2626' : '#16A34A' }}>{formatMoney(value)}</strong> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 140, render: (value: string) => <Tag color={value === 'Đã hủy' ? 'error' : value === 'Đã bàn giao' ? 'success' : 'processing'}>{value}</Tag> },
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
              placeholder={isDebts ? 'Tìm công nợ khách hàng...' : 'Tìm mã chứng từ, khách hàng, nội dung...'}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              style={{ width: 340, borderRadius: 6 }}
              allowClear
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>Làm mới</Button>
              {!isOutputInvoices && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    form.resetFields();
                    form.setFieldsValue({ subtype: isQuotes ? 'Báo giá' : 'Đơn bán hàng', documentDate: new Date().toISOString().substring(0, 10), paidAmount: 0 });
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

      <Modal title="Thêm chứng từ bán hàng" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={620}>
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã chứng từ" rules={[{ required: true, whitespace: true }]}>
              <Input placeholder="Ví dụ: SO-2026-001" />
            </Form.Item>
            <Form.Item name="subtype" label="Phân loại" rules={[{ required: true }]}>
              <Select options={[{ label: 'Báo giá', value: 'Báo giá' }, { label: 'Đơn bán hàng', value: 'Đơn bán hàng' }, { label: 'Hợp đồng bán', value: 'Hợp đồng bán' }]} />
            </Form.Item>
          </div>
          <Form.Item name="partnerName" label="Khách hàng" rules={[{ required: true, whitespace: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Nội dung hàng hóa / dịch vụ">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="amount" label="Tổng tiền" rules={[{ required: true }]}>
              <Input type="number" min={1} />
            </Form.Item>
            <Form.Item name="paidAmount" label="Đã thu">
              <Input type="number" min={0} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="documentDate" label="Ngày chứng từ" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="dueDate" label="Hạn thanh toán">
              <Input type="date" />
            </Form.Item>
          </div>
          <Form.Item name="status" label="Trạng thái" initialValue="Đang triển khai">
            <Select options={salesStatusOptions} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu chứng từ
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
