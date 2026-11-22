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
  SafetyCertificateOutlined,
  IdcardOutlined,
  VideoCameraOutlined,
  FileTextOutlined,
  AuditOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Checkbox, Tag } from '../../custom-ui';
import { EmployeeSelect } from './EmployeeSelect';
import { dataService, Employee } from '../../services/dataService';
import { employeesApi, collectionsApi, ekycApi } from '../../api/endpoints';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';

import { terminationApi, type TerminationSettlement } from '../../api/endpoints';
import { TERMINATION_TYPE_OPTIONS } from './terminationTypes';
import { DISCIPLINE_ATTENDANCE_OPTIONS, DISCIPLINE_FORMS, DISCIPLINE_FORM_OPTIONS, DISMISSAL_GROUND_OPTIONS, PROTECTED_STATUS_OPTIONS, VIOLATION_KIND_OPTIONS } from './disciplineOptions';

export interface HistoryRecord {
  key: string;
  code: string;
  employeeName: string;
  employeeCode: string;
  employeeId?: string;
  type: 'Chức vụ' | 'Thuyên chuyển' | 'Nghỉ việc' | 'Khen thưởng' | 'Kỷ luật sự cố' | 'Ngân hàng' | 'Xác thực danh tính';
  eventDate: string;
  oldValue: string;
  newValue: string;
  decisionNumber: string;
  signer: string;
  note: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  termination?: Record<string, any>;
  settlement?: TerminationSettlement;
  discipline?: Record<string, any>;
  disciplineAssessment?: { limitationMonths: number; limitationDeadline: string; earliestHearingDate: string; formLabel: string };
}

const INITIAL_HISTORY_DATA: HistoryRecord[] = [];
const generalHistoryTypes: HistoryRecord['type'][] = ['Chức vụ', 'Thuyên chuyển', 'Nghỉ việc', 'Khen thưởng', 'Kỷ luật sự cố'];

export function validateEmployeeHistory(record: Partial<HistoryRecord>): string {
  if (!record.employeeId) return 'Vui lòng chọn nhân viên có trong hệ thống.';
  if (!generalHistoryTypes.includes(record.type!)) return 'Loại biến động không hợp lệ.';
  const date = record.eventDate || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) return 'Ngày hiệu lực không hợp lệ.';
  if (!record.newValue?.trim()) return 'Vui lòng nhập giá trị mới của biến động.';
  return '';
}

export function filterEmployeeHistory(records: HistoryRecord[], type: HistoryRecord['type'] | 'all', query: string): HistoryRecord[] {
  const search = query.trim().toLowerCase();
  return records.filter(record => (type === 'all' || record.type === type) && (!search || [record.code, record.employeeName, record.employeeCode, record.decisionNumber, record.oldValue, record.newValue, record.signer, record.note].some(value => String(value || '').toLowerCase().includes(search))));
}

// Helper function to detect correct Vietnamese Gender
const detectGender = (nameStr: string): 'Nam' | 'Nữ' => {
  const n = String(nameStr || '').toUpperCase();
  if (
    n.includes('THỊ') ||
    n.includes('HÀ') ||
    n.includes('HƯƠNG') ||
    n.includes('TRANG') ||
    n.includes('NHI') ||
    n.includes('LAN') ||
    n.includes('MAI') ||
    n.includes('LINH') ||
    n.includes('HOÀNG YẾN')
  ) {
    return 'Nữ';
  }
  return 'Nam';
};

const firstText = (...values: any[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
};

const normalizeDisplayDate = (value: any) => {
  const raw = firstText(value);
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const normalizeDateOnly = (value: any) => {
  const raw = firstText(value);
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('vi-VN');
};

const isRealEkycRecord = (record: any) => Boolean(
  record?.ekycVerified ||
  record?.docNumber ||
  record?.idNumber ||
  record?.identityNumber ||
  record?.certificateId ||
  record?.verifiedAt ||
  record?.cardFrontUrl ||
  record?.cardBackUrl ||
  record?.liveVideoUrl ||
  record?.livePhotoUrl ||
  record?.faceMatchScore
);

const matchesStoredEkyc = (stored: any, employee: any) => {
  if (!stored || !employee) return false;
  const storedName = firstText(stored.name, stored.fullName).toLowerCase();
  const employeeName = firstText(employee.name, employee.fullName).toLowerCase();
  return Boolean(
    (stored.userId && (stored.userId === employee.id || stored.userId === employee.userId)) ||
    (stored.employeeCode && stored.employeeCode === (employee.code || employee.employeeCode)) ||
    (storedName && employeeName)
  );
};

// Dòng xác thực danh tính của một nhân viên từ hồ sơ (details lấy từ GET /employees/:id; danh sách nhân viên không trả details).
const identityRowOf = (emp: any, index: number, storedEkycData: any) => {
  const empName = emp.name || emp.fullName || '';
  const matchedEkyc = matchesStoredEkyc(storedEkycData, emp) ? storedEkycData : null;
  
  let details: any = {};
  if (emp.details && typeof emp.details === 'object') {
    details = emp.details;
  } else if (typeof emp.detailsJson === 'string') {
    try { details = JSON.parse(emp.detailsJson); } catch {}
  }
  
  const source = { ...details, ...matchedEkyc, ...emp };

  const cccdNum = source.docNumber || source.idNumber || source.identityNumber || '';
  const isVerified = Boolean(source.ekycVerified && cccdNum);
  const verifiedAtStr = isVerified ? normalizeDisplayDate(source.verifiedAt || source.updatedAt || source.profileUpdatedAt) : '';
  const faceMatchScore = source.faceMatchScore ? Number(source.faceMatchScore) : 0;
  const certificateId = source.certificateId || source.certId || '';

  return {
    id: `id-real-${emp.id || index}`,
    userId: emp.id || '',
    employeeCode: emp.code || emp.employeeCode || `EMP-${index + 100}`,
    employeeName: empName,
    department: emp.department || 'Chưa phân công',
    position: emp.position || 'Nhân sự',
    email: emp.email || '',
    phone: emp.phone || '',
    avatar: source.cardAvatarUrl || source.livePhotoUrl || source.avatarUrl || emp.avatar || '',
    idType: cccdNum ? (source.docType || 'Căn cước công dân') : 'Chưa có dữ liệu',
    idNumber: cccdNum || '',
    verifiedAt: verifiedAtStr || '—',
    verifiedBy: isVerified ? (source.verifiedBy || 'Hồ sơ nhân sự') : '—',
    status: isVerified ? 'Đã xác thực' : 'Chưa xác thực',
    isVerified,
    hash: isVerified ? (source.sha256 || source.hash || (certificateId ? `Certificate: ${certificateId}` : '')) : '',
    note: isVerified
      ? `Dữ liệu đồng bộ từ Xác thực danh tính${faceMatchScore ? `, FaceMatch ${faceMatchScore}%` : ''}.`
      : 'Chưa hoàn tất xác thực danh tính eKYC.',
    dob: normalizeDateOnly(source.birthDate || source.dob) || '',
    gender: source.gender || '',
    hometown: source.originPlace || source.hometown || '',
    address: source.residencePlace || source.hkttAddress || source.currentAddress || source.address || '',
    issueDate: source.issueDate || source.docIssueDate || '',
    issuePlace: source.issuePlace || source.docIssuePlace || '',
    expiryDate: source.expiryDate || source.docExpiryDate || '',
    livePhotoUrl: source.livePhotoUrl || '',
    liveVideoUrl: source.liveVideoUrl || '',
    cardFrontUrl: source.cardFrontUrl || '',
    cardBackUrl: source.cardBackUrl || '',
    cardAvatarUrl: source.cardAvatarUrl || '',
    faceMatchScore,
    certificateId,
  };
};

const CCCDCardPreview: React.FC<{ employee: any; side: 'front' | 'back' }> = ({ employee, side }) => {
  const [imgError, setImgError] = useState(false);
  const sourceImage = side === 'front' ? employee.cardFrontUrl : employee.cardBackUrl;
  const isImageValid = Boolean(
    sourceImage &&
    !imgError &&
    (sourceImage.startsWith('data:image') || sourceImage.startsWith('http') || sourceImage.startsWith('/assets') || sourceImage.startsWith('/'))
  );

  if (isImageValid) {
    return (
      <div style={{ width: '100%', maxWidth: 560 }}>
        <img
          src={sourceImage}
          alt={side === 'front' ? 'CCCD mặt trước' : 'CCCD mặt sau'}
          onError={() => setImgError(true)}
          style={{ width: '100%', borderRadius: 10, border: '1px solid #BAE6FD', objectFit: 'contain', background: '#F8FAFC', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
        />
      </div>
    );
  }

  if (!employee.idNumber && !employee.isVerified) {
    return (
      <div style={{ textAlign: 'center', padding: '36px 16px', background: '#F8FAFC', borderRadius: 10, border: '1px dashed #CBD5E1', width: '100%', maxWidth: 540 }}>
        <IdcardOutlined style={{ fontSize: 40, color: '#94A3B8', marginBottom: 12 }} />
        <div style={{ fontWeight: 600, color: '#64748B', fontSize: 13.5 }}>Chưa có dữ liệu Căn cước công dân</div>
        <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Nhân sự chưa cập nhật thông tin CCCD hoặc chưa tải lên ảnh giấy tờ xác thực.</div>
      </div>
    );
  }

  // Không có ảnh giấy tờ (chưa chụp hoặc đã xóa theo yêu cầu rút đồng ý): chỉ liệt kê dữ liệu đã lưu, không dựng thẻ giả.
  const rows: Array<[string, string]> = side === 'front'
    ? [['Số định danh', employee.idNumber], ['Họ tên', employee.employeeName], ['Ngày sinh', employee.dob], ['Giới tính', employee.gender], ['Quê quán', employee.hometown], ['Nơi thường trú', employee.address], ['Có giá trị đến', employee.expiryDate]]
    : [['Ngày cấp', employee.issueDate], ['Nơi cấp', employee.issuePlace]];
  return (
    <div style={{ padding: 16, background: '#F8FAFC', borderRadius: 10, border: '1px dashed #CBD5E1', width: '100%', maxWidth: 540, fontSize: 12.5 }}>
      <div style={{ color: '#64748B', marginBottom: 8 }}>Chưa có ảnh {side === 'front' ? 'mặt trước' : 'mặt sau'} thẻ căn cước. Thông tin đã lưu trong hồ sơ:</div>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0' }}>
          <span style={{ color: '#64748B' }}>{label}</span>
          <span style={{ color: '#0F172A', textAlign: 'right' }}>{value || '—'}</span>
        </div>
      ))}
    </div>
  );
};

const EKYCVideoPlayback: React.FC<{ employee: any; verifiedAt: string }> = ({ employee, verifiedAt }) => {
  const [videoError, setVideoError] = useState(false);
  const liveVideoUrl = firstText(employee.liveVideoUrl);
  const livePhotoUrl = firstText(employee.livePhotoUrl, employee.cardAvatarUrl);
  const faceMatchLabel = employee.faceMatchScore ? `FaceMatch ${employee.faceMatchScore}%` : 'Chưa có điểm FaceMatch';

  const hasPlayableVideo = Boolean(
    liveVideoUrl &&
    !videoError &&
    (liveVideoUrl.startsWith('http') || liveVideoUrl.startsWith('data:video') || liveVideoUrl.startsWith('/'))
  );

  if (!hasPlayableVideo && !livePhotoUrl && !employee.isVerified) {
    return (
      <div style={{ textAlign: 'center', padding: '36px 16px', background: '#F8FAFC', borderRadius: 10, border: '1px dashed #CBD5E1' }}>
        <VideoCameraOutlined style={{ fontSize: 40, color: '#94A3B8', marginBottom: 12 }} />
        <div style={{ fontWeight: 600, color: '#64748B', fontSize: 13.5 }}>Chưa có dữ liệu Video / Sinh trắc học eKYC</div>
        <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Nhân sự chưa thực hiện quét khuôn mặt hoặc xác thực sinh trắc học.</div>
      </div>
    );
  }

  return (
    <div style={{ background: '#FFFFFF', borderRadius: 10, padding: 16, color: '#0F172A', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
        <span style={{ color: '#0F766E', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: employee.isVerified ? '#22C55E' : '#EF4444', display: 'inline-block', boxShadow: employee.isVerified ? '0 0 0 3px rgba(34, 197, 94, 0.2)' : '0 0 0 3px rgba(239, 68, 68, 0.2)' }} />
          Sinh trắc học Liveness xác thực: {verifiedAt && verifiedAt !== '—' ? verifiedAt : 'Chưa xác thực'}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <Tag color={employee.isVerified ? 'success' : 'error'} style={{ margin: 0, fontWeight: 700 }}>
            {employee.isVerified ? '✓ Live Check PASS' : 'Chưa xác thực'}
          </Tag>
          {employee.faceMatchScore ? <Tag color="processing" style={{ margin: 0, fontWeight: 700 }}>{faceMatchLabel}</Tag> : null}
        </div>
      </div>

      {hasPlayableVideo ? (
        <video
          src={liveVideoUrl}
          controls
          playsInline
          onError={() => setVideoError(true)}
          style={{ width: '100%', maxHeight: 360, borderRadius: 8, background: '#0F172A', border: '1px solid #CBD5E1' }}
          poster={livePhotoUrl || undefined}
        />
      ) : livePhotoUrl ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0' }}>
          <div
            style={{
              width: 140,
              height: 175,
              borderRadius: 10,
              overflow: 'hidden',
              border: '3px solid #10B981',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
              background: '#F8FAFC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img src={livePhotoUrl} alt="Ảnh sinh trắc học" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>Ảnh chụp chân dung sinh trắc học</div>
        </div>
      ) : null}
    </div>
  );
};

export const EmployeeHistoryModule: React.FC<{ defaultType?: HistoryRecord['type'] | 'all' }> = ({
  defaultType = 'Chức vụ',
}) => {
  const [data, setData] = useState<HistoryRecord[]>(INITIAL_HISTORY_DATA);
  const [typeFilter, setTypeFilter] = useState<HistoryRecord['type'] | 'all'>(defaultType);
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHistory, setEditingHistory] = useState<HistoryRecord | null>(null);
  const [viewingHistory, setViewingHistory] = useState<HistoryRecord | null>(null);
  const [resignForm, setResignForm] = useState(false);
  const [disciplineForm, setDisciplineForm] = useState(false);
  const [terminationPreview, setTerminationPreview] = useState<TerminationSettlement | null>(null);
  const [terminationChecking, setTerminationChecking] = useState(false);
  const [historyEmployees, setHistoryEmployees] = useState<Array<{ key: string; name: string; code: string }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySaving, setHistorySaving] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [form] = Form.useForm();
  const [bankStatusFilter, setBankStatusFilter] = useState<string>('all');

  const [identityData, setIdentityData] = useState<any[]>([]);
  const [isIdentityViewModalOpen, setIsIdentityViewModalOpen] = useState(false);
  const [viewingIdentity, setViewingIdentity] = useState<any | null>(null);
  const [identityTab, setIdentityTab] = useState<'cccd' | 'video' | 'info'>('cccd');
  // Mở hộp thoại xác thực danh tính: tải hồ sơ đầy đủ (ảnh thẻ, ảnh, video eKYC) của nhân viên từ máy chủ.
  const openIdentity = async (record: any, tab: 'cccd' | 'video' | 'info') => {
    let row = record;
    if (record.userId) {
      try {
        const { data } = await employeesApi.getOne(record.userId);
        if (data?.employee) row = { ...record, ...identityRowOf(data.employee, 0, null), id: record.id, employeeCode: record.employeeCode };
      } catch {
        message.warning('Không tải được hồ sơ đầy đủ; đang hiện dữ liệu tóm tắt.');
      }
    }
    setViewingIdentity(row);
    setIdentityTab(tab);
    setIsIdentityViewModalOpen(true);
  };

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
  const [bankOptions, setBankOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [isBankViewModalOpen, setIsBankViewModalOpen] = useState(false);
  const [editingBankAccount, setEditingBankAccount] = useState<any | null>(null);
  const [viewingBankAccount, setViewingBankAccount] = useState<any | null>(null);
  const [bankForm, setBankForm] = useState({
    employeeCode: '',
    employeeName: '',
    bankName: '',
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

  const loadEmployees = async () => {
    try {
      const response = await employeesApi.getAll();
      const rawList = response.data?.data || [];
      setHistoryEmployees(rawList.map(employee => ({ key: employee.id || employee.userId || employee.key, name: employee.name || employee.fullName, code: employee.employeeCode || employee.code })));
      const activeEmps = rawList.filter((item: any) => item?.role !== 'ADMIN' && item?.status !== 'Đã nghỉ việc');
      setEmployees(
        activeEmps.map((item: any) => ({
          key: item.key || item.id,
          code: item.code || item.employeeCode,
          name: item.name || item.fullName,
          email: item.email,
          phone: item.phone,
          department: item.department,
          position: item.position,
          status: item.status,
          joinDate: item.joinDate,
          salaryBase: Number(item.salaryBase) || 0,
          avatar: item.avatar,
        }))
      );

      let storedEkycData: any = null;
      try {
        const rawEkyc = localStorage.getItem('employee_ekyc_verified');
        if (rawEkyc) {
          storedEkycData = JSON.parse(rawEkyc);
        }
      } catch (e) {}

      const realIdentityRows = activeEmps.map((emp: any, index: number) => identityRowOf(emp, index, storedEkycData));

      setIdentityData(realIdentityRows);
      localStorage.setItem('employee_identity_history', JSON.stringify(realIdentityRows));
    } catch (e) {}
  };

  useEffect(() => {
    void loadEmployees();
    void loadHistory();
    loadBankAccounts();
    const banks = dataService.getDropdownOptions('banks');
    if (banks && banks.length > 0) {
      setBankOptions(
        banks
          .filter((b) => b.isActive !== false)
          .map((b) => ({ value: b.name, label: `${b.name}${b.code ? ` (${b.code})` : ''}` }))
      );
    } else {
      setBankOptions([
        { value: 'Vietcombank', label: 'Vietcombank (VCB)' },
        { value: 'Techcombank', label: 'Techcombank' },
        { value: 'MBBank', label: 'MBBank (MB)' },
        { value: 'BIDV', label: 'BIDV' },
        { value: 'VietinBank', label: 'VietinBank' },
        { value: 'VPBank', label: 'VPBank' },
        { value: 'ACB', label: 'ACB' },
        { value: 'TPBank', label: 'TPBank' },
        { value: 'Sacombank', label: 'Sacombank' },
      ]);
    }
  }, []);

  useEffect(() => {
    setTypeFilter(defaultType);
  }, [defaultType]);

  const loadHistory = async (): Promise<boolean> => {
    setHistoryLoading(true);
    try {
      const records = await dataService.refreshGenericData('hr_employee_history');
      setData(records.map((record: HistoryRecord & { id?: string }) => ({ ...record, key: record.key || record.id || '' })).sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || '')));
      setHistoryError('');
      return true;
    } catch (error: any) {
      setHistoryError(error?.response?.data?.message || 'Không thể tải lịch sử biến động nhân sự. Vui lòng thử lại.');
      return false;
    } finally { setHistoryLoading(false); }
  };

  const openHistory = (record?: HistoryRecord) => {
    setEditingHistory(record || null);
    form.resetFields();
    const initialType = record?.type || (generalHistoryTypes.includes(typeFilter as HistoryRecord['type']) ? typeFilter : 'Chức vụ');
    const termination = record?.termination || {};
    form.setFieldsValue(record
      ? { ...record, terminationType: termination.type, workStartDate: termination.workStartDate, contractKind: termination.contractKind, termMonths: termination.termMonths, noticeGivenDate: termination.noticeGivenDate, exemptFromNotice: termination.exemptFromNotice, averageSalary: termination.averageSalary, unemploymentInsuredMonths: termination.unemploymentInsuredMonths, paidSeveranceMonths: termination.paidSeveranceMonths, unusedLeaveDays: termination.unusedLeaveDays }
      : { type: initialType, eventDate: new Date().toISOString().slice(0, 10), contractKind: 'indefinite', unemploymentInsuredMonths: 0, paidSeveranceMonths: 0, unusedLeaveDays: 0 });
    setResignForm(initialType === 'Nghỉ việc');
    setDisciplineForm(initialType === 'Kỷ luật sự cố');
    if (record?.discipline) {
      const d = record.discipline;
      form.setFieldsValue({ discForm: d.form, discKind: d.violationKind, discViolationDate: d.violationDate, discDiscoveredDate: d.discoveredDate, discNoticeDate: d.noticeDate, discHearingDate: d.hearingDate, discAttendance: d.attendance, discUnion: d.unionParticipated ? 'yes' : d.noUnionOrganization ? 'none' : undefined, discMinutes: d.minutesRecorded === true, discProtected: d.protectedStatus || 'none', discDelayMonths: d.delayMonths, discGround: d.dismissalGround, discManagerial: d.managerialPosition === true });
    }
    setTerminationPreview(record?.settlement || null);
    setModalOpen(true);
  };

  // Handle Create General History
  const terminationPayload = (values: any) => ({
    employeeId: values.employeeId, type: values.terminationType, lastWorkingDate: values.eventDate, workStartDate: values.workStartDate || undefined,
    contractKind: values.contractKind, termMonths: values.contractKind === 'fixed' ? Number(values.termMonths) : undefined, noticeGivenDate: values.noticeGivenDate || undefined,
    exemptFromNotice: values.exemptFromNotice === true, averageSalary: values.averageSalary === undefined || values.averageSalary === '' ? undefined : Number(values.averageSalary),
    unemploymentInsuredMonths: Number(values.unemploymentInsuredMonths) || 0, paidSeveranceMonths: Number(values.paidSeveranceMonths) || 0, unusedLeaveDays: Number(values.unusedLeaveDays) || 0,
  });

  // Hồ sơ xử lý kỷ luật lao động gửi lên máy chủ; ngày ở form là ngày ra quyết định. Máy chủ kiểm tra lại toàn bộ.
  const disciplinePayload = (values: any) => ({
    form: values.discForm, violationKind: values.discKind, violationDate: values.discViolationDate, discoveredDate: values.discDiscoveredDate,
    noticeDate: values.discNoticeDate, hearingDate: values.discHearingDate, decisionDate: values.eventDate, attendance: values.discAttendance,
    unionParticipated: values.discUnion === 'yes', noUnionOrganization: values.discUnion === 'none', minutesRecorded: values.discMinutes === true,
    protectedStatus: values.discProtected || 'none', delayMonths: values.discDelayMonths === undefined || values.discDelayMonths === '' ? undefined : Number(values.discDelayMonths),
    dismissalGround: values.discGround, managerialPosition: values.discManagerial === true,
  });

  const calculateTermination = async () => {
    const values = form.getFieldsValue();
    if (!values.employeeId || !values.terminationType || !values.eventDate) { message.error('Chọn nhân viên, hình thức chấm dứt và ngày hiệu lực.'); return; }
    setTerminationChecking(true);
    try {
      const response = await terminationApi.settle(terminationPayload(values));
      setTerminationPreview(response.data.settlement);
      const defaults = response.data.defaults;
      form.setFieldsValue({
        workStartDate: values.workStartDate || defaults.workStartDate || response.data.settlement.workStartDate,
        averageSalary: values.averageSalary === undefined || values.averageSalary === '' ? response.data.settlement.averageSalary : values.averageSalary,
      });
    } catch (error: any) {
      setTerminationPreview(null);
      message.error(error?.response?.data?.message || 'Không tính được trợ cấp chấm dứt hợp đồng.');
    } finally {
      setTerminationChecking(false);
    }
  };

  const handleCreateHistory = async (values: any) => {
    if (historySaving) return;
    const employee = historyEmployees.find(item => item.key === values.employeeId);
    const newRec: HistoryRecord = {
      ...editingHistory,
      key: editingHistory?.key || `hist-${crypto.randomUUID()}`,
      code: editingHistory?.code || `LS-${Date.now()}`,
      employeeId: employee?.key,
      employeeName: employee?.name || '',
      employeeCode: employee?.code || '',
      type: values.type,
      eventDate: values.eventDate || '',
      oldValue: String(values.oldValue || '').trim(),
      newValue: String(values.newValue || '').trim(),
      decisionNumber: String(values.decisionNumber || '').trim(),
      signer: String(values.signer || '').trim(),
      note: String(values.note || '').trim(),
      ...(values.type === 'Nghỉ việc' && values.terminationType ? { termination: terminationPayload(values) } : {}),
      ...(values.type === 'Kỷ luật sự cố' && values.discForm ? { discipline: disciplinePayload(values) } : {}),
    };
    const validation = validateEmployeeHistory(newRec);
    if (validation) { message.error(validation); return; }
    setHistorySaving(true);
    try {
      const result = editingHistory ? await collectionsApi.update('hr_employee_history', editingHistory.key, newRec) : await collectionsApi.create('hr_employee_history', newRec, newRec.key);
      setData(previous => (editingHistory ? previous.map(record => record.key === editingHistory.key ? result.data.record : record) : [result.data.record, ...previous]).sort((a, b) => b.eventDate.localeCompare(a.eventDate)));
      message.success(editingHistory ? 'Đã cập nhật biến động nhân sự.' : 'Đã lưu biến động nhân sự.');
      setModalOpen(false); setEditingHistory(null); form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu biến động nhân sự.');
    } finally { setHistorySaving(false); }
  };

  const deleteHistory = (record: HistoryRecord) => {
    Modal.confirm({
      title: 'Xóa bản ghi biến động nhân sự?', content: `${record.code} · ${record.employeeName} · ${record.type}`, okText: 'Xóa', cancelText: 'Hủy',
      onOk: async () => {
        setHistorySaving(true);
        try {
          await collectionsApi.remove('hr_employee_history', record.key);
          setData(previous => previous.filter(item => item.key !== record.key));
          message.success('Đã xóa bản ghi biến động nhân sự.');
        } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể xóa bản ghi biến động nhân sự.'); }
        finally { setHistorySaving(false); }
      },
    });
  };

  // Handle Bank Accounts Actions
  const handleOpenAddBank = () => {
    setEditingBankAccount(null);
    setBankForm({
      employeeCode: '',
      employeeName: '',
      bankName: '',
      accountNumber: '',
      accountHolder: '',
      branch: '',
      status: 'Đã duyệt',
      isPrimary: true,
      note: '',
    });
    setIsBankModalOpen(true);
  };

  const handleOpenEditBank = (record: any) => {
    setEditingBankAccount(record);
    setBankForm({
      employeeCode: record.employeeCode || '',
      employeeName: record.employeeName || '',
      bankName: record.bankName || '',
      accountNumber: record.accountNumber || '',
      accountHolder: record.accountHolder || '',
      branch: record.branch || '',
      status: record.status || 'Đã duyệt',
      isPrimary: record.isPrimary !== false,
      note: record.note || '',
    });
    setIsBankModalOpen(true);
  };

  const handleSaveBank = () => {
    if (!bankForm.employeeName || !bankForm.bankName || !bankForm.accountNumber) {
      message.error('Vui lòng nhập đầy đủ thông tin nhân sự, tên ngân hàng và số tài khoản!');
      return;
    }
    const payload = {
      id: editingBankAccount ? editingBankAccount.id : `bank-${Date.now()}`,
      employeeCode: bankForm.employeeCode,
      employeeName: bankForm.employeeName,
      bankName: bankForm.bankName,
      accountNumber: bankForm.accountNumber,
      accountHolder: bankForm.accountHolder || bankForm.employeeName.toUpperCase(),
      branch: bankForm.branch,
      status: bankForm.status,
      isPrimary: bankForm.isPrimary,
      note: bankForm.note,
      updatedAt: new Date().toLocaleDateString('vi-VN'),
    };
    dataService.saveEmployeeBankAccount(payload);
    message.success(editingBankAccount ? 'Đã cập nhật tài khoản ngân hàng!' : 'Đã thêm mới tài khoản ngân hàng!');
    setIsBankModalOpen(false);
    setEditingBankAccount(null);
    loadBankAccounts();
  };

  const handleApproveBank = (record: any) => {
    dataService.approveEmployeeBankAccount(record.id);
    message.success(`Đã phê duyệt tài khoản ngân hàng "${record.bankName}" của ${record.employeeName || 'nhân sự'} thành công!`);
    loadBankAccounts();
    if (viewingBankAccount && viewingBankAccount.id === record.id) {
      setViewingBankAccount({ ...viewingBankAccount, status: 'Đã duyệt' });
    }
  };

  const handleRejectBank = (record: any) => {
    Modal.confirm({
      title: 'Từ chối tài khoản ngân hàng?',
      content: `Bạn có chắc chắn muốn từ chối tài khoản "${record.bankName}" của nhân sự ${record.employeeName || ''} không?`,
      okText: 'Từ chối duyệt',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: () => {
        dataService.rejectEmployeeBankAccount(record.id, 'Thông tin chưa trùng khớp với hồ sơ nhân sự');
        message.warning(`Đã từ chối tài khoản ngân hàng "${record.bankName}".`);
        loadBankAccounts();
        if (viewingBankAccount && viewingBankAccount.id === record.id) {
          setViewingBankAccount({ ...viewingBankAccount, status: 'Từ chối' });
        }
      },
    });
  };

  const handleDeleteBank = (id: string, bankName: string, empName: string) => {
    Modal.confirm({
      title: 'Xóa tài khoản ngân hàng?',
      content: `Bạn có chắc chắn muốn xóa tài khoản "${bankName}" của nhân sự ${empName} không?`,
      okText: 'Xóa',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: () => {
        dataService.deleteEmployeeBankAccount(id);
        message.success('Đã xóa tài khoản ngân hàng.');
        loadBankAccounts();
      },
    });
  };

  // Filtered Bank Accounts Data
  const filteredBankAccounts = (bankAccounts || []).filter((b) => {
    if (!b) return false;
    const q = (searchText || '').toLowerCase();
    const empName = b.employeeName || '';
    const empCode = b.employeeCode || '';
    const bankName = b.bankName || '';
    const accNum = b.accountNumber || '';
    const holder = b.accountHolder || '';
    const branch = b.branch || '';

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

  // Filtered Identity Verification Data
  const filteredIdentityData = (identityData || []).filter((item) => {
    if (!item) return false;
    const q = (searchText || '').toLowerCase();
    return (
      !q ||
      (item.employeeName && item.employeeName.toLowerCase().includes(q)) ||
      (item.employeeCode && item.employeeCode.toLowerCase().includes(q)) ||
      (item.idNumber && item.idNumber.toLowerCase().includes(q)) ||
      (item.idType && item.idType.toLowerCase().includes(q)) ||
      (item.verifiedBy && item.verifiedBy.toLowerCase().includes(q))
    );
  });

  // Filtered History Data
  const filteredHistoryData = filterEmployeeHistory(data, typeFilter, searchText);

  const exportHistory = () => {
    const rows = typeFilter === 'Ngân hàng'
      ? [['Mã nhân viên', 'Họ tên', 'Ngân hàng', 'Số tài khoản', 'Chủ tài khoản', 'Chi nhánh', 'Trạng thái'], ...filteredBankAccounts.map(record => [record.employeeCode, record.employeeName, record.bankName, record.accountNumber, record.accountHolder, record.branch, record.status])]
      : typeFilter === 'Xác thực danh tính'
      ? [['Mã nhân viên', 'Họ tên', 'Loại giấy tờ', 'Số giấy tờ', 'Thời gian xác thực', 'Trạng thái'], ...filteredIdentityData.map(record => [record.employeeCode, record.employeeName, record.idType, record.idNumber, record.verifiedAt, record.status])]
      : [['Mã hồ sơ', 'Mã nhân viên', 'Họ tên', 'Loại biến động', 'Ngày hiệu lực', 'Giá trị cũ', 'Giá trị mới', 'Số quyết định', 'Người ký quyết định', 'Ghi chú'], ...filteredHistoryData.map(record => [record.code, record.employeeCode, record.employeeName, record.type, record.eventDate, record.oldValue, record.newValue, record.decisionNumber, record.signer, record.note])];
    downloadFile(`Lich_su_nhan_su_${new Date().toISOString().slice(0, 10)}.xlsx`, generateValidXlsxBlob(rows));
    message.success('Đã tải báo cáo theo dữ liệu và bộ lọc hiện tại.');
  };

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
        let color = '#2196F3';
        if (type === 'Khen thưởng') color = '#4CAF50';
        if (type === 'Nghỉ việc') color = '#F44336';
        if (type === 'Kỷ luật sự cố') color = '#FF9800';
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              backgroundColor: `${color}15`,
              color,
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            {type}
          </span>
        );
      },
    },
    {
      title: 'Ngày hiệu lực',
      dataIndex: 'eventDate',
      key: 'eventDate',
    },
    {
      title: 'Giá trị cũ',
      dataIndex: 'oldValue',
      key: 'oldValue',
      render: (val: string) => <span style={{ color: '#757575', fontSize: 13 }}>{val || '—'}</span>,
    },
    {
      title: 'Giá trị mới',
      dataIndex: 'newValue',
      key: 'newValue',
      render: (val: string) => <span style={{ fontWeight: 600, color: '#212121', fontSize: 13 }}>{val}</span>,
    },
    {
      title: 'Số quyết định',
      dataIndex: 'decisionNumber',
      key: 'decisionNumber',
      render: (val: string) => <span style={{ fontSize: 12, color: '#616161' }}>{val || 'N/A'}</span>,
    },
    {
      title: 'Người ký',
      dataIndex: 'signer',
      key: 'signer',
    },
    {
      title: 'Thao tác', key: 'actions', width: 155,
      render: (_: unknown, record: HistoryRecord) => <div style={{ display: 'flex', gap: 6 }}>
        <Button size="small" icon={<EyeOutlined />} onClick={() => setViewingHistory(record)}>Xem</Button>
        <Button size="small" icon={<EditOutlined />} disabled={historySaving} onClick={() => openHistory(record)}>Sửa</Button>
        <Button size="small" danger icon={<DeleteOutlined />} disabled={historySaving} onClick={() => deleteHistory(record)}>Xóa</Button>
      </div>,
    },
  ];

  // Bank Management Columns
  const bankColumns = [
    {
      title: 'Nhân sự liên kết',
      key: 'employee',
      width: 220,
      render: (_: any, record: any) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.employeeName || '—'}</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            Mã NV: <code>{record.employeeCode || 'Chưa gắn'}</code>
          </div>
        </div>
      ),
    },
    {
      title: 'Thông tin Ngân hàng & STK',
      key: 'bankInfo',
      width: 240,
      render: (_: any, record: any) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <BankOutlined style={{ fontSize: 14 }} />
            {record.bankName}
          </div>
          <div style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: '#0F172A', marginTop: 2 }}>
            STK: {record.accountNumber}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 1 }}>Chủ TK: {record.accountHolder}</div>
        </div>
      ),
    },
    {
      title: 'Chi nhánh & Ghi chú',
      key: 'branch',
      render: (_: any, record: any) => (
        <div>
          <div style={{ fontSize: 12.5, color: '#334155', fontWeight: 500 }}>{record.branch || 'Hội sở chính'}</div>
          {record.note && <div style={{ fontSize: 11.5, color: '#64748B', fontStyle: 'italic', marginTop: 2 }}>{record.note}</div>}
        </div>
      ),
    },
    {
      title: 'Mặc định nhận lương',
      key: 'isPrimary',
      width: 140,
      render: (_: any, record: any) =>
        record.isPrimary ? (
          <Tag color="success" style={{ fontWeight: 600 }}>● Tài khoản chính</Tag>
        ) : (
          <Tag color="default">Phụ</Tag>
        ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => {
        if (status === 'Đã duyệt') return <Tag color="success">Đã duyệt</Tag>;
        if (status === 'Chờ duyệt') return <Tag color="warning">Chờ duyệt</Tag>;
        return <Tag color="error">Từ chối</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 190,
      render: (_: any, record: any) => {
        const empName = record?.employeeName || 'nhân sự';
        const isPending = record.status === 'Chờ duyệt' || record.status === 'pending';
        const isRejected = record.status === 'Từ chối' || record.status === 'rejected';
        return (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {isPending && (
              <>
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleApproveBank(record)}
                  style={{ backgroundColor: '#16A34A', borderColor: '#16A34A', fontSize: 11.5, padding: '0 6px' }}
                >
                  Duyệt
                </Button>
                <Button
                  size="small"
                  danger
                  icon={<CloseCircleOutlined />}
                  onClick={() => handleRejectBank(record)}
                  style={{ fontSize: 11.5, padding: '0 6px' }}
                >
                  Từ chối
                </Button>
              </>
            )}
            {isRejected && (
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => handleApproveBank(record)}
                style={{ backgroundColor: '#16A34A', borderColor: '#16A34A', fontSize: 11.5, padding: '0 6px' }}
              >
                Duyệt lại
              </Button>
            )}
            <button
              onClick={() => {
                setViewingBankAccount(record);
                setIsBankViewModalOpen(true);
              }}
              title="Xem chi tiết"
              style={{
                background: 'transparent',
                border: '1px solid #CBD5E1',
                borderRadius: 4,
                padding: '4px 7px',
                cursor: 'pointer',
                color: '#475569',
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

  // Identity Verification History Columns (Includes 100% Real System Employees + CCCD 2 mặt + Video & Photo)
  const identityColumns = [
    {
      title: 'Mã & Họ tên Nhân sự',
      key: 'employeeName',
      width: 220,
      render: (_: any, record: any) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{record.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2, fontWeight: 600 }}>
            Mã: <code>{record.employeeCode}</code> · {record.department}
          </div>
        </div>
      ),
    },
    {
      title: 'Loại hình xác thực',
      key: 'idType',
      width: 210,
      render: (_: any, record: any) => (
        record.idNumber ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SafetyCertificateOutlined style={{ color: '#009688', fontSize: 18 }} />
            <div>
              <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 12.5 }}>{record.idType || 'Căn cước công dân'}</div>
              <div style={{ fontSize: 11.5, color: '#64748B' }}>Số: <code>{record.idNumber}</code></div>
            </div>
          </div>
        ) : (
          <span style={{ color: '#94A3B8', fontSize: 12.5, fontStyle: 'italic' }}>Chưa có dữ liệu</span>
        )
      ),
    },
    {
      title: 'Thời gian xác thực',
      dataIndex: 'verifiedAt',
      key: 'verifiedAt',
      width: 170,
      render: (val: string, record: any) => (
        record.isVerified && val && val !== '—' ? (
          <span style={{ fontSize: 12.5, color: '#334155' }}>{val}</span>
        ) : (
          <span style={{ fontSize: 12.5, color: '#94A3B8' }}>—</span>
        )
      ),
    },
    {
      title: 'Đơn vị / Phương thức xác minh',
      dataIndex: 'verifiedBy',
      key: 'verifiedBy',
      width: 230,
      render: (val: string, record: any) => (
        record.isVerified && val && val !== '—' ? (
          <span style={{ fontSize: 12, color: '#2563EB', fontWeight: 600 }}>
            {val}
          </span>
        ) : (
          <span style={{ fontSize: 12.5, color: '#94A3B8' }}>—</span>
        )
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => (
        status === 'Đã xác thực' ? (
          <Tag color="success" style={{ fontWeight: 600 }}>
            Đã xác thực
          </Tag>
        ) : (
          <Tag color="error" style={{ color: '#DC2626', backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', fontWeight: 600 }}>
            Chưa xác thực
          </Tag>
        )
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 260,
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button
            size="small"
            icon={<IdcardOutlined />}
            style={{ borderColor: '#38BDF8', color: '#0284C7' }}
            onClick={() => void openIdentity(record, 'cccd')}
          >
            CCCD
          </Button>
          <Button
            size="small"
            icon={<VideoCameraOutlined />}
            style={{ borderColor: '#22C55E', color: '#16A34A' }}
            onClick={() => void openIdentity(record, 'video')}
          >
            Video
          </Button>
          <Button
            size="small"
            icon={<FileTextOutlined />}
            style={{ borderColor: '#CBD5E1', color: '#334155' }}
            onClick={() => void openIdentity(record, 'info')}
          >
            Thông tin
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {historyError && typeFilter !== 'Ngân hàng' && typeFilter !== 'Xác thực danh tính' && <div role="alert" style={{ color: '#DC2626', marginBottom: 12 }}>{historyError} <Button size="small" onClick={() => void loadHistory()}>Tải lại</Button></div>}
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hồ sơ xác thực danh tính</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {identityData.filter((i) => i.status === 'Đã xác thực').length} / {identityData.length} Đã xác thực
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>CCCD chip 2 mặt, Video &amp; eSign</div>
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
                : typeFilter === 'Xác thực danh tính'
                ? 'Tìm theo tên NV, mã NV, loại giấy tờ, số định danh...'
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
              style={{ width: 230 }}
              options={[
                { label: 'Tất cả biến động', value: 'all' },
                { label: 'Chức vụ / Bổ nhiệm', value: 'Chức vụ' },
                { label: 'Thuyên chuyển phòng ban', value: 'Thuyên chuyển' },
                { label: 'Khen thưởng & Vinh danh', value: 'Khen thưởng' },
                { label: 'Nghỉ việc / Thôi việc', value: 'Nghỉ việc' },
                { label: 'Kỷ luật & Sự cố', value: 'Kỷ luật sự cố' },
                { label: 'Ngân hàng / Thay đổi STK', value: 'Ngân hàng' },
                { label: 'Xác thực danh tính', value: 'Xác thực danh tính' },
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
            onClick={async () => {
              if (typeFilter === 'Ngân hàng') {
                loadBankAccounts();
              } else if (typeFilter === 'Xác thực danh tính') {
                await loadEmployees();
              } else {
                if (!await loadHistory()) return;
              }
              message.success('Đã làm mới dữ liệu');
            }}
          >
            Làm mới
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={exportHistory}
            disabled={typeFilter !== 'Ngân hàng' && typeFilter !== 'Xác thực danh tính' && (historyLoading || !!historyError)}
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
          ) : typeFilter === 'Xác thực danh tính' ? (
            <Button
              type="primary"
              icon={<SafetyCertificateOutlined />}
              disabled title="Chưa có quy trình gửi yêu cầu eKYC tới ứng dụng nhân sự."
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Gửi yêu cầu eKYC mới
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openHistory()}
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
          loading={typeFilter !== 'Ngân hàng' && typeFilter !== 'Xác thực danh tính' && historyLoading}
          dataSource={
            typeFilter === 'Ngân hàng'
              ? filteredBankAccounts
              : typeFilter === 'Xác thực danh tính'
              ? filteredIdentityData
              : filteredHistoryData
          }
          columns={
            typeFilter === 'Ngân hàng'
              ? bankColumns
              : typeFilter === 'Xác thực danh tính'
              ? identityColumns
              : generalColumns
          }
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total, range) => (
              <span style={{ fontSize: 13, color: '#757575' }}>
                Hiển thị {range[0]}-{range[1]} trên tổng số {total}{' '}
                {typeFilter === 'Ngân hàng'
                  ? 'tài khoản'
                  : typeFilter === 'Xác thực danh tính'
                  ? 'hồ sơ xác thực'
                  : 'bản ghi'}
              </span>
            ),
          }}
        />
      </div>

      {/* MODAL: THÊM / CHỈNH SỬA NGÂN HÀNG CHO NHÂN SỰ */}
      <Modal
        title={editingBankAccount ? 'Chỉnh sửa tài khoản ngân hàng' : 'Thêm mới tài khoản ngân hàng nhân sự'}
        open={isBankModalOpen}
        onCancel={() => setIsBankModalOpen(false)}
        onOk={handleSaveBank}
        okText={editingBankAccount ? 'Lưu thay đổi' : 'Thêm mới'}
        cancelText="Hủy"
        okButtonProps={{ style: { backgroundColor: '#009688', borderColor: '#009688', borderRadius: 6 } }}
        cancelButtonProps={{ style: { borderRadius: 6 } }}
        width={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#334155' }}>
                Nhân sự nhận lương <span style={{ color: 'red' }}>*</span>
              </label>
              <EmployeeSelect
                valueKey="name"
                placeholder="Chọn nhân sự..."
                value={bankForm.employeeName ? `${bankForm.employeeName}` : undefined}
                onCreated={() => setEmployees(dataService.getEmployees())}
                onChange={(_, emp) => {
                  if (emp) {
                    const name = emp.name || emp.fullName;
                    setBankForm({
                      ...bankForm,
                      employeeCode: emp.employeeCode || emp.code,
                      employeeName: name,
                      accountHolder: name.toUpperCase(),
                    });
                  }
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#334155' }}>
                Tên Ngân hàng <span style={{ color: 'red' }}>*</span>
              </label>
              <Select
                showSearch
                placeholder="Chọn ngân hàng..."
                value={bankForm.bankName || undefined}
                onChange={(val) => setBankForm({ ...bankForm, bankName: val })}
                style={{ width: '100%' }}
                options={bankOptions}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#334155' }}>
                Số tài khoản <span style={{ color: 'red' }}>*</span>
              </label>
              <Input
                placeholder="Nhập số tài khoản..."
                value={bankForm.accountNumber}
                onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#334155' }}>
                Chủ tài khoản
              </label>
              <Input
                placeholder="NGUYEN VAN A"
                value={bankForm.accountHolder}
                onChange={(e) => setBankForm({ ...bankForm, accountHolder: e.target.value.toUpperCase() })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#334155' }}>
                Chi nhánh phát hành
              </label>
              <Input
                placeholder="VD: Chi nhánh Hà Nội, Sở Giao dịch..."
                value={bankForm.branch}
                onChange={(e) => setBankForm({ ...bankForm, branch: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#334155' }}>
                Trạng thái duyệt
              </label>
              <Select
                value={bankForm.status}
                onChange={(val) => setBankForm({ ...bankForm, status: val })}
                style={{ width: '100%' }}
                options={[
                  { value: 'Đã duyệt', label: 'Đã duyệt' },
                  { value: 'Chờ duyệt', label: 'Chờ duyệt' },
                  { value: 'Từ chối', label: 'Từ chối' },
                ]}
              />
            </div>
          </div>

          <div>
            <Checkbox
              checked={bankForm.isPrimary}
              onChange={(e) => setBankForm({ ...bankForm, isPrimary: e.target.checked })}
            >
              Đặt làm Tài khoản chính mặc định để chi trả lương hàng tháng
            </Checkbox>
          </div>
        </div>
      </Modal>

      {/* MODAL: XEM CHI TIẾT TÀI KHOẢN NGÂN HÀNG & PHÊ DUYỆT */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BankOutlined style={{ color: '#009688', fontSize: 18 }} />
            <span>Chi tiết tài khoản ngân hàng nhân sự</span>
          </div>
        }
        open={isBankViewModalOpen}
        onCancel={() => setIsBankViewModalOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <Button onClick={() => setIsBankViewModalOpen(false)}>Đóng</Button>
            {viewingBankAccount && (viewingBankAccount.status === 'Chờ duyệt' || viewingBankAccount.status === 'pending') && (
              <>
                <Button
                  danger
                  icon={<CloseCircleOutlined />}
                  onClick={() => {
                    handleRejectBank(viewingBankAccount);
                    setIsBankViewModalOpen(false);
                  }}
                >
                  Từ chối duyệt
                </Button>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => {
                    handleApproveBank(viewingBankAccount);
                    setIsBankViewModalOpen(false);
                  }}
                  style={{ backgroundColor: '#16A34A', borderColor: '#16A34A' }}
                >
                  Phê duyệt tài khoản
                </Button>
              </>
            )}
            {viewingBankAccount && (viewingBankAccount.status === 'Từ chối' || viewingBankAccount.status === 'rejected') && (
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => {
                  handleApproveBank(viewingBankAccount);
                  setIsBankViewModalOpen(false);
                }}
                style={{ backgroundColor: '#16A34A', borderColor: '#16A34A' }}
              >
                Duyệt lại tài khoản
              </Button>
            )}
          </div>
        }
        width={560}
      >
        {viewingBankAccount && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <span style={{ fontSize: 12, color: '#64748B' }}>Nhân sự:</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{viewingBankAccount.employeeName}</div>
                <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600 }}>Mã NV: {viewingBankAccount.employeeCode}</div>
              </div>
              <div>
                <span style={{ fontSize: 12, color: '#64748B' }}>Trạng thái phê duyệt:</span>
                <div style={{ marginTop: 2 }}>
                  <Tag color={viewingBankAccount.status === 'Đã duyệt' ? 'success' : viewingBankAccount.status === 'Chờ duyệt' ? 'warning' : 'error'}>
                    {viewingBankAccount.status}
                  </Tag>
                  {viewingBankAccount.isPrimary && (
                    <Tag color="purple" style={{ marginLeft: 4 }}>Tài khoản chính</Tag>
                  )}
                </div>
              </div>
            </div>

            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, color: '#64748B' }}>Tên Ngân hàng:</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#2563EB', marginTop: 2 }}>{viewingBankAccount.bankName}</div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                <div>
                  <span style={{ fontSize: 12, color: '#64748B' }}>Số tài khoản:</span>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: '#0F172A' }}>{viewingBankAccount.accountNumber}</div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#64748B' }}>Chủ tài khoản:</span>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{viewingBankAccount.accountHolder}</div>
                </div>
              </div>

              {viewingBankAccount.branch && (
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: '#64748B' }}>Chi nhánh:</span>
                  <div style={{ fontSize: 12.5, color: '#334155' }}>{viewingBankAccount.branch}</div>
                </div>
              )}
            </div>

            {viewingBankAccount.note && (
              <div style={{ fontSize: 12.5, color: '#64748B', fontStyle: 'italic' }}>
                Ghi chú: {viewingBankAccount.note}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* MODAL: XEM CHI TIẾT CHỨNG THỰC DANH TÍNH (CCCD 2 MẶT + VIDEO & ẢNH XÁC THỰC EKYC) */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {identityTab === 'cccd' ? <IdcardOutlined style={{ color: '#009688', fontSize: 18 }} /> : identityTab === 'video' ? <VideoCameraOutlined style={{ color: '#009688', fontSize: 18 }} /> : <FileTextOutlined style={{ color: '#009688', fontSize: 18 }} />}
            <span>{identityTab === 'cccd' ? 'Giấy tờ định danh' : identityTab === 'video' ? 'Video xác thực' : 'Thông tin xác thực'}</span>
          </div>
        }
        open={isIdentityViewModalOpen}
        onCancel={() => setIsIdentityViewModalOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {viewingIdentity?.userId && ['livePhotoUrl', 'liveVideoUrl', 'cardFrontUrl', 'cardBackUrl', 'cardAvatarUrl'].some((field) => viewingIdentity[field]) && (
              <Button danger onClick={() => Modal.confirm({
                title: 'Xóa dữ liệu sinh trắc học theo yêu cầu rút đồng ý?',
                content: `Ảnh khuôn mặt, video xác thực và ảnh hai mặt thẻ căn cước của ${viewingIdentity.employeeName} sẽ bị xóa khỏi hồ sơ, trạng thái đã xác minh eKYC bị bỏ; số và thông tin giấy tờ vẫn giữ. Chỉ làm khi nhân viên yêu cầu rút đồng ý. Không khôi phục được.`,
                okText: 'Xóa dữ liệu sinh trắc học',
                cancelText: 'Hủy',
                okButtonProps: { danger: true },
                onOk: async () => {
                  try {
                    await ekycApi.withdrawConsent(viewingIdentity.userId, 'Nhân viên yêu cầu rút đồng ý, quản trị viên thực hiện');
                    const cleared = { ...viewingIdentity, livePhotoUrl: '', liveVideoUrl: '', cardFrontUrl: '', cardBackUrl: '', cardAvatarUrl: '', faceMatchScore: 0, isVerified: false, status: 'Chưa xác thực', hash: '' };
                    setViewingIdentity(cleared);
                    setIdentityData((rows) => rows.map((row) => (row.userId === cleared.userId ? cleared : row)));
                    message.success('Đã xóa dữ liệu sinh trắc học khỏi hồ sơ.');
                  } catch (error: any) {
                    message.error(error?.response?.data?.message || 'Không xóa được dữ liệu sinh trắc học.');
                  }
                },
              })}>Xóa ảnh sinh trắc học</Button>
            )}
            <Button onClick={() => setIsIdentityViewModalOpen(false)}>Đóng</Button>
          </div>
        }
        width={780}
      >
        {viewingIdentity && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 6 }}>
            {/* Tab Content 1: CCCD 2 Mặt */}
            {identityTab === 'cccd' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0369A1', alignSelf: 'flex-start' }}>
                  1. Mặt trước Căn cước công dân
                </div>
                <CCCDCardPreview employee={viewingIdentity} side="front" />

                <div style={{ fontSize: 13, fontWeight: 700, color: '#0369A1', alignSelf: 'flex-start', marginTop: 10 }}>
                  2. Mặt sau Căn cước công dân
                </div>
                <CCCDCardPreview employee={viewingIdentity} side="back" />
              </div>
            )}

            {/* Tab Content 2: Video & Ảnh xác thực Liveness */}
            {identityTab === 'video' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <EKYCVideoPlayback employee={viewingIdentity} verifiedAt={viewingIdentity.verifiedAt} />
              </div>
            )}

            {/* Tab Content 3: Detailed Extraction & SHA-256 Hash */}
            {identityTab === 'info' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                  <div>
                    <span style={{ color: '#64748B' }}>Loại giấy tờ / Hình thức:</span>
                    <div style={{ fontWeight: 700, color: '#0F172A' }}>{viewingIdentity.idNumber ? viewingIdentity.idType : 'Chưa có dữ liệu'}</div>
                  </div>
                  <div>
                    <span style={{ color: '#64748B' }}>Số định danh / Số Serial:</span>
                    <div style={{ fontWeight: 700, color: viewingIdentity.idNumber ? '#009688' : '#94A3B8' }}>{viewingIdentity.idNumber || 'Chưa có dữ liệu'}</div>
                  </div>
                  <div>
                    <span style={{ color: '#64748B' }}>Thời gian xác thực:</span>
                    <div style={{ fontWeight: 600, color: viewingIdentity.isVerified ? '#334155' : '#94A3B8' }}>{viewingIdentity.verifiedAt || '—'}</div>
                  </div>
                  <div>
                    <span style={{ color: '#64748B' }}>Độ trùng khớp khuôn mặt:</span>
                    <div style={{ fontWeight: 700, color: viewingIdentity.faceMatchScore ? '#16A34A' : '#94A3B8' }}>
                      {viewingIdentity.faceMatchScore ? `${viewingIdentity.faceMatchScore}%` : 'Chưa có dữ liệu'}
                    </div>
                  </div>
                </div>

                <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#64748B', marginBottom: 2 }}>Đơn vị / Phương thức xác minh:</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: viewingIdentity.isVerified ? '#2563EB' : '#94A3B8' }}>{viewingIdentity.verifiedBy || '—'}</div>
                </div>

                {viewingIdentity.hash ? (
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, background: '#FAFAFA' }}>
                    <div style={{ fontSize: 12, color: '#64748B', marginBottom: 2 }}>Mã băm bảo mật SHA-256 chứng thực:</div>
                    <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: '#0F172A', wordBreak: 'break-all' }}>
                      {viewingIdentity.hash}
                    </div>
                  </div>
                ) : null}

                <div style={{ fontSize: 12.5, color: '#475569', fontStyle: 'italic' }}>
                  Ghi chú: {viewingIdentity.note || 'Chưa có ghi chú.'}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* MODAL: THÊM BIẾN ĐỘNG CHUNG */}
      <Modal
        title={editingHistory ? 'Chỉnh sửa biến động nhân sự' : 'Ghi nhận biến động nhân sự mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateHistory} style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeId" label="Nhân viên" rules={[{ required: true }]}>
              <Select showSearch placeholder="Chọn nhân viên" options={historyEmployees.map(employee => ({ value: employee.key, label: `${employee.code} · ${employee.name}` }))} onChange={employeeId => { const employee = historyEmployees.find(item => item.key === employeeId); form.setFieldsValue({ employeeName: employee?.name || '' }); }} />
            </Form.Item>
            <Form.Item name="employeeName" label="Họ và tên" rules={[{ required: true }]}>
              <Input readOnly placeholder="Theo nhân viên đã chọn" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="type" label="Loại biến động" rules={[{ required: true }]}>
              <Select
                onChange={(value: string) => { setResignForm(value === 'Nghỉ việc'); setDisciplineForm(value === 'Kỷ luật sự cố'); if (value !== 'Nghỉ việc') setTerminationPreview(null); }}
                options={[
                  { value: 'Chức vụ', label: 'Chức vụ / Bổ nhiệm' },
                  { value: 'Thuyên chuyển', label: 'Thuyên chuyển phòng ban' },
                  { value: 'Khen thưởng', label: 'Khen thưởng & Vinh danh' },
                  { value: 'Nghỉ việc', label: 'Nghỉ việc / Thôi việc' },
                  { value: 'Kỷ luật sự cố', label: 'Kỷ luật & Sự cố' },
                ]}
              />
            </Form.Item>
            <Form.Item name="eventDate" label="Ngày hiệu lực" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="oldValue" label="Giá trị cũ">
              <Input placeholder="VD: Chức vụ cũ, Phòng cũ..." maxLength={1000} />
            </Form.Item>
            <Form.Item name="newValue" label="Giá trị mới" rules={[{ required: true }]}>
              <Input placeholder="VD: Chức vụ mới, Phòng mới..." maxLength={1000} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="decisionNumber" label="Số Quyết định">
              <Input placeholder="Số quyết định thực tế" maxLength={160} />
            </Form.Item>
            <Form.Item name="signer" label="Người ký">
              <Input placeholder="Người ký quyết định thực tế" maxLength={200} />
            </Form.Item>
          </div>

          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="Nội dung chi tiết quyết định..." maxLength={4000} />
          </Form.Item>

          {resignForm && (
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 13, marginBottom: 8 }}>Chấm dứt hợp đồng lao động (ngày hiệu lực ở trên là ngày chấm dứt)</div>
              <Form.Item name="terminationType" label="Hình thức chấm dứt"><Select allowClear options={TERMINATION_TYPE_OPTIONS} placeholder="Chọn để tính trợ cấp và báo trước" /></Form.Item>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item name="workStartDate" label="Ngày bắt đầu làm việc"><Input type="date" /></Form.Item>
                <Form.Item name="averageSalary" label="Lương bình quân 6 tháng liền kề (₫)"><Input type="number" min={0} /></Form.Item>
                <Form.Item name="contractKind" label="Loại hợp đồng"><Select options={[{ value: 'indefinite', label: 'Không xác định thời hạn' }, { value: 'fixed', label: 'Xác định thời hạn' }]} /></Form.Item>
                <Form.Item name="termMonths" label="Thời hạn hợp đồng (tháng)"><Input type="number" min={0} /></Form.Item>
                <Form.Item name="noticeGivenDate" label="Ngày báo trước"><Input type="date" /></Form.Item>
                <Form.Item name="unusedLeaveDays" label="Ngày phép năm chưa nghỉ"><Input type="number" min={0} step="0.5" /></Form.Item>
                <Form.Item name="unemploymentInsuredMonths" label="Tháng đã đóng bảo hiểm thất nghiệp"><Input type="number" min={0} /></Form.Item>
                <Form.Item name="paidSeveranceMonths" label="Tháng đã được trả trợ cấp trước đó"><Input type="number" min={0} /></Form.Item>
              </div>
              <Form.Item name="exemptFromNotice" valuePropName="checked"><Checkbox>Thuộc trường hợp không cần báo trước (Điều 35 khoản 2)</Checkbox></Form.Item>
              <Button loading={terminationChecking} onClick={() => void calculateTermination()}>Tính trợ cấp và hạn thanh toán</Button>
              {terminationPreview && <div style={{ marginTop: 12, display: 'grid', gap: 4, fontSize: 12.5 }}>
                <div>Thời gian làm việc {terminationPreview.monthsWorked} tháng; tính trợ cấp {terminationPreview.effectiveMonths} tháng (tròn {terminationPreview.severanceYears} năm)</div>
                <div>Báo trước tối thiểu {terminationPreview.noticeRequiredDays} {terminationPreview.noticeUnit}, đã báo {terminationPreview.noticeGivenDays}{terminationPreview.shortNoticeDays > 0 ? `, thiếu ${terminationPreview.shortNoticeDays}` : ''}</div>
                <div>{terminationPreview.allowanceType === 'job_loss' ? 'Trợ cấp mất việc làm' : 'Trợ cấp thôi việc'}: <strong>{terminationPreview.allowance.toLocaleString('vi-VN')} ₫</strong>; tiền phép chưa nghỉ {terminationPreview.leavePayout.toLocaleString('vi-VN')} ₫</div>
                <div>Công ty phải trả khoảng <strong>{terminationPreview.employerPays.toLocaleString('vi-VN')} ₫</strong>{terminationPreview.employeeOwes > 0 ? `; người lao động phải bồi thường ${terminationPreview.employeeOwes.toLocaleString('vi-VN')} ₫` : ''}; hạn thanh toán <strong>{terminationPreview.settlementDueDate}</strong> (14 ngày làm việc, Điều 48)</div>
                {terminationPreview.notes.map((note) => <div key={note} style={{ color: '#D97706' }}>{note}</div>)}
              </div>}
            </div>
          )}

          {disciplineForm && (
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 13, marginBottom: 8 }}>Xử lý kỷ luật lao động (ngày hiệu lực ở trên là ngày ra quyết định; Bộ luật Lao động 2019 Điều 122 đến 125, cấm phạt tiền hoặc cắt lương thay kỷ luật)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item name="discForm" label="Hình thức kỷ luật"><Select allowClear options={DISCIPLINE_FORM_OPTIONS} placeholder="Chọn để kiểm tra trình tự và thời hiệu" onChange={(value: string) => { if (value && !String(form.getFieldValue('newValue') || '').trim()) form.setFieldsValue({ newValue: DISCIPLINE_FORMS[value] }); }} /></Form.Item>
                <Form.Item name="discKind" label="Loại hành vi vi phạm"><Select allowClear options={VIOLATION_KIND_OPTIONS} /></Form.Item>
                <Form.Item name="discViolationDate" label="Ngày xảy ra vi phạm"><Input type="date" /></Form.Item>
                <Form.Item name="discDiscoveredDate" label="Ngày phát hiện"><Input type="date" /></Form.Item>
                <Form.Item name="discNoticeDate" label="Ngày thông báo họp xử lý"><Input type="date" /></Form.Item>
                <Form.Item name="discHearingDate" label="Ngày họp xử lý kỷ luật"><Input type="date" /></Form.Item>
                <Form.Item name="discAttendance" label="Người lao động tại cuộc họp"><Select allowClear options={DISCIPLINE_ATTENDANCE_OPTIONS} /></Form.Item>
                <Form.Item name="discUnion" label="Tổ chức đại diện người lao động"><Select allowClear options={[{ value: 'yes', label: 'Có đại diện tham gia cuộc họp' }, { value: 'none', label: 'Doanh nghiệp chưa có tổ chức này' }]} /></Form.Item>
                <Form.Item name="discProtected" label="Trường hợp được bảo vệ"><Select options={PROTECTED_STATUS_OPTIONS} placeholder="Không thuộc trường hợp được bảo vệ" /></Form.Item>
                <Form.Item name="discDelayMonths" label="Số tháng kéo dài nâng lương (tối đa 6)"><Input type="number" min={1} max={6} /></Form.Item>
              </div>
              <Form.Item name="discGround" label="Căn cứ sa thải (Điều 125)"><Select allowClear options={DISMISSAL_GROUND_OPTIONS} /></Form.Item>
              <Form.Item name="discMinutes" valuePropName="checked"><Checkbox>Đã lập biên bản cuộc họp xử lý kỷ luật</Checkbox></Form.Item>
              <Form.Item name="discManagerial" valuePropName="checked"><Checkbox>Người lao động đang giữ chức vụ quản lý (cần khi cách chức)</Checkbox></Form.Item>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={historySaving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {editingHistory ? 'Lưu thay đổi' : 'Xác nhận ghi nhận'}
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal title="Chi tiết biến động nhân sự" open={!!viewingHistory} onCancel={() => setViewingHistory(null)} footer={<Button onClick={() => setViewingHistory(null)}>Đóng</Button>} width={560}>
        {viewingHistory && <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 12 }}>{[
          ['Mã hồ sơ', viewingHistory.code], ['Nhân viên', `${viewingHistory.employeeCode} · ${viewingHistory.employeeName}`], ['Loại biến động', viewingHistory.type], ['Ngày hiệu lực', viewingHistory.eventDate],
          ['Giá trị cũ', viewingHistory.oldValue], ['Giá trị mới', viewingHistory.newValue], ['Số quyết định', viewingHistory.decisionNumber], ['Người ký quyết định', viewingHistory.signer], ['Ghi chú', viewingHistory.note],
        ].map(([label, value]) => <div key={label}><span style={{ color: '#64748B', fontSize: 12 }}>{label}</span><div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value || '—'}</div></div>)}</div>}
        {viewingHistory && viewingHistory.disciplineAssessment && viewingHistory.discipline && (
          <div style={{ marginTop: 12, display: 'grid', gap: 4, fontSize: 12.5 }}>
            <strong>Xử lý kỷ luật: {viewingHistory.disciplineAssessment.formLabel}</strong>
            <div>Vi phạm ngày {viewingHistory.discipline.violationDate}, phát hiện {viewingHistory.discipline.discoveredDate}; thời hiệu {viewingHistory.disciplineAssessment.limitationMonths} tháng đến hết {viewingHistory.disciplineAssessment.limitationDeadline}</div>
            <div>Thông báo họp {viewingHistory.discipline.noticeDate}, họp {viewingHistory.discipline.hearingDate} (sớm nhất được họp {viewingHistory.disciplineAssessment.earliestHearingDate}), quyết định {viewingHistory.discipline.decisionDate}</div>
          </div>
        )}
        {viewingHistory && viewingHistory.settlement && (
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, fontSize: 12.5, display: 'grid', gap: 4 }}>
            <strong>Chấm dứt hợp đồng: {viewingHistory.settlement.typeLabel}</strong>
            <div>Làm việc {viewingHistory.settlement.monthsWorked} tháng (tính trợ cấp {viewingHistory.settlement.effectiveMonths} tháng, tròn {viewingHistory.settlement.severanceYears} năm); lương bình quân {viewingHistory.settlement.averageSalary.toLocaleString('vi-VN')} ₫</div>
            <div>Báo trước tối thiểu {viewingHistory.settlement.noticeRequiredDays} {viewingHistory.settlement.noticeUnit}, đã báo {viewingHistory.settlement.noticeGivenDays}{viewingHistory.settlement.shortNoticeDays > 0 ? `, thiếu ${viewingHistory.settlement.shortNoticeDays}` : ''}</div>
            <div>{viewingHistory.settlement.allowanceType === 'job_loss' ? 'Trợ cấp mất việc làm' : 'Trợ cấp thôi việc'} {viewingHistory.settlement.allowance.toLocaleString('vi-VN')} ₫; tiền phép {viewingHistory.settlement.leavePayout.toLocaleString('vi-VN')} ₫</div>
            <div>Công ty trả {viewingHistory.settlement.employerPays.toLocaleString('vi-VN')} ₫{viewingHistory.settlement.employeeOwes > 0 ? `; người lao động bồi thường ${viewingHistory.settlement.employeeOwes.toLocaleString('vi-VN')} ₫` : ''}; hạn thanh toán {viewingHistory.settlement.settlementDueDate}</div>
            {viewingHistory.settlement.notes.map((note) => <div key={note} style={{ color: '#D97706' }}>{note}</div>)}
          </div>
        )}
      </Modal>
    </div>
  );
};
