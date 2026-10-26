use std::{collections::BTreeMap, time::Duration};

use crate::api::{
    ApiClient, ApiTask, AssetAllocation, AssetAllocationsResponse, AssetItem, AssetItemsResponse,
    AssetTransfer, AssetTransfersResponse,
};
use crate::models::Session;
use crate::views::employees::format_vnd;
use egui::{Color32, RichText, Ui, Vec2};
use serde_json::{Value, json};
use web_time::Instant;

const PAGE_SIZE: usize = 8;
const REFRESH_INTERVAL: Duration = Duration::from_secs(30);
const ASSET_CATEGORIES: &[&str] = &[
    "Thiết bị IT",
    "Nội thất văn phòng",
    "Phương tiện & Vận chuyển",
    "Máy chủ & Hạ tầng IDC",
    "Máy móc & Thiết bị kỹ thuật",
];
const ASSET_STATUSES: &[&str] = &[
    "Đang sử dụng",
    "Trong kho",
    "Đang sửa chữa",
    "Chờ thanh lý",
    "Đã thanh lý",
];

#[derive(Default)]
struct AssetDraft {
    code: String,
    barcode: String,
    name: String,
    category: String,
    model: String,
    purchase_date: String,
    supplier: String,
    original_price: String,
    depreciation_months: String,
    accumulated_depreciation: String,
    location: String,
    assigned_to: String,
    department: String,
    status: String,
    warranty_expiry: String,
    specs: String,
    notes: String,
}

impl AssetDraft {
    fn for_new() -> Self {
        Self {
            category: ASSET_CATEGORIES[0].to_owned(),
            original_price: "0".to_owned(),
            depreciation_months: "36".to_owned(),
            accumulated_depreciation: "0".to_owned(),
            assigned_to: "Chưa cấp phát".to_owned(),
            status: "Trong kho".to_owned(),
            ..Self::default()
        }
    }

    fn from_asset(asset: &AssetItem) -> Self {
        Self {
            code: asset.code.clone(),
            barcode: asset.barcode.clone(),
            name: asset.name.clone(),
            category: asset.category.clone(),
            model: asset.model.clone(),
            purchase_date: asset.purchase_date.clone(),
            supplier: asset.supplier.clone(),
            original_price: stored_number_input(&asset.original_price, "0"),
            depreciation_months: stored_number_input(&asset.depreciation_months, "36"),
            accumulated_depreciation: stored_number_input(&asset.accumulated_depreciation, "0"),
            location: asset.location.clone(),
            assigned_to: asset.assigned_to.clone(),
            department: asset.department.clone(),
            status: asset.status.clone(),
            warranty_expiry: asset.warranty_expiry.clone(),
            specs: asset.specs.clone(),
            notes: asset.notes.clone(),
        }
    }

    fn build(&self, existing: Option<&AssetItem>, row_count: usize) -> Result<AssetItem, String> {
        let code = self.code.trim();
        if code.is_empty() {
            return Err("Vui lòng nhập mã tài sản.".to_owned());
        }
        let name = self.name.trim();
        if name.is_empty() {
            return Err("Vui lòng nhập tên tài sản.".to_owned());
        }
        if self.category.trim().is_empty() {
            return Err("Vui lòng chọn phân loại tài sản.".to_owned());
        }
        if self.status.trim().is_empty() {
            return Err("Vui lòng chọn trạng thái tài sản.".to_owned());
        }

        let original_price = parse_money(&self.original_price, "Nguyên giá")?;
        let accumulated_depreciation =
            parse_money(&self.accumulated_depreciation, "Hao mòn lũy kế")?;
        let depreciation_months = self
            .depreciation_months
            .trim()
            .parse::<u64>()
            .map_err(|_| "Thời gian khấu hao phải là số tháng hợp lệ.".to_owned())?;
        if depreciation_months == 0 || depreciation_months > 1_200 {
            return Err("Thời gian khấu hao phải từ 1 đến 1.200 tháng.".to_owned());
        }

        Ok(AssetItem {
            key: existing.map_or_else(
                || {
                    format!(
                        "asset-{}-{row_count}",
                        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
                    )
                },
                |asset| asset.key.clone(),
            ),
            code: code.to_owned(),
            barcode: self.barcode.trim().to_owned(),
            name: name.to_owned(),
            category: self.category.trim().to_owned(),
            model: self.model.trim().to_owned(),
            purchase_date: self.purchase_date.trim().to_owned(),
            supplier: self.supplier.trim().to_owned(),
            original_price: json!(original_price),
            depreciation_months: json!(depreciation_months),
            accumulated_depreciation: json!(accumulated_depreciation),
            net_book_value: json!(original_price.saturating_sub(accumulated_depreciation)),
            location: self.location.trim().to_owned(),
            assigned_to: self.assigned_to.trim().to_owned(),
            department: self.department.trim().to_owned(),
            status: self.status.trim().to_owned(),
            warranty_expiry: self.warranty_expiry.trim().to_owned(),
            specs: self.specs.trim().to_owned(),
            notes: self.notes.trim().to_owned(),
            extra: existing.map_or_else(Default::default, |asset| asset.extra.clone()),
        })
    }
}

pub struct AssetsView {
    assets: Vec<AssetItem>,
    revision: String,
    pending_load: Option<ApiTask<AssetItemsResponse>>,
    pending_save: Option<ApiTask<AssetItemsResponse>>,
    loaded_for: Option<String>,
    data_loaded: bool,
    needs_reload: bool,
    last_loaded: Option<Instant>,
    search: String,
    category_filter: String,
    status_filter: String,
    department_filter: String,
    page: usize,
    page_size: usize,
    form_open: bool,
    editing_key: Option<String>,
    form: AssetDraft,
    selected_key: Option<String>,
    delete_key: Option<String>,
    conflicted: bool,
    notice: String,
    error: String,
    usage_allocations: Vec<AssetAllocation>,
    usage_transfers: Vec<AssetTransfer>,
    pending_allocations: Option<ApiTask<AssetAllocationsResponse>>,
    pending_transfers: Option<ApiTask<AssetTransfersResponse>>,
    usage_requested: bool,
    usage_errors: Vec<String>,
    overview_tab: AssetOverviewTab,
}

#[derive(Default, PartialEq, Eq)]
enum AssetOverviewTab {
    #[default]
    Categories,
    Lifecycle,
    Attention,
}

impl Default for AssetsView {
    fn default() -> Self {
        Self {
            assets: Vec::new(),
            revision: String::new(),
            pending_load: None,
            pending_save: None,
            loaded_for: None,
            data_loaded: false,
            needs_reload: true,
            last_loaded: None,
            search: String::new(),
            category_filter: "Tất cả".to_owned(),
            status_filter: "Tất cả".to_owned(),
            department_filter: "Tất cả".to_owned(),
            page: 0,
            page_size: PAGE_SIZE,
            form_open: false,
            editing_key: None,
            form: AssetDraft::for_new(),
            selected_key: None,
            delete_key: None,
            conflicted: false,
            notice: String::new(),
            error: String::new(),
            usage_allocations: Vec::new(),
            usage_transfers: Vec::new(),
            pending_allocations: None,
            pending_transfers: None,
            usage_requested: false,
            usage_errors: Vec::new(),
            overview_tab: AssetOverviewTab::default(),
        }
    }
}

impl AssetsView {
    fn is_busy(&self) -> bool {
        self.pending_load.is_some() || self.pending_save.is_some()
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        if self.is_busy() {
            self.needs_reload = true;
            return;
        }
        self.pending_load = Some(api.list_asset_items_task(session));
        self.needs_reload = false;
        self.error.clear();
    }

    fn accept_response(&mut self, mut response: AssetItemsResponse) {
        for asset in &mut response.data {
            if asset.key.trim().is_empty() {
                asset.key = asset
                    .extra
                    .get("id")
                    .and_then(Value::as_str)
                    .filter(|id| !id.trim().is_empty())
                    .or_else(|| (!asset.code.trim().is_empty()).then_some(asset.code.as_str()))
                    .unwrap_or_default()
                    .to_owned();
            }
        }
        self.assets = response.data;
        self.revision = response.revision;
        self.data_loaded = true;
        self.error.clear();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let account = format!("{}:{}", session.endpoint, session.user.id);
        if self.loaded_for.as_deref() != Some(account.as_str()) {
            self.assets.clear();
            self.revision.clear();
            self.pending_load = None;
            self.pending_save = None;
            self.loaded_for = Some(account);
            self.data_loaded = false;
            self.needs_reload = true;
            self.last_loaded = None;
            self.notice.clear();
            self.error.clear();
            self.form_open = false;
            self.editing_key = None;
            self.selected_key = None;
            self.delete_key = None;
            self.conflicted = false;
            self.search.clear();
            self.category_filter = "Tất cả".to_owned();
            self.status_filter = "Tất cả".to_owned();
            self.department_filter = "Tất cả".to_owned();
            self.page = 0;
            self.usage_allocations.clear();
            self.usage_transfers.clear();
            self.pending_allocations = None;
            self.pending_transfers = None;
            self.usage_requested = false;
            self.usage_errors.clear();
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
                Ok(response) => self.accept_response(response),
                Err(error) => {
                    self.data_loaded = false;
                    self.error = error;
                }
            }
        }

        if let Some(result) = self.pending_save.as_ref().and_then(ApiClient::poll) {
            self.pending_save = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.accept_response(response);
                    self.notice = "Đã lưu danh mục tài sản lên máy chủ.".to_owned();
                    self.form_open = false;
                    self.editing_key = None;
                    self.form = AssetDraft::for_new();
                    self.conflicted = false;
                }
                Err(error) => {
                    self.notice.clear();
                    if error.contains("thay đổi") || error.contains("changed") {
                        self.conflicted = true;
                        self.needs_reload = true;
                    }
                    self.error = error;
                }
            }
        }

        if self.is_busy() {
            ctx.request_repaint_after(Duration::from_millis(80));
        } else if let Some(last_loaded) = self.last_loaded {
            ctx.request_repaint_after(REFRESH_INTERVAL.saturating_sub(last_loaded.elapsed()));
        }
    }

    fn begin_create(&mut self) {
        self.editing_key = None;
        self.form = AssetDraft::for_new();
        self.conflicted = false;
        self.error.clear();
        self.form_open = true;
    }

    fn begin_edit(&mut self, asset: &AssetItem) {
        self.editing_key = Some(asset.key.clone());
        self.form = AssetDraft::from_asset(asset);
        self.conflicted = false;
        self.error.clear();
        self.form_open = true;
    }

    fn save_form(&mut self, session: &Session, api: &ApiClient) {
        if !self.data_loaded || self.revision.is_empty() || self.is_busy() || self.conflicted {
            return;
        }
        let existing = self
            .editing_key
            .as_deref()
            .and_then(|key| self.assets.iter().find(|asset| asset.key == key))
            .cloned();
        match self.form.build(existing.as_ref(), self.assets.len()) {
            Ok(asset) => {
                let mut next = self.assets.clone();
                if let Some(existing) = existing {
                    if let Some(row) = next.iter_mut().find(|row| row.key == existing.key) {
                        *row = asset;
                    } else {
                        self.error = "Hồ sơ đã bị xóa; hãy tải lại danh sách.".to_owned();
                        self.needs_reload = true;
                        return;
                    }
                } else {
                    next.insert(0, asset);
                }
                self.notice.clear();
                self.error.clear();
                self.pending_save =
                    Some(api.replace_asset_items_task(session, &next, &self.revision));
            }
            Err(error) => self.error = error,
        }
    }

    fn delete_asset(&mut self, session: &Session, api: &ApiClient, key: &str) {
        if !self.data_loaded || self.revision.is_empty() || self.is_busy() {
            return;
        }
        let next: Vec<AssetItem> = self
            .assets
            .iter()
            .filter(|asset| asset.key != key)
            .cloned()
            .collect();
        if next.len() == self.assets.len() {
            self.error = "Không tìm thấy hồ sơ cần xóa; hãy tải lại danh sách.".to_owned();
            self.needs_reload = true;
            return;
        }
        self.notice.clear();
        self.error.clear();
        self.pending_save = Some(api.replace_asset_items_task(session, &next, &self.revision));
        self.delete_key = None;
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.render_route(ui, ctx, session, api, "/admin/assets/list");
    }

    pub fn render_route(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        path: &str,
    ) {
        self.poll(ctx, session, api);
        if path == "/admin/assets/usage" {
            self.poll_usage(ctx, session, api);
        }
        let busy = self.is_busy();
        let can_write = !busy && self.data_loaded && !self.revision.is_empty();

        self.render_list(ui, can_write, busy, path);

        self.render_form(ctx, session, api, can_write, busy);
        self.render_details(ctx);
        self.render_delete_confirmation(ctx, session, api, can_write);
    }

    fn render_list(&mut self, ui: &mut Ui, can_write: bool, busy: bool, path: &str) {
        ui.spacing_mut().item_spacing.y = 0.0;
        ui.add_space(8.0);
        if !self.notice.is_empty() {
            ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
        }
        if self.data_loaded && self.revision.is_empty() {
            ui.colored_label(
                Color32::from_rgb(180, 83, 9),
                "Máy chủ chưa trả revision; thao tác ghi bị khóa để tránh ghi đè dữ liệu.",
            );
        }
        let original = self.assets.iter().fold(0_u64, |sum, a| {
            sum.saturating_add(stored_number(&a.original_price).unwrap_or_default())
        });
        let net = self.assets.iter().fold(0_u64, |sum, a| {
            sum.saturating_add(stored_number(&a.net_book_value).unwrap_or_default())
        });
        let in_use = self
            .assets
            .iter()
            .filter(|a| a.status == "Đang sử dụng")
            .count();
        let stock = self
            .assets
            .iter()
            .filter(|a| a.status == "Trong kho")
            .count();
        let repair = self
            .assets
            .iter()
            .filter(|a| a.status == "Đang sửa chữa")
            .count();
        let inventory = format!("{} thiết bị & tài sản đang quản trị", self.assets.len());
        let depreciation = if original == 0 {
            "Hao mòn: chưa có nguyên giá".to_owned()
        } else {
            format!(
                "Hao mòn: {}% ({} ₫)",
                original.saturating_sub(net).saturating_mul(100) / original,
                format_vnd(original.saturating_sub(net))
            )
        };
        let condition = if repair > 0 {
            format!("{repair} tài sản đang bảo dưỡng sửa chữa")
        } else if self.assets.is_empty() {
            "Chưa có dữ liệu thiết bị".to_owned()
        } else {
            "Tất cả thiết bị vận hành ổn định".to_owned()
        };
        let known = |value: String| {
            if self.data_loaded {
                value
            } else {
                "—".to_owned()
            }
        };
        crate::widgets::metrics_with_padding(
            ui,
            "assets.metrics",
            &[
                crate::widgets::Metric {
                    label: "Tổng nguyên giá tài sản toàn công ty",
                    value: known(format!("{} ₫", format_vnd(original))),
                    detail: &inventory,
                    color: Color32::from_rgb(15, 23, 42),
                    value_size: 22.0,
                },
                crate::widgets::Metric {
                    label: "Giá trị còn lại (Net Book Value)",
                    value: known(format!("{} ₫", format_vnd(net))),
                    detail: &depreciation,
                    color: crate::theme::PRIMARY,
                    value_size: 22.0,
                },
                crate::widgets::Metric {
                    label: "Hiện trạng khai thác & Sử dụng",
                    value: known(format!("{in_use} đang dùng / {stock} trong kho")),
                    detail: &condition,
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 22.0,
                },
            ],
            Vec2::splat(16.0),
        );
        ui.add_space(16.0);
        if path == "/admin/assets/reports" {
            self.render_reports(ui);
            return;
        }
        if path == "/admin/assets/usage" {
            self.render_usage(ui);
            return;
        }
        if path == "/admin/assets/overview" {
            self.render_overview(ui, original, in_use, stock, repair);
            return;
        }
        let compact = ui.ctx().screen_rect().width() <= 992.0;
        let width = ui.available_width();
        let (bar, _) = ui.allocate_exact_size(
            egui::vec2(width, if compact { 152.0 } else { 32.0 }),
            egui::Sense::hover(),
        );
        let controls_width = if compact {
            width.min(512.109375)
        } else {
            340.0
        };
        let search = egui::Rect::from_min_size(bar.min, egui::vec2(controls_width, 32.0));
        if crate::widgets::search_input(
            ui,
            search,
            &mut self.search,
            "Tìm mã TS, tên, Barcode, Serial, người dùng, vị trí...",
        )
        .changed()
        {
            self.page = 0;
        }
        let category = egui::Rect::from_min_size(
            bar.min
                + if compact {
                    egui::vec2(0.0, 40.0)
                } else {
                    egui::vec2(348.0, 0.0)
                },
            egui::vec2(if compact { controls_width } else { 190.0 }, 32.0),
        );
        let status = egui::Rect::from_min_size(
            bar.min
                + if compact {
                    egui::vec2(0.0, 80.0)
                } else {
                    egui::vec2(546.0, 0.0)
                },
            egui::vec2(if compact { controls_width } else { 160.0 }, 32.0),
        );
        for (index, rect) in [category, status].into_iter().enumerate() {
            let mut child = ui.new_child(
                egui::UiBuilder::new()
                    .id_salt(("assets.filter", index))
                    .max_rect(rect)
                    .layout(egui::Layout::centered_and_justified(
                        egui::Direction::TopDown,
                    )),
            );
            let (value, options, hint) = if index == 0 {
                (
                    &mut self.category_filter,
                    ASSET_CATEGORIES,
                    "Tất cả nhóm tài sản",
                )
            } else {
                (&mut self.status_filter, ASSET_STATUSES, "Tất cả trạng thái")
            };
            crate::widgets::combo_box(index)
                .width(rect.width())
                .selected_text(if value == "Tất cả" {
                    hint
                } else {
                    value.as_str()
                })
                .show_ui(&mut child, |ui| {
                    if ui
                        .selectable_value(value, "Tất cả".to_owned(), hint)
                        .changed()
                    {
                        self.page = 0;
                    }
                    for option in options {
                        if ui
                            .selectable_value(value, (*option).to_owned(), *option)
                            .changed()
                        {
                            self.page = 0;
                        }
                    }
                });
        }
        let action_origin = if compact {
            bar.min + egui::vec2(0.0, 120.0)
        } else {
            egui::pos2(bar.right() - 291.71875, bar.top())
        };
        ui.add_enabled_ui(false, |ui| {
            crate::widgets::put(
                ui,
                egui::Rect::from_min_size(action_origin, egui::vec2(120.9375, 32.0)),
                egui::Button::new("Xuất Excel"),
            )
            .on_hover_text("Chưa có dịch vụ xuất Excel thật; không báo thành công giả.");
        });
        let add = egui::Rect::from_min_size(
            action_origin + egui::vec2(128.9375, 0.0),
            egui::vec2(162.78125, 32.0),
        );
        let mut create = false;
        ui.add_enabled_ui(can_write, |ui| {
            create = crate::widgets::put(
                ui,
                add,
                egui::Button::new(RichText::new("+ Thêm tài sản mới").color(Color32::WHITE))
                    .fill(crate::theme::PRIMARY),
            )
            .clicked();
        });
        if create {
            self.begin_create();
        }
        crate::visual_test::record("assets.add", add);
        crate::visual_test::record("assets.toolbar", bar);
        let more = egui::Rect::from_min_size(
            if compact {
                action_origin + egui::vec2(299.71875, 2.0)
            } else {
                bar.min + egui::vec2(718.0, 2.0)
            },
            Vec2::splat(28.0),
        );
        let mut more_ui =
            ui.new_child(egui::UiBuilder::new().id_salt("assets.more").max_rect(more));
        more_ui.spacing_mut().button_padding = egui::vec2(4.0, 2.0);
        more_ui.spacing_mut().interact_size.y = 28.0;
        more_ui.menu_button("…", |ui| {
            if ui
                .add_enabled(!busy, egui::Button::new("Làm mới"))
                .clicked()
            {
                self.needs_reload = true;
                ui.close_menu();
            }
            ui.label("Bộ phận");
            if ui
                .selectable_value(&mut self.department_filter, "Tất cả".to_owned(), "Tất cả")
                .changed()
            {
                self.page = 0;
            }
            let mut departments = self
                .assets
                .iter()
                .map(|a| a.department.as_str())
                .filter(|s| !s.trim().is_empty())
                .collect::<Vec<_>>();
            departments.sort();
            departments.dedup();
            for name in departments {
                if ui
                    .selectable_value(&mut self.department_filter, name.to_owned(), name)
                    .changed()
                {
                    self.page = 0;
                }
            }
        });
        ui.add_space(12.0);
        if !self.data_loaded {
            if busy {
                ui.spinner();
                ui.label("Đang tải danh mục tài sản từ máy chủ…");
            }
            return;
        }
        let query = self.search.trim().to_lowercase();
        let filtered = self
            .assets
            .iter()
            .filter(|a| {
                (self.category_filter == "Tất cả" || a.category == self.category_filter)
                    && (self.status_filter == "Tất cả" || a.status == self.status_filter)
                    && (self.department_filter == "Tất cả"
                        || a.department == self.department_filter)
                    && (query.is_empty()
                        || [
                            a.code.as_str(),
                            a.barcode.as_str(),
                            a.name.as_str(),
                            a.model.as_str(),
                            a.assigned_to.as_str(),
                            a.location.as_str(),
                            a.department.as_str(),
                        ]
                        .iter()
                        .any(|s| s.to_lowercase().contains(&query)))
            })
            .cloned()
            .collect::<Vec<_>>();
        let pages = filtered.len().div_ceil(self.page_size).max(1);
        self.page = self.page.min(pages - 1);
        let rows = filtered
            .iter()
            .skip(self.page * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        let base = if compact {
            [
                140.0, 171.484375, 98.828125, 145.015625, 172.109375, 71.1875, 79.15625, 140.0,
            ]
        } else {
            [
                140.0, 210.546875, 123.375, 178.78125, 211.296875, 90.203125, 99.796875, 140.0,
            ]
        };
        let extra = (width - 2.0 - base.iter().sum::<f32>()).max(0.0) / 6.0;
        let columns = [
            "Mã TS & Barcode",
            "Tên tài sản & Model / Seri",
            "Nhóm tài sản",
            "Nguyên giá & Còn lại",
            "Người dùng & Phòng ban",
            "Vị trí đặt",
            "Trạng thái",
            "Thao tác",
        ]
        .into_iter()
        .enumerate()
        .map(|(i, title)| crate::widgets::TableColumn {
            title,
            width: base[i] + if i == 0 || i == 7 { 0.0 } else { extra },
        })
        .collect::<Vec<_>>();
        let mut view = None;
        let mut edit = None;
        let mut delete = None;
        crate::widgets::table(ui, "assets.table", &columns, rows.len(), |ui, row, col| {
            let a = rows[row];
            match col {
                0 => {
                    ui.label(RichText::new(&a.code).strong().color(crate::theme::PRIMARY));
                    ui.label(
                        RichText::new(&a.barcode)
                            .size(11.0)
                            .color(Color32::from_rgb(100, 116, 139)),
                    );
                }
                1 => {
                    ui.label(RichText::new(&a.name).size(13.5).strong());
                    ui.label(RichText::new(&a.model).size(12.0));
                }
                2 => crate::widgets::tag(ui, &a.category, crate::widgets::TagTone::Cyan),
                3 => {
                    ui.label(RichText::new(money_text(&a.original_price)).strong());
                    ui.label(
                        RichText::new(format!("Còn lại: {}", money_text(&a.net_book_value)))
                            .size(11.5)
                            .color(Color32::from_rgb(22, 163, 74)),
                    );
                }
                4 => {
                    ui.label(&a.assigned_to);
                    ui.label(RichText::new(&a.department).size(11.5));
                }
                5 => {
                    ui.label(RichText::new(&a.location).size(12.0));
                }
                6 => crate::widgets::tag(
                    ui,
                    &a.status,
                    match a.status.as_str() {
                        "Đang sử dụng" => crate::widgets::TagTone::Success,
                        "Trong kho" => crate::widgets::TagTone::Processing,
                        "Đang sửa chữa" => crate::widgets::TagTone::Warning,
                        _ => crate::widgets::TagTone::Error,
                    },
                ),
                _ => {
                    ui.horizontal(|ui| {
                        if ui.small_button("Xem").clicked() {
                            view = Some(a.key.clone());
                        }
                        if ui
                            .add_enabled(can_write, egui::Button::new("Sửa"))
                            .clicked()
                        {
                            edit = Some(a.key.clone());
                        }
                        if ui
                            .add_enabled(can_write, egui::Button::new("Xóa"))
                            .clicked()
                        {
                            delete = Some(a.key.clone());
                        }
                    });
                }
            }
        });
        if let Some(key) = view {
            self.selected_key = Some(key);
        }
        if let Some(key) = edit {
            if let Some(a) = self.assets.iter().find(|a| a.key == key).cloned() {
                self.begin_edit(&a);
            }
        }
        if let Some(key) = delete {
            self.delete_key = Some(key);
        }
        ui.add_space(10.0);
        crate::widgets::pagination(
            ui,
            "assets.pagination",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );
    }

    fn poll_usage(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if !self.usage_requested {
            self.pending_allocations = Some(api.list_asset_allocations_task(session));
            self.pending_transfers = Some(api.list_asset_transfers_task(session));
            self.usage_requested = true;
            self.usage_errors.clear();
        }
        if let Some(result) = self.pending_allocations.as_ref().and_then(ApiClient::poll) {
            self.pending_allocations = None;
            match result {
                Ok(response) => self.usage_allocations = response.data,
                Err(error) => self.usage_errors.push(format!("Phiếu cấp phát: {error}")),
            }
        }
        if let Some(result) = self.pending_transfers.as_ref().and_then(ApiClient::poll) {
            self.pending_transfers = None;
            match result {
                Ok(response) => self.usage_transfers = response.data,
                Err(error) => self
                    .usage_errors
                    .push(format!("Phiếu điều chuyển: {error}")),
            }
        }
        if self.pending_allocations.is_some() || self.pending_transfers.is_some() {
            ctx.request_repaint_after(Duration::from_millis(80));
        }
    }

    fn render_reports(&self, ui: &mut Ui) {
        let (Some(groups), Some(departments)) = (
            asset_report_groups(&self.assets, false),
            asset_report_groups(&self.assets, true),
        ) else {
            ui.colored_label(Color32::from_rgb(185,28,28), "Không thể tổng hợp: có tài sản thiếu giá trị hợp lệ hoặc tổng vượt giới hạn số. Không thay dữ liệu thiếu bằng 0.");
            return;
        };
        let columns = if ui.available_width() >= 736.0 { 2 } else { 1 };
        let width = (ui.available_width() - (columns - 1) as f32 * 16.0) / columns as f32;
        let panel = |ui: &mut Ui, department: bool| {
            ui.vertical(|ui| {
                ui.set_width(width);
                egui::Frame::none()
                    .fill(Color32::WHITE)
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                    .rounding(8.0)
                    .inner_margin(16.0)
                    .show(ui, |ui| {
                        ui.set_width(width - 34.0);
                        ui.label(
                            RichText::new(if department {
                                "Mức Độ Khấu Hao Theo Phòng Ban Trực Thuộc"
                            } else {
                                "Cơ Cấu Giá Trị Tài Sản Theo Nhóm Chủng Loại"
                            })
                            .size(16.0)
                            .strong(),
                        );
                        ui.add_space(24.0);
                        if !self.data_loaded {
                            ui.label("Chưa tải được dữ liệu tài sản.");
                            return;
                        }
                        let rows = if department { &departments } else { &groups };
                        if rows.is_empty() {
                            ui.label("Chưa có dữ liệu tài sản để tổng hợp.");
                        }
                        let total = groups
                            .iter()
                            .fold(0_u64, |sum, row| sum.saturating_add(row.2));
                        for (index, (name, count, original, net)) in rows.iter().enumerate() {
                            if index > 0 {
                                ui.add_space(if department { 10.0 } else { 12.0 });
                            }
                            let colors = [
                                Color32::from_rgb(37, 99, 235),
                                crate::theme::PRIMARY,
                                Color32::from_rgb(245, 158, 11),
                                Color32::from_rgb(139, 92, 246),
                            ];
                            if department {
                                egui::Frame::none()
                                    .fill(Color32::from_rgb(248, 250, 252))
                                    .stroke(egui::Stroke::new(
                                        1.0,
                                        Color32::from_rgb(226, 232, 240),
                                    ))
                                    .rounding(6.0)
                                    .inner_margin(egui::vec2(14.0, 10.0))
                                    .show(ui, |ui| {
                                        ui.set_width(width - 64.0);
                                        ui.label(RichText::new(name).strong());
                                        ui.label(
                                            RichText::new(format!(
                                                "Nguyên giá: {} ₫",
                                                format_vnd(*original)
                                            ))
                                            .size(12.0)
                                            .color(Color32::from_rgb(100, 116, 139)),
                                        );
                                        ui.with_layout(
                                            egui::Layout::right_to_left(egui::Align::Center),
                                            |ui| {
                                                ui.label(
                                                    RichText::new(format!(
                                                        "{} ₫",
                                                        format_vnd(*net)
                                                    ))
                                                    .size(13.5)
                                                    .strong()
                                                    .color(crate::theme::PRIMARY),
                                                );
                                                ui.label(
                                                    RichText::new("Giá trị còn lại")
                                                        .size(11.5)
                                                        .color(Color32::from_rgb(22, 163, 74)),
                                                );
                                            },
                                        );
                                    });
                            } else {
                                let percent = if total == 0 {
                                    0.0
                                } else {
                                    *original as f64 / total as f64
                                };
                                ui.label(
                                    RichText::new(format!("{name} ({count} TS)"))
                                        .size(13.0)
                                        .strong(),
                                );
                                ui.label(
                                    RichText::new(format!(
                                        "{} ₫ ({:.0}%)",
                                        format_vnd(*original),
                                        percent * 100.0
                                    ))
                                    .size(13.0)
                                    .strong()
                                    .color(colors[index % colors.len()]),
                                );
                                ui.add_space(4.0);
                                ui.add(
                                    egui::ProgressBar::new(percent as f32)
                                        .fill(colors[index % colors.len()])
                                        .desired_height(6.0),
                                );
                            }
                        }
                    });
            });
        };
        if columns == 2 {
            ui.horizontal_top(|ui| {
                ui.spacing_mut().item_spacing.x = 16.0;
                panel(ui, false);
                panel(ui, true);
            });
        } else {
            panel(ui, false);
            ui.add_space(16.0);
            panel(ui, true);
        }
    }

    fn render_overview(
        &mut self,
        ui: &mut Ui,
        original: u64,
        in_use: usize,
        stock: usize,
        needs_attention: usize,
    ) {
        ui.horizontal_wrapped(|ui| {
            for (tab, label) in [
                (AssetOverviewTab::Categories, "Cơ cấu nhóm tài sản"),
                (AssetOverviewTab::Lifecycle, "Hiện trạng sử dụng"),
                (AssetOverviewTab::Attention, "Tài sản cần xử lý"),
            ] {
                let selected = self.overview_tab == tab;
                let (fill, text, border) = if selected {
                    (
                        Color32::from_rgb(224, 242, 241),
                        Color32::from_rgb(0, 121, 107),
                        crate::theme::PRIMARY,
                    )
                } else {
                    (
                        Color32::WHITE,
                        Color32::from_rgb(71, 85, 105),
                        Color32::from_rgb(203, 213, 225),
                    )
                };
                if ui
                    .add(
                        egui::Button::new(RichText::new(label).size(13.0).color(text))
                            .fill(fill)
                            .stroke(egui::Stroke::new(1.0, border)),
                    )
                    .clicked()
                {
                    self.overview_tab = tab;
                }
            }
        });
        ui.add_space(12.0);

        egui::Frame::group(ui.style())
            .fill(Color32::WHITE)
            .inner_margin(16.0)
            .show(ui, |ui| match self.overview_tab {
                AssetOverviewTab::Categories => {
                    ui.heading("Cơ cấu tài sản theo nhóm");
                    ui.add_space(12.0);
                    let mut groups = BTreeMap::<String, (usize, u64)>::new();
                    for asset in &self.assets {
                        let name = if asset.category.trim().is_empty() {
                            "Chưa phân loại".to_owned()
                        } else {
                            asset.category.clone()
                        };
                        let group = groups.entry(name).or_default();
                        group.0 += 1;
                        if let Some(value) = stored_number(&asset.original_price) {
                            group.1 = group.1.saturating_add(value);
                        }
                    }
                    if groups.is_empty() {
                        ui.label(if self.data_loaded {
                            "Chưa có tài sản để tổng hợp."
                        } else {
                            "Đang tải dữ liệu tài sản…"
                        });
                    } else {
                        for (name, (count, value)) in groups {
                            ui.horizontal(|ui| {
                                ui.label(RichText::new(name).strong());
                                ui.with_layout(
                                    egui::Layout::right_to_left(egui::Align::Center),
                                    |ui| {
                                        ui.label(format!(
                                            "{count} tài sản · {}",
                                            format_vnd(value)
                                        ));
                                    },
                                );
                            });
                            ui.add_space(6.0);
                        }
                    }
                    ui.separator();
                    ui.label(format!(
                        "Tổng nguyên giá đã ghi nhận: {} ₫",
                        format_vnd(original)
                    ));
                }
                AssetOverviewTab::Lifecycle => {
                    ui.heading("Hiện trạng khai thác & sử dụng");
                    ui.add_space(12.0);
                    ui.label(format!("Đang sử dụng: {in_use}"));
                    ui.label(format!("Trong kho: {stock}"));
                    let mut statuses = BTreeMap::<String, usize>::new();
                    for asset in &self.assets {
                        *statuses
                            .entry(if asset.status.trim().is_empty() {
                                "Chưa khai báo trạng thái".to_owned()
                            } else {
                                asset.status.clone()
                            })
                            .or_default() += 1;
                    }
                    ui.add_space(8.0);
                    if statuses.is_empty() {
                        ui.label(if self.data_loaded {
                            "Chưa có dữ liệu tài sản."
                        } else {
                            "Đang tải dữ liệu tài sản…"
                        });
                    } else {
                        for (status, count) in statuses {
                            ui.horizontal(|ui| {
                                ui.label(status);
                                ui.with_layout(
                                    egui::Layout::right_to_left(egui::Align::Center),
                                    |ui| {
                                        ui.label(format!("{count}"));
                                    },
                                );
                            });
                        }
                    }
                }
                AssetOverviewTab::Attention => {
                    ui.heading("Tài sản cần xử lý");
                    ui.add_space(12.0);
                    if self.assets.is_empty() {
                        ui.label(if self.data_loaded {
                            "Chưa có tài sản để kiểm tra."
                        } else {
                            "Đang tải dữ liệu tài sản…"
                        });
                    } else if needs_attention == 0 {
                        ui.label(
                            "Không có tài sản mang trạng thái sửa chữa, bảo trì hoặc chờ thanh lý.",
                        );
                    } else {
                        for asset in self.assets.iter().filter(|asset| {
                            let status = asset.status.to_lowercase();
                            status.contains("sửa")
                                || status.contains("bảo trì")
                                || status.contains("thanh lý")
                                || status.contains("kiểm kê")
                        }) {
                            ui.horizontal(|ui| {
                                ui.label(RichText::new(&asset.code).strong());
                                ui.label(&asset.name);
                                ui.with_layout(
                                    egui::Layout::right_to_left(egui::Align::Center),
                                    |ui| {
                                        ui.label(&asset.status);
                                    },
                                );
                            });
                        }
                    }
                }
            });
    }

    fn render_usage(&mut self, ui: &mut Ui) {
        ui.horizontal_wrapped(|ui| {
            ui.label(
                RichText::new("Nhật Ký & Lịch Sử Luân Chuyển Khai Thác Tài Sản Toàn Công Ty")
                    .size(16.0)
                    .strong(),
            );
            ui.add_enabled(false, egui::Button::new("Xuất Nhật Ký (Excel)"))
                .on_hover_text("Chưa có dịch vụ xuất nhật ký thật.");
        });
        ui.add_space(12.0);
        let rows = asset_usage_rows(&self.usage_allocations, &self.usage_transfers);
        self.page_size = self.page_size.max(1);
        self.page = self
            .page
            .min(rows.len().div_ceil(self.page_size).max(1) - 1);
        let visible = rows
            .iter()
            .skip(self.page * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        let extra = ((ui.available_width() - 152.0) / 5.0).max(170.0);
        let columns = [
            "Thời gian",
            "Mã & Tên tài sản",
            "Hành động",
            "Người thực hiện",
            "Đơn vị / Người tiếp nhận",
            "Ghi chú nghiệp vụ",
        ]
        .into_iter()
        .enumerate()
        .map(|(i, title)| crate::widgets::TableColumn {
            title,
            width: if i == 0 { 150.0 } else { extra },
        })
        .collect::<Vec<_>>();
        crate::widgets::table(
            ui,
            "assets.usage.table",
            &columns,
            visible.len(),
            |ui, row, col| {
                let value = visible[row];
                match col {
                    0 => {
                        ui.label(nonempty(&value.date));
                    }
                    1 => {
                        ui.label(
                            RichText::new(nonempty(&value.code))
                                .strong()
                                .color(crate::theme::PRIMARY),
                        );
                        ui.label(RichText::new(&value.name).size(12.0));
                    }
                    2 => {
                        crate::widgets::tag(ui, &value.action, crate::widgets::TagTone::Processing)
                    }
                    3 => {
                        ui.label(nonempty(&value.actor));
                    }
                    4 => {
                        ui.label(RichText::new(nonempty(&value.recipient)).strong());
                    }
                    _ => {
                        ui.label(nonempty(&value.note));
                    }
                }
            },
        );
        ui.add_space(10.0);
        crate::widgets::pagination(
            ui,
            "assets.usage.pagination",
            &mut self.page,
            rows.len(),
            &mut self.page_size,
        );
        ui.add_space(12.0);
        if self.pending_allocations.is_some() || self.pending_transfers.is_some() {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải phiếu cấp phát và điều chuyển…");
            });
        }
        for error in &self.usage_errors {
            ui.colored_label(Color32::from_rgb(185, 28, 28), error);
        }
        ui.label(RichText::new("Hiển thị phiếu nghiệp vụ đã lưu và trạng thái hiện tại, không phải nhật ký sự kiện đầy đủ. Ngày trên phiếu không xác nhận thời điểm hoàn tất bàn giao.")
            .size(12.0).color(Color32::from_rgb(100, 116, 139)));
        if ui
            .add_enabled(
                self.pending_allocations.is_none() && self.pending_transfers.is_none(),
                egui::Button::new("Làm mới"),
            )
            .clicked()
        {
            self.usage_requested = false;
        }
    }

    fn render_form(
        &mut self,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        can_write: bool,
        busy: bool,
    ) {
        if !self.form_open {
            return;
        }
        let mut save_clicked = false;
        let mut close_clicked = false;
        let (_, closed) = crate::widgets::modal(
            ctx,
            "assets.edit",
            if self.editing_key.is_some() {
                "Chỉnh sửa tài sản"
            } else {
                "Thêm mới tài sản cố định / CCDC"
            },
            760.0,
            busy,
            |ui| {
                ui.add_space(14.0);
                ui.columns(3, |c| {
                    crate::widgets::form_input(
                        &mut c[0],
                        "asset.code",
                        "Mã tài sản (Định danh)",
                        true,
                        &mut self.form.code,
                        "Ví dụ: TS-IT-030",
                        false,
                    );
                    crate::widgets::form_input(
                        &mut c[1],
                        "asset.barcode",
                        "Mã Barcode / QR Quét",
                        false,
                        &mut self.form.barcode,
                        "Ví dụ: 8936001030",
                        false,
                    );
                    crate::widgets::form_select(
                        &mut c[2],
                        "asset.category",
                        "Nhóm tài sản",
                        true,
                        &mut self.form.category,
                        ASSET_CATEGORIES,
                    );
                });
                ui.columns(2, |c| {
                    crate::widgets::form_input(
                        &mut c[0],
                        "asset.name",
                        "Tên tài sản",
                        true,
                        &mut self.form.name,
                        "Ví dụ: Laptop ThinkPad X1 Carbon Gen 11",
                        false,
                    );
                    crate::widgets::form_input(
                        &mut c[1],
                        "asset.model",
                        "Model / Số Serial thiết bị",
                        false,
                        &mut self.form.model,
                        "Ví dụ: 21HM004FVA / Serial: PF4590X",
                        false,
                    );
                });
                ui.columns(3, |c| {
                    crate::widgets::form_input(
                        &mut c[0],
                        "asset.supplier",
                        "Nhà cung cấp / Đơn vị bán",
                        false,
                        &mut self.form.supplier,
                        "Tên đơn vị bán hàng",
                        false,
                    );
                    crate::widgets::form_date(
                        &mut c[1],
                        "asset.purchase",
                        "Ngày mua / Bắt đầu dùng",
                        false,
                        &mut self.form.purchase_date,
                    );
                    crate::widgets::form_date(
                        &mut c[2],
                        "asset.warranty",
                        "Hạn bảo hành chính hãng",
                        false,
                        &mut self.form.warranty_expiry,
                    );
                });
                ui.columns(3, |c| {
                    crate::widgets::form_input(
                        &mut c[0],
                        "asset.original",
                        "Nguyên giá mua vào (VNĐ)",
                        true,
                        &mut self.form.original_price,
                        "Ví dụ: 35000000",
                        false,
                    );
                    crate::widgets::form_input(
                        &mut c[1],
                        "asset.months",
                        "Thời gian khấu hao (Tháng)",
                        true,
                        &mut self.form.depreciation_months,
                        "36 tháng",
                        false,
                    );
                    crate::widgets::form_select(
                        &mut c[2],
                        "asset.status",
                        "Trạng thái hiện tại",
                        true,
                        &mut self.form.status,
                        ASSET_STATUSES,
                    );
                });
                ui.columns(2, |c| {
                    crate::widgets::form_input(
                        &mut c[0],
                        "asset.department",
                        "Phòng ban / Khối quản lý",
                        false,
                        &mut self.form.department,
                        "Chọn phòng ban...",
                        false,
                    );
                    crate::widgets::form_input(
                        &mut c[1],
                        "asset.assignee",
                        "Cán bộ trực tiếp sử dụng",
                        false,
                        &mut self.form.assigned_to,
                        "Tên nhân viên hoặc ghi 'Dùng chung' / 'Chưa cấp phát'",
                        false,
                    );
                });
                crate::widgets::form_input(
                    ui,
                    "asset.location",
                    "Vị trí lắp đặt / Bàn làm việc",
                    false,
                    &mut self.form.location,
                    "Địa điểm thực tế đặt tài sản",
                    false,
                );
                crate::widgets::form_textarea(
                    ui,
                    "asset.specs",
                    "Cấu hình kỹ thuật / Phụ kiện đính kèm",
                    false,
                    &mut self.form.specs,
                    "Chi tiết CPU, RAM, Ổ cứng, Cáp sạc, Túi chống sốc...",
                    2,
                );
                crate::widgets::form_input(
                    ui,
                    "asset.notes",
                    "Ghi chú nghiệp vụ",
                    false,
                    &mut self.form.notes,
                    "Mục đích sử dụng hoặc điều kiện bàn giao...",
                    false,
                );
                ui.collapsing("Thông tin bổ sung", |ui| {
                    crate::widgets::form_input(
                        ui,
                        "asset.accumulated",
                        "Hao mòn lũy kế (VNĐ)",
                        false,
                        &mut self.form.accumulated_depreciation,
                        "0",
                        false,
                    );
                });
                if self.conflicted {
                    ui.colored_label(Color32::from_rgb(180,83,9),"Danh mục đã đổi trên máy chủ. Đóng biểu mẫu và tải dữ liệu mới để tránh ghi đè thay đổi khác.");
                }
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                }
                ui.add_space(20.0);
                crate::widgets::action_row(ui, |ui| {
                    save_clicked = ui
                        .add_enabled(
                            can_write && !self.conflicted,
                            egui::Button::new(
                                RichText::new(if busy {
                                    "Đang lưu…"
                                } else if self.editing_key.is_some() {
                                    "Lưu cập nhật"
                                } else {
                                    "Tạo mới tài sản"
                                })
                                .color(Color32::WHITE),
                            )
                            .fill(crate::theme::PRIMARY),
                        )
                        .clicked();
                    close_clicked = ui
                        .button(if self.conflicted {
                            "Đóng"
                        } else {
                            "Hủy bỏ"
                        })
                        .clicked();
                });
            },
        );
        let open = !closed;
        if close_clicked || !open {
            self.form_open = false;
            self.editing_key = None;
            self.form = AssetDraft::for_new();
            self.conflicted = false;
            self.error.clear();
        } else if save_clicked {
            self.save_form(session, api);
        }
    }

    fn render_details(&mut self, ctx: &egui::Context) {
        let Some(key) = self.selected_key.clone() else {
            return;
        };
        let Some(asset) = self.assets.iter().find(|asset| asset.key == key).cloned() else {
            self.selected_key = None;
            return;
        };
        let (_, closed) = crate::widgets::drawer(
            ctx,
            "assets.details",
            "Lý Lịch & Hồ Sơ Tài Sản Doanh Nghiệp",
            520.0,
            |ui| {
                ui.spacing_mut().item_spacing.y = 16.0;
                egui::Frame::none()
                    .fill(Color32::from_rgb(248, 250, 252))
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                    .rounding(8.0)
                    .inner_margin(16.0)
                    .show(ui, |ui| {
                        ui.set_width(ui.available_width());
                        ui.spacing_mut().item_spacing.y = 2.0;
                        ui.horizontal_wrapped(|ui| {
                            ui.vertical(|ui| {
                                ui.label(
                                    RichText::new(&asset.code)
                                        .size(12.0)
                                        .strong()
                                        .color(crate::theme::PRIMARY),
                                );
                                ui.label(RichText::new(&asset.name).size(16.0).strong());
                            });
                            crate::widgets::tag(
                                ui,
                                &asset.status,
                                if asset.status == "Đang sử dụng" {
                                    crate::widgets::TagTone::Success
                                } else {
                                    crate::widgets::TagTone::Processing
                                },
                            );
                        });
                        ui.add_space(6.0);
                        ui.label(
                            RichText::new(&asset.model)
                                .size(12.5)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                    });
                egui::Frame::none()
                    .fill(Color32::from_rgb(239, 246, 255))
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(191, 219, 254)))
                    .rounding(8.0)
                    .inner_margin(14.0)
                    .show(ui, |ui| {
                        ui.set_width(ui.available_width());
                        ui.spacing_mut().item_spacing.y = 8.0;
                        ui.label(
                            RichText::new("Giá Trị Tài Chính & Khấu Hao")
                                .size(13.0)
                                .strong()
                                .color(Color32::from_rgb(30, 64, 175)),
                        );
                        for fields in [
                            [
                                (
                                    "Nguyên giá:",
                                    money_text(&asset.original_price),
                                    Color32::from_rgb(15, 23, 42),
                                ),
                                (
                                    "Giá trị còn lại:",
                                    money_text(&asset.net_book_value),
                                    Color32::from_rgb(22, 163, 74),
                                ),
                            ],
                            [
                                (
                                    "Hao mòn lũy kế:",
                                    money_text(&asset.accumulated_depreciation),
                                    Color32::from_rgb(220, 38, 38),
                                ),
                                (
                                    "Thời hạn trích:",
                                    format!("{} tháng", display_value(&asset.depreciation_months)),
                                    Color32::from_rgb(37, 99, 235),
                                ),
                            ],
                        ] {
                            ui.columns(2, |cols| {
                                for (col, (label, value, color)) in cols.iter_mut().zip(fields) {
                                    col.spacing_mut().item_spacing.y = 0.0;
                                    col.label(
                                        RichText::new(label)
                                            .size(12.5)
                                            .color(Color32::from_rgb(100, 116, 139)),
                                    );
                                    col.label(
                                        RichText::new(value).size(14.0).strong().color(color),
                                    );
                                }
                            });
                        }
                    });
                ui.scope(|ui| {
                    ui.spacing_mut().item_spacing.y = 8.0;
                    for (label, value) in [
                        ("Người đang sử dụng:", &asset.assigned_to),
                        ("Phòng ban quản lý:", &asset.department),
                        ("Vị trí lắp đặt:", &asset.location),
                        ("Nhà cung cấp:", &asset.supplier),
                        ("Ngày đưa vào sử dụng:", &asset.purchase_date),
                        ("Hạn bảo hành:", &asset.warranty_expiry),
                    ] {
                        ui.columns(2, |cols| {
                            cols[0].label(
                                RichText::new(label)
                                    .size(13.0)
                                    .color(Color32::from_rgb(100, 116, 139)),
                            );
                            cols[1].with_layout(egui::Layout::top_down(egui::Align::Max), |ui| {
                                ui.label(
                                    RichText::new(if value.is_empty() { "—" } else { value })
                                        .size(13.0),
                                );
                            });
                        });
                    }
                });
                egui::Frame::none()
                    .fill(Color32::from_rgb(248, 250, 252))
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                    .rounding(6.0)
                    .inner_margin(12.0)
                    .show(ui, |ui| {
                        ui.set_width(ui.available_width());
                        ui.spacing_mut().item_spacing.y = 4.0;
                        ui.label(
                            RichText::new("Cấu hình & Ghi chú kỹ thuật:")
                                .size(12.5)
                                .strong(),
                        );
                        ui.label(
                            RichText::new(if asset.specs.is_empty() {
                                "Không có ghi chú cấu hình"
                            } else {
                                &asset.specs
                            })
                            .size(12.5)
                            .color(Color32::from_rgb(71, 85, 105)),
                        );
                        if !asset.notes.is_empty() {
                            ui.label(
                                RichText::new(format!("* {}", asset.notes))
                                    .size(12.5)
                                    .italics()
                                    .color(Color32::from_rgb(100, 116, 139)),
                            );
                        }
                    });
                ui.add_space(10.0);
                ui.add_enabled(false, egui::Button::new("In phiếu lý lịch tài sản"))
                    .on_disabled_hover_text("Chưa có tệp PDF được tạo và xác nhận.");
                ui.add_enabled(false, egui::Button::new("Tạo tem nhãn Barcode / QR"))
                    .on_disabled_hover_text(
                        "Chưa có bộ tạo/in mã QR thật; không hiển thị mã mô phỏng.",
                    );
                ui.collapsing("Thông tin bổ sung", |ui| {
                    egui::Grid::new("asset.details.extra").show(ui, |ui| {
                        detail(ui, "Barcode", &asset.barcode);
                        detail(ui, "Phân loại", &asset.category);
                    });
                });
                if !asset.extra.is_empty() {
                    ui.add_space(8.0);
                    ui.label(
                        RichText::new(format!(
                            "Giữ nguyên {} trường dữ liệu legacy khác.",
                            asset.extra.len()
                        ))
                        .size(11.0)
                        .color(Color32::GRAY),
                    );
                }
            },
        );
        if closed {
            self.selected_key = None;
        }
    }

    fn render_delete_confirmation(
        &mut self,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        can_write: bool,
    ) {
        let Some(key) = self.delete_key.clone() else {
            return;
        };
        let Some(asset) = self.assets.iter().find(|asset| asset.key == key) else {
            self.delete_key = None;
            return;
        };
        let code = asset.code.clone();
        let name = asset.name.clone();
        let mut open = true;
        let mut delete_clicked = false;
        let mut cancel_clicked = false;
        egui::Window::new("Xác nhận xóa tài sản")
            .open(&mut open)
            .collapsible(false)
            .resizable(false)
            .show(ctx, |ui| {
                ui.label(format!("Xóa hồ sơ {code} · {name} khỏi danh mục máy chủ?"));
                ui.label("Thao tác này không thể hoàn tác từ màn hình này.");
                ui.horizontal(|ui| {
                    if ui.button("Hủy").clicked() {
                        cancel_clicked = true;
                    }
                    if ui
                        .add_enabled(can_write, egui::Button::new("Xóa hồ sơ"))
                        .clicked()
                    {
                        delete_clicked = true;
                    }
                });
            });
        if delete_clicked {
            self.delete_asset(session, api, &key);
        } else if cancel_clicked || !open {
            self.delete_key = None;
        }
    }
}

fn parse_money(raw: &str, label: &str) -> Result<u64, String> {
    let compact: String = raw
        .trim()
        .chars()
        .filter(|character| !matches!(character, ' ' | '\u{00a0}'))
        .collect();
    let has_dot = compact.contains('.');
    let has_comma = compact.contains(',');
    if has_dot && has_comma {
        return Err(format!("{label} phải là số nguyên không âm."));
    }
    let normalized = if has_dot || has_comma {
        let separator = if has_dot { '.' } else { ',' };
        let groups: Vec<&str> = compact.split(separator).collect();
        let valid_groups = groups.len() >= 2
            && (1..=3).contains(&groups[0].len())
            && groups[0].bytes().all(|byte| byte.is_ascii_digit())
            && groups
                .iter()
                .skip(1)
                .all(|group| group.len() == 3 && group.bytes().all(|byte| byte.is_ascii_digit()));
        if !valid_groups {
            return Err(format!("{label} phải là số nguyên không âm."));
        }
        groups.concat()
    } else {
        compact
    };
    let value = normalized
        .parse::<u64>()
        .map_err(|_| format!("{label} phải là số nguyên không âm."))?;
    if value > 1_000_000_000_000 {
        return Err(format!("{label} vượt giới hạn 1.000.000.000.000 VNĐ."));
    }
    Ok(value)
}

fn stored_number(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| {
            value.as_f64().and_then(|number| {
                (number.is_finite() && number >= 0.0 && number.fract() == 0.0)
                    .then_some(number as u64)
            })
        })
        .or_else(|| {
            value
                .as_str()
                .and_then(|text| parse_money(text, "Giá trị").ok())
        })
}

fn stored_number_input(value: &Value, default: &str) -> String {
    if value.is_null() {
        default.to_owned()
    } else if let Some(number) = stored_number(value) {
        number.to_string()
    } else {
        value
            .as_str()
            .map_or_else(|| value.to_string(), ToOwned::to_owned)
    }
}

fn display_value(value: &Value) -> String {
    value
        .as_str()
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| value.to_string())
}

fn money_text(value: &Value) -> String {
    stored_number(value)
        .map(|amount| format!("{} ₫", format_vnd(amount)))
        .unwrap_or_else(|| "—".to_owned())
}

fn nonempty(value: &str) -> &str {
    if value.trim().is_empty() {
        "—"
    } else {
        value
    }
}

// Group real inventory values; a missing category/department stays explicitly unknown.
fn asset_report_groups(
    assets: &[AssetItem],
    department: bool,
) -> Option<Vec<(String, usize, u64, u64)>> {
    let mut groups = std::collections::BTreeMap::<String, (usize, u64, u64)>::new();
    for asset in assets {
        let label = if department {
            &asset.department
        } else {
            &asset.category
        };
        let entry = groups
            .entry(if label.trim().is_empty() {
                "Chưa phân loại".to_owned()
            } else {
                label.trim().to_owned()
            })
            .or_default();
        entry.0 += 1;
        entry.1 = entry.1.checked_add(stored_number(&asset.original_price)?)?;
        entry.2 = entry.2.checked_add(stored_number(&asset.net_book_value)?)?;
    }
    Some(
        groups
            .into_iter()
            .map(|(name, (count, original, net))| (name, count, original, net))
            .collect(),
    )
}

struct AssetUsageRow {
    date: String,
    code: String,
    name: String,
    action: String,
    actor: String,
    recipient: String,
    note: String,
}

fn asset_usage_rows(
    allocations: &[AssetAllocation],
    transfers: &[AssetTransfer],
) -> Vec<AssetUsageRow> {
    let mut rows = allocations
        .iter()
        .map(|row| AssetUsageRow {
            date: row.allocated_date.clone(),
            code: row.asset_code.clone(),
            name: row.asset_name.clone(),
            action: format!(
                "Phiếu {} · {}",
                nonempty(&row.operation_type),
                nonempty(&row.status)
            ),
            actor: row.handover_person.clone(),
            recipient: [row.employee_name.as_str(), row.department.as_str()]
                .into_iter()
                .filter(|s| !s.trim().is_empty())
                .collect::<Vec<_>>()
                .join(" · "),
            note: row.notes.clone(),
        })
        .chain(transfers.iter().map(|row| {
            AssetUsageRow {
                date: row.transfer_date.clone(),
                code: row.asset_code.clone(),
                name: row.asset_name.clone(),
                action: format!("Phiếu điều chuyển · {}", nonempty(&row.status)),
                actor: row.created_by_name.clone(),
                recipient: [row.to_custodian.as_str(), row.to_department.as_str()]
                    .into_iter()
                    .filter(|s| !s.trim().is_empty())
                    .collect::<Vec<_>>()
                    .join(" · "),
                note: row.notes.clone(),
            }
        }))
        .collect::<Vec<_>>();
    rows.sort_by(|left, right| right.date.cmp(&left.date));
    rows
}

fn detail(ui: &mut Ui, label: &str, value: &str) {
    ui.label(RichText::new(label).strong());
    ui.label(if value.is_empty() { "—" } else { value });
    ui.end_row();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn report_panels_fit_desktop_tablet_and_mobile_without_expanding_the_page() {
        for width in [1440.0, 768.0, 390.0] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            crate::native_text::setup_style(&ctx);
            let view = AssetsView {
                data_loaded: true,
                ..Default::default()
            };
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
                        view.render_reports(ui);
                        assert!(
                            ui.min_rect().right() <= right + 1.0,
                            "report overflow at {width}: {:?}",
                            ui.min_rect()
                        );
                    });
                },
            );
        }
    }

    #[test]
    fn reports_group_only_real_inventory_and_keep_unknown_categories() {
        let assets = vec![
            AssetItem {
                category: "IT".to_owned(),
                department: "A".to_owned(),
                original_price: json!(100),
                net_book_value: json!(75),
                ..Default::default()
            },
            AssetItem {
                category: "IT".to_owned(),
                department: "B".to_owned(),
                original_price: json!(200),
                net_book_value: json!(80),
                ..Default::default()
            },
            AssetItem {
                original_price: json!(0),
                net_book_value: json!(0),
                ..Default::default()
            },
        ];
        let rows = asset_report_groups(&assets, false).unwrap();
        assert_eq!(
            rows,
            vec![
                ("Chưa phân loại".to_owned(), 1, 0, 0),
                ("IT".to_owned(), 2, 300, 155)
            ]
        );
        assert_eq!(asset_report_groups(&assets, true).unwrap().len(), 3);
        assert!(asset_report_groups(&[], false).unwrap().is_empty());
        assert!(asset_report_groups(&[AssetItem::default()], false).is_none());
        let invalid = AssetItem {
            original_price: json!("unknown"),
            net_book_value: json!(0),
            ..Default::default()
        };
        assert!(asset_report_groups(&[invalid], true).is_none());
    }

    #[test]
    fn usage_lists_saved_documents_without_inventing_completion_events() {
        let rows = asset_usage_rows(
            &[AssetAllocation {
                asset_code: "TS-A".to_owned(),
                allocated_date: "2026-10-01".to_owned(),
                status: "Chờ nhận".to_owned(),
                ..Default::default()
            }],
            &[AssetTransfer {
                asset_code: "TS-B".to_owned(),
                transfer_date: "2026-10-20".to_owned(),
                status: "Chờ duyệt".to_owned(),
                created_by_name: "Người tạo".to_owned(),
                ..Default::default()
            }],
        );
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].code, "TS-B");
        assert_eq!(rows[0].actor, "Người tạo");
        assert_eq!(rows[0].action, "Phiếu điều chuyển · Chờ duyệt");
        assert!(rows[1].recipient.is_empty());
        assert!(asset_usage_rows(&[], &[]).is_empty());
    }

    fn valid_draft() -> AssetDraft {
        AssetDraft {
            code: " TS-001 ".to_owned(),
            name: " Máy tính xách tay ".to_owned(),
            category: "Thiết bị IT".to_owned(),
            original_price: "24.000.000".to_owned(),
            depreciation_months: "36".to_owned(),
            accumulated_depreciation: "2,000,000".to_owned(),
            status: "Trong kho".to_owned(),
            ..AssetDraft::for_new()
        }
    }

    #[test]
    fn asset_create_validates_required_fields_and_calculates_net_value() {
        let asset = valid_draft().build(None, 0).expect("valid asset");
        assert_eq!(asset.code, "TS-001");
        assert_eq!(asset.name, "Máy tính xách tay");
        assert_eq!(asset.original_price, json!(24_000_000));
        assert_eq!(asset.accumulated_depreciation, json!(2_000_000));
        assert_eq!(asset.net_book_value, json!(22_000_000));

        let mut missing_name = valid_draft();
        missing_name.name.clear();
        assert!(
            missing_name
                .build(None, 0)
                .unwrap_err()
                .contains("tên tài sản")
        );
    }

    #[test]
    fn asset_edit_keeps_identity_and_unknown_legacy_fields() {
        let existing: AssetItem = serde_json::from_value(json!({
            "key":"legacy-asset-9",
            "code":"TS-009",
            "name":"Máy chủ",
            "category":"Máy chủ & Hạ tầng IDC",
            "originalPrice":90000000,
            "depreciationMonths":60,
            "accumulatedDepreciation":1000000,
            "netBookValue":89000000,
            "status":"Đang sử dụng",
            "legacyAttachment":{"key":"file-1"}
        }))
        .expect("legacy asset");
        let mut draft = AssetDraft::from_asset(&existing);
        draft.name = "Máy chủ mới".to_owned();

        let edited = draft.build(Some(&existing), 1).expect("edited asset");
        assert_eq!(edited.key, "legacy-asset-9");
        assert_eq!(edited.name, "Máy chủ mới");
        assert_eq!(edited.extra["legacyAttachment"]["key"], "file-1");
    }

    #[test]
    fn asset_list_uses_legacy_id_or_code_when_key_is_missing() {
        let response: AssetItemsResponse = serde_json::from_value(json!({
            "data": [
                {"key": null, "id": "legacy-id-1", "code": "TS-001", "name": "A"},
                {"code": "TS-002", "name": "B"}
            ],
            "revision": "asset-revision"
        }))
        .expect("legacy assets without normalized key");
        let mut view = AssetsView::default();
        view.accept_response(response);

        assert_eq!(view.assets[0].key, "legacy-id-1");
        assert_eq!(view.assets[1].key, "TS-002");
        assert_eq!(view.assets[0].extra["id"], "legacy-id-1");
    }

    #[test]
    fn asset_money_rejects_negative_fractional_and_oversized_values() {
        assert!(parse_money("-1", "Nguyên giá").is_err());
        assert!(parse_money("12.5", "Nguyên giá").is_err());
        assert!(parse_money("1000000000001", "Nguyên giá").is_err());
        assert_eq!(parse_money("1.200.000", "Nguyên giá"), Ok(1_200_000));
    }
}
