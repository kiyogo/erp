use crate::api::ApiClient;
use crate::models::{Session, StorageMode};
use egui::{Color32, RichText, Ui};

pub struct SettingsView {
    pub mode: StorageMode,
    pub endpoint: String,
    pub test_result: String,
    pub is_testing: bool,
    pub notice: String,
}

impl Default for SettingsView {
    fn default() -> Self {
        Self {
            mode: StorageMode::KiyoCloud,
            endpoint: "http://127.0.0.1:3001/api/v1".to_string(),
            test_result: String::new(),
            is_testing: false,
            notice: String::new(),
        }
    }
}

impl SettingsView {
    pub fn render(&mut self, ui: &mut Ui, session: &mut Session, api: &ApiClient) {
        ui.vertical(|ui| {
            ui.label(RichText::new("CẤU HÌNH HỆ THỐNG & PHÂN VÙNG LƯU TRỮ").size(11.0).strong().color(Color32::from_rgb(0, 150, 136)));
            ui.heading("Cài đặt hệ thống");
            ui.label("Chuyển đổi phân vùng lưu trữ dữ liệu (Kiyo Cloud / Self-Hosted Linux / Local Admin) và kiểm tra kết nối.");

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
                .inner_margin(16.0)
                .show(ui, |ui| {
                    ui.label(RichText::new("CHẾ ĐỘ LƯU TRỮ DỮ LIỆU").strong().color(Color32::from_rgb(0, 150, 136)));
                    ui.add_space(6.0);

                    ui.radio_value(&mut self.mode, StorageMode::KiyoCloud, "Kiyo Cloud API (Đồng bộ đám mây Kiyo chính thức)");
                    ui.label(RichText::new("  Toàn bộ dữ liệu được quản lý và bảo mật bởi cụm máy chủ đám mây Kiyo Cloud.").size(11.0).color(Color32::from_rgb(100, 116, 139)));
                    ui.add_space(8.0);

                    ui.radio_value(&mut self.mode, StorageMode::SelfHosted, "Self Hosted (Máy chủ Linux riêng của bên thứ 3)");
                    ui.label(RichText::new("  Cài đặt độc lập trên VPS / Server Linux của doanh nghiệp bạn, tự cấu hình toàn quyền.").size(11.0).color(Color32::from_rgb(100, 116, 139)));
                    ui.add_space(8.0);

                    if session.user.role == "ADMIN" {
                        ui.radio_value(&mut self.mode, StorageMode::LocalAdmin, "Local Admin (Lưu trực tiếp SQLite trên máy tính cá nhân)");
                        ui.label(RichText::new("  Lưu dữ liệu tại ổ cứng cục bộ (Chỉ khả dụng cho tài khoản Quản trị viên).").size(11.0).color(Color32::from_rgb(100, 116, 139)));
                    }

                    ui.add_space(16.0);
                    ui.separator();
                    ui.add_space(10.0);

                    ui.label("Địa chỉ URL máy chủ API:");
                    ui.add(egui::TextEdit::singleline(&mut self.endpoint).desired_width(400.0));

                    ui.add_space(12.0);
                    ui.horizontal(|ui| {
                        if ui.button("Kiểm tra kết nối máy chủ").clicked() {
                            self.is_testing = true;
                            match api.test_connection(&self.endpoint) {
                                Ok(msg) => self.test_result = msg,
                                Err(err) => self.test_result = format!("Lỗi: {}", err),
                            }
                            self.is_testing = false;
                        }

                        let save_btn = egui::Button::new(RichText::new("Lưu cấu hình").strong().color(Color32::WHITE))
                            .fill(Color32::from_rgb(0, 150, 136));
                        if ui.add(save_btn).clicked() {
                            session.mode = self.mode;
                            session.endpoint = self.endpoint.clone();
                            self.notice = format!("Đã áp dụng chế độ {} ({})!", self.mode.label(), self.endpoint);
                        }
                    });

                    if !self.test_result.is_empty() {
                        ui.add_space(8.0);
                        let color = if self.test_result.contains("thành công") { Color32::from_rgb(22, 163, 74) } else { Color32::from_rgb(220, 38, 38) };
                        ui.label(RichText::new(&self.test_result).color(color));
                    }
                });
        });
    }
}
