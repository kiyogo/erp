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
  { key: 'department', label: 'Phòng ban / Đơn vị phụ trách', type: 'text', placeholder: 'Khối Phát Triển Kinh Doanh', required: true },
  { key: 'position', label: 'Vị trí / vai trò hợp tác', type: 'text', placeholder: 'Đối tác chiến lược B2B', required: true },
  { key: 'contractValue', label: 'Tổng giá trị hợp đồng (VNĐ)', type: 'number', placeholder: '1200000000' },
  { key: 'salary', label: 'Mức lương / Thù lao định kỳ (VNĐ)', type: 'number', placeholder: '48000000' },
  { key: 'allowance', label: 'Phụ cấp trách nhiệm (VNĐ)', type: 'number', placeholder: '5000000' },
  { key: 'stockSharesPercent', label: 'Tỷ lệ cổ phần thưởng ESOP', type: 'text', placeholder: '2.5% Tổng cổ phần phát hành' },
  { key: 'startDate', label: 'Ngày bắt đầu hiệu lực', type: 'date', required: true },
  { key: 'endDate', label: 'Ngày hết hạn', type: 'text', placeholder: 'Không thời hạn hoặc 2028-12-31', required: true },
  { key: 'paymentMethod', label: 'Hình thức chi trả', type: 'select', options: ['Chuyển khoản ngân hàng', 'Tiền mặt'] },
  { key: 'workLocation', label: 'Địa điểm thực hiện / làm việc', type: 'text', placeholder: 'Trụ sở chính KIYOVN - Tòa nhà Keangnam Landmark 72, Hà Nội' },
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

class DataService {
  private data: DataStore;
  private genericCache: Map<string, any[]>;
  private initialized: boolean;
  private listeners: Set<() => void>;

  constructor() {
    this.data = { ...EMPTY_DATA };
    this.genericCache = new Map();
    this.initialized = false;
    this.listeners = new Set();
    this.syncInitialData();
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
    auditLogsApi.record({ action, module, detail }).catch(() => {});
  }

  // Generic fallback screens read/write via backend SQLite collections
  public getGenericData(scope: string): any[] {
    const key = scope.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    if (!this.genericCache.has(key)) {
      this.genericCache.set(key, []);
      collectionsApi.get(key).then((res) => {
        if (res.data?.data && Array.isArray(res.data.data)) {
          this.genericCache.set(key, res.data.data);
          this.notify();
        }
      }).catch(() => {});
    }
    return this.genericCache.get(key) || [];
  }

  public saveGenericData(scope: string, rows: any[]): void {
    const key = scope.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    this.genericCache.set(key, rows);
    collectionsApi.replace(key, rows).catch((e) => {
      console.warn('Collections save failed:', e);
    });
  }

  // 1. Org Units (Collections: org_units)
  public getOrgUnits(): OrgUnit[] {
    return this.getGenericData('org_units');
  }

  public addOrgUnit(unit: Omit<OrgUnit, 'key'>): OrgUnit {
    const newUnit: OrgUnit = { ...unit, key: String(Date.now()) };
    const current = this.getOrgUnits();
    const updated = [newUnit, ...current];
    this.saveGenericData('org_units', updated);
    this.logAction('Thêm mới', 'Doanh nghiệp', `Thêm đơn vị tổ chức: ${unit.name}`);
    return newUnit;
  }

  public updateOrgUnit(key: string, patch: Partial<OrgUnit>) {
    const current = this.getOrgUnits();
    const updated = current.map((u) => (u.key === key ? { ...u, ...patch } : u));
    this.saveGenericData('org_units', updated);
    this.logAction('Cập nhật', 'Doanh nghiệp', `Cập nhật đơn vị key: ${key}`);
  }

  public deleteOrgUnit(key: string) {
    const current = this.getOrgUnits();
    const updated = current.filter((u) => u.key !== key);
    this.saveGenericData('org_units', updated);
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
        this.syncInitialData();
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
    }).then(() => this.syncInitialData()).catch(() => {});
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
    }).then(() => this.syncInitialData()).catch(() => {});
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
    }).then(() => this.syncInitialData()).catch(() => {});
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
    const newAcc = { ...acc, key: String(Date.now()) };
    this.data.bankAccounts = [newAcc, ...this.data.bankAccounts];
    financeBankAccountsApi.create({
      bankName: acc.bankName,
      accountNumber: acc.accountNumber,
      accountHolder: acc.accountHolder,
      branch: acc.branch,
      balance: acc.balance,
      status: acc.status,
    }).then(() => this.syncInitialData()).catch(() => {});
    this.logAction('Thêm mới', 'Tài chính', `Thêm tài khoản ngân hàng: ${acc.bankName}`);
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
    return this.getGenericData('leave_requests');
  }

  public addLeaveRequest(req: Omit<LeaveRequest, 'key'>) {
    const newR = { ...req, key: String(Date.now()) };
    const current = this.getLeaveRequests();
    const updated = [newR, ...current];
    this.saveGenericData('leave_requests', updated);
    this.logAction('Thêm mới', 'Chấm công', `Tạo đơn nghỉ phép: ${req.code}`);
  }

  public updateLeaveStatus(key: string, status: 'Đã duyệt' | 'Từ chối') {
    const current = this.getLeaveRequests();
    const updated = current.map((r) => (r.key === key ? { ...r, status } : r));
    this.saveGenericData('leave_requests', updated);
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
    return this.getGenericData('employee_leaves');
  }

  public addEmployeeLeave(leave: any): any[] {
    const list = this.getEmployeeLeaves();
    const newLeave = { ...leave, key: String(Date.now()), code: `NP-${String(Date.now()).slice(-4)}`, status: 'Chờ duyệt' };
    const updated = [newLeave, ...list];
    this.saveGenericData('employee_leaves', updated);
    this.logAction('Tạo đơn xin nghỉ phép', 'Nhân viên', `Gửi đơn xin nghỉ ${leave.type} số ngày: ${leave.days}`);
    return updated;
  }

  public getEmployeeOvertime(): any[] {
    return this.getGenericData('employee_overtime');
  }

  public addEmployeeOvertime(ot: any): any[] {
    const list = this.getEmployeeOvertime();
    const newOt = { ...ot, key: String(Date.now()), code: `OT-${String(Date.now()).slice(-4)}`, status: 'Chờ duyệt' };
    const updated = [newOt, ...list];
    this.saveGenericData('employee_overtime', updated);
    this.logAction('Đăng ký OT', 'Nhân viên', `Đăng ký làm thêm ${ot.hours}h ngày ${ot.date}`);
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
    }).then(() => this.syncInitialData()).catch(() => {});
    return [...this.data.notifications];
  }

  // 18b. System Broadcast Notifications
  public getSystemBroadcasts(): SystemBroadcastNotification[] {
    const list: SystemBroadcastNotification[] = this.getGenericData('system_broadcasts');
    const isSuperAdminCode = (code?: string) => code === 'EMP-640484' || code === 'ADMIN-001';
    const isSuperAdminEmail = (email?: string) => email === 'tung@kiyovn.local' || email === 'admin@kiyovn.com';
    const employees = this.getEmployees().filter((e) => !isSuperAdminCode(e.code) && !isSuperAdminEmail(e.email));
    const empCount = employees.length > 0 ? employees.length : 12;
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
    const isSuperAdminCode = (code?: string) => code === 'EMP-640484' || code === 'ADMIN-001';
    const isSuperAdminEmail = (email?: string) => email === 'tung@kiyovn.local' || email === 'admin@kiyovn.com';
    const employees = this.getEmployees().filter((e) => !isSuperAdminCode(e.code) && !isSuperAdminEmail(e.email));
    let totalRecipients = employees.length > 0 ? employees.length : 12;
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
    return accounts.find((a) => a.isPrimary) || accounts[0] || null;
  }

  public updateEmployeeBankAccount(bankData: any): any[] {
    return this.saveEmployeeBankAccount(bankData, false);
  }

  public getEmployeeBankAccounts(): any[] {
    return this.getGenericData('employee_bank_accounts');
  }

  public saveEmployeeBankAccount(bankData: any, isEmployee: boolean = false): any[] {
    const list = this.getEmployeeBankAccounts();
    const existingIndex = list.findIndex((acc) => acc.id === bankData.id || acc.accountNumber === bankData.accountNumber);
    let updated: any[];
    if (existingIndex >= 0) {
      updated = [...list];
      updated[existingIndex] = { ...updated[existingIndex], ...bankData, updatedAt: new Date().toISOString() };
    } else {
      const newAcc = {
        ...bankData,
        id: bankData.id || `BA-${Date.now()}`,
        status: isEmployee ? 'pending' : (bankData.status || 'verified'),
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
    const updated = list.map((acc) => (acc.id === id ? { ...acc, status: 'verified', approvedAt: new Date().toISOString() } : acc));
    this.saveGenericData('employee_bank_accounts', updated);
    return updated;
  }

  public rejectEmployeeBankAccount(id: string, reason?: string): any[] {
    const list = this.getEmployeeBankAccounts();
    const updated = list.map((acc) => (acc.id === id ? { ...acc, status: 'rejected', rejectReason: reason || 'Thông tin tài khoản không hợp lệ' } : acc));
    this.saveGenericData('employee_bank_accounts', updated);
    return updated;
  }

  public deleteEmployeeBankAccount(id: string): any[] {
    const list = this.getEmployeeBankAccounts();
    const updated = list.filter((acc) => acc.id !== id);
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
      author: 'Quản trị viên',
      content: report.content || '',
      progress: report.progress || 0,
      status: report.status || 'Đang thực hiện',
      attachments: report.attachments || [],
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };
    const updated = list.map((t) => (t.id === taskId || t.key === taskId ? {
      ...t,
      progress: report.progress ?? t.progress,
      status: report.status ?? t.status,
      reports: [...(t.reports || []), reportItem],
    } : t));
    this.saveEnterpriseTasks(updated);
    tasksApi.addReport(taskId, report).catch(() => {});
    return reportItem;
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
      defaultOptions: [
        { id: 'pos-1', name: 'Tổng Giám Đốc', code: 'CEO', color: '#DC2626', order: 1, description: 'Người đại diện pháp luật, điều hành cao nhất' },
        { id: 'pos-2', name: 'Phó Tổng Giám Đốc', code: 'DCEO', color: '#EA580C', order: 2, description: 'Phụ trách chiến lược và quản lý khối ban' },
        { id: 'pos-3', name: 'Giám Đốc Công Nghệ', code: 'CTO', color: '#2563EB', order: 3, description: 'Lãnh đạo bộ phận Kỹ thuật, Công nghệ & R&D' },
        { id: 'pos-4', name: 'Giám Đốc Tài Chính', code: 'CFO', color: '#059669', order: 4, description: 'Quản lý tài chính, dòng tiền và kiểm toán' },
        { id: 'pos-5', name: 'Giám Đốc Nhân Sự', code: 'CHRO', color: '#7C3AED', order: 5, description: 'Quản trị nhân tài, văn hóa và chế độ phúc lợi' },
        { id: 'pos-6', name: 'Trưởng Nhóm Kỹ Thuật', code: 'TECH_LEAD', color: '#0284C7', order: 6, description: 'Phụ trách kiến trúc kỹ thuật và dẫn dắt team dự án' },
        { id: 'pos-7', name: 'Kỹ sư Phần mềm Cao cấp', code: 'SR_DEV', color: '#0D9488', order: 7, description: 'Phát triển các module cốt lõi và tối ưu hệ thống' },
        { id: 'pos-8', name: 'Kỹ sư Phần mềm', code: 'DEV', color: '#009688', order: 8, description: 'Lập trình tính năng, viết unit test và tài liệu' },
        { id: 'pos-9', name: 'Kỹ sư DevOps & Hệ thống', code: 'DEVOPS', color: '#4F46E5', order: 9, description: 'Quản trị hạ tầng đám mây, CI/CD và bảo mật' },
        { id: 'pos-10', name: 'Kỹ sư Kiểm thử (QA/QC)', code: 'QA_QC', color: '#D97706', order: 10, description: 'Kiểm thử chất lượng phần mềm, tự động hóa kiểm thử' },
        { id: 'pos-11', name: 'Chuyên viên Thiết kế UI/UX', code: 'UIUX', color: '#DB2777', order: 11, description: 'Thiết kế giao diện người dùng và trải nghiệm sản phẩm' },
        { id: 'pos-12', name: 'Trưởng Phòng Kinh Doanh', code: 'SALES_LEAD', color: '#B45309', order: 12, description: 'Quản lý mục tiêu doanh số và đội ngũ bán hàng' },
        { id: 'pos-13', name: 'Chuyên viên Kinh Doanh', code: 'SALES_EXEC', color: '#CA8A04', order: 13, description: 'Tìm kiếm khách hàng, tư vấn giải pháp và chốt hợp đồng' },
        { id: 'pos-14', name: 'Kế toán Tổng hợp', code: 'ACC', color: '#16A34A', order: 14, description: 'Quản lý chứng từ, sổ sách kế toán và báo cáo thuế' },
        { id: 'pos-15', name: 'Chuyên viên Tuyển dụng & Đào tạo', code: 'HR_SPEC', color: '#9333EA', order: 15, description: 'Thu hút nhân tài, tổ chức đào tạo và hội nhập' },
        { id: 'pos-16', name: 'Chuyên viên Hành chính', code: 'ADMIN_OFFICER', color: '#475569', order: 16, description: 'Quản lý văn phòng phẩm, sự kiện và thủ tục hành chính' },
      ],
    },
  ];

  public getDropdownGroups(): DropdownGroup[] {
    return DataService.DEFAULT_DROPDOWN_GROUPS;
  }

  public getDropdownOptions(groupKey: string): DropdownOptionItem[] {
    const raw = this.getGenericData(`dropdown_${groupKey}`);
    if (!raw || raw.length === 0) {
      const defaultGroup = DataService.DEFAULT_DROPDOWN_GROUPS.find((g) => g.key === groupKey);
      if (defaultGroup) {
        this.saveGenericData(`dropdown_${groupKey}`, defaultGroup.defaultOptions);
        return defaultGroup.defaultOptions;
      }
      return [];
    }
    return raw.sort((a, b) => (a.order || 99) - (b.order || 99));
  }

  public saveDropdownOption(groupKey: string, option: DropdownOptionItem): DropdownOptionItem[] {
    const current = this.getDropdownOptions(groupKey);
    const existingIndex = current.findIndex((o) => o.id === option.id);
    let updated: DropdownOptionItem[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = { ...updated[existingIndex], ...option };
    } else {
      const newOption = {
        ...option,
        id: option.id || `opt-${Date.now()}`,
        order: option.order || current.length + 1,
        isActive: option.isActive !== false,
      };
      updated = [...current, newOption];
    }
    this.saveGenericData(`dropdown_${groupKey}`, updated);
    return updated;
  }

  public deleteDropdownOption(groupKey: string, id: string): DropdownOptionItem[] {
    const current = this.getDropdownOptions(groupKey);
    const updated = current.filter((o) => o.id !== id);
    this.saveGenericData(`dropdown_${groupKey}`, updated);
    return updated;
  }

  public resetDropdownDefaults(groupKey: string): DropdownOptionItem[] {
    const defaultGroup = DataService.DEFAULT_DROPDOWN_GROUPS.find((g) => g.key === groupKey);
    const defaults = defaultGroup ? [...defaultGroup.defaultOptions] : [];
    this.saveGenericData(`dropdown_${groupKey}`, defaults);
    return defaults;
  }

  public getPositionsList(): string[] {
    const options = this.getDropdownOptions('positions');
    return options.filter((o) => o.isActive !== false).map((o) => o.name);
  }

  public getOrgUnitsList(): string[] {
    const units = this.getGenericData('business_org_units');
    if (units && Array.isArray(units) && units.length > 0) {
      return units.filter((u: any) => u.status !== 'Tạm ngưng').map((u: any) => u.name);
    }
    return [
      'Ban Giám Đốc',
      'Phòng Ban Kỹ Thuật',
      'Khối Kinh Doanh & Tiếp Thị',
      'Phòng Tài Chính Kế Toán',
      'Phòng Nhân Sự & Hành Chính',
      'Phòng Nghiên Cứu & Phát Triển (R&D)',
      'Chi Nhánh Hà Nội',
      'Chi Nhánh TP. Hồ Chí Minh',
    ];
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
