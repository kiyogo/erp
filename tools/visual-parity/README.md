# Legacy → egui visual comparison

The reference is `legacy/web`, the application is `ui` shared by `desktop` and `web`, and the API remains `server`. Legacy source files are read only. Artifacts go to ignored `build/visual-parity/`; no screenshots are promoted to reference automatically.

`node tools/visual-parity/inventory.mjs` reads repository sources and creates a candidate route matrix, CSS variables/media queries, shared component inventory and SHA-256 source manifest. Prefixes, redirects and unresolved mappings are explicitly marked; candidate URL counts are not page completion counts.

Build the browser app with the opt-in diagnostics feature:

```powershell
$env:NO_COLOR='true'
node tools/visual-parity/build.mjs
```

The build wrapper waits for Trunk to fully finish, rejects source changes during compilation and records source/bundle hashes in `visual-build.json`. Capture rejects stale manifested bundles and refuses to overwrite an existing phase summary. Old reports without a build manifest are explicitly unverified. Alternatively run Trunk from `web/` with `--dist ../build/visual-parity/web`, but that does not create a provenance manifest. Normal builds omit `visual-test`. Diagnostics contain only route and element rectangles; credentials still pass through the real login UI. Route commands select existing role-visible navigation entries after authentication and call the existing render/API paths.

Run the legacy static preview on 3411, a separate legacy API with disposable storage on 3413, and the Rust server with disposable storage and `KIYO_STATIC_DIR=build/visual-parity/web` on 3412. Do not point the harness at production data. The legacy preview's compiled `localhost:3003` requests are forwarded to the separate real API by Playwright; responses are never mocked.

Use an installed `node_modules` containing `playwright` and `sharp`, supplied through `KIYO_VISUAL_NODE_MODULES`. `PARITY_BROWSER` optionally supplies the browser executable. On Windows the installed Edge/Chrome is discovered, without installing a browser.

```powershell
$env:PARITY_EMAIL='your-local-fixture-email'
$env:PARITY_PASSWORD='your-local-fixture-password'
node tools/visual-parity/capture.mjs --phase=before --routes=/login,/admin/dashboard,/admin/hr/employees --viewports=1440x900,390x844
node --test tools/visual-parity/capture.test.mjs tools/visual-parity/compare.test.mjs tools/visual-parity/inventory.test.mjs tools/visual-parity/redact.test.mjs
```

Omit `--routes` to capture the source-resolved app/reference route candidates. The default viewport set is 1440×900, 768×1024 and 390×844; pass an explicit matrix to include every legacy breakpoint and ±1px boundaries. Employee routes require a real activated USER fixture; an ADMIN session is never relabeled as an employee.

`run.mjs` starts the real reference API, Rust API and legacy static preview against fresh disposable storage, provisions ADMIN and USER accounts through real APIs, and stops only its own processes. Use `PARITY_SERVER` for the built server executable and `--base-port=3451` (three consecutive free ports). `--employee` captures the USER routes. Its USER profile has a phone supplied at creation, so this is the populated-profile state, not an onboarding acceptance test; that distinction is recorded in `environment.json`. `--fixture-check` only checks real provisioning/authentication without capture. The runner retains databases and logs for diagnosis and does not print generated credentials.

Opt-in `--cash-fixture` (ADMIN only) provisions one real receipt on each disposable API. With `--states` and a desktop viewport, the cash route opens details, opens/dismisses cancellation, reads back the unchanged receipt, then explicitly confirms cancellation through both actual UIs and checks both API acknowledgements/readbacks. `cash-mutation-evidence.json` stores statuses, not authentication headers. This test never targets the interactive database; it is a destructive state transition only inside that disposable fixture. Later viewport cases see the acknowledged cancelled state. Pixel mismatches remain FAIL even when the state transition succeeds.

Every case writes reference, actual, difference and overlay PNGs, plus DOM computed styles, egui geometry, browser configuration and per-case metrics. Exact comparison examines every RGBA channel with zero tolerance. A changed antialias pixel is a mismatch. Different data, unconfigured features and rendering differences remain visible in the full-image failure; no masking, resizing or favorable threshold is used. Geometry reports missing measurements separately.

The live error collector is drained after settle/screenshot, so late HTTP/console errors remain attached to the case that emitted them. Its regression test uses the actual capture function with in-memory browser/filesystem stubs; it does not count as a product E2E check. A legacy error-boundary screen remains a failed comparison, not a target to reproduce. Explicit route aliases that do not exist in the native navigation can time out; preserve that failure and rerun the real menu entry rather than relabeling the timeout as success.

The viewport capture is not a full-page/scroll interaction acceptance test. Current reports must list those states separately as pending until captured. Tests passing for the comparison algorithm do not mean the product UI matches the reference.

`--states` adds source-backed flyout/account/notification panels, create dialogs, day/month/year calendar panels, file menus and password focus where supported by the selected routes. It does not submit create forms or fabricate records. `--fixed-time=2026-10-23T03:00:00Z` fixes the browser Date on both sides without pausing timers or changing server clocks. A 650ms settle interval lets the legacy 500ms route-loading indicator finish; animation acceptance remains a separate pending test.

On Windows, optional `--native-fonts` reads the installed Segoe UI regular/semibold/bold and Arial files from the OS for an isolated visual-test browser context. The report records their hashes and sizes. Files are not copied into the repository, distributable assets or normal app; do not redistribute them. The capture fails if the fonts cannot be loaded. This separates a known browser-font mismatch from layout defects, but it is still a WASM canvas capture, **not** a native-window, native-DPI or native-accessibility acceptance test. Compare captures using the same font environment and keep this flag visible in evidence.

After building the server (default `target/debug/kiyo-server.exe`, overridable with `PARITY_SERVER`), run `node --test tools/visual-parity/functional.test.mjs` for real HTTP checks. This runner requires free loopback port 3424, creates a fresh random-credential database under `build/visual-parity/runtime/`, and stops only its own API process. It never uses the interactive 3412 database. Disposable databases are retained for diagnosis. The cash-transactions SQL parameter mismatch was fixed on 25 October; the updated server must be used to test that fix. A passing HTTP suite does not imply pixel parity or complete UI acceptance.
