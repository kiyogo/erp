import React, { useEffect, useMemo, useState } from 'react';
import {
  ApartmentOutlined,
  BuildOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer } from '../../custom-ui';
import { CrmContact, CrmContactType, crmContactsApi } from '../../api/endpoints';

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

export const CRMContactsModule: React.FC<{ type?: ContactFilter }> = ({ type = 'all' }) => {
  const [data, setData] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<ContactFilter>(type);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<CrmContact | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    setTypeFilter(type);
  }, [type]);

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

  useEffect(() => {
    void loadData();
  }, [type]);

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

  const handleCreate = async (values: any) => {
    try {
      await crmContactsApi.create({
        code: values.code,
        name: values.name,
        type: values.type,
        taxCode: values.taxCode || '',
        industry: values.industry || '',
        contactPerson: values.contactPerson || '',
        phone: values.phone || '',
        email: values.email || '',
        address: values.address || '',
        bankAccount: values.bankAccount || '',
        creditLimit: Number(values.creditLimit) || 0,
        totalValue: Number(values.totalValue) || 0,
        debtBalance: Number(values.debtBalance) || 0,
        tier: values.tier || 'Tiêu chuẩn',
        accountManager: values.accountManager || '',
        status: values.status || 'Đang hoạt động',
      });
      const createdTypeLabel = typeMeta[values.type as CrmContactType]?.label.toLowerCase() || 'đối tác';
      message.success(`Đã lưu ${createdTypeLabel} vào dữ liệu hệ thống.`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu dữ liệu đối tác.');
    }
  };

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
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
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
          <Button onClick={() => message.warning('Chưa có dịch vụ xuất Excel thật cho danh sách đối tác.')}>Xuất Excel</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
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

      <Modal title="Thêm đối tác" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={640}>
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã đối tác" rules={[{ required: true, whitespace: true }]}>
              <Input placeholder="Ví dụ: KH-001, NCC-001, DL-001" />
            </Form.Item>
            <Form.Item name="type" label="Loại đối tác" rules={[{ required: true }]}>
              <Select disabled={type !== 'all'} options={[{ label: 'Khách hàng', value: 'customer' }, { label: 'Nhà cung cấp', value: 'supplier' }, { label: 'Đối tác phân phối', value: 'partner' }]} />
            </Form.Item>
          </div>
          <Form.Item name="name" label="Tên tổ chức" rules={[{ required: true, whitespace: true }]}>
            <Input />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="taxCode" label="Mã số thuế">
              <Input />
            </Form.Item>
            <Form.Item name="industry" label="Ngành/Lĩnh vực">
              <Input />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="contactPerson" label="Người liên hệ">
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="Số điện thoại">
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không đúng định dạng.' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="address" label="Địa chỉ">
            <Input />
          </Form.Item>
          <Form.Item name="bankAccount" label="Tài khoản ngân hàng">
            <Input />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="tier" label="Hạng đối tác" initialValue="Tiêu chuẩn">
              <Input />
            </Form.Item>
            <Form.Item name="status" label="Trạng thái">
              <Select options={statusOptions} />
            </Form.Item>
          </div>
          <Form.Item name="accountManager" label="Người phụ trách nội bộ">
            <Input />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu đối tác
            </Button>
          </div>
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
            <Button icon={<BuildOutlined />} onClick={() => message.warning('Chưa có luồng tạo hợp đồng/tài liệu thật từ hồ sơ đối tác.')}>
              Tạo nghiệp vụ liên quan
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};
