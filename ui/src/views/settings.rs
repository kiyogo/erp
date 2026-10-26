use crate::api::{ApiClient, ApiTask};
use crate::models::{Session, StorageMode};
use egui::{Color32, RichText, Ui};

pub struct SettingsView {
    pub mode: StorageMode,
    pub endpoint: String,
    pub test_result: String,
    pub is_testing: bool,
    pub notice: String,
    initialized_from_session: bool,
    pending_health: Option<ApiTask<String>>,
    current_password: String,
    new_password: String,
    confirm_password: String,
    password_error: String,
    password_notice: String,
    pending_password_change: Option<ApiTask<String>>,
    password_visible: [bool; 3],
    appearance_draft: Option<(bool, bool)>,
    account_tab: usize,
}

impl Default for SettingsView {
    fn default() -> Self {
        Self {
            mode: StorageMode::KiyoCloud,
            endpoint: StorageMode::KiyoCloud.default_endpoint().to_string(),
            test_result: String::new(),
            is_testing: false,
            notice: String::new(),
            initialized_from_session: false,
            pending_health: None,
            current_password: String::new(),
            new_password: String::new(),
            confirm_password: String::new(),
            password_error: String::new(),
            password_notice: String::new(),
            pending_password_change: None,
            password_visible: [false; 3],
            appearance_draft: None,
            account_tab: 0,
        }
    }
}

impl SettingsView {
    pub fn render_account_header(&mut self, ui: &mut Ui, session: &Session) -> usize {
        use crate::widgets::{self, Metric};
        let metrics = [
            Metric {
                label: "Cấp độ bảo mật tài khoản",
                value: "Chưa xác nhận".into(),
                detail: "Chưa có thông tin xác minh MFA / FIDO2",
                color: crate::theme::PRIMARY,
                value_size: 24.0,
            },
            Metric {
                label: "Vai trò & Đặc quyền hệ thống",
                value: session.user.role.clone(),
                detail: "Vai trò do máy chủ xác nhận",
                color: Color32::from_rgb(124, 58, 237),
                value_size: 24.0,
            },
            Metric {
                label: "Tình trạng liên kết Chữ ký số",
                value: "Chưa kết nối".into(),
                detail: "Chưa có chứng thư CA được xác nhận",
                color: crate::theme::PRIMARY,
                value_size: 24.0,
            },
            Metric {
                label: "Lần đăng nhập gần nhất",
                value: "Chưa có dữ liệu".into(),
                detail: "Không suy ra thời gian hoặc địa chỉ IP",
                color: Color32::from_rgb(30, 64, 175),
                value_size: 24.0,
            },
        ];
        ui.add_space(16.0);
        widgets::metrics(ui, "settings.account.metrics", &metrics);
        ui.add_space(16.0);
        ui.horizontal_wrapped(|ui| {
            for (i, label) in [
                "Hồ sơ cá nhân & Chức danh",
                "Thiết lập an toàn & Ký số",
                "Nhật ký hoạt động gần đây",
            ]
            .iter()
            .enumerate()
            {
                ui.selectable_value(&mut self.account_tab, i, *label);
            }
            ui.add_enabled(false, egui::Button::new("In Hồ Sơ Cán Bộ (A4)"))
                .on_disabled_hover_text("Chưa hỗ trợ xuất hoặc in hồ sơ.");
        });
        ui.add_space(16.0);
        self.account_tab
    }
    pub fn render_appearance(&mut self, ui: &mut Ui, dark: &mut bool, accordion: &mut bool) {
        let draft = self.appearance_draft.get_or_insert((*dark, *accordion));
        let cards = [
            (
                "BgColorsOutlined",
                "Chủ đề hiển thị",
                "Tùy chọn giao diện Sáng, Tối hoặc theo thiết lập hệ điều hành.",
                &[
                    ("Sáng", "SunOutlined"),
                    ("Tối", "MoonOutlined"),
                    ("Theo hệ thống", "DesktopOutlined"),
                ][..],
            ),
            (
                "TranslationOutlined",
                "Ngôn ngữ hiển thị",
                "Áp dụng chuyển đổi ngôn ngữ cho toàn bộ menu và các chức năng.",
                &[
                    ("Tiếng Việt", "GlobalOutlined"),
                    ("English", "GlobalOutlined"),
                ],
            ),
            (
                "LayoutOutlined",
                "Hiển thị biểu mẫu",
                "Chọn cách mở biểu mẫu thao tác trong hệ thống.",
                &[
                    ("CRUD Modal", "LayoutOutlined"),
                    ("Popup Form", "DesktopOutlined"),
                ],
            ),
            (
                "MenuOutlined",
                "Kiểu menu Sidebar",
                "Chuyển ngay giữa menu thả nổi (Flyout) và menu mở rộng (Accordion).",
                &[("Accordion", "MenuOutlined"), ("Flyout", "MenuOutlined")],
            ),
            (
                "DesktopOutlined",
                "Mở menu khi rê chuột",
                "Tự động mở rộng danh mục khi di chuột qua kiểu Sidebar Flyout.",
                &[("Tắt", ""), ("Bật", "")],
            ),
            (
                "MenuOutlined",
                "Accordion theo nhóm hiện tại",
                "Khi bật, Sidebar chỉ mở nhóm của trang đang xem.",
                &[("Tắt", ""), ("Theo nhóm đang xem", "")],
            ),
            (
                "TableOutlined",
                "Tab không gian làm việc",
                "Hiển thị hoặc ẩn hàng tab ở phía trên khu vực nội dung.",
                &[("Tắt tab", "TableOutlined"), ("Bật tab", "TableOutlined")],
            ),
        ];
        let colors = AppearanceColors::new(*dark);
        let changed = usize::from(draft.0 != *dark) + usize::from(draft.1 != *accordion);
        let width = ui.available_width();
        let content_width = (width - 40.0).clamp(1.0, 1120.0);
        let columns = crate::widgets::grid_columns(content_width, 320.0, 16.0, cards.len());
        let card_width = (content_width - 16.0 * (columns - 1) as f32) / columns as f32;
        let selected = [
            usize::from(draft.0),
            0,
            0,
            if draft.1 { 0 } else { 1 },
            0,
            0,
            0,
        ];
        let badge_text = if changed == 0 {
            "Cấu hình đang dùng".into()
        } else {
            format!("{changed} thay đổi chưa lưu")
        };
        let badge_width = appearance_galley(
            ui,
            &badge_text,
            12.0,
            false,
            colors.text,
            f32::INFINITY,
            18.0,
        )
        .size()
        .x + 26.0;
        let subtitle =
            "Chọn các thiết lập phù hợp để đồng bộ trải nghiệm làm việc trên toàn hệ thống.";
        let header_wrap = content_width
            < appearance_galley(ui, subtitle, 13.0, false, colors.muted, f32::INFINITY, 19.5)
                .size()
                .x
                + badge_width
                + 16.0;
        let text_width = if header_wrap {
            content_width
        } else {
            content_width - badge_width - 16.0
        };
        let title = appearance_galley(
            ui,
            "Tùy chỉnh không gian làm việc",
            21.0,
            true,
            colors.heading,
            text_width,
            27.3,
        );
        let header_title_height = title.size().y;
        let subtitle = appearance_galley(ui, subtitle, 13.0, false, colors.muted, text_width, 19.5);
        let header_height = 19.5 + 5.0 + title.size().y + 5.0 + subtitle.size().y;
        let grid_top = header_height + if header_wrap { 16.0 + 32.0 } else { 0.0 } + 20.0;
        let mut layouts = Vec::new();
        let mut row_heights = vec![0.0_f32; cards.len().div_ceil(columns)];
        for (index, (_, title, description, options)) in cards.iter().enumerate() {
            let title = appearance_galley(
                ui,
                title,
                14.0,
                true,
                colors.text,
                (card_width - 84.0).max(1.0),
                21.0,
            );
            let description = appearance_galley(
                ui,
                description,
                12.0,
                false,
                colors.muted,
                (card_width - 84.0).max(1.0),
                18.0,
            );
            let heading_height = (title.size().y + 4.0 + description.size().y).max(32.0);
            let mut rects = Vec::new();
            let (mut x, mut y) = (0.0, 0.0);
            for (choice, (label, icon)) in options.iter().enumerate() {
                let label_width = appearance_galley(
                    ui,
                    label,
                    13.0,
                    selected[index] == choice,
                    colors.text,
                    f32::INFINITY,
                    19.5,
                )
                .size()
                .x;
                let button_width = (label_width
                    + 28.0
                    + if icon.is_empty() { 0.0 } else { 21.0 }
                    + if selected[index] == choice { 18.0 } else { 0.0 })
                .max(132.0)
                .min((card_width - 42.0).max(1.0));
                if x > 0.0 && x + button_width > card_width - 42.0 + 0.1 {
                    x = 0.0;
                    y += 46.0;
                }
                rects.push(egui::Rect::from_min_size(
                    egui::pos2(x, y),
                    egui::vec2(button_width, 38.0),
                ));
                x += button_width + 8.0;
            }
            row_heights[index / columns] =
                row_heights[index / columns].max(42.0 + heading_height + 16.0 + y + 38.0);
            layouts.push((title, description, heading_height, rects));
        }
        let grid_height =
            row_heights.iter().sum::<f32>() + 16.0 * row_heights.len().saturating_sub(1) as f32;
        let footer_text = if changed == 0 {
            "Cấu hình giao diện đã được lưu".into()
        } else {
            format!("Có {changed} thay đổi chưa lưu")
        };
        let footer_description = if changed == 0 {
            "Cấu hình hiện tại sẽ được giữ nguyên sau khi tải lại trang."
        } else {
            "Bấm Lưu cấu hình để áp dụng trên toàn bộ hệ thống."
        };
        let footer_inner = (content_width - 38.0).max(1.0);
        let footer_wrap = footer_inner < 740.0;
        let footer_text_width = if footer_wrap {
            footer_inner
        } else {
            footer_inner - 334.0
        };
        let footer_title = appearance_galley(
            ui,
            &footer_text,
            13.5,
            true,
            colors.text,
            footer_text_width,
            20.25,
        );
        let footer_description = appearance_galley(
            ui,
            footer_description,
            12.0,
            false,
            colors.muted,
            footer_text_width,
            18.0,
        );
        let footer_text_height = footer_title.size().y + 2.0 + footer_description.size().y;
        let actions_height = if footer_inner < 322.0 { 72.0 } else { 32.0 };
        let footer_height = 30.0
            + if footer_wrap {
                footer_text_height + 12.0 + actions_height
            } else {
                footer_text_height.max(actions_height)
            };
        let natural_height = 20.0 + grid_top + grid_height + 20.0 + footer_height + 20.0;
        let (page, _) = ui.allocate_exact_size(
            egui::vec2(
                width,
                natural_height.max(ui.clip_rect().bottom() - ui.cursor().top()),
            ),
            egui::Sense::hover(),
        );
        ui.painter().rect_filled(page, 0.0, colors.background);
        let origin =
            page.min + egui::vec2(20.0 + ((width - 40.0 - content_width) / 2.0).max(0.0), 20.0);
        let natural_footer_top = origin.y + grid_top + grid_height + 20.0;
        let footer_top =
            natural_footer_top.min((ui.clip_rect().bottom() - 20.0 - footer_height).max(origin.y));
        let footer = egui::Rect::from_min_size(
            egui::pos2(origin.x, footer_top),
            egui::vec2(content_width, footer_height),
        );
        let label_rect = egui::Rect::from_min_size(origin, egui::vec2(text_width, 19.5));
        appearance_icon("SettingOutlined")
            .tint(crate::theme::PRIMARY)
            .paint_at(
                ui,
                egui::Rect::from_min_size(origin, egui::Vec2::splat(19.0)),
            );
        appearance_label(
            ui,
            label_rect.translate(egui::vec2(28.0, 0.0)),
            "CÀI ĐẶT GIAO DIỆN",
            13.0,
            true,
            crate::theme::PRIMARY,
            19.5,
        );
        ui.painter()
            .galley(origin + egui::vec2(0.0, 24.5), title, colors.heading);
        ui.painter().galley(
            origin + egui::vec2(0.0, 24.5 + header_title_height + 5.0),
            subtitle,
            colors.muted,
        );
        let badge = egui::Rect::from_min_size(
            origin
                + if header_wrap {
                    egui::vec2(0.0, header_height + 16.0)
                } else {
                    egui::vec2(content_width - badge_width, 0.0)
                },
            egui::vec2(badge_width.min(content_width), 32.0),
        );
        ui.painter().rect_filled(
            badge,
            999.0,
            if *dark {
                Color32::from_rgb(19, 78, 74)
            } else {
                Color32::from_rgb(236, 253, 245)
            },
        );
        ui.painter().rect_stroke(
            badge.shrink(0.5),
            999.0,
            egui::Stroke::new(
                1.0,
                if *dark {
                    Color32::from_rgb(13, 148, 136)
                } else {
                    Color32::from_rgb(167, 243, 208)
                },
            ),
        );
        appearance_label(
            ui,
            badge.shrink2(egui::vec2(12.0, 7.0)),
            &badge_text,
            12.0,
            false,
            if *dark {
                Color32::from_rgb(94, 234, 212)
            } else {
                Color32::from_rgb(4, 120, 87)
            },
            18.0,
        );
        for (
            index,
            (
                (icon, title, description, options),
                (title_galley, description_galley, heading_height, buttons),
            ),
        ) in cards.iter().zip(layouts.iter()).enumerate()
        {
            let row = index / columns;
            let card = egui::Rect::from_min_size(
                origin
                    + egui::vec2(
                        (index % columns) as f32 * (card_width + 16.0),
                        grid_top + row_heights[..row].iter().sum::<f32>() + row as f32 * 16.0,
                    ),
                egui::vec2(card_width, row_heights[row]),
            );
            appearance_record(ui, &format!("appearance.card.{index}"), card);
            let mut child = ui.new_child(
                egui::UiBuilder::new()
                    .id_salt(("appearance.card", index))
                    .max_rect(card),
            );
            let mut clip = card.intersect(ui.clip_rect());
            clip.max.y = clip.max.y.min(footer.top() - 12.0);
            child.set_clip_rect(clip);
            child.painter().add(
                egui::epaint::Shadow {
                    offset: egui::vec2(0.0, 1.0),
                    blur: 3.0,
                    spread: 0.0,
                    color: Color32::from_black_alpha(if *dark { 0 } else { 8 }),
                }
                .as_shape(card, 10.0),
            );
            child.painter().rect_filled(card, 10.0, colors.surface);
            child.painter().rect_stroke(
                card.shrink(0.5),
                10.0,
                egui::Stroke::new(1.0, colors.border),
            );
            let start = card.min + egui::Vec2::splat(21.0);
            let icon_rect = egui::Rect::from_min_size(start, egui::Vec2::splat(32.0));
            child.painter().rect_filled(
                icon_rect,
                7.0,
                if *dark {
                    Color32::from_rgb(19, 78, 74)
                } else {
                    Color32::from_rgb(224, 242, 241)
                },
            );
            appearance_icon(icon)
                .tint(crate::theme::PRIMARY)
                .paint_at(&child, icon_rect.shrink(8.0));
            child.painter().galley(
                start + egui::vec2(42.0, 0.0),
                title_galley.clone(),
                colors.text,
            );
            child.painter().galley(
                start + egui::vec2(42.0, title_galley.size().y + 4.0),
                description_galley.clone(),
                colors.muted,
            );
            child
                .interact(
                    egui::Rect::from_min_size(
                        start,
                        egui::vec2(card_width - 42.0, *heading_height),
                    ),
                    child.id().with("heading"),
                    egui::Sense::hover(),
                )
                .widget_info(|| {
                    egui::WidgetInfo::labeled(
                        egui::WidgetType::Label,
                        true,
                        format!("{title}. {description}"),
                    )
                });
            for (choice, ((label, icon), rect)) in options.iter().zip(buttons.iter()).enumerate() {
                let rect = rect.translate(start.to_vec2() + egui::vec2(0.0, heading_height + 16.0));
                let supported = (index == 0 && choice < 2) || index == 3;
                if appearance_option(
                    &mut child,
                    &format!("appearance.option.{index}.{choice}"),
                    rect,
                    label,
                    icon,
                    selected[index] == choice,
                    supported,
                    &colors,
                )
                .clicked()
                {
                    if index == 0 {
                        draft.0 = choice == 1;
                    }
                    if index == 3 {
                        draft.1 = choice == 0;
                    }
                }
            }
        }
        ui.painter().add(
            egui::epaint::Shadow {
                offset: egui::vec2(0.0, 2.0),
                blur: 8.0,
                spread: 0.0,
                color: Color32::from_black_alpha(15),
            }
            .as_shape(footer, 10.0),
        );
        ui.painter().rect_filled(footer, 10.0, colors.surface);
        ui.painter().rect_stroke(
            footer.shrink(0.5),
            10.0,
            egui::Stroke::new(
                1.0,
                if *dark {
                    colors.border
                } else {
                    Color32::from_rgb(220, 230, 238)
                },
            ),
        );
        let footer_start = footer.min + egui::vec2(19.0, 15.0);
        ui.painter().galley(footer_start, footer_title, colors.text);
        ui.painter().galley(
            footer_start + egui::vec2(0.0, footer_text_height - footer_description.size().y),
            footer_description,
            colors.muted,
        );
        let actions_start = if footer_wrap {
            footer_start + egui::vec2(0.0, footer_text_height + 12.0)
        } else {
            egui::pos2(footer.right() - 19.0 - 322.0, footer.center().y - 16.0)
        };
        let reset_rect =
            egui::Rect::from_min_size(actions_start, egui::vec2(176.0_f32.min(footer_inner), 32.0));
        let save_rect = egui::Rect::from_min_size(
            actions_start
                + if footer_inner < 322.0 {
                    egui::vec2(0.0, 40.0)
                } else {
                    egui::vec2(184.0, 0.0)
                },
            egui::vec2(138.0_f32.min(footer_inner), 32.0),
        );
        appearance_record(ui, "appearance.footer", footer);
        appearance_record(
            ui,
            "appearance.content",
            egui::Rect::from_min_size(origin, egui::vec2(content_width, natural_height - 40.0)),
        );
        appearance_record(ui, "appearance.reset", reset_rect);
        appearance_record(ui, "appearance.save", save_rect);
        if crate::widgets::put(
            ui,
            reset_rect,
            egui::Button::image_and_text(
                appearance_icon("UndoOutlined")
                    .tint(colors.text)
                    .fit_to_exact_size(egui::Vec2::splat(14.0)),
                RichText::new("Khôi phục mặc định")
                    .size(13.0)
                    .color(colors.text),
            )
            .fill(colors.surface)
            .stroke(egui::Stroke::new(1.0, colors.border)),
        )
        .clicked()
        {
            *draft = (false, false);
            *dark = false;
            *accordion = false;
        }
        if crate::widgets::put(
            ui,
            save_rect,
            egui::Button::image_and_text(
                appearance_icon("SaveOutlined").fit_to_exact_size(egui::Vec2::splat(14.0)),
                RichText::new("Lưu cấu hình")
                    .size(13.0)
                    .color(Color32::WHITE),
            )
            .fill(crate::theme::PRIMARY)
            .stroke(egui::Stroke::new(1.0, crate::theme::PRIMARY)),
        )
        .clicked()
        {
            *dark = draft.0;
            *accordion = draft.1;
        }
    }

    pub fn render_admin_account(&mut self, ui: &mut Ui, session: &Session) {
        if session.user.role != "ADMIN" {
            ui.label("Hồ sơ quản trị chỉ dành cho tài khoản ADMIN.");
            return;
        }
        let colors = AppearanceColors::new(ui.visuals().dark_mode);
        let width = ui.available_width().min(880.0);
        ui.allocate_ui_with_layout(egui::vec2(width, 0.0), egui::Layout::top_down(egui::Align::Min), |ui| {
            egui::Frame::none().fill(colors.surface).stroke(egui::Stroke::new(1.0, colors.border)).rounding(8.0).inner_margin(24.0).show(ui, |ui| {
                ui.set_width((width - 50.0).max(1.0));
                ui.horizontal_top(|ui| {
                    let (avatar, _) = ui.allocate_exact_size(egui::Vec2::splat(72.0), egui::Sense::hover());
                    ui.painter().circle_filled(avatar.center(), 36.0, crate::theme::PRIMARY);
                    ui.painter().text(avatar.center(), egui::Align2::CENTER_CENTER, session.user.name.chars().next().map(|ch| ch.to_uppercase().to_string()).unwrap_or_default(), crate::native_text::weighted_font(ui.ctx(), 28.0, true), Color32::WHITE);
                    ui.vertical(|ui| {
                        ui.add(egui::Label::new(RichText::new(&session.user.name).size(18.0).strong().color(colors.heading)).wrap());
                        ui.label("Hồ sơ tài khoản quản trị");
                        ui.label(format!("Vai trò: {}", session.user.role));
                    });
                });
                ui.add_space(20.0); ui.separator(); ui.add_space(16.0);
                let count = if ui.available_width() >= 576.0 { 2 } else { 1 };
                ui.columns(count, |columns| {
                    for (index, (label, value)) in [
                        ("Họ và tên hiển thị", session.user.name.as_str()),
                        ("Email doanh nghiệp", session.user.email.as_str()),
                        ("Vai trò tài khoản", session.user.role.as_str()),
                        ("Trạng thái tài khoản", if session.user.is_active { "Đang hoạt động" } else { "Chưa hoạt động" }),
                    ].into_iter().enumerate() {
                        let ui = &mut columns[index % count];
                        ui.label(RichText::new(label).size(12.5).color(colors.muted));
                        ui.add(egui::Label::new(RichText::new(value).color(colors.text)).wrap());
                        ui.add_space(16.0);
                    }
                });
                ui.add(egui::Label::new("Thông tin được lấy từ phiên đăng nhập. Chưa hỗ trợ chỉnh sửa hồ sơ quản trị tại đây.").wrap());
                ui.add_space(12.0);
                ui.horizontal_wrapped(|ui| {
                    ui.add_enabled(false, egui::Button::new("Chỉnh sửa hồ sơ")).on_disabled_hover_text("Chưa có thao tác chỉnh sửa hồ sơ quản trị trên trang này.");
                    ui.add_enabled(false, egui::Button::new("Lưu thay đổi hồ sơ")).on_disabled_hover_text("Thông tin đang hiển thị ở chế độ chỉ đọc.");
                });
            });
        });
    }

    pub fn clear_sensitive(&mut self) {
        self.current_password.clear();
        self.new_password.clear();
        self.confirm_password.clear();
        self.password_error.clear();
        self.password_notice.clear();
        self.pending_password_change = None;
        self.password_visible = [false; 3];
        self.initialized_from_session = false;
        self.account_tab = 0;
    }

    pub fn render_security(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
    ) {
        if let Some(task) = self.pending_password_change.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_password_change = None;
                match result {
                    Ok(message) => {
                        self.password_visible = [false; 3];
                        self.current_password.clear();
                        self.new_password.clear();
                        self.confirm_password.clear();
                        self.password_error.clear();
                        self.password_notice = message;
                    }
                    Err(error) => {
                        self.current_password.clear();
                        self.password_error = error;
                    }
                }
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            }
        }

        ui.spacing_mut().item_spacing.y = 0.0;
        ui.add_space(8.0);
        let width = ui.available_width().min(980.0);
        let compact = ctx.screen_rect().width() <= 992.0;
        let columns = if !compact && width >= 736.0 { 2 } else { 1 };
        let gap = if compact { 12.0 } else { 16.0 };
        let card_width = (width - gap * (columns - 1) as f32) / columns as f32;
        let text_height = |text: &str| {
            if text.is_empty() {
                0.0
            } else {
                ui.painter()
                    .layout(
                        text.to_owned(),
                        egui::FontId::proportional(14.0),
                        Color32::BLACK,
                        (card_width - 42.0).max(1.0),
                    )
                    .size()
                    .y
                    + 6.0
            }
        };
        let extra = text_height(&self.password_error) + text_height(&self.password_notice);
        let heights = if columns == 2 {
            [316.75 + extra, 316.75 + extra, 112.5, 112.5]
        } else {
            [
                316.75 + extra,
                188.5,
                112.5,
                if card_width < 400.0 { 126.25 } else { 109.75 },
            ]
        };
        let total_height = if columns == 2 {
            heights[0] + gap + heights[2]
        } else {
            heights.iter().sum::<f32>() + gap * 3.0
        };
        let (bounds, _) =
            ui.allocate_exact_size(egui::vec2(width, total_height), egui::Sense::hover());
        let mut submit = false;
        let pending = self.pending_password_change.is_some();
        for index in 0..4 {
            let min = if columns == 2 {
                bounds.min
                    + egui::vec2(
                        (index % 2) as f32 * (card_width + gap),
                        if index < 2 { 0.0 } else { heights[0] + gap },
                    )
            } else {
                bounds.min
                    + egui::vec2(
                        0.0,
                        heights[..index].iter().sum::<f32>() + index as f32 * gap,
                    )
            };
            let card = egui::Rect::from_min_size(min, egui::vec2(card_width, heights[index]));
            ui.painter().rect_filled(card, 8.0, Color32::WHITE);
            ui.painter().rect_stroke(
                card.shrink(0.5),
                8.0,
                egui::Stroke::new(1.0, Color32::from_rgb(224, 224, 224)),
            );
            let mut body = ui.new_child(
                egui::UiBuilder::new()
                    .id_salt(("security.card", index))
                    .max_rect(card.shrink(21.0))
                    .layout(egui::Layout::top_down(egui::Align::Min)),
            );
            body.set_clip_rect(card.intersect(ui.clip_rect()));
            body.spacing_mut().item_spacing.y = 0.0;
            let titles = [
                "Đổi mật khẩu đăng nhập",
                "Mã PIN bảo mật cá nhân",
                "Xác minh 2 bước",
                "Thiết bị đăng nhập hiện tại",
            ];
            let (title_rect, title_response) = body.allocate_exact_size(
                egui::vec2(body.available_width(), 22.5),
                egui::Sense::hover(),
            );
            title_response.widget_info(|| {
                egui::WidgetInfo::labeled(egui::WidgetType::Label, true, titles[index])
            });
            let icon = match index {
                0 => egui::Image::from_bytes(
                    "bytes://security-key.svg",
                    include_bytes!("../../assets/nav-icons/KeyOutlined.svg"),
                ),
                1 => egui::Image::from_bytes(
                    "bytes://security-lock.svg",
                    include_bytes!("../../assets/nav-icons/LockOutlined.svg"),
                ),
                2 => egui::Image::from_bytes(
                    "bytes://security-safety.svg",
                    include_bytes!("../../assets/nav-icons/SafetyCertificateOutlined.svg"),
                ),
                _ => egui::Image::from_bytes(
                    "bytes://security-mobile.svg",
                    include_bytes!("../../assets/nav-icons/MobileOutlined.svg"),
                ),
            };
            icon.tint(crate::theme::PRIMARY).paint_at(
                &body,
                egui::Rect::from_min_size(
                    title_rect.min + egui::vec2(0.0, 3.75),
                    egui::Vec2::splat(15.0),
                ),
            );
            body.painter().text(
                title_rect.left_center() + egui::vec2(21.0, 0.0),
                egui::Align2::LEFT_CENTER,
                titles[index],
                crate::native_text::weighted_font(ctx, 15.0, true),
                Color32::from_rgb(33, 33, 33),
            );
            if index == 0 {
                body.add_space(14.0);
                body.add_enabled_ui(!pending, |ui| {
                    security_password_field(
                        ui,
                        "security.current",
                        "Mật khẩu hiện tại",
                        &mut self.current_password,
                        &mut self.password_visible[0],
                        "Nhập mật khẩu cũ...",
                    );
                    security_password_field(
                        ui,
                        "security.new",
                        "Mật khẩu mới",
                        &mut self.new_password,
                        &mut self.password_visible[1],
                        "Tối thiểu 12 ký tự...",
                    );
                    security_password_field(
                        ui,
                        "security.confirm",
                        "Xác nhận mật khẩu mới",
                        &mut self.confirm_password,
                        &mut self.password_visible[2],
                        "Nhập lại mật khẩu mới...",
                    );
                });
                if !self.password_error.is_empty() {
                    body.colored_label(Color32::from_rgb(185, 28, 28), &self.password_error);
                    body.add_space(6.0);
                }
                if !self.password_notice.is_empty() {
                    body.colored_label(Color32::from_rgb(22, 101, 52), &self.password_notice);
                    body.add_space(6.0);
                }
                body.add_space(6.0);
                let (submit_rect, _) = body.allocate_exact_size(
                    egui::vec2(body.available_width(), 32.0),
                    egui::Sense::hover(),
                );
                body.add_enabled_ui(!pending, |ui| {
                    submit = crate::widgets::put(
                        ui,
                        submit_rect,
                        egui::Button::new(
                            RichText::new(if pending {
                                "Đang cập nhật..."
                            } else {
                                "Cập nhật mật khẩu"
                            })
                            .color(Color32::WHITE),
                        )
                        .fill(crate::theme::PRIMARY),
                    )
                    .clicked();
                });
            } else if index == 1 {
                body.add_space(10.0);
                egui::Frame::none()
                    .fill(Color32::from_rgb(248, 250, 252))
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                    .rounding(6.0)
                    .inner_margin(12.0)
                    .show(&mut body, |ui| {
                        ui.set_width((card_width - 68.0).max(1.0));
                        ui.label(
                            RichText::new("Trạng thái bảo vệ: Chưa có API")
                                .size(12.0)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                        ui.add_space(6.0);
                        ui.label(
                            RichText::new("Ngày cập nhật: Chưa có dữ liệu")
                                .size(12.0)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                    });
                body.add_space(14.0);
                body.add_enabled(
                    false,
                    egui::Button::new("Đổi mã PIN bảo mật")
                        .min_size(egui::vec2(body.available_width(), 32.0)),
                )
                .on_hover_text("Chưa có API PIN; không lưu PIN giả trong localStorage.");
            } else if index == 2 {
                body.add_space(16.0);
                body.add_enabled(false,egui::Button::new("Xác minh 2 bước (2SV)").min_size(egui::vec2(0.0,32.0))).on_hover_text("API chưa cung cấp trạng thái hoặc cấu hình 2FA; không khẳng định đang bật/tắt.");
            } else {
                body.add_space(10.0);
                body.label(RichText::new(&session.user.email).size(12.5));
                body.label(
                    RichText::new("Thiết bị/IP chưa được API cung cấp")
                        .size(11.0)
                        .color(Color32::from_rgb(117, 117, 117)),
                );
            }
            crate::visual_test::record(&format!("security.card.{index}"), card);
        }
        if submit {
            self.password_error.clear();
            self.password_notice.clear();
            match validate_password_change(
                &self.current_password,
                &self.new_password,
                &self.confirm_password,
            ) {
                Ok(()) => {
                    self.pending_password_change = Some(api.change_password_task(
                        session,
                        &self.current_password,
                        &self.new_password,
                        &self.confirm_password,
                    ))
                }
                Err(message) => self.password_error = message.to_string(),
            }
        }
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &mut Session,
        api: &ApiClient,
    ) {
        if !self.initialized_from_session {
            self.mode = session.mode;
            self.endpoint = session.endpoint.clone();
            self.initialized_from_session = true;
        }
        if let Some(task) = self.pending_health.as_ref() {
            if let Some(result) = ApiClient::poll(task) {
                self.pending_health = None;
                self.is_testing = false;
                self.test_result = result.unwrap_or_else(|error| format!("Lỗi: {error}"));
            } else {
                ctx.request_repaint();
            }
        }

        ui.vertical(|ui| {
            ui.label(RichText::new("CẤU HÌNH HỆ THỐNG & PHÂN VÙNG LƯU TRỮ").size(11.0).strong().color(Color32::from_rgb(0, 150, 136)));
            ui.heading("Cài đặt hệ thống");
            ui.label("Chuyển đổi phân vùng lưu trữ dữ liệu (Kiyo Cloud / Self-Hosted Linux / Local Admin) và kiểm tra kết nối.");

            if !self.notice.is_empty() {
                ui.add_space(8.0);
                egui::Frame::none()
                    .fill(Color32::from_rgb(240, 253, 244))
                    .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(187, 247, 208)))
                    .rounding(6.0)
                    .inner_margin(8.0)
                    .show(ui, |ui| {
                        ui.label(RichText::new(&self.notice).color(Color32::from_rgb(22, 101, 52)));
                    });
            }

            ui.add_space(14.0);

            egui::Frame::none()
                .fill(Color32::WHITE)
                .stroke(egui::Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                .rounding(8.0)
                .inner_margin(16.0)
                .show(ui, |ui| {
                    ui.label(RichText::new("CHẾ ĐỘ LƯU TRỮ DỮ LIỆU").strong().color(Color32::from_rgb(0, 150, 136)));
                    ui.add_space(6.0);

                    ui.radio_value(&mut self.mode, StorageMode::KiyoCloud, "Kiyo Cloud API (Đồng bộ đám mây Kiyo chính thức)");
                    ui.label(RichText::new("  Toàn bộ dữ liệu được quản lý và bảo mật bởi cụm máy chủ đám mây Kiyo Cloud.").size(11.0).color(Color32::from_rgb(100, 116, 139)));
                    ui.add_space(8.0);

                    ui.radio_value(&mut self.mode, StorageMode::SelfHosted, "Self Hosted (Máy chủ Linux riêng của bên thứ 3)");
                    ui.label(RichText::new("  Cài đặt độc lập trên VPS / Server Linux của doanh nghiệp bạn, tự cấu hình toàn quyền.").size(11.0).color(Color32::from_rgb(100, 116, 139)));
                    ui.add_space(8.0);

                    if session.user.role == "ADMIN" {
                        ui.radio_value(&mut self.mode, StorageMode::LocalAdmin, "Local Admin (Lưu trực tiếp SQLite trên máy tính cá nhân)");
                        ui.label(RichText::new("  Lưu dữ liệu tại ổ cứng cục bộ (Chỉ khả dụng cho tài khoản Quản trị viên).").size(11.0).color(Color32::from_rgb(100, 116, 139)));
                    }

                    ui.add_space(16.0);
                    ui.separator();
                    ui.add_space(10.0);

                    ui.label("Địa chỉ URL máy chủ API:");
                    ui.add(egui::TextEdit::singleline(&mut self.endpoint).desired_width(400.0));

                    ui.add_space(12.0);
                    ui.horizontal(|ui| {
                        if ui
                            .add_enabled(!self.is_testing, egui::Button::new(if self.is_testing {
                                "Đang kiểm tra..."
                            } else {
                                "Kiểm tra kết nối máy chủ"
                            }))
                            .clicked()
                        {
                            self.is_testing = true;
                            self.test_result.clear();
                            self.pending_health = Some(api.health_task(&self.endpoint));
                        }

                        let save_btn = egui::Button::new(RichText::new("Lưu cấu hình").strong().color(Color32::WHITE))
                            .fill(Color32::from_rgb(0, 150, 136));
                        if ui.add(save_btn).clicked() {
                            session.mode = self.mode;
                            session.endpoint = self.endpoint.clone();
                            self.notice = format!("Đã áp dụng chế độ {} ({})!", self.mode.label(), self.endpoint);
                        }
                    });

                    if !self.test_result.is_empty() {
                        ui.add_space(8.0);
                        let color = if self.test_result.contains("thành công") { Color32::from_rgb(22, 163, 74) } else { Color32::from_rgb(220, 38, 38) };
                        ui.label(RichText::new(&self.test_result).color(color));
                    }
                });
        });
    }
}

struct AppearanceColors {
    background: Color32,
    surface: Color32,
    border: Color32,
    heading: Color32,
    text: Color32,
    muted: Color32,
}

impl AppearanceColors {
    fn new(dark: bool) -> Self {
        if dark {
            Self {
                background: Color32::from_rgb(15, 23, 42),
                surface: Color32::from_rgb(30, 41, 59),
                border: Color32::from_rgb(51, 65, 85),
                heading: Color32::from_rgb(248, 250, 252),
                text: Color32::from_rgb(248, 250, 252),
                muted: Color32::from_rgb(148, 163, 184),
            }
        } else {
            Self {
                background: Color32::from_rgb(248, 250, 252),
                surface: Color32::WHITE,
                border: Color32::from_rgb(226, 232, 240),
                heading: Color32::from_rgb(15, 23, 42),
                text: Color32::from_rgb(30, 41, 59),
                muted: Color32::from_rgb(100, 116, 139),
            }
        }
    }
}

fn appearance_galley(
    ui: &Ui,
    text: &str,
    size: f32,
    bold: bool,
    color: Color32,
    width: f32,
    line_height: f32,
) -> std::sync::Arc<egui::Galley> {
    let mut job = egui::text::LayoutJob::default();
    job.wrap.max_width = width;
    job.append(
        text,
        0.0,
        egui::TextFormat {
            font_id: crate::native_text::weighted_font(ui.ctx(), size, bold),
            color,
            line_height: Some(line_height),
            ..Default::default()
        },
    );
    ui.fonts(|fonts| fonts.layout_job(job))
}

fn appearance_label(
    ui: &mut Ui,
    rect: egui::Rect,
    text: &str,
    size: f32,
    bold: bool,
    color: Color32,
    line_height: f32,
) {
    let galley = appearance_galley(
        ui,
        text,
        size,
        bold,
        color,
        rect.width().max(1.0),
        line_height,
    );
    ui.painter().galley(rect.min, galley, color);
    ui.interact(
        rect,
        ui.id()
            .with((text, rect.min.x.to_bits(), rect.min.y.to_bits())),
        egui::Sense::hover(),
    )
    .widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Label, true, text));
}

fn appearance_icon(name: &str) -> egui::Image<'static> {
    macro_rules! icon {
        ($name:literal) => {
            egui::Image::from_bytes(
                concat!("bytes://appearance-", $name, ".svg"),
                include_bytes!(concat!("../../assets/nav-icons/", $name, ".svg")),
            )
        };
    }
    match name {
        "BgColorsOutlined" => icon!("BgColorsOutlined"),
        "TranslationOutlined" => icon!("TranslationOutlined"),
        "LayoutOutlined" => icon!("LayoutOutlined"),
        "MenuOutlined" => icon!("MenuOutlined"),
        "DesktopOutlined" => icon!("DesktopOutlined"),
        "TableOutlined" => icon!("TableOutlined"),
        "SunOutlined" => icon!("SunOutlined"),
        "MoonOutlined" => icon!("MoonOutlined"),
        "GlobalOutlined" => icon!("GlobalOutlined"),
        "CheckOutlined" => icon!("CheckOutlined"),
        "SaveOutlined" => icon!("SaveOutlined"),
        "UndoOutlined" => icon!("UndoOutlined"),
        _ => icon!("SettingOutlined"),
    }
}

fn appearance_record(ui: &Ui, id: &str, rect: egui::Rect) {
    crate::visual_test::record(id, rect);
    #[cfg(test)]
    ui.ctx()
        .data_mut(|data| data.insert_temp(egui::Id::new(id), rect));
}

fn appearance_option(
    ui: &mut Ui,
    id: &str,
    rect: egui::Rect,
    label: &str,
    icon: &str,
    selected: bool,
    enabled: bool,
    colors: &AppearanceColors,
) -> egui::Response {
    appearance_record(ui, id, rect);
    #[cfg(test)]
    ui.ctx().data_mut(|data| {
        data.insert_temp(egui::Id::new(format!("{id}.state")), (selected, enabled))
    });
    let response = ui
        .add_enabled_ui(enabled, |ui| {
            crate::widgets::put(ui, rect, egui::Button::new("").frame(false))
        })
        .inner;
    response.widget_info(|| {
        egui::WidgetInfo::selected(egui::WidgetType::Button, enabled, selected, label)
    });
    let color = if selected {
        Color32::WHITE
    } else if response.hovered() {
        crate::theme::PRIMARY
    } else if enabled {
        colors.text
    } else {
        colors.muted
    };
    let border = if selected || response.hovered() || response.has_focus() {
        crate::theme::PRIMARY
    } else {
        colors.border
    };
    if selected {
        ui.painter().add(
            egui::epaint::Shadow {
                offset: egui::vec2(0.0, 1.0),
                blur: 3.0,
                spread: 0.0,
                color: Color32::from_rgba_unmultiplied(0, 150, 136, 64),
            }
            .as_shape(rect, 6.0),
        );
    }
    ui.painter().rect_filled(
        rect,
        6.0,
        if selected {
            crate::theme::PRIMARY
        } else {
            colors.surface
        },
    );
    ui.painter()
        .rect_stroke(rect.shrink(0.5), 6.0, egui::Stroke::new(1.0, border));
    let galley = appearance_galley(
        ui,
        label,
        13.0,
        selected,
        color,
        (rect.width()
            - 28.0
            - if icon.is_empty() { 0.0 } else { 21.0 }
            - if selected { 18.0 } else { 0.0 })
        .max(1.0),
        19.5,
    );
    let group_width = galley.size().x
        + if icon.is_empty() { 0.0 } else { 21.0 }
        + if selected { 18.0 } else { 0.0 };
    let mut x = rect.center().x - group_width / 2.0;
    if !icon.is_empty() {
        appearance_icon(icon).tint(color).paint_at(
            ui,
            egui::Rect::from_min_size(
                egui::pos2(x, rect.center().y - 7.0),
                egui::Vec2::splat(14.0),
            ),
        );
        x += 21.0;
    }
    let text_width = galley.size().x;
    ui.painter().galley(
        egui::pos2(x, rect.center().y - galley.size().y / 2.0),
        galley,
        color,
    );
    if selected {
        appearance_icon("CheckOutlined").tint(color).paint_at(
            ui,
            egui::Rect::from_min_size(
                egui::pos2(x + text_width + 7.0, rect.center().y - 5.5),
                egui::Vec2::splat(11.0),
            ),
        );
    }
    response.on_disabled_hover_text(if selected {
        "Đây là chế độ đang dùng. Chưa hỗ trợ thay đổi tùy chọn này."
    } else {
        "Tùy chọn này chưa được hỗ trợ trong ứng dụng hiện tại."
    })
}

fn security_password_field(
    ui: &mut Ui,
    id: &str,
    label: &str,
    value: &mut String,
    visible: &mut bool,
    hint: &str,
) {
    let (label_rect, label_response) = ui.allocate_exact_size(
        egui::vec2(ui.available_width(), 18.75),
        egui::Sense::hover(),
    );
    label_response.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Label, true, label));
    ui.painter().text(
        label_rect.left_center(),
        egui::Align2::LEFT_CENTER,
        label,
        egui::FontId::proportional(12.5),
        Color32::from_rgb(33, 33, 33),
    );
    ui.add_space(4.0);
    let (rect, _) =
        ui.allocate_exact_size(egui::vec2(ui.available_width(), 32.0), egui::Sense::hover());
    crate::visual_test::record(&format!("form.{id}"), rect);
    crate::widgets::put(
        ui,
        rect,
        egui::TextEdit::singleline(value)
            .id_salt(id)
            .password(!*visible)
            .hint_text(hint)
            .margin(egui::Margin {
                left: 11.0,
                right: 35.0,
                top: 4.0,
                bottom: 4.0,
            })
            .font(egui::FontId::new(
                14.0,
                egui::FontFamily::Name("legacy-controls".into()),
            )),
    )
    .labelled_by(label_response.id)
    .on_hover_text("Mật khẩu mới cần 12–256 ký tự, chữ hoa, chữ thường, số và ký tự đặc biệt.");
    let image = if *visible {
        egui::Image::from_bytes(
            "bytes://EyeOutlined.svg",
            include_bytes!("../../assets/nav-icons/EyeOutlined.svg"),
        )
    } else {
        egui::Image::from_bytes(
            "bytes://EyeInvisibleOutlined.svg",
            include_bytes!("../../assets/nav-icons/EyeInvisibleOutlined.svg"),
        )
    };
    let eye = egui::Rect::from_min_size(
        egui::pos2(rect.right() - 29.0, rect.top() + 4.0),
        egui::Vec2::splat(24.0),
    );
    let eye_response = crate::widgets::put(
        ui,
        eye,
        egui::Button::image(
            image
                .tint(Color32::from_rgb(128, 128, 128))
                .fit_to_exact_size(egui::Vec2::splat(14.0)),
        )
        .frame(false),
    );
    eye_response.widget_info(|| {
        egui::WidgetInfo::labeled(
            egui::WidgetType::Button,
            ui.is_enabled(),
            if *visible {
                "Ẩn mật khẩu"
            } else {
                "Hiện mật khẩu"
            },
        )
    });
    if eye_response
        .on_hover_text(if *visible {
            "Ẩn mật khẩu"
        } else {
            "Hiện mật khẩu"
        })
        .clicked()
    {
        *visible = !*visible;
    }
    ui.add_space(12.0);
}

fn validate_password_change(
    current_password: &str,
    new_password: &str,
    confirm_password: &str,
) -> Result<(), &'static str> {
    if current_password.is_empty() {
        return Err("Vui lòng nhập mật khẩu hiện tại.");
    }
    let length = new_password.chars().count();
    if !(12..=256).contains(&length) {
        return Err("Mật khẩu mới phải dài từ 12 đến 256 ký tự.");
    }
    if !new_password.chars().any(char::is_lowercase)
        || !new_password.chars().any(char::is_uppercase)
        || !new_password.chars().any(|c| c.is_ascii_digit())
        || !new_password
            .chars()
            .any(|c| !c.is_alphanumeric() && !c.is_whitespace())
    {
        return Err("Mật khẩu mới cần chữ hoa, chữ thường, số và ký tự đặc biệt.");
    }
    if new_password != confirm_password {
        return Err("Xác nhận mật khẩu mới không trùng khớp.");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_password_change;

    fn appearance_frame(
        ctx: &egui::Context,
        view: &mut super::SettingsView,
        dark: &mut bool,
        accordion: &mut bool,
        width: f32,
        events: Vec<egui::Event>,
    ) -> egui::FullOutput {
        crate::native_text::apply_visuals(ctx, *dark);
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
                egui::CentralPanel::default().show(ctx, |ui| {
                    let right = ui.max_rect().right();
                    view.render_appearance(ui, dark, accordion);
                    assert!(
                        ui.min_rect().right() <= right + 1.0,
                        "appearance overflow at {width}"
                    );
                });
            },
        )
    }

    fn appearance_rect(ctx: &egui::Context, id: &str) -> egui::Rect {
        ctx.data_mut(|data| data.get_temp::<egui::Rect>(egui::Id::new(id)))
            .unwrap()
    }

    fn click_appearance(
        ctx: &egui::Context,
        view: &mut super::SettingsView,
        dark: &mut bool,
        accordion: &mut bool,
        id: &str,
    ) {
        let pos = appearance_rect(ctx, id).center();
        for pressed in [true, false] {
            appearance_frame(
                ctx,
                view,
                dark,
                accordion,
                1440.0,
                vec![
                    egui::Event::PointerMoved(pos),
                    egui::Event::PointerButton {
                        pos,
                        button: egui::PointerButton::Primary,
                        pressed,
                        modifiers: egui::Modifiers::NONE,
                    },
                ],
            );
        }
        appearance_frame(ctx, view, dark, accordion, 1440.0, vec![]);
    }

    #[test]
    fn appearance_clicks_save_and_reset_only_supported_preferences() {
        let ctx = egui::Context::default();
        crate::native_text::setup_fonts(&ctx);
        crate::native_text::setup_style(&ctx);
        let mut view = super::SettingsView::default();
        let (mut dark, mut accordion) = (false, false);
        for _ in 0..3 {
            appearance_frame(&ctx, &mut view, &mut dark, &mut accordion, 1440.0, vec![]);
        }
        let state = |id: &str| {
            ctx.data_mut(|data| {
                data.get_temp::<(bool, bool)>(egui::Id::new(format!("{id}.state")))
                    .unwrap()
            })
        };
        assert_eq!(
            state("appearance.option.2.0"),
            (true, false),
            "CRUD Modal is the real shared form mode"
        );
        assert_eq!(
            state("appearance.option.3.0"),
            (false, true),
            "Accordion is first"
        );
        assert_eq!(
            state("appearance.option.3.1"),
            (true, true),
            "Flyout is the active default"
        );
        assert_eq!(
            state("appearance.option.4.0"),
            (true, false),
            "Hover is off"
        );
        for id in [
            "appearance.option.0.2",
            "appearance.option.1.1",
            "appearance.option.2.1",
            "appearance.option.4.1",
            "appearance.option.5.1",
            "appearance.option.6.1",
        ] {
            click_appearance(&ctx, &mut view, &mut dark, &mut accordion, id);
            assert_eq!(view.appearance_draft, Some((false, false)));
            assert!(!dark && !accordion);
        }
        click_appearance(
            &ctx,
            &mut view,
            &mut dark,
            &mut accordion,
            "appearance.option.0.1",
        );
        assert_eq!(view.appearance_draft, Some((true, false)));
        assert!(!dark && !accordion);
        click_appearance(
            &ctx,
            &mut view,
            &mut dark,
            &mut accordion,
            "appearance.option.3.0",
        );
        assert_eq!(view.appearance_draft, Some((true, true)));
        assert!(!dark && !accordion);
        click_appearance(
            &ctx,
            &mut view,
            &mut dark,
            &mut accordion,
            "appearance.save",
        );
        assert!(dark && accordion);
        click_appearance(
            &ctx,
            &mut view,
            &mut dark,
            &mut accordion,
            "appearance.option.3.1",
        );
        assert_eq!(view.appearance_draft, Some((true, false)));
        assert!(dark && accordion, "Flyout stays a draft until saved");
        click_appearance(
            &ctx,
            &mut view,
            &mut dark,
            &mut accordion,
            "appearance.reset",
        );
        assert!(!dark && !accordion);
        assert_eq!(view.appearance_draft, Some((false, false)));
    }

    #[test]
    fn appearance_grid_centers_and_stretches_rows_with_dark_and_narrow_bounds() {
        for width in [320.0, 390.0, 768.0, 1440.0] {
            for saved_dark in [false, true] {
                let ctx = egui::Context::default();
                crate::native_text::setup_fonts(&ctx);
                crate::native_text::setup_style(&ctx);
                let mut view = super::SettingsView::default();
                let (mut dark, mut accordion) = (saved_dark, false);
                let mut output = None;
                for _ in 0..3 {
                    output = Some(appearance_frame(
                        &ctx,
                        &mut view,
                        &mut dark,
                        &mut accordion,
                        width,
                        vec![],
                    ));
                }
                let content = appearance_rect(&ctx, "appearance.content");
                assert!(
                    content.width() <= 1120.0 && (content.center().x - width / 2.0).abs() < 0.1
                );
                let columns = crate::widgets::grid_columns(content.width(), 320.0, 16.0, 7);
                for index in 0..7 {
                    let card = appearance_rect(&ctx, &format!("appearance.card.{index}"));
                    assert!(
                        card.left() >= content.left() - 0.1
                            && card.right() <= content.right() + 0.1
                    );
                    if index % columns > 0 {
                        let previous =
                            appearance_rect(&ctx, &format!("appearance.card.{}", index - 1));
                        assert!((card.top() - previous.top()).abs() < 0.1);
                        assert!((card.height() - previous.height()).abs() < 0.1);
                        assert!((card.left() - previous.right() - 16.0).abs() < 0.1);
                    }
                    for choice in 0..if index == 0 { 3 } else { 2 } {
                        let option =
                            appearance_rect(&ctx, &format!("appearance.option.{index}.{choice}"));
                        assert!(
                            card.shrink(20.0).contains_rect(option),
                            "{width}: card {index}, option {choice}: {card:?} / {option:?}"
                        );
                        assert_eq!(option.height(), 38.0);
                    }
                }
                let first = appearance_rect(&ctx, "appearance.option.0.0");
                assert_eq!(first.width(), 132.0);
                let footer = appearance_rect(&ctx, "appearance.footer");
                assert!(
                    footer.bottom() <= 900.0 && footer.left() >= 0.0 && footer.right() <= width
                );
                assert!(footer.contains_rect(appearance_rect(&ctx, "appearance.save")));
                assert!(footer.contains_rect(appearance_rect(&ctx, "appearance.reset")));
                let surface = super::AppearanceColors::new(saved_dark).surface;
                let first_card = appearance_rect(&ctx, "appearance.card.0");
                assert!(output.unwrap().shapes.iter().any(|shape| matches!(&shape.shape, egui::epaint::Shape::Rect(rect) if rect.rect == first_card && rect.fill == surface)));
            }
        }
    }

    fn rendered_text(output: &egui::FullOutput) -> String {
        fn collect(shape: &egui::epaint::Shape, text: &mut String) {
            match shape {
                egui::epaint::Shape::Text(value) => {
                    text.push_str(&value.galley.job.text);
                    text.push('\n');
                }
                egui::epaint::Shape::Vec(shapes) => {
                    for shape in shapes {
                        collect(shape, text);
                    }
                }
                _ => {}
            }
        }
        let mut text = String::new();
        for shape in &output.shapes {
            collect(&shape.shape, &mut text);
        }
        text
    }

    #[test]
    fn admin_account_uses_only_current_session_and_never_employee_profile_data() {
        let mut session = crate::models::Session {
            token: String::new(),
            session_id: "test-admin".into(),
            endpoint: String::new(),
            mode: crate::models::StorageMode::KiyoCloud,
            user: crate::models::User {
                id: "admin".into(),
                name: "Tên quản trị thật".into(),
                email: "actual-admin@example.test".into(),
                role: "ADMIN".into(),
                is_active: false,
            },
        };
        for width in [320.0, 390.0, 768.0, 1440.0] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            crate::native_text::setup_style(&ctx);
            let mut view = super::SettingsView::default();
            let mut render = |session: &crate::models::Session| {
                ctx.run(
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
                            view.render_admin_account(ui, session);
                            assert!(
                                ui.min_rect().right() <= right + 1.0,
                                "admin account overflow at {width}"
                            );
                        });
                    },
                )
            };
            let text = rendered_text(&render(&session));
            assert!(
                text.contains(&session.user.name)
                    && text.contains(&session.user.email)
                    && text.contains("ADMIN")
                    && text.contains("Chưa hoạt động")
            );
            for fabricated in ["NV-001", "Ban Giám Đốc", "FIDO2", "VNPT-CA", "Super Admin"] {
                assert!(!text.contains(fabricated));
            }
            session.user.role = "USER".into();
            session.user.name = "Private employee".into();
            session.user.email = "private-employee@example.test".into();
            let denied = rendered_text(&render(&session));
            assert!(
                !denied.contains("actual-admin@example.test")
                    && !denied.contains("private-employee@example.test")
                    && !denied.contains("Private employee")
            );
            session.user.role = "ADMIN".into();
            session.user.name = "Tên quản trị thật".into();
            session.user.email = "actual-admin@example.test".into();
            assert!(view.pending_health.is_none() && view.pending_password_change.is_none());
        }
    }

    #[test]
    fn appearance_cards_fit_supported_widths_without_applying_unsaved_draft() {
        for width in [320.0, 390.0, 768.0, 1440.0] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            crate::native_text::setup_style(&ctx);
            let mut view = super::SettingsView::default();
            view.appearance_draft = Some((true, true));
            let (mut dark, mut accordion) = (false, false);
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
                        view.render_appearance(ui, &mut dark, &mut accordion);
                        assert!(
                            ui.min_rect().right() <= right + 1.0,
                            "appearance overflow at {width}"
                        );
                    });
                },
            );
            assert!(!dark && !accordion, "rendering must not commit a draft");
        }
    }

    #[test]
    fn account_header_keeps_real_role_and_fits_narrow_windows() {
        let session = crate::models::Session {
            token: String::new(),
            session_id: "test".into(),
            endpoint: String::new(),
            mode: crate::models::StorageMode::KiyoCloud,
            user: crate::models::User {
                id: "employee".into(),
                name: "Nhân viên".into(),
                email: "employee@example.test".into(),
                role: "USER".into(),
                is_active: true,
            },
        };
        for width in [320.0, 390.0, 768.0, 1440.0] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            crate::native_text::setup_style(&ctx);
            let mut view = super::SettingsView::default();
            view.account_tab = 2;
            let output = ctx.run(
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
                        assert_eq!(view.render_account_header(ui, &session), 2);
                        assert!(
                            ui.min_rect().right() <= right + 1.0,
                            "account header overflow at {width}"
                        );
                    });
                },
            );
            assert!(!output.shapes.is_empty());
            view.clear_sensitive();
            assert_eq!(view.account_tab, 0);
        }
    }

    #[test]
    fn leaving_security_clears_passwords_and_visibility() {
        let mut view = super::SettingsView::default();
        view.current_password = "private".to_owned();
        view.new_password = "private".to_owned();
        view.confirm_password = "private".to_owned();
        view.password_visible = [true; 3];
        view.clear_sensitive();
        assert!(
            view.current_password.is_empty()
                && view.new_password.is_empty()
                && view.confirm_password.is_empty()
        );
        assert_eq!(view.password_visible, [false; 3]);
    }

    #[test]
    fn password_change_validates_fields() {
        assert!(validate_password_change("", "NewPassword-123!", "NewPassword-123!").is_err());
        assert!(validate_password_change("OldPassword-123!", "short", "short").is_err());
        assert!(
            validate_password_change("OldPassword-123!", "NewPassword123é", "NewPassword123é")
                .is_err()
        );
        assert!(validate_password_change("OldPassword-123!", "NewPassword-123!", "wrong").is_err());
        assert!(
            validate_password_change("OldPassword-123!", "NewPassword-123!", "NewPassword-123!")
                .is_ok()
        );
    }
}
