use std::time::Duration;
use web_time::Instant;

use crate::api::{
    ApiClient, ApiTask, CreateEmployeeOvertimeRequest, EmployeeOvertimeRequest,
    EmployeeOvertimeRequestEvent, EmployeeOvertimeRequestEventsResponse,
    EmployeeOvertimeRequestResponse, EmployeeOvertimeRequestsResponse,
};
use crate::models::Session;
use crate::widgets::{self, Metric, TableColumn, TagTone};
use egui::{Color32, RichText, Ui};

const DAY_TYPES: &[(&str, &str)] = &[
    ("weekday", "Ngày thường"),
    ("weekend", "Cuối tuần"),
    ("holiday", "Ngày lễ/Tết"),
];

#[derive(Default)]
pub struct EmployeeOvertimeRequestsView {
    requests: Vec<EmployeeOvertimeRequest>,
    pending_load: Option<ApiTask<EmployeeOvertimeRequestsResponse>>,
    pending_create: Option<ApiTask<EmployeeOvertimeRequestResponse>>,
    pending_decision: Option<ApiTask<EmployeeOvertimeRequestResponse>>,
    pending_events: Option<ApiTask<EmployeeOvertimeRequestEventsResponse>>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    data_loaded: bool,
    create_open: bool,
    selected: Option<EmployeeOvertimeRequest>,
    details_open: bool,
    events: Vec<EmployeeOvertimeRequestEvent>,
    selected_day_filter: String,
    selected_status_filter: String,
    search: String,
    page: usize,
    page_size: usize,
    ot_date: String,
    hours: String,
    day_type: String,
    project: String,
    reason: String,
    review_note: String,
    notice: String,
    error: String,
    events_error: String,
}

impl EmployeeOvertimeRequestsView {
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
            self.create_open = false;
            self.selected = None;
            self.details_open = false;
            self.events.clear();
            self.notice.clear();
            self.error.clear();
            self.events_error.clear();
            self.search.clear();
            self.page = 0;
            self.page_size = 8;
            self.review_note.clear();
            self.selected_day_filter = "all".to_owned();
            self.selected_status_filter = "all".to_owned();
            self.clear_form();
        }

        if self.pending_load.is_none()
            && self.pending_create.is_none()
            && self.pending_decision.is_none()
            && self
                .last_loaded
                .is_none_or(|loaded| loaded.elapsed() >= Duration::from_secs(30))
        {
            self.pending_load = Some(api.list_employee_overtime_requests_task(session));
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
                    self.create_open = false;
                    self.clear_form();
                    self.notice = "Đã gửi đăng ký OT lên máy chủ.".to_owned();
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
                    self.selected = Some(request.clone());
                    self.events.clear();
                    self.pending_events =
                        Some(api.list_employee_overtime_request_events_task(session, &request.id));
                    self.notice = "Đã lưu quyết định và lịch sử xử lý.".to_owned();
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

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.poll(ctx, session, api);
        let admin = session.user.role == "ADMIN";
        let busy = self.pending_load.is_some()
            || self.pending_create.is_some()
            || self.pending_decision.is_some();
        let approved_hours = self
            .requests
            .iter()
            .filter(|r| r.status == "Đã duyệt OT")
            .map(|r| r.requested_hours)
            .sum::<f64>();
        let pending = self
            .requests
            .iter()
            .filter(|r| r.status == "Chờ phê duyệt")
            .count();
        let labels = if admin {
            [
                "Tổng số giờ OT đã phê duyệt",
                "Dự toán phụ cấp OT trong tháng",
                "Đơn đăng ký chờ lãnh đạo duyệt",
                "Tuân thủ trần giờ OT quy định",
            ]
        } else {
            [
                "Tổng giờ OT đã được phê duyệt",
                "Hệ số làm thêm ngày thường",
                "Hệ số ngày nghỉ cuối tuần",
                "Hệ số ngày Lễ, Tết hưởng lương",
            ]
        };
        let values = [
            format_hours(approved_hours),
            "—".into(),
            if admin {
                format!("{pending} Đơn")
            } else {
                "—".into()
            },
            "—".into(),
        ];
        let details = if admin {
            [
                "Giờ yêu cầu đã được duyệt theo hồ sơ",
                "Chưa có nguồn chính sách và tính tiền OT",
                "Theo trạng thái đăng ký trên máy chủ",
                "Chưa có nguồn chính sách trần giờ OT",
            ]
        } else {
            [
                "Giờ yêu cầu đã được duyệt theo hồ sơ",
                "Chưa có chính sách lương OT được xác nhận",
                "Chưa có chính sách lương OT được xác nhận",
                "Chưa có chính sách lương OT được xác nhận",
            ]
        };
        let colors = [
            crate::theme::PRIMARY,
            Color32::from_rgb(37, 99, 235),
            Color32::from_rgb(217, 119, 6),
            Color32::from_rgb(22, 163, 74),
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
        widgets::metrics(ui, "attendance.ot.metrics", &cards);
        ui.add_space(16.0);
        let tabs = ["Tất cả đăng ký", "Ngày thường", "Cuối tuần", "Ngày Lễ Tết"];
        let day_values = ["all", "weekday", "weekend", "holiday"];
        let selected = day_values
            .iter()
            .position(|v| *v == self.selected_day_filter)
            .unwrap_or(0);
        let toolbar = widgets::filter_toolbar_with_more(
            ui,
            "attendance.ot.toolbar",
            &tabs,
            selected,
            &mut self.search,
            "Tìm theo mã đăng ký, dự án, lý do…",
            if admin {
                "Xem điều kiện đăng ký"
            } else {
                "Đăng ký làm thêm (OT)"
            },
            false,
            80,
            |ui| {
                ui.add_enabled(
                    false,
                    egui::Button::new(if admin {
                        "Xuất Excel"
                    } else {
                        "In Phiếu OT (A4)"
                    }),
                )
                .on_disabled_hover_text("Chưa có API trả tệp báo cáo OT.");
            },
        );
        if let Some(i) = toolbar.selected {
            self.selected_day_filter = day_values[i].into();
            self.page = 0;
        }
        if toolbar.search_changed {
            self.page = 0;
        }
        if toolbar.create_clicked && !busy {
            if admin {
                self.notice="Đăng ký OT phải do nhân viên gửi từ tài khoản có hồ sơ HR liên kết; ADMIN xem và phê duyệt các đăng ký tại đây.".into();
            } else {
                self.clear_form();
                self.create_open = true;
                self.error.clear();
            }
        }
        ui.add_space(10.0);
        ui.horizontal_wrapped(|ui| {
            widgets::combo_box("attendance.ot.status")
                .selected_text(match self.selected_status_filter.as_str() {
                    "all" => "Tất cả trạng thái",
                    value => value,
                })
                .show_ui(ui, |ui| {
                    for (value, label) in [
                        ("all", "Tất cả trạng thái"),
                        ("Chờ phê duyệt", "Chờ duyệt"),
                        ("Đã duyệt OT", "Đã duyệt"),
                        ("Từ chối", "Từ chối"),
                    ] {
                        if ui
                            .selectable_value(&mut self.selected_status_filter, value.into(), label)
                            .changed()
                        {
                            self.page = 0;
                        }
                    }
                });
            if ui
                .add_enabled(!busy, egui::Button::new("Làm mới"))
                .clicked()
            {
                self.last_loaded = None;
            }
        });
        if !self.notice.is_empty() {
            ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::DARK_RED, &self.error);
        }
        if busy {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải / lưu đăng ký OT…");
            });
        }
        let query = self.search.trim().to_lowercase();
        let filtered = self
            .requests
            .iter()
            .filter(|r| {
                (self.selected_day_filter == "all" || r.day_type == self.selected_day_filter)
                    && (self.selected_status_filter == "all"
                        || r.status == self.selected_status_filter)
                    && (query.is_empty()
                        || [
                            &r.code,
                            &r.project,
                            &r.reason,
                            &r.employee_name,
                            &r.employee_code,
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
        let mut columns = if admin {
            vec![
                TableColumn {
                    title: "Mã đơn OT & Dự án",
                    width: 220.0,
                },
                TableColumn {
                    title: "Nhân sự thực hiện OT",
                    width: 220.0,
                },
                TableColumn {
                    title: "Ngày & Khung giờ OT",
                    width: 160.0,
                },
                TableColumn {
                    title: "Số tiếng & Phân loại",
                    width: 170.0,
                },
                TableColumn {
                    title: "Lý do & Nội dung",
                    width: 230.0,
                },
                TableColumn {
                    title: "Dự toán phụ cấp",
                    width: 150.0,
                },
                TableColumn {
                    title: "Trạng thái",
                    width: 150.0,
                },
                TableColumn {
                    title: "Thao tác",
                    width: 110.0,
                },
            ]
        } else {
            vec![
                TableColumn {
                    title: "Mã đăng ký OT",
                    width: 150.0,
                },
                TableColumn {
                    title: "Ngày làm thêm",
                    width: 130.0,
                },
                TableColumn {
                    title: "Khung giờ & Số tiếng",
                    width: 200.0,
                },
                TableColumn {
                    title: "Hệ số tính lương",
                    width: 170.0,
                },
                TableColumn {
                    title: "Dự án / Hạng mục",
                    width: 210.0,
                },
                TableColumn {
                    title: "Lý do & Nội dung OT",
                    width: 230.0,
                },
                TableColumn {
                    title: "Người duyệt",
                    width: 160.0,
                },
                TableColumn {
                    title: "Trạng thái",
                    width: 150.0,
                },
                TableColumn {
                    title: "Thao tác",
                    width: 110.0,
                },
            ]
        };
        columns[0].width +=
            (ui.available_width() - 2.0 - columns.iter().map(|c| c.width).sum::<f32>()).max(0.0);
        ui.add_space(12.0);
        if self.data_loaded {
            widgets::table(
                ui,
                "attendance.ot.table",
                &columns,
                rows.len(),
                |ui, row, col| {
                    let r = rows[row];
                    if col == columns.len() - 1 {
                        if ui.button("Chi tiết").clicked() {
                            self.selected = Some(r.clone());
                            self.details_open = true;
                            self.events.clear();
                            self.events_error.clear();
                            self.review_note.clear();
                            self.pending_events = Some(
                                api.list_employee_overtime_request_events_task(session, &r.id),
                            );
                        }
                    } else if col == columns.len() - 2 {
                        widgets::tag(ui, &r.status, ot_tone(&r.status));
                    } else if admin {
                        match col {
                            0 => {
                                ui.label(
                                    RichText::new(&r.project)
                                        .strong()
                                        .color(crate::theme::PRIMARY),
                                );
                                ui.label(RichText::new(&r.code).size(11.5));
                            }
                            1 => {
                                ui.label(RichText::new(&r.employee_name).strong());
                                ui.label(
                                    RichText::new(format!(
                                        "{} · {}",
                                        r.employee_code, r.department
                                    ))
                                    .size(11.5),
                                );
                            }
                            2 => {
                                ui.label(&r.ot_date);
                                ui.label("Khung giờ: —")
                                    .on_hover_text("API chưa trả giờ bắt đầu và kết thúc.");
                            }
                            3 => {
                                ui.label(format_hours(r.requested_hours));
                                widgets::tag(ui, day_type_label(&r.day_type), TagTone::Processing);
                            }
                            4 => {
                                ui.add(egui::Label::new(&r.reason).truncate())
                                    .on_hover_text(&r.reason);
                            }
                            _ => {
                                ui.label("—")
                                    .on_hover_text("Chưa có API dự toán phụ cấp OT.");
                            }
                        }
                    } else {
                        match col {
                            0 => {
                                ui.label(
                                    RichText::new(&r.code).strong().color(crate::theme::PRIMARY),
                                );
                            }
                            1 => {
                                ui.label(&r.ot_date);
                            }
                            2 => {
                                ui.label(format_hours(r.requested_hours));
                                ui.label("Khung giờ: —");
                            }
                            3 => {
                                widgets::tag(ui, day_type_label(&r.day_type), TagTone::Processing);
                                ui.label("Hệ số: —");
                            }
                            4 => {
                                ui.add(egui::Label::new(&r.project).truncate())
                                    .on_hover_text(&r.project);
                            }
                            5 => {
                                ui.add(egui::Label::new(&r.reason).truncate())
                                    .on_hover_text(&r.reason);
                            }
                            _ => {
                                ui.label(if r.reviewer_name.is_empty() {
                                    "—"
                                } else {
                                    &r.reviewer_name
                                });
                            }
                        }
                    }
                },
            );
            ui.add_space(10.0);
            widgets::pagination(
                ui,
                "attendance.ot.pagination",
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
                "attendance.ot.create",
                "Đăng Ký Làm Thêm Giờ (Overtime - OT)",
                540.0,
                self.pending_create.is_some(),
                |ui| {
                    ui.add_space(14.0);
                    widgets::form_date(ui, "ot.date", "Ngày làm thêm giờ", true, &mut self.ot_date);
                    widgets::form_input(
                        ui,
                        "ot.hours",
                        "Số giờ làm thêm dự kiến (tiếng)",
                        true,
                        &mut self.hours,
                        "Bước 0,5 giờ",
                        false,
                    );
                    let label = day_type_label(&self.day_type).to_owned();
                    widgets::form_field(
                        ui,
                        "ot.day",
                        "Loại ngày làm thêm",
                        self.day_type.is_empty(),
                        |ui| {
                            widgets::combo_box("ot.day.choice")
                                .width(ui.available_width())
                                .selected_text(label)
                                .show_ui(ui, |ui| {
                                    for (value, label) in DAY_TYPES {
                                        ui.selectable_value(
                                            &mut self.day_type,
                                            (*value).into(),
                                            *label,
                                        );
                                    }
                                });
                        },
                    );
                    widgets::form_input(
                        ui,
                        "ot.project",
                        "Dự án / Hạng mục",
                        true,
                        &mut self.project,
                        "",
                        false,
                    );
                    widgets::form_textarea(
                        ui,
                        "ot.reason",
                        "Nội dung công việc và mục tiêu OT",
                        true,
                        &mut self.reason,
                        "",
                        3,
                    );
                    if !self.error.is_empty() {
                        ui.colored_label(Color32::DARK_RED, &self.error);
                    }
                    ui.add_space(18.0);
                    widgets::action_row(ui, |ui| {
                        if ui.button("Gửi đăng ký").clicked() {
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
                            Some(api.create_employee_overtime_request_task(session, &input));
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
                    "attendance.ot.details",
                    "Chi Tiết Đăng Ký Làm Thêm Giờ (OT)",
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
                                ui.label(RichText::new(&r.project).size(17.0).strong());
                                widgets::tag(ui, &r.status, ot_tone(&r.status));
                                ui.label(format!(
                                    "{} · {} · {}",
                                    r.employee_name, r.employee_code, r.department
                                ));
                            });
                        ui.add_space(16.0);
                        ui.strong("Thông Tin Đăng Ký & Phê Duyệt");
                        ui.add_space(10.0);
                        for (label, value) in [
                            ("Ngày làm thêm", r.ot_date.clone()),
                            ("Số giờ yêu cầu", format_hours(r.requested_hours)),
                            ("Phân loại ngày", day_type_label(&r.day_type).to_owned()),
                            ("Nội dung công việc", r.reason.clone()),
                            (
                                "Người xử lý",
                                if r.reviewer_name.is_empty() {
                                    "—".into()
                                } else {
                                    r.reviewer_name.clone()
                                },
                            ),
                            (
                                "Ghi chú xử lý",
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
                        if can_review_overtime(session, &r) {
                            ui.add_space(16.0);
                            ui.add_enabled_ui(self.pending_decision.is_none(), |ui| {
                                widgets::form_textarea(
                                    ui,
                                    "ot.review",
                                    "Ghi chú xử lý",
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
                                        decision = Some("Đã duyệt OT");
                                    }
                                    if ui.button("Từ chối").clicked() {
                                        decision = Some("Từ chối");
                                    }
                                });
                            });
                        }
                        ui.add_space(16.0);
                        ui.add_enabled(false, egui::Button::new("In Phiếu OT (A4)"))
                            .on_disabled_hover_text("Chưa có API trả tệp phiếu OT.");
                    },
                );
                if closed {
                    self.details_open = false;
                }
                if let Some(status) = decision {
                    self.notice.clear();
                    self.error.clear();
                    self.pending_decision = Some(api.decide_employee_overtime_request_task(
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
        self.ot_date.clear();
        self.hours.clear();
        self.day_type.clear();
        self.project.clear();
        self.reason.clear();
    }

    fn build_create_request(&self) -> Result<CreateEmployeeOvertimeRequest, String> {
        let date = chrono::NaiveDate::parse_from_str(self.ot_date.trim(), "%Y-%m-%d")
            .map_err(|_| "Ngày OT phải có định dạng YYYY-MM-DD.".to_owned())?;
        let hours = self
            .hours
            .trim()
            .replace(',', ".")
            .parse::<f64>()
            .map_err(|_| "Số giờ OT không hợp lệ.".to_owned())?;
        let fraction = hours.fract();
        if !hours.is_finite() || hours < 0.5 || (fraction != 0.0 && fraction != 0.5) {
            return Err("Số giờ OT phải tối thiểu 0,5 giờ và theo bước 0,5.".to_owned());
        }
        if !DAY_TYPES
            .iter()
            .any(|(value, _)| *value == self.day_type.as_str())
        {
            return Err("Phân loại ngày OT không hợp lệ.".to_owned());
        }
        let project = self.project.trim();
        let reason = self.reason.trim();
        if project.is_empty() || project.chars().count() > 500 {
            return Err("Vui lòng nhập dự án/hạng mục (tối đa 500 ký tự).".to_owned());
        }
        if reason.is_empty() || reason.chars().count() > 4_000 {
            return Err("Vui lòng nhập nội dung công việc (tối đa 4.000 ký tự).".to_owned());
        }
        Ok(CreateEmployeeOvertimeRequest {
            ot_date: date.to_string(),
            requested_hours: hours,
            day_type: self.day_type.clone(),
            project: project.to_owned(),
            reason: reason.to_owned(),
        })
    }
}

fn can_review_overtime(session: &Session, request: &EmployeeOvertimeRequest) -> bool {
    session.user.role == "ADMIN"
        && request.status == "Chờ phê duyệt"
        && request.employee_id != session.user.id
}

fn ot_tone(status: &str) -> TagTone {
    match status {
        "Đã duyệt OT" => TagTone::Success,
        "Từ chối" => TagTone::Error,
        "Chờ phê duyệt" => TagTone::Warning,
        _ => TagTone::Neutral,
    }
}

fn day_type_label(value: &str) -> &str {
    DAY_TYPES
        .iter()
        .find_map(|(day_type, label)| (*day_type == value).then_some(*label))
        .unwrap_or("Chưa phân loại")
}

fn format_hours(hours: f64) -> String {
    if hours.fract() == 0.0 {
        format!("{} giờ", hours as u32)
    } else {
        format!("{hours:.1} giờ")
    }
}

fn metric(ui: &mut Ui, label: &str, value: usize) {
    egui::Frame::group(ui.style()).show(ui, |ui| {
        ui.set_min_width(140.0);
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
    fn overtime_form_accepts_half_hours_and_legacy_categories_without_pay_fields() {
        let mut view = EmployeeOvertimeRequestsView {
            ot_date: "2026-10-10".to_owned(),
            hours: "2,5".to_owned(),
            day_type: "weekend".to_owned(),
            project: "Triển khai".to_owned(),
            reason: "Hoàn tất phát hành".to_owned(),
            ..Default::default()
        };
        let request = view.build_create_request().expect("valid OT request");
        assert_eq!(request.ot_date, "2026-10-10");
        assert_eq!(request.requested_hours, 2.5);
        assert_eq!(request.day_type, "weekend");
        view.hours = "24,5".to_owned();
        assert_eq!(
            view.build_create_request()
                .expect("legacy form has no upper-hours limit")
                .requested_hours,
            24.5
        );
        let payload = serde_json::to_value(request).expect("OT payload");
        assert!(payload.get("baseHourlyRate").is_none());
        assert!(payload.get("multiplier").is_none());
        assert!(payload.get("employeeId").is_none());
    }

    #[test]
    fn overtime_form_rejects_invalid_date_hours_and_empty_fields() {
        let mut view = EmployeeOvertimeRequestsView {
            ot_date: "2026-10-10".to_owned(),
            hours: "2".to_owned(),
            day_type: "weekday".to_owned(),
            project: "Dự án".to_owned(),
            reason: "Lý do".to_owned(),
            ..Default::default()
        };
        assert!(view.build_create_request().is_ok());
        view.ot_date = "10/10/2026".to_owned();
        assert!(view.build_create_request().is_err());
        view.ot_date = "2026-10-10".to_owned();
        view.hours = "1,25".to_owned();
        assert!(view.build_create_request().is_err());
        view.hours = "2".to_owned();
        view.reason.clear();
        assert!(view.build_create_request().is_err());
    }
}
