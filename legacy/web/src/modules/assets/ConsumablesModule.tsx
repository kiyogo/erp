import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  InboxOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ImportOutlined,
  ExportOutlined,
  EyeOutlined,
  PrinterOutlined,
  ShopOutlined,
  BarcodeOutlined,
  DollarOutlined,
  ThunderboltOutlined,
  SwapOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  CoffeeOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Card, Tag, Alert, Progress, Tooltip } from '../../custom-ui';

export interface ConsumableStockHistory {
  ticketCode: string;
  date: string;
  type: 'Nhập kho' | 'Xuất cấp phát';
  qty: number;
  department: string;
  receiver: string;
  reason: string;
}

export interface ConsumableItem {
  key: string;
  itemCode: string;
  itemName: string;
  category: 'Văn phòng phẩm tiêu hao' | 'Mực & Phụ kiện máy in' | 'Thẻ từ & Thiết bị IoT Smart Office' | 'CCDC Văn phòng & Tiện ích' | 'Pantry & Đời sống CBNV' | 'Vật tư Vệ sinh & Y tế';
  unit: string;
  stockQty: number;
  minThreshold: number;
  maxThreshold: number;
  unitPrice: number;
  location: string;
  supplier: string;
  monthlyUsageAvg: number;
  status: 'Đủ tồn kho an toàn' | 'Sắp hết hàng' | 'Hết hàng tồn';
  stockHistory: ConsumableStockHistory[];
  notes: string;
}

import { useEffect } from 'react';
import { collectionsApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';

export const ConsumablesModule: React.FC = () => {
  const [data, setData] = useState<ConsumableItem[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<ConsumableItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stockActionType, setStockActionType] = useState<'import' | 'export'>('import');

  const [form] = Form.useForm();
  const [stockForm] = Form.useForm();

  const loadData = async () => {
    try {
      const [res, orgUnits] = await Promise.all([
        collectionsApi.get<ConsumableItem>('asset_consumables', { limit: 500 }),
        dataService.fetchOrgUnitsList(),
      ]);
      const list = res.data?.data || [];
      setData(list.map((item: any) => ({ ...item, key: item.id || item.key })));
      setDeptOptions(orgUnits.map((u) => ({ label: u, value: u })));
    } catch {
      setData([]);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Metrics
  const totalValue = data.reduce((sum, item) => sum + item.stockQty * item.unitPrice, 0);
  const lowStockCount = data.filter((d) => d.status.includes('Sắp hết') || d.status.includes('Hết hàng')).length;
  const outOfStockCount = data.filter((d) => d.stockQty === 0).length;

  const handleOpenCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      itemCode: `VPP-SKU-0${data.length + 1}`,
      category: 'Văn phòng phẩm tiêu hao',
      unit: 'Hộp',
      stockQty: 20,
      minThreshold: 5,
      maxThreshold: 50,
      unitPrice: 150000,
      location: 'Kho Hành Chính Keangnam - Tầng 4',
      supplier: 'Công ty Cổ Phần Văn Phòng Phẩm Hồng Hà',
      monthlyUsageAvg: 5,
    });
    setModalOpen(true);
  };

  const handleCreate = async (values: any) => {
    const qty = Number(values.stockQty) || 0;
    const min = Number(values.minThreshold) || 5;
    const max = Number(values.maxThreshold) || 50;

    let st: ConsumableItem['status'] = 'Đủ tồn kho an toàn';
    if (qty === 0) st = 'Hết hàng tồn';
    else if (qty <= min) st = 'Sắp hết hàng';

    const id = `item-${Date.now()}`;
    const newItem: ConsumableItem = {
      ...values,
      key: id,
      stockQty: qty,
      minThreshold: min,
      maxThreshold: max,
      unitPrice: Number(values.unitPrice) || 50000,
      monthlyUsageAvg: Number(values.monthlyUsageAvg) || 5,
      status: st,
      stockHistory: [
        {
          ticketCode: `NK-VPP-INIT-${Date.now().toString().slice(-4)}`,
          date: new Date().toISOString().substring(0, 10),
          type: 'Nhập kho',
          qty: qty,
          department: 'Kho Tổng',
          receiver: 'Thủ kho Hành chính',
          reason: 'Khai báo tồn kho đầu kỳ',
        },
      ],
    };

    try {
      await collectionsApi.create('asset_consumables', newItem, id);
      message.success(`Đã thêm vật phẩm tiêu hao mới: ${values.itemName}`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tạo vật phẩm tiêu hao.');
    }
  };

  const handleOpenStockModal = (item: ConsumableItem, type: 'import' | 'export') => {
    setDetailItem(item);
    setStockActionType(type);
    stockForm.resetFields();
    stockForm.setFieldsValue({
      ticketCode: `${type === 'import' ? 'NK' : 'XK'}-VPP-${Date.now().toString().slice(-4)}`,
      actionType: type,
      amount: type === 'import' ? 10 : 1,
      department: type === 'import' ? 'Kho Hành Chính' : 'Khối Kỹ Thuật Dev',
      receiver: 'Cán bộ nhận cấp phát',
      reason: type === 'import' ? 'Nhập bổ sung định kỳ' : 'Cấp phát sử dụng theo yêu cầu phòng ban',
    });
    setStockModalOpen(true);
  };

  const handleStockAction = async (values: any) => {
    if (!detailItem) return;
    const changeQty = Number(values.amount) || 0;
    const isImport = values.actionType === 'import';

    if (!isImport && changeQty > detailItem.stockQty) {
      message.error(`Không thể xuất quá số lượng tồn kho hiện tại (${detailItem.stockQty} ${detailItem.unit})!`);
      return;
    }

    const newQty = isImport ? detailItem.stockQty + changeQty : detailItem.stockQty - changeQty;

    let newStatus: ConsumableItem['status'] = 'Đủ tồn kho an toàn';
    if (newQty === 0) newStatus = 'Hết hàng tồn';
    else if (newQty <= detailItem.minThreshold) newStatus = 'Sắp hết hàng';

    const newHistory: ConsumableStockHistory = {
      ticketCode: values.ticketCode || `${isImport ? 'NK' : 'XK'}-VPP-001`,
      date: new Date().toISOString().substring(0, 10),
      type: isImport ? 'Nhập kho' : 'Xuất cấp phát',
      qty: changeQty,
      department: values.department || 'Phòng Hành Chính',
      receiver: values.receiver || 'Người nhận',
      reason: values.reason || 'Nghiệp vụ kho',
    };

    const updatedItem = {
      ...detailItem,
      stockQty: newQty,
      status: newStatus,
      stockHistory: [newHistory, ...(detailItem.stockHistory || [])],
    };

    try {
      await collectionsApi.update('asset_consumables', detailItem.key, updatedItem);
      setDetailItem(updatedItem);
      message.success(`Đã ${isImport ? 'nhập thêm' : 'xuất cấp phát'} ${changeQty} ${detailItem.unit} thành công!`);
      setStockModalOpen(false);
      await loadData();
    } catch {
      message.error('Không thể cập nhật xuất/nhập kho.');
    }
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.itemCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.itemName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.category || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.location || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.supplier || '').toLowerCase().includes(searchText.toLowerCase());

    const matchCat = categoryFilter === 'all' || item.category === categoryFilter;
    const matchSt = statusFilter === 'all' || item.status === statusFilter;

    return matchSearch && matchCat && matchSt;
  });

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng giá trị vật phẩm tồn kho</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalValue.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>{data.length} mặt hàng SKU lưu kho</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Dưới định mức an toàn</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: lowStockCount > 0 ? '#DC2626' : '#16A34A', marginTop: 4 }}>
            {lowStockCount} mặt hàng
          </div>
          <div style={{ fontSize: 11.5, color: lowStockCount > 0 ? '#DC2626' : '#16A34A', marginTop: 2 }}>
            {outOfStockCount > 0 ? `⚠️ Có ${outOfStockCount} mặt hàng đã hết tồn kho (0)` : 'Cần lập đơn mua sắm bổ sung'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ đáp ứng cấp phát phòng ban</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            99.6% tức thì
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Thời gian giao vật tư nội bộ &lt; 15 phút</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Vị trí kho lưu trữ phân phối</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            3 Điểm kho
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Keangnam Tầng 4, Tầng 14 &amp; Chi nhánh</div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo mã, tên mặt hàng, phân nhóm, vị trí kho..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 340, borderRadius: 6 }}
            allowClear
          />
          <Select
            value={categoryFilter}
            onChange={setCategoryFilter}
            style={{ width: 230 }}
            options={[
              { label: 'Tất cả phân nhóm', value: 'all' },
              { label: 'Văn phòng phẩm tiêu hao', value: 'Văn phòng phẩm tiêu hao' },
              { label: 'Mực & Phụ kiện máy in', value: 'Mực & Phụ kiện máy in' },
              { label: 'Thẻ từ & Thiết bị IoT', value: 'Thẻ từ & Thiết bị IoT Smart Office' },
              { label: 'CCDC Văn phòng & Tiện ích', value: 'CCDC Văn phòng & Tiện ích' },
              { label: 'Pantry & Đời sống CBNV', value: 'Pantry & Đời sống CBNV' },
            ]}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 180 }}
            options={[
              { label: 'Tất cả trạng thái', value: 'all' },
              { label: 'Đủ tồn kho an toàn', value: 'Đủ tồn kho an toàn' },
              { label: 'Sắp hết hàng', value: 'Sắp hết hàng (Cần nhập)' },
              { label: 'Hết hàng tồn', value: 'Hết hàng tồn' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất báo cáo xuất-nhập-tồn CCDC & vật tư tiêu hao')}>
            Xuất Excel
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm mặt hàng mới
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
              render: (_: any, r: ConsumableItem) => (
                <div>
                  <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <InboxOutlined /> {r.itemCode}
                  </span>
                  <Tag color="cyan" style={{ marginTop: 3, fontSize: 11 }}>
                    {r.category.split(' ')[0]}
                  </Tag>
                </div>
              ),
            },
            {
              title: 'Tên vật phẩm tiêu hao & Quy cách',
              key: 'name',
              render: (_: any, r: ConsumableItem) => (
                <div>
                  <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.itemName}</strong>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    Vị trí: <strong style={{ color: '#2563EB' }}>{r.location}</strong> · ĐVT: <strong>{r.unit}</strong>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>
                    Nhà cung cấp: <em>{r.supplier}</em> · Tiêu hao: ~{r.monthlyUsageAvg} {r.unit}/tháng
                  </div>
                </div>
              ),
            },
            {
              title: 'Tồn kho / Mức an toàn',
              key: 'stock',
              width: 190,
              render: (_: any, r: ConsumableItem) => {
                const isDanger = r.stockQty <= r.minThreshold;
                const pct = Math.min(100, Math.round((r.stockQty / (r.maxThreshold || 50)) * 100));
                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                      <span style={{ fontWeight: 800, color: isDanger ? '#DC2626' : '#16A34A' }}>
                        {r.stockQty} {r.unit}
                      </span>
                      <span style={{ color: '#64748B', fontSize: 11 }}>Min: {r.minThreshold}</span>
                    </div>
                    <Progress percent={pct} size="small" strokeColor={isDanger ? '#DC2626' : '#009688'} showInfo={false} />
                  </div>
                );
              },
            },
            {
              title: 'Đơn giá & Tổng giá trị',
              key: 'price',
              width: 170,
              render: (_: any, r: ConsumableItem) => (
                <div>
                  <div style={{ fontWeight: 700, color: '#009688', fontSize: 13 }}>
                    {(r.stockQty * r.unitPrice).toLocaleString('vi-VN')} ₫
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>
                    Đơn giá: {r.unitPrice.toLocaleString('vi-VN')} ₫/{r.unit}
                  </div>
                </div>
              ),
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              key: 'status',
              width: 160,
              render: (s: string) => {
                let col = 'success';
                if (s === 'Sắp hết hàng') col = 'warning';
                if (s === 'Hết hàng tồn') col = 'error';
                return <Tag color={col}>{s}</Tag>;
              },
            },
            {
              title: 'Thao tác',
              key: 'act',
              width: 160,
              render: (_: any, r: ConsumableItem) => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setDetailItem(r);
                      setDrawerOpen(true);
                    }}
                    title="Xem thẻ kho & lịch sử cấp phát"
                  >
                    Thẻ kho
                  </Button>
                  <Button
                    size="small"
                    icon={<SwapOutlined />}
                    onClick={() => handleOpenStockModal(r, 'export')}
                    disabled={r.stockQty <= 0}
                    style={{ color: '#009688', borderColor: '#009688' }}
                    title="Xuất cấp phát cho phòng ban"
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

      {/* MODAL: Thêm Mặt Hàng Tiêu Hao Mới 100% trường nhập */}
      <Modal
        title="Thêm Mới Mặt Hàng &amp; CCDC Tiêu Hao Vào Kho"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={760}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 12 }}>
            <Form.Item name="itemCode" label="Mã vật phẩm (SKU)" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: VPP-BUT-01" />
            </Form.Item>
            <Form.Item name="category" label="Phân nhóm vật phẩm" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Văn phòng phẩm tiêu hao', value: 'Văn phòng phẩm tiêu hao' },
                  { label: 'Mực & Phụ kiện máy in', value: 'Mực & Phụ kiện máy in' },
                  { label: 'Thẻ từ & Thiết bị IoT Smart Office', value: 'Thẻ từ & Thiết bị IoT Smart Office' },
                  { label: 'CCDC Văn phòng & Tiện ích', value: 'CCDC Văn phòng & Tiện ích' },
                  { label: 'Pantry & Đời sống CBNV', value: 'Pantry & Đời sống CBNV' },
                  { label: 'Vật tư Vệ sinh & Y tế', value: 'Vật tư Vệ sinh & Y tế' },
                ]}
              />
            </Form.Item>
            <Form.Item name="unit" label="Đơn vị tính" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Thùng, Hộp, Cái..." />
            </Form.Item>
          </div>

          <Form.Item name="itemName" label="Tên mặt hàng & Quy cách chi tiết" rules={[{ required: true, message: 'Nhập tên mặt hàng' }]}>
            <Input placeholder="Ví dụ: Bút bi Gel xóa được Pilot Frixion Ball 0.5mm Xanh" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.2fr', gap: 12 }}>
            <Form.Item name="stockQty" label="Số lượng tồn kho" rules={[{ required: true }]}>
              <Input type="number" min={0} />
            </Form.Item>
            <Form.Item name="minThreshold" label="Tồn an toàn tối thiểu (Min)" rules={[{ required: true }]}>
              <Input type="number" min={1} />
            </Form.Item>
            <Form.Item name="maxThreshold" label="Tồn tối đa (Max)">
              <Input type="number" min={1} />
            </Form.Item>
            <Form.Item name="unitPrice" label="Đơn giá nhập (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={10000} placeholder="Ví dụ: 120000" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="location" label="Vị trí ngăn tủ lưu kho" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Kho Tầng 4 - Tủ B3" />
            </Form.Item>
            <Form.Item name="supplier" label="Nhà cung cấp / Đối tác" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Cty Văn Phòng Phẩm Hồng Hà" />
            </Form.Item>
            <Form.Item name="monthlyUsageAvg" label="Tiêu hao TB/tháng">
              <Input type="number" min={0} placeholder="Ví dụ: 5" />
            </Form.Item>
          </div>

          <Form.Item name="notes" label="Ghi chú chi tiết & Yêu cầu bảo quản">
            <Input.TextArea rows={2} placeholder="Nhập các điều kiện bảo quản nhiệt độ hoặc quy định cấp phát..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu mặt hàng
            </Button>
          </div>
        </Form>
      </Modal>

      {/* MODAL: Lập Phiếu Nhập / Xuất Cấp Phát (Phiếu 01-VT / 02-VT) */}
      <Modal
        title={stockActionType === 'import' ? `📥 Lập Phiếu Nhập Kho: ${detailItem?.itemName}` : `📤 Lập Phiếu Xuất Cấp Phát: ${detailItem?.itemName}`}
        open={stockModalOpen}
        onCancel={() => setStockModalOpen(false)}
        footer={null}
        width={560}
      >
        <Form form={stockForm} layout="vertical" onFinish={handleStockAction} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 12 }}>
            <Form.Item name="ticketCode" label="Số phiếu" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="actionType" label="Loại nghiệp vụ" rules={[{ required: true }]}>
              <Select
                value={stockActionType}
                onChange={(val) => setStockActionType(val)}
                options={[
                  { label: 'Nhập kho thêm vật phẩm', value: 'import' },
                  { label: 'Xuất kho cấp phát sử dụng', value: 'export' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 12 }}>
            <Form.Item name="amount" label={`Số lượng (${detailItem?.unit})`} rules={[{ required: true }]}>
              <Input type="number" min={1} max={stockActionType === 'export' ? detailItem?.stockQty : 9999} />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban tiếp nhận / Nguồn nhập" rules={[{ required: true }]}>
              <Select
                options={deptOptions.length > 0 ? deptOptions : [
                  { label: 'Ban Giám Đốc', value: 'Ban Giám Đốc' },
                ]}
                placeholder="Chọn phòng ban..."
              />
            </Form.Item>
          </div>

          <Form.Item name="receiver" label="Người giao / Cán bộ nhận cấp phát" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Nguyễn Văn Hải" />
          </Form.Item>

          <Form.Item name="reason" label="Lý do &amp; Mục đích sử dụng">
            <Input.TextArea rows={2} placeholder="Ví dụ: Cấp phát phục vụ sự kiện Hackathon Q3 hoặc nạp mực in..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setStockModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận ghi sổ kho
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Thẻ Kho Chi Tiết (Mẫu 06-VT) & Lịch Sử Cấp Phát */}
      <Drawer
        title="Thẻ Kho Chi Tiết &amp; Sổ Lịch Sử Xuất - Nhập - Tồn"
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
                  <div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>{detailItem.itemCode}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{detailItem.itemName}</div>
                </div>
                <Tag color={detailItem.stockQty <= detailItem.minThreshold ? 'error' : 'success'}>
                  {detailItem.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Phân nhóm: <strong>{detailItem.category}</strong> · Vị trí: <strong>{detailItem.location}</strong>
              </div>
            </div>

            {/* Matrix Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#F0FDF4' }}>
                <div style={{ fontSize: 11, color: '#166534' }}>TỒN KHO HIỆN TẠI</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#16A34A', marginTop: 2 }}>
                  {detailItem.stockQty} {detailItem.unit}
                </div>
                <div style={{ fontSize: 11, color: '#64748B' }}>Định mức an toàn: &gt;= {detailItem.minThreshold}</div>
              </div>

              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#EFF6FF' }}>
                <div style={{ fontSize: 11, color: '#1E40AF' }}>ĐƠN GIÁ ĐỊNH MỨC</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#2563EB', marginTop: 2 }}>
                  {detailItem.unitPrice.toLocaleString('vi-VN')} ₫
                </div>
                <div style={{ fontSize: 11, color: '#64748B' }}>ĐVT: {detailItem.unit}</div>
              </div>

              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#FFFBEB' }}>
                <div style={{ fontSize: 11, color: '#B45309' }}>TỔNG GIÁ TRỊ TỒN</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#D97706', marginTop: 2 }}>
                  {(detailItem.stockQty * detailItem.unitPrice).toLocaleString('vi-VN')} ₫
                </div>
                <div style={{ fontSize: 11, color: '#64748B' }}>Nhà CC: {detailItem.supplier.split(' ')[0]}</div>
              </div>
            </div>

            {/* Supplier & Spec Info */}
            <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
              <div>Nhà cung cấp: <strong>{detailItem.supplier}</strong></div>
              <div style={{ marginTop: 2 }}>Định mức tiêu thụ dự kiến: <strong>~{detailItem.monthlyUsageAvg} {detailItem.unit}/tháng</strong></div>
              {detailItem.notes && <div style={{ marginTop: 2, color: '#64748B' }}>Ghi chú: {detailItem.notes}</div>}
            </div>

            {/* Movement Ledger */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                <FileTextOutlined /> Nhật Ký Xuất - Nhập Kho:
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #F1F5F9', borderRadius: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ background: '#F8FAFC', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>Số phiếu &amp; Ngày</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #E2E8F0' }}>Nghiệp vụ</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #E2E8F0' }}>Số lượng</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>Phòng ban &amp; Lý do</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>Người thực hiện</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItem.stockHistory && detailItem.stockHistory.length > 0 ? (
                      detailItem.stockHistory.map((hist, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '7px 10px', fontWeight: 600 }}>
                            <div>{hist.ticketCode}</div>
                            <div style={{ fontSize: 11, color: '#64748B' }}>{hist.date}</div>
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                            <Tag color={hist.type === 'Nhập kho' ? 'success' : 'orange'}>
                              {hist.type === 'Nhập kho' ? <ArrowDownOutlined /> : <ArrowUpOutlined />} {hist.type}
                            </Tag>
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: hist.type === 'Nhập kho' ? '#16A34A' : '#D97706' }}>
                            {hist.type === 'Nhập kho' ? `+${hist.qty}` : `-${hist.qty}`} {detailItem.unit}
                          </td>
                          <td style={{ padding: '7px 10px' }}>
                            <div style={{ fontWeight: 500 }}>{hist.department}</div>
                            <div style={{ fontSize: 11, color: '#64748B' }}>{hist.reason}</div>
                          </td>
                          <td style={{ padding: '7px 10px', color: '#475569' }}>{hist.receiver}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: 16, color: '#94A3B8' }}>
                          Chưa có phát sinh giao dịch xuất nhập
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
                onClick={() => message.success(`Đã xuất thẻ kho ${detailItem.itemCode} (Mẫu 06-VT PDF)`)}
                style={{ flex: 1 }}
              >
                In Thẻ Kho (PDF)
              </Button>
              <Button
                type="primary"
                icon={<ImportOutlined />}
                onClick={() => handleOpenStockModal(detailItem, 'import')}
                style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
              >
                Nhập kho
              </Button>
              <Button
                icon={<ExportOutlined />}
                onClick={() => handleOpenStockModal(detailItem, 'export')}
                disabled={detailItem.stockQty <= 0}
                style={{ flex: 1 }}
              >
                Xuất cấp phát
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

