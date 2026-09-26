import React, { useState } from 'react';
import {
  useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  InboxOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  SwapOutlined,
  AlertOutlined,
  BarcodeOutlined,
  CalculatorOutlined,
  BarChartOutlined,
  PieChartOutlined,
  BuildOutlined,
  CheckSquareOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Card, Tag, Progress } from '../../custom-ui';

interface InventoryItem {
  key: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  stockQty: number;
  minQty: number;
  unitPrice: number;
  warehouse: string;
  categoryType: string;
  status: 'Đủ tồn kho' | 'Sắp hết hàng';
}

const INITIAL_INVENTORY: InventoryItem[] = [];

export const InventoryModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const [data, setData] = useState<InventoryItem[]>(INITIAL_INVENTORY);
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const isCharts = currentPath === '/finance/inventory/charts';
  const isImport = currentPath === '/finance/inventory/import';
  const isExport = currentPath === '/finance/inventory/export';
  const isTransfer = currentPath === '/finance/inventory/transfer';
  const isAssembly = currentPath === '/finance/inventory/assembly' || currentPath === '/finance/inventory/production';
  const isAudit = currentPath === '/finance/inventory/audit';
  const isCosting = currentPath === '/finance/inventory/costing';

  const totalInventoryValue = data.reduce((sum, item) => sum + item.stockQty * item.unitPrice, 0);
  const lowStockCount = data.filter((d) => d.status === 'Sắp hết hàng').length;

  const handleCreate = (values: any) => {
    const qty = Number(values.stockQty) || 0;
    const min = Number(values.minQty) || 5;
    const newItem: InventoryItem = {
      ...values,
      key: String(Date.now()),
      stockQty: qty,
      minQty: min,
      unitPrice: Number(values.unitPrice) || 0,
      categoryType: values.categoryType || 'Nhập kho',
      status: qty < min ? 'Sắp hết hàng' : 'Đủ tồn kho',
    };
    setData([newItem, ...data]);
    message.success(`Đã cập nhật kho: ${values.name}`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter(
    (item) =>
      (item.sku || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.warehouse || '').toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng giá trị hàng hóa tồn kho</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalInventoryValue.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số chủng loại linh kiện (SKU)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {data.length} mã mặt hàng
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Cảnh báo sắp hết hàng tồn</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: lowStockCount > 0 ? '#DC2626' : '#16A34A', marginTop: 4 }}>
            {lowStockCount} mặt hàng dưới mức min
          </div>
        </div>
      </div>

      {/* VIEW: CHARTS (Biểu đồ phân tích tồn kho) */}
      {isCharts && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            {/* Chart 1: Phân bổ giá trị tồn kho theo địa điểm kho */}
            <Card title="Phân Bổ Giá Trị Tồn Kho Theo Địa Điểm Kho" style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { name: 'Kho IDC Viettel Pháp Vân (Hà Nội)', value: 149300000, percent: 68.5, color: '#009688' },
                  { name: 'Kho IDC FPT Tân Thuận (TP.HCM)', value: 68000000, percent: 31.2, color: '#2563EB' },
                  { name: 'Kho Trụ Sở Chính (Hà Nội)', value: 720000, percent: 0.3, color: '#F59E0B' },
                ].map((wh, idx) => (
                  <div key={idx}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12.5 }}>
                      <strong>{wh.name}</strong>
                      <span style={{ fontWeight: 700, color: wh.color }}>{wh.value.toLocaleString('vi-VN')} ₫ ({wh.percent}%)</span>
                    </div>
                    <Progress percent={wh.percent} strokeColor={wh.color} />
                  </div>
                ))}
              </div>
            </Card>

            {/* Chart 2: Tốc độ luân chuyển hàng tồn kho */}
            <Card title="Tốc Độ Luân Chuyển Hàng Tồn Kho (Days of Inventory)" style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { category: 'RAM & CPU Server', days: '14 ngày', turnover: '26.1 vòng/năm', speed: 'Rất nhanh (A)' },
                  { category: 'Ổ cứng SSD Enterprise', days: '21 ngày', turnover: '17.4 vòng/năm', speed: 'Nhanh (A)' },
                  { category: 'Switch & Router Cisco', days: '45 ngày', turnover: '8.1 vòng/năm', speed: 'Trung bình (B)' },
                  { category: 'Cáp quang & Patch cord', days: '60 ngày', turnover: '6.0 vòng/năm', speed: 'Chậm (C)' },
                ].map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 12px', borderRadius: 6 }}>
                    <div>
                      <strong>{item.category}</strong>
                      <div style={{ fontSize: 11.5, color: '#64748B' }}>Vòng quay: {item.turnover}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <Tag color={item.speed.includes('nhanh') ? 'success' : 'blue'}>{item.speed}</Tag>
                      <div style={{ fontSize: 11.5, color: '#0F172A', fontWeight: 600, marginTop: 2 }}>{item.days} tồn kho TB</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* VIEW: IMPORT (Phiếu nhập kho) */}
      {isImport && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Danh Sách Phiếu Nhập Kho Vật Tư &amp; Linh Kiện (Stock In)</h3>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Tạo phiếu nhập kho
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={[
                { id: '1', code: 'PNK-2026-081', supplier: 'Dell Vietnam', warehouse: 'Kho IDC Viettel', items: '24x RAM Samsung 32GB DDR5 ECC', amount: 76800000, date: '2026-08-20', status: 'Đã nhập kho 100%' },
                { id: '2', code: 'PNK-2026-080', supplier: 'Kioxia Vietnam', warehouse: 'Kho IDC FPT Tân Thuận', items: '08x SSD Enterprise 3.84TB NVMe', amount: 68000000, date: '2026-08-15', status: 'Đã nhập kho 100%' },
              ]}
              columns={[
                { title: 'Mã phiếu nhập', dataIndex: 'code', key: 'code', render: (c: string) => <strong>{c}</strong> },
                { title: 'Nhà cung cấp', dataIndex: 'supplier', key: 'supplier' },
                { title: 'Kho nhận', dataIndex: 'warehouse', key: 'warehouse', render: (w: string) => <Tag color="blue">{w}</Tag> },
                { title: 'Chi tiết vật tư', dataIndex: 'items', key: 'items' },
                { title: 'Giá trị nhập', dataIndex: 'amount', key: 'amount', render: (v: number) => <strong style={{ color: '#009688' }}>{v.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Ngày nhập', dataIndex: 'date', key: 'date' },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag icon={<CheckOutlined />} color="success">{s}</Tag> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: EXPORT (Phiếu xuất kho) */}
      {isExport && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Danh Sách Phiếu Xuất Kho Cho Dự Án &amp; Khách Hàng (Stock Out)</h3>
            <Button type="primary" icon={<ArrowUpOutlined />} onClick={() => setModalOpen(true)} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Tạo phiếu xuất kho
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={[
                { id: '1', code: 'PXK-2026-042', project: 'Dự án AI Engine F-Global', warehouse: 'Kho IDC Viettel', items: '02x Switch Cisco Catalyst + 10x Cáp quang', amount: 30800000, date: '2026-08-22', status: 'Đã xuất kho' },
                { id: '2', code: 'PXK-2026-041', project: 'Bảo trì ngân hàng ACB', warehouse: 'Kho Trụ Sở Hà Nội', items: '02x Cáp quang LC-LC', amount: 360000, date: '2026-08-10', status: 'Đã xuất kho' },
              ]}
              columns={[
                { title: 'Mã phiếu xuất', dataIndex: 'code', key: 'code', render: (c: string) => <strong>{c}</strong> },
                { title: 'Dự án / Mục đích xuất', dataIndex: 'project', key: 'project', render: (p: string) => <strong style={{ color: '#2563EB' }}>{p}</strong> },
                { title: 'Kho xuất', dataIndex: 'warehouse', key: 'warehouse', render: (w: string) => <Tag color="orange">{w}</Tag> },
                { title: 'Chi tiết xuất', dataIndex: 'items', key: 'items' },
                { title: 'Giá trị vốn', dataIndex: 'amount', key: 'amount', render: (v: number) => `${v.toLocaleString('vi-VN')} ₫` },
                { title: 'Ngày xuất', dataIndex: 'date', key: 'date' },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag icon={<CheckOutlined />} color="success">{s}</Tag> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: TRANSFER (Điều chuyển kho) */}
      {isTransfer && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Lệnh Điều Chuyển Hàng Hóa Giữa Các Kho Chi Nhánh</h3>
            <Button type="primary" icon={<SwapOutlined />} onClick={() => message.info('Mở lệnh điều chuyển kho')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Tạo lệnh điều chuyển
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={[
                { id: '1', code: 'DCK-2026-012', from: 'Kho Trụ Sở Hà Nội', to: 'Kho IDC Viettel Pháp Vân', item: '04x Cáp quang nhảy quang LC-LC', reason: 'Tăng cường vật tư dự phòng rack IDC', date: '2026-08-25', status: 'Đang vận chuyển' },
              ]}
              columns={[
                { title: 'Mã điều chuyển', dataIndex: 'code', key: 'code', render: (c: string) => <strong>{c}</strong> },
                { title: 'Từ kho', dataIndex: 'from', key: 'from' },
                { title: 'Đến kho', dataIndex: 'to', key: 'to', render: (t: string) => <strong style={{ color: '#009688' }}>{t}</strong> },
                { title: 'Vật tư điều chuyển', dataIndex: 'item', key: 'item' },
                { title: 'Lý do', dataIndex: 'reason', key: 'reason' },
                { title: 'Ngày thực hiện', dataIndex: 'date', key: 'date' },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color="processing">{s}</Tag> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: AUDIT (Kiểm kê tồn kho) */}
      {isAudit && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Biên Bản Kiểm Kê Tồn Kho Thực Tế Định Kỳ</h3>
            <Button type="primary" icon={<CheckSquareOutlined />} onClick={() => message.info('Mở phiếu kiểm kê mới')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lập biên bản kiểm kê
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={[
                { id: '1', date: '2026-08-25', warehouse: 'Kho IDC Viettel', bookQty: 29, actualQty: 29, diff: 0, inspector: 'Nguyễn Văn Minh (Admin)', status: 'Khớp 100%' },
                { id: '2', date: '2026-08-20', warehouse: 'Kho IDC FPT Tân Thuận', bookQty: 8, actualQty: 8, diff: 0, inspector: 'Trần Tuấn Anh (Tech)', status: 'Khớp 100%' },
                { id: '3', date: '2026-08-15', warehouse: 'Kho Trụ Sở Hà Nội', bookQty: 4, actualQty: 4, diff: 0, inspector: 'Lê Hoàng Yến (HR)', status: 'Khớp 100%' },
              ]}
              columns={[
                { title: 'Ngày kiểm kê', dataIndex: 'date', key: 'date' },
                { title: 'Địa điểm kho', dataIndex: 'warehouse', key: 'warehouse', render: (w: string) => <strong>{w}</strong> },
                { title: 'Số lượng sổ sách', dataIndex: 'bookQty', key: 'bookQty' },
                { title: 'Số lượng thực tế', dataIndex: 'actualQty', key: 'actualQty' },
                { title: 'Chênh lệch', dataIndex: 'diff', key: 'diff', render: () => <Tag color="success">0 (Không lệch)</Tag> },
                { title: 'Cán bộ kiểm kê', dataIndex: 'inspector', key: 'inspector' },
                { title: 'Kết quả', dataIndex: 'status', key: 'status', render: (s: string) => <Tag icon={<CheckOutlined />} color="success">{s}</Tag> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: DEFAULT (Danh mục vật tư tồn kho) */}
      {!isCharts && !isImport && !isExport && !isTransfer && !isAudit && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Tìm theo mã SKU, tên linh kiện, vị trí kho..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 340, borderRadius: 6 }}
              allowClear
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.resetFields();
                setModalOpen(true);
              }}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Thêm mặt hàng kho
            </Button>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={filteredData}
              columns={[
                {
                  title: 'Mã SKU',
                  dataIndex: 'sku',
                  key: 'sku',
                  render: (sku: string) => <strong style={{ color: '#009688' }}>{sku}</strong>,
                },
                {
                  title: 'Tên vật tư / Thiết bị',
                  key: 'name',
                  render: (_: any, record: InventoryItem) => (
                    <div>
                      <div style={{ fontWeight: 600, color: '#1E293B' }}>{record.name}</div>
                      <div style={{ fontSize: 11.5, color: '#64748B' }}>Danh mục: {record.category} | ĐVT: {record.unit}</div>
                    </div>
                  ),
                },
                {
                  title: 'Vị trí kho',
                  dataIndex: 'warehouse',
                  key: 'warehouse',
                  render: (w: string) => <Tag color="blue">{w}</Tag>,
                },
                {
                  title: 'Số lượng tồn',
                  key: 'qty',
                  render: (_: any, record: InventoryItem) => (
                    <div>
                      <strong style={{ fontSize: 14, color: record.stockQty <= record.minQty ? '#DC2626' : '#0F172A' }}>
                        {record.stockQty} {record.unit}
                      </strong>
                      <div style={{ fontSize: 11, color: '#64748B' }}>Tối thiểu: {record.minQty}</div>
                    </div>
                  ),
                },
                {
                  title: 'Đơn giá vốn',
                  dataIndex: 'unitPrice',
                  key: 'unitPrice',
                  render: (p: number) => `${p.toLocaleString('vi-VN')} ₫`,
                },
                {
                  title: 'Thành tiền',
                  key: 'total',
                  render: (_: any, record: InventoryItem) => (
                    <strong style={{ color: '#009688' }}>
                      {(record.stockQty * record.unitPrice).toLocaleString('vi-VN')} ₫
                    </strong>
                  ),
                },
                {
                  title: 'Trạng thái',
                  dataIndex: 'status',
                  key: 'status',
                  render: (st: string) => (
                    <Tag color={st === 'Đủ tồn kho' ? 'success' : 'error'}>{st}</Tag>
                  ),
                },
              ]}
              pagination={{ pageSize: 10 }}
            />
          </div>
        </div>
      )}

      {/* Modal Add Item */}
      <Modal
        title="Thêm mặt hàng / Linh kiện mới vào kho"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item name="sku" label="Mã SKU" initialValue={`SKU-IT-0${data.length + 1}`} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="Tên linh kiện / Vật tư" rules={[{ required: true, message: 'Nhập tên mặt hàng' }]}>
            <Input placeholder="Ví dụ: Bộ nguồn Redundant PSU Server 750W" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="category" label="Nhóm danh mục" initialValue="Linh kiện phần cứng">
              <Input />
            </Form.Item>
            <Form.Item name="unit" label="Đơn vị tính (ĐVT)" initialValue="Chiếc">
              <Input />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="stockQty" label="Số lượng ban đầu" initialValue={10} rules={[{ required: true }]}>
              <Input type="number" min={0} />
            </Form.Item>
            <Form.Item name="unitPrice" label="Đơn giá vốn (VNĐ)" initialValue={2500000} rules={[{ required: true }]}>
              <Input type="number" min={0} />
            </Form.Item>
          </div>
          <Form.Item name="warehouse" label="Lưu trữ tại kho" initialValue="Kho IDC Viettel">
            <Select
              options={[
                { label: 'Kho IDC Viettel Pháp Vân (Hà Nội)', value: 'Kho IDC Viettel' },
                { label: 'Kho IDC FPT Tân Thuận (TP.HCM)', value: 'Kho IDC FPT Tân Thuận' },
                { label: 'Kho Trụ Sở Chính (Hà Nội)', value: 'Kho Trụ Sở Hà Nội' },
              ]}
            />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận thêm
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
