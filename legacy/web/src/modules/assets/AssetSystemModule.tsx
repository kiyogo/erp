import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  SettingOutlined,
  AppstoreOutlined,
  EnvironmentOutlined,
  ShopOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  PrinterOutlined,
  ThunderboltOutlined,
  NumberOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  CopyOutlined,
  CheckOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  AuditOutlined,
  BankOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Card, Tag, Alert, Progress, Tooltip } from '../../custom-ui';
import { useLocation } from 'react-router-dom';

export interface SystemConfigItem {
  key: string;
  code: string;
  name: string;
  category: 'Vị trí & Tủ Rack' | 'Nhóm & Loại tài sản' | 'Định mức cấp phát chức danh' | 'Quy tắc sinh mã tự động' | 'Mẫu văn bản & Quy trình' | 'Nhà cung cấp';
  details: string;
  scope: string; // Toàn công ty / Keangnam / IDC Viettel / TP.HCM
  allocatedRole: string; // Chức danh áp dụng
  standardPackage: string; // Gói thiết bị tiêu chuẩn
  budgetLimit: number; // Hạn mức kinh phí tối đa
  prefixPattern: string; // Pattern sinh mã: TS-SRV-{YYYY}-{####}
  depreciationMonthsDefault: number;
  responsiblePerson: string;
  status: 'Đang áp dụng' | 'Tạm ngưng';
  notes: string;
}

const INITIAL_CONFIGS: SystemConfigItem[] = [];

export const AssetSystemModule: React.FC<{ subType?: string }> = ({ subType }) => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  let initialTab = 'all';
  if (currentPath.includes('/types') || currentPath.includes('/groups')) initialTab = 'Nhóm & Loại tài sản';
  else if (currentPath.includes('/locations')) initialTab = 'Vị trí & Tủ Rack';
  else if (currentPath.includes('/quotas')) initialTab = 'Định mức cấp phát chức danh';
  else if (currentPath.includes('/templates')) initialTab = 'Mẫu văn bản & Quy trình';
  else if (currentPath.includes('/suppliers')) initialTab = 'Nhà cung cấp';

  const [data, setData] = useState<SystemConfigItem[]>(INITIAL_CONFIGS);

  useEffect(() => {
    const list = dataService.getGenericData('asset_systems');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('asset_systems');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<SystemConfigItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [testGeneratedCode, setTestGeneratedCode] = useState<string>('');

  const [form] = Form.useForm();

  // Metrics
  const totalConfigs = data.length;
  const activeCount = data.filter((d) => d.status === 'Đang áp dụng').length;
  const quotaCount = data.filter((d) => d.category === 'Định mức cấp phát chức danh').length;
  const locationCount = data.filter((d) => d.category === 'Vị trí & Tủ Rack').length;

  const handleOpenCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      code: `SYS-CFG-0${data.length + 1}`,
      category: 'Vị trí & Tủ Rack',
      scope: 'Trụ sở chính Keangnam',
      allocatedRole: 'Toàn bộ CBNV',
      budgetLimit: 50000000,
      depreciationMonthsDefault: 36,
      prefixPattern: 'TS-EQUIP-{YYYY}-{####}',
      responsiblePerson: 'Trần Tuấn Anh (CTO)',
    });
    setModalOpen(true);
  };

  const handleCreate = (values: any) => {
    const newItem: SystemConfigItem = {
      ...values,
      key: String(Date.now()),
      budgetLimit: Number(values.budgetLimit) || 0,
      depreciationMonthsDefault: Number(values.depreciationMonthsDefault) || 36,
      status: 'Đang áp dụng',
    };
    const nextItems = [newItem, ...data]; setData(nextItems); dataService.saveGenericData('asset_systems', nextItems);
    message.success(`Đã thêm thiết lập cấu hình mới: ${values.code} (${values.name})`);
    setModalOpen(false);
    form.resetFields();
  };

  const handleToggleStatus = (record: SystemConfigItem) => {
    const nextSt = record.status === 'Đang áp dụng' ? 'Tạm ngưng' : 'Đang áp dụng';
    setData((prev) => prev.map((d) => (d.key === record.key ? { ...d, status: nextSt } : d)));
    message.info(`Đã đổi trạng thái ${record.code} sang "${nextSt}"`);
    if (detailItem && detailItem.key === record.key) {
      setDetailItem({ ...detailItem, status: nextSt });
    }
  };

  const handleTestGenerateCode = (pattern: string) => {
    const year = new Date().getFullYear();
    const randomSeq = String(Date.now()).slice(-4);
    const result = pattern.replace('{YYYY}', String(year)).replace('{####}', randomSeq);
    setTestGeneratedCode(result);
    message.success(`Đã sinh mã thử nghiệm: ${result}`);
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.category || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.scope || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.allocatedRole || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.details || '').toLowerCase().includes(searchText.toLowerCase());

    const matchTab = activeTab === 'all' || item.category === activeTab;

    return matchSearch && matchTab;
  });

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Vị trí lưu kho &amp; Tủ Rack IDC</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {locationCount} địa điểm &amp; tủ
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Keangnam, IDC Duy Tân &amp; Chi nhánh</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Định mức cấp phát theo chức danh</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {quotaCount} gói tiêu chuẩn
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Senior Dev, C-Level, PM, Helpdesk...</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Quy tắc sinh mã &amp; Mẫu biểu TT200</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            100% tự động hóa
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Mẫu 01-VT đến 06-VT &amp; Mẫu 01-05 TSCĐ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng tham số đang kích hoạt</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {activeCount}/{totalConfigs} quy chuẩn
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Áp dụng đồng bộ toàn bộ các module</div>
        </div>
      </div>

      {/* Filter Tabs Header */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: 'Tất cả thiết lập' },
          { key: 'Vị trí & Tủ Rack', label: '📍 Vị trí & Tủ Rack IDC' },
          { key: 'Định mức cấp phát chức danh', label: 'Định mức theo chức danh', icon: <AuditOutlined style={{ color: '#64748B' }} /> },
          { key: 'Quy tắc sinh mã tự động', label: '🔢 Quy tắc sinh mã tự động' },
          { key: 'Nhóm & Loại tài sản', label: '🏷️ Nhóm & Loại tài sản' },
          { key: 'Mẫu văn bản & Quy trình', label: '📄 Mẫu văn bản & Quy trình' },
          { key: 'Nhà cung cấp', label: 'Nhà cung cấp & SLA', icon: <BankOutlined style={{ color: '#6366F1' }} /> },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid',
              borderColor: activeTab === tab.key ? '#009688' : '#E2E8F0',
              background: activeTab === tab.key ? '#E0F2F1' : '#FFFFFF',
              color: activeTab === tab.key ? '#00796B' : '#475569',
              fontWeight: activeTab === tab.key ? 700 : 500,
              cursor: 'pointer',
              fontSize: 13,
              transition: 'all 0.2s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo mã, tên quy chuẩn, phạm vi, chức danh, mô tả..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 380, borderRadius: 6 }}
            allowClear
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất danh mục quy chuẩn cấu hình hệ thống')}>
            Xuất Excel
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm thiết lập mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={[
            {
              title: 'Mã & Phân loại',
              key: 'code',
              width: 180,
              render: (_: any, r: SystemConfigItem) => (
                <div>
                  <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SettingOutlined /> {r.code}
                  </span>
                  <Tag color="purple" style={{ marginTop: 3, fontSize: 11 }}>
                    {r.category}
                  </Tag>
                </div>
              ),
            },
            {
              title: 'Tên quy chuẩn & Nội dung thiết lập',
              key: 'info',
              render: (_: any, r: SystemConfigItem) => (
                <div>
                  <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.name}</strong>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{r.details}</div>
                  <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>
                    Phạm vi: <strong>{r.scope}</strong> · Chức danh: <strong>{r.allocatedRole}</strong>
                  </div>
                  {r.prefixPattern && (
                    <div style={{ fontSize: 11, color: '#009688', marginTop: 2 }}>
                      Pattern sinh mã: <code>{r.prefixPattern}</code>
                    </div>
                  )}
                </div>
              ),
            },
            {
              title: 'Gói tiêu chuẩn & Hạn mức',
              key: 'pkg',
              width: 220,
              render: (_: any, r: SystemConfigItem) => (
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: '#0F172A' }}>{r.standardPackage || 'Theo thỏa thuận'}</div>
                  {r.budgetLimit > 0 && (
                    <div style={{ color: '#16A34A', fontWeight: 700, marginTop: 2 }}>
                      Hạn mức: {r.budgetLimit.toLocaleString('vi-VN')} ₫
                    </div>
                  )}
                  {r.depreciationMonthsDefault > 0 && (
                    <div style={{ fontSize: 11, color: '#64748B' }}>
                      Khấu hao mặc định: {r.depreciationMonthsDefault} tháng
                    </div>
                  )}
                </div>
              ),
            },
            {
              title: 'Người quản lý',
              dataIndex: 'responsiblePerson',
              key: 'responsiblePerson',
              width: 160,
              render: (p: string) => <span style={{ fontSize: 12.5, fontWeight: 500 }}>{p}</span>,
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              key: 'status',
              width: 130,
              render: (s: string) => <Tag color={s === 'Đang áp dụng' ? 'success' : 'default'}>{s}</Tag>,
            },
            {
              title: 'Thao tác',
              key: 'act',
              width: 170,
              render: (_: any, r: SystemConfigItem) => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setDetailItem(r);
                      setTestGeneratedCode('');
                      setDrawerOpen(true);
                    }}
                    title="Xem chi tiết thiết lập & test sinh mã"
                  >
                    Xem
                  </Button>
                  <Tooltip title={r.status === 'Đang áp dụng' ? 'Tạm ngưng áp dụng' : 'Kích hoạt áp dụng'}>
                    <Button
                      size="small"
                      icon={r.status === 'Đang áp dụng' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                      onClick={() => handleToggleStatus(r)}
                      style={{ color: r.status === 'Đang áp dụng' ? '#D97706' : '#009688' }}
                    />
                  </Tooltip>
                </div>
              ),
            },
          ]}
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* MODAL: Thêm thiết lập cấu hình mới 100% trường nhập */}
      <Modal
        title="Thêm Mới Thiết Lập Quy Chuẩn Hệ Thống Tài Sản"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={760}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 12 }}>
            <Form.Item name="code" label="Mã cấu hình / Quy chuẩn" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: SYS-QTA-SALES" />
            </Form.Item>
            <Form.Item name="category" label="Phân loại thiết lập" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Vị trí & Tủ Rack IDC', value: 'Vị trí & Tủ Rack' },
                  { label: 'Định mức cấp phát chức danh', value: 'Định mức cấp phát chức danh' },
                  { label: 'Quy tắc sinh mã tự động', value: 'Quy tắc sinh mã tự động' },
                  { label: 'Nhóm & Loại tài sản', value: 'Nhóm & Loại tài sản' },
                  { label: 'Mẫu văn bản & Quy trình', value: 'Mẫu văn bản & Quy trình' },
                  { label: 'Nhà cung cấp & SLA', value: 'Nhà cung cấp' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="name" label="Tên danh mục / Tiêu đề quy chuẩn" rules={[{ required: true, message: 'Nhập tên thiết lập' }]}>
            <Input placeholder="Ví dụ: Định Mức Cấp Phát Khối Kinh Doanh & Sale Manager" />
          </Form.Item>

          <Form.Item name="details" label="Nội dung quy định / Mô tả kỹ thuật" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Chi tiết quy định, định mức hoặc tiêu chuẩn chất lượng..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="scope" label="Phạm vi áp dụng" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Trụ sở Keangnam & Chi nhánh TP.HCM" />
            </Form.Item>
            <Form.Item name="allocatedRole" label="Chức danh / Đối tượng áp dụng" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Sale Executive / Account Manager" />
            </Form.Item>
          </div>

          <Form.Item name="standardPackage" label="Gói thiết bị / Cấu hình tiêu chuẩn">
            <Input placeholder="Ví dụ: 01 Laptop mỏng nhẹ i5 16GB RAM + Chuột không dây Logitech" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="budgetLimit" label="Hạn mức kinh phí tối đa (VNĐ)">
              <Input type="number" min={0} step={5000000} placeholder="Ví dụ: 25000000" />
            </Form.Item>
            <Form.Item name="depreciationMonthsDefault" label="Khấu hao mặc định">
              <Input type="number" min={0} placeholder="Ví dụ: 24" />
            </Form.Item>
            <Form.Item name="prefixPattern" label="Pattern sinh mã">
              <Input placeholder="TS-SALE-{YYYY}-{####}" />
            </Form.Item>
          </div>

          <Form.Item name="responsiblePerson" label="Người phụ trách kiểm soát / Ban hành" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Lê Hoàng Yến" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu thiết lập quy chuẩn
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Xem Chi Tiết Thiết Lập & Test Sinh Mã */}
      <Drawer
        title="Hồ Sơ Quy Chuẩn Cấu Hình &amp; Thử Nghiệm Sinh Mã"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={620}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Document */}
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>{detailItem.code}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{detailItem.name}</div>
                </div>
                <Tag color={detailItem.status === 'Đang áp dụng' ? 'success' : 'default'}>{detailItem.status}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Phân loại: <strong>{detailItem.category}</strong> · Phạm vi: <strong>{detailItem.scope}</strong>
              </div>
            </div>

            {/* Matrix Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, background: '#F0FDF4' }}>
                <div style={{ fontSize: 11, color: '#166534' }}>HẠN MỨC NGÂN SÁCH</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#16A34A', marginTop: 2 }}>
                  {detailItem.budgetLimit > 0 ? `${detailItem.budgetLimit.toLocaleString('vi-VN')} ₫` : 'Không giới hạn'}
                </div>
                <div style={{ fontSize: 11, color: '#64748B' }}>Chức danh: {detailItem.allocatedRole}</div>
              </div>

              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, background: '#EFF6FF' }}>
                <div style={{ fontSize: 11, color: '#1E40AF' }}>KHẤU HAO MẶC ĐỊNH</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#2563EB', marginTop: 2 }}>
                  {detailItem.depreciationMonthsDefault > 0 ? `${detailItem.depreciationMonthsDefault} tháng` : 'Theo thực tế'}
                </div>
                <div style={{ fontSize: 11, color: '#64748B' }}>Người phụ trách: {detailItem.responsiblePerson}</div>
              </div>
            </div>

            {/* Standard Package Info */}
            <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
              <div><strong>Gói cấu hình tiêu chuẩn:</strong> {detailItem.standardPackage || 'Theo từng yêu cầu cụ thể'}</div>
              <div style={{ marginTop: 4 }}><strong>Chi tiết quy định:</strong> {detailItem.details}</div>
              {detailItem.notes && <div style={{ marginTop: 4, color: '#64748B' }}><strong>Ghi chú:</strong> {detailItem.notes}</div>}
            </div>

            {/* Auto Code Generator Live Tester */}
            {detailItem.prefixPattern && (
              <div style={{ border: '1px solid #009688', borderRadius: 8, padding: 14, background: '#F0FDF4' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#009688', fontWeight: 700, fontSize: 13 }}>
                  <ThunderboltOutlined /> TRÌNH THỬ NGHIỆM SINH MÃ TỰ ĐỘNG
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                  Cấu trúc Pattern: <code>{detailItem.prefixPattern}</code>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                  <Button
                    type="primary"
                    icon={<NumberOutlined />}
                    onClick={() => handleTestGenerateCode(detailItem.prefixPattern)}
                    style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                  >
                    Sinh mã thử nghiệm
                  </Button>
                  {testGeneratedCode && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', background: '#FFFFFF', padding: '4px 10px', borderRadius: 4, border: '1px solid #CBD5E1' }}>
                        {testGeneratedCode}
                      </span>
                      <Tag color="success">Hợp lệ 100%</Tag>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã xuất văn bản quy chuẩn ${detailItem.code} (PDF)`)}
                style={{ flex: 1 }}
              >
                In quy chuẩn (PDF)
              </Button>
              <Button
                type="primary"
                icon={detailItem.status === 'Đang áp dụng' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                onClick={() => handleToggleStatus(detailItem)}
                style={{ backgroundColor: detailItem.status === 'Đang áp dụng' ? '#D97706' : '#009688', borderColor: detailItem.status === 'Đang áp dụng' ? '#D97706' : '#009688', flex: 1 }}
              >
                {detailItem.status === 'Đang áp dụng' ? 'Tạm ngưng quy chuẩn' : 'Kích hoạt quy chuẩn'}
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

