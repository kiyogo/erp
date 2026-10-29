import React, { useEffect, useMemo, useState } from 'react';
import {
  ApartmentOutlined,
  BuildOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Tabs, Checkbox } from '../../custom-ui';
import { CrmContact, CrmContactType, crmContactsApi, collectionsApi } from '../../api/endpoints';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';
import { useNavigate } from 'react-router-dom';
import { crmContactExportRows } from './crmContactExports';

type ContactFilter = CrmContactType | 'all';

const formatMoney = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;

const typeMeta: Record<CrmContactType, { label: string; title: string; icon: React.ReactNode; accent: string }> = {
  customer: { label: 'Khách hàng', title: 'Khách hàng & công nợ phải thu', icon: <UserOutlined />, accent: '#16A34A' },
  supplier: { label: 'Nhà cung cấp', title: 'Nhà cung cấp & công nợ phải trả', icon: <ShopOutlined />, accent: '#2563EB' },
  partner: { label: 'Đối tác', title: 'Đối tác phân phối', icon: <ApartmentOutlined />, accent: '#7C3AED' },
};

const statusOptions = [
  { label: 'Đang hoạt động', value: 'Đang hoạt động' },
  { label: 'Đang hợp tác', value: 'Đang hợp tác' },
  { label: 'Tạm dừng', value: 'Tạm dừng' },
];

export const CRMContactsModule: React.FC<{ type?: ContactFilter; createDialogOpen?: boolean; onCreateDialogClose?: () => void; onCreated?: (contact: CrmContact) => void }> = ({ type = 'all', createDialogOpen, onCreateDialogClose, onCreated }) => {
  const navigate = useNavigate();
  const [data, setData] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<ContactFilter>(type);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<CrmContact | null>(null);
  const [editingContact, setEditingContact] = useState<CrmContact | null>(null);
  const [form] = Form.useForm();
  const [bankRows, setBankRows] = useState<Array<{ accountNumber: string; bankName: string; branch: string; province: string }>>([]);
  const [addressRows, setAddressRows] = useState<string[]>([]);
  const [customRows, setCustomRows] = useState<Array<{ name: string; value: string }>>([]);
  const [paymentTerms, setPaymentTerms] = useState<Array<{ key: string; code: string; name: string; creditDays: number; discountDays: number; discountRate: number }>>([]);
  const [paymentTermOpen, setPaymentTermOpen] = useState(false);
  const [paymentTermForm] = Form.useForm();

  useEffect(() => {
    setTypeFilter(type);
  }, [type]);

  useEffect(() => {
    if (!createDialogOpen) return;
    setEditingContact(null);
    form.resetFields();
    setBankRows([]);
    setAddressRows([]);
    setCustomRows(Array.from({ length: 5 }, (_, index) => ({ name: `Trường mở rộng ${index + 1}`, value: '' })));
    form.setFieldsValue({ type: type === 'all' ? 'customer' : type, status: 'Đang hoạt động', debtBalance: 0, totalValue: 0, creditLimit: 0 });
    setModalOpen(true);
  }, [createDialogOpen, type]);

  const closeContactDialog = () => { setModalOpen(false); setEditingContact(null); onCreateDialogClose?.(); };

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await crmContactsApi.getAll(type === 'all' ? undefined : type);
      setData(response.data.data);
    } catch (error: any) {
      setData([]);
      message.error(error?.response?.data?.message || 'Không tải được danh sách đối tác.');
    } finally {
      setLoading(false);
    }
  };

  const loadPaymentTerms = async () => {
    try {
      const response = await collectionsApi.get<{ key: string; code: string; name: string; creditDays: number; discountDays: number; discountRate: number }>('crm_payment_terms', { limit: 500 });
      setPaymentTerms(response.data.data);
    } catch { setPaymentTerms([]); }
  };

  useEffect(() => {
    void loadData();
    void loadPaymentTerms();
  }, [type]);

  const savePaymentTerm = async (values: any) => {
    const term = { key: crypto.randomUUID(), code: String(values.code).trim(), name: String(values.name).trim(), creditDays: Number(values.creditDays) || 0, discountDays: Number(values.discountDays) || 0, discountRate: Number(values.discountRate) || 0 };
    if (paymentTerms.some(item => item.code.toLowerCase() === term.code.toLowerCase())) { message.error('Mã điều khoản thanh toán đã tồn tại.'); return; }
    try {
      await collectionsApi.create('crm_payment_terms', term, term.key);
      setPaymentTerms(current => [...current, term]);
      form.setFieldsValue({ details: { ...form.getFieldValue('details'), paymentTerm: term.code, creditDays: term.creditDays } });
      paymentTermForm.resetFields();
      setPaymentTermOpen(false);
      message.success('Đã thêm điều khoản thanh toán.');
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể thêm điều khoản thanh toán.'); }
  };

  const visibleData = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return data.filter((item) => {
      const matchType = typeFilter === 'all' || item.type === typeFilter;
      const matchSearch =
        !keyword ||
        (item.code || '').toLowerCase().includes(keyword) ||
        (item.name || '').toLowerCase().includes(keyword) ||
        (item.taxCode || '').toLowerCase().includes(keyword) ||
        (item.contactPerson || '').toLowerCase().includes(keyword) ||
        (item.phone || '').toLowerCase().includes(keyword) ||
        (item.email || '').toLowerCase().includes(keyword);
      return matchType && matchSearch;
    });
  }, [data, searchText, typeFilter]);

  const totalValue = visibleData.reduce((sum, item) => sum + item.totalValue, 0);
  const totalDebt = visibleData.reduce((sum, item) => sum + item.debtBalance, 0);
  const activeCount = visibleData.filter((item) => !item.status.includes('Tạm')).length;
  const pageTitle = type === 'all' ? 'Khách hàng & đối tác' : typeMeta[type].title;

  const handleSave = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const fields = {
        name: values.name,
        taxCode: values.taxCode || '',
        industry: values.industry || '',
        contactPerson: values.contactPerson || '',
        phone: values.phone || '',
        email: values.email || '',
        address: values.address || '',
        bankAccount: values.bankAccount || '',
        details: {
          ...(values.details || {}),
          bankAccounts: bankRows.filter(row => row.accountNumber || row.bankName || row.branch || row.province),
          addresses: addressRows.filter(Boolean),
          customFields: customRows,
        },
        creditLimit: Number(values.creditLimit) || 0,
        totalValue: Number(values.totalValue) || 0,
        debtBalance: Number(values.debtBalance) || 0,
        tier: values.tier || 'Tiêu chuẩn',
        accountManager: values.accountManager || '',
        status: values.status || 'Đang hoạt động',
      };
      if (editingContact) {
        const response = await crmContactsApi.update(editingContact.key, fields);
        setSelectedContact(response.data.contact);
        message.success('Đã cập nhật hồ sơ đối tác.');
      } else {
        const response = await crmContactsApi.create({ ...fields, type: values.type });
        onCreated?.(response.data.contact);
        const createdTypeLabel = typeMeta[values.type as CrmContactType]?.label.toLowerCase() || 'đối tác';
        message.success(`Đã lưu ${createdTypeLabel} vào dữ liệu hệ thống.`);
      }
      closeContactDialog();
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu hồ sơ đối tác.');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (contact: CrmContact) => {
    setEditingContact(contact);
    form.setFieldsValue({ ...contact });
    setBankRows(contact.details?.bankAccounts?.length ? contact.details.bankAccounts.map(row => ({ ...row })) : []);
    setAddressRows(contact.details?.addresses?.length ? [...contact.details.addresses] : []);
    setCustomRows(contact.details?.customFields?.length ? contact.details.customFields.map(row => ({ ...row })) : Array.from({ length: 5 }, (_, index) => ({ name: `Trường mở rộng ${index + 1}`, value: '' })));
    setDrawerOpen(false);
    setModalOpen(true);
  };

  const exportContacts = () => downloadFile('Danh_ba_khach_hang_doi_tac.xlsx', generateValidXlsxBlob(crmContactExportRows(visibleData)));

  const columns = [
    {
      title: 'Mã & loại',
      key: 'code',
      width: 150,
      render: (_: any, record: CrmContact) => (
        <div>
          <div style={{ fontWeight: 700, color: typeMeta[record.type].accent, display: 'flex', alignItems: 'center', gap: 6 }}>
            {typeMeta[record.type].icon} {record.code}
          </div>
          <Tag color={record.type === 'customer' ? 'success' : record.type === 'supplier' ? 'blue' : 'purple'} style={{ marginTop: 3 }}>
            {typeMeta[record.type].label}
          </Tag>
        </div>
      ),
    },
    {
      title: 'Tên đối tác & liên hệ',
      key: 'name',
      render: (_: any, record: CrmContact) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A' }}>{record.name}</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>
            {record.contactPerson || 'Chưa có người liên hệ'} · {record.phone || 'Chưa có SĐT'}
          </div>
        </div>
      ),
    },
    { title: 'MST', dataIndex: 'taxCode', key: 'taxCode', width: 120, render: (value: string) => value || 'Chưa nhập' },
    { title: 'Ngành/Lĩnh vực', dataIndex: 'industry', key: 'industry', render: (value: string) => value || 'Chưa nhập' },
    { title: 'Giá trị giao dịch', dataIndex: 'totalValue', key: 'totalValue', width: 155, render: (value: number) => <strong>{formatMoney(value)}</strong> },
    { title: 'Công nợ', dataIndex: 'debtBalance', key: 'debtBalance', width: 140, render: (value: number) => <strong style={{ color: value > 0 ? '#DC2626' : '#64748B' }}>{formatMoney(value)}</strong> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 130, render: (value: string) => <Tag color={value.includes('Tạm') ? 'error' : 'success'}>{value}</Tag> },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 90,
      render: (_: any, record: CrmContact) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => { setSelectedContact(record); setDrawerOpen(true); }}>
          Xem
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: onCreateDialogClose ? 0 : '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {!onCreateDialogClose && <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: '#0F172A' }}>{pageTitle}</h1>
          <div style={{ marginTop: 4, color: '#64748B', fontSize: 13 }}>
            Dữ liệu lưu qua backend, dùng chung cho CRM, bán/mua hàng và công nợ.
          </div>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>Làm mới</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Tổng bản ghi</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>{visibleData.length}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Đang hoạt động</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{activeCount}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Giá trị giao dịch</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>{formatMoney(totalValue)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Công nợ hiện tại</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: totalDebt > 0 ? '#DC2626' : '#64748B', marginTop: 4 }}>{formatMoney(totalDebt)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {type === 'all' && (
            <Select
              value={typeFilter}
              onChange={(value) => setTypeFilter(value)}
              style={{ width: 170 }}
              options={[
                { label: 'Tất cả', value: 'all' },
                { label: 'Khách hàng', value: 'customer' },
                { label: 'Nhà cung cấp', value: 'supplier' },
                { label: 'Đối tác', value: 'partner' },
              ]}
            />
          )}
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm mã, tên, MST, liên hệ..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            style={{ width: 300 }}
            allowClear
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button disabled={!visibleData.length} onClick={exportContacts}>Xuất Excel</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingContact(null);
              form.resetFields();
              setBankRows([]);
              setAddressRows([]);
              setCustomRows(Array.from({ length: 5 }, (_, index) => ({ name: `Trường mở rộng ${index + 1}`, value: '' })));
              form.setFieldsValue({ type: type === 'all' ? 'customer' : type, status: 'Đang hoạt động', debtBalance: 0, totalValue: 0, creditLimit: 0 });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm mới
          </Button>
        </div>
      </div>

      <div className="transparent-table-card">
        <KTable dataSource={visibleData} columns={columns} loading={loading} pagination={{ pageSize: 10 }} locale={{ emptyText: 'Chưa có dữ liệu đối tác.' }} />
      </div>

      </>}
      <Modal title={editingContact ? 'Cập nhật đối tác' : 'Thông tin khách hàng'} open={modalOpen} onCancel={closeContactDialog} footer={null} width="min(1120px, calc(100vw - 32px))">
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1.1fr) minmax(220px, 1fr) minmax(260px, 1fr)', gap: 14, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Form.Item name={['details', 'entityKind']} initialValue="organization" style={{ marginBottom: 0, flex: 1 }}>
                <Select options={[{ label: 'Tổ chức', value: 'organization' }, { label: 'Cá nhân', value: 'person' }]} />
              </Form.Item>
              <Form.Item name="type" rules={[{ required: true }]} style={{ display: 'none' }}><Select options={[{ label: 'Khách hàng', value: 'customer' }, { label: 'Nhà cung cấp', value: 'supplier' }, { label: 'Đối tác phân phối', value: 'partner' }]} /></Form.Item>
              {editingContact && <span style={{ color: '#64748B', fontSize: 12 }}>{editingContact.code}</span>}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Form.Item name={['details', 'isSupplier']} valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>Nhà cung cấp</Checkbox></Form.Item>
              <Form.Item name={['details', 'isMember']} valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>Là thành viên</Checkbox></Form.Item>
              <Form.Item name={['details', 'isInternal']} valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>Đối tượng nội bộ</Checkbox></Form.Item>
            </div>
            <Form.Item name="name" label="Tên khách hàng / đối tác" rules={[{ required: true, whitespace: true }]} style={{ marginBottom: 0 }}><Input /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '3px 14px', marginTop: 10 }}>
            <Form.Item name="taxCode" label="Mã số thuế">
              <Input />
            </Form.Item>
            <Form.Item name="industry" label="Ngành/Lĩnh vực">
              <Input />
            </Form.Item>
            <Form.Item name="contactPerson" label="Người liên hệ">
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="Số điện thoại"><Input /></Form.Item>
            <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không đúng định dạng.' }]}><Input /></Form.Item>
            <Form.Item name={['details', 'website']} label="Website"><Input /></Form.Item>
            <Form.Item name={['details', 'customerGroup']} label="Nhóm khách hàng"><Input /></Form.Item>
            <Form.Item name="address" label="Địa chỉ"><Input /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '3px 14px' }}>
            <Form.Item name="creditLimit" label="Hạn mức">
              <Input type="number" min={0} />
            </Form.Item>
            <Form.Item name="totalValue" label="Giá trị giao dịch">
              <Input type="number" min={0} />
            </Form.Item>
            <Form.Item name="debtBalance" label="Công nợ">
              <Input type="number" min={0} />
            </Form.Item>
          </div>
          <Form.Item name="tier" label="Hạng đối tác" initialValue="Tiêu chuẩn" style={{ display: 'none' }}><Input /></Form.Item>
          <Form.Item name="status" initialValue="Đang hoạt động" style={{ display: 'none' }}><Select options={statusOptions} /></Form.Item>
          <Form.Item name="accountManager" style={{ display: 'none' }}><Input /></Form.Item>
          <Tabs items={[
            { key: 'contact', label: 'Thông tin liên hệ', children: <div style={{ minHeight: 190, padding: 10, border: '1px solid #CBD5E1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 8 }}><Form.Item name={['details', 'salutation']} label="Xưng hô"><Select options={['Anh', 'Bà', 'Bạn', 'Chị', 'Miss', 'Ông'].map(value => ({ label: value, value }))} /></Form.Item><Form.Item name={['details', 'personalName']} label="Họ và tên"><Input /></Form.Item></div>
              <div><Form.Item name={['details', 'invoiceRecipientName']} label="Người nhận hóa đơn điện tử"><Input /></Form.Item><Form.Item name={['details', 'invoiceRecipientEmails']} label="Email nhận hóa đơn"><Input placeholder="Có thể nhập nhiều email, phân cách bằng dấu ;" /></Form.Item></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><Form.Item name={['details', 'citizenId']} label="Số CMND/Thẻ căn cước"><Input /></Form.Item><Form.Item name={['details', 'idIssueDate']} label="Ngày cấp"><Input type="date" /></Form.Item><Form.Item name={['details', 'idIssuePlace']} label="Nơi cấp"><Input /></Form.Item><Form.Item name={['details', 'passportNo']} label="Số hộ chiếu"><Input /></Form.Item></div>
              <div><Form.Item name={['details', 'invoiceRecipientPhone']} label="Điện thoại nhận hóa đơn"><Input /></Form.Item><Form.Item name={['details', 'socialInsuranceCode']} label="Mã số ĐVQHNS / BHXH"><Input /></Form.Item></div>
            </div> },
            { key: 'payment', label: 'Điều khoản thanh toán', children: <div style={{ minHeight: 190, padding: 10, border: '1px solid #CBD5E1', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 220px))', gap: 14, alignContent: 'start' }}>
              <Form.Item label="Điều khoản thanh toán"><div style={{ display: 'flex', gap: 4 }}><Form.Item name={['details', 'paymentTerm']} style={{ flex: 1, marginBottom: 0 }}><Select showSearch placeholder="Chọn điều khoản" options={paymentTerms.map(term => ({ value: term.code, label: `${term.code} · ${term.name}` }))} onChange={(value: string) => { const term = paymentTerms.find(item => item.code === value); if (term) form.setFieldsValue({ details: { ...form.getFieldValue('details'), creditDays: term.creditDays } }); }} /></Form.Item><Button aria-label="Thêm điều khoản thanh toán" icon={<PlusOutlined />} onClick={() => { paymentTermForm.resetFields(); setPaymentTermOpen(true); }} /></div></Form.Item>
              <Form.Item name={['details', 'creditDays']} label="Số ngày được nợ"><Input type="number" min={0} /></Form.Item>
              <Form.Item name={['details', 'maxDebt']} label="Số nợ tối đa"><Input type="number" min={0} /></Form.Item>
              <Form.Item name={['details', 'receivableAccount']} label="Tài khoản công nợ phải thu"><Input placeholder="131" /></Form.Item>
              <Form.Item name={['details', 'memberType']} label="Loại thành viên"><Select options={['Thành viên chính thức', 'Thành viên liên kết góp vốn', 'Thành viên liên kết không góp vốn'].map(value => ({ label: value, value }))} /></Form.Item>
              <Form.Item name={['details', 'memberGroup']} label="Đội, tổ"><Input /></Form.Item>
            </div> },
            { key: 'banks', label: 'Tài khoản ngân hàng', children: <div style={{ minHeight: 190, padding: 10, border: '1px solid #CBD5E1', overflowX: 'auto' }}>
              <div style={{ minWidth: 720, display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1.2fr 2fr 40px', gap: 6, fontWeight: 700, background: '#C5D9C2', padding: 7 }}><span>Số tài khoản</span><span>Tên ngân hàng</span><span>Chi nhánh</span><span>Tỉnh/TP của ngân hàng</span><span /></div>
              {bankRows.map((row, index) => <div key={index} style={{ minWidth: 720, display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1.2fr 2fr 40px', gap: 6, padding: '6px 0' }}>{(['accountNumber', 'bankName', 'branch', 'province'] as const).map(field => <Input key={field} aria-label={`${field} ngân hàng ${index + 1}`} value={row[field]} onChange={event => setBankRows(current => current.map((item, rowIndex) => rowIndex === index ? { ...item, [field]: event.target.value } : item))} />)}<Button aria-label={`Xóa tài khoản ngân hàng ${index + 1}`} onClick={() => setBankRows(current => current.filter((_, rowIndex) => rowIndex !== index))}>×</Button></div>)}
              <Button onClick={() => setBankRows(current => [...current, { accountNumber: '', bankName: '', branch: '', province: '' }])}>Thêm dòng</Button><Button style={{ marginLeft: 8 }} onClick={() => setBankRows([])}>Xóa hết dòng</Button>
            </div> },
            { key: 'addresses', label: 'Địa chỉ khác', children: <div style={{ minHeight: 190, padding: 10, border: '1px solid #CBD5E1' }}><Checkbox checked={form.getFieldValue(['details', 'sameAsCustomer'])} onChange={event => form.setFieldsValue({ details: { ...form.getFieldValue('details'), sameAsCustomer: event.target.checked } })}>Giống địa chỉ khách hàng</Checkbox>{addressRows.map((value, index) => <div key={index} style={{ display: 'flex', gap: 8, marginTop: 8 }}><Input value={value} onChange={event => setAddressRows(current => current.map((row, rowIndex) => rowIndex === index ? event.target.value : row))} /><Button onClick={() => setAddressRows(current => current.filter((_, rowIndex) => rowIndex !== index))}>Xóa</Button></div>)}<Button style={{ marginTop: 8 }} onClick={() => setAddressRows(current => [...current, ''])}>Thêm dòng</Button><Button style={{ margin: '8px 0 0 8px' }} onClick={() => setAddressRows([])}>Xóa hết dòng</Button></div> },
            { key: 'notes', label: 'Ghi chú', children: <div style={{ minHeight: 190, padding: 10, border: '1px solid #CBD5E1' }}><Form.Item name={['details', 'note']} label="Ghi chú"><Input.TextArea rows={7} /></Form.Item></div> },
            { key: 'custom', label: 'Thông tin bổ sung', children: <div style={{ minHeight: 190, padding: 10, border: '1px solid #CBD5E1' }}><div style={{ color: '#64748B', fontStyle: 'italic', marginBottom: 8 }}>Thông tin bổ sung dùng để quản lý trường dữ liệu riêng của đơn vị.</div>{customRows.map((row, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 8, marginBottom: 6 }}><Input value={row.name} onChange={event => setCustomRows(current => current.map((item, rowIndex) => rowIndex === index ? { ...item, name: event.target.value } : item))} /><Input value={row.value} onChange={event => setCustomRows(current => current.map((item, rowIndex) => rowIndex === index ? { ...item, value: event.target.value } : item))} /></div>)}</div> },
          ]} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={closeContactDialog}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {editingContact ? 'Lưu thay đổi' : 'Lưu đối tác'}
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal title="Thêm điều khoản thanh toán" open={paymentTermOpen} onCancel={() => setPaymentTermOpen(false)} footer={null} width="min(650px, calc(100vw - 32px))">
        <Form form={paymentTermForm} layout="vertical" onFinish={savePaymentTerm} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
            <Form.Item name="code" label="Mã" rules={[{ required: true, whitespace: true }]}><Input maxLength={40} /></Form.Item>
            <Form.Item name="name" label="Tên" rules={[{ required: true, whitespace: true }]}><Input maxLength={160} /></Form.Item>
            <Form.Item name="creditDays" label="Số ngày được nợ" initialValue={0}><Input type="number" min={0} max={3650} /></Form.Item>
            <Form.Item name="discountDays" label="Thời hạn hưởng chiết khấu" initialValue={0}><Input type="number" min={0} max={3650} /></Form.Item>
            <Form.Item name="discountRate" label="Tỷ lệ chiết khấu" initialValue={0}><Input type="number" min={0} max={100} step="0.01" /></Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}><Button onClick={() => setPaymentTermOpen(false)}>Hủy</Button><Button type="primary" htmlType="submit">Cất và Thêm</Button></div>
        </Form>
      </Modal>

      <Drawer title="Chi tiết đối tác" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={560}>
        {selectedContact && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 13, color: typeMeta[selectedContact.type].accent, fontWeight: 800 }}>{selectedContact.code}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{selectedContact.name}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{typeMeta[selectedContact.type].label} · {selectedContact.status}</div>
            </div>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, fontSize: 13 }}>
              <div><strong>Người liên hệ:</strong> {selectedContact.contactPerson || 'Chưa nhập'}</div>
              <div><strong>Điện thoại:</strong> {selectedContact.phone || 'Chưa nhập'}</div>
              <div><strong>Email:</strong> {selectedContact.email || 'Chưa nhập'}</div>
              <div><strong>MST:</strong> {selectedContact.taxCode || 'Chưa nhập'}</div>
              <div><strong>Địa chỉ:</strong> {selectedContact.address || 'Chưa nhập'}</div>
            </div>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, fontSize: 13 }}>
              <div><strong>Giá trị giao dịch:</strong> {formatMoney(selectedContact.totalValue)}</div>
              <div><strong>Công nợ:</strong> {formatMoney(selectedContact.debtBalance)}</div>
              <div><strong>Hạn mức:</strong> {formatMoney(selectedContact.creditLimit)}</div>
              <div><strong>Ngân hàng:</strong> {selectedContact.bankAccount || 'Chưa nhập'}</div>
            </div>
            <Button icon={<EditOutlined />} onClick={() => openEdit(selectedContact)}>
              Chỉnh sửa hồ sơ
            </Button>
            <Button icon={<BuildOutlined />} onClick={() => navigate('/admin/documents/contracts', { state: { crmContactDraft: selectedContact } })}>
              Tạo hợp đồng đối tác
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};
