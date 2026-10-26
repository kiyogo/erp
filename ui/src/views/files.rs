use crate::api::{ApiClient, ApiTask, FileListResponse, FileNode, FileShare};
use crate::file_transfer::{self, PickedFile};
use crate::models::Session;
use egui::{Color32, RichText, Ui, Vec2};
use std::collections::{HashSet, VecDeque};

macro_rules! file_button {
    ($label:expr,$icon:literal,$color:expr) => {
        file_button!($label, $icon, $color, 13.0)
    };
    ($label:expr,$icon:literal,$color:expr,$size:expr) => {
        egui::Button::image_and_text(
            egui::Image::from_bytes(
                concat!("bytes://", $icon, ".svg"),
                include_bytes!(concat!("../../assets/nav-icons/", $icon, ".svg")),
            )
            .fit_to_exact_size(Vec2::splat(12.0))
            .tint($color),
            RichText::new($label)
                .size($size)
                .family(egui::FontFamily::Name("legacy-controls".into())),
        )
        .frame(false)
    };
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum FileSortMode {
    #[default]
    ServerOrder,
    Name,
    Type,
    Size,
    Modified,
}

impl FileSortMode {
    fn label(self) -> &'static str {
        match self {
            Self::ServerOrder => "Mặc định",
            Self::Name => "Tên",
            Self::Type => "Loại",
            Self::Size => "Dung lượng",
            Self::Modified => "Ngày sửa",
        }
    }
}

pub struct FilesView {
    files: Vec<FileNode>,
    show_namespace_root: bool,
    show_checkboxes: bool,
    bulk_delete_selected: bool,
    new_folder_open: bool,
    selected_ids: HashSet<String>,
    loaded_for: Option<String>,
    search_query: String,
    sort_mode: FileSortMode,
    sort_ascending: bool,
    breadcrumbs: Vec<(String, String)>,
    requested_parent_id: Option<String>,
    employee_scope: Option<bool>,
    pending_list: Option<ApiTask<FileListResponse>>,
    pending_create: Option<ApiTask<FileNode>>,
    pending_rename: Option<ApiTask<FileNode>>,
    pending_delete: Option<ApiTask<bool>>,
    pending_share_lookup: Option<ApiTask<Option<FileShare>>>,
    pending_share_mutation: Option<ApiTask<FileShare>>,
    pending_pick: Option<ApiTask<Option<PickedFile>>>,
    pending_replace_pick: Option<ApiTask<Option<PickedFile>>>,
    pending_replace: Option<ApiTask<FileNode>>,
    pending_upload: Option<ApiTask<FileNode>>,
    pending_download: Option<ApiTask<Vec<u8>>>,
    pending_save: Option<ApiTask<bool>>,
    upload_candidate: Option<PickedFile>,
    upload_parent_id: Option<String>,
    upload_error: String,
    replace_target: Option<FileNode>,
    replace_candidate: Option<PickedFile>,
    replace_error: String,
    download_target: Option<FileNode>,
    saving_file_name: String,
    needs_reload: bool,
    new_folder_name: String,
    rename_target: Option<FileNode>,
    rename_name: String,
    rename_error: String,
    delete_targets: Vec<FileNode>,
    delete_queue: VecDeque<FileNode>,
    delete_current: Option<FileNode>,
    delete_total: usize,
    delete_completed: usize,
    delete_error: String,
    share_target: Option<FileNode>,
    share_data: Option<FileShare>,
    share_link: String,
    share_error: String,
    share_notice: String,
    share_pending_create: bool,
    share_pending_regenerate: bool,
    error: String,
    notice: String,
}

impl Default for FilesView {
    fn default() -> Self {
        Self {
            files: Vec::new(),
            show_namespace_root: true,
            show_checkboxes: false,
            bulk_delete_selected: false,
            new_folder_open: false,
            selected_ids: HashSet::new(),
            loaded_for: None,
            search_query: String::new(),
            sort_mode: FileSortMode::ServerOrder,
            sort_ascending: true,
            breadcrumbs: Vec::new(),
            requested_parent_id: None,
            employee_scope: None,
            pending_list: None,
            pending_create: None,
            pending_rename: None,
            pending_delete: None,
            pending_share_lookup: None,
            pending_share_mutation: None,
            pending_pick: None,
            pending_replace_pick: None,
            pending_replace: None,
            pending_upload: None,
            pending_download: None,
            pending_save: None,
            upload_candidate: None,
            upload_parent_id: None,
            upload_error: String::new(),
            replace_target: None,
            replace_candidate: None,
            replace_error: String::new(),
            download_target: None,
            saving_file_name: String::new(),
            needs_reload: true,
            new_folder_name: String::new(),
            rename_target: None,
            rename_name: String::new(),
            rename_error: String::new(),
            delete_targets: Vec::new(),
            delete_queue: VecDeque::new(),
            delete_current: None,
            delete_total: 0,
            delete_completed: 0,
            delete_error: String::new(),
            share_target: None,
            share_data: None,
            share_link: String::new(),
            share_error: String::new(),
            share_notice: String::new(),
            share_pending_create: false,
            share_pending_regenerate: false,
            error: String::new(),
            notice: String::new(),
        }
    }
}

impl FilesView {
    fn presented_files(&self, employee_scope: bool) -> Vec<FileNode> {
        if !employee_scope && self.show_namespace_root {
            // The namespace comes from the API context; unknown metadata stays blank.
            self.breadcrumbs
                .first()
                .map(|(id, name)| {
                    vec![FileNode {
                        id: id.clone(),
                        name: name.clone(),
                        node_type: "dir".to_owned(),
                        mime_type: None,
                        size_bytes: 0,
                        modified: String::new(),
                        is_protected: true,
                    }]
                })
                .unwrap_or_default()
        } else {
            self.files.clone()
        }
    }

    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn start_delete_queue(&mut self, api: &ApiClient, session: &Session) {
        self.delete_queue = self.delete_targets.iter().cloned().collect();
        self.delete_total = self.delete_queue.len();
        self.delete_completed = 0;
        self.delete_error.clear();
        self.error.clear();
        self.notice.clear();
        if let Some(next) = self.delete_queue.pop_front() {
            self.delete_current = Some(next.clone());
            self.pending_delete = Some(api.delete_file_task(session, &next.id));
        }
    }

    fn stop_delete_queue(&mut self, cause: &str) {
        let failed_name = self
            .delete_current
            .as_ref()
            .map(|file| file.name.as_str())
            .unwrap_or("mục đã chọn");
        let message = if self.delete_total == 1 {
            format!("Không thể xóa {failed_name}: {cause}")
        } else {
            format!(
                "Đã xóa {}/{} mục; dừng tại {failed_name}: {cause}. Các mục còn lại chưa được xử lý.",
                self.delete_completed, self.delete_total
            )
        };
        self.delete_error = message.clone();
        self.error = message;
        self.delete_queue.clear();
        self.delete_current = None;
        self.delete_targets.clear();
        self.selected_ids.clear();
        self.needs_reload = true;
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        employee_scope: bool,
    ) {
        if self.employee_scope != Some(employee_scope)
            || self.loaded_for.as_deref() != Some(session.user.id.as_str())
        {
            self.reset();
            self.employee_scope = Some(employee_scope);
            self.loaded_for = Some(session.user.id.clone());
        }
        if let Some(task) = self.pending_create.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_create = None;
                match result {
                    Ok(file) => {
                        self.new_folder_name.clear();
                        self.new_folder_open = false;
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
        if let Some(task) = self.pending_delete.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_delete = None;
                match result {
                    Ok(true) => {
                        self.delete_completed += 1;
                        if let Some(file) = self.delete_current.take() {
                            self.selected_ids.remove(&file.id);
                        }
                        if let Some(next) = self.delete_queue.pop_front() {
                            self.delete_current = Some(next.clone());
                            self.pending_delete = Some(api.delete_file_task(session, &next.id));
                        } else {
                            self.notice = if self.delete_total == 1 {
                                "Đã xóa mục đã chọn.".to_owned()
                            } else {
                                format!("Đã xóa {} mục.", self.delete_completed)
                            };
                            self.delete_targets.clear();
                            self.delete_current = None;
                            self.delete_error.clear();
                            self.error.clear();
                            self.needs_reload = true;
                        }
                    }
                    Ok(false) => {
                        self.stop_delete_queue("Máy chủ không xác nhận đã xóa.");
                    }
                    Err(error) => self.stop_delete_queue(&error),
                }
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            }
        }
        if let Some(task) = self.pending_share_lookup.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_share_lookup = None;
                match result {
                    Ok(Some(share)) => {
                        self.share_link = build_public_share_url(&session.endpoint, &share.url);
                        self.share_data = Some(share);
                        self.share_error.clear();
                    }
                    Ok(None) => {
                        if let Some(file) = self.share_target.as_ref() {
                            self.share_pending_create = true;
                            self.pending_share_mutation =
                                Some(api.create_file_share_task(session, &file.id, true));
                        }
                    }
                    Err(error) => self.share_error = error,
                }
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            }
        }
        if let Some(task) = self.pending_share_mutation.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_share_mutation = None;
                match result {
                    Ok(share) => {
                        self.share_link = build_public_share_url(&session.endpoint, &share.url);
                        self.share_data = Some(share);
                        self.share_notice = if self.share_pending_create {
                            "Đã tạo link chia sẻ.".to_owned()
                        } else if self.share_pending_regenerate {
                            "Đã đổi sang link chia sẻ mới.".to_owned()
                        } else {
                            "Đã cập nhật trạng thái chia sẻ.".to_owned()
                        };
                        self.share_pending_create = false;
                        self.share_pending_regenerate = false;
                        self.share_error.clear();
                    }
                    Err(error) => {
                        self.share_pending_create = false;
                        self.share_pending_regenerate = false;
                        self.share_error = error;
                    }
                }
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            }
        }
        if let Some(task) = self.pending_pick.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_pick = None;
                match result {
                    Ok(Some(file)) => {
                        self.upload_candidate = Some(file);
                        self.upload_error.clear();
                        self.error.clear();
                        self.notice.clear();
                    }
                    Ok(None) => {}
                    Err(error) => self.error = error,
                }
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            }
        }
        if let Some(task) = self.pending_replace_pick.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_replace_pick = None;
                match result {
                    Ok(Some(file)) => {
                        self.replace_candidate = Some(file);
                        self.replace_error.clear();
                    }
                    Ok(None) => {}
                    Err(error) => self.replace_error = error,
                }
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            }
        }
        if let Some(task) = self.pending_replace.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_replace = None;
                match result {
                    Ok(file) => {
                        self.notice = format!("Đã cập nhật nội dung {}.", file.name);
                        self.replace_target = None;
                        self.replace_candidate = None;
                        self.replace_error.clear();
                        self.error.clear();
                        self.needs_reload = true;
                    }
                    Err(error) => self.replace_error = error,
                }
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            }
        }
        if let Some(task) = self.pending_upload.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_upload = None;
                match result {
                    Ok(file) => {
                        self.upload_candidate = None;
                        self.upload_parent_id = None;
                        self.upload_error.clear();
                        self.notice = format!("Đã tải lên {}.", file.name);
                        self.error.clear();
                        self.needs_reload = true;
                    }
                    Err(error) => self.upload_error = error,
                }
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            }
        }
        if let Some(task) = self.pending_download.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_download = None;
                match result {
                    Ok(bytes) => {
                        if let Some(file) = self.download_target.take() {
                            self.saving_file_name = file.name.clone();
                            self.pending_save =
                                Some(file_transfer::save_download_task(file.name, bytes));
                        }
                        self.error.clear();
                    }
                    Err(error) => {
                        self.download_target = None;
                        self.error = error;
                    }
                }
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            }
        }
        if let Some(task) = self.pending_save.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_save = None;
                match result {
                    Ok(true) => {
                        self.notice = format!("Đã lưu {}.", self.saving_file_name);
                        self.error.clear();
                    }
                    Ok(false) => self.notice = "Đã hủy lưu tệp.".to_owned(),
                    Err(error) => self.error = error,
                }
                self.saving_file_name.clear();
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
                        self.selected_ids
                            .retain(|id| response.data.iter().any(|file| file.id == *id));
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
            && self.pending_delete.is_none()
            && self.pending_share_lookup.is_none()
            && self.pending_share_mutation.is_none()
            && self.pending_replace.is_none()
            && self.pending_upload.is_none()
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
            || self.pending_rename.is_some()
            || self.pending_delete.is_some()
            || self.pending_share_lookup.is_some()
            || self.pending_share_mutation.is_some()
            || self.pending_replace_pick.is_some()
            || self.pending_replace.is_some()
            || self.pending_pick.is_some()
            || self.pending_upload.is_some()
            || self.pending_download.is_some()
            || self.pending_save.is_some();
        let modal_open = self.rename_target.is_some()
            || self.upload_candidate.is_some()
            || !self.delete_targets.is_empty()
            || self.share_target.is_some()
            || self.replace_target.is_some()
            || self.new_folder_open;
        let presented_files = self.presented_files(employee_scope);
        let visible_files = filter_and_sort_files(
            &presented_files,
            &self.search_query,
            self.sort_mode,
            self.sort_ascending,
        );
        let selected_files = selected_files(&presented_files, &self.selected_ids);
        let selection_contains_protected = selected_files.iter().any(|file| file.is_protected);
        ui.vertical(|ui| {
            ui.spacing_mut().item_spacing.y=0.0;
            let can_create=!busy && !modal_open && !self.breadcrumbs.is_empty() && (employee_scope || (!self.show_namespace_root && self.breadcrumbs.len()>1));
            let mut upload=false;
            let viewport_width=ui.available_width();
            let compact=ctx.screen_rect().width()<=992.0;
            let command_width=viewport_width.max(if compact{827.765625}else{1140.0});
            let toolbar=egui::ScrollArea::horizontal().id_salt("files.commands.scroll").scroll_bar_visibility(egui::scroll_area::ScrollBarVisibility::AlwaysHidden).max_width(viewport_width).max_height(48.0).auto_shrink([false,true]).show(ui,|ui|{
                let (bar,_)=ui.allocate_exact_size(egui::vec2(command_width,48.0),egui::Sense::hover());
                let origin=bar.min+egui::vec2(if compact{8.0}else{12.0},if compact{13.0}else{10.5});
                let boxes=if compact{[(0.0,48.53125),(61.53125,46.6875),(112.21875,78.71875),(194.9375,50.015625),(257.953125,66.03125),(327.984375,49.359375),(390.34375,174.421875)]}else{[(0.0,61.25),(86.25,59.234375),(149.484375,93.9375),(247.421875,62.859375),(335.28125,80.203125),(419.484375,62.140625),(506.625,174.421875)]};
                let box_at=|index:usize|egui::Rect::from_min_size(origin+egui::vec2(boxes[index].0,0.0),egui::vec2(boxes[index].1,if compact{22.0}else{27.0}));
                let command_font=if compact{12.0}else{13.0};
                let menu=file_menu(ui,box_at(0),"files.new",file_button!("Mới","PlusOutlined",Color32::from_rgb(0,120,212),command_font),|ui|{
                    ui.add_enabled(false,file_button!("Tệp tin","FileAddOutlined",Color32::from_rgb(0,120,212))).on_hover_text("Chưa có API tạo tài liệu mới; có thể tải tệp đã có lên.");
                    if ui.add_enabled(can_create,file_button!("Thư mục","FolderAddOutlined",Color32::from_rgb(255,152,0))).clicked(){self.new_folder_name.clear();self.new_folder_open=true;ui.close_menu();}
                    if ui.add_enabled(can_create,file_button!("Tải lên","UploadOutlined",crate::theme::PRIMARY)).clicked(){upload=true;ui.close_menu();}
                });
                crate::visual_test::record("files.new",menu);
                for x in if compact{[54.53125,250.953125,383.34375]}else{[73.25,322.28125,493.625]}{let rect=egui::Rect::from_min_size(origin+egui::vec2(x,0.0),egui::vec2(1.0,if compact{22.0}else{27.0}));ui.painter().line_segment([rect.left_top(),rect.left_bottom()],egui::Stroke::new(1.0,Color32::from_rgb(234,234,234)));}
                ui.add_enabled_ui(false,|ui|{
                    crate::widgets::put(ui,box_at(1),file_button!("Cắt","ScissorOutlined",Color32::from_rgb(160,160,160),command_font)).on_hover_text("API di chuyển chưa được tích hợp");
                    crate::widgets::put(ui,box_at(2),file_button!("Sao chép","CopyOutlined",Color32::from_rgb(160,160,160),command_font)).on_hover_text("API sao chép chưa được tích hợp");
                    crate::widgets::put(ui,box_at(3),file_button!("Dán","SnippetsOutlined",Color32::from_rgb(160,160,160),command_font)).on_hover_text("Chưa có dữ liệu clipboard được máy chủ hỗ trợ");
                });
                ui.add_enabled_ui(!busy && !modal_open && selected_files.len()==1 && !selection_contains_protected,|ui|{if crate::widgets::put(ui,box_at(4),file_button!("Đổi tên","EditOutlined",Color32::from_rgb(128,128,128),command_font)).clicked(){self.rename_name=selected_files[0].name.clone();self.rename_target=Some(selected_files[0].clone());self.rename_error.clear();}});
                ui.add_enabled_ui(!busy && !modal_open && !selected_files.is_empty() && !selection_contains_protected,|ui|{if crate::widgets::put(ui,box_at(5),file_button!("Xóa","DeleteOutlined",Color32::from_rgb(209,52,56),command_font)).clicked(){self.delete_targets=selected_files.clone();self.delete_error.clear();}});
                let quota=egui::Rect::from_min_size(egui::pos2(box_at(6).left(),bar.top()+11.0),egui::vec2(boxes[6].1,26.0));
                ui.painter().rect_filled(quota,4.0,Color32::from_rgb(248,250,252));
                ui.painter().rect_stroke(quota.shrink(0.5),4.0,egui::Stroke::new(1.0,Color32::from_rgb(226,232,240)));
                ui.painter().text(quota.center(),egui::Align2::CENTER_CENTER,"Dung lượng: chưa có API",egui::FontId::proportional(12.0),Color32::from_rgb(71,85,105));
                let display=egui::Rect::from_min_size(egui::pos2(bar.right()-if compact{242.0}else{262.390625},origin.y),egui::vec2(if compact{68.6875}else{83.078125},if compact{22.0}else{27.0}));
                file_menu(ui,display,"files.display",file_button!("Hiển thị","EyeOutlined",Color32::from_rgb(0,120,212),command_font),|ui|{
                    ui.label("Sắp xếp");
                    for mode in [FileSortMode::ServerOrder,FileSortMode::Name,FileSortMode::Type,FileSortMode::Size,FileSortMode::Modified]{ui.selectable_value(&mut self.sort_mode,mode,mode.label());}
                    ui.checkbox(&mut self.sort_ascending,"Tăng dần");
                    ui.checkbox(&mut self.show_checkboxes,"Hiện ô chọn");
                    if ui.add_enabled(!busy && !modal_open,file_button!("Tải lại","ReloadOutlined",Color32::from_rgb(51,65,85))).clicked(){self.needs_reload=true;ui.close_menu();}
                });
                crate::visual_test::record("files.display",display);
                let list=egui::Rect::from_min_size(display.right_top()+egui::vec2(4.0,if compact{-3.0}else{-0.5}),egui::vec2(98.0,28.0));
                let _=crate::widgets::put(ui,list,file_button!("Danh sách","UnorderedListOutlined",Color32::from_rgb(51,65,85)).frame(true).fill(Color32::WHITE));
                ui.add_enabled_ui(false,|ui|{crate::widgets::put(ui,egui::Rect::from_min_size(list.right_top(),egui::vec2(65.0,28.0)),file_button!("Lưới","AppstoreOutlined",Color32::from_rgb(148,163,184))).on_hover_text("Chế độ lưới chưa được triển khai");});
                bar
            }).inner_rect;
            crate::visual_test::record("files.toolbar",toolbar);
            let address=egui::ScrollArea::horizontal().id_salt("files.address.scroll").scroll_bar_visibility(egui::scroll_area::ScrollBarVisibility::AlwaysHidden).max_width(viewport_width).max_height(48.0).auto_shrink([false,true]).show(ui,|ui|{
                let (bar,_)=ui.allocate_exact_size(egui::vec2(viewport_width.max(300.0),48.0),egui::Sense::hover());
                let padding=if compact{6.0}else{12.0};let gap=if compact{4.0}else{6.0};
                let back=egui::Rect::from_min_size(bar.min+egui::vec2(padding,7.5),egui::Vec2::splat(32.0));
                let can_back=self.breadcrumbs.len()>1 || (!employee_scope && !self.show_namespace_root && !self.breadcrumbs.is_empty());
                ui.add_enabled_ui(!busy && !modal_open && can_back,|ui|{if crate::widgets::put(ui,back,file_button!("","ArrowLeftOutlined",Color32::from_rgb(128,128,128))).on_hover_text("Quay lại").clicked(){
                    if !employee_scope && self.breadcrumbs.len()==1{self.show_namespace_root=true;self.selected_ids.clear();}else{self.breadcrumbs.pop();self.requested_parent_id=if self.breadcrumbs.len()==1{None}else{self.breadcrumbs.last().map(|(id,_)|id.clone())};self.files.clear();self.selected_ids.clear();self.error.clear();self.notice.clear();self.needs_reload=true;}
                }});
                let forward=back.translate(egui::vec2(32.0+gap,0.0));
                ui.add_enabled_ui(false,|ui|{crate::widgets::put(ui,forward,file_button!("","ArrowRightOutlined",Color32::from_rgb(128,128,128)));});
                let search_width=if compact{(bar.width()-198.0).max(75.0)}else{240.0};
                let search=egui::Rect::from_min_size(egui::pos2(bar.right()-padding-search_width,back.top()),egui::vec2(search_width,32.0));
                let path=egui::Rect::from_min_max(forward.right_top()+egui::vec2(gap,0.0),egui::pos2(search.left()-gap,search.bottom()));
                ui.painter().rect_filled(path,4.0,Color32::WHITE);
                ui.painter().rect_stroke(path.shrink(0.5),4.0,egui::Stroke::new(1.0,Color32::from_rgb(217,217,217)));
                egui::Image::from_bytes("bytes://files.path.folder.svg",include_bytes!("../../assets/nav-icons/FolderOutlined.svg")).tint(Color32::from_rgb(255,152,0)).paint_at(ui,egui::Rect::from_min_size(path.min+egui::vec2(9.0,9.0),egui::Vec2::splat(14.0)));
                let current_path=if !employee_scope && self.show_namespace_root{"/".to_owned()}else{format!("/{}",self.breadcrumbs.iter().map(|(_,name)|name.as_str()).collect::<Vec<_>>().join(" / "))};
                ui.painter().with_clip_rect(path.shrink2(egui::vec2(31.0,1.0)).intersect(ui.clip_rect())).text(path.left_center()+egui::vec2(35.0,0.0),egui::Align2::LEFT_CENTER,current_path,egui::FontId::proportional(13.0),Color32::from_rgb(32,32,32));
                crate::widgets::put(ui,search,egui::TextEdit::singleline(&mut self.search_query).hint_text("Tìm kiếm...").margin(egui::vec2(8.0,4.0)).font(egui::FontId::new(13.0,egui::FontFamily::Name("legacy-controls".into()))));
                ui.painter().line_segment([bar.left_bottom(),bar.right_bottom()],egui::Stroke::new(1.0,Color32::from_rgb(240,240,240)));
                bar
            }).inner_rect;
            crate::visual_test::record("files.address",address);
            if upload{self.upload_parent_id=self.breadcrumbs.last().map(|(id,_)|id.clone());self.pending_pick=Some(file_transfer::pick_upload_file_task());self.error.clear();self.notice.clear();}
            if !self.error.is_empty(){ui.colored_label(Color32::from_rgb(185,28,28),&self.error);if ui.add_enabled(!busy,egui::Button::new("Thử lại")).clicked(){self.error.clear();self.needs_reload=true;}}
            if !self.notice.is_empty(){ui.colored_label(Color32::from_rgb(22,101,52),&self.notice);}
            if !selected_files.is_empty(){ui.label(format!("Đã chọn {} / {} mục",selected_files.len(),presented_files.len()));}
            if selection_contains_protected {
                ui.colored_label(
                    Color32::from_rgb(185, 28, 28),
                    "Lựa chọn có mục hệ thống được bảo vệ; hãy bỏ chọn mục đó trước khi xóa hàng loạt.",
                );
            }
            if self.pending_pick.is_some() {
                ui.label("Đang chọn tệp...");
            } else if self.pending_replace_pick.is_some() {
                ui.label("Đang chọn nội dung thay thế...");
            } else if self.pending_replace.is_some() {
                ui.label("Đang cập nhật nội dung tệp...");
            } else if self.pending_upload.is_some() {
                ui.label("Đang tải tệp lên...");
            } else if self.pending_download.is_some() {
                ui.label("Đang tải tệp xuống...");
            } else if self.pending_save.is_some() {
                ui.label(format!("Đang lưu {}...", self.saving_file_name));
            } else if busy {
                ui.label("Đang xử lý...");
            }

            let mut navigate_to = None;
            let mut rename_to = None;
            let mut delete_to = None;
            let mut share_to = None;
            let mut replace_to = None;
            let mut download_to = None;
            let action=render_file_table(ui,&visible_files,&mut self.selected_ids,!busy && !modal_open,&mut self.sort_mode,&mut self.sort_ascending,self.show_checkboxes);
            if let Some(action)=action{match action{
                FileAction::Open(file)=>navigate_to=Some((file.id,file.name)),FileAction::Rename(file)=>rename_to=Some(file),FileAction::Delete(file)=>delete_to=Some(file),FileAction::Share(file)=>share_to=Some(file),FileAction::Replace(file)=>replace_to=Some(file),FileAction::Download(file)=>download_to=Some(file),
            }}
            let (background,context)=ui.allocate_exact_size(egui::vec2(ui.available_width(),(ui.available_height()-44.0).max(0.0)),egui::Sense::click());
            context.context_menu(|ui|{
                ui.set_min_width(104.0);
                ui.spacing_mut().interact_size.y=26.0;
                ui.spacing_mut().button_padding=egui::vec2(10.0,4.0);
                ui.spacing_mut().item_spacing.y=0.0;
                ui.add_enabled(false,file_button!("Tệp tin","FileAddOutlined",Color32::from_rgb(0,120,212))).on_hover_text("Chưa có API tạo tài liệu mới");
                if ui.add_enabled(can_create,file_button!("Thư mục","FolderAddOutlined",Color32::from_rgb(255,152,0))).clicked(){self.new_folder_name.clear();self.new_folder_open=true;ui.close_menu();}
                if ui.add_enabled(can_create,file_button!("Tải lên","UploadOutlined",crate::theme::PRIMARY)).clicked(){self.upload_parent_id=self.breadcrumbs.last().map(|(id,_)|id.clone());self.pending_pick=Some(file_transfer::pick_upload_file_task());ui.close_menu();}
                ui.separator();ui.add_enabled(false,egui::Button::new("Dán"));ui.separator();
                if ui.add_enabled(!busy && !modal_open,file_button!("Tải lại","ReloadOutlined",Color32::from_rgb(51,65,85))).clicked(){self.needs_reload=true;ui.close_menu();}
            });
            crate::visual_test::record("files.context",background);
            let (footer,_)=ui.allocate_exact_size(egui::vec2(ui.available_width(),44.0),egui::Sense::hover());
            ui.painter().line_segment([footer.left_top(),footer.right_top()],egui::Stroke::new(1.0,Color32::from_rgb(240,240,240)));
            let mut footer_ui=ui.new_child(egui::UiBuilder::new().id_salt("files.footer").max_rect(footer.shrink2(egui::vec2(16.0,8.0))).layout(egui::Layout::left_to_right(egui::Align::Center)));
            footer_ui.spacing_mut().interact_size.y=26.0;
            footer_ui.spacing_mut().button_padding=egui::vec2(10.0,2.0);
            let mut all_selected=!visible_files.is_empty() && visible_files.iter().all(|file|self.selected_ids.contains(&file.id));
            let indeterminate=!all_selected && !self.selected_ids.is_empty();
            if footer_ui.add_enabled(!busy && !modal_open,egui::Checkbox::new(&mut all_selected,"").indeterminate(indeterminate)).on_hover_text("Chọn tất cả mục đang thấy").changed(){
                if all_selected{self.selected_ids.extend(visible_files.iter().map(|f|f.id.clone()));}else{self.selected_ids.clear();}
            }
            egui::ComboBox::from_id_salt("files.bulk.action").width(140.0).selected_text(if self.bulk_delete_selected{"Xóa"}else{"Thao tác"}).show_ui(&mut footer_ui,|ui|{
                for label in ["Sao chép","Cắt","Nén"]{ui.add_enabled(false,egui::Button::new(label)).on_hover_text("Chưa có API cho thao tác này");}
                ui.selectable_value(&mut self.bulk_delete_selected,true,"Xóa");
            });
            if footer_ui.add_enabled(self.bulk_delete_selected && !busy && !modal_open && !selected_files.is_empty() && !selection_contains_protected,egui::Button::new("Thực thi")).clicked(){self.delete_targets=selected_files.clone();self.delete_error.clear();}
            crate::visual_test::record("files.footer",footer);
            if presented_files.is_empty() && !busy && self.error.is_empty() {
                ui.label("Thư mục này chưa có tệp hoặc thư mục con.");
            } else if visible_files.is_empty() && !self.search_query.trim().is_empty() {
                ui.label("Không tìm thấy mục nào khớp với từ khóa.");
            }
            if let Some((id,name))=navigate_to{
                if !employee_scope && self.show_namespace_root{self.show_namespace_root=false;self.selected_ids.clear();}else{self.requested_parent_id=Some(id.clone());self.breadcrumbs.push((id,name));self.files.clear();self.selected_ids.clear();self.error.clear();self.notice.clear();self.needs_reload=true;}
            }
            if let Some(file) = rename_to {
                self.rename_name = file.name.clone();
                self.rename_target = Some(file);
                self.rename_error.clear();
            }
            if let Some(file) = delete_to {
                self.delete_targets = vec![file];
                self.delete_error.clear();
            }
            if let Some(file) = share_to {
                self.share_target = Some(file.clone());
                self.share_data = None;
                self.share_link.clear();
                self.share_error.clear();
                self.share_notice.clear();
                self.pending_share_lookup = Some(api.get_file_share_task(session, &file.id));
            }
            if let Some(file) = replace_to {
                self.replace_target = Some(file.clone());
                self.replace_candidate = None;
                self.replace_error.clear();
                self.pending_replace_pick = Some(file_transfer::pick_upload_file_task());
            }
            if let Some(file) = download_to {
                self.download_target = Some(file.clone());
                self.pending_download = Some(api.download_file_task(session, &file.id));
                self.error.clear();
                self.notice.clear();
            }
        });

        if self.new_folder_open {
            let mut submit = false;
            let mut cancel = false;
            let (_, closed) = crate::widgets::modal(
                ctx,
                "files.folder",
                "Tạo thư mục",
                420.0,
                self.pending_create.is_some(),
                |ui| {
                    crate::widgets::form_input(
                        ui,
                        "files.folder.name",
                        "Tên thư mục",
                        true,
                        &mut self.new_folder_name,
                        "Tên thư mục mới",
                        false,
                    );
                    if !self.error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    }
                    crate::widgets::action_row(ui, |ui| {
                        submit = ui
                            .add_enabled(
                                !self.new_folder_name.trim().is_empty(),
                                egui::Button::new("Tạo thư mục"),
                            )
                            .clicked();
                        cancel = ui.button("Hủy").clicked();
                    });
                },
            );
            if self.pending_create.is_none() && (closed || cancel) {
                self.new_folder_open = false;
            }
            if submit
                && !busy
                && !self.breadcrumbs.is_empty()
                && (employee_scope || (!self.show_namespace_root && self.breadcrumbs.len() > 1))
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
        }

        if self.upload_candidate.is_some() {
            let mut submit = false;
            let mut cancel = false;
            egui::Window::new("Tải tệp lên")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
                .show(ctx, |ui| {
                    if let Some(file) = self.upload_candidate.as_ref() {
                        ui.label(format!("Tệp: {}", file.name));
                        ui.label(format!(
                            "Dung lượng: {}",
                            format_size(file.bytes.len() as i64)
                        ));
                        ui.label(format!("Loại: {}", file.mime_type));
                    }
                    ui.label("Giới hạn tối đa: 50 MB.");
                    if !self.upload_error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.upload_error);
                    }
                    ui.horizontal(|ui| {
                        submit = ui
                            .add_enabled(
                                !busy,
                                file_button!("Tải lên", "UploadOutlined", crate::theme::PRIMARY),
                            )
                            .clicked();
                        cancel = ui.add_enabled(!busy, egui::Button::new("Hủy")).clicked();
                    });
                });
            if cancel {
                self.upload_candidate = None;
                self.upload_parent_id = None;
                self.upload_error.clear();
            } else if submit {
                if let (Some(file), Some(parent_id)) = (
                    self.upload_candidate.as_ref(),
                    self.upload_parent_id.as_deref(),
                ) {
                    self.pending_upload = Some(api.upload_file_task(
                        session,
                        parent_id,
                        file,
                        if employee_scope {
                            "employee-files"
                        } else {
                            "files"
                        },
                    ));
                    self.upload_error.clear();
                    self.notice.clear();
                } else {
                    self.upload_error = "Không xác định được thư mục đích.".to_owned();
                }
            }
        }

        if self.replace_target.is_some() {
            let mut submit = false;
            let mut choose_again = false;
            let mut cancel = false;
            egui::Window::new("Thay nội dung tệp")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
                .show(ctx, |ui| {
                    if let Some(target) = self.replace_target.as_ref() {
                        ui.label(format!("Tệp trên máy chủ: {}", target.name));
                    }
                    if let Some(replacement) = self.replace_candidate.as_ref() {
                        ui.label(format!("Tệp thay thế: {}", replacement.name));
                        ui.label(format!(
                            "Dung lượng: {} · MIME: {}",
                            format_size(replacement.bytes.len() as i64),
                            replacement.mime_type
                        ));
                        ui.label("Tên tệp trên máy chủ sẽ được giữ nguyên; nội dung, MIME và dung lượng sẽ được cập nhật.");
                    } else if self.pending_replace_pick.is_some() {
                        ui.label("Đang mở hộp thoại chọn tệp...");
                    } else {
                        ui.label("Chọn tệp mới để thay toàn bộ nội dung hiện tại.");
                    }
                    ui.label("Giới hạn tối đa: 50 MB.");
                    if !self.replace_error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.replace_error);
                    }
                    ui.horizontal(|ui| {
                        if self.replace_candidate.is_some() {
                            submit = ui
                                .add_enabled(!busy, egui::Button::new("Thay nội dung"))
                                .clicked();
                            choose_again = ui
                                .add_enabled(!busy, egui::Button::new("Chọn tệp khác"))
                                .clicked();
                        } else {
                            choose_again = ui
                                .add_enabled(!busy, egui::Button::new("Chọn tệp"))
                                .clicked();
                        }
                        cancel = ui.add_enabled(!busy, egui::Button::new("Hủy")).clicked();
                    });
                });
            if cancel {
                self.replace_target = None;
                self.replace_candidate = None;
                self.replace_error.clear();
            } else if choose_again {
                self.replace_candidate = None;
                self.pending_replace_pick = Some(file_transfer::pick_upload_file_task());
                self.replace_error.clear();
            } else if submit {
                if let (Some(target), Some(replacement)) = (
                    self.replace_target.as_ref(),
                    self.replace_candidate.as_ref(),
                ) {
                    self.pending_replace =
                        Some(api.update_file_content_task(session, &target.id, replacement));
                    self.replace_error.clear();
                    self.notice.clear();
                }
            }
        }

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
                    self.pending_rename =
                        Some(api.rename_file_task(session, &file.id, self.rename_name.trim()));
                    self.rename_error.clear();
                    self.notice.clear();
                }
            }
        }

        if !self.delete_targets.is_empty() {
            let mut confirm = false;
            let mut cancel = false;
            egui::Window::new("Xác nhận xóa")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
                .show(ctx, |ui| {
                    if self.delete_targets.len() == 1 {
                        ui.label(format!("Xóa {}?", self.delete_targets[0].name));
                    } else {
                        ui.label(format!("Xóa {} mục đã chọn?", self.delete_targets.len()));
                        for file in self.delete_targets.iter().take(6) {
                            ui.label(format!("• {}", file.name));
                        }
                        if self.delete_targets.len() > 6 {
                            ui.label(format!("… và {} mục khác", self.delete_targets.len() - 6));
                        }
                    }
                    ui.label("Mục sẽ bị ẩn khỏi danh sách. Nội dung lưu trữ được giữ lại trên máy chủ; hiện chưa có chức năng khôi phục trong giao diện.");
                    if self.pending_delete.is_some() {
                        ui.label(format!(
                            "Đang xóa lần lượt: {}/{} mục đã hoàn tất.",
                            self.delete_completed, self.delete_total
                        ));
                    }
                    if !self.delete_error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.delete_error);
                    }
                    ui.horizontal(|ui| {
                        confirm = ui
                            .add_enabled(
                                !busy,
                                egui::Button::new(if self.delete_targets.len() == 1 {
                                    "Xóa mục này".to_owned()
                                } else {
                                    format!("Xóa {} mục", self.delete_targets.len())
                                }),
                            )
                            .clicked();
                        cancel = ui.add_enabled(!busy, egui::Button::new("Hủy")).clicked();
                    });
                });
            if cancel {
                self.delete_targets.clear();
                self.delete_queue.clear();
                self.delete_current = None;
                self.delete_error.clear();
            } else if confirm {
                self.start_delete_queue(api, session);
            }
        }

        if self.share_target.is_some() {
            let mut copy_link = false;
            let mut toggle_active = false;
            let mut regenerate = false;
            let mut retry = false;
            let mut close = false;
            egui::Window::new("Chia sẻ tệp công khai")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, Vec2::ZERO)
                .show(ctx, |ui| {
                    if let Some(file) = self.share_target.as_ref() {
                        ui.label(format!("Tệp: {}", file.name));
                    }
                    if self.pending_share_lookup.is_some() || self.pending_share_mutation.is_some()
                    {
                        ui.label("Đang tải trạng thái chia sẻ...");
                    }
                    if let Some(share) = self.share_data.as_ref() {
                        ui.label(if share.is_active {
                            "Bất kỳ ai có liên kết đều có thể xem và tải tệp này."
                        } else {
                            "Liên kết đã tắt; người ngoài không thể truy cập tệp."
                        });
                        ui.add(
                            egui::TextEdit::singleline(&mut self.share_link)
                                .desired_width(440.0)
                                .interactive(false),
                        );
                        ui.horizontal(|ui| {
                            copy_link = ui
                                .add_enabled(
                                    !busy && share.is_active && !self.share_link.is_empty(),
                                    egui::Button::new("Sao chép link"),
                                )
                                .clicked();
                            toggle_active = ui
                                .add_enabled(
                                    !busy,
                                    egui::Button::new(if share.is_active {
                                        "Tắt link"
                                    } else {
                                        "Bật link"
                                    }),
                                )
                                .clicked();
                            regenerate = ui
                                .add_enabled(!busy, egui::Button::new("Đổi link mới"))
                                .clicked();
                        });
                    }
                    if !self.share_error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.share_error);
                        retry = ui
                            .add_enabled(!busy, egui::Button::new("Thử lại"))
                            .clicked();
                    }
                    if !self.share_notice.is_empty() {
                        ui.colored_label(Color32::from_rgb(22, 101, 52), &self.share_notice);
                    }
                    close = ui.add_enabled(!busy, egui::Button::new("Đóng")).clicked();
                });
            if close {
                self.share_target = None;
                self.share_data = None;
                self.share_link.clear();
            } else if retry {
                if let Some(file) = self.share_target.as_ref() {
                    self.pending_share_lookup = Some(api.get_file_share_task(session, &file.id));
                    self.share_error.clear();
                }
            } else if copy_link {
                ctx.copy_text(self.share_link.clone());
                self.share_notice = "Đã sao chép link chia sẻ.".to_owned();
            } else if toggle_active {
                if let Some((file_id, next_active)) = self
                    .share_data
                    .as_ref()
                    .map(|share| (share.file_id.clone(), !share.is_active))
                {
                    self.pending_share_mutation =
                        Some(api.update_file_share_task(session, &file_id, next_active, false));
                    self.share_error.clear();
                    self.share_notice.clear();
                }
            } else if regenerate {
                if let Some(file_id) = self.share_data.as_ref().map(|share| share.file_id.clone()) {
                    self.share_pending_regenerate = true;
                    self.pending_share_mutation =
                        Some(api.update_file_share_task(session, &file_id, true, true));
                    self.share_error.clear();
                    self.share_notice.clear();
                }
            }
        }
    }
}

#[derive(Clone)]
enum FileAction {
    Open(FileNode),
    Rename(FileNode),
    Delete(FileNode),
    Share(FileNode),
    Replace(FileNode),
    Download(FileNode),
}
fn file_actions(ui: &mut Ui, file: &FileNode, enabled: bool) -> Option<FileAction> {
    let mut action = None;
    for (label, allowed, kind) in [
        ("Mở", file.node_type == "dir", 0),
        ("Đổi tên", !file.is_protected, 1),
        ("Tải xuống", file.node_type != "dir", 2),
        ("Xóa", !file.is_protected, 3),
        ("Chia sẻ", file.node_type != "dir", 4),
        (
            "Thay nội dung",
            file.node_type != "dir" && !file.is_protected,
            5,
        ),
    ] {
        if ui
            .add_enabled(enabled && allowed, egui::Button::new(label))
            .clicked()
        {
            action = Some(match kind {
                0 => FileAction::Open(file.clone()),
                1 => FileAction::Rename(file.clone()),
                2 => FileAction::Download(file.clone()),
                3 => FileAction::Delete(file.clone()),
                4 => FileAction::Share(file.clone()),
                _ => FileAction::Replace(file.clone()),
            });
            ui.close_menu();
        }
    }
    action
}
fn file_menu<R>(
    ui: &mut Ui,
    rect: egui::Rect,
    id: &str,
    button: egui::Button<'_>,
    contents: impl FnOnce(&mut Ui) -> R,
) -> egui::Rect {
    let mut child = ui.new_child(egui::UiBuilder::new().id_salt(id).max_rect(rect).layout(
        egui::Layout::centered_and_justified(egui::Direction::TopDown),
    ));
    child.spacing_mut().button_padding = egui::vec2(10.0, 6.0);
    child.spacing_mut().interact_size.y = rect.height();
    egui::menu::menu_custom_button(&mut child, button, contents)
        .response
        .rect
}

fn render_file_table(
    ui: &mut Ui,
    files: &[FileNode],
    selected: &mut HashSet<String>,
    enabled: bool,
    sort: &mut FileSortMode,
    ascending: &mut bool,
    show_checkboxes: bool,
) -> Option<FileAction> {
    let mut action = None;
    egui::ScrollArea::horizontal()
        .id_salt("files.table.scroll")
        .show(ui, |ui| {
            let width = ui.available_width().max(1039.921875);
            let (bounds, _) = ui.allocate_exact_size(
                egui::vec2(width, 32.5 + files.len() as f32 * 43.0),
                egui::Sense::hover(),
            );
            let widths = [
                170.0, 90.09375, 112.796875, 120.0, 90.0, 92.03125, 110.0, 170.0, 85.0,
            ];
            let titles = [
                "Tên",
                "Loại",
                "Dung lượng",
                "Chủ sở hữu",
                "Nhóm",
                "Quyền hạn",
                "Định dạng",
                "Chỉnh sửa",
                "Thao tác",
            ];
            let mut x = bounds.left();
            ui.painter().rect_filled(bounds, 0.0, Color32::WHITE);
            for (col, (&base, title)) in widths.iter().zip(titles).enumerate() {
                let rect = egui::Rect::from_min_size(
                    egui::pos2(x, bounds.top()),
                    egui::vec2(base * width / 1039.921875, 32.5),
                );
                let response = ui.interact(
                    rect,
                    ui.id().with(("files.header", col)),
                    egui::Sense::click(),
                );
                response.widget_info(|| {
                    egui::WidgetInfo::labeled(egui::WidgetType::Button, true, title)
                });
                ui.painter()
                    .with_clip_rect(rect.intersect(ui.clip_rect()))
                    .text(
                        rect.left_center() + egui::vec2(14.0, 0.0),
                        egui::Align2::LEFT_CENTER,
                        title,
                        egui::FontId::proportional(12.0),
                        Color32::from_rgb(128, 128, 128),
                    );
                if response.clicked() {
                    if let Some(mode) = match col {
                        0 => Some(FileSortMode::Name),
                        1 => Some(FileSortMode::Type),
                        2 => Some(FileSortMode::Size),
                        7 => Some(FileSortMode::Modified),
                        _ => None,
                    } {
                        if *sort == mode {
                            *ascending = !*ascending;
                        } else {
                            *sort = mode;
                            *ascending = true;
                        }
                    }
                }
                crate::visual_test::record(&format!("files.table.header.{col}"), rect);
                x += rect.width();
            }
            for (row, file) in files.iter().enumerate() {
                let row_rect = egui::Rect::from_min_size(
                    egui::pos2(bounds.left(), bounds.top() + 32.5 + row as f32 * 43.0),
                    egui::vec2(width, 43.0),
                );
                let response = ui.interact(
                    row_rect,
                    ui.id().with(("files.row", &file.id)),
                    egui::Sense::click(),
                );
                if selected.contains(&file.id) {
                    ui.painter()
                        .rect_filled(row_rect, 0.0, Color32::from_rgb(229, 243, 255));
                } else if response.hovered() {
                    ui.painter()
                        .rect_filled(row_rect, 0.0, Color32::from_rgb(249, 250, 251));
                }
                if enabled && response.clicked() {
                    if !ui.input(|i| i.modifiers.ctrl || i.modifiers.command) {
                        selected.clear();
                    }
                    if !selected.insert(file.id.clone()) {
                        selected.remove(&file.id);
                    }
                }
                if enabled
                    && (response.double_clicked()
                        || (ui.ctx().screen_rect().width() <= 768.0 && response.clicked()))
                    && file.node_type == "dir"
                {
                    action = Some(FileAction::Open(file.clone()));
                }
                response.context_menu(|ui| {
                    if let Some(next) = file_actions(ui, file, enabled) {
                        action = Some(next);
                    }
                });
                let mut x = row_rect.left();
                for (col, base) in widths.iter().enumerate() {
                    let rect = egui::Rect::from_min_size(
                        egui::pos2(x, row_rect.top()),
                        egui::vec2(base * width / 1039.921875, 43.0),
                    );
                    let mut cell = ui.new_child(
                        egui::UiBuilder::new()
                            .id_salt((&file.id, col))
                            .max_rect(rect.shrink2(egui::vec2(14.0, 8.0)))
                            .layout(egui::Layout::left_to_right(egui::Align::Center)),
                    );
                    cell.set_clip_rect(rect.intersect(ui.clip_rect()));
                    cell.spacing_mut().button_padding = egui::vec2(4.0, 2.0);
                    let dir = file.node_type == "dir";
                    match col {
                        0 => {
                            let mut checked = selected.contains(&file.id);
                            if show_checkboxes
                                && cell
                                    .add_enabled(enabled, egui::Checkbox::new(&mut checked, ""))
                                    .changed()
                            {
                                if checked {
                                    selected.insert(file.id.clone());
                                } else {
                                    selected.remove(&file.id);
                                }
                            }
                            cell.add(
                                if dir {
                                    egui::Image::from_bytes(
                                        "bytes://folder-file-row.svg",
                                        include_bytes!("../../assets/nav-icons/FolderOutlined.svg"),
                                    )
                                } else {
                                    egui::Image::from_bytes(
                                        "bytes://file-row.svg",
                                        include_bytes!("../../assets/nav-icons/FileOutlined.svg"),
                                    )
                                }
                                .fit_to_exact_size(Vec2::splat(14.0))
                                .tint(if dir {
                                    Color32::from_rgb(255, 152, 0)
                                } else {
                                    crate::theme::PRIMARY
                                }),
                            );
                            cell.label(
                                RichText::new(&file.name)
                                    .size(12.5)
                                    .color(crate::theme::PRIMARY),
                            );
                        }
                        1 => crate::widgets::tag(
                            &mut cell,
                            if dir { "Thư mục" } else { "Tệp" },
                            if dir {
                                crate::widgets::TagTone::Warning
                            } else {
                                crate::widgets::TagTone::Neutral
                            },
                        ),
                        2 => {
                            cell.label(
                                RichText::new(if dir {
                                    "—".to_owned()
                                } else {
                                    format_size(file.size_bytes)
                                })
                                .size(12.0),
                            );
                        }
                        3..=5 => {
                            cell.label("")
                                .on_hover_text("API chưa cung cấp thông tin này");
                        }
                        6 => {
                            cell.label(
                                RichText::new(if dir {
                                    "File folder"
                                } else {
                                    file.mime_type.as_deref().unwrap_or("—")
                                })
                                .size(11.5)
                                .color(Color32::from_rgb(148, 148, 148)),
                            );
                        }
                        7 => {
                            cell.label(
                                RichText::new(if file.modified.is_empty() {
                                    "—"
                                } else {
                                    file.modified.get(..10).unwrap_or(&file.modified)
                                })
                                .size(12.0),
                            );
                        }
                        _ => {
                            let menu = cell.menu_button(" ", |ui| {
                                if let Some(next) = file_actions(ui, file, enabled) {
                                    action = Some(next);
                                }
                            });
                            egui::Image::from_bytes(
                                "bytes://file-row-down.svg",
                                include_bytes!("../../assets/nav-icons/DownOutlined.svg"),
                            )
                            .tint(Color32::from_rgb(51, 65, 85))
                            .paint_at(
                                &cell,
                                egui::Rect::from_center_size(
                                    menu.response.rect.center(),
                                    Vec2::splat(12.0),
                                ),
                            );
                        }
                    }
                    x += rect.width();
                }
                ui.painter().line_segment(
                    [row_rect.left_bottom(), row_rect.right_bottom()],
                    egui::Stroke::new(1.0, Color32::from_rgb(245, 245, 245)),
                );
            }
            crate::visual_test::record("files.table", bounds);
        });
    action
}

fn filter_and_sort_files(
    files: &[FileNode],
    search_query: &str,
    sort_mode: FileSortMode,
    ascending: bool,
) -> Vec<FileNode> {
    let query = search_query.trim().to_lowercase();
    let mut visible = files
        .iter()
        .filter(|file| {
            query.is_empty()
                || file.name.to_lowercase().contains(&query)
                || file
                    .mime_type
                    .as_deref()
                    .unwrap_or_default()
                    .to_lowercase()
                    .contains(&query)
                || (file.node_type == "dir" && "thư mục".contains(&query))
                || (file.node_type != "dir" && "tệp".contains(&query))
        })
        .cloned()
        .collect::<Vec<_>>();

    if sort_mode != FileSortMode::ServerOrder {
        visible.sort_by(|left, right| {
            let directory_order = (left.node_type != "dir").cmp(&(right.node_type != "dir"));
            if directory_order != std::cmp::Ordering::Equal {
                return directory_order;
            }
            let order = match sort_mode {
                FileSortMode::ServerOrder => std::cmp::Ordering::Equal,
                FileSortMode::Name => left.name.to_lowercase().cmp(&right.name.to_lowercase()),
                FileSortMode::Type => file_type_sort_key(left).cmp(&file_type_sort_key(right)),
                FileSortMode::Size => left.size_bytes.cmp(&right.size_bytes),
                FileSortMode::Modified => left.modified.cmp(&right.modified),
            };
            if ascending { order } else { order.reverse() }
        });
    }
    visible
}

fn selected_files(files: &[FileNode], selected_ids: &HashSet<String>) -> Vec<FileNode> {
    files
        .iter()
        .filter(|file| selected_ids.contains(&file.id))
        .cloned()
        .collect()
}

fn file_type_sort_key(file: &FileNode) -> String {
    if file.node_type == "dir" {
        return "0:folder".to_owned();
    }
    let extension = file
        .name
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_lowercase())
        .unwrap_or_default();
    format!(
        "1:{}:{extension}",
        file.mime_type.as_deref().unwrap_or_default().to_lowercase()
    )
}

fn build_public_share_url(api_endpoint: &str, relative_url: &str) -> String {
    let api_endpoint = api_endpoint.trim_end_matches('/');
    let public_base = api_endpoint.strip_suffix("/api/v1").unwrap_or(api_endpoint);
    format!("{public_base}{relative_url}")
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

#[cfg(test)]
mod tests {
    use super::FilesView;
    use super::{FileSortMode, build_public_share_url, filter_and_sort_files, selected_files};
    use crate::api::FileNode;
    use std::collections::HashSet;

    #[test]
    fn root_listing_comes_from_api_namespace_without_inventing_metadata() {
        let mut view = FilesView::default();
        assert!(view.presented_files(false).is_empty());
        view.breadcrumbs
            .push(("actual-api-root".to_owned(), "Nhân Sự".to_owned()));
        let roots = view.presented_files(false);
        assert_eq!(roots[0].id, "actual-api-root");
        assert_eq!(roots[0].name, "Nhân Sự");
        assert!(roots[0].modified.is_empty());
        assert!(roots[0].is_protected);
        view.files
            .push(file("child", "Hồ sơ", "dir", 0, "2026-10-23"));
        assert_eq!(view.presented_files(true)[0].id, "child");
        view.show_namespace_root = false;
        assert_eq!(view.presented_files(false)[0].id, "child");
    }

    #[test]
    fn file_page_does_not_expand_the_viewport_on_mobile() {
        for width in [320.0, 390.0, 768.0, 1440.0] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            crate::native_text::setup_style(&ctx);
            let session = crate::models::Session {
                token: "fixture".to_owned(),
                session_id: "fixture".to_owned(),
                user: crate::models::User {
                    id: "fixture".to_owned(),
                    email: "fixture@example.test".to_owned(),
                    name: "Fixture".to_owned(),
                    role: "ADMIN".to_owned(),
                    is_active: true,
                },
                endpoint: "/api/v1".to_owned(),
                mode: crate::models::StorageMode::KiyoCloud,
            };
            let mut view = FilesView::default();
            view.loaded_for = Some(session.user.id.clone());
            view.employee_scope = Some(false);
            view.needs_reload = false;
            view.breadcrumbs
                .push(("fixture-root".to_owned(), "Nhân Sự".to_owned()));
            let _ = ctx.run(
                egui::RawInput {
                    screen_rect: Some(egui::Rect::from_min_size(
                        egui::Pos2::ZERO,
                        egui::vec2(width, 900.0),
                    )),
                    ..Default::default()
                },
                |ctx| {
                    egui::CentralPanel::default().show(ctx, |ui| {
                        let right = ui.max_rect().right();
                        view.render(ui, ctx, &session, &crate::api::ApiClient, false);
                        assert!(
                            ui.min_rect().right() <= right,
                            "content overflowed {width}px viewport: {:?}",
                            ui.min_rect()
                        );
                    });
                },
            );
        }
    }

    fn file(id: &str, name: &str, node_type: &str, size_bytes: i64, modified: &str) -> FileNode {
        FileNode {
            id: id.to_owned(),
            name: name.to_owned(),
            node_type: node_type.to_owned(),
            mime_type: if node_type == "dir" {
                None
            } else {
                Some("application/pdf".to_owned())
            },
            size_bytes,
            modified: modified.to_owned(),
            is_protected: false,
        }
    }

    #[test]
    fn public_share_url_respects_web_relative_and_native_api_endpoints() {
        assert_eq!(
            build_public_share_url("/api/v1", "/files/share?token=abc"),
            "/files/share?token=abc"
        );
        assert_eq!(
            build_public_share_url(
                "https://kiyo.example/prefix/api/v1/",
                "/files/share?token=abc"
            ),
            "https://kiyo.example/prefix/files/share?token=abc"
        );
    }

    #[test]
    fn file_search_is_case_insensitive_and_matches_name_mime_and_kind() {
        let files = vec![
            file("1", "Báo cáo.pdf", "file", 30, "2026-01-01"),
            file("2", "Hồ sơ", "dir", 0, "2026-01-02"),
        ];

        assert_eq!(
            filter_and_sort_files(&files, "BÁO CÁO", FileSortMode::ServerOrder, true)
                .iter()
                .map(|file| file.id.as_str())
                .collect::<Vec<_>>(),
            vec!["1"]
        );
        assert_eq!(
            filter_and_sort_files(&files, "application/pdf", FileSortMode::ServerOrder, true)
                .iter()
                .map(|file| file.id.as_str())
                .collect::<Vec<_>>(),
            vec!["1"]
        );
        assert_eq!(
            filter_and_sort_files(&files, "thư mục", FileSortMode::ServerOrder, true)
                .iter()
                .map(|file| file.id.as_str())
                .collect::<Vec<_>>(),
            vec!["2"]
        );
    }

    #[test]
    fn file_sort_modes_order_size_modified_and_keep_server_default() {
        let mut text_file = file("text", "note.txt", "file", 100, "2026-02-01");
        text_file.mime_type = Some("text/plain".to_owned());
        let files = vec![
            file("large", "zeta.pdf", "file", 200, "2026-03-01"),
            file("small", "Alpha.pdf", "file", 20, "2026-01-01"),
            file("folder", "Folder", "dir", 0, "2026-02-01"),
            text_file,
        ];
        let ids = |mode, ascending| {
            filter_and_sort_files(&files, "", mode, ascending)
                .iter()
                .map(|file| file.id.clone())
                .collect::<Vec<_>>()
        };

        assert_eq!(
            ids(FileSortMode::ServerOrder, true),
            vec!["large", "small", "folder", "text"]
        );
        assert_eq!(
            ids(FileSortMode::Name, true),
            vec!["folder", "small", "text", "large"]
        );
        assert_eq!(
            ids(FileSortMode::Type, true),
            vec!["folder", "large", "small", "text"]
        );
        assert_eq!(
            ids(FileSortMode::Size, true),
            vec!["folder", "small", "text", "large"]
        );
        assert_eq!(
            ids(FileSortMode::Modified, false),
            vec!["folder", "large", "text", "small"]
        );
    }

    #[test]
    fn multi_select_only_resolves_ids_in_current_folder_and_preserves_protection() {
        let files = vec![
            file("one", "one.txt", "file", 1, "2026-01-01"),
            FileNode {
                is_protected: true,
                ..file("protected", "System", "dir", 0, "2026-01-01")
            },
        ];
        let selected_ids = [
            "one".to_owned(),
            "protected".to_owned(),
            "stale-from-another-folder".to_owned(),
        ]
        .into_iter()
        .collect::<HashSet<_>>();
        let selection = selected_files(&files, &selected_ids);

        assert_eq!(
            selection
                .iter()
                .map(|file| file.id.as_str())
                .collect::<Vec<_>>(),
            vec!["one", "protected"]
        );
        assert!(selection.iter().any(|file| file.is_protected));
    }

    #[test]
    fn bulk_delete_failure_reports_partial_result_and_clears_stale_selection() {
        let mut view = FilesView::default();
        let first = file("one", "one.txt", "file", 1, "2026-01-01");
        let second = file("two", "two.txt", "file", 2, "2026-01-01");
        view.delete_targets = vec![first.clone(), second.clone()];
        view.delete_current = Some(second.clone());
        view.delete_queue
            .push_back(file("three", "three.txt", "file", 3, "2026-01-01"));
        view.delete_total = 3;
        view.delete_completed = 1;
        view.selected_ids.insert(first.id);
        view.selected_ids.insert(second.id);

        view.stop_delete_queue("thư mục không rỗng");

        assert!(view.error.contains("Đã xóa 1/3 mục"));
        assert!(view.error.contains("two.txt"));
        assert!(view.error.contains("Các mục còn lại chưa được xử lý"));
        assert!(view.delete_targets.is_empty());
        assert!(view.delete_queue.is_empty());
        assert!(view.selected_ids.is_empty());
        assert!(view.needs_reload);
    }
}
