use std::time::Duration;

use egui::{Color32, RichText, Ui};

use crate::{
    api::{ApiClient, ApiTask, PlanProgressEntry, PlanProgressResponse, UpdatePlanProgressInput},
    models::Session,
    widgets::{self, Metric, TableColumn, TagTone},
};

const PAGE_SIZE: usize = 8;

#[derive(Default)]
pub struct PlanProgressView {
    entries: Vec<PlanProgressEntry>,
    pending_list: Option<ApiTask<PlanProgressResponse>>,
    pending_update: Option<(String, ApiTask<PlanProgressEntry>)>,
    loaded_for: Option<String>,
    needs_reload: bool,
    search: String,
    filter: String,
    page: usize,
    page_size: usize,
    edit_key: Option<String>,
    detail_key: Option<String>,
    progress_input: String,
    notice: String,
    error: String,
}

impl PlanProgressView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn clear_account_state(&mut self) {
        self.entries.clear();
        self.pending_list = None;
        self.pending_update = None;
        self.needs_reload = true;
        self.search.clear();
        self.filter = "all".to_owned();
        self.page = 0;
        self.page_size = PAGE_SIZE;
        self.edit_key = None;
        self.detail_key = None;
        self.progress_input.clear();
        self.notice.clear();
        self.error.clear();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.clear_account_state();
            self.loaded_for = Some(session.user.id.clone());
        }
        if self.needs_reload && self.pending_list.is_none() && self.pending_update.is_none() {
            self.pending_list = Some(api.list_plan_progress_task(session));
            self.needs_reload = false;
        }
        if let Some(result) = self.pending_list.as_ref().and_then(ApiClient::poll) {
            self.pending_list = None;
            match result {
                Ok(response) => {
                    self.entries = response.data;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        let updated = self
            .pending_update
            .as_ref()
            .and_then(|(_, task)| ApiClient::poll(task));
        if let Some(result) = updated {
            self.pending_update = None;
            match result {
                Ok(entry) => {
                    let title = entry.task_title.clone();
                    self.upsert(entry);
                    self.edit_key = None;
                    self.notice = format!("Đã lưu tiến độ: {title}.");
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if self.pending_list.is_some() || self.pending_update.is_some() {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.poll(ctx, session, api);
        let completed = self
            .entries
            .iter()
            .filter(|item| item.progress_percent == 100)
            .count();
        let running = self
            .entries
            .iter()
            .filter(|item| item.progress_percent < 100)
            .count();
        let unknown =
            self.entries.is_empty() && (self.pending_list.is_some() || !self.error.is_empty());
        widgets::metrics(
            ui,
            "progress.kpi",
            &[
                Metric {
                    label: "Tiến độ tổng thể toàn doanh nghiệp",
                    value: average_progress(&self.entries)
                        .map(|value| format!("{value}% hoàn thành"))
                        .unwrap_or_else(|| "—".into()),
                    detail: "Trung bình không trọng số của tiến độ đã lưu",
                    color: crate::theme::PRIMARY,
                    value_size: 24.0,
                },
                Metric {
                    label: "Hạng mục đã hoàn thành 100%",
                    value: if unknown {
                        "—".into()
                    } else {
                        format!("{completed} / {} nhiệm vụ", self.entries.len())
                    },
                    detail: "Theo tiến độ khai báo",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 24.0,
                },
                Metric {
                    label: "Hạng mục đang trong tiến trình",
                    value: if unknown {
                        "—".into()
                    } else {
                        format!("{running} nhiệm vụ")
                    },
                    detail: "Tiến độ dưới 100%",
                    color: Color32::from_rgb(30, 64, 175),
                    value_size: 24.0,
                },
                Metric {
                    label: "Tỷ lệ hoàn thành đúng thời hạn SLA",
                    value: "Chưa xác định".into(),
                    detail: "Chưa có API đối soát SLA",
                    color: Color32::from_rgb(124, 58, 237),
                    value_size: 24.0,
                },
            ],
        );
        ui.add_space(16.0);
        ui.horizontal_wrapped(|ui| {
            for (filter, label) in [
                ("all", "Tất cả nhiệm vụ"),
                ("completed", "Hoàn thành 100%"),
                ("fast", "Tiến độ cao (80–99%)"),
                ("running", "Đang triển khai (<80%)"),
            ] {
                let selected = self.filter == filter;
                if ui
                    .add(
                        egui::Button::new(label)
                            .fill(if selected {
                                Color32::from_rgb(224, 242, 241)
                            } else {
                                Color32::WHITE
                            })
                            .stroke(egui::Stroke::new(
                                1.0,
                                if selected {
                                    crate::theme::PRIMARY
                                } else {
                                    Color32::from_rgb(203, 213, 225)
                                },
                            )),
                    )
                    .clicked()
                {
                    self.filter = filter.into();
                    self.page = 0;
                }
            }
        });
        ui.add_space(10.0);
        ui.horizontal_wrapped(|ui| {
            let width = ui.available_width().min(260.0);
            let (rect, _) = ui.allocate_exact_size(egui::vec2(width, 32.0), egui::Sense::hover());
            if widgets::search_input(
                ui,
                rect,
                &mut self.search,
                "Tìm theo nhiệm vụ, kế hoạch, nhân sự...",
            )
            .changed()
            {
                self.page = 0;
            }
            ui.add_enabled(false, egui::Button::new("In Báo Cáo (A4)"))
                .on_disabled_hover_text("Chưa có bộ tạo tài liệu.");
            ui.add_enabled(false, egui::Button::new("Xuất Excel"))
                .on_disabled_hover_text("Chưa có bộ tạo tệp Excel.");
            if ui
                .add_enabled(
                    self.pending_list.is_none() && self.pending_update.is_none(),
                    egui::Button::new("Làm mới"),
                )
                .clicked()
            {
                self.needs_reload = true;
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
                ui.label("Đang tải tiến độ…");
            });
        }
        let query = self.search.trim().to_lowercase();
        let filtered = self
            .entries
            .iter()
            .filter(|item| entry_matches(item, &query, &self.filter))
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
            "progress.table",
            &[
                TableColumn {
                    title: "Mã nhiệm vụ",
                    width: 140.0,
                },
                TableColumn {
                    title: "Kế hoạch & Nhiệm vụ thực hiện",
                    width: 360.0,
                },
                TableColumn {
                    title: "Nhân sự phụ trách",
                    width: 180.0,
                },
                TableColumn {
                    title: "Tiến độ hoàn thành",
                    width: 180.0,
                },
                TableColumn {
                    title: "Hạn chót & Thời gian",
                    width: 150.0,
                },
                TableColumn {
                    title: "Trạng thái",
                    width: 140.0,
                },
                TableColumn {
                    title: "Thao tác",
                    width: 180.0,
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
                    1 => {
                        ui.label(&item.task_title);
                        ui.label(
                            RichText::new(format!(
                                "Thuộc kế hoạch: {} · Tỷ trọng: {}%",
                                item.plan_name, item.weight_percent
                            ))
                            .size(12.0)
                            .color(Color32::from_rgb(30, 64, 175)),
                        );
                    }
                    2 => {
                        ui.label(&item.assignee);
                    }
                    3 => {
                        ui.colored_label(
                            progress_color(item.progress_percent),
                            format!(
                                "{}% · {}",
                                item.progress_percent,
                                if item.progress_percent == 100 {
                                    "Xong"
                                } else {
                                    "Đang làm"
                                }
                            ),
                        );
                        ui.add(
                            egui::ProgressBar::new(
                                (item.progress_percent as f32 / 100.0).clamp(0.0, 1.0),
                            )
                            .desired_height(6.0)
                            .desired_width(150.0)
                            .fill(progress_color(item.progress_percent)),
                        );
                    }
                    4 => {
                        ui.label(&item.due_date);
                        ui.small(due_label(item));
                    }
                    5 => widgets::tag(
                        ui,
                        &item.status,
                        match item.status.as_str() {
                            "Hoàn thành" => TagTone::Success,
                            "Chậm tiến độ" => TagTone::Error,
                            "Đúng tiến độ" => TagTone::Processing,
                            _ => TagTone::Neutral,
                        },
                    ),
                    _ => {
                        ui.horizontal(|ui| {
                            if ui.button("Chi tiết").clicked() {
                                self.detail_key = Some(item.key.clone());
                            }
                            if ui
                                .add_enabled(
                                    self.pending_update.is_none() && self.pending_list.is_none(),
                                    egui::Button::new("Cập nhật %"),
                                )
                                .clicked()
                            {
                                self.progress_input = item.progress_percent.to_string();
                                self.edit_key = Some(item.key.clone());
                            }
                        });
                    }
                }
            },
        );
        ui.add_space(8.0);
        widgets::pagination(
            ui,
            "progress.pagination",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );
        self.render_detail(ctx);
        self.render_edit(ctx, session, api);
    }

    fn render_edit(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let Some(key) = self.edit_key.clone() else {
            return;
        };
        let Some(entry) = self.entries.iter().find(|entry| entry.key == key).cloned() else {
            self.edit_key = None;
            return;
        };
        let (_, close) = widgets::modal(
            ctx,
            "progress.edit",
            &format!("Cập nhật tiến độ: {}", entry.task_title),
            460.0,
            self.pending_update.is_some(),
            |ui| {
                ui.add_space(14.0);
                widgets::form_input(
                    ui,
                    "progress.percent",
                    "Phần trăm hoàn thành (%)",
                    true,
                    &mut self.progress_input,
                    "Nhập từ 0 đến 100%",
                    false,
                );
                let parsed = self.progress_input.trim().parse::<i64>();
                let progress_value = parsed.as_ref().ok().copied();
                let valid = progress_value.is_some_and(|value| (0..=100).contains(&value));
                if !valid {
                    ui.colored_label(Color32::DARK_RED, "Nhập số nguyên từ 0 đến 100.");
                }
                if !self.error.is_empty() {
                    ui.colored_label(Color32::DARK_RED, &self.error);
                }
                ui.add_space(18.0);
                widgets::action_row(ui, |ui| {
                    if ui
                        .add_enabled(
                            valid && self.pending_update.is_none(),
                            egui::Button::new("Lưu tiến độ"),
                        )
                        .clicked()
                    {
                        let progress_percent = progress_value.unwrap_or_default();
                        self.pending_update = Some((
                            entry.key.clone(),
                            api.update_plan_progress_task(
                                session,
                                &entry.key,
                                &UpdatePlanProgressInput { progress_percent },
                            ),
                        ));
                        self.error.clear();
                    }
                    if ui
                        .add_enabled(self.pending_update.is_none(), egui::Button::new("Hủy"))
                        .clicked()
                    {
                        self.edit_key = None;
                    }
                    if self.pending_update.is_some() {
                        ui.spinner();
                        ui.label("Đang lưu…");
                    }
                });
                ui.small("Khi hoàn thành 100%, trạng thái đổi thành ‘Hoàn thành’; dưới 100% theo hành vi legacy là ‘Đúng tiến độ’.");
            },
        );
        if close && self.pending_update.is_none() {
            self.edit_key = None;
        }
        if self.pending_update.is_some() {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    fn render_detail(&mut self, ctx: &egui::Context) {
        let Some(key) = self.detail_key.clone() else {
            return;
        };
        let Some(entry) = self.entries.iter().find(|entry| entry.key == key).cloned() else {
            self.detail_key = None;
            return;
        };
        let (_, close) = widgets::drawer(
            ctx,
            "progress.detail",
            "Chi Tiết Hạng Mục Kế Hoạch & Tiến Độ",
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
                            format!("MÃ NHIỆM VỤ: {}", entry.code),
                        );
                        ui.label(RichText::new(&entry.task_title).size(17.0).strong());
                        ui.small(format!("Kế hoạch liên quan: {}", entry.plan_name));
                    });
                ui.add_space(16.0);
                egui::Frame::group(ui.style())
                    .inner_margin(14.0)
                    .show(ui, |ui| {
                        ui.strong("Thông Tin Thực Hiện");
                        ui.label(format!("Nhân sự phụ trách: {}", entry.assignee));
                        ui.label(format!(
                            "Tỷ trọng trong kế hoạch: {}%",
                            entry.weight_percent
                        ));
                        ui.label(format!(
                            "Tiến độ thực tế khai báo: {}%",
                            entry.progress_percent
                        ));
                        ui.label(format!(
                            "Hạn chót hoàn thành: {} · {}",
                            entry.due_date,
                            due_label(&entry)
                        ));
                        ui.colored_label(status_color(&entry.status), &entry.status);
                    });
                ui.add_space(16.0);
                ui.horizontal_wrapped(|ui| {
                    if ui
                        .add_enabled(
                            self.pending_update.is_none() && self.pending_list.is_none(),
                            egui::Button::new("Cập nhật tiến độ %"),
                        )
                        .clicked()
                    {
                        self.progress_input = entry.progress_percent.to_string();
                        self.edit_key = Some(entry.key.clone());
                        self.detail_key = None;
                    }
                    ui.add_enabled(false, egui::Button::new("In Phiếu (A4)"))
                        .on_disabled_hover_text("Chưa có bộ tạo tài liệu.");
                });
                ui.small(
                    "Số ngày còn lại là giá trị đã lưu; chưa có API đối soát SLA và in phiếu.",
                );
            },
        );
        if close {
            self.detail_key = None;
        }
    }

    fn upsert(&mut self, entry: PlanProgressEntry) {
        self.entries.retain(|current| current.key != entry.key);
        self.entries.insert(0, entry);
    }
}

fn average_progress(entries: &[PlanProgressEntry]) -> Option<i64> {
    if entries.is_empty() {
        return None;
    }
    let sum = entries.iter().fold(0_i64, |total, entry| {
        total.saturating_add(entry.progress_percent)
    });
    let count = entries.len() as i64;
    let quotient = sum / count;
    let remainder = sum % count;
    Some(quotient + if remainder >= (count + 1) / 2 { 1 } else { 0 })
}

fn entry_matches(entry: &PlanProgressEntry, query: &str, filter: &str) -> bool {
    let filter_matches = match filter {
        "all" => true,
        "completed" => entry.progress_percent == 100,
        "fast" => (80..100).contains(&entry.progress_percent),
        "running" => entry.progress_percent < 80,
        _ => true,
    };
    let query_matches = query.is_empty()
        || [
            entry.task_title.as_str(),
            entry.plan_name.as_str(),
            entry.assignee.as_str(),
            entry.code.as_str(),
        ]
        .iter()
        .any(|value| value.to_lowercase().contains(query));
    filter_matches && query_matches
}

fn due_label(entry: &PlanProgressEntry) -> String {
    if entry.progress_percent == 100 {
        "Đã hoàn tất".to_owned()
    } else if entry.days_remaining < 0 {
        format!(
            "Quá hạn {} ngày (giá trị đã lưu)",
            entry.days_remaining.saturating_abs()
        )
    } else {
        format!("Còn {} ngày (giá trị đã lưu)", entry.days_remaining)
    }
}

fn progress_color(progress: i64) -> Color32 {
    if progress == 100 {
        Color32::from_rgb(22, 163, 74)
    } else if progress < 50 {
        Color32::from_rgb(245, 158, 11)
    } else {
        Color32::from_rgb(0, 150, 136)
    }
}

fn status_color(status: &str) -> Color32 {
    match status {
        "Hoàn thành" => Color32::from_rgb(22, 163, 74),
        "Chậm tiến độ" => Color32::from_rgb(220, 38, 38),
        _ => Color32::from_rgb(37, 99, 235),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(progress: i64) -> PlanProgressEntry {
        PlanProgressEntry {
            key: "progress-1".to_owned(),
            code: "TASK-P-01".to_owned(),
            plan_name: "Nâng cấp nền tảng".to_owned(),
            task_title: "Tối ưu truy vấn".to_owned(),
            assignee: "Nguyễn An".to_owned(),
            due_date: "2026-12-20".to_owned(),
            days_remaining: 10,
            progress_percent: progress,
            weight_percent: 25,
            status: "Đúng tiến độ".to_owned(),
        }
    }

    #[test]
    fn filters_match_legacy_boundaries_and_search_fields() {
        let current = entry(80);
        assert!(entry_matches(&current, "task-p", "fast"));
        assert!(entry_matches(&current, "nâng cấp", "all"));
        assert!(entry_matches(&current, "nguyễn an", "all"));
        assert!(!entry_matches(&current, "", "running"));
        assert!(!entry_matches(&current, "", "completed"));
        assert!(entry_matches(&entry(79), "", "running"));
        assert!(entry_matches(&entry(100), "", "completed"));
        assert!(!entry_matches(&entry(100), "", "fast"));
    }

    #[test]
    fn progress_average_is_data_derived_and_empty_is_not_fabricated() {
        assert_eq!(average_progress(&[]), None);
        assert_eq!(average_progress(&[entry(20), entry(80)]), Some(50));
        assert_eq!(average_progress(&[entry(80), entry(81)]), Some(81));
    }

    #[test]
    fn due_labels_distinguish_overdue_and_completed_records() {
        let mut item = entry(50);
        item.days_remaining = -3;
        assert!(due_label(&item).starts_with("Quá hạn 3 ngày"));
        item.days_remaining = 5;
        assert!(due_label(&item).starts_with("Còn 5 ngày"));
        item.progress_percent = 100;
        assert_eq!(due_label(&item), "Đã hoàn tất");
    }

    #[test]
    fn account_switch_clears_loaded_and_unsaved_progress_state() {
        let mut view = PlanProgressView {
            entries: vec![entry(40)],
            search: "draft".to_owned(),
            filter: "fast".to_owned(),
            page: 2,
            edit_key: Some("progress-1".to_owned()),
            detail_key: Some("progress-1".to_owned()),
            progress_input: "85".to_owned(),
            ..PlanProgressView::default()
        };
        view.clear_account_state();
        assert!(view.entries.is_empty());
        assert!(view.search.is_empty());
        assert_eq!(view.filter, "all");
        assert_eq!(view.page, 0);
        assert!(view.edit_key.is_none());
        assert!(view.detail_key.is_none());
        assert!(view.progress_input.is_empty());
    }
}
