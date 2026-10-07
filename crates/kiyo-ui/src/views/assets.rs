use crate::models::Session;
use crate::views::employees::format_vnd;
use egui::{Color32, RichText, Ui, Vec2};

pub struct AssetItem {
    pub code: String,
    pub name: String,
    pub category: String,
    pub assigned_to: String,
    pub value: u64,
    pub status: String,
}

pub struct AssetsView {
    pub assets: Vec<AssetItem>,
    pub add_open: bool,
    pub new_name: String,
    pub new_code: String,
    pub new_cat: String,
    pub new_assignee: String,
    pub new_val: String,
    pub notice: String,
}

impl Default for AssetsView {
    fn default() -> Self {
        Self {
            assets: vec![
                AssetItem {
                    code: "AST-001".into(),
                    name: "MacBook Pro M3 Max 36GB".into(),
                    category: "Thiết bị IT".into(),
                    assigned_to: "Kỹ Sư Trưởng".into(),
                    value: 65000000,
                    status: "Đang sử dụng".into(),
                },
                AssetItem {
                    code: "AST-002".into(),
                    name: "Màn hình Dell UltraSharp 27\" 4K".into(),
                    category: "Thiết bị IT".into(),
                    assigned_to: "Trần Thị Nhân Sự".into(),
                    value: 14500000,
                    status: "Đang sử dụng".into(),
                },
                AssetItem {
                    code: "AST-003".into(),
                    name: "Máy in Laser đa năng Canon".into(),
                    category: "Thiết bị văn phòng".into(),
                    assigned_to: "Phòng Hành chính".into(),
                    value: 22000000,
                    status: "Đang sử dụng".into(),
                },
                AssetItem {
                    code: "AST-004".into(),
                    name: "Laptop ThinkPad T14s Gen 4".into(),
                    category: "Thiết bị IT".into(),
                    assigned_to: "Chưa cấp phát".into(),
                    value: 28000000,
                    status: "Sẵn sàng cấp".into(),
                },
            ],
            add_open: false,
            new_name: String::new(),
            new_code: String::new(),
            new_cat: "Thiết bị IT".to_string(),
            new_assignee: String::new(),
            new_val: "25000000".to_string(),
            notice: String::new(),
        }
    }
}

impl AssetsView {
    pub fn render(&mut self, ui: &mut Ui, _session: &Session) {
        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(RichText::new("QUẢN TRỊ TÀI SẢN").size(11.0).strong().color(Color32::from_rgb(0, 150, 136)));
                    ui.heading("Tài sản & Thiết bị");
                    ui.label("Theo dõi danh mục máy móc, thiết bị văn phòng, bàn giao nhân sự và nguyên giá.");
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let btn = egui::Button::new(RichText::new("+ Thêm tài sản").strong().color(Color32::WHITE))
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

            egui::Frame::none()
                .fill(Color32::WHITE)
                .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                .rounding(8.0)
                .inner_margin(12.0)
                .show(ui, |ui| {
                    egui::Grid::new("assets_grid")
                        .striped(true)
                        .min_col_width(130.0)
                        .spacing(Vec2::new(16.0, 10.0))
                        .show(ui, |ui| {
                            ui.label(RichText::new("Mã & Tên thiết bị").strong());
                            ui.label(RichText::new("Phân loại").strong());
                            ui.label(RichText::new("Người sử dụng").strong());
                            ui.label(RichText::new("Nguyên giá").strong());
                            ui.label(RichText::new("Trạng thái").strong());
                            ui.end_row();

                            for a in &self.assets {
                                ui.vertical(|ui| {
                                    ui.label(RichText::new(&a.name).strong());
                                    ui.label(RichText::new(&a.code).size(11.0).color(Color32::from_rgb(0, 150, 136)));
                                });

                                ui.label(&a.category);
                                ui.label(&a.assigned_to);
                                ui.label(RichText::new(format!("{} ₫", format_vnd(a.value))).strong().color(Color32::from_rgb(22, 163, 74)));

                                if a.status.contains("Đang sử dụng") {
                                    ui.label(RichText::new(&a.status).color(Color32::from_rgb(22, 163, 74)));
                                } else {
                                    ui.label(RichText::new(&a.status).color(Color32::from_rgb(217, 119, 6)));
                                }
                                ui.end_row();
                            }
                        });
                });
        });

        if self.add_open {
            egui::Window::new("Thêm thiết bị tài sản mới")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
                .show(ui.ctx(), |ui| {
                    ui.set_width(320.0);
                    ui.label("Tên thiết bị:");
                    ui.add(egui::TextEdit::singleline(&mut self.new_name).desired_width(300.0));

                    ui.add_space(6.0);
                    ui.label("Phân loại:");
                    egui::ComboBox::from_id_salt("asset_cat_combo")
                        .selected_text(&self.new_cat)
                        .show_ui(ui, |ui| {
                            ui.selectable_value(
                                &mut self.new_cat,
                                "Thiết bị IT".into(),
                                "Thiết bị IT",
                            );
                            ui.selectable_value(
                                &mut self.new_cat,
                                "Thiết bị văn phòng".into(),
                                "Thiết bị văn phòng",
                            );
                            ui.selectable_value(
                                &mut self.new_cat,
                                "Bàn ghế & Nội thất".into(),
                                "Bàn ghế & Nội thất",
                            );
                        });

                    ui.add_space(6.0);
                    ui.label("Người nhận bàn giao:");
                    ui.add(egui::TextEdit::singleline(&mut self.new_assignee).desired_width(300.0));

                    ui.add_space(6.0);
                    ui.label("Nguyên giá (VNĐ):");
                    ui.add(egui::TextEdit::singleline(&mut self.new_val).desired_width(300.0));

                    ui.add_space(14.0);
                    ui.horizontal(|ui| {
                        if ui.button("Hủy").clicked() {
                            self.add_open = false;
                        }
                        let save_btn = egui::Button::new(
                            RichText::new("Lưu tài sản").strong().color(Color32::WHITE),
                        )
                        .fill(Color32::from_rgb(0, 150, 136));
                        if ui.add(save_btn).clicked() {
                            if !self.new_name.is_empty() {
                                let val = self.new_val.parse::<u64>().unwrap_or(0);
                                self.assets.push(AssetItem {
                                    code: format!("AST-{:03}", self.assets.len() + 1),
                                    name: self.new_name.clone(),
                                    category: self.new_cat.clone(),
                                    assigned_to: if self.new_assignee.is_empty() {
                                        "Chưa cấp phát".into()
                                    } else {
                                        self.new_assignee.clone()
                                    },
                                    value: val,
                                    status: if self.new_assignee.is_empty() {
                                        "Sẵn sàng cấp".into()
                                    } else {
                                        "Đang sử dụng".into()
                                    },
                                });
                                self.notice = format!("Đã thêm {}", self.new_name);
                                self.new_name.clear();
                                self.add_open = false;
                            }
                        }
                    });
                });
        }
    }
}
