use std::time::Duration;

use chrono::Datelike;
use egui::{Color32, ProgressBar, Ui};

use crate::{
    api::{ApiClient, ApiTask, PlanReportEntry, PlanReportWriteInput, PlanReportsResponse},
    models::Session,
    widgets::{self, Metric, TableColumn, TagTone},
};

const MAX_AMOUNT: i64 = 1_000_000_000_000;

#[derive(Default)]
pub struct PlanReportsView {
    reports: Vec<PlanReportEntry>,
    pending_list: Option<ApiTask<PlanReportsResponse>>,
    pending_create: Option<ApiTask<PlanReportEntry>>,
    pending_update: Option<(String, ApiTask<PlanReportEntry>)>,
    loaded_for: Option<String>,
    needs_reload: bool,
    period: String,
    filter: String,
    search: String,
    modal_open: bool,
    editing_key: Option<String>,
    selected_key: Option<String>,
    form_period: String,
    department: String,
    leader: String,
    total_plans: String,
    completed_plans: String,
    approved_budget: String,
    actual_spent: String,
    kpi_score: String,
    form_error: String,
    notice: String,
    error: String,
}

impl PlanReportsView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn clear_account_state(&mut self) {
        self.reports.clear();
        self.pending_list = None;
        self.pending_create = None;
        self.pending_update = None;
        self.needs_reload = true;
        self.filter = "all".to_owned();
        self.search.clear();
        self.modal_open = false;
        self.editing_key = None;
        self.selected_key = None;
        self.clear_form();
        self.notice.clear();
        self.error.clear();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.period.is_empty() {
            self.period = current_period();
        }
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.clear_account_state();
            self.loaded_for = Some(session.user.id.clone());
        }
        if self.needs_reload
            && self.pending_list.is_none()
            && self.pending_create.is_none()
            && self.pending_update.is_none()
        {
            self.pending_list = Some(api.list_plan_reports_task(session, None));
            self.needs_reload = false;
        }
        if let Some(result) = self.pending_list.as_ref().and_then(ApiClient::poll) {
            self.pending_list = None;
            match result {
                Ok(response) => {
                    self.reports = response.data;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_create.as_ref().and_then(ApiClient::poll) {
            self.pending_create = None;
            match result {
                Ok(report) => {
                    self.upsert(report.clone());
                    self.modal_open = false;
                    self.clear_form();
                    self.notice =
                        format!("Đã lưu báo cáo {} — {}.", report.department, report.period);
                    self.error.clear();
                }
                Err(error) => self.form_error = error,
            }
        }
        let updated = self
            .pending_update
            .as_ref()
            .and_then(|(_, task)| ApiClient::poll(task));
        if let Some(result) = updated {
            self.pending_update = None;
            match result {
                Ok(report) => {
                    self.upsert(report.clone());
                    self.modal_open = false;
                    self.clear_form();
                    self.notice = format!(
                        "Đã cập nhật báo cáo {} — {}.",
                        report.department, report.period
                    );
                    self.error.clear();
                }
                Err(error) => self.form_error = error,
            }
        }
        if self.pending_list.is_some()
            || self.pending_create.is_some()
            || self.pending_update.is_some()
        {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.poll(ctx, session, api);
        let period_reports = self
            .reports
            .iter()
            .filter(|report| report.period == self.period)
            .cloned()
            .collect::<Vec<_>>();
        let has_reports = !period_reports.is_empty();
        let total_budget = sum_i64(period_reports.iter().map(|report| report.approved_budget));
        let total_spent = sum_i64(period_reports.iter().map(|report| report.actual_spent));
        let total_variance = sum_i64(period_reports.iter().map(|report| report.variance));
        let average_kpi = average_kpi(&period_reports);
        let budget_label = if has_reports {
            format_currency(total_budget)
        } else {
            "—".to_owned()
        };
        let spent_label = if has_reports {
            format_currency(total_spent)
        } else {
            "—".to_owned()
        };
        let variance_total_label = if has_reports {
            format_currency(total_variance)
        } else {
            "—".to_owned()
        };
        widgets::metrics(
            ui,
            "reports.kpi",
            &[
                Metric {
                    label: "Tổng ngân sách phê duyệt",
                    value: budget_label,
                    detail: "Số liệu đơn vị tự báo cáo theo kỳ",
                    color: crate::theme::PRIMARY,
                    value_size: 24.0,
                },
                Metric {
                    label: "Thực tế giải ngân",
                    value: spent_label,
                    detail: "Chưa đối soát với kế toán",
                    color: Color32::from_rgb(30, 64, 175),
                    value_size: 24.0,
                },
                Metric {
                    label: "Chênh lệch ngân sách",
                    value: if has_reports {
                        variance_label(total_variance)
                    } else {
                        variance_total_label
                    },
                    detail: "Chi phí thực tế trừ ngân sách phê duyệt",
                    color: if total_variance <= 0 {
                        Color32::from_rgb(22, 163, 74)
                    } else {
                        Color32::DARK_RED
                    },
                    value_size: 24.0,
                },
                Metric {
                    label: "Điểm KPI bình quân khối",
                    value: average_kpi
                        .map(|score| format!("{} / 100 điểm", format_kpi(score)))
                        .unwrap_or_else(|| "—".into()),
                    detail: "KPI tự đánh giá, chưa xác minh ISO",
                    color: Color32::from_rgb(124, 58, 237),
                    value_size: 24.0,
                },
            ],
        );
        ui.add_space(16.0);
        let filters = ["all", "excellent", "good", "top_budget"];
        let toolbar = widgets::filter_toolbar_with_more(
            ui,
            "reports",
            &[
                "Tất cả đơn vị",
                "Xuất sắc (KPI ≥ 95)",
                "Đạt chuẩn (KPI 90–94)",
                "Ngân sách ≥ 1 tỷ",
            ],
            filters
                .iter()
                .position(|value| *value == self.filter)
                .unwrap_or(0),
            &mut self.search,
            "Tìm theo đơn vị, người phụ trách...",
            "Thêm Báo Cáo Khối",
            false,
            usize::MAX,
            |ui| {
                ui.add_enabled(false, egui::Button::new("In Báo Cáo (A4)"))
                    .on_disabled_hover_text("Chưa có bộ tạo tài liệu.");
                ui.add_enabled(false, egui::Button::new("Xuất Excel"))
                    .on_disabled_hover_text("Chưa có bộ tạo tệp Excel.");
            },
        );
        if let Some(index) = toolbar.selected {
            self.filter = filters[index].into();
        }
        if toolbar.reload_clicked {
            self.needs_reload = true;
        }
        if toolbar.create_clicked && self.pending_create.is_none() && self.pending_update.is_none()
        {
            self.open_create();
        }
        ui.add_space(8.0);
        widgets::combo_box("reports.period")
            .selected_text(format!("Kỳ {}", self.period))
            .show_ui(ui, |ui| {
                for period in self.available_periods() {
                    ui.selectable_value(&mut self.period, period.clone(), period);
                }
            });
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
                ui.label(format!("Đang tải báo cáo kỳ {}…", self.period));
            });
        }
        // Re-evaluate after toolbar interactions so the table and period selection agree this frame.
        let query = self.search.trim().to_lowercase();
        let filtered = self
            .reports
            .iter()
            .filter(|report| {
                report.period == self.period && report_matches(report, &query, &self.filter)
            })
            .cloned()
            .collect::<Vec<_>>();
        widgets::table(
            ui,
            "reports.table",
            &[
                TableColumn {
                    title: "Khối / Đơn vị thực hiện",
                    width: 280.0,
                },
                TableColumn {
                    title: "Kế hoạch (Đạt/Tổng)",
                    width: 210.0,
                },
                TableColumn {
                    title: "Ngân sách phê duyệt",
                    width: 180.0,
                },
                TableColumn {
                    title: "Chi phí thực tế",
                    width: 180.0,
                },
                TableColumn {
                    title: "Chênh lệch tiết kiệm",
                    width: 210.0,
                },
                TableColumn {
                    title: "Điểm KPI",
                    width: 120.0,
                },
                TableColumn {
                    title: "Đánh giá chung",
                    width: 150.0,
                },
                TableColumn {
                    title: "Thao tác",
                    width: 150.0,
                },
            ],
            filtered.len(),
            |ui, row, col| {
                let report = &filtered[row];
                match col {
                    0 => {
                        ui.label(&report.department);
                        ui.small(format!("Chủ trì: {}", report.leader));
                    }
                    1 => {
                        let pct = completion_percent(report);
                        ui.colored_label(
                            Color32::from_rgb(30, 64, 175),
                            format!(
                                "{} / {} kế hoạch ({pct}%)",
                                report.completed_plans, report.total_plans
                            ),
                        );
                        ui.add(
                            ProgressBar::new((pct as f32 / 100.0).clamp(0.0, 1.0))
                                .desired_width(120.0)
                                .desired_height(5.0),
                        );
                    }
                    2 => {
                        ui.label(format_currency(report.approved_budget));
                    }
                    3 => {
                        ui.label(format_currency(report.actual_spent));
                    }
                    4 => {
                        ui.colored_label(
                            if report.variance <= 0 {
                                Color32::from_rgb(22, 163, 74)
                            } else {
                                Color32::DARK_RED
                            },
                            variance_label(report.variance),
                        );
                    }
                    5 => {
                        ui.colored_label(
                            if report.kpi_score >= 95.0 {
                                Color32::from_rgb(22, 163, 74)
                            } else {
                                crate::theme::PRIMARY
                            },
                            format!("{} / 100", format_kpi(report.kpi_score)),
                        );
                    }
                    6 => widgets::tag(
                        ui,
                        &report.evaluation,
                        match report.evaluation.as_str() {
                            "Xuất sắc" => TagTone::Success,
                            "Đạt yêu cầu" => TagTone::Processing,
                            "Cần cải thiện" => TagTone::Warning,
                            _ => TagTone::Neutral,
                        },
                    ),
                    _ => {
                        ui.horizontal(|ui| {
                            if ui.button("Chi tiết").clicked() {
                                self.selected_key = Some(report.key.clone());
                            }
                            if ui
                                .add_enabled(
                                    self.pending_update.is_none()
                                        && self.pending_create.is_none()
                                        && self.pending_list.is_none(),
                                    egui::Button::new("Sửa"),
                                )
                                .clicked()
                            {
                                self.open_edit(report);
                            }
                        });
                    }
                }
            },
        );
        self.render_detail(ctx);
        self.render_form(ctx, session, api);
    }

    fn render_form(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if !self.modal_open {
            return;
        }
        let editing = self.editing_key.is_some();
        let (_, close) = widgets::modal(
            ctx,
            "reports.form",
            if editing {
                "Cập nhật báo cáo đơn vị"
            } else {
                "Thêm Báo Cáo Đánh Giá Khối"
            },
            560.0,
            self.pending_create.is_some() || self.pending_update.is_some(),
            |ui| {
                ui.add_space(14.0);
                let periods = self.available_periods();
                let options = periods.iter().map(String::as_str).collect::<Vec<_>>();
                widgets::form_select(
                    ui,
                    "report.period",
                    "Kỳ báo cáo",
                    true,
                    &mut self.form_period,
                    &options,
                );
                widgets::form_input(
                    ui,
                    "report.department",
                    "Khối / Đơn vị thực hiện",
                    true,
                    &mut self.department,
                    "",
                    false,
                );
                widgets::form_input(
                    ui,
                    "report.leader",
                    "Lãnh đạo chủ trì",
                    true,
                    &mut self.leader,
                    "",
                    false,
                );
                if ui.available_width() >= 420.0 {
                    ui.columns(2, |cols| {
                        widgets::form_input(
                            &mut cols[0],
                            "report.total",
                            "Tổng kế hoạch",
                            true,
                            &mut self.total_plans,
                            "0",
                            false,
                        );
                        widgets::form_input(
                            &mut cols[1],
                            "report.completed",
                            "Đã hoàn thành",
                            true,
                            &mut self.completed_plans,
                            "0",
                            false,
                        );
                        widgets::form_input(
                            &mut cols[0],
                            "report.budget",
                            "Ngân sách phê duyệt (VNĐ)",
                            true,
                            &mut self.approved_budget,
                            "0",
                            false,
                        );
                        widgets::form_input(
                            &mut cols[1],
                            "report.spent",
                            "Chi phí thực tế (VNĐ)",
                            true,
                            &mut self.actual_spent,
                            "0",
                            false,
                        );
                    });
                } else {
                    widgets::form_input(
                        ui,
                        "report.total",
                        "Tổng kế hoạch",
                        true,
                        &mut self.total_plans,
                        "0",
                        false,
                    );
                    widgets::form_input(
                        ui,
                        "report.completed",
                        "Đã hoàn thành",
                        true,
                        &mut self.completed_plans,
                        "0",
                        false,
                    );
                    widgets::form_input(
                        ui,
                        "report.budget",
                        "Ngân sách phê duyệt (VNĐ)",
                        true,
                        &mut self.approved_budget,
                        "0",
                        false,
                    );
                    widgets::form_input(
                        ui,
                        "report.spent",
                        "Chi phí thực tế (VNĐ)",
                        true,
                        &mut self.actual_spent,
                        "0",
                        false,
                    );
                }
                widgets::form_input(
                    ui,
                    "report.kpi",
                    "Điểm KPI tự đánh giá (0–100)",
                    true,
                    &mut self.kpi_score,
                    "",
                    false,
                );
                let parsed = build_write_input(
                    &self.form_period,
                    &self.department,
                    &self.leader,
                    &self.total_plans,
                    &self.completed_plans,
                    &self.approved_budget,
                    &self.actual_spent,
                    &self.kpi_score,
                );
                if let Err(message) = &parsed {
                    ui.colored_label(Color32::DARK_RED, message);
                }
                if !self.form_error.is_empty() {
                    ui.colored_label(Color32::DARK_RED, &self.form_error);
                }
                ui.add_space(18.0);
                widgets::action_row(ui, |ui| {
                    if ui
                        .add_enabled(
                            parsed.is_ok()
                                && self.pending_create.is_none()
                                && self.pending_update.is_none(),
                            egui::Button::new(if editing {
                                "Lưu thay đổi"
                            } else {
                                "Lưu báo cáo"
                            }),
                        )
                        .clicked()
                    {
                        if let Ok(input) = parsed {
                            if let Some(key) = self.editing_key.clone() {
                                self.pending_update = Some((
                                    key.clone(),
                                    api.update_plan_report_task(session, &key, &input),
                                ));
                            } else {
                                self.pending_create =
                                    Some(api.create_plan_report_task(session, &input));
                            }
                            self.form_error.clear();
                            self.error.clear();
                        }
                    }
                    if ui
                        .add_enabled(
                            self.pending_create.is_none() && self.pending_update.is_none(),
                            egui::Button::new("Hủy"),
                        )
                        .clicked()
                    {
                        self.modal_open = false;
                    }
                    if self.pending_create.is_some() || self.pending_update.is_some() {
                        ui.spinner();
                        ui.label("Đang lưu…");
                    }
                });
            },
        );
        if close && self.pending_create.is_none() && self.pending_update.is_none() {
            self.modal_open = false;
        }
        if self.pending_create.is_some() || self.pending_update.is_some() {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    fn render_detail(&mut self, ctx: &egui::Context) {
        let Some(key) = self.selected_key.clone() else {
            return;
        };
        let Some(report) = self
            .reports
            .iter()
            .find(|report| report.key == key)
            .cloned()
        else {
            self.selected_key = None;
            return;
        };
        let (_, close) = widgets::drawer(
            ctx,
            "reports.detail",
            "Hồ Sơ Hiệu Suất Kế Hoạch & Phân Bổ Ngân Sách",
            560.0,
            |ui| {
                ui.heading(&report.department);
                ui.label(format!("Kỳ {} · Chủ trì: {}", report.period, report.leader));
                ui.colored_label(evaluation_color(&report.evaluation), &report.evaluation);
                ui.separator();
                let completion = completion_percent(&report);
                ui.label(format!(
                    "Kế hoạch hoàn thành: {} / {} ({completion}%)",
                    report.completed_plans, report.total_plans
                ));
                ui.add(ProgressBar::new(completion as f32 / 100.0).show_percentage());
                ui.label(format!(
                    "Ngân sách đơn vị tự báo cáo: {}",
                    format_currency(report.approved_budget)
                ));
                ui.label(format!(
                    "Chi phí đơn vị tự báo cáo: {}",
                    format_currency(report.actual_spent)
                ));
                let spend_ratio = if report.approved_budget > 0 {
                    format!(
                        "{}% ngân sách tự báo cáo",
                        (report.actual_spent.saturating_mul(100) / report.approved_budget)
                            .clamp(0, 10_000)
                    )
                } else {
                    "Không có ngân sách để tính tỷ lệ".to_owned()
                };
                ui.label(format!("Tỷ lệ chi phí: {spend_ratio}"));
                ui.label(format!(
                    "Chênh lệch chi phí - ngân sách: {}",
                    variance_label(report.variance)
                ));
                ui.label(format!(
                    "KPI tự đánh giá: {} / 100",
                    format_kpi(report.kpi_score)
                ));
                ui.separator();
                ui.small(format!(
                    "Người tạo: {} · {}",
                    report.created_by_name, report.created_at
                ));
                ui.small(format!(
                    "Cập nhật gần nhất: {} · {}",
                    report.updated_by_name, report.updated_at
                ));
                ui.colored_label(Color32::DARK_GRAY, "Danh mục dự án trong dữ liệu legacy chưa được xác minh; các dự án mẫu không được hiển thị như dữ liệu thật.");
                ui.add_enabled(false, egui::Button::new("In Hồ Sơ (A4)"))
                    .on_disabled_hover_text("Chưa có bộ tạo tài liệu.");
                ui.small("Danh mục dự án chưa có API xác minh.");
                if ui
                    .add_enabled(
                        self.pending_create.is_none()
                            && self.pending_update.is_none()
                            && self.pending_list.is_none(),
                        egui::Button::new("Chỉnh sửa số liệu tự báo cáo"),
                    )
                    .clicked()
                {
                    self.open_edit(&report);
                    self.selected_key = None;
                }
            },
        );
        if close {
            self.selected_key = None;
        }
    }

    fn open_create(&mut self) {
        self.editing_key = None;
        self.form_period = self.period.clone();
        self.clear_form();
        self.form_error.clear();
        self.modal_open = true;
    }

    fn open_edit(&mut self, report: &PlanReportEntry) {
        self.editing_key = Some(report.key.clone());
        self.form_period = report.period.clone();
        self.department = report.department.clone();
        self.leader = report.leader.clone();
        self.total_plans = report.total_plans.to_string();
        self.completed_plans = report.completed_plans.to_string();
        self.approved_budget = report.approved_budget.to_string();
        self.actual_spent = report.actual_spent.to_string();
        self.kpi_score = report.kpi_score.to_string();
        self.form_error.clear();
        self.modal_open = true;
    }

    fn clear_form(&mut self) {
        self.form_error.clear();
        self.department.clear();
        self.leader.clear();
        self.total_plans.clear();
        self.completed_plans.clear();
        self.approved_budget.clear();
        self.actual_spent.clear();
        self.kpi_score.clear();
    }

    fn available_periods(&self) -> Vec<String> {
        let mut periods = current_year_periods();
        periods.extend(self.reports.iter().map(|report| report.period.clone()));
        periods.sort();
        periods.dedup();
        periods.reverse();
        periods
    }

    fn upsert(&mut self, report: PlanReportEntry) {
        self.reports.retain(|current| current.key != report.key);
        self.reports.insert(0, report);
    }
}

fn current_year_periods() -> Vec<String> {
    let year = chrono::Utc::now().year();
    vec![
        format!("Q1/{year}"),
        format!("Q2/{year}"),
        format!("Q3/{year}"),
        format!("Q4/{year}"),
        year.to_string(),
    ]
}

fn current_period() -> String {
    let now = chrono::Utc::now().date_naive();
    let quarter = (now.month() - 1) / 3 + 1;
    format!("Q{quarter}/{}", now.year())
}

fn report_matches(report: &PlanReportEntry, query: &str, filter: &str) -> bool {
    let filter_matches = match filter {
        "all" => true,
        "excellent" => report.kpi_score >= 95.0,
        "good" => (90.0..95.0).contains(&report.kpi_score),
        "top_budget" => report.approved_budget >= 1_000_000_000,
        _ => true,
    };
    let query_matches = query.is_empty()
        || [
            report.department.as_str(),
            report.leader.as_str(),
            report.evaluation.as_str(),
        ]
        .iter()
        .any(|value| value.to_lowercase().contains(query));
    filter_matches && query_matches
}

fn build_write_input(
    period: &str,
    department: &str,
    leader: &str,
    total_plans: &str,
    completed_plans: &str,
    approved_budget: &str,
    actual_spent: &str,
    kpi_score: &str,
) -> Result<PlanReportWriteInput, String> {
    let period = period.trim();
    if !is_valid_period(period) {
        return Err("Chọn kỳ báo cáo hợp lệ (YYYY hoặc Q1/YYYY–Q4/YYYY).".to_owned());
    }
    if department.trim().is_empty() || leader.trim().is_empty() {
        return Err("Tên đơn vị và lãnh đạo phụ trách là bắt buộc.".to_owned());
    }
    let total_plans = total_plans
        .trim()
        .parse::<i64>()
        .map_err(|_| "Tổng kế hoạch phải là số nguyên dương.".to_owned())?;
    let completed_plans = completed_plans
        .trim()
        .parse::<i64>()
        .map_err(|_| "Số kế hoạch hoàn thành phải là số nguyên.".to_owned())?;
    let approved_budget = approved_budget
        .trim()
        .parse::<i64>()
        .map_err(|_| "Ngân sách phải là số nguyên VNĐ.".to_owned())?;
    let actual_spent = actual_spent
        .trim()
        .parse::<i64>()
        .map_err(|_| "Chi phí phải là số nguyên VNĐ.".to_owned())?;
    let kpi_score = kpi_score
        .trim()
        .parse::<f64>()
        .map_err(|_| "Điểm KPI phải là số từ 0 đến 100.".to_owned())?;
    if total_plans < 1
        || total_plans > 1_000_000
        || completed_plans < 0
        || completed_plans > total_plans
    {
        return Err("Số kế hoạch hoàn thành phải nằm trong khoảng 0 đến tổng kế hoạch.".to_owned());
    }
    if !(0..=MAX_AMOUNT).contains(&approved_budget) || !(0..=MAX_AMOUNT).contains(&actual_spent) {
        return Err(
            "Ngân sách và chi phí phải nằm trong khoảng 0 đến 1.000.000.000.000 VNĐ.".to_owned(),
        );
    }
    if !kpi_score.is_finite() || !(0.0..=100.0).contains(&kpi_score) {
        return Err("Điểm KPI phải là số hữu hạn trong khoảng 0 đến 100.".to_owned());
    }
    Ok(PlanReportWriteInput {
        period: period.to_owned(),
        department: department.trim().to_owned(),
        leader: leader.trim().to_owned(),
        total_plans,
        completed_plans,
        approved_budget,
        actual_spent,
        kpi_score,
    })
}

fn is_valid_period(period: &str) -> bool {
    if period.len() == 4 && period.bytes().all(|byte| byte.is_ascii_digit()) {
        return period
            .parse::<i32>()
            .is_ok_and(|year| (2000..=2100).contains(&year));
    }
    let Some((quarter, year)) = period.split_once('/') else {
        return false;
    };
    matches!(quarter, "Q1" | "Q2" | "Q3" | "Q4")
        && year.len() == 4
        && year
            .parse::<i32>()
            .is_ok_and(|year| (2000..=2100).contains(&year))
}

fn sum_i64(values: impl Iterator<Item = i64>) -> i64 {
    values.fold(0_i64, i64::saturating_add)
}

fn average_kpi(reports: &[PlanReportEntry]) -> Option<f64> {
    if reports.is_empty() {
        return None;
    }
    Some(reports.iter().map(|report| report.kpi_score).sum::<f64>() / reports.len() as f64)
}

fn completion_percent(report: &PlanReportEntry) -> i64 {
    if report.total_plans <= 0 {
        return 0;
    }
    (report.completed_plans.saturating_mul(100) / report.total_plans).clamp(0, 100)
}

fn format_currency(value: i64) -> String {
    let digits = value.saturating_abs().to_string();
    let mut output = String::with_capacity(digits.len() + digits.len() / 3);
    if value < 0 {
        output.push('-');
    }
    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index) % 3 == 0 {
            output.push('.');
        }
        output.push(digit);
    }
    format!("{output} ₫")
}

fn variance_label(variance: i64) -> String {
    if variance < 0 {
        format!("Tiết kiệm {}", format_currency(variance.saturating_abs()))
    } else if variance == 0 {
        "Đúng ngân sách (theo số tự báo cáo)".to_owned()
    } else {
        format!("Vượt {}", format_currency(variance))
    }
}

fn format_kpi(score: f64) -> String {
    if score.fract() == 0.0 {
        format!("{score:.0}")
    } else {
        format!("{score:.1}")
    }
}

fn evaluation_color(evaluation: &str) -> Color32 {
    match evaluation {
        "Xuất sắc" => Color32::from_rgb(22, 163, 74),
        "Cần cải thiện" => Color32::DARK_RED,
        _ => Color32::from_rgb(37, 99, 235),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn report(score: f64, budget: i64) -> PlanReportEntry {
        PlanReportEntry {
            key: "report-1".to_owned(),
            period: "Q3/2026".to_owned(),
            department: "Khối Kỹ thuật".to_owned(),
            leader: "Nguyễn An".to_owned(),
            total_plans: 4,
            completed_plans: 3,
            approved_budget: budget,
            actual_spent: 950_000_000,
            variance: -50_000_000,
            kpi_score: score,
            evaluation: "Xuất sắc".to_owned(),
            created_by_user_id: "admin".to_owned(),
            created_by_name: "Admin".to_owned(),
            created_at: String::new(),
            updated_by_user_id: "admin".to_owned(),
            updated_by_name: "Admin".to_owned(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn filters_use_reported_kpi_and_budget_and_search_unit_fields() {
        let item = report(95.0, 1_000_000_000);
        assert!(report_matches(&item, "kỹ thuật", "excellent"));
        assert!(!report_matches(&item, "nguyễn an", "good"));
        assert!(report_matches(&item, "", "top_budget"));
        assert!(report_matches(&item, "xuất sắc", "all"));
        assert!(!report_matches(&item, "", "good"));
        assert!(report_matches(&report(94.9, 10), "", "good"));
    }

    #[test]
    fn write_form_validates_real_required_fields_and_numeric_ranges() {
        let valid = build_write_input(
            "Q3/2026",
            "Khối Kỹ thuật",
            "Nguyễn An",
            "4",
            "3",
            "1000000000",
            "950000000",
            "96.5",
        );
        assert!(valid.is_ok());
        assert!(
            build_write_input("Q5/2026", "Khối", "Lãnh đạo", "4", "3", "100", "90", "95").is_err()
        );
        assert!(
            build_write_input("2026", "Khối", "Lãnh đạo", "2", "3", "100", "90", "95").is_err()
        );
        assert!(
            build_write_input("2026", "Khối", "Lãnh đạo", "4", "3", "100", "90", "NaN").is_err()
        );
    }

    #[test]
    fn summary_math_and_currency_format_are_data_backed() {
        assert_eq!(average_kpi(&[]), None);
        assert_eq!(
            average_kpi(&[report(90.0, 1), report(100.0, 1)]),
            Some(95.0)
        );
        assert_eq!(format_currency(1_500_000_000), "1.500.000.000 ₫");
        assert_eq!(variance_label(-50_000_000), "Tiết kiệm 50.000.000 ₫");
        assert_eq!(variance_label(0), "Đúng ngân sách (theo số tự báo cáo)");
        assert_eq!(variance_label(10), "Vượt 10 ₫");
        assert_eq!(completion_percent(&report(90.0, 1)), 75);
        let mut invalid_legacy_row = report(90.0, 1);
        invalid_legacy_row.total_plans = 0;
        assert_eq!(completion_percent(&invalid_legacy_row), 0);
    }
}
