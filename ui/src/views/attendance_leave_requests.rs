use std::time::Duration;
use web_time::Instant;

use crate::api::{
    ApiClient, ApiTask, CreateEmployeeLeaveRequest, EmployeeLeaveRequest,
    EmployeeLeaveRequestEvent, EmployeeLeaveRequestEventsResponse, EmployeeLeaveRequestResponse,
    EmployeeLeaveRequestsResponse, EmployeeListResponse, LeaveRequestRecord, LeaveRequestsResponse,
};
use crate::models::{Employee, Session};
use crate::widgets::{self, Metric, TableColumn};
use egui::{Color32, RichText, Ui, Vec2};

const LEAVE_TYPES: &[&str] = &[
    "Nghỉ phép năm",
    "Nghỉ ốm",
    "Nghỉ ốm BHXH",
    "Nghỉ kết hôn",
    "Nghỉ thai sản",
    "Nghỉ việc riêng không lương",
    "Nghỉ việc riêng có lương",
    "Nghỉ không lương",
];

const EMPLOYEE_SELF_SERVICE_LEAVE_TYPES: &[&str] = &[
    "Nghỉ phép năm",
    "Nghỉ ốm BHXH",
    "Nghỉ việc riêng có lương",
    "Nghỉ không lương",
    "Nghỉ thai sản",
];

const ADMIN_LEAVE_REQUEST_HEADERS: [&str; 6] = [
    "Mã đơn & Loại nghỉ phép",
    "Người làm đơn",
    "Thời gian nghỉ & Số ngày",
    "Lý do xin nghỉ",
    "Trạng thái",
    "Thao tác",
];
const ADMIN_LEAVE_REQUEST_EMPTY_TEXT: &str = "No Data";

pub struct AttendanceLeaveRequestsView {
    requests: Vec<LeaveRequestRecord>,
    requests_revision: String,
    employees: Vec<Employee>,
    self_service: EmployeeLeaveSelfServiceView,
    pending_load: Option<ApiTask<LeaveRequestsResponse>>,
    pending_save: Option<ApiTask<LeaveRequestsResponse>>,
    pending_employees: Option<ApiTask<EmployeeListResponse>>,
    loaded_for: Option<String>,
    data_loaded: bool,
    employees_loaded: bool,
    needs_reload: bool,
    last_loaded: Option<Instant>,
    search: String,
    status_filter: String,
    page: usize,
    page_size: usize,
    create_open: bool,
    selected: Option<LeaveRequestRecord>,
    details_open: bool,
    code: String,
    leave_type: String,
    selected_employee_id: String,
    employee_search: String,
    start_date: String,
    end_date: String,
    days_count: String,
    reason: String,
    handover_person: String,
    contact_phone: String,
    notice: String,
    error: String,
    employees_error: String,
}

impl Default for AttendanceLeaveRequestsView {
    fn default() -> Self {
        Self {
            requests: Vec::new(),
            requests_revision: String::new(),
            employees: Vec::new(),
            self_service: EmployeeLeaveSelfServiceView::default(),
            pending_load: None,
            pending_save: None,
            pending_employees: None,
            loaded_for: None,
            data_loaded: false,
            employees_loaded: false,
            needs_reload: true,
            last_loaded: None,
            search: String::new(),
            status_filter: "Tất cả".to_owned(),
            page: 0,
            page_size: 8,
            create_open: false,
            selected: None,
            details_open: false,
            code: String::new(),
            leave_type: LEAVE_TYPES[0].to_owned(),
            selected_employee_id: String::new(),
            employee_search: String::new(),
            start_date: String::new(),
            end_date: String::new(),
            days_count: "1".to_owned(),
            reason: String::new(),
            handover_person: String::new(),
            contact_phone: String::new(),
            notice: String::new(),
            error: String::new(),
            employees_error: String::new(),
        }
    }
}

impl AttendanceLeaveRequestsView {
    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        if self.pending_load.is_some() || self.pending_save.is_some() {
            self.needs_reload = true;
            return;
        }
        self.error.clear();
        self.pending_load = Some(api.list_leave_requests_task(session));
        self.needs_reload = false;
    }

    fn request_employees(&mut self, session: &Session, api: &ApiClient) {
        if self.pending_employees.is_none() && !self.employees_loaded {
            self.pending_employees = Some(api.list_employees_task(session));
        }
    }

    fn clear_form(&mut self) {
        let now = chrono::Utc::now();
        self.code = format!(
            "NP-{}-{:03}",
            now.format("%Y"),
            now.timestamp_millis().rem_euclid(1_000)
        );
        self.leave_type = LEAVE_TYPES[0].to_owned();
        self.selected_employee_id = self
            .employees
            .first()
            .map(|employee| employee.id.clone())
            .unwrap_or_default();
        self.employee_search.clear();
        self.start_date = chrono::Utc::now().format("%Y-%m-%d").to_string();
        self.end_date = self.start_date.clone();
        self.days_count = "1".to_owned();
        self.reason.clear();
        self.handover_person.clear();
        self.contact_phone.clear();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let account = format!(
            "{}\n{}\n{}",
            session.endpoint, session.user.id, session.user.role
        );
        if self.loaded_for.as_deref() != Some(account.as_str()) {
            self.requests.clear();
            self.requests_revision.clear();
            self.employees.clear();
            self.pending_load = None;
            self.pending_save = None;
            self.pending_employees = None;
            self.selected_employee_id.clear();
            self.employee_search.clear();
            self.create_open = false;
            self.selected = None;
            self.details_open = false;
            self.loaded_for = Some(account);
            self.data_loaded = false;
            self.employees_loaded = false;
            self.last_loaded = None;
            self.needs_reload = true;
            self.notice.clear();
            self.error.clear();
            self.employees_error.clear();
        }

        if session.user.role != "ADMIN" {
            return;
        }

        if self.needs_reload && self.pending_load.is_none() && self.pending_save.is_none() {
            self.request_reload(session, api);
        } else if self.pending_load.is_none()
            && self.pending_save.is_none()
            && self
                .last_loaded
                .is_none_or(|loaded| loaded.elapsed() >= Duration::from_secs(30))
        {
            self.request_reload(session, api);
        }
        self.request_employees(session, api);

        if let Some(result) = self.pending_load.as_ref().and_then(ApiClient::poll) {
            self.pending_load = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.requests_revision = response.revision;
                    self.requests = response.data;
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
                        .filter(is_leave_eligible_employee)
                        .collect();
                    self.employees.sort_by(|left, right| {
                        left.name
                            .cmp(&right.name)
                            .then_with(|| left.code.cmp(&right.code))
                    });
                    self.employees.dedup_by(|left, right| left.id == right.id);
                    self.employees_loaded = true;
                    self.employees_error.clear();
                }
                Err(error) => {
                    self.employees_loaded = true;
                    self.employees_error = error;
                }
            }
        }

        if let Some(result) = self.pending_save.as_ref().and_then(ApiClient::poll) {
            self.pending_save = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.requests_revision = response.revision;
                    self.requests = response.data;
                    self.data_loaded = true;
                    self.create_open = false;
                    self.details_open = false;
                    self.selected = None;
                    self.clear_form();
                    self.notice = "Đã lưu đơn nghỉ phép trên máy chủ.".to_owned();
                    self.error.clear();
                }
                Err(error) => {
                    self.notice.clear();
                    self.error = error;
                }
            }
        }

        if self.pending_load.is_some()
            || self.pending_save.is_some()
            || self.pending_employees.is_some()
        {
            ctx.request_repaint_after(Duration::from_millis(80));
        } else if let Some(last_loaded) = self.last_loaded {
            ctx.request_repaint_after(
                Duration::from_secs(30).saturating_sub(last_loaded.elapsed()),
            );
        }
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        employee_self_service: bool,
    ) {
        if employee_self_service {
            self.self_service.render(ui, ctx, session, api);
            return;
        }
        if session.user.role != "ADMIN" {
            return;
        }
        self.poll(ctx, session, api);
        let busy = self.pending_load.is_some() || self.pending_save.is_some();
        let pending = self
            .requests
            .iter()
            .filter(|r| is_pending_status(&r.status))
            .count();
        let approved = self
            .requests
            .iter()
            .filter(|r| is_approved_status(&r.status))
            .count();
        let total_days = self
            .requests
            .iter()
            .map(LeaveRequestRecord::effective_days_count)
            .collect::<Option<Vec<_>>>()
            .map(|days| days.into_iter().sum::<f64>());
        let labels = [
            "Tổng đơn xin nghỉ phát sinh",
            "Đang chờ phê duyệt (Pending)",
            "Đã phê duyệt hợp lệ",
            "Quỹ phép năm trung bình còn lại",
        ];
        let values = [
            format!("{} Đơn nghỉ", self.requests.len()),
            format!("{pending} Đơn chờ duyệt"),
            format!("{approved} Đơn hoàn tất"),
            "—".into(),
        ];
        let total_caption = total_days
            .map(|days| format!("Tổng cộng {} nghỉ phép", format_days(days)))
            .unwrap_or_else(|| "Chưa đủ số ngày nghỉ trong nguồn".into());
        let details = [
            total_caption.as_str(),
            "Cần bộ phận quản lý hoặc HR xử lý",
            "Theo trạng thái đơn từ máy chủ",
            "Chưa có nguồn số dư phép theo nhân sự",
        ];
        let colors = [
            crate::theme::PRIMARY,
            Color32::from_rgb(217, 119, 6),
            Color32::from_rgb(22, 163, 74),
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
        ui.add_space(8.0);
        widgets::metrics(ui, "attendance.leave.metrics", &cards);
        ui.add_space(16.0);
        self.render_admin_toolbar(ui, session, api);
        ui.add_space(12.0);
        if !self.notice.is_empty() {
            ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::DARK_RED, &self.error);
        }
        if self.data_loaded && self.requests_revision.is_empty() {
            ui.colored_label(
                Color32::from_rgb(180, 83, 9),
                "Máy chủ chưa trả phiên bản danh sách; thao tác ghi bị khóa để tránh ghi đè.",
            );
        }
        if busy {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải / lưu đơn nghỉ phép…");
            });
        }
        let query = self.search.trim().to_lowercase();
        let filtered = self
            .requests
            .iter()
            .filter(|r| {
                let status = self.status_filter == "Tất cả"
                    || (self.status_filter == "Chờ duyệt" && is_pending_status(&r.status))
                    || (self.status_filter == "Đã duyệt" && is_approved_status(&r.status))
                    || self.status_filter == r.status;
                status
                    && (query.is_empty()
                        || [
                            &r.code,
                            &r.employee_name,
                            r.effective_leave_type(),
                            &r.department,
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
        let widths = admin_leave_request_column_widths(ui.available_width() - 2.0);
        let columns = ADMIN_LEAVE_REQUEST_HEADERS
            .iter()
            .zip(widths)
            .map(|(title, width)| TableColumn { title, width })
            .collect::<Vec<_>>();
        if self.data_loaded {
            widgets::table(
                ui,
                "attendance.leave.table",
                &columns,
                rows.len(),
                |ui, row, col| {
                    let r = rows[row];
                    match col {
                        0 => {
                            ui.label(RichText::new(r.effective_leave_type()).strong().size(12.5));
                            ui.label(
                                RichText::new(format!("Mã đơn: {}", r.code))
                                    .size(11.5)
                                    .color(crate::theme::PRIMARY),
                            );
                        }
                        1 => {
                            ui.label(RichText::new(&r.employee_name).strong().size(13.0));
                            ui.label(
                                RichText::new(format!(
                                    "{} · {}",
                                    r.employee_code.as_deref().unwrap_or("—"),
                                    r.department
                                ))
                                .size(11.5),
                            );
                        }
                        2 => {
                            ui.label(
                                RichText::new(format!(
                                    "{} → {}",
                                    r.effective_start_date(),
                                    r.effective_end_date()
                                ))
                                .size(12.0),
                            );
                            ui.label(
                                r.effective_days_count()
                                    .map(format_days)
                                    .unwrap_or_else(|| "—".into()),
                            );
                        }
                        3 => {
                            ui.add(
                                egui::Label::new(RichText::new(&r.reason).size(12.0)).truncate(),
                            )
                            .on_hover_text(&r.reason);
                        }
                        4 => leave_status_badge(ui, &r.status),
                        _ => {
                            if ui.button("Chi tiết").clicked() {
                                self.selected = Some(r.clone());
                                self.details_open = true;
                            }
                        }
                    }
                },
            );
            ui.add_space(10.0);
            widgets::pagination(
                ui,
                "attendance.leave.pagination",
                &mut self.page,
                filtered.len(),
                &mut self.page_size,
            );
        }
        if self.create_open {
            let mut cancel = false;
            let mut submit = false;
            let (_, closed) = widgets::modal(
                ctx,
                "attendance.leave.create",
                "Tạo Đơn Xin Nghỉ Phép Mới",
                640.0,
                busy,
                |ui| {
                    ui.add_space(14.0);
                    if !self.employees_error.is_empty() {
                        ui.colored_label(
                            Color32::DARK_RED,
                            format!("Không tải được hồ sơ nhân viên: {}", self.employees_error),
                        );
                    }
                    let compact = ui.available_width() < 460.0;
                    if compact {
                        widgets::form_input(
                            ui,
                            "leave.code",
                            "Mã đơn nghỉ phép",
                            true,
                            &mut self.code,
                            "",
                            false,
                        );
                        widgets::form_select(
                            ui,
                            "leave.type",
                            "Loại nghỉ phép",
                            true,
                            &mut self.leave_type,
                            LEAVE_TYPES,
                        );
                    } else {
                        ui.columns(2, |c| {
                            widgets::form_input(
                                &mut c[0],
                                "leave.code",
                                "Mã đơn nghỉ phép",
                                true,
                                &mut self.code,
                                "",
                                false,
                            );
                            widgets::form_select(
                                &mut c[1],
                                "leave.type",
                                "Loại nghỉ phép",
                                true,
                                &mut self.leave_type,
                                LEAVE_TYPES,
                            );
                        });
                    }
                    widgets::form_input(
                        ui,
                        "leave.employee.search",
                        "Tìm nhân viên (tên / mã / phòng ban)",
                        false,
                        &mut self.employee_search,
                        "",
                        false,
                    );
                    let selected = self
                        .employees
                        .iter()
                        .find(|e| e.id == self.selected_employee_id)
                        .cloned();
                    let label = selected
                        .as_ref()
                        .map(employee_choice_label)
                        .unwrap_or_else(|| "Chọn hồ sơ nhân viên".into());
                    widgets::form_field(
                        ui,
                        "leave.employee",
                        "Nhân viên từ hồ sơ HR",
                        self.selected_employee_id.is_empty(),
                        |ui| {
                            widgets::combo_box("leave.employee.choice")
                                .width(ui.available_width())
                                .selected_text(label)
                                .show_ui(ui, |ui| {
                                    let query = self.employee_search.trim().to_lowercase();
                                    let choices = self
                                        .employees
                                        .iter()
                                        .filter(|e| employee_matches_search(e, &query))
                                        .collect::<Vec<_>>();
                                    for e in choices.iter().take(30) {
                                        ui.selectable_value(
                                            &mut self.selected_employee_id,
                                            e.id.clone(),
                                            employee_choice_label(e),
                                        );
                                    }
                                    if choices.is_empty() {
                                        ui.label("Không tìm thấy hồ sơ phù hợp.");
                                    }
                                    if choices.len() > 30 {
                                        ui.label(
                                            "Hiển thị tối đa 30 kết quả; hãy thu hẹp tìm kiếm.",
                                        );
                                    }
                                });
                        },
                    );
                    ui.label(format!(
                        "Phòng ban theo hồ sơ HR: {}",
                        selected
                            .as_ref()
                            .map(|e| e.department.as_str())
                            .unwrap_or("—")
                    ));
                    ui.add_space(10.0);
                    if compact {
                        widgets::form_date(
                            ui,
                            "leave.start",
                            "Từ ngày",
                            true,
                            &mut self.start_date,
                        );
                        widgets::form_date(ui, "leave.end", "Đến ngày", true, &mut self.end_date);
                        widgets::form_input(
                            ui,
                            "leave.days",
                            "Số ngày nghỉ",
                            true,
                            &mut self.days_count,
                            "Bước 0,5 ngày",
                            false,
                        );
                    } else {
                        ui.columns(3, |c| {
                            widgets::form_date(
                                &mut c[0],
                                "leave.start",
                                "Từ ngày",
                                true,
                                &mut self.start_date,
                            );
                            widgets::form_date(
                                &mut c[1],
                                "leave.end",
                                "Đến ngày",
                                true,
                                &mut self.end_date,
                            );
                            widgets::form_input(
                                &mut c[2],
                                "leave.days",
                                "Số ngày nghỉ",
                                true,
                                &mut self.days_count,
                                "Bước 0,5 ngày",
                                false,
                            );
                        });
                    }
                    if compact {
                        widgets::form_input(
                            ui,
                            "leave.handover",
                            "Người nhận bàn giao",
                            false,
                            &mut self.handover_person,
                            "",
                            false,
                        );
                        widgets::form_input(
                            ui,
                            "leave.phone",
                            "Điện thoại liên hệ",
                            false,
                            &mut self.contact_phone,
                            "",
                            false,
                        );
                    } else {
                        ui.columns(2, |c| {
                            widgets::form_input(
                                &mut c[0],
                                "leave.handover",
                                "Người nhận bàn giao",
                                false,
                                &mut self.handover_person,
                                "",
                                false,
                            );
                            widgets::form_input(
                                &mut c[1],
                                "leave.phone",
                                "Điện thoại liên hệ",
                                false,
                                &mut self.contact_phone,
                                "",
                                false,
                            );
                        });
                    }
                    widgets::form_textarea(
                        ui,
                        "leave.reason",
                        "Lý do xin nghỉ",
                        true,
                        &mut self.reason,
                        "",
                        3,
                    );
                    if !self.error.is_empty() {
                        ui.colored_label(Color32::DARK_RED, &self.error);
                    }
                    if self.employees_loaded && self.employees.is_empty() {
                        ui.colored_label(
                            Color32::from_rgb(180, 83, 9),
                            "Chưa có hồ sơ nhân sự đang hoạt động đủ mã nhân viên và phòng ban.",
                        );
                    }
                    ui.add_space(18.0);
                    widgets::action_row(ui, |ui| {
                        if ui
                            .add_enabled(
                                self.data_loaded
                                    && !self.requests_revision.is_empty()
                                    && !self.selected_employee_id.is_empty(),
                                egui::Button::new("Nộp đơn trình duyệt"),
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
                match self.build_request() {
                    Ok(r) => {
                        let mut next = self.requests.clone();
                        next.insert(0, r);
                        self.begin_save(session, api, next);
                    }
                    Err(error) => self.error = error,
                }
            }
        }
        if self.details_open {
            if let Some(r) = self.selected.clone() {
                let (_, closed) = widgets::drawer(
                    ctx,
                    "attendance.leave.details",
                    "Chi Tiết Đơn Nghỉ Phép & Quy Trình Ký Duyệt",
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
                                    RichText::new(&r.code).strong().color(crate::theme::PRIMARY),
                                );
                                ui.label(RichText::new(&r.employee_name).size(17.0).strong());
                                ui.label(format!(
                                    "{} · {}",
                                    r.employee_code.as_deref().unwrap_or("—"),
                                    r.department
                                ));
                                leave_status_badge(ui, &r.status);
                            });
                        ui.add_space(16.0);
                        ui.strong("Thông Tin Chi Tiết Đơn Nghỉ Phép");
                        ui.add_space(10.0);
                        for (label, value) in [
                            ("Loại đơn nghỉ phép", r.effective_leave_type().to_owned()),
                            (
                                "Thời gian nghỉ",
                                format!(
                                    "{} → {} ({})",
                                    r.effective_start_date(),
                                    r.effective_end_date(),
                                    r.effective_days_count()
                                        .map(format_days)
                                        .unwrap_or_else(|| "—".into())
                                ),
                            ),
                            (
                                "Người nhận bàn giao",
                                r.handover_person.clone().unwrap_or_else(|| "—".into()),
                            ),
                            (
                                "Điện thoại liên hệ",
                                r.contact_phone.clone().unwrap_or_else(|| "—".into()),
                            ),
                            (
                                "Phép năm còn lại trước đơn",
                                "— Chưa có nguồn số dư phép".into(),
                            ),
                            ("Lý do xin nghỉ", r.reason.clone()),
                        ] {
                            ui.horizontal_wrapped(|ui| {
                                ui.label(label);
                                ui.strong(value);
                            });
                            ui.add_space(8.0);
                        }
                        ui.add_space(8.0);
                        ui.strong("Quy Trình Ký Duyệt Trực Tuyến");
                        ui.label("Trạng thái duyệt được lưu theo phiên bản danh sách; chưa có nguồn xác nhận người duyệt nhiều cấp hoặc tự động trừ phép.");
                        if !self.error.is_empty() {
                            ui.colored_label(Color32::DARK_RED, &self.error);
                        }
                        if is_pending_status(&r.status) {
                            ui.add_enabled_ui(!busy && !self.requests_revision.is_empty(), |ui| {
                                widgets::action_row(ui, |ui| {
                                    if ui.button("Phê Duyệt Đơn Nghỉ").clicked() {
                                        self.update_status(session, api, &r, "Đã duyệt");
                                    }
                                    if ui.button("Từ Chối Đơn").clicked() {
                                        self.update_status(session, api, &r, "Từ chối");
                                    }
                                });
                            });
                        }
                        if !r.extra.is_empty() {
                            ui.collapsing("Trường bổ sung từ máy chủ", |ui| {
                                ui.label(
                                    serde_json::to_string_pretty(&r.extra).unwrap_or_default(),
                                );
                            });
                        }
                    },
                );
                if closed {
                    self.details_open = false;
                }
            }
        }
    }

    fn render_admin_toolbar(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if ui.ctx().screen_rect().width() <= 992.0 {
            ui.vertical(|ui| {
                ui.horizontal_wrapped(|ui| {
                    render_status_filter_buttons(ui, &mut self.status_filter, &mut self.page);
                });
                ui.add_space(8.0);
                let search_width = ui.available_width();
                self.render_admin_search(ui, search_width);
                ui.add_space(8.0);
                ui.horizontal_wrapped(|ui| {
                    self.render_admin_toolbar_actions(ui, session, api);
                });
            });
        } else {
            ui.horizontal(|ui| {
                render_status_filter_buttons(ui, &mut self.status_filter, &mut self.page);
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let previous_item_spacing = ui.spacing().item_spacing.x;
                    ui.spacing_mut().item_spacing.x = 11.0;
                    self.render_admin_toolbar_actions(ui, session, api);
                    self.render_admin_search(ui, 140.0);
                    ui.spacing_mut().item_spacing.x = previous_item_spacing;
                });
            });
        }
    }

    fn render_admin_toolbar_actions(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if ui
            .add_enabled(
                self.data_loaded && !self.requests_revision.is_empty(),
                egui::Button::new("+ Tạo đơn nghỉ mới").min_size(Vec2::new(164.0, 28.0)),
            )
            .clicked()
        {
            self.clear_form();
            self.create_open = true;
            self.error.clear();
        }
        ui.add_enabled(
            false,
            egui::Button::new("Xuất Excel").min_size(Vec2::new(118.0, 28.0)),
        )
        .on_hover_text("Chức năng tạo tệp Excel chưa được triển khai.");
        if ui
            .add_enabled(
                self.pending_load.is_none() && self.pending_save.is_none(),
                egui::Button::new("↻ Làm mới").min_size(Vec2::new(107.0, 28.0)),
            )
            .clicked()
        {
            self.needs_reload = true;
            self.employees_loaded = false;
            self.employees_error.clear();
            self.request_employees(session, api);
        }
    }

    fn render_admin_search(&mut self, ui: &mut Ui, minimum_width: f32) {
        if !self.search.is_empty() && ui.small_button("×").clicked() {
            self.search.clear();
            self.page = 0;
        }
        let search_width = if ui.ctx().screen_rect().width() <= 992.0 {
            ui.available_width()
        } else {
            ui.available_width().clamp(minimum_width, 280.0)
        };
        if ui
            .add(
                egui::TextEdit::singleline(&mut self.search)
                    .hint_text("Tìm theo mã đơn, nhân viên, loại đơn...")
                    .desired_width((search_width - 14.0).max(80.0))
                    .margin(egui::Margin::same(6.0)),
            )
            .changed()
        {
            self.page = 0;
        }
    }

    fn begin_save(
        &mut self,
        session: &Session,
        api: &ApiClient,
        requests: Vec<LeaveRequestRecord>,
    ) {
        if self.requests_revision.is_empty() {
            self.error = "Không có phiên bản danh sách. Hãy tải lại trước khi lưu.".to_owned();
            return;
        }
        let requests = normalize_collection_keys(requests);
        self.notice.clear();
        self.error.clear();
        self.pending_save =
            Some(api.replace_leave_requests_task(session, &requests, &self.requests_revision));
    }

    fn update_status(
        &mut self,
        session: &Session,
        api: &ApiClient,
        selected: &LeaveRequestRecord,
        status: &str,
    ) {
        let identity = selected.identity_key().to_owned();
        let mut requests = self.requests.clone();
        if let Some(index) = requests
            .iter_mut()
            .position(|request| request.identity_key() == identity.as_str())
        {
            requests[index].status = status.to_owned();
            self.begin_save(session, api, requests);
        } else {
            self.error = "Đơn không còn trong danh sách hiện tại. Hãy tải lại.".to_owned();
            self.needs_reload = true;
        }
    }

    fn build_request(&self) -> Result<LeaveRequestRecord, String> {
        let code = self.code.trim();
        let employee = self
            .employees
            .iter()
            .find(|employee| employee.id == self.selected_employee_id)
            .filter(|employee| is_leave_eligible_employee(employee))
            .ok_or_else(|| "Vui lòng chọn hồ sơ nhân viên HR đang hoạt động.".to_owned())?;
        let reason = self.reason.trim();
        if code.is_empty() || reason.is_empty() {
            return Err("Vui lòng nhập mã đơn và lý do.".to_owned());
        }
        if self
            .requests
            .iter()
            .any(|request| request.code.eq_ignore_ascii_case(code))
        {
            return Err("Mã đơn đã tồn tại trong danh sách hiện tại.".to_owned());
        }
        let start = chrono::NaiveDate::parse_from_str(self.start_date.trim(), "%Y-%m-%d")
            .map_err(|_| "Ngày bắt đầu phải có định dạng YYYY-MM-DD.".to_owned())?;
        let end = chrono::NaiveDate::parse_from_str(self.end_date.trim(), "%Y-%m-%d")
            .map_err(|_| "Ngày kết thúc phải có định dạng YYYY-MM-DD.".to_owned())?;
        if end < start {
            return Err("Ngày kết thúc không được trước ngày bắt đầu.".to_owned());
        }
        let days_count = self
            .days_count
            .trim()
            .parse::<f64>()
            .map_err(|_| "Số ngày nghỉ không hợp lệ.".to_owned())?;
        if !(0.5..=366.0).contains(&days_count)
            || (days_count * 2.0 - (days_count * 2.0).round()).abs() > f64::EPSILON
        {
            return Err("Số ngày nghỉ phải từ 0,5 đến 366 và theo bước 0,5.".to_owned());
        }
        Ok(LeaveRequestRecord {
            key: chrono::Utc::now().timestamp_millis().to_string(),
            code: code.to_owned(),
            employee_id: Some(employee.id.clone()),
            employee_code: Some(employee.code.trim().to_owned()),
            employee_name: employee.name.trim().to_owned(),
            department: employee.department.trim().to_owned(),
            leave_type: self.leave_type.clone(),
            start_date: start.format("%Y-%m-%d").to_string(),
            end_date: end.format("%Y-%m-%d").to_string(),
            days_count: Some(days_count),
            reason: reason.to_owned(),
            status: "Chờ duyệt".to_owned(),
            handover_person: non_empty(&self.handover_person),
            contact_phone: non_empty(&self.contact_phone),
            extra: Default::default(),
        })
    }
}

#[derive(Default)]
struct EmployeeLeaveSelfServiceView {
    requests: Vec<EmployeeLeaveRequest>,
    pending_load: Option<ApiTask<EmployeeLeaveRequestsResponse>>,
    pending_create: Option<ApiTask<EmployeeLeaveRequestResponse>>,
    pending_decision: Option<ApiTask<EmployeeLeaveRequestResponse>>,
    pending_events: Option<ApiTask<EmployeeLeaveRequestEventsResponse>>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    data_loaded: bool,
    create_open: bool,
    selected: Option<EmployeeLeaveRequest>,
    details_open: bool,
    events: Vec<EmployeeLeaveRequestEvent>,
    leave_type: String,
    start_date: String,
    end_date: String,
    days: String,
    reason: String,
    handover_person: String,
    contact_phone: String,
    review_note: String,
    search: String,
    filter_tab: String,
    page: usize,
    page_size: usize,
    notice: String,
    error: String,
    events_error: String,
}

impl EmployeeLeaveSelfServiceView {
    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let account = format!(
            "{}\n{}\n{}",
            session.endpoint, session.user.id, session.user.role
        );
        if self.loaded_for.as_deref() != Some(account.as_str()) {
            self.requests.clear();
            self.pending_load = None;
            self.pending_create = None;
            self.pending_decision = None;
            self.pending_events = None;
            self.loaded_for = Some(account);
            self.last_loaded = None;
            self.data_loaded = false;
            self.selected = None;
            self.details_open = false;
            self.events.clear();
            self.notice.clear();
            self.error.clear();
            self.events_error.clear();
            self.review_note.clear();
            self.search.clear();
            self.filter_tab = "Tất cả đơn".to_owned();
            self.page = 0;
            self.page_size = 8;
        }

        if self.pending_load.is_none()
            && self.pending_create.is_none()
            && self.pending_decision.is_none()
            && self
                .last_loaded
                .is_none_or(|loaded| loaded.elapsed() >= Duration::from_secs(30))
        {
            self.pending_load = Some(api.list_employee_leave_requests_task(session));
        }

        if let Some(result) = self.pending_load.as_ref().and_then(ApiClient::poll) {
            self.pending_load = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.requests = response.data;
                    self.data_loaded = true;
                    self.error.clear();
                }
                Err(error) => {
                    self.data_loaded = false;
                    self.error = error;
                }
            }
        }
        if let Some(result) = self.pending_create.as_ref().and_then(ApiClient::poll) {
            self.pending_create = None;
            match result {
                Ok(response) => {
                    self.requests.retain(|item| item.id != response.request.id);
                    self.requests.insert(0, response.request);
                    self.page = 0;
                    self.create_open = false;
                    self.clear_form();
                    self.notice = "Đã gửi đơn nghỉ phép lên máy chủ.".to_owned();
                    self.error.clear();
                    self.last_loaded = Some(Instant::now());
                }
                Err(error) => {
                    self.notice.clear();
                    self.error = error;
                }
            }
        }
        if let Some(result) = self.pending_decision.as_ref().and_then(ApiClient::poll) {
            self.pending_decision = None;
            match result {
                Ok(response) => {
                    let request = response.request;
                    if let Some(existing) =
                        self.requests.iter_mut().find(|item| item.id == request.id)
                    {
                        *existing = request.clone();
                    }
                    self.selected = Some(request);
                    self.notice = "Đã lưu quyết định và nhật ký phê duyệt.".to_owned();
                    self.error.clear();
                    self.last_loaded = Some(Instant::now());
                    self.pending_events = self
                        .selected
                        .as_ref()
                        .map(|item| api.list_employee_leave_request_events_task(session, &item.id));
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
            || self.pending_create.is_some()
            || self.pending_decision.is_some()
            || self.pending_events.is_some()
        {
            ctx.request_repaint_after(Duration::from_millis(80));
        } else if let Some(last_loaded) = self.last_loaded {
            ctx.request_repaint_after(
                Duration::from_secs(30).saturating_sub(last_loaded.elapsed()),
            );
        }
    }

    fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.poll(ctx, session, api);
        let admin = session.user.role == "ADMIN";
        let busy = self.pending_load.is_some()
            || self.pending_create.is_some()
            || self.pending_decision.is_some();
        let approved = self
            .requests
            .iter()
            .filter(|r| is_approved_status(&r.status))
            .map(|r| r.days)
            .sum::<f64>();
        let pending = self
            .requests
            .iter()
            .filter(|r| is_pending_status(&r.status))
            .count();
        let labels = [
            "Tổng quỹ phép năm",
            "Số ngày phép đã sử dụng",
            "Số ngày phép còn lại",
            "Hồ sơ chờ phê duyệt",
        ];
        let values = [
            "— ngày".into(),
            if self.data_loaded {
                format_days(approved)
            } else {
                "—".into()
            },
            "— ngày".into(),
            if self.data_loaded {
                format!("{pending} Đơn")
            } else {
                "—".into()
            },
        ];
        let details = [
            "Hạn mức phép năm chưa được xác minh",
            "Theo đơn đã duyệt; chưa đối soát bảng công",
            "Chưa có hạn mức để tính số dư",
            "Đang chờ quản lý xử lý",
        ];
        let colors = [
            crate::theme::PRIMARY,
            Color32::from_rgb(234, 88, 12),
            Color32::from_rgb(22, 163, 74),
            Color32::from_rgb(124, 58, 237),
        ];
        let cards = (0..4)
            .map(|i| Metric {
                label: labels[i],
                value: values[i].clone(),
                detail: details[i],
                color: colors[i],
                value_size: 24.0,
            })
            .collect::<Vec<_>>();
        ui.add_space(8.0);
        widgets::metrics(ui, "employee.leave.metrics", &cards);
        ui.add_space(16.0);
        let tabs = [
            "Tất cả đơn xin nghỉ",
            "Nghỉ phép năm",
            "Nghỉ ốm BHXH",
            "Đang chờ duyệt",
        ];
        let tab_values = [
            "Tất cả đơn",
            "Nghỉ phép năm",
            "Nghỉ ốm BHXH",
            "Đang chờ duyệt",
        ];
        let index = tab_values
            .iter()
            .position(|s| *s == self.filter_tab)
            .unwrap_or(0);
        let toolbar = widgets::filter_toolbar_with_more(
            ui,
            "employee.leave.toolbar",
            &tabs,
            index,
            &mut self.search,
            "Tìm theo mã đơn, loại phép, lý do…",
            if admin {
                "Xem điều kiện tạo đơn"
            } else {
                "Tạo đơn xin nghỉ"
            },
            false,
            80,
            |ui| {
                ui.add_enabled(false, egui::Button::new("In Đơn Nghỉ Phép"))
                    .on_disabled_hover_text("Chưa có API trả tệp đơn nghỉ phép.");
            },
        );
        if let Some(i) = toolbar.selected {
            self.filter_tab = tab_values[i].into();
            self.page = 0;
        }
        if toolbar.search_changed {
            self.page = 0;
        }
        if toolbar.create_clicked && !busy {
            if admin {
                self.notice="Nhân viên gửi đơn từ tài khoản có hồ sơ HR liên kết. ADMIN xem và phê duyệt đơn tại đây.".into();
            } else {
                self.clear_form();
                self.create_open = true;
                self.error.clear();
            }
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
                ui.label("Đang tải / lưu đơn nghỉ phép…");
            });
        }
        let search = self.search.trim().to_lowercase();
        let filtered = self
            .requests
            .iter()
            .filter(|r| {
                let matches = match self.filter_tab.as_str() {
                    "Nghỉ phép năm" => r.leave_type.to_lowercase().contains("phép năm"),
                    "Nghỉ ốm BHXH" => r.leave_type.to_lowercase().contains("ốm"),
                    "Đang chờ duyệt" => is_pending_status(&r.status),
                    _ => true,
                };
                matches
                    && (search.is_empty()
                        || [&r.code, &r.leave_type, &r.reason, &r.employee_name]
                            .iter()
                            .any(|s| s.to_lowercase().contains(&search)))
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
        let mut columns = vec![
            TableColumn {
                title: "Mã đơn nghỉ",
                width: 140.0,
            },
            TableColumn {
                title: "Loại nghỉ phép",
                width: 170.0,
            },
            TableColumn {
                title: "Thời gian nghỉ",
                width: 210.0,
            },
            TableColumn {
                title: "Số ngày",
                width: 110.0,
            },
            TableColumn {
                title: "Lý do xin nghỉ",
                width: 220.0,
            },
            TableColumn {
                title: "Người duyệt",
                width: 170.0,
            },
            TableColumn {
                title: "Trạng thái",
                width: 130.0,
            },
            TableColumn {
                title: "Thao tác",
                width: 110.0,
            },
        ];
        if admin {
            columns.insert(
                1,
                TableColumn {
                    title: "Người làm đơn",
                    width: 210.0,
                },
            );
        }
        columns[0].width +=
            (ui.available_width() - 2.0 - columns.iter().map(|c| c.width).sum::<f32>()).max(0.0);
        if self.data_loaded {
            widgets::table(
                ui,
                "employee.leave.table",
                &columns,
                rows.len(),
                |ui, row, col| {
                    let r = rows[row];
                    if admin && col == 1 {
                        ui.label(RichText::new(&r.employee_name).strong());
                        ui.label(
                            RichText::new(format!("{} · {}", r.employee_code, r.department))
                                .size(11.5),
                        );
                        return;
                    }
                    let col = if admin && col > 1 { col - 1 } else { col };
                    match col {
                        0 => {
                            ui.label(RichText::new(&r.code).strong().color(crate::theme::PRIMARY));
                        }
                        1 => {
                            ui.label(RichText::new(&r.leave_type).strong());
                        }
                        2 => {
                            ui.label(format!("{} → {}", r.start_date, r.end_date));
                        }
                        3 => {
                            ui.label(format_days(r.days));
                        }
                        4 => {
                            ui.add(egui::Label::new(&r.reason).truncate())
                                .on_hover_text(&r.reason);
                        }
                        5 => {
                            ui.label(if r.reviewer_name.is_empty() {
                                "—"
                            } else {
                                &r.reviewer_name
                            });
                        }
                        6 => leave_status_badge(ui, &r.status),
                        _ => {
                            if ui.button("Chi tiết").clicked() {
                                self.selected = Some(r.clone());
                                self.details_open = true;
                                self.events.clear();
                                self.events_error.clear();
                                self.review_note.clear();
                                self.pending_events = Some(
                                    api.list_employee_leave_request_events_task(session, &r.id),
                                );
                            }
                        }
                    }
                },
            );
            ui.add_space(10.0);
            widgets::pagination(
                ui,
                "employee.leave.pagination",
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
                "employee.leave.create",
                "Tạo Đơn Xin Nghỉ Phép Mới",
                540.0,
                self.pending_create.is_some(),
                |ui| {
                    ui.add_space(14.0);
                    widgets::form_select(
                        ui,
                        "employee.leave.type",
                        "Loại nghỉ phép",
                        true,
                        &mut self.leave_type,
                        EMPLOYEE_SELF_SERVICE_LEAVE_TYPES,
                    );
                    if ui.available_width() < 460.0 {
                        widgets::form_date(
                            ui,
                            "employee.leave.from",
                            "Từ ngày",
                            true,
                            &mut self.start_date,
                        );
                        widgets::form_date(
                            ui,
                            "employee.leave.to",
                            "Đến ngày",
                            true,
                            &mut self.end_date,
                        );
                    } else {
                        ui.columns(2, |c| {
                            widgets::form_date(
                                &mut c[0],
                                "employee.leave.from",
                                "Từ ngày",
                                true,
                                &mut self.start_date,
                            );
                            widgets::form_date(
                                &mut c[1],
                                "employee.leave.to",
                                "Đến ngày",
                                true,
                                &mut self.end_date,
                            );
                        });
                    }
                    widgets::form_input(
                        ui,
                        "employee.leave.days",
                        "Số ngày nghỉ",
                        true,
                        &mut self.days,
                        "Bước 0,5 ngày",
                        false,
                    );
                    widgets::form_textarea(
                        ui,
                        "employee.leave.reason",
                        "Lý do xin nghỉ",
                        true,
                        &mut self.reason,
                        "",
                        3,
                    );
                    widgets::form_input(
                        ui,
                        "employee.leave.handover",
                        "Người nhận bàn giao",
                        false,
                        &mut self.handover_person,
                        "",
                        false,
                    );
                    widgets::form_input(
                        ui,
                        "employee.leave.phone",
                        "Điện thoại liên hệ",
                        false,
                        &mut self.contact_phone,
                        "",
                        false,
                    );
                    if !self.error.is_empty() {
                        ui.colored_label(Color32::DARK_RED, &self.error);
                    }
                    ui.add_space(18.0);
                    widgets::action_row(ui, |ui| {
                        if ui.button("Gửi đơn phê duyệt").clicked() {
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
                match self.build_create_request() {
                    Ok(input) => {
                        self.error.clear();
                        self.notice.clear();
                        self.pending_create =
                            Some(api.create_employee_leave_request_task(session, &input));
                    }
                    Err(error) => self.error = error,
                }
            }
        }
        if self.details_open {
            if let Some(r) = self.selected.clone() {
                let mut decision = None;
                let (_, closed) = widgets::drawer(
                    ctx,
                    "employee.leave.details",
                    "Chi Tiết Đơn Nghỉ Phép",
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
                                    RichText::new(&r.code).strong().color(crate::theme::PRIMARY),
                                );
                                ui.label(RichText::new(&r.leave_type).size(17.0).strong());
                                ui.label(format!(
                                    "{} → {} ({})",
                                    r.start_date,
                                    r.end_date,
                                    format_days(r.days)
                                ));
                                leave_status_badge(ui, &r.status);
                                if admin {
                                    ui.label(format!(
                                        "{} · {} · {}",
                                        r.employee_name, r.employee_code, r.department
                                    ));
                                }
                            });
                        ui.add_space(16.0);
                        ui.strong("Thông Tin Phê Duyệt & Quản Lý");
                        ui.add_space(10.0);
                        for (label, value) in [
                            (
                                "Người phê duyệt",
                                if r.reviewer_name.is_empty() {
                                    "—".into()
                                } else {
                                    r.reviewer_name.clone()
                                },
                            ),
                            ("Lý do cụ thể", r.reason.clone()),
                            (
                                "Ghi chú phê duyệt",
                                if r.review_note.is_empty() {
                                    "—".into()
                                } else {
                                    r.review_note.clone()
                                },
                            ),
                        ] {
                            ui.horizontal_wrapped(|ui| {
                                ui.label(label);
                                ui.strong(value);
                            });
                            ui.add_space(8.0);
                        }
                        ui.separator();
                        ui.strong("Lịch sử xử lý");
                        if self.pending_events.is_some() {
                            ui.spinner();
                        } else if !self.events_error.is_empty() {
                            ui.colored_label(Color32::DARK_RED, &self.events_error);
                        } else if self.events.is_empty() {
                            ui.label("Chưa có lịch sử xử lý.");
                        } else {
                            for e in &self.events {
                                ui.label(format!(
                                    "{} · {} · {} → {} · {}",
                                    e.created_at,
                                    e.actor_name,
                                    e.from_status.as_deref().unwrap_or("—"),
                                    e.to_status,
                                    if e.note.is_empty() {
                                        &e.event_type
                                    } else {
                                        &e.note
                                    }
                                ));
                            }
                        }
                        if admin && r.status == "Chờ duyệt" && r.employee_id != session.user.id
                        {
                            ui.add_space(16.0);
                            ui.add_enabled_ui(self.pending_decision.is_none(), |ui| {
                                widgets::form_textarea(
                                    ui,
                                    "employee.leave.review",
                                    "Ghi chú phê duyệt",
                                    false,
                                    &mut self.review_note,
                                    "",
                                    2,
                                );
                                if !self.error.is_empty() {
                                    ui.colored_label(Color32::DARK_RED, &self.error);
                                }
                                widgets::action_row(ui, |ui| {
                                    if ui.button("Phê duyệt").clicked() {
                                        decision = Some("Đã duyệt");
                                    }
                                    if ui.button("Từ chối").clicked() {
                                        decision = Some("Từ chối");
                                    }
                                });
                            });
                        }
                        ui.add_space(16.0);
                        ui.add_enabled(false, egui::Button::new("In Đơn Nghỉ Phép (A4)"))
                            .on_disabled_hover_text("Chưa có API trả tệp đơn nghỉ phép.");
                    },
                );
                if closed {
                    self.details_open = false;
                }
                if let Some(status) = decision {
                    self.notice.clear();
                    self.error.clear();
                    self.pending_decision = Some(api.decide_employee_leave_request_task(
                        session,
                        &r.id,
                        status,
                        &self.review_note,
                    ));
                }
            }
        }
    }

    fn clear_form(&mut self) {
        self.leave_type = EMPLOYEE_SELF_SERVICE_LEAVE_TYPES[0].to_owned();
        self.start_date = chrono::Utc::now().format("%Y-%m-%d").to_string();
        self.end_date = self.start_date.clone();
        self.days = "1".to_owned();
        self.reason.clear();
        self.handover_person.clear();
        self.contact_phone.clear();
    }

    fn build_create_request(&self) -> Result<CreateEmployeeLeaveRequest, String> {
        let leave_type = if self.leave_type.trim().is_empty() {
            EMPLOYEE_SELF_SERVICE_LEAVE_TYPES[0]
        } else {
            self.leave_type.as_str()
        };
        if !EMPLOYEE_SELF_SERVICE_LEAVE_TYPES.contains(&leave_type) {
            return Err("Loại nghỉ phép không hợp lệ.".to_owned());
        }
        let start_date = chrono::NaiveDate::parse_from_str(self.start_date.trim(), "%Y-%m-%d")
            .map_err(|_| "Ngày bắt đầu phải có định dạng YYYY-MM-DD.".to_owned())?;
        let end_date = chrono::NaiveDate::parse_from_str(self.end_date.trim(), "%Y-%m-%d")
            .map_err(|_| "Ngày kết thúc phải có định dạng YYYY-MM-DD.".to_owned())?;
        if end_date < start_date {
            return Err("Ngày kết thúc không được trước ngày bắt đầu.".to_owned());
        }
        let days = self
            .days
            .trim()
            .replace(',', ".")
            .parse::<f64>()
            .map_err(|_| "Số ngày nghỉ không hợp lệ.".to_owned())?;
        if !(0.5..=366.0).contains(&days)
            || !days.is_finite()
            || (days * 2.0 - (days * 2.0).round()).abs() > f64::EPSILON
        {
            return Err("Số ngày nghỉ phải từ 0,5 đến 366 và theo bước 0,5.".to_owned());
        }
        let reason = self.reason.trim();
        if reason.is_empty() || reason.chars().count() > 4_000 {
            return Err("Vui lòng nhập lý do nghỉ (tối đa 4.000 ký tự).".to_owned());
        }
        if self.handover_person.chars().count() > 200 || self.contact_phone.chars().count() > 50 {
            return Err("Người bàn giao tối đa 200 ký tự; điện thoại tối đa 50 ký tự.".to_owned());
        }
        Ok(CreateEmployeeLeaveRequest {
            leave_type: leave_type.to_owned(),
            start_date: start_date.to_string(),
            end_date: end_date.to_string(),
            days,
            reason: reason.to_owned(),
            handover_person: non_empty(&self.handover_person),
            contact_phone: non_empty(&self.contact_phone),
        })
    }
}

fn normalize_collection_keys(mut requests: Vec<LeaveRequestRecord>) -> Vec<LeaveRequestRecord> {
    for request in &mut requests {
        if request.key.trim().is_empty() {
            let key = request.identity_key().to_owned();
            request.key = key;
        }
    }
    requests
}

fn is_leave_eligible_employee(employee: &Employee) -> bool {
    employee.is_active
        && employee.role != "ADMIN"
        && employee.status.trim() != "Đã nghỉ việc"
        && !employee.id.trim().is_empty()
        && !employee.name.trim().is_empty()
        && !employee.code.trim().is_empty()
        && !employee.department.trim().is_empty()
}

fn employee_matches_search(employee: &Employee, query: &str) -> bool {
    query.is_empty()
        || employee.name.to_lowercase().contains(query)
        || employee.code.to_lowercase().contains(query)
        || employee.department.to_lowercase().contains(query)
}

fn employee_choice_label(employee: &Employee) -> String {
    format!(
        "{} · {} · {}",
        employee.name, employee.code, employee.department
    )
}

fn non_empty(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_owned())
}

fn is_pending_status(status: &str) -> bool {
    matches!(status, "Chờ duyệt" | "Đang xử lý" | "Chờ phê duyệt")
}

fn is_approved_status(status: &str) -> bool {
    matches!(status, "Đã duyệt" | "Đã phê duyệt")
}

fn format_days(value: f64) -> String {
    if value.fract() == 0.0 {
        format!("{} ngày", value as u32)
    } else {
        format!("{value:.1} ngày")
    }
}

fn render_status_filter_buttons(ui: &mut Ui, status_filter: &mut String, page: &mut usize) {
    for (status, label, width) in [
        ("Tất cả", "Tất cả đơn", 83.0),
        ("Chờ duyệt", "Chờ duyệt", 78.0),
        ("Đã duyệt", "Đã duyệt", 70.0),
        ("Từ chối", "Từ chối", 62.0),
    ] {
        let selected = status_filter == status;
        let (fill, stroke, text_color) = if selected {
            (
                Color32::from_rgb(224, 242, 241),
                Color32::from_rgb(0, 150, 136),
                Color32::from_rgb(0, 121, 107),
            )
        } else {
            (
                Color32::WHITE,
                Color32::from_rgb(203, 213, 225),
                Color32::from_rgb(71, 85, 105),
            )
        };
        let label = RichText::new(label).size(11.5).color(text_color);
        let label = if selected { label.strong() } else { label };
        if ui
            .add(
                egui::Button::new(label)
                    .fill(fill)
                    .stroke(egui::Stroke::new(1.0, stroke))
                    .min_size(Vec2::new(width, 28.0))
                    .rounding(6.0),
            )
            .clicked()
        {
            *status_filter = status.to_owned();
            *page = 0;
        }
    }
}

fn render_legacy_pagination(
    ui: &mut Ui,
    page: &mut usize,
    page_count: usize,
    page_size: &mut usize,
) {
    ui.horizontal(|ui| {
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            egui::ComboBox::from_id_salt("attendance_leave_page_size")
                .selected_text(format!("{} / page", *page_size))
                .width(98.0)
                .show_ui(ui, |ui| {
                    for size in [8, 16, 32, 64] {
                        if ui
                            .selectable_value(page_size, size, format!("{size} / page"))
                            .changed()
                        {
                            *page = 0;
                        }
                    }
                });

            let button = |ui: &mut Ui, label: &str, enabled: bool| {
                ui.add_enabled(
                    enabled,
                    egui::Button::new(RichText::new(label).size(14.0))
                        .min_size(Vec2::splat(24.0))
                        .fill(Color32::WHITE)
                        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                        .rounding(5.0),
                )
                .clicked()
            };
            if button(ui, "›", *page + 1 < page_count) {
                *page += 1;
            }
            ui.add(
                egui::Button::new(RichText::new((*page + 1).to_string()).size(12.0))
                    .min_size(Vec2::new(24.0, 24.0))
                    .fill(Color32::WHITE)
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(0, 150, 136)))
                    .rounding(5.0),
            );
            if button(ui, "‹", *page > 0) {
                *page -= 1;
            }
        });
    });
}

fn metric(ui: &mut Ui, label: &str, value: String, caption: String, color: Color32) {
    egui::Frame::none()
        .fill(Color32::WHITE)
        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
        .rounding(8.0)
        .inner_margin(egui::Margin::symmetric(18.0, 14.0))
        .show(ui, |ui| {
            ui.set_min_height(if ui.ctx().screen_rect().width() <= 992.0 {
                80.0
            } else {
                95.0
            });
            let previous_vertical_spacing = ui.spacing().item_spacing.y;
            ui.spacing_mut().item_spacing.y = 0.0;
            ui.label(
                RichText::new(label)
                    .size(12.5)
                    .color(Color32::from_rgb(100, 116, 139)),
            );
            ui.add_space(4.0);
            ui.label(RichText::new(value).size(24.0).strong().color(color));
            ui.add_space(2.0);
            ui.label(RichText::new(caption).size(11.5).color(color));
            ui.spacing_mut().item_spacing.y = previous_vertical_spacing;
        });
}

fn admin_leave_request_column_widths(available_width: f32) -> [f32; 6] {
    const FIXED_WIDTHS: f32 = 220.0 + 210.0 + 220.0 + 130.0 + 140.0;
    let reason_width = (available_width - FIXED_WIDTHS).max(120.0);
    [220.0, 210.0, 220.0, reason_width, 130.0, 140.0]
}

fn render_admin_leave_request_header(ui: &mut Ui, widths: &[f32; 6]) {
    let width = widths.iter().sum();
    let (rect, _) = ui.allocate_exact_size(Vec2::new(width, 26.0), egui::Sense::hover());
    let painter = ui.painter();
    painter.rect_filled(rect, 0.0, Color32::from_rgb(245, 245, 245));

    let mut left = rect.left();
    for (column_width, label) in widths.iter().copied().zip(ADMIN_LEAVE_REQUEST_HEADERS) {
        painter.text(
            egui::pos2(left + 12.0, rect.center().y),
            egui::Align2::LEFT_CENTER,
            label,
            egui::FontId::proportional(13.0),
            Color32::from_rgb(100, 116, 139),
        );
        left += column_width;
    }
}

fn render_legacy_empty_table_state(ui: &mut Ui) {
    ui.add_space(4.0);
    ui.vertical_centered(|ui| {
        ui.add_space(32.0);
        let (rect, _) = ui.allocate_exact_size(Vec2::splat(48.0), egui::Sense::hover());
        let painter = ui.painter();
        let stroke = egui::Stroke::new(1.5, Color32::from_rgba_unmultiplied(207, 216, 220, 204));
        let point = |x: f32, y: f32| egui::pos2(rect.left() + x * 2.0, rect.top() + y * 2.0);
        let outline = [
            point(22.0, 19.0),
            point(22.0, 8.0),
            point(20.0, 6.0),
            point(11.0, 6.0),
            point(9.0, 3.0),
            point(4.0, 3.0),
            point(2.0, 5.0),
            point(2.0, 19.0),
            point(4.0, 21.0),
            point(20.0, 21.0),
            point(22.0, 19.0),
        ];
        painter.add(egui::Shape::line(outline.to_vec(), stroke));
        for x in [2.0, 7.0, 12.0, 17.0] {
            painter.line_segment([point(x, 10.0), point(x + 3.0, 10.0)], stroke);
        }
        ui.add_space(8.0);
        ui.label(
            RichText::new(ADMIN_LEAVE_REQUEST_EMPTY_TEXT)
                .size(14.0)
                .color(Color32::from_rgb(191, 191, 191)),
        );
        ui.add_space(32.0);
    });
    ui.add_space(4.0);
}

fn table_cell(ui: &mut Ui, width: f32, height: f32, add_contents: impl FnOnce(&mut Ui)) {
    ui.allocate_ui_with_layout(
        Vec2::new(width, height),
        egui::Layout::top_down(egui::Align::Min),
        add_contents,
    );
}

fn leave_status_badge(ui: &mut Ui, status: &str) {
    let (background, foreground) = if is_approved_status(status) {
        (
            Color32::from_rgb(220, 252, 231),
            Color32::from_rgb(22, 101, 52),
        )
    } else if is_pending_status(status) {
        (
            Color32::from_rgb(254, 243, 199),
            Color32::from_rgb(146, 64, 14),
        )
    } else if status == "Từ chối" {
        (
            Color32::from_rgb(254, 226, 226),
            Color32::from_rgb(153, 27, 27),
        )
    } else {
        (
            Color32::from_rgb(241, 245, 249),
            Color32::from_rgb(71, 85, 105),
        )
    };
    egui::Frame::none()
        .fill(background)
        .rounding(12.0)
        .inner_margin(egui::Margin::symmetric(8.0, 4.0))
        .show(ui, |ui| {
            ui.label(RichText::new(status).size(10.5).strong().color(foreground));
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
    use serde_json::json;

    #[test]
    fn admin_leave_table_labels_and_empty_state_match_legacy() {
        assert_eq!(
            ADMIN_LEAVE_REQUEST_HEADERS,
            [
                "Mã đơn & Loại nghỉ phép",
                "Người làm đơn",
                "Thời gian nghỉ & Số ngày",
                "Lý do xin nghỉ",
                "Trạng thái",
                "Thao tác",
            ]
        );
        assert_eq!(ADMIN_LEAVE_REQUEST_EMPTY_TEXT, "No Data");

        let widths = admin_leave_request_column_widths(1_040.0);
        assert_eq!(widths, [220.0, 210.0, 220.0, 120.0, 130.0, 140.0]);
        assert!((widths.iter().sum::<f32>() - 1_040.0).abs() < 0.01);

        let narrow_widths = admin_leave_request_column_widths(560.0);
        assert_eq!(narrow_widths, widths);
    }

    #[test]
    fn legacy_alias_fields_and_unknown_json_survive_round_trip() {
        let payload = json!({
            "key": "leave-1",
            "code": "NP-001",
            "employeeName": "Nguyễn An",
            "department": "Kỹ thuật",
            "type": "Nghỉ phép năm",
            "fromDate": "2026-10-10",
            "toDate": "2026-10-10",
            "days": "0.5",
            "reason": "Việc gia đình",
            "status": "Chờ duyệt",
            "legacyFlag": true
        });
        let request: LeaveRequestRecord = serde_json::from_value(payload).expect("leave record");
        assert_eq!(request.effective_leave_type(), "Nghỉ phép năm");
        assert_eq!(request.effective_start_date(), "2026-10-10");
        assert_eq!(request.effective_end_date(), "2026-10-10");
        assert_eq!(request.effective_days_count(), Some(0.5));
        assert_eq!(request.extra.get("legacyFlag"), Some(&json!(true)));
        let round_trip = serde_json::to_value(request).expect("serialized leave record");
        assert_eq!(round_trip["type"], "Nghỉ phép năm");
        assert_eq!(round_trip["fromDate"], "2026-10-10");
        assert_eq!(round_trip["legacyFlag"], true);
        assert!(round_trip.get("employeeId").is_none());
        assert!(round_trip.get("employeeCode").is_none());
    }

    #[test]
    fn new_leave_record_serializes_canonical_employee_identity() {
        let request = LeaveRequestRecord {
            employee_id: Some("employee-1".to_owned()),
            employee_code: Some("NV-0001".to_owned()),
            employee_name: "Nguyễn An".to_owned(),
            department: "Kỹ thuật".to_owned(),
            ..Default::default()
        };
        let wire = serde_json::to_value(request).expect("leave record wire");
        assert_eq!(wire["employeeId"], "employee-1");
        assert_eq!(wire["employeeCode"], "NV-0001");
        assert_eq!(wire["employeeName"], "Nguyễn An");
        assert_eq!(wire["department"], "Kỹ thuật");
    }

    #[test]
    fn leave_employee_picker_excludes_ineligible_profiles_and_searches_canonical_fields() {
        let eligible = Employee {
            id: "employee-1".to_owned(),
            code: "NV-0001".to_owned(),
            name: "Nguyễn An".to_owned(),
            department: "Kỹ thuật".to_owned(),
            email: "employee@example.test".to_owned(),
            phone: String::new(),
            address: String::new(),
            position: "Kỹ thuật viên".to_owned(),
            status: "Chính thức".to_owned(),
            join_date: "2020-01-01".to_owned(),
            salary_base: 0,
            role: "USER".to_owned(),
            is_active: true,
            activation_status: "Đã kích hoạt".to_owned(),
        };
        assert!(is_leave_eligible_employee(&eligible));
        assert!(employee_matches_search(&eligible, "nv-0001"));
        assert!(employee_matches_search(&eligible, "kỹ thuật"));

        let mut inactive = eligible.clone();
        inactive.is_active = false;
        assert!(!is_leave_eligible_employee(&inactive));
        let mut retired = eligible.clone();
        retired.status = "Đã nghỉ việc".to_owned();
        assert!(!is_leave_eligible_employee(&retired));
        let mut missing_department = eligible;
        missing_department.department.clear();
        assert!(!is_leave_eligible_employee(&missing_department));
    }

    #[test]
    fn normalization_uses_legacy_code_when_key_is_missing() {
        let request = LeaveRequestRecord {
            code: "NP-002".to_owned(),
            ..Default::default()
        };
        let normalized = normalize_collection_keys(vec![request]);
        assert_eq!(normalized[0].key, "NP-002");
    }

    #[test]
    fn legacy_pending_statuses_are_reviewable() {
        assert!(is_pending_status("Chờ duyệt"));
        assert!(is_pending_status("Đang xử lý"));
        assert!(is_pending_status("Chờ phê duyệt"));
        assert!(!is_pending_status("Đã duyệt"));
        assert!(!is_pending_status("Từ chối"));
        assert!(is_approved_status("Đã phê duyệt"));
        assert!(is_approved_status("Đã duyệt"));
        assert!(!is_approved_status("Từ chối"));
    }

    #[test]
    fn self_service_form_validates_and_normalizes_half_day_input() {
        let mut view = EmployeeLeaveSelfServiceView {
            start_date: "2026-10-10".to_owned(),
            end_date: "2026-10-11".to_owned(),
            days: "0,5".to_owned(),
            reason: "Việc gia đình".to_owned(),
            ..Default::default()
        };
        let request = view.build_create_request().expect("valid half-day request");
        assert_eq!(request.leave_type, "Nghỉ phép năm");
        assert_eq!(request.days, 0.5);
        assert_eq!(request.start_date, "2026-10-10");

        view.end_date = "2026-10-09".to_owned();
        assert!(view.build_create_request().is_err());
        view.end_date = "2026-10-11".to_owned();
        view.days = "0,75".to_owned();
        assert!(view.build_create_request().is_err());
        view.days = "1".to_owned();
        view.reason.clear();
        assert!(view.build_create_request().is_err());
    }

    #[test]
    fn employee_form_leave_types_match_the_legacy_options() {
        assert_eq!(
            EMPLOYEE_SELF_SERVICE_LEAVE_TYPES,
            &[
                "Nghỉ phép năm",
                "Nghỉ ốm BHXH",
                "Nghỉ việc riêng có lương",
                "Nghỉ không lương",
                "Nghỉ thai sản",
            ][..]
        );

        let mut view = EmployeeLeaveSelfServiceView {
            start_date: "2026-10-10".to_owned(),
            end_date: "2026-10-10".to_owned(),
            days: "1".to_owned(),
            reason: "Kiểm thử lựa chọn loại nghỉ".to_owned(),
            ..Default::default()
        };
        for leave_type in EMPLOYEE_SELF_SERVICE_LEAVE_TYPES {
            view.leave_type = (*leave_type).to_owned();
            let request = view
                .build_create_request()
                .expect("legacy option is accepted by client validation");
            assert_eq!(request.leave_type.as_str(), *leave_type);
        }
    }
}
