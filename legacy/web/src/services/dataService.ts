// ============================================================
// KIYOVN Enterprise - Real Database Data Service
// Single Source of Truth connected 100% to Real Backend & SQLite
// ============================================================

import {
  collectionsApi,
  employeesApi,
  contractsApi,
  tasksApi,
  employeeProposalsApi,
  financeCashApi,
  financeBankAccountsApi,
  financeDocumentsApi,
  notificationsApi,
  auditLogsApi,
  type EnterpriseEmployee,
  type ContractPayload,
  type EmployeeProposal,
  type FinanceCashTransaction,
  type FinanceBankAccount,
  type FinanceDebt,
  type ApiNotification,
} from '../api/endpoints';

export interface OrgUnit {
  key: string;
  code: string;
  name: string;
  manager: string;
  headcount: number;
  location: string;
  status: 'Đang hoạt động' | 'Tạm ngưng';
}

export interface Employee {
  key: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  status: 'Chính thức' | 'Thử việc' | 'Đã nghỉ việc';
  joinDate: string;
  salaryBase: number;
  avatar?: string;
  identityNumber?: string;
  bankAccount?: string;
  bankName?: string;
}

export interface LaborContract {
  key: string;
  code: string;
  employeeName: string;
  type: 'Không thời hạn' | 'Có thời hạn 1 năm' | 'Có thời hạn 3 năm' | 'Thử việc' | string;
  startDate: string;
  endDate: string;
  salary: number;
  status: 'Còn hiệu lực' | 'Sắp hết hạn' | 'Đã hết hạn' | string;
}

export type ContractTemplatePartyType = 'organization' | 'individual' | 'employee';
export type ContractTemplateCustomFieldType = 'text' | 'number' | 'date' | 'select';

export interface ContractTemplateCustomField {
  key: string;
  label: string;
  type: ContractTemplateCustomFieldType;
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

export interface ContractTemplate {
  id: string;
  name: string;
  category: string;
  partyType: ContractTemplatePartyType;
  fieldKeys: string[];
  customFields?: ContractTemplateCustomField[];
  content: string;
  isActive: boolean;
  isSystem?: boolean;
  updatedAt: string;
}

export const CONTRACT_TEMPLATE_FIELD_OPTIONS = [
  { key: 'department', label: 'Phòng ban / Đơn vị phụ trách' },
  { key: 'position', label: 'Vị trí / vai trò hợp tác' },
  { key: 'contractValue', label: 'Tổng giá trị hợp đồng' },
  { key: 'salary', label: 'Mức lương / Thù lao định kỳ' },
  { key: 'allowance', label: 'Phụ cấp trách nhiệm' },
  { key: 'stockSharesPercent', label: 'Tỷ lệ cổ phần thưởng ESOP' },
  { key: 'startDate', label: 'Ngày bắt đầu hiệu lực' },
  { key: 'endDate', label: 'Ngày hết hạn' },
  { key: 'paymentMethod', label: 'Hình thức chi trả' },
  { key: 'workLocation', label: 'Địa điểm thực hiện / làm việc' },
  { key: 'status', label: 'Trạng thái hợp đồng' },
] as const;

export const CONTRACT_TEMPLATE_DEFAULT_FIELDS: ContractTemplateCustomField[] = [
  { key: 'department', label: 'Phòng ban / Đơn vị phụ trách', type: 'text', required: true },
  { key: 'position', label: 'Vị trí / vai trò hợp tác', type: 'text', required: true },
  { key: 'contractValue', label: 'Tổng giá trị hợp đồng (VNĐ)', type: 'number', placeholder: '1200000000' },
  { key: 'salary', label: 'Mức lương / Thù lao định kỳ (VNĐ)', type: 'number', placeholder: '48000000' },
  { key: 'allowance', label: 'Phụ cấp trách nhiệm (VNĐ)', type: 'number', placeholder: '5000000' },
  { key: 'stockSharesPercent', label: 'Tỷ lệ cổ phần thưởng ESOP', type: 'text', placeholder: '2.5% Tổng cổ phần phát hành' },
  { key: 'startDate', label: 'Ngày bắt đầu hiệu lực', type: 'date', required: true },
  { key: 'endDate', label: 'Ngày hết hạn', type: 'text', placeholder: 'Không thời hạn hoặc 2028-12-31', required: true },
  { key: 'paymentMethod', label: 'Hình thức chi trả', type: 'select', options: ['Chuyển khoản ngân hàng', 'Tiền mặt'] },
  { key: 'workLocation', label: 'Địa điểm thực hiện / làm việc', type: 'text' },
  { key: 'status', label: 'Trạng thái hợp đồng', type: 'select', options: ['Chờ duyệt', 'Còn hiệu lực', 'Chờ ký', 'Dự thảo', 'Đã hết hạn'], required: true },
];

export const CONTRACT_TEMPLATE_CATEGORY_OPTIONS = [
  { value: 'partner', label: 'Hợp tác đối tác B2B' },
  { value: 'service', label: 'Cung cấp dịch vụ' },
  { value: 'nda', label: 'Thỏa thuận bảo mật' },
  { value: 'consultant', label: 'Chuyên gia cố vấn' },
  { value: 'equity', label: 'Cổ phần & ESOP' },
  { value: 'labor', label: 'Lao động nội bộ' },
  { value: 'custom', label: 'Hợp đồng tùy chỉnh khác' },
] as const;

export interface Proposal {
  key: string;
  code: string;
  employeeName: string;
  title: string;
  type: string;
  date: string;
  status: 'Chờ duyệt' | 'Đã duyệt' | 'Từ chối' | string;
  approver: string;
  content: string;
}

export interface CashTransaction {
  key: string;
  code: string;
  type: 'Thu' | 'Chi';
  category: string;
  amount: number;
  date: string;
  recipientOrPayer: string;
  account: string;
  status: 'Đã hoàn thành' | 'Chờ duyệt' | 'Đã hủy' | string;
  note: string;
}

const DEFAULT_POSITION_OPTIONS: DropdownOptionItem[] = [
  { id: 'pos-general-director', name: 'Tổng Giám Đốc', code: '', color: '#009688', order: 1, description: 'Điều hành cao nhất trong doanh nghiệp.', isActive: true },
  { id: 'pos-deputy-general-director', name: 'Phó Tổng Giám Đốc', code: '', color: '#2563EB', order: 2, description: 'Phụ trách điều hành theo mảng được phân công.', isActive: true },
  { id: 'pos-system-admin', name: 'Tổng Quản Trị Hệ Thống', code: '', color: '#7C3AED', order: 3, description: 'Quản trị hệ thống, phân quyền và vận hành nền tảng.', isActive: true },
  { id: 'pos-department-head', name: 'Trưởng Phòng', code: '', color: '#16A34A', order: 4, description: 'Quản lý hoạt động và nhân sự của phòng ban.', isActive: true },
  { id: 'pos-deputy-department-head', name: 'Phó Trưởng Phòng', code: '', color: '#D97706', order: 5, description: 'Hỗ trợ trưởng phòng trong vận hành chuyên môn.', isActive: true },
  { id: 'pos-team-lead', name: 'Trưởng Nhóm', code: '', color: '#EA580C', order: 6, description: 'Điều phối nhóm và theo dõi tiến độ công việc.', isActive: true },
  { id: 'pos-software-engineer', name: 'Kỹ sư Phần mềm', code: '', color: '#009688', order: 7, description: 'Phát triển, bảo trì và tối ưu hệ thống phần mềm.', isActive: true },
  { id: 'pos-accountant', name: 'Kế Toán', code: '', color: '#475569', order: 8, description: 'Thực hiện nghiệp vụ tài chính, kế toán.', isActive: true },
  { id: 'pos-hr-specialist', name: 'Chuyên viên Nhân sự', code: '', color: '#DB2777', order: 9, description: 'Phụ trách hồ sơ, tuyển dụng và chính sách nhân sự.', isActive: true },
  { id: 'pos-staff', name: 'Nhân viên', code: '', color: '#64748B', order: 10, description: 'Thực hiện công việc chuyên môn theo phân công.', isActive: true },
];

const DEFAULT_WORK_STATUS_OPTIONS: DropdownOptionItem[] = [
  { id: 'ws-official', name: 'Chính thức', code: 'OFFICIAL', color: '#16A34A', order: 1, description: 'Nhân sự đã ký hợp đồng lao động chính thức.', isActive: true },
  { id: 'ws-probation', name: 'Thử việc', code: 'PROBATION', color: '#D97706', order: 2, description: 'Nhân sự đang trong giai đoạn thử việc hoặc đào tạo.', isActive: true },
  { id: 'ws-retired', name: 'Đã nghỉ việc', code: 'RETIRED', color: '#DC2626', order: 3, description: 'Nhân sự đã chấm dứt hợp đồng lao động.', isActive: true },
  { id: 'ws-maternity', name: 'Nghỉ thai sản', code: 'MATERNITY', color: '#7C3AED', order: 4, description: 'Nhân sự đang trong chế độ thai sản theo quy định.', isActive: true },
  { id: 'ws-suspended', name: 'Tạm hoãn', code: 'SUSPENDED', color: '#64748B', order: 5, description: 'Tạm hoãn thực hiện hợp đồng lao động.', isActive: true },
];

const DEFAULT_CONTRACT_TYPE_OPTIONS: DropdownOptionItem[] = [
  { id: 'ct-indefinite', name: 'Không thời hạn', code: 'INDEFINITE', color: '#009688', order: 1, description: 'Hợp đồng lao động không xác định thời hạn.', isActive: true },
  { id: 'ct-term-1y', name: 'Có thời hạn 1 năm', code: 'TERM_1Y', color: '#2563EB', order: 2, description: 'Hợp đồng lao động thời hạn 12 tháng.', isActive: true },
  { id: 'ct-term-3y', name: 'Có thời hạn 3 năm', code: 'TERM_3Y', color: '#7C3AED', order: 3, description: 'Hợp đồng lao động thời hạn 36 tháng.', isActive: true },
  { id: 'ct-probation', name: 'Thử việc', code: 'PROBATION', color: '#D97706', order: 4, description: 'Hợp đồng thử việc từ 1 đến 2 tháng.', isActive: true },
  { id: 'ct-expert', name: 'Chuyên gia & Cố vấn', code: 'EXPERT', color: '#EA580C', order: 5, description: 'Hợp đồng hợp tác chuyên gia hoặc cố vấn cấp cao.', isActive: true },
  { id: 'ct-service', name: 'Cung cấp dịch vụ', code: 'SERVICE', color: '#475569', order: 6, description: 'Hợp đồng cộng tác viên hoặc cung ứng dịch vụ B2B.', isActive: true },
];

const DEFAULT_LEAVE_TYPE_OPTIONS: DropdownOptionItem[] = [
  { id: 'lt-annual', name: 'Nghỉ phép năm', code: 'ANNUAL', color: '#009688', order: 1, description: 'Nghỉ phép năm hưởng nguyên lương theo luật định.', isActive: true },
  { id: 'lt-unpaid', name: 'Nghỉ không lương', code: 'UNPAID', color: '#64748B', order: 2, description: 'Nghỉ việc riêng không hưởng lương theo thỏa thuận.', isActive: true },
  { id: 'lt-sick', name: 'Nghỉ ốm đau', code: 'SICK', color: '#EA580C', order: 3, description: 'Nghỉ điều trị ốm đau có xác nhận của cơ sở y tế.', isActive: true },
  { id: 'lt-maternity', name: 'Nghỉ thai sản', code: 'MATERNITY', color: '#7C3AED', order: 4, description: 'Nghỉ sinh con hoặc chăm sóc con nhỏ.', isActive: true },
  { id: 'lt-special', name: 'Nghỉ chế độ / Việc riêng', code: 'SPECIAL', color: '#2563EB', order: 5, description: 'Nghỉ kết hôn, ma chay hưởng nguyên lương.', isActive: true },
];

const DEFAULT_ACADEMIC_LEVEL_OPTIONS: DropdownOptionItem[] = [
  { id: 'al-phd', name: 'Tiến sĩ', code: 'PHD', color: '#7C3AED', order: 1, description: 'Học vị Tiến sĩ.', isActive: true },
  { id: 'al-master', name: 'Thạc sĩ', code: 'MASTER', color: '#2563EB', order: 2, description: 'Học vị Thạc sĩ.', isActive: true },
  { id: 'al-bachelor', name: 'Đại học', code: 'BACHELOR', color: '#009688', order: 3, description: 'Tốt nghiệp Đại học chính quy.', isActive: true },
  { id: 'al-college', name: 'Cao đẳng', code: 'COLLEGE', color: '#16A34A', order: 4, description: 'Tốt nghiệp Cao đẳng chuyên nghiệp.', isActive: true },
  { id: 'al-vocational', name: 'Trung cấp', code: 'VOCATIONAL', color: '#D97706', order: 5, description: 'Tốt nghiệp Trung cấp nghề.', isActive: true },
  { id: 'al-highschool', name: 'Phổ thông trung học', code: 'HIGH_SCHOOL', color: '#64748B', order: 6, description: 'Tốt nghiệp THPT.', isActive: true },
];

const DEFAULT_JOB_RANK_OPTIONS: DropdownOptionItem[] = [
  { id: 'jr-rank1', name: 'Cấp 1 - Ban Điều Hành', code: 'RANK_1', color: '#009688', order: 1, description: 'Cấp bậc Ban Giám Đốc và Hội đồng Quản trị.', isActive: true },
  { id: 'jr-rank2', name: 'Cấp 2 - Quản lý Cấp cao', code: 'RANK_2', color: '#2563EB', order: 2, description: 'Giám đốc khối, Trưởng phòng ban chiến lược.', isActive: true },
  { id: 'jr-rank3', name: 'Cấp 3 - Quản lý Cấp trung', code: 'RANK_3', color: '#7C3AED', order: 3, description: 'Phó phòng, Trưởng nhóm chuyên môn.', isActive: true },
  { id: 'jr-rank4', name: 'Cấp 4 - Chuyên viên / Kỹ sư', code: 'RANK_4', color: '#16A34A', order: 4, description: 'Chuyên viên, kỹ sư chuyên môn cao.', isActive: true },
  { id: 'jr-rank5', name: 'Cấp 5 - Nhân viên', code: 'RANK_5', color: '#64748B', order: 5, description: 'Nhân viên thực thi nghiệp vụ.', isActive: true },
];

const DEFAULT_ASSET_CATEGORY_OPTIONS: DropdownOptionItem[] = [
  { id: 'ac-it', name: 'Máy tính & Thiết bị CNTT', code: 'IT_EQUIP', color: '#009688', order: 1, description: 'Laptop, PC, màn hình, máy chủ, linh kiện phần cứng.', isActive: true },
  { id: 'ac-office', name: 'Thiết bị văn phòng', code: 'OFFICE_EQUIP', color: '#2563EB', order: 2, description: 'Máy in, máy scan, máy chiếu, bảng thông minh.', isActive: true },
  { id: 'ac-furniture', name: 'Bàn ghế & Nội thất', code: 'FURNITURE', color: '#D97706', order: 3, description: 'Bàn làm việc, ghế công thái học, tủ tài liệu.', isActive: true },
  { id: 'ac-vehicle', name: 'Phương tiện đi lại', code: 'VEHICLE', color: '#7C3AED', order: 4, description: 'Xe ô tô công tác, xe đưa đón nhân sự.', isActive: true },
  { id: 'ac-machinery', name: 'Máy móc chuyên dụng', code: 'MACHINERY', color: '#475569', order: 5, description: 'Thiết bị đo kiểm, máy công nghiệp chuyên dụng.', isActive: true },
];

export interface BankAccount {
  key: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  branch: string;
  balance: number;
  status: string;
}

export interface PayrollRecord {
  key: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  baseSalary: number;
  workDays: number;
  allowance: number;
  bonus: number;
  insuranceDeduction: number;
  taxDeduction: number;
  netSalary: number;
  month: string;
  status: 'Đã chi trả' | 'Chưa chi trả' | 'Chờ duyệt' | string;
}

export interface DebtRecord {
  key: string;
  partnerName: string;
  type: 'Phải thu' | 'Phải trả';
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: string;
  status: 'Đúng hạn' | 'Quá hạn' | 'Đã thanh toán' | string;
}

export interface LeaveRequest {
  key: string;
  code: string;
  employeeName: string;
  department: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  status: 'Chờ duyệt' | 'Đã duyệt' | 'Từ chối' | string;
}

export interface AppNotification {
  id?: string;
  key?: string;
  title: string;
  message: string;
  type: string;
  link?: string;
  read?: boolean;
  unread?: boolean;
  time?: string;
  createdAt?: string;
}

export interface SystemBroadcastNotification {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'urgent' | 'cybersecurity' | 'maintenance' | 'regulation' | 'policy' | 'account_activation';
  targetAudience: string;
  sender: string;
  createdAt: string;
  scheduledAt?: string;
  channels: string[];
  readCount: number;
  totalRecipients: number;
  status: 'Đã gửi' | 'Đang lên lịch' | 'Nháp' | string;
}

export interface EmployeeProfileUpdateRequest {
  id: string;
  employeeId: string;
  employeeCode?: string;
  employeeName?: string;
  type: 'reset_setup' | 'update_request';
  sections: string[];
  note: string;
  deadline?: string;
  hrSender?: string;
  createdAt: string;
  status: 'pending' | 'completed';
}

export interface AssetRecord {
  key: string;
  code: string;
  name: string;
  category: string;
  assignedTo: string;
  department: string;
  purchaseDate: string;
  value: number;
  status: string;
}

export interface WorkflowItem {
  key: string;
  code: string;
  title: string;
  requester: string;
  department: string;
  step: string;
  currentApprover: string;
  submittedDate: string;
  status: 'Đang xử lý' | 'Đã phê duyệt' | 'Bị từ chối' | string;
}

export interface MeetingRoom {
  key: string;
  name: string;
  location: string;
  capacity: number;
  equipment: string[];
  status: 'Trống' | 'Đang sử dụng' | 'Bảo trì' | string;
}

export interface RoomBooking {
  key: string;
  roomName: string;
  meetingTitle: string;
  booker: string;
  date: string;
  timeSlot: string;
  participantsCount: number;
  status: 'Đã xác nhận' | 'Đã hủy' | string;
}

export interface HelpdeskTicket {
  key: string;
  code: string;
  title: string;
  requester: string;
  department: string;
  priority: 'Khẩn cấp' | 'Cao' | 'Trung bình' | 'Thấp' | string;
  status: 'Mới tạo' | 'Đang xử lý' | 'Đã hoàn thành' | string;
  createdDate: string;
}

export interface PlanItem {
  key: string;
  code: string;
  title: string;
  manager: string;
  department: string;
  startDate: string;
  endDate: string;
  progress: number;
  status: 'Đúng hạn' | 'Có rủi ro' | 'Hoàn thành' | string;
}

export interface AuditLog {
  key: string;
  timestamp: string;
  user: string;
  action: string;
  module: string;
  detail: string;
}

// In-Memory store initialized dynamically from API
interface DataStore {
  orgUnits: OrgUnit[];
  employees: Employee[];
  contracts: LaborContract[];
  proposals: Proposal[];
  cashTransactions: CashTransaction[];
  bankAccounts: BankAccount[];
  debts: DebtRecord[];
  payroll: PayrollRecord[];
  leaveRequests: LeaveRequest[];
  assets: AssetRecord[];
  meetingRooms: MeetingRoom[];
  roomBookings: RoomBooking[];
  workflows: WorkflowItem[];
  tickets: HelpdeskTicket[];
  plans: PlanItem[];
  auditLogs: AuditLog[];
  notifications: AppNotification[];
}

const EMPTY_DATA: DataStore = {
  orgUnits: [],
  employees: [],
  contracts: [],
  proposals: [],
  cashTransactions: [],
  bankAccounts: [],
  debts: [],
  payroll: [],
  leaveRequests: [],
  assets: [],
  meetingRooms: [],
  roomBookings: [],
  workflows: [],
  tickets: [],
  plans: [],
  auditLogs: [],
  notifications: [],
};

const CACHE_PREFIX = 'kiyovn_cache_';
const DATASTORE_KEY = 'kiyovn_datastore_cache';

const loadFromStorage = (key: string): any[] | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const saveToStorage = (key: string, data: any[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(data));
  } catch {}
};

const loadDataStoreFromStorage = (): DataStore | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DATASTORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { ...EMPTY_DATA, ...parsed } : null;
  } catch {
    return null;
  }
};

const saveDataStoreToStorage = (store: DataStore): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DATASTORE_KEY, JSON.stringify(store));
  } catch {}
};

class DataService {
  private data: DataStore;
  private genericCache: Map<string, any[]>;
  private initialized: boolean;
  private listeners: Set<() => void>;

  constructor() {
    this.data = loadDataStoreFromStorage() || { ...EMPTY_DATA };
    this.genericCache = new Map();
    this.initialized = false;
    this.listeners = new Set();

    if (typeof window !== 'undefined' && localStorage.getItem('minepanel_token')) {
      void this.syncInitialData();
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => {
      try {
        l();
      } catch {}
    });
  }

  public async syncInitialData(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const userRaw = localStorage.getItem('minepanel_user');
      const user = userRaw ? JSON.parse(userRaw) : null;
      if (!user) return;

      const [
        empRes,
        contractsRes,
        propsRes,
        cashRes,
        banksRes,
        debtsRes,
        notifRes,
      ] = await Promise.allSettled([
        employeesApi.getAll(),
        contractsApi.getAll(),
        employeeProposalsApi.getAll(),
        financeCashApi.getAll(),
        financeBankAccountsApi.getAll(),
        financeDocumentsApi.getDebts(),
        notificationsApi.getAll(),
      ]);

      if (empRes.status === 'fulfilled' && empRes.value.data?.data) {
        const isSuperAdmin = (item: any) =>
          item?.role === 'ADMIN' ||
          item?.role === 'Super Admin' ||
          item?.code === 'ADMIN-001' ||
          item?.employeeCode === 'ADMIN-001' ||
          (item?.email && (item.email.toLowerCase().includes('admin') || item.email.toLowerCase() === 'tung@kiyovn.local'));

        this.data.employees = empRes.value.data.data
          .filter((item: any) => !isSuperAdmin(item))
          .map((e: EnterpriseEmployee) => ({
            key: e.id || e.key,
            code: e.employeeCode || e.code,
            name: e.name || e.fullName,
            email: e.email,
            phone: e.phone,
            department: e.department,
            position: e.position,
            status: e.status,
            joinDate: e.joinDate,
            salaryBase: e.salaryBase,
            avatar: e.avatar,
          }));
      }

      if (contractsRes.status === 'fulfilled' && contractsRes.value.data?.data) {
        this.data.contracts = contractsRes.value.data.data.map((c: ContractPayload) => ({
          key: c.id || c.key || '',
          code: c.code || '',
          employeeName: c.partyBName || c.employeeName || '',
          type: c.contractTemplate || c.type || '',
          startDate: c.startDate || '',
          endDate: c.endDate || '',
          salary: Number(c.salary || c.contractValue || 0),
          status: c.status || 'Còn hiệu lực',
        }));
      }

      if (propsRes.status === 'fulfilled' && propsRes.value.data?.data) {
        this.data.proposals = propsRes.value.data.data.map((p: any) => ({
          key: p.key || p.id || '',
          code: p.code,
          employeeName: p.employeeName,
          title: p.title,
          type: p.type,
          date: p.date || p.createdAt?.slice(0, 10) || '',
          status: p.status,
          approver: p.approver,
          content: p.content,
        }));
      }

      if (cashRes.status === 'fulfilled' && cashRes.value.data?.data) {
        this.data.cashTransactions = cashRes.value.data.data.map((t: any) => ({
          key: t.key || t.id || '',
          code: t.code,
          type: t.type,
          category: t.category,
          amount: t.amount,
          date: t.date,
          recipientOrPayer: t.recipientOrPayer,
          account: t.account,
          status: t.status,
          note: t.note,
        }));
      }

      if (banksRes.status === 'fulfilled' && banksRes.value.data?.data && Array.isArray(banksRes.value.data.data)) {
        this.data.bankAccounts = banksRes.value.data.data.filter((b: any) => b != null).map((b: any) => ({
          key: b?.key || b?.id || '',
          bankName: b?.bankName || '',
          accountNumber: b?.accountNumber || '',
          accountHolder: b?.accountHolder || '',
          branch: b?.branch || '',
          balance: b?.balance || 0,
          status: b?.status || 'Hoạt động',
        }));
      }

      if (debtsRes.status === 'fulfilled' && debtsRes.value.data?.data) {
        this.data.debts = debtsRes.value.data.data.map((d: FinanceDebt) => ({
          key: d.key,
          partnerName: d.partnerName,
          type: d.type,
          totalAmount: d.totalAmount,
          paidAmount: d.paidAmount,
          remainingAmount: d.remainingAmount,
          dueDate: d.dueDate,
          status: d.status,
        }));
      }

      if (notifRes.status === 'fulfilled' && notifRes.value.data?.data) {
        this.data.notifications = notifRes.value.data.data.map((n: ApiNotification) => ({
          id: n.id,
          key: n.id,
          title: n.title,
          message: n.message,
          type: n.type,
          link: n.link,
          read: n.read,
          unread: n.unread,
          time: n.time,
          createdAt: n.createdAt,
        }));
      }

      this.initialized = true;
      saveDataStoreToStorage(this.data);
      this.notify();
    } catch (e) {
      console.warn('Initial data sync error:', e);
    }
  }

  // Audit logger directly records to backend SQLite audit_events
  public logAction(action: string, module: string, detail: string) {
    const newLog: AuditLog = {
      key: String(Date.now()),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      user: 'Quản trị viên',
      action,
      module,
      detail,
    };
    this.data.auditLogs = [newLog, ...this.data.auditLogs];
    saveDataStoreToStorage(this.data);
    auditLogsApi.record({ action, module, detail }).catch(() => {});
  }

  // Generic fallback screens read/write via backend SQLite collections with persistent LocalStorage cache
  public getGenericData(scope: string): any[] {
    const key = scope.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    if (!this.genericCache.has(key)) {
      const stored = loadFromStorage(key);
      if (stored && Array.isArray(stored)) {
        this.genericCache.set(key, stored);
      } else {
        this.genericCache.set(key, []);
      }

      collectionsApi.get(key).then((res) => {
        if (res.data?.data && Array.isArray(res.data.data)) {
          if (res.data.data.length > 0 || !stored || stored.length === 0) {
            this.genericCache.set(key, res.data.data);
            saveToStorage(key, res.data.data);
            this.notify();
          }
        }
      }).catch(() => {});
    }
    return this.genericCache.get(key) || [];
  }

  public saveGenericData(scope: string, rows: any[]): void {
    const key = scope.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    this.genericCache.set(key, rows);
    saveToStorage(key, rows);
    this.notify();
    collectionsApi.replace(key, rows).catch((e) => {
      console.warn('Collections save failed:', e);
    });
  }

  // 1. Org Units (Collections: business_org_units)
  public getOrgUnits(): OrgUnit[] {
    return this.getGenericData('business_org_units');
  }

  public addOrgUnit(unit: Omit<OrgUnit, 'key'>): OrgUnit {
    const newUnit: OrgUnit = { ...unit, key: String(Date.now()) };
    const current = this.getOrgUnits();
    const updated = [newUnit, ...current];
    this.saveGenericData('business_org_units', updated);
    this.logAction('Thêm mới', 'Doanh nghiệp', `Thêm đơn vị tổ chức: ${unit.name}`);
    return newUnit;
  }

  public updateOrgUnit(key: string, patch: Partial<OrgUnit>) {
    const current = this.getOrgUnits();
    const updated = current.map((u) => (u.key === key ? { ...u, ...patch } : u));
    this.saveGenericData('business_org_units', updated);
    this.logAction('Cập nhật', 'Doanh nghiệp', `Cập nhật đơn vị key: ${key}`);
  }

  public deleteOrgUnit(key: string) {
    const current = this.getOrgUnits();
    const updated = current.filter((u) => u.key !== key);
    this.saveGenericData('business_org_units', updated);
    this.logAction('Xóa', 'Doanh nghiệp', `Xóa đơn vị key: ${key}`);
  }

  // 2. Employees (employeesApi)
  public getEmployees(): Employee[] {
    return [...this.data.employees];
  }

  public addEmployee(emp: Omit<Employee, 'key'>): Employee {
    const newEmp: Employee = { ...emp, key: String(Date.now()) };
    this.data.employees = [newEmp, ...this.data.employees];
    employeesApi.create({
      code: emp.code,
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      department: emp.department,
      position: emp.position,
      status: emp.status,
      joinDate: emp.joinDate,
      salaryBase: emp.salaryBase,
    }).then((res) => {
      if (res.data?.employee) {
        this.notify();
      }
    }).catch(() => {});
    this.logAction('Thêm mới', 'Nhân sự', `Thêm nhân viên: ${emp.name} (${emp.code})`);
    return newEmp;
  }

  public updateEmployee(key: string, patch: Partial<Employee>) {
    this.data.employees = this.data.employees.map((e) => (e.key === key ? { ...e, ...patch } : e));
    employeesApi.update(key, patch as any).catch(() => {});
    this.logAction('Cập nhật', 'Nhân sự', `Cập nhật nhân viên key: ${key}`);
  }

  public deleteEmployee(key: string) {
    this.data.employees = this.data.employees.filter((e) => e.key !== key);
    employeesApi.retire(key).catch(() => {});
    this.logAction('Xóa', 'Nhân sự', `Xóa nhân viên key: ${key}`);
  }

  // 3. Contracts (contractsApi)
  public getContracts(): LaborContract[] {
    return [...this.data.contracts];
  }

  public addContract(contract: Omit<LaborContract, 'key'>) {
    const newC = { ...contract, key: String(Date.now()) };
    this.data.contracts = [newC, ...this.data.contracts];
    contractsApi.create({
      code: contract.code,
      name: contract.code,
      contractTemplate: contract.type,
      partyBName: contract.employeeName,
      startDate: contract.startDate,
      endDate: contract.endDate,
      salary: contract.salary,
      status: contract.status as any,
    }).then(() => this.notify()).catch(() => {});
    this.logAction('Thêm mới', 'Hợp đồng', `Lập hợp đồng: ${contract.code}`);
  }

  public deleteContract(key: string) {
    this.data.contracts = this.data.contracts.filter((c) => c.key !== key);
    contractsApi.remove(key).catch(() => {});
  }

  // 4. Proposals (employeeProposalsApi)
  public getProposals(): Proposal[] {
    return [...this.data.proposals];
  }

  public addProposal(prop: Omit<Proposal, 'key'>) {
    const newP = { ...prop, key: String(Date.now()) };
    this.data.proposals = [newP, ...this.data.proposals];
    employeeProposalsApi.create({
      title: prop.title,
      type: prop.type,
      amount: 0,
      content: prop.content,
    }).then(() => this.notify()).catch(() => {});
    this.logAction('Thêm mới', 'Đề xuất', `Tạo đề xuất: ${prop.title}`);
  }

  public updateProposalStatus(key: string, status: 'Đã duyệt' | 'Từ chối') {
    this.data.proposals = this.data.proposals.map((p) => (p.key === key ? { ...p, status } : p));
    employeeProposalsApi.review(key, status, 'Đã cập nhật trạng thái').catch(() => {});
    this.logAction('Phê duyệt', 'Đề xuất', `Chuyển trạng thái đề xuất key ${key} sang ${status}`);
  }

  // 5. Cash Transactions (financeCashApi)
  public getTransactions(): CashTransaction[] {
    return [...this.data.cashTransactions];
  }

  public addTransaction(trx: Omit<CashTransaction, 'key'>): CashTransaction {
    const newTrx: CashTransaction = { ...trx, key: String(Date.now()) };
    this.data.cashTransactions = [newTrx, ...this.data.cashTransactions];
    financeCashApi.create({
      code: trx.code,
      type: trx.type,
      source: 'bank',
      category: trx.category,
      amount: trx.amount,
      date: trx.date,
      recipientOrPayer: trx.recipientOrPayer,
      account: trx.account,
      status: trx.status as any,
      note: trx.note,
    }).then(() => this.notify()).catch(() => {});
    this.logAction('Thêm mới', 'Tài chính', `Lập phiếu ${trx.type}: ${trx.code} (${trx.amount.toLocaleString()} ₫)`);
    return newTrx;
  }

  public deleteTransaction(key: string) {
    this.data.cashTransactions = this.data.cashTransactions.filter((t) => t.key !== key);
    financeCashApi.cancel(key).catch(() => {});
  }

  // 6. Bank Accounts (financeBankAccountsApi)
  public getBankAccounts(): BankAccount[] {
    return [...this.data.bankAccounts];
  }

  public addBankAccount(acc: Omit<BankAccount, 'key'>) {
    if (!acc) return;
    const newAcc = { ...acc, key: String(Date.now()) };
    this.data.bankAccounts = [newAcc, ...this.data.bankAccounts];
    financeBankAccountsApi.create({
      bankName: acc?.bankName || '',
      accountNumber: acc?.accountNumber || '',
      accountHolder: acc?.accountHolder || '',
      branch: acc?.branch || '',
      balance: acc?.balance || 0,
      status: acc?.status || 'Hoạt động',
    }).then(() => this.notify()).catch(() => {});
    this.logAction('Thêm mới', 'Tài chính', `Thêm tài khoản ngân hàng: ${acc?.bankName || ''}`);
  }

  // 7. Debts (financeDocumentsApi)
  public getDebts(): DebtRecord[] {
    return [...this.data.debts];
  }

  public addDebt(debt: Omit<DebtRecord, 'key'>) {
    const newDebt = { ...debt, key: String(Date.now()) };
    this.data.debts = [newDebt, ...this.data.debts];
  }

  // 8. Payroll (Collections: payroll)
  public getPayroll(): PayrollRecord[] {
    return this.getGenericData('payroll');
  }

  public updatePayrollStatus(key: string, status: 'Đã chi trả' | 'Chưa chi trả' | 'Chờ duyệt') {
    const current = this.getPayroll();
    const updated = current.map((p) => (p.key === key ? { ...p, status } : p));
    this.saveGenericData('payroll', updated);
    this.logAction('Chi trả', 'Tiền lương', `Cập nhật trạng thái phiếu lương key: ${key}`);
  }

  // 9. Leave Requests (Collections: leave_requests)
  public getLeaveRequests(): LeaveRequest[] {
    const mainList = this.getGenericData('leave_requests');
    if (mainList && mainList.length > 0) return mainList;
    const empList = this.getGenericData('employee_leaves');
    if (empList && empList.length > 0) return empList;
    return [];
  }

  public addLeaveRequest(req: Omit<LeaveRequest, 'key'>) {
    const newR = { ...req, key: String(Date.now()) };
    const current = this.getLeaveRequests();
    const updated = [newR, ...current];
    this.saveGenericData('leave_requests', updated);
    this.saveGenericData('employee_leaves', updated);
    this.logAction('Thêm mới', 'Chấm công', `Tạo đơn nghỉ phép: ${req.code}`);
  }

  public updateLeaveStatus(key: string, status: 'Đã duyệt' | 'Từ chối') {
    const current = this.getLeaveRequests();
    const updated = current.map((r) => (r.key === key ? { ...r, status } : r));
    this.saveGenericData('leave_requests', updated);
    this.saveGenericData('employee_leaves', updated);
    this.logAction('Phê duyệt', 'Chấm công', `Duyệt đơn nghỉ phép key: ${key} -> ${status}`);
  }

  // 10. Assets (Collections: assets)
  public getAssets(): AssetRecord[] {
    return this.getGenericData('assets');
  }

  public addAsset(asset: Omit<AssetRecord, 'key'>) {
    const newA = { ...asset, key: String(Date.now()) };
    const current = this.getAssets();
    const updated = [newA, ...current];
    this.saveGenericData('assets', updated);
    this.logAction('Thêm mới', 'Tài sản', `Thêm tài sản: ${asset.name} (${asset.code})`);
  }

  public deleteAsset(key: string) {
    const current = this.getAssets();
    const updated = current.filter((a) => a.key !== key);
    this.saveGenericData('assets', updated);
  }

  // 11. Meeting Rooms & Bookings (Collections: meeting_rooms, room_bookings)
  public getMeetingRooms(): MeetingRoom[] {
    return this.getGenericData('meeting_rooms');
  }

  public getRoomBookings(): RoomBooking[] {
    return this.getGenericData('room_bookings');
  }

  public addRoomBooking(booking: Omit<RoomBooking, 'key'>) {
    const newB = { ...booking, key: String(Date.now()) };
    const current = this.getRoomBookings();
    const updated = [newB, ...current];
    this.saveGenericData('room_bookings', updated);
    this.logAction('Đặt phòng', 'Phòng họp', `Đặt phòng ${booking.roomName}: ${booking.meetingTitle}`);
  }

  public cancelRoomBooking(key: string) {
    const current = this.getRoomBookings();
    const updated = current.map((b) => (b.key === key ? { ...b, status: 'Đã hủy' as const } : b));
    this.saveGenericData('room_bookings', updated);
  }

  // 12. Workflows (Collections: workflows)
  public getWorkflows(): WorkflowItem[] {
    return this.getGenericData('workflows');
  }

  public addWorkflow(wf: Omit<WorkflowItem, 'key'>) {
    const newW = { ...wf, key: String(Date.now()) };
    const current = this.getWorkflows();
    const updated = [newW, ...current];
    this.saveGenericData('workflows', updated);
    this.logAction('Tạo quy trình', 'Quy trình', `Tạo yêu cầu: ${wf.title}`);
  }

  public updateWorkflowStatus(key: string, status: 'Đã phê duyệt' | 'Bị từ chối') {
    const current = this.getWorkflows();
    const updated = current.map((w) => (w.key === key ? { ...w, status } : w));
    this.saveGenericData('workflows', updated);
    this.logAction('Phê duyệt', 'Quy trình', `Duyệt quy trình key ${key} -> ${status}`);
  }

  // 13. Tickets (Collections: tickets)
  public getTickets(): HelpdeskTicket[] {
    return this.getGenericData('tickets');
  }

  public addTicket(ticket: Omit<HelpdeskTicket, 'key'>) {
    const newT = { ...ticket, key: String(Date.now()) };
    const current = this.getTickets();
    const updated = [newT, ...current];
    this.saveGenericData('tickets', updated);
    this.logAction('Mở ticket', 'Hỗ trợ', `Mở ticket: ${ticket.title}`);
  }

  public updateTicketStatus(key: string, status: 'Đang xử lý' | 'Đã hoàn thành') {
    const current = this.getTickets();
    const updated = current.map((t) => (t.key === key ? { ...t, status } : t));
    this.saveGenericData('tickets', updated);
  }

  // 14. Plans (Collections: plans)
  public getPlans(): PlanItem[] {
    return this.getGenericData('plans');
  }

  public addPlan(plan: Omit<PlanItem, 'key'>) {
    const newP = { ...plan, key: String(Date.now()) };
    const current = this.getPlans();
    const updated = [newP, ...current];
    this.saveGenericData('plans', updated);
  }

  // 15. Audit Logs (auditLogsApi)
  public getAuditLogs(): AuditLog[] {
    return [...this.data.auditLogs];
  }

  // 16. Employee Portal Profile
  public getEmployeeProfile(): any {
    const stored = this.getGenericData('employee_my_profile');
    if (stored && stored.length > 0) return stored[0];
    return {
      code: '',
      name: '',
      avatar: '',
      title: '',
      position: '',
      department: '',
      unit: '',
      email: '',
      phone: '',
      joinDate: '',
      manager: '',
      idNumber: '',
      taxCode: '',
      insuranceNumber: '',
      bankName: '',
      bankAccount: '',
      address: '',
      status: 'Đang làm việc',
    };
  }

  public updateEmployeeProfile(profile: any) {
    this.saveGenericData('employee_my_profile', [profile]);
    this.logAction('Cập nhật hồ sơ cá nhân', 'Nhân viên', `Cập nhật thông tin nhân viên ${profile.name || ''}`);
  }

  public getEmployeeTimesheets(): any[] {
    return this.getGenericData('employee_timesheets');
  }

  public addEmployeeCheckin(type: 'in' | 'out'): any[] {
    const list = this.getEmployeeTimesheets();
    const now = new Date();
    const dateStr = now.toISOString().substring(0, 10);
    const timeStr = now.toTimeString().substring(0, 8);
    const updated = list.map((item) => {
      if (item.date === dateStr) {
        return type === 'in' ? { ...item, checkIn: timeStr } : { ...item, checkOut: timeStr };
      }
      return item;
    });
    if (!updated.some((item) => item.date === dateStr)) {
      updated.unshift({
        key: String(Date.now()),
        date: dateStr,
        checkIn: type === 'in' ? timeStr : '--:--:--',
        checkOut: type === 'out' ? timeStr : '--:--:--',
        duration: 'Đang làm việc',
        status: 'Đúng giờ',
        note: 'Chấm công trực tuyến Geofence',
      });
    }
    this.saveGenericData('employee_timesheets', updated);
    this.logAction('Chấm công trực tuyến', 'Nhân viên', `Thực hiện ${type === 'in' ? 'Check-in' : 'Check-out'} lúc ${timeStr}`);
    return updated;
  }

  public getEmployeeLeaves(): any[] {
    return this.getLeaveRequests();
  }

  public addEmployeeLeave(leave: any): any[] {
    const list = this.getEmployeeLeaves();
    const newLeave = {
      ...leave,
      key: String(Date.now()),
      code: leave.code || `NP-${String(Date.now()).slice(-4)}`,
      status: 'Chờ duyệt',
      employeeName: leave.employeeName || 'Nhân sự',
      leaveType: leave.type || leave.leaveType || 'Nghỉ phép năm',
      startDate: leave.fromDate || leave.startDate || '',
      endDate: leave.toDate || leave.endDate || '',
      daysCount: Number(leave.days) || Number(leave.daysCount) || 1,
    };
    const updated = [newLeave, ...list];
    this.saveGenericData('leave_requests', updated);
    this.saveGenericData('employee_leaves', updated);
    this.logAction('Tạo đơn xin nghỉ phép', 'Nhân viên', `Gửi đơn xin nghỉ ${newLeave.leaveType} số ngày: ${newLeave.daysCount}`);
    return updated;
  }

  public getEmployeeOvertime(): any[] {
    const mainList = this.getGenericData('attendance_overtime');
    if (mainList && mainList.length > 0) return mainList;
    const empList = this.getGenericData('employee_overtime');
    if (empList && empList.length > 0) return empList;
    return [];
  }

  public addEmployeeOvertime(ot: any): any[] {
    const list = this.getEmployeeOvertime();
    const newOt = {
      ...ot,
      key: String(Date.now()),
      code: ot.code || `OT-${String(Date.now()).slice(-4)}`,
      status: 'Chờ phê duyệt',
      otDate: ot.date || ot.otDate || new Date().toISOString().slice(0, 10),
      totalHours: Number(ot.hours) || Number(ot.totalHours) || 2,
      multiplier: ot.multiplier ? (typeof ot.multiplier === 'number' ? ot.multiplier : parseFloat(String(ot.multiplier)) / 100 || 1.5) : 1.5,
      timeRange: ot.fromTime && ot.toTime ? `${ot.fromTime} - ${ot.toTime}` : ot.timeRange || '18:00 - 21:30',
      baseHourlyRate: Number(ot.baseHourlyRate) || 180000,
    };
    const updated = [newOt, ...list];
    this.saveGenericData('attendance_overtime', updated);
    this.saveGenericData('employee_overtime', updated);
    this.logAction('Đăng ký OT', 'Nhân viên', `Đăng ký làm thêm ${newOt.totalHours}h ngày ${newOt.otDate}`);
    return updated;
  }

  public updateOvertimeStatus(key: string, status: 'Đã duyệt OT' | 'Từ chối' | 'Chờ phê duyệt'): any[] {
    const list = this.getEmployeeOvertime();
    const updated = list.map((item) => (item.key === key ? { ...item, status } : item));
    this.saveGenericData('attendance_overtime', updated);
    this.saveGenericData('employee_overtime', updated);
    this.logAction('Phê duyệt OT', 'Chấm công', `Cập nhật trạng thái OT key: ${key} -> ${status}`);
    return updated;
  }

  public getEmployeePayslips(): any[] {
    return this.getGenericData('employee_payslips');
  }

  // 17. Admin Management API
  public getAdminUsers(): any[] {
    return this.getGenericData('admin_users');
  }

  public addAdminUser(user: any) {
    const list = this.getAdminUsers();
    const newUser = { ...user, key: String(Date.now()), lastLogin: 'Chưa đăng nhập', status: 'Hoạt động' };
    const updated = [newUser, ...list];
    this.saveGenericData('admin_users', updated);
    this.logAction('Tạo tài khoản quản trị', 'Quản trị', `Tạo tài khoản mới ${user.username} (${user.role})`);
    return updated;
  }

  public toggleAdminUserStatus(key: string) {
    const list = this.getAdminUsers();
    const updated = list.map((u) => (u.key === key ? { ...u, status: u.status === 'Hoạt động' ? 'Khóa tạm thời' : 'Hoạt động' } : u));
    this.saveGenericData('admin_users', updated);
    this.logAction('Đổi trạng thái tài khoản', 'Quản trị', `Cập nhật trạng thái người dùng key: ${key}`);
    return updated;
  }

  public getAdminRoles(): any[] {
    return this.getGenericData('admin_roles');
  }

  // 18. Notification Center API (notificationsApi)
  public getNotifications(): AppNotification[] {
    return [...this.data.notifications];
  }

  public markNotificationAsRead(id: string): AppNotification[] {
    this.data.notifications = this.data.notifications.map((n) => (n.id === id ? { ...n, unread: false, read: true } : n));
    notificationsApi.markRead(id).catch(() => {});
    return [...this.data.notifications];
  }

  public markAllNotificationsAsRead(): AppNotification[] {
    this.data.notifications = this.data.notifications.map((n) => ({ ...n, unread: false, read: true }));
    notificationsApi.markAllRead().catch(() => {});
    return [...this.data.notifications];
  }

  public deleteNotification(id: string): AppNotification[] {
    this.data.notifications = this.data.notifications.filter((n) => n.id !== id);
    notificationsApi.remove(id).catch(() => {});
    return [...this.data.notifications];
  }

  public clearAllNotifications(): AppNotification[] {
    this.data.notifications = [];
    notificationsApi.clearAll().catch(() => {});
    return [];
  }

  public addNotification(notif: Omit<AppNotification, 'id' | 'time'>): AppNotification[] {
    const newN: AppNotification = {
      ...notif,
      id: String(Date.now()),
      time: 'Vừa xong',
      unread: true,
      read: false,
    };
    this.data.notifications = [newN, ...this.data.notifications];
    notificationsApi.create({
      title: notif.title,
      message: notif.message,
      type: notif.type,
      link: notif.link,
    }).then(() => this.notify()).catch(() => {});
    return [...this.data.notifications];
  }

  // 18b. System Broadcast Notifications
  public getSystemBroadcasts(): SystemBroadcastNotification[] {
    const list: SystemBroadcastNotification[] = this.getGenericData('system_broadcasts');
    const employees = this.getEmployees();
    const empCount = employees.length;
    return list.map((item) => {
      const totalRecipients = item.totalRecipients > 0 ? item.totalRecipients : empCount;
      return {
        ...item,
        totalRecipients,
        readCount: typeof item.readCount === 'number' ? item.readCount : 0,
      };
    });
  }

  public addSystemBroadcast(notif: Omit<SystemBroadcastNotification, 'id' | 'createdAt' | 'readCount' | 'totalRecipients'>): SystemBroadcastNotification[] {
    const list = this.getSystemBroadcasts();
    const employees = this.getEmployees();
    let totalRecipients = employees.length;
    if (notif.targetAudience && notif.targetAudience !== 'Tất cả nhân sự') {
      const parts = notif.targetAudience.split(',').map((s) => s.trim()).filter(Boolean);
      totalRecipients = Math.max(1, parts.length);
    }
    const newBroadcast: SystemBroadcastNotification = {
      ...notif,
      id: `SYS-NOTIF-${String(Date.now()).slice(-4)}`,
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
      readCount: 1,
      totalRecipients,
    };
    const updated = [newBroadcast, ...list];
    this.saveGenericData('system_broadcasts', updated);
    this.addNotification({
      title: `[Hệ thống] ${notif.title}`,
      message: notif.content,
      type: notif.type === 'urgent' ? 'urgent' : notif.type === 'maintenance' ? 'system' : 'info',
      link: '/admin/system/notifications',
    });
    return updated;
  }

  public deleteSystemBroadcast(id: string): SystemBroadcastNotification[] {
    const list = this.getSystemBroadcasts();
    const updated = list.filter((item) => item.id !== id);
    this.saveGenericData('system_broadcasts', updated);
    return updated;
  }

  public updateSystemBroadcast(id: string, updatedFields: Partial<SystemBroadcastNotification>): SystemBroadcastNotification[] {
    const list = this.getSystemBroadcasts();
    const updated = list.map((item) => (item.id === id ? { ...item, ...updatedFields } : item));
    this.saveGenericData('system_broadcasts', updated);
    return updated;
  }

  // 19. Contract Templates
  public getContractTemplates(): ContractTemplate[] {
    const stored = this.getGenericData('contract_templates');
    if (stored && stored.length > 0) return stored;
    return [];
  }

  public saveContractTemplates(list: ContractTemplate[]): void {
    this.saveGenericData('contract_templates', list);
    this.logAction('Cập nhật', 'Mẫu hợp đồng', `Đã lưu ${list.length} mẫu hợp đồng`);
  }

  // 20. Enterprise Contracts
  public getEnterpriseContracts(): any[] {
    return this.getGenericData('enterprise_contracts');
  }

  public saveEnterpriseContracts(list: any[]): void {
    this.saveGenericData('enterprise_contracts', list);
  }

  public getEmployeeContracts(): any[] {
    return this.getEnterpriseContracts();
  }

  public getEmployeeProposals(): any[] {
    return this.getGenericData('employee_proposals');
  }

  public addEmployeeProposal(proposal: any) {
    const list = this.getEmployeeProposals();
    const newProposal = {
      ...proposal,
      key: String(Date.now()),
      code: `KN-${String(Date.now()).slice(-4)}`,
      status: 'Chờ duyệt',
      date: new Date().toISOString().replace('T', ' ').substring(0, 16),
      approver: 'Chưa phân công',
    };
    const updated = [newProposal, ...list];
    this.saveGenericData('employee_proposals', updated);
    this.logAction('Tạo kiến nghị', 'Nhân viên', `Gửi kiến nghị: ${proposal.title}`);
    return updated;
  }

  public getEmployeeAssets(): any[] {
    return this.getGenericData('employee_assets');
  }

  public requestEmployeeAssetAction(assetKey: string, actionType: string, note: string) {
    const assets = this.getEmployeeAssets();
    const updated = assets.map((item) => {
      if (item.key === assetKey) {
        return {
          ...item,
          status: actionType === 'report' ? 'Báo hỏng - Đang xử lý' : 'Đang yêu cầu bàn giao',
          lastActionNote: note,
          lastActionDate: new Date().toISOString().slice(0, 10),
        };
      }
      return item;
    });
    this.saveGenericData('employee_assets', updated);
    this.logAction('Yêu cầu tài sản', 'Nhân viên', `Thực hiện ${actionType} cho tài sản key: ${assetKey}`);
    return updated;
  }

  public signEmployeePayslip(monthKey: string, signerName: string) {
    const list = this.getEmployeePayslips();
    const updated = list.map((item) => {
      if (item.key === monthKey) {
        return {
          ...item,
          signedStatus: 'Đã ký số xác nhận',
          signedDate: new Date().toISOString().replace('T', ' ').substring(0, 19),
          signerName,
        };
      }
      return item;
    });
    this.saveGenericData('employee_payslips', updated);
    this.logAction('Ký số phiếu lương', 'Nhân viên', `Ký xác nhận phiếu lương tháng: ${monthKey}`);
    return updated;
  }

  public getEmployeeBankAccount(employeeCode?: string): any {
    const accounts = this.getEmployeeBankAccounts();
    if (employeeCode) {
      const match = accounts.find((a) => a?.employeeCode === employeeCode && a?.isPrimary)
        || accounts.find((a) => a?.employeeCode === employeeCode);
      if (match) return match;
    }
    return accounts.find((a) => a?.isPrimary) || accounts[0] || null;
  }

  public updateEmployeeBankAccount(bankData: any): any[] {
    return this.saveEmployeeBankAccount(bankData, false);
  }

  public getEmployeeBankAccounts(): any[] {
    const data = this.getGenericData('employee_bank_accounts');
    return Array.isArray(data) ? data.filter(Boolean) : [];
  }

  public saveEmployeeBankAccount(bankData: any, isEmployee: boolean = false): any[] {
    if (!bankData) return this.getEmployeeBankAccounts();
    const list = this.getEmployeeBankAccounts();
    const existingIndex = list.findIndex((acc) => acc && (acc.id === bankData.id || (bankData.accountNumber && acc.accountNumber === bankData.accountNumber)));
    let updated: any[];
    const normStatus = bankData.status === 'verified' || bankData.status === 'Đã duyệt'
      ? 'Đã duyệt'
      : bankData.status === 'rejected' || bankData.status === 'Từ chối'
      ? 'Từ chối'
      : (isEmployee ? 'Chờ duyệt' : (bankData.status || 'Đã duyệt'));

    if (existingIndex >= 0) {
      updated = [...list];
      updated[existingIndex] = { ...updated[existingIndex], ...bankData, status: normStatus, updatedAt: new Date().toISOString() };
    } else {
      const newAcc = {
        ...bankData,
        id: bankData.id || `ba-${Date.now()}`,
        status: normStatus,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      updated = [newAcc, ...list];
    }
    this.saveGenericData('employee_bank_accounts', updated);
    return updated;
  }

  public approveEmployeeBankAccount(id: string): any[] {
    const list = this.getEmployeeBankAccounts();
    const updated = list.filter(Boolean).map((acc) => (acc?.id === id ? { ...acc, status: 'Đã duyệt', approvedAt: new Date().toISOString() } : acc));
    this.saveGenericData('employee_bank_accounts', updated);
    return updated;
  }

  public rejectEmployeeBankAccount(id: string, reason?: string): any[] {
    const list = this.getEmployeeBankAccounts();
    const updated = list.filter(Boolean).map((acc) => (acc?.id === id ? { ...acc, status: 'Từ chối', rejectReason: reason || 'Thông tin tài khoản không hợp lệ' } : acc));
    this.saveGenericData('employee_bank_accounts', updated);
    return updated;
  }

  public deleteEmployeeBankAccount(id: string): any[] {
    const list = this.getEmployeeBankAccounts();
    const updated = list.filter((acc) => acc && acc.id !== id);
    this.saveGenericData('employee_bank_accounts', updated);
    return updated;
  }

  public getAdminSessions(): any[] {
    return this.getGenericData('admin_sessions');
  }

  public getAdminBackups(): any[] {
    return this.getGenericData('admin_backups');
  }

  public createAdminBackup(name: string) {
    const list = this.getAdminBackups();
    const newBackup = {
      key: String(Date.now()),
      code: `BK-${Date.now()}`,
      name: name || `Full_Backup_${new Date().toISOString().slice(0, 10)}`,
      type: 'Tự động & Thủ công',
      size: '24.5 MB',
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      status: 'Thành công',
    };
    const updated = [newBackup, ...list];
    this.saveGenericData('admin_backups', updated);
    this.logAction('Sao lưu dữ liệu', 'Hệ thống', `Tạo bản sao lưu: ${newBackup.name}`);
    return updated;
  }

  public getAllEmployeeDigisigs(): any[] {
    return this.getGenericData('employee_digisigs');
  }

  public getEmployeeDigisig(employeeCode: string): any | null {
    const list = this.getAllEmployeeDigisigs();
    return list.find((d) => d.employeeCode === employeeCode) || null;
  }

  public saveEmployeeDigisig(digisigData: any): any {
    const list = this.getAllEmployeeDigisigs();
    const idx = list.findIndex((d) => d.employeeCode === digisigData.employeeCode);
    let updated: any[];
    if (idx >= 0) {
      updated = [...list];
      updated[idx] = { ...updated[idx], ...digisigData, updatedAt: new Date().toISOString() };
    } else {
      updated = [{ ...digisigData, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...list];
    }
    this.saveGenericData('employee_digisigs', updated);
    return digisigData;
  }

  public revokeEmployeeDigisig(employeeCode: string, reason: string = 'Thu hồi bởi Quản trị viên'): any[] {
    const list = this.getAllEmployeeDigisigs();
    const updated = list.map((d) => (d.employeeCode === employeeCode ? { ...d, status: 'revoked', revokeReason: reason } : d));
    this.saveGenericData('employee_digisigs', updated);
    return updated;
  }

  public updateEmployeeSignatureVisual(employeeCode: string, signatureImage: string, signatureType: 'draw' | 'font' | 'upload', signatureText?: string): any {
    const current = this.getEmployeeDigisig(employeeCode) || { employeeCode };
    const updated = {
      ...current,
      signatureImage,
      signatureType,
      signatureText: signatureText || current.signatureText,
      updatedAt: new Date().toISOString(),
    };
    return this.saveEmployeeDigisig(updated);
  }

  public getEmployeePasskey(employeeCode: string): any {
    const list = this.getGenericData('employee_passkeys');
    return list.find((p) => p.employeeCode === employeeCode) || null;
  }

  public saveEmployeePasskey(employeeCode: string, pin: string, deviceType: string = 'Windows Hello / Touch ID & Khóa bảo mật FIDO2'): any {
    const list = this.getGenericData('employee_passkeys');
    const existingIdx = list.findIndex((p) => p.employeeCode === employeeCode);
    const passkeyObj = {
      employeeCode,
      pinHash: btoa(pin),
      deviceType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    let updated: any[];
    if (existingIdx >= 0) {
      updated = [...list];
      updated[existingIdx] = passkeyObj;
    } else {
      updated = [passkeyObj, ...list];
    }
    this.saveGenericData('employee_passkeys', updated);
    return passkeyObj;
  }

  public verifyEmployeePasskey(employeeCode: string, pinInput: string): boolean {
    const passkey = this.getEmployeePasskey(employeeCode);
    if (!passkey) return false;
    return passkey.pinHash === btoa(pinInput);
  }

  public getEmployeeSigningLogs(employeeCode: string): any[] {
    const all = this.getGenericData('employee_signing_logs');
    if (!employeeCode) return all;
    return all.filter((l) => l.employeeCode === employeeCode);
  }

  public logDigitalSigning(employeeCode: string, docName: string, docType: string, passkeyVerified: boolean = true) {
    const logs = this.getGenericData('employee_signing_logs');
    const newLog = {
      id: `LOG-${Date.now()}`,
      employeeCode,
      docName,
      docType,
      passkeyVerified,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      ip: '127.0.0.1',
      status: 'Thành công',
    };
    this.saveGenericData('employee_signing_logs', [newLog, ...logs]);
  }

  public getEmployeeProfileUpdateRequests(employeeId?: string): EmployeeProfileUpdateRequest[] {
    const all = this.getGenericData('profile_update_requests') as EmployeeProfileUpdateRequest[];
    if (!employeeId) return all;
    return all.filter((r) => r.employeeId === employeeId);
  }

  public getActiveEmployeeProfileUpdateRequest(employeeId?: string): EmployeeProfileUpdateRequest | null {
    const requests = this.getEmployeeProfileUpdateRequests(employeeId);
    return requests.find((r) => r.status === 'pending') || null;
  }

  public createEmployeeProfileUpdateRequest(req: Omit<EmployeeProfileUpdateRequest, 'id' | 'createdAt' | 'status'>): EmployeeProfileUpdateRequest {
    const current = this.getEmployeeProfileUpdateRequests();
    const newReq: EmployeeProfileUpdateRequest = {
      ...req,
      id: `PUR-${Date.now()}`,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      status: 'pending',
    };
    this.saveGenericData('profile_update_requests', [newReq, ...current]);
    return newReq;
  }

  public resolveEmployeeProfileUpdateRequest(id: string): void {
    const current = this.getEmployeeProfileUpdateRequests();
    const updated = current.map((r) => (r.id === id ? { ...r, status: 'completed' as const } : r));
    this.saveGenericData('profile_update_requests', updated);
  }

  public resetEmployeeProfileSections(employeeId: string, sectionsToReset: string[]): any {
    this.logAction('Đặt lại hồ sơ', 'Nhân sự', `Đặt lại các mục hồ sơ: ${sectionsToReset.join(', ')} cho nhân viên ${employeeId}`);
  }

  // 24. Enterprise Tasks (tasksApi)
  public getEnterpriseTasks(): any[] {
    return this.getGenericData('enterprise_tasks');
  }

  public saveEnterpriseTasks(tasks: any[]): void {
    this.saveGenericData('enterprise_tasks', tasks);
  }

  public createEnterpriseTask(data: any): any {
    const list = this.getEnterpriseTasks();
    const newTask = {
      ...data,
      key: String(Date.now()),
      id: String(Date.now()),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      subtasks: data.subtasks || [],
      comments: [],
      activities: [],
      reports: [],
    };
    const updated = [newTask, ...list];
    this.saveEnterpriseTasks(updated);
    tasksApi.create({
      taskTitle: data.taskTitle,
      description: data.description,
      projectName: data.projectName,
      assigneeId: data.assigneeId,
      priority: data.priority,
      dueDate: data.dueDate,
    }).catch(() => {});
    return newTask;
  }

  public updateEnterpriseTask(id: string, patch: any): any {
    const list = this.getEnterpriseTasks();
    const updated = list.map((t) => (t.id === id || t.key === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t));
    this.saveEnterpriseTasks(updated);
    tasksApi.update(id, patch).catch(() => {});
    return updated.find((t) => t.id === id || t.key === id);
  }

  public addEnterpriseTaskComment(taskId: string, content: string): any {
    const list = this.getEnterpriseTasks();
    const comment = {
      key: String(Date.now()),
      author: 'Quản trị viên',
      content,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };
    const updated = list.map((t) => (t.id === taskId || t.key === taskId ? { ...t, comments: [...(t.comments || []), comment] } : t));
    this.saveEnterpriseTasks(updated);
    tasksApi.addComment(taskId, content).catch(() => {});
    return comment;
  }

  public addEnterpriseTaskReport(taskId: string, report: any): any {
    const list = this.getEnterpriseTasks();
    const reportItem = {
      key: String(Date.now()),
      author: report.author || 'Quản trị viên',
      content: report.content || '',
      progress: report.progress ?? 0,
      status: report.status || 'Đang thực hiện',
      attachments: Array.isArray(report.attachments) ? report.attachments : [],
      createdAt: new Date().toISOString(),
    };
    let updatedTask: any = null;
    const updated = list.map((t) => {
      if (t.id === taskId || t.key === taskId || t.taskCode === taskId) {
        const existingReports = Array.isArray(t.reports) ? t.reports : [];
        updatedTask = {
          ...t,
          progress: report.progress ?? t.progress,
          status: report.status ?? t.status,
          reports: [reportItem, ...existingReports],
          activities: [
            {
              key: String(Date.now()),
              actor: report.author || 'Quản trị viên',
              content: 'Đã gửi báo cáo công việc.',
              createdAt: new Date().toISOString(),
            },
            ...(Array.isArray(t.activities) ? t.activities : []),
          ],
        };
        return updatedTask;
      }
      return t;
    });
    this.saveEnterpriseTasks(updated);
    tasksApi.addReport(taskId, report).catch(() => {});
    return updatedTask || reportItem;
  }

  public deleteEnterpriseTask(id: string): void {
    const list = this.getEnterpriseTasks();
    const updated = list.filter((t) => t.id !== id && t.key !== id);
    this.saveEnterpriseTasks(updated);
    tasksApi.remove(id).catch(() => {});
  }

  // =========================================================================
  // DROPDOWN MENU CONFIGURATION (admin/drop-menu)
  // =========================================================================
  public static readonly DEFAULT_DROPDOWN_GROUPS: DropdownGroup[] = [
    {
      key: 'positions',
      title: 'Chức danh đảm nhiệm',
      description: 'Cấu hình danh mục chức vụ, vị trí công tác của nhân sự trong toàn công ty.',
      icon: 'IdcardOutlined',
      defaultOptions: DEFAULT_POSITION_OPTIONS,
    },
    {
      key: 'work_statuses',
      title: 'Trạng thái làm việc',
      description: 'Cấu hình trạng thái lao động của nhân sự: Chính thức, Thử việc, Đã nghỉ...',
      icon: 'CheckCircleOutlined',
      defaultOptions: DEFAULT_WORK_STATUS_OPTIONS,
    },
    {
      key: 'contract_types',
      title: 'Phân loại hợp đồng',
      description: 'Cấu hình các loại hợp đồng lao động, thử việc, cố vấn và dịch vụ B2B.',
      icon: 'FileTextOutlined',
      defaultOptions: DEFAULT_CONTRACT_TYPE_OPTIONS,
    },
    {
      key: 'leave_types',
      title: 'Loại nghỉ phép',
      description: 'Cấu hình các loại đơn xin nghỉ: Phép năm, Nghỉ không lương, Nghỉ ốm...',
      icon: 'CalendarOutlined',
      defaultOptions: DEFAULT_LEAVE_TYPE_OPTIONS,
    },
    {
      key: 'academic_levels',
      title: 'Trình độ học vấn',
      description: 'Cấu hình các bậc học vấn: Tiến sĩ, Thạc sĩ, Đại học, Cao đẳng, Trung cấp...',
      icon: 'ReadOutlined',
      defaultOptions: DEFAULT_ACADEMIC_LEVEL_OPTIONS,
    },
    {
      key: 'job_ranks',
      title: 'Cấp bậc nhân sự',
      description: 'Cấu hình phân cấp chức bậc theo tiêu chuẩn quản trị nhân sự.',
      icon: 'ApartmentOutlined',
      defaultOptions: DEFAULT_JOB_RANK_OPTIONS,
    },
    {
      key: 'asset_categories',
      title: 'Phân loại tài sản',
      description: 'Cấu hình danh mục trang thiết bị, máy tính, nội thất và công cụ làm việc.',
      icon: 'AppstoreOutlined',
      defaultOptions: DEFAULT_ASSET_CATEGORY_OPTIONS,
    },
  ];

  public getDropdownGroups(): DropdownGroup[] {
    return DataService.DEFAULT_DROPDOWN_GROUPS;
  }

  public getDropdownOptions(groupKey: string): DropdownOptionItem[] {
    const raw = this.getGenericData(`dropdown_${groupKey}`);
    if (!raw || raw.length === 0) {
      return this.getDropdownDefaults(groupKey);
    }
    return raw.sort((a, b) => (a.order || 99) - (b.order || 99));
  }

  public async fetchDropdownOptions(groupKey: string): Promise<DropdownOptionItem[]> {
    const key = `dropdown_${groupKey}`;
    try {
      const response = await collectionsApi.get<DropdownOptionItem>(key, { limit: 500, sort: 'order', order: 'asc' });
      const rows = (response.data?.data || []).sort((a, b) => (a.order || 99) - (b.order || 99));
      if (rows.length > 0) {
        this.genericCache.set(key, rows);
        saveToStorage(key, rows);
        return rows;
      }
    } catch {}

    const cached = this.getGenericData(key);
    if (cached && cached.length > 0) {
      return cached;
    }

    const defaults = this.getDropdownDefaults(groupKey);
    this.genericCache.set(key, defaults);
    saveToStorage(key, defaults);
    this.saveGenericData(key, defaults);
    return defaults;
  }

  public saveDropdownOption(groupKey: string, option: DropdownOptionItem): DropdownOptionItem[] {
    const key = `dropdown_${groupKey}`;
    const current = this.getDropdownOptions(groupKey);
    const existingIndex = current.findIndex((o) => o.id === option.id);
    const codeValue = option.code != null ? String(option.code).trim() : '';

    let updated: DropdownOptionItem[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = {
        ...updated[existingIndex],
        ...option,
        code: codeValue,
      };
    } else {
      const newOption: DropdownOptionItem = {
        ...option,
        id: option.id || `opt-${groupKey}-${Date.now()}`,
        code: codeValue,
        order: option.order || current.length + 1,
        isActive: option.isActive !== false,
      };
      updated = [...current, newOption];
    }
    this.saveGenericData(key, updated);
    return updated;
  }

  public deleteDropdownOption(groupKey: string, id: string): DropdownOptionItem[] {
    const key = `dropdown_${groupKey}`;
    const current = this.getDropdownOptions(groupKey);
    const updated = current.filter((o) => o.id !== id);
    this.saveGenericData(key, updated);
    return updated;
  }

  public resetDropdownDefaults(groupKey: string): DropdownOptionItem[] {
    const key = `dropdown_${groupKey}`;
    const defaults = this.getDropdownDefaults(groupKey);
    this.saveGenericData(key, defaults);
    return defaults;
  }

  private getDropdownDefaults(groupKey: string): DropdownOptionItem[] {
    const group = DataService.DEFAULT_DROPDOWN_GROUPS.find((item) => item.key === groupKey);
    return (group?.defaultOptions || []).map((item) => ({ ...item }));
  }

  public getPositionsList(): string[] {
    const options = this.getDropdownOptions('positions');
    return options.filter((o) => o.isActive !== false).map((o) => o.name);
  }

  public getOrgUnitsList(): string[] {
    const units = this.getGenericData('business_org_units');
    const stored = (Array.isArray(units) ? units : [])
      .filter((u: any) => u?.status !== 'Tạm ngưng' && u?.name)
      .map((u: any) => String(u.name).trim())
      .filter(Boolean);
    if (stored.length === 0) {
      return [
        'Ban Giám Đốc',
        'Phòng Kỹ Thuật',
        'Phòng Kinh Doanh',
        'Phòng Tài Chính - Kế Toán',
        'Phòng Hành Chính - Nhân Sự',
      ];
    }
    return Array.from(new Set(stored)).sort((a, b) => a.localeCompare(b, 'vi'));
  }

  public async fetchOrgUnitsList(): Promise<string[]> {
    try {
      const response = await collectionsApi.get<any>('business_org_units', { limit: 500, sort: 'name', order: 'asc' });
      const rows = response.data?.data || [];
      this.genericCache.set('business_org_units', rows);
      const stored = rows
        .filter((u: any) => u?.status !== 'Tạm ngưng' && u?.name)
        .map((u: any) => String(u.name).trim())
        .filter(Boolean);

      if (stored.length > 0) {
        return Array.from(new Set(stored)).sort((a, b) => a.localeCompare(b, 'vi'));
      }
      return this.getOrgUnitsList();
    } catch {
      return this.getOrgUnitsList();
    }
  }

  public getDepartmentsList(): string[] {
    return this.getOrgUnitsList();
  }
}

export interface DropdownOptionItem {
  id: string;
  name: string;
  code?: string;
  color?: string;
  order?: number;
  description?: string;
  isActive?: boolean;
}

export interface DropdownGroup {
  key: string;
  title: string;
  description: string;
  icon?: string;
  defaultOptions: DropdownOptionItem[];
}

export const dataService = new DataService();
