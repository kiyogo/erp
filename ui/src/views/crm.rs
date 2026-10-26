use std::time::Duration;

use crate::{
    api::{ApiClient, ApiTask, CreateCrmContactInput, CrmContact},
    models::Session,
    views::employees::format_vnd,
};
use egui::{Color32, Context, RichText, Ui, Vec2};

const PAGE_SIZE: usize = 10;
const MAX_AMOUNT: i64 = 1_000_000_000_000;

#[derive(Clone)]
struct ContactForm {
    contact_type: String,
    name: String,
    tax_code: String,
    industry: String,
    contact_person: String,
    phone: String,
    email: String,
    address: String,
    bank_account: String,
    credit_limit: String,
    total_value: String,
    debt_balance: String,
    tier: String,
    account_manager: String,
    status: String,
}

impl Default for ContactForm {
    fn default() -> Self {
        Self {
            contact_type: "customer".to_owned(),
            name: String::new(),
            tax_code: String::new(),
            industry: String::new(),
            contact_person: String::new(),
            phone: String::new(),
            email: String::new(),
            address: String::new(),
            bank_account: String::new(),
            credit_limit: "0".to_owned(),
            total_value: "0".to_owned(),
            debt_balance: "0".to_owned(),
            tier: "Tiêu chuẩn".to_owned(),
            account_manager: String::new(),
            status: "Đang hoạt động".to_owned(),
        }
    }
}

impl ContactForm {
    fn to_input(&self) -> Result<CreateCrmContactInput, String> {
        let name = self.name.trim();
        if name.is_empty() {
            return Err("Vui lòng nhập tên khách hàng/đối tác.".to_owned());
        }
        if name.encode_utf16().count() > 220 {
            return Err("Tên khách hàng/đối tác tối đa 220 ký tự.".to_owned());
        }
        Ok(CreateCrmContactInput {
            name: name.to_owned(),
            contact_type: self.contact_type.clone(),
            tax_code: self.tax_code.trim().to_owned(),
            industry: self.industry.trim().to_owned(),
            contact_person: self.contact_person.trim().to_owned(),
            phone: self.phone.trim().to_owned(),
            email: self.email.trim().to_owned(),
            address: self.address.trim().to_owned(),
            bank_account: self.bank_account.trim().to_owned(),
            credit_limit: parse_amount(&self.credit_limit, "Hạn mức tín dụng")?,
            total_value: parse_amount(&self.total_value, "Giá trị giao dịch")?,
            debt_balance: parse_amount(&self.debt_balance, "Công nợ")?,
            tier: if self.tier.trim().is_empty() {
                "Tiêu chuẩn".to_owned()
            } else {
                self.tier.trim().to_owned()
            },
            account_manager: self.account_manager.trim().to_owned(),
            status: if self.status.trim().is_empty() {
                "Đang hoạt động".to_owned()
            } else {
                self.status.trim().to_owned()
            },
        })
    }
}

pub struct CrmView {
    contacts: Vec<CrmContact>,
    list_task: Option<ApiTask<crate::api::CrmContactsResponse>>,
    create_task: Option<ApiTask<crate::api::CrmContactResponse>>,
    loaded_for: Option<String>,
    current_path: String,
    needs_reload: bool,
    loading: bool,
    error: String,
    notice: String,
    search: String,
    type_filter: String,
    page: usize,
    page_size: usize,
    form_open: bool,
    form: ContactForm,
    form_error: String,
    selected_key: Option<String>,
}

impl Default for CrmView {
    fn default() -> Self {
        Self {
            contacts: Vec::new(),
            list_task: None,
            create_task: None,
            loaded_for: None,
            current_path: String::new(),
            needs_reload: true,
            loading: false,
            error: String::new(),
            notice: String::new(),
            search: String::new(),
            type_filter: "all".to_owned(),
            page: 1,
            page_size: PAGE_SIZE,
            form_open: false,
            form: ContactForm::default(),
            form_error: String::new(),
            selected_key: None,
        }
    }
}

impl CrmView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn switch_account(&mut self, user_id: &str) {
        self.contacts.clear();
        self.list_task = None;
        self.create_task = None;
        self.loaded_for = Some(user_id.to_owned());
        self.needs_reload = true;
        self.loading = false;
        self.error.clear();
        self.notice.clear();
        self.search.clear();
        self.page = 1;
        self.form_open = false;
        self.form = ContactForm::default();
        self.form_error.clear();
        self.selected_key = None;
    }

    fn set_route(&mut self, path: &str) {
        if self.current_path == path {
            return;
        }
        self.current_path = path.to_owned();
        self.type_filter = match path {
            "/admin/crm/customers" => "customer",
            "/admin/crm/suppliers" => "supplier",
            "/admin/crm/partners" => "partner",
            _ => "all",
        }
        .to_owned();
        self.page = 1;
        self.selected_key = None;
        self.needs_reload = true;
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        self.loading = true;
        self.error.clear();
        let type_filter = (self.type_filter != "all").then_some(self.type_filter.as_str());
        self.list_task = Some(api.list_crm_contacts_task(session, type_filter));
        self.needs_reload = false;
    }

    fn poll_requests(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.switch_account(&session.user.id);
        }
        if self.needs_reload && self.list_task.is_none() && self.create_task.is_none() {
            self.request_reload(session, api);
        }
        if let Some(result) = self.list_task.as_ref().and_then(ApiClient::poll) {
            self.list_task = None;
            self.loading = false;
            match result {
                Ok(response) => self.contacts = response.data,
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.create_task.as_ref().and_then(ApiClient::poll) {
            self.create_task = None;
            match result {
                Ok(response) => {
                    self.notice = format!("Đã tạo liên hệ {}.", response.contact.code);
                    self.form_open = false;
                    self.form = ContactForm::default();
                    self.form_error.clear();
                    self.needs_reload = true;
                }
                Err(error) => self.form_error = error,
            }
        }
        if self.list_task.is_some() || self.create_task.is_some() {
            ui.ctx().request_repaint_after(Duration::from_millis(80));
        }
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &Context,
        session: &Session,
        api: &ApiClient,
        route_path: &str,
    ) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.switch_account(&session.user.id);
        }
        self.set_route(route_path);
        if session.user.role != "ADMIN" {
            self.contacts.clear();
            self.list_task = None;
            self.create_task = None;
            self.loading = false;
            ui.heading("Không đủ quyền");
            ui.label("Chỉ quản trị viên mới có thể xem và quản lý danh bạ CRM.");
            return;
        }

        self.poll_requests(ui, session, api);
        self.render_contacts(ui);
        self.render_create_dialog(ctx, session, api);
        self.render_details_dialog(ctx);
    }

    fn render_contacts(&mut self, ui: &mut Ui) {
        ui.spacing_mut().item_spacing.y = 0.0;
        ui.add_space(8.0);
        let title = match self.current_path.as_str() {
            "/admin/crm/customers" => "Khách hàng & công nợ phải thu",
            "/admin/crm/suppliers" => "Nhà cung cấp & công nợ phải trả",
            "/admin/crm/partners" => "Đối tác phân phối",
            _ => "Khách hàng & đối tác",
        };
        if crate::widgets::page_header(
            ui,
            "crm",
            title,
            "Dữ liệu lưu qua backend, dùng chung cho CRM, bán/mua hàng và công nợ.",
            !self.loading,
        ) {
            self.needs_reload = true;
        }
        ui.add_space(14.0);
        if !self.error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
        }
        if !self.notice.is_empty() {
            ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
        }
        let visible = self.filtered_contacts();
        let total = visible.iter().fold(0_i64, |n, i| {
            n.saturating_add(self.contacts[*i].total_value)
        });
        let debt = visible.iter().fold(0_i64, |n, i| {
            n.saturating_add(self.contacts[*i].debt_balance)
        });
        let active = visible
            .iter()
            .filter(|i| !self.contacts[**i].status.contains("Tạm"))
            .count();
        let known = |s: String| {
            if self.contacts.is_empty() && (self.loading || !self.error.is_empty()) {
                "—".to_owned()
            } else {
                s
            }
        };
        crate::widgets::metrics_grid(
            ui,
            "crm.metrics",
            &[
                crate::widgets::Metric {
                    label: "Tổng bản ghi",
                    value: known(visible.len().to_string()),
                    detail: "",
                    color: crate::theme::PRIMARY,
                    value_size: 22.0,
                },
                crate::widgets::Metric {
                    label: "Đang hoạt động",
                    value: known(active.to_string()),
                    detail: "",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 22.0,
                },
                crate::widgets::Metric {
                    label: "Giá trị giao dịch",
                    value: known(format_currency(total)),
                    detail: "",
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 22.0,
                },
                crate::widgets::Metric {
                    label: "Công nợ hiện tại",
                    value: known(format_currency(debt)),
                    detail: "",
                    color: if debt > 0 {
                        Color32::from_rgb(220, 38, 38)
                    } else {
                        Color32::from_rgb(100, 116, 139)
                    },
                    value_size: 22.0,
                },
            ],
            Vec2::splat(16.0),
            220.0,
            4.0,
        );
        ui.add_space(16.0);
        let compact = ui.ctx().screen_rect().width() <= 992.0;
        let all = self.current_path == "/admin/crm";
        let width = ui.available_width();
        let left_height = if compact && all { 72.0 } else { 32.0 };
        let actions_below = compact && width.min(295.015625) + 10.0 + 224.578125 > width;
        let (bar, _) = ui.allocate_exact_size(
            egui::vec2(width, left_height + if actions_below { 40.0 } else { 0.0 }),
            egui::Sense::hover(),
        );
        if all {
            let rect = egui::Rect::from_min_size(
                bar.min,
                egui::vec2(
                    if compact {
                        width.min(295.015625)
                    } else {
                        170.0
                    },
                    32.0,
                ),
            );
            let mut child = ui.new_child(
                egui::UiBuilder::new()
                    .id_salt("crm.filter")
                    .max_rect(rect)
                    .layout(egui::Layout::centered_and_justified(
                        egui::Direction::TopDown,
                    )),
            );
            crate::widgets::combo_box("crm.type")
                .width(rect.width())
                .selected_text(type_label(&self.type_filter))
                .show_ui(&mut child, |ui| {
                    for (value, label) in [
                        ("all", "Tất cả"),
                        ("customer", "Khách hàng"),
                        ("supplier", "Nhà cung cấp"),
                        ("partner", "Đối tác"),
                    ] {
                        if ui
                            .selectable_value(&mut self.type_filter, value.to_owned(), label)
                            .changed()
                        {
                            self.needs_reload = true;
                            self.page = 1;
                            self.selected_key = None;
                        }
                    }
                });
        }
        let search = egui::Rect::from_min_size(
            bar.min
                + if compact {
                    egui::vec2(0.0, if all { 40.0 } else { 0.0 })
                } else {
                    egui::vec2(if all { 178.0 } else { 0.0 }, 0.0)
                },
            egui::vec2(
                if compact {
                    width.min(295.015625)
                } else {
                    300.0
                },
                32.0,
            ),
        );
        if crate::widgets::search_input(
            ui,
            search,
            &mut self.search,
            "Tìm mã, tên, MST, liên hệ...",
        )
        .changed()
        {
            self.page = 1;
        }
        let origin = if actions_below {
            bar.min + egui::vec2(0.0, left_height + 8.0)
        } else {
            egui::pos2(
                bar.right() - 224.578125,
                bar.top() + (left_height - 32.0) / 2.0,
            )
        };
        ui.add_enabled_ui(false, |ui| {
            crate::widgets::put(
                ui,
                egui::Rect::from_min_size(origin, egui::vec2(98.9375, 32.0)),
                egui::Button::new("Xuất Excel"),
            )
            .on_hover_text("Chưa có dịch vụ xuất Excel thật");
        });
        let add = egui::Rect::from_min_size(
            origin + egui::vec2(106.9375, 0.0),
            egui::vec2(117.640625, 32.0),
        );
        let mut open = false;
        ui.add_enabled_ui(self.create_task.is_none(), |ui| {
            open = crate::widgets::put(
                ui,
                add,
                egui::Button::new(RichText::new("+ Thêm mới").color(Color32::WHITE))
                    .fill(crate::theme::PRIMARY),
            )
            .clicked();
        });
        if open {
            self.form = ContactForm::default();
            if self.type_filter != "all" {
                self.form.contact_type = self.type_filter.clone();
            }
            self.form_error.clear();
            self.form_open = true;
        }
        crate::visual_test::record("crm.add", add);
        crate::visual_test::record("crm.toolbar", bar);
        ui.add_space(12.0);
        if self.contacts.is_empty() && (self.loading || !self.error.is_empty()) {
            if self.loading {
                ui.spinner();
                ui.label("Đang tải danh bạ từ máy chủ...");
            }
            return;
        }
        let pages = visible.len().div_ceil(self.page_size).max(1);
        self.page = self.page.clamp(1, pages);
        let rows = visible
            .iter()
            .skip((self.page - 1) * self.page_size)
            .take(self.page_size)
            .map(|i| self.contacts[*i].clone())
            .collect::<Vec<_>>();
        let flexible = (width - 2.0 - 785.0).max(if compact { 254.421875 } else { 263.109375 });
        let columns = [
            crate::widgets::TableColumn {
                title: "Mã & loại",
                width: 150.0,
            },
            crate::widgets::TableColumn {
                title: "Tên đối tác & liên hệ",
                width: flexible * 224.421875 / 409.0,
            },
            crate::widgets::TableColumn {
                title: "MST",
                width: 120.0,
            },
            crate::widgets::TableColumn {
                title: "Ngành/Lĩnh vực",
                width: flexible * 184.578125 / 409.0,
            },
            crate::widgets::TableColumn {
                title: "Giá trị giao dịch",
                width: 155.0,
            },
            crate::widgets::TableColumn {
                title: "Công nợ",
                width: 140.0,
            },
            crate::widgets::TableColumn {
                title: "Trạng thái",
                width: 130.0,
            },
            crate::widgets::TableColumn {
                title: "Thao tác",
                width: 90.0,
            },
        ];
        let mut selected = None;
        crate::widgets::table(ui, "crm.table", &columns, rows.len(), |ui, row, col| {
            let c = &rows[row];
            match col {
                0 => {
                    ui.label(RichText::new(&c.code).strong().color(crate::theme::PRIMARY));
                    crate::widgets::tag(
                        ui,
                        type_label(&c.contact_type),
                        match c.contact_type.as_str() {
                            "customer" => crate::widgets::TagTone::Success,
                            "supplier" => crate::widgets::TagTone::Processing,
                            _ => crate::widgets::TagTone::Purple,
                        },
                    );
                }
                1 => {
                    ui.label(RichText::new(&c.name).strong());
                    ui.label(
                        RichText::new(format!(
                            "{} · {}",
                            if c.contact_person.is_empty() {
                                "Chưa có người liên hệ"
                            } else {
                                &c.contact_person
                            },
                            if c.phone.is_empty() {
                                "Chưa có SĐT"
                            } else {
                                &c.phone
                            }
                        ))
                        .size(12.0),
                    );
                }
                2 => {
                    ui.label(if c.tax_code.is_empty() {
                        "Chưa nhập"
                    } else {
                        &c.tax_code
                    });
                }
                3 => {
                    ui.label(if c.industry.is_empty() {
                        "Chưa nhập"
                    } else {
                        &c.industry
                    });
                }
                4 => {
                    ui.label(RichText::new(format_currency(c.total_value)).strong());
                }
                5 => {
                    ui.colored_label(
                        if c.debt_balance > 0 {
                            Color32::from_rgb(220, 38, 38)
                        } else {
                            Color32::from_rgb(100, 116, 139)
                        },
                        format_currency(c.debt_balance),
                    );
                }
                6 => {
                    crate::widgets::tag(
                        ui,
                        &c.status,
                        if c.status.contains("Tạm") {
                            crate::widgets::TagTone::Error
                        } else {
                            crate::widgets::TagTone::Success
                        },
                    );
                    if c.legacy_import_status.as_deref() == Some("unverified") {
                        ui.colored_label(Color32::from_rgb(180, 83, 9), "Legacy · chưa xác minh");
                    }
                }
                _ => {
                    if ui.small_button("Xem").clicked() {
                        selected = Some(c.key.clone());
                    }
                }
            }
        });
        if let Some(key) = selected {
            self.selected_key = Some(key);
        }
        ui.add_space(10.0);
        let mut index = self.page - 1;
        crate::widgets::pagination(
            ui,
            "crm.pagination",
            &mut index,
            visible.len(),
            &mut self.page_size,
        );
        self.page = index + 1;
    }

    fn filtered_contacts(&self) -> Vec<usize> {
        let query = self.search.trim().to_lowercase();
        self.contacts
            .iter()
            .enumerate()
            .filter(|(_, contact)| {
                query.is_empty()
                    || [
                        contact.code.as_str(),
                        contact.name.as_str(),
                        contact.tax_code.as_str(),
                        contact.contact_person.as_str(),
                        contact.phone.as_str(),
                        contact.email.as_str(),
                    ]
                    .iter()
                    .any(|field| field.to_lowercase().contains(&query))
            })
            .map(|(index, _)| index)
            .collect()
    }

    fn render_create_dialog(&mut self, ctx: &Context, session: &Session, api: &ApiClient) {
        if !self.form_open {
            return;
        }
        let mut submit = false;
        let mut cancel = false;
        let (_, closed) = crate::widgets::modal(
            ctx,
            "crm.create",
            "Thêm đối tác",
            640.0,
            self.create_task.is_some(),
            |ui| {
                ui.add_space(14.0);
                ui.columns(2, |cols| {
                    let mut code = "Máy chủ tạo tự động".to_owned();
                    cols[0].add_enabled_ui(false, |ui| {
                        crate::widgets::form_input(
                            ui,
                            "crm.code",
                            "Mã đối tác",
                            false,
                            &mut code,
                            "",
                            false,
                        )
                    });
                    crate::widgets::form_field(
                        &mut cols[1],
                        "crm.type",
                        "Loại đối tác",
                        true,
                        |ui| {
                            crate::widgets::combo_box("crm.create.type")
                                .width(ui.available_width())
                                .selected_text(type_label(&self.form.contact_type))
                                .show_ui(ui, |ui| {
                                    for (value, label) in [
                                        ("customer", "Khách hàng"),
                                        ("supplier", "Nhà cung cấp"),
                                        ("partner", "Đối tác"),
                                    ] {
                                        ui.selectable_value(
                                            &mut self.form.contact_type,
                                            value.to_owned(),
                                            label,
                                        );
                                    }
                                });
                        },
                    );
                });
                crate::widgets::form_input(
                    ui,
                    "crm.name",
                    "Tên tổ chức",
                    true,
                    &mut self.form.name,
                    "",
                    false,
                );
                ui.columns(2, |cols| {
                    crate::widgets::form_input(
                        &mut cols[0],
                        "crm.tax",
                        "Mã số thuế",
                        false,
                        &mut self.form.tax_code,
                        "",
                        false,
                    );
                    crate::widgets::form_input(
                        &mut cols[1],
                        "crm.industry",
                        "Ngành/Lĩnh vực",
                        false,
                        &mut self.form.industry,
                        "",
                        false,
                    );
                });
                ui.columns(2, |cols| {
                    crate::widgets::form_input(
                        &mut cols[0],
                        "crm.person",
                        "Người liên hệ",
                        false,
                        &mut self.form.contact_person,
                        "",
                        false,
                    );
                    crate::widgets::form_input(
                        &mut cols[1],
                        "crm.phone",
                        "Số điện thoại",
                        false,
                        &mut self.form.phone,
                        "",
                        false,
                    );
                });
                crate::widgets::form_input(
                    ui,
                    "crm.email",
                    "Email",
                    false,
                    &mut self.form.email,
                    "",
                    false,
                );
                crate::widgets::form_input(
                    ui,
                    "crm.address",
                    "Địa chỉ",
                    false,
                    &mut self.form.address,
                    "",
                    false,
                );
                crate::widgets::form_input(
                    ui,
                    "crm.bank",
                    "Tài khoản ngân hàng",
                    false,
                    &mut self.form.bank_account,
                    "",
                    false,
                );
                ui.columns(3, |cols| {
                    crate::widgets::form_input(
                        &mut cols[0],
                        "crm.credit",
                        "Hạn mức",
                        false,
                        &mut self.form.credit_limit,
                        "",
                        false,
                    );
                    crate::widgets::form_input(
                        &mut cols[1],
                        "crm.value",
                        "Giá trị giao dịch",
                        false,
                        &mut self.form.total_value,
                        "",
                        false,
                    );
                    crate::widgets::form_input(
                        &mut cols[2],
                        "crm.debt",
                        "Công nợ",
                        false,
                        &mut self.form.debt_balance,
                        "",
                        false,
                    );
                });
                ui.columns(2, |cols| {
                    crate::widgets::form_input(
                        &mut cols[0],
                        "crm.tier",
                        "Hạng đối tác",
                        false,
                        &mut self.form.tier,
                        "",
                        false,
                    );
                    crate::widgets::form_select(
                        &mut cols[1],
                        "crm.status",
                        "Trạng thái",
                        false,
                        &mut self.form.status,
                        &["Đang hoạt động", "Đang hợp tác", "Tạm dừng"],
                    );
                });
                crate::widgets::form_input(
                    ui,
                    "crm.manager",
                    "Người phụ trách nội bộ",
                    false,
                    &mut self.form.account_manager,
                    "",
                    false,
                );
                if !self.form_error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
                }
                // The last item's 10px margin collapses into the source footer's 18px gap.
                ui.add_space(8.0);
                crate::widgets::action_row(ui, |ui| {
                    let save = ui.add(
                        egui::Button::new(RichText::new("Lưu đối tác").color(Color32::WHITE))
                            .fill(crate::theme::PRIMARY),
                    );
                    crate::visual_test::record("crm.create.save", save.rect);
                    crate::visual_test::record("crm.create.save.clip", ui.clip_rect());
                    #[cfg(test)]
                    ctx.data_mut(|d| {
                        d.insert_temp(egui::Id::new("test.crm.save"), (save.rect, ui.clip_rect()))
                    });
                    submit = save.clicked();
                    cancel = ui.button("Hủy").clicked();
                });
            },
        );
        self.form_open = !closed && !cancel;
        if submit {
            match self.form.to_input() {
                Ok(input) => {
                    self.form_error.clear();
                    self.create_task = Some(api.create_crm_contact_task(session, &input));
                }
                Err(error) => self.form_error = error,
            }
        }
    }

    fn render_details_dialog(&mut self, ctx: &Context) {
        let Some(contact) = self
            .selected_key
            .as_deref()
            .and_then(|key| self.contacts.iter().find(|contact| contact.key == key))
            .cloned()
        else {
            self.selected_key = None;
            return;
        };
        let (_, closed) =
            crate::widgets::drawer(ctx, "crm.details", "Chi tiết đối tác", 560.0, |ui| {
                ui.spacing_mut().item_spacing.y = 14.0;
                egui::Frame::none()
                    .fill(Color32::from_rgb(248, 250, 252))
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                    .rounding(8.0)
                    .inner_margin(16.0)
                    .show(ui, |ui| {
                        ui.set_width(ui.available_width());
                        ui.label(
                            RichText::new(&contact.code)
                                .size(13.0)
                                .strong()
                                .color(Color32::from_rgb(0, 150, 136)),
                        );
                        ui.add_space(4.0);
                        ui.label(RichText::new(&contact.name).size(18.0).strong());
                        ui.label(
                            RichText::new(format!(
                                "{} · {}",
                                type_label(&contact.contact_type),
                                contact.status
                            ))
                            .size(12.0)
                            .color(Color32::from_rgb(100, 116, 139)),
                        );
                    });
                if contact.legacy_import_status.as_deref() == Some("unverified") {
                    ui.colored_label(
                        Color32::from_rgb(180, 83, 9),
                        "Liên hệ được nhập từ legacy — cần xác minh trước khi tin cậy.",
                    );
                }
                for (id, rows) in [
                    (
                        "contact",
                        vec![
                            ("Người liên hệ", contact.contact_person.clone()),
                            ("Điện thoại", contact.phone.clone()),
                            ("Email", contact.email.clone()),
                            ("MST", contact.tax_code.clone()),
                            ("Địa chỉ", contact.address.clone()),
                        ],
                    ),
                    (
                        "balance",
                        vec![
                            ("Giá trị giao dịch", format_currency(contact.total_value)),
                            ("Công nợ", format_currency(contact.debt_balance)),
                            ("Hạn mức", format_currency(contact.credit_limit)),
                            ("Ngân hàng", contact.bank_account.clone()),
                        ],
                    ),
                ] {
                    egui::Frame::none()
                        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                        .rounding(8.0)
                        .inner_margin(14.0)
                        .show(ui, |ui| {
                            ui.set_width(ui.available_width());
                            ui.spacing_mut().item_spacing.y = 0.0;
                            for (label, value) in rows {
                                ui.horizontal_wrapped(|ui| {
                                    ui.label(
                                        RichText::new(format!("{label}:")).size(13.0).strong(),
                                    );
                                    ui.label(
                                        RichText::new(if value.trim().is_empty() {
                                            "Chưa nhập"
                                        } else {
                                            &value
                                        })
                                        .size(13.0),
                                    );
                                });
                            }
                            ui.push_id(id, |_| {});
                        });
                }
                ui.add_enabled(false, egui::Button::new("Tạo nghiệp vụ liên quan"))
                    .on_disabled_hover_text(
                        "Chưa có luồng tạo hợp đồng/tài liệu từ hồ sơ đối tác.",
                    );
                ui.collapsing("Thông tin bổ sung", |ui| {
                    egui::Grid::new("crm.details.extra").show(ui, |ui| {
                        detail_row(ui, "Ngành nghề", &contact.industry);
                        detail_row(ui, "Hạng", &contact.tier);
                        detail_row(ui, "Người phụ trách", &contact.account_manager);
                        detail_row(ui, "Tạo lúc", &contact.created_at);
                        detail_row(ui, "Cập nhật", &contact.updated_at);
                    });
                });
            });
        if closed {
            self.selected_key = None;
        }
    }
}

fn parse_amount(value: &str, label: &str) -> Result<i64, String> {
    let amount = value
        .trim()
        .parse::<i64>()
        .map_err(|_| format!("{label} phải là số nguyên không âm hợp lệ."))?;
    if !(0..=MAX_AMOUNT).contains(&amount) {
        return Err(format!(
            "{label} phải nằm trong khoảng 0 đến 1.000.000.000.000."
        ));
    }
    Ok(amount)
}

fn format_currency(amount: i64) -> String {
    format!("{} ₫", format_vnd(amount.max(0) as u64))
}

fn type_label(value: &str) -> &'static str {
    match value {
        "customer" => "Khách hàng",
        "supplier" => "Nhà cung cấp",
        "partner" => "Đối tác",
        _ => "Tất cả",
    }
}

fn detail_row(ui: &mut Ui, label: &str, value: &str) {
    ui.label(RichText::new(label).strong());
    ui.label(if value.trim().is_empty() {
        "—"
    } else {
        value
    });
    ui.end_row();
}

#[cfg(test)]
mod tests {
    #[test]
    fn full_crm_form_keeps_its_save_row_inside_the_modal_clip() {
        let ctx = egui::Context::default();
        crate::native_text::setup_fonts(&ctx);
        crate::native_text::setup_style(&ctx);
        let mut view = super::CrmView::default();
        view.form_open = true;
        let session = crate::models::Session {
            token: "test".into(),
            session_id: "test".into(),
            user: crate::models::User {
                id: "test".into(),
                email: "test@kiyo.test".into(),
                name: "Test".into(),
                role: "ADMIN".into(),
                is_active: true,
            },
            endpoint: "http://127.0.0.1:1/api/v1".into(),
            mode: crate::models::StorageMode::LocalAdmin,
        };
        for _ in 0..6 {
            let _ = ctx.run(
                egui::RawInput {
                    screen_rect: Some(egui::Rect::from_min_size(
                        egui::Pos2::ZERO,
                        egui::vec2(1440.0, 900.0),
                    )),
                    ..Default::default()
                },
                |ctx| view.render_create_dialog(ctx, &session, &crate::api::ApiClient),
            );
        }
        let (row, clip) = ctx
            .data(|d| d.get_temp::<(egui::Rect, egui::Rect)>(egui::Id::new("test.footer.bounds")))
            .unwrap();
        assert!(
            row.bottom() <= clip.bottom(),
            "save row {row:?} is clipped by {clip:?}"
        );
    }
    use super::{ContactForm, parse_amount};
    use crate::api::CrmContact;

    #[test]
    fn crm_form_sends_all_legacy_fields_and_keeps_zero_amounts() {
        let form = ContactForm {
            contact_type: "supplier".to_owned(),
            name: " Nhà cung cấp ".to_owned(),
            phone: "0900000000".to_owned(),
            email: "crm@example.test".to_owned(),
            ..ContactForm::default()
        };
        let input = form.to_input().expect("valid CRM form");
        assert_eq!(input.name, "Nhà cung cấp");
        assert_eq!(input.contact_type, "supplier");
        assert_eq!(input.phone, "0900000000");
        assert_eq!(input.credit_limit, 0);
        assert_eq!(input.status, "Đang hoạt động");
    }

    #[test]
    fn crm_amount_validation_rejects_negative_fraction_and_overflow() {
        assert!(parse_amount("-1", "amount").is_err());
        assert!(parse_amount("1.2", "amount").is_err());
        assert!(parse_amount("1000000000001", "amount").is_err());
    }

    #[test]
    fn crm_contact_dto_decodes_legacy_type_and_camel_case_fields() {
        let contact: CrmContact = serde_json::from_value(serde_json::json!({
            "key":"crm-1", "code":"KH-20261008-A1B2C3D4", "name":"Company", "type":"customer",
            "taxCode":"TAX", "contactPerson":"Person", "bankAccount":"123", "totalValue":100,
            "createdAt":"2026-10-08T00:00:00Z", "updatedAt":"2026-10-08T00:00:00Z"
        }))
        .expect("legacy CRM DTO");
        assert_eq!(contact.contact_type, "customer");
        assert_eq!(contact.tax_code, "TAX");
        assert_eq!(contact.total_value, 100);
        assert_eq!(contact.legacy_import_status, None);

        let imported: CrmContact = serde_json::from_value(serde_json::json!({
            "key":"legacy-1", "type":"supplier", "legacyImportStatus":"unverified"
        }))
        .expect("import status DTO");
        assert_eq!(imported.legacy_import_status.as_deref(), Some("unverified"));
    }
}
