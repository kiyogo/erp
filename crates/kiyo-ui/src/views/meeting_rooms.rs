use crate::models::Session;
use egui::{Color32, RichText, Ui, Vec2};

pub struct RoomItem {
    pub name: String,
    pub capacity: String,
    pub floor: String,
    pub equipment: String,
    pub status: String,
}

pub struct MeetingRoomsView {
    pub rooms: Vec<RoomItem>,
    pub book_open: bool,
    pub selected_room: String,
    pub meeting_title: String,
    pub start_time: String,
    pub notice: String,
}

impl Default for MeetingRoomsView {
    fn default() -> Self {
        Self {
            rooms: vec![
                RoomItem {
                    name: "Phòng họp Tokyo".into(),
                    capacity: "10 người".into(),
                    floor: "Tầng 3".into(),
                    equipment: "Smart TV 65\", Video Polycom".into(),
                    status: "Trống".into(),
                },
                RoomItem {
                    name: "Phòng họp New York".into(),
                    capacity: "20 người".into(),
                    floor: "Tầng 3".into(),
                    equipment: "Màn hình 85\", Mic đa hướng".into(),
                    status: "Đang có cuộc họp".into(),
                },
                RoomItem {
                    name: "Phòng họp London".into(),
                    capacity: "6 người".into(),
                    floor: "Tầng 2".into(),
                    equipment: "TV 55\", Bảng kính".into(),
                    status: "Trống".into(),
                },
                RoomItem {
                    name: "Hội trường Diamond".into(),
                    capacity: "60 người".into(),
                    floor: "Tầng 4".into(),
                    equipment: "Máy chiếu laser 4K, 4 Mic không dây".into(),
                    status: "Trống".into(),
                },
            ],
            book_open: false,
            selected_room: "Phòng họp Tokyo".to_string(),
            meeting_title: String::new(),
            start_time: "09:00 - 10:30".to_string(),
            notice: String::new(),
        }
    }
}

impl MeetingRoomsView {
    pub fn render(&mut self, ui: &mut Ui, session: &Session) {
        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new("CƠ SỞ VẬT CHẤT & LỊCH HỌP")
                            .size(11.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.heading("Phòng họp & Hội nghị");
                    ui.label(
                        "Kiểm tra trạng thái phòng họp thời gian thực và đăng ký lịch sử dụng.",
                    );
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let btn = egui::Button::new(
                        RichText::new("+ Đặt phòng họp ngay")
                            .strong()
                            .color(Color32::WHITE),
                    )
                    .fill(Color32::from_rgb(0, 150, 136));
                    if ui.add(btn).clicked() {
                        self.book_open = true;
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

            for room in &self.rooms {
                egui::Frame::none()
                    .fill(Color32::WHITE)
                    .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                    .rounding(8.0)
                    .inner_margin(14.0)
                    .show(ui, |ui| {
                        ui.horizontal(|ui| {
                            ui.vertical(|ui| {
                                ui.label(RichText::new(&room.name).size(15.0).strong());
                                ui.label(
                                    RichText::new(format!(
                                        "Sức chứa: {} · Vị trí: {}",
                                        room.capacity, room.floor
                                    ))
                                    .size(12.0)
                                    .color(Color32::from_rgb(71, 85, 105)),
                                );
                                ui.label(
                                    RichText::new(format!("Trang bị: {}", room.equipment))
                                        .size(11.5)
                                        .color(Color32::from_rgb(100, 116, 139)),
                                );
                            });
                            ui.with_layout(
                                egui::Layout::right_to_left(egui::Align::Center),
                                |ui| {
                                    if room.status == "Trống" {
                                        ui.label(
                                            RichText::new("SẴN SÀNG")
                                                .strong()
                                                .color(Color32::from_rgb(22, 163, 74)),
                                        );
                                    } else {
                                        ui.label(
                                            RichText::new("ĐANG BẬN")
                                                .strong()
                                                .color(Color32::from_rgb(220, 38, 38)),
                                        );
                                    }
                                },
                            );
                        });
                    });
                ui.add_space(8.0);
            }
        });

        if self.book_open {
            egui::Window::new("Đặt lịch phòng họp")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
                .show(ui.ctx(), |ui| {
                    ui.set_width(320.0);
                    ui.label("Chọn phòng họp:");
                    egui::ComboBox::from_id_salt("room_combo")
                        .selected_text(&self.selected_room)
                        .show_ui(ui, |ui| {
                            for r in &self.rooms {
                                ui.selectable_value(
                                    &mut self.selected_room,
                                    r.name.clone(),
                                    &r.name,
                                );
                            }
                        });

                    ui.add_space(6.0);
                    ui.label("Chủ đề cuộc họp:");
                    ui.add(
                        egui::TextEdit::singleline(&mut self.meeting_title).desired_width(300.0),
                    );

                    ui.add_space(6.0);
                    ui.label("Khung giờ họp:");
                    ui.add(egui::TextEdit::singleline(&mut self.start_time).desired_width(300.0));

                    ui.add_space(14.0);
                    ui.horizontal(|ui| {
                        if ui.button("Hủy").clicked() {
                            self.book_open = false;
                        }
                        let submit_btn = egui::Button::new(
                            RichText::new("Xác nhận đặt").strong().color(Color32::WHITE),
                        )
                        .fill(Color32::from_rgb(0, 150, 136));
                        if ui.add(submit_btn).clicked() {
                            self.notice = format!(
                                "Đã đặt {} cho cuộc họp '{}' của {}",
                                self.selected_room, self.meeting_title, session.user.name
                            );
                            self.meeting_title.clear();
                            self.book_open = false;
                        }
                    });
                });
        }
    }
}
