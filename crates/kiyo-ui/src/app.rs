use crate::api::ApiClient;
use crate::models::{ADMIN_NAV_TREE, EMPLOYEE_NAV_TREE, NavGroup, NavItem, NavNode, Session};
use crate::native_text;
use crate::views::{
    activation::{ActivationOutcome, ActivationView},
    assets::AssetsView,
    attendance::AttendanceView,
    chat::ChatView,
    crm::CrmView,
    dashboard::DashboardView,
    document_editor::DocumentEditorView,
    employee_portal::EmployeePortalView,
    employees::EmployeesView,
    files::FilesView,
    finance::FinanceView,
    insurance::InsuranceView,
    login::LoginView,
    meeting_rooms::MeetingRoomsView,
    org_units::OrgUnitsView,
    settings::SettingsView,
    signatures::SignaturesView,
    users::UsersView,
    workflows::WorkflowsView,
};
use egui::{Color32, Layout, RichText, Vec2};

pub struct KiyoApp {
    pub session: Option<Session>,
    pub api: ApiClient,
    pub current_nav: NavItem,
    pub is_employee_mode: bool,
    pub is_dark_theme: bool,
    pub sidebar_collapsed: bool,
    pub notif_open: bool,
    pub last_logged_pixels_per_point: Option<f32>,

    // Views
    pub login_view: LoginView,
    pub activation_view: ActivationView,
    pub show_activation: bool,
    pub dashboard_view: DashboardView,
    pub users_view: UsersView,
    pub employees_view: EmployeesView,
    pub org_units_view: OrgUnitsView,
    pub attendance_view: AttendanceView,
    pub finance_view: FinanceView,
    pub crm_view: CrmView,
    pub assets_view: AssetsView,
    pub rooms_view: MeetingRoomsView,
    pub doc_view: DocumentEditorView,
    pub ins_view: InsuranceView,
    pub files_view: FilesView,
    pub workflows_view: WorkflowsView,
    pub chat_view: ChatView,
    pub sig_view: SignaturesView,
    pub settings_view: SettingsView,
    pub emp_view: EmployeePortalView,
}

impl Default for KiyoApp {
    fn default() -> Self {
        Self {
            session: None,
            api: ApiClient::default(),
            current_nav: NavItem::admin_dashboard(),
            is_employee_mode: false,
            is_dark_theme: false,
            sidebar_collapsed: false,
            notif_open: false,
            last_logged_pixels_per_point: None,

            login_view: LoginView::new(),
            activation_view: ActivationView::default(),
            show_activation: false,
            dashboard_view: DashboardView::default(),
            users_view: UsersView::default(),
            employees_view: EmployeesView::default(),
            org_units_view: OrgUnitsView::default(),
            attendance_view: AttendanceView::default(),
            finance_view: FinanceView::default(),
            crm_view: CrmView::default(),
            assets_view: AssetsView::default(),
            rooms_view: MeetingRoomsView::default(),
            doc_view: DocumentEditorView::default(),
            ins_view: InsuranceView::default(),
            files_view: FilesView::default(),
            workflows_view: WorkflowsView::default(),
            chat_view: ChatView::default(),
            sig_view: SignaturesView::default(),
            settings_view: SettingsView::default(),
            emp_view: EmployeePortalView::default(),
        }
    }
}

impl eframe::App for KiyoApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        native_text::apply_visuals(ctx, self.is_dark_theme);
        native_text::log_dpi_if_changed(&mut self.last_logged_pixels_per_point, ctx);

        if self.session.is_none() {
            let endpoint = self.login_view.endpoint.clone();
            let mode = self.login_view.mode;
            let api = &self.api;
            let show_activation = self.show_activation;
            let login_view = &mut self.login_view;
            let activation_view = &mut self.activation_view;
            let mut activation_outcome = ActivationOutcome::None;
            egui::CentralPanel::default().show(ctx, |ui| {
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
            if !self.show_activation && self.login_view.activation_requested {
                self.login_view.activation_requested = false;
                self.show_activation = true;
            }
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

        // Top Header Bar
        egui::TopBottomPanel::top("top_header_panel")
            .exact_height(50.0)
            .show(ctx, |ui| {
                ui.horizontal_centered(|ui| {
                    let nav_toggle = if self.sidebar_collapsed { "Menu" } else { "X" };
                    if ui.button(nav_toggle).clicked() {
                        self.sidebar_collapsed = !self.sidebar_collapsed;
                    }

                    ui.add_space(8.0);
                    ui.label(
                        RichText::new("KIYOVN Enterprise")
                            .size(15.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.label(
                        RichText::new("v2.0 Native Rust")
                            .size(11.0)
                            .color(Color32::from_rgb(71, 85, 105)),
                    );

                    ui.with_layout(Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui
                            .button(
                                RichText::new("Đăng xuất").color(Color32::from_rgb(220, 38, 38)),
                            )
                            .clicked()
                        {
                            should_logout = true;
                        }

                        ui.separator();

                        // User profile
                        ui.horizontal(|ui| {
                            let role_str = if user_role == "ADMIN" {
                                "Quản trị viên"
                            } else {
                                "Nhân viên"
                            };
                            ui.label(
                                RichText::new(format!("{} ({})", user_name, role_str))
                                    .color(Color32::from_rgb(51, 65, 85)),
                            );
                        });

                        ui.separator();

                        // Notification Bell
                        let notif_label = if self.notif_open {
                            "Thông báo (2)"
                        } else {
                            "Thông báo"
                        };
                        if ui.button(notif_label).clicked() {
                            self.notif_open = !self.notif_open;
                        }

                        // Dark/Light Mode
                        if ui
                            .button(if self.is_dark_theme { "Sáng" } else { "Tối" })
                            .clicked()
                        {
                            self.is_dark_theme = !self.is_dark_theme;
                        }

                        // Switch View (Admin vs Employee)
                        if user_role == "ADMIN" {
                            let switch_label = if self.is_employee_mode {
                                "Trang Quản trị"
                            } else {
                                "Cổng Nhân viên"
                            };
                            if ui.button(switch_label).clicked() {
                                self.is_employee_mode = !self.is_employee_mode;
                                self.current_nav = if self.is_employee_mode {
                                    NavItem::employee_home()
                                } else {
                                    NavItem::admin_dashboard()
                                };
                            }
                        }
                    });
                });
            });

        if should_logout {
            self.settings_view.clear_sensitive();
            self.dashboard_view.reset();
            self.files_view.reset();
            self.users_view.reset();
            self.employees_view.reset();
            self.org_units_view.reset();
            self.emp_view.reset();
            self.activation_view.clear_sensitive();
            self.session = None;
            return;
        }

        // Left Sidebar Navigation
        if !self.sidebar_collapsed {
            egui::SidePanel::left("sidebar_nav_panel")
                .exact_width(220.0)
                .show(ctx, |ui| {
                    ui.vertical(|ui| {
                        ui.add_space(8.0);
                        let heading_label = if self.is_employee_mode {
                            "CỔNG NHÂN VIÊN"
                        } else {
                            "HỆ THỐNG QUẢN TRỊ"
                        };
                        ui.label(
                            RichText::new(heading_label)
                                .size(11.0)
                                .strong()
                                .color(Color32::from_rgb(0, 150, 136)),
                        );
                        ui.add_space(8.0);

                        egui::ScrollArea::vertical().show(ui, |ui| {
                            let items = if self.is_employee_mode {
                                EMPLOYEE_NAV_TREE
                            } else {
                                ADMIN_NAV_TREE
                            };
                            for node in items {
                                render_nav_node(ui, node, 0, &mut self.current_nav);
                            }
                        });

                        ui.add_space(10.0);
                        ui.separator();
                        ui.label(
                            RichText::new(format!("Chế độ: {}", mode_label))
                                .size(11.0)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                    });
                });
        }

        // Notification Window Popover
        if self.notif_open {
            egui::Window::new("Thông báo hệ thống")
                .anchor(egui::Align2::RIGHT_TOP, Vec2::new(-20.0, 55.0))
                .resizable(false)
                .collapsible(false)
                .show(ctx, |ui| {
                    ui.set_width(280.0);
                    ui.label("Đã đồng bộ dữ liệu với Kiyo Cloud");
                    ui.label("Thông báo lịch nghỉ lễ Quốc khánh");
                    ui.add_space(6.0);
                    if ui.small_button("Đóng").clicked() {
                        self.notif_open = false;
                    }
                });
        }

        // Central Content Area
        let session = self.session.as_mut().unwrap();

        egui::CentralPanel::default().show(ctx, |ui| {
            let mut nav_change = None;

            egui::ScrollArea::vertical().show(ui, |ui| {
                ui.add_space(8.0);
                match self.current_nav {
                    _ => {
                        ui.horizontal(|ui| {
                            ui.label(
                                RichText::new(self.current_nav.path)
                                    .size(11.0)
                                    .color(Color32::from_rgb(71, 85, 105)),
                            );
                            ui.label(
                                RichText::new(self.current_nav.label())
                                    .size(11.0)
                                    .strong()
                                    .color(Color32::from_rgb(0, 150, 136)),
                            );
                        });
                        ui.add_space(8.0);

                        match self.current_nav.group {
                            NavGroup::Dashboard => {
                                self.dashboard_view.render(
                                    ui,
                                    ctx,
                                    session,
                                    &self.api,
                                    &mut nav_change,
                                )
                            }
                            NavGroup::Administration if self.current_nav.path == "/admin/users" => {
                                self.users_view.render(ui, session, &self.api)
                            }
                            NavGroup::Administration => {
                                self.settings_view.render(ui, ctx, session, &self.api)
                            }
                            NavGroup::Business => self.org_units_view.render(ui, session, &self.api),
                            NavGroup::Hr => self.employees_view.render(ui, session, &self.api),
                            NavGroup::Attendance => self.attendance_view.render(ui, session),
                            NavGroup::Finance => self.finance_view.render(ui, session),
                            NavGroup::Crm => self.crm_view.render(ui, session),
                            NavGroup::Assets => self.assets_view.render(ui, session),
                            NavGroup::MeetingRooms => self.rooms_view.render(ui, session),
                            NavGroup::Documents => self.doc_view.render(ui, session),
                            NavGroup::Insurance => self.ins_view.render(ui, session),
                            NavGroup::Files | NavGroup::EmployeeFiles => self.files_view.render(
                                ui,
                                ctx,
                                session,
                                &self.api,
                                self.current_nav.group == NavGroup::EmployeeFiles,
                            ),
                            NavGroup::Workflows
                            | NavGroup::EmployeeTasks
                            | NavGroup::EmployeeProposals => {
                                self.workflows_view.render(ui, session)
                            }
                            NavGroup::Chat => self.chat_view.render(ui, session),
                            NavGroup::Signatures | NavGroup::EmployeeSignatures => {
                                self.sig_view.render(ui, session)
                            }
                            NavGroup::Settings | NavGroup::EmployeeSettings => {
                                if self.current_nav.path.ends_with("/security") {
                                    self.settings_view
                                        .render_security(ui, ctx, session, &self.api)
                                } else {
                                    self.settings_view.render(ui, ctx, session, &self.api)
                                }
                            }
                            NavGroup::EmployeeProfile => {
                                self.emp_view.render_profile(ui, session, &self.api)
                            }
                            NavGroup::EmployeeHome
                            | NavGroup::EmployeeContracts
                            | NavGroup::EmployeeAssets
                            | NavGroup::EmployeeNotifications => {
                                self.emp_view.render_home(ui, session, &mut nav_change)
                            }
                            NavGroup::EmployeePayslips => {
                                self.emp_view.render_payslips(ui, session)
                            }
                            NavGroup::Services
                            | NavGroup::Tickets
                            | NavGroup::Plans
                            | NavGroup::Reports
                            | NavGroup::Notifications => self.workflows_view.render(ui, session),
                        }
                    }
                }
            });

            if let Some(target) = nav_change {
                self.current_nav = target;
            }
        });
        if was_security_screen && !self.current_nav.path.ends_with("/security") {
            self.settings_view.clear_sensitive();
        }
    }
}

impl KiyoApp {
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
        if session.user.role == "USER" {
            self.is_employee_mode = true;
            self.current_nav = NavItem::employee_home();
        } else {
            self.is_employee_mode = false;
            self.current_nav = NavItem::admin_dashboard();
        }
        self.session = Some(session);
    }
}

fn render_nav_node(ui: &mut egui::Ui, node: &NavNode, depth: usize, current_nav: &mut NavItem) {
    let is_active = *current_nav == node.item;
    let indent = 12.0 * depth as f32;
    let width = (195.0 - indent).max(120.0);
    ui.horizontal(|ui| {
        ui.add_space(indent);
        if depth == 0 {
            let icon_color = if is_active {
                Color32::WHITE
            } else {
                Color32::from_rgb(51, 65, 85)
            };
            ui.label(native_text::icon_text(node.item.icon(), icon_color));
        } else {
            ui.add_space(16.0);
        }
        let mut rich = RichText::new(node.item.label())
            .size(if depth == 0 { 12.75 } else { 12.0 })
            .color(Color32::from_rgb(30, 41, 59));
        if is_active {
            rich = rich.color(Color32::WHITE);
        }
        let mut btn = egui::Button::new(rich)
            .min_size(Vec2::new((width - 22.0).max(96.0), 30.0))
            .rounding(6.0);
        if is_active {
            btn = btn.fill(Color32::from_rgb(0, 150, 136));
        } else {
            btn = btn.fill(Color32::TRANSPARENT).frame(false);
        }
        if ui.add(btn).clicked() {
            *current_nav = node.item;
        }
    });
    ui.add_space(2.0);

    for child in node.children {
        render_nav_node(ui, child, depth + 1, current_nav);
    }
}
