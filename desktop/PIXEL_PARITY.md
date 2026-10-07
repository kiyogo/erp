# Desktop pixel-parity contract

The native and WebAssembly launchers use the same `crates/kiyo-ui` source.
There is no separate Tauri or React frontend in the active source tree.

For every route, capture native and WebAssembly screenshots at 1440x900,
1280x800 and 390x844 for default, loading, empty, error, hover/focus, modal,
validation and populated-data states. The visual-diff target is zero
intentional pixels; exceptions require explicit approval.

Feature parity is tracked by route, role and API operation. A desktop feature is complete only when its independent implementation behaves like the web reference and has an API test.
