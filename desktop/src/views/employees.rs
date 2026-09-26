use crate::models::Session;
use egui::{Color32, RichText, Ui, Vec2};

pub struct EmployeeItem {
    pub code: String,
    pub name: String,
    pub title: String,
    pub department: String,
    pub salary: u64,
    pub token: String,
}

pub struct EmployeesView {
    pub employees: Vec<EmployeeItem>,
    pub add_open: bool,
    pub new_code: String,
    pub new_name: String,
    pub new_title: String,
    pub new_dept: String,
    pub new_salary: String,
    pub notice: String,
}

impl Default for EmployeesView {
    fn default() -> Self {
        Self {
            employees: vec![
                EmployeeItem {
                    code: "EMP-001".into(),
                    name: "Kỹ Sư Trưởng".into(),
                    title: "Lead Software Architect".into(),
                    department: "Phòng Kỹ thuật".into(),
                    salary: 35000000,
                    token: "tok_arch_88".into(),
                },
                EmployeeItem {
                    code: "EMP-002".into(),
                    name: "Trần Thị Nhân Sự".into(),
                    title: "HR Manager".into(),
                    department: "Phòng Hành chính".into(),
                    salary: 22000000,
                    token: "tok_hr_77".into(),
                },
                EmployeeItem {
                    code: "EMP-003".into(),
                    name: "Lê Văn Kinh Doanh".into(),
                    title: "Sales Executive".into(),
                    department: "Phòng Kinh doanh".into(),
                    salary: 18000000,
                    token: "tok_sales_66".into(),
                },
            ],
            add_open: false,
            new_code: String::new(),
            new_name: String::new(),
            new_title: String::new(),
            new_dept: "Phòng Kỹ thuật".to_string(),
            new_salary: "20000000".to_string(),
            notice: String::new(),
        }
    }
}

impl EmployeesView {
    pub fn render(&mut self, ui: &mut Ui, _session: &Session) {
        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(RichText::new("HỒ SƠ NHÂN SỰ").size(11.0).strong().color(Color32::from_rgb(0, 150, 136)));
                    ui.heading("Hồ sơ nhân viên");
                    ui.label("Quản lý danh sách cán bộ nhân viên, chức danh, mức lương và liên kết kích hoạt.");
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let btn = egui::Button::new(RichText::new("+ Thêm nhân viên").strong().color(Color32::WHITE))
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

            egui::Frame::none()
                .fill(Color32::WHITE)
                .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                .rounding(8.0)
                .inner_margin(12.0)
                .show(ui, |ui| {
                    egui::Grid::new("employees_grid")
                        .striped(true)
                        .min_col_width(130.0)
                        .spacing(Vec2::new(16.0, 10.0))
                        .show(ui, |ui| {
                            ui.label(RichText::new("Mã & Họ tên").strong());
                            ui.label(RichText::new("Chức danh").strong());
                            ui.label(RichText::new("Phòng ban").strong());
                            ui.label(RichText::new("Lương cơ bản").strong());
                            ui.label(RichText::new("Liên kết kích hoạt").strong());
                            ui.end_row();

                            for emp in &self.employees {
                                ui.vertical(|ui| {
                                    ui.label(RichText::new(&emp.name).strong());
                                    ui.label(RichText::new(&emp.code).size(11.0).color(Color32::from_rgb(0, 150, 136)));
                                });

                                ui.label(&emp.title);
                                ui.label(&emp.department);
                                ui.label(RichText::new(format!("{} ₫", format_vnd(emp.salary))).strong().color(Color32::from_rgb(22, 163, 74)));

                                ui.horizontal(|ui| {
                                    if ui.small_button("Sao chép mã").clicked() {
                                        ui.output_mut(|o| o.copied_text = emp.token.clone());
                                    }
                                });
                                ui.end_row();
                            }
                        });
                });
        });

        if self.add_open {
            egui::Window::new("Thêm nhân viên mới")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
                .show(ui.ctx(), |ui| {
                    ui.set_width(320.0);
                    ui.label("Mã nhân viên:");
                    ui.add(
                        egui::TextEdit::singleline(&mut self.new_code)
                            .hint_text("EMP-004")
                            .desired_width(300.0),
                    );

                    ui.add_space(6.0);
                    ui.label("Họ và tên:");
                    ui.add(egui::TextEdit::singleline(&mut self.new_name).desired_width(300.0));

                    ui.add_space(6.0);
                    ui.label("Chức danh:");
                    ui.add(egui::TextEdit::singleline(&mut self.new_title).desired_width(300.0));

                    ui.add_space(6.0);
                    ui.label("Mức lương (VNĐ):");
                    ui.add(egui::TextEdit::singleline(&mut self.new_salary).desired_width(300.0));

                    ui.add_space(14.0);
                    ui.horizontal(|ui| {
                        if ui.button("Hủy").clicked() {
                            self.add_open = false;
                        }
                        let save_btn = egui::Button::new(
                            RichText::new("Lưu nhân sự").strong().color(Color32::WHITE),
                        )
                        .fill(Color32::from_rgb(0, 150, 136));
                        if ui.add(save_btn).clicked() {
                            if !self.new_name.is_empty() {
                                let sal = self.new_salary.parse::<u64>().unwrap_or(15000000);
                                self.employees.push(EmployeeItem {
                                    code: if self.new_code.is_empty() {
                                        format!("EMP-{:03}", self.employees.len() + 1)
                                    } else {
                                        self.new_code.clone()
                                    },
                                    name: self.new_name.clone(),
                                    title: self.new_title.clone(),
                                    department: self.new_dept.clone(),
                                    salary: sal,
                                    token: format!("tok_emp_{}", self.employees.len() + 1),
                                });
                                self.notice = format!("Đã thêm nhân viên {}", self.new_name);
                                self.new_name.clear();
                                self.new_code.clear();
                                self.new_title.clear();
                                self.add_open = false;
                            }
                        }
                    });
                });
        }
    }
}

pub fn format_vnd(amount: u64) -> String {
    let s = amount.to_string();
    let mut out = String::new();
    let chars: Vec<char> = s.chars().rev().collect();
    for (i, c) in chars.iter().enumerate() {
        if i > 0 && i % 3 == 0 {
            out.push('.');
        }
        out.push(*c);
    }
    out.chars().rev().collect()
}
