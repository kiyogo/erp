import React, { useState, useEffect } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { KTable } from '../KTable';
import { KIYOVN_MENU_ITEMS } from '../../data/menuData';
import { findItemByPath } from '../../utils/routeHelper';
import { Modal, Form, Input, Select, Button, message } from '../../custom-ui';
import { dataService } from '../../services/dataService';
import { createSystemCode } from '../../utils/systemCode';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';

// Import specialized domain modules
import { OrgUnitsModule } from '../../modules/business/OrgUnitsModule';
import { OrgChartModule } from '../../modules/business/OrgChartModule';
import { BusinessTravelModule } from '../../modules/business/BusinessTravelModule';
import { EmployeesModule } from '../../modules/hr/EmployeesModule';
import { ContractsModule } from '../../modules/hr/ContractsModule';
import { ProposalsModule } from '../../modules/hr/ProposalsModule';
import { HROverviewModule } from '../../modules/hr/HROverviewModule';
import { OnboardingModule } from '../../modules/hr/OnboardingModule';
import { HeadcountModule } from '../../modules/hr/HeadcountModule';
import { UniformsModule } from '../../modules/hr/UniformsModule';
import { TrainingModule } from '../../modules/hr/TrainingModule';
import { PerformanceReviewModule } from '../../modules/hr/PerformanceReviewModule';
import { RecruitmentModule } from '../../modules/hr/RecruitmentModule';
import { CertificatesModule } from '../../modules/hr/CertificatesModule';
import { RewardsModule } from '../../modules/hr/RewardsModule';
import { EmployeeHistoryModule } from '../../modules/hr/EmployeeHistoryModule';
import { EmployeeFullEditModule } from '../../modules/hr/EmployeeFullEditModule';

// Attendance deep submodules
import { AttendanceOverviewModule } from '../../modules/attendance/AttendanceOverviewModule';
import { AttendanceAlertsModule } from '../../modules/attendance/AttendanceAlertsModule';
import { TimesheetModule } from '../../modules/attendance/TimesheetModule';
import { TimesheetSummaryModule } from '../../modules/attendance/TimesheetSummaryModule';
import { TimesheetRawDataModule } from '../../modules/attendance/TimesheetRawDataModule';
import { ShiftsModule } from '../../modules/attendance/ShiftsModule';
import { ShiftAssignmentModule } from '../../modules/attendance/ShiftAssignmentModule';
import { ShiftDetailModule } from '../../modules/attendance/ShiftDetailModule';
import { ShiftSummaryModule } from '../../modules/attendance/ShiftSummaryModule';
import { ShiftRegistrationModule } from '../../modules/attendance/ShiftRegistrationModule';
import { OvertimeModule } from '../../modules/attendance/OvertimeModule';
import { LeaveRequestsModule } from '../../modules/attendance/LeaveRequestsModule';
import { LeaveSummaryModule } from '../../modules/attendance/LeaveSummaryModule';
import { LeavePlansModule } from '../../modules/attendance/LeavePlansModule';

// Finance submodules
import { CashTransactionsModule } from '../../modules/finance/CashTransactionsModule';
import { BankAccountsModule } from '../../modules/finance/BankAccountsModule';
import { CashFlowModule } from '../../modules/finance/CashFlowModule';
import { CashCountModule } from '../../modules/finance/CashCountModule';
import { LoansModule } from '../../modules/finance/LoansModule';
import { CashForecastModule } from '../../modules/finance/CashForecastModule';
import { PayrollModule } from '../../modules/finance/PayrollModule';
import { PayrollTimesheetModule } from '../../modules/finance/PayrollTimesheetModule';
import { InvoicesModule } from '../../modules/finance/InvoicesModule';
import { FinanceOverviewModule } from '../../modules/finance/FinanceOverviewModule';
import { EInvoiceModule } from '../../modules/finance/EInvoiceModule';
import { DigitalSignatureModule } from '../../modules/finance/DigitalSignatureModule';
import { TaxModule } from '../../modules/finance/TaxModule';
import { BudgetModule } from '../../modules/finance/BudgetModule';
import { CostingModule } from '../../modules/finance/CostingModule';
import { FixedAssetsModule } from '../../modules/finance/FixedAssetsModule';
import { PrepaidExpensesModule } from '../../modules/finance/PrepaidExpensesModule';
import { EquityModule } from '../../modules/finance/EquityModule';
import { AdvancesModule } from '../../modules/finance/AdvancesModule';
import { GeneralLedgerModule } from '../../modules/finance/GeneralLedgerModule';
import { PurchasingModule } from '../../modules/finance/PurchasingModule';
import { SalesModule } from '../../modules/finance/SalesModule';
import { InventoryModule } from '../../modules/finance/InventoryModule';
import { PaymentsModule } from '../../modules/finance/PaymentsModule';
import { InternalTransferModule } from '../../modules/finance/InternalTransferModule';

// CRM submodules
import { CRMModule, CRMOverviewModule } from '../../modules/crm/CRMModule';
import { CustomersModule } from '../../modules/crm/CustomersModule';
import { SuppliersModule } from '../../modules/crm/SuppliersModule';
import { SupplierEvaluationModule } from '../../modules/crm/SupplierEvaluationModule';
import { CustomerFeedbackModule } from '../../modules/crm/CustomerFeedbackModule';
import { PartnersModule } from '../../modules/crm/PartnersModule';
import { PromotionsModule } from '../../modules/crm/PromotionsModule';
import { LoyaltyModule } from '../../modules/crm/LoyaltyModule';
import { AiMarketingModule } from '../../modules/crm/AiMarketingModule';
import { InsuranceModule } from '../../modules/insurance/InsuranceModule';

// Assets deep submodules
import { AssetOverviewModule } from '../../modules/assets/AssetOverviewModule';
import { AssetsModule } from '../../modules/assets/AssetsModule';
import { AssetAllocationModule } from '../../modules/assets/AssetAllocationModule';
import { AssetTransferModule } from '../../modules/assets/AssetTransferModule';
import { AssetRepairsModule } from '../../modules/assets/AssetRepairsModule';
import { AssetMaintenanceModule } from '../../modules/assets/AssetMaintenanceModule';
import { AssetDisposalModule } from '../../modules/assets/AssetDisposalModule';
import { AssetAuditModule } from '../../modules/assets/AssetAuditModule';
import { AssetDepreciationModule } from '../../modules/assets/AssetDepreciationModule';
import { AssetMaterialsModule } from '../../modules/assets/AssetMaterialsModule';
import { AssetTodoModule } from '../../modules/assets/AssetTodoModule';
import { AssetSystemModule } from '../../modules/assets/AssetSystemModule';
import { LicensesModule } from '../../modules/assets/LicensesModule';
import { ConsumablesModule } from '../../modules/assets/ConsumablesModule';

// Strategic Plans & Projects
import { PlanListModule } from '../../modules/plans/PlanListModule';
import { PlanProgressModule } from '../../modules/plans/PlanProgressModule';
import { PlanMilestonesModule } from '../../modules/plans/PlanMilestonesModule';
import { PlanReportsModule } from '../../modules/plans/PlanReportsModule';
import { PlansModule } from '../../modules/plans/PlansModule';
import { TasksModule } from '../../modules/plans/TasksModule';
import { StrategicRoadmapModule } from '../../modules/plans/StrategicRoadmapModule';

// Documents & Files
import { DocumentsModule as DocumentOverviewModule, DocumentsModule } from '../../modules/documents/DocumentsModule';
import { DocumentNotesModule } from '../../modules/documents/DocumentNotesModule';
import { DocumentArchivesModule } from '../../modules/documents/DocumentArchivesModule';
import { DocumentSettingsModule } from '../../modules/documents/DocumentSettingsModule';
import { ContractTemplatesModule } from '../../modules/documents/ContractTemplatesModule';
import { CloudDriveModule } from '../../modules/files/CloudDriveModule';

// Workflows & Approvals
import { WorkflowsModule, WorkflowsModule as WorkflowOverviewModule } from '../../modules/workflows/WorkflowsModule';
import { WorkflowRequestsModule } from '../../modules/workflows/WorkflowRequestsModule';
import { WorkflowHistoryModule } from '../../modules/workflows/WorkflowHistoryModule';
import { WorkflowSettingsModule } from '../../modules/workflows/WorkflowSettingsModule';

// Services & Operations
import { MeetingRoomsModule } from '../../modules/meetingRooms/MeetingRoomsModule';
import { EnterpriseServicesModule } from '../../modules/services/EnterpriseServicesModule';
import { SLAModule } from '../../modules/services/SLAModule';
import { InternalChatModule } from '../../modules/chat/InternalChatModule';
import { ChatAdminModule } from '../../modules/chat/ChatAdminModule';
import { TicketsModule } from '../../modules/tickets/TicketsModule';
import { IncidentsModule } from '../../modules/tickets/IncidentsModule';
import { ReportsModule } from '../../modules/reports/ReportsModule';
import { AccountSettingsModule } from '../../modules/settings/AccountSettingsModule';
import { SecuritySettingsModule } from '../../modules/settings/SecuritySettingsModule';
import { TwoStepVerificationModule } from '../../modules/settings/TwoStepVerificationModule';
import { AppearanceSettingsModule } from '../../modules/settings/AppearanceSettingsModule';
import { LogsSettingsModule } from '../../modules/settings/LogsSettingsModule';

// Employee Portal
import { EmployeeProfileModule } from '../../modules/employee/EmployeeProfileModule';
import { IdentityVerificationPage } from '../../modules/employee/IdentityVerificationPage';
import { EmployeeTimesheetModule } from '../../modules/employee/EmployeeTimesheetModule';
import { EmployeeLeavesModule } from '../../modules/employee/EmployeeLeavesModule';
import { EmployeeOvertimeModule } from '../../modules/employee/EmployeeOvertimeModule';
import { EmployeePayslipModule } from '../../modules/employee/EmployeePayslipModule';
import { EmployeeContractsModule } from '../../modules/employee/EmployeeContractsModule';
import { EmployeeProposalsModule } from '../../modules/employee/EmployeeProposalsModule';
import { EmployeeAssetsModule } from '../../modules/employee/EmployeeAssetsModule';
import { EmployeeNotificationsModule } from '../../modules/employee/EmployeeNotificationsModule';
import { EmployeePersonalDigitalSignatureModule } from '../../modules/employee/EmployeePersonalDigitalSignatureModule';
import { EmployeeFilesModule } from '../../modules/employee/EmployeeFilesModule';
import { SystemSettingsModule } from '../../modules/settings/SystemSettingsModule';
import Files from '../../pages/Files';

// Admin Center
import { AdminOverviewModule } from '../../modules/admin/AdminOverviewModule';
import { AdminUsersModule } from '../../modules/admin/AdminUsersModule';
import { AdminRolesModule } from '../../modules/admin/AdminRolesModule';
import { AdminPermissionsModule } from '../../modules/admin/AdminPermissionsModule';
import { AdminAuditLogsModule } from '../../modules/admin/AdminAuditLogsModule';
import { AdminTrashModule } from '../../modules/admin/AdminTrashModule';
import { AdminSessionsModule } from '../../modules/admin/AdminSessionsModule';
import { AdminUsageModule } from '../../modules/admin/AdminUsageModule';
import { AdminBackupModule } from '../../modules/admin/AdminBackupModule';
import { AdminDropMenuModule } from '../../modules/admin/AdminDropMenuModule';
import { AdminSystemModule } from '../../modules/admin/AdminSystemModule';
import { AdminSystemNotificationsModule } from '../../modules/admin/AdminSystemNotificationsModule';
import NotFoundPage from '../../pages/NotFoundPage';
import { EMPLOYEE_PORTAL_MENU_ITEMS, ADMIN_PORTAL_MENU_ITEMS } from '../../data/menuData';

import { useAuth } from '../../context/AuthContext';

export const isAdminUser = (user: { role?: string } | null | undefined): boolean => {
  if (!user || !user.role) return false;
  const r = String(user.role).trim().toUpperCase();
  return r === 'ADMIN' || r === 'SUPERADMIN' || r === 'SYSTEM_ADMIN' || r === 'HR_MANAGER' || r === 'MANAGER';
};

export const EmployeePortalEntry: React.FC = () => {
  const { user } = useAuth();
  if (isAdminUser(user)) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <Navigate to="/employee/home" replace />;
};

export const GenericModulePage: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname;
  const { user } = useAuth();
  const isAdmin = isAdminUser(user);

  if (!isAdmin && currentPath.startsWith('/admin')) {
    return <Navigate to="/employee/home" replace />;
  }
  if (isAdmin && (currentPath.startsWith('/employee') || currentPath === '/employee/home')) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  // Normalized path: strip leading /admin if present for module matching
  const p = currentPath.startsWith('/admin')
    ? currentPath.replace(/^\/admin/, '') || '/dashboard'
    : currentPath;

  if (currentPath === '/employee/Identity/verification' || currentPath.toLowerCase() === '/employee/identity/verification') {
    return <IdentityVerificationPage />;
  }
  if (currentPath === '/employee/home') return <EmployeeProfileModule />;
  if (currentPath === '/employee/profile') return <EmployeeFullEditModule />;
  if (currentPath === '/employee/tasks') return <TasksModule mode="employee" />;
  if (currentPath === '/employee/timesheet') return <EmployeeTimesheetModule />;
  if (currentPath === '/employee/leaves') return <EmployeeLeavesModule />;
  if (currentPath === '/employee/overtime') return <EmployeeOvertimeModule />;
  if (currentPath === '/employee/payslip') return <EmployeePayslipModule />;
  if (currentPath === '/employee/contracts') return <EmployeeContractsModule />;
  if (currentPath === '/employee/proposals') return <EmployeeProposalsModule />;
  if (currentPath === '/employee/finance/payments') return <PaymentsModule />;
  if (currentPath === '/employee/workflows/requests') return <WorkflowRequestsModule />;
  if (currentPath === '/employee/assets/tasks') return <AssetTodoModule mode="employee" />;
  if (currentPath === '/employee/assets') return <EmployeeAssetsModule />;
  if (currentPath === '/employee/files') return <Files />;
  if (currentPath === '/employee/notifications') return <EmployeeNotificationsModule />;

  // Employee Digital Signature
  if (currentPath.startsWith('/employee/digital-signature')) return <EmployeePersonalDigitalSignatureModule />;

  // Employee Settings
  if (currentPath.startsWith('/employee/settings/account') || currentPath === '/employee/settings') return <AccountSettingsModule />;
  if (currentPath.startsWith('/employee/settings/security/twosv') || currentPath === '/employee/settings/security/twosv') return <TwoStepVerificationModule />;
  if (currentPath.startsWith('/employee/settings/security')) return <SecuritySettingsModule />;
  if (currentPath.startsWith('/employee/settings/appearance')) return <AppearanceSettingsModule />;
  if (currentPath.startsWith('/employee/settings/system')) return <Navigate to="/employee/settings/appearance" replace />;
  if (currentPath.startsWith('/employee/settings/logs')) return <LogsSettingsModule />;
  if (currentPath.startsWith('/employee/settings')) return <AccountSettingsModule />;

  if (currentPath === '/employee') return <EmployeePortalEntry />;
  if (currentPath.startsWith('/employee')) return <Navigate to="/employee/home" replace />;

  // 2. Admin System / Submodules
  if (currentPath === '/admin/overview' || p === '/overview') return <AdminOverviewModule />;
  if (currentPath === '/admin/users' || p === '/users') return <AdminUsersModule />;
  if (currentPath === '/admin/roles' || p === '/roles') return <AdminRolesModule />;
  if (currentPath === '/admin/permissions' || p === '/permissions') return <AdminPermissionsModule />;
  if (currentPath === '/admin/audit-logs' || currentPath === '/admin/audit' || p === '/audit-logs' || p === '/audit') return <AdminAuditLogsModule />;
  if (currentPath === '/admin/trash' || p === '/trash') return <AdminTrashModule />;
  if (currentPath === '/admin/sessions' || p === '/sessions') return <AdminSessionsModule />;
  if (currentPath === '/admin/backup' || p === '/backup') return <AdminBackupModule />;
  if (currentPath === '/admin/system/job-positions' || p === '/system/job-positions') return <AdminDropMenuModule positionsOnly />;
  if (currentPath === '/admin/drop-menu' || p === '/drop-menu') return <AdminDropMenuModule />;
  if (currentPath === '/admin/system/usage' || p === '/system/usage') return <AdminUsageModule />;
  if (currentPath === '/admin/system/notifications' || p === '/system/notifications') return <AdminSystemNotificationsModule />;
  if (currentPath === '/admin/system' || p === '/system') return <AdminSystemModule />;

  // 3. Edit Employee Profile
  if (p.startsWith('/edit/') || currentPath.startsWith('/edit/')) {
    return <Navigate to={`/admin/hr/employees`} replace />;
  }
  if (p.startsWith('/edit') || currentPath.includes('/employees/edit') || currentPath.includes('/employee/edit')) {
    return <EmployeeFullEditModule />;
  }

  // 4. Business
  if (p === '/business/org-units') return <OrgUnitsModule />;
  if (p === '/business/org-chart') return <OrgChartModule />;
  if (p.startsWith('/business/travel')) return <BusinessTravelModule />;
  if (p === '/business') return <Navigate to="/admin/business/org-units" replace />;

  // 5. HR
  if (p === '/hr/overview') return <HROverviewModule />;
  if (p === '/hr/employees') return <EmployeesModule />;
  if (p === '/hr/onboarding') return <OnboardingModule />;
  if (p === '/hr/headcount') return <HeadcountModule />;
  if (p === '/hr/uniforms') return <UniformsModule />;
  if (p === '/hr/training') return <TrainingModule />;
  if (p === '/hr/performance' || p.startsWith('/hr/surveys')) return <PerformanceReviewModule />;
  if (p === '/hr/recruitment') return <RecruitmentModule />;
  if (p.startsWith('/hr/certificates')) return <CertificatesModule />;
  if (p.startsWith('/hr/rewards')) return <RewardsModule />;
  if (p === '/hr/contracts') return <ContractsModule scope="hr" />;
  if (p === '/hr/proposals') return <ProposalsModule />;
  if (p.startsWith('/hr/history')) {
    let defType: any = 'all';
    if (p.includes('position')) defType = 'Chức vụ';
    if (p.includes('transfer')) defType = 'Thuyên chuyển';
    if (p.includes('resignation')) defType = 'Nghỉ việc';
    if (p.includes('reward')) defType = 'Khen thưởng';
    if (p.includes('discipline')) defType = 'Kỷ luật sự cố';
    if (p.includes('bank')) defType = 'Ngân hàng';
    if (p.includes('identity')) defType = 'Xác thực danh tính';
    return <EmployeeHistoryModule defaultType={defType} />;
  }
  if (p === '/hr') return <Navigate to="/admin/hr/overview" replace />;

  // 6. Attendance
  if (p === '/attendance/overview' || p === '/attendance/monitoring') return <AttendanceOverviewModule />;
  if (p === '/attendance/alerts') return <AttendanceAlertsModule />;
    if (p === '/attendance/shifts/detail') return <ShiftDetailModule />;
  if (p === '/attendance/shifts/summary') return <ShiftSummaryModule />;
  if (p === '/attendance/shifts/registration') return <ShiftRegistrationModule />;
  if (p.startsWith('/attendance/shifts')) return <ShiftsModule />;
  if (p === '/attendance/timesheet/summary') return <TimesheetSummaryModule />;
  if (p === '/attendance/timesheet/data') return <TimesheetRawDataModule />;
  if (p.startsWith('/attendance/timesheet')) return <TimesheetModule />;
  if (p === '/attendance/requests/overtime' || p.startsWith('/attendance/overtime')) return <OvertimeModule />;
  if (p === '/attendance/requests/leaves') return <LeaveSummaryModule />;
  if (p === '/attendance/requests/plans') return <LeavePlansModule />;
  if (p.startsWith('/attendance/requests')) return <LeaveRequestsModule />;
  if (p === '/attendance') return <AttendanceOverviewModule />;

  // 7. Finance
  if (p === '/finance/overview' || p === '/finance/analysis') return <FinanceOverviewModule />;
  if (p === '/finance/cash/flow') return <CashFlowModule />;
  if (p === '/finance/cash/audit') return <CashCountModule />;
  if (p === '/finance/cash/petty') return <Navigate to="/admin/finance/cash/flow" replace />;
  if (p.startsWith('/finance/cash/loans')) return <LoansModule />;
  if (p === '/finance/cash/forecast') return <CashForecastModule />;
  if (p === '/finance/cash/transfer' || p === '/finance/cash/internal-transfer' || p.startsWith('/finance/internal-transfer')) return <InternalTransferModule />;
  if (p === '/finance/cash') return <Navigate to="/admin/finance/cash/flow" replace />;
  if (
    p.startsWith('/finance/cash/transactions') ||
    p === '/finance/cash/income' ||
    p === '/finance/cash/expense'
  ) {
    const type = p.endsWith('income') ? 'Thu' : p.endsWith('expense') ? 'Chi' : 'all';
    return <CashTransactionsModule typeFilterDefault={type} />;
  }
  if (p.startsWith('/finance/cash/bank')) return <BankAccountsModule />;
  if (p.startsWith('/finance/payments')) return <PaymentsModule />;
  if (p === '/finance/invoices') return <InvoicesModule />;
  if (p.startsWith('/finance/debts')) return <Navigate to="/admin/finance/overview" replace />;
  if (p === '/finance/payroll/tax') return <Navigate to="/admin/finance/payroll" replace />;
  if (p.startsWith('/finance/payroll/timesheet/')) return <PayrollTimesheetModule />;
  if (p.startsWith('/finance/payroll')) return <PayrollModule />;
  if (p.startsWith('/finance/e-invoice')) return <EInvoiceModule />;
  if (p.includes('digital-signature')) return <DigitalSignatureModule />;
  if (p.startsWith('/finance/tax')) return <TaxModule />;
  if (p.startsWith('/finance/budget')) return <BudgetModule />;
  if (p.startsWith('/finance/costing')) return <CostingModule />;
  if (p.startsWith('/finance/fixed-assets')) return <FixedAssetsModule />;
  if (p.startsWith('/finance/prepaid-expenses')) return <PrepaidExpensesModule />;
  if (p.startsWith('/finance/equity')) return <EquityModule />;
  if (p.startsWith('/finance/advances')) return <AdvancesModule />;
  if (p.startsWith('/finance/general')) return <GeneralLedgerModule />;
  if (p === '/finance/purchasing/reconciliation') return <Navigate to="/admin/finance/purchasing" replace />;
  if (p === '/finance/sales/debts') return <Navigate to="/admin/finance/sales" replace />;
  if (p.startsWith('/finance/purchasing')) return <PurchasingModule />;
  if (p.startsWith('/finance/sales')) return <SalesModule />;
  if (p.startsWith('/finance/inventory')) return <InventoryModule />;
  if (p === '/finance') return <Navigate to="/admin/finance/overview" replace />;

  // 8. CRM & Insurance
  if (p === '/crm/overview' || p === '/crm') return <CRMOverviewModule />;
  if (p === '/crm/customers') return <CustomersModule />;
  if (p === '/crm/suppliers') return <SuppliersModule />;
  if (p === '/crm/promotions') return <PromotionsModule />;
  if (p === '/crm/loyalty') return <LoyaltyModule />;
  if (p === '/crm/suppliers-eval') return <SupplierEvaluationModule />;
  if (p === '/crm/feedback' || p.startsWith('/crm/feedback')) return <CustomerFeedbackModule />;
  if (p === '/crm/partners' || p.startsWith('/crm/partners')) return <PartnersModule />;
  if (p === '/crm/marketing') return <AiMarketingModule />;
  if (p.startsWith('/crm')) return <CRMModule />;
  if (p === '/insurance' || p === '/insurance/') return <Navigate to="/admin/insurance/overview" replace />;
  if (/^\/insurance\/(overview|labor|adjustments|regimes|card|voluntary|contributions|expenses)$/.test(p)) return <InsuranceModule />;
  if (p.startsWith('/insurance/')) return <NotFoundPage />;

  // 9. Assets
  if (p === '/assets/overview') return <AssetOverviewModule />;
  if (p === '/assets/allocation') return <AssetAllocationModule />;
  if (p === '/assets/transfer') return <AssetTransferModule />;
  if (p === '/assets/repairs') return <AssetRepairsModule />;
  if (p === '/assets/maintenance') return <AssetMaintenanceModule />;
  if (p === '/assets/disposal') return <AssetDisposalModule />;
  if (p === '/assets/audit' || p === '/assets/count' || p === '/assets/inventory') return <AssetAuditModule />;
  if (p === '/assets/depreciation') return <AssetDepreciationModule />;
  if (p === '/assets/materials') return <AssetMaterialsModule />;
  if (p === '/assets/todo') return <AssetTodoModule />;
  if (p.startsWith('/assets/system')) return <AssetSystemModule />;
  if (p.startsWith('/assets/licenses')) return <LicensesModule />;
  if (p.startsWith('/assets/consumables')) return <ConsumablesModule />;
  if (p.startsWith('/assets')) return <AssetsModule />;

  // 10. Strategic Plans & OKRs & Tasks
  if (
    p === '/plans/tasks' ||
    p === '/tasks' ||
    currentPath === '/admin/tasks' ||
    currentPath === '/admin/plans/tasks' ||
    currentPath === '/tasks'
  ) return <TasksModule mode="admin" />;
  if (p === '/plans/list') return <PlanListModule />;
  if (p === '/plans/progress') return <PlanProgressModule />;
  if (p === '/plans/milestones') return <PlanMilestonesModule />;
  if (p === '/plans/reports') return <PlanReportsModule />;
  if (p === '/plans/projects' || p === '/plans/okr' || p === '/plans/roadmap') return <StrategicRoadmapModule />;
  if (p === '/plans' || currentPath === '/admin/plans') return <TasksModule mode="admin" />;
  if (p.startsWith('/plans')) return <PlanListModule />;

  // 11. Documents & Files
  if (p === '/documents/overview') return <DocumentOverviewModule />;
  if (p === '/documents/contracts' || p.startsWith('/documents/contracts')) return <ContractsModule scope="documents" />;
  if (p === '/documents/settings/contract-templates') return <ContractTemplatesModule />;
  if (p === '/documents/archives') return <DocumentArchivesModule />;
  if (p === '/documents/notes') return <DocumentNotesModule />;
  if (p.startsWith('/documents/settings')) return <DocumentSettingsModule />;
  if (p.startsWith('/documents')) return <DocumentsModule />;
  if (p === '/files' || p.startsWith('/files')) return <CloudDriveModule />;

  // 12. Workflows
  if (p === '/workflows/overview') return <WorkflowOverviewModule />;
  if (p === '/workflows/requests') return <WorkflowRequestsModule />;
  if (p === '/workflows/history') return <WorkflowHistoryModule />;
  if (p === '/workflows/settings') return <WorkflowSettingsModule />;
  if (p === '/workflows/list' || p.startsWith('/workflows')) return <WorkflowsModule />;

  // 13. Services & Chat & Reports
  if (p.startsWith('/meeting-rooms')) return <MeetingRoomsModule />;
  if (p === '/services/sla' || p.startsWith('/contracts/sla')) return <SLAModule />;
  if (p.startsWith('/services')) return <EnterpriseServicesModule />;
  if (p === '/chat/admin') return <ChatAdminModule />;
  if (p.startsWith('/chat')) return <InternalChatModule />;
  if (p === '/tickets/incidents') return <IncidentsModule />;
  if (p === '/tickets') return <TicketsModule />;
  if (p === '/notifications/system' || p === '/notifications/broadcast' || p === '/system/notifications') return <AdminSystemNotificationsModule />;
  if (p === '/notifications' || p === '/notifications/my' || p.startsWith('/notifications')) return <EmployeeNotificationsModule />;

  // 14. Settings
  if (p === '/settings/account') return <AccountSettingsModule />;
  if (p === '/settings/security/twosv' || p.startsWith('/settings/security/twosv')) return <TwoStepVerificationModule />;
  if (p === '/settings/security') return <SecuritySettingsModule />;
  if (p === '/settings/appearance') return <AppearanceSettingsModule />;
  if (p === '/settings/system') return <SystemSettingsModule />;
  if (p === '/settings/logs') return <LogsSettingsModule />;
  if (p === '/settings') return <Navigate to="/admin/settings/appearance" replace />;

  // 2. Fallback
  const currentItem = findItemByPath(KIYOVN_MENU_ITEMS, currentPath) || findItemByPath(EMPLOYEE_PORTAL_MENU_ITEMS, currentPath) || findItemByPath(ADMIN_PORTAL_MENU_ITEMS, currentPath);
  if (!currentItem) {
    return <NotFoundPage />;
  }
  const title = currentItem ? currentItem.title : 'Quản lý Dữ liệu';

  const [data, setData] = useState<any[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<{ label: string; value: string }[]>([]);
  const [searchText, setSearchText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const loadData = async () => {
    setRefreshing(true);
    try {
      const rows = await dataService.refreshGenericData(currentPath);
      setData(rows);
      try {
        const units = await dataService.fetchOrgUnitsList();
        setDepartmentOptions(units.map((unit) => ({ label: unit, value: unit })));
      } catch {
        // The records remain usable when the optional department lookup is unavailable.
      }
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể tải dữ liệu mới nhất.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = dataService.subscribe(() => {
      setData(dataService.getGenericData(currentPath));
    });
    return unsub;
  }, [currentPath]);

  const handleSave = async (values: any) => {
    if (saving) return;
    setSaving(true);
    const timestamp = new Date().toISOString();
    const commonFields = {
      ...values,
      category: values.category || '',
      status: values.status || 'Đang hoạt động',
      updatedAt: timestamp,
      updatedBy: user?.name || user?.email || '',
    };
    try {
      if (editingItem) {
        await dataService.updateGenericRecord(currentPath, {
          key: editingItem.key ?? editingItem.code,
          ...commonFields,
        });
        message.success(`Đã cập nhật mục: ${values.name}`);
      } else {
        const newItem = {
          ...commonFields,
          key: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          code: values.code || createSystemCode('code', title),
          name: values.name,
          createdAt: timestamp,
          createdBy: user?.name || user?.email || '',
        };
        await dataService.createGenericRecord(currentPath, newItem);
        message.success(`Đã thêm mới mục: ${values.name}`);
      }
      dataService.logAction(editingItem ? 'Cập nhật' : 'Thêm mới', title, `Cập nhật dữ liệu mục: ${values.name}`);
      setModalOpen(false);
      setEditingItem(null);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể lưu dữ liệu. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (record: any) => {
    Modal.confirm({
      title: 'Xác nhận xóa dữ liệu?',
      content: `Bạn có chắc chắn muốn xóa "${record.name}" (${record.code}) không?`,
      okText: 'Xóa mục',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await dataService.deleteGenericRecord(currentPath, String(record.key ?? record.code ?? ''));
          dataService.logAction('Xóa', title, `Xóa mục: ${record.name} (${record.code})`);
          message.success(`Đã xóa mục ${record.name}`);
        } catch (error: any) {
          message.error(error?.response?.data?.message || error?.message || 'Không thể xóa dữ liệu. Vui lòng thử lại.');
          throw error;
        }
      },
    });
  };

  const filteredData = data.filter(
    (item) =>
      item.name?.toLowerCase().includes(searchText.toLowerCase()) ||
      item.code?.toLowerCase().includes(searchText.toLowerCase()) ||
      item.category?.toLowerCase().includes(searchText.toLowerCase())
  );

  const columns: any = [
    {
      title: 'Mã',
      dataIndex: 'code',
      key: 'code',
      width: 110,
      render: (code: string) => <span style={{ fontWeight: 600, color: '#009688' }}>{code}</span>,
    },
    {
      title: 'Tên đối tượng',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <span style={{ fontWeight: 500, color: '#212121' }}>{name}</span>,
    },
    {
      title: 'Phân loại / Đơn vị',
      dataIndex: 'category',
      key: 'category',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: string) => {
        const isSuccess = status === 'Đang hoạt động' || status === 'Đã duyệt';
        return (
          <span
            style={{
              fontSize: 12,
              padding: '2px 8px',
              borderRadius: 4,
              background: isSuccess ? '#E8F5E9' : '#FFF8E1',
              color: isSuccess ? '#2E7D32' : '#F57F17',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {isSuccess ? <CheckCircleOutlined style={{ fontSize: 11 }} /> : <ClockCircleOutlined style={{ fontSize: 11 }} />}
            {status}
          </span>
        );
      },
    },
    {
      title: 'Người tạo',
      dataIndex: 'author',
      key: 'author',
      width: 140,
    },
    {
      title: 'Cập nhật cuối',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 150,
      render: (val: string) => <span style={{ color: '#757575', fontSize: 12.5 }}>{val}</span>,
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 140,
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            style={{ border: 'none', background: 'transparent', color: '#009688', cursor: 'pointer', fontSize: 13 }}
            onClick={() => {
              setEditingItem(record);
              form.setFieldsValue(record);
              setModalOpen(true);
            }}
          >
            <EditOutlined /> Sửa
          </button>
          <button
            style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer', fontSize: 13 }}
            onClick={() => handleDelete(record)}
          >
            <DeleteOutlined /> Xóa
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          placeholder={`Tìm kiếm trong ${title}...`}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 340, borderRadius: 6 }}
          allowClear
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<ReloadOutlined />} loading={refreshing} disabled={refreshing} onClick={loadData}>
            Làm mới
          </Button>
          <Button icon={<DownloadOutlined />} onClick={() => downloadFile(`${title.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.xlsx`, generateValidXlsxBlob([
            ['Mã', 'Tên đối tượng', 'Phân loại / Đơn vị', 'Trạng thái', 'Người tạo', 'Ngày tạo', 'Người cập nhật', 'Ngày cập nhật'],
            ...filteredData.map((item) => [item.code || '', item.name || '', item.category || '', item.status || '', item.createdBy || item.author || '', item.createdAt || '', item.updatedBy || '', item.updatedAt || '']),
          ]))}>
            Xuất Excel
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingItem(null);
              form.resetFields();
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm mới
          </Button>
        </div>
      </div>

      <div className="transparent-table-card" style={{ width: '100%' }}>
        <KTable
          dataSource={filteredData}
          columns={columns}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total, range) => (
              <span style={{ fontSize: 13, color: '#757575' }}>
                Hiển thị {range[0]}-{range[1]} trên tổng số {total} mục
              </span>
            ),
          }}
        />
      </div>

      <Modal
        title={editingItem ? `Chỉnh sửa: ${editingItem.name}` : `Thêm mới mục trong ${title}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 16 }}>
          <Form.Item name="code" label="Mã đối tượng" initialValue={createSystemCode('code', title)}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="Tên đối tượng" rules={[{ required: true, message: 'Nhập tên' }]}>
            <Input placeholder={`Nhập tên mục...`} />
          </Form.Item>
          <Form.Item name="category" label="Phân loại / Đơn vị" rules={[{ required: true, message: 'Vui lòng chọn phân loại / đơn vị' }]}>
            <Select
              placeholder="Chọn phân loại / đơn vị..."
              options={departmentOptions}
            />
          </Form.Item>
          <Form.Item name="status" label="Trạng thái" initialValue="Đang hoạt động">
            <Select
              options={[
                { label: 'Đang hoạt động', value: 'Đang hoạt động' },
                { label: 'Chờ duyệt', value: 'Chờ duyệt' },
                { label: 'Lưu trữ', value: 'Lưu trữ' },
              ]}
            />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} disabled={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {editingItem ? 'Lưu thay đổi' : 'Thêm mới'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
