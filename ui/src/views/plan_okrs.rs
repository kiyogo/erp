use std::time::Duration;

use chrono::{Datelike, NaiveDate};
use egui::{Color32, ProgressBar, RichText, Ui};

use crate::{
    api::{ApiClient, ApiTask, CreateStrategicOkrInput, StrategicOkr, StrategicOkrsResponse},
    models::Session,
    widgets::{self, Metric, TableColumn, TagTone},
};

const PILLARS: [&str; 4] = [
    "Tăng trưởng Doanh thu",
    "Hạ tầng Công nghệ & AI",
    "Tuân thủ An ninh & ISO",
    "Mở rộng Thị phần B2B",
];
#[cfg(test)]
const IN_PROGRESS: &str = "Đang đúng tiến độ";
const PAGE_SIZE: usize = 8;

#[derive(Default)]
pub struct PlanOkrsView {
    okrs: Vec<StrategicOkr>,
    pending_list: Option<ApiTask<StrategicOkrsResponse>>,
    pending_create: Option<ApiTask<StrategicOkr>>,
    loaded_for: Option<String>,
    needs_reload: bool,
    search: String,
    filter_pillar: String,
    page: usize,
    page_size: usize,
    create_open: bool,
    detail_key: Option<String>,
    okr_code: String,
    title: String,
    pillar: String,
    owner: String,
    target_metric: String,
    progress_pct: String,
    deadline: String,
    form_error: String,
    notice: String,
    error: String,
}

impl PlanOkrsView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn clear_account_state(&mut self) {
        self.okrs.clear();
        self.pending_list = None;
        self.pending_create = None;
        self.needs_reload = true;
        self.search.clear();
        self.filter_pillar = "all".to_owned();
        self.page = 0;
        self.page_size = PAGE_SIZE;
        self.create_open = false;
        self.detail_key = None;
        self.clear_form();
        self.notice.clear();
        self.error.clear();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.clear_account_state();
            self.loaded_for = Some(session.user.id.clone());
        }
        if self.needs_reload && self.pending_list.is_none() && self.pending_create.is_none() {
            self.pending_list = Some(api.list_strategic_okrs_task(session));
            self.needs_reload = false;
        }
        if let Some(result) = self.pending_list.as_ref().and_then(ApiClient::poll) {
            self.pending_list = None;
            match result {
                Ok(response) => {
                    self.okrs = response.data;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_create.as_ref().and_then(ApiClient::poll) {
            self.pending_create = None;
            match result {
                Ok(okr) => {
                    self.okrs.retain(|existing| existing.key != okr.key);
                    self.okrs.insert(0, okr.clone());
                    self.page = 0;
                    self.create_open = false;
                    self.clear_form();
                    self.notice = format!("Đã thêm mục tiêu OKR {}.", okr.okr_code);
                    self.error.clear();
                }
                Err(error) => self.form_error = error,
            }
        }
        if self.pending_list.is_some() || self.pending_create.is_some() {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.poll(ctx, session, api);
        let exceeded = self
            .okrs
            .iter()
            .filter(|item| status_is_exceeded(&item.status))
            .count();
        let active_pillars = self
            .okrs
            .iter()
            .map(|item| item.pillar.as_str())
            .filter(|pillar| !pillar.trim().is_empty())
            .collect::<std::collections::BTreeSet<_>>()
            .len();
        let unknown =
            self.okrs.is_empty() && (self.pending_list.is_some() || !self.error.is_empty());
        widgets::metrics(
            ui,
            "okrs.kpi",
            &[
                Metric {
                    label: "Tiến độ hoàn thành OKR bình quân",
                    value: average_progress(&self.okrs)
                        .map(|value| format!("{}% kế hoạch năm", format_progress(value)))
                        .unwrap_or_else(|| "—".into()),
                    detail: "Theo tiến độ khai báo, chưa đối soát",
                    color: crate::theme::PRIMARY,
                    value_size: 24.0,
                },
                Metric {
                    label: "Mục tiêu hoàn thành vượt mức",
                    value: if unknown {
                        "—".into()
                    } else {
                        format!("{exceeded} mục tiêu trọng điểm")
                    },
                    detail: "Theo trạng thái mục tiêu đã lưu",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 24.0,
                },
                Metric {
                    label: "Trụ cột chiến lược then chốt",
                    value: if unknown {
                        "—".into()
                    } else {
                        format!("{active_pillars} trụ cột có mục tiêu")
                    },
                    detail: "Theo danh mục mục tiêu đã lưu",
                    color: Color32::from_rgb(30, 64, 175),
                    value_size: 24.0,
                },
                Metric {
                    label: "Doanh thu mục tiêu",
                    value: "Chưa xác định".into(),
                    detail: "Chưa có API doanh thu/ARR",
                    color: Color32::from_rgb(124, 58, 237),
                    value_size: 24.0,
                },
            ],
        );
        ui.add_space(16.0);
        let mut filters = vec!["all".to_owned()];
        filters.extend(PILLARS.iter().map(|pillar| (*pillar).to_owned()));
        for item in &self.okrs {
            if !item.pillar.is_empty() && !filters.contains(&item.pillar) {
                filters.push(item.pillar.clone());
            }
        }
        let labels = filters
            .iter()
            .map(|pillar| match pillar.as_str() {
                "all" => "Tất cả OKR",
                "Tăng trưởng Doanh thu" => "Doanh thu",
                "Hạ tầng Công nghệ & AI" => "Hạ tầng & AI",
                "Tuân thủ An ninh & ISO" => "An ninh & ISO",
                "Mở rộng Thị phần B2B" => "Thị phần B2B",
                value => value,
            })
            .collect::<Vec<_>>();
        let selected = filters
            .iter()
            .position(|value| value == &self.filter_pillar)
            .unwrap_or(0);
        let toolbar = widgets::filter_toolbar_with_more(
            ui,
            "okrs",
            &labels,
            selected,
            &mut self.search,
            "Tìm theo OKR, mục tiêu, trụ cột, người phụ trách...",
            "Thêm mục tiêu OKR mới",
            false,
            usize::MAX,
            |ui| {
                ui.add_enabled(false, egui::Button::new("In Lộ Trình (A4)"))
                    .on_disabled_hover_text("Chưa có bộ tạo tài liệu lộ trình.");
            },
        );
        if let Some(index) = toolbar.selected {
            self.filter_pillar = filters[index].clone();
            self.page = 0;
        }
        if toolbar.search_changed {
            self.page = 0;
        }
        if toolbar.reload_clicked {
            self.needs_reload = true;
        }
        if toolbar.create_clicked && self.pending_create.is_none() {
            self.init_new_form();
            self.create_open = true;
        }
        ui.add_space(12.0);
        if !self.notice.is_empty() {
            ui.colored_label(Color32::DARK_GREEN, &self.notice);
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::DARK_RED, &self.error);
        }
        if self.pending_list.is_some() {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải các mục tiêu OKR…");
            });
        }
        let query = self.search.trim().to_lowercase();
        let filtered = self
            .okrs
            .iter()
            .filter(|item| okr_matches(item, &query, &self.filter_pillar))
            .cloned()
            .collect::<Vec<_>>();
        if self.page_size == 0 {
            self.page_size = PAGE_SIZE;
        }
        self.page = self
            .page
            .min(filtered.len().div_ceil(self.page_size).max(1) - 1);
        let rows = filtered
            .iter()
            .skip(self.page * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        widgets::table(
            ui,
            "okrs.table",
            &[
                TableColumn {
                    title: "Mã OKR",
                    width: 140.0,
                },
                TableColumn {
                    title: "Mục tiêu chiến lược & Trụ cột",
                    width: 380.0,
                },
                TableColumn {
                    title: "Chỉ số đo lường (Key Result)",
                    width: 260.0,
                },
                TableColumn {
                    title: "Tiến độ thực hiện",
                    width: 180.0,
                },
                TableColumn {
                    title: "Trạng thái",
                    width: 180.0,
                },
                TableColumn {
                    title: "Thao tác",
                    width: 110.0,
                },
            ],
            rows.len(),
            |ui, row, col| {
                let item = rows[row];
                match col {
                    0 => {
                        ui.label(
                            RichText::new(&item.okr_code)
                                .monospace()
                                .color(crate::theme::PRIMARY),
                        );
                    }
                    1 => {
                        ui.label(&item.title);
                        ui.label(
                            RichText::new(format!(
                                "Trụ cột: {} · Người phụ trách: {}",
                                item.pillar, item.owner
                            ))
                            .size(12.0)
                            .color(Color32::from_rgb(30, 64, 175)),
                        );
                    }
                    2 => {
                        ui.label(&item.target_metric);
                    }
                    3 => {
                        ui.label(format!(
                            "{}% · Hạn: {}",
                            format_progress(item.progress_pct),
                            item.deadline
                        ));
                        ui.add(
                            ProgressBar::new(progress_fraction(item.progress_pct))
                                .fill(progress_color(item.progress_pct))
                                .desired_width(150.0)
                                .desired_height(6.0),
                        );
                    }
                    4 => widgets::tag(
                        ui,
                        &item.status,
                        if status_is_exceeded(&item.status) {
                            TagTone::Success
                        } else if item.status == "Cần tăng tốc" {
                            TagTone::Warning
                        } else if item.status == "Đang đúng tiến độ" {
                            TagTone::Processing
                        } else {
                            TagTone::Neutral
                        },
                    ),
                    _ => {
                        if ui.button("Chi tiết").clicked() {
                            self.detail_key = Some(item.key.clone());
                        }
                    }
                }
            },
        );
        ui.add_space(8.0);
        widgets::pagination(
            ui,
            "okrs.pagination",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );
        self.render_detail(ctx);
        self.render_form(ctx, session, api);
    }

    fn render_form(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if !self.create_open {
            return;
        }
        let (_, close) = widgets::modal(
            ctx,
            "okrs.create",
            "Thêm mục tiêu chiến lược then chốt (OKR) mới",
            540.0,
            self.pending_create.is_some(),
            |ui| {
                ui.add_space(14.0);
                if ui.available_width() >= 420.0 {
                    ui.columns(2, |cols| {
                        widgets::form_input(
                            &mut cols[0],
                            "okr.code",
                            "Mã OKR",
                            true,
                            &mut self.okr_code,
                            "",
                            false,
                        );
                        widgets::form_select(
                            &mut cols[1],
                            "okr.pillar",
                            "Trụ cột chiến lược",
                            true,
                            &mut self.pillar,
                            &PILLARS,
                        );
                    });
                } else {
                    widgets::form_input(
                        ui,
                        "okr.code",
                        "Mã OKR",
                        true,
                        &mut self.okr_code,
                        "",
                        false,
                    );
                    widgets::form_select(
                        ui,
                        "okr.pillar",
                        "Trụ cột chiến lược",
                        true,
                        &mut self.pillar,
                        &PILLARS,
                    );
                }
                widgets::form_input(
                    ui,
                    "okr.title",
                    "Tiêu đề mục tiêu chiến lược",
                    true,
                    &mut self.title,
                    "",
                    false,
                );
                widgets::form_input(
                    ui,
                    "okr.metric",
                    "Chỉ số kết quả đo lường (Key Result)",
                    true,
                    &mut self.target_metric,
                    "",
                    false,
                );
                widgets::form_input(
                    ui,
                    "okr.owner",
                    "Phụ trách",
                    true,
                    &mut self.owner,
                    "",
                    false,
                );
                widgets::form_input(
                    ui,
                    "okr.progress",
                    "Tiến độ (%)",
                    true,
                    &mut self.progress_pct,
                    "0–100",
                    false,
                );
                widgets::form_date(ui, "okr.deadline", "Hạn chót", true, &mut self.deadline);
                let parsed = build_input(
                    &self.okr_code,
                    &self.title,
                    &self.pillar,
                    &self.owner,
                    &self.target_metric,
                    &self.progress_pct,
                    &self.deadline,
                );
                if let Err(error) = &parsed {
                    ui.colored_label(Color32::DARK_RED, error);
                }
                if !self.form_error.is_empty() {
                    ui.colored_label(Color32::DARK_RED, &self.form_error);
                }
                ui.add_space(18.0);
                widgets::action_row(ui, |ui| {
                    if ui
                        .add_enabled(
                            parsed.is_ok() && self.pending_create.is_none(),
                            egui::Button::new("Lưu mục tiêu OKR"),
                        )
                        .clicked()
                    {
                        if let Ok(input) = parsed {
                            self.pending_create =
                                Some(api.create_strategic_okr_task(session, &input));
                            self.form_error.clear();
                            self.error.clear();
                        }
                    }
                    if ui
                        .add_enabled(self.pending_create.is_none(), egui::Button::new("Hủy"))
                        .clicked()
                    {
                        self.create_open = false;
                    }
                    if self.pending_create.is_some() {
                        ui.spinner();
                        ui.label("Đang lưu…");
                    }
                });
                ui.small("Mục tiêu mới được lưu với trạng thái ‘Đang đúng tiến độ’, giống hành vi legacy.");
            },
        );
        if close && self.pending_create.is_none() {
            self.create_open = false;
        }
        if self.pending_create.is_some() {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    fn render_detail(&mut self, ctx: &egui::Context) {
        let Some(key) = self.detail_key.clone() else {
            return;
        };
        let Some(okr) = self.okrs.iter().find(|okr| okr.key == key).cloned() else {
            self.detail_key = None;
            return;
        };
        let (_, close) = widgets::drawer(
            ctx,
            "okrs.detail",
            "Chi Tiết Mục Tiêu Chiến Lược OKR",
            520.0,
            |ui| {
                egui::Frame::none()
                    .fill(Color32::from_rgb(248, 250, 252))
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                    .rounding(8.0)
                    .inner_margin(16.0)
                    .show(ui, |ui| {
                        ui.colored_label(
                            crate::theme::PRIMARY,
                            format!("MÃ OKR: {}", okr.okr_code),
                        );
                        ui.label(RichText::new(&okr.title).size(17.0).strong());
                        ui.small(format!(
                            "Trụ cột: {} · Thời hạn: {}",
                            okr.pillar, okr.deadline
                        ));
                    });
                ui.add_space(16.0);
                egui::Frame::group(ui.style())
                    .inner_margin(14.0)
                    .show(ui, |ui| {
                        ui.strong("Chỉ Số Đo Lường & Nhân Sự Phụ Trách");
                        ui.label(format!("Người phụ trách: {}", okr.owner));
                        ui.label(format!(
                            "Tiến độ thực hiện: {}%",
                            format_progress(okr.progress_pct)
                        ));
                        ui.add(
                            ProgressBar::new(progress_fraction(okr.progress_pct))
                                .fill(progress_color(okr.progress_pct))
                                .desired_height(6.0),
                        );
                        ui.colored_label(status_color(&okr.status), &okr.status);
                        ui.label("Key Result (Chỉ số then chốt):");
                        ui.label(&okr.target_metric);
                    });
                ui.add_space(16.0);
                ui.horizontal_wrapped(|ui| {
                    ui.add_enabled(false, egui::Button::new("Đồng bộ tiến độ OKR"))
                        .on_disabled_hover_text("Chưa có API đồng bộ tiến độ.");
                    ui.add_enabled(false, egui::Button::new("In Bản Đồ OKR (A4)"))
                        .on_disabled_hover_text("Chưa có bộ tạo tài liệu.");
                });
                ui.small(
                    "Tiến độ do người dùng khai báo; chưa kết nối nguồn đồng bộ và tài liệu in.",
                );
            },
        );
        if close {
            self.detail_key = None;
        }
    }

    fn init_new_form(&mut self) {
        let year = chrono::Utc::now().year();
        self.okr_code = format!("OKR-{year}-0{}", self.okrs.len() + 1);
        self.title.clear();
        self.pillar = PILLARS[0].to_owned();
        self.owner.clear();
        self.target_metric.clear();
        self.progress_pct = "0".to_owned();
        self.deadline = format!("{year}-12-31");
        self.form_error.clear();
    }

    fn clear_form(&mut self) {
        self.okr_code.clear();
        self.title.clear();
        self.pillar.clear();
        self.owner.clear();
        self.target_metric.clear();
        self.progress_pct.clear();
        self.deadline.clear();
        self.form_error.clear();
    }
}

fn okr_matches(okr: &StrategicOkr, query: &str, filter_pillar: &str) -> bool {
    (filter_pillar == "all" || okr.pillar == filter_pillar)
        && (query.is_empty()
            || [
                okr.okr_code.as_str(),
                okr.title.as_str(),
                okr.pillar.as_str(),
                okr.owner.as_str(),
            ]
            .iter()
            .any(|value| value.to_lowercase().contains(query)))
}

fn average_progress(okrs: &[StrategicOkr]) -> Option<f64> {
    if okrs.is_empty() {
        None
    } else {
        Some(okrs.iter().map(|okr| okr.progress_pct).sum::<f64>() / okrs.len() as f64)
    }
}

fn status_is_exceeded(status: &str) -> bool {
    status.to_lowercase().contains("vượt")
}

fn progress_fraction(progress_pct: f64) -> f32 {
    if progress_pct.is_finite() {
        (progress_pct / 100.0).clamp(0.0, 1.0) as f32
    } else {
        0.0
    }
}

fn progress_color(progress_pct: f64) -> Color32 {
    if progress_pct >= 90.0 {
        Color32::from_rgb(22, 163, 74)
    } else if progress_pct >= 70.0 {
        Color32::from_rgb(0, 150, 136)
    } else {
        Color32::from_rgb(234, 88, 12)
    }
}

fn format_progress(progress_pct: f64) -> String {
    if progress_pct.fract() == 0.0 {
        format!("{progress_pct:.0}")
    } else {
        format!("{progress_pct:.1}")
    }
}

fn build_input(
    okr_code: &str,
    title: &str,
    pillar: &str,
    owner: &str,
    target_metric: &str,
    progress_pct: &str,
    deadline: &str,
) -> Result<CreateStrategicOkrInput, String> {
    let okr_code = okr_code.trim().to_ascii_uppercase();
    if okr_code.is_empty()
        || okr_code.len() > 64
        || !okr_code
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || b"-_".contains(&byte))
    {
        return Err(
            "Mã OKR chỉ gồm chữ cái, chữ số, dấu gạch ngang hoặc gạch dưới; tối đa 64 ký tự."
                .to_owned(),
        );
    }
    if title.trim().is_empty() || owner.trim().is_empty() || target_metric.trim().is_empty() {
        return Err("Tiêu đề, người phụ trách và chỉ số Key Result là bắt buộc.".to_owned());
    }
    if !PILLARS.contains(&pillar.trim()) {
        return Err("Chọn một trụ cột chiến lược hợp lệ.".to_owned());
    }
    let progress_pct = progress_pct
        .trim()
        .parse::<f64>()
        .map_err(|_| "Tiến độ phải là số từ 0 đến 100.".to_owned())?;
    if !progress_pct.is_finite() || !(0.0..=100.0).contains(&progress_pct) {
        return Err("Tiến độ phải là số hữu hạn trong khoảng 0 đến 100.".to_owned());
    }
    let deadline = deadline.trim();
    let parsed_date = NaiveDate::parse_from_str(deadline, "%Y-%m-%d")
        .map_err(|_| "Hạn chót phải có định dạng YYYY-MM-DD.".to_owned())?;
    if parsed_date.format("%Y-%m-%d").to_string() != deadline {
        return Err("Hạn chót phải có định dạng YYYY-MM-DD.".to_owned());
    }
    Ok(CreateStrategicOkrInput {
        okr_code,
        title: title.trim().to_owned(),
        pillar: pillar.trim().to_owned(),
        owner: owner.trim().to_owned(),
        target_metric: target_metric.trim().to_owned(),
        progress_pct,
        deadline: deadline.to_owned(),
    })
}

fn status_color(status: &str) -> Color32 {
    if status_is_exceeded(status) {
        Color32::from_rgb(22, 163, 74)
    } else if status.eq_ignore_ascii_case("Cần tăng tốc") {
        Color32::from_rgb(217, 119, 6)
    } else {
        Color32::from_rgb(37, 99, 235)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn okr(code: &str, pillar: &str, progress: f64, status: &str) -> StrategicOkr {
        StrategicOkr {
            key: code.to_owned(),
            okr_code: code.to_owned(),
            title: "Mở rộng hạ tầng".to_owned(),
            pillar: pillar.to_owned(),
            owner: "Nguyễn An".to_owned(),
            target_metric: "12 rack IDC".to_owned(),
            progress_pct: progress,
            deadline: "2026-12-31".to_owned(),
            status: status.to_owned(),
        }
    }

    #[test]
    fn pillar_filters_and_search_match_legacy_fields() {
        let item = okr("OKR-2026-01", PILLARS[1], 75.0, IN_PROGRESS);
        assert!(okr_matches(&item, "nguyễn an", "all"));
        assert!(okr_matches(&item, "hạ tầng", PILLARS[1]));
        assert!(!okr_matches(&item, "không có", "all"));
        assert!(!okr_matches(&item, "", PILLARS[0]));
    }

    #[test]
    fn empty_and_real_summary_values_are_data_backed() {
        assert_eq!(average_progress(&[]), None);
        let rows = [
            okr("1", PILLARS[0], 50.0, IN_PROGRESS),
            okr("2", PILLARS[1], 75.0, "Hoàn thành vượt chỉ tiêu"),
        ];
        assert_eq!(average_progress(&rows), Some(62.5));
        assert_eq!(
            rows.iter()
                .filter(|item| status_is_exceeded(&item.status))
                .count(),
            1
        );
        assert_eq!(progress_fraction(150.0), 1.0);
        assert_eq!(progress_fraction(f64::NAN), 0.0);
        assert_eq!(format_progress(27.5), "27.5");
    }

    #[test]
    fn create_form_validates_required_fields_fractional_percent_and_date() {
        assert!(
            build_input(
                "okr-26-1",
                "Mục tiêu",
                PILLARS[0],
                "Nguyễn An",
                "ARR",
                "0",
                "2026-12-31"
            )
            .is_ok()
        );
        assert!(
            build_input(
                "OKR 1",
                "Mục tiêu",
                PILLARS[0],
                "Nguyễn An",
                "ARR",
                "50",
                "2026-12-31"
            )
            .is_err()
        );
        assert!(
            build_input(
                "OKR-1",
                "Mục tiêu",
                PILLARS[0],
                "Nguyễn An",
                "ARR",
                "100.1",
                "2026-12-31"
            )
            .is_err()
        );
        assert!(
            build_input(
                "OKR-1",
                "Mục tiêu",
                "Trụ cột giả",
                "Nguyễn An",
                "ARR",
                "50",
                "2026-12-31"
            )
            .is_err()
        );
        assert!(
            build_input(
                "OKR-1",
                "Mục tiêu",
                PILLARS[0],
                "Nguyễn An",
                "ARR",
                "50",
                "2026-02-30"
            )
            .is_err()
        );
    }
}
