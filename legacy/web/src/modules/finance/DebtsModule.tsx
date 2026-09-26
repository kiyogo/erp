import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  DownloadOutlined,
  SendOutlined,
  FileDoneOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag } from '../../custom-ui';
import { financeDocumentsApi, FinanceDebt } from '../../api/endpoints';

const formatMoney = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;
const todayAtMidnight = () => new Date(new Date().toISOString().substring(0, 10)).getTime();

const overdueDays = (dueDate: string) => {
  const due = Date.parse(`${dueDate}T00:00:00.000Z`);
  if (Number.isNaN(due)) return 0;
  return Math.max(0, Math.floor((todayAtMidnight() - due) / 86_400_000));
};

export const DebtsModule: React.FC<{ defaultType?: 'Phải thu' | 'Phải trả' | 'all' }> = ({
  defaultType = 'all',
}) => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const isAging = currentPath === '/finance/debts/aging';
  const isReminders = currentPath === '/finance/debts/reminders';
  const isReconciliation = currentPath === '/finance/debts/reconciliation';

  let initialType = defaultType;
  if (currentPath === '/finance/debts/receivable') initialType = 'Phải thu';
  else if (currentPath === '/finance/debts/payable') initialType = 'Phải trả';

  const [data, setData] = useState<FinanceDebt[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'Phải thu' | 'Phải trả'>(initialType);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await financeDocumentsApi.getDebts();
      setData(response.data.data);
    } catch (error: any) {
      setData([]);
      message.error(error?.response?.data?.message || 'Không tải được công nợ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    setTypeFilter(initialType);
  }, [initialType]);

  const totalReceivable = data.filter((item) => item.type === 'Phải thu').reduce((sum, item) => sum + item.remainingAmount, 0);
  const totalPayable = data.filter((item) => item.type === 'Phải trả').reduce((sum, item) => sum + item.remainingAmount, 0);

  const filteredData = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return data.filter((item) => {
      const matchSearch = !keyword || (item.partnerName || '').toLowerCase().includes(keyword);
      const matchType = typeFilter === 'all' || item.type === typeFilter;
      if (isReminders) return matchSearch && matchType && item.type === 'Phải thu';
      return matchSearch && matchType;
    });
  }, [data, searchText, typeFilter, isReminders]);

  const aging = useMemo(() => {
    const rows = filteredData.filter((item) => item.type === 'Phải thu');
    return {
      current: rows.filter((item) => overdueDays(item.dueDate) <= 30).reduce((sum, item) => sum + item.remainingAmount, 0),
      d31_60: rows.filter((item) => overdueDays(item.dueDate) > 30 && overdueDays(item.dueDate) <= 60).reduce((sum, item) => sum + item.remainingAmount, 0),
      d61_90: rows.filter((item) => overdueDays(item.dueDate) > 60 && overdueDays(item.dueDate) <= 90).reduce((sum, item) => sum + item.remainingAmount, 0),
      over90: rows.filter((item) => overdueDays(item.dueDate) > 90).reduce((sum, item) => sum + item.remainingAmount, 0),
    };
  }, [filteredData]);

  const handleCreate = async (values: any) => {
    const totalAmount = Number(values.totalAmount) || 0;
    const paidAmount = Number(values.paidAmount) || 0;
    const type = values.type as 'Phải thu' | 'Phải trả';
    try {
      await financeDocumentsApi.create({
        documentType: type === 'Phải thu' ? 'sale' : 'purchase',
        code: values.code,
        subtype: type === 'Phải thu' ? 'Công nợ bán hàng' : 'Công nợ mua hàng',
        partnerName: values.partnerName,
        description: values.description || '',
        amount: totalAmount,
        paidAmount,
        documentDate: values.documentDate || new Date().toISOString().substring(0, 10),
        dueDate: values.dueDate,
        status: 'Chưa thanh toán',
        taxCode: '',
        vatRate: 0,
        vatAmount: 0,
      });
      message.success('Đã ghi nhận công nợ bằng chứng từ tài chính và đồng bộ vào sổ liên quan.');
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể ghi nhận công nợ.');
    }
  };

  const columns = [
    {
      title: 'Đối tác',
      dataIndex: 'partnerName',
      key: 'partnerName',
      render: (name: string) => <strong style={{ color: '#1E293B' }}>{name}</strong>,
    },
    {
      title: 'Phân loại',
      dataIndex: 'type',
      key: 'type',
      width: 140,
      render: (type: string) => <Tag color={type === 'Phải thu' ? 'success' : 'error'}>{type === 'Phải thu' ? 'Phải thu' : 'Phải trả'}</Tag>,
    },
    { title: 'Tổng phát sinh', dataIndex: 'totalAmount', key: 'totalAmount', render: (value: number) => formatMoney(value) },
    { title: 'Đã thanh toán', dataIndex: 'paidAmount', key: 'paidAmount', render: (value: number) => <span style={{ color: '#16A34A', fontWeight: 700 }}>{formatMoney(value)}</span> },
    { title: 'Còn nợ', dataIndex: 'remainingAmount', key: 'remainingAmount', render: (value: number) => <strong style={{ color: '#DC2626' }}>{formatMoney(value)}</strong> },
    { title: 'Hạn thanh toán', dataIndex: 'dueDate', key: 'dueDate', width: 130 },
    { title: 'Tuổi nợ', key: 'aging', width: 110, render: (_: any, record: FinanceDebt) => `${overdueDays(record.dueDate)} ngày` },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 110, render: (status: string) => <Tag color={status === 'Đúng hạn' ? 'success' : 'error'}>{status}</Tag> },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Tổng phải thu</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{formatMoney(totalReceivable)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Tổng phải trả</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>{formatMoney(totalPayable)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Công nợ ròng</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>{formatMoney(totalReceivable - totalPayable)}</div>
        </div>
      </div>

      {isAging && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 14 }}>
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: 14, borderRadius: 8 }}><div style={{ fontSize: 12, color: '#166534' }}>0 - 30 ngày</div><strong>{formatMoney(aging.current)}</strong></div>
          <div style={{ background: '#FEFCE8', border: '1px solid #FEF08A', padding: 14, borderRadius: 8 }}><div style={{ fontSize: 12, color: '#854D0E' }}>31 - 60 ngày</div><strong>{formatMoney(aging.d31_60)}</strong></div>
          <div style={{ background: '#FFF7ED', border: '1px solid #FFEDD5', padding: 14, borderRadius: 8 }}><div style={{ fontSize: 12, color: '#9A3412' }}>61 - 90 ngày</div><strong>{formatMoney(aging.d61_90)}</strong></div>
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: 14, borderRadius: 8 }}><div style={{ fontSize: 12, color: '#991B1B' }}>Trên 90 ngày</div><strong>{formatMoney(aging.over90)}</strong></div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo tên đối tác..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            style={{ width: 260, borderRadius: 6 }}
            allowClear
          />
          <Select
            value={typeFilter}
            onChange={(value) => setTypeFilter(value)}
            style={{ width: 180 }}
            options={[
              { label: 'Tất cả công nợ', value: 'all' },
              { label: 'Phải thu', value: 'Phải thu' },
              { label: 'Phải trả', value: 'Phải trả' },
            ]}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>Làm mới</Button>
          {isReminders && (
            <Button icon={<SendOutlined />} onClick={() => message.warning('Chưa cấu hình dịch vụ Email/SMS nên chưa thể gửi nhắc nợ thật.')}>
              Nhắc nợ
            </Button>
          )}
          {isReconciliation && (
            <Button icon={<DownloadOutlined />} onClick={() => message.warning('Chưa có dịch vụ xuất PDF/ký số biên bản đối chiếu thật.')}>
              Xuất biên bản
            </Button>
          )}
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({ type: initialType === 'Phải trả' ? 'Phải trả' : 'Phải thu', documentDate: new Date().toISOString().substring(0, 10), paidAmount: 0 });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Ghi nhận công nợ
          </Button>
        </div>
      </div>

      {isReconciliation && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, color: '#64748B', marginBottom: 12 }}>
          <FileDoneOutlined /> Biên bản đối chiếu đang hiển thị số dư công nợ thật theo từng đối tác; xuất/ký số cần tích hợp dịch vụ tài liệu.
        </div>
      )}

      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} loading={loading} pagination={{ pageSize: 10 }} locale={{ emptyText: 'Chưa có công nợ phát sinh.' }} />
      </div>

      <Modal title="Ghi nhận công nợ mới" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={580}>
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã chứng từ" rules={[{ required: true, whitespace: true }]}>
              <Input placeholder="Ví dụ: CN-2026-001" />
            </Form.Item>
            <Form.Item name="type" label="Loại công nợ" rules={[{ required: true }]}>
              <Select options={[{ label: 'Phải thu khách hàng', value: 'Phải thu' }, { label: 'Phải trả nhà cung cấp', value: 'Phải trả' }]} />
            </Form.Item>
          </div>
          <Form.Item name="partnerName" label="Tên đối tác" rules={[{ required: true, whitespace: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Diễn giải">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="totalAmount" label="Tổng phát sinh" rules={[{ required: true }]}>
              <Input type="number" min={1} />
            </Form.Item>
            <Form.Item name="paidAmount" label="Đã thanh toán">
              <Input type="number" min={0} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="documentDate" label="Ngày chứng từ" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="dueDate" label="Hạn thanh toán" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu công nợ
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
