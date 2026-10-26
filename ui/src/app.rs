use crate::api::{ApiClient, ApiTask, AuthSessionCheck};
use crate::models::{ADMIN_NAV_TREE, EMPLOYEE_NAV_TREE, NavGroup, NavItem, NavNode, Session};
use crate::native_text;
use crate::views::{
    activation::{ActivationOutcome, ActivationView},
    administration::AdministrationView,
    asset_allocations::AssetAllocationsView,
    asset_allocations_import::AssetAllocationsImportView,
    asset_audits::AssetAuditsView,
    asset_depreciations::AssetDepreciationsView,
    asset_depreciations_import::AssetDepreciationsImportView,
    asset_disposals::AssetDisposalsView,
    asset_disposals_import::AssetDisposalsImportView,
    asset_items_import::AssetItemsImportView,
    asset_maintenances::AssetMaintenancesView,
    asset_maintenances_import::AssetMaintenancesImportView,
    asset_materials::AssetMaterialsView,
    asset_repairs::AssetRepairsView,
    asset_system::AssetSystemView,
    asset_todo::AssetTodoView,
    asset_transfers::AssetTransfersView,
    asset_transfers_import::AssetTransfersImportView,
    assets::AssetsView,
    attendance::AttendanceView,
    attendance_leave_requests::AttendanceLeaveRequestsView,
    attendance_shift_assignments::AttendanceShiftAssignmentsView,
    attendance_shifts::AttendanceShiftCatalogView,
    audit_logs::AuditLogsView,
    auth_sessions::AuthSessionsView,
    bank_accounts::BankAccountsView,
    cash_flow::CashFlowView,
    chat::ChatView,
    contracts::ContractsView,
    crm::CrmView,
    crm_contact_legacy_import::CrmContactLegacyImportView,
    crm_legacy_import::CrmLegacyImportView,
    crm_operations::CrmOperationsView,
    dashboard::DashboardView,
    document_editor::DocumentEditorView,
    documents::EnterpriseDocumentsView,
    documents_overview::DocumentOverviewView,
    employee_bank_accounts::EmployeeBankAccountsView,
    employee_bank_import::EmployeeBankImportView,
    employee_overtime_requests::EmployeeOvertimeRequestsView,
    employee_portal::EmployeePortalView,
    employee_proposals::EmployeeProposalsView,
    employees::EmployeesView,
    file_share::PublicFileShareView,
    files::FilesView,
    finance::FinanceView,
    finance_legacy_import::FinanceLegacyImportView,
    helpdesk_incident_import::HelpdeskIncidentImportView,
    helpdesk_incidents::HelpdeskIncidentsView,
    helpdesk_ticket_import::HelpdeskTicketImportView,
    helpdesk_tickets::HelpdeskTicketsView,
    hr_certificates::HrCertificatesView,
    hr_employee_history::HrEmployeeHistoryView,
    hr_headcount::HrHeadcountView,
    hr_onboarding::HrOnboardingView,
    hr_overview::HrOverviewView,
    hr_performance_reviews::HrPerformanceReviewsView,
    hr_recruitment::HrRecruitmentView,
    hr_rewards::HrRewardsView,
    hr_training::HrTrainingCoursesView,
    hr_uniforms::HrUniformsView,
    insurance::InsuranceView,
    legacy_import::LegacyImportView,
    login::LoginView,
    meeting_rooms::MeetingRoomsView,
    notifications::NotificationsView,
    org_units::OrgUnitsView,
    plan_milestones::PlanMilestonesView,
    plan_okrs::PlanOkrsView,
    plan_progress::PlanProgressView,
    plan_reports::PlanReportsView,
    plans::PlansView,
    reports::ReportsView,
    reports_catalog_import::ReportsCatalogImportView,
    services::EnterpriseServicesView,
    settings::SettingsView,
    signatures::SignaturesView,
    system_broadcasts::SystemBroadcastsView,
    tasks::TasksView,
    users::UsersView,
    workflow_blueprints::WorkflowBlueprintsView,
    workflow_history::WorkflowHistoryView,
    workflow_requests::WorkflowRequestsView,
    workflow_settings::WorkflowSettingsView,
    workflows::WorkflowsView,
};
use egui::{Color32, Layout, RichText, Vec2};
use std::collections::{HashMap, HashSet};
use std::time::Duration;
use web_time::Instant;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum NavigationIcon {
    DashboardOutlined,
    MessageOutlined,
    BankOutlined,
    TeamOutlined,
    SafetyCertificateOutlined,
    ClockCircleOutlined,
    SmileOutlined,
    DollarOutlined,
    InboxOutlined,
    BranchesOutlined,
    DesktopOutlined,
    ShopOutlined,
    FileTextOutlined,
    FolderOpenOutlined,
    CustomerServiceOutlined,
    CalendarOutlined,
    BarChartOutlined,
    ControlOutlined,
    BellOutlined,
    SettingOutlined,
    HomeOutlined,
    UserOutlined,
    CheckSquareOutlined,
    FormOutlined,
    MenuOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
}

impl NavigationIcon {
    #[cfg(test)]
    const ALL: [Self; 27] = [
        Self::DashboardOutlined,
        Self::MessageOutlined,
        Self::BankOutlined,
        Self::TeamOutlined,
        Self::SafetyCertificateOutlined,
        Self::ClockCircleOutlined,
        Self::SmileOutlined,
        Self::DollarOutlined,
        Self::InboxOutlined,
        Self::BranchesOutlined,
        Self::DesktopOutlined,
        Self::ShopOutlined,
        Self::FileTextOutlined,
        Self::FolderOpenOutlined,
        Self::CustomerServiceOutlined,
        Self::CalendarOutlined,
        Self::BarChartOutlined,
        Self::ControlOutlined,
        Self::BellOutlined,
        Self::SettingOutlined,
        Self::HomeOutlined,
        Self::UserOutlined,
        Self::CheckSquareOutlined,
        Self::FormOutlined,
        Self::MenuOutlined,
        Self::MenuFoldOutlined,
        Self::MenuUnfoldOutlined,
    ];

    const fn name(self) -> &'static str {
        match self {
            Self::DashboardOutlined => "DashboardOutlined",
            Self::MessageOutlined => "MessageOutlined",
            Self::BankOutlined => "BankOutlined",
            Self::TeamOutlined => "TeamOutlined",
            Self::SafetyCertificateOutlined => "SafetyCertificateOutlined",
            Self::ClockCircleOutlined => "ClockCircleOutlined",
            Self::SmileOutlined => "SmileOutlined",
            Self::DollarOutlined => "DollarOutlined",
            Self::InboxOutlined => "InboxOutlined",
            Self::BranchesOutlined => "BranchesOutlined",
            Self::DesktopOutlined => "DesktopOutlined",
            Self::ShopOutlined => "ShopOutlined",
            Self::FileTextOutlined => "FileTextOutlined",
            Self::FolderOpenOutlined => "FolderOpenOutlined",
            Self::CustomerServiceOutlined => "CustomerServiceOutlined",
            Self::CalendarOutlined => "CalendarOutlined",
            Self::BarChartOutlined => "BarChartOutlined",
            Self::ControlOutlined => "ControlOutlined",
            Self::BellOutlined => "BellOutlined",
            Self::SettingOutlined => "SettingOutlined",
            Self::HomeOutlined => "HomeOutlined",
            Self::UserOutlined => "UserOutlined",
            Self::CheckSquareOutlined => "CheckSquareOutlined",
            Self::FormOutlined => "FormOutlined",
            Self::MenuOutlined => "MenuOutlined",
            Self::MenuFoldOutlined => "MenuFoldOutlined",
            Self::MenuUnfoldOutlined => "MenuUnfoldOutlined",
        }
    }

    const fn svg_bytes(self) -> &'static [u8] {
        match self {
            Self::DashboardOutlined => include_bytes!("../assets/nav-icons/DashboardOutlined.svg"),
            Self::MessageOutlined => include_bytes!("../assets/nav-icons/MessageOutlined.svg"),
            Self::BankOutlined => include_bytes!("../assets/nav-icons/BankOutlined.svg"),
            Self::TeamOutlined => include_bytes!("../assets/nav-icons/TeamOutlined.svg"),
            Self::SafetyCertificateOutlined => {
                include_bytes!("../assets/nav-icons/SafetyCertificateOutlined.svg")
            }
            Self::ClockCircleOutlined => {
                include_bytes!("../assets/nav-icons/ClockCircleOutlined.svg")
            }
            Self::SmileOutlined => include_bytes!("../assets/nav-icons/SmileOutlined.svg"),
            Self::DollarOutlined => include_bytes!("../assets/nav-icons/DollarOutlined.svg"),
            Self::InboxOutlined => include_bytes!("../assets/nav-icons/InboxOutlined.svg"),
            Self::BranchesOutlined => include_bytes!("../assets/nav-icons/BranchesOutlined.svg"),
            Self::DesktopOutlined => include_bytes!("../assets/nav-icons/DesktopOutlined.svg"),
            Self::ShopOutlined => include_bytes!("../assets/nav-icons/ShopOutlined.svg"),
            Self::FileTextOutlined => include_bytes!("../assets/nav-icons/FileTextOutlined.svg"),
            Self::FolderOpenOutlined => {
                include_bytes!("../assets/nav-icons/FolderOpenOutlined.svg")
            }
            Self::CustomerServiceOutlined => {
                include_bytes!("../assets/nav-icons/CustomerServiceOutlined.svg")
            }
            Self::CalendarOutlined => include_bytes!("../assets/nav-icons/CalendarOutlined.svg"),
            Self::BarChartOutlined => include_bytes!("../assets/nav-icons/BarChartOutlined.svg"),
            Self::ControlOutlined => include_bytes!("../assets/nav-icons/ControlOutlined.svg"),
            Self::BellOutlined => include_bytes!("../assets/nav-icons/BellOutlined.svg"),
            Self::SettingOutlined => include_bytes!("../assets/nav-icons/SettingOutlined.svg"),
            Self::HomeOutlined => include_bytes!("../assets/nav-icons/HomeOutlined.svg"),
            Self::UserOutlined => include_bytes!("../assets/nav-icons/UserOutlined.svg"),
            Self::CheckSquareOutlined => {
                include_bytes!("../assets/nav-icons/CheckSquareOutlined.svg")
            }
            Self::FormOutlined => include_bytes!("../assets/nav-icons/FormOutlined.svg"),
            Self::MenuOutlined => include_bytes!("../assets/nav-icons/MenuOutlined.svg"),
            Self::MenuFoldOutlined => include_bytes!("../assets/nav-icons/MenuFoldOutlined.svg"),
            Self::MenuUnfoldOutlined => {
                include_bytes!("../assets/nav-icons/MenuUnfoldOutlined.svg")
            }
        }
    }

    const fn for_group(group: NavGroup) -> Self {
        match group {
            NavGroup::Dashboard => Self::DashboardOutlined,
            NavGroup::Chat => Self::MessageOutlined,
            NavGroup::Business => Self::BankOutlined,
            NavGroup::Hr => Self::TeamOutlined,
            NavGroup::Insurance => Self::SafetyCertificateOutlined,
            NavGroup::Attendance => Self::ClockCircleOutlined,
            NavGroup::Crm => Self::SmileOutlined,
            NavGroup::Finance | NavGroup::EmployeePayslips => Self::DollarOutlined,
            NavGroup::Assets => Self::InboxOutlined,
            NavGroup::Workflows => Self::BranchesOutlined,
            NavGroup::MeetingRooms | NavGroup::EmployeeAssets => Self::DesktopOutlined,
            NavGroup::Services => Self::ShopOutlined,
            NavGroup::Documents | NavGroup::EmployeeContracts => Self::FileTextOutlined,
            NavGroup::Files | NavGroup::EmployeeProposals | NavGroup::EmployeeFiles => {
                Self::FolderOpenOutlined
            }
            NavGroup::Tickets => Self::CustomerServiceOutlined,
            NavGroup::Plans => Self::CalendarOutlined,
            NavGroup::Reports => Self::BarChartOutlined,
            NavGroup::Administration => Self::ControlOutlined,
            NavGroup::Signatures | NavGroup::EmployeeSignatures => Self::SafetyCertificateOutlined,
            NavGroup::Notifications | NavGroup::EmployeeNotifications => Self::BellOutlined,
            NavGroup::Settings | NavGroup::EmployeeSettings => Self::SettingOutlined,
            NavGroup::EmployeeHome => Self::HomeOutlined,
            NavGroup::EmployeeProfile => Self::UserOutlined,
            NavGroup::EmployeeTasks => Self::CheckSquareOutlined,
        }
    }

    const fn fallback_group(self) -> NavGroup {
        match self {
            Self::DashboardOutlined => NavGroup::Dashboard,
            Self::MessageOutlined => NavGroup::Chat,
            Self::BankOutlined => NavGroup::Business,
            Self::TeamOutlined => NavGroup::Hr,
            Self::SafetyCertificateOutlined => NavGroup::Insurance,
            Self::ClockCircleOutlined => NavGroup::Attendance,
            Self::SmileOutlined => NavGroup::Crm,
            Self::DollarOutlined => NavGroup::Finance,
            Self::InboxOutlined => NavGroup::Assets,
            Self::BranchesOutlined => NavGroup::Workflows,
            Self::DesktopOutlined => NavGroup::MeetingRooms,
            Self::ShopOutlined => NavGroup::Services,
            Self::FileTextOutlined => NavGroup::Documents,
            Self::FolderOpenOutlined => NavGroup::Files,
            Self::CustomerServiceOutlined => NavGroup::Tickets,
            Self::CalendarOutlined => NavGroup::Plans,
            Self::BarChartOutlined => NavGroup::Reports,
            Self::ControlOutlined
            | Self::MenuOutlined
            | Self::MenuFoldOutlined
            | Self::MenuUnfoldOutlined => NavGroup::Administration,
            Self::BellOutlined => NavGroup::Notifications,
            Self::SettingOutlined => NavGroup::Settings,
            Self::HomeOutlined => NavGroup::EmployeeHome,
            Self::UserOutlined => NavGroup::EmployeeProfile,
            Self::CheckSquareOutlined => NavGroup::EmployeeTasks,
            Self::FormOutlined => NavGroup::EmployeeProposals,
        }
    }
}

pub struct KiyoApp {
    pub session: Option<Session>,
    pub api: ApiClient,
    auth_check_task: Option<ApiTask<AuthSessionCheck>>,
    next_auth_check_at: Option<Instant>,
    auth_check_notice: String,
    pub current_nav: NavItem,
    pub is_employee_mode: bool,
    pub is_dark_theme: bool,
    pub sidebar_accordion: bool,
    pub sidebar_collapsed: bool,
    expanded_nav_nodes: HashSet<&'static str>,
    nav_icon_textures: HashMap<NavigationIcon, egui::TextureHandle>,
    flyout_nodes: Vec<NavigationFlyout>,
    flyout_close_at: Option<Instant>,
    header_menu_open: bool,
    notifications_menu_open: bool,
    last_compact_layout: Option<bool>,
    pub last_logged_pixels_per_point: Option<f32>,

    // Views
    pub login_view: LoginView,
    pub legacy_import_view: LegacyImportView,
    pub employee_bank_import_view: EmployeeBankImportView,
    pub crm_contact_legacy_import_view: CrmContactLegacyImportView,
    pub finance_legacy_import_view: FinanceLegacyImportView,
    pub crm_legacy_import_view: CrmLegacyImportView,
    pub helpdesk_incident_import_view: HelpdeskIncidentImportView,
    pub helpdesk_ticket_import_view: HelpdeskTicketImportView,
    pub asset_items_import_view: AssetItemsImportView,
    pub reports_catalog_import_view: ReportsCatalogImportView,
    pub asset_allocations_import_view: AssetAllocationsImportView,
    pub asset_transfers_import_view: AssetTransfersImportView,
    pub asset_disposals_import_view: AssetDisposalsImportView,
    pub asset_depreciations_import_view: AssetDepreciationsImportView,
    pub asset_maintenances_import_view: AssetMaintenancesImportView,
    pub helpdesk_incidents_view: HelpdeskIncidentsView,
    pub activation_view: ActivationView,
    pub show_activation: bool,
    pub dashboard_view: DashboardView,
    pub audit_logs_view: AuditLogsView,
    pub users_view: UsersView,
    pub auth_sessions_view: AuthSessionsView,
    pub employees_view: EmployeesView,
    pub org_units_view: OrgUnitsView,
    pub plan_milestones_view: PlanMilestonesView,
    pub plan_okrs_view: PlanOkrsView,
    pub plan_progress_view: PlanProgressView,
    pub plan_reports_view: PlanReportsView,
    pub reports_view: ReportsView,
    pub plans_view: PlansView,
    pub attendance_view: AttendanceView,
    pub attendance_leave_requests_view: AttendanceLeaveRequestsView,
    pub attendance_shift_assignments_view: AttendanceShiftAssignmentsView,
    pub employee_overtime_requests_view: EmployeeOvertimeRequestsView,
    pub employee_bank_accounts_view: EmployeeBankAccountsView,
    pub attendance_shifts_view: AttendanceShiftCatalogView,
    pub bank_accounts_view: BankAccountsView,
    pub cash_flow_view: CashFlowView,
    pub finance_view: FinanceView,
    pub hr_certificates_view: HrCertificatesView,
    pub hr_employee_history_view: HrEmployeeHistoryView,
    pub hr_headcount_view: HrHeadcountView,
    pub hr_onboarding_view: HrOnboardingView,
    pub hr_performance_reviews_view: HrPerformanceReviewsView,
    pub hr_recruitment_view: HrRecruitmentView,
    pub hr_rewards_view: HrRewardsView,
    pub hr_training_view: HrTrainingCoursesView,
    pub hr_uniforms_view: HrUniformsView,
    pub crm_view: CrmView,
    pub crm_operations_view: CrmOperationsView,
    pub assets_view: AssetsView,
    pub asset_system_view: AssetSystemView,
    pub administration_view: AdministrationView,
    pub asset_todo_view: AssetTodoView,
    pub document_overview_view: DocumentOverviewView,
    pub asset_materials_view: AssetMaterialsView,
    pub asset_allocations_view: AssetAllocationsView,
    pub asset_audits_view: AssetAuditsView,
    pub asset_disposals_view: AssetDisposalsView,
    pub asset_depreciations_view: AssetDepreciationsView,
    pub asset_maintenances_view: AssetMaintenancesView,
    pub asset_repairs_view: AssetRepairsView,
    pub asset_transfers_view: AssetTransfersView,
    pub rooms_view: MeetingRoomsView,
    pub services_view: EnterpriseServicesView,
    pub hr_overview_view: HrOverviewView,
    pub notifications_view: NotificationsView,
    pub system_broadcasts_view: SystemBroadcastsView,
    pub doc_view: DocumentEditorView,
    pub documents_view: EnterpriseDocumentsView,
    pub ins_view: InsuranceView,
    pub files_view: FilesView,
    pub workflows_view: WorkflowsView,
    pub workflow_blueprints_view: WorkflowBlueprintsView,
    pub workflow_history_view: WorkflowHistoryView,
    pub workflow_requests_view: WorkflowRequestsView,
    pub workflow_settings_view: WorkflowSettingsView,
    pub employee_proposals_view: EmployeeProposalsView,
    pub tasks_view: TasksView,
    pub helpdesk_tickets_view: HelpdeskTicketsView,
    pub chat_view: ChatView,
    pub contracts_view: ContractsView,
    pub sig_view: SignaturesView,
    pub settings_view: SettingsView,
    pub emp_view: EmployeePortalView,
    pub public_file_share_view: Option<PublicFileShareView>,
}

impl Default for KiyoApp {
    fn default() -> Self {
        Self {
            session: None,
            api: ApiClient::default(),
            auth_check_task: None,
            next_auth_check_at: None,
            auth_check_notice: String::new(),
            current_nav: NavItem::admin_dashboard(),
            is_employee_mode: false,
            is_dark_theme: false,
            sidebar_accordion: false,
            sidebar_collapsed: false,
            expanded_nav_nodes: HashSet::new(),
            nav_icon_textures: HashMap::new(),
            flyout_nodes: Vec::new(),
            flyout_close_at: None,
            header_menu_open: false,
            notifications_menu_open: false,
            last_compact_layout: None,
            last_logged_pixels_per_point: None,

            login_view: LoginView::new(),
            legacy_import_view: LegacyImportView::default(),
            employee_bank_import_view: EmployeeBankImportView::default(),
            crm_contact_legacy_import_view: CrmContactLegacyImportView::default(),
            finance_legacy_import_view: FinanceLegacyImportView::default(),
            crm_legacy_import_view: CrmLegacyImportView::default(),
            helpdesk_incident_import_view: HelpdeskIncidentImportView::default(),
            helpdesk_ticket_import_view: HelpdeskTicketImportView::default(),
            asset_items_import_view: AssetItemsImportView::default(),
            reports_catalog_import_view: ReportsCatalogImportView::default(),
            asset_allocations_import_view: AssetAllocationsImportView::default(),
            asset_transfers_import_view: AssetTransfersImportView::default(),
            asset_disposals_import_view: AssetDisposalsImportView::default(),
            asset_depreciations_import_view: AssetDepreciationsImportView::default(),
            asset_maintenances_import_view: AssetMaintenancesImportView::default(),
            helpdesk_incidents_view: HelpdeskIncidentsView::default(),
            activation_view: ActivationView::default(),
            show_activation: false,
            dashboard_view: DashboardView::default(),
            audit_logs_view: AuditLogsView::default(),
            users_view: UsersView::default(),
            auth_sessions_view: AuthSessionsView::default(),
            employees_view: EmployeesView::default(),
            org_units_view: OrgUnitsView::default(),
            plan_milestones_view: PlanMilestonesView::default(),
            plan_okrs_view: PlanOkrsView::default(),
            plan_progress_view: PlanProgressView::default(),
            plan_reports_view: PlanReportsView::default(),
            reports_view: ReportsView::default(),
            plans_view: PlansView::default(),
            attendance_view: AttendanceView::default(),
            attendance_leave_requests_view: AttendanceLeaveRequestsView::default(),
            attendance_shift_assignments_view: AttendanceShiftAssignmentsView::default(),
            employee_overtime_requests_view: EmployeeOvertimeRequestsView::default(),
            employee_bank_accounts_view: EmployeeBankAccountsView::default(),
            attendance_shifts_view: AttendanceShiftCatalogView::default(),
            bank_accounts_view: BankAccountsView::default(),
            cash_flow_view: CashFlowView::default(),
            finance_view: FinanceView::default(),
            hr_certificates_view: HrCertificatesView::default(),
            hr_employee_history_view: HrEmployeeHistoryView::default(),
            hr_headcount_view: HrHeadcountView::default(),
            hr_onboarding_view: HrOnboardingView::default(),
            hr_performance_reviews_view: HrPerformanceReviewsView::default(),
            hr_recruitment_view: HrRecruitmentView::default(),
            hr_rewards_view: HrRewardsView::default(),
            hr_training_view: HrTrainingCoursesView::default(),
            hr_uniforms_view: HrUniformsView::default(),
            crm_view: CrmView::default(),
            crm_operations_view: CrmOperationsView::default(),
            assets_view: AssetsView::default(),
            asset_system_view: AssetSystemView::default(),
            administration_view: AdministrationView::default(),
            asset_todo_view: AssetTodoView::default(),
            document_overview_view: DocumentOverviewView::default(),
            asset_materials_view: AssetMaterialsView::default(),
            asset_allocations_view: AssetAllocationsView::default(),
            asset_audits_view: AssetAuditsView::default(),
            asset_disposals_view: AssetDisposalsView::default(),
            asset_depreciations_view: AssetDepreciationsView::default(),
            asset_maintenances_view: AssetMaintenancesView::default(),
            asset_repairs_view: AssetRepairsView::default(),
            asset_transfers_view: AssetTransfersView::default(),
            rooms_view: MeetingRoomsView::default(),
            services_view: EnterpriseServicesView::default(),
            hr_overview_view: HrOverviewView::default(),
            notifications_view: NotificationsView::default(),
            system_broadcasts_view: SystemBroadcastsView::default(),
            doc_view: DocumentEditorView::default(),
            documents_view: EnterpriseDocumentsView::default(),
            ins_view: InsuranceView::default(),
            files_view: FilesView::default(),
            workflows_view: WorkflowsView::default(),
            workflow_blueprints_view: WorkflowBlueprintsView::default(),
            workflow_history_view: WorkflowHistoryView::default(),
            workflow_requests_view: WorkflowRequestsView::default(),
            workflow_settings_view: WorkflowSettingsView::default(),
            employee_proposals_view: EmployeeProposalsView::default(),
            tasks_view: TasksView::default(),
            helpdesk_tickets_view: HelpdeskTicketsView::default(),
            chat_view: ChatView::default(),
            contracts_view: ContractsView::default(),
            sig_view: SignaturesView::default(),
            settings_view: SettingsView::default(),
            emp_view: EmployeePortalView::default(),
            public_file_share_view: None,
        }
    }
}

impl eframe::App for KiyoApp {
    fn save(&mut self, storage: &mut dyn eframe::Storage) {
        eframe::set_value(
            storage,
            "kiyo.appearance",
            &(self.is_dark_theme, self.sidebar_accordion),
        );
    }

    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        crate::visual_test::begin();
        native_text::apply_visuals(ctx, self.is_dark_theme);
        native_text::log_dpi_if_changed(&mut self.last_logged_pixels_per_point, ctx);

        if let Some(view) = self.public_file_share_view.as_mut() {
            egui::CentralPanel::default().show(ctx, |ui| {
                view.render(ui, ctx, &self.api);
            });
            return;
        }

        if self.session.is_none() {
            let endpoint = self.login_view.endpoint.clone();
            let mode = self.login_view.mode;
            let api = &self.api;
            let show_activation = self.show_activation;
            let login_view = &mut self.login_view;
            let activation_view = &mut self.activation_view;
            let mut activation_outcome = ActivationOutcome::None;
            egui::CentralPanel::default()
                .frame(
                    egui::Frame::none()
                        .fill(Color32::from_rgb(245, 245, 245))
                        .inner_margin(8.0),
                )
                .show(ctx, |ui| {
                    if show_activation {
                        activation_outcome = activation_view.render(ui, ctx, api, &endpoint, mode);
                    } else if let Some(session) = login_view.render(ui, ctx, api) {
                        activation_outcome = ActivationOutcome::Authenticated(session);
                    }
                });
            match activation_outcome {
                ActivationOutcome::None => {}
                ActivationOutcome::BackToLogin => self.show_activation = false,
                ActivationOutcome::Authenticated(session) => self.accept_session(session),
            }
            crate::visual_test::finish(
                ctx,
                if self.show_activation {
                    "/activate-account"
                } else {
                    "/login"
                },
                self.is_dark_theme,
            );
            return;
        }

        if !self.poll_auth_session(ctx) {
            return;
        }

        if self.current_nav.group != NavGroup::Workflows
            || self.current_nav.path != "/admin/workflows/settings"
        {
            self.workflow_settings_view.deactivate();
        }

        let compact_layout = is_compact_layout(ctx.screen_rect().width());
        let navigation_before_frame = self.current_nav;
        if self.last_compact_layout != Some(compact_layout) {
            self.sidebar_collapsed = compact_layout;
            self.last_compact_layout = Some(compact_layout);
        }

        if let Some(command) = crate::visual_test::command() {
            if let Some(dark) = command.dark {
                self.is_dark_theme = dark;
            }
            if let Some(collapsed) = command.collapsed {
                self.sidebar_collapsed = collapsed;
            }
            if let Some(path) = command.path {
                let role = self
                    .session
                    .as_ref()
                    .map(|s| s.user.role.as_str())
                    .unwrap_or_default();
                let employee_path = path.starts_with("/employee");
                if role == "ADMIN" || employee_path {
                    let tree = if employee_path {
                        EMPLOYEE_NAV_TREE
                    } else {
                        ADMIN_NAV_TREE
                    };
                    if let Some(item) = find_nav_item_by_path(tree, &path) {
                        self.is_employee_mode = employee_path;
                        self.current_nav = item;
                    }
                }
            }
        }

        if let Some(session) = self.session.as_ref() {
            self.notifications_view.poll(ctx, session, &self.api);
            if matches!(
                self.current_nav.path,
                "/admin/system/notifications"
                    | "/admin/notifications/system"
                    | "/admin/notifications/broadcast"
            ) {
                self.system_broadcasts_view.poll(ctx, session, &self.api);
            }
        }

        // Legacy ChatPage owns the whole viewport; the admin chat manager does not.
        if self.current_nav.path == "/admin/chat" {
            self.flyout_nodes.clear();
            self.flyout_close_at = None;
            self.header_menu_open = false;
            if let Some(session) = self.session.as_ref() {
                if self.chat_view.render_fullscreen(ctx, session, &self.api) {
                    self.current_nav = ADMIN_NAV_TREE[0].item;
                    ctx.request_repaint();
                }
            }
            crate::visual_test::finish(ctx, self.current_nav.path, self.is_dark_theme);
            return;
        }

        let was_security_screen = self.current_nav.path.ends_with("/security");

        let user_name = self
            .session
            .as_ref()
            .map(|s| s.user.name.clone())
            .unwrap_or_default();
        let user_role = self
            .session
            .as_ref()
            .map(|s| s.user.role.clone())
            .unwrap_or_default();
        let mode_label = self
            .session
            .as_ref()
            .map(|s| s.mode.label())
            .unwrap_or_default();

        let mut should_logout = false;
        let mut notification_button_clicked = false;
        let mut notification_anchor_rect = None;

        let palette = crate::theme::palette(self.is_dark_theme);
        // The legacy sidebar spans the full viewport, including its own 48px brand.
        // Register it before the header so both expanded and collapsed geometry match.
        if !compact_layout {
            let width = if self.sidebar_collapsed {
                crate::theme::COLLAPSED_SIDEBAR_WIDTH
            } else {
                crate::theme::SIDEBAR_WIDTH
            };
            let sidebar = egui::SidePanel::left("sidebar_nav_panel")
                .resizable(false)
                .exact_width(width)
                .frame(
                    egui::Frame::none()
                        .fill(palette.sidebar)
                        .inner_margin(egui::Margin {
                            left: 0.0,
                            right: 1.0,
                            top: 0.0,
                            bottom: 0.0,
                        }),
                )
                .show(ctx, |ui| {
                    ui.spacing_mut().item_spacing = Vec2::ZERO;
                    if render_legacy_brand(ui, self.is_employee_mode, self.sidebar_collapsed) {
                        self.current_nav = if self.is_employee_mode {
                            NavItem::employee_home()
                        } else {
                            NavItem::admin_dashboard()
                        };
                    }
                    ui.add_space(10.0);
                    if self.sidebar_accordion && !self.sidebar_collapsed {
                        render_navigation(
                            ctx,
                            ui,
                            self.is_employee_mode,
                            &mode_label,
                            &mut self.current_nav,
                            &mut self.expanded_nav_nodes,
                            &mut self.nav_icon_textures,
                        );
                    } else {
                        render_desktop_navigation(
                            ctx,
                            ui,
                            self.is_employee_mode,
                            self.sidebar_collapsed,
                            &mut self.current_nav,
                            &mut self.flyout_nodes,
                            &mut self.nav_icon_textures,
                        );
                    }
                });
            let rect = sidebar.response.rect;
            ctx.layer_painter(sidebar.response.layer_id).line_segment(
                [
                    egui::pos2(rect.right() - 0.5, rect.top()),
                    egui::pos2(rect.right() - 0.5, rect.bottom()),
                ],
                egui::Stroke::new(1.0, palette.border),
            );
            crate::visual_test::record("sidebar", rect);
        }

        let header = egui::TopBottomPanel::top("top_header_panel")
            .exact_height(crate::theme::HEADER_HEIGHT)
            .frame(
                egui::Frame::none()
                    .fill(palette.surface)
                    .inner_margin(egui::Margin {
                        left: if compact_layout { 12.0 } else { 16.0 },
                        right: if compact_layout { 12.0 } else { 16.0 },
                        top: 0.0,
                        bottom: 1.0,
                    }),
            )
            .show(ctx, |ui| {
                ui.spacing_mut().item_spacing = Vec2::new(10.0, 0.0);
                ui.horizontal_centered(|ui| {
                    if header_menu_button(
                        ui,
                        ctx,
                        &mut self.nav_icon_textures,
                        self.sidebar_collapsed || compact_layout,
                    ) {
                        if compact_layout && self.sidebar_collapsed {
                            let items = if self.is_employee_mode {
                                EMPLOYEE_NAV_TREE
                            } else {
                                ADMIN_NAV_TREE
                            };
                            expand_active_nav_ancestors(
                                items,
                                self.current_nav,
                                &mut self.expanded_nav_nodes,
                            );
                        }
                        self.sidebar_collapsed = !self.sidebar_collapsed;
                    }

                    ui.with_layout(Layout::right_to_left(egui::Align::Center), |ui| {
                        if compact_layout {
                            ui.spacing_mut().item_spacing.x = 6.0;
                        }
                        let unread = self.notifications_view.unread_count();
                        if header_user_button(
                            ui,
                            ctx,
                            &mut self.nav_icon_textures,
                            &user_name,
                            &user_role,
                            &mode_label,
                            compact_layout,
                        ) {
                            self.header_menu_open = !self.header_menu_open;
                            if self.header_menu_open {
                                self.notifications_menu_open = false;
                            }
                        }
                        let notification_response = header_notification_button(
                            ui,
                            ctx,
                            &mut self.nav_icon_textures,
                            unread,
                            self.notifications_menu_open,
                        );
                        notification_anchor_rect = Some(notification_response.rect);
                        if notification_response.clicked() {
                            self.notifications_menu_open = !self.notifications_menu_open;
                            self.header_menu_open = false;
                            notification_button_clicked = true;
                        }
                        if !self.auth_check_notice.is_empty() {
                            ui.small_button("!").on_hover_text(&self.auth_check_notice);
                        }
                    });
                });
            });
        crate::visual_test::record("header", header.response.rect);
        let header_rect = header.response.rect;
        ctx.layer_painter(header.response.layer_id).line_segment(
            [
                egui::pos2(header_rect.left(), header_rect.bottom() - 0.5),
                egui::pos2(header_rect.right(), header_rect.bottom() - 0.5),
            ],
            egui::Stroke::new(1.0, palette.border),
        );

        if self.notifications_menu_open {
            let mut notification_nav_change = None;
            let (close_popover, popover_rect) = self.notifications_view.render_header_popover(
                ctx,
                self.session.as_ref().expect("authenticated session"),
                &self.api,
                notification_anchor_rect.expect("header notification button is rendered"),
                notification_nav_item(&user_role),
                &mut notification_nav_change,
            );
            let clicked_outside = !notification_button_clicked
                && ctx.input(|input| {
                    input.pointer.any_click()
                        && input
                            .pointer
                            .interact_pos()
                            .is_some_and(|position| !popover_rect.contains(position))
                });
            if close_popover || clicked_outside {
                self.notifications_menu_open = false;
            }
            if let Some(nav_item) = notification_nav_change {
                self.current_nav = nav_item;
                self.sidebar_collapsed = true;
                self.notifications_menu_open = false;
            }
        }

        if self.header_menu_open {
            egui::Window::new("Account menu")
                .id(egui::Id::new("kiyo_account_menu"))
                .anchor(egui::Align2::RIGHT_TOP, Vec2::new(-8.0, 54.0))
                .title_bar(false)
                .collapsible(false)
                .resizable(false)
                .fixed_size(Vec2::new(
                    236.0,
                    if user_role == "ADMIN" { 184.0 } else { 144.0 },
                ))
                .show(ctx, |ui| {
                    ui.label(RichText::new(&user_name).strong());
                    ui.small(format!("{} · {}", user_role, mode_label));
                    ui.separator();
                    if ui
                        .button(if self.is_dark_theme {
                            "Chuyển sang giao diện sáng"
                        } else {
                            "Chuyển sang giao diện tối"
                        })
                        .clicked()
                    {
                        self.is_dark_theme = !self.is_dark_theme;
                    }
                    if user_role == "ADMIN"
                        && ui
                            .button(if self.is_employee_mode {
                                "Chuyển sang trang quản trị"
                            } else {
                                "Mở cổng nhân viên"
                            })
                            .clicked()
                    {
                        self.is_employee_mode = !self.is_employee_mode;
                        self.expanded_nav_nodes.clear();
                        self.notifications_menu_open = false;
                        self.current_nav = if self.is_employee_mode {
                            NavItem::employee_home()
                        } else {
                            NavItem::admin_dashboard()
                        };
                        self.header_menu_open = false;
                    }
                    if !self.auth_check_notice.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.auth_check_notice);
                    }
                    ui.separator();
                    if ui
                        .button(RichText::new("Đăng xuất").color(Color32::from_rgb(220, 38, 38)))
                        .clicked()
                    {
                        should_logout = true;
                        self.header_menu_open = false;
                    }
                });
        }

        if should_logout {
            if let Some(session) = self.session.as_ref() {
                let _logout_request = self.api.logout_task(session);
            }
            self.clear_authenticated_state();
            return;
        }

        if compact_layout {
            let mut mobile_action = MobileBottomAction::None;
            show_mobile_bottom_bar(ctx, |ui| {
                mobile_action = render_mobile_bottom_navigation(
                    ctx,
                    ui,
                    self.is_employee_mode,
                    !self.sidebar_collapsed,
                    self.current_nav,
                    &mut self.nav_icon_textures,
                );
            });
            match mobile_action {
                MobileBottomAction::None => {}
                MobileBottomAction::Navigate(item) => {
                    self.current_nav = item;
                    self.sidebar_collapsed = true;
                }
                MobileBottomAction::ToggleMenu => {
                    if self.sidebar_collapsed {
                        let items = if self.is_employee_mode {
                            EMPLOYEE_NAV_TREE
                        } else {
                            ADMIN_NAV_TREE
                        };
                        expand_active_nav_ancestors(
                            items,
                            self.current_nav,
                            &mut self.expanded_nav_nodes,
                        );
                    }
                    self.sidebar_collapsed = !self.sidebar_collapsed;
                }
            }
        }

        // The compact layout follows the legacy mobile drawer and backdrop.
        if compact_layout && !self.sidebar_collapsed {
            let selected_path = self.current_nav.path.to_owned();
            let screen = ctx.screen_rect();
            let mut backdrop_clicked = false;
            egui::Area::new(egui::Id::new("mobile_navigation_backdrop"))
                .order(egui::Order::Middle)
                .fixed_pos(screen.min)
                .show(ctx, |ui| {
                    let (rect, response) =
                        ui.allocate_exact_size(screen.size(), egui::Sense::click());
                    ui.painter()
                        .rect_filled(rect, 0.0, Color32::from_black_alpha(115));
                    backdrop_clicked = response.clicked();
                });
            let drawer_rect = mobile_navigation_drawer_rect(screen);
            let _drawer_bounds = show_mobile_navigation_drawer(ctx, drawer_rect, |ui| {
                ui.allocate_ui_with_layout(
                    Vec2::new(drawer_rect.width(), 48.0),
                    Layout::left_to_right(egui::Align::Center),
                    |ui| render_mobile_drawer_brand(ui, self.is_employee_mode),
                );
                ui.separator();
                ui.add_space(6.0);
                render_navigation(
                    ctx,
                    ui,
                    self.is_employee_mode,
                    &mode_label,
                    &mut self.current_nav,
                    &mut self.expanded_nav_nodes,
                    &mut self.nav_icon_textures,
                );
            });
            if self.current_nav.path != selected_path {
                self.sidebar_collapsed = true;
            }
            if backdrop_clicked {
                self.sidebar_collapsed = true;
            }
        }

        // Central Content Area
        let session = self.session.as_mut().unwrap();
        crate::visual_test::record("content", ctx.available_rect());

        egui::CentralPanel::default()
            .frame(
                egui::Frame::central_panel(&ctx.style())
                    .fill(
                        if matches!(
                            self.current_nav.group,
                            NavGroup::Files | NavGroup::EmployeeFiles
                        ) {
                            Color32::WHITE
                        } else {
                            ctx.style().visuals.panel_fill
                        },
                    )
                    .inner_margin(
                        if matches!(
                            self.current_nav.group,
                            NavGroup::Files | NavGroup::EmployeeFiles
                        ) {
                            egui::Margin {
                                bottom: 0.0,
                                ..egui::Margin::same(0.0)
                            }
                        } else {
                            egui::Margin {
                                left: 12.0,
                                right: 12.0,
                                top: 8.0,
                                bottom: if compact_layout { 0.0 } else { 8.0 },
                            }
                        },
                    ),
            )
            .show(ctx, |ui| {
                let mut nav_change = None;

                egui::ScrollArea::vertical()
                    .id_salt(self.current_nav.path)
                    .show(ui, |ui| {
                        match self.current_nav {
                            _ => match self.current_nav.group {
                                NavGroup::Dashboard => self.dashboard_view.render(
                                    ui,
                                    ctx,
                                    session,
                                    &self.api,
                                    &mut nav_change,
                                ),
                                NavGroup::Administration
                                    if self.current_nav.path == "/admin/system/migration" =>
                                {
                                    self.legacy_import_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Administration
                                    if self.current_nav.path == "/admin/system/migration/bank" =>
                                {
                                    self.employee_bank_import_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Administration
                                    if self.current_nav.path
                                        == "/admin/system/migration/finance" =>
                                {
                                    self.finance_legacy_import_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Administration
                                    if self.current_nav.path == "/admin/system/migration/plans" =>
                                {
                                    self.legacy_import_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Administration
                                    if self.current_nav.path
                                        == "/admin/system/migration/reports-catalog" =>
                                {
                                    self.reports_catalog_import_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Administration
                                    if self.current_nav.path
                                        == "/admin/system/migration/crm-contacts" =>
                                {
                                    self.crm_contact_legacy_import_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Administration
                                    if self.current_nav.path == "/admin/system/migration/crm" =>
                                {
                                    self.crm_legacy_import_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Administration
                                    if self.current_nav.path
                                        == "/admin/system/migration/helpdesk-tickets" =>
                                {
                                    self.helpdesk_ticket_import_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Administration
                                    if self.current_nav.path
                                        == "/admin/system/migration/helpdesk-incidents" =>
                                {
                                    self.helpdesk_incident_import_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Administration
                                    if self.current_nav.path
                                        == "/admin/system/migration/asset-items" =>
                                {
                                    self.asset_items_import_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Administration
                                    if self.current_nav.path
                                        == "/admin/system/migration/asset-allocations" =>
                                {
                                    self.asset_allocations_import_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Administration
                                    if self.current_nav.path
                                        == "/admin/system/migration/asset-transfers" =>
                                {
                                    self.asset_transfers_import_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Administration
                                    if self.current_nav.path
                                        == "/admin/system/migration/asset-disposals" =>
                                {
                                    self.asset_disposals_import_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Administration
                                    if self.current_nav.path
                                        == "/admin/system/migration/asset-depreciations" =>
                                {
                                    self.asset_depreciations_import_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Administration
                                    if self.current_nav.path
                                        == "/admin/system/migration/asset-maintenances" =>
                                {
                                    self.asset_maintenances_import_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Administration
                                    if self.current_nav.path == "/admin/users" =>
                                {
                                    self.users_view.render(ui, session, &self.api)
                                }
                                NavGroup::Administration
                                    if self.current_nav.path == "/admin/audit-logs" =>
                                {
                                    self.audit_logs_view.render(ui, session, &self.api)
                                }
                                NavGroup::Administration
                                    if self.current_nav.path == "/admin/sessions" =>
                                {
                                    self.auth_sessions_view.render(ui, session, &self.api)
                                }
                                NavGroup::Administration => {
                                    self.administration_view.render(ui, ctx, session, &self.api, self.current_nav.path)
                                }
                                NavGroup::Business
                                    if self.current_nav.path == "/admin/business/org-chart" =>
                                {
                                    self.org_units_view.render_chart(ui, session, &self.api)
                                }
                                NavGroup::Business => {
                                    self.org_units_view.render(ui, session, &self.api)
                                }
                                NavGroup::Hr
                                    if matches!(
                                        self.current_nav.path,
                                        "/admin/hr/overview" | "/admin/hr"
                                    ) =>
                                {
                                    self.hr_overview_view.render(ui, session, &self.api)
                                }
                                NavGroup::Hr if self.current_nav.path == "/admin/hr/contracts" => {
                                    self.contracts_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Hr if self.current_nav.path == "/admin/hr/training" => {
                                    self.hr_training_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Hr
                                    if self.current_nav.path == "/admin/hr/certificates" =>
                                {
                                    self.hr_certificates_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Hr if self.current_nav.path == "/admin/hr/onboarding" => {
                                    self.hr_onboarding_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Hr
                                    if self.current_nav.path == "/admin/hr/performance" =>
                                {
                                    self.hr_performance_reviews_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Hr
                                    if self.current_nav.path.starts_with("/admin/hr/history") =>
                                {
                                    if self.current_nav.path == "/admin/hr/history/bank" {
                                        self.employee_bank_accounts_view
                                            .render(ui, ctx, session, &self.api, true)
                                    } else {
                                        self.hr_employee_history_view.render(
                                            ui,
                                            ctx,
                                            session,
                                            &self.api,
                                            &self.current_nav.path,
                                        )
                                    }
                                }
                                NavGroup::Hr if self.current_nav.path == "/admin/hr/headcount" => {
                                    self.hr_headcount_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Hr
                                    if self.current_nav.path == "/admin/hr/recruitment" =>
                                {
                                    self.hr_recruitment_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Hr if self.current_nav.path == "/admin/hr/rewards" => {
                                    self.hr_rewards_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Hr if self.current_nav.path == "/admin/hr/uniforms" => {
                                    self.hr_uniforms_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Hr if self.current_nav.path == "/admin/hr/proposals" => {
                                    self.employee_proposals_view
                                        .render(ui, ctx, session, &self.api, true)
                                }
                                NavGroup::Hr => self.employees_view.render(ui, session, &self.api),
                                NavGroup::Attendance
                                    if matches!(
                                        self.current_nav.path,
                                        "/employee/overtime"
                                            | "/admin/attendance/requests/overtime"
                                    ) =>
                                {
                                    self.employee_overtime_requests_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Attendance
                                    if self.current_nav.path == "/employee/leaves" =>
                                {
                                    self.attendance_leave_requests_view
                                        .render(ui, ctx, session, &self.api, true)
                                }
                                NavGroup::Attendance
                                    if matches!(
                                        self.current_nav.path,
                                        "/admin/attendance/requests/list"
                                            | "/admin/attendance/requests"
                                    ) =>
                                {
                                    self.attendance_leave_requests_view
                                        .render(ui, ctx, session, &self.api, false)
                                }
                                NavGroup::Attendance
                                    if matches!(
                                        self.current_nav.path,
                                        "/admin/attendance/shifts/detail"
                                            | "/admin/attendance/shifts/summary"
                                            | "/admin/attendance/shifts/registration"
                                    ) =>
                                {
                                    self.attendance_shift_assignments_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Attendance
                                    if matches!(
                                        self.current_nav.path,
                                        "/admin/attendance/shifts"
                                            | "/admin/attendance/shifts/categories"
                                    ) =>
                                {
                                    self.attendance_shifts_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Attendance => self.attendance_view.render(
                                    ui,
                                    ctx,
                                    session,
                                    &self.api,
                                    self.current_nav.path,
                                    &mut nav_change,
                                ),
                                NavGroup::Finance
                                    if matches!(
                                        self.current_nav.path,
                                        "/admin/finance/cash/bank"
                                            | "/admin/finance/cash/bank/accounts"
                                            | "/admin/finance/cash/bank/transactions"
                                            | "/admin/finance/cash/bank/statements"
                                            | "/admin/finance/cash/bank/e-banking"
                                            | "/admin/finance/cash/transfer"
                                    ) =>
                                {
                                    self.bank_accounts_view.render(
                                        ui,
                                        ctx,
                                        session,
                                        &self.api,
                                        self.current_nav.path,
                                    )
                                }
                                NavGroup::Finance
                                    if matches!(
                                        self.current_nav.path,
                                        "/admin/finance/cash" | "/admin/finance/cash/flow"
                                    ) =>
                                {
                                    self.cash_flow_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Finance => self.finance_view.render(
                                    ui,
                                    ctx,
                                    session,
                                    &self.api,
                                    self.current_nav.path,
                                ),
                                NavGroup::Crm
                                    if matches!(
                                        self.current_nav.path,
                                        "/admin/crm/suppliers-eval" | "/admin/crm/feedback"
                                    ) =>
                                {
                                    self.crm_operations_view.render(
                                        ui,
                                        ctx,
                                        session,
                                        &self.api,
                                        self.current_nav.path,
                                    )
                                }
                                NavGroup::Crm => self.crm_view.render(
                                    ui,
                                    ctx,
                                    session,
                                    &self.api,
                                    self.current_nav.path,
                                ),
                                NavGroup::Assets
                                    if self.current_nav.path == "/admin/assets/materials" =>
                                {
                                    self.asset_materials_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Assets
                                    if self.current_nav.path == "/admin/assets/allocation" =>
                                {
                                    self.asset_allocations_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Assets
                                    if self.current_nav.path == "/admin/assets/transfer" =>
                                {
                                    self.asset_transfers_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Assets
                                    if self.current_nav.path == "/admin/assets/maintenance" =>
                                {
                                    self.asset_maintenances_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Assets
                                    if self.current_nav.path == "/admin/assets/repairs" =>
                                {
                                    self.asset_repairs_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Assets
                                    if self.current_nav.path == "/admin/assets/disposal" =>
                                {
                                    self.asset_disposals_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Assets
                                    if self.current_nav.path == "/admin/assets/depreciation" =>
                                {
                                    self.asset_depreciations_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Assets
                                    if matches!(
                                        self.current_nav.path,
                                        "/admin/assets/audit"
                                            | "/admin/assets/count"
                                            | "/admin/assets/inventory"
                                    ) =>
                                {
                                    self.asset_audits_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Assets if self.current_nav.path == "/admin/assets/todo" => {
                                    self.asset_todo_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Assets if self.current_nav.path.starts_with("/admin/assets/system") => {
                                    self.asset_system_view.render(ui, ctx, session, &self.api, self.current_nav.path)
                                }
                                NavGroup::Assets => self.assets_view.render_route(
                                    ui,
                                    ctx,
                                    session,
                                    &self.api,
                                    self.current_nav.path,
                                ),
                                NavGroup::MeetingRooms => self.rooms_view.render(
                                    ui,
                                    ctx,
                                    session,
                                    &self.api,
                                    self.current_nav.path,
                                ),
                                NavGroup::Documents if self.current_nav.path == "/admin/documents/overview" => {
                                    self.document_overview_view.render(ui, ctx, session, &self.api);
                                    if let Some(target) = self.document_overview_view.nav_change.take() { nav_change = Some(target); }
                                }
                                NavGroup::Documents
                                    if self.current_nav.path == "/admin/documents/contracts" =>
                                {
                                    self.contracts_view
                                        .render_scope(ui, ctx, session, &self.api, false)
                                }
                                NavGroup::Documents
                                    if self.current_nav.path
                                        == "/admin/documents/settings/digital-signature" =>
                                {
                                    self.sig_view.render_route(
                                        ui,
                                        session,
                                        "/admin/digital-signature/list",
                                    )
                                }
                                NavGroup::Documents => self.documents_view.render(
                                    ui,
                                    ctx,
                                    session,
                                    &self.api,
                                    self.current_nav.path,
                                    &mut self.doc_view,
                                ),
                                NavGroup::Insurance => self.ins_view.render(
                                    ui,
                                    ctx,
                                    session,
                                    &self.api,
                                    self.current_nav.path,
                                ),
                                NavGroup::Files | NavGroup::EmployeeFiles => {
                                    self.files_view.render(
                                        ui,
                                        ctx,
                                        session,
                                        &self.api,
                                        self.current_nav.group == NavGroup::EmployeeFiles,
                                    )
                                }
                                NavGroup::Workflows
                                    if self.current_nav.path == "/admin/workflows/overview" =>
                                {
                                    self.workflows_view.render_overview(
                                        ui,
                                        ctx,
                                        session,
                                        &self.api,
                                        &mut nav_change,
                                    )
                                }
                                NavGroup::Workflows
                                    if self.current_nav.path == "/admin/workflows/history" =>
                                {
                                    self.workflow_history_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Workflows
                                    if self.current_nav.path == "/admin/workflows/requests" =>
                                {
                                    self.workflow_requests_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Workflows
                                    if self.current_nav.path == "/admin/workflows/settings" =>
                                {
                                    self.workflow_settings_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Workflows
                                    if matches!(
                                        self.current_nav.path,
                                        "/admin/workflows" | "/admin/workflows/list"
                                    ) =>
                                {
                                    self.workflow_blueprints_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::EmployeeProposals => self
                                    .employee_proposals_view
                                    .render(ui, ctx, session, &self.api, false),
                                NavGroup::EmployeeTasks => {
                                    self.tasks_view.render(ui, ctx, session, &self.api, false)
                                }
                                NavGroup::Plans
                                    if matches!(
                                        self.current_nav.path,
                                        "/admin/tasks" | "/admin/plans" | "/admin/plans/tasks"
                                    ) =>
                                {
                                    self.tasks_view.render(ui, ctx, session, &self.api, true)
                                }
                                NavGroup::Plans if self.current_nav.path == "/admin/plans/list" => {
                                    self.plans_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Plans
                                    if self.current_nav.path == "/admin/plans/milestones" =>
                                {
                                    self.plan_milestones_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Plans
                                    if matches!(
                                        self.current_nav.path,
                                        "/admin/plans/roadmap"
                                            | "/admin/plans/projects"
                                            | "/admin/plans/okr"
                                    ) =>
                                {
                                    self.plan_okrs_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Plans
                                    if self.current_nav.path == "/admin/plans/progress" =>
                                {
                                    self.plan_progress_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Plans
                                    if self.current_nav.path == "/admin/plans/reports" =>
                                {
                                    self.plan_reports_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Workflows => {
                                    self.workflows_view
                                        .render(ui, session, self.current_nav.path)
                                }
                                NavGroup::Chat => self.chat_view.render_route(
                                    ui,
                                    ctx,
                                    session,
                                    &self.api,
                                    self.current_nav.path,
                                ),
                                NavGroup::Signatures | NavGroup::EmployeeSignatures => self
                                    .sig_view
                                    .render_route(ui, session, self.current_nav.path),
                                NavGroup::Settings | NavGroup::EmployeeSettings => {
                                    if self.current_nav.path.ends_with("/appearance")
                                        || self.current_nav.path == "/admin/settings"
                                        || self.current_nav.path == "/employee/settings/system"
                                    {
                                        self.settings_view.render_appearance(
                                            ui,
                                            &mut self.is_dark_theme,
                                            &mut self.sidebar_accordion,
                                        );
                                    } else if self.current_nav.path.ends_with("/security") {
                                        self.settings_view
                                            .render_security(ui, ctx, session, &self.api)
                                    } else if self.current_nav.path.ends_with("/account") || self.current_nav.path == "/employee/settings" {
                                        match self.settings_view.render_account_header(ui, session) {
                                            1 => self.settings_view.render_security(ui, ctx, session, &self.api),
                                            2 => self.audit_logs_view.render(ui, session, &self.api),
                                            _ if session.user.role == "ADMIN" => self.settings_view.render_admin_account(ui, session),
                                            _ => self.emp_view.render_profile(ui, session, &self.api),
                                        }
                                    } else if self.current_nav.path.ends_with("/logs") {
                                        self.audit_logs_view.render(ui, session, &self.api)
                                    } else if self.current_nav.path.ends_with("/security/twosv") {
                                        ui.heading("Xác minh 2 bước (2SV)");
                                        ui.label("Chưa kết nối dịch vụ thiết lập và xác minh mã OTP. Không thể bật xác minh 2 bước tại đây.");
                                        ui.add_enabled(false, egui::Button::new("Thiết lập xác minh 2 bước"));
                                    } else {
                                        self.settings_view.render(ui, ctx, session, &self.api)
                                    }
                                }
                                NavGroup::EmployeeProfile => {
                                    ui.vertical(|ui| {
                                        self.emp_view.render_profile(ui, session, &self.api);
                                        ui.separator();
                                        self.employee_bank_accounts_view
                                            .render(ui, ctx, session, &self.api, false);
                                    });
                                }
                                NavGroup::EmployeeContracts => {
                                    self.contracts_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::EmployeeAssets => self
                                    .asset_allocations_view
                                    .render(ui, ctx, session, &self.api),
                                NavGroup::EmployeeHome => {
                                    self.emp_view.render_home(ui, session, &self.api)
                                }
                                NavGroup::EmployeeNotifications => self.notifications_view.render(
                                    ui,
                                    session,
                                    &self.api,
                                    &mut nav_change,
                                ),
                                NavGroup::EmployeePayslips => {
                                    ui.vertical(|ui| {
                                        self.emp_view.render_payslips(ui, session, &self.api);
                                        ui.separator();
                                        self.employee_bank_accounts_view
                                            .render(ui, ctx, session, &self.api, false);
                                    });
                                }
                                NavGroup::Tickets
                                    if self.current_nav.path == "/admin/tickets/incidents" =>
                                {
                                    self.helpdesk_incidents_view
                                        .render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Tickets => self
                                    .helpdesk_tickets_view
                                    .render(ui, ctx, session, &self.api),
                                NavGroup::Reports => {
                                    self.reports_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Services => {
                                    self.services_view.render(ui, ctx, session, &self.api)
                                }
                                NavGroup::Plans => {
                                    self.workflows_view
                                        .render(ui, session, self.current_nav.path)
                                }
                                NavGroup::Notifications => {
                                    if matches!(
                                        self.current_nav.path,
                                        "/admin/system/notifications"
                                            | "/admin/notifications/system"
                                            | "/admin/notifications/broadcast"
                                    ) {
                                        self.system_broadcasts_view.render(ui, session, &self.api);
                                    } else {
                                        self.notifications_view.render(
                                            ui,
                                            session,
                                            &self.api,
                                            &mut nav_change,
                                        )
                                    }
                                }
                            },
                        }
                        if compact_layout {
                            ui.add_space(76.0);
                        }
                    });

                if let Some(target) = nav_change {
                    self.current_nav = target;
                }
            });
        if was_security_screen && !self.current_nav.path.ends_with("/security") {
            self.settings_view.clear_sensitive();
        }
        if self.current_nav != navigation_before_frame {
            self.flyout_nodes.clear();
            self.flyout_close_at = None;
            self.header_menu_open = false;
        }
        if !compact_layout {
            render_navigation_flyouts(
                ctx,
                &mut self.current_nav,
                &mut self.flyout_nodes,
                &mut self.flyout_close_at,
            );
        } else {
            self.flyout_nodes.clear();
        }
        crate::visual_test::finish(ctx, self.current_nav.path, self.is_dark_theme);
    }
}

impl KiyoApp {
    pub fn restore_appearance(&mut self, storage: Option<&dyn eframe::Storage>) {
        if let Some((dark, accordion)) = storage
            .and_then(|storage| eframe::get_value::<(bool, bool)>(storage, "kiyo.appearance"))
        {
            self.is_dark_theme = dark;
            self.sidebar_accordion = accordion;
        }
    }

    pub fn with_public_file_share(token: Option<String>) -> Self {
        let mut app = Self::default();
        app.public_file_share_view = Some(PublicFileShareView::new(
            crate::models::StorageMode::KiyoCloud
                .default_endpoint()
                .to_owned(),
            token,
        ));
        app
    }

    pub fn with_activation_link(link_token: Option<String>) -> Self {
        let mut app = Self {
            show_activation: true,
            activation_view: ActivationView::with_link_token(link_token),
            ..Self::default()
        };
        app.login_view.endpoint = crate::models::StorageMode::KiyoCloud
            .default_endpoint()
            .to_owned();
        app
    }

    fn accept_session(&mut self, session: Session) {
        self.flyout_nodes.clear();
        self.flyout_close_at = None;
        self.notifications_view.reset();
        self.auth_sessions_view.reset();
        self.auth_check_notice.clear();
        self.next_auth_check_at = Some(Instant::now());
        if session.user.role == "USER" {
            self.is_employee_mode = true;
            self.current_nav = NavItem::employee_home();
        } else {
            self.is_employee_mode = false;
            self.current_nav = NavItem::admin_dashboard();
        }
        self.session = Some(session);
    }

    fn poll_auth_session(&mut self, ctx: &egui::Context) -> bool {
        let completed = self.auth_check_task.as_ref().and_then(ApiClient::poll);
        if let Some(result) = completed {
            self.auth_check_task = None;
            match result {
                Ok(AuthSessionCheck::Active(user)) => {
                    if self
                        .session
                        .as_ref()
                        .map_or(true, |session| session.user.id != user.id)
                    {
                        self.clear_authenticated_state();
                        self.login_view.error_msg =
                            "Phiên xác thực không khớp tài khoản hiện tại. Vui lòng đăng nhập lại."
                                .to_owned();
                        ctx.request_repaint();
                        return false;
                    }
                    let role_changed = self
                        .session
                        .as_ref()
                        .is_some_and(|session| session.user.role != user.role);
                    if role_changed {
                        self.is_employee_mode = user.role == "USER";
                        self.current_nav = if self.is_employee_mode {
                            NavItem::employee_home()
                        } else {
                            NavItem::admin_dashboard()
                        };
                    }
                    let Some(session) = self.session.as_mut() else {
                        return false;
                    };
                    session.user = user;
                    self.auth_check_notice.clear();
                    self.next_auth_check_at = Some(Instant::now() + Duration::from_secs(5 * 60));
                }
                Ok(AuthSessionCheck::Invalid) => {
                    self.clear_authenticated_state();
                    self.login_view.error_msg =
                        "Phiên đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.".to_owned();
                    ctx.request_repaint();
                    return false;
                }
                Ok(AuthSessionCheck::Unavailable(error)) | Err(error) => {
                    self.auth_check_notice = format!(
                        "Không thể xác minh phiên với máy chủ; vẫn giữ phiên hiện tại và sẽ thử lại. {error}"
                    );
                    self.next_auth_check_at = Some(Instant::now() + Duration::from_secs(60));
                }
            }
        }

        if self.session.is_none() {
            return false;
        }
        let due = self
            .next_auth_check_at
            .map_or(true, |deadline| Instant::now() >= deadline);
        if self.auth_check_task.is_none() && due {
            if let Some(session) = self.session.as_ref() {
                self.auth_check_task = Some(self.api.introspect_session_task(session));
                self.next_auth_check_at = Some(Instant::now() + Duration::from_secs(60));
                ctx.request_repaint();
            }
        }
        if self.auth_check_task.is_some() {
            ctx.request_repaint_after(Duration::from_millis(80));
        }
        true
    }

    fn clear_authenticated_state(&mut self) {
        self.flyout_nodes.clear();
        self.flyout_close_at = None;
        self.settings_view.clear_sensitive();
        self.dashboard_view.reset();
        self.audit_logs_view.reset();
        self.notifications_view.reset();
        self.system_broadcasts_view.reset();
        self.legacy_import_view.reset();
        self.employee_bank_import_view.reset();
        self.crm_contact_legacy_import_view.reset();
        self.finance_legacy_import_view.reset();
        self.crm_legacy_import_view.reset();
        self.helpdesk_incident_import_view.reset();
        self.helpdesk_ticket_import_view.reset();
        self.asset_items_import_view.reset();
        self.reports_catalog_import_view.reset();
        self.asset_allocations_import_view.reset();
        self.asset_transfers_import_view.reset();
        self.asset_disposals_import_view.reset();
        self.asset_depreciations_import_view.reset();
        self.asset_maintenances_import_view.reset();
        self.asset_maintenances_view.reset();
        self.asset_materials_view.reset();
        self.asset_repairs_view.reset();
        self.asset_disposals_view.reset();
        self.asset_depreciations_view.reset();
        self.helpdesk_incidents_view.reset();
        self.files_view.reset();
        self.ins_view.reset();
        self.users_view.reset();
        self.auth_sessions_view.reset();
        self.employees_view.reset();
        self.employee_proposals_view.reset();
        self.employee_bank_accounts_view.reset();
        self.tasks_view.reset();
        self.attendance_view = AttendanceView::default();
        self.assets_view = AssetsView::default();
        self.asset_system_view.reset();
        self.administration_view.reset();
        self.asset_todo_view.reset();
        self.document_overview_view.reset();
        self.contracts_view = ContractsView::default();
        self.rooms_view = MeetingRoomsView::default();
        self.services_view.reset();
        self.hr_overview_view.reset();
        self.documents_view.reset();
        self.helpdesk_tickets_view.reset();
        self.hr_training_view.reset();
        self.hr_certificates_view.reset();
        self.hr_employee_history_view.reset();
        self.hr_headcount_view.reset();
        self.hr_uniforms_view.reset();
        self.hr_onboarding_view.reset();
        self.hr_performance_reviews_view.reset();
        self.hr_recruitment_view.reset();
        self.hr_rewards_view.reset();
        self.crm_view.reset();
        self.crm_operations_view.reset();
        self.plan_milestones_view.reset();
        self.plan_okrs_view.reset();
        self.plan_progress_view.reset();
        self.plan_reports_view.reset();
        self.reports_view.reset();
        self.plans_view.reset();
        self.org_units_view.reset();
        self.sig_view = SignaturesView::default();
        self.emp_view.reset();
        self.activation_view.clear_sensitive();
        self.auth_check_task = None;
        self.next_auth_check_at = None;
        self.auth_check_notice.clear();
        self.header_menu_open = false;
        self.notifications_menu_open = false;
        self.session = None;
    }
}

fn render_legacy_brand(ui: &mut egui::Ui, employee: bool, collapsed: bool) -> bool {
    let p = crate::theme::palette(ui.visuals().dark_mode);
    let (rect, response) =
        ui.allocate_exact_size(Vec2::new(ui.available_width(), 48.0), egui::Sense::click());
    crate::visual_test::record("sidebar.brand", rect);
    let logo_rect = egui::Rect::from_min_size(
        egui::pos2(
            rect.left() + if collapsed { 24.0 } else { 16.0 },
            rect.top() + 10.0,
        ),
        Vec2::splat(28.0),
    );
    ui.painter().rect_filled(
        logo_rect,
        6.0,
        if employee || ui.visuals().dark_mode {
            crate::theme::PRIMARY
        } else {
            Color32::from_rgb(24, 24, 27)
        },
    );
    ui.painter().text(
        logo_rect.center(),
        egui::Align2::CENTER_CENTER,
        if employee { "E" } else { "K" },
        egui::FontId::proportional(14.0),
        Color32::WHITE,
    );
    if !collapsed {
        ui.painter().text(
            egui::pos2(logo_rect.right() + 10.0, rect.top() + 7.0),
            egui::Align2::LEFT_TOP,
            if employee {
                "CỔNG NHÂN VIÊN"
            } else {
                "KIYOVN"
            },
            egui::FontId::proportional(13.5),
            p.text,
        );
        ui.painter().text(
            egui::pos2(logo_rect.right() + 10.0, rect.top() + 24.0),
            egui::Align2::LEFT_TOP,
            if employee {
                "Self-Service Portal"
            } else {
                "Quản trị Doanh nghiệp"
            },
            egui::FontId::proportional(10.5),
            p.muted,
        );
    }
    ui.painter().line_segment(
        [
            egui::pos2(rect.left(), rect.bottom() - 0.5),
            egui::pos2(rect.right(), rect.bottom() - 0.5),
        ],
        egui::Stroke::new(1.0, p.border),
    );
    response
        .on_hover_cursor(egui::CursorIcon::PointingHand)
        .clicked()
}

fn header_menu_button(
    ui: &mut egui::Ui,
    ctx: &egui::Context,
    textures: &mut HashMap<NavigationIcon, egui::TextureHandle>,
    collapsed: bool,
) -> bool {
    let (rect, response) = ui.allocate_exact_size(Vec2::splat(28.0), egui::Sense::click());
    crate::visual_test::record("header.menu", rect);
    if response.hovered() {
        ui.painter()
            .rect_filled(rect.shrink(1.0), 4.0, Color32::from_rgb(243, 244, 246));
    }
    paint_svg_nav_icon(
        ctx,
        textures,
        ui.painter(),
        rect.center(),
        if collapsed {
            NavigationIcon::MenuUnfoldOutlined
        } else {
            NavigationIcon::MenuFoldOutlined
        },
        Color32::from_rgb(117, 117, 117),
        16.0,
    );
    response
        .on_hover_cursor(egui::CursorIcon::PointingHand)
        .clicked()
}

fn header_notification_button(
    ui: &mut egui::Ui,
    ctx: &egui::Context,
    textures: &mut HashMap<NavigationIcon, egui::TextureHandle>,
    unread: usize,
    open: bool,
) -> egui::Response {
    let (rect, response) = ui.allocate_exact_size(Vec2::splat(32.0), egui::Sense::click());
    crate::visual_test::record("header.notifications", rect);
    let icon_color = if open {
        Color32::from_rgb(0, 150, 136)
    } else {
        Color32::from_rgb(117, 117, 117)
    };
    if response.hovered() || open {
        ui.painter()
            .rect_filled(rect.shrink(1.0), 4.0, Color32::from_rgb(243, 244, 246));
    }
    paint_svg_nav_icon(
        ctx,
        textures,
        ui.painter(),
        rect.center(),
        NavigationIcon::BellOutlined,
        icon_color,
        17.0,
    );
    if unread > 0 {
        let label = if unread > 99 {
            "99+".to_owned()
        } else {
            unread.to_string()
        };
        let badge_width = (label.chars().count() as f32 * 5.2 + 6.0).max(15.0);
        let badge = egui::Rect::from_min_size(
            egui::pos2(rect.right() - badge_width - 1.0, rect.top() + 1.0),
            Vec2::new(badge_width, 15.0),
        );
        ui.painter()
            .rect_filled(badge, 8.0, Color32::from_rgb(239, 68, 68));
        ui.painter()
            .rect_stroke(badge, 8.0, egui::Stroke::new(1.5, Color32::WHITE));
        ui.painter().text(
            badge.center(),
            egui::Align2::CENTER_CENTER,
            label,
            egui::FontId::proportional(9.0),
            Color32::WHITE,
        );
    }
    response.on_hover_text(if unread == 0 {
        "Thông báo".to_owned()
    } else {
        format!("Thông báo ({unread})")
    })
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct HeaderUserLayout {
    width: f32,
    avatar_size: f32,
    avatar_left_inset: f32,
    show_name: bool,
}

fn header_user_layout(name_width: f32, compact_layout: bool) -> HeaderUserLayout {
    HeaderUserLayout {
        width: if compact_layout {
            32.0
        } else {
            name_width + 52.0
        },
        avatar_size: 28.0,
        avatar_left_inset: if compact_layout { 2.0 } else { 8.0 },
        show_name: !compact_layout,
    }
}

fn header_user_button(
    ui: &mut egui::Ui,
    ctx: &egui::Context,
    textures: &mut HashMap<NavigationIcon, egui::TextureHandle>,
    name: &str,
    role: &str,
    mode: &str,
    compact_layout: bool,
) -> bool {
    let text_color = if ui.visuals().dark_mode {
        crate::theme::palette(true).text
    } else {
        Color32::from_rgb(17, 24, 39)
    };
    let galley = ui.painter().layout_no_wrap(
        name.to_owned(),
        egui::FontId::proportional(13.0),
        text_color,
    );
    let layout = header_user_layout(galley.size().x, compact_layout);
    let (rect, response) = ui.allocate_exact_size(
        Vec2::new(layout.width, if compact_layout { 32.0 } else { 36.0 }),
        egui::Sense::click(),
    );
    crate::visual_test::record("header.user", rect);
    if response.hovered() {
        ui.painter()
            .rect_filled(rect.shrink(1.0), 4.0, Color32::from_rgb(243, 244, 246));
    }
    let avatar = egui::Rect::from_min_size(
        egui::pos2(
            rect.left() + layout.avatar_left_inset,
            rect.center().y - layout.avatar_size / 2.0,
        ),
        Vec2::splat(layout.avatar_size),
    );
    ui.painter()
        .rect_filled(avatar, 4.0, Color32::from_rgb(24, 24, 27));
    paint_svg_nav_icon(
        ctx,
        textures,
        ui.painter(),
        avatar.center(),
        NavigationIcon::UserOutlined,
        Color32::WHITE,
        13.0,
    );
    if layout.show_name {
        ui.painter().galley(
            egui::pos2(
                avatar.right() + 8.0,
                rect.center().y - galley.size().y / 2.0,
            ),
            galley,
            text_color,
        );
    }
    response
        .on_hover_text(format!("{name} ({role}) · {mode}"))
        .clicked()
}

const COMPACT_LAYOUT_MAX_WIDTH: f32 = 992.0;
const MOBILE_DRAWER_SMALL_WIDTH: f32 = 260.0;
const MOBILE_DRAWER_TABLET_WIDTH: f32 = 270.0;
const MOBILE_DRAWER_SMALL_BREAKPOINT: f32 = 768.0;

fn is_compact_layout(width: f32) -> bool {
    width <= COMPACT_LAYOUT_MAX_WIDTH
}

fn mobile_navigation_drawer_rect(screen: egui::Rect) -> egui::Rect {
    let legacy_width = if screen.width() <= MOBILE_DRAWER_SMALL_BREAKPOINT {
        MOBILE_DRAWER_SMALL_WIDTH
    } else {
        MOBILE_DRAWER_TABLET_WIDTH
    };
    egui::Rect::from_min_size(
        screen.min,
        Vec2::new(legacy_width.min(screen.width()), screen.height()),
    )
}

fn show_mobile_bottom_bar<R>(ctx: &egui::Context, contents: impl FnOnce(&mut egui::Ui) -> R) -> R {
    let screen = ctx.screen_rect();
    egui::Area::new(egui::Id::new("mobile_bottom_navigation"))
        .order(egui::Order::Middle)
        .constrain(false)
        .fixed_pos(egui::pos2(screen.left(), screen.bottom() - 56.0))
        .default_size(egui::vec2(screen.width(), 56.0))
        .show(ctx, |ui| {
            egui::Frame::none()
                .fill(Color32::WHITE)
                .shadow(egui::epaint::Shadow {
                    offset: egui::vec2(0.0, -2.0),
                    blur: 10.0,
                    spread: 0.0,
                    color: Color32::from_black_alpha(13),
                })
                .show(ui, |ui| {
                    ui.set_width(screen.width());
                    ui.set_min_height(56.0);
                    contents(ui)
                })
                .inner
        })
        .inner
}

fn show_mobile_navigation_drawer(
    ctx: &egui::Context,
    drawer_rect: egui::Rect,
    add_contents: impl FnOnce(&mut egui::Ui),
) -> egui::Rect {
    let response = egui::Area::new(egui::Id::new("mobile_navigation_drawer"))
        .order(egui::Order::Foreground)
        .fixed_pos(drawer_rect.min)
        .default_size(drawer_rect.size())
        .constrain(false)
        .show(ctx, |ui| {
            ui.set_min_size(drawer_rect.size());
            ui.set_max_size(drawer_rect.size());
            ui.painter().add(
                egui::Shadow {
                    offset: Vec2::new(4.0, 0.0),
                    blur: 24.0,
                    spread: 0.0,
                    color: Color32::from_black_alpha(46),
                }
                .as_shape(drawer_rect, 0.0),
            );
            ui.painter()
                .rect_filled(drawer_rect, 0.0, Color32::from_rgb(245, 245, 245));
            ui.painter().rect_stroke(
                drawer_rect,
                0.0,
                egui::Stroke::new(1.0, Color32::from_rgb(224, 224, 224)),
            );
            ui.allocate_ui_with_layout(
                drawer_rect.size(),
                Layout::top_down(egui::Align::Min),
                add_contents,
            );
        });
    response.response.rect
}

fn notification_nav_item(user_role: &str) -> NavItem {
    if user_role == "ADMIN" {
        NavItem::new(
            "notif-my",
            "Thông báo của tôi",
            "/admin/notifications/my",
            "🔔",
            NavGroup::Notifications,
        )
    } else {
        NavItem::new(
            "emp-notifications",
            "Thông báo",
            "/employee/notifications",
            "🔔",
            NavGroup::EmployeeNotifications,
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MobileBottomAction {
    None,
    Navigate(NavItem),
    ToggleMenu,
}

fn render_mobile_drawer_brand(ui: &mut egui::Ui, is_employee_mode: bool) {
    ui.horizontal_centered(|ui| {
        ui.add_space(16.0);
        let (logo_rect, _) = ui.allocate_exact_size(Vec2::splat(28.0), egui::Sense::hover());
        ui.painter().rect_filled(
            logo_rect,
            6.0,
            if is_employee_mode {
                Color32::from_rgb(0, 150, 136)
            } else {
                Color32::from_rgb(24, 24, 27)
            },
        );
        ui.painter().text(
            logo_rect.center(),
            egui::Align2::CENTER_CENTER,
            if is_employee_mode { "E" } else { "K" },
            egui::FontId::proportional(14.0),
            Color32::WHITE,
        );
        ui.add_space(10.0);
        ui.vertical(|ui| {
            ui.label(
                RichText::new(if is_employee_mode {
                    "CỔNG NHÂN VIÊN"
                } else {
                    "KIYOVN"
                })
                .size(13.5)
                .strong()
                .color(Color32::from_rgb(15, 23, 42)),
            );
            ui.label(
                RichText::new(if is_employee_mode {
                    "Self-Service Portal"
                } else {
                    "Quản trị Doanh nghiệp"
                })
                .size(10.5)
                .color(Color32::from_rgb(100, 116, 139)),
            );
        });
    });
}

fn render_mobile_bottom_navigation(
    ctx: &egui::Context,
    ui: &mut egui::Ui,
    is_employee_mode: bool,
    menu_open: bool,
    current_nav: NavItem,
    icon_textures: &mut HashMap<NavigationIcon, egui::TextureHandle>,
) -> MobileBottomAction {
    let tree = if is_employee_mode {
        EMPLOYEE_NAV_TREE
    } else {
        ADMIN_NAV_TREE
    };
    let shortcuts: [(Option<NavItem>, &str, NavigationIcon); 5] = if is_employee_mode {
        [
            (
                find_nav_item_by_path(tree, "/employee/home"),
                "Trang chủ",
                NavigationIcon::HomeOutlined,
            ),
            (
                find_nav_item_by_path(tree, "/employee/tasks"),
                "Nhiệm vụ",
                NavigationIcon::CheckSquareOutlined,
            ),
            (
                find_nav_item_by_path(tree, "/employee/proposals"),
                "Kiến nghị",
                NavigationIcon::FormOutlined,
            ),
            (
                find_nav_item_by_path(tree, "/employee/profile"),
                "Hồ sơ",
                NavigationIcon::UserOutlined,
            ),
            (None, "Danh mục", NavigationIcon::MenuOutlined),
        ]
    } else {
        [
            (
                find_nav_item_by_path(tree, "/admin/dashboard"),
                "Tổng quan",
                NavigationIcon::DashboardOutlined,
            ),
            (
                find_nav_item_by_path(tree, "/admin/hr/employees"),
                "Nhân sự",
                NavigationIcon::TeamOutlined,
            ),
            (
                find_nav_item_by_path(tree, "/admin/workflows/requests"),
                "Duyệt",
                NavigationIcon::CheckSquareOutlined,
            ),
            (
                find_nav_item_by_path(tree, "/admin/files"),
                "Tài liệu",
                NavigationIcon::FolderOpenOutlined,
            ),
            (None, "Danh mục", NavigationIcon::MenuOutlined),
        ]
    };

    let available_width = ui.available_width();
    let (bar_rect, _) =
        ui.allocate_exact_size(Vec2::new(available_width, 56.0), egui::Sense::hover());
    let painter = ui.painter().clone();
    painter.line_segment(
        [bar_rect.left_top(), bar_rect.right_top()],
        egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)),
    );
    let item_width = bar_rect.width() / shortcuts.len() as f32;
    let mut action = MobileBottomAction::None;

    for (index, (nav_item, label, icon)) in shortcuts.into_iter().enumerate() {
        let item_rect = egui::Rect::from_min_max(
            egui::pos2(bar_rect.left() + index as f32 * item_width, bar_rect.top()),
            egui::pos2(
                bar_rect.left() + (index + 1) as f32 * item_width,
                bar_rect.bottom(),
            ),
        );
        let response = ui.interact(
            item_rect,
            egui::Id::new(("mobile_bottom_navigation", index)),
            egui::Sense::click(),
        );
        let is_menu = nav_item.is_none();
        let is_active = if is_menu {
            menu_open
        } else {
            let path = current_nav.path;
            match index {
                0 => path == "/admin/dashboard" || path == "/employee/home",
                1 if is_employee_mode => path.starts_with("/employee/tasks"),
                1 => path.starts_with("/admin/hr"),
                2 if is_employee_mode => path.starts_with("/employee/proposals"),
                2 => path.starts_with("/admin/workflows/requests"),
                3 if is_employee_mode => path.starts_with("/employee/profile"),
                3 => path.starts_with("/admin/files") || path.starts_with("/files"),
                _ => false,
            }
        };
        let color = if is_active {
            Color32::from_rgb(0, 150, 136)
        } else {
            Color32::from_rgb(100, 116, 139)
        };
        let icon_center = egui::pos2(item_rect.center().x, item_rect.top() + 16.0);
        paint_svg_nav_icon(ctx, icon_textures, &painter, icon_center, icon, color, 18.0);
        painter.text(
            egui::pos2(item_rect.center().x, item_rect.top() + 42.0),
            egui::Align2::CENTER_CENTER,
            label,
            egui::FontId::proportional(10.5),
            color,
        );

        if response.clicked() {
            action = if is_menu {
                MobileBottomAction::ToggleMenu
            } else if let Some(nav_item) = nav_item {
                MobileBottomAction::Navigate(nav_item)
            } else {
                MobileBottomAction::None
            };
        }
    }
    action
}

fn find_nav_item_by_path(nodes: &[NavNode], path: &str) -> Option<NavItem> {
    let path = match path {
        "/admin/plans" | "/admin/plans/tasks" => "/admin/tasks",
        "/admin/plans/projects" | "/admin/plans/okr" => "/admin/plans/roadmap",
        _ => path,
    };
    for node in nodes {
        if node.item.path == path {
            return Some(node.item);
        }
        if let Some(item) = find_nav_item_by_path(node.children, path) {
            return Some(item);
        }
    }
    None
}

fn expand_active_nav_ancestors(
    nodes: &[NavNode],
    target: NavItem,
    expanded_nav_nodes: &mut std::collections::HashSet<&'static str>,
) -> bool {
    for node in nodes {
        if node.item == target {
            if !node.children.is_empty() {
                expanded_nav_nodes.insert(node.item.id);
            }
            return true;
        }
        if expand_active_nav_ancestors(node.children, target, expanded_nav_nodes) {
            expanded_nav_nodes.insert(node.item.id);
            return true;
        }
    }
    false
}

#[derive(Clone, Copy)]
struct NavigationFlyout {
    node: &'static NavNode,
    anchor: egui::Rect,
}

fn render_desktop_navigation(
    ctx: &egui::Context,
    ui: &mut egui::Ui,
    employee: bool,
    collapsed: bool,
    current: &mut NavItem,
    flyouts: &mut Vec<NavigationFlyout>,
    icons: &mut HashMap<NavigationIcon, egui::TextureHandle>,
) {
    let tree = if employee {
        EMPLOYEE_NAV_TREE
    } else {
        ADMIN_NAV_TREE
    };
    egui::ScrollArea::vertical().show(ui, |ui| {
        ui.spacing_mut().item_spacing = Vec2::ZERO;
        // The CSS sidebar border occupies one pixel of the 220/80px box.
        ui.set_width((ui.available_width() - 1.0).max(1.0));
        for node in crate::navigation_order::ordered(tree) {
            let open = flyouts
                .first()
                .is_some_and(|f| f.node.item.id == node.item.id);
            let response =
                navigation_row(ctx, ui, node, 0, *current, open, collapsed, false, icons);
            if response.hovered() || response.clicked() {
                if node.children.is_empty() {
                    flyouts.clear();
                    if response.clicked() {
                        *current = node.item;
                    }
                } else if !open {
                    flyouts.clear();
                    flyouts.push(NavigationFlyout {
                        node,
                        anchor: response.rect,
                    });
                }
            }
        }
        ui.add_space(24.0);
    });
}

fn navigation_row(
    ctx: &egui::Context,
    ui: &mut egui::Ui,
    node: &NavNode,
    depth: usize,
    current: NavItem,
    open: bool,
    collapsed: bool,
    flyout: bool,
    icons: &mut HashMap<NavigationIcon, egui::TextureHandle>,
) -> egui::Response {
    let p = crate::theme::palette(ui.visuals().dark_mode);
    let (allocation, _) = ui.allocate_exact_size(
        Vec2::new(ui.available_width().max(1.0), 36.0),
        egui::Sense::hover(),
    );
    let rect = if flyout {
        allocation.shrink2(Vec2::new(0.0, 1.0))
    } else {
        allocation.shrink2(Vec2::new(6.0, 1.0))
    };
    let response = ui.interact(
        rect,
        ui.id().with(("navigation-row", node.item.id)),
        egui::Sense::click(),
    );
    crate::visual_test::record(&format!("nav.{}", node.item.id), rect);
    response.widget_info(|| {
        egui::WidgetInfo::selected(
            egui::WidgetType::SelectableLabel,
            true,
            nav_node_contains(node, current),
            node.item.label(),
        )
    });
    let active = nav_node_contains(node, current);
    if open || response.hovered() {
        ui.painter().rect_filled(rect, 6.0, p.hovered);
    } else if active {
        ui.painter().rect_filled(rect, 6.0, p.selected);
    }
    let color = if active { p.selected_text } else { p.text };
    let text_left = if flyout {
        rect.left() + 10.0
    } else if depth == 0 {
        paint_svg_nav_icon(
            ctx,
            icons,
            ui.painter(),
            egui::pos2(rect.left() + 20.0, rect.center().y),
            NavigationIcon::for_group(node.item.group),
            if active {
                p.selected_text
            } else {
                Color32::from_rgb(85, 85, 85)
            },
            16.0,
        );
        rect.left() + 38.0
    } else {
        rect.left() + 24.0 + (depth - 1) as f32 * 12.0
    };
    if !collapsed {
        let text_rect = egui::Rect::from_min_max(
            egui::pos2(text_left, rect.top()),
            egui::pos2(
                rect.right() - if node.children.is_empty() { 4.0 } else { 20.0 },
                rect.bottom(),
            ),
        );
        ui.painter()
            .with_clip_rect(text_rect.intersect(ui.clip_rect()))
            .text(
                egui::pos2(text_left, rect.center().y),
                egui::Align2::LEFT_CENTER,
                node.item.label(),
                egui::FontId::proportional(if depth == 0 && !flyout { 13.5 } else { 13.0 }),
                color,
            );
        if !node.children.is_empty() {
            let center = egui::pos2(rect.right() - 12.5, rect.center().y);
            let color = if active {
                p.selected_text
            } else {
                Color32::from_rgb(148, 163, 184)
            };
            let points = if open && !flyout && is_compact_layout(ctx.screen_rect().width()) {
                vec![
                    center + Vec2::new(-3.0, -1.5),
                    center + Vec2::new(0.0, 1.5),
                    center + Vec2::new(3.0, -1.5),
                ]
            } else {
                vec![
                    center + Vec2::new(-1.5, -3.0),
                    center + Vec2::new(1.5, 0.0),
                    center + Vec2::new(-1.5, 3.0),
                ]
            };
            ui.painter()
                .add(egui::Shape::line(points, egui::Stroke::new(1.1, color)));
        }
    }
    response.on_hover_cursor(egui::CursorIcon::PointingHand)
}

fn render_navigation_flyouts(
    ctx: &egui::Context,
    current: &mut NavItem,
    flyouts: &mut Vec<NavigationFlyout>,
    close_at: &mut Option<Instant>,
) {
    if flyouts.is_empty() {
        *close_at = None;
        return;
    }
    let p = crate::theme::palette(ctx.style().visuals.dark_mode);
    let screen = ctx.screen_rect();
    let pointer = ctx.input(|i| i.pointer.hover_pos());
    let mut pointer_inside = pointer.is_some_and(|v| flyouts.iter().any(|f| f.anchor.contains(v)));
    let mut navigate = None;
    let mut level = 0;
    while level < flyouts.len() && level < 4 {
        let entry = flyouts[level];
        let width = 230.0_f32.min((screen.width() - 20.0).max(1.0));
        let height = entry.node.children.len() as f32 * 36.0 + 51.0;
        let x = if entry.anchor.right() + 4.0 + width > screen.right() {
            (entry.anchor.left() - width - 4.0).max(screen.left() + 10.0)
        } else {
            entry.anchor.right() + 4.0
        };
        let y = if entry.anchor.top() - 6.0 + height > screen.bottom() {
            (screen.bottom() - height - 20.0).max(screen.top() + 10.0)
        } else {
            entry.anchor.top() - 6.0
        };
        let mut hover_child = None;
        let area = egui::Area::new(egui::Id::new((
            "legacy-navigation-flyout",
            level,
            entry.node.item.id,
        )))
        .default_size(Vec2::new(width, height))
        .order(egui::Order::Foreground)
        .fixed_pos(egui::pos2(x, y))
        .show(ctx, |ui| {
            ui.spacing_mut().item_spacing = Vec2::ZERO;
            egui::Frame::none()
                .fill(p.surface)
                .stroke(egui::Stroke::new(1.0, p.border))
                .rounding(8.0)
                .shadow(egui::epaint::Shadow {
                    offset: Vec2::new(0.0, 4.0),
                    blur: 16.0,
                    spread: 0.0,
                    color: Color32::from_black_alpha(20),
                })
                .inner_margin(7.0)
                .show(ui, |ui| {
                    ui.set_width((width - 14.0).max(1.0));
                    egui::ScrollArea::vertical()
                        .max_height((screen.height() - 54.0).max(1.0))
                        .show(ui, |ui| {
                            let (title, _) = ui.allocate_exact_size(
                                Vec2::new(ui.available_width(), 33.0),
                                egui::Sense::hover(),
                            );
                            ui.painter().text(
                                egui::pos2(title.left() + 10.0, title.top() + 8.0),
                                egui::Align2::LEFT_TOP,
                                entry.node.item.label(),
                                egui::FontId::proportional(12.5),
                                Color32::from_rgb(100, 116, 139),
                            );
                            ui.painter().line_segment(
                                [title.left_bottom(), title.right_bottom()],
                                egui::Stroke::new(
                                    1.0,
                                    if ui.visuals().dark_mode {
                                        p.border
                                    } else {
                                        Color32::from_rgb(240, 240, 240)
                                    },
                                ),
                            );
                            ui.add_space(4.0);
                            for child in crate::navigation_order::ordered(entry.node.children) {
                                let active = nav_node_contains(child, *current);
                                let open = flyouts
                                    .get(level + 1)
                                    .is_some_and(|f| f.node.item.id == child.item.id);
                                let (allocation, _) = ui.allocate_exact_size(
                                    Vec2::new(ui.available_width(), 36.0),
                                    egui::Sense::hover(),
                                );
                                let rect = allocation.shrink2(Vec2::new(0.0, 1.0));
                                let response = ui.interact(
                                    rect,
                                    ui.id().with(child.item.id),
                                    egui::Sense::click(),
                                );
                                crate::visual_test::record(&format!("nav.{}", child.item.id), rect);
                                response.widget_info(|| {
                                    egui::WidgetInfo::selected(
                                        egui::WidgetType::SelectableLabel,
                                        true,
                                        active,
                                        child.item.label(),
                                    )
                                });
                                if open || response.hovered() {
                                    ui.painter().rect_filled(rect, 6.0, p.sidebar);
                                } else if active {
                                    ui.painter().rect_filled(rect, 6.0, p.selected);
                                }
                                let color = if active { p.selected_text } else { p.text };
                                let text_clip = egui::Rect::from_min_max(
                                    rect.min + Vec2::new(10.0, 0.0),
                                    rect.max - Vec2::new(22.0, 0.0),
                                );
                                ui.painter()
                                    .with_clip_rect(text_clip.intersect(ui.clip_rect()))
                                    .text(
                                        egui::pos2(rect.left() + 10.0, rect.center().y),
                                        egui::Align2::LEFT_CENTER,
                                        child.item.label(),
                                        egui::FontId::proportional(13.0),
                                        color,
                                    );
                                if !child.children.is_empty() {
                                    let c = egui::pos2(rect.right() - 12.5, rect.center().y);
                                    ui.painter().add(egui::Shape::line(
                                        vec![
                                            c + Vec2::new(-1.5, -3.0),
                                            c + Vec2::new(1.5, 0.0),
                                            c + Vec2::new(-1.5, 3.0),
                                        ],
                                        egui::Stroke::new(1.1, color),
                                    ));
                                }
                                if response.hovered() || response.clicked() {
                                    hover_child = Some((child, rect));
                                }
                                if response.clicked() && child.children.is_empty() {
                                    navigate = Some(child.item);
                                }
                            }
                        });
                });
        });
        crate::visual_test::record(&format!("flyout.{level}"), area.response.rect);
        pointer_inside |= pointer.is_some_and(|pos| area.response.rect.contains(pos));
        if let Some((child, anchor)) = hover_child {
            if child.children.is_empty() {
                flyouts.truncate(level + 1);
            } else if !flyouts
                .get(level + 1)
                .is_some_and(|f| f.node.item.id == child.item.id)
            {
                flyouts.truncate(level + 1);
                flyouts.push(NavigationFlyout {
                    node: child,
                    anchor,
                });
            }
        }
        level += 1;
    }
    if let Some(target) = navigate {
        *current = target;
        flyouts.clear();
        *close_at = None;
        return;
    }
    if pointer_inside {
        *close_at = None;
    } else {
        let deadline = close_at.get_or_insert_with(|| Instant::now() + Duration::from_millis(160));
        if Instant::now() >= *deadline || ctx.input(|i| i.pointer.any_click()) {
            flyouts.clear();
            *close_at = None;
        } else {
            ctx.request_repaint_after(Duration::from_millis(16));
        }
    }
}

fn render_navigation(
    ctx: &egui::Context,
    ui: &mut egui::Ui,
    is_employee_mode: bool,
    _mode_label: &str,
    current_nav: &mut NavItem,
    expanded_nav_nodes: &mut HashSet<&'static str>,
    icon_textures: &mut HashMap<NavigationIcon, egui::TextureHandle>,
) {
    egui::ScrollArea::vertical().show(ui, |ui| {
        ui.spacing_mut().item_spacing = Vec2::ZERO;
        let items = if is_employee_mode {
            EMPLOYEE_NAV_TREE
        } else {
            ADMIN_NAV_TREE
        };
        for node in crate::navigation_order::ordered(items) {
            render_nav_node(
                ctx,
                ui,
                node,
                0,
                current_nav,
                expanded_nav_nodes,
                icon_textures,
            );
        }
    });
}

fn render_nav_node(
    ctx: &egui::Context,
    ui: &mut egui::Ui,
    node: &NavNode,
    depth: usize,
    current_nav: &mut NavItem,
    expanded_nav_nodes: &mut HashSet<&'static str>,
    icon_textures: &mut HashMap<NavigationIcon, egui::TextureHandle>,
) {
    let expanded = !node.children.is_empty() && expanded_nav_nodes.contains(node.item.id);
    let response = navigation_row(
        ctx,
        ui,
        node,
        depth,
        *current_nav,
        expanded,
        false,
        false,
        icon_textures,
    );
    if response.clicked() {
        if node.children.is_empty() {
            *current_nav = node.item;
        } else {
            if expanded {
                expanded_nav_nodes.remove(node.item.id);
            } else {
                expanded_nav_nodes.insert(node.item.id);
            }
        }
    }
    if expanded {
        for child in crate::navigation_order::ordered(node.children) {
            render_nav_node(
                ctx,
                ui,
                child,
                depth + 1,
                current_nav,
                expanded_nav_nodes,
                icon_textures,
            );
        }
    }
}

fn paint_svg_nav_icon(
    ctx: &egui::Context,
    icon_textures: &mut HashMap<NavigationIcon, egui::TextureHandle>,
    painter: &egui::Painter,
    center: egui::Pos2,
    icon: NavigationIcon,
    color: Color32,
    size: f32,
) {
    let rect = egui::Rect::from_center_size(center, Vec2::splat(size));
    if !icon_textures.contains_key(&icon) {
        match egui_extras::image::load_svg_bytes(icon.svg_bytes()) {
            Ok(image) => {
                icon_textures.insert(
                    icon,
                    ctx.load_texture(icon.name(), image, egui::TextureOptions::LINEAR),
                );
            }
            Err(_) => {
                paint_nav_icon_approximation(painter, center, icon.fallback_group(), color);
                return;
            }
        }
    }
    if let Some(texture) = icon_textures.get(&icon) {
        painter.image(
            texture.id(),
            rect,
            egui::Rect::from_min_max(egui::Pos2::ZERO, egui::pos2(1.0, 1.0)),
            color,
        );
    }
}

fn paint_nav_icon_approximation(
    painter: &egui::Painter,
    center: egui::Pos2,
    group: NavGroup,
    color: Color32,
) {
    let stroke = egui::Stroke::new(1.35, color);
    let point = |x: f32, y: f32| egui::pos2(center.x + x, center.y + y);
    let line = |points: &[(f32, f32)]| {
        painter.add(egui::Shape::line(
            points.iter().map(|(x, y)| point(*x, *y)).collect(),
            stroke,
        ));
    };
    let outline = |rect: egui::Rect, rounding: f32| {
        painter.rect_stroke(rect, rounding, stroke);
    };

    match group {
        NavGroup::Dashboard => {
            painter.circle_stroke(center, 6.0, stroke);
            line(&[(-5.0, 3.0), (5.0, 3.0)]);
            line(&[(0.0, 2.0), (3.5, -2.0)]);
            painter.circle_filled(center, 1.0, color);
        }
        NavGroup::Chat => {
            outline(
                egui::Rect::from_center_size(center, Vec2::new(13.0, 10.0)),
                2.5,
            );
            line(&[(-3.5, 5.0), (-5.0, 7.0), (0.0, 5.0)]);
            painter.circle_filled(point(-3.0, 0.0), 0.7, color);
            painter.circle_filled(point(0.0, 0.0), 0.7, color);
            painter.circle_filled(point(3.0, 0.0), 0.7, color);
        }
        NavGroup::Business => {
            line(&[(-7.0, -2.0), (0.0, -7.0), (7.0, -2.0)]);
            line(&[(-6.0, 0.0), (6.0, 0.0)]);
            line(&[(-6.0, 6.0), (6.0, 6.0)]);
            for x in [-4.0, 0.0, 4.0] {
                line(&[(x, 0.0), (x, 5.0)]);
            }
        }
        NavGroup::Hr | NavGroup::EmployeeProfile => {
            painter.circle_stroke(point(0.0, -3.0), 2.5, stroke);
            line(&[
                (-6.0, 6.0),
                (-5.0, 3.5),
                (-3.0, 2.0),
                (0.0, 1.5),
                (3.0, 2.0),
                (5.0, 3.5),
                (6.0, 6.0),
            ]);
        }
        NavGroup::Insurance => {
            line(&[
                (0.0, -7.0),
                (6.0, -5.0),
                (5.0, 1.0),
                (3.0, 4.0),
                (0.0, 7.0),
                (-3.0, 4.0),
                (-5.0, 1.0),
                (-6.0, -5.0),
                (0.0, -7.0),
            ]);
            line(&[(-2.5, 0.0), (-0.5, 2.0), (3.0, -2.0)]);
        }
        NavGroup::Attendance => {
            painter.circle_stroke(center, 6.0, stroke);
            line(&[(0.0, -3.5), (0.0, 0.0), (3.0, 1.5)]);
        }
        NavGroup::Crm => {
            painter.circle_stroke(point(-2.5, -2.5), 2.2, stroke);
            painter.circle_stroke(point(3.0, -1.5), 1.8, stroke);
            line(&[
                (-7.0, 5.5),
                (-6.0, 2.5),
                (-3.5, 1.0),
                (0.0, 1.0),
                (2.0, 2.5),
            ]);
            line(&[(1.0, 3.0), (3.0, 1.5), (5.5, 2.0), (7.0, 5.5)]);
        }
        NavGroup::Finance | NavGroup::EmployeePayslips => {
            painter.circle_stroke(center, 6.5, stroke);
            painter.text(
                center,
                egui::Align2::CENTER_CENTER,
                "$",
                egui::FontId::proportional(11.0),
                color,
            );
        }
        NavGroup::Assets | NavGroup::EmployeeAssets => {
            outline(
                egui::Rect::from_center_size(point(0.0, 1.0), Vec2::new(13.0, 10.0)),
                2.0,
            );
            line(&[(-3.0, -4.0), (-3.0, -6.0), (3.0, -6.0), (3.0, -4.0)]);
            line(&[(-6.0, 0.0), (6.0, 0.0)]);
        }
        NavGroup::Workflows => {
            line(&[(-4.0, -5.0), (-4.0, 0.0), (4.0, 0.0), (4.0, 5.0)]);
            for p in [point(-4.0, -5.0), point(-4.0, 0.0), point(4.0, 5.0)] {
                painter.circle_filled(p, 2.0, color);
            }
            painter.circle_stroke(point(4.0, 0.0), 2.0, stroke);
        }
        NavGroup::MeetingRooms => {
            outline(
                egui::Rect::from_center_size(point(0.0, -1.0), Vec2::new(14.0, 10.0)),
                1.5,
            );
            line(&[(0.0, 4.0), (0.0, 6.0), (-4.0, 6.0), (4.0, 6.0)]);
        }
        NavGroup::Services => {
            line(&[(-7.0, -2.0), (-5.0, -6.0), (5.0, -6.0), (7.0, -2.0)]);
            line(&[(-7.0, -2.0), (7.0, -2.0)]);
            line(&[(-6.0, 0.0), (-6.0, 6.0), (6.0, 6.0), (6.0, 0.0)]);
            line(&[(-1.5, 6.0), (-1.5, 1.0), (2.0, 1.0), (2.0, 6.0)]);
        }
        NavGroup::Documents | NavGroup::EmployeeContracts => {
            line(&[
                (-4.0, -7.0),
                (2.0, -7.0),
                (5.0, -4.0),
                (5.0, 7.0),
                (-4.0, 7.0),
                (-4.0, -7.0),
            ]);
            line(&[(2.0, -7.0), (2.0, -4.0), (5.0, -4.0)]);
            line(&[(-2.0, 0.0), (3.0, 0.0)]);
            line(&[(-2.0, 3.0), (3.0, 3.0)]);
        }
        NavGroup::Files | NavGroup::EmployeeFiles => {
            line(&[
                (-7.0, -4.0),
                (-2.0, -4.0),
                (0.0, -2.0),
                (7.0, -2.0),
                (7.0, 6.0),
                (-7.0, 6.0),
                (-7.0, -4.0),
            ]);
        }
        NavGroup::Tickets => {
            outline(
                egui::Rect::from_center_size(center, Vec2::new(14.0, 10.0)),
                2.0,
            );
            line(&[(0.0, -4.0), (0.0, -1.5)]);
            line(&[(0.0, 1.5), (0.0, 4.0)]);
        }
        NavGroup::Plans => {
            outline(
                egui::Rect::from_center_size(point(0.0, 1.0), Vec2::new(13.0, 12.0)),
                2.0,
            );
            line(&[(-6.0, -2.0), (6.0, -2.0)]);
            line(&[(-3.0, -7.0), (-3.0, -3.0)]);
            line(&[(3.0, -7.0), (3.0, -3.0)]);
            painter.circle_filled(point(-3.0, 1.0), 0.8, color);
            painter.circle_filled(point(1.0, 1.0), 0.8, color);
        }
        NavGroup::Reports => {
            line(&[(-6.0, 6.0), (-6.0, -6.0)]);
            line(&[(-6.0, 6.0), (7.0, 6.0)]);
            outline(
                egui::Rect::from_min_max(point(-3.0, 1.0), point(-1.0, 5.0)),
                0.5,
            );
            outline(
                egui::Rect::from_min_max(point(0.0, -2.0), point(2.0, 5.0)),
                0.5,
            );
            outline(
                egui::Rect::from_min_max(point(3.0, -5.0), point(5.0, 5.0)),
                0.5,
            );
        }
        NavGroup::Administration | NavGroup::Settings | NavGroup::EmployeeSettings => {
            painter.circle_stroke(center, 4.5, stroke);
            painter.circle_stroke(center, 1.5, stroke);
            for angle in [0.0_f32, 45.0, 90.0, 135.0] {
                let angle = angle.to_radians();
                let dx = angle.cos() * 5.0;
                let dy = angle.sin() * 5.0;
                line(&[(dx, dy), (-dx, -dy)]);
            }
        }
        NavGroup::Signatures | NavGroup::EmployeeSignatures => {
            line(&[
                (-5.0, 5.0),
                (-3.0, 1.0),
                (3.0, -5.0),
                (5.0, -3.0),
                (-1.0, 3.0),
                (-5.0, 5.0),
            ]);
            line(&[(-6.0, 7.0), (0.0, 7.0)]);
        }
        NavGroup::Notifications | NavGroup::EmployeeNotifications => {
            line(&[
                (-5.0, 4.0),
                (-4.0, 2.0),
                (-4.0, -2.0),
                (-2.0, -5.0),
                (0.0, -6.0),
                (2.0, -5.0),
                (4.0, -2.0),
                (4.0, 2.0),
                (5.0, 4.0),
                (-5.0, 4.0),
            ]);
            line(&[(-2.0, 6.0), (0.0, 7.0), (2.0, 6.0)]);
        }
        NavGroup::EmployeeHome => {
            line(&[(-7.0, 0.0), (0.0, -7.0), (7.0, 0.0)]);
            line(&[(-5.0, -1.0), (-5.0, 6.0), (5.0, 6.0), (5.0, -1.0)]);
            line(&[(-1.5, 6.0), (-1.5, 2.0), (1.5, 2.0), (1.5, 6.0)]);
        }
        NavGroup::EmployeeTasks => {
            line(&[(-5.0, 0.0), (-1.5, 3.5), (5.0, -4.0)]);
            outline(egui::Rect::from_center_size(center, Vec2::splat(14.0)), 3.0);
        }
        NavGroup::EmployeeProposals => {
            outline(
                egui::Rect::from_center_size(point(0.0, 0.0), Vec2::new(13.0, 10.0)),
                2.0,
            );
            line(&[(-6.0, -4.0), (0.0, 1.0), (6.0, -4.0)]);
        }
    }
}

fn nav_node_contains(node: &NavNode, target: NavItem) -> bool {
    node.item == target
        || node
            .children
            .iter()
            .any(|child| nav_node_contains(child, target))
}

#[cfg(test)]
mod responsive_layout_tests {
    #[test]
    fn fixed_bottom_navigation_does_not_shrink_the_main_viewport() {
        for width in [390.0, 768.0] {
            let ctx = egui::Context::default();
            for _ in 0..3 {
                let _ = ctx.run(
                    egui::RawInput {
                        screen_rect: Some(egui::Rect::from_min_size(
                            egui::Pos2::ZERO,
                            egui::vec2(width, 844.0),
                        )),
                        ..Default::default()
                    },
                    |ctx| {
                        egui::TopBottomPanel::top("fixture.header")
                            .exact_height(48.0)
                            .show(ctx, |_| {});
                        let before = ctx.available_rect();
                        super::show_mobile_bottom_bar(ctx, |ui| {
                            ui.label("Navigation");
                        });
                        assert_eq!(ctx.available_rect(), before);
                        assert_eq!(before.height(), 796.0);
                    },
                );
            }
            let bar = ctx
                .memory(|memory| memory.area_rect(egui::Id::new("mobile_bottom_navigation")))
                .unwrap();
            assert_eq!(
                bar,
                egui::Rect::from_min_size(egui::pos2(0.0, 788.0), egui::vec2(width, 56.0))
            );
        }
    }
    use egui::Vec2;

    use super::{
        header_user_layout, is_compact_layout, mobile_navigation_drawer_rect,
        show_mobile_navigation_drawer,
    };

    #[test]
    fn account_trigger_matches_mobile_and_desktop_header_geometry() {
        let mobile = header_user_layout(180.0, true);
        assert_eq!(mobile.width, 32.0);
        assert_eq!(mobile.avatar_size, 28.0);
        assert_eq!(mobile.avatar_left_inset, 2.0);
        assert!(!mobile.show_name);

        let desktop = header_user_layout(100.0, false);
        assert_eq!(desktop.width, 152.0);
        assert_eq!(desktop.avatar_size, 28.0);
        assert_eq!(desktop.avatar_left_inset, 8.0);
        assert!(desktop.show_name);
    }

    #[test]
    fn compact_layout_uses_mobile_and_tablet_widths_only() {
        assert!(is_compact_layout(390.0));
        assert!(is_compact_layout(719.0));
        assert!(is_compact_layout(992.0));
        assert!(!is_compact_layout(993.0));
        assert!(!is_compact_layout(1280.0));
    }

    #[test]
    fn mobile_drawer_geometry_matches_the_legacy_css_override() {
        let screen = egui::Rect::from_min_size(egui::pos2(7.0, 11.0), Vec2::new(768.0, 900.0));
        let drawer = mobile_navigation_drawer_rect(screen);
        assert_eq!(drawer.min, screen.min);
        assert_eq!(drawer.width(), 260.0);
        assert_eq!(drawer.height(), 900.0);

        let tablet_screen = egui::Rect::from_min_size(egui::Pos2::ZERO, Vec2::new(769.0, 900.0));
        assert_eq!(mobile_navigation_drawer_rect(tablet_screen).width(), 270.0);

        let compact_tablet_screen =
            egui::Rect::from_min_size(egui::Pos2::ZERO, Vec2::new(992.0, 900.0));
        assert_eq!(
            mobile_navigation_drawer_rect(compact_tablet_screen).width(),
            270.0
        );

        let narrow_screen = egui::Rect::from_min_size(egui::Pos2::ZERO, Vec2::new(220.0, 640.0));
        assert_eq!(mobile_navigation_drawer_rect(narrow_screen).width(), 220.0);
    }

    #[test]
    fn mobile_drawer_area_renders_at_the_exact_legacy_breakpoint_bounds() {
        for width in [390.0, 768.0, 769.0, 992.0] {
            let screen = egui::Rect::from_min_size(egui::pos2(0.0, 0.0), Vec2::new(width, 900.0));
            let expected = mobile_navigation_drawer_rect(screen);
            let context = egui::Context::default();
            let mut rendered_rect = None;
            let _ = context.run(
                egui::RawInput {
                    screen_rect: Some(screen),
                    ..Default::default()
                },
                |ctx| {
                    rendered_rect = Some(show_mobile_navigation_drawer(ctx, expected, |ui| {
                        ui.label("Navigation");
                    }));
                },
            );
            let rendered_rect = rendered_rect.expect("drawer area should render");
            assert_eq!(rendered_rect.min, expected.min, "width={width}");
            assert_eq!(rendered_rect.size(), expected.size(), "width={width}");
        }
    }
}

#[cfg(test)]
mod navigation_icon_tests {
    use super::{ADMIN_NAV_TREE, EMPLOYEE_NAV_TREE, NavigationIcon, paint_svg_nav_icon};
    use egui::{Color32, Context, Id, LayerId, Order, Pos2, Rect, Vec2};
    use std::collections::HashMap;

    #[test]
    fn only_supported_appearance_preferences_are_restored() {
        #[derive(Default)]
        struct Preferences(HashMap<String, String>);
        impl eframe::Storage for Preferences {
            fn get_string(&self, key: &str) -> Option<String> {
                self.0.get(key).cloned()
            }
            fn set_string(&mut self, key: &str, value: String) {
                self.0.insert(key.into(), value);
            }
            fn flush(&mut self) {}
        }
        let mut storage = Preferences::default();
        eframe::set_value(&mut storage, "kiyo.appearance", &(true, true));
        let mut app = super::KiyoApp::default();
        app.restore_appearance(Some(&storage));
        assert!(app.is_dark_theme && app.sidebar_accordion);
        assert!(
            app.session.is_none(),
            "preferences must not restore authentication"
        );
        storage
            .0
            .insert("kiyo.appearance".into(), "malformed".into());
        let mut fresh = super::KiyoApp::default();
        fresh.restore_appearance(Some(&storage));
        assert!(!fresh.is_dark_theme && !fresh.sidebar_accordion);
    }

    #[test]
    fn every_bundled_ant_design_icon_rasterizes_to_visible_pixels() {
        for icon in NavigationIcon::ALL {
            let image = egui_extras::image::load_svg_bytes(icon.svg_bytes())
                .unwrap_or_else(|error| panic!("{} failed to rasterize: {error}", icon.name()));
            assert_eq!(image.size, [64, 64], "{} dimensions", icon.name());
            assert!(
                image.pixels.iter().any(|pixel| pixel.a() > 0),
                "{} must contain visible pixels",
                icon.name()
            );
        }
    }

    #[test]
    fn admin_and_employee_root_icons_match_the_legacy_menu_data() {
        let admin_expected = [
            ("dashboard", "DashboardOutlined"),
            ("chat", "MessageOutlined"),
            ("business", "BankOutlined"),
            ("hr", "TeamOutlined"),
            ("insurance", "SafetyCertificateOutlined"),
            ("attendance", "ClockCircleOutlined"),
            ("crm", "SmileOutlined"),
            ("finance", "DollarOutlined"),
            ("assets", "InboxOutlined"),
            ("workflows", "BranchesOutlined"),
            ("meeting-rooms", "DesktopOutlined"),
            ("services", "ShopOutlined"),
            ("documents", "FileTextOutlined"),
            ("files", "FolderOpenOutlined"),
            ("tickets", "CustomerServiceOutlined"),
            ("plans", "CalendarOutlined"),
            ("reports", "BarChartOutlined"),
            ("admin", "ControlOutlined"),
            ("digisig", "SafetyCertificateOutlined"),
            ("notifications", "BellOutlined"),
            ("settings", "SettingOutlined"),
        ];
        assert_eq!(ADMIN_NAV_TREE.len(), admin_expected.len());
        for (node, (expected_id, expected_icon)) in ADMIN_NAV_TREE.iter().zip(admin_expected) {
            assert_eq!(node.item.id, expected_id);
            assert_eq!(
                NavigationIcon::for_group(node.item.group).name(),
                expected_icon
            );
        }

        let employee_expected = [
            ("emp-home", "HomeOutlined"),
            ("emp-profile", "UserOutlined"),
            ("emp-tasks", "CheckSquareOutlined"),
            ("emp-payslip", "DollarOutlined"),
            ("emp-contracts", "FileTextOutlined"),
            ("emp-proposals", "FolderOpenOutlined"),
            ("emp-assets", "DesktopOutlined"),
            ("emp-files", "FolderOpenOutlined"),
            ("emp-notifications", "BellOutlined"),
            ("emp-digisig", "SafetyCertificateOutlined"),
            ("emp-settings", "SettingOutlined"),
        ];
        assert_eq!(EMPLOYEE_NAV_TREE.len(), employee_expected.len());
        for (node, (expected_id, expected_icon)) in EMPLOYEE_NAV_TREE.iter().zip(employee_expected)
        {
            assert_eq!(node.item.id, expected_id);
            assert_eq!(
                NavigationIcon::for_group(node.item.group).name(),
                expected_icon
            );
        }
    }

    #[test]
    fn svg_textures_are_loaded_once_and_cached_for_all_navigation_icons() {
        let context = Context::default();
        let screen = Rect::from_min_size(Pos2::ZERO, Vec2::new(640.0, 480.0));
        let mut textures = HashMap::new();
        let _ = context.run(
            egui::RawInput {
                screen_rect: Some(screen),
                ..Default::default()
            },
            |ctx| {
                let painter = ctx.layer_painter(LayerId::new(
                    Order::Foreground,
                    Id::new("navigation-icon-texture-test"),
                ));
                for (index, icon) in NavigationIcon::ALL.into_iter().enumerate() {
                    paint_svg_nav_icon(
                        ctx,
                        &mut textures,
                        &painter,
                        Pos2::new(index as f32 * 20.0, 20.0),
                        icon,
                        Color32::WHITE,
                        16.0,
                    );
                }
            },
        );
        assert_eq!(textures.len(), NavigationIcon::ALL.len());
    }
}

#[cfg(test)]
mod legacy_navigation_tests {
    use super::*;

    #[test]
    fn planning_aliases_resolve_to_existing_views_in_the_admin_tree() {
        for (path, canonical) in [
            ("/admin/plans", "/admin/tasks"),
            ("/admin/plans/tasks", "/admin/tasks"),
            ("/admin/plans/projects", "/admin/plans/roadmap"),
            ("/admin/plans/okr", "/admin/plans/roadmap"),
        ] {
            let item = find_nav_item_by_path(ADMIN_NAV_TREE, path).unwrap();
            assert_eq!(item.path, canonical);
            assert_eq!(item.group, NavGroup::Plans);
            assert!(find_nav_item_by_path(EMPLOYEE_NAV_TREE, path).is_none());
        }
    }

    #[test]
    fn sorting_preserves_app_only_routes_and_the_legacy_hr_order() {
        let hr = ADMIN_NAV_TREE
            .iter()
            .find(|node| node.item.id == "hr")
            .unwrap();
        let ordered = crate::navigation_order::ordered(hr.children);
        assert_eq!(ordered.len(), hr.children.len());
        let ids = ordered.iter().map(|node| node.item.id).collect::<Vec<_>>();
        assert_eq!(
            &ids[..8],
            &[
                "hr-overview",
                "hr-employees",
                "hr-onboarding",
                "hr-contracts",
                "hr-uniforms",
                "hr-proposals",
                "hr-headcount",
                "hr-history"
            ]
        );
        for child in hr.children {
            assert!(ids.contains(&child.item.id));
        }
    }

    #[test]
    fn hr_flyout_is_tall_enough_to_reach_history_instead_of_clipping_at_400px() {
        let context = egui::Context::default();
        native_text::setup_fonts(&context);
        native_text::setup_style(&context);
        let hr = ADMIN_NAV_TREE
            .iter()
            .find(|node| node.item.id == "hr")
            .unwrap();
        let anchor = egui::Rect::from_min_size(egui::pos2(6.0, 167.0), Vec2::new(207.0, 34.0));
        let mut flyouts = vec![NavigationFlyout { node: hr, anchor }];
        let mut current = NavItem::admin_dashboard();
        for _ in 0..2 {
            let _ = context.run(
                egui::RawInput {
                    screen_rect: Some(egui::Rect::from_min_size(
                        egui::Pos2::ZERO,
                        Vec2::new(1440.0, 900.0),
                    )),
                    events: vec![egui::Event::PointerMoved(anchor.center())],
                    ..Default::default()
                },
                |ctx| {
                    render_navigation_flyouts(ctx, &mut current, &mut flyouts, &mut None);
                },
            );
        }
        let rect = context
            .memory(|m| m.area_rect(egui::Id::new(("legacy-navigation-flyout", 0_usize, "hr"))))
            .unwrap();
        assert_eq!(rect.width(), 230.0);
        assert!(
            rect.height() >= hr.children.len() as f32 * 36.0 + 45.0,
            "{rect:?}"
        );
        assert!(
            rect.bottom() <= 900.0,
            "flyout must remain within the viewport"
        );
    }
}
