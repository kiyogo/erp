import React, { useEffect, useState } from 'react';
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Alert, Button, Form, Input, Modal, Select, Tag, message } from '../../custom-ui';
import { contractorTaxApi, type ContractorTaxRecord, type ContractorTaxResult } from '../../api/endpoints';
import { exportRowsToXlsx } from '../../utils/fileExporter';

const money = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} ₫`;
const percent = (value: number) => `${(value * 100).toLocaleString('vi-VN')}%`;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Thuế nhà thầu nước ngoài do doanh nghiệp khấu trừ, nộp thay theo tỷ lệ % trên doanh thu (mẫu 01/NTNN). */
export const ContractorTaxModule: React.FC = () => {
  const [data, setData] = useState<ContractorTaxRecord[]>([]);
  const [types, setTypes] = useState<Record<string, { label: string; vat: number; cit: number }>>({});
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ContractorTaxResult | null>(null);
  const [paying, setPaying] = useState<ContractorTaxRecord | null>(null);
  const [paidReference, setPaidReference] = useState('');
  const [paidDate, setPaidDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    try {
      const { data: response } = await contractorTaxApi.list();
      setData(response.data);
      setTypes(response.businessTypes);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được sổ thuế nhà thầu.');
    }
  };
  useEffect(() => { void load(); }, []);

  const inputOf = (values: any) => ({
    contractorName: values.contractorName, country: values.country, contractNo: values.contractNo, taxIdentification: values.taxIdentification || '',
    businessType: values.businessType, amount: Number(values.amount), priceIncludesTax: values.priceIncludesTax === 'yes', vatApplicable: values.vatApplicable !== 'no',
    paymentDate: values.paymentDate, filingMode: values.filingMode,
  });

  const runPreview = async () => {
    try {
      setPreview((await contractorTaxApi.preview(inputOf(form.getFieldsValue()))).data.result);
    } catch (error: any) {
      setPreview(null);
      message.error(error?.response?.data?.message || 'Không tính được thuế.');
    }
  };

  const save = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const { data: response } = await contractorTaxApi.create(inputOf(values));
      message.success(`Đã lưu lần thanh toán ${response.record.key}; hạn khai ${response.record.deadline}.`);
      setOpen(false);
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không lưu được.');
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async () => {
    if (!paying || saving) return;
    setSaving(true);
    try {
      await contractorTaxApi.markPaid(paying.key, { paidDate, reference: paidReference });
      message.success('Đã ghi nhận nộp thuế nhà thầu.');
      setPaying(null);
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không ghi nhận được.');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: 'Nhà thầu', key: 'contractor', render: (_: unknown, row: ContractorTaxRecord) => <div><div>{row.contractorName}</div><div style={{ fontSize: 12, color: '#64748B' }}>{row.country} · {row.contractNo}</div></div> },
    { title: 'Ngành', key: 'type', render: (_: unknown, row: ContractorTaxRecord) => <div><div>{row.businessLabel}</div><div style={{ fontSize: 12, color: '#64748B' }}>GTGT {percent(row.vatRate)} · TNDN {percent(row.citRate)}</div></div> },
    { title: 'Ngày thanh toán', dataIndex: 'paymentDate', key: 'paymentDate' },
    { title: 'Doanh thu tính thuế', dataIndex: 'vatRevenue', key: 'vatRevenue', render: money },
    { title: 'Thuế GTGT', dataIndex: 'vat', key: 'vat', render: money },
    { title: 'Thuế TNDN', dataIndex: 'cit', key: 'cit', render: money },
    { title: 'Thực trả nhà thầu', dataIndex: 'netPayment', key: 'netPayment', render: money },
    { title: 'Hạn khai', key: 'deadline', render: (_: unknown, row: ContractorTaxRecord) => <span style={{ color: row.status !== 'Đã nộp thuế' && row.deadline < today() ? '#DC2626' : undefined }}>{row.deadline}</span> },
    { title: 'Trạng thái', key: 'status', render: (_: unknown, row: ContractorTaxRecord) => row.status === 'Đã nộp thuế'
      ? <Tag color={row.paidLate ? 'warning' : 'success'}>{row.paidLate ? 'Nộp trễ hạn' : 'Đã nộp'} · {row.paidReference}</Tag>
      : <Button onClick={() => { setPaidReference(''); setPaidDate(today()); setPaying(row); }}>Ghi nhận đã nộp</Button> },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Alert type="warning" showIcon message="Tỷ lệ % theo Thông tư 103/2014; phần thuế GTGT nay theo Thông tư 69/2025 và thuế TNDN theo Thông tư 20/2026, cần đối chiếu bảng tỷ lệ trước khi nộp. Chỉ hỗ trợ bên Việt Nam khấu trừ, nộp thay theo tỷ lệ % trên doanh thu." />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} disabled={!data.length} onClick={() => {
            const count = exportRowsToXlsx('So_thue_nha_thau', [
              { title: 'Mã', dataIndex: 'key' }, { title: 'Nhà thầu', dataIndex: 'contractorName' }, { title: 'Quốc gia', dataIndex: 'country' }, { title: 'Số hợp đồng', dataIndex: 'contractNo' },
              { title: 'Ngành', dataIndex: 'businessLabel' }, { title: 'Ngày thanh toán', dataIndex: 'paymentDate' }, { title: 'Doanh thu tính thuế GTGT', dataIndex: 'vatRevenue' },
              { title: 'Thuế GTGT', dataIndex: 'vat' }, { title: 'Doanh thu tính thuế TNDN', dataIndex: 'citRevenue' }, { title: 'Thuế TNDN', dataIndex: 'cit' },
              { title: 'Thực trả', dataIndex: 'netPayment' }, { title: 'Hạn khai', dataIndex: 'deadline' }, { title: 'Trạng thái', dataIndex: 'status' }, { title: 'Chứng từ nộp', dataIndex: 'paidReference' },
            ], data);
            message.success(`Đã xuất ${count} dòng.`);
          }}>Xuất sổ</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ businessType: 'services', priceIncludesTax: 'yes', vatApplicable: 'yes', paymentDate: today(), filingMode: 'occurrence' }); setPreview(null); setOpen(true); }} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Thêm lần thanh toán</Button>
        </div>
      </div>
      <div className="transparent-table-card">
        <KTable dataSource={data} columns={columns} rowKey="key" pagination={{ pageSize: 10 }} />
      </div>

      <Modal title="Thanh toán cho nhà thầu nước ngoài" open={open} onCancel={() => setOpen(false)} footer={null} width={680}>
        <Form form={form} layout="vertical" onFinish={save} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <Form.Item name="contractorName" label="Tên nhà thầu nước ngoài" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="country" label="Quốc gia" rules={[{ required: true }]}><Input /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="contractNo" label="Số hợp đồng" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="taxIdentification" label="Mã số thuế nộp thay"><Input /></Form.Item>
          </div>
          <Form.Item name="businessType" label="Ngành nghề theo hợp đồng" rules={[{ required: true }]}>
            <Select options={Object.entries(types).map(([value, type]) => ({ value, label: `${type.label} (GTGT ${percent(type.vat)}, TNDN ${percent(type.cit)})` }))} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="amount" label="Số tiền thanh toán (VNĐ)" rules={[{ required: true }]}><Input type="number" min={1} step={1} /></Form.Item>
            <Form.Item name="priceIncludesTax" label="Giá hợp đồng" rules={[{ required: true }]}><Select options={[{ value: 'yes', label: 'Đã gồm thuế nhà thầu' }, { value: 'no', label: 'Thực nhận, chưa gồm thuế' }]} /></Form.Item>
            <Form.Item name="vatApplicable" label="Thuế GTGT" rules={[{ required: true }]}><Select options={[{ value: 'yes', label: 'Chịu thuế GTGT' }, { value: 'no', label: 'Không chịu hoặc đã nộp khi nhập khẩu' }]} /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="paymentDate" label="Ngày thanh toán" rules={[{ required: true }]}><Input type="date" /></Form.Item>
            <Form.Item name="filingMode" label="Kỳ khai" rules={[{ required: true }]}><Select options={[{ value: 'occurrence', label: 'Theo từng lần phát sinh (10 ngày)' }, { value: 'monthly', label: 'Theo tháng (ngày 20 tháng sau)' }]} /></Form.Item>
          </div>
          {preview && (
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 6, padding: 12, fontSize: 12.5, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
              <span>Doanh thu tính thuế GTGT: {money(preview.vatRevenue)}</span><span>Thuế GTGT: {money(preview.vat)}</span>
              <span>Doanh thu tính thuế TNDN: {money(preview.citRevenue)}</span><span>Thuế TNDN: {money(preview.cit)}</span>
              <span>Thực trả nhà thầu: {money(preview.netPayment)}</span><span>Hạn khai: {preview.deadline}</span>
              <span style={{ gridColumn: 'span 2', color: '#64748B' }}>Bút toán gợi ý: {preview.journal.map((line) => `${line.debit ? 'Nợ' : 'Có'} ${line.account} ${money(line.debit || line.credit)}`).join('; ')}</span>
              {preview.warnings.map((warning) => <span key={warning} style={{ gridColumn: 'span 2', color: '#B45309' }}>{warning}</span>)}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => void runPreview()}>Tính thử</Button>
            <Button onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" disabled={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
          </div>
        </Form>
      </Modal>

      <Modal title="Ghi nhận đã nộp thuế nhà thầu" open={Boolean(paying)} onCancel={() => setPaying(null)} footer={null} width={460}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          <Input type="date" value={paidDate} onChange={(event: any) => setPaidDate(event.target.value)} />
          <Input placeholder="Số giấy nộp tiền hoặc chứng từ nộp thuế" value={paidReference} onChange={(event: any) => setPaidReference(event.target.value)} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setPaying(null)}>Đóng</Button>
            <Button type="primary" disabled={saving || !paidReference.trim()} onClick={() => void markPaid()} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Ghi nhận</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
