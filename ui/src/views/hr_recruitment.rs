use std::time::Duration;

use chrono::{Duration as ChronoDuration, NaiveDate, Utc};
use egui::{Color32, Context, RichText, Ui};

use crate::{
    api::{
        ApiClient, ApiTask, CreateHrJobOpeningInput, HrJobOpening, HrJobOpeningResponse,
        HrJobOpeningsResponse,
    },
    models::Session,
    widgets::{self, Metric, TableColumn, TagTone},
};

const PAGE_SIZE: usize = 8;
const LEVELS: [&str; 5] = ["Fresher", "Junior", "Senior", "Lead", "Manager"];

#[derive(Default)]
pub struct HrRecruitmentView {
    rows: Vec<HrJobOpening>,
    list_task: Option<ApiTask<HrJobOpeningsResponse>>,
    create_task: Option<ApiTask<HrJobOpeningResponse>>,
    loaded_for: Option<String>,
    loading: bool,
    needs_reload: bool,
    form_open: bool,
    form: OpeningForm,
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
struct OpeningForm {
    job_code: String,
    title: String,
    department: String,
    level: String,
    headcount_needed: String,
    salary_range: String,
    deadline: String,
    recruiter: String,
    experience_req: String,
}

impl Default for OpeningForm {
    fn default() -> Self {
        Self {
            job_code: String::new(),
            title: String::new(),
            department: String::new(),
            level: "Senior".to_owned(),
            headcount_needed: "1".to_owned(),
            salary_range: String::new(),
            deadline: (Utc::now().date_naive() + ChronoDuration::days(30))
                .format("%Y-%m-%d")
                .to_string(),
            recruiter: String::new(),
            experience_req: String::new(),
        }
    }
}

impl HrRecruitmentView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn reset_for_account(&mut self, session: &Session) {
        *self = Self {
            loaded_for: Some(session.user.id.clone()),
            needs_reload: true,
            status_filter: "Tất cả".to_owned(),
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
            self.list_task = Some(api.list_hr_job_openings_task(session));
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
                    self.notice = format!("Đã tạo tin tuyển dụng {}.", response.opening.job_code);
                    self.form_open = false;
                    self.form = OpeningForm::default();
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
            ui.label("Chỉ quản trị viên Nhân sự mới được quản lý tin tuyển dụng.");
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
                let needed = self
                    .rows
                    .iter()
                    .filter(|row| row.status == "Đang tuyển dụng")
                    .map(|row| row.headcount_needed.max(0))
                    .sum::<i64>();
                widgets::metrics(
                    ui,
                    "hr.recruitment.metrics",
                    &[
                        Metric {
                            label: "Chỉ tiêu cần tuyển đang mở",
                            value: if known {
                                format!("{needed} Chỉ tiêu")
                            } else {
                                "—".into()
                            },
                            detail: "Chỉ tiêu trên các tin đang tuyển",
                            color: Color32::from_rgb(220, 38, 38),
                            value_size: 24.0,
                        },
                        Metric {
                            label: "Tổng lượng hồ sơ CV tiếp nhận",
                            value: "Chưa xác định".into(),
                            detail: "Chưa có API hồ sơ ứng viên",
                            color: Color32::from_rgb(37, 99, 235),
                            value_size: 24.0,
                        },
                        Metric {
                            label: "Nhân sự đã tuyển & Nhận việc",
                            value: "Chưa xác định".into(),
                            detail: "Chưa có dữ liệu nhận việc thực tế",
                            color: Color32::from_rgb(22, 163, 74),
                            value_size: 24.0,
                        },
                        Metric {
                            label: "Thời gian tuyển dụng trung bình (Time-to-Hire)",
                            value: "Chưa xác định".into(),
                            detail: "Chưa có dữ liệu thời điểm tuyển",
                            color: Color32::from_rgb(124, 58, 237),
                            value_size: 24.0,
                        },
                    ],
                );
                ui.add_space(16.0);
                ui.horizontal_wrapped(|ui| {
                    ui.spacing_mut().item_spacing = egui::vec2(6.0, 10.0);
                    for (filter, label) in [
                        ("Tất cả", "Tất cả vị trí"),
                        ("Đang tuyển dụng", "Đang tuyển"),
                        ("Đã đủ chỉ tiêu", "Đã đủ chỉ tiêu"),
                        ("Tạm dừng", "Tạm dừng"),
                        ("Khác", "Khác"),
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
                        "Tìm theo mã vị trí, chức danh, phòng ban...",
                    )
                    .changed()
                    {
                        self.page = 0;
                    }
                    ui.add_enabled(false, egui::Button::new("Xuất Báo Cáo"))
                        .on_disabled_hover_text("Chưa có API xuất báo cáo tuyển dụng.");
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
                                RichText::new("+ Đăng tin tuyển dụng").color(Color32::WHITE),
                            )
                            .fill(crate::theme::PRIMARY),
                        )
                        .clicked()
                    {
                        self.form = OpeningForm::default();
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
                        ui.label("Đang tải tin tuyển dụng từ máy chủ...");
                    });
                }
                let needle = self.search.trim().to_lowercase();
                let visible = self
                    .rows
                    .iter()
                    .filter(|opening| {
                        (needle.is_empty()
                            || [
                                &opening.job_code,
                                &opening.title,
                                &opening.department,
                                &opening.recruiter,
                                &opening.level,
                            ]
                            .iter()
                            .any(|value| value.to_lowercase().contains(&needle)))
                            && status_matches(&opening.status, &self.status_filter)
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
                        title: "Mã & Vị trí tuyển dụng",
                        width: (ui.available_width() - 780.0).max(280.0),
                    },
                    TableColumn {
                        title: "Tiến độ tuyển dụng",
                        width: 180.0,
                    },
                    TableColumn {
                        title: "Mức lương dự kiến",
                        width: 170.0,
                    },
                    TableColumn {
                        title: "Hạn nộp & HR phụ trách",
                        width: 180.0,
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
                    "hr.recruitment.table",
                    &columns,
                    rows.len(),
                    |ui, index, col| {
                        let row = rows[index];
                        match col {
                            0 => {
                                cell_text(ui, &row.title, true, Color32::from_rgb(15, 23, 42));
                                cell_text(
                                    ui,
                                    format!(
                                        "Mã: {} · Cấp bậc: {} · {}",
                                        row.job_code, row.level, row.department
                                    ),
                                    false,
                                    crate::theme::PRIMARY,
                                );
                            }
                            1 => {
                                cell_text(
                                    ui,
                                    format!("Chỉ tiêu: {}", row.headcount_needed),
                                    true,
                                    Color32::from_rgb(15, 23, 42),
                                );
                                cell_text(
                                    ui,
                                    "CV / Phỏng vấn / Đã tuyển: chưa xác định",
                                    false,
                                    Color32::from_rgb(100, 116, 139),
                                );
                            }
                            2 => cell_text(
                                ui,
                                present(&row.salary_range),
                                true,
                                Color32::from_rgb(22, 163, 74),
                            ),
                            3 => {
                                cell_text(
                                    ui,
                                    present(&row.deadline),
                                    true,
                                    Color32::from_rgb(15, 23, 42),
                                );
                                cell_text(
                                    ui,
                                    format!("HR: {}", present(&row.recruiter)),
                                    false,
                                    crate::theme::PRIMARY,
                                );
                            }
                            4 => {
                                let tone = match row.status.as_str() {
                                    "Đang tuyển dụng" => TagTone::Success,
                                    "Tạm dừng" => TagTone::Warning,
                                    status
                                        if status.contains("Đã đủ")
                                            || status.contains("Đã đóng") =>
                                    {
                                        TagTone::Processing
                                    }
                                    _ => TagTone::Neutral,
                                };
                                widgets::tag(ui, present(&row.status), tone);
                            }
                            _ => {
                                if ui.button("Phễu CV").clicked() {
                                    self.selected_key = Some(row.key.clone());
                                }
                            }
                        }
                    },
                );
                ui.add_space(8.0);
                widgets::pagination(
                    ui,
                    "hr.recruitment.pagination",
                    &mut self.page,
                    visible.len(),
                    &mut self.page_size,
                );
            });
        if let Some(opening) = self
            .rows
            .iter()
            .find(|row| self.selected_key.as_deref() == Some(row.key.as_str()))
        {
            let (_, close) = widgets::drawer(
                ctx,
                "hr.recruitment.detail",
                "Phễu Ứng Viên & Tiến Độ Tuyển Dụng (Recruitment Pipeline)",
                620.0,
                |ui| {
                    detail_card(ui, true, |ui| {
                        ui.colored_label(
                            crate::theme::PRIMARY,
                            RichText::new(&opening.job_code).strong(),
                        );
                        ui.label(RichText::new(&opening.title).size(17.0).strong());
                        ui.label(format!(
                            "Phòng ban: {} · Cấp bậc: {}",
                            opening.department, opening.level
                        ));
                        ui.label(format!("Trạng thái: {}", present(&opening.status)));
                    });
                    ui.add_space(16.0);
                    detail_card(ui, false, |ui| {
                        ui.strong("Phễu Chuyển Đổi Tuyển Dụng (Funnel Metrics):");
                        ui.add_space(12.0);
                        widgets::metrics_grid(
                            ui,
                            "hr.recruitment.funnel",
                            &[
                                Metric {
                                    label: "1. CV Nộp",
                                    value: "—".into(),
                                    detail: "Chưa có API",
                                    color: Color32::from_rgb(37, 99, 235),
                                    value_size: 18.0,
                                },
                                Metric {
                                    label: "2. Phỏng vấn",
                                    value: "—".into(),
                                    detail: "Chưa có API",
                                    color: Color32::from_rgb(147, 51, 234),
                                    value_size: 18.0,
                                },
                                Metric {
                                    label: "3. Gửi Offer",
                                    value: "—".into(),
                                    detail: "Chưa có API",
                                    color: Color32::from_rgb(217, 119, 6),
                                    value_size: 18.0,
                                },
                                Metric {
                                    label: "4. Mục tiêu",
                                    value: opening.headcount_needed.to_string(),
                                    detail: "Chỉ tiêu trên tin",
                                    color: Color32::from_rgb(22, 163, 74),
                                    value_size: 18.0,
                                },
                            ],
                            egui::vec2(6.0, 10.0),
                            100.0,
                            2.0,
                        );
                    });
                    ui.add_space(16.0);
                    detail_card(ui, false, |ui| {
                        ui.strong("Yêu Cầu & Chế Độ Đãi Ngộ:");
                        ui.label(format!("Mức lương: {}", present(&opening.salary_range)));
                        ui.label(format!("Yêu cầu: {}", present(&opening.experience_req)));
                        ui.label(format!("Hạn chót: {}", present(&opening.deadline)));
                        ui.label(format!("HR phụ trách: {}", present(&opening.recruiter)));
                        ui.label(format!(
                            "Người tạo: {} · {}",
                            present(&opening.created_by),
                            present(&opening.created_at)
                        ));
                    });
                    ui.add_space(16.0);
                    ui.horizontal_wrapped(|ui| {
                        ui.add_enabled(false, egui::Button::new("Copy Link Đăng Tuyển"))
                            .on_disabled_hover_text("Máy chủ chưa cung cấp liên kết JD công khai.");
                        ui.add_enabled(false, egui::Button::new("Xem Hồ Sơ Ứng Viên"))
                            .on_disabled_hover_text("Chưa có API hồ sơ ứng viên.");
                    });
                    ui.label("Chưa có dữ liệu ứng viên, phỏng vấn, offer và luồng chuyển trạng thái tin.");
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
            "hr.recruitment.form",
            "Đăng Tin Tuyển Dụng Vị Trí Mới (Job Description)",
            640.0,
            busy,
            |ui| {
                ui.add_space(14.0);
                let columns = widgets::grid_columns(ui.available_width(), 165.0, 12.0, 3);
                ui.columns(columns, |cols| {
                    widgets::form_input(
                        &mut cols[0],
                        "recruitment.code",
                        "Mã vị trí",
                        true,
                        &mut self.form.job_code,
                        "",
                        false,
                    );
                    widgets::form_input(
                        &mut cols[1 % columns],
                        "recruitment.department",
                        "Phòng ban tiếp nhận",
                        true,
                        &mut self.form.department,
                        "",
                        false,
                    );
                    widgets::form_select(
                        &mut cols[2 % columns],
                        "recruitment.level",
                        "Cấp bậc vị trí",
                        false,
                        &mut self.form.level,
                        &LEVELS,
                    );
                });
                widgets::form_input(
                    ui,
                    "recruitment.title",
                    "Tên vị trí / Chức danh tuyển dụng",
                    true,
                    &mut self.form.title,
                    "",
                    false,
                );
                let columns = widgets::grid_columns(ui.available_width(), 220.0, 12.0, 2);
                ui.columns(columns, |cols| {
                    widgets::form_input(
                        &mut cols[0],
                        "recruitment.count",
                        "Chỉ tiêu số lượng (1–500)",
                        true,
                        &mut self.form.headcount_needed,
                        "",
                        false,
                    );
                    widgets::form_input(
                        &mut cols[1 % columns],
                        "recruitment.salary",
                        "Khung lương thỏa thuận",
                        false,
                        &mut self.form.salary_range,
                        "",
                        false,
                    );
                });
                widgets::form_textarea(
                    ui,
                    "recruitment.requirements",
                    "Yêu cầu kinh nghiệm & Kỹ năng cốt lõi",
                    false,
                    &mut self.form.experience_req,
                    "",
                    2,
                );
                ui.columns(columns, |cols| {
                    widgets::form_input(
                        &mut cols[0],
                        "recruitment.recruiter",
                        "HR Phụ trách tuyển dụng",
                        false,
                        &mut self.form.recruiter,
                        "",
                        false,
                    );
                    widgets::form_date(
                        &mut cols[1 % columns],
                        "recruitment.deadline",
                        "Hạn chót nhận hồ sơ",
                        true,
                        &mut self.form.deadline,
                    );
                });
                ui.label("Trạng thái ban đầu do máy chủ đặt. Phòng ban, chức danh và HR nhập theo hồ sơ thực tế.");
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
                            RichText::new("Ban hành tin tuyển dụng").color(crate::theme::PRIMARY),
                        )
                        .clicked()
                    {
                        match self.form.to_input() {
                            Ok(input) => {
                                self.create_task =
                                    Some(api.create_hr_job_opening_task(session, &input));
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

impl OpeningForm {
    fn to_input(&self) -> Result<CreateHrJobOpeningInput, String> {
        for (label, value) in [
            ("Mã vị trí", self.job_code.trim()),
            ("Chức danh", self.title.trim()),
            ("Phòng ban", self.department.trim()),
        ] {
            if value.is_empty() {
                return Err(format!("{label} là bắt buộc."));
            }
        }
        if !LEVELS.contains(&self.level.as_str()) {
            return Err("Cấp bậc tuyển dụng không hợp lệ.".to_owned());
        }
        let headcount_needed = self
            .headcount_needed
            .trim()
            .parse::<i64>()
            .ok()
            .filter(|value| (1..=500).contains(value))
            .ok_or_else(|| "Chỉ tiêu phải là số nguyên từ 1 đến 500.".to_owned())?;
        if NaiveDate::parse_from_str(self.deadline.trim(), "%Y-%m-%d").is_err() {
            return Err("Hạn tuyển cần theo định dạng YYYY-MM-DD hợp lệ.".to_owned());
        }
        Ok(CreateHrJobOpeningInput {
            job_code: self.job_code.trim().to_owned(),
            title: self.title.trim().to_owned(),
            department: self.department.trim().to_owned(),
            level: self.level.clone(),
            headcount_needed,
            salary_range: self.salary_range.trim().to_owned(),
            deadline: self.deadline.trim().to_owned(),
            recruiter: self.recruiter.trim().to_owned(),
            experience_req: self.experience_req.trim().to_owned(),
        })
    }
}

fn status_matches(status: &str, filter: &str) -> bool {
    match filter {
        "Tất cả" => true,
        "Đang tuyển dụng" | "Tạm dừng" => status == filter,
        "Đã đủ chỉ tiêu" => status.contains("Đã đủ") || status.contains("Đã đóng"),
        "Khác" => {
            !["Đang tuyển dụng", "Tạm dừng"].contains(&status)
                && !status.contains("Đã đủ")
                && !status.contains("Đã đóng")
        }
        _ => true,
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

fn present(value: &str) -> &str {
    if value.trim().is_empty() {
        "Chưa khai báo"
    } else {
        value
    }
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
                let mut view = HrRecruitmentView {
                    loaded_for: Some(session.user.id.clone()),
                    page: 99,
                    ..Default::default()
                };
                if (1..=3).contains(&state) {
                    view.rows.push(HrJobOpening {
                        key: "layout-row".into(),
                        job_code: "TD-1".into(),
                        title: long.clone(),
                        department: long.clone(),
                        recruiter: long.clone(),
                        level: "Senior".into(),
                        headcount_needed: 2,
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

    fn valid_form() -> OpeningForm {
        OpeningForm {
            job_code: "TD-2026/001".to_owned(),
            title: "Kỹ sư Rust".to_owned(),
            department: "Kỹ thuật".to_owned(),
            level: "Senior".to_owned(),
            headcount_needed: "2".to_owned(),
            salary_range: "25 - 40 triệu".to_owned(),
            deadline: "2026-12-01".to_owned(),
            recruiter: "HR Team".to_owned(),
            experience_req: "Rust, SQL".to_owned(),
        }
    }

    #[test]
    fn recruitment_form_serializes_only_supported_opening_fields() {
        let input = valid_form().to_input().expect("valid opening input");
        let wire = serde_json::to_value(input).expect("opening wire JSON");
        assert_eq!(wire["jobCode"], "TD-2026/001");
        assert_eq!(wire["headcountNeeded"], 2);
        assert_eq!(wire["deadline"], "2026-12-01");
        assert!(wire.get("status").is_none());
        assert!(wire.get("candidatesApplied").is_none());
        assert!(wire.get("offeredCount").is_none());
    }

    #[test]
    fn recruitment_form_rejects_missing_code_bad_level_count_and_date() {
        let mut form = valid_form();
        form.job_code.clear();
        assert!(form.to_input().is_err());
        let mut form = valid_form();
        form.level = "Intern".to_owned();
        assert!(form.to_input().is_err());
        let mut form = valid_form();
        form.headcount_needed = "0".to_owned();
        assert!(form.to_input().is_err());
        let mut form = valid_form();
        form.deadline = "2026-02-30".to_owned();
        assert!(form.to_input().is_err());
    }

    #[test]
    fn recruitment_status_filter_handles_legacy_closed_labels() {
        assert!(status_matches("Đã đóng (Đủ định biên)", "Đã đủ chỉ tiêu"));
        assert!(status_matches("legacy state", "Khác"));
        assert!(!status_matches("Đang tuyển dụng", "Tạm dừng"));
    }
}
