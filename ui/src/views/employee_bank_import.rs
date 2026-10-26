use crate::{
    api::{
        ApiClient, ApiTask, LegacyEmployeeBankImportPreview, LegacyEmployeeBankImportResult,
        LegacyEmployeeBankQuarantineItem, LegacyEmployeeBankQuarantineResponse,
        LegacyEmployeeBankQuarantineReview,
    },
    file_transfer::{PickedFile, pick_upload_file_task},
    models::Session,
};
use egui::{Color32, RichText, Ui};
use serde_json::Value;
use std::time::Duration;

const MAX_BUNDLE_BYTES: usize = 7 * 1024 * 1024;

#[derive(Default)]
pub struct EmployeeBankImportView {
    loaded_for: Option<String>,
    file_name: String,
    bundle: Option<Value>,
    preview: Option<LegacyEmployeeBankImportPreview>,
    confirmation: String,
    imported: Option<LegacyEmployeeBankImportResult>,
    pending_pick: Option<ApiTask<Option<PickedFile>>>,
    pending_preview: Option<ApiTask<LegacyEmployeeBankImportPreview>>,
    pending_apply: Option<ApiTask<LegacyEmployeeBankImportResult>>,
    quarantine_items: Vec<LegacyEmployeeBankQuarantineItem>,
    quarantine_page: usize,
    quarantine_total_pages: usize,
    quarantine_total: usize,
    quarantine_loaded: bool,
    selected_quarantine: Option<String>,
    target_employee_code: String,
    corrected_bank_name: String,
    corrected_account_number: String,
    corrected_account_holder: String,
    corrected_branch: String,
    corrected_note: String,
    review_confirmation: String,
    review_reason: String,
    pending_quarantine_list: Option<ApiTask<LegacyEmployeeBankQuarantineResponse>>,
    pending_quarantine_review: Option<ApiTask<LegacyEmployeeBankQuarantineReview>>,
    error: String,
    notice: String,
}

impl EmployeeBankImportView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn clear_account_state(&mut self) {
        self.file_name.clear();
        self.bundle = None;
        self.preview = None;
        self.confirmation.clear();
        self.imported = None;
        self.pending_pick = None;
        self.pending_preview = None;
        self.pending_apply = None;
        self.quarantine_items.clear();
        self.quarantine_page = 1;
        self.quarantine_total_pages = 0;
        self.quarantine_total = 0;
        self.quarantine_loaded = false;
        self.selected_quarantine = None;
        self.target_employee_code.clear();
        self.corrected_bank_name.clear();
        self.corrected_account_number.clear();
        self.corrected_account_holder.clear();
        self.corrected_branch.clear();
        self.corrected_note.clear();
        self.review_confirmation.clear();
        self.review_reason.clear();
        self.pending_quarantine_list = None;
        self.pending_quarantine_review = None;
        self.error.clear();
        self.notice.clear();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, _api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.clear_account_state();
            self.loaded_for = Some(session.user.id.clone());
        }
        if let Some(result) = self.pending_pick.as_ref().and_then(ApiClient::poll) {
            self.pending_pick = None;
            match result {
                Ok(Some(file)) => self.accept_file(file),
                Ok(None) => {}
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_preview.as_ref().and_then(ApiClient::poll) {
            self.pending_preview = None;
            match result {
                Ok(preview) => {
                    self.confirmation.clear();
                    self.preview = Some(preview);
                    self.error.clear();
                    self.notice = "Đã xem trước; chưa có dữ liệu nào được ghi.".to_owned();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_apply.as_ref().and_then(ApiClient::poll) {
            self.pending_apply = None;
            match result {
                Ok(imported) => {
                    self.bundle = None;
                    self.file_name.clear();
                    self.confirmation.clear();
                    self.notice = format!(
                        "Đã xử lý lô {}: {} tài khoản chuyển sang chờ rà soát, {} hàng được mã hóa cách ly.",
                        imported.batch_id, imported.imported_accounts, imported.quarantined_records
                    );
                    self.imported = Some(imported);
                    self.quarantine_loaded = false;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self
            .pending_quarantine_list
            .as_ref()
            .and_then(ApiClient::poll)
        {
            self.pending_quarantine_list = None;
            self.quarantine_loaded = true;
            match result {
                Ok(response) => {
                    self.quarantine_items = response.data;
                    self.quarantine_page = response.pagination.page;
                    self.quarantine_total_pages = response.pagination.total_pages;
                    self.quarantine_total = response.pagination.total;
                    if self.selected_quarantine.as_ref().is_some_and(|selected| {
                        !self
                            .quarantine_items
                            .iter()
                            .any(|item| &item.source_key_sha256 == selected)
                    }) {
                        self.clear_quarantine_selection();
                    }
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self
            .pending_quarantine_review
            .as_ref()
            .and_then(ApiClient::poll)
        {
            self.pending_quarantine_review = None;
            match result {
                Ok(review) => {
                    self.notice = if review.action == "adopted" {
                        format!(
                            "Đã nhận bản ghi vào tài khoản {} ở trạng thái Chờ duyệt.",
                            review.account_id.unwrap_or_default()
                        )
                    } else {
                        "Đã ghi nhận loại bản ghi; nguồn mã hóa vẫn được bảo toàn.".to_owned()
                    };
                    self.clear_quarantine_selection();
                    self.quarantine_loaded = false;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if self.pending_pick.is_some()
            || self.pending_preview.is_some()
            || self.pending_apply.is_some()
            || self.pending_quarantine_list.is_some()
            || self.pending_quarantine_review.is_some()
        {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    fn clear_quarantine_selection(&mut self) {
        self.selected_quarantine = None;
        self.target_employee_code.clear();
        self.corrected_bank_name.clear();
        self.corrected_account_number.clear();
        self.corrected_account_holder.clear();
        self.corrected_branch.clear();
        self.corrected_note.clear();
        self.review_confirmation.clear();
        self.review_reason.clear();
    }

    fn accept_file(&mut self, file: PickedFile) {
        self.error.clear();
        self.notice.clear();
        self.preview = None;
        self.imported = None;
        self.confirmation.clear();
        if file.bytes.len() > MAX_BUNDLE_BYTES {
            self.bundle = None;
            self.file_name.clear();
            self.error = "Tệp vượt quá giới hạn 7 MiB.".to_owned();
            return;
        }
        match serde_json::from_slice::<Value>(&file.bytes) {
            Ok(bundle) if bundle.is_object() => {
                self.file_name = file.name;
                self.bundle = Some(bundle);
                self.notice =
                    "Đã đọc tệp. Chọn xem trước để kiểm tra liên kết và dữ liệu đích.".to_owned();
            }
            Ok(_) => {
                self.bundle = None;
                self.file_name.clear();
                self.error = "Gói nhập phải là một đối tượng JSON.".to_owned();
            }
            Err(error) => {
                self.bundle = None;
                self.file_name.clear();
                self.error = format!("Không đọc được JSON: {error}");
            }
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.poll(ctx, session, api);
        if !self.quarantine_loaded && self.pending_quarantine_list.is_none() {
            self.pending_quarantine_list = Some(api.list_legacy_employee_bank_quarantine_task(
                session,
                self.quarantine_page,
                50,
            ));
        }
        ui.label(
            RichText::new("DI CHUYỂN DỮ LIỆU NHẠY CẢM")
                .size(11.0)
                .strong()
                .color(Color32::from_rgb(0, 150, 136)),
        );
        ui.heading("Nhập tài khoản ngân hàng legacy");
        ui.label("Nguồn gồm cache localStorage, collection legacy trong DB và trường bank cũ trong hồ sơ nhân viên.");
        ui.label("Danh tính được đối chiếu bằng mã nhân viên trong hồ sơ Rust; tên, trạng thái duyệt và cờ tài khoản chính phía legacy không được tin.");
        ui.label("Tài khoản được liên kết sẽ chuyển về ‘Chờ duyệt’, không phải tài khoản đã xác minh. Không có dữ liệu nào bị xóa khỏi collection legacy.");
        ui.colored_label(
            Color32::from_rgb(153, 27, 27),
            "Tệp export chứa số tài khoản dạng plaintext. Chỉ lưu/chuyển tệp qua kênh tin cậy và xóa tệp sau khi đối chiếu xong.",
        );
        ui.add_space(12.0);

        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.label(RichText::new("1. Xuất cache chỉ-đọc từ legacy").strong());
            ui.label("Mở đúng origin legacy, chờ màn HR → Lịch sử nhân viên tải xong; mở DevTools → Console và chạy tools/export_legacy_employee_bank_accounts.js trong source hiện tại.");
            ui.label("Exporter chỉ đọc kiyovn_cache_employee_bank_accounts; trường bank đang lưu trong employee_profiles.details_json được backend tự rà soát.");
            ui.add_space(8.0);
            ui.horizontal_wrapped(|ui| {
                let picking = self.pending_pick.is_some();
                if ui
                    .add_enabled(
                        !picking && self.pending_apply.is_none() && self.imported.is_none(),
                        egui::Button::new(if picking {
                            "Đang chọn tệp…"
                        } else {
                            "Chọn gói bank JSON"
                        }),
                    )
                    .clicked()
                {
                    self.error.clear();
                    self.pending_pick = Some(pick_upload_file_task());
                }
                if !self.file_name.is_empty() {
                    ui.label(RichText::new(&self.file_name).monospace());
                }
                let can_preview = self.bundle.is_some()
                    && self.pending_preview.is_none()
                    && self.pending_apply.is_none()
                    && self.imported.is_none();
                if ui
                    .add_enabled(
                        can_preview,
                        egui::Button::new(if self.pending_preview.is_some() {
                            "Đang kiểm tra…"
                        } else {
                            "Xem trước"
                        }),
                    )
                    .clicked()
                {
                    if let Some(bundle) = self.bundle.as_ref() {
                        self.error.clear();
                        self.notice.clear();
                        self.preview = None;
                        self.pending_preview =
                            Some(api.preview_legacy_employee_bank_import_task(session, bundle));
                    }
                }
            });
        });

        if !self.notice.is_empty() {
            ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
        }

        if let Some(preview) = self.preview.as_ref() {
            ui.add_space(12.0);
            egui::Frame::group(ui.style()).show(ui, |ui| {
                ui.label(RichText::new("2. Rà soát bản xem trước — không hiển thị PII").strong());
                ui.label(format!("Lô: {}", preview.batch_id));
                ui.label(format!("SHA-256 nguồn + danh bạ + đích: {}", preview.payload_sha256));
                egui::Grid::new("employee-bank-import-counts")
                    .striped(true)
                    .show(ui, |ui| {
                        ui.label("Nguồn legacy collection");
                        ui.label(preview.generic_collection_records.to_string());
                        ui.end_row();
                        ui.label("Cache localStorage");
                        ui.label(preview.local_storage_records.to_string());
                        ui.end_row();
                        ui.label("Trường bank trong hồ sơ");
                        ui.label(preview.employee_profile_records.to_string());
                        ui.end_row();
                        ui.strong("Tổng hàng nguồn");
                        ui.strong(preview.source_records.to_string());
                        ui.end_row();
                        ui.label("Có thể chuyển, trạng thái chờ duyệt");
                        ui.label(preview.importable_accounts.to_string());
                        ui.end_row();
                        ui.label("Cách ly mã hóa, cần đối soát");
                        ui.label(preview.quarantined_records.to_string());
                        ui.end_row();
                        ui.label("Nguồn đã xử lý trước đó");
                        ui.label(preview.already_imported_records.to_string());
                        ui.end_row();
                    });
                ui.add_space(8.0);
                if preview.quarantined_records > 0 {
                    ui.colored_label(
                        Color32::from_rgb(146, 64, 14),
                        "Các hàng chưa đối soát sẽ được giữ nguyên bản legacy đã mã hóa trong vùng cách ly; chúng chưa xuất hiện như tài khoản dùng được.",
                    );
                }
                if !preview.can_apply {
                    ui.colored_label(
                        Color32::from_rgb(185, 28, 28),
                        "Không có hàng mới để nhập. Không có thay đổi nào được thực hiện.",
                    );
                } else {
                    ui.label("Nhập chính xác cụm xác nhận:");
                    ui.label(RichText::new(&preview.confirmation_phrase).strong().monospace());
                    ui.add(
                        egui::TextEdit::singleline(&mut self.confirmation)
                            .hint_text("Nhập cụm xác nhận")
                            .desired_width(440.0),
                    );
                    let confirmed = self.confirmation.trim() == preview.confirmation_phrase;
                    let applying = self.pending_apply.is_some();
                    if ui
                        .add_enabled(
                            confirmed && !applying && self.imported.is_none(),
                            egui::Button::new(if applying {
                                "Đang nhập…"
                            } else {
                                "Mã hóa và áp dụng lô nhập"
                            }),
                        )
                        .clicked()
                    {
                        if let Some(bundle) = self.bundle.as_ref() {
                            self.error.clear();
                            self.pending_apply = Some(api.apply_legacy_employee_bank_import_task(
                                session,
                                bundle,
                                &preview.payload_sha256,
                                &self.confirmation,
                            ));
                        }
                    }
                }
            });
        }

        if let Some(imported) = self.imported.as_ref() {
            ui.add_space(12.0);
            ui.label(
                RichText::new(format!(
                    "Hoàn tất lúc {} — {} tài khoản chờ duyệt, {} hàng cách ly, {} nguồn đã nhập trước.",
                    imported.imported_at,
                    imported.imported_accounts,
                    imported.quarantined_records,
                    imported.already_imported_records
                ))
                .strong()
                .color(Color32::DARK_GREEN),
            );
            ui.label("Tệp nhạy cảm đã được bỏ khỏi trạng thái màn hình. Nguồn generic legacy vẫn được giữ nguyên để đối chiếu.");
        }

        self.render_quarantine(ui, session, api);
    }

    fn render_quarantine(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        ui.add_space(18.0);
        ui.separator();
        ui.label(
            RichText::new("3. RÀ SOÁT HÀNG CÁCH LY")
                .size(11.0)
                .strong()
                .color(Color32::from_rgb(0, 150, 136)),
        );
        ui.heading(format!(
            "Quarantine ngân hàng — {} hàng đang chờ",
            self.quarantine_total
        ));
        ui.label("API chỉ trả số tài khoản đã che. Nhận bản ghi sẽ giải mã nội bộ, liên kết mã nhân viên bạn chọn và tạo tài khoản Chờ duyệt; bản nguồn và lý do xử lý được lưu bất biến, mã hóa.");
        ui.label("Để trống các trường sửa nếu muốn dùng giá trị từ bản nguồn đang mã hóa. Nhập cụm xác nhận hiển thị trước khi nhận hoặc loại.");

        ui.horizontal(|ui| {
            if ui
                .add_enabled(
                    self.pending_quarantine_list.is_none(),
                    egui::Button::new(if self.pending_quarantine_list.is_some() {
                        "Đang tải…"
                    } else {
                        "Tải lại danh sách"
                    }),
                )
                .clicked()
            {
                self.quarantine_loaded = false;
                self.pending_quarantine_list = Some(api.list_legacy_employee_bank_quarantine_task(
                    session,
                    self.quarantine_page,
                    50,
                ));
            }
            ui.label(format!(
                "Trang {} / {}",
                self.quarantine_page,
                self.quarantine_total_pages.max(1)
            ));
            if ui
                .add_enabled(
                    self.quarantine_page > 1 && self.pending_quarantine_list.is_none(),
                    egui::Button::new("‹ Trước"),
                )
                .clicked()
            {
                self.quarantine_page -= 1;
                self.quarantine_loaded = false;
            }
            if ui
                .add_enabled(
                    self.quarantine_page < self.quarantine_total_pages
                        && self.pending_quarantine_list.is_none(),
                    egui::Button::new("Sau ›"),
                )
                .clicked()
            {
                self.quarantine_page += 1;
                self.quarantine_loaded = false;
            }
        });

        if self.pending_quarantine_list.is_some() && self.quarantine_items.is_empty() {
            ui.spinner();
        } else if self.quarantine_loaded && self.quarantine_items.is_empty() {
            ui.label("Không còn hàng cách ly đang chờ xử lý.");
        }

        let selected_key = self.selected_quarantine.clone();
        for item in self.quarantine_items.clone() {
            let selected = selected_key.as_deref() == Some(item.source_key_sha256.as_str());
            egui::Frame::group(ui.style()).show(ui, |ui| {
                ui.horizontal_wrapped(|ui| {
                    if ui
                        .selectable_label(
                            selected,
                            format!(
                                "{} · {} · {}",
                                item.issue_code, item.employee_code, item.bank_name
                            ),
                        )
                        .clicked()
                    {
                        self.selected_quarantine = Some(item.source_key_sha256.clone());
                        self.target_employee_code.clone_from(&item.employee_code);
                        self.corrected_bank_name.clear();
                        self.corrected_account_number.clear();
                        self.corrected_account_holder.clear();
                        self.corrected_branch.clear();
                        self.corrected_note.clear();
                        self.review_confirmation.clear();
                        self.review_reason.clear();
                    }
                    ui.label(format!("Tài khoản: {}", item.account_number_masked));
                    ui.label(format!("Nguồn: {}", source_kind_label(&item.source_kind)));
                    ui.label(format!("Ngày nhận: {}", item.created_at));
                });
                ui.label(
                    RichText::new(format!("Lô {} · {}", item.batch_id, item.source_key_sha256))
                        .small()
                        .monospace(),
                );
            });
        }

        let selected_item = self
            .selected_quarantine
            .as_ref()
            .and_then(|key| {
                self.quarantine_items
                    .iter()
                    .find(|item| &item.source_key_sha256 == key)
            })
            .cloned();
        if let Some(item) = selected_item {
            ui.add_space(8.0);
            egui::Frame::group(ui.style()).show(ui, |ui| {
                ui.label(RichText::new("Xử lý một lần — không sửa bản nguồn").strong());
                ui.label(format!("Lỗi đối soát: {}", item.issue_code));
                ui.horizontal(|ui| {
                    ui.label("Mã nhân viên đích");
                    ui.add(egui::TextEdit::singleline(&mut self.target_employee_code).desired_width(220.0));
                });
                ui.label("Sửa dữ liệu (không bắt buộc; để trống sẽ dùng dữ liệu được giải mã nội bộ từ nguồn):");
                egui::Grid::new("employee-bank-quarantine-corrections")
                    .num_columns(2)
                    .striped(true)
                    .show(ui, |ui| {
                        ui.label("Ngân hàng");
                        ui.add(egui::TextEdit::singleline(&mut self.corrected_bank_name).desired_width(320.0));
                        ui.end_row();
                        ui.label("Số tài khoản sửa");
                        ui.add(egui::TextEdit::singleline(&mut self.corrected_account_number).password(true).desired_width(320.0));
                        ui.end_row();
                        ui.label("Chủ tài khoản");
                        ui.add(egui::TextEdit::singleline(&mut self.corrected_account_holder).desired_width(320.0));
                        ui.end_row();
                        ui.label("Chi nhánh");
                        ui.add(egui::TextEdit::singleline(&mut self.corrected_branch).desired_width(320.0));
                        ui.end_row();
                        ui.label("Ghi chú");
                        ui.add(egui::TextEdit::singleline(&mut self.corrected_note).desired_width(320.0));
                        ui.end_row();
                    });
                ui.label("Lý do / bằng chứng đối soát (bắt buộc, được mã hóa trong audit):");
                ui.add(
                    egui::TextEdit::multiline(&mut self.review_reason)
                        .desired_rows(2)
                        .desired_width(520.0),
                );
                let adopt_phrase = quarantine_confirmation("ADOPT", &item.source_key_sha256);
                let dismiss_phrase = quarantine_confirmation("DISMISS", &item.source_key_sha256);
                ui.horizontal(|ui| {
                    ui.label("Cụm xác nhận thao tác");
                    ui.label(RichText::new(format!("{adopt_phrase} hoặc {dismiss_phrase}" )).strong().monospace());
                });
                ui.add(
                    egui::TextEdit::singleline(&mut self.review_confirmation)
                        .hint_text("Nhập đúng một cụm xác nhận")
                        .desired_width(420.0),
                );
                let busy = self.pending_quarantine_review.is_some();
                let reason_ready = !self.review_reason.trim().is_empty();
                ui.horizontal_wrapped(|ui| {
                    if ui
                        .add_enabled(
                            !busy
                                && reason_ready
                                && !self.target_employee_code.trim().is_empty()
                                && self.review_confirmation.trim() == adopt_phrase,
                            egui::Button::new("Nhận vào tài khoản Chờ duyệt"),
                        )
                        .clicked()
                    {
                        self.error.clear();
                        self.pending_quarantine_review = Some(
                            api.adopt_legacy_employee_bank_quarantine_task(
                                session,
                                &item,
                                &self.target_employee_code,
                                &self.review_confirmation,
                                &self.corrected_bank_name,
                                &self.corrected_account_number,
                                &self.corrected_account_holder,
                                &self.corrected_branch,
                                &self.corrected_note,
                                &self.review_reason,
                            ),
                        );
                    }
                    if ui
                        .add_enabled(
                            !busy
                                && reason_ready
                                && self.review_confirmation.trim() == dismiss_phrase,
                            egui::Button::new("Ghi nhận loại bản ghi"),
                        )
                        .clicked()
                    {
                        self.error.clear();
                        self.pending_quarantine_review = Some(
                            api.dismiss_legacy_employee_bank_quarantine_task(
                                session,
                                &item,
                                &self.review_confirmation,
                                &self.review_reason,
                            ),
                        );
                    }
                    if busy {
                        ui.spinner();
                        ui.label("Đang ghi audit bất biến…");
                    }
                });
            });
        }
    }
}

fn source_kind_label(source_kind: &str) -> &str {
    match source_kind {
        "generic_collection" => "collection legacy",
        "local_storage" => "cache trình duyệt",
        "employee_profile" => "hồ sơ nhân viên",
        _ => "nguồn khác",
    }
}

fn quarantine_confirmation(action: &str, source_key_sha256: &str) -> String {
    format!("{action}-{}", source_key_sha256[..8].to_ascii_uppercase())
}
