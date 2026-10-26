use std::{collections::BTreeMap, time::Duration};

use egui::{Color32, RichText, Ui};
use web_time::Instant;

use crate::{
    api::{
        ApiClient, ApiTask, CreateFinanceBankAccount, CreateFinanceBankTransfer,
        FinanceBankAccount, FinanceBankAccountMutationResponse, FinanceBankAccountsResponse,
        FinanceBankTransferMutationResponse, FinanceCashTransaction,
        FinanceCashTransactionsResponse,
    },
    models::Session,
};

const PAGE_SIZE: usize = 10;
const REFRESH_INTERVAL: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BankRoute {
    Accounts,
    Transactions,
    Statements,
    EBanking,
    Transfer,
}

impl BankRoute {
    fn from_path(path: &str) -> Option<Self> {
        match path {
            "/admin/finance/cash/bank" | "/admin/finance/cash/bank/accounts" => {
                Some(Self::Accounts)
            }
            "/admin/finance/cash/bank/transactions" => Some(Self::Transactions),
            "/admin/finance/cash/bank/statements" => Some(Self::Statements),
            "/admin/finance/cash/bank/e-banking" => Some(Self::EBanking),
            "/admin/finance/cash/transfer" => Some(Self::Transfer),
            _ => None,
        }
    }
}

#[derive(Default)]
struct AccountForm {
    bank_name: String,
    account_number: String,
    account_holder: String,
    branch: String,
    opening_balance: String,
}

impl AccountForm {
    fn payload(&self) -> Result<CreateFinanceBankAccount, String> {
        let bank_name = self.bank_name.trim();
        let account_number = self.account_number.trim();
        let account_holder = self.account_holder.trim();
        if bank_name.is_empty() || bank_name.chars().count() > 200 {
            return Err("Tên ngân hàng là bắt buộc và tối đa 200 ký tự.".to_owned());
        }
        if account_number.is_empty() || account_number.chars().count() > 64 {
            return Err("Số tài khoản là bắt buộc và tối đa 64 ký tự.".to_owned());
        }
        if account_holder.is_empty() || account_holder.chars().count() > 200 {
            return Err("Chủ tài khoản là bắt buộc và tối đa 200 ký tự.".to_owned());
        }
        if self.branch.chars().count() > 200 {
            return Err("Chi nhánh tối đa 200 ký tự.".to_owned());
        }
        let balance = if self.opening_balance.trim().is_empty() {
            0
        } else {
            self.opening_balance
                .trim()
                .replace('.', "")
                .replace(',', "")
                .replace(' ', "")
                .parse::<i64>()
                .map_err(|_| "Số dư đầu kỳ phải là số nguyên không âm.".to_owned())?
        };
        if !(0..=1_000_000_000_000).contains(&balance) {
            return Err("Số dư đầu kỳ phải từ 0 đến 1.000.000.000.000 VND.".to_owned());
        }
        Ok(CreateFinanceBankAccount {
            bank_name: bank_name.to_owned(),
            account_number: account_number.to_owned(),
            account_holder: account_holder.to_owned(),
            branch: self.branch.trim().to_owned(),
            balance,
            status: "Đang hoạt động".to_owned(),
        })
    }
}

#[derive(Default, Clone, PartialEq, Eq)]
struct TransferForm {
    from_account_key: String,
    to_account_key: String,
    amount: String,
    note: String,
}

impl TransferForm {
    fn payload(&self) -> Result<CreateFinanceBankTransfer, String> {
        if self.from_account_key.is_empty() || self.to_account_key.is_empty() {
            return Err("Vui lòng chọn tài khoản nguồn và tài khoản đích.".to_owned());
        }
        if self.from_account_key == self.to_account_key {
            return Err("Tài khoản nguồn và tài khoản đích không được trùng nhau.".to_owned());
        }
        let amount = self
            .amount
            .trim()
            .replace('.', "")
            .replace(',', "")
            .replace(' ', "")
            .parse::<i64>()
            .map_err(|_| "Số tiền chuyển phải là số nguyên hợp lệ.".to_owned())?;
        if !(10_000..=1_000_000_000_000).contains(&amount) {
            return Err("Số tiền chuyển phải từ 10.000 đến 1.000.000.000.000 VND.".to_owned());
        }
        if self.note.chars().count() > 2_000 {
            return Err("Nội dung điều chuyển tối đa 2.000 ký tự.".to_owned());
        }
        Ok(CreateFinanceBankTransfer {
            idempotency_key: String::new(),
            from_account_key: self.from_account_key.clone(),
            to_account_key: self.to_account_key.clone(),
            amount,
            note: self.note.trim().to_owned(),
        })
    }
}

pub struct BankAccountsView {
    accounts: Vec<FinanceBankAccount>,
    transactions: Vec<FinanceCashTransaction>,
    accounts_task: Option<ApiTask<FinanceBankAccountsResponse>>,
    transactions_task: Option<ApiTask<FinanceCashTransactionsResponse>>,
    mutation: Option<ApiTask<FinanceBankAccountMutationResponse>>,
    transfer_mutation: Option<ApiTask<FinanceBankTransferMutationResponse>>,
    accounts_loaded: bool,
    transactions_loaded: bool,
    loaded_for: Option<String>,
    current_path: String,
    last_load: Option<Instant>,
    needs_reload: bool,
    search: String,
    page: usize,
    page_size: usize,
    create_open: bool,
    form: AccountForm,
    form_error: String,
    accounts_error: String,
    transactions_error: String,
    mutation_error: String,
    transfer_error: String,
    transfer_form: TransferForm,
    transfer_pending: Option<CreateFinanceBankTransfer>,
    transfer_nonce: u64,
    transfer_open: bool,
    notice: String,
}

impl Default for BankAccountsView {
    fn default() -> Self {
        Self {
            accounts: Vec::new(),
            transactions: Vec::new(),
            accounts_task: None,
            transactions_task: None,
            mutation: None,
            transfer_mutation: None,
            accounts_loaded: false,
            transactions_loaded: false,
            loaded_for: None,
            current_path: String::new(),
            last_load: None,
            needs_reload: true,
            search: String::new(),
            page: 1,
            page_size: PAGE_SIZE,
            create_open: false,
            form: AccountForm::default(),
            form_error: String::new(),
            accounts_error: String::new(),
            transactions_error: String::new(),
            mutation_error: String::new(),
            transfer_error: String::new(),
            transfer_form: TransferForm::default(),
            transfer_pending: None,
            transfer_nonce: 0,
            transfer_open: false,
            notice: String::new(),
        }
    }
}

impl BankAccountsView {
    fn reset_for_user(&mut self, user_id: &str) {
        *self = Self {
            loaded_for: Some(user_id.to_owned()),
            ..Self::default()
        };
    }

    fn set_route(&mut self, path: &str) {
        if self.current_path != path {
            self.current_path = path.to_owned();
            self.search.clear();
            self.page = 1;
        }
    }

    fn request_load(&mut self, session: &Session, api: &ApiClient) {
        if self.accounts_task.is_none() {
            self.accounts_task = Some(api.list_finance_bank_accounts_task(session));
        }
        if self.transactions_task.is_none() {
            self.transactions_task =
                Some(api.list_finance_cash_transactions_task(session, Some("bank")));
        }
        self.needs_reload = false;
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient, route: BankRoute) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.reset_for_user(&session.user.id);
        }
        if matches!(
            route,
            BankRoute::Accounts
                | BankRoute::Transactions
                | BankRoute::Statements
                | BankRoute::Transfer
        ) && (self.needs_reload
            || (self.accounts_task.is_none()
                && self.transactions_task.is_none()
                && self
                    .last_load
                    .is_none_or(|last| last.elapsed() >= REFRESH_INTERVAL)))
        {
            self.request_load(session, api);
        }

        if let Some(result) = self.accounts_task.as_ref().and_then(ApiClient::poll) {
            self.accounts_task = None;
            match result {
                Ok(response) => {
                    self.accounts = response.data;
                    self.accounts_loaded = true;
                    self.accounts_error.clear();
                }
                Err(error) => self.accounts_error = error,
            }
        }
        if let Some(result) = self.transactions_task.as_ref().and_then(ApiClient::poll) {
            self.transactions_task = None;
            self.last_load = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.transactions = response.data;
                    self.transactions_loaded = true;
                    self.transactions_error.clear();
                }
                Err(error) => self.transactions_error = error,
            }
        }
        if let Some(result) = self.mutation.as_ref().and_then(ApiClient::poll) {
            self.mutation = None;
            match result {
                Ok(response) => {
                    self.create_open = false;
                    self.form = AccountForm::default();
                    self.form_error.clear();
                    self.notice = format!("Đã thêm tài khoản {}.", response.account.bank_name);
                    self.mutation_error.clear();
                    self.needs_reload = true;
                }
                Err(error) => {
                    self.mutation_error = error;
                    self.notice.clear();
                }
            }
        }
        if let Some(result) = self.transfer_mutation.as_ref().and_then(ApiClient::poll) {
            self.transfer_mutation = None;
            match result {
                Ok(response) => {
                    let transfer = response.transfer;
                    self.transfer_open = false;
                    self.transfer_form = TransferForm::default();
                    self.transfer_pending = None;
                    self.transfer_error.clear();
                    self.notice = format!(
                        "Đã chuyển {} ₫ thành công ({} → {}).",
                        format_vnd(transfer.amount),
                        transfer.debit.account,
                        transfer.credit.account
                    );
                    self.needs_reload = true;
                }
                Err(error) => {
                    self.transfer_error = error;
                    self.notice.clear();
                }
            }
        }
        ctx.request_repaint_after(Duration::from_millis(120));
    }

    fn filtered_accounts(&self) -> Vec<FinanceBankAccount> {
        let needle = self.search.trim().to_lowercase();
        self.accounts
            .iter()
            .filter(|account| {
                needle.is_empty()
                    || account.bank_name.to_lowercase().contains(&needle)
                    || account.account_number.to_lowercase().contains(&needle)
                    || account.account_holder.to_lowercase().contains(&needle)
                    || account.branch.to_lowercase().contains(&needle)
            })
            .cloned()
            .collect()
    }

    fn filtered_transactions(&self) -> Vec<FinanceCashTransaction> {
        let needle = self.search.trim().to_lowercase();
        self.transactions
            .iter()
            .filter(|transaction| {
                needle.is_empty()
                    || [
                        transaction.code.as_str(),
                        transaction.recipient_or_payer.as_str(),
                        transaction.category.as_str(),
                        transaction.account.as_str(),
                    ]
                    .iter()
                    .any(|field| field.to_lowercase().contains(&needle))
            })
            .cloned()
            .collect()
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        route_path: &str,
    ) {
        let Some(route) = BankRoute::from_path(route_path) else {
            return;
        };
        if session.user.role != "ADMIN" {
            ui.label("Bạn không có quyền xem hoặc thay đổi tài khoản ngân hàng.");
            return;
        }
        self.poll(ctx, session, api, route);
        self.set_route(route_path);
        ui.spacing_mut().item_spacing.y = 0.0;
        ui.add_space(8.0);

        if !self.accounts_error.is_empty() {
            ui.horizontal_wrapped(|ui| {
                ui.colored_label(Color32::from_rgb(180, 45, 45), &self.accounts_error);
                if ui.button("Thử lại").clicked() {
                    self.needs_reload = true;
                }
            });
        }
        if !self.transactions_error.is_empty() {
            ui.horizontal_wrapped(|ui| {
                ui.colored_label(Color32::from_rgb(180, 45, 45), &self.transactions_error);
                if ui.button("Tải lại sổ giao dịch").clicked() {
                    self.needs_reload = true;
                }
            });
        }
        if !self.mutation_error.is_empty() {
            ui.colored_label(Color32::from_rgb(180, 45, 45), &self.mutation_error);
        }
        if !self.notice.is_empty() {
            ui.colored_label(Color32::from_rgb(32, 125, 70), &self.notice);
        }

        self.render_balance(ui);
        ui.add_space(16.0);
        match route {
            BankRoute::Accounts => self.render_accounts(ui, ctx, session, api),
            BankRoute::Transactions => self.render_transactions(ui),
            BankRoute::Statements => self.render_statements(ui),
            BankRoute::EBanking => self.render_ebanking(ui),
            BankRoute::Transfer => self.render_transfer(ui, session, api),
        }
    }

    fn render_balance(&self, ui: &mut Ui) {
        let opening = self.accounts_loaded.then(|| {
            self.accounts
                .iter()
                .fold(0_i64, |sum, a| sum.saturating_add(a.balance))
        });
        let net = self.transactions_loaded.then(|| {
            completed_by_account(&self.transactions)
                .values()
                .fold(0_i64, |sum, (income, expense)| {
                    sum.saturating_add(income.saturating_sub(*expense))
                })
        });
        let value = opening
            .zip(net)
            .map(|(a, b)| format_vnd(a.saturating_add(b)))
            .unwrap_or_else(|| "—".into());
        crate::widgets::metrics_with_padding(
            ui,
            "bank.balance",
            &[crate::widgets::Metric {
                label: "Tổng số dư theo sổ nội bộ các tài khoản ngân hàng",
                value,
                detail: "Số dư đầu kỳ khai báo + phiếu hoàn thành; chưa được xác nhận bằng sao kê ngân hàng.",
                color: crate::theme::PRIMARY,
                value_size: 24.0,
            }],
            egui::vec2(16.0, 16.0),
        );
    }

    fn render_accounts(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
    ) {
        ui.horizontal_wrapped(|ui| {
            let (rect, _) = ui.allocate_exact_size(
                egui::vec2(ui.available_width().min(340.0), 32.0),
                egui::Sense::hover(),
            );
            if crate::widgets::search_input(
                ui,
                rect,
                &mut self.search,
                "Tìm ngân hàng, số tài khoản, chủ tài khoản...",
            )
            .changed()
            {
                self.page = 1;
            }
            if ui.button("Làm mới").clicked() {
                self.needs_reload = true;
            }
            if ui
                .add_enabled(
                    self.mutation.is_none(),
                    egui::Button::new("+ Thêm tài khoản").fill(crate::theme::PRIMARY),
                )
                .clicked()
            {
                self.form = AccountForm::default();
                self.form_error.clear();
                self.create_open = true;
            }
            if ui
                .add_enabled(
                    self.transfer_mutation.is_none(),
                    egui::Button::new("Chuyển tiền nội bộ"),
                )
                .clicked()
            {
                self.transfer_form = TransferForm {
                    from_account_key: self
                        .accounts
                        .first()
                        .map(|a| a.key.clone())
                        .unwrap_or_default(),
                    to_account_key: self
                        .accounts
                        .get(1)
                        .map(|a| a.key.clone())
                        .unwrap_or_default(),
                    ..Default::default()
                };
                self.transfer_error.clear();
                self.transfer_open = true;
            }
        });
        ui.add_space(12.0);
        if self.accounts_task.is_some() {
            ui.spinner();
            ui.label("Đang tải tài khoản ngân hàng…");
        }
        let accounts = self.filtered_accounts();
        let pages = accounts.len().div_ceil(self.page_size).max(1);
        self.page = self.page.clamp(1, pages);
        let shown = accounts
            .iter()
            .skip((self.page - 1) * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        use crate::widgets::TableColumn;
        let columns = [
            TableColumn {
                title: "Ngân hàng",
                width: (ui.available_width() - 892.0).max(220.0),
            },
            TableColumn {
                title: "Số tài khoản",
                width: 180.0,
            },
            TableColumn {
                title: "Chủ tài khoản",
                width: 230.0,
            },
            TableColumn {
                title: "Chi nhánh mở",
                width: 160.0,
            },
            TableColumn {
                title: "Số dư đầu kỳ khai báo",
                width: 180.0,
            },
            TableColumn {
                title: "Trạng thái",
                width: 140.0,
            },
        ];
        crate::widgets::table_with_row_height(
            ui,
            "bank.accounts.table",
            &columns,
            shown.len(),
            56.25,
            |ui, row, col| {
                let a = shown[row];
                match col {
                    0 => {
                        ui.label(&a.bank_name);
                    }
                    1 => {
                        ui.colored_label(crate::theme::PRIMARY, &a.account_number);
                    }
                    2 => {
                        ui.label(&a.account_holder);
                    }
                    3 => {
                        ui.label(if a.branch.is_empty() {
                            "—"
                        } else {
                            &a.branch
                        });
                    }
                    4 => {
                        ui.colored_label(Color32::from_rgb(46, 125, 50), format_vnd(a.balance));
                    }
                    _ => crate::widgets::tag(
                        ui,
                        &a.status,
                        if a.status == "Đang hoạt động" {
                            crate::widgets::TagTone::Success
                        } else {
                            crate::widgets::TagTone::Neutral
                        },
                    ),
                }
            },
        );
        ui.add_space(10.0);
        let mut page = self.page - 1;
        crate::widgets::pagination(
            ui,
            "bank.accounts.pagination",
            &mut page,
            accounts.len(),
            &mut self.page_size,
        );
        self.page = page + 1;
        if accounts.is_empty() {
            ui.label(if !self.accounts_loaded {
                "Chưa xác định danh sách tài khoản; hãy tải lại dữ liệu."
            } else if self.accounts.is_empty() {
                "Chưa có tài khoản ngân hàng nào được khai báo."
            } else {
                "Không tìm thấy tài khoản phù hợp."
            });
        }
        if self.create_open {
            let mut submit = false;
            let mut close = false;
            let (_, dismissed) = crate::widgets::modal(
                ctx,
                "bank.create",
                "Thêm tài khoản ngân hàng doanh nghiệp mới",
                500.0,
                self.mutation.is_some(),
                |ui| {
                    use crate::widgets::form_input;
                    ui.add_space(16.0);
                    form_input(
                        ui,
                        "bank.name",
                        "Tên ngân hàng",
                        true,
                        &mut self.form.bank_name,
                        "Nhập tên ngân hàng",
                        false,
                    );
                    if ui.available_width() >= 400.0 {
                        ui.columns(2, |cols| {
                            form_input(
                                &mut cols[0],
                                "bank.number",
                                "Số tài khoản",
                                true,
                                &mut self.form.account_number,
                                "",
                                false,
                            );
                            form_input(
                                &mut cols[1],
                                "bank.balance",
                                "Số dư đầu kỳ khai báo (VNĐ)",
                                false,
                                &mut self.form.opening_balance,
                                "0",
                                false,
                            );
                        });
                    } else {
                        form_input(
                            ui,
                            "bank.number",
                            "Số tài khoản",
                            true,
                            &mut self.form.account_number,
                            "",
                            false,
                        );
                        form_input(
                            ui,
                            "bank.balance",
                            "Số dư đầu kỳ khai báo (VNĐ)",
                            false,
                            &mut self.form.opening_balance,
                            "0",
                            false,
                        );
                    }
                    form_input(
                        ui,
                        "bank.holder",
                        "Tên chủ tài khoản",
                        true,
                        &mut self.form.account_holder,
                        "",
                        false,
                    );
                    form_input(
                        ui,
                        "bank.branch",
                        "Chi nhánh mở tài khoản",
                        false,
                        &mut self.form.branch,
                        "",
                        false,
                    );
                    ui.label(
                        RichText::new("Số dư do người dùng khai báo, chưa xác minh bằng sao kê.")
                            .size(11.5)
                            .color(Color32::GRAY),
                    );
                    if !self.form_error.is_empty() {
                        ui.colored_label(Color32::from_rgb(180, 45, 45), &self.form_error);
                    }
                    if !self.mutation_error.is_empty() {
                        ui.colored_label(Color32::from_rgb(180, 45, 45), &self.mutation_error);
                    }
                    ui.add_space(20.0);
                    crate::widgets::action_row(ui, |ui| {
                        submit = ui.button("Thêm tài khoản").clicked();
                        close = ui.button("Hủy").clicked();
                    });
                },
            );
            if close || dismissed {
                self.create_open = false;
            }
            if submit && self.mutation.is_none() {
                match self.form.payload() {
                    Ok(payload) => {
                        self.mutation =
                            Some(api.create_finance_bank_account_task(session, &payload));
                        self.form_error.clear();
                        self.mutation_error.clear();
                    }
                    Err(error) => self.form_error = error,
                }
            }
        }
        if self.transfer_open {
            let (_, closed) = crate::widgets::modal(
                ctx,
                "bank.transfer",
                "Chuyển tiền nội bộ giữa các tài khoản",
                480.0,
                self.transfer_mutation.is_some(),
                |ui| self.render_transfer_form(ui, session, api),
            );
            if closed {
                self.transfer_open = false;
            }
        }
    }

    fn render_transfer(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        ui.label("Tạo đồng thời một phiếu chi và một phiếu thu đã liên kết trong cùng giao dịch.");
        ui.label("Số dư đầu kỳ khai báo không được dùng để xác nhận số dư thực tế hoặc khả năng thanh toán.");
        ui.add_space(8.0);
        self.render_transfer_form(ui, session, api);
    }

    fn render_transfer_form(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        ui.add_enabled_ui(self.transfer_mutation.is_none(), |ui| {
            self.render_transfer_fields(ui, session, api);
        });
    }

    fn render_transfer_fields(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if !self.accounts_loaded {
            ui.label(if self.accounts_task.is_some() {
                "Đang tải danh sách tài khoản ngân hàng…"
            } else {
                "Chưa thể chuyển tiền vì chưa xác nhận được danh sách tài khoản. Hãy tải lại dữ liệu."
            });
            if ui.button("Tải lại danh sách").clicked() {
                self.needs_reload = true;
            }
            return;
        }
        if self.accounts.len() < 2 {
            ui.label("Cần ít nhất hai tài khoản ngân hàng đã khai báo để chuyển tiền nội bộ.");
            return;
        }

        let selected_from = self
            .accounts
            .iter()
            .find(|account| account.key == self.transfer_form.from_account_key)
            .map(account_label)
            .unwrap_or_else(|| "Chọn tài khoản nguồn".to_owned());
        crate::widgets::form_field(
            ui,
            "bank.transfer.from",
            "Tài khoản nguồn (Trích tiền)",
            true,
            |ui| {
                crate::widgets::combo_box("bank.transfer.from.select")
                    .width(ui.available_width())
                    .selected_text(selected_from)
                    .show_ui(ui, |ui| {
                        for account in &self.accounts {
                            ui.selectable_value(
                                &mut self.transfer_form.from_account_key,
                                account.key.clone(),
                                account_label(account),
                            );
                        }
                    });
            },
        );
        let selected_to = self
            .accounts
            .iter()
            .find(|account| account.key == self.transfer_form.to_account_key)
            .map(account_label)
            .unwrap_or_else(|| "Chọn tài khoản đích".to_owned());
        crate::widgets::form_field(
            ui,
            "bank.transfer.to",
            "Tài khoản đích (Nhận tiền)",
            true,
            |ui| {
                crate::widgets::combo_box("bank.transfer.to.select")
                    .width(ui.available_width())
                    .selected_text(selected_to)
                    .show_ui(ui, |ui| {
                        for account in &self.accounts {
                            ui.selectable_value(
                                &mut self.transfer_form.to_account_key,
                                account.key.clone(),
                                account_label(account),
                            );
                        }
                    });
            },
        );
        crate::widgets::form_input(
            ui,
            "bank.transfer.amount",
            "Số tiền chuyển (VNĐ)",
            true,
            &mut self.transfer_form.amount,
            "Tối thiểu 10.000",
            false,
        );
        crate::widgets::form_textarea(
            ui,
            "bank.transfer.note",
            "Nội dung điều chuyển",
            false,
            &mut self.transfer_form.note,
            "",
            2,
        );
        if !self.transfer_error.is_empty() {
            ui.colored_label(Color32::from_rgb(180, 45, 45), &self.transfer_error);
        }
        ui.add_space(6.0);
        if ui
            .add_enabled(
                self.transfer_mutation.is_none(),
                egui::Button::new("Xác nhận chuyển khoản"),
            )
            .clicked()
        {
            match self.transfer_form.payload() {
                Ok(mut payload) => {
                    let reusable_key = self.transfer_pending.as_ref().and_then(|previous| {
                        (previous.from_account_key == payload.from_account_key
                            && previous.to_account_key == payload.to_account_key
                            && previous.amount == payload.amount
                            && previous.note == payload.note)
                            .then(|| previous.idempotency_key.clone())
                    });
                    let key = reusable_key.unwrap_or_else(|| {
                        let key = format!(
                            "transfer-{}-{}",
                            chrono::Utc::now().timestamp_micros(),
                            self.transfer_nonce
                        );
                        self.transfer_nonce = self.transfer_nonce.wrapping_add(1);
                        key
                    });
                    payload.idempotency_key = key;
                    self.transfer_pending = Some(payload.clone());
                    self.transfer_error.clear();
                    self.transfer_mutation =
                        Some(api.create_finance_bank_transfer_task(session, &payload));
                }
                Err(error) => self.transfer_error = error,
            }
        }
    }

    fn render_transactions(&mut self, ui: &mut Ui) {
        ui.horizontal_wrapped(|ui| {
            let (rect, _) = ui.allocate_exact_size(
                egui::vec2(ui.available_width().min(340.0), 32.0),
                egui::Sense::hover(),
            );
            if crate::widgets::search_input(
                ui,
                rect,
                &mut self.search,
                "Tìm mã phiếu, đối tác, nội dung chuyển tiền...",
            )
            .changed()
            {
                self.page = 1;
            }
            if ui.button("Làm mới").clicked() {
                self.needs_reload = true;
            }
            ui.add_enabled(false, egui::Button::new("Xuất sổ tiền gửi"))
                .on_disabled_hover_text("Chưa có API xuất Excel sổ tiền gửi.");
        });
        ui.add_space(12.0);
        ui.label(
            RichText::new(
                "Phiếu ngân hàng từ sổ thu chi nội bộ; chưa phải giao dịch xác nhận từ ngân hàng.",
            )
            .size(12.0)
            .color(Color32::GRAY),
        );
        if self.transactions_task.is_some() {
            ui.spinner();
            ui.label("Đang tải sổ giao dịch ngân hàng…");
        }
        let items = self.filtered_transactions();
        self.page = self
            .page
            .clamp(1, items.len().div_ceil(self.page_size).max(1));
        let shown = items
            .iter()
            .skip((self.page - 1) * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        use crate::widgets::TableColumn;
        let columns = [
            TableColumn {
                title: "Mã chứng từ",
                width: 180.0,
            },
            TableColumn {
                title: "Tài khoản ngân hàng",
                width: 200.0,
            },
            TableColumn {
                title: "Loại GD",
                width: 130.0,
            },
            TableColumn {
                title: "Số tiền",
                width: 180.0,
            },
            TableColumn {
                title: "Đối tác / Người thụ hưởng",
                width: 220.0,
            },
            TableColumn {
                title: "Nội dung giao dịch",
                width: 240.0,
            },
            TableColumn {
                title: "Ngày hạch toán",
                width: 145.0,
            },
            TableColumn {
                title: "Trạng thái",
                width: 145.0,
            },
        ];
        crate::widgets::table_with_row_height(
            ui,
            "bank.transactions.table",
            &columns,
            shown.len(),
            56.25,
            |ui, row, col| {
                let item = shown[row];
                match col {
                    0 => {
                        ui.label(&item.code);
                    }
                    1 => {
                        ui.label(&item.account);
                    }
                    2 => crate::widgets::tag(
                        ui,
                        &item.transaction_type,
                        if item.transaction_type == "Thu" {
                            crate::widgets::TagTone::Success
                        } else if item.transaction_type == "Chi" {
                            crate::widgets::TagTone::Error
                        } else {
                            crate::widgets::TagTone::Neutral
                        },
                    ),
                    3 => {
                        ui.colored_label(
                            if item.transaction_type == "Thu" {
                                Color32::from_rgb(22, 163, 74)
                            } else {
                                Color32::from_rgb(220, 38, 38)
                            },
                            format!(
                                "{}{}",
                                if item.transaction_type == "Thu" {
                                    "+"
                                } else if item.transaction_type == "Chi" {
                                    "−"
                                } else {
                                    ""
                                },
                                format_vnd(item.amount)
                            ),
                        );
                    }
                    4 => {
                        ui.label(&item.recipient_or_payer);
                    }
                    5 => {
                        ui.label(&item.category);
                    }
                    6 => {
                        ui.label(&item.date);
                    }
                    _ => crate::widgets::tag(
                        ui,
                        &item.status,
                        if item.status == "Đã hoàn thành" {
                            crate::widgets::TagTone::Success
                        } else if item.status == "Đã hủy" {
                            crate::widgets::TagTone::Error
                        } else {
                            crate::widgets::TagTone::Warning
                        },
                    ),
                }
            },
        );
        ui.add_space(10.0);
        let mut page = self.page - 1;
        crate::widgets::pagination(
            ui,
            "bank.transactions.pagination",
            &mut page,
            items.len(),
            &mut self.page_size,
        );
        self.page = page + 1;
        if !self.transactions_loaded {
            ui.label("Chưa xác định giao dịch do chưa tải được sổ dữ liệu.");
        }
    }

    fn render_statements(&self, ui: &mut Ui) {
        let by_account = completed_by_account(&self.transactions);
        let net = self.transactions_loaded.then(|| {
            by_account.values().fold(0_i64, |sum, (income, expense)| {
                sum.saturating_add(income.saturating_sub(*expense))
            })
        });
        crate::widgets::metrics_with_padding(
            ui,
            "bank.statements.metrics",
            &[
                crate::widgets::Metric {
                    label: "Phát sinh theo sổ thu/chi ngân hàng",
                    value: net.map(format_vnd).unwrap_or_else(|| "—".into()),
                    detail: "",
                    color: Color32::from_rgb(15, 23, 42),
                    value_size: 20.0,
                },
                crate::widgets::Metric {
                    label: "Sao kê ngân hàng thật",
                    value: "Chưa có".into(),
                    detail: "",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 20.0,
                },
                crate::widgets::Metric {
                    label: "Chênh lệch đối soát",
                    value: "Chưa xác định".into(),
                    detail: "Cần sao kê để đối chiếu",
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 20.0,
                },
            ],
            egui::vec2(16.0, 16.0),
        );
        ui.add_space(16.0);
        ui.horizontal_wrapped(|ui| {
            ui.label(
                RichText::new("Danh sách bản sao kê & Biên bản đối soát số dư")
                    .size(16.0)
                    .strong(),
            );
            ui.add_enabled(false, egui::Button::new("Tải lên sao kê ngân hàng"))
                .on_disabled_hover_text("Chưa có API nhập hoặc bộ phân tích sao kê ngân hàng.");
        });
        ui.add_space(12.0);
        use crate::widgets::TableColumn;
        let columns = [
            TableColumn {
                title: "Tài khoản ngân hàng",
                width: 240.0,
            },
            TableColumn {
                title: "Tổng thu",
                width: 180.0,
            },
            TableColumn {
                title: "Tổng chi",
                width: 180.0,
            },
            TableColumn {
                title: "Phát sinh ròng",
                width: 180.0,
            },
            TableColumn {
                title: "Sao kê ngân hàng",
                width: 160.0,
            },
            TableColumn {
                title: "Đối soát",
                width: 160.0,
            },
        ];
        let rows = by_account.iter().collect::<Vec<_>>();
        crate::widgets::table_with_row_height(
            ui,
            "bank.statements.table",
            &columns,
            rows.len(),
            56.25,
            |ui, row, col| {
                let (account, (income, expense)) = rows[row];
                match col {
                    0 => {
                        ui.label(account);
                    }
                    1 => {
                        ui.colored_label(Color32::from_rgb(22, 163, 74), format_vnd(*income));
                    }
                    2 => {
                        ui.colored_label(Color32::from_rgb(220, 38, 38), format_vnd(*expense));
                    }
                    3 => {
                        ui.label(format_vnd(income.saturating_sub(*expense)));
                    }
                    4 => {
                        crate::widgets::tag(ui, "Chưa có sao kê", crate::widgets::TagTone::Neutral)
                    }
                    _ => {
                        crate::widgets::tag(ui, "Chưa đối chiếu", crate::widgets::TagTone::Warning)
                    }
                }
            },
        );
        ui.add_space(12.0);
        ui.label("Chưa có API nhập sao kê và đối chiếu. Không thể xác nhận số dư thực tế từ sổ phiếu nội bộ.");
    }

    fn render_ebanking(&self, ui: &mut Ui) {
        egui::Frame::none()
            .fill(Color32::WHITE)
            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
            .rounding(8.0)
            .inner_margin(16.0)
            .show(ui, |ui| {
                ui.set_width(ui.available_width().min(846.0));
                ui.label(
                    RichText::new("Cổng Kết Nối Open Banking API Doanh Nghiệp")
                        .size(16.0)
                        .strong(),
                );
                ui.add_space(16.0);
                for (name, reason) in [
                    (
                        "Vietcombank Corporate API",
                        "Thiếu Client ID, Secret và webhook xác nhận giao dịch.",
                    ),
                    (
                        "BIDV iBank Direct Gateway",
                        "Chưa có thông tin sandbox/production được cấp quyền.",
                    ),
                    (
                        "Techcombank Business API",
                        "Chưa có webhook biến động số dư thật.",
                    ),
                    (
                        "MB Bank Corporate Gateway",
                        "Chưa cấu hình Secret Key OAuth2.",
                    ),
                ] {
                    egui::Frame::none()
                        .fill(Color32::from_rgb(248, 250, 252))
                        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                        .rounding(8.0)
                        .inner_margin(14.0)
                        .show(ui, |ui| {
                            ui.set_width(ui.available_width());
                            ui.label(RichText::new(name).size(14.0).strong());
                            ui.add_space(4.0);
                            ui.label(
                                RichText::new(reason)
                                    .size(12.5)
                                    .color(Color32::from_rgb(100, 116, 139)),
                            );
                            ui.horizontal_wrapped(|ui| {
                                crate::widgets::tag(
                                    ui,
                                    "Chưa cấu hình",
                                    crate::widgets::TagTone::Neutral,
                                );
                                let mut connected = false;
                                ui.add_enabled(
                                    false,
                                    egui::Checkbox::new(&mut connected, "Kết nối"),
                                )
                                .on_disabled_hover_text(
                                    "Chưa có API cấu hình hoặc đồng bộ ngân hàng.",
                                );
                            });
                        });
                    ui.add_space(14.0);
                }
                ui.horizontal_wrapped(|ui| {
                    for label in ["Kiểm tra kết nối", "Lưu cấu hình API"] {
                        ui.add_enabled(false, egui::Button::new(label))
                            .on_disabled_hover_text(
                                "Chưa có API cấu hình hoặc kiểm tra ngân hàng.",
                            );
                    }
                });
                ui.add_space(8.0);
                ui.label("Chưa có API cấu hình, kiểm tra hoặc đồng bộ ngân hàng điện tử.");
            });
    }
}

fn account_label(account: &FinanceBankAccount) -> String {
    format!("{} ({})", account.bank_name, account.account_number)
}

fn format_vnd(amount: i64) -> String {
    let digits = amount.unsigned_abs().to_string();
    let mut formatted = String::with_capacity(digits.len() + digits.len() / 3);
    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index) % 3 == 0 {
            formatted.push('.');
        }
        formatted.push(digit);
    }
    format!("{}{} ₫", if amount < 0 { "−" } else { "" }, formatted)
}

fn completed_by_account(transactions: &[FinanceCashTransaction]) -> BTreeMap<String, (i64, i64)> {
    let mut summaries = BTreeMap::new();
    for transaction in transactions
        .iter()
        .filter(|transaction| transaction.status == "Đã hoàn thành")
    {
        let totals = summaries
            .entry(transaction.account.clone())
            .or_insert((0_i64, 0_i64));
        if transaction.transaction_type == "Thu" {
            totals.0 = totals.0.saturating_add(transaction.amount);
        } else if transaction.transaction_type == "Chi" {
            totals.1 = totals.1.saturating_add(transaction.amount);
        }
    }
    summaries
}

#[cfg(test)]
mod tests {
    use super::*;

    fn transaction(
        account: &str,
        transaction_type: &str,
        amount: i64,
        status: &str,
    ) -> FinanceCashTransaction {
        FinanceCashTransaction {
            key: format!("{account}-{transaction_type}-{amount}-{status}"),
            code: "FT-TEST".to_owned(),
            transaction_type: transaction_type.to_owned(),
            source: "bank".to_owned(),
            category: "Chuyển khoản".to_owned(),
            amount,
            date: "2026-10-09".to_owned(),
            recipient_or_payer: "Đối tác".to_owned(),
            account: account.to_owned(),
            status: status.to_owned(),
            note: String::new(),
            department: String::new(),
            employee_code: String::new(),
            created_at: "2026-10-09T00:00:00Z".to_owned(),
            updated_at: "2026-10-09T00:00:00Z".to_owned(),
        }
    }

    #[test]
    fn routes_cover_bank_subpages_and_enable_the_atomic_transfer_page() {
        assert_eq!(
            BankRoute::from_path("/admin/finance/cash/bank"),
            Some(BankRoute::Accounts)
        );
        assert_eq!(
            BankRoute::from_path("/admin/finance/cash/bank/accounts"),
            Some(BankRoute::Accounts)
        );
        assert_eq!(
            BankRoute::from_path("/admin/finance/cash/bank/statements"),
            Some(BankRoute::Statements)
        );
        assert_eq!(
            BankRoute::from_path("/admin/finance/cash/transfer"),
            Some(BankRoute::Transfer)
        );
        assert_eq!(BankRoute::from_path("/admin/finance/cash/petty"), None);
    }

    #[test]
    fn account_form_validates_lengths_and_nonnegative_opening_balance() {
        let form = AccountForm {
            bank_name: "  Ngân hàng A  ".to_owned(),
            account_number: " 001234 ".to_owned(),
            account_holder: " NGUYEN VAN A ".to_owned(),
            branch: " Hà Nội ".to_owned(),
            opening_balance: "1.250.000".to_owned(),
        };
        let payload = form.payload().expect("valid account form");
        assert_eq!(payload.bank_name, "Ngân hàng A");
        assert_eq!(payload.account_number, "001234");
        assert_eq!(payload.balance, 1_250_000);
        assert_eq!(payload.status, "Đang hoạt động");

        let invalid = AccountForm {
            opening_balance: "-1".to_owned(),
            ..form
        };
        assert!(invalid.payload().is_err());
    }

    #[test]
    fn transfer_form_matches_legacy_minimum_and_rejects_invalid_account_pairs() {
        let valid = TransferForm {
            from_account_key: "bank-a".to_owned(),
            to_account_key: "bank-b".to_owned(),
            amount: "1.250.000".to_owned(),
            note: "  Điều chuyển nội bộ  ".to_owned(),
        }
        .payload()
        .expect("valid internal transfer");
        assert_eq!(valid.amount, 1_250_000);
        assert_eq!(valid.note, "Điều chuyển nội bộ");

        let same_account = TransferForm {
            to_account_key: "bank-a".to_owned(),
            ..TransferForm {
                from_account_key: "bank-a".to_owned(),
                to_account_key: "bank-b".to_owned(),
                amount: "10000".to_owned(),
                note: String::new(),
            }
        };
        assert!(same_account.payload().is_err());

        let below_legacy_minimum = TransferForm {
            amount: "9999".to_owned(),
            ..valid_form()
        };
        assert!(below_legacy_minimum.payload().is_err());
    }

    fn valid_form() -> TransferForm {
        TransferForm {
            from_account_key: "bank-a".to_owned(),
            to_account_key: "bank-b".to_owned(),
            amount: "10000".to_owned(),
            note: String::new(),
        }
    }

    #[test]
    fn vnd_format_groups_digits_without_claiming_a_live_bank_balance() {
        assert_eq!(format_vnd(1_234_567), "1.234.567 ₫");
        assert_eq!(format_vnd(-50_000), "−50.000 ₫");
    }

    #[test]
    fn statement_summaries_only_include_completed_bank_vouchers() {
        let rows = vec![
            transaction("Tài khoản 1", "Thu", 1_000, "Đã hoàn thành"),
            transaction("Tài khoản 1", "Chi", 200, "Đã hoàn thành"),
            transaction("Tài khoản 1", "Thu", 5_000, "Chờ duyệt"),
            transaction("Tài khoản 2", "Chi", 8_000, "Đã hủy"),
        ];
        assert_eq!(
            completed_by_account(&rows).get("Tài khoản 1"),
            Some(&(1_000, 200))
        );
        assert!(!completed_by_account(&rows).contains_key("Tài khoản 2"));
    }
}
