//! Legacy DatePicker presentation, backed by chrono rather than string date math.
use chrono::{Datelike, Duration, Local, NaiveDate};
use egui::{Align2, Color32, FontId, Pos2, Rect, Sense, Stroke, Ui, Vec2};

#[derive(Clone, Copy, PartialEq)]
enum Mode {
    Day,
    Month,
    Year,
}
#[derive(Clone)]
struct PickerState {
    open: bool,
    year: i32,
    month: u32,
    year_page: i32,
    mode: Mode,
}

const CALENDAR:&[u8]=br##"<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>"##;
const PREV:&[u8]=br##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>"##;
const NEXT:&[u8]=br##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>"##;
const PREV_YEAR:&[u8]=br##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>"##;
const NEXT_YEAR:&[u8]=br##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>"##;

fn days_grid(year: i32, month: u32) -> Option<Vec<NaiveDate>> {
    let first = NaiveDate::from_ymd_opt(year, month, 1)?;
    let start =
        first.checked_sub_signed(Duration::days(first.weekday().num_days_from_monday() as i64))?;
    (0..42)
        .map(|day| start.checked_add_signed(Duration::days(day)))
        .collect()
}
fn shift_month(year: i32, month: u32, delta: i32) -> (i32, u32) {
    let value = (year as i64 * 12 + month as i64 - 1 + delta as i64).clamp(12, 119999);
    ((value / 12) as i32, (value % 12 + 1) as u32)
}
fn popup_position(trigger: Rect, screen: Rect, width: f32) -> Pos2 {
    let x = if trigger.left() + width > screen.right() {
        (screen.right() - width - 10.0).max(screen.left() + 10.0)
    } else {
        trigger.left()
    };
    // The reference uses a 310px placement estimate, independently of mode height.
    let y = if trigger.bottom() + 4.0 + 310.0 > screen.bottom()
        && trigger.top() - 314.0 > screen.top()
    {
        trigger.top() - 314.0
    } else {
        trigger.bottom() + 4.0
    };
    egui::pos2(x, y)
}

pub fn date_picker(ui: &mut Ui, id: &str, value: &mut String) -> egui::Response {
    let ctx = ui.ctx().clone();
    let key = egui::Id::new(("legacy.date", id));
    let today = Local::now().date_naive();
    let selected = NaiveDate::parse_from_str(value, "%Y-%m-%d").ok();
    let initial = selected.unwrap_or(today);
    let mut state = ctx
        .data_mut(|data| data.get_temp::<PickerState>(key))
        .unwrap_or(PickerState {
            open: false,
            year: initial.year(),
            month: initial.month(),
            year_page: initial.year().div_euclid(12) * 12,
            mode: Mode::Day,
        });
    if !ui.is_enabled() {
        state.open = false;
    }
    let (trigger, _) =
        ui.allocate_exact_size(egui::vec2(ui.available_width(), 32.0), Sense::hover());
    if state.open {
        ui.painter().rect_stroke(
            trigger.expand(1.0),
            7.0,
            Stroke::new(2.0, Color32::from_rgba_unmultiplied(0, 150, 136, 38)),
        );
    }
    ui.painter().rect_filled(
        trigger,
        6.0,
        if ui.is_enabled() {
            Color32::WHITE
        } else {
            Color32::from_rgb(245, 245, 245)
        },
    );
    ui.painter().rect_stroke(
        trigger.shrink(0.5),
        6.0,
        Stroke::new(
            1.0,
            if state.open {
                crate::theme::PRIMARY
            } else {
                Color32::from_rgb(217, 217, 217)
            },
        ),
    );
    let mut response = crate::widgets::put(
        ui,
        trigger,
        egui::TextEdit::singleline(value)
            .id_salt((id, "text"))
            .frame(false)
            .hint_text("YYYY-MM-DD")
            .margin(egui::Margin {
                left: 11.0,
                right: 32.0,
                top: 4.0,
                bottom: 4.0,
            })
            .font(FontId::proportional(13.0)),
    );
    let icon_rect = Rect::from_min_size(
        egui::pos2(trigger.right() - 27.0, trigger.top() + 9.0),
        Vec2::splat(14.0),
    );
    egui::Image::from_bytes("bytes://legacy-datepicker-calendar.svg", CALENDAR)
        .paint_at(ui, icon_rect);
    let icon_response = ui.interact(icon_rect.expand(5.0), key.with("trigger"), Sense::click());
    icon_response.widget_info(|| {
        egui::WidgetInfo::labeled(
            egui::WidgetType::Button,
            ui.is_enabled(),
            "Mở lịch chọn ngày",
        )
    });
    if ui.is_enabled() && (response.clicked() || icon_response.clicked()) {
        state.open = !state.open;
        state.mode = Mode::Day;
        if state.open {
            state.year = initial.year();
            state.month = initial.month();
            state.year_page = initial.year().div_euclid(12) * 12;
        }
    }
    crate::visual_test::record(&format!("date.{id}.trigger"), trigger);
    if state.open {
        let screen = ctx.screen_rect();
        let width = 280.0_f32.min((screen.width() - 20.0).max(1.0));
        let position = popup_position(trigger, screen, width);
        let height = if state.mode == Mode::Day {
            316.5
        } else {
            230.0
        };
        let popup_rect = Rect::from_min_size(position, egui::vec2(width, height));
        let mut pick = None;
        let mut clear = false;
        egui::Area::new(key.with("popup"))
            .order(egui::Order::Tooltip)
            .fixed_pos(position)
            .show(&ctx, |ui| {
                ui.spacing_mut().item_spacing = Vec2::ZERO;
                let (bounds, _) = ui.allocate_exact_size(popup_rect.size(), Sense::hover());
                ui.painter().add(
                    egui::Frame::none()
                        .rounding(8.0)
                        .shadow(egui::epaint::Shadow {
                            offset: egui::vec2(0.0, 10.0),
                            blur: 25.0,
                            spread: -5.0,
                            color: Color32::from_black_alpha(26),
                        })
                        .paint(bounds),
                );
                ui.painter().add(
                    egui::Frame::none()
                        .fill(Color32::WHITE)
                        .rounding(8.0)
                        .shadow(egui::epaint::Shadow {
                            offset: egui::vec2(0.0, 8.0),
                            blur: 10.0,
                            spread: -6.0,
                            color: Color32::from_black_alpha(26),
                        })
                        .paint(bounds),
                );
                ui.painter().rect_stroke(
                    bounds.shrink(0.5),
                    8.0,
                    Stroke::new(1.0, Color32::from_rgb(226, 232, 240)),
                );
                let origin = bounds.min + egui::vec2(15.0, 13.0);
                let content_width = width - 30.0;
                let nav_y = origin.y + 2.125;
                for (name, label, svg, x, delta) in [
                    ("prevYear", "Năm trước", PREV_YEAR, origin.x, -12_i32),
                    ("prevMonth", "Tháng trước", PREV, origin.x + 26.0, -1),
                    (
                        "nextMonth",
                        "Tháng sau",
                        NEXT,
                        origin.x + content_width - 50.0,
                        1,
                    ),
                    (
                        "nextYear",
                        "Năm sau",
                        NEXT_YEAR,
                        origin.x + content_width - 24.0,
                        12,
                    ),
                ] {
                    if state.mode != Mode::Day && delta.abs() == 1 {
                        continue;
                    }
                    let rect = Rect::from_min_size(egui::pos2(x, nav_y), egui::vec2(24.0, 20.0));
                    let clicked = crate::widgets::put(
                        ui,
                        rect,
                        egui::Button::image(
                            egui::Image::from_bytes(format!("bytes://legacy-date-{name}.svg"), svg)
                                .fit_to_exact_size(Vec2::splat(12.0)),
                        )
                        .frame(false),
                    );
                    clicked.widget_info(|| {
                        egui::WidgetInfo::labeled(egui::WidgetType::Button, true, label)
                    });
                    if clicked.on_hover_text(label).clicked() {
                        if state.mode == Mode::Year {
                            state.year_page = (state.year_page + delta).clamp(0, 9996);
                        } else {
                            (state.year, state.month) = shift_month(state.year, state.month, delta);
                        }
                    }
                    crate::visual_test::record(&format!("date.{id}.{name}"), rect);
                }
                let heading = Rect::from_min_size(
                    egui::pos2(origin.x + 52.0, origin.y),
                    egui::vec2(content_width - 104.0, 24.25),
                );
                if state.mode == Mode::Day {
                    let month =
                        Rect::from_min_size(heading.min, egui::vec2(heading.width() * 0.6, 24.25));
                    let year = Rect::from_min_size(
                        egui::pos2(month.right() + 2.0, heading.top()),
                        egui::vec2(heading.width() * 0.4 - 2.0, 24.25),
                    );
                    if crate::widgets::put(
                        ui,
                        month,
                        egui::Button::new(
                            egui::RichText::new(format!("Tháng {}", state.month)).size(13.5),
                        )
                        .frame(false),
                    )
                    .clicked()
                    {
                        state.mode = Mode::Month;
                    }
                    if crate::widgets::put(
                        ui,
                        year,
                        egui::Button::new(egui::RichText::new(state.year.to_string()).size(13.5))
                            .frame(false),
                    )
                    .clicked()
                    {
                        state.mode = Mode::Year;
                        state.year_page = state.year.div_euclid(12) * 12;
                    }
                    crate::visual_test::record(&format!("date.{id}.month"), month);
                    crate::visual_test::record(&format!("date.{id}.year"), year);
                } else {
                    let label = if state.mode == Mode::Month {
                        state.year.to_string()
                    } else {
                        format!("{} - {}", state.year_page, state.year_page + 11)
                    };
                    if crate::widgets::put(
                        ui,
                        heading,
                        egui::Button::new(
                            egui::RichText::new(label)
                                .size(14.0)
                                .color(crate::theme::PRIMARY),
                        )
                        .frame(false),
                    )
                    .clicked()
                    {
                        state.mode = Mode::Year;
                    }
                }
                ui.painter().line_segment(
                    [
                        egui::pos2(origin.x, origin.y + 30.75),
                        egui::pos2(origin.x + content_width, origin.y + 30.75),
                    ],
                    Stroke::new(1.0, Color32::from_rgb(241, 245, 249)),
                );
                if state.mode == Mode::Day {
                    let weekday_y = origin.y + 39.25;
                    for (col, label) in ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
                        .into_iter()
                        .enumerate()
                    {
                        ui.painter().text(
                            egui::pos2(
                                origin.x + (col as f32 + 0.5) * content_width / 7.0,
                                weekday_y + 12.625,
                            ),
                            Align2::CENTER_CENTER,
                            label,
                            FontId::proportional(11.5),
                            if col >= 5 {
                                Color32::from_rgb(239, 68, 68)
                            } else {
                                Color32::from_rgb(100, 116, 139)
                            },
                        );
                    }
                    if let Some(days) = days_grid(state.year, state.month) {
                        let cell_width = (content_width - 12.0) / 7.0;
                        for (index, day) in days.into_iter().enumerate() {
                            let cell = Rect::from_min_size(
                                egui::pos2(
                                    origin.x + (index % 7) as f32 * (cell_width + 2.0),
                                    origin.y + 70.5 + (index / 7) as f32 * 31.0,
                                ),
                                egui::vec2(cell_width, 28.0),
                            );
                            let current = day.month() == state.month && day.year() == state.year;
                            let active = current && selected == Some(day);
                            let response =
                                ui.interact(cell, key.with(("day", index)), Sense::click());
                            response.widget_info(|| {
                                egui::WidgetInfo::labeled(
                                    egui::WidgetType::Button,
                                    (1..=9999).contains(&day.year()),
                                    day.format("%Y-%m-%d").to_string(),
                                )
                            });
                            if active || response.hovered() || day == today {
                                ui.painter().rect_filled(
                                    cell,
                                    4.0,
                                    if active {
                                        crate::theme::PRIMARY
                                    } else if response.hovered() {
                                        Color32::from_rgb(241, 245, 249)
                                    } else {
                                        Color32::from_rgb(224, 242, 241)
                                    },
                                );
                            }
                            ui.painter().text(
                                cell.center(),
                                Align2::CENTER_CENTER,
                                day.day().to_string(),
                                FontId::proportional(12.5),
                                if active {
                                    Color32::WHITE
                                } else if current {
                                    Color32::from_rgb(30, 41, 59)
                                } else {
                                    Color32::from_rgb(203, 213, 225)
                                },
                            );
                            if response.clicked() && (1..=9999).contains(&day.year()) {
                                pick = Some(day);
                            }
                            crate::visual_test::record(&format!("date.{id}.day.{index}"), cell);
                        }
                    }
                    let footer_y = origin.y + 263.5;
                    ui.painter().line_segment(
                        [
                            egui::pos2(origin.x, footer_y),
                            egui::pos2(origin.x + content_width, footer_y),
                        ],
                        Stroke::new(1.0, Color32::from_rgb(241, 245, 249)),
                    );
                    let clear_rect = Rect::from_min_size(
                        egui::pos2(origin.x, footer_y + 9.0),
                        egui::vec2(40.0, 18.0),
                    );
                    clear = crate::widgets::put(
                        ui,
                        clear_rect,
                        egui::Button::new(
                            egui::RichText::new("Xóa")
                                .size(12.5)
                                .color(Color32::from_rgb(100, 116, 139)),
                        )
                        .frame(false),
                    )
                    .clicked();
                    let today_rect = Rect::from_min_size(
                        egui::pos2(origin.x + content_width - 70.0, footer_y + 9.0),
                        egui::vec2(70.0, 18.0),
                    );
                    if crate::widgets::put(
                        ui,
                        today_rect,
                        egui::Button::new(
                            egui::RichText::new("Hôm nay")
                                .size(12.5)
                                .color(crate::theme::PRIMARY),
                        )
                        .frame(false),
                    )
                    .clicked()
                    {
                        pick = Some(today);
                    }
                } else {
                    for index in 0..12 {
                        let number = if state.mode == Mode::Month {
                            index + 1
                        } else {
                            state.year_page + index
                        };
                        let active = if state.mode == Mode::Month {
                            number == state.month as i32
                        } else {
                            number == state.year
                        };
                        let cell = Rect::from_min_size(
                            egui::pos2(
                                origin.x
                                    + (index % 3) as f32 * ((content_width - 16.0) / 3.0 + 8.0),
                                origin.y + 46.0 + (index / 3) as f32 * 40.0,
                            ),
                            egui::vec2((content_width - 16.0) / 3.0, 32.0),
                        );
                        let label = if state.mode == Mode::Month {
                            format!("Tháng {number}")
                        } else {
                            number.to_string()
                        };
                        let button = egui::Button::new(
                            egui::RichText::new(label).size(12.5).color(if active {
                                Color32::WHITE
                            } else {
                                Color32::from_rgb(30, 41, 59)
                            }),
                        )
                        .fill(if active {
                            crate::theme::PRIMARY
                        } else {
                            Color32::WHITE
                        })
                        .stroke(Stroke::new(
                            1.0,
                            if active {
                                crate::theme::PRIMARY
                            } else {
                                Color32::from_rgb(226, 232, 240)
                            },
                        ));
                        if crate::widgets::put(ui, cell, button).clicked()
                            && (1..=9999).contains(&number)
                        {
                            if state.mode == Mode::Month {
                                state.month = number as u32;
                                state.mode = Mode::Day;
                            } else {
                                state.year = number;
                                state.mode = Mode::Month;
                            }
                        }
                        crate::visual_test::record(&format!("date.{id}.choice.{index}"), cell);
                    }
                }
            });
        if let Some(day) = pick {
            *value = day.format("%Y-%m-%d").to_string();
            state.open = false;
            response.mark_changed();
        }
        if clear {
            value.clear();
            state.open = false;
            response.mark_changed();
        }
        if ctx.input(|i| {
            i.key_pressed(egui::Key::Escape)
                || i.raw_scroll_delta != Vec2::ZERO
                || (i.pointer.any_pressed()
                    && i.pointer
                        .interact_pos()
                        .is_some_and(|p| !popup_rect.contains(p) && !trigger.contains(p)))
        }) {
            state.open = false;
        }
        crate::visual_test::record(&format!("date.{id}.popup"), popup_rect);
    }
    ctx.data_mut(|data| data.insert_temp(key, state));
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn six_week_grid_is_contiguous_and_monday_first_in_leap_and_boundary_years() {
        for (year, month) in [(2024, 2), (2026, 10), (2026, 12), (2027, 1)] {
            let days = days_grid(year, month).unwrap();
            assert_eq!(days.len(), 42);
            assert_eq!(days[0].weekday().num_days_from_monday(), 0);
            for pair in days.windows(2) {
                assert_eq!(pair[1].signed_duration_since(pair[0]), Duration::days(1));
            }
        }
        assert!(
            days_grid(2024, 2)
                .unwrap()
                .contains(&NaiveDate::from_ymd_opt(2024, 2, 29).unwrap())
        );
        assert!(days_grid(2026, 13).is_none());
    }
    #[test]
    fn month_navigation_crosses_years_and_stays_in_the_api_date_range() {
        assert_eq!(shift_month(2026, 12, 1), (2027, 1));
        assert_eq!(shift_month(2026, 1, -1), (2025, 12));
        assert_eq!(shift_month(1, 1, -12), (1, 1));
        assert_eq!(shift_month(9999, 12, 12), (9999, 12));
    }
    #[test]
    fn popup_uses_legacy_flip_estimate_and_horizontal_gutter() {
        let screen = Rect::from_min_size(Pos2::ZERO, egui::vec2(390.0, 844.0));
        let trigger = Rect::from_min_size(egui::pos2(280.0, 700.0), egui::vec2(100.0, 32.0));
        assert_eq!(
            popup_position(trigger, screen, 280.0),
            Pos2::new(100.0, 386.0)
        );
    }
    #[test]
    fn selecting_a_calendar_day_updates_the_real_field_and_closes_the_popup() {
        let ctx = egui::Context::default();
        crate::native_text::setup_fonts(&ctx);
        let key = egui::Id::new(("legacy.date", "fixture.date"));
        ctx.data_mut(|data| {
            data.insert_temp(
                key,
                PickerState {
                    open: true,
                    year: 2026,
                    month: 10,
                    year_page: 2016,
                    mode: Mode::Day,
                },
            )
        });
        let screen = Rect::from_min_size(Pos2::ZERO, egui::vec2(800.0, 600.0));
        let mut value = "2026-10-01".to_owned();
        let mut trigger = Rect::NOTHING;
        for _ in 0..3 {
            let _ = ctx.run(
                egui::RawInput {
                    screen_rect: Some(screen),
                    ..Default::default()
                },
                |ctx| {
                    egui::CentralPanel::default().show(ctx, |ui| {
                        trigger = date_picker(ui, "fixture.date", &mut value).rect;
                    });
                },
            );
        }
        let popup = popup_position(trigger, screen, 280.0);
        let day = popup + egui::vec2(15.0 + 4.0 * 36.0 + 17.0, 13.0 + 70.5 + 3.0 * 31.0 + 14.0);
        for pressed in [true, false] {
            let _ = ctx.run(
                egui::RawInput {
                    screen_rect: Some(screen),
                    events: vec![
                        egui::Event::PointerMoved(day),
                        egui::Event::PointerButton {
                            pos: day,
                            button: egui::PointerButton::Primary,
                            pressed,
                            modifiers: Default::default(),
                        },
                    ],
                    ..Default::default()
                },
                |ctx| {
                    egui::CentralPanel::default().show(ctx, |ui| {
                        date_picker(ui, "fixture.date", &mut value);
                    });
                },
            );
        }
        assert_eq!(value, "2026-10-23");
        assert!(
            !ctx.data_mut(|data| data.get_temp::<PickerState>(key))
                .unwrap()
                .open
        );
    }

    #[test]
    fn modal_close_remains_clickable_while_calendar_is_open() {
        let ctx = egui::Context::default();
        crate::native_text::setup_fonts(&ctx);
        crate::native_text::setup_style(&ctx);
        let screen = Rect::from_min_size(Pos2::ZERO, egui::vec2(1440.0, 900.0));
        let mut value = "2026-10-23".to_owned();
        let key = egui::Id::new(("legacy.date", "modal.date"));
        ctx.data_mut(|data| {
            data.insert_temp(
                key,
                PickerState {
                    open: true,
                    year: 2026,
                    month: 10,
                    year_page: 2016,
                    mode: Mode::Year,
                },
            )
        });
        let mut close = false;
        let mut position = Pos2::ZERO;
        for step in 0..8 {
            let mut events = Vec::new();
            if (3..=4).contains(&step) || step >= 6 {
                let click = if step < 6 {
                    position + egui::vec2(-120.0, 100.0)
                } else {
                    position
                };
                events.push(egui::Event::PointerMoved(click));
                events.push(egui::Event::PointerButton {
                    pos: click,
                    button: egui::PointerButton::Primary,
                    pressed: step == 3 || step == 6,
                    modifiers: Default::default(),
                });
            }
            let _ = ctx.run(
                egui::RawInput {
                    screen_rect: Some(screen),
                    events,
                    ..Default::default()
                },
                |ctx| {
                    let (_, closed) = crate::widgets::modal(
                        ctx,
                        "date.modal.test",
                        "Chọn ngày",
                        640.0,
                        false,
                        |ui| {
                            date_picker(ui, "modal.date", &mut value);
                            ui.add_space(350.0);
                        },
                    );
                    close |= closed;
                    let rect = ctx
                        .memory(|m| m.area_rect(egui::Id::new(("date.modal.test", "dialog"))))
                        .unwrap();
                    position = egui::pos2(rect.right() - 2.0, rect.top() + 2.0);
                },
            );
        }
        assert!(close, "calendar must not swallow the modal close click");
    }
}
