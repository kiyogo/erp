use std::time::Duration;

use egui::{Color32, RichText, Ui};
use serde_json::{Value, json};
use web_time::Instant;

use crate::{
    api::{ApiClient, ApiTask, GenericCollectionResponse, GenericRecordResponse},
    models::Session,
    views::employees::format_vnd,
    widgets::{self, Metric, TableColumn, TagTone},
};

const SCOPE: &str = "asset_systems";
const CATEGORIES: &[&str] = &[
    "Vị trí & Tủ Rack",
    "Định mức cấp phát chức danh",
    "Quy tắc sinh mã tự động",
    "Nhóm & Loại tài sản",
    "Mẫu văn bản & Quy trình",
    "Nhà cung cấp",
];
const STATUSES: &[&str] = &["Đang áp dụng", "Tạm ngưng"];
const REFRESH: Duration = Duration::from_secs(30);

fn category_for_route(path: &str) -> Option<&'static str> {
    // The legacy /org route has no category branch and starts on all settings.
    match path
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or_default()
    {
        "types" | "groups" => Some(CATEGORIES[3]),
        "locations" => Some(CATEGORIES[0]),
        "quotas" => Some(CATEGORIES[1]),
        "templates" => Some(CATEGORIES[4]),
        "suppliers" => Some(CATEGORIES[5]),
        _ => None,
    }
}

fn text<'a>(row: &'a Value, field: &str) -> &'a str {
    row.get(field).and_then(Value::as_str).unwrap_or_default()
}

fn known(value: &str) -> &str {
    if value.trim().is_empty() {
        "Chưa có dữ liệu"
    } else {
        value
    }
}

fn matches(row: &Value, category: &str, query: &str) -> bool {
    (category.is_empty() || text(row, "category") == category)
        && (query.trim().is_empty()
            || [
                "code",
                "name",
                "category",
                "scope",
                "allocatedRole",
                "details",
            ]
            .iter()
            .any(|field| {
                text(row, field)
                    .to_lowercase()
                    .contains(&query.trim().to_lowercase())
            }))
}

fn number_label(row: &Value, field: &str, money: bool) -> String {
    let value = row.get(field).and_then(|value| {
        value
            .as_u64()
            .or_else(|| value.as_str()?.trim().parse::<u64>().ok())
    });
    match value {
        Some(value) if money => format!("{} ₫", format_vnd(value)),
        Some(value) => format!("{value} tháng"),
        None => "Chưa có dữ liệu".to_owned(),
    }
}

#[derive(Default)]
struct ConfigDraft {
    code: String,
    category: String,
    name: String,
    details: String,
    scope: String,
    allocated_role: String,
    standard_package: String,
    budget_limit: String,
    depreciation_months: String,
    prefix_pattern: String,
    responsible_person: String,
    status: String,
    notes: String,
}

impl ConfigDraft {
    fn new(category: &str) -> Self {
        Self {
            category: if CATEGORIES.contains(&category) {
                category
            } else {
                CATEGORIES[0]
            }
            .into(),
            status: STATUSES[0].into(),
            ..Self::default()
        }
    }

    fn build(&self, records: &[Value]) -> Result<Value, String> {
        for (value, label, limit, required) in [
            (&self.code, "Mã cấu hình", 80, true),
            (&self.name, "Tên quy chuẩn", 200, true),
            (&self.details, "Nội dung quy định", 4000, true),
            (&self.scope, "Phạm vi áp dụng", 200, true),
            (&self.allocated_role, "Chức danh áp dụng", 200, true),
            (&self.responsible_person, "Người phụ trách", 200, true),
            (&self.standard_package, "Gói thiết bị", 2000, false),
            (&self.prefix_pattern, "Pattern sinh mã", 200, false),
            (&self.notes, "Ghi chú", 4000, false),
        ] {
            if required && value.trim().is_empty() {
                return Err(format!("{label} không được để trống."));
            }
            if value.trim().chars().count() > limit {
                return Err(format!("{label} tối đa {limit} ký tự."));
            }
        }
        if !CATEGORIES.contains(&self.category.as_str())
            || !STATUSES.contains(&self.status.as_str())
        {
            return Err("Phân loại hoặc trạng thái không hợp lệ.".into());
        }
        if records.iter().any(|row| {
            text(row, "code")
                .trim()
                .eq_ignore_ascii_case(self.code.trim())
        }) {
            return Err("Mã cấu hình đã tồn tại; hãy chọn mã khác.".into());
        }
        let mut record = json!({
            "key": format!("asset-config-{}", chrono::Utc::now().timestamp_micros()),
            "code": self.code.trim(), "name": self.name.trim(), "category": self.category,
            "details": self.details.trim(), "scope": self.scope.trim(),
            "allocatedRole": self.allocated_role.trim(), "standardPackage": self.standard_package.trim(),
            "prefixPattern": self.prefix_pattern.trim(), "responsiblePerson": self.responsible_person.trim(),
            "status": self.status, "notes": self.notes.trim(),
        });
        for (input, field, label, max) in [
            (
                &self.budget_limit,
                "budgetLimit",
                "Hạn mức kinh phí",
                9_007_199_254_740_991_u64,
            ),
            (
                &self.depreciation_months,
                "depreciationMonthsDefault",
                "Số tháng khấu hao",
                u32::MAX as u64,
            ),
        ] {
            if !input.trim().is_empty() {
                let value = input
                    .trim()
                    .parse::<u64>()
                    .ok()
                    .filter(|value| *value <= max)
                    .ok_or_else(|| format!("{label} phải là số nguyên không âm hợp lệ."))?;
                record[field] = json!(value);
            }
        }
        Ok(record)
    }
}

#[derive(Default)]
pub struct AssetSystemView {
    account: String,
    route: String,
    records: Vec<Value>,
    revision: String,
    loaded: bool,
    load_task: Option<ApiTask<GenericCollectionResponse>>,
    create_task: Option<ApiTask<GenericRecordResponse>>,
    status_task: Option<ApiTask<GenericRecordResponse>>,
    last_load: Option<Instant>,
    category: String,
    search: String,
    page: usize,
    page_size: usize,
    form_open: bool,
    draft: ConfigDraft,
    form_error: String,
    detail_key: Option<String>,
    error: String,
    notice: String,
}

impl AssetSystemView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn busy(&self) -> bool {
        self.load_task.is_some() || self.create_task.is_some() || self.status_task.is_some()
    }

    fn select_route(&mut self, path: &str) {
        if self.route != path {
            self.route = path.into();
            self.category = category_for_route(path).unwrap_or_default().into();
            self.search.clear();
            self.page = 0;
            self.detail_key = None;
            if self.create_task.is_none() {
                self.form_open = false;
                self.draft = ConfigDraft::default();
                self.form_error.clear();
            }
        }
    }

    fn load(&mut self, session: &Session, api: &ApiClient) {
        if !self.busy() {
            self.load_task = Some(api.list_generic_collection_task(session, SCOPE));
        }
    }

    fn accept_record(&mut self, response: GenericRecordResponse) {
        self.records
            .retain(|row| text(row, "key") != text(&response.record, "key"));
        self.records.insert(0, response.record);
        self.revision = response.revision;
        self.loaded = true;
        self.error.clear();
        self.notice =
            "Đã lưu metadata trên máy chủ. Chưa xác nhận áp dụng tự động vào nghiệp vụ tài sản."
                .into();
        self.last_load = None;
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if let Some(result) = self.load_task.as_ref().and_then(ApiClient::poll) {
            self.load_task = None;
            self.last_load = Some(Instant::now());
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
        if let Some(result) = self.create_task.as_ref().and_then(ApiClient::poll) {
            self.create_task = None;
            match result {
                Ok(response) => {
                    self.accept_record(response);
                    self.form_open = false;
                    self.draft = ConfigDraft::default();
                    self.form_error.clear();
                }
                Err(error) => {
                    self.form_error = error;
                    self.last_load = None;
                }
            }
        }
        if let Some(result) = self.status_task.as_ref().and_then(ApiClient::poll) {
            self.status_task = None;
            match result {
                Ok(response) => self.accept_record(response),
                Err(error) => {
                    self.notice = format!("Không thể đổi trạng thái metadata: {error}");
                    self.error = error;
                    self.last_load = None;
                }
            }
        }
        if !self.busy() && self.last_load.is_none_or(|last| last.elapsed() >= REFRESH) {
            self.load(session, api);
        }
        ctx.request_repaint_after(if self.busy() {
            Duration::from_millis(80)
        } else {
            REFRESH
        });
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        path: &str,
    ) {
        if session.user.role != "ADMIN" {
            self.reset();
            ui.label("Bạn không có quyền quản trị hệ thống tài sản.");
            return;
        }
        let account = format!(
            "{}\n{}\n{}",
            session.endpoint, session.user.id, session.session_id
        );
        if self.account != account {
            self.reset();
            self.account = account;
        }
        self.select_route(path);
        self.poll(ctx, session, api);
        let (reload, toggle) = self.render_content(ui);
        if reload {
            self.load(session, api);
        }
        if let Some(key) = toggle {
            self.toggle_status(session, api, &key);
        }
        self.render_detail(ctx);
        self.render_form(ctx, session, api);
    }

    fn render_content(&mut self, ui: &mut Ui) -> (bool, Option<String>) {
        self.page_size = self.page_size.max(8);
        ui.add_space(8.0);
        let count = |category: &str| {
            self.records
                .iter()
                .filter(|row| text(row, "category") == category)
                .count()
        };
        let active = self
            .records
            .iter()
            .filter(|row| text(row, "status") == STATUSES[0])
            .count();
        let values = [
            format!("{} địa điểm & tủ", count(CATEGORIES[0])),
            format!("{} gói tiêu chuẩn", count(CATEGORIES[1])),
            format!(
                "{} quy tắc / {} mẫu",
                count(CATEGORIES[2]),
                count(CATEGORIES[4])
            ),
            format!("{active}/{} quy chuẩn", self.records.len()),
        ];
        let labels = [
            "Vị trí lưu kho & Tủ Rack IDC",
            "Định mức cấp phát theo chức danh",
            "Quy tắc sinh mã & Mẫu văn bản",
            "Tham số có trạng thái đang áp dụng",
        ];
        let metrics = labels
            .iter()
            .enumerate()
            .map(|(index, label)| Metric {
                label,
                value: if self.loaded {
                    values[index].clone()
                } else {
                    "—".into()
                },
                detail: "Theo metadata đã lưu; chưa xác minh áp dụng nghiệp vụ",
                color: if index == 1 {
                    Color32::from_rgb(37, 99, 235)
                } else {
                    crate::theme::PRIMARY
                },
                value_size: 22.0,
            })
            .collect::<Vec<_>>();
        widgets::metrics(ui, "asset.system.metrics", &metrics);
        ui.add_space(16.0);
        ui.horizontal_wrapped(|ui| {
            for category in std::iter::once("").chain(CATEGORIES.iter().copied()) {
                let title = if category.is_empty() {
                    "Tất cả thiết lập"
                } else {
                    category
                };
                if ui
                    .selectable_label(self.category == category, title)
                    .clicked()
                {
                    self.category = category.into();
                    self.page = 0;
                }
            }
        });
        ui.add_space(14.0);
        let (rect, _) = ui.allocate_exact_size(
            egui::vec2(ui.available_width().min(380.0), 32.0),
            egui::Sense::hover(),
        );
        if widgets::search_input(
            ui,
            rect,
            &mut self.search,
            "Tìm mã, tên, phạm vi, chức danh, mô tả...",
        )
        .changed()
        {
            self.page = 0;
        }
        let mut reload = false;
        ui.add_space(10.0);
        ui.horizontal_wrapped(|ui| {
            reload = ui
                .add_enabled(!self.busy(), egui::Button::new("Làm mới"))
                .clicked();
            ui.add_enabled(false, egui::Button::new("Xuất Excel"))
                .on_disabled_hover_text("Chưa có dịch vụ tạo tệp danh mục quy chuẩn.");
            let create = ui.add_enabled(
                self.loaded && !self.busy() && self.error.is_empty(),
                egui::Button::new("Thêm thiết lập mới"),
            );
            crate::visual_test::record("asset.system.add", create.rect);
            if create.clicked() {
                self.draft = ConfigDraft::new(&self.category);
                self.form_error.clear();
                self.form_open = true;
            }
        });
        if self.busy() {
            ui.spinner();
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
        }
        if !self.notice.is_empty() {
            ui.add(egui::Label::new(&self.notice).wrap());
        }
        ui.add_space(12.0);
        let filtered = self
            .records
            .iter()
            .filter(|row| matches(row, &self.category, &self.search))
            .collect::<Vec<_>>();
        self.page = self
            .page
            .min(filtered.len().div_ceil(self.page_size).max(1) - 1);
        let shown = filtered
            .iter()
            .skip(self.page * self.page_size)
            .take(self.page_size)
            .copied()
            .collect::<Vec<_>>();
        let columns = [
            TableColumn {
                title: "Mã & Phân loại",
                width: 210.0,
            },
            TableColumn {
                title: "Tên quy chuẩn & Nội dung",
                width: 360.0,
            },
            TableColumn {
                title: "Gói tiêu chuẩn & Hạn mức",
                width: 235.0,
            },
            TableColumn {
                title: "Người quản lý",
                width: 170.0,
            },
            TableColumn {
                title: "Trạng thái khai báo",
                width: 145.0,
            },
            TableColumn {
                title: "Thao tác",
                width: 135.0,
            },
        ];
        let mut selected = None;
        let mut toggle = None;
        widgets::table_with_row_height(
            ui,
            "asset.system.table",
            &columns,
            shown.len(),
            100.0,
            |ui, row, column| {
                let item = shown[row];
                match column {
                    0 => {
                        ui.strong(known(text(item, "code")));
                        ui.label(known(text(item, "category")));
                    }
                    1 => {
                        ui.strong(known(text(item, "name")));
                        ui.add(egui::Label::new(known(text(item, "details"))).truncate());
                        ui.label(format!("Phạm vi: {}", known(text(item, "scope"))));
                        ui.label(format!("Chức danh: {}", known(text(item, "allocatedRole"))));
                    }
                    2 => {
                        ui.add(egui::Label::new(known(text(item, "standardPackage"))).truncate());
                        ui.label(number_label(item, "budgetLimit", true));
                        ui.label(number_label(item, "depreciationMonthsDefault", false));
                    }
                    3 => {
                        ui.label(known(text(item, "responsiblePerson")));
                    }
                    4 => widgets::tag(
                        ui,
                        known(text(item, "status")),
                        if text(item, "status") == STATUSES[0] {
                            TagTone::Success
                        } else {
                            TagTone::Neutral
                        },
                    ),
                    _ => {
                        if ui.button("Xem").clicked() {
                            selected = Some(text(item, "key").to_owned());
                        }
                        let status = text(item, "status");
                        if ui
                            .add_enabled(
                                !self.busy()
                                    && self.error.is_empty()
                                    && STATUSES.contains(&status)
                                    && !text(item, "key").is_empty(),
                                egui::Button::new(if status == STATUSES[0] {
                                    "Tạm ngưng"
                                } else {
                                    "Kích hoạt"
                                }),
                            )
                            .clicked()
                        {
                            toggle = Some(text(item, "key").to_owned());
                        }
                    }
                }
            },
        );
        if let Some(key) = selected {
            self.detail_key = Some(key);
        }
        widgets::pagination(
            ui,
            "asset.system.pagination",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );
        if self.loaded && filtered.is_empty() {
            ui.label("Chưa có thiết lập phù hợp với bộ lọc.");
        }
        (reload, toggle)
    }

    fn toggle_status(&mut self, session: &Session, api: &ApiClient, key: &str) {
        if session.user.role != "ADMIN" || self.busy() || !self.loaded || !self.error.is_empty() {
            return;
        }
        let Some(item) = self.records.iter().find(|row| text(row, "key") == key) else {
            return;
        };
        let next = match text(item, "status") {
            "Đang áp dụng" => "Tạm ngưng",
            "Tạm ngưng" => "Đang áp dụng",
            _ => return,
        };
        // This scope has no server revision enforcement; patch only its status metadata.
        self.status_task = Some(api.patch_generic_collection_record_task(
            session,
            SCOPE,
            key,
            &json!({"status": next}),
            (!self.revision.is_empty()).then_some(self.revision.as_str()),
        ));
        self.notice.clear();
    }

    fn render_detail(&mut self, ctx: &egui::Context) {
        let Some(key) = self.detail_key.as_deref() else {
            return;
        };
        let Some(item) = self.records.iter().find(|row| text(row, "key") == key) else {
            self.detail_key = None;
            return;
        };
        let (_, closed) = widgets::drawer(
            ctx,
            "asset.system.detail",
            "Hồ sơ quy chuẩn cấu hình",
            620.0,
            |ui| {
                ui.add(
                    egui::Label::new(RichText::new(known(text(item, "name"))).strong().size(17.0))
                        .wrap(),
                );
                for (label, field) in [
                    ("Mã cấu hình", "code"),
                    ("Phân loại", "category"),
                    ("Phạm vi", "scope"),
                    ("Chức danh", "allocatedRole"),
                    ("Gói tiêu chuẩn", "standardPackage"),
                    ("Nội dung quy định", "details"),
                    ("Người phụ trách", "responsiblePerson"),
                    ("Pattern sinh mã khai báo", "prefixPattern"),
                    ("Trạng thái khai báo", "status"),
                    ("Ghi chú", "notes"),
                ] {
                    ui.add_space(8.0);
                    ui.label(RichText::new(label).strong());
                    ui.add(egui::Label::new(known(text(item, field))).wrap());
                }
                ui.label(format!(
                    "Hạn mức khai báo: {}",
                    number_label(item, "budgetLimit", true)
                ));
                ui.label(format!(
                    "Khấu hao mặc định khai báo: {}",
                    number_label(item, "depreciationMonthsDefault", false)
                ));
                ui.add_space(12.0);
                ui.label("Lưu quy chuẩn là lưu metadata; chưa có xác nhận tự động áp dụng, sinh mã nghiệp vụ hoặc tạo văn bản.");
                ui.horizontal_wrapped(|ui| {
                    ui.add_enabled(false, egui::Button::new("Sinh mã thử nghiệm"))
                        .on_disabled_hover_text("Chưa có dịch vụ cấp và kiểm tra mã duy nhất.");
                    ui.add_enabled(false, egui::Button::new("In quy chuẩn (PDF)"))
                        .on_disabled_hover_text("Chưa có dịch vụ tạo tệp PDF quy chuẩn.");
                });
            },
        );
        if closed {
            self.detail_key = None;
        }
    }

    fn form_contents(&mut self, ui: &mut Ui) -> (bool, bool) {
        ui.label("Nhập giá trị thực tế. Để trống số liệu chưa biết; không mặc định ngân sách hoặc kỳ khấu hao.");
        ui.add_space(12.0);
        widgets::form_input(
            ui,
            "asset.config.code",
            "Mã cấu hình / Quy chuẩn",
            true,
            &mut self.draft.code,
            "Mã nội bộ",
            false,
        );
        widgets::form_select(
            ui,
            "asset.config.category",
            "Phân loại thiết lập",
            true,
            &mut self.draft.category,
            CATEGORIES,
        );
        widgets::form_input(
            ui,
            "asset.config.name",
            "Tên danh mục / Tiêu đề quy chuẩn",
            true,
            &mut self.draft.name,
            "Tên thiết lập",
            false,
        );
        widgets::form_textarea(
            ui,
            "asset.config.details",
            "Nội dung quy định / Mô tả kỹ thuật",
            true,
            &mut self.draft.details,
            "Chi tiết quy định",
            2,
        );
        widgets::form_input(
            ui,
            "asset.config.scope",
            "Phạm vi áp dụng",
            true,
            &mut self.draft.scope,
            "Đơn vị hoặc địa điểm áp dụng",
            false,
        );
        widgets::form_input(
            ui,
            "asset.config.role",
            "Chức danh / Đối tượng áp dụng",
            true,
            &mut self.draft.allocated_role,
            "Chức danh thực tế",
            false,
        );
        widgets::form_input(
            ui,
            "asset.config.package",
            "Gói thiết bị / Cấu hình tiêu chuẩn",
            false,
            &mut self.draft.standard_package,
            "Gói thiết bị",
            false,
        );
        widgets::form_input(
            ui,
            "asset.config.budget",
            "Hạn mức kinh phí tối đa (VNĐ)",
            false,
            &mut self.draft.budget_limit,
            "Chưa có dữ liệu",
            false,
        );
        widgets::form_input(
            ui,
            "asset.config.months",
            "Khấu hao mặc định (Tháng)",
            false,
            &mut self.draft.depreciation_months,
            "Chưa có dữ liệu",
            false,
        );
        widgets::form_input(
            ui,
            "asset.config.pattern",
            "Pattern sinh mã khai báo",
            false,
            &mut self.draft.prefix_pattern,
            "TS-{YYYY}-{####}",
            false,
        );
        widgets::form_input(
            ui,
            "asset.config.person",
            "Người phụ trách kiểm soát / Ban hành",
            true,
            &mut self.draft.responsible_person,
            "Người phụ trách thực tế",
            false,
        );
        widgets::form_select(
            ui,
            "asset.config.status",
            "Trạng thái khai báo",
            true,
            &mut self.draft.status,
            STATUSES,
        );
        widgets::form_textarea(
            ui,
            "asset.config.notes",
            "Ghi chú",
            false,
            &mut self.draft.notes,
            "Ghi chú",
            2,
        );
        if !self.form_error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
        }
        let mut save = false;
        let mut cancel = false;
        widgets::action_row(ui, |ui| {
            save = ui
                .add_enabled(
                    self.loaded && !self.busy() && self.error.is_empty(),
                    egui::Button::new("Lưu thiết lập quy chuẩn"),
                )
                .clicked();
            cancel = ui
                .add_enabled(self.create_task.is_none(), egui::Button::new("Hủy bỏ"))
                .clicked();
        });
        (save, cancel)
    }

    fn render_form(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if !self.form_open {
            return;
        }
        let ((save, cancel), closed) = widgets::modal(
            ctx,
            "asset.system.create",
            "Thêm thiết lập quy chuẩn hệ thống tài sản",
            760.0,
            self.create_task.is_some(),
            |ui| self.form_contents(ui),
        );
        if (closed || cancel) && self.create_task.is_none() {
            self.form_open = false;
            self.draft = ConfigDraft::default();
            self.form_error.clear();
        }
        if save
            && session.user.role == "ADMIN"
            && self.loaded
            && !self.busy()
            && self.error.is_empty()
        {
            match self.draft.build(&self.records) {
                Ok(record) => {
                    self.create_task = Some(api.create_generic_collection_record_task(
                        session,
                        SCOPE,
                        &record,
                        (!self.revision.is_empty()).then_some(self.revision.as_str()),
                    ));
                    self.form_error.clear();
                    self.notice.clear();
                }
                Err(error) => self.form_error = error,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_draft() -> ConfigDraft {
        ConfigDraft {
            code: "CFG-TEST".into(),
            name: "Kho thiết bị".into(),
            details: "Tầng 2".into(),
            scope: "Trụ sở".into(),
            allocated_role: "Kỹ thuật".into(),
            responsible_person: "Người quản lý".into(),
            ..ConfigDraft::new(CATEGORIES[0])
        }
    }

    #[test]
    fn route_changes_select_legacy_categories_and_org_starts_on_all() {
        let mut view = AssetSystemView::default();
        for (suffix, expected) in [
            ("types", CATEGORIES[3]),
            ("groups", CATEGORIES[3]),
            ("org", ""),
            ("locations", CATEGORIES[0]),
            ("suppliers", CATEGORIES[5]),
            ("quotas", CATEGORIES[1]),
            ("templates", CATEGORIES[4]),
            ("", ""),
        ] {
            view.category = "previous".into();
            view.search = "old search".into();
            view.select_route(&format!("/admin/assets/system/{suffix}"));
            assert_eq!(view.category, expected, "{suffix}");
            assert!(view.search.is_empty());
        }
        let item = json!({"code":"CFG-1","name":"Tủ Rack","category":CATEGORIES[0],"scope":"Chi nhánh","allocatedRole":"Kỹ thuật","details":"Thiết bị mạng"});
        assert!(matches(&item, CATEGORIES[0], "CHI NHÁNH"));
        assert!(matches(&item, "", "kỹ thuật"));
        assert!(!matches(&item, CATEGORIES[3], ""));
    }

    #[test]
    fn drafts_validate_real_values_without_fabricated_numeric_defaults() {
        let mut draft = valid_draft();
        let record = draft.build(&[]).unwrap();
        assert!(record.get("budgetLimit").is_none());
        assert!(record.get("depreciationMonthsDefault").is_none());
        assert!(draft.build(&[record]).is_err());
        for bad in ["-1", "NaN", "1.5", "9007199254740992"] {
            draft.budget_limit = bad.into();
            assert!(draft.build(&[]).is_err(), "{bad}");
        }
        draft.budget_limit = "0".into();
        draft.depreciation_months = "0".into();
        let zero = draft.build(&[]).unwrap();
        assert_eq!(zero["budgetLimit"], 0);
        assert_eq!(zero["depreciationMonthsDefault"], 0);
        assert_eq!(number_label(&zero, "budgetLimit", true), "0 ₫");
        assert_eq!(
            number_label(&json!({}), "budgetLimit", true),
            "Chưa có dữ liệu"
        );
        draft.scope.clear();
        assert!(draft.build(&[]).is_err());
        draft = valid_draft();
        draft.category = "invented".into();
        assert!(draft.build(&[]).is_err());
    }

    #[test]
    fn account_reset_discards_records_forms_and_details() {
        let mut view = AssetSystemView {
            account: "previous".into(),
            loaded: true,
            records: vec![json!({"key":"private"})],
            form_open: true,
            draft: valid_draft(),
            detail_key: Some("private".into()),
            ..Default::default()
        };
        view.reset();
        assert!(view.records.is_empty());
        assert!(!view.loaded && !view.form_open);
        assert!(view.detail_key.is_none() && view.draft.responsible_person.is_empty());
    }

    #[test]
    fn employee_access_clears_admin_data_without_starting_requests() {
        let session = Session {
            token: String::new(),
            session_id: "test".into(),
            endpoint: "http://invalid".into(),
            mode: crate::models::StorageMode::KiyoCloud,
            user: crate::models::User {
                id: "employee".into(),
                email: String::new(),
                name: String::new(),
                role: "USER".into(),
                is_active: true,
            },
        };
        let mut view = AssetSystemView {
            loaded: true,
            records: vec![json!({"key":"private"})],
            ..Default::default()
        };
        let ctx = egui::Context::default();
        let _ = ctx.run(Default::default(), |ctx| {
            egui::CentralPanel::default().show(ctx, |ui| {
                view.render(
                    ui,
                    ctx,
                    &session,
                    &ApiClient::default(),
                    "/admin/assets/system",
                );
            });
        });
        assert!(view.records.is_empty() && !view.loaded && !view.busy());
    }

    #[test]
    fn catalogue_form_and_detail_stay_inside_narrow_and_wide_layouts() {
        for width in [320.0, 390.0, 768.0, 1440.0] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            crate::native_text::setup_style(&ctx);
            let long = "Thông tin quy chuẩn dài cần xuống dòng ".repeat(12);
            let item = json!({"key":"config-1", "code":"CFG-LONG", "name":long, "details":long,
                "scope":long, "allocatedRole":long, "standardPackage":long, "responsiblePerson":long,
                "category":CATEGORIES[0], "status":STATUSES[0]});
            let mut view = AssetSystemView {
                loaded: true,
                records: vec![item],
                draft: valid_draft(),
                ..Default::default()
            };
            for form in [false, true] {
                for _ in 0..2 {
                    let _ = ctx.run(
                        egui::RawInput {
                            screen_rect: Some(egui::Rect::from_min_size(
                                egui::Pos2::ZERO,
                                egui::vec2(width, 1000.0),
                            )),
                            ..Default::default()
                        },
                        |ctx| {
                            egui::CentralPanel::default().show(ctx, |ui| {
                                let right = ui.max_rect().right();
                                if form {
                                    view.form_contents(ui);
                                } else {
                                    view.render_content(ui);
                                }
                                assert!(
                                    ui.min_rect().right() <= right + 1.0,
                                    "overflow at width {width}, form {form}: {:?}",
                                    ui.min_rect()
                                );
                            });
                            view.detail_key = Some("config-1".into());
                            view.render_detail(ctx);
                        },
                    );
                }
                let drawer = ctx.memory(|memory| {
                    memory.area_rect(egui::Id::new(("asset.system.detail", "drawer")))
                });
                let rect = drawer.expect("detail drawer must be mounted");
                assert!(rect.width() <= width && rect.right() <= width + 1.0);
            }
        }
    }
}
