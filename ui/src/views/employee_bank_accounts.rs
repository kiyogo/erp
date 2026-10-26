use std::time::Duration;

use egui::{Color32, Context, RichText, Ui};

use crate::{
    api::{
        ApiClient, ApiTask, CreateEmployeeBankAccountInput, CreateHrBankAccountInput,
        EmployeeBankAccount, EmployeeBankAccountResponse, EmployeeBankAccountsResponse,
    },
    models::Session,
};

const PAGE_SIZE: usize = 8;

#[derive(Default)]
pub struct EmployeeBankAccountsView {
    accounts: Vec<EmployeeBankAccount>,
    list_task: Option<ApiTask<EmployeeBankAccountsResponse>>,
    create_task: Option<ApiTask<EmployeeBankAccountResponse>>,
    transition_task: Option<ApiTask<EmployeeBankAccountResponse>>,
    pending_action: Option<(String, BankAction)>,
    loaded_for: Option<(String, bool)>,
    needs_reload: bool,
    loading: bool,
    form_open: bool,
    form: BankForm,
    search: String,
    status_filter: String,
    show_full_number: bool,
    page: usize,
    page_size: usize,
    selected_id: Option<String>,
    error: String,
    form_error: String,
    notice: String,
    reject_reason: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BankAction {
    Approve,
    Reject,
    Retire,
}

#[derive(Clone)]
struct BankForm {
    employee_code: String,
    bank_name: String,
    account_number: String,
    account_holder: String,
    branch: String,
    is_primary: bool,
    note: String,
}

impl Default for BankForm {
    fn default() -> Self {
        Self {
            employee_code: String::new(),
            bank_name: String::new(),
            account_number: String::new(),
            account_holder: String::new(),
            branch: String::new(),
            is_primary: true,
            note: String::new(),
        }
    }
}

impl EmployeeBankAccountsView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn poll(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient, admin_mode: bool) {
        let identity = (session.user.id.clone(), admin_mode);
        if self.loaded_for.as_ref() != Some(&identity) {
            *self = Self {
                loaded_for: Some(identity),
                needs_reload: true,
                ..Self::default()
            };
        }
        if self.needs_reload
            && self.list_task.is_none()
            && self.create_task.is_none()
            && self.transition_task.is_none()
        {
            self.loading = true;
            self.error.clear();
            self.list_task = Some(if admin_mode {
                api.list_hr_bank_accounts_task(session)
            } else {
                api.list_employee_bank_accounts_task(session)
            });
            self.needs_reload = false;
        }
        if let Some(result) = self.list_task.as_ref().and_then(ApiClient::poll) {
            self.list_task = None;
            self.loading = false;
            match result {
                Ok(response) => self.accounts = response.data,
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.create_task.as_ref().and_then(ApiClient::poll) {
            self.create_task = None;
            match result {
                Ok(response) => {
                    self.notice = format!(
                        "Đã gửi tài khoản {} về trạng thái chờ duyệt.",
                        mask_account_number(&response.account.account_number)
                    );
                    self.form = BankForm::default();
                    self.form_open = false;
                    self.form_error.clear();
                    self.needs_reload = true;
                }
                Err(error) => self.form_error = error,
            }
        }
        if let Some(result) = self.transition_task.as_ref().and_then(ApiClient::poll) {
            self.transition_task = None;
            match result {
                Ok(response) => {
                    self.notice = match self.pending_action.take() {
                        Some((_, BankAction::Approve)) => {
                            "Đã phê duyệt tài khoản ngân hàng.".to_owned()
                        }
                        Some((_, BankAction::Reject)) => {
                            "Đã ghi nhận từ chối tài khoản ngân hàng.".to_owned()
                        }
                        Some((_, BankAction::Retire)) => {
                            "Đã ngừng sử dụng tài khoản; dấu vết kiểm toán được giữ lại.".to_owned()
                        }
                        None => "Đã cập nhật tài khoản ngân hàng.".to_owned(),
                    };
                    upsert_account(&mut self.accounts, response.account);
                    self.reject_reason.clear();
                }
                Err(error) => {
                    self.pending_action = None;
                    self.error = error;
                }
            }
        }
        if self.list_task.is_some() || self.create_task.is_some() || self.transition_task.is_some()
        {
            ui.ctx().request_repaint_after(Duration::from_millis(80));
        }
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &Context,
        session: &Session,
        api: &ApiClient,
        admin_mode: bool,
    ) {
        if admin_mode && session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Chỉ ADMIN được quản lý tài khoản ngân hàng nhân viên.");
            return;
        }
        if !admin_mode && session.user.role == "ADMIN" {
            ui.heading("Hãy sử dụng giao diện HR");
            ui.label("Quản trị viên không có hồ sơ ngân hàng tự phục vụ.");
            return;
        }
        self.poll(ui, session, api, admin_mode);
        let known = !self.loading && self.error.is_empty();
        if admin_mode {
            crate::widgets::metrics(
                ui,
                "employee.bank.metrics",
                &[
                    crate::widgets::Metric {
                        label: "Tổng biến động vòng đời nhân sự",
                        value: "Chưa xác định".into(),
                        detail: "Màn này chưa tải dữ liệu biến động",
                        color: crate::theme::PRIMARY,
                        value_size: 24.0,
                    },
                    crate::widgets::Metric {
                        label: "Bổ nhiệm & Thăng tiến chức vụ",
                        value: "Chưa xác định".into(),
                        detail: "Chưa có dữ liệu bổ nhiệm ở màn này",
                        color: Color32::from_rgb(37, 99, 235),
                        value_size: 24.0,
                    },
                    crate::widgets::Metric {
                        label: "Hồ sơ xác thực danh tính (eKYC)",
                        value: "Chưa xác định".into(),
                        detail: "Chưa có kết quả xác thực danh tính",
                        color: Color32::from_rgb(22, 163, 74),
                        value_size: 24.0,
                    },
                    crate::widgets::Metric {
                        label: "Tài khoản ngân hàng nhận lương",
                        value: if known {
                            format!("{} Tài khoản", self.accounts.len())
                        } else {
                            "Chưa xác định".into()
                        },
                        detail: "Chưa kết nối chi trả tự động",
                        color: Color32::from_rgb(124, 58, 237),
                        value_size: 24.0,
                    },
                ],
            );
        } else {
            ui.label(RichText::new("Tài khoản nhận lương").size(20.0).strong());
            ui.label(
                "Chỉ tài khoản của bạn được hiển thị. Thông tin mới/thay thế cần HR phê duyệt.",
            );
        }
        ui.add_space(16.0);
        let busy = self.list_task.is_some()
            || self.create_task.is_some()
            || self.transition_task.is_some();
        ui.horizontal_wrapped(|ui| {
            ui.spacing_mut().item_spacing = egui::vec2(10.0, 10.0);
            let width = ui.available_width().min(340.0);
            let (rect, _) = ui.allocate_exact_size(egui::vec2(width, 32.0), egui::Sense::hover());
            if crate::widgets::search_input(
                ui,
                rect,
                &mut self.search,
                "Tên ngân hàng, 4 số cuối STK, chi nhánh, chủ TK...",
            )
            .changed()
            {
                self.page = 0;
            }
            let before = self.status_filter.clone();
            crate::widgets::combo_box("bank.status")
                .width(160.0)
                .selected_text(if self.status_filter.is_empty() {
                    "Tất cả trạng thái"
                } else {
                    &self.status_filter
                })
                .show_ui(ui, |ui| {
                    ui.selectable_value(
                        &mut self.status_filter,
                        String::new(),
                        "Tất cả trạng thái",
                    );
                    for status in ["Đã duyệt", "Chờ duyệt", "Từ chối", "Đã ngừng sử dụng"]
                    {
                        ui.selectable_value(&mut self.status_filter, status.into(), status);
                    }
                });
            if before != self.status_filter {
                self.page = 0;
            }
            if ui
                .add_enabled(!busy, egui::Button::new("Làm mới"))
                .clicked()
            {
                self.needs_reload = true;
            }
            ui.add_enabled(false, egui::Button::new("Xuất Excel"))
                .on_disabled_hover_text("Chưa có API xuất tài khoản ngân hàng.");
            if ui
                .add_enabled(
                    !busy,
                    egui::Button::new(if admin_mode {
                        "+ Thêm ngân hàng"
                    } else {
                        "+ Gửi tài khoản"
                    })
                    .fill(crate::theme::PRIMARY),
                )
                .clicked()
            {
                self.form_open = true;
                self.form_error.clear();
            }
        });
        ui.checkbox(&mut self.show_full_number, "Hiện đầy đủ STK");
        if !self.error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
        }
        if !self.notice.is_empty() {
            ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
        }
        if self.loading {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải tài khoản ngân hàng...");
            });
        }
        let query = self.search.trim().to_lowercase();
        let filtered = self
            .accounts
            .iter()
            .filter(|r| {
                (self.status_filter.is_empty() || self.status_filter == r.status)
                    && (query.is_empty()
                        || [
                            r.employee_name.as_str(),
                            r.employee_code.as_str(),
                            r.bank_name.as_str(),
                            r.account_holder.as_str(),
                            r.branch.as_str(),
                            r.status.as_str(),
                            last_four(&r.account_number),
                        ]
                        .iter()
                        .any(|v| v.to_lowercase().contains(&query)))
            })
            .cloned()
            .collect::<Vec<_>>();
        if self.page_size == 0 {
            self.page_size = if admin_mode { 10 } else { PAGE_SIZE };
        }
        self.page = self
            .page
            .min(filtered.len().div_ceil(self.page_size).max(1) - 1);
        let page = filtered
            .iter()
            .skip(self.page * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        let mut columns = Vec::new();
        if admin_mode {
            columns.push(crate::widgets::TableColumn {
                title: "Nhân sự liên kết",
                width: 220.0,
            });
        }
        columns.extend([
            crate::widgets::TableColumn {
                title: "Thông tin Ngân hàng & STK",
                width: 240.0,
            },
            crate::widgets::TableColumn {
                title: "Chi nhánh & Ghi chú",
                width: (ui.available_width() - if admin_mode { 920.0 } else { 700.0 }).max(200.0),
            },
            crate::widgets::TableColumn {
                title: "Mặc định nhận lương",
                width: 140.0,
            },
            crate::widgets::TableColumn {
                title: "Trạng thái",
                width: 130.0,
            },
            crate::widgets::TableColumn {
                title: "Thao tác",
                width: 190.0,
            },
        ]);
        ui.add_space(12.0);
        crate::widgets::table_with_row_height(
            ui,
            "employee.bank.table",
            &columns,
            page.len(),
            88.0,
            |ui, row, col| {
                let r = page[row];
                let col = if admin_mode { col } else { col + 1 };
                match col {
                    0 => {
                        ui.label(RichText::new(&r.employee_name).size(13.0).strong());
                        ui.label(
                            RichText::new(format!("Mã NV: {}", r.employee_code))
                                .size(11.5)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                    }
                    1 => {
                        ui.label(
                            RichText::new(&r.bank_name)
                                .size(13.5)
                                .strong()
                                .color(crate::theme::PRIMARY),
                        );
                        ui.label(
                            RichText::new(format!(
                                "STK: {}",
                                if self.show_full_number {
                                    r.account_number.clone()
                                } else {
                                    mask_account_number(&r.account_number)
                                }
                            ))
                            .monospace()
                            .strong(),
                        );
                        ui.label(
                            RichText::new(format!("Chủ TK: {}", r.account_holder))
                                .size(11.5)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                    }
                    2 => {
                        ui.label(if r.branch.is_empty() {
                            "Chưa khai báo"
                        } else {
                            &r.branch
                        });
                        if !r.note.is_empty() {
                            ui.label(
                                RichText::new(&r.note)
                                    .size(11.5)
                                    .italics()
                                    .color(Color32::from_rgb(100, 116, 139)),
                            );
                        }
                    }
                    3 => {
                        crate::widgets::tag(
                            ui,
                            if r.is_primary {
                                "Tài khoản chính"
                            } else {
                                "Phụ"
                            },
                            if r.is_primary {
                                crate::widgets::TagTone::Success
                            } else {
                                crate::widgets::TagTone::Neutral
                            },
                        );
                    }
                    4 => {
                        crate::widgets::tag(
                            ui,
                            &r.status,
                            match r.status.as_str() {
                                "Đã duyệt" => crate::widgets::TagTone::Success,
                                "Chờ duyệt" => crate::widgets::TagTone::Warning,
                                "Từ chối" => crate::widgets::TagTone::Error,
                                _ => crate::widgets::TagTone::Neutral,
                            },
                        );
                    }
                    _ => {
                        if ui.button("Chi tiết").clicked() {
                            self.selected_id = Some(r.id.clone());
                        }
                        self.render_actions(ui, session, api, r, admin_mode);
                    }
                }
            },
        );
        ui.add_space(16.0);
        ui.label(
            RichText::new(format!("{} tài khoản", filtered.len()))
                .size(13.0)
                .color(Color32::from_rgb(117, 117, 117)),
        );
        crate::widgets::pagination(
            ui,
            "employee.bank.pages",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );
        if let Some(r) = self
            .accounts
            .iter()
            .find(|r| self.selected_id.as_deref() == Some(&r.id))
            .cloned()
        {
            let (_, closed) = crate::widgets::modal(
                ctx,
                "employee.bank.detail",
                "Chi tiết tài khoản ngân hàng nhân sự",
                620.0,
                false,
                |ui| {
                    ui.spacing_mut().item_spacing.y = 14.0;
                    egui::Frame::none()
                        .fill(Color32::from_rgb(248, 250, 252))
                        .inner_margin(16.0)
                        .rounding(8.0)
                        .show(ui, |ui| {
                            if admin_mode {
                                ui.strong(&r.employee_name);
                                ui.colored_label(
                                    crate::theme::PRIMARY,
                                    format!("Mã NV: {}", r.employee_code),
                                );
                            }
                            crate::widgets::tag(
                                ui,
                                &r.status,
                                match r.status.as_str() {
                                    "Đã duyệt" => crate::widgets::TagTone::Success,
                                    "Chờ duyệt" => crate::widgets::TagTone::Warning,
                                    _ => crate::widgets::TagTone::Neutral,
                                },
                            );
                            if r.is_primary {
                                ui.label("Tài khoản nhận lương chính");
                            }
                        });
                    ui.label("Tên Ngân hàng");
                    ui.label(
                        RichText::new(&r.bank_name)
                            .size(14.0)
                            .strong()
                            .color(Color32::from_rgb(37, 99, 235)),
                    );
                    ui.label(format!(
                        "Số tài khoản: {}",
                        if self.show_full_number {
                            r.account_number.clone()
                        } else {
                            mask_account_number(&r.account_number)
                        }
                    ));
                    ui.label(format!("Chủ tài khoản: {}", r.account_holder));
                    ui.label(format!(
                        "Chi nhánh: {}",
                        if r.branch.is_empty() {
                            "Chưa khai báo"
                        } else {
                            &r.branch
                        }
                    ));
                    if !r.note.is_empty() {
                        ui.label(format!("Ghi chú: {}", r.note));
                    }
                    if !r.approved_at.is_empty() {
                        ui.label(format!(
                            "HR ghi nhận duyệt: {} · {}",
                            r.approved_by, r.approved_at
                        ));
                    }
                    if !r.rejection_reason.is_empty() {
                        ui.label(format!("Lý do từ chối: {}", r.rejection_reason));
                    }
                    ui.label("Phê duyệt HR không xác minh tài khoản với ngân hàng.");
                    crate::widgets::action_row(ui, |ui| {
                        if ui.button("Đóng").clicked() {
                            self.selected_id = None;
                        }
                    });
                },
            );
            if closed {
                self.selected_id = None;
            }
        }
        if self.form_open {
            let (_, closed) = crate::widgets::modal(
                ctx,
                "employee.bank.create",
                if admin_mode {
                    "Thêm mới tài khoản ngân hàng nhân sự"
                } else {
                    "Gửi tài khoản ngân hàng mới/thay thế"
                },
                560.0,
                self.create_task.is_some(),
                |ui| self.render_form(ui, session, api, admin_mode),
            );
            if closed {
                self.form_open = false;
            }
        }
        if let Some((id, action)) = self.pending_action.clone() {
            let (_, closed) = crate::widgets::modal(
                ctx,
                "employee.bank.confirm",
                match action {
                    BankAction::Approve => "Xác nhận phê duyệt?",
                    BankAction::Reject => "Xác nhận từ chối?",
                    BankAction::Retire => "Xác nhận ngừng sử dụng?",
                },
                480.0,
                self.transition_task.is_some(),
                |ui| {
                    ui.label(match action{
                    BankAction::Approve=>"HR ghi nhận tài khoản đã được xem xét; thao tác không xác minh với ngân hàng.",
                    BankAction::Reject=>"Tài khoản chuyển sang từ chối; lý do được lưu mã hóa.",
                    BankAction::Retire=>"Bản ghi được giữ lại và đánh dấu ngừng dùng, không xóa dấu vết.",
                });
                    if action == BankAction::Reject {
                        crate::widgets::form_textarea(
                            ui,
                            "bank.reject",
                            "Lý do từ chối",
                            true,
                            &mut self.reject_reason,
                            "",
                            3,
                        );
                    }
                    crate::widgets::action_row(ui, |ui| {
                        let can_confirm = self.transition_task.is_none()
                            && (action != BankAction::Reject
                                || !self.reject_reason.trim().is_empty());
                        if ui
                            .add_enabled(can_confirm, egui::Button::new("Xác nhận"))
                            .clicked()
                        {
                            let endpoint = match action {
                                BankAction::Approve => "approve",
                                BankAction::Reject => "reject",
                                BankAction::Retire => "retire",
                            };
                            self.transition_task = Some(api.transition_hr_bank_account_task(
                                session,
                                &id,
                                endpoint,
                                self.reject_reason.trim(),
                            ));
                            self.error.clear();
                        }
                        if ui
                            .add_enabled(self.transition_task.is_none(), egui::Button::new("Hủy"))
                            .clicked()
                        {
                            self.pending_action = None;
                            self.reject_reason.clear();
                        }
                    });
                },
            );
            if closed {
                self.pending_action = None;
                self.reject_reason.clear();
            }
        }
    }

    fn render_actions(
        &mut self,
        ui: &mut Ui,
        _session: &Session,
        _api: &ApiClient,
        account: &EmployeeBankAccount,
        admin_mode: bool,
    ) {
        if !admin_mode {
            return;
        }
        ui.horizontal_wrapped(|ui| {
            ui.add_enabled_ui(
                self.transition_task.is_none() && self.list_task.is_none(),
                |ui| {
                    if account.status == "Chờ duyệt" {
                        if ui.small_button("Duyệt").clicked() {
                            self.pending_action = Some((account.id.clone(), BankAction::Approve));
                            self.reject_reason.clear();
                        }
                        if ui.small_button("Từ chối").clicked() {
                            self.pending_action = Some((account.id.clone(), BankAction::Reject));
                            self.reject_reason.clear();
                        }
                    }
                    if account.status != "Đã ngừng sử dụng" && ui.small_button("Ngừng").clicked()
                    {
                        self.pending_action = Some((account.id.clone(), BankAction::Retire));
                    }
                    ui.add_enabled(false, egui::Button::new("Sửa"))
                        .on_disabled_hover_text(
                            "Chưa có API sửa; gửi tài khoản thay thế để HR duyệt.",
                        );
                },
            );
        });
    }

    fn render_form(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient, admin_mode: bool) {
        ui.add_space(10.0);
        let cols = if ui.available_width() < 400.0 { 1 } else { 2 };
        ui.columns(cols, |c| {
            if admin_mode {
                crate::widgets::form_input(
                    &mut c[0],
                    "bank.employee",
                    "Mã nhân sự nhận lương",
                    true,
                    &mut self.form.employee_code,
                    "Tra cứu theo hồ sơ HR",
                    false,
                );
            }
            crate::widgets::form_input(
                &mut c[if admin_mode { cols - 1 } else { 0 }],
                "bank.name",
                "Tên Ngân hàng",
                true,
                &mut self.form.bank_name,
                "",
                false,
            );
        });
        ui.columns(cols, |c| {
            crate::widgets::form_input(
                &mut c[0],
                "bank.number",
                "Số tài khoản",
                true,
                &mut self.form.account_number,
                "",
                false,
            );
            crate::widgets::form_input(
                &mut c[cols - 1],
                "bank.holder",
                "Chủ tài khoản",
                true,
                &mut self.form.account_holder,
                "",
                false,
            );
        });
        ui.columns(cols, |c| {
            crate::widgets::form_input(
                &mut c[0],
                "bank.branch",
                "Chi nhánh phát hành",
                false,
                &mut self.form.branch,
                "",
                false,
            );
            c[cols - 1].add_enabled_ui(false, |ui| {
                let mut status = "Chờ duyệt".to_owned();
                crate::widgets::form_select(
                    ui,
                    "bank.initial-status",
                    "Trạng thái duyệt",
                    false,
                    &mut status,
                    &["Chờ duyệt"],
                );
            });
        });
        ui.checkbox(
            &mut self.form.is_primary,
            "Đề nghị đặt làm tài khoản nhận lương chính sau khi được duyệt",
        );
        crate::widgets::form_textarea(
            ui,
            "bank.note",
            "Ghi chú",
            false,
            &mut self.form.note,
            "",
            2,
        );
        ui.label("Thông tin tài khoản được mã hóa ở máy chủ. Không gửi OTP/mật khẩu qua ghi chú.");
        if !self.form_error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
        }
        crate::widgets::action_row(ui, |ui| {
            if ui
                .add_enabled(
                    self.create_task.is_none(),
                    egui::Button::new("Gửi chờ duyệt").fill(crate::theme::PRIMARY),
                )
                .clicked()
            {
                if let Err(error) = validate_form(&self.form, admin_mode) {
                    self.form_error = error.into();
                } else {
                    self.create_task = Some(if admin_mode {
                        api.create_hr_bank_account_task(
                            session,
                            &CreateHrBankAccountInput {
                                employee_code: self.form.employee_code.trim().into(),
                                bank_name: self.form.bank_name.trim().into(),
                                account_number: self.form.account_number.trim().into(),
                                account_holder: self.form.account_holder.trim().into(),
                                branch: self.form.branch.trim().into(),
                                is_primary: self.form.is_primary,
                                note: self.form.note.trim().into(),
                            },
                        )
                    } else {
                        api.create_employee_bank_account_task(
                            session,
                            &CreateEmployeeBankAccountInput {
                                bank_name: self.form.bank_name.trim().into(),
                                account_number: self.form.account_number.trim().into(),
                                account_holder: self.form.account_holder.trim().into(),
                                branch: self.form.branch.trim().into(),
                                is_primary: self.form.is_primary,
                                note: self.form.note.trim().into(),
                            },
                        )
                    });
                    self.form_error.clear();
                }
            }
            if ui
                .add_enabled(self.create_task.is_none(), egui::Button::new("Hủy"))
                .clicked()
            {
                self.form_open = false;
            }
        });
    }
}

fn upsert_account(accounts: &mut Vec<EmployeeBankAccount>, account: EmployeeBankAccount) {
    if let Some(current) = accounts.iter_mut().find(|current| current.id == account.id) {
        *current = account;
    } else {
        accounts.insert(0, account);
    }
}

fn validate_form(form: &BankForm, admin_mode: bool) -> Result<(), &'static str> {
    if admin_mode && form.employee_code.trim().is_empty() {
        return Err("Cần mã nhân viên HR.");
    }
    if form.bank_name.trim().is_empty() {
        return Err("Cần nhập tên ngân hàng.");
    }
    if form.account_number.trim().len() < 4 {
        return Err("Số tài khoản cần tối thiểu 4 ký tự.");
    }
    if form.account_holder.trim().is_empty() {
        return Err("Cần tên chủ tài khoản.");
    }
    Ok(())
}

fn last_four(number: &str) -> &str {
    let start = number
        .char_indices()
        .rev()
        .nth(3)
        .map(|(index, _)| index)
        .unwrap_or(0);
    &number[start..]
}

fn mask_account_number(number: &str) -> String {
    let tail = last_four(number);
    if number.chars().count() <= 4 {
        return "••••".to_owned();
    }
    format!("•••• {}", tail)
}

#[cfg(test)]
mod tests {

    #[test]
    fn legacy_form_footer_fits_mobile_tablet_and_desktop() {
        let mut view = EmployeeBankAccountsView::default();
        crate::views::hr_training::assert_form_fits(|ui, session, api| {
            view.render_form(ui, session, api, true)
        });
    }

    #[test]
    fn switching_bank_context_clears_private_fields_and_reveal_state() {
        let mut view = EmployeeBankAccountsView::default();
        view.show_full_number = true;
        view.selected_id = Some("private".into());
        view.reject_reason = "private rejection".into();
        view.form.account_number = "private number".into();
        view.form.note = "private note".into();
        view.reset();
        assert!(!view.show_full_number);
        assert!(view.selected_id.is_none());
        assert!(view.reject_reason.is_empty());
        assert!(view.form.account_number.is_empty());
        assert!(view.form.note.is_empty());
        assert_eq!(mask_account_number("１２３４５６"), "•••• ３４５６");
    }
    use super::*;

    #[test]
    fn bank_form_requires_directory_identity_only_for_hr_creation() {
        let mut form = BankForm::default();
        form.bank_name = "VCB".to_owned();
        form.account_number = "00123456".to_owned();
        form.account_holder = "Nguyen An".to_owned();
        assert_eq!(validate_form(&form, false), Ok(()));
        assert_eq!(validate_form(&form, true), Err("Cần mã nhân viên HR."));
        form.employee_code = "EMP-1".to_owned();
        assert_eq!(validate_form(&form, true), Ok(()));
        form.account_number.clear();
        assert_eq!(
            validate_form(&form, false),
            Err("Số tài khoản cần tối thiểu 4 ký tự.")
        );
    }

    #[test]
    fn bank_number_is_masked_by_default_and_statuses_are_explicit() {
        assert_eq!(mask_account_number("001234567890"), "•••• 7890");
        assert_eq!(mask_account_number("1234"), "••••");
        assert_eq!(last_four("ABCD-EFGH"), "EFGH");
    }
}
