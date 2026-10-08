use std::time::Duration;

use crate::{
    api::{ApiClient, ApiTask, UsersPage},
    models::{AdminUser, Session},
};
use egui::{Color32, RichText, Ui, Vec2};

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
    fn label(self) -> &'static str {
        match self {
            Self::All => "Tất cả",
            Self::Active => "Đang hoạt động",
            Self::Locked => "Đã khóa",
            Self::Admin => "Quản trị viên",
            Self::Retired => "Đã nghỉ việc",
        }
    }

    fn matches(self, user: &AdminUser) -> bool {
        match self {
            Self::All => true,
            Self::Active => user.is_active,
            Self::Locked => {
                !user.is_active
                    && user.activation_status != "Chờ kích hoạt"
                    && user.activation_status != "Đã nghỉ việc"
            }
            Self::Admin => user.role == "ADMIN",
            Self::Retired => user.activation_status == "Đã nghỉ việc",
        }
    }
}

pub struct UsersView {
    users: Vec<AdminUser>,
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
        self.list_task = Some(api.list_users_task(session, self.page, USERS_PAGE_SIZE));
        self.needs_reload = false;
    }

    fn poll_requests(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.loaded_for = Some(session.user.id.clone());
            self.needs_reload = true;
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

        if self.list_task.is_some() || self.create_task.is_some() || self.status_task.is_some() {
            ui.ctx()
                .request_repaint_after(Duration::from_millis(80));
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
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new("QUẢN TRỊ TÀI KHOẢN")
                            .size(11.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.heading("Tài khoản người dùng");
                    ui.label("Dữ liệu và thay đổi được đồng bộ trực tiếp với máy chủ.");
                });
                ui.with_layout(
                    egui::Layout::right_to_left(egui::Align::Center),
                    |ui| {
                        if ui.button("+ Thêm tài khoản").clicked() {
                            self.clear_form();
                            self.add_open = true;
                        }
                        if ui.button("Làm mới").clicked() && self.list_task.is_none() {
                            self.needs_reload = true;
                        }
                    },
                );
            });

            if !self.notice.is_empty() {
                ui.add_space(8.0);
                ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
            }
            if !self.error.is_empty() {
                ui.add_space(6.0);
                ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
            }

            ui.add_space(12.0);
            let active_count = self.users.iter().filter(|user| user.is_active).count();
            let admin_count = self
                .users
                .iter()
                .filter(|user| user.role == "ADMIN")
                .count();
            ui.horizontal(|ui| {
                metric_card(ui, "Tổng tài khoản trên trang", self.users.len(), Color32::from_rgb(0, 150, 136));
                metric_card(ui, "Đang hoạt động trên trang", active_count, Color32::from_rgb(22, 163, 74));
                metric_card(ui, "Quản trị viên trên trang", admin_count, Color32::from_rgb(124, 58, 237));
                ui.label(format!("Tổng toàn hệ thống: {}", self.pagination_total));
            });

            ui.add_space(10.0);
            ui.horizontal_wrapped(|ui| {
                for filter in [
                    UserFilter::All,
                    UserFilter::Active,
                    UserFilter::Locked,
                    UserFilter::Admin,
                    UserFilter::Retired,
                ] {
                    if ui
                        .selectable_label(self.filter == filter, filter.label())
                        .clicked()
                    {
                        self.filter = filter;
                    }
                }
                ui.add_space(8.0);
                ui.label("Tìm trên trang đang tải:");
                ui.add(
                    egui::TextEdit::singleline(&mut self.search)
                        .hint_text("Mã, họ tên, email, phòng ban hoặc vai trò")
                        .desired_width(290.0),
                );
            });

            ui.add_space(8.0);
            if self.loading && self.users.is_empty() {
                ui.horizontal(|ui| {
                    ui.spinner();
                    ui.label("Đang tải danh sách tài khoản...");
                });
            } else if self.users.is_empty() && self.error.is_empty() {
                ui.label("Chưa có tài khoản nào trên trang này.");
            } else {
                egui::Frame::group(ui.style()).show(ui, |ui| {
                    egui::ScrollArea::horizontal().show(ui, |ui| {
                        egui::Grid::new("users_grid")
                            .striped(true)
                            .min_col_width(95.0)
                            .spacing(Vec2::new(12.0, 9.0))
                            .show(ui, |ui| {
                                for title in [
                                    "Mã / Họ tên",
                                    "Email / Phòng ban",
                                    "Vai trò",
                                    "Trạng thái",
                                    "Thao tác",
                                ] {
                                    ui.label(RichText::new(title).strong());
                                }
                                ui.end_row();

                                let search = self.search.trim().to_lowercase();
                                for user in &self.users {
                                    if !self.filter.matches(user)
                                        || (!search.is_empty()
                                            && !user.employee_code.to_lowercase().contains(&search)
                                            && !user.name.to_lowercase().contains(&search)
                                            && !user.email.to_lowercase().contains(&search)
                                            && !user.department.to_lowercase().contains(&search)
                                            && !user.role.to_lowercase().contains(&search))
                                    {
                                        continue;
                                    }

                                    ui.vertical(|ui| {
                                        ui.label(RichText::new(&user.employee_code).strong());
                                        ui.label(&user.name);
                                    });
                                    ui.vertical(|ui| {
                                        ui.label(&user.email);
                                        ui.label(
                                            RichText::new(if user.department.is_empty() {
                                                "Chưa phân phòng ban"
                                            } else {
                                                &user.department
                                            })
                                            .small()
                                            .color(Color32::GRAY),
                                        );
                                    });
                                    ui.label(if user.role == "ADMIN" {
                                        "Quản trị viên"
                                    } else {
                                        "Nhân viên"
                                    });
                                    let status_text = if user.is_active {
                                        "Hoạt động"
                                    } else {
                                        &user.activation_status
                                    };
                                    ui.label(status_text);

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
                                    ui.end_row();
                                }
                            });
                    });
                });
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
        egui::Window::new("Tạo tài khoản người dùng")
            .collapsible(false)
            .resizable(false)
            .open(&mut self.add_open)
            .show(ui.ctx(), |ui| {
                ui.set_width(390.0);
                ui.label("Mã nhân viên / tên đăng nhập");
                ui.add(
                    egui::TextEdit::singleline(&mut self.new_employee_code)
                        .hint_text("Ví dụ: NV001"),
                );
                ui.add_space(6.0);
                ui.label("Họ và tên");
                ui.add(egui::TextEdit::singleline(&mut self.new_name));
                ui.add_space(6.0);
                ui.label("Email doanh nghiệp");
                ui.add(egui::TextEdit::singleline(&mut self.new_email));
                ui.add_space(6.0);
                ui.label("Phòng ban");
                ui.add(egui::TextEdit::singleline(&mut self.new_department));
                ui.add_space(6.0);
                ui.label("Vai trò");
                egui::ComboBox::from_id_salt("admin_user_role")
                    .selected_text(if self.new_role == "ADMIN" {
                        "Quản trị viên (ADMIN)"
                    } else {
                        "Nhân viên (USER)"
                    })
                    .show_ui(ui, |ui| {
                        ui.selectable_value(&mut self.new_role, "USER".to_owned(), "Nhân viên (USER)");
                        ui.selectable_value(&mut self.new_role, "ADMIN".to_owned(), "Quản trị viên (ADMIN)");
                    });
                ui.add_space(6.0);
                ui.label("Mật khẩu khởi tạo (ít nhất 12 ký tự)");
                ui.add(egui::TextEdit::singleline(&mut self.new_password).password(true));

                if !self.form_error.is_empty() {
                    ui.add_space(6.0);
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
                }
                if self.create_task.is_some() {
                    ui.horizontal(|ui| {
                        ui.spinner();
                        ui.label("Đang tạo tài khoản trên máy chủ...");
                    });
                }
                ui.add_space(10.0);
                ui.horizontal(|ui| {
                    if ui
                        .add_enabled(self.create_task.is_none(), egui::Button::new("Hủy"))
                        .clicked()
                    {
                        cancel = true;
                    }
                    if ui
                        .add_enabled(
                            self.create_task.is_none(),
                            egui::Button::new("Tạo tài khoản"),
                        )
                        .clicked()
                    {
                        should_create = true;
                    }
                });
            });

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

fn metric_card(ui: &mut Ui, label: &str, value: usize, color: Color32) {
    egui::Frame::group(ui.style()).show(ui, |ui| {
        ui.set_min_width(130.0);
        ui.label(RichText::new(label).small().color(Color32::GRAY));
        ui.label(RichText::new(value.to_string()).size(20.0).strong().color(color));
    });
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
