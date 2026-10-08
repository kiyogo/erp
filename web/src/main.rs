#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use kiyo_ui::{KiyoApp, native_text};

#[cfg(not(target_arch = "wasm32"))]
fn main() -> eframe::Result<()> {
    eframe::run_native(
        "KIYOVN Web launcher",
        eframe::NativeOptions::default(),
        Box::new(|cc| {
            native_text::setup_fonts(&cc.egui_ctx);
            native_text::setup_style(&cc.egui_ctx);
            Ok(Box::new(KiyoApp::default()))
        }),
    )
}

#[cfg(target_arch = "wasm32")]
fn main() {
    use eframe::wasm_bindgen::JsCast as _;
    use eframe::wasm_bindgen::JsValue;

    let window = web_sys::window().expect("browser window is unavailable");
    let path = window.location().pathname().unwrap_or_default();
    let activation_route = path.trim_end_matches('/') == "/activate-account";
    let activation_token = if activation_route {
        let query = window.location().search().unwrap_or_default();
        web_sys::UrlSearchParams::new_with_str(&query)
            .ok()
            .and_then(|parameters| parameters.get("token"))
    } else {
        None
    };
    let app = if activation_route {
        // Activation links contain a bearer secret. Remove both the query and
        // the one-shot activation path before mounting the canvas; a refresh
        // must not reopen an already-consumed activation flow.
        if let Ok(history) = window.history() {
            let _ = history.replace_state_with_url(&JsValue::NULL, "", Some("/"));
        }
        KiyoApp::with_activation_link(activation_token)
    } else {
        KiyoApp::default()
    };
    let document = window.document().expect("browser document is unavailable");
    let canvas = document
        .get_element_by_id("kiyo_canvas")
        .expect("kiyo_canvas is missing from index.html")
        .dyn_into::<web_sys::HtmlCanvasElement>()
        .expect("kiyo_canvas is not an HTML canvas");
    let runner = eframe::WebRunner::new();

    wasm_bindgen_futures::spawn_local(async move {
        let web_options = eframe::WebOptions::default();
        runner
            .start(
                canvas,
                web_options,
                Box::new(move |cc| {
                    native_text::setup_fonts(&cc.egui_ctx);
                    native_text::setup_style(&cc.egui_ctx);
                    Ok(Box::new(app))
                }),
            )
            .await
            .expect("failed to start KIYO WebAssembly application");
    });
}
