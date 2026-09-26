#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod app;
mod models;
mod native_text;
mod views;

use app::KiyoApp;
use eframe::egui;

fn main() -> eframe::Result<()> {
    native_text::enable_per_monitor_dpi_awareness();

    let native_options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1440.0, 900.0])
            .with_min_inner_size([1024.0, 700.0])
            .with_title("KIYOVN Enterprise v2.0 - Native Rust Desktop"),
        ..Default::default()
    };

    eframe::run_native(
        "vn.kiyo.admin.native",
        native_options,
        Box::new(|cc| {
            native_text::setup_fonts(&cc.egui_ctx);
            native_text::setup_style(&cc.egui_ctx);

            Ok(Box::new(KiyoApp::default()))
        }),
    )
}
