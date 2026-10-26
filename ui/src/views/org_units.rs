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
    page: usize,
    selected_unit: Option<OrgUnit>,
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
            page: 1,
            selected_unit: None,
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
                    self.notice = "Đã xóa đơn vị và cập nhật hồ sơ nhân sự liên quan.".to_owned();
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
        let busy = self.loading || self.save_task.is_some() || self.delete_task.is_some();
        ui.spacing_mut().item_spacing.y = 0.0;
        ui.add_space(8.0);
        if !self.error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
            if ui.button("Thử tải lại").clicked() {
                self.request_reload(session, api);
            }
        }
        if !self.notice.is_empty() {
            ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
        }
        let display = self.units_with_actual_headcount();
        let headcount = display
            .iter()
            .fold(0_u64, |n, u| n.saturating_add(u.actual_headcount));
        let capacity = display
            .iter()
            .fold(0_u64, |n, u| n.saturating_add(u.headcount_limit));
        let budget = display
            .iter()
            .fold(0_u64, |n, u| n.saturating_add(u.annual_budget));
        let locations = display
            .iter()
            .filter(|u| !u.location.trim().is_empty() && u.location != "Chưa cập nhật")
            .map(|u| normalize(&u.location))
            .collect::<HashSet<_>>()
            .len();
        let occupancy = format!(
            "Tỷ lệ lấp đầy định biên: {}%",
            fill_percent(headcount, capacity)
        );
        crate::widgets::metrics(
            ui,
            "org.metrics",
            &[
                crate::widgets::Metric {
                    label: "Tổng số phòng ban & đơn vị",
                    value: format!("{} đơn vị", display.len()),
                    detail: "Tổng hợp theo dữ liệu phòng ban đang có nhân sự hoạt động",
                    color: crate::theme::PRIMARY,
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Định biên & nhân sự hiện hữu",
                    value: format!("{headcount} / {capacity} nhân sự"),
                    detail: &occupancy,
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Tổng ngân sách vận hành",
                    value: if budget > 0 {
                        format!("{:.1} Tỷ VNĐ", budget as f64 / 1_000_000_000.0)
                    } else {
                        "Chưa cập nhật".to_owned()
                    },
                    detail: "Đồng bộ từ cấu hình đơn vị đã lưu",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Địa điểm hoạt động",
                    value: locations.to_string(),
                    detail: "Đếm từ các đơn vị đã khai báo địa điểm rõ ràng",
                    color: Color32::from_rgb(124, 58, 237),
                    value_size: 24.0,
                },
            ],
        );
        ui.add_space(16.0);
        let statuses = ["all", "Đang hoạt động", "Tái cấu trúc", "Tạm ngưng"];
        let selected = statuses
            .iter()
            .position(|v| *v == self.status_filter)
            .unwrap_or(0);
        let toolbar = crate::widgets::filter_toolbar_with_more(
            ui,
            "org",
            &["Tất cả đơn vị", "Đang hoạt động", "Tái cấu trúc"],
            selected,
            &mut self.search,
            "Tìm theo tên phòng ban, mã đơn vị, trưởng đơn vị...",
            "+ Thêm đơn vị mới",
            false,
            usize::MAX,
            |ui| {
                if ui
                    .selectable_value(&mut self.status_filter, "Tạm ngưng".to_owned(), "Tạm ngưng")
                    .clicked()
                {
                    self.page = 1;
                    ui.close_menu();
                }
            },
        );
        if let Some(index) = toolbar.selected {
            self.status_filter = statuses[index].to_owned();
            self.page = 1;
        }
        if toolbar.search_changed {
            self.page = 1;
        }
        if toolbar.create_clicked && !busy {
            self.begin_create();
        }
        if toolbar.reload_clicked && !busy {
            self.request_reload(session, api);
        }
        if self.loading {
            ui.spinner();
        }
        let query = normalize(&self.search);
        let filtered = display
            .into_iter()
            .filter(|u| self.status_filter == "all" || self.status_filter == u.status)
            .filter(|u| {
                query.is_empty()
                    || [&u.name, &u.code, &u.manager, &u.parent_unit]
                        .iter()
                        .any(|v| normalize(v).contains(&query))
            })
            .collect::<Vec<_>>();
        let pages = filtered.len().div_ceil(8).max(1);
        self.page = self.page.clamp(1, pages);
        let shown = filtered
            .iter()
            .skip((self.page - 1) * 8)
            .take(8)
            .collect::<Vec<_>>();
        ui.add_space(12.0);
        let width = (ui.available_width() - 2.0).max(1240.0);
        let scale = width / 1240.0;
        let titles = [
            "Mã & Tên Đơn Vị",
            "Trưởng đơn vị",
            "Định biên nhân sự",
            "Ngân sách năm",
            "Địa điểm làm việc",
            "Trạng thái",
            "Thao tác",
        ];
        let widths = [220.0, 200.0, 170.0, 160.0, 220.0, 130.0, 140.0];
        let columns = titles
            .iter()
            .zip(widths)
            .map(|(title, w)| crate::widgets::TableColumn {
                title,
                width: w * scale,
            })
            .collect::<Vec<_>>();
        crate::widgets::table_with_row_height(
            ui,
            "org.table",
            &columns,
            shown.len(),
            57.5,
            |ui, row, col| {
                let unit = shown[row];
                match col {
                    0 => {
                        ui.label(
                            RichText::new(&unit.name)
                                .size(13.5)
                                .strong()
                                .color(Color32::from_rgb(15, 23, 42)),
                        );
                        ui.label(
                            RichText::new(format!(
                                "Mã: {} · Trực thuộc: {}",
                                unit.code,
                                if unit.parent_unit.is_empty() {
                                    "Cấp cao nhất"
                                } else {
                                    &unit.parent_unit
                                }
                            ))
                            .size(11.5)
                            .color(crate::theme::PRIMARY),
                        );
                    }
                    1 => {
                        ui.label(
                            RichText::new(if unit.manager.is_empty() {
                                "Chưa phân công"
                            } else {
                                &unit.manager
                            })
                            .size(13.0)
                            .strong(),
                        );
                        if !unit.manager_title.is_empty() && unit.manager_title != "Chưa cập nhật"
                        {
                            ui.label(
                                RichText::new(&unit.manager_title)
                                    .size(11.5)
                                    .color(Color32::from_rgb(37, 99, 235)),
                            );
                        }
                        if !unit.manager_phone.is_empty() && unit.manager_phone != "Chưa cập nhật"
                        {
                            ui.label(
                                RichText::new(&unit.manager_phone)
                                    .size(11.0)
                                    .color(Color32::from_rgb(100, 116, 139)),
                            );
                        }
                    }
                    2 => {
                        let rate = fill_percent(unit.actual_headcount, unit.headcount_limit);
                        ui.label(
                            RichText::new(format!(
                                "{} / {} người     {rate}%",
                                unit.actual_headcount, unit.headcount_limit
                            ))
                            .size(11.5),
                        );
                        ui.add(
                            egui::ProgressBar::new(rate as f32 / 100.0)
                                .desired_height(6.0)
                                .fill(crate::theme::PRIMARY),
                        );
                    }
                    3 => {
                        ui.label(
                            RichText::new(if unit.annual_budget > 0 {
                                format!("{:.2} tỷ ₫", unit.annual_budget as f64 / 1_000_000_000.0)
                            } else {
                                "Chưa cập nhật".to_owned()
                            })
                            .size(13.0)
                            .strong()
                            .color(Color32::from_rgb(22, 163, 74)),
                        );
                    }
                    4 => {
                        ui.label(
                            RichText::new(if unit.location.is_empty() {
                                "Chưa cập nhật"
                            } else {
                                &unit.location
                            })
                            .size(12.0)
                            .color(Color32::from_rgb(71, 85, 105)),
                        );
                    }
                    5 => crate::widgets::tag(
                        ui,
                        &unit.status,
                        if unit.status == UNIT_STATUSES[0] {
                            crate::widgets::TagTone::Success
                        } else {
                            crate::widgets::TagTone::Warning
                        },
                    ),
                    _ => {
                        ui.add_enabled_ui(!busy, |ui| {
                            ui.horizontal(|ui| {
                                if ui.small_button("Xem").clicked() {
                                    self.selected_unit = Some(unit.clone());
                                }
                                if ui.small_button("Sửa").clicked() {
                                    self.begin_edit(unit);
                                }
                                if ui.small_button("Xóa").clicked() {
                                    self.confirm_delete = Some(unit.clone());
                                }
                            })
                        });
                    }
                }
            },
        );
        ui.add_space(10.0);
        crate::widgets::action_row(ui, |ui| {
            if ui
                .add_enabled(self.page < pages, egui::Button::new("›"))
                .clicked()
            {
                self.page += 1;
            }
            ui.label(format!("{} / {}", self.page, pages));
            if ui
                .add_enabled(self.page > 1, egui::Button::new("‹"))
                .clicked()
            {
                self.page -= 1;
            }
        });
        if let Some(unit) = self.selected_unit.clone() {
            let mut open = true;
            egui::Window::new("Chi tiết đơn vị tổ chức")
                .open(&mut open)
                .show(ui.ctx(), |ui| {
                    ui.label(RichText::new(&unit.name).strong());
                    for (label, value) in [
                        ("Mã đơn vị", unit.code.clone()),
                        ("Cấp trên", unit.parent_unit.clone()),
                        ("Trưởng đơn vị", unit.manager.clone()),
                        ("Chức danh", unit.manager_title.clone()),
                        ("Email", unit.manager_email.clone()),
                        ("Điện thoại", unit.manager_phone.clone()),
                        ("Địa điểm", unit.location.clone()),
                        ("Ngày thành lập", unit.established_date.clone()),
                        ("Ngân sách năm", format_vnd(unit.annual_budget)),
                        ("Đã sử dụng", format_vnd(unit.budget_spent)),
                        ("Trạng thái", unit.status.clone()),
                    ] {
                        ui.label(format!("{label}: {value}"));
                    }
                });
            if !open {
                self.selected_unit = None;
            }
        }
        self.render_editor(ui, session, api);
        self.render_delete_confirmation(ui, session, api);
    }

    pub fn render_chart(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        self.poll(ui, session, api);
        let units = self.units_with_actual_headcount();
        let rows = org_chart_rows(&units);
        let active_people = self
            .employees
            .iter()
            .filter(|employee| employee.is_active && employee.status != "Đã nghỉ việc")
            .count();
        let assigned_units = units
            .iter()
            .filter(|unit| !unit.manager.trim().is_empty())
            .count();

        ui.add_space(8.0);
        ui.heading("Sơ đồ doanh nghiệp");
        ui.label("Cơ cấu đơn vị theo quan hệ cấp trên đã lưu trên máy chủ.");
        ui.add_space(12.0);
        crate::widgets::metrics(
            ui,
            "org.chart.metrics",
            &[
                crate::widgets::Metric {
                    label: "Quy mô nhân sự đang hoạt động",
                    value: if self.loading {
                        "Đang tải".to_owned()
                    } else {
                        format!("{active_people} nhân sự")
                    },
                    detail: "Từ hồ sơ nhân sự hiện có",
                    color: crate::theme::PRIMARY,
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Số đơn vị",
                    value: if self.loading {
                        "Đang tải".to_owned()
                    } else {
                        units.len().to_string()
                    },
                    detail: "Từ cấu hình đơn vị đã lưu",
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Đơn vị có người phụ trách khai báo",
                    value: assigned_units.to_string(),
                    detail: "Không suy đoán trưởng đơn vị",
                    color: Color32::from_rgb(124, 58, 237),
                    value_size: 24.0,
                },
            ],
        );

        ui.horizontal(|ui| {
            ui.label("Nhấp vào một đơn vị để xem thông tin đã khai báo.");
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.add_enabled_ui(false, |ui| {
                    ui.button("Xuất sơ đồ")
                        .on_hover_text("Chưa có chức năng xuất sơ đồ thật.");
                });
                if ui.button("Làm mới").clicked() && !self.loading {
                    self.request_reload(session, api);
                }
            });
        });
        ui.add_space(8.0);

        egui::Frame::group(ui.style())
            .fill(Color32::WHITE)
            .inner_margin(egui::Margin::symmetric(18.0, 20.0))
            .show(ui, |ui| {
                ui.set_min_height(320.0);
                if self.loading && units.is_empty() {
                    ui.horizontal(|ui| {
                        ui.spinner();
                        ui.label("Đang tải đơn vị và nhân sự từ máy chủ…");
                    });
                } else if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                } else if rows.is_empty() {
                    ui.vertical_centered(|ui| {
                        ui.add_space(36.0);
                        ui.label("Chưa có đơn vị để hiển thị sơ đồ.");
                        ui.label("Thêm đơn vị trong mục Đơn vị tổ chức để bắt đầu.");
                    });
                } else {
                    for (depth, index) in rows {
                        let unit = &units[index];
                        ui.horizontal(|ui| {
                            ui.add_space(depth as f32 * 28.0);
                            if depth > 0 {
                                ui.label(RichText::new("└─").color(crate::theme::PRIMARY));
                            }
                            egui::Frame::group(ui.style())
                                .fill(if depth == 0 {
                                    Color32::from_rgb(240, 253, 250)
                                } else {
                                    Color32::from_rgb(248, 250, 252)
                                })
                                .inner_margin(egui::Margin::symmetric(14.0, 10.0))
                                .show(ui, |ui| {
                                    ui.set_min_width((ui.available_width() - 40.0).max(220.0));
                                    ui.horizontal(|ui| {
                                        ui.vertical(|ui| {
                                            ui.label(
                                                RichText::new(&unit.name)
                                                    .strong()
                                                    .color(Color32::from_rgb(15, 23, 42)),
                                            );
                                            ui.label(
                                                RichText::new(format!(
                                                    "{} · Trực thuộc: {}",
                                                    unit.code,
                                                    if unit.parent_unit.is_empty() {
                                                        "Cấp cao nhất"
                                                    } else {
                                                        &unit.parent_unit
                                                    }
                                                ))
                                                .size(11.5)
                                                .color(crate::theme::PRIMARY),
                                            );
                                        });
                                        ui.with_layout(
                                            egui::Layout::right_to_left(egui::Align::Center),
                                            |ui| {
                                                if ui.button("Chi tiết").clicked() {
                                                    self.selected_unit = Some(unit.clone());
                                                }
                                                ui.label(format!(
                                                    "{} / {} người",
                                                    unit.actual_headcount, unit.headcount_limit
                                                ));
                                                ui.label(if unit.manager.trim().is_empty() {
                                                    "Chưa phân công"
                                                } else {
                                                    &unit.manager
                                                });
                                            },
                                        );
                                    });
                                });
                        });
                        ui.add_space(8.0);
                    }
                }
            });

        if let Some(unit) = self.selected_unit.clone() {
            let mut open = true;
            egui::Window::new("Chi tiết đơn vị tổ chức")
                .open(&mut open)
                .show(ui.ctx(), |ui| {
                    ui.label(RichText::new(&unit.name).strong());
                    for (label, value) in [
                        ("Mã đơn vị", unit.code.clone()),
                        ("Cấp trên", unit.parent_unit.clone()),
                        ("Trưởng đơn vị", unit.manager.clone()),
                        ("Chức danh", unit.manager_title.clone()),
                        ("Email", unit.manager_email.clone()),
                        ("Điện thoại", unit.manager_phone.clone()),
                        ("Địa điểm", unit.location.clone()),
                        ("Ngày thành lập", unit.established_date.clone()),
                        ("Trạng thái", unit.status.clone()),
                    ] {
                        ui.label(format!("{label}: {value}"));
                    }
                });
            if !open {
                self.selected_unit = None;
            }
        }
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
        let busy = self.save_task.is_some() || self.delete_task.is_some();
        let mut submit = false;
        let mut cancel = false;
        let title = if self.editing_key.is_some() {
            "Chỉnh sửa thông tin đơn vị tổ chức"
        } else {
            "Thêm mới đơn vị phòng ban"
        };
        let (_, closed) = crate::widgets::modal(ui.ctx(), "org.edit", title, 680.0, busy, |ui| {
            ui.columns(2, |columns| {
                crate::widgets::form_input(
                    &mut columns[0],
                    "org.code",
                    "Mã đơn vị",
                    true,
                    &mut self.code,
                    "VD: DV-TECH",
                    false,
                );
                crate::widgets::form_field(
                    &mut columns[1],
                    "org.parent",
                    "Đơn vị cấp trên",
                    false,
                    |ui| {
                        egui::ComboBox::from_id_salt("org_unit_parent")
                            .width(ui.available_width())
                            .selected_text(if self.parent_unit.is_empty() {
                                "Chọn đơn vị cấp trên..."
                            } else {
                                &self.parent_unit
                            })
                            .show_ui(ui, |ui| {
                                ui.selectable_value(
                                    &mut self.parent_unit,
                                    String::new(),
                                    "Cấp cao nhất",
                                );
                                for unit in &self.units {
                                    if Some(unit.key.as_str()) != self.editing_key.as_deref() {
                                        ui.selectable_value(
                                            &mut self.parent_unit,
                                            unit.name.clone(),
                                            &unit.name,
                                        );
                                    }
                                }
                            });
                    },
                );
            });
            crate::widgets::form_input(
                ui,
                "org.name",
                "Tên đơn vị / phòng ban",
                true,
                &mut self.name,
                "VD: Phòng Phát triển Phần mềm",
                false,
            );
            ui.columns(2, |columns| {
                crate::widgets::form_field(
                    &mut columns[0],
                    "org.manager",
                    "Trưởng đơn vị",
                    false,
                    |ui| {
                        egui::ComboBox::from_id_salt("org_unit_manager")
                            .width(ui.available_width())
                            .selected_text(if self.manager.is_empty() {
                                "Chọn nhân sự trưởng đơn vị..."
                            } else {
                                &self.manager
                            })
                            .show_ui(ui, |ui| {
                                ui.selectable_value(
                                    &mut self.manager,
                                    String::new(),
                                    "Chưa phân công",
                                );
                                for employee in &self.employees {
                                    ui.selectable_value(
                                        &mut self.manager,
                                        employee.name.clone(),
                                        format!("{} ({})", employee.name, employee.code),
                                    );
                                }
                            });
                    },
                );
                crate::widgets::form_input(
                    &mut columns[1],
                    "org.phone",
                    "Số điện thoại",
                    false,
                    &mut self.manager_phone,
                    "090x xxx xxx",
                    false,
                );
            });
            ui.columns(2, |columns| {
                crate::widgets::form_input(
                    &mut columns[0],
                    "org.email",
                    "Email",
                    false,
                    &mut self.manager_email,
                    "email@company.com",
                    false,
                );
                crate::widgets::form_input(
                    &mut columns[1],
                    "org.location",
                    "Địa điểm làm việc",
                    false,
                    &mut self.location,
                    "Hà Nội, TP. Hồ Chí Minh...",
                    false,
                );
            });
            ui.columns(3, |columns| {
                crate::widgets::form_input(
                    &mut columns[0],
                    "org.capacity",
                    "Định biên nhân sự",
                    false,
                    &mut self.headcount_limit,
                    "0",
                    false,
                );
                crate::widgets::form_input(
                    &mut columns[1],
                    "org.budget",
                    "Ngân sách năm (VNĐ)",
                    false,
                    &mut self.annual_budget,
                    "0",
                    false,
                );
                crate::widgets::form_field(
                    &mut columns[2],
                    "org.status",
                    "Trạng thái",
                    false,
                    |ui| {
                        egui::ComboBox::from_id_salt("org_unit_status")
                            .width(ui.available_width())
                            .selected_text(&self.status)
                            .show_ui(ui, |ui| {
                                for status in UNIT_STATUSES {
                                    ui.selectable_value(
                                        &mut self.status,
                                        status.to_owned(),
                                        status,
                                    );
                                }
                            });
                    },
                );
            });
            ui.collapsing("Thông tin bổ sung", |ui| {
                crate::widgets::form_date(
                    ui,
                    "org.established",
                    "Ngày thành lập",
                    false,
                    &mut self.established_date,
                );
                crate::widgets::form_input(
                    ui,
                    "org.spent",
                    "Đã sử dụng (VNĐ)",
                    false,
                    &mut self.budget_spent,
                    "0",
                    false,
                );
            });
            if !self.form_error.is_empty() {
                ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
            }
            if busy {
                ui.spinner();
                ui.label("Đang lưu...");
            }
            ui.add_space(18.0);
            crate::widgets::action_row(ui, |ui| {
                submit = ui
                    .add(
                        egui::Button::new(
                            RichText::new(if self.editing_key.is_some() {
                                "Lưu thay đổi"
                            } else {
                                "Thêm mới đơn vị"
                            })
                            .color(Color32::WHITE),
                        )
                        .fill(crate::theme::PRIMARY)
                        .min_size(egui::vec2(0.0, 32.0)),
                    )
                    .clicked();
                cancel = ui
                    .add(egui::Button::new("Hủy").min_size(egui::vec2(0.0, 32.0)))
                    .clicked();
            });
        });
        if !busy && (closed || cancel) {
            self.editor_open = false;
        }
        if !busy && submit {
            self.submit_form(session, api);
        }
    }

    fn render_delete_confirmation(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        let Some(unit) = self.confirm_delete.clone() else {
            return;
        };
        let has_children = self.units.iter().any(|candidate| {
            candidate.key != unit.key && normalize(&candidate.parent_unit) == normalize(&unit.name)
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
        unit.key = self.editing_key.clone().unwrap_or_else(|| {
            format!(
                "ou-{}-{}",
                chrono::Utc::now().timestamp_micros(),
                self.units.len()
            )
        });
        unit.code = code;
        unit.name = name;
        unit.parent_unit = self.parent_unit.trim().to_owned();
        unit.manager = manager;
        unit.manager_title = matched_manager
            .as_ref()
            .map(|employee| employee.position.clone())
            .unwrap_or_default();
        unit.manager_email = if self.manager_email.trim().is_empty() {
            matched_manager
                .as_ref()
                .map(|employee| employee.email.clone())
                .unwrap_or_default()
        } else {
            self.manager_email.trim().to_owned()
        };
        unit.manager_phone = if self.manager_phone.trim().is_empty() {
            matched_manager
                .as_ref()
                .map(|employee| employee.phone.clone())
                .unwrap_or_default()
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

fn org_chart_rows(units: &[OrgUnit]) -> Vec<(usize, usize)> {
    fn visit(
        index: usize,
        depth: usize,
        units: &[OrgUnit],
        visited: &mut HashSet<usize>,
        rows: &mut Vec<(usize, usize)>,
    ) {
        if !visited.insert(index) {
            return;
        }
        rows.push((depth, index));
        let parent_name = normalize(&units[index].name);
        let children = units
            .iter()
            .enumerate()
            .filter(|(_, unit)| normalize(&unit.parent_unit) == parent_name)
            .map(|(child_index, _)| child_index)
            .collect::<Vec<_>>();
        for child in children {
            visit(child, depth + 1, units, visited, rows);
        }
    }

    let mut visited = HashSet::new();
    let mut rows = Vec::with_capacity(units.len());
    for (index, unit) in units.iter().enumerate() {
        let has_parent = !unit.parent_unit.trim().is_empty()
            && units
                .iter()
                .any(|candidate| normalize(&candidate.name) == normalize(&unit.parent_unit));
        if !has_parent {
            visit(index, 0, units, &mut visited, &mut rows);
        }
    }
    // Keep orphaned and cyclic legacy records visible without recursing forever.
    for index in 0..units.len() {
        visit(index, 0, units, &mut visited, &mut rows);
    }
    rows
}

fn fill_percent(actual: u64, capacity: u64) -> u64 {
    if capacity == 0 {
        0
    } else {
        ((actual as f64 / capacity as f64 * 100.0).round() as u64).min(100)
    }
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
                Some(unit.key.as_str()) != editing_key
                    && normalize(&unit.name) == normalize(&current)
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
    fn occupancy_handles_empty_full_and_excess_capacity() {
        assert_eq!(super::fill_percent(0, 0), 0);
        assert_eq!(super::fill_percent(1, 3), 33);
        assert_eq!(super::fill_percent(100, 20), 100);
        assert_eq!(super::fill_percent(u64::MAX, u64::MAX), 100);
    }

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
            address: String::new(),
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
        assert_eq!(
            parse_nonnegative_fields("12", "1.200.000", "300000"),
            Ok((12, 1_200_000, 300_000))
        );
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
