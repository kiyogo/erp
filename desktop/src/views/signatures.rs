use crate::models::Session;
use egui::{Color32, Pos2, RichText, Sense, Stroke, Ui, Vec2};

pub struct SignDoc {
    pub id: String,
    pub title: String,
    pub doc_type: String,
    pub date: String,
    pub status: String,
}

pub struct SignaturesView {
    pub strokes: Vec<Vec<Pos2>>,
    pub current_stroke: Vec<Pos2>,
    pub documents: Vec<SignDoc>,
    pub notice: String,
}

impl Default for SignaturesView {
    fn default() -> Self {
        Self {
            strokes: Vec::new(),
            current_stroke: Vec::new(),
            documents: vec![
                SignDoc {
                    id: "DOC-001".into(),
                    title: "Hợp đồng lao động chính thức 2026".into(),
                    doc_type: "Hợp đồng".into(),
                    date: "2026-08-15".into(),
                    status: "Đã ký số".into(),
                },
                SignDoc {
                    id: "DOC-002".into(),
                    title: "Quyết định bổ nhiệm chức danh Kỹ sư".into(),
                    doc_type: "Quyết định".into(),
                    date: "2026-08-20".into(),
                    status: "Chờ ký".into(),
                },
                SignDoc {
                    id: "DOC-003".into(),
                    title: "Biên bản bàn giao trang thiết bị IT".into(),
                    doc_type: "Biên bản".into(),
                    date: "2026-08-28".into(),
                    status: "Chờ ký".into(),
                },
            ],
            notice: String::new(),
        }
    }
}

impl SignaturesView {
    pub fn render(&mut self, ui: &mut Ui, session: &Session) {
        ui.vertical(|ui| {
            ui.label(
                RichText::new("BẢO MẬT & CHỨNG THỰC ĐIỆN TỬ")
                    .size(11.0)
                    .strong()
                    .color(Color32::from_rgb(0, 150, 136)),
            );
            ui.heading("Chữ ký số & eKYC");
            ui.label(
                "Tạo chữ ký điện tử trực tiếp, chứng thư số eKYC và ký tài liệu doanh nghiệp.",
            );

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

            ui.columns(2, |cols| {
                // Left: Interactive Signature Drawing Pad
                cols[0].group(|ui| {
                    ui.label(
                        RichText::new("BẢNG VẼ CHỮ KÝ CẢM ỨNG (NATIVE CANVAS)")
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.label("Dùng chuột hoặc bút vẽ chữ ký vào khung dưới đây:");
                    ui.add_space(6.0);

                    let (response, painter) =
                        ui.allocate_painter(Vec2::new(380.0, 150.0), Sense::drag());
                    let rect = response.rect;

                    painter.rect_filled(rect, 6.0, Color32::from_rgb(250, 250, 250));
                    painter.rect_stroke(
                        rect,
                        6.0,
                        Stroke::new(1.0_f32, Color32::from_rgb(203, 213, 225)),
                    );

                    if response.drag_started() {
                        self.current_stroke.clear();
                        if let Some(pos) = response.hover_pos() {
                            self.current_stroke.push(pos);
                        }
                    } else if response.dragged() {
                        if let Some(pos) = response.hover_pos() {
                            self.current_stroke.push(pos);
                        }
                    } else if response.drag_stopped() && !self.current_stroke.is_empty() {
                        self.strokes.push(self.current_stroke.clone());
                        self.current_stroke.clear();
                    }

                    // Paint all completed strokes
                    for stroke in &self.strokes {
                        for window in stroke.windows(2) {
                            painter.line_segment(
                                [window[0], window[1]],
                                Stroke::new(2.5_f32, Color32::from_rgb(0, 77, 64)),
                            );
                        }
                    }

                    // Paint active stroke
                    for window in self.current_stroke.windows(2) {
                        painter.line_segment(
                            [window[0], window[1]],
                            Stroke::new(2.5_f32, Color32::from_rgb(0, 77, 64)),
                        );
                    }

                    if self.strokes.is_empty() && self.current_stroke.is_empty() {
                        painter.text(
                            rect.center(),
                            egui::Align2::CENTER_CENTER,
                            "Vẽ chữ ký tại đây",
                            egui::FontId::proportional(13.0),
                            Color32::from_rgb(148, 163, 184),
                        );
                    }

                    ui.add_space(8.0);
                    ui.horizontal(|ui| {
                        if ui.button("Xóa vẽ lại").clicked() {
                            self.strokes.clear();
                            self.current_stroke.clear();
                        }
                        let save_btn = egui::Button::new(
                            RichText::new("Lưu mẫu chữ ký")
                                .strong()
                                .color(Color32::WHITE),
                        )
                        .fill(Color32::from_rgb(0, 150, 136));
                        if ui.add(save_btn).clicked() {
                            if !self.strokes.is_empty() {
                                self.notice =
                                    "Chữ ký điện tử của bạn đã được mã hóa và lưu trữ an toàn!"
                                        .to_string();
                            }
                        }
                    });
                });

                // Right: eKYC Certificate
                cols[1].group(|ui| {
                    ui.label(
                        RichText::new("CHỨNG THƯ SỐ ĐỊNH DANH eKYC")
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.add_space(8.0);
                    ui.label(format!("• Chủ thể chứng thư: {}", session.user.name));
                    ui.label(format!("• Email định danh: {}", session.user.email));
                    ui.label("• Trạng thái: ✓ Đã xác thực điện tử eKYC");
                    ui.label("• Thuật toán mã hóa: SHA-256 with RSA 2048-bit");
                    ui.label("• Đơn vị cấp phát: KIYOVN Trust Certificate Authority v2.0");
                });
            });

            ui.add_space(16.0);

            // Document signing list
            egui::Frame::none()
                .fill(Color32::WHITE)
                .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                .rounding(8.0)
                .inner_margin(12.0)
                .show(ui, |ui| {
                    egui::Grid::new("signatures_grid")
                        .striped(true)
                        .min_col_width(130.0)
                        .spacing(Vec2::new(16.0, 10.0))
                        .show(ui, |ui| {
                            ui.label(
                                RichText::new("Mã & Tên văn bản")
                                    .color(Color32::from_rgb(71, 85, 105)),
                            );
                            ui.label(
                                RichText::new("Phân loại").color(Color32::from_rgb(71, 85, 105)),
                            );
                            ui.label(
                                RichText::new("Ngày ban hành")
                                    .color(Color32::from_rgb(71, 85, 105)),
                            );
                            ui.label(
                                RichText::new("Trạng thái").color(Color32::from_rgb(71, 85, 105)),
                            );
                            ui.label(
                                RichText::new("Thao tác").color(Color32::from_rgb(71, 85, 105)),
                            );
                            ui.end_row();

                            for doc in &mut self.documents {
                                ui.vertical(|ui| {
                                    ui.label(
                                        RichText::new(&doc.title)
                                            .color(Color32::from_rgb(51, 65, 85)),
                                    );
                                    ui.label(
                                        RichText::new(&doc.id)
                                            .size(11.0)
                                            .color(Color32::from_rgb(100, 116, 139)),
                                    );
                                });

                                ui.label(&doc.doc_type);
                                ui.label(&doc.date);

                                if doc.status == "Đã ký số" {
                                    ui.label(
                                        RichText::new("✓ Đã ký số")
                                            .color(Color32::from_rgb(22, 163, 74)),
                                    );
                                } else {
                                    ui.label(
                                        RichText::new(&doc.status)
                                            .color(Color32::from_rgb(217, 119, 6)),
                                    );
                                }

                                if doc.status == "Chờ ký" {
                                    let sign_btn = egui::Button::new(
                                        RichText::new("Ký số ngay").strong().color(Color32::WHITE),
                                    )
                                    .fill(Color32::from_rgb(0, 150, 136));
                                    if ui.add(sign_btn).clicked() {
                                        doc.status = "Đã ký số".to_string();
                                        self.notice = format!(
                                            "Đã ký số điện tử thành công tài liệu: {}",
                                            doc.title
                                        );
                                    }
                                } else {
                                    ui.label("Hoàn tất");
                                }
                                ui.end_row();
                            }
                        });
                });
        });
    }
}
