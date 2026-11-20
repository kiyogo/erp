import React, { useEffect, useMemo, useState } from 'react';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Form, Input, Modal, Select, Tag, message } from '../../custom-ui';
import { financeDocumentsApi, type FinanceDocument } from '../../api/endpoints';
import { adjustableOriginals, adjustmentSubtype, type AdjustmentKind, type AdjustmentSide } from './tradeAdjustments';
import { termsFromValues, vatOf } from './tradeTerms';

const formatMoney = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;
const currentBusinessDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const LABELS: Record<AdjustmentSide, Record<AdjustmentKind, { title: string; refundLabel: string; reasonHint: string }>> = {
  sale: {
    return: { title: 'Trả lại hàng bán', refundLabel: 'Đã hoàn tiền cho khách', reasonHint: 'Ví dụ: hàng sai quy cách, hàng lỗi' },
    discount: { title: 'Giảm giá hàng bán', refundLabel: 'Đã hoàn tiền cho khách', reasonHint: 'Ví dụ: chiết khấu thương mại sau bán, giao chậm' },
  },
  purchase: {
    return: { title: 'Trả lại hàng mua', refundLabel: 'Nhà cung cấp đã hoàn tiền', reasonHint: 'Ví dụ: hàng sai quy cách, hàng lỗi' },
    discount: { title: 'Giảm giá hàng mua', refundLabel: 'Nhà cung cấp đã hoàn tiền', reasonHint: 'Ví dụ: chiết khấu thương mại, hàng kém chất lượng' },
  },
};

/** Hàng bán bị trả lại, giảm giá hàng bán, trả lại hàng mua, giảm giá hàng mua: chứng từ điều chỉnh giảm trỏ về chứng từ gốc. */
export const TradeAdjustmentsModule: React.FC<{ side: AdjustmentSide; kind: AdjustmentKind }> = ({ side, kind }) => {
  const subtype = adjustmentSubtype(side, kind);
  const label = LABELS[side][kind];
  const [documents, setDocuments] = useState<FinanceDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [originalKey, setOriginalKey] = useState('');
  const [net, setNet] = useState(0);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      setDocuments((await financeDocumentsApi.getAll()).data.data);
    } catch (error: any) {
      setDocuments([]);
      message.error(error?.response?.data?.message || `Không tải được dữ liệu ${label.title.toLocaleLowerCase('vi-VN')}.`);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void loadData(); }, []);

  const byKey = useMemo(() => new Map(documents.map((document) => [document.key, document])), [documents]);
  const originals = useMemo(() => adjustableOriginals(side, documents), [side, documents]);
  const original = originals.find((item) => item.document.key === originalKey);
  const vatRate = original?.document.vatRate || 0;
  const vatAmount = vatOf(net, vatRate);
  const total = net + vatAmount;

  const rows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return documents.filter((document) => document.subtype === subtype && (!keyword
      || document.code.toLowerCase().includes(keyword)
      || document.partnerName.toLowerCase().includes(keyword)
      || (byKey.get(document.adjustsDocumentId || '')?.code || '').toLowerCase().includes(keyword)));
  }, [documents, subtype, searchText, byKey]);
  const totalAdjusted = documents.filter((document) => document.subtype === subtype && document.status !== 'Đã hủy').reduce((sum, document) => sum + document.amount, 0);

  const openCreate = () => {
    form.resetFields();
    setOriginalKey('');
    setNet(0);
    form.setFieldsValue({ documentDate: currentBusinessDate(), paidAmount: 0 });
    setModalOpen(true);
  };

  const handleCreate = async (values: any) => {
    if (saving || !original) return;
    const netAmount = Number(values.net) || 0;
    const vat = vatOf(netAmount, original.document.vatRate);
    setSaving(true);
    try {
      await financeDocumentsApi.create({
        documentType: original.document.documentType,
        subtype,
        partnerName: original.document.partnerName,
        description: values.description || '',
        amount: netAmount + vat,
        paidAmount: Number(values.paidAmount) || 0,
        documentDate: values.documentDate,
        dueDate: '',
        status: 'Đã ghi nhận',
        taxCode: original.document.taxCode,
        vatRate: original.document.vatRate,
        vatAmount: vat,
        adjustsDocumentId: original.document.key,
        terms: termsFromValues(values),
      });
      message.success(`Đã lưu ${label.title.toLocaleLowerCase('vi-VN')}, công nợ của chứng từ gốc đã giảm tương ứng.`);
      setModalOpen(false);
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || `Không thể lưu ${label.title.toLocaleLowerCase('vi-VN')}.`);
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: 'Mã chứng từ', dataIndex: 'code', key: 'code', render: (code: string) => <span style={{ color: '#009688' }}>{code}</span> },
    {
      title: 'Chứng từ gốc và đối tác',
      key: 'original',
      render: (_: unknown, record: FinanceDocument) => (
        <div>
          <div>{record.partnerName}</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>Gốc: {byKey.get(record.adjustsDocumentId || '')?.code || 'Không còn dữ liệu'}</div>
          {record.terms?.reason && <div style={{ fontSize: 12, color: '#64748B' }}>Lý do: {record.terms.reason}</div>}
          {record.terms?.invoiceNo && <div style={{ fontSize: 12, color: '#64748B' }}>Hóa đơn điều chỉnh {record.terms.invoiceNo}{record.terms.invoiceSymbol ? `, ký hiệu ${record.terms.invoiceSymbol}` : ''}</div>}
          {(record.termWarnings || []).map((warning) => <div key={warning} style={{ fontSize: 12, color: '#D97706' }}>{warning}</div>)}
        </div>
      ),
    },
    { title: 'Ngày', dataIndex: 'documentDate', key: 'documentDate', width: 120 },
    { title: 'Thuế GTGT', key: 'vat', width: 140, render: (_: unknown, record: FinanceDocument) => `${formatMoney(record.vatAmount)} (${record.vatRate}%)` },
    { title: 'Tổng điều chỉnh', dataIndex: 'amount', key: 'amount', width: 150, render: (value: number) => <strong>{formatMoney(value)}</strong> },
    { title: label.refundLabel, dataIndex: 'paidAmount', key: 'paidAmount', width: 170, render: (value: number) => formatMoney(value) },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 120, render: (value: string) => <Tag color={value === 'Đã hủy' ? 'error' : 'success'}>{value}</Tag> },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Tổng giá trị {label.title.toLocaleLowerCase('vi-VN')}</div>
          <div style={{ fontSize: 22, color: '#0F172A', marginTop: 4 }}>{formatMoney(totalAdjusted)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <Input prefix={<SearchOutlined style={{ color: '#bbb' }} />} placeholder="Tìm mã chứng từ, đối tác, chứng từ gốc..." value={searchText} onChange={(event) => setSearchText(event.target.value)} style={{ width: 340, borderRadius: 6 }} allowClear />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>Làm mới</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Thêm {label.title.toLocaleLowerCase('vi-VN')}</Button>
          </div>
        </div>
        <div className="transparent-table-card">
          <KTable dataSource={rows} columns={columns} loading={loading} pagination={{ pageSize: 8 }} locale={{ emptyText: `Chưa có chứng từ ${label.title.toLocaleLowerCase('vi-VN')}.` }} />
        </div>
      </div>

      <Modal title={`Thêm ${label.title.toLocaleLowerCase('vi-VN')}`} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={640}>
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14, maxHeight: '72vh', overflowY: 'auto', paddingRight: 8 }}>
          <Form.Item name="originalKey" label="Chứng từ gốc" rules={[{ required: true, message: 'Chọn chứng từ gốc' }]}>
            <Select
              showSearch
              placeholder="Chọn chứng từ đã ghi nhận"
              options={originals.map((item) => ({ value: item.document.key, label: `${item.document.code} · ${item.document.partnerName} · còn điều chỉnh được ${formatMoney(item.room)}` }))}
              onChange={(value: string) => setOriginalKey(value)}
            />
          </Form.Item>
          {original && <div style={{ marginBottom: 14, color: '#64748B' }}>
            Đối tác {original.document.partnerName}, thuế suất GTGT của chứng từ gốc {original.document.vatRate}%, còn điều chỉnh được {formatMoney(original.room)}.
          </div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="documentDate" label="Ngày điều chỉnh" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="net" label="Tiền hàng điều chỉnh chưa thuế" rules={[{ required: true }]}>
              <Input type="number" min={1} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setNet(Number(event.target.value) || 0)} />
            </Form.Item>
          </div>
          <div style={{ marginBottom: 14, color: '#64748B' }}>
            Thuế GTGT {formatMoney(vatAmount)}, tổng điều chỉnh <strong style={{ color: '#0F172A' }}>{formatMoney(total)}</strong>
          </div>
          <Form.Item name="terms_reason" label="Lý do" rules={[{ required: true, whitespace: true, message: 'Nhập lý do' }]}>
            <Input placeholder={label.reasonHint} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="terms_invoiceNo" label="Số hóa đơn điều chỉnh"><Input /></Form.Item>
            <Form.Item name="terms_invoiceSymbol" label="Ký hiệu hóa đơn điều chỉnh"><Input /></Form.Item>
          </div>
          <Form.Item name="paidAmount" label={label.refundLabel}>
            <Input type="number" min={0} />
          </Form.Item>
          <Form.Item name="description" label="Ghi chú">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} disabled={!original} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu chứng từ</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
