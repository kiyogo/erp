use eframe::egui;
use egui::{Color32, FontData, FontDefinitions, FontFamily};

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
    egui_extras::install_image_loaders(ctx);
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
    // Legacy uses installed Segoe UI for body text and Arial for HTML controls on
    // Windows. Read the user's installed fonts; do not redistribute OS font files.
    #[allow(unused_mut)]
    let mut family = UI_FONT;
    #[allow(unused_mut)]
    let mut used_variable = true;
    #[allow(unused_mut)]
    let mut controls = fonts.families[&FontFamily::Proportional].clone();
    #[cfg(target_os = "windows")]
    {
        let font_dir = std::path::PathBuf::from(
            std::env::var_os("WINDIR").unwrap_or_else(|| "C:\\Windows".into()),
        )
        .join("Fonts");
        if let Ok(bytes) = std::fs::read(font_dir.join("segoeui.ttf")) {
            fonts
                .font_data
                .insert("legacy-segoe-ui".to_owned(), FontData::from_owned(bytes));
            fonts
                .families
                .get_mut(&FontFamily::Proportional)
                .unwrap()
                .insert(0, "legacy-segoe-ui".to_owned());
            family = "Segoe UI";
            used_variable = false;
        }
        if let Ok(bytes) = std::fs::read(font_dir.join("arial.ttf")) {
            fonts
                .font_data
                .insert("legacy-arial".to_owned(), FontData::from_owned(bytes));
            controls.insert(0, "legacy-arial".to_owned());
        }
    }
    fonts
        .families
        .insert(FontFamily::Name("legacy-controls".into()), controls);
    for (name, file) in [
        ("legacy-semibold", "seguisb.ttf"),
        ("legacy-bold", "segoeuib.ttf"),
    ] {
        #[allow(unused_mut)]
        let mut faces = fonts.families[&FontFamily::Proportional].clone();
        #[cfg(target_os = "windows")]
        {
            let font_dir = std::path::PathBuf::from(
                std::env::var_os("WINDIR").unwrap_or_else(|| "C:\\Windows".into()),
            )
            .join("Fonts");
            if let Ok(bytes) = std::fs::read(font_dir.join(file)) {
                fonts
                    .font_data
                    .insert(name.to_owned(), FontData::from_owned(bytes));
                faces.insert(0, name.to_owned());
            }
        }
        #[cfg(not(target_os = "windows"))]
        let _ = file;
        fonts.families.insert(FontFamily::Name(name.into()), faces);
    }
    let icon_family = fonts
        .families
        .get(&FontFamily::Proportional)
        .cloned()
        .unwrap_or_default();
    fonts
        .families
        .insert(FontFamily::Name("kiyo_icons".into()), icon_family);

    #[cfg(all(feature = "visual-test", target_arch = "wasm32"))]
    for (name, file, target) in [
        ("legacy-segoe-ui", "segoeui.ttf", FontFamily::Proportional),
        (
            "legacy-arial",
            "arial.ttf",
            FontFamily::Name("legacy-controls".into()),
        ),
        (
            "legacy-semibold",
            "seguisb.ttf",
            FontFamily::Name("legacy-semibold".into()),
        ),
        (
            "legacy-bold",
            "segoeuib.ttf",
            FontFamily::Name("legacy-bold".into()),
        ),
    ] {
        if let Some(bytes) = crate::visual_test::installed_font(file) {
            fonts
                .font_data
                .insert(name.to_owned(), FontData::from_owned(bytes));
            fonts
                .families
                .entry(target)
                .or_default()
                .insert(0, name.to_owned());
            if file == "segoeui.ttf" {
                family = "Segoe UI";
                used_variable = false;
            }
        }
    }
    ctx.set_fonts(fonts);

    let info = FontRuntimeInfo {
        family,
        fallback: "egui default fonts",
        icon_family: "Unicode symbols",
        used_variable,
        used_icon_font: false,
    };
    ctx.data_mut(|data| data.insert_temp(egui::Id::new("kiyo.font.runtime"), info.clone()));

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

pub fn weighted_font(ctx: &egui::Context, size: f32, bold: bool) -> egui::FontId {
    let installed = ctx.data(|data| {
        data.get_temp::<FontRuntimeInfo>(egui::Id::new("kiyo.font.runtime"))
            .is_some()
    });
    egui::FontId::new(
        size,
        if installed {
            FontFamily::Name(
                if bold {
                    "legacy-bold"
                } else {
                    "legacy-semibold"
                }
                .into(),
            )
        } else {
            FontFamily::Proportional
        },
    )
}

pub fn setup_style(ctx: &egui::Context) {
    crate::theme::setup_style(ctx);
}

pub fn apply_visuals(ctx: &egui::Context, dark: bool) {
    crate::theme::apply_visuals(ctx, dark);
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
