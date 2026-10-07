//! Shared KIYO application UI.
//!
//! This crate is deliberately platform-neutral. The same `KiyoApp` is used by
//! the native desktop launcher and the WebAssembly launcher. Platform-specific
//! behavior belongs in the launchers or behind `cfg` blocks in the small
//! adapters below, never in duplicated screens.

pub mod api;
pub mod app;
pub mod models;
pub mod native_text;
pub mod views;

pub use app::KiyoApp;
