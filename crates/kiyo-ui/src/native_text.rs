use eframe::egui;
use egui::{Color32, FontData, FontDefinitions, FontFamily, FontId, TextStyle};

pub const UI_FONT: &str = "Noto Sans";
#[allow(dead_code)]
pub const TEXT_RENDERER: &str = "egui/epaint font atlas";
#[allow(dead_code)]
pub const GRAPHICS_BACKEND: &str = "eframe glow OpenGL";

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct FontRuntimeInfo {
    pub family: &'static str,
    pub fallback: &'static str,
    pub icon_family: &'static str,
    pub used_variable: bool,
    pub used_icon_font: bool,
}

#[cfg(target_os = "windows")]
pub fn enable_per_monitor_dpi_awareness() {
    use windows_sys::Win32::UI::HiDpi::{
        DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, SetProcessDpiAwarenessContext,
    };

    unsafe {
        let ok = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) != 0;
        #[cfg(debug_assertions)]
        {
            eprintln!(
                "[DPI] SetProcessDpiAwarenessContext(PER_MONITOR_AWARE_V2)={}",
                if ok { "ok" } else { "failed_or_already_set" }
            );
        }
        #[cfg(not(debug_assertions))]
        {
            let _ = ok;
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn enable_per_monitor_dpi_awareness() {}

pub fn setup_fonts(ctx: &egui::Context) -> FontRuntimeInfo {
    let mut fonts = FontDefinitions::default();
    fonts.font_data.insert(
        "noto_sans".to_owned(),
        FontData::from_static(include_bytes!("../assets/fonts/NotoSans-Variable.ttf")),
    );
    for family in [FontFamily::Proportional, FontFamily::Monospace] {
        fonts
            .families
            .entry(family)
            .or_default()
            .insert(0, "noto_sans".to_owned());
    }
    let icon_family = fonts
        .families
        .get(&FontFamily::Proportional)
        .cloned()
        .unwrap_or_default();
    fonts
        .families
        .insert(FontFamily::Name("kiyo_icons".into()), icon_family);

    ctx.set_fonts(fonts);

    let info = FontRuntimeInfo {
        family: UI_FONT,
        fallback: "egui default fonts",
        icon_family: "Unicode symbols",
        used_variable: true,
        used_icon_font: false,
    };

    #[cfg(debug_assertions)]
    eprintln!(
        "[Font] family={} fallback={} variable={} icon_family={} icon_font={} renderer={} backend={} antialias=grayscale_font_atlas",
        info.family,
        info.fallback,
        info.used_variable,
        info.icon_family,
        info.used_icon_font,
        TEXT_RENDERER,
        GRAPHICS_BACKEND
    );

    info
}

pub fn setup_style(ctx: &egui::Context) {
    let mut style = (*ctx.style()).clone();
    style.text_styles = [
        (
            TextStyle::Small,
            FontId::new(12.0, FontFamily::Proportional),
        ),
        (TextStyle::Body, FontId::new(13.5, FontFamily::Proportional)),
        (
            TextStyle::Button,
            FontId::new(13.0, FontFamily::Proportional),
        ),
        (
            TextStyle::Heading,
            FontId::new(18.5, FontFamily::Proportional),
        ),
        (
            TextStyle::Monospace,
            FontId::new(12.5, FontFamily::Monospace),
        ),
    ]
    .into();
    style.spacing.button_padding = egui::Vec2::new(10.0, 6.0);
    style.spacing.item_spacing = egui::Vec2::new(8.0, 6.0);
    ctx.set_style(style);
}

pub fn apply_visuals(ctx: &egui::Context, dark: bool) {
    if dark {
        let mut visuals = egui::Visuals::dark();
        visuals.widgets.noninteractive.fg_stroke.color = Color32::from_rgb(226, 232, 240);
        visuals.widgets.inactive.fg_stroke.color = Color32::from_rgb(226, 232, 240);
        visuals.widgets.hovered.fg_stroke.color = Color32::from_rgb(248, 250, 252);
        visuals.widgets.active.fg_stroke.color = Color32::from_rgb(255, 255, 255);
        ctx.set_visuals(visuals);
    } else {
        let mut visuals = egui::Visuals::light();
        visuals.widgets.noninteractive.fg_stroke.color = Color32::from_rgb(51, 65, 85);
        visuals.widgets.inactive.fg_stroke.color = Color32::from_rgb(51, 65, 85);
        visuals.widgets.hovered.fg_stroke.color = Color32::from_rgb(30, 41, 59);
        visuals.widgets.active.fg_stroke.color = Color32::from_rgb(30, 41, 59);
        ctx.set_visuals(visuals);
    }
}

pub fn icon_text(symbol: &'static str, color: Color32) -> egui::RichText {
    egui::RichText::new(symbol)
        .size(13.0)
        .family(FontFamily::Name("kiyo_icons".into()))
        .color(color)
}

#[cfg(all(debug_assertions, not(target_arch = "wasm32")))]
pub fn log_dpi_if_changed(last_pixels_per_point: &mut Option<f32>, ctx: &egui::Context) {
    let pixels_per_point = ctx.pixels_per_point();
    let changed = last_pixels_per_point
        .map(|last| (last - pixels_per_point).abs() > 0.001)
        .unwrap_or(true);

    if changed {
        let native = ctx.native_pixels_per_point().unwrap_or(pixels_per_point);
        let dpi = native * 96.0;
        eprintln!(
            "[DPI] dpi={:.0} native_pixels_per_point={:.3} zoom_factor={:.3} effective_pixels_per_point={:.3} renderer={} backend={}",
            dpi,
            native,
            ctx.zoom_factor(),
            pixels_per_point,
            TEXT_RENDERER,
            GRAPHICS_BACKEND
        );
        *last_pixels_per_point = Some(pixels_per_point);
    }
}

#[cfg(any(not(debug_assertions), target_arch = "wasm32"))]
pub fn log_dpi_if_changed(_last_pixels_per_point: &mut Option<f32>, _ctx: &egui::Context) {}
