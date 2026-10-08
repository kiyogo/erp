use crate::{
    api::{ApiClient, ApiTask, EmployeeResponse},
    models::{Employee, NavItem, Session},
};
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
    profile: Option<Employee>,
    profile_task: Option<ApiTask<EmployeeResponse>>,
    profile_update_task: Option<ApiTask<EmployeeResponse>>,
    profile_loaded_for: Option<String>,
    profile_loading: bool,
    profile_editing: bool,
    profile_phone: String,
    profile_error: String,
}

impl Default for EmployeePortalView {
    fn default() -> Self {
        Self {
            payslips: Vec::new(),
            selected_month_idx: 0,
            notice: String::new(),
            profile: None,
            profile_task: None,
            profile_update_task: None,
            profile_loaded_for: None,
            profile_loading: false,
            profile_editing: false,
            profile_phone: String::new(),
            profile_error: String::new(),
        }
    }
}

impl EmployeePortalView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    pub fn render_profile(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if self.profile_loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.profile_loaded_for = Some(session.user.id.clone());
            self.profile = None;
            self.profile_phone.clear();
            self.profile_error.clear();
            self.profile_loading = true;
            self.profile_task = Some(api.my_employee_profile_task(session));
        }

        if let Some(result) = self.profile_task.as_ref().and_then(ApiClient::poll) {
            self.profile_task = None;
            self.profile_loading = false;
            match result {
                Ok(response) => {
                    self.profile_phone = response.employee.phone.clone();
                    self.profile = Some(response.employee);
                    self.profile_error.clear();
                }
                Err(error) => self.profile_error = error,
            }
        }

        if let Some(result) = self.profile_update_task.as_ref().and_then(ApiClient::poll) {
            self.profile_update_task = None;
            match result {
                Ok(response) => {
                    self.profile_phone = response.employee.phone.clone();
                    self.profile = Some(response.employee);
                    self.profile_editing = false;
                    self.profile_error.clear();
                    self.notice = "Đã cập nhật số điện thoại trong hồ sơ.".to_owned();
                }
                Err(error) => self.profile_error = error,
            }
        }

        if self.profile_task.is_some() || self.profile_update_task.is_some() {
            ui.ctx().request_repaint_after(std::time::Duration::from_millis(80));
        }

        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new("THÔNG TIN CỦA TÔI")
                            .size(11.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.heading("Hồ sơ nhân viên");
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.button("Tải lại").clicked()
                        && self.profile_task.is_none()
                        && self.profile_update_task.is_none()
                    {
                        self.profile_loading = true;
                        self.profile_error.clear();
                        self.profile_task = Some(api.my_employee_profile_task(session));
                    }
                });
            });

            if !self.notice.is_empty() {
                ui.label(RichText::new(&self.notice).color(Color32::from_rgb(22, 101, 52)));
            }
            if !self.profile_error.is_empty() {
                ui.label(RichText::new(&self.profile_error).color(Color32::from_rgb(185, 28, 28)));
                if self.profile.is_none() && ui.button("Thử lại").clicked() {
                    self.profile_loading = true;
                    self.profile_error.clear();
                    self.profile_task = Some(api.my_employee_profile_task(session));
                }
            }

            if self.profile_loading {
                ui.add_space(12.0);
                ui.spinner();
                ui.label("Đang tải hồ sơ...");
            } else if let Some(profile) = self.profile.clone() {
                ui.add_space(12.0);
                egui::Frame::group(ui.style()).show(ui, |ui| {
                    ui.set_min_width(ui.available_width());
                    ui.heading(&profile.name);
                    ui.label(&profile.email);
                    ui.separator();
                    ui.columns(2, |columns| {
                        profile_field(&mut columns[0], "Mã nhân viên", &profile.code);
                        profile_field(&mut columns[1], "Đơn vị", &profile.department);
                        profile_field(&mut columns[0], "Chức danh", &profile.position);
                        profile_field(&mut columns[1], "Trạng thái", &profile.status);
                        profile_field(&mut columns[0], "Ngày vào làm", &profile.join_date);
                    });
                    ui.separator();
                    if self.profile_editing {
                        ui.label("Số điện thoại");
                        ui.add(
                            egui::TextEdit::singleline(&mut self.profile_phone)
                                .desired_width(280.0)
                                .char_limit(32),
                        );
                        ui.horizontal(|ui| {
                            let saving = self.profile_update_task.is_some();
                            if ui
                                .add_enabled(!saving, egui::Button::new("Lưu số điện thoại"))
                                .clicked()
                            {
                                match validate_profile_phone(&self.profile_phone) {
                                    Ok(phone) => {
                                        self.profile_error.clear();
                                        self.notice.clear();
                                        self.profile_update_task = Some(
                                            api.update_my_employee_phone_task(session, &phone),
                                        );
                                    }
                                    Err(error) => self.profile_error = error.to_owned(),
                                }
                            }
                            if ui.add_enabled(!saving, egui::Button::new("Hủy")).clicked() {
                                self.profile_phone = profile.phone.clone();
                                self.profile_editing = false;
                                self.profile_error.clear();
                            }
                            if saving {
                                ui.spinner();
                            }
                        });
                    } else {
                        ui.horizontal(|ui| {
                            ui.label("Số điện thoại:");
                            ui.label(if profile.phone.is_empty() {
                                "Chưa cập nhật"
                            } else {
                                profile.phone.as_str()
                            });
                            if ui.button("Sửa").clicked() {
                                self.profile_phone = profile.phone.clone();
                                self.profile_editing = true;
                                self.profile_error.clear();
                            }
                        });
                    }
                });
                ui.add_space(8.0);
                ui.label(
                    RichText::new(
                        "Nhân viên chỉ tự cập nhật số điện thoại. Thông tin định danh, lương, chức danh và trạng thái do HR quản lý.",
                    )
                    .size(11.0)
                    .color(Color32::from_rgb(100, 116, 139)),
                );
                ui.label(
                    RichText::new(
                        "Địa chỉ, ảnh đại diện, tài khoản ngân hàng và biểu mẫu onboarding chưa được kết nối trong bản Rust.",
                    )
                    .size(11.0)
                    .color(Color32::from_rgb(100, 116, 139)),
                );
            }
        });
    }

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
        if self.payslips.is_empty() {
            ui.vertical(|ui| {
                ui.label(
                    RichText::new("THU NHẬP CÁ NHÂN")
                        .size(11.0)
                        .strong()
                        .color(Color32::from_rgb(0, 150, 136)),
                );
                ui.heading("Phiếu lương & Thu nhập");
                ui.add_space(12.0);
                egui::Frame::none()
                    .fill(Color32::from_rgb(248, 250, 252))
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                    .rounding(8.0)
                    .inner_margin(16.0)
                    .show(ui, |ui| {
                        ui.label(RichText::new("Chưa có phiếu lương được phát hành.").strong());
                        ui.label(
                            "Dữ liệu bảng lương chưa được kết nối từ hệ thống nhân sự; màn hình sẽ không hiển thị số liệu mẫu.",
                        );
                    });
            });
            return;
        }

        self.selected_month_idx = self.selected_month_idx.min(self.payslips.len() - 1);
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

fn profile_field(ui: &mut Ui, label: &str, value: &str) {
    ui.horizontal(|ui| {
        ui.label(RichText::new(format!("{label}:")).color(Color32::from_rgb(100, 116, 139)));
        ui.label(if value.is_empty() { "Chưa cập nhật" } else { value });
    });
}

fn validate_profile_phone(phone: &str) -> Result<String, &'static str> {
    let phone = phone.trim();
    if phone.len() > 32 {
        return Err("Số điện thoại không được vượt quá 32 byte.");
    }
    Ok(phone.to_owned())
}

fn render_row(ui: &mut Ui, label: &str, val: &str) {
    ui.horizontal(|ui| {
        ui.label(label);
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            ui.label(val);
        });
    });
}

#[cfg(test)]
mod tests {
    use super::{EmployeePortalView, validate_profile_phone};

    #[test]
    fn payslip_view_starts_without_fabricated_salary_records() {
        assert!(EmployeePortalView::default().payslips.is_empty());
    }

    #[test]
    fn profile_phone_validation_trims_and_obeys_backend_limit() {
        assert_eq!(validate_profile_phone(" 0900000000 "), Ok("0900000000".to_owned()));
        assert!(validate_profile_phone(&"x".repeat(33)).is_err());
    }
}
