use crate::api::{ApiClient, ApiTask, DashboardStats};
use crate::models::{NavGroup, NavItem, Session};
use egui::{Color32, RichText, Ui};
use std::time::Duration;

#[derive(Default)]
pub struct DashboardView {
    stats: Option<DashboardStats>,
    task: Option<ApiTask<DashboardStats>>,
    loaded_for: Option<String>,
    needs_reload: bool,
    error: String,
}

impl DashboardView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        nav_change: &mut Option<NavItem>,
    ) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.stats = None;
            self.loaded_for = Some(session.user.id.clone());
            self.needs_reload = true;
        }

        if self.needs_reload && self.task.is_none() {
            self.error.clear();
            self.task = Some(api.dashboard_stats_task(session));
            self.needs_reload = false;
        }
        if let Some(result) = self.task.as_ref().and_then(ApiClient::poll) {
            self.task = None;
            match result {
                Ok(stats) => {
                    self.stats = Some(stats);
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if self.task.is_some() {
            ctx.request_repaint_after(Duration::from_millis(80));
        }

        let stats = self.stats.as_ref();
        let loading_value = if self.task.is_some() { "…" } else { "—" };
        let employee_count = stats
            .map(|stats| stats.total_employees.to_string())
            .unwrap_or_else(|| loading_value.to_owned());
        let active_count = stats
            .map(|stats| stats.active_users.to_string())
            .unwrap_or_else(|| loading_value.to_owned());
        let new_count = stats
            .map(|stats| stats.new_employees_this_month.to_string())
            .unwrap_or_else(|| loading_value.to_owned());
        let workflow_count = stats
            .map(|stats| stats.pending_approvals_count.to_string())
            .unwrap_or_else(|| loading_value.to_owned());

        ui.vertical(|ui| {
            ui.set_width(ui.available_width());
            egui::Frame::none()
                .fill(Color32::from_rgb(0, 105, 92))
                .rounding(8.0)
                .inner_margin(egui::Margin::symmetric(20.0, 16.0))
                .show(ui, |ui| {
                    ui.set_min_width(ui.available_width());
                    ui.label(
                        RichText::new("TỔNG QUAN DOANH NGHIỆP")
                            .size(11.0)
                            .strong()
                            .color(Color32::from_rgb(178, 223, 219)),
                    );
                    ui.label(
                        RichText::new(format!("Xin chào, {}!", session.user.name))
                            .size(20.0)
                            .strong()
                            .color(Color32::WHITE),
                    );
                    ui.label(
                        RichText::new(format!(
                            "Hệ thống đang hoạt động ở chế độ: {}",
                            session.mode.label()
                        ))
                        .size(12.5)
                        .color(Color32::from_rgb(224, 242, 241)),
                    );
                });

            ui.add_space(12.0);
            ui.horizontal(|ui| {
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui
                        .add_enabled(self.task.is_none(), egui::Button::new("Làm mới số liệu"))
                        .clicked()
                    {
                        self.needs_reload = true;
                    }
                });
            });
            ui.horizontal_wrapped(|ui| {
                render_metric_card(
                    ui,
                    "TỔNG NHÂN SỰ",
                    &employee_count,
                    "Tài khoản nhân viên trong backend",
                    Color32::from_rgb(0, 150, 136),
                );
                render_metric_card(
                    ui,
                    "ĐANG HOẠT ĐỘNG",
                    &active_count,
                    "Tài khoản nhân viên đang hoạt động",
                    Color32::from_rgb(22, 163, 74),
                );
                render_metric_card(
                    ui,
                    "NHÂN SỰ MỚI THÁNG NÀY",
                    &new_count,
                    "Theo thời điểm UTC trong backend",
                    Color32::from_rgb(124, 58, 237),
                );
                render_metric_card(
                    ui,
                    "WORKFLOW CHỜ XỬ LÝ",
                    &workflow_count,
                    "Chỉ tính collection workflow đã kết nối",
                    Color32::from_rgb(217, 119, 6),
                );
            });

            ui.add_space(10.0);
            if !self.error.is_empty() {
                ui.horizontal(|ui| {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    if ui
                        .add_enabled(self.task.is_none(), egui::Button::new("Thử lại"))
                        .clicked()
                    {
                        self.needs_reload = true;
                    }
                });
            } else if self.task.is_some() && self.stats.is_none() {
                ui.horizontal(|ui| {
                    ui.spinner();
                    ui.label("Đang tải số liệu từ máy chủ...");
                });
            }

            ui.columns(2, |cols| {
                cols[0].group(|ui| {
                    ui.label(
                        RichText::new("LỐI TẮT ĐÃ KẾT NỐI")
                            .size(12.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.add_space(8.0);
                    if ui.button("Quản lý tài khoản").clicked() {
                        *nav_change = Some(NavItem::new(
                            "adm-users",
                            "Quản lý người dùng",
                            "/admin/users",
                            "👥",
                            NavGroup::Administration,
                        ));
                    }
                    if ui.button("Quản lý nhân sự").clicked() {
                        *nav_change = Some(NavItem::new(
                            "hr-employees",
                            "Nhân viên",
                            "/admin/hr/employees",
                            "⌁",
                            NavGroup::Hr,
                        ));
                    }
                    if ui.button("Đơn vị tổ chức").clicked() {
                        *nav_change = Some(NavItem::new(
                            "business-org-units",
                            "Đơn vị tổ chức",
                            "/admin/business/org-units",
                            "⌂",
                            NavGroup::Business,
                        ));
                    }
                    if ui.button("Tài liệu & Cloud Drive").clicked() {
                        *nav_change = Some(NavItem::new(
                            "files",
                            "Tài liệu",
                            "/admin/files",
                            "▰",
                            NavGroup::Files,
                        ));
                    }
                });

                cols[1].group(|ui| {
                    ui.label(
                        RichText::new("TRẠNG THÁI NGUỒN DỮ LIỆU")
                            .size(12.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.add_space(8.0);
                    if stats.is_some_and(|stats| stats.financial_metrics_available) {
                        ui.label("Đã kết nối số liệu tài chính.");
                    } else {
                        ui.label("Tài chính: chưa có nguồn giao dịch được kết nối.");
                    }
                    if stats.is_some_and(|stats| stats.audit_logs_available) {
                        ui.label("Đã kết nối nhật ký kiểm toán.");
                    } else {
                        ui.label("Kiểm toán: backend chưa lưu audit events.");
                    }
                    if stats.is_none() && self.task.is_none() && self.error.is_empty() {
                        ui.label("Chưa có số liệu trả về từ máy chủ.");
                    }
                });
            });
        });
    }
}

fn render_metric_card(ui: &mut Ui, title: &str, value: &str, subtext: &str, accent_color: Color32) {
    egui::Frame::none()
        .fill(Color32::from_rgb(255, 255, 255))
        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
        .rounding(8.0)
        .inner_margin(egui::Margin::same(14.0))
        .show(ui, |ui| {
            ui.set_width(220.0);
            ui.label(
                RichText::new(title)
                    .size(10.5)
                    .strong()
                    .color(Color32::from_rgb(100, 116, 139)),
            );
            ui.add_space(4.0);
            ui.label(RichText::new(value).size(17.0).strong().color(accent_color));
            ui.add_space(2.0);
            ui.label(
                RichText::new(subtext)
                    .size(11.0)
                    .color(Color32::from_rgb(100, 116, 139)),
            );
        });
}
