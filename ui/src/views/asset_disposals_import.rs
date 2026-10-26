use std::time::Duration;

use egui::{Color32, RichText, Ui};
use serde_json::Value;

use crate::{
    api::{
        ApiClient, ApiTask, LegacyAssetDisposalsImportPreview, LegacyAssetDisposalsImportResult,
    },
    file_transfer::{PickedFile, pick_upload_file_task},
    models::Session,
};

const MAX_BUNDLE_BYTES: usize = 7 * 1024 * 1024;

#[derive(Default)]
pub struct AssetDisposalsImportView {
    loaded_for: Option<String>,
    file_name: String,
    bundle: Option<Value>,
    preview: Option<LegacyAssetDisposalsImportPreview>,
    confirmation: String,
    imported: Option<LegacyAssetDisposalsImportResult>,
    pending_pick: Option<ApiTask<Option<PickedFile>>>,
    pending_preview: Option<ApiTask<LegacyAssetDisposalsImportPreview>>,
    pending_apply: Option<ApiTask<LegacyAssetDisposalsImportResult>>,
    error: String,
    notice: String,
}

impl AssetDisposalsImportView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn clear_account_state(&mut self) {
        *self = Self::default();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session) {
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
                    self.notice = "Đã đối chiếu gói asset_disposals; chưa ghi dữ liệu.".to_owned();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_apply.as_ref().and_then(ApiClient::poll) {
            self.pending_apply = None;
            match result {
                Ok(imported) => {
                    self.confirmation.clear();
                    self.bundle = None;
                    self.file_name.clear();
                    self.notice = format!(
                        "Đã thêm {} biên bản. Bản ghi đích hiện có và dữ liệu legacy không bị sửa.",
                        imported.imported_records
                    );
                    self.imported = Some(imported);
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if self.pending_pick.is_some()
            || self.pending_preview.is_some()
            || self.pending_apply.is_some()
        {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
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
                self.notice = "Gói có thể chứa mã tài sản, serial, tên bên mua, số điện thoại, chi phí và khai báo wipe. Preview chỉ trả số liệu tổng hợp; các khai báo cũ được đánh dấu chưa xác minh.".to_owned();
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
        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Chỉ ADMIN được xem trước hoặc nhập dữ liệu thanh lý legacy.");
            return;
        }
        self.poll(ctx, session);
        ui.label(
            RichText::new("DI CHUYỂN DỮ LIỆU · TÀI SẢN")
                .size(11.0)
                .strong()
                .color(Color32::from_rgb(0, 150, 136)),
        );
        ui.heading("Nhập lịch sử mất, hủy, thanh lý từ legacy");
        ui.label("Thêm bản ghi cũ vào collection asset_disposals của Rust theo cách append-only. Không ghi đè dữ liệu đích và không sửa dữ liệu legacy.");
        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.colored_label(
                Color32::from_rgb(185, 28, 28),
                RichText::new("GÓI CÓ THỂ CHỨA THÔNG TIN TÀI SẢN / NHÂN SỰ / CHI PHÍ NỘI BỘ").strong(),
            );
            ui.label("Mở đúng origin legacy, đăng nhập ADMIN và chạy tools/export_legacy_asset_disposals.js trong DevTools → Console. Exporter chỉ GET collection hoặc đọc cache kiyovn_cache_asset_disposals khi server rỗng.");
            ui.label("Không chạy exporter nếu chưa được phép đọc dữ liệu ở origin đó. Kết quả preview chỉ gồm số đếm/tóm tắt; trạng thái phê duyệt và wipe lịch sử được lưu là claim chưa xác minh.");
        });
        ui.add_space(10.0);
        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.label(RichText::new("1. Chọn gói JSON đã xuất").strong());
            ui.horizontal_wrapped(|ui| {
                let busy = self.pending_pick.is_some()
                    || self.pending_preview.is_some()
                    || self.pending_apply.is_some();
                if ui
                    .add_enabled(
                        !busy,
                        egui::Button::new(if self.pending_pick.is_some() {
                            "Đang chọn tệp…"
                        } else {
                            "Chọn gói JSON"
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
                if ui
                    .add_enabled(
                        self.bundle.is_some() && !busy && self.imported.is_none(),
                        egui::Button::new("Xem trước dữ liệu"),
                    )
                    .clicked()
                {
                    if let Some(bundle) = self.bundle.as_ref() {
                        self.pending_preview =
                            Some(api.preview_legacy_asset_disposals_import_task(session, bundle));
                    }
                    self.error.clear();
                    self.notice.clear();
                }
            });
        });
        if let Some(preview) = self.preview.as_ref() {
            ui.add_space(8.0);
            egui::Frame::group(ui.style()).show(ui, |ui| {
                ui.label(RichText::new("2. Kết quả đối chiếu — chưa ghi dữ liệu").strong());
                ui.label(format!(
                    "Nguồn: {} · Lô: {}",
                    preview.source_mode, preview.batch_id
                ));
                ui.label(format!(
                    "Nguồn {} biên bản · Đích {} · Mới có thể thêm {} · Đã nhập {} · Xung đột {}",
                    preview.source_records,
                    preview.target_records,
                    preview.importable_records,
                    preview.already_imported_records,
                    preview.conflicted_records
                ));
                ui.label(format!(
                    "Khai báo wipe cũ chưa xác minh: {} · Mã biên bản trùng nhau (được giữ): {}",
                    preview.legacy_wipe_claims, preview.duplicate_disposal_code_records
                ));
                if preview.batch_already_applied {
                    ui.colored_label(
                        Color32::from_rgb(185, 28, 28),
                        "Lô này đã được áp dụng; không thể chạy lại.",
                    );
                } else if preview.conflicted_records > 0 {
                    ui.colored_label(
                        Color32::from_rgb(185, 28, 28),
                        "Có xung đột khóa; không bản ghi nào được ghi.",
                    );
                }
                if let Some(imported) = self.imported.as_ref() {
                    ui.colored_label(
                        Color32::from_rgb(5, 150, 105),
                        format!(
                            "Lô {} · thêm {} · đã có {} · {}",
                            imported.batch_id,
                            imported.imported_records,
                            imported.already_imported_records,
                            imported.imported_at
                        ),
                    );
                }
                if preview.can_apply && self.imported.is_none() {
                    ui.separator();
                    ui.label("Để xác nhận append-only, nhập đúng cụm sau:");
                    ui.monospace(&preview.confirmation_phrase);
                    ui.text_edit_singleline(&mut self.confirmation);
                    let ready = self.confirmation == preview.confirmation_phrase
                        && self.pending_apply.is_none()
                        && self.bundle.is_some();
                    if ui
                        .add_enabled(
                            ready,
                            egui::Button::new("Áp dụng nhập append-only")
                                .fill(Color32::from_rgb(0, 150, 136)),
                        )
                        .clicked()
                    {
                        if let Some(bundle) = self.bundle.as_ref() {
                            self.pending_apply =
                                Some(api.apply_legacy_asset_disposals_import_task(
                                    session,
                                    bundle,
                                    &preview.payload_sha256,
                                    &self.confirmation,
                                ));
                            self.error.clear();
                        }
                    }
                }
            });
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
        }
        if !self.notice.is_empty() {
            ui.colored_label(Color32::from_rgb(5, 150, 105), &self.notice);
        }
        if self.pending_preview.is_some() || self.pending_apply.is_some() {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang đối chiếu hoặc nhập dữ liệu…");
            });
        }
    }
}
