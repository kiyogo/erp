use crate::models::Session;
use egui::{Color32, RichText, Ui, Vec2};

pub struct AttendanceRecord {
    pub date: String,
    pub check_in: String,
    pub check_out: String,
    pub status: String,
}

pub struct AttendanceView {
    pub is_checked_in: bool,
    pub records: Vec<AttendanceRecord>,
    pub leave_open: bool,
    pub leave_type: String,
    pub leave_reason: String,
    pub notice: String,
}

impl Default for AttendanceView {
    fn default() -> Self {
        Self {
            is_checked_in: false,
            records: vec![
                AttendanceRecord {
                    date: "2026-08-30".into(),
                    check_in: "08:15".into(),
                    check_out: "—".into(),
                    status: "Đúng giờ".into(),
                },
                AttendanceRecord {
                    date: "2026-08-29".into(),
                    check_in: "08:25".into(),
                    check_out: "17:35".into(),
                    status: "Đúng giờ".into(),
                },
                AttendanceRecord {
                    date: "2026-08-28".into(),
                    check_in: "08:45".into(),
                    check_out: "17:40".into(),
                    status: "Đi muộn 15p".into(),
                },
                AttendanceRecord {
                    date: "2026-08-27".into(),
                    check_in: "08:20".into(),
                    check_out: "17:30".into(),
                    status: "Đúng giờ".into(),
                },
            ],
            leave_open: false,
            leave_type: "Nghỉ phép năm (có lương)".to_string(),
            leave_reason: String::new(),
            notice: String::new(),
        }
    }
}

impl AttendanceView {
    pub fn render(&mut self, ui: &mut Ui, session: &Session) {
        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(RichText::new("CHẤM CÔNG & CA LÀM VIỆC").size(11.0).strong().color(Color32::from_rgb(0, 150, 136)));
                    ui.heading("Điểm danh & Quản lý ngày công");
                    ui.label("Ghi nhận giờ làm việc, theo dõi lịch sử chấm công và đăng ký đơn xin nghỉ phép.");
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let (btn_text, btn_color) = if self.is_checked_in {
                        ("Điểm danh Ra ca", Color32::from_rgb(220, 38, 38))
                    } else {
                        ("Điểm danh Vào ca", Color32::from_rgb(5, 150, 105))
                    };

                    let btn = egui::Button::new(RichText::new(btn_text).strong().color(Color32::WHITE))
                        .fill(btn_color)
                        .min_size(Vec2::new(160.0, 34.0));

                    if ui.add(btn).clicked() {
                        self.is_checked_in = !self.is_checked_in;
                        if self.is_checked_in {
                            self.notice = format!("{} đã điểm danh vào ca hôm nay lúc 08:30!", session.user.name);
                        } else {
                            self.notice = format!("{} đã điểm danh ra ca thành công!", session.user.name);
                        }
                    }

                    if ui.button("Đăng ký nghỉ phép").clicked() {
                        self.leave_open = true;
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

            // Attendance Table
            egui::Frame::none()
                .fill(Color32::WHITE)
                .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                .rounding(8.0)
                .inner_margin(12.0)
                .show(ui, |ui| {
                    egui::Grid::new("attendance_grid")
                        .striped(true)
                        .min_col_width(130.0)
                        .spacing(Vec2::new(16.0, 10.0))
                        .show(ui, |ui| {
                            ui.label(RichText::new("Ngày làm việc").strong());
                            ui.label(RichText::new("Giờ vào ca").strong());
                            ui.label(RichText::new("Giờ ra ca").strong());
                            ui.label(RichText::new("Trạng thái").strong());
                            ui.end_row();

                            for rec in &self.records {
                                ui.label(&rec.date);
                                ui.label(RichText::new(&rec.check_in).strong().color(Color32::from_rgb(30, 41, 59)));
                                ui.label(&rec.check_out);
                                if rec.status.contains("Đúng giờ") {
                                    ui.label(RichText::new(&rec.status).color(Color32::from_rgb(22, 163, 74)));
                                } else {
                                    ui.label(RichText::new(&rec.status).color(Color32::from_rgb(217, 119, 6)));
                                }
                                ui.end_row();
                            }
                        });
                });
        });

        if self.leave_open {
            egui::Window::new("Đơn xin nghỉ phép")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
                .show(ui.ctx(), |ui| {
                    ui.set_width(320.0);
                    ui.label("Loại hình nghỉ:");
                    egui::ComboBox::from_id_salt("leave_type_combo")
                        .selected_text(&self.leave_type)
                        .show_ui(ui, |ui| {
                            ui.selectable_value(
                                &mut self.leave_type,
                                "Nghỉ phép năm (có lương)".into(),
                                "Nghỉ phép năm (có lương)",
                            );
                            ui.selectable_value(
                                &mut self.leave_type,
                                "Nghỉ ốm đau / Khám bệnh".into(),
                                "Nghỉ ốm đau / Khám bệnh",
                            );
                            ui.selectable_value(
                                &mut self.leave_type,
                                "Nghỉ việc riêng không lương".into(),
                                "Nghỉ việc riêng không lương",
                            );
                            ui.selectable_value(
                                &mut self.leave_type,
                                "Nghỉ kết hôn / Thai sản".into(),
                                "Nghỉ kết hôn / Thai sản",
                            );
                        });

                    ui.add_space(8.0);
                    ui.label("Lý do chi tiết:");
                    ui.add(
                        egui::TextEdit::multiline(&mut self.leave_reason)
                            .desired_rows(3)
                            .desired_width(300.0),
                    );

                    ui.add_space(14.0);
                    ui.horizontal(|ui| {
                        if ui.button("Hủy").clicked() {
                            self.leave_open = false;
                        }
                        let submit_btn = egui::Button::new(
                            RichText::new("Gửi đơn xin nghỉ")
                                .strong()
                                .color(Color32::WHITE),
                        )
                        .fill(Color32::from_rgb(0, 150, 136));
                        if ui.add(submit_btn).clicked() {
                            self.notice = format!(
                                "Đã gửi đơn xin nghỉ ({}) chuyển sang phê duyệt!",
                                self.leave_type
                            );
                            self.leave_reason.clear();
                            self.leave_open = false;
                        }
                    });
                });
        }
    }
}
