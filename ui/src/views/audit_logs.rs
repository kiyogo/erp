use std::time::Duration;

use crate::{
    api::{ApiClient, ApiTask, AuditLogEntry, AuditLogsPagination, AuditLogsResponse},
    models::Session,
};
use egui::{Color32, RichText, Ui, Vec2};

#[derive(Debug, Clone, PartialEq, Eq)]
struct AuditQuery {
    user_id: String,
    page: usize,
    filter: String,
    search: String,
}

pub struct AuditLogsView {
    entries: Vec<AuditLogEntry>,
    pagination: AuditLogsPagination,
    task: Option<ApiTask<AuditLogsResponse>>,
    requested_query: Option<AuditQuery>,
    loaded_for: Option<String>,
    needs_reload: bool,
    filter: String,
    search: String,
    selected_id: Option<String>,
    error: String,
}

impl Default for AuditLogsView {
    fn default() -> Self {
        Self {
            entries: Vec::new(),
            pagination: AuditLogsPagination {
                page: 1,
                limit: 50,
                total: 0,
                total_pages: 0,
            },
            task: None,
            requested_query: None,
            loaded_for: None,
            needs_reload: true,
            filter: "all".to_owned(),
            search: String::new(),
            selected_id: None,
            error: String::new(),
        }
    }
}

impl AuditLogsView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn current_query(&self, session: &Session) -> AuditQuery {
        AuditQuery {
            user_id: session.user.id.clone(),
            page: self.pagination.page.max(1),
            filter: self.filter.clone(),
            search: self.search.clone(),
        }
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        let query = self.current_query(session);
        self.error.clear();
        self.requested_query = Some(query.clone());
        self.task = Some(api.list_admin_audit_logs_task(
            session,
            query.page,
            self.pagination.limit,
            &query.filter,
            &query.search,
        ));
        self.needs_reload = false;
    }

    fn poll(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.task = None;
            self.requested_query = None;
            self.entries.clear();
            self.pagination = AuditLogsPagination {
                page: 1,
                limit: 50,
                total: 0,
                total_pages: 0,
            };
            self.filter = "all".to_owned();
            self.search.clear();
            self.selected_id = None;
            self.loaded_for = Some(session.user.id.clone());
            self.needs_reload = true;
            self.error.clear();
        }

        if self.needs_reload && self.task.is_none() {
            self.request_reload(session, api);
        }

        if let Some(result) = self.task.as_ref().and_then(ApiClient::poll) {
            self.task = None;
            let response_matches_current_query = self
                .requested_query
                .as_ref()
                .is_some_and(|requested| requested == &self.current_query(session));
            if response_matches_current_query {
                match result {
                    Ok(response) => {
                        self.entries = response.data;
                        self.pagination = response.pagination;
                        if self
                            .selected_id
                            .as_ref()
                            .is_some_and(|id| !self.entries.iter().any(|entry| &entry.id == id))
                        {
                            self.selected_id = None;
                        }
                        self.error.clear();
                    }
                    Err(error) => self.error = error,
                }
            } else {
                self.needs_reload = true;
            }
        }

        if self.task.is_some() || self.needs_reload {
            ui.ctx().request_repaint_after(Duration::from_millis(80));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Chỉ quản trị viên mới có thể xem nhật ký kiểm toán.");
            return;
        }

        self.poll(ui, session, api);
        let mut query_changed = false;
        let mut next_page = None;
        let mut selected_id = None;

        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new("NHẬT KÝ TỪ BACKEND")
                            .size(11.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.heading("Nhật ký kiểm toán");
                    ui.label(format!(
                        "{} sự kiện · trang {} / {}",
                        self.pagination.total,
                        self.pagination.page,
                        self.pagination.total_pages
                    ));
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui
                        .add_enabled(self.task.is_none(), egui::Button::new("Làm mới"))
                        .clicked()
                    {
                        self.needs_reload = true;
                    }
                });
            });

            ui.add_space(6.0);
            ui.label(
                RichText::new("Hiển thị dữ liệu được backend lưu. IP, chữ ký/hash chống sửa đổi và chính sách lưu trữ không được cung cấp bởi nguồn hiện tại.")
                    .small()
                    .color(Color32::GRAY),
            );

            ui.add_space(10.0);
            ui.horizontal_wrapped(|ui| {
                ui.label("Lọc:");
                egui::ComboBox::from_id_salt("audit_log_filter")
                    .selected_text(filter_label(&self.filter))
                    .show_ui(ui, |ui| {
                        for (value, label) in [
                            ("all", "Tất cả"),
                            ("sensitive", "Thay đổi nhạy cảm"),
                            ("approve", "Phê duyệt"),
                            ("create", "Tạo mới"),
                            ("auth", "Đăng nhập & bảo mật"),
                        ] {
                            if ui.selectable_value(&mut self.filter, value.to_owned(), label).changed() {
                                self.pagination.page = 1;
                                query_changed = true;
                            }
                        }
                    });

                ui.label("Tìm kiếm:");
                let search = ui.add(
                    egui::TextEdit::singleline(&mut self.search)
                        .hint_text("Người dùng, hành động, phân hệ…")
                        .char_limit(160)
                        .desired_width(260.0),
                );
                if search.changed() {
                    self.pagination.page = 1;
                    query_changed = true;
                }
            });

            if query_changed {
                self.entries.clear();
                self.selected_id = None;
                self.needs_reload = true;
            }

            if !self.error.is_empty() {
                ui.add_space(8.0);
                ui.horizontal(|ui| {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    if ui
                        .add_enabled(self.task.is_none(), egui::Button::new("Thử lại"))
                        .clicked()
                    {
                        self.needs_reload = true;
                    }
                });
            }

            if self.task.is_some() && self.entries.is_empty() {
                ui.add_space(12.0);
                ui.horizontal(|ui| {
                    ui.spinner();
                    ui.label("Đang tải sự kiện từ máy chủ…");
                });
            } else if self.entries.is_empty() && self.error.is_empty() && self.task.is_none() {
                ui.add_space(12.0);
                ui.label("Không có sự kiện phù hợp với bộ lọc.");
            } else if !self.entries.is_empty() {
                ui.add_space(10.0);
                egui::Frame::group(ui.style()).show(ui, |ui| {
                    egui::ScrollArea::horizontal().show(ui, |ui| {
                        egui::Grid::new("audit_logs_grid")
                            .striped(true)
                            .min_col_width(100.0)
                            .spacing(Vec2::new(12.0, 9.0))
                            .show(ui, |ui| {
                                for title in ["Thời điểm", "Người thực hiện", "Hành động", "Phân hệ", "Chi tiết", ""] {
                                    ui.label(RichText::new(title).strong());
                                }
                                ui.end_row();

                                for entry in &self.entries {
                                    ui.label(&entry.timestamp);
                                    ui.label(&entry.user);
                                    ui.label(action_label(&entry.action));
                                    ui.label(&entry.module);
                                    ui.add_sized(
                                        [280.0, 40.0],
                                        egui::Label::new(&entry.detail).wrap(),
                                    );
                                    if ui.small_button("Chi tiết").clicked() {
                                        selected_id = Some(entry.id.clone());
                                    }
                                    ui.end_row();
                                }
                            });
                    });
                });
            }

            if let Some(entry) = self
                .selected_id
                .as_ref()
                .and_then(|id| self.entries.iter().find(|entry| &entry.id == id))
            {
                ui.add_space(8.0);
                egui::Frame::group(ui.style()).show(ui, |ui| {
                    ui.label(RichText::new("Chi tiết sự kiện").strong());
                    ui.label(format!("Mã: {}", entry.id));
                    ui.label(format!("Thời điểm: {}", entry.timestamp));
                    ui.label(format!("Người thực hiện: {}", entry.user));
                    ui.label(format!("Hành động: {} · {}", entry.action, entry.module));
                    ui.label(RichText::new(&entry.detail).small());
                });
            }

            ui.add_space(10.0);
            ui.horizontal(|ui| {
                if ui
                    .add_enabled(
                        self.task.is_none() && self.pagination.page > 1,
                        egui::Button::new("← Trước"),
                    )
                    .clicked()
                {
                    next_page = Some(self.pagination.page.saturating_sub(1));
                }
                if ui
                    .add_enabled(
                        self.task.is_none()
                            && self.pagination.total_pages > 0
                            && self.pagination.page < self.pagination.total_pages,
                        egui::Button::new("Sau →"),
                    )
                    .clicked()
                {
                    next_page = Some((self.pagination.page + 1).min(self.pagination.total_pages));
                }
            });
        });

        if let Some(page) = next_page {
            self.pagination.page = page;
            self.entries.clear();
            self.selected_id = None;
            self.needs_reload = true;
        }
        if let Some(id) = selected_id {
            self.selected_id = Some(id);
        }
        if self.needs_reload && self.task.is_none() {
            self.request_reload(session, api);
        }
        if self.task.is_some() || self.needs_reload {
            ui.ctx().request_repaint_after(Duration::from_millis(80));
        }
    }
}

fn filter_label(filter: &str) -> &'static str {
    match filter {
        "sensitive" => "Thay đổi nhạy cảm",
        "approve" => "Phê duyệt",
        "create" => "Tạo mới",
        "auth" => "Đăng nhập & bảo mật",
        _ => "Tất cả",
    }
}

fn action_label(action: &str) -> &str {
    match action {
        "create" => "Tạo mới",
        "update" => "Cập nhật",
        "delete" => "Xóa",
        "replace_collection" => "Thay thế danh sách",
        "cancel" => "Hủy",
        "login" => "Đăng nhập",
        "logout" => "Đăng xuất",
        _ => action,
    }
}

#[cfg(test)]
mod tests {
    use super::{AuditLogsView, filter_label};

    #[test]
    fn reset_clears_loaded_data_and_search_state() {
        let mut view = AuditLogsView::default();
        view.search = "account@example.test".to_owned();
        view.filter = "sensitive".to_owned();
        view.loaded_for = Some("admin-1".to_owned());
        view.reset();
        assert!(view.search.is_empty());
        assert_eq!(view.filter, "all");
        assert!(view.loaded_for.is_none());
        assert!(view.entries.is_empty());
    }

    #[test]
    fn filter_labels_fall_back_to_all_for_unknown_values() {
        assert_eq!(filter_label("auth"), "Đăng nhập & bảo mật");
        assert_eq!(filter_label("unknown"), "Tất cả");
    }
}
