import React, { useEffect, useMemo, useState } from 'react';
import { DownloadOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { crmLoyaltyApi, type CrmLoyaltyCustomer, type CrmLoyaltyEntry, type CrmLoyaltySale } from '../../api/endpoints';
import { KTable } from '../../components/KTable';
import { Button, Form, Input, Modal, Select, Tag, message } from '../../custom-ui';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';

const typeNames: Record<CrmLoyaltyEntry['type'], string> = {
  earn: 'Tích điểm', redeem: 'Đổi điểm', reversal: 'Hủy tích điểm', refund: 'Hoàn điểm',
};

export const LoyaltyModule: React.FC = () => {
  const [customers, setCustomers] = useState<CrmLoyaltyCustomer[]>([]);
  const [entries, setEntries] = useState<CrmLoyaltyEntry[]>([]);
  const [sales, setSales] = useState<CrmLoyaltySale[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [entryType, setEntryType] = useState<'earn' | 'redeem' | null>(null);
  const [requestId, setRequestId] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [target, setTarget] = useState<CrmLoyaltyEntry | null>(null);
  const [action, setAction] = useState<'fulfill' | 'cancel' | null>(null);
  const [entryForm] = Form.useForm();
  const [actionForm] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await crmLoyaltyApi.getAll();
      setCustomers(response.data.customers);
      setEntries(response.data.entries);
      setSales(response.data.sales || []);
      setLoadError(false);
    } catch (error: any) {
      setLoadError(true);
      message.error(error?.response?.data?.message || 'Không tải được sổ điểm khách hàng.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void loadData(); }, []);

  const keyword = search.trim().toLocaleLowerCase();
  const visibleCustomers = useMemo(() => customers.filter((item) =>
    !keyword || `${item.code} ${item.name}`.toLocaleLowerCase().includes(keyword)), [customers, keyword]);
  const visibleEntries = useMemo(() => entries.filter((entry) => {
    const matchesFilter = filter === 'all' || (filter === 'pending' ? entry.type === 'redeem' && entry.status === 'Chờ trao' : entry.type === filter);
    return matchesFilter && (!keyword || `${entry.customerCode} ${entry.customerName} ${entry.reference} ${entry.rewardName}`.toLocaleLowerCase().includes(keyword));
  }), [entries, filter, keyword]);

  const openEntry = (type: 'earn' | 'redeem', customerId?: string) => {
    entryForm.resetFields();
    entryForm.setFieldsValue({ customerId: customerId || '', saleId: '', points: '', reference: '', rewardName: '', note: '' });
    setSelectedCustomerId(customerId || '');
    setSelectedSaleId('');
    setRequestId(crypto.randomUUID());
    setEntryType(type);
  };

  const saveEntry = async (values: Record<string, any>) => {
    if (!entryType || saving) return;
    setSaving(true);
    try {
      await crmLoyaltyApi.create({
        requestId, type: entryType, customerId: values.customerId, points: Number(values.points),
        reference: String(values.reference || '').trim(), rewardName: entryType === 'redeem' ? String(values.rewardName || '').trim() : '',
        note: String(values.note || '').trim(),
        ...(entryType === 'earn' && values.saleId ? { saleId: values.saleId } : {}),
      });
      setEntryType(null);
      entryForm.resetFields();
      await loadData();
      message.success(entryType === 'earn' ? 'Đã ghi nhận tích điểm.' : 'Đã ghi nhận yêu cầu đổi thưởng.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể ghi nhận giao dịch điểm.');
    } finally {
      setSaving(false);
    }
  };

  const openAction = (entry: CrmLoyaltyEntry, nextAction: 'fulfill' | 'cancel') => {
    setTarget(entry);
    setAction(nextAction);
    actionForm.resetFields();
  };

  const saveAction = async (values: Record<string, any>) => {
    if (!target || !action || saving) return;
    setSaving(true);
    try {
      if (action === 'fulfill') await crmLoyaltyApi.fulfill(target.key, String(values.detail || '').trim());
      else await crmLoyaltyApi.cancel(target.key, String(values.detail || '').trim());
      setAction(null);
      setTarget(null);
      actionForm.resetFields();
      await loadData();
      message.success(action === 'fulfill' ? 'Đã xác nhận trao thưởng.' : 'Đã hủy giao dịch và cập nhật số dư điểm.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể cập nhật giao dịch điểm.');
    } finally {
      setSaving(false);
    }
  };

  const customerColumns = [
    { title: 'Mã khách hàng', dataIndex: 'code', key: 'code', width: 150 },
    { title: 'Khách hàng', dataIndex: 'name', key: 'name' },
    { title: 'Điểm hiện có', dataIndex: 'balance', key: 'balance', width: 150, render: (value: number) => <strong style={{ color: '#009688' }}>{value.toLocaleString('vi-VN')}</strong> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 140 },
    { title: 'Thao tác', key: 'actions', width: 200, render: (_: unknown, row: CrmLoyaltyCustomer) => <div style={{ display: 'flex', gap: 6 }}>
      <Button size="small" onClick={() => openEntry('earn', row.key)} disabled={loading || loadError || row.status.toLocaleLowerCase().includes('tạm')}>Tích điểm</Button>
      <Button size="small" onClick={() => openEntry('redeem', row.key)} disabled={loading || loadError || row.balance <= 0 || row.status.toLocaleLowerCase().includes('tạm')}>Đổi điểm</Button>
    </div> },
  ];
  const entryColumns = [
    { title: 'Thời gian', dataIndex: 'createdAt', key: 'createdAt', width: 160, render: (value: string) => new Date(value).toLocaleString('vi-VN') },
    { title: 'Khách hàng', key: 'customer', render: (_: unknown, row: CrmLoyaltyEntry) => <span>{row.customerCode} · {row.customerName}</span> },
    { title: 'Loại', dataIndex: 'type', key: 'type', width: 140, render: (value: CrmLoyaltyEntry['type']) => typeNames[value] },
    { title: 'Điểm', dataIndex: 'delta', key: 'delta', width: 100, render: (value: number) => <strong style={{ color: value < 0 ? '#DC2626' : '#16A34A' }}>{value > 0 ? '+' : ''}{value.toLocaleString('vi-VN')}</strong> },
    { title: 'Tham chiếu', dataIndex: 'reference', key: 'reference', width: 160 },
    { title: 'Phần thưởng', dataIndex: 'rewardName', key: 'rewardName', render: (value: string) => value || '—' },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 125, render: (value: string) => <Tag color={value === 'Đã hủy' ? 'error' : value === 'Chờ trao' ? 'warning' : 'success'}>{value}</Tag> },
    { title: 'Người ghi nhận', dataIndex: 'createdBy', key: 'createdBy', width: 150 },
    { title: 'Thao tác', key: 'actions', width: 180, render: (_: unknown, row: CrmLoyaltyEntry) => <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {row.type === 'redeem' && row.status === 'Chờ trao' && <Button size="small" disabled={loading || loadError} onClick={() => openAction(row, 'fulfill')}>Xác nhận trao</Button>}
      {((row.type === 'redeem' && row.status === 'Chờ trao') || (row.type === 'earn' && row.status === 'Đã ghi nhận')) && <Button size="small" disabled={loading || loadError} onClick={() => openAction(row, 'cancel')}>Hủy</Button>}
    </div> },
  ];

  const exportEntries = () => downloadFile('So_diem_khach_hang.xlsx', generateValidXlsxBlob([
    ['Thời gian', 'Mã khách hàng', 'Khách hàng', 'Loại', 'Điểm thay đổi', 'Số dư sau giao dịch', 'Tham chiếu', 'Chứng từ bán', 'Giá trị chứng từ', 'Phần thưởng', 'Trạng thái', 'Người ghi nhận', 'Người xử lý', 'Tham chiếu trao thưởng', 'Lý do hủy', 'Ghi chú'],
    ...visibleEntries.map((entry) => [entry.createdAt, entry.customerCode, entry.customerName, typeNames[entry.type], entry.delta, entry.balanceAfter, entry.reference, entry.saleCode || '', entry.saleAmount ?? '', entry.rewardName, entry.status, entry.createdBy, entry.handledBy || '', entry.fulfillmentReference || '', entry.cancelReason || '', entry.note]),
  ]));

  return <div aria-busy={loading} style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <div><h1 style={{ margin: 0, fontSize: 20, color: '#0F172A' }}>Tích điểm và trả thưởng</h1>
        <div style={{ marginTop: 4, fontSize: 13, color: '#64748B' }}>Ghi nhận điểm, đổi thưởng và xác nhận trao theo khách hàng.</div></div>
      <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>Làm mới</Button>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
      {[
        ['Khách hàng', customers.length.toLocaleString('vi-VN')],
        ['Tổng điểm hiện có', customers.reduce((sum, item) => sum + BigInt(item.balance), 0n).toLocaleString('vi-VN')],
        ['Phần thưởng chờ trao', entries.filter((item) => item.type === 'redeem' && item.status === 'Chờ trao').length.toLocaleString('vi-VN')],
      ].map(([label, value]) => <div key={String(label)} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
        <div style={{ color: '#64748B', fontSize: 12 }}>{label}</div><strong style={{ color: '#009688', fontSize: 22 }}>{value}</strong>
      </div>)}
    </div>
    {loadError && <div role="alert" style={{ color: '#B91C1C', marginBottom: 12 }}>Không tải được số dư mới nhất. Hãy làm mới trước khi tiếp tục.</div>}
    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      <Input prefix={<SearchOutlined />} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm khách hàng, mã tham chiếu, phần thưởng" allowClear style={{ width: 340 }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button icon={<DownloadOutlined />} disabled={loading || loadError || !visibleEntries.length} onClick={exportEntries}>Xuất Excel</Button>
        <Button icon={<PlusOutlined />} onClick={() => openEntry('earn')} disabled={loading || loadError || !customers.some((item) => !item.status.toLocaleLowerCase().includes('tạm'))}>Tích điểm</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEntry('redeem')} disabled={loading || loadError || !customers.some((item) => !item.status.toLocaleLowerCase().includes('tạm'))} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Đổi điểm</Button>
      </div>
    </div>
    <h3 style={{ margin: '8px 0' }}>Số dư khách hàng</h3>
    <div className="transparent-table-card"><KTable dataSource={visibleCustomers} columns={customerColumns} rowKey="key" loading={loading} pagination={{ pageSize: 8 }} locale={{ emptyText: 'Chưa có khách hàng.' }} /></div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, margin: '18px 0 8px' }}>
      <h3 style={{ margin: 0 }}>Lịch sử điểm và trả thưởng</h3>
      <Select value={filter} onChange={setFilter} style={{ width: 190 }} options={[
        { value: 'all', label: 'Tất cả giao dịch' }, { value: 'earn', label: 'Tích điểm' },
        { value: 'redeem', label: 'Đổi điểm' }, { value: 'pending', label: 'Chờ trao thưởng' },
        { value: 'refund', label: 'Hoàn điểm' }, { value: 'reversal', label: 'Hủy tích điểm' },
      ]} />
    </div>
    <div className="transparent-table-card"><KTable dataSource={visibleEntries} columns={entryColumns} rowKey="key" loading={loading} pagination={{ pageSize: 10 }} locale={{ emptyText: 'Chưa có giao dịch điểm.' }} /></div>

    <Modal title={entryType === 'earn' ? 'Ghi nhận tích điểm' : 'Đổi điểm lấy thưởng'} open={!!entryType} onCancel={() => setEntryType(null)} footer={null} width={620}>
      <Form form={entryForm} layout="vertical" onFinish={saveEntry} style={{ marginTop: 14 }}>
        <Form.Item name="customerId" label="Khách hàng" rules={[{ required: true }]}><Select showSearch options={customers.filter((item) => !item.status.toLocaleLowerCase().includes('tạm')).map((item) => ({ value: item.key, label: `${item.code} · ${item.name} · ${item.balance.toLocaleString('vi-VN')} điểm` }))} onChange={(value) => {
          setSelectedCustomerId(String(value || ''));
          setSelectedSaleId('');
          entryForm.setFieldsValue({ saleId: '', reference: '' });
        }} /></Form.Item>
        {entryType === 'earn' && <Form.Item name="saleId" label="Chứng từ bán hàng">
          <Select allowClear showSearch placeholder="Chọn chứng từ đã bàn giao" options={sales.filter((sale) => sale.customerId === selectedCustomerId && !entries.some((item) => item.type === 'earn' && item.saleId === sale.key && item.status !== 'Đã hủy')).map((sale) => ({ value: sale.key, label: `${sale.code} · ${sale.documentDate} · ${Number(sale.amount).toLocaleString('vi-VN')} ₫` }))} onChange={(value) => {
            const id = String(value || '');
            setSelectedSaleId(id);
            entryForm.setFieldsValue({ reference: sales.find((sale) => sale.key === id)?.code || '' });
          }} />
        </Form.Item>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Form.Item name="points" label="Số điểm" rules={[{ required: true }]}><Input type="number" min={1} step={1} /></Form.Item>
          <Form.Item name="reference" label="Mã tham chiếu" rules={[{ required: true, whitespace: true }]}><Input maxLength={160} disabled={!!selectedSaleId} /></Form.Item>
        </div>
        {entryType === 'redeem' && <Form.Item name="rewardName" label="Phần thưởng" rules={[{ required: true, whitespace: true }]}><Input maxLength={255} /></Form.Item>}
        <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14 }}>
          <Button onClick={() => setEntryType(null)}>Hủy</Button>
          <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu giao dịch</Button>
        </div>
      </Form>
    </Modal>
    <Modal title={action === 'fulfill' ? 'Xác nhận trao thưởng' : 'Hủy giao dịch điểm'} open={!!action} onCancel={() => { setAction(null); setTarget(null); }} footer={null} width={540}>
      <Form form={actionForm} layout="vertical" onFinish={saveAction} style={{ marginTop: 14 }}>
        <div style={{ marginBottom: 14 }}>{target?.customerName} · {target?.reference} · {target?.points.toLocaleString('vi-VN')} điểm</div>
        <Form.Item name="detail" label={action === 'fulfill' ? 'Mã xác nhận trao thưởng' : 'Lý do hủy'} rules={[{ required: true, whitespace: true }]}><Input maxLength={500} /></Form.Item>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14 }}>
          <Button onClick={() => { setAction(null); setTarget(null); }}>Đóng</Button>
          <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Xác nhận</Button>
        </div>
      </Form>
    </Modal>
  </div>;
};
