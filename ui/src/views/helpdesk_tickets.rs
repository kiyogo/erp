use std::time::Duration;

use egui::{Color32, RichText, Ui, Vec2};

use crate::{
    api::{
        ApiClient, ApiTask, CreateHelpdeskTicketInput, HelpdeskTicket, HelpdeskTicketResponse,
        HelpdeskTicketsResponse,
    },
    models::Session,
};

const PRIORITIES: &[&str] = &["Khẩn cấp", "Cao", "Trung bình", "Thấp"];
const NEW: &str = "Mới tạo";
const IN_PROGRESS: &str = "Đang xử lý";
const COMPLETED: &str = "Đã hoàn thành";
const PAGE_SIZE: usize = 8;

#[derive(Default)]
pub struct HelpdeskTicketsView {
    loaded_for: Option<String>,
    tickets: Vec<HelpdeskTicket>,
    list_task: Option<ApiTask<HelpdeskTicketsResponse>>,
    create_task: Option<ApiTask<HelpdeskTicketResponse>>,
    update_task: Option<ApiTask<HelpdeskTicketResponse>>,
    selected_key: Option<String>,
    title: String,
    requester: String,
    department: String,
    priority: String,
    search: String,
    status_filter: String,
    priority_filter: String,
    page: usize,
    create_open: bool,
    needs_reload: bool,
    error: String,
    notice: String,
    form_error: String,
}

impl HelpdeskTicketsView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn clear_account(&mut self, session: &Session) {
        self.tickets.clear();
        self.list_task = None;
        self.create_task = None;
        self.update_task = None;
        self.selected_key = None;
        self.title.clear();
        self.requester = session.user.name.clone();
        self.department.clear();
        self.priority = "Trung bình".to_owned();
        self.create_open = false;
        self.needs_reload = true;
        self.error.clear();
        self.notice.clear();
        self.form_error.clear();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.clear_account(session);
            self.loaded_for = Some(session.user.id.clone());
        }
        if self.needs_reload && self.list_task.is_none() && self.create_task.is_none() {
            self.error.clear();
            self.list_task = Some(api.list_helpdesk_tickets_task(session));
            self.needs_reload = false;
        }
        if let Some(result) = self.list_task.as_ref().and_then(ApiClient::poll) {
            self.list_task = None;
            match result {
                Ok(response) => {
                    self.tickets = response.data;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.create_task.as_ref().and_then(ApiClient::poll) {
            self.create_task = None;
            match result {
                Ok(response) => {
                    self.notice = format!("Đã tạo ticket {}.", response.ticket.code);
                    self.tickets.insert(0, response.ticket);
                    self.title.clear();
                    self.department.clear();
                    self.priority = "Trung bình".to_owned();
                    self.create_open = false;
                    self.form_error.clear();
                    self.error.clear();
                }
                Err(error) => self.form_error = error,
            }
        }
        if let Some(result) = self.update_task.as_ref().and_then(ApiClient::poll) {
            self.update_task = None;
            match result {
                Ok(response) => {
                    let code = response.ticket.code.clone();
                    if let Some(ticket) = self
                        .tickets
                        .iter_mut()
                        .find(|ticket| ticket.key == response.ticket.key)
                    {
                        *ticket = response.ticket;
                    }
                    self.notice = format!("Đã lưu trạng thái ticket {code}.");
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if self.list_task.is_some() || self.create_task.is_some() || self.update_task.is_some() {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Màn Helpdesk hiện được giới hạn cho quản trị viên theo hợp đồng legacy.");
            return;
        }
        self.poll(ctx, session, api);
        let mut selected = None;
        ui.spacing_mut().item_spacing.y = 0.0;
        ui.add_space(8.0);
        if !self.notice.is_empty() {
            ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
        }
        let progress = self
            .tickets
            .iter()
            .filter(|t| t.status == IN_PROGRESS)
            .count();
        let completed = self
            .tickets
            .iter()
            .filter(|t| t.status == COMPLETED)
            .count();
        let urgent = self
            .tickets
            .iter()
            .filter(|t| t.priority == "Khẩn cấp" && t.status != COMPLETED)
            .count();
        let completed_text = format!("{completed} yêu cầu đã đóng hoàn tất");
        crate::widgets::metrics(
            ui,
            "tickets.metrics",
            &[
                crate::widgets::Metric {
                    label: "Tổng số ticket tiếp nhận",
                    value: format!("{} ticket", self.tickets.len()),
                    detail: "Cổng tiếp nhận hỗ trợ tập trung ITIL",
                    color: crate::theme::PRIMARY,
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Ticket đang trong tiến trình xử lý",
                    value: format!("{progress} yêu cầu"),
                    detail: &completed_text,
                    color: Color32::from_rgb(30, 64, 175),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Thời gian phản hồi bình quân (MTTA)",
                    value: "Chưa có dữ liệu".to_owned(),
                    detail: "API chưa cung cấp số liệu MTTA và SLA",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Yêu cầu mức độ Khẩn cấp",
                    value: format!("{urgent} yêu cầu"),
                    detail: "Các yêu cầu khẩn cấp chưa hoàn thành",
                    color: if urgent > 0 {
                        Color32::from_rgb(220, 38, 38)
                    } else {
                        Color32::from_rgb(22, 163, 74)
                    },
                    value_size: 24.0,
                },
            ],
        );
        ui.add_space(16.0);
        let tab = match (self.priority_filter.as_str(), self.status_filter.as_str()) {
            ("Khẩn cấp", _) => 1,
            ("Cao", _) => 2,
            (_, IN_PROGRESS) => 3,
            (_, COMPLETED) => 4,
            _ => 0,
        };
        let before = (self.status_filter.clone(), self.priority_filter.clone());
        let toolbar = crate::widgets::filter_toolbar_with_more(
            ui,
            "tickets",
            &[
                "Tất cả ticket",
                "Khẩn cấp",
                "Mức Cao",
                "Đang xử lý",
                "Đã hoàn tất",
            ],
            tab,
            &mut self.search,
            "Tìm theo mã, tiêu đề, người gửi...",
            "+ Tạo Ticket mới",
            false,
            usize::MAX,
            |ui| {
                ui.label("Trạng thái");
                ui.selectable_value(&mut self.status_filter, String::new(), "Tất cả");
                for status in [NEW, IN_PROGRESS, COMPLETED] {
                    ui.selectable_value(&mut self.status_filter, status.to_owned(), status);
                }
                ui.separator();
                ui.label("Ưu tiên");
                ui.selectable_value(&mut self.priority_filter, String::new(), "Tất cả");
                for priority in PRIORITIES {
                    ui.selectable_value(
                        &mut self.priority_filter,
                        (*priority).to_owned(),
                        *priority,
                    );
                }
            },
        );
        if let Some(index) = toolbar.selected {
            self.status_filter.clear();
            self.priority_filter.clear();
            match index {
                1 => self.priority_filter = "Khẩn cấp".to_owned(),
                2 => self.priority_filter = "Cao".to_owned(),
                3 => self.status_filter = IN_PROGRESS.to_owned(),
                4 => self.status_filter = COMPLETED.to_owned(),
                _ => {}
            }
        }
        if before != (self.status_filter.clone(), self.priority_filter.clone())
            || toolbar.search_changed
        {
            self.page = 1;
        }
        if toolbar.reload_clicked && self.list_task.is_none() {
            self.needs_reload = true;
        }
        if toolbar.create_clicked && self.create_task.is_none() {
            self.title.clear();
            self.requester = session.user.name.clone();
            self.department.clear();
            self.priority = "Trung bình".to_owned();
            self.form_error.clear();
            self.create_open = true;
        }
        ui.add_space(12.0);
        if self.list_task.is_some() && self.tickets.is_empty() {
            ui.spinner();
            ui.label("Đang tải ticket từ máy chủ…");
        }
        let visible = self
            .filtered_tickets()
            .into_iter()
            .cloned()
            .collect::<Vec<_>>();
        let pages = visible.len().div_ceil(PAGE_SIZE).max(1);
        self.page = self.page.clamp(1, pages);
        let shown = visible
            .iter()
            .skip((self.page - 1) * PAGE_SIZE)
            .take(PAGE_SIZE)
            .collect::<Vec<_>>();
        let flexible = (ui.available_width() - 2.0 - 470.0).max(500.0);
        let columns = [
            crate::widgets::TableColumn {
                title: "Mã Ticket & Thời gian",
                width: flexible * 225.21875 / 724.0,
            },
            crate::widgets::TableColumn {
                title: "Tiêu đề sự cố / Yêu cầu IT",
                width: flexible * 256.40625 / 724.0,
            },
            crate::widgets::TableColumn {
                title: "Người gửi & Phòng ban",
                width: flexible * 242.375 / 724.0,
            },
            crate::widgets::TableColumn {
                title: "Mức độ ưu tiên",
                width: 140.0,
            },
            crate::widgets::TableColumn {
                title: "Trạng thái",
                width: 150.0,
            },
            crate::widgets::TableColumn {
                title: "Thao tác",
                width: 180.0,
            },
        ];
        crate::widgets::table_with_row_height(
            ui,
            "tickets.table",
            &columns,
            shown.len(),
            76.0,
            |ui, row, col| {
                let t = shown[row];
                match col {
                    0 => {
                        ui.label(
                            RichText::new(&t.code)
                                .size(13.5)
                                .strong()
                                .color(crate::theme::PRIMARY),
                        );
                        ui.label(
                            RichText::new(&t.created_date)
                                .size(11.5)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                    }
                    1 => {
                        ui.label(RichText::new(&t.title).size(13.0).strong());
                    }
                    2 => {
                        ui.label(RichText::new(&t.requester).strong());
                        ui.label(
                            RichText::new(&t.department)
                                .size(11.5)
                                .color(Color32::from_rgb(37, 99, 235)),
                        );
                        if t.legacy_import_status.is_some() {
                            ui.label(
                                RichText::new("Legacy · chưa xác minh")
                                    .size(11.0)
                                    .color(Color32::from_rgb(180, 83, 9)),
                            );
                        }
                    }
                    3 => crate::widgets::tag(
                        ui,
                        &t.priority,
                        match t.priority.as_str() {
                            "Khẩn cấp" => crate::widgets::TagTone::Error,
                            "Cao" => crate::widgets::TagTone::Warning,
                            "Trung bình" => crate::widgets::TagTone::Processing,
                            _ => crate::widgets::TagTone::Neutral,
                        },
                    ),
                    4 => crate::widgets::tag(
                        ui,
                        &t.status,
                        match t.status.as_str() {
                            IN_PROGRESS => crate::widgets::TagTone::Processing,
                            COMPLETED => crate::widgets::TagTone::Success,
                            _ => crate::widgets::TagTone::Warning,
                        },
                    ),
                    _ => {
                        if ui.small_button("Chi tiết").clicked() {
                            selected = Some(t.key.clone());
                        }
                    }
                }
            },
        );
        ui.add_space(10.0);
        crate::widgets::action_row(ui, |ui| {
            if ui
                .add_enabled(self.page < pages, egui::Button::new("›"))
                .clicked()
            {
                self.page += 1;
            }
            ui.label(format!("{} / {}", self.page, pages));
            if ui
                .add_enabled(self.page > 1, egui::Button::new("‹"))
                .clicked()
            {
                self.page -= 1;
            }
        });
        if let Some(key) = selected {
            self.selected_key = Some(key);
        }
        self.render_create(ctx, session, api);
        self.render_details(ctx, session, api);
    }

    fn filtered_tickets(&self) -> Vec<&HelpdeskTicket> {
        let search = self.search.trim().to_lowercase();
        self.tickets
            .iter()
            .filter(|ticket| {
                (self.status_filter.is_empty() || ticket.status == self.status_filter)
                    && (self.priority_filter.is_empty() || ticket.priority == self.priority_filter)
                    && (search.is_empty()
                        || [
                            ticket.code.as_str(),
                            ticket.title.as_str(),
                            ticket.requester.as_str(),
                            ticket.department.as_str(),
                        ]
                        .iter()
                        .any(|field| field.to_lowercase().contains(&search)))
            })
            .collect()
    }

    fn render_create(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if !self.create_open {
            return;
        }
        let mut submit = false;
        let mut cancel = false;
        let busy = self.create_task.is_some();
        let (_, closed) = crate::widgets::modal(
            ctx,
            "tickets.create",
            "Mở Ticket Yêu Cầu Hỗ Trợ IT ServiceDesk Mới",
            580.0,
            busy,
            |ui| {
                ui.columns(2, |columns| {
                    crate::widgets::form_field(
                        &mut columns[0],
                        "ticket.code",
                        "Mã Ticket",
                        false,
                        |ui| {
                            ui.add_enabled(
                                false,
                                egui::TextEdit::singleline(&mut "Máy chủ tự cấp".to_owned()),
                            );
                        },
                    );
                    crate::widgets::form_field(
                        &mut columns[1],
                        "ticket.priority",
                        "Mức độ ưu tiên",
                        true,
                        |ui| {
                            egui::ComboBox::from_id_salt("helpdesk_ticket_create_priority")
                                .width(ui.available_width())
                                .selected_text(&self.priority)
                                .show_ui(ui, |ui| {
                                    for p in PRIORITIES {
                                        ui.selectable_value(
                                            &mut self.priority,
                                            (*p).to_owned(),
                                            *p,
                                        );
                                    }
                                });
                        },
                    );
                });
                crate::widgets::form_input(
                    ui,
                    "ticket.title",
                    "Tiêu đề yêu cầu / Sự cố",
                    true,
                    &mut self.title,
                    "Ví dụ: Cấp quyền truy cập cụm máy chủ hoặc Báo lỗi mạng...",
                    false,
                );
                ui.columns(2, |columns| {
                    crate::widgets::form_input(
                        &mut columns[0],
                        "ticket.requester",
                        "Người gửi yêu cầu",
                        true,
                        &mut self.requester,
                        "Người yêu cầu",
                        false,
                    );
                    crate::widgets::form_input(
                        &mut columns[1],
                        "ticket.department",
                        "Phòng ban",
                        true,
                        &mut self.department,
                        "Chọn phòng ban...",
                        false,
                    );
                });
                if !self.form_error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
                }
                if busy {
                    ui.spinner();
                }
                ui.add_space(18.0);
                crate::widgets::action_row(ui, |ui| {
                    submit = ui
                        .add(
                            egui::Button::new(RichText::new("Gửi Ticket").color(Color32::WHITE))
                                .fill(crate::theme::PRIMARY)
                                .min_size(egui::vec2(0.0, 32.0)),
                        )
                        .clicked();
                    cancel = ui
                        .add(egui::Button::new("Hủy").min_size(egui::vec2(0.0, 32.0)))
                        .clicked();
                });
            },
        );
        if !busy && (closed || cancel) {
            self.create_open = false;
        }
        if submit {
            match make_input(
                &self.title,
                &self.requester,
                &self.department,
                &self.priority,
            ) {
                Ok(input) => {
                    self.form_error.clear();
                    self.create_task = Some(api.create_helpdesk_ticket_task(session, &input));
                }
                Err(error) => self.form_error = error,
            }
        }
    }

    fn render_details(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let Some(ticket) = self
            .selected_key
            .as_deref()
            .and_then(|key| self.tickets.iter().find(|item| item.key == key))
            .cloned()
        else {
            self.selected_key = None;
            return;
        };
        let mut open = true;
        let next_status = match ticket.status.as_str() {
            NEW => Some(IN_PROGRESS),
            IN_PROGRESS => Some(COMPLETED),
            _ => None,
        };
        egui::Window::new(format!("Ticket · {}", ticket.code))
            .open(&mut open)
            .resizable(true)
            .default_size(Vec2::new(470.0, 400.0))
            .show(ctx, |ui| {
                ui.heading(&ticket.title);
                ui.label(format!("{} · {}", ticket.priority, ticket.status));
                ui.separator();
                detail_row(ui, "Người yêu cầu", &ticket.requester);
                detail_row(ui, "Phòng ban", &ticket.department);
                detail_row(ui, "Mã ticket", &ticket.code);
                detail_row(ui, "Thời điểm ghi nhận", &ticket.created_date);
                detail_row(ui, "ADMIN ghi nhận", &ticket.created_by_name);
                detail_row(ui, "Cập nhật lần cuối", &ticket.updated_at);
                if ticket.legacy_import_status.as_deref() == Some("unverified") {
                    ui.colored_label(
                        Color32::from_rgb(180, 83, 9),
                        "Ticket được nhập từ legacy; nội dung/trạng thái nguồn chưa được xác minh. ADMIN ghi nhận ở trên là người nhập, không khẳng định là người tạo ban đầu.",
                    );
                }
                if let Some(next_status) = next_status {
                    if ui
                        .add_enabled(
                            self.update_task.is_none(),
                            egui::Button::new(if next_status == IN_PROGRESS {
                                "Tiếp nhận ticket"
                            } else {
                                "Đánh dấu hoàn thành"
                            }),
                        )
                        .clicked()
                    {
                        self.error.clear();
                        self.update_task = Some(api.update_helpdesk_ticket_task(
                            session,
                            &ticket.key,
                            next_status,
                        ));
                    }
                } else {
                    ui.colored_label(
                        Color32::from_rgb(22, 101, 52),
                        "Ticket đã hoàn thành; không thể mở lại qua luồng này.",
                    );
                }
            });
        if !open {
            self.selected_key = None;
        }
    }
}

fn make_input(
    title: &str,
    requester: &str,
    department: &str,
    priority: &str,
) -> Result<CreateHelpdeskTicketInput, String> {
    let title = title.trim();
    let requester = requester.trim();
    let department = department.trim();
    if title.is_empty() || title.chars().count() > 200 {
        return Err("Tiêu đề phải có từ 1 đến 200 ký tự.".to_owned());
    }
    if requester.is_empty() || requester.chars().count() > 160 {
        return Err("Tên người yêu cầu phải có từ 1 đến 160 ký tự.".to_owned());
    }
    if department.is_empty() || department.chars().count() > 160 {
        return Err("Phòng ban phải có từ 1 đến 160 ký tự.".to_owned());
    }
    if !PRIORITIES.contains(&priority) {
        return Err("Mức ưu tiên không hợp lệ.".to_owned());
    }
    Ok(CreateHelpdeskTicketInput {
        title: title.to_owned(),
        requester: requester.to_owned(),
        department: department.to_owned(),
        priority: priority.to_owned(),
    })
}

fn detail_row(ui: &mut Ui, label: &str, value: &str) {
    ui.horizontal(|ui| {
        ui.label(RichText::new(label).strong());
        ui.label(if value.trim().is_empty() {
            "—"
        } else {
            value
        });
    });
}

#[cfg(test)]
mod tests {
    use super::make_input;

    #[test]
    fn helpdesk_form_requires_real_fields_and_valid_priority() {
        assert!(make_input("", "Person", "IT", "Cao").is_err());
        assert!(make_input("Problem", "Person", "IT", "P1").is_err());
        let input = make_input(" Problem ", " Person ", " IT ", "Cao").unwrap();
        assert_eq!(input.title, "Problem");
        assert_eq!(input.requester, "Person");
        assert_eq!(input.priority, "Cao");
    }
}
