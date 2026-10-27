import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { assetDisposalOutcome, assetDisposalSnapshot, disposalMoney, disposalNeedsDataWipe } from './assetDisposalRules';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  PrinterOutlined,
  SafetyCertificateOutlined,
  CheckOutlined,
  ShopOutlined,
  LockOutlined,
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
  disposalMethod: 'Bán đấu giá nội bộ CBNV' | 'Bán thanh lý cho đơn vị thu mua ngoài' | 'Tiêu hủy an toàn (Data Wiping / Shredding)' | 'Tặng / Quyên góp từ thiện' | 'Báo mất / Thất lạc do rủi ro';
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
  status: 'Chờ hội đồng phê duyệt' | 'Đang đấu giá / Thu gom' | 'Đang thực hiện xử lý' | 'Đã thanh lý & Hoàn tất sổ sách' | 'Đã tiêu hủy an toàn' | 'Đã xử lý mất';
  notes: string;
  assetKey?: string;
  requester?: string;
  requesterId?: string;
  approvedBy?: string;
  approvedAt?: string;
  completedBy?: string;
  completedAt?: string;
}

const INITIAL_DISPOSALS: DisposalItem[] = [];
const localDate = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

export const AssetDisposalModule: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<DisposalItem[]>(INITIAL_DISPOSALS);
  const [assets, setAssets] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(false);
  const [assetsUnavailable, setAssetsUnavailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actingKey, setActingKey] = useState('');
  const [createAssetKey, setCreateAssetKey] = useState('');

  useEffect(() => {
    const list = dataService.getGenericData('asset_disposals');
    setData(Array.isArray(list) ? list : []);
    let mounted = true;
    setLoading(true);
    void Promise.all([dataService.refreshGenericData('asset_disposals'), dataService.refreshGenericData('asset_items')])
      .then(([disposals, assetRows]) => {
        if (!mounted) return;
        setData(Array.isArray(disposals) ? disposals : []);
        setAssets(Array.isArray(assetRows) ? assetRows : []);
        setAssetsUnavailable(false);
      })
      .catch((error: any) => {
        if (!mounted) return;
        setAssetsUnavailable(true);
        message.error(error?.response?.data?.message || 'Không tải được sổ tài sản hoặc hồ sơ thanh lý.');
      })
      .finally(() => { if (mounted) setLoading(false); });
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('asset_disposals');
      const currentAssets = dataService.getGenericData('asset_items');
      if (mounted) {
        setData(Array.isArray(updated) ? updated : []);
        setAssets(Array.isArray(currentAssets) ? currentAssets : []);
      }
    });
    return () => { mounted = false; unsub(); };
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
  const [finalizeTarget, setFinalizeTarget] = useState<DisposalItem | null>(null);
  const [finalizeModalOpen, setFinalizeModalOpen] = useState(false);
  const [finalizeSaving, setFinalizeSaving] = useState(false);
  const [finalizeWipeChecked, setFinalizeWipeChecked] = useState(false);

  const [form] = Form.useForm();
  const [finalizeForm] = Form.useForm();

  // Metrics
  const completedItems = data.filter((item) => ['Đã thanh lý & Hoàn tất sổ sách', 'Đã tiêu hủy an toàn', 'Đã xử lý mất'].includes(item.status));
  const totalRecovery = completedItems.reduce((sum, item) => sum + (Number(item.actualDisposalPrice) || 0), 0);
  const totalNetGain = completedItems.reduce((sum, item) => sum + (Number(item.netGainLoss) || 0), 0);
  const completedCount = completedItems.length;
  const pendingCount = data.filter((d) => d.status === 'Chờ hội đồng phê duyệt').length;

  const handleOpenCreate = () => {
    setCreateAssetKey('');
    form.resetFields();
    form.setFieldsValue({
      disposalCode: `TL-${new Date().getFullYear()}-${globalThis.crypto?.randomUUID?.().slice(0, 8).toUpperCase() || Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      disposalDate: localDate(),
      startingAuctionPrice: 0,
    });
    setModalOpen(true);
  };

  const handleCreate = async (values: any) => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const asset = assets.find((item) => String(item.key || item.id) === String(values.assetKey || createAssetKey));
      if (!asset) throw new Error('Chọn tài sản có thật trong danh mục.');
      const snapshot = assetDisposalSnapshot(asset);
      const startingAuctionPrice = disposalMoney(values.startingAuctionPrice ?? '0', 'Giá khởi điểm');
      const disposalCode = String(values.disposalCode || '').trim();
      if (data.some((item) => item.disposalCode.toLowerCase() === disposalCode.toLowerCase())) throw new Error('Mã biên bản đã tồn tại.');
      await dataService.createGenericRecord('asset_disposals', {
        key: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ...snapshot,
        disposalCode,
        disposalMethod: values.disposalMethod,
        reason: String(values.reason || '').trim(),
        startingAuctionPrice,
        actualDisposalPrice: 0,
        disposalCost: 0,
        netGainLoss: 0,
        disposalDate: values.disposalDate,
        buyerName: '', buyerPhone: '', securityDataWipeCertified: false, dataWipeOfficer: '',
        councilLeader: String(values.councilLeader || '').trim(),
        councilMembers: String(values.councilMembers || '').trim(),
        notes: String(values.notes || '').trim(),
        requester: user.name || user.email,
        requesterId: user.id,
        status: 'Chờ hội đồng phê duyệt',
      });
      message.success(`Đã lưu đề xuất ${disposalCode} lên máy chủ.`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không lưu được đề xuất thanh lý.');
    } finally { setSaving(false); }
  };

  const handleOpenApproveModal = (record: DisposalItem) => {
    setApproveTarget(record);
    setApproveModalOpen(true);
  };

  const handleConfirmApprove = async () => {
    if (!approveTarget || !user || actingKey) return;
    setActingKey(approveTarget.key);
    try {
      const saved = await dataService.updateGenericRecord('asset_disposals', { key: approveTarget.key, status: 'Đang thực hiện xử lý' }) as DisposalItem;
      if (detailItem?.key === saved.key) setDetailItem(saved);
      message.success(`Đã lưu phê duyệt ${saved.disposalCode}; tài sản chuyển sang chờ thanh lý.`);
      setApproveModalOpen(false);
      setApproveTarget(null);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không lưu được phê duyệt hoặc cập nhật tài sản.');
    } finally { setActingKey(''); }
  };

  const openFinalizeModal = (record: DisposalItem) => {
    setFinalizeTarget(record);
    setFinalizeWipeChecked(false);
    finalizeForm.setFieldsValue({ actualDisposalPrice: '0', disposalCost: '0', buyerName: '', buyerPhone: '', disposalDate: localDate(), dataWipeOfficer: '' });
    setFinalizeModalOpen(true);
  };

  const handleFinalize = async (values: any) => {
    if (!finalizeTarget || !user || finalizeSaving) return;
    setFinalizeSaving(true);
    try {
      const actualDisposalPrice = disposalMoney(values.actualDisposalPrice, 'Số tiền thực thu');
      const disposalCost = disposalMoney(values.disposalCost, 'Chi phí xử lý');
      const buyerName = String(values.buyerName || '').trim();
      if (['Bán đấu giá nội bộ CBNV', 'Bán thanh lý cho đơn vị thu mua ngoài', 'Tặng / Quyên góp từ thiện'].includes(finalizeTarget.disposalMethod) && !buyerName) throw new Error('Nhập bên mua hoặc đơn vị tiếp nhận thực tế.');
      if (finalizeTarget.disposalMethod.startsWith('Bán') && actualDisposalPrice <= 0) throw new Error('Giá bán thực tế phải lớn hơn 0.');
      const wipeRequired = disposalNeedsDataWipe(finalizeTarget.category, finalizeTarget.disposalMethod);
      if (wipeRequired && !finalizeWipeChecked) throw new Error('Cần xác nhận đã thực hiện xóa dữ liệu để hoàn tất xử lý tài sản này.');
      const dataWipeOfficer = finalizeWipeChecked ? String(values.dataWipeOfficer || '').trim() : '';
      if (finalizeWipeChecked && !dataWipeOfficer) throw new Error('Nhập người ghi nhận thao tác xóa dữ liệu.');
      const status = assetDisposalOutcome(finalizeTarget.disposalMethod);
      const saved = await dataService.updateGenericRecord('asset_disposals', {
        key: finalizeTarget.key,
        status,
        actualDisposalPrice,
        disposalCost,
        disposalDate: values.disposalDate,
        buyerName,
        buyerPhone: String(values.buyerPhone || '').trim(),
        securityDataWipeCertified: finalizeWipeChecked,
        dataWipeOfficer,
      }) as DisposalItem;
      if (detailItem?.key === saved.key) setDetailItem(saved);
      message.success(`Đã lưu hoàn tất xử lý ${saved.disposalCode} và cập nhật trạng thái tài sản.`);
      setFinalizeModalOpen(false);
      setFinalizeTarget(null);
      finalizeForm.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không lưu được kết quả thanh lý.');
    } finally { setFinalizeSaving(false); }
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

  const exportRegister = () => {
    if (!filteredData.length) { message.warning('Không có hồ sơ thanh lý phù hợp để xuất.'); return; }
    downloadFile('So_thanh_ly_tai_san.xlsx', generateValidXlsxBlob([
      ['Mã biên bản', 'Mã tài sản', 'Tên tài sản', 'Hình thức', 'Lý do', 'Nguyên giá', 'Khấu hao lũy kế', 'Giá trị còn lại', 'Giá khởi điểm', 'Giá thực tế', 'Chi phí xử lý', 'Lãi/lỗ nội bộ', 'Bên mua/tiếp nhận', 'Ngày xử lý', 'Trạng thái', 'Người duyệt', 'Người hoàn tất'],
      ...filteredData.map((item) => [item.disposalCode, item.assetCode, item.assetName, item.disposalMethod, item.reason, item.originalCost, item.accumulatedDepreciation, item.netBookValue, item.startingAuctionPrice, item.actualDisposalPrice, item.disposalCost, item.netGainLoss, item.buyerName, item.disposalDate, item.status, item.approvedBy || '', item.completedBy || '']),
    ]));
  };

  const printDisposal = (item: DisposalItem) => downloadFile(`${item.disposalCode}_BBTL_TSCĐ.pdf`, generateValidPdfBlob('BIEN BAN DE XUAT VA XU LY TAI SAN', `${item.disposalCode} | ${item.assetCode} - ${item.assetName}`, [
    `Hinh thuc: ${item.disposalMethod}`, `Ly do: ${item.reason}`, `Ngay xu ly: ${item.disposalDate}`, `Trang thai: ${item.status}`,
    `Nguyen gia: ${Number(item.originalCost || 0).toLocaleString('vi-VN')} VND`, `Khau hao luy ke: ${Number(item.accumulatedDepreciation || 0).toLocaleString('vi-VN')} VND`, `Gia tri con lai: ${Number(item.netBookValue || 0).toLocaleString('vi-VN')} VND`,
    `Gia khoi diem: ${Number(item.startingAuctionPrice || 0).toLocaleString('vi-VN')} VND`, `Gia thuc te: ${Number(item.actualDisposalPrice || 0).toLocaleString('vi-VN')} VND`, `Chi phi xu ly: ${Number(item.disposalCost || 0).toLocaleString('vi-VN')} VND`, `Lai/lo noi bo: ${Number(item.netGainLoss || 0).toLocaleString('vi-VN')} VND`,
    `Nguoi lap: ${item.requester || 'Chua ghi nhan'} | Nguoi duyet: ${item.approvedBy || 'Chua duyet'} | Nguoi hoan tat: ${item.completedBy || 'Chua hoan tat'}`,
    `Ghi nhan xoa du lieu: ${item.securityDataWipeCertified ? `Co - ${item.dataWipeOfficer || ''}` : 'Khong ghi nhan'}`,
    'Gia tri va ket qua nay la ghi nhan noi bo; he thong chua tao but toan ke toan, xac nhan thu tien hay chung nhan ky so NIST.',
  ]));
  const openAssets = assets.filter((asset) => ['Đang sử dụng', 'Trong kho', 'Chờ thanh lý'].includes(String(asset.status)) && !data.some((disposal) => disposal.assetKey === asset.key && ['Chờ hội đồng phê duyệt', 'Đang đấu giá / Thu gom', 'Đang thực hiện xử lý'].includes(disposal.status)));
  const selectedCreateAsset = openAssets.find((asset) => String(asset.key) === createAssetKey);

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tiền thu theo hồ sơ đã hoàn tất</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {totalRecovery.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Số liệu nội bộ, chưa đối chiếu dòng tiền</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Lãi/lỗ ước tính theo hồ sơ</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: totalNetGain >= 0 ? '#16A34A' : '#DC2626', marginTop: 4 }}>
            {totalNetGain > 0 ? '+' : ''}{totalNetGain.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Chưa tạo bút toán Sổ Cái</div>
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
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Đếm hồ sơ đã ghi nhận kết quả</div>
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
              { label: 'Đang thực hiện xử lý', value: 'Đang thực hiện xử lý' },
              { label: 'Đang đấu giá / Thu gom', value: 'Đang đấu giá / Thu gom' },
              { label: 'Đã thanh lý & Hoàn tất sổ sách', value: 'Đã thanh lý & Hoàn tất sổ sách' },
              { label: 'Đã tiêu hủy an toàn', value: 'Đã tiêu hủy an toàn' },
              { label: 'Đã xử lý mất', value: 'Đã xử lý mất' },
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
          <Button icon={<DownloadOutlined />} onClick={exportRegister} disabled={!filteredData.length}>
            Xuất Mẫu 02-TSCĐ
          </Button>
          {user?.role === 'ADMIN' && <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập biên bản thanh lý mới
          </Button>}
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          loading={loading}
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
              title: 'Giá trị theo hồ sơ',
              key: 'finance',
              width: 220,
              render: (_: any, r: DisposalItem) => {
                const isFinalized = ['Đã thanh lý & Hoàn tất sổ sách', 'Đã tiêu hủy an toàn', 'Đã xử lý mất'].includes(r.status);
                return <div style={{ fontSize: 12 }}>
                  <div style={{ color: '#64748B', textDecoration: 'line-through' }}>Nguyên giá: {Number(r.originalCost || 0).toLocaleString('vi-VN')} ₫</div>
                  <div style={{ color: '#16A34A', fontWeight: 700 }}>{isFinalized ? `Tiền ghi nhận: ${(Number(r.actualDisposalPrice) || 0).toLocaleString('vi-VN')} ₫` : 'Chưa ghi nhận tiền'}</div>
                  <div style={{ fontSize: 11, color: r.netGainLoss >= 0 ? '#16A34A' : '#DC2626', fontWeight: 600 }}>
                    {isFinalized ? (r.netGainLoss >= 0 ? `Lãi: +${Number(r.netGainLoss || 0).toLocaleString('vi-VN')} ₫` : `Lỗ: ${Number(r.netGainLoss || 0).toLocaleString('vi-VN')} ₫`) : 'Chưa có kết quả'}
                  </div>
                </div>;
              },
            },
            {
              title: 'Bên mua / tiếp nhận & xóa dữ liệu',
              key: 'buyer',
              render: (_: any, r: DisposalItem) => (
                <div>
                  <div style={{ fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ShopOutlined style={{ color: '#64748B' }} /> {r.buyerName}
                  </div>
                  <div style={{ fontSize: 11, color: r.securityDataWipeCertified ? '#16A34A' : '#D97706', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <LockOutlined /> {r.securityDataWipeCertified ? `Đã ghi nhận bởi ${r.dataWipeOfficer || 'người xử lý'}` : 'Chưa ghi nhận'}
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
                if (s.includes('thực hiện') || s.includes('đấu giá')) col = 'processing';
                if (s.includes('mất')) col = 'error';
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
                  {r.status === 'Chờ hội đồng phê duyệt' && user?.role === 'ADMIN' && (
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
                  {['Đang thực hiện xử lý', 'Đang đấu giá / Thu gom'].includes(r.status) && user?.role === 'ADMIN' && (
                    <Button size="small" type="primary" onClick={() => openFinalizeModal(r)} loading={actingKey === r.key}>
                      Hoàn tất
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

          {assetsUnavailable && <Alert type="error" showIcon message="Không tải được danh mục tài sản. Thử tải lại trang trước khi lập đề xuất." />}
          <Form.Item name="assetKey" label="Tài sản trong danh mục" rules={[{ required: true, message: 'Chọn tài sản có trong sổ tài sản.' }]}>
            <Select
              value={createAssetKey || undefined}
              onChange={(value: string) => { setCreateAssetKey(value); form.setFieldsValue({ assetKey: value }); }}
              placeholder={openAssets.length ? 'Chọn tài sản' : 'Không có tài sản đủ điều kiện'}
              options={openAssets.map((asset) => ({ value: String(asset.key), label: `${asset.code} — ${asset.name} (${asset.status})` }))}
              disabled={assetsUnavailable || openAssets.length === 0}
            />
          </Form.Item>
          {selectedCreateAsset && (
            <Alert
              type="info"
              showIcon
              message={`${selectedCreateAsset.code} · ${selectedCreateAsset.name} · ${selectedCreateAsset.category || 'Chưa phân loại'}`}
              description={`Nguyên giá: ${Number(selectedCreateAsset.originalPrice || 0).toLocaleString('vi-VN')} ₫ · Khấu hao lũy kế: ${Number(selectedCreateAsset.accumulatedDepreciation || 0).toLocaleString('vi-VN')} ₫ · Trạng thái: ${selectedCreateAsset.status}. Giá trị được chụp lại từ danh mục trên máy chủ khi lưu.`}
            />
          )}

          <Form.Item name="reason" label="Lý do đề xuất thanh lý / Tiêu hủy" rules={[{ required: true, message: 'Nhập lý do' }]}>
            <Input.TextArea rows={2} placeholder="Ví dụ: Đã khấu hao hết 100%, linh kiện thường xuyên hỏng hóc, chi phí sửa chữa cao hơn mua mới..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="startingAuctionPrice" label="Giá khởi điểm dự kiến (VNĐ)">
              <Input type="number" min={0} step={500000} placeholder="Ví dụ: 3000000" />
            </Form.Item>
            <Form.Item name="notes" label="Ghi chú đề xuất">
              <Input placeholder="Thông tin bổ sung (nếu có)" />
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
            <Button type="primary" htmlType="submit" loading={saving} disabled={assetsUnavailable || openAssets.length === 0} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
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
                II. GIÁ TRỊ VÀ KẾT QUẢ GHI NHẬN NỘI BỘ
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
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0', color: '#166534', fontWeight: 700 }}>Tiền thu ghi trong hồ sơ:</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0', fontWeight: 800, color: '#16A34A', fontSize: 13.5 }}>
                      {['Đã thanh lý & Hoàn tất sổ sách', 'Đã tiêu hủy an toàn', 'Đã xử lý mất'].includes(detailItem.status) ? `${Number(detailItem.actualDisposalPrice || 0).toLocaleString('vi-VN')} ₫` : 'Chưa ghi nhận'}
                    </td>
                  </tr>
                  <tr style={{ background: '#FEF2F2' }}>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0', color: '#991B1B' }}>Chi phí xử lý ghi trong hồ sơ:</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0', color: '#DC2626' }}>{['Đã thanh lý & Hoàn tất sổ sách', 'Đã tiêu hủy an toàn', 'Đã xử lý mất'].includes(detailItem.status) ? `${Number(detailItem.disposalCost || 0).toLocaleString('vi-VN')} ₫` : 'Chưa ghi nhận'}</td>
                  </tr>
                  <tr style={{ background: '#EFF6FF' }}>
                    <td style={{ padding: '8px 12px', color: '#1E40AF', fontWeight: 700 }}>Lãi/lỗ ước tính theo hồ sơ:</td>
                    <td style={{ padding: '8px 12px', fontWeight: 800, color: detailItem.netGainLoss >= 0 ? '#16A34A' : '#DC2626', fontSize: 14 }}>
                      {['Đã thanh lý & Hoàn tất sổ sách', 'Đã tiêu hủy an toàn', 'Đã xử lý mất'].includes(detailItem.status) ? (detailItem.netGainLoss >= 0 ? `+${Number(detailItem.netGainLoss).toLocaleString('vi-VN')} ₫` : `${Number(detailItem.netGainLoss).toLocaleString('vi-VN')} ₫`) : 'Chưa ghi nhận'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Security Data Wipe */}
            <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
              <strong style={{ color: '#0F172A' }}>III. GHI NHẬN THAO TÁC XÓA DỮ LIỆU:</strong>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, color: detailItem.securityDataWipeCertified ? '#16A34A' : '#64748B' }}>
                <SafetyCertificateOutlined style={{ fontSize: 16 }} />
                <span>{detailItem.securityDataWipeCertified ? 'Có xác nhận do người xử lý khai báo; hệ thống chưa kiểm chứng kỹ thuật.' : 'Chưa ghi nhận thao tác xóa dữ liệu.'}</span>
              </div>
              <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
                Người ghi nhận: <strong>{detailItem.dataWipeOfficer || 'Chưa ghi nhận'}</strong>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => printDisposal(detailItem)}
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
              {['Đang thực hiện xử lý', 'Đang đấu giá / Thu gom'].includes(detailItem.status) && user?.role === 'ADMIN' && (
                <Button type="primary" onClick={() => openFinalizeModal(detailItem)} style={{ flex: 1 }}>Hoàn tất xử lý</Button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* MODAL: Phê duyệt quyết toán thanh lý */}
      <Modal
        title="Phê duyệt đề xuất thanh lý tài sản"
        open={approveModalOpen}
        onCancel={() => setApproveModalOpen(false)}
        footer={null}
        width={480}
      >
        {approveTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
            <Alert
              message={`Xác nhận phê duyệt: ${approveTarget.disposalCode}`}
              description={`Tài sản: "${approveTarget.assetName}" | Nguyên giá: ${approveTarget.originalCost.toLocaleString('vi-VN')} ₫ | Giá trị còn lại: ${approveTarget.netBookValue.toLocaleString('vi-VN')} ₫. Phê duyệt chỉ chuyển sang bước xử lý; tiền thực tế và chi phí sẽ ghi ở bước hoàn tất.`}
              type="info"
              showIcon
            />
            <Alert type="warning" showIcon message="Bước này chưa xác nhận đã bán, thu tiền, ghi sổ kế toán hoặc xóa dữ liệu." />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <Button onClick={() => setApproveModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={handleConfirmApprove}
                loading={actingKey === approveTarget.key}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Chấp thuận và chuyển sang xử lý
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal title={`Ghi nhận kết quả xử lý ${finalizeTarget?.disposalCode || ''}`} open={finalizeModalOpen} onCancel={() => setFinalizeModalOpen(false)} footer={null} width={620}>
        {finalizeTarget && (
          <Form form={finalizeForm} layout="vertical" onFinish={handleFinalize} style={{ marginTop: 14 }}>
            <Alert type="info" showIcon message={`Tài sản ${finalizeTarget.assetCode} · Giá trị còn lại ${Number(finalizeTarget.netBookValue || 0).toLocaleString('vi-VN')} ₫`} description="Chỉ nhập số tiền, bên nhận và thao tác thực tế đã có bằng chứng. Kết quả chỉ được ghi trong hồ sơ nội bộ; chưa tự tạo bút toán hoặc xác nhận dòng tiền." />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <Form.Item name="actualDisposalPrice" label="Số tiền thu thực tế (VNĐ)" rules={[{ required: true }]}>
                <Input type="number" min={0} step={1} />
              </Form.Item>
              <Form.Item name="disposalCost" label="Chi phí xử lý (VNĐ)" rules={[{ required: true }]}>
                <Input type="number" min={0} step={1} />
              </Form.Item>
              <Form.Item name="disposalDate" label="Ngày xử lý thực tế" rules={[{ required: true }]}>
                <Input type="date" />
              </Form.Item>
              <Form.Item name="buyerName" label="Bên mua / đơn vị tiếp nhận" rules={[{ required: ['Bán đấu giá nội bộ CBNV', 'Bán thanh lý cho đơn vị thu mua ngoài', 'Tặng / Quyên góp từ thiện'].includes(finalizeTarget.disposalMethod), message: 'Nhập bên mua hoặc đơn vị tiếp nhận.' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="buyerPhone" label="Số điện thoại liên hệ">
                <Input />
              </Form.Item>
              {(disposalNeedsDataWipe(finalizeTarget.category, finalizeTarget.disposalMethod) || finalizeWipeChecked) && (
                <Form.Item name="dataWipeOfficer" label="Người ghi nhận thao tác xóa dữ liệu" rules={[{ required: finalizeWipeChecked, message: 'Nhập người ghi nhận thao tác.' }]}>
                  <Input />
                </Form.Item>
              )}
            </div>
            <div style={{ background: '#F8FAFC', padding: 10, borderRadius: 6, border: '1px solid #E2E8F0', marginBottom: 12 }}>
              <Checkbox checked={finalizeWipeChecked} onChange={(e) => setFinalizeWipeChecked(Boolean(e.target.checked))}>
                <span style={{ fontSize: 12.5 }}>Tôi ghi nhận đã thực hiện xóa dữ liệu. Đây là khai báo của người dùng, hệ thống không kiểm chứng kỹ thuật.</span>
              </Checkbox>
            </div>
            {disposalNeedsDataWipe(finalizeTarget.category, finalizeTarget.disposalMethod) && <Alert type="warning" showIcon message="Hồ sơ này bắt buộc ghi nhận thao tác xóa dữ liệu trước khi hoàn tất." style={{ marginBottom: 12 }} />}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={() => setFinalizeModalOpen(false)}>Hủy</Button>
              <Button type="primary" htmlType="submit" loading={finalizeSaving}>Lưu kết quả xử lý</Button>
            </div>
          </Form>
        )}
      </Modal>
    </div>
  );
};

