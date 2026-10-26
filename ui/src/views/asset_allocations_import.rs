use std::time::Duration;

use egui::{Color32, RichText, Ui};
use serde_json::Value;

use crate::{
    api::{
        ApiClient, ApiTask, LegacyAssetAllocationsImportPreview, LegacyAssetAllocationsImportResult,
    },
    file_transfer::{PickedFile, pick_upload_file_task},
    models::Session,
};

const MAX_BUNDLE_BYTES: usize = 7 * 1024 * 1024;

#[derive(Default)]
pub struct AssetAllocationsImportView {
    loaded_for: Option<String>,
    file_name: String,
    bundle: Option<Value>,
    preview: Option<LegacyAssetAllocationsImportPreview>,
    confirmation: String,
    imported: Option<LegacyAssetAllocationsImportResult>,
    pending_pick: Option<ApiTask<Option<PickedFile>>>,
    pending_preview: Option<ApiTask<LegacyAssetAllocationsImportPreview>>,
    pending_apply: Option<ApiTask<LegacyAssetAllocationsImportResult>>,
    error: String,
    notice: String,
}

impl AssetAllocationsImportView {
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
        self.error.clear();
        self.notice.clear();
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
                    self.notice =
                        "Đã đối chiếu asset_allocations; chưa ghi dữ liệu nào.".to_owned();
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
                        "Đã thêm {} biên bản. Dữ liệu nguồn và các bản ghi đích hiện có không bị sửa.",
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
                self.notice = "Biên bản có thể chứa tên/mã nhân viên, số sê-ri và ghi chú nội bộ. Các cờ ký số hoặc nhập kho từ legacy chỉ được giữ như dữ liệu lịch sử, không phải bằng chứng đã xác minh.".to_owned();
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
            ui.label("Chỉ ADMIN được xem trước hoặc nhập biên bản cấp phát legacy.");
            return;
        }
        self.poll(ctx, session);
        ui.label(
            RichText::new("DI CHUYỂN DỮ LIỆU · TÀI SẢN")
                .size(11.0)
                .strong()
                .color(Color32::from_rgb(0, 150, 136)),
        );
        ui.heading("Nhập biên bản cấp phát/thu hồi từ legacy");
        ui.label("Thêm bản ghi vào collection asset_allocations của Rust. Không ghi đè dữ liệu đích và không sửa dữ liệu trên legacy.");

        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.colored_label(
                Color32::from_rgb(185, 28, 28),
                RichText::new("GÓI CÓ THỂ CHỨA THÔNG TIN NHÂN VIÊN / SỐ SÊ-RI / GHI CHÚ NỘI BỘ").strong(),
            );
            ui.label("Exporter chỉ gửi GET cùng origin đến collections/asset_allocations và đọc token ADMIN trong phiên hiện tại; không sửa collection legacy. Preview chỉ trả số liệu tổng hợp, không trả nội dung từng biên bản.");
            ui.label("Cờ signedByReceiver/signedAt và trạng thái đã thu hồi về kho được giữ nguyên để bảo toàn lịch sử; chúng không được xem là chữ ký số hoặc sự kiện nhập kho đã xác minh.");
        });

        ui.add_space(10.0);
        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.label(RichText::new("1. Xuất từ ứng dụng legacy").strong());
            ui.label("Mở đúng origin legacy, đăng nhập ADMIN rồi chạy tools/export_legacy_asset_allocations.js trong DevTools → Console. Exporter phân trang tối đa 10.000 bản ghi và từ chối tạo gói nếu số trang thay đổi hoặc dữ liệu không khớp.");
            ui.horizontal_wrapped(|ui| {
                let picking = self.pending_pick.is_some();
                if ui
                    .add_enabled(
                        !picking && self.pending_apply.is_none(),
                        egui::Button::new(if picking { "Đang chọn tệp…" } else { "Chọn gói JSON" }),
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
                        self.pending_preview = Some(
                            api.preview_legacy_asset_allocations_import_task(session, bundle),
                        );
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
            ui.add_space(10.0);
            egui::Frame::group(ui.style()).show(ui, |ui| {
                ui.label(RichText::new("2. Đối chiếu — chỉ hiển thị số liệu tổng hợp").strong());
                ui.label(format!("Lô: {}", preview.batch_id));
                ui.label(format!("SHA-256 kế hoạch: {}", preview.payload_sha256));
                egui::Grid::new("legacy-asset-allocations-import-summary")
                    .striped(true)
                    .show(ui, |ui| {
                        ui.strong("Chỉ số");
                        ui.strong("Số lượng");
                        ui.end_row();
                        ui.label("Biên bản trong nguồn");
                        ui.label(preview.source_records.to_string());
                        ui.end_row();
                        ui.label("Biên bản hiện có ở đích");
                        ui.label(preview.target_records.to_string());
                        ui.end_row();
                        ui.label("Cờ ký/giờ ký legacy chưa xác minh");
                        ui.label(preview.legacy_signature_claims.to_string());
                        ui.end_row();
                        ui.label("Trạng thái nhập kho legacy chưa xác minh");
                        ui.label(preview.legacy_warehouse_receipt_claims.to_string());
                        ui.end_row();
                    });
                ui.horizontal_wrapped(|ui| {
                    ui.label(format!("Sẽ thêm: {}", preview.importable_records));
                    ui.label(format!("Đã có cùng nội dung: {}", preview.already_imported_records));
                    ui.label(format!("Xung đột khóa/nội dung: {}", preview.conflicted_records));
                });
                if preview.batch_already_applied {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), "Mã lô này đã được áp dụng; không thể sử dụng lại.");
                } else if preview.conflicted_records > 0 {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), "Có khóa trùng với nội dung khác; toàn bộ lô bị chặn và không bản ghi nào bị ghi đè.");
                } else if preview.importable_records == 0 {
                    ui.label("Không còn biên bản mới để nhập. Không có thay đổi nào được thực hiện.");
                } else if preview.can_apply {
                    ui.add_space(6.0);
                    ui.label("Xác nhận chính xác cụm sau để bắt đầu transaction nguyên tử:");
                    ui.label(RichText::new(&preview.confirmation_phrase).strong().monospace());
                    ui.add(egui::TextEdit::singleline(&mut self.confirmation).hint_text("Nhập cụm xác nhận").desired_width(440.0));
                    let confirmed = self.confirmation == preview.confirmation_phrase;
                    let applying = self.pending_apply.is_some();
                    if ui
                        .add_enabled(
                            confirmed && !applying && self.imported.is_none(),
                            egui::Button::new(if applying { "Đang nhập…" } else { "Áp dụng nhập biên bản" }),
                        )
                        .clicked()
                    {
                        if let Some(bundle) = self.bundle.as_ref() {
                            self.error.clear();
                            self.pending_apply = Some(api.apply_legacy_asset_allocations_import_task(
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
            ui.add_space(10.0);
            ui.label(
                RichText::new(format!(
                    "Lô {} hoàn tất lúc {} · đã thêm {} · đã có {}.",
                    imported.batch_id,
                    imported.imported_at,
                    imported.imported_records,
                    imported.already_imported_records
                ))
                .strong()
                .color(Color32::DARK_GREEN),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{AssetAllocationsImportView, MAX_BUNDLE_BYTES};
    use crate::file_transfer::PickedFile;

    #[test]
    fn allocation_import_accepts_json_objects_and_rejects_oversized_or_non_object_files() {
        let mut view = AssetAllocationsImportView::default();
        view.accept_file(PickedFile {
            name: "allocations.json".to_owned(),
            mime_type: "application/json".to_owned(),
            bytes: br#"{"format":"kiyovn-legacy-asset-allocations"}"#.to_vec(),
        });
        assert_eq!(view.file_name, "allocations.json");
        assert!(view.bundle.is_some());
        assert!(view.notice.contains("ký số"));

        view.accept_file(PickedFile {
            name: "array.json".to_owned(),
            mime_type: "application/json".to_owned(),
            bytes: br#"[]"#.to_vec(),
        });
        assert!(view.bundle.is_none());
        assert!(view.error.contains("đối tượng JSON"));

        view.accept_file(PickedFile {
            name: "large.json".to_owned(),
            mime_type: "application/json".to_owned(),
            bytes: vec![b' '; MAX_BUNDLE_BYTES + 1],
        });
        assert!(view.bundle.is_none());
        assert!(view.error.contains("7 MiB"));
    }
}
