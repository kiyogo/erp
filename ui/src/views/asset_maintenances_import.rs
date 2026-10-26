use std::time::Duration;

use crate::{
    api::{
        ApiClient, ApiTask, LegacyAssetMaintenancesImportPreview,
        LegacyAssetMaintenancesImportResult,
    },
    file_transfer::{PickedFile, pick_upload_file_task},
    models::Session,
};
use egui::{Color32, RichText, Ui};
use serde_json::Value;

const MAX_BUNDLE_BYTES: usize = 7 * 1024 * 1024;

#[derive(Default)]
pub struct AssetMaintenancesImportView {
    loaded_for: Option<String>,
    file_name: String,
    bundle: Option<Value>,
    preview: Option<LegacyAssetMaintenancesImportPreview>,
    confirmation: String,
    imported: Option<LegacyAssetMaintenancesImportResult>,
    pending_pick: Option<ApiTask<Option<PickedFile>>>,
    pending_preview: Option<ApiTask<LegacyAssetMaintenancesImportPreview>>,
    pending_apply: Option<ApiTask<LegacyAssetMaintenancesImportResult>>,
    error: String,
    notice: String,
}

impl AssetMaintenancesImportView {
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
                        "Đã đối chiếu asset_maintenances; chưa ghi dữ liệu nào.".to_owned();
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
                        "Đã thêm {} kế hoạch. Dữ liệu nguồn và các bản ghi đích hiện có không bị sửa.",
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
                self.notice = "Bản ghi lịch sử được giữ nguyên nhưng các trạng thái hoàn thành, checklist, điểm sức khỏe và chứng chỉ legacy chỉ là dữ liệu nguồn chưa xác minh.".to_owned();
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
            ui.label("Chỉ ADMIN được xem trước hoặc nhập lịch sử bảo dưỡng legacy.");
            return;
        }
        self.poll(ctx, session);
        ui.label(
            RichText::new("DI CHUYỂN DỮ LIỆU · TÀI SẢN")
                .size(11.0)
                .strong()
                .color(Color32::from_rgb(0, 150, 136)),
        );
        ui.heading("Nhập lịch sử bảo dưỡng từ legacy");
        ui.label("Thêm dữ liệu nguồn vào collection asset_maintenances của Rust. Không ghi đè bản ghi đích và không sửa ứng dụng legacy.");

        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.colored_label(
                Color32::from_rgb(185, 28, 28),
                RichText::new("GÓI CÓ THỂ CHỨA THÔNG TIN HẠ TẦNG / NHÂN SỰ / CHI PHÍ NỘI BỘ").strong(),
            );
            ui.label("Dữ liệu legacy được bảo toàn với dấu nguồn chưa xác minh. Các thông tin người thực hiện, điểm sức khỏe, chứng chỉ, checklist và trạng thái hoàn tất không được xem là audit event hoặc chứng cứ do Rust xác nhận.");
            ui.label("Preview chỉ trả số liệu tổng hợp; apply yêu cầu xác nhận chính xác và transaction nguyên tử.");
        });

        ui.add_space(10.0);
        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.label(RichText::new("1. Xuất từ ứng dụng legacy").strong());
            ui.label("Mở đúng origin legacy, đăng nhập ADMIN rồi chạy tools/export_legacy_asset_maintenances.js trong DevTools → Console. Exporter ưu tiên collection server, chỉ dùng kiyovn_cache_asset_maintenances khi server trả rỗng; chỉ đọc dữ liệu và fail-closed nếu API/auth/phân trang lỗi.");
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
                        egui::Button::new(if self.pending_preview.is_some() { "Đang kiểm tra…" } else { "Xem trước" }),
                    )
                    .clicked()
                {
                    if let Some(bundle) = self.bundle.as_ref() {
                        self.error.clear();
                        self.notice.clear();
                        self.preview = None;
                        self.pending_preview = Some(api.preview_legacy_asset_maintenances_import_task(session, bundle));
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
                ui.label(format!("Lô: {} · nguồn: {}", preview.batch_id, preview.source_mode));
                ui.label(format!("SHA-256 kế hoạch: {}", preview.payload_sha256));
                egui::Grid::new("legacy-asset-maintenances-import-summary")
                    .striped(true)
                    .show(ui, |ui| {
                        ui.strong("Chỉ số");
                        ui.strong("Số lượng");
                        ui.end_row();
                        ui.label("Kế hoạch trong nguồn");
                        ui.label(preview.source_records.to_string());
                        ui.end_row();
                        ui.label("Bản ghi hiện có ở đích");
                        ui.label(preview.target_records.to_string());
                        ui.end_row();
                        ui.label("Khai báo hoàn thành legacy chưa xác minh");
                        ui.label(preview.legacy_completion_claims.to_string());
                        ui.end_row();
                        ui.label("Chứng chỉ legacy chưa xác minh");
                        ui.label(preview.legacy_certificate_claims.to_string());
                        ui.end_row();
                        ui.label("Checklist legacy khai báo đủ mục");
                        ui.label(preview.legacy_completed_checklist_records.to_string());
                        ui.end_row();
                        ui.label("Mã kế hoạch trùng trong nguồn (vẫn bảo toàn)");
                        ui.label(preview.duplicate_maintenance_codes.to_string());
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
                    ui.colored_label(Color32::from_rgb(185, 28, 28), "Có key trùng với nội dung khác; toàn bộ lô bị chặn, không bản ghi nào bị ghi đè.");
                } else if preview.importable_records == 0 {
                    ui.label("Không còn kế hoạch mới để nhập. Không có thay đổi nào được thực hiện.");
                } else if preview.can_apply {
                    ui.add_space(6.0);
                    ui.label("Nhập chính xác cụm sau để bắt đầu transaction nguyên tử:");
                    ui.label(RichText::new(&preview.confirmation_phrase).strong().monospace());
                    ui.add(egui::TextEdit::singleline(&mut self.confirmation).hint_text("Nhập cụm xác nhận").desired_width(440.0));
                    let confirmed = self.confirmation == preview.confirmation_phrase;
                    let applying = self.pending_apply.is_some();
                    if ui
                        .add_enabled(
                            confirmed && !applying && self.imported.is_none(),
                            egui::Button::new(if applying { "Đang nhập…" } else { "Áp dụng nhập lịch sử" }),
                        )
                        .clicked()
                    {
                        if let Some(bundle) = self.bundle.as_ref() {
                            self.error.clear();
                            self.pending_apply = Some(api.apply_legacy_asset_maintenances_import_task(
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
    use super::{AssetMaintenancesImportView, MAX_BUNDLE_BYTES};
    use crate::file_transfer::PickedFile;

    #[test]
    fn maintenance_import_accepts_json_objects_and_rejects_oversized_or_non_object_files() {
        let mut view = AssetMaintenancesImportView::default();
        view.accept_file(PickedFile {
            name: "maintenances.json".to_owned(),
            mime_type: "application/json".to_owned(),
            bytes: br#"{"format":"kiyovn-legacy-asset-maintenances"}"#.to_vec(),
        });
        assert_eq!(view.file_name, "maintenances.json");
        assert!(view.bundle.is_some());
        assert!(view.notice.contains("chưa xác minh"));

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
