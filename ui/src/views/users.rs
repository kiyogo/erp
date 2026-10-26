use std::time::Duration;
use web_time::Instant;

use crate::{
    api::{ApiClient, ApiTask, UsersPage, UsersSummary},
    models::{AdminUser, Session},
};
use egui::{Color32, RichText, Ui};

const USERS_PAGE_SIZE: usize = 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
enum UserFilter {
    #[default]
    All,
    Active,
    Locked,
    Admin,
    Retired,
}

impl UserFilter {
    fn api_value(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Active => "active",
            Self::Locked => "locked",
            Self::Admin => "admin",
            Self::Retired => "retired",
        }
    }
}

pub struct UsersView {
    users: Vec<AdminUser>,
    summary: Option<UsersSummary>,
    pagination_total: usize,
    page: usize,
    list_task: Option<ApiTask<UsersPage>>,
    create_task: Option<ApiTask<AdminUser>>,
    status_task: Option<ApiTask<AdminUser>>,
    loaded_for: Option<String>,
    needs_reload: bool,
    loading: bool,
    error: String,
    notice: String,
    search: String,
    filter: UserFilter,
    submitted_search: String,
    submitted_filter: UserFilter,
    search_changed_at: Option<Instant>,
    add_open: bool,
    selected_user_id: Option<String>,
    new_name: String,
    new_email: String,
    new_employee_code: String,
    new_department: String,
    new_password: String,
    new_role: String,
    form_error: String,
}

impl Default for UsersView {
    fn default() -> Self {
        Self {
            users: Vec::new(),
            summary: None,
            pagination_total: 0,
            page: 1,
            list_task: None,
            create_task: None,
            status_task: None,
            loaded_for: None,
            needs_reload: true,
            loading: false,
            error: String::new(),
            notice: String::new(),
            search: String::new(),
            filter: UserFilter::All,
            submitted_search: String::new(),
            submitted_filter: UserFilter::All,
            search_changed_at: None,
            add_open: false,
            selected_user_id: None,
            new_name: String::new(),
            new_email: String::new(),
            new_employee_code: String::new(),
            new_department: String::new(),
            new_password: String::new(),
            new_role: "USER".to_owned(),
            form_error: String::new(),
        }
    }
}

impl UsersView {
    pub fn reset(&mut self) {
        self.users.clear();
        self.summary = None;
        self.pagination_total = 0;
        self.page = 1;
        self.list_task = None;
        self.create_task = None;
        self.status_task = None;
        self.loaded_for = None;
        self.needs_reload = true;
        self.loading = false;
        self.error.clear();
        self.notice.clear();
        self.search.clear();
        self.filter = UserFilter::All;
        self.submitted_search.clear();
        self.submitted_filter = UserFilter::All;
        self.search_changed_at = None;
        self.add_open = false;
        self.selected_user_id = None;
        self.clear_form();
    }

    fn clear_form(&mut self) {
        self.new_name.clear();
        self.new_email.clear();
        self.new_employee_code.clear();
        self.new_department.clear();
        self.new_password.clear();
        self.new_role = "USER".to_owned();
        self.form_error.clear();
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        self.loading = true;
        self.error.clear();
        self.submitted_search = self.search.trim().to_owned();
        self.submitted_filter = self.filter;
        self.search_changed_at = None;
        self.list_task = Some(api.list_users_task(
            session,
            self.page,
            USERS_PAGE_SIZE,
            &self.submitted_search,
            self.submitted_filter.api_value(),
        ));
        self.needs_reload = false;
    }

    fn switch_account(&mut self, user_id: &str) {
        self.loaded_for = Some(user_id.to_owned());
        self.users.clear();
        self.summary = None;
        self.pagination_total = 0;
        self.page = 1;
        self.list_task = None;
        self.create_task = None;
        self.status_task = None;
        self.needs_reload = true;
        self.loading = false;
        self.error.clear();
        self.notice.clear();
        self.search.clear();
        self.filter = UserFilter::All;
        self.submitted_search.clear();
        self.submitted_filter = UserFilter::All;
        self.search_changed_at = None;
        self.add_open = false;
        self.selected_user_id = None;
        self.clear_form();
    }

    fn poll_requests(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.switch_account(&session.user.id);
        }

        let query_changed =
            self.submitted_search != self.search.trim() || self.submitted_filter != self.filter;
        if query_changed
            && self
                .search_changed_at
                .is_some_and(|changed_at| changed_at.elapsed() >= Duration::from_millis(350))
        {
            self.page = 1;
            self.selected_user_id = None;
            self.needs_reload = true;
        } else if !query_changed {
            self.search_changed_at = None;
        }

        if self.needs_reload
            && self.list_task.is_none()
            && self.create_task.is_none()
            && self.status_task.is_none()
        {
            self.request_reload(session, api);
        }

        if let Some(result) = self.list_task.as_ref().and_then(ApiClient::poll) {
            self.list_task = None;
            self.loading = false;
            match result {
                Ok(page) => {
                    self.summary = page.summary;
                    self.users = page.data;
                    self.pagination_total = page.pagination.total;
                    self.page = page.pagination.page;
                    if page.pagination.limit != USERS_PAGE_SIZE {
                        self.error = "Máy chủ trả về kích thước trang không mong đợi.".to_owned();
                    }
                }
                Err(error) => self.error = error,
            }
        }

        if let Some(result) = self.create_task.as_ref().and_then(ApiClient::poll) {
            self.create_task = None;
            match result {
                Ok(user) => {
                    self.notice = format!("Đã tạo tài khoản cho {}.", user.name);
                    self.add_open = false;
                    self.clear_form();
                    self.page = 1;
                    self.needs_reload = true;
                }
                Err(error) => self.form_error = error,
            }
        }

        if let Some(result) = self.status_task.as_ref().and_then(ApiClient::poll) {
            self.status_task = None;
            match result {
                Ok(user) => {
                    self.notice = if user.is_active {
                        format!("Đã mở khóa tài khoản {}.", user.name)
                    } else {
                        format!("Đã khóa tài khoản {}.", user.name)
                    };
                    self.needs_reload = true;
                }
                Err(error) => self.error = error,
            }
        }

        if self.list_task.is_some()
            || self.create_task.is_some()
            || self.status_task.is_some()
            || self.search_changed_at.is_some()
        {
            ui.ctx().request_repaint_after(Duration::from_millis(80));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Chỉ quản trị viên mới có thể quản lý tài khoản.");
            return;
        }

        self.poll_requests(ui, session, api);
        let mut status_change: Option<(String, bool)> = None;

        ui.vertical(|ui| {
            ui.spacing_mut().item_spacing.y = 0.0;
            ui.add_space(8.0);
            if !self.notice.is_empty() {
                ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
                ui.add_space(8.0);
            }
            if !self.error.is_empty() {
                ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                ui.add_space(6.0);
            }
            let count = |value: Option<usize>, unit: &str| {
                value.map_or_else(|| "—".to_owned(), |n| format!("{n} {unit}"))
            };
            crate::widgets::metrics(
                ui,
                "users.metrics",
                &[
                    crate::widgets::Metric {
                        value_size: 24.0,
                        label: "Tổng số tài khoản nội bộ",
                        value: count(self.summary.map(|s| s.total), "người dùng"),
                        detail: "Phân quyền theo mô hình RBAC",
                        color: Color32::from_rgb(0, 150, 136),
                    },
                    crate::widgets::Metric {
                        value_size: 24.0,
                        label: "Tài khoản đang hoạt động",
                        value: count(self.summary.map(|s| s.active), "tài khoản"),
                        detail: "Được cấp quyền truy cập hệ thống",
                        color: Color32::from_rgb(22, 163, 74),
                    },
                    crate::widgets::Metric {
                        value_size: 24.0,
                        label: "Nhóm Quản trị viên & Lãnh đạo",
                        value: count(self.summary.map(|s| s.admins), "tài khoản"),
                        detail: "Quyền quản trị trên hệ thống",
                        color: Color32::from_rgb(124, 58, 237),
                    },
                    crate::widgets::Metric {
                        value_size: 24.0,
                        label: "Tỷ lệ kích hoạt xác thực 2FA",
                        value: "Chưa có dữ liệu".into(),
                        detail: "Backend chưa cung cấp trạng thái 2FA",
                        color: Color32::from_rgb(30, 64, 175),
                    },
                ],
            );
            ui.add_space(16.0);
            let filters = [
                UserFilter::All,
                UserFilter::Active,
                UserFilter::Locked,
                UserFilter::Admin,
                UserFilter::Retired,
            ];
            let selected = filters
                .iter()
                .position(|filter| *filter == self.filter)
                .unwrap_or(0);
            let response = crate::widgets::filter_toolbar(
                ui,
                "users",
                &[
                    "Tất cả tài khoản",
                    "Đang hoạt động",
                    "Đã khóa",
                    "Quản trị & Lãnh đạo",
                    "Đã nghỉ việc",
                ],
                selected,
                &mut self.search,
                "Tìm theo username, họ tên, email, vai trò...",
                "+  Thêm tài khoản",
                false,
                160,
            );
            if let Some(index) = response.selected {
                self.filter = filters[index];
                self.page = 1;
                self.search_changed_at = Some(Instant::now());
                self.selected_user_id = None;
            }
            if response.search_changed {
                self.page = 1;
                self.search_changed_at = Some(Instant::now());
                self.selected_user_id = None;
            }
            if response.reload_clicked && self.list_task.is_none() {
                self.needs_reload = true;
            }
            if response.create_clicked {
                self.clear_form();
                self.add_open = true;
            }
            ui.add_space(12.0);
            let list_pending = self.loading || self.search_changed_at.is_some();
            if list_pending {
                ui.horizontal(|ui| {
                    ui.spinner();
                    ui.label(if self.loading {
                        "Đang cập nhật danh sách tài khoản..."
                    } else {
                        "Đang áp dụng tìm kiếm và bộ lọc..."
                    });
                });
            }
            if !self.users.is_empty() || (!list_pending && self.error.is_empty()) {
                let flexible = (ui.available_width().max(1130.0) - 545.265625).max(500.0);
                let columns = [
                    crate::widgets::TableColumn {
                        title: "Tài khoản & Họ tên",
                        width: flexible * 164.9375 / 650.734375,
                    },
                    crate::widgets::TableColumn {
                        title: "Email & Liên hệ",
                        width: flexible * 212.859375 / 650.734375,
                    },
                    crate::widgets::TableColumn {
                        title: "Vai trò (Role)",
                        width: flexible * 131.3125 / 650.734375,
                    },
                    crate::widgets::TableColumn {
                        title: "Xác thực 2FA",
                        width: 140.0,
                    },
                    crate::widgets::TableColumn {
                        title: "Đăng nhập cuối",
                        width: flexible * 141.625 / 650.734375,
                    },
                    crate::widgets::TableColumn {
                        title: "Trạng thái",
                        width: 130.0,
                    },
                    crate::widgets::TableColumn {
                        title: "Thao tác",
                        width: 273.265625,
                    },
                ];
                crate::widgets::table_with_row_height(
                    ui,
                    "users.table",
                    &columns,
                    self.users.len(),
                    56.25,
                    |ui, row, column| {
                        let user = &self.users[row];
                        match column {
                            0 => {
                                ui.label(
                                    RichText::new(&user.employee_code)
                                        .size(13.5)
                                        .color(crate::theme::PRIMARY),
                                );
                                ui.label(
                                    RichText::new(&user.name)
                                        .size(12.0)
                                        .color(Color32::from_rgb(15, 23, 42)),
                                );
                            }
                            1 => {
                                ui.label(
                                    RichText::new(&user.email)
                                        .size(12.5)
                                        .color(Color32::from_rgb(30, 64, 175)),
                                );
                                ui.label(
                                    RichText::new(format!(
                                        "Phòng: {}",
                                        if user.department.is_empty() {
                                            "Chưa phân phòng ban"
                                        } else {
                                            &user.department
                                        }
                                    ))
                                    .size(11.5)
                                    .color(Color32::from_rgb(100, 116, 139)),
                                );
                            }
                            2 => crate::widgets::tag(
                                ui,
                                if user.role == "ADMIN" {
                                    "Quản trị viên"
                                } else {
                                    "Nhân viên"
                                },
                                if user.role == "ADMIN" {
                                    crate::widgets::TagTone::Purple
                                } else {
                                    crate::widgets::TagTone::Cyan
                                },
                            ),
                            3 | 4 => {
                                ui.label(
                                    RichText::new("Chưa có dữ liệu")
                                        .size(12.0)
                                        .color(Color32::from_rgb(100, 116, 139)),
                                );
                            }
                            5 => crate::widgets::tag(
                                ui,
                                if user.is_active {
                                    "Hoạt động"
                                } else {
                                    nonempty(&user.activation_status)
                                },
                                if user.is_active {
                                    crate::widgets::TagTone::Success
                                } else {
                                    crate::widgets::TagTone::Error
                                },
                            ),
                            _ => {
                                ui.horizontal(|ui| {
                                    if ui.small_button("Hồ sơ").clicked() {
                                        self.selected_user_id = Some(user.id.clone());
                                    }
                                    if user.activation_status != "Chờ kích hoạt"
                                        && user.activation_status != "Đã nghỉ việc"
                                        && user.id != session.user.id
                                        && ui
                                            .small_button(if user.is_active {
                                                "Khóa"
                                            } else {
                                                "Mở khóa"
                                            })
                                            .clicked()
                                    {
                                        status_change = Some((user.id.clone(), !user.is_active));
                                    }
                                });
                            }
                        }
                    },
                );
            }

            ui.add_space(8.0);
            let page_count = self.pagination_total.div_ceil(USERS_PAGE_SIZE).max(1);
            ui.horizontal(|ui| {
                if ui
                    .add_enabled(self.page > 1 && !self.loading, egui::Button::new("‹ Trước"))
                    .clicked()
                {
                    self.page -= 1;
                    self.needs_reload = true;
                }
                ui.label(format!("Trang {} / {}", self.page, page_count));
                if ui
                    .add_enabled(
                        self.page < page_count && !self.loading,
                        egui::Button::new("Tiếp ›"),
                    )
                    .clicked()
                {
                    self.page += 1;
                    self.needs_reload = true;
                }
            });
        });

        if let Some((user_id, is_active)) = status_change {
            self.status_task = Some(api.set_user_active_task(session, &user_id, is_active));
            self.error.clear();
            self.notice.clear();
        }

        self.render_create_dialog(ui, session, api);
        self.render_user_profile(ui);
    }

    fn render_create_dialog(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if !self.add_open {
            return;
        }

        let mut should_create = false;
        let mut cancel = false;
        let busy = self.create_task.is_some();
        let (_, close) = crate::widgets::modal(
            ui.ctx(),
            "users.create",
            "Tạo Mới Tài Khoản Người Dùng & Phân Quyền",
            560.0,
            busy,
            |ui| {
                ui.add_space(14.0);
                crate::widgets::form_input(
                    ui,
                    "user.code",
                    "Tên đăng nhập (Username)",
                    true,
                    &mut self.new_employee_code,
                    "Ví dụ: NV001",
                    false,
                );
                crate::widgets::form_input(
                    ui,
                    "user.name",
                    "Họ và tên người dùng",
                    true,
                    &mut self.new_name,
                    "Nhập họ và tên...",
                    false,
                );
                crate::widgets::form_input(
                    ui,
                    "user.email",
                    "Email doanh nghiệp",
                    true,
                    &mut self.new_email,
                    "Nhập email doanh nghiệp...",
                    false,
                );
                crate::widgets::form_input(
                    ui,
                    "user.password",
                    "Mật khẩu khởi tạo",
                    true,
                    &mut self.new_password,
                    "Ít nhất 12 ký tự",
                    true,
                );
                crate::widgets::form_field(
                    ui,
                    "user.role",
                    "Vai trò & Nhóm quyền RBAC",
                    false,
                    |ui| {
                        egui::ComboBox::from_id_salt("admin_user_role")
                            .width(ui.available_width())
                            .selected_text(if self.new_role == "ADMIN" {
                                "Quản trị viên (ADMIN)"
                            } else {
                                "Nhân viên (USER)"
                            })
                            .show_ui(ui, |ui| {
                                ui.selectable_value(
                                    &mut self.new_role,
                                    "USER".to_owned(),
                                    "Nhân viên (USER)",
                                );
                                ui.selectable_value(
                                    &mut self.new_role,
                                    "ADMIN".to_owned(),
                                    "Quản trị viên (ADMIN)",
                                );
                            });
                    },
                );
                crate::widgets::form_input(
                    ui,
                    "user.department",
                    "Phòng ban trực thuộc",
                    true,
                    &mut self.new_department,
                    "Nhập phòng ban...",
                    false,
                );
                crate::widgets::form_field(
                    ui,
                    "user.2fa",
                    "Bắt buộc xác thực 2 bước (2FA)",
                    false,
                    |ui| {
                        ui.label(
                            RichText::new("Chưa có API cấu hình 2FA")
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                    },
                );
                if !self.form_error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
                    ui.add_space(6.0);
                }
                if busy {
                    ui.horizontal(|ui| {
                        ui.spinner();
                        ui.label("Đang tạo tài khoản trên máy chủ...");
                    });
                }
                ui.add_space(18.0);
                crate::widgets::action_row(ui, |ui| {
                    if ui
                        .add_enabled(
                            !busy,
                            egui::Button::new(
                                RichText::new("Khởi tạo tài khoản").color(Color32::WHITE),
                            )
                            .fill(crate::theme::PRIMARY)
                            .min_size(egui::vec2(0.0, 32.0)),
                        )
                        .clicked()
                    {
                        should_create = true;
                    }
                    if ui
                        .add_enabled(
                            !busy,
                            egui::Button::new("Hủy").min_size(egui::vec2(0.0, 32.0)),
                        )
                        .clicked()
                    {
                        cancel = true;
                    }
                });
            },
        );
        if close {
            cancel = true;
        }

        if cancel || !self.add_open {
            self.add_open = false;
            self.clear_form();
        } else if should_create {
            match validate_new_user(
                &self.new_name,
                &self.new_email,
                &self.new_employee_code,
                &self.new_department,
                &self.new_password,
            ) {
                Err(error) => self.form_error = error,
                Ok(()) => {
                    self.form_error.clear();
                    self.create_task = Some(api.create_user_task(
                        session,
                        self.new_name.trim(),
                        self.new_email.trim(),
                        self.new_employee_code.trim(),
                        self.new_department.trim(),
                        &self.new_password,
                        &self.new_role,
                    ));
                }
            }
        }
    }

    fn render_user_profile(&mut self, ui: &mut Ui) {
        let Some(user) = self
            .selected_user_id
            .as_deref()
            .and_then(|id| self.users.iter().find(|user| user.id == id))
            .cloned()
        else {
            return;
        };

        let mut open = true;
        egui::Window::new("Hồ sơ tài khoản")
            .open(&mut open)
            .collapsible(false)
            .resizable(false)
            .default_width(420.0)
            .show(ui.ctx(), |ui| {
                ui.label(RichText::new(&user.name).heading());
                ui.label(format!("Mã nhân viên: {}", nonempty(&user.employee_code)));
                ui.label(format!("Email: {}", user.email));
                ui.label(format!("Phòng ban: {}", nonempty(&user.department)));
                ui.label(format!("Chức danh: {}", nonempty(&user.position)));
                ui.label(format!("Điện thoại: {}", nonempty(&user.phone)));
                ui.label(format!(
                    "Vai trò: {}",
                    if user.role == "ADMIN" {
                        "Quản trị viên"
                    } else {
                        "Nhân viên"
                    }
                ));
                ui.label(format!(
                    "Trạng thái: {}",
                    if user.is_active {
                        "Hoạt động"
                    } else {
                        &user.activation_status
                    }
                ));
                ui.label(format!("Tạo lúc: {}", nonempty(&user.created_at)));
                ui.separator();
                ui.label("Trạng thái 2FA và lần đăng nhập cuối chưa có API dữ liệu trong backend hiện tại.");
            });
        if !open {
            self.selected_user_id = None;
        }
    }
}

fn nonempty(value: &str) -> &str {
    if value.trim().is_empty() {
        "Chưa có dữ liệu"
    } else {
        value
    }
}

fn validate_new_user(
    name: &str,
    email: &str,
    employee_code: &str,
    department: &str,
    password: &str,
) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("Vui lòng nhập họ và tên.".to_owned());
    }
    if !email.trim().contains('@') || email.trim().starts_with('@') {
        return Err("Vui lòng nhập email hợp lệ.".to_owned());
    }
    if employee_code.trim().is_empty() {
        return Err("Vui lòng nhập mã nhân viên.".to_owned());
    }
    if department.trim().is_empty() {
        return Err("Vui lòng nhập phòng ban.".to_owned());
    }
    if password.chars().count() < 12 {
        return Err("Mật khẩu phải có ít nhất 12 ký tự.".to_owned());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{UserFilter, UsersView};
    use crate::{api::UsersSummary, models::AdminUser};

    fn admin_user() -> AdminUser {
        AdminUser {
            id: "admin-user".to_owned(),
            email: "admin@example.test".to_owned(),
            name: "Admin User".to_owned(),
            role: "ADMIN".to_owned(),
            is_active: true,
            employee_code: "ADM-001".to_owned(),
            phone: String::new(),
            department: "Finance".to_owned(),
            position: "Admin".to_owned(),
            activation_status: "active".to_owned(),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn account_filters_match_supported_server_contract() {
        assert_eq!(UserFilter::All.api_value(), "all");
        assert_eq!(UserFilter::Active.api_value(), "active");
        assert_eq!(UserFilter::Locked.api_value(), "locked");
        assert_eq!(UserFilter::Admin.api_value(), "admin");
        assert_eq!(UserFilter::Retired.api_value(), "retired");
    }

    #[test]
    fn switching_accounts_clears_directory_and_unsaved_account_data() {
        let mut view = UsersView::default();
        view.users.push(admin_user());
        view.summary = Some(UsersSummary {
            total: 1,
            active: 1,
            admins: 1,
        });
        view.pagination_total = 1;
        view.search = "Finance".to_owned();
        view.filter = UserFilter::Admin;
        view.selected_user_id = Some("admin-user".to_owned());
        view.add_open = true;
        view.new_password = "Unsubmitted-Password-123!".to_owned();
        view.notice = "Previous account notice".to_owned();

        view.switch_account("second-admin");

        assert!(view.users.is_empty());
        assert_eq!(view.summary, None);
        assert_eq!(view.pagination_total, 0);
        assert_eq!(view.search, "");
        assert_eq!(view.filter, UserFilter::All);
        assert_eq!(view.selected_user_id, None);
        assert!(!view.add_open);
        assert_eq!(view.new_password, "");
        assert_eq!(view.notice, "");
        assert_eq!(view.loaded_for.as_deref(), Some("second-admin"));
        assert!(view.needs_reload);
    }
}
