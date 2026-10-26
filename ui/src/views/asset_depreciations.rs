use crate::widgets;
use std::time::Duration;

use chrono::{NaiveDate, Utc};
use egui::{Color32, RichText, Ui};
use egui_extras::{Column, TableBuilder};
use web_time::Instant;

use crate::{
    api::{
        ApiClient, ApiTask, AssetDepreciation, AssetDepreciationMutationResponse,
        AssetDepreciationRunResponse, AssetDepreciationsResponse, CreateAssetDepreciation,
        OrgUnitsResponse, RunAssetDepreciation,
    },
    models::Session,
};

const PAGE_SIZE: usize = 8;
const REFRESH_INTERVAL: Duration = Duration::from_secs(30);
const ACTIVE: &str = "Đang trích khấu hao";
const PAUSED: &str = "Tạm dừng trích KH";
const COMPLETED: &str = "Đã trích hết 100%";
const DISPOSED: &str = "Đã thanh lý giảm tài sản";
const METHODS: [&str; 3] = [
    "Đường thẳng (Straight-Line VAS TT45)",
    "Số dư giảm dần có điều chỉnh",
    "Theo sản lượng / Công suất",
];
const COST_ACCOUNTS: [&str; 4] = [
    "Nợ 6421 (CP Quản lý CNTT)",
    "Nợ 6422 (CP Vật liệu & CCDC Văn phòng)",
    "Nợ 641 (CP Bán Hàng)",
    "Nợ 627 (CP Sản xuất chung)",
];
const ASSET_ACCOUNTS: [&str; 2] = [
    "Có 2141 (Hao mòn TSCĐ hữu hình)",
    "Có 2143 (Hao mòn TSCĐ vô hình)",
];
const CATEGORIES: [&str; 6] = [
    "Máy chủ & Hạ tầng IDC",
    "Hạ tầng Mạng & An ninh",
    "Thiết bị IT & Cán bộ nhân viên",
    "Hệ thống Điện & Nguồn UPS",
    "Phần mềm & Bản quyền Vô hình",
    "Phương tiện vận tải & Xe",
];

#[derive(Default)]
struct DepreciationDraft {
    asset_code: String,
    asset_name: String,
    category: String,
    department: String,
    cost_account: String,
    asset_account: String,
    method: String,
    original_cost: String,
    residual_value: String,
    life_months: String,
    start_date: String,
    notes: String,
}

impl DepreciationDraft {
    fn new(_record_count: usize) -> Self {
        Self {
            category: CATEGORIES[0].to_owned(),
            cost_account: COST_ACCOUNTS[0].to_owned(),
            asset_account: ASSET_ACCOUNTS[0].to_owned(),
            method: METHODS[0].to_owned(),
            start_date: Utc::now().format("%Y-%m-%d").to_string(),
            ..Self::default()
        }
    }

    fn build(&self) -> Result<CreateAssetDepreciation, String> {
        for (value, label) in [
            (&self.asset_code, "Mã tài sản"),
            (&self.asset_name, "Tên tài sản cố định"),
            (&self.category, "Nhóm tài sản"),
            (&self.department, "Phòng ban sử dụng"),
        ] {
            if value.trim().is_empty() {
                return Err(format!("{label} không được để trống."));
            }
        }
        let parse_amount = |raw: &str, label: &str| -> Result<i64, String> {
            let compact = raw
                .trim()
                .chars()
                .filter(|ch| !matches!(ch, '.' | ',' | ' ' | '_'))
                .collect::<String>();
            let value = compact
                .parse::<i64>()
                .map_err(|_| format!("{label} phải là số nguyên VNĐ."))?;
            if value < 0 {
                return Err(format!("{label} không được âm."));
            }
            Ok(value)
        };
        let original_cost = parse_amount(&self.original_cost, "Nguyên giá")?;
        let residual_value = parse_amount(&self.residual_value, "Giá trị thanh lý ước tính")?;
        if original_cost == 0 || residual_value > original_cost {
            return Err(
                "Nguyên giá phải lớn hơn 0 và không nhỏ hơn giá trị thanh lý ước tính.".to_owned(),
            );
        }
        let life_months = self
            .life_months
            .trim()
            .parse::<u32>()
            .map_err(|_| "Thời gian trích phải là số tháng hợp lệ.".to_owned())?;
        if !(1..=120).contains(&life_months) {
            return Err("Thời gian trích khấu hao phải từ 1 đến 120 tháng.".to_owned());
        }
        NaiveDate::parse_from_str(self.start_date.trim(), "%Y-%m-%d")
            .map_err(|_| "Ngày bắt đầu phải có định dạng YYYY-MM-DD.".to_owned())?;
        if self.notes.chars().any(char::is_control) || self.notes.len() > 8_000 {
            return Err("Ghi chú khấu hao không hợp lệ.".to_owned());
        }
        Ok(CreateAssetDepreciation {
            asset_code: self.asset_code.trim().to_owned(),
            asset_name: self.asset_name.trim().to_owned(),
            category: self.category.trim().to_owned(),
            department: self.department.trim().to_owned(),
            cost_account: self.cost_account.clone(),
            asset_account: self.asset_account.clone(),
            depreciation_method: self.method.clone(),
            original_cost,
            residual_value,
            life_months,
            start_date: self.start_date.trim().to_owned(),
            notes: self.notes.trim().to_owned(),
        })
    }
}

pub struct AssetDepreciationsView {
    records: Vec<AssetDepreciation>,
    departments: Vec<String>,
    pending_load: Option<ApiTask<AssetDepreciationsResponse>>,
    pending_departments: Option<ApiTask<OrgUnitsResponse>>,
    pending_mutation: Option<ApiTask<AssetDepreciationMutationResponse>>,
    pending_run: Option<ApiTask<AssetDepreciationRunResponse>>,
    pending_download: Option<ApiTask<bool>>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    needs_reload: bool,
    data_loaded: bool,
    search: String,
    status_filter: String,
    method_filter: String,
    page: usize,
    page_size: usize,
    form_open: bool,
    draft: DepreciationDraft,
    detail_key: Option<String>,
    run_modal_open: bool,
    notice: String,
    error: String,
}

impl Default for AssetDepreciationsView {
    fn default() -> Self {
        Self {
            records: Vec::new(),
            departments: Vec::new(),
            pending_load: None,
            pending_departments: None,
            pending_mutation: None,
            pending_run: None,
            pending_download: None,
            loaded_for: None,
            last_loaded: None,
            needs_reload: true,
            data_loaded: false,
            search: String::new(),
            status_filter: "Tất cả trạng thái".to_owned(),
            method_filter: "Tất cả phương pháp trích".to_owned(),
            page: 0,
            page_size: PAGE_SIZE,
            form_open: false,
            draft: DepreciationDraft::default(),
            detail_key: None,
            run_modal_open: false,
            notice: String::new(),
            error: String::new(),
        }
    }
}

impl AssetDepreciationsView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn busy(&self) -> bool {
        self.pending_load.is_some()
            || self.pending_departments.is_some()
            || self.pending_mutation.is_some()
            || self.pending_run.is_some()
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        if self.busy() {
            self.needs_reload = true;
            return;
        }
        self.pending_load = Some(api.list_asset_depreciations_task(session));
        if self.departments.is_empty() {
            self.pending_departments = Some(api.list_org_units_task(session));
        }
        self.needs_reload = false;
        self.error.clear();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            *self = Self::default();
            self.loaded_for = Some(session.user.id.clone());
        }
        if self.needs_reload && !self.busy() {
            self.request_reload(session, api);
        } else if !self.busy()
            && self
                .last_loaded
                .is_none_or(|loaded| loaded.elapsed() >= REFRESH_INTERVAL)
        {
            self.request_reload(session, api);
        }

        if let Some(result) = self.pending_load.as_ref().and_then(ApiClient::poll) {
            self.pending_load = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.records = response.data;
                    normalize_keys(&mut self.records);
                    self.data_loaded = true;
                    self.error.clear();
                }
                Err(error) => {
                    self.data_loaded = false;
                    self.error = error;
                }
            }
            ctx.request_repaint();
        }
        if let Some(result) = self.pending_departments.as_ref().and_then(ApiClient::poll) {
            self.pending_departments = None;
            if let Ok(response) = result {
                self.departments = response
                    .data
                    .into_iter()
                    .map(|unit| unit.name.trim().to_owned())
                    .filter(|name| !name.is_empty())
                    .collect();
                self.departments.sort_unstable();
                self.departments.dedup();
            }
            ctx.request_repaint();
        }
        if let Some(result) = self.pending_mutation.as_ref().and_then(ApiClient::poll) {
            self.pending_mutation = None;
            match result {
                Ok(response) => {
                    let code = response.depreciation.asset_code.clone();
                    if let Some(existing) = self
                        .records
                        .iter_mut()
                        .find(|record| record.key == response.depreciation.key)
                    {
                        *existing = response.depreciation;
                        self.notice = format!("Đã cập nhật cấu hình khấu hao tài sản {code}.");
                    } else {
                        self.records.push(response.depreciation);
                        self.notice = format!("Đã thiết lập trích khấu hao: {code}.");
                    }
                    self.form_open = false;
                    self.needs_reload = true;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
            ctx.request_repaint();
        }
        if let Some(result) = self.pending_run.as_ref().and_then(ApiClient::poll) {
            self.pending_run = None;
            match result {
                Ok(response) => {
                    self.notice = format!(
                        "Đã ghi nhận kỳ {}: {} tài sản, tổng {} ₫ vào sổ khấu hao nội bộ. Sổ cái tổng hợp chưa được cập nhật.",
                        response.run.period,
                        response.run.entry_count,
                        money(response.run.total_amount),
                    );
                    self.run_modal_open = false;
                    self.needs_reload = true;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
            ctx.request_repaint();
        }
        if let Some(result) = self.pending_download.as_ref().and_then(ApiClient::poll) {
            self.pending_download = None;
            match result {
                Ok(true) => {
                    self.notice = "Đã xuất bảng khấu hao dạng CSV (mở được bằng Excel).".to_owned()
                }
                Ok(false) => {}
                Err(error) => self.error = error,
            }
            ctx.request_repaint();
        }
        if self.busy() || self.pending_download.is_some() {
            ctx.request_repaint_after(Duration::from_millis(16));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.poll(ctx, session, api);
        let is_admin = session.user.role == "ADMIN";
        let busy = self.busy();
        egui::ScrollArea::vertical()
            .auto_shrink([false; 2])
            .show(ui, |ui| {
                ui.add_space(8.0);
                let total_original = sum(self.records.iter().map(|row| row.original_cost));
let total_accumulated = sum(self.records.iter().map(|row| row.accumulated_deprec));
let recovered = if total_original <= 0 {0} else {total_accumulated.saturating_mul(100) / total_original};
widgets::metrics_grid(ui, "asset-depreciations.metrics", &[widgets::Metric { label: "Tổng nguyên giá TSCĐ theo dõi", value: if self.data_loaded { format!("{} ₫", money(sum(self.records.iter().map(|row| row.original_cost)))) } else { "—".to_owned() }, detail: &(format!("{} danh mục tài sản đang phân bổ", self.records.len())), color: Color32::from_rgb(15, 23, 42), value_size: 22.0 },
widgets::Metric { label: "Chi phí khấu hao trích mỗi tháng", value: if self.data_loaded { format!("{} ₫", money(sum(self.records.iter().filter(|row| row.status == ACTIVE).map(|row| row.monthly_deprec)))) } else { "—".to_owned() }, detail: &("Sổ khấu hao nội bộ · chưa đồng bộ sổ cái".to_owned()), color: Color32::from_rgb(180, 83, 9), value_size: 22.0 },
widgets::Metric { label: "Khấu hao lũy kế đã trích", value: if self.data_loaded { format!("{} ₫", money(total_accumulated)) } else { "—".to_owned() }, detail: &(format!("Đã thu hồi vốn {recovered}% tổng nguyên giá")), color: Color32::from_rgb(37, 99, 235), value_size: 22.0 },
widgets::Metric { label: "Giá trị còn lại (Net Book Value)", value: if self.data_loaded { format!("{} ₫", money(sum(self.records.iter().map(|row| row.net_book_value)))) } else { "—".to_owned() }, detail: &("Giá trị sổ theo dõi nội bộ".to_owned()), color: Color32::from_rgb(22, 163, 74), value_size: 22.0 }], egui::vec2(16.0, 16.0), 240.0, 4.0);
                ui.add_space(10.0);
                ui.horizontal_wrapped(|ui| {
                    { let (rect, _) = ui.allocate_exact_size(egui::vec2(340.0_f32.min(ui.available_width()), 32.0), egui::Sense::hover()); widgets::search_input(ui, rect, &mut self.search, "Tìm theo mã TS, tên tài sản, nhóm, phòng ban, TK...") };
                    widgets::combo_box("asset-depreciation-status")
                        .selected_text(&self.status_filter)
                        .show_ui(ui, |ui| {
                            for status in ["Tất cả trạng thái", ACTIVE, PAUSED, COMPLETED] {
                                ui.selectable_value(
                                    &mut self.status_filter,
                                    status.to_owned(),
                                    status,
                                );
                            }
                        });
                    widgets::combo_box("asset-depreciation-method")
                        .selected_text(method_filter_label(&self.method_filter))
                        .show_ui(ui, |ui| {
                            for (value, label) in [
                                ("Tất cả phương pháp trích", "Tất cả phương pháp trích"),
                                (METHODS[0], "Đường thẳng (VAS TT45)"),
                                (METHODS[1], "Số dư giảm dần"),
                                (METHODS[2], "Theo sản lượng"),
                            ] {
                                ui.selectable_value(
                                    &mut self.method_filter,
                                    value.to_owned(),
                                    label,
                                );
                            }
                        });
                    if ui.button("⟳ Làm mới").clicked() {
                        self.needs_reload = true;
                    }
                    if ui.button("⇩ Xuất Excel (.csv)").clicked() {
                        self.pending_download = Some(crate::file_transfer::save_download_task(
                            "bang-tinh-phan-bo-khau-hao.csv".to_owned(),
                            depreciation_csv(&self.records),
                        ));
                    }
                    if is_admin
                        && ui
                            .add_enabled(
                                !busy,
                                egui::Button::new("▶ Chạy trích khấu hao tháng này")
                                    .fill(Color32::from_rgb(180, 83, 9))
                                    .stroke(egui::Stroke::NONE),
                            )
                            .clicked()
                    {
                        self.run_modal_open = true;
                        self.error.clear();
                    }
                    if is_admin
                        && ui
                            .add_enabled(
                                !busy && self.data_loaded,
                                egui::Button::new("＋ Thiết lập trích khấu hao")
                                    .fill(Color32::from_rgb(0, 150, 136))
                                    .stroke(egui::Stroke::NONE),
                            )
                            .clicked()
                    {
                        self.draft = DepreciationDraft::new(self.records.len());
                        self.form_open = true;
                        self.error.clear();
                    }
                });
                if !self.notice.is_empty() {
                    ui.add_space(6.0);
                    ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
                }
                if !self.error.is_empty() {
                    ui.add_space(6.0);
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                }
                ui.add_space(8.0);
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new(
                            "Phương pháp lựa chọn và tài khoản được lưu theo hồ sơ; công thức hiện hành giữ cách làm tròn tháng của legacy. Sổ cái tổng hợp chưa được cập nhật.",
                        )
                        .small()
                        .color(Color32::from_rgb(100, 116, 139)),
                    );
                });
                if !self.data_loaded && busy {
                    ui.add_space(8.0);
                    ui.horizontal(|ui| {
                        ui.spinner();
                        ui.label("Đang tải danh mục khấu hao tài sản…");
                    });
                } else if !self.data_loaded && self.error.is_empty() {
                    ui.label("Chưa tải được dữ liệu khấu hao.");
                }
                self.render_table(ui, session, api, is_admin, busy);
            });
        self.render_form(ctx, session, api, busy);
        self.render_detail(ctx, session, api, busy, is_admin);
        self.render_run_modal(ctx, session, api, busy, is_admin);
    }

    fn render_table(
        &mut self,
        ui: &mut Ui,
        session: &Session,
        api: &ApiClient,
        is_admin: bool,
        busy: bool,
    ) {
        let query = self.search.trim().to_lowercase();
        let filtered = self
            .records
            .iter()
            .filter(|record| {
                let matches_search = query.is_empty()
                    || [
                        record.asset_code.as_str(),
                        record.asset_name.as_str(),
                        record.category.as_str(),
                        record.department.as_str(),
                        record.cost_account.as_str(),
                    ]
                    .iter()
                    .any(|value| value.to_lowercase().contains(&query));
                let matches_status = self.status_filter == "Tất cả trạng thái"
                    || record.status == self.status_filter;
                let matches_method = self.method_filter == "Tất cả phương pháp trích"
                    || record.depreciation_method == self.method_filter;
                matches_search && matches_status && matches_method
            })
            .cloned()
            .collect::<Vec<_>>();
        let pages = filtered.len().div_ceil(self.page_size).max(1);
        self.page = self.page.min(pages - 1);
        let start = self.page * self.page_size;
        let end = (start + self.page_size).min(filtered.len());

        widgets::table_with_row_height(
            ui,
            "asset-depreciations.table",
            &[
                widgets::TableColumn {
                    title: "Mã tài sản & Định khoản",
                    width: 175.0,
                },
                widgets::TableColumn {
                    title: "Tên tài sản & Phòng ban",
                    width: 280.0,
                },
                widgets::TableColumn {
                    title: "Nguyên giá & Trích tháng",
                    width: 185.0,
                },
                widgets::TableColumn {
                    title: "Tiến độ trích (Đã trích ➔ Còn lại)",
                    width: 240.0,
                },
                widgets::TableColumn {
                    title: "Kỳ trích gần nhất",
                    width: 140.0,
                },
                widgets::TableColumn {
                    title: "Trạng thái",
                    width: 175.0,
                },
                widgets::TableColumn {
                    title: "Thao tác",
                    width: 155.0,
                },
            ],
            end.saturating_sub(start),
            82.0,
            |ui, row, column| {
                let record = &filtered[start + row];
                match column {
                    0 => {
                        ui.label(
                            RichText::new(format!("▣  {}", record.asset_code))
                                .strong()
                                .color(Color32::from_rgb(0, 150, 136)),
                        );
                        ui.label(
                            RichText::new(&record.cost_account)
                                .small()
                                .color(Color32::from_rgb(8, 145, 178)),
                        );
                    }
                    1 => {
                        ui.label(
                            RichText::new(&record.asset_name)
                                .size(13.5)
                                .strong()
                                .color(Color32::from_rgb(15, 23, 42)),
                        );
                        ui.label(
                            RichText::new(format!(
                                "Nhóm: {} · Đơn vị: {}",
                                record.category, record.department
                            ))
                            .small()
                            .color(Color32::from_rgb(100, 116, 139)),
                        );
                        ui.label(
                            RichText::new(format!(
                                "Phương pháp: {} ({} tháng)",
                                record.depreciation_method, record.life_months
                            ))
                            .small()
                            .color(Color32::from_rgb(180, 83, 9)),
                        );
                    }
                    2 => {
                        ui.label(format!("Nguyên giá: {} ₫", money(record.original_cost)));
                        ui.label(
                            RichText::new(format!(
                                "Trích/tháng: {} ₫",
                                money(record.monthly_deprec)
                            ))
                            .strong()
                            .color(Color32::from_rgb(180, 83, 9)),
                        );
                    }
                    3 => {
                        let pct = percentage(record.accumulated_deprec, record.original_cost);
                        ui.label(format!(
                            "Đã trích ({pct}%): {}/{}T",
                            record.depreciated_months, record.life_months
                        ));
                        ui.label(
                            RichText::new(format!("Còn lại: {} ₫", money(record.net_book_value)))
                                .strong()
                                .color(Color32::from_rgb(22, 163, 74)),
                        );
                        ui.add(egui::ProgressBar::new(pct as f32 / 100.0).show_percentage());
                    }
                    4 => {
                        ui.label(&record.last_run_date);
                    }
                    5 => {
                        if is_unverified_legacy_import(record) {
                            ui.colored_label(
                                Color32::from_rgb(185, 28, 28),
                                "Legacy · chưa xác minh",
                            );
                        }
                        ui.label(status_text(&record.status));
                    }
                    6 => {
                        ui.horizontal_wrapped(|ui| {
                            if ui.button("Kế hoạch").clicked() {
                                self.detail_key = Some(record.key.clone());
                            }
                            if is_admin && ![COMPLETED, DISPOSED].contains(&record.status.as_str())
                            {
                                let text = if record.status == ACTIVE {
                                    "Ⅱ"
                                } else {
                                    "▶"
                                };
                                if ui
                                    .add_enabled(
                                        !busy,
                                        egui::Button::new(text).sense(egui::Sense::click()),
                                    )
                                    .on_hover_text(if record.status == ACTIVE {
                                        "Tạm dừng trích khấu hao"
                                    } else {
                                        "Tiếp tục trích khấu hao"
                                    })
                                    .clicked()
                                {
                                    self.pending_mutation =
                                        Some(api.toggle_asset_depreciation_status_task(
                                            session,
                                            &record.key,
                                        ));
                                }
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
            "asset-depreciations.pagination",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );
    }

    fn render_form(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient, busy: bool) {
        if !self.form_open {
            return;
        }
        let mut open = self.form_open;
        let (_, closed) = widgets::modal(
            ctx,
            "asset-depreciations-0",
            "Thiết Lập Khấu Hao Tài Sản Cố Định (Chuẩn VAS TT45)",
            760.0,
            busy,
            |ui| {
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    ui.add_space(8.0);
                }

                ui.label("Nhập thông tin cấu hình trích khấu hao tài sản cố định.");
                ui.add_space(8.0);
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        3
                    },
                    |columns| {
                        let column_count = columns.len();
                        edit(
                            &mut columns[0 % column_count],
                            "Mã tài sản",
                            &mut self.draft.asset_code,
                            "Ví dụ: TS-SRV-003",
                        );
                        select(
                            &mut columns[1 % column_count],
                            "Nhóm tài sản",
                            &mut self.draft.category,
                            &CATEGORIES,
                        );
                        edit(
                            &mut columns[2 % column_count],
                            "Phòng ban sử dụng",
                            &mut self.draft.department,
                            "Chọn hoặc nhập phòng ban...",
                        );
                    },
                );
                if !self.departments.is_empty() {
                    ui.horizontal_wrapped(|ui| {
                        ui.label("Đơn vị đã có:");
                        widgets::combo_box("asset_depreciation_department_options")
                            .selected_text("Chọn phòng ban")
                            .show_ui(ui, |ui| {
                                for department in &self.departments {
                                    if ui
                                        .selectable_label(
                                            self.draft.department == *department,
                                            department,
                                        )
                                        .clicked()
                                    {
                                        self.draft.department = department.clone();
                                    }
                                }
                            });
                    });
                }
                edit(
                    ui,
                    "Tên tài sản cố định",
                    &mut self.draft.asset_name,
                    "Ví dụ: Cụm Tường Lửa FortiGate 200F High Availability",
                );
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        3
                    },
                    |columns| {
                        let column_count = columns.len();
                        select(
                            &mut columns[0 % column_count],
                            "Phương pháp trích khấu hao",
                            &mut self.draft.method,
                            &METHODS,
                        );
                        select(
                            &mut columns[1 % column_count],
                            "Tài khoản Nợ (Chi phí)",
                            &mut self.draft.cost_account,
                            &COST_ACCOUNTS,
                        );
                        select(
                            &mut columns[2 % column_count],
                            "Tài khoản Có (Hao mòn)",
                            &mut self.draft.asset_account,
                            &ASSET_ACCOUNTS,
                        );
                    },
                );
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        3
                    },
                    |columns| {
                        let column_count = columns.len();
                        edit(
                            &mut columns[0 % column_count],
                            "Nguyên giá tài sản (VNĐ)",
                            &mut self.draft.original_cost,
                            "Ví dụ: 360000000",
                        );
                        edit(
                            &mut columns[1 % column_count],
                            "Giá trị thanh lý ước tính (VNĐ)",
                            &mut self.draft.residual_value,
                            "Ví dụ: 10000000",
                        );
                        edit(
                            &mut columns[2 % column_count],
                            "Thời gian trích (Tháng)",
                            &mut self.draft.life_months,
                            "Ví dụ: 36",
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
                        edit(
                            &mut columns[0 % column_count],
                            "Ngày bắt đầu trích khấu hao",
                            &mut self.draft.start_date,
                            "YYYY-MM-DD",
                        );
                        edit(
                            &mut columns[1 % column_count],
                            "Ghi chú hạch toán kế toán",
                            &mut self.draft.notes,
                            "Ví dụ: Phê duyệt theo Quyết định đầu tư số 88/QĐ-HĐQT...",
                        );
                    },
                );
                ui.add_space(8.0);
                ui.horizontal(|ui| {
                    if ui.button("Hủy bỏ").clicked() {
                        self.form_open = false;
                    }
                    if ui
                        .add_enabled(
                            !busy,
                            egui::Button::new("Lưu cấu hình khấu hao")
                                .fill(Color32::from_rgb(0, 150, 136)),
                        )
                        .clicked()
                    {
                        match self.draft.build() {
                            Ok(input) => {
                                self.pending_mutation =
                                    Some(api.create_asset_depreciation_task(session, &input));
                            }
                            Err(error) => self.error = error,
                        }
                    }
                });
            },
        );
        open &= !closed;
        self.form_open = open && self.form_open;
    }

    fn render_detail(
        &mut self,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        busy: bool,
        is_admin: bool,
    ) {
        let Some(record) = self
            .detail_key
            .as_ref()
            .and_then(|key| self.records.iter().find(|item| &item.key == key))
            .cloned()
        else {
            return;
        };
        let mut open = true;
        let (_, closed) = widgets::drawer(
            ctx,
            "asset-depreciations-1",
            "Bảng Kế Hoạch Phân Bổ Khấu Hao Chi Tiết Từng Tháng",
            650.0,
            |ui| {
                egui::ScrollArea::vertical().show(ui, |ui| {
                    egui::Frame::group(ui.style()).show(ui, |ui| {
                        ui.label(
                            RichText::new(&record.asset_code)
                                .strong()
                                .color(Color32::from_rgb(0, 150, 136)),
                        );
                        ui.heading(&record.asset_name);
                        ui.label(format!(
                            "Đơn vị: {} · Phương pháp: {} · Trạng thái: {}",
                            record.department, record.depreciation_method, record.status
                        ));
                        if is_unverified_legacy_import(&record) {
                            ui.colored_label(
                                Color32::from_rgb(185, 28, 28),
                                RichText::new("HỒ SƠ LEGACY CHƯA XÁC MINH").strong(),
                            );
                            ui.label("Lịch sử, trạng thái và thông tin người tạo là dữ liệu nguồn chưa được Rust xác minh; không được coi là bút toán sổ cái.");
                        }
                    });
                    ui.columns(if ui.ctx().screen_rect().width() <= 992.0 { 1 } else { 3 }, |columns| {
 let column_count = columns.len();
                        detail_metric(
                            &mut columns[0 % column_count],
                            "NGUYÊN GIÁ",
                            record.original_cost,
                            Color32::from_rgb(15, 23, 42),
                        );
                        detail_metric(
                            &mut columns[1 % column_count],
                            "TRÍCH / THÁNG",
                            record.monthly_deprec,
                            Color32::from_rgb(180, 83, 9),
                        );
                        detail_metric(
                            &mut columns[2 % column_count],
                            "GIÁ TRỊ CÒN LẠI",
                            record.net_book_value,
                            Color32::from_rgb(22, 163, 74),
                        );
                    });
                    egui::Frame::group(ui.style()).show(ui, |ui| {
                        ui.label(
                            RichText::new(
                                "Định khoản lưu trên cấu hình (chưa ghi vào sổ cái tổng hợp):",
                            )
                            .strong(),
                        );
                        ui.label(format!(
                            "{} / {}",
                            record.cost_account, record.asset_account
                        ));
                        ui.label(format!(
                            "Thời gian phân bổ: {} đến {} ({} tháng)",
                            record.start_date, record.end_date, record.life_months
                        ));
                    });
                    let posted = record.schedule_list.iter().filter(|row| row.posted).count();
                    ui.heading(format!(
                        "Lịch trình phân bổ {} tháng ({posted} tháng đã ghi nhận):",
                        record.life_months
                    ));
                    egui::ScrollArea::both().max_height(320.0).show(ui, |ui| {
                        TableBuilder::new(ui)
                            .id_salt("asset_depreciation_schedule_rows")
                            .striped(true)
                            .column(Column::exact(110.0))
                            .column(Column::exact(150.0))
                            .column(Column::exact(150.0))
                            .column(Column::exact(150.0))
                            .column(Column::exact(120.0))
                            .header(34.0, |mut header| {
                                for title in [
                                    "Kỳ (Tháng/Năm)",
                                    "Mức trích kỳ này",
                                    "Lũy kế đã trích",
                                    "Giá trị còn lại",
                                    "Trạng thái",
                                ] {
                                    header.col(|ui| {
                                        ui.label(RichText::new(title).strong().small());
                                    });
                                }
                            })
                            .body(|mut body| {
                                for schedule in &record.schedule_list {
                                    body.row(34.0, |mut row| {
                                        row.col(|ui| {
                                            ui.label(format!(
                                                "{} (T{})",
                                                schedule.period, schedule.month_number
                                            ));
                                        });
                                        row.col(|ui| {
                                            ui.label(format!(
                                                "{} ₫",
                                                money(schedule.monthly_amount)
                                            ));
                                        });
                                        row.col(|ui| {
                                            ui.label(format!(
                                                "{} ₫",
                                                money(schedule.accumulated_amount)
                                            ));
                                        });
                                        row.col(|ui| {
                                            ui.label(format!(
                                                "{} ₫",
                                                money(schedule.remaining_amount)
                                            ));
                                        });
                                        row.col(|ui| {
                                            ui.label(if schedule.posted {
                                                "Đã ghi nhận"
                                            } else {
                                                "Dự kiến"
                                            });
                                        });
                                    });
                                }
                            });
                    });
                    ui.horizontal(|ui| {
                        if ui.button("⇩ Xuất lịch khấu hao CSV").clicked() {
                            self.pending_download = Some(crate::file_transfer::save_download_task(
                                format!("lich-khau-hao-{}.csv", safe_filename(&record.asset_code)),
                                schedule_csv(&record),
                            ));
                        }
                        if is_admin && ![COMPLETED, DISPOSED].contains(&record.status.as_str()) {
                            let label = if record.status == ACTIVE {
                                "Tạm dừng trích KH"
                            } else {
                                "Kích hoạt trích KH"
                            };
                            if ui.add_enabled(!busy, egui::Button::new(label)).clicked() {
                                self.pending_mutation = Some(
                                    api.toggle_asset_depreciation_status_task(session, &record.key),
                                );
                            }
                        }
                    });
                });
            },
        );
        open &= !closed;
        if !open {
            self.detail_key = None;
        }
    }

    fn render_run_modal(
        &mut self,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        busy: bool,
        is_admin: bool,
    ) {
        if !self.run_modal_open || !is_admin {
            return;
        }
        let period = Utc::now().format("%Y-%m").to_string();
        let (eligible_count, estimated_total) = run_estimate(&self.records);
        let mut open = self.run_modal_open;
        let (_, closed) = widgets::modal(
            ctx,
            "asset-depreciations-2",
            "Chạy Trích Khấu Hao Vào Sổ Theo Dõi Nội Bộ",
            520.0,
            busy,
            |ui| {
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    ui.add_space(8.0);
                }

                ui.label(
                    RichText::new(format!("Xác nhận chạy trích khấu hao: Kỳ {period}")).strong(),
                );
                ui.label(format!(
                    "Số tài sản đủ điều kiện: {eligible_count}. Tổng ước tính kỳ này: {} ₫.",
                    money(estimated_total)
                ));
                ui.add_space(8.0);
                egui::Frame::group(ui.style()).show(ui, |ui| {
                    ui.label(RichText::new("Phân bổ theo cấu hình tài khoản đang lưu").strong());
                    let mut allocations = std::collections::BTreeMap::<String, i64>::new();
                    for record in &self.records {
                        if record.status == ACTIVE && record.depreciated_months < record.life_months
                        {
                            let amount = record.monthly_deprec.min(
                                record
                                    .original_cost
                                    .saturating_sub(record.accumulated_deprec)
                                    .max(0),
                            );
                            if amount > 0 {
                                let total =
                                    allocations.entry(record.cost_account.clone()).or_default();
                                *total = total.saturating_add(amount);
                            }
                        }
                    }
                    if allocations.is_empty() {
                        ui.label("Chưa có tài sản đang trích khấu hao đủ điều kiện.");
                    } else {
                        for (account, amount) in allocations {
                            ui.horizontal(|ui| {
                                ui.label(account);
                                widgets::action_row(ui, |ui| {
                                    ui.label(
                                        RichText::new(format!("{} ₫", money(amount)))
                                            .strong()
                                            .color(Color32::from_rgb(180, 83, 9)),
                                    );
                                });
                            });
                        }
                        ui.separator();
                        ui.horizontal(|ui| {
                            ui.label(RichText::new("TỔNG CỘNG GHI NHẬN KỲ NÀY:").strong());
                            widgets::action_row(ui, |ui| {
                                ui.label(
                                    RichText::new(format!("{} ₫", money(estimated_total)))
                                        .strong()
                                        .color(Color32::from_rgb(22, 163, 74)),
                                );
                            });
                        });
                    }
                });
                ui.add_space(8.0);
                ui.label(RichText::new("Thao tác này được lưu giao dịch không thể chạy lặp cho cùng kỳ. Đây là sổ khấu hao nội bộ; chưa cập nhật sổ cái tổng hợp.").small().color(Color32::from_rgb(100, 116, 139)));
                ui.horizontal(|ui| {
                    if ui.button("Hủy").clicked() {
                        self.run_modal_open = false;
                    }
                    if ui
                        .add_enabled(
                            !busy && eligible_count > 0,
                            egui::Button::new("✓ Chấp nhận trích & Ghi sổ")
                                .fill(Color32::from_rgb(0, 150, 136)),
                        )
                        .clicked()
                    {
                        self.pending_run = Some(api.run_asset_depreciation_monthly_task(
                            session,
                            &RunAssetDepreciation {
                                period: period.clone(),
                            },
                        ));
                    }
                });
            },
        );
        open &= !closed;
        self.run_modal_open = open && self.run_modal_open;
    }
}

fn edit(ui: &mut Ui, label: &str, value: &mut String, hint: &str) {
    if label.starts_with("Ngày") {
        widgets::form_date(ui, label, label, true, value);
    } else {
        widgets::form_input(ui, label, label, false, value, hint, false);
    }
}

fn select(ui: &mut Ui, label: &str, value: &mut String, options: &[&str]) {
    widgets::form_select(ui, label, label, true, value, options);
}

fn detail_metric(ui: &mut Ui, label: &str, value: i64, color: Color32) {
    egui::Frame::group(ui.style()).show(ui, |ui| {
        ui.label(
            RichText::new(label)
                .small()
                .color(Color32::from_rgb(100, 116, 139)),
        );
        ui.label(
            RichText::new(format!("{} ₫", money(value)))
                .strong()
                .color(color),
        );
    });
}

fn method_filter_label(filter: &str) -> &str {
    if filter == METHODS[0] {
        "Đường thẳng (VAS TT45)"
    } else if filter == METHODS[1] {
        "Số dư giảm dần"
    } else if filter == METHODS[2] {
        "Theo sản lượng"
    } else {
        filter
    }
}

fn status_text(status: &str) -> RichText {
    let color = if status == PAUSED {
        Color32::from_rgb(180, 83, 9)
    } else if status == COMPLETED || status == DISPOSED {
        Color32::from_rgb(100, 116, 139)
    } else {
        Color32::from_rgb(22, 163, 74)
    };
    RichText::new(status).strong().color(color)
}

fn is_unverified_legacy_import(record: &AssetDepreciation) -> bool {
    let Some(marker) = record
        .extra
        .get("_kiyoLegacyImport")
        .and_then(serde_json::Value::as_object)
    else {
        return false;
    };
    marker.get("format").and_then(serde_json::Value::as_str)
        == Some("kiyovn-legacy-asset-depreciations")
        && marker
            .get("verification")
            .and_then(serde_json::Value::as_str)
            == Some("unverified")
}

fn normalize_keys(records: &mut [AssetDepreciation]) {
    for record in records {
        if record.key.trim().is_empty() {
            record.key = record
                .extra
                .get("id")
                .and_then(serde_json::Value::as_str)
                .or_else(|| record.extra.get("key").and_then(serde_json::Value::as_str))
                .unwrap_or_default()
                .to_owned();
        }
    }
}

fn sum(values: impl Iterator<Item = i64>) -> i64 {
    values.fold(0_i64, i64::saturating_add)
}

fn percentage(part: i64, total: i64) -> u32 {
    if total <= 0 {
        0
    } else {
        part.saturating_mul(100)
            .checked_div(total)
            .unwrap_or(0)
            .clamp(0, 100) as u32
    }
}

fn run_estimate(records: &[AssetDepreciation]) -> (usize, i64) {
    records
        .iter()
        .filter(|record| {
            !is_unverified_legacy_import(record)
                && record.status == ACTIVE
                && record.depreciated_months >= 0
                && record.depreciated_months < record.life_months
                && record.life_months <= 1_200
                && record.original_cost > 0
                && record.accumulated_deprec >= 0
                && record.accumulated_deprec <= record.original_cost
                && record.monthly_deprec >= 0
                && NaiveDate::parse_from_str(&record.start_date, "%Y-%m-%d").is_ok()
        })
        .fold((0_usize, 0_i64), |(count, total), record| {
            let amount = record.monthly_deprec.min(
                record
                    .original_cost
                    .saturating_sub(record.accumulated_deprec),
            );
            (count + 1, total.saturating_add(amount))
        })
}

fn money(value: i64) -> String {
    let digits = value.unsigned_abs().to_string();
    let mut result = String::with_capacity(digits.len() + digits.len() / 3);
    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index).is_multiple_of(3) {
            result.push('.');
        }
        result.push(digit);
    }
    if value < 0 {
        format!("-{result}")
    } else {
        result
    }
}

fn csv_escape(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn depreciation_csv(records: &[AssetDepreciation]) -> Vec<u8> {
    let mut csv = String::from(
        "\u{feff}Mã tài sản,Tên tài sản,Nhóm,Phòng ban,Phương pháp,Tài khoản Nợ,Tài khoản Có,Nguyên giá,Giá trị thanh lý ước tính,Thời gian (tháng),Đã trích (tháng),Trích/tháng,Trích/năm,Khấu hao lũy kế,Giá trị còn lại,Ngày bắt đầu,Ngày kết thúc,Kỳ gần nhất,Trạng thái,Ghi chú\r\n",
    );
    for record in records {
        let fields = [
            record.asset_code.clone(),
            record.asset_name.clone(),
            record.category.clone(),
            record.department.clone(),
            record.depreciation_method.clone(),
            record.cost_account.clone(),
            record.asset_account.clone(),
            record.original_cost.to_string(),
            record.residual_value.to_string(),
            record.life_months.to_string(),
            record.depreciated_months.to_string(),
            record.monthly_deprec.to_string(),
            record.yearly_deprec.to_string(),
            record.accumulated_deprec.to_string(),
            record.net_book_value.to_string(),
            record.start_date.clone(),
            record.end_date.clone(),
            record.last_run_date.clone(),
            record.status.clone(),
            record.notes.clone(),
        ];
        csv.push_str(
            &fields
                .iter()
                .map(|field| csv_escape(field))
                .collect::<Vec<_>>()
                .join(","),
        );
        csv.push_str("\r\n");
    }
    csv.into_bytes()
}

fn schedule_csv(record: &AssetDepreciation) -> Vec<u8> {
    let mut csv = String::from(
        "\u{feff}Mã tài sản,Tên tài sản,Kỳ (Tháng/Năm),Tháng thứ,Mức trích kỳ này,Lũy kế đã trích,Giá trị còn lại,Trạng thái\r\n",
    );
    for row in &record.schedule_list {
        let fields = [
            record.asset_code.clone(),
            record.asset_name.clone(),
            row.period.clone(),
            row.month_number.to_string(),
            row.monthly_amount.to_string(),
            row.accumulated_amount.to_string(),
            row.remaining_amount.to_string(),
            if row.posted {
                "Đã ghi nhận".to_owned()
            } else {
                "Dự kiến".to_owned()
            },
        ];
        csv.push_str(
            &fields
                .iter()
                .map(|field| csv_escape(field))
                .collect::<Vec<_>>()
                .join(","),
        );
        csv.push_str("\r\n");
    }
    csv.into_bytes()
}

fn safe_filename(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch
            } else {
                '-'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample() -> AssetDepreciation {
        serde_json::from_value(json!({
            "key":"deprec-1", "assetCode":"TS-01", "assetName":"Máy chủ",
            "costAccount":"Nợ 6421 (CP Quản lý CNTT)",
            "assetAccount":"Có 2141 (Hao mòn TSCĐ hữu hình)",
            "depreciationMethod":"Đường thẳng (Straight-Line VAS TT45)",
            "category":"Máy chủ & Hạ tầng IDC", "department":"Trung tâm dữ liệu",
            "originalCost":100, "residualValue":10, "lifeMonths":3,
            "depreciatedMonths":1, "monthlyDeprec":33, "yearlyDeprec":396,
            "accumulatedDeprec":33, "netBookValue":67,
            "startDate":"2026-01-01", "endDate":"2026-04-01", "lastRunDate":"2026-01-31",
            "status":ACTIVE, "scheduleList":[{"period":"01/2026","monthNumber":1,"monthlyAmount":33,"accumulatedAmount":33,"remainingAmount":67,"posted":true}],
            "legacyExtra":{"preserve":true}
        })).expect("sample depreciation")
    }

    #[test]
    fn draft_defaults_match_legacy_and_build_preserves_account_values() {
        let mut draft = DepreciationDraft::new(2);
        assert!(draft.asset_code.is_empty() && draft.original_cost.is_empty());
        assert!(draft.build().is_err());
        draft.asset_code = "TS-TEST".into();
        draft.department = "Phòng kiểm thử".into();
        draft.original_cost = "360000000".into();
        draft.residual_value = "10000000".into();
        draft.life_months = "36".into();
        draft.asset_name = "Máy chủ kiểm thử".to_owned();
        let input = draft.build().expect("valid form");
        assert_eq!(input.cost_account, COST_ACCOUNTS[0]);
        assert_eq!(input.depreciation_method, METHODS[0]);
        assert_eq!(input.original_cost, 360_000_000);
        draft.life_months = "0".to_owned();
        assert!(draft.build().is_err());
        draft.life_months = "121".to_owned();
        assert!(draft.build().is_err());
    }

    #[test]
    fn monthly_preview_respects_active_state_and_remaining_book_value() {
        let mut active = sample();
        active.monthly_deprec = 50;
        let mut paused = sample();
        paused.status = PAUSED.to_owned();
        let mut imported = sample();
        imported.extra.insert(
            "_kiyoLegacyImport".to_owned(),
            serde_json::json!({
                "format":"kiyovn-legacy-asset-depreciations",
                "verification":"unverified"
            }),
        );
        let (count, amount) = run_estimate(&[active, paused, imported]);
        assert_eq!(count, 1);
        assert_eq!(amount, 50);
        assert_eq!(percentage(33, 100), 33);
    }

    #[test]
    fn legacy_import_marker_is_detected_for_warning_badges() {
        let mut imported = sample();
        imported.extra.insert(
            "_kiyoLegacyImport".to_owned(),
            serde_json::json!({
                "format":"kiyovn-legacy-asset-depreciations",
                "verification":"unverified"
            }),
        );
        assert!(is_unverified_legacy_import(&imported));
        assert!(!is_unverified_legacy_import(&sample()));
    }

    #[test]
    fn exported_csv_quotes_values_and_includes_schedule_rows() {
        let record = sample();
        let csv =
            String::from_utf8(depreciation_csv(std::slice::from_ref(&record))).expect("csv utf8");
        assert!(csv.starts_with('\u{feff}'));
        assert!(csv.contains("\"TS-01\""));
        assert!(csv.contains("\"Nợ 6421 (CP Quản lý CNTT)\""));
        let schedule = String::from_utf8(schedule_csv(&record)).expect("schedule utf8");
        assert!(schedule.contains("\"01/2026\""));
    }
}
