use std::time::Duration;

use crate::{
    api::{ApiClient, ApiTask, AuthSessionRecord, AuthSessionsResponse, SessionMutationResponse},
    models::Session,
};
use egui::{Color32, RichText, Ui, Vec2};

pub struct AuthSessionsView {
    sessions: Vec<AuthSessionRecord>,
    list_task: Option<ApiTask<AuthSessionsResponse>>,
    revoke_task: Option<ApiTask<SessionMutationResponse>>,
    loaded_for: Option<String>,
    needs_reload: bool,
    loading: bool,
    error: String,
    notice: String,
    pending_revoke: Option<(String, String)>,
}

impl Default for AuthSessionsView {
    fn default() -> Self {
        Self {
            sessions: Vec::new(),
            list_task: None,
            revoke_task: None,
            loaded_for: None,
            needs_reload: true,
            loading: false,
            error: String::new(),
            notice: String::new(),
            pending_revoke: None,
        }
    }
}

impl AuthSessionsView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        self.loading = true;
        self.error.clear();
        self.list_task = Some(api.list_admin_sessions_task(session));
        self.needs_reload = false;
    }

    fn poll_requests(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.loaded_for = Some(session.user.id.clone());
            self.needs_reload = true;
            self.sessions.clear();
        }

        if self.needs_reload && self.list_task.is_none() && self.revoke_task.is_none() {
            self.request_reload(session, api);
        }

        if let Some(result) = self.list_task.as_ref().and_then(ApiClient::poll) {
            self.list_task = None;
            self.loading = false;
            match result {
                Ok(response) => self.sessions = response.data,
                Err(error) => self.error = error,
            }
        }

        if let Some(result) = self.revoke_task.as_ref().and_then(ApiClient::poll) {
            self.revoke_task = None;
            match result {
                Ok(response) if response.revoked => {
                    self.notice = "Đã thu hồi phiên. Yêu cầu tiếp theo của phiên đó sẽ bị từ chối."
                        .to_owned();
                    self.pending_revoke = None;
                    self.needs_reload = true;
                }
                Ok(_) => self.error = "Máy chủ không xác nhận đã thu hồi phiên.".to_owned(),
                Err(error) => self.error = error,
            }
        }

        if self.list_task.is_some() || self.revoke_task.is_some() || self.needs_reload {
            ui.ctx().request_repaint_after(Duration::from_millis(80));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Chỉ quản trị viên mới có thể xem và thu hồi phiên đăng nhập.");
            return;
        }

        self.poll_requests(ui, session, api);
        let mut confirm_revoke: Option<String> = None;
        let mut cancel_revoke = false;
        let mut selected_revoke: Option<(String, String)> = None;

        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new("BẢO MẬT TÀI KHOẢN")
                            .size(11.0)
                            .strong()
                            .color(Color32::from_rgb(0, 150, 136)),
                    );
                    ui.heading("Phiên đăng nhập");
                    ui.label("Danh sách phiên đang hiệu lực do máy chủ xác thực quản lý.");
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui
                        .add_enabled(self.list_task.is_none() && self.revoke_task.is_none(), egui::Button::new("Làm mới"))
                        .clicked()
                    {
                        self.needs_reload = true;
                    }
                });
            });

            ui.add_space(8.0);
            ui.label(
                RichText::new("Chỉ hiển thị tài khoản, vai trò, thời điểm cấp/hết hạn và phiên hiện tại. IP, vị trí, thiết bị, MFA và trạng thái hoạt động gần nhất không được suy đoán từ dữ liệu trình duyệt.")
                    .small()
                    .color(Color32::GRAY),
            );

            if !self.notice.is_empty() {
                ui.add_space(8.0);
                ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
            }
            if !self.error.is_empty() {
                ui.add_space(6.0);
                ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
            }

            if let Some((session_id, name)) = self.pending_revoke.as_ref() {
                ui.add_space(10.0);
                egui::Frame::group(ui.style()).show(ui, |ui| {
                    ui.label(RichText::new("Xác nhận thu hồi phiên").strong());
                    ui.label(format!("Người dùng: {name}"));
                    ui.label(format!("Mã phiên: {session_id}"));
                    ui.colored_label(
                        Color32::from_rgb(185, 28, 28),
                        "Phiên sẽ mất quyền truy cập ở yêu cầu tiếp theo. Không thể hoàn tác thao tác này.",
                    );
                    ui.horizontal(|ui| {
                        if ui
                            .add_enabled(self.revoke_task.is_none(), egui::Button::new("Thu hồi phiên"))
                            .clicked()
                        {
                            confirm_revoke = Some(session_id.clone());
                        }
                        if ui.button("Hủy").clicked() {
                            cancel_revoke = true;
                        }
                    });
                });
            }

            ui.add_space(12.0);
            if self.loading && self.sessions.is_empty() {
                ui.horizontal(|ui| {
                    ui.spinner();
                    ui.label("Đang tải phiên từ máy chủ...");
                });
            } else if self.sessions.is_empty() && self.error.is_empty() {
                ui.label("Không có phiên đăng nhập đang hiệu lực.");
            } else {
                egui::Frame::group(ui.style()).show(ui, |ui| {
                    egui::ScrollArea::horizontal().show(ui, |ui| {
                        egui::Grid::new("auth_sessions_grid")
                            .striped(true)
                            .min_col_width(100.0)
                            .spacing(Vec2::new(12.0, 9.0))
                            .show(ui, |ui| {
                                for title in ["Tài khoản", "Vai trò", "Cấp lúc (UTC)", "Hết hạn (UTC)", "Trạng thái", "Thao tác"] {
                                    ui.label(RichText::new(title).strong());
                                }
                                ui.end_row();

                                for auth_session in &self.sessions {
                                    ui.vertical(|ui| {
                                        ui.label(RichText::new(&auth_session.name).strong());
                                        ui.label(&auth_session.email);
                                    });
                                    ui.label(if auth_session.role == "ADMIN" { "Quản trị viên" } else { "Nhân viên" });
                                    ui.label(&auth_session.issued_at);
                                    ui.label(&auth_session.expires_at);
                                    ui.label(if auth_session.is_current { "Phiên hiện tại" } else { "Đang hiệu lực" });
                                    if auth_session.is_current {
                                        ui.label("—");
                                    } else if ui.small_button("Thu hồi…").clicked() {
                                        selected_revoke = Some((auth_session.id.clone(), auth_session.name.clone()));
                                    }
                                    ui.end_row();
                                }
                            });
                    });
                });
            }
        });

        if let Some(session_id) = confirm_revoke {
            self.error.clear();
            self.revoke_task = Some(api.revoke_admin_session_task(session, &session_id));
        }
        if cancel_revoke {
            self.pending_revoke = None;
        }
        if let Some(selection) = selected_revoke {
            self.pending_revoke = Some(selection);
        }
    }
}
