use std::time::Duration;

use chrono::Datelike;
use egui::{Color32, RichText, Ui};

use crate::{
    api::{
        ApiClient, ApiTask, CreateStrategicMilestoneInput, StrategicMilestone,
        StrategicMilestonesResponse,
    },
    models::Session,
    widgets::{self, Metric, TableColumn, TagTone},
};

const ACHIEVED: &str = "Đã đạt mốc";
const QUARTERS: [&str; 4] = ["Q1", "Q2", "Q3", "Q4"];

#[derive(Default)]
pub struct PlanMilestonesView {
    milestones: Vec<StrategicMilestone>,
    pending_list: Option<ApiTask<StrategicMilestonesResponse>>,
    pending_create: Option<ApiTask<StrategicMilestone>>,
    pending_achieve: Option<ApiTask<StrategicMilestone>>,
    loaded_for: Option<String>,
    needs_reload: bool,
    search: String,
    filter: String,
    page: usize,
    page_size: usize,
    create_open: bool,
    detail_key: Option<String>,
    code: String,
    quarter: String,
    name: String,
    acceptance_criteria: String,
    owner: String,
    deadline: String,
    notice: String,
    error: String,
}

impl PlanMilestonesView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn clear_account_state(&mut self) {
        self.milestones.clear();
        self.pending_list = None;
        self.pending_create = None;
        self.pending_achieve = None;
        self.needs_reload = true;
        self.search.clear();
        self.filter = "all".to_owned();
        self.page = 0;
        self.page_size = 8;
        self.create_open = false;
        self.detail_key = None;
        self.code.clear();
        self.quarter.clear();
        self.name.clear();
        self.acceptance_criteria.clear();
        self.owner.clear();
        self.deadline.clear();
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
            && self.pending_achieve.is_none()
        {
            self.pending_list = Some(api.list_strategic_milestones_task(session));
            self.needs_reload = false;
        }
        if let Some(result) = self.pending_list.as_ref().and_then(ApiClient::poll) {
            self.pending_list = None;
            match result {
                Ok(response) => {
                    self.milestones = response.data;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_create.as_ref().and_then(ApiClient::poll) {
            self.pending_create = None;
            match result {
                Ok(milestone) => {
                    self.upsert(milestone.clone());
                    self.create_open = false;
                    self.clear_form();
                    self.notice = format!("Đã thêm mốc {}.", milestone.code);
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_achieve.as_ref().and_then(ApiClient::poll) {
            self.pending_achieve = None;
            match result {
                Ok(milestone) => {
                    self.upsert(milestone.clone());
                    self.notice = format!("Đã nghiệm thu mốc {}.", milestone.code);
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if self.pending_list.is_some()
            || self.pending_create.is_some()
            || self.pending_achieve.is_some()
        {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.poll(ctx, session, api);
        let achieved = self
            .milestones
            .iter()
            .filter(|item| item.status == ACHIEVED)
            .count();
        let running = self
            .milestones
            .iter()
            .filter(|item| item.status == "Đang thực hiện")
            .count();
        let unknown =
            self.milestones.is_empty() && (self.pending_list.is_some() || !self.error.is_empty());
        widgets::metrics(
            ui,
            "milestones.kpi",
            &[
                Metric {
                    label: "Mốc chiến lược",
                    value: if unknown {
                        "—".into()
                    } else {
                        format!("{} mốc trọng điểm", self.milestones.len())
                    },
                    detail: "Theo các kỳ đã lưu",
                    color: crate::theme::PRIMARY,
                    value_size: 24.0,
                },
                Metric {
                    label: "Đã nghiệm thu hoàn thành 100%",
                    value: if unknown {
                        "—".into()
                    } else {
                        format!("{achieved} mốc hoàn tất")
                    },
                    detail: "Theo trạng thái nghiệm thu đã lưu",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 24.0,
                },
                Metric {
                    label: "Đang trong lộ trình triển khai",
                    value: if unknown {
                        "—".into()
                    } else {
                        format!("{running} mốc chiến lược")
                    },
                    detail: "Theo trạng thái đã lưu",
                    color: Color32::from_rgb(234, 88, 12),
                    value_size: 24.0,
                },
                Metric {
                    label: "Tỷ lệ đạt mục tiêu OKR quý",
                    value: "Chưa xác định".into(),
                    detail: "Chưa có API tổng hợp OKR theo quý",
                    color: Color32::from_rgb(30, 64, 175),
                    value_size: 24.0,
                },
            ],
        );
        ui.add_space(16.0);
        let mut filters = vec!["all".to_owned()];
        filters.extend(self.available_quarters());
        filters.push("done".into());
        let labels = filters
            .iter()
            .map(|value| filter_label(value))
            .collect::<Vec<_>>();
        let selected = filters
            .iter()
            .position(|value| value == &self.filter)
            .unwrap_or(0);
        let toolbar = widgets::filter_toolbar_with_more(
            ui,
            "milestones",
            &labels,
            selected,
            &mut self.search,
            "Tìm theo mốc, tiêu chuẩn, người phụ trách...",
            "Thêm mốc quan trọng",
            false,
            usize::MAX,
            |ui| {
                ui.add_enabled(false, egui::Button::new("In Biên Bản (A4)"))
                    .on_disabled_hover_text("Chưa có bộ tạo biên bản nghiệm thu.");
            },
        );
        if let Some(index) = toolbar.selected {
            self.filter = filters[index].clone();
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
                ui.label("Đang tải mốc kế hoạch…");
            });
        }
        let query = self.search.trim().to_lowercase();
        let filtered = self
            .milestones
            .iter()
            .filter(|item| milestone_matches(item, &query, &self.filter))
            .cloned()
            .collect::<Vec<_>>();
        if self.page_size == 0 {
            self.page_size = 8;
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
            "milestones.table",
            &[
                TableColumn {
                    title: "Mã mốc",
                    width: 140.0,
                },
                TableColumn {
                    title: "Kỳ / Quý",
                    width: 110.0,
                },
                TableColumn {
                    title: "Tên mốc quan trọng & Tiêu chuẩn nghiệm thu",
                    width: 380.0,
                },
                TableColumn {
                    title: "Người phụ trách",
                    width: 180.0,
                },
                TableColumn {
                    title: "Hạn hoàn thành",
                    width: 130.0,
                },
                TableColumn {
                    title: "Trạng thái",
                    width: 150.0,
                },
                TableColumn {
                    title: "Thao tác",
                    width: 190.0,
                },
            ],
            rows.len(),
            |ui, row, col| {
                let item = rows[row];
                match col {
                    0 => {
                        ui.label(
                            RichText::new(&item.code)
                                .monospace()
                                .color(crate::theme::PRIMARY),
                        );
                    }
                    1 => widgets::tag(ui, &item.quarter, TagTone::Processing),
                    2 => {
                        ui.label(&item.name);
                        ui.label(
                            RichText::new(format!("Tiêu chuẩn: {}", item.acceptance_criteria))
                                .size(12.0)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                    }
                    3 => {
                        ui.colored_label(Color32::from_rgb(30, 64, 175), &item.owner);
                    }
                    4 => {
                        ui.small(&item.deadline);
                    }
                    5 => widgets::tag(
                        ui,
                        &item.status,
                        if item.status == ACHIEVED {
                            TagTone::Success
                        } else if item.status == "Đang thực hiện" {
                            TagTone::Warning
                        } else {
                            TagTone::Neutral
                        },
                    ),
                    _ => {
                        ui.horizontal(|ui| {
                            if ui.button("Chi tiết").clicked() {
                                self.detail_key = Some(item.key.clone());
                            }
                            if item.status != ACHIEVED
                                && ui
                                    .add_enabled(
                                        self.pending_achieve.is_none()
                                            && self.pending_list.is_none(),
                                        egui::Button::new("Nghiệm thu"),
                                    )
                                    .clicked()
                            {
                                self.pending_achieve =
                                    Some(api.achieve_strategic_milestone_task(session, &item.key));
                            }
                        });
                    }
                }
            },
        );
        ui.add_space(8.0);
        widgets::pagination(
            ui,
            "milestones.pagination",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );
        self.render_detail(ctx, session, api);
        if self.create_open {
            self.render_create(ctx, session, api);
        }
    }

    fn render_create(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let (_, close) = widgets::modal(
            ctx,
            "milestones.create",
            "Thêm mới mốc quan trọng (Milestone)",
            540.0,
            self.pending_create.is_some(),
            |ui| {
                ui.add_space(14.0);
                let quarters = current_year_quarters();
                let options = quarters.iter().map(String::as_str).collect::<Vec<_>>();
                if ui.available_width() >= 420.0 {
                    ui.columns(2, |cols| {
                        widgets::form_input(
                            &mut cols[0],
                            "milestone.code",
                            "Mã mốc",
                            true,
                            &mut self.code,
                            "",
                            false,
                        );
                        widgets::form_select(
                            &mut cols[1],
                            "milestone.quarter",
                            "Kỳ / Quý",
                            true,
                            &mut self.quarter,
                            &options,
                        );
                    });
                } else {
                    widgets::form_input(
                        ui,
                        "milestone.code",
                        "Mã mốc",
                        true,
                        &mut self.code,
                        "",
                        false,
                    );
                    widgets::form_select(
                        ui,
                        "milestone.quarter",
                        "Kỳ / Quý",
                        true,
                        &mut self.quarter,
                        &options,
                    );
                }
                widgets::form_input(
                    ui,
                    "milestone.name",
                    "Tên mốc quan trọng",
                    true,
                    &mut self.name,
                    "",
                    false,
                );
                widgets::form_textarea(
                    ui,
                    "milestone.criteria",
                    "Tiêu chuẩn nghiệm thu",
                    true,
                    &mut self.acceptance_criteria,
                    "Điều kiện để được xem là hoàn thành mốc...",
                    3,
                );
                widgets::form_input(
                    ui,
                    "milestone.owner",
                    "Người phụ trách",
                    true,
                    &mut self.owner,
                    "",
                    false,
                );
                widgets::form_date(
                    ui,
                    "milestone.deadline",
                    "Hạn chót hoàn thành",
                    true,
                    &mut self.deadline,
                );
                let valid = [
                    &self.code,
                    &self.name,
                    &self.acceptance_criteria,
                    &self.owner,
                ]
                .iter()
                .all(|value| !value.trim().is_empty())
                    && chrono::NaiveDate::parse_from_str(self.deadline.trim(), "%Y-%m-%d").is_ok()
                    && quarters.contains(&self.quarter);
                if !self.error.is_empty() {
                    ui.colored_label(Color32::DARK_RED, &self.error);
                }
                ui.add_space(18.0);
                widgets::action_row(ui, |ui| {
                    if ui
                        .add_enabled(
                            valid,
                            egui::Button::new("Tạo mốc quan trọng").fill(crate::theme::PRIMARY),
                        )
                        .clicked()
                    {
                        self.pending_create = Some(api.create_strategic_milestone_task(
                            session,
                            &CreateStrategicMilestoneInput {
                                code: self.code.trim().into(),
                                quarter: self.quarter.clone(),
                                name: self.name.trim().into(),
                                acceptance_criteria: self.acceptance_criteria.trim().into(),
                                owner: self.owner.trim().into(),
                                deadline: self.deadline.trim().into(),
                            },
                        ));
                        self.error.clear();
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

    fn render_detail(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let Some(item) = self
            .milestones
            .iter()
            .find(|item| self.detail_key.as_deref() == Some(item.key.as_str()))
            .cloned()
        else {
            self.detail_key = None;
            return;
        };
        let (_, close) = widgets::drawer(
            ctx,
            "milestones.detail",
            "Chi Tiết Mốc Chiến Lược & Nghiệm Thu",
            520.0,
            |ui| {
                egui::Frame::none()
                    .fill(Color32::from_rgb(248, 250, 252))
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                    .rounding(8.0)
                    .inner_margin(16.0)
                    .show(ui, |ui| {
                        ui.colored_label(crate::theme::PRIMARY, format!("MÃ MỐC: {}", item.code));
                        ui.label(RichText::new(&item.name).size(17.0).strong());
                        ui.small(format!(
                            "Kỳ: {} · Hạn chót: {}",
                            item.quarter, item.deadline
                        ));
                    });
                ui.add_space(16.0);
                egui::Frame::group(ui.style())
                    .inner_margin(14.0)
                    .show(ui, |ui| {
                        ui.strong("Tiêu Chuẩn Nghiệm Thu & Nhân Sự");
                        ui.label(format!("Người phụ trách chính: {}", item.owner));
                        widgets::tag(
                            ui,
                            &item.status,
                            if item.status == ACHIEVED {
                                TagTone::Success
                            } else {
                                TagTone::Warning
                            },
                        );
                        ui.label(format!("Tiến độ: {}%", item.progress));
                        ui.label("Tiêu chuẩn đánh giá:");
                        ui.label(&item.acceptance_criteria);
                    });
                if !self.error.is_empty() {
                    ui.colored_label(Color32::DARK_RED, &self.error);
                }
                ui.add_space(16.0);
                ui.horizontal_wrapped(|ui| {
                    if item.status != ACHIEVED
                        && ui
                            .add_enabled(
                                self.pending_achieve.is_none() && self.pending_list.is_none(),
                                egui::Button::new("Xác nhận đạt mốc"),
                            )
                            .clicked()
                    {
                        self.pending_achieve =
                            Some(api.achieve_strategic_milestone_task(session, &item.key));
                    }
                    ui.add_enabled(false, egui::Button::new("In Biên Bản (A4)"))
                        .on_disabled_hover_text("Chưa có bộ tạo tài liệu nghiệm thu.");
                });
                ui.small("Biên bản A4 chưa được kết nối.");
            },
        );
        if close {
            self.detail_key = None;
        }
    }

    fn init_new_form(&mut self) {
        let now = chrono::Utc::now().date_naive();
        let year = now.year();
        let quarter_number = ((now.month() - 1) / 3 + 1) as u8;
        self.quarter = format!("Q{quarter_number}/{year}");
        self.code = format!(
            "MLS-Q{quarter_number}-{year}-{:02}",
            self.milestones.len() + 1
        );
        self.name.clear();
        self.acceptance_criteria.clear();
        self.owner.clear();
        let end_month = quarter_number * 3;
        let last_day = chrono::NaiveDate::from_ymd_opt(year, u32::from(end_month), 1)
            .and_then(|date| date.checked_add_months(chrono::Months::new(1)))
            .and_then(|date| date.pred_opt())
            .unwrap_or(now);
        self.deadline = last_day.format("%Y-%m-%d").to_string();
        self.error.clear();
    }

    fn clear_form(&mut self) {
        self.code.clear();
        self.quarter.clear();
        self.name.clear();
        self.acceptance_criteria.clear();
        self.owner.clear();
        self.deadline.clear();
    }

    fn available_quarters(&self) -> Vec<String> {
        let mut quarters = self
            .milestones
            .iter()
            .map(|item| item.quarter.clone())
            .collect::<Vec<_>>();
        quarters.extend(current_year_quarters());
        quarters.sort();
        quarters.dedup();
        quarters
    }

    fn upsert(&mut self, milestone: StrategicMilestone) {
        self.milestones
            .retain(|current| current.key != milestone.key);
        self.milestones.insert(0, milestone);
    }
}

fn current_year_quarters() -> Vec<String> {
    let year = chrono::Utc::now().year();
    QUARTERS
        .iter()
        .map(|quarter| format!("{quarter}/{year}"))
        .collect()
}

fn filter_label(filter: &str) -> &str {
    match filter {
        "all" => "Tất cả các mốc",
        "done" => "Đã nghiệm thu",
        _ => filter,
    }
}

fn milestone_matches(milestone: &StrategicMilestone, query: &str, filter: &str) -> bool {
    let filter_matches = match filter {
        "all" => true,
        "done" => milestone.status == ACHIEVED,
        quarter => milestone.quarter == quarter,
    };
    let query_matches = query.is_empty()
        || [
            milestone.code.as_str(),
            milestone.quarter.as_str(),
            milestone.name.as_str(),
            milestone.acceptance_criteria.as_str(),
            milestone.owner.as_str(),
        ]
        .iter()
        .any(|value| value.to_lowercase().contains(query));
    filter_matches && query_matches
}

#[cfg(test)]
mod tests {
    use super::*;

    fn milestone() -> StrategicMilestone {
        StrategicMilestone {
            key: "m-1".to_owned(),
            code: "MLS-Q4-01".to_owned(),
            quarter: "Q4/2026".to_owned(),
            name: "Hoàn tất kiểm thử tải".to_owned(),
            acceptance_criteria: "Đạt 50.000 CCU".to_owned(),
            owner: "Khối Kỹ thuật".to_owned(),
            deadline: "2026-12-31".to_owned(),
            progress: 0,
            status: "Đang thực hiện".to_owned(),
        }
    }

    #[test]
    fn search_covers_legacy_milestone_fields_and_respects_quarter_and_done_filter() {
        let milestone = milestone();
        for query in ["mls-q4", "q4/2026", "kiểm thử", "50.000 ccu", "kỹ thuật"] {
            assert!(milestone_matches(&milestone, query, "all"));
        }
        assert!(milestone_matches(&milestone, "", "Q4/2026"));
        assert!(!milestone_matches(&milestone, "", "Q1/2026"));
        assert!(!milestone_matches(&milestone, "", "done"));
        assert!(!milestone_matches(&milestone, "không có", "all"));
        let mut completed = milestone;
        completed.status = ACHIEVED.to_owned();
        completed.progress = 100;
        assert!(milestone_matches(&completed, "", "done"));
    }

    #[test]
    fn account_state_clears_milestone_records_and_unsaved_details() {
        let mut view = PlanMilestonesView {
            milestones: vec![milestone()],
            search: "draft search".to_owned(),
            filter: "Q4/2026".to_owned(),
            create_open: true,
            detail_key: Some("m-1".to_owned()),
            code: "MLS-DRAFT".to_owned(),
            name: "Draft milestone".to_owned(),
            ..PlanMilestonesView::default()
        };
        view.clear_account_state();
        assert!(view.milestones.is_empty());
        assert!(view.search.is_empty());
        assert_eq!(view.filter, "all");
        assert!(!view.create_open);
        assert!(view.detail_key.is_none());
        assert!(view.code.is_empty());
        assert!(view.name.is_empty());
        assert!(view.needs_reload);
    }
}
