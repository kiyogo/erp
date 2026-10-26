import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  AuditOutlined,
  CalendarOutlined,
  SlidersOutlined,
  PrinterOutlined,
  LaptopOutlined,
  CarOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip, Progress } from '../../custom-ui';

export interface EnterpriseFixedAsset {
  key: string;
  code: string;
  name: string;
  category: 'Máy móc & Thiết bị CNTT' | 'Tài sản vô hình' | 'Phương tiện vận tải' | 'Nhà cửa & Vật kiến trúc';
  originalValue: number; // Nguyên giá
  depreciationMonths: number; // Thời gian trích khấu hao (tháng)
  monthlyDepreciation: number; // Khấu hao mỗi tháng
  accumulatedDepreciation: number; // Khấu hao lũy kế
  bookValue: number; // Giá trị còn lại
  department: string;
  commissioningDate: string; // Ngày đưa vào sử dụng
  serialNumber: string;
  supplier: string;
  status: 'Đang trích khấu hao' | 'Đã khấu hao hết';
}

const INITIAL_FIXED_ASSETS: EnterpriseFixedAsset[] = [];

export const FixedAssetsModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseFixedAsset[]>(INITIAL_FIXED_ASSETS);
  const [departmentOptions, setDepartmentOptions] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    const list = dataService.getGenericData('finance_fixed_assets');
    setData(Array.isArray(list) ? list : []);
    dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('finance_fixed_assets');
      setData(Array.isArray(updated) ? updated : []);
      dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<EnterpriseFixedAsset | null>(null);

  const totalOriginal = data.reduce((sum, item) => sum + item.originalValue, 0);
  const totalAccumulated = data.reduce((sum, item) => sum + item.accumulatedDepreciation, 0);
  const totalBookValue = totalOriginal - totalAccumulated;
  const totalMonthlyDepreciation = data
    .filter((d) => d.status === 'Đang trích khấu hao')
    .reduce((sum, item) => sum + item.monthlyDepreciation, 0);

  const handleCreate = (values: any) => {
    const orig = Number(values.originalValue) || 0;
    const months = Number(values.depreciationMonths) || 36;
    const monthly = Math.round(orig / months);
    const accum = Number(values.accumulatedDepreciation) || 0;
    const book = orig - accum;

    const newAsset: EnterpriseFixedAsset = {
      ...values,
      key: String(Date.now()),
      originalValue: orig,
      depreciationMonths: months,
      monthlyDepreciation: monthly,
      accumulatedDepreciation: accum,
      bookValue: book,
      serialNumber: values.serialNumber || `SN-${String(Date.now()).slice(-4)}`,
      status: book <= 0 ? 'Đã khấu hao hết' : 'Đang trích khấu hao',
    };
    const nextItems = [newAsset, ...data]; setData(nextItems); dataService.saveGenericData('finance_fixed_assets', nextItems);
    message.success(`Đã thêm mới tài sản cố định: ${values.name}`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter((item) => {
    const matchCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.serialNumber || '').toLowerCase().includes(searchText.toLowerCase());

    return matchCategory && matchSearch;
  });

  const columns = [
    {
      title: 'Mã TSCĐ & Danh mục',
      key: 'code',
      render: (_: any, record: EnterpriseFixedAsset) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <DatabaseOutlined /> {record.code}
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', fontWeight: 600, marginTop: 2 }}>
            {record.category}
          </div>
        </div>
      ),
    },
    {
      title: 'Tên tài sản cố định & Bộ phận',
      key: 'name',
      render: (_: any, record: EnterpriseFixedAsset) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.name}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            Quản lý: <strong>{record.department}</strong> · Ngày SD: {record.commissioningDate}
          </div>
        </div>
      ),
    },
    {
      title: 'Nguyên giá (VNĐ)',
      dataIndex: 'originalValue',
      key: 'originalValue',
      width: 170,
      render: (val: number) => (
        <span style={{ fontWeight: 800, color: '#1E40AF', fontSize: 13.5 }}>
          {val.toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Khấu hao tháng',
      dataIndex: 'monthlyDepreciation',
      key: 'monthlyDepreciation',
      width: 160,
      render: (val: number) => (
        <span style={{ color: '#D97706', fontWeight: 600, fontSize: 12.5 }}>
          {val.toLocaleString('vi-VN')} ₫/tháng
        </span>
      ),
    },
    {
      title: 'Giá trị còn lại',
      dataIndex: 'bookValue',
      key: 'bookValue',
      width: 180,
      render: (val: number, record: EnterpriseFixedAsset) => {
        const percent = Math.round((record.accumulatedDepreciation / record.originalValue) * 100);
        return (
          <div>
            <strong style={{ color: val > 0 ? '#16A34A' : '#64748B', fontSize: 13.5 }}>
              {val.toLocaleString('vi-VN')} ₫
            </strong>
            <div style={{ fontSize: 11, color: '#64748B' }}>
              Đã trích: {percent}%
            </div>
          </div>
        );
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (status: string) => (
        <Tag color={status === 'Đang trích khấu hao' ? 'processing' : 'default'}>{status}</Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterpriseFixedAsset) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedAsset(record);
            setDrawerOpen(true);
          }}
        >
          Thẻ TSCĐ
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng nguyên giá TSCĐ toàn công ty</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalOriginal.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>{data.length} Danh mục tài sản cố định hữu hình &amp; vô hình</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Khấu hao lũy kế đã trích (TK 214)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            {totalAccumulated.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>Đã trích khấu hao {Math.round((totalAccumulated / totalOriginal) * 100)}% tổng nguyên giá</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Giá trị còn lại thực tế</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalBookValue.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Ghi nhận vào Bảng Cân Đối Kế Toán</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chi phí khấu hao trích mỗi tháng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalMonthlyDepreciation.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Phân bổ vào giá thành và chi phí quản lý</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả TSCĐ' },
            { key: 'Máy móc & Thiết bị CNTT', label: 'Thiết bị CNTT', icon: <LaptopOutlined style={{ color: '#3B82F6' }} /> },
            { key: 'Tài sản vô hình (Phần mềm)', label: 'Phần mềm', icon: <DatabaseOutlined style={{ color: '#6366F1' }} /> },
            { key: 'Phương tiện vận tải', label: 'Phương tiện xe', icon: <CarOutlined style={{ color: '#0284C7' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setCategoryFilter(tab.key)}
              style={{
                backgroundColor: categoryFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: categoryFilter === tab.key ? '#009688' : '#CBD5E1',
                color: categoryFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: categoryFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã TSCĐ, tên tài sản, số serial..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất sổ tài sản cố định ra Excel')}>
            Xuất Sổ TSCĐ
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                code: `TSCĐ-00${data.length + 1}`,
                category: 'Máy móc & Thiết bị CNTT',
                department: 'Phòng Ban Kỹ Thuật',
                depreciationMonths: 36,
                commissioningDate: new Date().toISOString().substring(0, 10),
                accumulatedDepreciation: 0,
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm mới TSCĐ
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Thêm mới TSCĐ */}
      <Modal
        title="Thêm Mới Tài Sản Cố Định &amp; Đăng Ký Khung Khấu Hao"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã tài sản cố định" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="category" label="Loại hình tài sản" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Máy móc & Thiết bị CNTT', value: 'Máy móc & Thiết bị CNTT' },
                  { label: 'Tài sản vô hình', value: 'Tài sản vô hình (Phần mềm)' },
                  { label: 'Phương tiện vận tải', value: 'Phương tiện vận tải' },
                  { label: 'Nhà cửa & Vật kiến trúc', value: 'Nhà cửa & Vật kiến trúc' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="name" label="Tên tài sản cố định chi tiết" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Cụm Máy Chủ Dell PowerEdge R750" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="originalValue" label="Nguyên giá tài sản (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={10000000} />
            </Form.Item>
            <Form.Item name="depreciationMonths" label="Thời gian khấu hao" rules={[{ required: true }]}>
              <Input type="number" min={1} max={240} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="department" label="Bộ phận quản lý & Sử dụng" rules={[{ required: true, message: 'Vui lòng chọn bộ phận / phòng ban' }]}>
              <Select
                placeholder="Chọn bộ phận quản lý..."
                options={departmentOptions}
              />
            </Form.Item>
            <Form.Item name="commissioningDate" label="Ngày đưa vào sử dụng" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="serialNumber" label="Số Serial / Biển kiểm soát / License Key">
              <Input placeholder="Ví dụ: DELL-PE-R750-01" />
            </Form.Item>
            <Form.Item name="supplier" label="Nhà cung cấp / Nhà sản xuất" initialValue="Dell Technologies">
              <Input />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu tài sản cố định
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Thẻ TSCĐ & Phân Kỳ Khấu Hao */}
      <Drawer
        title="Thẻ Tài Sản Cố Định (Mẫu S21-DN) &amp; Khấu Hao"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedAsset && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ TSCĐ: {selectedAsset.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedAsset.name}
                  </div>
                </div>
                <Tag color={selectedAsset.status === 'Đang trích khấu hao' ? 'processing' : 'default'}>
                  {selectedAsset.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedAsset.category} · Serial: <code>{selectedAsset.serialNumber}</code>
              </div>
            </div>

            {/* Asset values & Depreciation */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Số Kế Toán &amp; Khấu Hao:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Nguyên giá tài sản:</span>
                  <strong style={{ color: '#1E40AF', fontSize: 15 }}>{selectedAsset.originalValue.toLocaleString('vi-VN')} ₫</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Khấu hao lũy kế đã trích:</span>
                  <strong style={{ color: '#DC2626' }}>{selectedAsset.accumulatedDepreciation.toLocaleString('vi-VN')} ₫</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Giá trị còn lại:</span>
                  <strong style={{ color: '#16A34A', fontSize: 15 }}>{selectedAsset.bookValue.toLocaleString('vi-VN')} ₫</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Mức trích khấu hao hàng tháng:</span>
                  <strong style={{ color: '#D97706' }}>{selectedAsset.monthlyDepreciation.toLocaleString('vi-VN')} ₫ / tháng</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thời gian khấu hao:</span>
                  <span>{selectedAsset.depreciationMonths} tháng (Từ: {selectedAsset.commissioningDate})</span>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#64748B', marginBottom: 4 }}>
                  <span>Tiến độ trích khấu hao</span>
                  <span>{Math.round((selectedAsset.accumulatedDepreciation / selectedAsset.originalValue) * 100)}%</span>
                </div>
                <Progress percent={Math.round((selectedAsset.accumulatedDepreciation / selectedAsset.originalValue) * 100)} strokeColor="#009688" />
              </div>
            </div>

            {/* Department & Supplier info */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AuditOutlined /> Đơn Vị Quản Lý &amp; Xuất Xứ:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: '#475569' }}>
                <div>Bộ phận trực tiếp sử dụng: <strong>{selectedAsset.department}</strong></div>
                <div>Đơn vị cung cấp / Lắp đặt: <strong>{selectedAsset.supplier}</strong></div>
              </div>
            </div>

            <Button
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              icon={<PrinterOutlined />}
              onClick={() => message.success(`Đã in Thẻ tài sản cố định ${selectedAsset.code}`)}
            >
              In Thẻ Tài Sản Cố Định (Mẫu S21-DN)
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};

