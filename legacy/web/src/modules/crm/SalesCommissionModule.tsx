import React, { useEffect, useState } from 'react';
import { PlusOutlined, EditOutlined, DeleteOutlined, LockOutlined, EyeOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Drawer, Form, Input, Modal, Select, Tag, message } from '../../custom-ui';
import { collectionsApi, salesCommissionApi, type CommissionMonth, type CommissionRow } from '../../api/endpoints';

// Hoa hồng bán hàng: chính sách hoa hồng (crm_commission_policies) và bảng hoa hồng theo tháng tính ở máy chủ (legacy/api/commissionRules.mjs) từ chứng từ
// bán đã ghi nhân viên bán hàng. Chốt tháng thì hoa hồng được cộng vào khoản thưởng chịu thuế TNCN của bảng lương tháng đó.
interface CommissionPolicy { key: string; name: string; rate: number; basis: 'delivered' | 'paid'; basisLabel?: string; effectiveFrom: string; effectiveTo?: string; note?: string }

const BASIS_OPTIONS = [
  { value: 'delivered', label: 'Khi đã bàn giao' },
  { value: 'paid', label: 'Khi đã thu đủ tiền' },
];
const money = (value: number) => `${(Number(value) || 0).toLocaleString('vi-VN')} ₫`;
const monthOptions = () => Array.from({ length: 13 }, (_, index) => {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - index);
  const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return { value, label: `Tháng ${date.getMonth() + 1}/${date.getFullYear()}` };
});

const card = (title: string, value: React.ReactNode, note: string, color: string) => (
  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
    <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>{title}</div>
    <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
    <div style={{ fontSize: 11.5, color, marginTop: 2 }}>{note}</div>
  </div>
);

export const SalesCommissionModule: React.FC = () => {
  const [month, setMonth] = useState(monthOptions()[0].value);
  const [result, setResult] = useState<CommissionMonth | null>(null);
  const [policies, setPolicies] = useState<CommissionPolicy[]>([]);
  const [policyModal, setPolicyModal] = useState<CommissionPolicy | 'new' | null>(null);
  const [detail, setDetail] = useState<CommissionRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const loadPolicies = () => collectionsApi.get<CommissionPolicy>('crm_commission_policies', { limit: 500 })
    .then((response) => setPolicies([...(response.data?.data || [])].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))))
    .catch(() => message.error('Không tải được chính sách hoa hồng.'));
  const loadMonth = (value = month) => salesCommissionApi.get(value)
    .then((response) => setResult(response.data))
    .catch((error: any) => message.error(error?.response?.data?.message || 'Không tính được hoa hồng.'));

  useEffect(() => { void loadPolicies(); }, []);
  useEffect(() => { void loadMonth(month); }, [month]);

  const openPolicy = (policy: CommissionPolicy | 'new') => {
    form.resetFields();
    if (policy !== 'new') form.setFieldsValue(policy);
    else form.setFieldsValue({ basis: 'delivered', effectiveFrom: new Date().toISOString().slice(0, 10) });
    setPolicyModal(policy);
  };

  const savePolicy = async (values: any) => {
    if (saving || !policyModal) return;
    setSaving(true);
    try {
      const record = { name: values.name, rate: Number(String(values.rate).replace(',', '.')), basis: values.basis, effectiveFrom: values.effectiveFrom, effectiveTo: values.effectiveTo || '', note: values.note || '' };
      if (policyModal === 'new') await collectionsApi.create('crm_commission_policies', record);
      else await collectionsApi.update('crm_commission_policies', policyModal.key, { ...record, key: policyModal.key });
      message.success('Đã lưu chính sách hoa hồng.');
      setPolicyModal(null);
      await loadPolicies();
      await loadMonth();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không lưu được chính sách hoa hồng.');
    } finally {
      setSaving(false);
    }
  };

  const removePolicy = (policy: CommissionPolicy) => Modal.confirm({
    title: 'Xóa chính sách hoa hồng?',
    content: `Xóa "${policy.name}". Tháng đã chốt giữ nguyên số liệu đã chốt.`,
    okText: 'Xóa',
    cancelText: 'Hủy',
    onOk: async () => {
      try { await collectionsApi.remove('crm_commission_policies', policy.key); await loadPolicies(); await loadMonth(); }
      catch (error: any) { message.error(error?.response?.data?.message || 'Không xóa được chính sách.'); }
    },
  });

  const closeMonth = () => Modal.confirm({
    title: `Chốt hoa hồng ${monthOptions().find((item) => item.value === month)?.label || month}?`,
    content: 'Sau khi chốt, số hoa hồng không đổi nữa và được cộng vào khoản thưởng chịu thuế TNCN khi tính bảng lương tháng này.',
    okText: 'Chốt hoa hồng',
    cancelText: 'Hủy',
    onOk: async () => {
      try { const response = await salesCommissionApi.close(month); setResult(response.data); message.success('Đã chốt hoa hồng tháng.'); }
      catch (error: any) { message.error(error?.response?.data?.message || 'Không chốt được hoa hồng.'); }
    },
  });

  const revenue = (result?.rows || []).reduce((sum, row) => sum + row.revenue, 0);

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
        {card('Tổng hoa hồng tháng', money(result?.totalCommission || 0), result?.closed ? `Đã chốt bởi ${result.closedBy || ''}` : 'Đang tính thử, chưa chốt', '#009688')}
        {card('Nhân viên hưởng hoa hồng', result?.rows.length || 0, 'Theo nhân viên bán hàng ghi trên chứng từ', '#2563EB')}
        {card('Doanh số tính hoa hồng', money(revenue), 'Chưa gồm thuế GTGT, đã trừ hàng trả lại', '#7C3AED')}
        {card('Chứng từ chưa tính', (result?.unassigned.length || 0) + (result?.noPolicy.length || 0), `${result?.unassigned.length || 0} chưa gán nhân viên · ${result?.noPolicy.length || 0} chưa có chính sách`, '#D97706')}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Select value={month} onChange={(value) => setMonth(String(value))} options={monthOptions()} style={{ width: 170 }} />
          {result && <Tag color={result.closed ? 'success' : 'processing'}>{result.closed ? 'Đã chốt' : 'Chưa chốt'}</Tag>}
        </div>
        <Button type="primary" icon={<LockOutlined />} disabled={!result || result.closed} onClick={closeMonth} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
          Chốt hoa hồng tháng
        </Button>
      </div>

      <div className="transparent-table-card" style={{ marginBottom: 20 }}>
        <KTable rowKey="salespersonId" dataSource={result?.rows || []} pagination={{ pageSize: 10 }} columns={[
          { title: 'Nhân viên bán hàng', key: 'name', render: (_: unknown, row: CommissionRow) => `${row.salespersonName}${row.salespersonCode ? ` (${row.salespersonCode})` : ''}` },
          { title: 'Phòng ban', dataIndex: 'salespersonDepartment', key: 'department', width: 180, render: (value: string) => value || '—' },
          { title: 'Số chứng từ', key: 'count', width: 120, render: (_: unknown, row: CommissionRow) => row.documents.length },
          { title: 'Doanh số chưa thuế', dataIndex: 'revenue', key: 'revenue', width: 170, render: (value: number) => money(value) },
          { title: 'Hoa hồng', dataIndex: 'commission', key: 'commission', width: 150, render: (value: number) => money(value) },
          { title: 'Thao tác', key: 'actions', width: 110, render: (_: unknown, row: CommissionRow) => <Button icon={<EyeOutlined />} onClick={() => setDetail(row)}>Chi tiết</Button> },
        ]} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 15, color: '#0F172A' }}>Chính sách hoa hồng</div>
        <Button icon={<PlusOutlined />} onClick={() => openPolicy('new')}>Thêm chính sách</Button>
      </div>
      <div className="transparent-table-card">
        <KTable rowKey="key" dataSource={policies} pagination={false} columns={[
          { title: 'Tên chính sách', dataIndex: 'name', key: 'name' },
          { title: 'Tỷ lệ', dataIndex: 'rate', key: 'rate', width: 100, render: (value: number) => `${value}%` },
          { title: 'Căn cứ tính', key: 'basis', width: 170, render: (_: unknown, item: CommissionPolicy) => item.basisLabel || BASIS_OPTIONS.find((option) => option.value === item.basis)?.label },
          { title: 'Áp dụng', key: 'period', width: 220, render: (_: unknown, item: CommissionPolicy) => `Từ ${item.effectiveFrom}${item.effectiveTo ? ` đến ${item.effectiveTo}` : ''}` },
          { title: 'Ghi chú', dataIndex: 'note', key: 'note' },
          { title: 'Thao tác', key: 'actions', width: 200, render: (_: unknown, item: CommissionPolicy) => (
            <span style={{ display: 'flex', gap: 6 }}>
              <Button icon={<EditOutlined />} onClick={() => openPolicy(item)}>Sửa</Button>
              <Button danger icon={<DeleteOutlined />} onClick={() => removePolicy(item)}>Xóa</Button>
            </span>
          ) },
        ]} />
      </div>
      <div style={{ color: '#64748B', fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>
        Hoa hồng tính trên doanh số chưa thuế GTGT của đơn bán, hợp đồng bán có nhân viên bán hàng (gán ở màn Bán hàng), theo ngày chứng từ và chính sách áp dụng vào ngày đó. Hoa hồng trả cho người lao động là thu nhập chịu thuế TNCN từ tiền lương, tiền công; bảo hiểm xã hội vẫn tính theo lương hợp đồng.
      </div>

      <Modal title={policyModal === 'new' ? 'Thêm chính sách hoa hồng' : 'Sửa chính sách hoa hồng'} open={!!policyModal} onCancel={() => setPolicyModal(null)} footer={null} width={560}>
        <Form form={form} layout="vertical" onFinish={savePolicy} style={{ marginTop: 12 }}>
          <Form.Item name="name" label="Tên chính sách" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Hoa hồng nhân viên kinh doanh năm 2026" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="rate" label="Tỷ lệ hoa hồng (%)" rules={[{ required: true }]}>
              <Input type="number" min={0} max={100} step={0.01} />
            </Form.Item>
            <Form.Item name="basis" label="Căn cứ tính" rules={[{ required: true }]}>
              <Select options={BASIS_OPTIONS} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="effectiveFrom" label="Áp dụng từ ngày" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="effectiveTo" label="Đến ngày">
              <Input type="date" />
            </Form.Item>
          </div>
          <Form.Item name="note" label="Ghi chú">
            <Input placeholder="Căn cứ quy chế lương, thưởng của doanh nghiệp" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setPolicyModal(null)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu chính sách</Button>
          </div>
        </Form>
      </Modal>

      <Drawer title={detail ? `Hoa hồng của ${detail.salespersonName}` : ''} open={!!detail} onClose={() => setDetail(null)} width={620}>
        {detail && (
          <KTable rowKey="key" dataSource={detail.documents} pagination={false} columns={[
            { title: 'Chứng từ', dataIndex: 'code', key: 'code' },
            { title: 'Ngày', dataIndex: 'documentDate', key: 'documentDate', width: 110 },
            { title: 'Doanh số chưa thuế', dataIndex: 'revenue', key: 'revenue', width: 150, render: (value: number) => money(value) },
            { title: 'Tỷ lệ', dataIndex: 'rate', key: 'rate', width: 80, render: (value: number) => `${value}%` },
            { title: 'Hoa hồng', dataIndex: 'commission', key: 'commission', width: 130, render: (value: number) => money(value) },
          ]} />
        )}
      </Drawer>
    </div>
  );
};
