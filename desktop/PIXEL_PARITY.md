# Desktop pixel-parity contract

The native and WebAssembly launchers use the same `ui` source.
There is no separate Tauri or React frontend in the active source tree.

For every applicable route, capture native screenshots at 1440x900 and
1280x800, and browser screenshots at 1440x900, 1280x800 and 390x844 for
default, loading, empty, error, hover/focus, modal, validation and
populated-data states. Desktop has a wider minimum window size and does not
need a 390 px screenshot. Record purposeful visual differences alongside
behavioral parity; no screenshots of the migrated slices have been reviewed yet.

Feature parity is tracked by route, role and API operation. A desktop feature is complete only when its independent implementation behaves like the web reference and has an API test.
