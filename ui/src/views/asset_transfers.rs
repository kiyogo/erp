use crate::widgets;
use std::time::Duration;

use crate::{
    api::{
        ApiClient, ApiTask, AssetTransfer, AssetTransferMutationResponse, AssetTransfersResponse,
        CreateAssetTransfer,
    },
    models::Session,
};
use egui::{Color32, RichText, Ui};
use serde_json::Value;
use web_time::Instant;

const PAGE_SIZE: usize = 8;
const REFRESH_INTERVAL: Duration = Duration::from_secs(30);

#[derive(Default)]
struct TransferDraft {
    transfer_code: String,
    asset_code: String,
    asset_name: String,
    category: String,
    serial_no: String,
    original_price: String,
    net_book_value: String,
    from_location: String,
    from_department: String,
    from_custodian: String,
    to_location: String,
    to_department: String,
    to_custodian: String,
    carrier_name: String,
    tracking_code: String,
    shipping_cost: String,
    transfer_date: String,
    expected_delivery_date: String,
    reason: String,
    condition: String,
    notes: String,
}

impl TransferDraft {
    fn build(&self) -> Result<CreateAssetTransfer, String> {
        let original_price = parse_optional_amount(&self.original_price, "Nguyên giá")?;
        let net_book_value = parse_optional_amount(&self.net_book_value, "Giá trị còn lại")?;
        let shipping_cost = parse_optional_amount(&self.shipping_cost, "Cước phí")?.unwrap_or(0);
        if net_book_value
            .zip(original_price)
            .is_some_and(|(net, original)| net > original)
        {
            return Err("Giá trị còn lại không được lớn hơn nguyên giá.".to_owned());
        }
        Ok(CreateAssetTransfer {
            transfer_code: self.transfer_code.trim().to_owned(),
            asset_code: self.asset_code.trim().to_owned(),
            asset_name: self.asset_name.trim().to_owned(),
            category: self.category.trim().to_owned(),
            serial_no: self.serial_no.trim().to_owned(),
            original_price,
            net_book_value,
            from_location: self.from_location.trim().to_owned(),
            from_department: self.from_department.trim().to_owned(),
            from_custodian: self.from_custodian.trim().to_owned(),
            to_location: self.to_location.trim().to_owned(),
            to_department: self.to_department.trim().to_owned(),
            to_custodian: self.to_custodian.trim().to_owned(),
            carrier_name: self.carrier_name.trim().to_owned(),
            tracking_code: self.tracking_code.trim().to_owned(),
            shipping_cost,
            transfer_date: self.transfer_date.trim().to_owned(),
            expected_delivery_date: self.expected_delivery_date.trim().to_owned(),
            reason: self.reason.trim().to_owned(),
            condition: self.condition.trim().to_owned(),
            notes: self.notes.trim().to_owned(),
        })
    }
}

fn parse_optional_amount(value: &str, label: &str) -> Result<Option<i64>, String> {
    let trimmed = value
        .trim()
        .chars()
        .filter(|character| !matches!(character, ',' | '.' | ' '))
        .collect::<String>();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let amount = trimmed
        .parse::<i64>()
        .map_err(|_| format!("{label} phải là số nguyên không âm."))?;
    if amount < 0 {
        return Err(format!("{label} không được âm."));
    }
    Ok(Some(amount))
}

pub struct AssetTransfersView {
    transfers: Vec<AssetTransfer>,
    pending_load: Option<ApiTask<AssetTransfersResponse>>,
    pending_mutation: Option<ApiTask<AssetTransferMutationResponse>>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    needs_reload: bool,
    data_loaded: bool,
    search: String,
    status_filter: String,
    location_filter: String,
    page: usize,
    page_size: usize,
    form_open: bool,
    selected_key: Option<String>,
    draft: TransferDraft,
    reject_key: Option<String>,
    reject_reason: String,
    receive_key: Option<String>,
    receive_condition: String,
    notice: String,
    error: String,
}

impl Default for AssetTransfersView {
    fn default() -> Self {
        Self {
            transfers: Vec::new(),
            pending_load: None,
            pending_mutation: None,
            loaded_for: None,
            last_loaded: None,
            needs_reload: true,
            data_loaded: false,
            search: String::new(),
            status_filter: "Tất cả".to_owned(),
            location_filter: "Tất cả".to_owned(),
            page: 0,
            page_size: PAGE_SIZE,
            form_open: false,
            selected_key: None,
            draft: TransferDraft::default(),
            reject_key: None,
            reject_reason: String::new(),
            receive_key: None,
            receive_condition: String::new(),
            notice: String::new(),
            error: String::new(),
        }
    }
}

impl AssetTransfersView {
    fn is_busy(&self) -> bool {
        self.pending_load.is_some() || self.pending_mutation.is_some()
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        if self.is_busy() {
            self.needs_reload = true;
            return;
        }
        self.pending_load = Some(api.list_asset_transfers_task(session));
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
                    self.transfers = response.data;
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
                        .transfers
                        .iter_mut()
                        .find(|item| item.key == response.transfer.key)
                    {
                        *existing = response.transfer;
                    } else {
                        self.transfers.insert(0, response.transfer);
                    }
                    self.notice = "Đã lưu lệnh điều chuyển trên máy chủ.".to_owned();
                    self.form_open = false;
                    self.draft = TransferDraft::default();
                    self.reject_key = None;
                    self.reject_reason.clear();
                    self.receive_key = None;
                    self.receive_condition.clear();
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
            "Chỉ tài khoản ADMIN được lập và xử lý lệnh. Ghi nhận tiếp nhận xác thực người ghi nhận, không xác minh danh tính người nhận tại điểm đến.",
        );

        if self.data_loaded {
            let in_transit = self
                .transfers
                .iter()
                .filter(|item| item.status == "Đang vận chuyển")
                .count();
            let pending = self
                .transfers
                .iter()
                .filter(|item| item.status == "Chờ phê duyệt")
                .count();
            let completed = self
                .transfers
                .iter()
                .filter(|item| item.status == "Đã điều chuyển hoàn tất")
                .count();
            widgets::metrics_grid(
                ui,
                "asset-transfers.metrics",
                &[
                    widgets::Metric {
                        label: "Tổng lệnh",
                        value: if self.data_loaded {
                            (self.transfers.len()).to_string()
                        } else {
                            "—".to_owned()
                        },
                        detail: "Luân chuyển giữa các chi nhánh",
                        color: Color32::from_rgb(15, 23, 42),
                        value_size: 22.0,
                    },
                    widgets::Metric {
                        label: "Chờ phê duyệt",
                        value: if self.data_loaded {
                            (pending).to_string()
                        } else {
                            "—".to_owned()
                        },
                        detail: "Cần phê duyệt trước xuất kho",
                        color: Color32::from_rgb(217, 119, 6),
                        value_size: 22.0,
                    },
                    widgets::Metric {
                        label: "Đang vận chuyển",
                        value: if self.data_loaded {
                            (in_transit).to_string()
                        } else {
                            "—".to_owned()
                        },
                        detail: "Đang giao / chuyển phát",
                        color: Color32::from_rgb(37, 99, 235),
                        value_size: 22.0,
                    },
                    widgets::Metric {
                        label: "Hoàn tất",
                        value: if self.data_loaded {
                            (completed).to_string()
                        } else {
                            "—".to_owned()
                        },
                        detail: "Đã ghi nhận tiếp nhận tại nơi đến",
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
                ui.label("Đang tải lệnh điều chuyển…");
            });
        }

        if self.form_open && is_admin {
            self.render_form(ui, session, api, busy);
        }
        self.render_decision_forms(ui, session, api, busy, is_admin);
        self.render_filters(ui);
        ui.horizontal_wrapped(|ui| {
            if ui
                .add_enabled(!busy, egui::Button::new("Làm mới"))
                .clicked()
            {
                self.needs_reload = true;
            }
            if is_admin
                && ui
                    .add_enabled(
                        !busy,
                        egui::Button::new(
                            RichText::new("+ Lập lệnh điều chuyển")
                                .strong()
                                .color(Color32::WHITE),
                        )
                        .fill(Color32::from_rgb(0, 150, 136)),
                    )
                    .clicked()
            {
                self.draft = TransferDraft::default();
                self.form_open = true;
                self.notice.clear();
                self.error.clear();
            }

            ui.add_enabled(false, egui::Button::new("Xuất Excel"))
                .on_hover_text("Chưa có chức năng tạo tệp Excel cho nghiệp vụ này.");
        });
        self.render_table(ui, session, api, busy, is_admin);
        self.render_detail(ctx, session, api, busy, is_admin);
    }

    fn render_form(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient, busy: bool) {
        ui.add_space(8.0);
        let ctx = ui.ctx().clone();
        let (_, closed) = widgets::modal(
            &ctx,
            "asset-transfers.create",
            "Lập Lệnh Điều Chuyển Tài Sản Giữa Các Chi Nhánh",
            760.0,
            busy,
            |ui| {
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    ui.add_space(8.0);
                }

                ui.label("Không điền sẵn người, hãng vận chuyển, mã vận đơn hay giá trị tài sản chưa có dữ liệu.");
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
                            "Mã điều chuyển",
                            &mut self.draft.transfer_code,
                        );
                        field(
                            &mut columns[1 % column_count],
                            "Mã tài sản",
                            &mut self.draft.asset_code,
                        );
                        field(
                            &mut columns[2 % column_count],
                            "Tên tài sản",
                            &mut self.draft.asset_name,
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
                            "Phân loại",
                            &mut self.draft.category,
                        );
                        field(
                            &mut columns[1 % column_count],
                            "Serial / Tag",
                            &mut self.draft.serial_no,
                        );
                        field(
                            &mut columns[2 % column_count],
                            "Đơn vị vận chuyển",
                            &mut self.draft.carrier_name,
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
                            "Địa điểm gửi",
                            &mut self.draft.from_location,
                        );
                        field(
                            &mut columns[1 % column_count],
                            "Địa điểm nhận",
                            &mut self.draft.to_location,
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
                            "Phòng ban gửi",
                            &mut self.draft.from_department,
                        );
                        field(
                            &mut columns[1 % column_count],
                            "Phòng ban nhận",
                            &mut self.draft.to_department,
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
                            "Người bàn giao",
                            &mut self.draft.from_custodian,
                        );
                        field(
                            &mut columns[1 % column_count],
                            "Người phụ trách nhận (dự kiến)",
                            &mut self.draft.to_custodian,
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
                            "Ngày gửi (YYYY-MM-DD)",
                            &mut self.draft.transfer_date,
                        );
                        field(
                            &mut columns[1 % column_count],
                            "Ngày dự kiến đến",
                            &mut self.draft.expected_delivery_date,
                        );
                        field(
                            &mut columns[2 % column_count],
                            "Mã vận đơn / biển số",
                            &mut self.draft.tracking_code,
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
                            "Nguyên giá (VND, nếu biết)",
                            &mut self.draft.original_price,
                        );
                        field(
                            &mut columns[1 % column_count],
                            "Giá trị còn lại (nếu biết)",
                            &mut self.draft.net_book_value,
                        );
                        field(
                            &mut columns[2 % column_count],
                            "Cước vận chuyển (VND)",
                            &mut self.draft.shipping_cost,
                        );
                    },
                );
                field(ui, "Lý do điều chuyển", &mut self.draft.reason);
                field(ui, "Hiện trạng khi gửi", &mut self.draft.condition);
                field(ui, "Ghi chú", &mut self.draft.notes);
                ui.horizontal(|ui| {
                    if ui.add_enabled(!busy, egui::Button::new("Hủy")).clicked() {
                        self.form_open = false;
                    }
                    if ui
                        .add_enabled(
                            !busy,
                            egui::Button::new("Tạo lệnh · Chờ phê duyệt")
                                .fill(Color32::from_rgb(0, 150, 136)),
                        )
                        .clicked()
                    {
                        match self.draft.build() {
                            Ok(payload) => {
                                self.pending_mutation =
                                    Some(api.create_asset_transfer_task(session, &payload));
                                self.error.clear();
                                self.notice.clear();
                            }
                            Err(error) => self.error = error,
                        }
                    }
                });
            },
        );
        if closed {
            self.form_open = false;
        }
    }

    fn render_decision_forms(
        &mut self,
        ui: &mut Ui,
        session: &Session,
        api: &ApiClient,
        busy: bool,
        is_admin: bool,
    ) {
        if !is_admin {
            return;
        }
        if let Some(key) = self.reject_key.clone() {
            let ctx = ui.ctx().clone();
            let (_, closed) = widgets::modal(
                &ctx,
                "asset-transfers.reject",
                "Từ chối lệnh điều chuyển",
                480.0,
                busy,
                |ui| {
                    if !self.error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                        ui.add_space(8.0);
                    }

                    ui.label("Lý do sẽ được lưu cùng người xử lý và thời điểm từ máy chủ.");
                    ui.add(egui::TextEdit::multiline(&mut self.reject_reason).desired_rows(2));
                    ui.horizontal(|ui| {
                        if ui.add_enabled(!busy, egui::Button::new("Hủy")).clicked() {
                            self.reject_key = None;
                        }
                        if ui
                            .add_enabled(!busy, egui::Button::new("Xác nhận từ chối"))
                            .clicked()
                        {
                            if self.reject_reason.trim().is_empty() {
                                self.error = "Vui lòng nhập lý do từ chối.".to_owned();
                            } else {
                                self.pending_mutation = Some(api.reject_asset_transfer_task(
                                    session,
                                    &key,
                                    self.reject_reason.trim(),
                                ));
                            }
                        }
                    });
                },
            );
            if closed {
                self.reject_key = None;
            }
        }
        if let Some(key) = self.receive_key.clone() {
            let ctx = ui.ctx().clone();
            let (_, closed) = widgets::modal(
                &ctx,
                "asset-transfers.receive",
                "Ghi nhận tiếp nhận tại điểm đến",
                460.0,
                busy,
                |ui| {
                    if !self.error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                        ui.add_space(8.0);
                    }

                    ui.label("Thao tác xác nhận việc ghi nhận của tài khoản hiện tại; không xác thực người nhận được nêu trong lệnh.");
                    ui.add(
                        egui::TextEdit::multiline(&mut self.receive_condition)
                            .desired_rows(2)
                            .hint_text("Hiện trạng tài sản khi nhận"),
                    );
                    ui.horizontal(|ui| {
                        if ui.add_enabled(!busy, egui::Button::new("Hủy")).clicked() {
                            self.receive_key = None;
                        }
                        if ui
                            .add_enabled(
                                !busy,
                                egui::Button::new("Ghi nhận đã tiếp nhận")
                                    .fill(Color32::from_rgb(22, 163, 74)),
                            )
                            .clicked()
                        {
                            if self.receive_condition.trim().is_empty() {
                                self.error = "Vui lòng ghi hiện trạng khi tiếp nhận.".to_owned();
                            } else {
                                self.pending_mutation = Some(api.receive_asset_transfer_task(
                                    session,
                                    &key,
                                    self.receive_condition.trim(),
                                ));
                            }
                        }
                    });
                },
            );
            if closed {
                self.receive_key = None;
            }
        }
    }

    fn render_filters(&mut self, ui: &mut Ui) {
        ui.add_space(8.0);
        ui.horizontal_wrapped(|ui| {
            ui.label("Tìm:");
            {
                let (rect, _) = ui.allocate_exact_size(
                    egui::vec2(280.0_f32.min(ui.available_width()), 32.0),
                    egui::Sense::hover(),
                );
                widgets::search_input(
                    ui,
                    rect,
                    &mut self.search,
                    "Mã lệnh, tài sản, vận đơn, địa điểm",
                )
            };
            ui.label("Trạng thái:");
            widgets::combo_box("asset_transfer_status_filter")
                .selected_text(&self.status_filter)
                .show_ui(ui, |ui| {
                    for status in [
                        "Tất cả",
                        "Chờ phê duyệt",
                        "Đang vận chuyển",
                        "Đã điều chuyển hoàn tất",
                        "Từ chối điều chuyển",
                    ] {
                        ui.selectable_value(&mut self.status_filter, status.to_owned(), status);
                    }
                });
            ui.label("Địa điểm:");
            widgets::combo_box("asset_transfer_location_filter")
                .selected_text(&self.location_filter)
                .show_ui(ui, |ui| {
                    ui.selectable_value(&mut self.location_filter, "Tất cả".to_owned(), "Tất cả");
                    let mut locations = self
                        .transfers
                        .iter()
                        .flat_map(|item| [item.from_location.as_str(), item.to_location.as_str()])
                        .filter(|name| !name.trim().is_empty())
                        .collect::<Vec<_>>();
                    locations.sort_unstable();
                    locations.dedup();
                    for location in locations {
                        ui.selectable_value(
                            &mut self.location_filter,
                            location.to_owned(),
                            location,
                        );
                    }
                });
        });
    }

    fn render_table(
        &mut self,
        ui: &mut Ui,
        session: &Session,
        api: &ApiClient,
        busy: bool,
        is_admin: bool,
    ) {
        let query = self.search.trim().to_lowercase();
        let filtered = self
            .transfers
            .iter()
            .filter(|item| {
                let matches_query = query.is_empty()
                    || [
                        item.transfer_code.as_str(),
                        item.asset_code.as_str(),
                        item.asset_name.as_str(),
                        item.serial_no.as_str(),
                        item.from_location.as_str(),
                        item.to_location.as_str(),
                        item.to_custodian.as_str(),
                        item.tracking_code.as_str(),
                    ]
                    .iter()
                    .any(|value| value.to_lowercase().contains(&query));
                let matches_location = self.location_filter == "Tất cả"
                    || item.from_location == self.location_filter
                    || item.to_location == self.location_filter;
                matches_query
                    && matches_location
                    && (self.status_filter == "Tất cả" || self.status_filter == item.status)
            })
            .cloned()
            .collect::<Vec<_>>();
        let pages = filtered.len().div_ceil(self.page_size).max(1);
        self.page = self.page.min(pages - 1);
        let start = self.page * self.page_size;
        let end = (start + self.page_size).min(filtered.len());

        widgets::table_with_row_height(
            ui,
            "asset-transfers.table",
            &[
                widgets::TableColumn {
                    title: "Mã điều chuyển & Vận đơn",
                    width: 190.0,
                },
                widgets::TableColumn {
                    title: "Tài sản & Số Serial",
                    width: 260.0,
                },
                widgets::TableColumn {
                    title: "Lộ trình điều chuyển (Từ ➔ Đến)",
                    width: 300.0,
                },
                widgets::TableColumn {
                    title: "Thời gian & Cước phí",
                    width: 190.0,
                },
                widgets::TableColumn {
                    title: "Trạng thái",
                    width: 200.0,
                },
                widgets::TableColumn {
                    title: "Thao tác",
                    width: 250.0,
                },
            ],
            end.saturating_sub(start),
            92.0,
            |ui, row, column| {
                let item = &filtered[start + row];
                match column {
                    0 => {
                        ui.label(
                            RichText::new(&item.transfer_code)
                                .strong()
                                .color(Color32::from_rgb(0, 150, 136)),
                        );
                        ui.small(format!(
                            "{} · {}",
                            item.carrier_name,
                            empty_dash(&item.tracking_code)
                        ));
                    }
                    1 => {
                        ui.strong(&item.asset_name);
                        ui.small(format!(
                            "Mã: {} · SN: {}",
                            item.asset_code,
                            empty_dash(&item.serial_no)
                        ));
                    }
                    2 => {
                        ui.colored_label(
                            Color32::from_rgb(220, 38, 38),
                            format!("Từ: {} ({})", item.from_location, item.from_custodian),
                        );
                        ui.colored_label(
                            Color32::from_rgb(22, 163, 74),
                            format!("Đến: {} ({})", item.to_location, item.to_custodian),
                        );
                    }
                    3 => {
                        ui.label(format!("Gửi: {}", item.transfer_date));
                        ui.small(format!("Dự kiến: {}", item.expected_delivery_date));
                        ui.colored_label(
                            Color32::from_rgb(37, 99, 235),
                            format!("Cước: {} ₫", item.shipping_cost),
                        );
                    }
                    4 => {
                        widgets::tag(
                            ui,
                            &item.status,
                            match item.status.as_str() {
                                "Chờ phê duyệt" => widgets::TagTone::Warning,
                                "Đang vận chuyển" => widgets::TagTone::Processing,
                                "Từ chối điều chuyển" => widgets::TagTone::Error,
                                _ => widgets::TagTone::Success,
                            },
                        );
                        if has_legacy_import_marker(item) {
                            ui.small("Legacy · xem lịch sử xác minh");
                        }
                    }
                    5 => {
                        ui.horizontal_wrapped(|ui| {
                            if ui.button("Xem").clicked() {
                                self.selected_key = Some(item.key.clone());
                            }
                            if is_admin {
                                match item.status.as_str() {
                                    "Chờ phê duyệt" => {
                                        if ui
                                            .add_enabled(!busy, egui::Button::new("Duyệt"))
                                            .clicked()
                                        {
                                            self.pending_mutation = Some(
                                                api.approve_asset_transfer_task(session, &item.key),
                                            );
                                        }
                                        if ui
                                            .add_enabled(!busy, egui::Button::new("Từ chối"))
                                            .clicked()
                                        {
                                            self.reject_key = Some(item.key.clone());
                                            self.reject_reason.clear();
                                        }
                                    }
                                    "Đang vận chuyển" => {
                                        if ui
                                            .add_enabled(
                                                !busy,
                                                egui::Button::new("Ghi nhận nhận hàng"),
                                            )
                                            .clicked()
                                        {
                                            self.receive_key = Some(item.key.clone());
                                            self.receive_condition.clear();
                                        }
                                    }
                                    _ => {}
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
            "asset-transfers.pagination",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );
    }
    fn render_detail(
        &mut self,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        busy: bool,
        is_admin: bool,
    ) {
        let Some(item) = self
            .selected_key
            .as_deref()
            .and_then(|key| self.transfers.iter().find(|item| item.key == key))
            .cloned()
        else {
            return;
        };
        let (_, closed) = widgets::drawer(
            ctx,
            "asset-transfers.detail",
            "Lệnh Điều Chuyển Tài Sản & Lộ Trình Vận Tải",
            580.0,
            |ui| {
                ui.vertical_centered(|ui| {
                    ui.heading("LỆNH ĐIỀU CHUYỂN TÀI SẢN NỘI BỘ");
                    ui.label(format!(
                        "Mã số: {} · Ngày lập: {}",
                        item.transfer_code, item.transfer_date
                    ));
                });
                ui.add_space(12.0);
                widgets::tag(ui, &item.status, widgets::TagTone::Processing);
                ui.strong(&item.asset_name);
                ui.label(format!(
                    "Mã tài sản: {} · Serial: {}",
                    item.asset_code,
                    empty_dash(&item.serial_no)
                ));
                ui.label(format!(
                    "Từ: {} · {}",
                    item.from_location, item.from_custodian
                ));
                ui.label(format!("Đến: {} · {}", item.to_location, item.to_custodian));
                ui.label(format!(
                    "Vận chuyển: {} · Vận đơn: {}",
                    item.carrier_name,
                    empty_dash(&item.tracking_code)
                ));
                ui.label(format!(
                    "Gửi: {} · Dự kiến: {}",
                    item.transfer_date, item.expected_delivery_date
                ));
                if has_legacy_import_marker(&item) {
                    ui.colored_label(Color32::from_rgb(180,83,9),"Lịch sử legacy được giữ nguyên; chỉ sự kiện có tài khoản Rust mới được xác minh.");
                }

                ui.label(format!("Lý do: {}", item.reason));
                ui.label(format!(
                    "Phòng ban: {} → {}",
                    item.from_department, item.to_department
                ));
                ui.label(format!(
                    "Nguyên giá: {} · Giá trị còn lại: {} · Cước: {} VND",
                    amount(item.original_price),
                    amount(item.net_book_value),
                    item.shipping_cost
                ));
                ui.label(format!("Hiện trạng gửi: {}", empty_dash(&item.condition)));
                if let Some(at) = &item.approved_at {
                    let approver = item
                        .approved_by_name
                        .as_deref()
                        .unwrap_or(item.approver.as_str());
                    if has_legacy_import_marker(&item) && !has_verified_approval_event(&item) {
                        ui.colored_label(
                            Color32::from_rgb(180, 83, 9),
                            format!(
                                "Legacy khai báo duyệt lúc {at} · {} · CHƯA XÁC MINH",
                                empty_dash(approver)
                            ),
                        );
                    } else {
                        ui.label(format!("Duyệt lúc {at} · {}", empty_dash(approver)));
                    }
                }
                if let Some(reason) = &item.rejection_reason {
                    ui.label(format!("Lý do từ chối: {reason}"));
                }
                if let Some(at) = &item.received_date {
                    let recorder = item
                        .receipt_recorded_by_name
                        .as_deref()
                        .unwrap_or("tài khoản ADMIN");
                    if has_legacy_import_marker(&item) && !has_verified_receipt_event(&item) {
                        ui.colored_label(
                            Color32::from_rgb(180, 83, 9),
                            format!(
                                "Legacy khai báo nhận hàng lúc {at} · {} · CHƯA XÁC MINH",
                                empty_dash(recorder)
                            ),
                        );
                    } else {
                        ui.label(format!("Ghi nhận tiếp nhận lúc {at} bởi {recorder}"));
                    }
                    ui.label(format!(
                        "Hiện trạng khi tiếp nhận: {}",
                        item.receive_condition.as_deref().unwrap_or("—")
                    ));
                }
                if !item.notes.trim().is_empty() {
                    ui.label(format!("Ghi chú: {}", item.notes));
                }

                ui.add_space(12.0);
                ui.add_enabled(false, egui::Button::new("In lệnh điều chuyển (PDF)"))
                    .on_hover_text("Chưa có chức năng tạo PDF lệnh điều chuyển.");
                ui.horizontal_wrapped(|ui| {
                    if is_admin {
                        match item.status.as_str() {
                            "Chờ phê duyệt" => {
                                if ui.add_enabled(!busy, egui::Button::new("Duyệt")).clicked() {
                                    self.pending_mutation =
                                        Some(api.approve_asset_transfer_task(session, &item.key));
                                }
                                if ui
                                    .add_enabled(!busy, egui::Button::new("Từ chối"))
                                    .clicked()
                                {
                                    self.reject_key = Some(item.key.clone());
                                    self.reject_reason.clear();
                                }
                            }
                            "Đang vận chuyển" => {
                                if ui
                                    .add_enabled(!busy, egui::Button::new("Ghi nhận nhận hàng"))
                                    .clicked()
                                {
                                    self.receive_key = Some(item.key.clone());
                                    self.receive_condition.clear();
                                }
                            }
                            _ => {}
                        }
                    }
                });
            },
        );
        if closed {
            self.selected_key = None;
        }
    }
}

fn has_legacy_import_marker(item: &AssetTransfer) -> bool {
    item.extra
        .get("_kiyoLegacyImport")
        .and_then(Value::as_object)
        .is_some_and(|marker| {
            marker.get("format").and_then(Value::as_str) == Some("kiyovn-legacy-asset-transfers")
                && marker.get("verification").and_then(Value::as_str) == Some("unverified")
        })
}

fn has_verified_approval_event(item: &AssetTransfer) -> bool {
    item.extra
        .get("approvedByUserId")
        .and_then(Value::as_str)
        .is_some_and(|id| !id.trim().is_empty())
}

fn has_verified_receipt_event(item: &AssetTransfer) -> bool {
    item.extra
        .get("receiptRecordedByUserId")
        .and_then(Value::as_str)
        .is_some_and(|id| !id.trim().is_empty())
        && item.extra.get("receiptMethod").and_then(Value::as_str)
            == Some("authenticated_admin_record")
}

fn field(ui: &mut Ui, label: &str, value: &mut String) {
    if label.starts_with("Ngày") {
        widgets::form_date(ui, label, label, true, value);
    } else {
        widgets::form_input(ui, label, label, false, value, "", false);
    }
}

fn status_color(status: &str) -> Color32 {
    match status {
        "Chờ phê duyệt" => Color32::from_rgb(217, 119, 6),
        "Đang vận chuyển" => Color32::from_rgb(37, 99, 235),
        "Đã điều chuyển hoàn tất" => Color32::from_rgb(22, 163, 74),
        "Từ chối điều chuyển" => Color32::from_rgb(185, 28, 28),
        _ => Color32::DARK_GRAY,
    }
}

fn amount(value: Option<i64>) -> String {
    value
        .map(|number| format!("{number} VND"))
        .unwrap_or_else(|| "chưa khai báo".to_owned())
}

fn empty_dash(value: &str) -> &str {
    if value.trim().is_empty() {
        "—"
    } else {
        value
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn optional_amount_parser_accepts_grouped_vnd_and_empty_values() {
        assert_eq!(
            parse_optional_amount(" 30.000.000 ", "amount"),
            Ok(Some(30_000_000))
        );
        assert_eq!(parse_optional_amount("", "amount"), Ok(None));
        assert!(parse_optional_amount("-1", "amount").is_err());
        assert!(parse_optional_amount("abc", "amount").is_err());
    }

    #[test]
    fn transfer_draft_does_not_invent_asset_values() {
        let payload = TransferDraft::default()
            .build()
            .expect("empty optional money fields are valid");
        assert_eq!(payload.original_price, None);
        assert_eq!(payload.net_book_value, None);
        assert_eq!(payload.shipping_cost, 0);
    }

    #[test]
    fn imported_legacy_claims_are_unverified_until_rust_records_authenticated_events() {
        let mut item: AssetTransfer = serde_json::from_value(json!({
            "key":"legacy-transfer", "status":"Đã điều chuyển hoàn tất",
            "approvedAt":"2026-10-08 15:00", "approver":"Legacy free text",
            "receivedDate":"2026-10-09 09:00", "receiptRecordedByName":"tài khoản ADMIN",
            "_kiyoLegacyImport":{"format":"kiyovn-legacy-asset-transfers","verification":"unverified"}
        })).expect("legacy transfer DTO");
        assert!(has_legacy_import_marker(&item));
        assert!(!has_verified_approval_event(&item));
        assert!(!has_verified_receipt_event(&item));

        item.extra
            .insert("approvedByUserId".into(), json!("admin-1"));
        item.extra
            .insert("receiptRecordedByUserId".into(), json!("admin-1"));
        item.extra
            .insert("receiptMethod".into(), json!("authenticated_admin_record"));
        assert!(has_verified_approval_event(&item));
        assert!(has_verified_receipt_event(&item));
    }
}
