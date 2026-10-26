//! Measured presentation primitives from the legacy UI; no API or domain state.
use egui::{Align, Align2, Color32, FontId, Layout, Rect, Sense, Stroke, Ui, UiBuilder, Vec2};

pub struct Metric<'a> {
    pub label: &'a str,
    pub value: String,
    pub detail: &'a str,
    pub color: Color32,
    pub value_size: f32,
}

/// Place an interactive widget in an already allocated box without rewinding
/// the parent's cursor (Ui::put participates in parent layout).
pub fn put(ui: &mut Ui, rect: Rect, widget: impl egui::Widget) -> egui::Response {
    let mut child = ui.new_child(
        UiBuilder::new()
            .max_rect(rect)
            .layout(Layout::centered_and_justified(egui::Direction::TopDown)),
    );
    // egui strokes straddle the box edge; keep their outer half visible.
    child.set_clip_rect(rect.expand(1.0).intersect(ui.clip_rect()));
    child.spacing_mut().button_padding = egui::vec2(8.0, 4.0);
    child.spacing_mut().interact_size.y = rect.height();
    child.add(widget)
}

/// Bound right-aligned controls to one row, not the remaining page height.
pub fn action_row<R>(ui: &mut Ui, contents: impl FnOnce(&mut Ui) -> R) -> egui::InnerResponse<R> {
    let response = ui.allocate_ui_with_layout(
        egui::vec2(ui.available_width(), 32.0),
        Layout::right_to_left(Align::Center),
        |ui| {
            ui.spacing_mut().button_padding = egui::vec2(15.0, 4.0);
            ui.spacing_mut().interact_size.y = 32.0;
            contents(ui)
        },
    );
    crate::visual_test::record("footer.actions", response.response.rect);
    #[cfg(test)]
    ui.ctx().data_mut(|d| {
        d.insert_temp(
            egui::Id::new("test.footer.bounds"),
            (response.response.rect, ui.clip_rect()),
        )
    });
    response
}

pub fn heading(ui: &mut Ui, text: &str, size: f32, height: f32, color: Color32) {
    let (rect, response) =
        ui.allocate_exact_size(egui::vec2(ui.available_width(), height), Sense::hover());
    response.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Label, true, text));
    ui.painter().text(
        rect.left_center(),
        Align2::LEFT_CENTER,
        text,
        crate::native_text::weighted_font(ui.ctx(), size, false),
        color,
    );
}

pub fn page_header(
    ui: &mut Ui,
    id: &str,
    title: &str,
    subtitle: &str,
    reload_enabled: bool,
) -> bool {
    let width = ui.available_width();
    let font = FontId::proportional(13.0);
    let natural = ui
        .painter()
        .layout_no_wrap(
            subtitle.to_owned(),
            font.clone(),
            Color32::from_rgb(100, 116, 139),
        )
        .size()
        .x;
    let title_width = ui
        .painter()
        .layout_no_wrap(
            title.to_owned(),
            crate::native_text::weighted_font(ui.ctx(), 20.0, true),
            Color32::from_rgb(15, 23, 42),
        )
        .size()
        .x;
    let wrap_actions = natural.max(title_width) + 121.078125 > width;
    let mut title_job = egui::text::LayoutJob::default();
    title_job.wrap.max_width = if wrap_actions {
        width
    } else {
        (width - 121.078125).max(1.0)
    };
    title_job.append(
        title,
        0.0,
        egui::TextFormat {
            font_id: crate::native_text::weighted_font(ui.ctx(), 20.0, true),
            line_height: Some(30.0),
            color: Color32::from_rgb(15, 23, 42),
            ..Default::default()
        },
    );
    let title_galley = ui.fonts(|f| f.layout_job(title_job));
    let title_height = title_galley.rows.len().max(1) as f32 * 30.0;
    let mut job = egui::text::LayoutJob::default();
    job.wrap.max_width = width;
    job.append(
        subtitle,
        0.0,
        egui::TextFormat {
            font_id: font,
            line_height: Some(19.5),
            color: Color32::from_rgb(100, 116, 139),
            ..Default::default()
        },
    );
    let galley = ui.fonts(|f| f.layout_job(job));
    let body_height = title_height + 4.0 + galley.rows.len().max(1) as f32 * 19.5;
    let action_gap = if ui.ctx().screen_rect().width() <= 992.0 {
        8.0
    } else {
        12.0
    };
    let (rect, response) = ui.allocate_exact_size(
        egui::vec2(
            width,
            body_height + if wrap_actions { 32.0 + action_gap } else { 0.0 },
        ),
        Sense::hover(),
    );
    response.widget_info(|| {
        egui::WidgetInfo::labeled(
            egui::WidgetType::Label,
            true,
            format!("{title}. {subtitle}"),
        )
    });
    ui.painter()
        .galley(rect.min, title_galley, Color32::from_rgb(15, 23, 42));
    ui.painter().galley(
        rect.min + egui::vec2(0.0, title_height + 4.0),
        galley,
        Color32::from_rgb(100, 116, 139),
    );
    let refresh = Rect::from_min_size(
        rect.min
            + if wrap_actions {
                egui::vec2(0.0, body_height + action_gap)
            } else {
                egui::vec2(width - 109.078125, (body_height - 32.0) / 2.0)
            },
        egui::vec2(109.078125, 32.0),
    );
    let mut clicked = false;
    ui.add_enabled_ui(reload_enabled, |ui| {
        clicked = put(
            ui,
            refresh,
            egui::Button::image_and_text(
                egui::Image::from_bytes(
                    "bytes://page-header-reload.svg",
                    include_bytes!("../assets/nav-icons/ReloadOutlined.svg"),
                )
                .fit_to_exact_size(Vec2::splat(14.0)),
                "Làm mới",
            ),
        )
        .clicked();
    });
    crate::visual_test::record(&format!("{id}.header"), rect);
    clicked
}

/// Native mesh equivalent of the legacy 135-degree two-stop banner gradient.
pub fn gradient_panel(
    painter: &egui::Painter,
    rect: Rect,
    radius: f32,
    start: Color32,
    end: Color32,
) {
    let mut mesh = egui::epaint::Mesh::default();
    let color = |p: egui::Pos2| {
        let t = ((p.x - rect.left() + p.y - rect.top()) / (rect.width() + rect.height()))
            .clamp(0.0, 1.0);
        Color32::from_rgb(
            (start.r() as f32 + (end.r() as f32 - start.r() as f32) * t).round() as u8,
            (start.g() as f32 + (end.g() as f32 - start.g() as f32) * t).round() as u8,
            (start.b() as f32 + (end.b() as f32 - start.b() as f32) * t).round() as u8,
        )
    };
    mesh.vertices.push(egui::epaint::Vertex {
        pos: rect.center(),
        uv: egui::epaint::WHITE_UV,
        color: color(rect.center()),
    });
    for (center, angle) in [
        (
            rect.left_top() + egui::vec2(radius, radius),
            std::f32::consts::PI,
        ),
        (
            rect.right_top() + egui::vec2(-radius, radius),
            std::f32::consts::PI * 1.5,
        ),
        (rect.right_bottom() - egui::vec2(radius, radius), 0.0),
        (
            rect.left_bottom() + egui::vec2(radius, -radius),
            std::f32::consts::FRAC_PI_2,
        ),
    ] {
        for step in 0..=16 {
            let a = angle + std::f32::consts::FRAC_PI_2 * step as f32 / 16.0;
            let pos = center + egui::vec2(a.cos(), a.sin()) * radius;
            mesh.vertices.push(egui::epaint::Vertex {
                pos,
                uv: egui::epaint::WHITE_UV,
                color: color(pos),
            });
        }
    }
    let count = mesh.vertices.len() as u32 - 1;
    for i in 1..=count {
        mesh.indices
            .extend_from_slice(&[0, i, if i == count { 1 } else { i + 1 }]);
    }
    painter.add(egui::Shape::mesh(mesh));
}

/// CSS repeat(auto-fit,minmax(minimum,1fr)), capped by the number of children.
pub fn grid_columns(width: f32, minimum: f32, gap: f32, count: usize) -> usize {
    (((width + gap) / (minimum + gap)).floor() as usize).clamp(1, count.max(1))
}

fn grid_tracks(width: f32, columns: usize, gap: f32) -> Vec<f32> {
    let usable = (width - gap * (columns - 1) as f32).max(columns as f32);
    let base = (usable * 64.0 / columns as f32).floor() / 64.0;
    let mut tracks = vec![base; columns];
    tracks[columns - 1] = usable - base * (columns - 1) as f32;
    tracks
}

pub fn metrics(ui: &mut Ui, id: &str, items: &[Metric<'_>]) {
    metrics_with_padding(ui, id, items, egui::vec2(18.0, 14.0));
}

pub fn metrics_with_padding(ui: &mut Ui, id: &str, items: &[Metric<'_>], padding: Vec2) {
    metrics_grid(ui, id, items, padding, 240.0, 4.0);
}

pub fn metrics_grid(
    ui: &mut Ui,
    id: &str,
    items: &[Metric<'_>],
    padding: Vec2,
    minimum: f32,
    value_gap: f32,
) {
    let compact = ui.ctx().screen_rect().width() <= 992.0;
    let gap = if compact { 12.0 } else { 14.0 };
    let columns = if compact {
        1
    } else {
        grid_columns(ui.available_width(), minimum, gap, items.len())
    };
    let width = ui.available_width();
    let tracks = grid_tracks(width, columns, gap);
    let rows = items.len().div_ceil(columns);
    // CSS grid stretches every card in a row to its tallest wrapped content.
    let mut cards = Vec::with_capacity(items.len());
    let mut row_heights = vec![0.0_f32; rows];
    for (index, item) in items.iter().enumerate() {
        let text_width = (tracks[index % columns] - 2.0 * padding.x - 2.0).max(1.0);
        let mut texts = Vec::new();
        for (text, size, color, bold) in [
            (item.label, 12.5, Color32::from_rgb(100, 116, 139), false),
            (item.value.as_str(), item.value_size, item.color, true),
            (item.detail, 11.5, item.color, false),
        ] {
            if text.is_empty() {
                continue;
            }
            let mut job = egui::text::LayoutJob::default();
            job.wrap.max_width = text_width;
            job.append(
                text,
                0.0,
                egui::TextFormat {
                    font_id: if bold {
                        crate::native_text::weighted_font(ui.ctx(), size, true)
                    } else {
                        FontId::proportional(size)
                    },
                    line_height: Some(size * 1.5),
                    color,
                    ..Default::default()
                },
            );
            let galley = ui.fonts(|fonts| fonts.layout_job(job));
            let height = galley.rows.len().max(1) as f32 * size * 1.5;
            texts.push((galley, height, color));
        }
        let height = texts.iter().map(|(_, h, _)| h).sum::<f32>()
            + value_gap
            + if item.detail.is_empty() { 0.0 } else { 2.0 }
            + padding.y * 2.0
            + 2.0;
        row_heights[index / columns] = row_heights[index / columns].max(height);
        cards.push(texts);
    }
    let height = row_heights.iter().sum::<f32>() + rows.saturating_sub(1) as f32 * gap;
    let (bounds, _) = ui.allocate_exact_size(Vec2::new(width, height), Sense::hover());
    for (index, (item, texts)) in items.iter().zip(cards).enumerate() {
        let row = index / columns;
        let min = bounds.min
            + egui::vec2(
                tracks[..index % columns].iter().sum::<f32>() + (index % columns) as f32 * gap,
                row_heights[..row].iter().sum::<f32>() + row as f32 * gap,
            );
        let rect = Rect::from_min_size(min, egui::vec2(tracks[index % columns], row_heights[row]));
        let painter = ui.painter().with_clip_rect(rect.intersect(ui.clip_rect()));
        painter.rect_filled(rect, 8.0, Color32::WHITE);
        painter.rect_stroke(
            rect.shrink(0.5),
            8.0,
            Stroke::new(1.0, Color32::from_rgb(226, 232, 240)),
        );
        let mut y = min.y + padding.y + 1.0;
        for (part, (galley, text_height, color)) in texts.into_iter().enumerate() {
            painter.galley(egui::pos2(min.x + padding.x + 1.0, y), galley, color);
            y += text_height + if part == 0 { value_gap } else { 2.0 };
        }
        crate::visual_test::record(&format!("{id}.{index}"), rect);
        ui.interact(rect, ui.id().with((id, index)), Sense::hover())
            .widget_info(|| {
                egui::WidgetInfo::labeled(
                    egui::WidgetType::Label,
                    true,
                    format!("{}: {}. {}", item.label, item.value, item.detail),
                )
            });
    }
}

pub struct TableColumn<'a> {
    pub title: &'a str,
    pub width: f32,
}

/// Keep egui's real popup/keyboard behavior, with the legacy chevron instead
/// of a filled triangle. Long selections stay inside their control.
pub fn combo_box(id: impl std::hash::Hash) -> egui::ComboBox {
    egui::ComboBox::from_id_salt(id)
        .wrap_mode(egui::TextWrapMode::Truncate)
        .icon(|ui, rect, _, open, _| {
            let c = rect.center();
            let sign = if open { -1.0 } else { 1.0 };
            ui.painter().add(egui::Shape::line(
                vec![
                    c + egui::vec2(-3.5, -1.75 * sign),
                    c + egui::vec2(0.0, 1.75 * sign),
                    c + egui::vec2(3.5, -1.75 * sign),
                ],
                Stroke::new(1.0, Color32::from_rgb(191, 191, 191)),
            ));
        })
}

/// Legacy Input prefix; the text remains a real editable, labelled control.
pub fn search_input(ui: &mut Ui, rect: Rect, value: &mut String, hint: &str) -> egui::Response {
    let response = put(
        ui,
        rect,
        egui::TextEdit::singleline(value)
            .hint_text(hint)
            .margin(egui::Margin {
                left: 33.0,
                right: 11.0,
                top: 4.0,
                bottom: 4.0,
            })
            .font(FontId::new(
                14.0,
                egui::FontFamily::Name("legacy-controls".into()),
            )),
    );
    egui::Image::from_bytes(
        "bytes://search-prefix.svg",
        include_bytes!("../assets/nav-icons/SearchOutlined.svg"),
    )
    .tint(Color32::from_rgb(148, 163, 184))
    .paint_at(
        ui,
        Rect::from_min_size(rect.min + egui::vec2(12.0, 9.0), Vec2::splat(14.0)),
    );
    response
}

pub fn pagination(ui: &mut Ui, id: &str, page: &mut usize, count: usize, page_size: &mut usize) {
    *page_size = (*page_size).max(1);
    let size = *page_size;
    let pages = count.div_ceil(size).max(1);
    *page = (*page).min(pages - 1);
    let (row, _) = ui.allocate_exact_size(egui::vec2(ui.available_width(), 24.0), Sense::hover());
    let start = egui::pos2((row.right() - 192.0).max(row.left()), row.top());
    for (offset, text, enabled, next) in [
        (0.0, "‹", *page > 0, page.saturating_sub(1)),
        (56.0, "›", *page + 1 < pages, (*page + 1).min(pages - 1)),
    ] {
        ui.add_enabled_ui(enabled, |ui| {
            if put(
                ui,
                Rect::from_min_size(start + egui::vec2(offset, 0.0), Vec2::splat(24.0)),
                egui::Button::new(text).frame(false),
            )
            .clicked()
            {
                *page = next;
            }
        });
    }
    let current = Rect::from_min_size(start + egui::vec2(28.0, 0.0), Vec2::splat(24.0));
    let _ = put(
        ui,
        current,
        egui::Button::new(
            egui::RichText::new((*page + 1).to_string()).color(crate::theme::PRIMARY),
        )
        .stroke(Stroke::new(1.0, crate::theme::PRIMARY)),
    );
    let select = Rect::from_min_size(start + egui::vec2(92.0, 0.0), egui::vec2(100.0, 24.0));
    let mut child = ui.new_child(
        UiBuilder::new()
            .id_salt(id)
            .max_rect(select)
            .layout(Layout::centered_and_justified(egui::Direction::TopDown)),
    );
    child.spacing_mut().interact_size.y = 24.0;
    let before = *page_size;
    combo_box(id)
        .width(100.0)
        .selected_text(format!("{} / page", page_size))
        .show_ui(&mut child, |ui| {
            for value in [8, 10, 16, 20, 32, 50, 64] {
                ui.selectable_value(page_size, value, format!("{value} / page"));
            }
        });
    if before != *page_size {
        *page = 0;
    }
    crate::visual_test::record(id, row);
}

#[derive(Clone, Copy)]
pub enum TagTone {
    Neutral,
    Success,
    Error,
    Warning,
    Purple,
    Cyan,
    Processing,
}

pub fn tag(ui: &mut Ui, text: &str, tone: TagTone) {
    let (foreground, background, border) = match tone {
        TagTone::Neutral => (
            Color32::from_rgb(89, 89, 89),
            Color32::from_rgb(250, 250, 250),
            Color32::from_rgb(217, 217, 217),
        ),
        TagTone::Success => (
            Color32::from_rgb(56, 158, 13),
            Color32::from_rgb(246, 255, 237),
            Color32::from_rgb(183, 235, 143),
        ),
        TagTone::Error => (
            Color32::from_rgb(207, 19, 34),
            Color32::from_rgb(255, 242, 240),
            Color32::from_rgb(255, 204, 199),
        ),
        TagTone::Warning => (
            Color32::from_rgb(212, 136, 6),
            Color32::from_rgb(255, 251, 230),
            Color32::from_rgb(255, 229, 143),
        ),
        TagTone::Purple => (
            Color32::from_rgb(83, 29, 171),
            Color32::from_rgb(249, 240, 255),
            Color32::from_rgb(211, 173, 230),
        ),
        TagTone::Cyan => (
            Color32::from_rgb(8, 151, 156),
            Color32::from_rgb(230, 255, 251),
            Color32::from_rgb(135, 232, 222),
        ),
        TagTone::Processing => (
            Color32::from_rgb(9, 109, 217),
            Color32::from_rgb(230, 247, 255),
            Color32::from_rgb(145, 213, 255),
        ),
    };
    let galley =
        ui.painter()
            .layout_no_wrap(text.to_owned(), FontId::proportional(12.0), foreground);
    let (rect, response) =
        ui.allocate_exact_size(egui::vec2(galley.size().x + 16.0, 22.0), Sense::hover());
    response.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Label, true, text));
    ui.painter().rect_filled(rect, 4.0, background);
    ui.painter()
        .rect_stroke(rect.shrink(0.5), 4.0, Stroke::new(1.0, border));
    ui.painter().galley(
        rect.left_center() + egui::vec2(8.0, -galley.size().y / 2.0),
        galley,
        foreground,
    );
}

#[derive(Default)]
pub struct ToolbarResponse {
    pub selected: Option<usize>,
    pub search_changed: bool,
    pub create_clicked: bool,
    pub reload_clicked: bool,
}

/// Legacy modal: centered white surface, blocking 48% backdrop, 39px header,
/// 14/16px body padding and explicit close button. No outside/Escape dismissal.
pub fn modal<R>(
    ctx: &egui::Context,
    id: &str,
    title: &str,
    width: f32,
    busy: bool,
    contents: impl FnOnce(&mut Ui) -> R,
) -> (R, bool) {
    let screen = ctx.screen_rect();
    let pass = ctx.cumulative_pass_nr();
    let time = ctx.input(|input| input.time);
    let last_pass_key = egui::Id::new((id, "last.modal.pass"));
    let opening = ctx.data_mut(|data| {
        let previous = data.get_temp::<(u64, f64)>(last_pass_key);
        let opened_at = match previous {
            Some((last, opened_at)) if last.saturating_add(1) >= pass => opened_at,
            _ => time,
        };
        data.insert_temp(last_pass_key, (pass, opened_at));
        // Area sizing can replay the same input in several passes of one frame.
        opened_at == time
    });
    if opening {
        ctx.request_repaint();
    }
    let compact = screen.width() <= 992.0;
    let width = width.min((screen.width() - if compact { 20.0 } else { 32.0 }).max(1.0));
    egui::Area::new(egui::Id::new((id, "mask")))
        .order(egui::Order::Foreground)
        .fixed_pos(screen.min)
        .show(ctx, |ui| {
            let (rect, _) = ui.allocate_exact_size(screen.size(), Sense::click_and_drag());
            ui.painter()
                .rect_filled(rect, 0.0, Color32::from_black_alpha(122));
        });
    let header_height = if compact { 43.0 } else { 39.0 };
    let body_top = if compact { 8.0 } else { 14.0 };
    let area = egui::Area::new(egui::Id::new((id, "dialog")))
        .order(egui::Order::Foreground)
        .anchor(Align2::CENTER_CENTER, Vec2::ZERO)
        .default_size(egui::vec2(width, (screen.height() - 48.0).max(1.0)))
        .show(ctx, |ui| {
            ui.spacing_mut().item_spacing = Vec2::ZERO;
            egui::Frame::none()
                .fill(Color32::WHITE)
                .rounding(8.0)
                .shadow(egui::epaint::Shadow {
                    offset: egui::vec2(0.0, 6.0),
                    blur: 16.0,
                    spread: 0.0,
                    color: Color32::from_black_alpha(20),
                })
                .show(ui, |ui| {
                    ui.set_width(width);
                    let (header, _) =
                        ui.allocate_exact_size(egui::vec2(width, header_height), Sense::hover());
                    let galley = ui.painter().layout_no_wrap(
                        title.to_owned(),
                        crate::native_text::weighted_font(ctx, 15.0, false),
                        Color32::from_rgb(33, 33, 33),
                    );
                    ui.painter()
                        .with_clip_rect(header.shrink2(egui::vec2(16.0, 0.0)))
                        .galley(
                            header.left_top()
                                + egui::vec2(
                                    16.0,
                                    if compact { 14.0 } else { 8.0 }
                                        + (22.0 - galley.size().y) / 2.0,
                                ),
                            galley,
                            Color32::from_rgb(33, 33, 33),
                        );
                    ui.painter().line_segment(
                        [header.left_bottom(), header.right_bottom()],
                        Stroke::new(1.0, Color32::from_rgb(217, 217, 217)),
                    );
                    egui::Frame::none()
                        .inner_margin(egui::Margin {
                            left: 16.0,
                            right: 16.0,
                            top: body_top,
                            bottom: 16.0,
                        })
                        .show(ui, |ui| {
                            ui.set_width((width - 32.0).max(1.0));
                            ui.spacing_mut().item_spacing = egui::vec2(12.0, 0.0);
                            egui::ScrollArea::vertical()
                                .id_salt((id, "body"))
                                .max_height(
                                    (screen.height() - 48.0 - header_height - body_top - 16.0)
                                        .max(1.0),
                                )
                                // Do not send the launch button's release to a new input underneath it.
                                .show(ui, |ui| {
                                    ui.add_enabled_ui(!busy && !opening, contents).inner
                                })
                                .inner
                        })
                        .inner
                })
                .inner
        });
    let rect = area.response.rect;
    let mut close = false;
    if !busy && !opening {
        let close_rect = Rect::from_min_size(
            if compact {
                egui::pos2(rect.right() - 34.0, rect.top() + 8.0)
            } else {
                egui::pos2(rect.right() - 15.0, rect.top() - 11.0)
            },
            Vec2::splat(26.0),
        );
        egui::Area::new(egui::Id::new((id, "close")))
            // Clicking form controls raises the dialog's Foreground layer.
            // Keep its overlapping close control above that layer.
            .order(egui::Order::Tooltip)
            .constrain(false)
            .fixed_pos(close_rect.min)
            .show(ctx, |ui| {
                let (circle, response) = ui.allocate_exact_size(Vec2::splat(26.0), Sense::click());
                crate::visual_test::record(&format!("{id}.close"), circle);
                response.widget_info(|| {
                    egui::WidgetInfo::labeled(egui::WidgetType::Button, true, "Đóng hộp thoại")
                });
                ui.painter().circle_filled(
                    circle.center(),
                    12.0,
                    if response.hovered() {
                        Color32::from_rgb(255, 77, 79)
                    } else {
                        Color32::from_rgb(89, 89, 89)
                    },
                );
                ui.painter()
                    .circle_stroke(circle.center(), 12.0, Stroke::new(2.0, Color32::WHITE));
                for sign in [-1.0, 1.0] {
                    ui.painter().line_segment(
                        [
                            circle.center() + egui::vec2(-3.5, -3.5 * sign),
                            circle.center() + egui::vec2(3.5, 3.5 * sign),
                        ],
                        Stroke::new(2.0, Color32::WHITE),
                    );
                }
                close = response.clicked();
            });
    }
    crate::visual_test::record(&format!("{id}.dialog"), rect);
    (area.inner, close)
}

/// The legacy drawer is right-aligned, full height and unmasked by default.
/// Outside clicks must not discard an open record or an unsaved form.
pub fn drawer<R>(
    ctx: &egui::Context,
    id: &str,
    title: &str,
    width: f32,
    contents: impl FnOnce(&mut Ui) -> R,
) -> (R, bool) {
    let screen = ctx.screen_rect();
    let compact = screen.width() <= 992.0;
    let right = if compact { 10.0 } else { 0.0 };
    let width = if compact {
        (screen.width() - 20.0).max(1.0).min(420.0)
    } else {
        width.min(screen.width())
    };
    let horizontal = if compact { 16.0 } else { 24.0 };
    let vertical = if compact { 14.0 } else { 16.0 };
    let body_top = if compact { 14.0 } else { 20.0 };
    let body_bottom = if compact { 14.0 } else { 28.0 };
    let mut title_job = egui::text::LayoutJob::default();
    title_job.wrap.max_width =
        (width - horizontal * 2.0 - if compact { 26.0 } else { 0.0 }).max(1.0);
    title_job.append(
        title,
        0.0,
        egui::TextFormat {
            font_id: crate::native_text::weighted_font(ctx, 16.0, false),
            line_height: Some(24.0),
            color: Color32::from_rgb(33, 33, 33),
            ..Default::default()
        },
    );
    let title_galley = ctx.fonts(|f| f.layout_job(title_job));
    let header_height =
        (title_galley.rows.len().max(1) as f32 * 24.0).max(if compact { 26.0 } else { 0.0 })
            + vertical * 2.0
            + 1.0;
    let mut closed = false;
    let area = egui::Area::new(egui::Id::new((id, "drawer")))
        .order(egui::Order::Foreground)
        .constrain(false)
        .default_size(egui::vec2(width, screen.height()))
        .fixed_pos(egui::pos2(screen.right() - width - right, screen.top()))
        .show(ctx, |ui| {
            ui.spacing_mut().item_spacing = Vec2::ZERO;
            egui::Frame::none()
                .fill(Color32::WHITE)
                .shadow(egui::epaint::Shadow {
                    offset: egui::vec2(-6.0, 0.0),
                    blur: 24.0,
                    spread: 0.0,
                    color: Color32::from_black_alpha(31),
                })
                .show(ui, |ui| {
                    ui.set_width(width);
                    let (header, heading) =
                        ui.allocate_exact_size(egui::vec2(width, header_height), Sense::hover());
                    heading.widget_info(|| {
                        egui::WidgetInfo::labeled(egui::WidgetType::Label, true, title)
                    });
                    ui.painter().galley(
                        header.min + egui::vec2(horizontal, vertical),
                        title_galley.clone(),
                        Color32::from_rgb(33, 33, 33),
                    );
                    ui.painter().line_segment(
                        [header.left_bottom(), header.right_bottom()],
                        Stroke::new(1.0, Color32::from_rgb(226, 232, 240)),
                    );
                    let close_rect = if compact {
                        Rect::from_center_size(
                            egui::pos2(header.right() - horizontal - 13.0, header.center().y),
                            Vec2::splat(26.0),
                        )
                    } else {
                        Rect::from_min_size(
                            egui::pos2(header.right() - 15.0, header.top() - 11.0),
                            Vec2::splat(26.0),
                        )
                    };
                    // The desktop CSS intentionally floats the circle beyond the edge.
                    // Keep an additional on-screen hit target without shifting its paint.
                    let hit = if compact {
                        close_rect
                    } else {
                        Rect::from_min_size(
                            egui::pos2(header.right() - 26.0, header.top()),
                            Vec2::splat(26.0),
                        )
                    };
                    let response =
                        ui.interact(hit, egui::Id::new((id, "drawer.close")), Sense::click());
                    response.widget_info(|| {
                        egui::WidgetInfo::labeled(
                            egui::WidgetType::Button,
                            true,
                            "Đóng khung chi tiết",
                        )
                    });
                    ui.painter().circle_filled(
                        close_rect.center(),
                        13.0,
                        if response.hovered() {
                            Color32::from_rgb(255, 77, 79)
                        } else {
                            Color32::from_rgb(89, 89, 89)
                        },
                    );
                    ui.painter().circle_stroke(
                        close_rect.center(),
                        12.0,
                        Stroke::new(2.0, Color32::WHITE),
                    );
                    for sign in [-1.0, 1.0] {
                        ui.painter().line_segment(
                            [
                                close_rect.center() + egui::vec2(-3.5, -3.5 * sign),
                                close_rect.center() + egui::vec2(3.5, 3.5 * sign),
                            ],
                            Stroke::new(2.5, Color32::WHITE),
                        );
                    }
                    crate::visual_test::record(&format!("{id}.close"), close_rect);
                    closed = response.clicked();
                    egui::Frame::none()
                        .inner_margin(egui::Margin {
                            left: horizontal,
                            right: horizontal,
                            top: body_top,
                            bottom: body_bottom,
                        })
                        .show(ui, |ui| {
                            egui::ScrollArea::vertical()
                                .id_salt((id, "body"))
                                .auto_shrink([false, false])
                                .max_height(
                                    (screen.height() - header_height - body_top - body_bottom)
                                        .max(1.0),
                                )
                                .show(ui, contents)
                                .inner
                        })
                        .inner
                })
                .inner
        });
    crate::visual_test::record(&format!("{id}.drawer"), area.response.rect);
    (area.inner, closed)
}

pub fn form_field<R>(
    ui: &mut Ui,
    id: &str,
    label: &str,
    required: bool,
    control: impl FnOnce(&mut Ui) -> R,
) -> (R, egui::Id) {
    form_field_sized(ui, id, label, required, 32.0, control)
}

fn form_field_sized<R>(
    ui: &mut Ui,
    id: &str,
    label: &str,
    required: bool,
    height: f32,
    control: impl FnOnce(&mut Ui) -> R,
) -> (R, egui::Id) {
    let width = ui.available_width();
    let mut job = egui::text::LayoutJob::default();
    job.wrap.max_width = width;
    job.append(
        label,
        0.0,
        egui::TextFormat {
            font_id: FontId::proportional(13.5),
            line_height: Some(17.55),
            color: Color32::from_rgb(33, 33, 33),
            ..Default::default()
        },
    );
    if required {
        job.append(
            " *",
            0.0,
            egui::TextFormat {
                font_id: crate::native_text::weighted_font(ui.ctx(), 13.5, true),
                line_height: Some(17.55),
                color: Color32::from_rgb(239, 68, 68),
                ..Default::default()
            },
        );
    }
    let galley = ui.fonts(|fonts| fonts.layout_job(job));
    // CSS line-height is fractional; glyph atlas rounding must not grow every form row.
    let label_height = galley.rows.len().max(1) as f32 * 17.546875;
    let (bounds, response) = ui.allocate_exact_size(
        egui::vec2(width, label_height + height + 13.0),
        Sense::hover(),
    );
    response.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Label, true, label));
    ui.painter()
        .galley(bounds.min, galley, Color32::from_rgb(33, 33, 33));
    let rect = Rect::from_min_size(
        bounds.min + egui::vec2(0.0, label_height + 3.0),
        egui::vec2(width, height),
    );
    let mut child = ui.new_child(
        UiBuilder::new()
            .id_salt(id)
            .max_rect(rect)
            .layout(Layout::centered_and_justified(egui::Direction::TopDown)),
    );
    child.spacing_mut().interact_size.y = height;
    let result = control(&mut child);
    crate::visual_test::record(&format!("form.{id}"), rect);
    (result, response.id)
}

pub fn form_textarea(
    ui: &mut Ui,
    id: &str,
    label: &str,
    required: bool,
    value: &mut String,
    hint: &str,
    rows: usize,
) {
    let (response, label_id) = form_field_sized(
        ui,
        id,
        label,
        required && value.trim().is_empty(),
        rows.max(1) as f32 * 21.0 + 10.0,
        |ui| {
            ui.add(
                egui::TextEdit::multiline(value)
                    .desired_width(ui.available_width())
                    .desired_rows(rows)
                    .margin(egui::vec2(11.0, 4.0))
                    .hint_text(hint),
            )
        },
    );
    response.labelled_by(label_id);
}

pub fn form_input(
    ui: &mut Ui,
    id: &str,
    label: &str,
    required: bool,
    value: &mut String,
    hint: &str,
    password: bool,
) {
    let show_required = required && value.trim().is_empty();
    let (response, label_id) = form_field(ui, id, label, show_required, |ui| {
        ui.add(
            egui::TextEdit::singleline(value)
                .hint_text(hint)
                .password(password)
                .margin(egui::vec2(11.0, 4.0))
                .font(FontId::new(
                    14.0,
                    egui::FontFamily::Name("legacy-controls".into()),
                )),
        )
    });
    response.labelled_by(label_id);
}

pub fn form_date(ui: &mut Ui, id: &str, label: &str, required: bool, value: &mut String) {
    let show_required = required && value.trim().is_empty();
    let (response, label_id) = form_field(ui, id, label, show_required, |ui| {
        crate::date_picker::date_picker(ui, id, value)
    });
    response.labelled_by(label_id);
}

pub fn form_select(
    ui: &mut Ui,
    id: &str,
    label: &str,
    required: bool,
    value: &mut String,
    options: &[&str],
) {
    let (response, label_id) = form_field(ui, id, label, required && value.is_empty(), |ui| {
        combo_box(id)
            .width(ui.available_width())
            .selected_text(value.as_str())
            .show_ui(ui, |ui| {
                for option in options {
                    ui.selectable_value(value, (*option).to_owned(), *option);
                }
            })
            .response
    });
    response.labelled_by(label_id);
}

/// Shared legacy filter tabs/search/create layout. Existing view state owns all
/// filtering and mutations; this helper only reports user interactions.
pub fn filter_toolbar(
    ui: &mut Ui,
    id: &str,
    tabs: &[&str],
    selected: usize,
    search: &mut String,
    search_hint: &str,
    create_label: &str,
    solid_tabs: bool,
    search_limit: usize,
) -> ToolbarResponse {
    filter_toolbar_with_more(
        ui,
        id,
        tabs,
        selected,
        search,
        search_hint,
        create_label,
        solid_tabs,
        search_limit,
        |_| {},
    )
}

pub fn filter_toolbar_with_more(
    ui: &mut Ui,
    id: &str,
    tabs: &[&str],
    selected: usize,
    search: &mut String,
    search_hint: &str,
    create_label: &str,
    solid_tabs: bool,
    search_limit: usize,
    more: impl FnOnce(&mut Ui),
) -> ToolbarResponse {
    let mut result = ToolbarResponse::default();
    let compact = ui.ctx().screen_rect().width() <= 992.0;
    let width = ui.available_width();
    let font = FontId::new(13.0, egui::FontFamily::Name("legacy-controls".into()));
    let widths = tabs
        .iter()
        .map(|label| {
            ui.painter()
                .layout_no_wrap((*label).to_owned(), font.clone(), Color32::BLACK)
                .size()
                .x
                + 18.0
        })
        .collect::<Vec<_>>();
    let create_width = ui
        .painter()
        .layout_no_wrap(
            create_label.to_owned(),
            FontId::new(14.0, egui::FontFamily::Name("legacy-controls".into())),
            Color32::WHITE,
        )
        .size()
        .x
        + 32.0;
    let left_width = widths.iter().sum::<f32>() + tabs.len() as f32 * 6.0 + 28.0;
    let same_row = !compact && left_width + 10.0 + 280.0 + 8.0 + create_width <= width;
    let mut tab_positions = Vec::new();
    let mut x = 0.0;
    let tab_height = if solid_tabs { 32.0 } else { 28.0 };
    let mut y = if same_row && !solid_tabs { 2.0 } else { 0.0 };
    for &button_width in &widths {
        if x > 0.0 && x + button_width > width {
            x = 0.0;
            y += tab_height + 6.0;
        }
        tab_positions.push(egui::pos2(x, y));
        x += button_width + 6.0;
    }
    if x + 28.0 > width {
        x = 0.0;
        y += tab_height + 6.0;
    }
    let menu_position = egui::pos2(x, y);
    let right_y = if same_row { 0.0 } else { y + tab_height + 10.0 };
    let height = if same_row {
        32.0
    } else {
        right_y + if compact { 72.0 } else { 32.0 }
    };
    let (bounds, _) = ui.allocate_exact_size(egui::vec2(width, height), Sense::hover());
    for (index, ((label, &button_width), pos)) in tabs
        .iter()
        .zip(widths.iter())
        .zip(tab_positions)
        .enumerate()
    {
        let rect = Rect::from_min_size(
            bounds.min + pos.to_vec2(),
            egui::vec2(button_width, if solid_tabs { 32.0 } else { 28.0 }),
        );
        let active = index == selected;
        let button = egui::Button::new(egui::RichText::new(*label).font(font.clone()).color(
            if active && solid_tabs {
                Color32::WHITE
            } else if active {
                crate::theme::PRIMARY_ACTIVE
            } else {
                Color32::from_rgb(71, 85, 105)
            },
        ))
        .fill(if active && solid_tabs {
            crate::theme::PRIMARY
        } else if active {
            Color32::from_rgb(224, 242, 241)
        } else {
            Color32::WHITE
        })
        .stroke(Stroke::new(
            1.0,
            if active {
                crate::theme::PRIMARY
            } else {
                Color32::from_rgb(203, 213, 225)
            },
        ));
        if put(ui, rect, button).clicked() {
            result.selected = Some(index);
        }
    }
    let menu = Rect::from_min_size(bounds.min + menu_position.to_vec2(), egui::vec2(28.0, 28.0));
    let mut child = ui.new_child(UiBuilder::new().id_salt((id, "more")).max_rect(menu));
    child.spacing_mut().button_padding = egui::vec2(4.0, 2.0);
    child.spacing_mut().interact_size.y = 28.0;
    child.menu_button("…", |ui| {
        more(ui);
        if ui.button("Làm mới").clicked() {
            result.reload_clicked = true;
            ui.close_menu();
        }
    });
    let right_x = if same_row {
        bounds.right() - 280.0 - 8.0 - create_width
    } else {
        bounds.left()
    };
    let search_rect = Rect::from_min_size(
        egui::pos2(right_x, bounds.top() + right_y),
        egui::vec2(if compact { width } else { 280.0 }, 32.0),
    );
    result.search_changed = put(
        ui,
        search_rect,
        egui::TextEdit::singleline(search)
            .hint_text(search_hint)
            .font(FontId::new(
                14.0,
                egui::FontFamily::Name("legacy-controls".into()),
            ))
            .char_limit(search_limit),
    )
    .changed();
    let create_rect = Rect::from_min_size(
        if compact {
            egui::pos2(bounds.left(), search_rect.bottom() + 8.0)
        } else {
            egui::pos2(search_rect.right() + 8.0, search_rect.top())
        },
        egui::vec2(create_width, 32.0),
    );
    result.create_clicked = put(
        ui,
        create_rect,
        egui::Button::new(egui::RichText::new(create_label).color(Color32::WHITE))
            .fill(crate::theme::PRIMARY),
    )
    .clicked();
    crate::visual_test::record(&format!("{id}.toolbar"), bounds);
    crate::visual_test::record(&format!("{id}.create"), create_rect);
    result
}

/// Widths are measured CSS widths. Horizontal overflow remains scrollable.
pub fn table(
    ui: &mut Ui,
    id: &str,
    columns: &[TableColumn<'_>],
    rows: usize,
    cell: impl FnMut(&mut Ui, usize, usize),
) {
    table_with_row_height(ui, id, columns, rows, 76.0, cell);
}

pub fn table_with_row_height(
    ui: &mut Ui,
    id: &str,
    columns: &[TableColumn<'_>],
    rows: usize,
    row_height: f32,
    mut cell: impl FnMut(&mut Ui, usize, usize),
) {
    let row_height = row_height.max(24.0);
    let available = ui.available_width();
    let cell_padding = if ui.ctx().screen_rect().width() <= 992.0 {
        10.0
    } else {
        12.0
    };
    egui::ScrollArea::horizontal()
        .id_salt((id, "scroll"))
        .show(ui, |ui| {
            let width = columns
                .iter()
                .map(|c| c.width)
                .sum::<f32>()
                .max((available - 2.0).max(0.0));
            let body_height = if rows == 0 {
                157.0
            } else {
                rows as f32 * row_height
            };
            let (bounds, _) =
                ui.allocate_exact_size(egui::vec2(width + 2.0, 38.5 + body_height), Sense::hover());
            let painter = ui.painter();
            painter.rect_filled(bounds, 8.0, Color32::WHITE);
            let header =
                Rect::from_min_size(bounds.min + Vec2::splat(1.0), egui::vec2(width, 36.5));
            painter.rect_filled(
                header,
                egui::Rounding {
                    nw: 7.0,
                    ne: 7.0,
                    sw: 0.0,
                    se: 0.0,
                },
                Color32::from_rgb(245, 245, 245),
            );
            painter.line_segment(
                [header.left_bottom(), header.right_bottom()],
                Stroke::new(1.0, Color32::from_rgb(224, 224, 224)),
            );
            let mut x = bounds.left() + 1.0;
            for (col_index, column) in columns.iter().enumerate() {
                let rect = Rect::from_min_size(
                    egui::pos2(x, header.top()),
                    egui::vec2(column.width, 36.5),
                );
                painter.with_clip_rect(rect.intersect(ui.clip_rect())).text(
                    rect.left_center() + egui::vec2(cell_padding, 0.0),
                    Align2::LEFT_CENTER,
                    column.title,
                    FontId::proportional(13.0),
                    Color32::from_rgba_unmultiplied(0, 0, 0, 115),
                );
                crate::visual_test::record(&format!("{id}.header.{col_index}"), rect);
                ui.interact(
                    rect,
                    ui.id().with((id, "header", col_index)),
                    Sense::hover(),
                )
                .widget_info(|| {
                    egui::WidgetInfo::labeled(egui::WidgetType::Label, true, column.title)
                });
                x += column.width;
            }
            if rows == 0 {
                let center = egui::pos2(bounds.center().x, header.bottom() + body_height / 2.0);
                let icon =
                    Rect::from_center_size(center - egui::vec2(0.0, 14.5), Vec2::splat(48.0));
                egui::Image::from_bytes(
                    "bytes://legacy-empty.svg",
                    include_bytes!("../assets/legacy-empty.svg"),
                )
                .paint_at(ui, icon);
                ui.painter().text(
                    center + egui::vec2(0.0, 28.0),
                    Align2::CENTER_CENTER,
                    "No Data",
                    FontId::proportional(14.0),
                    Color32::from_rgb(191, 191, 191),
                );
            } else {
                for row in 0..rows {
                    let mut x = bounds.left() + 1.0;
                    let y = header.bottom() + row as f32 * row_height;
                    let row_rect =
                        Rect::from_min_size(egui::pos2(x, y), egui::vec2(width, row_height));
                    if ui.rect_contains_pointer(row_rect) {
                        ui.painter()
                            .rect_filled(row_rect, 0.0, Color32::from_rgb(250, 250, 250));
                    }
                    for (col, column) in columns.iter().enumerate() {
                        let rect = Rect::from_min_size(
                            egui::pos2(x, y),
                            egui::vec2(column.width, row_height),
                        );
                        let inner = rect.shrink2(egui::vec2(cell_padding, 8.0));
                        let mut child = ui.new_child(
                            UiBuilder::new()
                                .id_salt((id, row, col))
                                .max_rect(inner)
                                .layout(Layout::top_down(Align::Min)),
                        );
                        child.set_clip_rect(rect.intersect(ui.clip_rect()));
                        child.spacing_mut().item_spacing = egui::vec2(6.0, 2.0);
                        cell(&mut child, row, col);
                        x += column.width;
                    }
                    if row + 1 < rows {
                        ui.painter().line_segment(
                            [row_rect.left_bottom(), row_rect.right_bottom()],
                            Stroke::new(1.0, Color32::from_rgb(240, 240, 240)),
                        );
                    }
                }
            }
            ui.painter().rect_stroke(
                bounds.shrink(0.5),
                8.0,
                Stroke::new(1.0, Color32::from_rgb(217, 217, 217)),
            );
            crate::visual_test::record(id, bounds);
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newly_opened_modals_do_not_receive_the_launch_click() {
        let ctx = egui::Context::default();
        let mut enabled = Vec::new();
        for _ in 0..3 {
            let _ = ctx.run(egui::RawInput::default(), |ctx| {
                modal(ctx, "launch-click.fixture", "Form", 400.0, false, |ui| {
                    enabled.push(ui.is_enabled())
                });
            });
        }
        assert_eq!(enabled, vec![false, true, true]);
        let replay = egui::Context::default();
        let mut replay_enabled = Vec::new();
        for time in [0.0, 0.0, 1.0] {
            let _ = replay.run(
                egui::RawInput {
                    time: Some(time),
                    ..Default::default()
                },
                |ctx| {
                    modal(ctx, "replayed-launch.fixture", "Form", 400.0, false, |ui| {
                        replay_enabled.push(ui.is_enabled())
                    });
                },
            );
        }
        assert_eq!(replay_enabled, vec![false, false, true]);
        // A busy modal must stay non-interactive after its opening pass too.
        let _ = ctx.run(egui::RawInput::default(), |ctx| {
            modal(ctx, "launch-click.fixture", "Form", 400.0, true, |ui| {
                assert!(!ui.is_enabled())
            });
        });
    }

    #[test]
    fn grid_tracks_keep_css_subpixel_remainder_in_last_column() {
        let tracks = grid_tracks(1196.0, 3, 14.0);
        assert_eq!(tracks, vec![389.328125, 389.328125, 389.34375]);
        assert_eq!(tracks.iter().sum::<f32>() + 28.0, 1196.0);
        assert_eq!(grid_tracks(366.0, 1, 12.0), vec![366.0]);
    }
    #[test]
    fn modal_footer_is_not_trapped_by_the_previous_frame_area_height() {
        let ctx = egui::Context::default();
        crate::native_text::setup_fonts(&ctx);
        crate::native_text::setup_style(&ctx);
        let mut footer = Rect::NOTHING;
        let mut clip = Rect::NOTHING;
        for _ in 0..6 {
            let _ = ctx.run(
                egui::RawInput {
                    screen_rect: Some(Rect::from_min_size(
                        egui::Pos2::ZERO,
                        egui::vec2(1440.0, 900.0),
                    )),
                    ..Default::default()
                },
                |ctx| {
                    modal(
                        ctx,
                        "fixture.footer",
                        "Thêm đối tác",
                        640.0,
                        false,
                        |ui| {
                            ui.add_space(14.0);
                            for index in 0..10 {
                                let mut value = String::new();
                                form_input(
                                    ui,
                                    &format!("footer.field.{index}"),
                                    "Tên trường",
                                    false,
                                    &mut value,
                                    "",
                                    false,
                                );
                            }
                            ui.add_space(18.0);
                            action_row(ui, |ui| {
                                let response = ui.button("Lưu đối tác");
                                footer = response.rect;
                                clip = ui.clip_rect();
                            });
                        },
                    );
                },
            );
        }
        assert!(
            footer.bottom() <= clip.bottom(),
            "footer {footer:?} must be fully visible in {clip:?}"
        );
    }
    #[test]
    fn cards_without_detail_match_crm_and_task_heights() {
        for (size, padding, gap, expected) in [(22.0, 16.0, 4.0, 89.75), (23.0, 14.0, 5.0, 88.25)] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            let _ = ctx.run(egui::RawInput::default(), |ctx| {
                egui::CentralPanel::default().show(ctx, |ui| {
                    ui.spacing_mut().item_spacing.y = 0.0;
                    let top = ui.cursor().top();
                    metrics_grid(
                        ui,
                        "fixture.no-detail",
                        &[Metric {
                            label: "Tổng bản ghi",
                            value: "0".into(),
                            detail: "",
                            color: Color32::BLACK,
                            value_size: size,
                        }],
                        egui::vec2(16.0, padding),
                        210.0,
                        gap,
                    );
                    assert_eq!(ui.cursor().top() - top, expected);
                });
            });
        }
    }

    #[test]
    fn pagination_normalizes_zero_size_and_out_of_range_pages() {
        let ctx = egui::Context::default();
        crate::native_text::setup_fonts(&ctx);
        let mut page = usize::MAX;
        let mut size = 0;
        let _ = ctx.run(egui::RawInput::default(), |ctx| {
            egui::CentralPanel::default().show(ctx, |ui| {
                pagination(ui, "fixture.page", &mut page, 0, &mut size)
            });
        });
        assert_eq!((page, size), (0, 1));
        page = 100;
        size = 8;
        let _ = ctx.run(egui::RawInput::default(), |ctx| {
            egui::CentralPanel::default().show(ctx, |ui| {
                pagination(ui, "fixture.page", &mut page, 17, &mut size)
            });
        });
        assert_eq!(page, 2);
    }

    #[test]
    fn textarea_reserves_rows_instead_of_overlapping_the_next_field() {
        let ctx = egui::Context::default();
        crate::native_text::setup_fonts(&ctx);
        let _ = ctx.run(egui::RawInput::default(), |ctx| {
            egui::CentralPanel::default().show(ctx, |ui| {
                ui.spacing_mut().item_spacing.y = 0.0;
                let top = ui.cursor().top();
                form_field_sized(ui, "fixture.multiline", "Mô tả", false, 73.0, |ui| {
                    assert_eq!(ui.available_height(), 73.0)
                });
                let multiline_height = ui.cursor().top() - top;
                let single_top = ui.cursor().top();
                form_field(ui, "fixture.single", "Mô tả", false, |_| {});
                assert_eq!(multiline_height - (ui.cursor().top() - single_top), 41.0);
            });
        });
    }

    #[test]
    fn drawer_is_right_aligned_full_height_and_constrains_long_content() {
        for width in [1440.0, 390.0, 320.0] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            let screen = Rect::from_min_size(egui::Pos2::ZERO, egui::vec2(width, 844.0));
            for _ in 0..3 {
                let _ = ctx.run(
                    egui::RawInput {
                        screen_rect: Some(screen),
                        ..Default::default()
                    },
                    |ctx| {
                        let (_, closed) = drawer(
                            ctx,
                            "fixture.drawer",
                            "Lý Lịch & Hồ Sơ Tài Sản Doanh Nghiệp",
                            520.0,
                            |ui| {
                                for _ in 0..100 {
                                    ui.label("Một dòng thông tin hồ sơ");
                                }
                            },
                        );
                        assert!(!closed);
                    },
                );
            }
            let rect = ctx
                .memory(|m| m.area_rect(egui::Id::new(("fixture.drawer", "drawer"))))
                .unwrap();
            let right = screen.right() - if width <= 992.0 { 10.0 } else { 0.0 };
            assert!((rect.right() - right).abs() < 0.1, "{rect:?}");
            assert_eq!(
                rect.width(),
                if width <= 992.0 {
                    (width - 20.0).min(420.0)
                } else {
                    520.0
                }
            );
            assert!((rect.height() - screen.height()).abs() < 0.1, "{rect:?}");
            assert!(rect.left() >= screen.left(), "{rect:?}");
        }
    }

    #[test]
    fn page_header_wraps_long_titles_before_the_refresh_action() {
        let mut heights = Vec::new();
        for width in [800.0, 230.0] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            let _ = ctx.run(egui::RawInput::default(), |ctx| {
                egui::CentralPanel::default().show(ctx, |ui| {
                    let mut child = ui.new_child(UiBuilder::new().max_rect(Rect::from_min_size(
                        ui.cursor().min,
                        egui::vec2(width, 800.0),
                    )));
                    child.spacing_mut().item_spacing.y = 0.0;
                    let top = child.cursor().top();
                    page_header(
                        &mut child,
                        "fixture.header",
                        "Khách hàng và đối tác doanh nghiệp",
                        "Danh sách liên hệ từ máy chủ.",
                        true,
                    );
                    heights.push(child.cursor().top() - top);
                });
            });
        }
        assert!(heights[1] > heights[0] + 40.0, "{heights:?}");
    }
    #[test]
    fn actions_only_consume_one_row_even_in_a_tall_page() {
        let ctx = egui::Context::default();
        let _ = ctx.run(
            egui::RawInput {
                screen_rect: Some(Rect::from_min_size(
                    egui::Pos2::ZERO,
                    egui::vec2(1440.0, 900.0),
                )),
                ..Default::default()
            },
            |ctx| {
                egui::CentralPanel::default().show(ctx, |ui| {
                    ui.spacing_mut().item_spacing.y = 0.0;
                    let top = ui.cursor().top();
                    action_row(ui, |ui| {
                        let _ = ui.button("Tiếp");
                    });
                    assert_eq!(ui.cursor().top() - top, 32.0);
                });
            },
        );
    }
    #[test]
    fn measured_tabs_keep_the_requested_box_instead_of_global_button_minimum() {
        let ctx = egui::Context::default();
        crate::native_text::setup_fonts(&ctx);
        crate::native_text::setup_style(&ctx);
        let _ = ctx.run(egui::RawInput::default(), |ctx| {
            egui::CentralPanel::default().show(ctx, |ui| {
                let rect = Rect::from_min_size(ui.cursor().min, egui::vec2(104.0, 24.0));
                let response = put(
                    ui,
                    rect,
                    egui::Button::new(egui::RichText::new("Tất cả nhân sự").size(12.0)),
                );
                assert_eq!(response.rect, rect);
            });
        });
    }

    #[test]
    fn metric_cards_wrap_content_and_reserve_the_tallest_row() {
        let mut heights = Vec::new();
        for detail in [
            "Ngắn",
            "Tổng hợp theo dữ liệu phòng ban đang có nhân sự hoạt động",
        ] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            let _ = ctx.run(
                egui::RawInput {
                    screen_rect: Some(Rect::from_min_size(
                        egui::Pos2::ZERO,
                        egui::vec2(1440.0, 900.0),
                    )),
                    ..Default::default()
                },
                |ctx| {
                    egui::CentralPanel::default().show(ctx, |ui| {
                        let mut child = ui.new_child(
                            UiBuilder::new()
                                .max_rect(Rect::from_min_size(
                                    ui.cursor().min,
                                    egui::vec2(288.5, 600.0),
                                ))
                                .layout(Layout::top_down(Align::Min)),
                        );
                        child.spacing_mut().item_spacing.y = 0.0;
                        let top = child.cursor().top();
                        metrics(
                            &mut child,
                            "fixture.metrics",
                            &[Metric {
                                label: "Tổng số đơn vị",
                                value: "3 đơn vị".to_owned(),
                                detail,
                                color: Color32::BLACK,
                                value_size: 24.0,
                            }],
                        );
                        heights.push(child.cursor().top() - top);
                    });
                },
            );
        }
        assert_eq!(heights[0], 108.0);
        assert!(
            heights[1] > heights[0],
            "long subtitles must increase height: {heights:?}"
        );
    }

    #[test]
    fn table_geometry_includes_both_borders_and_css_empty_height() {
        for (rows, expected) in [(0, 195.5), (1, 94.75)] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            let _ = ctx.run(egui::RawInput::default(), |ctx| {
                egui::CentralPanel::default().show(ctx, |ui| {
                    ui.spacing_mut().item_spacing.y = 0.0;
                    let top = ui.cursor().top();
                    table_with_row_height(
                        ui,
                        "fixture.table",
                        &[TableColumn {
                            title: "Tên",
                            width: 120.0,
                        }],
                        rows,
                        56.25,
                        |ui, _, _| {
                            ui.label("Value");
                        },
                    );
                    assert_eq!(ui.cursor().top() - top, expected);
                });
            });
        }
    }

    #[test]
    fn legacy_auto_fit_boundaries_and_narrow_width() {
        assert_eq!(grid_columns(1196.0, 240.0, 14.0, 4), 4);
        assert_eq!(grid_columns(1001.0, 240.0, 14.0, 4), 3);
        assert_eq!(grid_columns(1002.0, 240.0, 14.0, 4), 4);
        assert_eq!(grid_columns(366.0, 240.0, 14.0, 4), 1);
        assert_eq!(grid_columns(0.0, 240.0, 14.0, 4), 1);
    }

    #[test]
    fn long_modals_are_not_clipped_by_egui_default_area_height() {
        let ctx = egui::Context::default();
        crate::native_text::setup_fonts(&ctx);
        let mut last_bottom = 0.0;
        for _ in 0..3 {
            let _ = ctx.run(
                egui::RawInput {
                    screen_rect: Some(Rect::from_min_size(
                        egui::Pos2::ZERO,
                        egui::vec2(1440.0, 900.0),
                    )),
                    ..Default::default()
                },
                |ctx| {
                    modal(ctx, "fixture.long", "Form", 560.0, false, |ui| {
                        for index in 0..7 {
                            form_field(
                                ui,
                                &format!("field.{index}"),
                                "Tên trường",
                                false,
                                |ui| {
                                    last_bottom = ui.max_rect().bottom();
                                    ui.label("Value");
                                },
                            );
                        }
                    });
                },
            );
        }
        let rect = ctx
            .memory(|m| m.area_rect(egui::Id::new(("fixture.long", "dialog"))))
            .unwrap();
        assert!(
            rect.height() > 450.0,
            "the form must grow beyond the 400px default: {rect:?}"
        );
        assert!(
            last_bottom <= rect.bottom(),
            "the last field must remain inside the modal"
        );
    }

    #[test]
    fn form_labels_wrap_without_reducing_the_input_height() {
        let mut heights = Vec::new();
        for width in [300.0, 90.0] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            let _ = ctx.run(
                egui::RawInput {
                    screen_rect: Some(Rect::from_min_size(
                        egui::Pos2::ZERO,
                        egui::vec2(800.0, 600.0),
                    )),
                    ..Default::default()
                },
                |ctx| {
                    egui::CentralPanel::default().show(ctx, |ui| {
                        let mut field_ui = ui.new_child(
                            UiBuilder::new()
                                .max_rect(Rect::from_min_size(
                                    ui.cursor().min,
                                    egui::vec2(width, 300.0),
                                ))
                                .layout(Layout::top_down(Align::Min)),
                        );
                        field_ui.spacing_mut().item_spacing.y = 0.0;
                        assert_eq!(field_ui.available_width(), width);
                        let top = field_ui.cursor().top();
                        form_field(
                            &mut field_ui,
                            "fixture.field",
                            "Chọn luồng quy trình áp dụng",
                            true,
                            |ui| assert_eq!(ui.available_height(), 32.0),
                        );
                        heights.push(field_ui.cursor().top() - top);
                    });
                },
            );
        }
        assert!(
            heights[1] > heights[0],
            "narrow labels need additional vertical space: {heights:?}"
        );
    }

    #[test]
    fn modal_stays_in_the_viewport_and_busy_content_is_disabled() {
        for (width, busy) in [(1440.0, false), (390.0, false), (390.0, true)] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            let screen = Rect::from_min_size(egui::Pos2::ZERO, egui::vec2(width, 844.0));
            let mut visible_passes = 0;
            for _ in 0..3 {
                let _ = ctx.run(
                    egui::RawInput {
                        screen_rect: Some(screen),
                        ..Default::default()
                    },
                    |ctx| {
                        let ((visible, enabled), closed) =
                            modal(ctx, "fixture.modal", "Form", 600.0, busy, |ui| {
                                let enabled = ui.is_enabled();
                                let visible = ui.is_visible();
                                form_field(ui, "fixture.input", "Tên trường", true, |ui| {
                                    ui.label("Value");
                                });
                                (visible, enabled)
                            });
                        // egui's first sizing pass is deliberately invisible and disabled.
                        if visible {
                            visible_passes += 1;
                            assert_eq!(enabled, !busy);
                        }
                        assert!(!closed);
                    },
                );
            }
            assert!(
                visible_passes > 0,
                "the modal must become visible after its sizing pass"
            );
            let rect = ctx
                .memory(|m| m.area_rect(egui::Id::new(("fixture.modal", "dialog"))))
                .unwrap();
            assert!(screen.contains_rect(rect), "{rect:?}");
            assert_eq!(rect.width(), if width > 992.0 { 600.0 } else { 370.0 });
            if !busy {
                let close = ctx
                    .memory(|m| m.area_rect(egui::Id::new(("fixture.modal", "close"))))
                    .unwrap();
                let mut was_closed = false;
                for pressed in [true, false] {
                    let _ = ctx.run(
                        egui::RawInput {
                            screen_rect: Some(screen),
                            events: vec![
                                egui::Event::PointerMoved(close.center()),
                                egui::Event::PointerButton {
                                    pos: close.center(),
                                    button: egui::PointerButton::Primary,
                                    pressed,
                                    modifiers: Default::default(),
                                },
                            ],
                            ..Default::default()
                        },
                        |ctx| {
                            was_closed |= modal(ctx, "fixture.modal", "Form", 600.0, false, |ui| {
                                form_field(ui, "fixture.input", "Tên trường", true, |ui| {
                                    ui.label("Value");
                                });
                            })
                            .1;
                        },
                    );
                }
                assert!(was_closed, "the explicit close button must remain usable");
            }
        }
    }
}
