use crate::api::{ApiClient, ApiTask, FileListResponse, FileNode};
use crate::models::Session;
use egui::{Color32, RichText, Ui, Vec2};

pub struct FilesView {
    files: Vec<FileNode>,
    breadcrumbs: Vec<(String, String)>,
    requested_parent_id: Option<String>,
    employee_scope: Option<bool>,
    pending_list: Option<ApiTask<FileListResponse>>,
    pending_create: Option<ApiTask<FileNode>>,
    pending_rename: Option<ApiTask<FileNode>>,
    needs_reload: bool,
    new_folder_name: String,
    rename_target: Option<FileNode>,
    rename_name: String,
    rename_error: String,
    error: String,
    notice: String,
}

impl Default for FilesView {
    fn default() -> Self {
        Self {
            files: Vec::new(),
            breadcrumbs: Vec::new(),
            requested_parent_id: None,
            employee_scope: None,
            pending_list: None,
            pending_create: None,
            pending_rename: None,
            needs_reload: true,
            new_folder_name: String::new(),
            rename_target: None,
            rename_name: String::new(),
            rename_error: String::new(),
            error: String::new(),
            notice: String::new(),
        }
    }
}

impl FilesView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        employee_scope: bool,
    ) {
        if self.employee_scope != Some(employee_scope) {
            self.reset();
            self.employee_scope = Some(employee_scope);
        }
        if let Some(task) = self.pending_create.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_create = None;
                match result {
                    Ok(file) => {
                        self.new_folder_name.clear();
                        self.notice = format!("Đã tạo thư mục {}.", file.name);
                        self.error.clear();
                        self.needs_reload = true;
                    }
                    Err(error) => self.error = error,
                }
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            }
        }
        if let Some(task) = self.pending_rename.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_rename = None;
                match result {
                    Ok(file) => {
                        self.notice = format!("Đã đổi tên thành {}.", file.name);
                        self.rename_target = None;
                        self.rename_name.clear();
                        self.rename_error.clear();
                        self.error.clear();
                        self.needs_reload = true;
                    }
                    Err(error) => self.rename_error = error,
                }
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            }
        }
        if let Some(task) = self.pending_list.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_list = None;
                match result {
                    Ok(response) => {
                        if self.breadcrumbs.is_empty() {
                            self.breadcrumbs
                                .push((response.context.parent_id, response.context.root_label));
                        }
                        self.files = response.data;
                        self.error.clear();
                    }
                    Err(error) => {
                        self.files.clear();
                        self.error = error;
                    }
                }
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            }
        }
        if self.needs_reload
            && self.pending_list.is_none()
            && self.pending_create.is_none()
            && self.pending_rename.is_none()
        {
            self.pending_list = Some(api.list_files_task(
                session,
                self.requested_parent_id.as_deref(),
                employee_scope,
            ));
            self.needs_reload = false;
            ctx.request_repaint_after(std::time::Duration::from_millis(50));
        }

        let busy = self.pending_list.is_some()
            || self.pending_create.is_some()
            || self.pending_rename.is_some();
        ui.vertical(|ui| {
            ui.label(
                RichText::new("LƯU TRỮ TÀI LIỆU")
                    .size(11.0)
                    .strong()
                    .color(Color32::from_rgb(0, 150, 136)),
            );
            ui.heading("Tài liệu & Cloud Drive");
            ui.label("Thư mục và tệp được đọc trực tiếp từ máy chủ Rust.");
            ui.label("Đổi tên đã dùng API thật; tải lên, tải xuống và chia sẻ chưa được tích hợp.");
            ui.add_space(10.0);

            if !self.error.is_empty() {
                ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                if ui
                    .add_enabled(!busy, egui::Button::new("Thử lại"))
                    .clicked()
                {
                    self.error.clear();
                    self.needs_reload = true;
                }
            }
            if !self.notice.is_empty() {
                ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
            }

            ui.horizontal(|ui| {
                if ui
                    .add_enabled(
                        !busy && self.breadcrumbs.len() > 1,
                        egui::Button::new("← Thư mục cha"),
                    )
                    .clicked()
                {
                    self.breadcrumbs.pop();
                    self.requested_parent_id = if self.breadcrumbs.len() == 1 {
                        None
                    } else {
                        self.breadcrumbs.last().map(|(id, _)| id.clone())
                    };
                    self.files.clear();
                    self.error.clear();
                    self.notice.clear();
                    self.needs_reload = true;
                }
                let current_path = self
                    .breadcrumbs
                    .iter()
                    .map(|(_, name)| name.as_str())
                    .collect::<Vec<_>>()
                    .join(" / ");
                ui.label(format!("Vị trí: /{current_path}"));
                if ui
                    .add_enabled(!busy, egui::Button::new("Làm mới"))
                    .clicked()
                {
                    self.needs_reload = true;
                }
            });

            let can_create = !busy
                && !self.breadcrumbs.is_empty()
                && (employee_scope || self.breadcrumbs.len() > 1);
            ui.horizontal(|ui| {
                ui.add_enabled(
                    can_create,
                    egui::TextEdit::singleline(&mut self.new_folder_name)
                        .hint_text("Tên thư mục mới")
                        .desired_width(240.0),
                );
                if ui
                    .add_enabled(
                        can_create && !self.new_folder_name.trim().is_empty(),
                        egui::Button::new("Tạo thư mục"),
                    )
                    .clicked()
                {
                    if let Some((parent_id, _)) = self.breadcrumbs.last() {
                        self.pending_create = Some(api.create_folder_task(
                            session,
                            parent_id,
                            self.new_folder_name.trim(),
                        ));
                        self.error.clear();
                        self.notice.clear();
                    }
                }
            });
            if !employee_scope && self.breadcrumbs.len() == 1 {
                ui.label("Chọn thư mục nhân viên trước khi tạo thư mục mới.");
            }
            if busy {
                ui.label("Đang tải dữ liệu...");
            }

            ui.add_space(10.0);
            let mut navigate_to = None;
            let mut rename_to = None;
            egui::Frame::none()
                .fill(Color32::WHITE)
                .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                .rounding(8.0)
                .inner_margin(12.0)
                .show(ui, |ui| {
                    egui::ScrollArea::vertical().show(ui, |ui| {
                        egui::Grid::new("files_grid")
                            .striped(true)
                            .min_col_width(110.0)
                            .spacing(Vec2::new(16.0, 10.0))
                            .show(ui, |ui| {
                                ui.label(RichText::new("Tên").strong());
                                ui.label(RichText::new("Loại").strong());
                                ui.label(RichText::new("Dung lượng").strong());
                                ui.label(RichText::new("Cập nhật").strong());
                                ui.label(RichText::new("Thao tác").strong());
                                ui.end_row();

                                for file in &self.files {
                                    let is_directory = file.node_type == "dir";
                                    ui.label(RichText::new(&file.name).strong());
                                    ui.label(if is_directory { "Thư mục" } else { "Tệp" });
                                    ui.label(if is_directory {
                                        "—".to_string()
                                    } else {
                                        format_size(file.size_bytes)
                                    });
                                    ui.label(file.modified.get(..10).unwrap_or(&file.modified));
                                    ui.horizontal(|ui| {
                                        if is_directory
                                            && ui
                                                .add_enabled(!busy, egui::Button::new("Mở"))
                                                .clicked()
                                        {
                                            navigate_to =
                                                Some((file.id.clone(), file.name.clone()));
                                        }
                                        if !file.is_protected
                                            && ui
                                                .add_enabled(
                                                    !busy,
                                                    egui::Button::new("Đổi tên"),
                                                )
                                                .clicked()
                                        {
                                            rename_to = Some(file.clone());
                                        }
                                    });
                                    ui.end_row();
                                }
                            });
                    });
                });
            if self.files.is_empty() && !busy && self.error.is_empty() {
                ui.label("Thư mục này chưa có tệp hoặc thư mục con.");
            }
            if let Some((id, name)) = navigate_to {
                self.requested_parent_id = Some(id.clone());
                self.breadcrumbs.push((id, name));
                self.files.clear();
                self.error.clear();
                self.notice.clear();
                self.needs_reload = true;
            }
            if let Some(file) = rename_to {
                self.rename_name = file.name.clone();
                self.rename_target = Some(file);
                self.rename_error.clear();
            }
        });

        if self.rename_target.is_some() {
            let mut submit = false;
            let mut cancel = false;
            egui::Window::new("Đổi tên tệp hoặc thư mục")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
                .show(ctx, |ui| {
                    if let Some(file) = self.rename_target.as_ref() {
                        ui.label(format!("Tên hiện tại: {}", file.name));
                    }
                    ui.add(
                        egui::TextEdit::singleline(&mut self.rename_name)
                            .hint_text("Tên mới")
                            .desired_width(320.0),
                    );
                    if !self.rename_error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.rename_error);
                    }
                    ui.horizontal(|ui| {
                        submit = ui
                            .add_enabled(
                                !busy && !self.rename_name.trim().is_empty(),
                                egui::Button::new("Lưu tên mới"),
                            )
                            .clicked();
                        cancel = ui.add_enabled(!busy, egui::Button::new("Hủy")).clicked();
                    });
                });
            if cancel {
                self.rename_target = None;
                self.rename_name.clear();
                self.rename_error.clear();
            } else if submit {
                if let Some(file) = self.rename_target.as_ref() {
                    self.pending_rename = Some(api.rename_file_task(
                        session,
                        &file.id,
                        self.rename_name.trim(),
                    ));
                    self.rename_error.clear();
                    self.notice.clear();
                }
            }
        }
    }
}

fn format_size(size_bytes: i64) -> String {
    if size_bytes < 1024 {
        format!("{size_bytes} B")
    } else if size_bytes < 1024 * 1024 {
        format!("{:.1} KB", size_bytes as f64 / 1024.0)
    } else {
        format!("{:.1} MB", size_bytes as f64 / (1024.0 * 1024.0))
    }
}
