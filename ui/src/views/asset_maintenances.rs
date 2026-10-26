use crate::widgets;
use std::time::Duration;

use chrono::{Duration as ChronoDuration, NaiveDate, Utc};
use egui::{Color32, RichText, Ui};
use web_time::Instant;

use crate::{
    api::{
        ApiClient, ApiTask, AssetMaintenance, AssetMaintenanceChecklistItem,
        AssetMaintenanceMutationResponse, AssetMaintenancesResponse, CreateAssetMaintenance,
        PerformAssetMaintenance,
    },
    models::Session,
};

const PAGE_SIZE: usize = 8;
const REFRESH_INTERVAL: Duration = Duration::from_secs(30);
const FREQUENCIES: [(&str, &str); 4] = [
    ("Hàng tháng", "Hàng tháng (30 ngày)"),
    ("Hàng quý (3 tháng)", "Hàng quý (90 ngày)"),
    ("Định kỳ 6 tháng", "Định kỳ 6 tháng (180 ngày)"),
    ("Hàng năm", "Hàng năm (365 ngày)"),
];
const CATEGORIES: [&str; 5] = [
    "Máy chủ & Hạ tầng IDC",
    "Hạ tầng Mạng & Bảo mật",
    "Hệ thống Cơ Điện & Làm Mát",
    "Hệ thống Điện & Nguồn UPS",
    "Thiết bị IT & Cán bộ nhân viên",
];
const MAINTENANCE_TYPES: [&str; 3] = [
    "Phòng ngừa định kỳ (PM)",
    "Kiểm định an toàn PCCC & Điện",
    "Nâng cấp bảo trì Firmware / Patch OS",
];
const SLA_LEVELS: [&str; 3] = ["SLA Platinum (4h)", "SLA Gold (8h)", "SLA Standard (24h)"];
const STATUSES: [&str; 6] = [
    "Tất cả",
    "Đã lập kế hoạch",
    "Sắp đến hạn (Trong 7 ngày)",
    "Quá hạn bảo dưỡng",
    "Đang tiến hành bảo dưỡng",
    "Đã hoàn thành đúng lịch",
];

#[derive(Default)]
struct MaintenanceDraft {
    maint_code: String,
    system_name: String,
    category: String,
    asset_codes: String,
    location: String,
    frequency: String,
    maintenance_type: String,
    sla_level: String,
    last_date: String,
    next_date: String,
    responsible_engineer: String,
    vendor_partner: String,
    estimated_budget: String,
    notes: String,
}

impl MaintenanceDraft {
    fn new() -> Self {
        Self {
            frequency: "Hàng quý (3 tháng)".to_owned(),
            maintenance_type: MAINTENANCE_TYPES[0].to_owned(),
            ..Self::default()
        }
    }

    fn build(&self) -> Result<CreateAssetMaintenance, String> {
        for (value, label) in [
            (&self.maint_code, "Mã kế hoạch"),
            (&self.system_name, "Tên hệ thống"),
            (&self.location, "Vị trí lắp đặt"),
            (&self.last_date, "Ngày bảo dưỡng gần nhất"),
            (&self.next_date, "Ngày bảo dưỡng tiếp theo"),
            (&self.responsible_engineer, "Kỹ sư phụ trách"),
        ] {
            if value.trim().is_empty() {
                return Err(format!("{label} không được để trống."));
            }
        }
        let budget = parse_amount(&self.estimated_budget, "Dự toán")?.unwrap_or(0);
        Ok(CreateAssetMaintenance {
            maint_code: self.maint_code.trim().to_owned(),
            system_name: self.system_name.trim().to_owned(),
            category: self.category.trim().to_owned(),
            asset_codes: self.asset_codes.trim().to_owned(),
            location: self.location.trim().to_owned(),
            frequency: self.frequency.clone(),
            maintenance_type: self.maintenance_type.clone(),
            sla_level: self.sla_level.clone(),
            last_date: self.last_date.trim().to_owned(),
            next_date: self.next_date.trim().to_owned(),
            responsible_engineer: self.responsible_engineer.trim().to_owned(),
            vendor_partner: self.vendor_partner.trim().to_owned(),
            estimated_budget: budget,
            notes: self.notes.trim().to_owned(),
        })
    }
}

#[derive(Default)]
struct PerformanceDraft {
    checklist: Vec<AssetMaintenanceChecklistItem>,
    health_score: String,
    actual_cost: String,
    notes: String,
}

impl PerformanceDraft {
    fn for_record(record: &AssetMaintenance) -> Self {
        Self {
            checklist: record.checklist.clone(),
            health_score: record
                .health_score
                .map(|score| score.to_string())
                .unwrap_or_default(),
            actual_cost: record
                .actual_cost
                .map(|cost| cost.to_string())
                .unwrap_or_default(),
            notes: String::new(),
        }
    }

    fn build(&self) -> Result<PerformAssetMaintenance, String> {
        let health_score = self
            .health_score
            .trim()
            .parse::<u8>()
            .map_err(|_| "Điểm sức khỏe phải là số từ 0 đến 100.".to_owned())?;
        if health_score > 100 {
            return Err("Điểm sức khỏe phải trong khoảng 0–100.".to_owned());
        }
        let actual_cost = parse_amount(&self.actual_cost, "Chi phí thực tế")?.unwrap_or(0);
        Ok(PerformAssetMaintenance {
            checklist: self.checklist.clone(),
            health_score,
            actual_cost,
            notes: self.notes.trim().to_owned(),
        })
    }
}

fn parse_amount(value: &str, label: &str) -> Result<Option<i64>, String> {
    let normalized = value
        .trim()
        .chars()
        .filter(|character| !matches!(character, ',' | '.' | ' '))
        .collect::<String>();
    if normalized.is_empty() {
        return Ok(None);
    }
    let amount = normalized
        .parse::<i64>()
        .map_err(|_| format!("{label} phải là số nguyên không âm."))?;
    if amount < 0 {
        return Err(format!("{label} không được âm."));
    }
    Ok(Some(amount))
}

pub struct AssetMaintenancesView {
    records: Vec<AssetMaintenance>,
    pending_load: Option<ApiTask<AssetMaintenancesResponse>>,
    pending_mutation: Option<ApiTask<AssetMaintenanceMutationResponse>>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    needs_reload: bool,
    data_loaded: bool,
    search: String,
    status_filter: String,
    frequency_filter: String,
    page: usize,
    page_size: usize,
    form_open: bool,
    draft: MaintenanceDraft,
    detail_key: Option<String>,
    perform_key: Option<String>,
    performance: PerformanceDraft,
    notice: String,
    error: String,
}

impl Default for AssetMaintenancesView {
    fn default() -> Self {
        Self {
            records: Vec::new(),
            pending_load: None,
            pending_mutation: None,
            loaded_for: None,
            last_loaded: None,
            needs_reload: true,
            data_loaded: false,
            search: String::new(),
            status_filter: "Tất cả".to_owned(),
            frequency_filter: "Tất cả".to_owned(),
            page: 0,
            page_size: PAGE_SIZE,
            form_open: false,
            draft: MaintenanceDraft::default(),
            detail_key: None,
            perform_key: None,
            performance: PerformanceDraft::default(),
            notice: String::new(),
            error: String::new(),
        }
    }
}

impl AssetMaintenancesView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn is_busy(&self) -> bool {
        self.pending_load.is_some() || self.pending_mutation.is_some()
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        if self.is_busy() {
            self.needs_reload = true;
            return;
        }
        self.pending_load = Some(api.list_asset_maintenances_task(session));
        self.needs_reload = false;
        self.error.clear();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            *self = Self::default();
            self.loaded_for = Some(session.user.id.clone());
        }
        if self.needs_reload && !self.is_busy() {
            self.request_reload(session, api);
        } else if !self.is_busy()
            && self
                .last_loaded
                .is_none_or(|last| last.elapsed() >= REFRESH_INTERVAL)
        {
            self.request_reload(session, api);
        }
        if let Some(result) = self.pending_load.as_ref().and_then(ApiClient::poll) {
            self.pending_load = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.records = response.data;
                    self.data_loaded = true;
                    self.error.clear();
                }
                Err(error) => {
                    self.data_loaded = false;
                    self.error = error;
                }
            }
        }
        if let Some(result) = self.pending_mutation.as_ref().and_then(ApiClient::poll) {
            self.pending_mutation = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    if let Some(existing) = self
                        .records
                        .iter_mut()
                        .find(|record| record.key == response.maintenance.key)
                    {
                        *existing = response.maintenance;
                    } else {
                        self.records.insert(0, response.maintenance);
                    }
                    self.notice = "Đã lưu kế hoạch và lịch sử bảo dưỡng trên máy chủ.".to_owned();
                    self.form_open = false;
                    self.draft = MaintenanceDraft::default();
                    self.perform_key = None;
                    self.performance = PerformanceDraft::default();
                    self.error.clear();
                }
                Err(error) => {
                    self.error = error;
                    self.needs_reload = true;
                }
            }
        }
        if self.is_busy() {
            ctx.request_repaint_after(Duration::from_millis(80));
        } else if let Some(last) = self.last_loaded {
            ctx.request_repaint_after(REFRESH_INTERVAL.saturating_sub(last.elapsed()));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.poll(ctx, session, api);
        let busy = self.is_busy();
        let is_admin = session.user.role == "ADMIN";

        if !self.notice.is_empty() {
            ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
        }
        ui.colored_label(
            Color32::from_rgb(71, 85, 105),
            "Kế hoạch mới không được đánh dấu hoàn thành sẵn. Trạng thái hoàn tất chỉ được ghi sau khi xác nhận checklist trên máy chủ.",
        );

        if self.data_loaded {
            let upcoming = self
                .records
                .iter()
                .filter(|record| !legacy_claims_unverified(record))
                .filter(|record| {
                    matches!(
                        effective_status(record),
                        "Sắp đến hạn (Trong 7 ngày)" | "Quá hạn bảo dưỡng"
                    )
                })
                .count();
            let completed = self
                .records
                .iter()
                .filter(|record| {
                    !legacy_claims_unverified(record)
                        && effective_status(record) == "Đã hoàn thành đúng lịch"
                })
                .count();
            let scores = self
                .records
                .iter()
                .filter(|record| !legacy_claims_unverified(record))
                .filter_map(|record| record.health_score)
                .collect::<Vec<_>>();
            let average_score = if scores.is_empty() {
                "—".to_owned()
            } else {
                format!(
                    "{}",
                    scores.iter().map(|score| u32::from(*score)).sum::<u32>() / scores.len() as u32
                )
            };
            widgets::metrics_grid(
                ui,
                "asset-maintenances.metrics",
                &[
                    widgets::Metric {
                        label: "Tổng kế hoạch",
                        value: if self.data_loaded {
                            self.records.len().to_string()
                        } else {
                            "—".to_owned()
                        },
                        detail: "Kế hoạch từ máy chủ",
                        color: Color32::from_rgb(0, 150, 136),
                        value_size: 22.0,
                    },
                    widgets::Metric {
                        label: "Sắp đến hạn / quá hạn",
                        value: if self.data_loaded {
                            upcoming.to_string()
                        } else {
                            "—".to_owned()
                        },
                        detail: "Theo lịch bảo dưỡng đã ghi nhận",
                        color: Color32::from_rgb(217, 119, 6),
                        value_size: 22.0,
                    },
                    widgets::Metric {
                        label: "Điểm sức khỏe TB",
                        value: if self.data_loaded {
                            average_score
                        } else {
                            "—".to_owned()
                        },
                        detail: "Chỉ tính số đo đã xác thực",
                        color: Color32::from_rgb(37, 99, 235),
                        value_size: 22.0,
                    },
                    widgets::Metric {
                        label: "Hoàn thành",
                        value: if self.data_loaded {
                            completed.to_string()
                        } else {
                            "—".to_owned()
                        },
                        detail: "Số lần hoàn thành có sự kiện xác thực",
                        color: Color32::from_rgb(22, 163, 74),
                        value_size: 22.0,
                    },
                ],
                egui::vec2(16.0, 16.0),
                240.0,
                4.0,
            );
        } else if busy {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải kế hoạch bảo dưỡng…");
            });
        }

        self.render_filters(ui);
        ui.horizontal_wrapped(|ui| {
            if ui
                .add_enabled(!busy, egui::Button::new("Làm mới"))
                .clicked()
            {
                self.needs_reload = true;
            }
            if ui
                .add_enabled(
                    !busy && is_admin,
                    egui::Button::new(
                        RichText::new("+ Thiết lập kế hoạch")
                            .strong()
                            .color(Color32::WHITE),
                    )
                    .fill(Color32::from_rgb(0, 150, 136)),
                )
                .clicked()
            {
                self.draft = MaintenanceDraft::new();
                self.form_open = true;
                self.notice.clear();
                self.error.clear();
            }

            ui.add_enabled(false, egui::Button::new("Xuất Excel"))
                .on_hover_text("Chưa có chức năng tạo tệp Excel cho nghiệp vụ này.");
        });
        self.render_table(ui, session, is_admin, busy);
        self.render_create_window(ctx, session, api, busy, is_admin);
        self.render_detail_window(ctx, is_admin);
        self.render_perform_window(ctx, session, api, busy, is_admin);
    }

    fn render_filters(&mut self, ui: &mut Ui) {
        ui.horizontal_wrapped(|ui| {
            ui.label("Trạng thái:");
            widgets::combo_box("asset-maintenance-status")
                .selected_text(&self.status_filter)
                .show_ui(ui, |ui| {
                    for status in STATUSES {
                        ui.selectable_value(&mut self.status_filter, status.to_owned(), status);
                    }
                });
            ui.label("Tần suất:");
            widgets::combo_box("asset-maintenance-frequency")
                .selected_text(&self.frequency_filter)
                .show_ui(ui, |ui| {
                    ui.selectable_value(&mut self.frequency_filter, "Tất cả".to_owned(), "Tất cả");
                    for (value, label) in FREQUENCIES {
                        ui.selectable_value(&mut self.frequency_filter, value.to_owned(), label);
                    }
                });
            ui.label("Tìm:");
            let response = {
                let (rect, _) = ui.allocate_exact_size(
                    egui::vec2(240.0_f32.min(ui.available_width()), 32.0),
                    egui::Sense::hover(),
                );
                widgets::search_input(ui, rect, &mut self.search, "Mã kế hoạch, hệ thống, vị trí…")
            };
            if response.changed() {
                self.page = 0;
            }
        });
    }

    fn filtered_records(&self) -> Vec<AssetMaintenance> {
        let query = self.search.trim().to_lowercase();
        self.records
            .iter()
            .filter(|record| {
                (query.is_empty()
                    || [
                        &record.maint_code,
                        &record.system_name,
                        &record.location,
                        &record.responsible_engineer,
                        &record.vendor_partner,
                        &record.asset_codes,
                    ]
                    .iter()
                    .any(|value| value.to_lowercase().contains(&query)))
                    && (self.status_filter == "Tất cả"
                        || effective_status(record) == self.status_filter)
                    && (self.frequency_filter == "Tất cả"
                        || record.frequency == self.frequency_filter)
            })
            .cloned()
            .collect()
    }

    fn render_table(&mut self, ui: &mut Ui, _session: &Session, is_admin: bool, busy: bool) {
        let filtered = self.filtered_records();
        if !self.data_loaded && !busy {
            ui.label("Chưa tải được danh sách. Hãy làm mới hoặc kiểm tra kết nối máy chủ.");
            return;
        }
        if filtered.is_empty() {
            ui.label("Chưa có kế hoạch bảo dưỡng phù hợp.");
            return;
        }
        let page_count = filtered.len().div_ceil(self.page_size).max(1);
        self.page = self.page.min(page_count.saturating_sub(1));
        let start = self.page * self.page_size;
        let page_records = filtered
            .iter()
            .skip(start)
            .take(self.page_size)
            .cloned()
            .collect::<Vec<_>>();

        ui.add_space(8.0);
        widgets::table_with_row_height(
            ui,
            "asset-maintenances.table",
            &[
                widgets::TableColumn {
                    title: "Mã kế hoạch & SLA",
                    width: 175.0,
                },
                widgets::TableColumn {
                    title: "Hệ thống hạ tầng & Vị trí",
                    width: 260.0,
                },
                widgets::TableColumn {
                    title: "Kỳ bảo dưỡng (Lần trước ➔ Kế tiếp)",
                    width: 250.0,
                },
                widgets::TableColumn {
                    title: "Điểm sức khỏe",
                    width: 135.0,
                },
                widgets::TableColumn {
                    title: "Kỹ sư & Đối tác",
                    width: 200.0,
                },
                widgets::TableColumn {
                    title: "Trạng thái",
                    width: 190.0,
                },
                widgets::TableColumn {
                    title: "Thao tác",
                    width: 170.0,
                },
            ],
            page_records.len(),
            90.0,
            |ui, row, column| {
                let record = &page_records[row];

                match column {
                    0 => {
                        ui.vertical(|ui| {
                            ui.label(RichText::new(&record.maint_code).strong());
                            ui.label(&record.sla_level);
                        });
                    }
                    1 => {
                        ui.vertical(|ui| {
                            ui.label(RichText::new(&record.system_name).strong());
                            ui.label(format!("{} · {}", record.location, record.frequency));
                            if !record.asset_codes.trim().is_empty() {
                                ui.label(format!("Tài sản: {}", record.asset_codes));
                            }
                        });
                    }
                    2 => {
                        ui.vertical(|ui| {
                            ui.label(format!("Gần nhất: {}", display_or_dash(&record.last_date)));
                            ui.label(format!("Tiếp theo: {}", display_or_dash(&record.next_date)));
                        });
                    }
                    3 => {
                        ui.label(
                            record
                                .health_score
                                .map(|value| format!("{value}/100"))
                                .unwrap_or_else(|| "Chưa ghi nhận".to_owned()),
                        );
                    }
                    4 => {
                        ui.vertical(|ui| {
                            ui.label(&record.responsible_engineer);
                            ui.label(display_or_dash(&record.vendor_partner));
                        });
                    }
                    5 => {
                        ui.label(status_text(record));
                    }
                    6 => {
                        ui.horizontal(|ui| {
                            if ui.button("Xem").clicked() {
                                self.detail_key = Some(record.key.clone());
                            }
                            if ui
                                .add_enabled(is_admin && !busy, egui::Button::new("Bảo dưỡng"))
                                .clicked()
                            {
                                self.perform_key = Some(record.key.clone());
                                self.performance = PerformanceDraft::for_record(record);
                                self.error.clear();
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
            "asset-maintenances.pagination",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );
    }

    fn render_create_window(
        &mut self,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        busy: bool,
        is_admin: bool,
    ) {
        if !self.form_open || !is_admin {
            return;
        }
        let mut open = self.form_open;
        let (_, closed) = widgets::modal(
            ctx,
            "asset-maintenances-0",
            "Thiết lập kế hoạch bảo dưỡng phòng ngừa & SLA kỹ thuật",
            760.0,
            busy,
            |ui| {
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    ui.add_space(8.0);
                }

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
                            "Mã kế hoạch",
                            &mut self.draft.maint_code,
                        );
                        combo(
                            &mut columns[1 % column_count],
                            "Tần suất",
                            &mut self.draft.frequency,
                            &FREQUENCIES,
                        );
                        combo_owned(
                            &mut columns[2 % column_count],
                            "Cấp độ SLA",
                            &mut self.draft.sla_level,
                            &SLA_LEVELS,
                        );
                    },
                );
                field(
                    ui,
                    "Tên hệ thống / thiết bị bảo dưỡng",
                    &mut self.draft.system_name,
                );
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        2
                    },
                    |columns| {
                        let column_count = columns.len();
                        combo_values(
                            &mut columns[0 % column_count],
                            "Chủng loại thiết bị",
                            &mut self.draft.category,
                            &CATEGORIES,
                        );
                        field(
                            &mut columns[1 % column_count],
                            "Mã tài sản liên kết (phân tách bằng dấu phẩy)",
                            &mut self.draft.asset_codes,
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
                            "Vị trí lắp đặt cụ thể",
                            &mut self.draft.location,
                        );
                        combo_values(
                            &mut columns[1 % column_count],
                            "Loại hình bảo dưỡng",
                            &mut self.draft.maintenance_type,
                            &MAINTENANCE_TYPES,
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
                            "Kỹ sư trưởng phụ trách",
                            &mut self.draft.responsible_engineer,
                        );
                        field(
                            &mut columns[1 % column_count],
                            "Đối tác kỹ thuật",
                            &mut self.draft.vendor_partner,
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
                        field(
                            &mut columns[0 % column_count],
                            "Ngày bảo dưỡng gần nhất (YYYY-MM-DD)",
                            &mut self.draft.last_date,
                        );
                        field(
                            &mut columns[1 % column_count],
                            "Ngày bảo dưỡng tiếp theo (YYYY-MM-DD)",
                            &mut self.draft.next_date,
                        );
                        field(
                            &mut columns[2 % column_count],
                            "Dự toán kinh phí (VNĐ)",
                            &mut self.draft.estimated_budget,
                        );
                    },
                );
                field(ui, "Ghi chú", &mut self.draft.notes);
                ui.horizontal(|ui| {
                    if ui.add_enabled(!busy, egui::Button::new("Hủy bỏ")).clicked() {
                        self.form_open = false;
                    }
                    if ui
                        .add_enabled(!busy, egui::Button::new("Lưu kế hoạch bảo dưỡng"))
                        .clicked()
                    {
                        match self.draft.build() {
                            Ok(input) => {
                                self.pending_mutation =
                                    Some(api.create_asset_maintenance_task(session, &input));
                                self.error.clear();
                            }
                            Err(error) => self.error = error,
                        }
                    }
                });
            },
        );
        open &= !closed;
        self.form_open &= open;
    }

    fn render_detail_window(&mut self, ctx: &egui::Context, is_admin: bool) {
        let Some(key) = self.detail_key.clone() else {
            return;
        };
        let Some(record) = self
            .records
            .iter()
            .find(|record| record.key == key)
            .cloned()
        else {
            self.detail_key = None;
            return;
        };
        let mut open = true;
        let (_, closed) = widgets::drawer(
            ctx,
            "asset-maintenances-1",
            "Hồ sơ kỹ thuật bảo dưỡng",
            580.0,
            |ui| {
                ui.heading(&record.system_name);
                ui.label(format!("{} · {}", record.maint_code, record.sla_level));
                ui.label(format!(
                    "Vị trí: {} · Tần suất: {}",
                    record.location, record.frequency
                ));
                ui.separator();
                if is_legacy_import(&record) {
                    let source_note = if legacy_claims_unverified(&record) {
                        "Bản ghi được nhập từ legacy. Trạng thái, người thực hiện, checklist, điểm sức khỏe và chứng chỉ trong nguồn chưa được Rust xác minh."
                    } else {
                        "Bản ghi có dữ liệu nguồn legacy chưa xác minh; lần thực hiện mới nhất có event được xác nhận bởi Rust."
                    };
                    ui.colored_label(Color32::from_rgb(180, 83, 9), source_note);
                }
                widgets::metrics_grid(
                    ui,
                    "asset-maintenance.detail.metrics",
                    &[
                        widgets::Metric {
                            label: if legacy_claims_unverified(&record) {
                                "Điểm sức khỏe · legacy chưa xác minh"
                            } else {
                                "Điểm sức khỏe"
                            },
                            value: record
                                .health_score
                                .map(|value| format!("{value}/100"))
                                .unwrap_or_else(|| "Chưa ghi nhận".to_owned()),
                            detail: "Theo lần thực hiện gần nhất",
                            color: Color32::from_rgb(22, 163, 74),
                            value_size: 22.0,
                        },
                        widgets::Metric {
                            label: "Trạng thái",
                            value: effective_status(&record).to_owned(),
                            detail: "",
                            color: status_color(effective_status(&record)),
                            value_size: 22.0,
                        },
                    ],
                    egui::vec2(16.0, 16.0),
                    240.0,
                    4.0,
                );
                ui.label(format!(
                    "{}: {}",
                    if is_legacy_import(&record) {
                        "Chứng chỉ nguồn legacy (chưa xác minh)"
                    } else {
                        "Chứng chỉ kiểm định"
                    },
                    record
                        .certificate_code
                        .as_deref()
                        .unwrap_or("Chưa có chứng từ")
                ));
                ui.label(format!(
                    "Kỹ sư phụ trách: {}",
                    display_or_dash(&record.responsible_engineer)
                ));
                ui.label(format!(
                    "Đối tác kỹ thuật: {}",
                    display_or_dash(&record.vendor_partner)
                ));
                ui.label(format!(
                    "Dự toán: {} VNĐ · Chi phí thực tế: {}",
                    record.estimated_budget,
                    record
                        .actual_cost
                        .map(|cost| format!("{cost} VNĐ"))
                        .unwrap_or_else(|| "Chưa ghi nhận".to_owned())
                ));
                ui.label(format!(
                    "Gần nhất: {} · Tiếp theo: {}",
                    display_or_dash(&record.last_date),
                    display_or_dash(&record.next_date)
                ));
                ui.separator();
                ui.heading(format!(
                    "Checklist ({}/{})",
                    record.checklist.iter().filter(|item| item.done).count(),
                    record.checklist.len()
                ));
                for item in &record.checklist {
                    ui.horizontal(|ui| {
                        ui.label(if item.done { "✓" } else { "○" });
                        ui.vertical(|ui| {
                            ui.label(&item.item);
                            if let Some(note) = item.note.as_deref().filter(|note| !note.is_empty())
                            {
                                ui.small(format!("Kết quả: {note}"));
                            }
                        });
                    });
                }
                if !record.notes.trim().is_empty() {
                    ui.separator();
                    ui.label("Ghi chú / lịch sử:");
                    ui.label(&record.notes);
                }
                if let Some(performed_at) = record.performed_at.as_deref() {
                    ui.separator();
                    let actor_label = if legacy_claims_unverified(&record) {
                        "Nguồn legacy khai báo"
                    } else {
                        "Người thực hiện"
                    };
                    ui.label(format!(
                        "Lần thực hiện gần nhất: {performed_at} · {actor_label}: {}",
                        record.performed_by_name.as_deref().unwrap_or("—")
                    ));
                }
                ui.horizontal(|ui| {
                    ui.add_enabled(false, egui::Button::new("Tải PDF"))
                        .on_hover_text("Chức năng tạo PDF chưa được triển khai.");
                    if is_admin && ui.button("Bảo dưỡng").clicked() {
                        self.perform_key = Some(record.key.clone());
                        self.performance = PerformanceDraft::for_record(&record);
                        self.error.clear();
                    }
                });
            },
        );
        open &= !closed;
        if !open {
            self.detail_key = None;
        }
    }

    fn render_perform_window(
        &mut self,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        busy: bool,
        is_admin: bool,
    ) {
        let Some(key) = self.perform_key.clone() else {
            return;
        };
        if !is_admin {
            self.perform_key = None;
            return;
        }
        let Some(record) = self
            .records
            .iter()
            .find(|record| record.key == key)
            .cloned()
        else {
            self.perform_key = None;
            return;
        };
        let mut open = true;
        let (_, closed) = widgets::modal(
            ctx,
            "asset-maintenances-2",
            "Xác nhận thực hiện bảo dưỡng",
            540.0,
            busy,
            |ui| {
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    ui.add_space(8.0);
                }

                ui.label(format!(
                    "{} · {} · {}",
                    record.system_name, record.location, record.frequency
                ));
                ui.label(
                    "Chỉ xác nhận khi công việc và các hạng mục kiểm tra đã thực sự hoàn tất.",
                );
                ui.separator();
                for item in &mut self.performance.checklist {
                    ui.checkbox(&mut item.done, &item.item);
                    ui.horizontal(|ui| {
                        ui.label("Ghi chú:");
                        let note = item.note.get_or_insert_with(String::new);
                        ui.text_edit_singleline(note);
                    });
                }
                ui.horizontal(|ui| {
                    field(
                        ui,
                        "Điểm sức khỏe (0–100)",
                        &mut self.performance.health_score,
                    );
                    field(
                        ui,
                        "Chi phí thực tế (VNĐ)",
                        &mut self.performance.actual_cost,
                    );
                });
                field(ui, "Ghi chú thực hiện", &mut self.performance.notes);
                ui.horizontal(|ui| {
                    if ui.add_enabled(!busy, egui::Button::new("Hủy")).clicked() {
                        self.perform_key = None;
                    }
                    if ui
                        .add_enabled(!busy, egui::Button::new("Xác nhận hoàn thành"))
                        .clicked()
                    {
                        match self.performance.build() {
                            Ok(input) => {
                                self.pending_mutation =
                                    Some(api.perform_asset_maintenance_task(session, &key, &input));
                                self.error.clear();
                            }
                            Err(error) => self.error = error,
                        }
                    }
                });
            },
        );
        open &= !closed;
        if !open {
            self.perform_key = None;
        }
    }
}

fn effective_status(record: &AssetMaintenance) -> &str {
    if record.status != "Đã lập kế hoạch" {
        return &record.status;
    }
    let Ok(next_date) = NaiveDate::parse_from_str(&record.next_date, "%Y-%m-%d") else {
        return &record.status;
    };
    let today = Utc::now().date_naive();
    if next_date < today {
        "Quá hạn bảo dưỡng"
    } else if next_date <= today + ChronoDuration::days(7) {
        "Sắp đến hạn (Trong 7 ngày)"
    } else {
        &record.status
    }
}

fn is_legacy_import(record: &AssetMaintenance) -> bool {
    record
        .extra
        .get("_kiyoLegacyImport")
        .and_then(|marker| marker.get("verification"))
        .and_then(serde_json::Value::as_str)
        == Some("unverified")
}

fn has_verified_latest_performance(record: &AssetMaintenance) -> bool {
    record
        .extra
        .get("latestVerifiedPerformance")
        .and_then(|event| event.get("verification"))
        .and_then(serde_json::Value::as_str)
        == Some("verified")
}

fn legacy_claims_unverified(record: &AssetMaintenance) -> bool {
    is_legacy_import(record) && !has_verified_latest_performance(record)
}

fn status_text(record: &AssetMaintenance) -> String {
    let status = effective_status(record);
    if legacy_claims_unverified(record) {
        format!("{status} · legacy chưa xác minh")
    } else {
        status.to_owned()
    }
}

fn display_or_dash(value: &str) -> &str {
    if value.trim().is_empty() {
        "—"
    } else {
        value
    }
}

fn status_color(status: &str) -> Color32 {
    match status {
        "Đã hoàn thành đúng lịch" => Color32::from_rgb(22, 163, 74),
        "Quá hạn bảo dưỡng" => Color32::from_rgb(185, 28, 28),
        "Sắp đến hạn (Trong 7 ngày)" => Color32::from_rgb(217, 119, 6),
        _ => Color32::from_rgb(37, 99, 235),
    }
}

fn field(ui: &mut Ui, label: &str, value: &mut String) {
    if label.starts_with("Ngày") {
        widgets::form_date(ui, label, label, true, value);
    } else {
        widgets::form_input(ui, label, label, false, value, "", false);
    }
}

fn combo(ui: &mut Ui, label: &str, value: &mut String, options: &[(&str, &str)]) {
    ui.vertical(|ui| {
        ui.label(label);
        widgets::combo_box(label)
            .selected_text(
                options
                    .iter()
                    .find(|(option, _)| *option == value)
                    .map(|(_, label)| *label)
                    .unwrap_or("Chọn"),
            )
            .show_ui(ui, |ui| {
                for (option, option_label) in options {
                    ui.selectable_value(value, (*option).to_owned(), *option_label);
                }
            });
    });
}

fn combo_owned(ui: &mut Ui, label: &str, value: &mut String, options: &[&str]) {
    ui.vertical(|ui| {
        ui.label(label);
        widgets::combo_box(label)
            .selected_text(value.as_str())
            .show_ui(ui, |ui| {
                for option in options {
                    ui.selectable_value(value, (*option).to_owned(), *option);
                }
            });
    });
}

fn combo_values(ui: &mut Ui, label: &str, value: &mut String, options: &[&str]) {
    ui.vertical(|ui| {
        ui.label(label);
        widgets::combo_box(label)
            .selected_text(if value.is_empty() {
                "Chọn"
            } else {
                value.as_str()
            })
            .show_ui(ui, |ui| {
                for option in options {
                    ui.selectable_value(value, (*option).to_owned(), *option);
                }
            });
    });
}

#[cfg(test)]
mod tests {
    use super::{
        MaintenanceDraft, PerformanceDraft, legacy_claims_unverified, parse_amount, status_text,
    };
    use crate::api::{AssetMaintenance, AssetMaintenanceChecklistItem};
    use serde_json::json;

    #[test]
    fn maintenance_draft_requires_user_entered_schedule_identity_and_responsible_person() {
        let mut draft = MaintenanceDraft::new();
        assert!(draft.build().is_err());
        draft.maint_code = "BD-01".to_owned();
        draft.system_name = "Máy chủ".to_owned();
        draft.location = "Hà Nội".to_owned();
        draft.last_date = "2026-10-01".to_owned();
        draft.next_date = "2027-01-01".to_owned();
        draft.responsible_engineer = "Kỹ sư".to_owned();
        let request = draft.build().expect("valid maintenance draft");
        assert_eq!(request.maint_code, "BD-01");
        assert_eq!(request.estimated_budget, 0);
        assert!(request.vendor_partner.is_empty());
    }

    #[test]
    fn performance_draft_rejects_missing_or_invalid_measurements() {
        let mut draft = PerformanceDraft::default();
        assert!(draft.build().is_err());
        draft.health_score = "101".to_owned();
        draft.actual_cost = "1000".to_owned();
        assert!(draft.build().is_err());
        draft.health_score = "90".to_owned();
        draft.actual_cost = "-1".to_owned();
        assert!(draft.build().is_err());
        draft.actual_cost = "1000".to_owned();
        draft.checklist = vec![AssetMaintenanceChecklistItem {
            item: "Kiểm tra".to_owned(),
            done: false,
            note: None,
        }];
        assert_eq!(
            draft.build().expect("valid measurements").checklist.len(),
            1
        );
    }

    #[test]
    fn money_parser_accepts_vietnamese_digit_grouping_and_rejects_negative_values() {
        assert_eq!(
            parse_amount("3.500.000", "Dự toán").unwrap(),
            Some(3_500_000)
        );
        assert!(parse_amount("-100", "Dự toán").is_err());
    }

    #[test]
    fn imported_status_claim_is_labeled_until_rust_records_a_verified_performance() {
        let imported: AssetMaintenance = serde_json::from_value(json!({
            "key":"legacy-1",
            "status":"Đã hoàn thành đúng lịch",
            "_kiyoLegacyImport":{"verification":"unverified"}
        }))
        .expect("legacy imported maintenance");
        assert!(legacy_claims_unverified(&imported));
        assert!(status_text(&imported).contains("chưa xác minh"));

        let verified: AssetMaintenance = serde_json::from_value(json!({
            "key":"legacy-1",
            "status":"Đã hoàn thành đúng lịch",
            "_kiyoLegacyImport":{"verification":"unverified"},
            "latestVerifiedPerformance":{"verification":"verified"}
        }))
        .expect("maintenance with a verified Rust event");
        assert!(!legacy_claims_unverified(&verified));
        assert!(!status_text(&verified).contains("chưa xác minh"));
    }
}
