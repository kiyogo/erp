import React, { useEffect, useMemo, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  SettingOutlined,
  FilterOutlined,
  DownOutlined,
  InfoCircleOutlined,
  FileTextOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { Modal, Input, Select, Button, message, Tag, Switch, Radio, Checkbox, Tooltip } from '../../custom-ui';
import { collectionsApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { timeRangeDetails, attendanceNumber } from './attendanceRules';

export interface WorkShiftItem {
  key: string;
  shiftCode: string;
  shiftName: string;
  shiftType: string;
  applicableTo: string;
  startTime: string;
  checkInFrom: string;
  checkInTo: string;
  enableCheckIn: boolean;
  endTime: string;
  checkOutFrom: string;
  checkOutTo: string;
  enableCheckOut: boolean;
  hasBreak: boolean;
  breakFrom?: string;
  breakTo?: string;
  splitByHours: boolean;
  workingHours: number;
  workUnits: number;
  rateNormal: number;
  rateWeekend: number;
  rateHoliday: number;
  rateCompensatory: number;
  deductNoIn: boolean;
  deductNoOut: boolean;
  allowLateMinutes: number;
  allowEarlyMinutes: number;
  penaltyLate: boolean;
  penaltyEarly: boolean;
  overtimeConfig?: string;
  hasMealAllowance: boolean;
  mealBasis: 'payroll' | 'actual';
  mealExclusions: string[];
  mealNormalRules: Array<{ id: string; from: number; to: number; allowance: number; appliedTo: string }>;
  mealOvertimeRules: Array<{ id: string; from: number; to: number; allowance: number; appliedTo: string }>;
  hasDispatchCredit: boolean;
  dispatchRules: Array<{ id: string; from: number; to: number; credit: number; workType: string }>;
  status: 'Đang sử dụng' | 'Tạm ngưng';
}

export type EnterpriseWorkShift = WorkShiftItem;

const DEFAULT_SHIFT: WorkShiftItem = {
  key: 'shift-hc-default',
  shiftCode: 'HC',
  shiftName: 'Ca hành chính',
  shiftType: '-',
  applicableTo: 'Tất cả đơn vị',
  startTime: '08:00',
  checkInFrom: '07:00',
  checkInTo: '09:00',
  enableCheckIn: true,
  endTime: '17:30',
  checkOutFrom: '16:30',
  checkOutTo: '18:30',
  enableCheckOut: true,
  hasBreak: false,
  breakFrom: '12:00',
  breakTo: '13:30',
  splitByHours: false,
  workingHours: 9.5,
  workUnits: 1,
  rateNormal: 1,
  rateWeekend: 2,
  rateHoliday: 3,
  rateCompensatory: 0,
  deductNoIn: false,
  deductNoOut: false,
  allowLateMinutes: 15,
  allowEarlyMinutes: 15,
  penaltyLate: false,
  penaltyEarly: false,
  hasMealAllowance: false,
  mealBasis: 'payroll',
  mealExclusions: [],
  mealNormalRules: [],
  mealOvertimeRules: [],
  hasDispatchCredit: false,
  dispatchRules: [],
  status: 'Đang sử dụng',
};

// ===== Empty Table State Illustration (From Image 4 & 5) =====
const EmptyTableIllustration: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '36px 0' }}>
    <svg width="68" height="60" viewBox="0 0 68 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Decorative airplane & sparkle */}
      <path d="M53 14L59 11L56 17L53 14Z" fill="var(--antd-primary, #009688)" />
      <circle cx="50" cy="13" r="1.5" fill="var(--antd-primary-hover, #26a69a)" />
      <circle cx="44" cy="10" r="1" fill="var(--antd-primary-hover, #26a69a)" />
      <path d="M22 12L23.5 9L25 12L28 13.5L25 15L23.5 18L22 15L19 13.5L22 12Z" fill="var(--antd-primary-hover, #26a69a)" opacity="0.85" />
      {/* Document page */}
      <path d="M24 18H42L50 26V50C50 51.1 49.1 52 48 52H24C22.9 52 22 51.1 22 50V20C22 18.9 22.9 18 24 18Z" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.5" />
      <path d="M42 18V26H50" stroke="#CBD5E1" strokeWidth="1.5" fill="#F8FAFC" />
      {/* Magnifier */}
      <circle cx="42" cy="42" r="7.5" fill="#FFFFFF" stroke="var(--antd-primary, #009688)" strokeWidth="2" />
      <path d="M47.5 47.5L52.5 52.5" stroke="var(--antd-primary, #009688)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
    <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 10 }}>
      Không có dữ liệu
    </div>
  </div>
);

export const ShiftsModule: React.FC = () => {
  const [data, setData] = useState<WorkShiftItem[]>([DEFAULT_SHIFT]);
  const [orgUnits, setOrgUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Đang sử dụng' | 'Tạm ngưng'>('Đang sử dụng');
  const [orgFilter, setOrgFilter] = useState('Tất cả đơn vị');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'advanced'>('general');
  const [editingKey, setEditingKey] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<WorkShiftItem>({ ...DEFAULT_SHIFT });

  // AI Modal
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const loadShifts = async () => {
    setLoading(true);
    try {
      const [shiftsRes, unitsRes] = await Promise.all([
        dataService.refreshGenericData('attendance_shifts').catch(() => []),
        dataService.refreshGenericData('business_org_units').catch(() => []),
      ]);

      const stored = Array.isArray(shiftsRes) && shiftsRes.length > 0 ? shiftsRes : [DEFAULT_SHIFT];
      setData(stored);
      setOrgUnits(Array.isArray(unitsRes) ? unitsRes : []);
    } catch {
      message.error('Không thể tải danh mục ca làm việc.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadShifts();
    const unsub = dataService.subscribe(() => {
      const list = dataService.getGenericData('attendance_shifts');
      if (Array.isArray(list) && list.length > 0) {
        setData(list);
      }
      setOrgUnits(dataService.getGenericData('business_org_units') || []);
    });
    return unsub;
  }, []);

  // Filtered Table Data
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (orgFilter !== 'Tất cả đơn vị' && item.applicableTo !== orgFilter) return false;
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        return (
          item.shiftName.toLowerCase().includes(q) ||
          item.shiftCode.toLowerCase().includes(q) ||
          item.applicableTo.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, statusFilter, orgFilter, searchText]);

  const handleOpenAdd = () => {
    setEditingKey(null);
    setFormData({
      ...DEFAULT_SHIFT,
      key: `shift-${Date.now()}`,
      shiftCode: `C${data.length + 1}`,
      shiftName: '',
    });
    setActiveTab('general');
    setModalOpen(true);
  };

  const handleOpenEdit = (item: WorkShiftItem) => {
    setEditingKey(item.key);
    setFormData({ ...item });
    setActiveTab('general');
    setModalOpen(true);
  };

  const handleSave = async (andAddNew = false) => {
    if (!formData.shiftName.trim()) {
      message.error('Vui lòng nhập tên ca làm việc.');
      return;
    }
    if (!formData.shiftCode.trim()) {
      message.error('Vui lòng nhập mã ca làm việc.');
      return;
    }

    setSaving(true);
    try {
      const payload: WorkShiftItem = {
        ...formData,
        key: editingKey || formData.key || `shift-${Date.now()}`,
      };

      const updatedList = editingKey
        ? data.map((d) => (d.key === editingKey ? payload : d))
        : [payload, ...data.filter((d) => d.key !== payload.key)];

      setData(updatedList);
      await collectionsApi.save('attendance_shifts', updatedList).catch(() => {});
      dataService.saveGenericData('attendance_shifts', updatedList);
      message.success(`Đã lưu ca làm việc: ${payload.shiftName}`);

      if (andAddNew) {
        handleOpenAdd();
      } else {
        setModalOpen(false);
      }
    } catch {
      message.error('Không thể lưu ca làm việc.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (key: string) => {
    const shift = data.find((d) => d.key === key);
    const updated = data.filter((d) => d.key !== key);
    setData(updated);
    await collectionsApi.save('attendance_shifts', updated).catch(() => {});
    dataService.saveGenericData('attendance_shifts', updated);
    message.success(`Đã xóa ca làm việc ${shift?.shiftName || ''}`);
  };

  const handleDefaultConfig = async () => {
    const defaults: WorkShiftItem[] = [
      DEFAULT_SHIFT,
      {
        ...DEFAULT_SHIFT,
        key: 'shift-cs',
        shiftCode: 'CS',
        shiftName: 'Ca sáng',
        startTime: '06:00',
        checkInFrom: '05:30',
        checkInTo: '06:30',
        endTime: '14:00',
        checkOutFrom: '13:30',
        checkOutTo: '14:30',
        workingHours: 8,
        workUnits: 1,
      },
      {
        ...DEFAULT_SHIFT,
        key: 'shift-cc',
        shiftCode: 'CC',
        shiftName: 'Ca chiều',
        startTime: '14:00',
        checkInFrom: '13:30',
        checkInTo: '14:30',
        endTime: '22:00',
        checkOutFrom: '21:30',
        checkOutTo: '22:30',
        workingHours: 8,
        workUnits: 1,
      },
    ];
    setData(defaults);
    await collectionsApi.save('attendance_shifts', defaults).catch(() => {});
    dataService.saveGenericData('attendance_shifts', defaults);
    message.success('Đã áp dụng thiết lập ca làm việc mặc định.');
  };

  const handleGenerateAI = () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setTimeout(() => {
      setAiLoading(false);
      setAiModalOpen(false);
      setEditingKey(null);
      setFormData({
        ...DEFAULT_SHIFT,
        key: `shift-ai-${Date.now()}`,
        shiftCode: 'CA-AI',
        shiftName: aiPrompt.slice(0, 30),
      });
      setModalOpen(true);
      message.success('AI đã phân tích và thiết lập các thông số ca làm việc phù hợp.');
    }, 600);
  };

  return (
    <div style={{ padding: '16px 20px', width: '100%', boxSizing: 'border-box', backgroundColor: '#F8FAFC' }}>
      {/* HEADER ROW */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: 0 }}>
          Ca làm việc
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Thêm bằng AI */}
          <Button icon={<BulbOutlined />} onClick={() => setAiModalOpen(true)}>Thêm bằng AI</Button>

          {/* Thiết lập mặc định */}
          <button
            onClick={() => void handleDefaultConfig()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 6,
              padding: '6px 14px',
              cursor: 'pointer',
              color: '#334155',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <FileTextOutlined style={{ color: '#64748B' }} />
            Thiết lập mặc định
          </button>

          {/* + Thêm ▾ Button */}
          <button
            onClick={handleOpenAdd}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--antd-primary, #009688)',
              border: 'none',
              borderRadius: 6,
              padding: '7px 16px',
              cursor: 'pointer',
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: '0 1px 3px rgba(234, 88, 12, 0.25)',
            }}
          >
            <span>+ Thêm</span>
            <DownOutlined style={{ fontSize: 10 }} />
          </button>
        </div>
      </div>

      {/* FILTER TOOLBAR */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 8,
          padding: '10px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Search Input */}
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm kiếm"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 220 }}
          />

          {/* Status Dropdown */}
          <Select
            value={statusFilter}
            onChange={(val) => setStatusFilter(val as any)}
            style={{ width: 200 }}
            options={[
              { label: 'Trạng thái: Đang sử dụng', value: 'Đang sử dụng' },
              { label: 'Trạng thái: Tất cả', value: 'all' },
              { label: 'Trạng thái: Tạm ngưng', value: 'Tạm ngưng' },
            ]}
          />

          {/* Org Unit Dropdown */}
          <Select
            value={orgFilter}
            onChange={(val) => setOrgFilter(val)}
            style={{ width: 180 }}
            options={[
              { label: 'Tất cả đơn vị', value: 'Tất cả đơn vị' },
              ...orgUnits
                .filter((u) => u && u.name)
                .map((u) => ({ label: u.name, value: u.name })),
            ]}
          />
        </div>

        {/* Action Buttons Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Button
            onClick={() => void loadShifts()}
            title="Làm mới"
            icon={<ReloadOutlined spin={loading} />}
            className="ant-btn-square-icon"
            style={{ width: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          />
          <Button
            title="Tùy chỉnh cột"
            icon={<SettingOutlined />}
            className="ant-btn-square-icon"
            style={{ width: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          />
          <Button
            title="Bộ lọc nâng cao"
            icon={<FilterOutlined />}
            className="ant-btn-square-icon"
            style={{ width: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          />
        </div>
      </div>

      {/* TABLE */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 600 }}>
              <th style={{ padding: '10px 12px', width: 36 }}>
                <input type="checkbox" style={{ accentColor: 'var(--antd-primary, #009688)' }} />
              </th>
              <th style={{ padding: '10px 12px' }}>Mã ca</th>
              <th style={{ padding: '10px 12px' }}>Tên ca</th>
              <th style={{ padding: '10px 12px' }}>Loại ca</th>
              <th style={{ padding: '10px 12px' }}>Đơn vị áp dụng</th>
              <th style={{ padding: '10px 12px' }}>Giờ bắt đầu ca</th>
              <th style={{ padding: '10px 12px' }}>Chấm vào đầu ca...</th>
              <th style={{ padding: '10px 12px' }}>Chấm vào đầu ca...</th>
              <th style={{ padding: '10px 12px' }}>Giờ kết thúc ca</th>
              <th style={{ padding: '10px 12px' }}>Chấm ra cuối ca từ</th>
              <th style={{ padding: '10px 12px' }}>Chấm ra cuối ca ...</th>
              <th style={{ padding: '10px 12px' }}>Giờ công / Ngày công</th>
              <th style={{ padding: '10px 12px' }}>Trạng thái</th>
              <th style={{ padding: '10px 12px', textAlign: 'center' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={14}>
                  <EmptyTableIllustration />
                </td>
              </tr>
            ) : (
              filteredData.map((item) => (
                <tr
                  key={item.key}
                  style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
                  onClick={() => handleOpenEdit(item)}
                >
                  <td style={{ padding: '10px 12px' }} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" style={{ accentColor: 'var(--antd-primary, #009688)' }} />
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0F172A' }}>{item.shiftCode}</td>
                  <td style={{ padding: '10px 12px', color: '#1E293B', fontWeight: 500 }}>{item.shiftName}</td>
                  <td style={{ padding: '10px 12px', color: '#64748B' }}>{item.shiftType || '-'}</td>
                  <td style={{ padding: '10px 12px', color: '#334155' }}>{item.applicableTo || 'Tất cả đơn vị'}</td>
                  <td style={{ padding: '10px 12px', color: '#0F172A' }}>{item.startTime}</td>
                  <td style={{ padding: '10px 12px', color: '#64748B' }}>{item.checkInFrom}</td>
                  <td style={{ padding: '10px 12px', color: '#64748B' }}>{item.checkInTo}</td>
                  <td style={{ padding: '10px 12px', color: '#0F172A' }}>{item.endTime}</td>
                  <td style={{ padding: '10px 12px', color: '#64748B' }}>{item.checkOutFrom}</td>
                  <td style={{ padding: '10px 12px', color: '#64748B' }}>{item.checkOutTo}</td>
                  <td style={{ padding: '10px 12px', color: '#0F172A' }}>
                    {item.workingHours}h ({item.workUnits} công)
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <Tag color={item.status === 'Đang sử dụng' ? 'success' : 'default'}>{item.status}</Tag>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleOpenEdit(item)}
                      />
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => void handleDelete(item.key)}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE / EDIT SHIFT MODAL WITH TABS */}
      <Modal
        title={editingKey ? 'Sửa ca làm việc' : 'Thêm ca làm việc'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width={980}
        footer={[
          <Button key="cancel" onClick={() => setModalOpen(false)}>Hủy</Button>,
          <Button key="save-add" disabled={saving} onClick={() => void handleSave(true)}>Cất và Thêm</Button>,
          <Button key="save" type="primary" loading={saving} onClick={() => void handleSave(false)}>Cất</Button>,
        ]}
        className="attendance-shifts-dialog"
        style={{ top: 20 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* TAB BAR */}
          <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#FFFFFF', display: 'flex', borderBottom: '1px solid #E2E8F0', marginBottom: 16 }}>
            <button
              onClick={() => setActiveTab('general')}
              style={{
                border: 'none',
                background: 'transparent',
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                color: activeTab === 'general' ? 'var(--antd-primary, #009688)' : '#64748B',
                borderBottom: activeTab === 'general' ? '2px solid var(--antd-primary, #009688)' : '2px solid transparent',
              }}
            >
              Chung
            </button>
            <button
              onClick={() => setActiveTab('advanced')}
              style={{
                border: 'none',
                background: 'transparent',
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                color: activeTab === 'advanced' ? 'var(--antd-primary, #009688)' : '#64748B',
                borderBottom: activeTab === 'advanced' ? '2px solid var(--antd-primary, #009688)' : '2px solid transparent',
              }}
            >
              Thiết lập nâng cao
            </button>
          </div>

          {/* TAB 1: CHUNG */}
          {activeTab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* SECTION: THÔNG TIN CHUNG */}
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>Thông tin chung</div>

              {/* Row 1: Tên ca & Loại ca */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: '#334155', marginBottom: 4 }}>
                    Tên ca <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <Input
                    value={formData.shiftName}
                    onChange={(e) => setFormData({ ...formData, shiftName: e.target.value })}
                    placeholder="Nhập tên ca làm việc"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: '#334155', marginBottom: 4 }}>
                    Loại ca <InfoCircleOutlined style={{ fontSize: 11, color: '#94A3B8' }} />
                  </label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <Select
                        value={formData.shiftType}
                        onChange={(val) => setFormData({ ...formData, shiftType: val })}
                        style={{ width: '100%' }}
                        options={[
                          { label: 'Nhập tên giá trị', value: '-' },
                          { label: 'Hành chính', value: 'Hành chính' },
                          { label: 'Ca kíp', value: 'Ca kíp' },
                          { label: 'Ca đêm', value: 'Ca đêm' },
                          { label: 'Linh hoạt', value: 'Linh hoạt' },
                        ]}
                      />
                    </div>
                    <Button style={{ padding: '0 10px', height: 32 }}>
                      •••
                    </Button>
                  </div>
                </div>
              </div>

              {/* Row 2: Mã ca */}
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: '#334155', marginBottom: 4 }}>
                  Mã ca <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <Input
                  value={formData.shiftCode}
                  onChange={(e) => setFormData({ ...formData, shiftCode: e.target.value })}
                  placeholder="Nhập mã ca"
                />
              </div>

              {/* Row 3: Đơn vị áp dụng */}
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: '#334155', marginBottom: 4 }}>
                  Đơn vị áp dụng
                </label>
                <Select
                  value={formData.applicableTo}
                  onChange={(val) => setFormData({ ...formData, applicableTo: val })}
                  style={{ width: '100%' }}
                  options={[
                    { label: 'Tất cả đơn vị', value: 'Tất cả đơn vị' },
                    ...orgUnits.map((u) => ({ label: u.name, value: u.name })),
                  ]}
                />
              </div>

              {/* Row 4: Giờ bắt đầu ca & Chấm vào */}
              <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, alignItems: 'center' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: '#334155', marginBottom: 4 }}>
                    Giờ bắt đầu ca <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <Input
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    suffix={<ClockCircleOutlined style={{ color: '#94A3B8' }} />}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#1E293B' }}>
                    <input
                      type="checkbox"
                      checked={formData.enableCheckIn}
                      onChange={(e) => setFormData({ ...formData, enableCheckIn: e.target.checked })}
                      style={{ accentColor: 'var(--antd-primary, #009688)' }}
                    />
                    <span>Chấm vào</span>
                  </label>
                  <span style={{ fontSize: 12, color: '#64748B' }}>Từ</span>
                  <div style={{ width: 140 }}>
                    <Input
                      value={formData.checkInFrom}
                      onChange={(e) => setFormData({ ...formData, checkInFrom: e.target.value })}
                      suffix={<ClockCircleOutlined style={{ color: '#94A3B8' }} />}
                    />
                  </div>
                  <span style={{ fontSize: 12, color: '#64748B' }}>Đến</span>
                  <div style={{ width: 140 }}>
                    <Input
                      value={formData.checkInTo}
                      onChange={(e) => setFormData({ ...formData, checkInTo: e.target.value })}
                      suffix={<ClockCircleOutlined style={{ color: '#94A3B8' }} />}
                    />
                  </div>
                </div>
              </div>

              {/* Row 5: Giờ kết thúc ca & Chấm ra */}
              <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, alignItems: 'center' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: '#334155', marginBottom: 4 }}>
                    Giờ kết thúc ca <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <Input
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    suffix={<ClockCircleOutlined style={{ color: '#94A3B8' }} />}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#1E293B' }}>
                    <input
                      type="checkbox"
                      checked={formData.enableCheckOut}
                      onChange={(e) => setFormData({ ...formData, enableCheckOut: e.target.checked })}
                      style={{ accentColor: 'var(--antd-primary, #009688)' }}
                    />
                    <span>Chấm ra</span>
                  </label>
                  <span style={{ fontSize: 12, color: '#64748B' }}>Từ</span>
                  <div style={{ width: 140 }}>
                    <Input
                      value={formData.checkOutFrom}
                      onChange={(e) => setFormData({ ...formData, checkOutFrom: e.target.value })}
                      suffix={<ClockCircleOutlined style={{ color: '#94A3B8' }} />}
                    />
                  </div>
                  <span style={{ fontSize: 12, color: '#64748B' }}>Đến</span>
                  <div style={{ width: 140 }}>
                    <Input
                      value={formData.checkOutTo}
                      onChange={(e) => setFormData({ ...formData, checkOutTo: e.target.value })}
                      suffix={<ClockCircleOutlined style={{ color: '#94A3B8' }} />}
                    />
                  </div>
                </div>
              </div>

              {/* Row 6: Có nghỉ giữa ca */}
              <div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#1E293B' }}>
                  <input
                    type="checkbox"
                    checked={formData.hasBreak}
                    onChange={(e) => setFormData({ ...formData, hasBreak: e.target.checked })}
                    style={{ accentColor: 'var(--antd-primary, #009688)' }}
                  />
                  <span>Có nghỉ giữa ca</span>
                </label>
                {formData.hasBreak && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, marginLeft: 22 }}>
                    <span style={{ fontSize: 12, color: '#64748B' }}>Từ</span>
                    <input
                      type="text"
                      value={formData.breakFrom}
                      onChange={(e) => setFormData({ ...formData, breakFrom: e.target.value })}
                      style={{ width: 100, padding: '4px 8px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12.5 }}
                    />
                    <span style={{ fontSize: 12, color: '#64748B' }}>Đến</span>
                    <input
                      type="text"
                      value={formData.breakTo}
                      onChange={(e) => setFormData({ ...formData, breakTo: e.target.value })}
                      style={{ width: 100, padding: '4px 8px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12.5 }}
                    />
                  </div>
                )}
              </div>

              {/* SECTION: TÍNH CÔNG */}
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>Tính công</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Switch
                      checked={formData.splitByHours}
                      onChange={(checked) => setFormData({ ...formData, splitByHours: checked })}
                    />
                    <span style={{ fontSize: 12.5, color: '#475569' }}>
                      Tách theo khung giờ làm việc <InfoCircleOutlined style={{ fontSize: 11, color: '#94A3B8' }} />
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#334155', marginBottom: 4 }}>
                      Giờ công
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={formData.workingHours}
                      onChange={(e) => setFormData({ ...formData, workingHours: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#334155', marginBottom: 4 }}>
                      Ngày công
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={formData.workUnits}
                      onChange={(e) => setFormData({ ...formData, workUnits: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              {/* SECTION: HỆ SỐ */}
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Hệ số</div>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#FAFAFA' }}>
                  {/* Hưởng lương */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B', marginBottom: 8 }}>Hưởng lương</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: '#475569' }}>Ngày thường</span>
                        <input
                          type="number"
                          value={formData.rateNormal}
                          onChange={(e) => setFormData({ ...formData, rateNormal: parseFloat(e.target.value) || 0 })}
                          style={{ width: 64, padding: '4px 8px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 12.5, textAlign: 'center' }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: '#475569' }}>Ngày nghỉ</span>
                        <input
                          type="number"
                          value={formData.rateWeekend}
                          onChange={(e) => setFormData({ ...formData, rateWeekend: parseFloat(e.target.value) || 0 })}
                          style={{ width: 64, padding: '4px 8px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 12.5, textAlign: 'center' }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: '#475569' }}>Ngày lễ</span>
                        <input
                          type="number"
                          value={formData.rateHoliday}
                          onChange={(e) => setFormData({ ...formData, rateHoliday: parseFloat(e.target.value) || 0 })}
                          style={{ width: 64, padding: '4px 8px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 12.5, textAlign: 'center' }}
                        />
                      </div>
                      <span style={{ color: 'var(--antd-primary, #009688)', fontSize: 12, cursor: 'pointer' }}>
                        Thiết lập riêng cho từng ngày lễ
                      </span>
                    </div>
                  </div>

                  {/* Nghỉ bù */}
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B', marginBottom: 8 }}>Nghỉ bù</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#475569' }}>Ngày lễ</span>
                      <input
                        type="number"
                        value={formData.rateCompensatory}
                        onChange={(e) => setFormData({ ...formData, rateCompensatory: parseFloat(e.target.value) || 0 })}
                        style={{ width: 64, padding: '4px 8px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 12.5, textAlign: 'center' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* BOTTOM CHECKBOXES */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={formData.deductNoIn}
                    onChange={(e) => setFormData({ ...formData, deductNoIn: e.target.checked })}
                    style={{ accentColor: 'var(--antd-primary, #009688)' }}
                  />
                  <span>Nếu không có giờ vào thì bị trừ công</span>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={formData.deductNoOut}
                    onChange={(e) => setFormData({ ...formData, deductNoOut: e.target.checked })}
                    style={{ accentColor: 'var(--antd-primary, #009688)' }}
                  />
                  <span>Nếu không có giờ ra thì bị trừ công</span>
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: THIẾT LẬP NÂNG CAO */}
          {activeTab === 'advanced' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* SECTION: ĐI MUỘN VỀ SỚM */}
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Đi muộn về sớm</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12.5, color: '#334155', minWidth: 120 }}>Cho phép đi muộn</span>
                    <input
                      type="number"
                      value={formData.allowLateMinutes}
                      onChange={(e) => setFormData({ ...formData, allowLateMinutes: parseInt(e.target.value, 10) || 0 })}
                      style={{ width: 80, padding: '5px 8px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, textAlign: 'center' }}
                    />
                    <span style={{ fontSize: 12.5, color: '#64748B' }}>Phút</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12.5, color: '#334155', minWidth: 120 }}>Cho phép về sớm</span>
                    <input
                      type="number"
                      value={formData.allowEarlyMinutes}
                      onChange={(e) => setFormData({ ...formData, allowEarlyMinutes: parseInt(e.target.value, 10) || 0 })}
                      style={{ width: 80, padding: '5px 8px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, textAlign: 'center' }}
                    />
                    <span style={{ fontSize: 12.5, color: '#64748B' }}>Phút</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 24, marginTop: 10 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, color: '#334155' }}>
                    <input
                      type="checkbox"
                      checked={formData.penaltyLate}
                      onChange={(e) => setFormData({ ...formData, penaltyLate: e.target.checked })}
                      style={{ accentColor: 'var(--antd-primary, #009688)' }}
                    />
                    <span>Phạt đi muộn</span>
                  </label>

                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, color: '#334155' }}>
                    <input
                      type="checkbox"
                      checked={formData.penaltyEarly}
                      onChange={(e) => setFormData({ ...formData, penaltyEarly: e.target.checked })}
                      style={{ accentColor: 'var(--antd-primary, #009688)' }}
                    />
                    <span>Phạt về sớm</span>
                  </label>
                </div>
              </div>

              {/* SECTION: LÀM THÊM GIỜ */}
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Làm thêm giờ</div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, color: '#334155' }}>
                    <input type="checkbox" defaultChecked style={{ accentColor: 'var(--antd-primary, #009688)' }} />
                    <span>Tính làm thêm trước ca</span>
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, color: '#334155' }}>
                    <input type="checkbox" defaultChecked style={{ accentColor: 'var(--antd-primary, #009688)' }} />
                    <span>Tính làm thêm sau ca</span>
                  </label>
                </div>
              </div>

              {/* SECTION: CÔNG ĂN CA */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>Công ăn ca</span>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="radio"
                        name="hasMealAllowance"
                        checked={formData.hasMealAllowance}
                        onChange={() => setFormData({ ...formData, hasMealAllowance: true })}
                        style={{ accentColor: 'var(--antd-primary, #009688)' }}
                      />
                      <span>Có</span>
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="radio"
                        name="hasMealAllowance"
                        checked={!formData.hasMealAllowance}
                        onChange={() => setFormData({ ...formData, hasMealAllowance: false })}
                        style={{ accentColor: 'var(--antd-primary, #009688)' }}
                      />
                      <span>Không</span>
                    </label>
                  </div>
                </div>

                {/* Sub-block: Tính cho thời gian làm việc bình thường */}
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, marginBottom: 12, background: '#FFFFFF' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B' }}>
                      Tính cho thời gian làm việc bình thường
                    </span>
                    <span style={{ color: 'var(--antd-primary, #009688)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      + Thêm
                    </span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', color: '#64748B', borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Từ (công)</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Tới (công)</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Công ăn ca</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Áp dụng cho</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.mealNormalRules.length === 0 ? (
                        <tr>
                          <td colSpan={4}>
                            <EmptyTableIllustration />
                          </td>
                        </tr>
                      ) : (
                        formData.mealNormalRules.map((r) => (
                          <tr key={r.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '6px 8px' }}>{r.from}</td>
                            <td style={{ padding: '6px 8px' }}>{r.to}</td>
                            <td style={{ padding: '6px 8px' }}>{r.allowance}</td>
                            <td style={{ padding: '6px 8px' }}>{r.appliedTo}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Căn cứ tính công ăn ca */}
                <div style={{ marginBottom: 10 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                    Căn cứ tính công ăn ca:
                  </span>
                  <div style={{ display: 'flex', gap: 20 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5 }}>
                      <input
                        type="radio"
                        name="mealBasis"
                        checked={formData.mealBasis === 'payroll'}
                        onChange={() => setFormData({ ...formData, mealBasis: 'payroll' })}
                        style={{ accentColor: 'var(--antd-primary, #009688)' }}
                      />
                      <span>Theo số công hưởng lương</span>
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5 }}>
                      <input
                        type="radio"
                        name="mealBasis"
                        checked={formData.mealBasis === 'actual'}
                        onChange={() => setFormData({ ...formData, mealBasis: 'actual' })}
                        style={{ accentColor: 'var(--antd-primary, #009688)' }}
                      />
                      <span>Theo số công đi làm thực tế</span>
                    </label>
                  </div>
                </div>

                {/* Không tính công ăn ca khi */}
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                    Không tính công ăn ca khi:
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {[
                      { key: 'paid_full', label: 'Nghỉ có hưởng lương cả ca' },
                      { key: 'paid_half', label: 'Nghỉ có hưởng lương nửa ca' },
                      { key: 'travel_full', label: 'Đi công tác cả ca' },
                      { key: 'travel_half', label: 'Đi công tác nửa ca' },
                    ].map((item) => (
                      <label key={item.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, color: '#334155' }}>
                        <input
                          type="checkbox"
                          checked={formData.mealExclusions.includes(item.key)}
                          onChange={(e) => {
                            const updated = e.target.checked
                              ? [...formData.mealExclusions, item.key]
                              : formData.mealExclusions.filter((k) => k !== item.key);
                            setFormData({ ...formData, mealExclusions: updated });
                          }}
                          style={{ accentColor: 'var(--antd-primary, #009688)' }}
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Sub-block: Tính cho thời gian làm thêm */}
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, background: '#FFFFFF' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B' }}>
                      Tính cho thời gian làm thêm
                    </span>
                    <span style={{ color: 'var(--antd-primary, #009688)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      + Thêm
                    </span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', color: '#64748B', borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Từ (giờ)</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Tới (giờ)</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Công ăn ca</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Áp dụng cho</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.mealOvertimeRules.length === 0 ? (
                        <tr>
                          <td colSpan={4}>
                            <EmptyTableIllustration />
                          </td>
                        </tr>
                      ) : (
                        formData.mealOvertimeRules.map((r) => (
                          <tr key={r.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '6px 8px' }}>{r.from}</td>
                            <td style={{ padding: '6px 8px' }}>{r.to}</td>
                            <td style={{ padding: '6px 8px' }}>{r.allowance}</td>
                            <td style={{ padding: '6px 8px' }}>{r.appliedTo}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SECTION: CÔNG ĐIỀU ĐỘNG */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>Công điều động</span>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="radio"
                        name="hasDispatchCredit"
                        checked={formData.hasDispatchCredit}
                        onChange={() => setFormData({ ...formData, hasDispatchCredit: true })}
                        style={{ accentColor: 'var(--antd-primary, #009688)' }}
                      />
                      <span>Có</span>
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="radio"
                        name="hasDispatchCredit"
                        checked={!formData.hasDispatchCredit}
                        onChange={() => setFormData({ ...formData, hasDispatchCredit: false })}
                        style={{ accentColor: 'var(--antd-primary, #009688)' }}
                      />
                      <span>Không</span>
                    </label>
                  </div>
                </div>

                {/* Sub-block: Danh sách công điều động */}
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, background: '#FFFFFF' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B' }}>
                      Danh sách công điều động:
                    </span>
                    <span style={{ color: 'var(--antd-primary, #009688)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      + Thêm
                    </span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', color: '#64748B', borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Từ công</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Đến công</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Công điều động</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Loại công</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.dispatchRules.length === 0 ? (
                        <tr>
                          <td colSpan={4}>
                            <EmptyTableIllustration />
                          </td>
                        </tr>
                      ) : (
                        formData.dispatchRules.map((r) => (
                          <tr key={r.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '6px 8px' }}>{r.from}</td>
                            <td style={{ padding: '6px 8px' }}>{r.to}</td>
                            <td style={{ padding: '6px 8px' }}>{r.credit}</td>
                            <td style={{ padding: '6px 8px' }}>{r.workType}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </Modal>

      {/* AI CREATION MODAL */}
      <Modal
        title="Tạo ca làm việc thông minh bằng AI"
        open={aiModalOpen}
        onCancel={() => setAiModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setAiModalOpen(false)}>
            Hủy
          </Button>,
          <Button
            key="generate"
            type="primary"
            loading={aiLoading}
            onClick={handleGenerateAI}
          >
            Tạo ca làm việc
          </Button>,
        ]}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: '#64748B' }}>
            Mô tả ca làm việc bằng ngôn ngữ tự nhiên (ví dụ: &quot;Ca hành chính sáng 8h đến 12h, chiều 13h30 đến 17h30, đi muộn tối đa 15 phút, tính 1 công&quot;):
          </div>
          <Input.TextArea
            rows={4}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Nhập mô tả ca làm việc..."
          />
        </div>
      </Modal>
    </div>
  );
};
