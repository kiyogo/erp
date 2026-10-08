use crate::api::{ApiClient, ApiTask};
use crate::models::{Session, StorageMode};
use egui::{Color32, RichText, Ui};

pub struct SettingsView {
    pub mode: StorageMode,
    pub endpoint: String,
    pub test_result: String,
    pub is_testing: bool,
    pub notice: String,
    initialized_from_session: bool,
    pending_health: Option<ApiTask<String>>,
    current_password: String,
    new_password: String,
    confirm_password: String,
    password_error: String,
    password_notice: String,
    pending_password_change: Option<ApiTask<String>>,
}

impl Default for SettingsView {
    fn default() -> Self {
        Self {
            mode: StorageMode::KiyoCloud,
            endpoint: StorageMode::KiyoCloud.default_endpoint().to_string(),
            test_result: String::new(),
            is_testing: false,
            notice: String::new(),
            initialized_from_session: false,
            pending_health: None,
            current_password: String::new(),
            new_password: String::new(),
            confirm_password: String::new(),
            password_error: String::new(),
            password_notice: String::new(),
            pending_password_change: None,
        }
    }
}

impl SettingsView {
    pub fn clear_sensitive(&mut self) {
        self.current_password.clear();
        self.new_password.clear();
        self.confirm_password.clear();
        self.password_error.clear();
        self.password_notice.clear();
        self.pending_password_change = None;
        self.initialized_from_session = false;
    }

    pub fn render_security(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
    ) {
        if let Some(task) = self.pending_password_change.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_password_change = None;
                match result {
                    Ok(message) => {
                        self.current_password.clear();
                        self.new_password.clear();
                        self.confirm_password.clear();
                        self.password_error.clear();
                        self.password_notice = message;
                    }
                    Err(error) => {
                        self.current_password.clear();
                        self.password_error = error;
                    }
                }
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            }
        }

        ui.heading("Bảo mật tài khoản");
        ui.label("Đổi mật khẩu đăng nhập cho tài khoản hiện tại.");
        ui.add_space(12.0);
        egui::Frame::none()
            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
            .rounding(8.0)
            .inner_margin(16.0)
            .show(ui, |ui| {
                ui.set_max_width(520.0);
                ui.label(RichText::new("Mật khẩu hiện tại").strong());
                ui.add(
                    egui::TextEdit::singleline(&mut self.current_password)
                        .password(true)
                        .desired_width(420.0),
                );
                ui.add_space(10.0);
                ui.label(RichText::new("Mật khẩu mới").strong());
                ui.add(
                    egui::TextEdit::singleline(&mut self.new_password)
                        .password(true)
                        .desired_width(420.0),
                );
                ui.label("Từ 12 đến 256 ký tự; cần chữ hoa, chữ thường, số và ký tự đặc biệt.");
                ui.add_space(10.0);
                ui.label(RichText::new("Xác nhận mật khẩu mới").strong());
                ui.add(
                    egui::TextEdit::singleline(&mut self.confirm_password)
                        .password(true)
                        .desired_width(420.0),
                );
                ui.add_space(12.0);

                if !self.password_error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.password_error);
                }
                if !self.password_notice.is_empty() {
                    ui.colored_label(Color32::from_rgb(22, 101, 52), &self.password_notice);
                }

                let pending = self.pending_password_change.is_some();
                if ui
                    .add_enabled(
                        !pending,
                        egui::Button::new(if pending {
                            "Đang cập nhật..."
                        } else {
                            "Cập nhật mật khẩu"
                        }),
                    )
                    .clicked()
                {
                    self.password_error.clear();
                    self.password_notice.clear();
                    match validate_password_change(
                        &self.current_password,
                        &self.new_password,
                        &self.confirm_password,
                    ) {
                        Ok(()) => {
                            self.pending_password_change = Some(api.change_password_task(
                                session,
                                &self.current_password,
                                &self.new_password,
                                &self.confirm_password,
                            ));
                        }
                        Err(message) => self.password_error = message.to_string(),
                    }
                }
            });
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &mut Session,
        api: &ApiClient,
    ) {
        if !self.initialized_from_session {
            self.mode = session.mode;
            self.endpoint = session.endpoint.clone();
            self.initialized_from_session = true;
        }
        if let Some(task) = self.pending_health.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_health = None;
                self.is_testing = false;
                self.test_result = result.unwrap_or_else(|error| format!("Lỗi: {error}"));
            } else {
                ctx.request_repaint();
            }
        }

        ui.vertical(|ui| {
            ui.label(RichText::new("CẤU HÌNH HỆ THỐNG & PHÂN VÙNG LƯU TRỮ").size(11.0).strong().color(Color32::from_rgb(0, 150, 136)));
            ui.heading("Cài đặt hệ thống");
            ui.label("Chuyển đổi phân vùng lưu trữ dữ liệu (Kiyo Cloud / Self-Hosted Linux / Local Admin) và kiểm tra kết nối.");

            if !self.notice.is_empty() {
                ui.add_space(8.0);
                egui::Frame::none()
                    .fill(Color32::from_rgb(240, 253, 244))
                    .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(187, 247, 208)))
                    .rounding(6.0)
                    .inner_margin(8.0)
                    .show(ui, |ui| {
                        ui.label(RichText::new(&self.notice).color(Color32::from_rgb(22, 101, 52)));
                    });
            }

            ui.add_space(14.0);

            egui::Frame::none()
                .fill(Color32::WHITE)
                .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                .rounding(8.0)
                .inner_margin(16.0)
                .show(ui, |ui| {
                    ui.label(RichText::new("CHẾ ĐỘ LƯU TRỮ DỮ LIỆU").strong().color(Color32::from_rgb(0, 150, 136)));
                    ui.add_space(6.0);

                    ui.radio_value(&mut self.mode, StorageMode::KiyoCloud, "Kiyo Cloud API (Đồng bộ đám mây Kiyo chính thức)");
                    ui.label(RichText::new("  Toàn bộ dữ liệu được quản lý và bảo mật bởi cụm máy chủ đám mây Kiyo Cloud.").size(11.0).color(Color32::from_rgb(100, 116, 139)));
                    ui.add_space(8.0);

                    ui.radio_value(&mut self.mode, StorageMode::SelfHosted, "Self Hosted (Máy chủ Linux riêng của bên thứ 3)");
                    ui.label(RichText::new("  Cài đặt độc lập trên VPS / Server Linux của doanh nghiệp bạn, tự cấu hình toàn quyền.").size(11.0).color(Color32::from_rgb(100, 116, 139)));
                    ui.add_space(8.0);

                    if session.user.role == "ADMIN" {
                        ui.radio_value(&mut self.mode, StorageMode::LocalAdmin, "Local Admin (Lưu trực tiếp SQLite trên máy tính cá nhân)");
                        ui.label(RichText::new("  Lưu dữ liệu tại ổ cứng cục bộ (Chỉ khả dụng cho tài khoản Quản trị viên).").size(11.0).color(Color32::from_rgb(100, 116, 139)));
                    }

                    ui.add_space(16.0);
                    ui.separator();
                    ui.add_space(10.0);

                    ui.label("Địa chỉ URL máy chủ API:");
                    ui.add(egui::TextEdit::singleline(&mut self.endpoint).desired_width(400.0));

                    ui.add_space(12.0);
                    ui.horizontal(|ui| {
                        if ui
                            .add_enabled(!self.is_testing, egui::Button::new(if self.is_testing {
                                "Đang kiểm tra..."
                            } else {
                                "Kiểm tra kết nối máy chủ"
                            }))
                            .clicked()
                        {
                            self.is_testing = true;
                            self.test_result.clear();
                            self.pending_health = Some(api.health_task(&self.endpoint));
                        }

                        let save_btn = egui::Button::new(RichText::new("Lưu cấu hình").strong().color(Color32::WHITE))
                            .fill(Color32::from_rgb(0, 150, 136));
                        if ui.add(save_btn).clicked() {
                            session.mode = self.mode;
                            session.endpoint = self.endpoint.clone();
                            self.notice = format!("Đã áp dụng chế độ {} ({})!", self.mode.label(), self.endpoint);
                        }
                    });

                    if !self.test_result.is_empty() {
                        ui.add_space(8.0);
                        let color = if self.test_result.contains("thành công") { Color32::from_rgb(22, 163, 74) } else { Color32::from_rgb(220, 38, 38) };
                        ui.label(RichText::new(&self.test_result).color(color));
                    }
                });
        });
    }
}

fn validate_password_change(
    current_password: &str,
    new_password: &str,
    confirm_password: &str,
) -> Result<(), &'static str> {
    if current_password.is_empty() {
        return Err("Vui lòng nhập mật khẩu hiện tại.");
    }
    let length = new_password.chars().count();
    if !(12..=256).contains(&length) {
        return Err("Mật khẩu mới phải dài từ 12 đến 256 ký tự.");
    }
    if !new_password.chars().any(char::is_lowercase)
        || !new_password.chars().any(char::is_uppercase)
        || !new_password.chars().any(|c| c.is_ascii_digit())
        || !new_password
            .chars()
            .any(|c| !c.is_alphanumeric() && !c.is_whitespace())
    {
        return Err("Mật khẩu mới cần chữ hoa, chữ thường, số và ký tự đặc biệt.");
    }
    if new_password != confirm_password {
        return Err("Xác nhận mật khẩu mới không trùng khớp.");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_password_change;

    #[test]
    fn password_change_validates_fields() {
        assert!(validate_password_change("", "NewPassword-123!", "NewPassword-123!").is_err());
        assert!(validate_password_change("OldPassword-123!", "short", "short").is_err());
        assert!(
            validate_password_change("OldPassword-123!", "NewPassword123é", "NewPassword123é")
                .is_err()
        );
        assert!(validate_password_change("OldPassword-123!", "NewPassword-123!", "wrong").is_err());
        assert!(
            validate_password_change("OldPassword-123!", "NewPassword-123!", "NewPassword-123!")
                .is_ok()
        );
    }
}
