use crate::models::Session;
use crate::views::employees::format_vnd;
use egui::{Color32, RichText, Ui, Vec2};

pub struct InsuranceItem {
    pub name: String,
    pub book_number: String,
    pub salary_base: u64,
    pub company_pay: u64,
    pub employee_pay: u64,
    pub status: String,
}

pub struct InsuranceView {
    pub items: Vec<InsuranceItem>,
}

impl Default for InsuranceView {
    fn default() -> Self {
        Self {
            items: vec![
                InsuranceItem {
                    name: "Kỹ Sư Trưởng".into(),
                    book_number: "7912345678".into(),
                    salary_base: 18000000,
                    company_pay: 3870000,
                    employee_pay: 1890000,
                    status: "Đang tham gia".into(),
                },
                InsuranceItem {
                    name: "Trần Thị Nhân Sự".into(),
                    book_number: "7987654321".into(),
                    salary_base: 15000000,
                    company_pay: 3225000,
                    employee_pay: 1575000,
                    status: "Đang tham gia".into(),
                },
                InsuranceItem {
                    name: "Nguyễn Văn Quản Trị".into(),
                    book_number: "7966889900".into(),
                    salary_base: 15000000,
                    company_pay: 3225000,
                    employee_pay: 1575000,
                    status: "Đang tham gia".into(),
                },
            ],
        }
    }
}

impl InsuranceView {
    pub fn render(&mut self, ui: &mut Ui, _session: &Session) {
        ui.vertical(|ui| {
            ui.label(
                RichText::new("CHẾ ĐỘ PHÚC LỢI & AN SINH")
                    .size(11.0)
                    .strong()
                    .color(Color32::from_rgb(0, 150, 136)),
            );
            ui.heading("Bảo hiểm & Phúc lợi Xã hội");
            ui.label(
                "Quản lý danh sách đóng BHXH, BHYT, BHTN và chế độ bảo hiểm sức khỏe nâng cao.",
            );

            ui.add_space(14.0);

            // Rate overview cards
            ui.horizontal(|ui| {
                render_ins_card(
                    ui,
                    "BHXH DOANH NGHIỆP",
                    "21.5%",
                    "17.5% BHXH + 3% BHYT + 1% BHTN",
                    Color32::from_rgb(0, 150, 136),
                );
                ui.add_space(12.0);
                render_ins_card(
                    ui,
                    "NGƯỜI LAO ĐỘNG ĐÓNG",
                    "10.5%",
                    "8% BHXH + 1.5% BHYT + 1% BHTN",
                    Color32::from_rgb(22, 163, 74),
                );
                ui.add_space(12.0);
                render_ins_card(
                    ui,
                    "BẢO HIỂM VIP PVI",
                    "PVI Care 2026",
                    "Hạn mức nội trú 120tr/năm",
                    Color32::from_rgb(79, 70, 229),
                );
            });

            ui.add_space(16.0);

            egui::Frame::none()
                .fill(Color32::WHITE)
                .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                .rounding(8.0)
                .inner_margin(12.0)
                .show(ui, |ui| {
                    egui::Grid::new("insurance_grid")
                        .striped(true)
                        .min_col_width(130.0)
                        .spacing(Vec2::new(16.0, 10.0))
                        .show(ui, |ui| {
                            ui.label(RichText::new("Họ tên nhân viên").strong());
                            ui.label(RichText::new("Mã số sổ BHXH").strong());
                            ui.label(RichText::new("Lương đóng BH").strong());
                            ui.label(RichText::new("Doanh nghiệp đóng (21.5%)").strong());
                            ui.label(RichText::new("NLĐ trích lương (10.5%)").strong());
                            ui.label(RichText::new("Trạng thái").strong());
                            ui.end_row();

                            for item in &self.items {
                                ui.label(RichText::new(&item.name).strong());
                                ui.label(&item.book_number);
                                ui.label(
                                    RichText::new(format!("{} ₫", format_vnd(item.salary_base)))
                                        .strong(),
                                );
                                ui.label(
                                    RichText::new(format!("{} ₫", format_vnd(item.company_pay)))
                                        .color(Color32::from_rgb(22, 163, 74)),
                                );
                                ui.label(
                                    RichText::new(format!("{} ₫", format_vnd(item.employee_pay)))
                                        .color(Color32::from_rgb(220, 38, 38)),
                                );
                                ui.label(
                                    RichText::new(&item.status)
                                        .color(Color32::from_rgb(22, 163, 74)),
                                );
                                ui.end_row();
                            }
                        });
                });
        });
    }
}

fn render_ins_card(ui: &mut Ui, title: &str, value: &str, sub: &str, color: Color32) {
    egui::Frame::none()
        .fill(Color32::WHITE)
        .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
        .rounding(8.0)
        .inner_margin(12.0)
        .show(ui, |ui| {
            ui.set_width(220.0);
            ui.label(
                RichText::new(title)
                    .size(10.5)
                    .strong()
                    .color(Color32::from_rgb(100, 116, 139)),
            );
            ui.add_space(2.0);
            ui.label(RichText::new(value).size(17.0).strong().color(color));
            ui.add_space(2.0);
            ui.label(
                RichText::new(sub)
                    .size(10.5)
                    .color(Color32::from_rgb(148, 163, 184)),
            );
        });
}
