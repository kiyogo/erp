import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  CheckCircleOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  CommentOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  PaperClipOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SendOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Form, Input, Modal, Progress, Select, Spin, Tag, Upload, message } from '../../custom-ui';
import { EnterpriseTask, TaskAssignee, TaskPriority, TaskReportAttachment, tasksApi, filesApi, collectionsApi, employeesApi } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { dataService } from '../../services/dataService';
import { formatFileSize, getFileBlob, storeFileBlob } from '../../utils/fileStorage';

const priorityColor = (priority: TaskPriority) => (
  priority === 'Khẩn cấp' ? 'error' : priority === 'Cao' ? 'warning' : priority === 'Trung bình' ? 'processing' : 'default'
);

const statusColor = (status: EnterpriseTask['status']) => (
  status === 'Hoàn thành' ? 'success' : status === 'Chờ nghiệm thu' ? 'warning' : status === 'Đang thực hiện' ? 'processing' : status === 'Tạm dừng' ? 'error' : 'default'
);

const cleanDashes = (value?: string): string => {
  if (!value) return '';
  return String(value).replace(/[—–]/g, '').trim();
};

const renderTime = (value?: string): string => {
  if (!value) return '';
  const str = String(value).trim();
  if (!str || str === '—' || str === '–' || str === '-' || str.includes('—') || str.includes('–')) return '';
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.replace('T', ' ').slice(0, 16);
  }
  return '';
};

const getReportAttachments = (report: any): TaskReportAttachment[] => {
  if (!report) return [];
  let atts: any = report.attachments;
  if (typeof atts === 'string') {
    try {
      atts = JSON.parse(atts);
    } catch {
      atts = [];
    }
  }
  if (!Array.isArray(atts) || atts.length === 0) {
    if (report.attachmentsJson) {
      try {
        const parsed = JSON.parse(report.attachmentsJson);
        if (Array.isArray(parsed)) atts = parsed;
      } catch {}
    } else if (Array.isArray(report.files)) {
      atts = report.files;
    } else if (report.file) {
      atts = [report.file];
    }
  }
  if (!Array.isArray(atts)) return [];
  return atts.map((item: any, idx: number) => ({
    id: String(item.id || item.key || `att-${idx}`),
    key: String(item.key || item.id || `att-${idx}`),
    name: String(item.name || item.fileName || item.filename || item.title || `Tệp đính kèm ${idx + 1}`),
    size: Number(item.size || item.sizeBytes || 0),
    type: String(item.type || item.mimeType || 'application/octet-stream'),
  }));
};
const normalizeName = (value?: any) => (typeof value === 'string' ? value : String(value || '')).toLocaleLowerCase('vi-VN').replace(/\([^)]*\)/g, '').trim();

type TaskOrgUnit = {
  key?: string;
  code?: string;
  name: string;
  parentUnit?: string;
  manager?: string;
  status?: string;
};

const getEmpDepts = (emp: any): string[] => {
  if (!emp) return [];
  const raw = emp.department || emp.orgUnit || emp.departmentName || '';
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
};

const isEmpInUnit = (emp: any, unit: TaskOrgUnit): boolean => {
  if (!emp || !unit) return false;
  const depts = getEmpDepts(emp).map(normalizeName);
  const uName = normalizeName(unit.name);
  const uCode = normalizeName(unit.code || '');
  const uKey = normalizeName(unit.key || '');

  return depts.some((d) => {
    return (
      d === uName ||
      (uCode && d === uCode) ||
      (uKey && d === uKey) ||
      (uName && (d.includes(uName) || uName.includes(d))) ||
      (uCode && (d.includes(uCode) || uCode.includes(d)))
    );
  });
};

export const TasksModule: React.FC<{ mode?: 'admin' | 'employee' }> = ({ mode = 'admin' }) => {
  const location = useLocation();
  const isEmployee = mode === 'employee' || location.pathname.startsWith('/employee');
  const { user } = useAuth();
  const [tasks, setTasks] = useState<EnterpriseTask[]>([]);
  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [allReportsModalOpen, setAllReportsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<EnterpriseTask | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [reportContent, setReportContent] = useState('');
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const [reportProgress, setReportProgress] = useState('0');
  const [reportStatus, setReportStatus] = useState<EnterpriseTask['status']>('Chưa bắt đầu');
  const [previewAttachment, setPreviewAttachment] = useState<TaskReportAttachment | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | undefined>();
  const [orgUnits, setOrgUnits] = useState<TaskOrgUnit[]>([]);
  const [localEmployees, setLocalEmployees] = useState<any[]>([]);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  // 1. Các đơn vị mà tài khoản hiện tại trực tiếp làm Trưởng đơn vị
  const directManagedUnits = useMemo(() => {
    const currentName = normalizeName(user?.name || '');
    const currentCode = String((user as any)?.employeeCode || (user as any)?.code || '').trim().toLowerCase();
    const currentId = String(user?.id || '').trim();
    const userDept = normalizeName((user as any)?.department || '');

    return orgUnits.filter((unit) => {
      const mgr = normalizeName(unit.manager);
      const isMgr = mgr && mgr !== 'chưa phân công' && (
        mgr === currentName ||
        mgr.includes(currentName) ||
        currentName.includes(mgr) ||
        (currentCode && (mgr === currentCode || mgr.includes(currentCode))) ||
        (currentId && (mgr === currentId || mgr.includes(currentId)))
      );

      if (isMgr) return true;

      // Nếu tên đơn vị trùng phòng ban của user và user có chức danh quản lý
      if (userDept && (normalizeName(unit.name) === userDept || normalizeName(unit.code || '') === userDept)) {
        const pos = normalizeName((user as any)?.position || '');
        if (pos.includes('trưởng') || pos.includes('giám đốc') || pos.includes('lead') || pos.includes('quản lý') || pos.includes('head')) {
          return true;
        }
      }

      return false;
    });
  }, [orgUnits, user]);

  // 2. Các đơn vị cấp dưới (Sub-units có parentUnit thuộc directManagedUnits)
  const childManagedUnits = useMemo(() => {
    if (directManagedUnits.length === 0) return [];
    const directNames = new Set(directManagedUnits.map((u) => normalizeName(u.name)));
    const directCodes = new Set(directManagedUnits.map((u) => normalizeName(u.code || '')).filter(Boolean));
    return orgUnits.filter((unit) => {
      if (!unit.parentUnit) return false;
      const normParent = normalizeName(unit.parentUnit);
      return (
        (directNames.has(normParent) || directCodes.has(normParent)) &&
        !directNames.has(normalizeName(unit.name))
      );
    });
  }, [directManagedUnits, orgUnits]);

  // 3. Toàn bộ các đơn vị thuộc phạm vi quản lý của Trưởng đơn vị
  const allManagedUnits = useMemo(() => {
    const combined = [...directManagedUnits, ...childManagedUnits];
    const map = new Map<string, TaskOrgUnit>();
    combined.forEach((u) => map.set(u.name, u));
    return Array.from(map.values());
  }, [directManagedUnits, childManagedUnits]);

  const isUnitManager = directManagedUnits.length > 0;

  // 4. Các đơn vị khả dụng để chọn trong dropdown:
  // Khi ở employee/tasks: CHỈ HIỆN KHI CÓ ĐƠN VỊ DƯỚI CẤP (childManagedUnits)
  const availableUnits = useMemo(() => {
    if (!isEmployee) return orgUnits;
    if (childManagedUnits.length > 0) return childManagedUnits;

    const userDept = ((user as any)?.department || '').trim().toLowerCase();
    const isTopExecutive = userDept.includes('giám đốc') || userDept.includes('quản trị') || userDept.includes('ban điều hành');
    if (isTopExecutive && orgUnits.length > 0) {
      return orgUnits;
    }

    // Không có đơn vị cấp dưới -> không hiện ô chọn Đơn vị
    return [];
  }, [isEmployee, childManagedUnits, orgUnits, user]);

  const canCreateTask = true;

  const loadData = async () => {
    setLoading(true);
    let employeeRows: any[] = [];
    try {
      const employeeResponse = await employeesApi.getAll();
      employeeRows = Array.isArray(employeeResponse?.data?.data) ? employeeResponse.data.data : [];
    } catch {}

    if (!employeeRows || employeeRows.length === 0) {
      const cached = dataService.getGenericData('hr_employees');
      if (Array.isArray(cached) && cached.length > 0) {
        employeeRows = cached;
      } else {
        employeeRows = dataService.getEmployees();
      }
    }
    const activeEmployeeRows = employeeRows.filter((employee) => employee?.role !== 'ADMIN' && employee?.status !== 'Đã nghỉ việc');
    setLocalEmployees(activeEmployeeRows);

    let savedUnits: any[] = [];
    try {
      const unitResponse = await collectionsApi.get<TaskOrgUnit>('business_org_units', { limit: 500, sort: 'name', order: 'asc' });
      savedUnits = Array.isArray(unitResponse?.data?.data) ? unitResponse.data.data : [];
    } catch {}

    if (!savedUnits || savedUnits.length === 0) {
      const fallback = dataService.getGenericData('business_org_units');
      if (Array.isArray(fallback) && fallback.length > 0) {
        savedUnits = fallback;
      }
    }
    if (!savedUnits || savedUnits.length === 0) {
      savedUnits = (dataService.getOrgUnits() as any[]) || [];
    }

    const unitNamesFromEmployees = activeEmployeeRows.map((employee) => String(employee.department || '').trim()).filter(Boolean);
    const unitsByName = new Map<string, TaskOrgUnit>();
    savedUnits.forEach((unit: any) => {
      const name = String(unit?.name || '').trim();
      if (name && unit?.status !== 'Tạm ngưng') {
        unitsByName.set(name, {
          key: unit.key,
          code: unit.code,
          name,
          parentUnit: unit.parentUnit ? String(unit.parentUnit).trim() : undefined,
          manager: unit.manager,
          status: unit.status || 'Đang hoạt động',
        });
      }
    });
    unitNamesFromEmployees.forEach((name) => {
      if (!unitsByName.has(name)) unitsByName.set(name, { name, status: 'Đang hoạt động' });
    });
    setOrgUnits(Array.from(unitsByName.values()).sort((left, right) => left.name.localeCompare(right.name, 'vi')));

    const allEmployees = activeEmployeeRows.map((employee) => ({
      id: employee.id || employee.userId || employee.code,
      name: employee.name || employee.fullName,
      employeeCode: employee.employeeCode || employee.code,
      department: employee.department || '',
      position: employee.position || '',
      role: 'USER' as const,
    }));

    try {
      const taskResponse = await tasksApi.getAll();
      if (Array.isArray(taskResponse?.data?.data)) {
        setTasks(taskResponse.data.data);
      } else {
        setTasks(dataService.getEnterpriseTasks());
      }
    } catch {
      setTasks(dataService.getEnterpriseTasks());
    }

    try {
      const assigneeResponse = await tasksApi.getAssignees();
      const apiList = Array.isArray(assigneeResponse?.data?.data)
        ? assigneeResponse.data.data.filter((person) => person?.role !== 'ADMIN')
        : [];
      const combinedById = new Map<string, TaskAssignee>();
      apiList.forEach((person) => {
        const key = person.id || person.employeeCode;
        if (key) combinedById.set(key, person);
      });
      allEmployees.forEach((employee) => {
        const key = employee.id || employee.employeeCode;
        if (!key) return;
        combinedById.set(key, { ...combinedById.get(key), ...employee });
      });
      const combined = Array.from(combinedById.values())
        .filter((person) => person.id && person.name && person.employeeCode)
        .sort((left, right) => left.name.localeCompare(right.name, 'vi'));
      setAssignees(combined.length ? combined : allEmployees);
    } catch {
      setAssignees(allEmployees);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();

    const handleSync = () => {
      void loadData();
    };

    window.addEventListener('kiyovn_task_updated', handleSync);
    window.addEventListener('storage', handleSync);
    const unsub = dataService.subscribe(() => {
      void loadData();
    });

    return () => {
      window.removeEventListener('kiyovn_task_updated', handleSync);
      window.removeEventListener('storage', handleSync);
      unsub();
    };
  }, [isEmployee]);

  // Real-time polling via GET every 10 seconds for Trao đổi and Task updates
  useEffect(() => {
    if (!commentModalOpen && !drawerOpen) return;
    const taskId = selectedTask?.key || selectedTask?.id || selectedTask?.taskCode;
    if (!taskId) return;

    const pollTask = async () => {
      try {
        const response = await tasksApi.getOne(String(taskId));
        if (response?.data?.task) {
          const freshTask = response.data.task;
          setSelectedTask((current) => {
            if (!current) return freshTask;
            return { ...current, ...freshTask };
          });
          setTasks((current) =>
            current.map((item) =>
              item.key === freshTask.key || item.taskCode === freshTask.taskCode
                ? { ...item, ...freshTask }
                : item
            )
          );
        }
      } catch {
        const localTasks = dataService.getEnterpriseTasks();
        const found = localTasks.find((t) => t.key === taskId || t.taskCode === taskId);
        if (found) {
          setSelectedTask((current) => (current ? { ...current, ...found } : found));
        }
      }
    };

    const intervalId = setInterval(pollTask, 10000);
    return () => clearInterval(intervalId);
  }, [commentModalOpen, drawerOpen, selectedTask?.key, selectedTask?.id, selectedTask?.taskCode]);

  const allowedAssignees = useMemo(() => {
    if (!isEmployee) return assignees;

    // 1. Các đơn vị được quản lý (trực tiếp + cấp dưới)
    const myUnits = allManagedUnits.length > 0 ? allManagedUnits : directManagedUnits;
    const userDepts = getEmpDepts(user).map(normalizeName);
    const userName = normalizeName(user?.name || '');
    const userCode = String((user as any)?.employeeCode || (user as any)?.code || '').trim().toLowerCase();

    // Tập hợp tên và mã các đơn vị mà user quản lý hoặc thuộc về
    const userUnitNames = new Set<string>();
    myUnits.forEach((u) => {
      userUnitNames.add(normalizeName(u.name));
      if (u.code) userUnitNames.add(normalizeName(u.code));
    });
    userDepts.forEach((d) => userUnitNames.add(d));

    // 2. Lọc tất cả nhân sự thuộc các đơn vị được quản lý hoặc cùng phòng ban với user
    const unitEmployees = localEmployees.filter((emp) => {
      if (myUnits.some((u) => isEmpInUnit(emp, u))) return true;

      const empDepts = getEmpDepts(emp).map(normalizeName);
      if (empDepts.some((d) => userUnitNames.has(d) || userDepts.some((ud) => d === ud || d.includes(ud) || ud.includes(d)))) {
        return true;
      }

      const empName = normalizeName(emp.name || emp.fullName);
      const empCode = String(emp.employeeCode || emp.code || '').trim().toLowerCase();
      if (emp.id === user?.id || (userCode && empCode === userCode) || (userName && empName === userName)) {
        return true;
      }

      return false;
    });

    const mappedList: TaskAssignee[] = unitEmployees.map((emp) => ({
      id: emp.id || emp.userId || emp.code || emp.employeeCode || String(Date.now()),
      name: emp.name || emp.fullName || 'Nhân sự',
      employeeCode: emp.employeeCode || emp.code || emp.id || '',
      department: typeof emp.department === 'string' ? emp.department : Array.isArray(emp.department) ? emp.department.join(', ') : '',
      position: typeof emp.position === 'string' ? emp.position : Array.isArray(emp.position) ? emp.position.join(', ') : '',
      role: 'USER' as const,
    }));

    // Đảm bảo user hiện tại luôn có mặt
    const hasSelf = mappedList.some((p) => p.id === user?.id || normalizeName(p.name) === normalizeName(user?.name));
    if (!hasSelf && user) {
      mappedList.unshift({
        id: user.id || 'SELF',
        name: user.name || 'Tôi',
        employeeCode: (user as any).employeeCode || user.id || 'NV-000',
        department: (user as any).department || '',
        position: (user as any).position || 'Trưởng đơn vị',
        role: 'USER' as const,
      });
    }

    if (mappedList.length <= 1 && localEmployees.length > 0) {
      const fallbackEmps = localEmployees.filter((emp) => {
        const empDepts = getEmpDepts(emp).map(normalizeName);
        return userDepts.some((ud) => empDepts.some((d) => d.includes(ud) || ud.includes(d)));
      });
      if (fallbackEmps.length > 0) {
        return fallbackEmps.map((emp) => ({
          id: emp.id || emp.userId || emp.code || emp.employeeCode,
          name: emp.name || emp.fullName,
          employeeCode: emp.employeeCode || emp.code || emp.id,
          department: emp.department,
          position: emp.position,
          role: 'USER' as const,
        }));
      }
    }

    return mappedList.length > 0 ? mappedList : assignees;
  }, [isEmployee, allManagedUnits, directManagedUnits, localEmployees, assignees, user]);

  const getUnitManager = (unitName?: string): TaskAssignee | null => {
    if (!unitName) return null;
    const targetUnit = orgUnits.find((u) => normalizeName(u.name) === normalizeName(unitName) || u.name === unitName);
    const rawManagerName = targetUnit?.manager ? String(targetUnit.manager).trim() : '';

    if (rawManagerName && rawManagerName !== 'Chưa phân công') {
      const match = assignees.find((person) =>
        normalizeName(person.name) === normalizeName(rawManagerName) ||
        person.employeeCode === rawManagerName ||
        person.id === rawManagerName
      ) || localEmployees.find((emp) =>
        normalizeName(emp.name || emp.fullName) === normalizeName(rawManagerName) ||
        emp.employeeCode === rawManagerName ||
        emp.code === rawManagerName ||
        emp.id === rawManagerName
      );

      if (match) {
        return {
          id: match.id || match.userId || match.code,
          name: match.name || match.fullName,
          employeeCode: match.employeeCode || match.code || match.id,
          department: match.department || unitName,
          position: match.position || 'Trưởng đơn vị',
          role: 'USER' as const,
        };
      }
    }

    // If unit has employees, find the one with highest rank or position containing Trưởng / Giám đốc / Head / Lead
    const unitEmployees = localEmployees.filter((employee) => isEmpInUnit(employee, targetUnit || { name: unitName }));

    if (unitEmployees.length > 0) {
      const top = unitEmployees.find((e) => {
        const pos = String(e.position || '').toLowerCase();
        return pos.includes('trưởng') || pos.includes('giám đốc') || pos.includes('head') || pos.includes('lead');
      }) || unitEmployees[0];

      return {
        id: top.id || top.userId || top.code,
        name: top.name || top.fullName,
        employeeCode: top.employeeCode || top.code || top.id,
        department: top.department || unitName,
        position: top.position || 'Trưởng đơn vị',
        role: 'USER' as const,
      };
    }

    return null;
  };

  const assigneesForUnit = (unitName?: string) => {
    const base = isEmployee ? allowedAssignees : assignees;
    if (!unitName) return base;

    // 1. Khi ở mode Admin: chỉ hiện Trưởng đơn vị của đơn vị đã chọn
    if (!isEmployee) {
      const manager = getUnitManager(unitName);
      if (manager && manager.id) {
        return [manager];
      }
      return [];
    }

    // 2. Khi ở mode Employee (Trưởng đơn vị giao việc):
    const isChildUnit = childManagedUnits.some((u) => normalizeName(u.name) === normalizeName(unitName));
    if (isChildUnit) {
      // Nếu là đơn vị cấp dưới: nếu có Trưởng đơn vị con riêng thì chỉ hiện Trưởng đơn vị con đó
      const childMgr = getUnitManager(unitName);
      if (childMgr && childMgr.id && childMgr.id !== user?.id && normalizeName(childMgr.name) !== normalizeName(user?.name)) {
        return [childMgr];
      }
    }

    // Lọc các nhân sự thuộc đơn vị đã chọn
    const targetUnit = orgUnits.find((u) => normalizeName(u.name) === normalizeName(unitName) || u.name === unitName);
    if (targetUnit) {
      const members = base.filter((p) => isEmpInUnit(p, targetUnit));
      if (members.length > 0) return members;
    }

    return base;
  };

  const unitAssignees = assigneesForUnit(selectedUnit);

  const updateTaskInState = (task: EnterpriseTask) => {
    setSelectedTask(task);
    setTasks((current) => current.map((item) => item.key === task.key ? { ...item, ...task } : item));
  };

  const openTask = async (taskId: string) => {
    setDrawerOpen(true);
    setDetailLoading(true);
    setComment('');
    try {
      const response = await tasksApi.getOne(taskId);
      if (response?.data?.task) {
        setSelectedTask(response.data.task);
        return;
      }
    } catch {
      // fallback to local dataService
    } finally {
      setDetailLoading(false);
    }
    const local = dataService.getEnterpriseTasks();
    const match = local.find((task: any) => task.key === taskId || task.taskCode === taskId || task.id === taskId);
    setSelectedTask(match || tasks.find((task) => task.key === taskId || task.taskCode === taskId) || null);
  };

  const openCreateTask = () => {
    form.resetFields();
    setSelectedUnit(undefined);
    const defaultDueDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    form.setFieldsValue({
      priority: 'Trung bình',
      unitName: undefined,
      assigneeIds: [],
      dueDate: defaultDueDate,
    });
    setModalOpen(true);
  };

  const handleUnitChange = (unitName?: string) => {
    setSelectedUnit(unitName);
    if (unitName) {
      if (!isEmployee) {
        const manager = getUnitManager(unitName);
        if (manager && manager.id) {
          form.setFieldsValue({ assigneeIds: [manager.id] });
        } else {
          form.setFieldsValue({ assigneeIds: [] });
        }
      } else {
        const isChildUnit = childManagedUnits.some((u) => normalizeName(u.name) === normalizeName(unitName));
        if (isChildUnit) {
          const childMgr = getUnitManager(unitName);
          if (childMgr && childMgr.id && childMgr.id !== user?.id && normalizeName(childMgr.name) !== normalizeName(user?.name)) {
            form.setFieldsValue({ assigneeIds: [childMgr.id] });
            return;
          }
        }
        form.setFieldsValue({ assigneeIds: [] });
      }
    } else {
      form.setFieldsValue({ assigneeIds: [] });
    }
  };

  const handleCreate = async (values: any) => {
    const assigneeIds = Array.isArray(values.assigneeIds) ? values.assigneeIds : [];
    if (!assigneeIds.length) {
      message.error('Vui lòng chọn ít nhất một người thực hiện.');
      return;
    }
    if (!values.taskTitle || !String(values.taskTitle).trim()) {
      message.error('Vui lòng nhập tên nhiệm vụ.');
      return;
    }
    const defaultDueDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const dueDate = values.dueDate ? String(values.dueDate).trim() : defaultDueDate;
    const payload = {
      taskCode: values.taskCode,
      taskTitle: String(values.taskTitle).trim(),
      description: values.description || '',
      projectName: values.unitName || '',
      priority: values.priority || 'Trung bình',
      dueDate,
    };
    try {
      for (const assigneeId of assigneeIds) {
        await tasksApi.create({ ...payload, assigneeId });
      }
      message.success(`Đã thêm nhiệm vụ cho ${assigneeIds.length} người thực hiện.`);
      setModalOpen(false);
      localStorage.setItem('kiyovn_task_updated', String(Date.now()));
      window.dispatchEvent(new Event('kiyovn_task_updated'));
      await loadData();
    } catch (err: any) {
      console.warn('Backend tasksApi.create error, saving locally:', err);
      const created = assigneeIds.map((assigneeId: string, index: number) => {
        const selectedAssignee = assignees.find((person) => person.id === assigneeId);
        return dataService.createEnterpriseTask({
          ...payload,
          taskCode: index === 0 ? payload.taskCode : undefined,
          assigneeId,
          assignee: selectedAssignee ? `${selectedAssignee.name} (${selectedAssignee.employeeCode})` : 'Người thực hiện',
        });
      });
      setTasks((current) => [...created, ...current]);
      message.success(`Đã thêm nhiệm vụ cho ${assigneeIds.length} người thực hiện.`);
      setModalOpen(false);
      localStorage.setItem('kiyovn_task_updated', String(Date.now()));
      window.dispatchEvent(new Event('kiyovn_task_updated'));
    }
  };

  const completeTask = async (task: EnterpriseTask) => {
    try {
      const response = await tasksApi.update(task.key, { status: 'Hoàn thành', progress: 100 });
      updateTaskInState(response.data.task);
    } catch {
      const updated = dataService.updateEnterpriseTask(task.key, { status: 'Hoàn thành', progress: 100 });
      if (updated) updateTaskInState(updated);
    }
    localStorage.setItem('kiyovn_task_updated', String(Date.now()));
    window.dispatchEvent(new Event('kiyovn_task_updated'));
    message.success('Đã nghiệm thu và hoàn thành nhiệm vụ.');
  };

  const openEditTask = (task: EnterpriseTask) => {
    setSelectedTask(task);
    editForm.setFieldsValue({
      taskCode: task.taskCode,
      taskTitle: task.taskTitle,
      priority: task.priority || 'Trung bình',
      unitName: task.projectName || 'Không có đơn vị',
      assignee: task.assignee || 'Nhân viên',
      dueDate: task.dueDate || new Date().toISOString().slice(0, 10),
      description: task.description || '',
      status: task.status || 'Đang thực hiện',
      progress: task.progress ?? 0,
    });
    setEditModalOpen(true);
  };

  const handleEdit = async (values: any) => {
    if (!selectedTask) return;
    if (!values.taskTitle || !String(values.taskTitle).trim()) {
      message.error('Vui lòng nhập tên nhiệm vụ.');
      return;
    }
    const payload: any = {
      taskTitle: String(values.taskTitle).trim(),
      description: values.description || '',
      priority: values.priority || 'Trung bình',
      dueDate: values.dueDate ? String(values.dueDate).trim() : selectedTask.dueDate,
      status: values.status || selectedTask.status,
      progress: typeof values.progress === 'number' ? values.progress : Number(values.progress) || 0,
    };

    try {
      const response = await tasksApi.update(selectedTask.key, payload);
      if (response?.data?.task) {
        updateTaskInState(response.data.task);
      } else {
        updateTaskInState({ ...selectedTask, ...payload });
      }
      message.success('Đã cập nhật nhiệm vụ thành công.');
      setEditModalOpen(false);
      localStorage.setItem('kiyovn_task_updated', String(Date.now()));
      window.dispatchEvent(new Event('kiyovn_task_updated'));
      await loadData();
    } catch (err: any) {
      console.warn('Backend update error, saving locally:', err);
      const updated = dataService.updateEnterpriseTask(selectedTask.key, payload);
      if (updated) updateTaskInState(updated);
      else updateTaskInState({ ...selectedTask, ...payload });
      message.success('Đã cập nhật nhiệm vụ thành công.');
      setEditModalOpen(false);
      localStorage.setItem('kiyovn_task_updated', String(Date.now()));
      window.dispatchEvent(new Event('kiyovn_task_updated'));
    }
  };

  const deleteTask = (task: EnterpriseTask) => {
    Modal.confirm({
      title: 'Xác nhận xóa nhiệm vụ',
      content: `Bạn có chắc chắn muốn xóa nhiệm vụ "${task.taskTitle}" (${task.taskCode}) không?`,
      okText: 'Xóa nhiệm vụ',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await tasksApi.remove(task.key);
          message.success('Đã xóa nhiệm vụ thành công.');
        } catch {
          dataService.deleteEnterpriseTask(task.key);
          message.success('Đã xóa nhiệm vụ thành công.');
        }
        setTasks((prev) => prev.filter((t) => t.key !== task.key));
        localStorage.setItem('kiyovn_task_updated', String(Date.now()));
        window.dispatchEvent(new Event('kiyovn_task_updated'));
      },
    });
  };

  const addComment = async () => {
    if (!selectedTask || !comment.trim()) return;
    try {
      const response = await tasksApi.addComment(selectedTask.key, comment.trim());
      updateTaskInState(response.data.task);
    } catch {
      const updated = dataService.addEnterpriseTaskComment(selectedTask.key, comment.trim());
      if (updated) updateTaskInState(updated);
    }
    localStorage.setItem('kiyovn_task_updated', String(Date.now()));
    window.dispatchEvent(new Event('kiyovn_task_updated'));
    setComment('');
  };

  const [submittingReport, setSubmittingReport] = useState(false);

  const autoCalculateStatus = (prog: number): EnterpriseTask['status'] => {
    if (prog >= 100) return isEmployee ? 'Chờ nghiệm thu' : 'Hoàn thành';
    if (prog > 0) return 'Đang thực hiện';
    return 'Chưa bắt đầu';
  };

  const canReportTask = (task: EnterpriseTask) => task.status !== 'Hoàn thành';

  const openReport = (task: EnterpriseTask) => {
    setSelectedTask(task);
    setReportContent('');
    setReportFiles([]);
    setReportProgress(String(task.progress));
    setReportStatus(autoCalculateStatus(task.progress));
    setReportModalOpen(true);
  };

  const openAllReports = async () => {
    setAllReportsModalOpen(true);
    const taskId = selectedTask?.key || selectedTask?.id || selectedTask?.taskCode;
    if (!taskId) return;
    try {
      const response = await tasksApi.getOne(String(taskId));
      if (response?.data?.task) {
        setSelectedTask(response.data.task);
      }
    } catch {
      const localTasks = dataService.getEnterpriseTasks();
      const found = localTasks.find((t: any) => t.key === taskId || t.id === taskId || t.taskCode === taskId);
      if (found) {
        setSelectedTask((cur) => (cur ? { ...cur, ...found } : found));
      }
    }
  };

  const handleReportProgressChange = (val: string) => {
    setReportProgress(val);
    const num = Number(val) || 0;
    setReportStatus(autoCalculateStatus(num));
  };

  const handleOpenAttachment = async (attachment: TaskReportAttachment) => {
    try {
      let blob: Blob | null = null;
      try {
        const response = await filesApi.download(attachment.key);
        if (response?.data) {
          blob = response.data;
        }
      } catch {
        blob = await getFileBlob(attachment.key);
      }

      if (!blob) {
        blob = new Blob([`Tài liệu: ${attachment.name}`], { type: attachment.type || 'text/plain' });
      }

      const url = URL.createObjectURL(blob);
      setPreviewAttachment(attachment);
      setPreviewBlobUrl(url);
    } catch (error: any) {
      message.error(error?.response?.data?.message || `Không thể mở tệp ${attachment.name}.`);
      return;
    }
  };

  const closePreviewAttachment = () => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
    }
    setPreviewAttachment(null);
    setPreviewBlobUrl(null);
  };

  const downloadAttachment = async (attachment: TaskReportAttachment) => {
    try {
      let blob: Blob | null = null;
      try {
        const response = await filesApi.download(attachment.key);
        if (response?.data) {
          blob = response.data;
        }
      } catch {
        blob = await getFileBlob(attachment.key);
      }

      if (!blob) {
        blob = new Blob([`Tài liệu: ${attachment.name}`], { type: attachment.type || 'text/plain' });
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attachment.name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải tệp đính kèm.');
      return;
    }
  };

  const submitReport = async () => {
    if (!selectedTask || submittingReport) return;
    const progress = Number(reportProgress);
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      message.error('Tiến độ phải là số nguyên từ 0 đến 100.');
      return;
    }
    if (!reportContent.trim() && !reportFiles.length) {
      message.error('Hãy nhập nội dung báo cáo hoặc đính kèm tệp.');
      return;
    }

    setSubmittingReport(true);
    try {
      const computedStatus = autoCalculateStatus(progress);
      const attachments: TaskReportAttachment[] = [];

      for (let index = 0; index < reportFiles.length; index++) {
        const fileObj = reportFiles[index];
        const rawFile: File = (fileObj as any).originFileObj || fileObj;
        const fileName = rawFile.name || (fileObj as any).name || `tep-${index + 1}`;
        const fileSize = rawFile.size ?? (fileObj as any).size ?? 0;
        const fileType = rawFile.type || (fileObj as any).type || 'application/octet-stream';
        let fileId = `att-${Date.now()}-${index}`;

        try {
          if (rawFile instanceof Blob) {
            const uploaded = await filesApi.upload(rawFile, fileName, undefined, 'task-report');
            if (uploaded?.data?.file?.id) {
              fileId = uploaded.data.file.id;
            }
          }
        } catch (uploadErr) {
          console.warn('API upload failed, saving to IndexedDB storage fallback:', uploadErr);
        }

        if (rawFile instanceof Blob) {
          try {
            await storeFileBlob(fileId, rawFile);
          } catch (dbErr) {
            console.error('IndexedDB error:', dbErr);
          }
        }

        attachments.push({
          id: `attachment-${Date.now()}-${index}`,
          key: fileId,
          name: fileName,
          size: fileSize,
          type: fileType,
        });
      }

      const authorName = user?.name || (isEmployee ? 'Nhân viên' : 'Quản trị viên');
      const report = {
        content: cleanDashes(reportContent),
        progress,
        status: computedStatus,
        attachments,
        author: authorName,
      };

      let success = false;
      const taskId = selectedTask.key || selectedTask.id || selectedTask.taskCode;
      try {
        const response = await tasksApi.addReport(String(taskId), report);
        if (response?.data?.task) {
          updateTaskInState(response.data.task);
          success = true;
        }
      } catch (apiErr) {
        console.warn('API addReport failed, falling back to local dataService:', apiErr);
      }

      if (!success) {
        const updated = dataService.addEnterpriseTaskReport(String(taskId), report);
        if (updated && (updated.key || updated.taskCode || updated.id)) {
          updateTaskInState(updated);
          success = true;
        }
      }

      setReportModalOpen(false);
      setReportContent('');
      setReportFiles([]);
      localStorage.setItem('kiyovn_task_updated', String(Date.now()));
      window.dispatchEvent(new Event('kiyovn_task_updated'));
      message.success('Đã gửi báo cáo tiến độ thành công!');
    } catch (err: any) {
      console.error('Error submitting task report:', err);
      message.error(err?.response?.data?.message || 'Có lỗi xảy ra khi gửi báo cáo. Vui lòng thử lại.');
    } finally {
      setSubmittingReport(false);
    }
  };

  const summary = useMemo(() => ({
    total: tasks.length,
    inProgress: tasks.filter((task) => task.status === 'Đang thực hiện').length,
    waitingReview: tasks.filter((task) => task.status === 'Chờ nghiệm thu').length,
    overdue: tasks.filter((task) => task.status !== 'Hoàn thành' && task.dueDate < new Date().toISOString().slice(0, 10)).length,
  }), [tasks]);

  const filteredTasks = useMemo(() => {
    const list = tasks.filter((task) => {
      const text = searchText.toLowerCase();
      const matchSearch = [task.taskCode, task.taskTitle, task.projectName, task.assignee].some((value) => (value || '').toLowerCase().includes(text));
      if (!matchSearch) return false;
      if (filterTab === 'urgent') return task.priority === 'Khẩn cấp';
      if (filterTab === 'in-progress') return task.status === 'Đang thực hiện';
      if (filterTab === 'waiting-review') return task.status === 'Chờ nghiệm thu';
      if (filterTab === 'completed') return task.status === 'Hoàn thành';
      return true;
    });

    // Sắp xếp: Mới nhất ở trên cùng, cũ nhất ở dưới cùng
    return [...list].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeA && timeB && timeA !== timeB) return timeB - timeA;

      const codeA = String(a.taskCode || a.key || '');
      const codeB = String(b.taskCode || b.key || '');
      if (codeA && codeB && codeA !== codeB) return codeB.localeCompare(codeA, undefined, { numeric: true });

      return String(b.key || '').localeCompare(String(a.key || ''), undefined, { numeric: true });
    });
  }, [tasks, searchText, filterTab]);

  const columns = [
    { title: 'Mã & hạn xử lý', key: 'code', width: 150, render: (_: unknown, task: EnterpriseTask) => <div><div style={{ fontWeight: 500, color: '#009688', display: 'flex', gap: 6, alignItems: 'center' }}><CheckSquareOutlined /> {task.taskCode}</div><div style={{ marginTop: 3, fontSize: 12, color: task.dueDate < new Date().toISOString().slice(0, 10) && task.status !== 'Hoàn thành' ? '#DC2626' : '#64748B' }}>Hạn: {task.dueDate}</div></div> },
    { title: 'Nhiệm vụ / đơn vị', key: 'title', render: (_: unknown, task: EnterpriseTask) => <div><div style={{ fontWeight: 500, color: '#0F172A' }}>{task.taskTitle}</div>{task.projectName && <div style={{ marginTop: 2, fontSize: 12, color: '#2563EB' }}>{task.projectName}</div>}</div> },
    { title: 'Người thực hiện', dataIndex: 'assignee', key: 'assignee', width: 190, render: (assignee: string) => <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 400 }}><UserOutlined style={{ color: '#009688' }} />{assignee}</span> },
    { title: 'Ưu tiên', dataIndex: 'priority', key: 'priority', width: 120, render: (priority: TaskPriority) => <Tag color={priorityColor(priority)}>{priority}</Tag> },
    { title: 'Tiến độ', key: 'progress', width: 145, render: (_: unknown, task: EnterpriseTask) => <div><Progress percent={task.progress} size="small" showInfo={false} strokeColor={task.status === 'Hoàn thành' ? '#16A34A' : '#009688'} /><span style={{ fontSize: 12, fontWeight: 400, color: '#334155' }}>{task.progress}%</span></div> },
    {
      title: 'Thao tác',
      key: 'actions',
      width: isEmployee ? 110 : 180,
      render: (_: unknown, task: EnterpriseTask) => (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => void openTask(task.key)}>
            Chi tiết
          </Button>
          {!isEmployee && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditTask(task)}>
              Sửa
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 16 }}>
        {[['Tổng nhiệm vụ', `${summary.total} nhiệm vụ`, '#009688'], ['Đang thực hiện', `${summary.inProgress} nhiệm vụ`, '#2563EB'], ['Chờ nghiệm thu', `${summary.waitingReview} nhiệm vụ`, '#D97706'], ['Đang quá hạn', `${summary.overdue} nhiệm vụ`, summary.overdue ? '#DC2626' : '#16A34A']].map(([label, value, color]) => <div key={label} style={{ background: '#FFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}><div style={{ color: '#64748B', fontSize: 12.5 }}>{label}</div><div style={{ color, fontWeight: 800, fontSize: 23, marginTop: 5 }}>{value}</div></div>)}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{[['all', 'Tất cả'], ['urgent', 'Khẩn cấp'], ['in-progress', 'Đang thực hiện'], ['waiting-review', 'Chờ nghiệm thu'], ['completed', 'Hoàn thành']].map(([key, label]) => <Button key={key} size="small" onClick={() => setFilterTab(key)} style={{ background: filterTab === key ? '#E0F2F1' : '#FFF', borderColor: filterTab === key ? '#009688' : '#CBD5E1', color: filterTab === key ? '#00796B' : '#475569', fontWeight: filterTab === key ? 700 : 500 }}>{label}</Button>)}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Input prefix={<SearchOutlined style={{ color: '#94A3B8' }} />} placeholder="Mã, tên việc, đơn vị, người làm..." value={searchText} onChange={(event) => setSearchText(event.target.value)} allowClear style={{ width: 270 }} /><Button icon={<ReloadOutlined />} onClick={() => void loadData()}>Tải lại</Button>{canCreateTask && <Button type="primary" icon={<PlusOutlined />} onClick={openCreateTask} style={{ background: '#009688', borderColor: '#009688' }}>Thêm nhiệm vụ</Button>}</div>
      </div>

      <Spin spinning={loading} tip="Đang tải nhiệm vụ..."><div className="transparent-table-card"><KTable dataSource={filteredTasks} columns={columns} pagination={{ pageSize: 8 }} /></div></Spin>

      <Modal title={isEmployee ? 'Thêm nhiệm vụ' : 'Giao nhiệm vụ mới'} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={620}>
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Form.Item name="taskCode" label="Mã nhiệm vụ"><Input readOnly placeholder="Tự động tạo khi lưu" /></Form.Item><Form.Item name="priority" label="Độ ưu tiên" rules={[{ required: true }]}><Select options={['Khẩn cấp', 'Cao', 'Trung bình', 'Thấp'].map((item) => ({ label: item, value: item }))} /></Form.Item></div>
          <Form.Item name="taskTitle" label="Tên nhiệm vụ" rules={[{ required: true }]}><Input placeholder="Ví dụ: Hoàn thiện báo cáo doanh thu tháng" /></Form.Item>
          {availableUnits.length > 0 && (
            <Form.Item name="unitName" label="Đơn vị">
              <Select
                showSearch
                allowClear
                placeholder="Không chọn đơn vị"
                onChange={handleUnitChange}
                options={availableUnits.map((unit) => ({ value: unit.name, label: unit.name }))}
                filterOption={(input, option) =>
                  (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
          )}
          <Form.Item name="assigneeIds" label="Người thực hiện" rules={[{ required: true, message: 'Vui lòng chọn người thực hiện.' }]}>
            <Select
              mode="multiple"
              showSearch
              allowClear
              placeholder={selectedUnit && unitAssignees.length === 0 ? 'Đơn vị này chưa phân công Trưởng đơn vị' : 'Có thể chọn người thực hiện'}
              options={unitAssignees.filter((person) => person && (person.name || person.employeeCode)).map((person) => ({
                value: person.id,
                label: `${person.name && person.name !== 'undefined' ? person.name : 'Nhân viên'} (${person.employeeCode || person.id})${
                  (!isEmployee && selectedUnit) || (isEmployee && childManagedUnits.some(u => normalizeName(u.name) === normalizeName(selectedUnit)))
                    ? ' (Trưởng đơn vị)'
                    : ''
                }`,
              }))}
              filterOption={(input, option) =>
                (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item name="dueDate" label="Hạn hoàn thành" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          <Form.Item name="description" label="Mô tả / kết quả cần đạt"><Input.TextArea rows={3} placeholder="Nêu rõ yêu cầu, tiêu chí bàn giao..." /></Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button onClick={() => setModalOpen(false)}>Hủy</Button><Button type="primary" htmlType="submit" style={{ background: '#009688', borderColor: '#009688' }}>Thêm nhiệm vụ</Button></div>
        </Form>
      </Modal>

      <Modal title="Chỉnh sửa nhiệm vụ" open={editModalOpen} onCancel={() => setEditModalOpen(false)} footer={null} width={620}>
        <Form form={editForm} layout="vertical" onFinish={handleEdit} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="taskCode" label="Mã nhiệm vụ">
              <Input readOnly disabled style={{ background: '#F8FAFC', color: '#64748B' }} />
            </Form.Item>
            <Form.Item name="priority" label="Độ ưu tiên" rules={[{ required: true }]}>
              <Select options={['Khẩn cấp', 'Cao', 'Trung bình', 'Thấp'].map((item) => ({ label: item, value: item }))} />
            </Form.Item>
          </div>
          <Form.Item name="taskTitle" label="Tên nhiệm vụ" rules={[{ required: true, message: 'Vui lòng nhập tên nhiệm vụ.' }]}>
            <Input placeholder="Ví dụ: Hoàn thiện báo cáo doanh thu tháng" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="status" label="Trạng thái">
              <Select options={['Chưa bắt đầu', 'Đang thực hiện', 'Chờ nghiệm thu', 'Hoàn thành', 'Tạm dừng'].map((item) => ({ label: item, value: item }))} />
            </Form.Item>
            <Form.Item name="progress" label="Tiến độ (%)">
              <Input type="number" min={0} max={100} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="unitName" label="Đơn vị">
              <Input readOnly disabled style={{ background: '#F8FAFC', color: '#64748B' }} />
            </Form.Item>
            <Form.Item name="assignee" label="Người thực hiện">
              <Input readOnly disabled style={{ background: '#F8FAFC', color: '#64748B' }} />
            </Form.Item>
          </div>
          <Form.Item name="dueDate" label="Hạn hoàn thành" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả / kết quả cần đạt">
            <Input.TextArea rows={3} placeholder="Nêu rõ yêu cầu, tiêu chí bàn giao..." />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setEditModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ background: '#009688', borderColor: '#009688' }}>
              Lưu thay đổi
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><EyeOutlined style={{ color: '#009688' }} /><span>Chi tiết nhiệm vụ</span></div>}
        open={drawerOpen}
        onCancel={() => setDrawerOpen(false)}
        footer={null}
        width={720}
        style={{ top: 24 }}
        styles={{ body: { maxHeight: 'calc(85vh - 60px)', overflowY: 'auto' } }}
      >
        {detailLoading && <div style={{ padding: '30px 0', textAlign: 'center' }}><Spin tip="Đang tải chi tiết..." /></div>}
        {!detailLoading && selectedTask && <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ paddingBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <div style={{ color: '#009688', fontSize: 12, fontWeight: 800 }}>{selectedTask.taskCode}</div>
                <div style={{ color: '#0F172A', fontSize: 16, fontWeight: 700, marginTop: 4 }}>{selectedTask.taskTitle}</div>
              </div>
              <Tag color={statusColor(selectedTask.status)}>{selectedTask.status}</Tag>
            </div>
            <div style={{ marginTop: 8, color: '#475569', fontSize: 12.5 }}>
              {[selectedTask.projectName, selectedTask.assignee, `Hạn ${selectedTask.dueDate}`].filter(Boolean).join(' · ')}
            </div>
            {selectedTask.description && (
              <div style={{ marginTop: 10, color: '#334155', whiteSpace: 'pre-wrap', fontSize: 13 }}>
                {selectedTask.description}
              </div>
            )}
          </div>

          <div style={{ paddingBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong>Tiến độ hoàn thành</strong>
              </div>
              <strong style={{ color: selectedTask.status === 'Hoàn thành' ? '#16A34A' : '#009688' }}>{selectedTask.progress}%</strong>
            </div>
            <Progress percent={selectedTask.progress} strokeColor={selectedTask.status === 'Hoàn thành' ? '#16A34A' : '#009688'} />
          </div>

          {selectedTask.reports?.length ? (
            <div style={{ paddingBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FileTextOutlined style={{ color: '#009688' }} /> Báo cáo công việc
                </div>
                <span
                  onClick={() => void openAllReports()}
                  style={{ cursor: 'pointer', color: '#009688', fontWeight: 600, fontSize: 13, userSelect: 'none' }}
                >
                  Xem thêm
                </span>
              </div>
              {(() => {
                const latestReport = selectedTask.reports[0];
                if (!latestReport) return null;
                const attachments = getReportAttachments(latestReport);
                return (
                  <div key={latestReport.key} style={{ padding: '4px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <Tag color={statusColor(latestReport.status)} style={{ height: 26, display: 'inline-flex', alignItems: 'center', margin: 0, fontWeight: 600 }}>
                        {latestReport.progress}% {latestReport.status}
                      </Tag>
                      {renderTime(latestReport.createdAt) ? (
                        <span style={{ color: '#94A3B8', fontSize: 12 }}>{renderTime(latestReport.createdAt)}</span>
                      ) : null}
                    </div>
                    {latestReport.content && (
                      <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', color: '#334155', fontSize: 13 }}>
                        {cleanDashes(latestReport.content)}
                      </div>
                    )}
                    {attachments.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              background: '#F8FAFC',
                              border: '1px solid #CBD5E1',
                              borderRadius: 6,
                              padding: '4px 10px',
                              fontSize: 12,
                            }}
                          >
                            <PaperClipOutlined style={{ color: '#009688' }} />
                            <span
                              style={{
                                maxWidth: 190,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontWeight: 500,
                                color: '#1E293B',
                              }}
                              title={attachment.name}
                            >
                              {attachment.name}
                            </span>
                            {attachment.size > 0 && (
                              <span style={{ color: '#64748B', fontSize: 11 }}>
                                ({formatFileSize(attachment.size)})
                              </span>
                            )}
                            <Button
                              size="small"
                              type="text"
                              icon={<EyeOutlined style={{ color: '#009688' }} />}
                              onClick={() => void handleOpenAttachment(attachment)}
                              title="Xem tệp"
                              style={{ height: 22, width: 22, padding: 0, marginLeft: 2 }}
                            />
                            <Button
                              size="small"
                              type="text"
                              icon={<DownloadOutlined style={{ color: '#2563EB' }} />}
                              onClick={() => void downloadAttachment(attachment)}
                              title="Tải file về máy"
                              style={{ height: 22, width: 22, padding: 0 }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : null}

          <div style={{ paddingBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700, color: '#1E293B', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CommentOutlined style={{ color: '#009688' }} /> Trao đổi
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                {selectedTask.comments?.length ? `${selectedTask.comments.length} tin nhắn trao đổi` : 'Chưa có trao đổi nào'}
              </div>
            </div>
            <Button type="primary" icon={<CommentOutlined />} onClick={() => setCommentModalOpen(true)} style={{ background: '#009688', borderColor: '#009688' }}>
              Trao đổi
            </Button>
          </div>

          {selectedTask.activities?.length ? (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8, color: '#1E293B' }}>
                <ClockCircleOutlined style={{ color: '#009688', marginRight: 6 }} /> Nhật ký hoạt động
              </div>
              <div
                style={{
                  maxHeight: 128,
                  overflowY: 'auto',
                  paddingRight: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                {selectedTask.activities.map((item) => (
                  <div key={item.key} style={{ padding: '4px 0', fontSize: 12.5, lineHeight: '22px' }}>
                    <strong>{item.actor}</strong> {cleanDashes(item.content)}
                    {renderTime(item.createdAt) ? (
                      <span style={{ color: '#94A3B8', marginLeft: 6 }}>{renderTime(item.createdAt)}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 6 }}>
            <Button onClick={() => setDrawerOpen(false)}>Đóng</Button>
            {canReportTask(selectedTask) && (
              <Button type="primary" icon={<FileTextOutlined />} onClick={() => openReport(selectedTask)} style={{ background: '#009688', borderColor: '#009688' }}>
                Báo cáo
              </Button>
            )}
            {!isEmployee && selectedTask.status !== 'Hoàn thành' && Number(selectedTask.progress) >= 100 && (
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => void completeTask(selectedTask)} style={{ background: '#16A34A', borderColor: '#16A34A' }}>
                Nghiệm thu hoàn thành
              </Button>
            )}
          </div>
        </div>}
      </Modal>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CommentOutlined style={{ color: '#009688' }} />
            <span>Trao đổi</span>
          </div>
        }
        open={commentModalOpen}
        onCancel={() => setCommentModalOpen(false)}
        footer={null}
        width={600}
        style={{ top: 40 }}
        maskClosable={false}
      >
        {selectedTask && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 6 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
              {selectedTask.comments?.length ? (
                selectedTask.comments.map((item) => (
                  <div key={item.key} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 12.5, color: '#0F172A' }}>{item.author}</span>
                      {renderTime(item.createdAt) ? (
                        <span style={{ fontSize: 11.5, color: '#94A3B8' }}>{renderTime(item.createdAt)}</span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{cleanDashes(item.content)}</div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748B', fontSize: 13 }}>
                  Chưa có trao đổi nào cho nhiệm vụ này.
                </div>
              )}
            </div>
            <div style={{ marginTop: 6 }}>
              <Input.TextArea
                rows={3}
                value={comment}
                onChange={(event: any) => setComment(event.target.value)}
                placeholder="Nhập nội dung trao đổi, tiến độ hoặc phản hồi..."
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <Button onClick={() => setCommentModalOpen(false)}>Đóng</Button>
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  disabled={!comment.trim()}
                  onClick={() => void addComment()}
                  style={{ background: '#009688', borderColor: '#009688' }}
                >
                  Gửi bình luận
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FileTextOutlined style={{ color: '#009688' }} /><span>Báo cáo tiến độ nhiệm vụ</span></div>}
        open={reportModalOpen}
        onCancel={() => !submittingReport && setReportModalOpen(false)}
        footer={null}
        width={640}
      >
        {selectedTask && (
          <div style={{ paddingTop: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#334155' }}>
                Tiến độ hoàn thành
              </div>
              <Input
                type="number"
                min={0}
                max={100}
                value={reportProgress}
                onChange={(event) => handleReportProgressChange(event.target.value)}
                placeholder="Nhập tiến độ từ 0 đến 100"
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#334155' }}>
                Nội dung báo cáo
              </div>
              <Input.TextArea
                rows={4}
                value={reportContent}
                onChange={(event: any) => setReportContent(event.target.value)}
                placeholder="Nêu chi tiết khối lượng công việc đã hoàn thành, vướng mắc phát sinh (nếu có)..."
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#334155' }}>
                Đính kèm tài liệu
              </div>
              <Upload.Dragger
                multiple
                beforeUpload={(file, fileList) => {
                  setReportFiles((current) => {
                    const existing = new Set(current.map((item) => `${item.name}-${item.size}`));
                    const fresh = fileList.map((f: any) => f.originFileObj || f).filter((item: File) => !existing.has(`${item.name}-${item.size}`));
                    return [...current, ...fresh];
                  });
                  return false;
                }}
                showUploadList={false}
                style={{ padding: '16px 14px', background: '#FAFAFA', borderColor: '#CBD5E1' }}
              >
                <UploadOutlined style={{ fontSize: 24, color: '#009688' }} />
                <div style={{ marginTop: 6, fontWeight: 600, color: '#1E293B', fontSize: 13 }}>
                  Bấm chọn hoặc kéo thả file vào đây
                </div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  Hỗ trợ tải mọi định dạng file (Word, Excel, PDF, Hình ảnh, ZIP...)
                </div>
              </Upload.Dragger>

              {reportFiles.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                    Danh sách {reportFiles.length} file đính kèm:
                  </div>
                  {reportFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        fontSize: 12.5,
                        padding: '6px 10px',
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: 6,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <PaperClipOutlined style={{ color: '#009688' }} />
                        <strong style={{ color: '#1E293B' }}>{file.name}</strong>
                        <span style={{ color: '#64748B', fontSize: 11.5 }}>({formatFileSize(file.size)})</span>
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button
                          size="small"
                          danger
                          disabled={submittingReport}
                          onClick={() => setReportFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                        >
                          Xóa
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <Button disabled={submittingReport} onClick={() => setReportModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                icon={<FileTextOutlined />}
                loading={submittingReport}
                disabled={submittingReport}
                onClick={() => void submitReport()}
                style={{ background: '#009688', borderColor: '#009688' }}
              >
                {submittingReport ? 'Đang gửi...' : 'Gửi báo cáo'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL XEM TẤT CẢ BÁO CÁO CÔNG VIỆC */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileTextOutlined style={{ color: '#009688' }} />
            <span>Tất cả báo cáo công việc</span>
          </div>
        }
        open={allReportsModalOpen}
        onCancel={() => setAllReportsModalOpen(false)}
        footer={null}
        width={750}
        style={{ top: 24 }}
        maskClosable={false}
        styles={{ body: { maxHeight: 'calc(85vh - 60px)', overflowY: 'auto' } }}
      >
        {selectedTask && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {selectedTask.reports?.length ? (
                selectedTask.reports.map((report, idx) => {
                  const attachments = getReportAttachments(report);
                  return (
                    <div
                      key={report.key || idx}
                      style={{
                        padding: '12px 0',
                        borderBottom: idx === selectedTask.reports.length - 1 ? 'none' : '1px solid #F1F5F9',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Tag color={statusColor(report.status)} style={{ height: 26, display: 'inline-flex', alignItems: 'center', margin: 0, fontWeight: 600 }}>
                          {report.progress}% {report.status}
                        </Tag>
                        {renderTime(report.createdAt) ? (
                          <span style={{ fontSize: 12, color: '#94A3B8' }}>{renderTime(report.createdAt)}</span>
                        ) : null}
                      </div>
                      {report.content && (
                        <div style={{ fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: 8 }}>
                          {cleanDashes(report.content)}
                        </div>
                      )}
                      {attachments.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                          {attachments.map((attachment) => (
                            <div
                              key={attachment.id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                background: '#F8FAFC',
                                border: '1px solid #CBD5E1',
                                borderRadius: 6,
                                padding: '4px 10px',
                                fontSize: 12,
                              }}
                            >
                              <PaperClipOutlined style={{ color: '#009688' }} />
                              <span
                                style={{
                                  maxWidth: 220,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  fontWeight: 500,
                                  color: '#1E293B',
                                }}
                                title={attachment.name}
                              >
                                {attachment.name}
                              </span>
                              {attachment.size > 0 && (
                                <span style={{ color: '#64748B', fontSize: 11 }}>
                                  ({formatFileSize(attachment.size)})
                                </span>
                              )}
                              <Button
                                size="small"
                                type="text"
                                icon={<EyeOutlined style={{ color: '#009688' }} />}
                                onClick={() => void handleOpenAttachment(attachment)}
                                title="Xem tệp"
                                style={{ height: 22, width: 22, padding: 0, marginLeft: 2 }}
                              />
                              <Button
                                size="small"
                                type="text"
                                icon={<DownloadOutlined style={{ color: '#2563EB' }} />}
                                onClick={() => void downloadAttachment(attachment)}
                                title="Tải file về máy"
                                style={{ height: 22, width: 22, padding: 0 }}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748B', fontSize: 13 }}>
                  Chưa có báo cáo công việc nào.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
              <Button onClick={() => setAllReportsModalOpen(false)}>Đóng</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL XEM TRỰC TIẾP FILE ĐÍNH KÈM (KHÔNG CẦN TẢI VỀ) */}
      <Modal
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><EyeOutlined style={{ color: '#009688' }} /><span>Xem tệp đính kèm: {previewAttachment?.name}</span></div>}
        open={!!previewAttachment}
        onCancel={closePreviewAttachment}
        footer={<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button onClick={closePreviewAttachment}>Đóng</Button>{previewAttachment && <Button type="primary" icon={<DownloadOutlined />} onClick={() => void downloadAttachment(previewAttachment)} style={{ background: '#009688', borderColor: '#009688' }}>Tải file về máy</Button>}</div>}
        width={850}
        style={{ top: 20 }}
      >
        {previewBlobUrl && previewAttachment && (
          <div style={{ height: '70vh', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', borderRadius: 8, overflow: 'hidden' }}>
            {previewAttachment.name.match(/\.(png|jpe?g|gif|webp|svg)$/i) ? (
              <img src={previewBlobUrl} alt={previewAttachment.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : previewAttachment.name.match(/\.pdf$/i) ? (
              <iframe src={previewBlobUrl} title={previewAttachment.name} style={{ width: '100%', height: '100%', border: 'none' }} />
            ) : previewAttachment.name.match(/\.(txt|csv|json|js|html|md)$/i) ? (
              <iframe src={previewBlobUrl} title={previewAttachment.name} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
            ) : (
              <div style={{ textAlign: 'center', padding: 30 }}>
                <PaperClipOutlined style={{ fontSize: 48, color: '#009688', marginBottom: 12 }} />
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{previewAttachment.name}</div>
                <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>Tệp đính kèm đã mở trực tiếp trên giao diện</div>
                <Button type="primary" icon={<DownloadOutlined />} onClick={() => void downloadAttachment(previewAttachment)} style={{ marginTop: 16, background: '#009688', borderColor: '#009688' }}>
                  Tải tệp về máy
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
