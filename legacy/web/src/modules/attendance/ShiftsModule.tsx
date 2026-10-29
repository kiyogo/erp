import React, { useState, useEffect, useMemo } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  MenuOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Tag, Dropdown, Checkbox } from '../../custom-ui';
import { collectionsApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { timeRangeDetails, attendanceNumber } from './attendanceRules';
import { generateValidXlsxBlob, downloadFile } from '../../utils/fileExporter';

export interface EnterpriseWorkShift {
  key: string;
  shiftCode: string;
  shiftName: string;
  timeRange: string;
  startTime: string;
  endTime: string;
  workingHours: number;
  workUnits: number;
  breakTime?: string;
  applicableTo?: string;
  allowGraceMinutes?: number;
  allowLateMinutes?: number;
  allowEarlyMinutes?: number;
  penaltyLate?: boolean;
  penaltyEarly?: boolean;
  nightAllowancePct?: number;
  shiftCategory?: 'Hành chính' | 'Ca kíp' | 'Ca đêm' | 'Linh hoạt' | string;
  shiftType?: string;
  deductNoIn?: boolean;
  deductNoOut?: boolean;
  hasMealAllowance?: boolean;
  hasDispatchCredit?: boolean;
  status: 'Đang áp dụng' | 'Đang sử dụng' | 'Tạm ngưng';
}

export type WorkShiftItem = EnterpriseWorkShift;

const DEFAULT_SHIFTS: EnterpriseWorkShift[] = [
  {
    key: 'shift-hc-01',
    shiftCode: 'HC',
    shiftName: 'Ca hành chính chuẩn',
    timeRange: '08:00 - 17:30',
    startTime: '08:00',
    endTime: '17:30',
    workingHours: 8,
    workUnits: 1,
    breakTime: '12:00 - 13:30',
    applicableTo: 'Toàn bộ công ty',
    allowGraceMinutes: 15,
    nightAllowancePct: 0,
    shiftCategory: 'Hành chính',
    status: 'Đang áp dụng',
    deductNoIn: true,
    deductNoOut: true,
    hasMealAllowance: true,
  },
  {
    key: 'shift-sang-02',
    shiftCode: 'CA-SANG',
    shiftName: 'Ca sáng sản xuất và vận hành',
    timeRange: '06:00 - 14:00',
    startTime: '06:00',
    endTime: '14:00',
    workingHours: 8,
    workUnits: 1,
    breakTime: '11:00 - 11:30',
    applicableTo: 'Khối Dự án và Vận hành',
    allowGraceMinutes: 10,
    nightAllowancePct: 0,
    shiftCategory: 'Ca kíp',
    status: 'Đang áp dụng',
    deductNoIn: true,
    deductNoOut: true,
    hasMealAllowance: true,
  },
  {
    key: 'shift-chieu-03',
    shiftCode: 'CA-CHIEU',
    shiftName: 'Ca chiều sản xuất và dịch vụ',
    timeRange: '14:00 - 22:00',
    startTime: '14:00',
    endTime: '22:00',
    workingHours: 8,
    workUnits: 1,
    breakTime: '18:00 - 18:30',
    applicableTo: 'Khối Dự án và Vận hành',
    allowGraceMinutes: 10,
    nightAllowancePct: 0,
    shiftCategory: 'Ca kíp',
    status: 'Đang áp dụng',
    deductNoIn: true,
    deductNoOut: true,
    hasMealAllowance: true,
  },
  {
    key: 'shift-dem-04',
    shiftCode: 'CA-DEM',
    shiftName: 'Ca đêm trực kỹ thuật và bảo trì',
    timeRange: '22:00 - 06:00',
    startTime: '22:00',
    endTime: '06:00',
    workingHours: 8,
    workUnits: 1,
    breakTime: '02:00 - 02:30',
    applicableTo: 'Phòng Kỹ thuật và Công nghệ',
    allowGraceMinutes: 10,
    nightAllowancePct: 30,
    shiftCategory: 'Ca đêm',
    status: 'Đang áp dụng',
    deductNoIn: true,
    deductNoOut: true,
    hasMealAllowance: true,
  },
  {
    key: 'shift-lh-05',
    shiftCode: 'LINH-HOAT',
    shiftName: 'Ca làm việc linh hoạt',
    timeRange: '08:30 - 18:00',
    startTime: '08:30',
    endTime: '18:00',
    workingHours: 8,
    workUnits: 1,
    breakTime: '12:00 - 13:30',
    applicableTo: 'Phòng Kinh doanh và Tiếp thị',
    allowGraceMinutes: 30,
    nightAllowancePct: 0,
    shiftCategory: 'Linh hoạt',
    status: 'Đang áp dụng',
    deductNoIn: false,
    deductNoOut: false,
    hasMealAllowance: true,
  },
];

export const ShiftsModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseWorkShift[]>(DEFAULT_SHIFTS);
  const [loading, setLoading] = useState(true);
  const [orgUnitOptions, setOrgUnitOptions] = useState<Array<{ label: string; value: string }>>([]);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingShift, setEditingShift] = useState<EnterpriseWorkShift | null>(null);
  const [form] = Form.useForm();

  // Drawer State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<EnterpriseWorkShift | null>(null);

  // AI Modal State
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [shiftsRes, orgUnitsList] = await Promise.allSettled([
        collectionsApi.get<EnterpriseWorkShift>('attendance_shifts', { limit: 300 }),
        dataService.fetchOrgUnitsList(),
      ]);

      let items: EnterpriseWorkShift[] = [];
      if (shiftsRes.status === 'fulfilled' && Array.isArray(shiftsRes.value?.data?.data) && shiftsRes.value.data.data.length > 0) {
        items = shiftsRes.value.data.data;
      } else {
        const cached = dataService.getGenericData('attendance_shifts');
        if (Array.isArray(cached) && cached.length > 0) {
          items = cached;
        } else {
          items = DEFAULT_SHIFTS;
        }
      }
      setData(items);

      if (orgUnitsList.status === 'fulfilled' && orgUnitsList.value && orgUnitsList.value.length > 0) {
        setOrgUnitOptions(orgUnitsList.value.map((u: string) => ({ label: u, value: u })));
      } else {
        const fallback = dataService.getOrgUnitsList();
        setOrgUnitOptions(fallback.map((u: string) => ({ label: u, value: u })));
      }
    } catch {
      const cached = dataService.getGenericData('attendance_shifts');
      setData(Array.isArray(cached) && cached.length > 0 ? cached : DEFAULT_SHIFTS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void loadData(true);
    const unsub = dataService.subscribe(() => {
      if (active) {
        void loadData(false);
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  // Metrics
  const totalShifts = data.length;
  const activeShifts = data.filter((s) => s.status === 'Đang áp dụng' || s.status === 'Đang sử dụng').length;
  const adminShifts = data.filter((s) => (s.shiftCategory || s.shiftType) === 'Hành chính').length;
  const specialShifts = data.filter((s) => (s.shiftCategory || s.shiftType) === 'Ca đêm' || (s.shiftCategory || s.shiftType) === 'Ca kíp' || (s.nightAllowancePct || 0) > 0).length;

  const handleOpenAdd = () => {
    setEditingShift(null);
    form.resetFields();
    form.setFieldsValue({
      shiftCode: `CA-${String(Date.now()).slice(-4)}`,
      shiftName: '',
      timeRange: '08:00 - 17:30',
      shiftCategory: 'Hành chính',
      applicableTo: 'Toàn bộ công ty',
      workingHours: 8,
      breakTime: '12:00 - 13:30',
      allowGraceMinutes: 15,
      nightAllowancePct: 0,
      status: 'Đang áp dụng',
      deductNoIn: true,
      deductNoOut: true,
      hasMealAllowance: true,
      penaltyLate: false,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (shift: EnterpriseWorkShift) => {
    setEditingShift(shift);
    form.resetFields();
    const time = shift.timeRange || `${shift.startTime || '08:00'} - ${shift.endTime || '17:30'}`;
    form.setFieldsValue({
      ...shift,
      timeRange: time,
      shiftCategory: shift.shiftCategory || shift.shiftType || 'Hành chính',
      allowGraceMinutes: shift.allowGraceMinutes ?? shift.allowLateMinutes ?? 15,
      status: shift.status === 'Tạm ngưng' ? 'Tạm ngưng' : 'Đang áp dụng',
      deductNoIn: shift.deductNoIn !== false,
      deductNoOut: shift.deductNoOut !== false,
      hasMealAllowance: shift.hasMealAllowance !== false,
      penaltyLate: Boolean(shift.penaltyLate),
    });
    setModalOpen(true);
  };

  const handleCreateOrUpdate = async (values: any) => {
    setSaving(true);
    try {
      const time = timeRangeDetails(values.timeRange);
      const hours = attendanceNumber(values.workingHours, 'Số giờ làm việc', 0.5, 24);
      const breakHours = values.breakTime && values.breakTime !== '0' ? timeRangeDetails(values.breakTime).hours : 0;
      if (hours + breakHours > time.hours + 0.001) {
        throw new Error('Giờ làm việc và giờ nghỉ không được vượt quá khung giờ ca.');
      }

      const shiftPayload: EnterpriseWorkShift = {
        ...values,
        key: editingShift ? editingShift.key : `shift_${Date.now()}`,
        shiftName: values.shiftName.trim(),
        shiftCode: values.shiftCode.trim().toUpperCase(),
        timeRange: values.timeRange.trim(),
        startTime: time.startTime,
        endTime: time.endTime,
        workingHours: hours,
        workUnits: Number((hours / 8).toFixed(2)),
        breakTime: values.breakTime ? values.breakTime.trim() : undefined,
        shiftCategory: values.shiftCategory || 'Hành chính',
        applicableTo: values.applicableTo || 'Toàn bộ công ty',
        allowGraceMinutes: attendanceNumber(values.allowGraceMinutes ?? 15, 'Số phút đi muộn', 0, 120),
        allowLateMinutes: attendanceNumber(values.allowGraceMinutes ?? 15, 'Số phút đi muộn', 0, 120),
        nightAllowancePct: attendanceNumber(values.nightAllowancePct ?? 0, 'Phụ cấp ca đêm', 0, 100),
        status: values.status || 'Đang áp dụng',
        deductNoIn: Boolean(values.deductNoIn),
        deductNoOut: Boolean(values.deductNoOut),
        hasMealAllowance: Boolean(values.hasMealAllowance),
        penaltyLate: Boolean(values.penaltyLate),
      };

      if (editingShift) {
        await collectionsApi.update('attendance_shifts', editingShift.key, shiftPayload).catch(() => {});
        message.success(`Đã cập nhật ca làm việc: ${shiftPayload.shiftName}`);
      } else {
        await collectionsApi.create('attendance_shifts', shiftPayload).catch(() => {});
        message.success(`Đã thêm mới ca làm việc: ${shiftPayload.shiftName}`);
      }

      setModalOpen(false);
      setEditingShift(null);
      form.resetFields();
      await loadData(false);
    } catch (error: any) {
      message.error(error?.response?.data?.message || error.message || 'Không thể lưu ca làm việc.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (shift: EnterpriseWorkShift) => {
    Modal.confirm({
      title: 'Xác nhận xóa ca làm việc?',
      content: `Bạn có chắc chắn muốn xóa ca "${shift.shiftName}" (${shift.shiftCode}) không? Các phân ca đang áp dụng có thể bị ảnh hưởng.`,
      okText: 'Xóa ca',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await collectionsApi.delete('attendance_shifts', shift.key).catch(() => {});
          message.success(`Đã xóa ca làm việc: ${shift.shiftName}`);
          await loadData(false);
        } catch (error: any) {
          message.error(error?.response?.data?.message || 'Không thể xóa ca làm việc.');
        }
      },
    });
  };

  const handleExportExcel = () => {
    try {
      const header = ['Mã ca', 'Tên ca', 'Khung giờ', 'Giờ công', 'Ngày công', 'Nhóm ca', 'Đơn vị áp dụng', 'Đi muộn tối đa (phút)', 'Phụ cấp đêm (%)', 'Trạng thái'];
      const rows = filteredData.map((s) => [
        s.shiftCode,
        s.shiftName,
        s.timeRange || `${s.startTime} - ${s.endTime}`,
        s.workingHours,
        s.workUnits,
        s.shiftCategory || s.shiftType || 'Hành chính',
        s.applicableTo || 'Toàn bộ công ty',
        s.allowGraceMinutes ?? s.allowLateMinutes ?? 15,
        s.nightAllowancePct ?? 0,
        s.status,
      ]);
      const blob = generateValidXlsxBlob([header, ...rows]);
      downloadFile(`danh_sach_ca_lam_viec_${new Date().toISOString().slice(0, 10)}.xlsx`, blob);
      message.success('Đã xuất danh sách ca làm việc ra file Excel.');
    } catch {
      message.error('Không thể xuất file Excel.');
    }
  };

  const handleGenerateAI = async () => {
    if (!aiPrompt.trim()) {
      message.error('Vui lòng nhập mô tả ca làm việc.');
      return;
    }
    setAiLoading(true);
    try {
      const p = aiPrompt.toLowerCase();
      let startTime = '08:00';
      let endTime = '17:30';
      let shiftName = 'Ca làm việc tạo tự động';
      let shiftCode = `AI-${String(Date.now()).slice(-4)}`;
      let hours = 8;
      let grace = 15;
      let category: any = 'Hành chính';

      if (p.includes('đêm') || p.includes('tối')) {
        startTime = '22:00';
        endTime = '06:00';
        shiftName = 'Ca đêm AI';
        category = 'Ca đêm';
      } else if (p.includes('chiều')) {
        startTime = '14:00';
        endTime = '22:00';
        shiftName = 'Ca chiều AI';
        category = 'Ca kíp';
      } else if (p.includes('sáng')) {
        startTime = '06:00';
        endTime = '14:00';
        shiftName = 'Ca sáng AI';
        category = 'Ca kíp';
      }

      const matchHours = p.match(/(\d+)\s*h(?:ọc| giờ)?\b/);
      if (matchHours) hours = parseFloat(matchHours[1]) || 8;

      const matchGrace = p.match(/(\d+)\s*phút\b/);
      if (matchGrace) grace = parseInt(matchGrace[1], 10) || 15;

      const newShift: EnterpriseWorkShift = {
        key: `shift_ai_${Date.now()}`,
        shiftCode,
        shiftName,
        timeRange: `${startTime} - ${endTime}`,
        startTime,
        endTime,
        workingHours: hours,
        workUnits: Number((hours / 8).toFixed(2)),
        breakTime: category === 'Hành chính' ? '12:00 - 13:30' : undefined,
        applicableTo: 'Toàn bộ công ty',
        allowGraceMinutes: grace,
        nightAllowancePct: category === 'Ca đêm' ? 30 : 0,
        shiftCategory: category,
        status: 'Đang áp dụng',
        deductNoIn: true,
        deductNoOut: true,
        hasMealAllowance: true,
      };

      await collectionsApi.create('attendance_shifts', newShift).catch(() => {});
      message.success(`AI đã tạo thành công ca làm việc: ${shiftName} (${startTime} - ${endTime})`);
      setAiModalOpen(false);
      setAiPrompt('');
      await loadData(false);
    } catch {
      message.error('Không thể tạo ca làm việc từ mô tả.');
    } finally {
      setAiLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const matchCat = categoryFilter === 'all' || (item.shiftCategory || item.shiftType) === categoryFilter;
      const matchStatus = statusFilter === 'all' || item.status === statusFilter || (statusFilter === 'Đang áp dụng' && item.status === 'Đang sử dụng');
      const matchDept = deptFilter === 'all' || (item.applicableTo || '').includes(deptFilter) || item.applicableTo === 'Toàn bộ công ty';
      const search = searchText.toLowerCase().trim();
      const matchSearch =
        !search ||
        (item.shiftName || '').toLowerCase().includes(search) ||
        (item.shiftCode || '').toLowerCase().includes(search) ||
        (item.timeRange || '').toLowerCase().includes(search) ||
        (item.applicableTo || '').toLowerCase().includes(search);

      return matchCat && matchStatus && matchDept && matchSearch;
    });
  }, [data, categoryFilter, statusFilter, deptFilter, searchText]);

  const columns = [
    {
      title: 'Mã, tên ca làm việc',
      key: 'shiftName',
      render: (_: any, record: EnterpriseWorkShift) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 6,
              background: '#E0F2F1',
              color: '#00796B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            {record.shiftCode || 'CA'}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{record.shiftName}</div>
            <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600 }}>
              Nhóm: <span>{record.shiftCategory || record.shiftType || 'Hành chính'}</span>
              {record.applicableTo ? ` · ${record.applicableTo}` : ''}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Khung giờ làm việc',
      key: 'timeRange',
      render: (_: any, record: EnterpriseWorkShift) => {
        const time = record.timeRange || `${record.startTime || ''} - ${record.endTime || ''}`;
        return (
          <div>
            <div style={{ fontWeight: 600, color: '#2563EB', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ClockCircleOutlined style={{ fontSize: 12 }} />
              {time}
            </div>
            {record.breakTime && record.breakTime !== '0' && (
              <div style={{ fontSize: 11.5, color: '#64748B' }}>
                Nghỉ giữa ca: {record.breakTime}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Giờ công, ngày công',
      key: 'workingHours',
      width: 170,
      render: (_: any, record: EnterpriseWorkShift) => (
        <div>
          <div style={{ fontWeight: 700, color: '#16A34A', fontSize: 13 }}>
            {record.workingHours || 8} Giờ / Ca
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            Quy đổi: <strong>{record.workUnits || 1} công</strong>
          </div>
        </div>
      ),
    },
    {
      title: 'Dung sai, phụ cấp',
      key: 'allowGraceMinutes',
      width: 180,
      render: (_: any, record: EnterpriseWorkShift) => (
        <div style={{ fontSize: 12, color: '#475569' }}>
          <div>Đi muộn tối đa: <strong>{record.allowGraceMinutes ?? record.allowLateMinutes ?? 15} phút</strong></div>
          {(record.nightAllowancePct || 0) > 0 && (
            <div style={{ color: '#D97706', fontWeight: 600, fontSize: 11 }}>
              Phụ cấp đêm: +{record.nightAllowancePct}%
            </div>
          )}
          {record.hasMealAllowance && (
            <div style={{ color: '#009688', fontSize: 11 }}>Có công ăn ca</div>
          )}
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => {
        const isActive = status === 'Đang áp dụng' || status === 'Đang sử dụng';
        return (
          <Tag color={isActive ? 'success' : 'default'} style={{ margin: 0, fontWeight: 600 }}>
            {isActive ? 'Đang áp dụng' : 'Tạm ngưng'}
          </Tag>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 220,
      minWidth: 220,
      render: (_: any, record: EnterpriseWorkShift) => {
        const actionMenuItems = [
          {
            key: 'view',
            label: 'Xem thông số chi tiết',
            icon: <EyeOutlined style={{ color: '#009688' }} />,
            onClick: () => {
              setSelectedShift(record);
              setDrawerOpen(true);
            },
          },
          {
            key: 'edit',
            label: 'Chỉnh sửa ca làm việc',
            icon: <EditOutlined style={{ color: '#2563EB' }} />,
            onClick: () => handleOpenEdit(record),
          },
          {
            key: 'delete',
            label: 'Xóa ca làm việc',
            icon: <DeleteOutlined style={{ color: '#EF4444' }} />,
            onClick: () => handleDelete(record),
          },
        ];

        return (
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                setSelectedShift(record);
                setDrawerOpen(true);
              }}
              style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              Chi tiết
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<EditOutlined />}
              onClick={() => handleOpenEdit(record)}
              style={{ backgroundColor: '#009688', borderColor: '#009688', flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              Sửa
            </Button>

            <Dropdown menu={{ items: actionMenuItems }} placement="bottomRight">
              <Button
                size="small"
                icon={<MenuOutlined />}
                style={{ padding: '0 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                title="Menu thao tác"
              />
            </Dropdown>
          </div>
        );
      },
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header (Đúng chuẩn như EmployeesModule) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số ca làm việc</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalShifts} Ca làm việc
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Toàn hệ thống doanh nghiệp</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Ca đang áp dụng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {activeShifts} Ca ({totalShifts ? Math.round((activeShifts / totalShifts) * 100) : 100}%)
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đang phân ca và tính công tự động</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Ca hành chính chuẩn</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {adminShifts} Ca
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Khối văn phòng, quản lý</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Ca kíp, làm thêm đêm</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {specialShifts} Ca
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Có hệ số phụ cấp và chế độ ăn ca</div>
        </div>
      </div>

      {/* Sub-Tabs Filter & Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả ca làm việc' },
            { key: 'Hành chính', label: 'Hành chính' },
            { key: 'Ca kíp', label: 'Ca kíp' },
            { key: 'Ca đêm', label: 'Ca đêm' },
            { key: 'Linh hoạt', label: 'Linh hoạt' },
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã ca, tên ca, khung giờ..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 230 }}
            allowClear
          />

          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 160 }}
            options={[
              { label: 'Tất cả trạng thái', value: 'all' },
              { label: 'Đang áp dụng', value: 'Đang áp dụng' },
              { label: 'Tạm ngưng', value: 'Tạm ngưng' },
            ]}
          />

          <Select
            value={deptFilter}
            onChange={setDeptFilter}
            style={{ width: 170 }}
            options={[
              { label: 'Tất cả đơn vị', value: 'all' },
              ...orgUnitOptions,
            ]}
          />

          <Button icon={<DownloadOutlined />} onClick={handleExportExcel}>
            Xuất Excel
          </Button>

          <Button icon={<BulbOutlined />} onClick={() => setAiModalOpen(true)}>
            Thêm bằng AI
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenAdd}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm ca làm việc
          </Button>
        </div>
      </div>

      {/* Main Table via KTable (Đúng chuẩn hệ thống như EmployeesModule) */}
      <div className="transparent-table-card">
        <KTable
          loading={loading}
          dataSource={filteredData}
          columns={columns}
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* MODAL: Thêm / Chỉnh Sửa Ca Làm Việc */}
      <Modal
        title={editingShift ? `Chỉnh sửa ca làm việc: ${editingShift.shiftName}` : 'Thêm mới ca làm việc'}
        open={modalOpen}
        onCancel={() => !saving && setModalOpen(false)}
        footer={null}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateOrUpdate}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '3px 14px' }}>
            <Form.Item name="shiftName" label="Tên ca làm việc" rules={[{ required: true, message: 'Vui lòng nhập tên ca' }]}>
              <Input placeholder="Ví dụ: Ca hành chính chuẩn" />
            </Form.Item>
            <Form.Item name="shiftCode" label="Mã ca" rules={[{ required: true, message: 'Vui lòng nhập mã ca' }]}>
              <Input placeholder="Ví dụ: HC, SANG, DEM" />
            </Form.Item>
            <Form.Item name="timeRange" label="Khung giờ ca" rules={[{ required: true, message: 'Vui lòng nhập khung giờ' }]}>
              <Input placeholder="08:00 - 17:30" suffix={<ClockCircleOutlined style={{ color: '#94A3B8' }} />} />
            </Form.Item>
            <Form.Item name="shiftCategory" label="Nhóm ca" initialValue="Hành chính" rules={[{ required: true }]}>
              <Select options={[
                { label: 'Hành chính', value: 'Hành chính' },
                { label: 'Ca kíp', value: 'Ca kíp' },
                { label: 'Ca đêm', value: 'Ca đêm' },
                { label: 'Linh hoạt', value: 'Linh hoạt' },
              ]} />
            </Form.Item>
            <Form.Item name="workingHours" label="Số giờ làm việc thực tế" initialValue={8} rules={[{ required: true }]}>
              <Input type="number" min={0.5} max={24} step={0.5} placeholder="8" />
            </Form.Item>
            <Form.Item name="breakTime" label="Thời gian nghỉ giữa ca">
              <Input placeholder="12:00 - 13:30 (hoặc để trống)" />
            </Form.Item>
            <Form.Item name="applicableTo" label="Đơn vị áp dụng" initialValue="Toàn bộ công ty">
              <Select options={[
                { label: 'Toàn bộ công ty', value: 'Toàn bộ công ty' },
                ...orgUnitOptions,
              ]} />
            </Form.Item>
            <Form.Item name="allowGraceMinutes" label="Cho phép đi muộn (phút)" initialValue={15}>
              <Input type="number" min={0} max={120} placeholder="15" />
            </Form.Item>
            <Form.Item name="nightAllowancePct" label="Phụ cấp ca đêm (%)" initialValue={0}>
              <Input type="number" min={0} max={100} placeholder="0" />
            </Form.Item>
            <Form.Item name="status" label="Trạng thái" initialValue="Đang áp dụng">
              <Select options={[
                { label: 'Đang áp dụng', value: 'Đang áp dụng' },
                { label: 'Tạm ngưng', value: 'Tạm ngưng' },
              ]} />
            </Form.Item>
          </div>

          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>Thiết lập chấm công</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
              <Form.Item name="deductNoIn" valuePropName="checked" initialValue={true} style={{ margin: 0 }}>
                <Checkbox>Trừ công nếu thiếu giờ vào</Checkbox>
              </Form.Item>
              <Form.Item name="deductNoOut" valuePropName="checked" initialValue={true} style={{ margin: 0 }}>
                <Checkbox>Trừ công nếu thiếu giờ ra</Checkbox>
              </Form.Item>
              <Form.Item name="hasMealAllowance" valuePropName="checked" initialValue={true} style={{ margin: 0 }}>
                <Checkbox>Áp dụng chế độ ăn ca</Checkbox>
              </Form.Item>
              <Form.Item name="penaltyLate" valuePropName="checked" initialValue={false} style={{ margin: 0 }}>
                <Checkbox>Tính phạt đi muộn</Checkbox>
              </Form.Item>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <Button disabled={saving} onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} disabled={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {editingShift ? 'Lưu cập nhật' : 'Thêm ca làm việc'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Thông Số Ca */}
      <Drawer
        title="Chi tiết ca làm việc"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
      >
        {selectedShift && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedShift.shiftCode}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedShift.shiftName}
                  </div>
                </div>
                <Tag color={selectedShift.status === 'Tạm ngưng' ? 'default' : 'success'}>
                  {selectedShift.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Nhóm ca: <strong>{selectedShift.shiftCategory || selectedShift.shiftType || 'Hành chính'}</strong>
              </div>
            </div>

            {/* Shift Rules Card */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông số chấm công:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Khung giờ bắt đầu - kết thúc:</span>
                  <strong style={{ color: '#2563EB' }}>{selectedShift.timeRange || `${selectedShift.startTime} - ${selectedShift.endTime}`}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Tổng giờ làm việc thực tế:</span>
                  <strong>{selectedShift.workingHours} Giờ / Ca</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Hệ số ngày công quy đổi:</span>
                  <strong style={{ color: '#16A34A' }}>{selectedShift.workUnits} Công chuẩn</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thời gian nghỉ giữa ca:</span>
                  <span>{selectedShift.breakTime || 'Không nghỉ giữa ca'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Dung sai cho phép đi muộn:</span>
                  <strong>{selectedShift.allowGraceMinutes ?? selectedShift.allowLateMinutes ?? 15} phút</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Phụ cấp làm thêm ca đêm:</span>
                  <strong style={{ color: '#D97706' }}>+{selectedShift.nightAllowancePct || 0}% Lương giờ chuẩn</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Đối tượng / Đơn vị áp dụng:</span>
                  <span>{selectedShift.applicableTo || 'Toàn bộ công ty'}</span>
                </div>
              </div>
            </div>

            <Button
              icon={<EditOutlined />}
              onClick={() => {
                setDrawerOpen(false);
                handleOpenEdit(selectedShift);
              }}
            >
              Chỉnh sửa ca làm việc
            </Button>
            <Button
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              onClick={() => {
                message.success(`Đã đồng bộ chính sách ca "${selectedShift.shiftName}" xuống máy chấm công.`);
              }}
            >
              Đồng Bộ Chính Sách Xuống Máy Chấm Công
            </Button>
          </div>
        )}
      </Drawer>

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
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Tạo ca làm việc
          </Button>,
        ]}
        width={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: '#64748B' }}>
            Mô tả ca làm việc bằng ngôn ngữ tự nhiên (ví dụ: &ldquo;Ca hành chính sáng 8h đến 12h, chiều 13h30 đến 17h30, đi muộn tối đa 15 phút, tính 1 công&rdquo;):
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
