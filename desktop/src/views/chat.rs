use crate::models::Session;
use egui::{Color32, RichText, Ui};

pub struct ChatMsg {
    pub sender: String,
    pub time: String,
    pub text: String,
}

pub struct ChatView {
    pub channels: Vec<String>,
    pub active_channel: String,
    pub messages: Vec<ChatMsg>,
    pub input_text: String,
}

impl Default for ChatView {
    fn default() -> Self {
        Self {
            channels: vec![
                "Thông báo chung".into(),
                "Phòng Kỹ thuật & Dev".into(),
                "Phòng Kinh doanh & Sales".into(),
                "Ban Giám đốc (BOD)".into(),
            ],
            active_channel: "Thông báo chung".into(),
            messages: vec![
                ChatMsg { sender: "Nguyễn Văn Quản Trị".into(), time: "08:30".into(), text: "Chào mừng toàn thể cán bộ nhân viên đến với hệ thống KIYOVN Enterprise v2.0 Native Rust!".into() },
                ChatMsg { sender: "Trần Thị Nhân Sự".into(), time: "08:32".into(), text: "Mọi người nhớ hoàn tất điểm danh chấm công đầu giờ nhé.".into() },
                ChatMsg { sender: "Kỹ Sư Trưởng".into(), time: "09:15".into(), text: "Hệ thống Rust Native UI và backend Axum API đang hoạt động ổn định 100%.".into() },
            ],
            input_text: String::new(),
        }
    }
}

impl ChatView {
    pub fn render(&mut self, ui: &mut Ui, session: &Session) {
        ui.vertical(|ui| {
            ui.label(
                RichText::new("GIAO TIẾP THỜI GIAN THỰC")
                    .size(11.0)
                    .strong()
                    .color(Color32::from_rgb(0, 150, 136)),
            );
            ui.heading("Kênh Chat Doanh Nghiệp");

            ui.add_space(10.0);

            ui.columns(2, |cols| {
                // Left channel list
                cols[0].group(|ui| {
                    ui.set_width(200.0);
                    ui.label(
                        RichText::new("DANH SÁCH KÊNH")
                            .size(11.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.add_space(6.0);
                    for ch in &self.channels {
                        if ui
                            .selectable_label(self.active_channel == *ch, ch)
                            .clicked()
                        {
                            self.active_channel = ch.clone();
                        }
                        ui.add_space(2.0);
                    }
                });

                // Right message stream
                cols[1].vertical(|ui| {
                    egui::Frame::none()
                        .fill(Color32::WHITE)
                        .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                        .rounding(8.0)
                        .inner_margin(12.0)
                        .show(ui, |ui| {
                            ui.label(
                                RichText::new(format!("Kênh: {}", self.active_channel))
                                    .size(14.0)
                                    .strong(),
                            );
                            ui.separator();
                            ui.add_space(6.0);

                            egui::ScrollArea::vertical()
                                .max_height(350.0)
                                .show(ui, |ui| {
                                    for msg in &self.messages {
                                        let is_me = msg.sender == session.user.name;
                                        ui.horizontal(|ui| {
                                            if is_me {
                                                ui.label(
                                                    RichText::new("Bạn")
                                                        .strong()
                                                        .color(Color32::from_rgb(0, 150, 136)),
                                                );
                                            } else {
                                                ui.label(
                                                    RichText::new(&msg.sender)
                                                        .strong()
                                                        .color(Color32::from_rgb(30, 41, 59)),
                                                );
                                            }
                                            ui.label(
                                                RichText::new(format!("({})", msg.time))
                                                    .size(11.0)
                                                    .color(Color32::from_rgb(148, 163, 184)),
                                            );
                                        });
                                        ui.label(&msg.text);
                                        ui.add_space(6.0);
                                    }
                                });

                            ui.separator();
                            ui.horizontal(|ui| {
                                let res = ui.add(
                                    egui::TextEdit::singleline(&mut self.input_text)
                                        .hint_text("Nhập tin nhắn...")
                                        .desired_width(400.0),
                                );
                                let send_btn =
                                    egui::Button::new(RichText::new("Gửi").color(Color32::WHITE))
                                        .fill(Color32::from_rgb(0, 150, 136));
                                if (ui.add(send_btn).clicked()
                                    || (res.lost_focus()
                                        && ui.input(|i| i.key_pressed(egui::Key::Enter))))
                                    && !self.input_text.trim().is_empty()
                                {
                                    self.messages.push(ChatMsg {
                                        sender: session.user.name.clone(),
                                        time: "Vừa xong".into(),
                                        text: self.input_text.clone(),
                                    });
                                    self.input_text.clear();
                                }
                            });
                        });
                });
            });
        });
    }
}
