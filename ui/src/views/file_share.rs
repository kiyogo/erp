use crate::api::{ApiClient, ApiTask, FileShare};
use crate::file_transfer;
use egui::{Color32, RichText, Ui, Vec2};

pub struct PublicFileShareView {
    api_endpoint: String,
    token: Option<String>,
    requested: bool,
    image_loaders_installed: bool,
    pending_share: Option<ApiTask<FileShare>>,
    pending_preview: Option<ApiTask<Vec<u8>>>,
    pending_download: Option<ApiTask<Vec<u8>>>,
    pending_save: Option<ApiTask<bool>>,
    share: Option<FileShare>,
    preview_bytes: Option<Vec<u8>>,
    saving_file_name: String,
    error: String,
    notice: String,
}

impl PublicFileShareView {
    pub fn new(api_endpoint: String, token: Option<String>) -> Self {
        Self {
            api_endpoint,
            token,
            requested: false,
            image_loaders_installed: false,
            pending_share: None,
            pending_preview: None,
            pending_download: None,
            pending_save: None,
            share: None,
            preview_bytes: None,
            saving_file_name: String::new(),
            error: String::new(),
            notice: String::new(),
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, api: &ApiClient) {
        if !self.image_loaders_installed {
            egui_extras::install_image_loaders(ctx);
            self.image_loaders_installed = true;
        }
        if !self.requested {
            self.requested = true;
            if let Some(token) = self
                .token
                .as_deref()
                .filter(|token| !token.trim().is_empty())
            {
                self.pending_share =
                    Some(api.get_public_file_share_task(&self.api_endpoint, token));
            } else {
                self.error = "Link chia sẻ không có mã tệp hợp lệ.".to_owned();
            }
        }

        if let Some(task) = self.pending_share.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_share = None;
                match result {
                    Ok(share) => {
                        if let Some(file) = share.file.as_ref() {
                            if is_image_file(file.mime_type.as_deref(), &file.name) {
                                if let Some(token) = self.token.as_deref() {
                                    self.pending_preview =
                                        Some(api.download_public_file_share_task(
                                            &self.api_endpoint,
                                            token,
                                        ));
                                }
                            }
                        }
                        self.share = Some(share);
                        self.error.clear();
                    }
                    Err(error) => self.error = error,
                }
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            }
        }
        if let Some(task) = self.pending_preview.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_preview = None;
                match result {
                    Ok(bytes) => self.preview_bytes = Some(bytes),
                    Err(error) => self.error = error,
                }
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            }
        }
        if let Some(task) = self.pending_download.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_download = None;
                match result {
                    Ok(bytes) => {
                        if let Some(file) =
                            self.share.as_ref().and_then(|share| share.file.as_ref())
                        {
                            self.saving_file_name = file.name.clone();
                            self.pending_save =
                                Some(file_transfer::save_download_task(file.name.clone(), bytes));
                        }
                    }
                    Err(error) => self.error = error,
                }
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            }
        }
        if let Some(task) = self.pending_save.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_save = None;
                match result {
                    Ok(true) => self.notice = format!("Đã lưu {}.", self.saving_file_name),
                    Ok(false) => self.notice = "Đã hủy lưu tệp.".to_owned(),
                    Err(error) => self.error = error,
                }
                self.saving_file_name.clear();
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            }
        }

        let busy = self.pending_share.is_some()
            || self.pending_preview.is_some()
            || self.pending_download.is_some()
            || self.pending_save.is_some();
        let file = self.share.as_ref().and_then(|share| share.file.as_ref());
        let is_image =
            file.is_some_and(|file| is_image_file(file.mime_type.as_deref(), &file.name));
        let is_video =
            file.is_some_and(|file| is_video_file(file.mime_type.as_deref(), &file.name));

        ui.vertical_centered(|ui| {
            ui.add_space(24.0);
            ui.set_max_width(980.0);
            egui::Frame::group(ui.style())
                .fill(Color32::WHITE)
                .show(ui, |ui| {
                    ui.set_min_width(ui.available_width().min(920.0));
                    ui.horizontal(|ui| {
                        ui.vertical(|ui| {
                            ui.heading("Tệp được chia sẻ");
                            ui.label(file.map(|file| file.name.as_str()).unwrap_or(if busy {
                                "Đang tải..."
                            } else {
                                "Không tìm thấy tệp"
                            }));
                        });
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if let Some(share) = self.share.as_ref() {
                                ui.label(if share.is_active {
                                    "Đang hoạt động"
                                } else {
                                    "Đã tắt"
                                });
                            }
                        });
                    });
                    ui.separator();

                    if !self.error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    } else if self.share.is_none() {
                        ui.label("Đang kiểm tra liên kết chia sẻ...");
                    } else if let Some(bytes) = self.preview_bytes.as_ref() {
                        ui.add(
                            egui::Image::from_bytes(
                                "bytes://public-file-share-preview",
                                bytes.clone(),
                            )
                            .fit_to_fraction(Vec2::new(0.96, 0.68)),
                        );
                    } else if is_image {
                        ui.label("Đang chuẩn bị xem trước ảnh...");
                    } else if is_video {
                        ui.label("Mở video trong trình duyệt để phát.");
                        if let Some(token) = self.token.as_deref() {
                            ui.hyperlink_to(
                                "Xem video trực tiếp",
                                format!(
                                    "{}/files/share/{}/download",
                                    self.api_endpoint.trim_end_matches('/'),
                                    token
                                ),
                            );
                        }
                    } else if let Some(file) = file {
                        ui.label(RichText::new(&file.name).strong());
                        ui.label(
                            "Tệp này không hỗ trợ xem trước; hãy tải xuống để mở trên thiết bị.",
                        );
                    }

                    if !self.notice.is_empty() {
                        ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
                    }
                    ui.add_space(12.0);
                    ui.horizontal(|ui| {
                        if ui
                            .add_enabled(!busy && file.is_some(), egui::Button::new("Tải xuống"))
                            .clicked()
                        {
                            if let Some(token) = self.token.as_deref() {
                                self.pending_download = Some(
                                    api.download_public_file_share_task(&self.api_endpoint, token),
                                );
                                self.error.clear();
                                self.notice.clear();
                            }
                        }
                        if self.pending_preview.is_some() {
                            ui.label("Đang tải bản xem trước...");
                        } else if self.pending_save.is_some() {
                            ui.label(format!("Đang lưu {}...", self.saving_file_name));
                        }
                    });
                });
        });
    }
}

fn is_image_file(mime: Option<&str>, name: &str) -> bool {
    mime.is_some_and(|mime| mime.starts_with("image/"))
        || [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]
            .iter()
            .any(|extension| name.to_ascii_lowercase().ends_with(extension))
}

fn is_video_file(mime: Option<&str>, name: &str) -> bool {
    mime.is_some_and(|mime| mime.starts_with("video/"))
        || [".mp4", ".webm", ".ogg", ".ogv", ".mov", ".m4v"]
            .iter()
            .any(|extension| name.to_ascii_lowercase().ends_with(extension))
}

#[cfg(test)]
mod tests {
    use super::{is_image_file, is_video_file};

    #[test]
    fn public_share_preview_type_matches_legacy_mime_and_extension_rules() {
        assert!(is_image_file(Some("image/png"), "asset.bin"));
        assert!(is_image_file(None, "photo.JPEG"));
        assert!(!is_image_file(Some("application/pdf"), "report.pdf"));
        assert!(is_video_file(Some("video/mp4"), "clip.bin"));
        assert!(is_video_file(None, "clip.WEBM"));
        assert!(!is_video_file(Some("application/pdf"), "report.pdf"));
    }
}
