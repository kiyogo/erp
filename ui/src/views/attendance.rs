use crate::{
    api::{ApiClient, ApiTask, EmployeeListResponse, LeaveRequestRecord, LeaveRequestsResponse},
    models::{Employee, NavGroup, NavItem, Session},
    widgets::{self, Metric, TableColumn, TagTone},
};
use egui::{Color32, RichText, Ui};
use std::time::Duration;

#[path = "attendance_records.rs"]
mod attendance_records;

#[derive(Default)]
pub struct AttendanceView {
    records: attendance_records::AttendanceRecordsView,
    loaded_for: String,
    employees: Vec<Employee>,
    requests: Vec<LeaveRequestRecord>,
    employees_task: Option<ApiTask<EmployeeListResponse>>,
    requests_task: Option<ApiTask<LeaveRequestsResponse>>,
    employees_loaded: bool,
    requests_loaded: bool,
    employees_error: String,
    requests_error: String,
    page: usize,
    page_size: usize,
    selected: Option<LeaveRequestRecord>,
}

#[derive(Debug, PartialEq, Eq)]
struct LeaveSummary {
    active: usize,
    available: usize,
    today: usize,
    pending: usize,
    upcoming: usize,
}

fn in_range(start: &str, end: &str, today: &str) -> bool {
    let parse = |s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok();
    match (parse(start), parse(end), parse(today)) {
        (Some(start), Some(end), Some(today)) => start <= today && today <= end,
        _ => false,
    }
}

fn summarize(employees: &[Employee], requests: &[LeaveRequestRecord], today: &str) -> LeaveSummary {
    let active = employees
        .iter()
        .filter(|e| e.status != "Đã nghỉ việc")
        .count();
    let approved = requests
        .iter()
        .filter(|r| {
            r.status == "Đã duyệt"
                && in_range(r.effective_start_date(), r.effective_end_date(), today)
        })
        .count();
    LeaveSummary {
        active,
        available: active.saturating_sub(approved),
        today: approved,
        pending: requests.iter().filter(|r| r.status == "Chờ duyệt").count(),
        upcoming: requests
            .iter()
            .filter(|r| {
                r.status == "Đã duyệt"
                    && chrono::NaiveDate::parse_from_str(r.effective_start_date(), "%Y-%m-%d")
                        .is_ok()
                    && r.effective_start_date() > today
            })
            .count(),
    }
}

impl AttendanceView {
    fn reload(&mut self, session: &Session, api: &ApiClient) {
        if self.employees_task.is_some() || self.requests_task.is_some() {
            return;
        }
        self.employees_error.clear();
        self.requests_error.clear();
        self.employees_task = Some(api.list_employees_task(session));
        self.requests_task = Some(api.list_leave_requests_task(session));
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let account = format!("{}\n{}", session.endpoint, session.user.id);
        if self.loaded_for != account {
            *self = Self::default();
            self.loaded_for = account;
            self.page_size = 6;
            self.reload(session, api);
        }
        if let Some(result) = self.employees_task.as_ref().and_then(ApiClient::poll) {
            self.employees_task = None;
            match result {
                Ok(response) => {
                    self.employees = response.data;
                    self.employees_loaded = true;
                }
                Err(error) => {
                    self.employees_loaded = false;
                    self.employees_error = error;
                }
            }
        }
        if let Some(result) = self.requests_task.as_ref().and_then(ApiClient::poll) {
            self.requests_task = None;
            match result {
                Ok(response) => {
                    self.requests = response.data;
                    self.requests
                        .sort_by(|a, b| b.effective_start_date().cmp(a.effective_start_date()));
                    self.requests_loaded = true;
                }
                Err(error) => {
                    self.requests_loaded = false;
                    self.requests_error = error;
                }
            }
        }
        if self.employees_task.is_some() || self.requests_task.is_some() {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        path: &str,
        nav_change: &mut Option<NavItem>,
    ) {
        if session.user.role != "ADMIN" {
            *self = Self::default();
            ui.label("Bạn không có quyền xem tổng quan nhân sự.");
            return;
        }
        if !matches!(
            path,
            "/admin/attendance" | "/admin/attendance/overview" | "/admin/attendance/monitoring"
        ) {
            self.records.render(ui, ctx, session, api, path);
            return;
        }
        self.poll(ctx, session, api);
        ui.add_space(8.0);
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let summary = summarize(&self.employees, &self.requests, &today);
        let known = self.employees_loaded && self.requests_loaded;
        let first_label = format!("Quân số khả dụng ngày {today}");
        let labels = [
            first_label.as_str(),
            "Đơn nghỉ đang hiệu lực hôm nay",
            "Đơn nghỉ chờ duyệt",
            "Đơn nghỉ đã duyệt sắp tới",
        ];
        let values = [
            format!("{} / {} nhân sự", summary.available, summary.active),
            format!("{} nhân sự", summary.today),
            format!("{} đơn", summary.pending),
            format!("{} đơn", summary.upcoming),
        ];
        let details = [
            "Suy ra từ quân số đang hoạt động và đơn nghỉ đã duyệt",
            "Đã được phê duyệt và nằm trong khoảng ngày nghỉ",
            "Cần bộ phận quản lý hoặc HR xử lý",
            "Giúp dự báo quân số các ngày tới",
        ];
        let colors = [
            crate::theme::PRIMARY,
            Color32::from_rgb(22, 163, 74),
            Color32::from_rgb(217, 119, 6),
            Color32::from_rgb(37, 99, 235),
        ];
        let metrics = labels
            .iter()
            .enumerate()
            .map(|(i, label)| Metric {
                label,
                value: if known {
                    values[i].clone()
                } else {
                    "—".into()
                },
                detail: details[i],
                color: colors[i],
                value_size: 24.0,
            })
            .collect::<Vec<_>>();
        widgets::metrics(ui, "attendance.metrics", &metrics);
        ui.add_space(16.0);
        for error in [&self.employees_error, &self.requests_error] {
            if !error.is_empty() {
                ui.colored_label(Color32::DARK_RED, error);
            }
        }
        let busy = self.employees_task.is_some() || self.requests_task.is_some();
        ui.horizontal_wrapped(|ui| {
            ui.vertical(|ui| {ui.label(RichText::new("Tổng Quan Nghỉ Phép & Quân Số").size(16.0).strong());ui.label(RichText::new("Tổng hợp từ nhân sự đang hoạt động và đơn nghỉ phép đang có trên hệ thống.").size(12.0).color(Color32::from_rgb(100,116,139)));});
            if ui.add_enabled(!busy,egui::Button::new("Làm mới")).clicked(){self.reload(session,api);}
            ui.add_enabled(false,egui::Button::new("Xuất báo cáo")).on_disabled_hover_text("Chưa có tệp báo cáo được máy chủ xác nhận.");
            if ui.button("Danh sách đơn nghỉ").clicked(){*nav_change=Some(NavItem::new("att-req-list","Đơn","/admin/attendance/requests/list","📄",NavGroup::Attendance));}
        });
        ui.add_space(14.0);
        if !self.requests_loaded {
            if busy {
                ui.spinner();
            }
            return;
        }
        if ctx.screen_rect().width() <= 992.0 {
            self.render_requests(ui);
            ui.add_space(16.0);
            self.render_breakdown(ui);
        } else {
            let width = ui.available_width();
            let left = (width - 16.0) * 1.35 / 2.35;
            let mut height = 0.0_f32;
            let origin = ui.cursor().min;
            for (index, (x, w)) in [(0.0, left), (left + 16.0, width - left - 16.0)]
                .into_iter()
                .enumerate()
            {
                let mut child = ui.new_child(
                    egui::UiBuilder::new()
                        .id_salt(("attendance.body", index))
                        .max_rect(egui::Rect::from_min_size(
                            origin + egui::vec2(x, 0.0),
                            egui::vec2(w, ui.available_height()),
                        )),
                );
                if index == 0 {
                    self.render_requests(&mut child);
                } else {
                    self.render_breakdown(&mut child);
                }
                height = height.max(child.min_rect().height());
            }
            ui.allocate_exact_size(egui::vec2(width, height), egui::Sense::hover());
        }
        if let Some(record) = self.selected.clone() {
            let (_, closed) = widgets::drawer(
                ctx,
                "attendance.details",
                "Chi tiết đơn nghỉ phép",
                540.0,
                |ui| {
                    ui.label(
                        RichText::new(&record.code)
                            .strong()
                            .color(crate::theme::PRIMARY),
                    );
                    ui.label(RichText::new(&record.employee_name).size(17.0).strong());
                    widgets::tag(ui, &record.status, leave_tone(&record.status));
                    ui.label(format!(
                        "{} · {}",
                        record.department,
                        record.effective_leave_type()
                    ));
                    ui.add_space(16.0);
                    ui.strong("Thông tin đơn nghỉ");
                    ui.label(format!(
                        "Khoảng nghỉ: {} → {}",
                        record.effective_start_date(),
                        record.effective_end_date()
                    ));
                    ui.label(format!(
                        "Số ngày: {}",
                        record
                            .effective_days_count()
                            .map_or_else(|| "—".into(), |n| n.to_string())
                    ));
                    ui.label(format!("Lý do: {}", record.reason));
                },
            );
            if closed {
                self.selected = None;
            }
        }
    }

    fn render_requests(&mut self, ui: &mut Ui) {
        self.page_size = self.page_size.max(1);
        self.page = self
            .page
            .min(self.requests.len().div_ceil(self.page_size).max(1) - 1);
        let page = self
            .requests
            .iter()
            .skip(self.page * self.page_size)
            .take(self.page_size)
            .cloned()
            .collect::<Vec<_>>();
        let flex = ((ui.available_width() - 2.0).max(660.0) - 330.0) / 3.0;
        let columns = [
            TableColumn {
                title: "Mã đơn",
                width: 120.0,
            },
            TableColumn {
                title: "Nhân viên",
                width: flex,
            },
            TableColumn {
                title: "Loại nghỉ",
                width: flex,
            },
            TableColumn {
                title: "Thời gian",
                width: flex,
            },
            TableColumn {
                title: "Trạng thái",
                width: 120.0,
            },
            TableColumn {
                title: "Thao tác",
                width: 90.0,
            },
        ];
        widgets::table(
            ui,
            "attendance.table",
            &columns,
            page.len(),
            |ui, row, col| {
                let record = &page[row];
                match col {
                    0 => {
                        ui.label(
                            RichText::new(&record.code)
                                .strong()
                                .color(crate::theme::PRIMARY),
                        );
                    }
                    1 => {
                        ui.label(RichText::new(&record.employee_name).size(13.0).strong());
                        ui.label(RichText::new(&record.department).size(11.5));
                    }
                    2 => widgets::tag(ui, record.effective_leave_type(), TagTone::Processing),
                    3 => {
                        ui.label(
                            RichText::new(format!(
                                "{} → {}",
                                record.effective_start_date(),
                                record.effective_end_date()
                            ))
                            .size(12.0),
                        );
                        ui.label(
                            RichText::new(format!(
                                "{} ngày",
                                record
                                    .effective_days_count()
                                    .map_or_else(|| "—".into(), |n| n.to_string())
                            ))
                            .size(12.0),
                        );
                    }
                    4 => widgets::tag(ui, &record.status, leave_tone(&record.status)),
                    _ => {
                        if ui.button("Xem").clicked() {
                            self.selected = Some(record.clone());
                        }
                    }
                }
            },
        );
        ui.add_space(10.0);
        widgets::pagination(
            ui,
            "attendance.pagination",
            &mut self.page,
            self.requests.len(),
            &mut self.page_size,
        );
    }

    fn render_breakdown(&self, ui: &mut Ui) {
        egui::Frame::none()
            .fill(Color32::WHITE)
            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
            .rounding(8.0)
            .inner_margin(18.0)
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.label(RichText::new("Cơ Cấu Đơn Nghỉ").size(14.0).strong());
                ui.add_space(12.0);
                if self.requests.is_empty() {
                    ui.label(
                        RichText::new("Chưa có đơn nghỉ phép nào.")
                            .size(13.0)
                            .color(Color32::from_rgb(100, 116, 139)),
                    );
                }
                let mut groups: Vec<(String, usize)> = Vec::new();
                for r in &self.requests {
                    let kind = if r.effective_leave_type().is_empty() {
                        "Khác"
                    } else {
                        r.effective_leave_type()
                    };
                    if let Some((_, count)) = groups.iter_mut().find(|(name, _)| name == kind) {
                        *count += 1;
                    } else {
                        groups.push((kind.to_owned(), 1));
                    }
                }
                for (index, (kind, count)) in groups.iter().enumerate() {
                    let percent =
                        (*count as f32 * 100.0 / self.requests.len().max(1) as f32).round();
                    ui.horizontal_wrapped(|ui| {
                        ui.label(RichText::new(kind).size(12.5));
                        ui.label(RichText::new(format!("{count} đơn ({percent:.0}%)")).size(12.5));
                    });
                    let color = [
                        crate::theme::PRIMARY,
                        Color32::from_rgb(37, 99, 235),
                        Color32::from_rgb(217, 119, 6),
                        Color32::from_rgb(124, 58, 237),
                    ][index % 4];
                    ui.add(
                        egui::ProgressBar::new(percent / 100.0)
                            .desired_width(ui.available_width())
                            .desired_height(8.0)
                            .fill(color),
                    );
                    ui.add_space(12.0);
                }
            });
    }
}

fn leave_tone(status: &str) -> TagTone {
    match status {
        "Đã duyệt" => TagTone::Success,
        "Từ chối" => TagTone::Error,
        _ => TagTone::Warning,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(status: &str, start: &str, end: &str) -> LeaveRequestRecord {
        serde_json::from_value(
            serde_json::json!({"key":"1","status":status,"startDate":start,"endDate":end}),
        )
        .unwrap()
    }
    #[test]
    fn date_range_is_inclusive_and_rejects_missing_or_invalid_dates() {
        assert!(in_range("2026-10-24", "2026-10-24", "2026-10-24"));
        assert!(!in_range("", "2026-10-24", "2026-10-24"));
        assert!(!in_range("2026-02-30", "2026-10-24", "2026-10-24"));
        assert!(!in_range("2026-10-25", "2026-10-24", "2026-10-24"));
    }
    #[test]
    fn summary_does_not_turn_missing_staff_into_negative_availability() {
        let data = [
            request("Đã duyệt", "2026-10-24", "2026-10-24"),
            request("Chờ duyệt", "2026-10-24", "2026-10-24"),
            request("Đã duyệt", "2026-10-25", "2026-10-26"),
            request("Từ chối", "2026-10-24", "2026-10-24"),
        ];
        assert_eq!(
            summarize(&[], &data, "2026-10-24"),
            LeaveSummary {
                active: 0,
                available: 0,
                today: 1,
                pending: 1,
                upcoming: 1
            }
        );
    }
    #[test]
    fn summary_reads_legacy_date_aliases() {
        let r=serde_json::from_value(serde_json::json!({"key":"1","status":"Đã duyệt","fromDate":"2026-10-24","toDate":"2026-10-25"})).unwrap();
        assert_eq!(summarize(&[], &[r], "2026-10-24").today, 1);
    }
}
