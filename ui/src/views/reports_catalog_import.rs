use std::time::Duration;

use egui::{Color32, RichText, Ui};
use serde_json::Value;

use crate::{
    api::{
        ApiClient, ApiTask, LegacyReportsCatalogImportPreview, LegacyReportsCatalogImportResult,
    },
    file_transfer::{PickedFile, pick_upload_file_task},
    models::Session,
};

const FORMAT: &str = "kiyovn-legacy-reports-catalog";
const MAX_BUNDLE_BYTES: usize = 7 * 1024 * 1024;
const MAX_RECORDS: usize = 10_000;

#[derive(Default)]
pub struct ReportsCatalogImportView {
    loaded_for: Option<String>,
    file_name: String,
    bundle: Option<Value>,
    preview: Option<LegacyReportsCatalogImportPreview>,
    confirmation: String,
    imported: Option<LegacyReportsCatalogImportResult>,
    pending_pick: Option<ApiTask<Option<PickedFile>>>,
    pending_preview: Option<ApiTask<LegacyReportsCatalogImportPreview>>,
    pending_apply: Option<ApiTask<LegacyReportsCatalogImportResult>>,
    error: String,
    notice: String,
}

impl ReportsCatalogImportView {
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
                Ok(Some(file)) => match decode_bundle_file(file) {
                    Ok((name, bundle)) => {
                        self.file_name = name;
                        self.bundle = Some(bundle);
                        self.preview = None;
                        self.imported = None;
                        self.confirmation.clear();
                        self.error.clear();
                        self.notice = "Gói đã được đọc cục bộ. Xem trước chỉ gửi số liệu tổng hợp lên server.".to_owned();
                    }
                    Err(error) => {
                        self.file_name.clear();
                        self.bundle = None;
                        self.preview = None;
                        self.error = error;
                    }
                },
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
                    self.notice = "Đã đối chiếu; chưa ghi collection nào.".to_owned();
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
                    self.preview = None;
                    self.notice = format!(
                        "Đã nhập {} báo cáo; {} bản ghi trùng khớp được giữ nguyên. Cache legacy không bị thay đổi.",
                        imported.imported_records, imported.identical_records
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

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Chỉ ADMIN được xem trước hoặc nhập reports_catalog.");
            return;
        }
        self.poll(ctx, session);
        ui.label(
            RichText::new("DI CHUYỂN DỮ LIỆU · BÁO CÁO")
                .size(11.0)
                .strong()
                .color(Color32::from_rgb(0, 150, 136)),
        );
        ui.heading("Nhập danh mục báo cáo từ legacy");
        ui.label("Luồng này chỉ thêm bản ghi reports_catalog còn thiếu. Không sửa browser cache, không ghi đè nội dung đích và ghi nhật ký import/audit.");
        ui.colored_label(
            Color32::from_rgb(146, 64, 14),
            "Gói JSON có thể chứa nội dung báo cáo nội bộ. Chỉ xuất, lưu và chuyển trên thiết bị/đường dẫn được phê duyệt.",
        );

        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.label(RichText::new("1. Xuất gói chỉ-đọc từ legacy").strong());
            ui.label("Mở đúng origin legacy, đăng nhập ADMIN, chờ màn Báo cáo tải xong rồi chạy tools/export_legacy_reports_catalog.js trong DevTools → Console. Exporter ưu tiên collection server, chỉ fallback sang kiyovn_cache_reports_catalog khi server rỗng; không ghi localStorage.");
            ui.label("Lưu tệp JSON ở nơi bảo mật rồi chọn tại đây. Không dán token, nội dung báo cáo hoặc dữ liệu thật vào log.");
            ui.horizontal_wrapped(|ui| {
                let picking = self.pending_pick.is_some();
                if ui.add_enabled(
                    !picking && self.pending_apply.is_none(),
                    egui::Button::new(if picking { "Đang chọn tệp…" } else { "Chọn gói JSON" }),
                ).clicked() {
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
                if ui.add_enabled(
                    can_preview,
                    egui::Button::new(if self.pending_preview.is_some() { "Đang kiểm tra…" } else { "Xem trước" }),
                ).clicked() {
                    if let Some(bundle) = self.bundle.as_ref() {
                        self.error.clear();
                        self.notice.clear();
                        self.preview = None;
                        self.pending_preview = Some(api.preview_legacy_reports_catalog_import_task(session, bundle));
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
                ui.label(RichText::new("2. Đối chiếu — chỉ trả số liệu tổng hợp").strong());
                ui.label(format!("Lô: {} · nguồn: {}", preview.batch_id, preview.source_mode));
                ui.label(RichText::new(format!("SHA-256 kế hoạch: {}", preview.payload_sha256)).small().monospace());
                egui::Grid::new("legacy-reports-catalog-import-summary").striped(true).show(ui, |ui| {
                    ui.strong("Chỉ số");
                    ui.strong("Số lượng");
                    ui.end_row();
                    ui.label("Báo cáo trong nguồn");
                    ui.label(preview.source_records.to_string());
                    ui.end_row();
                    ui.label("Bản ghi hiện có ở đích");
                    ui.label(preview.target_records.to_string());
                    ui.end_row();
                    ui.label("Sẽ thêm mới");
                    ui.label(preview.importable_records.to_string());
                    ui.end_row();
                    ui.label("Đã có cùng nội dung");
                    ui.label(preview.identical_records.to_string());
                    ui.end_row();
                    ui.label("Cùng key nhưng khác nội dung");
                    ui.label(preview.conflicting_records.to_string());
                    ui.end_row();
                });
                if preview.batch_already_applied {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), "Lô này đã được áp dụng; không thể dùng lại.");
                } else if preview.conflicting_records > 0 {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), "Có key trùng nội dung khác; toàn bộ lô bị chặn, không có bản ghi nào bị ghi đè.");
                } else if preview.importable_records == 0 {
                    ui.label("Không còn bản ghi mới để nhập.");
                } else if preview.can_apply {
                    ui.add_space(6.0);
                    ui.label("Xác nhận chính xác cụm sau để áp dụng transaction nguyên tử:");
                    ui.label(RichText::new(&preview.confirmation_phrase).strong().monospace());
                    ui.add(egui::TextEdit::singleline(&mut self.confirmation).hint_text("Nhập cụm xác nhận").desired_width(440.0));
                    let applying = self.pending_apply.is_some();
                    if ui.add_enabled(
                        self.confirmation == preview.confirmation_phrase && !applying && self.imported.is_none(),
                        egui::Button::new(if applying { "Đang nhập…" } else { "Áp dụng nhập báo cáo" }),
                    ).clicked() {
                        if let Some(bundle) = self.bundle.as_ref() {
                            self.error.clear();
                            self.pending_apply = Some(api.apply_legacy_reports_catalog_import_task(
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
                    "Lô {} hoàn tất lúc {} · thêm {} · giữ nguyên {} bản trùng khớp.",
                    imported.batch_id,
                    imported.imported_at,
                    imported.imported_records,
                    imported.identical_records
                ))
                .strong()
                .color(Color32::DARK_GREEN),
            );
            ui.label("Mở lại màn Báo cáo để tải danh mục đã nhập.");
        }
    }
}

fn decode_bundle_file(file: PickedFile) -> Result<(String, Value), String> {
    if file.bytes.len() > MAX_BUNDLE_BYTES {
        return Err("Tệp vượt quá giới hạn 7 MiB.".to_owned());
    }
    let bundle: Value = serde_json::from_slice(&file.bytes)
        .map_err(|error| format!("Không đọc được JSON: {error}"))?;
    if !bundle.is_object() {
        return Err("Gói nhập phải là một đối tượng JSON.".to_owned());
    }
    if bundle.get("format").and_then(Value::as_str) != Some(FORMAT)
        || bundle.get("schemaVersion").and_then(Value::as_u64) != Some(1)
    {
        return Err(
            "Định dạng hoặc schemaVersion không phải gói reports_catalog được hỗ trợ.".to_owned(),
        );
    }
    let Some(records) = bundle.get("records").and_then(Value::as_array) else {
        return Err("Gói reports_catalog thiếu mảng records.".to_owned());
    };
    if records.is_empty() || records.len() > MAX_RECORDS {
        return Err(format!("Số báo cáo phải nằm trong 1..={MAX_RECORDS}."));
    }
    Ok((file.name, bundle))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn report_bundle_file_requires_supported_format_and_nonempty_bounded_records() {
        let valid = json!({
            "format": FORMAT,
            "schemaVersion": 1,
            "records": [{"key":"report-1","title":"Synthetic"}]
        });
        let file = PickedFile {
            name: "reports.json".to_owned(),
            mime_type: "application/json".to_owned(),
            bytes: valid.to_string().into_bytes(),
        };
        assert_eq!(
            decode_bundle_file(file).expect("valid bundle").0,
            "reports.json"
        );

        let wrong = PickedFile {
            name: "wrong.json".to_owned(),
            mime_type: "application/json".to_owned(),
            bytes: json!({"format":"other","schemaVersion":1,"records":[{}]})
                .to_string()
                .into_bytes(),
        };
        assert!(
            decode_bundle_file(wrong)
                .unwrap_err()
                .contains("schemaVersion")
        );
        let empty = PickedFile {
            name: "empty.json".to_owned(),
            mime_type: "application/json".to_owned(),
            bytes: json!({"format":FORMAT,"schemaVersion":1,"records":[]})
                .to_string()
                .into_bytes(),
        };
        assert!(decode_bundle_file(empty).unwrap_err().contains("1..="));
    }
}
