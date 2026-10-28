import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import {
  Button,
  Form,
  Input,
  Modal,
  Select,
  Tag,
  message,
} from '../../custom-ui';
import {
  collectionsApi,
  crmContactsApi,
  financePurchaseRequestsApi,
  type CrmContact,
  type FinancePurchaseRequest,
} from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import {
  aggregatePendingPurchaseItems,
  filterPurchaseRequests,
  PURCHASE_REQUEST_STATUSES,
} from './purchaseRequestRules';

type DepartmentOption = { key: string; name: string; status?: string; isActive?: boolean };
type ItemDraft = { itemName: string; unit: string; quantity: string; estimatedUnitPrice: string };

const emptyItem = (): ItemDraft => ({ itemName: '', unit: '', quantity: '1', estimatedUnitPrice: '0' });
const money = (value: number) => `${(Number(value) || 0).toLocaleString('vi-VN')} ₫`;
const businessDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16,
};

export const PurchaseRequestsModule: React.FC = () => {
  const mounted = useRef(false);
  const [requests, setRequests] = useState<FinancePurchaseRequest[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [suppliers, setSuppliers] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [year, setYear] = useState('all');
  const [status, setStatus] = useState('all');
  const [view, setView] = useState<'requests' | 'aggregate'>('requests');
  const [selectedKey, setSelectedKey] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [supplierTarget, setSupplierTarget] = useState<FinancePurchaseRequest | null>(null);
  const [supplierKey, setSupplierKey] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    const [requestResult, departmentResult, supplierResult] = await Promise.allSettled([
      dataService.refreshGenericData('finance_purchase_requests'),
      collectionsApi.get<DepartmentOption>('business_org_units', { limit: 500, sort: 'name', order: 'asc' }),
      crmContactsApi.getAll('supplier'),
    ]);
    if (mounted.current) {
      if (requestResult.status === 'fulfilled') setRequests(requestResult.value as FinancePurchaseRequest[]);
      else message.error((requestResult.reason as any)?.response?.data?.message || 'Không tải được yêu cầu mua sắm.');
      if (departmentResult.status === 'fulfilled') {
        setDepartments((departmentResult.value.data.data || []).filter((item) => item.isActive !== false && !/tạm|ngừng|dừng|không hoạt động|inactive/i.test(String(item.status || ''))));
      } else message.error((departmentResult.reason as any)?.response?.data?.message || 'Không tải được danh sách đơn vị.');
      if (supplierResult.status === 'fulfilled') {
        setSuppliers((supplierResult.value.data.data || []).filter((item) => !/tạm|ngừng|dừng|không hoạt động|inactive/i.test(String(item.status || ''))));
      } else message.error((supplierResult.reason as any)?.response?.data?.message || 'Không tải được nhà cung cấp.');
      setLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    void loadData();
    return () => { mounted.current = false; };
  }, []);

  const filteredRequests = useMemo(() => filterPurchaseRequests(requests, {
    query: searchText, year, status,
  }), [requests, searchText, year, status]);
  const pendingRequests = filteredRequests.filter((request) => request.status === 'Chờ xác định nhà cung cấp');
  const aggregateItems = useMemo(() => aggregatePendingPurchaseItems(pendingRequests), [pendingRequests]);
  const selectedRequest = requests.find((request) => request.key === selectedKey) || null;
  const years = [...new Set(requests.map((request) => request.requestDate.slice(0, 4)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  const pendingCount = requests.filter((request) => request.status === 'Chờ xác định nhà cung cấp').length;
  const selectedCount = requests.filter((request) => request.status === 'Đã xác định nhà cung cấp').length;
  const estimatedAmount = requests.reduce((sum, request) => sum + (Number(request.estimatedTotal) || 0), 0);

  const changeItem = (index: number, field: keyof ItemDraft, value: string) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  };

  const handleCreate = async (values: any) => {
    const normalizedItems = items.map((item) => ({
      itemName: item.itemName.trim(),
      unit: item.unit.trim(),
      quantity: Number(item.quantity),
      estimatedUnitPrice: Number(item.estimatedUnitPrice),
    }));
    if (normalizedItems.some((item) => !item.itemName || !item.unit || !Number.isSafeInteger(item.quantity) || item.quantity <= 0
      || !Number.isSafeInteger(item.estimatedUnitPrice) || item.estimatedUnitPrice < 0)) {
      message.error('Vui lòng nhập tên hàng, đơn vị tính, số lượng nguyên dương và đơn giá dự kiến hợp lệ cho từng dòng.');
      return;
    }
    setSaving(true);
    try {
      const response = await financePurchaseRequestsApi.create({
        departmentKey: values.departmentKey,
        deliveryDeadline: values.deliveryDeadline,
        purpose: values.purpose,
        notes: values.notes || '',
        items: normalizedItems,
      });
      message.success(`Đã lưu yêu cầu ${response.data.record.requestNumber}.`);
      setCreateOpen(false);
      form.resetFields();
      setItems([emptyItem()]);
      setSelectedKey(response.data.record.key);
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu yêu cầu mua sắm.');
    } finally {
      setSaving(false);
    }
  };

  const handleDetermineSupplier = async () => {
    if (!supplierTarget || !supplierKey) {
      message.error('Vui lòng chọn nhà cung cấp.');
      return;
    }
    setSaving(true);
    try {
      const response = await financePurchaseRequestsApi.determineSupplier(supplierTarget.key, supplierKey);
      setSupplierTarget(null);
      setSupplierKey('');
      setSelectedKey(response.data.record.key);
      message.success(`Đã xác định nhà cung cấp cho ${response.data.record.requestNumber}.`);
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể xác định nhà cung cấp.');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Số yêu cầu', dataIndex: 'requestNumber', key: 'requestNumber', width: 155,
      render: (value: string) => <strong style={{ color: '#009688' }}>{value}</strong>,
    },
    {
      title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 205,
      render: (value: string) => <Tag color={value === 'Đã xác định nhà cung cấp' ? 'success' : 'warning'}>{value}</Tag>,
    },
    { title: 'Đơn vị yêu cầu', dataIndex: 'departmentName', key: 'departmentName', width: 160 },
    { title: 'Người yêu cầu', dataIndex: 'requester', key: 'requester', width: 145 },
    { title: 'Hạn giao hàng', dataIndex: 'deliveryDeadline', key: 'deliveryDeadline', width: 125 },
    {
      title: 'Mục đích mua sắm', dataIndex: 'purpose', key: 'purpose', ellipsis: true,
      render: (value: string) => <span title={value}>{value}</span>,
    },
    { title: 'Ngày yêu cầu', dataIndex: 'requestDate', key: 'requestDate', width: 115 },
    {
      title: 'Chức năng', key: 'actions', width: 220,
      render: (_: unknown, record: FinancePurchaseRequest) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setSelectedKey(record.key)}>Chi tiết</Button>
          {record.status === 'Chờ xác định nhà cung cấp' && (
            <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => { setSupplierTarget(record); setSupplierKey(''); }}>
              Xác định NCC
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', color: '#0F172A', fontSize: 20 }}>Yêu cầu mua sắm</h2>
          <div style={{ color: '#64748B', fontSize: 13 }}>Theo dõi nhu cầu mua sắm và tổng hợp để xác định nhà cung cấp.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>Làm mới</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ deliveryDeadline: businessDate() }); setItems([emptyItem()]); setCreateOpen(true); }} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
            Tạo yêu cầu
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 14 }}>
        <div style={cardStyle}>
          <div style={{ color: '#64748B', fontSize: 12.5 }}>Tổng yêu cầu</div>
          <div style={{ marginTop: 4, fontSize: 22, fontWeight: 800, color: '#0F172A' }}>{requests.length}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#64748B', fontSize: 12.5 }}>Chờ xác định nhà cung cấp</div>
          <div style={{ marginTop: 4, fontSize: 22, fontWeight: 800, color: '#D97706' }}>{pendingCount}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#64748B', fontSize: 12.5 }}>Đã xác định nhà cung cấp</div>
          <div style={{ marginTop: 4, fontSize: 22, fontWeight: 800, color: '#059669' }}>{selectedCount}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#64748B', fontSize: 12.5 }}>Tổng giá trị dự kiến</div>
          <div style={{ marginTop: 4, fontSize: 22, fontWeight: 800, color: '#0F172A' }}>{money(estimatedAmount)}</div>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <Button type={view === 'requests' ? 'primary' : 'default'} onClick={() => setView('requests')} style={view === 'requests' ? { backgroundColor: '#009688', borderColor: '#009688' } : undefined}>
            Yêu cầu mua sắm
          </Button>
          <Button type={view === 'aggregate' ? 'primary' : 'default'} icon={<TeamOutlined />} onClick={() => setView('aggregate')} style={view === 'aggregate' ? { backgroundColor: '#009688', borderColor: '#009688' } : undefined}>
            Tổng hợp yêu cầu và xác định nhà cung cấp
          </Button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm số yêu cầu, đơn vị, người yêu cầu, mục đích, mặt hàng..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            allowClear
            style={{ width: 360, maxWidth: '100%' }}
          />
          <Select value={year} onChange={setYear} style={{ width: 140 }} options={[
            { label: 'Tất cả năm', value: 'all' }, ...years.map((item) => ({ label: item, value: item })),
          ]} />
          <Select value={status} onChange={setStatus} style={{ width: 225 }} options={[
            { label: 'Tất cả trạng thái', value: 'all' }, ...PURCHASE_REQUEST_STATUSES.map((item) => ({ label: item, value: item })),
          ]} />
        </div>
      </div>

      {view === 'aggregate' && (
        <div style={{ ...cardStyle, marginBottom: 12 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#0F172A' }}>Tổng hợp yêu cầu chưa xác định nhà cung cấp</h3>
          <div style={{ marginBottom: 12, color: '#64748B', fontSize: 13 }}>Các dòng có cùng tên hàng hóa/dịch vụ và đơn vị tính được cộng gộp từ kết quả lọc hiện tại.</div>
          <KTable
            dataSource={aggregateItems.map((item) => ({ ...item, key: `${item.itemName}|${item.unit}` }))}
            columns={[
              { title: 'Hàng hóa / dịch vụ', dataIndex: 'itemName', key: 'itemName' },
              { title: 'Đơn vị tính', dataIndex: 'unit', key: 'unit', width: 120 },
              { title: 'Số yêu cầu', dataIndex: 'requestCount', key: 'requestCount', width: 120 },
              { title: 'Tổng số lượng', dataIndex: 'quantity', key: 'quantity', width: 140 },
              { title: 'Tổng giá trị dự kiến', dataIndex: 'estimatedTotal', key: 'estimatedTotal', width: 190, render: (value: number) => money(value) },
            ]}
            pagination={false}
            locale={{ emptyText: 'Không có mặt hàng nào đang chờ tổng hợp.' }}
          />
        </div>
      )}

      <div className="transparent-table-card">
        <KTable
          dataSource={(view === 'aggregate' ? pendingRequests : filteredRequests).map((item) => ({ ...item, key: item.key }))}
          columns={columns}
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'Chưa có yêu cầu mua sắm phù hợp.' }}
        />
      </div>

      {selectedRequest && (
        <section style={{ ...cardStyle, marginTop: 14 }} aria-label="Chi tiết yêu cầu mua sắm">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: '0 0 5px', color: '#0F172A', fontSize: 16 }}>Chi tiết {selectedRequest.requestNumber}</h3>
              <Tag color={selectedRequest.status === 'Đã xác định nhà cung cấp' ? 'success' : 'warning'}>{selectedRequest.status}</Tag>
            </div>
            <Button onClick={() => setSelectedKey('')}>Đóng chi tiết</Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 14 }}>
            <div><div style={{ color: '#64748B', fontSize: 12 }}>Đơn vị yêu cầu</div><strong>{selectedRequest.departmentName}</strong></div>
            <div><div style={{ color: '#64748B', fontSize: 12 }}>Người yêu cầu</div><strong>{selectedRequest.requester}</strong></div>
            <div><div style={{ color: '#64748B', fontSize: 12 }}>Hạn giao hàng</div><strong>{selectedRequest.deliveryDeadline}</strong></div>
            <div><div style={{ color: '#64748B', fontSize: 12 }}>Ngày yêu cầu</div><strong>{selectedRequest.requestDate}</strong></div>
            <div><div style={{ color: '#64748B', fontSize: 12 }}>Nhà cung cấp</div><strong>{selectedRequest.supplierName || 'Chưa xác định'}</strong></div>
            <div><div style={{ color: '#64748B', fontSize: 12 }}>Tổng giá trị dự kiến</div><strong>{money(selectedRequest.estimatedTotal)}</strong></div>
          </div>
          <div style={{ marginBottom: 10 }}><span style={{ color: '#64748B' }}>Mục đích mua sắm: </span><strong>{selectedRequest.purpose}</strong></div>
          {selectedRequest.notes && <div style={{ marginBottom: 10 }}><span style={{ color: '#64748B' }}>Ghi chú: </span>{selectedRequest.notes}</div>}
          <KTable
            dataSource={selectedRequest.items.map((item) => ({ ...item, key: `${selectedRequest.key}-${item.lineNumber}` }))}
            columns={[
              { title: 'Hàng hóa / dịch vụ', dataIndex: 'itemName', key: 'itemName' },
              { title: 'Đơn vị tính', dataIndex: 'unit', key: 'unit', width: 110 },
              { title: 'Số lượng', dataIndex: 'quantity', key: 'quantity', width: 100 },
              { title: 'Đơn giá dự kiến', dataIndex: 'estimatedUnitPrice', key: 'estimatedUnitPrice', width: 160, render: (value: number) => money(value) },
              { title: 'Thành tiền dự kiến', dataIndex: 'lineTotal', key: 'lineTotal', width: 180, render: (value: number) => money(value) },
            ]}
            pagination={false}
          />
          <div style={{ marginTop: 14 }}>
            <strong style={{ display: 'block', marginBottom: 8 }}>Lịch sử xử lý</strong>
            {selectedRequest.history.map((entry, index) => (
              <div key={`${entry.at}-${index}`} style={{ padding: '7px 0', borderTop: '1px solid #E2E8F0', fontSize: 13 }}>
                <strong>{entry.action}</strong> · {entry.actor} · {new Date(entry.at).toLocaleString('vi-VN')}{entry.detail ? ` · ${entry.detail}` : ''}
              </div>
            ))}
          </div>
        </section>
      )}

      <Modal title="Tạo yêu cầu mua sắm" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null} width={760}>
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 14 }}>
            <Form.Item name="departmentKey" label="Đơn vị yêu cầu" rules={[{ required: true, message: 'Vui lòng chọn đơn vị yêu cầu.' }]}>
              <Select placeholder="Chọn đơn vị" options={departments.map((item) => ({ label: item.name, value: item.key }))} />
            </Form.Item>
            <Form.Item name="deliveryDeadline" label="Hạn giao hàng" rules={[{ required: true, message: 'Vui lòng chọn hạn giao hàng.' }]}>
              <Input type="date" />
            </Form.Item>
          </div>
          <Form.Item name="purpose" label="Mục đích mua sắm" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập mục đích mua sắm.' }]}>
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            <strong>Hàng hóa / dịch vụ cần mua</strong>
            <Button size="small" icon={<PlusOutlined />} onClick={() => setItems((current) => [...current, emptyItem()])}>Thêm dòng</Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {items.map((item, index) => (
              <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 2.2fr) minmax(80px, .8fr) minmax(82px, .8fr) minmax(130px, 1.2fr) 32px', gap: 4, alignItems: 'center' }}>
                <Input aria-label={`Tên hàng hóa ${index + 1}`} placeholder="Tên hàng hóa / dịch vụ" value={item.itemName} onChange={(event) => changeItem(index, 'itemName', event.target.value)} />
                <Input aria-label={`Đơn vị tính ${index + 1}`} placeholder="Đơn vị" value={item.unit} onChange={(event) => changeItem(index, 'unit', event.target.value)} />
                <Input aria-label={`Số lượng ${index + 1}`} type="number" min={1} step={1} placeholder="Số lượng" value={item.quantity} onChange={(event) => changeItem(index, 'quantity', event.target.value)} />
                <Input aria-label={`Đơn giá dự kiến ${index + 1}`} type="number" min={0} step={1} placeholder="Đơn giá dự kiến" value={item.estimatedUnitPrice} onChange={(event) => changeItem(index, 'estimatedUnitPrice', event.target.value)} />
                <Button aria-label={`Xóa dòng ${index + 1}`} disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</Button>
              </div>
            ))}
          </div>
          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Button onClick={() => setCreateOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu yêu cầu</Button>
          </div>
        </Form>
      </Modal>

      <Modal title={`Xác định nhà cung cấp · ${supplierTarget?.requestNumber || ''}`} open={!!supplierTarget} onCancel={() => setSupplierTarget(null)} footer={null} width={520}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
          <div style={{ color: '#64748B' }}>Chọn nhà cung cấp đang hoạt động từ danh bạ để lưu kết quả tổng hợp yêu cầu.</div>
          <Select
            showSearch
            placeholder="Chọn nhà cung cấp"
            value={supplierKey || undefined}
            onChange={setSupplierKey}
            options={suppliers.map((supplier) => ({ value: supplier.key, label: `${supplier.code} · ${supplier.name}` }))}
          />
          {suppliers.length === 0 && <div style={{ color: '#B45309', fontSize: 13 }}>Hãy thêm nhà cung cấp trong Danh bạ trước khi xác định nhà cung cấp.</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setSupplierTarget(null)}>Hủy</Button>
            <Button type="primary" icon={<CheckOutlined />} loading={saving} disabled={!supplierKey} onClick={() => void handleDetermineSupplier()} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận nhà cung cấp
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
