import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  EyeOutlined,
  PrinterOutlined,
  SwapOutlined,
  InboxOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
  AlertOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Card, Tag, Alert, Progress, Tooltip } from '../../custom-ui';

export interface StockHistoryItem {
  id: string;
  type: 'Nhập kho' | 'Xuất kho thay thế' | 'Kiểm kê điều chỉnh';
  ticketCode: string;
  date: string;
  qty: number;
  unitPrice: number;
  targetAsset: string;
  handler: string;
  reason: string;
}

export interface MaterialItem {
  key: string;
  materialCode: string;
  materialName: string;
  category: 'Linh kiện Máy chủ & Lưu trữ' | 'Thiết bị Quang & Mạng' | 'Ổ cứng & SSD Enterprise' | 'Phụ kiện Dây cáp & Cáp nguồn' | 'Vật tư Tiêu hao & CCDC';
  unit: string;
  specifications: string;
  supplier: string;
  stockQty: number;
  minThreshold: number;
  maxThreshold: number;
  unitPrice: number;
  warehouseLocation: string;
  compatibleAssets: string;
  warrantyMonths: number;
  status: 'Đủ tồn kho an toàn' | 'Cảnh báo sắp hết (Dưới mức tối thiểu)' | 'Hết hàng tồn (Out of Stock)';
  notes: string;
  stockHistory: StockHistoryItem[];
}

const INITIAL_MATERIALS: MaterialItem[] = [];

export const AssetMaterialsModule: React.FC = () => {
  const [data, setData] = useState<MaterialItem[]>(INITIAL_MATERIALS);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Modals & Drawers state
  const [modalOpen, setModalOpen] = useState(false);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MaterialItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<MaterialItem | null>(null);

  const [form] = Form.useForm();
  const [stockForm] = Form.useForm();

  // Metrics
  const totalValue = data.reduce((sum, item) => sum + item.stockQty * item.unitPrice, 0);
  const lowCount = data.filter((d) => d.status.includes('Cảnh báo') || d.status.includes('Hết hàng')).length;
  const outOfStockCount = data.filter((d) => d.stockQty === 0).length;
  const totalItemsCount = data.length;

  const handleOpenCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      materialCode: `LK-2026-0${data.length + 1}`,
      category: 'Linh kiện Máy chủ & Lưu trữ',
      unit: 'Cái',
      stockQty: 10,
      minThreshold: 4,
      maxThreshold: 30,
      unitPrice: 2500000,
      warehouseLocation: 'Tủ Linh Kiện IDC Viettel Duy Tân - Ngăn A3',
      warrantyMonths: 36,
    });
    setModalOpen(true);
  };

  const handleCreate = (values: any) => {
    const qty = Number(values.stockQty) || 0;
    const min = Number(values.minThreshold) || 4;
    let st: 'Đủ tồn kho an toàn' | 'Cảnh báo sắp hết (Dưới mức tối thiểu)' | 'Hết hàng tồn (Out of Stock)' = 'Đủ tồn kho an toàn';
    if (qty === 0) st = 'Hết hàng tồn (Out of Stock)';
    else if (qty <= min) st = 'Cảnh báo sắp hết (Dưới mức tối thiểu)';

    const newItem: MaterialItem = {
      ...values,
      key: String(Date.now()),
      stockQty: qty,
      minThreshold: min,
      maxThreshold: Number(values.maxThreshold) || 30,
      unitPrice: Number(values.unitPrice) || 0,
      warrantyMonths: Number(values.warrantyMonths) || 12,
      status: st,
      stockHistory: [
        {
          id: String(Date.now()),
          type: 'Nhập kho',
          ticketCode: `NK-2026-${Math.floor(100 + Math.random() * 900)}`,
          date: new Date().toISOString().substring(0, 10),
          qty: qty,
          unitPrice: Number(values.unitPrice) || 0,
          targetAsset: 'Kho tổng',
          handler: 'Nguyễn Văn Hải (Thủ kho)',
          reason: 'Nhập kho ban đầu',
        },
      ],
    };

    setData([newItem, ...data]);
    message.success(`Đã thêm mã vật tư/linh kiện mới: ${values.materialCode} (${values.materialName})`);
    setModalOpen(false);
    form.resetFields();
  };

  const handleOpenStockModal = (item: MaterialItem, defaultType: 'import' | 'export' = 'import') => {
    setSelectedItem(item);
    stockForm.resetFields();
    stockForm.setFieldsValue({
      actionType: defaultType,
      ticketCode: `${defaultType === 'import' ? 'NK' : 'XK'}-2026-${Math.floor(100 + Math.random() * 900)}`,
      date: new Date().toISOString().substring(0, 10),
      amount: 2,
      unitPrice: item.unitPrice,
      targetAsset: defaultType === 'export' ? 'TS-SRV-001 (Server Node 1)' : 'Nhập mua bổ sung theo PO',
      handler: 'Nguyễn Văn Hải (Thủ kho)',
      reason: defaultType === 'export' ? 'Thay thế linh kiện bảo trì định kỳ' : 'Nhập hàng từ nhà cung cấp',
    });
    setStockModalOpen(true);
  };

  const handleStockAction = (values: any) => {
    if (!selectedItem) return;
    const changeQty = Number(values.amount) || 0;
    const isImport = values.actionType === 'import';
    const newQty = isImport ? selectedItem.stockQty + changeQty : Math.max(0, selectedItem.stockQty - changeQty);

    let nextStatus: 'Đủ tồn kho an toàn' | 'Cảnh báo sắp hết (Dưới mức tối thiểu)' | 'Hết hàng tồn (Out of Stock)' = 'Đủ tồn kho an toàn';
    if (newQty === 0) nextStatus = 'Hết hàng tồn (Out of Stock)';
    else if (newQty <= selectedItem.minThreshold) nextStatus = 'Cảnh báo sắp hết (Dưới mức tối thiểu)';

    const newHistoryRow: StockHistoryItem = {
      id: String(Date.now()),
      type: isImport ? 'Nhập kho' : 'Xuất kho thay thế',
      ticketCode: values.ticketCode,
      date: values.date || new Date().toISOString().substring(0, 10),
      qty: changeQty,
      unitPrice: Number(values.unitPrice) || selectedItem.unitPrice,
      targetAsset: values.targetAsset || 'Kho chung',
      handler: values.handler || 'Nguyễn Văn Hải',
      reason: values.reason || '',
    };

    const updatedList = data.map((d) =>
      d.key === selectedItem.key
        ? {
            ...d,
            stockQty: newQty,
            status: nextStatus,
            stockHistory: [newHistoryRow, ...(d.stockHistory || [])],
          }
        : d
    );

    setData(updatedList);
    message.success(`Đã lập phiếu ${values.ticketCode} (${isImport ? 'Nhập' : 'Xuất'} ${changeQty} ${selectedItem.unit}) cho "${selectedItem.materialName}" thành công!`);
    setStockModalOpen(false);
    if (detailItem && detailItem.key === selectedItem.key) {
      setDetailItem({
        ...detailItem,
        stockQty: newQty,
        status: nextStatus,
        stockHistory: [newHistoryRow, ...(detailItem.stockHistory || [])],
      });
    }
    setSelectedItem(null);
    stockForm.resetFields();
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.materialCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.materialName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.specifications || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.warehouseLocation || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.supplier || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.compatibleAssets || '').toLowerCase().includes(searchText.toLowerCase());

    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchCat = categoryFilter === 'all' || item.category === categoryFilter;

    return matchSearch && matchStatus && matchCat;
  });

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng giá trị kho phụ tùng &amp; CCDC</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {totalValue.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>{totalItemsCount} chủng loại linh kiện máy chủ &amp; mạng</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Dưới định mức tồn an toàn (Safety Stock)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: lowCount > 0 ? '#DC2626' : '#16A34A', marginTop: 4 }}>
            {lowCount} mã linh kiện
          </div>
          <div style={{ fontSize: 11.5, color: lowCount > 0 ? '#DC2626' : '#16A34A', marginTop: 2 }}>
            {outOfStockCount > 0 ? `⚠️ ${outOfStockCount} mã đã hết hoàn toàn` : 'Đang ở ngưỡng cần nhập thêm'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ sẵn sàng phụ tùng (SLA Parts)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            98.5% sẵn sàng
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Ứng cứu sự cố phần cứng tức thì &lt; 2h</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Vị trí kho quản lý tập trung</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            4 kho &amp; tủ Rack IDC
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Viettel Duy Tân, Keangnam &amp; TP.HCM</div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo mã LK, tên, thông số, tủ kho, tương thích..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 340, borderRadius: 6 }}
            allowClear
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 220 }}
            options={[
              { label: 'Tất cả trạng thái tồn', value: 'all' },
              { label: 'Đủ tồn kho an toàn', value: 'Đủ tồn kho an toàn' },
              { label: 'Cảnh báo sắp hết (Dưới Min)', value: 'Cảnh báo sắp hết (Dưới mức tối thiểu)' },
              { label: 'Hết hàng tồn (0)', value: 'Hết hàng tồn (Out of Stock)' },
            ]}
          />
          <Select
            value={categoryFilter}
            onChange={setCategoryFilter}
            style={{ width: 220 }}
            options={[
              { label: 'Tất cả phân nhóm', value: 'all' },
              { label: 'Linh kiện Máy chủ & Lưu trữ', value: 'Linh kiện Máy chủ & Lưu trữ' },
              { label: 'Ổ cứng & SSD Enterprise', value: 'Ổ cứng & SSD Enterprise' },
              { label: 'Thiết bị Quang & Mạng', value: 'Thiết bị Quang & Mạng' },
              { label: 'Phụ kiện Dây cáp', value: 'Phụ kiện Dây cáp & Cáp nguồn' },
              { label: 'Vật tư Tiêu hao & CCDC', value: 'Vật tư Tiêu hao & CCDC' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất Báo Cáo Xuất - Nhập - Tồn Kho Vật Tư (Excel)')}>
            Xuất Báo Cáo Tồn
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm linh kiện mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={[
            {
              title: 'Mã & Phân nhóm',
              key: 'code',
              width: 170,
              render: (_: any, r: MaterialItem) => (
                <div>
                  <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AppstoreOutlined /> {r.materialCode}
                  </span>
                  <Tag color="blue" style={{ marginTop: 3, fontSize: 11 }}>
                    {r.category}
                  </Tag>
                </div>
              ),
            },
            {
              title: 'Tên vật tư & Thông số kỹ thuật',
              key: 'info',
              render: (_: any, r: MaterialItem) => (
                <div>
                  <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.materialName}</strong>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>{r.specifications}</div>
                  <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>
                    Vị trí: <strong>{r.warehouseLocation}</strong> · NCC: {r.supplier}
                  </div>
                </div>
              ),
            },
            {
              title: 'Tồn kho / Định mức an toàn',
              key: 'stock',
              width: 200,
              render: (_: any, r: MaterialItem) => {
                const isLow = r.stockQty <= r.minThreshold;
                const isOut = r.stockQty === 0;
                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 14, color: isOut ? '#DC2626' : isLow ? '#D97706' : '#16A34A' }}>
                        {r.stockQty} {r.unit}
                      </strong>
                      <span style={{ fontSize: 11.5, color: '#64748B' }}>
                        (Min: {r.minThreshold} · Max: {r.maxThreshold})
                      </span>
                    </div>
                    <Progress
                      percent={Math.min(100, Math.round((r.stockQty / (r.maxThreshold || 1)) * 100))}
                      size="small"
                      strokeColor={isOut ? '#DC2626' : isLow ? '#D97706' : '#009688'}
                      showInfo={false}
                    />
                  </div>
                );
              },
            },
            {
              title: 'Đơn giá & Tổng giá trị',
              key: 'val',
              width: 180,
              render: (_: any, r: MaterialItem) => (
                <div style={{ fontSize: 12 }}>
                  <div>Đơn giá: {r.unitPrice.toLocaleString('vi-VN')} ₫</div>
                  <div style={{ fontWeight: 700, color: '#0F172A', marginTop: 2 }}>
                    Tổng: {(r.stockQty * r.unitPrice).toLocaleString('vi-VN')} ₫
                  </div>
                </div>
              ),
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              key: 'status',
              render: (s: string) => {
                let col = 'success';
                if (s.includes('Cảnh báo')) col = 'warning';
                if (s.includes('Hết hàng')) col = 'error';
                return <Tag color={col}>{s}</Tag>;
              },
            },
            {
              title: 'Thao tác',
              key: 'act',
              width: 190,
              render: (_: any, r: MaterialItem) => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setDetailItem(r);
                      setDrawerOpen(true);
                    }}
                    title="Xem thẻ kho & lịch sử xuất nhập tồn"
                  >
                    Thẻ kho
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    icon={<InboxOutlined />}
                    onClick={() => handleOpenStockModal(r, 'import')}
                    style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                    title="Nhập thêm vật tư vào kho"
                  >
                    Nhập
                  </Button>
                  <Button
                    size="small"
                    icon={<SwapOutlined />}
                    onClick={() => handleOpenStockModal(r, 'export')}
                    disabled={r.stockQty <= 0}
                    title="Xuất kho thay thế cho thiết bị"
                  >
                    Xuất
                  </Button>
                </div>
              ),
            },
          ]}
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* MODAL: Thêm mã vật tư / linh kiện mới 100% trường nhập */}
      <Modal
        title="Thêm Mới Danh Mục Vật Tư &amp; Phụ Tùng Dự Phòng"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={760}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 12 }}>
            <Form.Item name="materialCode" label="Mã linh kiện / Vật tư" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: LK-NVME-05" />
            </Form.Item>
            <Form.Item name="category" label="Phân nhóm vật tư" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Linh kiện Máy chủ & Lưu trữ', value: 'Linh kiện Máy chủ & Lưu trữ' },
                  { label: 'Ổ cứng & SSD Enterprise', value: 'Ổ cứng & SSD Enterprise' },
                  { label: 'Thiết bị Quang & Mạng', value: 'Thiết bị Quang & Mạng' },
                  { label: 'Phụ kiện Dây cáp & Cáp nguồn', value: 'Phụ kiện Dây cáp & Cáp nguồn' },
                  { label: 'Vật tư Tiêu hao & CCDC', value: 'Vật tư Tiêu hao & CCDC' },
                ]}
              />
            </Form.Item>
            <Form.Item name="unit" label="Đơn vị tính (ĐVT)" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Thanh, Ổ, Cái, Sợi..." />
            </Form.Item>
          </div>

          <Form.Item name="materialName" label="Tên vật tư / Linh kiện phụ tùng" rules={[{ required: true, message: 'Nhập tên vật tư' }]}>
            <Input placeholder="Ví dụ: Nguồn Server Redundant Hot-plug PSU Dell 800W Platinum" />
          </Form.Item>

          <Form.Item name="specifications" label="Thông số kỹ thuật chi tiết" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Ví dụ: Input 100-240V, 50/60Hz, 80 PLUS Platinum 94% Efficiency, Hot-swap..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
            <Form.Item name="supplier" label="Nhà cung cấp / Hãng sản xuất" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Dell Technologies / NPP FPT Synnex" />
            </Form.Item>
            <Form.Item name="warehouseLocation" label="Vị trí ngăn tủ kho" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Tủ Linh Kiện IDC Viettel Duy Tân - Ngăn A2-01" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.2fr', gap: 12 }}>
            <Form.Item name="stockQty" label="Số lượng ban đầu" rules={[{ required: true }]}>
              <Input type="number" min={0} />
            </Form.Item>
            <Form.Item name="minThreshold" label="Tồn tối thiểu (Min)" rules={[{ required: true }]}>
              <Input type="number" min={1} />
            </Form.Item>
            <Form.Item name="maxThreshold" label="Tồn tối đa (Max)">
              <Input type="number" min={1} />
            </Form.Item>
            <Form.Item name="unitPrice" label="Đơn giá nhập (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={100000} placeholder="Ví dụ: 3500000" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12 }}>
            <Form.Item name="compatibleAssets" label="Thiết bị / Dòng máy tương thích">
              <Input placeholder="Ví dụ: Dell PowerEdge R750xs, R650, R740" />
            </Form.Item>
            <Form.Item name="warrantyMonths" label="Bảo hành (Tháng)">
              <Input type="number" min={0} placeholder="Ví dụ: 36" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu mã vật tư
            </Button>
          </div>
        </Form>
      </Modal>

      {/* MODAL: Nhập / Xuất kho (Mẫu 01-VT / 02-VT) */}
      <Modal
        title={`Phiếu Nhập / Xuất Kho Vật Tư: ${selectedItem?.materialName}`}
        open={stockModalOpen}
        onCancel={() => setStockModalOpen(false)}
        footer={null}
        width={560}
      >
        <Form form={stockForm} layout="vertical" onFinish={handleStockAction} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="actionType" label="Loại nghiệp vụ kho" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Nhập kho bổ sung (Mẫu 01-VT)', value: 'import' },
                  { label: 'Xuất kho thay thế/sửa chữa (Mẫu 02-VT)', value: 'export' },
                ]}
              />
            </Form.Item>
            <Form.Item name="ticketCode" label="Số phiếu chứng từ" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 12 }}>
            <Form.Item name="amount" label={`Số lượng (${selectedItem?.unit})`} rules={[{ required: true }]}>
              <Input type="number" min={1} />
            </Form.Item>
            <Form.Item name="date" label="Ngày thực hiện" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="unitPrice" label="Đơn giá (VNĐ)">
              <Input type="number" min={0} step={50000} />
            </Form.Item>
          </div>

          <Form.Item name="targetAsset" label="Tài sản nhận / Mục đích xuất dùng" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Thay thế cho Cụm Server Dell TS-SRV-001..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="handler" label="Người thực hiện / Thủ kho" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Nguyễn Văn Hải (Thủ kho)" />
            </Form.Item>
            <Form.Item name="reason" label="Lý do nhập/xuất">
              <Input placeholder="Ví dụ: Thay thế ổ hỏng, bảo dưỡng định kỳ..." />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setStockModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận ghi thẻ kho
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Xem Thẻ Kho Chi Tiết & Lịch Sử Xuất Nhập Tồn */}
      <Drawer
        title="Thẻ Kho Vật Tư &amp; Phụ Tùng (Mẫu Số 06 - VT)"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={650}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Bin Card */}
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>{detailItem.materialCode}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{detailItem.materialName}</div>
                </div>
                <Tag color={detailItem.stockQty <= detailItem.minThreshold ? 'error' : 'success'}>
                  {detailItem.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Thông số: {detailItem.specifications}
              </div>
            </div>

            {/* Warehouse & Specs Matrix */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#F0FDF4' }}>
                <div style={{ fontSize: 11, color: '#166534' }}>TỒN KHO HIỆN TẠI</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#16A34A', marginTop: 2 }}>
                  {detailItem.stockQty} {detailItem.unit}
                </div>
                <div style={{ fontSize: 11, color: '#64748B' }}>Định mức Min: {detailItem.minThreshold}</div>
              </div>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#EFF6FF' }}>
                <div style={{ fontSize: 11, color: '#1E40AF' }}>ĐƠN GIÁ NHẬP</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#2563EB', marginTop: 2 }}>
                  {detailItem.unitPrice.toLocaleString('vi-VN')} ₫
                </div>
                <div style={{ fontSize: 11, color: '#64748B' }}>BH: {detailItem.warrantyMonths}T</div>
              </div>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#F8FAFC' }}>
                <div style={{ fontSize: 11, color: '#64748B' }}>TỔNG GIÁ TRỊ TỒN</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
                  {(detailItem.stockQty * detailItem.unitPrice).toLocaleString('vi-VN')} ₫
                </div>
              </div>
            </div>

            {/* Compatible Details */}
            <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
              <div>Vị trí lưu kho: <strong>{detailItem.warehouseLocation}</strong></div>
              <div style={{ marginTop: 2 }}>Tương thích phần cứng: <strong>{detailItem.compatibleAssets || 'Đang cập nhật'}</strong></div>
              <div style={{ marginTop: 2 }}>Nhà cung cấp bảo hành: <strong>{detailItem.supplier}</strong></div>
            </div>

            {/* Stock Movement History Table */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Lịch sử xuất - nhập - tồn ({detailItem.stockHistory?.length || 0} chứng từ):
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ background: '#F1F5F9', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #CBD5E1' }}>Số phiếu &amp; Ngày</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #CBD5E1' }}>Nghiệp vụ</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #CBD5E1' }}>Số lượng</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #CBD5E1' }}>Tài sản nhận / Mục đích</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #CBD5E1' }}>Người lập</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItem.stockHistory?.map((row, idx) => (
                      <tr key={idx} style={{ background: row.type === 'Nhập kho' ? '#F0FDF4' : '#FFFFFF', borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '7px 10px', fontWeight: 600 }}>
                          <div>{row.ticketCode}</div>
                          <div style={{ fontSize: 11, color: '#64748B' }}>{row.date}</div>
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                          <Tag color={row.type === 'Nhập kho' ? 'success' : 'orange'}>
                            {row.type === 'Nhập kho' ? <ArrowDownOutlined /> : <ArrowUpOutlined />} {row.type}
                          </Tag>
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: row.type === 'Nhập kho' ? '#16A34A' : '#D97706' }}>
                          {row.type === 'Nhập kho' ? `+${row.qty}` : `-${row.qty}`} {detailItem.unit}
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <div>{row.targetAsset}</div>
                          {row.reason && <div style={{ fontSize: 11, color: '#64748B' }}>{row.reason}</div>}
                        </td>
                        <td style={{ padding: '7px 10px', color: '#475569' }}>{row.handler}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã xuất thẻ kho ${detailItem.materialCode} (Mẫu 06-VT PDF)`)}
                style={{ flex: 1 }}
              >
                In Thẻ Kho (PDF)
              </Button>
              <Button
                type="primary"
                icon={<InboxOutlined />}
                onClick={() => handleOpenStockModal(detailItem, 'import')}
                style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
              >
                Nhập kho
              </Button>
              <Button
                icon={<SwapOutlined />}
                onClick={() => handleOpenStockModal(detailItem, 'export')}
                disabled={detailItem.stockQty <= 0}
                style={{ flex: 1 }}
              >
                Xuất kho
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

