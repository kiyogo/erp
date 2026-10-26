use std::time::Duration;
use web_time::Instant;

use crate::api::{ApiClient, ApiTask, AttendanceShift, AttendanceShiftsResponse};
use crate::models::Session;
use crate::widgets::{self, Metric, TableColumn, TagTone};
use egui::{Color32, RichText, Ui};

const CATEGORIES: &[&str] = &["Hành chính", "Trực kíp", "Ca đêm", "Linh hoạt"];

pub struct AttendanceShiftCatalogView {
    shifts: Vec<AttendanceShift>,
    shifts_revision: String,
    pending_load: Option<ApiTask<AttendanceShiftsResponse>>,
    pending_save: Option<ApiTask<AttendanceShiftsResponse>>,
    loaded_for: Option<String>,
    data_loaded: bool,
    needs_reload: bool,
    last_loaded: Option<Instant>,
    search: String,
    category_filter: String,
    page: usize,
    page_size: usize,
    create_open: bool,
    selected: Option<AttendanceShift>,
    details_open: bool,
    shift_code: String,
    shift_name: String,
    time_range: String,
    working_hours: String,
    break_time: String,
    applicable_to: String,
    grace_minutes: String,
    night_allowance_pct: String,
    shift_category: String,
    notice: String,
    error: String,
}

impl Default for AttendanceShiftCatalogView {
    fn default() -> Self {
        Self {
            shifts: Vec::new(),
            shifts_revision: String::new(),
            pending_load: None,
            pending_save: None,
            loaded_for: None,
            data_loaded: false,
            needs_reload: true,
            last_loaded: None,
            search: String::new(),
            category_filter: "Tất cả".to_owned(),
            page: 0,
            page_size: 8,
            create_open: false,
            selected: None,
            details_open: false,
            shift_code: String::new(),
            shift_name: String::new(),
            time_range: "08:00 - 17:30".to_owned(),
            working_hours: "8".to_owned(),
            break_time: "12:00 - 13:30 (1.5h)".to_owned(),
            applicable_to: String::new(),
            grace_minutes: "15".to_owned(),
            night_allowance_pct: "0".to_owned(),
            shift_category: "Hành chính".to_owned(),
            notice: String::new(),
            error: String::new(),
        }
    }
}

impl AttendanceShiftCatalogView {
    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        if self.pending_load.is_some() || self.pending_save.is_some() {
            self.needs_reload = true;
            return;
        }
        self.error.clear();
        self.pending_load = Some(api.list_attendance_shifts_task(session));
        self.needs_reload = false;
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let account = format!(
            "{}\n{}\n{}",
            session.endpoint, session.user.id, session.user.role
        );
        if self.loaded_for.as_deref() != Some(account.as_str()) {
            self.shifts.clear();
            self.shifts_revision.clear();
            self.pending_load = None;
            self.pending_save = None;
            self.loaded_for = Some(account);
            self.data_loaded = false;
            self.last_loaded = None;
            self.needs_reload = true;
            self.notice.clear();
            self.error.clear();
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

        if let Some(result) = self.pending_load.as_ref().and_then(ApiClient::poll) {
            self.pending_load = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.shifts_revision = response.revision;
                    self.shifts = response.data;
                    self.data_loaded = true;
                    self.error.clear();
                }
                Err(error) => {
                    self.data_loaded = false;
                    self.error = error;
                }
            }
        }

        if let Some(result) = self.pending_save.as_ref().and_then(ApiClient::poll) {
            self.pending_save = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.shifts_revision = response.revision;
                    self.shifts = response.data;
                    self.data_loaded = true;
                    self.clear_form();
                    self.create_open = false;
                    self.notice = "Đã lưu danh mục ca làm việc.".to_owned();
                    self.error.clear();
                }
                Err(error) => {
                    self.notice.clear();
                    self.error = error;
                }
            }
        }

        if self.pending_load.is_some() || self.pending_save.is_some() {
            ctx.request_repaint_after(Duration::from_millis(80));
        } else if let Some(last_loaded) = self.last_loaded {
            ctx.request_repaint_after(
                Duration::from_secs(30).saturating_sub(last_loaded.elapsed()),
            );
        }
    }

    fn clear_form(&mut self) {
        self.shift_code.clear();
        self.shift_name.clear();
        self.time_range = "08:00 - 17:30".to_owned();
        self.working_hours = "8".to_owned();
        self.break_time = "12:00 - 13:30 (1.5h)".to_owned();
        self.applicable_to.clear();
        self.grace_minutes = "15".to_owned();
        self.night_allowance_pct = "0".to_owned();
        self.shift_category = "Hành chính".to_owned();
    }

    fn is_busy(&self) -> bool {
        self.pending_load.is_some() || self.pending_save.is_some()
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            *self = Self::default();
            ui.label("Chỉ ADMIN được quản lý danh mục ca.");
            return;
        }
        self.poll(ctx, session, api);
        let busy = self.is_busy();
        ui.add_space(8.0);
        let active = self
            .shifts
            .iter()
            .filter(|s| s.status == "Đang áp dụng")
            .count();
        let night = self
            .shifts
            .iter()
            .filter(|s| s.shift_category == "Ca đêm" || s.night_allowance_pct > 0.0)
            .count();
        let values = [
            format!("{} Ca làm việc", self.shifts.len()),
            format!("{active} / {} Ca hiệu lực", self.shifts.len()),
            format!("{night} Ca đặc thù"),
            "—".into(),
        ];
        let labels = [
            "Tổng ca làm việc chuẩn hóa",
            "Ca đang áp dụng vận hành",
            "Ca trực đêm & Kíp 24/7",
            "Quy mô nhân sự phân ca",
        ];
        let details = [
            "Thiết lập theo tính chất công việc",
            "Theo trạng thái danh mục từ máy chủ",
            "Theo nhóm ca và phụ cấp đã lưu",
            "Chưa có dữ liệu nhân sự phân ca tại danh mục",
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
        widgets::metrics(ui, "attendance.shifts.metrics", &cards);
        ui.add_space(16.0);
        let tabs = [
            "Tất cả ca làm việc",
            "Hành chính",
            "Trực kíp",
            "Ca đêm",
            "Linh hoạt",
        ];
        let selected = tabs
            .iter()
            .position(|s| *s == self.category_filter)
            .unwrap_or(0);
        let toolbar = widgets::filter_toolbar_with_more(
            ui,
            "attendance.shifts.toolbar",
            &tabs,
            selected,
            &mut self.search,
            "Tìm theo tên ca, mã ca, đối tượng…",
            "Thiết lập ca mới",
            false,
            80,
            |ui| {
                ui.add_enabled(false, egui::Button::new("Xuất Excel"))
                    .on_disabled_hover_text("Chưa có API trả tệp danh mục ca.");
            },
        );
        if let Some(index) = toolbar.selected {
            self.category_filter = if index == 0 {
                "Tất cả".into()
            } else {
                tabs[index].into()
            };
            self.page = 0;
        }
        if toolbar.search_changed {
            self.page = 0;
        }
        if toolbar.create_clicked && !busy && self.data_loaded && !self.shifts_revision.is_empty() {
            self.clear_form();
            self.create_open = true;
        }
        ui.add_space(12.0);
        if !self.notice.is_empty() {
            ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::DARK_RED, &self.error);
        }
        if self.data_loaded && self.shifts_revision.is_empty() {
            ui.colored_label(
                Color32::from_rgb(180, 83, 9),
                "Máy chủ chưa trả phiên bản danh mục ca; thao tác ghi bị khóa để tránh ghi đè.",
            );
        }
        if busy {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải / lưu danh mục ca…");
            });
        }
        let query = self.search.trim().to_lowercase();
        let filtered = self
            .shifts
            .iter()
            .filter(|s| {
                (self.category_filter == "Tất cả" || s.shift_category == self.category_filter)
                    && (query.is_empty()
                        || [
                            &s.shift_code,
                            &s.shift_name,
                            &s.time_range,
                            &s.applicable_to,
                        ]
                        .iter()
                        .any(|v| v.to_lowercase().contains(&query)))
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
                title: "Mã & Tên ca làm việc",
                width: 230.0 + extra,
            },
            TableColumn {
                title: "Khung giờ làm việc",
                width: 170.0,
            },
            TableColumn {
                title: "Thời gian tính công",
                width: 170.0,
            },
            TableColumn {
                title: "Nghỉ giữa ca",
                width: 170.0,
            },
            TableColumn {
                title: "Đối tượng áp dụng",
                width: 180.0,
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
        if self.data_loaded {
            widgets::table_with_row_height(
                ui,
                "attendance.shifts.table",
                &columns,
                rows.len(),
                76.0,
                |ui, row, col| {
                    let shift = rows[row];
                    match col {
                        0 => {
                            ui.label(RichText::new(&shift.shift_name).size(13.5).strong());
                            ui.label(
                                RichText::new(format!(
                                    "Mã ca: {} · Nhóm: {}",
                                    shift.shift_code, shift.shift_category
                                ))
                                .size(11.5)
                                .color(crate::theme::PRIMARY),
                            );
                        }
                        1 => {
                            ui.label(
                                RichText::new(&shift.time_range)
                                    .strong()
                                    .color(Color32::from_rgb(37, 99, 235)),
                            );
                        }
                        2 => {
                            ui.label(format!(
                                "{} Giờ ({} Công)",
                                shift.working_hours, shift.work_units
                            ));
                            if shift.night_allowance_pct > 0.0 {
                                ui.label(
                                    RichText::new(format!(
                                        "+ {}% Phụ cấp ca đêm",
                                        shift.night_allowance_pct
                                    ))
                                    .size(11.0)
                                    .color(Color32::from_rgb(217, 119, 6)),
                                );
                            }
                        }
                        3 => {
                            ui.label(&shift.break_time);
                        }
                        4 => {
                            ui.add(egui::Label::new(&shift.applicable_to).truncate())
                                .on_hover_text(&shift.applicable_to);
                        }
                        5 => widgets::tag(
                            ui,
                            &shift.status,
                            if shift.status == "Đang áp dụng" {
                                TagTone::Success
                            } else {
                                TagTone::Neutral
                            },
                        ),
                        _ => {
                            if ui.button("Chi tiết").clicked() {
                                self.selected = Some(shift.clone());
                                self.details_open = true;
                            }
                        }
                    }
                },
            );
            ui.add_space(10.0);
            widgets::pagination(
                ui,
                "attendance.shifts.pagination",
                &mut self.page,
                filtered.len(),
                &mut self.page_size,
            );
        }
        if ui
            .add_enabled(!busy, egui::Button::new("Làm mới"))
            .clicked()
        {
            self.needs_reload = true;
        }

        if self.create_open {
            let mut cancel = false;
            let mut submit = false;
            let (_, closed) = widgets::modal(
                ctx,
                "attendance.shifts.create",
                "Thiết Lập Ca Làm Việc & Quy Tắc Tính Công Mới",
                640.0,
                busy,
                |ui| {
                    ui.add_space(14.0);
                    let compact = ui.available_width() < 460.0;
                    if compact {
                        widgets::form_input(
                            ui,
                            "shift.code",
                            "Mã ca làm việc",
                            true,
                            &mut self.shift_code,
                            "",
                            false,
                        );
                        widgets::form_select(
                            ui,
                            "shift.category",
                            "Phân loại ca",
                            true,
                            &mut self.shift_category,
                            CATEGORIES,
                        );
                    } else {
                        ui.columns(2, |c| {
                            widgets::form_input(
                                &mut c[0],
                                "shift.code",
                                "Mã ca làm việc",
                                true,
                                &mut self.shift_code,
                                "",
                                false,
                            );
                            widgets::form_select(
                                &mut c[1],
                                "shift.category",
                                "Phân loại ca",
                                true,
                                &mut self.shift_category,
                                CATEGORIES,
                            );
                        });
                    }
                    widgets::form_input(
                        ui,
                        "shift.name",
                        "Tên ca làm việc",
                        true,
                        &mut self.shift_name,
                        "",
                        false,
                    );
                    if compact {
                        widgets::form_input(
                            ui,
                            "shift.time",
                            "Khung giờ (HH:mm - HH:mm)",
                            true,
                            &mut self.time_range,
                            "08:00 - 17:30",
                            false,
                        );
                        widgets::form_input(
                            ui,
                            "shift.hours",
                            "Số giờ làm việc",
                            true,
                            &mut self.working_hours,
                            "",
                            false,
                        );
                        widgets::form_input(
                            ui,
                            "shift.grace",
                            "Cho phép đi muộn (phút)",
                            false,
                            &mut self.grace_minutes,
                            "",
                            false,
                        );
                    } else {
                        ui.columns(3, |c| {
                            widgets::form_input(
                                &mut c[0],
                                "shift.time",
                                "Khung giờ (HH:mm - HH:mm)",
                                true,
                                &mut self.time_range,
                                "08:00 - 17:30",
                                false,
                            );
                            widgets::form_input(
                                &mut c[1],
                                "shift.hours",
                                "Số giờ làm việc",
                                true,
                                &mut self.working_hours,
                                "",
                                false,
                            );
                            widgets::form_input(
                                &mut c[2],
                                "shift.grace",
                                "Cho phép đi muộn (phút)",
                                false,
                                &mut self.grace_minutes,
                                "",
                                false,
                            );
                        });
                    }
                    if compact {
                        widgets::form_input(
                            ui,
                            "shift.break",
                            "Thời gian nghỉ giữa giờ",
                            true,
                            &mut self.break_time,
                            "",
                            false,
                        );
                        widgets::form_input(
                            ui,
                            "shift.allowance",
                            "Phụ cấp ca đêm (%)",
                            false,
                            &mut self.night_allowance_pct,
                            "",
                            false,
                        );
                    } else {
                        ui.columns(2, |c| {
                            widgets::form_input(
                                &mut c[0],
                                "shift.break",
                                "Thời gian nghỉ giữa giờ",
                                true,
                                &mut self.break_time,
                                "",
                                false,
                            );
                            widgets::form_input(
                                &mut c[1],
                                "shift.allowance",
                                "Phụ cấp ca đêm (%)",
                                false,
                                &mut self.night_allowance_pct,
                                "",
                                false,
                            );
                        });
                    }
                    widgets::form_input(
                        ui,
                        "shift.applies",
                        "Đối tượng phòng ban áp dụng",
                        true,
                        &mut self.applicable_to,
                        "",
                        false,
                    );
                    if !self.error.is_empty() {
                        ui.colored_label(Color32::DARK_RED, &self.error);
                    }
                    ui.add_space(18.0);
                    widgets::action_row(ui, |ui| {
                        if ui
                            .add_enabled(
                                self.data_loaded && !self.shifts_revision.is_empty(),
                                egui::Button::new("Lưu ca làm việc"),
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
                match self.build_shift() {
                    Ok(shift) => {
                        self.notice.clear();
                        self.error.clear();
                        let mut next = self.shifts.clone();
                        next.insert(0, shift);
                        self.pending_save = Some(api.replace_attendance_shifts_task(
                            session,
                            &next,
                            &self.shifts_revision,
                        ));
                    }
                    Err(error) => self.error = error,
                }
            }
        }
        if self.details_open {
            if let Some(shift) = self.selected.as_ref() {
                let (_, closed) = widgets::drawer(
                    ctx,
                    "attendance.shifts.details",
                    "Thông Số Ca & Chính Sách Chấm Công Chi Tiết",
                    560.0,
                    |ui| {
                        egui::Frame::none()
                            .fill(Color32::from_rgb(248, 250, 252))
                            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                            .rounding(8.0)
                            .inner_margin(16.0)
                            .show(ui, |ui| {
                                ui.set_width(ui.available_width());
                                ui.label(
                                    RichText::new(&shift.shift_code)
                                        .strong()
                                        .color(crate::theme::PRIMARY),
                                );
                                ui.label(RichText::new(&shift.shift_name).size(17.0).strong());
                                widgets::tag(
                                    ui,
                                    &shift.status,
                                    if shift.status == "Đang áp dụng" {
                                        TagTone::Success
                                    } else {
                                        TagTone::Neutral
                                    },
                                );
                                ui.label(format!("Nhóm ca: {}", shift.shift_category));
                            });
                        ui.add_space(16.0);
                        ui.strong("Thông Số Chấm Công & Quy Đổi Ngày Công");
                        ui.add_space(10.0);
                        for (label, value) in [
                            ("Khung giờ bắt đầu - kết thúc", shift.time_range.clone()),
                            (
                                "Tổng giờ làm việc thực tế",
                                format!("{} Giờ / Ca", shift.working_hours),
                            ),
                            (
                                "Hệ số ngày công quy đổi",
                                format!("{} Công", shift.work_units),
                            ),
                            ("Thời gian nghỉ giữa ca", shift.break_time.clone()),
                            (
                                "Dung sai cho phép đi muộn",
                                format!("{} phút", shift.allow_grace_minutes),
                            ),
                            (
                                "Phụ cấp làm thêm ca đêm",
                                format!("{}%", shift.night_allowance_pct),
                            ),
                            ("Đối tượng áp dụng", shift.applicable_to.clone()),
                        ] {
                            ui.horizontal_wrapped(|ui| {
                                ui.label(label);
                                ui.strong(value);
                            });
                            ui.add_space(8.0);
                        }
                        ui.add_enabled(
                            false,
                            egui::Button::new("Đồng Bộ Chính Sách Xuống Máy Chấm Công"),
                        )
                        .on_disabled_hover_text("Chưa có API đồng bộ chính sách thiết bị.");
                        if !shift.extra.is_empty() {
                            ui.collapsing("Trường bổ sung từ máy chủ", |ui| {
                                ui.label(
                                    serde_json::to_string_pretty(&shift.extra).unwrap_or_default(),
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

    fn build_shift(&self) -> Result<AttendanceShift, String> {
        let required = [
            ("Mã ca", self.shift_code.trim()),
            ("Tên ca", self.shift_name.trim()),
            ("Khung giờ", self.time_range.trim()),
            ("Nghỉ giữa ca", self.break_time.trim()),
            ("Đối tượng áp dụng", self.applicable_to.trim()),
        ];
        if let Some((label, _)) = required.iter().find(|(_, value)| value.is_empty()) {
            return Err(format!("Vui lòng nhập {label}."));
        }
        let (start_time, end_time) = self
            .time_range
            .split_once('-')
            .ok_or_else(|| "Khung giờ phải có dạng HH:MM - HH:MM.".to_owned())?;
        let start_time = start_time.trim();
        let end_time = end_time.trim();
        let working_hours = self
            .working_hours
            .trim()
            .parse::<f64>()
            .map_err(|_| "Số giờ làm việc không hợp lệ.".to_owned())?;
        let grace = self
            .grace_minutes
            .trim()
            .parse::<u32>()
            .map_err(|_| "Dung sai đi muộn phải là số nguyên.".to_owned())?;
        let grace = if grace == 0 { 15 } else { grace };
        let night_allowance_pct = self
            .night_allowance_pct
            .trim()
            .parse::<f64>()
            .map_err(|_| "Phụ cấp ca đêm không hợp lệ.".to_owned())?;
        if !(1.0..=12.0).contains(&working_hours)
            || (working_hours * 2.0 - (working_hours * 2.0).round()).abs() > f64::EPSILON
        {
            return Err("Số giờ làm việc phải từ 1 đến 12, theo bước 0,5 giờ.".to_owned());
        }
        if grace > 60 {
            return Err("Dung sai đi muộn phải từ 0 đến 60 phút.".to_owned());
        }
        if !(0.0..=100.0).contains(&night_allowance_pct) {
            return Err("Phụ cấp ca đêm phải từ 0 đến 100%.".to_owned());
        }
        let work_units = if working_hours >= 8.0 {
            if night_allowance_pct > 0.0 { 1.3 } else { 1.0 }
        } else {
            0.5
        };
        Ok(AttendanceShift {
            key: chrono::Utc::now().timestamp_millis().to_string(),
            shift_code: self.shift_code.trim().to_owned(),
            shift_name: self.shift_name.trim().to_owned(),
            time_range: format!("{} - {}", start_time, end_time),
            start_time: start_time.to_owned(),
            end_time: end_time.to_owned(),
            working_hours,
            work_units,
            break_time: self.break_time.trim().to_owned(),
            applicable_to: self.applicable_to.trim().to_owned(),
            allow_grace_minutes: grace,
            night_allowance_pct,
            shift_category: self.shift_category.clone(),
            status: "Đang áp dụng".to_owned(),
            extra: Default::default(),
        })
    }
}

fn metric(ui: &mut Ui, label: &str, value: usize, color: Color32) {
    egui::Frame::group(ui.style()).show(ui, |ui| {
        ui.set_min_width(180.0);
        ui.label(RichText::new(label).size(12.0).color(Color32::GRAY));
        ui.label(
            RichText::new(value.to_string())
                .size(22.0)
                .strong()
                .color(color),
        );
    });
}

fn detail(ui: &mut Ui, label: &str, value: &str) {
    ui.label(RichText::new(label).strong());
    ui.label(value);
    ui.end_row();
}
