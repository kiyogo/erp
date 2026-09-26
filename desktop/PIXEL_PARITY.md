# Desktop pixel-parity contract

The Tauri application has a separately coded frontend in `D:\DATA\source\apwdnt\app\frontend`. `D:\DATA\source\apwdnt\web` is its absolute reference, not a source dependency.

For every route, capture web and Tauri screenshots at 1440x900, 1280x800 and 390x844 for default, loading, empty, error, hover/focus, modal, validation and populated-data states. The visual-diff target is zero intentional pixels; exceptions require explicit approval.

Feature parity is tracked by route, role and API operation. A desktop feature is complete only when its independent implementation behaves like the web reference and has an API test.
