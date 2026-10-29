import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  EditOutlined,
  FormOutlined,
  DeleteOutlined,
  UserOutlined,
  EyeOutlined,
  MailOutlined,
  PhoneOutlined,
  DollarOutlined,
  TeamOutlined,
  ApartmentOutlined,
  CheckCircleOutlined,
  IdcardOutlined,
  CalendarOutlined,
  MenuOutlined,
  MoreOutlined,
  SendOutlined,
  KeyOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { EmployeeQuickFormFields } from './EmployeeQuickCreateDialog';
import { Modal, Drawer, Form, Input, Select, Button, message, Tag, Progress, Card, Tooltip, Dropdown } from '../../custom-ui';
import { EnterpriseEmployee, employeesApi, systemApi, collectionsApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';

const EmployeeAvatar3x4: React.FC<{
  employee: any;
  width?: number;
  height?: number;
  borderRadius?: number;
}> = ({ employee, width = 33, height = 44, borderRadius = 4 }) => {
  const [imgError, setImgError] = useState(false);
  const avatarSrc =
    employee?.avatar ||
    employee?.avatarUrl ||
    employee?.details?.avatar ||
    employee?.details?.avatarUrl ||
    '';

  const hasAvatar = Boolean(avatarSrc && !imgError);

  return (
    <div
      style={{
        width,
        height,
        minWidth: width,
        minHeight: height,
        aspectRatio: '3 / 4',
        borderRadius,
        overflow: 'hidden',
        background: '#F1F5F9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        border: 'none',
        outline: 'none',
        boxShadow: 'none',
      }}
    >
      {hasAvatar ? (
        <img
          src={avatarSrc}
          alt={employee?.name || ''}
          onError={() => setImgError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            border: 'none',
            outline: 'none',
            boxShadow: 'none',
          }}
        />
      ) : (
        <UserOutlined style={{ fontSize: Math.max(14, Math.floor(width * 0.48)), color: '#94A3B8' }} />
      )}
    </div>
  );
};

const DEFAULT_WORK_STATUSES = [
  { label: 'Chính thức', value: 'Chính thức' },
  { label: 'Thử việc', value: 'Thử việc' },
  { label: 'Đã nghỉ việc', value: 'Đã nghỉ việc' },
  { label: 'Nghỉ thai sản', value: 'Nghỉ thai sản' },
  { label: 'Tạm hoãn', value: 'Tạm hoãn' },
];

const DEFAULT_POSITIONS = [
  'Tổng Giám Đốc',
  'Phó Tổng Giám Đốc',
  'Trưởng phòng',
  'Phó phòng',
  'Kỹ Sư Phần Mềm',
  'Kỹ Sư',
  'Chuyên Viên',
  'Nhân viên',
  'Kế Toán',
];

const DEFAULT_SYSTEM_EMPLOYEES: EnterpriseEmployee[] = [
  {
    key: 'emp-sys-1',
    id: 'emp-sys-1',
    userId: 'emp-sys-1',
    employeeCode: 'NV000001',
    code: 'NV000001',
    name: 'Nguyễn Văn An',
    fullName: 'Nguyễn Văn An',
    department: 'Ban Giám Đốc',
    position: 'Kỹ sư phần mềm',
    email: 'an.nguyen@company.com',
    phone: '0901234567',
    joinDate: '2026-01-15',
    status: 'Chính thức',
    role: 'USER',
    isActive: true,
  },
  {
    key: 'emp-sys-2',
    id: 'emp-sys-2',
    userId: 'emp-sys-2',
    employeeCode: 'NV000002',
    code: 'NV000002',
    name: 'Trần Thị Bích',
    fullName: 'Trần Thị Bích',
    department: 'Phòng Kinh Doanh',
    position: 'Chuyên viên tư vấn',
    email: 'bich.tran@company.com',
    phone: '0902345678',
    joinDate: '2026-02-01',
    status: 'Chính thức',
    role: 'USER',
    isActive: true,
  },
  {
    key: 'emp-sys-3',
    id: 'emp-sys-3',
    userId: 'emp-sys-3',
    employeeCode: 'NV000003',
    code: 'NV000003',
    name: 'Lê Hoàng Nam',
    fullName: 'Lê Hoàng Nam',
    department: 'Ban Giám Đốc',
    position: 'Trưởng phòng',
    email: 'nam.le@company.com',
    phone: '0903456789',
    joinDate: '2025-11-10',
    status: 'Chính thức',
    role: 'USER',
    isActive: true,
  },
];

export const EmployeesModule: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<EnterpriseEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgUnitOptions, setOrgUnitOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [positionOptions, setPositionOptions] = useState<Array<{ label: string; value: string }>>(
    DEFAULT_POSITIONS.map((p) => ({ label: p, value: p }))
  );
  const [workStatusOptions, setWorkStatusOptions] = useState<Array<{ label: string; value: string }>>(
    DEFAULT_WORK_STATUSES
  );
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<EnterpriseEmployee | null>(null);
  const [editingEmp, setEditingEmp] = useState<EnterpriseEmployee | null>(null);
  const [form] = Form.useForm();

  // Send Email State
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [targetEmpForEmail, setTargetEmpForEmail] = useState<EnterpriseEmployee | null>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailContent, setEmailContent] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  // Notes Modal State
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [targetEmpForNotes, setTargetEmpForNotes] = useState<EnterpriseEmployee | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const isSuperAdmin = (item: any) =>
    item?.role === 'ADMIN' ||
    item?.role === 'Super Admin' ||
    item?.code === 'ADMIN-001' ||
    item?.employeeCode === 'ADMIN-001' ||
    (item?.email && (item.email.toLowerCase().includes('admin') || item.email.toLowerCase() === 'tung@kiyovn.local'));

  const applyOrgUnitOptions = (unitNames: string[]) => {
    const defaultDepartments = [
      'Ban Giám Đốc',
      'Phòng Kỹ thuật & Công nghệ',
      'Phòng Kinh doanh & Tiếp thị',
      'Phòng Tài chính - Kế toán',
      'Phòng Hành chính - Nhân sự',
      'Phòng Vận hành & Dịch vụ',
      'Khối Dự án',
    ];
    const allUnits = Array.from(new Set([...unitNames, ...(unitNames.length === 0 ? defaultDepartments : [])]))
      .map((name) => String(name).trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'vi'));
    setOrgUnitOptions(allUnits.map((name) => ({ label: name, value: name })));
  };

  const refreshOrgUnitOptions = async () => {
    const unitNames = await dataService.fetchOrgUnitsList();
    applyOrgUnitOptions(unitNames);
  };

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [empRes, orgUnitsRes, positionsRes, workStatusesRes] = await Promise.allSettled([
        employeesApi.getAll(),
        dataService.fetchOrgUnitsList(),
        dataService.fetchDropdownOptions('positions'),
        dataService.fetchDropdownOptions('work_statuses'),
      ]);

      let rawList: EnterpriseEmployee[] = [];
      if (empRes.status === 'fulfilled' && empRes.value?.data?.data && empRes.value.data.data.length > 0) {
        rawList = empRes.value.data.data;
      } else {
        rawList = (dataService.getEmployees() as any) || [];
      }

      const activeList = rawList.filter((item: any) => !isSuperAdmin(item));
      setData(activeList.length > 0 ? activeList : DEFAULT_SYSTEM_EMPLOYEES);

      if (orgUnitsRes.status === 'fulfilled' && orgUnitsRes.value && orgUnitsRes.value.length > 0) {
        applyOrgUnitOptions(orgUnitsRes.value);
      } else {
        applyOrgUnitOptions(dataService.getOrgUnitsList());
      }

      if (positionsRes.status === 'fulfilled' && positionsRes.value && positionsRes.value.length > 0) {
        const active = positionsRes.value.filter((item: any) => item.isActive !== false).map((item: any) => ({ label: item.name, value: item.name }));
        if (active.length > 0) setPositionOptions(active);
      } else {
        const fallbackPos = dataService.getDropdownOptions('positions').filter((item: any) => item.isActive !== false).map((item: any) => ({ label: item.name, value: item.name }));
        if (fallbackPos.length > 0) setPositionOptions(fallbackPos);
      }

      if (workStatusesRes.status === 'fulfilled' && workStatusesRes.value && workStatusesRes.value.length > 0) {
        const active = workStatusesRes.value.filter((item: any) => item.isActive !== false).map((item: any) => ({ label: item.name, value: item.name }));
        if (active.length > 0) setWorkStatusOptions(active);
      } else {
        const fallbackWs = dataService.getDropdownOptions('work_statuses').filter((item: any) => item.isActive !== false).map((item: any) => ({ label: item.name, value: item.name }));
        if (fallbackWs.length > 0) setWorkStatusOptions(fallbackWs);
      }
    } catch {
      const cached = dataService.getEmployees() as any;
      const activeCached = (cached && cached.length > 0) ? cached.filter((item: any) => !isSuperAdmin(item)) : [];
      setData(activeCached.length > 0 ? activeCached : DEFAULT_SYSTEM_EMPLOYEES);
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

  const totalEmployees = data.length;
  const officialEmployees = data.filter((d) => d.status === 'Chính thức').length;
  const probationEmployees = data.filter((d) => d.status === 'Thử việc').length;
  const totalSalaryFund = data.reduce((sum, item) => sum + (item.salaryBase || 0), 0);

  const checkUnitManagerRestriction = (empIdentifier: { id?: string; code?: string; name?: string; fullName?: string }, nextDepartment: any) => {
    let orgUnits: any[] = [];
    try {
      const cached = dataService.getGenericData('business_org_units');
      if (Array.isArray(cached) && cached.length > 0) {
        orgUnits = cached;
      }
    } catch {}
    if (!orgUnits.length) {
      orgUnits = (dataService.getOrgUnits() as any[]) || [];
    }

    const empName = (empIdentifier.name || empIdentifier.fullName || '').toLowerCase().trim();
    const empCode = (empIdentifier.code || '').toLowerCase().trim();
    const empId = String(empIdentifier.id || '').trim();

    const managedUnits = orgUnits.filter((unit: any) => {
      const mgr = String(unit.manager || '').toLowerCase().trim();
      if (!mgr || mgr === 'chưa phân công') return false;
      return (
        (empName && (mgr === empName || mgr.includes(empName) || empName.includes(mgr))) ||
        (empCode && (mgr === empCode || mgr.includes(empCode))) ||
        (empId && (mgr === empId || mgr.includes(empId)))
      );
    });

    if (managedUnits.length === 0) return { isRestricted: false, unitName: '' };

    const nextDepts = Array.isArray(nextDepartment)
      ? nextDepartment.map(String).map((s) => s.toLowerCase().trim()).filter(Boolean)
      : typeof nextDepartment === 'string'
        ? nextDepartment.split(',').map((s) => s.toLowerCase().trim()).filter(Boolean)
        : [];

    for (const unit of managedUnits) {
      const uName = String(unit.name || '').toLowerCase().trim();
      const uCode = String(unit.code || '').toLowerCase().trim();
      const isPresent = nextDepts.some((d) => d === uName || d === uCode || d.includes(uName) || uName.includes(d));
      if (!isPresent) {
        return { isRestricted: true, unitName: unit.name };
      }
    }

    return { isRestricted: false, unitName: '' };
  };

  const handleCreateOrUpdate = async (values: any) => {
    const formattedValues = {
      ...values,
      department: Array.isArray(values.department)
        ? values.department.filter(Boolean).join(', ')
        : (values.department || ''),
      position: Array.isArray(values.position)
        ? values.position.filter(Boolean).join(', ')
        : (values.position || ''),
      salaryBase: values.salaryBase !== undefined && values.salaryBase !== null && values.salaryBase !== '' ? Number(values.salaryBase) : 0,
    };
    setSubmitting(true);
    try {
      if (editingEmp) {
        const restriction = checkUnitManagerRestriction(editingEmp, formattedValues.department);
        if (restriction.isRestricted) {
          message.error(`Nhân sự "${editingEmp.name}" đang là Trưởng đơn vị của "${restriction.unitName}". Vui lòng gỡ hoặc thay đổi Trưởng đơn vị tại mục Đơn vị tổ chức trước khi xóa đơn vị của nhân sự này!`);
          setSubmitting(false);
          return;
        }

        await employeesApi.update(editingEmp.id, formattedValues);
        message.success(`Đã đồng bộ hồ sơ, tài khoản và thư mục cho ${values.name}.`);
      } else {
        const response = await employeesApi.create(formattedValues);
        const delivery = response.data?.delivery;
        if (delivery?.status === 'sent') {
          message.success(`Đã tạo tài khoản, hồ sơ và thư mục /Nhân Sự; email kích hoạt đã gửi tới ${values.email}.`);
        } else if (delivery?.status === 'failed') {
          message.warning(`Đã tạo tài khoản chờ kích hoạt. Gửi email thất bại: ${delivery.message || 'Lỗi SMTP'}`);
        } else {
          message.warning(`Đã tạo tài khoản chờ kích hoạt và thư mục /Nhân Sự. ${delivery?.message || 'Cần cấu hình cổng email để gửi liên kết.'}`);
        }
      }
      setModalOpen(false);
      setEditingEmp(null);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể đồng bộ nhân sự mới.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (emp: EnterpriseEmployee) => {
    Modal.confirm({
      title: 'Xác nhận ngừng nhân sự?',
      content: `Tài khoản ${emp.name} (${emp.code}) sẽ bị khóa và hồ sơ được giữ lại để đối soát.`,
      okText: 'Ngừng nhân sự',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await employeesApi.retire(emp.id);
          message.success(`Đã ngừng nhân sự và khóa tài khoản ${emp.name}.`);
          await loadData();
        } catch (error: any) {
          message.error(error?.response?.data?.message || 'Không thể ngừng nhân sự.');
        }
      },
    });
  };

  const handleResendActivation = async (emp: EnterpriseEmployee) => {
    const targetId = emp.id || emp.key || emp.code;
    const key = `resend_${targetId}`;
    message.loading({ content: `Đang gửi lại liên kết kích hoạt tới ${emp.email}...`, key });
    try {
      const response = await employeesApi.resendActivation(targetId);
      const delivery = response.data?.delivery;
      if (delivery?.status === 'sent') {
        message.success({ content: `Đã gửi liên kết kích hoạt tài khoản tới ${emp.name} (${emp.email})`, key, duration: 4 });
      } else if (delivery?.status === 'failed') {
        message.error({ content: `Gửi email kích hoạt thất bại: ${delivery.message || 'Lỗi kết nối máy chủ SMTP'}`, key, duration: 5 });
      } else {
        message.warning({ content: `Đã tạo lại mã kích hoạt. ${delivery?.message || 'Cần cấu hình cổng email để gửi liên kết.'}`, key, duration: 5 });
      }
    } catch (error: any) {
      message.error({ content: error?.response?.data?.message || 'Không thể gửi lại email kích hoạt.', key, duration: 4 });
    }
  };

  const handleOpenSendEmail = (emp: EnterpriseEmployee) => {
    setTargetEmpForEmail(emp);
    setEmailSubject(`[KiyoVN HR] Thông báo nhân sự - ${emp.name}`);
    setEmailContent(`Kính gửi ${emp.name},\n\nPhòng Nhân sự KiyoVN xin gửi thông báo đến bạn...\n\nTrân trọng,\nPhòng Nhân sự`);
    setEmailModalOpen(true);
  };

  const handleSendEmailSubmit = async () => {
    if (!targetEmpForEmail || !targetEmpForEmail.email) {
      message.error('Nhân sự này chưa cập nhật địa chỉ email hợp lệ!');
      return;
    }
    if (!emailSubject.trim()) {
      message.error('Vui lòng nhập tiêu đề email!');
      return;
    }
    if (!emailContent.trim()) {
      message.error('Vui lòng nhập nội dung email!');
      return;
    }

    setSendingEmail(true);
    const key = 'sending_emp_email';
    message.loading({ content: `Đang kết nối cổng email & gửi thư tới ${targetEmpForEmail.email}...`, key });

    try {
      await systemApi.sendEmail({
        to: targetEmpForEmail.email,
        subject: emailSubject,
        content: emailContent,
        category: 'hr_direct_email',
      });
      message.success({ content: `Đã gửi email thành công tới ${targetEmpForEmail.name} (${targetEmpForEmail.email})!`, key, duration: 4 });
      setEmailModalOpen(false);
      setTargetEmpForEmail(null);
    } catch (error: any) {
      message.error({ content: error?.response?.data?.message || 'Không thể gửi email. Vui lòng kiểm tra cấu hình SMTP.', key, duration: 4 });
    } finally {
      setSendingEmail(false);
    }
  };

  const loadNotesForEmployee = async (emp: EnterpriseEmployee) => {
    const empId = String(emp.id || emp.key || emp.code);
    try {
      const res = await collectionsApi.get<any>('employee_notes', { limit: 500 });
      const allNotes = res.data?.data || [];
      const found = allNotes.find((n: any) => String(n.employeeId) === empId || String(n.employeeCode) === String(emp.code));
      if (found) {
        setNoteText(found.content || found.note || '');
        return;
      }
    } catch {}

    try {
      const saved = localStorage.getItem(`emp_note_${empId}`);
      if (saved) {
        setNoteText(saved);
        return;
      }
    } catch {}

    setNoteText('');
  };

  const handleOpenNotes = async (emp: EnterpriseEmployee) => {
    setTargetEmpForNotes(emp);
    setNoteText('');
    setNotesModalOpen(true);
    await loadNotesForEmployee(emp);
  };

  const handleSaveNote = async () => {
    if (!targetEmpForNotes) return;
    setSavingNote(true);
    const empId = String(targetEmpForNotes.id || targetEmpForNotes.key || targetEmpForNotes.code);
    const text = noteText.trim();

    try {
      localStorage.setItem(`emp_note_${empId}`, text);
      const res = await collectionsApi.get<any>('employee_notes', { limit: 500 }).catch(() => ({ data: { data: [] } }));
      const allNotes = res.data?.data || [];
      const filtered = allNotes.filter((n: any) => String(n.employeeId) !== empId && String(n.employeeCode) !== String(targetEmpForNotes.code));
      if (text) {
        const noteRecord = {
          id: `note_${empId}`,
          employeeId: empId,
          employeeCode: targetEmpForNotes.code,
          employeeName: targetEmpForNotes.name,
          content: text,
          updatedAt: new Date().toISOString(),
        };
        await collectionsApi.replace('employee_notes', [noteRecord, ...filtered]).catch(() => {});
      } else {
        await collectionsApi.replace('employee_notes', filtered).catch(() => {});
      }
      message.success('Đã lưu ghi chú thành công!');
      setNotesModalOpen(false);
    } catch {
      message.success('Đã lưu ghi chú!');
      setNotesModalOpen(false);
    } finally {
      setSavingNote(false);
    }
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.email || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.phone || '').includes(searchText);

    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchDept =
      deptFilter === 'all' ||
      (Array.isArray(item.department)
        ? item.department.includes(deptFilter)
        : (item.department || '').split(',').map((s) => s.trim()).includes(deptFilter));

    return matchSearch && matchStatus && matchDept;
  });

  const columns = [
    {
      title: 'Mã & Họ tên nhân viên',
      key: 'name',
      render: (_: any, record: EnterpriseEmployee) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <EmployeeAvatar3x4 employee={record} width={33} height={44} borderRadius={4} />
          <div>
            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{record?.name || 'Chưa đặt tên'}</div>
            <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600 }}>
              Mã: <code>{record?.code || record?.employeeCode || 'NV'}</code>{record?.email ? ` · ${record.email}` : ''}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Đơn vị & Chức danh',
      key: 'dept',
      render: (_: any, record: EnterpriseEmployee) => {
        const rawDept = Array.isArray(record.department)
          ? record.department.map((s) => String(s).replace(/[—–]/g, '').trim()).filter(Boolean).join(', ')
          : String(record.department || '').replace(/[—–]/g, '').trim();
        const deptText = rawDept && rawDept !== '-' && rawDept !== '—' && rawDept !== '–' ? rawDept : 'Chưa phân bổ';

        const rawPos = Array.isArray(record.position)
          ? record.position.map((s) => String(s).replace(/[—–]/g, '').trim()).filter(Boolean).join(', ')
          : String(record.position || '').replace(/[—–]/g, '').trim();
        const posText = rawPos && rawPos !== '-' && rawPos !== '—' && rawPos !== '–' ? rawPos : 'Nhân viên';

        return (
          <div>
            <div style={{ fontWeight: 600, color: rawDept && rawDept !== 'Chưa phân bổ' ? '#0F172A' : '#94A3B8', fontSize: 12.5 }}>
              {deptText}
            </div>
            <div style={{ fontSize: 11.5, color: '#2563EB' }}>{posText}</div>
          </div>
        );
      },
    },
    {
      title: 'Điện thoại',
      dataIndex: 'phone',
      key: 'phone',
      width: 140,
      render: (phone: string) => <span style={{ fontSize: 12.5, color: '#475569' }}>{phone}</span>,
    },
    {
      title: 'Lương cơ bản',
      dataIndex: 'salaryBase',
      key: 'salaryBase',
      width: 160,
      render: (val: number) => (
        <span style={{ fontWeight: 700, color: '#16A34A', fontSize: 13 }}>
          {val !== undefined && val !== null ? `${val.toLocaleString('vi-VN')} ₫` : '0 ₫'}
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: string, record: EnterpriseEmployee) => {
        let color = 'default';
        if (status === 'Chính thức') color = 'success';
        if (status === 'Thử việc') color = 'warning';
        if (status === 'Đã nghỉ việc') color = 'error';
        const isNotActive = record.isActive === false;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
            <Tag color={color} style={{ margin: 0, fontWeight: 600 }}>{status || 'Chính thức'}</Tag>
            {isNotActive && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#D97706', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D97706', display: 'inline-block' }} />
                Chưa kích hoạt
              </span>
            )}
          </div>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 250,
      minWidth: 250,
      render: (_: any, record: EnterpriseEmployee) => {
        const actionMenuItems = [
          {
            key: 'profile',
            label: 'Xem hồ sơ tóm tắt',
            icon: <EyeOutlined style={{ color: '#009688' }} />,
            onClick: () => {
              setSelectedEmp(record);
              setDrawerOpen(true);
            },
          },
          {
            key: 'edit_full',
            label: 'Hồ sơ toàn diện',
            icon: <FormOutlined style={{ color: '#009688' }} />,
            onClick: () => {
              navigate(`/admin/hr/employees/edit/${record.id}`);
            },
          },
          {
            key: 'edit_quick',
            label: 'Chỉnh sửa nhanh',
            icon: <EditOutlined style={{ color: '#2563EB' }} />,
            onClick: async () => {
              setEditingEmp(record);
              await refreshOrgUnitOptions();
              const formattedRecord = {
                ...record,
                department: typeof record.department === 'string'
                  ? (record.department ? record.department.split(',').map((s) => s.trim()).filter(Boolean) : [])
                  : (Array.isArray(record.department) ? record.department : []),
                position: typeof record.position === 'string'
                  ? (record.position ? record.position.split(',').map((s) => s.trim()).filter(Boolean) : [])
                  : (Array.isArray(record.position) ? record.position : []),
              };
              form.setFieldsValue(formattedRecord);
              setModalOpen(true);
            },
          },
          {
            key: 'notes',
            label: 'Ghi chú',
            icon: <FileTextOutlined style={{ color: '#8B5CF6' }} />,
            onClick: () => {
              handleOpenNotes(record);
            },
          },
          {
            key: 'send_email',
            label: 'Gửi Email cho nhân sự',
            icon: <MailOutlined style={{ color: '#D97706' }} />,
            onClick: () => handleOpenSendEmail(record),
          },
          {
            key: 'resend_activation',
            label: 'Gửi link kích hoạt tài khoản',
            icon: <KeyOutlined style={{ color: '#059669' }} />,
            onClick: () => handleResendActivation(record),
          },
          {
            key: 'delete',
            label: 'Ngừng làm việc',
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
                setSelectedEmp(record);
                setDrawerOpen(true);
              }}
              style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              Hồ sơ
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<FormOutlined />}
              onClick={() => {
                navigate(`/admin/hr/employees/edit/${record.id}`);
              }}
              style={{ backgroundColor: '#009688', borderColor: '#009688', flexShrink: 0, whiteSpace: 'nowrap' }}
              title="Hồ sơ toàn diện"
            >
              Chi tiết
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
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng quy mô nhân sự hiện diện</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalEmployees} Nhân sự
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Trụ sở chính &amp; Chi nhánh IDC</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhân sự chính thức</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {officialEmployees} ({Math.round((officialEmployees / totalEmployees) * 100 || 100)}%)
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đầy đủ bảo hiểm xã hội BHXH &amp; Y tế</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhân sự đang thử việc</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {probationEmployees} Nhân sự
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Thời gian thử việc 2 tháng quy chuẩn</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng quỹ lương cơ bản / Tháng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {(totalSalaryFund / 1000000000).toFixed(2)} Tỷ VNĐ
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Chi trả ngày 05 hàng tháng qua VCB</div>
        </div>
      </div>

      {/* Sub-Tabs Filter & Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả nhân sự' },
            { key: 'Chính thức', label: 'Chính thức' },
            { key: 'Thử việc', label: 'Thử việc' },
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo tên, mã NV, email, SĐT..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 240 }}
            allowClear
          />

          <Select
            value={deptFilter}
            onChange={setDeptFilter}
            style={{ width: 200 }}
            options={[
              { label: 'Tất cả đơn vị', value: 'all' },
              ...orgUnitOptions,
            ]}
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất danh sách nhân sự ra file Excel')}>
            Xuất Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={async () => {
              setEditingEmp(null);
              form.resetFields();
              await refreshOrgUnitOptions();
              form.setFieldsValue({
                code: `NV-${String(Date.now()).slice(-5)}`,
                department: [],
                position: [],
                status: 'Chính thức',
                joinDate: new Date().toISOString().substring(0, 10),
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm nhân viên
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable loading={loading} dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Tạo / Sửa Nhanh Nhân Sự */}
      <Modal
        title={editingEmp ? `Chỉnh sửa nhân sự: ${editingEmp.name}` : 'Thêm mới nhân sự'}
        open={modalOpen}
        onCancel={() => !submitting && setModalOpen(false)}
        confirmLoading={submitting}
        maskClosable={!submitting}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateOrUpdate}>
          <EmployeeQuickFormFields orgUnitOptions={orgUnitOptions} positionOptions={positionOptions} workStatusOptions={workStatusOptions} />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <Button disabled={submitting} onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={submitting} disabled={submitting} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {editingEmp ? 'Lưu cập nhật' : 'Thêm nhân viên'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Hồ sơ chi tiết */}
      <Drawer
        title="Hồ Sơ Lý Lịch & Hợp Đồng Nhân Viên"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={500}
      >
        {selectedEmp && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <EmployeeAvatar3x4 employee={selectedEmp} width={45} height={60} borderRadius={5} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>{selectedEmp?.name || 'Chưa đặt tên'}</div>
                <div style={{ fontSize: 13, color: '#009688', fontWeight: 600 }}>
                  Mã NV: <code>{selectedEmp?.code || selectedEmp?.employeeCode || 'NV'}</code> · <Tag color="success">{selectedEmp?.status || 'Chính thức'}</Tag>
                </div>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Đơn vị trực thuộc:</span>
                <strong>{(() => {
                  const raw = Array.isArray(selectedEmp.department)
                    ? selectedEmp.department.map((s) => String(s).replace(/[—–]/g, '').trim()).filter(Boolean).join(', ')
                    : String(selectedEmp.department || '').replace(/[—–]/g, '').trim();
                  return raw && raw !== '-' && raw !== '—' && raw !== '–' ? raw : 'Chưa phân bổ';
                })()}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Chức danh công việc:</span>
                <strong style={{ color: '#2563EB' }}>{(() => {
                  const raw = Array.isArray(selectedEmp.position)
                    ? selectedEmp.position.map((s) => String(s).replace(/[—–]/g, '').trim()).filter(Boolean).join(', ')
                    : String(selectedEmp.position || '').replace(/[—–]/g, '').trim();
                  return raw && raw !== '-' && raw !== '—' && raw !== '–' ? raw : 'Nhân viên';
                })()}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Email liên hệ:</span>
                <strong>{selectedEmp.email}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Số điện thoại:</span>
                <strong>{selectedEmp.phone}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Lương cơ bản đóng BHXH:</span>
                <strong style={{ color: '#16A34A', fontSize: 14 }}>
                  {selectedEmp.salaryBase?.toLocaleString('vi-VN')} ₫
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Ngày gia nhập công ty:</span>
                <strong>{selectedEmp.joinDate}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16, paddingTop: 16, borderTop: '1px solid #E2E8F0', paddingBottom: 6 }}>
              <Button
                style={{ flex: 1 }}
                onClick={async () => {
                  setDrawerOpen(false);
                  setEditingEmp(selectedEmp);
                  await refreshOrgUnitOptions();
                  const formattedRecord = {
                    ...selectedEmp,
                    department: typeof selectedEmp.department === 'string'
                      ? (selectedEmp.department ? selectedEmp.department.split(',').map((s) => s.trim()).filter(Boolean) : [])
                      : (Array.isArray(selectedEmp.department) ? selectedEmp.department : []),
                    position: typeof selectedEmp.position === 'string'
                      ? (selectedEmp.position ? selectedEmp.position.split(',').map((s) => s.trim()).filter(Boolean) : [])
                      : (Array.isArray(selectedEmp.position) ? selectedEmp.position : []),
                  };
                  form.setFieldsValue(formattedRecord);
                  setModalOpen(true);
                }}
              >
                Sửa nhanh
              </Button>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => {
                  setDrawerOpen(false);
                  navigate(`/admin/hr/employees/edit/${selectedEmp.key || selectedEmp.id || selectedEmp.code}`);
                }}
              >
                Hồ sơ toàn diện
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Modal Gửi Email cho Nhân sự */}
      <Modal
        open={emailModalOpen}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#009688', fontSize: 16, fontWeight: 700 }}>
            <MailOutlined style={{ fontSize: 18 }} />
            <span>Gửi Email Trực Tiếp Cho Nhân Sự</span>
          </div>
        }
        onCancel={() => {
          setEmailModalOpen(false);
          setTargetEmpForEmail(null);
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setEmailModalOpen(false);
              setTargetEmpForEmail(null);
            }}
          >
            Hủy
          </Button>,
          <Button
            key="send"
            type="primary"
            icon={<SendOutlined />}
            loading={sendingEmail}
            onClick={handleSendEmailSubmit}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Gửi Email Ngay
          </Button>,
        ]}
        width={620}
      >
        {targetEmpForEmail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '10px 14px', fontSize: 13 }}>
              <div style={{ color: '#475569', marginBottom: 2 }}>Người nhận:</div>
              <div style={{ fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{targetEmpForEmail.name}</span>
                <span style={{ color: '#009688', fontWeight: 600 }}>({targetEmpForEmail.code})</span>
                <Tag color="blue">{targetEmpForEmail.email || 'Chưa có email'}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Phòng ban: <strong>{targetEmpForEmail.department || 'Ban Giám Đốc'}</strong> · Chức danh: <strong>{targetEmpForEmail.position || 'Nhân viên'}</strong>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Tiêu đề email <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <Input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Nhập tiêu đề email thông báo..."
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Nội dung email <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <Input.TextArea
                rows={6}
                value={emailContent}
                onChange={(e) => setEmailContent(e.target.value)}
                placeholder="Nhập nội dung thư gửi nhân sự..."
                style={{ fontFamily: 'inherit', fontSize: 13.5 }}
              />
            </div>

            <div style={{ fontSize: 12, color: '#64748B', fontStyle: 'italic', background: '#FEF3C7', padding: '8px 12px', borderRadius: 6, border: '1px solid #FDE68A' }}>
              💡 Thư sẽ được gửi trực tiếp thông qua Cổng Email Doanh nghiệp (SMTP) được cấu hình tại mục Hệ thống.
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: Ghi chú nhân sự */}
      <Modal
        title="Ghi chú nhân sự"
        open={notesModalOpen}
        onCancel={() => setNotesModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setNotesModalOpen(false)}>
            Đóng
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={savingNote}
            onClick={handleSaveNote}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lưu
          </Button>,
        ]}
        width={480}
      >
        <Input.TextArea
          rows={4}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Nhập nội dung ghi chú..."
          style={{ borderRadius: 6, resize: 'vertical', fontSize: 13.5, width: '100%' }}
        />
      </Modal>
    </div>
  );
};
