use crate::{
    api::{ApiClient, ApiTask, EmployeeListResponse, OrgUnitsResponse},
    models::{Employee, OrgUnit, Session},
    views::employees::format_vnd,
};
use egui::{Color32, RichText, Ui, Vec2};
use std::collections::HashSet;
use std::time::Duration;

const UNIT_STATUSES: [&str; 3] = ["Đang hoạt động", "Tái cấu trúc", "Tạm ngưng"];

pub struct OrgUnitsView {
    units: Vec<OrgUnit>,
    employees: Vec<Employee>,
    units_task: Option<ApiTask<OrgUnitsResponse>>,
    employees_task: Option<ApiTask<EmployeeListResponse>>,
    save_task: Option<ApiTask<OrgUnitsResponse>>,
    delete_task: Option<ApiTask<bool>>,
    confirm_delete: Option<OrgUnit>,
    loaded_for: Option<String>,
    loading: bool,
    error: String,
    notice: String,
    search: String,
    status_filter: String,
    editor_open: bool,
    editing_key: Option<String>,
    code: String,
    name: String,
    parent_unit: String,
    manager: String,
    manager_email: String,
    manager_phone: String,
    headcount_limit: String,
    location: String,
    established_date: String,
    annual_budget: String,
    budget_spent: String,
    status: String,
    form_error: String,
}

impl Default for OrgUnitsView {
    fn default() -> Self {
        Self {
            units: Vec::new(),
            employees: Vec::new(),
            units_task: None,
            employees_task: None,
            save_task: None,
            delete_task: None,
            confirm_delete: None,
            loaded_for: None,
            loading: false,
            error: String::new(),
            notice: String::new(),
            search: String::new(),
            status_filter: "all".to_owned(),
            editor_open: false,
            editing_key: None,
            code: String::new(),
            name: String::new(),
            parent_unit: String::new(),
            manager: String::new(),
            manager_email: String::new(),
            manager_phone: String::new(),
            headcount_limit: "0".to_owned(),
            location: String::new(),
            established_date: String::new(),
            annual_budget: "0".to_owned(),
            budget_spent: "0".to_owned(),
            status: UNIT_STATUSES[0].to_owned(),
            form_error: String::new(),
        }
    }
}

impl OrgUnitsView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        self.error.clear();
        self.loading = true;
        self.units_task = Some(api.list_org_units_task(session));
        self.employees_task = Some(api.list_employees_task(session));
    }

    fn poll(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.loaded_for = Some(session.user.id.clone());
            self.units.clear();
            self.employees.clear();
            self.request_reload(session, api);
        }

        if let Some(result) = self.units_task.as_ref().and_then(ApiClient::poll) {
            self.units_task = None;
            match result {
                Ok(response) => self.units = normalize_loaded_units(response.data),
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.employees_task.as_ref().and_then(ApiClient::poll) {
            self.employees_task = None;
            match result {
                Ok(response) => self.employees = response.data,
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.save_task.as_ref().and_then(ApiClient::poll) {
            self.save_task = None;
            match result {
                Ok(response) => {
                    self.units = response.data;
                    self.editor_open = false;
                    self.editing_key = None;
                    self.form_error.clear();
                    self.notice = "Đã lưu cơ cấu đơn vị lên máy chủ.".to_owned();
                    self.request_reload(session, api);
                }
                Err(error) => self.form_error = error,
            }
        }
        if let Some(result) = self.delete_task.as_ref().and_then(ApiClient::poll) {
            self.delete_task = None;
            self.confirm_delete = None;
            match result {
                Ok(true) => {
                    self.notice =
                        "Đã xóa đơn vị và cập nhật hồ sơ nhân sự liên quan.".to_owned();
                    self.request_reload(session, api);
                }
                Ok(false) => self.error = "Máy chủ chưa xác nhận xóa đơn vị.".to_owned(),
                Err(error) => self.error = error,
            }
        }

        self.loading = self.units_task.is_some() || self.employees_task.is_some();
        if self.loading || self.save_task.is_some() || self.delete_task.is_some() {
            ui.ctx().request_repaint_after(Duration::from_millis(80));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        self.poll(ui, session, api);
        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new("CƠ CẤU TỔ CHỨC")
                            .size(11.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.heading("Phòng ban & Đơn vị");
                    ui.label("Dữ liệu đơn vị và quân số lấy từ API nhân sự.");
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui
                        .add_enabled(
                            !self.loading
                                && self.save_task.is_none()
                                && self.delete_task.is_none(),
                            egui::Button::new("+ Thêm đơn vị"),
                        )
                        .clicked()
                    {
                        self.begin_create();
                    }
                    if ui
                        .add_enabled(
                            !self.loading
                                && self.save_task.is_none()
                                && self.delete_task.is_none(),
                            egui::Button::new("Tải lại"),
                        )
                        .clicked()
                    {
                        self.request_reload(session, api);
                    }
                    if self.delete_task.is_some() {
                        ui.spinner();
                    }
                });
            });

            if !self.error.is_empty() {
                ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                if ui.button("Thử tải lại").clicked() {
                    self.request_reload(session, api);
                }
            }
            if !self.notice.is_empty() {
                ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
            }
            if self.loading {
                ui.horizontal(|ui| {
                    ui.spinner();
                    ui.label("Đang tải đơn vị và hồ sơ nhân viên...");
                });
            }

            let display_units = self.units_with_actual_headcount();
            let total_headcount = display_units.iter().fold(0_u64, |sum, unit| {
                sum.saturating_add(unit.actual_headcount)
            });
            let total_capacity = display_units.iter().fold(0_u64, |sum, unit| {
                sum.saturating_add(unit.headcount_limit)
            });
            let total_budget = display_units.iter().fold(0_u64, |sum, unit| {
                sum.saturating_add(unit.annual_budget)
            });
            ui.add_space(10.0);
            ui.columns(3, |columns| {
                summary_card(&mut columns[0], "Tổng đơn vị", &display_units.len().to_string());
                summary_card(
                    &mut columns[1],
                    "Nhân sự / định biên",
                    &format!("{total_headcount} / {total_capacity}"),
                );
                summary_card(
                    &mut columns[2],
                    "Tổng ngân sách năm",
                    &format!("{} ₫", format_vnd(total_budget)),
                );
            });

            ui.add_space(10.0);
            ui.horizontal_wrapped(|ui| {
                ui.label("Tìm kiếm:");
                ui.add(
                    egui::TextEdit::singleline(&mut self.search)
                        .hint_text("Tên, mã, trưởng đơn vị, đơn vị cấp trên")
                        .desired_width(300.0),
                );
                egui::ComboBox::from_id_salt("org_units_status_filter")
                    .selected_text(match self.status_filter.as_str() {
                        "all" => "Tất cả trạng thái",
                        value => value,
                    })
                    .show_ui(ui, |ui| {
                        ui.selectable_value(&mut self.status_filter, "all".to_owned(), "Tất cả trạng thái");
                        for status in UNIT_STATUSES {
                            ui.selectable_value(&mut self.status_filter, status.to_owned(), status);
                        }
                    });
            });

            let keyword = normalize(&self.search);
            let filtered = display_units
                .into_iter()
                .filter(|unit| self.status_filter == "all" || unit.status == self.status_filter)
                .filter(|unit| {
                    keyword.is_empty()
                        || normalize(&unit.name).contains(&keyword)
                        || normalize(&unit.code).contains(&keyword)
                        || normalize(&unit.manager).contains(&keyword)
                        || normalize(&unit.parent_unit).contains(&keyword)
                })
                .collect::<Vec<_>>();

            ui.add_space(8.0);
            if filtered.is_empty() && !self.loading && self.error.is_empty() {
                egui::Frame::group(ui.style()).show(ui, |ui| {
                    ui.label(if self.units.is_empty() {
                        "Chưa có đơn vị nào được lưu. Thêm đơn vị đầu tiên để bắt đầu."
                    } else {
                        "Không tìm thấy đơn vị phù hợp bộ lọc."
                    });
                });
            }
            egui::ScrollArea::vertical().show(ui, |ui| {
                for unit in filtered {
                    self.render_unit_card(ui, &unit);
                    ui.add_space(8.0);
                }
            });
        });

        self.render_editor(ui, session, api);
        self.render_delete_confirmation(ui, session, api);
    }

    fn units_with_actual_headcount(&self) -> Vec<OrgUnit> {
        self.units
            .iter()
            .cloned()
            .map(|mut unit| {
                unit.actual_headcount = self
                    .employees
                    .iter()
                    .filter(|employee| employee_has_unit(employee, &unit.name))
                    .count() as u64;
                unit.headcount_limit = unit.headcount_limit.max(unit.actual_headcount);
                if let Some(manager) = self.find_employee(&unit.manager) {
                    if unit.manager_title.is_empty() || unit.manager_title == "Chưa cập nhật" {
                        unit.manager_title = manager.position.clone();
                    }
                    if unit.manager_email.is_empty() || unit.manager_email == "Chưa cập nhật" {
                        unit.manager_email = manager.email.clone();
                    }
                    if unit.manager_phone.is_empty() || unit.manager_phone == "Chưa cập nhật" {
                        unit.manager_phone = manager.phone.clone();
                    }
                }
                unit
            })
            .collect()
    }

    fn find_employee(&self, manager: &str) -> Option<&Employee> {
        let manager = manager.trim();
        let code = manager
            .rsplit_once('(')
            .map(|(_, suffix)| suffix.trim_end_matches(')').trim())
            .unwrap_or(manager);
        self.employees.iter().find(|employee| {
            employee.name.eq_ignore_ascii_case(manager)
                || employee.code.eq_ignore_ascii_case(manager)
                || employee.code.eq_ignore_ascii_case(code)
        })
    }

    fn render_unit_card(&mut self, ui: &mut Ui, unit: &OrgUnit) {
        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new(format!("{} · {}", unit.code, unit.name))
                            .size(15.0)
                            .strong(),
                    );
                    ui.label(format!(
                        "Cấp trên: {}  |  Trưởng đơn vị: {}",
                        if unit.parent_unit.is_empty() { "Cấp cao nhất" } else { &unit.parent_unit },
                        if unit.manager.is_empty() { "Chưa phân công" } else { &unit.manager }
                    ));
                    ui.label(format!(
                        "Nhân sự: {} / {}  |  Địa điểm: {}  |  Trạng thái: {}",
                        unit.actual_headcount,
                        unit.headcount_limit,
                        if unit.location.is_empty() { "Chưa cập nhật" } else { &unit.location },
                        unit.status
                    ));
                    ui.label(format!(
                        "Ngân sách năm: {} ₫  |  Đã sử dụng: {} ₫",
                        format_vnd(unit.annual_budget),
                        format_vnd(unit.budget_spent)
                    ));
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.button("Sửa").clicked() {
                        self.begin_edit(unit);
                    }
                    if ui
                        .add_enabled(self.delete_task.is_none(), egui::Button::new("Xóa"))
                        .clicked()
                    {
                        self.confirm_delete = Some(unit.clone());
                    }
                });
            });
        });
    }

    fn begin_create(&mut self) {
        self.clear_form();
        self.editing_key = None;
        self.editor_open = true;
    }

    fn begin_edit(&mut self, unit: &OrgUnit) {
        self.editing_key = Some(unit.key.clone());
        self.code = unit.code.clone();
        self.name = unit.name.clone();
        self.parent_unit = unit.parent_unit.clone();
        self.manager = unit.manager.clone();
        self.manager_email = unit.manager_email.clone();
        self.manager_phone = unit.manager_phone.clone();
        self.headcount_limit = unit.headcount_limit.to_string();
        self.location = unit.location.clone();
        self.established_date = unit.established_date.clone();
        self.annual_budget = unit.annual_budget.to_string();
        self.budget_spent = unit.budget_spent.to_string();
        self.status = if UNIT_STATUSES.contains(&unit.status.as_str()) {
            unit.status.clone()
        } else {
            UNIT_STATUSES[0].to_owned()
        };
        self.form_error.clear();
        self.editor_open = true;
    }

    fn clear_form(&mut self) {
        self.code.clear();
        self.name.clear();
        self.parent_unit.clear();
        self.manager.clear();
        self.manager_email.clear();
        self.manager_phone.clear();
        self.headcount_limit = "0".to_owned();
        self.location.clear();
        self.established_date.clear();
        self.annual_budget = "0".to_owned();
        self.budget_spent = "0".to_owned();
        self.status = UNIT_STATUSES[0].to_owned();
        self.form_error.clear();
    }

    fn render_editor(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if !self.editor_open {
            return;
        }
        let mut open = self.editor_open;
        egui::Window::new(if self.editing_key.is_some() {
            "Chỉnh sửa đơn vị"
        } else {
            "Thêm đơn vị"
        })
        .id(egui::Id::new("org_unit_editor"))
        .collapsible(false)
        .resizable(true)
        .default_width(520.0)
        .default_height(590.0)
        .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
        .open(&mut open)
        .show(ui.ctx(), |ui| {
            egui::ScrollArea::vertical().show(ui, |ui| {
                edit_field(ui, "Mã đơn vị", &mut self.code, "VD: DV-TECH");
                edit_field(ui, "Tên đơn vị / phòng ban", &mut self.name, "Tên đơn vị");
                ui.label("Đơn vị cấp trên");
                egui::ComboBox::from_id_salt("org_unit_parent")
                    .selected_text(if self.parent_unit.is_empty() { "Cấp cao nhất" } else { &self.parent_unit })
                    .show_ui(ui, |ui| {
                        ui.selectable_value(&mut self.parent_unit, String::new(), "Cấp cao nhất");
                        for unit in &self.units {
                            if Some(unit.key.as_str()) != self.editing_key.as_deref() {
                                ui.selectable_value(&mut self.parent_unit, unit.name.clone(), &unit.name);
                            }
                        }
                    });
                ui.label("Trưởng đơn vị");
                egui::ComboBox::from_id_salt("org_unit_manager")
                    .selected_text(if self.manager.is_empty() { "Chưa phân công" } else { &self.manager })
                    .show_ui(ui, |ui| {
                        ui.selectable_value(&mut self.manager, String::new(), "Chưa phân công");
                        for employee in &self.employees {
                            ui.selectable_value(
                                &mut self.manager,
                                employee.name.clone(),
                                format!("{} ({})", employee.name, employee.code),
                            );
                        }
                    });
                edit_field(ui, "Email phụ trách (tùy chọn)", &mut self.manager_email, "email@example.com");
                edit_field(ui, "Điện thoại phụ trách (tùy chọn)", &mut self.manager_phone, "Số điện thoại");
                edit_field(ui, "Định biên nhân sự", &mut self.headcount_limit, "0");
                edit_field(ui, "Địa điểm làm việc", &mut self.location, "Hà Nội / TP. Hồ Chí Minh");
                edit_field(ui, "Ngày thành lập", &mut self.established_date, "YYYY-MM-DD");
                edit_field(ui, "Ngân sách năm (VNĐ)", &mut self.annual_budget, "0");
                edit_field(ui, "Đã sử dụng (VNĐ)", &mut self.budget_spent, "0");
                ui.label("Trạng thái");
                egui::ComboBox::from_id_salt("org_unit_status")
                    .selected_text(&self.status)
                    .show_ui(ui, |ui| {
                        for status in UNIT_STATUSES {
                            ui.selectable_value(&mut self.status, status.to_owned(), status);
                        }
                    });
                if !self.form_error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
                }
                ui.add_space(10.0);
                ui.horizontal(|ui| {
                    let saving = self.save_task.is_some() || self.delete_task.is_some();
                    if ui.add_enabled(!saving, egui::Button::new("Hủy")).clicked() {
                        self.editor_open = false;
                    }
                    if ui
                        .add_enabled(!saving, egui::Button::new("Lưu đơn vị"))
                        .clicked()
                    {
                        self.submit_form(session, api);
                    }
                    if saving {
                        ui.spinner();
                        ui.label("Đang lưu...");
                    }
                });
            });
        });
        self.editor_open = open && self.editor_open;
    }

    fn render_delete_confirmation(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        let Some(unit) = self.confirm_delete.clone() else {
            return;
        };
        let has_children = self.units.iter().any(|candidate| {
            candidate.key != unit.key
                && normalize(&candidate.parent_unit) == normalize(&unit.name)
        });
        let mut open = true;
        let mut close_requested = false;
        egui::Window::new("Xác nhận xóa đơn vị")
            .id(egui::Id::new("org_unit_delete_confirmation"))
            .collapsible(false)
            .resizable(false)
            .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
            .open(&mut open)
            .show(ui.ctx(), |ui| {
                ui.set_width(360.0);
                ui.label(format!("Xóa đơn vị \"{}\"?", unit.name));
                ui.label(format!(
                    "{} hồ sơ nhân sự có đơn vị này sẽ được cập nhật nguyên tử về trạng thái chưa phân bổ.",
                    unit.actual_headcount
                ));
                if has_children {
                    ui.colored_label(
                        Color32::from_rgb(185, 28, 28),
                        "Hãy chuyển các đơn vị cấp dưới trước khi xóa đơn vị này.",
                    );
                }
                ui.horizontal(|ui| {
                    if ui
                        .add_enabled(self.delete_task.is_none(), egui::Button::new("Hủy"))
                        .clicked()
                    {
                        close_requested = true;
                    }
                    if ui
                        .add_enabled(
                            self.delete_task.is_none() && !has_children,
                            egui::Button::new("Xóa đơn vị"),
                        )
                        .clicked()
                    {
                        self.error.clear();
                        self.notice.clear();
                        self.delete_task = Some(api.delete_org_unit_task(session, &unit.key));
                    }
                    if self.delete_task.is_some() {
                        ui.spinner();
                        ui.label("Đang xóa...");
                    }
                });
            });
        if !open || close_requested {
            self.confirm_delete = None;
        }
    }

    fn submit_form(&mut self, session: &Session, api: &ApiClient) {
        let code = self.code.trim().to_uppercase();
        let name = self.name.trim().to_owned();
        if code.is_empty() || name.is_empty() {
            self.form_error = "Mã và tên đơn vị là bắt buộc.".to_owned();
            return;
        }
        if self.units.iter().any(|unit| {
            Some(unit.key.as_str()) != self.editing_key.as_deref()
                && (unit.code.eq_ignore_ascii_case(&code)
                    || normalize(&unit.name) == normalize(&name))
        }) {
            self.form_error = "Mã hoặc tên đơn vị đã tồn tại.".to_owned();
            return;
        }
        if creates_parent_cycle(
            &self.units,
            self.editing_key.as_deref(),
            &name,
            &self.parent_unit,
        ) {
            self.form_error = "Cấp trên đã tạo chu trình trong sơ đồ đơn vị.".to_owned();
            return;
        }
        if !UNIT_STATUSES.contains(&self.status.as_str()) {
            self.form_error = "Trạng thái đơn vị không hợp lệ.".to_owned();
            return;
        }
        let parsed = parse_nonnegative_fields(
            &self.headcount_limit,
            &self.annual_budget,
            &self.budget_spent,
        );
        let Ok((headcount_limit, annual_budget, budget_spent)) = parsed else {
            self.form_error = "Định biên và ngân sách phải là số nguyên không âm.".to_owned();
            return;
        };

        let manager_name = self.manager.trim().to_owned();
        let matched_manager = self.find_employee(&manager_name).cloned();
        let manager = matched_manager
            .as_ref()
            .map(|employee| employee.name.clone())
            .unwrap_or(manager_name);
        let mut unit = self
            .editing_key
            .as_deref()
            .and_then(|key| self.units.iter().find(|unit| unit.key == key))
            .cloned()
            .unwrap_or_default();
        unit.key = self
            .editing_key
            .clone()
            .unwrap_or_else(|| format!("ou-{}-{}", chrono::Utc::now().timestamp_micros(), self.units.len()));
        unit.code = code;
        unit.name = name;
        unit.parent_unit = self.parent_unit.trim().to_owned();
        unit.manager = manager;
        unit.manager_title = matched_manager
            .as_ref()
            .map(|employee| employee.position.clone())
            .unwrap_or_default();
        unit.manager_email = if self.manager_email.trim().is_empty() {
            matched_manager.as_ref().map(|employee| employee.email.clone()).unwrap_or_default()
        } else {
            self.manager_email.trim().to_owned()
        };
        unit.manager_phone = if self.manager_phone.trim().is_empty() {
            matched_manager.as_ref().map(|employee| employee.phone.clone()).unwrap_or_default()
        } else {
            self.manager_phone.trim().to_owned()
        };
        unit.headcount_limit = headcount_limit.max(unit.actual_headcount);
        unit.location = self.location.trim().to_owned();
        unit.established_date = self.established_date.trim().to_owned();
        unit.annual_budget = annual_budget;
        unit.budget_spent = budget_spent;
        unit.status = self.status.clone();

        let mut next = self.units.clone();
        if let Some(existing) = next.iter_mut().find(|existing| existing.key == unit.key) {
            *existing = unit;
        } else {
            next.push(unit);
        }
        next.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
        self.form_error.clear();
        self.notice.clear();
        self.save_task = Some(api.replace_org_units_task(session, &next));
    }
}

fn summary_card(ui: &mut Ui, label: &str, value: &str) {
    egui::Frame::group(ui.style()).show(ui, |ui| {
        ui.label(RichText::new(label).size(11.0).color(Color32::from_gray(100)));
        ui.label(RichText::new(value).size(18.0).strong());
    });
}

fn edit_field(ui: &mut Ui, label: &str, value: &mut String, hint: &str) {
    ui.label(label);
    ui.add(
        egui::TextEdit::singleline(value)
            .hint_text(hint)
            .desired_width(ui.available_width()),
    );
}

fn normalize(value: &str) -> String {
    value.trim().to_lowercase()
}

fn normalize_loaded_units(mut units: Vec<OrgUnit>) -> Vec<OrgUnit> {
    for (index, unit) in units.iter_mut().enumerate() {
        if unit.key.trim().is_empty() {
            unit.key = if !unit.id.trim().is_empty() {
                unit.id.trim().to_owned()
            } else if unit.code.trim().is_empty() {
                format!("legacy-unit-{}", index + 1)
            } else {
                unit.code.trim().to_owned()
            };
        }
        if unit.code.trim().is_empty() {
            unit.code = format!("DV-{:04}", index + 1);
        }
        if unit.status.trim().is_empty() {
            unit.status = UNIT_STATUSES[0].to_owned();
        }
    }
    units
}

fn creates_parent_cycle(
    units: &[OrgUnit],
    editing_key: Option<&str>,
    unit_name: &str,
    proposed_parent: &str,
) -> bool {
    let mut current = proposed_parent.trim().to_owned();
    let mut visited = HashSet::new();
    while !current.is_empty() {
        let normalized = normalize(&current);
        if normalized == normalize(unit_name) || !visited.insert(normalized) {
            return true;
        }
        current = units
            .iter()
            .find(|unit| {
                Some(unit.key.as_str()) != editing_key && normalize(&unit.name) == normalize(&current)
            })
            .map(|unit| unit.parent_unit.trim().to_owned())
            .unwrap_or_default();
    }
    false
}

fn employee_has_unit(employee: &Employee, unit_name: &str) -> bool {
    employee
        .department
        .split(',')
        .any(|department| normalize(department) == normalize(unit_name))
}

fn parse_nonnegative_fields(
    headcount: &str,
    annual_budget: &str,
    spent: &str,
) -> Result<(u64, u64, u64), ()> {
    let parse = |value: &str| {
        value
            .trim()
            .replace([',', '.', ' '], "")
            .parse::<u64>()
            .map_err(|_| ())
    };
    Ok((parse(headcount)?, parse(annual_budget)?, parse(spent)?))
}

#[cfg(test)]
mod tests {
    use super::{
        OrgUnitsView, creates_parent_cycle, employee_has_unit, normalize, parse_nonnegative_fields,
    };
    use crate::models::Employee;

    #[test]
    fn new_org_unit_view_has_no_fabricated_departments() {
        assert!(OrgUnitsView::default().units.is_empty());
    }

    #[test]
    fn org_unit_search_normalizes_and_counts_exact_department_tokens() {
        let employee = Employee {
            id: "employee-1".to_owned(),
            code: "NV-001".to_owned(),
            name: "Employee".to_owned(),
            email: "employee@example.test".to_owned(),
            phone: String::new(),
            department: "Finance, Operations".to_owned(),
            position: String::new(),
            status: "Chính thức".to_owned(),
            join_date: String::new(),
            salary_base: 0,
            role: "USER".to_owned(),
            is_active: true,
            activation_status: "active".to_owned(),
        };
        assert!(employee_has_unit(&employee, " finance "));
        assert!(!employee_has_unit(&employee, "Fin"));
        assert_eq!(normalize(" Operations "), "operations");
    }

    #[test]
    fn unit_form_rejects_negative_or_invalid_amounts_and_accepts_grouped_values() {
        assert_eq!(parse_nonnegative_fields("12", "1.200.000", "300000"), Ok((12, 1_200_000, 300_000)));
        assert!(parse_nonnegative_fields("-1", "0", "0").is_err());
        assert!(parse_nonnegative_fields("1", "x", "0").is_err());
    }

    #[test]
    fn org_unit_parent_validation_rejects_indirect_cycles() {
        let units = vec![
            crate::models::OrgUnit {
                key: "a".to_owned(),
                name: "A".to_owned(),
                parent_unit: "B".to_owned(),
                ..Default::default()
            },
            crate::models::OrgUnit {
                key: "b".to_owned(),
                name: "B".to_owned(),
                ..Default::default()
            },
        ];
        assert!(creates_parent_cycle(&units, Some("b"), "B", "A"));
        assert!(!creates_parent_cycle(&units, Some("b"), "B", ""));
    }
}
