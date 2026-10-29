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
  CalendarOutlined,
  ApartmentOutlined,
  CheckCircleOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import {
  Modal,
  Drawer,
  Form,
  Input,
  Select,
  Button,
  message,
  Tag,
  Dropdown,
  Checkbox,
  Radio,
  RadioGroup,
} from '../../custom-ui';
import { collectionsApi, EnterpriseEmployee } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { generateValidXlsxBlob, downloadFile } from '../../utils/fileExporter';

export interface EnterpriseShiftPlan {
  key: string;
  code: string;
  name: string;
  orgUnit: string;
  shiftKey: string;
  shiftName: string;
  shiftCode: string;
  workHours: string;
  startDate: string;
  endDate: string;
  repeatType: 'Tuần' | 'Tháng' | 'Ngày';
  repeatCycle: number;
  daysOfWeek: number[]; // 2: Thứ 2, 3: Thứ 3, ..., 7: Thứ 7, 8: CN
  targetType: 'all_unit' | 'employees' | 'departments';
  selectedEmployees?: string[];
  selectedDepartments?: string[];
  skipPreview?: boolean;
  status: 'Đang áp dụng' | 'Tạm ngưng' | 'Hết hiệu lực';
  assignedCount: number;
  createdAt?: string;
}

const DEFAULT_COMPANY = 'CÔNG TY TNHH XÂY DỰNG KINH SỞ'.normalize('NFC');

const DEFAULT_SHIFTS_FALLBACK = [
  { key: 'shift-sang', shiftCode: 'CA-SANG', shiftName: 'Ca sáng sản xuất và vận hành', timeRange: '06:00 - 14:00' },
  { key: 'shift-hc', shiftCode: 'HC', shiftName: 'Ca hành chính chuẩn', timeRange: '08:00 - 17:30' },
  { key: 'shift-chieu', shiftCode: 'CA-CHIEU', shiftName: 'Ca chiều sản xuất và dịch vụ', timeRange: '14:00 - 22:00' },
  { key: 'shift-dem', shiftCode: 'CA-DEM', shiftName: 'Ca đêm trực ca và bảo dưỡng', timeRange: '22:00 - 06:00' },
];

const INITIAL_PLANS: EnterpriseShiftPlan[] = [
  {
    key: 'plan-01',
    code: 'PC-2026-001',
    name: `Phân ca hành chính T10/2026 - ${DEFAULT_COMPANY}`,
    orgUnit: DEFAULT_COMPANY,
    shiftKey: 'shift-hc',
    shiftName: 'Ca hành chính chuẩn',
    shiftCode: 'HC',
    workHours: '08:00 - 17:30',
    startDate: '29/10/2026',
    endDate: '29/10/2026',
    repeatType: 'Tuần',
    repeatCycle: 1,
    daysOfWeek: [2, 3, 4, 5, 6],
    targetType: 'all_unit',
    skipPreview: false,
    status: 'Đang áp dụng',
    assignedCount: 24,
    createdAt: '2026-10-29',
  },
  {
    key: 'plan-02',
    code: 'PC-2026-002',
    name: `Phân ca sáng vận hành trạm trộn - ${DEFAULT_COMPANY}`,
    orgUnit: DEFAULT_COMPANY,
    shiftKey: 'shift-sang',
    shiftName: 'Ca sáng sản xuất và vận hành',
    shiftCode: 'CA-SANG',
    workHours: '06:00 - 14:00',
    startDate: '01/10/2026',
    endDate: '31/10/2026',
    repeatType: 'Tuần',
    repeatCycle: 1,
    daysOfWeek: [2, 3, 4, 5, 6, 7],
    targetType: 'employees',
    selectedEmployees: ['NV000001', 'NV000002'],
    skipPreview: false,
    status: 'Đang áp dụng',
    assignedCount: 8,
    createdAt: '2026-10-01',
  },
  {
    key: 'plan-03',
    code: 'PC-2026-003',
    name: `Phân ca chiều bảo trì cơ giới - ${DEFAULT_COMPANY}`,
    orgUnit: DEFAULT_COMPANY,
    shiftKey: 'shift-chieu',
    shiftName: 'Ca chiều sản xuất và dịch vụ',
    shiftCode: 'CA-CHIEU',
    workHours: '14:00 - 22:00',
    startDate: '01/10/2026',
    endDate: '31/10/2026',
    repeatType: 'Tuần',
    repeatCycle: 1,
    daysOfWeek: [2, 3, 4, 5, 6],
    targetType: 'departments',
    selectedDepartments: ['Phòng Kỹ Thuật'],
    skipPreview: false,
    status: 'Đang áp dụng',
    assignedCount: 6,
    createdAt: '2026-10-05',
  },
];

// Calendar Grid for 10/2026
// Days: 28, 29, 30 (Sep), 1..31 (Oct), 1 (Nov)
const OCTOBER_GRID_DAYS = [
  { day: 28, month: 9, weekday: 2 },
  { day: 29, month: 9, weekday: 3 },
  { day: 30, month: 9, weekday: 4 },
  { day: 1, month: 10, weekday: 5 },
  { day: 2, month: 10, weekday: 6 },
  { day: 3, month: 10, weekday: 7 },
  { day: 4, month: 10, weekday: 8 },

  { day: 5, month: 10, weekday: 2 },
  { day: 6, month: 10, weekday: 3 },
  { day: 7, month: 10, weekday: 4 },
  { day: 8, month: 10, weekday: 5 },
  { day: 9, month: 10, weekday: 6 },
  { day: 10, month: 10, weekday: 7 },
  { day: 11, month: 10, weekday: 8 },

  { day: 12, month: 10, weekday: 2 },
  { day: 13, month: 10, weekday: 3 },
  { day: 14, month: 10, weekday: 4 },
  { day: 15, month: 10, weekday: 5 },
  { day: 16, month: 10, weekday: 6 },
  { day: 17, month: 10, weekday: 7 },
  { day: 18, month: 10, weekday: 8 },

  { day: 19, month: 10, weekday: 2 },
  { day: 20, month: 10, weekday: 3 },
  { day: 21, month: 10, weekday: 4 },
  { day: 22, month: 10, weekday: 5 },
  { day: 23, month: 10, weekday: 6 },
  { day: 24, month: 10, weekday: 7 },
  { day: 25, month: 10, weekday: 8 },

  { day: 26, month: 10, weekday: 2 },
  { day: 27, month: 10, weekday: 3 },
  { day: 28, month: 10, weekday: 4 },
  { day: 29, month: 10, weekday: 5 },
  { day: 30, month: 10, weekday: 6 },
  { day: 31, month: 10, weekday: 7 },
  { day: 1, month: 11, weekday: 8 },
];

export const ShiftDetailModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseShiftPlan[]>(INITIAL_PLANS);
  const [shifts, setShifts] = useState<any[]>(DEFAULT_SHIFTS_FALLBACK);
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [orgUnits, setOrgUnits] = useState<string[]>([DEFAULT_COMPANY]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orgFilter, setOrgFilter] = useState('all');
  const [shiftFilter, setShiftFilter] = useState('all');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<EnterpriseShiftPlan | null>(null);
  const [form] = Form.useForm();

  // Modal Interactive Form States
  const [selectedDaysOfWeek, setSelectedDaysOfWeek] = useState<number[]>([2, 3, 4, 5, 6]);
  const [targetType, setTargetType] = useState<'all_unit' | 'employees' | 'departments'>('all_unit');
  const [skipPreview, setSkipPreview] = useState(false);
  const [selectedShiftKey, setSelectedShiftKey] = useState<string>('shift-sang');

  const currentShift = useMemo(() => {
    return shifts.find((s) => s.key === selectedShiftKey) || shifts[0] || DEFAULT_SHIFTS_FALLBACK[0];
  }, [shifts, selectedShiftKey]);

  const activeShiftCode = currentShift?.shiftCode || 'CA-SANG';
  const selectedShiftDisplay = `${currentShift?.shiftCode || 'CA-SANG'} - ${currentShift?.shiftName || 'Ca sáng sản xuất và vận hành'}`;

  // Drawer Detail State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<EnterpriseShiftPlan | null>(null);

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      // 1. Load Shifts
      const cachedShifts = dataService.getGenericData('attendance_shifts');
      if (Array.isArray(cachedShifts) && cachedShifts.length > 0) {
        setShifts(cachedShifts);
      } else {
        const shiftRes = await collectionsApi.get<any>('attendance_shifts').catch(() => ({ data: { data: [] } }));
        const shiftRows = shiftRes.data?.data || [];
        if (shiftRows.length > 0) {
          setShifts(shiftRows);
        } else {
          setShifts(DEFAULT_SHIFTS_FALLBACK);
        }
      }

      // 2. Load Employees
      const empList = dataService.getEmployees();
      setEmployees(empList);

      // 3. Load Org Units (Ensure DEFAULT_COMPANY is first and normalized)
      const fetchedUnits = await dataService.fetchOrgUnitsList().catch(() => []);
      const normalizedFetched = fetchedUnits.map((u) => String(u || '').normalize('NFC').trim()).filter(Boolean);
      const mergedUnits = Array.from(new Set([DEFAULT_COMPANY, ...normalizedFetched]));
      setOrgUnits(mergedUnits);

      // 4. Load Plans
      const plansRes = await collectionsApi.get<any>('attendance_shift_details').catch(() => ({ data: { data: [] } }));
      const rows = plansRes.data?.data || [];
      if (Array.isArray(rows) && rows.length > 0) {
        setData(rows);
      } else {
        setData(INITIAL_PLANS);
      }
    } catch {
      setData(INITIAL_PLANS);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = dataService.subscribe(() => {
      setEmployees(dataService.getEmployees());
    });
    return unsub;
  }, []);

  // Filtered Data
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchOrg = orgFilter === 'all' || item.orgUnit === orgFilter;
      const matchShift = shiftFilter === 'all' || item.shiftKey === shiftFilter || item.shiftName === shiftFilter;
      const s = searchText.toLowerCase().trim();
      const matchSearch =
        !s ||
        (item.name || '').toLowerCase().includes(s) ||
        (item.code || '').toLowerCase().includes(s) ||
        (item.shiftName || '').toLowerCase().includes(s) ||
        (item.orgUnit || '').toLowerCase().includes(s);

      return matchStatus && matchOrg && matchShift && matchSearch;
    });
  }, [data, statusFilter, orgFilter, shiftFilter, searchText]);

  // KPI Metrics
  const totalPlans = data.length;
  const activePlans = data.filter((d) => d.status === 'Đang áp dụng').length;
  const totalAssignedStaff = useMemo(() => {
    return data.reduce((acc, cur) => acc + (cur.assignedCount || 0), 0);
  }, [data]);
  const coverageRate = employees.length ? Math.min(100, Math.round((totalAssignedStaff / employees.length) * 100)) : 92;

  // Day toggle handler
  const handleToggleDay = (dayNum: number) => {
    if (selectedDaysOfWeek.includes(dayNum)) {
      if (selectedDaysOfWeek.length === 1) {
        message.warning('Bảng phân ca cần áp dụng ít nhất một ngày trong tuần.');
        return;
      }
      setSelectedDaysOfWeek(selectedDaysOfWeek.filter((d) => d !== dayNum));
    } else {
      setSelectedDaysOfWeek([...selectedDaysOfWeek, dayNum].sort((a, b) => a - b));
    }
  };

  const handleOpenCreate = () => {
    setEditingPlan(null);
    setSelectedDaysOfWeek([2, 3, 4, 5, 6]);
    setTargetType('all_unit');
    setSkipPreview(false);
    const firstShift = shifts[0] || DEFAULT_SHIFTS_FALLBACK[0];
    setSelectedShiftKey(firstShift.key);

    form.resetFields();
    form.setFieldsValue({
      name: `Phân ca hành chính T10/2026 - ${DEFAULT_COMPANY}`,
      orgUnit: DEFAULT_COMPANY,
      shiftKey: firstShift.key,
      startDate: '29/10/2026',
      endDate: '29/10/2026',
      repeatType: 'Tuần',
      repeatCycle: 1,
      targetType: 'all_unit',
      skipPreview: false,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (plan: EnterpriseShiftPlan) => {
    setEditingPlan(plan);
    setSelectedDaysOfWeek(plan.daysOfWeek || [2, 3, 4, 5, 6]);
    setTargetType(plan.targetType || 'all_unit');
    setSkipPreview(Boolean(plan.skipPreview));
    setSelectedShiftKey(plan.shiftKey);

    form.setFieldsValue({
      name: plan.name,
      orgUnit: (plan.orgUnit || DEFAULT_COMPANY).normalize('NFC'),
      shiftKey: plan.shiftKey,
      startDate: plan.startDate || '29/10/2026',
      endDate: plan.endDate || '29/10/2026',
      repeatType: plan.repeatType || 'Tuần',
      repeatCycle: plan.repeatCycle || 1,
      targetType: plan.targetType || 'all_unit',
      selectedEmployees: plan.selectedEmployees || [],
      selectedDepartments: plan.selectedDepartments || [],
      skipPreview: Boolean(plan.skipPreview),
    });
    setModalOpen(true);
  };

  const handleSavePlan = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const shiftObj = shifts.find((s) => s.key === values.shiftKey) || DEFAULT_SHIFTS_FALLBACK[0];
      const planPayload: EnterpriseShiftPlan = {
        key: editingPlan ? editingPlan.key : `plan-${Date.now()}`,
        code: editingPlan ? editingPlan.code : `PC-2026-${String(data.length + 1).padStart(3, '0')}`,
        name: values.name,
        orgUnit: (values.orgUnit || DEFAULT_COMPANY).normalize('NFC'),
        shiftKey: shiftObj.key,
        shiftName: shiftObj.shiftName,
        shiftCode: shiftObj.shiftCode || 'CA',
        workHours: shiftObj.timeRange || `${shiftObj.startTime || '08:00'} - ${shiftObj.endTime || '17:30'}`,
        startDate: values.startDate || '29/10/2026',
        endDate: values.endDate || '29/10/2026',
        repeatType: values.repeatType || 'Tuần',
        repeatCycle: Number(values.repeatCycle || 1),
        daysOfWeek: selectedDaysOfWeek,
        targetType: targetType,
        selectedEmployees: values.selectedEmployees || [],
        selectedDepartments: values.selectedDepartments || [],
        skipPreview: skipPreview,
        status: editingPlan ? editingPlan.status : 'Đang áp dụng',
        assignedCount: targetType === 'all_unit' ? (employees.length || 24) : (values.selectedEmployees?.length || 8),
        createdAt: editingPlan?.createdAt || new Date().toISOString().slice(0, 10),
      };

      if (editingPlan) {
        await collectionsApi.update('attendance_shift_details', editingPlan.key, planPayload).catch(() => {});
        setData((prev) => prev.map((item) => (item.key === editingPlan.key ? planPayload : item)));
        message.success(`Đã cập nhật bảng phân ca: ${planPayload.name}`);
      } else {
        await collectionsApi.create('attendance_shift_details', planPayload).catch(() => {});
        setData((prev) => [planPayload, ...prev]);
        message.success(`Đã thêm mới bảng phân ca: ${planPayload.name}`);
      }

      setModalOpen(false);
      form.resetFields();
    } catch (err: any) {
      message.error(err?.message || 'Không thể lưu bảng phân ca.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlan = (plan: EnterpriseShiftPlan) => {
    Modal.confirm({
      title: 'Xác nhận xóa bảng phân ca?',
      content: `Bạn có chắc chắn muốn xóa "${plan.name}" không? Toàn bộ lịch làm việc theo thiết lập này sẽ ngừng hiệu lực.`,
      okText: 'Xóa bảng phân ca',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await collectionsApi.delete('attendance_shift_details', plan.key).catch(() => {});
          setData((prev) => prev.filter((p) => p.key !== plan.key));
          message.success(`Đã xóa bảng phân ca: ${plan.name}`);
        } catch {
          message.error('Không thể xóa bảng phân ca.');
        }
      },
    });
  };

  const handleExportExcel = () => {
    try {
      const header = [
        'Mã phân ca',
        'Tên bảng phân ca',
        'Đơn vị áp dụng',
        'Ca làm việc',
        'Khung giờ',
        'Ngày bắt đầu',
        'Ngày kết thúc',
        'Lặp theo',
        'Chu kì lặp',
        'Ngày áp dụng',
        'Đối tượng',
        'Trạng thái',
      ];
      const rows = filteredData.map((p) => [
        p.code,
        p.name,
        p.orgUnit,
        p.shiftName,
        p.workHours,
        p.startDate,
        p.endDate,
        p.repeatType,
        `${p.repeatCycle} ${p.repeatType}`,
        p.daysOfWeek.map((d) => (d === 8 ? 'CN' : `T${d}`)).join(', '),
        p.targetType === 'all_unit' ? 'Toàn đơn vị' : p.targetType === 'employees' ? 'Danh sách nhân viên' : 'Danh sách phòng ban',
        p.status,
      ]);
      const blob = generateValidXlsxBlob([header, ...rows]);
      downloadFile(`phan_ca_chi_tiet_${new Date().toISOString().slice(0, 10)}.xlsx`, blob);
      message.success('Đã xuất danh sách phân ca chi tiết ra file Excel.');
    } catch {
      message.error('Không thể xuất file Excel.');
    }
  };

  const columns = [
    {
      title: 'Mã, tên bảng phân ca',
      key: 'name',
      render: (_: any, record: EnterpriseShiftPlan) => (
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
            {record.shiftCode || 'PC'}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{record.name}</div>
            <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600 }}>
              Mã: <code>{record.code}</code> · Lặp {record.repeatCycle} {record.repeatType.toLowerCase()}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Đơn vị áp dụng',
      dataIndex: 'orgUnit',
      key: 'orgUnit',
      width: 250,
      render: (unit: string) => (
        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ApartmentOutlined style={{ color: '#009688', fontSize: 14 }} />
          <span>{unit}</span>
        </div>
      ),
    },
    {
      title: 'Ca làm việc',
      key: 'shift',
      width: 230,
      render: (_: any, record: EnterpriseShiftPlan) => (
        <div>
          <div style={{ fontWeight: 600, color: '#2563EB', fontSize: 13 }}>{record.shiftName}</div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <ClockCircleOutlined style={{ fontSize: 11 }} />
            <span>{record.workHours}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Thời gian áp dụng',
      key: 'dates',
      width: 220,
      render: (_: any, record: EnterpriseShiftPlan) => (
        <div style={{ fontSize: 12, color: '#475569' }}>
          <div>Từ <strong>{record.startDate}</strong> đến <strong>{record.endDate}</strong></div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            Áp dụng: <strong>{record.daysOfWeek.map((d) => (d === 8 ? 'CN' : `T${d}`)).join(', ')}</strong>
          </div>
        </div>
      ),
    },
    {
      title: 'Đối tượng áp dụng',
      key: 'target',
      width: 190,
      render: (_: any, record: EnterpriseShiftPlan) => {
        let label = 'Toàn đơn vị';
        if (record.targetType === 'employees') label = `Danh sách nhân viên (${record.selectedEmployees?.length || record.assignedCount} NV)`;
        if (record.targetType === 'departments') label = `Danh sách phòng ban (${record.selectedDepartments?.length || 1} PB)`;
        return (
          <div style={{ fontSize: 12, color: '#334155' }}>
            <div style={{ fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 11.5, color: '#16A34A' }}>{record.assignedCount} Cán bộ nhân viên</div>
          </div>
        );
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => {
        const color = status === 'Đang áp dụng' ? 'success' : 'default';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 150,
      render: (_: any, record: EnterpriseShiftPlan) => {
        const actionMenuItems = [
          {
            key: 'edit',
            label: 'Chỉnh sửa phân ca',
            icon: <EditOutlined style={{ color: '#009688' }} />,
            onClick: () => handleOpenEdit(record),
          },
          {
            key: 'toggle_status',
            label: record.status === 'Đang áp dụng' ? 'Tạm ngưng phân ca' : 'Kích hoạt lại phân ca',
            icon: <CheckCircleOutlined style={{ color: '#D97706' }} />,
            onClick: () => {
              const newStatus = record.status === 'Đang áp dụng' ? 'Tạm ngưng' : 'Đang áp dụng';
              setData((prev) => prev.map((p) => (p.key === record.key ? { ...p, status: newStatus } : p)));
              message.success(`Đã cập nhật trạng thái bảng phân ca: ${newStatus}`);
            },
          },
          {
            key: 'delete',
            label: 'Xóa bảng phân ca',
            icon: <DeleteOutlined style={{ color: '#EF4444' }} />,
            onClick: () => handleDeletePlan(record),
          },
        ];

        return (
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                setSelectedPlan(record);
                setDrawerOpen(true);
              }}
              style={{ flexShrink: 0 }}
            >
              Chi tiết
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<EditOutlined />}
              onClick={() => handleOpenEdit(record)}
              style={{ backgroundColor: '#009688', borderColor: '#009688', flexShrink: 0 }}
            >
              Sửa
            </Button>
            <Dropdown menu={{ items: actionMenuItems }} placement="bottomRight">
              <Button
                size="small"
                icon={<MenuOutlined />}
                style={{ padding: '0 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                title="Thao tác khác"
              />
            </Dropdown>
          </div>
        );
      },
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số bảng phân ca</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalPlans} Bảng phân ca
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Thiết lập phân ca hoạt động</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Phân ca đang áp dụng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {activePlans} Bảng ({totalPlans ? Math.round((activePlans / totalPlans) * 100) : 100}%)
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đang tự động gán vào bảng chấm công</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhân sự đã được phân ca</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalAssignedStaff} Nhân sự
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Theo danh sách đơn vị và vị trí</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ phủ ca làm việc</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {coverageRate}%
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>So với quy mô nhân sự hiện tại</div>
        </div>
      </div>

      {/* Sub-Tabs Filter & Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả phân ca' },
            { key: 'Đang áp dụng', label: 'Đang áp dụng' },
            { key: 'Tạm ngưng', label: 'Tạm ngưng' },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setStatusFilter(tab.key)}
              style={{
                backgroundColor: statusFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: statusFilter === tab.key ? '#009688' : '#CBD5E1',
                color: statusFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: statusFilter === tab.key ? 700 : 500,
                height: 32,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            placeholder="Tìm kiếm bảng phân ca, ca làm việc..."
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 260, height: 32 }}
          />

          <Select
            value={orgFilter}
            onChange={setOrgFilter}
            style={{ width: 240, height: 32 }}
            options={[
              { label: 'Tất cả đơn vị', value: 'all' },
              ...orgUnits.map((u) => ({ label: u, value: u })),
            ]}
          />

          <Button
            icon={<DownloadOutlined />}
            onClick={handleExportExcel}
            style={{ height: 32 }}
          >
            Xuất Excel
          </Button>

          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadData(true)}
            style={{ height: 32 }}
          >
            Tải lại
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688', height: 32 }}
          >
            Thêm bảng phân ca
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <KTable
        columns={columns}
        dataSource={filteredData}
        rowKey="key"
        loading={loading}
        pagination={{ pageSize: 10, showSizeChanger: true }}
      />

      {/* MODAL: PHÂN CA CHI TIẾT (CHUẨN 100% CẤU TRÚC VÀ YÊU CẦU NGƯỜI DÙNG) */}
      <Modal
        title={editingPlan ? 'Chỉnh sửa phân ca chi tiết' : 'Phân ca chi tiết'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={1160}
        style={{ maxWidth: '96vw', top: 30 }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSavePlan}
        >
          {/* BỐ CỤC 2 CỘT TỰ NHIÊN: KHÔNG CÓ BẤT KỲ ĐƯỜNG KẺ THẲNG NGĂN CÁCH NÀO */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.32fr) minmax(380px, 1fr)',
              gap: 28,
              alignItems: 'start',
            }}
          >
            {/* CỘT TRÁI: CẤU HÌNH THÔNG TIN VÀ ĐỐI TƯỢNG */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* I. THÔNG TIN CHUNG */}
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                  Thông tin chung
                </div>

                {/* Hàng 1: Tên bảng phân ca (trái) và Đơn vị áp dụng (phải) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <Form.Item
                    name="name"
                    label="Tên bảng phân ca"
                    required
                    rules={[{ required: true, message: 'Vui lòng nhập tên bảng phân ca' }]}
                    style={{ margin: 0 }}
                  >
                    <Input placeholder="Nhập tên bảng phân ca" style={{ height: 32, width: '100%' }} />
                  </Form.Item>

                  <Form.Item
                    name="orgUnit"
                    label="Đơn vị áp dụng"
                    required
                    initialValue={DEFAULT_COMPANY}
                    rules={[{ required: true, message: 'Vui lòng chọn đơn vị áp dụng' }]}
                    style={{ margin: 0 }}
                  >
                    <Select
                      style={{ height: 32, width: '100%' }}
                      options={orgUnits.map((u) => ({ label: u, value: u }))}
                    />
                  </Form.Item>
                </div>

                {/* Hàng 2: Ca làm việc (chiếm cột trái) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Form.Item
                    name="shiftKey"
                    label="Ca làm việc"
                    required
                    rules={[{ required: true, message: 'Vui lòng chọn ca làm việc' }]}
                    style={{ margin: 0 }}
                  >
                    <Select
                      style={{ height: 32, width: '100%' }}
                      onChange={(val) => setSelectedShiftKey(val)}
                      options={shifts.map((s) => ({
                        label: `${s.shiftCode || 'CA'} - ${s.shiftName}`,
                        value: s.key,
                      }))}
                    />
                  </Form.Item>
                  <div />
                </div>
              </div>

              {/* II. THỜI GIAN ÁP DỤNG */}
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                  Thời gian áp dụng
                </div>

                {/* 4 trường trên 1 hàng ngang duy nhất */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
                  <Form.Item
                    name="startDate"
                    label="Ngày bắt đầu"
                    required
                    initialValue="29/10/2026"
                    rules={[{ required: true, message: 'Vui lòng nhập ngày bắt đầu' }]}
                    style={{ margin: 0 }}
                  >
                    <Input placeholder="29/10/2026" style={{ height: 32, width: '100%' }} />
                  </Form.Item>

                  <Form.Item
                    name="endDate"
                    label="Ngày kết thúc"
                    initialValue="29/10/2026"
                    style={{ margin: 0 }}
                  >
                    <Input placeholder="29/10/2026" style={{ height: 32, width: '100%' }} />
                  </Form.Item>

                  <Form.Item
                    name="repeatType"
                    label="Lặp theo"
                    initialValue="Tuần"
                    style={{ margin: 0 }}
                  >
                    <Select
                      style={{ height: 32, width: '100%' }}
                      options={[
                        { label: 'Tuần', value: 'Tuần' },
                        { label: 'Tháng', value: 'Tháng' },
                        { label: 'Ngày', value: 'Ngày' },
                      ]}
                    />
                  </Form.Item>

                  <Form.Item
                    name="repeatCycle"
                    label="Chu kì lặp"
                    initialValue={1}
                    style={{ margin: 0 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32 }}>
                      <Input type="number" min={1} defaultValue={1} style={{ height: 32, flex: 1, minWidth: 44 }} />
                      <span style={{ fontSize: 13, color: '#475569', fontWeight: 500, flexShrink: 0 }}>Tuần</span>
                    </div>
                  </Form.Item>
                </div>

                {/* Nhãn Ngày áp dụng trong tuần */}
                <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500, marginBottom: 8, marginTop: 4 }}>
                  Ngày áp dụng trong tuần:
                </div>

                {/* Thứ 2 - Chủ nhật: Các nút hiển thị gần nhau, kích thước gọn gàng tự nhiên */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { num: 2, label: 'Thứ 2' },
                    { num: 3, label: 'Thứ 3' },
                    { num: 4, label: 'Thứ 4' },
                    { num: 5, label: 'Thứ 5' },
                    { num: 6, label: 'Thứ 6' },
                    { num: 7, label: 'Thứ 7' },
                    { num: 8, label: 'Chủ nhật' },
                  ].map((day) => {
                    const isSelected = selectedDaysOfWeek.includes(day.num);
                    return (
                      <button
                        key={day.num}
                        type="button"
                        onClick={() => handleToggleDay(day.num)}
                        style={{
                          height: 32,
                          padding: '0 12px',
                          borderRadius: 6,
                          border: isSelected ? '1px solid #009688' : '1px solid #CBD5E1',
                          backgroundColor: isSelected ? '#E0F2F1' : '#FFFFFF',
                          color: isSelected ? '#00796B' : '#475569',
                          fontWeight: isSelected ? 600 : 500,
                          fontSize: 12.5,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                          outline: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>

                {/* Checkbox Bỏ xem trước phân ca: Khoảng cách vừa phải, gọn gàng và tự nhiên */}
                <div style={{ marginTop: 12, marginBottom: 14, display: 'flex', alignItems: 'center' }}>
                  <Checkbox
                    checked={skipPreview}
                    onChange={(e) => setSkipPreview(Boolean(e.target.checked))}
                    style={{ fontSize: 13, color: '#334155' }}
                  >
                    Bỏ xem trước phân ca
                  </Checkbox>
                </div>
              </div>

              {/* III. ĐỐI TƯỢNG ÁP DỤNG */}
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                  Đối tượng áp dụng
                </div>

                <RadioGroup
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value)}
                  style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <div>
                    <Radio value="all_unit">
                      <span style={{ fontWeight: 600, color: '#0F172A' }}>Toàn đơn vị</span>
                    </Radio>
                    <div style={{ fontSize: 12, color: '#64748B', marginLeft: 24, marginTop: 2 }}>
                      Các nhân viên khi tiếp nhận hoặc điều chuyển đến đơn vị đã chọn sẽ tự động được phân ca theo thiết lập này.
                    </div>
                  </div>

                  <div>
                    <Radio value="employees">
                      <span style={{ fontWeight: 600, color: '#0F172A' }}>Danh sách nhân viên</span>
                    </Radio>
                    {targetType === 'employees' && (
                      <div style={{ marginLeft: 24, marginTop: 6 }}>
                        <Form.Item name="selectedEmployees" style={{ margin: 0 }}>
                          <Select
                            mode="multiple"
                            placeholder="Chọn nhân viên áp dụng..."
                            style={{ width: '100%', height: 32 }}
                            options={employees.map((emp) => ({
                              label: `${emp.name} (${emp.code || emp.employeeCode} - ${emp.department})`,
                              value: emp.code || emp.employeeCode || emp.id,
                            }))}
                          />
                        </Form.Item>
                      </div>
                    )}
                  </div>

                  <div>
                    <Radio value="departments">
                      <span style={{ fontWeight: 600, color: '#0F172A' }}>Danh sách phòng ban</span>
                    </Radio>
                    {targetType === 'departments' && (
                      <div style={{ marginLeft: 24, marginTop: 6 }}>
                        <Form.Item name="selectedDepartments" style={{ margin: 0 }}>
                          <Select
                            mode="multiple"
                            placeholder="Chọn phòng ban áp dụng..."
                            style={{ width: '100%', height: 32 }}
                            options={orgUnits.map((u) => ({ label: u, value: u }))}
                          />
                        </Form.Item>
                      </div>
                    )}
                  </div>
                </RadioGroup>
              </div>
            </div>

            {/* CỘT PHẢI: XEM TRƯỚC PHÂN CA (LUÔN Ở BÊN PHẢI) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                  Xem trước phân ca
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#009688' }}>
                  10/2026
                </div>
              </div>

              {/* Tag Ca áp dụng */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 12, color: '#475569' }}>
                <span>Ca áp dụng:</span>
                <span
                  style={{
                    backgroundColor: '#E0F2F1',
                    color: '#00796B',
                    border: '1px solid #B2DFDB',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontWeight: 600,
                    fontSize: 11.5,
                  }}
                >
                  {selectedShiftDisplay}
                </span>
              </div>

              {skipPreview ? (
                <div
                  style={{
                    border: '1px dashed #CBD5E1',
                    borderRadius: 6,
                    padding: '48px 16px',
                    textAlign: 'center',
                    color: '#94A3B8',
                    fontSize: 12.5,
                  }}
                >
                  Đã chọn bỏ xem trước phân ca.
                </div>
              ) : (
                <>
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: 6, overflow: 'hidden' }}>
                    {/* Header 7 thứ */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(7, 1fr)',
                        background: '#F8FAFC',
                        borderBottom: '1px solid #E2E8F0',
                        textAlign: 'center',
                        fontWeight: 600,
                        fontSize: 12,
                        color: '#475569',
                        padding: '8px 0',
                      }}
                    >
                      <div>Thứ 2</div>
                      <div>Thứ 3</div>
                      <div>Thứ 4</div>
                      <div>Thứ 5</div>
                      <div>Thứ 6</div>
                      <div>Thứ 7</div>
                      <div style={{ color: '#EF4444' }}>CN</div>
                    </div>

                    {/* Grid 35 ô ngày */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: 4, gap: 3 }}>
                      {OCTOBER_GRID_DAYS.map((cell, idx) => {
                        const isOctober = cell.month === 10;
                        const isActiveWeekday = selectedDaysOfWeek.includes(cell.weekday);
                        const isAppliedDay = isOctober && isActiveWeekday;

                        return (
                          <div
                            key={idx}
                            style={{
                              minHeight: 44,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: 4,
                              backgroundColor: isAppliedDay ? '#F0FDF4' : 'transparent',
                              color: isAppliedDay
                                ? '#00796B'
                                : !isOctober
                                ? '#CBD5E1'
                                : cell.weekday === 8
                                ? '#EF4444'
                                : '#1E293B',
                              padding: '3px 0',
                            }}
                          >
                            <span style={{ fontSize: 12.5, fontWeight: isAppliedDay ? 700 : 500 }}>
                              {cell.day}
                            </span>
                            {isAppliedDay && (
                              <span
                                style={{
                                  fontSize: 9.5,
                                  fontWeight: 600,
                                  color: '#00796B',
                                  backgroundColor: '#E0F2F1',
                                  borderRadius: 3,
                                  padding: '1px 4px',
                                  lineHeight: 1.2,
                                  marginTop: 2,
                                  letterSpacing: '-0.2px',
                                }}
                              >
                                {activeShiftCode}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 4 }}>
                    Lịch dự kiến áp dụng cho các ngày làm việc trong tháng 10/2026 theo thứ đã chọn.
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Footer Actions: KHÔNG CÓ BẤT KỲ ĐƯỜNG KẺ THẲNG NÀO */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
            <Button disabled={saving} onClick={() => setModalOpen(false)} style={{ height: 32, padding: '0 18px', borderRadius: 6 }}>
              Hủy
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={saving}
              disabled={saving}
              style={{ backgroundColor: '#009688', borderColor: '#009688', height: 32, padding: '0 18px', borderRadius: 6 }}
            >
              {editingPlan ? 'Lưu thay đổi' : 'Lưu bảng phân ca'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: CHI TIẾT BẢNG PHÂN CA */}
      <Drawer
        title="Chi tiết bảng phân ca"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={480}
      >
        {selectedPlan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                {selectedPlan.name}
              </div>
              <div style={{ fontSize: 12.5, color: '#009688', fontWeight: 600, marginTop: 4 }}>
                Mã bảng: <code>{selectedPlan.code}</code> · Trạng thái: <Tag color={selectedPlan.status === 'Đang áp dụng' ? 'success' : 'default'}>{selectedPlan.status}</Tag>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông tin ca và thời gian:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Đơn vị áp dụng:</span>
                  <strong style={{ color: '#334155' }}>{selectedPlan.orgUnit}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Ca làm việc:</span>
                  <strong style={{ color: '#2563EB' }}>{selectedPlan.shiftName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Khung giờ:</span>
                  <strong style={{ color: '#009688' }}>{selectedPlan.workHours}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thời gian hiệu lực:</span>
                  <span>Từ <strong>{selectedPlan.startDate}</strong> đến <strong>{selectedPlan.endDate}</strong></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Chu kì lặp:</span>
                  <span>{selectedPlan.repeatCycle} {selectedPlan.repeatType.toLowerCase()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Các thứ trong tuần:</span>
                  <strong style={{ color: '#16A34A' }}>
                    {selectedPlan.daysOfWeek.map((d) => (d === 8 ? 'Chủ nhật' : `Thứ ${d}`)).join(', ')}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Đối tượng áp dụng:</span>
                  <span>{selectedPlan.targetType === 'all_unit' ? 'Toàn đơn vị' : selectedPlan.targetType === 'employees' ? 'Danh sách nhân viên' : 'Danh sách phòng ban'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Số nhân sự phủ ca:</span>
                  <strong>{selectedPlan.assignedCount} Cán bộ</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  setDrawerOpen(false);
                  handleOpenEdit(selectedPlan);
                }}
                style={{ flex: 1, height: 32 }}
              >
                Chỉnh sửa phân ca
              </Button>
              <Button
                type="primary"
                onClick={() => {
                  message.success(`Đã đồng bộ phân ca "${selectedPlan.name}" vào bảng chấm công.`);
                }}
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688', height: 32 }}
              >
                Đồng bộ vào chấm công
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
