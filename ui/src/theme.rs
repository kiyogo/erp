//! Presentation values extracted from legacy/web/src/{index.css,custom-ui/theme.css}.
use egui::{Color32, FontFamily, FontId, Stroke, TextStyle, Vec2};

pub const HEADER_HEIGHT: f32 = 48.0;
pub const SIDEBAR_WIDTH: f32 = 220.0;
pub const COLLAPSED_SIDEBAR_WIDTH: f32 = 80.0;
pub const PRIMARY: Color32 = Color32::from_rgb(0, 150, 136);
pub const PRIMARY_HOVER: Color32 = Color32::from_rgb(38, 166, 154);
pub const PRIMARY_ACTIVE: Color32 = Color32::from_rgb(0, 121, 107);

#[derive(Clone, Copy)]
pub struct Palette {
    pub background: Color32,
    pub sidebar: Color32,
    pub surface: Color32,
    pub text: Color32,
    pub muted: Color32,
    pub border: Color32,
    pub hovered: Color32,
    pub selected: Color32,
    pub selected_text: Color32,
    pub table_header: Color32,
}

pub fn palette(dark: bool) -> Palette {
    if dark {
        Palette {
            background: Color32::from_rgb(11, 15, 25),
            sidebar: Color32::from_rgb(17, 24, 39),
            surface: Color32::from_rgb(17, 24, 39),
            text: Color32::from_rgb(249, 250, 251),
            muted: Color32::from_rgb(156, 163, 175),
            border: Color32::from_rgb(31, 41, 55),
            hovered: Color32::from_rgb(31, 41, 55),
            selected: Color32::from_rgb(19, 78, 74),
            selected_text: Color32::from_rgb(94, 234, 212),
            table_header: Color32::from_rgb(31, 41, 55),
        }
    } else {
        Palette {
            background: Color32::from_rgb(253, 253, 253),
            sidebar: Color32::from_rgb(245, 245, 245),
            surface: Color32::WHITE,
            text: Color32::from_rgb(33, 33, 33),
            muted: Color32::from_rgb(117, 117, 117),
            border: Color32::from_rgb(224, 224, 224),
            hovered: Color32::from_rgb(234, 234, 234),
            selected: Color32::from_rgb(235, 243, 251),
            selected_text: PRIMARY,
            table_header: Color32::from_rgb(245, 245, 245),
        }
    }
}

pub fn setup_style(ctx: &egui::Context) {
    // set_visuals switches the active theme; both styles must keep the same metrics.
    ctx.all_styles_mut(|style| {
        style.text_styles = [
            (
                TextStyle::Small,
                FontId::new(12.0, FontFamily::Proportional),
            ),
            (TextStyle::Body, FontId::new(14.0, FontFamily::Proportional)),
            (
                TextStyle::Button,
                FontId::new(14.0, FontFamily::Name("legacy-controls".into())),
            ),
            (
                TextStyle::Heading,
                FontId::new(18.0, FontFamily::Proportional),
            ),
            (
                TextStyle::Monospace,
                FontId::new(12.5, FontFamily::Monospace),
            ),
        ]
        .into();
        style.spacing.button_padding = Vec2::new(15.0, 4.0);
        style.spacing.item_spacing = Vec2::new(8.0, 6.0);
        style.spacing.interact_size.y = 32.0;
        style.spacing.combo_width = 200.0;
        style.spacing.icon_width = 16.0;
        style.spacing.icon_spacing = 8.0;
        style.spacing.menu_margin = egui::Margin::same(4.0);
        style.spacing.scroll.bar_width = 5.0;
        style.spacing.scroll.floating_width = 5.0;
        style.spacing.scroll.bar_inner_margin = 0.0;
        style.spacing.scroll.bar_outer_margin = 0.0;
    });
}

pub fn apply_visuals(ctx: &egui::Context, dark: bool) {
    let p = palette(dark);
    let mut v = if dark {
        egui::Visuals::dark()
    } else {
        egui::Visuals::light()
    };
    v.panel_fill = p.background;
    v.window_fill = p.surface;
    v.extreme_bg_color = p.surface;
    v.faint_bg_color = p.table_header;
    v.code_bg_color = p.sidebar;
    v.hyperlink_color = PRIMARY;
    v.window_rounding = 8.0.into();
    v.menu_rounding = 6.0.into();
    v.window_stroke = Stroke::new(1.0, p.border);
    v.window_shadow = egui::epaint::Shadow {
        offset: Vec2::new(0.0, 4.0),
        blur: 12.0,
        spread: 0.0,
        color: Color32::from_black_alpha(20),
    };
    v.popup_shadow = v.window_shadow;
    v.selection.bg_fill = if dark {
        p.selected
    } else {
        Color32::from_rgb(224, 242, 241)
    };
    v.selection.stroke = Stroke::new(
        1.0,
        if dark {
            p.selected_text
        } else {
            PRIMARY_ACTIVE
        },
    );
    for w in [
        &mut v.widgets.noninteractive,
        &mut v.widgets.inactive,
        &mut v.widgets.hovered,
        &mut v.widgets.active,
        &mut v.widgets.open,
    ] {
        w.rounding = 6.0.into();
        w.expansion = 0.0;
        w.bg_fill = p.surface;
        w.weak_bg_fill = p.surface;
        w.bg_stroke = Stroke::new(
            1.0,
            if dark {
                p.border
            } else {
                Color32::from_rgb(217, 217, 217)
            },
        );
        w.fg_stroke = Stroke::new(1.0, p.text);
    }
    v.widgets.hovered.bg_stroke.color = PRIMARY_HOVER;
    v.widgets.hovered.fg_stroke.color = PRIMARY_HOVER;
    v.widgets.active.bg_stroke.color = PRIMARY_ACTIVE;
    v.widgets.active.fg_stroke.color = PRIMARY_ACTIVE;
    ctx.set_visuals(v);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn theme_switches_preserve_control_fonts_and_spacing() {
        let ctx = egui::Context::default();
        setup_style(&ctx);
        for dark in [false, true, false] {
            apply_visuals(&ctx, dark);
            let style = ctx.style();
            assert_eq!(
                style.text_styles[&TextStyle::Button],
                FontId::new(14.0, FontFamily::Name("legacy-controls".into()))
            );
            assert_eq!(style.spacing.button_padding, Vec2::new(15.0, 4.0));
            assert_eq!(style.spacing.interact_size.y, 32.0);
            assert_eq!(style.visuals.dark_mode, dark);
        }
    }
}
