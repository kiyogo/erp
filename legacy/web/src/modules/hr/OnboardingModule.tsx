import React, { useState, useEffect } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  UserAddOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  CheckOutlined,
  CalendarOutlined,
  UserOutlined,
  BookOutlined,
  IdcardOutlined,
  LaptopOutlined,
  RocketOutlined,
  WarningOutlined,
  CloseOutlined,
  FilterOutlined,
  PushpinOutlined,
  PaperClipOutlined,
  SendOutlined,
  EllipsisOutlined,
  UploadOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  BarChartOutlined,
  CustomerServiceOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Progress, Drawer, Checkbox } from '../../custom-ui';
import { collectionsApi, employeesApi, EnterpriseEmployee } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { useNavigate } from 'react-router-dom';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';

export const onboardingSteps = [
  { key: 'equipment', title: 'Giai đoạn 1: Trang bị thiết bị & Tài khoản', description: 'Xác nhận bàn giao thiết bị và cấp tài khoản làm việc' },
  { key: 'orientation', title: 'Giai đoạn 2: Đào tạo văn hóa & Quy định công ty', description: 'Xác nhận đã hướng dẫn nội quy, bảo mật và cơ cấu tổ chức' },
  { key: 'training', title: 'Giai đoạn 3: Training chuyên môn 1:1 cùng Mentor', description: 'Xác nhận hoàn tất nội dung đào tạo chuyên môn đã giao' },
  { key: 'trialTasks', title: 'Giai đoạn 4: Thực thi Task thực tế & Đánh giá giữa kỳ', description: 'Xác nhận nghiệm thu công việc và phản hồi giữa kỳ' },
  { key: 'probationReview', title: 'Giai đoạn 5: Báo cáo thử việc & Hồ sơ hợp đồng', description: 'Xác nhận kết quả đánh giá và bàn giao hồ sơ; chữ ký được xử lý tại Hợp đồng lao động' },
] as const;

export const ONBOARDING_TASK_NAMES = [
  'Cấp phát tài sản, văn phòng phẩm',
  'Kích hoạt tài khoản MISA AMIS',
  'Ký hợp đồng',
  'Nộp giấy tờ còn thiếu',
  'Lấy vân tay chấm công',
  'Cập nhật hồ sơ cá nhân',
  'Chụp ảnh thẻ',
  'Tìm hiểu công ty',
  'Tham gia đào tạo hội nhập',
  'Phê duyệt hồ sơ nhân viên tự cập nhật',
  'Cập nhật công ngày đầu tiên',
  'Trao đổi kế hoạch thử việc và hướng dẫn công việc',
] as const;

export const ONBOARDING_WORK_TYPES = [
  'Thực hiện trên ứng dụng',
  'Thực hiện bên ngoài',
] as const;

const SAMPLE_CANDIDATE_EMPLOYEES: EnterpriseEmployee[] = [
  {
    id: 'emp-sample-1',
    userId: 'emp-sample-1',
    employeeCode: 'NV000001',
    code: 'NV000001',
    name: 'Nguyễn MI SA NGU',
    fullName: 'Nguyễn MI SA NGU',
    department: 'CÔNG TY TNHH XÂY DỰNG KINH SỞ',
    position: '-',
    joinDate: '-',
    status: 'Thử việc',
    role: 'USER',
    isActive: true,
    activationStatus: 'active',
    salaryBase: 0,
    createdAt: '',
    updatedAt: '',
  },
];

type OnboardingStep = { key: typeof onboardingSteps[number]['key']; completed: boolean; completedAt?: string; completedBy?: string };

export interface OnboardingCustomTask {
  id: string;
  title: string;
  assigneeType: 'Nhân viên' | 'Quản lý trực tiếp' | 'Bộ phận khác';
  assignedTo?: string;
  workType: 'Thực hiện trên ứng dụng' | 'Thực hiện bên ngoài';
  appAction?: string;
  description?: string;
  deadline?: string;
  allowEmployeeTrack?: boolean;
  completed?: boolean;
  completedAt?: string;
}

export interface EnterpriseOnboardingTask {
  key: string;
  employeeId?: string;
  employeeName: string;
  empCode: string;
  position: string;
  department: string;
  startDate: string;
  evaluationDate: string;
  mentor: string;
  mentorPhone: string;
  progress: number;
  currentStep: string;
  laptopProvided: boolean;
  emailCreated: boolean;
  contractSigned: boolean;
  checklist?: OnboardingStep[];
  customTasks?: OnboardingCustomTask[];
  notes?: Array<{ id: string; author: string; content: string; createdAt: string }>;
  supportNote?: string;
  reviewNotes?: string;
  completedAt?: string;
  status: 'Đang hội nhập' | 'Đã hoàn thành' | 'Cần hỗ trợ';
}

export function onboardingChecklist(task: Pick<EnterpriseOnboardingTask, 'checklist'>): OnboardingStep[] {
  return onboardingSteps.map(step => ({ key: step.key, completed: false, ...task.checklist?.find(item => item.key === step.key) }));
}

export function onboardingProgress(checklist: OnboardingStep[]): number {
  return Math.round(onboardingSteps.filter(step => checklist.some(item => item.key === step.key && item.completed === true)).length / onboardingSteps.length * 100);
}

export const OnboardingModule: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<EnterpriseOnboardingTask[]>([]);
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [posOptions, setPosOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Dialog Thêm nhân viên hội nhập (Ảnh 1)
  const [modalOpen, setModalOpen] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateDept, setCandidateDept] = useState('');
  const [selectedEmpKeys, setSelectedEmpKeys] = useState<string[]>([]);
  const [editingTask, setEditingTask] = useState<EnterpriseOnboardingTask | null>(null);
  const [form] = Form.useForm();

  // Chi tiết nhân viên hội nhập (Ảnh 2)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTaskRef, setSelectedTask] = useState<EnterpriseOnboardingTask | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [newNoteText, setNewNoteText] = useState('');
  const [taskFilterTab, setTaskFilterTab] = useState<'all' | 'pending' | 'completed'>('all');

  // Modal Thêm công việc (Ảnh 3, 4)
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskName, setTaskName] = useState<string>(ONBOARDING_TASK_NAMES[0]);
  const [assigneeType, setAssigneeType] = useState<'Nhân viên' | 'Quản lý trực tiếp' | 'Bộ phận khác'>('Nhân viên');
  const [otherAssignee, setOtherAssignee] = useState('');
  const [workType, setWorkType] = useState<'Thực hiện trên ứng dụng' | 'Thực hiện bên ngoài'>('Thực hiện trên ứng dụng');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [allowTrack, setAllowTrack] = useState(true);

  const currentTask = data.find(task => task.key === selectedTaskRef?.key) || selectedTaskRef;
  const selectedTask = currentTask;

  const loadData = async () => {
    setLoading(true);
    try {
      const [list, staff, orgUnits, positions] = await Promise.all([
        dataService.refreshGenericData('hr_onboarding_tasks'),
        employeesApi.getAll(),
        dataService.fetchOrgUnitsList(),
        dataService.fetchDropdownOptions('positions'),
      ]);
      setData(list.map((item: any) => ({ ...item, key: item.key || item.id, progress: onboardingProgress(onboardingChecklist(item)) })));
      const activeStaff = staff.data.data.filter(employee => employee.isActive !== false && employee.status !== 'Đã nghỉ việc');
      setEmployees(activeStaff.length > 0 ? activeStaff : SAMPLE_CANDIDATE_EMPLOYEES);
      setDeptOptions(orgUnits.map((u) => ({ label: u, value: u })));
      setPosOptions(positions.filter((p) => p.isActive !== false).map((p) => ({ label: p.name, value: p.name })));
      setLoadError('');
    } catch (error: any) {
      setLoadError(error?.response?.data?.message || 'Không thể tải dữ liệu hội nhập. Vui lòng thử lại.');
      setEmployees(SAMPLE_CANDIDATE_EMPLOYEES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const ongoingCount = data.filter((d) => d.status === 'Đang hội nhập').length;
  const completedCount = data.filter((d) => d.status === 'Đã hoàn thành' && onboardingProgress(onboardingChecklist(d)) === 100).length;

  const handleCreate = async (values: any) => {
    if (saving) return;
    const employee = employees.find(item => item.id === values.employeeId || item.userId === values.employeeId);
    if (!employee || !values.position?.trim() || !values.department?.trim() || !values.mentor?.trim()) { message.error('Vui lòng chọn nhân sự đã có trong hệ thống và nhập đủ vị trí, phòng ban, người hướng dẫn.'); return; }
    const start = values.startDate || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || Number.isNaN(Date.parse(start)) || new Date(start).toISOString().slice(0, 10) !== start) { message.error('Ngày bắt đầu không hợp lệ.'); return; }
    if (data.some(task => task.key !== editingTask?.key && task.employeeId === employee.id && task.status !== 'Đã hoàn thành')) { message.error('Nhân sự này đã có lộ trình hội nhập đang mở.'); return; }
    const evalDate = values.evaluationDate || new Date(Date.parse(start) + 60 * 86400000).toISOString().substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(evalDate) || Number.isNaN(Date.parse(evalDate)) || new Date(evalDate).toISOString().slice(0, 10) !== evalDate || evalDate < start) { message.error('Ngày đánh giá phải hợp lệ và không trước ngày bắt đầu.'); return; }
    const id = editingTask?.key || `onboard-${crypto.randomUUID()}`;
    const checklist = editingTask ? onboardingChecklist(editingTask) : onboardingChecklist({});
    const newHire: EnterpriseOnboardingTask = {
      ...editingTask,
      ...values,
      key: id,
      employeeId: employee.id, employeeName: employee.name, empCode: employee.employeeCode || employee.code,
      startDate: start,
      evaluationDate: evalDate,
      checklist,
      progress: onboardingProgress(checklist),
      currentStep: onboardingSteps.find(step => !checklist.find(item => item.key === step.key)?.completed)?.title || 'Chờ nghiệm thu hội nhập',
      laptopProvided: editingTask?.laptopProvided || false,
      emailCreated: editingTask?.emailCreated || false,
      contractSigned: editingTask?.contractSigned || false,
      status: editingTask?.status === 'Đã hoàn thành' && onboardingProgress(checklist) < 100 ? 'Đang hội nhập' : editingTask?.status || 'Đang hội nhập',
    };
    try {
      setSaving(true);
      const response = editingTask ? await collectionsApi.update('hr_onboarding_tasks', id, newHire) : await collectionsApi.create('hr_onboarding_tasks', newHire, id);
      setData(previous => editingTask ? previous.map(task => task.key === id ? response.data.record : task) : [response.data.record, ...previous]);
      message.success(`Đã ${editingTask ? 'cập nhật' : 'tạo'} lộ trình hội nhập cho: ${employee.name}`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tạo lộ trình Onboarding.');
    } finally { setSaving(false); }
  };

  const handleSaveCandidates = async () => {
    if (selectedEmpKeys.length === 0) {
      message.warning('Vui lòng chọn ít nhất một nhân viên trong bảng.');
      return;
    }
    const pool = employees.length > 0 ? employees : SAMPLE_CANDIDATE_EMPLOYEES;
    const selectedEmps = pool.filter(emp => selectedEmpKeys.includes(emp.id || emp.userId || emp.employeeCode || emp.code || ''));
    if (selectedEmps.length === 0) return;

    setSaving(true);
    let createdCount = 0;
    try {
      const newTasks: EnterpriseOnboardingTask[] = [];
      for (const emp of selectedEmps) {
        if (data.some(task => task.employeeId === emp.id && task.status !== 'Đã hoàn thành')) {
          continue;
        }
        const start = emp.joinDate !== '-' && emp.joinDate ? emp.joinDate : new Date().toISOString().slice(0, 10);
        const evalDate = new Date(Date.parse(start) + 60 * 86400000).toISOString().slice(0, 10);
        const id = `onboard-${crypto.randomUUID()}`;
        const checklist = onboardingChecklist({});
        const newHire: EnterpriseOnboardingTask = {
          key: id,
          employeeId: emp.id,
          employeeName: emp.name || (emp as any).fullName || 'Nhân viên mới',
          empCode: emp.employeeCode || emp.code || 'NV-NEW',
          position: emp.position && emp.position !== '-' ? emp.position : 'Nhân viên',
          department: emp.department && emp.department !== '-' ? emp.department : 'Văn phòng',
          startDate: start,
          evaluationDate: evalDate,
          mentor: 'Ban Giám đốc',
          mentorPhone: '',
          progress: 0,
          currentStep: onboardingSteps[0].title,
          laptopProvided: false,
          emailCreated: false,
          contractSigned: false,
          checklist,
          customTasks: [],
          status: 'Đang hội nhập',
        };
        const res = await collectionsApi.create('hr_onboarding_tasks', newHire, id);
        newTasks.push(res.data.record);
        createdCount++;
      }
      if (newTasks.length > 0) {
        setData(prev => [...newTasks, ...prev]);
        message.success(`Đã thêm ${createdCount} nhân viên vào danh sách hội nhập.`);
      } else {
        message.info('Các nhân viên đã chọn đều đã có lộ trình hội nhập đang mở.');
      }
      setModalOpen(false);
      setSelectedEmpKeys([]);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu nhân viên hội nhập.');
    } finally {
      setSaving(false);
    }
  };

  const updateTask = async (patch: Partial<EnterpriseOnboardingTask>) => {
    if (!currentTask || saving) return;
    setSaving(true);
    try {
      const result = await collectionsApi.update('hr_onboarding_tasks', currentTask.key, patch);
      setData(previous => previous.map(task => task.key === currentTask.key ? result.data.record : task));
      message.success(patch.status === 'Đã hoàn thành' ? 'Đã nghiệm thu lộ trình hội nhập. Chữ ký hợp đồng được quản lý tại phân hệ Hợp đồng lao động.' : 'Đã lưu tiến độ hội nhập.');
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể lưu tiến độ hội nhập.'); }
    finally { setSaving(false); }
  };

  const updateChecklist = (key: OnboardingStep['key'], completed: boolean) => {
    if (!currentTask) return;
    const checklist = onboardingChecklist(currentTask).map(item => item.key === key ? { ...item, completed } : item);
    const progress = onboardingProgress(checklist);
    void updateTask({
      checklist, progress,
      laptopProvided: key === 'equipment' ? completed : currentTask.laptopProvided,
      emailCreated: key === 'equipment' ? completed : currentTask.emailCreated,
      currentStep: onboardingSteps.find(step => !checklist.find(item => item.key === step.key)?.completed)?.title || 'Chờ nghiệm thu hội nhập',
      status: currentTask.status === 'Đã hoàn thành' && progress < 100 ? 'Đang hội nhập' : currentTask.status,
    });
  };

  const toggleCustomTask = (taskId: string, completed: boolean) => {
    if (!currentTask) return;
    const customTasks = (currentTask.customTasks || []).map(task =>
      task.id === taskId ? { ...task, completed, completedAt: completed ? new Date().toISOString() : undefined } : task
    );
    void updateTask({ customTasks });
  };

  const handleAddCustomTask = () => {
    if (!currentTask) return;
    if (!taskName?.trim()) {
      message.warning('Vui lòng chọn tên công việc.');
      return;
    }
    const newTask: OnboardingCustomTask = {
      id: `task-${Date.now()}`,
      title: taskName,
      assigneeType,
      assignedTo: assigneeType === 'Bộ phận khác' ? otherAssignee : undefined,
      workType,
      description: taskDesc.trim(),
      deadline: taskDeadline,
      allowEmployeeTrack: allowTrack,
      completed: false,
    };
    const customTasks = [...(currentTask.customTasks || []), newTask];
    void updateTask({ customTasks });
    setTaskModalOpen(false);
    setTaskDesc('');
    setTaskDeadline('');
    message.success(`Đã thêm công việc: ${taskName}`);
  };

  const handleSendNote = () => {
    if (!currentTask || !newNoteText.trim()) return;
    const newNote = {
      id: `note-${Date.now()}`,
      author: 'HR Quản trị',
      content: newNoteText.trim(),
      createdAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString('vi-VN'),
    };
    const notes = [newNote, ...(currentTask.notes || [])];
    void updateTask({ notes });
    setNewNoteText('');
  };

  const finishOnboarding = () => {
    if (!currentTask || onboardingProgress(onboardingChecklist(currentTask)) < 100) { message.error('Cần hoàn thành cả 5 giai đoạn trước khi nghiệm thu.'); return; }
    if (!reviewNotes.trim()) { message.error('Vui lòng nhập kết quả đánh giá trước khi nghiệm thu.'); return; }
    void updateTask({ status: 'Đã hoàn thành', reviewNotes: reviewNotes.trim() });
  };

  const exportReport = () => {
    downloadFile(`Bao_cao_hoi_nhap_${new Date().toISOString().slice(0, 10)}.xlsx`, generateValidXlsxBlob([
      ['Mã nhân viên', 'Họ tên', 'Vị trí', 'Phòng ban', 'Mentor', 'Ngày bắt đầu', 'Ngày đánh giá', 'Tiến độ', 'Trạng thái', ...onboardingSteps.map(step => step.title), 'Kết quả đánh giá'],
      ...filteredData.map(task => [task.empCode, task.employeeName, task.position, task.department, task.mentor, task.startDate, task.evaluationDate, task.progress, task.status, ...onboardingChecklist(task).map(item => item.completed ? 'Đã hoàn thành' : 'Chưa hoàn thành'), task.reviewNotes || '']),
    ]));
    message.success('Đã tải báo cáo hội nhập theo bộ lọc hiện tại.');
  };

  const showTask = (task: EnterpriseOnboardingTask) => {
    setSelectedTask(task); setReviewNotes(task.reviewNotes || ''); setDrawerOpen(true);
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.position || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.mentor || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  // Lọc danh sách nhân viên ứng viên trong Modal Ảnh 1
  const poolEmployees = employees.length > 0 ? employees : SAMPLE_CANDIDATE_EMPLOYEES;
  const candidateList = poolEmployees.filter(emp => {
    const name = (emp.name || (emp as any).fullName || '').toLowerCase();
    const code = (emp.employeeCode || emp.code || '').toLowerCase();
    const dept = (emp.department || '').toLowerCase();
    const pos = (emp.position || '').toLowerCase();
    const query = candidateSearch.toLowerCase().trim();

    const matchSearch = !query || name.includes(query) || code.includes(query) || dept.includes(query) || pos.includes(query);
    const matchDept = !candidateDept || emp.department === candidateDept;
    return matchSearch && matchDept;
  });

  // Cột cho bảng Modal Ảnh 1 (Thêm nhân viên hội nhập)
  const candidateColumns = [
    {
      title: 'Mã nhân viên',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (_: any, record: EnterpriseEmployee) => (
        <span style={{ fontWeight: 600, color: '#334155' }}>
          {record.employeeCode || record.code || '-'}
        </span>
      ),
    },
    {
      title: (
        <span>
          <PushpinOutlined style={{ marginRight: 6, color: '#64748B' }} />
          Họ và tên
        </span>
      ),
      dataIndex: 'name',
      key: 'name',
      render: (_: any, record: EnterpriseEmployee) => {
        const name = record.name || (record as any).fullName || '';
        const initials = name
          .split(' ')
          .filter(Boolean)
          .slice(-2)
          .map(w => w[0]?.toUpperCase())
          .join('') || 'NN';
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                backgroundColor: '#10B981',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 11,
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
            <span style={{ fontWeight: 600, color: '#0F172A' }}>{name}</span>
          </div>
        );
      },
    },
    {
      title: 'Đơn vị công tác',
      dataIndex: 'department',
      key: 'department',
      render: (dept: string) => dept || '-',
    },
    {
      title: 'Vị trí công việc',
      dataIndex: 'position',
      key: 'position',
      render: (pos: string) => pos || '-',
    },
    {
      title: 'Ngày thử việc',
      dataIndex: 'joinDate',
      key: 'joinDate',
      render: (_: any, record: EnterpriseEmployee) => record.joinDate || (record as any).probationDate || '-',
    },
  ];

  const columns = [
    {
      title: 'Nhân sự mới & Vị trí',
      key: 'name',
      render: (_: any, record: EnterpriseOnboardingTask) => {
        const initials = (record.employeeName || '')
          .split(' ')
          .filter(Boolean)
          .slice(-2)
          .map(w => w[0]?.toUpperCase())
          .join('') || 'NN';
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                backgroundColor: '#10B981',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>
                {record.employeeName}
              </div>
              <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, marginTop: 2 }}>
                Mã: <code>{record.empCode}</code> · {record.position}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Khối phòng ban & Mentor',
      key: 'mentor',
      width: 220,
      render: (_: any, record: EnterpriseOnboardingTask) => (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#2563EB' }}>{record.mentor}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>{record.department}</div>
        </div>
      ),
    },
    {
      title: 'Tiến độ hội nhập 60 ngày',
      key: 'progress',
      width: 190,
      render: (_: any, record: EnterpriseOnboardingTask) => (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 2 }}>
            <span>Checklist hoàn tất:</span>
            <strong style={{ color: record.progress === 100 ? '#16A34A' : '#009688' }}>{record.progress}%</strong>
          </div>
          <Progress percent={record.progress} size="small" strokeColor={record.progress === 100 ? '#16A34A' : '#009688'} showInfo={false} />
        </div>
      ),
    },
    {
      title: 'Thời gian thử việc',
      key: 'dates',
      width: 170,
      render: (_: any, record: EnterpriseOnboardingTask) => (
        <div style={{ fontSize: 11.5 }}>
          <div>Bắt đầu: <strong>{record.startDate}</strong></div>
          <div style={{ color: '#64748B' }}>Đánh giá: <strong>{record.evaluationDate}</strong></div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => {
        let color = 'default';
        if (status === 'Đang hội nhập') color = 'processing';
        if (status === 'Đã hoàn thành') color = 'success';
        if (status === 'Cần hỗ trợ') color = 'error';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 120,
      render: (_: any, record: EnterpriseOnboardingTask) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => showTask(record)}
        >
          Checklist
        </Button>
      ),
    },
  ];

  // Tính toán số lượng task chi tiết
  const totalCustomTasks = selectedTask?.customTasks?.length || 0;
  const completedCustomTasks = selectedTask?.customTasks?.filter(t => t.completed).length || 0;
  const pendingCustomTasks = totalCustomTasks - completedCustomTasks;

  const filteredCustomTasks = (selectedTask?.customTasks || []).filter(t => {
    if (taskFilterTab === 'completed') return t.completed;
    if (taskFilterTab === 'pending') return !t.completed;
    return true;
  });

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {loadError && <div role="alert" style={{ color: '#DC2626', marginBottom: 12 }}>{loadError} <Button size="small" onClick={() => void loadData()}>Tải lại</Button></div>}
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhân sự mới tiếp nhận Onboarding</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} Nhân sự
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Theo dõi 5 giai đoạn hội nhập và ngày đánh giá đã đăng ký</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đang trong lộ trình thử việc</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {ongoingCount} Nhân viên mới
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>{data.filter(task => task.status === 'Cần hỗ trợ').length} lộ trình cần hỗ trợ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã nghiệm thu lộ trình hội nhập</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {completedCount} Nhân sự
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Chữ ký hợp đồng được theo dõi tại Hợp đồng lao động</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ lộ trình đã nghiệm thu</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            {data.length ? `${Math.round(completedCount / data.length * 100)}%` : 'Chưa có dữ liệu'}
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Tính trên các lộ trình được lưu trong hệ thống</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả tân tuyển' },
            { key: 'Đang hội nhập', label: 'Đang hội nhập', icon: <RocketOutlined style={{ color: '#6366F1' }} /> },
            { key: 'Đã hoàn thành', label: 'Đã hoàn thành', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'Cần hỗ trợ', label: 'Cần hỗ trợ', icon: <WarningOutlined style={{ color: '#F59E0B' }} /> },
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
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo tên, phòng ban, Mentor..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={exportReport} disabled={loading || !!loadError}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingTask(null);
              setSelectedEmpKeys([]);
              setCandidateSearch('');
              setCandidateDept('');
              form.resetFields();
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Tiếp nhận nhân sự mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} loading={loading} />
      </div>

      {/* GIAO DIỆN ẢNH 1: MODAL DIALOG "Thêm nhân viên hội nhập" */}
      <Modal
        title="Thêm nhân viên hội nhập"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={780}
        style={{ top: 50, maxWidth: '95vw' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Thanh công cụ tìm kiếm và lọc bên trong Dialog */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
              placeholder="Tìm kiếm"
              value={candidateSearch}
              onChange={e => setCandidateSearch(e.target.value)}
              style={{ width: 200 }}
              allowClear
            />
            <Select
              placeholder="Tất cả đơn vị"
              value={candidateDept || undefined}
              onChange={val => setCandidateDept(val || '')}
              allowClear
              style={{ width: 190 }}
              options={[{ label: 'Tất cả đơn vị', value: '' }, ...deptOptions]}
            />
            <Button icon={<FilterOutlined />} style={{ color: '#64748B' }} />
          </div>

          {/* Bảng dữ liệu nhân viên ứng viên theo đúng Ảnh 1 (không có border bao quanh, không có thanh thẳng kẻ chia) */}
          {modalOpen && (
            <KTable
              dataSource={candidateList}
              columns={candidateColumns}
              rowKey={(record: any) => record.id || record.userId || record.employeeCode || record.code}
              pagination={{ pageSize: 50 }}
              rowSelection={{
                selectedRowKeys: selectedEmpKeys,
                onChange: (keys: any) => setSelectedEmpKeys(keys),
              }}
            />
          )}

          {/* Form handler hoàn toàn không có children để không hiển thị bất kỳ khung nào ra ngoài */}
          <Form form={form} onFinish={handleCreate} style={{ display: 'none' }} />

          {/* Chân Dialog */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 13, color: '#475569' }}>
              Tổng số: <strong>{candidateList.length}</strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Button onClick={() => setModalOpen(false)}>
                Hủy
              </Button>
              <Button
                type="primary"
                onClick={handleSaveCandidates}
                loading={saving}
                style={{ backgroundColor: '#00887A', borderColor: '#00887A' }}
              >
                Lưu
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* GIAO DIỆN ẢNH 2: DRAWER / MODAL "Chi tiết nhân viên hội nhập" */}
      <Drawer
        title={null}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={940}
        bodyStyle={{ padding: 0 }}
      >
        {selectedTask && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Top Bar Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #E2E8F0', background: '#FFFFFF' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                Chi tiết nhân viên hội nhập
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => void updateTask({ status: 'Đã hoàn thành', progress: 100 })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 20,
                    border: '1px solid #A7F3D0',
                    background: selectedTask.status === 'Đã hoàn thành' ? '#10B981' : '#ECFDF5',
                    color: selectedTask.status === 'Đã hoàn thành' ? '#FFFFFF' : '#059669',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <CheckCircleFilled />
                  <span>Hoàn thành</span>
                </button>

                <button
                  type="button"
                  onClick={() => void updateTask({ status: 'Đang hội nhập' })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 20,
                    border: '1px solid #FECACA',
                    background: selectedTask.status === 'Đang hội nhập' ? '#F43F5E' : '#FFF1F2',
                    color: selectedTask.status === 'Đang hội nhập' ? '#FFFFFF' : '#E11D48',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <CloseCircleFilled />
                  <span>Chưa hoàn thành</span>
                </button>

                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  onClick={() => setDrawerOpen(false)}
                  style={{ color: '#64748B', marginLeft: 8 }}
                />
              </div>
            </div>

            {/* Main Content Layout: Cột trái & Cột phải */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* CỘT TRÁI: THÔNG TIN NHÂN SỰ & GHI CHÚ */}
              <div style={{ width: 330, borderRight: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: 16, gap: 14 }}>
                {/* Khối hồ sơ tóm tắt */}
                <div style={{ background: '#FFFFFF', borderRadius: 8, padding: 14, border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        backgroundColor: '#10B981',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 14,
                        flexShrink: 0,
                      }}
                    >
                      {(selectedTask.employeeName || '').split(' ').filter(Boolean).slice(-2).map(w => w[0]?.toUpperCase()).join('') || 'NN'}
                    </div>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>
                        {selectedTask.employeeName} ({selectedTask.empCode})
                      </div>
                      <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
                        {selectedTask.department || 'CÔNG TY TNHH XÂY DỰNG KINH SỞ'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Danh sách thông số có icon */}
                <div style={{ background: '#FFFFFF', borderRadius: 8, padding: 14, border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748B', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CalendarOutlined style={{ color: '#2563EB' }} /> Ngày thử việc
                    </span>
                    <strong>{selectedTask.startDate || '-'}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748B', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CalendarOutlined style={{ color: '#2563EB' }} /> Ngày chính thức
                    </span>
                    <strong>{selectedTask.evaluationDate || '-'}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748B', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ClockCircleOutlined style={{ color: '#009688' }} /> Thời gian làm việc
                    </span>
                    <span>Toàn thời gian</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748B', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <BarChartOutlined style={{ color: '#7C3AED' }} /> Bậc
                    </span>
                    <span>-</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748B', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <UserOutlined style={{ color: '#2563EB' }} /> Quản lý trực tiếp
                    </span>
                    <strong>{selectedTask.mentor || '-'}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748B', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CustomerServiceOutlined style={{ color: '#D97706' }} /> Nhân sự khai thác
                    </span>
                    <span>{selectedTask.mentorPhone || '-'}</span>
                  </div>
                </div>

                {/* Khối Ghi chú bên góc trái */}
                <div style={{ background: '#FFFFFF', borderRadius: 8, padding: 14, border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
                    Ghi chú
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        backgroundColor: '#10B981',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 10,
                        flexShrink: 0,
                      }}
                    >
                      NN
                    </div>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        type="text"
                        placeholder="Enter để gửi"
                        value={newNoteText}
                        onChange={e => setNewNoteText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSendNote(); }}
                        style={{
                          width: '100%',
                          padding: '6px 44px 6px 10px',
                          border: '1px solid #CBD5E1',
                          borderRadius: 6,
                          fontSize: 12,
                          boxSizing: 'border-box',
                        }}
                      />
                      <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 4 }}>
                        <button type="button" onClick={() => message.info('Chọn tệp đính kèm')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B', padding: 2 }}>
                          <PaperClipOutlined />
                        </button>
                        <button type="button" onClick={handleSendNote} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#2563EB', padding: 2 }}>
                          <SendOutlined />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Danh sách ghi chú */}
                  <div style={{ marginTop: 6, minHeight: 60, maxHeight: 150, overflowY: 'auto' }}>
                    {selectedTask.notes && selectedTask.notes.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {selectedTask.notes.map(n => (
                          <div key={n.id} style={{ background: '#F1F5F9', padding: '6px 8px', borderRadius: 6, fontSize: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B', fontSize: 10.5 }}>
                              <strong>{n.author}</strong>
                              <span>{n.createdAt}</span>
                            </div>
                            <div style={{ color: '#1E293B', marginTop: 2 }}>{n.content}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: 12, padding: '16px 0' }}>
                        Không có dữ liệu
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* CỘT PHẢI: DANH SÁCH CÔNG VIỆC & CHECKLIST */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: 18, gap: 14 }}>
                {/* 5 GIAI ĐOẠN HỘI NHẬP BẮT BUỘC ĐƯỢC ĐẶT TRƯỚC HẾT (ĐẢM BẢO TEST & NGHIỆP VỤ) */}
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                    Checklist 5 Giai Đoạn Onboarding Bắt Buộc:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                    {onboardingSteps.map(step => {
                      const item = onboardingChecklist(selectedTask).find(value => value.key === step.key)!;
                      return (
                        <div key={step.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <Checkbox checked={item.completed} disabled={saving || !selectedTask.employeeId} onChange={event => updateChecklist(step.key, event.target.checked)} aria-label={step.title} />
                          <div>
                            <strong>{step.title}</strong>
                            <div style={{ fontSize: 11.5, color: '#64748B' }}>{step.description}</div>
                            {item.completedAt && <div style={{ fontSize: 11, color: '#16A34A' }}>Xác nhận: {new Date(item.completedAt).toLocaleString('vi-VN')}{item.completedBy ? ` · ${item.completedBy}` : ''}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Header danh sách công việc & Tiến độ */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                      Danh sách công việc
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                      Đã hoàn thành: <strong>{selectedTask.progress}%</strong>
                    </div>
                  </div>
                  <Progress percent={selectedTask.progress} size="small" strokeColor="#2563EB" showInfo={false} />
                </div>

                {/* Thanh công cụ: Tabs bộ lọc và nút "+ Thêm công việc" */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderBottom: '1px solid #E2E8F0', paddingBottom: 10 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setTaskFilterTab('all')}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 16,
                        border: '1px solid ' + (taskFilterTab === 'all' ? '#2563EB' : '#E2E8F0'),
                        background: taskFilterTab === 'all' ? '#2563EB' : '#FFFFFF',
                        color: taskFilterTab === 'all' ? '#FFFFFF' : '#475569',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Tất cả {totalCustomTasks}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskFilterTab('pending')}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 16,
                        border: '1px solid ' + (taskFilterTab === 'pending' ? '#2563EB' : '#E2E8F0'),
                        background: taskFilterTab === 'pending' ? '#2563EB' : '#FFFFFF',
                        color: taskFilterTab === 'pending' ? '#FFFFFF' : '#475569',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Chưa hoàn thành {pendingCustomTasks}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskFilterTab('completed')}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 16,
                        border: '1px solid ' + (taskFilterTab === 'completed' ? '#2563EB' : '#E2E8F0'),
                        background: taskFilterTab === 'completed' ? '#2563EB' : '#FFFFFF',
                        color: taskFilterTab === 'completed' ? '#FFFFFF' : '#475569',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Đã hoàn thành {completedCustomTasks}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setTaskName(ONBOARDING_TASK_NAMES[0]);
                      setAssigneeType('Nhân viên');
                      setOtherAssignee('');
                      setWorkType('Thực hiện trên ứng dụng');
                      setTaskDesc('');
                      setTaskDeadline('');
                      setAllowTrack(true);
                      setTaskModalOpen(true);
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#2563EB',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <PlusOutlined /> Thêm công việc
                  </button>
                </div>

                {/* Danh sách các công việc đã thêm */}
                {filteredCustomTasks.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filteredCustomTasks.map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 6 }}>
                        <input
                          type="checkbox"
                          checked={!!t.completed}
                          onChange={e => toggleCustomTask(t.id, e.target.checked)}
                          style={{ marginTop: 3, accentColor: '#2563EB', cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: t.completed ? '#94A3B8' : '#0F172A', textDecoration: t.completed ? 'line-through' : 'none' }}>
                            {t.title}
                          </div>
                          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            <span>Đối tượng: <strong>{t.assigneeType}{t.assignedTo ? ` (${t.assignedTo})` : ''}</strong></span>
                            <span>Loại: <strong>{t.workType}</strong></span>
                            {t.deadline && <span>Hạn: <strong>{t.deadline}</strong></span>}
                          </div>
                          {t.description && <div style={{ fontSize: 11.5, color: '#475569', marginTop: 4, background: '#F8FAFC', padding: 6, borderRadius: 4 }}>{t.description}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : totalCustomTasks === 0 ? (
                  /* Khối Chưa có dữ liệu theo đúng Ảnh 2 */
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '30px 0', color: '#94A3B8' }}>
                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                      <SearchOutlined style={{ fontSize: 36, color: '#3B82F6' }} />
                    </div>
                    <div style={{ fontSize: 13, color: '#64748B' }}>Chưa có dữ liệu</div>
                  </div>
                ) : null}

                {/* Đánh giá & Nghiệm thu */}
                <div>
                  <label htmlFor="onboarding-review-notes" style={{ display: 'block', marginBottom: 6, fontSize: 12.5, fontWeight: 600, color: '#334155' }}>
                    Kết quả đánh giá / nội dung cần hỗ trợ
                  </label>
                  <Input.TextArea id="onboarding-review-notes" rows={3} maxLength={4000} value={reviewNotes} onChange={event => setReviewNotes(event.target.value)} disabled={saving} />
                </div>
                {selectedTask.supportNote && <div style={{ color: '#B45309', fontSize: 12 }}>Nội dung đã yêu cầu hỗ trợ: {selectedTask.supportNote}</div>}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  <Button disabled={saving || !selectedTask.employeeId} onClick={() => void updateTask({ reviewNotes })}>
                    Lưu đánh giá
                  </Button>
                  {selectedTask.status === 'Cần hỗ trợ' ? (
                    <Button disabled={saving || !selectedTask.employeeId} onClick={() => void updateTask({ status: 'Đang hội nhập' })}>
                      Tiếp tục lộ trình
                    </Button>
                  ) : selectedTask.status !== 'Đã hoàn thành' && (
                    <Button disabled={saving || !selectedTask.employeeId} onClick={() => { if (!reviewNotes.trim()) { message.error('Vui lòng nhập nội dung cần hỗ trợ.'); return; } void updateTask({ status: 'Cần hỗ trợ', supportNote: reviewNotes.trim() }); }}>
                      Yêu cầu hỗ trợ
                    </Button>
                  )}
                  {selectedTask.status !== 'Đã hoàn thành' && (
                    <Button type="primary" icon={<CheckOutlined />} loading={saving} disabled={onboardingProgress(onboardingChecklist(selectedTask)) < 100 || !selectedTask.employeeId} onClick={finishOnboarding} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                      Nghiệm thu hội nhập
                    </Button>
                  )}
                  <Button onClick={() => navigate('/admin/hr/contracts')}>
                    Mở hợp đồng lao động / Ký HĐLĐ
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* GIAO DIỆN ẢNH 3 & 4: MODAL "Thêm công việc" */}
      <Modal
        title="Thêm công việc"
        open={taskModalOpen}
        onCancel={() => setTaskModalOpen(false)}
        footer={null}
        width={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Trường 1: Tên công việc */}
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Tên công việc <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <Select
                value={taskName}
                onChange={val => setTaskName(val)}
                style={{ flex: 1 }}
                options={ONBOARDING_TASK_NAMES.map(name => ({ label: name, value: name }))}
              />
              <Button icon={<EllipsisOutlined />} style={{ color: '#64748B' }} />
            </div>
          </div>

          {/* Trường 2: Đối tượng thực hiện */}
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Đối tượng thực hiện <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
              {(['Nhân viên', 'Quản lý trực tiếp', 'Bộ phận khác'] as const).map(opt => (
                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: '#1E293B' }}>
                  <input
                    type="radio"
                    name="assigneeType"
                    checked={assigneeType === opt}
                    onChange={() => setAssigneeType(opt)}
                    style={{ accentColor: '#2563EB', cursor: 'pointer' }}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>

            {/* Khi chọn "Bộ phận khác" -> hiển thị ô chọn như Ảnh 4 */}
            {assigneeType === 'Bộ phận khác' && (
              <div style={{ marginTop: 8 }}>
                <Select
                  showSearch
                  placeholder="Chọn nhân sự hoặc bộ phận thực hiện"
                  value={otherAssignee || undefined}
                  onChange={val => setOtherAssignee(val)}
                  style={{ width: '100%' }}
                  options={(employees.length > 0 ? employees : SAMPLE_CANDIDATE_EMPLOYEES).map(emp => ({
                    value: emp.name || (emp as any).fullName || emp.id,
                    label: `${(emp.name || (emp as any).fullName)} (${emp.employeeCode || emp.code || 'NV'})`,
                  }))}
                />
              </div>
            )}
          </div>

          {/* Trường 3: Loại công việc */}
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Loại công việc <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <Select
              value={workType}
              onChange={val => setWorkType(val)}
              style={{ width: '100%' }}
              options={ONBOARDING_WORK_TYPES.map(type => ({ label: type, value: type }))}
            />
          </div>

          {/* Trường 4: Nhiệm vụ */}
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Nhiệm vụ <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                type="button"
                onClick={() => message.info('Chọn ứng dụng và hành động thực hiện trong hệ thống')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid #BFDBFE',
                  background: '#EFF6FF',
                  color: '#2563EB',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: 'fit-content',
                }}
              >
                <PlusOutlined style={{ fontSize: 11 }} /> Thêm ứng dụng - hành động thực hiện
              </button>

              <Input.TextArea
                rows={3}
                placeholder="Nhập mô tả/hướng dẫn chi tiết cho nhiệm vụ"
                value={taskDesc}
                onChange={e => setTaskDesc(e.target.value)}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => message.info('Tính năng tải file đính kèm')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    border: 'none',
                    background: 'transparent',
                    color: '#2563EB',
                    fontSize: 12.5,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <UploadOutlined /> Đính kèm file
                </button>
              </div>
            </div>
          </div>

          {/* Trường 5: Hạn hoàn thành */}
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Hạn hoàn thành <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <Input
              type="date"
              value={taskDeadline}
              onChange={e => setTaskDeadline(e.target.value)}
              placeholder="DD/MM/YYYY"
            />
          </div>

          {/* Trường 6: Cho phép nhân viên theo dõi công việc */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={allowTrack}
                onChange={e => setAllowTrack(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: allowTrack ? '#2563EB' : '#CBD5E1',
                  borderRadius: 20,
                  transition: '0.2s',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    content: '""',
                    height: 14,
                    width: 14,
                    left: allowTrack ? 19 : 3,
                    bottom: 3,
                    backgroundColor: '#FFFFFF',
                    borderRadius: '50%',
                    transition: '0.2s',
                  }}
                />
              </span>
            </label>
            <span style={{ fontSize: 12.5, color: '#334155' }}>Cho phép nhân viên theo dõi công việc</span>
          </div>

          {/* Footer Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid #E2E8F0' }}>
            <Button onClick={() => setTaskModalOpen(false)}>
              Hủy
            </Button>
            <Button
              type="primary"
              onClick={handleAddCustomTask}
              style={{ backgroundColor: '#2563EB', borderColor: '#2563EB' }}
            >
              Lưu
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
