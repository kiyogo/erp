use crate::{
    api::{ApiClient, ApiTask, WorkflowBudgetTier, WorkflowSettingsResponse},
    models::Session,
    views::employees::format_vnd,
    widgets::{self, Metric, TableColumn},
};
use egui::{Color32, RichText, Ui};

const TEAL: Color32 = Color32::from_rgb(0, 150, 136);
const BLUE: Color32 = Color32::from_rgb(37, 99, 235);
const PURPLE: Color32 = Color32::from_rgb(124, 58, 237);
const GREEN: Color32 = Color32::from_rgb(22, 163, 74);
const SLATE: Color32 = Color32::from_rgb(15, 23, 42);
const MUTED: Color32 = Color32::from_rgb(100, 116, 139);

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
enum SettingsTab {
    #[default]
    BudgetMatrix,
    Delegation,
    Security,
}

#[derive(Debug, Clone, Default)]
struct TierDraft {
    tier_name: String,
    min_amount: String,
    max_amount: String,
    required_levels: String,
    sla_hours: String,
    auto_escalate_hours: String,
    status: String,
}

#[derive(Debug, Clone, Default)]
struct DelegationRule {
    key: String,
    delegator: String,
    delegator_role: String,
    delegatee: String,
    delegatee_role: String,
    from_date: String,
    to_date: String,
    scope: String,
    reason: String,
    status: String,
    notify_slack: bool,
}

#[derive(Debug, Clone, Default)]
struct SecurityDraft {
    ca_provider: String,
    encryption_standard: String,
    session_timeout: String,
    auto_escalate: String,
    slack_webhook: String,
    require_otp_for_large_budget: String,
}

pub struct WorkflowSettingsView {
    tiers: Vec<WorkflowBudgetTier>,
    delegations: Vec<DelegationRule>,
    tab: SettingsTab,
    pending_load: Option<ApiTask<WorkflowSettingsResponse>>,
    loaded_for: Option<String>,
    load_error: String,
    notice: String,
    tier_dialog_open: bool,
    tier_draft: TierDraft,
    editing_tier_key: Option<String>,
    tier_form_error: String,
    delegation_dialog_open: bool,
    delegation_draft: DelegationRule,
    delegation_form_error: String,
    security: SecurityDraft,
}

impl Default for WorkflowSettingsView {
    fn default() -> Self {
        Self {
            tiers: Vec::new(),
            delegations: Vec::new(),
            tab: SettingsTab::BudgetMatrix,
            pending_load: None,
            loaded_for: None,
            load_error: String::new(),
            notice: String::new(),
            tier_dialog_open: false,
            tier_draft: TierDraft::default(),
            editing_tier_key: None,
            tier_form_error: String::new(),
            delegation_dialog_open: false,
            delegation_draft: DelegationRule::default(),
            delegation_form_error: String::new(),
            security: SecurityDraft::default(),
        }
    }
}

impl WorkflowSettingsView {
    fn reset_for_account(&mut self, user_id: String) {
        *self = Self::default();
        self.loaded_for = Some(user_id);
    }

    pub fn deactivate(&mut self) {
        if self.loaded_for.is_some() {
            *self = Self::default();
        }
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.reset_for_account(session.user.id.clone());
            self.tiers = load_legacy_cached_workflow_settings();
            self.pending_load = Some(api.list_workflow_settings_task(session));
        }

        if let Some(result) = self.pending_load.as_ref().and_then(ApiClient::poll) {
            self.pending_load = None;
            match result {
                Ok(response) => {
                    self.tiers =
                        prefer_server_settings(response.data, std::mem::take(&mut self.tiers));
                    self.load_error.clear();
                }
                Err(error) => self.load_error = error,
            }
        }
        if self.pending_load.is_some() {
            ctx.request_repaint_after(std::time::Duration::from_millis(50));
        }
    }

    fn open_new_tier(&mut self) {
        self.editing_tier_key = None;
        self.tier_form_error.clear();
        self.tier_draft = TierDraft {
            tier_name: format!("Cấp {}: Hạn mức mới", self.tiers.len() + 1),
            min_amount: String::new(),
            max_amount: String::new(),
            required_levels: String::new(),
            sla_hours: String::new(),
            auto_escalate_hours: String::new(),
            status: "Kích hoạt".to_owned(),
        };
        self.tier_dialog_open = true;
    }

    fn open_edit_tier(&mut self, tier: &WorkflowBudgetTier) {
        self.editing_tier_key = Some(tier.key.clone());
        self.tier_form_error.clear();
        self.tier_draft = TierDraft {
            tier_name: tier.tier_name.clone(),
            min_amount: tier.min_amount.to_string(),
            max_amount: tier.max_amount.to_string(),
            required_levels: tier.required_levels.clone(),
            sla_hours: tier.sla_hours.to_string(),
            auto_escalate_hours: tier.auto_escalate_hours.to_string(),
            status: tier.status.clone(),
        };
        self.tier_dialog_open = true;
    }

    fn save_tier(&mut self) -> bool {
        let tier_name = self.tier_draft.tier_name.trim();
        let required_levels = self.tier_draft.required_levels.trim();
        let min_amount = self.tier_draft.min_amount.trim().parse::<u64>();
        let max_amount = self.tier_draft.max_amount.trim().parse::<u64>();
        let sla_hours = self.tier_draft.sla_hours.trim().parse::<u32>();
        let auto_escalate_hours = self.tier_draft.auto_escalate_hours.trim().parse::<u32>();
        if tier_name.is_empty()
            || required_levels.is_empty()
            || min_amount.is_err()
            || max_amount.is_err()
            || sla_hours.is_err()
            || auto_escalate_hours.is_err()
            || !["Kích hoạt", "Tạm dừng"].contains(&self.tier_draft.status.as_str())
        {
            self.tier_form_error = "Vui lòng nhập đầy đủ thông tin hợp lệ.".to_owned();
            return false;
        }

        let (min_amount, max_amount, sla_hours, auto_escalate_hours) = (
            min_amount.unwrap_or_default(),
            max_amount.unwrap_or_default(),
            sla_hours.unwrap_or(4),
            auto_escalate_hours.unwrap_or(8),
        );
        if min_amount > max_amount || sla_hours == 0 || auto_escalate_hours == 0 {
            self.tier_form_error =
                "Hạn mức tối đa phải từ hạn mức tối thiểu; SLA và giờ leo thang phải lớn hơn 0."
                    .into();
            return false;
        }
        self.tier_form_error =
            "Chưa có API lưu ma trận hạn mức; cấu hình trên máy chủ được giữ nguyên.".into();
        false
    }

    fn open_new_delegation(&mut self) {
        self.delegation_form_error.clear();
        self.delegation_draft = DelegationRule::default();
        self.delegation_dialog_open = true;
    }

    fn save_delegation(&mut self) -> bool {
        let rule = &mut self.delegation_draft;
        let required = [
            &rule.delegator,
            &rule.delegator_role,
            &rule.delegatee,
            &rule.delegatee_role,
            &rule.from_date,
            &rule.to_date,
            &rule.scope,
            &rule.reason,
        ];
        if required.iter().any(|value| value.trim().is_empty()) {
            self.delegation_form_error = "Vui lòng nhập đầy đủ thông tin bắt buộc.".to_owned();
            return false;
        }
        let from = chrono::NaiveDate::parse_from_str(rule.from_date.trim(), "%Y-%m-%d");
        let to = chrono::NaiveDate::parse_from_str(rule.to_date.trim(), "%Y-%m-%d");
        if !matches!((from, to), (Ok(from), Ok(to)) if from <= to) {
            self.delegation_form_error =
                "Ngày hiệu lực không hợp lệ hoặc ngày kết thúc trước ngày bắt đầu.".into();
            return false;
        }
        self.delegation_form_error = "Chưa có API lưu và kích hoạt ủy quyền.".into();
        false
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.poll(ctx, session, api);
        ui.vertical(|ui| {
            widgets::metrics_with_padding(ui, "workflow-settings.kpi", &[
                Metric { label: "Tầng ma trận ngân sách", value: if self.tiers.is_empty() && (self.pending_load.is_some() || !self.load_error.is_empty()) { "—".into() } else { format!("{} phân cấp hạn mức", self.tiers.len()) }, detail: "Cấu hình đã tải; chưa có API cập nhật", color: TEAL, value_size: 24.0 },
                Metric { label: "Lệnh ủy quyền đang hiệu lực", value: "Chưa xác định".into(), detail: "Chưa có API ủy quyền phê duyệt", color: BLUE, value_size: 24.0 },
                Metric { label: "Chứng thư số tích hợp (CA Provider)", value: "Chưa kết nối".into(), detail: "Chưa có API cấu hình / xác minh PKI", color: PURPLE, value_size: 20.0 },
                Metric { label: "Cơ chế leo thang tự động", value: "Chưa kết nối".into(), detail: "Chưa có dịch vụ SLA và thông báo", color: GREEN, value_size: 22.0 },
            ], egui::vec2(16.0, 16.0));
            ui.add_space(16.0);
            ui.horizontal_wrapped(|ui| {
                tab_button(
                    ui,
                    &mut self.tab,
                    SettingsTab::BudgetMatrix,
                    &format!("Ma Trận Hạn Mức Ngân Sách ({})", self.tiers.len()),
                );
                tab_button(
                    ui,
                    &mut self.tab,
                    SettingsTab::Delegation,
                    &format!("Ủy Quyền Phê Duyệt ({})", self.delegations.len()),
                );
                tab_button(
                    ui,
                    &mut self.tab,
                    SettingsTab::Security,
                    "Bảo Mật Ký Số & Thông Báo",
                );
                match self.tab {
                    SettingsTab::BudgetMatrix => {
                        if teal_button(ui, "＋  Thêm tầng hạn mức").clicked() {
                            self.open_new_tier();
                        }
                    }
                    SettingsTab::Delegation => {
                        if teal_button(ui, "＋  Thiết lập ủy quyền mới").clicked() {
                            self.open_new_delegation();
                        }
                    }
                    SettingsTab::Security => {}
                }
            });

            if !self.load_error.is_empty() {
                ui.colored_label(Color32::from_rgb(185, 28, 28), &self.load_error);
                if ui.button("Tải lại ma trận hạn mức").clicked() {
                    self.pending_load = Some(api.list_workflow_settings_task(session));
                    self.load_error.clear();
                }
            } else if self.pending_load.is_some() && self.tiers.is_empty() {
                ui.label("Đang tải ma trận hạn mức ngân sách…");
            }
            if !self.notice.is_empty() {
                ui.colored_label(TEAL, &self.notice);
            }

            ui.small("Ma trận chỉ đọc; lưu hạn mức, ủy quyền, PKI và thông báo chưa có API. Bản nhập chưa được áp dụng.");
            ui.add_space(12.0);
            match self.tab {
                SettingsTab::BudgetMatrix => self.render_tiers(ui),
                SettingsTab::Delegation => self.render_delegations(ui),
                SettingsTab::Security => self.render_security(ui),
            }
        });

        self.render_tier_dialog(ctx);
        self.render_delegation_dialog(ctx);
    }

    fn render_tiers(&mut self, ui: &mut Ui) {
        let rows = self.tiers.clone();
        widgets::table(
            ui,
            "workflow-settings.tiers",
            &[
                TableColumn {
                    title: "Tên phân cấp hạn mức",
                    width: 330.0,
                },
                TableColumn {
                    title: "Khoảng ngân sách áp dụng",
                    width: 260.0,
                },
                TableColumn {
                    title: "Cam kết SLA & Leo thang",
                    width: 200.0,
                },
                TableColumn {
                    title: "Yêu cầu Token PKI",
                    width: 160.0,
                },
                TableColumn {
                    title: "Trạng thái",
                    width: 120.0,
                },
                TableColumn {
                    title: "Thao tác",
                    width: 100.0,
                },
            ],
            rows.len(),
            |ui, row, col| {
                let tier = &rows[row];
                match col {
                    0 => {
                        ui.label(&tier.tier_name);
                        ui.small(&tier.required_levels);
                    }
                    1 => {
                        ui.colored_label(
                            GREEN,
                            format!(
                                "{} ₫ ➔ {} ₫",
                                format_vnd(tier.min_amount),
                                format_vnd(tier.max_amount)
                            ),
                        );
                    }
                    2 => {
                        ui.label(format!("SLA: {} Giờ", tier.sla_hours));
                        ui.small(format!("Leo thang sau: {} Giờ", tier.auto_escalate_hours));
                    }
                    3 => legacy_tag(
                        ui,
                        if tier.require_pki {
                            "Bắt buộc Token"
                        } else {
                            "Ký điện tử nội bộ"
                        },
                        if tier.require_pki {
                            "purple"
                        } else {
                            "default"
                        },
                    ),
                    4 => legacy_tag(
                        ui,
                        &tier.status,
                        if tier.status == "Kích hoạt" {
                            "success"
                        } else {
                            "default"
                        },
                    ),
                    _ => {
                        if ui
                            .button("Sửa")
                            .on_hover_text("Xem bản nhập; chưa có API lưu thay đổi.")
                            .clicked()
                        {
                            self.open_edit_tier(tier);
                        }
                    }
                }
            },
        );
    }

    fn render_delegations(&self, ui: &mut Ui) {
        widgets::table(
            ui,
            "workflow-settings.delegations",
            &[
                TableColumn {
                    title: "Lãnh đạo ủy quyền",
                    width: 200.0,
                },
                TableColumn {
                    title: "Cán bộ được ủy quyền",
                    width: 200.0,
                },
                TableColumn {
                    title: "Thời hạn & Phạm vi ủy quyền",
                    width: 380.0,
                },
                TableColumn {
                    title: "Trạng thái",
                    width: 140.0,
                },
                TableColumn {
                    title: "Thông báo",
                    width: 140.0,
                },
            ],
            self.delegations.len(),
            |ui, row, col| {
                let rule = &self.delegations[row];
                match col {
                    0 => {
                        ui.label(&rule.delegator);
                        ui.small(&rule.delegator_role);
                    }
                    1 => {
                        ui.colored_label(TEAL, &rule.delegatee);
                        ui.small(&rule.delegatee_role);
                    }
                    2 => {
                        ui.label(format!("{} ➔ {}", rule.from_date, rule.to_date));
                        ui.small(&rule.scope);
                        ui.small(&rule.reason);
                    }
                    3 => {
                        ui.label("Chưa xác minh hiệu lực");
                    }
                    _ => {
                        ui.label("Chưa kết nối Slack");
                    }
                }
            },
        );
    }

    fn render_security(&mut self, ui: &mut Ui) {
        legacy_card_frame(ui.style(), 20.0).show(ui, |ui| {
            ui.horizontal_wrapped(|ui| {
                ui.label(
                    RichText::new("Thiết Lập Tham Số Bảo Mật Chữ Ký Số & Cảnh Báo SLA")
                        .size(15.0)
                        .strong(),
                );
                ui.add_enabled(false, egui::Button::new("Lưu cấu hình hệ thống"))
                    .on_disabled_hover_text(
                        "Chưa có API đọc/ghi chính sách PKI, SLA và thông báo.",
                    );
            });
            ui.add_space(16.0);
            if ui.available_width() >= 700.0 && ui.ctx().screen_rect().width() > 992.0 {
                ui.columns(2, |cols| {
                    security_pki_fields(&mut cols[0], &mut self.security);
                    security_alert_fields(&mut cols[1], &mut self.security);
                });
            } else {
                security_pki_fields(ui, &mut self.security);
                ui.add_space(16.0);
                security_alert_fields(ui, &mut self.security);
            }
            ui.small(
                "Các tham số chưa được máy chủ cung cấp. Không có thiết lập nào được áp dụng.",
            );
        });
    }

    fn render_tier_dialog(&mut self, ctx: &egui::Context) {
        if !self.tier_dialog_open {
            return;
        }
        let (_, close) = widgets::modal(
            ctx,
            "workflow-settings.tier",
            if self.editing_tier_key.is_some() {
                "Chỉnh Sửa Tầng Hạn Mức Ngân Sách"
            } else {
                "Thêm Mới Tầng Hạn Mức Ngân Sách"
            },
            600.0,
            false,
            |ui| {
                ui.add_space(14.0);
                widgets::form_input(
                    ui,
                    "tier.name",
                    "Tên phân cấp hạn mức",
                    true,
                    &mut self.tier_draft.tier_name,
                    "",
                    false,
                );
                if ui.available_width() >= 420.0 {
                    ui.columns(2, |cols| {
                        widgets::form_input(
                            &mut cols[0],
                            "tier.min",
                            "Số tiền tối thiểu (VNĐ)",
                            true,
                            &mut self.tier_draft.min_amount,
                            "",
                            false,
                        );
                        widgets::form_input(
                            &mut cols[1],
                            "tier.max",
                            "Số tiền tối đa (VNĐ)",
                            true,
                            &mut self.tier_draft.max_amount,
                            "",
                            false,
                        );
                    });
                } else {
                    widgets::form_input(
                        ui,
                        "tier.min",
                        "Số tiền tối thiểu (VNĐ)",
                        true,
                        &mut self.tier_draft.min_amount,
                        "",
                        false,
                    );
                    widgets::form_input(
                        ui,
                        "tier.max",
                        "Số tiền tối đa (VNĐ)",
                        true,
                        &mut self.tier_draft.max_amount,
                        "",
                        false,
                    );
                }
                widgets::form_input(
                    ui,
                    "tier.levels",
                    "Luồng các cấp phê duyệt bắt buộc",
                    true,
                    &mut self.tier_draft.required_levels,
                    "",
                    false,
                );
                widgets::form_input(
                    ui,
                    "tier.sla",
                    "Cam kết SLA (Giờ)",
                    true,
                    &mut self.tier_draft.sla_hours,
                    "",
                    false,
                );
                widgets::form_input(
                    ui,
                    "tier.escalate",
                    "Leo thang sau (Giờ)",
                    true,
                    &mut self.tier_draft.auto_escalate_hours,
                    "",
                    false,
                );
                widgets::form_select(
                    ui,
                    "tier.status",
                    "Trạng thái",
                    true,
                    &mut self.tier_draft.status,
                    &["Kích hoạt", "Tạm dừng"],
                );
                ui.colored_label(
                    MUTED,
                    "Chưa có API lưu ma trận hạn mức. Bản nhập chưa được áp dụng.",
                );
                if !self.tier_form_error.is_empty() {
                    ui.colored_label(Color32::DARK_RED, &self.tier_form_error);
                }
                ui.add_space(20.0);
                widgets::action_row(ui, |ui| {
                    if ui
                        .add_enabled(false, egui::Button::new("Lưu thiết lập"))
                        .on_disabled_hover_text("Chưa có API lưu ma trận hạn mức.")
                        .clicked()
                    {
                        self.save_tier();
                    }
                    if ui.button("Hủy").clicked() {
                        self.tier_dialog_open = false;
                    }
                });
            },
        );
        if close {
            self.tier_dialog_open = false;
        }
    }

    fn render_delegation_dialog(&mut self, ctx: &egui::Context) {
        if !self.delegation_dialog_open {
            return;
        }
        let (_, close) = widgets::modal(
            ctx,
            "workflow-settings.delegation",
            "Thiết Lập Lệnh Ủy Quyền Phê Duyệt Khi Vắng Mặt",
            650.0,
            false,
            |ui| {
                ui.add_space(14.0);
                widgets::form_input(
                    ui,
                    "delegation.from",
                    "Lãnh đạo ủy quyền",
                    true,
                    &mut self.delegation_draft.delegator,
                    "",
                    false,
                );
                widgets::form_input(
                    ui,
                    "delegation.from-role",
                    "Chức danh người ủy quyền",
                    true,
                    &mut self.delegation_draft.delegator_role,
                    "",
                    false,
                );
                widgets::form_input(
                    ui,
                    "delegation.to",
                    "Cán bộ nhận ủy quyền thay mặt duyệt",
                    true,
                    &mut self.delegation_draft.delegatee,
                    "",
                    false,
                );
                widgets::form_input(
                    ui,
                    "delegation.to-role",
                    "Chức danh người nhận",
                    true,
                    &mut self.delegation_draft.delegatee_role,
                    "",
                    false,
                );
                if ui.available_width() >= 420.0 {
                    ui.columns(2, |cols| {
                        widgets::form_date(
                            &mut cols[0],
                            "delegation.start",
                            "Hiệu lực từ ngày",
                            true,
                            &mut self.delegation_draft.from_date,
                        );
                        widgets::form_date(
                            &mut cols[1],
                            "delegation.end",
                            "Đến ngày",
                            true,
                            &mut self.delegation_draft.to_date,
                        );
                    });
                } else {
                    widgets::form_date(
                        ui,
                        "delegation.start",
                        "Hiệu lực từ ngày",
                        true,
                        &mut self.delegation_draft.from_date,
                    );
                    widgets::form_date(
                        ui,
                        "delegation.end",
                        "Đến ngày",
                        true,
                        &mut self.delegation_draft.to_date,
                    );
                }
                widgets::form_input(
                    ui,
                    "delegation.scope",
                    "Phạm vi & Hạn mức được ủy quyền duyệt",
                    true,
                    &mut self.delegation_draft.scope,
                    "",
                    false,
                );
                widgets::form_textarea(
                    ui,
                    "delegation.reason",
                    "Lý do ủy quyền (Công tác / Nghỉ phép)",
                    true,
                    &mut self.delegation_draft.reason,
                    "",
                    2,
                );
                ui.add_enabled(
                    false,
                    egui::Checkbox::new(&mut self.delegation_draft.notify_slack, "Thông báo Slack"),
                )
                .on_disabled_hover_text("Chưa kết nối dịch vụ thông báo.");
                ui.small("Chưa có API lưu và kích hoạt ủy quyền.");
                if !self.delegation_form_error.is_empty() {
                    ui.colored_label(Color32::DARK_RED, &self.delegation_form_error);
                }
                ui.add_space(20.0);
                widgets::action_row(ui, |ui| {
                    if ui
                        .add_enabled(false, egui::Button::new("Kích hoạt ủy quyền"))
                        .on_disabled_hover_text("Chưa có API ủy quyền.")
                        .clicked()
                    {
                        self.save_delegation();
                    }
                    if ui.button("Hủy").clicked() {
                        self.delegation_dialog_open = false;
                    }
                });
            },
        );
        if close {
            self.delegation_dialog_open = false;
        }
    }
}

fn security_pki_fields(ui: &mut Ui, security: &mut SecurityDraft) {
    legacy_card_frame(ui.style(), 14.0).show(ui, |ui| {
        ui.strong("Chứng Thư Số & Chuẩn Mã Hóa PKI");
        ui.add_space(12.0);
        ui.add_enabled_ui(false, |ui| {
            widgets::form_input(
                ui,
                "security.ca",
                "Nhà cung cấp dịch vụ chứng thực chữ ký số (CA)",
                false,
                &mut security.ca_provider,
                "Chưa xác định",
                false,
            );
            widgets::form_input(
                ui,
                "security.encryption",
                "Tiêu chuẩn mã băm & Chữ ký điện tử",
                false,
                &mut security.encryption_standard,
                "Chưa xác định",
                false,
            );
            widgets::form_input(
                ui,
                "security.timeout",
                "Thời gian tự động khóa phiên ký số (Phút)",
                false,
                &mut security.session_timeout,
                "Chưa xác định",
                false,
            );
        });
    });
}

fn security_alert_fields(ui: &mut Ui, security: &mut SecurityDraft) {
    legacy_card_frame(ui.style(), 14.0).show(ui, |ui| {
        ui.strong("Kênh Cảnh Báo & Tự Động Hóa SLA");
        ui.add_space(12.0);
        ui.add_enabled_ui(false, |ui| {
            widgets::form_input(
                ui,
                "security.webhook",
                "Slack Webhook Channel thông báo tờ trình",
                false,
                &mut security.slack_webhook,
                "Chưa kết nối",
                true,
            );
            widgets::form_input(
                ui,
                "security.escalate",
                "Tự động leo thang cấp duyệt khi quá hạn SLA",
                false,
                &mut security.auto_escalate,
                "Chưa xác định",
                false,
            );
            widgets::form_input(
                ui,
                "security.otp",
                "Chính sách xác thực OTP 2FA cho khoản chi lớn",
                false,
                &mut security.require_otp_for_large_budget,
                "Chưa xác định",
                false,
            );
        });
    });
}

#[cfg(any(target_arch = "wasm32", test))]
fn parse_legacy_cached_workflow_settings(raw: &str) -> Vec<WorkflowBudgetTier> {
    serde_json::from_str::<Vec<WorkflowBudgetTier>>(raw).unwrap_or_default()
}

fn prefer_server_settings(
    server: Vec<WorkflowBudgetTier>,
    legacy_cache: Vec<WorkflowBudgetTier>,
) -> Vec<WorkflowBudgetTier> {
    if server.is_empty() && !legacy_cache.is_empty() {
        legacy_cache
    } else {
        server
    }
}

#[cfg(target_arch = "wasm32")]
fn load_legacy_cached_workflow_settings() -> Vec<WorkflowBudgetTier> {
    web_sys::window()
        .and_then(|window| window.local_storage().ok().flatten())
        .and_then(|storage| {
            storage
                .get_item("kiyovn_cache_workflow_settings")
                .ok()
                .flatten()
        })
        .map(|raw| parse_legacy_cached_workflow_settings(&raw))
        .unwrap_or_default()
}

#[cfg(not(target_arch = "wasm32"))]
fn load_legacy_cached_workflow_settings() -> Vec<WorkflowBudgetTier> {
    Vec::new()
}

fn legacy_tag_colors(preset: &str) -> (Color32, Color32, Color32) {
    match preset {
        "success" => (
            Color32::from_rgb(246, 255, 237),
            Color32::from_rgb(183, 235, 143),
            Color32::from_rgb(56, 158, 13),
        ),
        "processing" => (
            Color32::from_rgb(230, 247, 255),
            Color32::from_rgb(145, 213, 255),
            Color32::from_rgb(9, 109, 217),
        ),
        "cyan" => (
            Color32::from_rgb(230, 255, 251),
            Color32::from_rgb(135, 232, 222),
            Color32::from_rgb(8, 151, 156),
        ),
        "purple" => (
            Color32::from_rgb(249, 240, 255),
            Color32::from_rgb(211, 173, 230),
            Color32::from_rgb(83, 29, 171),
        ),
        _ => (
            Color32::from_rgb(250, 250, 250),
            Color32::from_rgb(217, 217, 217),
            Color32::from_rgb(89, 89, 89),
        ),
    }
}

fn legacy_tag(ui: &mut Ui, text: &str, preset: &str) {
    let (background, border, foreground) = legacy_tag_colors(preset);
    egui::Frame {
        inner_margin: egui::Margin::symmetric(7.0, 0.0),
        rounding: egui::Rounding::same(5.0),
        fill: background,
        stroke: egui::Stroke::new(1.0, border),
        ..egui::Frame::group(ui.style())
    }
    .show(ui, |ui| {
        ui.set_min_height(20.0);
        ui.label(RichText::new(text).size(12.0).color(foreground));
    });
}

fn legacy_card_frame(style: &egui::Style, padding: f32) -> egui::Frame {
    egui::Frame {
        inner_margin: egui::Margin::same(padding),
        rounding: egui::Rounding::same(8.0),
        fill: Color32::WHITE,
        stroke: egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)),
        ..egui::Frame::group(style)
    }
}

fn tab_button(ui: &mut Ui, active: &mut SettingsTab, tab: SettingsTab, title: &str) {
    let selected = *active == tab;
    let label = RichText::new(title).color(if selected { Color32::WHITE } else { SLATE });
    let label = if selected { label.strong() } else { label };
    let button = egui::Button::new(label)
        .fill(if selected { TEAL } else { Color32::WHITE })
        .stroke(egui::Stroke::new(
            1.0,
            if selected {
                TEAL
            } else {
                Color32::from_gray(205)
            },
        ));
    if ui.add(button).clicked() {
        *active = tab;
    }
}

fn teal_button(ui: &mut Ui, label: &str) -> egui::Response {
    ui.add(
        egui::Button::new(RichText::new(label).color(Color32::WHITE).strong())
            .fill(TEAL)
            .stroke(egui::Stroke::new(1.0, TEAL)),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn tier(key: &str) -> WorkflowBudgetTier {
        WorkflowBudgetTier {
            key: key.to_owned(),
            tier_name: "Cấp 1".to_owned(),
            min_amount: 1_000,
            max_amount: 20_000,
            required_levels: "Trưởng phòng ➔ Giám đốc".to_owned(),
            sla_hours: 4,
            auto_escalate_hours: 8,
            require_pki: false,
            status: "Kích hoạt".to_owned(),
            extra: [("legacyExtension".to_owned(), json!({"source":"legacy"}))]
                .into_iter()
                .collect(),
        }
    }

    #[test]
    fn edit_preserves_legacy_key_pki_flag_and_unknown_fields() {
        let mut view = WorkflowSettingsView {
            tiers: vec![tier("tier-1")],
            editing_tier_key: Some("tier-1".to_owned()),
            tier_draft: TierDraft {
                tier_name: "Cấp mới".to_owned(),
                min_amount: "2000".to_owned(),
                max_amount: "30000".to_owned(),
                required_levels: "Kế toán ➔ Tổng giám đốc".to_owned(),
                sla_hours: "5".to_owned(),
                auto_escalate_hours: "9".to_owned(),
                status: "Tạm dừng".to_owned(),
            },
            ..WorkflowSettingsView::default()
        };

        assert!(!view.save_tier());
        assert_eq!(view.tiers[0].key, "tier-1");
        assert!(!view.tiers[0].require_pki);
        assert_eq!(view.tiers[0].extra["legacyExtension"]["source"], "legacy");
        assert_eq!(view.tiers[0].min_amount, 1_000);
        assert_eq!(view.tiers[0].status, "Kích hoạt");
        assert!(view.tier_form_error.contains("Chưa có API"));
    }

    #[test]
    fn invalid_tier_does_not_change_loaded_data() {
        let mut view = WorkflowSettingsView {
            tiers: vec![tier("tier-1")],
            tier_draft: TierDraft {
                tier_name: "".to_owned(),
                min_amount: "not-a-number".to_owned(),
                ..TierDraft::default()
            },
            ..WorkflowSettingsView::default()
        };

        assert!(!view.save_tier());
        assert_eq!(view.tiers.len(), 1);
        assert_eq!(view.tiers[0].tier_name, "Cấp 1");
        assert!(!view.tier_form_error.is_empty());
    }

    #[test]
    fn delegation_without_api_does_not_create_a_live_policy() {
        let mut view = WorkflowSettingsView::default();
        view.open_new_delegation();
        assert!(view.delegation_draft.delegator.is_empty());
        view.delegation_draft = DelegationRule {
            delegator: "Người ủy quyền".into(),
            delegator_role: "Quản lý".into(),
            delegatee: "Người nhận".into(),
            delegatee_role: "Trưởng nhóm".into(),
            from_date: "2026-10-01".into(),
            to_date: "2026-10-31".into(),
            scope: "Phạm vi cụ thể".into(),
            reason: "Công tác".into(),
            ..Default::default()
        };
        assert!(!view.save_delegation());
        assert!(view.delegations.is_empty());
        assert!(view.delegation_form_error.contains("Chưa có API"));
        assert!(view.notice.is_empty());
        assert!(SecurityDraft::default().ca_provider.is_empty());
        assert!(SecurityDraft::default().slack_webhook.is_empty());
    }

    #[test]
    fn route_and_account_reset_clear_local_delegation_and_security_values() {
        let mut view = WorkflowSettingsView::default();
        view.loaded_for = Some("user-a".to_owned());
        view.tab = SettingsTab::Security;
        view.delegations.push(DelegationRule {
            delegator: "User A".to_owned(),
            ..DelegationRule::default()
        });
        view.security.slack_webhook = "private-session-value".to_owned();

        view.reset_for_account("user-b".to_owned());
        assert_eq!(view.loaded_for.as_deref(), Some("user-b"));
        assert!(view.delegations.is_empty());
        assert_eq!(view.tab, SettingsTab::BudgetMatrix);
        assert_eq!(
            view.security.slack_webhook,
            SecurityDraft::default().slack_webhook
        );

        view.delegations.push(DelegationRule::default());
        view.deactivate();
        assert!(view.loaded_for.is_none());
        assert!(view.delegations.is_empty());
        assert!(!view.delegation_dialog_open);
    }

    #[test]
    fn legacy_browser_cache_is_used_only_when_server_collection_is_empty() {
        let cached = parse_legacy_cached_workflow_settings(
            r#"[{"key":"legacy-tier","tierName":"Cấp legacy","minAmount":100,"maxAmount":900,"requiredLevels":"Trưởng phòng","slaHours":4,"autoEscalateHours":8,"requirePKI":true,"status":"Kích hoạt","customFlag":"kept"}]"#,
        );
        assert_eq!(cached.len(), 1);
        assert_eq!(cached[0].key, "legacy-tier");
        assert_eq!(cached[0].extra["customFlag"], "kept");
        assert_eq!(
            prefer_server_settings(Vec::new(), cached.clone())[0].key,
            "legacy-tier"
        );

        let server = vec![WorkflowBudgetTier {
            key: "server-tier".to_owned(),
            ..WorkflowBudgetTier::default()
        }];
        assert_eq!(prefer_server_settings(server, cached)[0].key, "server-tier");
        assert!(parse_legacy_cached_workflow_settings("{}..corrupt").is_empty());
    }

    #[test]
    fn workflow_tags_match_legacy_ant_design_palette() {
        assert_eq!(
            legacy_tag_colors("purple"),
            (
                Color32::from_rgb(249, 240, 255),
                Color32::from_rgb(211, 173, 230),
                Color32::from_rgb(83, 29, 171),
            )
        );
        assert_eq!(
            legacy_tag_colors("processing"),
            (
                Color32::from_rgb(230, 247, 255),
                Color32::from_rgb(145, 213, 255),
                Color32::from_rgb(9, 109, 217),
            )
        );
        assert_eq!(
            legacy_tag_colors("cyan"),
            (
                Color32::from_rgb(230, 255, 251),
                Color32::from_rgb(135, 232, 222),
                Color32::from_rgb(8, 151, 156),
            )
        );
    }
}
