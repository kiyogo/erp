use crate::api::{ActivationAuthorization, ApiClient, ApiTask};
use crate::models::{Session, StorageMode};
use egui::{Color32, RichText, Vec2};

#[derive(Default)]
pub struct ActivationView {
    link_token: String,
    authorization: Option<ActivationAuthorization>,
    new_password: String,
    confirmation: String,
    error: String,
    status: String,
    should_authorize: bool,
    pending_authorize: Option<ApiTask<ActivationAuthorization>>,
    pending_activation: Option<ApiTask<Session>>,
}

pub enum ActivationOutcome {
    None,
    BackToLogin,
    Authenticated(Session),
}

impl ActivationView {
    pub fn with_link_token(link_token: Option<String>) -> Self {
        let mut view = Self {
            link_token: link_token.unwrap_or_default(),
            ..Self::default()
        };
        view.should_authorize = !view.link_token.trim().is_empty();
        view
    }

    pub fn clear_sensitive(&mut self) {
        self.link_token.clear();
        self.new_password.clear();
        self.confirmation.clear();
        self.authorization = None;
        self.pending_authorize = None;
        self.pending_activation = None;
        self.should_authorize = false;
    }

    pub fn render(
        &mut self,
        ui: &mut egui::Ui,
        ctx: &egui::Context,
        api: &ApiClient,
        endpoint: &str,
        mode: StorageMode,
    ) -> ActivationOutcome {
        let mut outcome = ActivationOutcome::None;

        if let Some(task) = self.pending_authorize.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_authorize = None;
                match result {
                    Ok(authorization) => {
                        self.authorization = Some(authorization);
                        self.link_token.clear();
                        self.error.clear();
                        self.status = "Liên kết hợp lệ. Hãy tạo mật khẩu cho tài khoản.".to_owned();
                    }
                    Err(error) => {
                        self.authorization = None;
                        self.error = activation_error_message(&error).to_owned();
                    }
                }
            } else {
                ctx.request_repaint();
            }
        }

        if let Some(task) = self.pending_activation.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_activation = None;
                match result {
                    Ok(session) => {
                        self.clear_sensitive();
                        outcome = ActivationOutcome::Authenticated(session);
                    }
                    Err(error) => self.error = activation_error_message(&error).to_owned(),
                }
            } else {
                ctx.request_repaint();
            }
        }

        if self.should_authorize && self.pending_authorize.is_none() {
            self.should_authorize = false;
            self.error.clear();
            self.status.clear();
            if self.link_token.trim().is_empty() {
                self.error = "Vui lòng nhập liên kết kích hoạt.".to_owned();
            } else {
                self.pending_authorize =
                    Some(api.authorize_activation_task(endpoint, &self.link_token));
            }
        }

        let mut go_back = false;
        egui::Frame::central_panel(ui.style()).show(ui, |ui| {
            ui.vertical_centered(|ui| {
                let compact = ui.available_width() < 520.0;
                let margin = if compact { 18.0 } else { 36.0 };
                let width = (ui.available_width() - margin * 2.0).clamp(180.0, 380.0);
                ui.add_space(if compact { 24.0 } else { 64.0 });
                egui::Frame::window(ui.style())
                    .fill(Color32::WHITE)
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                    .inner_margin(egui::Margin::same(margin))
                    .rounding(egui::Rounding::same(12.0))
                    .shadow(egui::epaint::Shadow {
                        offset: Vec2::new(0.0, 8.0),
                        blur: 24.0,
                        spread: 0.0,
                        color: Color32::from_black_alpha(20),
                    })
                    .show(ui, |ui| {
                        ui.set_max_width(width);
                        ui.horizontal(|ui| {
                            let (rect, _) = ui.allocate_exact_size(
                                Vec2::splat(36.0),
                                egui::Sense::hover(),
                            );
                            ui.painter()
                                .rect_filled(rect, 8.0, Color32::from_rgb(0, 150, 136));
                            ui.painter().text(
                                rect.center(),
                                egui::Align2::CENTER_CENTER,
                                "K",
                                egui::FontId::proportional(20.0),
                                Color32::WHITE,
                            );
                            ui.add_space(10.0);
                            ui.label(
                                RichText::new("KIYOVN")
                                    .size(22.0)
                                    .strong()
                                    .color(Color32::from_rgb(30, 41, 59)),
                            );
                        });
                        ui.add_space(10.0);
                        ui.label(
                            RichText::new("Kích hoạt tài khoản nhân sự")
                                .size(13.0)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                        ui.add_space(18.0);

                        if let Some(authorization) = self.authorization.as_ref() {
                            ui.label(
                                RichText::new(format!(
                                    "{} · {}",
                                    authorization.user.name, authorization.user.email
                                ))
                                .size(12.0)
                                .color(Color32::from_rgb(51, 65, 85)),
                            );
                            ui.add_space(14.0);
                            ui.label("Mật khẩu mới (12–256 ký tự, gồm chữ hoa, chữ thường, số và ký hiệu)");
                            ui.add(
                                egui::TextEdit::singleline(&mut self.new_password)
                                    .password(true)
                                    .hint_text("Mật khẩu mới")
                                    .desired_width(width),
                            );
                            ui.add_space(12.0);
                            ui.label("Nhập lại mật khẩu");
                            ui.add(
                                egui::TextEdit::singleline(&mut self.confirmation)
                                    .password(true)
                                    .hint_text("Xác nhận mật khẩu")
                                    .desired_width(width),
                            );
                            ui.add_space(16.0);
                            let busy = self.pending_activation.is_some();
                            let button = egui::Button::new(
                                RichText::new(if busy {
                                    "Đang kích hoạt…"
                                } else {
                                    "Kích hoạt và tiếp tục"
                                })
                                .strong()
                                .color(Color32::WHITE),
                            )
                            .fill(Color32::from_rgb(0, 150, 136))
                            .min_size(Vec2::new(width, 40.0))
                            .rounding(6.0);
                            if ui.add_enabled(!busy, button).clicked() {
                                self.error = validate_activation_passwords(
                                    &self.new_password,
                                    &self.confirmation,
                                )
                                .err()
                                .unwrap_or_default();
                                if self.error.is_empty() {
                                    self.pending_activation = Some(api.set_activation_password_task(
                                        endpoint,
                                        &authorization.activation_token,
                                        &self.new_password,
                                        mode,
                                    ));
                                }
                            }
                            ui.add_space(8.0);
                            if ui.small_button("Dùng liên kết khác").clicked() {
                                self.authorization = None;
                                self.new_password.clear();
                                self.confirmation.clear();
                                self.status.clear();
                                self.error.clear();
                            }
                        } else {
                            if self.pending_authorize.is_some() {
                                ui.label("Đang kiểm tra liên kết kích hoạt…");
                                ui.add_space(12.0);
                            }
                            ui.label("Mã liên kết kích hoạt");
                            ui.add(
                                egui::TextEdit::singleline(&mut self.link_token)
                                    .password(true)
                                    .hint_text("Dán mã kích hoạt từ email")
                                    .desired_width(width),
                            );
                            ui.add_space(14.0);
                            let busy = self.pending_authorize.is_some();
                            let button = egui::Button::new(
                                RichText::new(if busy {
                                    "Đang kiểm tra…"
                                } else {
                                    "Kiểm tra liên kết"
                                })
                                .strong()
                                .color(Color32::WHITE),
                            )
                            .fill(Color32::from_rgb(0, 150, 136))
                            .min_size(Vec2::new(width, 40.0))
                            .rounding(6.0);
                            if ui.add_enabled(!busy, button).clicked() {
                                self.should_authorize = true;
                            }
                        }

                        if !self.status.is_empty() {
                            ui.add_space(10.0);
                            ui.label(
                                RichText::new(&self.status)
                                    .size(12.0)
                                    .color(Color32::from_rgb(5, 150, 105)),
                            );
                        }
                        if !self.error.is_empty() {
                            ui.add_space(10.0);
                            egui::Frame::none()
                                .fill(Color32::from_rgb(254, 242, 242))
                                .stroke(egui::Stroke::new(
                                    1.0,
                                    Color32::from_rgb(254, 202, 202),
                                ))
                                .rounding(6.0)
                                .inner_margin(8.0)
                                .show(ui, |ui| {
                                    ui.label(
                                        RichText::new(&self.error)
                                            .size(12.0)
                                            .color(Color32::from_rgb(185, 28, 28)),
                                    );
                                });
                        }
                        ui.add_space(12.0);
                        if ui.small_button("Quay lại đăng nhập").clicked() {
                            go_back = true;
                        }
                    });
                ui.add_space(16.0);
                ui.label(
                    RichText::new("KIYOVN Enterprise · Rust + egui")
                        .size(11.0)
                        .color(Color32::from_rgb(148, 163, 184)),
                );
            });
        });

        if go_back {
            self.clear_sensitive();
            ActivationOutcome::BackToLogin
        } else {
            outcome
        }
    }
}

fn validate_activation_passwords(password: &str, confirmation: &str) -> Result<(), String> {
    let password = password.trim();
    if !(12..=256).contains(&password.chars().count()) {
        return Err("Mật khẩu cần dài từ 12 đến 256 ký tự.".to_owned());
    }
    if !password.chars().any(char::is_lowercase)
        || !password.chars().any(char::is_uppercase)
        || !password.chars().any(|character| character.is_ascii_digit())
        || !password
            .chars()
            .any(|character| !character.is_alphanumeric() && !character.is_whitespace())
    {
        return Err("Mật khẩu cần có chữ hoa, chữ thường, số và ký hiệu.".to_owned());
    }
    if password != confirmation.trim() {
        return Err("Mật khẩu nhập lại chưa khớp.".to_owned());
    }
    Ok(())
}

fn activation_error_message(error: &str) -> &str {
    match error {
        "Activation link is invalid or has already been used." => {
            "Liên kết kích hoạt không hợp lệ hoặc đã được sử dụng."
        }
        "Activation link has expired." => "Liên kết kích hoạt đã hết hạn.",
        "Activation link is no longer valid." => "Liên kết kích hoạt không còn hiệu lực.",
        "This activation link is no longer valid." => "Liên kết kích hoạt không còn hiệu lực.",
        "Activation session is invalid or expired." => {
            "Phiên kích hoạt không hợp lệ hoặc đã hết hạn."
        }
        "Activation session is invalid." => "Phiên kích hoạt không hợp lệ.",
        "Activation link has expired or was already used." => {
            "Liên kết kích hoạt đã hết hạn hoặc đã được sử dụng."
        }
        "This account has already been activated." => "Tài khoản này đã được kích hoạt.",
        "Google account linking is not configured on this Kiyo API instance." => {
            "Máy chủ này chưa cấu hình liên kết tài khoản Google."
        }
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::{activation_error_message, validate_activation_passwords};

    #[test]
    fn activation_password_validation_matches_backend_policy() {
        assert!(validate_activation_passwords("Short-1!", "Short-1!").is_err());
        assert!(validate_activation_passwords("LongPassword123", "LongPassword123").is_err());
        assert!(validate_activation_passwords("LongPassword-123!", "different").is_err());
        assert!(validate_activation_passwords("LongPassword-123!", "LongPassword-123!").is_ok());
    }

    #[test]
    fn activation_api_errors_are_presented_in_vietnamese() {
        assert_eq!(
            activation_error_message("Activation link is invalid or has already been used."),
            "Liên kết kích hoạt không hợp lệ hoặc đã được sử dụng."
        );
        assert_eq!(
            activation_error_message("an unknown server error"),
            "an unknown server error"
        );
    }
}
