use crate::models::Session;
use egui::{Color32, RichText, Ui, Vec2};

pub struct WorkflowItem {
    pub id: String,
    pub title: String,
    pub req_type: String,
    pub requester: String,
    pub priority: String,
    pub status: String,
    pub content: String,
}

pub struct WorkflowsView {
    pub requests: Vec<WorkflowItem>,
    pub active_tab: String,
    pub create_open: bool,
    pub new_title: String,
    pub new_type: String,
    pub new_priority: String,
    pub new_content: String,
    pub notice: String,
}

impl Default for WorkflowsView {
    fn default() -> Self {
        Self {
            requests: vec![
                WorkflowItem {
                    id: "WF-01".into(),
                    title: "Đề xuất mua sắm 02 màn hình Dell UltraSharp".into(),
                    req_type: "Đề xuất mua sắm".into(),
                    requester: "Kỹ Sư Trưởng".into(),
                    priority: "Ưu tiên cao".into(),
                    status: "Chờ duyệt".into(),
                    content: "Trang bị màn hình 4K cho lập trình viên để tăng năng suất làm việc."
                        .into(),
                },
                WorkflowItem {
                    id: "WF-02".into(),
                    title: "Tạm ứng chi phí công tác Đà Nẵng".into(),
                    req_type: "Thanh toán chi phí".into(),
                    requester: "Lê Văn Kinh Doanh".into(),
                    priority: "Bình thường".into(),
                    status: "Đã duyệt".into(),
                    content: "Gặp gỡ khách hàng ký hợp đồng phần mềm.".into(),
                },
                WorkflowItem {
                    id: "WF-03".into(),
                    title: "Đề xuất tuyển dụng thêm 2 Backend Devs".into(),
                    req_type: "Đề xuất nhân sự".into(),
                    requester: "Trần Thị Nhân Sự".into(),
                    priority: "Khẩn cấp".into(),
                    status: "Chờ duyệt".into(),
                    content: "Bổ sung nhân sự cho dự án mở rộng.".into(),
                },
            ],
            active_tab: "Tất cả".to_string(),
            create_open: false,
            new_title: String::new(),
            new_type: "Đề xuất mua sắm".to_string(),
            new_priority: "Bình thường".to_string(),
            new_content: String::new(),
            notice: String::new(),
        }
    }
}

impl WorkflowsView {
    pub fn render(&mut self, ui: &mut Ui, session: &Session) {
        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new("QUẢN LÝ QUY TRÌNH")
                            .size(11.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.heading("Quy trình & Phê duyệt");
                    ui.label("Xét duyệt đơn từ, đề xuất mua sắm và quy trình nội bộ doanh nghiệp.");
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let btn = egui::Button::new(
                        RichText::new("+ Tạo đề xuất mới")
                            .strong()
                            .color(Color32::WHITE),
                    )
                    .fill(Color32::from_rgb(0, 150, 136));
                    if ui.add(btn).clicked() {
                        self.create_open = true;
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

            // Tab Filters
            ui.horizontal(|ui| {
                if ui
                    .selectable_label(self.active_tab == "Tất cả", "Tất cả")
                    .clicked()
                {
                    self.active_tab = "Tất cả".into();
                }
                if ui
                    .selectable_label(self.active_tab == "Chờ duyệt", "Chờ duyệt")
                    .clicked()
                {
                    self.active_tab = "Chờ duyệt".into();
                }
                if ui
                    .selectable_label(self.active_tab == "Đã duyệt", "Đã duyệt")
                    .clicked()
                {
                    self.active_tab = "Đã duyệt".into();
                }
            });

            ui.add_space(10.0);

            // Requests List
            let mut decision: Option<(usize, String)> = None;

            egui::Frame::none()
                .fill(Color32::WHITE)
                .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                .rounding(8.0)
                .inner_margin(12.0)
                .show(ui, |ui| {
                    egui::Grid::new("workflows_grid")
                        .striped(true)
                        .min_col_width(130.0)
                        .spacing(Vec2::new(16.0, 10.0))
                        .show(ui, |ui| {
                            ui.label(RichText::new("Tiêu đề & Người đề xuất").strong());
                            ui.label(RichText::new("Phân loại").strong());
                            ui.label(RichText::new("Ưu tiên").strong());
                            ui.label(RichText::new("Trạng thái").strong());
                            ui.label(RichText::new("Thao tác duyệt").strong());
                            ui.end_row();

                            for (idx, req) in self.requests.iter().enumerate() {
                                if self.active_tab != "Tất cả" && req.status != self.active_tab
                                {
                                    continue;
                                }

                                ui.vertical(|ui| {
                                    ui.label(RichText::new(&req.title).strong());
                                    ui.label(
                                        RichText::new(format!("Người gửi: {}", req.requester))
                                            .size(11.0)
                                            .color(Color32::from_rgb(100, 116, 139)),
                                    );
                                });

                                ui.label(&req.req_type);
                                ui.label(&req.priority);

                                if req.status == "Đã duyệt" {
                                    ui.label(
                                        RichText::new(&req.status)
                                            .color(Color32::from_rgb(22, 163, 74)),
                                    );
                                } else if req.status == "Từ chối" {
                                    ui.label(
                                        RichText::new(&req.status)
                                            .color(Color32::from_rgb(220, 38, 38)),
                                    );
                                } else {
                                    ui.label(
                                        RichText::new(&req.status)
                                            .color(Color32::from_rgb(217, 119, 6)),
                                    );
                                }

                                ui.horizontal(|ui| {
                                    if session.user.role == "ADMIN" && req.status == "Chờ duyệt"
                                    {
                                        if ui
                                            .small_button(
                                                RichText::new("Duyệt")
                                                    .color(Color32::from_rgb(22, 163, 74)),
                                            )
                                            .clicked()
                                        {
                                            decision = Some((idx, "Đã duyệt".into()));
                                        }
                                        if ui
                                            .small_button(
                                                RichText::new("Từ chối")
                                                    .color(Color32::from_rgb(220, 38, 38)),
                                            )
                                            .clicked()
                                        {
                                            decision = Some((idx, "Từ chối".into()));
                                        }
                                    } else {
                                        ui.label("—");
                                    }
                                });
                                ui.end_row();
                            }
                        });
                });

            if let Some((idx, new_status)) = decision {
                self.requests[idx].status = new_status.clone();
                self.notice = format!(
                    "Đã chuyển trạng thái đề xuất '{}' sang {}",
                    self.requests[idx].title, new_status
                );
            }
        });

        if self.create_open {
            egui::Window::new("Tạo phiếu yêu cầu duyệt")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
                .show(ui.ctx(), |ui| {
                    ui.set_width(340.0);
                    ui.label("Loại đề xuất:");
                    egui::ComboBox::from_id_salt("wf_type_combo")
                        .selected_text(&self.new_type)
                        .show_ui(ui, |ui| {
                            ui.selectable_value(
                                &mut self.new_type,
                                "Đề xuất mua sắm".into(),
                                "Đề xuất mua sắm thiết bị",
                            );
                            ui.selectable_value(
                                &mut self.new_type,
                                "Thanh toán chi phí".into(),
                                "Tạm ứng / Thanh toán chi phí",
                            );
                            ui.selectable_value(
                                &mut self.new_type,
                                "Kế hoạch công tác".into(),
                                "Kế hoạch công tác",
                            );
                            ui.selectable_value(
                                &mut self.new_type,
                                "Đề xuất nhân sự".into(),
                                "Tuyển dụng nhân sự",
                            );
                        });

                    ui.add_space(6.0);
                    ui.label("Mức độ ưu tiên:");
                    egui::ComboBox::from_id_salt("wf_priority_combo")
                        .selected_text(&self.new_priority)
                        .show_ui(ui, |ui| {
                            ui.selectable_value(
                                &mut self.new_priority,
                                "Bình thường".into(),
                                "Bình thường",
                            );
                            ui.selectable_value(
                                &mut self.new_priority,
                                "Ưu tiên cao".into(),
                                "Ưu tiên cao",
                            );
                            ui.selectable_value(
                                &mut self.new_priority,
                                "Khẩn cấp".into(),
                                "Khẩn cấp",
                            );
                        });

                    ui.add_space(6.0);
                    ui.label("Tiêu đề đề xuất:");
                    ui.add(egui::TextEdit::singleline(&mut self.new_title).desired_width(320.0));

                    ui.add_space(6.0);
                    ui.label("Nội dung chi tiết:");
                    ui.add(
                        egui::TextEdit::multiline(&mut self.new_content)
                            .desired_rows(3)
                            .desired_width(320.0),
                    );

                    ui.add_space(14.0);
                    ui.horizontal(|ui| {
                        if ui.button("Hủy").clicked() {
                            self.create_open = false;
                        }
                        let submit_btn = egui::Button::new(
                            RichText::new("Gửi đề xuất").strong().color(Color32::WHITE),
                        )
                        .fill(Color32::from_rgb(0, 150, 136));
                        if ui.add(submit_btn).clicked() {
                            if !self.new_title.is_empty() {
                                self.requests.push(WorkflowItem {
                                    id: format!("WF-{:02}", self.requests.len() + 1),
                                    title: self.new_title.clone(),
                                    req_type: self.new_type.clone(),
                                    requester: session.user.name.clone(),
                                    priority: self.new_priority.clone(),
                                    status: "Chờ duyệt".into(),
                                    content: self.new_content.clone(),
                                });
                                self.notice =
                                    format!("Đã gửi đề xuất '{}' thành công!", self.new_title);
                                self.new_title.clear();
                                self.new_content.clear();
                                self.create_open = false;
                            }
                        }
                    });
                });
        }
    }
}
