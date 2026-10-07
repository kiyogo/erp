use crate::models::{Session, User};
use egui::{Color32, RichText, Ui, Vec2};

pub struct UsersView {
    pub users: Vec<User>,
    pub add_open: bool,
    pub new_name: String,
    pub new_email: String,
    pub new_role: String,
    pub search: String,
    pub notice: String,
}

impl Default for UsersView {
    fn default() -> Self {
        Self {
            users: vec![
                User {
                    id: "usr-01".into(),
                    name: "Nguyễn Văn Quản Trị".into(),
                    email: "admin@kiyo.vn".into(),
                    role: "ADMIN".into(),
                    is_active: true,
                },
                User {
                    id: "usr-02".into(),
                    name: "Trần Thị Nhân Sự".into(),
                    email: "hr@kiyo.vn".into(),
                    role: "HR".into(),
                    is_active: true,
                },
                User {
                    id: "usr-03".into(),
                    name: "Lê Văn Kỹ Sư".into(),
                    email: "dev@kiyo.vn".into(),
                    role: "USER".into(),
                    is_active: true,
                },
                User {
                    id: "usr-04".into(),
                    name: "Phạm Thị Kế Toán".into(),
                    email: "acc@kiyo.vn".into(),
                    role: "USER".into(),
                    is_active: true,
                },
            ],
            add_open: false,
            new_name: String::new(),
            new_email: String::new(),
            new_role: "USER".to_string(),
            search: String::new(),
            notice: String::new(),
        }
    }
}

impl UsersView {
    pub fn render(&mut self, ui: &mut Ui, _session: &Session) {
        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new("QUẢN TRỊ TÀI KHOẢN")
                            .size(11.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.heading("Tài khoản người dùng");
                    ui.label("Phân quyền tài khoản quản trị viên và nhân viên trong hệ thống.");
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let btn = egui::Button::new(
                        RichText::new("+ Thêm tài khoản")
                            .strong()
                            .color(Color32::WHITE),
                    )
                    .fill(Color32::from_rgb(0, 150, 136));
                    if ui.add(btn).clicked() {
                        self.add_open = true;
                    }
                });
            });

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

            // Filter bar
            ui.horizontal(|ui| {
                ui.label("Tìm kiếm:");
                ui.add(
                    egui::TextEdit::singleline(&mut self.search)
                        .hint_text("Tên hoặc email...")
                        .desired_width(240.0),
                );
            });

            ui.add_space(10.0);

            // Users Table
            egui::Frame::none()
                .fill(Color32::WHITE)
                .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                .rounding(8.0)
                .inner_margin(12.0)
                .show(ui, |ui| {
                    egui::Grid::new("users_grid")
                        .striped(true)
                        .min_col_width(120.0)
                        .spacing(Vec2::new(16.0, 10.0))
                        .show(ui, |ui| {
                            ui.label(RichText::new("Họ tên & Email").strong());
                            ui.label(RichText::new("Vai trò").strong());
                            ui.label(RichText::new("Trạng thái").strong());
                            ui.label(RichText::new("Thao tác").strong());
                            ui.end_row();

                            let search_lower = self.search.to_lowercase();
                            for user in &mut self.users {
                                if !search_lower.is_empty()
                                    && !user.name.to_lowercase().contains(&search_lower)
                                    && !user.email.to_lowercase().contains(&search_lower)
                                {
                                    continue;
                                }

                                ui.vertical(|ui| {
                                    ui.label(RichText::new(&user.name).strong());
                                    ui.label(
                                        RichText::new(&user.email)
                                            .size(11.0)
                                            .color(Color32::from_rgb(100, 116, 139)),
                                    );
                                });

                                ui.label(RichText::new(&user.role).color(
                                    if user.role == "ADMIN" {
                                        Color32::from_rgb(0, 150, 136)
                                    } else {
                                        Color32::from_rgb(71, 85, 105)
                                    },
                                ));

                                if user.is_active {
                                    ui.label(
                                        RichText::new("Hoạt động")
                                            .color(Color32::from_rgb(22, 163, 74)),
                                    );
                                } else {
                                    ui.label(
                                        RichText::new("Đã khóa")
                                            .color(Color32::from_rgb(220, 38, 38)),
                                    );
                                }

                                ui.horizontal(|ui| {
                                    let toggle_label = if user.is_active {
                                        "Khóa"
                                    } else {
                                        "Mở khóa"
                                    };
                                    if ui.small_button(toggle_label).clicked() {
                                        user.is_active = !user.is_active;
                                    }
                                });
                                ui.end_row();
                            }
                        });
                });
        });

        // Add Modal
        if self.add_open {
            egui::Window::new("Thêm tài khoản mới")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
                .show(ui.ctx(), |ui| {
                    ui.set_width(320.0);
                    ui.label("Họ và tên:");
                    ui.add(egui::TextEdit::singleline(&mut self.new_name).desired_width(300.0));

                    ui.add_space(8.0);
                    ui.label("Email tài khoản:");
                    ui.add(egui::TextEdit::singleline(&mut self.new_email).desired_width(300.0));

                    ui.add_space(8.0);
                    ui.label("Phân quyền:");
                    egui::ComboBox::from_id_salt("user_role_combo")
                        .selected_text(&self.new_role)
                        .show_ui(ui, |ui| {
                            ui.selectable_value(
                                &mut self.new_role,
                                "ADMIN".to_string(),
                                "Quản trị viên (ADMIN)",
                            );
                            ui.selectable_value(
                                &mut self.new_role,
                                "HR".to_string(),
                                "Nhân sự (HR)",
                            );
                            ui.selectable_value(
                                &mut self.new_role,
                                "USER".to_string(),
                                "Nhân viên (USER)",
                            );
                        });

                    ui.add_space(14.0);
                    ui.horizontal(|ui| {
                        if ui.button("Hủy").clicked() {
                            self.add_open = false;
                        }
                        let save_btn = egui::Button::new(
                            RichText::new("Lưu tài khoản")
                                .strong()
                                .color(Color32::WHITE),
                        )
                        .fill(Color32::from_rgb(0, 150, 136));
                        if ui.add(save_btn).clicked() {
                            if !self.new_name.is_empty() && !self.new_email.is_empty() {
                                self.users.push(User {
                                    id: format!("usr-{}", self.users.len() + 1),
                                    name: self.new_name.clone(),
                                    email: self.new_email.clone(),
                                    role: self.new_role.clone(),
                                    is_active: true,
                                });
                                self.notice = format!("Đã tạo tài khoản cho {}", self.new_name);
                                self.new_name.clear();
                                self.new_email.clear();
                                self.add_open = false;
                            }
                        }
                    });
                });
        }
    }
}
