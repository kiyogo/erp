use std::time::Duration;

use crate::{
    api::{
        ApiClient, ApiTask, EmployeeActivationResponse, EmployeeCreateResponse,
        EmployeeListResponse, EmployeeResponse,
    },
    models::{Employee, Session},
};
use egui::{Color32, RichText, Ui};

const EMPLOYEE_PAGE_SIZE: usize = 8;
const EMPLOYMENT_STATUSES: [&str; 4] = ["Chính thức", "Thử việc", "Nghỉ thai sản", "Tạm hoãn"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
enum StatusFilter {
    #[default]
    All,
    Official,
    Probation,
    Maternity,
    Suspended,
    Retired,
}

impl StatusFilter {
    fn label(self) -> &'static str {
        match self {
            Self::All => "Tất cả trạng thái",
            Self::Official => "Chính thức",
            Self::Probation => "Thử việc",
            Self::Maternity => "Nghỉ thai sản",
            Self::Suspended => "Tạm hoãn",
            Self::Retired => "Đã nghỉ việc",
        }
    }

    fn matches(self, employee: &Employee) -> bool {
        match self {
            Self::All => true,
            Self::Official => employee.status == "Chính thức",
            Self::Probation => employee.status == "Thử việc",
            Self::Maternity => employee.status == "Nghỉ thai sản",
            Self::Suspended => employee.status == "Tạm hoãn",
            Self::Retired => employee.status == "Đã nghỉ việc",
        }
    }
}

pub struct EmployeesView {
    employees: Vec<Employee>,
    list_task: Option<ApiTask<EmployeeListResponse>>,
    create_task: Option<ApiTask<EmployeeCreateResponse>>,
    update_task: Option<ApiTask<EmployeeResponse>>,
    retire_task: Option<ApiTask<EmployeeResponse>>,
    activation_task: Option<ApiTask<EmployeeActivationResponse>>,
    loaded_for: Option<String>,
    needs_reload: bool,
    loading: bool,
    error: String,
    notice: String,
    search: String,
    status_filter: StatusFilter,
    department_filter: String,
    page: usize,
    form_open: bool,
    editing_id: Option<String>,
    selected_id: Option<String>,
    confirm_retire: Option<Employee>,
    confirm_activation: Option<Employee>,
    code: String,
    name: String,
    email: String,
    phone: String,
    department: String,
    position: String,
    status: String,
    join_date: String,
    salary_base: String,
    form_error: String,
}

impl Default for EmployeesView {
    fn default() -> Self {
        Self {
            employees: Vec::new(),
            list_task: None,
            create_task: None,
            update_task: None,
            retire_task: None,
            activation_task: None,
            loaded_for: None,
            needs_reload: true,
            loading: false,
            error: String::new(),
            notice: String::new(),
            search: String::new(),
            status_filter: StatusFilter::All,
            department_filter: String::new(),
            page: 1,
            form_open: false,
            editing_id: None,
            selected_id: None,
            confirm_retire: None,
            confirm_activation: None,
            code: String::new(),
            name: String::new(),
            email: String::new(),
            phone: String::new(),
            department: String::new(),
            position: String::new(),
            status: EMPLOYMENT_STATUSES[0].to_owned(),
            join_date: String::new(),
            salary_base: "0".to_owned(),
            form_error: String::new(),
        }
    }
}

impl EmployeesView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn mutation_pending(&self) -> bool {
        self.create_task.is_some()
            || self.update_task.is_some()
            || self.retire_task.is_some()
            || self.activation_task.is_some()
    }

    fn clear_form(&mut self) {
        self.code.clear();
        self.name.clear();
        self.email.clear();
        self.phone.clear();
        self.department.clear();
        self.position.clear();
        self.status = EMPLOYMENT_STATUSES[0].to_owned();
        self.join_date.clear();
        self.salary_base = "0".to_owned();
        self.form_error.clear();
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        self.loading = true;
        self.error.clear();
        self.list_task = Some(api.list_employees_task(session));
        self.needs_reload = false;
    }

    fn poll_requests(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.loaded_for = Some(session.user.id.clone());
            self.employees.clear();
            self.page = 1;
            self.needs_reload = true;
        }

        if self.needs_reload && self.list_task.is_none() && !self.mutation_pending() {
            self.request_reload(session, api);
        }

        if let Some(result) = self.list_task.as_ref().and_then(ApiClient::poll) {
            self.list_task = None;
            self.loading = false;
            match result {
                Ok(response) => {
                    self.employees = response.data;
                    self.page = 1;
                }
                Err(error) => self.error = error,
            }
        }

        if let Some(result) = self.create_task.as_ref().and_then(ApiClient::poll) {
            self.create_task = None;
            match result {
                Ok(response) => {
                    self.notice = delivery_notice(
                        &response.employee.name,
                        &response.employee.email,
                        &response.delivery.status,
                        response.delivery.message.as_deref(),
                        true,
                    );
                    self.form_open = false;
                    self.editing_id = None;
                    self.clear_form();
                    self.needs_reload = true;
                }
                Err(error) => self.form_error = error,
            }
        }

        if let Some(result) = self.update_task.as_ref().and_then(ApiClient::poll) {
            self.update_task = None;
            match result {
                Ok(response) => {
                    self.notice = format!("Đã lưu hồ sơ nhân viên {}.", response.employee.name);
                    self.form_open = false;
                    self.editing_id = None;
                    self.clear_form();
                    self.needs_reload = true;
                }
                Err(error) => self.form_error = error,
            }
        }

        if let Some(result) = self.retire_task.as_ref().and_then(ApiClient::poll) {
            self.retire_task = None;
            self.confirm_retire = None;
            match result {
                Ok(response) => {
                    self.notice = format!(
                        "Đã ngừng nhân sự {} và khóa tài khoản; hồ sơ được giữ lại.",
                        response.employee.name
                    );
                    self.needs_reload = true;
                }
                Err(error) => self.error = error,
            }
        }

        if let Some(result) = self.activation_task.as_ref().and_then(ApiClient::poll) {
            self.activation_task = None;
            self.confirm_activation = None;
            match result {
                Ok(response) => {
                    self.notice = delivery_notice(
                        "",
                        "",
                        &response.delivery.status,
                        response.delivery.message.as_deref(),
                        false,
                    );
                    self.needs_reload = true;
                }
                Err(error) => self.error = error,
            }
        }

        if self.list_task.is_some() || self.mutation_pending() {
            ui.ctx().request_repaint_after(Duration::from_millis(80));
        }
    }

    fn begin_create(&mut self) {
        self.editing_id = None;
        self.clear_form();
        self.form_open = true;
    }

    fn begin_edit(&mut self, employee: &Employee) {
        self.editing_id = Some(employee.id.clone());
        self.code = employee.code.clone();
        self.name = employee.name.clone();
        self.email = employee.email.clone();
        self.phone = employee.phone.clone();
        self.department = employee.department.clone();
        self.position = employee.position.clone();
        self.status = if EMPLOYMENT_STATUSES.contains(&employee.status.as_str()) {
            employee.status.clone()
        } else {
            EMPLOYMENT_STATUSES[0].to_owned()
        };
        self.join_date = employee.join_date.clone();
        self.salary_base = employee.salary_base.to_string();
        self.form_error.clear();
        self.form_open = true;
    }

    pub fn render(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Chỉ quản trị viên mới có thể quản lý hồ sơ nhân viên.");
            return;
        }

        self.poll_requests(ui, session, api);
        let mut action: Option<EmployeeAction> = None;
        let mut edit_employee: Option<Employee> = None;
        let mut open_profile: Option<String> = None;

        ui.vertical(|ui| {
            ui.spacing_mut().item_spacing.y = 0.0;
            ui.add_space(8.0);

            if !self.notice.is_empty() {
                ui.add_space(8.0);
                ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
            }
            if !self.error.is_empty() {
                ui.add_space(6.0);
                ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
            }
            if self.employees.iter().any(|employee| {
                !employee.is_active && employee.status != "Đã nghỉ việc"
            }) {
                ui.add_space(6.0);
                ui.colored_label(
                    Color32::from_rgb(180, 83, 9),
                    "Có tài khoản chờ kích hoạt. Dịch vụ email chưa được cấu hình; yêu cầu gửi lại bị từ chối và không làm mất liên kết hiện có.",
                );
            }

            let official = self
                .employees
                .iter()
                .filter(|employee| employee.status == "Chính thức")
                .count();
            let probation = self
                .employees
                .iter()
                .filter(|employee| employee.status == "Thử việc")
                .count();
            let salary_total = self
                .employees
                .iter()
                .fold(0_i64, |sum, employee| sum.saturating_add(employee.salary_base));
            let percentage = if self.employees.is_empty() {0.0} else {official as f64 * 100.0 / self.employees.len() as f64};
            crate::widgets::metrics(ui, "employees.metrics", &[
                crate::widgets::Metric { value_size:24.0,label:"Tổng quy mô nhân sự hiện diện",value:format!("{} Nhân sự",self.employees.len()), detail:"Hồ sơ nhân sự trên hệ thống",color:Color32::from_rgb(0,150,136)},
                crate::widgets::Metric { value_size:24.0,label:"Nhân sự chính thức (Ký HĐLĐ)",value:format!("{official} ({percentage:.0}%)"),detail:"Theo trạng thái hồ sơ nhân sự",color:Color32::from_rgb(22,163,74)},
                crate::widgets::Metric { value_size:24.0,label:"Nhân sự đang thử việc",value:format!("{probation} Nhân sự"),detail:"Theo trạng thái hồ sơ nhân sự",color:Color32::from_rgb(217,119,6)},
                crate::widgets::Metric { value_size:24.0,label:"Tổng quỹ lương cơ bản / Tháng",value:format!("{:.2} Tỷ VNĐ",salary_total as f64/1_000_000_000.0),detail:"Tổng lương cơ bản trong hồ sơ",color:Color32::from_rgb(37,99,235)},
            ]);

            ui.add_space(16.0);
            self.render_toolbar(ui);

            ui.add_space(12.0);
            if self.loading && self.employees.is_empty() {
                ui.horizontal(|ui| {
                    ui.spinner();
                    ui.label("Đang tải hồ sơ nhân viên...");
                });
            } else {
                let search = self.search.trim().to_lowercase();
                let filtered = self
                    .employees
                    .iter()
                    .filter(|employee| self.status_filter.matches(employee))
                    .filter(|employee| {
                        self.department_filter.is_empty()
                            || employee
                                .department
                                .split(',')
                                .any(|value| value.trim() == self.department_filter)
                    })
                    .filter(|employee| {
                        search.is_empty()
                            || employee.name.to_lowercase().contains(&search)
                            || employee.code.to_lowercase().contains(&search)
                            || employee.email.to_lowercase().contains(&search)
                            || employee.phone.to_lowercase().contains(&search)
                    })
                    .cloned()
                    .collect::<Vec<_>>();
                let page_count = filtered.len().div_ceil(EMPLOYEE_PAGE_SIZE).max(1);
                self.page = self.page.clamp(1, page_count);
                let page_rows = filtered
                    .iter()
                    .skip((self.page - 1) * EMPLOYEE_PAGE_SIZE)
                    .take(EMPLOYEE_PAGE_SIZE)
                    .cloned()
                    .collect::<Vec<_>>();

                let flexible=(ui.available_width().max(1130.0)-702.0).max(428.0);
                let columns=[
                    crate::widgets::TableColumn{title:"Mã & Họ tên nhân viên",width:flexible*0.53027},
                    crate::widgets::TableColumn{title:"Đơn vị & Chức danh",width:flexible*0.46973},
                    crate::widgets::TableColumn{title:"Điện thoại",width:140.0},
                    crate::widgets::TableColumn{title:"Lương cơ bản",width:160.0},
                    crate::widgets::TableColumn{title:"Trạng thái",width:150.0},
                    crate::widgets::TableColumn{title:"Thao tác",width:250.0},
                ];
                crate::widgets::table(ui,"employees.table",&columns,page_rows.len(),|ui,row,column| {
                    let employee=&page_rows[row];
                    match column {
                                        0 => { ui.vertical(|ui| {
                                            ui.label(RichText::new(&employee.name).strong());
                                            ui.label(RichText::new(&employee.code).small().color(Color32::from_rgb(0, 150, 136)));
                                            ui.label(RichText::new(&employee.email).small());
                                        }); },
                                        1 => { ui.vertical(|ui| {
                                            ui.label(if employee.department.trim().is_empty() {
                                                "Chưa phân bổ"
                                            } else {
                                                &employee.department
                                            });
                                            ui.label(RichText::new(if employee.position.trim().is_empty() {
                                                "Nhân viên"
                                            } else {
                                                &employee.position
                                            }).small().color(Color32::from_rgb(37, 99, 235)));
                                        }); },
                                        2 => { ui.label(if employee.phone.is_empty() { "—" } else { &employee.phone }); },
                                        3 => { ui.label(format!("{} ₫", format_vnd_signed(employee.salary_base))); },
                                        4 => { ui.vertical(|ui| {
                                            let status_color = match employee.status.as_str() {
                                                "Chính thức" => Color32::from_rgb(22, 101, 52),
                                                "Thử việc" => Color32::from_rgb(180, 83, 9),
                                                "Đã nghỉ việc" => Color32::from_rgb(185, 28, 28),
                                                _ => Color32::GRAY,
                                            };
                                            ui.colored_label(status_color, &employee.status);
                                            if !employee.is_active && employee.status != "Đã nghỉ việc" {
                                                ui.colored_label(Color32::from_rgb(180, 83, 9), "Chờ kích hoạt");
                                            }
                                        }); },
                                        _ => { ui.horizontal_wrapped(|ui| {
                                            if ui.small_button("Hồ sơ").clicked() {
                                                open_profile = Some(employee.id.clone());
                                            }
                                            if ui.small_button("Sửa").clicked() {
                                                edit_employee = Some(employee.clone());
                                            }
                                            if employee.status != "Đã nghỉ việc"
                                                && employee.id != session.user.id
                                                && ui.small_button("Ngừng").clicked()
                                            {
                                                action = Some(EmployeeAction::ConfirmRetire(employee.clone()));
                                            }
                                            if !employee.is_active
                                                && employee.status != "Đã nghỉ việc"
                                                && ui.small_button("Gửi link").clicked()
                                            {
                                                action = Some(EmployeeAction::ConfirmActivation(employee.clone()));
                                            }
                                        }); },
                    }
                });

                if !filtered.is_empty() {
                ui.add_space(8.0);
                ui.horizontal(|ui| {
                    if ui
                        .add_enabled(self.page > 1, egui::Button::new("‹ Trước"))
                        .clicked()
                    {
                        self.page -= 1;
                    }
                    ui.label(format!("Trang {} / {} · {} hồ sơ", self.page, page_count, filtered.len()));
                    if ui
                        .add_enabled(self.page < page_count, egui::Button::new("Tiếp ›"))
                        .clicked()
                    {
                        self.page += 1;
                    }
                });
                }
            }
        });

        if let Some(employee) = edit_employee {
            self.begin_edit(&employee);
        }
        if let Some(id) = open_profile {
            self.selected_id = Some(id);
        }
        if let Some(action) = action {
            match action {
                EmployeeAction::ConfirmRetire(employee) => self.confirm_retire = Some(employee),
                EmployeeAction::ConfirmActivation(employee) => {
                    self.confirm_activation = Some(employee)
                }
            }
        }

        self.render_form(ui, session, api);
        self.render_profile(ui);
        self.render_retire_confirmation(ui, session, api);
        self.render_activation_confirmation(ui, session, api);
    }

    fn render_toolbar(&mut self, ui: &mut Ui) {
        let compact = ui.ctx().screen_rect().width() <= 992.0;
        let (bounds, _) = ui.allocate_exact_size(
            egui::vec2(ui.available_width(), if compact { 148.0 } else { 32.0 }),
            egui::Sense::hover(),
        );
        let mut x = bounds.left();
        for (filter, label, width) in [
            (StatusFilter::All, "Tất cả nhân sự", 104.0),
            (StatusFilter::Official, "Chính thức", 82.0),
            (StatusFilter::Probation, "Thử việc", 76.0),
        ] {
            let active = self.status_filter == filter;
            let rect = egui::Rect::from_min_size(
                egui::pos2(x, bounds.top() + if compact { 0.0 } else { 4.0 }),
                egui::vec2(width, if compact { 28.0 } else { 24.0 }),
            );
            let button = egui::Button::new(
                RichText::new(label)
                    .size(if compact { 13.0 } else { 12.0 })
                    .color(if active {
                        Color32::from_rgb(0, 121, 107)
                    } else {
                        Color32::from_rgb(71, 85, 105)
                    }),
            )
            .fill(if active {
                Color32::from_rgb(224, 242, 241)
            } else {
                Color32::WHITE
            })
            .stroke(egui::Stroke::new(
                1.0,
                if active {
                    crate::theme::PRIMARY
                } else {
                    Color32::from_rgb(203, 213, 225)
                },
            ));
            if crate::widgets::put(ui, rect, button).clicked() {
                self.status_filter = filter;
                self.page = 1;
            }
            x += width + 6.0;
        }
        let menu_rect =
            egui::Rect::from_min_size(egui::pos2(x, bounds.top()), egui::vec2(28.0, 28.0));
        let mut menu_ui = ui.new_child(
            egui::UiBuilder::new()
                .id_salt("employees.extra_filters")
                .max_rect(menu_rect),
        );
        menu_ui.spacing_mut().button_padding = egui::vec2(4.0, 2.0);
        menu_ui.spacing_mut().interact_size.y = 28.0;
        menu_ui.menu_button("…", |ui| {
            for filter in [
                StatusFilter::All,
                StatusFilter::Official,
                StatusFilter::Probation,
                StatusFilter::Maternity,
                StatusFilter::Suspended,
                StatusFilter::Retired,
            ] {
                if ui
                    .selectable_value(&mut self.status_filter, filter, filter.label())
                    .clicked()
                {
                    self.page = 1;
                    ui.close_menu();
                }
            }
            if ui
                .add_enabled(
                    self.list_task.is_none() && !self.mutation_pending(),
                    egui::Button::new("Làm mới"),
                )
                .clicked()
            {
                self.needs_reload = true;
                ui.close_menu();
            }
        });
        let search_rect = egui::Rect::from_min_size(
            if compact {
                bounds.min + egui::vec2(0.0, 36.0)
            } else {
                egui::pos2(bounds.right() - 611.0, bounds.top())
            },
            egui::vec2(if compact { bounds.width() } else { 240.0 }, 32.0),
        );
        crate::widgets::put(
            ui,
            search_rect,
            egui::TextEdit::singleline(&mut self.search)
                .hint_text("Tìm theo tên, mã NV, email, SĐT...")
                .font(egui::FontId::new(
                    14.0,
                    egui::FontFamily::Name("legacy-controls".into()),
                )),
        );
        let department_rect = egui::Rect::from_min_size(
            if compact {
                bounds.min + egui::vec2(0.0, 76.0)
            } else {
                egui::pos2(search_rect.right() + 8.0, bounds.top())
            },
            egui::vec2(if compact { bounds.width() } else { 200.0 }, 32.0),
        );
        let departments = self.department_options();
        let mut department_ui = ui.new_child(
            egui::UiBuilder::new()
                .id_salt("employees.department")
                .max_rect(department_rect),
        );
        department_ui.spacing_mut().interact_size.y = 32.0;
        egui::ComboBox::from_id_salt("employees_department_filter")
            .width(department_rect.width())
            .selected_text(if self.department_filter.is_empty() {
                "Tất cả đơn vị"
            } else {
                &self.department_filter
            })
            .show_ui(&mut department_ui, |ui| {
                ui.selectable_value(&mut self.department_filter, String::new(), "Tất cả đơn vị");
                for department in &departments {
                    ui.selectable_value(
                        &mut self.department_filter,
                        department.clone(),
                        department,
                    );
                }
            });
        // The app has no Excel export. Do not copy the legacy success-only button.
        let add_rect = egui::Rect::from_min_size(
            if compact {
                bounds.min + egui::vec2(0.0, 116.0)
            } else {
                egui::pos2(bounds.right() - 155.0, bounds.top())
            },
            egui::vec2(155.0, 32.0),
        );
        if crate::widgets::put(
            ui,
            add_rect,
            egui::Button::new(RichText::new("+  Thêm nhân viên").color(Color32::WHITE))
                .fill(crate::theme::PRIMARY),
        )
        .clicked()
        {
            self.begin_create();
        }
        crate::visual_test::record("employees.toolbar", bounds);
        crate::visual_test::record("employees.add", add_rect);
    }

    fn department_options(&self) -> Vec<String> {
        let mut options = self
            .employees
            .iter()
            .flat_map(|employee| employee.department.split(','))
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>();
        options.sort_by_key(|value| value.to_lowercase());
        options.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
        options
    }

    fn render_form(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if !self.form_open {
            return;
        }
        let mut open = self.form_open;
        let mut submit = false;
        let mut cancel = false;
        let pending = self.create_task.is_some() || self.update_task.is_some();
        let title = if self.editing_id.is_some() {
            "Chỉnh sửa hồ sơ nhân viên"
        } else {
            "Thêm mới nhân sự"
        };
        let (_, close) =
            crate::widgets::modal(ui.ctx(), "employees.edit", title, 600.0, pending, |ui| {
                ui.columns(2, |columns| {
                    crate::widgets::form_input(
                        &mut columns[0],
                        "employee.code",
                        "Mã nhân viên",
                        true,
                        &mut self.code,
                        "Nhập mã nhân viên...",
                        false,
                    );
                    crate::widgets::form_input(
                        &mut columns[1],
                        "employee.name",
                        "Họ và tên",
                        true,
                        &mut self.name,
                        "Nhập họ và tên nhân viên...",
                        false,
                    );
                });
                ui.columns(2, |columns| {
                    crate::widgets::form_input(
                        &mut columns[0],
                        "employee.email",
                        "Email công việc",
                        true,
                        &mut self.email,
                        "Nhập email công việc...",
                        false,
                    );
                    crate::widgets::form_input(
                        &mut columns[1],
                        "employee.phone",
                        "Số điện thoại",
                        false,
                        &mut self.phone,
                        "Nhập số điện thoại...",
                        false,
                    );
                });
                ui.columns(2, |columns| {
                    crate::widgets::form_input(
                        &mut columns[0],
                        "employee.department",
                        "Đơn vị",
                        false,
                        &mut self.department,
                        "Nhiều đơn vị cách nhau bằng dấu phẩy",
                        false,
                    );
                    crate::widgets::form_input(
                        &mut columns[1],
                        "employee.position",
                        "Chức danh",
                        false,
                        &mut self.position,
                        "Nhập chức danh...",
                        false,
                    );
                });
                ui.columns(3, |columns| {
                    crate::widgets::form_input(
                        &mut columns[0],
                        "employee.salary",
                        "Lương cơ bản (VNĐ)",
                        false,
                        &mut self.salary_base,
                        "Nhập lương cơ bản...",
                        false,
                    );
                    crate::widgets::form_field(
                        &mut columns[1],
                        "employee.status",
                        "Trạng thái",
                        false,
                        |ui| {
                            egui::ComboBox::from_id_salt("employee_form_status")
                                .width(ui.available_width())
                                .selected_text(&self.status)
                                .show_ui(ui, |ui| {
                                    for status in EMPLOYMENT_STATUSES {
                                        ui.selectable_value(
                                            &mut self.status,
                                            status.to_owned(),
                                            status,
                                        );
                                    }
                                });
                        },
                    );
                    crate::widgets::form_date(
                        &mut columns[2],
                        "employee.join_date",
                        "Ngày vào làm",
                        false,
                        &mut self.join_date,
                    );
                });
                if !self.form_error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
                    ui.add_space(6.0);
                }
                if pending {
                    ui.horizontal(|ui| {
                        ui.spinner();
                        ui.label("Đang lưu hồ sơ trên máy chủ...");
                    });
                }
                ui.add_space(6.0);
                crate::widgets::action_row(ui, |ui| {
                    if ui
                        .add_enabled(
                            !pending,
                            egui::Button::new(
                                RichText::new(if self.editing_id.is_some() {
                                    "Lưu cập nhật"
                                } else {
                                    "Thêm nhân viên"
                                })
                                .color(Color32::WHITE),
                            )
                            .fill(crate::theme::PRIMARY)
                            .min_size(egui::vec2(0.0, 32.0)),
                        )
                        .clicked()
                    {
                        submit = true;
                    }
                    if ui
                        .add_enabled(
                            !pending,
                            egui::Button::new("Hủy").min_size(egui::vec2(0.0, 32.0)),
                        )
                        .clicked()
                    {
                        cancel = true;
                    }
                });
            });
        if close {
            open = false;
        }

        if cancel || (!open && !pending) {
            self.form_open = false;
            self.editing_id = None;
            self.clear_form();
        } else {
            self.form_open = open || pending;
        }

        if submit {
            match validate_employee_form(
                &self.code,
                &self.name,
                &self.email,
                &self.join_date,
                &self.salary_base,
                &self.status,
            ) {
                Err(error) => self.form_error = error,
                Ok(salary_base) => {
                    self.form_error.clear();
                    if let Some(employee_id) = self.editing_id.as_deref() {
                        self.update_task = Some(api.update_employee_task(
                            session,
                            employee_id,
                            self.code.trim(),
                            self.name.trim(),
                            self.email.trim(),
                            self.phone.trim(),
                            self.department.trim(),
                            self.position.trim(),
                            &self.status,
                            self.join_date.trim(),
                            salary_base,
                        ));
                    } else {
                        self.create_task = Some(api.create_employee_task(
                            session,
                            self.code.trim(),
                            self.name.trim(),
                            self.email.trim(),
                            self.phone.trim(),
                            self.department.trim(),
                            self.position.trim(),
                            &self.status,
                            self.join_date.trim(),
                            salary_base,
                        ));
                    }
                }
            }
        }
    }

    fn render_profile(&mut self, ui: &mut Ui) {
        let Some(employee) = self
            .selected_id
            .as_deref()
            .and_then(|id| self.employees.iter().find(|employee| employee.id == id))
            .cloned()
        else {
            return;
        };
        let mut open = true;
        egui::Window::new("Hồ sơ nhân viên")
            .id(egui::Id::new("employee_profile_dialog"))
            .open(&mut open)
            .collapsible(false)
            .resizable(false)
            .show(ui.ctx(), |ui| {
                ui.heading(&employee.name);
                ui.label(format!("Mã nhân viên: {}", nonempty(&employee.code)));
                ui.label(format!("Email: {}", nonempty(&employee.email)));
                ui.label(format!("Điện thoại: {}", nonempty(&employee.phone)));
                ui.label(format!("Đơn vị: {}", nonempty(&employee.department)));
                ui.label(format!("Chức danh: {}", nonempty(&employee.position)));
                ui.label(format!("Trạng thái: {}", nonempty(&employee.status)));
                ui.label(format!("Ngày vào làm: {}", nonempty(&employee.join_date)));
                ui.label(format!(
                    "Lương cơ bản: {} ₫",
                    format_vnd_signed(employee.salary_base)
                ));
                ui.label(format!(
                    "Tài khoản: {}",
                    if employee.is_active {
                        "Đã kích hoạt"
                    } else {
                        &employee.activation_status
                    }
                ));
                ui.add_space(8.0);
                if ui.button("Sửa hồ sơ").clicked() {
                    self.begin_edit(&employee);
                    self.selected_id = None;
                }
            });
        if !open {
            self.selected_id = None;
        }
    }

    fn render_retire_confirmation(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        let Some(employee) = self.confirm_retire.clone() else {
            return;
        };
        let mut open = true;
        let pending = self.retire_task.is_some();
        let mut confirm = false;
        let mut cancel = false;
        egui::Window::new("Xác nhận ngừng nhân sự")
            .id(egui::Id::new("employee_retire_confirmation"))
            .collapsible(false)
            .resizable(false)
            .open(&mut open)
            .show(ui.ctx(), |ui| {
                ui.label(format!(
                    "Tài khoản {} ({}) sẽ bị khóa; hồ sơ được giữ lại để đối soát.",
                    employee.name, employee.code
                ));
                ui.add_space(8.0);
                if pending {
                    ui.spinner();
                    ui.label("Đang cập nhật trạng thái...");
                }
                ui.horizontal(|ui| {
                    if ui.add_enabled(!pending, egui::Button::new("Hủy")).clicked() {
                        cancel = true;
                    }
                    if ui
                        .add_enabled(!pending, egui::Button::new("Ngừng nhân sự"))
                        .clicked()
                    {
                        confirm = true;
                    }
                });
            });
        if cancel || (!open && !pending) {
            self.confirm_retire = None;
        }
        if confirm && self.retire_task.is_none() {
            self.retire_task = Some(api.retire_employee_task(session, &employee.id));
            self.error.clear();
            self.notice.clear();
        }
    }

    fn render_activation_confirmation(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        let Some(employee) = self.confirm_activation.clone() else {
            return;
        };
        let mut open = true;
        let pending = self.activation_task.is_some();
        let mut confirm = false;
        let mut cancel = false;
        egui::Window::new("Tạo lại liên kết kích hoạt")
            .id(egui::Id::new("employee_activation_confirmation"))
            .collapsible(false)
            .resizable(false)
            .open(&mut open)
            .show(ui.ctx(), |ui| {
                ui.label(format!(
                    "Yêu cầu gửi lại liên kết cho {} ({}). Khi email chưa cấu hình, máy chủ từ chối và giữ nguyên liên kết hiện tại; khi gửi được, liên kết cũ sẽ hết hiệu lực.",
                    employee.name, employee.email
                ));
                ui.add_space(8.0);
                if pending {
                    ui.spinner();
                    ui.label("Đang tạo liên kết...");
                }
                ui.horizontal(|ui| {
                    if ui.add_enabled(!pending, egui::Button::new("Hủy")).clicked() {
                        cancel = true;
                    }
                    if ui.add_enabled(!pending, egui::Button::new("Gửi lại liên kết")).clicked() {
                        confirm = true;
                    }
                });
            });
        if cancel || (!open && !pending) {
            self.confirm_activation = None;
        }
        if confirm && self.activation_task.is_none() {
            self.activation_task = Some(api.resend_employee_activation_task(session, &employee.id));
            self.error.clear();
            self.notice.clear();
        }
    }
}

enum EmployeeAction {
    ConfirmRetire(Employee),
    ConfirmActivation(Employee),
}

fn nonempty(value: &str) -> &str {
    if value.trim().is_empty() {
        "Chưa có dữ liệu"
    } else {
        value
    }
}

pub fn format_vnd(amount: u64) -> String {
    group_vnd_digits(&amount.to_string())
}

fn format_vnd_signed(amount: i64) -> String {
    let raw = amount.unsigned_abs().to_string();
    let formatted = group_vnd_digits(&raw);
    if amount < 0 {
        format!("-{formatted}")
    } else {
        formatted
    }
}

fn group_vnd_digits(raw: &str) -> String {
    let mut formatted = String::with_capacity(raw.len() + raw.len() / 3);
    for (index, digit) in raw.chars().enumerate() {
        if index > 0 && (raw.len() - index) % 3 == 0 {
            formatted.push('.');
        }
        formatted.push(digit);
    }
    formatted
}

fn delivery_notice(
    name: &str,
    email: &str,
    status: &str,
    message: Option<&str>,
    created: bool,
) -> String {
    let recipient = if name.is_empty() {
        "tài khoản nhân viên".to_owned()
    } else {
        format!("{name} ({email})")
    };
    match status {
        "sent" => format!("Đã gửi liên kết kích hoạt tới {recipient}."),
        "failed" => format!(
            "Đã tạo liên kết nhưng gửi email thất bại: {}",
            message.unwrap_or("lỗi SMTP")
        ),
        _ if created => format!(
            "Đã tạo hồ sơ và tài khoản chờ kích hoạt cho {recipient}; email CHƯA được gửi. {}",
            message
                .unwrap_or("Cần cấu hình dịch vụ email trước khi nhân viên có thể nhận liên kết.")
        ),
        _ => format!(
            "Đã tạo lại liên kết nhưng email CHƯA được gửi. {}",
            message.unwrap_or("Cần cấu hình dịch vụ email để chuyển liên kết cho nhân viên.")
        ),
    }
}

fn validate_employee_form(
    code: &str,
    name: &str,
    email: &str,
    join_date: &str,
    salary_base: &str,
    status: &str,
) -> Result<i64, String> {
    if code.trim().is_empty() {
        return Err("Vui lòng nhập mã nhân viên.".to_owned());
    }
    if name.trim().is_empty() {
        return Err("Vui lòng nhập họ và tên.".to_owned());
    }
    let email = email.trim();
    if !email.contains('@') || email.starts_with('@') || email.ends_with('@') {
        return Err("Vui lòng nhập email hợp lệ.".to_owned());
    }
    if !join_date.trim().is_empty()
        && chrono::NaiveDate::parse_from_str(join_date.trim(), "%Y-%m-%d").is_err()
    {
        return Err("Ngày vào làm phải có định dạng YYYY-MM-DD.".to_owned());
    }
    let salary_base = salary_base
        .trim()
        .parse::<i64>()
        .map_err(|_| "Lương cơ bản phải là số nguyên không âm.".to_owned())?;
    if salary_base < 0 {
        return Err("Lương cơ bản không được âm.".to_owned());
    }
    if !EMPLOYMENT_STATUSES.contains(&status) {
        return Err("Trạng thái nhân sự không được hỗ trợ.".to_owned());
    }
    Ok(salary_base)
}

#[cfg(test)]
mod tests {
    use super::{format_vnd, format_vnd_signed, validate_employee_form};

    #[test]
    fn salary_format_preserves_vietnamese_grouping_and_sign() {
        assert_eq!(format_vnd(35_000_000), "35.000.000");
        assert_eq!(format_vnd(u64::MAX), "18.446.744.073.709.551.615");
        assert_eq!(format_vnd_signed(-1_250_000), "-1.250.000");
    }

    #[test]
    fn employee_form_rejects_invalid_required_fields_and_negative_salary() {
        assert!(validate_employee_form("", "Name", "a@b.test", "", "0", "Chính thức").is_err());
        assert!(
            validate_employee_form("NV-1", "Name", "a@b.test", "", "-1", "Chính thức").is_err()
        );
        assert!(
            validate_employee_form("NV-1", "Name", "a@b.test", "", "25000000", "Thử việc").is_ok()
        );
        assert!(
            validate_employee_form("NV-1", "Name", "a@b.test", "2026-02-31", "1", "Chính thức")
                .is_err()
        );
    }
}
