use crate::views::employees::format_vnd;
use crate::{
    api::{
        ApiClient, ApiTask, EmployeeBankAccount, EmployeeBankAccountsResponse, EmployeePayslip,
        EmployeePayslipsPagination, EmployeePayslipsResponse, EmployeeResponse,
    },
    models::{Employee, Session},
};
use egui::{Color32, RichText, Ui};

const PAYSLIP_PAGE_SIZE: usize = 10;

pub struct EmployeePortalView {
    pub payslips: Vec<EmployeePayslip>,
    pub selected_month_idx: usize,
    pub notice: String,
    payslips_task: Option<ApiTask<EmployeePayslipsResponse>>,
    payslips_loaded_for: Option<String>,
    payslips_loading: bool,
    payslips_error: String,
    payslips_pagination: Option<EmployeePayslipsPagination>,
    payslips_search: String,
    payslips_page: usize,
    profile: Option<Employee>,
    profile_task: Option<ApiTask<EmployeeResponse>>,
    profile_update_task: Option<ApiTask<EmployeeResponse>>,
    profile_loaded_for: Option<String>,
    profile_loading: bool,
    profile_editing: bool,
    profile_phone: String,
    profile_address: String,
    profile_error: String,
    home_bank_accounts: Option<Vec<EmployeeBankAccount>>,
    home_bank_task: Option<ApiTask<EmployeeBankAccountsResponse>>,
    home_bank_error: String,
}

impl Default for EmployeePortalView {
    fn default() -> Self {
        Self {
            payslips: Vec::new(),
            selected_month_idx: 0,
            notice: String::new(),
            payslips_task: None,
            payslips_loaded_for: None,
            payslips_loading: false,
            payslips_error: String::new(),
            payslips_pagination: None,
            payslips_search: String::new(),
            payslips_page: 1,
            profile: None,
            profile_task: None,
            profile_update_task: None,
            profile_loaded_for: None,
            profile_loading: false,
            profile_editing: false,
            profile_phone: String::new(),
            profile_address: String::new(),
            profile_error: String::new(),
            home_bank_accounts: None,
            home_bank_task: None,
            home_bank_error: String::new(),
        }
    }
}

impl EmployeePortalView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn reset_profile_for_account(&mut self, identity: String) {
        self.profile_loaded_for = Some(identity);
        self.profile = None;
        self.profile_task = None;
        self.profile_update_task = None;
        self.profile_loading = false;
        self.profile_editing = false;
        self.profile_phone.clear();
        self.profile_address.clear();
        self.profile_error.clear();
        self.home_bank_accounts = None;
        self.home_bank_task = None;
        self.home_bank_error.clear();
        self.notice.clear();
    }

    fn poll_profile(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let identity = profile_identity(session);
        if self.profile_loaded_for.as_deref() != Some(identity.as_str()) {
            self.reset_profile_for_account(identity);
            self.profile_loading = true;
            self.profile_task = Some(api.my_employee_profile_task(session));
        }

        if let Some(result) = self.profile_task.as_ref().and_then(ApiClient::poll) {
            self.profile_task = None;
            self.profile_loading = false;
            match result {
                Ok(response) => {
                    self.profile_phone = response.employee.phone.clone();
                    self.profile_address = response.employee.address.clone();
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
                    self.profile_address = response.employee.address.clone();
                    self.profile = Some(response.employee);
                    self.profile_editing = false;
                    self.profile_error.clear();
                    self.notice = "Đã cập nhật thông tin liên hệ trong hồ sơ.".to_owned();
                }
                Err(error) => self.profile_error = error,
            }
        }

        if self.profile_task.is_some() || self.profile_update_task.is_some() {
            ctx.request_repaint_after(std::time::Duration::from_millis(80));
        }
    }

    pub fn render_profile(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        self.poll_profile(ui.ctx(), session, api);

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
                    let columns = if ui.available_width() >= 600.0 { 2 } else { 1 };
                    let join_date = profile_date(&profile.join_date);
                    ui.columns(columns, |columns| {
                        let count = columns.len();
                        for (index, (label, value)) in [
                            ("Mã nhân viên", profile.code.as_str()),
                            ("Đơn vị", profile.department.as_str()),
                            ("Chức danh", profile.position.as_str()),
                            ("Trạng thái", profile.status.as_str()),
                            ("Ngày vào làm", join_date.as_str()),
                            ("Địa chỉ liên hệ", profile.address.as_str()),
                        ].into_iter().enumerate() {
                            profile_field(&mut columns[index % count], label, value);
                        }
                    });
                    ui.separator();
                    if self.profile_editing {
                        ui.label("Số điện thoại");
                        ui.add(
                            egui::TextEdit::singleline(&mut self.profile_phone)
                                .desired_width(ui.available_width().min(280.0))
                                .char_limit(32),
                        );
                        ui.add_space(6.0);
                        ui.label("Địa chỉ liên hệ");
                        ui.add(
                            egui::TextEdit::singleline(&mut self.profile_address)
                                .desired_width(ui.available_width())
                                .char_limit(512),
                        );
                        ui.horizontal_wrapped(|ui| {
                            let saving = self.profile_update_task.is_some();
                            if ui
                                .add_enabled(!saving, egui::Button::new("Lưu thông tin liên hệ"))
                                .clicked()
                            {
                                match validate_profile_contact(
                                    &self.profile_phone,
                                    &self.profile_address,
                                ) {
                                    Ok((phone, address)) => {
                                        self.profile_error.clear();
                                        self.notice.clear();
                                        self.profile_update_task = Some(
                                            api.save_my_employee_contact_task(
                                                session, &phone, &address,
                                            ),
                                        );
                                    }
                                    Err(error) => self.profile_error = error.to_owned(),
                                }
                            }
                            if ui.add_enabled(!saving, egui::Button::new("Hủy")).clicked() {
                                self.profile_phone = profile.phone.clone();
                                self.profile_address = profile.address.clone();
                                self.profile_editing = false;
                                self.profile_error.clear();
                            }
                            if saving {
                                ui.spinner();
                            }
                        });
                    } else {
                        ui.horizontal_wrapped(|ui| {
                            ui.label("Số điện thoại:");
                            ui.label(if profile.phone.is_empty() {
                                "Chưa cập nhật"
                            } else {
                                profile.phone.as_str()
                            });
                            if ui.button("Sửa thông tin liên hệ").clicked() {
                                self.profile_phone = profile.phone.clone();
                                self.profile_address = profile.address.clone();
                                self.profile_editing = true;
                                self.profile_error.clear();
                            }
                        });
                    }
                });
                ui.add_space(8.0);
                ui.label(
                    RichText::new(
                        "Nhân viên chỉ tự cập nhật số điện thoại và địa chỉ liên hệ. Định danh, lương, chức danh và trạng thái do HR quản lý.",
                    )
                    .size(11.0)
                    .color(Color32::from_rgb(100, 116, 139)),
                );
                ui.label(
                    RichText::new(
                        "Ảnh đại diện và biểu mẫu onboarding chưa được kết nối trong bản Rust; tài khoản ngân hàng được quản lý riêng ở mục phía dưới.",
                    )
                    .size(11.0)
                    .color(Color32::from_rgb(100, 116, 139)),
                );
            }
        });
    }

    pub fn render_home(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        self.poll_profile(ui.ctx(), session, api);
        self.poll_home_bank(ui.ctx(), session, api);
        ui.add_space(8.0);
        render_home_banner(ui, self.profile.as_ref(), session);
        ui.add_space(16.0);
        let bank = self
            .home_bank_accounts
            .as_deref()
            .and_then(|accounts| primary_home_bank(accounts, &session.user.id));
        render_home_cards(ui, self.profile.as_ref(), session, bank);
        if self.profile_loading {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải hồ sơ...");
            });
        }
        if !self.profile_error.is_empty() {
            ui.add(
                egui::Label::new(
                    RichText::new(&self.profile_error).color(Color32::from_rgb(185, 28, 28)),
                )
                .wrap(),
            );
            if ui
                .add_enabled(
                    self.profile_task.is_none() && self.profile_update_task.is_none(),
                    egui::Button::new("Thử tải lại hồ sơ"),
                )
                .clicked()
            {
                self.profile_loading = true;
                self.profile_task = Some(api.my_employee_profile_task(session));
            }
        }
        if self.home_bank_task.is_some() {
            ui.spinner();
        }
        if !self.home_bank_error.is_empty() {
            ui.add(
                egui::Label::new(
                    RichText::new(&self.home_bank_error).color(Color32::from_rgb(185, 28, 28)),
                )
                .wrap(),
            );
            if session.user.role != "ADMIN"
                && ui.button("Thử tải lại tài khoản nhận lương").clicked()
            {
                self.home_bank_error.clear();
                self.home_bank_accounts = None;
            }
        }
        if !self.notice.is_empty() {
            ui.add(egui::Label::new(&self.notice).wrap());
        }
    }

    fn poll_home_bank(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if session.user.role == "ADMIN" {
            return;
        }
        if let Some(result) = self.home_bank_task.as_ref().and_then(ApiClient::poll) {
            self.home_bank_task = None;
            match result {
                Ok(response) => {
                    self.home_bank_accounts = Some(
                        response
                            .data
                            .into_iter()
                            .filter(|account| account.employee_id == session.user.id)
                            .collect(),
                    );
                    self.home_bank_error.clear();
                }
                Err(error) => {
                    self.home_bank_error = format!("Không thể tải tài khoản nhận lương: {error}")
                }
            }
        }
        if self.profile.is_some()
            && self.home_bank_accounts.is_none()
            && self.home_bank_task.is_none()
            && self.home_bank_error.is_empty()
        {
            self.home_bank_task = Some(api.list_employee_bank_accounts_task(session));
        }
        if self.home_bank_task.is_some() {
            ctx.request_repaint_after(std::time::Duration::from_millis(80));
        }
    }

    fn reset_payslips_for_account(&mut self, user_id: &str) {
        self.payslips.clear();
        self.payslips_task = None;
        self.payslips_loaded_for = Some(user_id.to_owned());
        self.payslips_loading = false;
        self.payslips_error.clear();
        self.payslips_pagination = None;
        self.payslips_search.clear();
        self.payslips_page = 1;
        self.selected_month_idx = 0;
    }

    fn request_payslips(&mut self, session: &Session, api: &ApiClient) {
        self.payslips.clear();
        self.payslips_pagination = None;
        self.selected_month_idx = 0;
        self.payslips_loading = true;
        self.payslips_error.clear();
        self.payslips_task = Some(api.my_employee_payslips_task(
            session,
            self.payslips_page,
            PAYSLIP_PAGE_SIZE,
            &self.payslips_search,
        ));
    }

    pub fn render_payslips(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if self.payslips_loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.reset_payslips_for_account(&session.user.id);
            self.request_payslips(session, api);
        }

        if let Some(result) = self.payslips_task.as_ref().and_then(ApiClient::poll) {
            self.payslips_task = None;
            self.payslips_loading = false;
            match result {
                Ok(response) => {
                    self.payslips = response.data;
                    self.payslips_page = response.pagination.page;
                    self.selected_month_idx = 0;
                    self.payslips_pagination = Some(response.pagination);
                    self.payslips_error.clear();
                }
                Err(error) => self.payslips_error = error,
            }
        }

        ui.label(
            RichText::new("THU NHẬP CÁ NHÂN")
                .size(11.0)
                .strong()
                .color(Color32::from_rgb(0, 150, 136)),
        );
        ui.heading("Phiếu lương & Thu nhập");
        let mut requested_page = None;
        ui.horizontal(|ui| {
            ui.label("Tìm kỳ lương/trạng thái:");
            let search = ui.text_edit_singleline(&mut self.payslips_search);
            if ui.button("Tìm").clicked()
                || (search.lost_focus() && ui.input(|input| input.key_pressed(egui::Key::Enter)))
            {
                requested_page = Some(1);
            }
            if ui.button("Xóa lọc").clicked() {
                self.payslips_search.clear();
                requested_page = Some(1);
            }
            if ui.button("Tải lại").clicked() {
                requested_page = Some(self.payslips_page);
            }
        });
        if let Some(pagination) = self.payslips_pagination.clone() {
            ui.horizontal(|ui| {
                ui.label(format!("{} phiếu lương", pagination.total));
                if ui
                    .add_enabled(self.payslips_page > 1, egui::Button::new("‹ Trang trước"))
                    .clicked()
                {
                    requested_page = Some(self.payslips_page - 1);
                }
                ui.label(format!(
                    "Trang {} / {}",
                    self.payslips_page,
                    pagination.total_pages.max(1)
                ));
                if ui
                    .add_enabled(
                        self.payslips_page < pagination.total_pages,
                        egui::Button::new("Trang sau ›"),
                    )
                    .clicked()
                {
                    requested_page = Some(self.payslips_page + 1);
                }
            });
        }
        if let Some(page) = requested_page {
            self.payslips_page = page;
            self.request_payslips(session, api);
        }

        if self.payslips_loading {
            ui.spinner();
            ui.label("Đang tải phiếu lương của tài khoản này...");
            return;
        }
        if !self.payslips_error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.payslips_error);
            if ui.button("Thử tải lại").clicked() {
                self.request_payslips(session, api);
            }
            return;
        }

        if self.payslips.is_empty() {
            ui.vertical(|ui| {
                ui.add_space(12.0);
                egui::Frame::none()
                    .fill(Color32::from_rgb(248, 250, 252))
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                    .rounding(8.0)
                    .inner_margin(16.0)
                    .show(ui, |ui| {
                        ui.label(RichText::new("Chưa có phiếu lương được gắn an toàn với tài khoản này.").strong());
                        ui.label(
                            "Bản ghi lịch sử thiếu mã tài khoản nhân viên sẽ không được hiển thị để tránh lộ thông tin lương của người khác.",
                        );
                    });
            });
            return;
        }

        self.selected_month_idx = self.selected_month_idx.min(self.payslips.len() - 1);
        let current = &self.payslips[self.selected_month_idx];

        ui.vertical(|ui| {
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                egui::ComboBox::from_id_salt("payslip_month_combo")
                    .selected_text(current.month.as_deref().unwrap_or("Kỳ lương chưa xác định"))
                    .show_ui(ui, |ui| {
                        for (idx, p) in self.payslips.iter().enumerate() {
                            ui.selectable_value(
                                &mut self.selected_month_idx,
                                idx,
                                p.month.as_deref().unwrap_or("Kỳ lương chưa xác định"),
                            );
                        }
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
                            ui.label(
                                RichText::new(current.month.as_deref().unwrap_or("Kỳ lương chưa xác định"))
                                    .size(18.0)
                                    .strong(),
                            );
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
                                &amount_text(current.basic_salary),
                            );
                            render_row(
                                ui,
                                "Phụ cấp:",
                                &amount_text(current.allowance),
                            );
                            render_row(
                                ui,
                                "Thưởng KPI:",
                                &amount_text(current.bonus_kpi),
                            );
                            ui.separator();
                            let total_income = current
                                .basic_salary
                                .zip(current.allowance)
                                .zip(current.bonus_kpi)
                                .and_then(|((base, allowance), bonus)| {
                                    base.checked_add(allowance)?.checked_add(bonus)
                                });
                            render_row(
                                ui,
                                "Tổng thu nhập nguồn:",
                                &amount_text(total_income),
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
                                "BHXH/BHYT/BHTN:",
                                &amount_text(current.insurance_deduction),
                            );
                            render_row(
                                ui,
                                "Thuế TNCN:",
                                &amount_text(current.personal_tax),
                            );
                            ui.separator();
                            let deductions = current
                                .insurance_deduction
                                .zip(current.personal_tax)
                                .and_then(|(insurance, tax)| insurance.checked_add(tax));
                            render_row(
                                ui,
                                "Tổng khấu trừ nguồn:",
                                &amount_text(deductions),
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
                                            "{}",
                                            amount_text(current.net_salary)
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
                                            RichText::new(format!(
                                                "Nguồn: {} (chưa xác minh)",
                                                current.source_status.as_deref().unwrap_or("chưa có trạng thái")
                                            ))
                                                .strong()
                                                .color(Color32::from_rgb(4, 120, 87)),
                                        );
                                    },
                                );
                            });
                        });
                    ui.colored_label(
                        Color32::from_rgb(146, 64, 14),
                        "Số liệu và trạng thái nguồn chưa được HR đối chiếu. Đây không phải xác nhận thanh toán hay chữ ký số.",
                    );
                });
        });
    }
}

fn profile_identity(session: &Session) -> String {
    format!(
        "{}\n{}\n{}",
        session.endpoint, session.user.id, session.session_id
    )
}

fn profile_known(value: &str) -> &str {
    if value.trim().is_empty() {
        "Chưa có dữ liệu"
    } else {
        value
    }
}

fn profile_date(value: &str) -> String {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .or_else(|_| chrono::DateTime::parse_from_rfc3339(value).map(|date| date.date_naive()))
        .or_else(|_| chrono::NaiveDate::parse_from_str(value, "%d/%m/%Y"))
        .map(|date| date.format("%d/%m/%Y").to_string())
        .unwrap_or_else(|_| "Chưa có dữ liệu".into())
}

fn primary_home_bank<'a>(
    accounts: &'a [EmployeeBankAccount],
    user_id: &str,
) -> Option<&'a EmployeeBankAccount> {
    accounts.iter().find(|account| {
        account.employee_id == user_id && account.is_primary && account.status == "Đã duyệt"
    })
}

fn home_bank_number(number: &str) -> String {
    if number.trim().is_empty() {
        return "Chưa có dữ liệu".into();
    }
    if number.chars().count() <= 4 {
        return "••••".into();
    }
    let tail = number
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<String>();
    format!("•••• {tail}")
}

fn home_text(
    ui: &Ui,
    text: &str,
    width: f32,
    size: f32,
    bold: bool,
    color: Color32,
) -> std::sync::Arc<egui::Galley> {
    let mut job = egui::text::LayoutJob::default();
    job.wrap.max_width = width.max(1.0);
    job.append(
        text,
        0.0,
        egui::TextFormat {
            font_id: crate::native_text::weighted_font(ui.ctx(), size, bold),
            line_height: Some(size * 1.5),
            color,
            ..Default::default()
        },
    );
    ui.fonts(|fonts| fonts.layout_job(job))
}

fn home_icon(ui: &Ui, rect: egui::Rect, index: usize, color: Color32) {
    let (name, bytes): (&str, &[u8]) = match index {
        1 => (
            "UserOutlined",
            include_bytes!("../../assets/nav-icons/UserOutlined.svg"),
        ),
        2 => (
            "CalendarOutlined",
            include_bytes!("../../assets/nav-icons/CalendarOutlined.svg"),
        ),
        3 => (
            "CheckSquareOutlined",
            include_bytes!("../../assets/nav-icons/CheckSquareOutlined.svg"),
        ),
        4 => (
            "ShopOutlined",
            include_bytes!("../../assets/nav-icons/ShopOutlined.svg"),
        ),
        6 => (
            "BankOutlined",
            include_bytes!("../../assets/nav-icons/BankOutlined.svg"),
        ),
        7 => (
            "SafetyCertificateOutlined",
            include_bytes!("../../assets/nav-icons/SafetyCertificateOutlined.svg"),
        ),
        8 => (
            "CustomerServiceOutlined",
            include_bytes!("../../assets/nav-icons/CustomerServiceOutlined.svg"),
        ),
        _ => (
            "TeamOutlined",
            include_bytes!("../../assets/nav-icons/TeamOutlined.svg"),
        ),
    };
    egui::Image::from_bytes(format!("bytes://employee-home-{name}.svg"), bytes)
        .tint(color)
        .paint_at(ui, rect);
}

fn render_home_banner(ui: &mut Ui, profile: Option<&Employee>, session: &Session) {
    let name = profile
        .map(|profile| profile.name.as_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or(&session.user.name);
    let chips = [
        (
            "Mã nhân viên",
            profile
                .map(|profile| profile.code.clone())
                .unwrap_or_default(),
        ),
        (
            "Chức vụ",
            profile
                .map(|profile| profile.position.clone())
                .unwrap_or_default(),
        ),
        (
            "Vào làm",
            profile
                .map(|profile| profile_date(&profile.join_date))
                .unwrap_or_default(),
        ),
        (
            "Trạng thái",
            profile
                .map(|profile| profile.status.clone())
                .unwrap_or_default(),
        ),
        (
            "Đơn vị",
            profile
                .map(|profile| profile.department.clone())
                .unwrap_or_default(),
        ),
        ("Quản lý", String::new()),
    ];
    let width = ui.available_width();
    let narrow = width < 540.0;
    let inner = (width - 32.0).max(1.0);
    let name_width = (inner - 88.0).max(1.0);
    let grid_width = if narrow { inner } else { name_width };
    let columns = crate::widgets::grid_columns(grid_width, 130.0, 8.0, 6);
    let chip_width = (grid_width - 8.0 * (columns - 1) as f32) / columns as f32;
    let title = home_text(
        ui,
        profile_known(name),
        name_width,
        18.0,
        true,
        Color32::from_rgb(17, 24, 39),
    );
    let mut rows = vec![0.0_f32; 6_usize.div_ceil(columns)];
    let texts = chips
        .iter()
        .enumerate()
        .map(|(index, (label, value))| {
            let label = home_text(
                ui,
                label,
                chip_width - 64.0,
                10.5,
                false,
                Color32::from_rgb(100, 116, 139),
            );
            let value = home_text(
                ui,
                profile_known(value),
                chip_width - 64.0,
                12.5,
                true,
                Color32::from_rgb(30, 41, 59),
            );
            rows[index / columns] =
                rows[index / columns].max((label.size().y + value.size().y).max(28.0) + 12.0);
            (label, value)
        })
        .collect::<Vec<_>>();
    let grid_height = rows.iter().sum::<f32>() + 8.0 * rows.len().saturating_sub(1) as f32;
    let info_height = title.size().y + 10.0 + grid_height;
    let header_height = title.size().y.max(96.0);
    let content_height = if narrow {
        header_height + 12.0 + grid_height
    } else {
        info_height.max(96.0)
    };
    let (banner, response) = ui.allocate_exact_size(
        egui::vec2(width, content_height + 32.0),
        egui::Sense::hover(),
    );
    crate::widgets::gradient_panel(
        ui.painter(),
        banner,
        8.0,
        Color32::from_rgb(244, 238, 253),
        Color32::from_rgb(232, 242, 253),
    );
    ui.painter().rect_stroke(
        banner.shrink(0.5),
        8.0,
        egui::Stroke::new(1.0, Color32::from_rgb(228, 220, 245)),
    );
    let avatar = egui::Rect::from_min_size(
        banner.min
            + egui::vec2(
                16.0,
                16.0 + if narrow {
                    (header_height - 96.0) / 2.0
                } else {
                    (content_height - 96.0) / 2.0
                },
            ),
        egui::vec2(72.0, 96.0),
    );
    crate::widgets::gradient_panel(
        ui.painter(),
        avatar,
        6.0,
        Color32::from_rgb(226, 232, 240),
        Color32::from_rgb(203, 213, 225),
    );
    let initial = name
        .trim()
        .chars()
        .next()
        .map(|character| character.to_uppercase().collect::<String>())
        .unwrap_or_else(|| "?".into());
    ui.painter().text(
        avatar.center(),
        egui::Align2::CENTER_CENTER,
        initial,
        crate::native_text::weighted_font(ui.ctx(), 24.0, true),
        Color32::from_rgb(71, 85, 105),
    );
    ui.interact(
        avatar,
        ui.id().with("employee.home.avatar"),
        egui::Sense::hover(),
    )
    .on_hover_text("Ảnh đại diện chưa được kết nối; đang hiển thị chữ cái tên tài khoản.");
    let title_pos = banner.min
        + egui::vec2(
            104.0,
            16.0 + if narrow {
                (header_height - title.size().y) / 2.0
            } else {
                (content_height - info_height) / 2.0
            },
        );
    ui.painter()
        .galley(title_pos, title.clone(), Color32::from_rgb(17, 24, 39));
    let grid_pos = if narrow {
        banner.min + egui::vec2(16.0, 16.0 + header_height + 12.0)
    } else {
        title_pos + egui::vec2(0.0, title.size().y + 10.0)
    };
    let colors = [
        Color32::from_rgb(37, 99, 235),
        Color32::from_rgb(124, 58, 237),
        Color32::from_rgb(22, 163, 74),
        Color32::from_rgb(22, 163, 74),
        Color32::from_rgb(217, 119, 6),
        Color32::from_rgb(67, 56, 202),
    ];
    let fills = [
        Color32::from_rgb(219, 234, 254),
        Color32::from_rgb(237, 233, 254),
        Color32::from_rgb(220, 252, 231),
        Color32::from_rgb(220, 252, 231),
        Color32::from_rgb(254, 243, 199),
        Color32::from_rgb(224, 231, 255),
    ];
    for (index, (label, value)) in texts.iter().enumerate() {
        let y = rows[..index / columns].iter().sum::<f32>() + 8.0 * (index / columns) as f32;
        let rect = egui::Rect::from_min_size(
            grid_pos + egui::vec2((chip_width + 8.0) * (index % columns) as f32, y),
            egui::vec2(chip_width, rows[index / columns]),
        );
        ui.painter().rect_filled(rect, 8.0, Color32::WHITE);
        ui.painter().rect_stroke(
            rect.shrink(0.5),
            8.0,
            egui::Stroke::new(1.0, Color32::from_rgb(232, 238, 245)),
        );
        let icon = egui::Rect::from_center_size(
            egui::pos2(rect.left() + 27.0, rect.center().y),
            egui::vec2(28.0, 28.0),
        );
        ui.painter().rect_filled(icon, 6.0, fills[index]);
        if index == 0 {
            ui.painter().text(
                icon.center(),
                egui::Align2::CENTER_CENTER,
                "#",
                crate::native_text::weighted_font(ui.ctx(), 15.0, true),
                colors[index],
            );
        } else {
            home_icon(
                ui,
                egui::Rect::from_center_size(icon.center(), egui::vec2(14.0, 14.0)),
                index,
                colors[index],
            );
        }
        let pos = egui::pos2(
            rect.left() + 51.0,
            rect.center().y - (label.size().y + value.size().y) / 2.0,
        );
        ui.painter()
            .galley(pos, label.clone(), Color32::from_rgb(100, 116, 139));
        ui.painter().galley(
            pos + egui::vec2(0.0, label.size().y),
            value.clone(),
            Color32::from_rgb(30, 41, 59),
        );
        ui.interact(
            rect,
            ui.id().with(("employee.home.chip", index)),
            egui::Sense::hover(),
        )
        .widget_info(|| {
            egui::WidgetInfo::labeled(
                egui::WidgetType::Label,
                true,
                format!("{}: {}", chips[index].0, profile_known(&chips[index].1)),
            )
        });
    }
    response.widget_info(|| {
        egui::WidgetInfo::labeled(
            egui::WidgetType::Label,
            true,
            format!("Hồ sơ nhân viên: {}", profile_known(name)),
        )
    });
}

fn render_home_cards(
    ui: &mut Ui,
    profile: Option<&Employee>,
    session: &Session,
    bank: Option<&EmployeeBankAccount>,
) {
    let email = profile
        .map(|profile| profile.email.as_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(&session.user.email);
    let cards = [
        (
            "Thông tin Pháp lý & Định danh",
            [
                ("Số CCCD / Hộ chiếu:", "Chưa kết nối".to_owned()),
                ("Mã số thuế cá nhân:", "Chưa kết nối".to_owned()),
                ("Số sổ BHXH:", "Chưa kết nối".to_owned()),
            ],
        ),
        (
            "Tài Khoản Nhận Lương Ngân Hàng",
            [
                (
                    "Tên Ngân hàng:",
                    bank.map(|bank| bank.bank_name.clone()).unwrap_or_default(),
                ),
                (
                    "Số tài khoản:",
                    bank.map(|bank| home_bank_number(&bank.account_number))
                        .unwrap_or_default(),
                ),
                (
                    "Chủ tài khoản:",
                    bank.map(|bank| bank.account_holder.clone())
                        .unwrap_or_default(),
                ),
            ],
        ),
        (
            "Thông Tin Liên Lạc",
            [
                ("Email doanh nghiệp:", email.to_owned()),
                (
                    "Số điện thoại:",
                    profile
                        .map(|profile| profile.phone.clone())
                        .unwrap_or_default(),
                ),
                (
                    "Địa chỉ liên hệ:",
                    profile
                        .map(|profile| profile.address.clone())
                        .unwrap_or_default(),
                ),
            ],
        ),
    ];
    let width = ui.available_width();
    let columns = crate::widgets::grid_columns(width, 360.0, 16.0, 3);
    let card_width = (width - (columns - 1) as f32 * 16.0) / columns as f32;
    let inner = (card_width - 42.0).max(1.0);
    let mut heights = vec![0.0_f32; 3_usize.div_ceil(columns)];
    let texts = cards
        .iter()
        .enumerate()
        .map(|(index, (title, fields))| {
            let title = home_text(
                ui,
                title,
                inner - 22.0,
                14.0,
                true,
                Color32::from_rgb(33, 33, 33),
            );
            let fields = fields
                .iter()
                .enumerate()
                .map(|(row, (label, value))| {
                    let label = home_text(
                        ui,
                        label,
                        (inner - 10.0) * 0.48,
                        13.0,
                        false,
                        Color32::from_rgb(117, 117, 117),
                    );
                    let color = if index == 1 && row == 1 {
                        crate::theme::PRIMARY
                    } else {
                        Color32::from_rgb(33, 33, 33)
                    };
                    let value = home_text(
                        ui,
                        profile_known(value),
                        (inner - 10.0) * 0.52,
                        13.0,
                        true,
                        color,
                    );
                    (label, value, color)
                })
                .collect::<Vec<_>>();
            let height = 38.0
                + title.size().y
                + 14.0
                + fields
                    .iter()
                    .map(|(label, value, _)| label.size().y.max(value.size().y))
                    .sum::<f32>()
                + 20.0;
            heights[index / columns] = heights[index / columns].max(height);
            (title, fields)
        })
        .collect::<Vec<_>>();
    let total = heights.iter().sum::<f32>() + 16.0 * heights.len().saturating_sub(1) as f32;
    let (bounds, _) = ui.allocate_exact_size(egui::vec2(width, total), egui::Sense::hover());
    for (index, (title, fields)) in texts.iter().enumerate() {
        let min = bounds.min
            + egui::vec2(
                (card_width + 16.0) * (index % columns) as f32,
                heights[..index / columns].iter().sum::<f32>() + (index / columns) as f32 * 16.0,
            );
        let card = egui::Rect::from_min_size(min, egui::vec2(card_width, heights[index / columns]));
        ui.painter().rect_filled(card, 8.0, Color32::WHITE);
        ui.painter().rect_stroke(
            card.shrink(0.5),
            8.0,
            egui::Stroke::new(1.0, Color32::from_rgb(224, 224, 224)),
        );
        let origin = min + egui::vec2(21.0, 19.0);
        // Existing bundled icons accompany the card headings; no identity verification is implied.
        home_icon(
            ui,
            egui::Rect::from_min_size(origin + egui::vec2(0.0, 3.0), egui::vec2(14.0, 14.0)),
            [7, 6, 8][index],
            crate::theme::PRIMARY,
        );
        ui.painter().galley(
            origin + egui::vec2(22.0, 0.0),
            title.clone(),
            Color32::from_rgb(33, 33, 33),
        );
        let mut y = origin.y + title.size().y + 14.0;
        for (label, value, color) in fields {
            ui.painter().galley(
                egui::pos2(origin.x, y),
                label.clone(),
                Color32::from_rgb(117, 117, 117),
            );
            ui.painter().galley(
                egui::pos2(card.right() - 21.0 - value.size().x, y),
                value.clone(),
                *color,
            );
            y += label.size().y.max(value.size().y) + 10.0;
        }
        let response = ui.interact(
            card,
            ui.id().with(("employee.home.card", index)),
            egui::Sense::hover(),
        );
        response.widget_info(|| {
            egui::WidgetInfo::labeled(
                egui::WidgetType::Label,
                true,
                format!(
                    "{}: {}",
                    cards[index].0,
                    cards[index]
                        .1
                        .iter()
                        .map(|(label, value)| format!("{label} {}", profile_known(value)))
                        .collect::<Vec<_>>()
                        .join("; ")
                ),
            )
        });
        if index == 0 {
            response.on_hover_text("Các thông tin pháp lý chưa có trong dữ liệu hồ sơ hiện tại.");
        } else if index == 1 {
            response.on_hover_text("Chỉ hiển thị tài khoản chính đã duyệt từ API ngân hàng của chính tài khoản này; số tài khoản được che.");
        }
    }
}

fn amount_text(value: Option<u64>) -> String {
    value
        .map(|amount| format!("{} ₫", format_vnd(amount)))
        .unwrap_or_else(|| "Chưa có dữ liệu hợp lệ".to_owned())
}

fn profile_field(ui: &mut Ui, label: &str, value: &str) {
    ui.horizontal_wrapped(|ui| {
        ui.label(RichText::new(format!("{label}:")).color(Color32::from_rgb(100, 116, 139)));
        ui.label(if value.is_empty() {
            "Chưa cập nhật"
        } else {
            value
        });
    });
}

fn validate_profile_phone(phone: &str) -> Result<String, &'static str> {
    let phone = phone.trim();
    if phone.len() > 32 {
        return Err("Số điện thoại không được vượt quá 32 byte.");
    }
    Ok(phone.to_owned())
}

fn validate_profile_contact(phone: &str, address: &str) -> Result<(String, String), &'static str> {
    let phone = validate_profile_phone(phone)?;
    let address = address.trim();
    if address.len() > 512 {
        return Err("Địa chỉ liên hệ không được vượt quá 512 byte.");
    }
    Ok((phone, address.to_owned()))
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
    use super::{
        EmployeePortalView, amount_text, validate_profile_contact, validate_profile_phone,
    };
    use crate::api::EmployeePayslip;

    fn session() -> crate::models::Session {
        crate::models::Session {
            token: String::new(),
            session_id: "test-session".into(),
            endpoint: "http://invalid".into(),
            mode: crate::models::StorageMode::KiyoCloud,
            user: crate::models::User {
                id: "employee-a".into(),
                email: "employee@example.test".into(),
                name: "Nhân viên kiểm thử".into(),
                role: "USER".into(),
                is_active: true,
            },
        }
    }

    fn employee() -> crate::models::Employee {
        crate::models::Employee {
            id: "employee-a".into(),
            code: "NV-001".into(),
            name: "Nhân viên kiểm thử".into(),
            email: "employee@example.test".into(),
            phone: "0900000000".into(),
            address: "Địa chỉ thực tế".into(),
            department: "Kiểm thử".into(),
            position: "Nhân viên".into(),
            status: "Chính thức".into(),
            join_date: "2026-10-25T02:34:36.497436900+00:00".into(),
            salary_base: 0,
            role: "USER".into(),
            is_active: true,
            activation_status: String::new(),
        }
    }

    fn loaded_view(session: &crate::models::Session) -> EmployeePortalView {
        EmployeePortalView {
            profile: Some(employee()),
            profile_loaded_for: Some(super::profile_identity(session)),
            home_bank_accounts: Some(Vec::new()),
            ..Default::default()
        }
    }

    fn shape_text(shapes: &[egui::epaint::ClippedShape]) -> String {
        fn collect(shape: &egui::Shape, text: &mut String) {
            match shape {
                egui::Shape::Text(value) => {
                    text.push_str(&value.galley.job.text);
                    text.push('\n');
                }
                egui::Shape::Vec(values) => {
                    for shape in values {
                        collect(shape, text);
                    }
                }
                _ => {}
            }
        }
        let mut text = String::new();
        for shape in shapes {
            collect(&shape.shape, &mut text);
        }
        text
    }

    #[test]
    fn home_dates_accept_real_dates_and_timestamps_without_raw_time_suffixes() {
        assert_eq!(
            super::profile_date("2026-10-25T02:34:36.497436900+00:00"),
            "25/10/2026"
        );
        assert_eq!(
            super::profile_date("2026-10-25T00:10:00+07:00"),
            "25/10/2026"
        );
        assert_eq!(super::profile_date("2026-01-02"), "02/01/2026");
        assert_eq!(super::profile_date("02/01/2026"), "02/01/2026");
        assert_eq!(super::profile_date("2026-02-30"), "Chưa có dữ liệu");
        assert_eq!(super::profile_date(""), "Chưa có dữ liệu");
    }

    #[test]
    fn home_bank_only_selects_own_approved_primary_and_masks_unicode_safely() {
        let own = crate::api::EmployeeBankAccount {
            employee_id: "employee-a".into(),
            status: "Đã duyệt".into(),
            is_primary: true,
            account_number: "001234567890".into(),
            ..Default::default()
        };
        let mut foreign = own.clone();
        foreign.employee_id = "employee-b".into();
        let mut pending = own.clone();
        pending.status = "Chờ duyệt".into();
        let mut retired = own.clone();
        retired.status = "Đã ngừng sử dụng".into();
        let mut secondary = own.clone();
        secondary.is_primary = false;
        assert!(
            super::primary_home_bank(
                &[foreign.clone(), pending.clone(), retired, secondary],
                "employee-a"
            )
            .is_none()
        );
        let accounts = [foreign, pending, own];
        assert_eq!(
            super::primary_home_bank(&accounts, "employee-a")
                .unwrap()
                .account_number,
            "001234567890"
        );
        assert_eq!(super::home_bank_number("001234567890"), "•••• 7890");
        assert_eq!(super::home_bank_number("１２３４５６"), "•••• ３４５６");
        assert_eq!(super::home_bank_number("1234"), "••••");
        assert_eq!(super::home_bank_number(""), "Chưa có dữ liệu");
    }

    #[test]
    fn switching_profile_identity_drops_pending_edits_bank_data_and_notices() {
        let mut view = loaded_view(&session());
        view.profile_editing = true;
        view.profile_phone = "old draft".into();
        view.notice = "old success".into();
        view.profile_update_task = Some(std::sync::Arc::new(std::sync::Mutex::new(None)));
        view.home_bank_task = Some(std::sync::Arc::new(std::sync::Mutex::new(None)));
        view.reset_profile_for_account("different-server-and-user".into());
        assert!(view.profile.is_none() && view.profile_update_task.is_none());
        assert!(view.home_bank_accounts.is_none() && view.home_bank_task.is_none());
        assert!(!view.profile_editing && view.profile_phone.is_empty() && view.notice.is_empty());
    }

    #[test]
    fn shared_poll_preserves_contact_errors_drafts_and_success_handling() {
        let session = session();
        let mut view = loaded_view(&session);
        view.profile_editing = true;
        view.profile_phone = "0901111111".into();
        view.profile_update_task = Some(std::sync::Arc::new(std::sync::Mutex::new(Some(Err(
            "Không lưu được".into(),
        )))));
        view.poll_profile(
            &egui::Context::default(),
            &session,
            &crate::api::ApiClient::default(),
        );
        assert!(view.profile_editing);
        assert_eq!(view.profile_phone, "0901111111");
        assert_eq!(view.profile_error, "Không lưu được");
        let mut saved = employee();
        saved.phone = "0902222222".into();
        view.profile_update_task = Some(std::sync::Arc::new(std::sync::Mutex::new(Some(Ok(
            crate::api::EmployeeResponse { employee: saved },
        )))));
        view.poll_profile(
            &egui::Context::default(),
            &session,
            &crate::api::ApiClient::default(),
        );
        assert!(!view.profile_editing && view.profile_error.is_empty());
        assert_eq!(view.profile.as_ref().unwrap().phone, "0902222222");
        assert!(!view.notice.is_empty());
    }

    #[test]
    fn home_is_dashboard_while_profile_keeps_the_contact_editor() {
        let session = session();
        let mut view = loaded_view(&session);
        view.profile_editing = true;
        let ctx = egui::Context::default();
        crate::native_text::setup_fonts(&ctx);
        crate::native_text::setup_style(&ctx);
        let input = || egui::RawInput {
            screen_rect: Some(egui::Rect::from_min_size(
                egui::Pos2::ZERO,
                egui::vec2(1440.0, 900.0),
            )),
            ..Default::default()
        };
        let home = ctx.run(input(), |ctx| {
            egui::CentralPanel::default().show(ctx, |ui| {
                view.render_home(ui, &session, &crate::api::ApiClient::default())
            });
        });
        let text = shape_text(&home.shapes);
        assert!(
            text.contains("Thông tin Pháp lý & Định danh")
                && text.contains("Tài Khoản Nhận Lương Ngân Hàng")
        );
        assert!(text.contains("25/10/2026"));
        assert!(!text.contains("Lưu thông tin liên hệ") && !text.contains("THÔNG TIN CỦA TÔI"));
        assert!(view.profile_editing);
        let editor = ctx.run(input(), |ctx| {
            egui::CentralPanel::default().show(ctx, |ui| {
                view.render_profile(ui, &session, &crate::api::ApiClient::default())
            });
        });
        let text = shape_text(&editor.shapes);
        assert!(text.contains("Lưu thông tin liên hệ") && text.contains("THÔNG TIN CỦA TÔI"));
        assert!(!text.contains("Thông tin Pháp lý & Định danh"));
    }

    #[test]
    fn long_home_and_profile_editor_fit_mobile_tablet_and_desktop() {
        for width in [320.0, 390.0, 768.0, 1440.0] {
            for editor in [false, true] {
                let session = session();
                let mut view = loaded_view(&session);
                let long = "Thông tin hồ sơ dài cần xuống dòng ".repeat(10);
                let profile = view.profile.as_mut().unwrap();
                profile.name = long.clone();
                profile.code = long.clone();
                profile.department = long.clone();
                profile.position = long.clone();
                profile.status = long.clone();
                profile.address = long.clone();
                profile.email = format!("{}@example.test", "long".repeat(60));
                view.profile_editing = editor;
                let ctx = egui::Context::default();
                crate::native_text::setup_fonts(&ctx);
                crate::native_text::setup_style(&ctx);
                let _ = ctx.run(
                    egui::RawInput {
                        screen_rect: Some(egui::Rect::from_min_size(
                            egui::Pos2::ZERO,
                            egui::vec2(width, 900.0),
                        )),
                        ..Default::default()
                    },
                    |ctx| {
                        egui::CentralPanel::default().show(ctx, |ui| {
                            let right = ui.max_rect().right();
                            if editor {
                                view.render_profile(
                                    ui,
                                    &session,
                                    &crate::api::ApiClient::default(),
                                );
                            } else {
                                view.render_home(ui, &session, &crate::api::ApiClient::default());
                            }
                            assert!(
                                ui.min_rect().right() <= right + 1.0,
                                "overflow at {width}, editor {editor}: {:?}",
                                ui.min_rect()
                            );
                        });
                    },
                );
            }
        }
    }

    #[test]
    fn payslip_view_starts_without_fabricated_salary_records() {
        assert!(EmployeePortalView::default().payslips.is_empty());
    }

    #[test]
    fn switching_employee_accounts_clears_loaded_and_unsaved_payslip_state() {
        let mut view = EmployeePortalView::default();
        view.payslips.push(EmployeePayslip {
            id: "salary-a".to_owned(),
            month: Some("2026-08".to_owned()),
            basic_salary: Some(42_000_000),
            allowance: None,
            bonus_kpi: None,
            insurance_deduction: None,
            personal_tax: None,
            net_salary: None,
            source_status: Some("Đã thanh toán".to_owned()),
            data_status: "unverified".to_owned(),
        });
        view.payslips_loaded_for = Some("employee-a".to_owned());
        view.payslips_search = "2026-08".to_owned();
        view.payslips_page = 4;
        view.payslips_loading = true;

        view.reset_payslips_for_account("employee-b");

        assert!(view.payslips.is_empty());
        assert_eq!(view.payslips_loaded_for.as_deref(), Some("employee-b"));
        assert!(view.payslips_search.is_empty());
        assert_eq!(view.payslips_page, 1);
        assert!(!view.payslips_loading);
        assert!(view.payslips_task.is_none());
    }

    #[test]
    fn missing_payslip_amount_is_not_rendered_as_zero() {
        assert_eq!(amount_text(None), "Chưa có dữ liệu hợp lệ");
    }

    #[test]
    fn profile_phone_validation_trims_and_obeys_backend_limit() {
        assert_eq!(
            validate_profile_phone(" 0900000000 "),
            Ok("0900000000".to_owned())
        );
        assert!(validate_profile_phone(&"x".repeat(33)).is_err());
    }

    #[test]
    fn profile_contact_validation_trims_and_bounds_address() {
        assert_eq!(
            validate_profile_contact(" 0900000000 ", "  12 Đường Lê Lợi  "),
            Ok(("0900000000".to_owned(), "12 Đường Lê Lợi".to_owned()))
        );
        assert!(validate_profile_contact("0900000000", &"x".repeat(513)).is_err());
    }
}
