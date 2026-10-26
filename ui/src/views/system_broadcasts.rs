use std::time::Duration;
use web_time::Instant;

use crate::{
    api::{
        ActivationEmailTemplate, ActivationEmailTemplateResponse, ApiClient, ApiTask,
        SystemBroadcast, SystemBroadcastInput, SystemBroadcastMutation, SystemBroadcastsResponse,
    },
    models::Session,
};
use egui::{Color32, RichText, Ui};

#[derive(Debug, Clone)]
enum PendingAction {
    Create,
    Update(String),
    Delete(String),
}

struct PendingMutation {
    action: PendingAction,
    task: ApiTask<SystemBroadcastMutation>,
}

pub struct SystemBroadcastsView {
    broadcasts: Vec<SystemBroadcast>,
    pending_list: Option<ApiTask<SystemBroadcastsResponse>>,
    pending_mutation: Option<PendingMutation>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    needs_reload: bool,
    search: String,
    title: String,
    content: String,
    broadcast_type: String,
    target_audience: String,
    channel_in_app: bool,
    channel_email: bool,
    channel_sms: bool,
    editing_id: Option<String>,
    confirm_delete: Option<String>,
    error: String,
    notice: String,
    activation_template: ActivationEmailTemplate,
    template_email_configured: bool,
    template_loaded_for: Option<String>,
    pending_template_load: Option<ApiTask<ActivationEmailTemplateResponse>>,
    pending_template_save: Option<ApiTask<ActivationEmailTemplate>>,
    template_error: String,
    template_notice: String,
}

impl Default for SystemBroadcastsView {
    fn default() -> Self {
        Self {
            broadcasts: Vec::new(),
            pending_list: None,
            pending_mutation: None,
            loaded_for: None,
            last_loaded: None,
            needs_reload: false,
            search: String::new(),
            title: String::new(),
            content: String::new(),
            broadcast_type: "info".to_owned(),
            target_audience: "Tất cả nhân sự".to_owned(),
            channel_in_app: true,
            channel_email: false,
            channel_sms: false,
            editing_id: None,
            confirm_delete: None,
            error: String::new(),
            notice: String::new(),
            activation_template: default_activation_email_template(),
            template_email_configured: false,
            template_loaded_for: None,
            pending_template_load: None,
            pending_template_save: None,
            template_error: String::new(),
            template_notice: String::new(),
        }
    }
}

impl SystemBroadcastsView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        if self.pending_list.is_some() || self.pending_mutation.is_some() {
            self.needs_reload = true;
            return;
        }
        self.error.clear();
        self.pending_list = Some(api.list_system_broadcasts_task(session));
        self.needs_reload = false;
    }

    fn request_template_load(&mut self, session: &Session, api: &ApiClient) {
        if self.pending_template_load.is_some() || self.pending_template_save.is_some() {
            return;
        }
        self.template_loaded_for = Some(session.user.id.clone());
        self.template_error.clear();
        self.pending_template_load = Some(api.get_activation_email_template_task(session));
    }

    pub fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.broadcasts.clear();
            self.loaded_for = Some(session.user.id.clone());
            self.last_loaded = None;
            self.needs_reload = true;
            self.template_loaded_for = None;
            self.pending_template_load = None;
            self.pending_template_save = None;
            self.activation_template = default_activation_email_template();
            self.template_email_configured = false;
            self.error.clear();
            self.notice.clear();
            self.template_error.clear();
            self.template_notice.clear();
        }

        if self.template_loaded_for.as_deref() != Some(session.user.id.as_str())
            && self.pending_template_load.is_none()
            && self.pending_template_save.is_none()
        {
            self.request_template_load(session, api);
        }

        if self.needs_reload && self.pending_list.is_none() && self.pending_mutation.is_none() {
            self.request_reload(session, api);
        } else if self.pending_list.is_none()
            && self.pending_mutation.is_none()
            && self
                .last_loaded
                .is_none_or(|loaded| loaded.elapsed() >= Duration::from_secs(15))
        {
            self.request_reload(session, api);
        }

        if let Some(result) = self.pending_list.as_ref().and_then(ApiClient::poll) {
            self.pending_list = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.broadcasts = response.data;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }

        if let Some(result) = self
            .pending_template_load
            .as_ref()
            .and_then(ApiClient::poll)
        {
            self.pending_template_load = None;
            match result {
                Ok(response) => {
                    self.activation_template = response.template;
                    self.template_email_configured = response.email_configured;
                    self.template_error.clear();
                }
                Err(error) => self.template_error = error,
            }
        }

        if let Some(result) = self
            .pending_template_save
            .as_ref()
            .and_then(ApiClient::poll)
        {
            self.pending_template_save = None;
            match result {
                Ok(template) => {
                    self.activation_template = template;
                    self.template_notice =
                        "Đã lưu mẫu. Gửi email vẫn chưa được cấu hình.".to_owned();
                    self.template_error.clear();
                }
                Err(error) => self.template_error = error,
            }
        }

        let mutation_result = self
            .pending_mutation
            .as_ref()
            .and_then(|pending| ApiClient::poll(&pending.task));
        if let Some(result) = mutation_result {
            let pending = self.pending_mutation.take().expect("mutation exists");
            match (pending.action, result) {
                (PendingAction::Create, Ok(SystemBroadcastMutation::Saved(record))) => {
                    self.broadcasts.insert(0, record);
                    self.clear_form();
                    self.notice = "Đã lưu bản nháp thông báo.".to_owned();
                    self.error.clear();
                }
                (PendingAction::Update(id), Ok(SystemBroadcastMutation::Saved(record))) => {
                    if let Some(current) = self.broadcasts.iter_mut().find(|item| item.id == id) {
                        *current = record;
                    }
                    self.clear_form();
                    self.notice = "Đã cập nhật bản nháp thông báo.".to_owned();
                    self.error.clear();
                }
                (PendingAction::Delete(id), Ok(SystemBroadcastMutation::Deleted)) => {
                    self.broadcasts.retain(|item| item.id != id);
                    self.confirm_delete = None;
                    self.notice = "Đã xóa bản nháp thông báo.".to_owned();
                    self.error.clear();
                }
                (_, Ok(_)) => self.error = "Phản hồi API broadcast không hợp lệ.".to_owned(),
                (_, Err(error)) => self.error = error,
            }
            self.last_loaded = Some(Instant::now());
        }

        if self.pending_list.is_some()
            || self.pending_mutation.is_some()
            || self.pending_template_load.is_some()
            || self.pending_template_save.is_some()
        {
            ctx.request_repaint_after(Duration::from_millis(80));
        } else if let Some(last_loaded) = self.last_loaded {
            ctx.request_repaint_after(
                Duration::from_secs(15).saturating_sub(last_loaded.elapsed()),
            );
        }
    }

    fn clear_form(&mut self) {
        self.title.clear();
        self.content.clear();
        self.broadcast_type = "info".to_owned();
        self.target_audience = "Tất cả nhân sự".to_owned();
        self.channel_in_app = true;
        self.channel_email = false;
        self.channel_sms = false;
        self.editing_id = None;
    }

    fn load_for_edit(&mut self, record: &SystemBroadcast) {
        self.editing_id = Some(record.id.clone());
        self.title = record.title.clone();
        self.content = record.content.clone();
        self.broadcast_type = record.broadcast_type.clone();
        self.target_audience = record.target_audience.clone();
        self.channel_in_app = record.channels.iter().any(|channel| channel == "In-app");
        self.channel_email = record.channels.iter().any(|channel| channel == "Email");
        self.channel_sms = record.channels.iter().any(|channel| channel == "SMS");
        self.error.clear();
        self.notice.clear();
    }

    fn input(&self) -> Result<SystemBroadcastInput, String> {
        let title = self.title.trim();
        if title.is_empty() {
            return Err("Vui lòng nhập tiêu đề thông báo.".to_owned());
        }
        if self.target_audience.trim().is_empty() {
            return Err("Vui lòng nhập đối tượng nhận dự kiến.".to_owned());
        }
        let mut channels = Vec::new();
        if self.channel_in_app {
            channels.push("In-app".to_owned());
        }
        if self.channel_email {
            channels.push("Email".to_owned());
        }
        if self.channel_sms {
            channels.push("SMS".to_owned());
        }
        if channels.is_empty() {
            return Err("Chọn ít nhất một kênh dự kiến.".to_owned());
        }
        Ok(SystemBroadcastInput {
            title: title.to_owned(),
            content: self.content.clone(),
            broadcast_type: self.broadcast_type.clone(),
            target_audience: self.target_audience.trim().to_owned(),
            channels,
        })
    }

    pub fn render(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        let busy = self.pending_list.is_some() || self.pending_mutation.is_some();
        let template_busy =
            self.pending_template_load.is_some() || self.pending_template_save.is_some();
        let mut save = false;
        let mut save_template = false;
        let mut reload_template = false;
        let mut refresh = false;
        let mut action = None;
        let mut edit_id = None;
        let mut delete_id = None;

        ui.vertical(|ui| {
            ui.label(
                RichText::new("QUẢN TRỊ HỆ THỐNG")
                    .small()
                    .strong()
                    .color(Color32::from_rgb(0, 150, 136)),
            );
            ui.heading("Thông báo diện rộng");
            ui.label("Quản lý bản ghi thông báo dùng chung, lưu trong máy chủ.");
            ui.add_space(6.0);
            egui::Frame::group(ui.style())
                .fill(Color32::from_rgb(255, 251, 235))
                .show(ui, |ui| {
                    ui.colored_label(
                        Color32::from_rgb(146, 64, 14),
                        "Email, SMS và phát thông báo tới tài khoản nhân viên chưa được tích hợp. Lưu ở đây chỉ tạo bản nháp, không gửi đi.",
                    );
                });
            ui.add_space(8.0);

            egui::CollapsingHeader::new("Mẫu email kích hoạt tài khoản")
                .default_open(false)
                .show(ui, |ui| {
                    ui.label(if self.template_email_configured {
                        "Email đã được cấu hình."
                    } else {
                        "Email chưa được cấu hình; lưu mẫu không gửi email."
                    });
                    ui.label("Nội dung body được lưu và hiển thị như văn bản. Renderer hiện chưa hỗ trợ gửi HTML.");
                    ui.horizontal(|ui| {
                        reload_template = ui
                            .add_enabled(!template_busy, egui::Button::new("Tải lại mẫu"))
                            .clicked();
                        save_template = ui
                            .add_enabled(!template_busy, egui::Button::new("Lưu mẫu"))
                            .clicked();
                        if template_busy {
                            ui.spinner();
                        }
                    });
                    if !self.template_notice.is_empty() {
                        ui.colored_label(Color32::from_rgb(21, 128, 61), &self.template_notice);
                    }
                    if !self.template_error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.template_error);
                    }
                    egui::Grid::new("activation_email_template_fields")
                        .num_columns(2)
                        .show(ui, |ui| {
                            ui.label("Tiêu đề email");
                            ui.add_enabled(
                                !template_busy,
                                egui::TextEdit::singleline(&mut self.activation_template.subject),
                            );
                            ui.end_row();
                            ui.label("Tiêu đề trong thư");
                            ui.add_enabled(
                                !template_busy,
                                egui::TextEdit::singleline(&mut self.activation_template.heading),
                            );
                            ui.end_row();
                            ui.label("Nhãn nút");
                            ui.add_enabled(
                                !template_busy,
                                egui::TextEdit::singleline(&mut self.activation_template.button_label),
                            );
                            ui.end_row();
                            ui.label("Ghi chú cuối thư");
                            ui.add_enabled(
                                !template_busy,
                                egui::TextEdit::singleline(&mut self.activation_template.footer),
                            );
                            ui.end_row();
                        });
                    ui.label("Nội dung");
                    ui.add_enabled(
                        !template_busy,
                        egui::TextEdit::multiline(&mut self.activation_template.body)
                            .desired_rows(5)
                            .hint_text("Nội dung email kích hoạt"),
                    );
                    egui::Frame::group(ui.style()).show(ui, |ui| {
                        ui.label(RichText::new("Xem trước dạng văn bản").strong());
                        ui.label(RichText::new(&self.activation_template.subject).strong());
                        ui.label(RichText::new(&self.activation_template.heading).strong());
                        ui.label(&self.activation_template.body);
                        ui.label(format!("[{}]", self.activation_template.button_label));
                        ui.label(&self.activation_template.footer);
                    });
                });
            ui.add_space(8.0);

            ui.horizontal_wrapped(|ui| {
                ui.label("Tìm:");
                ui.add(
                    egui::TextEdit::singleline(&mut self.search)
                        .hint_text("Tiêu đề, nội dung hoặc đối tượng"),
                );
                refresh = ui.add_enabled(!busy, egui::Button::new("Làm mới")).clicked();
                ui.label(format!("{} bản ghi", self.broadcasts.len()));
            });
            if refresh {
                self.needs_reload = true;
            }

            egui::Frame::group(ui.style()).show(ui, |ui| {
                ui.heading(if self.editing_id.is_some() {
                    "Chỉnh sửa bản nháp"
                } else {
                    "Tạo bản nháp"
                });
                ui.label("Bản nháp giữ lại loại, đối tượng và kênh dự kiến; chưa kích hoạt gửi.");
                ui.add_space(4.0);
                ui.horizontal(|ui| {
                    ui.label("Tiêu đề");
                    ui.add(
                        egui::TextEdit::singleline(&mut self.title)
                            .desired_width(320.0)
                            .hint_text("Tiêu đề thông báo"),
                    );
                    ui.label("Loại");
                    for (value, label) in [
                        ("info", "Thông tin"),
                        ("warning", "Cảnh báo"),
                        ("urgent", "Khẩn cấp"),
                        ("cybersecurity", "An ninh mạng"),
                        ("maintenance", "Bảo trì"),
                        ("regulation", "Quy định"),
                        ("policy", "Chính sách"),
                        ("account_activation", "Kích hoạt tài khoản"),
                    ] {
                        ui.selectable_value(&mut self.broadcast_type, value.to_owned(), label);
                    }
                });
                ui.horizontal(|ui| {
                    ui.label("Đối tượng dự kiến");
                    ui.add(
                        egui::TextEdit::singleline(&mut self.target_audience)
                            .desired_width(360.0)
                            .hint_text("Tất cả nhân sự hoặc tên nhân sự/đơn vị"),
                    );
                });
                ui.horizontal(|ui| {
                    ui.label("Kênh dự kiến:");
                    ui.checkbox(&mut self.channel_in_app, "In-app");
                    ui.checkbox(&mut self.channel_email, "Email");
                    ui.checkbox(&mut self.channel_sms, "SMS");
                });
                ui.label("Nội dung");
                ui.add(
                    egui::TextEdit::multiline(&mut self.content)
                        .desired_rows(4)
                        .hint_text("Nội dung bản nháp"),
                );
                ui.horizontal(|ui| {
                    save = ui
                        .add_enabled(!busy, egui::Button::new("Lưu bản nháp"))
                        .clicked();
                    if self.editing_id.is_some()
                        && ui.add_enabled(!busy, egui::Button::new("Hủy chỉnh sửa")).clicked()
                    {
                        self.clear_form();
                    }
                });
            });

            if !self.notice.is_empty() {
                ui.colored_label(Color32::from_rgb(21, 128, 61), &self.notice);
            }
            if !self.error.is_empty() {
                ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
            }
            if self.pending_list.is_some() || self.pending_mutation.is_some() {
                ui.spinner();
            }

            let query = self.search.trim().to_lowercase();
            let mut matched = 0usize;
            egui::ScrollArea::vertical().show(ui, |ui| {
                for record in &self.broadcasts {
                    if !matches_search(record, &query) {
                        continue;
                    }
                    matched += 1;
                    egui::Frame::group(ui.style()).show(ui, |ui| {
                        ui.horizontal_wrapped(|ui| {
                            ui.vertical(|ui| {
                                ui.horizontal(|ui| {
                                    ui.label(RichText::new(&record.title).strong());
                                    ui.label(&record.status);
                                    ui.label(&record.created_at);
                                });
                                ui.label(format!(
                                    "Loại: {} · Đối tượng: {} · Kênh: {}",
                                    record.broadcast_type,
                                    record.target_audience,
                                    record.channels.join(", ")
                                ));
                                ui.label(&record.content);
                                ui.label(format!(
                                    "Người tạo: {} · Số liệu đang lưu (legacy có thể là ước tính): {}/{}",
                                    record.sender, record.read_count, record.total_recipients
                                ));
                            });
                            ui.with_layout(egui::Layout::right_to_left(egui::Align::TOP), |ui| {
                                if ui
                                    .add_enabled(!busy, egui::Button::new("Xóa"))
                                    .clicked()
                                {
                                    delete_id = Some(record.id.clone());
                                }
                                if ui
                                    .add_enabled(!busy, egui::Button::new("Sửa"))
                                    .clicked()
                                {
                                    edit_id = Some(record.id.clone());
                                }
                            });
                        });
                    });
                }
            });
            if matched == 0 && !self.broadcasts.is_empty() {
                ui.label("Không có bản ghi phù hợp với từ khóa tìm kiếm.");
            } else if self.broadcasts.is_empty() && self.pending_list.is_none() && self.error.is_empty() {
                ui.label("Chưa có bản ghi thông báo hệ thống.");
            }

            if let Some(id) = self.confirm_delete.clone() {
                egui::Frame::group(ui.style()).show(ui, |ui| {
                    ui.label("Xóa vĩnh viễn bản ghi này? Thao tác không thể hoàn tác.");
                    ui.horizontal(|ui| {
                        if ui.add_enabled(!busy, egui::Button::new("Xác nhận xóa")).clicked() {
                            action = Some(PendingAction::Delete(id.clone()));
                        }
                        if ui.add_enabled(!busy, egui::Button::new("Hủy")).clicked() {
                            self.confirm_delete = None;
                        }
                    });
                });
            }
        });

        if let Some(record) = edit_id.and_then(|id| {
            self.broadcasts
                .iter()
                .find(|record| record.id == id)
                .cloned()
        }) {
            self.load_for_edit(&record);
        }
        if let Some(id) = delete_id {
            self.confirm_delete = Some(id);
        }

        if reload_template {
            self.template_loaded_for = None;
            self.request_template_load(session, api);
        }
        if save_template {
            self.pending_template_save =
                Some(api.save_activation_email_template_task(session, &self.activation_template));
            self.template_error.clear();
            self.template_notice = "Đang lưu mẫu…".to_owned();
        }

        if save {
            match self.input() {
                Ok(input) => {
                    let (pending_action, task) = if let Some(id) = self.editing_id.clone() {
                        (
                            PendingAction::Update(id.clone()),
                            api.update_system_broadcast_task(session, &id, &input),
                        )
                    } else {
                        (
                            PendingAction::Create,
                            api.create_system_broadcast_task(session, &input),
                        )
                    };
                    self.pending_mutation = Some(PendingMutation {
                        action: pending_action,
                        task,
                    });
                    self.error.clear();
                    self.notice = "Đang lưu bản nháp…".to_owned();
                }
                Err(error) => self.error = error,
            }
        }

        if let Some(PendingAction::Delete(id)) = action {
            self.pending_mutation = Some(PendingMutation {
                task: api.delete_system_broadcast_task(session, &id),
                action: PendingAction::Delete(id),
            });
            self.error.clear();
            self.notice = "Đang xóa bản nháp…".to_owned();
        }
    }
}

fn matches_search(record: &SystemBroadcast, query: &str) -> bool {
    let query = query.trim().to_lowercase();
    query.is_empty()
        || record.title.to_lowercase().contains(&query)
        || record.content.to_lowercase().contains(&query)
        || record.target_audience.to_lowercase().contains(&query)
        || record.broadcast_type.to_lowercase().contains(&query)
        || record.sender.to_lowercase().contains(&query)
}

fn default_activation_email_template() -> ActivationEmailTemplate {
    ActivationEmailTemplate {
        subject: "Kích hoạt tài khoản KIYOVN Enterprise".to_owned(),
        heading: "Chào mừng bạn đến với KIYOVN".to_owned(),
        body: "Tài khoản công việc của bạn đã sẵn sàng. Vui lòng kích hoạt để đặt mật khẩu và hoàn tất hồ sơ.".to_owned(),
        button_label: "Kích hoạt tài khoản".to_owned(),
        footer: "Liên kết có hiệu lực trong 02 ngày. Nếu bạn yêu cầu gửi lại, chỉ liên kết mới nhất còn hiệu lực.".to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::matches_search;
    use crate::api::SystemBroadcast;

    fn sample() -> SystemBroadcast {
        SystemBroadcast {
            id: "SYS-1".to_owned(),
            title: "Bảo trì tối nay".to_owned(),
            content: "Nâng cấp hệ thống".to_owned(),
            broadcast_type: "maintenance".to_owned(),
            target_audience: "Tất cả nhân sự".to_owned(),
            sender: "Quản trị".to_owned(),
            created_at: "2026-10-08 09:00".to_owned(),
            scheduled_at: None,
            channels: vec!["In-app".to_owned()],
            read_count: 0,
            total_recipients: 0,
            status: "Nháp".to_owned(),
        }
    }

    #[test]
    fn broadcast_search_matches_audience_and_content_case_insensitively() {
        let record = sample();
        assert!(matches_search(&record, "NÂNG CẤP"));
        assert!(matches_search(&record, "nhân sự"));
        assert!(!matches_search(&record, "đã gửi"));
        assert!(matches_search(&record, ""));
    }
}
