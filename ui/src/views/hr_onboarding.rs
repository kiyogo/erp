use std::time::Duration;

use chrono::{NaiveDate, Utc};
use egui::{Color32, Context, RichText, Ui};
use serde_json::Value;

use crate::{
    api::{
        ApiClient, ApiTask, CreateHrOnboardingInput, HrOnboardingListResponse, HrOnboardingRecord,
        HrOnboardingResponse,
    },
    models::Session,
    widgets::{self, Metric, TableColumn, TagTone},
};

const PAGE_SIZE: usize = 8;

#[derive(Default)]
pub struct HrOnboardingView {
    rows: Vec<HrOnboardingRecord>,
    list_task: Option<ApiTask<HrOnboardingListResponse>>,
    create_task: Option<ApiTask<HrOnboardingResponse>>,
    loaded_for: Option<String>,
    loading: bool,
    needs_reload: bool,
    form_open: bool,
    form: OnboardingForm,
    search: String,
    status_filter: String,
    selected_key: Option<String>,
    page: usize,
    page_size: usize,
    error: String,
    form_error: String,
    notice: String,
}

#[derive(Clone)]
struct OnboardingForm {
    employee_code: String,
    mentor_code: String,
    start_date: String,
}

impl Default for OnboardingForm {
    fn default() -> Self {
        Self {
            employee_code: String::new(),
            mentor_code: String::new(),
            start_date: Utc::now().format("%Y-%m-%d").to_string(),
        }
    }
}

impl HrOnboardingView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn reset_for_account(&mut self, session: &Session) {
        *self = Self {
            loaded_for: Some(session.user.id.clone()),
            needs_reload: true,
            ..Self::default()
        };
    }

    fn poll(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.reset_for_account(session);
        }
        if self.needs_reload && self.list_task.is_none() && self.create_task.is_none() {
            self.loading = true;
            self.error.clear();
            self.list_task = Some(api.list_hr_onboarding_task(session));
            self.needs_reload = false;
        }
        if let Some(result) = self.list_task.as_ref().and_then(ApiClient::poll) {
            self.list_task = None;
            self.loading = false;
            match result {
                Ok(response) => self.rows = response.data,
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.create_task.as_ref().and_then(ApiClient::poll) {
            self.create_task = None;
            match result {
                Ok(response) => {
                    self.notice = format!(
                        "Đã tạo hồ sơ onboarding cho {}.",
                        response.record.employee_name
                    );
                    self.form_open = false;
                    self.form = OnboardingForm::default();
                    self.form_error.clear();
                    self.needs_reload = true;
                }
                Err(error) => self.form_error = error,
            }
        }
        if self.list_task.is_some() || self.create_task.is_some() {
            ui.ctx().request_repaint_after(Duration::from_millis(80));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &Context, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Chỉ quản trị viên Nhân sự mới được quản lý lộ trình hội nhập.");
            return;
        }
        self.poll(ui, session, api);
        if self.page_size == 0 {
            self.page_size = PAGE_SIZE;
        }
        egui::Frame::none()
            .inner_margin(egui::Margin::symmetric(10.0, 16.0))
            .show(ui, |ui| {
                let known = !self.rows.is_empty() || (!self.loading && self.error.is_empty());
                let ongoing = self
                    .rows
                    .iter()
                    .filter(|row| row.status == "Đang hội nhập")
                    .count();
                let completed = self
                    .rows
                    .iter()
                    .filter(|row| row.status == "Đã hoàn thành")
                    .count();
                widgets::metrics(
                    ui,
                    "hr.onboarding.metrics",
                    &[
                        Metric {
                            label: "Nhân sự mới tiếp nhận Onboarding",
                            value: if known {
                                format!("{} Nhân sự", self.rows.len())
                            } else {
                                "—".into()
                            },
                            detail: "Hồ sơ liên kết với danh bạ HR",
                            color: crate::theme::PRIMARY,
                            value_size: 24.0,
                        },
                        Metric {
                            label: "Đang trong lộ trình thử việc",
                            value: if known {
                                format!("{ongoing} Nhân viên mới")
                            } else {
                                "—".into()
                            },
                            detail: "Trạng thái đang hội nhập đã lưu",
                            color: Color32::from_rgb(37, 99, 235),
                            value_size: 24.0,
                        },
                        Metric {
                            label: "Đã hoàn tất trong dữ liệu",
                            value: if known {
                                format!("{completed} Nhân sự")
                            } else {
                                "—".into()
                            },
                            detail: "Chưa xác nhận ký hợp đồng chính thức",
                            color: Color32::from_rgb(22, 163, 74),
                            value_size: 24.0,
                        },
                        Metric {
                            label: "Tỷ lệ vượt qua thử việc chung",
                            value: "Chưa xác định".into(),
                            detail: "Chưa có dữ liệu nghiệm thu thử việc",
                            color: Color32::from_rgb(124, 58, 237),
                            value_size: 24.0,
                        },
                    ],
                );
                ui.add_space(16.0);
                ui.horizontal_wrapped(|ui| {
                    ui.spacing_mut().item_spacing = egui::vec2(6.0, 10.0);
                    for (filter, label) in [
                        ("", "Tất cả tân tuyển"),
                        ("Đang hội nhập", "Đang hội nhập"),
                        ("Đã hoàn thành", "Đã hoàn thành"),
                        ("Cần hỗ trợ", "Cần hỗ trợ"),
                    ] {
                        let active = self.status_filter == filter;
                        if ui
                            .add(
                                egui::Button::new(RichText::new(label).size(13.0).color(
                                    if active {
                                        crate::theme::PRIMARY_ACTIVE
                                    } else {
                                        Color32::from_rgb(71, 85, 105)
                                    },
                                ))
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
                                ))
                                .min_size(egui::vec2(0.0, 28.0)),
                            )
                            .clicked()
                        {
                            self.status_filter = filter.to_owned();
                            self.page = 0;
                        }
                    }
                    let (search, _) = ui.allocate_exact_size(
                        egui::vec2(280.0_f32.min(ui.available_width().max(120.0)), 32.0),
                        egui::Sense::hover(),
                    );
                    if widgets::search_input(
                        ui,
                        search,
                        &mut self.search,
                        "Tìm theo tên, phòng ban, Mentor...",
                    )
                    .changed()
                    {
                        self.page = 0;
                    }
                    ui.add_enabled(false, egui::Button::new("Xuất Báo Cáo"))
                        .on_disabled_hover_text("Chưa có API xuất báo cáo Onboarding.");
                    if ui
                        .add_enabled(!self.loading, egui::Button::new("Làm mới"))
                        .clicked()
                    {
                        self.needs_reload = true;
                    }
                    if ui
                        .add_enabled(
                            self.create_task.is_none(),
                            egui::Button::new(
                                RichText::new("+ Tiếp nhận nhân sự mới").color(Color32::WHITE),
                            )
                            .fill(crate::theme::PRIMARY),
                        )
                        .clicked()
                    {
                        self.form = OnboardingForm::default();
                        self.form_error.clear();
                        self.selected_key = None;
                        self.form_open = true;
                    }
                });
                ui.add_space(12.0);
                if !self.notice.is_empty() {
                    ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
                }
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                }
                if self.loading {
                    ui.horizontal(|ui| {
                        ui.spinner();
                        ui.label("Đang tải hồ sơ onboarding từ máy chủ...");
                    });
                }
                let needle = self.search.trim().to_lowercase();
                let visible = self
                    .rows
                    .iter()
                    .filter(|record| {
                        (needle.is_empty()
                            || [
                                &record.employee_name,
                                &record.emp_code,
                                &record.department,
                                &record.position,
                                &record.mentor,
                            ]
                            .iter()
                            .any(|value| value.to_lowercase().contains(&needle)))
                            && (self.status_filter.is_empty()
                                || record.status == self.status_filter)
                    })
                    .collect::<Vec<_>>();
                self.page = self
                    .page
                    .min(visible.len().div_ceil(self.page_size).saturating_sub(1));
                let rows = visible
                    .iter()
                    .skip(self.page * self.page_size)
                    .take(self.page_size)
                    .collect::<Vec<_>>();
                let columns = [
                    TableColumn {
                        title: "Nhân sự mới & Vị trí",
                        width: (ui.available_width() - 830.0).max(260.0),
                    },
                    TableColumn {
                        title: "Khối phòng ban & Mentor",
                        width: 220.0,
                    },
                    TableColumn {
                        title: "Tiến độ hội nhập 60 ngày",
                        width: 190.0,
                    },
                    TableColumn {
                        title: "Thời gian thử việc",
                        width: 170.0,
                    },
                    TableColumn {
                        title: "Trạng thái",
                        width: 130.0,
                    },
                    TableColumn {
                        title: "Thao tác",
                        width: 120.0,
                    },
                ];
                widgets::table(
                    ui,
                    "hr.onboarding.table",
                    &columns,
                    rows.len(),
                    |ui, index, col| {
                        let row = rows[index];
                        match col {
                            0 => {
                                cell_text(
                                    ui,
                                    &row.employee_name,
                                    true,
                                    Color32::from_rgb(15, 23, 42),
                                );
                                cell_text(
                                    ui,
                                    format!("Mã: {} · {}", row.emp_code, row.position),
                                    false,
                                    crate::theme::PRIMARY,
                                );
                            }
                            1 => {
                                cell_text(ui, &row.mentor, true, Color32::from_rgb(37, 99, 235));
                                cell_text(
                                    ui,
                                    &row.department,
                                    false,
                                    Color32::from_rgb(100, 116, 139),
                                );
                            }
                            2 => {
                                if let Some(progress) = verified_progress(row) {
                                    cell_text(
                                        ui,
                                        format!("Checklist hoàn tất: {progress}%"),
                                        false,
                                        crate::theme::PRIMARY,
                                    );
                                    ui.add(
                                        egui::ProgressBar::new(progress as f32 / 100.0)
                                            .desired_height(6.0)
                                            .fill(crate::theme::PRIMARY),
                                    );
                                } else {
                                    cell_text(
                                        ui,
                                        "Checklist: chưa xác định",
                                        false,
                                        Color32::from_rgb(100, 116, 139),
                                    );
                                    cell_text(
                                        ui,
                                        "Chưa có trạng thái được xác minh",
                                        false,
                                        Color32::from_rgb(100, 116, 139),
                                    );
                                }
                            }
                            3 => {
                                cell_text(
                                    ui,
                                    format!("Bắt đầu: {}", row.start_date),
                                    false,
                                    Color32::from_rgb(15, 23, 42),
                                );
                                cell_text(
                                    ui,
                                    format!("Đánh giá: {}", row.evaluation_date),
                                    false,
                                    Color32::from_rgb(100, 116, 139),
                                );
                            }
                            4 => widgets::tag(
                                ui,
                                present(&row.status),
                                match row.status.as_str() {
                                    "Đang hội nhập" => TagTone::Processing,
                                    "Đã hoàn thành" => TagTone::Success,
                                    "Cần hỗ trợ" => TagTone::Error,
                                    _ => TagTone::Neutral,
                                },
                            ),
                            _ => {
                                if ui.button("Checklist").clicked() {
                                    self.selected_key = Some(row.key.clone());
                                }
                            }
                        }
                    },
                );
                ui.add_space(8.0);
                widgets::pagination(
                    ui,
                    "hr.onboarding.pagination",
                    &mut self.page,
                    visible.len(),
                    &mut self.page_size,
                );
            });
        if let Some(record) = self
            .rows
            .iter()
            .find(|row| self.selected_key.as_deref() == Some(row.key.as_str()))
        {
            let (_, close) = widgets::drawer(
                ctx,
                "hr.onboarding.detail",
                "Lộ Trình Hội Nhập 60 Ngày & Checklist Tân Tuyển",
                580.0,
                |ui| {
                    detail_card(ui, true, |ui| {
                        ui.colored_label(
                            crate::theme::PRIMARY,
                            RichText::new(&record.emp_code).strong(),
                        );
                        ui.label(RichText::new(&record.employee_name).size(17.0).strong());
                        ui.label(format!(
                            "Vị trí: {} · {}",
                            record.position, record.department
                        ));
                        ui.label(format!("Trạng thái: {}", present(&record.status)));
                    });
                    ui.add_space(16.0);
                    detail_card(ui, false, |ui| {
                        ui.strong("Thông Tin Kèm Cặp & Thời Hạn:");
                        ui.label(format!(
                            "Người hướng dẫn (Mentor): {} ({})",
                            record.mentor,
                            present(&record.mentor_phone)
                        ));
                        ui.label(format!("Mã mentor: {}", present(&record.mentor_id)));
                        ui.label(format!(
                            "Thời gian dự kiến: {} → {}",
                            record.start_date, record.evaluation_date
                        ));
                        ui.label(format!(
                            "Giai đoạn đã khai báo: {}",
                            present(&record.current_step)
                        ));
                        ui.label(format!(
                            "Tiến độ được xác minh: {}",
                            verified_progress(record)
                                .map(|value| format!("{value}%"))
                                .unwrap_or_else(|| "Chưa xác định".into())
                        ));
                    });
                    ui.add_space(16.0);
                    detail_card(ui, false, |ui| {
                        ui.strong("Checklist 5 Giai Đoạn Onboarding:");
                        for (index, step) in [
                            "Trang bị thiết bị & Tài khoản",
                            "Đào tạo văn hóa & Quy định công ty",
                            "Training chuyên môn 1:1 cùng Mentor",
                            "Thực thi Task thực tế & Đánh giá giữa kỳ",
                            "Báo cáo thử việc & Quyết định hợp đồng",
                        ]
                        .iter()
                        .enumerate()
                        {
                            ui.label(RichText::new(format!("{}. {step}", index + 1)).strong());
                            ui.label(
                                RichText::new("Chưa có trạng thái từng giai đoạn được xác minh")
                                    .size(11.5)
                                    .color(Color32::from_rgb(100, 116, 139)),
                            );
                        }
                        ui.label("Không suy ra hoàn tất giai đoạn từ phần trăm tiến độ hoặc trạng thái hồ sơ.");
                    });
                    ui.add_space(16.0);
                    detail_card(ui, false, |ui| {
                        ui.strong("Thiết bị, tài khoản & Hợp đồng:");
                        let verified = record
                            .extra
                            .get("checklistStateAvailable")
                            .and_then(Value::as_bool)
                            == Some(true);
                        for (label, value) in [
                            ("Laptop", record.laptop_provided),
                            ("Email", record.email_created),
                            ("Hợp đồng", record.contract_signed),
                        ] {
                            let state = if verified {
                                match value {
                                    Some(true) => "Đã ghi nhận",
                                    Some(false) => "Chưa hoàn tất",
                                    None => "Chưa xác định",
                                }
                            } else {
                                "Chưa xác định"
                            };
                            ui.label(format!("{label}: {state}"));
                        }
                        if !verified {
                            ui.colored_label(
                                Color32::from_rgb(146, 64, 14),
                                "Dữ liệu legacy chưa có trạng thái checklist được xác minh.",
                            );
                        }
                        if !record.extra.is_empty() {
                            ui.collapsing("Dữ liệu bổ sung từ máy chủ", |ui| {
                                for (key, value) in &record.extra {
                                    ui.label(format!("{key}: {value}"));
                                }
                            });
                        }
                    });
                    ui.add_space(16.0);
                    ui.add_enabled(false, egui::Button::new("Nghiệm Thu Thử Việc & Ký HĐLĐ"))
                        .on_disabled_hover_text(
                            "Chưa có API nghiệm thu checklist hoặc ký hợp đồng.",
                        );
                    ui.label("Chưa có API nghiệm thu checklist hoặc ký hợp đồng chính thức.");
                },
            );
            if close {
                self.selected_key = None;
            }
        }
        if self.form_open {
            self.render_form(ctx, session, api);
        }
    }

    fn render_form(&mut self, ctx: &Context, session: &Session, api: &ApiClient) {
        let busy = self.create_task.is_some();
        let (_, close) = widgets::modal(
            ctx,
            "hr.onboarding.form",
            "Tiếp Nhận Nhân Sự Mới & Khởi Tạo Lộ Trình Onboarding",
            640.0,
            busy,
            |ui| {
                ui.add_space(14.0);
                let columns = widgets::grid_columns(ui.available_width(), 220.0, 12.0, 2);
                ui.columns(columns, |cols| {
                    widgets::form_input(
                        &mut cols[0],
                        "onboarding.employee",
                        "Mã nhân viên mới",
                        true,
                        &mut self.form.employee_code,
                        "",
                        false,
                    );
                    widgets::form_input(
                        &mut cols[1 % columns],
                        "onboarding.mentor",
                        "Mã người hướng dẫn (Mentor / Buddy)",
                        true,
                        &mut self.form.mentor_code,
                        "",
                        false,
                    );
                });
                widgets::form_date(
                    ui,
                    "onboarding.start",
                    "Ngày bắt đầu đi làm",
                    true,
                    &mut self.form.start_date,
                );
                ui.label(
                    "Tên, chức danh, phòng ban và thông tin mentor được máy chủ tra từ danh bạ HR.",
                );
                ui.label(
                    "Ngày đánh giá dự kiến được tính sau 60 ngày. Chưa xác nhận hoàn tất thử việc.",
                );
                if !self.form_error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
                }
                if busy {
                    ui.spinner();
                }
                ui.add_space(18.0);
                widgets::action_row(ui, |ui| {
                    if ui
                        .button(
                            RichText::new("Khởi tạo lộ trình Onboarding")
                                .color(crate::theme::PRIMARY),
                        )
                        .clicked()
                    {
                        match self.form.to_input() {
                            Ok(input) => {
                                self.create_task =
                                    Some(api.create_hr_onboarding_task(session, &input));
                                self.form_error.clear();
                            }
                            Err(error) => self.form_error = error,
                        }
                    }
                    if ui.button("Hủy").clicked() {
                        self.form_open = false;
                    }
                });
            },
        );
        if close {
            self.form_open = false;
        }
    }
}

impl OnboardingForm {
    fn to_input(&self) -> Result<CreateHrOnboardingInput, String> {
        if self.employee_code.trim().is_empty() {
            return Err("Mã nhân viên là bắt buộc.".to_owned());
        }
        if self.mentor_code.trim().is_empty() {
            return Err("Mã mentor là bắt buộc.".to_owned());
        }
        if self
            .employee_code
            .trim()
            .eq_ignore_ascii_case(self.mentor_code.trim())
        {
            return Err("Nhân viên không thể tự làm mentor.".to_owned());
        }
        if NaiveDate::parse_from_str(self.start_date.trim(), "%Y-%m-%d").is_err() {
            return Err("Ngày bắt đầu cần theo định dạng YYYY-MM-DD hợp lệ.".to_owned());
        }
        Ok(CreateHrOnboardingInput {
            employee_code: self.employee_code.trim().to_owned(),
            mentor_code: self.mentor_code.trim().to_owned(),
            start_date: self.start_date.trim().to_owned(),
        })
    }
}

fn verified_progress(record: &HrOnboardingRecord) -> Option<i64> {
    (record
        .extra
        .get("checklistStateAvailable")
        .and_then(Value::as_bool)
        == Some(true))
    .then_some(record.progress)
    .flatten()
    .filter(|value| (0..=100).contains(value))
}

fn present(value: &str) -> &str {
    if value.trim().is_empty() {
        "Chưa có"
    } else {
        value
    }
}

fn cell_text(ui: &mut Ui, text: impl Into<String>, strong: bool, color: Color32) {
    let text = text.into();
    let rich = RichText::new(&text)
        .size(if strong { 13.5 } else { 11.5 })
        .color(color);
    ui.add(egui::Label::new(if strong { rich.strong() } else { rich }).truncate())
        .on_hover_text(text);
}

fn detail_card(ui: &mut Ui, summary: bool, contents: impl FnOnce(&mut Ui)) {
    egui::Frame::none()
        .fill(if summary {
            Color32::from_rgb(248, 250, 252)
        } else {
            Color32::WHITE
        })
        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
        .rounding(8.0)
        .inner_margin(if summary { 16.0 } else { 14.0 })
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.spacing_mut().item_spacing = egui::vec2(8.0, 6.0);
            contents(ui);
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_page_contains_long_rows_and_controls_at_desktop_and_mobile_widths() {
        let session: Session = serde_json::from_value(serde_json::json!({
            "token": "", "session_id": "layout-fixture",
            "user": { "id": "layout-fixture", "email": "layout@example.invalid", "name": "Layout", "role": "ADMIN" },
            "endpoint": "http://127.0.0.1:9", "mode": "local_admin"
        })).unwrap();
        let long = "Nội dung dài cần giữ đầy đủ trong phần chi tiết ".repeat(12);
        for width in [1440.0, 768.0, 390.0] {
            let ctx = Context::default();
            crate::native_text::setup_fonts(&ctx);
            crate::native_text::setup_style(&ctx);
            for state in 0..6 {
                let mut view = HrOnboardingView {
                    loaded_for: Some(session.user.id.clone()),
                    page: 99,
                    ..Default::default()
                };
                if (1..=3).contains(&state) {
                    view.rows.push(HrOnboardingRecord {
                        key: "layout-row".into(),
                        employee_name: long.clone(),
                        emp_code: "EMP-1".into(),
                        department: long.clone(),
                        position: long.clone(),
                        mentor: long.clone(),
                        status: "Trạng thái ngoài danh mục".into(),
                        ..Default::default()
                    });
                }
                if state == 2 {
                    view.selected_key = Some("layout-row".into());
                }
                if state == 3 {
                    view.form_open = true;
                    view.form = valid_form();
                }
                view.loading = state == 4;
                if state == 5 {
                    view.error = "Máy chủ chưa sẵn sàng".into();
                }
                for _ in 0..3 {
                    let _ = ctx.run(egui::RawInput {
                        screen_rect: Some(egui::Rect::from_min_size(egui::Pos2::ZERO,egui::vec2(width,900.0))),
                        ..Default::default()
                    }, |ctx| {
                        egui::CentralPanel::default().show(ctx, |ui| {
                            egui::ScrollArea::vertical().show(ui, |ui| {
                                let right = ui.max_rect().right();
                                view.render(ui,ctx,&session,&ApiClient);
                                assert!(ui.min_rect().right() <= right + 1.0, "page overflow at width {width}, state {state}: {:?}, limit {right}",ui.min_rect());
                            });
                        });
                    });
                }
                assert_eq!(view.page, 0);
                assert!(
                    view.list_task.is_none(),
                    "layout tests must not call the API"
                );
                if state == 3 {
                    let (footer, clip) = ctx
                        .data(|data| {
                            data.get_temp::<(egui::Rect, egui::Rect)>(egui::Id::new(
                                "test.footer.bounds",
                            ))
                        })
                        .expect("form footer");
                    assert!(
                        footer.right() <= clip.right() + 1.0
                            && footer.bottom() <= clip.bottom() + 1.0,
                        "form footer clipped at {width}: {footer:?}, {clip:?}"
                    );
                }
            }
        }
    }

    #[test]
    fn progress_requires_server_checklist_evidence_and_a_valid_percentage() {
        let mut record = HrOnboardingRecord {
            progress: Some(100),
            ..Default::default()
        };
        assert_eq!(verified_progress(&record), None);
        record
            .extra
            .insert("checklistStateAvailable".into(), Value::Bool(true));
        assert_eq!(verified_progress(&record), Some(100));
        record.progress = Some(101);
        assert_eq!(verified_progress(&record), None);
        record.progress = None;
        assert_eq!(verified_progress(&record), None);
    }

    fn valid_form() -> OnboardingForm {
        OnboardingForm {
            employee_code: "EMP-NEW-1".to_owned(),
            mentor_code: "EMP-MENTOR-1".to_owned(),
            start_date: "2026-10-01".to_owned(),
        }
    }

    #[test]
    fn onboarding_form_sends_only_hr_reference_codes_and_date() {
        let input = valid_form().to_input().expect("valid onboarding input");
        let wire = serde_json::to_value(input).expect("onboarding wire JSON");
        assert_eq!(wire["employeeCode"], "EMP-NEW-1");
        assert_eq!(wire["mentorCode"], "EMP-MENTOR-1");
        assert_eq!(wire["startDate"], "2026-10-01");
        assert!(wire.get("employeeName").is_none());
        assert!(wire.get("mentorPhone").is_none());
        assert!(wire.get("progress").is_none());
    }

    #[test]
    fn onboarding_form_rejects_missing_or_same_employee_and_mentor() {
        let mut missing = valid_form();
        missing.employee_code.clear();
        assert!(missing.to_input().is_err());
        let mut same = valid_form();
        same.mentor_code = same.employee_code.clone();
        assert!(same.to_input().is_err());
        let mut bad_date = valid_form();
        bad_date.start_date = "2026-02-30".to_owned();
        assert!(bad_date.to_input().is_err());
    }

    #[test]
    fn onboarding_dto_accepts_legacy_rows_without_server_checklist_state() {
        let record: HrOnboardingRecord = serde_json::from_value(serde_json::json!({
            "key":"onboard-legacy","employeeName":"Employee","empCode":"EMP-001",
            "position":"Engineer","department":"IT","startDate":"2026-01-01",
            "evaluationDate":"2026-03-02","mentor":"Mentor","progress":15,
            "laptopProvided":true,"status":"Đang hội nhập","legacyField":"kept"
        }))
        .expect("legacy onboarding DTO");
        assert_eq!(record.progress, Some(15));
        assert_eq!(record.laptop_provided, Some(true));
        assert_eq!(record.extra["legacyField"], "kept");
        assert_eq!(record.employee_id, "");
    }
}
