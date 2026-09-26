# Kiyo Admin desktop application

This is the Windows desktop application. The native shell is Rust/Tauri and the desktop frontend is independently implemented in `frontend`.

`D:\DATA\source\apwdnt\web` remains the absolute visual and feature reference. The desktop frontend must not import, symlink, copy, or alias code from `web`; its parity is verified by screenshots and feature tests.

Run `npm install` then `npm run dev` in this directory for desktop development, or `npm run build` to create the Windows installer. API mode/config is delivered by the Rust shell without storing passwords in the frontend.
