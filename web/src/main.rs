#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use kiyo_ui::{KiyoApp, native_text};

#[cfg(not(target_arch = "wasm32"))]
fn main() -> eframe::Result<()> {
    eframe::run_native(
        "KIYOVN Web launcher",
        eframe::NativeOptions::default(),
        Box::new(|cc| {
            native_text::setup_style(&cc.egui_ctx);
            Ok(Box::new(KiyoApp::default()))
        }),
    )
}

#[cfg(target_arch = "wasm32")]
fn main() {
    use eframe::wasm_bindgen::JsCast as _;

    let document = web_sys::window()
        .expect("browser window is unavailable")
        .document()
        .expect("browser document is unavailable");
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
                Box::new(|cc| {
                    native_text::setup_style(&cc.egui_ctx);
                    Ok(Box::new(KiyoApp::default()))
                }),
            )
            .await
            .expect("failed to start KIYO WebAssembly application");
    });
}
