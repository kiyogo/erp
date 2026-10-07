use crate::models::{NavItem, Session};
use crate::views::employees::format_vnd;
use egui::{Color32, RichText, Ui};

pub struct PayslipRecord {
    pub month: String,
    pub salary_base: u64,
    pub allowance: u64,
    pub bonus: u64,
    pub insurance: u64,
    pub tax: u64,
    pub net_salary: u64,
    pub status: String,
}

pub struct EmployeePortalView {
    pub payslips: Vec<PayslipRecord>,
    pub selected_month_idx: usize,
    pub notice: String,
}

impl Default for EmployeePortalView {
    fn default() -> Self {
        Self {
            payslips: vec![
                PayslipRecord {
                    month: "Tháng 08/2026".into(),
                    salary_base: 18000000,
                    allowance: 1500000,
                    bonus: 3500000,
                    insurance: 1890000,
                    tax: 650000,
                    net_salary: 20460000,
                    status: "Đã quyết toán".into(),
                },
                PayslipRecord {
                    month: "Tháng 07/2026".into(),
                    salary_base: 18000000,
                    allowance: 1500000,
                    bonus: 2500000,
                    insurance: 1890000,
                    tax: 450000,
                    net_salary: 19660000,
                    status: "Đã thanh toán".into(),
                },
                PayslipRecord {
                    month: "Tháng 06/2026".into(),
                    salary_base: 18000000,
                    allowance: 1500000,
                    bonus: 2000000,
                    insurance: 1890000,
                    tax: 350000,
                    net_salary: 19260000,
                    status: "Đã thanh toán".into(),
                },
            ],
            selected_month_idx: 0,
            notice: String::new(),
        }
    }
}

impl EmployeePortalView {
    pub fn render_home(
        &mut self,
        ui: &mut Ui,
        session: &Session,
        nav_change: &mut Option<NavItem>,
    ) {
        ui.vertical(|ui| {
            egui::Frame::none()
                .fill(Color32::from_rgb(0, 105, 92))
                .rounding(8.0)
                .inner_margin(egui::Margin::symmetric(20.0, 16.0))
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.vertical(|ui| {
                            ui.label(
                                RichText::new("CỔNG THÔNG TIN TỰ PHỤC VỤ")
                                    .size(11.0)
                                    .color(Color32::from_rgb(178, 223, 219)),
                            );
                            ui.label(
                                RichText::new(format!("Xin chào, {}!", session.user.name))
                                    .size(20.0)
                                    .color(Color32::WHITE),
                            );
                            ui.label(
                                RichText::new(
                                    "Chúc bạn một ngày làm việc hiệu quả và nhiều năng lượng!",
                                )
                                .size(12.5)
                                .color(Color32::from_rgb(224, 242, 241)),
                            );
                        });
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            let checkin_btn = egui::Button::new(
                                RichText::new("Điểm danh Vào ca").color(Color32::WHITE),
                            )
                            .fill(Color32::from_rgb(5, 150, 105));
                            if ui.add(checkin_btn).clicked() {
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

            // Fast shortcuts
            ui.columns(2, |cols| {
                cols[0].group(|ui| {
                    ui.label(
                        RichText::new("TÁC VỤ TỰ PHỤC VỤ").color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.add_space(8.0);
                    if ui.button("Xem & In phiếu lương tháng").clicked() {
                        *nav_change = Some(NavItem::new(
                            "emp-payslip",
                            "Phiếu lương điện tử",
                            "/employee/payslip",
                            "💳",
                            crate::models::NavGroup::EmployeePayslips,
                        ));
                    }
                    ui.add_space(4.0);
                    if ui.button("Xin nghỉ phép / Đổi ca làm").clicked() {
                        *nav_change = Some(NavItem::new(
                            "att-req-list",
                            "Đơn",
                            "/admin/attendance/requests/list",
                            "📄",
                            crate::models::NavGroup::Attendance,
                        ));
                    }
                    ui.add_space(4.0);
                    if ui.button("Tài liệu & Hợp đồng cá nhân").clicked() {
                        *nav_change = Some(NavItem::new(
                            "emp-files",
                            "Tài liệu",
                            "/employee/files",
                            "📁",
                            crate::models::NavGroup::EmployeeFiles,
                        ));
                    }
                    ui.add_space(4.0);
                    if ui.button("Ký số điện tử tài liệu eKYC").clicked() {
                        *nav_change = Some(NavItem::new(
                            "emp-sig-my",
                            "Chữ ký của tôi",
                            "/employee/digital-signature/my-signature",
                            "✍",
                            crate::models::NavGroup::EmployeeSignatures,
                        ));
                    }
                });

                cols[1].group(|ui| {
                    ui.label(
                        RichText::new("THÔNG BÁO DOANH NGHIỆP")
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.add_space(8.0);
                    ui.label("Thông báo lịch nghỉ lễ Quốc khánh");
                    ui.label("Hệ thống nâng cấp Native Rust Desktop App hoàn tất.");
                    ui.label("Dự án Alpha Tech đã được phê duyệt thành công.");
                });
            });
        });
    }

    pub fn render_payslips(&mut self, ui: &mut Ui, session: &Session) {
        let current = &self.payslips[self.selected_month_idx];

        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new("THU NHẬP CÁ NHÂN")
                            .size(11.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.heading("Phiếu lương & Thu nhập");
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.button("In / Xuất phiếu lương").clicked() {
                        self.notice =
                            "Đang gửi lệnh in phiếu lương tới máy in hệ thống...".to_string();
                    }

                    egui::ComboBox::from_id_salt("payslip_month_combo")
                        .selected_text(&current.month)
                        .show_ui(ui, |ui| {
                            for (idx, p) in self.payslips.iter().enumerate() {
                                ui.selectable_value(&mut self.selected_month_idx, idx, &p.month);
                            }
                        });
                });
            });

            if !self.notice.is_empty() {
                ui.add_space(8.0);
                egui::Frame::none()
                    .fill(Color32::from_rgb(240, 253, 244))
                    .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(187, 247, 208)))
                    .rounding(6.0)
                    .inner_margin(8.0)
                    .show(ui, |ui| {
                        ui.label(RichText::new(&self.notice).color(Color32::from_rgb(22, 101, 52)));
                    });
            }

            ui.add_space(14.0);

            // Detailed Payslip Card
            egui::Frame::none()
                .fill(Color32::WHITE)
                .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                .rounding(10.0)
                .inner_margin(20.0)
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.vertical(|ui| {
                            ui.label(
                                RichText::new("PHIẾU LƯƠNG NHÂN VIÊN")
                                    .size(11.0)
                                    .strong()
                                    .color(Color32::from_rgb(0, 150, 136)),
                            );
                            ui.label(RichText::new(&current.month).size(18.0).strong());
                        });
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            ui.vertical(|ui| {
                                ui.label(RichText::new(&session.user.name).strong());
                                ui.label(
                                    RichText::new(&session.user.email)
                                        .size(11.0)
                                        .color(Color32::from_rgb(100, 116, 139)),
                                );
                            });
                        });
                    });

                    ui.add_space(12.0);
                    ui.separator();
                    ui.add_space(12.0);

                    ui.columns(2, |cols| {
                        // Earnings (+)
                        cols[0].group(|ui| {
                            ui.label(
                                RichText::new("CÁC KHOẢN THU NHẬP (+)")
                                    .strong()
                                    .color(Color32::from_rgb(22, 163, 74)),
                            );
                            ui.add_space(6.0);
                            render_row(
                                ui,
                                "Lương cơ bản:",
                                &format!("{} ₫", format_vnd(current.salary_base)),
                            );
                            render_row(
                                ui,
                                "Phụ cấp ăn trưa:",
                                &format!("{} ₫", format_vnd(current.allowance)),
                            );
                            render_row(
                                ui,
                                "Thưởng KPI hiệu quả:",
                                &format!("{} ₫", format_vnd(current.bonus)),
                            );
                            ui.separator();
                            render_row(
                                ui,
                                "Tổng thu nhập:",
                                &format!(
                                    "{} ₫",
                                    format_vnd(
                                        current.salary_base + current.allowance + current.bonus
                                    )
                                ),
                            );
                        });

                        // Deductions (-)
                        cols[1].group(|ui| {
                            ui.label(
                                RichText::new("CÁC KHOẢN GIẢM TRỪ (-)")
                                    .strong()
                                    .color(Color32::from_rgb(220, 38, 38)),
                            );
                            ui.add_space(6.0);
                            render_row(
                                ui,
                                "BHXH, BHYT, BHTN (10.5%):",
                                &format!("{} ₫", format_vnd(current.insurance)),
                            );
                            render_row(
                                ui,
                                "Thuế TNCN tạm khấu trừ:",
                                &format!("{} ₫", format_vnd(current.tax)),
                            );
                            ui.separator();
                            render_row(
                                ui,
                                "Tổng khấu trừ:",
                                &format!("{} ₫", format_vnd(current.insurance + current.tax)),
                            );
                        });
                    });

                    ui.add_space(16.0);

                    // Net Pay
                    egui::Frame::none()
                        .fill(Color32::from_rgb(236, 253, 245))
                        .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(167, 243, 208)))
                        .rounding(8.0)
                        .inner_margin(14.0)
                        .show(ui, |ui| {
                            ui.horizontal(|ui| {
                                ui.vertical(|ui| {
                                    ui.label(
                                        RichText::new("THỰC LĨNH CHUYỂN KHOẢN")
                                            .size(11.0)
                                            .strong()
                                            .color(Color32::from_rgb(6, 95, 70)),
                                    );
                                    ui.label(
                                        RichText::new(format!(
                                            "{} ₫",
                                            format_vnd(current.net_salary)
                                        ))
                                        .size(22.0)
                                        .strong()
                                        .color(Color32::from_rgb(4, 120, 87)),
                                    );
                                });
                                ui.with_layout(
                                    egui::Layout::right_to_left(egui::Align::Center),
                                    |ui| {
                                        ui.label(
                                            RichText::new(format!("✓ {}", current.status))
                                                .strong()
                                                .color(Color32::from_rgb(4, 120, 87)),
                                        );
                                    },
                                );
                            });
                        });
                });
        });
    }
}

fn render_row(ui: &mut Ui, label: &str, val: &str) {
    ui.horizontal(|ui| {
        ui.label(label);
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            ui.label(val);
        });
    });
}
