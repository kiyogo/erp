use crate::models::Session;
use crate::views::employees::format_vnd;
use egui::{Color32, RichText, Ui, Vec2};

pub struct FinanceItem {
    pub code: String,
    pub title: String,
    pub flow_type: String, // "Thu" / "Chi"
    pub amount: u64,
    pub date: String,
    pub partner: String,
}

pub struct FinanceView {
    pub items: Vec<FinanceItem>,
    pub add_open: bool,
    pub new_title: String,
    pub new_type: String,
    pub new_amount: String,
    pub new_partner: String,
    pub notice: String,
}

impl Default for FinanceView {
    fn default() -> Self {
        Self {
            items: vec![
                FinanceItem {
                    code: "PT-001".into(),
                    title: "Thanh toán hợp đồng phần mềm Alpha Tech".into(),
                    flow_type: "Thu".into(),
                    amount: 240000000,
                    date: "2026-08-25".into(),
                    partner: "Alpha Tech".into(),
                },
                FinanceItem {
                    code: "PC-001".into(),
                    title: "Chi trả phí máy chủ Cloud & Hạ tầng".into(),
                    flow_type: "Chi".into(),
                    amount: 35000000,
                    date: "2026-08-26".into(),
                    partner: "Cloud Services".into(),
                },
                FinanceItem {
                    code: "PT-002".into(),
                    title: "Tạm ứng dự án Logistic Toàn Cầu".into(),
                    flow_type: "Thu".into(),
                    amount: 80000000,
                    date: "2026-08-28".into(),
                    partner: "Global Logistics".into(),
                },
                FinanceItem {
                    code: "PC-002".into(),
                    title: "Mua sắm trang thiết bị máy tính MacBook".into(),
                    flow_type: "Chi".into(),
                    amount: 65000000,
                    date: "2026-08-29".into(),
                    partner: "Apple Store VN".into(),
                },
            ],
            add_open: false,
            new_title: String::new(),
            new_type: "Thu".to_string(),
            new_amount: "50000000".to_string(),
            new_partner: String::new(),
            notice: String::new(),
        }
    }
}

impl FinanceView {
    pub fn render(&mut self, ui: &mut Ui, _session: &Session) {
        let total_thu: u64 = self
            .items
            .iter()
            .filter(|i| i.flow_type == "Thu")
            .map(|i| i.amount)
            .sum();
        let total_chi: u64 = self
            .items
            .iter()
            .filter(|i| i.flow_type == "Chi")
            .map(|i| i.amount)
            .sum();
        let net_profit = total_thu.saturating_sub(total_chi);

        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(RichText::new("QUẢN TRỊ TÀI CHÍNH").size(11.0).strong().color(Color32::from_rgb(0, 150, 136)));
                    ui.heading("Thu chi & Dòng tiền");
                    ui.label("Theo dõi nguồn thu, chi phí vận hành, hóa đơn và lợi nhuận ròng doanh nghiệp.");
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let btn = egui::Button::new(RichText::new("+ Lập phiếu thu chi").strong().color(Color32::WHITE))
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

            // Metric cards
            ui.horizontal(|ui| {
                render_stat(ui, "TỔNG THU (+)", &format!("{} ₫", format_vnd(total_thu)), Color32::from_rgb(22, 163, 74));
                ui.add_space(12.0);
                render_stat(ui, "TỔNG CHI (-)", &format!("{} ₫", format_vnd(total_chi)), Color32::from_rgb(220, 38, 38));
                ui.add_space(12.0);
                render_stat(ui, "LỢI NHUẬN RÒNG", &format!("{} ₫", format_vnd(net_profit)), Color32::from_rgb(0, 150, 136));
            });

            ui.add_space(16.0);

            // Table
            egui::Frame::none()
                .fill(Color32::WHITE)
                .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                .rounding(8.0)
                .inner_margin(12.0)
                .show(ui, |ui| {
                    egui::Grid::new("finance_grid")
                        .striped(true)
                        .min_col_width(130.0)
                        .spacing(Vec2::new(16.0, 10.0))
                        .show(ui, |ui| {
                            ui.label(RichText::new("Mã & Nội dung").strong());
                            ui.label(RichText::new("Phân loại").strong());
                            ui.label(RichText::new("Đối tác").strong());
                            ui.label(RichText::new("Ngày").strong());
                            ui.label(RichText::new("Số tiền").strong());
                            ui.end_row();

                            for item in &self.items {
                                ui.vertical(|ui| {
                                    ui.label(RichText::new(&item.title).strong());
                                    ui.label(RichText::new(&item.code).size(11.0).color(Color32::from_rgb(100, 116, 139)));
                                });

                                if item.flow_type == "Thu" {
                                    ui.label(RichText::new("Phiếu thu (+)").color(Color32::from_rgb(22, 163, 74)));
                                } else {
                                    ui.label(RichText::new("Phiếu chi (-)").color(Color32::from_rgb(220, 38, 38)));
                                }

                                ui.label(&item.partner);
                                ui.label(&item.date);

                                let color = if item.flow_type == "Thu" { Color32::from_rgb(22, 163, 74) } else { Color32::from_rgb(220, 38, 38) };
                                ui.label(RichText::new(format!("{} ₫", format_vnd(item.amount))).strong().color(color));
                                ui.end_row();
                            }
                        });
                });
        });

        if self.add_open {
            egui::Window::new("Lập phiếu giao dịch tài chính")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
                .show(ui.ctx(), |ui| {
                    ui.set_width(320.0);
                    ui.label("Loại phiếu:");
                    egui::ComboBox::from_id_salt("fin_type_combo")
                        .selected_text(&self.new_type)
                        .show_ui(ui, |ui| {
                            ui.selectable_value(&mut self.new_type, "Thu".into(), "Phiếu thu (+)");
                            ui.selectable_value(&mut self.new_type, "Chi".into(), "Phiếu chi (-)");
                        });

                    ui.add_space(6.0);
                    ui.label("Nội dung diễn giải:");
                    ui.add(egui::TextEdit::singleline(&mut self.new_title).desired_width(300.0));

                    ui.add_space(6.0);
                    ui.label("Đối tác / Khách hàng:");
                    ui.add(egui::TextEdit::singleline(&mut self.new_partner).desired_width(300.0));

                    ui.add_space(6.0);
                    ui.label("Số tiền (VNĐ):");
                    ui.add(egui::TextEdit::singleline(&mut self.new_amount).desired_width(300.0));

                    ui.add_space(14.0);
                    ui.horizontal(|ui| {
                        if ui.button("Hủy").clicked() {
                            self.add_open = false;
                        }
                        let save_btn = egui::Button::new(
                            RichText::new("Lưu phiếu").strong().color(Color32::WHITE),
                        )
                        .fill(Color32::from_rgb(0, 150, 136));
                        if ui.add(save_btn).clicked() {
                            if !self.new_title.is_empty() {
                                let amt = self.new_amount.parse::<u64>().unwrap_or(10000000);
                                self.items.push(FinanceItem {
                                    code: format!(
                                        "P{}-{}",
                                        if self.new_type == "Thu" { "T" } else { "C" },
                                        self.items.len() + 1
                                    ),
                                    title: self.new_title.clone(),
                                    flow_type: self.new_type.clone(),
                                    amount: amt,
                                    date: "2026-08-30".into(),
                                    partner: if self.new_partner.is_empty() {
                                        "Nội bộ".into()
                                    } else {
                                        self.new_partner.clone()
                                    },
                                });
                                self.notice =
                                    format!("Đã tạo phiếu {} thành công!", self.new_title);
                                self.new_title.clear();
                                self.new_partner.clear();
                                self.add_open = false;
                            }
                        }
                    });
                });
        }
    }
}

fn render_stat(ui: &mut Ui, title: &str, value: &str, color: Color32) {
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
            ui.label(RichText::new(value).size(16.0).strong().color(color));
        });
}
