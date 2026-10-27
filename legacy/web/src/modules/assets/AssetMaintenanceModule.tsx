import React, { useEffect, useMemo, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  PrinterOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Tag, Alert, Progress, Checkbox } from '../../custom-ui';
import { collectionsApi, employeesApi, type EnterpriseEmployee } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { addMaintenanceCycle, deriveMaintenanceStatus, localIsoDate, MAINTENANCE_CHECKLIST, validateMaintenanceCompletion } from './assetMaintenanceRules';

export interface ChecklistTask {
  item: string;
  done: boolean;
  note?: string;
}

export interface MaintenanceItem {
  key: string;
  maintCode: string;
  assetKey: string;
  systemName: string;
  category: string;
  assetCodes: string;
  location: string;
  frequency: 'Hàng tháng' | 'Hàng quý (3 tháng)' | 'Định kỳ 6 tháng' | 'Hàng năm';
  maintenanceType: 'Phòng ngừa định kỳ' | 'Kiểm định an toàn PCCC & Điện' | 'Nâng cấp bảo trì Firmware / Patch OS';
  slaLevel: 'SLA Platinum (4h)' | 'SLA Gold (8h)' | 'SLA Standard (24h)';
  lastDate: string;
  nextDate: string;
  responsibleEngineer: string;
  responsibleEngineerId: string;
  vendorPartner: string;
  checklist: ChecklistTask[];
  estimatedBudget: number;
  actualCost: number;
  status: 'Đã lên lịch' | 'Đã hoàn thành đúng lịch' | 'Sắp đến hạn' | 'Quá hạn bảo dưỡng' | 'Đang tiến hành bảo dưỡng';
  healthScore: number;
  certificateCode: string;
  notes: string;
  lastCompletedAt?: string;
  lastCompletionStatus?: string;
  maintenanceHistory?: Array<{ date: string; dueDate: string; nextDate: string; completedOnTime: boolean; actualCost: number; healthScore: number; checklist: ChecklistTask[]; notes: string; certificateCode: string; completedBy: string; completedAt: string }>;
}

type AssetOption = {
  key: string;
  code?: string;
  assetCode?: string;
  name?: string;
  assetName?: string;
  category?: string;
  status?: string;
  location?: string;
  currentLocation?: string;
  department?: string;
};

const statusFor = (item: MaintenanceItem) => item.status === 'Đang tiến hành bảo dưỡng'
  ? item.status
  : item.nextDate ? deriveMaintenanceStatus(item.nextDate) : item.status;

const errorText = (error: any, fallback: string) => error?.response?.data?.message || error?.message || fallback;
const codeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const priorityLabel = (value: string) => value.replace(/\s*\([^)]*\)/g, '');

export const AssetMaintenanceModule: React.FC = () => {
  const [data, setData] = useState<MaintenanceItem[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [frequencyFilter, setFrequencyFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<MaintenanceItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [performModalOpen, setPerformModalOpen] = useState(false);
  const [performTarget, setPerformTarget] = useState<MaintenanceItem | null>(null);
  const [checklistState, setChecklistState] = useState<ChecklistTask[]>([]);
  const [healthScoreInput, setHealthScoreInput] = useState<number | ''>('');
  const [actualCostInput, setActualCostInput] = useState<number | ''>('');
  const [performedDate, setPerformedDate] = useState(localIsoDate());
  const [certificateInput, setCertificateInput] = useState('');
  const [performNotes, setPerformNotes] = useState('');
  const [form] = Form.useForm();

  useEffect(() => {
    let mounted = true;
    const initial = dataService.getGenericData('asset_maintenances');
    setData(Array.isArray(initial) ? initial : []);
    setLoading(true);
    void Promise.all([
      dataService.refreshGenericData('asset_maintenances'),
      collectionsApi.get<AssetOption>('asset_items', { limit: 500 }),
      employeesApi.getAll(),
    ]).then(([schedules, assetResponse, employeeResponse]) => {
      if (!mounted) return;
      setData(schedules as MaintenanceItem[]);
      setAssets(assetResponse.data?.data || []);
      setEmployees((employeeResponse.data?.data || []).filter((employee) => employee.isActive && employee.status !== 'Đã nghỉ việc' && employee.role === 'USER'));
    }).catch((error: any) => {
      if (mounted) message.error(errorText(error, 'Không tải được lịch bảo dưỡng, tài sản hoặc nhân viên.'));
    }).finally(() => { if (mounted) setLoading(false); });
    const unsubscribe = dataService.subscribe(() => {
      if (!mounted) return;
      const updated = dataService.getGenericData('asset_maintenances');
      setData(Array.isArray(updated) ? updated : []);
    });
    return () => { mounted = false; unsubscribe(); };
  }, []);

  const currentData = useMemo(() => data.map((item) => ({ ...item, status: statusFor(item) })), [data]);
  const eligibleAssets = assets.filter((asset) => ['Đang sử dụng', 'Trong kho'].includes(String(asset.status))
    && !data.some((plan) => plan.assetKey === asset.key));
  const dueCount = currentData.filter((item) => ['Sắp đến hạn', 'Quá hạn bảo dưỡng'].includes(item.status)).length;
  const completedPlans = currentData.filter((item) => Boolean(item.lastCompletedAt));
  const ratedPlans = completedPlans.filter((item) => Number.isSafeInteger(item.healthScore) && item.healthScore >= 0 && item.healthScore <= 100);
  const averageHealth = ratedPlans.length ? Math.round(ratedPlans.reduce((sum, item) => sum + item.healthScore, 0) / ratedPlans.length) : null;
  const completedCycles = completedPlans.flatMap((item) => item.maintenanceHistory || []).length;
  const onTimeCycles = completedPlans.flatMap((item) => item.maintenanceHistory || []).filter((entry) => entry.completedOnTime).length;

  const filteredData = currentData.filter((item) => {
    const query = searchText.trim().toLocaleLowerCase();
    const matchesSearch = !query || [item.maintCode, item.systemName, item.assetCodes, item.location, item.responsibleEngineer, item.vendorPartner]
      .some((value) => String(value || '').toLocaleLowerCase().includes(query));
    return matchesSearch && (statusFilter === 'all' || item.status === statusFilter) && (frequencyFilter === 'all' || item.frequency === frequencyFilter);
  });

  const handleOpenCreate = () => {
    if (!eligibleAssets.length) {
      message.warning('Cần có tài sản đang sử dụng hoặc trong kho chưa có kế hoạch bảo dưỡng.');
      return;
    }
    form.resetFields();
    form.setFieldsValue({
      maintCode: `BD-${localIsoDate().replace(/-/g, '')}-${codeId().slice(0, 6).toUpperCase()}`,
      frequency: 'Hàng quý (3 tháng)',
      maintenanceType: 'Phòng ngừa định kỳ',
      slaLevel: 'SLA Standard (24h)',
      nextDate: '',
      estimatedBudget: 0,
    });
    setModalOpen(true);
  };

  const handleCreate = async (values: Record<string, any>) => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        ...values,
        key: `maintenance-${codeId()}`,
        assetKey: String(values.assetKey || ''),
        responsibleEngineerId: String(values.responsibleEngineerId || ''),
        estimatedBudget: Number(values.estimatedBudget || 0),
        location: String(values.location || '').trim(),
        vendorPartner: String(values.vendorPartner || '').trim(),
        lastDate: String(values.lastDate || ''),
      };
      const saved = await dataService.createGenericRecord('asset_maintenances', payload) as MaintenanceItem;
      setData((previous) => [saved, ...previous.filter((item) => item.key !== saved.key)]);
      setAssets((previous) => previous.filter((asset) => asset.key !== saved.assetKey));
      message.success(`Đã lưu kế hoạch ${saved.maintCode} cho tài sản ${saved.assetCodes}.`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(errorText(error, 'Không thể lưu kế hoạch bảo dưỡng.'));
    } finally { setSaving(false); }
  };

  const applySaved = (saved: MaintenanceItem) => {
    setData((previous) => previous.map((item) => item.key === saved.key ? saved : item));
    setDetailItem((previous) => previous?.key === saved.key ? saved : previous);
    setPerformTarget((previous) => previous?.key === saved.key ? saved : previous);
  };

  const savePatch = async (item: MaintenanceItem, patch: Record<string, unknown>) => {
    const saved = await dataService.updateGenericRecord('asset_maintenances', { key: item.key, ...patch }) as MaintenanceItem;
    applySaved(saved);
    return saved;
  };

  const handleOpenPerformModal = async (item: MaintenanceItem) => {
    if (saving) return;
    setSaving(true);
    try {
      let target = item;
      if (statusFor(item) !== 'Đang tiến hành bảo dưỡng') {
        target = await savePatch(item, { status: 'Đang tiến hành bảo dưỡng' });
        message.success(`Đã ghi nhận bắt đầu bảo dưỡng ${item.maintCode}.`);
      }
      setPerformTarget(target);
      setChecklistState((target.checklist || MAINTENANCE_CHECKLIST.map((entry) => ({ item: entry, done: false }))).map((entry) => ({ ...entry })));
      setHealthScoreInput('');
      setActualCostInput('');
      setPerformedDate(localIsoDate());
      setCertificateInput('');
      setPerformNotes('');
      setPerformModalOpen(true);
    } catch (error: any) {
      message.error(errorText(error, 'Không thể bắt đầu bảo dưỡng.'));
    } finally { setSaving(false); }
  };

  const handleToggleChecklist = async (index: number) => {
    if (!performTarget || saving) return;
    const updated = checklistState.map((entry, idx) => idx === index ? { ...entry, done: !entry.done } : entry);
    setSaving(true);
    try {
      const saved = await savePatch(performTarget, { checklist: updated });
      setPerformTarget(saved);
      setChecklistState(saved.checklist.map((entry) => ({ ...entry })));
    } catch (error: any) {
      message.error(errorText(error, 'Không lưu được checklist bảo dưỡng.'));
    } finally { setSaving(false); }
  };

  const handleConfirmPerform = async () => {
    if (!performTarget || saving) return;
    try {
      const completion = validateMaintenanceCompletion({
        performedDate, today: localIsoDate(), lastDate: performTarget.lastDate,
        checklist: checklistState,
        healthScore: healthScoreInput,
        actualCost: actualCostInput,
        notes: performNotes,
      });
      const nextDate = addMaintenanceCycle(completion.performedDate, performTarget.frequency);
      setSaving(true);
      const saved = await savePatch(performTarget, {
        status: 'Đã hoàn thành đúng lịch',
        performedDate: completion.performedDate,
        actualCost: completion.actualCost,
        healthScore: completion.healthScore,
        checklist: checklistState,
        notes: completion.notes,
        certificateCode: certificateInput.trim(),
      });
      setPerformModalOpen(false);
      setDetailItem(saved);
      message.success(`Đã lưu biên bản bảo dưỡng ${saved.maintCode}; kỳ kế tiếp ${saved.nextDate || nextDate}.`);
    } catch (error: any) {
      message.error(errorText(error, 'Không thể nghiệm thu bảo dưỡng.'));
    } finally { setSaving(false); }
  };

  const exportRegister = () => downloadFile('Lich_bao_duong_tai_san.xlsx', generateValidXlsxBlob([
    ['Mã kế hoạch', 'Mã tài sản', 'Tên tài sản', 'Vị trí', 'Tần suất', 'Loại bảo dưỡng', 'Kỹ sư phụ trách', 'Đối tác', 'Dự toán', 'Chi phí gần nhất', 'Ngày gần nhất', 'Ngày kế tiếp', 'Điểm sức khỏe', 'Trạng thái'],
    ...filteredData.map((item) => [item.maintCode, item.assetCodes, item.systemName, item.location, item.frequency, item.maintenanceType, item.responsibleEngineer, item.vendorPartner, item.estimatedBudget, item.actualCost, item.lastDate, item.nextDate, item.healthScore || '', item.status]),
  ]));

  const printReport = (item: MaintenanceItem) => downloadFile(`${item.maintCode}_Bao_cao_bao_duong.pdf`, generateValidPdfBlob('BIÊN BẢN BẢO DƯỠNG TÀI SẢN', `${item.maintCode} | ${item.assetCodes} - ${item.systemName}`, [
    `Vị trí: ${item.location || 'Chưa ghi nhận'}`,
    `Trạng thái: ${statusFor(item)}`,
    `Loại bảo dưỡng: ${item.maintenanceType}`,
    `Tần suất: ${item.frequency}`,
    `Người phụ trách: ${item.responsibleEngineer}`,
    `Đối tác do người lập khai báo: ${item.vendorPartner || 'Chưa khai báo'}`,
    `Ngày bảo dưỡng gần nhất: ${item.lastDate || 'Chưa ghi nhận'}`,
    `Ngày kế tiếp: ${item.nextDate}`,
    `Dự toán: ${Number(item.estimatedBudget || 0).toLocaleString('vi-VN')} VNĐ`,
    `Chi phí thực tế gần nhất: ${item.lastCompletedAt ? `${Number(item.actualCost || 0).toLocaleString('vi-VN')} VNĐ` : 'Chưa ghi nhận'}`,
    `Điểm sức khỏe gần nhất: ${item.lastCompletedAt ? `${item.healthScore}/100` : 'Chưa ghi nhận'}`,
    `Mã chứng nhận do người dùng nhập: ${item.certificateCode || 'Chưa ghi nhận'}`,
    'Checklist:',
    ...(item.checklist || []).map((entry) => `${entry.done ? '[x]' : '[ ]'} ${entry.item}${entry.note ? ` — ${entry.note}` : ''}`),
    ...(item.notes ? [`Ghi chú nghiệm thu: ${item.notes}`] : []),
    'Báo cáo phản ánh dữ liệu được lưu trong hệ thống, không xác nhận chứng nhận độc lập hoặc SLA của nhà cung cấp.',
  ]));

  const statusOptions = [
    { label: 'Tất cả trạng thái', value: 'all' },
    { label: 'Đã lên lịch', value: 'Đã lên lịch' },
    { label: 'Sắp đến hạn', value: 'Sắp đến hạn' },
    { label: 'Quá hạn bảo dưỡng', value: 'Quá hạn bảo dưỡng' },
    { label: 'Đang tiến hành bảo dưỡng', value: 'Đang tiến hành bảo dưỡng' },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Kế hoạch bảo dưỡng tài sản</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{data.length} kế hoạch</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Mỗi kế hoạch gắn với một tài sản trong danh mục</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Đến hạn hoặc quá hạn</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: dueCount ? '#D97706' : '#16A34A', marginTop: 4 }}>{dueCount} kế hoạch</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Tính theo ngày đến hạn trong hồ sơ</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Điểm sức khỏe đã ghi nhận</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: averageHealth === null ? '#64748B' : '#16A34A', marginTop: 4 }}>{averageHealth === null ? 'Chưa có' : `${averageHealth} / 100`}</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{ratedPlans.length} biên bản có điểm đánh giá</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Lần bảo dưỡng đã ghi nhận</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>{completedCycles} lần</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{completedCycles ? `${onTimeCycles} lần trước hoặc đúng hạn kế hoạch` : 'Chưa có biên bản nghiệm thu'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input prefix={<SearchOutlined style={{ color: '#bbb' }} />} placeholder="Tìm theo mã kế hoạch, tài sản, vị trí, kỹ sư..." value={searchText} onChange={(event) => setSearchText(event.target.value)} style={{ width: 340, borderRadius: 6 }} allowClear />
          <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 210 }} options={statusOptions} />
          <Select value={frequencyFilter} onChange={setFrequencyFilter} style={{ width: 180 }} options={[
            { label: 'Tất cả tần suất', value: 'all' },
            { label: 'Hàng tháng', value: 'Hàng tháng' },
            { label: 'Hàng quý (3 tháng)', value: 'Hàng quý (3 tháng)' },
            { label: 'Định kỳ 6 tháng', value: 'Định kỳ 6 tháng' },
            { label: 'Hàng năm', value: 'Hàng năm' },
          ]} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} disabled={!filteredData.length} onClick={exportRegister}>Xuất Excel</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Thiết lập lịch bảo dưỡng</Button>
        </div>
      </div>

      <div className="transparent-table-card">
        <KTable loading={loading} dataSource={filteredData} columns={[
          { title: 'Mã kế hoạch & mức xử lý', key: 'code', width: 180, render: (_: any, row: MaintenanceItem) => <div><span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}><CalendarOutlined /> {row.maintCode}</span><Tag color="purple" style={{ marginTop: 3 }}>{priorityLabel(row.slaLevel)}</Tag></div> },
          { title: 'Tài sản & vị trí', key: 'asset', render: (_: any, row: MaintenanceItem) => <div><strong style={{ color: '#0F172A', fontSize: 13.5 }}>{row.systemName}</strong><div style={{ fontSize: 12, color: '#64748B' }}>Vị trí: <strong>{row.location || 'Chưa ghi nhận'}</strong> · Tần suất: <strong style={{ color: '#2563EB' }}>{row.frequency}</strong></div><div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Mã tài sản: <code>{row.assetCodes}</code></div></div> },
          { title: 'Kỳ bảo dưỡng', key: 'dates', width: 190, render: (_: any, row: MaintenanceItem) => <div style={{ fontSize: 12 }}><div>Lần trước: <strong>{row.lastDate || 'Chưa ghi nhận'}</strong></div><div style={{ marginTop: 2 }}>Kế tiếp: <strong style={{ color: statusFor(row) === 'Quá hạn bảo dưỡng' ? '#DC2626' : statusFor(row) === 'Sắp đến hạn' ? '#D97706' : '#2563EB' }}>{row.nextDate}</strong></div></div> },
          { title: 'Điểm sức khỏe', key: 'health', width: 130, render: (_: any, row: MaintenanceItem) => row.lastCompletedAt ? <div><strong style={{ color: row.healthScore >= 95 ? '#16A34A' : '#D97706', fontSize: 13 }}>{row.healthScore} / 100</strong><Progress percent={row.healthScore} size="small" strokeColor={row.healthScore >= 95 ? '#16A34A' : '#D97706'} showInfo={false} /></div> : <span style={{ color: '#64748B' }}>Chưa ghi nhận</span> },
          { title: 'Kỹ sư & đối tác', key: 'engineer', render: (_: any, row: MaintenanceItem) => <div><div style={{ fontWeight: 600, color: '#1E293B' }}><UserOutlined style={{ fontSize: 11, color: '#64748B' }} /> {row.responsibleEngineer}</div><div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{row.vendorPartner || 'Chưa khai báo đối tác'}</div></div> },
          { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (_: string, row: MaintenanceItem) => { const status = statusFor(row); const color = status === 'Quá hạn bảo dưỡng' ? 'error' : status === 'Sắp đến hạn' ? 'warning' : status === 'Đang tiến hành bảo dưỡng' ? 'processing' : 'success'; return <Tag color={color}>{status}</Tag>; } },
          { title: 'Thao tác', key: 'action', width: 180, render: (_: any, row: MaintenanceItem) => <div style={{ display: 'flex', gap: 6 }}><Button size="small" icon={<EyeOutlined />} onClick={() => { setDetailItem(row); setDrawerOpen(true); }}>Xem</Button><Button size="small" type="primary" icon={<ToolOutlined />} disabled={saving} onClick={() => void handleOpenPerformModal(row)} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>{statusFor(row) === 'Đang tiến hành bảo dưỡng' ? 'Nghiệm thu' : 'Bắt đầu'}</Button></div> },
        ]} pagination={{ pageSize: 8 }} />
      </div>

      <Modal title="Thiết lập kế hoạch bảo dưỡng tài sản" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={760}>
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="maintCode" label="Mã kế hoạch" rules={[{ required: true, message: 'Nhập mã kế hoạch.' }]}><Input maxLength={80} /></Form.Item>
            <Form.Item name="frequency" label="Tần suất bảo dưỡng" rules={[{ required: true }]}><Select options={[
              { label: 'Hàng tháng (30 ngày)', value: 'Hàng tháng' }, { label: 'Hàng quý (90 ngày)', value: 'Hàng quý (3 tháng)' }, { label: 'Định kỳ 6 tháng (180 ngày)', value: 'Định kỳ 6 tháng' }, { label: 'Hàng năm (365 ngày)', value: 'Hàng năm' },
            ]} /></Form.Item>
            <Form.Item name="slaLevel" label="Mức ưu tiên xử lý tham chiếu" rules={[{ required: true }]}><Select options={[
              { label: 'Platinum · tham chiếu 4 giờ', value: 'SLA Platinum (4h)' }, { label: 'Gold · tham chiếu 8 giờ', value: 'SLA Gold (8h)' }, { label: 'Standard · tham chiếu 24 giờ', value: 'SLA Standard (24h)' },
            ]} /></Form.Item>
          </div>
          <Form.Item name="assetKey" label="Tài sản trong danh mục" rules={[{ required: true, message: 'Chọn tài sản thật trong danh mục.' }]}>
            <Select showSearch placeholder="Chọn tài sản" options={eligibleAssets.map((asset) => ({ value: asset.key, label: `${asset.code || asset.assetCode || asset.key} · ${asset.name || asset.assetName || 'Tài sản'} · ${asset.status}` }))} onChange={(assetKey) => {
              const asset = eligibleAssets.find((entry) => entry.key === assetKey);
              if (asset && !form.getFieldValue('location')) form.setFieldsValue({ location: asset.location || asset.currentLocation || asset.department || '' });
            }} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="maintenanceType" label="Loại hình bảo dưỡng" rules={[{ required: true }]}><Select options={[
              { label: 'Phòng ngừa định kỳ', value: 'Phòng ngừa định kỳ' }, { label: 'Kiểm định an toàn PCCC & Điện', value: 'Kiểm định an toàn PCCC & Điện' }, { label: 'Nâng cấp Firmware / Patch OS', value: 'Nâng cấp bảo trì Firmware / Patch OS' },
            ]} /></Form.Item>
            <Form.Item name="location" label="Vị trí lắp đặt"><Input maxLength={255} placeholder="Vị trí theo danh mục tài sản" /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="responsibleEngineerId" label="Kỹ sư phụ trách" rules={[{ required: true, message: 'Chọn nhân viên đang hoạt động.' }]}><Select showSearch placeholder="Chọn nhân viên" options={employees.map((employee) => ({ value: employee.id, label: `${employee.name} · ${employee.employeeCode || employee.code || employee.id}` }))} /></Form.Item>
            <Form.Item name="vendorPartner" label="Đối tác kỹ thuật (khai báo)" rules={[{ max: 255 }]}><Input maxLength={255} placeholder="Để trống nếu không có" /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="lastDate" label="Ngày bảo dưỡng gần nhất"><Input type="date" /></Form.Item>
            <Form.Item name="nextDate" label="Ngày bảo dưỡng tiếp theo" rules={[{ required: true }]}><Input type="date" /></Form.Item>
            <Form.Item name="estimatedBudget" label="Dự toán (VNĐ)" rules={[{ validator: async (_rule: unknown, value: unknown) => {
              if (value === undefined || value === null || value === '') return;
              const amount = Number(value);
              if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000_000_000) throw new Error('Dự toán phải là số nguyên không âm hợp lệ.');
            } }]}><Input type="number" min={0} step={1000} /></Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}><Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button><Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu kế hoạch</Button></div>
        </Form>
      </Modal>

      <Drawer title="Hồ sơ bảo dưỡng tài sản" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={580}>
        {detailItem && <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}><div><div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>{detailItem.maintCode}</div><div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{detailItem.systemName}</div></div><Tag color="purple">{priorityLabel(detailItem.slaLevel)}</Tag></div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>Mã tài sản: <strong>{detailItem.assetCodes}</strong> · Vị trí: <strong>{detailItem.location || 'Chưa ghi nhận'}</strong> · Tần suất: <strong>{detailItem.frequency}</strong></div>
            <div style={{ marginTop: 8 }}><Tag color={statusFor(detailItem) === 'Quá hạn bảo dưỡng' ? 'error' : statusFor(detailItem) === 'Sắp đến hạn' ? 'warning' : 'processing'}>{statusFor(detailItem)}</Tag></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, background: '#F8FAFC' }}><div style={{ fontSize: 11.5, color: '#475569', fontWeight: 600 }}>ĐIỂM SỨC KHỎE GẦN NHẤT</div><div style={{ fontSize: 24, fontWeight: 800, color: detailItem.healthScore ? '#16A34A' : '#64748B', marginTop: 2 }}>{detailItem.healthScore ? `${detailItem.healthScore} / 100` : 'Chưa ghi nhận'}</div>{detailItem.healthScore > 0 && <Progress percent={detailItem.healthScore} size="small" strokeColor="#16A34A" showInfo={false} />}</div>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, background: '#F8FAFC' }}><div style={{ fontSize: 11.5, color: '#475569', fontWeight: 600 }}>CHỨNG TỪ DO NGƯỜI DÙNG GHI</div><div style={{ fontSize: 13, fontWeight: 700, color: '#2563EB', marginTop: 6 }}>{detailItem.certificateCode || 'Chưa ghi nhận'}</div><div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Hệ thống chưa xác minh chứng nhận bên ngoài.</div></div>
          </div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, fontSize: 12.5 }}>
            <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Checklist kỳ hiện tại ({detailItem.checklist?.filter((entry) => entry.done).length || 0}/{detailItem.checklist?.length || 0} mục hoàn tất)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{detailItem.checklist?.map((entry, index) => <div key={`${entry.item}-${index}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#F8FAFC', padding: 8, borderRadius: 6 }}>{entry.done ? <CheckCircleOutlined style={{ color: '#16A34A', marginTop: 2 }} /> : <ClockCircleOutlined style={{ color: '#D97706', marginTop: 2 }} />}<div style={{ flex: 1 }}><span style={{ color: entry.done ? '#0F172A' : '#64748B', fontWeight: entry.done ? 600 : 400 }}>{entry.item}</span>{entry.note && <div style={{ fontSize: 11, color: '#009688', marginTop: 2 }}>Ghi chú: {entry.note}</div>}</div></div>)}</div>
          </div>
          {!!detailItem.maintenanceHistory?.length && <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, fontSize: 12.5 }}><div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Biên bản bảo dưỡng đã lưu</div><div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{detailItem.maintenanceHistory.map((entry, index) => <div key={`${entry.completedAt}-${index}`} style={{ borderLeft: '3px solid #009688', paddingLeft: 10 }}><div style={{ fontWeight: 600 }}>{entry.date} · {entry.completedBy} · {entry.completedOnTime ? 'Đúng hạn' : 'Trễ hạn'}</div><div style={{ color: '#64748B', marginTop: 3 }}>Chi phí {Number(entry.actualCost || 0).toLocaleString('vi-VN')} ₫ · Điểm sức khỏe {entry.healthScore}/100 · Kỳ kế tiếp {entry.nextDate}</div>{entry.notes && <div style={{ marginTop: 3 }}>{entry.notes}</div>}<div style={{ marginTop: 4 }}>{entry.checklist?.filter((task) => task.done).length || 0}/{entry.checklist?.length || 0} mục checklist đã hoàn tất</div></div>)}</div></div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Kỹ sư phụ trách:</span><strong>{detailItem.responsibleEngineer}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Đối tác kỹ thuật:</span><strong>{detailItem.vendorPartner || 'Chưa khai báo'}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Dự toán / Chi phí gần nhất:</span><span>{Number(detailItem.estimatedBudget || 0).toLocaleString('vi-VN')} ₫ / <strong>{detailItem.lastCompletedAt ? `${Number(detailItem.actualCost || 0).toLocaleString('vi-VN')} ₫` : 'Chưa ghi nhận'}</strong></span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Bảo dưỡng gần nhất:</span><span>{detailItem.lastDate || 'Chưa ghi nhận'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Hạn kỳ kế tiếp:</span><strong style={{ color: '#2563EB' }}>{detailItem.nextDate}</strong></div>
            {detailItem.lastCompletedAt && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Người nghiệm thu:</span><strong>{detailItem.maintenanceHistory?.[detailItem.maintenanceHistory.length - 1]?.completedBy || 'Đã ghi nhận'}</strong></div>}
            {detailItem.notes && <div><span style={{ color: '#64748B' }}>Ghi chú:</span> {detailItem.notes}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><Button icon={<PrinterOutlined />} onClick={() => printReport(detailItem)} style={{ flex: 1 }}>In báo cáo (PDF)</Button><Button type="primary" icon={<ToolOutlined />} disabled={saving} onClick={() => void handleOpenPerformModal(detailItem)} style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}>{statusFor(detailItem) === 'Đang tiến hành bảo dưỡng' ? 'Tiếp tục nghiệm thu' : 'Bắt đầu bảo dưỡng'}</Button></div>
        </div>}
      </Drawer>

      <Modal title="Thực hiện và nghiệm thu bảo dưỡng" open={performModalOpen} onCancel={() => setPerformModalOpen(false)} footer={null} width={560}>
        {performTarget && <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
          <Alert message={`Bảo dưỡng: ${performTarget.systemName}`} description={`Tài sản ${performTarget.assetCodes} · ${performTarget.location || 'Chưa ghi nhận vị trí'} · ${performTarget.frequency}`} type="info" showIcon />
          <div><label style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: 8 }}>Checklist kiểm tra kỹ thuật:</label><div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}>{checklistState.map((entry, index) => <Checkbox key={entry.item} checked={entry.done} disabled={saving} onChange={() => void handleToggleChecklist(index)}><span style={{ fontSize: 12.5, fontWeight: entry.done ? 600 : 400 }}>{entry.item}</span></Checkbox>)}</div></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4 }}>Ngày thực hiện:</label><Input type="date" value={performedDate} max={localIsoDate()} onChange={(event) => setPerformedDate(event.target.value)} /></div>
            <div><label style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4 }}>Điểm sức khỏe sau bảo dưỡng:</label><Input type="number" min={0} max={100} step={1} value={healthScoreInput} onChange={(event) => setHealthScoreInput(event.target.value === '' ? '' : Number(event.target.value))} suffix="/ 100" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4 }}>Chi phí thực tế (VNĐ):</label><Input type="number" min={0} step={1000} value={actualCostInput} onChange={(event) => setActualCostInput(event.target.value === '' ? '' : Number(event.target.value))} /></div>
            <div><label style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4 }}>Mã chứng từ (nếu có):</label><Input maxLength={160} value={certificateInput} onChange={(event) => setCertificateInput(event.target.value)} /></div>
          </div>
          <div><label style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4 }}>Ghi chú nghiệm thu:</label><Input.TextArea rows={2} maxLength={2000} value={performNotes} onChange={(event) => setPerformNotes(event.target.value)} /></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}><Button onClick={() => setPerformModalOpen(false)}>Đóng</Button><Button type="primary" icon={<CheckCircleOutlined />} loading={saving} onClick={() => void handleConfirmPerform()} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu biên bản nghiệm thu</Button></div>
        </div>}
      </Modal>
    </div>
  );
};
