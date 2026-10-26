use std::time::Duration;
use web_time::Instant;

use crate::{
    api::{
        ApiClient, ApiTask, CreateTaskBatchInput, CreateTaskReportInput, CreateTasksResponse,
        EnterpriseTask, TaskAssignee, TaskAssigneesResponse, TaskProjectAssignees,
        TaskReportAttachment, TasksResponse, UpdateTaskInput,
    },
    file_transfer::{self, PickedFile, save_download_task},
    models::Session,
};
use egui::{Color32, RichText, Ui};

const TASK_STATUSES: &[&str] = &[
    "Chưa bắt đầu",
    "Đang thực hiện",
    "Chờ nghiệm thu",
    "Hoàn thành",
    "Tạm dừng",
];
const EMPLOYEE_STATUSES: &[&str] = &[
    "Chưa bắt đầu",
    "Đang thực hiện",
    "Chờ nghiệm thu",
    "Tạm dừng",
];
const PRIORITIES: &[&str] = &["Khẩn cấp", "Cao", "Trung bình", "Thấp"];

fn task_matches_filter(task: &EnterpriseTask, filter: &str) -> bool {
    match filter {
        "Tất cả" => true,
        "Khẩn cấp" => task.priority == "Khẩn cấp",
        _ => task.status == filter,
    }
}
fn task_summary(tasks: &[EnterpriseTask], today: &str) -> (usize, usize, usize, usize) {
    (
        tasks.len(),
        tasks
            .iter()
            .filter(|t| t.status == "Đang thực hiện")
            .count(),
        tasks
            .iter()
            .filter(|t| t.status == "Chờ nghiệm thu")
            .count(),
        tasks
            .iter()
            .filter(|t| {
                !t.due_date.is_empty() && t.due_date.as_str() < today && t.status != "Hoàn thành"
            })
            .count(),
    )
}

const MAX_TASK_BATCH_ASSIGNEES: usize = 1_000;

#[derive(Clone, Copy)]
enum TaskMutationKind {
    Generic,
    AdminEdit,
    Comment,
    Report,
}

pub struct TasksView {
    tasks: Vec<EnterpriseTask>,
    assignees: Vec<TaskAssignee>,
    project_options: Vec<TaskProjectAssignees>,
    pending_tasks: Option<ApiTask<TasksResponse>>,
    pending_assignees: Option<ApiTask<TaskAssigneesResponse>>,
    pending_detail: Option<(String, ApiTask<EnterpriseTask>)>,
    pending_create: Option<ApiTask<CreateTasksResponse>>,
    pending_mutation: Option<ApiTask<EnterpriseTask>>,
    pending_mutation_kind: Option<TaskMutationKind>,
    pending_delete: Option<ApiTask<bool>>,
    pending_file_pick: Option<(String, ApiTask<Option<PickedFile>>)>,
    pending_attachment_upload: Option<(String, ApiTask<TaskReportAttachment>)>,
    pending_attachment_delete: Option<(String, String, ApiTask<bool>)>,
    pending_attachment_download: Option<(String, TaskReportAttachment, ApiTask<Vec<u8>>)>,
    pending_file_save: Option<(String, ApiTask<bool>)>,
    draft_attachments: Vec<TaskReportAttachment>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    assignees_loaded: bool,
    needs_reload: bool,
    search: String,
    status_filter: String,
    page: usize,
    page_size: usize,
    selected_key: Option<String>,
    selected_task: Option<EnterpriseTask>,
    confirm_delete: bool,
    create_open: bool,
    edit_open: bool,
    task_title: String,
    description: String,
    project_name: String,
    assignee_ids: Vec<String>,
    priority: String,
    due_date: String,
    checklist_text: String,
    edit_task_title: String,
    edit_description: String,
    edit_project_name: String,
    edit_assignee_id: String,
    edit_priority: String,
    edit_due_date: String,
    edit_progress: i64,
    edit_status: String,
    comment: String,
    report_content: String,
    report_progress: i64,
    report_status: String,
    notice: String,
    error: String,
}

impl Default for TasksView {
    fn default() -> Self {
        Self {
            tasks: Vec::new(),
            assignees: Vec::new(),
            project_options: Vec::new(),
            pending_tasks: None,
            pending_assignees: None,
            pending_detail: None,
            pending_create: None,
            pending_mutation: None,
            pending_mutation_kind: None,
            pending_delete: None,
            pending_file_pick: None,
            pending_attachment_upload: None,
            pending_attachment_delete: None,
            pending_attachment_download: None,
            pending_file_save: None,
            draft_attachments: Vec::new(),
            loaded_for: None,
            last_loaded: None,
            assignees_loaded: false,
            needs_reload: true,
            search: String::new(),
            status_filter: "Tất cả".to_owned(),
            page: 0,
            page_size: 8,
            selected_key: None,
            selected_task: None,
            confirm_delete: false,
            create_open: false,
            edit_open: false,
            task_title: String::new(),
            description: String::new(),
            project_name: String::new(),
            assignee_ids: Vec::new(),
            priority: "Trung bình".to_owned(),
            due_date: String::new(),
            checklist_text: String::new(),
            edit_task_title: String::new(),
            edit_description: String::new(),
            edit_project_name: String::new(),
            edit_assignee_id: String::new(),
            edit_priority: "Trung bình".to_owned(),
            edit_due_date: String::new(),
            edit_progress: 0,
            edit_status: "Chưa bắt đầu".to_owned(),
            comment: String::new(),
            report_content: String::new(),
            report_progress: 0,
            report_status: "Đang thực hiện".to_owned(),
            notice: String::new(),
            error: String::new(),
        }
    }
}

impl TasksView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn clear_account_state(&mut self) {
        self.tasks.clear();
        self.assignees.clear();
        self.project_options.clear();
        self.pending_tasks = None;
        self.pending_assignees = None;
        self.pending_detail = None;
        self.pending_create = None;
        self.pending_mutation = None;
        self.pending_mutation_kind = None;
        self.pending_delete = None;
        self.pending_file_pick = None;
        self.pending_attachment_upload = None;
        self.pending_attachment_delete = None;
        self.pending_attachment_download = None;
        self.pending_file_save = None;
        self.draft_attachments.clear();
        self.last_loaded = None;
        self.assignees_loaded = false;
        self.needs_reload = true;
        self.search.clear();
        self.status_filter = "Tất cả".to_owned();
        self.page = 0;
        self.page_size = 8;
        self.selected_key = None;
        self.selected_task = None;
        self.confirm_delete = false;
        self.create_open = false;
        self.edit_open = false;
        self.task_title.clear();
        self.description.clear();
        self.project_name.clear();
        self.assignee_ids.clear();
        self.priority = "Trung bình".to_owned();
        self.due_date.clear();
        self.checklist_text.clear();
        self.edit_task_title.clear();
        self.edit_description.clear();
        self.edit_project_name.clear();
        self.edit_assignee_id.clear();
        self.edit_priority = "Trung bình".to_owned();
        self.edit_due_date.clear();
        self.comment.clear();
        self.report_content.clear();
        self.draft_attachments.clear();
        self.notice.clear();
        self.error.clear();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.clear_account_state();
            self.loaded_for = Some(session.user.id.clone());
        }
        if !self.assignees_loaded && self.pending_assignees.is_none() {
            self.pending_assignees = Some(api.list_task_assignees_task(session));
        }
        if self.needs_reload
            && self.pending_tasks.is_none()
            && self.pending_create.is_none()
            && self.pending_mutation.is_none()
            && self.pending_delete.is_none()
        {
            self.pending_tasks = Some(api.list_tasks_task(session));
            self.needs_reload = false;
            self.error.clear();
        } else if self.pending_tasks.is_none()
            && self.pending_create.is_none()
            && self.pending_mutation.is_none()
            && self.pending_delete.is_none()
            && self
                .last_loaded
                .is_none_or(|loaded| loaded.elapsed() >= Duration::from_secs(20))
        {
            self.pending_tasks = Some(api.list_tasks_task(session));
        }

        if let Some(result) = self.pending_tasks.as_ref().and_then(ApiClient::poll) {
            self.pending_tasks = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.tasks = response.data;
                    if self.selected_task.is_none() {
                        if let Some(key) = self.selected_key.as_deref() {
                            self.selected_task =
                                self.tasks.iter().find(|task| task.key == key).cloned();
                        }
                    }
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_assignees.as_ref().and_then(ApiClient::poll) {
            self.pending_assignees = None;
            match result {
                Ok(response) => {
                    self.assignees = response.data;
                    self.project_options = response.projects;
                    self.assignees_loaded = true;
                }
                Err(error) => {
                    self.error = error;
                    self.assignees_loaded = true;
                }
            }
        }
        let detail_result = self
            .pending_detail
            .as_ref()
            .and_then(|(key, task)| ApiClient::poll(task).map(|result| (key.clone(), result)));
        if let Some((key, result)) = detail_result {
            self.pending_detail = None;
            match result {
                Ok(task) if self.selected_key.as_deref() == Some(key.as_str()) => {
                    self.sync_detail_controls(&task);
                    self.selected_task = Some(task);
                    self.error.clear();
                }
                Ok(_) => {}
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_create.as_ref().and_then(ApiClient::poll) {
            self.pending_create = None;
            match result {
                Ok(response)
                    if response.count == response.tasks.len() && !response.tasks.is_empty() =>
                {
                    self.discard_draft_attachments(session, api);
                    for task in &response.tasks {
                        self.upsert_task(task.clone());
                    }
                    if let Some(task) = response.tasks.last().cloned() {
                        self.selected_key = Some(task.key.clone());
                        self.selected_task = Some(task.clone());
                        self.sync_detail_controls(&task);
                    }
                    self.draft_attachments.clear();
                    self.create_open = false;
                    self.task_title.clear();
                    self.description.clear();
                    self.project_name.clear();
                    self.assignee_ids.clear();
                    self.checklist_text.clear();
                    self.notice = format!(
                        "Đã tạo {} nhiệm vụ trên backend cho những người đã chọn.",
                        response.tasks.len()
                    );
                    self.last_loaded = Some(Instant::now());
                    self.needs_reload = true;
                    self.error.clear();
                }
                Ok(_) => {
                    self.error = "Máy chủ trả về kết quả lô nhiệm vụ không nhất quán.".to_owned()
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_mutation.as_ref().and_then(ApiClient::poll) {
            self.pending_mutation = None;
            let mutation_kind = self
                .pending_mutation_kind
                .take()
                .unwrap_or(TaskMutationKind::Generic);
            match result {
                Ok(task) => {
                    self.upsert_task(task.clone());
                    self.selected_key = Some(task.key.clone());
                    self.selected_task = Some(task.clone());
                    self.sync_detail_controls(&task);
                    match mutation_kind {
                        TaskMutationKind::Generic => {}
                        TaskMutationKind::AdminEdit => self.edit_open = false,
                        TaskMutationKind::Comment => self.comment.clear(),
                        TaskMutationKind::Report => {
                            self.report_content.clear();
                            self.draft_attachments.clear();
                        }
                    }
                    self.notice = format!("Đã cập nhật nhiệm vụ {}.", task.task_code);
                    self.last_loaded = Some(Instant::now());
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_delete.as_ref().and_then(ApiClient::poll) {
            self.pending_delete = None;
            match result {
                Ok(true) => {
                    if let Some(key) = self.selected_key.take() {
                        self.tasks.retain(|task| task.key != key);
                    }
                    self.selected_task = None;
                    self.notice = "Đã xóa nhiệm vụ trên backend.".to_owned();
                    self.last_loaded = Some(Instant::now());
                    self.error.clear();
                }
                Ok(false) => self.error = "Backend không xác nhận đã xóa nhiệm vụ.".to_owned(),
                Err(error) => self.error = error,
            }
        }
        let picked_result = self
            .pending_file_pick
            .as_ref()
            .and_then(|(_, task)| ApiClient::poll(task));
        if let Some(result) = picked_result {
            let picked_for_task = self.pending_file_pick.take().map(|(task_id, _)| task_id);
            match result {
                Ok(Some(file)) => {
                    if let Some(task_id) = picked_for_task {
                        self.pending_attachment_upload = Some((
                            task_id.clone(),
                            api.upload_task_attachment_task(session, &task_id, &file),
                        ));
                    }
                }
                Ok(None) => {}
                Err(error) => self.error = error,
            }
        }
        let uploaded_result = self
            .pending_attachment_upload
            .as_ref()
            .and_then(|(_, task)| ApiClient::poll(task));
        if let Some(result) = uploaded_result {
            let task_id = self
                .pending_attachment_upload
                .take()
                .map(|(task_id, _)| task_id);
            match result {
                Ok(attachment) if task_id.as_deref() == self.selected_key.as_deref() => {
                    self.draft_attachments.push(attachment.clone());
                    self.notice = format!("Đã tải lên tệp {}.", attachment.name);
                    self.error.clear();
                }
                Ok(attachment) => {
                    if let Some(task_id) = task_id {
                        self.pending_attachment_delete = Some((
                            task_id.clone(),
                            attachment.id.clone(),
                            api.delete_task_attachment_task(session, &task_id, &attachment.id),
                        ));
                    }
                    self.notice =
                        format!("Đã bỏ tệp {} vì bạn đã chuyển nhiệm vụ.", attachment.name);
                }
                Err(error) => self.error = error,
            }
        }
        let deleted_attachment_result = self
            .pending_attachment_delete
            .as_ref()
            .and_then(|(_, _, task)| ApiClient::poll(task));
        if let Some(result) = deleted_attachment_result {
            let pending = self.pending_attachment_delete.take();
            match (pending, result) {
                (Some((task_id, attachment_id, _)), Ok(true)) => {
                    if self.selected_key.as_deref() == Some(task_id.as_str()) {
                        self.draft_attachments
                            .retain(|item| item.id != attachment_id);
                    }
                    self.notice = "Đã bỏ tệp đính kèm chưa gửi.".to_owned();
                }
                (Some(_), Ok(false)) => {
                    self.error = "Máy chủ không xác nhận đã xóa tệp.".to_owned()
                }
                (_, Err(error)) => self.error = error,
                (None, Ok(_)) => {}
            }
        }
        let downloaded_result = self
            .pending_attachment_download
            .as_ref()
            .and_then(|(_, _, task)| ApiClient::poll(task));
        if let Some(result) = downloaded_result {
            let download = self.pending_attachment_download.take();
            match (download, result) {
                (Some((task_id, attachment, _)), Ok(bytes))
                    if self.selected_key.as_deref() == Some(task_id.as_str()) =>
                {
                    self.pending_file_save = Some((
                        attachment.name.clone(),
                        save_download_task(attachment.name, bytes),
                    ));
                }
                (Some(_), Ok(_)) => {}
                (_, Err(error)) => self.error = error,
                (None, Ok(_)) => {}
            }
        }
        let saved_result = self
            .pending_file_save
            .as_ref()
            .and_then(|(_, task)| ApiClient::poll(task));
        if let Some(result) = saved_result {
            let file_name = self
                .pending_file_save
                .take()
                .map(|(name, _)| name)
                .unwrap_or_default();
            match result {
                Ok(true) => self.notice = format!("Đã lưu tệp {file_name}."),
                Ok(false) => {}
                Err(error) => self.error = error,
            }
        }
        if self.pending_tasks.is_some()
            || self.pending_assignees.is_some()
            || self.pending_detail.is_some()
            || self.pending_create.is_some()
            || self.pending_mutation.is_some()
            || self.pending_delete.is_some()
            || self.pending_file_pick.is_some()
            || self.pending_attachment_upload.is_some()
            || self.pending_attachment_delete.is_some()
            || self.pending_attachment_download.is_some()
            || self.pending_file_save.is_some()
        {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        admin_mode: bool,
    ) {
        let admin_mode = admin_mode && session.user.role == "ADMIN";
        self.poll(ctx, session, api);
        let can_create_task = session.user.role == "ADMIN"
            || (session.user.role == "USER" && self.assignees_loaded && !self.assignees.is_empty());
        ui.add_space(8.0);
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let summary = task_summary(&self.tasks, &today);
        let unknown =
            self.tasks.is_empty() && (self.pending_tasks.is_some() || !self.error.is_empty());
        let counts = [summary.0, summary.1, summary.2, summary.3];
        let labels = [
            "Tổng nhiệm vụ",
            "Đang thực hiện",
            "Chờ nghiệm thu",
            "Đang quá hạn",
        ];
        let colors = [
            Color32::from_rgb(0, 150, 136),
            Color32::from_rgb(37, 99, 235),
            Color32::from_rgb(217, 119, 6),
            if summary.3 > 0 {
                Color32::from_rgb(220, 38, 38)
            } else {
                Color32::from_rgb(22, 163, 74)
            },
        ];
        let metrics = labels
            .iter()
            .enumerate()
            .map(|(i, label)| crate::widgets::Metric {
                label,
                value: if unknown {
                    "—".into()
                } else {
                    format!("{} nhiệm vụ", counts[i])
                },
                detail: "",
                color: colors[i],
                value_size: 23.0,
            })
            .collect::<Vec<_>>();
        crate::widgets::metrics_grid(
            ui,
            "tasks.metrics",
            &metrics,
            egui::vec2(18.0, 14.0),
            210.0,
            5.0,
        );
        ui.add_space(16.0);
        if !self.notice.is_empty() {
            ui.colored_label(Color32::DARK_GREEN, &self.notice);
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::DARK_RED, &self.error);
        }
        let tabs = [
            "Tất cả",
            "Khẩn cấp",
            "Đang thực hiện",
            "Chờ nghiệm thu",
            "Hoàn thành",
        ];
        let compact = ctx.screen_rect().width() <= 992.0;
        let width = ui.available_width();
        let gap = if compact { 8.0 } else { 6.0 };
        let widths = [58.125, 76.9375, 110.9375, 115.078125, 89.234375]
            .map(|w| if compact { w - 4.0 } else { w });
        let mut positions = Vec::new();
        let mut x = 0.0;
        let mut y = 0.0;
        for w in widths {
            if x > 0.0 && x + w > width {
                x = 0.0;
                y += 28.0 + gap;
            }
            positions.push(egui::vec2(x, y));
            x += w + gap;
        }
        let right_width = 270.0
            + 8.0
            + 91.359375
            + if can_create_task {
                8.0 + 150.484375
            } else {
                0.0
            };
        let same_row = !compact && x + 10.0 + right_width <= width;
        let right_y = if same_row {
            0.0
        } else {
            y + 28.0 + if compact { 8.0 } else { 10.0 }
        };
        let height = if same_row {
            32.0
        } else {
            right_y + if compact { 72.0 } else { 32.0 }
        };
        let (bar, _) = ui.allocate_exact_size(egui::vec2(width, height), egui::Sense::hover());
        for (i, tab) in tabs.iter().enumerate() {
            let rect = egui::Rect::from_min_size(
                bar.min + positions[i] + egui::vec2(0.0, if same_row { 2.0 } else { 0.0 }),
                egui::vec2(widths[i], 28.0),
            );
            let active = self.status_filter == *tab;
            let response = crate::widgets::put(
                ui,
                rect,
                egui::Button::new(
                    RichText::new(*tab)
                        .font(egui::FontId::new(
                            13.0,
                            egui::FontFamily::Name("legacy-controls".into()),
                        ))
                        .color(if active {
                            crate::theme::PRIMARY_ACTIVE
                        } else {
                            Color32::from_rgb(71, 85, 105)
                        }),
                )
                .fill(if active {
                    Color32::from_rgb(224, 242, 241)
                } else {
                    Color32::WHITE
                })
                .stroke(egui::Stroke::new(
                    1.0,
                    if active {
                        crate::theme::PRIMARY
                    } else {
                        Color32::from_rgb(203, 213, 225)
                    },
                )),
            );
            if response.clicked() {
                self.status_filter = (*tab).to_owned();
                self.page = 0;
            }
            response.on_hover_text("Lọc nhiệm vụ theo trạng thái.");
        }
        let menu_pos = bar.min
            + *positions.last().unwrap()
            + egui::vec2(widths[4] + gap, if same_row { 2.0 } else { 0.0 });
        let mut menu = ui.new_child(
            egui::UiBuilder::new()
                .max_rect(egui::Rect::from_min_size(menu_pos, egui::vec2(28.0, 28.0))),
        );
        menu.spacing_mut().interact_size.y = 28.0;
        menu.spacing_mut().button_padding = egui::vec2(4.0, 2.0);
        menu.menu_button("…", |ui| {
            for status in TASK_STATUSES {
                if ui
                    .selectable_value(&mut self.status_filter, (*status).to_owned(), *status)
                    .changed()
                {
                    self.page = 0;
                    ui.close_menu();
                }
            }
        });
        let rx = if same_row { width - right_width } else { 0.0 };
        let search_rect = egui::Rect::from_min_size(
            bar.min + egui::vec2(rx, right_y),
            egui::vec2(if compact { width } else { 270.0 }, 32.0),
        );
        if crate::widgets::search_input(
            ui,
            search_rect,
            &mut self.search,
            "Mã, tên việc, đơn vị, người làm...",
        )
        .changed()
        {
            self.page = 0;
        }
        let actions = if compact {
            bar.min + egui::vec2(0.0, right_y + 40.0)
        } else {
            search_rect.right_top() + egui::vec2(8.0, 0.0)
        };
        if crate::widgets::put(
            ui,
            egui::Rect::from_min_size(actions, egui::vec2(91.359375, 32.0)),
            egui::Button::image_and_text(
                egui::Image::from_bytes(
                    "bytes://task.reload.svg",
                    include_bytes!("../../assets/nav-icons/ReloadOutlined.svg"),
                )
                .fit_to_exact_size(egui::Vec2::splat(14.0)),
                "Tải lại",
            ),
        )
        .clicked()
        {
            self.needs_reload = true;
        }
        if can_create_task {
            let create = egui::Rect::from_min_size(
                actions + egui::vec2(99.359375, 0.0),
                egui::vec2(150.484375, 32.0),
            );
            if crate::widgets::put(
                ui,
                create,
                egui::Button::image_and_text(
                    egui::Image::from_bytes(
                        "bytes://task.plus.svg",
                        include_bytes!("../../assets/nav-icons/PlusOutlined.svg"),
                    )
                    .fit_to_exact_size(egui::Vec2::splat(14.0)),
                    RichText::new("Thêm nhiệm vụ").color(Color32::WHITE),
                )
                .fill(crate::theme::PRIMARY),
            )
            .clicked()
            {
                self.create_open = true;
            }
            crate::visual_test::record("tasks.add", create);
        }
        crate::visual_test::record("tasks.toolbar", bar);
        ui.add_space(12.0);
        let search = self.search.trim().to_lowercase();
        let filtered = self
            .tasks
            .iter()
            .filter(|task| {
                task_matches_filter(task, &self.status_filter)
                    && (search.is_empty()
                        || [
                            task.task_code.as_str(),
                            task.task_title.as_str(),
                            task.project_name.as_str(),
                            task.assignee.as_str(),
                        ]
                        .iter()
                        .any(|value| value.to_lowercase().contains(&search)))
            })
            .cloned()
            .collect::<Vec<_>>();
        let mut open = None;
        self.page = self
            .page
            .min(filtered.len().div_ceil(self.page_size.max(1)).max(1) - 1);
        let visible = filtered
            .iter()
            .skip(self.page * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        let available = (ui.available_width() - 2.0).max(if compact { 911.65625 } else { 1017.0 });
        let action_width = if admin_mode { 180.0 } else { 110.0 };
        let widths = [
            150.0,
            available - 605.0 - action_width,
            190.0,
            120.0,
            145.0,
            action_width,
        ];
        let titles = [
            "Mã & hạn xử lý",
            "Nhiệm vụ / đơn vị",
            "Người thực hiện",
            "Ưu tiên",
            "Tiến độ",
            "Thao tác",
        ];
        let columns = titles
            .iter()
            .enumerate()
            .map(|(i, title)| crate::widgets::TableColumn {
                title,
                width: widths[i],
            })
            .collect::<Vec<_>>();
        if self.pending_tasks.is_some() && self.tasks.is_empty() {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải nhiệm vụ…");
            });
        } else if self.error.is_empty() || !self.tasks.is_empty() {
            crate::widgets::table_with_row_height(
                ui,
                "tasks.table",
                &columns,
                visible.len(),
                64.0,
                |ui, row, col| {
                    let task = visible[row];
                    match col {
                        0 => {
                            ui.label(RichText::new(&task.task_code).color(crate::theme::PRIMARY));
                            ui.label(
                                RichText::new(format!("Hạn: {}", task.due_date))
                                    .size(12.0)
                                    .color(
                                        if task.due_date < today && task.status != "Hoàn thành" {
                                            Color32::from_rgb(220, 38, 38)
                                        } else {
                                            Color32::from_rgb(100, 116, 139)
                                        },
                                    ),
                            );
                        }
                        1 => {
                            ui.label(&task.task_title);
                            if !task.project_name.is_empty() {
                                ui.label(
                                    RichText::new(&task.project_name)
                                        .size(12.0)
                                        .color(Color32::from_rgb(37, 99, 235)),
                                );
                            }
                        }
                        2 => {
                            ui.label(&task.assignee);
                        }
                        3 => crate::widgets::tag(
                            ui,
                            &task.priority,
                            match task.priority.as_str() {
                                "Khẩn cấp" => crate::widgets::TagTone::Error,
                                "Cao" => crate::widgets::TagTone::Warning,
                                _ => crate::widgets::TagTone::Processing,
                            },
                        ),
                        4 => {
                            ui.add(
                                egui::ProgressBar::new(task.progress.clamp(0, 100) as f32 / 100.0)
                                    .desired_width(ui.available_width())
                                    .desired_height(6.0)
                                    .fill(if task.status == "Hoàn thành" {
                                        Color32::from_rgb(22, 163, 74)
                                    } else {
                                        crate::theme::PRIMARY
                                    }),
                            );
                            ui.label(RichText::new(format!("{}%", task.progress)).size(12.0));
                        }
                        _ => {
                            if ui.button("Chi tiết").clicked() {
                                open = Some(task.key.clone());
                            }
                            ui.label(
                                RichText::new(&task.status)
                                    .size(11.0)
                                    .color(task_status_color(&task.status)),
                            );
                        }
                    }
                },
            );
            ui.add_space(10.0);
            crate::widgets::pagination(
                ui,
                "tasks.pagination",
                &mut self.page,
                filtered.len(),
                &mut self.page_size,
            );
        }
        if self.create_open && can_create_task {
            let (_, closed) = crate::widgets::modal(
                ctx,
                "tasks.create",
                if session.user.role == "ADMIN" {
                    "Giao nhiệm vụ mới"
                } else {
                    "Thêm nhiệm vụ"
                },
                620.0,
                self.pending_create.is_some(),
                |ui| self.render_create(ui, ctx, session, api, session.user.role == "ADMIN"),
            );
            if closed {
                self.create_open = false;
            }
        }
        if let Some(key) = open {
            self.discard_draft_attachments(session, api);
            self.selected_key = Some(key.clone());
            self.selected_task = self.tasks.iter().find(|task| task.key == key).cloned();
            self.pending_detail = Some((key.clone(), api.get_task_task(session, &key)));
            self.error.clear();
        }
        if let Some(task) = self.selected_task.clone() {
            self.render_detail(ui, ctx, session, api, admin_mode, task);
        }
    }

    fn render_create(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        admin_mode: bool,
    ) {
        ui.scope(|ui| {
            ui.add_space(14.0);
            ui.columns(2, |cols| {
                let mut code = "Tự động tạo khi lưu".to_owned();
                cols[0].add_enabled_ui(false, |ui| {
                    crate::widgets::form_input(
                        ui,
                        "task.code",
                        "Mã nhiệm vụ",
                        false,
                        &mut code,
                        "",
                        false,
                    )
                });
                crate::widgets::form_select(
                    &mut cols[1],
                    "task.priority",
                    "Độ ưu tiên",
                    true,
                    &mut self.priority,
                    PRIORITIES,
                );
            });
            crate::widgets::form_input(
                ui,
                "task.title",
                "Tên nhiệm vụ",
                true,
                &mut self.task_title,
                "Ví dụ: Hoàn thiện báo cáo doanh thu tháng",
                false,
            );
            if admin_mode {
                crate::widgets::form_input(
                    ui,
                    "task.project",
                    "Đơn vị / dự án",
                    false,
                    &mut self.project_name,
                    "Không chọn đơn vị",
                    false,
                );
            } else {
                let previous_project = self.project_name.clone();
                crate::widgets::form_field(
                    ui,
                    "task.project",
                    "Đơn vị / dự án",
                    false,
                    |ui| {
                        crate::widgets::combo_box("task_project_scope")
                            .width(ui.available_width())
                            .selected_text(if self.project_name.is_empty() {
                                "Chưa chọn đơn vị"
                            } else {
                                &self.project_name
                            })
                            .show_ui(ui, |ui| {
                                ui.selectable_value(
                                    &mut self.project_name,
                                    String::new(),
                                    "Chưa chọn đơn vị",
                                );
                                for project in &self.project_options {
                                    ui.selectable_value(
                                        &mut self.project_name,
                                        project.name.clone(),
                                        &project.name,
                                    );
                                }
                            });
                    },
                );
                if self.project_name != previous_project {
                    retain_task_assignee_scope(
                        &mut self.assignee_ids,
                        &self.project_name,
                        &self.project_options,
                        false,
                    );
                }
            }
            let available_assignees = self
                .assignees
                .iter()
                .filter(|a| {
                    task_assignee_allowed_for_project(
                        &a.id,
                        &self.project_name,
                        &self.project_options,
                        admin_mode,
                    )
                })
                .cloned()
                .collect::<Vec<_>>();
            let selected_names = available_assignees
                .iter()
                .filter(|a| self.assignee_ids.contains(&a.id))
                .map(|a| format!("{} · {}", a.name, a.employee_code))
                .collect::<Vec<_>>();
            let selected_text = match selected_names.as_slice() {
                [] if self.pending_assignees.is_some() => "Đang tải…".to_owned(),
                [] => "Chọn một hoặc nhiều nhân viên".to_owned(),
                [name] => name.clone(),
                names => format!("{} người được chọn", names.len()),
            };
            crate::widgets::form_field(ui, "task.assignees", "Người thực hiện", true, |ui| {
                crate::widgets::combo_box("task_assignees")
                    .width(ui.available_width())
                    .selected_text(selected_text)
                    .show_ui(ui, |ui| {
                        if ui.button("Bỏ chọn tất cả").clicked() {
                            self.assignee_ids.clear();
                        }
                        for assignee in &available_assignees {
                            let mut selected = self.assignee_ids.contains(&assignee.id);
                            if ui
                                .checkbox(
                                    &mut selected,
                                    format!("{} · {}", assignee.name, assignee.employee_code),
                                )
                                .changed()
                            {
                                if selected {
                                    self.assignee_ids.push(assignee.id.clone());
                                } else {
                                    self.assignee_ids.retain(|id| id != &assignee.id);
                                }
                            }
                        }
                    });
            });
            crate::widgets::form_date(ui, "task.due", "Hạn hoàn thành", false, &mut self.due_date);
            crate::widgets::form_textarea(
                ui,
                "task.description",
                "Mô tả / kết quả cần đạt",
                false,
                &mut self.description,
                "Nêu rõ yêu cầu, tiêu chí bàn giao...",
                3,
            );
            crate::widgets::form_textarea(
                ui,
                "task.checklist",
                "Checklist — mỗi mục một dòng (tối đa 30)",
                false,
                &mut self.checklist_text,
                "",
                3,
            );
            if !self.error.is_empty() {
                ui.colored_label(Color32::DARK_RED, &self.error);
            }
            let enabled = self.pending_create.is_none()
                && !self.assignee_ids.is_empty()
                && self.assignee_ids.len() <= MAX_TASK_BATCH_ASSIGNEES;
            ui.horizontal(|ui| {
                if ui
                    .add_enabled(
                        enabled,
                        egui::Button::new(format!("Tạo {} nhiệm vụ", self.assignee_ids.len())),
                    )
                    .clicked()
                {
                    let checklist = self
                        .checklist_text
                        .lines()
                        .map(str::trim)
                        .filter(|line| !line.is_empty())
                        .map(str::to_owned)
                        .collect::<Vec<_>>();
                    if self.task_title.trim().is_empty()
                        || self.task_title.encode_utf16().count() > 500
                    {
                        self.error = "Tên nhiệm vụ phải có từ 1 đến 500 ký tự.".to_owned();
                    } else if checklist.len() > 30 {
                        self.error = "Checklist tối đa 30 hạng mục.".to_owned();
                    } else if self.assignee_ids.is_empty() {
                        self.error = "Chọn ít nhất một người thực hiện.".to_owned();
                    } else if self.assignee_ids.len() > MAX_TASK_BATCH_ASSIGNEES {
                        self.error =
                            format!("Mỗi lô tối đa {MAX_TASK_BATCH_ASSIGNEES} người thực hiện.");
                    } else {
                        self.pending_create = Some(api.create_task_batch_task(
                            session,
                            &CreateTaskBatchInput {
                                task_title: self.task_title.trim().to_owned(),
                                description: self.description.trim().to_owned(),
                                project_name: self.project_name.trim().to_owned(),
                                assignee_ids: self.assignee_ids.clone(),
                                priority: self.priority.clone(),
                                due_date: self.due_date.trim().to_owned(),
                                checklist,
                            },
                        ));
                        self.error.clear();
                    }
                }
                if ui
                    .add_enabled(self.pending_create.is_none(), egui::Button::new("Đóng"))
                    .clicked()
                {
                    self.create_open = false;
                }
                if self.pending_create.is_some() {
                    ui.spinner();
                    ui.label("Đang lưu…");
                }
            });
        });
        if self.pending_create.is_some() {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    fn render_detail(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        admin_mode: bool,
        task: EnterpriseTask,
    ) {
        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.heading(format!("{} — {}", task.task_code, task.task_title));
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if admin_mode && ui.add_enabled(self.pending_delete.is_none(), egui::Button::new("Xóa nhiệm vụ")).clicked() {
                        self.confirm_delete = true;
                    }
                    if ui.button("Đóng chi tiết").clicked() {
                        self.discard_draft_attachments(session, api);
                        self.selected_key = None;
                        self.selected_task = None;
                        self.edit_open = false;
                        self.confirm_delete = false;
                    }
                });
            });
            if self.confirm_delete {
                ui.colored_label(Color32::DARK_RED, "Xóa nhiệm vụ sẽ xóa cả checklist, bình luận và báo cáo liên quan. Không thể hoàn tác.");
                ui.horizontal(|ui| {
                    if ui.add_enabled(self.pending_delete.is_none(), egui::Button::new("Xác nhận xóa")).clicked() {
                        self.pending_delete = Some(api.delete_task_task(session, &task.key));
                        self.confirm_delete = false;
                    }
                    if ui.button("Hủy").clicked() { self.confirm_delete = false; }
                });
            }
            ui.label(format!("Đơn vị: {} · Người thực hiện: {} · Người giao: {}", task.project_name, task.assignee, task.created_by));
            ui.label(format!("Ưu tiên: {} · Hạn: {} · Trạng thái: {}", task.priority, task.due_date, task.status));
            if !task.description.is_empty() { ui.label(&task.description); }
            if admin_mode && ui.button(if self.edit_open { "Đóng phần sửa" } else { "Sửa thông tin nhiệm vụ" }).clicked() {
                self.edit_open = !self.edit_open;
                self.sync_detail_controls(&task);
            }
            if admin_mode && self.edit_open {
                egui::Frame::group(ui.style()).show(ui, |ui| {
                    ui.strong("Thông tin nhiệm vụ");
                    ui.horizontal(|ui| {
                        ui.label("Tên");
                        ui.add(egui::TextEdit::singleline(&mut self.edit_task_title).desired_width(380.0));
                        ui.label("Đơn vị/dự án");
                        ui.add(egui::TextEdit::singleline(&mut self.edit_project_name).desired_width(220.0));
                    });
                    ui.label("Mô tả");
                    ui.add(egui::TextEdit::multiline(&mut self.edit_description).desired_rows(3).desired_width(f32::INFINITY));
                    ui.horizontal(|ui| {
                        let selected = self.assignees.iter().find(|assignee| assignee.id == self.edit_assignee_id)
                            .map(|assignee| format!("{} · {}", assignee.name, assignee.employee_code))
                            .unwrap_or_else(|| "Chọn nhân viên".to_owned());
                        ui.label("Người thực hiện");
                        crate::widgets::combo_box("task_admin_edit_assignee").selected_text(selected).show_ui(ui, |ui| {
                            for assignee in &self.assignees {
                                ui.selectable_value(&mut self.edit_assignee_id, assignee.id.clone(), format!("{} · {}", assignee.name, assignee.employee_code));
                            }
                        });
                        ui.label("Ưu tiên");
                        crate::widgets::combo_box("task_admin_edit_priority").selected_text(&self.edit_priority).show_ui(ui, |ui| {
                            for priority in PRIORITIES { ui.selectable_value(&mut self.edit_priority, (*priority).to_owned(), *priority); }
                        });
                        ui.label("Hạn");
                        ui.add(egui::TextEdit::singleline(&mut self.edit_due_date).desired_width(110.0));
                    });
                    let can_save = self.pending_mutation.is_none()
                        && !self.edit_task_title.trim().is_empty()
                        && self.edit_task_title.encode_utf16().count() <= 500
                        && self.edit_description.encode_utf16().count() <= 4_000
                        && self.edit_project_name.encode_utf16().count() <= 200
                        && !self.edit_assignee_id.is_empty()
                        && self.edit_due_date.trim().len() == 10;
                    ui.horizontal(|ui| {
                        if ui.add_enabled(can_save, egui::Button::new("Lưu thay đổi")).clicked() {
                            self.pending_mutation_kind = Some(TaskMutationKind::AdminEdit);
                            self.pending_mutation = Some(api.update_task_task(session, &task.key, &UpdateTaskInput {
                                task_title: Some(self.edit_task_title.trim().to_owned()),
                                description: Some(self.edit_description.trim().to_owned()),
                                project_name: Some(self.edit_project_name.trim().to_owned()),
                                assignee_id: Some(self.edit_assignee_id.clone()),
                                priority: Some(self.edit_priority.clone()),
                                due_date: Some(self.edit_due_date.trim().to_owned()),
                                progress: Some(self.edit_progress),
                                status: Some(self.edit_status.clone()),
                            }));
                        }
                        if ui.button("Hủy").clicked() {
                            self.sync_detail_controls(&task);
                            self.edit_open = false;
                        }
                    });
                });
            }
            let can_update_progress = admin_mode || task.assignee_id == session.user.id;
            if !can_update_progress {
                ui.label("Chỉ người được giao nhiệm vụ mới có thể cập nhật tiến độ.");
            }
            ui.add_enabled_ui(can_update_progress, |ui| {
                ui.horizontal(|ui| {
                    ui.label(format!("Tiến độ {}%", self.edit_progress));
                    ui.add(egui::Slider::new(&mut self.edit_progress, 0..=100).show_value(true));
                    crate::widgets::combo_box("task_edit_status").selected_text(&self.edit_status).show_ui(ui, |ui| {
                        for status in if admin_mode { TASK_STATUSES } else { EMPLOYEE_STATUSES } {
                            ui.selectable_value(&mut self.edit_status, (*status).to_owned(), *status);
                        }
                    });
                    let changed = self.edit_progress != task.progress || self.edit_status != task.status;
                    if ui.add_enabled(changed && self.pending_mutation.is_none(), egui::Button::new("Lưu tiến độ")).clicked() {
                        self.pending_mutation_kind = Some(TaskMutationKind::Generic);
                        self.pending_mutation = Some(api.update_task_task(session, &task.key, &UpdateTaskInput {
                            progress: Some(self.edit_progress), status: Some(self.edit_status.clone()), ..UpdateTaskInput::default()
                        }));
                    }
                });
            });
            ui.separator();
            ui.strong("Checklist");
            if let Some(items) = task.subtasks.as_ref() {
                if items.is_empty() { ui.label("Checklist chưa được thiết lập."); }
                for item in items {
                    let mut completed = item.completed;
                    if ui.add_enabled(self.pending_mutation.is_none(), egui::Checkbox::new(&mut completed, &item.title)).changed() {
                        self.pending_mutation_kind = Some(TaskMutationKind::Generic);
                        self.pending_mutation = Some(api.update_task_checklist_task(session, &task.key, &item.key, Some(completed)));
                    }
                }
            }
            ui.separator();
            ui.strong("Báo cáo tiến độ");
            ui.add(egui::TextEdit::multiline(&mut self.report_content).hint_text("Nội dung báo cáo").desired_rows(2).desired_width(f32::INFINITY));
            ui.horizontal(|ui| {
                    if ui.add_enabled(
                        self.selected_key.is_some()
                            && self.pending_file_pick.is_none()
                        && self.pending_attachment_upload.is_none()
                        && self.pending_attachment_delete.is_none()
                        && self.pending_mutation.is_none()
                        && self.draft_attachments.len() < 10,
                    egui::Button::new("Đính kèm tệp…"),
                ).clicked() {
                    if let Some(task_id) = self.selected_key.clone() {
                        self.pending_file_pick = Some((task_id, file_transfer::pick_upload_file_task()));
                    }
                }
                ui.label(format!("{}/10 tệp", self.draft_attachments.len()));
                if self.pending_file_pick.is_some() || self.pending_attachment_upload.is_some() {
                    ui.spinner();
                    ui.label("Đang tải tệp lên nhiệm vụ…");
                }
            });
            let mut remove_attachment = None;
            for (index, attachment) in self.draft_attachments.iter().enumerate() {
                ui.horizontal(|ui| {
                    ui.label(format!("📎 {} · {} byte", attachment.name, attachment.size));
                    if ui.add_enabled(self.pending_attachment_delete.is_none(), egui::Button::new("Bỏ")).clicked() {
                        remove_attachment = Some((index, attachment.id.clone()));
                    }
                });
            }
            if let Some((_index, attachment_id)) = remove_attachment {
                self.pending_attachment_delete = Some((
                    task.key.clone(),
                    attachment_id.clone(),
                    api.delete_task_attachment_task(session, &task.key, &attachment_id),
                ));
            }
            ui.horizontal(|ui| {
                ui.label(format!("{}%", self.report_progress));
                ui.add(egui::Slider::new(&mut self.report_progress, 0..=100));
                crate::widgets::combo_box("task_report_status").selected_text(&self.report_status).show_ui(ui, |ui| {
                    for status in if admin_mode { TASK_STATUSES } else { EMPLOYEE_STATUSES } {
                        ui.selectable_value(&mut self.report_status, (*status).to_owned(), *status);
                    }
                });
                if ui.add_enabled(self.pending_mutation.is_none() && (!self.report_content.trim().is_empty() || !self.draft_attachments.is_empty()), egui::Button::new("Gửi báo cáo")).clicked() {
                    self.pending_mutation_kind = Some(TaskMutationKind::Report);
                    self.pending_mutation = Some(api.add_task_report_task(session, &task.key, &CreateTaskReportInput {
                        content: self.report_content.trim().to_owned(), progress: self.report_progress,
                        status: self.report_status.clone(), attachments: self.draft_attachments.clone(),
                    }));
                }
            });
            if let Some(reports) = &task.reports {
                for report in reports.iter().take(10) {
                    ui.label(format!("{} · {}% · {} · {}", report.created_at, report.progress, report.status, report.author));
                    if !report.content.is_empty() { ui.label(&report.content); }
                    for attachment in &report.attachments {
                        ui.horizontal(|ui| {
                            ui.label(format!("📎 {} · {} byte", attachment.name, attachment.size));
                            if ui.add_enabled(
                                self.pending_attachment_download.is_none() && self.pending_file_save.is_none(),
                                egui::Button::new("Tải xuống"),
                            ).clicked() {
                                self.pending_attachment_download = Some((
                                    task.key.clone(),
                                    attachment.clone(),
                                    api.download_task_attachment_task(session, &task.key, &attachment.id),
                                ));
                            }
                        });
                    }
                }
            }
            ui.separator();
            ui.strong("Trao đổi");
            ui.horizontal(|ui| {
                ui.add(egui::TextEdit::singleline(&mut self.comment).hint_text("Viết bình luận…").desired_width(420.0));
                if ui.add_enabled(self.pending_mutation.is_none() && !self.comment.trim().is_empty(), egui::Button::new("Gửi bình luận")).clicked() {
                    self.pending_mutation_kind = Some(TaskMutationKind::Comment);
                    self.pending_mutation = Some(api.add_task_comment_task(session, &task.key, self.comment.trim()));
                }
            });
            if let Some(comments) = &task.comments {
                for comment in comments.iter().take(20) {
                    ui.label(RichText::new(format!("{} · {}", comment.author, comment.created_at)).strong());
                    ui.label(&comment.content);
                }
            }
            if let Some(activities) = &task.activities {
                ui.collapsing("Nhật ký hoạt động", |ui| {
                    for activity in activities.iter().take(20) {
                        ui.label(format!("{} · {} — {}", activity.created_at, activity.actor, activity.content));
                    }
                });
            }
            if self.pending_mutation.is_some() || self.pending_delete.is_some() || self.pending_attachment_download.is_some() || self.pending_file_save.is_some() { ui.horizontal(|ui| { ui.spinner(); ui.label("Đang lưu hoặc tải tệp…"); }); }
        });
        if self.pending_detail.is_some()
            || self.pending_mutation.is_some()
            || self.pending_delete.is_some()
            || self.pending_file_pick.is_some()
            || self.pending_attachment_upload.is_some()
            || self.pending_attachment_delete.is_some()
            || self.pending_attachment_download.is_some()
            || self.pending_file_save.is_some()
        {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    fn sync_detail_controls(&mut self, task: &EnterpriseTask) {
        self.edit_task_title = task.task_title.clone();
        self.edit_description = task.description.clone();
        self.edit_project_name = task.project_name.clone();
        self.edit_assignee_id = task.assignee_id.clone();
        self.edit_priority = task.priority.clone();
        self.edit_due_date = task.due_date.clone();
        self.edit_progress = task.progress;
        self.edit_status = task.status.clone();
        self.report_progress = task.progress;
        self.report_status = if task.progress == 0 {
            "Đang thực hiện".to_owned()
        } else {
            task.status.clone()
        };
    }

    fn discard_draft_attachments(&mut self, session: &Session, api: &ApiClient) {
        if let Some(task_id) = self.selected_key.clone() {
            for attachment in self.draft_attachments.drain(..) {
                let _ = api.delete_task_attachment_task(session, &task_id, &attachment.id);
            }
        } else {
            self.draft_attachments.clear();
        }
    }

    fn upsert_task(&mut self, task: EnterpriseTask) {
        self.tasks.retain(|current| current.key != task.key);
        self.tasks.insert(0, task);
    }
}

fn task_status_color(status: &str) -> Color32 {
    match status {
        "Hoàn thành" => Color32::from_rgb(22, 163, 74),
        "Chờ nghiệm thu" => Color32::from_rgb(37, 99, 235),
        "Tạm dừng" => Color32::GRAY,
        _ => Color32::from_rgb(217, 119, 6),
    }
}

fn task_assignee_allowed_for_project(
    assignee_id: &str,
    project_name: &str,
    projects: &[TaskProjectAssignees],
    admin_mode: bool,
) -> bool {
    if admin_mode || project_name.trim().is_empty() {
        return true;
    }
    projects
        .iter()
        .find(|project| project.name == project_name)
        .is_some_and(|project| project.assignee_ids.iter().any(|id| id == assignee_id))
}

fn retain_task_assignee_scope(
    selected_assignee_ids: &mut Vec<String>,
    project_name: &str,
    projects: &[TaskProjectAssignees],
    admin_mode: bool,
) {
    if admin_mode || project_name.trim().is_empty() {
        return;
    }
    selected_assignee_ids.retain(|assignee_id| {
        task_assignee_allowed_for_project(assignee_id, project_name, projects, false)
    });
}

#[cfg(test)]
mod tests {
    #[test]
    fn urgent_filter_uses_priority_and_summary_excludes_completed_or_missing_deadlines() {
        let task = |status: &str, priority: &str, due: &str| {
            serde_json::from_value(serde_json::json!({
            "key":"1","taskCode":"T1","taskTitle":"Task","description":"","projectName":"","assigneeId":"1","assignee":"Worker","createdBy":"1","priority":priority,"dueDate":due,"progress":0,"status":status,"createdAt":"","updatedAt":""
        })).unwrap()
        };
        let tasks = vec![
            task("Đang thực hiện", "Khẩn cấp", "2026-10-23"),
            task("Chờ nghiệm thu", "Cao", "2026-10-24"),
            task("Hoàn thành", "Thấp", "2026-10-20"),
            task("Chưa bắt đầu", "Cao", ""),
        ];
        assert!(super::task_matches_filter(&tasks[0], "Khẩn cấp"));
        assert!(!super::task_matches_filter(&tasks[1], "Khẩn cấp"));
        assert!(super::task_matches_filter(&tasks[1], "Chờ nghiệm thu"));
        assert_eq!(super::task_summary(&tasks, "2026-10-24"), (4, 1, 1, 1));
    }
    use super::{
        TaskAssignee, TaskProjectAssignees, retain_task_assignee_scope,
        task_assignee_allowed_for_project,
    };

    #[test]
    fn task_form_scopes_employee_choices_to_selected_unit_and_admin_remains_global() {
        let worker = TaskAssignee {
            id: "worker-1".to_owned(),
            name: "Worker".to_owned(),
            employee_code: "EMP-1".to_owned(),
            department: "Operations".to_owned(),
            position: "Engineer".to_owned(),
            role: "USER".to_owned(),
        };
        let projects = vec![TaskProjectAssignees {
            name: "Operations".to_owned(),
            assignee_ids: vec![worker.id.clone()],
        }];
        assert!(task_assignee_allowed_for_project(
            "worker-1",
            "Operations",
            &projects,
            false
        ));
        assert!(!task_assignee_allowed_for_project(
            "manager-1",
            "Operations",
            &projects,
            false
        ));
        assert!(task_assignee_allowed_for_project(
            "manager-1",
            "Operations",
            &projects,
            true
        ));
        assert!(task_assignee_allowed_for_project(
            "manager-1",
            "",
            &projects,
            false
        ));
    }

    #[test]
    fn multi_assignee_selection_is_pruned_on_project_change_but_admin_is_unrestricted() {
        let projects = vec![TaskProjectAssignees {
            name: "Operations".to_owned(),
            assignee_ids: vec!["worker-1".to_owned()],
        }];
        let mut selected = vec!["worker-1".to_owned(), "worker-2".to_owned()];
        retain_task_assignee_scope(&mut selected, "Operations", &projects, false);
        assert_eq!(selected, vec!["worker-1"]);

        let mut admin_selected = vec!["worker-1".to_owned(), "worker-2".to_owned()];
        retain_task_assignee_scope(&mut admin_selected, "Operations", &projects, true);
        assert_eq!(admin_selected, vec!["worker-1", "worker-2"]);
    }
}
