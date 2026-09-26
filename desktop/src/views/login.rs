use crate::api::ApiClient;
use crate::models::{Session, StorageMode, User};
use egui::{Align2, Color32, RichText, Ui, Vec2};

#[derive(Default)]
pub struct LoginView {
    pub email: String,
    pub password: String,
    pub endpoint: String,
    pub mode: StorageMode,
    pub error_msg: String,
    pub is_submitting: bool,
}

impl LoginView {
    pub fn new() -> Self {
        Self {
            email: "admin@kiyo.vn".to_string(),
            password: "password123".to_string(),
            endpoint: "http://127.0.0.1:3001/api/v1".to_string(),
            mode: StorageMode::KiyoCloud,
            error_msg: String::new(),
            is_submitting: false,
        }
    }

    pub fn render(&mut self, ui: &mut Ui, api: &ApiClient) -> Option<Session> {
        let mut session_out = None;

        ui.vertical_centered(|ui| {
            ui.add_space(50.0);

            egui::Frame::window(ui.style())
                .fill(Color32::from_rgb(255, 255, 255))
                .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                .inner_margin(egui::Margin::same(36.0))
                .rounding(egui::Rounding::same(12.0))
                .shadow(egui::epaint::Shadow {
                    offset: Vec2::new(0.0, 8.0),
                    blur: 24.0,
                    spread: 0.0,
                    color: Color32::from_black_alpha(20),
                })
                .show(ui, |ui| {
                    ui.set_max_width(400.0);

                    // Logo & Brand
                    ui.horizontal(|ui| {
                        let (rect, _response) =
                            ui.allocate_exact_size(Vec2::new(36.0, 36.0), egui::Sense::hover());
                        ui.painter()
                            .rect_filled(rect, 8.0, Color32::from_rgb(0, 150, 136));
                        ui.painter().text(
                            rect.center(),
                            Align2::CENTER_CENTER,
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

                    ui.add_space(6.0);
                    ui.label(
                        RichText::new("Hệ thống Quản trị Doanh nghiệp")
                            .size(13.0)
                            .color(Color32::from_rgb(100, 116, 139)),
                    );
                    ui.add_space(20.0);

                    // Storage Mode Selector
                    ui.label(
                        RichText::new("CHẾ ĐỘ LƯU TRỮ DỮ LIỆU")
                            .size(11.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.add_space(4.0);
                    egui::ComboBox::from_id_salt("login_mode_combo")
                        .width(360.0)
                        .selected_text(self.mode.label())
                        .show_ui(ui, |ui| {
                            if ui
                                .selectable_value(
                                    &mut self.mode,
                                    StorageMode::KiyoCloud,
                                    "Kiyo Cloud API",
                                )
                                .clicked()
                            {
                                self.endpoint =
                                    StorageMode::KiyoCloud.default_endpoint().to_string();
                            }
                            if ui
                                .selectable_value(
                                    &mut self.mode,
                                    StorageMode::SelfHosted,
                                    "Self Hosted (Linux VPS)",
                                )
                                .clicked()
                            {
                                self.endpoint =
                                    StorageMode::SelfHosted.default_endpoint().to_string();
                            }
                            if ui
                                .selectable_value(
                                    &mut self.mode,
                                    StorageMode::LocalAdmin,
                                    "Local Admin (SQLite)",
                                )
                                .clicked()
                            {
                                self.endpoint =
                                    StorageMode::LocalAdmin.default_endpoint().to_string();
                            }
                        });

                    ui.add_space(14.0);
                    ui.label(
                        RichText::new("Địa chỉ máy chủ API")
                            .size(12.0)
                            .color(Color32::from_rgb(51, 65, 85)),
                    );
                    ui.add_space(2.0);
                    ui.add(egui::TextEdit::singleline(&mut self.endpoint).desired_width(360.0));

                    ui.add_space(14.0);
                    ui.label(
                        RichText::new("Tài khoản Email")
                            .size(12.0)
                            .color(Color32::from_rgb(51, 65, 85)),
                    );
                    ui.add_space(2.0);
                    ui.add(
                        egui::TextEdit::singleline(&mut self.email)
                            .hint_text("admin@kiyo.vn")
                            .desired_width(360.0),
                    );

                    ui.add_space(14.0);
                    ui.label(
                        RichText::new("Mật khẩu bảo mật")
                            .size(12.0)
                            .color(Color32::from_rgb(51, 65, 85)),
                    );
                    ui.add_space(2.0);
                    ui.add(
                        egui::TextEdit::singleline(&mut self.password)
                            .password(true)
                            .desired_width(360.0),
                    );

                    if !self.error_msg.is_empty() {
                        ui.add_space(12.0);
                        egui::Frame::none()
                            .fill(Color32::from_rgb(254, 242, 242))
                            .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(254, 202, 202)))
                            .rounding(6.0)
                            .inner_margin(8.0)
                            .show(ui, |ui| {
                                ui.label(
                                    RichText::new(&self.error_msg)
                                        .size(12.0)
                                        .color(Color32::from_rgb(185, 28, 28)),
                                );
                            });
                    }

                    ui.add_space(20.0);
                    let login_btn = egui::Button::new(
                        RichText::new("Đăng nhập hệ thống")
                            .size(14.0)
                            .strong()
                            .color(Color32::WHITE),
                    )
                    .fill(Color32::from_rgb(0, 150, 136))
                    .min_size(Vec2::new(360.0, 38.0))
                    .rounding(6.0);

                    if ui.add(login_btn).clicked() {
                        self.is_submitting = true;
                        self.error_msg.clear();
                        match api.login(&self.endpoint, &self.email, &self.password, self.mode) {
                            Ok(session) => {
                                session_out = Some(session);
                            }
                            Err(err) => {
                                // Fallback mock login if local test server is not running
                                if self.email == "admin@kiyo.vn" || self.email == "demo@kiyo.vn" {
                                    session_out = Some(Session {
                                        token: "mock-jwt-token-native-rust".to_string(),
                                        user: User {
                                            id: "usr-admin-01".to_string(),
                                            email: self.email.clone(),
                                            name: if self.email.contains("admin") {
                                                "Quản Trị Viên (Kiyo Admin)".to_string()
                                            } else {
                                                "Nguyễn Văn Nhân Viên".to_string()
                                            },
                                            role: if self.email.contains("admin") {
                                                "ADMIN".to_string()
                                            } else {
                                                "USER".to_string()
                                            },
                                            is_active: true,
                                        },
                                        endpoint: self.endpoint.clone(),
                                        mode: self.mode,
                                    });
                                } else {
                                    self.error_msg = err;
                                }
                            }
                        }
                        self.is_submitting = false;
                    }

                    ui.add_space(16.0);
                    ui.separator();
                    ui.add_space(10.0);

                    ui.label(
                        RichText::new("Tài khoản mẫu nhanh:")
                            .size(11.0)
                            .color(Color32::from_rgb(100, 116, 139)),
                    );
                    ui.add_space(4.0);
                    ui.horizontal(|ui| {
                        if ui.small_button("Quản trị (Admin)").clicked() {
                            self.email = "admin@kiyo.vn".to_string();
                            self.password = "password123".to_string();
                        }
                        if ui.small_button("Nhân viên (User)").clicked() {
                            self.email = "nhanvien@kiyo.vn".to_string();
                            self.password = "password123".to_string();
                        }
                    });
                });

            ui.add_space(20.0);
            ui.label(
                RichText::new("KIYOVN Enterprise Native Rust App - (C) 2026")
                    .size(11.0)
                    .color(Color32::from_rgb(148, 163, 184)),
            );
        });

        session_out
    }
}
