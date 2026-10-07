use crate::models::Session;
use egui::{Color32, RichText, Ui, Vec2};

pub struct OrgUnitItem {
    pub code: String,
    pub name: String,
    pub head: String,
    pub members: usize,
    pub description: String,
}

pub struct OrgUnitsView {
    pub units: Vec<OrgUnitItem>,
    pub add_open: bool,
    pub new_code: String,
    pub new_name: String,
    pub new_head: String,
    pub new_desc: String,
}

impl Default for OrgUnitsView {
    fn default() -> Self {
        Self {
            units: vec![
                OrgUnitItem {
                    code: "BOD".into(),
                    name: "Ban Giám đốc (BOD)".into(),
                    head: "Tổng Giám đốc".into(),
                    members: 3,
                    description: "Điều hành chiến lược toàn diện doanh nghiệp".into(),
                },
                OrgUnitItem {
                    code: "TECH".into(),
                    name: "Phòng Kỹ thuật & Công nghệ".into(),
                    head: "Kỹ Sư Trưởng".into(),
                    members: 12,
                    description: "Phát triển phần mềm và kiến trúc hệ thống".into(),
                },
                OrgUnitItem {
                    code: "SALES".into(),
                    name: "Phòng Kinh doanh & Tiếp thị".into(),
                    head: "Giám đốc Kinh doanh".into(),
                    members: 8,
                    description: "Phát triển thị trường, khách hàng và doanh thu".into(),
                },
                OrgUnitItem {
                    code: "ACC".into(),
                    name: "Phòng Tài chính - Kế toán".into(),
                    head: "Kế toán trưởng".into(),
                    members: 4,
                    description: "Quản lý thu chi, sổ sách và quyết toán tài chính".into(),
                },
                OrgUnitItem {
                    code: "HR".into(),
                    name: "Phòng Hành chính - Nhân sự".into(),
                    head: "Trưởng phòng Nhân sự".into(),
                    members: 5,
                    description: "Tuyển dụng, đào tạo, chế độ và phúc lợi".into(),
                },
            ],
            add_open: false,
            new_code: String::new(),
            new_name: String::new(),
            new_head: String::new(),
            new_desc: String::new(),
        }
    }
}

impl OrgUnitsView {
    pub fn render(&mut self, ui: &mut Ui, _session: &Session) {
        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new("CƠ CẤU TỔ CHỨC")
                            .size(11.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.heading("Phòng ban & Đơn vị");
                    ui.label(
                        "Sơ đồ cơ cấu tổ chức doanh nghiệp, phân bổ nhân sự và lãnh đạo phụ trách.",
                    );
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let btn = egui::Button::new(
                        RichText::new("+ Thêm phòng ban")
                            .strong()
                            .color(Color32::WHITE),
                    )
                    .fill(Color32::from_rgb(0, 150, 136));
                    if ui.add(btn).clicked() {
                        self.add_open = true;
                    }
                });
            });

            ui.add_space(14.0);

            // Org Units Cards
            for unit in &self.units {
                egui::Frame::none()
                    .fill(Color32::WHITE)
                    .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                    .rounding(8.0)
                    .inner_margin(14.0)
                    .show(ui, |ui| {
                        ui.horizontal(|ui| {
                            ui.vertical(|ui| {
                                ui.label(
                                    RichText::new(format!("MÃ: {}", unit.code))
                                        .size(11.0)
                                        .strong()
                                        .color(Color32::from_rgb(0, 150, 136)),
                                );
                                ui.label(RichText::new(&unit.name).size(15.0).strong());
                                ui.label(
                                    RichText::new(&unit.description)
                                        .size(12.0)
                                        .color(Color32::from_rgb(100, 116, 139)),
                                );
                            });
                            ui.with_layout(
                                egui::Layout::right_to_left(egui::Align::Center),
                                |ui| {
                                    ui.vertical(|ui| {
                                        ui.label(
                                            RichText::new(format!("{} nhân sự", unit.members))
                                                .strong()
                                                .color(Color32::from_rgb(30, 41, 59)),
                                        );
                                        ui.label(
                                            RichText::new(format!("Phụ trách: {}", unit.head))
                                                .size(11.5)
                                                .color(Color32::from_rgb(71, 85, 105)),
                                        );
                                    });
                                },
                            );
                        });
                    });
                ui.add_space(8.0);
            }
        });

        if self.add_open {
            egui::Window::new("Thêm phòng ban mới")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
                .show(ui.ctx(), |ui| {
                    ui.set_width(320.0);
                    ui.label("Mã phòng ban:");
                    ui.add(
                        egui::TextEdit::singleline(&mut self.new_code)
                            .hint_text("MKT / RND")
                            .desired_width(300.0),
                    );

                    ui.add_space(6.0);
                    ui.label("Tên phòng ban:");
                    ui.add(egui::TextEdit::singleline(&mut self.new_name).desired_width(300.0));

                    ui.add_space(6.0);
                    ui.label("Người phụ trách:");
                    ui.add(egui::TextEdit::singleline(&mut self.new_head).desired_width(300.0));

                    ui.add_space(6.0);
                    ui.label("Mô tả nhiệm vụ:");
                    ui.add(egui::TextEdit::singleline(&mut self.new_desc).desired_width(300.0));

                    ui.add_space(14.0);
                    ui.horizontal(|ui| {
                        if ui.button("Hủy").clicked() {
                            self.add_open = false;
                        }
                        let save_btn = egui::Button::new(
                            RichText::new("Lưu phòng ban")
                                .strong()
                                .color(Color32::WHITE),
                        )
                        .fill(Color32::from_rgb(0, 150, 136));
                        if ui.add(save_btn).clicked() {
                            if !self.new_name.is_empty() {
                                self.units.push(OrgUnitItem {
                                    code: if self.new_code.is_empty() {
                                        "DEPT".into()
                                    } else {
                                        self.new_code.clone()
                                    },
                                    name: self.new_name.clone(),
                                    head: self.new_head.clone(),
                                    members: 1,
                                    description: self.new_desc.clone(),
                                });
                                self.new_name.clear();
                                self.new_code.clear();
                                self.new_head.clear();
                                self.new_desc.clear();
                                self.add_open = false;
                            }
                        }
                    });
                });
        }
    }
}
