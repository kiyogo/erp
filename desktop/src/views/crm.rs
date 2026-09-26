use crate::models::Session;
use crate::views::employees::format_vnd;
use egui::{Color32, RichText, Ui, Vec2};

pub struct CustomerItem {
    pub code: String,
    pub name: String,
    pub cust_type: String,
    pub email: String,
    pub phone: String,
    pub contract_value: u64,
}

pub struct CrmView {
    pub customers: Vec<CustomerItem>,
    pub add_open: bool,
    pub new_name: String,
    pub new_code: String,
    pub new_type: String,
    pub new_email: String,
    pub new_phone: String,
    pub new_val: String,
    pub active_tab: String,
    pub notice: String,
}

impl Default for CrmView {
    fn default() -> Self {
        Self {
            customers: vec![
                CustomerItem {
                    code: "CUST-001".into(),
                    name: "Tập đoàn Công nghệ Alpha Tech".into(),
                    cust_type: "Khách hàng VIP".into(),
                    email: "contact@alphatech.vn".into(),
                    phone: "0912 345 678".into(),
                    contract_value: 240000000,
                },
                CustomerItem {
                    code: "CUST-002".into(),
                    name: "Công ty Cổ phần Vận tải Toàn Cầu".into(),
                    cust_type: "Khách hàng".into(),
                    email: "logistics@globalvn.com".into(),
                    phone: "0908 123 456".into(),
                    contract_value: 125000000,
                },
                CustomerItem {
                    code: "PART-001".into(),
                    name: "Nhà cung cấp Hạ tầng Điện toán Đám mây".into(),
                    cust_type: "Đối tác chiến lược".into(),
                    email: "cloud-partner@kiyo.io".into(),
                    phone: "0988 777 666".into(),
                    contract_value: 85000000,
                },
            ],
            add_open: false,
            new_name: String::new(),
            new_code: String::new(),
            new_type: "Khách hàng VIP".to_string(),
            new_email: String::new(),
            new_phone: String::new(),
            new_val: "100000000".to_string(),
            active_tab: "Tất cả".to_string(),
            notice: String::new(),
        }
    }
}

impl CrmView {
    pub fn render(&mut self, ui: &mut Ui, _session: &Session) {
        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(RichText::new("QUAN HỆ KHÁCH HÀNG & ĐỐI TÁC").size(11.0).strong().color(Color32::from_rgb(0, 150, 136)));
                    ui.heading("Khách hàng & CRM");
                    ui.label("Quản lý danh bạ khách hàng tiềm năng, đối tác chiến lược và giá trị hợp đồng.");
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let btn = egui::Button::new(RichText::new("+ Thêm khách hàng").strong().color(Color32::WHITE))
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

            // Tab bar
            ui.horizontal(|ui| {
                if ui.selectable_label(self.active_tab == "Tất cả", "Tất cả").clicked() {
                    self.active_tab = "Tất cả".into();
                }
                if ui.selectable_label(self.active_tab == "Khách hàng", "Khách hàng").clicked() {
                    self.active_tab = "Khách hàng".into();
                }
                if ui.selectable_label(self.active_tab == "Đối tác", "Đối tác / NCC").clicked() {
                    self.active_tab = "Đối tác".into();
                }
            });

            ui.add_space(10.0);

            egui::Frame::none()
                .fill(Color32::WHITE)
                .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                .rounding(8.0)
                .inner_margin(12.0)
                .show(ui, |ui| {
                    egui::Grid::new("crm_grid")
                        .striped(true)
                        .min_col_width(130.0)
                        .spacing(Vec2::new(16.0, 10.0))
                        .show(ui, |ui| {
                            ui.label(RichText::new("Mã & Tên tổ chức").strong());
                            ui.label(RichText::new("Phân loại").strong());
                            ui.label(RichText::new("Liên hệ").strong());
                            ui.label(RichText::new("Giá trị hợp đồng").strong());
                            ui.end_row();

                            for c in &self.customers {
                                if self.active_tab == "Khách hàng" && !c.cust_type.contains("Khách hàng") {
                                    continue;
                                }
                                if self.active_tab == "Đối tác" && !c.cust_type.contains("Đối tác") {
                                    continue;
                                }

                                ui.vertical(|ui| {
                                    ui.label(RichText::new(&c.name).strong());
                                    ui.label(RichText::new(&c.code).size(11.0).color(Color32::from_rgb(0, 150, 136)));
                                });

                                ui.label(&c.cust_type);

                                ui.vertical(|ui| {
                                    ui.label(RichText::new(&c.phone).strong());
                                    ui.label(RichText::new(&c.email).size(11.0).color(Color32::from_rgb(100, 116, 139)));
                                });

                                ui.label(RichText::new(format!("{} ₫", format_vnd(c.contract_value))).strong().color(Color32::from_rgb(22, 163, 74)));
                                ui.end_row();
                            }
                        });
                });
        });

        if self.add_open {
            egui::Window::new("Thêm khách hàng / đối tác mới")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
                .show(ui.ctx(), |ui| {
                    ui.set_width(320.0);
                    ui.label("Tên công ty / tổ chức:");
                    ui.add(egui::TextEdit::singleline(&mut self.new_name).desired_width(300.0));

                    ui.add_space(6.0);
                    ui.label("Phân loại:");
                    egui::ComboBox::from_id_salt("crm_type_combo")
                        .selected_text(&self.new_type)
                        .show_ui(ui, |ui| {
                            ui.selectable_value(
                                &mut self.new_type,
                                "Khách hàng VIP".into(),
                                "Khách hàng VIP",
                            );
                            ui.selectable_value(
                                &mut self.new_type,
                                "Khách hàng".into(),
                                "Khách hàng",
                            );
                            ui.selectable_value(
                                &mut self.new_type,
                                "Đối tác chiến lược".into(),
                                "Đối tác chiến lược",
                            );
                        });

                    ui.add_space(6.0);
                    ui.label("Email liên hệ:");
                    ui.add(egui::TextEdit::singleline(&mut self.new_email).desired_width(300.0));

                    ui.add_space(6.0);
                    ui.label("Số điện thoại:");
                    ui.add(egui::TextEdit::singleline(&mut self.new_phone).desired_width(300.0));

                    ui.add_space(6.0);
                    ui.label("Giá trị hợp đồng (VNĐ):");
                    ui.add(egui::TextEdit::singleline(&mut self.new_val).desired_width(300.0));

                    ui.add_space(14.0);
                    ui.horizontal(|ui| {
                        if ui.button("Hủy").clicked() {
                            self.add_open = false;
                        }
                        let save_btn = egui::Button::new(
                            RichText::new("Lưu đối tác").strong().color(Color32::WHITE),
                        )
                        .fill(Color32::from_rgb(0, 150, 136));
                        if ui.add(save_btn).clicked() {
                            if !self.new_name.is_empty() {
                                let val = self.new_val.parse::<u64>().unwrap_or(0);
                                self.customers.push(CustomerItem {
                                    code: format!("CUST-{:03}", self.customers.len() + 1),
                                    name: self.new_name.clone(),
                                    cust_type: self.new_type.clone(),
                                    email: self.new_email.clone(),
                                    phone: self.new_phone.clone(),
                                    contract_value: val,
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
