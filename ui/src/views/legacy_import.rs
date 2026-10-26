use crate::{
    api::{ApiClient, ApiTask, LegacyPlanImportPreview, LegacyPlanImportResult},
    file_transfer::{PickedFile, pick_upload_file_task},
    models::Session,
};
use egui::{Color32, RichText, Ui};
use serde_json::Value;
use std::time::Duration;

const MAX_BUNDLE_BYTES: usize = 7 * 1024 * 1024;

#[derive(Default)]
pub struct LegacyImportView {
    loaded_for: Option<String>,
    file_name: String,
    bundle: Option<Value>,
    preview: Option<LegacyPlanImportPreview>,
    confirmation: String,
    imported: Option<LegacyPlanImportResult>,
    pending_pick: Option<ApiTask<Option<PickedFile>>>,
    pending_preview: Option<ApiTask<LegacyPlanImportPreview>>,
    pending_apply: Option<ApiTask<LegacyPlanImportResult>>,
    error: String,
    notice: String,
}

impl LegacyImportView {
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
                    self.confirmation.clear();
                    self.notice = format!(
                        "Đã nhập {} bản ghi thành công. Dữ liệu legacy vẫn nguyên trạng.",
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
                self.notice =
                    "Đã đọc tệp. Hãy xem trước để kiểm tra schema và dữ liệu đích.".to_owned();
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
        ui.label(
            RichText::new("DI CHUYỂN DỮ LIỆU AN TOÀN")
                .size(11.0)
                .strong()
                .color(Color32::from_rgb(0, 150, 136)),
        );
        ui.heading("Nhập dữ liệu kế hoạch từ legacy");
        ui.label("Luồng hiện hỗ trợ 5 collection: kế hoạch, cột mốc, tiến độ, báo cáo và OKR.");
        ui.label(
            "Tệp được xuất chỉ-đọc từ localStorage; không tải token, tài khoản hay datastore seed.",
        );
        ui.label("Backend chỉ áp dụng vào các scope đích đang trống, trong một transaction; không merge/ghi đè.");
        ui.label("Hãy kiểm tra đúng origin và dữ liệu nguồn; công cụ không thể tự phân biệt dữ liệu nghiệp vụ với dữ liệu demo do legacy lưu.");
        ui.add_space(12.0);

        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.label(RichText::new("1. Tạo gói xuất từ legacy").strong());
            ui.label("Mở ứng dụng legacy trên đúng origin, vào lần lượt các màn Kế hoạch cần chuyển và chờ dữ liệu tải xong. Sau đó mở DevTools → Console, chạy tools/export_legacy_plan_collections.js trong source mới, rồi chọn tệp JSON vừa tải xuống.");
            ui.label("Exporter chỉ đọc các key kiyovn_cache_* thuộc 5 collection kế hoạch và không sửa localStorage.");
            ui.add_space(8.0);
            ui.horizontal_wrapped(|ui| {
                let picking = self.pending_pick.is_some();
                if ui
                    .add_enabled(!picking && self.pending_apply.is_none(), egui::Button::new(if picking { "Đang chọn tệp…" } else { "Chọn gói JSON" }))
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
                    .add_enabled(can_preview, egui::Button::new(if self.pending_preview.is_some() { "Đang kiểm tra…" } else { "Xem trước" }))
                    .clicked()
                {
                    if let Some(bundle) = self.bundle.as_ref() {
                        self.error.clear();
                        self.notice.clear();
                        self.preview = None;
                        self.pending_preview = Some(api.preview_legacy_plan_import_task(session, bundle));
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
                ui.label(RichText::new("2. Đối chiếu trước khi nhập").strong());
                ui.label(format!("Lô: {}", preview.batch_id));
                ui.label(format!("Tổng số bản ghi nguồn: {}", preview.total_records));
                ui.label(RichText::new(format!("SHA-256 nội dung gói: {}", preview.payload_sha256)).small().monospace());
                egui::Grid::new("legacy-plan-import-preview")
                    .striped(true)
                    .show(ui, |ui| {
                        ui.strong("Collection");
                        ui.strong("Nguồn");
                        ui.strong("Đích hiện có");
                        ui.end_row();
                        for scope in &preview.collections {
                            ui.label(&scope.scope);
                            ui.label(scope.source_records.to_string());
                            ui.label(scope.target_records.to_string());
                            ui.end_row();
                        }
                    });

                if !preview.can_apply {
                    ui.add_space(8.0);
                    ui.colored_label(
                        Color32::from_rgb(185, 28, 28),
                        "Không thể áp dụng: ít nhất một scope đích đã có dữ liệu. Không có bản ghi nào bị ghi đè.",
                    );
                } else {
                    ui.add_space(8.0);
                    ui.label("Để xác nhận, nhập chính xác cụm sau:");
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
                            egui::Button::new(if applying { "Đang nhập…" } else { "Áp dụng nhập dữ liệu" }),
                        )
                        .clicked()
                    {
                        if let Some(bundle) = self.bundle.as_ref() {
                            self.error.clear();
                            self.pending_apply = Some(api.apply_legacy_plan_import_task(
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
                    "Đã hoàn tất lô {} lúc {} — {} bản ghi.",
                    imported.batch_id, imported.imported_at, imported.imported_records
                ))
                .strong()
                .color(Color32::DARK_GREEN),
            );
            ui.label("Mở lại hoặc làm mới từng màn kế hoạch để tải dữ liệu vừa nhập.");
        }
    }
}
