use crate::widgets;
use std::time::Duration;

use chrono::Utc;
use egui::{Color32, RichText, Ui};
use serde_json::{Value, json};
use web_time::Instant;

use crate::{
    api::{ApiClient, ApiTask, GenericCollectionResponse, GenericRecordResponse},
    models::Session,
    views::employees::format_vnd,
};

const SCOPE: &str = "asset_materials";
const PAGE_SIZE: usize = 8;
const REFRESH_INTERVAL: Duration = Duration::from_secs(30);
const CATEGORIES: [&str; 5] = [
    "Linh kiện Máy chủ & Lưu trữ",
    "Ổ cứng & SSD Enterprise",
    "Thiết bị Quang & Mạng",
    "Phụ kiện Dây cáp & Cáp nguồn",
    "Vật tư Tiêu hao & CCDC",
];
const STATUS_SAFE: &str = "Đủ tồn kho an toàn";
const STATUS_LOW: &str = "Cảnh báo sắp hết (Dưới mức tối thiểu)";
const STATUS_EMPTY: &str = "Hết hàng tồn (Out of Stock)";

#[derive(Default)]
struct MaterialDraft {
    code: String,
    name: String,
    category: String,
    unit: String,
    specifications: String,
    supplier: String,
    stock_qty: String,
    min_threshold: String,
    max_threshold: String,
    unit_price: String,
    warehouse_location: String,
    compatible_assets: String,
    warranty_months: String,
}

impl MaterialDraft {
    fn for_new(row_count: usize) -> Self {
        Self {
            code: format!("LK-{}-0{}", Utc::now().format("%Y"), row_count + 1),
            category: CATEGORIES[0].to_owned(),
            unit: "Cái".to_owned(),
            ..Self::default()
        }
    }

    fn build(&self, row_count: usize, handler: &str) -> Result<Value, String> {
        for (value, label) in [
            (&self.code, "Mã linh kiện / vật tư"),
            (&self.name, "Tên vật tư"),
            (&self.category, "Phân nhóm vật tư"),
            (&self.unit, "Đơn vị tính"),
            (&self.specifications, "Thông số kỹ thuật"),
            (&self.supplier, "Nhà cung cấp / hãng sản xuất"),
            (&self.warehouse_location, "Vị trí ngăn tủ kho"),
        ] {
            if value.trim().is_empty() {
                return Err(format!("{label} không được để trống."));
            }
        }

        let stock_qty = parse_non_negative(&self.stock_qty, "Số lượng ban đầu")?;
        let min_threshold = parse_positive(&self.min_threshold, "Tồn tối thiểu")?;
        let max_threshold = if self.max_threshold.trim().is_empty() {
            0
        } else {
            parse_positive(&self.max_threshold, "Tồn tối đa")?
        };
        let unit_price = parse_non_negative(&self.unit_price, "Đơn giá nhập")?;
        let warranty_months = if self.warranty_months.trim().is_empty() {
            0
        } else {
            parse_non_negative(&self.warranty_months, "Thời hạn bảo hành")?
        };
        let key = format!("mat-{}-{row_count}", Utc::now().timestamp_millis());
        let date = Utc::now().format("%Y-%m-%d").to_string();
        let millis = Utc::now().timestamp_millis().to_string();
        let status = stock_status(stock_qty, min_threshold);

        Ok(json!({
            "key": key,
            "materialCode": self.code.trim(),
            "materialName": self.name.trim(),
            "category": self.category.trim(),
            "unit": self.unit.trim(),
            "specifications": self.specifications.trim(),
            "supplier": self.supplier.trim(),
            "stockQty": stock_qty,
            "minThreshold": min_threshold,
            "maxThreshold": max_threshold,
            "unitPrice": unit_price,
            "warehouseLocation": self.warehouse_location.trim(),
            "compatibleAssets": self.compatible_assets.trim(),
            "warrantyMonths": warranty_months,
            "status": status,
            "notes": "",
            "stockHistory": [{
                "id": millis,
                "type": "Nhập kho",
                "ticketCode": format!("NK-{}-{}", Utc::now().format("%Y"), &millis[millis.len().saturating_sub(3)..]),
                "date": date,
                "qty": stock_qty,
                "unitPrice": unit_price,
                "targetAsset": "Kho tổng",
                "handler": handler,
                "reason": "Nhập kho ban đầu"
            }]
        }))
    }
}

#[derive(Default)]
struct StockDraft {
    action_type: String,
    ticket_code: String,
    amount: String,
    date: String,
    unit_price: String,
    target_asset: String,
    handler: String,
    reason: String,
}

impl StockDraft {
    fn for_item(item: &Value, action_type: &str) -> Self {
        let prefix = if action_type == "import" { "NK" } else { "XK" };
        let millis = Utc::now().timestamp_millis().to_string();
        Self {
            action_type: action_type.to_owned(),
            ticket_code: format!(
                "{prefix}-{}-{}",
                Utc::now().format("%Y"),
                &millis[millis.len().saturating_sub(3)..]
            ),
            amount: String::new(),
            date: Utc::now().format("%Y-%m-%d").to_string(),
            unit_price: number(item, "unitPrice").to_string(),
            target_asset: String::new(),
            handler: String::new(),
            reason: String::new(),
        }
    }

    fn build_patch(&self, item: &Value) -> Result<Value, String> {
        for (value, label) in [
            (&self.ticket_code, "Số phiếu chứng từ"),
            (&self.date, "Ngày thực hiện"),
            (&self.target_asset, "Tài sản nhận / mục đích xuất dùng"),
            (&self.handler, "Người thực hiện / thủ kho"),
        ] {
            if value.trim().is_empty() {
                return Err(format!("{label} không được để trống."));
            }
        }
        let amount = parse_positive(&self.amount, "Số lượng")?;
        let unit_price = if self.unit_price.trim().is_empty() {
            number(item, "unitPrice")
        } else {
            parse_non_negative(&self.unit_price, "Đơn giá")?
        };
        let old_qty = number(item, "stockQty");
        let importing = self.action_type == "import";
        // Match the legacy screen: exports are clamped at zero rather than rejected.
        let next_qty = if importing {
            old_qty.saturating_add(amount)
        } else {
            old_qty.saturating_sub(amount).max(0)
        };
        let min_threshold = number(item, "minThreshold");
        let mut history = item
            .get("stockHistory")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        history.insert(
            0,
            json!({
                "id": Utc::now().timestamp_millis().to_string(),
                "type": if importing { "Nhập kho" } else { "Xuất kho thay thế" },
                "ticketCode": self.ticket_code.trim(),
                "date": self.date.trim(),
                "qty": amount,
                "unitPrice": unit_price,
                "targetAsset": self.target_asset.trim(),
                "handler": self.handler.trim(),
                "reason": self.reason.trim(),
            }),
        );
        Ok(json!({
            "stockQty": next_qty,
            "status": stock_status(next_qty, min_threshold),
            "stockHistory": history,
        }))
    }
}

fn parse_non_negative(value: &str, label: &str) -> Result<i64, String> {
    let parsed = value
        .trim()
        .parse::<i64>()
        .map_err(|_| format!("{label} phải là số nguyên không âm."))?;
    if parsed < 0 {
        return Err(format!("{label} không được âm."));
    }
    Ok(parsed)
}

fn parse_positive(value: &str, label: &str) -> Result<i64, String> {
    let parsed = parse_non_negative(value, label)?;
    if parsed == 0 {
        return Err(format!("{label} phải lớn hơn 0."));
    }
    Ok(parsed)
}

fn stock_status(qty: i64, min_threshold: i64) -> &'static str {
    if qty == 0 {
        STATUS_EMPTY
    } else if qty <= min_threshold {
        STATUS_LOW
    } else {
        STATUS_SAFE
    }
}

fn text(record: &Value, field: &str) -> String {
    record
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned()
}

fn number(record: &Value, field: &str) -> i64 {
    record
        .get(field)
        .and_then(|value| {
            value
                .as_i64()
                .or_else(|| value.as_u64().and_then(|number| i64::try_from(number).ok()))
                .or_else(|| value.as_str().and_then(|number| number.parse().ok()))
        })
        .unwrap_or_default()
}

pub struct AssetMaterialsView {
    records: Vec<Value>,
    revision: String,
    pending_load: Option<ApiTask<GenericCollectionResponse>>,
    pending_create: Option<ApiTask<GenericRecordResponse>>,
    pending_stock: Option<ApiTask<GenericRecordResponse>>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    needs_reload: bool,
    data_loaded: bool,
    search: String,
    status_filter: String,
    category_filter: String,
    page: usize,
    page_size: usize,
    create_open: bool,
    create_draft: MaterialDraft,
    stock_item_key: Option<String>,
    stock_draft: StockDraft,
    detail_key: Option<String>,
    notice: String,
    error: String,
}

impl Default for AssetMaterialsView {
    fn default() -> Self {
        Self {
            records: Vec::new(),
            revision: String::new(),
            pending_load: None,
            pending_create: None,
            pending_stock: None,
            loaded_for: None,
            last_loaded: None,
            needs_reload: true,
            data_loaded: false,
            search: String::new(),
            status_filter: "Tất cả trạng thái tồn".to_owned(),
            category_filter: "Tất cả phân nhóm".to_owned(),
            page: 0,
            page_size: PAGE_SIZE,
            create_open: false,
            create_draft: MaterialDraft::default(),
            stock_item_key: None,
            stock_draft: StockDraft::default(),
            detail_key: None,
            notice: String::new(),
            error: String::new(),
        }
    }
}

impl AssetMaterialsView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn is_busy(&self) -> bool {
        self.pending_load.is_some() || self.pending_create.is_some() || self.pending_stock.is_some()
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        if self.is_busy() {
            self.needs_reload = true;
            return;
        }
        self.pending_load = Some(api.list_generic_collection_task(session, SCOPE));
        self.needs_reload = false;
        self.error.clear();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.records.clear();
            self.revision.clear();
            self.pending_load = None;
            self.pending_create = None;
            self.pending_stock = None;
            self.loaded_for = Some(session.user.id.clone());
            self.data_loaded = false;
            self.needs_reload = true;
            self.last_loaded = None;
            self.search.clear();
            self.page = 0;
            self.detail_key = None;
            self.stock_item_key = None;
            self.notice.clear();
            self.error.clear();
        }
        if self.needs_reload && !self.is_busy() {
            self.request_reload(session, api);
        } else if !self.is_busy()
            && self
                .last_loaded
                .is_none_or(|last_loaded| last_loaded.elapsed() >= REFRESH_INTERVAL)
        {
            self.request_reload(session, api);
        }

        if let Some(result) = self.pending_load.as_ref().and_then(ApiClient::poll) {
            self.pending_load = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.records = response.data;
                    self.revision = response.revision;
                    self.data_loaded = true;
                    self.error.clear();
                }
                Err(error) => {
                    self.error = format!("Không thể tải danh mục vật tư: {error}");
                }
            }
        }
        if let Some(result) = self.pending_create.as_ref().and_then(ApiClient::poll) {
            self.pending_create = None;
            match result {
                Ok(response) => {
                    self.revision = response.revision;
                    self.create_open = false;
                    self.needs_reload = true;
                    self.notice = "Đã lưu mã vật tư mới.".to_owned();
                    self.error.clear();
                }
                Err(error) if error.starts_with("Danh sách đã thay đổi kể từ lần tải") =>
                {
                    self.needs_reload = true;
                    self.notice = "Dữ liệu vừa được cập nhật bởi người khác; danh sách đang được tải lại. Hãy kiểm tra rồi thử lại.".to_owned();
                    self.error.clear();
                }
                Err(error) => self.error = format!("Không thể tạo vật tư: {error}"),
            }
        }
        if let Some(result) = self.pending_stock.as_ref().and_then(ApiClient::poll) {
            self.pending_stock = None;
            match result {
                Ok(response) => {
                    self.revision = response.revision;
                    self.stock_item_key = None;
                    self.needs_reload = true;
                    self.notice = "Đã ghi phiếu và cập nhật thẻ kho.".to_owned();
                    self.error.clear();
                }
                Err(error) if error.starts_with("Danh sách đã thay đổi kể từ lần tải") =>
                {
                    self.needs_reload = true;
                    self.notice = "Dữ liệu vừa được cập nhật bởi người khác; danh sách đang được tải lại. Hãy kiểm tra rồi thử lại phiếu.".to_owned();
                    self.error.clear();
                }
                Err(error) => self.error = format!("Không thể ghi phiếu nhập/xuất: {error}"),
            }
        }
        if self.is_busy() {
            ctx.request_repaint_after(Duration::from_millis(50));
        }
    }

    fn submit_create(&mut self, session: &Session, api: &ApiClient) {
        match self
            .create_draft
            .build(self.records.len(), &session.user.name)
        {
            Ok(record) => {
                let expected_revision =
                    (!self.revision.is_empty()).then_some(self.revision.as_str());
                self.pending_create = Some(api.create_generic_collection_record_task(
                    session,
                    SCOPE,
                    &record,
                    expected_revision,
                ));
                self.error.clear();
            }
            Err(error) => self.error = error,
        }
    }

    fn open_stock(&mut self, item: &Value, action_type: &str) {
        self.stock_item_key = Some(record_key(item));
        self.stock_draft = StockDraft::for_item(item, action_type);
        self.error.clear();
    }

    fn submit_stock(&mut self, session: &Session, api: &ApiClient) {
        let Some(key) = self.stock_item_key.as_deref() else {
            return;
        };
        let Some(item) = self.records.iter().find(|item| record_key(item) == key) else {
            self.error =
                "Vật tư đã thay đổi hoặc không còn tồn tại. Hãy tải lại danh sách.".to_owned();
            return;
        };
        match self.stock_draft.build_patch(item) {
            Ok(patch) => {
                let expected_revision =
                    (!self.revision.is_empty()).then_some(self.revision.as_str());
                self.pending_stock = Some(api.patch_generic_collection_record_task(
                    session,
                    SCOPE,
                    key,
                    &patch,
                    expected_revision,
                ));
                self.error.clear();
            }
            Err(error) => self.error = error,
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.poll(ctx, session, api);
        let total_value: i64 = self
            .records
            .iter()
            .map(|item| number(item, "stockQty").saturating_mul(number(item, "unitPrice")))
            .sum();
        let low_count = self
            .records
            .iter()
            .filter(|item| {
                let status = text(item, "status");
                status.contains("Cảnh báo") || status.contains("Hết hàng")
            })
            .count();
        let empty_count = self
            .records
            .iter()
            .filter(|item| number(item, "stockQty") == 0)
            .count();

        let warehouse_locations = self
            .records
            .iter()
            .map(|item| text(item, "warehouseLocation").trim().to_owned())
            .filter(|value| !value.is_empty())
            .collect::<std::collections::BTreeSet<_>>();

        ui.add_space(8.0);
        widgets::metrics_grid(
            ui,
            "asset-materials.metrics",
            &[
                widgets::Metric {
                    label: "Tổng giá trị kho phụ tùng & CCDC",
                    value: if self.data_loaded {
                        (&format!("{} ₫", format_vnd(total_value.max(0) as u64))).to_owned()
                    } else {
                        "—".to_owned()
                    },
                    detail: &format!("{} chủng loại linh kiện máy chủ & mạng", self.records.len()),
                    color: Color32::from_rgb(15, 23, 42),
                    value_size: 22.0,
                },
                widgets::Metric {
                    label: "Dưới định mức tồn an toàn (Safety Stock)",
                    value: if self.data_loaded {
                        (&format!("{low_count} mã linh kiện")).to_owned()
                    } else {
                        "—".to_owned()
                    },
                    detail: &if empty_count > 0 {
                        format!("⚠️ {empty_count} mã đã hết hoàn toàn")
                    } else {
                        "Đang ở ngưỡng cần nhập thêm".to_owned()
                    },
                    color: if low_count > 0 {
                        Color32::from_rgb(220, 38, 38)
                    } else {
                        Color32::from_rgb(22, 163, 74)
                    },
                    value_size: 22.0,
                },
                widgets::Metric {
                    label: "Tỷ lệ sẵn sàng phụ tùng (SLA Parts)",
                    value: if self.data_loaded {
                        "Chưa có dữ liệu".to_owned()
                    } else {
                        "—".to_owned()
                    },
                    detail: "Chưa có API đo mức sẵn sàng hoặc thời gian ứng cứu",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 22.0,
                },
                widgets::Metric {
                    label: "Vị trí kho quản lý tập trung",
                    value: if self.data_loaded {
                        format!("{} vị trí kho", warehouse_locations.len())
                    } else {
                        "—".to_owned()
                    },
                    detail: "Vị trí không trống trong danh mục vật tư",
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 22.0,
                },
            ],
            egui::vec2(16.0, 16.0),
            240.0,
            4.0,
        );

        ui.add_space(10.0);
        ui.horizontal_wrapped(|ui| {
            {
                let (rect, _) = ui.allocate_exact_size(
                    egui::vec2(330.0_f32.min(ui.available_width()), 32.0),
                    egui::Sense::hover(),
                );
                widgets::search_input(
                    ui,
                    rect,
                    &mut self.search,
                    "Tìm theo mã LK, tên, thông số, tủ kho, tương thích...",
                )
            };
            widgets::combo_box("asset_material_status_filter")
                .selected_text(&self.status_filter)
                .show_ui(ui, |ui| {
                    for option in [
                        "Tất cả trạng thái tồn",
                        STATUS_SAFE,
                        "Cảnh báo sắp hết (Dưới Min)",
                        STATUS_EMPTY,
                    ] {
                        if ui
                            .selectable_label(self.status_filter == option, option)
                            .clicked()
                        {
                            self.status_filter = option.to_owned();
                            self.page = 0;
                        }
                    }
                });
            widgets::combo_box("asset_material_category_filter")
                .selected_text(&self.category_filter)
                .show_ui(ui, |ui| {
                    let options = std::iter::once("Tất cả phân nhóm").chain(CATEGORIES);
                    for option in options {
                        if ui
                            .selectable_label(self.category_filter == option, option)
                            .clicked()
                        {
                            self.category_filter = option.to_owned();
                            self.page = 0;
                        }
                    }
                });
            ui.add_enabled(false, egui::Button::new("Xuất Báo Cáo Tồn"))
                .on_hover_text("Chưa có chức năng tạo báo cáo Excel tồn kho.");
            if ui
                .button(
                    RichText::new("＋ Thêm linh kiện mới")
                        .color(Color32::WHITE)
                        .background_color(Color32::from_rgb(0, 150, 136)),
                )
                .clicked()
            {
                self.create_draft = MaterialDraft::for_new(self.records.len());
                self.create_open = true;
                self.error.clear();
            }
        });

        if !self.notice.is_empty() {
            ui.label(RichText::new(&self.notice).color(Color32::from_rgb(22, 120, 80)));
        }
        if !self.error.is_empty() {
            ui.label(RichText::new(&self.error).color(Color32::from_rgb(185, 28, 28)));
        }
        if !self.data_loaded && self.pending_load.is_some() {
            ui.add_space(8.0);
            ui.spinner();
            ui.label("Đang tải danh mục vật tư...");
            return;
        }

        let query = self.search.trim().to_lowercase();
        let filtered: Vec<Value> = self
            .records
            .iter()
            .filter(|item| {
                let haystack = [
                    "materialCode",
                    "materialName",
                    "specifications",
                    "warehouseLocation",
                    "supplier",
                    "compatibleAssets",
                ]
                .iter()
                .map(|field| text(item, field).to_lowercase())
                .collect::<Vec<_>>()
                .join(" ");
                let status = text(item, "status");
                let status_matches = self.status_filter == "Tất cả trạng thái tồn"
                    || (self.status_filter == "Cảnh báo sắp hết (Dưới Min)"
                        && status.contains("Cảnh báo"))
                    || status == self.status_filter;
                let category_matches = self.category_filter == "Tất cả phân nhóm"
                    || text(item, "category") == self.category_filter;
                (query.is_empty() || haystack.contains(&query))
                    && status_matches
                    && category_matches
            })
            .cloned()
            .collect();
        let pages = filtered.len().div_ceil(self.page_size).max(1);
        self.page = self.page.min(pages - 1);
        widgets::table_with_row_height(
            ui,
            "asset-materials.table",
            &[
                widgets::TableColumn {
                    title: "Mã & Phân nhóm",
                    width: 170.0,
                },
                widgets::TableColumn {
                    title: "Tên vật tư & Thông số kỹ thuật",
                    width: 290.0,
                },
                widgets::TableColumn {
                    title: "Tồn kho / Định mức an toàn",
                    width: 200.0,
                },
                widgets::TableColumn {
                    title: "Đơn giá & Tổng giá trị",
                    width: 190.0,
                },
                widgets::TableColumn {
                    title: "Trạng thái",
                    width: 220.0,
                },
                widgets::TableColumn {
                    title: "Thao tác",
                    width: 180.0,
                },
            ],
            filtered
                .len()
                .saturating_sub(self.page * self.page_size)
                .min(self.page_size),
            100.0,
            |ui, row, column| {
                let item = &filtered[self.page * self.page_size + row];
                let key = record_key(item);
                let code = text(item, "materialCode");
                let category = text(item, "category");
                let qty = number(item, "stockQty");
                let minimum = number(item, "minThreshold");
                let maximum = number(item, "maxThreshold").max(1);
                let stock_color = if qty == 0 {
                    Color32::from_rgb(220, 38, 38)
                } else if qty <= minimum {
                    Color32::from_rgb(217, 119, 6)
                } else {
                    Color32::from_rgb(22, 163, 74)
                };
                let price = number(item, "unitPrice");
                let status = text(item, "status");
                let status_color = if status.contains("Hết hàng") {
                    Color32::from_rgb(220, 38, 38)
                } else if status.contains("Cảnh báo") {
                    Color32::from_rgb(217, 119, 6)
                } else {
                    Color32::from_rgb(22, 163, 74)
                };
                match column {
                    0 => {
                        ui.vertical(|ui| {
                            ui.label(
                                RichText::new(&code)
                                    .strong()
                                    .color(Color32::from_rgb(0, 150, 136)),
                            );
                            ui.label(
                                RichText::new(category)
                                    .small()
                                    .color(Color32::from_rgb(37, 99, 235)),
                            );
                        });
                    }
                    1 => {
                        ui.vertical(|ui| {
                            ui.label(RichText::new(text(item, "materialName")).strong());
                            ui.label(
                                RichText::new(text(item, "specifications"))
                                    .small()
                                    .color(Color32::GRAY),
                            );
                            ui.label(
                                RichText::new(format!(
                                    "Vị trí: {} · NCC: {}",
                                    text(item, "warehouseLocation"),
                                    text(item, "supplier")
                                ))
                                .small()
                                .color(Color32::from_rgb(37, 99, 235)),
                            );
                        });
                    }
                    2 => {
                        ui.vertical(|ui| {
                            ui.label(
                                RichText::new(format!("{qty} {}", text(item, "unit")))
                                    .strong()
                                    .color(stock_color),
                            );
                            ui.label(
                                RichText::new(format!(
                                    "Min: {minimum} · Max: {}",
                                    number(item, "maxThreshold")
                                ))
                                .small()
                                .color(Color32::GRAY),
                            );
                            ui.add(
                                egui::ProgressBar::new(
                                    (qty as f32 / maximum as f32).clamp(0.0, 1.0),
                                )
                                .desired_width(135.0)
                                .fill(stock_color)
                                .show_percentage(),
                            );
                        });
                    }
                    3 => {
                        ui.vertical(|ui| {
                            ui.label(format!("Đơn giá: {} ₫", format_vnd(price.max(0) as u64)));
                            ui.label(
                                RichText::new(format!(
                                    "Tổng: {} ₫",
                                    format_vnd(qty.saturating_mul(price).max(0) as u64)
                                ))
                                .strong(),
                            );
                        });
                    }
                    4 => {
                        ui.label(RichText::new(status).color(status_color));
                    }
                    5 => {
                        ui.horizontal_wrapped(|ui| {
                            if ui.small_button("Thẻ kho").clicked() {
                                self.detail_key = Some(key.clone());
                            }
                            if ui.small_button("Nhập").clicked() {
                                self.open_stock(item, "import");
                            }
                            if ui.add_enabled(qty > 0, egui::Button::new("Xuất")).clicked() {
                                self.open_stock(item, "export");
                            }
                        });
                    }
                    _ => {}
                }
            },
        );
        ui.add_space(12.0);
        widgets::pagination(
            ui,
            "asset-materials.pagination",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );

        self.render_create_window(ctx, session, api);
        self.render_stock_window(ctx, session, api);
        self.render_detail_window(ctx);
    }

    fn render_create_window(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if !self.create_open {
            return;
        }
        let mut open = self.create_open;
        let (_, closed) = widgets::modal(
            ctx,
            "asset-materials-0",
            "Thêm Mới Danh Mục Vật Tư & Phụ Tùng Dự Phòng",
            760.0,
            self.is_busy(),
            |ui| {
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    ui.add_space(8.0);
                }

                egui::ScrollArea::vertical()
                    .max_height(620.0)
                    .show(ui, |ui| {
                        ui.columns(
                            if ui.ctx().screen_rect().width() <= 992.0 {
                                1
                            } else {
                                3
                            },
                            |columns| {
                                let column_count = columns.len();
                                field(
                                    &mut columns[0 % column_count],
                                    "Mã linh kiện / Vật tư",
                                    &mut self.create_draft.code,
                                    "Ví dụ: LK-NVME-05",
                                );
                                columns[1 % column_count].label("Phân nhóm vật tư");
                                widgets::combo_box("asset_material_create_category")
                                    .selected_text(&self.create_draft.category)
                                    .show_ui(&mut columns[1 % column_count], |ui| {
                                        for category in CATEGORIES {
                                            ui.selectable_value(
                                                &mut self.create_draft.category,
                                                category.to_owned(),
                                                category,
                                            );
                                        }
                                    });
                                field(
                                    &mut columns[2 % column_count],
                                    "Đơn vị tính (ĐVT)",
                                    &mut self.create_draft.unit,
                                    "Ví dụ: Thanh, Ổ, Cái, Sợi...",
                                );
                            },
                        );
                        field(
                            ui,
                            "Tên vật tư / Linh kiện phụ tùng",
                            &mut self.create_draft.name,
                            "Ví dụ: Nguồn Server Redundant Hot-plug PSU Dell 800W Platinum",
                        );
                        ui.label("Thông số kỹ thuật chi tiết");
                        ui.add(
                            egui::TextEdit::multiline(&mut self.create_draft.specifications)
                                .desired_rows(2)
                                .hint_text("Input 100-240V, 50/60Hz, 80 PLUS Platinum..."),
                        );
                        ui.columns(
                            if ui.ctx().screen_rect().width() <= 992.0 {
                                1
                            } else {
                                2
                            },
                            |columns| {
                                let column_count = columns.len();
                                field(
                                    &mut columns[0 % column_count],
                                    "Nhà cung cấp / Hãng sản xuất",
                                    &mut self.create_draft.supplier,
                                    "Dell Technologies / NPP FPT Synnex",
                                );
                                field(
                                    &mut columns[1 % column_count],
                                    "Vị trí ngăn tủ kho",
                                    &mut self.create_draft.warehouse_location,
                                    "Tủ Linh Kiện IDC - Ngăn A2-01",
                                );
                            },
                        );
                        ui.columns(
                            if ui.ctx().screen_rect().width() <= 992.0 {
                                1
                            } else {
                                4
                            },
                            |columns| {
                                let column_count = columns.len();
                                field(
                                    &mut columns[0 % column_count],
                                    "Số lượng ban đầu",
                                    &mut self.create_draft.stock_qty,
                                    "0",
                                );
                                field(
                                    &mut columns[1 % column_count],
                                    "Tồn tối thiểu (Min)",
                                    &mut self.create_draft.min_threshold,
                                    "1",
                                );
                                field(
                                    &mut columns[2 % column_count],
                                    "Tồn tối đa (Max)",
                                    &mut self.create_draft.max_threshold,
                                    "30",
                                );
                                field(
                                    &mut columns[3 % column_count],
                                    "Đơn giá nhập (VNĐ)",
                                    &mut self.create_draft.unit_price,
                                    "3500000",
                                );
                            },
                        );
                        ui.columns(
                            if ui.ctx().screen_rect().width() <= 992.0 {
                                1
                            } else {
                                2
                            },
                            |columns| {
                                let column_count = columns.len();
                                field(
                                    &mut columns[0 % column_count],
                                    "Thiết bị / Dòng máy tương thích",
                                    &mut self.create_draft.compatible_assets,
                                    "Dell PowerEdge R750xs, R650, R740",
                                );
                                field(
                                    &mut columns[1 % column_count],
                                    "Bảo hành (Tháng)",
                                    &mut self.create_draft.warranty_months,
                                    "36",
                                );
                            },
                        );
                        ui.horizontal(|ui| {
                            if ui.button("Hủy bỏ").clicked() {
                                self.create_open = false;
                            }
                            if ui
                                .add_enabled(
                                    self.pending_create.is_none(),
                                    egui::Button::new("Lưu mã vật tư"),
                                )
                                .clicked()
                            {
                                self.submit_create(session, api);
                            }
                            if self.pending_create.is_some() {
                                ui.spinner();
                                ui.label("Đang lưu...");
                            }
                        });
                    });
            },
        );
        open &= !closed;
        self.create_open = open && self.create_open;
    }

    fn render_stock_window(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let Some(key) = self.stock_item_key.clone() else {
            return;
        };
        let item = self.records.iter().find(|item| record_key(item) == key);
        let title = item
            .map(|item| {
                format!(
                    "Phiếu Nhập / Xuất Kho Vật Tư: {}",
                    text(item, "materialName")
                )
            })
            .unwrap_or_else(|| "Phiếu Nhập / Xuất Kho Vật Tư".to_owned());
        let unit = item.map(|item| text(item, "unit")).unwrap_or_default();
        let mut open = true;
        let (_, closed) = widgets::modal(
            ctx,
            "asset-materials-1",
            &title,
            560.0,
            self.is_busy(),
            |ui| {
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    ui.add_space(8.0);
                }

                ui.label("Loại nghiệp vụ kho");
                widgets::combo_box("asset_material_action_type")
                    .selected_text(if self.stock_draft.action_type == "import" {
                        "Nhập kho bổ sung (Mẫu 01-VT)"
                    } else {
                        "Xuất kho thay thế/sửa chữa (Mẫu 02-VT)"
                    })
                    .show_ui(ui, |ui| {
                        ui.selectable_value(
                            &mut self.stock_draft.action_type,
                            "import".to_owned(),
                            "Nhập kho bổ sung (Mẫu 01-VT)",
                        );
                        ui.selectable_value(
                            &mut self.stock_draft.action_type,
                            "export".to_owned(),
                            "Xuất kho thay thế/sửa chữa (Mẫu 02-VT)",
                        );
                    });

                form_field(ui, "Số phiếu chứng từ", &mut self.stock_draft.ticket_code);
                form_field(
                    ui,
                    &format!("Số lượng ({unit})"),
                    &mut self.stock_draft.amount,
                );
                form_field(
                    ui,
                    "Ngày thực hiện (YYYY-MM-DD)",
                    &mut self.stock_draft.date,
                );
                form_field(ui, "Đơn giá (VNĐ)", &mut self.stock_draft.unit_price);
                form_field(
                    ui,
                    "Tài sản nhận / Mục đích xuất dùng",
                    &mut self.stock_draft.target_asset,
                );
                form_field(
                    ui,
                    "Người thực hiện / Thủ kho",
                    &mut self.stock_draft.handler,
                );
                form_field(ui, "Lý do nhập/xuất", &mut self.stock_draft.reason);

                ui.add_space(12.0);
                ui.horizontal(|ui| {
                    if ui.button("Hủy").clicked() {
                        self.stock_item_key = None;
                    }
                    if ui
                        .add_enabled(
                            self.pending_stock.is_none(),
                            egui::Button::new("Xác nhận ghi thẻ kho"),
                        )
                        .clicked()
                    {
                        self.submit_stock(session, api);
                    }
                    if self.pending_stock.is_some() {
                        ui.spinner();
                        ui.label("Đang ghi...");
                    }
                });
            },
        );
        open &= !closed;
        if !open {
            self.stock_item_key = None;
        }
    }

    fn render_detail_window(&mut self, ctx: &egui::Context) {
        let Some(key) = self.detail_key.clone() else {
            return;
        };
        let Some(item) = self.records.iter().find(|item| record_key(item) == key) else {
            self.detail_key = None;
            return;
        };
        let item = item.clone();
        let mut open = true;
        let (_, closed) = widgets::drawer(
            ctx,
            "asset-materials-2",
            "Thẻ Kho Vật Tư & Phụ Tùng (Mẫu Số 06 - VT)",
            650.0,
            |ui| {
                ui.horizontal(|ui| {
                    ui.vertical(|ui| {
                        ui.label(
                            RichText::new(text(&item, "materialCode"))
                                .strong()
                                .color(Color32::from_rgb(0, 150, 136)),
                        );
                        ui.heading(text(&item, "materialName"));
                    });
                    ui.label(
                        RichText::new(text(&item, "status"))
                            .color(status_color(&text(&item, "status"))),
                    );
                });
                ui.label(format!("Thông số: {}", text(&item, "specifications")));
                ui.add_space(8.0);
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        3
                    },
                    |columns| {
                        let column_count = columns.len();
                        detail_metric(
                            &mut columns[0 % column_count],
                            "TỒN KHO HIỆN TẠI",
                            &format!("{} {}", number(&item, "stockQty"), text(&item, "unit")),
                            &format!("Định mức Min: {}", number(&item, "minThreshold")),
                        );
                        detail_metric(
                            &mut columns[1 % column_count],
                            "ĐƠN GIÁ NHẬP",
                            &format!("{} ₫", format_vnd(number(&item, "unitPrice").max(0) as u64)),
                            &format!("BH: {}T", number(&item, "warrantyMonths")),
                        );
                        detail_metric(
                            &mut columns[2 % column_count],
                            "TỔNG GIÁ TRỊ TỒN",
                            &format!(
                                "{} ₫",
                                format_vnd(
                                    number(&item, "stockQty")
                                        .saturating_mul(number(&item, "unitPrice"))
                                        .max(0) as u64
                                )
                            ),
                            "",
                        );
                    },
                );
                ui.label(format!(
                    "Vị trí lưu kho: {}",
                    text(&item, "warehouseLocation")
                ));
                ui.label(format!(
                    "Tương thích phần cứng: {}",
                    value_text(&item, "compatibleAssets", "Đang cập nhật")
                ));
                ui.label(format!(
                    "Nhà cung cấp bảo hành: {}",
                    text(&item, "supplier")
                ));
                ui.separator();
                let history = item
                    .get("stockHistory")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                ui.strong(format!(
                    "Lịch sử xuất - nhập - tồn ({} chứng từ):",
                    history.len()
                ));
                egui::ScrollArea::vertical()
                    .max_height(280.0)
                    .show(ui, |ui| {
                        egui::Grid::new("asset_material_history")
                            .striped(true)
                            .num_columns(5)
                            .show(ui, |ui| {
                                for heading in [
                                    "Số phiếu & ngày",
                                    "Nghiệp vụ",
                                    "Số lượng",
                                    "Tài sản nhận / mục đích",
                                    "Người lập",
                                ] {
                                    ui.strong(heading);
                                }
                                ui.end_row();
                                for row in history {
                                    let kind = text(&row, "type");
                                    ui.vertical(|ui| {
                                        ui.strong(text(&row, "ticketCode"));
                                        ui.label(text(&row, "date"));
                                    });
                                    ui.label(RichText::new(&kind).color(if kind == "Nhập kho" {
                                        Color32::from_rgb(22, 163, 74)
                                    } else {
                                        Color32::from_rgb(217, 119, 6)
                                    }));
                                    let sign = if kind == "Nhập kho" { "+" } else { "−" };
                                    ui.label(format!(
                                        "{sign}{} {}",
                                        number(&row, "qty"),
                                        text(&item, "unit")
                                    ));
                                    ui.vertical(|ui| {
                                        ui.label(text(&row, "targetAsset"));
                                        ui.label(
                                            RichText::new(text(&row, "reason"))
                                                .small()
                                                .color(Color32::GRAY),
                                        );
                                    });
                                    ui.label(text(&row, "handler"));
                                    ui.end_row();
                                }
                            });
                    });
                ui.horizontal(|ui| {
                    ui.add_enabled(false, egui::Button::new("In Thẻ Kho (PDF)"))
                        .on_hover_text("Chưa có chức năng tạo tệp PDF thẻ kho.");
                    if ui.button("Nhập kho").clicked() {
                        self.open_stock(&item, "import");
                    }
                    if ui
                        .add_enabled(number(&item, "stockQty") > 0, egui::Button::new("Xuất kho"))
                        .clicked()
                    {
                        self.open_stock(&item, "export");
                    }
                });
            },
        );
        open &= !closed;
        if !open {
            self.detail_key = None;
        }
    }
}

fn record_key(item: &Value) -> String {
    item.get("key")
        .and_then(Value::as_str)
        .or_else(|| item.get("id").and_then(Value::as_str))
        .unwrap_or_default()
        .to_owned()
}

fn value_text(item: &Value, field: &str, fallback: &str) -> String {
    let value = text(item, field);
    if value.is_empty() {
        fallback.to_owned()
    } else {
        value
    }
}

fn status_color(status: &str) -> Color32 {
    if status.contains("Hết hàng") {
        Color32::from_rgb(220, 38, 38)
    } else if status.contains("Cảnh báo") {
        Color32::from_rgb(217, 119, 6)
    } else {
        Color32::from_rgb(22, 163, 74)
    }
}

fn field(ui: &mut Ui, label: &str, value: &mut String, hint: &str) {
    widgets::form_input(ui, label, label, false, value, hint, false);
}

fn form_field(ui: &mut Ui, label: &str, value: &mut String) {
    if label.starts_with("Ngày") {
        widgets::form_date(ui, label, label, true, value);
    } else {
        widgets::form_input(ui, label, label, false, value, "", false);
    }
}

fn detail_metric(ui: &mut Ui, title: &str, value: &str, subtitle: &str) {
    egui::Frame::group(ui.style()).show(ui, |ui| {
        ui.set_min_height(70.0);
        ui.label(RichText::new(title).small().color(Color32::from_gray(105)));
        ui.label(RichText::new(value).strong());
        ui.label(RichText::new(subtitle).small().color(Color32::GRAY));
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item() -> Value {
        json!({
            "key": "mat-1",
            "materialCode": "LK-1",
            "stockQty": 3,
            "minThreshold": 4,
            "unitPrice": 125000,
            "stockHistory": [{"id":"old","type":"Nhập kho","qty":3,"legacyField":"keep"}],
            "unrecognizedLegacyField": {"preserve": true}
        })
    }

    #[test]
    fn new_material_keeps_legacy_camel_case_contract_and_initial_stock_event() {
        let mut draft = MaterialDraft::for_new(0);
        draft.code = "LK-SSD-01".to_owned();
        draft.name = "Enterprise SSD".to_owned();
        draft.specifications = "NVMe".to_owned();
        draft.supplier = "OEM".to_owned();
        draft.unit_price = "3500000".to_owned();
        draft.stock_qty = "10".into();
        draft.min_threshold = "4".into();
        draft.max_threshold = "30".into();
        draft.warehouse_location = "Kho kiểm thử".into();
        let record = draft
            .build(0, "Thủ kho kiểm thử")
            .expect("valid new material");
        assert_eq!(record["materialCode"], "LK-SSD-01");
        assert_eq!(record["stockQty"], 10);
        assert_eq!(record["status"], STATUS_SAFE);
        assert_eq!(record["stockHistory"][0]["type"], "Nhập kho");
        assert_eq!(record["stockHistory"][0]["targetAsset"], "Kho tổng");
        assert!(record.get("material_code").is_none());
    }

    #[test]
    fn stock_export_clamps_at_zero_and_prepends_a_non_destructive_history_row() {
        let mut draft = StockDraft::for_item(&item(), "export");
        draft.amount = "9".to_owned();
        draft.ticket_code = "XK-TEST-1".to_owned();
        draft.date = "2026-10-10".to_owned();
        draft.target_asset = "Server A".to_owned();
        draft.handler = "Thủ kho".to_owned();
        let patch = draft.build_patch(&item()).expect("valid export");
        assert_eq!(patch["stockQty"], 0);
        assert_eq!(patch["status"], STATUS_EMPTY);
        assert_eq!(patch["stockHistory"].as_array().unwrap().len(), 2);
        assert_eq!(patch["stockHistory"][0]["type"], "Xuất kho thay thế");
        assert_eq!(patch["stockHistory"][1]["legacyField"], "keep");
    }

    #[test]
    fn stock_import_recalculates_safety_state_and_preserves_other_legacy_fields() {
        let mut draft = StockDraft::for_item(&item(), "import");
        draft.amount = "2".to_owned();
        draft.ticket_code = "NK-TEST-1".to_owned();
        draft.date = "2026-10-10".to_owned();
        draft.target_asset = "PO-1".to_owned();
        draft.handler = "Thủ kho".to_owned();
        let patch = draft.build_patch(&item()).expect("valid import");
        assert_eq!(patch["stockQty"], 5);
        assert_eq!(patch["status"], STATUS_SAFE);
        assert_eq!(item()["unrecognizedLegacyField"]["preserve"], true);
    }

    #[test]
    fn stock_form_rejects_zero_amount_and_missing_required_fields() {
        let mut draft = StockDraft::for_item(&item(), "import");
        draft.amount = "0".to_owned();
        assert!(draft.build_patch(&item()).is_err());
        draft.amount = "1".to_owned();
        draft.handler.clear();
        assert!(draft.build_patch(&item()).is_err());
    }
}
