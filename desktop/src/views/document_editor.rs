use crate::models::Session;
use egui::{Color32, RichText, Ui};

pub struct DocumentEditorView {
    pub title: String,
    pub content: String,
    pub notice: String,
}

impl Default for DocumentEditorView {
    fn default() -> Self {
        Self {
            title: "Quy trình vận hành doanh nghiệp KIYOVN Enterprise".to_string(),
            content: r#"# QUY TRÌNH VẬN HÀNH DOANH NGHIỆP KIYOVN

## 1. Điểm danh & Chấm công
- Toàn thể nhân viên thực hiện điểm danh Vào ca trước 08:30 hàng ngày.
- Trường hợp đi muộn hoặc xin nghỉ phép cần gửi đơn qua Cổng thông tin.

## 2. Bảo mật thông tin
- Tuyệt đối không chia sẻ token hoặc mật khẩu quản trị.
- Ký số đầy đủ các hợp đồng và biên bản bàn giao thiết bị.
"#
            .to_string(),
            notice: String::new(),
        }
    }
}

impl DocumentEditorView {
    pub fn render(&mut self, ui: &mut Ui, _session: &Session) {
        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new("SOẠN THẢO VĂN BẢN TRỰC QUAN")
                            .size(11.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.heading("Biên tập Tài liệu & Ghi chú");
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let btn = egui::Button::new(
                        RichText::new("Lưu tài liệu").strong().color(Color32::WHITE),
                    )
                    .fill(Color32::from_rgb(0, 150, 136));
                    if ui.add(btn).clicked() {
                        self.notice = format!("Đã lưu '{}' vào không gian tài liệu!", self.title);
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

            ui.add_space(10.0);

            // Title and formatting bar
            ui.horizontal(|ui| {
                ui.label("Tiêu đề:");
                ui.add(egui::TextEdit::singleline(&mut self.title).desired_width(320.0));
                ui.separator();
                if ui.button("H1").clicked() {
                    self.content.push_str("\n# ");
                }
                if ui.button("H2").clicked() {
                    self.content.push_str("\n## ");
                }
                if ui.button("B").clicked() {
                    self.content.push_str("**Văn bản đậm**");
                }
                if ui.button("I").clicked() {
                    self.content.push_str("*Văn bản nghiêng*");
                }
                if ui.button("List").clicked() {
                    self.content.push_str("\n- ");
                }
            });

            ui.add_space(10.0);

            // Editor split view
            ui.columns(2, |cols| {
                cols[0].group(|ui| {
                    ui.label(
                        RichText::new("SOẠN THẢO (MARKDOWN)")
                            .size(11.0)
                            .strong()
                            .color(Color32::from_rgb(100, 116, 139)),
                    );
                    ui.add_space(4.0);
                    ui.add(
                        egui::TextEdit::multiline(&mut self.content)
                            .desired_rows(22)
                            .desired_width(f32::INFINITY)
                            .font(egui::TextStyle::Monospace),
                    );
                });

                cols[1].group(|ui| {
                    ui.label(
                        RichText::new("XEM TRƯỚC (LIVE PREVIEW)")
                            .size(11.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.add_space(4.0);
                    egui::ScrollArea::vertical().show(ui, |ui| {
                        ui.label(&self.content);
                    });
                });
            });
        });
    }
}
