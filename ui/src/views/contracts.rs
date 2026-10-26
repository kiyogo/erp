use std::time::Duration;

use egui::{Color32, Context, RichText, Ui, Vec2};
use serde_json::{Value, json};
use web_time::Instant;

use crate::{
    api::{ApiClient, ApiTask, ContractResponse, ContractSummary, ContractsResponse},
    models::Session,
    views::employees::format_vnd,
};

const PAGE_SIZE: usize = 8;

#[derive(Default)]
pub struct ContractsView {
    contracts: Vec<ContractSummary>,
    list_task: Option<ApiTask<ContractsResponse>>,
    detail_task: Option<ApiTask<ContractResponse>>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    detail: Option<ContractSummary>,
    search: String,
    status_filter: String,
    category_filter: String,
    page: usize,
    page_size: usize,
    labor_only: bool,
    error: String,
    notice: String,
    detail_error: String,
    detail_open: bool,
    form: Option<ContractForm>,
    form_open: bool,
    form_error: String,
    create_task: Option<ApiTask<ContractResponse>>,
    update_task: Option<ApiTask<ContractResponse>>,
    archive_task: Option<ApiTask<Value>>,
    archive_confirm: Option<(String, String)>,
}

#[derive(Debug, Clone, Default)]
struct ContractForm {
    id: Option<String>,
    code: String,
    name: String,
    contract_category: String,
    contract_template: String,
    party_b_type: String,
    party_b_name: String,
    party_b_tax_code: String,
    party_b_representative: String,
    party_b_position: String,
    party_b_id_number: String,
    party_b_phone: String,
    party_b_email: String,
    party_b_bank: String,
    party_b_address: String,
    employee_code: String,
    employee_name: String,
    employee_id_number: String,
    employee_phone: String,
    employee_email: String,
    employee_bank: String,
    contract_type: String,
    position: String,
    department: String,
    job_level: String,
    work_location: String,
    start_date: String,
    end_date: String,
    probation_months: String,
    contract_value: String,
    salary: String,
    allowance: String,
    stock_shares_percent: String,
    payment_method: String,
    payment_day: String,
    working_hours: String,
    annual_leave_days: String,
    insurance_type: String,
    nda_clause: bool,
    non_compete_clause: bool,
    status: String,
    signer_name: String,
    signer_position: String,
    note: String,
    custom_field_values: String,
}

impl ContractForm {
    fn new() -> Self {
        Self {
            contract_category: "labor".to_owned(),
            contract_template: "Hợp đồng lao động chính thức".to_owned(),
            party_b_type: "employee".to_owned(),
            contract_type: "Hợp đồng lao động chính thức".to_owned(),
            probation_months: "0".to_owned(),
            contract_value: "0".to_owned(),
            salary: "0".to_owned(),
            allowance: "0".to_owned(),
            payment_day: "5".to_owned(),
            annual_leave_days: "12".to_owned(),
            nda_clause: true,
            status: "Dự thảo".to_owned(),
            custom_field_values: "{}".to_owned(),
            ..Self::default()
        }
    }

    fn from_contract(contract: &ContractSummary) -> Self {
        let mut form = Self::new();
        form.id = Some(contract.id.clone());
        form.code = contract.code.clone();
        form.name = contract.name.clone();
        form.contract_category = contract.contract_category.clone();
        form.contract_template = contract.contract_template.clone();
        form.party_b_type = contract.party_b_type.clone();
        form.party_b_name = contract.party_b_name.clone();
        form.party_b_tax_code = contract.party_b_tax_code.clone().unwrap_or_default();
        form.party_b_representative = contract.party_b_representative.clone().unwrap_or_default();
        form.party_b_position = contract.party_b_position.clone().unwrap_or_default();
        form.party_b_id_number = contract.party_b_id_number.clone().unwrap_or_default();
        form.party_b_phone = contract.party_b_phone.clone().unwrap_or_default();
        form.party_b_email = contract.party_b_email.clone().unwrap_or_default();
        form.party_b_bank = contract.party_b_bank.clone().unwrap_or_default();
        form.party_b_address = contract.party_b_address.clone().unwrap_or_default();
        form.employee_code = contract.employee_code.clone();
        form.employee_name = contract.employee_name.clone();
        form.employee_id_number = contract.employee_id_number.clone().unwrap_or_default();
        form.employee_phone = contract.employee_phone.clone().unwrap_or_default();
        form.employee_email = contract.employee_email.clone().unwrap_or_default();
        form.employee_bank = contract.employee_bank.clone().unwrap_or_default();
        form.contract_type = contract.contract_type.clone();
        form.position = contract.position.clone();
        form.department = contract.department.clone();
        form.job_level = contract.job_level.clone().unwrap_or_default();
        form.work_location = contract.work_location.clone().unwrap_or_default();
        form.start_date = contract.start_date.clone();
        form.end_date = contract.end_date.clone();
        form.probation_months = contract.probation_months.unwrap_or_default().to_string();
        form.contract_value = contract.contract_value.unwrap_or_default().to_string();
        form.salary = contract.salary.unwrap_or_default().to_string();
        form.allowance = contract.allowance.unwrap_or_default().to_string();
        form.stock_shares_percent = contract.stock_shares_percent.clone().unwrap_or_default();
        form.payment_method = contract.payment_method.clone().unwrap_or_default();
        form.payment_day = contract.payment_day.unwrap_or(5).to_string();
        form.working_hours = contract.working_hours.clone().unwrap_or_default();
        form.annual_leave_days = contract.annual_leave_days.unwrap_or(12).to_string();
        form.insurance_type = contract.insurance_type.clone().unwrap_or_default();
        form.nda_clause = contract.nda_clause.unwrap_or(true);
        form.non_compete_clause = contract.non_compete_clause.unwrap_or(false);
        form.status = contract.status.clone();
        form.signer_name = contract.signer_name.clone().unwrap_or_default();
        form.signer_position = contract.signer_position.clone().unwrap_or_default();
        form.note = contract.note.clone().unwrap_or_default();
        form.custom_field_values = contract
            .custom_field_values
            .as_ref()
            .map(Value::to_string)
            .unwrap_or_else(|| "{}".to_owned());
        form
    }

    fn to_payload(&self) -> Result<Value, String> {
        if self.name.trim().is_empty() || self.contract_template.trim().is_empty() {
            return Err("Tên hợp đồng và mẫu hợp đồng là bắt buộc.".to_owned());
        }
        let amount = |value: &str, label: &str| -> Result<i64, String> {
            value
                .trim()
                .parse::<i64>()
                .map_err(|_| format!("{label} phải là số nguyên không âm."))
                .and_then(|value| {
                    if value < 0 {
                        Err(format!("{label} phải là số nguyên không âm."))
                    } else {
                        Ok(value)
                    }
                })
        };
        let custom_fields: Value = serde_json::from_str(&self.custom_field_values)
            .map_err(|_| "Trường tùy chỉnh phải là JSON hợp lệ.".to_owned())?;
        if !custom_fields.is_object() {
            return Err("Trường tùy chỉnh phải là một đối tượng JSON.".to_owned());
        }
        let mut payload = json!({
            "code": &self.code,
            "name": self.name.trim(),
            "contractCategory": &self.contract_category,
            "contractTemplate": self.contract_template.trim(),
            "partyBType": &self.party_b_type,
            "partyBName": &self.party_b_name,
            "partyBTaxCode": &self.party_b_tax_code,
            "partyBRepresentative": &self.party_b_representative,
            "partyBPosition": &self.party_b_position,
            "partyBIdNumber": &self.party_b_id_number,
            "partyBPhone": &self.party_b_phone,
            "partyBEmail": &self.party_b_email,
            "partyBBank": &self.party_b_bank,
            "partyBAddress": &self.party_b_address,
            "employeeCode": &self.employee_code,
            "employeeName": &self.employee_name,
            "employeeIdNumber": &self.employee_id_number,
            "employeePhone": &self.employee_phone,
            "employeeEmail": &self.employee_email,
            "employeeBank": &self.employee_bank,
        });
        let extra = json!({
            "type": &self.contract_type,
            "position": &self.position,
            "department": &self.department,
            "jobLevel": &self.job_level,
            "workLocation": &self.work_location,
            "startDate": &self.start_date,
            "endDate": &self.end_date,
            "probationMonths": amount(&self.probation_months, "Thời gian thử việc")?,
            "contractValue": amount(&self.contract_value, "Giá trị hợp đồng")?,
            "salary": amount(&self.salary, "Mức lương")?,
            "allowance": amount(&self.allowance, "Phụ cấp")?,
            "stockSharesPercent": &self.stock_shares_percent,
            "paymentMethod": &self.payment_method,
            "paymentDay": amount(&self.payment_day, "Ngày thanh toán")?,
            "workingHours": &self.working_hours,
            "annualLeaveDays": amount(&self.annual_leave_days, "Ngày phép năm")?,
            "insuranceType": &self.insurance_type,
            "ndaClause": self.nda_clause,
            "nonCompeteClause": self.non_compete_clause,
            "status": &self.status,
            "signerName": &self.signer_name,
            "signerPosition": &self.signer_position,
            "note": &self.note,
            "customFieldValues": custom_fields
        });
        payload
            .as_object_mut()
            .expect("contract payload is an object")
            .extend(
                extra
                    .as_object()
                    .expect("contract payload extension is an object")
                    .clone(),
            );
        Ok(payload)
    }
}

impl ContractsView {
    fn reset_for_account(&mut self, session: &Session) {
        *self = Self {
            loaded_for: Some(session.user.id.clone()),
            ..Self::default()
        };
    }

    fn poll(&mut self, ctx: &Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.reset_for_account(session);
        }
        if self.list_task.is_none()
            && self
                .last_loaded
                .is_none_or(|loaded| loaded.elapsed() >= Duration::from_secs(30))
        {
            self.error.clear();
            self.list_task = Some(api.list_contracts_task(session));
        }
        if let Some(result) = self.list_task.as_ref().and_then(ApiClient::poll) {
            self.list_task = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.contracts = response.data;
                    self.error.clear();
                    self.page = self.page.min(self.page_count().saturating_sub(1));
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.detail_task.as_ref().and_then(ApiClient::poll) {
            self.detail_task = None;
            match result {
                Ok(response) => {
                    self.detail = Some(response.contract);
                    self.detail_error.clear();
                }
                Err(error) => self.detail_error = error,
            }
        }
        if let Some(result) = self.create_task.as_ref().and_then(ApiClient::poll) {
            self.create_task = None;
            match result {
                Ok(response) => {
                    self.form = None;
                    self.form_open = false;
                    self.form_error.clear();
                    self.notice = format!("Đã tạo hợp đồng {}.", response.contract.code);
                    self.last_loaded = None;
                }
                Err(error) => self.form_error = error,
            }
        }
        if let Some(result) = self.update_task.as_ref().and_then(ApiClient::poll) {
            self.update_task = None;
            match result {
                Ok(response) => {
                    let contract = response.contract;
                    self.notice = format!("Đã lưu thay đổi hợp đồng {}.", contract.code);
                    self.detail = Some(contract);
                    self.form = None;
                    self.form_open = false;
                    self.form_error.clear();
                    self.last_loaded = None;
                }
                Err(error) => self.form_error = error,
            }
        }
        if let Some(result) = self.archive_task.as_ref().and_then(ApiClient::poll) {
            self.archive_task = None;
            match result {
                Ok(_) => {
                    let code = self
                        .archive_confirm
                        .as_ref()
                        .map(|(_, code)| code.as_str())
                        .unwrap_or_default()
                        .to_owned();
                    self.archive_confirm = None;
                    self.detail_open = false;
                    self.detail = None;
                    self.notice = format!("Đã lưu trữ hợp đồng {code}.");
                    self.last_loaded = None;
                }
                Err(error) => self.detail_error = error,
            }
        }
        if self.list_task.is_some()
            || self.detail_task.is_some()
            || self.create_task.is_some()
            || self.update_task.is_some()
            || self.archive_task.is_some()
        {
            ctx.request_repaint_after(Duration::from_millis(80));
        } else if let Some(loaded) = self.last_loaded {
            ctx.request_repaint_after(Duration::from_secs(30).saturating_sub(loaded.elapsed()));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &Context, session: &Session, api: &ApiClient) {
        self.render_scope(ui, ctx, session, api, session.user.role == "ADMIN");
    }

    pub fn render_scope(
        &mut self,
        ui: &mut Ui,
        ctx: &Context,
        session: &Session,
        api: &ApiClient,
        labor_only: bool,
    ) {
        self.poll(ctx, session, api);
        if self.labor_only != labor_only {
            self.category_filter.clear();
            self.page = 0;
        }
        self.labor_only = labor_only;
        let employee_view = session.user.role != "ADMIN";
        ui.add_space(8.0);
        let unknown =
            self.contracts.is_empty() && (self.list_task.is_some() || !self.error.is_empty());
        let scoped = self
            .contracts
            .iter()
            .filter(|c| !labor_only || c.contract_category.eq_ignore_ascii_case("labor"))
            .collect::<Vec<_>>();
        let count = scoped.len();
        let partner_count = scoped
            .iter()
            .filter(|c| {
                if labor_only {
                    c.party_b_type != "organization"
                } else {
                    c.party_b_type == "organization"
                }
            })
            .count();
        let waiting = scoped
            .iter()
            .filter(|c| matches!(c.status.as_str(), "Chờ ký" | "Chờ duyệt"))
            .count();
        let active = scoped.iter().filter(|c| c.status == "Còn hiệu lực").count();
        let labels = [
            if labor_only {
                "Tổng hợp đồng lao động"
            } else {
                "Tổng hợp đồng & văn bản đã ký"
            },
            if labor_only {
                "Hợp đồng lao động nội bộ"
            } else {
                "Hợp đồng đối tác B2B & Dịch vụ"
            },
            "Hợp đồng có hiệu lực pháp lý",
            "Hợp đồng chờ phê duyệt & ký",
        ];
        let values = [
            format!("{count} Hợp đồng"),
            format!(
                "{partner_count} {}",
                if labor_only {
                    "Lao động"
                } else {
                    "Đối tác"
                }
            ),
            format!(
                "{active} ({:.0}%)",
                if count == 0 {
                    0.0
                } else {
                    active as f32 * 100.0 / count as f32
                }
            ),
            format!("{waiting} Văn bản"),
        ];
        let details = [
            "Trạng thái ký từ nguồn · chưa xác minh CA",
            "Liên kết doanh nghiệp & nhà cung cấp",
            "Theo dữ liệu nguồn · chưa xác minh pháp lý",
            "Bên B đã ký / Đang chờ công ty duyệt",
        ];
        let colors = [
            crate::theme::PRIMARY,
            Color32::from_rgb(37, 99, 235),
            Color32::from_rgb(22, 163, 74),
            Color32::from_rgb(217, 119, 6),
        ];
        let metrics = labels
            .iter()
            .enumerate()
            .map(|(i, label)| crate::widgets::Metric {
                label,
                value: if unknown {
                    "—".into()
                } else {
                    values[i].clone()
                },
                detail: details[i],
                color: colors[i],
                value_size: 24.0,
            })
            .collect::<Vec<_>>();
        crate::widgets::metrics(ui, "contracts.metrics", &metrics);
        ui.add_space(16.0);
        if !self.notice.is_empty() {
            ui.colored_label(Color32::from_rgb(21, 128, 61), &self.notice);
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
        }
        let width = ui.available_width();
        let compact = ctx.screen_rect().width() <= 992.0;
        let (bar, _) = ui.allocate_exact_size(
            egui::vec2(width, if compact { 192.0 } else { 32.0 }),
            egui::Sense::hover(),
        );
        let at =
            |x, y, w| egui::Rect::from_min_size(bar.min + egui::vec2(x, y), egui::vec2(w, 32.0));
        let mut child = ui.new_child(
            egui::UiBuilder::new()
                .max_rect(at(0.0, 0.0, if compact { width.min(500.0) } else { 220.0 }))
                .layout(egui::Layout::centered_and_justified(
                    egui::Direction::TopDown,
                )),
        );
        if !labor_only {
            crate::widgets::combo_box("contracts_category_filter")
                .width(child.available_width())
                .selected_text(category_label(&self.category_filter))
                .show_ui(&mut child, |ui| {
                    for (value, label) in [
                        ("", "Tất cả văn bản"),
                        ("labor", "Lao động"),
                        ("nda", "Bảo mật (NDA)"),
                        ("service", "Dịch vụ"),
                        ("partner", "Đối tác"),
                        ("equity", "Cổ phần"),
                        ("consultant", "Tư vấn"),
                    ] {
                        if ui
                            .selectable_value(&mut self.category_filter, value.to_owned(), label)
                            .changed()
                        {
                            self.page = 0;
                        }
                    }
                });
        }
        let actions_width = if employee_view {
            709.859375
        } else {
            916.515625
        };
        let start = if compact {
            0.0
        } else {
            (width - actions_width).max(0.0)
        };
        if crate::widgets::search_input(
            ui,
            at(
                start,
                if compact { 40.0 } else { 0.0 },
                if compact { width.min(500.0) } else { 260.0 },
            ),
            &mut self.search,
            "Tìm theo mã HĐ, tên đối tác, MST, nhân sự...",
        )
        .changed()
        {
            self.page = 0;
        }
        let mut child = ui.new_child(
            egui::UiBuilder::new()
                .max_rect(at(
                    if compact { 0.0 } else { start + 268.0 },
                    if compact { 80.0 } else { 0.0 },
                    160.0,
                ))
                .layout(egui::Layout::centered_and_justified(
                    egui::Direction::TopDown,
                )),
        );
        crate::widgets::combo_box("contracts_status_filter")
            .width(160.0)
            .selected_text(if self.status_filter.is_empty() {
                "Tất cả trạng thái"
            } else {
                &self.status_filter
            })
            .show_ui(&mut child, |ui| {
                for status in [
                    "",
                    "Dự thảo",
                    "Chờ ký",
                    "Chờ duyệt",
                    "Còn hiệu lực",
                    "Đã hết hạn",
                ] {
                    if ui
                        .selectable_value(
                            &mut self.status_filter,
                            status.to_owned(),
                            if status.is_empty() {
                                "Tất cả trạng thái"
                            } else {
                                status
                            },
                        )
                        .changed()
                    {
                        self.page = 0;
                    }
                }
            });
        let ay = if compact { 120.0 } else { 0.0 };
        let ax = if compact { 0.0 } else { start + 436.0 };
        ui.add_enabled_ui(false, |ui| {
            crate::widgets::put(ui, at(ax, ay, 120.9375), egui::Button::new("Xuất Excel"))
                .on_disabled_hover_text("Chưa có tệp xuất được máy chủ xác nhận.");
        });
        if crate::widgets::put(
            ui,
            at(ax + 128.9375, ay, 144.921875),
            egui::Button::new("Làm mới"),
        )
        .clicked()
        {
            self.last_loaded = None;
        }
        if !employee_view {
            let busy = self.create_task.is_some()
                || self.update_task.is_some()
                || self.archive_task.is_some();
            ui.add_enabled_ui(!busy, |ui| {
                let rect = at(
                    if compact { 0.0 } else { width - 198.65625 },
                    if compact { 160.0 } else { ay },
                    198.65625,
                );
                if crate::widgets::put(
                    ui,
                    rect,
                    egui::Button::new(
                        RichText::new(if labor_only {
                            "＋ Lập hợp đồng lao động"
                        } else {
                            "＋ Lập hợp đồng mẫu"
                        })
                        .color(Color32::WHITE),
                    )
                    .fill(crate::theme::PRIMARY),
                )
                .clicked()
                {
                    self.form = Some(ContractForm::new());
                    self.form_open = true;
                    self.form_error.clear();
                }
                crate::visual_test::record("contracts.add", rect);
            });
        }
        crate::visual_test::record("contracts.toolbar", bar);
        ui.add_space(12.0);
        let visible = self.visible_contracts();
        let page_size = self.page_size.max(PAGE_SIZE);
        self.page_size = page_size;
        self.page = self.page.min(visible.len().div_ceil(page_size).max(1) - 1);
        let visible_page = visible
            .iter()
            .skip(self.page * page_size)
            .take(page_size)
            .collect::<Vec<_>>();
        let width = (ui.available_width() - 2.0).max(1017.0);
        let flexible = width - 557.875;
        let widths = [
            flexible * 407.4375 / 636.125,
            flexible * 228.6875 / 636.125,
            170.0,
            130.0,
            257.875,
        ];
        let titles = [
            "Thông tin hợp đồng",
            "Chủ thể ký kết",
            "Chữ ký",
            "Trạng thái",
            "Thao tác",
        ];
        let columns = titles
            .iter()
            .enumerate()
            .map(|(i, title)| crate::widgets::TableColumn {
                title,
                width: widths[i],
            })
            .collect::<Vec<_>>();
        let mut open_id = None;
        if self.list_task.is_some() && self.contracts.is_empty() {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải hợp đồng từ máy chủ…");
            });
        } else if !unknown {
            crate::widgets::table_with_row_height(
                ui,
                "contracts.table",
                &columns,
                visible_page.len(),
                59.25,
                |ui, row, col| {
                    let contract = visible_page[row];
                    match col {
                        0 => {
                            ui.label(RichText::new(&contract.name).size(13.5).strong());
                            ui.label(
                                RichText::new(format!(
                                    "{} · {}",
                                    contract.code, contract.contract_type
                                ))
                                .size(11.5)
                                .color(crate::theme::PRIMARY),
                            );
                        }
                        1 => {
                            ui.label(
                                RichText::new(if contract.party_b_name.is_empty() {
                                    &contract.employee_name
                                } else {
                                    &contract.party_b_name
                                })
                                .size(13.0)
                                .strong(),
                            );
                            ui.label(
                                RichText::new(format!("Mã: {}", contract.employee_code)).size(11.5),
                            );
                        }
                        2 => {
                            ui.label(
                                RichText::new(format!(
                                    "Đối tác: {}",
                                    contract.employee_sign_status
                                ))
                                .size(11.5),
                            );
                            ui.label(
                                RichText::new(format!(
                                    "Doanh nghiệp: {}",
                                    contract.company_sign_status
                                ))
                                .size(11.5),
                            )
                            .on_hover_text("Trạng thái nguồn chưa được xác minh bằng PKI/TSA.");
                        }
                        3 => status_badge(ui, &contract.status),
                        _ => {
                            if ui.button("Hồ sơ").clicked() {
                                open_id = Some(contract.id.clone());
                            }
                            ui.label(
                                RichText::new("Ký số chưa xác minh")
                                    .size(10.5)
                                    .color(Color32::from_rgb(100, 116, 139)),
                            );
                        }
                    }
                },
            );
            ui.add_space(10.0);
            crate::widgets::pagination(
                ui,
                "contracts.pagination",
                &mut self.page,
                visible.len(),
                &mut self.page_size,
            );
        }
        if let Some(contract_id) = open_id {
            self.detail = None;
            self.detail_error.clear();
            self.detail_task = Some(api.get_contract_task(session, &contract_id));
            self.detail_open = true;
            ctx.request_repaint();
        }

        if self.detail_open {
            self.render_detail(ctx, !employee_view);
        }
        if self.form_open {
            self.render_form(ctx, session, api);
        }
        if self.archive_confirm.is_some() {
            self.render_archive_confirmation(ctx, session, api);
        }
    }

    fn visible_contracts(&self) -> Vec<ContractSummary> {
        let search = self.search.trim().to_lowercase();
        self.contracts
            .iter()
            .filter(|item| {
                (!self.labor_only || item.contract_category.eq_ignore_ascii_case("labor"))
                    && (self.status_filter.is_empty() || item.status == self.status_filter)
                    && (self.category_filter.is_empty()
                        || item
                            .contract_category
                            .eq_ignore_ascii_case(&self.category_filter))
                    && (search.is_empty()
                        || [
                            item.code.as_str(),
                            item.name.as_str(),
                            item.party_b_name.as_str(),
                            item.employee_name.as_str(),
                            item.employee_code.as_str(),
                            item.department.as_str(),
                        ]
                        .iter()
                        .any(|value| value.to_lowercase().contains(&search)))
            })
            .cloned()
            .collect()
    }

    fn page_count(&self) -> usize {
        self.visible_contracts().len().div_ceil(PAGE_SIZE).max(1)
    }

    fn render_form(&mut self, ctx: &Context, session: &Session, api: &ApiClient) {
        let mut open = self.form_open;
        let busy = self.create_task.is_some() || self.update_task.is_some();
        let mut save_requested = false;
        let mut cancel_requested = false;
        if let Some(form) = self.form.as_mut() {
            let title = if form.id.is_some() {
                "Sửa hợp đồng"
            } else {
                "Tạo hợp đồng"
            };
            egui::Window::new(title)
                .open(&mut open)
                .collapsible(false)
                .resizable(true)
                .default_width(900.0)
                .show(ctx, |ui| {
                    if !self.form_error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
                    }
                    if busy {
                        ui.horizontal(|ui| {
                            ui.spinner();
                            ui.label("Đang lưu hợp đồng lên máy chủ…");
                        });
                    }
                    egui::ScrollArea::vertical()
                        .max_height(600.0)
                        .show(ui, |ui| render_contract_form(ui, form));
                    ui.separator();
                    ui.horizontal(|ui| {
                        if ui
                            .add_enabled(!busy, egui::Button::new("Lưu hợp đồng"))
                            .clicked()
                        {
                            save_requested = true;
                        }
                        if ui.add_enabled(!busy, egui::Button::new("Hủy")).clicked() {
                            cancel_requested = true;
                        }
                    });
                });
        }
        self.form_open = if busy { true } else { open };
        if cancel_requested || (!open && !busy) {
            self.form = None;
            self.form_open = false;
            self.form_error.clear();
            return;
        }
        if save_requested {
            let payload = self.form.as_ref().map(ContractForm::to_payload);
            match payload {
                Some(Ok(payload)) => {
                    self.form_error.clear();
                    if let Some(contract_id) =
                        self.form.as_ref().and_then(|form| form.id.as_deref())
                    {
                        self.update_task =
                            Some(api.update_contract_task(session, contract_id, payload));
                    } else {
                        self.create_task = Some(api.create_contract_task(session, payload));
                    }
                    ctx.request_repaint();
                }
                Some(Err(error)) => {
                    self.form_error = error;
                    ctx.request_repaint();
                }
                None => {}
            }
        }
    }

    fn render_archive_confirmation(&mut self, ctx: &Context, session: &Session, api: &ApiClient) {
        let Some((contract_id, code)) = self.archive_confirm.clone() else {
            return;
        };
        let busy = self.archive_task.is_some();
        let mut confirm = false;
        let mut cancel = false;
        let mut open = true;
        egui::Window::new("Lưu trữ hợp đồng")
            .open(&mut open)
            .collapsible(false)
            .resizable(false)
            .show(ctx, |ui| {
                ui.label(format!(
                    "Hợp đồng {code} sẽ được ẩn khỏi danh sách. Bản ghi được lưu trữ, không xóa vĩnh viễn."
                ));
                if !self.detail_error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.detail_error);
                }
                if busy {
                    ui.horizontal(|ui| {
                        ui.spinner();
                        ui.label("Đang lưu trữ…");
                    });
                }
                ui.horizontal(|ui| {
                    if ui
                        .add_enabled(!busy, egui::Button::new("Xác nhận lưu trữ"))
                        .clicked()
                    {
                        confirm = true;
                    }
                    if ui.add_enabled(!busy, egui::Button::new("Quay lại")).clicked() {
                        cancel = true;
                    }
                });
            });
        if cancel || (!open && !busy) {
            self.archive_confirm = None;
            self.detail_error.clear();
        } else if confirm && !busy {
            self.detail_error.clear();
            self.archive_task = Some(api.archive_contract_task(session, &contract_id));
            ctx.request_repaint();
        }
    }

    fn render_detail(&mut self, ctx: &Context, admin: bool) {
        let mut open = self.detail_open;
        let contract = self.detail.clone();
        let mut edit_requested = false;
        let mut archive_requested = false;
        egui::Window::new(if admin {
            "Chi tiết hợp đồng"
        } else {
            "Chi tiết hợp đồng · chỉ đọc"
        })
            .open(&mut open)
            .collapsible(false)
            .resizable(true)
            .default_width(560.0)
            .show(ctx, |ui| {
                if let Some(error) = (!self.detail_error.is_empty()).then_some(&self.detail_error) {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), error);
                } else if self.detail_task.is_some() {
                    ui.spinner();
                    ui.label("Đang tải chi tiết…");
                } else if let Some(contract) = contract.as_ref() {
                    egui::Grid::new("contract_summary_details")
                        .num_columns(2)
                        .spacing(Vec2::new(14.0, 8.0))
                        .show(ui, |ui| {
                            detail_row(ui, "Mã hợp đồng", &contract.code);
                            detail_row(ui, "Tên hợp đồng", &contract.name);
                            detail_row(ui, "Danh mục", &contract.contract_category);
                            detail_row(ui, "Mẫu", &contract.contract_template);
                            detail_row(ui, "Bên B", &contract.party_b_name);
                            detail_row(ui, "Nhân viên", &contract.employee_name);
                            detail_row(ui, "Mã nhân viên", &contract.employee_code);
                            detail_row(ui, "Phòng ban", &contract.department);
                            detail_row(ui, "Chức vụ", &contract.position);
                            detail_row(
                                ui,
                                "Thời hạn",
                                &format!(
                                    "{} — {}",
                                    date_or_dash(&contract.start_date),
                                    date_or_dash(&contract.end_date)
                                ),
                            );
                            detail_row(ui, "Trạng thái nguồn", &contract.status);
                            detail_row(ui, "Ký nhân viên (nguồn)", &contract.employee_sign_status);
                            detail_row(ui, "Ký công ty (nguồn)", &contract.company_sign_status);
                            detail_row(
                                ui,
                                "Xác minh chữ ký",
                                "Chưa xác minh · hệ thống chưa có PKI/TSA",
                            );
                            if contract.is_full == Some(true) {
                                detail_row_optional(ui, "Mã số thuế Bên B", contract.party_b_tax_code.as_deref());
                                detail_row_optional(ui, "Đại diện Bên B", contract.party_b_representative.as_deref());
                                detail_row_optional(ui, "Chức vụ Bên B", contract.party_b_position.as_deref());
                                detail_row_optional(ui, "CCCD Bên B", contract.party_b_id_number.as_deref());
                                detail_row_optional(ui, "Điện thoại Bên B", contract.party_b_phone.as_deref());
                                detail_row_optional(ui, "Email Bên B", contract.party_b_email.as_deref());
                                detail_row_optional(ui, "Ngân hàng Bên B", contract.party_b_bank.as_deref());
                                detail_row_optional(ui, "Địa chỉ Bên B", contract.party_b_address.as_deref());
                                detail_row_optional(ui, "CCCD nhân viên", contract.employee_id_number.as_deref());
                                detail_row_optional(ui, "Điện thoại nhân viên", contract.employee_phone.as_deref());
                                detail_row_optional(ui, "Email nhân viên", contract.employee_email.as_deref());
                                detail_row_optional(ui, "Ngân hàng nhân viên", contract.employee_bank.as_deref());
                                detail_row_optional(ui, "Cấp bậc", contract.job_level.as_deref());
                                detail_row_optional(ui, "Địa điểm làm việc", contract.work_location.as_deref());
                                detail_row_optional(ui, "Thử việc (tháng)", contract.probation_months.map(|v| v.to_string()).as_deref());
                                detail_row_optional(ui, "Giá trị hợp đồng", format_amount(contract.contract_value).as_deref());
                                detail_row_optional(ui, "Mức lương", format_amount(contract.salary).as_deref());
                                detail_row_optional(ui, "Phụ cấp", format_amount(contract.allowance).as_deref());
                                detail_row_optional(ui, "Cổ phần ESOP", contract.stock_shares_percent.as_deref());
                                detail_row_optional(ui, "Phương thức thanh toán", contract.payment_method.as_deref());
                                detail_row_optional(ui, "Ngày thanh toán", contract.payment_day.map(|v| v.to_string()).as_deref());
                                detail_row_optional(ui, "Thời gian làm việc", contract.working_hours.as_deref());
                                detail_row_optional(ui, "Ngày phép năm", contract.annual_leave_days.map(|v| v.to_string()).as_deref());
                                detail_row_optional(ui, "Bảo hiểm", contract.insurance_type.as_deref());
                                detail_row_optional(ui, "Người ký theo nguồn", contract.signer_name.as_deref());
                                detail_row_optional(ui, "Chức vụ người ký", contract.signer_position.as_deref());
                                detail_row_optional(ui, "Điều khoản NDA", contract.nda_clause.map(|v| if v { "Có" } else { "Không" }));
                                detail_row_optional(ui, "Không cạnh tranh", contract.non_compete_clause.map(|v| if v { "Có" } else { "Không" }));
                                detail_row_optional(ui, "Ghi chú", contract.note.as_deref());
                                if let Some(custom_fields) = contract.custom_field_values.as_ref() {
                                    detail_row(ui, "Trường tùy chỉnh", &custom_fields.to_string());
                                }
                            } else {
                                ui.label("Bản ghi này chỉ khớp mã nhân viên; hệ thống không trả thông tin nhạy cảm khi chưa có liên kết chủ sở hữu chính xác.");
                            }
                        });
                    if admin && contract.is_full == Some(true) {
                        ui.separator();
                        ui.horizontal(|ui| {
                            if contract_editable(&contract.status) {
                                if ui.button("Chỉnh sửa").clicked() {
                                    edit_requested = true;
                                }
                            } else {
                                ui.add_enabled(false, egui::Button::new("Chỉ xem · trạng thái lịch sử"));
                            }
                            if ui
                                .add_enabled(self.archive_task.is_none(), egui::Button::new("Lưu trữ"))
                                .clicked()
                            {
                                archive_requested = true;
                            }
                        });
                    }
                } else {
                    ui.label("Không có chi tiết để hiển thị.");
                }
            });
        self.detail_open = open;
        if !open {
            self.detail_error.clear();
        }
        if edit_requested {
            if let Some(contract) = contract.as_ref() {
                self.form = Some(ContractForm::from_contract(contract));
                self.form_open = true;
                self.form_error.clear();
            }
        }
        if archive_requested {
            if let Some(contract) = contract.as_ref() {
                self.archive_confirm = Some((contract.id.clone(), contract.code.clone()));
                self.detail_error.clear();
            }
        }
    }
}

fn contract_editable(status: &str) -> bool {
    matches!(status, "Dự thảo" | "Chờ duyệt" | "Chờ ký" | "Đã hủy")
}

fn render_contract_form(ui: &mut Ui, form: &mut ContractForm) {
    ui.label("Mã hợp đồng được tạo tự động nếu để trống. Các trường ký số và tệp ký không nằm trong form này.");
    ui.add_space(8.0);
    ui.heading("Thông tin chung");
    ui.horizontal(|ui| {
        ui.label("Mã hợp đồng");
        ui.add(egui::TextEdit::singleline(&mut form.code).desired_width(230.0));
        form_text(ui, "Tên hợp đồng", &mut form.name);
    });
    ui.horizontal(|ui| {
        ui.label("Danh mục");
        crate::widgets::combo_box("contract_form_category")
            .selected_text(category_label(&form.contract_category))
            .show_ui(ui, |ui| {
                for (value, label) in [
                    ("labor", "Lao động"),
                    ("nda", "Bảo mật (NDA)"),
                    ("service", "Dịch vụ"),
                    ("partner", "Đối tác"),
                    ("equity", "Cổ phần"),
                    ("consultant", "Tư vấn"),
                ] {
                    ui.selectable_value(&mut form.contract_category, value.to_owned(), label);
                }
            });
        form_text(ui, "Mẫu hợp đồng", &mut form.contract_template);
    });
    ui.horizontal(|ui| {
        form_text(ui, "Loại hợp đồng", &mut form.contract_type);
        ui.label("Trạng thái");
        crate::widgets::combo_box("contract_form_status")
            .selected_text(&form.status)
            .show_ui(ui, |ui| {
                for status in ["Dự thảo", "Chờ duyệt", "Chờ ký", "Đã hủy"] {
                    ui.selectable_value(&mut form.status, status.to_owned(), status);
                }
            });
    });

    ui.add_space(10.0);
    ui.heading("Bên B / đối tác");
    form_pair(
        ui,
        "Loại đối tác",
        &mut form.party_b_type,
        "Tên bên B",
        &mut form.party_b_name,
    );
    form_pair(
        ui,
        "Mã số thuế",
        &mut form.party_b_tax_code,
        "Người đại diện",
        &mut form.party_b_representative,
    );
    form_pair(
        ui,
        "Chức vụ đại diện",
        &mut form.party_b_position,
        "CCCD/CMND",
        &mut form.party_b_id_number,
    );
    form_pair(
        ui,
        "Điện thoại",
        &mut form.party_b_phone,
        "Email",
        &mut form.party_b_email,
    );
    form_pair(
        ui,
        "Ngân hàng",
        &mut form.party_b_bank,
        "Địa chỉ",
        &mut form.party_b_address,
    );

    ui.add_space(10.0);
    ui.heading("Nhân viên");
    form_pair(
        ui,
        "Mã nhân viên",
        &mut form.employee_code,
        "Họ tên",
        &mut form.employee_name,
    );
    form_pair(
        ui,
        "CCCD/CMND",
        &mut form.employee_id_number,
        "Điện thoại",
        &mut form.employee_phone,
    );
    form_pair(
        ui,
        "Email",
        &mut form.employee_email,
        "Ngân hàng",
        &mut form.employee_bank,
    );

    ui.add_space(10.0);
    ui.heading("Điều khoản");
    form_pair(
        ui,
        "Vị trí",
        &mut form.position,
        "Phòng ban",
        &mut form.department,
    );
    form_pair(
        ui,
        "Cấp bậc",
        &mut form.job_level,
        "Địa điểm làm việc",
        &mut form.work_location,
    );
    form_pair(
        ui,
        "Ngày bắt đầu",
        &mut form.start_date,
        "Ngày kết thúc",
        &mut form.end_date,
    );
    form_pair(
        ui,
        "Thử việc (tháng)",
        &mut form.probation_months,
        "Giá trị hợp đồng",
        &mut form.contract_value,
    );
    form_pair(
        ui,
        "Lương",
        &mut form.salary,
        "Phụ cấp",
        &mut form.allowance,
    );
    form_pair(
        ui,
        "Cổ phần ESOP",
        &mut form.stock_shares_percent,
        "Phương thức thanh toán",
        &mut form.payment_method,
    );
    form_pair(
        ui,
        "Ngày thanh toán",
        &mut form.payment_day,
        "Giờ làm việc",
        &mut form.working_hours,
    );
    form_pair(
        ui,
        "Ngày phép năm",
        &mut form.annual_leave_days,
        "Bảo hiểm",
        &mut form.insurance_type,
    );
    form_pair(
        ui,
        "Người đại diện ký",
        &mut form.signer_name,
        "Chức vụ người ký",
        &mut form.signer_position,
    );
    ui.horizontal(|ui| {
        ui.checkbox(&mut form.nda_clause, "Có điều khoản bảo mật NDA");
        ui.checkbox(
            &mut form.non_compete_clause,
            "Có điều khoản không cạnh tranh",
        );
    });

    ui.add_space(10.0);
    ui.heading("Ghi chú và trường tùy chỉnh");
    ui.label("Ghi chú");
    ui.add(
        egui::TextEdit::multiline(&mut form.note)
            .desired_rows(3)
            .desired_width(f32::INFINITY),
    );
    ui.label("Trường tùy chỉnh (JSON object)");
    ui.add(
        egui::TextEdit::multiline(&mut form.custom_field_values)
            .desired_rows(4)
            .desired_width(f32::INFINITY)
            .code_editor(),
    );
}

fn form_pair(
    ui: &mut Ui,
    first_label: &str,
    first: &mut String,
    second_label: &str,
    second: &mut String,
) {
    ui.horizontal(|ui| {
        ui.label(first_label);
        ui.add(egui::TextEdit::singleline(first).desired_width(185.0));
        ui.label(second_label);
        ui.add(egui::TextEdit::singleline(second).desired_width(185.0));
    });
}

fn form_text(ui: &mut Ui, label: &str, value: &mut String) {
    ui.label(label);
    ui.add(egui::TextEdit::singleline(value).desired_width(220.0));
}

fn status_badge(ui: &mut Ui, status: &str) {
    let (background, foreground) = match status {
        "Còn hiệu lực" => (
            Color32::from_rgb(220, 252, 231),
            Color32::from_rgb(22, 101, 52),
        ),
        "Chờ ký" | "Chờ duyệt" => (
            Color32::from_rgb(254, 243, 199),
            Color32::from_rgb(146, 64, 14),
        ),
        "Dự thảo" => (
            Color32::from_rgb(241, 245, 249),
            Color32::from_rgb(71, 85, 105),
        ),
        "Đã hết hạn" => (
            Color32::from_rgb(254, 226, 226),
            Color32::from_rgb(153, 27, 27),
        ),
        _ => (
            Color32::from_rgb(241, 245, 249),
            Color32::from_rgb(71, 85, 105),
        ),
    };
    egui::Frame::none()
        .fill(background)
        .rounding(12.0)
        .inner_margin(egui::Margin::symmetric(8.0, 4.0))
        .show(ui, |ui| {
            ui.label(RichText::new(status).size(10.5).strong().color(foreground));
        });
}

fn detail_row(ui: &mut Ui, label: &str, value: &str) {
    ui.label(RichText::new(label).strong());
    ui.label(value);
    ui.end_row();
}

fn detail_row_optional(ui: &mut Ui, label: &str, value: Option<&str>) {
    if let Some(value) = value.filter(|value| !value.trim().is_empty()) {
        detail_row(ui, label, value);
    }
}

fn format_amount(value: Option<i64>) -> Option<String> {
    value
        .and_then(|amount| u64::try_from(amount).ok())
        .map(format_vnd)
}

fn date_or_dash(value: &str) -> &str {
    if value.trim().is_empty() {
        "—"
    } else {
        value
    }
}

fn category_label(category: &str) -> &str {
    match category {
        "" => "Tất cả",
        "labor" => "Lao động",
        "nda" => "Bảo mật (NDA)",
        "service" => "Dịch vụ",
        "partner" => "Đối tác",
        "equity" => "Cổ phần",
        "consultant" => "Tư vấn",
        _ => category,
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn labor_scope_and_document_scope_keep_distinct_contract_lists() {
        let mut view = super::ContractsView::default();
        view.contracts = vec![
            crate::api::ContractSummary {
                contract_category: "labor".into(),
                name: "Nhân viên".into(),
                ..Default::default()
            },
            crate::api::ContractSummary {
                contract_category: "service".into(),
                name: "Đối tác".into(),
                ..Default::default()
            },
        ];
        view.labor_only = true;
        assert_eq!(view.visible_contracts().len(), 1);
        view.labor_only = false;
        assert_eq!(view.visible_contracts().len(), 2);
        view.category_filter = "service".into();
        assert_eq!(view.visible_contracts()[0].name, "Đối tác");
    }
    use super::{ContractForm, category_label, contract_editable};
    use serde_json::json;

    #[test]
    fn known_legacy_contract_categories_have_stable_labels() {
        assert_eq!(category_label("labor"), "Lao động");
        assert_eq!(category_label("nda"), "Bảo mật (NDA)");
        assert_eq!(category_label("consultant"), "Tư vấn");
        assert_eq!(
            category_label("custom-legacy-category"),
            "custom-legacy-category"
        );
    }

    #[test]
    fn contract_form_serializes_supported_business_fields_but_never_signing_claims() {
        let mut form = ContractForm::new();
        form.name = "  Hợp đồng thử  ".to_owned();
        form.contract_template = "Mẫu chuẩn".to_owned();
        form.employee_code = "EMP-001".to_owned();
        form.employee_phone = "0912345678".to_owned();
        form.salary = "25000000".to_owned();
        form.signer_name = "Người đại diện".to_owned();
        form.signer_position = "Giám đốc".to_owned();
        form.custom_field_values = r#"{"costCenter":"OPS"}"#.to_owned();
        let payload = form.to_payload().expect("validated contract payload");
        assert_eq!(payload["name"], "Hợp đồng thử");
        assert_eq!(payload["employeeCode"], "EMP-001");
        assert_eq!(payload["employeePhone"], "0912345678");
        assert_eq!(payload["salary"], 25_000_000);
        assert_eq!(payload["signerName"], "Người đại diện");
        assert_eq!(payload["signerPosition"], "Giám đốc");
        assert_eq!(payload["customFieldValues"], json!({"costCenter":"OPS"}));
        assert!(payload.get("employeeSignStatus").is_none());
        assert!(payload.get("employeeCertName").is_none());
        assert!(payload.get("companySignedFileName").is_none());
    }

    #[test]
    fn contract_form_rejects_invalid_numbers_and_custom_json() {
        let mut form = ContractForm::new();
        form.name = "Tên".to_owned();
        form.contract_value = "-5".to_owned();
        assert!(form.to_payload().unwrap_err().contains("Giá trị hợp đồng"));
        form.contract_value = "0".to_owned();
        form.custom_field_values = "[]".to_owned();
        assert!(form.to_payload().unwrap_err().contains("đối tượng JSON"));
    }

    #[test]
    fn contract_edit_actions_exclude_unverified_active_historical_states() {
        assert!(contract_editable("Dự thảo"));
        assert!(contract_editable("Chờ ký"));
        assert!(contract_editable("Chờ duyệt"));
        assert!(!contract_editable("Còn hiệu lực"));
        assert!(!contract_editable("Đã hết hạn"));
    }
}
