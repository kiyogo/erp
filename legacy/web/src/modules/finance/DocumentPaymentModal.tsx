import React, { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Select, message } from '../../custom-ui';
import { financeDocumentsApi, financePaymentAccountsApi, type FinanceDocument, type FinancePaymentAccount } from '../../api/endpoints';
import { documentPaymentInfo } from './tradeAdjustments';

const formatMoney = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} ₫`;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Cột "Thanh toán" của bảng chứng từ: nút mở hộp thoại thu hoặc chi tiền khi còn số chưa thanh toán. */
export const documentPaymentColumn = (open: (document: FinanceDocument) => void) => ({
  title: 'Thanh toán',
  key: 'payment',
  width: 130,
  render: (_: unknown, record: FinanceDocument) => {
    const info = documentPaymentInfo(record);
    if (!info) return '—';
    if (info.remaining <= 0) return <span style={{ color: '#16A34A' }}>Đã đủ</span>;
    return <Button onClick={() => open(record)}>{info.type === 'Thu' ? 'Thu tiền' : 'Chi tiền'}</Button>;
  },
});

/** Lập phiếu thu hoặc chi thật cho chứng từ, ghi sổ cái và cộng vào số đã thanh toán (cần PIN bảo mật nếu đã đặt). */
export const DocumentPaymentModal: React.FC<{ target: FinanceDocument | null; onClose: () => void; onPaid: () => void }> = ({ target, onClose, onPaid }) => {
  const [accounts, setAccounts] = useState<FinancePaymentAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const info = target ? documentPaymentInfo(target) : null;

  useEffect(() => {
    if (!target || !info) return;
    form.resetFields();
    form.setFieldsValue({ amount: info.remaining, date: today() });
    financePaymentAccountsApi.getAccounts().then((response) => setAccounts(response.data.accounts.filter((account) => account.status === 'Đang hoạt động'))).catch(() => setAccounts([]));
  }, [target]);

  const submit = async (values: any) => {
    if (!target || saving) return;
    setSaving(true);
    try {
      const response = await financeDocumentsApi.pay(target.key, { amount: Number(values.amount), date: values.date, sourceAccountId: values.sourceAccountId, reference: values.reference || '', note: values.note || '' });
      message.success(`Đã lập ${response.data.transaction.type === 'Thu' ? 'phiếu thu' : 'phiếu chi'} ${response.data.transaction.code} và ghi sổ cái.`);
      onPaid();
      onClose();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không lập được phiếu thanh toán.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`${info?.title || 'Thanh toán'} ${target?.code || ''}`} open={!!target && !!info} onCancel={onClose} footer={null} width={560}>
      {target && info && (
        <Form form={form} layout="vertical" onFinish={submit} style={{ marginTop: 14 }}>
          <Alert type="info" showIcon message={`${target.partnerName}: còn ${formatMoney(info.remaining)} (đã trừ hàng trả lại, giảm giá)`} description={`Hệ thống lập ${info.type === 'Thu' ? 'phiếu thu' : 'phiếu chi'} đã ghi sổ cái, đổi số dư tài khoản tiền được chọn và cộng vào số đã thanh toán của chứng từ.`} />
          <Form.Item name="sourceAccountId" label="Tài khoản tiền" rules={[{ required: true, message: 'Chọn tài khoản ngân hàng hoặc quỹ tiền mặt' }]} style={{ marginTop: 12 }}>
            <Select options={accounts.map((account) => ({ value: account.key, label: `${account.name} · số dư ${formatMoney(account.balance)}` }))} placeholder="Chọn tài khoản ngân hàng hoặc quỹ" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="amount" label="Số tiền" rules={[{ required: true }]}><Input type="number" min={1} max={info.remaining} /></Form.Item>
            <Form.Item name="date" label="Ngày thanh toán" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          </div>
          <Form.Item name="reference" label="Số chứng từ ngân hàng hoặc tham chiếu"><Input /></Form.Item>
          <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Button onClick={onClose}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lập phiếu và ghi sổ</Button>
          </div>
        </Form>
      )}
    </Modal>
  );
};
