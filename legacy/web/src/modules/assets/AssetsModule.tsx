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
import { dataService } from '../../services/dataService';
import { collectionsApi } from '../../api/endpoints';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { buildQrMatrix, qrMatrixToSvg } from './qrCode';
import { findCodePattern, findDepreciationDefault, generateAssetCode, getAssetSystemOptions, type AssetSystemRule } from './assetSystemRules';

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
  history?: Array<{ key: string; date: string; action: string; actor: string; note: string }>;
}

const INITIAL_EXTENDED_ASSETS: ComprehensiveAsset[] = [];

export const AssetsModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const isReports = currentPath === '/assets/reports';
  const isUsage = currentPath === '/assets/usage';

  const [data, setData] = useState<ComprehensiveAsset[]>(INITIAL_EXTENDED_ASSETS);
  const [systemRules, setSystemRules] = useState<AssetSystemRule[]>([]);
  const autoCodeRef = React.useRef('');
  const autoDepreciationRef = React.useRef<number | undefined>(undefined);

  useEffect(() => {
    const list = dataService.getGenericData('asset_items');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('asset_items');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const updateRules = () => {
      const rules = dataService.getGenericData('asset_systems');
      setSystemRules(Array.isArray(rules) ? rules : []);
    };
    updateRules();
    let mounted = true;
    void dataService.refreshGenericData('asset_systems')
      .then((rules) => { if (mounted) setSystemRules(Array.isArray(rules) ? rules : []); })
      .catch(() => { /* Keep any cached rules available when refresh is offline. */ });
    const unsubscribe = dataService.subscribe(updateRules);
    return () => { mounted = false; unsubscribe(); };
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
  const totalAccumulated = data.reduce((sum, item) => sum + (Number(item.accumulatedDepreciation) || 0), 0);
  const inUseCount = data.filter((d) => d.status === 'Đang sử dụng').length;
  const inStockCount = data.filter((d) => d.status === 'Trong kho').length;
  const inRepairCount = data.filter((d) => d.status === 'Đang sửa chữa').length;
  const categoryStats = Array.from(data.reduce((groups, item) => {
    const current = groups.get(item.category) || { name: item.category, count: 0, original: 0, net: 0 };
    groups.set(item.category, { ...current, count: current.count + 1, original: current.original + (Number(item.originalPrice) || 0), net: current.net + (Number(item.netBookValue) || 0) });
    return groups;
  }, new Map<string, { name: string; count: number; original: number; net: number }>()).values());
  const supplierOptions = getAssetSystemOptions(systemRules, 'Nhà cung cấp');
  const locationOptions = getAssetSystemOptions(systemRules, 'Vị trí & Tủ Rack');
  const departmentStats = Array.from(data.reduce((groups, item) => {
    const department = item.department || 'Chưa phân phòng ban';
    const current = groups.get(department) || { department, original: 0, net: 0 };
    groups.set(department, { ...current, original: current.original + (Number(item.originalPrice) || 0), net: current.net + (Number(item.netBookValue) || 0) });
    return groups;
  }, new Map<string, { department: string; original: number; net: number }>()).values());
  const usageHistory = data.flatMap((asset) => (Array.isArray(asset.history) ? asset.history : []).map((entry) => ({
    id: `${asset.key}:${entry.key}`, date: entry.date, code: asset.code, name: asset.name,
    action: entry.action, actor: entry.actor, recipient: asset.assignedTo, note: entry.note,
  }))).sort((a, b) => b.date.localeCompare(a.date));
  const assetColumns = [
    { title: 'Mã tài sản', key: 'code' }, { title: 'Barcode', key: 'barcode' }, { title: 'Tên tài sản', key: 'name' },
    { title: 'Nhóm', key: 'category' }, { title: 'Model / Seri', key: 'model' }, { title: 'Ngày mua', key: 'purchaseDate' },
    { title: 'Nhà cung cấp', key: 'supplier' }, { title: 'Nguyên giá', key: 'originalPrice' },
    { title: 'Hao mòn lũy kế', key: 'accumulatedDepreciation' }, { title: 'Giá trị còn lại', key: 'netBookValue' },
    { title: 'Vị trí', key: 'location' }, { title: 'Người sử dụng', key: 'assignedTo' }, { title: 'Phòng ban', key: 'department' }, { title: 'Trạng thái', key: 'status' },
  ];
  const usageColumns = [
    { title: 'Thời gian', key: 'date' }, { title: 'Mã tài sản', key: 'code' }, { title: 'Tên tài sản', key: 'name' },
    { title: 'Hành động', key: 'action' }, { title: 'Người thực hiện', key: 'actor' }, { title: 'Người tiếp nhận', key: 'recipient' }, { title: 'Ghi chú', key: 'note' },
  ];
  const exportAssetRows = (records: unknown[], fileName: string, columns: Array<{ title: string; key: string }>) => {
    const toCell = (value: unknown): string | number | boolean | null => {
      if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value as string | number | boolean | null;
      return JSON.stringify(value);
    };
    const rows = [columns.map((column) => column.title), ...records.map((record) => columns.map((column) => toCell((record as Record<string, unknown>)[column.key])))];
    downloadFile(fileName, generateValidXlsxBlob(rows));
    message.success(`Đã xuất ${records.length} dòng dữ liệu.`);
  };
  const qrSvg = (() => {
    if (!qrTarget) return '';
    try {
      return qrMatrixToSvg(buildQrMatrix(qrTarget.code));
    } catch {
      return '';
    }
  })();
  const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
  const printAssetTag = () => {
    if (!qrSvg || !qrTarget) {
      message.error('Mã tài sản quá dài để tạo QR. Dùng mã có tối đa 32 byte.');
      return;
    }
    const printWindow = window.open('', '_blank', 'width=520,height=420');
    if (!printWindow) {
      message.error('Trình duyệt đã chặn cửa sổ in. Cho phép cửa sổ bật lên rồi thử lại.');
      return;
    }
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Tem tài sản ${escapeHtml(qrTarget.code)}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}.label{width:320px;border:1px solid #334155;padding:16px;text-align:center}.qr{width:150px;height:150px;margin:14px auto}.qr svg{width:100%;height:100%}.code{font-size:20px;font-weight:bold;letter-spacing:1px}.meta{font-size:12px;margin-top:6px}</style></head><body><main class="label"><div style="font-size:12px;font-weight:bold">CÔNG TY CP CÔNG NGHỆ KIYOVN</div><div class="qr">${qrSvg}</div><div class="code">${escapeHtml(qrTarget.code)}</div><div class="meta">${escapeHtml(qrTarget.name)}</div><div class="meta">${escapeHtml(qrTarget.department)} · ${escapeHtml(qrTarget.location)}</div></main></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.setTimeout(() => printWindow.print(), 250);
  };
  const currentActor = () => {
    try {
      const user = JSON.parse(localStorage.getItem('minepanel_user') || 'null');
      return user?.name || user?.fullName || user?.email || 'Người dùng hiện tại';
    } catch {
      return 'Người dùng hiện tại';
    }
  };

  const handleOpenCreate = () => {
    setEditingItem(null);
    form.resetFields();
    autoDepreciationRef.current = undefined;
    form.setFieldsValue({
      code: `TS-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      barcode: '',
      purchaseDate: '',
      warrantyExpiry: '',
      depreciationMonths: undefined,
      category: undefined,
      department: '',
      assignedTo: 'Chưa cấp phát',
      location: '',
      status: 'Trong kho',
      originalPrice: undefined,
    });
    autoCodeRef.current = form.getFieldValue('code');
    setModalOpen(true);
  };

  const handleOpenEdit = (item: ComprehensiveAsset) => {
    setEditingItem(item);
    autoCodeRef.current = '';
    autoDepreciationRef.current = undefined;
    form.setFieldsValue(item);
    setModalOpen(true);
  };

  const handleCreateCategoryChange = (category: string) => {
    if (editingItem) return;
    const currentCode = String(form.getFieldValue('code') || '');
    if (!currentCode || currentCode === autoCodeRef.current) {
      const pattern = findCodePattern(systemRules, category);
      const nextCode = generateAssetCode(pattern, new Date().getFullYear(), data.map((asset) => asset.code),
        () => `TS-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
      form.setFieldsValue({ code: nextCode });
      autoCodeRef.current = nextCode;
    }
    const currentMonths = Number(form.getFieldValue('depreciationMonths'));
    const defaultMonths = findDepreciationDefault(systemRules, category);
    if (defaultMonths !== undefined && (!currentMonths || currentMonths === autoDepreciationRef.current)) {
      form.setFieldsValue({ depreciationMonths: defaultMonths });
      autoDepreciationRef.current = defaultMonths;
    } else if (defaultMonths === undefined && currentMonths === autoDepreciationRef.current) {
      form.setFieldsValue({ depreciationMonths: undefined });
      autoDepreciationRef.current = undefined;
    }
  };

  const handleSave = async (values: any) => {
    const origPrice = Number(values.originalPrice);
    const depMonths = Number(values.depreciationMonths);
    const accum = values.accumulatedDepreciation !== undefined ? Number(values.accumulatedDepreciation) : 0;
    if (!Number.isFinite(origPrice) || origPrice < 0 || !Number.isFinite(depMonths) || depMonths <= 0 || !Number.isFinite(accum) || accum < 0 || accum > origPrice) {
      message.error('Kiểm tra nguyên giá, thời hạn khấu hao và hao mòn lũy kế.');
      return;
    }
    const normalizedCode = String(values.code || '').trim().toLocaleUpperCase();
    const normalizedBarcode = String(values.barcode || '').trim().replace(/\s+/g, '').toLocaleUpperCase();
    const duplicate = data.find((asset) => asset.key !== editingItem?.key && (asset.code?.trim().toLocaleUpperCase() === normalizedCode || (normalizedBarcode && asset.barcode?.replace(/\s+/g, '').toLocaleUpperCase() === normalizedBarcode)));
    if (duplicate) {
      message.error(`Mã tài sản hoặc mã barcode đã tồn tại trên ${duplicate.code}.`);
      return;
    }
    const historyEntry = {
      key: crypto.randomUUID(),
      date: new Date().toISOString(),
      action: editingItem ? 'Cập nhật hồ sơ tài sản' : 'Thêm tài sản vào danh mục',
      actor: currentActor(),
      note: editingItem ? 'Cập nhật thông tin hồ sơ.' : 'Khởi tạo hồ sơ tài sản.',
    };
    const common = {
      ...values,
      code: normalizedCode,
      barcode: normalizedBarcode,
      originalPrice: origPrice,
      depreciationMonths: depMonths,
      accumulatedDepreciation: accum,
      netBookValue: origPrice - accum,
      history: [historyEntry, ...(editingItem?.history || [])],
    };
    try {
      if (editingItem) {
        await collectionsApi.update('asset_items', editingItem.key, common);
        message.success(`Đã cập nhật thông tin tài sản: ${values.name}`);
      } else {
        const newItem: ComprehensiveAsset = { ...common, key: crypto.randomUUID(), status: values.status || 'Trong kho' };
        await collectionsApi.create('asset_items', newItem);
        message.success(`Đã thêm mới tài sản thành công: ${values.name}`);
      }
      await dataService.refreshGenericData('asset_items');
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu hồ sơ tài sản.');
    }
  };

  const handleDelete = (asset: ComprehensiveAsset) => {
    Modal.confirm({
      title: 'Xác nhận xóa tài sản khỏi hệ thống?',
      content: `Bạn có chắc chắn muốn xóa tài sản "${asset.name}" (Mã: ${asset.code}) với nguyên giá ${asset.originalPrice.toLocaleString('vi-VN')} ₫ không? Thao tác này sẽ ghi nhận vào nhật ký kiểm toán.`,
      okText: 'Xác nhận xóa',
      cancelText: 'Hủy bỏ',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await collectionsApi.remove('asset_items', asset.key);
          await dataService.refreshGenericData('asset_items');
          message.success(`Đã xóa tài sản ${asset.code}`);
        } catch (error: any) {
          message.error(error?.response?.data?.message || 'Không thể xóa tài sản.');
          throw error;
        }
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Báo cáo danh mục tài sản hiện có</h3>
            <Button icon={<DownloadOutlined />} onClick={() => exportAssetRows(data, 'bao_cao_tai_san.xlsx', assetColumns)}>Xuất báo cáo</Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            <Card title="Cơ Cấu Giá Trị Tài Sản Theo Nhóm Chủng Loại" style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {categoryStats.map((cat, idx) => {
                  const pct = totalOriginalPrice > 0 ? Math.round((cat.original / totalOriginalPrice) * 100) : 0;
                  const colors = ['#2563EB', '#009688', '#F59E0B', '#8B5CF6', '#DC2626'];
                  const color = colors[idx % colors.length];
                  return (
                    <div key={idx}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                        <strong>{cat.name} ({cat.count} TS)</strong>
                        <span style={{ fontWeight: 700, color }}>{cat.original.toLocaleString('vi-VN')} ₫ ({pct}%)</span>
                      </div>
                      <Progress percent={pct} strokeColor={color} showInfo={false} size="small" />
                    </div>
                  );
                })}
                {categoryStats.length === 0 && <div style={{ color: '#64748B' }}>Chưa có dữ liệu tài sản.</div>}
              </div>
            </Card>

            <Card title="Mức Độ Khấu Hao Theo Phòng Ban Trực Thuộc" style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {departmentStats.map((d, idx) => (
                  <div key={idx} style={{ background: '#F8FAFC', padding: '10px 14px', borderRadius: 6, border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{d.department}</strong>
                      <div style={{ fontSize: 12, color: '#64748B' }}>Nguyên giá: {d.original.toLocaleString('vi-VN')} ₫</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ color: '#009688', fontSize: 13.5 }}>{d.net.toLocaleString('vi-VN')} ₫</strong>
                      <div style={{ fontSize: 11.5, color: '#16A34A' }}>Giá trị còn lại</div>
                    </div>
                  </div>
                ))}
                {departmentStats.length === 0 && <div style={{ color: '#64748B' }}>Chưa có dữ liệu phòng ban.</div>}
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
            <Button icon={<DownloadOutlined />} onClick={() => exportAssetRows(usageHistory, 'nhat_ky_su_dung_tai_san.xlsx', usageColumns)}>
              Xuất Nhật Ký
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={usageHistory}
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
          {usageHistory.length === 0 && <div style={{ color: '#64748B' }}>Chưa có thao tác tạo hoặc sửa được ghi trong lịch sử tài sản.</div>}
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
              <Button icon={<DownloadOutlined />} onClick={() => exportAssetRows(filteredData, 'danh_muc_tai_san.xlsx', assetColumns)}>
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
                onChange={handleCreateCategoryChange}
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
            <Form.Item name="supplier" label="Nhà cung cấp / Đơn vị bán">
              <Input placeholder="Tên đơn vị bán hàng" list="asset-supplier-options" />
            </Form.Item>
            <datalist id="asset-supplier-options">{supplierOptions.map((name) => <option key={name} value={name} />)}</datalist>
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

          <Form.Item name="location" label="Vị trí lắp đặt / Bàn làm việc">
            <Input placeholder="Địa điểm thực tế đặt tài sản" list="asset-location-options" />
          </Form.Item>
          <datalist id="asset-location-options">{locationOptions.map((name) => <option key={name} value={name} />)}</datalist>

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
                onClick={() => {
                  const record = detailItem;
                  const lines = [
                    `Ma tai san: ${record.code}`,
                    `Barcode: ${record.barcode}`,
                    `Ten: ${record.name}`,
                    `Nhom: ${record.category}`,
                    `Model / Seri: ${record.model}`,
                    `Ngay mua: ${record.purchaseDate}`,
                    `Nha cung cap: ${record.supplier}`,
                    `Nguyen gia: ${record.originalPrice.toLocaleString('vi-VN')} VND`,
                    `Hao mon luy ke: ${record.accumulatedDepreciation.toLocaleString('vi-VN')} VND`,
                    `Gia tri con lai: ${record.netBookValue.toLocaleString('vi-VN')} VND`,
                    `Nguoi su dung: ${record.assignedTo}`,
                    `Phong ban: ${record.department}`,
                    `Vi tri: ${record.location}`,
                    `Trang thai: ${record.status}`,
                    `Cau hinh: ${record.specs}`,
                    `Ghi chu: ${record.notes}`,
                  ];
                  downloadFile(`ly_lich_tai_san_${record.code}.pdf`, generateValidPdfBlob('LY LICH TAI SAN', `Ho so ${record.code}`, lines));
                }}
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

              <div style={{ width: 150, height: 150, margin: '0 auto', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {qrSvg ? <div role="img" aria-label={`QR tài sản ${qrTarget.code}`} style={{ width: 140, height: 140 }} dangerouslySetInnerHTML={{ __html: qrSvg }} /> : <span style={{ color: '#DC2626', fontSize: 12 }}>Mã QR hỗ trợ tối đa 32 byte. Hãy rút gọn mã tài sản.</span>}
              </div>

              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginTop: 10 }}>{qrTarget.name}</div>
              <div style={{ fontSize: 11.5, color: '#64748B' }}>Mã TS: <strong>{qrTarget.code}</strong></div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Bộ phận: {qrTarget.department}</div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => setQrModalOpen(false)}>Đóng</Button>
              <Button type="primary" icon={<PrinterOutlined />} onClick={printAssetTag} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                In tem nhãn dán
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
