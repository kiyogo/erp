use crate::{
    api::{ApiClient, ApiTask, LegacyFinanceImportPreview, LegacyFinanceImportResult},
    file_transfer::{PickedFile, pick_upload_file_task},
    models::Session,
};
use egui::{Color32, RichText, Ui};
use serde_json::Value;
use std::time::Duration;

const MAX_BUNDLE_BYTES: usize = 15 * 1024 * 1024;

#[derive(Default)]
pub struct FinanceLegacyImportView {
    loaded_for: Option<String>,
    file_name: String,
    bundle: Option<Value>,
    preview: Option<LegacyFinanceImportPreview>,
    confirmation: String,
    imported: Option<LegacyFinanceImportResult>,
    pending_pick: Option<ApiTask<Option<PickedFile>>>,
    pending_preview: Option<ApiTask<LegacyFinanceImportPreview>>,
    pending_apply: Option<ApiTask<LegacyFinanceImportResult>>,
    error: String,
    notice: String,
}

impl FinanceLegacyImportView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn clear_sensitive_state(&mut self) {
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
            self.clear_sensitive_state();
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
                    self.notice = "Đã đối chiếu; chưa ghi dữ liệu nào.".to_owned();
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
                        "Đã nhập {} tài khoản ngân hàng và {} giao dịch tiền mặt; gói nhạy cảm đã được gỡ khỏi bộ nhớ giao diện.",
                        imported.imported_accounts, imported.imported_cash_transactions
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
            self.error = "Tệp vượt quá giới hạn 15 MiB.".to_owned();
            return;
        }
        match serde_json::from_slice::<Value>(&file.bytes) {
            Ok(bundle) if bundle.is_object() => {
                self.file_name = file.name;
                self.bundle = Some(bundle);
                self.notice = "Đã đọc gói tài chính. Preview chỉ trả số liệu tổng hợp, không trả chi tiết tài khoản hoặc giao dịch.".to_owned();
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
            self.clear_sensitive_state();
            ui.heading("Không đủ quyền");
            ui.label("Chỉ quản trị viên mới được nhập dữ liệu tài chính legacy.");
            return;
        }
        self.poll(ctx, session);
        ui.label(
            RichText::new("DI CHUYỂN TÀI CHÍNH · SQLITE LEGACY")
                .size(11.0)
                .strong()
                .color(Color32::from_rgb(0, 150, 136)),
        );
        ui.heading("Nhập tài khoản ngân hàng và giao dịch tiền mặt");
        ui.label("Luồng nhập có kiểm soát cho finance_bank_accounts và finance_cash_transactions; nguồn chỉ được đọc từ bản sao SQLite đã phê duyệt.");

        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.colored_label(
                Color32::from_rgb(185, 28, 28),
                RichText::new("CẢNH BÁO DỮ LIỆU TÀI CHÍNH NHẠY CẢM").strong(),
            );
            ui.label("Gói có thể chứa số tài khoản, người thụ hưởng, đối tác và ghi chú ở dạng rõ hoặc ciphertext legacy. Chỉ tạo/chuyển gói từ bản sao được phê duyệt, lưu tại vị trí bảo vệ và xóa bản tạm sau khi đối soát.");
            ui.label("Server yêu cầu khóa mã hóa tài chính, mã hóa lại số tài khoản khi lưu, giữ source row trong audit archive mã hóa và gán createdBy cho ADMIN đang nhập. Không dùng file export trực tiếp từ máy chủ production.");
        });

        ui.add_space(10.0);
        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.label(RichText::new("1. Xuất từ bản sao SQLite chỉ đọc").strong());
            ui.label("Exporter chỉ allowlist hai bảng tài chính, không đọc credentials và không ghi vào database nguồn. --source-id phải giữ nguyên khi chạy lại cùng một nguồn.");
            ui.label(RichText::new("node tools/export_legacy_finance.mjs --source <sqlite-copy> --source-id <stable-id> --output <new-bundle.json>").monospace().size(11.0));
            ui.horizontal_wrapped(|ui| {
                let picking = self.pending_pick.is_some();
                if ui.add_enabled(!picking && self.pending_apply.is_none(), egui::Button::new(if picking { "Đang chọn tệp…" } else { "Chọn gói JSON" })).clicked() {
                    self.error.clear();
                    self.pending_pick = Some(pick_upload_file_task());
                }
                if !self.file_name.is_empty() {
                    ui.label(RichText::new(&self.file_name).monospace());
                }
                let can_preview = self.bundle.is_some() && self.pending_preview.is_none() && self.pending_apply.is_none() && self.imported.is_none();
                if ui.add_enabled(can_preview, egui::Button::new(if self.pending_preview.is_some() { "Đang đối chiếu…" } else { "Xem trước" })).clicked() {
                    if let Some(bundle) = self.bundle.as_ref() {
                        self.error.clear();
                        self.notice.clear();
                        self.preview = None;
                        self.pending_preview = Some(api.preview_legacy_finance_import_task(session, bundle));
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
                ui.label(
                    RichText::new("2. Đối chiếu — không hiển thị dữ liệu tài khoản/giao dịch")
                        .strong(),
                );
                ui.label(format!(
                    "Database nguồn: {} · lô: {}",
                    preview.source_database_id, preview.batch_id
                ));
                ui.label(
                    RichText::new(format!("SHA-256 kế hoạch: {}", preview.payload_sha256))
                        .monospace()
                        .size(11.0),
                );
                egui::Grid::new("legacy-finance-import-summary")
                    .striped(true)
                    .show(ui, |ui| {
                        ui.strong("Loại");
                        ui.strong("Tổng");
                        ui.strong("Sẽ nhập");
                        ui.strong("Đã có");
                        ui.strong("Xung đột");
                        ui.end_row();
                        ui.label("Tài khoản ngân hàng");
                        ui.label(preview.account_records.to_string());
                        ui.label(preview.importable_accounts.to_string());
                        ui.label(preview.already_imported_accounts.to_string());
                        ui.label(preview.conflicted_accounts.to_string());
                        ui.end_row();
                        ui.label("Giao dịch tiền mặt");
                        ui.label(preview.cash_transaction_records.to_string());
                        ui.label(preview.importable_cash_transactions.to_string());
                        ui.label(preview.already_imported_cash_transactions.to_string());
                        ui.label(preview.conflicted_cash_transactions.to_string());
                        ui.end_row();
                    });
                ui.horizontal_wrapped(|ui| {
                    ui.label(format!("Tổng: {}", preview.source_records));
                    ui.label(format!("Sẽ nhập: {}", preview.importable_records));
                    ui.label(format!(
                        "Đã nhập trước: {}",
                        preview.already_imported_records
                    ));
                    ui.label(format!("Xung đột: {}", preview.conflicted_records));
                });
                if preview.conflicted_records > 0 {
                    ui.colored_label(
                        Color32::from_rgb(185, 28, 28),
                        "Có xung đột; không thể áp dụng. Không bản ghi nào được ghi.",
                    );
                } else if preview.importable_records == 0 {
                    ui.label("Không còn bản ghi mới. Không có thay đổi nào được thực hiện.");
                } else if preview.can_apply {
                    ui.add_space(6.0);
                    ui.label("Xác nhận chính xác cụm sau để bắt đầu transaction nguyên tử:");
                    ui.label(
                        RichText::new(&preview.confirmation_phrase)
                            .strong()
                            .monospace(),
                    );
                    ui.add(
                        egui::TextEdit::singleline(&mut self.confirmation)
                            .hint_text("Nhập cụm xác nhận")
                            .desired_width(440.0),
                    );
                    let applying = self.pending_apply.is_some();
                    if ui
                        .add_enabled(
                            self.confirmation.trim() == preview.confirmation_phrase
                                && !applying
                                && self.imported.is_none(),
                            egui::Button::new(if applying {
                                "Đang nhập…"
                            } else {
                                "Áp dụng nhập tài chính"
                            }),
                        )
                        .clicked()
                    {
                        if let Some(bundle) = self.bundle.as_ref() {
                            self.error.clear();
                            self.pending_apply = Some(api.apply_legacy_finance_import_task(
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
                    "Lô {} hoàn tất lúc {} · nhập {} tài khoản · {} giao dịch · đã có {}.",
                    imported.batch_id,
                    imported.imported_at,
                    imported.imported_accounts,
                    imported.imported_cash_transactions,
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
    use super::MAX_BUNDLE_BYTES;

    #[test]
    fn finance_bundle_limit_leaves_room_for_the_json_request_envelope() {
        assert_eq!(MAX_BUNDLE_BYTES, 15 * 1024 * 1024);
    }
}
