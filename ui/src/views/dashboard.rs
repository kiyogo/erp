use crate::api::{ApiClient, ApiTask, AuditLogEntry, DashboardPendingWorkflow, DashboardStats};
use crate::models::{NavGroup, NavItem, Session};
use egui::{Align, Align2, Color32, FontId, Layout, RichText, Sense, Stroke, TextureHandle, Ui};
use std::collections::HashMap;
use std::time::Duration;
use web_time::Instant;

const LEGACY_TEAL: Color32 = Color32::from_rgb(0, 150, 136);
const LEGACY_TEXT: Color32 = Color32::from_rgb(33, 33, 33);
const LEGACY_MUTED: Color32 = Color32::from_rgb(117, 117, 117);
const LEGACY_BORDER: Color32 = Color32::from_rgb(224, 224, 224);
const LEGACY_GREEN: Color32 = Color32::from_rgb(16, 185, 129);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum DashboardIcon {
    CloudServerOutlined,
    CalendarOutlined,
    TeamOutlined,
    DollarOutlined,
    ClockCircleOutlined,
    SafetyCertificateOutlined,
}

impl DashboardIcon {
    const fn name(self) -> &'static str {
        match self {
            Self::CloudServerOutlined => "CloudServerOutlined",
            Self::CalendarOutlined => "CalendarOutlined",
            Self::TeamOutlined => "TeamOutlined",
            Self::DollarOutlined => "DollarOutlined",
            Self::ClockCircleOutlined => "ClockCircleOutlined",
            Self::SafetyCertificateOutlined => "SafetyCertificateOutlined",
        }
    }

    const fn svg_bytes(self) -> &'static [u8] {
        match self {
            Self::CloudServerOutlined => {
                include_bytes!("../../assets/nav-icons/CloudServerOutlined.svg")
            }
            Self::CalendarOutlined => include_bytes!("../../assets/nav-icons/CalendarOutlined.svg"),
            Self::TeamOutlined => include_bytes!("../../assets/nav-icons/TeamOutlined.svg"),
            Self::DollarOutlined => include_bytes!("../../assets/nav-icons/DollarOutlined.svg"),
            Self::ClockCircleOutlined => {
                include_bytes!("../../assets/nav-icons/ClockCircleOutlined.svg")
            }
            Self::SafetyCertificateOutlined => {
                include_bytes!("../../assets/nav-icons/SafetyCertificateOutlined.svg")
            }
        }
    }
}

#[derive(Default)]
pub struct DashboardView {
    stats: Option<DashboardStats>,
    task: Option<ApiTask<DashboardStats>>,
    loaded_for: Option<String>,
    needs_reload: bool,
    last_loaded: Option<Instant>,
    error: String,
    icon_textures: HashMap<DashboardIcon, TextureHandle>,
}

#[derive(Clone, Copy)]
struct QuickAction {
    label: &'static str,
    target: NavItem,
}

const QUICK_ACTIONS: [QuickAction; 7] = [
    QuickAction {
        label: "Thêm nhân viên mới",
        target: NavItem::new(
            "hr-employees",
            "Nhân viên",
            "/admin/hr/employees",
            "👤",
            NavGroup::Hr,
        ),
    },
    QuickAction {
        label: "Tạo đơn mua hàng (PO)",
        target: NavItem::new(
            "fin-pur-orders",
            "Đơn mua hàng",
            "/admin/finance/purchasing/orders",
            "🧾",
            NavGroup::Finance,
        ),
    },
    QuickAction {
        label: "Lập đơn đặt hàng bán (SO)",
        target: NavItem::new(
            "fin-sale-orders",
            "Đơn đặt hàng",
            "/admin/finance/sales/orders",
            "🧾",
            NavGroup::Finance,
        ),
    },
    QuickAction {
        label: "Lập hóa đơn điện tử VAT",
        target: NavItem::new(
            "fin-einv-create",
            "Lập hóa đơn",
            "/admin/finance/e-invoice/create",
            "➕",
            NavGroup::Finance,
        ),
    },
    QuickAction {
        label: "Đặt phòng họp hội nghị",
        target: NavItem::new(
            "mr-calendar",
            "Lịch phòng họp",
            "/admin/meeting-rooms/calendar",
            "🗓",
            NavGroup::MeetingRooms,
        ),
    },
    QuickAction {
        label: "Đám mây Cloud Drive",
        target: NavItem::new("files", "Thư mục", "/admin/files", "📁", NavGroup::Files),
    },
    QuickAction {
        label: "Tùy biến giao diện",
        target: NavItem::new(
            "set-appearance",
            "Giao diện",
            "/admin/settings/appearance",
            "🎨",
            NavGroup::Settings,
        ),
    },
];

struct MetricCard {
    title: &'static str,
    value: String,
    change: String,
    icon: MetricIcon,
    icon_color: Color32,
    icon_background: Color32,
    target: NavItem,
}

#[derive(Clone, Copy)]
enum MetricIcon {
    Svg(DashboardIcon),
    CheckCircle,
}

impl DashboardView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        nav_change: &mut Option<NavItem>,
    ) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.stats = None;
            self.loaded_for = Some(session.user.id.clone());
            self.needs_reload = true;
            self.last_loaded = None;
        }

        if self.stats.is_some()
            && self
                .last_loaded
                .is_some_and(|loaded| loaded.elapsed() >= Duration::from_secs(15))
            && self.task.is_none()
        {
            self.needs_reload = true;
        }

        if self.needs_reload && self.task.is_none() {
            self.error.clear();
            self.task = Some(api.dashboard_stats_task(session));
            self.needs_reload = false;
        }
        if let Some(result) = self.task.as_ref().and_then(ApiClient::poll) {
            self.task = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(stats) => {
                    self.stats = Some(stats);
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if self.task.is_some() {
            ctx.request_repaint_after(Duration::from_millis(80));
        } else if self.stats.is_some() {
            ctx.request_repaint_after(Duration::from_secs(15));
        }

        let stats = self.stats.as_ref();
        let employee_count = stats.map_or(0, |stats| stats.total_employees);
        let active_count = stats.map_or(0, |stats| stats.active_users);
        let new_employee_count = stats.map_or(0, |stats| stats.new_employees_this_month);
        let pending_count = stats.map_or(0, |stats| stats.pending_approvals_count);
        let revenue = stats.map_or(0, |stats| stats.monthly_revenue);
        let pending_workflows = stats.map_or(&[][..], |stats| stats.pending_workflows.as_slice());
        let is_compact = is_compact_viewport(ctx.screen_rect().width());
        let stats_loaded = stats.is_some();
        let financial_available = stats.is_some_and(|stats| stats.financial_metrics_available);
        let audit_status = if self.task.is_some() && !stats_loaded {
            Some("Đang tải nhật ký hoạt động…")
        } else if !stats.is_some_and(|stats| stats.audit_logs_available) {
            Some("Chưa tải được nhật ký hoạt động")
        } else {
            None
        };

        ui.vertical(|ui| {
            ui.set_width(ui.available_width());
            ui.spacing_mut().item_spacing.y = 0.0;
            ui.add_space(8.0);
            if !self.error.is_empty() {
                egui::Frame::group(ui.style())
                    .fill(Color32::from_rgb(254, 242, 242))
                    .stroke(Stroke::new(1.0, Color32::from_rgb(254, 202, 202)))
                    .inner_margin(egui::Margin::symmetric(12.0, 8.0))
                    .show(ui, |ui| {
                        ui.horizontal_wrapped(|ui| {
                            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                            if stats_loaded {
                                ui.label("Đang hiển thị số liệu từ lần tải thành công gần nhất.");
                            }
                            if ui.button("Thử tải lại").clicked() {
                                self.needs_reload = true;
                            }
                        });
                    });
                ui.add_space(8.0);
            }
            render_health_banner(
                ui,
                ctx,
                &mut self.icon_textures,
                active_count,
                pending_count,
                financial_available.then_some(revenue),
                pending_workflows.len(),
                stats_loaded,
                nav_change,
            );
            ui.add_space(20.0);

            let metric_cards = [
                MetricCard {
                    title: "Tổng số cán bộ nhân viên",
                    value: if stats_loaded {
                        format!("{employee_count} nhân sự")
                    } else {
                        "— nhân sự".to_owned()
                    },
                    change: if !stats_loaded {
                        "Chưa có dữ liệu từ máy chủ".to_owned()
                    } else if new_employee_count > 0 {
                        format!("+{new_employee_count} tuyển dụng mới")
                    } else {
                        "Hồ sơ nhân sự".to_owned()
                    },
                    icon: MetricIcon::Svg(DashboardIcon::TeamOutlined),
                    icon_color: Color32::from_rgb(0, 150, 136),
                    icon_background: Color32::from_rgb(224, 242, 241),
                    target: NavItem::new(
                        "hr-employees",
                        "Nhân viên",
                        "/admin/hr/employees",
                        "👤",
                        NavGroup::Hr,
                    ),
                },
                MetricCard {
                    title: "Doanh thu phát sinh thực tế",
                    value: if financial_available {
                        format_money(revenue)
                    } else {
                        "—".to_owned()
                    },
                    change: if !financial_available {
                        "Chưa có dữ liệu từ máy chủ".to_owned()
                    } else if revenue > 0 {
                        "Thu chi tài chính thực tế".to_owned()
                    } else {
                        "Chưa có phát sinh thu".to_owned()
                    },
                    icon: MetricIcon::Svg(DashboardIcon::DollarOutlined),
                    icon_color: Color32::from_rgb(16, 185, 129),
                    icon_background: Color32::from_rgb(209, 250, 229),
                    target: NavItem::new(
                        "fin-overview",
                        "Tổng quan",
                        "/admin/finance/overview",
                        "📊",
                        NavGroup::Finance,
                    ),
                },
                MetricCard {
                    title: "Hồ sơ chờ phê duyệt",
                    value: if stats_loaded {
                        format!("{pending_count} hồ sơ")
                    } else {
                        "— hồ sơ".to_owned()
                    },
                    change: if !stats_loaded {
                        "Chưa có dữ liệu từ máy chủ".to_owned()
                    } else if pending_count > 0 {
                        "Cần giải quyết".to_owned()
                    } else {
                        "Đã xử lý toàn bộ".to_owned()
                    },
                    icon: MetricIcon::Svg(DashboardIcon::ClockCircleOutlined),
                    icon_color: Color32::from_rgb(245, 158, 11),
                    icon_background: Color32::from_rgb(254, 243, 199),
                    target: workflow_requests_nav(),
                },
                MetricCard {
                    title: "Tài khoản đang hoạt động",
                    value: if stats_loaded {
                        format!("{active_count} tài khoản")
                    } else {
                        "— tài khoản".to_owned()
                    },
                    change: if stats_loaded {
                        "Trực tuyến trên hệ thống".to_owned()
                    } else {
                        "Chưa có dữ liệu từ máy chủ".to_owned()
                    },
                    icon: MetricIcon::CheckCircle,
                    icon_color: Color32::from_rgb(99, 102, 241),
                    icon_background: Color32::from_rgb(238, 242, 255),
                    target: NavItem::new(
                        "hr-employees",
                        "Nhân viên",
                        "/admin/hr/employees",
                        "👤",
                        NavGroup::Hr,
                    ),
                },
            ];

            let cards_per_row = if is_compact {
                1
            } else {
                crate::widgets::grid_columns(ui.available_width(), 210.0, 14.0, metric_cards.len())
            };
            for (row_index, row) in metric_cards.chunks(cards_per_row).enumerate() {
                ui.spacing_mut().item_spacing.x = 14.0;
                ui.columns(cards_per_row, |columns| {
                    for (column_index, (column, card)) in
                        columns.iter_mut().zip(row.iter()).enumerate()
                    {
                        let card_index = row_index * cards_per_row + column_index;
                        if render_metric_card(
                            column,
                            ctx,
                            &mut self.icon_textures,
                            card,
                            card_index,
                        ) {
                            *nav_change = Some(card.target);
                        }
                    }
                });
                if (row_index + 1) * cards_per_row < metric_cards.len() {
                    ui.add_space(if is_compact { 12.0 } else { 14.0 });
                }
            }
            ui.add_space(24.0);

            if !pending_workflows.is_empty() {
                render_approval_feed(ui, pending_workflows, pending_count, nav_change);
                ui.add_space(20.0);
            }

            if is_compact {
                render_quick_actions(ui, nav_change);
                ui.add_space(14.0);
                render_recent_activities(
                    ui,
                    stats.map_or(&[][..], |stats| &stats.recent_audit_logs),
                    false,
                    audit_status,
                );
            } else {
                ui.spacing_mut().item_spacing.x = 14.0;
                ui.columns(2, |columns| {
                    render_quick_actions(&mut columns[0], nav_change);
                    render_recent_activities(
                        &mut columns[1],
                        stats.map_or(&[][..], |stats| &stats.recent_audit_logs),
                        true,
                        audit_status,
                    );
                });
            }
        });
    }
}

fn is_compact_viewport(width: f32) -> bool {
    width <= 992.0
}

fn render_health_banner(
    ui: &mut Ui,
    ctx: &egui::Context,
    icon_textures: &mut HashMap<DashboardIcon, TextureHandle>,
    active_users: usize,
    pending_count: usize,
    revenue: Option<i64>,
    pending_rows: usize,
    stats_loaded: bool,
    nav_change: &mut Option<NavItem>,
) {
    let width = ui.available_width();
    let compact = is_compact_viewport(ctx.screen_rect().width());
    let stacked = width < 733.0;
    let title = format!(
        "Tổng quan vận hành ngày {}",
        chrono::Utc::now().format("%Y-%m-%d")
    );
    let subtitle = if stats_loaded {
        format!(
            "{active_users} tài khoản hoạt động · {pending_count} hồ sơ chờ xử lý · Thu tháng {}",
            revenue.map(format_money).unwrap_or_else(|| "—".to_owned())
        )
    } else {
        "Số liệu tổng quan đang được tải từ máy chủ".to_owned()
    };
    let title_width = if stacked { width - 72.0 } else { width - 525.0 };
    let title_galley = egui::WidgetText::RichText(
        RichText::new(title)
            .size(14.0)
            .strong()
            .line_height(Some(21.0))
            .color(Color32::WHITE)
            .into(),
    )
    .into_galley(
        ui,
        Some(egui::TextWrapMode::Wrap),
        title_width.max(1.0),
        egui::TextStyle::Body,
    );
    let subtitle_galley = egui::WidgetText::RichText(
        RichText::new(subtitle)
            .size(12.0)
            .line_height(Some(18.0))
            .color(Color32::from_rgb(224, 242, 241))
            .into(),
    )
    .into_galley(
        ui,
        Some(egui::TextWrapMode::Wrap),
        title_width.max(1.0),
        egui::TextStyle::Body,
    );
    let left_height = title_galley.size().y + 2.0 + subtitle_galley.size().y;
    let right_height = if stacked && compact { 54.0 } else { 28.0 };
    let height = 28.0
        + if stacked {
            left_height + 8.0 + right_height
        } else {
            left_height.max(right_height)
        };
    let (rect, _) = ui.allocate_exact_size(egui::vec2(width, height), Sense::hover());
    crate::widgets::gradient_panel(
        ui.painter(),
        rect,
        8.0,
        Color32::from_rgb(0, 77, 64),
        Color32::from_rgb(0, 121, 107),
    );
    let left_y = rect.top()
        + 14.0
        + (if stacked {
            0.0
        } else {
            (height - 28.0 - left_height) / 2.0
        });
    let text_x = rect.left() + if compact { 52.0 } else { 56.0 };
    paint_dashboard_icon(
        ctx,
        icon_textures,
        ui.painter(),
        egui::pos2(rect.left() + 32.0, left_y + left_height / 2.0),
        DashboardIcon::CloudServerOutlined,
        Color32::from_rgb(167, 243, 208),
        24.0,
    );
    ui.painter().galley(
        egui::pos2(text_x, left_y),
        title_galley.clone(),
        Color32::WHITE,
    );
    ui.painter().galley(
        egui::pos2(text_x, left_y + title_galley.size().y + 2.0),
        subtitle_galley,
        Color32::from_rgb(224, 242, 241),
    );
    let right_x = if stacked {
        rect.left() + 20.0
    } else {
        rect.right() - 461.0
    };
    let right_y = if stacked {
        left_y + left_height + 8.0
    } else {
        rect.center().y - 14.0
    };
    paint_dashboard_icon(
        ctx,
        icon_textures,
        ui.painter(),
        egui::pos2(
            right_x + 6.0,
            if stacked && compact {
                right_y + 9.0
            } else {
                right_y + 14.0
            },
        ),
        DashboardIcon::SafetyCertificateOutlined,
        Color32::from_rgb(167, 243, 208),
        12.0,
    );
    ui.painter().text(
        egui::pos2(
            right_x + 16.0,
            if stacked && compact {
                right_y + 9.0
            } else {
                right_y + 14.0
            },
        ),
        Align2::LEFT_CENTER,
        "Dữ liệu lấy từ backend hiện tại",
        FontId::proportional(12.0),
        Color32::from_rgb(224, 242, 241),
    );
    let button_y = if stacked && compact {
        right_y + 26.0
    } else {
        right_y
    };
    let button_x = if stacked && compact {
        right_x
    } else {
        right_x + 187.0
    };
    let calendar =
        egui::Rect::from_min_size(egui::pos2(button_x, button_y), egui::vec2(127.92, 28.0));
    let calendar_button = crate::widgets::put(
        ui,
        calendar,
        egui::Button::new(
            RichText::new("    Lịch phòng họp")
                .size(13.0)
                .color(Color32::WHITE),
        )
        .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 38))
        .stroke(Stroke::new(
            1.0,
            Color32::from_rgba_unmultiplied(255, 255, 255, 76),
        )),
    );
    paint_dashboard_icon(
        ctx,
        icon_textures,
        ui.painter(),
        calendar.left_center() + egui::vec2(16.0, 0.0),
        DashboardIcon::CalendarOutlined,
        Color32::WHITE,
        13.0,
    );
    if calendar_button.clicked() {
        *nav_change = Some(NavItem::new(
            "mr-calendar",
            "Lịch phòng họp",
            "/admin/meeting-rooms/calendar",
            "🗓",
            NavGroup::MeetingRooms,
        ));
    }
    let approve = egui::Rect::from_min_size(
        egui::pos2(calendar.right() + if compact { 8.0 } else { 6.0 }, button_y),
        egui::vec2(108.19, 28.0),
    );
    if crate::widgets::put(
        ui,
        approve,
        egui::Button::new(
            RichText::new(if stats_loaded {
                format!("Duyệt hồ sơ ({pending_rows})")
            } else {
                "Duyệt hồ sơ (—)".to_owned()
            })
            .size(13.0)
            .color(Color32::WHITE),
        )
        .fill(Color32::from_rgb(16, 185, 129))
        .stroke(Stroke::new(1.0, Color32::from_rgb(16, 185, 129))),
    )
    .clicked()
    {
        *nav_change = Some(workflow_requests_nav());
    }
    crate::visual_test::record("dashboard.banner", rect);
}
fn render_metric_card(
    ui: &mut Ui,
    ctx: &egui::Context,
    icon_textures: &mut HashMap<DashboardIcon, TextureHandle>,
    card: &MetricCard,
    index: usize,
) -> bool {
    let (rect, response) =
        ui.allocate_exact_size(egui::vec2(ui.available_width(), 144.0), Sense::click());
    response.widget_info(|| {
        egui::WidgetInfo::labeled(
            egui::WidgetType::Button,
            true,
            format!("{}: {}", card.title, card.value),
        )
    });
    let painter = ui.painter();
    painter.rect_filled(rect, 8.0, Color32::WHITE);
    painter.rect_stroke(
        rect.shrink(0.5),
        8.0,
        Stroke::new(
            1.0,
            if response.hovered() {
                LEGACY_TEAL
            } else {
                LEGACY_BORDER
            },
        ),
    );
    let tile = egui::Rect::from_min_size(
        egui::pos2(rect.right() - 57.0, rect.top() + 19.0),
        egui::vec2(36.0, 36.0),
    );
    painter.rect_filled(tile, 8.0, card.icon_background);
    let title_rect = egui::Rect::from_min_max(
        rect.min + egui::vec2(21.0, 19.0),
        egui::pos2(tile.left() - 8.0, tile.bottom()),
    );
    let galley = egui::WidgetText::RichText(
        RichText::new(card.title)
            .size(13.0)
            .color(LEGACY_MUTED)
            .into(),
    )
    .into_galley(
        ui,
        Some(egui::TextWrapMode::Truncate),
        title_rect.width(),
        egui::TextStyle::Body,
    );
    ui.painter()
        .with_clip_rect(title_rect.intersect(ui.clip_rect()))
        .galley(
            title_rect.left_center() - egui::vec2(0.0, galley.size().y / 2.0),
            galley,
            LEGACY_MUTED,
        );
    match card.icon {
        MetricIcon::Svg(icon) => paint_dashboard_icon(
            ctx,
            icon_textures,
            ui.painter(),
            tile.center(),
            icon,
            card.icon_color,
            20.0,
        ),
        MetricIcon::CheckCircle => {
            ui.painter()
                .circle_stroke(tile.center(), 8.0, Stroke::new(1.7, card.icon_color));
            ui.painter().add(egui::Shape::line(
                vec![
                    tile.center() + egui::vec2(-3.5, 0.0),
                    tile.center() + egui::vec2(-0.8, 3.0),
                    tile.center() + egui::vec2(4.0, -3.0),
                ],
                Stroke::new(1.7, card.icon_color),
            ));
        }
    }
    ui.painter().text(
        rect.min + egui::vec2(21.0, 67.0),
        Align2::LEFT_TOP,
        &card.value,
        crate::native_text::weighted_font(ctx, 24.0, true),
        LEGACY_TEXT,
    );
    let arrow =
        egui::Rect::from_min_size(rect.min + egui::vec2(21.0, 109.0), egui::vec2(10.0, 12.0));
    paint_up_arrow(ui.painter(), arrow, LEGACY_GREEN);
    ui.painter().text(
        rect.min + egui::vec2(35.0, 107.0),
        Align2::LEFT_TOP,
        &card.change,
        FontId::proportional(12.0),
        LEGACY_GREEN,
    );
    crate::visual_test::record(&format!("dashboard.kpi.{index}"), rect);
    response.clicked()
}

fn render_approval_feed(
    ui: &mut Ui,
    workflows: &[DashboardPendingWorkflow],
    pending_count: usize,
    nav_change: &mut Option<NavItem>,
) {
    let full_width = ui.available_width();
    egui::Frame::none()
        .fill(Color32::WHITE)
        .stroke(Stroke::new(1.0, LEGACY_BORDER))
        .rounding(8.0)
        .inner_margin(egui::Margin::symmetric(20.0, 18.0))
        .show(ui, |ui| {
            ui.set_min_width((full_width - 40.0).max(0.0));
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new("◷  Hàng chờ xử lý")
                        .size(15.0)
                        .strong()
                        .color(LEGACY_TEXT),
                );
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if ui.link(format!("Xem tất cả ({pending_count}) →")).clicked() {
                        *nav_change = Some(workflow_requests_nav());
                    }
                });
            });
            ui.add_space(12.0);
            for (index, workflow) in workflows.iter().take(3).enumerate() {
                let row_width = ui.available_width();
                egui::Frame::none()
                    .fill(Color32::from_rgb(250, 250, 250))
                    .stroke(Stroke::new(1.0, Color32::from_rgb(238, 238, 238)))
                    .rounding(6.0)
                    .inner_margin(egui::Margin::symmetric(14.0, 10.0))
                    .show(ui, |ui| {
                        ui.set_min_width((row_width - 28.0).max(0.0));
                        ui.horizontal_wrapped(|ui| {
                            ui.vertical(|ui| {
                                ui.label(
                                    RichText::new(format!(
                                        "{} ({})",
                                        nonempty(&workflow.title, "Hồ sơ"),
                                        nonempty(&workflow.code, "HS")
                                    ))
                                    .size(13.0)
                                    .strong()
                                    .color(LEGACY_TEXT),
                                );
                                ui.label(
                                    RichText::new(format!(
                                        "Người lập: {} · {}",
                                        nonempty(&workflow.requester, "Nhân sự"),
                                        nonempty(&workflow.department, "Doanh nghiệp")
                                    ))
                                    .size(11.5)
                                    .color(LEGACY_MUTED),
                                );
                            });
                            ui.add_space(8.0);
                            if ui
                                .add(
                                    egui::Button::new(
                                        RichText::new("Mở hồ sơ").size(12.0).color(Color32::WHITE),
                                    )
                                    .fill(Color32::from_rgb(46, 125, 50)),
                                )
                                .clicked()
                            {
                                *nav_change = Some(workflow_requests_nav());
                            }
                            if ui
                                .add(egui::Button::new(RichText::new("Tổng quan").size(12.0)))
                                .clicked()
                            {
                                *nav_change = Some(NavItem::new(
                                    "wf-overview",
                                    "Tổng quan",
                                    "/admin/workflows/overview",
                                    "📊",
                                    NavGroup::Workflows,
                                ));
                            }
                        });
                    });
                if index + 1 < workflows.len().min(3) {
                    ui.add_space(10.0);
                }
            }
        });
}

fn render_quick_actions(ui: &mut Ui, nav_change: &mut Option<NavItem>) {
    let full_width = ui.available_width();
    egui::Frame::none()
        .fill(Color32::WHITE)
        .stroke(Stroke::new(1.0, LEGACY_BORDER))
        .rounding(8.0)
        .inner_margin(egui::Margin::same(20.0))
        .show(ui, |ui| {
            ui.set_min_width((full_width - 42.0).max(0.0));
            ui.spacing_mut().item_spacing.y = 0.0;
            crate::widgets::heading(ui, "Lối tắt hành động nhanh", 15.0, 22.5, LEGACY_TEXT);
            ui.add_space(16.0);
            for (index, action) in QUICK_ACTIONS.iter().enumerate() {
                let width = ui.available_width();
                let access = ui.painter().layout_no_wrap(
                    "Truy cập →".to_owned(),
                    FontId::proportional(12.0),
                    LEGACY_TEAL,
                );
                let label = ui.painter().layout(
                    action.label.to_owned(),
                    FontId::proportional(13.0),
                    Color32::from_rgb(55, 65, 81),
                    (width - 28.0 - 12.0 - access.size().x).max(1.0),
                );
                let height = 41.5_f32.max(label.size().y + 20.0);
                let (rect, response) =
                    ui.allocate_exact_size(egui::vec2(width, height), Sense::click());
                response.widget_info(|| {
                    egui::WidgetInfo::labeled(egui::WidgetType::Button, true, action.label)
                });
                let background = if response.hovered() {
                    Color32::from_rgb(245, 245, 245)
                } else {
                    Color32::WHITE
                };
                ui.painter().rect_filled(rect, 6.0, background);
                ui.painter()
                    .rect_stroke(rect, 6.0, Stroke::new(1.0, LEGACY_BORDER));
                ui.painter().galley(
                    rect.left_center() + egui::vec2(14.0, -label.size().y / 2.0),
                    label,
                    Color32::from_rgb(55, 65, 81),
                );
                ui.painter().galley(
                    rect.right_center() - egui::vec2(14.0 + access.size().x, access.size().y / 2.0),
                    access,
                    LEGACY_TEAL,
                );
                crate::visual_test::record(&format!("dashboard.quick-action.{index}"), rect);
                if response.clicked() {
                    *nav_change = Some(action.target);
                }
                if index + 1 < QUICK_ACTIONS.len() {
                    ui.add_space(10.0);
                }
            }
        });
}

fn render_recent_activities(
    ui: &mut Ui,
    events: &[AuditLogEntry],
    stretch: bool,
    status: Option<&str>,
) {
    let full_width = ui.available_width();
    egui::Frame::none()
        .fill(Color32::WHITE)
        .stroke(Stroke::new(1.0, LEGACY_BORDER))
        .rounding(8.0)
        .inner_margin(egui::Margin::same(20.0))
        .show(ui, |ui| {
            ui.set_min_width((full_width - 42.0).max(0.0));
            if stretch {
                ui.set_min_height(389.0);
            }
            ui.spacing_mut().item_spacing.y = 0.0;
            crate::widgets::heading(ui, "Hoạt động hệ thống gần đây", 15.0, 22.5, LEGACY_TEXT);
            ui.add_space(16.0);
            egui::ScrollArea::vertical()
                .id_salt("dashboard-recent-activities")
                .max_height(260.0)
                .show(ui, |ui| {
                    if events.is_empty() {
                        let width = ui.available_width();
                        ui.allocate_ui_with_layout(
                            egui::vec2(width, 72.0),
                            Layout::top_down(Align::Center),
                            |ui| {
                                ui.add_space(24.0);
                                ui.label(
                                    RichText::new(
                                        status.unwrap_or("Chưa có nhật ký hoạt động gần đây"),
                                    )
                                    .size(13.0)
                                    .color(Color32::from_rgb(156, 163, 175)),
                                );
                            },
                        );
                        return;
                    }
                    for (index, event) in events.iter().take(6).enumerate() {
                        let time = audit_time(&event.timestamp);
                        let time_width = ui
                            .painter()
                            .layout_no_wrap(time.clone(), FontId::proportional(11.0), LEGACY_MUTED)
                            .size()
                            .x
                            + 16.0;
                        let content_width = (ui.available_width() - time_width - 12.0).max(1.0);
                        ui.horizontal_top(|ui| {
                            ui.spacing_mut().item_spacing.x = 12.0;
                            ui.allocate_ui_with_layout(
                                egui::vec2(content_width, 0.0),
                                Layout::top_down(Align::Min),
                                |ui| {
                                    ui.label(
                                        RichText::new(&event.action).size(13.0).color(LEGACY_TEXT),
                                    );
                                    ui.label(
                                        RichText::new(format!(
                                            "Bởi {} · Phân hệ {}",
                                            event.user, event.module
                                        ))
                                        .size(11.5)
                                        .color(LEGACY_MUTED),
                                    );
                                },
                            );
                            ui.with_layout(Layout::right_to_left(Align::Min), |ui| {
                                egui::Frame::none()
                                    .fill(Color32::from_rgb(245, 245, 245))
                                    .rounding(4.0)
                                    .inner_margin(egui::Margin::symmetric(8.0, 2.0))
                                    .show(ui, |ui| {
                                        ui.label(
                                            RichText::new(time).size(11.0).color(LEGACY_MUTED),
                                        );
                                    });
                            });
                        });
                        if index + 1 < events.len().min(6) {
                            ui.add_space(12.0);
                            ui.separator();
                            ui.add_space(12.0);
                        }
                    }
                });
        });
}

fn paint_dashboard_icon(
    ctx: &egui::Context,
    icon_textures: &mut HashMap<DashboardIcon, TextureHandle>,
    painter: &egui::Painter,
    center: egui::Pos2,
    icon: DashboardIcon,
    color: Color32,
    size: f32,
) {
    if !icon_textures.contains_key(&icon) {
        if let Ok(image) = egui_extras::image::load_svg_bytes(icon.svg_bytes()) {
            icon_textures.insert(
                icon,
                ctx.load_texture(icon.name(), image, egui::TextureOptions::LINEAR),
            );
        }
    }
    if let Some(texture) = icon_textures.get(&icon) {
        let rect = egui::Rect::from_center_size(center, egui::vec2(size, size));
        painter.image(
            texture.id(),
            rect,
            egui::Rect::from_min_max(egui::Pos2::ZERO, egui::pos2(1.0, 1.0)),
            color,
        );
    }
}

fn paint_up_arrow(painter: &egui::Painter, rect: egui::Rect, color: Color32) {
    let center = rect.center();
    let stroke = Stroke::new(1.4, color);
    painter.line_segment(
        [
            egui::pos2(center.x, rect.bottom()),
            egui::pos2(center.x, rect.top() + 2.0),
        ],
        stroke,
    );
    painter.line_segment(
        [
            egui::pos2(center.x - 3.0, rect.top() + 5.0),
            egui::pos2(center.x, rect.top() + 2.0),
        ],
        stroke,
    );
    painter.line_segment(
        [
            egui::pos2(center.x + 3.0, rect.top() + 5.0),
            egui::pos2(center.x, rect.top() + 2.0),
        ],
        stroke,
    );
}

fn workflow_requests_nav() -> NavItem {
    NavItem::new(
        "wf-requests",
        "Yêu cầu",
        "/admin/workflows/requests",
        "📨",
        NavGroup::Workflows,
    )
}

fn nonempty<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    if value.trim().is_empty() {
        fallback
    } else {
        value
    }
}

fn format_money(amount: i64) -> String {
    if amount >= 1_000_000_000 {
        format!("{:.2} tỷ ₫", amount as f64 / 1_000_000_000.0)
    } else if amount >= 1_000_000 {
        format!("{:.1} tr ₫", amount as f64 / 1_000_000.0)
    } else {
        format!("{} ₫", format_integer_vi(amount))
    }
}

fn format_integer_vi(value: i64) -> String {
    let negative = value < 0;
    let digits = value.unsigned_abs().to_string();
    let mut grouped = String::with_capacity(digits.len() + digits.len() / 3);
    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index) % 3 == 0 {
            grouped.push('.');
        }
        grouped.push(digit);
    }
    if negative {
        format!("-{grouped}")
    } else {
        grouped
    }
}

fn audit_time(timestamp: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(timestamp)
        .map(|value| value.format("%H:%M").to_string())
        .or_else(|_| {
            timestamp
                .get(11..16)
                .filter(|value| value.chars().all(|ch| ch.is_ascii_digit() || ch == ':'))
                .map(str::to_owned)
                .ok_or(())
        })
        .unwrap_or_else(|_| "Vừa xong".to_owned())
}

#[cfg(test)]
mod tests {
    use super::{QUICK_ACTIONS, audit_time, format_money, is_compact_viewport};
    use crate::api::DashboardStats;

    #[test]
    fn dashboard_keeps_partial_kpi_rows_and_long_content_inside_the_viewport() {
        let session = crate::models::Session {
            token: String::new(),
            session_id: String::new(),
            user: crate::models::User {
                id: "layout-fixture".into(),
                email: "layout@kiyo.test".into(),
                name: "Fixture".into(),
                role: "ADMIN".into(),
                is_active: true,
            },
            endpoint: "http://127.0.0.1:1/api/v1".into(),
            mode: Default::default(),
        };
        for width in [320.0, 390.0, 768.0, 1024.0, 1440.0] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            crate::native_text::setup_style(&ctx);
            let stats: DashboardStats = serde_json::from_value(serde_json::json!({
                "totalUsers": 0, "activeUsers": 0, "totalEmployees": 0,
                "newEmployeesThisMonth": 0, "monthlyRevenue": 0, "monthlyExpense": 0,
                "pendingApprovalsCount": 0, "financialMetricsAvailable": false,
                "auditLogsAvailable": true, "recentAuditLogs": [{
                    "key":"event", "id":"event", "detail":"", "action":"Một hoạt động có nội dung rất dài cần xuống dòng khi hiển thị trên cửa sổ nhỏ",
                    "user":"Tên người dùng và đơn vị rất dài", "module":"Nhân sự và vận hành",
                    "timestamp":"2026-10-24T12:34:00Z"
                }]
            })).unwrap();
            let mut view = super::DashboardView {
                stats: Some(stats),
                loaded_for: Some(session.user.id.clone()),
                last_loaded: Some(web_time::Instant::now()),
                ..Default::default()
            };
            let output = ctx.run(
                egui::RawInput {
                    screen_rect: Some(egui::Rect::from_min_size(
                        egui::Pos2::ZERO,
                        egui::vec2(width, 1200.0),
                    )),
                    ..Default::default()
                },
                |ctx| {
                    egui::CentralPanel::default().show(ctx, |ui| {
                        let right = ui.max_rect().right();
                        view.render(ui, ctx, &session, &crate::api::ApiClient, &mut None);
                        assert!(
                            ui.min_rect().right() <= right + 0.1,
                            "dashboard overflow at {width}: {:?}",
                            ui.min_rect()
                        );
                    });
                },
            );
            let cards = output
                .shapes
                .iter()
                .filter_map(|shape| match &shape.shape {
                    egui::Shape::Rect(rect)
                        if (rect.rect.height() - 144.0).abs() < 0.1
                            && rect.fill == egui::Color32::WHITE =>
                    {
                        Some(rect.rect)
                    }
                    _ => None,
                })
                .collect::<Vec<_>>();
            assert_eq!(cards.len(), 4);
            assert!(
                cards
                    .iter()
                    .all(|card| (card.width() - cards[0].width()).abs() < 0.1),
                "partial grid rows must keep the same card width at {width}"
            );
            assert!(!output.shapes.iter().any(|shape| matches!(&shape.shape, egui::Shape::Text(text) if text.galley.text() == "0 ₫")), "unavailable finance data must not look like zero revenue");
        }
    }

    #[test]
    fn banner_and_kpi_do_not_rewind_the_parent_layout_cursor() {
        let ctx = egui::Context::default();
        crate::native_text::setup_fonts(&ctx);
        crate::native_text::setup_style(&ctx);
        let mut icons = std::collections::HashMap::new();
        let _ = ctx.run(
            egui::RawInput {
                screen_rect: Some(egui::Rect::from_min_size(
                    egui::Pos2::ZERO,
                    egui::vec2(1440.0, 900.0),
                )),
                ..Default::default()
            },
            |ctx| {
                egui::CentralPanel::default()
                    .frame(egui::Frame::none())
                    .show(ctx, |ui| {
                        ui.set_width(1196.0);
                        ui.spacing_mut().item_spacing = egui::Vec2::ZERO;
                        let start = ui.cursor().top();
                        super::render_health_banner(
                            ui,
                            ctx,
                            &mut icons,
                            0,
                            0,
                            Some(0),
                            0,
                            true,
                            &mut None,
                        );
                        assert_eq!(
                            ui.cursor().top() - start,
                            69.0,
                            "buttons must not move the cursor above the banner bottom"
                        );
                        ui.add_space(20.0);
                        let kpi_top = ui.cursor().top();
                        let card = super::MetricCard {
                            title: "Tổng số cán bộ nhân viên",
                            value: "0 nhân sự".into(),
                            change: "Hồ sơ nhân sự".into(),
                            icon: super::MetricIcon::CheckCircle,
                            icon_color: egui::Color32::BLUE,
                            icon_background: egui::Color32::WHITE,
                            target: crate::models::NavItem::admin_dashboard(),
                        };
                        super::render_metric_card(ui, ctx, &mut icons, &card, 0);
                        assert_eq!(kpi_top - start, 89.0);
                        assert_eq!(
                            ui.cursor().top() - kpi_top,
                            144.0,
                            "title placement must not change KPI flow height"
                        );
                    });
            },
        );
    }

    #[test]
    fn dashboard_stats_keep_pending_workflow_rows_from_the_legacy_contract() {
        let stats: DashboardStats = serde_json::from_value(serde_json::json!({
            "totalUsers": 8,
            "activeUsers": 7,
            "totalEmployees": 8,
            "newEmployeesThisMonth": 2,
            "monthlyRevenue": 1250000,
            "monthlyExpense": 400000,
            "pendingApprovalsCount": 1,
            "pendingWorkflows": [{
                "key": "wf-1",
                "id": "wf-1",
                "code": "WF-2026-01",
                "title": "Đề xuất thiết bị",
                "requester": "Nguyễn An",
                "department": "Vận hành",
                "submittedDate": "2026-10-09",
                "status": "Chờ duyệt",
                "type": "purchase",
                "amount": 1200000
            }],
            "recentAuditLogs": [],
            "financialMetricsAvailable": true,
            "auditLogsAvailable": true
        }))
        .expect("legacy dashboard stats response should deserialize");

        assert_eq!(stats.pending_workflows.len(), 1);
        assert_eq!(stats.pending_workflows[0].code, "WF-2026-01");
        assert_eq!(stats.pending_workflows[0].workflow_type, "purchase");
        assert_eq!(stats.pending_workflows[0].amount, Some(1_200_000.0));
    }

    #[test]
    fn dashboard_money_format_matches_legacy_thresholds_and_vietnamese_grouping() {
        assert_eq!(format_money(0), "0 ₫");
        assert_eq!(format_money(1_200_000), "1.2 tr ₫");
        assert_eq!(format_money(1_250_000_000), "1.25 tỷ ₫");
        assert_eq!(format_money(12_345), "12.345 ₫");
    }

    #[test]
    fn dashboard_uses_the_legacy_992_pixel_compact_breakpoint() {
        assert!(is_compact_viewport(390.0));
        assert!(is_compact_viewport(992.0));
        assert!(!is_compact_viewport(993.0));
    }

    #[test]
    fn dashboard_quick_actions_preserve_legacy_labels_and_destinations() {
        let expected = [
            ("Thêm nhân viên mới", "/admin/hr/employees"),
            ("Tạo đơn mua hàng (PO)", "/admin/finance/purchasing/orders"),
            ("Lập đơn đặt hàng bán (SO)", "/admin/finance/sales/orders"),
            ("Lập hóa đơn điện tử VAT", "/admin/finance/e-invoice/create"),
            ("Đặt phòng họp hội nghị", "/admin/meeting-rooms/calendar"),
            ("Đám mây Cloud Drive", "/admin/files"),
            ("Tùy biến giao diện", "/admin/settings/appearance"),
        ];
        assert_eq!(
            QUICK_ACTIONS
                .iter()
                .map(|action| (action.label, action.target.path))
                .collect::<Vec<_>>(),
            expected
        );
    }

    #[test]
    fn dashboard_audit_timestamp_uses_legacy_hour_minute_projection() {
        assert_eq!(audit_time("2026-10-09T14:07:33+00:00"), "14:07");
        assert_eq!(audit_time("invalid"), "Vừa xong");
    }
}
