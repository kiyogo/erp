use std::time::Duration;

use egui::{Color32, RichText, Ui};
use serde_json::Value;

use crate::{
    api::{
        ApiClient, ApiTask, LegacyHelpdeskTicketImportPreview, LegacyHelpdeskTicketImportResult,
    },
    file_transfer::{PickedFile, pick_upload_file_task},
    models::Session,
};

const MAX_BUNDLE_BYTES: usize = 7 * 1024 * 1024;

#[derive(Default)]
pub struct HelpdeskTicketImportView {
    loaded_for: Option<String>,
    file_name: String,
    bundle: Option<Value>,
    preview: Option<LegacyHelpdeskTicketImportPreview>,
    confirmation: String,
    imported: Option<LegacyHelpdeskTicketImportResult>,
    pending_pick: Option<ApiTask<Option<PickedFile>>>,
    pending_preview: Option<ApiTask<LegacyHelpdeskTicketImportPreview>>,
    pending_apply: Option<ApiTask<LegacyHelpdeskTicketImportResult>>,
    error: String,
    notice: String,
}

impl HelpdeskTicketImportView {
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
                        "Đã nhập {} ticket. Gói chứa tên/người gửi đã được gỡ khỏi bộ nhớ giao diện; cache legacy vẫn nguyên trạng.",
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
                self.notice = "Đã đọc gói. Preview chỉ trả số lượng và trạng thái đối chiếu; không trả tiêu đề, tên người gửi hay dữ liệu ticket.".to_owned();
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
            ui.label("Chỉ ADMIN được xem trước hoặc nhập lịch sử ticket.");
            return;
        }
        self.poll(ctx, session);
        ui.label(
            RichText::new("DI CHUYỂN DỮ LIỆU · HELPDESK")
                .size(11.0)
                .strong()
                .color(Color32::from_rgb(0, 150, 136)),
        );
        ui.heading("Nhập ticket lịch sử từ legacy");
        ui.label("Bản ghi được nhập vào bảng ticket Rust riêng; collection legacy không bị xóa hoặc ghi đè.");

        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.colored_label(
                Color32::from_rgb(185, 28, 28),
                RichText::new("GÓI CÓ THỂ CHỨA THÔNG TIN CÁ NHÂN / NỘI BỘ").strong(),
            );
            ui.label("JSON có thể chứa tiêu đề yêu cầu, mã ticket, tên người gửi và phòng ban. Chỉ xuất/chuyển tệp trên thiết bị và đường dẫn được phê duyệt; không gửi qua chat/email công cộng.");
            ui.label("Exporter chỉ đọc key localStorage kiyovn_cache_tickets, không sửa cache và không gửi mạng. Preview không ghi dữ liệu hoặc trả nội dung ticket. Bản nhập được đánh dấu Chưa xác minh và người tạo được ghi nhận là ADMIN thực hiện nhập; dữ liệu gốc không bị xóa.");
        });

        ui.add_space(10.0);
        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.label(RichText::new("1. Xuất từ ứng dụng legacy").strong());
            ui.label("Mở đúng origin legacy, tải xong màn Ticket, sau đó chạy tools/export_legacy_helpdesk_tickets.js trong DevTools → Console. Lưu tệp ở vị trí bảo mật rồi chọn tại đây.");
            ui.horizontal_wrapped(|ui| {
                let picking = self.pending_pick.is_some();
                if ui.add_enabled(!picking && self.pending_apply.is_none(), egui::Button::new(if picking { "Đang chọn tệp…" } else { "Chọn gói JSON" })).clicked() {
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
                if ui.add_enabled(can_preview, egui::Button::new(if self.pending_preview.is_some() { "Đang kiểm tra…" } else { "Xem trước" })).clicked() {
                    if let Some(bundle) = self.bundle.as_ref() {
                        self.error.clear();
                        self.notice.clear();
                        self.preview = None;
                        self.pending_preview = Some(api.preview_legacy_helpdesk_tickets_import_task(session, bundle));
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
                egui::Grid::new("legacy-helpdesk-ticket-import-summary").striped(true).show(ui, |ui| {
                    ui.strong("Chỉ số");
                    ui.strong("Số lượng");
                    ui.end_row();
                    ui.label("Ticket trong nguồn");
                    ui.label(preview.ticket_records.to_string());
                    ui.end_row();
                });
                ui.horizontal_wrapped(|ui| {
                    ui.label(format!("Sẽ nhập: {}", preview.importable_records));
                    ui.label(format!("Đã nhập trước: {}", preview.already_imported_records));
                    ui.label(format!("Xung đột / dữ liệu cần xem xét: {}", preview.conflicted_records));
                });
                if preview.conflicted_records > 0 {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), "Có xung đột hoặc trường nguồn chưa hỗ trợ; không thể áp dụng bất kỳ bản ghi nào trong lô này.");
                } else if preview.importable_records == 0 {
                    ui.label("Không còn bản ghi mới để nhập. Không có thay đổi nào được thực hiện.");
                } else if preview.can_apply {
                    ui.add_space(6.0);
                    ui.label("Xác nhận chính xác cụm sau để bắt đầu transaction nguyên tử:");
                    ui.label(RichText::new(&preview.confirmation_phrase).strong().monospace());
                    ui.add(egui::TextEdit::singleline(&mut self.confirmation).hint_text("Nhập cụm xác nhận").desired_width(440.0));
                    let confirmed = self.confirmation == preview.confirmation_phrase;
                    let applying = self.pending_apply.is_some();
                    if ui.add_enabled(confirmed && !applying && self.imported.is_none(), egui::Button::new(if applying { "Đang nhập…" } else { "Áp dụng nhập ticket" })).clicked() {
                        if let Some(bundle) = self.bundle.as_ref() {
                            self.error.clear();
                            self.pending_apply = Some(api.apply_legacy_helpdesk_tickets_import_task(session, bundle, &preview.payload_sha256, &self.confirmation));
                        }
                    }
                }
            });
        }

        if let Some(imported) = self.imported.as_ref() {
            ui.add_space(10.0);
            ui.label(
                RichText::new(format!(
                    "Lô {} hoàn tất lúc {} · nhập {} · đã có {}.",
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
