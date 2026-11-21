import React, { useEffect, useState } from 'react';
import { PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Alert, Button, Form, Input, Modal, Select, Tag, message } from '../../custom-ui';
import { pitVouchersApi, type PitVoucher } from '../../api/endpoints';
import { EmployeeSelect } from '../hr/EmployeeSelect';
import { PIT_YEAR_OPTIONS } from './PitFinalizationModule';
import { printPitVoucher } from './pitVoucherPrint';

const money = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} ₫`;
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({ label: `Tháng ${index + 1}`, value: index + 1 }));

/** Chứng từ khấu trừ thuế TNCN: lập từ phiếu lương đã chốt của kỳ, đánh số liên tục theo ký hiệu, in, hủy kèm lý do. */
export const PitVouchersModule: React.FC = () => {
  const [data, setData] = useState<PitVoucher[]>([]);
  const [issueOpen, setIssueOpen] = useState(false);
  const [cancelling, setCancelling] = useState<PitVoucher | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    try {
      setData((await pitVouchersApi.list()).data.data);
    } catch (error: any) {
      setData([]);
      message.error(error?.response?.data?.message || 'Không tải được chứng từ khấu trừ thuế.');
    }
  };
  useEffect(() => { void load(); }, []);

  const issue = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const { data: result } = await pitVouchersApi.issue({ employeeId: values.employeeId, year: Number(values.year), fromMonth: Number(values.fromMonth), toMonth: Number(values.toMonth), series: values.series, templateSymbol: values.templateSymbol });
      message.success(`Đã lập chứng từ ${result.voucher.series}-${result.voucher.number}.`);
      if (result.voucher.contentIssues.length) message.warning(result.voucher.contentIssues.join(' '));
      setIssueOpen(false);
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không lập được chứng từ.');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (!cancelling || saving) return;
    setSaving(true);
    try {
      await pitVouchersApi.cancel(cancelling.key, cancelReason);
      message.success('Đã hủy chứng từ; số chứng từ được giữ để đối chiếu.');
      setCancelling(null);
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không hủy được chứng từ.');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: 'Số chứng từ', key: 'number', render: (_: unknown, row: PitVoucher) => <div><div style={{ color: '#0F766E' }}>{row.series}-{row.number}</div><div style={{ fontSize: 12, color: '#64748B' }}>{row.templateSymbol} · {new Date(row.issuedAt).toLocaleDateString('vi-VN')}</div></div> },
    { title: 'Người nộp thuế', key: 'person', render: (_: unknown, row: PitVoucher) => <div><div>{row.person.name}</div><div style={{ fontSize: 12, color: '#64748B' }}>{row.person.employeeCode} · {row.person.taxCode || row.person.identityNumber || 'Chưa có mã số thuế'}</div></div> },
    { title: 'Kỳ trả thu nhập', dataIndex: 'paymentPeriod', key: 'paymentPeriod' },
    { title: 'Thu nhập chịu thuế', dataIndex: 'taxableIncome', key: 'taxableIncome', render: money },
    { title: 'Bảo hiểm', dataIndex: 'insurance', key: 'insurance', render: money },
    { title: 'Thuế đã khấu trừ', dataIndex: 'taxWithheld', key: 'taxWithheld', render: money },
    { title: 'Trạng thái', key: 'status', render: (_: unknown, row: PitVoucher) => <Tag color={row.status === 'Đã hủy' ? 'error' : row.contentIssues.length ? 'warning' : 'default'}>{row.status}</Tag> },
    { title: 'Thao tác', key: 'actions', render: (_: unknown, row: PitVoucher) => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button icon={<PrinterOutlined />} onClick={() => { if (!printPitVoucher(row)) message.error('Trình duyệt chặn cửa sổ in.'); }}>In</Button>
        {row.status !== 'Đã hủy' && <Button danger onClick={() => { setCancelReason(''); setCancelling(row); }}>Hủy</Button>}
      </div>
    ) },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Alert type="info" showIcon message="Chứng từ lấy số liệu từ phiếu lương đã chốt của kỳ; người đã ủy quyền quyết toán năm đó không được cấp chứng từ. Hệ thống chưa ký số và chưa gửi dữ liệu chứng từ cho cơ quan thuế." />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ year: PIT_YEAR_OPTIONS[0].value, fromMonth: 1, toMonth: 12, templateSymbol: 'CTT56' }); setIssueOpen(true); }} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lập chứng từ</Button>
      </div>
      <div className="transparent-table-card">
        <KTable dataSource={data} columns={columns} rowKey="key" pagination={{ pageSize: 10 }} />
      </div>

      <Modal title="Lập chứng từ khấu trừ thuế TNCN" open={issueOpen} onCancel={() => setIssueOpen(false)} footer={null} width={600}>
        <Form form={form} layout="vertical" onFinish={issue} style={{ marginTop: 14 }}>
          <Form.Item name="employeeId" label="Người lao động" rules={[{ required: true, message: 'Chọn người lao động' }]}><EmployeeSelect valueKey="id" /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="year" label="Năm" rules={[{ required: true }]}><Select options={PIT_YEAR_OPTIONS} /></Form.Item>
            <Form.Item name="fromMonth" label="Từ tháng" rules={[{ required: true }]}><Select options={MONTH_OPTIONS} /></Form.Item>
            <Form.Item name="toMonth" label="Đến tháng" rules={[{ required: true }]}><Select options={MONTH_OPTIONS} /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="templateSymbol" label="Ký hiệu mẫu chứng từ" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="series" label="Ký hiệu chứng từ" rules={[{ required: true, message: 'Nhập ký hiệu đã đăng ký' }]}><Input /></Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setIssueOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" disabled={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>{saving ? 'Đang lập...' : 'Lập chứng từ'}</Button>
          </div>
        </Form>
      </Modal>

      <Modal title={`Hủy chứng từ ${cancelling ? `${cancelling.series}-${cancelling.number}` : ''}`} open={Boolean(cancelling)} onCancel={() => setCancelling(null)} footer={null} width={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          <Input.TextArea rows={3} placeholder="Lý do hủy" value={cancelReason} onChange={(event: any) => setCancelReason(event.target.value)} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setCancelling(null)}>Đóng</Button>
            <Button danger disabled={saving || !cancelReason.trim()} onClick={() => void cancel()}>Hủy chứng từ</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
