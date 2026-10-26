//! Opt-in visual test instrumentation. No credentials, data injection or API mocks.
//! The default production build contains only the inlined no-op functions.

#[derive(Default, serde::Deserialize)]
pub struct Command {
    pub path: Option<String>,
    pub collapsed: Option<bool>,
    pub dark: Option<bool>,
}

#[cfg(feature = "visual-test")]
thread_local! {
    static RECTS: std::cell::RefCell<std::collections::BTreeMap<String, [f32; 4]>> = Default::default();
}

#[inline]
pub fn record(_name: &str, _rect: egui::Rect) {
    #[cfg(feature = "visual-test")]
    RECTS.with(|rects| {
        rects.borrow_mut().insert(
            _name.to_owned(),
            [_rect.left(), _rect.top(), _rect.width(), _rect.height()],
        );
    });
}

#[inline]
pub fn begin() {
    #[cfg(feature = "visual-test")]
    RECTS.with(|rects| rects.borrow_mut().clear());
}

/// Only the opt-in browser harness can supply the *installed* Windows fonts.
/// They are never embedded in the production build or checked into the repo.
#[cfg(all(feature = "visual-test", target_arch = "wasm32"))]
pub fn installed_font(file: &str) -> Option<Vec<u8>> {
    if !["segoeui.ttf", "seguisb.ttf", "segoeuib.ttf", "arial.ttf"].contains(&file) {
        return None;
    }
    let window = web_sys::window()?;
    let local = window.local_storage().ok()??;
    if local.get_item("kiyo.visual.enabled").ok()?? != "true" {
        return None;
    }
    let storage = if file == "arial.ttf" {
        window.session_storage().ok()??
    } else {
        local
    };
    let encoded = storage
        .get_item(&format!("kiyo.visual.font.{file}"))
        .ok()??;
    if encoded.len() > 2_000_000 {
        return None;
    }
    let binary = window.atob(&encoded).ok()?;
    Some(binary.chars().map(|c| c as u8).collect())
}

#[inline]
pub fn command() -> Option<Command> {
    #[cfg(all(feature = "visual-test", target_arch = "wasm32"))]
    {
        let storage = web_sys::window()?.local_storage().ok()??;
        if storage.get_item("kiyo.visual.enabled").ok()?? != "true" {
            return None;
        }
        let raw = storage.get_item("kiyo.visual.command").ok()??;
        let _ = storage.remove_item("kiyo.visual.command");
        return serde_json::from_str(&raw).ok();
    }
    #[cfg(not(all(feature = "visual-test", target_arch = "wasm32")))]
    None
}

#[inline]
pub fn finish(_ctx: &egui::Context, _route: &str, _dark: bool) {
    #[cfg(all(feature = "visual-test", target_arch = "wasm32"))]
    {
        let Some(storage) = web_sys::window().and_then(|w| w.local_storage().ok().flatten()) else {
            return;
        };
        if storage
            .get_item("kiyo.visual.enabled")
            .ok()
            .flatten()
            .as_deref()
            != Some("true")
        {
            return;
        }
        let screen = _ctx.screen_rect();
        let font = _ctx
            .data(|data| {
                data.get_temp::<crate::native_text::FontRuntimeInfo>(egui::Id::new(
                    "kiyo.font.runtime",
                ))
            })
            .map(|info| info.family)
            .unwrap_or(crate::native_text::UI_FONT);
        RECTS.with(|rects| {
            let value = serde_json::json!({
                "route":_route, "dark":_dark, "viewport":[screen.width(),screen.height()],
                "pixelsPerPoint":_ctx.pixels_per_point(), "font":font,
                "buttonFont":_ctx.style().text_styles.get(&egui::TextStyle::Button).map(|f|format!("{f:?}")),
                "buttonPadding":[_ctx.style().spacing.button_padding.x,_ctx.style().spacing.button_padding.y],
                "interactHeight":_ctx.style().spacing.interact_size.y,
                "rects":*rects.borrow(),
            });
            let _ = storage.set_item("kiyo.visual.snapshot", &value.to_string());
        });
        _ctx.request_repaint_after(std::time::Duration::from_millis(80));
    }
}
