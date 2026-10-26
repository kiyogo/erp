use crate::{
    api::{
        ApiClient, ApiTask, DocumentApiResponse, DocumentComment, DocumentCommentMutationResponse,
        DocumentCommentsResponse, DocumentCreateResponse, DocumentHistoryRecord,
        DocumentHistoryResponse, DocumentMember, DocumentMembersResponse, DocumentMutationResponse,
        DocumentRecord, DocumentShareResponse, DocumentsResponse,
    },
    models::Session,
    widgets,
};
use egui::{Color32, RichText, Ui};
use serde_json::{Value, json};

#[derive(Clone, Copy)]
enum RichBlockKind {
    Paragraph,
    Heading(u8),
    ListItem,
}

#[derive(Clone, Copy)]
enum RichRunLocation {
    Block {
        block_index: usize,
        run_index: usize,
    },
    TableCell {
        table_index: usize,
        row_index: usize,
        cell_index: usize,
        block_index: usize,
        run_index: usize,
    },
}

struct RichTableDraft {
    rows: Vec<RichTableRowDraft>,
}

struct RichTableRowDraft {
    cells: Vec<RichTableCellDraft>,
}

struct RichTableCellDraft {
    blocks: Vec<Vec<String>>,
}

struct RichDocumentDraft {
    template: Value,
    runs: Vec<Vec<String>>,
    tables: Vec<Option<RichTableDraft>>,
}

#[derive(Default)]
struct RichEditorActions {
    changed: bool,
    add_blocks: Vec<RichBlockKind>,
    add_runs: Vec<RichRunLocation>,
    marks: Vec<(RichRunLocation, &'static str, bool)>,
}

enum DocumentNavigation {
    Open(String),
    Create,
}

pub struct DocumentEditorView {
    documents: Vec<DocumentRecord>,
    active_document: Option<DocumentRecord>,
    selected_id: Option<String>,
    pending_load: Option<ApiTask<DocumentsResponse>>,
    pending_open: Option<ApiTask<DocumentApiResponse>>,
    pending_history: Option<ApiTask<DocumentHistoryResponse>>,
    pending_create: Option<ApiTask<DocumentCreateResponse>>,
    pending_save: Option<ApiTask<DocumentMutationResponse>>,
    pending_comments: Option<ApiTask<DocumentCommentsResponse>>,
    pending_members: Option<ApiTask<DocumentMembersResponse>>,
    pending_comment_create: Option<ApiTask<DocumentCommentMutationResponse>>,
    pending_comment_update: Option<ApiTask<DocumentCommentMutationResponse>>,
    pending_share: Option<ApiTask<DocumentShareResponse>>,
    loaded_for: Option<String>,
    needs_reload: bool,
    new_title: String,
    search: String,
    dirty: bool,
    pending_navigation: Option<DocumentNavigation>,
    title: String,
    content: String,
    has_unsupported_content: bool,
    rich_draft: Option<RichDocumentDraft>,
    comments: Vec<DocumentComment>,
    history: Vec<DocumentHistoryRecord>,
    members: Vec<DocumentMember>,
    comment_draft: String,
    share_email: String,
    share_role: String,
    notice: String,
    error: String,
}

impl Default for DocumentEditorView {
    fn default() -> Self {
        Self {
            documents: Vec::new(),
            active_document: None,
            selected_id: None,
            pending_load: None,
            pending_open: None,
            pending_history: None,
            pending_create: None,
            pending_save: None,
            pending_comments: None,
            pending_members: None,
            pending_comment_create: None,
            pending_comment_update: None,
            pending_share: None,
            loaded_for: None,
            needs_reload: true,
            new_title: String::new(),
            search: String::new(),
            dirty: false,
            pending_navigation: None,
            title: String::new(),
            content: String::new(),
            has_unsupported_content: false,
            rich_draft: None,
            comments: Vec::new(),
            history: Vec::new(),
            members: Vec::new(),
            comment_draft: String::new(),
            share_email: String::new(),
            share_role: "viewer".to_owned(),
            notice: String::new(),
            error: String::new(),
        }
    }
}

impl DocumentEditorView {
    fn confirm_navigation(&mut self, navigation: DocumentNavigation) -> Option<DocumentNavigation> {
        if self.dirty {
            self.pending_navigation = Some(navigation);
            None
        } else {
            Some(navigation)
        }
    }

    fn load_snapshot(&mut self, snapshot: Option<&Value>) {
        self.dirty = false;
        self.rich_draft = snapshot.and_then(RichDocumentDraft::from_snapshot);
        if self.rich_draft.is_some() {
            self.content.clear();
            self.has_unsupported_content = false;
        } else {
            let (content, unsupported) = snapshot
                .map(document_to_text)
                .unwrap_or_else(|| (String::new(), false));
            self.content = content;
            self.has_unsupported_content = unsupported;
        }
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let identity = format!("{}|{}", session.user.id, session.endpoint);
        if self.loaded_for.as_deref() != Some(identity.as_str()) {
            *self = Self {
                loaded_for: Some(identity),
                ..Self::default()
            };
        }

        if self.needs_reload && self.pending_load.is_none() {
            self.pending_load = Some(api.list_documents_task(session));
            self.needs_reload = false;
            self.error.clear();
        }
        if let Some(result) = self.pending_load.as_ref().and_then(ApiClient::poll) {
            self.pending_load = None;
            match result {
                Ok(response) => {
                    self.documents = response.data;
                    if self
                        .selected_id
                        .as_ref()
                        .is_some_and(|id| !self.documents.iter().any(|doc| &doc.id == id))
                    {
                        self.selected_id = None;
                        self.active_document = None;
                    }
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_open.as_ref().and_then(ApiClient::poll) {
            self.pending_open = None;
            match result {
                Ok(response) => {
                    self.history.clear();
                    self.pending_history =
                        Some(api.list_document_history_task(session, &response.document.id));
                    self.pending_comments =
                        Some(api.list_document_comments_task(session, &response.document.id));
                    self.pending_members =
                        Some(api.list_document_members_task(session, &response.document.id));
                    self.comments.clear();
                    self.members.clear();
                    self.selected_id = Some(response.document.id.clone());
                    self.title = response.document.title.clone();
                    self.load_snapshot(response.snapshot.as_ref().map(|snapshot| &snapshot.data));
                    self.active_document = Some(response.document);
                    self.comment_draft.clear();
                    self.share_email.clear();
                    self.notice = if self.has_unsupported_content {
                        "Chỉ đọc: tài liệu có ảnh hoặc nội dung nâng cao chưa được hỗ trợ."
                            .to_owned()
                    } else if self.rich_draft.is_some() {
                        "Đã mở nội dung có cấu trúc; định dạng và metadata sẽ được giữ khi sửa chữ."
                            .to_owned()
                    } else {
                        "Đã tải tài liệu từ backend.".to_owned()
                    };
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_create.as_ref().and_then(ApiClient::poll) {
            self.pending_create = None;
            match result {
                Ok(response) => {
                    self.history.clear();
                    self.comments.clear();
                    self.members.clear();
                    self.comment_draft.clear();
                    self.share_email.clear();
                    self.pending_history =
                        Some(api.list_document_history_task(session, &response.document.id));
                    self.pending_comments =
                        Some(api.list_document_comments_task(session, &response.document.id));
                    self.pending_members =
                        Some(api.list_document_members_task(session, &response.document.id));
                    self.documents.insert(0, response.document.clone());
                    self.selected_id = Some(response.document.id.clone());
                    self.title = response.document.title.clone();
                    self.load_snapshot(Some(&response.snapshot.data));
                    self.active_document = Some(response.document);
                    self.new_title.clear();
                    self.notice = "Đã tạo và lưu tài liệu mới trong backend.".to_owned();
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_save.as_ref().and_then(ApiClient::poll) {
            self.pending_save = None;
            match result {
                Ok(response) if response.snapshot_saved => {
                    self.dirty = false;
                    let saved_document = response.document;
                    self.pending_history =
                        Some(api.list_document_history_task(session, &saved_document.id));
                    self.title.clone_from(&saved_document.title);
                    if let Some(draft) = self.rich_draft.as_mut() {
                        draft.set_document_metadata(
                            &saved_document.id,
                            &saved_document.title,
                            saved_document.current_revision,
                        );
                    }
                    self.active_document = Some(saved_document.clone());
                    if let Some(row) = self
                        .documents
                        .iter_mut()
                        .find(|doc| doc.id == saved_document.id)
                    {
                        *row = saved_document.clone();
                    }
                    self.notice = format!("Đã lưu phiên bản {}.", saved_document.current_revision);
                    self.error.clear();
                }
                Ok(_) => self.error = "Backend không xác nhận đã lưu snapshot.".to_owned(),
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_history.as_ref().and_then(ApiClient::poll) {
            self.pending_history = None;
            match result {
                Ok(response) => self.history = response.history,
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_comments.as_ref().and_then(ApiClient::poll) {
            self.pending_comments = None;
            match result {
                Ok(response) => self.comments = response.comments,
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_members.as_ref().and_then(ApiClient::poll) {
            self.pending_members = None;
            match result {
                Ok(response) => self.members = response.members,
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self
            .pending_comment_create
            .as_ref()
            .and_then(ApiClient::poll)
        {
            self.pending_comment_create = None;
            match result {
                Ok(response) => {
                    self.comments.push(response.comment);
                    self.comment_draft.clear();
                    self.notice = "Đã gửi bình luận.".to_owned();
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self
            .pending_comment_update
            .as_ref()
            .and_then(ApiClient::poll)
        {
            self.pending_comment_update = None;
            match result {
                Ok(response) => {
                    if let Some(comment) = self
                        .comments
                        .iter_mut()
                        .find(|comment| comment.id == response.comment.id)
                    {
                        *comment = response.comment;
                    }
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_share.as_ref().and_then(ApiClient::poll) {
            self.pending_share = None;
            match result {
                Ok(response) if response.success => {
                    self.notice = format!(
                        "Đã chia sẻ cho {} với vai trò {}.",
                        response.member.email, response.member.role
                    );
                    self.share_email.clear();
                    if let Some(document) = self.active_document.as_ref() {
                        self.pending_members =
                            Some(api.list_document_members_task(session, &document.id));
                    }
                    self.error.clear();
                }
                Ok(_) => self.error = "Backend không xác nhận đã chia sẻ tài liệu.".to_owned(),
                Err(error) => self.error = error,
            }
        }

        if self.pending_load.is_some()
            || self.pending_open.is_some()
            || self.pending_history.is_some()
            || self.pending_create.is_some()
            || self.pending_save.is_some()
            || self.pending_comments.is_some()
            || self.pending_members.is_some()
            || self.pending_comment_create.is_some()
            || self.pending_comment_update.is_some()
            || self.pending_share.is_some()
        {
            ctx.request_repaint_after(std::time::Duration::from_millis(100));
        }
    }

    fn render_list(
        &mut self,
        ui: &mut Ui,
        height: f32,
        can_navigate: bool,
        open_id: &mut Option<String>,
        create: &mut bool,
    ) {
        ui.strong("Tài liệu của tôi / được chia sẻ");
        ui.add(
            egui::TextEdit::singleline(&mut self.search)
                .hint_text("Tìm tiêu đề hoặc chủ sở hữu…")
                .desired_width(ui.available_width()),
        );
        ui.horizontal(|ui| {
            let title = ui.add_enabled(
                can_navigate,
                egui::TextEdit::singleline(&mut self.new_title)
                    .hint_text("Tên tài liệu mới")
                    .desired_width((ui.available_width() - 82.0).max(1.0)),
            );
            if ui
                .add_enabled(can_navigate, egui::Button::new("＋ Tạo"))
                .clicked()
                || (can_navigate
                    && title.lost_focus()
                    && ui.input(|input| input.key_pressed(egui::Key::Enter)))
            {
                *create = true;
            }
        });
        ui.separator();
        egui::ScrollArea::vertical()
            .id_salt("document-list")
            .max_height((height - 132.0).max(70.0))
            .auto_shrink([false, false])
            .show(ui, |ui| {
                if self.documents.is_empty() {
                    if self.pending_load.is_some() {
                        ui.spinner();
                        ui.label("Đang tải tài liệu…");
                    } else if self.error.is_empty() {
                        ui.label("Chưa có tài liệu. Tạo tài liệu mới để bắt đầu.");
                    } else {
                        ui.label("Không thể tải danh sách. Chọn Làm mới để thử lại.");
                    }
                }
                let search = self.search.trim().to_lowercase();
                let mut found = false;
                for document in &self.documents {
                    if ![&document.title, &document.owner_name, &document.owner_code]
                        .iter()
                        .any(|field| field.to_lowercase().contains(&search))
                    {
                        continue;
                    }
                    found = true;
                    let selected = self.selected_id.as_deref() == Some(document.id.as_str());
                    ui.push_id(&document.id, |ui| {
                        if ui
                            .add_enabled(
                                can_navigate,
                                egui::Button::new(&document.title)
                                    .selected(selected)
                                    .frame(false)
                                    .truncate()
                                    .min_size(egui::vec2(ui.available_width(), 32.0)),
                            )
                            .on_hover_text(&document.title)
                            .clicked()
                            && !selected
                        {
                            *open_id = Some(document.id.clone());
                        }
                        ui.small(format!(
                            "{} · Phiên bản {}",
                            document_role_label(&document.user_role),
                            document.current_revision
                        ));
                        ui.add(
                            egui::Label::new(
                                RichText::new(format!(
                                    "{} · {}",
                                    document.owner_name,
                                    document_time(&document.updated_at)
                                ))
                                .small()
                                .weak(),
                            )
                            .truncate(),
                        );
                    });
                    ui.separator();
                }
                if !found && !self.documents.is_empty() {
                    ui.label("Không tìm thấy tài liệu phù hợp.");
                }
            });
        ui.small(format!("{} tài liệu", self.documents.len()));
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.poll(ctx, session, api);
        let can_navigate = self.pending_open.is_none()
            && self.pending_create.is_none()
            && self.pending_save.is_none()
            && self.pending_comments.is_none()
            && self.pending_history.is_none()
            && self.pending_members.is_none()
            && self.pending_comment_create.is_none()
            && self.pending_comment_update.is_none()
            && self.pending_share.is_none();
        let can_edit = self
            .active_document
            .as_ref()
            .is_some_and(|doc| matches!(doc.user_role.as_str(), "owner" | "editor"))
            && !self.has_unsupported_content
            && self.pending_save.is_none()
            && self.pending_open.is_none()
            && self.pending_create.is_none();
        let can_comment =
            self.active_document.as_ref().is_some_and(|doc| {
                matches!(doc.user_role.as_str(), "owner" | "editor" | "commenter")
            }) && self.pending_open.is_none()
                && self.pending_create.is_none();
        let can_share = self
            .active_document
            .as_ref()
            .is_some_and(|doc| doc.user_role == "owner");
        let mut open_id = None;
        let mut create = false;
        let mut save = false;
        let mut post_comment = false;
        let mut comment_resolution = None;
        let mut share = false;
        let mut rich_actions = RichEditorActions::default();

        if widgets::page_header(
            ui,
            "documents",
            "Tài liệu & ghi chú",
            "Soạn thảo, bình luận và chia sẻ tài liệu",
            self.pending_load.is_none() && can_navigate && self.pending_navigation.is_none(),
        ) {
            self.needs_reload = true;
            if let Some(document) = self.active_document.as_ref() {
                self.pending_comments =
                    Some(api.list_document_comments_task(session, &document.id));
                self.pending_members = Some(api.list_document_members_task(session, &document.id));
                self.pending_history = Some(api.list_document_history_task(session, &document.id));
            }
        }

        if !self.notice.is_empty() {
            ui.add_space(6.0);
            ui.colored_label(Color32::DARK_GREEN, &self.notice);
        }
        if !self.error.is_empty() {
            ui.add_space(6.0);
            ui.colored_label(Color32::DARK_RED, &self.error);
        }
        ui.add_space(8.0);

        let compact = ui.available_width() < 760.0;
        if compact {
            egui::CollapsingHeader::new("Danh sách tài liệu và tạo mới")
                .default_open(self.active_document.is_none())
                .show(ui, |ui| {
                    self.render_list(ui, 300.0, can_navigate, &mut open_id, &mut create)
                });
        }
        let available_size = egui::vec2(
            ui.available_width(),
            (ui.clip_rect().bottom() - ui.cursor().top() - 2.0).max(240.0),
        );
        ui.horizontal_top(|ui| {
            let list_width = if compact { 0.0 } else { (available_size.x * 0.28).clamp(220.0, 310.0) };
            let editor_width = (available_size.x - list_width - if compact { 0.0 } else { ui.spacing().item_spacing.x }).max(1.0);
            if !compact {
            ui.allocate_ui_with_layout(
                egui::vec2(list_width, available_size.y),
                egui::Layout::top_down(egui::Align::Min),
                |ui| ui.group(|ui| {
                    ui.set_width((list_width - 14.0).max(1.0));
                    ui.set_min_height((available_size.y - 14.0).max(1.0));
                    self.render_list(ui, available_size.y - 14.0, can_navigate, &mut open_id, &mut create);
                }),
            );
            }

            ui.allocate_ui_with_layout(
                egui::vec2(editor_width, available_size.y),
                egui::Layout::top_down(egui::Align::Min),
                |ui| ui.group(|ui| {
                ui.set_width((editor_width - 14.0).max(1.0));
                ui.set_min_height((available_size.y - 14.0).max(1.0));
                if self.pending_open.is_some() || self.pending_create.is_some() {
                    ui.spinner();
                    ui.label("Đang mở tài liệu…");
                    return;
                }
                if self.active_document.is_none() {
                    ui.add_space(24.0);
                    ui.heading("Không gian soạn thảo");
                    ui.add(egui::Label::new("Chọn tài liệu để xem nội dung, hoặc tạo tài liệu mới.").wrap());
                    return;
                }
                let toolbar = ui.horizontal(|ui| {
                    ui.label("Tiêu đề:");
                    if ui.add_enabled(
                        can_edit,
                        egui::TextEdit::singleline(&mut self.title).hint_text("Tên tài liệu").desired_width((ui.available_width() - 82.0).max(1.0)),
                    ).changed() { self.dirty = true; }
                    if ui
                        .add_enabled(can_edit && self.dirty && !self.title.trim().is_empty(), egui::Button::new("Lưu"))
                        .on_hover_text("Ctrl+S / ⌘S để lưu tài liệu")
                        .clicked()
                    {
                        save = true;
                    }
                });
                crate::visual_test::record("documents.save-bar", toolbar.response.rect);
                #[cfg(test)]
                ctx.data_mut(|data| data.insert_temp(egui::Id::new("test.documents.save-bar"), toolbar.response.rect));
                ui.horizontal_wrapped(|ui| {
                    if self.pending_save.is_some() { ui.spinner(); ui.label("Đang lưu…"); }
                    else if self.dirty { widgets::tag(ui, "Chưa lưu", widgets::TagTone::Warning); }
                    else { ui.weak("Đã tải / lưu trên máy chủ"); }
                    ui.small(format!("{} · Phiên bản {}", document_role_label(&self.active_document.as_ref().unwrap().user_role), self.active_document.as_ref().unwrap().current_revision));
                });
                ui.separator();
                egui::ScrollArea::vertical().id_salt(("document-workspace", &self.selected_id)).max_height((ui.available_height() - 4.0).max(80.0)).auto_shrink([false, false]).show(ui, |ui| {
                ui.horizontal_wrapped(|ui| {
                    if ui.add_enabled(can_edit, egui::Button::new("H1")).on_hover_text("Thêm tiêu đề cấp 1").clicked() {
                        self.dirty = true;
                        if self.rich_draft.is_some() {
                            rich_actions.add_blocks.push(RichBlockKind::Heading(1));
                        } else {
                            self.content.push_str("\n# ");
                        }
                    }
                    if ui.add_enabled(can_edit, egui::Button::new("H2")).on_hover_text("Thêm tiêu đề cấp 2").clicked() {
                        self.dirty = true;
                        if self.rich_draft.is_some() {
                            rich_actions.add_blocks.push(RichBlockKind::Heading(2));
                        } else {
                            self.content.push_str("\n## ");
                        }
                    }
                    if ui.add_enabled(can_edit, egui::Button::new("Danh sách")).clicked() {
                        self.dirty = true;
                        if self.rich_draft.is_some() {
                            rich_actions.add_blocks.push(RichBlockKind::ListItem);
                        } else {
                            self.content.push_str("\n- ");
                        }
                    }
                    if self.rich_draft.is_some()
                        && ui.add_enabled(can_edit, egui::Button::new("+ Đoạn")).clicked()
                    {
                        rich_actions.add_blocks.push(RichBlockKind::Paragraph);
                    }
                });
                if let Some(draft) = self.rich_draft.as_mut() {
                    render_rich_document_editor(ui, draft, can_edit, &mut rich_actions);
                } else {
                    if ui.add(
                        egui::TextEdit::multiline(&mut self.content)
                            .desired_rows(12)
                            .desired_width(f32::INFINITY)
                            .font(egui::TextStyle::Monospace)
                            .hint_text("Nhập nội dung văn bản…")
                            .interactive(can_edit),
                    ).changed() { self.dirty = true; }
                }
                if self.has_unsupported_content {
                    ui.colored_label(
                        Color32::ORANGE,
                        "Tài liệu chứa nội dung nâng cao; chế độ này khóa chỉnh sửa/lưu để tránh làm mất định dạng.",
                    );
                } else if !can_edit && self.pending_save.is_none() {
                    ui.label("Bạn có quyền xem/bình luận nhưng không có quyền sửa nội dung.");
                }
                if self.rich_draft.is_none() && !self.has_unsupported_content {
                    ui.small("Văn bản cũ được chuyển thành đoạn, tiêu đề và danh sách khi lưu.");
                }

                ui.collapsing(format!("Lịch sử phiên bản ({})", self.history.len()), |ui| {
                    if self.pending_history.is_some() {
                        ui.label("Đang tải lịch sử phiên bản…");
                    } else if self.history.is_empty() {
                        ui.label("Chưa có snapshot lịch sử được lưu.");
                    } else {
                        for entry in &self.history {
                            let current = self
                                .active_document
                                .as_ref()
                                .is_some_and(|document| document.current_revision == entry.revision);
                            ui.horizontal_wrapped(|ui| {
                                ui.label(format!("Phiên bản #{}", entry.revision));
                                if current {
                                    ui.strong("Hiện tại");
                                }
                                ui.small(&entry.created_at);
                            });
                        }
                    }
                    ui.small("Lịch sử đang ở chế độ xem thông tin; khôi phục phiên bản chưa được hỗ trợ.");
                });

                ui.separator();
                ui.heading("Bình luận");
                ui.horizontal(|ui| {
                    let comment = ui.add_enabled(
                        can_comment && self.pending_comment_create.is_none(),
                        egui::TextEdit::singleline(&mut self.comment_draft)
                            .hint_text("Viết bình luận…")
                            .desired_width((ui.available_width() - 74.0).max(1.0)),
                    );
                    if ui
                        .add_enabled(
                            can_comment
                                && !self.comment_draft.trim().is_empty()
                                && self.pending_comment_create.is_none(),
                            egui::Button::new("Gửi"),
                        )
                        .clicked() || (comment.lost_focus() && ui.input(|input| input.key_pressed(egui::Key::Enter)) && can_comment && !self.comment_draft.trim().is_empty() && self.pending_comment_create.is_none())
                    {
                        post_comment = true;
                    }
                });
                ui.scope(|ui| {
                        if self.pending_comments.is_some() {
                            ui.label("Đang tải bình luận…");
                        }
                        if self.comments.is_empty() && self.pending_comments.is_none() {
                            ui.label("Chưa có bình luận.");
                        }
                        for comment in &self.comments {
                            ui.horizontal_wrapped(|ui| {
                                ui.strong(&comment.author_name);
                                ui.small(&comment.created_at);
                                let mut resolved = comment.resolved;
                                if ui
                                    .add_enabled(
                                        can_comment && self.pending_comment_update.is_none(),
                                        egui::Checkbox::new(&mut resolved, "Đã xử lý"),
                                    )
                                    .changed()
                                {
                                    comment_resolution = Some((comment.id.clone(), resolved));
                                }
                            });
                            ui.add(egui::Label::new(&comment.body).wrap());
                            ui.separator();
                        }
                    });

                ui.collapsing("Chia sẻ và thành viên", |ui| {
                    if can_share {
                        ui.horizontal_wrapped(|ui| {
                            ui.add(
                                egui::TextEdit::singleline(&mut self.share_email)
                                    .hint_text("Email tài khoản")
                                    .desired_width(220.0_f32.min(ui.available_width())),
                            );
                            widgets::combo_box("document_share_role").width(110.0)
                                .selected_text(&self.share_role)
                                .show_ui(ui, |ui| {
                                    for role in ["viewer", "commenter", "editor"] {
                                        ui.selectable_value(
                                            &mut self.share_role,
                                            role.to_owned(),
                                            role,
                                        );
                                    }
                                });
                            if ui
                                .add_enabled(
                                    !self.share_email.trim().is_empty()
                                        && self.pending_share.is_none(),
                                    egui::Button::new("Chia sẻ"),
                                )
                                .clicked()
                            {
                                share = true;
                            }
                        });
                    }
                    if self.pending_members.is_some() {
                        ui.label("Đang tải thành viên…");
                    }
                    for member in &self.members {
                        ui.add(egui::Label::new(format!("{} · {} · {}", member.name, member.email, document_role_label(&member.role))).wrap());
                    }
                    if self.members.is_empty() && self.pending_members.is_none() {
                        ui.label("Chưa chia sẻ với thành viên nào.");
                    }
                });
                });
                }),
            );
        });

        self.dirty |= rich_actions.changed
            || !rich_actions.add_blocks.is_empty()
            || !rich_actions.add_runs.is_empty()
            || !rich_actions.marks.is_empty();
        if let Some(draft) = self.rich_draft.as_mut() {
            draft.apply_actions(rich_actions);
        }

        if ctx.input_mut(|input| input.consume_key(egui::Modifiers::COMMAND, egui::Key::S))
            && can_edit
            && self.dirty
            && !self.title.trim().is_empty()
            && self.pending_navigation.is_none()
        {
            save = true;
        }
        let navigation = open_id
            .take()
            .map(DocumentNavigation::Open)
            .or_else(|| create.then_some(DocumentNavigation::Create));
        create = false;
        if let Some(navigation) = navigation {
            if let Some(navigation) = self.confirm_navigation(navigation) {
                match navigation {
                    DocumentNavigation::Open(id) => open_id = Some(id),
                    DocumentNavigation::Create => create = true,
                }
            }
        }
        if self.pending_navigation.is_some() {
            let mut discard = false;
            let mut cancel = false;
            let (_, closed) = widgets::modal(
                ctx,
                "document-unsaved",
                "Thay đổi chưa được lưu",
                420.0,
                !can_navigate,
                |ui| {
                    ui.add(egui::Label::new("Tài liệu có thay đổi chưa lưu. Tiếp tục sẽ bỏ các thay đổi này. Chọn Quay lại để lưu trước.").wrap());
                    ui.add_space(16.0);
                    ui.horizontal_wrapped(|ui| {
                        cancel = ui.button("Quay lại").clicked();
                        discard = ui.button("Bỏ thay đổi và tiếp tục").clicked();
                    });
                },
            );
            if cancel || closed {
                self.pending_navigation = None;
            } else if discard {
                match self.pending_navigation.take().unwrap() {
                    DocumentNavigation::Open(id) => open_id = Some(id),
                    DocumentNavigation::Create => create = true,
                }
            }
        }

        let navigating = open_id.is_some() || create;
        if let Some(document_id) = open_id {
            self.pending_open = Some(api.get_document_task(session, &document_id));
            self.notice = "Đang mở tài liệu…".to_owned();
            self.error.clear();
        }
        if create {
            let title = if self.new_title.trim().is_empty() {
                "Văn bản chưa đặt tên"
            } else {
                self.new_title.trim()
            };
            self.pending_create = Some(api.create_document_task(session, title));
            self.error.clear();
        }
        if save && !navigating && self.pending_navigation.is_none() {
            if let Some(document) = self.active_document.as_ref() {
                let snapshot = self.rich_draft.as_ref().map_or_else(
                    || {
                        Some(markdown_to_document(
                            &document.id,
                            &self.title,
                            document.current_revision,
                            &document.settings,
                            &self.content,
                        ))
                    },
                    |draft| draft.snapshot(&document.id, &self.title, document.current_revision),
                );
                if let Some(snapshot) = snapshot {
                    self.pending_save = Some(api.save_document_task(
                        session,
                        &document.id,
                        &self.title,
                        document.current_revision,
                        snapshot,
                    ));
                    self.notice = "Đang lưu tài liệu…".to_owned();
                    self.error.clear();
                } else {
                    self.error = "Cấu trúc bản nháp đã thay đổi ngoài bộ soạn thảo; chưa gửi dữ liệu lên máy chủ.".to_owned();
                }
            }
        }
        if post_comment {
            if let Some(document) = self.active_document.as_ref() {
                self.pending_comment_create = Some(api.create_document_comment_task(
                    session,
                    &document.id,
                    self.comment_draft.trim(),
                ));
                self.error.clear();
            }
        }
        if let Some((comment_id, resolved)) = comment_resolution {
            if let Some(document) = self.active_document.as_ref() {
                self.pending_comment_update = Some(api.update_document_comment_task(
                    session,
                    &document.id,
                    &comment_id,
                    resolved,
                ));
                self.error.clear();
            }
        }
        if share {
            if let Some(document) = self.active_document.as_ref() {
                self.pending_share = Some(api.share_document_task(
                    session,
                    &document.id,
                    self.share_email.trim(),
                    &self.share_role,
                ));
                self.error.clear();
            }
        }
    }
}

fn rich_run_texts(block: &Value) -> Option<Vec<String>> {
    let kind = block.get("type")?.as_str()?;
    if !matches!(kind, "paragraph" | "heading" | "list-item") {
        return None;
    }
    block
        .get("runs")?
        .as_array()?
        .iter()
        .map(|run| {
            run.as_object()?;
            if run.get("marks").is_some_and(|marks| !marks.is_object()) {
                return None;
            }
            Some(run.get("text")?.as_str()?.to_owned())
        })
        .collect()
}

fn document_role_label(role: &str) -> &str {
    match role {
        "owner" => "Chủ sở hữu",
        "editor" => "Chỉnh sửa",
        "commenter" => "Bình luận",
        "viewer" => "Chỉ xem",
        _ => role,
    }
}

fn document_time(value: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|date| date.format("%d/%m/%Y %H:%M %:z").to_string())
        .unwrap_or_else(|_| value.to_owned())
}

fn write_rich_run_texts(block: &mut Value, draft_runs: &[String]) -> Option<()> {
    let stored_runs = block.get_mut("runs")?.as_array_mut()?;
    if stored_runs.len() != draft_runs.len() {
        return None;
    }
    for (run, text) in stored_runs.iter_mut().zip(draft_runs) {
        run.as_object_mut()?.insert("text".to_owned(), json!(text));
    }
    Some(())
}

impl RichTableDraft {
    fn from_block(block: &Value) -> Option<Self> {
        let rows = block
            .get("rows")?
            .as_array()?
            .iter()
            .map(|row| {
                let cells = row
                    .get("cells")?
                    .as_array()?
                    .iter()
                    .map(|cell| {
                        let blocks = cell
                            .get("blocks")?
                            .as_array()?
                            .iter()
                            .map(rich_run_texts)
                            .collect::<Option<Vec<_>>>()?;
                        Some(RichTableCellDraft { blocks })
                    })
                    .collect::<Option<Vec<_>>>()?;
                Some(RichTableRowDraft { cells })
            })
            .collect::<Option<Vec<_>>>()?;
        Some(Self { rows })
    }

    fn write_into(&self, block: &mut Value) -> Option<()> {
        let rows = block.get_mut("rows")?.as_array_mut()?;
        if rows.len() != self.rows.len() {
            return None;
        }
        for (row, draft_row) in rows.iter_mut().zip(&self.rows) {
            let cells = row.get_mut("cells")?.as_array_mut()?;
            if cells.len() != draft_row.cells.len() {
                return None;
            }
            for (cell, draft_cell) in cells.iter_mut().zip(&draft_row.cells) {
                let blocks = cell.get_mut("blocks")?.as_array_mut()?;
                if blocks.len() != draft_cell.blocks.len() {
                    return None;
                }
                for (block, draft_runs) in blocks.iter_mut().zip(&draft_cell.blocks) {
                    write_rich_run_texts(block, draft_runs)?;
                }
            }
        }
        Some(())
    }
}

impl RichDocumentDraft {
    fn from_snapshot(snapshot: &Value) -> Option<Self> {
        let parsed;
        let template = if let Some(raw) = snapshot.as_str() {
            parsed = serde_json::from_str::<Value>(raw).ok()?;
            &parsed
        } else {
            snapshot
        };
        let blocks = template.get("blocks")?.as_array()?;
        let mut runs = Vec::with_capacity(blocks.len());
        let mut tables = Vec::with_capacity(blocks.len());
        for block in blocks {
            match block.get("type").and_then(Value::as_str)? {
                "paragraph" | "heading" | "list-item" => {
                    runs.push(rich_run_texts(block)?);
                    tables.push(None);
                }
                "table" => {
                    runs.push(Vec::new());
                    tables.push(Some(RichTableDraft::from_block(block)?));
                }
                _ => return None,
            }
        }
        Some(Self {
            template: template.clone(),
            runs,
            tables,
        })
    }

    fn snapshot(&self, document_id: &str, title: &str, revision: i64) -> Option<Value> {
        let mut snapshot = self.template.clone();
        let blocks = snapshot.get_mut("blocks")?.as_array_mut()?;
        if blocks.len() != self.runs.len() || blocks.len() != self.tables.len() {
            return None;
        }
        for (block_index, block) in blocks.iter_mut().enumerate() {
            if let Some(table) = self.tables[block_index].as_ref() {
                table.write_into(block)?;
            } else {
                write_rich_run_texts(block, &self.runs[block_index])?;
            }
        }
        let object = snapshot.as_object_mut()?;
        object.insert("id".to_owned(), json!(document_id));
        object.insert("title".to_owned(), json!(title));
        object.insert("revision".to_owned(), json!(revision));
        Some(snapshot)
    }

    fn set_document_metadata(&mut self, document_id: &str, title: &str, revision: i64) {
        if let Some(object) = self.template.as_object_mut() {
            object.insert("id".to_owned(), json!(document_id));
            object.insert("title".to_owned(), json!(title));
            object.insert("revision".to_owned(), json!(revision));
        }
    }

    fn run_mut(&mut self, location: RichRunLocation) -> Option<&mut Value> {
        match location {
            RichRunLocation::Block {
                block_index,
                run_index,
            } => self
                .template
                .get_mut("blocks")?
                .as_array_mut()?
                .get_mut(block_index)?
                .get_mut("runs")?
                .as_array_mut()?
                .get_mut(run_index),
            RichRunLocation::TableCell {
                table_index,
                row_index,
                cell_index,
                block_index,
                run_index,
            } => self
                .template
                .get_mut("blocks")?
                .as_array_mut()?
                .get_mut(table_index)?
                .get_mut("rows")?
                .as_array_mut()?
                .get_mut(row_index)?
                .get_mut("cells")?
                .as_array_mut()?
                .get_mut(cell_index)?
                .get_mut("blocks")?
                .as_array_mut()?
                .get_mut(block_index)?
                .get_mut("runs")?
                .as_array_mut()?
                .get_mut(run_index),
        }
    }

    fn set_mark(&mut self, location: RichRunLocation, key: &str, enabled: bool) {
        let Some(run) = self.run_mut(location) else {
            return;
        };
        if run.get("marks").is_none() {
            if let Some(object) = run.as_object_mut() {
                object.insert("marks".to_owned(), json!({}));
            }
        }
        let Some(marks) = run.get_mut("marks").and_then(Value::as_object_mut) else {
            return;
        };
        if enabled {
            marks.insert(key.to_owned(), json!(true));
        } else {
            marks.remove(key);
        }
    }

    fn add_block(&mut self, kind: RichBlockKind) {
        let block_id = self.next_id("block");
        let run_id = self.next_id("run");
        let default_style = json!({
            "alignment": "left",
            "lineHeight": 1.25,
            "spaceBefore": 0,
            "spaceAfter": 6
        });
        let style = self
            .template
            .get("blocks")
            .and_then(Value::as_array)
            .and_then(|blocks| blocks.last())
            .and_then(|block| block.get("style"))
            .filter(|style| style.is_object())
            .cloned()
            .unwrap_or(default_style);
        let block = match kind {
            RichBlockKind::Paragraph => json!({
                "id": block_id,
                "type": "paragraph",
                "style": style,
                "runs": [{"id": run_id, "text": "", "marks": {}}]
            }),
            RichBlockKind::Heading(level) => json!({
                "id": block_id,
                "type": "heading",
                "level": level.clamp(1, 6),
                "style": style,
                "runs": [{"id": run_id, "text": "", "marks": {}}]
            }),
            RichBlockKind::ListItem => json!({
                "id": block_id,
                "type": "list-item",
                "listStyle": {"listType": "bullet", "level": 0, "checked": false},
                "style": style,
                "runs": [{"id": run_id, "text": "", "marks": {}}]
            }),
        };
        if let Some(blocks) = self
            .template
            .get_mut("blocks")
            .and_then(Value::as_array_mut)
        {
            blocks.push(block);
            self.runs.push(vec![String::new()]);
            self.tables.push(None);
        }
    }

    fn add_run(&mut self, location: RichRunLocation) {
        let run_id = self.next_id("run");
        match location {
            RichRunLocation::Block { block_index, .. } => {
                let Some(runs) = self
                    .template
                    .get_mut("blocks")
                    .and_then(Value::as_array_mut)
                    .and_then(|blocks| blocks.get_mut(block_index))
                    .and_then(|block| block.get_mut("runs"))
                    .and_then(Value::as_array_mut)
                else {
                    return;
                };
                runs.push(json!({"id": run_id, "text": "", "marks": {}}));
                if let Some(draft_runs) = self.runs.get_mut(block_index) {
                    draft_runs.push(String::new());
                }
            }
            RichRunLocation::TableCell {
                table_index,
                row_index,
                cell_index,
                block_index,
                ..
            } => {
                let Some(runs) = self
                    .template
                    .get_mut("blocks")
                    .and_then(Value::as_array_mut)
                    .and_then(|blocks| blocks.get_mut(table_index))
                    .and_then(|table| table.get_mut("rows"))
                    .and_then(Value::as_array_mut)
                    .and_then(|rows| rows.get_mut(row_index))
                    .and_then(|row| row.get_mut("cells"))
                    .and_then(Value::as_array_mut)
                    .and_then(|cells| cells.get_mut(cell_index))
                    .and_then(|cell| cell.get_mut("blocks"))
                    .and_then(Value::as_array_mut)
                    .and_then(|blocks| blocks.get_mut(block_index))
                    .and_then(|block| block.get_mut("runs"))
                    .and_then(Value::as_array_mut)
                else {
                    return;
                };
                runs.push(json!({"id": run_id, "text": "", "marks": {}}));
                if let Some(draft_runs) = self
                    .tables
                    .get_mut(table_index)
                    .and_then(Option::as_mut)
                    .and_then(|table| table.rows.get_mut(row_index))
                    .and_then(|row| row.cells.get_mut(cell_index))
                    .and_then(|cell| cell.blocks.get_mut(block_index))
                {
                    draft_runs.push(String::new());
                }
            }
        }
    }

    fn apply_actions(&mut self, actions: RichEditorActions) {
        for (location, key, enabled) in actions.marks {
            self.set_mark(location, key, enabled);
        }
        for block in actions.add_blocks {
            self.add_block(block);
        }
        for block in actions.add_runs {
            self.add_run(block);
        }
    }

    fn next_id(&self, kind: &str) -> String {
        let revision = self
            .template
            .get("revision")
            .and_then(Value::as_i64)
            .unwrap_or_default();
        for sequence in 1..=u32::MAX {
            let candidate = format!("rust-{kind}-{revision}-{sequence}");
            if !json_contains_id(&self.template, &candidate) {
                return candidate;
            }
        }
        format!("rust-{kind}-{}-overflow", self.runs.len())
    }
}

fn json_contains_id(root: &Value, candidate: &str) -> bool {
    let mut pending = vec![root];
    while let Some(value) = pending.pop() {
        match value {
            Value::Object(object) => {
                if object.get("id").and_then(Value::as_str) == Some(candidate) {
                    return true;
                }
                pending.extend(object.values());
            }
            Value::Array(values) => pending.extend(values),
            _ => {}
        }
    }
    false
}

fn render_rich_document_editor(
    ui: &mut Ui,
    draft: &mut RichDocumentDraft,
    can_edit: bool,
    actions: &mut RichEditorActions,
) {
    if draft.runs.is_empty() {
        ui.label("Tài liệu chưa có đoạn văn. Dùng + Đoạn hoặc H1/H2 để thêm nội dung.");
    }
    let (template, runs, tables) = (&draft.template, &mut draft.runs, &mut draft.tables);
    ui.scope(|ui| {
        for block_index in 0..runs.len() {
            let block = template
                .get("blocks")
                .and_then(Value::as_array)
                .and_then(|blocks| blocks.get(block_index))
                .cloned()
                .unwrap_or(Value::Null);
            if let Some(table) = tables.get_mut(block_index).and_then(Option::as_mut) {
                render_rich_table_editor(ui, block_index, &block, table, can_edit, actions);
            } else if let Some(block_runs) = runs.get_mut(block_index) {
                render_rich_text_block(ui, block_index, &block, block_runs, can_edit, actions);
            }
        }
    });
}

fn render_rich_text_block(
    ui: &mut Ui,
    block_index: usize,
    block: &Value,
    runs: &mut [String],
    can_edit: bool,
    actions: &mut RichEditorActions,
) {
    let metadata_runs = block
        .get("runs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    ui.group(|ui| {
        ui.horizontal_wrapped(|ui| {
            ui.strong(rich_block_label(block));
            if ui
                .add_enabled(can_edit, egui::Button::new("+ Văn bản"))
                .clicked()
            {
                actions.add_runs.push(RichRunLocation::Block {
                    block_index,
                    run_index: runs.len(),
                });
            }
        });
        for (run_index, text) in runs.iter_mut().enumerate() {
            let metadata = metadata_runs.get(run_index).cloned().unwrap_or(Value::Null);
            render_rich_run_editor(
                ui,
                RichRunLocation::Block {
                    block_index,
                    run_index,
                },
                &metadata,
                text,
                f32::INFINITY,
                can_edit,
                actions,
            );
        }
    });
}

fn render_rich_table_editor(
    ui: &mut Ui,
    table_index: usize,
    table_metadata: &Value,
    table: &mut RichTableDraft,
    can_edit: bool,
    actions: &mut RichEditorActions,
) {
    let row_count = table.rows.len();
    let column_count = table
        .rows
        .iter()
        .map(|row| row.cells.len())
        .max()
        .unwrap_or_default();
    ui.group(|ui| {
        ui.horizontal_wrapped(|ui| {
            ui.strong(format!("Bảng · {row_count} hàng × {column_count} cột"));
            ui.label("Sửa chữ trong ô; gộp ô, kích thước và kiểu bảng được giữ nguyên.");
        });
        if table.rows.is_empty() {
            ui.label("Bảng chưa có hàng; cấu trúc nguồn được giữ nguyên.");
        }
        egui::ScrollArea::horizontal()
            .id_salt(("rich-document-table-scroll", table_index))
            .show(ui, |ui| {
                egui::Grid::new(("rich-document-table", table_index))
                    .striped(true)
                    .show(ui, |ui| {
                        for (row_index, row) in table.rows.iter_mut().enumerate() {
                            for (cell_index, cell) in row.cells.iter_mut().enumerate() {
                                let cell_metadata = table_metadata
                                    .pointer(&format!("/rows/{row_index}/cells/{cell_index}"))
                                    .cloned()
                                    .unwrap_or(Value::Null);
                                ui.group(|ui| {
                                    ui.set_width(250.0);
                                    ui.horizontal_wrapped(|ui| {
                                        ui.strong(format!(
                                            "Ô {}.{}",
                                            row_index + 1,
                                            cell_index + 1
                                        ));
                                        let col_span = cell_metadata
                                            .get("colSpan")
                                            .and_then(Value::as_u64)
                                            .unwrap_or(1);
                                        let row_span = cell_metadata
                                            .get("rowSpan")
                                            .and_then(Value::as_u64)
                                            .unwrap_or(1);
                                        if col_span > 1 || row_span > 1 {
                                            ui.small(format!("gộp {row_span}×{col_span}"));
                                        }
                                    });
                                    if cell.blocks.is_empty() {
                                        ui.label("Ô trống");
                                    }
                                    for (block_index, block_runs) in
                                        cell.blocks.iter_mut().enumerate()
                                    {
                                        let block_metadata = cell_metadata
                                            .pointer(&format!("/blocks/{block_index}"))
                                            .cloned()
                                            .unwrap_or(Value::Null);
                                        ui.small(rich_block_label(&block_metadata));
                                        let metadata_runs = block_metadata
                                            .get("runs")
                                            .and_then(Value::as_array)
                                            .cloned()
                                            .unwrap_or_default();
                                        for (run_index, text) in block_runs.iter_mut().enumerate() {
                                            let run_metadata = metadata_runs
                                                .get(run_index)
                                                .cloned()
                                                .unwrap_or(Value::Null);
                                            render_rich_run_editor(
                                                ui,
                                                RichRunLocation::TableCell {
                                                    table_index,
                                                    row_index,
                                                    cell_index,
                                                    block_index,
                                                    run_index,
                                                },
                                                &run_metadata,
                                                text,
                                                220.0,
                                                can_edit,
                                                actions,
                                            );
                                        }
                                        if ui
                                            .add_enabled(can_edit, egui::Button::new("+ Văn bản"))
                                            .clicked()
                                        {
                                            actions.add_runs.push(RichRunLocation::TableCell {
                                                table_index,
                                                row_index,
                                                cell_index,
                                                block_index,
                                                run_index: block_runs.len(),
                                            });
                                        }
                                    }
                                });
                            }
                            ui.end_row();
                        }
                    });
            });
    });
}

fn render_rich_run_editor(
    ui: &mut Ui,
    location: RichRunLocation,
    metadata: &Value,
    text: &mut String,
    desired_width: f32,
    can_edit: bool,
    actions: &mut RichEditorActions,
) {
    let marks = metadata.get("marks").cloned().unwrap_or_else(|| json!({}));
    ui.horizontal_wrapped(|ui| {
        for (key, label, description) in [
            ("bold", "B", "In đậm"),
            ("italic", "I", "In nghiêng"),
            ("underline", "U", "Gạch chân"),
            ("strike", "S", "Gạch ngang"),
        ] {
            let enabled = marks.get(key).and_then(Value::as_bool) == Some(true);
            let response = ui
                .add_enabled(can_edit, egui::SelectableLabel::new(enabled, label))
                .on_hover_text(description);
            response.widget_info(|| {
                egui::WidgetInfo::labeled(egui::WidgetType::Button, can_edit, description)
            });
            if response.clicked() {
                actions.marks.push((location, key, !enabled));
            }
        }
        if let Some(size) = marks.get("fontSize").and_then(Value::as_f64) {
            ui.small(format!("{size} pt"));
        }
        if let Some(link) = marks.get("link").and_then(Value::as_str) {
            ui.add(egui::Label::new(format!("Liên kết: {link}")).truncate())
                .on_hover_text(link);
        }
    });
    ui.add_enabled_ui(can_edit, |ui| {
        actions.changed |= ui
            .add(
                egui::TextEdit::multiline(text)
                    .desired_rows(2)
                    .desired_width(desired_width)
                    .hint_text("Nội dung đoạn chữ…"),
            )
            .changed();
    });
}

fn rich_block_label(block: &Value) -> String {
    match block
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
    {
        "heading" => format!(
            "Tiêu đề H{}",
            block
                .get("level")
                .and_then(Value::as_u64)
                .unwrap_or(1)
                .clamp(1, 6)
        ),
        "list-item" => match block
            .pointer("/listStyle/listType")
            .and_then(Value::as_str)
            .unwrap_or("bullet")
        {
            "numbered" => "Danh sách đánh số".to_owned(),
            "checklist" => "Danh sách kiểm tra".to_owned(),
            _ => "Mục danh sách".to_owned(),
        },
        _ => "Đoạn văn".to_owned(),
    }
}

fn document_to_text(snapshot: &Value) -> (String, bool) {
    let parsed;
    let snapshot = if let Some(raw) = snapshot.as_str() {
        match serde_json::from_str::<Value>(raw) {
            Ok(value) => {
                parsed = value;
                &parsed
            }
            Err(_) => return (raw.to_owned(), false),
        }
    } else {
        snapshot
    };
    let Some(blocks) = snapshot.get("blocks").and_then(Value::as_array) else {
        return (
            snapshot
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
            false,
        );
    };
    let mut lines = Vec::with_capacity(blocks.len());
    let mut unsupported = false;
    for block in blocks {
        let kind = block
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let mut text = block
            .get("runs")
            .and_then(Value::as_array)
            .map(|runs| {
                runs.iter()
                    .filter_map(|run| {
                        if run.get("marks").is_some_and(|marks| {
                            marks.as_object().is_some_and(|map| !map.is_empty())
                        }) {
                            unsupported = true;
                        }
                        run.get("text").and_then(Value::as_str)
                    })
                    .collect::<String>()
            })
            .unwrap_or_default();
        match kind {
            "heading" => {
                let level = block
                    .get("level")
                    .and_then(Value::as_u64)
                    .unwrap_or(1)
                    .clamp(1, 6) as usize;
                text = format!("{} {text}", "#".repeat(level));
            }
            "list-item" => {
                let list_type = block
                    .pointer("/listStyle/listType")
                    .and_then(Value::as_str)
                    .unwrap_or("bullet");
                text = if list_type == "numbered" {
                    format!("1. {text}")
                } else {
                    format!("- {text}")
                };
            }
            "paragraph" => {}
            _ => {
                unsupported = true;
                text = match kind {
                    "horizontal-rule" => "---".to_owned(),
                    "page-break" => "[Ngắt trang]".to_owned(),
                    "image" => format!(
                        "[Ảnh: {}]",
                        block
                            .get("alt")
                            .and_then(Value::as_str)
                            .unwrap_or("không có mô tả")
                    ),
                    "table" => "[Bảng — chỉ đọc]".to_owned(),
                    _ => format!("[Nội dung chưa hỗ trợ: {kind}]"),
                };
            }
        }
        lines.push(text);
    }
    (lines.join("\n"), unsupported)
}

fn markdown_to_document(
    id: &str,
    title: &str,
    revision: i64,
    settings: &Value,
    content: &str,
) -> Value {
    let blocks = content
        .lines()
        .enumerate()
        .map(|(index, line)| {
            let trimmed = line.trim_start();
            let heading_level = trimmed.chars().take_while(|ch| *ch == '#').count();
            let (kind, text, extra) = if (1..=6).contains(&heading_level)
                && trimmed.as_bytes().get(heading_level) == Some(&b' ')
            {
                (
                    "heading",
                    trimmed[heading_level + 1..].to_owned(),
                    json!({ "level": heading_level }),
                )
            } else if let Some(text) = trimmed.strip_prefix("- ").or_else(|| trimmed.strip_prefix("* ")) {
                (
                    "list-item",
                    text.to_owned(),
                    json!({ "listStyle": {"listType": "bullet", "level": 0, "checked": false} }),
                )
            } else {
                ("paragraph", line.to_owned(), json!({}))
            };
            let mut block = json!({
                "id": format!("rust-block-{}", index + 1),
                "type": kind,
                "style": {"alignment": "left", "lineHeight": 1.25, "spaceBefore": 0, "spaceAfter": 6},
                "runs": [{"id": format!("rust-run-{}", index + 1), "text": text, "marks": {}}]
            });
            if let (Some(target), Some(fields)) = (block.as_object_mut(), extra.as_object()) {
                target.extend(fields.clone());
            }
            block
        })
        .collect::<Vec<_>>();
    json!({
        "schemaVersion": 1,
        "id": id,
        "title": title,
        "revision": revision,
        "settings": settings,
        "blocks": blocks
    })
}

#[cfg(test)]
mod tests {
    use super::{
        DocumentEditorView, DocumentNavigation, RichBlockKind, RichDocumentDraft, RichRunLocation,
        document_to_text, markdown_to_document,
    };
    use serde_json::json;

    #[test]
    fn dirty_document_requires_confirmation_for_both_open_and_create() {
        let mut view = DocumentEditorView {
            dirty: true,
            title: "Giữ bản nháp".into(),
            ..Default::default()
        };
        assert!(
            view.confirm_navigation(DocumentNavigation::Open("next".into()))
                .is_none()
        );
        assert!(
            matches!(&view.pending_navigation, Some(DocumentNavigation::Open(id)) if id == "next")
        );
        assert!(
            view.confirm_navigation(DocumentNavigation::Create)
                .is_none()
        );
        assert!(matches!(
            view.pending_navigation,
            Some(DocumentNavigation::Create)
        ));
        assert_eq!(view.title, "Giữ bản nháp");
        view.pending_navigation = None;
        view.dirty = false;
        assert!(matches!(
            view.confirm_navigation(DocumentNavigation::Open("next".into())),
            Some(DocumentNavigation::Open(_))
        ));
        assert!(view.pending_navigation.is_none());
    }

    #[test]
    fn failed_save_keeps_the_dirty_draft_for_retry() {
        let session: crate::models::Session = serde_json::from_value(json!({
            "token": "test", "session_id": "test", "endpoint": "http://127.0.0.1:1/api/v1", "mode": "local_admin",
            "user": {"id": "user", "name": "User", "email": "user@example.test", "role": "ADMIN"}
        })).unwrap();
        let mut view = DocumentEditorView {
            loaded_for: Some(format!("{}|{}", session.user.id, session.endpoint)),
            needs_reload: false,
            dirty: true,
            title: "Giữ tiêu đề".into(),
            content: "Giữ nội dung".into(),
            pending_save: Some(std::sync::Arc::new(std::sync::Mutex::new(Some(Err(
                "Không thể lưu".into(),
            ))))),
            ..Default::default()
        };
        view.poll(
            &egui::Context::default(),
            &session,
            &crate::api::ApiClient::default(),
        );
        assert!(view.dirty);
        assert_eq!(view.title, "Giữ tiêu đề");
        assert_eq!(view.content, "Giữ nội dung");
        assert_eq!(view.error, "Không thể lưu");
        assert!(view.pending_save.is_none());
    }

    #[test]
    fn document_save_controls_stay_visible_with_a_long_document_and_wide_table() {
        for (width, height) in [
            (320.0, 640.0),
            (390.0, 844.0),
            (768.0, 640.0),
            (1280.0, 900.0),
        ] {
            let session: crate::models::Session = serde_json::from_value(json!({
                "token": "test", "session_id": "test", "endpoint": "http://127.0.0.1:1/api/v1", "mode": "local_admin",
                "user": {"id": "user", "name": "User", "email": "user@example.test", "role": "ADMIN"}
            })).unwrap();
            let document: crate::api::DocumentRecord = serde_json::from_value(json!({
                "id": "document", "title": "Tài liệu thử nghiệm", "ownerId": "user", "ownerName": "User", "currentRevision": 1, "userRole": "owner", "createdAt": "2026-10-24T00:00:00Z", "updatedAt": "2026-10-24T00:00:00Z"
            })).unwrap();
            let mut view = DocumentEditorView {
                loaded_for: Some(format!("{}|{}", session.user.id, session.endpoint)),
                needs_reload: false,
                documents: vec![document.clone(); 40],
                active_document: Some(document),
                selected_id: Some("document".into()),
                title: "Tài liệu thử nghiệm".into(),
                ..Default::default()
            };
            let mut blocks = vec![
                json!({"type": "paragraph", "runs": [{"text": "Nội dung dài cần xuống dòng ".repeat(20), "marks": {}}]});
                30
            ];
            blocks.push(json!({"type": "table", "columns": [], "rows": [{"cells": (0..6).map(|_| json!({"blocks": [{"type": "paragraph", "runs": [{"text": "Nội dung ô", "marks": {}}]}]})).collect::<Vec<_>>()}]}));
            view.load_snapshot(Some(&json!({"blocks": blocks})));
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
                                view.render(ui, ctx, &session, &crate::api::ApiClient::default());
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
            let toolbar = ctx
                .data_mut(|data| {
                    data.get_temp::<egui::Rect>(egui::Id::new("test.documents.save-bar"))
                })
                .unwrap();
            assert!(
                screen.contains_rect(toolbar),
                "{width}×{height}: {toolbar:?}"
            );
            assert!(!view.dirty);
        }
    }

    #[test]
    fn basic_legacy_blocks_round_trip_as_plain_text_without_marking_unsupported() {
        let original = json!({"blocks": [
            {"type": "heading", "level": 2, "runs": [{"text": "Tiêu đề", "marks": {}}]},
            {"type": "paragraph", "runs": [{"text": "Nội dung", "marks": {}}]},
            {"type": "list-item", "listStyle": {"listType": "bullet"}, "runs": [{"text": "Mục", "marks": {}}]}
        ]});
        let (text, unsupported) = document_to_text(&original);
        assert_eq!(text, "## Tiêu đề\nNội dung\n- Mục");
        assert!(!unsupported);
        let rebuilt = markdown_to_document("doc", "Title", 3, &json!({}), &text);
        assert_eq!(rebuilt["blocks"].as_array().unwrap().len(), 3);
        assert_eq!(rebuilt["blocks"][0]["level"], 2);
        assert_eq!(rebuilt["blocks"][2]["listStyle"]["listType"], "bullet");
    }

    #[test]
    fn supported_tables_are_editable_but_images_remain_read_only() {
        let table = json!({"blocks": [
            {"type": "table", "rows": [], "columns": []}
        ]});
        let (_, legacy_text_is_lossy) = document_to_text(&table);
        assert!(legacy_text_is_lossy);
        assert!(RichDocumentDraft::from_snapshot(&table).is_some());

        let image = json!({"blocks": [
            {"type": "paragraph", "runs": [{"text": "Đậm", "marks": {"bold": true}}]},
            {"type": "image", "src": "https://example.invalid/image.png"}
        ]});
        assert!(RichDocumentDraft::from_snapshot(&image).is_none());
    }

    #[test]
    fn rich_text_save_preserves_run_marks_block_metadata_and_document_settings() {
        let source = json!({
            "schemaVersion": 2,
            "id": "doc-1",
            "title": "Tiêu đề cũ",
            "revision": 7,
            "settings": {"pageSize": "A4", "orientation": "landscape"},
            "metadata": {"source": "legacy"},
            "customRootField": {"keep": true},
            "blocks": [
                {
                    "id": "heading-original",
                    "type": "heading",
                    "level": 2,
                    "style": {"alignment": "center", "spaceAfter": 13},
                    "customBlockField": "keep",
                    "runs": [
                        {"id": "run-bold", "text": "Xin", "marks": {"bold": true, "fontSize": 14}},
                        {"id": "run-plain", "text": " chào", "marks": {}}
                    ]
                },
                {
                    "id": "list-original",
                    "type": "list-item",
                    "listStyle": {"listType": "numbered", "level": 2, "startIndex": 4},
                    "style": {"alignment": "right"},
                    "runs": [{"id": "run-list", "text": "Giữ nguyên", "marks": {"italic": true}}]
                }
            ]
        });
        let mut draft = RichDocumentDraft::from_snapshot(&source).unwrap();
        draft.runs[0][0] = "Xin chào".to_owned();
        draft.set_mark(
            RichRunLocation::Block {
                block_index: 0,
                run_index: 1,
            },
            "underline",
            true,
        );

        let saved = draft.snapshot("doc-1", "Tiêu đề mới", 7).unwrap();
        assert_eq!(saved["title"], "Tiêu đề mới");
        assert_eq!(saved["revision"], 7);
        assert_eq!(saved["settings"], source["settings"]);
        assert_eq!(saved["metadata"], source["metadata"]);
        assert_eq!(saved["customRootField"], source["customRootField"]);
        assert_eq!(saved["blocks"][0]["id"], "heading-original");
        assert_eq!(saved["blocks"][0]["level"], 2);
        assert_eq!(saved["blocks"][0]["style"], source["blocks"][0]["style"]);
        assert_eq!(saved["blocks"][0]["customBlockField"], "keep");
        assert_eq!(saved["blocks"][0]["runs"][0]["id"], "run-bold");
        assert_eq!(saved["blocks"][0]["runs"][0]["text"], "Xin chào");
        assert_eq!(saved["blocks"][0]["runs"][0]["marks"]["bold"], true);
        assert_eq!(saved["blocks"][0]["runs"][0]["marks"]["fontSize"], 14);
        assert_eq!(saved["blocks"][0]["runs"][1]["marks"]["underline"], true);
        assert_eq!(saved["blocks"][1], source["blocks"][1]);
        assert_eq!(source["blocks"][0]["runs"][0]["text"], "Xin");
    }

    #[test]
    fn table_cell_text_and_marks_are_editable_without_changing_table_structure() {
        let source = json!({
            "schemaVersion": 1,
            "id": "doc-table",
            "revision": 4,
            "settings": {"pageSize": "A4", "orientation": "landscape"},
            "customRootField": "preserve",
            "blocks": [{
                "id": "table-original",
                "type": "table",
                "style": {"alignment": "center", "borderColor": "#333333"},
                "columns": [{"width": 90}, {"width": 150}],
                "customTableField": true,
                "rows": [
                    {
                        "id": "row-merged",
                        "height": 38,
                        "cells": [{
                            "id": "cell-merged",
                            "colSpan": 2,
                            "rowSpan": 1,
                            "style": {"backgroundColor": "#eeeeee", "paddingLeft": 8},
                            "customCellField": "preserve",
                            "blocks": [{
                                "id": "cell-paragraph",
                                "type": "paragraph",
                                "style": {"alignment": "center"},
                                "customInnerField": 7,
                                "runs": [
                                    {"id": "cell-run-bold", "text": "Tổng", "marks": {"bold": true, "foregroundColor": "#123456"}},
                                    {"id": "rust-run-4-1", "text": " cũ", "marks": {}}
                                ]
                            }]
                        }]
                    },
                    {
                        "id": "row-normal",
                        "cells": [
                            {"id": "cell-empty", "blocks": []},
                            {"id": "cell-heading", "blocks": [{
                                "id": "cell-heading-block",
                                "type": "heading",
                                "level": 3,
                                "style": {"alignment": "right"},
                                "runs": [{"id": "cell-heading-run", "text": "Mục", "marks": {"italic": true}}]
                            }]}
                        ]
                    }
                ]
            }]
        });
        let mut draft = RichDocumentDraft::from_snapshot(&source).unwrap();
        draft.tables[0].as_mut().unwrap().rows[0].cells[0].blocks[0][0] = "Tổng đã sửa".to_owned();
        draft.set_mark(
            RichRunLocation::TableCell {
                table_index: 0,
                row_index: 0,
                cell_index: 0,
                block_index: 0,
                run_index: 1,
            },
            "italic",
            true,
        );
        draft.add_run(RichRunLocation::TableCell {
            table_index: 0,
            row_index: 0,
            cell_index: 0,
            block_index: 0,
            run_index: 2,
        });
        draft.tables[0].as_mut().unwrap().rows[0].cells[0].blocks[0][2] = " mới".to_owned();

        let saved = draft.snapshot("doc-table", "Bảng đã sửa", 4).unwrap();
        let table = &saved["blocks"][0];
        let cell = &table["rows"][0]["cells"][0];
        assert_eq!(saved["settings"], source["settings"]);
        assert_eq!(saved["customRootField"], "preserve");
        assert_eq!(table["id"], "table-original");
        assert_eq!(table["columns"], source["blocks"][0]["columns"]);
        assert_eq!(table["style"], source["blocks"][0]["style"]);
        assert_eq!(table["customTableField"], true);
        assert_eq!(table["rows"][0]["id"], "row-merged");
        assert_eq!(table["rows"][0]["height"], 38);
        assert_eq!(cell["id"], "cell-merged");
        assert_eq!(cell["colSpan"], 2);
        assert_eq!(cell["rowSpan"], 1);
        assert_eq!(
            cell["style"],
            source["blocks"][0]["rows"][0]["cells"][0]["style"]
        );
        assert_eq!(cell["customCellField"], "preserve");
        assert_eq!(cell["blocks"][0]["id"], "cell-paragraph");
        assert_eq!(cell["blocks"][0]["customInnerField"], 7);
        assert_eq!(cell["blocks"][0]["runs"][0]["text"], "Tổng đã sửa");
        assert_eq!(cell["blocks"][0]["runs"][0]["marks"]["bold"], true);
        assert_eq!(
            cell["blocks"][0]["runs"][0]["marks"]["foregroundColor"],
            "#123456"
        );
        assert_eq!(cell["blocks"][0]["runs"][1]["marks"]["italic"], true);
        assert_eq!(cell["blocks"][0]["runs"][2]["text"], " mới");
        assert_ne!(cell["blocks"][0]["runs"][2]["id"], "rust-run-4-1");
        assert_ne!(cell["blocks"][0]["runs"][2]["id"], "cell-run-bold");
        assert_eq!(table["rows"][1]["cells"][0]["blocks"], json!([]));
        assert_eq!(
            table["rows"][1]["cells"][1],
            source["blocks"][0]["rows"][1]["cells"][1]
        );
        assert_eq!(
            source["blocks"][0]["rows"][0]["cells"][0]["blocks"][0]["runs"][0]["text"],
            "Tổng"
        );
    }

    #[test]
    fn table_with_unsupported_nested_content_stays_read_only() {
        let source = json!({"blocks": [{
            "type": "table",
            "rows": [{"cells": [{"blocks": [
                {"type": "image", "src": "https://example.invalid/image.png"}
            ]}]}]
        }]});
        assert!(RichDocumentDraft::from_snapshot(&source).is_none());
    }

    #[test]
    fn rich_draft_can_append_blocks_and_runs_without_rewriting_existing_ids() {
        let source = json!({
            "id": "doc-2",
            "revision": 3,
            "settings": {"pageSize": "A4"},
            "blocks": [{
                "id": "existing-block",
                "type": "paragraph",
                "style": {"alignment": "right"},
                "runs": [{"id": "existing-run", "text": "Giữ", "marks": {"bold": true}}]
            }]
        });
        let mut draft = RichDocumentDraft::from_snapshot(&source).unwrap();
        draft.add_run(RichRunLocation::Block {
            block_index: 0,
            run_index: 1,
        });
        draft.add_block(RichBlockKind::Heading(2));
        draft.add_block(RichBlockKind::ListItem);

        let saved = draft.snapshot("doc-2", "Tài liệu", 3).unwrap();
        assert_eq!(saved["blocks"][0]["id"], "existing-block");
        assert_eq!(saved["blocks"][0]["runs"][0]["id"], "existing-run");
        assert_eq!(saved["blocks"][0]["runs"][0]["marks"]["bold"], true);
        assert_eq!(saved["blocks"][0]["runs"][1]["text"], "");
        assert_ne!(saved["blocks"][0]["runs"][1]["id"], "existing-run");
        assert_eq!(saved["blocks"][1]["type"], "heading");
        assert_eq!(saved["blocks"][1]["level"], 2);
        assert_eq!(saved["blocks"][1]["runs"][0]["text"], "");
        assert_eq!(saved["blocks"][2]["type"], "list-item");
        assert_eq!(saved["settings"], source["settings"]);
    }

    #[test]
    fn rich_draft_rejects_unknown_blocks_and_malformed_runs_fail_closed() {
        assert!(
            RichDocumentDraft::from_snapshot(&json!({"blocks": [
                {"type": "paragraph", "runs": [{"text": "safe", "marks": {}}]},
                {"type": "image", "src": "https://example.invalid/image.png"}
            ]}))
            .is_none()
        );
        assert!(
            RichDocumentDraft::from_snapshot(&json!({"blocks": [
                {"type": "paragraph", "runs": [{"text": "ambiguous", "marks": null}]}
            ]}))
            .is_none()
        );
    }
}
