import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  EyeOutlined,
  PrinterOutlined,
  SafetyCertificateOutlined,
  AuditOutlined,
  CheckOutlined,
  CloseOutlined,
  WarningOutlined,
  ThunderboltOutlined,
  UserOutlined,
  ShopOutlined,
  LockOutlined,
  TagOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Card, Tag, Alert, Checkbox } from '../../custom-ui';

export interface DisposalItem {
  key: string;
  disposalCode: string;
  assetCode: string;
  assetName: string;
  category: string;
  serialNo: string;
  disposalMethod: 'Bán đấu giá nội bộ CBNV' | 'Bán thanh lý cho đơn vị thu mua ngoài' | 'Tiêu hủy an toàn' | 'Tặng / Quyên góp từ thiện' | 'Báo mất / Thất lạc do rủi ro';
  reason: string;
  originalCost: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  startingAuctionPrice: number;
  actualDisposalPrice: number;
  disposalCost: number;
  netGainLoss: number;
  disposalDate: string;
  buyerName: string;
  buyerPhone: string;
  councilLeader: string;
  councilMembers: string;
  securityDataWipeCertified: boolean;
  dataWipeOfficer: string;
  status: 'Chờ hội đồng phê duyệt' | 'Đang đấu giá / Thu gom' | 'Đã thanh lý & Hoàn tất sổ sách' | 'Đã tiêu hủy an toàn';
  notes: string;
}

const INITIAL_DISPOSALS: DisposalItem[] = [];

export const AssetDisposalModule: React.FC = () => {
  const [data, setData] = useState<DisposalItem[]>(INITIAL_DISPOSALS);

  useEffect(() => {
    const list = dataService.getGenericData('asset_disposals');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('asset_disposals');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');

  // Modals & Drawers state
  const [modalOpen, setModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<DisposalItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<DisposalItem | null>(null);
  const [approvePriceInput, setApprovePriceInput] = useState<number>(0);
  const [wipeCheck, setWipeCheck] = useState<boolean>(true);

  const [form] = Form.useForm();

  // Metrics
  const totalRecovery = data.reduce((sum, item) => sum + (item.actualDisposalPrice || 0), 0);
  const totalNetGain = data.reduce((sum, item) => sum + (item.netGainLoss || 0), 0);
  const completedCount = data.filter((d) => d.status.includes('Đã thanh lý') || d.status.includes('Đã tiêu hủy')).length;
  const pendingCount = data.filter((d) => d.status === 'Chờ hội đồng phê duyệt').length;

  const handleOpenCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      disposalCode: `TL-2026-0${data.length + 10}`,
      disposalMethod: 'Bán thanh lý cho đơn vị thu mua ngoài',
      originalCost: 20000000,
      accumulatedDepreciation: 18000000,
      netBookValue: 2000000,
      startingAuctionPrice: 3000000,
      actualDisposalPrice: 3500000,
      disposalCost: 200000,
      disposalDate: new Date().toISOString().substring(0, 10),
      councilLeader: 'Hội đồng thanh lý',
      councilMembers: 'Trần Tuấn Anh (CTO), Nguyễn Thị Mai (KTT), Lê Hoàng Yến (HR)',
      securityDataWipeCertified: true,
      dataWipeOfficer: 'Vũ Minh Trí',
    });
    setModalOpen(true);
  };

  const handleCreate = (values: any) => {
    const orig = Number(values.originalCost) || 0;
    const accum = Number(values.accumulatedDepreciation) || 0;
    const netBook = Math.max(0, orig - accum);
    const actualPrice = Number(values.actualDisposalPrice) || 0;
    const dispCost = Number(values.disposalCost) || 0;
    const gainLoss = actualPrice - dispCost - netBook;

    const newItem: DisposalItem = {
      ...values,
      key: String(Date.now()),
      originalCost: orig,
      accumulatedDepreciation: accum,
      netBookValue: netBook,
      startingAuctionPrice: Number(values.startingAuctionPrice) || 0,
      actualDisposalPrice: actualPrice,
      disposalCost: dispCost,
      netGainLoss: gainLoss,
      securityDataWipeCertified: true,
      status: 'Chờ hội đồng phê duyệt',
    };
    const nextItems = [newItem, ...data];
    setData(nextItems);
    dataService.saveGenericData('asset_disposals', nextItems);
    message.success(`Đã lập biên bản đề xuất thanh lý: ${values.disposalCode} (${values.assetName})`);
    setModalOpen(false);
    form.resetFields();
  };

  const handleOpenApproveModal = (record: DisposalItem) => {
    setApproveTarget(record);
    setApprovePriceInput(record.actualDisposalPrice || record.startingAuctionPrice || 0);
    setWipeCheck(true);
    setApproveModalOpen(true);
  };

  const handleConfirmApprove = () => {
    if (approveTarget) {
      const netGain = approvePriceInput - approveTarget.disposalCost - approveTarget.netBookValue;
      const updated = data.map((d) =>
        d.key === approveTarget.key
          ? {
              ...d,
              actualDisposalPrice: approvePriceInput,
              netGainLoss: netGain,
              securityDataWipeCertified: wipeCheck,
              status: 'Đã thanh lý & Hoàn tất sổ sách' as const,
            }
          : d
      );
      setData(updated);
      dataService.saveGenericData('asset_disposals', updated);
      message.success(`Hội đồng đã phê duyệt quyết toán thanh lý ${approveTarget.disposalCode} thành công!`);
      setApproveModalOpen(false);
      if (detailItem && detailItem.key === approveTarget.key) {
        setDetailItem({
          ...detailItem,
          actualDisposalPrice: approvePriceInput,
          netGainLoss: netGain,
          securityDataWipeCertified: wipeCheck,
          status: 'Đã thanh lý & Hoàn tất sổ sách',
        });
      }
    }
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.disposalCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.assetCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.assetName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.buyerName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.reason || '').toLowerCase().includes(searchText.toLowerCase());

    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchMethod = methodFilter === 'all' || item.disposalMethod === methodFilter;

    return matchSearch && matchStatus && matchMethod;
  });

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng tiền thu hồi từ thanh lý</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {totalRecovery.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đã thu tiền mặt/chuyển khoản</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Lãi ròng thanh lý hạch toán</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            +{totalNetGain.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Ghi nhận vào Thu nhập khác (TK 711)</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chờ Hội đồng thanh lý phê duyệt</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: pendingCount > 0 ? '#D97706' : '#16A34A', marginTop: 4 }}>
            {pendingCount} biên bản
          </div>
          <div style={{ fontSize: 11.5, color: pendingCount > 0 ? '#D97706' : '#64748B', marginTop: 2 }}>
            {pendingCount > 0 ? 'Cần họp ban thanh lý thẩm định' : 'Tất cả đã phê duyệt'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã thanh lý &amp; tiêu hủy bảo mật</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {completedCount} đợt tài sản
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>100% đạt chuẩn NIST 800-88 Wipe</div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo mã biên bản, mã TS, bên mua, lý do thanh lý..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 340, borderRadius: 6 }}
            allowClear
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 190 }}
            options={[
              { label: 'Tất cả trạng thái', value: 'all' },
              { label: 'Chờ hội đồng phê duyệt', value: 'Chờ hội đồng phê duyệt' },
              { label: 'Đã thanh lý & Hoàn tất sổ sách', value: 'Đã thanh lý & Hoàn tất sổ sách' },
              { label: 'Đã tiêu hủy an toàn', value: 'Đã tiêu hủy an toàn' },
            ]}
          />
          <Select
            value={methodFilter}
            onChange={setMethodFilter}
            style={{ width: 210 }}
            options={[
              { label: 'Tất cả hình thức xử lý', value: 'all' },
              { label: 'Bán đấu giá nội bộ CBNV', value: 'Bán đấu giá nội bộ CBNV' },
              { label: 'Bán thanh lý cho đơn vị ngoài', value: 'Bán thanh lý cho đơn vị thu mua ngoài' },
              { label: 'Tiêu hủy an toàn bảo mật', value: 'Tiêu hủy an toàn (Data Wiping / Shredding)' },
              { label: 'Tặng / Quyên góp từ thiện', value: 'Tặng / Quyên góp từ thiện' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất biên bản thanh lý Mẫu 02-TSCĐ')}>
            Xuất Mẫu 02-TSCĐ
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập biên bản thanh lý mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={[
            {
              title: 'Mã biên bản & Hình thức',
              key: 'code',
              width: 170,
              render: (_: any, r: DisposalItem) => (
                <div>
                  <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <DeleteOutlined /> {r.disposalCode}
                  </span>
                  <Tag color="orange" style={{ marginTop: 3 }}>
                    {r.disposalMethod.includes('nội bộ') ? 'Đấu giá CBNV' : r.disposalMethod.includes('Tiêu hủy') ? 'Tiêu hủy' : 'Bán thanh lý'}
                  </Tag>
                </div>
              ),
            },
            {
              title: 'Tài sản & Lý do xử lý',
              key: 'asset',
              render: (_: any, r: DisposalItem) => (
                <div>
                  <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.assetName}</strong>
                  <div style={{ fontSize: 11.5, color: '#64748B' }}>
                    Mã: <strong style={{ color: '#009688' }}>{r.assetCode}</strong> · SN: <code>{r.serialNo}</code>
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{r.reason}</div>
                </div>
              ),
            },
            {
              title: 'Hạch toán Kế toán',
              key: 'finance',
              width: 220,
              render: (_: any, r: DisposalItem) => (
                <div style={{ fontSize: 12 }}>
                  <div style={{ color: '#64748B', textDecoration: 'line-through' }}>
                    Nguyên giá: {r.originalCost.toLocaleString('vi-VN')} ₫
                  </div>
                  <div style={{ color: '#16A34A', fontWeight: 700 }}>
                    Thực thu: {r.actualDisposalPrice.toLocaleString('vi-VN')} ₫
                  </div>
                  <div style={{ fontSize: 11, color: r.netGainLoss >= 0 ? '#16A34A' : '#DC2626', fontWeight: 600 }}>
                    {r.netGainLoss >= 0 ? `Lãi: +${r.netGainLoss.toLocaleString('vi-VN')} ₫` : `Lỗ: ${r.netGainLoss.toLocaleString('vi-VN')} ₫`}
                  </div>
                </div>
              ),
            },
            {
              title: 'Bên mua & Bảo mật Data Wipe',
              key: 'buyer',
              render: (_: any, r: DisposalItem) => (
                <div>
                  <div style={{ fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ShopOutlined style={{ color: '#64748B' }} /> {r.buyerName}
                  </div>
                  <div style={{ fontSize: 11, color: r.securityDataWipeCertified ? '#16A34A' : '#D97706', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <LockOutlined /> {r.securityDataWipeCertified ? 'Đã Wipe sạch dữ liệu' : 'Chưa hủy dữ liệu'}
                  </div>
                </div>
              ),
            },
            {
              title: 'Ngày lập',
              dataIndex: 'disposalDate',
              key: 'disposalDate',
              width: 110,
              render: (d: string) => <span style={{ fontWeight: 500 }}>{d}</span>,
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              key: 'status',
              render: (s: string) => {
                let col = 'success';
                if (s.includes('Chờ')) col = 'warning';
                if (s.includes('tiêu hủy')) col = 'processing';
                return <Tag color={col}>{s}</Tag>;
              },
            },
            {
              title: 'Thao tác',
              key: 'act',
              width: 160,
              render: (_: any, r: DisposalItem) => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setDetailItem(r);
                      setDrawerOpen(true);
                    }}
                    title="Xem biên bản Mẫu 02-TSCĐ"
                  >
                    Xem
                  </Button>
                  {r.status === 'Chờ hội đồng phê duyệt' && (
                    <Button
                      size="small"
                      type="primary"
                      icon={<CheckOutlined />}
                      onClick={() => handleOpenApproveModal(r)}
                      style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                      title="Phê duyệt thanh lý"
                    >
                      Duyệt
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* MODAL: Lập biên bản thanh lý mới 100% trường nhập */}
      <Modal
        title="Lập Biên Bản Đề Xuất Thanh Lý / Tiêu Hủy Tài Sản"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={760}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="disposalCode" label="Mã biên bản" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: TL-2026-012" />
            </Form.Item>
            <Form.Item name="disposalMethod" label="Hình thức thanh lý" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Bán đấu giá nội bộ CBNV', value: 'Bán đấu giá nội bộ CBNV' },
                  { label: 'Bán thanh lý đơn vị ngoài', value: 'Bán thanh lý cho đơn vị thu mua ngoài' },
                  { label: 'Tiêu hủy an toàn bảo mật', value: 'Tiêu hủy an toàn (Data Wiping / Shredding)' },
                  { label: 'Tặng / Quyên góp từ thiện', value: 'Tặng / Quyên góp từ thiện' },
                  { label: 'Báo mất / Thất lạc do rủi ro', value: 'Báo mất / Thất lạc do rủi ro' },
                ]}
              />
            </Form.Item>
            <Form.Item name="disposalDate" label="Ngày thực hiện" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 12 }}>
            <Form.Item name="assetCode" label="Mã tài sản" rules={[{ required: true, message: 'Nhập mã TS' }]}>
              <Input placeholder="Ví dụ: TS-PC-08" />
            </Form.Item>
            <Form.Item name="assetName" label="Tên tài sản thanh lý" rules={[{ required: true, message: 'Nhập tên tài sản' }]}>
              <Input placeholder="Ví dụ: Máy tính Workstation HP Z440 Cũ" />
            </Form.Item>
            <Form.Item name="serialNo" label="Số Serial / Tag" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: HP-WS-99281" />
            </Form.Item>
          </div>

          <Form.Item name="reason" label="Lý do đề xuất thanh lý / Tiêu hủy" rules={[{ required: true, message: 'Nhập lý do' }]}>
            <Input.TextArea rows={2} placeholder="Ví dụ: Đã khấu hao hết 100%, linh kiện thường xuyên hỏng hóc, chi phí sửa chữa cao hơn mua mới..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="originalCost" label="Nguyên giá sổ (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={1000000} placeholder="Ví dụ: 30000000" />
            </Form.Item>
            <Form.Item name="accumulatedDepreciation" label="Đã khấu hao (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={1000000} placeholder="Ví dụ: 30000000" />
            </Form.Item>
            <Form.Item name="startingAuctionPrice" label="Giá khởi điểm (VNĐ)">
              <Input type="number" min={0} step={500000} placeholder="Ví dụ: 3000000" />
            </Form.Item>
            <Form.Item name="actualDisposalPrice" label="Giá bán thực thu (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={500000} placeholder="Ví dụ: 4500000" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
            <Form.Item name="buyerName" label="Bên mua / Đơn vị tiếp nhận" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Công Ty TNHH Thu Mua Thiết Bị Công Nghệ" />
            </Form.Item>
            <Form.Item name="buyerPhone" label="Số điện thoại bên mua">
              <Input placeholder="Ví dụ: 0988.123.456" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 12 }}>
            <Form.Item name="councilLeader" label="Chủ tịch Hội đồng thanh lý" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Nguyễn Văn Minh (CEO)" />
            </Form.Item>
            <Form.Item name="councilMembers" label="Thành viên Hội đồng thanh lý" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Trần Tuấn Anh (CTO), Nguyễn Thị Mai (KTT), Lê Hoàng Yến (HR)" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Trình Hội đồng thanh lý
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Xem Biên Bản Thanh Lý Mẫu 02-TSCĐ */}
      <Drawer
        title="Biên Bản Thanh Lý Tài Sản Cố Định"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={620}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Document */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid #009688', paddingBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', letterSpacing: 0.5 }}>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
              <div style={{ fontSize: 10, color: '#64748B' }}>Mẫu số 02 - TSCĐ</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                BIÊN BẢN THANH LÝ TÀI SẢN CỐ ĐỊNH
              </div>
              <div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>
                Số: {detailItem.disposalCode} / BBTL-TSCĐ · Ngày: {detailItem.disposalDate}
              </div>
            </div>

            {/* Council Members */}
            <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>I. BAN THANH LÝ TÀI SẢN GỒM CÓ:</div>
              <div>1. Ông/Bà: <strong>{detailItem.councilLeader}</strong> - Chủ tịch Hội đồng</div>
              <div style={{ color: '#475569', marginTop: 2 }}>2. Thành viên: {detailItem.councilMembers}</div>
            </div>

            {/* Asset Accounting Breakdown Matrix */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ background: '#009688', color: '#FFF', padding: '8px 12px', fontWeight: 700, fontSize: 12.5 }}>
                II. KẾT QUẢ ĐÁNH GIÁ &amp; HẠCH TOÁN THANH LÝ TÀI SẢN
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>Tên tài sản thanh lý:</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0', fontWeight: 700 }}>{detailItem.assetName}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>Mã tài sản &amp; Serial:</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0' }}>{detailItem.assetCode} (SN: {detailItem.serialNo})</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>Nguyên giá tài sản:</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0' }}>{detailItem.originalCost.toLocaleString('vi-VN')} ₫</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>Giá trị hao mòn đã trích:</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0' }}>{detailItem.accumulatedDepreciation.toLocaleString('vi-VN')} ₫</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>Giá trị còn lại trên sổ sách:</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0', fontWeight: 700 }}>{detailItem.netBookValue.toLocaleString('vi-VN')} ₫</td>
                  </tr>
                  <tr style={{ background: '#F0FDF4' }}>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0', color: '#166534', fontWeight: 700 }}>Số tiền thực tế thu về (TK 111/112):</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0', fontWeight: 800, color: '#16A34A', fontSize: 13.5 }}>
                      {detailItem.actualDisposalPrice.toLocaleString('vi-VN')} ₫
                    </td>
                  </tr>
                  <tr style={{ background: '#FEF2F2' }}>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0', color: '#991B1B' }}>Chi phí thanh lý tháo dỡ (TK 811):</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0', color: '#DC2626' }}>{detailItem.disposalCost.toLocaleString('vi-VN')} ₫</td>
                  </tr>
                  <tr style={{ background: '#EFF6FF' }}>
                    <td style={{ padding: '8px 12px', color: '#1E40AF', fontWeight: 700 }}>Lãi ròng thanh lý:</td>
                    <td style={{ padding: '8px 12px', fontWeight: 800, color: detailItem.netGainLoss >= 0 ? '#16A34A' : '#DC2626', fontSize: 14 }}>
                      {detailItem.netGainLoss >= 0 ? `+${detailItem.netGainLoss.toLocaleString('vi-VN')} ₫` : `${detailItem.netGainLoss.toLocaleString('vi-VN')} ₫`}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Security Data Wipe */}
            <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
              <strong style={{ color: '#0F172A' }}>III. CHỨNG THỰC AN TOÀN BẢO MẬT DỮ LIỆU:</strong>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, color: '#16A34A' }}>
                <SafetyCertificateOutlined style={{ fontSize: 16 }} />
                <span>Toàn bộ ổ cứng lưu trữ đã được xóa trắng vĩnh viễn theo chuẩn NIST SP 800-88 Rev 1.</span>
              </div>
              <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
                Cán bộ an ninh thực hiện: <strong>{detailItem.dataWipeOfficer}</strong>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã xuất biên bản thanh lý ${detailItem.disposalCode} (Mẫu 02-TSCĐ PDF)`)}
                style={{ flex: 1 }}
              >
                In Mẫu 02-TSCĐ (PDF)
              </Button>
              {detailItem.status === 'Chờ hội đồng phê duyệt' && (
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={() => handleOpenApproveModal(detailItem)}
                  style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
                >
                  Phê duyệt thanh lý
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* MODAL: Phê duyệt quyết toán thanh lý */}
      <Modal
        title="Phê Duyệt Biên Bản Quyết Toán Thanh Lý Tài Sản"
        open={approveModalOpen}
        onCancel={() => setApproveModalOpen(false)}
        footer={null}
        width={480}
      >
        {approveTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
            <Alert
              message={`Xác nhận phê duyệt: ${approveTarget.disposalCode}`}
              description={`Tài sản: "${approveTarget.assetName}" | Nguyên giá: ${approveTarget.originalCost.toLocaleString('vi-VN')} ₫ | Giá trị còn lại: ${approveTarget.netBookValue.toLocaleString('vi-VN')} ₫.`}
              type="info"
              showIcon
            />

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 6 }}>
                Số tiền thực thu hồi chốt thanh lý (VNĐ):
              </label>
              <Input
                type="number"
                min={0}
                step={500000}
                value={approvePriceInput}
                onChange={(e) => setApprovePriceInput(Number(e.target.value))}
                style={{ fontSize: 15, fontWeight: 700, color: '#16A34A' }}
              />
            </div>

            <div style={{ background: '#F8FAFC', padding: 10, borderRadius: 6, border: '1px solid #E2E8F0' }}>
              <Checkbox checked={wipeCheck} onChange={(e) => setWipeCheck(e.target.checked)}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>Xác nhận đã hủy sạch dữ liệu bảo mật (NIST 800-88)</span>
              </Checkbox>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <Button onClick={() => setApproveModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={handleConfirmApprove}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Chấp thuận thanh lý &amp; Ghi giảm sổ
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

