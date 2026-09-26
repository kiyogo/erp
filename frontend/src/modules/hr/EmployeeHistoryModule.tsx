import React, { useState, useEffect } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  TrophyOutlined,
  WarningOutlined,
  SwapOutlined,
  UserDeleteOutlined,
  UserSwitchOutlined,
  BankOutlined,
  CheckOutlined,
  CloseOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Checkbox } from '../../custom-ui';
import { dataService, Employee } from '../../services/dataService';

interface HistoryRecord {
  key: string;
  code: string;
  employeeName: string;
  employeeCode: string;
  type: 'Chức vụ' | 'Thuyên chuyển' | 'Nghỉ việc' | 'Khen thưởng' | 'Kỷ luật sự cố' | 'Ngân hàng';
  eventDate: string;
  oldValue: string;
  newValue: string;
  decisionNumber: string;
  signer: string;
  note: string;
}

const INITIAL_HISTORY_DATA: HistoryRecord[] = [];

const BANK_OPTIONS = [
  { value: 'Ngân hàng TMCP Ngoại Thương VN (Vietcombank)', label: 'Vietcombank - Ngân hàng Ngoại Thương VN' },
  { value: 'Ngân hàng TMCP Quân Đội (MB Bank)', label: 'MB Bank - Ngân hàng Quân Đội' },
  { value: 'Ngân hàng TMCP Kỹ Thương VN (Techcombank)', label: 'Techcombank - Ngân hàng Kỹ Thương VN' },
  { value: 'Ngân hàng TMCP Đầu Tư và Phát Triển VN (BIDV)', label: 'BIDV - Ngân hàng Đầu Tư & Phát Triển VN' },
  { value: 'Ngân hàng Nông nghiệp & Phát triển Nông thôn (Agribank)', label: 'Agribank - Ngân hàng NN&PTNT VN' },
  { value: 'Ngân hàng TMCP Á Châu (ACB)', label: 'ACB - Ngân hàng TMCP Á Châu' },
  { value: 'Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)', label: 'VPBank - Ngân hàng Việt Nam Thịnh Vượng' },
  { value: 'Ngân hàng TMCP Tiên Phong (TPBank)', label: 'TPBank - Ngân hàng Tiên Phong' },
  { value: 'Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank)', label: 'Sacombank - Sài Gòn Thương Tín' },
  { value: 'Ngân hàng Quốc tế (VIB)', label: 'VIB - Ngân hàng Quốc tế' },
  { value: 'Ngân hàng TMCP Phát triển TP.HCM (HDBank)', label: 'HDBank - Ngân hàng Phát triển TP.HCM' },
  { value: 'Ngân hàng TMCP Phương Đông (OCB)', label: 'OCB - Ngân hàng Phương Đông' },
  { value: 'Ngân hàng TNHH MTV Shinhan Việt Nam', label: 'Shinhan Bank Việt Nam' },
];

export const EmployeeHistoryModule: React.FC<{ defaultType?: 'Chức vụ' | 'Thuyên chuyển' | 'Nghỉ việc' | 'Khen thưởng' | 'Kỷ luật sự cố' | 'Ngân hàng' | 'all' }> = ({
  defaultType = 'all',
}) => {
  const [data, setData] = useState<HistoryRecord[]>(INITIAL_HISTORY_DATA);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>(defaultType);
  const [bankStatusFilter, setBankStatusFilter] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  // Bank Management State
  const [bankAccounts, setBankAccounts] = useState<any[]>(() => {
    try {
      return dataService.getEmployeeBankAccounts() || [];
    } catch {
      return [];
    }
  });
  const [employees, setEmployees] = useState<Employee[]>(() => {
    try {
      return dataService.getEmployees() || [];
    } catch {
      return [];
    }
  });
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [isBankViewModalOpen, setIsBankViewModalOpen] = useState(false);
  const [editingBankAccount, setEditingBankAccount] = useState<any | null>(null);
  const [viewingBankAccount, setViewingBankAccount] = useState<any | null>(null);
  const [bankForm, setBankForm] = useState({
    employeeCode: 'EMP-951954',
    employeeName: 'Nguyễn Huy Tùng',
    bankName: 'Ngân hàng TMCP Ngoại Thương VN (Vietcombank)',
    accountNumber: '',
    accountHolder: '',
    branch: '',
    status: 'Đã duyệt',
    isPrimary: true,
    note: '',
  });

  const loadBankAccounts = () => {
    try {
      setBankAccounts(dataService.getEmployeeBankAccounts() || []);
    } catch (e) {}
  };

  const loadEmployees = () => {
    try {
      setEmployees(dataService.getEmployees() || []);
    } catch (e) {}
  };

  useEffect(() => {
    loadBankAccounts();
    loadEmployees();
  }, []);

  useEffect(() => {
    setTypeFilter(defaultType);
  }, [defaultType]);

  // Handle Create General History
  const handleCreate = (values: any) => {
    const newRec: HistoryRecord = {
      ...values,
      key: String(Date.now()),
      eventDate: values.eventDate || new Date().toISOString().substring(0, 10),
    };
    setData([newRec, ...data]);
    message.success(`Đã ghi nhận biến động nhân sự: ${values.employeeName} (${values.type})`);
    setModalOpen(false);
    form.resetFields();
  };

  // Bank Handlers
  const handleOpenAddBank = () => {
    const empList = employees.length > 0 ? employees : dataService.getEmployees();
    const defaultEmp = (empList && empList[0]) || { code: 'EMP-951954', name: 'Nguyễn Huy Tùng' };
    setEditingBankAccount(null);
    setBankForm({
      employeeCode: defaultEmp.code,
      employeeName: defaultEmp.name,
      bankName: 'Ngân hàng TMCP Ngoại Thương VN (Vietcombank)',
      accountNumber: '',
      accountHolder: '',
      branch: '',
      status: 'Đã duyệt',
      isPrimary: true,
      note: '',
    });
    setIsBankModalOpen(true);
  };

  const handleOpenEditBank = (item: any) => {
    setEditingBankAccount(item);
    setBankForm({
      employeeCode: item.employeeCode || 'EMP-951954',
      employeeName: item.employeeName || 'Nguyễn Huy Tùng',
      bankName: item.bankName || '',
      accountNumber: item.accountNumber || '',
      accountHolder: item.accountHolder || '',
      branch: item.branch || '',
      status: item.status || 'Đã duyệt',
      isPrimary: item.isPrimary ?? false,
      note: item.note || '',
    });
    setIsBankModalOpen(true);
  };

  const handleOpenViewBank = (item: any) => {
    setViewingBankAccount(item);
    setIsBankViewModalOpen(true);
  };

  const handleEmployeeSelectChange = (empCode: string) => {
    const selected = employees.find(e => e.code === empCode);
    if (selected) {
      setBankForm(prev => ({
        ...prev,
        employeeCode: selected.code,
        employeeName: selected.name,
        accountHolder: '',
      }));
    }
  };

  const handleSaveBank = () => {
    if (!bankForm.employeeCode) {
      message.error('Vui lòng chọn nhân sự!');
      return;
    }
    if (!bankForm.bankName?.trim()) {
      message.error('Vui lòng chọn tên ngân hàng!');
      return;
    }
    if (!bankForm.accountNumber?.trim()) {
      message.error('Vui lòng nhập số tài khoản ngân hàng!');
      return;
    }
    if (!bankForm.accountHolder?.trim()) {
      message.error('Vui lòng nhập tên chủ tài khoản!');
      return;
    }

    const payload = {
      ...(editingBankAccount ? { ...editingBankAccount, ...bankForm } : bankForm),
      id: editingBankAccount ? editingBankAccount.id : `ba-${Date.now()}`,
      accountType: bankForm.isPrimary ? 'Tài khoản nhận lương chính' : 'Tài khoản phụ',
    };

    const updated = dataService.saveEmployeeBankAccount(payload, false);
    setBankAccounts(updated);
    message.success(
      editingBankAccount
        ? `Đã cập nhật ngân hàng của nhân viên ${bankForm.employeeName} thành công!`
        : `Đã thêm ngân hàng cho nhân viên ${bankForm.employeeName} thành công!`
    );
    setIsBankModalOpen(false);
  };

  const handleApproveBank = (id: string, bankName: string, empName: string) => {
    const updated = dataService.approveEmployeeBankAccount(id);
    setBankAccounts(updated);
    message.success(`Đã phê duyệt tài khoản "${bankName}" của nhân viên ${empName}!`);
  };

  const handleRejectBank = (id: string, bankName: string, empName: string) => {
    const updated = dataService.rejectEmployeeBankAccount(id, 'Thông tin chưa hợp lệ');
    setBankAccounts(updated);
    message.warning(`Đã từ chối tài khoản "${bankName}" của nhân viên ${empName}!`);
  };

  const handleDeleteBank = (id: string, bankName: string, empName: string) => {
    Modal.confirm({
      title: 'Xác nhận xóa tài khoản ngân hàng?',
      content: `Bạn có chắc chắn muốn xóa tài khoản "${bankName}" của nhân viên ${empName}?`,
      okText: 'Xác nhận xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: () => {
        const updated = dataService.deleteEmployeeBankAccount(id);
        setBankAccounts(updated);
        message.success(`Đã xóa tài khoản "${bankName}" thành công!`);
      },
    });
  };

  // Filtered Bank Accounts
  const filteredBankAccounts = (bankAccounts || []).filter((b) => {
    if (!b) return false;
    const empName = b?.employeeName || '';
    const empCode = b?.employeeCode || '';
    const bankName = b?.bankName || '';
    const accNum = b.accountNumber || '';
    const holder = b.accountHolder || '';
    const branch = b.branch || '';
    const q = (searchText || '').toLowerCase();
    const matchSearch =
      !q ||
      empName.toLowerCase().includes(q) ||
      empCode.toLowerCase().includes(q) ||
      bankName.toLowerCase().includes(q) ||
      accNum.toLowerCase().includes(q) ||
      holder.toLowerCase().includes(q) ||
      branch.toLowerCase().includes(q);
    const matchStatus = bankStatusFilter === 'all' || b.status === bankStatusFilter;
    return matchSearch && matchStatus;
  });

  const filteredHistoryData = (data || []).filter((item) => {
    if (!item) return false;
    const q = (searchText || '').toLowerCase();
    const matchSearch =
      !q ||
      (item.employeeName && (item.employeeName || '').toLowerCase().includes(q)) ||
      (item.employeeCode && (item.employeeCode || '').toLowerCase().includes(q)) ||
      (item.decisionNumber && (item.decisionNumber || '').toLowerCase().includes(q)) ||
      (item.newValue && (item.newValue || '').toLowerCase().includes(q));
    const matchType = typeFilter === 'all' || item.type === typeFilter;
    return matchSearch && matchType;
  });

  const generalColumns = [
    {
      title: 'Mã hồ sơ',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => <span style={{ fontWeight: 600, color: '#009688' }}>{code}</span>,
    },
    {
      title: 'Nhân viên',
      dataIndex: 'employeeName',
      key: 'employeeName',
      render: (name: string, record: HistoryRecord) => (
        <div>
          <div style={{ fontWeight: 600, color: '#212121' }}>{name}</div>
          <div style={{ fontSize: 11.5, color: '#757575' }}>Mã NV: {record.employeeCode}</div>
        </div>
      ),
    },
    {
      title: 'Loại biến động',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        let color = '#009688';
        let bg = '#E8F5E9';
        let icon = <UserSwitchOutlined />;
        if (type === 'Khen thưởng') { color = '#2E7D32'; bg = '#E8F5E9'; icon = <TrophyOutlined />; }
        if (type === 'Kỷ luật sự cố') { color = '#C62828'; bg = '#FFEBEE'; icon = <WarningOutlined />; }
        if (type === 'Nghỉ việc') { color = '#616161'; bg = '#F5F5F5'; icon = <UserDeleteOutlined />; }
        if (type === 'Thuyên chuyển') { color = '#1565C0'; bg = '#E3F2FD'; icon = <SwapOutlined />; }
        if (type === 'Ngân hàng') { color = '#00796B'; bg = '#E0F2F1'; icon = <BankOutlined />; }
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              background: bg,
              color: color,
            }}
          >
            {icon} {type}
          </span>
        );
      },
    },
    {
      title: 'Nội dung thay đổi',
      key: 'content',
      render: (_: any, record: HistoryRecord) => (
        <div>
          <div style={{ fontWeight: 600, color: '#212121' }}>{record.newValue}</div>
          {record.oldValue !== 'Không' && (
            <div style={{ fontSize: 11.5, color: '#757575' }}>Trước đó: {record.oldValue}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Số quyết định / Ký bởi',
      key: 'decision',
      render: (_: any, record: HistoryRecord) => (
        <div>
          <div style={{ fontWeight: 500, color: '#009688', fontSize: 12 }}>{record.decisionNumber}</div>
          <div style={{ fontSize: 11, color: '#757575' }}>Ký bởi: {record.signer}</div>
        </div>
      ),
    },
    {
      title: 'Ngày hiệu lực',
      dataIndex: 'eventDate',
      key: 'eventDate',
    },
  ];

  const bankColumns = [
    {
      title: 'STT',
      key: 'stt',
      width: 55,
      align: 'center' as const,
      render: (_: any, __: any, index: number) => <span style={{ color: '#64748B', whiteSpace: 'nowrap' }}>{index + 1}</span>,
    },
    {
      title: 'Họ và tên',
      key: 'employee',
      minWidth: 200,
      render: (_: any, record: any) => {
        const emp = employees.find(e => e.code === record.employeeCode || e.name === record.employeeName);
        const empName = record.employeeName || emp?.name || 'Nguyễn Huy Tùng';
        const empEmail = emp?.email || `${(empName || 'user').toLowerCase().replace(/\s+/g, '.')}@kiyovn.com`;
        const initial = (empName || 'N').charAt(0).toUpperCase();

        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#009688',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 13,
                flexShrink: 0,
              }}
            >
              {initial}
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#212121', fontSize: 13 }}>{empName}</div>
              <div style={{ fontSize: 11.5, color: '#757575' }}>{empEmail}</div>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Ngân hàng',
      dataIndex: 'bankName',
      key: 'bankName',
      render: (text: string) => (
        <span style={{ fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <BankOutlined style={{ color: '#009688' }} />
          {text}
        </span>
      ),
    },
    {
      title: 'Số tài khoản',
      dataIndex: 'accountNumber',
      key: 'accountNumber',
      render: (text: string) => <span style={{ fontWeight: 700, color: '#009688', whiteSpace: 'nowrap' }}>{text}</span>,
    },
    {
      title: 'Tên chủ tài khoản',
      dataIndex: 'accountHolder',
      key: 'accountHolder',
      render: (text: string) => <span style={{ fontWeight: 500, color: '#334155', whiteSpace: 'nowrap' }}>{text}</span>,
    },
    {
      title: 'Chi nhánh',
      dataIndex: 'branch',
      key: 'branch',
      render: (text: string) => <span style={{ color: '#64748B', whiteSpace: 'nowrap' }}>{text || '--'}</span>,
    },
    {
      title: 'Loại',
      key: 'isPrimary',
      render: (_: any, acc: any) =>
        acc.isPrimary && acc.status === 'Đã duyệt' ? (
          <span style={{ background: '#DCFCE7', color: '#16A34A', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <CheckCircleOutlined /> Nhận lương chính
          </span>
        ) : acc.isPrimary && acc.status === 'Chờ duyệt' ? (
          <span style={{ background: '#FEF3C7', color: '#D97706', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <ClockCircleOutlined /> Đề xuất chính
          </span>
        ) : (
          <span style={{ background: '#F1F5F9', color: '#64748B', padding: '2px 8px', borderRadius: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
            Phụ
          </span>
        ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) =>
        status === 'Chờ duyệt' ? (
          <span style={{ background: '#FEF3C7', color: '#D97706', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <ClockCircleOutlined /> Chờ duyệt
          </span>
        ) : status === 'Từ chối' ? (
          <span style={{ background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <CloseCircleOutlined /> Từ chối
          </span>
        ) : (
          <span style={{ background: '#DCFCE7', color: '#16A34A', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <CheckCircleOutlined /> Đã duyệt
          </span>
        ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'center' as const,
      render: (_: any, record: any) => {
        const empName = record.employeeName || 'Nhân sự';
        return (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', whiteSpace: 'nowrap' }}>
            <button
              onClick={() => handleOpenViewBank(record)}
              title="Xem chi tiết"
              style={{
                background: 'transparent',
                border: '1px solid #E2E8F0',
                borderRadius: 4,
                padding: '4px 7px',
                cursor: 'pointer',
                color: '#009688',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <EyeOutlined style={{ fontSize: 13 }} />
            </button>
            <button
              onClick={() => handleOpenEditBank(record)}
              title="Chỉnh sửa"
              style={{
                background: 'transparent',
                border: '1px solid #E2E8F0',
                borderRadius: 4,
                padding: '4px 7px',
                cursor: 'pointer',
                color: '#009688',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <EditOutlined style={{ fontSize: 13 }} />
            </button>
            <button
              onClick={() => handleDeleteBank(record?.id || '', record?.bankName || '', empName)}
              title="Xóa"
              style={{
                background: 'transparent',
                border: '1px solid #FEE2E2',
                borderRadius: 4,
                padding: '4px 7px',
                cursor: 'pointer',
                color: '#EF4444',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <DeleteOutlined style={{ fontSize: 13 }} />
            </button>
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng biến động vòng đời nhân sự</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} Quyết định
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Lịch sử thăng tiến, luân chuyển &amp; khen thưởng</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Bổ nhiệm &amp; Thăng tiến chức vụ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {data.filter((d) => d.type === 'Chức vụ').length} Cán bộ
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Phát triển nhân tài lãnh đạo kế cận</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Vinh danh &amp; Khen thưởng thành tích</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {data.filter((d) => d.type === 'Khen thưởng').length} Quyết định
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Ghi nhận đóng góp xuất sắc</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tài khoản ngân hàng nhận lương</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            {bankAccounts.length} Tài khoản
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Đã xác thực và liên kết chi trả tự động</div>
        </div>
      </div>

      {/* Top Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder={
              typeFilter === 'Ngân hàng'
                ? 'Tìm theo tên ngân hàng, STK, chi nhánh, chủ TK...'
                : 'Tìm theo tên nhân viên, mã NV, số QĐ, nội dung...'
            }
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 340, borderRadius: 6 }}
            allowClear
          />
          {defaultType === 'all' && (
            <Select
              value={typeFilter}
              onChange={setTypeFilter}
              style={{ width: 210 }}
              options={[
                { label: 'Tất cả biến động', value: 'all' },
                { label: 'Chức vụ / Bổ nhiệm', value: 'Chức vụ' },
                { label: 'Thuyên chuyển phòng ban', value: 'Thuyên chuyển' },
                { label: 'Khen thưởng & Vinh danh', value: 'Khen thưởng' },
                { label: 'Nghỉ việc / Thôi việc', value: 'Nghỉ việc' },
                { label: 'Kỷ luật & Sự cố', value: 'Kỷ luật sự cố' },
                { label: 'Ngân hàng / Thay đổi STK', value: 'Ngân hàng' },
              ]}
            />
          )}
          {typeFilter === 'Ngân hàng' && (
            <Select
              value={bankStatusFilter}
              onChange={setBankStatusFilter}
              style={{ width: 160 }}
              options={[
                { label: 'Tất cả trạng thái', value: 'all' },
                { label: 'Đã duyệt', value: 'Đã duyệt' },
                { label: 'Chờ duyệt', value: 'Chờ duyệt' },
                { label: 'Từ chối', value: 'Từ chối' },
              ]}
            />
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              if (typeFilter === 'Ngân hàng') {
                loadBankAccounts();
              }
              message.success('Đã làm mới dữ liệu');
            }}
          >
            Làm mới
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={() => message.success('Đã xuất dữ liệu ra tệp Excel')}
            style={{ borderRadius: 6 }}
          >
            Xuất Excel
          </Button>

          {typeFilter === 'Ngân hàng' ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenAddBank}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Thêm ngân hàng
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.resetFields();
                setModalOpen(true);
              }}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Ghi nhận biến động mới
            </Button>
          )}
        </div>
      </div>

      {/* Main Table with Minepanel transparent-table-card (giống 100% /admin/business/org-units) */}
      <div className="transparent-table-card" style={{ width: '100%' }}>
        <KTable
          dataSource={typeFilter === 'Ngân hàng' ? filteredBankAccounts : filteredHistoryData}
          columns={typeFilter === 'Ngân hàng' ? bankColumns : generalColumns}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total, range) => (
              <span style={{ fontSize: 13, color: '#757575' }}>
                Hiển thị {range[0]}-{range[1]} trên tổng số {total} {typeFilter === 'Ngân hàng' ? 'tài khoản' : 'bản ghi'}
              </span>
            ),
          }}
        />
      </div>

      {/* MODAL: THÊM / CHỈNH SỬA NGÂN HÀNG CHO NHÂN SỰ */}
      <Modal
        open={isBankModalOpen}
        onCancel={() => setIsBankModalOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BankOutlined style={{ color: '#009688' }} />
            <span>{editingBankAccount ? 'Chỉnh sửa ngân hàng' : 'Thêm ngân hàng'}</span>
          </div>
        }
        width={620}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setIsBankModalOpen(false)} style={{ borderRadius: 6 }}>
              Hủy
            </Button>
            <Button
              type="primary"
              onClick={handleSaveBank}
              style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 6 }}
            >
              {editingBankAccount ? 'Cập nhật' : 'Thêm ngân hàng'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 6 }}>
          {!editingBankAccount && (
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>
                Nhân sự <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <Select
                showSearch
                placeholder="Tìm kiếm hoặc chọn nhân sự..."
                value={bankForm.employeeCode}
                onChange={handleEmployeeSelectChange}
                options={employees.map(e => ({
                  value: e.code,
                  label: `${e.name} (${e.code}) - ${e.department || 'Nhân sự'}`,
                }))}
                style={{ width: '100%' }}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>
              Ngân hàng <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <Select
              showSearch
              placeholder="Tìm kiếm hoặc chọn ngân hàng..."
              value={bankForm.bankName}
              onChange={val => setBankForm(prev => ({ ...prev, bankName: val }))}
              options={BANK_OPTIONS}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>
                Số tài khoản <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <Input
                placeholder="Nhập số tài khoản..."
                value={bankForm.accountNumber}
                onChange={e => setBankForm(prev => ({ ...prev, accountNumber: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>
                Tên chủ tài khoản <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <Input
                placeholder="VD: NGUYEN VAN A"
                value={bankForm.accountHolder}
                onChange={e => setBankForm(prev => ({ ...prev, accountHolder: e.target.value.toUpperCase() }))}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Chi nhánh ngân hàng</label>
              <Input
                placeholder="VD: Chi nhánh Tân Định - TP.HCM"
                value={bankForm.branch}
                onChange={e => setBankForm(prev => ({ ...prev, branch: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Trạng thái</label>
              <Select
                value={bankForm.status || 'Đã duyệt'}
                onChange={val => setBankForm(prev => ({ ...prev, status: val }))}
                options={[
                  { value: 'Đã duyệt', label: 'Đã duyệt' },
                  { value: 'Chờ duyệt', label: 'Chờ duyệt' },
                  { value: 'Từ chối', label: 'Từ chối' },
                ]}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div>
            <Checkbox
              checked={bankForm.isPrimary}
              onChange={e => setBankForm(prev => ({
                ...prev,
                isPrimary: e.target.checked,
              }))}
            >
              <span style={{ fontWeight: 500, color: '#1E293B' }}>Đặt làm tài khoản nhận lương chính</span>
            </Checkbox>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ghi chú</label>
            <Input
              placeholder="Ghi chú thêm nếu có..."
              value={bankForm.note || ''}
              onChange={e => setBankForm(prev => ({ ...prev, note: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      {/* MODAL: XEM CHI TIẾT TÀI KHOẢN NGÂN HÀNG */}
      <Modal
        open={isBankViewModalOpen}
        onCancel={() => setIsBankViewModalOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BankOutlined style={{ color: '#009688' }} />
            <span>Thông tin chi tiết ngân hàng</span>
          </div>
        }
        width={580}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="primary"
              onClick={() => setIsBankViewModalOpen(false)}
              style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 6 }}
            >
              Đóng
            </Button>
          </div>
        }
      >
        {viewingBankAccount && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Tên ngân hàng</label>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{viewingBankAccount?.bankName || '--'}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Số tài khoản</label>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#009688' }}>{viewingBankAccount?.accountNumber || '--'}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Tên chủ tài khoản</label>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1E293B' }}>{viewingBankAccount?.accountHolder || '--'}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Chi nhánh</label>
                <div style={{ fontSize: 13, color: '#334155' }}>{viewingBankAccount.branch || '--'}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Trạng thái</label>
                <div>
                  {viewingBankAccount.status === 'Chờ duyệt' ? (
                    <span style={{ background: '#FEF3C7', color: '#D97706', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <ClockCircleOutlined /> Chờ duyệt
                    </span>
                  ) : viewingBankAccount.status === 'Từ chối' ? (
                    <span style={{ background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <CloseCircleOutlined /> Từ chối
                    </span>
                  ) : (
                    <span style={{ background: '#DCFCE7', color: '#16A34A', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircleOutlined /> Đã duyệt
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Loại tài khoản</label>
                <div style={{ fontSize: 13, color: '#334155' }}>
                  {viewingBankAccount.isPrimary && viewingBankAccount.status === 'Đã duyệt'
                    ? 'Tài khoản nhận lương chính'
                    : viewingBankAccount.isPrimary && viewingBankAccount.status === 'Chờ duyệt'
                    ? 'Tài khoản phụ (Đề xuất chính - Chờ duyệt)'
                    : 'Tài khoản phụ'}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Ngày cập nhật</label>
                <div style={{ fontSize: 13, color: '#334155' }}>{viewingBankAccount.createdAt || '15/03/2024'}</div>
              </div>
            </div>

            {viewingBankAccount.note && (
              <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Ghi chú</label>
                <div style={{ fontSize: 13, color: '#334155' }}>{viewingBankAccount.note}</div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal Add General History Record */}
      <Modal
        title="Ghi nhận biến động nhân sự mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã hồ sơ" initialValue={`LS-2026-${Math.floor(100 + Math.random() * 900)}`}>
              <Input />
            </Form.Item>
            <Form.Item name="type" label="Loại biến động" initialValue="Chức vụ">
              <Select
                options={[
                  { label: 'Chức vụ / Bổ nhiệm', value: 'Chức vụ' },
                  { label: 'Thuyên chuyển phòng ban', value: 'Thuyên chuyển' },
                  { label: 'Khen thưởng & Vinh danh', value: 'Khen thưởng' },
                  { label: 'Nghỉ việc / Thôi việc', value: 'Nghỉ việc' },
                  { label: 'Kỷ luật & Sự cố', value: 'Kỷ luật sự cố' },
                  { label: 'Ngân hàng / Thay đổi số tài khoản', value: 'Ngân hàng' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Họ tên nhân viên" rules={[{ required: true, message: 'Nhập tên' }]}>
              <Input placeholder="Ví dụ: Hoàng Quốc Dũng" />
            </Form.Item>
            <Form.Item name="employeeCode" label="Mã nhân viên" initialValue={`NV-${Math.floor(10000 + Math.random() * 90000)}`}>
              <Input />
            </Form.Item>
          </div>

          <Form.Item name="newValue" label="Nội dung biến động mới" rules={[{ required: true, message: 'Nhập nội dung' }]}>
            <Input placeholder="Ví dụ: Bổ nhiệm Trưởng Nhóm Phát Triển..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="decisionNumber" label="Số quyết định" initialValue={`QĐ-2026/${Math.floor(100 + Math.random() * 900)}-QĐ`}>
              <Input />
            </Form.Item>
            <Form.Item name="signer" label="Người ký quyết định" initialValue="Nguyễn Văn Minh (CEO)">
              <Input />
            </Form.Item>
          </div>

          <Form.Item name="eventDate" label="Ngày có hiệu lực" initialValue={new Date().toISOString().substring(0, 10)}>
            <Input type="date" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu hồ sơ biến động
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

