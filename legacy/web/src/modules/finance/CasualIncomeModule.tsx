import React, { useEffect, useState } from 'react';
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Alert, Button, Checkbox, Form, Input, Modal, Select, Tag, message } from '../../custom-ui';
import { casualIncomeApi, type CasualIncomeRecord } from '../../api/endpoints';
import { exportRowsToXlsx } from '../../utils/fileExporter';
import { PIT_YEAR_OPTIONS } from './PitFinalizationModule';

const money = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} ₫`;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Sổ chi trả thu nhập vãng lai (không hợp đồng lao động hoặc hợp đồng dưới 3 tháng) và thuế TNCN khấu trừ, tổng hợp theo tháng để kê khai. */
export const CasualIncomeModule: React.FC = () => {
  const [year, setYear] = useState<number>(Number(PIT_YEAR_OPTIONS[0].value));
  const [data, setData] = useState<CasualIncomeRecord[]>([]);
  const [months, setMonths] = useState<Array<{ month: string; payments: number; amount: number; tax: number }>>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [commitment, setCommitment] = useState(false);
  const [preview, setPreview] = useState<CasualIncomeRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    try {
      const { data: response } = await casualIncomeApi.list(year);
      setData(response.data);
      setMonths(response.months);
      setWarnings(response.commitmentWarnings);
    } catch (error: any) {
      setData([]);
      message.error(error?.response?.data?.message || 'Không tải được sổ thu nhập vãng lai.');
    }
  };
  useEffect(() => { void load(); }, [year]);

  const inputOf = (values: any) => ({ ...values, amount: Number(values.amount), commitment });

  const runPreview = async () => {
    try {
      setPreview((await casualIncomeApi.preview(inputOf(form.getFieldsValue()))).data.result);
    } catch (error: any) {
      setPreview(null);
      message.error(error?.response?.data?.message || 'Không tính được thuế.');
    }
  };

  const save = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const { data: response } = await casualIncomeApi.create(inputOf(values));
      message.success(`Đã lưu lần chi trả; thuế khấu trừ ${money(response.record.tax)}.`);
      setOpen(false);
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không lưu được.');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: 'Ngày chi trả', dataIndex: 'paymentDate', key: 'paymentDate' },
    { title: 'Người nhận', key: 'payee', render: (_: unknown, row: CasualIncomeRecord) => <div><div>{row.payeeName}</div><div style={{ fontSize: 12, color: '#64748B' }}>{row.taxCode || row.identityNumber || 'Chưa có mã số thuế'} · {row.residency === 'resident' ? 'Cư trú' : 'Không cư trú'}</div></div> },
    { title: 'Nội dung', dataIndex: 'description', key: 'description' },
    { title: 'Số tiền', dataIndex: 'amount', key: 'amount', render: money },
    { title: 'Thuế khấu trừ', key: 'tax', render: (_: unknown, row: CasualIncomeRecord) => <div>{money(row.tax)}<div style={{ fontSize: 12, color: '#64748B' }}>{row.basis}</div></div> },
    { title: 'Thực chi', dataIndex: 'netPayment', key: 'netPayment', render: money },
    { title: 'Cam kết', key: 'commitment', render: (_: unknown, row: CasualIncomeRecord) => (row.commitment ? <Tag color="warning">08/CK-TNCN</Tag> : '—') },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {warnings.map((warning) => <Alert key={warning} type="warning" showIcon message={warning} style={{ marginBottom: 8 }} />)}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
        {months.map((item) => (
          <div key={item.month} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', fontSize: 12.5 }}>
            <div style={{ color: '#64748B' }}>Tháng {item.month.slice(5)}/{item.month.slice(0, 4)} · {item.payments} lần</div>
            <div>Đã trả {money(item.amount)}</div>
            <div style={{ color: '#0F766E' }}>Thuế khấu trừ {money(item.tax)}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Alert type="info" showIcon message="Cá nhân cư trú: khấu trừ 10% mỗi lần trả từ 2.000.000 đồng, trừ người có cam kết 08/CK-TNCN và mã số thuế; cá nhân không cư trú: 20%. Số thuế tổng hợp theo tháng để kê khai tờ khai 05/KK-TNCN." />
        <div style={{ display: 'flex', gap: 8 }}>
          <Select value={year} options={PIT_YEAR_OPTIONS} onChange={(value) => setYear(Number(value))} style={{ width: 140 }} />
          <Button icon={<DownloadOutlined />} disabled={!data.length} onClick={() => {
            const count = exportRowsToXlsx(`Thu_nhap_vang_lai_${year}`, [
              { title: 'Ngày chi trả', dataIndex: 'paymentDate' }, { title: 'Người nhận', dataIndex: 'payeeName' }, { title: 'Mã số thuế', dataIndex: 'taxCode' }, { title: 'Số định danh', dataIndex: 'identityNumber' },
              { title: 'Nội dung', dataIndex: 'description' }, { title: 'Số tiền', dataIndex: 'amount' }, { title: 'Thuế khấu trừ', dataIndex: 'tax' }, { title: 'Thực chi', dataIndex: 'netPayment' }, { title: 'Căn cứ', dataIndex: 'basis' },
            ], data);
            message.success(`Đã xuất ${count} dòng.`);
          }}>Xuất sổ</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ residency: 'resident', contractType: 'none', paymentDate: today() }); setCommitment(false); setPreview(null); setOpen(true); }} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Thêm lần chi trả</Button>
        </div>
      </div>
      <div className="transparent-table-card">
        <KTable dataSource={data} columns={columns} rowKey="key" pagination={{ pageSize: 10 }} />
      </div>

      <Modal title="Chi trả thu nhập vãng lai" open={open} onCancel={() => setOpen(false)} footer={null} width={640}>
        <Form form={form} layout="vertical" onFinish={save} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <Form.Item name="payeeName" label="Họ tên người nhận" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="residency" label="Cư trú" rules={[{ required: true }]}><Select options={[{ value: 'resident', label: 'Cá nhân cư trú' }, { value: 'non_resident', label: 'Cá nhân không cư trú' }]} /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="taxCode" label="Mã số thuế"><Input /></Form.Item>
            <Form.Item name="identityNumber" label="Số định danh hoặc hộ chiếu"><Input /></Form.Item>
          </div>
          <Form.Item name="address" label="Địa chỉ"><Input /></Form.Item>
          <Form.Item name="description" label="Nội dung công việc" rules={[{ required: true }]}><Input /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="contractType" label="Hình thức thuê" rules={[{ required: true }]}><Select options={[{ value: 'none', label: 'Không ký hợp đồng lao động' }, { value: 'under_3_months', label: 'Hợp đồng dưới 3 tháng' }]} /></Form.Item>
            <Form.Item name="amount" label="Số tiền trả (VNĐ)" rules={[{ required: true }]}><Input type="number" min={1} step={1} /></Form.Item>
            <Form.Item name="paymentDate" label="Ngày chi trả" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          </div>
          <Checkbox checked={commitment} onChange={(event) => setCommitment(event.target.checked)}>
            Người nhận đã nộp cam kết 08/CK-TNCN (chỉ có một nguồn thu nhập, ước tính cả năm chưa đến mức phải nộp thuế, đã có mã số thuế)
          </Checkbox>
          {preview && (
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 6, padding: 12, fontSize: 12.5, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>{preview.basis}</span>
              <span>Thuế khấu trừ: {money(preview.tax)} · Thực chi: {money(preview.netPayment)}</span>
              <span style={{ color: '#64748B' }}>Bút toán gợi ý: {preview.journal.map((line) => `${line.debit ? 'Nợ' : 'Có'} ${line.account} ${money(line.debit || line.credit)}`).join('; ')}</span>
              {preview.warnings.map((warning) => <span key={warning} style={{ color: '#B45309' }}>{warning}</span>)}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <Button onClick={() => void runPreview()}>Tính thử</Button>
            <Button onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" disabled={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
