use crate::api::{ApiClient, ApiTask};
use crate::models::{Session, StorageMode};
use egui::{
    Align, Align2, Color32, Direction, Layout, RichText, TextureHandle, TextureId, Ui, UiBuilder,
    Vec2,
};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum LoginIcon {
    UserOutlined,
    LockOutlined,
}

impl LoginIcon {
    #[cfg(test)]
    const ALL: [Self; 2] = [Self::UserOutlined, Self::LockOutlined];

    const fn name(self) -> &'static str {
        match self {
            Self::UserOutlined => "UserOutlined",
            Self::LockOutlined => "LockOutlined",
        }
    }

    const fn svg_bytes(self) -> &'static [u8] {
        match self {
            Self::UserOutlined => {
                include_bytes!("../../assets/nav-icons/UserOutlined.svg")
            }
            Self::LockOutlined => {
                include_bytes!("../../assets/nav-icons/LockOutlined.svg")
            }
        }
    }
}

#[derive(Default)]
pub struct LoginView {
    pub email: String,
    pub password: String,
    pub endpoint: String,
    pub mode: StorageMode,
    pub error_msg: String,
    pub is_submitting: bool,
    pending_login: Option<ApiTask<Session>>,
    icon_textures: HashMap<LoginIcon, TextureHandle>,
    google_icon_texture: Option<TextureHandle>,
    #[cfg(test)]
    last_card_rect: Option<egui::Rect>,
}

impl LoginView {
    pub fn new() -> Self {
        let mode = StorageMode::KiyoCloud;
        let default_endpoint = mode.default_endpoint().to_owned();
        #[cfg(not(target_arch = "wasm32"))]
        let endpoint =
            configured_endpoint(std::env::var("KIYO_API_ENDPOINT").ok(), default_endpoint);
        #[cfg(target_arch = "wasm32")]
        let endpoint = default_endpoint;
        Self {
            endpoint,
            mode,
            ..Default::default()
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, api: &ApiClient) -> Option<Session> {
        let mut session_out = None;

        if let Some(task) = self.pending_login.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_login = None;
                self.is_submitting = false;
                match result {
                    Ok(session) => {
                        self.password.clear();
                        session_out = Some(session);
                    }
                    Err(error) => self.error_msg = error,
                }
            } else {
                ctx.request_repaint();
            }
        }

        let available_height = ui.available_height();
        ui.vertical_centered(|ui| {
            ui.spacing_mut().item_spacing = Vec2::ZERO;
            let available_width = ui.available_width();
            let card_width = available_width.min(360.0);
            let horizontal_margin = ((card_width - 288.0) / 2.0).max(0.0);
            let control_width = (card_width - horizontal_margin * 2.0 - 2.0).max(160.0);
            let extra_error_height = if self.error_msg.is_empty() { 0.0 } else { 54.0 };
            let target_card_height = 445.5 + extra_error_height;
            ui.add_space(((available_height - target_card_height) / 2.0).max(12.0));

            let _frame_response = egui::Frame::none()
                .fill(Color32::WHITE)
                .stroke(egui::Stroke::new(1.0, Color32::from_rgb(224, 224, 224)))
                .inner_margin(egui::Margin::symmetric(horizontal_margin + 1.0, 41.0))
                .rounding(egui::Rounding::same(8.0))
                .shadow(egui::epaint::Shadow {
                    offset: Vec2::ZERO,
                    blur: 12.0,
                    spread: 0.0,
                    color: Color32::from_black_alpha(8),
                })
                .show(ui, |ui| {
                    ui.spacing_mut().item_spacing = Vec2::ZERO;
                    ui.set_max_width(control_width);
                    ui.set_min_width(control_width);
                    ui.set_min_height(363.5 + extra_error_height);

                    ui.horizontal(|ui| {
                        let (rect, _) =
                            ui.allocate_exact_size(Vec2::splat(34.0), egui::Sense::hover());
                        ui.painter()
                            .rect_filled(rect, 7.0, Color32::from_rgb(24, 24, 27));
                        let mut logo_ui = ui.new_child(
                            UiBuilder::new()
                                .id_salt("login-logo-letter")
                                .max_rect(rect)
                                .layout(Layout::centered_and_justified(Direction::TopDown)),
                        );
                        logo_ui.add(
                            egui::Label::new(
                                RichText::new("K").size(16.0).strong().color(Color32::WHITE),
                            )
                            .halign(Align::Center)
                            .selectable(false),
                        );
                        ui.add_space(10.0);
                        ui.label(
                            RichText::new("KIYOVN")
                                .size(16.0)
                                .strong()
                                .extra_letter_spacing(0.3)
                                .color(Color32::from_rgb(24, 24, 27)),
                        );
                    });

                    ui.add_space(24.0);
                    ui.add_sized(
                        Vec2::new(control_width, 19.5),
                        egui::Label::new(
                            RichText::new("Hệ thống Quản lý Doanh nghiệp KIYOVN")
                                .size(13.0)
                                .color(Color32::from_rgb(117, 117, 117)),
                        )
                        .halign(Align::Min),
                    );
                    ui.add_space(20.0);

                    if !self.error_msg.is_empty() {
                        egui::Frame::none()
                            .fill(Color32::from_rgb(255, 242, 240))
                            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(255, 204, 199)))
                            .rounding(egui::Rounding::same(5.0))
                            .inner_margin(egui::Margin::same(8.0))
                            .show(ui, |ui| {
                                ui.label(
                                    RichText::new(&self.error_msg)
                                        .size(12.0)
                                        .color(Color32::from_rgb(163, 21, 21)),
                                );
                            });
                        ui.add_space(16.0);
                    }

                    render_login_input(
                        ui,
                        ctx,
                        &mut self.icon_textures,
                        &mut self.email,
                        LoginIcon::UserOutlined,
                        "Email hoặc tên đăng nhập",
                        control_width,
                        false,
                        254,
                    );
                    ui.add_space(16.0);
                    render_login_input(
                        ui,
                        ctx,
                        &mut self.icon_textures,
                        &mut self.password,
                        LoginIcon::LockOutlined,
                        "Mật khẩu",
                        control_width,
                        true,
                        256,
                    );

                    ui.add_space(20.0);
                    let (login_rect, login_response) = ui
                        .allocate_exact_size(Vec2::new(control_width, 38.0), egui::Sense::click());
                    crate::visual_test::record("login.submit", login_rect);
                    let login_fill = if self.is_submitting {
                        Color32::from_rgb(122, 180, 173)
                    } else if login_response.hovered() {
                        Color32::from_rgb(0, 121, 107)
                    } else {
                        Color32::from_rgb(0, 150, 136)
                    };
                    let login_paint_rect = ui.painter().round_rect_to_pixels(login_rect);
                    ui.painter().rect_filled(login_paint_rect, 6.0, login_fill);
                    ui.painter().text(
                        login_paint_rect.center(),
                        Align2::CENTER_CENTER,
                        if self.is_submitting {
                            "Đang xác thực..."
                        } else {
                            "Đăng nhập hệ thống"
                        },
                        egui::FontId::proportional(14.0),
                        Color32::WHITE,
                    );
                    if login_response.clicked() && !self.is_submitting {
                        let email = self.email.trim();
                        let password = self.password.trim();
                        if email.is_empty() || password.is_empty() {
                            self.error_msg =
                                "Vui lòng nhập đầy đủ tài khoản/email và mật khẩu".to_owned();
                        } else if password.chars().count() < 6 {
                            self.error_msg = "Mật khẩu phải có ít nhất 6 ký tự".to_owned();
                        } else {
                            self.is_submitting = true;
                            self.error_msg.clear();
                            self.pending_login =
                                Some(api.login_task(&self.endpoint, email, password, self.mode));
                        }
                    }

                    ui.add_space(18.0);
                    render_login_divider(ui, control_width);
                    ui.add_space(14.0);

                    let (google_rect, google_response) = ui
                        .allocate_exact_size(Vec2::new(control_width, 40.0), egui::Sense::click());
                    crate::visual_test::record("login.google", google_rect);
                    let google_fill = if google_response.hovered() {
                        Color32::from_rgb(249, 250, 251)
                    } else {
                        Color32::WHITE
                    };
                    let google_border = if google_response.hovered() {
                        Color32::from_rgb(156, 163, 175)
                    } else {
                        Color32::from_rgb(209, 213, 219)
                    };
                    let google_paint_rect = ui.painter().round_rect_to_pixels(google_rect);
                    ui.painter()
                        .rect_filled(google_paint_rect, 6.0, google_fill);
                    ui.painter().rect_stroke(
                        google_paint_rect,
                        6.0,
                        egui::Stroke::new(1.0, google_border),
                    );
                    let google_icon = ensure_google_texture(ctx, &mut self.google_icon_texture);
                    ui.painter().image(
                        google_icon,
                        egui::Rect::from_center_size(
                            egui::pos2(
                                google_paint_rect.center().x - 78.6,
                                google_paint_rect.center().y,
                            ),
                            Vec2::splat(18.0),
                        ),
                        egui::Rect::from_min_max(egui::Pos2::ZERO, egui::pos2(1.0, 1.0)),
                        Color32::WHITE,
                    );
                    ui.painter().text(
                        egui::pos2(
                            google_paint_rect.center().x + 14.0,
                            google_paint_rect.center().y,
                        ),
                        Align2::CENTER_CENTER,
                        "Đăng nhập bằng Google",
                        egui::FontId::proportional(13.5),
                        Color32::from_rgb(55, 65, 81),
                    );
                    if google_response.clicked() && !self.is_submitting {
                        // The legacy API's Google route accepted unsigned identity data and could
                        // silently authenticate as the first user. Keep the legacy affordance,
                        // but do not reproduce that authentication vulnerability.
                        self.error_msg =
                            "Google SSO chưa được cấu hình an toàn trên máy chủ này.".to_owned();
                    }

                    ui.add_space(20.0);
                    ui.vertical_centered(|ui| {
                        ui.label(
                            RichText::new("KIYOVN Enterprise v2.0 · © 2026")
                                .size(12.0)
                                .color(Color32::from_rgb(156, 163, 175)),
                        );
                    });
                });

            crate::visual_test::record("login.card", _frame_response.response.rect);
            #[cfg(test)]
            {
                self.last_card_rect = Some(_frame_response.response.rect);
            }
        });

        session_out
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn configured_endpoint(configured: Option<String>, default_endpoint: String) -> String {
    configured
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(default_endpoint)
}

fn render_login_input(
    ui: &mut Ui,
    ctx: &egui::Context,
    icon_textures: &mut HashMap<LoginIcon, TextureHandle>,
    value: &mut String,
    icon: LoginIcon,
    hint: &str,
    width: f32,
    password: bool,
    char_limit: usize,
) {
    let texture = login_icon_texture(ctx, icon_textures, icon);
    let (rect, _) = ui.allocate_exact_size(Vec2::new(width, 29.0), egui::Sense::hover());
    let rect = ui.painter().round_rect_to_pixels(rect);
    ui.painter().rect_filled(rect, 6.0, Color32::WHITE);

    let icon_rect = ui.painter().round_rect_to_pixels(egui::Rect::from_min_size(
        egui::pos2(rect.left() + 12.0, rect.center().y - 7.0),
        Vec2::splat(14.0),
    ));
    ui.painter().image(
        texture,
        icon_rect,
        egui::Rect::from_min_max(egui::Pos2::ZERO, egui::pos2(1.0, 1.0)),
        Color32::from_rgb(156, 163, 175),
    );

    let text_rect = ui.painter().round_rect_to_pixels(egui::Rect::from_min_size(
        egui::pos2(rect.left() + 35.0, rect.top() + 7.0),
        Vec2::new(width - 48.0, 15.0),
    ));
    let mut input_ui = ui.new_child(
        UiBuilder::new()
            .id_salt(("login-input", icon.name()))
            .max_rect(text_rect)
            .layout(Layout::left_to_right(Align::Center)),
    );
    let mut edit = egui::TextEdit::singleline(value)
        .font(egui::FontId::new(
            13.5,
            egui::FontFamily::Name("legacy-controls".into()),
        ))
        .frame(false)
        .margin(Vec2::ZERO)
        .hint_text(hint)
        .char_limit(char_limit)
        .desired_width(text_rect.width());
    if password {
        edit = edit.password(true);
    }
    let response = input_ui.add_sized(text_rect.size(), edit);
    crate::visual_test::record(
        if password {
            "login.password"
        } else {
            "login.email"
        },
        rect,
    );
    let border = if response.has_focus() {
        Color32::from_rgb(64, 169, 255)
    } else if response.hovered() {
        Color32::from_rgb(191, 191, 191)
    } else {
        Color32::from_rgb(217, 217, 217)
    };
    ui.painter()
        .rect_stroke(rect, 6.0, egui::Stroke::new(1.0, border));
}

fn login_icon_texture(
    ctx: &egui::Context,
    textures: &mut HashMap<LoginIcon, TextureHandle>,
    icon: LoginIcon,
) -> TextureId {
    textures
        .entry(icon)
        .or_insert_with(|| {
            let image = egui_extras::image::load_svg_bytes(icon.svg_bytes())
                .unwrap_or_else(|error| panic!("{} SVG failed to rasterize: {error}", icon.name()));
            ctx.load_texture(icon.name(), image, egui::TextureOptions::LINEAR)
        })
        .id()
}

fn ensure_google_texture(ctx: &egui::Context, texture: &mut Option<TextureHandle>) -> TextureId {
    texture
        .get_or_insert_with(|| {
            let image =
                egui_extras::image::load_image_bytes(include_bytes!("../../assets/google.png"))
                    .expect("bundled legacy Google logo PNG must be valid");
            ctx.load_texture("google-login-icon", image, egui::TextureOptions::LINEAR)
        })
        .id()
}

fn render_login_divider(ui: &mut Ui, width: f32) {
    let (rect, _) = ui.allocate_exact_size(Vec2::new(width, 18.0), egui::Sense::hover());
    let rect = ui.painter().round_rect_to_pixels(rect);
    let center = rect.center();
    let stroke = egui::Stroke::new(1.0, Color32::from_rgb(229, 231, 235));
    let half_label_and_gaps = 24.0;
    ui.painter().line_segment(
        [
            rect.left_center(),
            egui::pos2(center.x - half_label_and_gaps, center.y),
        ],
        stroke,
    );
    ui.painter().line_segment(
        [
            egui::pos2(center.x + half_label_and_gaps, center.y),
            rect.right_center(),
        ],
        stroke,
    );
    ui.painter().text(
        center,
        Align2::CENTER_CENTER,
        "Hoặc",
        egui::FontId::proportional(12.0),
        Color32::from_rgb(156, 163, 175),
    );
}

#[cfg(test)]
mod tests {
    use super::{LoginIcon, LoginView, configured_endpoint};
    use crate::api::ApiClient;
    use egui::{CentralPanel, Context, Pos2, RawInput, Rect, Vec2};

    #[test]
    fn native_endpoint_override_is_optional_and_ignores_blank_values() {
        assert_eq!(
            configured_endpoint(
                Some("http://127.0.0.1:3230/api/v1".to_owned()),
                "default".to_owned()
            ),
            "http://127.0.0.1:3230/api/v1"
        );
        assert_eq!(
            configured_endpoint(Some("  ".to_owned()), "default".to_owned()),
            "default"
        );
        assert_eq!(configured_endpoint(None, "default".to_owned()), "default");
    }

    #[test]
    fn legacy_login_icons_and_google_logo_load_from_bundled_assets() {
        for icon in LoginIcon::ALL {
            let image = egui_extras::image::load_svg_bytes(icon.svg_bytes())
                .unwrap_or_else(|error| panic!("{} SVG failed: {error}", icon.name()));
            assert_eq!(image.size, [64, 64]);
            assert!(image.pixels.iter().any(|pixel| pixel.a() > 0));
        }
        let google =
            egui_extras::image::load_image_bytes(include_bytes!("../../assets/google.png"))
                .expect("legacy Google logo PNG should decode");
        assert_eq!(google.size, [250, 256]);
        assert!(google.pixels.iter().any(|pixel| pixel.r() > pixel.g()));
        assert!(google.pixels.iter().any(|pixel| pixel.g() > pixel.r()));
        assert!(google.pixels.iter().any(|pixel| pixel.b() > pixel.r()));
    }

    #[test]
    fn login_card_is_centered_and_matches_the_legacy_desktop_width() {
        for (width, height) in [(1280.0, 800.0), (390.0, 844.0)] {
            let screen = Rect::from_min_size(Pos2::ZERO, Vec2::new(width, height));
            let context = Context::default();
            crate::native_text::setup_fonts(&context);
            crate::native_text::setup_style(&context);
            let api = ApiClient::default();
            let mut login = LoginView::new();
            let _ = context.run(
                RawInput {
                    screen_rect: Some(screen),
                    ..Default::default()
                },
                |ctx| {
                    CentralPanel::default().show(ctx, |ui| {
                        login.render(ui, ctx, &api);
                    });
                },
            );
            let card = login.last_card_rect.expect("login card should render");
            let painted_card_width = card.width();
            let painted_card_height = card.height();
            assert!(
                (painted_card_width - 360.0).abs() < 1.0,
                "width={width}, painted_card_width={painted_card_width}, card={card:?}"
            );
            assert!(
                (card.center().x - screen.center().x).abs() < 1.0,
                "width={width}, card={card:?}"
            );
            assert!(
                (card.center().y - screen.center().y).abs() < 8.0,
                "height={height}, card={card:?}"
            );
            assert!(
                (painted_card_height - 445.5).abs() < 1.0,
                "height={height}, painted_card_height={painted_card_height}, card={card:?}"
            );
        }
    }
}
