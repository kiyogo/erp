use crate::widgets;
use std::time::Duration;

use chrono::Utc;
use egui::{Color32, RichText, Ui};
use web_time::Instant;

use crate::{
    api::{
        ApiClient, ApiTask, ApproveAssetDisposal, AssetDisposal, AssetDisposalMutationResponse,
        AssetDisposalsResponse, CreateAssetDisposal,
    },
    models::Session,
};

const PAGE_SIZE: usize = 8;
const REFRESH_INTERVAL: Duration = Duration::from_secs(30);
const PENDING: &str = "Chờ hội đồng phê duyệt";
const COMPLETED: &str = "Đã thanh lý & Hoàn tất sổ sách";
const DESTROYED: &str = "Đã tiêu hủy an toàn";
const METHODS: [&str; 5] = [
    "Bán đấu giá nội bộ CBNV",
    "Bán thanh lý cho đơn vị thu mua ngoài",
    "Tiêu hủy an toàn (Data Wiping / Shredding)",
    "Tặng / Quyên góp từ thiện",
    "Báo mất / Thất lạc do rủi ro",
];
const STATUSES: [&str; 4] = ["Tất cả trạng thái", PENDING, COMPLETED, DESTROYED];

#[derive(Default)]
struct DisposalDraft {
    disposal_code: String,
    disposal_method: String,
    disposal_date: String,
    asset_code: String,
    asset_name: String,
    serial_no: String,
    reason: String,
    original_cost: String,
    accumulated_depreciation: String,
    starting_auction_price: String,
    actual_disposal_price: String,
    disposal_cost: String,
    buyer_name: String,
    buyer_phone: String,
    council_leader: String,
    council_members: String,
}

impl DisposalDraft {
    fn start(&mut self, count: usize) {
        *self = Self::default();
        let today = Utc::now().date_naive();
        self.disposal_code = format!("TL-{}-0{}", today.format("%Y"), count + 10);
        self.disposal_method = METHODS[1].to_owned();
        self.disposal_date = today.format("%Y-%m-%d").to_string();
    }

    fn build(&self) -> Result<CreateAssetDisposal, String> {
        for (value, label) in [
            (&self.disposal_code, "Mã biên bản"),
            (&self.asset_code, "Mã tài sản"),
            (&self.asset_name, "Tên tài sản"),
            (&self.serial_no, "Số Serial / Tag"),
            (&self.reason, "Lý do đề xuất"),
            (&self.buyer_name, "Bên mua / Đơn vị tiếp nhận"),
            (&self.council_leader, "Chủ tịch Hội đồng"),
            (&self.council_members, "Thành viên Hội đồng"),
        ] {
            if value.trim().is_empty() {
                return Err(format!("{label} không được để trống."));
            }
        }
        let amount = |value: &str, label: &str| -> Result<i64, String> {
            let parsed = value
                .trim()
                .parse::<i64>()
                .map_err(|_| format!("{label} phải là số nguyên VNĐ."))?;
            if parsed < 0 {
                return Err(format!("{label} không được âm."));
            }
            Ok(parsed)
        };
        chrono::NaiveDate::parse_from_str(self.disposal_date.trim(), "%Y-%m-%d")
            .map_err(|_| "Ngày thực hiện không hợp lệ (YYYY-MM-DD).".to_owned())?;
        Ok(CreateAssetDisposal {
            disposal_code: self.disposal_code.trim().to_owned(),
            disposal_method: self.disposal_method.clone(),
            disposal_date: self.disposal_date.clone(),
            asset_code: self.asset_code.trim().to_owned(),
            asset_name: self.asset_name.trim().to_owned(),
            category: String::new(),
            serial_no: self.serial_no.trim().to_owned(),
            reason: self.reason.trim().to_owned(),
            original_cost: amount(&self.original_cost, "Nguyên giá")?,
            accumulated_depreciation: amount(
                &self.accumulated_depreciation,
                "Giá trị đã khấu hao",
            )?,
            starting_auction_price: amount(&self.starting_auction_price, "Giá khởi điểm")?,
            actual_disposal_price: amount(&self.actual_disposal_price, "Giá bán thực thu")?,
            disposal_cost: amount(&self.disposal_cost, "Chi phí thanh lý")?,
            buyer_name: self.buyer_name.trim().to_owned(),
            buyer_phone: self.buyer_phone.trim().to_owned(),
            council_leader: self.council_leader.trim().to_owned(),
            council_members: self.council_members.trim().to_owned(),
            notes: String::new(),
        })
    }
}

pub struct AssetDisposalsView {
    records: Vec<AssetDisposal>,
    pending_load: Option<ApiTask<AssetDisposalsResponse>>,
    pending_mutation: Option<ApiTask<AssetDisposalMutationResponse>>,
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
    draft: DisposalDraft,
    detail_key: Option<String>,
    approve_key: Option<String>,
    approve_price: String,
    wipe_confirmed: bool,
    notice: String,
    error: String,
}

impl Default for AssetDisposalsView {
    fn default() -> Self {
        Self {
            records: Vec::new(),
            pending_load: None,
            pending_mutation: None,
            pending_download: None,
            loaded_for: None,
            last_loaded: None,
            needs_reload: true,
            data_loaded: false,
            search: String::new(),
            status_filter: STATUSES[0].to_owned(),
            method_filter: "Tất cả hình thức xử lý".to_owned(),
            page: 0,
            page_size: PAGE_SIZE,
            form_open: false,
            draft: DisposalDraft::default(),
            detail_key: None,
            approve_key: None,
            approve_price: String::new(),
            wipe_confirmed: true,
            notice: String::new(),
            error: String::new(),
        }
    }
}

impl AssetDisposalsView {
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
        self.pending_load = Some(api.list_asset_disposals_task(session));
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
                    self.notice = "Đã cập nhật biên bản thanh lý tài sản.".to_owned();
                    self.form_open = false;
                    self.approve_key = None;
                    self.needs_reload = true;
                }
                Err(error) => self.error = error,
            }
            ctx.request_repaint();
        }
        if let Some(result) = self.pending_download.as_ref().and_then(ApiClient::poll) {
            self.pending_download = None;
            match result {
                Ok(true) => self.notice = "Đã xuất tệp biên bản thanh lý.".to_owned(),
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
                widgets::metrics_grid(
                    ui,
                    "asset-disposals.metrics",
                    &[
                        widgets::Metric {
                            label: "Tổng tiền thu hồi từ thanh lý",
                            value: if self.data_loaded {
                                format!(
                                    "{} ₫",
                                    money(total_money(
                                        self.records.iter().map(|r| r.actual_disposal_price),
                                    ))
                                )
                            } else {
                                "—".to_owned()
                            },
                            detail: "Số liệu từ biên bản đã ghi nhận",
                            color: Color32::from_rgb(15, 23, 42),
                            value_size: 22.0,
                        },
                        widgets::Metric {
                            label: "Lãi ròng thanh lý (Net Gain)",
                            value: if self.data_loaded {
                                format!(
                                    "{} ₫",
                                    money(total_money(
                                        self.records.iter().map(|r| r.net_gain_loss)
                                    ))
                                )
                            } else {
                                "—".to_owned()
                            },
                            detail: "Sổ nội bộ · chưa đồng bộ sổ cái",
                            color: Color32::from_rgb(22, 163, 74),
                            value_size: 22.0,
                        },
                        widgets::Metric {
                            label: "Chờ Hội đồng thanh lý phê duyệt",
                            value: if self.data_loaded {
                                format!(
                                    "{} biên bản",
                                    self.records.iter().filter(|r| r.status == PENDING).count()
                                )
                            } else {
                                "—".to_owned()
                            },
                            detail: "Cần xem xét hồ sơ thanh lý",
                            color: Color32::from_rgb(217, 119, 6),
                            value_size: 22.0,
                        },
                        widgets::Metric {
                            label: "Đã thanh lý & tiêu hủy theo hồ sơ",
                            value: if self.data_loaded {
                                format!(
                                    "{} đợt tài sản",
                                    self.records
                                        .iter()
                                        .filter(
                                            |r| [COMPLETED, DESTROYED].contains(&r.status.as_str())
                                        )
                                        .count()
                                )
                            } else {
                                "—".to_owned()
                            },
                            detail: "Theo trạng thái hồ sơ · không xác minh wipe",
                            color: Color32::from_rgb(37, 99, 235),
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
                            "Tìm theo mã biên bản, mã TS, bên mua, lý do thanh lý...",
                        )
                    };
                    widgets::combo_box("asset-disposal-status")
                        .selected_text(&self.status_filter)
                        .show_ui(ui, |ui| {
                            for status in STATUSES {
                                ui.selectable_value(
                                    &mut self.status_filter,
                                    status.to_owned(),
                                    status,
                                );
                            }
                        });
                    widgets::combo_box("asset-disposal-method")
                        .selected_text(&self.method_filter)
                        .show_ui(ui, |ui| {
                            for method in [
                                "Tất cả hình thức xử lý",
                                METHODS[0],
                                METHODS[1],
                                METHODS[2],
                                METHODS[3],
                            ] {
                                ui.selectable_value(
                                    &mut self.method_filter,
                                    method.to_owned(),
                                    method,
                                );
                            }
                        });
                    if ui.button("⟳ Làm mới").clicked() {
                        self.request_reload(session, api);
                    }
                    if ui.button("⇩ Xuất dữ liệu thanh lý (.csv)").clicked() {
                        self.pending_download = Some(crate::file_transfer::save_download_task(
                            "mau-02-tscd.csv".to_owned(),
                            disposal_csv(&self.records),
                        ));
                    }
                    if is_admin
                        && ui
                            .add_enabled(
                                !busy,
                                egui::Button::new("＋ Lập biên bản thanh lý mới")
                                    .fill(Color32::from_rgb(0, 150, 136))
                                    .stroke(egui::Stroke::NONE),
                            )
                            .clicked()
                    {
                        self.draft.start(self.records.len());
                        self.form_open = true;
                        self.notice.clear();
                        self.error.clear();
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
                    ui.label("Đang tải biên bản thanh lý…");
                }
                let query = self.search.trim().to_lowercase();
                let filtered = self
                    .records
                    .iter()
                    .filter(|record| {
                        let matches_search = query.is_empty()
                            || [
                                &record.disposal_code,
                                &record.asset_code,
                                &record.asset_name,
                                &record.buyer_name,
                                &record.reason,
                            ]
                            .iter()
                            .any(|value| value.to_lowercase().contains(&query));
                        matches_search
                            && (self.status_filter == STATUSES[0]
                                || record.status == self.status_filter)
                            && (self.method_filter == "Tất cả hình thức xử lý"
                                || record.disposal_method == self.method_filter)
                    })
                    .cloned()
                    .collect::<Vec<_>>();
                let pages = filtered.len().div_ceil(self.page_size).max(1);
                self.page = self.page.min(pages - 1);
                widgets::table_with_row_height(
                    ui,
                    "asset-disposals.table",
                    &[
                        widgets::TableColumn {
                            title: "Mã biên bản & Hình thức",
                            width: 170.0,
                        },
                        widgets::TableColumn {
                            title: "Tài sản & Lý do xử lý",
                            width: 245.0,
                        },
                        widgets::TableColumn {
                            title: "Hạch toán Kế toán (Nguyên giá ➔ Thu hồi)",
                            width: 290.0,
                        },
                        widgets::TableColumn {
                            title: "Bên mua & Bảo mật Data Wipe",
                            width: 220.0,
                        },
                        widgets::TableColumn {
                            title: "Ngày lập",
                            width: 120.0,
                        },
                        widgets::TableColumn {
                            title: "Trạng thái",
                            width: 190.0,
                        },
                        widgets::TableColumn {
                            title: "Thao tác",
                            width: 150.0,
                        },
                    ],
                    filtered
                        .len()
                        .saturating_sub(self.page * self.page_size)
                        .min(self.page_size),
                    100.0,
                    |ui, row, column| {
                        let record = &filtered[self.page * self.page_size + row];

                        match column {
                            0 => {
                                ui.vertical(|ui| {
                                    ui.label(
                                        RichText::new(format!("▣ {}", record.disposal_code))
                                            .color(Color32::from_rgb(0, 150, 136))
                                            .strong(),
                                    );
                                    ui.label(
                                        RichText::new(method_short(&record.disposal_method))
                                            .small()
                                            .color(Color32::from_rgb(217, 119, 6)),
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
                                        RichText::new(&record.reason)
                                            .small()
                                            .color(Color32::from_rgb(71, 85, 105)),
                                    );
                                });
                            }
                            2 => {
                                ui.vertical(|ui| {
                                    ui.label(
                                        RichText::new(format!(
                                            "Nguyên giá: {} ₫",
                                            money(record.original_cost)
                                        ))
                                        .small()
                                        .strikethrough()
                                        .color(Color32::from_rgb(100, 116, 139)),
                                    );
                                    ui.label(
                                        RichText::new(format!(
                                            "Thực thu: {} ₫",
                                            money(record.actual_disposal_price)
                                        ))
                                        .color(Color32::from_rgb(22, 163, 74))
                                        .strong(),
                                    );
                                    ui.label(
                                        RichText::new(if record.net_gain_loss >= 0 {
                                            format!("Lãi: +{} ₫", money(record.net_gain_loss))
                                        } else {
                                            format!("Lỗ: {} ₫", money(record.net_gain_loss))
                                        })
                                        .small()
                                        .color(
                                            if record.net_gain_loss >= 0 {
                                                Color32::from_rgb(22, 163, 74)
                                            } else {
                                                Color32::from_rgb(220, 38, 38)
                                            },
                                        ),
                                    );
                                });
                            }
                            3 => {
                                ui.vertical(|ui| {
                                    ui.label(RichText::new(&record.buyer_name).strong());
                                    ui.label(
                                        RichText::new(if legacy_wipe_unverified(record) {
                                            "⚠ Legacy: Wipe chưa xác minh"
                                        } else if record.security_data_wipe_certified {
                                            "🔒 Đã xác nhận Wipe"
                                        } else {
                                            "🔒 Chưa hủy dữ liệu"
                                        })
                                        .small()
                                        .color(
                                            if legacy_wipe_unverified(record) {
                                                Color32::from_rgb(217, 119, 6)
                                            } else if record.security_data_wipe_certified {
                                                Color32::from_rgb(22, 163, 74)
                                            } else {
                                                Color32::from_rgb(217, 119, 6)
                                            },
                                        ),
                                    );
                                });
                            }
                            4 => {
                                ui.label(&record.disposal_date);
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
                                        && record.status == PENDING
                                        && ui.small_button("Duyệt").clicked()
                                    {
                                        self.approve_key = Some(record.key.clone());
                                        self.approve_price = record
                                            .actual_disposal_price
                                            .max(record.starting_auction_price)
                                            .to_string();
                                        self.wipe_confirmed = false;
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
                    "asset-disposals.pagination",
                    &mut self.page,
                    filtered.len(),
                    &mut self.page_size,
                );
            });
        self.render_create(ctx, session, api);
        self.render_detail(ctx);
        self.render_approve(ctx, session, api);
    }

    fn render_create(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if !self.form_open {
            return;
        }
        let mut open = true;
        let (_, closed) = widgets::modal(
            ctx,
            "asset-disposals-0",
            "Lập Biên Bản Đề Xuất Thanh Lý / Tiêu Hủy Tài Sản",
            760.0,
            self.busy(),
            |ui| {
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    ui.add_space(8.0);
                }

                edit(
                    ui,
                    "Chi phí thanh lý thực tế (VNĐ)",
                    &mut self.draft.disposal_cost,
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
                            "Mã biên bản",
                            &mut self.draft.disposal_code,
                        );
                        select(
                            &mut cols[1 % column_count],
                            "Hình thức thanh lý",
                            &mut self.draft.disposal_method,
                            &METHODS,
                        );
                        edit(
                            &mut cols[2 % column_count],
                            "Ngày thực hiện",
                            &mut self.draft.disposal_date,
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
                            "Tên tài sản thanh lý",
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
                    "Lý do đề xuất thanh lý / Tiêu hủy",
                    &mut self.draft.reason,
                );
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        4
                    },
                    |cols| {
                        let column_count = cols.len();
                        edit(
                            &mut cols[0 % column_count],
                            "Nguyên giá sổ (VNĐ)",
                            &mut self.draft.original_cost,
                        );
                        edit(
                            &mut cols[1 % column_count],
                            "Đã khấu hao (VNĐ)",
                            &mut self.draft.accumulated_depreciation,
                        );
                        edit(
                            &mut cols[2 % column_count],
                            "Giá khởi điểm (VNĐ)",
                            &mut self.draft.starting_auction_price,
                        );
                        edit(
                            &mut cols[3 % column_count],
                            "Giá bán thực thu (VNĐ)",
                            &mut self.draft.actual_disposal_price,
                        );
                    },
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
                            "Bên mua / Đơn vị tiếp nhận",
                            &mut self.draft.buyer_name,
                        );
                        edit(
                            &mut cols[1 % column_count],
                            "Số điện thoại bên mua",
                            &mut self.draft.buyer_phone,
                        );
                    },
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
                            "Chủ tịch Hội đồng thanh lý",
                            &mut self.draft.council_leader,
                        );
                        edit(
                            &mut cols[1 % column_count],
                            "Thành viên Hội đồng thanh lý",
                            &mut self.draft.council_members,
                        );
                    },
                );
                ui.horizontal(|ui| {
                    if ui.button("Hủy bỏ").clicked() {
                        self.form_open = false;
                    }
                    if ui
                        .add_enabled(!self.busy(), egui::Button::new("Trình Hội đồng thanh lý"))
                        .clicked()
                    {
                        match self.draft.build() {
                            Ok(input) => {
                                self.pending_mutation =
                                    Some(api.create_asset_disposal_task(session, &input));
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

    fn render_detail(&mut self, ctx: &egui::Context) {
        let Some(key) = self.detail_key.clone() else {
            return;
        };
        let Some(record) = self.records.iter().find(|item| item.key == key).cloned() else {
            self.detail_key = None;
            return;
        };
        let mut open = true;
        let (_, closed) = widgets::drawer(
            ctx,
            "asset-disposals-1",
            "Biên Bản Thanh Lý Tài Sản Cố Định (Mẫu Số 02 - TSCĐ)",
            620.0,
            |ui| {
                ui.vertical_centered(|ui| {
                    ui.label(
                        RichText::new("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM")
                            .small()
                            .strong(),
                    );
                    ui.label(
                        RichText::new("Mẫu số 02 - TSCĐ (Ban hành theo TT 200/2014/TT-BTC)")
                            .small(),
                    );
                    ui.heading("BIÊN BẢN THANH LÝ TÀI SẢN CỐ ĐỊNH");
                    ui.colored_label(
                        Color32::from_rgb(0, 150, 136),
                        format!(
                            "Số: {} / BBTL-TSCĐ · Ngày: {}",
                            record.disposal_code, record.disposal_date
                        ),
                    );
                });
                ui.separator();
                ui.heading("I. BAN THANH LÝ TÀI SẢN GỒM CÓ:");
                ui.label(format!(
                    "1. Ông/Bà: {} - Chủ tịch Hội đồng",
                    record.council_leader
                ));
                ui.label(format!("2. Thành viên: {}", record.council_members));
                ui.separator();
                ui.heading("II. KẾT QUẢ ĐÁNH GIÁ & HẠCH TOÁN THANH LÝ TÀI SẢN");
                for (label, value) in [
                    ("Tên tài sản thanh lý", record.asset_name.clone()),
                    (
                        "Mã tài sản & Serial",
                        format!("{} (SN: {})", record.asset_code, record.serial_no),
                    ),
                    (
                        "Nguyên giá tài sản",
                        format!("{} ₫", money(record.original_cost)),
                    ),
                    (
                        "Giá trị hao mòn đã trích",
                        format!("{} ₫", money(record.accumulated_depreciation)),
                    ),
                    (
                        "Giá trị còn lại trên sổ sách",
                        format!("{} ₫", money(record.net_book_value)),
                    ),
                    (
                        "Số tiền thực tế thu về (TK 111/112)",
                        format!("{} ₫", money(record.actual_disposal_price)),
                    ),
                    (
                        "Chi phí thanh lý tháo dỡ (TK 811)",
                        format!("{} ₫", money(record.disposal_cost)),
                    ),
                    (
                        "Lãi ròng thanh lý (TK 711 Thu nhập khác)",
                        format!("{} ₫", money(record.net_gain_loss)),
                    ),
                ] {
                    ui.horizontal(|ui| {
                        ui.label(RichText::new(label).color(Color32::from_rgb(100, 116, 139)));
                        ui.label(RichText::new(value).strong());
                    });
                }
                ui.separator();
                ui.heading("III. CHỨNG THỰC AN TOÀN BẢO MẬT DỮ LIỆU (DATA WIPING):");
                ui.label(if legacy_wipe_unverified(&record) {
                    "⚠ Legacy ghi nhận đã Wipe, nhưng khai báo lịch sử chưa được xác minh."
                } else if record.security_data_wipe_certified {
                    "✓ Người phê duyệt đã xác nhận xóa dữ liệu bảo mật."
                } else {
                    "Chưa có xác nhận xóa dữ liệu bảo mật."
                });
                if !record.data_wipe_officer.is_empty() {
                    ui.label(format!(
                        "{}{}",
                        if legacy_wipe_unverified(&record) {
                            "Người được ghi nhận trong dữ liệu legacy (chưa xác minh): "
                        } else {
                            "Cán bộ an ninh thực hiện: "
                        },
                        record.data_wipe_officer,
                    ));
                }
                if let Some(event) = &record.disposal_approval_event {
                    ui.label(format!(
                        "Người phê duyệt: {} · {}",
                        event
                            .get("actorName")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or(""),
                        event
                            .get("occurredAt")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or("")
                    ));
                }
                ui.separator();
                ui.horizontal(|ui| {
                    ui.add_enabled(false, egui::Button::new("In Mẫu 02-TSCĐ (PDF)"))
                        .on_hover_text("Chưa có chức năng tạo PDF; có thể xuất CSV danh sách.");
                    if record.status == PENDING && ui.button("Phê duyệt thanh lý").clicked() {
                        self.approve_key = Some(record.key.clone());
                        self.approve_price = record.actual_disposal_price.to_string();
                        self.wipe_confirmed = false;
                    }
                });
            },
        );
        open &= !closed;
        self.detail_key = open.then_some(key);
    }

    fn render_approve(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let Some(key) = self.approve_key.clone() else {
            return;
        };
        let Some(record) = self.records.iter().find(|item| item.key == key).cloned() else {
            self.approve_key = None;
            return;
        };
        let mut open = true;
        let (_, closed) = widgets::modal(
            ctx,
            "asset-disposals-2",
            "Phê Duyệt Biên Bản Quyết Toán Thanh Lý Tài Sản",
            480.0,
            self.busy(),
            |ui| {
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    ui.add_space(8.0);
                }

                ui.label(format!("Xác nhận phê duyệt: {}", record.disposal_code));
                ui.label(format!(
                    "Tài sản: {} · Nguyên giá: {} ₫ · Giá trị còn lại: {} ₫",
                    record.asset_name,
                    money(record.original_cost),
                    money(record.net_book_value)
                ));
                edit(
                    ui,
                    "Số tiền thực thu hồi chốt thanh lý (VNĐ)",
                    &mut self.approve_price,
                );
                ui.checkbox(
                    &mut self.wipe_confirmed,
                    "Tôi xác nhận đã thực hiện hủy dữ liệu (khai báo của người duyệt)",
                );
                ui.horizontal(|ui| {
                    if ui.button("Hủy").clicked() {
                        self.approve_key = None;
                    }
                    if ui
                        .add_enabled(!self.busy(), egui::Button::new("Chấp thuận thanh lý"))
                        .clicked()
                    {
                        match self.approve_price.trim().parse::<i64>() {
                            Ok(actual_disposal_price) if actual_disposal_price >= 0 => {
                                self.pending_mutation = Some(api.approve_asset_disposal_task(
                                    session,
                                    &key,
                                    &ApproveAssetDisposal {
                                        actual_disposal_price,
                                        security_data_wipe_certified: self.wipe_confirmed,
                                    },
                                ));
                                self.error.clear();
                            }
                            _ => self.error = "Giá thanh lý phải là số nguyên không âm.".to_owned(),
                        }
                    }
                });
            },
        );
        open &= !closed;
        if !open {
            self.approve_key = None;
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

fn status_badge(status: &str) -> RichText {
    let color = if status.contains("Chờ") {
        Color32::from_rgb(217, 119, 6)
    } else if status.contains("tiêu hủy") {
        Color32::from_rgb(37, 99, 235)
    } else {
        Color32::from_rgb(22, 163, 74)
    };
    RichText::new(status).color(color).strong()
}

fn method_short(method: &str) -> &'static str {
    if method.contains("nội bộ") {
        "Đấu giá CBNV"
    } else if method.contains("Tiêu hủy") {
        "Tiêu hủy"
    } else if method.contains("Tặng") {
        "Tặng / quyên góp"
    } else if method.contains("mất") {
        "Báo mất"
    } else {
        "Bán thanh lý"
    }
}

fn legacy_wipe_unverified(record: &AssetDisposal) -> bool {
    record
        .extra
        .get("_kiyoLegacyImport")
        .and_then(|marker| marker.get("verification"))
        .and_then(serde_json::Value::as_str)
        == Some("unverified")
        && record
            .disposal_approval_event
            .as_ref()
            .and_then(|event| event.get("actorUserId"))
            .and_then(serde_json::Value::as_str)
            .is_none()
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

fn total_money(values: impl Iterator<Item = i64>) -> i64 {
    values.fold(0, i64::saturating_add)
}

fn csv_escape(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn disposal_csv(records: &[AssetDisposal]) -> Vec<u8> {
    let mut csv = String::from(
        "\u{feff}Mã biên bản,Mã tài sản,Tên tài sản,Hình thức,Lý do,Nguyên giá,Khấu hao lũy kế,Giá trị còn lại,Giá khởi điểm,Thực thu,Chi phí thanh lý,Lãi/lỗ ròng,Ngày thực hiện,Bên mua,Điện thoại,Chủ tịch hội đồng,Thành viên,Đã xác nhận wipe,Người wipe,Trạng thái,Ghi chú\r\n",
    );
    for item in records {
        let fields = [
            item.disposal_code.clone(),
            item.asset_code.clone(),
            item.asset_name.clone(),
            item.disposal_method.clone(),
            item.reason.clone(),
            item.original_cost.to_string(),
            item.accumulated_depreciation.to_string(),
            item.net_book_value.to_string(),
            item.starting_auction_price.to_string(),
            item.actual_disposal_price.to_string(),
            item.disposal_cost.to_string(),
            item.net_gain_loss.to_string(),
            item.disposal_date.clone(),
            item.buyer_name.clone(),
            item.buyer_phone.clone(),
            item.council_leader.clone(),
            item.council_members.clone(),
            item.security_data_wipe_certified.to_string(),
            item.data_wipe_officer.clone(),
            item.status.clone(),
            item.notes.clone(),
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn export_escapes_csv_and_preserves_vietnamese_text() {
        let record: AssetDisposal = serde_json::from_value(json!({
            "key":"d-1","disposalCode":"TL-01","assetName":"Máy, tính \"A\"",
            "reason":"Thanh lý","unknownLegacyField":{"keep":true}
        }))
        .expect("legacy row deserializes");
        assert_eq!(record.extra["unknownLegacyField"]["keep"], true);
        let csv = String::from_utf8(disposal_csv(&[record])).expect("CSV UTF-8");
        assert!(csv.starts_with('\u{feff}'));
        assert!(csv.contains("\"Máy, tính \"\"A\"\"\""));
    }

    #[test]
    fn summary_totals_saturate_instead_of_overflowing_on_imported_values() {
        assert_eq!(total_money([i64::MAX, 1].into_iter()), i64::MAX);
        assert_eq!(total_money([i64::MIN, -1].into_iter()), i64::MIN);
    }
}
