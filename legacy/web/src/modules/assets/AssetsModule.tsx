import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  InboxOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  QrcodeOutlined,
  PrinterOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  SlidersOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Card, Tag, Table, Progress } from '../../custom-ui';
import { dataService, AssetRecord } from '../../services/dataService';

export interface ComprehensiveAsset {
  key: string;
  code: string;
  barcode: string;
  name: string;
  category: 'Thiết bị IT' | 'Nội thất văn phòng' | 'Phương tiện & Vận chuyển' | 'Máy chủ & Hạ tầng IDC' | 'Máy móc & Thiết bị kỹ thuật';
  model: string;
  purchaseDate: string;
  supplier: string;
  originalPrice: number;
  depreciationMonths: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  location: string;
  assignedTo: string;
  department: string;
  status: 'Đang sử dụng' | 'Trong kho' | 'Đang sửa chữa' | 'Chờ thanh lý' | 'Đã thanh lý';
  warrantyExpiry: string;
  specs: string;
  notes: string;
}

const INITIAL_EXTENDED_ASSETS: ComprehensiveAsset[] = [];

export const AssetsModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const isReports = currentPath === '/assets/reports';
  const isUsage = currentPath === '/assets/usage';

  const [data, setData] = useState<ComprehensiveAsset[]>(INITIAL_EXTENDED_ASSETS);

  useEffect(() => {
    const list = dataService.getGenericData('asset_items');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('asset_items');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');

  // Modals & Drawers state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ComprehensiveAsset | null>(null);
  const [detailItem, setDetailItem] = useState<ComprehensiveAsset | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrTarget, setQrTarget] = useState<ComprehensiveAsset | null>(null);

  const [form] = Form.useForm();
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: string }>>([]);

  useEffect(() => {
    void dataService.fetchOrgUnitsList().then((units) => {
      setDeptOptions(units.map((u) => ({ label: u, value: u })));
    });
  }, []);

  const totalOriginalPrice = data.reduce((sum, item) => sum + item.originalPrice, 0);
  const totalNetBookValue = data.reduce((sum, item) => sum + item.netBookValue, 0);
  const totalAccumulated = totalOriginalPrice - totalNetBookValue;
  const inUseCount = data.filter((d) => d.status === 'Đang sử dụng').length;
  const inStockCount = data.filter((d) => d.status === 'Trong kho').length;
  const inRepairCount = data.filter((d) => d.status === 'Đang sửa chữa').length;

  const handleOpenCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      code: `TS-IT-0${data.length + 20}`,
      barcode: `89360010${data.length + 20}`,
      purchaseDate: new Date().toISOString().substring(0, 10),
      warrantyExpiry: '2027-12-31',
      depreciationMonths: 36,
      category: 'Thiết bị IT',
      department: 'Phòng Ban Kỹ Thuật',
      assignedTo: 'Chưa cấp phát',
      location: 'Tầng 12 - Keangnam Landmark, Cầu Giấy, HN',
      status: 'Trong kho',
      originalPrice: 20000000,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (item: ComprehensiveAsset) => {
    setEditingItem(item);
    form.setFieldsValue(item);
    setModalOpen(true);
  };

  const handleSave = (values: any) => {
    const origPrice = Number(values.originalPrice) || 0;
    const depMonths = Number(values.depreciationMonths) || 36;
    const accum = values.accumulatedDepreciation !== undefined ? Number(values.accumulatedDepreciation) : 0;
    const netValue = Math.max(0, origPrice - accum);

    if (editingItem) {
      const updated = data.map((item) =>
        item.key === editingItem.key
          ? {
              ...item,
              ...values,
              originalPrice: origPrice,
              depreciationMonths: depMonths,
              accumulatedDepreciation: accum,
              netBookValue: netValue,
            }
          : item
      );
      setData(updated);
      dataService.saveGenericData('asset_items', updated);
      message.success(`Đã cập nhật thông tin tài sản: ${values.name}`);
    } else {
      const newItem: ComprehensiveAsset = {
        ...values,
        key: String(Date.now()),
        originalPrice: origPrice,
        depreciationMonths: depMonths,
        accumulatedDepreciation: 0,
        netBookValue: origPrice,
        status: values.status || 'Trong kho',
      };
      const nextItems = [newItem, ...data];
      setData(nextItems);
      dataService.saveGenericData('asset_items', nextItems);
      message.success(`Đã thêm mới tài sản thành công: ${values.name} (${values.code})`);
    }

    setModalOpen(false);
    form.resetFields();
  };

  const handleDelete = (asset: ComprehensiveAsset) => {
    Modal.confirm({
      title: 'Xác nhận xóa tài sản khỏi hệ thống?',
      content: `Bạn có chắc chắn muốn xóa tài sản "${asset.name}" (Mã: ${asset.code}) với nguyên giá ${asset.originalPrice.toLocaleString('vi-VN')} ₫ không? Thao tác này sẽ ghi nhận vào nhật ký kiểm toán.`,
      okText: 'Xác nhận xóa',
      cancelText: 'Hủy bỏ',
      okButtonProps: { danger: true },
      onOk: () => {
        const updated = data.filter((a) => a.key !== asset.key);
        setData(updated);
        dataService.saveGenericData('asset_items', updated);
        message.success(`Đã xóa tài sản ${asset.code}`);
      },
    });
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.barcode || '').includes(searchText) ||
      (item.model || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.assignedTo || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.location || '').toLowerCase().includes(searchText.toLowerCase());

    const matchCat = catFilter === 'all' || item.category === catFilter;
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchDept = deptFilter === 'all' || item.department === deptFilter;

    return matchSearch && matchCat && matchStatus && matchDept;
  });

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng nguyên giá tài sản toàn công ty</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {totalOriginalPrice.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{data.length} thiết bị &amp; tài sản đang quản trị</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Giá trị còn lại</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalNetBookValue.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>
            Hao mòn: {Math.round((totalAccumulated / totalOriginalPrice) * 100)}% ({totalAccumulated.toLocaleString('vi-VN')} ₫)
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hiện trạng khai thác &amp; Sử dụng</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {inUseCount} đang dùng / {inStockCount} trong kho
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>
            {inRepairCount > 0 ? `⚠️ ${inRepairCount} tài sản đang bảo dưỡng sửa chữa` : 'Tất cả thiết bị vận hành ổn định'}
          </div>
        </div>
      </div>

      {/* VIEW: REPORTS */}
      {isReports && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            <Card title="Cơ Cấu Giá Trị Tài Sản Theo Nhóm Chủng Loại" style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { name: 'Phương tiện & Vận chuyển', count: 1, val: 1480000000, color: '#2563EB' },
                  { name: 'Máy chủ & Hạ tầng IDC', count: 1, val: 240000000, color: '#009688' },
                  { name: 'Thiết bị IT', count: 3, val: 173500000, color: '#F59E0B' },
                  { name: 'Nội thất văn phòng', count: 1, val: 45000000, color: '#8B5CF6' },
                ].map((cat, idx) => {
                  const pct = Math.round((cat.val / totalOriginalPrice) * 100);
                  return (
                    <div key={idx}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                        <strong>{cat.name} ({cat.count} TS)</strong>
                        <span style={{ fontWeight: 700, color: cat.color }}>{cat.val.toLocaleString('vi-VN')} ₫ ({pct}%)</span>
                      </div>
                      <Progress percent={pct} strokeColor={cat.color} showInfo={false} size="small" />
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title="Mức Độ Khấu Hao Theo Phòng Ban Trực Thuộc" style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { dept: 'Ban Giám Đốc', total: 1480000000, net: 986666667 },
                  { dept: 'Khối Vận Hành & Khách Hàng', total: 240000000, net: 156000000 },
                  { dept: 'Phòng Ban Kỹ Thuật', total: 154000000, net: 104472223 },
                  { dept: 'Phòng Nhân Sự & Hành Chính', total: 45000000, net: 26250000 },
                ].map((d, idx) => (
                  <div key={idx} style={{ background: '#F8FAFC', padding: '10px 14px', borderRadius: 6, border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{d.dept}</strong>
                      <div style={{ fontSize: 12, color: '#64748B' }}>Nguyên giá: {d.total.toLocaleString('vi-VN')} ₫</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ color: '#009688', fontSize: 13.5 }}>{d.net.toLocaleString('vi-VN')} ₫</strong>
                      <div style={{ fontSize: 11.5, color: '#16A34A' }}>Giá trị còn lại</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* VIEW: USAGE HISTORY */}
      {isUsage && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Nhật Ký &amp; Lịch Sử Luân Chuyển Khai Thác Tài Sản Toàn Công Ty</h3>
            <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất nhật ký sử dụng tài sản')}>
              Xuất Nhật Ký
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={[
                { id: '1', date: '2026-06-12 09:30', code: 'TS-IT-019', name: 'Màn hình Dell UltraSharp 32', action: 'Nhập kho mua mới', actor: 'Lê Hoàng Yến (HR)', recipient: 'Kho Thiết Bị', note: 'Mua mới theo PO-2026-003' },
                { id: '2', date: '2026-03-20 14:00', code: 'TS-IT-002', name: 'Dell Precision 5680 Workstation', action: 'Bàn giao sử dụng', actor: 'Lê Hoàng Yến (HR)', recipient: 'Hoàng Quốc Dũng', note: 'Cấp phát cho Senior AI Engineer' },
                { id: '3', date: '2026-02-15 10:15', code: 'TS-IT-001', name: 'MacBook Pro 16 inch M3 Max', action: 'Bàn giao sử dụng', actor: 'Lê Hoàng Yến (HR)', recipient: 'Trần Tuấn Anh', note: 'Bàn giao thiết bị CTO' },
                { id: '4', date: '2023-11-10 16:45', code: 'TS-SRV-001', name: 'Máy Chủ Dell PowerEdge R760', action: 'Lắp đặt Data Center', actor: 'Đặng Đình Long', recipient: 'Viettel IDC Rack B12', note: 'Triển khai cụm Database' },
              ]}
              columns={[
                { title: 'Thời gian', dataIndex: 'date', key: 'date', width: 150 },
                { title: 'Mã & Tên tài sản', key: 'asset', render: (_: any, r: any) => <div><strong style={{ color: '#009688' }}>{r.code}</strong><div style={{ fontSize: 12 }}>{r.name}</div></div> },
                { title: 'Hành động', dataIndex: 'action', key: 'action', render: (a: string) => <Tag color="blue">{a}</Tag> },
                { title: 'Người thực hiện', dataIndex: 'actor', key: 'actor' },
                { title: 'Đơn vị / Người tiếp nhận', dataIndex: 'recipient', key: 'recipient', render: (rec: string) => <strong style={{ color: '#1E293B' }}>{rec}</strong> },
                { title: 'Ghi chú nghiệp vụ', dataIndex: 'note', key: 'note' },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: DEFAULT ASSET LISTING */}
      {!isReports && !isUsage && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Action Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Input
                prefix={<SearchOutlined style={{ color: '#bbb' }} />}
                placeholder="Tìm mã TS, tên, Barcode, Serial, người dùng, vị trí..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ width: 340, borderRadius: 6 }}
                allowClear
              />
              <Select
                value={catFilter}
                onChange={setCatFilter}
                style={{ width: 190 }}
                options={[
                  { label: 'Tất cả nhóm tài sản', value: 'all' },
                  { label: 'Thiết bị IT', value: 'Thiết bị IT' },
                  { label: 'Máy chủ & Hạ tầng IDC', value: 'Máy chủ & Hạ tầng IDC' },
                  { label: 'Nội thất văn phòng', value: 'Nội thất văn phòng' },
                  { label: 'Phương tiện & Vận chuyển', value: 'Phương tiện & Vận chuyển' },
                ]}
              />
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 160 }}
                options={[
                  { label: 'Tất cả trạng thái', value: 'all' },
                  { label: 'Đang sử dụng', value: 'Đang sử dụng' },
                  { label: 'Trong kho', value: 'Trong kho' },
                  { label: 'Đang sửa chữa', value: 'Đang sửa chữa' },
                  { label: 'Chờ thanh lý', value: 'Chờ thanh lý' },
                ]}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất danh mục tài sản cố định ra Excel')}>
                Xuất Excel
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleOpenCreate}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Thêm tài sản mới
              </Button>
            </div>
          </div>

          {/* Table Main */}
          <div className="transparent-table-card">
            <KTable
              dataSource={filteredData}
              columns={[
                {
                  title: 'Mã TS & Barcode',
                  key: 'code',
                  width: 140,
                  render: (_: any, r: ComprehensiveAsset) => (
                    <div>
                      <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <InboxOutlined /> {r.code}
                      </span>
                      <div style={{ fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <QrcodeOutlined /> {r.barcode}
                      </div>
                    </div>
                  ),
                },
                {
                  title: 'Tên tài sản & Model / Seri',
                  key: 'name',
                  render: (_: any, r: ComprehensiveAsset) => (
                    <div>
                      <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.name}</strong>
                      <div style={{ fontSize: 12, color: '#64748B' }}>{r.model}</div>
                    </div>
                  ),
                },
                {
                  title: 'Nhóm tài sản',
                  dataIndex: 'category',
                  key: 'category',
                  render: (c: string) => {
                    let color = 'blue';
                    if (c.includes('IT')) color = 'cyan';
                    if (c.includes('Máy chủ')) color = 'geekblue';
                    if (c.includes('Phương tiện')) color = 'purple';
                    if (c.includes('Nội thất')) color = 'orange';
                    return <Tag color={color}>{c}</Tag>;
                  },
                },
                {
                  title: 'Nguyên giá & Còn lại',
                  key: 'val',
                  render: (_: any, r: ComprehensiveAsset) => (
                    <div>
                      <strong style={{ color: '#0F172A' }}>{r.originalPrice.toLocaleString('vi-VN')} ₫</strong>
                      <div style={{ fontSize: 11.5, color: '#16A34A', fontWeight: 600 }}>
                        Còn lại: {r.netBookValue.toLocaleString('vi-VN')} ₫
                      </div>
                    </div>
                  ),
                },
                {
                  title: 'Người dùng & Phòng ban',
                  key: 'user',
                  render: (_: any, r: ComprehensiveAsset) => (
                    <div>
                      <div style={{ fontWeight: 600, color: r.assignedTo === 'Chưa cấp phát' ? '#94A3B8' : '#1E293B' }}>
                        {r.assignedTo}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#64748B' }}>{r.department}</div>
                    </div>
                  ),
                },
                {
                  title: 'Vị trí đặt',
                  dataIndex: 'location',
                  key: 'location',
                  render: (loc: string) => <span style={{ fontSize: 12, color: '#475569' }}>{loc}</span>,
                },
                {
                  title: 'Trạng thái',
                  dataIndex: 'status',
                  key: 'status',
                  render: (s: string) => {
                    let col = 'success';
                    if (s === 'Trong kho') col = 'processing';
                    if (s === 'Đang sửa chữa') col = 'warning';
                    if (s.includes('thanh lý')) col = 'error';
                    return <Tag color={col}>{s}</Tag>;
                  },
                },
                {
                  title: 'Thao tác',
                  key: 'act',
                  width: 140,
                  render: (_: any, r: ComprehensiveAsset) => (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => {
                          setDetailItem(r);
                          setDrawerOpen(true);
                        }}
                        title="Xem chi tiết hồ sơ tài sản"
                      />
                      <Button
                        size="small"
                        icon={<QrcodeOutlined />}
                        onClick={() => {
                          setQrTarget(r);
                          setQrModalOpen(true);
                        }}
                        title="In tem mã vạch QR"
                      />
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleOpenEdit(r)}
                        title="Chỉnh sửa tài sản"
                      />
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(r)}
                        title="Xóa tài sản"
                      />
                    </div>
                  ),
                },
              ]}
              pagination={{ pageSize: 8 }}
            />
          </div>
        </div>
      )}

      {/* MODAL: Thêm / Chỉnh sửa tài sản 100% trường nhập */}
      <Modal
        title={editingItem ? `Chỉnh sửa tài sản: ${editingItem.code}` : 'Thêm mới tài sản cố định / CCDC'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={760}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã tài sản" rules={[{ required: true, message: 'Nhập mã TS' }]}>
              <Input placeholder="Ví dụ: TS-IT-030" />
            </Form.Item>
            <Form.Item name="barcode" label="Mã Barcode / QR Quét" rules={[{ required: true, message: 'Nhập mã Barcode' }]}>
              <Input placeholder="Ví dụ: 8936001030" />
            </Form.Item>
            <Form.Item name="category" label="Nhóm tài sản" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Thiết bị IT', value: 'Thiết bị IT' },
                  { label: 'Máy chủ & Hạ tầng IDC', value: 'Máy chủ & Hạ tầng IDC' },
                  { label: 'Nội thất văn phòng', value: 'Nội thất văn phòng' },
                  { label: 'Phương tiện & Vận chuyển', value: 'Phương tiện & Vận chuyển' },
                  { label: 'Máy móc & Thiết bị kỹ thuật', value: 'Máy móc & Thiết bị kỹ thuật' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
            <Form.Item name="name" label="Tên tài sản" rules={[{ required: true, message: 'Nhập tên tài sản' }]}>
              <Input placeholder="Ví dụ: Laptop ThinkPad X1 Carbon Gen 11" />
            </Form.Item>
            <Form.Item name="model" label="Model / Số Serial thiết bị" rules={[{ required: true, message: 'Nhập Model/Serial' }]}>
              <Input placeholder="Ví dụ: 21HM004FVA / Serial: PF4590X" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="supplier" label="Nhà cung cấp / Đơn vị bán" initialValue="FPT Digital Retail JSC">
              <Input placeholder="Tên đơn vị bán hàng" />
            </Form.Item>
            <Form.Item name="purchaseDate" label="Ngày mua / Bắt đầu dùng" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="warrantyExpiry" label="Hạn bảo hành chính hãng">
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.9fr 0.9fr', gap: 12 }}>
            <Form.Item name="originalPrice" label="Nguyên giá mua vào (VNĐ)" rules={[{ required: true, message: 'Nhập nguyên giá' }]}>
              <Input type="number" min={0} step={1000000} placeholder="Ví dụ: 35000000" />
            </Form.Item>
            <Form.Item name="depreciationMonths" label="Thời gian khấu hao" rules={[{ required: true }]}>
              <Input type="number" min={1} placeholder="36 tháng" />
            </Form.Item>
            <Form.Item name="status" label="Trạng thái hiện tại" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Đang sử dụng', value: 'Đang sử dụng' },
                  { label: 'Trong kho', value: 'Trong kho' },
                  { label: 'Đang sửa chữa', value: 'Đang sửa chữa' },
                  { label: 'Chờ thanh lý', value: 'Chờ thanh lý' },
                  { label: 'Đã thanh lý', value: 'Đã thanh lý' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="department" label="Phòng ban / Khối quản lý" rules={[{ required: true }]}>
              <Select
                options={deptOptions.length > 0 ? deptOptions : [
                  { label: 'Ban Giám Đốc', value: 'Ban Giám Đốc' },
                ]}
                placeholder="Chọn phòng ban..."
              />
            </Form.Item>
            <Form.Item name="assignedTo" label="Cán bộ trực tiếp sử dụng" initialValue="Chưa cấp phát">
              <Input placeholder="Tên nhân viên hoặc ghi 'Dùng chung' / 'Chưa cấp phát'" />
            </Form.Item>
          </div>

          <Form.Item name="location" label="Vị trí lắp đặt / Bàn làm việc" initialValue="Tầng 12 - Keangnam Landmark, Cầu Giấy, HN">
            <Input placeholder="Địa điểm thực tế đặt tài sản" />
          </Form.Item>

          <Form.Item name="specs" label="Cấu hình kỹ thuật / Phụ kiện đính kèm">
            <Input.TextArea rows={2} placeholder="Chi tiết CPU, RAM, Ổ cứng, Cáp sạc, Túi chống sốc..." />
          </Form.Item>

          <Form.Item name="notes" label="Ghi chú nghiệp vụ">
            <Input placeholder="Mục đích sử dụng hoặc điều kiện bàn giao..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {editingItem ? 'Lưu cập nhật' : 'Tạo mới tài sản'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Hồ sơ chi tiết tài sản (Asset Passport) */}
      <Drawer
        title="Lý Lịch &amp; Hồ Sơ Tài Sản Doanh Nghiệp"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Badge */}
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>{detailItem.code}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{detailItem.name}</div>
                </div>
                <Tag color={detailItem.status === 'Đang sử dụng' ? 'success' : 'processing'}>{detailItem.status}</Tag>
              </div>
              <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 6 }}>{detailItem.model}</div>
            </div>

            {/* Financial Status */}
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: 14, borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E40AF', marginBottom: 8 }}>Giá Trị Tài Chính &amp; Khấu Hao</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
                <div>
                  <span style={{ color: '#64748B' }}>Nguyên giá:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 14 }}>{detailItem.originalPrice.toLocaleString('vi-VN')} ₫</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Giá trị còn lại:</span>
                  <div style={{ fontWeight: 700, color: '#16A34A', fontSize: 14 }}>{detailItem.netBookValue.toLocaleString('vi-VN')} ₫</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Hao mòn lũy kế:</span>
                  <div style={{ fontWeight: 600, color: '#DC2626' }}>{detailItem.accumulatedDepreciation.toLocaleString('vi-VN')} ₫</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Thời hạn trích:</span>
                  <div style={{ fontWeight: 600, color: '#2563EB' }}>{detailItem.depreciationMonths} tháng</div>
                </div>
              </div>
            </div>

            {/* Assignment & Location */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Người đang sử dụng:</span>
                <strong style={{ color: '#0F172A' }}>{detailItem.assignedTo}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Phòng ban quản lý:</span>
                <strong>{detailItem.department}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Vị trí lắp đặt:</span>
                <span>{detailItem.location}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Nhà cung cấp:</span>
                <span>{detailItem.supplier}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Ngày đưa vào sử dụng:</span>
                <strong>{detailItem.purchaseDate}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Hạn bảo hành:</span>
                <strong style={{ color: '#2563EB' }}>{detailItem.warrantyExpiry}</strong>
              </div>
            </div>

            {/* Specs & Notes */}
            <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
              <div style={{ fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>Cấu hình &amp; Ghi chú kỹ thuật:</div>
              <div style={{ color: '#475569' }}>{detailItem.specs || 'Không có ghi chú cấu hình'}</div>
              {detailItem.notes && <div style={{ color: '#64748B', marginTop: 4, fontStyle: 'italic' }}>* {detailItem.notes}</div>}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã xuất phiếu lý lịch tài sản ${detailItem.code} (PDF)`)}
              >
                In phiếu lý lịch tài sản
              </Button>
              <Button
                type="primary"
                icon={<QrcodeOutlined />}
                onClick={() => {
                  setQrTarget(detailItem);
                  setQrModalOpen(true);
                }}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Tạo tem nhãn Barcode / QR
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* MODAL: In nhãn Barcode & QR Code tài sản */}
      <Modal
        title="Tem Nhãn Mã QR &amp; Barcode Tài Sản"
        open={qrModalOpen}
        onCancel={() => setQrModalOpen(false)}
        footer={null}
        width={420}
      >
        {qrTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '16px 0' }}>
            <div style={{ width: 280, border: '2px dashed #009688', padding: 16, borderRadius: 8, textAlign: 'center', background: '#FAFAFA' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#009688', letterSpacing: 0.5 }}>CÔNG TY CP CÔNG NGHỆ KIYOVN</div>
              <div style={{ fontSize: 10, color: '#64748B', marginBottom: 12 }}>ASSET MANAGEMENT TAG</div>

              {/* QR Mockup Canvas */}
              <div style={{ width: 130, height: 130, margin: '0 auto', background: '#FFFFFF', border: '1px solid #CBD5E1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                <QrcodeOutlined style={{ fontSize: 84, color: '#0F172A' }} />
                <span style={{ fontSize: 9.5, fontWeight: 700, color: '#009688', marginTop: 2 }}>{qrTarget.barcode}</span>
              </div>

              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginTop: 10 }}>{qrTarget.name}</div>
              <div style={{ fontSize: 11.5, color: '#64748B' }}>Mã TS: <strong>{qrTarget.code}</strong></div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Bộ phận: {qrTarget.department}</div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => setQrModalOpen(false)}>Đóng</Button>
              <Button type="primary" icon={<PrinterOutlined />} onClick={() => message.success('Đã gửi lệnh in tem nhãn sang máy in Zebra/Brother!')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                In tem nhãn dán
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
