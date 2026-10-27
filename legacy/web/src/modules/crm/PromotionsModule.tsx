import React, { useEffect, useMemo, useState } from 'react';
import {
  DownloadOutlined, EditOutlined, EyeOutlined, PauseCircleOutlined,
  PlayCircleOutlined, PlusOutlined, ReloadOutlined, SearchOutlined,
} from '@ant-design/icons';
import { collectionsApi, crmContactsApi, crmPromotionsApi, employeesApi, type CrmContact, type EnterpriseEmployee } from '../../api/endpoints';
import { KTable } from '../../components/KTable';
import { Button, Drawer, Form, Input, Modal, Select, Switch, Tag, message } from '../../custom-ui';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';
import { derivePromotionStatus, promotionExportRows, promotionMetrics, type PromotionRecord, type PromotionStatus } from './promotionRules';

type OrgUnit = { key: string; name: string; code?: string; status?: string };

const currentDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const money = (value: number) => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
const statusColor: Record<PromotionStatus, string> = {
  'Nháp': 'default', 'Đang hoạt động': 'success', 'Tạm dừng': 'warning', 'Đã kết thúc': 'error',
};

const columnDefinitions = [
  { title: 'Mã chương trình', dataIndex: 'code', key: 'code', width: 140, render: (value: string) => <strong style={{ color: '#00796B' }}>{value}</strong> },
  { title: 'Tên chương trình', dataIndex: 'name', key: 'name', render: (value: string) => <strong>{value}</strong> },
  { title: 'Thời gian', key: 'dates', width: 190, render: (_: unknown, row: PromotionRecord) => `${row.startDate} → ${row.endDate}` },
  { title: 'Loại', dataIndex: 'promotionType', key: 'promotionType', width: 125 },
  { title: 'Điều kiện', key: 'condition', width: 170, render: (_: unknown, row: PromotionRecord) => row.minimumSubtotal ? `Từ ${money(row.minimumSubtotal)}` : 'Không giới hạn' },
];

export const PromotionsModule: React.FC = () => {
  const [records, setRecords] = useState<PromotionRecord[]>([]);
  const [customers, setCustomers] = useState<CrmContact[]>([]);
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PromotionStatus | 'all'>('all');
  const [visibleKeys, setVisibleKeys] = useState<string[]>(columnDefinitions.map((column) => column.key));
  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState<PromotionRecord | null>(null);
  const [selected, setSelected] = useState<PromotionRecord | null>(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [campaigns, customerResponse, employeeResponse, orgResponse] = await Promise.all([
        crmPromotionsApi.getAll(),
        crmContactsApi.getAll('customer'),
        employeesApi.getAll(),
        collectionsApi.get<OrgUnit>('business_org_units', { limit: 500, sort: 'name', order: 'asc' }),
      ]);
      setRecords(campaigns.data.data || []);
      setCustomers((customerResponse.data.data || []).filter((item) => !String(item.status).toLocaleLowerCase().includes('tạm')));
      setEmployees((employeeResponse.data.data || []).filter((item) => item.isActive && item.status !== 'Đã nghỉ việc'));
      setOrgUnits((orgResponse.data.data || []).filter((item) => !String(item.status || '').toLocaleLowerCase().includes('ngừng')));
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được dữ liệu chương trình hoặc danh mục liên quan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const today = currentDate();
  const metrics = promotionMetrics(records, today);
  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();
    return records.filter((record) => {
      const status = derivePromotionStatus(record, today);
      return (statusFilter === 'all' || status === statusFilter)
        && (!keyword || `${record.code} ${record.name} ${record.target}`.toLocaleLowerCase().includes(keyword));
    });
  }, [records, search, statusFilter, today]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      startDate: today, endDate: today, promotionType: 'Chiết khấu', target: 'Tất cả khách hàng', enabled: false,
      allowConcurrent: false, eligibleItemCodes: [], amountBasis: 'Thành tiền trước thuế', orgUnitKeys: [],
      employeeIds: [], applyOnce: false, combinablePromotionKeys: [], taxCondition: 'Bất kỳ', minimumSubtotal: 0,
      unitPrice: 0, unit: 'đơn hàng', customerKeys: [], discountKind: 'Phần trăm', discountValue: 0,
    });
    setFormOpen(true);
  };

  const openEdit = (record: PromotionRecord) => {
    if (derivePromotionStatus(record, today) === 'Đã kết thúc') {
      message.warning('Chương trình đã kết thúc và được lưu để bảo toàn lịch sử.');
      return;
    }
    setEditing(record);
    form.setFieldsValue({ ...record });
    setFormOpen(true);
  };

  const save = async (values: Record<string, any>) => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        key: editing?.key || crypto.randomUUID(),
        code: String(values.code || '').trim(),
        name: String(values.name || '').trim(),
        startDate: String(values.startDate || ''), endDate: String(values.endDate || ''),
        promotionType: values.promotionType, target: String(values.target || '').trim(),
        enabled: values.enabled === true, allowConcurrent: values.allowConcurrent === true,
        eligibleItemCodes: values.eligibleItemCodes || [], amountBasis: values.amountBasis,
        orgUnitKeys: values.orgUnitKeys || [], employeeIds: values.employeeIds || [],
        applyOnce: values.applyOnce === true, combinablePromotionKeys: values.allowConcurrent ? (values.combinablePromotionKeys || []) : [],
        taxCondition: values.taxCondition, minimumSubtotal: Number(values.minimumSubtotal || 0),
        unitPrice: Number(values.unitPrice || 0), unit: String(values.unit || '').trim(),
        customerKeys: values.customerKeys || [], discountKind: values.discountKind,
        discountValue: Number(values.discountValue || 0),
      };
      const response = editing
        ? await crmPromotionsApi.update(editing.key, payload)
        : await crmPromotionsApi.create(payload);
      const saved = response.data.record;
      setSelected(saved);
      setFormOpen(false);
      setEditing(null);
      form.resetFields();
      await loadData();
      message.success(editing ? 'Đã cập nhật chương trình khuyến mại.' : 'Đã tạo chương trình khuyến mại.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu chương trình khuyến mại.');
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (record: PromotionRecord) => {
    const status = derivePromotionStatus(record, today);
    if (status === 'Đã kết thúc') return;
    try {
      const response = await crmPromotionsApi.update(record.key, { enabled: !record.enabled });
      setRecords((current) => current.map((item) => item.key === record.key ? response.data.record : item));
      if (selected?.key === record.key) setSelected(response.data.record);
      message.success(response.data.record.enabled ? 'Đã bật chương trình.' : 'Đã tạm dừng chương trình.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể đổi trạng thái chương trình.');
    }
  };

  const columns = [
    ...columnDefinitions.filter((column) => visibleKeys.includes(column.key)),
    {
      title: 'Trạng thái', key: 'status', width: 140,
      render: (_: unknown, row: PromotionRecord) => {
        const status = derivePromotionStatus(row, today);
        return <Tag color={statusColor[status]}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác', key: 'actions', width: 190,
      render: (_: unknown, row: PromotionRecord) => {
        const status = derivePromotionStatus(row, today);
        return <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => { setSelected(row); setDetailOpen(true); }}>Chi tiết</Button>
          {status !== 'Đã kết thúc' && <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>Sửa</Button>}
          {status !== 'Đã kết thúc' && <Button size="small" icon={row.enabled ? <PauseCircleOutlined /> : <PlayCircleOutlined />} onClick={() => void toggleEnabled(row)}>{row.enabled ? 'Tạm dừng' : 'Kích hoạt'}</Button>}
        </div>;
      },
    },
  ];

  const exportFiltered = () => downloadFile('Danh_sach_chuong_trinh_khuyen_mai.xlsx', generateValidXlsxBlob(promotionExportRows(filtered, today)));

  const promotionOptions = records.filter((item) => item.enabled && item.key !== editing?.key)
    .map((item) => ({ value: item.key, label: `${item.code} · ${item.name}` }));
  const customerOptions = customers.map((item) => ({ value: item.key, label: `${item.code} · ${item.name}` }));
  const employeeOptions = employees.map((item) => ({ value: item.id, label: `${item.employeeCode || item.code} · ${item.name}` }));
  const orgOptions = orgUnits.map((item) => ({ value: item.key, label: `${item.code ? `${item.code} · ` : ''}${item.name}` }));

  return <div aria-busy={loading} style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <div>
        <h1 style={{ margin: 0, color: '#0F172A', fontSize: 20 }}>Chương trình khuyến mại</h1>
        <div style={{ marginTop: 4, color: '#64748B', fontSize: 13 }}>Quản lý điều kiện, đối tượng và thời hạn áp dụng.</div>
      </div>
      <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>Làm mới</Button>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
      {[
        ['Tổng chương trình', metrics.total, '#009688'], ['Đang hoạt động', metrics.active, '#16A34A'],
        ['Sắp bắt đầu', metrics.scheduled, '#2563EB'], ['Đã kết thúc', metrics.ended, '#64748B'],
      ].map(([label, value, color]) => <div key={String(label)} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#FFFFFF' }}>
        <div style={{ fontSize: 12, color: '#64748B' }}>{label}</div><strong style={{ color: String(color), fontSize: 22 }}>{value}</strong>
      </div>)}
    </div>

    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Input prefix={<SearchOutlined />} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã, tên, đối tượng" allowClear style={{ width: 260 }} />
        <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 170 }} options={[
          { value: 'all', label: 'Tất cả trạng thái' }, ...(['Nháp', 'Đang hoạt động', 'Tạm dừng', 'Đã kết thúc'] as PromotionStatus[]).map((value) => ({ value, label: value })),
        ]} />
        <Select mode="multiple" value={visibleKeys} onChange={setVisibleKeys} style={{ width: 210 }} maxTagCount={1} placeholder="Chọn cột hiển thị" options={columnDefinitions.map((column) => ({ value: column.key, label: column.title }))} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button icon={<DownloadOutlined />} disabled={loading || !filtered.length} onClick={exportFiltered}>Xuất Excel</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Thêm chương trình</Button>
      </div>
    </div>

    <div className="transparent-table-card">
      <KTable dataSource={filtered} columns={columns} loading={loading} rowKey="key" pagination={{ pageSize: 10 }} locale={{ emptyText: 'Chưa có chương trình khuyến mại.' }} />
    </div>

    <Modal title={editing ? 'Cập nhật chương trình khuyến mại' : 'Thêm chương trình khuyến mại'} open={formOpen} onCancel={() => { setFormOpen(false); setEditing(null); }} footer={null} width={900}>
      <Form form={form} layout="vertical" onFinish={save} style={{ marginTop: 12, maxHeight: '72vh', overflowY: 'auto', paddingRight: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
          <Form.Item name="code" label="Mã chương trình" rules={[{ required: true, whitespace: true }]}><Input maxLength={80} /></Form.Item>
          <Form.Item name="name" label="Tên chương trình" rules={[{ required: true, whitespace: true }]}><Input maxLength={180} /></Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Form.Item name="startDate" label="Từ ngày" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          <Form.Item name="endDate" label="Đến ngày" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          <Form.Item name="promotionType" label="Loại khuyến mại" rules={[{ required: true }]}><Select options={['Chiết khấu', 'Tặng quà', 'Tích điểm'].map((value) => ({ value, label: value }))} /></Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="target" label="Đối tượng áp dụng" rules={[{ required: true, whitespace: true }]}><Input maxLength={180} /></Form.Item>
          <Form.Item name="amountBasis" label="Căn cứ khuyến mại" rules={[{ required: true }]}><Select options={['Thành tiền trước thuế', 'Thành tiền sau thuế'].map((value) => ({ value, label: value }))} /></Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="orgUnitKeys" label="Cơ cấu tổ chức"><Select mode="multiple" options={orgOptions} placeholder="Chọn đơn vị áp dụng" /></Form.Item>
          <Form.Item name="employeeIds" label="Nhân viên áp dụng"><Select mode="multiple" options={employeeOptions} placeholder="Chọn nhân viên" /></Form.Item>
        </div>
        <Form.Item name="eligibleItemCodes" label="Bộ quà hoặc hàng hóa áp dụng"><Select mode="tags" options={[]} placeholder="Nhập mã hàng hóa rồi nhấn Enter" /></Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="customerKeys" label="Khách hàng"><Select mode="multiple" options={customerOptions} placeholder="Để trống để không giới hạn khách hàng cụ thể" /></Form.Item>
          <Form.Item name="combinablePromotionKeys" label="Chương trình được áp dụng đồng thời"><Select mode="multiple" options={promotionOptions} placeholder="Chọn chương trình có thể kết hợp" /></Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Form.Item name="taxCondition" label="Điều kiện thuế" rules={[{ required: true }]}><Select options={['Bất kỳ', 'Có thuế', 'Không thuế'].map((value) => ({ value, label: value }))} /></Form.Item>
          <Form.Item name="minimumSubtotal" label="Điều kiện theo thành tiền"><Input type="number" min={0} step={1} /></Form.Item>
          <Form.Item name="unitPrice" label="Đơn giá áp dụng"><Input type="number" min={0} step={1} /></Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Form.Item name="discountKind" label="Kiểu chiết khấu" rules={[{ required: true }]}><Select options={['Phần trăm', 'Số tiền'].map((value) => ({ value, label: value }))} /></Form.Item>
          <Form.Item name="discountValue" label="Giá trị chiết khấu"><Input type="number" min={0} step={1} /></Form.Item>
          <Form.Item name="unit" label="Đơn vị"><Input maxLength={80} /></Form.Item>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', padding: '4px 0 12px' }}>
          <Form.Item name="enabled" label="Kích hoạt" valuePropName="checked"><Switch checkedChildren="Có" unCheckedChildren="Không" /></Form.Item>
          <Form.Item name="allowConcurrent" label="Áp dụng đồng thời khuyến mại khác" valuePropName="checked"><Switch checkedChildren="Có" unCheckedChildren="Không" /></Form.Item>
          <Form.Item name="applyOnce" label="Giới hạn sử dụng" valuePropName="checked"><Switch checkedChildren="Có" unCheckedChildren="Không" /></Form.Item>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <Button onClick={() => { setFormOpen(false); setEditing(null); }}>Hủy</Button>
          <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>{editing ? 'Lưu thay đổi' : 'Lưu chương trình'}</Button>
        </div>
      </Form>
    </Modal>

    <Drawer title="Chi tiết chương trình khuyến mại" open={detailOpen} onClose={() => setDetailOpen(false)} width={520}>
      {selected && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ padding: 14, border: '1px solid #E2E8F0', borderRadius: 8, background: '#F8FAFC' }}>
          <strong style={{ color: '#00796B' }}>{selected.code}</strong><h3 style={{ margin: '6px 0' }}>{selected.name}</h3>
          <Tag color={statusColor[derivePromotionStatus(selected, today)]}>{derivePromotionStatus(selected, today)}</Tag>
        </div>
        <div><strong>Thời gian:</strong> {selected.startDate} → {selected.endDate}</div>
        <div><strong>Loại:</strong> {selected.promotionType} · <strong>Đối tượng:</strong> {selected.target}</div>
        <div><strong>Giá trị:</strong> {selected.discountValue}{selected.discountKind === 'Phần trăm' ? '%' : ' ₫'} · <strong>Ngưỡng:</strong> {money(selected.minimumSubtotal)}</div>
        <div><strong>Căn cứ:</strong> {selected.amountBasis} · <strong>Điều kiện thuế:</strong> {selected.taxCondition}</div>
        <div><strong>Hàng hóa:</strong> {selected.eligibleItemCodes.join(', ') || 'Tất cả hàng hóa'}</div>
        <div><strong>Khách hàng:</strong> {selected.customerKeys.map((key) => customers.find((item) => item.key === key)?.name || key).join(', ') || 'Theo đối tượng đã cấu hình'}</div>
        <div><strong>Đơn vị áp dụng:</strong> {selected.orgUnitKeys.map((key) => orgUnits.find((item) => item.key === key)?.name || key).join(', ') || 'Toàn tổ chức'}</div>
        <div><strong>Nhân viên áp dụng:</strong> {selected.employeeIds.map((id) => employees.find((item) => item.id === id)?.name || id).join(', ') || 'Tất cả nhân viên'}</div>
        <div><strong>Chủ sở hữu:</strong> {selected.owner}</div>
        <div><strong>Áp dụng đồng thời:</strong> {selected.allowConcurrent ? 'Có' : 'Không'} · <strong>Chỉ áp dụng một lần:</strong> {selected.applyOnce ? 'Có' : 'Không'}</div>
        <Button icon={<EditOutlined />} onClick={() => { setDetailOpen(false); openEdit(selected); }}>Chỉnh sửa chương trình</Button>
      </div>}
    </Drawer>
  </div>;
};
