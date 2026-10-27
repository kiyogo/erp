import { softwareLicensesApi } from '../../api/endpoints';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  KeyOutlined,
  CheckCircleOutlined,
  UserOutlined,
  LaptopOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  CopyOutlined,
  PrinterOutlined,
  SafetyCertificateOutlined,
  ClockCircleOutlined,
  AlertOutlined,
  ThunderboltOutlined,
  TeamOutlined,
  CloudServerOutlined,
  AppstoreOutlined,
  CheckOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Card, Tag, Alert, Progress, Tooltip } from '../../custom-ui';

export interface LicenseUserAllocation {
  name: string;
  email: string;
  assignedDate: string;
  deviceCode: string;
  status: 'Đang dùng' | 'Tạm khóa';
}

export interface SoftwareLicense {
  key: string;
  licenseCode: string;
  softwareName: string;
  vendor: string;
  category: 'Bộ công cụ Lập trình' | 'Hệ điều hành & Máy chủ' | 'Nền tảng Đám mây & SaaS' | 'Thiết kế & Đồ họa' | 'Bảo mật & Giám sát' | 'Văn phòng & Cộng tác';
  licenseType: 'Doanh nghiệp' | 'Theo người dùng' | 'Theo máy chủ' | 'Vĩnh viễn' | 'Thuê bao';
  productKey: string;
  seatsAllocated: number;
  seatsTotal: number;
  annualCost: number;
  billingCycle: 'Hàng năm' | 'Hàng tháng' | 'Vĩnh viễn';
  purchaseDate: string;
  expireDate: string;
  assignedDepartment: string;
  assignedAdmin: string;
  complianceAuditStatus: 'Tuân thủ 100%' | 'Cảnh báo quá số ghế' | 'Cần gia hạn gấp';
  status: 'Đang kích hoạt' | 'Sắp hết hạn' | 'Hết hạn';
  allocatedUsers: LicenseUserAllocation[];
  notes: string;
}

const INITIAL_LICENSES: SoftwareLicense[] = [];

function withStatus(item: SoftwareLicense): SoftwareLicense {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const expiry = Date.parse(`${item.expireDate}T00:00:00Z`);
  const days = (expiry - Date.parse(`${today}T00:00:00Z`)) / 86400000;
  return { ...item, status: Number.isFinite(days) ? days < 0 ? 'Hết hạn' : days <= 30 ? 'Sắp hết hạn' : 'Đang kích hoạt' : item.status };
}

export const LicensesModule: React.FC = () => {
  const [data, setData] = useState<SoftwareLicense[]>(INITIAL_LICENSES);
  const [saving, setSaving] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewDate, setRenewDate] = useState('');
  const [renewCost, setRenewCost] = useState('');

  useEffect(() => {
    let active = true;
    softwareLicensesApi.getAll().then(({ data: response }) => { if (active) setData(response.data.map(withStatus)); })
      .catch(() => { if (active) message.error('Không tải được danh sách bản quyền.'); });
    return () => { active = false; };
  }, []);

  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<SoftwareLicense | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showKey, setShowKey] = useState<boolean>(false);

  // Seat allocation modal state
  const [seatModalOpen, setSeatModalOpen] = useState(false);
  const [seatName, setSeatName] = useState('');
  const [seatEmail, setSeatEmail] = useState('');
  const [seatDevice, setSeatDevice] = useState('');

  const [form] = Form.useForm();

  // Metrics
  const totalSeats = data.reduce((sum, item) => sum + (Number(item.seatsTotal) || 0), 0);
  const totalAllocated = data.reduce((sum, item) => sum + (Number(item.seatsAllocated) || 0), 0);
  const totalCost = data.reduce((sum, item) => sum + (Number(item.annualCost) || 0), 0);
  const expiringCount = data.filter((d) => d.status === 'Sắp hết hạn').length;
  const utilizationRate = totalSeats > 0 ? Math.round((totalAllocated / totalSeats) * 100) : 0;

  const handleOpenCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      licenseCode: '',
      category: 'Bộ công cụ Lập trình',
      licenseType: 'Theo người dùng',
      billingCycle: 'Hàng năm',
      purchaseDate: new Date().toISOString().substring(0, 10),
      expireDate: '',
      seatsAllocated: 0,
      seatsTotal: 1,
      annualCost: 0,
      assignedDepartment: '',
      assignedAdmin: '',
    });
    setModalOpen(true);
  };

  const handleCreate = async (values: any) => {
    setSaving(true);
    try {
      const response = await softwareLicensesApi.create(values);
      setData((current) => [withStatus(response.data.record), ...current]);
      message.success('Đã đăng ký bản quyền phần mềm.');
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) { message.error(error?.response?.data?.error || error?.response?.data?.message || 'Không lưu được bản quyền.'); }
    finally { setSaving(false); }
  };

  const handleAddSeat = async () => {
    if (!detailItem) return;
    setSaving(true);
    try {
      const response = await softwareLicensesApi.allocate(detailItem.key, { name: seatName, email: seatEmail, deviceCode: seatDevice });
      const updated = withStatus(response.data.record);
      setData((current) => current.map((item) => item.key === updated.key ? updated : item));
      setDetailItem(updated);
      message.success('Đã ghi nhận cấp ghế.');
      setSeatModalOpen(false);
      setSeatName(''); setSeatEmail(''); setSeatDevice('');
    } catch (error: any) { message.error(error?.response?.data?.error || error?.response?.data?.message || 'Không cấp được ghế.'); }
    finally { setSaving(false); }
  };

  const handleRenew = async () => {
    if (!detailItem || !renewDate || renewCost === '') { message.error('Nhập ngày hết hạn mới và chi phí.'); return; }
    setSaving(true);
    try {
      const response = await softwareLicensesApi.renew(detailItem.key, { expireDate: renewDate, annualCost: Number(renewCost) });
      const updated = withStatus(response.data.record);
      setData((current) => current.map((item) => item.key === updated.key ? updated : item));
      setDetailItem(updated);
      setRenewOpen(false);
      message.success('Đã ghi nhận thông tin gia hạn.');
    } catch (error: any) { message.error(error?.response?.data?.error || error?.response?.data?.message || 'Không ghi nhận được gia hạn.'); }
    finally { setSaving(false); }
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.licenseCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.softwareName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.vendor || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.assignedDepartment || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.productKey || '').toLowerCase().includes(searchText.toLowerCase());

    const matchCategory = categoryFilter === 'all' || (item.category || '').split(' (')[0] === categoryFilter;
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;

    return matchSearch && matchCategory && matchStatus;
  });

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng ngân sách bản quyền / Năm</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalCost.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>{data.length} gói phần mềm &amp; SaaS</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ tối ưu Seats</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalAllocated}/{totalSeats} ghế ({utilizationRate}%)
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Tránh lãng phí license chưa sử dụng</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Cảnh báo sắp hết hạn</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: expiringCount > 0 ? '#D97706' : '#16A34A', marginTop: 4 }}>
            {expiringCount} gói bản quyền
          </div>
          <div style={{ fontSize: 11.5, color: expiringCount > 0 ? '#D97706' : '#16A34A', marginTop: 2 }}>
            {expiringCount > 0 ? 'Cần lập tờ trình duyệt chi gia hạn' : 'Tất cả license an toàn'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Mức độ tuân thủ</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {data.length} hồ sơ
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Cần đối chiếu chứng từ bản quyền</div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo mã license, tên phần mềm, hãng, phòng ban, key..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 340, borderRadius: 6 }}
            allowClear
          />
          <Select
            value={categoryFilter}
            onChange={setCategoryFilter}
            style={{ width: 220 }}
            options={[
              { label: 'Tất cả nhóm phần mềm', value: 'all' },
              { label: 'Bộ công cụ Lập trình', value: 'Bộ công cụ Lập trình' },
              { label: 'Hệ điều hành & Máy chủ', value: 'Hệ điều hành & Máy chủ' },
              { label: 'Nền tảng Đám mây & SaaS', value: 'Nền tảng Đám mây & SaaS' },
              { label: 'Thiết kế & Đồ họa', value: 'Thiết kế & Đồ họa' },
              { label: 'Bảo mật & Giám sát', value: 'Bảo mật & Giám sát' },
              { label: 'Văn phòng & Cộng tác', value: 'Văn phòng & Cộng tác' },
            ]}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 170 }}
            options={[
              { label: 'Tất cả trạng thái', value: 'all' },
              { label: 'Đang kích hoạt', value: 'Đang kích hoạt' },
              { label: 'Sắp hết hạn', value: 'Sắp hết hạn' },
              { label: 'Hết hạn', value: 'Hết hạn' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} onClick={() => downloadFile('kiem_ke_ban_quyen.xlsx', generateValidXlsxBlob([['Mã', 'Phần mềm', 'Nhà cung cấp', 'Nhóm', 'Loại', 'Ghế đã dùng', 'Tổng ghế', 'Chi phí', 'Ngày mua', 'Ngày hết hạn', 'Phòng ban', 'Quản trị', 'Trạng thái'], ...filteredData.map((item) => [item.licenseCode, item.softwareName, item.vendor, item.category, item.licenseType, item.seatsAllocated, item.seatsTotal, item.annualCost, item.purchaseDate, item.expireDate, item.assignedDepartment, item.assignedAdmin, item.status])]))}>
            Xuất Excel
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Đăng ký License mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={[
            {
              title: 'Mã License & Nhóm',
              key: 'code',
              width: 170,
              render: (_: any, r: SoftwareLicense) => (
                <div>
                  <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <KeyOutlined /> {r.licenseCode}
                  </span>
                  <Tag color="cyan" style={{ marginTop: 3, fontSize: 11 }}>
                    {r.category.split(' ')[0]}
                  </Tag>
                </div>
              ),
            },
            {
              title: 'Tên phần mềm & Nhà phát triển',
              key: 'name',
              render: (_: any, r: SoftwareLicense) => (
                <div>
                  <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.softwareName}</strong>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    Hãng: <strong style={{ color: '#2563EB' }}>{r.vendor}</strong> · Loại: <strong>{r.licenseType}</strong>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>
                    Phòng ban: <strong>{r.assignedDepartment}</strong> · Quản trị: <em>{r.assignedAdmin}</em>
                  </div>
                </div>
              ),
            },
            {
              title: 'Số lượng Ghế',
              key: 'seats',
              width: 170,
              render: (_: any, r: SoftwareLicense) => {
                const pct = r.seatsTotal > 0 ? Math.round((r.seatsAllocated / r.seatsTotal) * 100) : 0;
                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 2 }}>
                      <span style={{ fontWeight: 600 }}>{r.seatsAllocated}/{r.seatsTotal} seats</span>
                      <span style={{ color: pct >= 100 ? '#DC2626' : '#009688', fontWeight: 700 }}>{pct}%</span>
                    </div>
                    <Progress percent={pct} size="small" strokeColor={pct >= 100 ? '#DC2626' : '#009688'} showInfo={false} />
                  </div>
                );
              },
            },
            {
              title: 'Chi phí / Năm (VNĐ)',
              dataIndex: 'annualCost',
              key: 'cost',
              width: 160,
              render: (v: number, r: SoftwareLicense) => (
                <div>
                  <span style={{ fontWeight: 700, color: '#16A34A', fontSize: 13 }}>
                    {Number(v || 0).toLocaleString('vi-VN')} ₫
                  </span>
                  <div style={{ fontSize: 11, color: '#64748B' }}>{r.billingCycle}</div>
                </div>
              ),
            },
            {
              title: 'Hạn dùng & Tuân thủ',
              key: 'exp',
              width: 170,
              render: (_: any, r: SoftwareLicense) => (
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: r.status === 'Sắp hết hạn' ? '#D97706' : '#0F172A' }}>
                    {r.expireDate}
                  </div>
                  <Tag color={r.status === 'Sắp hết hạn' ? 'warning' : 'success'} style={{ marginTop: 2 }}>
                    {r.status}
                  </Tag>
                </div>
              ),
            },
            {
              title: 'Thao tác',
              key: 'act',
              width: 140,
              render: (_: any, r: SoftwareLicense) => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setDetailItem(r);
                      setShowKey(false);
                      setDrawerOpen(true);
                    }}
                    title="Xem chi tiết & danh sách phân bổ ghế"
                  >
                    Xem ghế
                  </Button>
                </div>
              ),
            },
          ]}
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* MODAL: Đăng ký License Mới 100% trường nhập */}
      <Modal
        title="Đăng Ký Bản Quyền Phần Mềm &amp; SaaS Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={760}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 14 }}>
            <Form.Item name="licenseCode" label="Mã License" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: LIC-DATADOG-01" />
            </Form.Item>
            <Form.Item name="category" label="Phân nhóm phần mềm" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Bộ công cụ Lập trình', value: 'Bộ công cụ Lập trình' },
                  { label: 'Hệ điều hành & Máy chủ', value: 'Hệ điều hành & Máy chủ' },
                  { label: 'Nền tảng Đám mây & SaaS', value: 'Nền tảng Đám mây & SaaS' },
                  { label: 'Thiết kế & Đồ họa', value: 'Thiết kế & Đồ họa' },
                  { label: 'Bảo mật & Giám sát', value: 'Bảo mật & Giám sát' },
                  { label: 'Văn phòng & Cộng tác', value: 'Văn phòng & Cộng tác' },
                ]}
              />
            </Form.Item>
            <Form.Item name="licenseType" label="Hình thức cấp phép" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Theo người dùng', value: 'Theo người dùng' },
                  { label: 'Doanh nghiệp', value: 'Doanh nghiệp' },
                  { label: 'Theo máy chủ', value: 'Theo máy chủ' },
                  { label: 'Vĩnh viễn', value: 'Vĩnh viễn' },
                  { label: 'Thuê bao', value: 'Thuê bao' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="softwareName" label="Tên phần mềm / Gói dịch vụ" rules={[{ required: true, message: 'Nhập tên phần mềm' }]}>
            <Input placeholder="Ví dụ: Datadog APM & Cloud Infrastructure Monitoring" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="vendor" label="Hãng phát triển / Nhà cung cấp" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Datadog Inc / Microsoft / Oracle" />
            </Form.Item>
            <Form.Item name="productKey" label="Product Key / Token Kích Hoạt" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: DD-KEY-ENTERPRISE-2026-XXXX" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.2fr', gap: 14 }}>
            <Form.Item name="seatsAllocated" label="Số ghế đã dùng" rules={[{ required: true }]}>
              <Input type="number" min={0} />
            </Form.Item>
            <Form.Item name="seatsTotal" label="Tổng số ghế mua" rules={[{ required: true }]}>
              <Input type="number" min={1} />
            </Form.Item>
            <Form.Item name="billingCycle" label="Kỳ thanh toán" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Hàng năm', value: 'Hàng năm' },
                  { label: 'Hàng tháng', value: 'Hàng tháng' },
                  { label: 'Vĩnh viễn', value: 'Vĩnh viễn' },
                ]}
              />
            </Form.Item>
            <Form.Item name="annualCost" label="Chi phí / Năm (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={5000000} placeholder="Ví dụ: 85000000" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <Form.Item name="purchaseDate" label="Ngày mua bản quyền" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="expireDate" label="Ngày hết hạn hợp đồng" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="assignedDepartment" label="Phòng ban thụ hưởng" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Khối Kỹ Thuật" />
            </Form.Item>
          </div>

          <Form.Item name="assignedAdmin" label="Người quản trị" rules={[{ required: true }]}><Input /></Form.Item>

          <Form.Item name="notes" label="Ghi chú điều khoản hợp đồng & Bảo mật">
            <Input.TextArea rows={2} placeholder="Nhập các điều khoản gia hạn hoặc tài khoản quản trị..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Đăng ký bản quyền
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Hồ sơ License & Danh sách Phân Bổ Ghế (Seat Ledger) */}
      <Drawer
        title="Hồ Sơ Bản Quyền &amp; Sổ Phân Bổ Ghế"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={680}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Document */}
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>{detailItem.licenseCode}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{detailItem.softwareName}</div>
                </div>
                <Tag color={detailItem.status === 'Sắp hết hạn' ? 'warning' : 'success'}>{detailItem.status}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Hãng: <strong>{detailItem.vendor}</strong> · Hình thức: <strong>{detailItem.licenseType}</strong>
              </div>
            </div>

            {/* Product Key Security Box */}
            <div style={{ border: '1px solid #CBD5E1', borderRadius: 8, padding: 12, background: '#F1F5F9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
                  <KeyOutlined /> PRODUCT KEY / TOKEN BẢN QUYỀN
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    size="small"
                    icon={showKey ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? 'Ẩn' : 'Hiện'}
                  </Button>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={async () => {
                      try { await navigator.clipboard.writeText(detailItem.productKey); message.success('Đã sao chép mã kích hoạt.'); }
                      catch { message.error('Không sao chép được mã kích hoạt.'); }
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: '#0F172A', marginTop: 8 }}>
                {showKey ? detailItem.productKey : '••••-••••-••••-' + detailItem.productKey.slice(-4)}
              </div>
            </div>

            {/* Seat Matrix Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#F0FDF4' }}>
                <div style={{ fontSize: 11, color: '#166534' }}>GHẾ ĐÃ DÙNG</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#16A34A', marginTop: 2 }}>
                  {detailItem.seatsAllocated} / {detailItem.seatsTotal}
                </div>
                <div style={{ fontSize: 11, color: '#64748B' }}>Còn {detailItem.seatsTotal - detailItem.seatsAllocated} ghế trống</div>
              </div>

              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#EFF6FF' }}>
                <div style={{ fontSize: 11, color: '#1E40AF' }}>CHI PHÍ / NĂM</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#2563EB', marginTop: 2 }}>
                  {Number(detailItem.annualCost || 0).toLocaleString('vi-VN')} ₫
                </div>
                <div style={{ fontSize: 11, color: '#64748B' }}>{detailItem.billingCycle}</div>
              </div>

              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#FFFBEB' }}>
                <div style={{ fontSize: 11, color: '#B45309' }}>HẠN HỢP ĐỒNG</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#D97706', marginTop: 2 }}>
                  {detailItem.expireDate}
                </div>
                <div style={{ fontSize: 11, color: '#64748B' }}>Từ: {detailItem.purchaseDate}</div>
              </div>
            </div>

            {/* Seat Allocation User List */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <strong style={{ fontSize: 13, color: '#0F172A' }}>
                  <TeamOutlined /> Danh Sách Nhân Sự &amp; Thiết Bị Được Cấp Ghế:
                </strong>
                <Button
                  size="small"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setSeatModalOpen(true)}
                  disabled={detailItem.seatsAllocated >= detailItem.seatsTotal}
                  style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                >
                  Cấp ghế mới
                </Button>
              </div>

              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #F1F5F9', borderRadius: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ background: '#F8FAFC', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>Họ tên &amp; Email</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>Thiết bị</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>Ngày cấp</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #E2E8F0' }}>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItem.allocatedUsers && detailItem.allocatedUsers.length > 0 ? (
                      detailItem.allocatedUsers.map((user, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '7px 10px', fontWeight: 600 }}>
                            <div>{user.name}</div>
                            <div style={{ fontSize: 11, color: '#64748B' }}>{user.email}</div>
                          </td>
                          <td style={{ padding: '7px 10px' }}>
                            <code>{user.deviceCode}</code>
                          </td>
                          <td style={{ padding: '7px 10px', color: '#64748B' }}>{user.assignedDate}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                            <Tag color="success" style={{ margin: 0 }}>{user.status}</Tag>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: 16, color: '#94A3B8' }}>
                          Chưa có phân bổ chi tiết cho từng người dùng
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => downloadFile(`${detailItem.licenseCode.replace(/[^a-z0-9_-]/gi, '_')}_ban_quyen.pdf`, generateValidPdfBlob('PHIEU THEO DOI BAN QUYEN', detailItem.licenseCode, [detailItem.softwareName, `Nha cung cap: ${detailItem.vendor}`, `So ghe: ${detailItem.seatsAllocated}/${detailItem.seatsTotal}`, `Ngay mua: ${detailItem.purchaseDate}`, `Ngay het han: ${detailItem.expireDate}`, `Phong ban: ${detailItem.assignedDepartment}`, `Quan tri: ${detailItem.assignedAdmin}`, 'Phieu theo doi noi bo, khong thay the chung thu cua nha cung cap.']))}
                style={{ flex: 1 }}
              >
                In phiếu theo dõi PDF
              </Button>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={() => { setRenewDate(''); setRenewCost(String(detailItem.annualCost)); setRenewOpen(true); }}
                style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
              >
                Gia hạn hợp đồng
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      <Modal title="Ghi nhận gia hạn bản quyền" open={renewOpen} onCancel={() => setRenewOpen(false)} footer={null} width={460}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
          <label>Ngày hết hạn mới<Input type="date" value={renewDate} onChange={(event) => setRenewDate(event.target.value)} /></label>
          <label>Chi phí<Input type="number" min={0} value={renewCost} onChange={(event) => setRenewCost(event.target.value)} /></label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button onClick={() => setRenewOpen(false)}>Hủy</Button><Button type="primary" loading={saving} onClick={handleRenew}>Ghi nhận</Button></div>
        </div>
      </Modal>

      {/* MODAL: Cấp phát ghế bản quyền nhanh */}
      <Modal
        title="Cấp Phát Ghế Bản Quyền Cho Nhân Viên Mới"
        open={seatModalOpen}
        onCancel={() => setSeatModalOpen(false)}
        footer={null}
        width={460}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4 }}>
              Họ và tên nhân sự:
            </label>
            <Input
              placeholder="Ví dụ: Lê Minh Trọng"
              value={seatName}
              onChange={(e) => setSeatName(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4 }}>
              Email công ty:
            </label>
            <Input
              placeholder="Ví dụ: trong.lm@kiyovn.com"
              value={seatEmail}
              onChange={(e) => setSeatEmail(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4 }}>
              Mã máy tính / Thiết bị gán:
            </label>
            <Input
              placeholder="Ví dụ: TS-NB-025"
              value={seatDevice}
              onChange={(e) => setSeatDevice(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <Button onClick={() => setSeatModalOpen(false)}>Hủy</Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleAddSeat}
              loading={saving}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Xác nhận cấp phát
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

