use std::time::Duration;
use web_time::Instant;

use crate::api::{
    ApiClient, ApiTask, AttendanceShift, AttendanceShiftAssignment, AttendanceShiftAssignmentEvent,
    AttendanceShiftAssignmentEventsResponse, AttendanceShiftAssignmentResponse,
    AttendanceShiftAssignmentsResponse, AttendanceShiftsResponse, CreateAttendanceShiftAssignment,
    EmployeeListResponse,
};
use crate::models::{Employee, Session};
use crate::widgets::{self, Metric, TableColumn, TagTone};
use egui::{Color32, RichText, Ui};

#[derive(Default)]
pub struct AttendanceShiftAssignmentsView {
    assignments: Vec<AttendanceShiftAssignment>,
    employees: Vec<Employee>,
    shifts: Vec<AttendanceShift>,
    pending_load: Option<ApiTask<AttendanceShiftAssignmentsResponse>>,
    pending_employees: Option<ApiTask<EmployeeListResponse>>,
    pending_shifts: Option<ApiTask<AttendanceShiftsResponse>>,
    pending_create: Option<ApiTask<AttendanceShiftAssignmentResponse>>,
    pending_events: Option<ApiTask<AttendanceShiftAssignmentEventsResponse>>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    data_loaded: bool,
    employee_options_loaded: bool,
    shift_options_loaded: bool,
    create_open: bool,
    selected: Option<AttendanceShiftAssignment>,
    details_open: bool,
    events: Vec<AttendanceShiftAssignmentEvent>,
    events_error: String,
    search: String,
    status_filter: String,
    page: usize,
    page_size: usize,
    code: String,
    employee_id: String,
    shift_key: String,
    effective_from: String,
    effective_to: String,
    notice: String,
    error: String,
}

impl AttendanceShiftAssignmentsView {
    fn clear_form(&mut self) {
        self.code.clear();
        self.employee_id.clear();
        self.shift_key.clear();
        self.effective_from.clear();
        self.effective_to.clear();
    }

    fn load(&mut self, session: &Session, api: &ApiClient) {
        if self.pending_load.is_none()
            && self.pending_employees.is_none()
            && self.pending_shifts.is_none()
        {
            self.pending_load = Some(api.list_attendance_shift_assignments_task(session));
            self.pending_employees = Some(api.list_employees_task(session));
            self.pending_shifts = Some(api.list_attendance_shifts_task(session));
        }
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let account = format!(
            "{}\n{}\n{}",
            session.endpoint, session.user.id, session.user.role
        );
        if self.loaded_for.as_deref() != Some(account.as_str()) {
            self.assignments.clear();
            self.employees.clear();
            self.shifts.clear();
            self.pending_load = None;
            self.pending_employees = None;
            self.pending_shifts = None;
            self.pending_create = None;
            self.pending_events = None;
            self.loaded_for = Some(account);
            self.last_loaded = None;
            self.data_loaded = false;
            self.employee_options_loaded = false;
            self.shift_options_loaded = false;
            self.create_open = false;
            self.selected = None;
            self.details_open = false;
            self.events.clear();
            self.events_error.clear();
            self.search.clear();
            self.status_filter = "all".to_owned();
            self.page = 0;
            self.page_size = 8;
            self.notice.clear();
            self.error.clear();
            self.clear_form();
        }

        if self
            .last_loaded
            .is_none_or(|loaded| loaded.elapsed() >= Duration::from_secs(30))
            && self.pending_load.is_none()
            && self.pending_employees.is_none()
            && self.pending_shifts.is_none()
            && self.pending_create.is_none()
        {
            self.load(session, api);
        }

        if let Some(result) = self.pending_load.as_ref().and_then(ApiClient::poll) {
            self.pending_load = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.assignments = response.data;
                    self.data_loaded = true;
                    self.error.clear();
                }
                Err(error) => {
                    self.data_loaded = false;
                    self.error = error;
                }
            }
        }
        if let Some(result) = self.pending_employees.as_ref().and_then(ApiClient::poll) {
            self.pending_employees = None;
            match result {
                Ok(response) => {
                    self.employees = response
                        .data
                        .into_iter()
                        .filter(|employee| employee.is_active && employee.status != "Đã nghỉ việc")
                        .collect();
                    self.employee_options_loaded = true;
                    self.error.clear();
                }
                Err(error) => {
                    self.employee_options_loaded = false;
                    self.error = error;
                }
            }
        }
        if let Some(result) = self.pending_shifts.as_ref().and_then(ApiClient::poll) {
            self.pending_shifts = None;
            match result {
                Ok(response) => {
                    self.shifts = response
                        .data
                        .into_iter()
                        .filter(|shift| {
                            shift.status == "Đang áp dụng" && !shift.key.trim().is_empty()
                        })
                        .collect();
                    self.shift_options_loaded = true;
                    self.error.clear();
                }
                Err(error) => {
                    self.shift_options_loaded = false;
                    self.error = error;
                }
            }
        }
        if let Some(result) = self.pending_create.as_ref().and_then(ApiClient::poll) {
            self.pending_create = None;
            match result {
                Ok(response) => {
                    self.assignments
                        .retain(|item| item.id != response.assignment.id);
                    self.assignments.insert(0, response.assignment);
                    self.create_open = false;
                    self.clear_form();
                    self.notice = "Đã lưu lịch phân ca trên máy chủ.".to_owned();
                    self.error.clear();
                    self.last_loaded = Some(Instant::now());
                }
                Err(error) => {
                    self.notice.clear();
                    self.error = error;
                }
            }
        }
        if let Some(result) = self.pending_events.as_ref().and_then(ApiClient::poll) {
            self.pending_events = None;
            match result {
                Ok(response) => {
                    self.events = response.data;
                    self.events_error.clear();
                }
                Err(error) => self.events_error = error,
            }
        }

        if self.pending_load.is_some()
            || self.pending_employees.is_some()
            || self.pending_shifts.is_some()
            || self.pending_create.is_some()
            || self.pending_events.is_some()
        {
            ctx.request_repaint_after(Duration::from_millis(80));
        } else if let Some(last_loaded) = self.last_loaded {
            ctx.request_repaint_after(
                Duration::from_secs(30).saturating_sub(last_loaded.elapsed()),
            );
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            self.assignments.clear();
            self.employees.clear();
            self.shifts.clear();
            self.pending_load = None;
            self.pending_employees = None;
            self.pending_shifts = None;
            self.pending_create = None;
            self.pending_events = None;
            self.loaded_for = None;
            self.selected = None;
            self.events.clear();
            self.create_open = false;
            self.details_open = false;
            self.clear_form();
            ui.colored_label(
                Color32::from_rgb(185, 28, 28),
                "Chỉ ADMIN được quản lý lịch phân ca.",
            );
            return;
        }
        self.poll(ctx, session, api);

        let busy = self.pending_load.is_some() || self.pending_create.is_some();
        ui.add_space(8.0);
        let active = self
            .assignments
            .iter()
            .filter(|a| a.status == "Đang áp dụng")
            .count();
        let swaps = self
            .assignments
            .iter()
            .filter(|a| a.status == "Chờ duyệt đổi ca")
            .count();
        let labels = [
            "Tổng lịch phân ca nhân sự",
            "Lịch phân ca đang áp dụng",
            "Yêu cầu đổi ca chờ duyệt",
            "Nhân sự được phân ca",
        ];
        let values = [
            self.assignments.len().to_string(),
            active.to_string(),
            swaps.to_string(),
            self.assignments
                .iter()
                .filter(|a| a.status == "Đang áp dụng")
                .map(|a| a.employee_id.as_str())
                .collect::<std::collections::HashSet<_>>()
                .len()
                .to_string(),
        ];
        let details = [
            "Lịch đã lưu trên máy chủ",
            "Theo trạng thái lịch phân ca",
            "Theo trạng thái hồ sơ nguồn",
            "Nhân sự có lịch đang áp dụng",
        ];
        let colors = [
            crate::theme::PRIMARY,
            Color32::from_rgb(22, 163, 74),
            Color32::from_rgb(217, 119, 6),
            Color32::from_rgb(37, 99, 235),
        ];
        let cards = (0..4)
            .map(|i| Metric {
                label: labels[i],
                value: if self.data_loaded {
                    values[i].clone()
                } else {
                    "—".into()
                },
                detail: details[i],
                color: colors[i],
                value_size: 24.0,
            })
            .collect::<Vec<_>>();
        widgets::metrics(ui, "attendance.assignments.metrics", &cards);
        ui.add_space(16.0);
        let tabs = [
            "Tất cả lịch phân ca",
            "Đang áp dụng",
            "Chờ duyệt đổi ca",
            "Đã kết thúc",
        ];
        let selected = tabs
            .iter()
            .position(|s| *s == self.status_filter)
            .unwrap_or(0);
        let toolbar = widgets::filter_toolbar_with_more(
            ui,
            "attendance.assignments.toolbar",
            &tabs,
            selected,
            &mut self.search,
            "Mã lịch, nhân viên, phòng ban, mã/tên ca…",
            "Phân ca nhân sự mới",
            false,
            80,
            |ui| {
                ui.add_enabled(false, egui::Button::new("Xuất Excel"))
                    .on_disabled_hover_text("Chưa có API trả tệp lịch phân ca.");
            },
        );
        if let Some(i) = toolbar.selected {
            self.status_filter = if i == 0 { "all".into() } else { tabs[i].into() };
            self.page = 0;
        }
        if toolbar.search_changed {
            self.page = 0;
        }
        if toolbar.create_clicked
            && self.data_loaded
            && self.employee_options_loaded
            && self.shift_options_loaded
            && !busy
        {
            self.clear_form();
            self.code = format!(
                "PC-{}-{:03}",
                chrono::Utc::now().format("%Y%m%d"),
                self.assignments.len() + 1
            );
            self.effective_from = chrono::Utc::now().format("%Y-%m-%d").to_string();
            self.create_open = true;
            self.error.clear();
        }
        ui.add_space(12.0);
        if !self.notice.is_empty() {
            ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::DARK_RED, &self.error);
        }
        if busy {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải / lưu lịch phân ca…");
            });
        }
        let query = self.search.trim().to_lowercase();
        let filtered = self
            .assignments
            .iter()
            .filter(|a| {
                (self.status_filter == "all" || a.status == self.status_filter)
                    && (query.is_empty()
                        || [
                            &a.code,
                            &a.employee_name,
                            &a.employee_code,
                            &a.department,
                            &a.shift_name,
                            &a.shift_code,
                        ]
                        .iter()
                        .any(|s| s.to_lowercase().contains(&query)))
            })
            .cloned()
            .collect::<Vec<_>>();
        self.page_size = self.page_size.max(1);
        self.page = self
            .page
            .min(filtered.len().div_ceil(self.page_size).max(1) - 1);
        let rows = filtered
            .iter()
            .skip(self.page * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        let extra = (ui.available_width() - 2.0 - 1160.0).max(0.0);
        let columns = [
            TableColumn {
                title: "Mã phiếu phân ca",
                width: 150.0 + extra,
            },
            TableColumn {
                title: "Nhân sự & Phòng ban",
                width: 220.0,
            },
            TableColumn {
                title: "Ca làm việc được gán",
                width: 230.0,
            },
            TableColumn {
                title: "Thời hạn áp dụng",
                width: 230.0,
            },
            TableColumn {
                title: "Trạng thái",
                width: 220.0,
            },
            TableColumn {
                title: "Thao tác",
                width: 110.0,
            },
        ];
        if self.data_loaded {
            widgets::table(
                ui,
                "attendance.assignments.table",
                &columns,
                rows.len(),
                |ui, row, col| {
                    let a = rows[row];
                    match col {
                        0 => {
                            ui.label(RichText::new(&a.code).strong().color(crate::theme::PRIMARY));
                        }
                        1 => {
                            ui.label(RichText::new(&a.employee_name).strong());
                            ui.label(
                                RichText::new(format!("{} · {}", a.employee_code, a.department))
                                    .size(11.5),
                            );
                        }
                        2 => {
                            ui.label(RichText::new(&a.shift_name).strong());
                            ui.label(
                                RichText::new(format!("{} · {}", a.shift_code, a.time_range))
                                    .size(11.5)
                                    .color(Color32::from_rgb(37, 99, 235)),
                            );
                        }
                        3 => {
                            ui.label(format!("{} → {}", a.effective_from, a.effective_to));
                        }
                        4 => widgets::tag(
                            ui,
                            &a.status,
                            match a.status.as_str() {
                                "Đang áp dụng" => TagTone::Success,
                                "Chờ duyệt đổi ca" => TagTone::Warning,
                                _ => TagTone::Neutral,
                            },
                        ),
                        _ => {
                            if ui.button("Chi tiết").clicked() {
                                self.selected = Some(a.clone());
                                self.details_open = true;
                                self.events.clear();
                                self.events_error.clear();
                                self.pending_events =
                                    Some(api.list_attendance_shift_assignment_events_task(
                                        session, &a.id,
                                    ));
                            }
                        }
                    }
                },
            );
            ui.add_space(10.0);
            widgets::pagination(
                ui,
                "attendance.assignments.pagination",
                &mut self.page,
                filtered.len(),
                &mut self.page_size,
            );
        }
        if ui
            .add_enabled(!busy, egui::Button::new("Làm mới"))
            .clicked()
        {
            self.last_loaded = None;
        }

        if self.create_open {
            let mut cancel = false;
            let mut submit = false;
            let (_, closed) = widgets::modal(
                ctx,
                "attendance.assignments.create",
                "Phân Ca Làm Việc Cho Nhân Sự",
                640.0,
                self.pending_create.is_some(),
                |ui| {
                    ui.add_space(14.0);
                    widgets::form_input(
                        ui,
                        "assignment.code",
                        "Mã phiếu phân ca",
                        true,
                        &mut self.code,
                        "",
                        false,
                    );
                    let employee_label = self.selected_employee_label();
                    widgets::form_field(
                        ui,
                        "assignment.employee",
                        "Nhân sự & Phòng ban",
                        true,
                        |ui| {
                            widgets::combo_box("assignment.employee.choice")
                                .width(ui.available_width())
                                .selected_text(employee_label)
                                .show_ui(ui, |ui| {
                                    for e in &self.employees {
                                        ui.selectable_value(
                                            &mut self.employee_id,
                                            e.id.clone(),
                                            format!("{} · {} · {}", e.code, e.name, e.department),
                                        );
                                    }
                                });
                        },
                    );
                    let shift_label = self.selected_shift_label();
                    widgets::form_field(ui, "assignment.shift", "Ca làm việc", true, |ui| {
                        widgets::combo_box("assignment.shift.choice")
                            .width(ui.available_width())
                            .selected_text(shift_label)
                            .show_ui(ui, |ui| {
                                for s in &self.shifts {
                                    ui.selectable_value(
                                        &mut self.shift_key,
                                        s.key.clone(),
                                        format!(
                                            "{} · {} · {}",
                                            s.shift_code, s.shift_name, s.time_range
                                        ),
                                    );
                                }
                            });
                    });
                    if ui.available_width() < 460.0 {
                        widgets::form_date(
                            ui,
                            "assignment.from",
                            "Hiệu lực từ ngày",
                            true,
                            &mut self.effective_from,
                        );
                        widgets::form_date(
                            ui,
                            "assignment.to",
                            "Hiệu lực đến ngày",
                            true,
                            &mut self.effective_to,
                        );
                    } else {
                        ui.columns(2, |c| {
                            widgets::form_date(
                                &mut c[0],
                                "assignment.from",
                                "Hiệu lực từ ngày",
                                true,
                                &mut self.effective_from,
                            );
                            widgets::form_date(
                                &mut c[1],
                                "assignment.to",
                                "Hiệu lực đến ngày",
                                true,
                                &mut self.effective_to,
                            );
                        });
                    }
                    if let Some(e) = self.employees.iter().find(|e| e.id == self.employee_id) {
                        ui.label(format!(
                            "Hồ sơ HR: {} · {} · {}",
                            e.name, e.department, e.position
                        ));
                    }
                    if !self.error.is_empty() {
                        ui.colored_label(Color32::DARK_RED, &self.error);
                    }
                    if self.employees.is_empty() || self.shifts.is_empty() {
                        ui.colored_label(
                            Color32::from_rgb(180, 83, 9),
                            "Cần hồ sơ nhân sự đang hoạt động và ca đang áp dụng để tạo lịch.",
                        );
                    }
                    ui.add_space(18.0);
                    widgets::action_row(ui, |ui| {
                        if ui
                            .add_enabled(
                                self.employee_options_loaded
                                    && self.shift_options_loaded
                                    && !self.employees.is_empty()
                                    && !self.shifts.is_empty(),
                                egui::Button::new("Lưu lịch phân ca"),
                            )
                            .clicked()
                        {
                            submit = true;
                        }
                        if ui.button("Hủy").clicked() {
                            cancel = true;
                        }
                    });
                },
            );
            if closed || cancel {
                self.create_open = false;
            }
            if submit {
                match self.build_create_input() {
                    Ok(input) => {
                        self.error.clear();
                        self.notice.clear();
                        self.pending_create =
                            Some(api.create_attendance_shift_assignment_task(session, &input));
                    }
                    Err(error) => self.error = error,
                }
            }
        }
        if self.details_open {
            if let Some(a) = self.selected.clone() {
                let (_, closed) = widgets::drawer(
                    ctx,
                    "attendance.assignments.details",
                    "Chi Tiết Lịch Phân Ca & Yêu Cầu Đổi Ca",
                    580.0,
                    |ui| {
                        egui::Frame::none()
                            .fill(Color32::from_rgb(248, 250, 252))
                            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                            .rounding(8.0)
                            .inner_margin(16.0)
                            .show(ui, |ui| {
                                ui.set_width(ui.available_width());
                                ui.label(
                                    RichText::new(&a.code).strong().color(crate::theme::PRIMARY),
                                );
                                ui.label(RichText::new(&a.employee_name).size(17.0).strong());
                                ui.label(format!(
                                    "{} · {} · {}",
                                    a.employee_code, a.position, a.department
                                ));
                                widgets::tag(
                                    ui,
                                    &a.status,
                                    if a.status == "Đang áp dụng" {
                                        TagTone::Success
                                    } else {
                                        TagTone::Neutral
                                    },
                                );
                            });
                        ui.add_space(16.0);
                        ui.strong("Thông Tin Ca Làm Việc & Hiệu Lực");
                        ui.add_space(10.0);
                        for (label, value) in [
                            ("Mã ca", a.shift_code.clone()),
                            ("Ca được gán", a.shift_name.clone()),
                            ("Khung giờ", a.time_range.clone()),
                            ("Giờ làm theo danh mục", format!("{} giờ", a.working_hours)),
                            ("Công quy đổi theo danh mục", a.work_units.to_string()),
                            (
                                "Hiệu lực",
                                format!("{} → {}", a.effective_from, a.effective_to),
                            ),
                        ] {
                            ui.horizontal_wrapped(|ui| {
                                ui.label(label);
                                ui.strong(value);
                            });
                            ui.add_space(8.0);
                        }
                        ui.separator();
                        ui.strong("Lịch sử ghi nhận");
                        if self.pending_events.is_some() {
                            ui.spinner();
                        } else if !self.events_error.is_empty() {
                            ui.colored_label(Color32::DARK_RED, &self.events_error);
                        } else if self.events.is_empty() {
                            ui.label("Chưa có lịch sử ghi nhận.");
                        } else {
                            for event in &self.events {
                                ui.label(format!(
                                    "{} · {} · {} → {}",
                                    event.created_at,
                                    event.actor_name,
                                    event.from_status.as_deref().unwrap_or("—"),
                                    event.to_status
                                ));
                            }
                        }
                        ui.add_space(16.0);
                        ui.add_enabled(false, egui::Button::new("Phê duyệt đổi ca"))
                            .on_disabled_hover_text("Chưa có API duyệt đổi ca được kiểm chứng.");
                    },
                );
                if closed {
                    self.details_open = false;
                }
            }
        }
    }

    fn selected_employee_label(&self) -> String {
        self.employees
            .iter()
            .find(|employee| employee.id == self.employee_id)
            .map(|employee| format!("{} · {}", employee.code, employee.name))
            .unwrap_or_else(|| "Chọn nhân viên".to_owned())
    }

    fn selected_shift_label(&self) -> String {
        self.shifts
            .iter()
            .find(|shift| shift.key == self.shift_key)
            .map(|shift| format!("{} · {}", shift.shift_code, shift.shift_name))
            .unwrap_or_else(|| "Chọn ca đang áp dụng".to_owned())
    }

    fn build_create_input(&self) -> Result<CreateAttendanceShiftAssignment, String> {
        let code = self.code.trim();
        if code.is_empty()
            || code.chars().count() > 64
            || !code.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
            })
        {
            return Err("Mã phân ca chỉ được chứa chữ Latin, số, dấu gạch ngang hoặc gạch dưới (tối đa 64 ký tự).".to_owned());
        }
        if !self
            .employees
            .iter()
            .any(|employee| employee.id == self.employee_id)
        {
            return Err("Hãy chọn nhân viên đang hoạt động từ danh sách HR.".to_owned());
        }
        if !self.shifts.iter().any(|shift| shift.key == self.shift_key) {
            return Err("Hãy chọn ca đang áp dụng từ danh mục ca.".to_owned());
        }
        let effective_from =
            chrono::NaiveDate::parse_from_str(self.effective_from.trim(), "%Y-%m-%d")
                .map_err(|_| "Ngày bắt đầu phải có định dạng YYYY-MM-DD.".to_owned())?;
        let effective_to = chrono::NaiveDate::parse_from_str(self.effective_to.trim(), "%Y-%m-%d")
            .map_err(|_| "Ngày kết thúc phải có định dạng YYYY-MM-DD.".to_owned())?;
        if effective_to < effective_from {
            return Err("Ngày kết thúc không được trước ngày bắt đầu.".to_owned());
        }
        Ok(CreateAttendanceShiftAssignment {
            code: code.to_ascii_uppercase(),
            employee_id: self.employee_id.clone(),
            shift_key: self.shift_key.clone(),
            effective_from: effective_from.to_string(),
            effective_to: effective_to.to_string(),
        })
    }
}

fn filtered_count(
    assignments: &[AttendanceShiftAssignment],
    search: &str,
    status_filter: &str,
) -> usize {
    let query = search.trim().to_lowercase();
    assignments
        .iter()
        .filter(|item| {
            let status_matches = status_filter == "all" || item.status == status_filter;
            let search_matches = query.is_empty()
                || item.code.to_lowercase().contains(&query)
                || item.employee_name.to_lowercase().contains(&query)
                || item.employee_code.to_lowercase().contains(&query)
                || item.department.to_lowercase().contains(&query)
                || item.shift_name.to_lowercase().contains(&query)
                || item.shift_code.to_lowercase().contains(&query);
            status_matches && search_matches
        })
        .count()
}

fn metric(ui: &mut Ui, label: &str, value: usize) {
    egui::Frame::group(ui.style()).show(ui, |ui| {
        ui.set_min_width(145.0);
        ui.label(RichText::new(label).size(12.0).color(Color32::GRAY));
        ui.label(RichText::new(value.to_string()).size(20.0).strong());
    });
}

fn detail(ui: &mut Ui, label: &str, value: &str) {
    ui.label(RichText::new(label).strong());
    ui.label(value);
    ui.end_row();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assignment_form_sends_only_server_resolvable_foreign_keys_and_dates() {
        let view = AttendanceShiftAssignmentsView {
            code: "pc-2026-001".to_owned(),
            employee_id: "employee-1".to_owned(),
            shift_key: "shift-1".to_owned(),
            effective_from: "2026-10-08".to_owned(),
            effective_to: "2026-12-31".to_owned(),
            employees: vec![Employee {
                id: "employee-1".to_owned(),
                code: "EMP-001".to_owned(),
                name: "Employee One".to_owned(),
                email: "employee@example.test".to_owned(),
                phone: String::new(),
                address: String::new(),
                department: "Operations".to_owned(),
                position: "Engineer".to_owned(),
                status: "Chính thức".to_owned(),
                join_date: "2020-01-01".to_owned(),
                salary_base: 0,
                role: "USER".to_owned(),
                is_active: true,
                activation_status: "Đã kích hoạt".to_owned(),
            }],
            shifts: vec![AttendanceShift {
                key: "shift-1".to_owned(),
                status: "Đang áp dụng".to_owned(),
                ..Default::default()
            }],
            ..Default::default()
        };
        let input = view.build_create_input().expect("valid assignment");
        assert_eq!(input.code, "PC-2026-001");
        assert_eq!(input.employee_id, "employee-1");
        let payload = serde_json::to_value(input).expect("assignment payload");
        assert!(payload.get("employeeName").is_none());
        assert!(payload.get("department").is_none());
        assert!(payload.get("shiftName").is_none());
    }

    #[test]
    fn assignment_form_rejects_invalid_code_dates_and_unselected_records() {
        let mut view = AttendanceShiftAssignmentsView::default();
        view.code = "PC 001".to_owned();
        view.employee_id = "employee-1".to_owned();
        view.shift_key = "shift-1".to_owned();
        view.effective_from = "2026-10-08".to_owned();
        view.effective_to = "2026-10-09".to_owned();
        assert!(view.build_create_input().is_err());
        view.code = "PC-001".to_owned();
        assert!(view.build_create_input().is_err());

        view.employees.push(Employee {
            id: "employee-1".to_owned(),
            code: "EMP-001".to_owned(),
            name: "Employee One".to_owned(),
            email: "employee@example.test".to_owned(),
            phone: String::new(),
            address: String::new(),
            department: String::new(),
            position: String::new(),
            status: "Chính thức".to_owned(),
            join_date: String::new(),
            salary_base: 0,
            role: "USER".to_owned(),
            is_active: true,
            activation_status: "Đã kích hoạt".to_owned(),
        });
        view.shifts.push(AttendanceShift {
            key: "shift-1".to_owned(),
            status: "Đang áp dụng".to_owned(),
            ..Default::default()
        });
        view.effective_to = "2026-10-07".to_owned();
        assert!(view.build_create_input().is_err());
        view.effective_to = "2026-10-09".to_owned();
        assert!(view.build_create_input().is_ok());
    }
}
