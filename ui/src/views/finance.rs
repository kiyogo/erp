use std::time::Duration;

use egui::{Color32, RichText, Ui};
use web_time::Instant;

use crate::{
    api::{
        ApiClient, ApiTask, CreateFinanceCashTransaction, FinanceCashMutationResponse,
        FinanceCashTransaction, FinanceCashTransactionsResponse, GenericCollectionResponse,
        GenericRecordResponse,
    },
    models::Session,
};

const PAGE_SIZE: usize = 8;
const REFRESH_INTERVAL: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CashFilter {
    All,
    Income,
    Expense,
    Pending,
}

impl CashFilter {
    fn for_route(path: &str) -> Self {
        match path {
            "/admin/finance/cash/income" => Self::Income,
            "/admin/finance/cash/expense" => Self::Expense,
            _ => Self::All,
        }
    }

    fn matches(self, transaction: &FinanceCashTransaction) -> bool {
        match self {
            Self::All => true,
            Self::Income => transaction.transaction_type == "Thu",
            Self::Expense => transaction.transaction_type == "Chi",
            Self::Pending => transaction.status == "Chờ duyệt",
        }
    }
}

#[derive(Default)]
struct CashForm {
    transaction_type: String,
    source: String,
    category: String,
    amount: String,
    date: String,
    recipient_or_payer: String,
    account: String,
    status: String,
    note: String,
    department: String,
    employee_code: String,
}

impl CashForm {
    fn new(transaction_type: &str) -> Self {
        Self {
            transaction_type: transaction_type.to_owned(),
            source: "bank".to_owned(),
            category: String::new(),
            amount: String::new(),
            date: chrono::Utc::now().format("%Y-%m-%d").to_string(),
            recipient_or_payer: String::new(),
            account: String::new(),
            status: "Đã hoàn thành".to_owned(),
            note: String::new(),
            department: String::new(),
            employee_code: String::new(),
        }
    }

    fn payload(&self) -> Result<CreateFinanceCashTransaction, String> {
        let amount = self
            .amount
            .trim()
            .replace('.', "")
            .replace(',', "")
            .replace(' ', "")
            .parse::<i64>()
            .map_err(|_| "Số tiền phải là số nguyên dương.".to_owned())?;
        if !(1..=1_000_000_000_000).contains(&amount) {
            return Err("Số tiền phải nằm trong khoảng 1 đến 1.000.000.000.000.".to_owned());
        }
        if self.category.trim().is_empty() {
            return Err("Vui lòng nhập nội dung thu chi.".to_owned());
        }
        if self.recipient_or_payer.trim().is_empty() {
            return Err("Vui lòng nhập đối tác hoặc người nhận.".to_owned());
        }
        if self.account.trim().is_empty() {
            return Err("Vui lòng nhập tài khoản hoặc quỹ tiền.".to_owned());
        }
        let date_is_normalized = chrono::NaiveDate::parse_from_str(&self.date, "%Y-%m-%d")
            .map(|date| date.format("%Y-%m-%d").to_string() == self.date)
            .unwrap_or(false);
        if !date_is_normalized {
            return Err("Ngày hạch toán phải theo định dạng YYYY-MM-DD.".to_owned());
        }
        if !matches!(self.transaction_type.as_str(), "Thu" | "Chi") {
            return Err("Loại chứng từ không hợp lệ.".to_owned());
        }
        if !matches!(self.source.as_str(), "bank" | "petty") {
            return Err("Nguồn tiền không hợp lệ.".to_owned());
        }
        if !matches!(
            self.status.as_str(),
            "Đã hoàn thành" | "Chờ duyệt" | "Đã hủy"
        ) {
            return Err("Trạng thái không hợp lệ.".to_owned());
        }

        Ok(CreateFinanceCashTransaction {
            // The API owns code generation; never trust a client-supplied voucher number.
            code: None,
            transaction_type: self.transaction_type.clone(),
            source: self.source.clone(),
            category: self.category.trim().to_owned(),
            amount,
            date: self.date.clone(),
            recipient_or_payer: self.recipient_or_payer.trim().to_owned(),
            account: self.account.trim().to_owned(),
            status: self.status.clone(),
            note: self.note.trim().to_owned(),
            department: optional_string(&self.department),
            employee_code: optional_string(&self.employee_code).map(|value| value.to_uppercase()),
        })
    }
}

enum CashMutation {
    Create(ApiTask<FinanceCashMutationResponse>),
    Cancel {
        transaction_id: String,
        task: ApiTask<FinanceCashMutationResponse>,
    },
}

pub struct FinanceView {
    transactions: Vec<FinanceCashTransaction>,
    list_task: Option<ApiTask<FinanceCashTransactionsResponse>>,
    mutation: Option<CashMutation>,
    loaded_for: Option<String>,
    current_path: String,
    last_load: Option<Instant>,
    needs_reload: bool,
    search: String,
    filter: CashFilter,
    page: usize,
    page_size: usize,
    create_open: bool,
    form: CashForm,
    form_error: String,
    detail_key: Option<String>,
    cancel_key: Option<String>,
    error: String,
    notice: String,
    data_loaded: bool,
    pages: FinancePages,
}

impl Default for FinanceView {
    fn default() -> Self {
        Self {
            transactions: Vec::new(),
            list_task: None,
            mutation: None,
            loaded_for: None,
            current_path: String::new(),
            last_load: None,
            needs_reload: true,
            search: String::new(),
            filter: CashFilter::All,
            page: 1,
            page_size: PAGE_SIZE,
            create_open: false,
            form: CashForm::default(),
            form_error: String::new(),
            detail_key: None,
            cancel_key: None,
            error: String::new(),
            notice: String::new(),
            data_loaded: false,
            pages: FinancePages::default(),
        }
    }
}

impl FinanceView {
    fn switch_account(&mut self, user_id: &str) {
        *self = Self {
            loaded_for: Some(user_id.to_owned()),
            ..Self::default()
        };
    }

    fn set_route(&mut self, route_path: &str) {
        if self.current_path != route_path {
            self.current_path = route_path.to_owned();
            self.filter = CashFilter::for_route(route_path);
            self.page = 1;
            self.search.clear();
        }
    }

    fn request_list(&mut self, session: &Session, api: &ApiClient) {
        if self.list_task.is_none() {
            self.list_task = Some(api.list_finance_cash_transactions_task(session, None));
            self.needs_reload = false;
        }
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.switch_account(&session.user.id);
        }
        if self.needs_reload
            || (self.list_task.is_none()
                && self
                    .last_load
                    .is_none_or(|last| last.elapsed() >= REFRESH_INTERVAL))
        {
            self.request_list(session, api);
        }

        if let Some(result) = self.list_task.as_ref().and_then(ApiClient::poll) {
            self.list_task = None;
            self.last_load = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.transactions = response.data;
                    self.data_loaded = true;
                    self.error.clear();
                    if self
                        .detail_key
                        .as_ref()
                        .is_some_and(|key| !self.transactions.iter().any(|item| &item.key == key))
                    {
                        self.detail_key = None;
                    }
                }
                Err(error) => self.error = error,
            }
        }

        let mutation_result = self.mutation.as_ref().and_then(|mutation| match mutation {
            CashMutation::Create(task) => ApiClient::poll(task).map(|result| (None, result)),
            CashMutation::Cancel {
                transaction_id,
                task,
            } => ApiClient::poll(task).map(|result| (Some(transaction_id.clone()), result)),
        });
        if let Some((cancelled_id, result)) = mutation_result {
            self.mutation = None;
            match result {
                Ok(response) => {
                    if cancelled_id.is_some() {
                        self.detail_key = None;
                        self.cancel_key = None;
                        self.notice = "Đã hủy chứng từ; lịch sử vẫn được giữ nguyên.".to_owned();
                    } else {
                        self.create_open = false;
                        self.form = CashForm::default();
                        self.notice = format!("Đã lập chứng từ {}.", response.transaction.code);
                    }
                    self.error.clear();
                    self.needs_reload = true;
                }
                Err(error) => {
                    self.error = error;
                    self.notice.clear();
                }
            }
        }
        ctx.request_repaint_after(Duration::from_millis(120));
    }

    fn filtered_transactions(&self) -> Vec<FinanceCashTransaction> {
        let query = self.search.trim().to_lowercase();
        self.transactions
            .iter()
            .filter(|transaction| {
                self.current_path != "/admin/finance/cash/petty" || transaction.source == "petty"
            })
            .filter(|transaction| self.filter.matches(transaction))
            .filter(|transaction| {
                query.is_empty()
                    || [
                        transaction.code.as_str(),
                        transaction.category.as_str(),
                        transaction.recipient_or_payer.as_str(),
                        transaction.account.as_str(),
                    ]
                    .iter()
                    .any(|field| field.to_lowercase().contains(&query))
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
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.switch_account(&session.user.id);
        }
        self.set_route(route_path);
        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Sổ thu chi hiện chỉ dành cho quản trị viên.");
            return;
        }
        if !is_supported_route(route_path) {
            self.pages.render(ui, ctx, session, api, route_path);
            return;
        }

        self.poll(ctx, session, api);
        let mut open_create = false;
        let mut create_action = false;
        let mut cancel_action: Option<String> = None;

        ui.spacing_mut().item_spacing.y = 0.0;
        ui.add_space(8.0);
        if !self.notice.is_empty() {
            ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
        }
        let petty = route_path == "/admin/finance/cash/petty";
        let transactions = self
            .transactions
            .iter()
            .filter(|t| !petty || t.source == "petty")
            .collect::<Vec<_>>();
        let income = transactions
            .iter()
            .filter(|t| t.transaction_type == "Thu" && t.status == "Đã hoàn thành")
            .fold(0_i64, |sum, t| sum.saturating_add(t.amount));
        let expense = transactions
            .iter()
            .filter(|t| t.transaction_type == "Chi" && t.status == "Đã hoàn thành")
            .fold(0_i64, |sum, t| sum.saturating_add(t.amount));
        let pending = transactions
            .iter()
            .filter(|t| t.status == "Chờ duyệt")
            .count();
        let unknown = !self.data_loaded;
        let shown_value = |v: String| if unknown { "—".to_owned() } else { v };
        crate::widgets::metrics(
            ui,
            "finance.cash.metrics",
            &[
                crate::widgets::Metric {
                    label: if petty {
                        "Tổng thu vào quỹ"
                    } else {
                        "Tổng tiền thực thu (+)"
                    },
                    value: shown_value(format!("+{} ₫", format_money(income))),
                    detail: "Tính từ các chứng từ đã hoàn thành",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: if petty {
                        "Tổng chi từ quỹ"
                    } else {
                        "Tổng tiền thực chi (-)"
                    },
                    value: shown_value(format!("-{} ₫", format_money(expense))),
                    detail: "Tính từ các chứng từ đã hoàn thành",
                    color: Color32::from_rgb(220, 38, 38),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: if petty {
                        "Biến động quỹ trong kỳ"
                    } else {
                        "Chênh lệch dòng tiền thuần (Net)"
                    },
                    value: shown_value(format_signed_money(income.saturating_sub(expense))),
                    detail: "Thu trừ chi của các chứng từ đã hoàn thành",
                    color: if income >= expense {
                        crate::theme::PRIMARY
                    } else {
                        Color32::from_rgb(220, 38, 38)
                    },
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: if petty {
                        "Tạm ứng chờ quyết toán"
                    } else {
                        "Chứng từ thu chi chờ duyệt"
                    },
                    value: shown_value(format!("{pending} Chứng từ")),
                    detail: "Chưa được tính vào dòng tiền thực tế",
                    color: Color32::from_rgb(217, 119, 6),
                    value_size: 24.0,
                },
            ],
        );
        ui.add_space(16.0);
        let filters = if petty {
            [
                CashFilter::All,
                CashFilter::Expense,
                CashFilter::Pending,
                CashFilter::Income,
            ]
        } else {
            [
                CashFilter::All,
                CashFilter::Income,
                CashFilter::Expense,
                CashFilter::Pending,
            ]
        };
        let selected = filters.iter().position(|v| *v == self.filter).unwrap_or(0);
        let mut clear_search = false;
        let toolbar = crate::widgets::filter_toolbar_with_more(
            ui,
            "finance.cash",
            if petty {
                &[
                    "Tất cả phiếu quỹ",
                    "Đã chi tiền",
                    "Tạm ứng chờ quyết toán",
                    "Đã hoàn ứng (+)",
                ]
            } else {
                &[
                    "Tất cả phiếu",
                    "Phiếu Thu (+)",
                    "Phiếu Chi (-)",
                    "Chờ duyệt",
                ]
            },
            selected,
            &mut self.search,
            "Tìm theo mã phiếu, nội dung, đối tác...",
            "+ Lập phiếu thu / chi",
            false,
            usize::MAX,
            |ui| {
                if ui.button("Xóa tìm kiếm").clicked() {
                    clear_search = true;
                    ui.close_menu();
                }
            },
        );
        if let Some(index) = toolbar.selected {
            self.filter = filters[index];
            self.page = 1;
        }
        if toolbar.search_changed {
            self.page = 1;
        }
        if clear_search {
            self.search.clear();
            self.page = 1;
        }
        if toolbar.reload_clicked && self.list_task.is_none() {
            self.needs_reload = true;
        }
        if toolbar.create_clicked && self.mutation.is_none() {
            open_create = true;
        }
        ui.add_space(12.0);
        let filtered = self.filtered_transactions();
        let pages = filtered.len().div_ceil(self.page_size).max(1);
        self.page = self.page.clamp(1, pages);
        let rows = filtered
            .iter()
            .skip((self.page - 1) * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        if self.transactions.is_empty() && self.list_task.is_some() {
            ui.spinner();
            ui.label("Đang tải sổ thu chi từ máy chủ…");
        } else if unknown {
            ui.label("Chưa thể hiển thị chứng từ vì lần tải dữ liệu thất bại.");
        } else if petty {
            render_petty_table(ui, &rows, &mut self.detail_key);
        } else {
            let flexible = (ui.available_width() - 2.0 - 740.0).max(420.0);
            let columns = [
                crate::widgets::TableColumn {
                    title: "Mã chứng từ & Loại phiếu",
                    width: flexible * 213.828125 / 454.0,
                },
                crate::widgets::TableColumn {
                    title: "Nội dung hạch toán & Đối tác",
                    width: flexible * 240.171875 / 454.0,
                },
                crate::widgets::TableColumn {
                    title: "Số tiền giao dịch",
                    width: 190.0,
                },
                crate::widgets::TableColumn {
                    title: "Tài khoản nguồn / Quỹ",
                    width: 190.0,
                },
                crate::widgets::TableColumn {
                    title: "Ngày hạch toán",
                    width: 120.0,
                },
                crate::widgets::TableColumn {
                    title: "Trạng thái",
                    width: 130.0,
                },
                crate::widgets::TableColumn {
                    title: "Thao tác",
                    width: 110.0,
                },
            ];
            crate::widgets::table_with_row_height(
                ui,
                "finance.cash.table",
                &columns,
                rows.len(),
                76.0,
                |ui, row, col| {
                    let t = rows[row];
                    let is_income = t.transaction_type == "Thu";
                    let color = if is_income {
                        Color32::from_rgb(22, 163, 74)
                    } else {
                        Color32::from_rgb(220, 38, 38)
                    };
                    match col {
                        0 => {
                            ui.label(RichText::new(&t.code).size(13.5).strong().color(color));
                            crate::widgets::tag(
                                ui,
                                if is_income {
                                    "Phiếu Thu (+)"
                                } else {
                                    "Phiếu Chi (-)"
                                },
                                if is_income {
                                    crate::widgets::TagTone::Success
                                } else {
                                    crate::widgets::TagTone::Error
                                },
                            );
                        }
                        1 => {
                            ui.label(RichText::new(&t.category).size(13.0).strong());
                            ui.label(
                                RichText::new(format!("Đối tác: {}", t.recipient_or_payer))
                                    .size(11.5)
                                    .color(Color32::from_rgb(100, 116, 139)),
                            );
                        }
                        2 => {
                            ui.label(
                                RichText::new(format!(
                                    "{}{} ₫",
                                    if is_income { "+" } else { "-" },
                                    format_money(t.amount)
                                ))
                                .size(14.5)
                                .strong()
                                .color(color),
                            );
                        }
                        3 => {
                            ui.label(
                                RichText::new(&t.account)
                                    .size(12.0)
                                    .color(Color32::from_rgb(37, 99, 235)),
                            );
                        }
                        4 => {
                            ui.label(
                                RichText::new(&t.date)
                                    .size(12.0)
                                    .color(Color32::from_rgb(71, 85, 105)),
                            );
                        }
                        5 => crate::widgets::tag(
                            ui,
                            &t.status,
                            match t.status.as_str() {
                                "Đã hoàn thành" => crate::widgets::TagTone::Success,
                                "Đã hủy" => crate::widgets::TagTone::Error,
                                _ => crate::widgets::TagTone::Warning,
                            },
                        ),
                        _ => {
                            let detail = ui.small_button("Phiếu");
                            crate::visual_test::record(
                                &format!("finance.cash.row.{row}.detail"),
                                detail.rect,
                            );
                            if detail.clicked() {
                                self.detail_key = Some(t.key.clone());
                            }
                            if t.status != "Đã hủy"
                                && ui
                                    .add_enabled(
                                        self.mutation.is_none(),
                                        egui::Button::new("Hủy phiếu"),
                                    )
                                    .clicked()
                            {
                                self.cancel_key = Some(t.key.clone());
                            }
                        }
                    }
                },
            );
            ui.add_space(10.0);
            crate::widgets::action_row(ui, |ui| {
                if ui
                    .add_enabled(self.page < pages, egui::Button::new("›"))
                    .clicked()
                {
                    self.page += 1;
                }
                ui.label(format!("{} / {}", self.page, pages));
                if ui
                    .add_enabled(self.page > 1, egui::Button::new("‹"))
                    .clicked()
                {
                    self.page -= 1;
                }
            });
        }

        if open_create {
            let default_type = match self.filter {
                CashFilter::Income => "Thu",
                CashFilter::Expense => "Chi",
                _ => "Thu",
            };
            self.form = CashForm::new(default_type);
            if petty {
                self.form.transaction_type = "Chi".into();
                self.form.source = "petty".into();
                self.form.account = "Quỹ tiền mặt".into();
            }
            self.form_error.clear();
            self.create_open = true;
        }

        if self.create_open {
            let busy = self.mutation.is_some();
            let mut cancel = false;
            let (_, closed) = crate::widgets::modal(
                ctx,
                "finance.cash.create",
                "Lập Chứng Từ Phiếu Thu / Phiếu Chi Tiền Mới",
                640.0,
                busy,
                |ui| {
                    render_cash_form(ui, &mut self.form);
                    if !self.error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    }
                    if !self.form_error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
                    }
                    if busy {
                        ui.spinner();
                        ui.label("Đang lưu…");
                    }
                    ui.add_space(18.0);
                    crate::widgets::action_row(ui, |ui| {
                        create_action = ui
                            .add(
                                egui::Button::new(
                                    RichText::new("Xác nhận lập phiếu").color(Color32::WHITE),
                                )
                                .fill(crate::theme::PRIMARY)
                                .min_size(egui::vec2(0.0, 32.0)),
                            )
                            .clicked();
                        cancel = ui
                            .add(egui::Button::new("Hủy").min_size(egui::vec2(0.0, 32.0)))
                            .clicked();
                    });
                },
            );
            if !busy && (closed || cancel) {
                self.create_open = false;
            }
        }

        self.render_cash_detail(ctx);
        cancel_action = self.render_cancel_confirmation(ctx).or(cancel_action);

        if create_action && self.mutation.is_none() {
            match self.form.payload() {
                Ok(payload) => {
                    self.mutation = Some(CashMutation::Create(
                        api.create_finance_cash_transaction_task(session, &payload),
                    ));
                    self.form_error.clear();
                    self.error.clear();
                }
                Err(error) => self.form_error = error,
            }
        }
        if let Some(key) = cancel_action
            && self.mutation.is_none()
        {
            self.mutation = Some(CashMutation::Cancel {
                transaction_id: key.clone(),
                task: api.cancel_finance_cash_transaction_task(session, &key),
            });
            self.error.clear();
        }
    }
    fn render_cash_detail(&mut self, ctx: &egui::Context) {
        let Some(transaction) = self
            .detail_key
            .as_ref()
            .and_then(|key| self.transactions.iter().find(|item| &item.key == key))
            .cloned()
        else {
            return;
        };
        let mut request_cancel = false;
        let (_, closed) = crate::widgets::drawer(
            ctx,
            "finance.cash.detail",
            "Chi tiết chứng từ thu chi",
            580.0,
            |ui| {
                egui::Frame::group(ui.style())
                    .fill(Color32::from_rgb(248, 250, 252))
                    .inner_margin(18.0)
                    .show(ui, |ui| {
                        let income = transaction.transaction_type == "Thu";
                        ui.add(
                            egui::Label::new(
                                RichText::new(format!(
                                    "{} ({})",
                                    if income {
                                        "PHIẾU THU TIỀN"
                                    } else {
                                        "PHIẾU CHI TIỀN"
                                    },
                                    transaction.code
                                ))
                                .strong()
                                .size(18.0)
                                .color(if income {
                                    Color32::from_rgb(22, 163, 74)
                                } else {
                                    Color32::from_rgb(220, 38, 38)
                                }),
                            )
                            .wrap(),
                        );
                        detail_row(ui, "Trạng thái", &transaction.status);
                        detail_row(ui, "Ngày lập phiếu", &transaction.date);
                        detail_row(ui, "Nguồn", &transaction.account);
                    });
                ui.add_space(16.0);
                egui::Frame::group(ui.style())
                    .inner_margin(14.0)
                    .show(ui, |ui| {
                        ui.strong("Nội Dung Thanh Toán & Số Tiền:");
                        ui.add_space(10.0);
                        detail_row(ui, "Họ tên người nộp/nhận", &transaction.recipient_or_payer);
                        detail_row(ui, "Lý do thu / chi", &transaction.category);
                        detail_row(
                            ui,
                            "Số tiền thanh toán",
                            &format!("{} ₫", format_money(transaction.amount)),
                        );
                        detail_row(ui, "Ghi chú đính kèm", nonempty(&transaction.note));
                        detail_row(ui, "Phòng ban", nonempty(&transaction.department));
                        detail_row(ui, "Mã nhân viên", nonempty(&transaction.employee_code));
                    });
                ui.add_space(16.0);
                if transaction.status != "Đã hủy" {
                    let response = ui.add_enabled(
                        self.mutation.is_none() && self.cancel_key.is_none(),
                        egui::Button::new(
                            RichText::new("Hủy Phiếu").color(Color32::from_rgb(220, 38, 38)),
                        ),
                    );
                    crate::visual_test::record("finance.cash.detail.cancel", response.rect);
                    #[cfg(test)]
                    ctx.data_mut(|data| {
                        data.insert_temp(egui::Id::new("test.cash.detail.cancel"), response.rect)
                    });
                    request_cancel = response.clicked();
                }
            },
        );
        if closed {
            self.detail_key = None;
        }
        // Opening confirmation must never issue the cancellation request itself.
        if request_cancel {
            self.cancel_key = Some(transaction.key);
        }
    }

    fn render_cancel_confirmation(&mut self, ctx: &egui::Context) -> Option<String> {
        let key = self.cancel_key.clone()?;
        let Some(transaction) = self
            .transactions
            .iter()
            .find(|item| item.key == key && item.status != "Đã hủy")
        else {
            self.cancel_key = None;
            return None;
        };
        let busy = self.mutation.is_some();
        let (mut confirmed, mut dismissed) = (false, false);
        let (_, closed) = crate::widgets::modal(
            ctx,
            "finance.cash.cancel",
            "Xác nhận hủy chứng từ",
            460.0,
            busy,
            |ui| {
                ui.add(
                    egui::Label::new(format!("Xác nhận hủy phiếu {}?", transaction.code)).wrap(),
                );
                ui.add(egui::Label::new("Chứng từ được chuyển sang trạng thái Đã hủy; dữ liệu lịch sử không bị xóa.").wrap());
                if !self.error.is_empty() {
                    ui.colored_label(ui.visuals().error_fg_color, &self.error);
                }
                ui.add_space(16.0);
                crate::widgets::action_row(ui, |ui| {
                    let confirm = ui.button("Xác nhận hủy");
                    let cancel = ui.button("Không hủy");
                    crate::visual_test::record("finance.cash.cancel.confirm", confirm.rect);
                    crate::visual_test::record("finance.cash.cancel.dismiss", cancel.rect);
                    #[cfg(test)]
                    ctx.data_mut(|data| {
                        data.insert_temp(egui::Id::new("test.cash.cancel.confirm"), confirm.rect);
                        data.insert_temp(egui::Id::new("test.cash.cancel.dismiss"), cancel.rect);
                    });
                    confirmed = confirm.clicked();
                    dismissed = cancel.clicked();
                });
            },
        );
        if !busy && (closed || dismissed) {
            self.cancel_key = None;
        }
        if !busy && confirmed { Some(key) } else { None }
    }
}

fn petty_status(transaction: &FinanceCashTransaction) -> &'static str {
    match (
        transaction.status.as_str(),
        transaction.transaction_type.as_str(),
    ) {
        ("Đã hủy", _) => "Đã hủy",
        (_, "Thu") => "Đã hoàn ứng vào quỹ",
        ("Chờ duyệt", _) => "Tạm ứng chờ quyết toán",
        _ => "Đã chi tiền mặt",
    }
}

fn render_petty_table(ui: &mut Ui, rows: &[&FinanceCashTransaction], detail: &mut Option<String>) {
    let flexible = (ui.available_width() - 672.0).max(360.0);
    let columns = [
        ("Số phiếu & Thời gian", flexible * 0.48),
        ("Người nhận tiền & Phòng ban", 220.0),
        ("Nội dung chi tiêu tiền mặt", flexible * 0.52),
        ("Số tiền chi (VNĐ)", 170.0),
        ("Trạng thái", 170.0),
        ("Thao tác", 110.0),
    ]
    .map(|(title, width)| crate::widgets::TableColumn { title, width });
    crate::widgets::table(
        ui,
        "finance.petty.table",
        &columns,
        rows.len(),
        |ui, row, col| {
            let transaction = rows[row];
            let status = petty_status(transaction);
            match col {
                0 => {
                    ui.label(
                        RichText::new(&transaction.code)
                            .size(13.5)
                            .strong()
                            .color(crate::theme::PRIMARY),
                    );
                    ui.label(
                        RichText::new(&transaction.date)
                            .size(11.5)
                            .color(Color32::from_rgb(100, 116, 139)),
                    );
                }
                1 => {
                    ui.label(
                        RichText::new(&transaction.recipient_or_payer)
                            .size(13.0)
                            .strong(),
                    );
                    ui.label(
                        RichText::new(format!(
                            "Mã: {} · {}",
                            nonempty(&transaction.employee_code),
                            if transaction.department.is_empty() {
                                "Chưa khai báo"
                            } else {
                                &transaction.department
                            }
                        ))
                        .size(11.5),
                    );
                }
                2 => {
                    ui.label(RichText::new(&transaction.category).size(12.5));
                }
                3 => {
                    let income = transaction.transaction_type == "Thu";
                    let color = if income {
                        Color32::from_rgb(22, 163, 74)
                    } else if transaction.status == "Chờ duyệt" {
                        Color32::from_rgb(217, 119, 6)
                    } else {
                        Color32::from_rgb(220, 38, 38)
                    };
                    ui.label(
                        RichText::new(format!(
                            "{}{} ₫",
                            if income { "+" } else { "-" },
                            format_money(transaction.amount)
                        ))
                        .size(14.0)
                        .strong()
                        .color(color),
                    );
                }
                4 => crate::widgets::tag(
                    ui,
                    status,
                    match status {
                        "Đã hoàn ứng vào quỹ" => crate::widgets::TagTone::Success,
                        "Đã hủy" => crate::widgets::TagTone::Error,
                        "Tạm ứng chờ quyết toán" => crate::widgets::TagTone::Warning,
                        _ => crate::widgets::TagTone::Processing,
                    },
                ),
                _ => {
                    if ui.small_button("Phiếu").clicked() {
                        *detail = Some(transaction.key.clone());
                    }
                }
            }
        },
    );
}

fn is_supported_route(path: &str) -> bool {
    matches!(
        path,
        "/admin/finance/cash/transactions"
            | "/admin/finance/cash/income"
            | "/admin/finance/cash/expense"
            | "/admin/finance/cash/petty"
    )
}

#[derive(Default)]
struct FinancePages {
    path: String,
    scope: Option<&'static str>,
    records: Vec<serde_json::Value>,
    task: Option<ApiTask<GenericCollectionResponse>>,
    create: Option<ApiTask<GenericRecordResponse>>,
    loaded: bool,
    revision: String,
    error: String,
    notice: String,
    search: String,
    period: String,
    page: usize,
    page_size: usize,
    selected: Option<serde_json::Value>,
    budget_open: bool,
    budget: BudgetForm,
    reload: bool,
}

#[derive(Default)]
struct BudgetForm {
    code: String,
    period: String,
    department: String,
    allocated: String,
    spent: String,
}

impl BudgetForm {
    fn payload(&self) -> Result<serde_json::Value, String> {
        use serde_json::json;
        for (label, value, max) in [
            ("Mã ngân sách", &self.code, 100),
            ("Kỳ áp dụng", &self.period, 120),
            ("Phòng ban", &self.department, 200),
        ] {
            if value.trim().is_empty() || value.chars().count() > max {
                return Err(format!("{label} là bắt buộc, tối đa {max} ký tự."));
            }
        }
        let amount = |text: &str| -> Result<i64, String> {
            text.trim()
                .replace(['.', ',', ' '], "")
                .parse::<i64>()
                .ok()
                .filter(|v| (0..=1_000_000_000_000).contains(v))
                .ok_or_else(|| "Số tiền phải từ 0 đến 1.000.000.000.000 VNĐ.".into())
        };
        let allocated = amount(&self.allocated)?;
        let spent = amount(&self.spent)?;
        let rate =
            (allocated > 0).then(|| (spent as f64 / allocated as f64 * 1000.0).round() / 10.0);
        Ok(json!({
            "key": format!("budget-{}", chrono::Utc::now().timestamp_micros()),
            "code": self.code.trim(), "fiscalYear": self.period.trim(),
            "department": self.department.trim(), "allocatedBudget": allocated,
            "actualSpent": spent, "remainingBudget": allocated - spent,
            "utilizationRate": rate,
            "status": if spent > allocated { "Vượt ngân sách" }
                else if rate.is_some_and(|r| r > 80.0) { "Cảnh báo hạn mức" }
                else { "Trong hạn mức" }
        }))
    }
}

impl FinancePages {
    fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        path: &str,
    ) {
        let scope = finance_scope(path);
        if self.path != path {
            // Finish an outstanding create before moving the form to another route.
            if self.create.is_some() {
                ui.label("Đang lưu ngân sách; vui lòng chờ kết quả.");
                self.poll(ctx);
                return;
            }
            *self = Self {
                path: path.into(),
                scope,
                page_size: 10,
                ..Self::default()
            };
            if let Some(scope) = scope {
                self.task = Some(api.list_generic_collection_task(session, scope));
            }
        }
        self.poll(ctx);
        self.render_content(ui);
        if self.budget_open {
            let mut submit = false;
            let mut close = false;
            let (_, closed) = crate::widgets::modal(
                ctx,
                "finance.budget.create",
                "Phân bổ ngân sách phòng ban mới",
                500.0,
                self.create.is_some(),
                |ui| {
                    use crate::widgets::form_input;
                    ui.add_space(16.0);
                    if ui.available_width() >= 400.0 {
                        ui.columns(2, |cols| {
                            form_input(
                                &mut cols[0],
                                "budget.code",
                                "Mã ngân sách",
                                true,
                                &mut self.budget.code,
                                "",
                                false,
                            );
                            form_input(
                                &mut cols[1],
                                "budget.period",
                                "Kỳ áp dụng",
                                true,
                                &mut self.budget.period,
                                "",
                                false,
                            );
                        });
                    } else {
                        form_input(
                            ui,
                            "budget.code",
                            "Mã ngân sách",
                            true,
                            &mut self.budget.code,
                            "",
                            false,
                        );
                        form_input(
                            ui,
                            "budget.period",
                            "Kỳ áp dụng",
                            true,
                            &mut self.budget.period,
                            "",
                            false,
                        );
                    }
                    form_input(
                        ui,
                        "budget.department",
                        "Phòng ban thụ hưởng",
                        true,
                        &mut self.budget.department,
                        "Nhập đúng phòng ban thụ hưởng",
                        false,
                    );
                    if ui.available_width() >= 400.0 {
                        ui.columns(2, |cols| {
                            form_input(
                                &mut cols[0],
                                "budget.allocated",
                                "Ngân sách phê duyệt (VNĐ)",
                                true,
                                &mut self.budget.allocated,
                                "",
                                false,
                            );
                            form_input(
                                &mut cols[1],
                                "budget.spent",
                                "Đã giải ngân ban đầu",
                                true,
                                &mut self.budget.spent,
                                "",
                                false,
                            );
                        });
                    } else {
                        form_input(
                            ui,
                            "budget.allocated",
                            "Ngân sách phê duyệt (VNĐ)",
                            true,
                            &mut self.budget.allocated,
                            "",
                            false,
                        );
                        form_input(
                            ui,
                            "budget.spent",
                            "Đã giải ngân ban đầu",
                            true,
                            &mut self.budget.spent,
                            "",
                            false,
                        );
                    }
                    ui.label(
                        "Chỉ ghi nhận hạn mức và thực chi khai báo; không tạo chứng từ thanh toán.",
                    );
                    if !self.error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    }
                    ui.add_space(20.0);
                    crate::widgets::action_row(ui, |ui| {
                        submit = ui.button("Xác nhận phân bổ").clicked();
                        close = ui.button("Hủy").clicked();
                    });
                },
            );
            if closed || close {
                self.budget_open = false;
            }
            if submit && self.create.is_none() {
                match self.budget.payload() {
                    Ok(record) => {
                        self.create = Some(api.create_generic_collection_record_task(
                            session,
                            "finance_budgets",
                            &record,
                            (!self.revision.is_empty()).then_some(self.revision.as_str()),
                        ))
                    }
                    Err(error) => self.error = error,
                }
            }
        }
        if let Some(record) = self.selected.clone() {
            let title = if path.starts_with("/admin/finance/payroll") {
                "Phiếu lương chi tiết cán bộ nhân viên"
            } else {
                "Hồ sơ tài chính chi tiết"
            };
            let (_, closed) =
                crate::widgets::drawer(ctx, "finance.record.details", title, 520.0, |ui| {
                    if path.starts_with("/admin/finance/payroll") {
                        ui.label(
                            RichText::new(finance_text(&record, "employeeName"))
                                .size(16.0)
                                .strong(),
                        );
                        ui.label(format!(
                            "{} · {}",
                            finance_text(&record, "employeeCode"),
                            finance_text(&record, "department")
                        ));
                        ui.label(format!("Kỳ lương: {}", finance_text(&record, "month")));
                        ui.add_space(16.0);
                        for (label, field) in [
                            ("Lương cơ bản hợp đồng", "baseSalary"),
                            ("Ngày công làm việc", "workDays"),
                            ("Phụ cấp", "allowance"),
                            ("Thưởng", "bonus"),
                            ("Khấu trừ bảo hiểm", "insuranceDeduction"),
                            ("Khấu trừ thuế TNCN", "taxDeduction"),
                            ("LƯƠNG THỰC LĨNH (NET)", "netSalary"),
                        ] {
                            detail_row(ui, label, &finance_cell(&record, field));
                            ui.add_space(8.0);
                        }
                        ui.add_space(16.0);
                        for label in ["Tải phiếu lương PDF", "Gửi phiếu lương qua Email"]
                        {
                            ui.add_enabled(false, egui::Button::new(label))
                                .on_disabled_hover_text(
                                    "Chưa có API tạo tệp hoặc gửi phiếu lương.",
                                );
                        }
                        ui.label(
                            "Số tiền theo hồ sơ đã lưu. Không tự áp thuế suất hoặc tỷ lệ bảo hiểm.",
                        );
                    }
                    ui.collapsing("Dữ liệu hồ sơ đầy đủ", |ui| {
                        ui.label(serde_json::to_string_pretty(&record).unwrap_or_default());
                    });
                });
            if closed {
                self.selected = None;
            }
        }
        if self.task.is_some() || self.create.is_some() {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
        if self.reload && self.task.is_none() && self.create.is_none() {
            self.reload = false;
            if let Some(scope) = self.scope {
                self.task = Some(api.list_generic_collection_task(session, scope));
            }
        }
    }

    fn poll(&mut self, ctx: &egui::Context) {
        if let Some(result) = self.task.as_ref().and_then(ApiClient::poll) {
            self.task = None;
            match result {
                Ok(response) => {
                    self.records = response.data;
                    self.revision = response.revision;
                    self.loaded = true;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.create.as_ref().and_then(ApiClient::poll) {
            self.create = None;
            match result {
                Ok(response) => {
                    self.records.push(response.record);
                    self.revision = response.revision;
                    self.loaded = true;
                    self.budget_open = false;
                    self.error.clear();
                    self.notice = "Đã lưu hạn mức ngân sách.".into();
                }
                Err(error) => self.error = error,
            }
        }
        if self.task.is_some() || self.create.is_some() {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    fn render_content(&mut self, ui: &mut Ui) {
        use crate::widgets::{self, Metric, TableColumn};
        ui.spacing_mut().item_spacing.y = 0.0;
        ui.add_space(8.0);
        let path = self.path.clone();
        let budget = path.starts_with("/admin/finance/budget");
        let payroll = path.starts_with("/admin/finance/payroll");
        let title = finance_title(&path);
        if !self.error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
            ui.label(if self.loaded {
                "Đang giữ dữ liệu của lần tải thành công gần nhất."
            } else {
                "Chưa tải được dữ liệu; các chỉ số chưa xác định."
            });
            ui.add_space(8.0);
        }
        if !self.notice.is_empty() {
            ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
            ui.add_space(8.0);
        }
        let rows = self
            .records
            .iter()
            .filter(|r| {
                !payroll || self.period.is_empty() || finance_text(r, "month") == self.period
            })
            .cloned()
            .collect::<Vec<_>>();
        let known = |v: Option<i64>| {
            if self.loaded {
                v.map(|n| format!("{} ₫", signed_finance_money(n)))
                    .unwrap_or_else(|| "—".into())
            } else {
                "—".into()
            }
        };
        let metrics = if budget {
            let allocated = finance_sum(&rows, "allocatedBudget");
            let spent = finance_sum(&rows, "actualSpent");
            vec![
                Metric {
                    label: "Tổng ngân sách đã phê duyệt",
                    value: known(allocated),
                    detail: "",
                    color: crate::theme::PRIMARY,
                    value_size: 22.0,
                },
                Metric {
                    label: "Thực tế đã giải ngân (Actual)",
                    value: known(spent),
                    detail: "",
                    color: Color32::from_rgb(15, 23, 42),
                    value_size: 22.0,
                },
                Metric {
                    label: "Hạn mức ngân sách còn lại",
                    value: known(allocated.zip(spent).and_then(|(a, s)| a.checked_sub(s))),
                    detail: "",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 22.0,
                },
            ]
        } else if payroll {
            vec![
                Metric {
                    label: "Tổng quỹ lương thực lĩnh trong kỳ",
                    value: known(finance_sum(&rows, "netSalary")),
                    detail: "Theo hồ sơ lương đã lưu",
                    color: crate::theme::PRIMARY,
                    value_size: 22.0,
                },
                Metric {
                    label: "Tổng số nhân sự nhận lương",
                    value: if self.loaded {
                        format!("{} nhân viên", rows.len())
                    } else {
                        "—".into()
                    },
                    detail: "",
                    color: Color32::from_rgb(15, 23, 42),
                    value_size: 22.0,
                },
                Metric {
                    label: "Tiến độ giải ngân lương",
                    value: if self.loaded {
                        format!(
                            "{}/{} đã nhận lương",
                            rows.iter()
                                .filter(|r| finance_text(r, "status") == "Đã chi trả")
                                .count(),
                            rows.len()
                        )
                    } else {
                        "—".into()
                    },
                    detail: "Trạng thái được lưu; chưa xác nhận từ ngân hàng",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 22.0,
                },
            ]
        } else {
            let fields = finance_metric_fields(&path);
            fields
                .iter()
                .map(|(label, field)| Metric {
                    label,
                    value: known(finance_sum(&rows, field)),
                    detail: "Theo hồ sơ đã lưu",
                    color: crate::theme::PRIMARY,
                    value_size: 22.0,
                })
                .collect()
        };
        widgets::metrics_with_padding(
            ui,
            "finance.pages.metrics",
            &metrics,
            egui::vec2(16.0, 16.0),
        );
        ui.add_space(16.0);
        if payroll {
            ui.horizontal_wrapped(|ui| {
                ui.label("Kỳ tính lương:");
                let mut periods = self
                    .records
                    .iter()
                    .map(|r| finance_text(r, "month"))
                    .filter(|v| v != "—")
                    .collect::<Vec<_>>();
                periods.sort();
                periods.dedup();
                widgets::combo_box("payroll.period")
                    .selected_text(if self.period.is_empty() {
                        "Tất cả kỳ"
                    } else {
                        &self.period
                    })
                    .width(ui.available_width().min(160.0))
                    .show_ui(ui, |ui| {
                        if ui
                            .selectable_value(&mut self.period, String::new(), "Tất cả kỳ")
                            .changed()
                        {
                            self.page = 0;
                        }
                        for period in periods {
                            if ui
                                .selectable_value(&mut self.period, period.clone(), period)
                                .changed()
                            {
                                self.page = 0;
                            }
                        }
                    });
            });
            ui.add_space(12.0);
        }
        ui.horizontal_wrapped(|ui| {
            ui.label(RichText::new(title).size(16.0).strong());
            if ui
                .add_enabled(
                    self.task.is_none() && self.scope.is_some(),
                    egui::Button::new("Làm mới"),
                )
                .clicked()
            {
                self.reload = true;
            }
            if budget && !path.ends_with("/charts") {
                if ui
                    .add_enabled(
                        self.create.is_none() && self.loaded && !path.ends_with("/plans"),
                        egui::Button::new(if path.ends_with("/plans") {
                            "+ Tạo dự toán mới"
                        } else {
                            "+ Phân bổ ngân sách mới"
                        }),
                    )
                    .on_disabled_hover_text(if path.ends_with("/plans") {
                        "Chưa có API hạng mục dự toán chi tiết."
                    } else {
                        "Cần tải được danh sách trước khi tạo ngân sách."
                    })
                    .clicked()
                {
                    self.budget = BudgetForm {
                        spent: "0".into(),
                        ..Default::default()
                    };
                    self.budget_open = true;
                }
            }
            ui.add_enabled(false, egui::Button::new(finance_export_label(&path)))
                .on_disabled_hover_text("Chưa có API kết xuất tệp cho màn hình này.");
        });
        ui.add_space(12.0);
        if self.scope.is_none() || finance_static_subpage(&path) {
            ui.label(
                RichText::new(finance_missing_reason(&path)).color(Color32::from_rgb(180, 83, 9)),
            );
            ui.add_space(12.0);
        }
        if payroll {
            ui.label(RichText::new("Chưa có API tính/chốt công, ghi sổ, chi lương, nộp bảo hiểm hoặc thuế. Chỉ hiển thị số liệu có trong hồ sơ; trường thiếu hiển thị —.").size(12.0).color(Color32::from_rgb(100,116,139)));
            ui.add_space(12.0);
        }
        if self.task.is_some() {
            ui.spinner();
            ui.label("Đang tải dữ liệu tài chính…");
        }
        if path.ends_with("/budget/charts") {
            self.render_budget_charts(ui, &rows);
            return;
        }
        if path.ends_with("/payroll/insurance") {
            widgets::metrics_with_padding(
                ui,
                "payroll.insurance.metrics",
                &[
                    Metric {
                        label: "Doanh nghiệp đóng",
                        value: known(finance_sum(&rows, "employerInsurance")),
                        detail: "Chỉ từ số tiền đã ghi nhận, không áp tỷ lệ mặc định",
                        color: Color32::from_rgb(37, 99, 235),
                        value_size: 20.0,
                    },
                    Metric {
                        label: "Người lao động trích nộp",
                        value: known(finance_sum(&rows, "insuranceDeduction")),
                        detail: "Theo hồ sơ lương",
                        color: Color32::from_rgb(217, 119, 6),
                        value_size: 20.0,
                    },
                ],
                egui::vec2(16.0, 16.0),
            );
            ui.add_space(14.0);
        }
        if path.ends_with("/payroll/disburse") || path.ends_with("/payroll/accounting") {
            ui.add_enabled(
                false,
                egui::Button::new(if path.ends_with("/accounting") {
                    "Hạch toán ghi Sổ Cái"
                } else {
                    "Duyệt chi lương đồng loạt"
                }),
            )
            .on_disabled_hover_text("Chưa có API thực hiện và xác nhận nghiệp vụ này.");
            ui.add_space(12.0);
        }
        let (rect, _) = ui.allocate_exact_size(
            egui::vec2(ui.available_width().min(340.0), 32.0),
            egui::Sense::hover(),
        );
        if widgets::search_input(
            ui,
            rect,
            &mut self.search,
            if budget {
                "Tìm theo mã ngân sách, phòng ban..."
            } else {
                "Tìm theo mã, tên, nội dung..."
            },
        )
        .changed()
        {
            self.page = 0;
        }
        ui.add_space(12.0);
        let query = self.search.trim().to_lowercase();
        let filtered = rows
            .iter()
            .filter(|r| {
                query.is_empty()
                    || r.as_object().is_some_and(|o| {
                        o.values()
                            .filter_map(serde_json::Value::as_str)
                            .any(|v| v.to_lowercase().contains(&query))
                    })
            })
            .filter(|r| finance_route_matches(&path, r))
            .collect::<Vec<_>>();
        let schema = finance_columns(&path);
        self.page_size = self.page_size.max(1);
        self.page = self
            .page
            .min(filtered.len().div_ceil(self.page_size).max(1) - 1);
        let shown = if finance_static_subpage(&path) {
            Vec::new()
        } else {
            filtered
                .iter()
                .skip(self.page * self.page_size)
                .take(self.page_size)
                .copied()
                .collect::<Vec<_>>()
        };
        let columns = schema
            .iter()
            .map(|(label, _)| TableColumn {
                title: label,
                width: if label.chars().count() > 25 {
                    240.0
                } else {
                    180.0
                },
            })
            .chain(std::iter::once(TableColumn {
                title: "Thao tác",
                width: 150.0,
            }))
            .collect::<Vec<_>>();
        widgets::table_with_row_height(
            ui,
            "finance.pages.table",
            &columns,
            shown.len(),
            76.0,
            |ui, row, col| {
                let record = shown[row];
                if col == schema.len() {
                    if ui
                        .small_button(if payroll { "Phiếu" } else { "Hồ sơ" })
                        .clicked()
                    {
                        self.selected = Some(record.clone());
                    }
                    if payroll {
                        ui.add_enabled(false, egui::Button::new("Chi lương").small())
                            .on_disabled_hover_text("Chưa có API chi lương được xác nhận.");
                    }
                } else {
                    let (_, field) = schema[col];
                    if field == "status" {
                        widgets::tag(
                            ui,
                            &finance_text(record, field),
                            crate::widgets::TagTone::Neutral,
                        );
                    } else if field == "utilizationRate" {
                        let rate = finance_rate(record);
                        ui.label(
                            rate.map(|r| format!("{r:.1}%"))
                                .unwrap_or_else(|| "—".into()),
                        );
                        if let Some(rate) = rate {
                            ui.add(
                                egui::ProgressBar::new((rate / 100.0).clamp(0.0, 1.0) as f32)
                                    .desired_width(140.0)
                                    .fill(if rate > 85.0 {
                                        Color32::from_rgb(220, 38, 38)
                                    } else {
                                        crate::theme::PRIMARY
                                    }),
                            );
                        }
                    } else {
                        ui.label(finance_cell(record, field));
                    }
                }
            },
        );
        ui.add_space(10.0);
        widgets::pagination(
            ui,
            "finance.pages.pagination",
            &mut self.page,
            if finance_static_subpage(&path) {
                0
            } else {
                filtered.len()
            },
            &mut self.page_size,
        );
        if self.loaded && shown.is_empty() && !finance_static_subpage(&path) {
            ui.label("Chưa có dữ liệu phù hợp với bộ lọc hiện tại.");
        }
    }

    fn render_budget_charts(&self, ui: &mut Ui, rows: &[serde_json::Value]) {
        let chart = |ui: &mut Ui, allocation: bool| {
            egui::Frame::none()
                .fill(Color32::WHITE)
                .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                .rounding(8.0)
                .inner_margin(16.0)
                .show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    ui.label(
                        RichText::new(if allocation {
                            "Tỷ Trọng Phân Bổ Ngân Sách Toàn Doanh Nghiệp"
                        } else {
                            "Tiến Độ Giải Ngân Ngân Sách Theo Phòng Ban"
                        })
                        .size(15.0)
                        .strong(),
                    );
                    ui.add_space(16.0);
                    if !self.loaded {
                        ui.label("Chưa tải được dữ liệu ngân sách.");
                    } else if rows.is_empty() {
                        ui.label("Chưa có ngân sách để phân tích.");
                    }
                    let total = finance_sum(rows, "allocatedBudget");
                    for record in rows {
                        ui.label(finance_text(record, "department"));
                        let rate = if allocation {
                            finance_number(record, "allocatedBudget")
                                .zip(total)
                                .filter(|(_, total)| *total > 0)
                                .map(|(n, t)| n as f64 / t as f64 * 100.0)
                        } else {
                            finance_rate(record)
                        };
                        ui.label(if allocation {
                            finance_cell(record, "allocatedBudget")
                        } else {
                            format!(
                                "{} / {}",
                                finance_cell(record, "actualSpent"),
                                finance_cell(record, "allocatedBudget")
                            )
                        });
                        if let Some(rate) = rate {
                            ui.label(format!("{rate:.1}%"));
                            ui.add(
                                egui::ProgressBar::new((rate / 100.0).clamp(0.0, 1.0) as f32)
                                    .desired_width(ui.available_width())
                                    .fill(if rate > 85.0 && !allocation {
                                        Color32::from_rgb(220, 38, 38)
                                    } else {
                                        crate::theme::PRIMARY
                                    }),
                            );
                        } else {
                            ui.label("Tỷ lệ chưa xác định.");
                        }
                        ui.add_space(16.0);
                    }
                });
        };
        if ui.available_width() >= 736.0 {
            ui.columns(2, |cols| {
                chart(&mut cols[0], false);
                chart(&mut cols[1], true);
            });
        } else {
            chart(ui, false);
            ui.add_space(16.0);
            chart(ui, true);
        }
    }
}

fn finance_number(record: &serde_json::Value, field: &str) -> Option<i64> {
    record.get(field).and_then(serde_json::Value::as_i64)
}
fn finance_sum(records: &[serde_json::Value], field: &str) -> Option<i64> {
    records
        .iter()
        .try_fold(0_i64, |sum, r| sum.checked_add(finance_number(r, field)?))
}
fn finance_text(record: &serde_json::Value, field: &str) -> String {
    match record.get(field) {
        Some(serde_json::Value::String(s)) if !s.trim().is_empty() => s.clone(),
        Some(serde_json::Value::Number(n)) => n.to_string(),
        _ => "—".into(),
    }
}
fn signed_finance_money(n: i64) -> String {
    format!("{}{}", if n < 0 { "−" } else { "" }, format_money(n))
}
fn finance_cell(r: &serde_json::Value, field: &str) -> String {
    if field == "allowance+bonus" || field == "insuranceDeduction+taxDeduction" {
        let (a, b) = field.split_once('+').unwrap();
        return finance_number(r, a)
            .zip(finance_number(r, b))
            .and_then(|(a, b)| a.checked_add(b))
            .map(|n| format!("{} ₫", signed_finance_money(n)))
            .unwrap_or_else(|| "—".into());
    }
    if field == "remainingBudget" {
        return finance_number(r, "allocatedBudget")
            .zip(finance_number(r, "actualSpent"))
            .and_then(|(a, s)| a.checked_sub(s))
            .map(|n| format!("{} ₫", signed_finance_money(n)))
            .unwrap_or_else(|| "—".into());
    }
    if [
        "allocatedBudget",
        "actualSpent",
        "budget",
        "spent",
        "remain",
        "baseSalary",
        "allowance",
        "bonus",
        "insuranceDeduction",
        "taxDeduction",
        "netSalary",
        "employerInsurance",
        "bhxh",
        "bhyt",
        "bhtn",
        "taxableIncome",
        "personalDeduction",
        "amount",
        "principalAmount",
        "monthlyInterest",
        "monthlyPrincipal",
        "expectedInflow",
        "expectedOutflow",
        "netWeeklyChange",
        "projectedBalance",
        "totalAmount",
        "paidAmount",
        "remainingAmount",
        "totalCost",
        "revenue",
        "directLabor",
        "infrastructureCost",
        "softwareLicense",
        "rawCost",
        "laborCost",
        "overheadCost",
        "originalValue",
        "bookValue",
        "monthlyDepreciation",
        "accumulatedDepreciation",
        "monthlyAmount",
        "allocatedAmount",
        "capitalValue",
        "paidDividends",
        "pendingDividend",
        "advancedAmount",
        "spentAmount",
        "balance",
        "amountPayable",
        "amountPaid",
        "finalAmount",
        "vatAmount",
    ]
    .contains(&field)
    {
        finance_number(r, field)
            .map(|n| format!("{} ₫", signed_finance_money(n)))
            .unwrap_or_else(|| "—".into())
    } else {
        finance_text(r, field)
    }
}
fn finance_rate(r: &serde_json::Value) -> Option<f64> {
    finance_number(r, "allocatedBudget")
        .zip(finance_number(r, "actualSpent"))
        .filter(|(allocated, spent)| *allocated > 0 && *spent >= 0)
        .map(|(a, s)| s as f64 / a as f64 * 100.0)
}

fn finance_scope(path: &str) -> Option<&'static str> {
    let p = path.strip_prefix("/admin/finance/")?;
    let root = p.split('/').next()?;
    match root {
        "budget" => Some("finance_budgets"),
        "payroll" => Some("payroll"),
        "cash" if p.starts_with("cash/loans") => Some("finance_loans"),
        "cash" if p == "cash/forecast" => Some("finance_forecasts"),
        "payments" => Some("finance_payments"),
        "tax" => Some("finance_tax"),
        "costing" => Some("finance_costing"),
        "e-invoice" => Some("finance_einvoices"),
        "general" => Some("finance_general_ledger"),
        "fixed-assets" => Some("finance_fixed_assets"),
        "prepaid-expenses" => Some("finance_prepaid"),
        "equity" => Some("finance_equity"),
        "advances" => Some("finance_advances"),
        "inventory" if p == "inventory/audit" => Some("inventory_audits"),
        "inventory" => Some("finance_inventory"),
        _ => None,
    }
}

fn finance_title(path: &str) -> &'static str {
    fn find(nodes: &[crate::models::NavNode], path: &str) -> Option<&'static str> {
        nodes.iter().find_map(|n| {
            if n.item.path == path {
                Some(n.item.title)
            } else {
                find(n.children, path)
            }
        })
    }
    find(crate::models::ADMIN_NAV_TREE, path).unwrap_or("Hồ sơ tài chính")
}
fn finance_export_label(path: &str) -> &'static str {
    if path.ends_with("/payroll/attendance") {
        "Xuất Bảng Công (Excel)"
    } else if path.ends_with("/payroll/insurance") {
        "Xuất Mẫu D02-LT (BHXH)"
    } else if path.ends_with("/payroll/tax") {
        "Xuất Bảng Thuế (Excel)"
    } else if path.starts_with("/admin/finance/payroll") {
        "Xuất Bảng Lương (Excel)"
    } else {
        "Xuất Báo Cáo"
    }
}
fn finance_static_subpage(path: &str) -> bool {
    matches!(
        path,
        "/admin/finance/budget/plans"
            | "/admin/finance/payroll/accounting"
            | "/admin/finance/tax/types"
            | "/admin/finance/tax/periods"
            | "/admin/finance/tax/orders"
            | "/admin/finance/tax/risky"
            | "/admin/finance/e-invoice/templates"
            | "/admin/finance/e-invoice/reports"
            | "/admin/finance/general/statements"
            | "/admin/finance/general/profit-loss"
            | "/admin/finance/costing/orders"
            | "/admin/finance/costing/construction"
            | "/admin/finance/inventory/import"
            | "/admin/finance/inventory/export"
            | "/admin/finance/inventory/transfer"
            | "/admin/finance/inventory/production"
            | "/admin/finance/inventory/assembly"
    )
}
fn finance_missing_reason(path: &str) -> &'static str {
    if path.ends_with("/budget/plans") {
        "Chưa có API hạng mục dự toán chi tiết. Không dùng số liệu mẫu của legacy."
    } else if path.ends_with("/payroll/accounting") {
        "Chưa có API bút toán và ghi sổ chi phí lương. Không tự tạo bút toán hoặc tỷ lệ trích nộp."
    } else if path.starts_with("/admin/finance/tax/") {
        "Chưa có API danh mục thuế, kỳ kê khai, lệnh nộp hoặc dữ liệu cảnh báo cơ quan thuế. Chưa xác minh thuế suất và nghĩa vụ áp dụng."
    } else if path.starts_with("/admin/finance/e-invoice/") {
        "Chưa có API nhà cung cấp hóa đơn, mẫu, phát hành hoặc báo cáo tình hình sử dụng hóa đơn."
    } else if path.starts_with("/admin/finance/costing/") {
        "Chưa có API chi phí theo đơn hàng hoặc công trình."
    } else if path.starts_with("/admin/finance/inventory/") {
        "Chưa có API chứng từ nhập/xuất/điều chuyển hoặc lệnh sản xuất, lắp ráp."
    } else if path.starts_with("/admin/finance/general/") {
        "Chưa có API sổ cái và báo cáo tài chính được đối soát."
    } else {
        "Chưa có API Rust tương ứng trong UI cho chứng từ mua/bán, hóa đơn hoặc công nợ. Chưa xác định số liệu; thao tác nghiệp vụ bị vô hiệu hóa."
    }
}
fn finance_route_matches(path: &str, r: &serde_json::Value) -> bool {
    match path {
        "/admin/finance/e-invoice/drafts" => finance_text(r, "status") == "Hóa đơn nháp",
        "/admin/finance/payments/approve" => finance_text(r, "status") == "Chờ duyệt",
        "/admin/finance/payments/history" => matches!(
            finance_text(r, "status").as_str(),
            "Đã thanh toán" | "Từ chối"
        ),
        _ => true,
    }
}
fn finance_metric_fields(path: &str) -> &'static [(&'static str, &'static str)] {
    if path.contains("/cash/loans") {
        &[
            ("Tổng dư nợ gốc", "principalAmount"),
            ("Lãi phải trả hàng tháng", "monthlyInterest"),
            ("Gốc trả hàng tháng", "monthlyPrincipal"),
        ]
    } else if path.ends_with("/cash/forecast") {
        &[
            ("Tổng dự thu", "expectedInflow"),
            ("Tổng dự chi", "expectedOutflow"),
        ]
    } else if path.contains("/tax") {
        &[
            ("Tổng số thuế phải nộp", "amountPayable"),
            ("Đã nộp vào Ngân sách Nhà nước", "amountPaid"),
        ]
    } else if path.contains("/costing") {
        &[
            ("Tổng giá thành", "totalCost"),
            ("Doanh thu hợp đồng", "revenue"),
        ]
    } else if path.contains("/fixed-assets") {
        &[
            ("Tổng nguyên giá tài sản", "originalValue"),
            ("Khấu hao lũy kế", "accumulatedDepreciation"),
            ("Giá trị còn lại", "bookValue"),
        ]
    } else if path.contains("/prepaid-expenses") {
        &[
            ("Tổng chi phí trả trước", "totalAmount"),
            ("Đã phân bổ", "allocatedAmount"),
            ("Giá trị còn lại", "remainingAmount"),
        ]
    } else if path.contains("/equity") {
        &[
            ("Tổng vốn góp", "capitalValue"),
            ("Cổ tức đã chi trả", "paidDividends"),
            ("Cổ tức dự kiến", "pendingDividend"),
        ]
    } else if path.contains("/advances") {
        &[
            ("Tổng số tiền tạm ứng", "advancedAmount"),
            ("Tổng đã quyết toán", "spentAmount"),
        ]
    } else if path.contains("/e-invoice") {
        &[
            ("Tổng thanh toán", "finalAmount"),
            ("Tổng thuế GTGT", "vatAmount"),
        ]
    } else {
        &[("Tổng giá trị theo hồ sơ", "amount")]
    }
}
fn finance_columns(path: &str) -> &'static [(&'static str, &'static str)] {
    let suffix = path.strip_prefix("/admin/finance/").unwrap_or("");
    match suffix {
        "budget/plans" => &[
            ("Hạng mục chi phí dự toán", "category"),
            ("Đơn vị thực hiện", "dept"),
            ("Ngân sách duyệt", "budget"),
            ("Đã giải ngân", "spent"),
            ("Hạn mức còn lại", "remain"),
            ("Cấp duyệt", "approver"),
            ("Trạng thái", "status"),
        ],
        "budget" | "budget/charts" => &[
            ("Mã ngân sách", "code"),
            ("Phòng ban / Đơn vị thụ hưởng", "department"),
            ("Ngân sách được duyệt", "allocatedBudget"),
            ("Thực chi đã dùng", "actualSpent"),
            ("Còn lại", "remainingBudget"),
            ("Tỷ lệ giải ngân", "utilizationRate"),
            ("Trạng thái", "status"),
        ],
        "payroll/attendance" => &[
            ("Mã NV", "employeeCode"),
            ("Họ và tên", "employeeName"),
            ("Công chuẩn tháng", "standardWorkDays"),
            ("Công làm thực tế", "workDays"),
            ("Nghỉ phép hưởng lương", "paidLeaveDays"),
            ("Giờ làm ngoài giờ (OT)", "overtimeHours"),
            ("Trạng thái chốt công", "attendanceStatus"),
        ],
        "payroll/insurance" => &[
            ("Mã NV", "employeeCode"),
            ("Họ và tên", "employeeName"),
            ("Lương đóng BH", "insuranceSalary"),
            ("BHXH NLĐ", "bhxh"),
            ("BHYT NLĐ", "bhyt"),
            ("BHTN NLĐ", "bhtn"),
            ("Tổng trừ lương NLĐ", "insuranceDeduction"),
            ("DN đóng", "employerInsurance"),
        ],
        "payroll/tax" => &[
            ("Nhân viên", "employeeName"),
            ("Mã NV", "employeeCode"),
            ("Tổng thu nhập chịu thuế", "taxableIncome"),
            ("Giảm trừ bản thân", "personalDeduction"),
            ("Giảm trừ bảo hiểm", "insuranceDeduction"),
            ("Thuế TNCN khấu trừ", "taxDeduction"),
            ("Trạng thái", "taxStatus"),
        ],
        "payroll/disburse" => &[
            ("Mã NV", "employeeCode"),
            ("Tên người thụ hưởng", "employeeName"),
            ("Ngân hàng", "bankName"),
            ("Số tài khoản", "bankAccount"),
            ("Số tiền chi trả (Net)", "netSalary"),
            ("Nội dung chuyển khoản", "transferNote"),
            ("Trạng thái", "status"),
        ],
        "payroll/accounting" => &[
            ("Diễn giải bút toán", "description"),
            ("Tài khoản nợ", "debitAccount"),
            ("Tài khoản có", "creditAccount"),
            ("Số tiền", "amount"),
            ("Trạng thái", "status"),
        ],
        "payroll" | "payroll/calculate" => &[
            ("Mã NV", "employeeCode"),
            ("Họ và tên nhân viên", "employeeName"),
            ("Lương cơ bản", "baseSalary"),
            ("Ngày công", "workDays"),
            ("Phụ cấp & Thưởng", "allowance+bonus"),
            ("Khấu trừ (BH+Thuế)", "insuranceDeduction+taxDeduction"),
            ("Thực lĩnh (Net)", "netSalary"),
            ("Trạng thái", "status"),
        ],
        "cash/forecast" => &[
            ("Kỳ dự báo dòng tiền", "period"),
            ("Dự thu dự kiến (+)", "expectedInflow"),
            ("Dự chi dự kiến (-)", "expectedOutflow"),
            ("Biến động thuần / Tuần", "netWeeklyChange"),
            ("Số dư dự kiến cuối kỳ", "projectedBalance"),
            ("Độ an toàn thanh khoản", "safetyStatus"),
        ],
        "tax/types" => &[
            ("Sắc thuế", "name"),
            ("Tiểu mục", "code"),
            ("Thuế suất", "rate"),
            ("Phương thức", "method"),
            ("Trạng thái", "status"),
        ],
        "tax/periods" => &[
            ("Kỳ kê khai", "period"),
            ("Sắc thuế áp dụng", "type"),
            ("Ngày bắt đầu", "start"),
            ("Ngày kết thúc", "end"),
            ("Hạn chót nộp CQT", "deadline"),
            ("Trạng thái", "status"),
        ],
        "tax/orders" => &[
            ("Mã số chứng từ", "code"),
            ("Chương", "chapter"),
            ("Tiểu mục", "itemCode"),
            ("Cơ quan thu & KBNN", "kbn"),
            ("Số tiền nộp", "amount"),
            ("Ngày nộp", "date"),
            ("Trạng thái", "status"),
        ],
        "tax/risky" => &[
            ("Mã số thuế", "taxCode"),
            ("Tên doanh nghiệp vi phạm", "name"),
            ("Lý do cảnh báo của CQT", "reason"),
            ("Ngày CQT công bố", "date"),
            ("Mức độ", "risk"),
            ("Hành động hệ thống", "action"),
        ],
        _ if suffix.starts_with("tax") => &[
            ("Mã tờ khai", "code"),
            ("Sắc thuế kê khai", "taxType"),
            ("Kỳ tính thuế", "period"),
            ("Cơ quan thuế quản lý", "taxAuthority"),
            ("Số tiền thuế (VNĐ)", "amountPayable"),
            ("Hạn nộp", "deadline"),
            ("Trạng thái", "status"),
        ],
        _ if suffix.starts_with("cash/loans") => &[
            ("Mã khế ước", "code"),
            ("Tổ chức tín dụng", "lender"),
            ("Dư nợ gốc (VNĐ)", "principalAmount"),
            ("Lãi suất (%/năm)", "interestRate"),
            ("Ngày vay", "startDate"),
            ("Đáo hạn", "endDate"),
            ("Trạng thái", "status"),
        ],
        _ if suffix.starts_with("payments") => &[
            ("Mã phiếu", "code"),
            ("Đơn vị thụ hưởng", "beneficiary"),
            ("Nội dung chi thanh toán", "category"),
            ("Số tiền thanh toán", "amount"),
            ("Hình thức chi", "paymentMethod"),
            ("Người lập đề nghị", "creator"),
            ("Trạng thái", "status"),
        ],
        _ if suffix.starts_with("e-invoice") => &[
            ("Số hóa đơn", "invoiceNumber"),
            ("Mẫu số", "templateCode"),
            ("Ký hiệu", "symbol"),
            ("Người mua", "buyerName"),
            ("MST người mua", "buyerTaxCode"),
            ("Tổng thanh toán", "finalAmount"),
            ("Ngày lập", "issueDate"),
            ("Trạng thái", "status"),
        ],
        _ if suffix.starts_with("general") => &[
            ("Mã chứng từ", "voucherCode"),
            ("Ngày hạch toán", "entryDate"),
            ("Diễn giải", "description"),
            ("Tài khoản Nợ", "debitAccount"),
            ("Tài khoản Có", "creditAccount"),
            ("Số tiền", "amount"),
            ("Người lập", "author"),
            ("Trạng thái", "status"),
        ],
        _ if suffix.starts_with("costing") => &[
            ("Mã dự án", "code"),
            ("Tên dự án / Sản phẩm", "projectName"),
            ("Phân loại", "category"),
            ("Giá thành (VNĐ)", "totalCost"),
            ("Doanh thu hợp đồng", "revenue"),
            ("Biên lãi gộp (%)", "profitMargin"),
        ],
        _ if suffix.starts_with("fixed-assets") => &[
            ("Mã tài sản", "code"),
            ("Tên tài sản", "name"),
            ("Bộ phận", "department"),
            ("Nguyên giá", "originalValue"),
            ("Khấu hao hàng tháng", "monthlyDepreciation"),
            ("Khấu hao lũy kế", "accumulatedDepreciation"),
            ("Giá trị còn lại", "bookValue"),
            ("Trạng thái", "status"),
        ],
        _ if suffix.starts_with("prepaid-expenses") => &[
            ("Mã CPTT", "code"),
            ("Tài khoản", "accountCode"),
            ("Tên khoản chi phí", "name"),
            ("Bộ phận", "department"),
            ("Tổng chi phí ban đầu", "totalAmount"),
            ("Phân bổ hàng tháng", "monthlyAmount"),
            ("Đã phân bổ", "allocatedAmount"),
            ("Giá trị còn lại", "remainingAmount"),
            ("Trạng thái", "status"),
        ],
        _ if suffix.starts_with("equity") => &[
            ("Mã cổ đông", "shareholderCode"),
            ("Cổ đông", "fullName"),
            ("Phân loại", "type"),
            ("Số cổ phần", "sharesCount"),
            ("Tỷ lệ sở hữu (%)", "ownershipPercentage"),
            ("Giá trị vốn góp", "capitalValue"),
            ("Cổ tức đã nhận", "paidDividends"),
        ],
        _ if suffix.starts_with("advances") => &[
            ("Mã phiếu", "code"),
            ("Nhân viên", "employeeName"),
            ("Phòng ban", "department"),
            ("Mục đích tạm ứng", "purpose"),
            ("Số tiền tạm ứng", "advancedAmount"),
            ("Đã quyết toán / Hoàn quỹ", "spentAmount"),
            ("Hạn hoàn ứng", "settleDeadline"),
            ("Trạng thái", "status"),
        ],
        _ if suffix.starts_with("debts") => &[
            ("Đối tác", "partnerName"),
            ("Phân loại", "type"),
            ("Tổng phát sinh", "totalAmount"),
            ("Đã thanh toán", "paidAmount"),
            ("Còn nợ", "remainingAmount"),
            ("Hạn thanh toán", "dueDate"),
            ("Trạng thái", "status"),
        ],
        _ if suffix.starts_with("purchasing")
            || suffix.starts_with("sales")
            || suffix == "invoices" =>
        {
            &[
                ("Mã chứng từ", "code"),
                ("Đối tác và nội dung", "partnerName"),
                ("Phân loại", "subtype"),
                ("Ngày", "documentDate"),
                ("Tổng tiền", "amount"),
                ("Đã thanh toán", "paidAmount"),
                ("Còn lại", "remainingAmount"),
                ("Trạng thái", "status"),
            ]
        }
        _ if suffix.starts_with("inventory") => &[
            ("Mã vật tư", "code"),
            ("Tên vật tư", "name"),
            ("Kho", "warehouse"),
            ("Đơn vị tính", "unit"),
            ("Số lượng tồn", "quantity"),
            ("Giá trị tồn", "totalValue"),
            ("Trạng thái", "status"),
        ],
        _ => &[
            ("Nội dung", "category"),
            ("Thu", "receipts"),
            ("Chi", "disbursements"),
            ("Dòng tiền thuần", "net"),
        ],
    }
}

fn render_cash_form(ui: &mut Ui, form: &mut CashForm) {
    use crate::widgets::{self, form_input};
    fn field(ui: &mut Ui, form: &mut CashForm, index: usize) {
        use crate::widgets::{self, form_input};
        match index {
            0 => {
                widgets::form_field(ui, "cash.type", "Loại chứng từ", true, |ui| {
                    widgets::combo_box("cash.type.select")
                        .width(ui.available_width())
                        .selected_text(if form.transaction_type == "Thu" {
                            "Phiếu Thu Tiền (+)"
                        } else {
                            "Phiếu Chi Tiền (-)"
                        })
                        .show_ui(ui, |ui| {
                            ui.selectable_value(
                                &mut form.transaction_type,
                                "Thu".into(),
                                "Phiếu Thu Tiền (+)",
                            );
                            ui.selectable_value(
                                &mut form.transaction_type,
                                "Chi".into(),
                                "Phiếu Chi Tiền (-)",
                            );
                        });
                });
            }
            1 => {
                widgets::form_field(
                    ui,
                    "cash.code",
                    "Số chứng từ (Mã phiếu)",
                    false,
                    |ui| {
                        ui.add_enabled(
                            false,
                            egui::TextEdit::singleline(&mut "Máy chủ tự cấp".to_owned()),
                        );
                    },
                );
            }
            2 => form_input(
                ui,
                "cash.amount",
                "Số tiền thanh toán (VNĐ)",
                true,
                &mut form.amount,
                "",
                false,
            ),
            3 => widgets::form_date(ui, "cash.date", "Ngày hạch toán", true, &mut form.date),
            4 => form_input(
                ui,
                "cash.partner",
                "Đối tác / Người nộp hoặc nhận",
                true,
                &mut form.recipient_or_payer,
                "Tên khách hàng, đối tác hoặc nhân sự",
                false,
            ),
            _ => form_input(
                ui,
                "cash.account",
                "Tài khoản nguồn / Quỹ tiền",
                true,
                &mut form.account,
                "Nhập tài khoản ngân hàng hoặc tên quỹ",
                false,
            ),
        }
    }
    fn pair(ui: &mut Ui, form: &mut CashForm, a: usize, b: usize) {
        if ui.available_width() >= 400.0 {
            ui.columns(2, |cols| {
                field(&mut cols[0], form, a);
                field(&mut cols[1], form, b);
            });
        } else {
            field(ui, form, a);
            field(ui, form, b);
        }
    }
    pair(ui, form, 0, 1);
    widgets::form_field(ui, "cash.source", "Nguồn tiền", true, |ui| {
        widgets::combo_box("cash.source.select")
            .width(ui.available_width())
            .selected_text(source_label(&form.source))
            .show_ui(ui, |ui| {
                ui.selectable_value(&mut form.source, "bank".into(), "Tiền gửi ngân hàng");
                ui.selectable_value(&mut form.source, "petty".into(), "Quỹ tiền mặt");
            });
    });
    form_input(
        ui,
        "cash.category",
        "Nội dung thu / chi chi tiết",
        true,
        &mut form.category,
        "Nhập nội dung chứng từ",
        false,
    );
    pair(ui, form, 2, 3);
    pair(ui, form, 4, 5);
    widgets::form_select(
        ui,
        "cash.status",
        "Trạng thái phê duyệt",
        true,
        &mut form.status,
        &["Đã hoàn thành", "Chờ duyệt", "Đã hủy"],
    );
    widgets::form_textarea(
        ui,
        "cash.note",
        "Ghi chú & Số hóa đơn kèm theo",
        false,
        &mut form.note,
        "Hóa đơn GTGT hoặc số hợp đồng liên quan",
        2,
    );
    ui.collapsing("Thông tin bổ sung", |ui| {
        form_input(
            ui,
            "cash.department",
            "Phòng ban",
            false,
            &mut form.department,
            "Không bắt buộc",
            false,
        );
        form_input(
            ui,
            "cash.employee",
            "Mã nhân viên",
            false,
            &mut form.employee_code,
            "Không bắt buộc",
            false,
        );
    });
}

fn detail_row(ui: &mut Ui, label: &str, value: &str) {
    ui.horizontal_wrapped(|ui| {
        ui.label(RichText::new(format!("{label}: ")).strong());
        ui.label(value);
    });
}

fn optional_string(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_owned())
}

fn format_money(amount: i64) -> String {
    crate::views::employees::format_vnd(amount.unsigned_abs())
}

fn format_signed_money(amount: i64) -> String {
    let sign = if amount < 0 { "−" } else { "+" };
    format!("{sign}{} ₫", format_money(amount))
}

fn source_label(source: &str) -> &'static str {
    match source {
        "petty" => "Quỹ tiền mặt",
        _ => "Ngân hàng",
    }
}

fn nonempty(value: &str) -> &str {
    if value.trim().is_empty() {
        "—"
    } else {
        value
    }
}

#[cfg(test)]
mod tests {
    use super::{CashFilter, CashForm, FinanceView, is_supported_route, petty_status};
    use crate::api::FinanceCashTransaction;

    fn transaction() -> FinanceCashTransaction {
        FinanceCashTransaction {
            key: "cash-1".to_owned(),
            code: "PT-20261008-ABC12345".to_owned(),
            transaction_type: "Thu".to_owned(),
            source: "bank".to_owned(),
            category: "Thanh toán dịch vụ".to_owned(),
            amount: 250_000,
            date: "2026-10-08".to_owned(),
            recipient_or_payer: "Công ty Mẫu".to_owned(),
            account: "Tài khoản chính".to_owned(),
            status: "Đã hoàn thành".to_owned(),
            note: String::new(),
            department: String::new(),
            employee_code: String::new(),
            created_at: "2026-10-08T00:00:00Z".to_owned(),
            updated_at: "2026-10-08T00:00:00Z".to_owned(),
        }
    }

    fn cash_overlay_frame(
        view: &mut FinanceView,
        ctx: &egui::Context,
        width: f32,
        events: Vec<egui::Event>,
    ) -> Option<String> {
        let mut confirmed = None;
        let _ = ctx.run(
            egui::RawInput {
                screen_rect: Some(egui::Rect::from_min_size(
                    egui::Pos2::ZERO,
                    egui::vec2(width, 900.0),
                )),
                events,
                ..Default::default()
            },
            |ctx| {
                egui::CentralPanel::default().show(ctx, |ui| {
                    ui.label("Sổ thu chi");
                });
                view.render_cash_detail(ctx);
                confirmed = view.render_cancel_confirmation(ctx);
            },
        );
        confirmed
    }

    fn cash_click(
        view: &mut FinanceView,
        ctx: &egui::Context,
        width: f32,
        target: &str,
    ) -> Option<String> {
        let rect = ctx
            .data(|data| data.get_temp::<egui::Rect>(egui::Id::new(target)))
            .unwrap();
        let pos = rect.center();
        let mut confirmed = None;
        for events in [
            vec![egui::Event::PointerMoved(pos)],
            vec![egui::Event::PointerButton {
                pos,
                button: egui::PointerButton::Primary,
                pressed: true,
                modifiers: egui::Modifiers::NONE,
            }],
            vec![egui::Event::PointerButton {
                pos,
                button: egui::PointerButton::Primary,
                pressed: false,
                modifiers: egui::Modifiers::NONE,
            }],
        ] {
            confirmed = cash_overlay_frame(view, ctx, width, events).or(confirmed);
        }
        confirmed
    }

    #[test]
    fn detail_cancel_requires_an_explicit_confirmation_click_at_every_width() {
        for width in [320.0, 390.0, 768.0, 1440.0] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            crate::native_text::setup_style(&ctx);
            let mut view = FinanceView::default();
            view.transactions.push(transaction());
            view.detail_key = Some("cash-1".into());
            for _ in 0..3 {
                assert!(cash_overlay_frame(&mut view, &ctx, width, vec![]).is_none());
            }
            assert!(cash_click(&mut view, &ctx, width, "test.cash.detail.cancel").is_none());
            assert_eq!(view.cancel_key.as_deref(), Some("cash-1"));
            assert!(view.mutation.is_none());
            for _ in 0..3 {
                assert!(cash_overlay_frame(&mut view, &ctx, width, vec![]).is_none());
            }
            assert!(cash_click(&mut view, &ctx, width, "test.cash.cancel.dismiss").is_none());
            assert!(view.cancel_key.is_none());
            assert_eq!(view.transactions[0].status, "Đã hoàn thành");
            for _ in 0..3 {
                cash_overlay_frame(&mut view, &ctx, width, vec![]);
            }
            assert!(cash_click(&mut view, &ctx, width, "test.cash.detail.cancel").is_none());
            for _ in 0..3 {
                cash_overlay_frame(&mut view, &ctx, width, vec![]);
            }
            assert_eq!(
                cash_click(&mut view, &ctx, width, "test.cash.cancel.confirm").as_deref(),
                Some("cash-1")
            );
            assert!(
                view.mutation.is_none(),
                "overlay reports intent; only owning request path may submit"
            );
            assert_eq!(
                view.transactions[0].status, "Đã hoàn thành",
                "only server acknowledgement may change a voucher"
            );
        }
    }

    #[test]
    fn cancelled_or_missing_vouchers_cannot_request_another_cancellation() {
        let ctx = egui::Context::default();
        let mut view = FinanceView::default();
        let mut cancelled = transaction();
        cancelled.status = "Đã hủy".into();
        view.transactions.push(cancelled);
        for key in ["cash-1", "missing"] {
            view.cancel_key = Some(key.into());
            assert!(cash_overlay_frame(&mut view, &ctx, 390.0, vec![]).is_none());
            assert!(view.cancel_key.is_none());
        }
    }

    #[test]
    fn petty_status_preserves_cancelled_and_pending_documents() {
        let mut item = transaction();
        item.transaction_type = "Chi".into();
        item.status = "Chờ duyệt".into();
        assert_eq!(petty_status(&item), "Tạm ứng chờ quyết toán");
        item.status = "Đã hoàn thành".into();
        assert_eq!(petty_status(&item), "Đã chi tiền mặt");
        item.transaction_type = "Thu".into();
        assert_eq!(petty_status(&item), "Đã hoàn ứng vào quỹ");
        item.status = "Đã hủy".into();
        assert_eq!(petty_status(&item), "Đã hủy");
    }

    #[test]
    fn only_cash_voucher_routes_are_claimed_as_migrated() {
        assert!(is_supported_route("/admin/finance/cash/transactions"));
        assert!(is_supported_route("/admin/finance/cash/income"));
        assert!(is_supported_route("/admin/finance/cash/expense"));
        assert!(is_supported_route("/admin/finance/cash/petty"));
        assert!(!is_supported_route("/admin/finance/cash/bank"));
        assert_eq!(
            CashFilter::for_route("/admin/finance/cash/income"),
            CashFilter::Income
        );
        assert_eq!(
            CashFilter::for_route("/admin/finance/cash/expense"),
            CashFilter::Expense
        );
    }

    #[test]
    fn filters_match_transaction_type_and_pending_status() {
        let income = transaction();
        assert!(CashFilter::All.matches(&income));
        assert!(CashFilter::Income.matches(&income));
        assert!(!CashFilter::Expense.matches(&income));
        assert!(!CashFilter::Pending.matches(&income));
        let mut pending = income;
        pending.status = "Chờ duyệt".to_owned();
        assert!(CashFilter::Pending.matches(&pending));
    }

    #[test]
    fn create_form_validates_and_leaves_voucher_code_to_server() {
        let mut form = CashForm::new("Thu");
        form.category = "  Tiền dịch vụ  ".to_owned();
        form.amount = "1.250.000".to_owned();
        form.recipient_or_payer = "  Công ty A  ".to_owned();
        form.account = "  Tài khoản chính  ".to_owned();
        let payload = form.payload().unwrap();
        assert_eq!(payload.amount, 1_250_000);
        assert_eq!(payload.category, "Tiền dịch vụ");
        assert_eq!(payload.recipient_or_payer, "Công ty A");
        assert!(payload.code.is_none());
        assert_eq!(payload.status, "Đã hoàn thành");
    }

    #[test]
    fn empty_or_invalid_amount_is_rejected() {
        let form = CashForm::new("Thu");
        assert!(form.payload().unwrap_err().contains("Số tiền"));
        let mut form = CashForm::new("Thu");
        form.amount = "0".to_owned();
        assert!(form.payload().unwrap_err().contains("khoảng 1"));
    }

    #[test]
    fn switching_account_discards_cached_financial_data() {
        let mut view = FinanceView::default();
        view.transactions.push(transaction());
        view.loaded_for = Some("old-user".to_owned());
        view.switch_account("new-user");
        assert!(view.transactions.is_empty());
        assert_eq!(view.loaded_for.as_deref(), Some("new-user"));
        assert!(view.needs_reload);
    }
}
