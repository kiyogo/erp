import api from './axios';

export const authApi = {
  login:          (email: string, password: string) => api.post('/auth/login', { email, password }),
  loginGoogle:    (data?: any)                      => api.post('/auth/google', data || {}),
  getProfile:     ()                                 => api.get('/auth/profile'),
  changePassword: (data: { oldPassword?: string; currentPassword?: string; newPassword: string; confirmPassword?: string }) =>
    api.post<{ success: boolean; message: string }>('/auth/change-password', data),
};

export const dashboardApi = {
  getStats: () => api.get<DashboardStatsData>('/dashboard/stats'),
};

export interface DashboardPendingWorkflow {
  key: string;
  id: string;
  code: string;
  title: string;
  requester: string;
  department: string;
  submittedDate: string;
  status: string;
  type: string;
  amount?: number;
}

export interface DashboardAuditItem {
  key: string;
  time: string;
  timestamp: string;
  action: string;
  type: string;
  user: string;
  detail?: string;
}

export interface DashboardStatsData {
  totalUsers: number;
  activeUsers: number;
  totalEmployees: number;
  newEmployeesThisMonth: number;
  monthlyRevenue: number;
  monthlyExpense: number;
  pendingApprovalsCount: number;
  pendingWorkflows: DashboardPendingWorkflow[];
  recentAuditLogs: DashboardAuditItem[];
}

export const usersApi = {
  getAll:  ()                      => api.get('/users'),
  getOne:  (id: string)            => api.get(`/users/${id}`),
  create:  (data: any)             => api.post('/users', data),
  update:  (id: string, data: any) => api.patch(`/users/${id}`, data),
  remove:  (id: string)            => api.delete(`/users/${id}`),
};

export type EnterpriseEmployee = {
  key: string;
  id: string;
  userId: string;
  code: string;
  employeeCode: string;
  name: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  status: 'Chính thức' | 'Thử việc' | 'Đã nghỉ việc';
  joinDate: string;
  salaryBase: number;
  avatar?: string;
  role: 'ADMIN' | 'USER';
  isActive: boolean;
  activationStatus: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};

export type EmployeePayload = Partial<Omit<EnterpriseEmployee, 'key' | 'id' | 'userId' | 'role' | 'isActive' | 'activationStatus' | 'createdAt' | 'updatedAt'>> & {
  details?: Record<string, unknown>;
};

export const employeesApi = {
  getAll: () => api.get<{ data: EnterpriseEmployee[] }>('/employees'),
  getOne: (id: string) => api.get<{ employee: EnterpriseEmployee }>(`/employees/${id}`),
  getMyProfile: () => api.get<{ employee: EnterpriseEmployee }>('/employees/me'),
  create: (data: EmployeePayload) => api.post<{ employee: EnterpriseEmployee; user: unknown; delivery: { status: string; message?: string }; expiresAt: string }>('/employees', data),
  update: (id: string, data: EmployeePayload) => api.patch<{ employee: EnterpriseEmployee }>(`/employees/${id}`, data),
  updateMyProfile: (data: EmployeePayload) => api.patch<{ employee: EnterpriseEmployee }>('/employees/me', data),
  retire: (id: string) => api.delete<{ employee: EnterpriseEmployee }>(`/employees/${id}`),
  resendActivation: (id: string) => api.post<{ delivery: { status: string; message?: string }; expiresAt: string }>(`/employees/${id}/activation`),
  changePassword: (id: string, data: { newPassword: string; confirmPassword?: string; password?: string }) => api.post<{ success: boolean; message: string }>(`/employees/${id}/password`, data),
};

export type EmailGatewayConfig = {
  host: string;
  port: number;
  username: string;
  senderEmail: string;
  senderName: string;
  security: 'STARTTLS' | 'SSL';
  portalUrl: string;
  enabled: boolean;
  password?: string;
  passwordConfigured: boolean;
  configured: boolean;
};

export type ActivationEmailTemplate = {
  subject: string;
  heading: string;
  body: string;
  buttonLabel: string;
  footer: string;
};

export const systemApi = {
  getEmailConfig: () => api.get<{ config: EmailGatewayConfig }>('/system/email-config'),
  saveEmailConfig: (data: Partial<EmailGatewayConfig> & { password?: string }) => api.put<{ config: EmailGatewayConfig }>('/system/email-config', data),
  testEmailConfig: (recipient?: string) => api.post<{ sent: true }>('/system/email-config/test', { recipient }),
  sendEmail: (data: { to: string | string[]; subject: string; content?: string; text?: string; html?: string; category?: string }) => api.post<{ sent: true; count: number; total: number }>('/system/send-email', data),
  getActivationTemplate: () => api.get<{ template: ActivationEmailTemplate; emailConfigured: boolean }>('/system/notification-templates/account-activation'),
  saveActivationTemplate: (template: ActivationEmailTemplate) => api.put<{ template: ActivationEmailTemplate }>('/system/notification-templates/account-activation', template),
};

export const activationApi = {
  authorize: (token: string) => api.post<{ activation_token: string; expires_at: string; user: unknown }>('/auth/activation/authorize', { token }),
  setPassword: (activationToken: string, password: string, googleCredential?: string) => api.post<{ access_token: string; user: unknown }>('/auth/activation/set-password', { activationToken, password, googleCredential }),
};

export type StoredFileNode = {
  key: string;
  id: string;
  parentId: string | null;
  employeeId: string | null;
  name: string;
  type: 'dir' | 'file';
  mime?: string;
  sizeBytes: number;
  owner: string;
  group: string;
  permission: string;
  modified: string;
  originModule: string;
  isHidden: boolean;
  isSystem: boolean;
  isProtected: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FileSharePayload = {
  id: string;
  fileId: string;
  token: string;
  isActive: boolean;
  url: string;
  createdAt: string;
  updatedAt: string;
  file?: StoredFileNode;
};

export const filesApi = {
  list: (parentId?: string | null, includeHidden = false, employeeScope = false) => api.get<{ data: StoredFileNode[]; context: { parentId: string; isVirtualEmployeeRoot: boolean; rootLabel: string; canShowHidden: boolean } }>('/files', {
    params: { ...(parentId ? { parentId } : {}), ...(includeHidden ? { includeHidden: 'true' } : {}), ...(employeeScope ? { scope: 'employee' } : {}) },
  }),
  createFolder: (name: string, parentId?: string | null, originModule = 'files') => api.post<{ file: StoredFileNode }>('/files/folders', { name, parentId, originModule }),
  upload: (file: Blob, name: string, parentId?: string | null, originModule = 'files') => api.post<{ file: StoredFileNode }>('/files/upload', file, {
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(name),
      ...(parentId ? { 'X-Parent-Id': parentId } : {}),
      'X-Origin-Module': originModule,
    },
    maxContentLength: 50 * 1024 * 1024,
    maxBodyLength: 50 * 1024 * 1024,
  }),
  update: (id: string, name: string) => api.patch<{ file: StoredFileNode }>(`/files/${id}`, { name }),
  updateContent: (id: string, content: Blob) => api.put<{ file: StoredFileNode }>(`/files/${id}/content`, content, {
    headers: { 'Content-Type': content.type || 'application/octet-stream' },
    maxContentLength: 50 * 1024 * 1024,
    maxBodyLength: 50 * 1024 * 1024,
  }),
  remove: (id: string) => api.delete(`/files/${id}`),
  download: (id: string) => api.get<Blob>(`/files/${id}/download`, { responseType: 'blob' }),
  getShare: (id: string) => api.get<{ share: FileSharePayload | null; file?: StoredFileNode }>(`/files/${id}/share`),
  saveShare: (id: string, data: { isActive?: boolean; regenerate?: boolean }) => api.post<{ share: FileSharePayload }>(`/files/${id}/share`, data),
  updateShare: (id: string, data: { isActive?: boolean; regenerate?: boolean }) => api.patch<{ share: FileSharePayload }>(`/files/${id}/share`, data),
  getPublicShare: (token: string) => api.get<{ share: FileSharePayload }>(`/files/share/${encodeURIComponent(token)}`),
  downloadPublicShare: (token: string) => api.get<Blob>(`/files/share/${encodeURIComponent(token)}/download`, { responseType: 'blob' }),
};

export type EnterpriseDocument = {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string;
  ownerCode: string;
  currentRevision: number;
  settings?: Record<string, unknown>;
  userRole: string;
  createdAt: string;
  updatedAt: string;
};

export const documentsApi = {
  getAll: () => api.get<{ data: EnterpriseDocument[] }>('/documents'),
  create: (data: { id?: string; title?: string; settings?: Record<string, unknown> }) => api.post<{ document: EnterpriseDocument }>('/documents', data),
};

export type TaskPriority = 'Khẩn cấp' | 'Cao' | 'Trung bình' | 'Thấp';
export type TaskStatus = 'Chưa bắt đầu' | 'Đang thực hiện' | 'Chờ nghiệm thu' | 'Hoàn thành' | 'Tạm dừng';

export type TaskChecklistItem = {
  key: string;
  title: string;
  completed: boolean;
  sortOrder?: number;
};

export type TaskComment = {
  key: string;
  content: string;
  author: string;
  createdAt: string;
};

export type TaskActivity = {
  key: string;
  content: string;
  actor: string;
  createdAt: string;
};

export type TaskReportAttachment = {
  id: string;
  key: string;
  name: string;
  size: number;
  type: string;
};

export type TaskReport = {
  key: string;
  content: string;
  author: string;
  progress: number;
  status: TaskStatus;
  attachments: TaskReportAttachment[];
  createdAt: string;
};

export type EnterpriseTask = {
  key: string;
  taskCode: string;
  taskTitle: string;
  description: string;
  projectName: string;
  assigneeId: string;
  assignee: string;
  createdBy: string;
  priority: TaskPriority;
  dueDate: string;
  progress: number;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  subtasks?: TaskChecklistItem[];
  comments?: TaskComment[];
  activities?: TaskActivity[];
  reports?: TaskReport[];
};

export type TaskAssignee = {
  id: string;
  name: string;
  employeeCode: string;
  department?: string;
  position?: string;
  role: 'ADMIN' | 'USER';
};

export type CreateTask = {
  taskCode?: string;
  taskTitle: string;
  description?: string;
  projectName?: string;
  assigneeId?: string;
  priority: TaskPriority;
  dueDate: string;
};

export type CreateTaskReport = {
  content?: string;
  progress: number;
  status: TaskStatus;
  attachments: TaskReportAttachment[];
};

export const tasksApi = {
  getAll: () => api.get<{ data: EnterpriseTask[] }>('/tasks'),
  getOne: (id: string) => api.get<{ task: EnterpriseTask }>(`/tasks/${id}`),
  getAssignees: () => api.get<{ data: TaskAssignee[] }>('/tasks/assignees'),
  create: (data: CreateTask) => api.post<{ task: EnterpriseTask }>('/tasks', data),
  update: (id: string, data: Partial<Pick<EnterpriseTask, 'taskTitle' | 'description' | 'projectName' | 'assigneeId' | 'priority' | 'dueDate' | 'progress' | 'status'>>) =>
    api.patch<{ task: EnterpriseTask }>(`/tasks/${id}`, data),
  addComment: (taskId: string, content: string) =>
    api.post<{ task: EnterpriseTask }>(`/tasks/${taskId}/comments`, { content }),
  addReport: (taskId: string, data: CreateTaskReport) =>
    api.post<{ task: EnterpriseTask }>(`/tasks/${taskId}/reports`, data),
  remove: (id: string) =>
    api.delete<{ deleted: boolean }>(`/tasks/${id}`),
};

export type EmployeeProposalStatus = 'Chờ duyệt' | 'Đã duyệt' | 'Từ chối';

export type EmployeeProposal = {
  key: string;
  code: string;
  title: string;
  type: string;
  amount: number;
  content: string;
  submitterId: string;
  employeeName: string;
  employeeCode: string;
  status: EmployeeProposalStatus;
  approver: string;
  reviewNote: string;
  reviewedAt: string;
  date: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateEmployeeProposal = Pick<EmployeeProposal, 'title' | 'type' | 'amount'> & {
  content: string;
};

export const employeeProposalsApi = {
  getAll: () => api.get<{ data: EmployeeProposal[] }>('/employee-proposals'),
  getOne: (id: string) => api.get<{ proposal: EmployeeProposal }>(`/employee-proposals/${id}`),
  create: (data: CreateEmployeeProposal) => api.post<{ proposal: EmployeeProposal }>('/employee-proposals', data),
  review: (id: string, status: Exclude<EmployeeProposalStatus, 'Chờ duyệt'>, reviewNote: string) =>
    api.patch<{ proposal: EmployeeProposal }>(`/employee-proposals/${id}/review`, { status, reviewNote }),
};

export type FinanceCashTransaction = {
  key: string;
  code: string;
  type: 'Thu' | 'Chi';
  source: 'bank' | 'petty';
  category: string;
  amount: number;
  date: string;
  recipientOrPayer: string;
  account: string;
  status: 'Đã hoàn thành' | 'Chờ duyệt' | 'Đã hủy';
  note: string;
  department?: string;
  employeeCode?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateFinanceCashTransaction = Omit<FinanceCashTransaction, 'key' | 'createdAt' | 'updatedAt'>;

export const financeCashApi = {
  getAll: (source?: FinanceCashTransaction['source']) => api.get<{ data: FinanceCashTransaction[] }>('/finance/cash-transactions', { params: source ? { source } : undefined }),
  create: (data: CreateFinanceCashTransaction) => api.post<{ transaction: FinanceCashTransaction }>('/finance/cash-transactions', data),
  cancel: (id: string) => api.patch<{ transaction: FinanceCashTransaction }>(`/finance/cash-transactions/${id}`, { status: 'Đã hủy' }),
};

export type FinanceDocument = {
  key: string;
  code: string;
  documentType: 'sale' | 'purchase' | 'invoice';
  subtype: string;
  partnerName: string;
  description: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  documentDate: string;
  dueDate: string;
  status: string;
  taxCode: string;
  vatRate: number;
  vatAmount: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateFinanceDocument = Omit<FinanceDocument, 'key' | 'remainingAmount' | 'createdAt' | 'updatedAt'>;

export type FinanceDebt = {
  key: string;
  partnerName: string;
  type: 'Phải thu' | 'Phải trả';
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: string;
  status: 'Đúng hạn' | 'Quá hạn';
};

export const financeDocumentsApi = {
  getAll: (params?: { documentType?: FinanceDocument['documentType']; subtype?: string }) => api.get<{ data: FinanceDocument[] }>('/finance/documents', { params }),
  create: (data: CreateFinanceDocument) => api.post<{ document: FinanceDocument }>('/finance/documents', data),
  getDebts: () => api.get<{ data: FinanceDebt[] }>('/finance/debts'),
};

export type FinanceBankAccount = {
  key: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  branch: string;
  balance: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateFinanceBankAccount = Omit<FinanceBankAccount, 'key' | 'createdAt' | 'updatedAt'>;

export const financeBankAccountsApi = {
  getAll: () => api.get<{ data: FinanceBankAccount[] }>('/finance/bank-accounts'),
  create: (data: CreateFinanceBankAccount) => api.post<{ account: FinanceBankAccount }>('/finance/bank-accounts', data),
};

export type CrmContactType = 'customer' | 'supplier' | 'partner';

export type CrmContact = {
  key: string;
  code: string;
  name: string;
  type: CrmContactType;
  taxCode: string;
  industry: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  bankAccount: string;
  creditLimit: number;
  totalValue: number;
  debtBalance: number;
  tier: string;
  accountManager: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateCrmContact = Omit<CrmContact, 'key' | 'createdAt' | 'updatedAt'>;

export const crmContactsApi = {
  getAll: (type?: CrmContactType) => api.get<{ data: CrmContact[] }>('/crm/contacts', { params: type ? { type } : undefined }),
  create: (data: CreateCrmContact) => api.post<{ contact: CrmContact }>('/crm/contacts', data),
};

export type ContractPayload = {
  key?: string;
  id?: string;
  code?: string;
  name: string;
  contractCategory?: string;
  contractTemplate: string;
  partyBType?: 'organization' | 'individual' | 'employee';
  partyBName?: string;
  partyBTaxCode?: string;
  partyBRepresentative?: string;
  partyBPosition?: string;
  partyBIdNumber?: string;
  partyBPhone?: string;
  partyBEmail?: string;
  partyBBank?: string;
  partyBAddress?: string;
  employeeCode?: string;
  employeeName?: string;
  employeeIdNumber?: string;
  employeePhone?: string;
  employeeEmail?: string;
  employeeBank?: string;
  type?: string;
  position?: string;
  department?: string;
  jobLevel?: string;
  workLocation?: string;
  startDate?: string;
  endDate?: string;
  probationMonths?: number;
  contractValue?: number;
  salary?: number;
  allowance?: number;
  stockSharesPercent?: string;
  paymentMethod?: string;
  paymentDay?: number;
  workingHours?: string;
  annualLeaveDays?: number;
  insuranceType?: string;
  ndaClause?: boolean;
  nonCompeteClause?: boolean;
  status?: 'Dự thảo' | 'Chờ ký' | 'Chờ duyệt' | 'Còn hiệu lực' | 'Đã hết hạn';
  employeeSignStatus?: 'Chưa ký' | 'Đã ký';
  employeeSignDate?: string;
  employeeSignMethod?: 'digital' | 'upload';
  employeeCertName?: string;
  employeeSignedFileName?: string;
  companySignStatus?: 'Chưa ký' | 'Đã ký';
  companySignDate?: string;
  companySignMethod?: 'digital' | 'upload';
  companyCertName?: string;
  companySignedFileName?: string;
  attachedFileNames?: string[];
  signerName?: string;
  signerPosition?: string;
  note?: string;
  customFieldValues?: Record<string, string | number>;
  fileNodeId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export const contractsApi = {
  getAll: () => api.get<{ data: ContractPayload[] }>('/contracts'),
  getOne: (id: string) => api.get<{ contract: ContractPayload }>(`/contracts/${id}`),
  create: (data: ContractPayload) => api.post<{ contract: ContractPayload }>('/contracts', data),
  update: (id: string, data: Partial<ContractPayload>) => api.put<{ contract: ContractPayload }>(`/contracts/${id}`, data),
  sign: (id: string, data: { signMethod?: 'digital' | 'upload'; certName?: string; signedFileName?: string; signedFileData?: string; signAs?: 'employee' | 'company' }) =>
    api.post<{ contract: ContractPayload }>(`/contracts/${id}/sign`, data),
  remove: (id: string) => api.delete<{ deleted: boolean }>(`/contracts/${id}`),
};

export interface ApiNotification {
  id: string;
  key: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  link?: string;
  read: boolean;
  unread: boolean;
  time: string;
  createdAt: string;
}

export const notificationsApi = {
  getAll: () => api.get<{ data: ApiNotification[] }>('/notifications'),
  create: (data: { title: string; message: string; type?: string; link?: string; userId?: string }) =>
    api.post<{ notification: ApiNotification }>('/notifications', data),
  markRead: (id: string) => api.patch<{ notification: ApiNotification }>(`/notifications/${id}/read`),
  markAllRead: () => api.post<{ data: ApiNotification[] }>('/notifications/mark-all-read'),
  remove: (id: string) => api.delete(`/notifications/${id}`),
  clearAll: () => api.delete('/notifications'),
};

export interface AuditLogEntry {
  key: string;
  id: string;
  timestamp: string;
  user: string;
  action: string;
  module: string;
  detail: string;
}

export const auditLogsApi = {
  getAll: (page = 1, limit = 50) =>
    api.get<{ data: AuditLogEntry[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>('/admin/audit-logs', { params: { page, limit } }),
  record: (data: { action: string; module?: string; detail?: string; details?: Record<string, unknown> }) =>
    api.post<{ recorded: boolean }>('/audit-events', data),
};

export const collectionsApi = {
  get: <T = any>(scope: string, params?: { page?: number; limit?: number; q?: string; sort?: string; order?: 'asc' | 'desc' }) =>
    api.get<{ data: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(`/collections/${encodeURIComponent(scope)}`, { params }),
  replace: <T = any>(scope: string, records: T[]) =>
    api.put<{ data: T[] }>(`/collections/${encodeURIComponent(scope)}`, { records }),
  save: <T = any>(scope: string, records: T[]) =>
    api.put<{ data: T[] }>(`/collections/${encodeURIComponent(scope)}`, { records }),
  create: <T = any>(scope: string, record: T, _recordKey?: string) =>
    api.post<{ record: T }>(`/collections/${encodeURIComponent(scope)}`, { record }),
  patch: <T = any>(scope: string, recordKey: string, patch: Partial<T>) =>
    api.patch<{ record: T }>(`/collections/${encodeURIComponent(scope)}/${encodeURIComponent(recordKey)}`, { patch }),
  update: <T = any>(scope: string, recordKey: string, patch: Partial<T>) =>
    api.patch<{ record: T }>(`/collections/${encodeURIComponent(scope)}/${encodeURIComponent(recordKey)}`, { patch }),
  remove: (scope: string, recordKey: string) =>
    api.delete<{ deleted: boolean }>(`/collections/${encodeURIComponent(scope)}/${encodeURIComponent(recordKey)}`),
};

export const ekycApi = {
  getLanInfo: () => api.get<{ lanIp: string; port: number }>('/ekyc/lan-info'),
  createSession: (token?: string, userId?: string) => api.post<{ token: string; status: string }>('/ekyc/session', { token, userId }),
  connectSession: (token: string) => api.post<{ success: boolean; status: string }>(`/ekyc/session/${encodeURIComponent(token)}/connect`, {}),
  verifySession: (token: string, data: any) => api.post(`/ekyc/session/${encodeURIComponent(token)}/verify`, { data }),
  checkSessionStatus: (token: string, userId?: string) =>
    api.get<{ status: string; verified: boolean; connected?: boolean; data: any; verifiedAt?: string }>(
      `/ekyc/session/${encodeURIComponent(token)}/status${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`
    ),
};
