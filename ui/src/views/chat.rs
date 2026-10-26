use std::collections::BTreeMap;
use std::time::Duration;
use web_time::Instant;

use crate::{
    api::{
        ApiClient, ApiTask, ChatChannel, ChatDirectoryUser, ChatMessage,
        ChatMessageMutationResponse, ChatMessagesResponse, ChatUsersResponse,
    },
    models::Session,
    widgets,
};
use egui::{Color32, RichText, Ui};

const MESSAGE_PAGE_SIZE: usize = 50;
const COMMON_REACTIONS: &[&str] = &["👍", "❤️", "😂"];

struct MessageLoad {
    channel_id: String,
    older: bool,
    task: ApiTask<ChatMessagesResponse>,
}

enum ChatMutation {
    Send {
        channel_id: String,
        text: String,
        task: ApiTask<ChatMessageMutationResponse>,
    },
    React {
        message_id: String,
        task: ApiTask<ChatMessageMutationResponse>,
    },
}

enum ChatUiAction {
    SelectChannel(String),
    Send,
    Reply(String),
    ClearReply,
    ToggleReaction(String, String),
    LoadOlder,
    OpenDmPicker,
    SearchUsers,
    CreateDm,
}

pub struct ChatView {
    channels: Vec<ChatChannel>,
    active_channel_id: Option<String>,
    messages: Vec<ChatMessage>,
    input_text: String,
    drafts: BTreeMap<String, String>,
    channel_search: String,
    company_scope: bool,
    sidebar_open: bool,
    last_company: Option<String>,
    last_dm: Option<String>,
    admin_search: String,
    admin_page: usize,
    admin_page_size: usize,
    channels_loaded: bool,
    reply_to_id: Option<String>,
    focus_composer_after_send: Option<String>,
    pending_channels: Option<ApiTask<crate::api::ChatChannelsResponse>>,
    pending_messages: Option<MessageLoad>,
    pending_users: Option<ApiTask<ChatUsersResponse>>,
    pending_dm: Option<ApiTask<crate::api::ChatDirectMessageResponse>>,
    pending_mutation: Option<ChatMutation>,
    pending_read: Option<ApiTask<crate::api::ChatSuccessResponse>>,
    users: Vec<ChatDirectoryUser>,
    selected_user_ids: Vec<String>,
    user_search: String,
    dm_picker_open: bool,
    loaded_for: Option<String>,
    loaded_messages_for: Option<String>,
    last_channels_load: Option<Instant>,
    last_messages_load: Option<Instant>,
    needs_channels: bool,
    needs_messages: bool,
    has_older_messages: bool,
    older_cursor: Option<String>,
    notice: String,
    error: String,
}

impl Default for ChatView {
    fn default() -> Self {
        Self {
            channels: Vec::new(),
            active_channel_id: None,
            messages: Vec::new(),
            input_text: String::new(),
            drafts: BTreeMap::new(),
            channel_search: String::new(),
            company_scope: false,
            sidebar_open: false,
            last_company: None,
            last_dm: None,
            admin_search: String::new(),
            admin_page: 0,
            admin_page_size: 10,
            channels_loaded: false,
            reply_to_id: None,
            focus_composer_after_send: None,
            pending_channels: None,
            pending_messages: None,
            pending_users: None,
            pending_dm: None,
            pending_mutation: None,
            pending_read: None,
            users: Vec::new(),
            selected_user_ids: Vec::new(),
            user_search: String::new(),
            dm_picker_open: false,
            loaded_for: None,
            loaded_messages_for: None,
            last_channels_load: None,
            last_messages_load: None,
            needs_channels: true,
            needs_messages: true,
            has_older_messages: false,
            older_cursor: None,
            notice: String::new(),
            error: String::new(),
        }
    }
}

impl ChatView {
    fn select_channel(&mut self, channel_id: String) {
        if self.active_channel_id.as_deref() == Some(channel_id.as_str()) {
            return;
        }
        if let Some(previous) = &self.active_channel_id {
            self.drafts
                .insert(previous.clone(), std::mem::take(&mut self.input_text));
        }
        self.input_text = self.drafts.remove(&channel_id).unwrap_or_default();
        self.focus_composer_after_send = None;
        if let Some(channel) = self
            .channels
            .iter()
            .find(|channel| channel.id == channel_id)
        {
            self.company_scope = !is_dm(channel);
            if self.company_scope {
                self.last_company = Some(channel_id.clone());
            } else {
                self.last_dm = Some(channel_id.clone());
            }
        }
        self.active_channel_id = Some(channel_id);
        self.messages.clear();
        self.loaded_messages_for = None;
        self.last_messages_load = None;
        self.needs_messages = true;
        self.has_older_messages = false;
        self.older_cursor = None;
        self.reply_to_id = None;
    }

    fn request_channels(&mut self, session: &Session, api: &ApiClient) {
        if self.pending_channels.is_none() {
            self.pending_channels = Some(api.list_chat_channels_task(session));
            self.needs_channels = false;
        }
    }

    fn request_messages(
        &mut self,
        session: &Session,
        api: &ApiClient,
        channel_id: &str,
        older: bool,
    ) {
        if self.pending_messages.is_some() {
            return;
        }
        let before = older.then_some(self.older_cursor.as_deref()).flatten();
        self.pending_messages = Some(MessageLoad {
            channel_id: channel_id.to_owned(),
            older,
            task: api.list_chat_messages_task(session, channel_id, before, MESSAGE_PAGE_SIZE),
        });
        self.needs_messages = false;
    }

    fn request_users(&mut self, session: &Session, api: &ApiClient) {
        self.pending_users = Some(api.list_chat_users_task(session, &self.user_search));
        self.error.clear();
    }

    fn start_mutation(&mut self, action: ChatUiAction, session: &Session, api: &ApiClient) {
        if self.pending_mutation.is_some() {
            return;
        }
        match action {
            ChatUiAction::Send => {
                let Some(channel_id) = self.active_channel_id.as_deref() else {
                    return;
                };
                if !self.active_channel().is_some_and(|channel| {
                    channel.kind != "VOICE" && (!channel.locked || session.user.role == "ADMIN")
                }) {
                    return;
                }
                let text = self.input_text.trim().to_owned();
                if text.is_empty() {
                    return;
                }
                let task = api.send_chat_message_task(
                    session,
                    channel_id,
                    &text,
                    self.reply_to_id.as_deref(),
                );
                self.pending_mutation = Some(ChatMutation::Send {
                    channel_id: channel_id.to_owned(),
                    text,
                    task,
                });
                self.focus_composer_after_send = Some(channel_id.to_owned());
                self.error.clear();
                self.notice = "Đang gửi tin nhắn…".to_owned();
            }
            ChatUiAction::ToggleReaction(message_id, emoji) => {
                let task = api.toggle_chat_reaction_task(session, &message_id, &emoji);
                self.pending_mutation = Some(ChatMutation::React { message_id, task });
                self.error.clear();
            }
            _ => {}
        }
    }

    fn poll(
        &mut self,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        conversation: bool,
    ) {
        let identity = format!("{}|{}", session.user.id, session.endpoint);
        if self.loaded_for.as_deref() != Some(identity.as_str()) {
            *self = Self {
                loaded_for: Some(identity),
                ..Self::default()
            };
        }

        if self.needs_channels
            || (self.pending_channels.is_none()
                && self
                    .last_channels_load
                    .is_none_or(|last| last.elapsed() >= Duration::from_secs(10)))
        {
            self.request_channels(session, api);
        }

        if let Some(result) = self.pending_channels.as_ref().and_then(ApiClient::poll) {
            self.pending_channels = None;
            self.last_channels_load = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.channels = response.data;
                    self.channels_loaded = true;
                    let active_exists = self
                        .active_channel_id
                        .as_ref()
                        .is_some_and(|id| self.channels.iter().any(|channel| &channel.id == id));
                    if !active_exists {
                        self.clear_selection();
                    }
                }
                Err(error) => self.error = error,
            }
        }

        let active_is_text = conversation
            && self
                .active_channel()
                .is_some_and(|channel| channel.kind != "VOICE");
        if active_is_text {
            let channel_id = self.active_channel_id.clone().unwrap_or_default();
            if self.needs_messages
                || (self.pending_messages.is_none()
                    && self
                        .last_messages_load
                        .is_none_or(|last| last.elapsed() >= Duration::from_secs(5)))
            {
                self.request_messages(session, api, &channel_id, false);
            }
            if self.loaded_messages_for.as_deref() != Some(channel_id.as_str())
                && self.pending_read.is_none()
            {
                self.pending_read = Some(api.mark_chat_read_task(session, &channel_id));
            }
        }

        let message_result = self.pending_messages.as_ref().and_then(|pending| {
            ApiClient::poll(&pending.task)
                .map(|result| (pending.channel_id.clone(), pending.older, result))
        });
        if let Some((channel_id, older, result)) = message_result {
            self.pending_messages = None;
            if self.active_channel_id.as_deref() == Some(channel_id.as_str()) {
                self.last_messages_load = Some(Instant::now());
                match result {
                    Ok(response) => {
                        if older || self.loaded_messages_for.as_deref() != Some(channel_id.as_str())
                        {
                            self.has_older_messages = response.pagination.has_more;
                            self.older_cursor = response.pagination.next_cursor;
                        }
                        if older {
                            let mut combined = response.data;
                            combined.append(&mut self.messages);
                            combined.dedup_by(|left, right| left.id == right.id);
                            self.messages = combined;
                        } else {
                            for message in response.data {
                                if let Some(existing) =
                                    self.messages.iter_mut().find(|item| item.id == message.id)
                                {
                                    *existing = message;
                                } else {
                                    self.messages.push(message);
                                }
                            }
                        }
                        self.loaded_messages_for = Some(channel_id.clone());
                        if let Some(channel) =
                            self.channels.iter_mut().find(|item| item.id == channel_id)
                        {
                            channel.unread_count = 0;
                        }
                    }
                    Err(error) => self.error = error,
                }
            }
        }

        if let Some(result) = self.pending_users.as_ref().and_then(ApiClient::poll) {
            self.pending_users = None;
            match result {
                Ok(response) => {
                    self.users = response.data;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }

        if let Some(result) = self.pending_dm.as_ref().and_then(ApiClient::poll) {
            self.pending_dm = None;
            match result {
                Ok(response) if response.success => {
                    if let Some(existing) = self
                        .channels
                        .iter_mut()
                        .find(|item| item.id == response.data.id)
                    {
                        *existing = response.data.clone();
                    } else {
                        self.channels.push(response.data.clone());
                    }
                    self.select_channel(response.data.id);
                    self.sidebar_open = false;
                    self.dm_picker_open = false;
                    self.selected_user_ids.clear();
                    self.notice = "Đã mở cuộc trò chuyện riêng.".to_owned();
                    self.error.clear();
                    ctx.request_repaint_after(Duration::from_millis(80));
                }
                Ok(_) => self.error = "Máy chủ chưa xác nhận mở cuộc trò chuyện.".to_owned(),
                Err(error) => self.error = error,
            }
        }

        let mutation_result = self
            .pending_mutation
            .as_ref()
            .and_then(|pending| match pending {
                ChatMutation::Send { task, .. } | ChatMutation::React { task, .. } => {
                    ApiClient::poll(task)
                }
            });
        if let Some(result) = mutation_result {
            let pending = self.pending_mutation.take().expect("chat mutation exists");
            match (pending, result) {
                (
                    ChatMutation::Send {
                        channel_id, text, ..
                    },
                    Ok(response),
                ) if response.success => {
                    if self.active_channel_id.as_deref() == Some(channel_id.as_str()) {
                        if self.input_text.trim() == text {
                            self.input_text.clear();
                        }
                        self.reply_to_id = None;
                    } else if self
                        .drafts
                        .get(&channel_id)
                        .is_some_and(|draft| draft.trim() == text)
                    {
                        self.drafts.remove(&channel_id);
                    }
                    if self.active_channel_id.as_deref() == Some(response.data.channel_id.as_str())
                        && !self
                            .messages
                            .iter()
                            .any(|message| message.id == response.data.id)
                    {
                        self.messages.push(response.data);
                    }
                    self.last_messages_load = Some(Instant::now());
                    self.notice = "Đã gửi tin nhắn.".to_owned();
                    self.error.clear();
                }
                (ChatMutation::React { message_id, .. }, Ok(response)) if response.success => {
                    if let Some(message) =
                        self.messages.iter_mut().find(|item| item.id == message_id)
                    {
                        *message = response.data;
                    }
                    self.error.clear();
                }
                (_, Ok(_)) => self.error = "Phản hồi chat từ máy chủ không hợp lệ.".to_owned(),
                (_, Err(error)) => {
                    self.error = error;
                    self.notice.clear();
                }
            }
        }

        if let Some(result) = self.pending_read.as_ref().and_then(ApiClient::poll) {
            self.pending_read = None;
            if let Err(error) = result {
                self.error = error;
            }
        }

        if self.pending_channels.is_some()
            || self.pending_messages.is_some()
            || self.pending_users.is_some()
            || self.pending_dm.is_some()
            || self.pending_mutation.is_some()
            || self.pending_read.is_some()
        {
            ctx.request_repaint_after(Duration::from_millis(80));
        } else {
            let channels_after = Duration::from_secs(10).saturating_sub(
                self.last_channels_load
                    .map_or(Duration::ZERO, |last| last.elapsed()),
            );
            let messages_after = if active_is_text {
                Duration::from_secs(5).saturating_sub(
                    self.last_messages_load
                        .map_or(Duration::ZERO, |last| last.elapsed()),
                )
            } else {
                Duration::from_secs(10)
            };
            ctx.request_repaint_after(channels_after.min(messages_after));
        }
    }

    fn active_channel(&self) -> Option<&ChatChannel> {
        self.channels
            .iter()
            .find(|channel| Some(channel.id.as_str()) == self.active_channel_id.as_deref())
    }

    fn render_admin(&mut self, ui: &mut Ui) {
        ui.spacing_mut().item_spacing.y = 0.0;
        ui.add_space(8.0);
        let count = self
            .channels
            .iter()
            .filter(|channel| channel.channel_type == "COMPANY")
            .count();
        let metrics_start = ui.cursor().top();
        widgets::metrics(
            ui,
            "chat-admin.metrics",
            &[
                widgets::Metric {
                    label: "Tổng số kênh giao tiếp trực tuyến",
                    value: if self.channels_loaded {
                        format!("{count} kênh chat")
                    } else {
                        "—".to_owned()
                    },
                    detail: "",
                    color: crate::theme::PRIMARY,
                    value_size: 22.0,
                },
                widgets::Metric {
                    label: "Kênh bảo mật mã hóa đầu cuối E2EE",
                    value: "Chưa có dữ liệu".to_owned(),
                    detail: "",
                    color: Color32::from_rgb(117, 117, 117),
                    value_size: 22.0,
                },
                widgets::Metric {
                    label: "Tuân thủ chính sách lưu trữ ISO 27001",
                    value: "Chưa có dữ liệu".to_owned(),
                    detail: "",
                    color: Color32::from_rgb(117, 117, 117),
                    value_size: 22.0,
                },
            ],
        );
        record_chat_rect(
            ui.ctx(),
            "chat-admin.metrics.bounds",
            egui::Rect::from_min_max(
                egui::pos2(ui.min_rect().left(), metrics_start),
                egui::pos2(ui.max_rect().right(), ui.cursor().top()),
            ),
        );
        ui.add_space(16.0);
        self.render_admin_toolbar(ui);
        ui.add_space(12.0);
        if !self.error.is_empty() {
            ui.colored_label(ui.visuals().error_fg_color, &self.error);
            ui.add_space(8.0);
        }
        if self.pending_channels.is_some() {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải kênh…");
            });
            ui.add_space(8.0);
        }

        let filtered = self
            .channels
            .iter()
            .filter(|channel| admin_channel_matches(channel, &self.admin_search))
            .collect::<Vec<_>>();
        let size = self.admin_page_size.max(1);
        self.admin_page = self
            .admin_page
            .min(filtered.len().div_ceil(size).max(1) - 1);
        let shown = filtered
            .iter()
            .skip(self.admin_page * size)
            .take(size)
            .collect::<Vec<_>>();
        // The legacy columns have automatic widths; these tracks match the 1196px reference table.
        let scale = (ui.available_width() - 2.0).max(1194.0) / 1194.0;
        let columns = [
            ("Mã kênh", 119.0),
            ("Tên kênh & Phân loại", 235.0),
            ("Thành viên", 142.0),
            ("Chuẩn bảo mật mã hóa", 257.0),
            ("Lưu trữ tin nhắn", 190.0),
            ("Trạng thái", 132.0),
            ("Thao tác", 119.0),
        ]
        .map(|(title, width)| widgets::TableColumn {
            title,
            width: width * scale,
        });
        let table_top = ui.cursor().top();
        widgets::table_with_row_height(
            ui,
            "chat-admin.table",
            &columns,
            shown.len(),
            60.0,
            |ui, row, col| {
                let channel = shown[row];
                match col {
                    0 => {
                        ui.add(
                            egui::Label::new(
                                RichText::new(&channel.id)
                                    .strong()
                                    .color(crate::theme::PRIMARY),
                            )
                            .truncate(),
                        )
                        .on_hover_text(format!(
                            "ID máy chủ: {}. API chưa cung cấp mã kênh quản trị riêng.",
                            channel.id
                        ));
                    }
                    1 => {
                        ui.add(
                            egui::Label::new(
                                RichText::new(&channel.name)
                                    .size(13.5)
                                    .strong()
                                    .color(Color32::from_rgb(33, 33, 33)),
                            )
                            .truncate(),
                        )
                        .on_hover_text(format!(
                            "{}\nLoại kênh: {}\nPhạm vi: {}\nGửi tin: {}",
                            channel.name,
                            channel.kind,
                            channel.visibility,
                            if channel.locked {
                                "Chỉ quản trị viên"
                            } else {
                                "Thành viên kênh"
                            }
                        ));
                        let category = if channel.category.trim().is_empty() {
                            "Chưa phân loại"
                        } else {
                            &channel.category
                        };
                        let metadata = format!("{category} · Quản trị: Chưa có dữ liệu");
                        ui.add(
                            egui::Label::new(
                                RichText::new(&metadata)
                                    .size(11.5)
                                    .color(Color32::from_rgb(21, 101, 192)),
                            )
                            .truncate(),
                        )
                        .on_hover_text(metadata);
                    }
                    2..=4 => {
                        ui.label(
                            RichText::new("Chưa có dữ liệu")
                                .size(12.0)
                                .color(Color32::from_rgb(117, 117, 117)),
                        );
                    }
                    5 => {
                        let (label, tone) = match channel.status.as_str() {
                            "ACTIVE" => ("Đang hoạt động", widgets::TagTone::Success),
                            "ARCHIVED" => ("Đã lưu trữ", widgets::TagTone::Neutral),
                            "" => ("Chưa có dữ liệu", widgets::TagTone::Neutral),
                            value => (value, widgets::TagTone::Neutral),
                        };
                        widgets::tag(ui, label, tone);
                    }
                    _ => {
                        ui.add_enabled(
                            false,
                            egui::Button::new(if channel.status == "ACTIVE" {
                                "Khóa kênh"
                            } else {
                                "Mở lại"
                            })
                            .small(),
                        )
                        .on_disabled_hover_text(
                            "API chưa hỗ trợ khóa/mở kênh. Hạn chế gửi tin là thuộc tính riêng.",
                        );
                    }
                }
            },
        );
        record_chat_rect(
            ui.ctx(),
            "chat-admin.table.viewport",
            egui::Rect::from_min_max(
                egui::pos2(ui.min_rect().left(), table_top),
                egui::pos2(
                    ui.max_rect().right(),
                    table_top
                        + 38.5
                        + if shown.is_empty() {
                            157.0
                        } else {
                            shown.len() as f32 * 60.0
                        },
                ),
            ),
        );
        #[cfg(test)]
        ui.ctx().data_mut(|data| {
            data.insert_temp(
                egui::Id::new("test.chat-admin.shown"),
                shown
                    .iter()
                    .map(|channel| channel.id.clone())
                    .collect::<Vec<_>>(),
            )
        });
        ui.add_space(10.0);
        let total = if self.channels_loaded {
            format!("Tổng số {} kênh giao tiếp nội bộ", filtered.len())
        } else {
            "Chưa tải được danh sách kênh giao tiếp nội bộ".to_owned()
        };
        // A stacked footer keeps the real controls usable below the legacy desktop width.
        let stacked = ui.available_width() < 510.0;
        if stacked {
            ui.label(
                RichText::new(&total)
                    .size(13.0)
                    .color(Color32::from_rgb(117, 117, 117)),
            );
            ui.add_space(8.0);
        }
        let footer_top = ui.cursor().top();
        if !stacked {
            let total_rect = egui::Rect::from_min_size(
                ui.cursor().min,
                egui::vec2((ui.available_width() - 208.0).max(1.0), 24.0),
            );
            let mut child = ui.new_child(
                egui::UiBuilder::new()
                    .id_salt("chat-admin.total")
                    .max_rect(total_rect),
            );
            child.add(
                egui::Label::new(
                    RichText::new(&total)
                        .size(13.0)
                        .color(Color32::from_rgb(117, 117, 117)),
                )
                .truncate(),
            );
        }
        self.admin_page_size = size;
        widgets::pagination(
            ui,
            "chat-admin.pagination",
            &mut self.admin_page,
            filtered.len(),
            &mut self.admin_page_size,
        );
        record_chat_rect(
            ui.ctx(),
            "chat-admin.footer",
            egui::Rect::from_min_max(
                egui::pos2(ui.min_rect().left(), footer_top),
                egui::pos2(ui.max_rect().right(), ui.cursor().top()),
            ),
        );
        ui.add_space(12.0);
        ui.horizontal_wrapped(|ui| {
            if ui.add_enabled(self.pending_channels.is_none(), egui::Button::new("Làm mới").small()).clicked() {
                self.needs_channels = true;
                self.error.clear();
            }
            ui.add(egui::Label::new(RichText::new("Danh sách theo quyền truy cập; API chưa cung cấp thành viên, E2EE, ISO 27001, quản trị viên hoặc thời hạn lưu trữ.").size(11.0).color(Color32::from_rgb(117, 117, 117))).wrap());
        });
    }

    fn render_admin_toolbar(&mut self, ui: &mut Ui) {
        let width = ui.available_width();
        let action_width = 360.0;
        let one_row = width >= 736.0;
        let actions_one_row = width >= action_width;
        let height = if one_row {
            32.0
        } else if actions_one_row {
            72.0
        } else {
            112.0
        };
        let (bar, _) = ui.allocate_exact_size(egui::vec2(width, height), egui::Sense::hover());
        let search = egui::Rect::from_min_size(bar.min, egui::vec2(width.min(360.0), 32.0));
        if widgets::search_input(
            ui,
            search,
            &mut self.admin_search,
            "Tìm theo mã kênh, tên kênh, người quản trị...",
        )
        .changed()
        {
            self.admin_page = 0;
        }
        let actions = if one_row {
            egui::pos2(bar.right() - action_width, bar.top())
        } else {
            bar.min + egui::vec2(0.0, 40.0)
        };
        let export = egui::Rect::from_min_size(actions, egui::vec2(156.0_f32.min(width), 32.0));
        let create = egui::Rect::from_min_size(
            actions
                + if actions_one_row {
                    egui::vec2(164.0, 0.0)
                } else {
                    egui::vec2(0.0, 40.0)
                },
            egui::vec2(196.0_f32.min(width), 32.0),
        );
        ui.add_enabled_ui(false, |ui| {
            widgets::put(
                ui,
                export,
                egui::Button::image_and_text(
                    egui::Image::from_bytes(
                        "bytes://chat-admin-export.svg",
                        include_bytes!("../../assets/nav-icons/DownloadOutlined.svg"),
                    )
                    .fit_to_exact_size(egui::Vec2::splat(14.0)),
                    "Xuất Danh Sách",
                ),
            )
            .on_disabled_hover_text("Chưa có dịch vụ xuất danh sách kênh.");
            widgets::put(
                ui,
                create,
                egui::Button::image_and_text(
                    egui::Image::from_bytes(
                        "bytes://chat-admin-create.svg",
                        include_bytes!("../../assets/nav-icons/PlusOutlined.svg"),
                    )
                    .fit_to_exact_size(egui::Vec2::splat(14.0)),
                    RichText::new("Tạo kênh giao tiếp mới").color(Color32::WHITE),
                )
                .fill(crate::theme::PRIMARY),
            )
            .on_disabled_hover_text("API chưa hỗ trợ tạo kênh công ty.");
        });
        for (name, rect) in [
            ("toolbar", bar),
            ("search", search),
            ("export", export),
            ("create", create),
        ] {
            record_chat_rect(ui.ctx(), &format!("chat-admin.{name}"), rect);
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.render_route(ui, ctx, session, api, "/admin/chat");
    }

    pub fn render_route(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        path: &str,
    ) {
        let admin = path.trim_end_matches('/') == "/admin/chat/admin";
        if admin && session.user.role != "ADMIN" {
            ui.heading("Quản trị chat");
            ui.label("Bạn không có quyền truy cập trang quản trị chat.");
            return;
        }
        self.poll(ctx, session, api, !admin);
        if admin {
            self.render_admin(ui);
            return;
        }
        self.render_surface(ui, session, api);
        self.render_dm_picker(ctx, session, api);
    }

    /// Call before the application's headers and panels. True requests a return to the app.
    pub fn render_fullscreen(
        &mut self,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
    ) -> bool {
        self.poll(ctx, session, api, true);
        let mut exit = false;
        egui::CentralPanel::default()
            .frame(egui::Frame::none().fill(CHAT_BG))
            .show(ctx, |ui| {
                exit = self.render_surface(ui, session, api);
            });
        self.render_dm_picker(ctx, session, api);
        exit
    }

    fn clear_selection(&mut self) {
        self.focus_composer_after_send = None;
        if let Some(previous) = self.active_channel_id.take() {
            self.drafts
                .insert(previous, std::mem::take(&mut self.input_text));
        }
        self.messages.clear();
        self.loaded_messages_for = None;
        self.last_messages_load = None;
        self.reply_to_id = None;
        self.has_older_messages = false;
        self.older_cursor = None;
        self.needs_messages = true;
    }

    fn switch_scope(&mut self, company: bool) {
        if self.company_scope == company {
            return;
        }
        let next = if company {
            self.last_company.clone()
        } else {
            self.last_dm.clone()
        };
        self.clear_selection();
        self.company_scope = company;
        self.channel_search.clear();
        if let Some(id) = next.filter(|id| {
            self.channels
                .iter()
                .any(|channel| &channel.id == id && is_dm(channel) != company)
        }) {
            self.select_channel(id);
        }
    }

    fn render_surface(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) -> bool {
        let ctx = ui.ctx().clone();
        let available = ui.available_rect_before_wrap().intersect(ui.clip_rect());
        let (bounds, _) = ui.allocate_exact_size(
            available.size().max(egui::Vec2::splat(1.0)),
            egui::Sense::hover(),
        );
        let compact = bounds.width() < 1024.0;
        let show_nav = !compact || self.sidebar_open;
        let rail = egui::Rect::from_min_size(
            bounds.min,
            egui::vec2(72.0_f32.min(bounds.width()), bounds.height()),
        );
        let sidebar = egui::Rect::from_min_max(
            rail.right_top(),
            egui::pos2((rail.right() + 240.0).min(bounds.right()), bounds.bottom()),
        );
        let main = if compact {
            bounds
        } else {
            egui::Rect::from_min_max(sidebar.right_top(), bounds.right_bottom())
        };
        ui.painter().rect_filled(bounds, 0.0, CHAT_BG);
        let mut action = None;
        let mut exit = false;
        let mut scope = None;
        let mut main_ui = pane(ui, "chat.main", main, CHAT_BG);
        main_ui.add_enabled_ui(
            !(compact && self.sidebar_open) && !self.dm_picker_open,
            |ui| {
                self.render_conversation(ui, main, compact, session, &mut action);
            },
        );
        if compact && show_nav {
            ui.painter()
                .rect_filled(bounds, 0.0, Color32::from_black_alpha(150));
            let outside = egui::Rect::from_min_max(sidebar.right_top(), bounds.right_bottom());
            if ui
                .interact(
                    outside,
                    ui.id().with("chat.nav.dismiss"),
                    egui::Sense::click_and_drag(),
                )
                .clicked()
            {
                self.sidebar_open = false;
            }
        }
        if show_nav {
            let mut rail_ui = pane(ui, "chat.rail", rail, CHAT_RAIL);
            rail_ui.add_enabled_ui(!self.dm_picker_open, |ui| {
                let home = egui::Rect::from_min_size(
                    rail.min + egui::vec2(12.0, 12.0),
                    egui::Vec2::splat(48.0),
                );
                if rail_button(
                    ui,
                    home,
                    RailIcon::Direct,
                    !self.company_scope,
                    "Tin nhắn trực tiếp",
                )
                .clicked()
                {
                    scope = Some(false);
                }
                ui.painter().line_segment(
                    [
                        rail.min + egui::vec2(20.0, 70.0),
                        rail.min + egui::vec2(52.0, 70.0),
                    ],
                    egui::Stroke::new(2.0, Color32::from_rgb(53, 55, 60)),
                );
                let company = home.translate(egui::vec2(0.0, 68.0));
                if rail_button(
                    ui,
                    company,
                    RailIcon::Company,
                    self.company_scope,
                    "Kênh công ty",
                )
                .clicked()
                {
                    scope = Some(true);
                }
                let back = egui::Rect::from_min_size(
                    egui::pos2(rail.left() + 12.0, rail.bottom() - 60.0),
                    egui::Vec2::splat(48.0),
                );
                exit = rail_button(ui, back, RailIcon::Back, false, "Quay lại ứng dụng").clicked();
                record_chat_rect(&ctx, "chat.back", back);
                record_chat_rect(&ctx, "chat.scope.direct", home);
                record_chat_rect(&ctx, "chat.scope.company", company);
            });
            let mut sidebar_ui = pane(ui, "chat.channels", sidebar, CHAT_CHANNELS);
            sidebar_ui.add_enabled_ui(!self.dm_picker_open, |ui| {
                self.render_channel_pane(ui, sidebar, compact, session, &mut action);
            });
            if compact {
                let close = egui::Rect::from_min_size(
                    egui::pos2(sidebar.right() - 34.0, sidebar.top() + 10.0),
                    egui::vec2(28.0, 28.0),
                );
                if !self.dm_picker_open
                    && widgets::put(&mut sidebar_ui, close, egui::Button::new("×").frame(false))
                        .on_hover_text("Đóng danh sách")
                        .clicked()
                {
                    self.sidebar_open = false;
                }
            }
            record_chat_rect(&ctx, "chat.rail", rail);
            record_chat_rect(&ctx, "chat.channels", sidebar);
        }
        record_chat_rect(&ctx, "chat.main", main);
        record_chat_rect(&ctx, "chat.fullscreen", bounds);
        if let Some(company) = scope {
            self.switch_scope(company);
        }
        if let Some(action) = action {
            self.handle_action(&ctx, action, session, api);
        }
        exit
    }

    fn render_channel_pane(
        &mut self,
        ui: &mut Ui,
        bounds: egui::Rect,
        compact: bool,
        session: &Session,
        action: &mut Option<ChatUiAction>,
    ) {
        let search = egui::Rect::from_min_size(
            bounds.min + egui::vec2(16.0, 10.0),
            egui::vec2(
                (bounds.width() - 32.0 - if compact { 30.0 } else { 0.0 }).max(1.0),
                28.0,
            ),
        );
        widgets::put(
            ui,
            search,
            egui::TextEdit::singleline(&mut self.channel_search)
                .hint_text("Tìm cuộc hội thoại")
                .font(egui::FontId::proportional(12.0)),
        );
        ui.painter().line_segment(
            [
                bounds.min + egui::vec2(0.0, 48.0),
                bounds.min + egui::vec2(bounds.width(), 48.0),
            ],
            egui::Stroke::new(1.0, CHAT_BORDER),
        );
        let list = egui::Rect::from_min_max(
            bounds.min + egui::vec2(8.0, 56.0),
            bounds.right_bottom() - egui::vec2(8.0, 68.0),
        );
        let mut child = pane(ui, "chat.channel.list", list, CHAT_CHANNELS);
        child.horizontal(|ui| {
            ui.add(
                egui::Label::new(
                    RichText::new(if self.company_scope {
                        "KÊNH CÔNG TY"
                    } else {
                        "TIN NHẮN TRỰC TIẾP"
                    })
                    .size(11.0)
                    .strong()
                    .color(CHAT_MUTED),
                )
                .truncate(),
            );
            if !self.company_scope
                && ui
                    .small_button("+")
                    .on_hover_text("Tin nhắn riêng mới")
                    .clicked()
            {
                *action = Some(ChatUiAction::OpenDmPicker);
            }
        });
        egui::ScrollArea::vertical()
            .id_salt("chat.channel.scroll")
            .auto_shrink([false, false])
            .max_height(child.available_height().max(1.0))
            .show(&mut child, |ui| {
                let search = self.channel_search.trim().to_lowercase();
                let mut visible = 0;
                for channel in &self.channels {
                    if is_dm(channel) == self.company_scope
                        || !channel.name.to_lowercase().contains(&search)
                    {
                        continue;
                    }
                    visible += 1;
                    let prefix = if is_dm(channel) {
                        "@"
                    } else if channel.kind == "VOICE" {
                        "◖"
                    } else if channel.kind == "ANNOUNCEMENT" {
                        "!"
                    } else {
                        "#"
                    };
                    let label = format!(
                        "{prefix} {}{}",
                        channel.name,
                        if channel.unread_count > 0 {
                            format!(" ({})", channel.unread_count)
                        } else {
                            String::new()
                        }
                    );
                    let response = ui.add_sized(
                        egui::vec2(ui.available_width(), 36.0),
                        egui::Button::new(label)
                            .selected(
                                self.active_channel_id.as_deref() == Some(channel.id.as_str()),
                            )
                            .frame(false)
                            .truncate(),
                    );
                    record_chat_rect(
                        ui.ctx(),
                        &format!("chat.channel.{}", channel.id),
                        response.rect,
                    );
                    if response.on_hover_text(&channel.name).clicked() {
                        *action = Some(ChatUiAction::SelectChannel(channel.id.clone()));
                    }
                }
                if self.pending_channels.is_some() {
                    ui.spinner();
                }
                if visible == 0
                    && self.pending_channels.is_none()
                    && (!search.is_empty() || self.company_scope)
                {
                    ui.label(
                        RichText::new("Không có cuộc hội thoại phù hợp.")
                            .small()
                            .color(CHAT_MUTED),
                    );
                }
            });
        let user = egui::Rect::from_min_max(
            egui::pos2(bounds.left() + 8.0, bounds.bottom() - 60.0),
            bounds.right_bottom() - egui::vec2(8.0, 8.0),
        );
        ui.painter()
            .rect_filled(user, 8.0, Color32::from_rgb(35, 36, 40));
        let avatar = egui::pos2(user.left() + 22.0, user.center().y);
        ui.painter().circle_filled(avatar, 16.0, CHAT_PRIMARY);
        ui.painter().text(
            avatar,
            egui::Align2::CENTER_CENTER,
            session.user.name.chars().next().unwrap_or('?'),
            egui::FontId::proportional(13.0),
            Color32::WHITE,
        );
        let identity = egui::Rect::from_min_max(
            egui::pos2(user.left() + 46.0, user.top() + 5.0),
            user.right_bottom() - egui::vec2(8.0, 5.0),
        );
        let mut child = pane(ui, "chat.self", identity, Color32::TRANSPARENT);
        child
            .add(egui::Label::new(RichText::new(&session.user.name).strong().size(13.0)).truncate())
            .on_hover_text(&session.user.name);
        child
            .add(
                egui::Label::new(
                    RichText::new(&session.user.email)
                        .size(11.0)
                        .color(CHAT_MUTED),
                )
                .truncate(),
            )
            .on_hover_text(&session.user.email);
    }

    fn render_conversation(
        &mut self,
        ui: &mut Ui,
        bounds: egui::Rect,
        compact: bool,
        session: &Session,
        action: &mut Option<ChatUiAction>,
    ) {
        let channel = self.active_channel().cloned();
        let header = egui::Rect::from_min_size(bounds.min, egui::vec2(bounds.width(), 54.0));
        if compact {
            let menu = egui::Rect::from_min_size(
                bounds.min + egui::vec2(8.0, 10.0),
                egui::vec2(32.0, 32.0),
            );
            if widgets::put(ui, menu, egui::Button::new("☰").frame(false))
                .on_hover_text("Mở danh sách hội thoại")
                .clicked()
            {
                self.sidebar_open = true;
            }
            record_chat_rect(ui.ctx(), "chat.menu", menu);
        }
        let mut y = header.bottom();
        if let Some(channel) = &channel {
            ui.painter().line_segment(
                [header.left_bottom(), header.right_bottom()],
                egui::Stroke::new(1.0, CHAT_BORDER),
            );
            let title = egui::Rect::from_min_max(
                header.min + egui::vec2(if compact { 50.0 } else { 16.0 }, 7.0),
                header.right_bottom() - egui::vec2(60.0, 4.0),
            );
            let mut child = pane(ui, "chat.title", title, CHAT_BG);
            child
                .add(
                    egui::Label::new(
                        RichText::new(format!(
                            "{} {}",
                            if is_dm(channel) { "@" } else { "#" },
                            channel.name
                        ))
                        .strong()
                        .size(15.0),
                    )
                    .truncate(),
                )
                .on_hover_text(&channel.name);
            child
                .add(
                    egui::Label::new(RichText::new(&channel.topic).size(11.0).color(CHAT_MUTED))
                        .truncate(),
                )
                .on_hover_text(&channel.topic);
            let reload = egui::Rect::from_min_size(
                egui::pos2(bounds.right() - 48.0, bounds.top() + 10.0),
                egui::vec2(32.0, 32.0),
            );
            if widgets::put(ui, reload, egui::Button::new("↻").frame(false))
                .on_hover_text("Làm mới")
                .clicked()
            {
                self.needs_channels = true;
                self.needs_messages = true;
                self.error.clear();
            }
        }
        for (text, color) in [
            (&self.error, Color32::from_rgb(255, 128, 128)),
            (&self.notice, CHAT_MUTED),
        ] {
            if !text.is_empty() {
                let rect = egui::Rect::from_min_size(
                    egui::pos2(bounds.left() + 12.0, y),
                    egui::vec2((bounds.width() - 24.0).max(1.0), 24.0),
                );
                let mut child = pane(ui, "chat.feedback", rect, CHAT_BG);
                child
                    .add(egui::Label::new(RichText::new(text).small().color(color)).truncate())
                    .on_hover_text(text);
                y += 24.0;
            }
        }
        let Some(channel) = channel else {
            let center = bounds.center();
            let icon = egui::Rect::from_center_size(
                center - egui::vec2(0.0, 52.0),
                egui::Vec2::splat(96.0),
            );
            ui.painter().rect_filled(icon, 12.0, CHAT_CHANNELS);
            bubble(ui.painter(), icon.shrink(27.0), CHAT_MUTED);
            let text_width = (bounds.width() - 40.0).min(320.0).max(1.0);
            let text = egui::Rect::from_min_max(
                egui::pos2(center.x - text_width / 2.0, center.y + 20.0),
                egui::pos2(center.x + text_width / 2.0, bounds.bottom() - 20.0),
            );
            let mut child = pane(ui, "chat.empty", text, CHAT_BG);
            child.vertical_centered(|ui| {
                ui.add(egui::Label::new(RichText::new("Chưa chọn kênh hội thoại").size(24.0).strong()).wrap());
                ui.add(egui::Label::new(RichText::new("Hãy chọn một kênh từ máy chủ hoặc tin nhắn trực tiếp ở danh sách bên trái để bắt đầu trò chuyện.").color(CHAT_MUTED).size(13.0)).wrap());
            });
            return;
        };
        if channel.kind == "VOICE" {
            let content = egui::Rect::from_min_max(
                egui::pos2(bounds.left() + 16.0, y + 16.0),
                bounds.right_bottom() - egui::vec2(16.0, 16.0),
            );
            let mut child = pane(ui, "chat.voice", content, CHAT_BG);
            child.label("Chưa có dịch vụ gọi thoại cho kênh này.");
            child.add_enabled(false, egui::Button::new("Tham gia cuộc gọi"));
            return;
        }
        let can_send = !channel.locked || session.user.role == "ADMIN";
        let composer_height = if self.reply_to_id.is_some() {
            146.0
        } else {
            110.0
        };
        let composer = egui::Rect::from_min_max(
            egui::pos2(
                bounds.left() + 12.0,
                (bounds.bottom() - composer_height).max(y + 8.0),
            ),
            bounds.right_bottom() - egui::vec2(12.0, 8.0),
        );
        if self.has_older_messages {
            let older = egui::Rect::from_min_size(
                egui::pos2(bounds.left() + 16.0, y),
                egui::vec2((bounds.width() - 32.0).max(1.0), 28.0),
            );
            ui.add_enabled_ui(self.pending_messages.is_none(), |ui| {
                if widgets::put(
                    ui,
                    older,
                    egui::Button::new("Tải tin nhắn cũ hơn").frame(false),
                )
                .clicked()
                {
                    *action = Some(ChatUiAction::LoadOlder);
                }
            });
            y += 32.0;
        }
        let history = egui::Rect::from_min_max(
            egui::pos2(bounds.left() + 8.0, y),
            egui::pos2(bounds.right() - 8.0, composer.top() - 8.0),
        );
        let mut child = pane(ui, "chat.history", history, CHAT_BG);
        egui::ScrollArea::vertical()
            .id_salt(("chat-messages", &channel.id))
            .auto_shrink([false, false])
            .max_height(history.height().max(1.0))
            .stick_to_bottom(true)
            .show(&mut child, |ui| {
                if self.pending_messages.is_some() && self.messages.is_empty() {
                    ui.spinner();
                    ui.label("Đang tải tin nhắn…");
                } else if self.messages.is_empty() {
                    ui.label("Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện.");
                }
                for message in &self.messages {
                    self.render_message(ui, message, session, can_send, action);
                }
            });
        record_chat_rect(ui.ctx(), "chat.history", history);
        let mut child = pane(ui, "chat.composer.pane", composer, CHAT_BG);
        self.render_composer(&mut child, &channel, can_send, action);
    }

    fn render_message(
        &self,
        ui: &mut Ui,
        message: &ChatMessage,
        session: &Session,
        can_send: bool,
        action: &mut Option<ChatUiAction>,
    ) {
        egui::Frame::none()
            .inner_margin(8.0)
            .fill(if message.user_id == session.user.id {
                Color32::from_rgb(46, 48, 53)
            } else {
                Color32::TRANSPARENT
            })
            .rounding(6.0)
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.horizontal_wrapped(|ui| {
                    let sender = if message.user_id == session.user.id {
                        "Bạn"
                    } else {
                        message.user.profile.full_name.as_str()
                    };
                    ui.label(
                        RichText::new(sender)
                            .strong()
                            .color(Color32::from_rgb(180, 188, 255)),
                    );
                    ui.label(
                        RichText::new(format_chat_time(&message.created_at))
                            .small()
                            .color(CHAT_MUTED),
                    );
                    if message.edited_at.is_some() {
                        ui.label(RichText::new("đã chỉnh sửa").small().color(CHAT_MUTED));
                    }
                });
                if let Some(reply_id) = &message.reply_to_id {
                    let excerpt = self
                        .messages
                        .iter()
                        .find(|item| &item.id == reply_id)
                        .map(|item| {
                            if item.recalled_at.is_some() {
                                "Tin nhắn đã được thu hồi"
                            } else {
                                item.content.as_str()
                            }
                        })
                        .unwrap_or("Tin nhắn gốc không nằm trong trang đang tải");
                    ui.add(
                        egui::Label::new(
                            RichText::new(format!("↳ {excerpt}"))
                                .small()
                                .color(CHAT_MUTED),
                        )
                        .truncate(),
                    );
                }
                ui.add(
                    egui::Label::new(if message.recalled_at.is_some() {
                        "Tin nhắn đã được thu hồi"
                    } else {
                        &message.content
                    })
                    .wrap(),
                );
                if !message.attachments.is_empty() {
                    ui.label(
                        RichText::new(
                            "Tin nhắn có tệp đính kèm chưa được hỗ trợ trong client Rust.",
                        )
                        .small()
                        .color(CHAT_MUTED),
                    );
                }
                ui.horizontal_wrapped(|ui| {
                    for emoji in COMMON_REACTIONS {
                        let count = message
                            .reactions
                            .iter()
                            .filter(|reaction| reaction.emoji == *emoji)
                            .count();
                        let mine = message.reactions.iter().any(|reaction| {
                            reaction.emoji == *emoji && reaction.user_id == session.user.id
                        });
                        let label = if count > 0 {
                            format!("{emoji} {count}")
                        } else {
                            (*emoji).to_owned()
                        };
                        if ui
                            .add_enabled(
                                message.recalled_at.is_none() && self.pending_mutation.is_none(),
                                egui::Button::new(label).selected(mine),
                            )
                            .on_hover_text(format!("Phản ứng {emoji}"))
                            .clicked()
                        {
                            *action = Some(ChatUiAction::ToggleReaction(
                                message.id.clone(),
                                (*emoji).to_owned(),
                            ));
                        }
                    }
                    let reply = ui.add_enabled(
                        can_send && message.recalled_at.is_none(),
                        egui::Button::new("Trả lời").small(),
                    );
                    record_chat_rect(ui.ctx(), &format!("chat.reply.{}", message.id), reply.rect);
                    if reply.clicked() {
                        *action = Some(ChatUiAction::Reply(message.id.clone()));
                    }
                });
            });
        ui.add_space(4.0);
    }

    fn render_composer(
        &mut self,
        ui: &mut Ui,
        channel: &ChatChannel,
        can_send: bool,
        action: &mut Option<ChatUiAction>,
    ) {
        let mobile = ui.ctx().screen_rect().width() < 1024.0;
        if let Some(reply_id) = &self.reply_to_id {
            let summary = self
                .messages
                .iter()
                .find(|message| &message.id == reply_id)
                .map(|message| message.content.as_str())
                .unwrap_or("tin nhắn");
            ui.horizontal(|ui| {
                if ui.small_button("×").on_hover_text("Bỏ trả lời").clicked() {
                    *action = Some(ChatUiAction::ClearReply);
                }
                ui.add(
                    egui::Label::new(RichText::new(format!("Đang trả lời: {summary}")).small())
                        .truncate(),
                );
            });
        }
        ui.horizontal(|ui| {
            let width = (ui.available_width() - 66.0).max(1.0);
            let scroll = ui.allocate_ui_with_layout(
                egui::vec2(width, 58.0),
                egui::Layout::top_down(egui::Align::Min),
                |ui| {
                    egui::ScrollArea::vertical()
                        .id_salt(("chat-draft-scroll", &channel.id))
                        .max_height(58.0)
                        .auto_shrink([false, false])
                        .show(ui, |ui| {
                            ui.add_enabled(
                                can_send && self.pending_mutation.is_none(),
                                egui::TextEdit::multiline(&mut self.input_text)
                                    .id_salt(("chat-composer", &channel.id))
                                    .desired_rows(2)
                                    .return_key(egui::KeyboardShortcut::new(
                                        if mobile {
                                            egui::Modifiers::NONE
                                        } else {
                                            egui::Modifiers::SHIFT
                                        },
                                        egui::Key::Enter,
                                    ))
                                    .hint_text(if can_send {
                                        "Nhập tin nhắn…"
                                    } else {
                                        "Chỉ quản trị viên được gửi"
                                    })
                                    .desired_width(ui.available_width()),
                            )
                        })
                },
            );
            let response = scroll.inner.inner;
            #[cfg(test)]
            ui.ctx().data_mut(|data| {
                data.insert_temp(egui::Id::new("test.chat.composer.id"), response.id)
            });
            if self.pending_mutation.is_none()
                && self.focus_composer_after_send.as_deref() == Some(channel.id.as_str())
                && can_send
                && ui.is_enabled()
            {
                response.request_focus();
                self.focus_composer_after_send = None;
            }
            let viewport = scroll.response.rect.intersect(ui.clip_rect());
            record_chat_rect(ui.ctx(), "chat.composer", viewport);
            let enter = !mobile
                && response.has_focus()
                && ui.input(|input| input.key_pressed(egui::Key::Enter) && !input.modifiers.shift);
            let send = ui.add_enabled(
                can_send && self.pending_mutation.is_none() && !self.input_text.trim().is_empty(),
                egui::Button::new("Gửi").fill(CHAT_PRIMARY),
            );
            record_chat_rect(ui.ctx(), "chat.send", send.rect);
            if send.clicked()
                || (enter
                    && can_send
                    && self.pending_mutation.is_none()
                    && !self.input_text.trim().is_empty())
            {
                *action = Some(ChatUiAction::Send);
                response.request_focus();
            }
        });
        ui.horizontal_wrapped(|ui| {
            ui.add_enabled(false, egui::Button::new("+").small())
                .on_disabled_hover_text("Chưa có API gửi tệp đính kèm.");
            ui.add_enabled(false, egui::Button::new("Thoại").small())
                .on_disabled_hover_text("Chưa có dịch vụ gọi thoại.");
            ui.label(
                RichText::new(if mobile {
                    "Enter xuống dòng · Chọn Gửi để gửi tin"
                } else {
                    "Enter gửi · Shift+Enter xuống dòng"
                })
                .size(10.0)
                .color(CHAT_MUTED),
            );
        });
    }

    fn render_dm_picker(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if !self.dm_picker_open {
            return;
        }
        let mut action = None;
        let mut close = false;
        egui::Window::new("Tin nhắn riêng mới").collapsible(false).resizable(false).title_bar(false)
            .anchor(egui::Align2::CENTER_CENTER, egui::Vec2::ZERO)
            .fixed_size(egui::vec2((ctx.screen_rect().width() - 32.0).min(440.0).max(1.0), (ctx.screen_rect().height() - 48.0).min(520.0).max(1.0)))
            .frame(egui::Frame::none().fill(CHAT_BG).inner_margin(16.0).rounding(12.0))
            .show(ctx, |ui| {
                chat_style(ui);
                ui.heading("Tin nhắn riêng mới");
                ui.label("Tìm đồng nghiệp theo tên, email hoặc mã nhân viên. Chọn một người cho DM hoặc nhiều người cho nhóm.");
                ui.horizontal(|ui| {
                    let search = ui.add(egui::TextEdit::singleline(&mut self.user_search).hint_text("Tìm người dùng…").desired_width((ui.available_width() - 62.0).max(1.0)));
                    if ui.add_enabled(self.pending_users.is_none(), egui::Button::new("Tìm")).clicked()
                        || (search.lost_focus() && ui.input(|input| input.key_pressed(egui::Key::Enter)) && self.pending_users.is_none()) { action = Some(ChatUiAction::SearchUsers); }
                });
                ui.horizontal_wrapped(|ui| {
                    if ui.add_enabled(!self.selected_user_ids.is_empty() && self.pending_dm.is_none(), egui::Button::new("Mở cuộc trò chuyện")).clicked() { action = Some(ChatUiAction::CreateDm); }
                    close = ui.button("Đóng").clicked();
                    if self.pending_dm.is_some() { ui.spinner(); }
                });
                ui.small(format!("Đã chọn {} người", self.selected_user_ids.len()));
                if !self.error.is_empty() { ui.add(egui::Label::new(RichText::new(&self.error).color(Color32::from_rgb(255, 128, 128))).wrap()); }
                if self.pending_users.is_some() { ui.spinner(); ui.label("Đang tìm đồng nghiệp…"); }
                egui::ScrollArea::vertical().id_salt("chat-dm-users").max_height(ui.available_height().max(1.0)).show(ui, |ui| {
                    if self.users.is_empty() && self.pending_users.is_none() { ui.label("Không tìm thấy người dùng phù hợp."); }
                    for user in &self.users {
                        let selected = self.selected_user_ids.contains(&user.id);
                        let label = format!("{} — {}{}", user.name, user.email, if user.department.is_empty() { String::new() } else { format!(" · {}", user.department) });
                        if ui.add_enabled(self.pending_dm.is_none(), egui::Button::new(label).selected(selected).wrap()).clicked() {
                            if selected { self.selected_user_ids.retain(|id| id != &user.id); }
                            else { self.selected_user_ids.push(user.id.clone()); }
                        }
                    }
                });
            });
        if close {
            self.dm_picker_open = false;
        }
        if let Some(action) = action {
            self.handle_action(ctx, action, session, api);
        }
    }

    fn handle_action(
        &mut self,
        ctx: &egui::Context,
        action: ChatUiAction,
        session: &Session,
        api: &ApiClient,
    ) {
        match action {
            ChatUiAction::SelectChannel(id) => {
                self.select_channel(id);
                self.sidebar_open = false;
            }
            ChatUiAction::Send => self.start_mutation(ChatUiAction::Send, session, api),
            ChatUiAction::ToggleReaction(message_id, emoji) => self.start_mutation(
                ChatUiAction::ToggleReaction(message_id, emoji),
                session,
                api,
            ),
            ChatUiAction::Reply(id) => self.reply_to_id = Some(id),
            ChatUiAction::ClearReply => self.reply_to_id = None,
            ChatUiAction::LoadOlder => {
                if let Some(channel_id) = self.active_channel_id.clone() {
                    self.request_messages(session, api, &channel_id, true);
                }
            }
            ChatUiAction::OpenDmPicker => {
                self.dm_picker_open = true;
                if self.users.is_empty() && self.pending_users.is_none() {
                    self.request_users(session, api);
                }
            }
            ChatUiAction::SearchUsers => self.request_users(session, api),
            ChatUiAction::CreateDm => {
                if self.pending_dm.is_none() && !self.selected_user_ids.is_empty() {
                    self.pending_dm =
                        Some(api.create_chat_dm_task(session, &self.selected_user_ids));
                    self.error.clear();
                }
            }
        }
        ctx.request_repaint_after(Duration::from_millis(80));
    }
}

const CHAT_BG: Color32 = Color32::from_rgb(49, 51, 56);
const CHAT_RAIL: Color32 = Color32::from_rgb(30, 31, 34);
const CHAT_CHANNELS: Color32 = Color32::from_rgb(43, 45, 49);
const CHAT_PRIMARY: Color32 = Color32::from_rgb(88, 101, 242);
const CHAT_MUTED: Color32 = Color32::from_rgb(128, 132, 142);
const CHAT_BORDER: Color32 = Color32::from_rgb(31, 32, 35);

fn is_dm(channel: &ChatChannel) -> bool {
    matches!(channel.channel_type.as_str(), "DM" | "GROUP_DM")
}

fn chat_style(ui: &mut Ui) {
    let style = ui.style_mut();
    style.spacing.item_spacing = egui::vec2(8.0, 6.0);
    style.spacing.button_padding = egui::vec2(8.0, 4.0);
    style.visuals = egui::Visuals::dark();
    style.visuals.override_text_color = Some(Color32::from_rgb(242, 243, 245));
    style.visuals.panel_fill = CHAT_BG;
    style.visuals.window_fill = CHAT_BG;
    style.visuals.extreme_bg_color = Color32::from_rgb(35, 36, 40);
    style.visuals.faint_bg_color = Color32::from_rgb(46, 48, 53);
    style.visuals.selection.bg_fill = Color32::from_rgb(64, 66, 73);
}

fn pane(parent: &mut Ui, id: &str, rect: egui::Rect, fill: Color32) -> Ui {
    parent.painter().rect_filled(rect, 0.0, fill);
    let mut child = parent.new_child(
        egui::UiBuilder::new()
            .id_salt(id)
            .max_rect(rect)
            .layout(egui::Layout::top_down(egui::Align::Min)),
    );
    child.set_clip_rect(rect.intersect(parent.clip_rect()));
    chat_style(&mut child);
    child
}

fn record_chat_rect(ctx: &egui::Context, name: &str, rect: egui::Rect) {
    crate::visual_test::record(name, rect);
    #[cfg(test)]
    ctx.data_mut(|data| data.insert_temp(egui::Id::new(format!("test.{name}")), rect));
    #[cfg(not(test))]
    let _ = ctx;
}

#[derive(Clone, Copy)]
enum RailIcon {
    Direct,
    Company,
    Back,
}

fn rail_button(
    ui: &mut Ui,
    rect: egui::Rect,
    icon: RailIcon,
    selected: bool,
    label: &str,
) -> egui::Response {
    let response = ui.interact(rect, ui.id().with(label), egui::Sense::click());
    response.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Button, true, label));
    ui.painter().rect_filled(
        rect,
        if selected || response.hovered() {
            14.0
        } else {
            24.0
        },
        if selected {
            CHAT_PRIMARY
        } else {
            CHAT_CHANNELS
        },
    );
    if selected {
        ui.painter().rect_filled(
            egui::Rect::from_min_size(
                egui::pos2(rect.left() - 12.0, rect.top() + 4.0),
                egui::vec2(4.0, 40.0),
            ),
            2.0,
            Color32::WHITE,
        );
    }
    match icon {
        RailIcon::Direct => bubble(ui.painter(), rect.shrink(13.0), Color32::WHITE),
        RailIcon::Company => {
            ui.painter().text(
                rect.center(),
                egui::Align2::CENTER_CENTER,
                "#",
                egui::FontId::proportional(26.0),
                Color32::WHITE,
            );
        }
        RailIcon::Back => {
            for x in [0.0, 9.0] {
                for y in [0.0, 9.0] {
                    ui.painter().rect_stroke(
                        egui::Rect::from_min_size(
                            rect.center() + egui::vec2(x - 8.0, y - 8.0),
                            egui::vec2(5.0, 5.0),
                        ),
                        0.5,
                        egui::Stroke::new(1.0, CHAT_MUTED),
                    );
                }
            }
        }
    }
    response.on_hover_text(label)
}

fn bubble(painter: &egui::Painter, rect: egui::Rect, color: Color32) {
    painter.rect_stroke(rect, 4.0, egui::Stroke::new(2.0, color));
    painter.line_segment(
        [
            rect.left_bottom(),
            rect.left_bottom() + egui::vec2(0.0, 5.0),
        ],
        egui::Stroke::new(2.0, color),
    );
    painter.line_segment(
        [
            rect.left_bottom() + egui::vec2(0.0, 5.0),
            rect.left_bottom() + egui::vec2(6.0, 0.0),
        ],
        egui::Stroke::new(2.0, color),
    );
}

fn admin_channel_matches(channel: &ChatChannel, search: &str) -> bool {
    let search = search.trim().to_lowercase();
    channel.channel_type == "COMPANY"
        && [&channel.id, &channel.name, &channel.category]
            .iter()
            .any(|field| field.to_lowercase().contains(&search))
}

fn format_chat_time(value: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|date| date.format("%d/%m %H:%M %:z").to_string())
        .unwrap_or_else(|_| value.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn admin_frame(
        view: &mut ChatView,
        ctx: &egui::Context,
        session: &Session,
        width: f32,
        events: Vec<egui::Event>,
    ) -> egui::FullOutput {
        ctx.run(
            egui::RawInput {
                screen_rect: Some(egui::Rect::from_min_size(
                    egui::Pos2::ZERO,
                    egui::vec2(width, 900.0),
                )),
                events,
                ..Default::default()
            },
            |ctx| {
                egui::CentralPanel::default()
                    .frame(egui::Frame::none())
                    .show(ctx, |ui| {
                        let bounds = egui::Rect::from_min_max(
                            egui::pos2(if width >= 1024.0 { 232.0 } else { 12.0 }, 56.0),
                            egui::pos2(width - 12.0, 892.0),
                        );
                        let mut content = ui.new_child(
                            egui::UiBuilder::new()
                                .max_rect(bounds)
                                .id_salt("admin.fixture"),
                        );
                        egui::ScrollArea::vertical()
                            .auto_shrink([false, false])
                            .show(&mut content, |ui| {
                                view.render_route(
                                    ui,
                                    ctx,
                                    session,
                                    &ApiClient,
                                    "/admin/chat/admin",
                                );
                                assert!(
                                    ui.min_rect().right() <= bounds.right() + 1.0,
                                    "{width}: horizontal page overflow {:?} vs {bounds:?}",
                                    ui.min_rect()
                                );
                            });
                    });
            },
        )
    }

    fn admin_text(shape: &egui::Shape, text: &mut String) {
        match shape {
            egui::Shape::Text(value) => {
                text.push_str(&value.galley.job.text);
                text.push('\n');
            }
            egui::Shape::Vec(shapes) => {
                for shape in shapes {
                    admin_text(shape, text);
                }
            }
            _ => {}
        }
    }

    fn admin_click(
        view: &mut ChatView,
        ctx: &egui::Context,
        session: &Session,
        width: f32,
        target: egui::Pos2,
    ) {
        for pressed in [true, false] {
            admin_frame(
                view,
                ctx,
                session,
                width,
                vec![
                    egui::Event::PointerMoved(target),
                    egui::Event::PointerButton {
                        pos: target,
                        button: egui::PointerButton::Primary,
                        pressed,
                        modifiers: egui::Modifiers::NONE,
                    },
                ],
            );
        }
    }

    fn admin_shown(ctx: &egui::Context) -> Vec<String> {
        ctx.data(|data| data.get_temp::<Vec<String>>(egui::Id::new("test.chat-admin.shown")))
            .unwrap()
    }

    #[test]
    fn admin_empty_and_long_metadata_layout_matches_legacy_without_security_claims() {
        for width in [320.0, 390.0, 768.0, 1440.0] {
            for populated in [false, true] {
                let session = test_session();
                let mut view = loaded_view(&session);
                view.channels_loaded = true;
                if populated {
                    let mut channel = view.channels[0].clone();
                    channel.id = "channel-with-a-very-long-server-identifier-".repeat(8);
                    channel.name = "Tên kênh rất dài để kiểm tra bố cục ".repeat(30);
                    channel.category = "Phân loại dự án dài ".repeat(30);
                    channel.topic = "Chủ đề dài ".repeat(30);
                    channel.locked = true;
                    channel.visibility = "PRIVATE".into();
                    view.channels = vec![channel];
                } else {
                    view.channels.clear();
                }
                let ctx = egui::Context::default();
                crate::native_text::setup_fonts(&ctx);
                crate::theme::setup_style(&ctx);
                let mut output = egui::FullOutput::default();
                for _ in 0..3 {
                    output = admin_frame(&mut view, &ctx, &session, width, vec![]);
                }
                let mut text = String::new();
                for shape in &output.shapes {
                    admin_text(&shape.shape, &mut text);
                }
                for header in [
                    "Tổng số kênh giao tiếp trực tuyến",
                    "Kênh bảo mật mã hóa đầu cuối E2EE",
                    "Tuân thủ chính sách lưu trữ ISO 27001",
                ] {
                    assert!(text.contains(header), "{width}: missing {header}");
                }
                assert!(text.contains("Chưa có dữ liệu"));
                assert!(!text.contains("100%"));
                assert!(!text.contains("AES-256"));
                assert!(!text.contains("10 người"));
                assert_eq!(admin_shown(&ctx).len(), usize::from(populated));
                let toolbar = rect(&ctx, "chat-admin.toolbar");
                let search = rect(&ctx, "chat-admin.search");
                let export = rect(&ctx, "chat-admin.export");
                let create = rect(&ctx, "chat-admin.create");
                assert!(
                    toolbar.contains_rect(search)
                        && toolbar.contains_rect(export)
                        && toolbar.contains_rect(create)
                );
                assert!(
                    !search.intersects(export)
                        && !search.intersects(create)
                        && !export.intersects(create)
                );
                assert_eq!(
                    search.width(),
                    360.0_f32.min(width - if width >= 1024.0 { 244.0 } else { 24.0 })
                );
                let table = rect(&ctx, "chat-admin.table.viewport");
                assert!(table.top() >= toolbar.bottom() + 11.0);
                if !populated {
                    assert!((table.height() - 196.0).abs() < 1.0, "{width}: {table:?}");
                }
                if width == 1440.0 && !populated {
                    assert!((table.top() - 210.0).abs() < 1.0, "{table:?}");
                    assert!((rect(&ctx, "chat-admin.metrics.bounds").height() - 86.0).abs() < 1.0);
                    for header in [
                        "Mã kênh",
                        "Tên kênh & Phân loại",
                        "Thành viên",
                        "Chuẩn bảo mật mã hóa",
                        "Lưu trữ tin nhắn",
                        "Trạng thái",
                        "Thao tác",
                    ] {
                        assert!(text.contains(header), "Missing legacy column {header}");
                    }
                }
            }
        }
    }

    #[test]
    fn admin_pagination_uses_ten_real_company_rows_and_search_resets_page() {
        let session = test_session();
        let mut view = loaded_view(&session);
        let source = view.channels[0].clone();
        view.channels = (0..23)
            .map(|index| {
                let mut channel = source.clone();
                channel.id = format!("company-{index:02}");
                channel.name = if index == 22 {
                    "Needle channel".into()
                } else {
                    format!("Kênh {index}")
                };
                channel
            })
            .collect();
        view.channels.push(direct_channel(&view));
        view.channels_loaded = true;
        let ctx = egui::Context::default();
        crate::native_text::setup_fonts(&ctx);
        crate::theme::setup_style(&ctx);
        for _ in 0..3 {
            admin_frame(&mut view, &ctx, &session, 1440.0, vec![]);
        }
        assert_eq!(
            admin_shown(&ctx),
            (0..10)
                .map(|index| format!("company-{index:02}"))
                .collect::<Vec<_>>()
        );
        let footer = rect(&ctx, "chat-admin.footer");
        let next = egui::pos2(footer.right() - 192.0 + 68.0, footer.top() + 12.0);
        admin_click(&mut view, &ctx, &session, 1440.0, next);
        assert_eq!(view.admin_page, 1);
        admin_frame(&mut view, &ctx, &session, 1440.0, vec![]);
        assert_eq!(
            admin_shown(&ctx).first().map(String::as_str),
            Some("company-10")
        );
        let search = rect(&ctx, "chat-admin.search").center();
        admin_click(&mut view, &ctx, &session, 1440.0, search);
        admin_frame(
            &mut view,
            &ctx,
            &session,
            1440.0,
            vec![egui::Event::Text("needle".into())],
        );
        assert_eq!(view.admin_page, 0);
        admin_frame(&mut view, &ctx, &session, 1440.0, vec![]);
        assert_eq!(admin_shown(&ctx), ["company-22"]);
        assert!(admin_channel_matches(&view.channels[22], "  NEEDLE  "));
        assert!(!admin_channel_matches(view.channels.last().unwrap(), ""));
        assert!(
            view.pending_mutation.is_none()
                && view.pending_messages.is_none()
                && view.pending_read.is_none()
        );
    }

    #[test]
    fn admin_total_becomes_known_only_after_successful_channel_response() {
        let session = test_session();
        let mut view = loaded_view(&session);
        view.channels.clear();
        assert!(!view.channels_loaded);
        view.pending_channels = Some(std::sync::Arc::new(std::sync::Mutex::new(Some(Ok(
            crate::api::ChatChannelsResponse { data: vec![] },
        )))));
        view.poll(&egui::Context::default(), &session, &ApiClient, false);
        assert!(view.channels_loaded);
        assert!(view.channels.is_empty());
        assert!(view.pending_messages.is_none() && view.pending_read.is_none());
    }

    #[test]
    fn admin_acl_denies_non_admin_before_loading_or_revealing_channels() {
        let mut session = test_session();
        session.user.role = "EMPLOYEE".into();
        let mut view = ChatView::default();
        view.channels = loaded_view(&test_session()).channels;
        let ctx = egui::Context::default();
        crate::native_text::setup_fonts(&ctx);
        let output = admin_frame(&mut view, &ctx, &session, 390.0, vec![]);
        let mut text = String::new();
        for shape in &output.shapes {
            admin_text(&shape.shape, &mut text);
        }
        assert!(text.contains("Bạn không có quyền truy cập"));
        assert!(!text.contains("Kênh trao đổi công việc"));
        assert!(!text.contains("Tổng số kênh giao tiếp trực tuyến"));
        assert!(
            view.pending_channels.is_none()
                && view.pending_messages.is_none()
                && view.pending_read.is_none()
        );
    }

    fn test_session() -> Session {
        serde_json::from_value(serde_json::json!({
            "token": "test", "session_id": "test", "endpoint": "http://127.0.0.1:1/api/v1", "mode": "local_admin",
            "user": {"id": "user", "name": "User", "email": "user@example.test", "role": "ADMIN"}
        })).unwrap()
    }

    fn rect(ctx: &egui::Context, name: &str) -> egui::Rect {
        ctx.data(|data| data.get_temp::<egui::Rect>(egui::Id::new(format!("test.{name}"))))
            .unwrap()
    }

    fn fullscreen_frame(
        view: &mut ChatView,
        ctx: &egui::Context,
        session: &Session,
        size: egui::Vec2,
        events: Vec<egui::Event>,
    ) -> bool {
        let mut exit = false;
        let _ = ctx.run(
            egui::RawInput {
                screen_rect: Some(egui::Rect::from_min_size(egui::Pos2::ZERO, size)),
                events,
                ..Default::default()
            },
            |ctx| {
                exit = view.render_fullscreen(ctx, session, &ApiClient);
            },
        );
        exit
    }

    fn click(
        view: &mut ChatView,
        ctx: &egui::Context,
        session: &Session,
        size: egui::Vec2,
        target: egui::Pos2,
    ) -> bool {
        let mut exit = false;
        for events in [
            vec![egui::Event::PointerMoved(target)],
            vec![
                egui::Event::PointerMoved(target),
                egui::Event::PointerButton {
                    pos: target,
                    button: egui::PointerButton::Primary,
                    pressed: true,
                    modifiers: egui::Modifiers::NONE,
                },
            ],
            vec![
                egui::Event::PointerMoved(target),
                egui::Event::PointerButton {
                    pos: target,
                    button: egui::PointerButton::Primary,
                    pressed: false,
                    modifiers: egui::Modifiers::NONE,
                },
            ],
        ] {
            exit |= fullscreen_frame(view, ctx, session, size, events);
        }
        exit
    }

    fn direct_channel(view: &ChatView) -> ChatChannel {
        let mut channel = view.channels[0].clone();
        channel.id = "dm".into();
        channel.channel_type = "DM".into();
        channel.name = "Đồng nghiệp từ API".into();
        channel
    }

    #[test]
    fn channel_refresh_keeps_at_me_unselected_even_when_company_channels_exist() {
        let session = test_session();
        let mut view = loaded_view(&session);
        view.clear_selection();
        view.company_scope = false;
        view.pending_channels = Some(std::sync::Arc::new(std::sync::Mutex::new(Some(Ok(
            crate::api::ChatChannelsResponse {
                data: view.channels.clone(),
            },
        )))));
        view.poll(&egui::Context::default(), &session, &ApiClient, true);
        assert!(view.active_channel_id.is_none());
        assert!(view.messages.is_empty());
        assert!(view.pending_messages.is_none());
        assert!(view.pending_read.is_none());
        assert!(!view.company_scope);
    }

    #[test]
    fn switching_dm_and_company_restores_separate_selection_and_drafts() {
        let mut view = loaded_view(&test_session());
        view.channels.push(direct_channel(&view));
        view.input_text = "Company draft".into();
        view.reply_to_id = Some("company-reply".into());
        view.switch_scope(false);
        assert!(view.active_channel_id.is_none());
        assert!(view.reply_to_id.is_none());
        view.select_channel("dm".into());
        view.input_text = "DM draft".into();
        view.switch_scope(true);
        assert_eq!(view.active_channel_id.as_deref(), Some("channel"));
        assert_eq!(view.input_text, "Company draft");
        view.switch_scope(false);
        assert_eq!(view.active_channel_id.as_deref(), Some("dm"));
        assert_eq!(view.input_text, "DM draft");
        assert!(view.messages.is_empty());
    }

    #[test]
    fn fullscreen_has_legacy_panes_and_pointer_navigation_at_all_requested_widths() {
        for width in [320.0, 390.0, 768.0, 1440.0] {
            let session = test_session();
            let mut view = loaded_view(&session);
            view.channels.push(direct_channel(&view));
            view.clear_selection();
            view.company_scope = false;
            view.last_company = None;
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            ctx.set_visuals(egui::Visuals::light());
            let size = egui::vec2(width, 900.0);
            let screen = egui::Rect::from_min_size(egui::Pos2::ZERO, size);
            for _ in 0..3 {
                assert!(!fullscreen_frame(&mut view, &ctx, &session, size, vec![]));
            }
            assert_eq!(rect(&ctx, "chat.fullscreen"), screen);
            assert!(
                !ctx.style().visuals.dark_mode,
                "The full-screen palette must stay scoped"
            );
            assert!(view.active_channel_id.is_none());
            assert_eq!(
                rect(&ctx, "chat.main").left(),
                if width < 1024.0 { 0.0 } else { 312.0 }
            );
            if width < 1024.0 {
                assert!(
                    click(
                        &mut view,
                        &ctx,
                        &session,
                        size,
                        rect(&ctx, "chat.menu").center()
                    ) == false
                );
                assert!(view.sidebar_open);
                fullscreen_frame(&mut view, &ctx, &session, size, vec![]);
            }
            assert_eq!(rect(&ctx, "chat.rail").width(), 72.0);
            assert_eq!(rect(&ctx, "chat.channels").width(), 240.0);
            assert!(screen.contains_rect(rect(&ctx, "chat.channels")));
            assert!(
                ctx.data(
                    |data| data.get_temp::<egui::Rect>(egui::Id::new("test.chat.channel.channel"))
                )
                .is_none(),
                "Company channels must not appear under @me"
            );
            assert!(screen.contains_rect(rect(&ctx, "chat.channel.dm")));
            click(
                &mut view,
                &ctx,
                &session,
                size,
                rect(&ctx, "chat.scope.company").center(),
            );
            assert!(view.company_scope);
            assert!(view.active_channel_id.is_none());
            fullscreen_frame(&mut view, &ctx, &session, size, vec![]);
            let company = rect(&ctx, "chat.channel.channel");
            assert!(screen.contains_rect(company));
            click(&mut view, &ctx, &session, size, company.center());
            assert_eq!(view.active_channel_id.as_deref(), Some("channel"));
            assert!(!view.sidebar_open);
            // Keep requests pending in the fixture; pointer checks must never reach the network.
            view.pending_messages = Some(MessageLoad {
                channel_id: "channel".into(),
                older: false,
                task: Default::default(),
            });
            view.pending_read = Some(Default::default());
            fullscreen_frame(&mut view, &ctx, &session, size, vec![]);
            if width < 1024.0 {
                click(
                    &mut view,
                    &ctx,
                    &session,
                    size,
                    rect(&ctx, "chat.menu").center(),
                );
                fullscreen_frame(&mut view, &ctx, &session, size, vec![]);
            }
            assert!(
                click(
                    &mut view,
                    &ctx,
                    &session,
                    size,
                    rect(&ctx, "chat.back").center()
                ),
                "Back-to-app pointer at {width}"
            );
        }
    }

    #[test]
    fn fullscreen_long_history_reply_and_composer_stay_inside_viewport_and_accept_pointer() {
        for width in [320.0, 390.0, 768.0, 1440.0] {
            let session = test_session();
            let mut view = loaded_view(&session);
            view.channels[0].name = "Kênh dài ".repeat(40);
            view.channels[0].topic = "Chủ đề dài ".repeat(50);
            view.messages = (0..70)
                .map(|index| {
                    let mut message = test_message(&format!("message-{index}"), "channel");
                    message.content = "Nội dung dài và liên kết ".repeat(12);
                    message
                })
                .collect();
            view.input_text = "Bản nháp rất dài\n".repeat(150);
            view.reply_to_id = Some("message-69".into());
            view.has_older_messages = true;
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            let size = egui::vec2(width, 640.0);
            let screen = egui::Rect::from_min_size(egui::Pos2::ZERO, size);
            for _ in 0..3 {
                fullscreen_frame(&mut view, &ctx, &session, size, vec![]);
            }
            let input = rect(&ctx, "chat.composer");
            let send = rect(&ctx, "chat.send");
            let history = rect(&ctx, "chat.history");
            assert!(
                screen.contains_rect(input) && input.height() >= 40.0,
                "{width}: {input:?}"
            );
            assert!(screen.contains_rect(send), "{width}: {send:?}");
            assert!(
                screen.contains_rect(history) && history.bottom() <= input.top(),
                "{width}: {history:?}"
            );
            assert!(!input.intersects(send), "{width}: send overlaps input");
            click(&mut view, &ctx, &session, size, input.center());
            assert!(
                ctx.memory(|memory| memory.focused().is_some()),
                "Composer pointer focus at {width}"
            );
            view.reply_to_id = None;
            // Resizing the sticky history needs a layout pass before targeting its last button.
            for _ in 0..3 {
                fullscreen_frame(&mut view, &ctx, &session, size, vec![]);
            }
            let reply = rect(&ctx, "chat.reply.message-69");
            assert!(
                rect(&ctx, "chat.history").contains(reply.center()),
                "{width}: reply outside history {reply:?}"
            );
            click(&mut view, &ctx, &session, size, reply.center());
            assert_eq!(
                view.reply_to_id.as_deref(),
                Some("message-69"),
                "Reply pointer at {width}: target {reply:?}, current {:?}",
                rect(&ctx, "chat.reply.message-69")
            );
        }
    }

    #[test]
    fn locked_and_voice_channels_keep_send_acl_in_the_shared_action_handler() {
        let mut session = test_session();
        let mut view = loaded_view(&session);
        view.channels[0].locked = true;
        view.input_text = "Must remain a draft".into();
        session.user.role = "EMPLOYEE".into();
        view.start_mutation(ChatUiAction::Send, &session, &ApiClient);
        assert!(view.pending_mutation.is_none());
        session.user.role = "ADMIN".into();
        view.channels[0].kind = "VOICE".into();
        view.start_mutation(ChatUiAction::Send, &session, &ApiClient);
        assert!(view.pending_mutation.is_none());
        assert_eq!(view.input_text, "Must remain a draft");
    }

    fn loaded_view(session: &Session) -> ChatView {
        let channel: ChatChannel = serde_json::from_value(serde_json::json!({
            "id": "channel", "type": "COMPANY", "name": "Kênh trao đổi công việc", "visibility": "PUBLIC", "status": "ACTIVE", "kind": "TEXT"
        })).unwrap();
        ChatView {
            channels: vec![channel],
            company_scope: true,
            last_company: Some("channel".into()),
            active_channel_id: Some("channel".into()),
            loaded_for: Some(format!("{}|{}", session.user.id, session.endpoint)),
            loaded_messages_for: Some("channel".into()),
            last_channels_load: Some(Instant::now()),
            last_messages_load: Some(Instant::now()),
            needs_channels: false,
            needs_messages: false,
            ..Default::default()
        }
    }

    fn composer_frame(
        view: &mut ChatView,
        ctx: &egui::Context,
        width: f32,
        events: Vec<egui::Event>,
    ) -> Option<ChatUiAction> {
        let channel = view.channels[0].clone();
        let mut action = None;
        let _ = ctx.run(
            egui::RawInput {
                screen_rect: Some(egui::Rect::from_min_size(
                    egui::Pos2::ZERO,
                    egui::vec2(width, 300.0),
                )),
                events,
                ..Default::default()
            },
            |ctx| {
                egui::CentralPanel::default().show(ctx, |ui| {
                    view.render_composer(ui, &channel, true, &mut action)
                });
            },
        );
        action
    }

    #[test]
    fn mobile_return_inserts_newline_while_desktop_return_sends() {
        for width in [390.0, 768.0, 1024.0, 1440.0] {
            let ctx = egui::Context::default();
            let mut view = loaded_view(&test_session());
            view.input_text = "Nội dung".into();
            composer_frame(&mut view, &ctx, width, vec![]);
            let id = ctx
                .data(|data| data.get_temp::<egui::Id>(egui::Id::new("test.chat.composer.id")))
                .unwrap();
            ctx.memory_mut(|memory| memory.request_focus(id));
            let action = composer_frame(
                &mut view,
                &ctx,
                width,
                vec![egui::Event::Key {
                    key: egui::Key::Enter,
                    physical_key: None,
                    pressed: true,
                    repeat: false,
                    modifiers: egui::Modifiers::NONE,
                }],
            );
            if width < 1024.0 {
                assert!(action.is_none(), "mobile Return must not send at {width}");
                assert!(
                    view.input_text.contains('\n'),
                    "mobile Return must insert newline at {width}"
                );
            } else {
                assert!(
                    matches!(action, Some(ChatUiAction::Send)),
                    "desktop Enter sends at {width}"
                );
                assert!(!view.input_text.contains('\n'));
            }
        }
    }

    #[test]
    fn composer_regains_focus_after_send_finishes_but_not_after_channel_switch() {
        let ctx = egui::Context::default();
        let mut view = loaded_view(&test_session());
        view.focus_composer_after_send = Some("channel".into());
        view.pending_mutation = Some(ChatMutation::Send {
            channel_id: "channel".into(),
            text: "Draft".into(),
            task: std::sync::Arc::new(std::sync::Mutex::new(None)),
        });
        composer_frame(&mut view, &ctx, 1440.0, vec![]);
        assert!(view.focus_composer_after_send.is_some());
        view.pending_mutation = None;
        composer_frame(&mut view, &ctx, 1440.0, vec![]);
        let id = ctx
            .data(|data| data.get_temp::<egui::Id>(egui::Id::new("test.chat.composer.id")))
            .unwrap();
        assert!(ctx.memory(|memory| memory.has_focus(id)));
        assert!(view.focus_composer_after_send.is_none());
        composer_frame(
            &mut view,
            &ctx,
            1440.0,
            vec![egui::Event::Text("Gõ tiếp".into())],
        );
        assert_eq!(view.input_text, "Gõ tiếp");
        view.focus_composer_after_send = Some("channel".into());
        view.select_channel("other".into());
        assert!(view.focus_composer_after_send.is_none());
    }

    #[test]
    fn switching_channels_preserves_each_unsent_draft() {
        let mut view = loaded_view(&test_session());
        view.input_text = "Tin nhắn kênh đầu".into();
        view.select_channel("second".into());
        assert!(view.input_text.is_empty());
        view.input_text = "Tin nhắn kênh sau".into();
        view.select_channel("channel".into());
        assert_eq!(view.input_text, "Tin nhắn kênh đầu");
        view.select_channel("second".into());
        assert_eq!(view.input_text, "Tin nhắn kênh sau");
    }

    #[test]
    fn refresh_keeps_older_history_and_its_pagination_cursor() {
        let session = test_session();
        let mut view = loaded_view(&session);
        view.messages = vec![
            test_message("old", "channel"),
            test_message("latest", "channel"),
        ];
        view.older_cursor = Some("old-cursor".into());
        view.has_older_messages = true;
        let response: ChatMessagesResponse = serde_json::from_value(serde_json::json!({
            "data": [test_message_json("latest", "channel"), test_message_json("new", "channel")],
            "pagination": {"hasMore": false, "nextCursor": null}
        }))
        .unwrap();
        view.pending_messages = Some(MessageLoad {
            channel_id: "channel".into(),
            older: false,
            task: std::sync::Arc::new(std::sync::Mutex::new(Some(Ok(response)))),
        });
        view.poll(
            &egui::Context::default(),
            &session,
            &ApiClient::default(),
            true,
        );
        assert_eq!(
            view.messages
                .iter()
                .map(|message| message.id.as_str())
                .collect::<Vec<_>>(),
            ["old", "latest", "new"]
        );
        assert_eq!(view.older_cursor.as_deref(), Some("old-cursor"));
        assert!(view.has_older_messages);
    }

    #[test]
    fn send_acknowledgement_after_channel_switch_keeps_the_current_draft() {
        let session = test_session();
        let mut view = loaded_view(&session);
        view.input_text = "text".into();
        view.pending_mutation = Some(ChatMutation::Send {
            channel_id: "channel".into(),
            text: "text".into(),
            task: std::sync::Arc::new(std::sync::Mutex::new(Some(Ok(
                ChatMessageMutationResponse {
                    success: true,
                    data: test_message("sent", "channel"),
                },
            )))),
        });
        view.select_channel("second".into());
        view.input_text = "Keep this draft".into();
        view.poll(
            &egui::Context::default(),
            &session,
            &ApiClient::default(),
            false,
        );
        assert_eq!(view.input_text, "Keep this draft");
        assert!(!view.drafts.contains_key("channel"));
        assert!(view.messages.is_empty());
    }

    #[test]
    fn admin_catalog_does_not_load_conversations_or_mark_them_read() {
        let session = test_session();
        let mut view = loaded_view(&session);
        view.loaded_messages_for = None;
        view.needs_messages = true;
        view.poll(
            &egui::Context::default(),
            &session,
            &ApiClient::default(),
            false,
        );
        assert!(view.pending_messages.is_none());
        assert!(view.pending_read.is_none());
    }

    #[test]
    fn composer_and_long_history_fit_the_viewport_at_mobile_and_desktop_sizes() {
        for (width, height) in [
            (320.0, 640.0),
            (390.0, 844.0),
            (768.0, 640.0),
            (1280.0, 900.0),
        ] {
            let session = test_session();
            let mut view = loaded_view(&session);
            view.messages = (0..75)
                .map(|index| {
                    let mut message = test_message(&format!("message-{index}"), "channel");
                    message.content = "Nội dung tin nhắn dài cần xuống dòng ".repeat(8);
                    message
                })
                .collect();
            view.input_text = "Bản nháp nhiều dòng\n".repeat(100);
            view.reply_to_id = Some("message-74".into());
            view.has_older_messages = true;
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            let screen = egui::Rect::from_min_size(egui::Pos2::ZERO, egui::vec2(width, height));
            for _ in 0..3 {
                let _ = ctx.run(
                    egui::RawInput {
                        screen_rect: Some(screen),
                        ..Default::default()
                    },
                    |ctx| {
                        egui::CentralPanel::default().show(ctx, |ui| {
                            egui::ScrollArea::vertical().show(ui, |ui| {
                                let clip = ui.clip_rect();
                                view.render(ui, ctx, &session, &ApiClient::default());
                                assert!(
                                    ui.min_rect().right() <= clip.right() + 1.0,
                                    "width {width}: {:?} vs {clip:?}",
                                    ui.min_rect()
                                );
                                assert!(
                                    ui.min_rect().bottom() <= clip.bottom() + 1.0,
                                    "height {height}: {:?} vs {clip:?}",
                                    ui.min_rect()
                                );
                            });
                        });
                    },
                );
            }
            let composer = ctx
                .data_mut(|data| data.get_temp::<egui::Rect>(egui::Id::new("test.chat.composer")))
                .unwrap();
            assert!(
                composer.height() >= 24.0 && screen.contains_rect(composer),
                "{width}×{height}: {composer:?}"
            );
        }
    }

    #[test]
    fn view_starts_without_fabricated_messages_or_channels() {
        let view = ChatView::default();
        assert!(view.channels.is_empty());
        assert!(view.messages.is_empty());
        assert!(view.active_channel_id.is_none());
        assert!(view.needs_channels);
    }

    #[test]
    fn selecting_another_channel_clears_channel_scoped_state() {
        let mut view = ChatView::default();
        view.active_channel_id = Some("first".to_owned());
        view.messages.push(test_message("message", "first"));
        view.reply_to_id = Some("message".to_owned());
        view.loaded_messages_for = Some("first".to_owned());

        view.select_channel("second".to_owned());

        assert_eq!(view.active_channel_id.as_deref(), Some("second"));
        assert!(view.messages.is_empty());
        assert!(view.reply_to_id.is_none());
        assert!(view.loaded_messages_for.is_none());
        assert!(view.needs_messages);
    }

    fn test_message(id: &str, channel_id: &str) -> ChatMessage {
        serde_json::from_value(test_message_json(id, channel_id)).unwrap()
    }

    fn test_message_json(id: &str, channel_id: &str) -> serde_json::Value {
        serde_json::json!({
            "id": id,
            "channelId": channel_id,
            "userId": "user",
            "content": "text",
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z",
            "user": { "id": "user", "email": "user@example.test", "profile": { "fullName": "User" }, "employee": {} }
        })
    }
}
