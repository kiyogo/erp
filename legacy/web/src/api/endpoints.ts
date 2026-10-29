import api from './axios';

export const authApi = {
  login:          (email: string, password: string) => api.post('/auth/login', { email, password }),
  loginGoogle:    (data?: any)                      => api.post('/auth/google', data || {}),
  verifyMfaLogin: (challengeToken: string, code: string) => api.post('/auth/2fa/login', { challengeToken, code }),
  getTwoFactor: () => api.get<{ enabled: boolean; authenticatorConfigured: boolean; backupCodeCount: number }>('/auth/2fa'),
  getSecurityPin: () => api.get<{ configured: boolean; updatedAt: string }>('/auth/security-pin'),
  saveSecurityPin: (data: { pin: string; confirmPin: string; currentPin?: string; currentPassword?: string }) =>
    api.post<{ configured: boolean; updatedAt: string }>('/auth/security-pin', data),
  beginTwoFactorSetup: () => api.post<{ secret: string; otpauthUrl: string; expiresAt: string }>('/auth/2fa/enrollment'),
  verifyTwoFactorSetup: (code: string) => api.post<{ enabled: boolean; backupCodes: string[] }>('/auth/2fa/enrollment/verify', { code }),
  disableTwoFactor: (code: string) => api.post<{ enabled: boolean }>('/auth/2fa/disable', { code }),
  rotateRecoveryCodes: (code: string) => api.post<{ backupCodes: string[] }>('/auth/2fa/recovery-codes', { code }),
  getGoogleConfig: () => api.get<{ configured: boolean; clientId: string; allowedDomain: string }>('/auth/google/config'),
  logout: (token: string) => api.post<{ loggedOut: boolean }>('/auth/logout', {}, { headers: { Authorization: `Bearer ${token}` } }),
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
  getAll:  (params?: { page?: number; limit?: number }) => api.get('/users', { params }),
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

export interface SystemBroadcastRecord {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'urgent' | 'cybersecurity' | 'maintenance' | 'regulation' | 'policy' | 'account_activation';
  targetType: 'all' | 'employee' | 'unit';
  targetIds: string[];
  targetAudience: string;
  sender: string;
  createdAt: string;
  updatedAt: string;
  channels: string[];
  readCount: number;
  totalRecipients: number;
  inAppSentCount: number;
  emailSentCount: number;
  emailFailedCount: number;
  status: 'Đã gửi' | 'Gửi một phần' | 'Gửi thất bại' | 'Đang xử lý' | 'Nháp' | 'Chưa xác minh';
  source?: 'legacy_local' | 'legacy_collection';
}

export interface SystemBroadcastInput {
  title: string;
  content: string;
  type: SystemBroadcastRecord['type'];
  sender: string;
  targetType: SystemBroadcastRecord['targetType'];
  targetIds: string[];
  channels: string[];
}

export type MarketingProduct = 'email_marketing' | 'marketing_automation';
export type MarketingGoal =
  | 'attract_customers'
  | 'nurture_leads'
  | 'send_email_marketing'
  | 'collect_leads'
  | 'track_behavior'
  | 'automate_customer_care'
  | 'automate_marketing';
export type MarketingOnboarding = {
  key: 'primary-goals';
  primaryProduct: MarketingProduct;
  selectedGoals: MarketingGoal[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

export const systemApi = {
  getCompanyProfile: () => api.get<{ profile: CompanyProfile }>('/system/company-profile'),
  saveCompanyProfile: (profile: CompanyProfile) => api.put<{ profile: CompanyProfile }>('/system/company-profile', profile),
  getGoogleConfig: () => api.get<{ clientKey: string; clientSecret: string; redirectUri: string; allowedDomain: string; enforceGoogleLogin: string; configured: boolean }>('/auth/google/config'),
  saveGoogleConfig: (data: { clientKey: string; redirectUri: string; allowedDomain: string; enforceGoogleLogin: string }) => api.put<{ config: { clientKey: string; clientSecret: string; redirectUri: string; allowedDomain: string; enforceGoogleLogin: string; configured: boolean } }>('/system/google-config', data),
  getEmailConfig: () => api.get<{ config: EmailGatewayConfig }>('/system/email-config'),
  saveEmailConfig: (data: Partial<EmailGatewayConfig> & { password?: string }) => api.put<{ config: EmailGatewayConfig }>('/system/email-config', data),
  testEmailConfig: (recipient?: string) => api.post<{ sent: true }>('/system/email-config/test', { recipient }),
  sendEmail: (data: { to: string | string[]; subject: string; content?: string; text?: string; html?: string; category?: string }) => api.post<{ sent: true; count: number; total: number }>('/system/send-email', data),
  getActivationTemplate: () => api.get<{ template: ActivationEmailTemplate; emailConfigured: boolean }>('/system/notification-templates/account-activation'),
  saveActivationTemplate: (template: ActivationEmailTemplate) => api.put<{ template: ActivationEmailTemplate }>('/system/notification-templates/account-activation', template),
};

export const systemBroadcastsApi = {
  getAll: () => api.get<{ data: SystemBroadcastRecord[] }>('/admin/system/broadcasts'),
  create: (data: SystemBroadcastInput) => api.post<{ broadcast: SystemBroadcastRecord }>('/admin/system/broadcasts', data),
  update: (id: string, data: Pick<SystemBroadcastInput, 'title' | 'content' | 'type' | 'sender'>) =>
    api.patch<{ broadcast: SystemBroadcastRecord }>(`/admin/system/broadcasts/${encodeURIComponent(id)}`, data),
  resend: (id: string) => api.post<{ broadcast: SystemBroadcastRecord }>(`/admin/system/broadcasts/${encodeURIComponent(id)}/resend`),
  delete: (id: string) => api.delete<{ deleted: boolean }>(`/admin/system/broadcasts/${encodeURIComponent(id)}`),
};

export const marketingApi = {
  getOnboarding: () => api.get<{ onboarding: MarketingOnboarding | null }>('/marketing/onboarding'),
  saveOnboarding: (data: { primaryProduct: MarketingProduct; selectedGoals: MarketingGoal[] }) =>
    api.put<{ onboarding: MarketingOnboarding }>('/marketing/onboarding', data),
};

export type CompanyProfile = {
  companyName: string; fullName: string; shortName: string; companyCode: string; taxCode: string; businessType: string;
  establishedDate: string; registrationDate: string; registrationNo: string; registrationIssuer: string;
  representative: string; representativeTitle: string; address: string; phone: string; fax: string; email: string; website: string;
  domain: string; timezone: 'Asia/Ho_Chi_Minh' | 'UTC'; currency: 'VND' | 'USD'; bankAccountId: string;
  legalForm: '' | 'private_enterprise' | 'llc_single' | 'llc_multiple' | 'joint_stock' | 'partnership' | 'household_business' | 'cooperative' | 'branch' | 'state_owned_enterprise' | 'public_company' | 'foreign_invested' | 'nonprofit_organization' | 'public_unit' | 'foreign_representative_office' | 'other';
  legalFormOther: string; companySize: '' | 'micro' | 'small' | 'medium' | 'large' | 'not_applicable'; industry: string;
  accountingRegime: '' | 'TT99' | 'TT133' | 'TT132' | 'TT58' | 'TT24' | 'TT71' | 'TT152' | 'other'; accountingRegimeOther: string; cooperativeUsesTT133: boolean;
  fiscalYearStartMonth: number | null; fiscalYearStartDay: number | null;
  vatMethod: '' | 'deduction' | 'direct_revenue' | 'direct_added_value' | 'other'; vatMethodOther: string;
  accountingProfileComplete?: boolean; accountingProfileMissing?: string[];
  updatedAt?: string; updatedBy?: string; revision?: number;
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
  id?: string;
  key: string;
  taskCode: string;
  taskTitle: string;
  description: string;
  projectName: string;
  assigneeId: string;
  assignee: string;
  createdById?: string;
  createdBy: string;
  priority: TaskPriority;
  dueDate: string;
  progress: number;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  dueDatePostponementCount?: number;
  dueDateHistory?: TaskDueDateChange[];
  collaborators?: TaskCollaborator[];
  subtasks?: TaskChecklistItem[];
  comments?: TaskComment[];
  activities?: TaskActivity[];
  reports?: TaskReport[];
};

export type TaskDueDateChange = {
  key: string;
  previousDueDate: string;
  newDueDate: string;
  changedAt: string;
  actor: string;
  isPostponement: boolean;
};

export type TaskCollaborator = {
  id: string;
  name: string;
  employeeCode: string;
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
  collaboratorIds?: string[];
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
  voucherDate?: string;
  currency?: 'VND';
  reference?: string;
  staffEmployeeCode?: string;
  payerName?: string;
  counterpartyAddress?: string;
  attachmentCount?: number;
  sourceDocument?: string;
  recipientOrPayer: string;
  account: string;
  status: 'Đã hoàn thành' | 'Chờ duyệt' | 'Đã hủy';
  note: string;
  department?: string;
  employeeCode?: string;
  sourceAccountId?: string;
  counterpartyType?: 'customer' | 'supplier' | 'partner' | 'employee' | 'other';
  counterpartyContactId?: string;
  journalLines?: FinanceCashJournalLine[];
  attachments?: FinanceCashAttachment[];
  createdAt: string;
  updatedAt: string;
};

export type FinanceCashJournalLine = { description: string; debitAccount: string; creditAccount: string; amount: number; business?: string };
export type FinanceCashAttachment = { id: string; name: string; size: number; mimeType?: string };

export type CreateFinanceCashTransaction = Omit<FinanceCashTransaction, 'key' | 'code' | 'createdAt' | 'updatedAt'> & { code?: string };
export type UpdateFinanceCashTransaction = Partial<Omit<CreateFinanceCashTransaction, 'code'>>;

export type FinancePaymentRecord = {
  key: string;
  code: string;
  beneficiary: string;
  taxCode?: string;
  bankAccountInfo: string;
  category: string;
  amount: number;
  paymentMethod: 'Chuyển khoản VCB' | 'Chuyển khoản TCB' | 'Tiền mặt' | 'Thẻ tín dụng DN';
  creator: string;
  creatorId: string;
  empCode: string;
  approver?: string;
  approverId?: string;
  createdDate: string;
  createdAt: string;
  status: 'Chờ duyệt' | 'Đã phê duyệt' | 'Đã thanh toán' | 'Từ chối';
  notes?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  paidBy?: string;
  paidAt?: string;
  settlementReference?: string;
  sourceAccountId?: string;
  sourceAccount?: string;
  sourceType?: 'bank' | 'petty';
  financeTransactionId?: string;
  ledgerRecorded?: boolean;
  settlementRecordedInternally?: boolean;
  history?: Array<{ action: string; status: string; actor: string; actorId: string; at: string; reason?: string; reference?: string; sourceAccount?: string; financeTransactionId?: string }>;
};

export type CreateFinancePayment = Pick<FinancePaymentRecord, 'beneficiary' | 'bankAccountInfo' | 'category' | 'amount' | 'paymentMethod'> & Pick<FinancePaymentRecord, 'taxCode' | 'notes'>;

export type FinancePaymentAccount = { key: string; name: string; source: 'bank' | 'petty'; balance: number; status: string };

export const financeCashApi = {
  getAll: (source?: FinanceCashTransaction['source']) => api.get<{ data: FinanceCashTransaction[] }>('/finance/cash-transactions', { params: source ? { source } : undefined }),
  getCategories: (type: FinanceCashTransaction['type']) => api.get<{ data: string[] }>('/finance/cash-categories', { params: { type } }),
  addCategory: (type: FinanceCashTransaction['type'], name: string) => api.post<{ category: { key: string; type: FinanceCashTransaction['type']; name: string; createdAt: string } }>('/finance/cash-categories', { type, name }),
  create: (data: CreateFinanceCashTransaction) => api.post<{ transaction: FinanceCashTransaction }>('/finance/cash-transactions', data),
  update: (id: string, data: UpdateFinanceCashTransaction) => api.patch<{ transaction: FinanceCashTransaction }>(`/finance/cash-transactions/${encodeURIComponent(id)}`, data),
  cancel: (id: string) => api.patch<{ transaction: FinanceCashTransaction }>(`/finance/cash-transactions/${id}`, { status: 'Đã hủy' }),
};

export const financePaymentsApi = {
  getAll: () => api.get<{ data: FinancePaymentRecord[] }>('/finance/payments'),
  getAccounts: () => api.get<{ accounts: FinancePaymentAccount[] }>('/finance/payment-accounts'),
  create: (data: CreateFinancePayment) => api.post<{ payment: FinancePaymentRecord }>('/finance/payments', data),
  approve: (key: string) => api.post<{ payment: FinancePaymentRecord }>(`/finance/payments/${encodeURIComponent(key)}/approve`, {}),
  reject: (key: string, reason: string) => api.post<{ payment: FinancePaymentRecord }>(`/finance/payments/${encodeURIComponent(key)}/reject`, { reason }),
  recordPayment: (key: string, sourceAccountId: string, settlementReference: string) => api.post<{ payment: FinancePaymentRecord }>(`/finance/payments/${encodeURIComponent(key)}/execute`, { sourceAccountId, settlementReference }),
};

export type SalePromotionApplication = {
  key: string;
  code: string;
  name: string;
  discountKind: 'Phần trăm' | 'Số tiền';
  discountValue: number;
  basis: number;
  discount: number;
};
export type SalePromotionPreview = {
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  applications: SalePromotionApplication[];
  fingerprint: string;
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
  customerId?: string;
  customerCode?: string;
  grossAmount?: number;
  discountAmount?: number;
  appliedPromotions?: SalePromotionApplication[];
};

export type CreateFinanceDocument = Omit<FinanceDocument, 'key' | 'remainingAmount' | 'createdAt' | 'updatedAt' | 'customerCode' | 'grossAmount' | 'discountAmount' | 'appliedPromotions'> & {
  promotionKeys?: string[];
  promotionFingerprint?: string;
  requestId?: string;
};

export const financeDocumentsApi = {
  getAll: (params?: { documentType?: FinanceDocument['documentType']; subtype?: string }) => api.get<{ data: FinanceDocument[] }>('/finance/documents', { params }),
  create: (data: CreateFinanceDocument) => api.post<{ document: FinanceDocument; replayed?: boolean }>('/finance/documents', data),
  previewSalePromotions: (data: { customerId: string; promotionKeys: string[]; subtype: string; status: string; amount: number; documentDate: string; vatRate: number; vatAmount: number }) =>
    api.post<SalePromotionPreview>('/finance/sales/promotion-preview', data),
  linkSaleCustomer: (key: string, customerId: string) => api.post<{ replayed: boolean }>(`/finance/sales/${encodeURIComponent(key)}/customer`, { customerId }),
};

export type FinanceBankAccount = {
  key: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  branch: string;
  balance: number;
  currentBalance?: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateFinanceBankAccount = Omit<FinanceBankAccount, 'key' | 'createdAt' | 'updatedAt' | 'currentBalance'>;

export const financeBankAccountsApi = {
  getAll: () => api.get<{ data: FinanceBankAccount[] }>('/finance/bank-accounts'),
  create: (data: CreateFinanceBankAccount) => api.post<{ account: FinanceBankAccount }>('/finance/bank-accounts', data),
};

export type FinanceTransferAccount = {
  key: string;
  name: string;
  source: 'bank' | 'petty';
  balance: number;
  status: string;
};

export type FinanceInternalTransfer = {
  key: string;
  transferCode: string;
  sourceAccount: string;
  destinationAccount: string;
  sourceAccountId?: string;
  destinationAccountId?: string;
  sourceType?: 'bank' | 'petty';
  destinationType?: 'bank' | 'petty';
  amount: number;
  fee: number;
  transferDate: string;
  time: string;
  executor: string;
  approver: string;
  purpose: string;
  transferMethod: string;
  status: 'Thành công' | 'Đang chuyển' | 'Đã hủy';
  ledgerRecorded?: boolean;
  executionStatus?: 'ledger_only';
  transactionIds?: string[];
  canceledBy?: string;
  canceledAt?: string;
  cancelReason?: string;
};

export type CreateFinanceInternalTransfer = {
  requestId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  fee?: number;
  transferDate: string;
  purpose: string;
  transferMethod?: string;
};

export const financeTransfersApi = {
  getAll: () => api.get<{ data: FinanceInternalTransfer[]; accounts: FinanceTransferAccount[] }>('/finance/internal-transfers'),
  create: (data: CreateFinanceInternalTransfer) => api.post<{ transfer: FinanceInternalTransfer; replayed: boolean }>('/finance/internal-transfers', data),
  cancel: (key: string, reason: string) => api.post<{ transfer: FinanceInternalTransfer }>(`/finance/internal-transfers/${encodeURIComponent(key)}/cancel`, { reason }),
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
  details?: {
    entityKind?: 'organization' | 'person'; salutation?: string; personalName?: string; socialInsuranceCode?: string;
    citizenId?: string; idIssueDate?: string; idIssuePlace?: string; passportNo?: string; website?: string;
    customerGroup?: string; paymentTerm?: string; creditDays?: number; maxDebt?: number; receivableAccount?: string;
    invoiceRecipientName?: string; invoiceRecipientEmails?: string; invoiceRecipientPhone?: string;
    isSupplier?: boolean; isMember?: boolean; isInternal?: boolean; memberType?: string; memberGroup?: string; note?: string;
    bankAccounts?: Array<{ accountNumber: string; bankName: string; branch: string; province: string }>;
    addresses?: string[]; customFields?: Array<{ name: string; value: string }>;
  };
  creditLimit: number;
  totalValue: number;
  debtBalance: number;
  tier: string;
  accountManager: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateCrmContact = Pick<CrmContact, 'name' | 'type'> & Partial<Omit<CrmContact, 'key' | 'createdAt' | 'updatedAt' | 'name' | 'type'>>;
export type UpdateCrmContact = Partial<Omit<CreateCrmContact, 'type'>>;

export const crmContactsApi = {
  getAll: (type?: CrmContactType) => api.get<{ data: CrmContact[] }>('/crm/contacts', { params: type ? { type } : undefined }),
  create: (data: CreateCrmContact) => api.post<{ contact: CrmContact }>('/crm/contacts', data),
  update: (key: string, patch: UpdateCrmContact) => api.patch<{ contact: CrmContact }>(`/crm/contacts/${encodeURIComponent(key)}`, { patch }),
};

export type FinancePurchaseRequestItem = {
  lineNumber: number;
  itemName: string;
  unit: string;
  quantity: number;
  estimatedUnitPrice: number;
  lineTotal: number;
};

export type FinancePurchaseRequest = {
  key: string;
  requestNumber: string;
  departmentKey: string;
  departmentName: string;
  requester: string;
  requesterId: string;
  deliveryDeadline: string;
  purpose: string;
  notes: string;
  items: FinancePurchaseRequestItem[];
  estimatedTotal: number;
  status: 'Chờ xác định nhà cung cấp' | 'Đã xác định nhà cung cấp';
  requestDate: string;
  requestedAt: string;
  supplierKey: string;
  supplierCode: string;
  supplierName: string;
  supplierSelectedAt?: string;
  supplierSelectedBy?: string;
  supplierSelectedById?: string;
  createdBy: string;
  createdById: string;
  history: Array<{ action: string; actor: string; actorId: string; at: string; detail?: string }>;
};

export type CreateFinancePurchaseRequest = Pick<FinancePurchaseRequest,
  'departmentKey' | 'deliveryDeadline' | 'purpose' | 'notes'
> & {
  items: Array<Pick<FinancePurchaseRequestItem, 'itemName' | 'unit' | 'quantity' | 'estimatedUnitPrice'>>;
};

export const financePurchaseRequestsApi = {
  getAll: () => api.get<{ data: FinancePurchaseRequest[] }>('/collections/finance_purchase_requests', { params: { limit: 500, sort: 'updatedAt', order: 'desc' } }),
  create: (record: CreateFinancePurchaseRequest) => api.post<{ record: FinancePurchaseRequest }>('/collections/finance_purchase_requests', { record }),
  determineSupplier: (key: string, supplierKey: string) => api.patch<{ record: FinancePurchaseRequest }>(
    `/collections/finance_purchase_requests/${encodeURIComponent(key)}`,
    { patch: { supplierKey } },
  ),
};

export type CrmPromotion = {
  key: string;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  promotionType: 'Chiết khấu' | 'Tặng quà' | 'Tích điểm';
  target: string;
  enabled: boolean;
  allowConcurrent: boolean;
  eligibleItemCodes: string[];
  amountBasis: 'Thành tiền trước thuế' | 'Thành tiền sau thuế';
  orgUnitKeys: string[];
  employeeIds: string[];
  applyOnce: boolean;
  owner: string;
  ownerId: string;
  combinablePromotionKeys: string[];
  taxCondition: 'Bất kỳ' | 'Có thuế' | 'Không thuế';
  minimumSubtotal: number;
  unitPrice: number;
  unit: string;
  customerKeys: string[];
  discountKind: 'Phần trăm' | 'Số tiền';
  discountValue: number;
  status: 'Nháp' | 'Đang hoạt động' | 'Tạm dừng' | 'Đã kết thúc';
  createdAt: string;
  updatedAt: string;
};

export const crmPromotionsApi = {
  getAll: () => api.get<{ data: CrmPromotion[] }>('/collections/crm_promotions', { params: { limit: 500, sort: 'updatedAt', order: 'desc' } }),
  create: (record: Partial<CrmPromotion>) => api.post<{ record: CrmPromotion }>('/collections/crm_promotions', { record }),
  update: (key: string, patch: Partial<CrmPromotion>) => api.patch<{ record: CrmPromotion }>(`/collections/crm_promotions/${encodeURIComponent(key)}`, { patch }),
};

export type CrmLoyaltyCustomer = { key: string; code: string; name: string; status: string; balance: number };
export type CrmLoyaltyEntry = {
  key: string;
  type: 'earn' | 'redeem' | 'reversal' | 'refund';
  customerId: string;
  customerCode: string;
  customerName: string;
  points: number;
  delta: number;
  balanceAfter: number;
  reference: string;
  rewardName: string;
  note: string;
  status: 'Đã ghi nhận' | 'Chờ trao' | 'Đã trao' | 'Đã hủy';
  createdAt: string;
  createdBy: string;
  createdById: string;
  sourceKey?: string;
  fulfillmentReference?: string;
  cancelReason?: string;
  handledAt?: string;
  handledBy?: string;
  saleId?: string;
  saleCode?: string;
  saleAmount?: number;
  saleDate?: string;
};
export type CrmLoyaltySale = { key: string; code: string; customerId: string; amount: number; documentDate: string };
export type CreateCrmLoyaltyEntry = {
  requestId: string;
  type: 'earn' | 'redeem';
  customerId: string;
  points: number;
  reference: string;
  rewardName?: string;
  note?: string;
  saleId?: string;
};
export const crmLoyaltyApi = {
  getAll: () => api.get<{ customers: CrmLoyaltyCustomer[]; entries: CrmLoyaltyEntry[]; sales: CrmLoyaltySale[] }>('/crm/loyalty'),
  create: (entry: CreateCrmLoyaltyEntry) => api.post<{ entry: CrmLoyaltyEntry; balance: number; replayed: boolean }>('/crm/loyalty/entries', entry),
  fulfill: (key: string, reference: string) => api.post<{ entry: CrmLoyaltyEntry; balance: number }>(`/crm/loyalty/entries/${encodeURIComponent(key)}/fulfill`, { reference }),
  cancel: (key: string, reason: string) => api.post<{ entry: CrmLoyaltyEntry; balance: number }>(`/crm/loyalty/entries/${encodeURIComponent(key)}/cancel`, { reason }),
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
  eventId?: string;
  timestamp: string;
  user: string;
  role?: string;
  action: string;
  module: string;
  detail: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}

export type AuditLogCategory = 'all' | 'sensitive' | 'approve' | 'create' | 'auth';

export const auditLogsApi = {
  getAll: (page = 1, limit = 50, query = '', category: AuditLogCategory = 'all') =>
    api.get<{ data: AuditLogEntry[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>('/admin/audit-logs', { params: { page, limit, q: query, category } }),
  record: (data: { action: string; module?: string; detail?: string; details?: Record<string, unknown> }) =>
    api.post<{ recorded: boolean }>('/audit-events', data),
};

export type AdminTrashItem = {
  id: string;
  key: string;
  scope: string;
  recordKey: string;
  label: string;
  deletedAt: string;
  deletedBy: string;
  createdAt: string;
  updatedAt: string;
};

export const adminTrashApi = {
  getAll: (page = 1, limit = 50, query = '', scope = '') =>
    api.get<{ data: AdminTrashItem[]; scopes: string[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>('/admin/trash', { params: { page, limit, q: query, scope } }),
  restore: (id: string) => api.post<{ restored: true; record: Record<string, unknown> }>(`/admin/trash/${encodeURIComponent(id)}/restore`, {}),
  permanentlyDelete: (id: string) => api.delete<{ deleted: true }>(`/admin/trash/${encodeURIComponent(id)}`),
};

export type ApplicationUsageCategory = 'finance' | 'business' | 'hr' | 'digital_office';
export type ApplicationUsagePeriod = 'this_week' | 'this_month' | 'this_quarter' | 'all_time';
export type AdminApplicationUsage = {
  userId: string;
  name: string;
  email: string;
  employeeCode: string;
  department: string;
  loginCount: number;
  operationCount: number;
  lastUsedAt: string;
};
export type AdminApplicationUsageReport = {
  application: ApplicationUsageCategory | 'all';
  period: ApplicationUsagePeriod;
  fromDate: string;
  toDate: string;
  summary: { loggedInPeople: number; operatedPeople: number; loginCount: number; operationCount: number };
  data: AdminApplicationUsage[];
};

export const adminUsageApi = {
  getReport: (application: ApplicationUsageCategory | 'all', period: ApplicationUsagePeriod) =>
    api.get<AdminApplicationUsageReport>('/admin/usage', { params: { application, period } }),
  recordVisit: (application: ApplicationUsageCategory) =>
    api.post<{ recorded: boolean }>('/admin/usage/activity', { application }),
};

export type AdminSessionRecord = {
  key: string;
  userId: string;
  user: string;
  empCode: string;
  role: string;
  ip: string;
  ipType: string;
  device: string;
  browser: string;
  userAgent: string;
  location: string;
  loginTime: string;
  lastActive: string;
  expiresAt: string;
  mfaVerified: boolean;
  method: string;
  tlsProtocol: string;
  cipher: string;
  status: 'Đang hoạt động' | 'Treo / Chờ thao tác' | 'Đã thu hồi' | 'Đã hết hạn';
  revokedAt: string;
  revokedBy: string;
  revokeReason: string;
  current: boolean;
};

export const adminSessionsApi = {
  getAll: () => api.get<{ data: AdminSessionRecord[] }>('/admin/sessions'),
  revoke: (key: string, reason?: string) => api.post<{ session: AdminSessionRecord }>(`/admin/sessions/${encodeURIComponent(key)}/revoke`, { reason }),
};

export const attendanceApi = {
  checkIn: (type: 'in' | 'out') => api.post<{ record: Record<string, unknown> }>('/attendance/check-in', { type }),
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

export const generalLedgerApi = {
  createEntry: (record: { key?: string; voucherCode: string; entryDate: string; description: string; debitAccount: string; creditAccount: string; amount: number }) =>
    api.post<{ record: Record<string, any> }>('/finance/general-ledger/entries', record),
  closeQuarter: (period: string) =>
    api.post<{ period: string; startDate: string; endDate: string; entries: number; records: Record<string, any>[] }>('/finance/general-ledger/close', { period }),
};

export const documentNotesApi = {
  remind: (recordKey: string) => api.post<{ record: Record<string, any>; recipientCount: number }>(`/document-notes/${encodeURIComponent(recordKey)}/remind`),
};

export const inventoryApi = {
  createTransaction: (data: Record<string, unknown>) =>
    api.post<{ transaction: Record<string, any>; replayed: boolean }>('/finance/inventory/transactions', data),
  updateShipmentStatus: (transactionCode: string, status: string, reason?: string) =>
    api.post<{ transaction: Record<string, any> }>(`/finance/inventory/transactions/${encodeURIComponent(transactionCode)}/shipment-status`, { status, reason }),
  receiveShipmentReturn: (transactionCode: string, data: { returnCode: string; receivedDate: string; notes?: string; lines: Array<{ lineIndex: number; quantity: number }> }) =>
    api.post<{ receipt: Record<string, any>; transaction: Record<string, any>; replayed: boolean }>(`/finance/inventory/transactions/${encodeURIComponent(transactionCode)}/returns`, data),
};

export const assetsApi = {
  runDepreciation: (period: string, entries: Array<{ depreciationKey: string; amount: number; productionUnits?: number }>) =>
    api.post<{ period: string; count: number; totalAmount: number; records: Record<string, unknown>[] }>('/assets/depreciation-runs', { period, entries }),
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

export const softwareLicensesApi = {
  getAll: () => api.get<{ data: any[] }>('/assets/licenses'),
  create: (data: Record<string, unknown>) => api.post<{ record: any }>('/assets/licenses', data),
  allocate: (key: string, data: { name: string; email: string; deviceCode: string }) => api.post<{ record: any }>(`/assets/licenses/${encodeURIComponent(key)}/allocate`, data),
  renew: (key: string, data: { expireDate: string; annualCost: number }) => api.post<{ record: any }>(`/assets/licenses/${encodeURIComponent(key)}/renew`, data),
};

export const payrollLedgerApi = {
  postedPeriods: () => api.get<{ periods: string[] }>('/finance/payroll/posted-periods'),
  preview: (data: { period: string; employerInsurance: number }) => api.post<{ period: string; employeeCount: number; fingerprint: string; lines: Array<{ description: string; debitAccount: string; creditAccount: string; amount: number }> }>('/finance/payroll/ledger-preview', data),
  post: (data: { period: string; employerInsurance: number; fingerprint: string }) => api.post<{ lines: Array<{ amount: number }> }>('/finance/payroll/ledger-post', data),
  previewAdjustment: (data: { period: string; employerInsurance: number }) => api.post<{ period: string; sequence: number; employeeCount: number; fingerprint: string; lines: Array<{ description: string; debitAccount: string; creditAccount: string; amount: number }> }>('/finance/payroll/adjustment-preview', data),
  postAdjustment: (data: { period: string; employerInsurance: number; fingerprint: string }) => api.post<{ lines: Array<{ amount: number }> }>('/finance/payroll/adjustment-post', data),
};

export const assetTransfersApi = {
  create: (data: Record<string, unknown>) => api.post<{ transfer: any }>('/assets/transfers', data),
  transition: (key: string, action: 'approve' | 'reject' | 'receive', data: Record<string, unknown> = {}) => api.post<{ transfer: any }>(`/assets/transfers/${encodeURIComponent(key)}/${action}`, data),
};

export const assetAllocationsApi = {
  create: (data: Record<string, unknown>) => api.post<{ record: any }>('/assets/allocations', data),
  confirm: (key: string, receiverName: string) => api.post<{ record: any }>(`/assets/allocations/${encodeURIComponent(key)}/confirm`, { receiverName }),
};

export const assetRepairsApi = {
  create: (data: Record<string, unknown>) => api.post<{ record: any }>('/assets/repairs', data),
  transition: (key: string, action: 'approve' | 'transition' | 'complete', data: Record<string, unknown> = {}) =>
    api.post<{ record: any }>(`/assets/repairs/${encodeURIComponent(key)}/${action}`, data),
};
