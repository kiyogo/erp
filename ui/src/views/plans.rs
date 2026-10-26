use std::time::Duration;

use crate::{
    api::{ApiClient, ApiTask, CreateStrategicPlanInput, StrategicPlan, StrategicPlansResponse},
    models::Session,
    widgets::{self, Metric, TableColumn, TagTone},
};
use egui::{Color32, RichText, Ui};

const PRIORITIES: &[&str] = &["Chiến lược cấp 1", "Trọng điểm cấp 2", "Thường xuyên"];

#[derive(Default)]
pub struct PlansView {
    plans: Vec<StrategicPlan>,
    pending_list: Option<ApiTask<StrategicPlansResponse>>,
    pending_create: Option<ApiTask<StrategicPlan>>,
    pending_complete: Option<(String, ApiTask<StrategicPlan>)>,
    loaded_for: Option<String>,
    needs_reload: bool,
    search: String,
    page: usize,
    page_size: usize,
    create_open: bool,
    code: String,
    name: String,
    department: String,
    start_date: String,
    end_date: String,
    budget: String,
    manager: String,
    priority: String,
    notice: String,
    error: String,
}

impl PlansView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn clear_account_state(&mut self) {
        self.plans.clear();
        self.pending_list = None;
        self.pending_create = None;
        self.pending_complete = None;
        self.needs_reload = true;
        self.search.clear();
        self.page = 0;
        self.page_size = 10;
        self.create_open = false;
        self.code.clear();
        self.name.clear();
        self.department.clear();
        self.start_date.clear();
        self.end_date.clear();
        self.budget.clear();
        self.manager.clear();
        self.notice.clear();
        self.error.clear();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.clear_account_state();
            self.loaded_for = Some(session.user.id.clone());
        }
        if self.needs_reload
            && self.pending_list.is_none()
            && self.pending_create.is_none()
            && self.pending_complete.is_none()
        {
            self.pending_list = Some(api.list_strategic_plans_task(session));
            self.needs_reload = false;
        }
        if let Some(result) = self.pending_list.as_ref().and_then(ApiClient::poll) {
            self.pending_list = None;
            match result {
                Ok(response) => {
                    self.plans = response.data;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_create.as_ref().and_then(ApiClient::poll) {
            self.pending_create = None;
            match result {
                Ok(plan) => {
                    self.upsert(plan.clone());
                    self.create_open = false;
                    self.clear_form();
                    self.notice = format!("Đã lập kế hoạch {}.", plan.code);
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        let completed = self
            .pending_complete
            .as_ref()
            .and_then(|(_, task)| ApiClient::poll(task));
        if let Some(result) = completed {
            self.pending_complete = None;
            match result {
                Ok(plan) => {
                    self.upsert(plan.clone());
                    self.notice = format!("Đã đánh dấu kế hoạch {} hoàn thành.", plan.code);
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if self.pending_list.is_some()
            || self.pending_create.is_some()
            || self.pending_complete.is_some()
        {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.poll(ctx, session, api);
        let unknown = self.pending_list.is_some() && self.plans.is_empty()
            || !self.error.is_empty() && self.plans.is_empty();
        widgets::metrics_grid(
            ui,
            "plans.kpi",
            &[
                Metric {
                    label: "Tổng kế hoạch chiến lược đang thực hiện",
                    value: if unknown {
                        "—".into()
                    } else {
                        format!("{} kế hoạch", self.plans.len())
                    },
                    detail: "",
                    color: crate::theme::PRIMARY,
                    value_size: 20.0,
                },
                Metric {
                    label: "Tổng ngân sách đầu tư phê duyệt",
                    value: if unknown {
                        "—".into()
                    } else {
                        format_currency(total_plan_budget(&self.plans))
                    },
                    detail: "",
                    color: Color32::from_rgb(46, 125, 50),
                    value_size: 20.0,
                },
                Metric {
                    label: "Tỷ lệ bám sát tiến độ OKR",
                    value: "Chưa xác định".into(),
                    detail: "Chưa có API tổng hợp tỷ lệ OKR",
                    color: Color32::from_rgb(21, 101, 192),
                    value_size: 20.0,
                },
            ],
            egui::vec2(16.0, 12.0),
            240.0,
            4.0,
        );
        ui.add_space(14.0);
        let toolbar = widgets::filter_toolbar_with_more(
            ui,
            "plans",
            &[],
            0,
            &mut self.search,
            "Tìm theo tên kế hoạch, mã, đơn vị phụ trách, chủ nhiệm...",
            "Lập kế hoạch mới",
            false,
            usize::MAX,
            |ui| {
                ui.add_enabled(false, egui::Button::new("Xuất Excel"))
                    .on_disabled_hover_text("Chưa có bộ tạo tệp Excel.");
            },
        );
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
                ui.label("Đang tải kế hoạch…");
            });
        }
        let query = self.search.trim().to_lowercase();
        let filtered = self
            .plans
            .iter()
            .filter(|plan| plan_matches_search(plan, &query))
            .cloned()
            .collect::<Vec<_>>();
        if self.page_size == 0 {
            self.page_size = 10;
        }
        self.page = self
            .page
            .min(filtered.len().div_ceil(self.page_size).max(1) - 1);
        let rows = filtered
            .iter()
            .skip(self.page * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        widgets::table_with_row_height(
            ui,
            "plans.table",
            &[
                TableColumn {
                    title: "Mã kế hoạch",
                    width: 150.0,
                },
                TableColumn {
                    title: "Tên kế hoạch chiến lược",
                    width: 350.0,
                },
                TableColumn {
                    title: "Cấp ưu tiên",
                    width: 170.0,
                },
                TableColumn {
                    title: "Thời gian thực hiện",
                    width: 210.0,
                },
                TableColumn {
                    title: "Ngân sách phê duyệt",
                    width: 180.0,
                },
                TableColumn {
                    title: "Trạng thái",
                    width: 160.0,
                },
                TableColumn {
                    title: "Thao tác",
                    width: 140.0,
                },
            ],
            rows.len(),
            68.0,
            |ui, row, col| {
                let plan = rows[row];
                match col {
                    0 => {
                        ui.label(RichText::new(&plan.code).color(crate::theme::PRIMARY));
                    }
                    1 => {
                        ui.label(&plan.name);
                        ui.label(
                            RichText::new(format!(
                                "Khối phụ trách: {} · Chủ nhiệm: {}",
                                plan.department, plan.manager
                            ))
                            .size(11.5)
                            .color(Color32::from_rgb(21, 101, 192)),
                        );
                    }
                    2 => widgets::tag(
                        ui,
                        &plan.priority,
                        if plan.priority == PRIORITIES[0] {
                            TagTone::Error
                        } else if PRIORITIES.contains(&plan.priority.as_str()) {
                            TagTone::Warning
                        } else {
                            TagTone::Neutral
                        },
                    ),
                    3 => {
                        ui.small(format!("{} ➔ {}", plan.start_date, plan.end_date));
                    }
                    4 => {
                        ui.colored_label(
                            Color32::from_rgb(46, 125, 50),
                            format_currency(plan.budget),
                        );
                    }
                    5 => widgets::tag(
                        ui,
                        &plan.status,
                        if plan.status == "Đã hoàn thành" {
                            TagTone::Success
                        } else if plan.status == "Đang triển khai" || plan.status == "Đã phê duyệt"
                        {
                            TagTone::Processing
                        } else {
                            TagTone::Neutral
                        },
                    ),
                    _ => {
                        if plan.status != "Đã hoàn thành"
                            && ui
                                .add_enabled(
                                    self.pending_complete.is_none() && self.pending_list.is_none(),
                                    egui::Button::new("Hoàn thành"),
                                )
                                .clicked()
                        {
                            self.pending_complete = Some((
                                plan.key.clone(),
                                api.complete_strategic_plan_task(session, &plan.key),
                            ));
                        }
                    }
                }
            },
        );
        ui.add_space(8.0);
        ui.small(format!("Tổng số {} kế hoạch chiến lược", filtered.len()));
        widgets::pagination(
            ui,
            "plans.pagination",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );
        if self.create_open {
            self.render_create(ctx, session, api);
        }
    }

    fn render_create(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let busy = self.pending_create.is_some();
        let (_, close) = widgets::modal(
            ctx,
            "plans.create",
            "Lập kế hoạch chiến lược mới",
            520.0,
            busy,
            |ui| {
                ui.add_space(16.0);
                if ui.available_width() >= 420.0 {
                    ui.columns(2, |cols| {
                        widgets::form_input(
                            &mut cols[0],
                            "plan.code",
                            "Mã kế hoạch",
                            true,
                            &mut self.code,
                            "",
                            false,
                        );
                        widgets::form_select(
                            &mut cols[1],
                            "plan.priority",
                            "Cấp độ ưu tiên",
                            true,
                            &mut self.priority,
                            PRIORITIES,
                        );
                    });
                } else {
                    widgets::form_input(
                        ui,
                        "plan.code",
                        "Mã kế hoạch",
                        true,
                        &mut self.code,
                        "",
                        false,
                    );
                    widgets::form_select(
                        ui,
                        "plan.priority",
                        "Cấp độ ưu tiên",
                        true,
                        &mut self.priority,
                        PRIORITIES,
                    );
                }
                widgets::form_input(
                    ui,
                    "plan.name",
                    "Tên kế hoạch chiến lược",
                    true,
                    &mut self.name,
                    "Nhập tên kế hoạch",
                    false,
                );
                widgets::form_input(
                    ui,
                    "plan.department",
                    "Khối phụ trách",
                    true,
                    &mut self.department,
                    "",
                    false,
                );
                widgets::form_input(
                    ui,
                    "plan.manager",
                    "Chủ nhiệm kế hoạch",
                    true,
                    &mut self.manager,
                    "",
                    false,
                );
                if ui.available_width() >= 420.0 {
                    ui.columns(2, |cols| {
                        widgets::form_date(
                            &mut cols[0],
                            "plan.start",
                            "Ngày bắt đầu",
                            true,
                            &mut self.start_date,
                        );
                        widgets::form_date(
                            &mut cols[1],
                            "plan.end",
                            "Ngày kết thúc",
                            true,
                            &mut self.end_date,
                        );
                    });
                } else {
                    widgets::form_date(
                        ui,
                        "plan.start",
                        "Ngày bắt đầu",
                        true,
                        &mut self.start_date,
                    );
                    widgets::form_date(ui, "plan.end", "Ngày kết thúc", true, &mut self.end_date);
                }
                widgets::form_input(
                    ui,
                    "plan.budget",
                    "Ngân sách dự kiến (VNĐ)",
                    true,
                    &mut self.budget,
                    "0",
                    false,
                );
                let parsed = self.create_input();
                if let Err(error) = &parsed {
                    ui.colored_label(Color32::DARK_RED, error);
                }
                if !self.error.is_empty() {
                    ui.colored_label(Color32::DARK_RED, &self.error);
                }
                ui.add_space(20.0);
                widgets::action_row(ui, |ui| {
                    if ui
                        .add_enabled(
                            parsed.is_ok(),
                            egui::Button::new("Xác nhận lập kế hoạch").fill(crate::theme::PRIMARY),
                        )
                        .clicked()
                    {
                        if let Ok(input) = parsed {
                            self.pending_create =
                                Some(api.create_strategic_plan_task(session, &input));
                            self.error.clear();
                        }
                    }
                    if ui.button("Hủy").clicked() {
                        self.create_open = false;
                    }
                });
            },
        );
        if close {
            self.create_open = false;
        }
    }

    fn create_input(&self) -> Result<CreateStrategicPlanInput, String> {
        if [&self.code, &self.name, &self.department, &self.manager]
            .iter()
            .any(|value| value.trim().is_empty())
        {
            return Err("Nhập đầy đủ mã, tên kế hoạch, khối phụ trách và chủ nhiệm.".into());
        }
        let start = chrono::NaiveDate::parse_from_str(self.start_date.trim(), "%Y-%m-%d")
            .map_err(|_| "Ngày bắt đầu không hợp lệ.")?;
        let end = chrono::NaiveDate::parse_from_str(self.end_date.trim(), "%Y-%m-%d")
            .map_err(|_| "Ngày kết thúc không hợp lệ.")?;
        if end < start {
            return Err("Ngày kết thúc phải từ ngày bắt đầu trở đi.".into());
        }
        let budget = self
            .budget
            .trim()
            .parse::<i64>()
            .map_err(|_| "Ngân sách phải là số nguyên không âm.")?;
        if budget < 0 {
            return Err("Ngân sách phải là số nguyên không âm.".into());
        }
        if !PRIORITIES.contains(&self.priority.as_str()) {
            return Err("Chọn cấp độ ưu tiên hợp lệ.".into());
        }
        Ok(CreateStrategicPlanInput {
            code: self.code.trim().into(),
            name: self.name.trim().into(),
            department: self.department.trim().into(),
            start_date: self.start_date.trim().into(),
            end_date: self.end_date.trim().into(),
            budget,
            manager: self.manager.trim().into(),
            priority: self.priority.clone(),
        })
    }

    fn init_new_form(&mut self) {
        let year = chrono::Utc::now().format("%Y").to_string();
        self.code = format!("KH-{year}-{:02}", self.plans.len() + 1);
        self.name.clear();
        self.department.clear();
        self.start_date = format!("{year}-01-01");
        self.end_date = format!("{year}-12-31");
        self.budget.clear();
        self.manager.clear();
        self.priority = PRIORITIES[0].to_owned();
        self.error.clear();
    }

    fn clear_form(&mut self) {
        self.code.clear();
        self.name.clear();
        self.department.clear();
        self.start_date.clear();
        self.end_date.clear();
        self.budget.clear();
        self.manager.clear();
    }

    fn upsert(&mut self, plan: StrategicPlan) {
        self.plans.retain(|current| current.key != plan.key);
        self.plans.insert(0, plan);
    }
}

fn format_currency(value: i64) -> String {
    let digits = value.max(0).to_string();
    let mut formatted = String::with_capacity(digits.len() + digits.len() / 3);
    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index) % 3 == 0 {
            formatted.push('.');
        }
        formatted.push(digit);
    }
    format!("{formatted} ₫")
}

fn total_plan_budget(plans: &[StrategicPlan]) -> i64 {
    plans
        .iter()
        .fold(0_i64, |total, plan| total.saturating_add(plan.budget))
}

fn plan_matches_search(plan: &StrategicPlan, query: &str) -> bool {
    query.is_empty()
        || [
            plan.code.as_str(),
            plan.name.as_str(),
            plan.department.as_str(),
            plan.manager.as_str(),
        ]
        .iter()
        .any(|value| value.to_lowercase().contains(query))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plan() -> StrategicPlan {
        StrategicPlan {
            key: "p-1".to_owned(),
            code: "KH-2026-01".to_owned(),
            name: "Mở rộng hạ tầng".to_owned(),
            department: "Khối Kỹ thuật".to_owned(),
            start_date: "2026-01-01".to_owned(),
            end_date: "2026-12-31".to_owned(),
            budget: 1_500_000_000,
            manager: "Người phụ trách".to_owned(),
            priority: "Chiến lược cấp 1".to_owned(),
            status: "Đang triển khai".to_owned(),
        }
    }

    #[test]
    fn search_includes_code_name_department_and_manager() {
        let plan = plan();
        for query in ["kh-2026", "hạ tầng", "kỹ thuật", "phụ trách"] {
            assert!(plan_matches_search(&plan, query));
        }
        assert!(!plan_matches_search(&plan, "không có"));
        assert!(plan_matches_search(&plan, ""));
    }

    #[test]
    fn currency_summary_is_vietnamese_and_not_a_sample_kpi() {
        assert_eq!(format_currency(1_500_000_000), "1.500.000.000 ₫");
        assert_eq!(format_currency(0), "0 ₫");
    }

    #[test]
    fn total_budget_saturates_instead_of_overflowing() {
        let mut first = plan();
        first.budget = i64::MAX;
        let second = plan();
        assert_eq!(total_plan_budget(&[first, second]), i64::MAX);
    }
    #[test]
    fn create_rejects_missing_dates_negative_budget_and_reversed_range() {
        let mut view = PlansView::default();
        view.code = "KH-1".into();
        view.name = "Kế hoạch".into();
        view.department = "Đơn vị".into();
        view.manager = "Phụ trách".into();
        view.priority = PRIORITIES[0].into();
        view.start_date = "2026-10-01".into();
        view.end_date = "2026-12-31".into();
        view.budget = "0".into();
        assert!(view.create_input().is_ok());
        view.budget = "-1".into();
        assert!(view.create_input().is_err());
        view.budget = "100".into();
        view.end_date = "2026-09-30".into();
        assert!(view.create_input().is_err());
        view.end_date.clear();
        assert!(view.create_input().is_err());
    }
}
