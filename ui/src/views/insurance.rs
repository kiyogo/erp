use std::{collections::BTreeMap, time::Duration};

use chrono::Utc;
use egui::{Color32, Context, RichText, Ui, Vec2};
use serde_json::{Value, json};

use crate::{
    api::{
        ApiClient, ApiTask, ContractsResponse, EmployeeListResponse, GenericCollectionResponse,
        GenericRecordResponse,
    },
    models::{Employee, Session},
};

use super::employees::format_vnd;

const PAGE_SIZE: usize = 8;
const ADJUSTMENT_TYPES: [&str; 5] = [
    "Báo tăng mới",
    "Báo giảm hẳn",
    "Điều chỉnh tăng lương",
    "Nghỉ thai sản",
    "Nghỉ ốm dài ngày",
];
const REGIME_TYPES: [&str; 4] = [
    "Ốm đau ngắn ngày",
    "Thai sản (6 tháng)",
    "Dưỡng sức sau sinh",
    "Khám thai định kỳ",
];

#[derive(Clone, Copy, PartialEq, Eq)]
enum InsuranceFormKind {
    Adjustment,
    Regime,
}

#[derive(Default)]
struct AdjustmentDraft {
    code: String,
    adjust_type: String,
    employee_name: String,
    employee_code: String,
    old_salary: String,
    new_salary: String,
    effective_month: String,
    filing_date: String,
}

impl AdjustmentDraft {
    fn new(record_count: usize) -> Self {
        let now = Utc::now();
        Self {
            code: format!(
                "D02-{}/{}-{:02}",
                now.format("%Y"),
                now.format("%m"),
                record_count + 1
            ),
            adjust_type: ADJUSTMENT_TYPES[0].to_owned(),
            effective_month: format!("Tháng {}/{}", now.format("%m"), now.format("%Y")),
            filing_date: now.format("%Y-%m-%d").to_string(),
            ..Self::default()
        }
    }

    fn build(&self, records: &[Value]) -> Result<Value, String> {
        for (value, label) in [
            (&self.code, "Mã hồ sơ D02"),
            (&self.adjust_type, "Loại nghiệp vụ điều chỉnh"),
            (&self.employee_name, "Họ tên nhân viên"),
            (&self.employee_code, "Mã nhân viên"),
            (&self.effective_month, "Tháng áp dụng"),
            (&self.filing_date, "Ngày nộp hồ sơ"),
        ] {
            if value.trim().is_empty() {
                return Err(format!("{label} không được để trống."));
            }
        }
        if records
            .iter()
            .any(|record| string_field(record, "d02Code") == self.code.trim())
        {
            return Err("Mã hồ sơ D02 đã tồn tại.".to_owned());
        }
        if !ADJUSTMENT_TYPES.contains(&self.adjust_type.as_str()) {
            return Err("Loại nghiệp vụ điều chỉnh không hợp lệ.".to_owned());
        }
        let old_salary = parse_amount(&self.old_salary, "Mức lương cũ", true)?;
        let new_salary = parse_amount(&self.new_salary, "Mức lương mới", false)?;
        Ok(json!({
            "key": format!("insurance-adjustment-{}", Utc::now().timestamp_micros()),
            "d02Code": self.code.trim(),
            "adjustType": self.adjust_type,
            "empName": self.employee_name.trim(),
            "empCode": self.employee_code.trim(),
            "oldSalary": old_salary,
            "newSalary": new_salary,
            "effectiveMonth": self.effective_month.trim(),
            "filingDate": self.filing_date.trim(),
            "vssSubmissionStatus": "Chưa gửi · chưa kết nối Cổng eBH",
        }))
    }
}

#[derive(Default)]
struct RegimeDraft {
    code: String,
    regime_type: String,
    employee_name: String,
    leave_days: String,
    calculated_amount: String,
    bank_account: String,
}

impl RegimeDraft {
    fn new(record_count: usize) -> Self {
        Self {
            code: format!("CĐ-{}-{:02}", Utc::now().format("%Y%m"), record_count + 1),
            regime_type: REGIME_TYPES[0].to_owned(),
            leave_days: "3".to_owned(),
            ..Self::default()
        }
    }

    fn build(&self, records: &[Value]) -> Result<Value, String> {
        for (value, label) in [
            (&self.code, "Mã hồ sơ chế độ"),
            (&self.regime_type, "Loại chế độ"),
            (&self.employee_name, "Họ tên người hưởng"),
            (&self.bank_account, "Tài khoản nhận trợ cấp"),
        ] {
            if value.trim().is_empty() {
                return Err(format!("{label} không được để trống."));
            }
        }
        if records
            .iter()
            .any(|record| string_field(record, "claimCode") == self.code.trim())
        {
            return Err("Mã hồ sơ chế độ đã tồn tại.".to_owned());
        }
        if !REGIME_TYPES.contains(&self.regime_type.as_str()) {
            return Err("Loại chế độ không hợp lệ.".to_owned());
        }
        let leave_days = parse_amount(&self.leave_days, "Số ngày nghỉ", false)?;
        if leave_days == 0 {
            return Err("Số ngày nghỉ phải lớn hơn 0.".to_owned());
        }
        let calculated_amount = parse_amount(&self.calculated_amount, "Số tiền đề nghị", false)?;
        Ok(json!({
            "key": format!("insurance-regime-{}", Utc::now().timestamp_micros()),
            "claimCode": self.code.trim(),
            "regimeType": self.regime_type,
            "empName": self.employee_name.trim(),
            "leaveDays": leave_days,
            "calculatedAmount": calculated_amount,
            "bankAccount": self.bank_account.trim(),
            "approvalStatus": "Đang thẩm định",
            "settlementDate": "Chờ duyệt",
            "providerSubmissionStatus": "Chưa gửi · chưa kết nối Cổng eBH",
        }))
    }
}

fn parse_amount(value: &str, label: &str, allow_empty: bool) -> Result<u64, String> {
    if allow_empty && value.trim().is_empty() {
        return Ok(0);
    }
    let amount = value
        .trim()
        .parse::<u64>()
        .map_err(|_| format!("{label} phải là số nguyên không âm."))?;
    if amount > 1_000_000_000_000 {
        return Err(format!("{label} vượt giới hạn cho phép."));
    }
    Ok(amount)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ContributionSummary {
    period: String,
    headcount: usize,
    total_salary_fund: u64,
    social_insurance: u64,
    health_insurance: u64,
    unemployment_insurance: u64,
    total_payable: u64,
    paid_amount: u64,
    balance_owed: u64,
    c12_status: &'static str,
}

#[derive(Default)]
pub struct InsuranceView {
    employees: Vec<Employee>,
    contracts: Vec<crate::api::ContractSummary>,
    payroll: Vec<Value>,
    adjustments: Vec<Value>,
    regimes: Vec<Value>,
    employees_task: Option<ApiTask<EmployeeListResponse>>,
    contracts_task: Option<ApiTask<ContractsResponse>>,
    payroll_task: Option<ApiTask<GenericCollectionResponse>>,
    adjustments_task: Option<ApiTask<GenericCollectionResponse>>,
    regimes_task: Option<ApiTask<GenericCollectionResponse>>,
    adjustment_create_task: Option<ApiTask<GenericRecordResponse>>,
    regime_create_task: Option<ApiTask<GenericRecordResponse>>,
    loaded_for: Option<String>,
    needs_reload: bool,
    loading: bool,
    error: String,
    notice: String,
    labor_page: usize,
    card_page: usize,
    card_detail_employee: Option<String>,
    adjustment_page: usize,
    regime_page: usize,
    form_kind: Option<InsuranceFormKind>,
    adjustment_draft: AdjustmentDraft,
    regime_draft: RegimeDraft,
}

impl InsuranceView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn has_pending_tasks(&self) -> bool {
        self.employees_task.is_some()
            || self.contracts_task.is_some()
            || self.payroll_task.is_some()
            || self.adjustments_task.is_some()
            || self.regimes_task.is_some()
            || self.adjustment_create_task.is_some()
            || self.regime_create_task.is_some()
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        self.error.clear();
        self.loading = true;
        self.needs_reload = false;
        self.employees_task = Some(api.list_employees_task(session));
        self.contracts_task = Some(api.list_contracts_task(session));
        self.payroll_task = Some(api.list_generic_collection_task(session, "payroll"));
        self.adjustments_task =
            Some(api.list_generic_collection_task(session, "insurance_adjustments"));
        self.regimes_task = Some(api.list_generic_collection_task(session, "insurance_regimes"));
    }

    fn push_error(&mut self, area: &str, error: String) {
        if !self.error.is_empty() {
            self.error.push('\n');
        }
        self.error.push_str(area);
        self.error.push_str(": ");
        self.error.push_str(&error);
    }

    fn poll(&mut self, ctx: &Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.reset();
            self.loaded_for = Some(session.user.id.clone());
            self.needs_reload = true;
        }
        if self.needs_reload && !self.has_pending_tasks() {
            self.request_reload(session, api);
        }

        if let Some(result) = self.employees_task.as_ref().and_then(ApiClient::poll) {
            self.employees_task = None;
            match result {
                Ok(response) => self.employees = response.data,
                Err(error) => self.push_error("Nhân sự", error),
            }
        }
        if let Some(result) = self.contracts_task.as_ref().and_then(ApiClient::poll) {
            self.contracts_task = None;
            match result {
                Ok(response) => self.contracts = response.data,
                Err(error) => self.push_error("Hợp đồng", error),
            }
        }
        if let Some(result) = self.payroll_task.as_ref().and_then(ApiClient::poll) {
            self.payroll_task = None;
            match result {
                Ok(response) => self.payroll = response.data,
                Err(error) => self.push_error("Bảng lương", error),
            }
        }
        if let Some(result) = self.adjustments_task.as_ref().and_then(ApiClient::poll) {
            self.adjustments_task = None;
            match result {
                Ok(response) => self.adjustments = response.data,
                Err(error) => self.push_error("Hồ sơ tăng giảm", error),
            }
        }
        if let Some(result) = self.regimes_task.as_ref().and_then(ApiClient::poll) {
            self.regimes_task = None;
            match result {
                Ok(response) => self.regimes = response.data,
                Err(error) => self.push_error("Hồ sơ chế độ", error),
            }
        }

        if let Some(result) = self
            .adjustment_create_task
            .as_ref()
            .and_then(ApiClient::poll)
        {
            self.adjustment_create_task = None;
            match result {
                Ok(_) => {
                    self.form_kind = None;
                    self.notice =
                        "Đã lưu hồ sơ tăng/giảm trên máy chủ. Hồ sơ chưa được gửi tới Cổng eBH."
                            .to_owned();
                    self.needs_reload = true;
                    self.error.clear();
                }
                Err(error) => self.push_error("Lưu hồ sơ tăng/giảm", error),
            }
        }
        if let Some(result) = self.regime_create_task.as_ref().and_then(ApiClient::poll) {
            self.regime_create_task = None;
            match result {
                Ok(_) => {
                    self.form_kind = None;
                    self.notice = "Đã lưu hồ sơ chế độ trên máy chủ; trạng thái chờ duyệt chỉ thuộc hệ thống nội bộ.".to_owned();
                    self.needs_reload = true;
                    self.error.clear();
                }
                Err(error) => self.push_error("Lưu hồ sơ chế độ", error),
            }
        }

        self.loading = self.has_pending_tasks();
        if self.loading {
            ctx.request_repaint_after(Duration::from_millis(80));
        }
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &Context,
        session: &Session,
        api: &ApiClient,
        route: &str,
    ) {
        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Chỉ quản trị viên mới được xem hồ sơ bảo hiểm và dữ liệu payroll.");
            return;
        }

        self.poll(ctx, session, api);
        let page = route.rsplit('/').next().unwrap_or_default();
        let page = if page == "insurance" || page.is_empty() {
            "overview"
        } else {
            page
        };

        let heading = match page {
            "adjustments" => "Hồ sơ tăng/giảm lao động",
            "regimes" => "Hồ sơ giải quyết chế độ BHXH",
            "labor" => "Quản lý lao động tham gia bảo hiểm",
            "card" => "Đổi số thẻ BHYT",
            "contributions" => "Theo dõi đóng BHXH",
            "expenses" => "Theo dõi chi BHXH",
            _ => "Bảo hiểm & Phúc lợi Xã hội",
        };
        if page == "overview" {
            ui.spacing_mut().item_spacing.y = 0.0;
            ui.add_space(8.0);
            if ui.ctx().input(|input| input.key_pressed(egui::Key::F5)) && !self.loading {
                self.request_reload(session, api);
            }
        } else {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    if page != "card" {
                        ui.label(
                            RichText::new("CHẾ ĐỘ PHÚC LỢI & AN SINH")
                                .size(11.0)
                                .strong()
                                .color(Color32::from_rgb(0, 150, 136)),
                        );
                        ui.heading(heading);
                        ui.label(
                        "Dữ liệu lấy từ hồ sơ nhân sự, hợp đồng và payroll đã lưu trên máy chủ.",
                    );
                    } else {
                        ui.label(
                            RichText::new(heading)
                                .size(20.0)
                                .color(Color32::from_rgb(15, 23, 42)),
                        );
                        ui.label(
                        RichText::new(
                            "Tra cứu số sổ BHXH, mã thẻ BHYT và thông tin khám chữa bệnh ban đầu.",
                        )
                        .size(13.0)
                        .color(Color32::from_rgb(100, 116, 139)),
                    );
                    }
                });
                if page != "card" {
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui
                            .add_enabled(!self.loading, egui::Button::new("Làm mới"))
                            .clicked()
                        {
                            self.request_reload(session, api);
                        }
                    });
                }
            });
        }

        if !self.error.is_empty() {
            ui.add_space(8.0);
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
        }
        if !self.notice.is_empty() {
            ui.add_space(6.0);
            ui.colored_label(Color32::from_rgb(21, 128, 61), &self.notice);
        }
        if self.loading {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label(
                    if self.adjustment_create_task.is_some() || self.regime_create_task.is_some() {
                        "Đang lưu hồ sơ bảo hiểm…"
                    } else {
                        "Đang tải dữ liệu bảo hiểm…"
                    },
                );
            });
        }

        ui.add_space(12.0);
        match page {
            "overview" => {
                let more_rect = egui::Rect::from_min_size(
                    egui::pos2(ui.max_rect().right() - 28.0, ui.cursor().top() + 2.0),
                    egui::vec2(24.0, 24.0),
                );
                self.render_overview(ui);
                let mut more_ui = ui.new_child(
                    egui::UiBuilder::new()
                        .id_salt("insurance.overview.actions")
                        .max_rect(more_rect),
                );
                more_ui.spacing_mut().button_padding = egui::vec2(4.0, 2.0);
                more_ui.menu_button("…", |ui| {
                    if ui
                        .add_enabled(!self.loading, egui::Button::new("Làm mới (F5)"))
                        .clicked()
                    {
                        self.request_reload(session, api);
                        ui.close_menu();
                    }
                });
            }
            "labor" => self.render_labor(ui),
            "card" => self.render_card(ui),
            "adjustments" => self.render_adjustments(ui),
            "regimes" => self.render_regimes(ui),
            "expenses" => self.render_expenses(ui),
            "contributions" => self.render_contributions(ui),
            "voluntary" => render_voluntary_empty_state(ui),
            _ => render_not_migrated(ui, page),
        }
        if page == "card" {
            self.render_card_detail(ctx);
        }
        self.render_form(ctx, session, api);
    }

    fn labor_rows(&self) -> Vec<InsuranceLaborRow<'_>> {
        derive_labor_rows(&self.employees, &self.contracts)
    }

    fn contributions(&self) -> Vec<ContributionSummary> {
        summarize_contributions(&self.payroll)
    }

    fn render_overview(&self, ui: &mut Ui) {
        let labor = self.labor_rows();
        let contributions = self.contributions();
        let current = contributions.first();
        let active_insurance_contracts = self
            .contracts
            .iter()
            .filter(|contract| {
                contract
                    .insurance_type
                    .as_deref()
                    .is_some_and(|value| !value.trim().is_empty())
                    && contract.status != "Đã hết hạn"
            })
            .count();
        let missing_salary = labor.iter().filter(|row| row.salary_base == 0).count();
        let pending_claims = self
            .regimes
            .iter()
            .filter(|row| string_field(row, "approvalStatus") != "Đã giải ngân")
            .count();
        let has_data = !labor.is_empty()
            || !self.contracts.is_empty()
            || !contributions.is_empty()
            || !self.regimes.is_empty();

        let contracts_detail =
            format!("{active_insurance_contracts} hợp đồng có khai báo loại bảo hiểm");
        let period_detail = current.map_or_else(
            || "Chưa có dữ liệu payroll để tính kỳ đóng bảo hiểm".to_owned(),
            |item| format!("{} · theo tỷ lệ cấu hình legacy 32%", item.period),
        );
        let missing_detail =
            format!("{missing_salary} nhân sự chưa có mức lương đóng hoặc dữ liệu chưa đủ");
        crate::widgets::metrics_with_padding(
            ui,
            "insurance.metrics",
            &[
                crate::widgets::Metric {
                    label: "Lao động tham gia BHXH bắt buộc",
                    value: format!("{} nhân sự", labor.len()),
                    detail: &contracts_detail,
                    color: crate::theme::PRIMARY,
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Kỳ đóng BHXH hiện tại",
                    value: format!(
                        "{} ₫",
                        format_vnd(current.map_or(0, |item| item.total_payable))
                    ),
                    detail: &period_detail,
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Hồ sơ hưởng chế độ đang xử lý",
                    value: format!("{pending_claims} hồ sơ"),
                    detail: "Đếm hồ sơ trong dữ liệu hiện tại; chưa đồng bộ cơ quan BHXH",
                    color: Color32::from_rgb(217, 119, 6),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Đối soát Thông báo Mẫu C12-TS",
                    value: current
                        .map_or("Chưa có dữ liệu", |item| item.c12_status)
                        .to_owned(),
                    detail: &missing_detail,
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 24.0,
                },
            ],
            egui::vec2(16.0, 16.0),
        );

        ui.add_space(16.0);
        let rates = |ui: &mut Ui| {
            egui::Frame::none()
                .fill(Color32::WHITE)
                .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                .rounding(8.0)
                .inner_margin(18.0)
                .show(ui, |ui| {
                    ui.label(RichText::new("Cơ Cấu Tỷ Lệ Đóng BHXH - BHYT - BHTN Năm 2026 (Tổng 32%)").size(15.0).strong());
                    ui.add_space(10.0);
                    rate_row(
                        ui,
                        "1. Bảo hiểm xã hội (hưu trí, tử tuất, ốm đau, thai sản)",
                        "25,5% (DN: 17,5% · NLĐ: 8%)",
                        0.796,
                        Color32::from_rgb(0, 150, 136),
                    );
                    rate_row(
                        ui,
                        "2. Bảo hiểm y tế",
                        "4,5% (DN: 3% · NLĐ: 1,5%)",
                        0.14,
                        Color32::from_rgb(37, 99, 235),
                    );
                    rate_row(
                        ui,
                        "3. Bảo hiểm thất nghiệp",
                        "2% (DN: 1% · NLĐ: 1%)",
                        0.064,
                        Color32::from_rgb(124, 58, 237),
                    );
                    ui.add_space(8.0);
                    let note = if has_data {
                        "Tổng quan phản ánh dữ liệu hiện có từ nhân sự, hợp đồng và payroll."
                    } else {
                        "Chưa có dữ liệu bảo hiểm. Khi có hồ sơ nhân sự, hợp đồng và payroll, hệ thống sẽ tổng hợp tại đây."
                    };
                    info_panel(ui, note);
                    ui.add_space(6.0);
                    ui.small("Tỷ lệ được giữ theo cấu hình legacy; cần xác nhận chính sách và ngoại lệ trước khi dùng để quyết toán.");
                });
        };
        let schedule = |ui: &mut Ui| {
            egui::Frame::none()
                .fill(Color32::WHITE)
                .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                .rounding(8.0)
                .inner_margin(18.0)
                .show(ui, |ui| {
                    ui.label(RichText::new("Lịch Trình Đối Soát & Nộp BHXH").size(15.0).strong());
                    ui.add_space(10.0);
                    schedule_item(
                        ui,
                        "Kỳ đang theo dõi",
                        current.map_or("Chưa xác định kỳ", |item| item.period.as_str()),
                        Color32::from_rgb(220, 38, 38),
                    );
                    schedule_item(
                        ui,
                        "Hồ sơ tăng giảm đang có",
                        &format!("{} bản ghi điều chỉnh", self.adjustments.len()),
                        Color32::from_rgb(37, 99, 235),
                    );
                    schedule_item(
                        ui,
                        "Chi phí BHXH còn chờ đối soát",
                        &format!("{} ₫", format_vnd(current.map_or(0, |item| item.balance_owed))),
                        Color32::from_rgb(22, 163, 74),
                    );
                    ui.add_space(10.0);
                    ui.add_enabled(
                        false,
                        egui::Button::new("Xuất Báo Cáo Đối Soát C12 · chưa có tệp xuất"),
                    );
                    ui.small("Chưa kết nối Cổng eBH/VssID; các trạng thái và số dư ở đây không xác nhận đã nộp hoặc đã được BHXH duyệt.");
                });
        };
        if ui.ctx().screen_rect().width() <= 992.0 {
            rates(ui);
            ui.add_space(16.0);
            schedule(ui);
        } else {
            let width = ui.available_width();
            ui.horizontal_top(|ui| {
                ui.spacing_mut().item_spacing.x = 16.0;
                ui.allocate_ui(egui::vec2((width - 16.0) * 1.4 / 2.4, 0.0), rates);
                ui.allocate_ui(egui::vec2((width - 16.0) / 2.4, 0.0), schedule);
            });
        }
    }

    fn render_labor(&mut self, ui: &mut Ui) {
        let rows = self.labor_rows();
        let pages = rows.len().div_ceil(PAGE_SIZE).max(1);
        let mut page = self.labor_page.clamp(1, pages);
        ui.horizontal(|ui| {
            ui.label(format!("{} nhân sự", rows.len()));
            ui.separator();
            if ui
                .add_enabled(page > 1, egui::Button::new("‹ Trước"))
                .clicked()
            {
                page -= 1;
            }
            ui.label(format!("Trang {page} / {pages}"));
            if ui
                .add_enabled(page < pages, egui::Button::new("Tiếp ›"))
                .clicked()
            {
                page = (page + 1).min(pages);
            }
        });
        ui.add_space(8.0);
        egui::Frame::none()
            .fill(Color32::WHITE)
            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
            .rounding(8.0)
            .inner_margin(12.0)
            .show(ui, |ui| {
                egui::ScrollArea::horizontal().show(ui, |ui| {
                    egui::Grid::new("insurance_labor_grid")
                        .striped(true)
                        .min_col_width(112.0)
                        .spacing(Vec2::new(14.0, 10.0))
                        .show(ui, |ui| {
                            for label in [
                                "Mã NV & Họ tên",
                                "Số Sổ BHXH & Mã BHYT",
                                "Mức lương đóng BHXH",
                                "Cơ sở KCB Ban đầu",
                                "Ngày bắt đầu",
                                "Trạng thái",
                            ] {
                                ui.label(RichText::new(label).strong());
                            }
                            ui.end_row();

                            let start = (page - 1) * PAGE_SIZE;
                            let end = (start + PAGE_SIZE).min(rows.len());
                            for row in rows.get(start..end).unwrap_or_default() {
                                ui.vertical(|ui| {
                                    ui.label(RichText::new(&row.employee.name).strong());
                                    ui.small(format!(
                                        "{} · {}",
                                        row.employee.code, row.employee.department
                                    ));
                                });
                                ui.vertical(|ui| {
                                    ui.label("");
                                    ui.small("BHYT: ");
                                });
                                ui.label(format!("{} ₫", format_vnd(row.salary_base)));
                                ui.label("");
                                ui.label(&row.employee.join_date);
                                ui.label(RichText::new(row.status).color(
                                    if row.status == "Đang tham gia" {
                                        Color32::from_rgb(22, 163, 74)
                                    } else {
                                        Color32::from_rgb(217, 119, 6)
                                    },
                                ));
                                ui.end_row();
                            }
                            if rows.is_empty() {
                                ui.label(
                                    "Chưa có nhân sự tham gia bảo hiểm trong dữ liệu máy chủ.",
                                );
                                ui.end_row();
                            }
                        });
                });
            });
        self.labor_page = page;
    }

    fn render_card(&mut self, ui: &mut Ui) {
        let rows = self.labor_rows();
        let pages = rows.len().div_ceil(PAGE_SIZE).max(1);
        let mut page = self.card_page.clamp(1, pages);
        draw_pager(ui, &mut page, pages, rows.len());
        ui.add_space(8.0);

        let mut selected = None;
        egui::Frame::none()
            .fill(Color32::WHITE)
            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
            .rounding(8.0)
            .inner_margin(12.0)
            .show(ui, |ui| {
                egui::ScrollArea::horizontal().show(ui, |ui| {
                    egui::Grid::new("insurance_card_grid")
                        .striped(true)
                        .min_col_width(100.0)
                        .spacing(Vec2::new(13.0, 10.0))
                        .show(ui, |ui| {
                            for label in [
                                "Người lao động",
                                "Số sổ BHXH",
                                "Mã thẻ BHYT",
                                "Cơ sở KCB ban đầu",
                                "Trạng thái",
                                "Chi tiết",
                            ] {
                                ui.label(RichText::new(label).strong());
                            }
                            ui.end_row();

                            let start = (page - 1) * PAGE_SIZE;
                            for row in rows.iter().skip(start).take(PAGE_SIZE) {
                                ui.vertical(|ui| {
                                    ui.label(RichText::new(&row.employee.name).strong());
                                    ui.small(format!(
                                        "{} · {}",
                                        row.employee.code, row.employee.department
                                    ));
                                });
                                // Legacy maps all three fields to empty strings because the
                                // employee API does not supply insurance identifiers or clinic.
                                ui.label("");
                                ui.label("");
                                ui.label("");
                                ui.label(RichText::new(row.status).color(
                                    if row.status == "Đang tham gia" {
                                        Color32::from_rgb(22, 163, 74)
                                    } else {
                                        Color32::from_rgb(37, 99, 235)
                                    },
                                ));
                                if ui.button("Xem").clicked() {
                                    selected = Some(row.employee.id.clone());
                                }
                                ui.end_row();
                            }
                            if rows.is_empty() {
                                ui.label(
                                    "Chưa có nhân sự tham gia bảo hiểm trong dữ liệu máy chủ.",
                                );
                                ui.end_row();
                            }
                        });
                });
            });

        if let Some(employee_id) = selected {
            self.card_detail_employee = Some(employee_id);
        }
        self.card_page = page;
        ui.add_space(6.0);
        ui.small("Số sổ, mã thẻ và cơ sở KCB chưa được cung cấp bởi API nhân sự hiện tại; các ô trống không xác nhận tình trạng tại BHXH.");
    }

    fn render_card_detail(&mut self, ctx: &Context) {
        let Some(employee_id) = self.card_detail_employee.as_deref() else {
            return;
        };
        let Some(row) = self
            .labor_rows()
            .into_iter()
            .find(|row| row.employee.id == employee_id)
        else {
            self.card_detail_employee = None;
            return;
        };
        let employee = row.employee.clone();
        let salary_base = row.salary_base;
        let status = row.status;
        let mut open = true;
        let width = ctx.available_rect().width().min(600.0).max(280.0);
        egui::Window::new("Trích Lục Thông Tin Sổ BHXH & Thẻ BHYT Điện Tử (VssID)")
            .id(egui::Id::new("insurance_card_detail_window"))
            .anchor(egui::Align2::RIGHT_TOP, Vec2::new(-12.0, 56.0))
            .open(&mut open)
            .resizable(true)
            .collapsible(false)
            .default_width(width)
            .show(ctx, |ui| {
                egui::Frame::none()
                    .fill(Color32::from_rgb(248, 250, 252))
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                    .rounding(8.0)
                    .inner_margin(16.0)
                    .show(ui, |ui| {
                        ui.horizontal(|ui| {
                            ui.vertical(|ui| {
                                ui.label(RichText::new(&employee.name).size(16.0).strong());
                                ui.small(format!("{} · {}", employee.code, employee.position));
                            });
                            ui.with_layout(
                                egui::Layout::right_to_left(egui::Align::Center),
                                |ui| {
                                    ui.label(RichText::new(status).color(
                                        if status == "Đang tham gia" {
                                            Color32::from_rgb(22, 163, 74)
                                        } else {
                                            Color32::from_rgb(37, 99, 235)
                                        },
                                    ));
                                },
                            );
                        });
                    });

                ui.add_space(10.0);
                egui::Frame::none()
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                    .rounding(8.0)
                    .inner_margin(14.0)
                    .show(ui, |ui| {
                        ui.label(
                            RichText::new("Mã Số Định Danh Bảo Hiểm:")
                                .strong()
                                .color(Color32::from_rgb(15, 23, 42)),
                        );
                        ui.add_space(10.0);
                        ui.columns(2, |columns| {
                            columns[0].vertical(|ui| {
                                insurance_detail_field(
                                    ui,
                                    "Số sổ BHXH (10 số):",
                                    "",
                                    Color32::from_rgb(37, 99, 235),
                                );
                                ui.add_space(10.0);
                                insurance_detail_field(
                                    ui,
                                    "Mức lương trích đóng:",
                                    &format!("{} ₫", format_vnd(salary_base)),
                                    Color32::from_rgb(22, 163, 74),
                                );
                            });
                            columns[1].vertical(|ui| {
                                insurance_detail_field(
                                    ui,
                                    "Mã thẻ BHYT (15 ký tự):",
                                    "",
                                    Color32::from_rgb(15, 23, 42),
                                );
                                ui.add_space(10.0);
                                insurance_detail_field(
                                    ui,
                                    "Ngày tham gia tại công ty:",
                                    &employee.join_date,
                                    Color32::from_rgb(15, 23, 42),
                                );
                            });
                        });
                    });

                ui.add_space(12.0);
                egui::Frame::none()
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                    .rounding(8.0)
                    .inner_margin(14.0)
                    .show(ui, |ui| {
                        ui.label(
                            RichText::new("Cơ sở khám chữa bệnh ban đầu (KCB):")
                                .strong()
                                .color(Color32::from_rgb(15, 23, 42)),
                        );
                        ui.add_space(6.0);
                        ui.label(RichText::new("").color(Color32::from_rgb(30, 64, 175)));
                    });
                ui.add_space(12.0);
                ui.horizontal(|ui| {
                    ui.add_enabled(false, egui::Button::new("In Tờ Rời BHXH"));
                    ui.add_enabled(false, egui::Button::new("Tra cứu quá trình VssID"));
                });
                ui.small("API nhân sự chưa cung cấp mã BHXH/BHYT hoặc cơ sở KCB. Chưa kết nối VssID và chưa có tệp trích lục để in.");
            });
        if !open {
            self.card_detail_employee = None;
        }
    }

    fn render_contributions(&self, ui: &mut Ui) {
        let rows = self.contributions();
        egui::Frame::none()
            .fill(Color32::WHITE)
            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
            .rounding(8.0)
            .inner_margin(12.0)
            .show(ui, |ui| {
                egui::ScrollArea::horizontal().show(ui, |ui| {
                    egui::Grid::new("insurance_contributions_grid")
                        .striped(true)
                        .min_col_width(96.0)
                        .spacing(Vec2::new(12.0, 10.0))
                        .show(ui, |ui| {
                            for label in [
                                "Kỳ đối soát",
                                "Lao động",
                                "Tổng quỹ lương đóng",
                                "BHXH (25,5%)",
                                "BHYT (4,5%)",
                                "BHTN (2%)",
                                "Tổng phải nộp (32%)",
                                "Tình trạng C12",
                            ] {
                                ui.label(RichText::new(label).strong());
                            }
                            ui.end_row();
                            for row in &rows {
                                ui.label(RichText::new(&row.period).strong());
                                ui.label(format!("{} người", row.headcount));
                                ui.label(format!("{} ₫", format_vnd(row.total_salary_fund)));
                                ui.label(format!("{} ₫", format_vnd(row.social_insurance)));
                                ui.label(format!("{} ₫", format_vnd(row.health_insurance)));
                                ui.label(format!("{} ₫", format_vnd(row.unemployment_insurance)));
                                ui.label(
                                    RichText::new(format!("{} ₫", format_vnd(row.total_payable)))
                                        .strong(),
                                );
                                ui.label(row.c12_status);
                                ui.end_row();
                            }
                            if rows.is_empty() {
                                ui.label("Chưa có dữ liệu payroll để đối soát.");
                                ui.end_row();
                            }
                        });
                });
            });
        ui.add_space(8.0);
        ui.small("Đây là phép tổng hợp theo tỷ lệ legacy trên payroll đã lưu, không phải xác nhận số tiền đã nộp hoặc kết quả đối soát của cơ quan BHXH.");
    }

    fn render_adjustments(&mut self, ui: &mut Ui) {
        ui.horizontal(|ui| {
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if ui.button("＋ Lập hồ sơ tăng/giảm").clicked() {
                    self.adjustment_draft = AdjustmentDraft::new(self.adjustments.len());
                    self.form_kind = Some(InsuranceFormKind::Adjustment);
                    self.error.clear();
                }
            });
        });
        ui.add_space(8.0);
        let pages = self.adjustments.len().div_ceil(PAGE_SIZE).max(1);
        self.adjustment_page = self.adjustment_page.clamp(1, pages);
        draw_pager(ui, &mut self.adjustment_page, pages, self.adjustments.len());
        egui::Frame::none()
            .fill(Color32::WHITE)
            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
            .rounding(8.0)
            .inner_margin(12.0)
            .show(ui, |ui| {
                egui::ScrollArea::horizontal().show(ui, |ui| {
                    egui::Grid::new("insurance_adjustments_grid")
                        .striped(true)
                        .min_col_width(100.0)
                        .spacing(Vec2::new(12.0, 9.0))
                        .show(ui, |ui| {
                            for label in [
                                "Mã hồ sơ D02-LT",
                                "Nhân viên & mã",
                                "Loại điều chỉnh",
                                "Lương cũ → mới",
                                "Kỳ áp dụng · ngày nộp",
                                "Trạng thái Cổng eBH",
                            ] {
                                ui.label(RichText::new(label).strong());
                            }
                            ui.end_row();
                            let start = (self.adjustment_page - 1) * PAGE_SIZE;
                            for row in self.adjustments.iter().skip(start).take(PAGE_SIZE) {
                                ui.label(
                                    RichText::new(string_field(row, "d02Code"))
                                        .strong()
                                        .color(Color32::from_rgb(0, 150, 136)),
                                );
                                ui.vertical(|ui| {
                                    ui.label(string_field(row, "empName"));
                                    ui.small(string_field(row, "empCode"));
                                });
                                ui.label(string_field(row, "adjustType"));
                                ui.label(format!(
                                    "{} → {} ₫",
                                    format_vnd(unsigned_field(row, "oldSalary")),
                                    format_vnd(unsigned_field(row, "newSalary"))
                                ));
                                ui.vertical(|ui| {
                                    ui.label(string_field(row, "effectiveMonth"));
                                    ui.small(string_field(row, "filingDate"));
                                });
                                ui.label(string_field(row, "vssSubmissionStatus"));
                                ui.end_row();
                            }
                            if self.adjustments.is_empty() {
                                ui.label("Chưa có hồ sơ tăng/giảm được lưu trên máy chủ.");
                                ui.end_row();
                            }
                        });
                });
            });
        ui.add_space(6.0);
        ui.small("Hồ sơ mới được lưu nội bộ. Tích hợp gửi/nhận trạng thái với Cổng eBH chưa được cấu hình.");
    }

    fn render_regimes(&mut self, ui: &mut Ui) {
        ui.horizontal(|ui| {
            ui.label(format!("{} hồ sơ", self.regimes.len()));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if ui.button("＋ Lập hồ sơ chế độ").clicked() {
                    self.regime_draft = RegimeDraft::new(self.regimes.len());
                    self.form_kind = Some(InsuranceFormKind::Regime);
                    self.error.clear();
                }
            });
        });
        ui.add_space(8.0);
        let pages = self.regimes.len().div_ceil(PAGE_SIZE).max(1);
        self.regime_page = self.regime_page.clamp(1, pages);
        draw_pager(ui, &mut self.regime_page, pages, self.regimes.len());
        egui::Frame::none()
            .fill(Color32::WHITE)
            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
            .rounding(8.0)
            .inner_margin(12.0)
            .show(ui, |ui| {
                egui::ScrollArea::horizontal().show(ui, |ui| {
                    egui::Grid::new("insurance_regimes_grid")
                        .striped(true)
                        .min_col_width(100.0)
                        .spacing(Vec2::new(12.0, 9.0))
                        .show(ui, |ui| {
                            for label in [
                                "Mã hồ sơ",
                                "Người hưởng",
                                "Loại chế độ",
                                "Thời gian hưởng",
                                "Số tiền đề nghị",
                                "Tài khoản nhận",
                                "Tình trạng nội bộ",
                            ] {
                                ui.label(RichText::new(label).strong());
                            }
                            ui.end_row();
                            let start = (self.regime_page - 1) * PAGE_SIZE;
                            for row in self.regimes.iter().skip(start).take(PAGE_SIZE) {
                                ui.label(
                                    RichText::new(string_field(row, "claimCode"))
                                        .strong()
                                        .color(Color32::from_rgb(0, 150, 136)),
                                );
                                ui.label(string_field(row, "empName"));
                                ui.label(string_field(row, "regimeType"));
                                ui.label(format!("{} ngày", unsigned_field(row, "leaveDays")));
                                ui.label(format!(
                                    "{} ₫",
                                    format_vnd(unsigned_field(row, "calculatedAmount"))
                                ));
                                ui.label(string_field(row, "bankAccount"));
                                ui.label(string_field(row, "approvalStatus"));
                                ui.end_row();
                            }
                            if self.regimes.is_empty() {
                                ui.label("Chưa có hồ sơ chế độ được lưu trên máy chủ.");
                                ui.end_row();
                            }
                        });
                });
            });
        ui.add_space(6.0);
        ui.small("Trạng thái giải quyết là trạng thái nội bộ; chưa đồng bộ hoặc xác nhận chi trả từ cơ quan BHXH.");
    }

    fn render_expenses(&self, ui: &mut Ui) {
        egui::Frame::none()
            .fill(Color32::WHITE)
            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
            .rounding(8.0)
            .inner_margin(12.0)
            .show(ui, |ui| {
                egui::ScrollArea::horizontal().show(ui, |ui| {
                    egui::Grid::new("insurance_expenses_grid")
                        .striped(true)
                        .min_col_width(110.0)
                        .spacing(Vec2::new(12.0, 9.0))
                        .show(ui, |ui| {
                            for label in [
                                "Mã hồ sơ",
                                "Người hưởng",
                                "Chế độ",
                                "Số tiền",
                                "Ngày giải quyết",
                                "Tình trạng",
                            ] {
                                ui.label(RichText::new(label).strong());
                            }
                            ui.end_row();
                            for row in &self.regimes {
                                ui.label(string_field(row, "claimCode"));
                                ui.label(string_field(row, "empName"));
                                ui.label(string_field(row, "regimeType"));
                                ui.label(format!(
                                    "{} ₫",
                                    format_vnd(unsigned_field(row, "calculatedAmount"))
                                ));
                                ui.label(string_field(row, "settlementDate"));
                                ui.label(string_field(row, "approvalStatus"));
                                ui.end_row();
                            }
                            if self.regimes.is_empty() {
                                ui.label("Chưa có hồ sơ chi BHXH được lưu trên máy chủ.");
                                ui.end_row();
                            }
                        });
                });
            });
        ui.add_space(6.0);
        ui.small("Màn hình chỉ phản ánh đề nghị và trạng thái đã lưu; không xác nhận giao dịch chi trả thực tế.");
    }

    fn render_form(&mut self, ctx: &Context, session: &Session, api: &ApiClient) {
        let Some(kind) = self.form_kind else { return };
        let mut open = true;
        let mut submit = false;
        let mut cancel = false;
        let busy = self.adjustment_create_task.is_some() || self.regime_create_task.is_some();
        let title = match kind {
            InsuranceFormKind::Adjustment => "Lập Hồ Sơ Tăng/Giảm Lao Động (Mẫu D02-LT)",
            InsuranceFormKind::Regime => "Lập Hồ Sơ Đề Nghị Hưởng Chế Độ BHXH",
        };
        egui::Window::new(title)
            .open(&mut open)
            .resizable(true)
            .collapsible(false)
            .default_width(600.0)
            .show(ctx, |ui| {
                egui::ScrollArea::vertical()
                    .max_height(540.0)
                    .show(ui, |ui| match kind {
                        InsuranceFormKind::Adjustment => {
                            let draft = &mut self.adjustment_draft;
                            form_text(ui, "Mã hồ sơ D02", &mut draft.code);
                            ui.horizontal(|ui| {
                                ui.label("Loại điều chỉnh");
                                egui::ComboBox::from_id_salt("insurance_adjust_type")
                                    .selected_text(&draft.adjust_type)
                                    .show_ui(ui, |ui| {
                                        for value in ADJUSTMENT_TYPES {
                                            ui.selectable_value(
                                                &mut draft.adjust_type,
                                                value.to_owned(),
                                                value,
                                            );
                                        }
                                    });
                            });
                            form_text(ui, "Họ và tên nhân viên", &mut draft.employee_name);
                            form_text(ui, "Mã nhân viên", &mut draft.employee_code);
                            form_text(
                                ui,
                                "Mức lương đóng cũ (VNĐ; có thể bỏ trống)",
                                &mut draft.old_salary,
                            );
                            form_text(ui, "Mức lương đóng mới (VNĐ)", &mut draft.new_salary);
                            form_text(ui, "Tháng áp dụng", &mut draft.effective_month);
                            form_text(ui, "Ngày nộp hồ sơ (YYYY-MM-DD)", &mut draft.filing_date);
                        }
                        InsuranceFormKind::Regime => {
                            let draft = &mut self.regime_draft;
                            form_text(ui, "Mã hồ sơ chế độ", &mut draft.code);
                            ui.horizontal(|ui| {
                                ui.label("Loại chế độ");
                                egui::ComboBox::from_id_salt("insurance_regime_type")
                                    .selected_text(&draft.regime_type)
                                    .show_ui(ui, |ui| {
                                        for value in REGIME_TYPES {
                                            ui.selectable_value(
                                                &mut draft.regime_type,
                                                value.to_owned(),
                                                value,
                                            );
                                        }
                                    });
                            });
                            form_text(ui, "Họ tên người hưởng", &mut draft.employee_name);
                            form_text(ui, "Số ngày nghỉ hưởng trợ cấp", &mut draft.leave_days);
                            form_text(
                                ui,
                                "Số tiền đề nghị BHXH chi trả (VNĐ)",
                                &mut draft.calculated_amount,
                            );
                            form_text(ui, "Tài khoản nhận trợ cấp", &mut draft.bank_account);
                        }
                    });
                ui.add_space(8.0);
                ui.horizontal(|ui| {
                    ui.small("Lưu nội bộ · chưa gửi Cổng eBH");
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui
                            .add_enabled(!busy, egui::Button::new("Lưu hồ sơ"))
                            .clicked()
                        {
                            submit = true;
                        }
                        if ui.add_enabled(!busy, egui::Button::new("Hủy")).clicked() {
                            cancel = true;
                        }
                    });
                });
            });
        if !open {
            self.form_kind = None;
        }
        if cancel {
            self.form_kind = None;
        }
        if submit {
            self.submit_form(kind, session, api);
        }
    }

    fn submit_form(&mut self, kind: InsuranceFormKind, session: &Session, api: &ApiClient) {
        let (scope, record) = match kind {
            InsuranceFormKind::Adjustment => match self.adjustment_draft.build(&self.adjustments) {
                Ok(record) => ("insurance_adjustments", record),
                Err(error) => {
                    self.error = error;
                    return;
                }
            },
            InsuranceFormKind::Regime => match self.regime_draft.build(&self.regimes) {
                Ok(record) => ("insurance_regimes", record),
                Err(error) => {
                    self.error = error;
                    return;
                }
            },
        };
        self.error.clear();
        self.notice.clear();
        let task = api.create_generic_collection_record_task(session, scope, &record, None);
        match kind {
            InsuranceFormKind::Adjustment => self.adjustment_create_task = Some(task),
            InsuranceFormKind::Regime => self.regime_create_task = Some(task),
        }
    }
}

fn draw_pager(ui: &mut Ui, page: &mut usize, pages: usize, total: usize) {
    ui.horizontal(|ui| {
        ui.label(format!("{total} hồ sơ"));
        ui.separator();
        if ui
            .add_enabled(*page > 1, egui::Button::new("‹ Trước"))
            .clicked()
        {
            *page -= 1;
        }
        ui.label(format!("Trang {} / {pages}", *page));
        if ui
            .add_enabled(*page < pages, egui::Button::new("Tiếp ›"))
            .clicked()
        {
            *page = (*page + 1).min(pages);
        }
    });
}

fn form_text(ui: &mut Ui, label: &str, value: &mut String) {
    ui.horizontal(|ui| {
        ui.label(label);
        ui.text_edit_singleline(value);
    });
}

fn insurance_detail_field(ui: &mut Ui, label: &str, value: &str, color: Color32) {
    ui.vertical(|ui| {
        ui.label(
            RichText::new(label)
                .size(12.5)
                .color(Color32::from_rgb(100, 116, 139)),
        );
        ui.label(RichText::new(value).strong().color(color));
    });
}

struct InsuranceLaborRow<'a> {
    employee: &'a Employee,
    salary_base: u64,
    status: &'static str,
}

fn derive_labor_rows<'a>(
    employees: &'a [Employee],
    contracts: &[crate::api::ContractSummary],
) -> Vec<InsuranceLaborRow<'a>> {
    let contracts_by_employee = contracts
        .iter()
        .filter(|contract| !contract.employee_code.trim().is_empty())
        .map(|contract| (contract.employee_code.as_str(), contract))
        .collect::<std::collections::HashMap<_, _>>();

    employees
        .iter()
        .filter(|employee| employee.status != "Đã nghỉ việc")
        .map(|employee| {
            let contract = contracts_by_employee.get(employee.code.as_str()).copied();
            InsuranceLaborRow {
                employee,
                salary_base: employee.salary_base.max(0) as u64,
                status: if contract.is_some_and(|contract| contract.status == "Đã hết hạn") {
                    "Tạm hoãn"
                } else {
                    "Đang tham gia"
                },
            }
        })
        .collect()
}

fn summarize_contributions(payroll: &[Value]) -> Vec<ContributionSummary> {
    let mut groups = BTreeMap::<String, Vec<&Value>>::new();
    for row in payroll {
        let period = row
            .get("month")
            .and_then(value_as_text)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("Chưa rõ kỳ")
            .to_owned();
        groups.entry(period).or_default().push(row);
    }

    let mut summaries = groups
        .into_iter()
        .map(|(period, rows)| {
            let total_salary_fund = rows.iter().fold(0_u64, |total, row| {
                total.saturating_add(unsigned_field(row, "baseSalary"))
            });
            let social_insurance = rounded_rate(total_salary_fund, 255);
            let health_insurance = rounded_rate(total_salary_fund, 45);
            let unemployment_insurance = rounded_rate(total_salary_fund, 20);
            let total_payable = rounded_rate(total_salary_fund, 320);
            let all_paid = rows
                .iter()
                .all(|row| string_field(row, "status") == "Đã chi trả");
            let paid_amount = if all_paid { total_payable } else { 0 };
            ContributionSummary {
                period,
                headcount: rows.len(),
                total_salary_fund,
                social_insurance,
                health_insurance,
                unemployment_insurance,
                total_payable,
                paid_amount,
                balance_owed: total_payable.saturating_sub(paid_amount),
                c12_status: if all_paid {
                    "Khớp đúng 100%"
                } else {
                    "Đang đối soát"
                },
            }
        })
        .collect::<Vec<_>>();
    summaries.sort_by(|left, right| right.period.cmp(&left.period));
    summaries
}

fn rounded_rate(amount: u64, per_thousand: u64) -> u64 {
    ((u128::from(amount) * u128::from(per_thousand) + 500) / 1000).min(u128::from(u64::MAX)) as u64
}

fn unsigned_field(record: &Value, key: &str) -> u64 {
    match record.get(key) {
        Some(Value::Number(number)) => number
            .as_u64()
            .or_else(|| number.as_i64().and_then(|value| u64::try_from(value).ok()))
            .unwrap_or(0),
        Some(Value::String(value)) => value.trim().parse::<u64>().unwrap_or(0),
        _ => 0,
    }
}

fn value_as_text(value: &Value) -> Option<&str> {
    match value {
        Value::String(value) => Some(value.as_str()),
        _ => None,
    }
}

fn string_field<'a>(record: &'a Value, key: &str) -> &'a str {
    record.get(key).and_then(Value::as_str).unwrap_or_default()
}

fn rate_row(ui: &mut Ui, title: &str, rate: &str, portion: f32, color: Color32) {
    egui::Frame::none()
        .fill(Color32::from_rgb(248, 250, 252))
        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
        .rounding(6.0)
        .inner_margin(10.0)
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new(title)
                        .strong()
                        .color(Color32::from_rgb(15, 23, 42)),
                );
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(RichText::new(rate).strong().color(color));
                });
            });
            ui.add_space(3.0);
            ui.add(
                egui::ProgressBar::new(portion)
                    .desired_height(7.0)
                    .fill(color),
            );
        });
    ui.add_space(7.0);
}

fn info_panel(ui: &mut Ui, message: &str) {
    egui::Frame::none()
        .fill(Color32::from_rgb(239, 246, 255))
        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(191, 219, 254)))
        .rounding(6.0)
        .inner_margin(10.0)
        .show(ui, |ui| {
            ui.label(RichText::new(message).color(Color32::from_rgb(30, 64, 175)));
        });
}

fn schedule_item(ui: &mut Ui, title: &str, value: &str, color: Color32) {
    egui::Frame::none()
        .fill(Color32::from_rgb(248, 250, 252))
        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
        .rounding(6.0)
        .inner_margin(10.0)
        .show(ui, |ui| {
            ui.label(RichText::new(title).strong());
            ui.label(RichText::new(value).strong().color(color));
        });
    ui.add_space(7.0);
}

fn render_voluntary_empty_state(ui: &mut Ui) {
    egui::Frame::group(ui.style()).show(ui, |ui| {
        ui.heading("BHXH tự nguyện");
        ui.label("Danh sách người tham gia BHXH tự nguyện được quản lý tách biệt với lao động bắt buộc.");
        ui.add_space(8.0);
        info_panel(
            ui,
            "Chưa có hồ sơ BHXH tự nguyện. Chỉ hiển thị khi có bản ghi từ nguồn dữ liệu được kết nối.",
        );
    });
}

fn render_not_migrated(ui: &mut Ui, page: &str) {
    ui.heading("Màn hình đang được migration");
    ui.label(format!(
        "Trang bảo hiểm '{page}' chưa được chuyển đầy đủ. Không có dữ liệu hoặc thao tác nào được giả lập thành công."
    ));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::ContractSummary;
    use serde_json::json;

    #[test]
    fn insurance_overview_does_not_index_missing_columns_on_small_screens() {
        for width in [320.0, 390.0, 768.0, 1440.0] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            let view = InsuranceView::default();
            let output = ctx.run(
                egui::RawInput {
                    screen_rect: Some(egui::Rect::from_min_size(
                        egui::Pos2::ZERO,
                        egui::vec2(width, 900.0),
                    )),
                    ..Default::default()
                },
                |ctx| {
                    egui::CentralPanel::default().show(ctx, |ui| view.render_overview(ui));
                },
            );
            assert!(!output.shapes.is_empty());
        }
    }

    fn employee(id: &str, code: &str, status: &str, salary_base: i64) -> Employee {
        Employee {
            id: id.to_owned(),
            code: code.to_owned(),
            name: format!("Employee {code}"),
            email: format!("{code}@example.test"),
            phone: String::new(),
            address: String::new(),
            department: "HR".to_owned(),
            position: "Staff".to_owned(),
            status: status.to_owned(),
            join_date: "2026-01-01".to_owned(),
            salary_base,
            role: "USER".to_owned(),
            is_active: true,
            activation_status: "active".to_owned(),
        }
    }

    #[test]
    fn default_view_has_no_fabricated_people_or_payroll() {
        let view = InsuranceView::default();
        assert!(view.employees.is_empty());
        assert!(view.payroll.is_empty());
        assert!(view.adjustments.is_empty());
        assert!(view.regimes.is_empty());
    }

    #[test]
    fn labor_rows_use_employee_records_and_expired_contract_state() {
        let employees = vec![
            employee("e1", "E-1", "Chính thức", 18_000_000),
            employee("e2", "E-2", "Đã nghỉ việc", 20_000_000),
        ];
        let contracts = vec![ContractSummary {
            employee_code: "E-1".to_owned(),
            status: "Đã hết hạn".to_owned(),
            ..ContractSummary::default()
        }];

        let rows = derive_labor_rows(&employees, &contracts);

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].employee.id, "e1");
        assert_eq!(rows[0].salary_base, 18_000_000);
        assert_eq!(rows[0].status, "Tạm hoãn");
    }

    #[test]
    fn contribution_summary_groups_payroll_and_does_not_claim_unpaid_rows_as_paid() {
        let rows = vec![
            json!({"month":"2026-08", "baseSalary": 10_000_000, "status":"Đã chi trả"}),
            json!({"month":"2026-08", "baseSalary": 20_000_000, "status":"Chờ duyệt"}),
            json!({"month":"2026-07", "baseSalary": 1_000_000, "status":"Đã chi trả"}),
        ];

        let summaries = summarize_contributions(&rows);

        assert_eq!(summaries.len(), 2);
        assert_eq!(summaries[0].period, "2026-08");
        assert_eq!(summaries[0].headcount, 2);
        assert_eq!(summaries[0].total_salary_fund, 30_000_000);
        assert_eq!(summaries[0].social_insurance, 7_650_000);
        assert_eq!(summaries[0].health_insurance, 1_350_000);
        assert_eq!(summaries[0].unemployment_insurance, 600_000);
        assert_eq!(summaries[0].total_payable, 9_600_000);
        assert_eq!(summaries[0].paid_amount, 0);
        assert_eq!(summaries[0].balance_owed, 9_600_000);
        assert_eq!(summaries[0].c12_status, "Đang đối soát");
    }

    #[test]
    fn payroll_rounding_is_bounded_and_handles_unparseable_values() {
        assert_eq!(rounded_rate(101, 255), 26);
        assert_eq!(
            unsigned_field(&json!({"baseSalary":"bad"}), "baseSalary"),
            0
        );
        assert_eq!(unsigned_field(&json!({"baseSalary":-1}), "baseSalary"), 0);
        assert!(rounded_rate(u64::MAX, 320) < u64::MAX);
    }

    #[test]
    fn adjustment_draft_preserves_legacy_fields_without_fake_ebh_submission() {
        let draft = AdjustmentDraft {
            code: " D02-2026/08-01 ".to_owned(),
            adjust_type: "Báo tăng mới".to_owned(),
            employee_name: "  Nguyễn An  ".to_owned(),
            employee_code: " E-100 ".to_owned(),
            old_salary: String::new(),
            new_salary: "18000000".to_owned(),
            effective_month: "Tháng 08/2026".to_owned(),
            filing_date: "2026-08-01".to_owned(),
        };

        let record = draft.build(&[]).unwrap();

        assert_eq!(record["d02Code"], "D02-2026/08-01");
        assert_eq!(record["empName"], "Nguyễn An");
        assert_eq!(record["empCode"], "E-100");
        assert_eq!(record["oldSalary"], 0);
        assert_eq!(record["newSalary"], 18_000_000);
        assert_eq!(
            record["vssSubmissionStatus"],
            "Chưa gửi · chưa kết nối Cổng eBH"
        );
        assert!(
            record["key"]
                .as_str()
                .unwrap()
                .starts_with("insurance-adjustment-")
        );
    }

    #[test]
    fn adjustment_draft_rejects_duplicate_code_and_invalid_salary() {
        let mut draft = AdjustmentDraft::new(0);
        draft.employee_name = "Employee".to_owned();
        draft.employee_code = "E-1".to_owned();
        draft.new_salary = "12000000".to_owned();
        draft.filing_date = "2026-08-01".to_owned();
        let existing = vec![json!({"d02Code": draft.code})];
        assert!(draft.build(&existing).unwrap_err().contains("đã tồn tại"));

        draft.code.push_str("-new");
        draft.new_salary = "-1".to_owned();
        assert!(draft.build(&[]).unwrap_err().contains("số nguyên không âm"));
    }

    #[test]
    fn regime_draft_persists_request_fields_as_internal_pending_only() {
        let draft = RegimeDraft {
            code: "CD-202608-01".to_owned(),
            regime_type: "Ốm đau ngắn ngày".to_owned(),
            employee_name: "Nguyễn An".to_owned(),
            leave_days: "3".to_owned(),
            calculated_amount: "2500000".to_owned(),
            bank_account: "123456 - Bank".to_owned(),
        };

        let record = draft.build(&[]).unwrap();

        assert_eq!(record["claimCode"], "CD-202608-01");
        assert_eq!(record["leaveDays"], 3);
        assert_eq!(record["calculatedAmount"], 2_500_000);
        assert_eq!(record["bankAccount"], "123456 - Bank");
        assert_eq!(record["approvalStatus"], "Đang thẩm định");
        assert_eq!(record["settlementDate"], "Chờ duyệt");
        assert_eq!(
            record["providerSubmissionStatus"],
            "Chưa gửi · chưa kết nối Cổng eBH"
        );
    }

    #[test]
    fn regime_draft_rejects_duplicate_code_and_zero_leave_days() {
        let mut draft = RegimeDraft::new(0);
        draft.employee_name = "Employee".to_owned();
        draft.leave_days = "0".to_owned();
        draft.calculated_amount = "0".to_owned();
        draft.bank_account = "123 - Bank".to_owned();
        let existing = vec![json!({"claimCode": draft.code})];
        assert!(draft.build(&existing).unwrap_err().contains("đã tồn tại"));

        draft.code.push_str("-new");
        assert!(draft.build(&[]).unwrap_err().contains("phải lớn hơn 0"));
    }
}
