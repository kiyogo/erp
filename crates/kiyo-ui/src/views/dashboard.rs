use crate::models::{NavItem, Session};
use egui::{Align, Color32, Layout, RichText, Ui};

pub struct DashboardView;

impl DashboardView {
    pub fn render(ui: &mut Ui, session: &Session, nav_change: &mut Option<NavItem>) {
        ui.vertical(|ui| {
            // Header Banner
            egui::Frame::none()
                .fill(Color32::from_rgb(0, 105, 92))
                .rounding(8.0)
                .inner_margin(egui::Margin::symmetric(20.0, 16.0))
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.vertical(|ui| {
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
                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            let btn = egui::Button::new(
                                RichText::new("Điểm danh hôm nay")
                                    .strong()
                                    .color(Color32::WHITE),
                            )
                            .fill(Color32::from_rgb(5, 150, 105));
                            if ui.add(btn).clicked() {
                                *nav_change = Some(NavItem::new(
                                    "att-overview",
                                    "Tổng quan",
                                    "/admin/attendance/overview",
                                    "📊",
                                    crate::models::NavGroup::Attendance,
                                ));
                            }
                        });
                    });
                });

            ui.add_space(16.0);

            // KPI Cards Grid
            ui.horizontal(|ui| {
                render_metric_card(
                    ui,
                    "TỔNG NHÂN SỰ",
                    "24",
                    "Hoạt động",
                    Color32::from_rgb(0, 150, 136),
                );
                ui.add_space(12.0);
                render_metric_card(
                    ui,
                    "DOANH THU THÁNG",
                    "1.250.000.000 ₫",
                    "Tăng 12% so với tháng trước",
                    Color32::from_rgb(22, 163, 74),
                );
                ui.add_space(12.0);
                render_metric_card(
                    ui,
                    "ĐỀ XUẤT CHỜ DUYỆT",
                    "3",
                    "Cần xử lý",
                    Color32::from_rgb(79, 70, 229),
                );
                ui.add_space(12.0);
                render_metric_card(
                    ui,
                    "TÀI SẢN DOANH NGHIỆP",
                    "48",
                    "Thiết bị quản lý",
                    Color32::from_rgb(217, 119, 6),
                );
            });

            ui.add_space(20.0);

            // Two-column layout
            ui.columns(2, |cols| {
                // Left Column: Quick Actions
                cols[0].group(|ui| {
                    ui.label(
                        RichText::new("LỐI TẮT THAO TÁC NHANH")
                            .size(12.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.add_space(8.0);
                    if ui.button("Quản lý tài khoản & Phân quyền").clicked() {
                        *nav_change = Some(NavItem::new(
                            "adm-users",
                            "Quản lý người dùng",
                            "/admin/users",
                            "👥",
                            crate::models::NavGroup::Administration,
                        ));
                    }
                    ui.add_space(4.0);
                    if ui.button("Lập phiếu thu chi & Hóa đơn").clicked() {
                        *nav_change = Some(NavItem::new(
                            "fin-overview",
                            "Tổng quan",
                            "/admin/finance/overview",
                            "📊",
                            crate::models::NavGroup::Finance,
                        ));
                    }
                    ui.add_space(4.0);
                    if ui.button("Danh bạ Khách hàng & Đối tác").clicked() {
                        *nav_change = Some(NavItem::new(
                            "crm-customers",
                            "Khách hàng",
                            "/admin/crm/customers",
                            "🙂",
                            crate::models::NavGroup::Crm,
                        ));
                    }
                    ui.add_space(4.0);
                    if ui.button("Đặt lịch phòng họp nội bộ").clicked() {
                        *nav_change = Some(NavItem::new(
                            "mr-overview",
                            "Tổng quan",
                            "/admin/meeting-rooms/overview",
                            "📊",
                            crate::models::NavGroup::MeetingRooms,
                        ));
                    }
                    ui.add_space(4.0);
                    if ui.button("Bảng vẽ chữ ký số & Chứng thực eKYC").clicked() {
                        *nav_change = Some(NavItem::new(
                            "set-sig-list",
                            "Danh sách chữ ký số",
                            "/admin/digital-signature/list",
                            "✍",
                            crate::models::NavGroup::Signatures,
                        ));
                    }
                });

                // Right Column: System Logs & Status
                cols[1].group(|ui| {
                    ui.label(
                        RichText::new("NHẬT KÝ HOẠT ĐỘNG HỆ THỐNG")
                            .size(12.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.add_space(8.0);
                    ui.label("• [08:30] Hệ thống Rust Native GUI khởi chạy thành công.");
                    ui.label("• [08:32] Nhân viên điểm danh vào ca hành chính.");
                    ui.label("• [09:15] Đồng bộ dữ liệu Kiyo Cloud hoàn tất.");
                    ui.label("• [10:00] Hợp đồng Alpha Tech đã được ký số điện tử.");
                });
            });
        });
    }
}

fn render_metric_card(ui: &mut Ui, title: &str, value: &str, subtext: &str, accent_color: Color32) {
    egui::Frame::none()
        .fill(Color32::from_rgb(255, 255, 255))
        .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
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
                    .color(Color32::from_rgb(148, 163, 184)),
            );
        });
}
