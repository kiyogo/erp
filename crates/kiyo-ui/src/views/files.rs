use crate::models::Session;
use egui::{Color32, RichText, Ui, Vec2};

pub struct FileItem {
    pub name: String,
    pub file_type: String, // "Thư mục" / "Tệp tin"
    pub size: String,
    pub updated_at: String,
}

pub struct FilesView {
    pub files: Vec<FileItem>,
    pub current_path: String,
    pub notice: String,
}

impl Default for FilesView {
    fn default() -> Self {
        Self {
            files: vec![
                FileItem {
                    name: "Hợp đồng & Văn bản pháp lý".into(),
                    file_type: "Thư mục".into(),
                    size: "—".into(),
                    updated_at: "2026-08-28".into(),
                },
                FileItem {
                    name: "Hồ sơ nhân sự 2026".into(),
                    file_type: "Thư mục".into(),
                    size: "—".into(),
                    updated_at: "2026-08-25".into(),
                },
                FileItem {
                    name: "Hop_dong_lao_dong_chuan.pdf".into(),
                    file_type: "Tệp tin".into(),
                    size: "2.4 MB".into(),
                    updated_at: "2026-08-29".into(),
                },
                FileItem {
                    name: "Bao_cao_tai_chinh_Q2.xlsx".into(),
                    file_type: "Tệp tin".into(),
                    size: "1.8 MB".into(),
                    updated_at: "2026-08-30".into(),
                },
            ],
            current_path: "/Root".to_string(),
            notice: String::new(),
        }
    }
}

impl FilesView {
    pub fn render(&mut self, ui: &mut Ui, _session: &Session) {
        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new("LƯU TRỮ ĐÁM MÂY TẬP TRUNG")
                            .size(11.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.heading("Tài liệu & Cloud Drive");
                    ui.label(
                        "Quản lý tệp tin, cây thư mục ảo, tải lên và chia sẻ tài liệu an toàn.",
                    );
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let btn = egui::Button::new(
                        RichText::new("Tải tệp lên").strong().color(Color32::WHITE),
                    )
                    .fill(Color32::from_rgb(0, 150, 136));
                    if ui.add(btn).clicked() {
                        #[cfg(not(target_arch = "wasm32"))]
                        if let Some(path) = rfd::FileDialog::new().pick_file() {
                            let fname = path
                                .file_name()
                                .and_then(|f| f.to_str())
                                .unwrap_or("Tep_tin_moi.pdf");
                            self.files.push(FileItem {
                                name: fname.to_string(),
                                file_type: "Tệp tin".into(),
                                size: "1.2 MB".into(),
                                updated_at: "2026-08-30".into(),
                            });
                            self.notice = format!("Đã tải lên tệp: {}", fname);
                        }

                        #[cfg(target_arch = "wasm32")]
                        {
                            self.notice =
                                "Web sẽ dùng trình chọn tệp của trình duyệt ở bước tích hợp upload API.".into();
                        }
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

            // Breadcrumb path
            ui.horizontal(|ui| {
                ui.label("Đường dẫn:");
                ui.label(
                    RichText::new(&self.current_path)
                        .strong()
                        .color(Color32::from_rgb(0, 150, 136)),
                );
            });

            ui.add_space(10.0);

            // Files Grid
            egui::Frame::none()
                .fill(Color32::WHITE)
                .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                .rounding(8.0)
                .inner_margin(12.0)
                .show(ui, |ui| {
                    egui::Grid::new("files_grid")
                        .striped(true)
                        .min_col_width(130.0)
                        .spacing(Vec2::new(16.0, 10.0))
                        .show(ui, |ui| {
                            ui.label(RichText::new("Tên tệp tin / Thư mục").strong());
                            ui.label(RichText::new("Loại").strong());
                            ui.label(RichText::new("Dung lượng").strong());
                            ui.label(RichText::new("Ngày cập nhật").strong());
                            ui.label(RichText::new("Thao tác").strong());
                            ui.end_row();

                            for file in &self.files {
                                ui.label(RichText::new(&file.name).strong());

                                ui.label(&file.file_type);
                                ui.label(&file.size);
                                ui.label(&file.updated_at);

                                ui.horizontal(|ui| {
                                    if ui.small_button("Tải xuống").clicked() {
                                        self.notice = format!("Đang tải xuống: {}", file.name);
                                    }
                                });
                                ui.end_row();
                            }
                        });
                });
        });
    }
}
