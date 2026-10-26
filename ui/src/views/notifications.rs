use std::time::Duration;
use web_time::Instant;

use crate::{
    api::{ApiClient, ApiTask, NotificationMutation, UserNotification},
    models::{ADMIN_NAV_TREE, EMPLOYEE_NAV_TREE, NavItem, NavNode, Session},
};
use egui::{Color32, RichText, Ui, Vec2};

#[derive(Debug, Clone)]
enum NotificationAction {
    MarkRead(String),
    MarkAllRead,
    Delete(String),
    ClearAll,
}

struct PendingMutation {
    action: NotificationAction,
    task: ApiTask<NotificationMutation>,
}

#[derive(Default)]
pub struct NotificationsView {
    notifications: Vec<UserNotification>,
    pending_list: Option<ApiTask<crate::api::UserNotificationsResponse>>,
    pending_mutation: Option<PendingMutation>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    needs_reload: bool,
    search: String,
    error: String,
    notice: String,
    confirm_clear: bool,
}

impl NotificationsView {
    pub fn reset(&mut self) {
        self.notifications.clear();
        self.pending_list = None;
        self.pending_mutation = None;
        self.loaded_for = None;
        self.last_loaded = None;
        self.needs_reload = false;
        self.search.clear();
        self.error.clear();
        self.notice.clear();
        self.confirm_clear = false;
    }

    pub fn unread_count(&self) -> usize {
        self.notifications.iter().filter(|item| item.unread).count()
    }

    pub fn render_header_popover(
        &mut self,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        anchor_rect: egui::Rect,
        all_notifications_nav: NavItem,
        nav_change: &mut Option<NavItem>,
    ) -> (bool, egui::Rect) {
        let screen = ctx.screen_rect();
        let width = notification_popover_width(screen.width());
        let list_max_height = (screen.height() - 150.0).clamp(80.0, 360.0);
        let busy = self.pending_list.is_some() || self.pending_mutation.is_some();
        let loading = self.pending_list.is_some();
        let notifications = self.notifications.clone();
        let error = self.error.clone();
        let mut close = false;
        let mut retry = false;
        let mut mark_read = None;
        let mut invalid_link = false;

        let area = egui::Area::new(egui::Id::new("header_notification_popover"))
            .order(egui::Order::Foreground)
            .constrain(false)
            .fixed_pos(egui::pos2(anchor_rect.right() - width, screen.top() + 54.0))
            .show(ctx, |ui| {
                ui.set_min_width(width);
                ui.set_max_width(width);
                egui::Frame::none()
                    .fill(Color32::WHITE)
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(224, 224, 224)))
                    .rounding(egui::Rounding::same(6.0))
                    .shadow(egui::epaint::Shadow {
                        offset: egui::vec2(0.0, 4.0),
                        blur: 12.0,
                        spread: 0.0,
                        color: Color32::from_black_alpha(20),
                    })
                    .inner_margin(egui::Margin::same(0.0))
                    .show(ui, |ui| {
                        ui.set_width(width);
                        egui::Frame::none()
                            .fill(Color32::from_rgb(250, 250, 250))
                            .inner_margin(egui::Margin::symmetric(14.0, 10.0))
                            .show(ui, |ui| {
                                ui.set_width((width - 28.0).max(0.0));
                                ui.label(
                                    RichText::new("Thông báo")
                                        .size(14.0)
                                        .strong()
                                        .color(Color32::from_rgb(33, 33, 33)),
                                );
                            });
                        ui.separator();

                        egui::ScrollArea::vertical()
                            .max_height(list_max_height)
                            .auto_shrink([false, false])
                            .show(ui, |ui| {
                                ui.set_width(width);
                                if loading && notifications.is_empty() {
                                    ui.vertical_centered(|ui| {
                                        ui.add_space(24.0);
                                        ui.spinner();
                                        ui.label("Đang tải thông báo…");
                                        ui.add_space(24.0);
                                    });
                                } else if !error.is_empty() && notifications.is_empty() {
                                    ui.vertical_centered(|ui| {
                                        ui.add_space(12.0);
                                        ui.colored_label(
                                            Color32::from_rgb(185, 28, 28),
                                            &error,
                                        );
                                        if ui.button("Tải lại").clicked() {
                                            retry = true;
                                        }
                                        ui.add_space(12.0);
                                    });
                                } else if notifications.is_empty() {
                                    ui.vertical_centered(|ui| {
                                        ui.add_space(18.0);
                                        let (icon_rect, _) = ui.allocate_exact_size(
                                            Vec2::splat(28.0),
                                            egui::Sense::hover(),
                                        );
                                        paint_notification_bell(
                                            ui.painter(),
                                            icon_rect.center(),
                                            Color32::from_rgb(189, 189, 189),
                                        );
                                        ui.label(
                                            RichText::new("Không có thông báo nào")
                                                .size(13.0)
                                                .color(Color32::from_rgb(158, 158, 158)),
                                        );
                                        ui.add_space(18.0);
                                    });
                                } else {
                                    for item in &notifications {
                                        let mut mark_button_clicked = false;
                                        let (row_rect, row_response) = ui.allocate_exact_size(
                                            Vec2::new(width, 90.0),
                                            egui::Sense::click(),
                                        );
                                        let background = if row_response.hovered() {
                                            Color32::from_rgb(245, 245, 245)
                                        } else if item.unread {
                                            Color32::from_rgb(247, 253, 253)
                                        } else {
                                            Color32::WHITE
                                        };
                                        ui.painter().rect_filled(row_rect, 0.0, background);
                                        ui.painter().line_segment(
                                            [row_rect.left_bottom(), row_rect.right_bottom()],
                                            egui::Stroke::new(
                                                1.0,
                                                Color32::from_rgb(240, 240, 240),
                                            ),
                                        );

                                        let content_rect = row_rect.shrink2(Vec2::new(12.0, 8.0));
                                        let content_width = (content_rect.width() - 40.0).max(0.0);
                                        let (icon_fill, icon_color, glyph) =
                                            notification_icon_style(&item.notification_type);
                                        ui.allocate_new_ui(
                                            egui::UiBuilder::new().max_rect(content_rect),
                                            |ui| {
                                            ui.set_width(content_rect.width());
                                            ui.horizontal(|ui| {
                                                let (icon_rect, _) = ui.allocate_exact_size(
                                                    Vec2::splat(30.0),
                                                    egui::Sense::hover(),
                                                );
                                                ui.painter().rect_filled(
                                                    icon_rect,
                                                    4.0,
                                                    icon_fill,
                                                );
                                                if glyph.is_empty() {
                                                    paint_notification_bell(
                                                        ui.painter(),
                                                        icon_rect.center(),
                                                        icon_color,
                                                    );
                                                } else {
                                                    ui.painter().text(
                                                        icon_rect.center(),
                                                        egui::Align2::CENTER_CENTER,
                                                        glyph,
                                                        egui::FontId::proportional(14.0),
                                                        icon_color,
                                                    );
                                                }
                                                ui.add_space(10.0);
                                                ui.vertical(|ui| {
                                                    ui.set_width(content_width);
                                                    ui.horizontal(|ui| {
                                                        ui.add_sized(
                                                            Vec2::new(
                                                                (content_width
                                                                    - if item.unread {
                                                                        12.0
                                                                    } else {
                                                                        0.0
                                                                    })
                                                                .max(0.0),
                                                                18.0,
                                                            ),
                                                            egui::Label::new(
                                                                RichText::new(&item.title)
                                                                    .size(13.0)
                                                                    .color(if item.unread {
                                                                        Color32::from_rgb(
                                                                            0, 150, 136,
                                                                        )
                                                                    } else {
                                                                        Color32::from_rgb(
                                                                            33, 33, 33,
                                                                        )
                                                                    })
                                                                    .strong(),
                                                            ),
                                                        );
                                                        if item.unread {
                                                            let (dot, _) = ui.allocate_exact_size(
                                                                Vec2::splat(6.0),
                                                                egui::Sense::hover(),
                                                            );
                                                            ui.painter().circle_filled(
                                                                dot.center(),
                                                                3.0,
                                                                Color32::from_rgb(0, 150, 136),
                                                            );
                                                        }
                                                    });
                                                    ui.add_sized(
                                                        Vec2::new(content_width, 34.0),
                                                        egui::Label::new(
                                                            RichText::new(&item.message)
                                                                .size(12.0)
                                                                .color(Color32::from_rgb(
                                                                    97, 97, 97,
                                                                )),
                                                        )
                                                        .wrap(),
                                                    );
                                                    ui.horizontal(|ui| {
                                                        ui.label(
                                                            RichText::new(&item.time)
                                                                .size(11.0)
                                                                .color(Color32::from_rgb(
                                                                    158, 158, 158,
                                                                )),
                                                        );
                                                        ui.with_layout(
                                                            egui::Layout::right_to_left(
                                                                egui::Align::Center,
                                                            ),
                                                            |ui| {
                                                                if item.unread {
                                                                    let response = ui.add_enabled(
                                                                        !busy,
                                                                        egui::Button::new(
                                                                            RichText::new(
                                                                                "✓ Đánh dấu đã đọc",
                                                                            )
                                                                            .size(10.0)
                                                                            .color(Color32::from_rgb(
                                                                                0, 150, 136,
                                                                            )),
                                                                        )
                                                                        .fill(Color32::TRANSPARENT)
                                                                        .stroke(egui::Stroke::new(
                                                                            0.0,
                                                                            Color32::TRANSPARENT,
                                                                        )),
                                                                    );
                                                                    if response.clicked() {
                                                                        mark_button_clicked = true;
                                                                        mark_read =
                                                                            Some(item.id.clone());
                                                                    }
                                                                }
                                                            },
                                                        );
                                                    });
                                                });
                                            });
                                        },
                                        );

                                        if row_response.clicked() && !mark_button_clicked {
                                            close = true;
                                            if item.unread && !busy {
                                                mark_read = Some(item.id.clone());
                                            }
                                            if !item.link.trim().is_empty() {
                                                if let Some(target) = resolve_notification_link(
                                                    &item.link,
                                                    session.user.role == "ADMIN",
                                                ) {
                                                    *nav_change = Some(target);
                                                } else {
                                                    invalid_link = true;
                                                }
                                            }
                                        }
                                    }
                                }
                            });

                        ui.separator();
                        egui::Frame::none()
                            .fill(Color32::from_rgb(250, 250, 250))
                            .inner_margin(egui::Margin::symmetric(14.0, 9.0))
                            .show(ui, |ui| {
                                ui.set_width((width - 28.0).max(0.0));
                                ui.vertical_centered(|ui| {
                                    if ui
                                        .link(
                                            RichText::new("Xem tất cả thông báo  ›")
                                                .size(12.0)
                                                .strong()
                                                .color(Color32::from_rgb(0, 150, 136)),
                                        )
                                        .clicked()
                                    {
                                        *nav_change = Some(all_notifications_nav);
                                        close = true;
                                    }
                                });
                            });
                    });
            });

        if retry {
            self.needs_reload = true;
        }
        if invalid_link {
            self.error = "Đường dẫn thông báo không khớp trang nội bộ.".to_owned();
        }
        if let Some(id) = mark_read {
            self.begin_mutation(NotificationAction::MarkRead(id), session, api);
        }
        (close, area.response.rect)
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        if self.pending_list.is_some() || self.pending_mutation.is_some() {
            self.needs_reload = true;
            return;
        }
        self.error.clear();
        self.pending_list = Some(api.list_notifications_task(session));
        self.needs_reload = false;
    }

    fn begin_mutation(&mut self, action: NotificationAction, session: &Session, api: &ApiClient) {
        if self.pending_mutation.is_some() || self.pending_list.is_some() {
            return;
        }
        let (task, notice) = match &action {
            NotificationAction::MarkRead(id) => (
                api.mark_notification_read_task(session, id),
                "Đang cập nhật…",
            ),
            NotificationAction::MarkAllRead => (
                api.mark_all_notifications_read_task(session),
                "Đang cập nhật thông báo…",
            ),
            NotificationAction::Delete(id) => {
                (api.delete_notification_task(session, id), "Đang xóa…")
            }
            NotificationAction::ClearAll => {
                (api.clear_notifications_task(session), "Đang xóa thông báo…")
            }
        };
        self.pending_mutation = Some(PendingMutation { action, task });
        self.notice = notice.to_owned();
        self.error.clear();
    }

    pub fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.notifications.clear();
            self.loaded_for = Some(session.user.id.clone());
            self.last_loaded = None;
            self.needs_reload = true;
            self.error.clear();
            self.notice.clear();
        }

        if self.needs_reload && self.pending_list.is_none() && self.pending_mutation.is_none() {
            self.request_reload(session, api);
        } else if self.pending_list.is_none()
            && self.pending_mutation.is_none()
            && self
                .last_loaded
                .is_none_or(|loaded| loaded.elapsed() >= Duration::from_secs(5))
        {
            self.request_reload(session, api);
        }

        if let Some(result) = self.pending_list.as_ref().and_then(ApiClient::poll) {
            self.pending_list = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.notifications = response.data;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }

        let mutation_result = self
            .pending_mutation
            .as_ref()
            .and_then(|pending| ApiClient::poll(&pending.task));
        if let Some(result) = mutation_result {
            let pending = self
                .pending_mutation
                .take()
                .expect("pending mutation exists");
            match (pending.action, result) {
                (NotificationAction::MarkRead(id), Ok(NotificationMutation::Updated(item))) => {
                    if let Some(current) = self.notifications.iter_mut().find(|item| item.id == id)
                    {
                        *current = item;
                    }
                    self.notice = "Đã đánh dấu thông báo là đã đọc.".to_owned();
                    self.error.clear();
                }
                (NotificationAction::MarkAllRead, Ok(NotificationMutation::Replaced(items))) => {
                    self.notifications = items;
                    self.notice = "Đã đánh dấu tất cả thông báo là đã đọc.".to_owned();
                    self.error.clear();
                }
                (NotificationAction::Delete(id), Ok(NotificationMutation::Deleted)) => {
                    self.notifications.retain(|item| item.id != id);
                    self.notice = "Đã xóa thông báo.".to_owned();
                    self.error.clear();
                }
                (NotificationAction::ClearAll, Ok(NotificationMutation::Deleted)) => {
                    self.notifications.clear();
                    self.confirm_clear = false;
                    self.notice = "Đã xóa toàn bộ thông báo của bạn.".to_owned();
                    self.error.clear();
                }
                (_, Ok(_)) => self.error = "Phản hồi thao tác thông báo không hợp lệ.".to_owned(),
                (_, Err(error)) => self.error = error,
            }
            self.last_loaded = Some(Instant::now());
        }

        if self.pending_list.is_some() || self.pending_mutation.is_some() {
            ctx.request_repaint_after(Duration::from_millis(80));
        } else if let Some(last_loaded) = self.last_loaded {
            ctx.request_repaint_after(Duration::from_secs(5).saturating_sub(last_loaded.elapsed()));
        }
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        session: &Session,
        api: &ApiClient,
        nav_change: &mut Option<NavItem>,
    ) {
        let busy = self.pending_list.is_some() || self.pending_mutation.is_some();
        let mut action = None;

        ui.vertical(|ui| {
            ui.spacing_mut().item_spacing.y=0.0;
            ui.add_space(8.0);
            let compact=ui.ctx().screen_rect().width()<=992.0;
            let width=ui.available_width();
            let stack_title=compact && width<406.109375;
            let search_y=if stack_title{99.75}else{55.75};
            let (header,header_response)=ui.allocate_exact_size(egui::vec2(width,if compact{search_y+72.0}else{47.75}),egui::Sense::hover());
            header_response.widget_info(||egui::WidgetInfo::labeled(egui::WidgetType::Label,true,"Thông báo hệ thống"));
            let badge=egui::Rect::from_min_size(header.min+egui::vec2(0.0,if stack_title{0.0}else{5.875}),Vec2::splat(36.0));
            ui.painter().rect_filled(badge,6.0,Color32::from_rgb(224,242,241));
            egui::Image::from_bytes("bytes://notification-heading-bell.svg",include_bytes!("../../assets/nav-icons/BellOutlined.svg")).tint(crate::theme::PRIMARY).paint_at(ui,badge.shrink(9.0));
            let text_origin=header.min+if stack_title{egui::vec2(0.0,44.0)}else{egui::vec2(46.0,0.0)};
            ui.painter().text(text_origin+egui::vec2(0.0,13.5),egui::Align2::LEFT_CENTER,"Thông báo hệ thống",crate::native_text::weighted_font(ui.ctx(),18.0,false),Color32::from_rgb(33,33,33));
            ui.painter().text(text_origin+egui::vec2(0.0,38.375),egui::Align2::LEFT_CENTER,"Danh sách toàn bộ thông báo và cập nhật quan trọng gửi tới bạn",egui::FontId::proportional(12.5),Color32::from_rgb(117,117,117));
            let search=egui::Rect::from_min_size(if compact{header.min+egui::vec2(0.0,search_y)}else{egui::pos2(header.right()-397.078125,header.top()+7.875)},egui::vec2(if compact{width.min(332.078125)}else{280.0},32.0));
            crate::widgets::put(ui,search,egui::TextEdit::singleline(&mut self.search).hint_text("Tìm kiếm thông báo...").font(egui::FontId::new(14.0,egui::FontFamily::Name("legacy-controls".into()))));
            let refresh=egui::Rect::from_min_size(if compact{header.min+egui::vec2(0.0,search_y+40.0)}else{egui::pos2(search.right()+8.0,search.top())},egui::vec2(109.078125,32.0));
            ui.add_enabled_ui(!busy,|ui|{if crate::widgets::put(ui,refresh,egui::Button::new("Làm mới")).clicked(){self.needs_reload=true;}});
            crate::visual_test::record("notifications.header",header);
            crate::visual_test::record("notifications.search",search);
            if !self.notifications.is_empty(){
                ui.horizontal_wrapped(|ui|{
                    if self.unread_count()>0 && ui.add_enabled(!busy,egui::Button::new(format!("Đánh dấu tất cả đã đọc ({})",self.unread_count()))).clicked(){action=Some(NotificationAction::MarkAllRead);}
                    ui.menu_button("Thao tác",|ui|{if ui.add_enabled(!busy,egui::Button::new("Xóa tất cả")).clicked(){self.confirm_clear=true;ui.close_menu();}});
                });
            }
            ui.add_space(16.0);
            if !self.notice.is_empty() {
                ui.colored_label(Color32::from_rgb(0, 121, 107), &self.notice);
            }
            if !self.error.is_empty() {
                ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
            }

            if self.pending_list.is_some() && self.notifications.is_empty() {
                ui.add_space(12.0);
                ui.spinner();
                ui.label("Đang tải thông báo…");
            } else if self.notifications.is_empty() && self.error.is_empty() {
                render_empty_notifications(ui);
            } else {
                let query = self.search.trim().to_lowercase();
                let mut matched = 0usize;
                egui::ScrollArea::vertical().show(ui, |ui| {
                    for item in &self.notifications {
                        if !matches_search(item, &query) {
                            continue;
                        }
                        matched += 1;
                        egui::Frame::group(ui.style())
                            .fill(if item.unread {
                                Color32::from_rgb(240, 253, 250)
                            } else {
                                ui.visuals().extreme_bg_color
                            })
                            .show(ui, |ui| {
                                ui.horizontal(|ui| {
                                    ui.vertical(|ui| {
                                        ui.horizontal(|ui| {
                                            let title = if item.unread {
                                                RichText::new(&item.title).strong()
                                            } else {
                                                RichText::new(&item.title)
                                            };
                                            ui.label(title);
                                            if item.unread {
                                                ui.colored_label(
                                                    Color32::from_rgb(22, 163, 74),
                                                    "Mới",
                                                );
                                            }
                                            ui.label(
                                                RichText::new(&item.time)
                                                    .small()
                                                    .color(Color32::GRAY),
                                            );
                                        });
                                        ui.label(&item.message);
                                        if !item.notification_type.trim().is_empty() {
                                            ui.label(
                                                RichText::new(&item.notification_type)
                                                    .small()
                                                    .color(Color32::DARK_GRAY),
                                            );
                                        }
                                    });
                                    ui.with_layout(
                                        egui::Layout::right_to_left(egui::Align::Center),
                                        |ui| {
                                            if ui
                                                .add_enabled(
                                                    !busy,
                                                    egui::Button::new("Xóa"),
                                                )
                                                .clicked()
                                            {
                                                action = Some(NotificationAction::Delete(
                                                    item.id.clone(),
                                                ));
                                            }
                                            if item.unread
                                                && ui
                                                    .add_enabled(
                                                        !busy,
                                                        egui::Button::new("Đánh dấu đã đọc"),
                                                    )
                                                    .clicked()
                                            {
                                                action = Some(NotificationAction::MarkRead(
                                                    item.id.clone(),
                                                ));
                                            }
                                            if !item.link.is_empty()
                                                && ui
                                                    .add_enabled(
                                                        !busy,
                                                        egui::Button::new("Xem"),
                                                    )
                                                    .clicked()
                                            {
                                                if let Some(target) = resolve_notification_link(
                                                    &item.link,
                                                    session.user.role == "ADMIN",
                                                ) {
                                                    *nav_change = Some(target);
                                                } else {
                                                    self.error =
                                                        "Đường dẫn thông báo không khớp trang nội bộ.".to_owned();
                                                }
                                                if item.unread {
                                                    action = Some(NotificationAction::MarkRead(
                                                        item.id.clone(),
                                                    ));
                                                }
                                            }
                                        },
                                    );
                                });
                            });
                        ui.add_space(5.0);
                    }
                });
                if matched == 0 && !self.notifications.is_empty() {
                    ui.label("Không tìm thấy thông báo phù hợp.");
                }
            }
        });

        if self.confirm_clear {
            let mut confirm = false;
            let mut cancel = false;
            egui::Window::new("Xóa toàn bộ thông báo?")
                .collapsible(false)
                .resizable(false)
                .show(ui.ctx(), |ui| {
                    ui.label("Thao tác này chỉ xóa thông báo của tài khoản đang đăng nhập.");
                    ui.horizontal(|ui| {
                        confirm = ui
                            .add_enabled(!busy, egui::Button::new("Xóa tất cả"))
                            .clicked();
                        cancel = ui.add_enabled(!busy, egui::Button::new("Hủy")).clicked();
                    });
                });
            if confirm {
                action = Some(NotificationAction::ClearAll);
            } else if cancel {
                self.confirm_clear = false;
            }
        }

        if let Some(action) = action {
            self.begin_mutation(action, session, api);
        }
    }
}

fn render_empty_notifications(ui: &mut Ui) {
    let (rect, response) = ui.allocate_exact_size(
        egui::vec2(ui.available_width(), 213.75),
        egui::Sense::hover(),
    );
    response.widget_info(|| {
        egui::WidgetInfo::labeled(
            egui::WidgetType::Label,
            true,
            "Không có thông báo nào. Các thông báo mới từ hệ thống sẽ hiển thị tại đây",
        )
    });
    ui.painter().rect_filled(rect, 8.0, Color32::WHITE);
    ui.painter().rect_stroke(
        rect.shrink(0.5),
        8.0,
        egui::Stroke::new(1.0, Color32::from_rgb(224, 224, 224)),
    );
    let icon = egui::Rect::from_min_size(
        egui::pos2(rect.center().x - 18.0, rect.top() + 61.0),
        Vec2::splat(36.0),
    );
    egui::Image::from_bytes(
        "bytes://notification-empty-bell.svg",
        include_bytes!("../../assets/nav-icons/BellOutlined.svg"),
    )
    .tint(Color32::from_rgb(189, 189, 189))
    .paint_at(ui, icon);
    ui.painter().text(
        egui::pos2(rect.center().x, rect.top() + 119.5),
        egui::Align2::CENTER_CENTER,
        "Không có thông báo nào",
        egui::FontId::proportional(14.0),
        Color32::from_rgb(97, 97, 97),
    );
    ui.painter().text(
        egui::pos2(rect.center().x, rect.top() + 143.375),
        egui::Align2::CENTER_CENTER,
        "Các thông báo mới từ hệ thống sẽ hiển thị tại đây",
        egui::FontId::proportional(12.5),
        Color32::from_rgb(158, 158, 158),
    );
    crate::visual_test::record("notifications.empty", rect);
}

fn matches_search(notification: &UserNotification, query: &str) -> bool {
    query.is_empty()
        || notification.title.to_lowercase().contains(query)
        || notification.message.to_lowercase().contains(query)
        || notification
            .notification_type
            .to_lowercase()
            .contains(query)
}

fn notification_popover_width(viewport_width: f32) -> f32 {
    (viewport_width - 24.0).clamp(0.0, 360.0)
}

fn paint_notification_bell(painter: &egui::Painter, center: egui::Pos2, color: Color32) {
    let points = [
        egui::pos2(center.x - 4.0, center.y + 4.0),
        egui::pos2(center.x - 4.0, center.y + 1.0),
        egui::pos2(center.x - 3.0, center.y - 3.0),
        egui::pos2(center.x, center.y - 5.0),
        egui::pos2(center.x + 3.0, center.y - 3.0),
        egui::pos2(center.x + 4.0, center.y + 1.0),
        egui::pos2(center.x + 4.0, center.y + 4.0),
    ];
    let stroke = egui::Stroke::new(1.4, color);
    painter.add(egui::Shape::line(points.to_vec(), stroke));
    painter.line_segment(
        [
            egui::pos2(center.x - 6.0, center.y + 5.0),
            egui::pos2(center.x + 6.0, center.y + 5.0),
        ],
        stroke,
    );
    painter.circle_filled(egui::pos2(center.x, center.y + 7.0), 1.2, color);
}

fn notification_icon_style(notification_type: &str) -> (Color32, Color32, &'static str) {
    match notification_type {
        "payroll" => (
            Color32::from_rgb(224, 242, 241),
            Color32::from_rgb(0, 150, 136),
            "$",
        ),
        "approval" => (
            Color32::from_rgb(232, 245, 233),
            Color32::from_rgb(46, 125, 50),
            "✓",
        ),
        "timesheet" => (
            Color32::from_rgb(255, 243, 224),
            Color32::from_rgb(230, 81, 0),
            "◷",
        ),
        "proposal" => (
            Color32::from_rgb(227, 242, 253),
            Color32::from_rgb(21, 101, 192),
            "▤",
        ),
        _ => (
            Color32::from_rgb(224, 242, 241),
            Color32::from_rgb(0, 150, 136),
            "",
        ),
    }
}

fn resolve_notification_link(link: &str, is_admin: bool) -> Option<NavItem> {
    if !link.starts_with('/') || link.starts_with("//") || link.contains('\\') {
        return None;
    }
    let route = link.split(['?', '#']).next().unwrap_or_default();
    let tree = if is_admin {
        ADMIN_NAV_TREE
    } else {
        EMPLOYEE_NAV_TREE
    };
    find_nav_item(tree, route)
}

fn find_nav_item(nodes: &[NavNode], route: &str) -> Option<NavItem> {
    nodes.iter().find_map(|node| {
        (node.item.path == route)
            .then_some(node.item)
            .or_else(|| find_nav_item(node.children, route))
    })
}

#[cfg(test)]
mod tests {
    use super::{
        matches_search, notification_icon_style, notification_popover_width,
        resolve_notification_link,
    };
    use crate::api::UserNotification;
    use crate::models::{Session, StorageMode, User};
    use egui::Color32;
    use egui::{Pos2, Rect, Vec2};

    fn sample_notification() -> UserNotification {
        UserNotification {
            id: "notification-1".to_owned(),
            key: "notification-1".to_owned(),
            user_id: "employee-1".to_owned(),
            title: "Phiếu lương mới".to_owned(),
            message: "Phiếu lương tháng 10 đã được phát hành.".to_owned(),
            notification_type: "payroll".to_owned(),
            link: "/employee/payslip".to_owned(),
            read: false,
            unread: true,
            time: "Vừa xong".to_owned(),
            created_at: "2026-10-08T00:00:00Z".to_owned(),
        }
    }

    #[test]
    fn notification_search_covers_title_message_and_type() {
        let notification = sample_notification();
        assert!(matches_search(&notification, "lương"));
        assert!(matches_search(&notification, "phát hành"));
        assert!(matches_search(&notification, "payroll"));
        assert!(!matches_search(&notification, "timesheet"));
        assert!(matches_search(&notification, ""));
    }

    #[test]
    fn notification_links_only_navigate_to_role_visible_internal_routes() {
        assert_eq!(
            resolve_notification_link("/employee/files", false).map(|item| item.path),
            Some("/employee/files")
        );
        assert!(resolve_notification_link("/admin/users", false).is_none());
        assert!(resolve_notification_link("https://evil.example", true).is_none());
        assert!(resolve_notification_link("//evil.example", true).is_none());
    }

    #[test]
    fn notification_popover_respects_legacy_width_and_viewport_gutters() {
        assert_eq!(notification_popover_width(1440.0), 360.0);
        assert_eq!(notification_popover_width(768.0), 360.0);
        assert_eq!(notification_popover_width(390.0), 360.0);
        assert_eq!(notification_popover_width(320.0), 296.0);
        assert_eq!(notification_popover_width(20.0), 0.0);
    }

    #[test]
    fn notification_type_badges_keep_legacy_categories_and_colors() {
        assert_eq!(
            notification_icon_style("approval"),
            (
                Color32::from_rgb(232, 245, 233),
                Color32::from_rgb(46, 125, 50),
                "✓"
            )
        );
        assert_eq!(
            notification_icon_style("unknown"),
            (
                Color32::from_rgb(224, 242, 241),
                Color32::from_rgb(0, 150, 136),
                ""
            )
        );
    }

    #[test]
    fn header_popover_renders_notification_rows_at_mobile_canvas_size() {
        let context = egui::Context::default();
        let mut input = egui::RawInput::default();
        input.screen_rect = Some(Rect::from_min_size(Pos2::ZERO, Vec2::new(390.0, 844.0)));

        let session = Session {
            token: "test-token".to_owned(),
            session_id: "test-session".to_owned(),
            user: User {
                id: "admin-1".to_owned(),
                email: "admin@example.test".to_owned(),
                name: "Test Admin".to_owned(),
                role: "ADMIN".to_owned(),
                is_active: true,
            },
            endpoint: "/api/v1".to_owned(),
            mode: StorageMode::KiyoCloud,
        };
        let mut view = super::NotificationsView::default();
        view.notifications.push(sample_notification());
        let anchor_rect = Rect::from_min_size(Pos2::new(308.0, 8.0), Vec2::splat(32.0));
        let mut nav_change = None;
        let mut rendered = None;

        let output = context.run(input, |ctx| {
            rendered = Some(view.render_header_popover(
                ctx,
                &session,
                &crate::api::ApiClient,
                anchor_rect,
                crate::models::NavItem::admin_dashboard(),
                &mut nav_change,
            ));
        });

        let (close, rect) = rendered.expect("popover renders");
        assert!(!close);
        assert!(rect.width() >= 360.0);
        assert!(rect.width() <= 364.0);
        assert_eq!(rect.top(), 54.0);
        assert!(!output.shapes.is_empty());
        assert!(nav_change.is_none());
    }
}
