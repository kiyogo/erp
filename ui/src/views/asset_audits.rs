use crate::widgets;
use std::time::Duration;

use crate::{
    api::{
        ApiClient, ApiTask, AssetAudit, AssetAuditResponse, AssetAuditsResponse, CreateAssetAudit,
        OrgUnitsResponse, RecordAssetAuditScan, SubmitAssetAuditResolution,
    },
    models::Session,
};
use chrono::{Datelike, Duration as ChronoDuration, Local, NaiveDate};
use egui::{Color32, RichText, Ui, Vec2};
use egui_extras::{Column, TableBuilder};
use web_time::Instant;

const PAGE_SIZE: usize = 8;
const REFRESH_INTERVAL: Duration = Duration::from_secs(30);
const STATUS_IN_PROGRESS: &str = "Đang tiến hành kiểm đếm";
const STATUS_RECONCILE: &str = "Chờ đối soát & Giải trình";
const STATUS_COMPLETED: &str = "Đã hoàn tất & Khớp 100%";
const STATUS_SUBMITTED: &str = "Đã trình HĐQT phê duyệt";

#[derive(Default)]
struct AuditDraft {
    audit_code: String,
    audit_name: String,
    audit_type: String,
    scope: String,
    location: String,
    department: String,
    start_date: String,
    end_date: String,
    auditor_leader: String,
    auditor_members: String,
    notes: String,
}

impl AuditDraft {
    fn new(sequence: usize) -> Self {
        let today = Local::now().date_naive();
        let end = today
            .checked_add_signed(ChronoDuration::days(5))
            .unwrap_or(today);
        Self {
            audit_code: format!("KK-{}-Q{}-0{}", today.year(), sequence, sequence),
            audit_type: "Định kỳ quý/năm".to_owned(),
            scope: "Trụ sở chính Hà Nội".to_owned(),
            location: "Tòa nhà Keangnam Landmark 72".to_owned(),
            department: "Toàn bộ công ty".to_owned(),
            start_date: today.format("%Y-%m-%d").to_string(),
            end_date: end.format("%Y-%m-%d").to_string(),
            ..Self::default()
        }
    }

    fn build(&self) -> Result<CreateAssetAudit, String> {
        let required = [
            ("Mã đợt kiểm kê", &self.audit_code),
            ("Tên đợt kiểm kê", &self.audit_name),
            ("Phạm vi", &self.scope),
            ("Địa điểm lọc", &self.location),
            ("Trưởng ban kiểm kê", &self.auditor_leader),
            ("Thành viên kiểm kê", &self.auditor_members),
            ("Ngày bắt đầu", &self.start_date),
            ("Ngày kết thúc", &self.end_date),
        ];
        if let Some((label, _)) = required.iter().find(|(_, value)| value.trim().is_empty()) {
            return Err(format!("Vui lòng nhập {label}."));
        }
        if ![
            "Định kỳ quý/năm",
            "Đột xuất chuyên đề",
            "Bàn giao quản lý kho",
        ]
        .contains(&self.audit_type.as_str())
        {
            return Err("Vui lòng chọn loại kiểm kê.".to_owned());
        }
        let start = NaiveDate::parse_from_str(self.start_date.trim(), "%Y-%m-%d")
            .ok()
            .ok_or_else(|| "Ngày bắt đầu phải theo định dạng YYYY-MM-DD.".to_owned())?;
        let end = NaiveDate::parse_from_str(self.end_date.trim(), "%Y-%m-%d")
            .ok()
            .ok_or_else(|| "Ngày kết thúc phải theo định dạng YYYY-MM-DD.".to_owned())?;
        if end < start {
            return Err("Ngày kết thúc không thể trước ngày bắt đầu.".to_owned());
        }
        Ok(CreateAssetAudit {
            audit_code: self.audit_code.trim().to_owned(),
            audit_name: self.audit_name.trim().to_owned(),
            audit_type: self.audit_type.clone(),
            scope: self.scope.trim().to_owned(),
            location: self.location.trim().to_owned(),
            department: self.department.trim().to_owned(),
            start_date: self.start_date.trim().to_owned(),
            end_date: self.end_date.trim().to_owned(),
            auditor_leader: self.auditor_leader.trim().to_owned(),
            auditor_members: self.auditor_members.trim().to_owned(),
            notes: self.notes.trim().to_owned(),
        })
    }
}

#[derive(Clone, Copy)]
enum MutationKind {
    Create,
    Scan,
    Close,
    Resolution,
}

pub struct AssetAuditsView {
    audits: Vec<AssetAudit>,
    pending_load: Option<ApiTask<AssetAuditsResponse>>,
    pending_detail: Option<ApiTask<AssetAuditResponse>>,
    pending_mutation: Option<(MutationKind, ApiTask<AssetAuditResponse>)>,
    pending_departments: Option<ApiTask<OrgUnitsResponse>>,
    pending_download: Option<ApiTask<bool>>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    needs_reload: bool,
    data_loaded: bool,
    search: String,
    status_filter: String,
    type_filter: String,
    page: usize,
    page_size: usize,
    form_open: bool,
    draft: AuditDraft,
    detail: Option<AssetAudit>,
    detail_open: bool,
    scanner_open: bool,
    resolution_open: bool,
    open_scanner_after_detail: bool,
    open_resolution_after_detail: bool,
    department_options: Vec<String>,
    scan_code: String,
    resolution_proposal: String,
    notice: String,
    error: String,
}

impl Default for AssetAuditsView {
    fn default() -> Self {
        Self {
            audits: Vec::new(),
            pending_load: None,
            pending_detail: None,
            pending_mutation: None,
            pending_departments: None,
            pending_download: None,
            loaded_for: None,
            last_loaded: None,
            needs_reload: true,
            data_loaded: false,
            search: String::new(),
            status_filter: "Tất cả".to_owned(),
            type_filter: "Tất cả".to_owned(),
            page: 0,
            page_size: PAGE_SIZE,
            form_open: false,
            draft: AuditDraft::default(),
            detail: None,
            detail_open: false,
            scanner_open: false,
            resolution_open: false,
            open_scanner_after_detail: false,
            open_resolution_after_detail: false,
            department_options: Vec::new(),
            scan_code: String::new(),
            resolution_proposal: String::new(),
            notice: String::new(),
            error: String::new(),
        }
    }
}

impl AssetAuditsView {
    fn is_busy(&self) -> bool {
        self.pending_load.is_some()
            || self.pending_detail.is_some()
            || self.pending_mutation.is_some()
            || self.pending_departments.is_some()
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        if self.is_busy() {
            self.needs_reload = true;
            return;
        }
        self.pending_load = Some(api.list_asset_audits_task(session));
        self.needs_reload = false;
        self.error.clear();
    }

    fn request_detail(
        &mut self,
        session: &Session,
        api: &ApiClient,
        key: &str,
        scanner: bool,
        resolution: bool,
    ) {
        self.pending_detail = Some(api.get_asset_audit_task(session, key));
        self.error.clear();
        self.open_scanner_after_detail = scanner;
        self.open_resolution_after_detail = resolution;
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
        if self.form_open
            && self.department_options.is_empty()
            && self.pending_departments.is_none()
        {
            self.pending_departments = Some(api.list_org_units_task(session));
        }
        if let Some(result) = self.pending_departments.as_ref().and_then(ApiClient::poll) {
            self.pending_departments = None;
            if let Ok(response) = result {
                self.department_options = response
                    .data
                    .into_iter()
                    .map(|unit| unit.name)
                    .filter(|name| !name.trim().is_empty())
                    .collect();
                self.department_options.sort();
                self.department_options.dedup();
            }
        }
        if let Some(result) = self.pending_load.as_ref().and_then(ApiClient::poll) {
            self.pending_load = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.audits = response.data;
                    self.data_loaded = true;
                    if let Some(detail) = &self.detail {
                        if let Some(updated) =
                            self.audits.iter().find(|item| item.key == detail.key)
                        {
                            self.detail = Some(updated.clone());
                        }
                    }
                    self.error.clear();
                }
                Err(error) => {
                    self.data_loaded = false;
                    self.error = error;
                }
            }
        }
        if let Some(result) = self.pending_detail.as_ref().and_then(ApiClient::poll) {
            self.pending_detail = None;
            match result {
                Ok(response) => {
                    self.detail = Some(response.audit);
                    self.detail_open = true;
                    self.scanner_open = self.open_scanner_after_detail;
                    self.resolution_open = self.open_resolution_after_detail;
                    self.open_scanner_after_detail = false;
                    self.open_resolution_after_detail = false;
                    self.scan_code.clear();
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some((kind, task)) = &self.pending_mutation
            && let Some(result) = ApiClient::poll(task)
        {
            let kind = *kind;
            self.pending_mutation = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.replace_audit(response.audit.clone());
                    let should_close_after_scan = matches!(kind, MutationKind::Scan)
                        && session.user.role == "ADMIN"
                        && should_auto_close(&response.audit, Local::now().date_naive());
                    self.detail = Some(response.audit.clone());
                    self.notice = if should_close_after_scan {
                        String::new()
                    } else {
                        match kind {
                            MutationKind::Create => "Đã tạo đợt kiểm kê từ snapshot danh mục tài sản.".to_owned(),
                            MutationKind::Scan => "Đã lưu mã và người ghi nhận trên máy chủ.".to_owned(),
                            MutationKind::Close => "Đã khóa kiểm đếm và đối soát theo snapshot.".to_owned(),
                            MutationKind::Resolution => "Đã lưu phương án với trạng thái trình duyệt; chưa có quyết định phê duyệt.".to_owned(),
                        }
                    };
                    if matches!(kind, MutationKind::Create) {
                        self.form_open = false;
                        self.draft = AuditDraft::default();
                    }
                    if matches!(kind, MutationKind::Scan) {
                        self.scan_code.clear();
                    }
                    if matches!(kind, MutationKind::Resolution) {
                        self.resolution_proposal.clear();
                    }
                    if should_close_after_scan {
                        self.pending_mutation = Some((
                            MutationKind::Close,
                            api.close_asset_audit_task(session, &response.audit.key),
                        ));
                    }
                    self.error.clear();
                }
                Err(error) => {
                    self.error = error;
                    self.needs_reload = true;
                }
            }
        }
        if self.pending_mutation.is_none() && self.data_loaded && session.user.role == "ADMIN" {
            let today = Local::now().date_naive();
            if let Some(audit) = self
                .audits
                .iter()
                .find(|audit| should_auto_close(audit, today))
            {
                self.pending_mutation = Some((
                    MutationKind::Close,
                    api.close_asset_audit_task(session, &audit.key),
                ));
            }
        }
        if let Some(result) = self.pending_download.as_ref().and_then(ApiClient::poll) {
            self.pending_download = None;
            match result {
                Ok(true) => self.notice = "Đã tạo tệp CSV kiểm kê.".to_owned(),
                Ok(false) => {}
                Err(error) => self.error = error,
            }
        }
        if self.is_busy() {
            ctx.request_repaint_after(Duration::from_millis(80));
        } else if let Some(last) = self.last_loaded {
            ctx.request_repaint_after(REFRESH_INTERVAL.saturating_sub(last.elapsed()));
        }
    }

    fn replace_audit(&mut self, audit: AssetAudit) {
        if let Some(item) = self.audits.iter_mut().find(|item| item.key == audit.key) {
            *item = audit;
        } else {
            self.audits.insert(0, audit);
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.poll(ctx, session, api);
        let busy = self.is_busy();
        let is_admin = session.user.role == "ADMIN";
        let total_book = self.audits.iter().map(|item| item.book_count).sum::<i64>();
        let total_actual = self
            .audits
            .iter()
            .map(|item| item.actual_count)
            .sum::<i64>();
        let total_discrepancy = self
            .audits
            .iter()
            .filter(|item| item.closed_at.is_some())
            .map(|item| item.discrepancy.abs())
            .sum::<i64>();
        let book_value = self.audits.iter().map(|item| item.book_value).sum::<i64>();
        let progress = if total_book == 0 {
            0.0
        } else {
            total_actual as f64 / total_book as f64 * 100.0
        };
        ui.add_space(16.0);
        widgets::metrics_grid(
            ui,
            "asset-audits.metrics",
            &[
                widgets::Metric {
                    label: "Tài sản đã kiểm kê thực tế",
                    value: if self.data_loaded {
                        format!("{total_actual} / {total_book} máy")
                    } else {
                        "—".to_owned()
                    },
                    detail: &(format!("Tiến độ kiểm đếm: {progress:.0}%")),
                    color: Color32::from_rgb(15, 23, 42),
                    value_size: 22.0,
                },
                widgets::Metric {
                    label: "Độ chính xác sổ sách",
                    value: if self.data_loaded {
                        audit_accuracy(&self.audits)
                            .map(|value| format!("{value:.1}% độ khớp"))
                            .unwrap_or_else(|| "Chưa có dữ liệu".to_owned())
                    } else {
                        "—".to_owned()
                    },
                    detail: "Đối chiếu snapshot danh mục và mã đã quét",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 22.0,
                },
                widgets::Metric {
                    label: "Chênh lệch cần giải trình",
                    value: if self.data_loaded {
                        format!("{total_discrepancy} thiết bị lệch")
                    } else {
                        "—".to_owned()
                    },
                    detail: &(if total_discrepancy > 0 {
                        "Cần lập biên bản đối soát".to_owned()
                    } else {
                        "Không có chênh lệch tồn đọng".to_owned()
                    }),
                    color: if total_discrepancy > 0 {
                        Color32::from_rgb(220, 38, 38)
                    } else {
                        Color32::from_rgb(22, 163, 74)
                    },
                    value_size: 22.0,
                },
                widgets::Metric {
                    label: "Tổng giá trị kiểm kê",
                    value: if self.data_loaded {
                        format!("{:.2} tỷ ₫", book_value as f64 / 1_000_000_000.0)
                    } else {
                        "—".to_owned()
                    },
                    detail: &(format!("{} đợt kiểm kê quy mô lớn", self.audits.len())),
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 22.0,
                },
            ],
            egui::vec2(16.0, 16.0),
            240.0,
            4.0,
        );
        self.render_toolbar(ui, busy, is_admin);
        self.render_audits(ui, session, api, busy, is_admin);
        if self.form_open && is_admin {
            self.render_create_form(ctx, session, api, busy);
        }
        if let Some(detail) = self.detail.clone()
            && self.detail_open
        {
            self.render_detail(ctx, busy, detail);
        }
        if let Some(detail) = self.detail.clone()
            && self.scanner_open
        {
            self.render_scanner(ctx, session, api, busy, &detail);
        }
        if let Some(detail) = self.detail.clone()
            && self.resolution_open
        {
            self.render_resolution(ctx, session, api, busy, &detail);
        }
        self.render_notice(ctx);
    }

    fn render_toolbar(&mut self, ui: &mut Ui, busy: bool, is_admin: bool) {
        ui.add_space(8.0);
        ui.horizontal_wrapped(|ui| {
            ui.horizontal_wrapped(|ui| {
                ui.label(
                    RichText::new("⌕")
                        .size(16.0)
                        .color(Color32::from_rgb(187, 187, 187)),
                );
                {
                    let (rect, _) = ui.allocate_exact_size(
                        egui::vec2(340.0_f32.min(ui.available_width()), 32.0),
                        egui::Sense::hover(),
                    );
                    widgets::search_input(
                        ui,
                        rect,
                        &mut self.search,
                        "Tìm theo mã đợt, tên kiểm kê, địa điểm, trưởng đoàn...",
                    )
                };
                if !self.search.is_empty() && ui.small_button("×").clicked() {
                    self.search.clear();
                } else if self.search.is_empty() {
                    ui.add_space(22.0);
                }
                widgets::combo_box("asset_audit_status_filter")
                    .width(190.0)
                    .selected_text(if self.status_filter == "Tất cả" {
                        "Tất cả trạng thái"
                    } else {
                        &self.status_filter
                    })
                    .show_ui(ui, |ui| {
                        for value in [
                            "Tất cả trạng thái",
                            STATUS_IN_PROGRESS,
                            STATUS_RECONCILE,
                            STATUS_COMPLETED,
                            STATUS_SUBMITTED,
                        ] {
                            let stored = if value == "Tất cả trạng thái" {
                                "Tất cả"
                            } else {
                                value
                            };
                            ui.selectable_value(&mut self.status_filter, stored.to_owned(), value);
                        }
                    });
                widgets::combo_box("asset_audit_type_filter")
                    .width(170.0)
                    .selected_text(if self.type_filter == "Tất cả" {
                        "Tất cả phân loại"
                    } else {
                        &self.type_filter
                    })
                    .show_ui(ui, |ui| {
                        for value in [
                            "Tất cả phân loại",
                            "Định kỳ quý/năm",
                            "Đột xuất chuyên đề",
                            "Bàn giao quản lý kho",
                        ] {
                            let stored = if value == "Tất cả phân loại" {
                                "Tất cả"
                            } else {
                                value
                            };
                            ui.selectable_value(&mut self.type_filter, stored.to_owned(), value);
                        }
                    });
            });
            widgets::action_row(ui, |ui| {
                if is_admin
                    && ui
                        .add_enabled(
                            !busy,
                            egui::Button::new(
                                RichText::new("+  Mở đợt kiểm kê mới")
                                    .strong()
                                    .color(Color32::WHITE),
                            )
                            .fill(Color32::from_rgb(0, 150, 136)),
                        )
                        .clicked()
                {
                    self.form_open = true;
                    self.draft = AuditDraft::new(self.audits.len() + 1);
                    self.notice.clear();
                    self.error.clear();
                }
                if ui.button("⇩  Xuất dữ liệu kiểm kê (.csv)").clicked() {
                    let bytes = audit_csv(&self.audits);
                    self.pending_download = Some(crate::file_transfer::save_download_task(
                        "mau-05-tscd.csv".to_owned(),
                        bytes,
                    ));
                }
            });
        });
        ui.add_space(12.0);
    }

    fn render_notice(&mut self, ctx: &egui::Context) {
        let (message, color, is_error) = if !self.error.is_empty() {
            (self.error.clone(), Color32::from_rgb(254, 226, 226), true)
        } else if !self.notice.is_empty() {
            (self.notice.clone(), Color32::from_rgb(220, 252, 231), false)
        } else {
            return;
        };
        let mut dismiss = false;
        egui::Area::new(egui::Id::new("asset_audit_message"))
            .anchor(egui::Align2::RIGHT_TOP, Vec2::new(-18.0, 18.0))
            .order(egui::Order::Foreground)
            .show(ctx, |ui| {
                egui::Frame::popup(ui.style()).fill(color).show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.label(&message);
                        if ui.small_button("×").clicked() {
                            dismiss = true;
                        }
                    });
                });
            });
        if dismiss {
            if is_error {
                self.error.clear();
            } else {
                self.notice.clear();
            }
        }
    }

    fn render_create_form(
        &mut self,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        busy: bool,
    ) {
        let mut open = self.form_open;
        let (_, closed) = widgets::modal(
            ctx,
            "asset-audits-0",
            "Khởi Tạo Đợt Kiểm Kê Tài Sản & Thiết Bị Mới",
            760.0,
            busy,
            |ui| {
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    ui.add_space(8.0);
                }

                ui.add_space(8.0);
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        3
                    },
                    |columns| {
                        let column_count = columns.len();
                        field_with_hint(
                            &mut columns[0 % column_count],
                            "Mã đợt kiểm kê",
                            &mut self.draft.audit_code,
                            "Ví dụ: KK-2026-Q3-HN",
                        );
                        egui::ComboBox::from_label("Phân loại đợt kiểm kê")
                            .selected_text(&self.draft.audit_type)
                            .show_ui(&mut columns[1 % column_count], |ui| {
                                for value in [
                                    "Định kỳ quý/năm",
                                    "Đột xuất chuyên đề",
                                    "Bàn giao quản lý kho",
                                ] {
                                    ui.selectable_value(
                                        &mut self.draft.audit_type,
                                        value.to_owned(),
                                        value,
                                    );
                                }
                            });
                        egui::ComboBox::from_label("Phạm vi kiểm kê")
                            .selected_text(&self.draft.scope)
                            .show_ui(&mut columns[2 % column_count], |ui| {
                                for value in [
                                    "Toàn bộ công ty",
                                    "Trụ sở chính Hà Nội",
                                    "Chi nhánh TP.HCM",
                                    "Data Center IDC Viettel & FPT",
                                ] {
                                    ui.selectable_value(
                                        &mut self.draft.scope,
                                        value.to_owned(),
                                        value,
                                    );
                                }
                            });
                    },
                );
                field_with_hint(
                    ui,
                    "Tên đợt kiểm kê tài sản",
                    &mut self.draft.audit_name,
                    "Ví dụ: Kiểm kê toàn bộ máy tính, màn hình và hạ tầng Data Center Quý 3/2026",
                );
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        2
                    },
                    |columns| {
                        let column_count = columns.len();
                        field_with_hint(
                            &mut columns[0 % column_count],
                            "Địa điểm kiểm kê cụ thể",
                            &mut self.draft.location,
                            "Ví dụ: Tòa nhà Keangnam Landmark 72 - Tầng 12 & 14",
                        );
                        egui::ComboBox::from_label("Phòng ban chịu trách nhiệm")
                            .selected_text(if self.draft.department.is_empty() {
                                "Toàn bộ công ty"
                            } else {
                                &self.draft.department
                            })
                            .show_ui(&mut columns[1 % column_count], |ui| {
                                if self.department_options.is_empty() {
                                    ui.selectable_value(
                                        &mut self.draft.department,
                                        "Ban Giám Đốc".to_owned(),
                                        "Ban Giám Đốc",
                                    );
                                } else {
                                    for department in &self.department_options {
                                        ui.selectable_value(
                                            &mut self.draft.department,
                                            department.clone(),
                                            department,
                                        );
                                    }
                                }
                            });
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
                        field_with_hint(
                            &mut columns[0 % column_count],
                            "Trưởng ban kiểm kê",
                            &mut self.draft.auditor_leader,
                            "Ví dụ: Trần Tuấn Anh (CTO)",
                        );
                        field_with_hint(
                            &mut columns[1 % column_count],
                            "Thành viên ban kiểm kê",
                            &mut self.draft.auditor_members,
                            "Ví dụ: Nguyễn Thị Mai (Kế toán), Lê Hoàng Yến (HR)",
                        );
                    },
                );
                let mut book_count_placeholder = "Tự động từ danh mục".to_owned();
                let mut book_value_placeholder = "Tự động từ danh mục".to_owned();
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        4
                    },
                    |columns| {
                        let column_count = columns.len();
                        columns[0 % column_count].add_enabled_ui(false, |ui| {
                            field(ui, "Số lượng theo sổ", &mut book_count_placeholder)
                        });
                        columns[1 % column_count].add_enabled_ui(false, |ui| {
                            field(ui, "Tổng nguyên giá sổ (VNĐ)", &mut book_value_placeholder)
                        });
                        field(
                            &mut columns[2 % column_count],
                            "Ngày bắt đầu",
                            &mut self.draft.start_date,
                        );
                        field(
                            &mut columns[3 % column_count],
                            "Ngày kết thúc",
                            &mut self.draft.end_date,
                        );
                    },
                );
                field_with_hint(
                    ui,
                    "Ghi chú & Chỉ đạo kiểm kê",
                    &mut self.draft.notes,
                    "Yêu cầu kiểm tra kỹ số Serial, tình trạng dán tem niêm phong và đối chiếu người đang giữ máy",
                );
                widgets::action_row(ui, |ui| {
                    if ui
                        .add_enabled(
                            !busy,
                            egui::Button::new("Xác nhận mở đợt kiểm kê")
                                .fill(Color32::from_rgb(0, 150, 136)),
                        )
                        .clicked()
                    {
                        match self.draft.build() {
                            Ok(payload) => {
                                self.pending_mutation = Some((
                                    MutationKind::Create,
                                    api.create_asset_audit_task(session, &payload),
                                ));
                                self.error.clear();
                                self.notice.clear();
                            }
                            Err(error) => self.error = error,
                        }
                    }
                    if ui.add_enabled(!busy, egui::Button::new("Hủy bỏ")).clicked() {
                        self.form_open = false;
                    }
                });
            },
        );
        open &= !closed;
        self.form_open &= open;
    }

    fn render_audits(
        &mut self,
        ui: &mut Ui,
        session: &Session,
        api: &ApiClient,
        busy: bool,
        is_admin: bool,
    ) {
        let query = self.search.trim().to_lowercase();
        let filtered = self
            .audits
            .iter()
            .filter(|item| {
                let matches_search = query.is_empty()
                    || [
                        item.audit_code.as_str(),
                        item.audit_name.as_str(),
                        item.location.as_str(),
                        item.scope.as_str(),
                        item.auditor_leader.as_str(),
                    ]
                    .iter()
                    .any(|value| value.to_lowercase().contains(&query));
                matches_search
                    && (self.status_filter == "Tất cả" || item.status == self.status_filter)
                    && (self.type_filter == "Tất cả" || item.audit_type == self.type_filter)
            })
            .cloned()
            .collect::<Vec<_>>();
        let pages = filtered.len().div_ceil(self.page_size).max(1);
        self.page = self.page.min(pages - 1);
        let start = self.page * self.page_size;
        let end = (start + self.page_size).min(filtered.len());
        widgets::table_with_row_height(
            ui,
            "asset-audits.table",
            &[
                widgets::TableColumn {
                    title: "Mã đợt & Phân loại",
                    width: 170.0,
                },
                widgets::TableColumn {
                    title: "Tên đợt kiểm kê & Phạm vi",
                    width: 280.0,
                },
                widgets::TableColumn {
                    title: "Sổ sách vs Thực tế",
                    width: 190.0,
                },
                widgets::TableColumn {
                    title: "Chênh lệch (+/-)",
                    width: 140.0,
                },
                widgets::TableColumn {
                    title: "Thời gian",
                    width: 130.0,
                },
                widgets::TableColumn {
                    title: "Trạng thái",
                    width: 180.0,
                },
                widgets::TableColumn {
                    title: "Thao tác",
                    width: 170.0,
                },
            ],
            end.saturating_sub(start),
            86.0,
            |ui, row, column| {
                let item = &filtered[start + row];
                match column {
                    0 => {
                        ui.label(
                            RichText::new(format!("▤  {}", item.audit_code))
                                .strong()
                                .color(Color32::from_rgb(0, 150, 136)),
                        );
                        tag_chip(
                            ui,
                            &item.audit_type,
                            Color32::from_rgb(207, 250, 254),
                            Color32::from_rgb(8, 145, 178),
                        );
                    }
                    1 => {
                        ui.label(
                            RichText::new(&item.audit_name)
                                .size(13.5)
                                .strong()
                                .color(Color32::from_rgb(15, 23, 42)),
                        );
                        ui.label(
                            RichText::new(format!(
                                "Phạm vi: {} ({})",
                                item.location,
                                empty_dash(&item.department)
                            ))
                            .size(12.0)
                            .color(Color32::from_rgb(100, 116, 139)),
                        );
                        ui.label(
                            RichText::new(format!("Trưởng ban: {}", item.auditor_leader))
                                .size(11.5)
                                .color(Color32::from_rgb(37, 99, 235)),
                        );
                    }
                    2 => {
                        ui.horizontal(|ui| {
                            ui.label(
                                RichText::new(format!("Sổ: {}", item.book_count))
                                    .size(12.5)
                                    .color(Color32::from_rgb(100, 116, 139)),
                            );
                            ui.label("➔");
                            ui.label(
                                RichText::new(format!("Thực: {}", item.actual_count))
                                    .strong()
                                    .color(Color32::from_rgb(22, 163, 74)),
                            );
                        });
                        let percent = if item.book_count <= 0 {
                            0.0
                        } else {
                            (item.actual_count as f32 / item.book_count as f32).clamp(0.0, 1.0)
                        };
                        ui.add(
                            egui::ProgressBar::new(percent)
                                .desired_width(170.0)
                                .fill(Color32::from_rgb(0, 150, 136)),
                        );
                    }
                    3 => {
                        if item.status == STATUS_IN_PROGRESS {
                            tag_chip(
                                ui,
                                "Đang kiểm đếm",
                                Color32::from_rgb(219, 234, 254),
                                Color32::from_rgb(37, 99, 235),
                            );
                        } else if item.discrepancy == 0 {
                            tag_chip(
                                ui,
                                "✓ Khớp 100% (0)",
                                Color32::from_rgb(220, 252, 231),
                                Color32::from_rgb(22, 163, 74),
                            );
                        } else {
                            let text = if item.discrepancy > 0 {
                                format!("+{} thừa", item.discrepancy)
                            } else {
                                format!("{} thiếu", item.discrepancy)
                            };
                            tag_chip(
                                ui,
                                &text,
                                Color32::from_rgb(254, 226, 226),
                                Color32::from_rgb(220, 38, 38),
                            );
                        }
                        if item.damaged_count > 0 {
                            ui.label(
                                RichText::new(format!("⚠ {} máy hỏng", item.damaged_count))
                                    .size(10.5)
                                    .color(Color32::from_rgb(217, 119, 6)),
                            );
                        }
                    }
                    4 => {
                        ui.label(RichText::new(format!("BĐ: {}", item.start_date)).size(12.0));
                        ui.label(
                            RichText::new(format!("KT: {}", item.end_date))
                                .size(12.0)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                    }
                    5 => {
                        let (background, foreground) = status_colors(&item.status);
                        tag_chip(ui, &item.status, background, foreground);
                    }
                    6 => {
                        ui.horizontal_wrapped(|ui| {
                            if ui.add_enabled(!busy, egui::Button::new("Xem")).clicked() {
                                self.request_detail(session, api, &item.key, false, false);
                            }
                            if ui
                                .add_enabled(
                                    !busy && is_admin,
                                    egui::Button::new("Quét").fill(Color32::from_rgb(0, 150, 136)),
                                )
                                .clicked()
                            {
                                self.request_detail(session, api, &item.key, true, false);
                            }
                            if is_admin
                                && item.status == STATUS_RECONCILE
                                && ui.add_enabled(!busy, egui::Button::new("Xử lý")).clicked()
                            {
                                self.request_detail(session, api, &item.key, false, true);
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
            "asset-audits.pagination",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );
    }

    fn render_detail(&mut self, ctx: &egui::Context, busy: bool, audit: AssetAudit) {
        let mut open = self.detail_open;
        let (_, closed) = widgets::drawer(
            ctx,
            "asset-audits-1",
            "Biên Bản Kiểm Kê Tài Sản Cố Định (Mẫu Số 05 - TSCĐ)",
            620.0,
            |ui| {
                ui.separator();
                egui::ScrollArea::vertical().show(ui, |ui| {
                    egui::Frame::none().inner_margin(16.0).show(ui, |ui| {
                        ui.vertical_centered(|ui| {
                            ui.label(
                                RichText::new("CÔNG TY CP CÔNG NGHỆ KIYOVN")
                                    .size(11.0)
                                    .strong()
                                    .color(Color32::from_rgb(100, 116, 139)),
                            );
                            ui.label(
                                RichText::new(
                                    "Mẫu số 05 - TSCĐ (Ban hành theo TT 200/2014/TT-BTC)",
                                )
                                .size(10.0)
                                .color(Color32::from_rgb(100, 116, 139)),
                            );
                            ui.label(
                                RichText::new("BIÊN BẢN KIỂM KÊ TÀI SẢN CỐ ĐỊNH & CCDC")
                                    .size(15.0)
                                    .strong()
                                    .color(Color32::from_rgb(15, 23, 42)),
                            );
                            ui.label(
                                RichText::new(format!(
                                    "Mã đợt: {} · Thời điểm: {}",
                                    audit.audit_code, audit.end_date
                                ))
                                .size(12.0)
                                .strong()
                                .color(Color32::from_rgb(0, 150, 136)),
                            );
                        });
                        ui.add_space(12.0);
                        egui::Frame::none()
                            .fill(Color32::from_rgb(248, 250, 252))
                            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                            .rounding(8.0)
                            .inner_margin(12.0)
                            .show(ui, |ui| {
                                ui.label(
                                    RichText::new("HỘI ĐỒNG KIỂM KÊ GỒM CÓ:")
                                        .strong()
                                        .color(Color32::from_rgb(15, 23, 42)),
                                );
                                ui.label(format!(
                                    "1. Ông/Bà: {} - Trưởng ban",
                                    audit.auditor_leader
                                ));
                                ui.label(format!("2. Các thành viên: {}", audit.auditor_members));
                                ui.label(format!("3. Địa điểm kiểm đếm: {}", audit.location));
                            });
                        ui.add_space(12.0);
                        egui::Frame::none()
                            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                            .rounding(8.0)
                            .show(ui, |ui| {
                                TableBuilder::new(ui)
                                    .id_salt("asset_audit_report_table")
                                    .column(Column::exact(220.0))
                                    .columns(Column::remainder(), 3)
                                    .header(38.0, |mut header| {
                                        for label in [
                                            "Chỉ tiêu kiểm kê",
                                            "Theo sổ sách",
                                            "Thực tế kiểm đếm",
                                            "Chênh lệch (+/-)",
                                        ] {
                                            header.col(|ui| {
                                                egui::Frame::none()
                                                    .fill(Color32::from_rgb(0, 150, 136))
                                                    .inner_margin(egui::Margin::symmetric(6.0, 8.0))
                                                    .show(ui, |ui| {
                                                        ui.centered_and_justified(|ui| {
                                                            ui.label(
                                                                RichText::new(label)
                                                                    .strong()
                                                                    .size(11.0)
                                                                    .color(Color32::WHITE),
                                                            );
                                                        });
                                                    });
                                            });
                                        }
                                    })
                                    .body(|mut body| {
                                        let rows = [
                                            (
                                                "Số lượng tài sản (Cái)",
                                                audit.book_count.to_string(),
                                                audit.actual_count.to_string(),
                                                if audit.discrepancy == 0 {
                                                    "0 (Khớp)".to_owned()
                                                } else {
                                                    audit.discrepancy.to_string()
                                                },
                                            ),
                                            (
                                                "Tổng giá trị (VNĐ)",
                                                format!("{} ₫", money(audit.book_value)),
                                                format!("{} ₫", money(audit.actual_value)),
                                                format!("{} ₫", money(audit.diff_value)),
                                            ),
                                            (
                                                "Phẩm chất: Đang dùng tốt",
                                                "-".to_owned(),
                                                format!("{} thiết bị", audit.matched_count),
                                                "Đạt 100%".to_owned(),
                                            ),
                                            (
                                                "Phẩm chất: Hỏng hóc",
                                                "0".to_owned(),
                                                format!("{} thiết bị", audit.damaged_count),
                                                "Đề xuất sửa".to_owned(),
                                            ),
                                        ];
                                        for (label, book, actual, difference) in rows {
                                            body.row(38.0, |mut row| {
                                                row.col(|ui| {
                                                    ui.label(RichText::new(label).strong());
                                                });
                                                row.col(|ui| {
                                                    ui.centered_and_justified(|ui| {
                                                        ui.label(book);
                                                    });
                                                });
                                                row.col(|ui| {
                                                    ui.centered_and_justified(|ui| {
                                                        ui.label(actual);
                                                    });
                                                });
                                                row.col(|ui| {
                                                    ui.centered_and_justified(|ui| {
                                                        ui.label(difference);
                                                    });
                                                });
                                            });
                                        }
                                    });
                            });
                        ui.add_space(12.0);
                        egui::Frame::none()
                            .fill(Color32::from_rgb(239, 246, 255))
                            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(191, 219, 254)))
                            .rounding(8.0)
                            .inner_margin(12.0)
                            .show(ui, |ui| {
                                ui.label(
                                    RichText::new("Ý kiến nhận xét & Phương án xử lý chênh lệch:")
                                        .strong()
                                        .color(Color32::from_rgb(30, 64, 175)),
                                );
                                ui.label(if audit.resolution_proposal.is_empty() {
                                    "Chưa có phương án giải trình."
                                } else {
                                    &audit.resolution_proposal
                                });
                            });
                        ui.add_space(10.0);
                        ui.label(
                            RichText::new(format!(
                                "Nhật ký quét thực tế gần nhất ({} mục):",
                                audit.items_list.len()
                            ))
                            .strong()
                            .color(Color32::from_rgb(15, 23, 42)),
                        );
                        egui::ScrollArea::vertical()
                            .max_height(120.0)
                            .show(ui, |ui| {
                                if audit.items_list.is_empty() {
                                    ui.label("Chưa có mã nào được ghi nhận.");
                                }
                                for item in &audit.items_list {
                                    egui::Frame::none()
                                        .fill(Color32::from_rgb(248, 250, 252))
                                        .rounding(4.0)
                                        .inner_margin(egui::Margin::symmetric(8.0, 4.0))
                                        .show(ui, |ui| {
                                            ui.horizontal(|ui| {
                                                ui.label(format!(
                                                    "{} - {} ({})",
                                                    item.code, item.name, item.holder
                                                ));
                                                ui.label(
                                                    RichText::new(&item.audit_status)
                                                        .strong()
                                                        .color(scan_color(&item.audit_status)),
                                                );
                                            });
                                        });
                                }
                            });
                        if !audit.missing_items.is_empty() {
                            ui.label(
                                RichText::new(format!(
                                    "Thiếu hụt sau đối soát: {}",
                                    audit.missing_items.len()
                                ))
                                .strong()
                                .color(Color32::from_rgb(220, 38, 38)),
                            );
                        }
                        ui.add_space(8.0);
                        ui.horizontal(|ui| {
                            let button_width = (ui.available_width() - 8.0) / 2.0;
                            ui.add_enabled(false, egui::Button::new("▣  In Mẫu 05-TSCĐ (PDF)"))
                                .on_hover_text("Chưa có chức năng tạo PDF biên bản kiểm kê.");
                            if ui
                                .add_sized(
                                    Vec2::new(button_width, 34.0),
                                    egui::Button::new("▦  Tiếp tục quét Barcode")
                                        .fill(Color32::from_rgb(0, 150, 136)),
                                )
                                .clicked()
                            {
                                if audit.snapshot_version != Some(1)
                                    || audit.status != STATUS_IN_PROGRESS
                                {
                                    self.error =
                                        "Đợt kiểm kê này không còn ở trạng thái cho phép quét."
                                            .to_owned();
                                } else if !busy {
                                    self.scanner_open = true;
                                }
                            }
                        });
                    });
                });
            },
        );
        open &= !closed;
        self.detail_open &= open;
        if !open {
            self.detail = None;
            self.scanner_open = false;
            self.resolution_open = false;
        }
    }

    fn render_scanner(
        &mut self,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        busy: bool,
        audit: &AssetAudit,
    ) {
        let mut open = self.scanner_open;
        let (_, closed) = widgets::modal(
            ctx,
            "asset-audits-2",
            "Trình Quét Nhận Diện Mã Vạch & QR Code Tài Sản",
            500.0,
            busy,
            |ui| {
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    ui.add_space(8.0);
                }

                egui::Frame::none()
                    .fill(Color32::from_rgb(239, 246, 255))
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(191, 219, 254)))
                    .rounding(8.0)
                    .inner_margin(12.0)
                    .show(ui, |ui| {
                        ui.label(
                            RichText::new(format!("Đang kiểm kê: {}", audit.audit_code)).strong(),
                        );
                        ui.label(format!(
                            "Địa điểm: {} | Đã quét: {} / {} thiết bị",
                            audit.location, audit.actual_count, audit.book_count
                        ));
                    });
                ui.add_space(12.0);
                egui::Frame::none()
                    .fill(Color32::from_rgb(248, 250, 252))
                    .stroke(egui::Stroke::new(2.0, Color32::from_rgb(0, 150, 136)))
                    .rounding(8.0)
                    .inner_margin(20.0)
                    .show(ui, |ui| {
                        ui.vertical_centered(|ui| {
                            ui.label(
                                RichText::new("▦")
                                    .size(40.0)
                                    .color(Color32::from_rgb(0, 150, 136)),
                            );
                            ui.label(
                                RichText::new("Sẵn sàng tiếp nhận tín hiệu máy quét cầm tay")
                                    .size(13.0)
                                    .strong(),
                            );
                            ui.label(
                                RichText::new(
                                    "Hỗ trợ chuẩn mã vạch EAN-13, Code 128, QR Code, DataMatrix",
                                )
                                .size(11.5)
                                .color(Color32::from_rgb(100, 116, 139)),
                            );
                        });
                    });
                ui.add_space(12.0);
                ui.label(
                    RichText::new("Nhập hoặc bắn mã Barcode / QR Code:")
                        .size(13.0)
                        .strong()
                        .color(Color32::from_rgb(15, 23, 42)),
                );
                let response = ui
                    .horizontal(|ui| {
                        let width = (ui.available_width() - 26.0).max(120.0);
                        let response = ui.add(
                            egui::TextEdit::singleline(&mut self.scan_code)
                                .hint_text("Ví dụ: 893850100201 hoặc TS-IT-001")
                                .desired_width(width),
                        );
                        ui.label(RichText::new("▤").color(Color32::from_rgb(0, 150, 136)));
                        response
                    })
                    .inner;
                let enter =
                    response.has_focus() && ui.input(|input| input.key_pressed(egui::Key::Enter));
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new("Ấn Enter để ghi nhận tức thì")
                            .size(12.0)
                            .color(Color32::from_rgb(100, 116, 139)),
                    );
                    widgets::action_row(ui, |ui| {
                        let clicked = ui
                            .add_enabled(
                                !busy && !self.scan_code.trim().is_empty(),
                                egui::Button::new("Ghi nhận quét")
                                    .fill(Color32::from_rgb(0, 150, 136)),
                            )
                            .clicked();
                        if !busy && !self.scan_code.trim().is_empty() && (clicked || enter) {
                            let payload = RecordAssetAuditScan {
                                scan_code: self.scan_code.trim().to_owned(),
                                damaged: false,
                                observed_location: String::new(),
                            };
                            self.pending_mutation = Some((
                                MutationKind::Scan,
                                api.record_asset_audit_scan_task(session, &audit.key, &payload),
                            ));
                            self.notice.clear();
                            self.error.clear();
                        }
                    });
                });
            },
        );
        open &= !closed;
        self.scanner_open &= open;
    }

    fn render_resolution(
        &mut self,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        busy: bool,
        audit: &AssetAudit,
    ) {
        let mut open = self.resolution_open;
        let (_, closed) = widgets::modal(
            ctx,
            "asset-audits-3",
            "Phương Án Xử Lý Chênh Lệch & Giải Trình Kiểm Kê",
            480.0,
            busy,
            |ui| {
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    ui.add_space(8.0);
                }

                egui::Frame::none()
                    .fill(Color32::from_rgb(255, 247, 237))
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(253, 230, 138)))
                    .rounding(8.0)
                    .inner_margin(12.0)
                    .show(ui, |ui| {
                        ui.label(
                            RichText::new(format!("Xử lý chênh lệch: {}", audit.audit_code))
                                .strong(),
                        );
                        ui.label(format!(
                            "Số lượng lệch: {} thiết bị | Số lượng hư hỏng: {} thiết bị.",
                            audit.discrepancy, audit.damaged_count
                        ));
                    });
                ui.add_space(12.0);
                ui.label(RichText::new("Nội dung giải trình & Kiến nghị Ban Giám Đốc:").strong());
                ui.add(
                    egui::TextEdit::multiline(&mut self.resolution_proposal)
                        .hint_text("Nhập phương án thu hồi tài sản thiếu, trích khấu hao đền bù hoặc thanh lý tài sản hỏng...")
                        .desired_width(f32::INFINITY)
                        .desired_rows(4),
                );
                ui.add_space(8.0);
                ui.horizontal(|ui| {
                    if ui.button("Hủy").clicked() {
                        self.resolution_open = false;
                    }
                    widgets::action_row(ui, |ui| {
                        if ui
                            .add_enabled(
                                !busy && self.resolution_proposal.trim().len() >= 10,
                                egui::Button::new("Trình Ban Giám Đốc Duyệt")
                                    .fill(Color32::from_rgb(0, 150, 136)),
                            )
                            .clicked()
                        {
                            let proposal = SubmitAssetAuditResolution {
                                proposal: self.resolution_proposal.trim().to_owned(),
                            };
                            self.pending_mutation = Some((
                                MutationKind::Resolution,
                                api.submit_asset_audit_resolution_task(
                                    session, &audit.key, &proposal,
                                ),
                            ));
                        }
                    });
                });
            },
        );
        open &= !closed;
        self.resolution_open &= open;
    }
}

fn field(ui: &mut Ui, label: &str, value: &mut String) {
    field_with_hint(ui, label, value, "");
}

fn field_with_hint(ui: &mut Ui, label: &str, value: &mut String, hint: &str) {
    ui.label(label);
    ui.add(
        egui::TextEdit::singleline(value)
            .hint_text(hint)
            .desired_width(f32::INFINITY),
    );
}

fn audit_accuracy(audits: &[AssetAudit]) -> Option<f64> {
    if audits.is_empty() || audits.iter().any(|audit| audit.snapshot_version != Some(1)) {
        return None;
    }
    let book = audits
        .iter()
        .map(|audit| audit.book_count.max(0))
        .fold(0_i64, i64::saturating_add);
    let matched = audits
        .iter()
        .map(|audit| audit.matched_count.clamp(0, audit.book_count.max(0)))
        .fold(0_i64, i64::saturating_add);
    (book > 0).then(|| matched as f64 / book as f64 * 100.0)
}

fn should_auto_close(audit: &AssetAudit, today: NaiveDate) -> bool {
    if audit.snapshot_version != Some(1) || audit.status != STATUS_IN_PROGRESS {
        return false;
    }
    let all_snapshot_assets_scanned = audit.matched_count + audit.damaged_count >= audit.book_count;
    let end_date_reached = NaiveDate::parse_from_str(&audit.end_date, "%Y-%m-%d")
        .is_ok_and(|end_date| end_date <= today);
    all_snapshot_assets_scanned || end_date_reached
}

fn audit_csv(audits: &[AssetAudit]) -> Vec<u8> {
    fn csv(value: &str) -> String {
        format!("\"{}\"", value.replace('"', "\"\""))
    }

    let mut output = String::from(
        "Mã đợt,Tên đợt,Phân loại,Phạm vi,Địa điểm,Phòng ban,Ngày bắt đầu,Ngày kết thúc,Sổ sách,Thực tế,Chênh lệch,Trạng thái\r\n",
    );
    for audit in audits {
        let row = [
            audit.audit_code.clone(),
            audit.audit_name.clone(),
            audit.audit_type.clone(),
            audit.scope.clone(),
            audit.location.clone(),
            audit.department.clone(),
            audit.start_date.clone(),
            audit.end_date.clone(),
            audit.book_count.to_string(),
            audit.actual_count.to_string(),
            audit.discrepancy.to_string(),
            audit.status.clone(),
        ];
        output.push_str(
            &row.iter()
                .map(|value| csv(value))
                .collect::<Vec<_>>()
                .join(","),
        );
        output.push_str("\r\n");
    }
    output.into_bytes()
}

fn tag_chip(ui: &mut Ui, text: &str, background: Color32, foreground: Color32) {
    egui::Frame::none()
        .fill(background)
        .rounding(4.0)
        .inner_margin(egui::Margin::symmetric(6.0, 2.0))
        .show(ui, |ui| {
            ui.label(RichText::new(text).size(11.0).color(foreground));
        });
}

fn status_colors(status: &str) -> (Color32, Color32) {
    match status {
        STATUS_IN_PROGRESS => (
            Color32::from_rgb(219, 234, 254),
            Color32::from_rgb(37, 99, 235),
        ),
        STATUS_RECONCILE => (
            Color32::from_rgb(254, 243, 199),
            Color32::from_rgb(217, 119, 6),
        ),
        STATUS_COMPLETED => (
            Color32::from_rgb(220, 252, 231),
            Color32::from_rgb(22, 163, 74),
        ),
        STATUS_SUBMITTED => (
            Color32::from_rgb(243, 232, 255),
            Color32::from_rgb(124, 58, 237),
        ),
        _ => (
            Color32::from_rgb(241, 245, 249),
            Color32::from_rgb(71, 85, 105),
        ),
    }
}

fn scan_color(status: &str) -> Color32 {
    match status {
        "Khớp chuẩn" => Color32::from_rgb(22, 163, 74),
        "Hỏng hóc" => Color32::from_rgb(217, 119, 6),
        "Thừa" => Color32::from_rgb(37, 99, 235),
        "Ngoài phạm vi" => Color32::from_rgb(124, 58, 237),
        "Thiếu hụt" => Color32::from_rgb(185, 28, 28),
        _ => Color32::GRAY,
    }
}

fn empty_dash(value: &str) -> &str {
    if value.trim().is_empty() {
        "—"
    } else {
        value
    }
}

fn money(value: i64) -> String {
    let text = value.to_string();
    let mut grouped = String::with_capacity(text.len() + text.len() / 3);
    for (index, character) in text.chars().rev().enumerate() {
        if index > 0 && index % 3 == 0 {
            grouped.push('.');
        }
        grouped.push(character);
    }
    grouped.chars().rev().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accuracy_is_unknown_without_snapshot_and_does_not_count_surplus_as_matches() {
        assert_eq!(audit_accuracy(&[]), None);
        assert_eq!(audit_accuracy(&[AssetAudit::default()]), None);
        let mut audit = AssetAudit {
            snapshot_version: Some(1),
            book_count: 2,
            actual_count: 3,
            matched_count: 1,
            ..AssetAudit::default()
        };
        assert_eq!(audit_accuracy(&[audit.clone()]), Some(50.0));
        audit.book_count = 0;
        assert_eq!(audit_accuracy(&[audit]), None);
    }

    #[test]
    fn audit_draft_requires_real_operator_inputs_and_valid_dates() {
        let draft = AuditDraft::default();
        assert!(draft.build().is_err());
        let draft = AuditDraft {
            audit_code: "KK-TEST".to_owned(),
            audit_name: "Kiểm kê".to_owned(),
            audit_type: "Định kỳ quý/năm".to_owned(),
            scope: "Toàn đơn vị".to_owned(),
            location: "*".to_owned(),
            department: "".to_owned(),
            start_date: "2026-10-09".to_owned(),
            end_date: "2026-10-10".to_owned(),
            auditor_leader: "Đầu mối".to_owned(),
            auditor_members: "Thành viên".to_owned(),
            notes: String::new(),
        };
        assert_eq!(draft.build().expect("valid draft").location, "*");
    }

    #[test]
    fn money_display_groups_vietnamese_dong_without_rounding() {
        assert_eq!(money(1_234_567), "1.234.567");
        assert_eq!(money(0), "0");
        assert_eq!(money(-1_234), "-1.234");
    }

    #[test]
    fn audit_closes_without_a_new_ui_control_after_full_scan_or_deadline() {
        let today = NaiveDate::from_ymd_opt(2026, 10, 9).expect("valid date");
        let mut audit = AssetAudit {
            status: STATUS_IN_PROGRESS.to_owned(),
            end_date: "2026-10-10".to_owned(),
            snapshot_version: Some(1),
            book_count: 2,
            matched_count: 1,
            ..AssetAudit::default()
        };
        assert!(!should_auto_close(&audit, today));

        audit.matched_count = 2;
        assert!(should_auto_close(&audit, today));

        audit.matched_count = 1;
        audit.end_date = "2026-10-08".to_owned();
        assert!(should_auto_close(&audit, today));

        audit.snapshot_version = None;
        assert!(!should_auto_close(&audit, today));
    }
}
