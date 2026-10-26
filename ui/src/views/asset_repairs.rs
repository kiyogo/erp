use crate::widgets;
use std::time::Duration;

use chrono::{Duration as ChronoDuration, Utc};
use egui::{Color32, RichText, Ui};
use web_time::Instant;

use crate::{
    api::{
        ApiClient, ApiTask, AssetRepair, AssetRepairMutationResponse, AssetRepairsResponse,
        CompleteAssetRepair, CreateAssetRepair,
    },
    models::Session,
};

const PAGE_SIZE: usize = 8;
const REFRESH_INTERVAL: Duration = Duration::from_secs(30);
const SEVERITIES: [&str; 4] = ["Khẩn cấp (P1)", "Cao (P2)", "Trung bình (P3)", "Thấp (P4)"];
const REPAIR_UNITS: [&str; 3] = [
    "Trung tâm bảo hành chính hãng",
    "Nội bộ IT Cty",
    "Đơn vị dịch vụ ngoài (3rd Party)",
];
const COST_BEARING: [&str; 4] = [
    "Công ty chi trả",
    "Bảo hành miễn phí hãng",
    "Bảo hiểm chi trả",
    "Cá nhân bồi thường",
];

#[derive(Default)]
struct RepairDraft {
    repair_code: String,
    asset_code: String,
    asset_name: String,
    category: String,
    serial_no: String,
    requester: String,
    department: String,
    severity: String,
    repair_unit: String,
    vendor: String,
    vendor_contact: String,
    issue_description: String,
    root_cause: String,
    solution: String,
    replaced_parts: String,
    estimated_cost: String,
    cost_bearing: String,
    start_date: String,
    expected_end_date: String,
    warranty_after_repair: String,
    approver: String,
    notes: String,
}

impl RepairDraft {
    fn start(&mut self, current_count: usize) {
        *self = Self::default();
        let today = Utc::now().date_naive();
        self.repair_code = format!("SC-{}-{:03}", today.format("%Y"), current_count + 18);
        self.severity = "Cao (P2)".to_owned();
        self.repair_unit = REPAIR_UNITS[0].to_owned();
        self.cost_bearing = COST_BEARING[0].to_owned();
        self.start_date = today.format("%Y-%m-%d").to_string();
        self.expected_end_date = (today + ChronoDuration::days(7))
            .format("%Y-%m-%d")
            .to_string();
    }

    fn build(&self) -> Result<CreateAssetRepair, String> {
        let amount = self
            .estimated_cost
            .trim()
            .parse::<i64>()
            .map_err(|_| "Dự toán phải là số nguyên VNĐ.".to_owned())?;
        if amount < 0 {
            return Err("Dự toán không được âm.".to_owned());
        }
        for (value, label) in [
            (&self.repair_code, "Mã phiếu sửa"),
            (&self.asset_code, "Mã tài sản"),
            (&self.asset_name, "Tên tài sản"),
            (&self.serial_no, "Số serial / tag"),
            (&self.requester, "Người báo hỏng"),
            (&self.department, "Phòng ban"),
            (&self.vendor, "Đơn vị sửa chữa"),
            (&self.issue_description, "Mô tả sự cố"),
            (&self.approver, "Cán bộ duyệt chi"),
        ] {
            if value.trim().is_empty() {
                return Err(format!("{label} không được để trống."));
            }
        }
        let start = chrono::NaiveDate::parse_from_str(self.start_date.trim(), "%Y-%m-%d")
            .map_err(|_| "Ngày gửi máy không hợp lệ (YYYY-MM-DD).".to_owned())?;
        let end = chrono::NaiveDate::parse_from_str(self.expected_end_date.trim(), "%Y-%m-%d")
            .map_err(|_| "Ngày dự kiến hoàn thành không hợp lệ (YYYY-MM-DD).".to_owned())?;
        if end < start {
            return Err("Ngày dự kiến hoàn thành không được trước ngày gửi máy.".to_owned());
        }
        Ok(CreateAssetRepair {
            repair_code: self.repair_code.trim().to_owned(),
            asset_code: self.asset_code.trim().to_owned(),
            asset_name: self.asset_name.trim().to_owned(),
            category: self.category.trim().to_owned(),
            serial_no: self.serial_no.trim().to_owned(),
            requester: self.requester.trim().to_owned(),
            department: self.department.trim().to_owned(),
            severity: self.severity.clone(),
            repair_unit: self.repair_unit.clone(),
            vendor: self.vendor.trim().to_owned(),
            vendor_contact: self.vendor_contact.trim().to_owned(),
            issue_description: self.issue_description.trim().to_owned(),
            root_cause: self.root_cause.trim().to_owned(),
            solution: self.solution.trim().to_owned(),
            replaced_parts: self.replaced_parts.trim().to_owned(),
            estimated_cost: amount,
            cost_bearing: self.cost_bearing.clone(),
            start_date: self.start_date.clone(),
            expected_end_date: self.expected_end_date.clone(),
            warranty_after_repair: self.warranty_after_repair.trim().to_owned(),
            approver: self.approver.trim().to_owned(),
            notes: self.notes.trim().to_owned(),
        })
    }
}

pub struct AssetRepairsView {
    records: Vec<AssetRepair>,
    pending_load: Option<ApiTask<AssetRepairsResponse>>,
    pending_mutation: Option<ApiTask<AssetRepairMutationResponse>>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    needs_reload: bool,
    data_loaded: bool,
    search: String,
    status_filter: String,
    severity_filter: String,
    page: usize,
    page_size: usize,
    form_open: bool,
    draft: RepairDraft,
    detail_key: Option<String>,
    approve_key: Option<String>,
    complete_key: Option<String>,
    actual_cost: String,
    completion_notes: String,
    notice: String,
    error: String,
}

impl Default for AssetRepairsView {
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
            status_filter: "Tất cả trạng thái".to_owned(),
            severity_filter: "Tất cả mức độ sự cố".to_owned(),
            page: 0,
            page_size: PAGE_SIZE,
            form_open: false,
            draft: RepairDraft::default(),
            detail_key: None,
            approve_key: None,
            complete_key: None,
            actual_cost: String::new(),
            completion_notes: String::new(),
            notice: String::new(),
            error: String::new(),
        }
    }
}

impl AssetRepairsView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn busy(&self) -> bool {
        self.pending_load.is_some() || self.pending_mutation.is_some()
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        if self.busy() {
            self.needs_reload = true;
            return;
        }
        self.pending_load = Some(api.list_asset_repairs_task(session));
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
            ctx.request_repaint();
        }
        if let Some(result) = self.pending_mutation.as_ref().and_then(ApiClient::poll) {
            self.pending_mutation = None;
            match result {
                Ok(_) => {
                    self.notice = "Đã cập nhật hồ sơ sửa chữa.".to_owned();
                    self.needs_reload = true;
                }
                Err(error) => self.error = error,
            }
            ctx.request_repaint();
        }
        if self.busy() {
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
                widgets::metrics_grid(
                    ui,
                    "asset-repairs.metrics",
                    &[
                        widgets::Metric {
                            label: "Chi phí sửa chữa đã ghi nhận",
                            value: if self.data_loaded {
                                format!(
                                    "{} ₫",
                                    money(self.records.iter().map(|r| r.actual_cost).sum())
                                )
                            } else {
                                "—".to_owned()
                            },
                            detail: "Chi phí thực tế từ hồ sơ",
                            color: Color32::from_rgb(15, 23, 42),
                            value_size: 22.0,
                        },
                        widgets::Metric {
                            label: "Đang sửa chữa tại hãng",
                            value: if self.data_loaded {
                                format!(
                                    "{} thiết bị",
                                    self.records
                                        .iter()
                                        .filter(|r| [
                                            "Đang sửa chữa tại hãng",
                                            "Chờ linh kiện thay thế"
                                        ]
                                        .contains(&r.status.as_str()))
                                        .count()
                                )
                            } else {
                                "—".to_owned()
                            },
                            detail: "Đang thay thế linh kiện / bảo hành",
                            color: Color32::from_rgb(37, 99, 235),
                            value_size: 22.0,
                        },
                        widgets::Metric {
                            label: "Chờ duyệt báo giá dự toán",
                            value: if self.data_loaded {
                                format!(
                                    "{} phiếu chờ duyệt",
                                    self.records
                                        .iter()
                                        .filter(|r| r.status == "Chờ duyệt báo giá")
                                        .count()
                                )
                            } else {
                                "—".to_owned()
                            },
                            detail: "Cần lãnh đạo phê duyệt ngân sách",
                            color: Color32::from_rgb(217, 119, 6),
                            value_size: 22.0,
                        },
                        widgets::Metric {
                            label: "Tỷ lệ nghiệm thu thành công",
                            value: if self.data_loaded {
                                "—".to_owned()
                            } else {
                                "—".to_owned()
                            },
                            detail: "Chưa có dữ liệu đánh giá SLA",
                            color: Color32::from_rgb(0, 150, 136),
                            value_size: 22.0,
                        },
                    ],
                    egui::vec2(16.0, 16.0),
                    240.0,
                    4.0,
                );
                ui.add_space(8.0);
                ui.horizontal_wrapped(|ui| {
                    {
                        let (rect, _) = ui.allocate_exact_size(
                            egui::vec2(340.0_f32.min(ui.available_width()), 32.0),
                            egui::Sense::hover(),
                        );
                        widgets::search_input(
                            ui,
                            rect,
                            &mut self.search,
                            "Tìm theo mã phiếu sửa, mã TS, người báo hỏng, sự cố, trung tâm sửa...",
                        )
                    };
                    widgets::combo_box("asset-repair-status")
                        .selected_text(&self.status_filter)
                        .show_ui(ui, |ui| {
                            for item in [
                                "Tất cả trạng thái",
                                "Chờ duyệt báo giá",
                                "Đang sửa chữa tại hãng",
                                "Chờ linh kiện thay thế",
                                "Đã sửa xong & Bàn giao",
                                "Không thể sửa chữa",
                            ] {
                                ui.selectable_value(&mut self.status_filter, item.to_owned(), item);
                            }
                        });
                    widgets::combo_box("asset-repair-severity")
                        .selected_text(&self.severity_filter)
                        .show_ui(ui, |ui| {
                            for item in [
                                "Tất cả mức độ sự cố",
                                SEVERITIES[0],
                                SEVERITIES[1],
                                SEVERITIES[2],
                                SEVERITIES[3],
                            ] {
                                ui.selectable_value(
                                    &mut self.severity_filter,
                                    item.to_owned(),
                                    item,
                                );
                            }
                        });
                    if ui.button("⟳ Làm mới").clicked() {
                        self.request_reload(session, api);
                    }
                    if is_admin && ui.button("＋ Lập phiếu báo hỏng & sửa chữa").clicked()
                    {
                        self.draft.start(self.records.len());
                        self.form_open = true;
                    }
                });
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                }
                if !self.notice.is_empty() {
                    ui.colored_label(Color32::from_rgb(5, 150, 105), &self.notice);
                }
                if !self.data_loaded && busy {
                    ui.add_space(8.0);
                    ui.spinner();
                    ui.label("Đang tải phiếu sửa chữa…");
                }
                let filtered = self
                    .records
                    .iter()
                    .filter(|record| {
                        let q = self.search.trim().to_lowercase();
                        let matches_search = q.is_empty()
                            || [
                                &record.repair_code,
                                &record.asset_code,
                                &record.asset_name,
                                &record.vendor,
                                &record.requester,
                                &record.issue_description,
                            ]
                            .iter()
                            .any(|field| field.to_lowercase().contains(&q));
                        matches_search
                            && (self.status_filter.starts_with("Tất cả")
                                || record.status == self.status_filter)
                            && (self.severity_filter.starts_with("Tất cả")
                                || record.severity == self.severity_filter)
                    })
                    .cloned()
                    .collect::<Vec<_>>();
                let pages = filtered.len().div_ceil(self.page_size).max(1);
                self.page = self.page.min(pages - 1);
                widgets::table_with_row_height(
                    ui,
                    "asset-repairs.table",
                    &[
                        widgets::TableColumn {
                            title: "Mã phiếu & Mức độ",
                            width: 170.0,
                        },
                        widgets::TableColumn {
                            title: "Tài sản & Sự cố hư hỏng",
                            width: 260.0,
                        },
                        widgets::TableColumn {
                            title: "Người báo hỏng & Đơn vị sửa",
                            width: 200.0,
                        },
                        widgets::TableColumn {
                            title: "Dự toán / Thực tế",
                            width: 185.0,
                        },
                        widgets::TableColumn {
                            title: "Thời gian thực hiện",
                            width: 160.0,
                        },
                        widgets::TableColumn {
                            title: "Trạng thái",
                            width: 170.0,
                        },
                        widgets::TableColumn {
                            title: "Thao tác",
                            width: 160.0,
                        },
                    ],
                    filtered
                        .len()
                        .saturating_sub(self.page * self.page_size)
                        .min(self.page_size),
                    102.0,
                    |ui, row, column| {
                        let record = &filtered[self.page * self.page_size + row];

                        match column {
                            0 => {
                                ui.vertical(|ui| {
                                    ui.label(
                                        RichText::new(format!("🔧 {}", record.repair_code))
                                            .color(Color32::from_rgb(0, 150, 136))
                                            .strong(),
                                    );
                                    ui.label(
                                        RichText::new(&record.severity)
                                            .small()
                                            .color(severity_color(&record.severity)),
                                    );
                                });
                            }
                            1 => {
                                ui.vertical(|ui| {
                                    ui.label(RichText::new(&record.asset_name).strong());
                                    ui.label(
                                        RichText::new(format!(
                                            "Mã: {} · SN: {}",
                                            record.asset_code, record.serial_no
                                        ))
                                        .small()
                                        .color(Color32::from_rgb(0, 150, 136)),
                                    );
                                    ui.label(
                                        RichText::new(format!("⚠ {}", record.issue_description))
                                            .small()
                                            .color(Color32::from_rgb(220, 38, 38)),
                                    );
                                });
                            }
                            2 => {
                                ui.vertical(|ui| {
                                    ui.label(format!(
                                        "{} ({})",
                                        record.requester, record.department
                                    ));
                                    ui.label(
                                        RichText::new(&record.vendor)
                                            .small()
                                            .color(Color32::from_rgb(37, 99, 235)),
                                    );
                                });
                            }
                            3 => {
                                ui.vertical(|ui| {
                                    ui.label(format!(
                                        "Dự toán: {} ₫",
                                        money(record.estimated_cost)
                                    ));
                                    ui.label(
                                        RichText::new(format!(
                                            "Thực tế: {} ₫",
                                            money(record.actual_cost)
                                        ))
                                        .color(Color32::from_rgb(22, 163, 74))
                                        .strong(),
                                    );
                                    ui.label(RichText::new(&record.cost_bearing).small());
                                });
                            }
                            4 => {
                                ui.vertical(|ui| {
                                    ui.label(format!("Gửi: {}", record.start_date));
                                    ui.label(format!("Hẹn: {}", record.expected_end_date));
                                    if let Some(date) = &record.completed_date {
                                        ui.label(
                                            RichText::new(format!("Xong: {date}"))
                                                .small()
                                                .color(Color32::from_rgb(22, 163, 74)),
                                        );
                                    }
                                });
                            }
                            5 => {
                                ui.label(status_badge(&record.status));
                            }
                            6 => {
                                ui.vertical(|ui| {
                                    if ui.small_button("Xem").clicked() {
                                        self.detail_key = Some(record.key.clone());
                                    }
                                    if is_admin
                                        && record.status == "Chờ duyệt báo giá"
                                        && ui.small_button("Duyệt").clicked()
                                    {
                                        self.approve_key = Some(record.key.clone());
                                    }
                                    if is_admin
                                        && record.status == "Đang sửa chữa tại hãng"
                                        && ui.small_button("Nghiệm thu").clicked()
                                    {
                                        self.complete_key = Some(record.key.clone());
                                        self.actual_cost.clear();
                                        self.completion_notes.clear();
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
                    "asset-repairs.pagination",
                    &mut self.page,
                    filtered.len(),
                    &mut self.page_size,
                );
            });
        self.render_create(ctx, session, api);
        self.render_detail(ctx);
        self.render_approve(ctx, session, api);
        self.render_complete(ctx, session, api);
    }

    fn render_create(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if !self.form_open {
            return;
        }
        let mut open = true;
        let (_, closed) = widgets::modal(
            ctx,
            "asset-repairs-0",
            "Lập Phiếu Báo Hỏng & Yêu Cầu Sửa Chữa Thiết Bị",
            760.0,
            self.busy(),
            |ui| {
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    ui.add_space(8.0);
                }

                ui.label("Mã phiếu, mức độ và hình thức sửa chữa");
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        3
                    },
                    |cols| {
                        let column_count = cols.len();
                        edit(
                            &mut cols[0 % column_count],
                            "Mã phiếu sửa",
                            &mut self.draft.repair_code,
                        );
                        select(
                            &mut cols[1 % column_count],
                            "Mức độ nghiêm trọng",
                            &mut self.draft.severity,
                            &SEVERITIES,
                        );
                        select(
                            &mut cols[2 % column_count],
                            "Hình thức sửa chữa",
                            &mut self.draft.repair_unit,
                            &REPAIR_UNITS,
                        );
                    },
                );
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        3
                    },
                    |cols| {
                        let column_count = cols.len();
                        edit(
                            &mut cols[0 % column_count],
                            "Mã tài sản",
                            &mut self.draft.asset_code,
                        );
                        edit(
                            &mut cols[1 % column_count],
                            "Tên tài sản cần sửa",
                            &mut self.draft.asset_name,
                        );
                        edit(
                            &mut cols[2 % column_count],
                            "Số Serial / Tag",
                            &mut self.draft.serial_no,
                        );
                    },
                );
                multiline(
                    ui,
                    "Mô tả hiện tượng hư hỏng / Sự cố chi tiết",
                    &mut self.draft.issue_description,
                );
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        2
                    },
                    |cols| {
                        let column_count = cols.len();
                        edit(
                            &mut cols[0 % column_count],
                            "Nguyên nhân sơ bộ",
                            &mut self.draft.root_cause,
                        );
                        edit(
                            &mut cols[1 % column_count],
                            "Phương án khắc phục dự kiến",
                            &mut self.draft.solution,
                        );
                    },
                );
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        3
                    },
                    |cols| {
                        let column_count = cols.len();
                        edit(
                            &mut cols[0 % column_count],
                            "Đơn vị / Trung tâm sửa chữa",
                            &mut self.draft.vendor,
                        );
                        edit(
                            &mut cols[1 % column_count],
                            "Hotline / Người phụ trách",
                            &mut self.draft.vendor_contact,
                        );
                        select(
                            &mut cols[2 % column_count],
                            "Nguồn kinh phí chi trả",
                            &mut self.draft.cost_bearing,
                            &COST_BEARING,
                        );
                    },
                );
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        3
                    },
                    |cols| {
                        let column_count = cols.len();
                        edit(
                            &mut cols[0 % column_count],
                            "Dự toán kinh phí (VNĐ)",
                            &mut self.draft.estimated_cost,
                        );
                        edit(
                            &mut cols[1 % column_count],
                            "Ngày gửi máy (YYYY-MM-DD)",
                            &mut self.draft.start_date,
                        );
                        edit(
                            &mut cols[2 % column_count],
                            "Ngày dự kiến hoàn thành",
                            &mut self.draft.expected_end_date,
                        );
                    },
                );
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        3
                    },
                    |cols| {
                        let column_count = cols.len();
                        edit(
                            &mut cols[0 % column_count],
                            "Người báo hỏng",
                            &mut self.draft.requester,
                        );
                        edit(
                            &mut cols[1 % column_count],
                            "Phòng ban",
                            &mut self.draft.department,
                        );
                        edit(
                            &mut cols[2 % column_count],
                            "Cán bộ duyệt chi",
                            &mut self.draft.approver,
                        );
                    },
                );
                edit(
                    ui,
                    "Bảo hành sau sửa",
                    &mut self.draft.warranty_after_repair,
                );
                multiline(ui, "Ghi chú", &mut self.draft.notes);
                ui.horizontal(|ui| {
                    if ui.button("Hủy bỏ").clicked() {
                        self.form_open = false;
                    }
                    if ui.button("Xác nhận gửi phiếu sửa chữa").clicked() {
                        match self.draft.build() {
                            Ok(input) => {
                                self.pending_mutation =
                                    Some(api.create_asset_repair_task(session, &input));
                                self.error.clear();
                                self.notice.clear();
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

    fn render_detail(&mut self, ctx: &egui::Context) {
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
            "asset-repairs-1",
            "Hồ Sơ Sửa Chữa & Khắc Phục Sự Cố Kỹ Thuật",
            580.0,
            |ui| {
                ui.heading(&record.asset_name);
                ui.label(
                    RichText::new(&record.repair_code)
                        .color(Color32::from_rgb(0, 150, 136))
                        .strong(),
                );
                ui.label(format!(
                    "Mã TS: {} · Serial: {}",
                    record.asset_code, record.serial_no
                ));
                ui.separator();
                ui.heading("Chi tiết sự cố & Phương án");
                ui.label(format!("Hiện tượng hỏng: {}", record.issue_description));
                if !record.root_cause.is_empty() {
                    ui.label(format!("Nguyên nhân: {}", record.root_cause));
                }
                if !record.solution.is_empty() {
                    ui.label(format!("Giải pháp kỹ thuật: {}", record.solution));
                }
                if !record.replaced_parts.is_empty() {
                    ui.label(format!("Linh kiện thay thế: {}", record.replaced_parts));
                }
                ui.separator();
                ui.heading("Dự Toán Kinh Phí & Thanh Toán");
                ui.label(format!(
                    "Dự toán ban đầu: {} ₫",
                    money(record.estimated_cost)
                ));
                ui.label(format!(
                    "Thực tế thanh toán: {} ₫",
                    money(record.actual_cost)
                ));
                ui.label(format!("Nguồn chi trả: {}", record.cost_bearing));
                ui.label(format!(
                    "Bảo hành sau sửa: {}",
                    record.warranty_after_repair
                ));
                ui.separator();
                ui.label(format!("Đơn vị sửa chữa: {}", record.vendor));
                ui.label(format!("Liên hệ kỹ thuật: {}", record.vendor_contact));
                ui.label(format!(
                    "Ngày gửi máy: {} · Hẹn hoàn thành: {}",
                    record.start_date, record.expected_end_date
                ));
                if let Some(date) = record.completed_date {
                    ui.label(format!("Thực tế bàn giao: {date}"));
                }
                if let Some(name) = record.completed_by_name {
                    ui.label(format!("Người nghiệm thu: {name}"));
                }
                ui.label(format!("Trạng thái: {}", record.status));
                if !record.notes.is_empty() {
                    ui.separator();
                    ui.label("Ghi chú");
                    ui.label(record.notes);
                }
            },
        );
        open &= !closed;
        self.detail_key = open.then_some(key);
    }

    fn render_approve(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let Some(key) = self.approve_key.clone() else {
            return;
        };
        let Some(record) = self
            .records
            .iter()
            .find(|record| record.key == key)
            .cloned()
        else {
            self.approve_key = None;
            return;
        };
        let mut open = true;
        let (_, closed) = widgets::modal(
            ctx,
            "asset-repairs-2",
            "Duyệt báo giá sửa chữa",
            480.0,
            self.busy(),
            |ui| {
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    ui.add_space(8.0);
                }

                ui.label(format!(
                    "Phê duyệt phiếu {} · {} ₫",
                    record.repair_code,
                    money(record.estimated_cost)
                ));
                ui.label(format!(
                    "Tài sản: {} ({})",
                    record.asset_name, record.asset_code
                ));
                ui.horizontal(|ui| {
                    if ui.button("Hủy").clicked() {
                        self.approve_key = None;
                    }
                    if ui.button("Xác nhận duyệt báo giá").clicked() {
                        self.pending_mutation = Some(api.approve_asset_repair_task(session, &key));
                        self.approve_key = None;
                    }
                });
            },
        );
        open &= !closed;
        if !open {
            self.approve_key = None;
        }
    }

    fn render_complete(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let Some(key) = self.complete_key.clone() else {
            return;
        };
        let Some(record) = self
            .records
            .iter()
            .find(|record| record.key == key)
            .cloned()
        else {
            self.complete_key = None;
            return;
        };
        let mut open = true;
        let (_, closed) = widgets::modal(
            ctx,
            "asset-repairs-3",
            "Biên Bản Nghiệm Thu Kỹ Thuật Sau Sửa Chữa",
            480.0,
            self.busy(),
            |ui| {
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    ui.add_space(8.0);
                }

                ui.label(format!(
                    "Xác nhận tài sản {} ({}) đã sửa xong tại {}.",
                    record.asset_name, record.asset_code, record.vendor
                ));
                edit(
                    ui,
                    "Chi phí thực tế thanh toán quyết toán (VNĐ)",
                    &mut self.actual_cost,
                );
                multiline(
                    ui,
                    "Đánh giá chất lượng sau sửa chữa & Bàn giao",
                    &mut self.completion_notes,
                );
                ui.horizontal(|ui| {
                    if ui.button("Hủy").clicked() {
                        self.complete_key = None;
                    }
                    if ui.button("Xác nhận nghiệm thu & Bàn giao").clicked() {
                        match self.actual_cost.trim().parse::<i64>() {
                            Ok(actual_cost)
                                if actual_cost >= 0 && !self.completion_notes.trim().is_empty() =>
                            {
                                self.pending_mutation = Some(api.complete_asset_repair_task(
                                    session,
                                    &key,
                                    &CompleteAssetRepair {
                                        actual_cost,
                                        notes: self.completion_notes.trim().to_owned(),
                                    },
                                ));
                                self.complete_key = None;
                            }
                            Ok(_) => {
                                self.error = "Chi phí không âm và biên bản nghiệm thu là bắt buộc."
                                    .to_owned()
                            }
                            Err(_) => {
                                self.error =
                                    "Chi phí thực tế phải là số nguyên VNĐ không âm.".to_owned()
                            }
                        }
                    }
                });
            },
        );
        open &= !closed;
        if !open {
            self.complete_key = None;
        }
    }
}

fn edit(ui: &mut Ui, label: &str, value: &mut String) {
    if label.starts_with("Ngày") {
        widgets::form_date(ui, label, label, true, value);
    } else {
        widgets::form_input(ui, label, label, false, value, "", false);
    }
}

fn multiline(ui: &mut Ui, label: &str, value: &mut String) {
    widgets::form_textarea(ui, label, label, false, value, "", 3);
}

fn select(ui: &mut Ui, label: &str, value: &mut String, options: &[&str]) {
    widgets::form_select(ui, label, label, true, value, options);
}

fn money(value: i64) -> String {
    format!("{value}")
        .chars()
        .rev()
        .enumerate()
        .fold(String::new(), |mut out, (index, ch)| {
            if index > 0 && index % 3 == 0 {
                out.push('.');
            }
            out.push(ch);
            out
        })
        .chars()
        .rev()
        .collect()
}

fn severity_color(severity: &str) -> Color32 {
    if severity.contains("P1") {
        Color32::from_rgb(220, 38, 38)
    } else if severity.contains("P2") {
        Color32::from_rgb(217, 119, 6)
    } else {
        Color32::from_rgb(37, 99, 235)
    }
}

fn status_badge(status: &str) -> RichText {
    let color = if status.contains("Không thể") {
        Color32::from_rgb(220, 38, 38)
    } else if status.contains("Chờ") {
        Color32::from_rgb(217, 119, 6)
    } else if status.contains("Đang") {
        Color32::from_rgb(37, 99, 235)
    } else {
        Color32::from_rgb(22, 163, 74)
    };
    RichText::new(status).color(color)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repair_form_defaults_match_legacy_values_and_validate_dates() {
        let mut draft = RepairDraft::default();
        draft.start(2);
        assert!(draft.repair_code.starts_with("SC-"));
        assert_eq!(draft.severity, "Cao (P2)");
        assert!(draft.estimated_cost.is_empty());
        assert!(draft.vendor.is_empty() && draft.approver.is_empty());
        draft.estimated_cost = "2000000".into();
        draft.approver = "Người duyệt".into();
        draft.asset_code = "A1".into();
        draft.asset_name = "Máy tính".into();
        draft.serial_no = "SN1".into();
        draft.requester = "Nguyễn An".into();
        draft.department = "IT".into();
        draft.vendor = "Vendor".into();
        draft.issue_description = "Không lên nguồn".into();
        assert!(draft.build().is_ok());
        draft.expected_end_date = "2020-01-01".into();
        assert!(draft.build().is_err());
    }
}
