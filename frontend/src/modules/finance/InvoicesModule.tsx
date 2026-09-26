import React, { useEffect, useMemo, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  FileTextOutlined,
  EyeOutlined,
  DownloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer } from '../../custom-ui';
import { financeDocumentsApi, FinanceDocument } from '../../api/endpoints';

const formatMoney = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;
const outputSubtype = 'Đầu ra (Bán)';
const inputSubtype = 'Đầu vào (Mua)';

export const InvoicesModule: React.FC = () => {
  const [data, setData] = useState<FinanceDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | typeof outputSubtype | typeof inputSubtype>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<FinanceDocument | null>(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await financeDocumentsApi.getAll({ documentType: 'invoice' });
      setData(response.data.data);
    } catch (error: any) {
      setData([]);
      message.error(error?.response?.data?.message || 'Không tải được hóa đơn.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const validData = data.filter((item) => item.status !== 'Đã hủy');
  const totalIn = validData.filter((item) => item.subtype === inputSubtype).reduce((sum, item) => sum + item.amount, 0);
  const totalOut = validData.filter((item) => item.subtype === outputSubtype).reduce((sum, item) => sum + item.amount, 0);
  const vatOut = validData.filter((item) => item.subtype === outputSubtype).reduce((sum, item) => sum + item.vatAmount, 0);
  const vatIn = validData.filter((item) => item.subtype === inputSubtype).reduce((sum, item) => sum + item.vatAmount, 0);
  const netVatPayable = vatOut - vatIn;

  const filteredData = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return data.filter((item) => {
      const matchSearch =
        !keyword ||
        item.code.toLowerCase().includes(keyword) ||
        item.partnerName.toLowerCase().includes(keyword) ||
        item.taxCode.toLowerCase().includes(keyword);
      const matchType = typeFilter === 'all' || item.subtype === typeFilter;
      return matchSearch && matchType;
    });
  }, [data, searchText, typeFilter]);

  const handleCreate = async (values: any) => {
    const subTotal = Number(values.subTotal) || 0;
    const vatRate = Number(values.vatRate) || 0;
    const vatAmount = Math.round((subTotal * vatRate) / 100);
    const amount = subTotal + vatAmount;
    const paidAmount = Number(values.paidAmount) || 0;
    try {
      await financeDocumentsApi.create({
        documentType: 'invoice',
        code: values.code,
        subtype: values.subtype,
        partnerName: values.partnerName,
        description: values.description || '',
        amount,
        paidAmount,
        documentDate: values.documentDate || new Date().toISOString().substring(0, 10),
        dueDate: values.dueDate || '',
        status: values.status || (paidAmount >= amount ? 'Đã thanh toán' : 'Đã phát hành'),
        taxCode: values.taxCode || '',
        vatRate,
        vatAmount,
      });
      message.success('Đã lưu hóa đơn và đồng bộ công nợ, dòng tiền theo số tiền đã thanh toán.');
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu hóa đơn.');
    }
  };

  const columns = [
    {
      title: 'Số hóa đơn',
      dataIndex: 'code',
      key: 'code',
      render: (code: string, record: FinanceDocument) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileTextOutlined /> {code}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>{record.documentDate}</div>
        </div>
      ),
    },
    { title: 'Loại', dataIndex: 'subtype', key: 'subtype', width: 135, render: (value: string) => <Tag color={value.includes('Bán') ? 'blue' : 'purple'}>{value}</Tag> },
    {
      title: 'Đối tác và MST',
      key: 'partnerName',
      render: (_: any, record: FinanceDocument) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A' }}>{record.partnerName}</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>MST: {record.taxCode || 'Chưa nhập'}</div>
        </div>
      ),
    },
    { title: 'Tổng trước thuế', key: 'subTotal', width: 150, render: (_: any, record: FinanceDocument) => formatMoney(Math.max(0, record.amount - record.vatAmount)) },
    { title: 'VAT', dataIndex: 'vatAmount', key: 'vatAmount', width: 130, render: (value: number, record: FinanceDocument) => <span style={{ color: '#D97706', fontWeight: 700 }}>{formatMoney(value)} ({record.vatRate}%)</span> },
    { title: 'Tổng thanh toán', dataIndex: 'amount', key: 'amount', width: 160, render: (value: number) => <strong>{formatMoney(value)}</strong> },
    { title: 'Còn công nợ', dataIndex: 'remainingAmount', key: 'remainingAmount', width: 140, render: (value: number) => <strong style={{ color: value > 0 ? '#DC2626' : '#16A34A' }}>{formatMoney(value)}</strong> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 140, render: (value: string) => <Tag color={value === 'Đã thanh toán' ? 'success' : value === 'Đã hủy' ? 'error' : 'processing'}>{value}</Tag> },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 105,
      render: (_: any, record: FinanceDocument) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => { setSelectedInvoice(record); setDrawerOpen(true); }}>
          Xem
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Tổng hóa đơn đầu ra</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>{formatMoney(totalOut)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Tổng hóa đơn đầu vào</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>{formatMoney(totalIn)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>VAT phải nộp ròng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: netVatPayable > 0 ? '#DC2626' : '#16A34A', marginTop: 4 }}>{formatMoney(netVatPayable)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả hóa đơn' },
            { key: outputSubtype, label: 'Đầu ra', icon: <UploadOutlined style={{ color: '#3B82F6' }} /> },
            { key: inputSubtype, label: 'Đầu vào', icon: <DownloadOutlined style={{ color: '#10B981' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              icon={tab.icon}
              onClick={() => setTypeFilter(tab.key as any)}
              style={{
                backgroundColor: typeFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: typeFilter === tab.key ? '#009688' : '#CBD5E1',
                color: typeFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: typeFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm số HĐ, đối tác, MST..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            style={{ width: 280 }}
            allowClear
          />
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>Làm mới</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({ subtype: outputSubtype, documentDate: new Date().toISOString().substring(0, 10), vatRate: 10, paidAmount: 0, status: 'Đã phát hành' });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm hóa đơn
          </Button>
        </div>
      </div>

      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} loading={loading} pagination={{ pageSize: 8 }} locale={{ emptyText: 'Chưa có hóa đơn tài chính.' }} />
      </div>

      <Modal title="Thêm hóa đơn tài chính" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={660}>
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Số hóa đơn" rules={[{ required: true, whitespace: true }]}>
              <Input placeholder="Nhập số hóa đơn thật" />
            </Form.Item>
            <Form.Item name="subtype" label="Loại hóa đơn" rules={[{ required: true }]}>
              <Select options={[{ label: 'Hóa đơn đầu ra', value: outputSubtype }, { label: 'Hóa đơn đầu vào', value: inputSubtype }]} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="partnerName" label="Đối tác" rules={[{ required: true, whitespace: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="taxCode" label="Mã số thuế">
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="description" label="Nội dung hóa đơn">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="subTotal" label="Tiền trước thuế" rules={[{ required: true }]}>
              <Input type="number" min={1} />
            </Form.Item>
            <Form.Item name="vatRate" label="VAT (%)" rules={[{ required: true }]}>
              <Select options={[{ label: '10%', value: 10 }, { label: '8%', value: 8 }, { label: '5%', value: 5 }, { label: '0%', value: 0 }]} />
            </Form.Item>
            <Form.Item name="paidAmount" label="Đã thanh toán">
              <Input type="number" min={0} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="documentDate" label="Ngày hóa đơn" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="dueDate" label="Hạn thanh toán">
              <Input type="date" />
            </Form.Item>
          </div>
          <Form.Item name="status" label="Trạng thái" initialValue="Đã phát hành">
            <Select options={[{ label: 'Hóa đơn nháp', value: 'Hóa đơn nháp' }, { label: 'Đã phát hành', value: 'Đã phát hành' }, { label: 'Đã thanh toán', value: 'Đã thanh toán' }, { label: 'Đã hủy', value: 'Đã hủy' }]} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu hóa đơn
            </Button>
          </div>
        </Form>
      </Modal>

      <Drawer title="Chi tiết hóa đơn" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={560}>
        {selectedInvoice && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedInvoice.code}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{selectedInvoice.partnerName}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>Ngày: {selectedInvoice.documentDate} · MST: {selectedInvoice.taxCode || 'Chưa nhập'}</div>
            </div>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span>Tiền trước thuế</span><strong>{formatMoney(selectedInvoice.amount - selectedInvoice.vatAmount)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span>VAT ({selectedInvoice.vatRate}%)</span><strong style={{ color: '#D97706' }}>{formatMoney(selectedInvoice.vatAmount)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: 8 }}><span>Tổng thanh toán</span><strong style={{ color: '#009688' }}>{formatMoney(selectedInvoice.amount)}</strong></div>
            </div>
            <div style={{ color: '#64748B', fontSize: 13 }}>
              Không hiển thị mã cơ quan thuế hoặc chữ ký số giả. Khi có tích hợp thật, trạng thái phát hành/ký số cần lấy từ dịch vụ hóa đơn điện tử được cấp quyền.
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
