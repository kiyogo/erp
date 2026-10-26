# BẰNG CHỨNG KIỂM THỬ VÀ NHẬT KÝ THỰC THI (TEST EVIDENCE)

Tài liệu này ghi lại toàn bộ các câu lệnh thực thi, mã thoát (Exit Code), thời gian chạy và nhật ký chi tiết được thực hiện trực tiếp trên môi trường kiểm toán tại máy trạm.

---

## I. TỔNG HỢP KẾT QUẢ THỰC THI

| Lệnh thực thi | Thư mục làm việc | Mã thoát | Kết quả | Thời gian | Bằng chứng kiểm chứng |
|---|---|:---:|---|:---:|---|
| `npm test` | `legacy/api` | **0** | **69 passed, 0 failed** | 6.95s | [legacy/api/tests](file:///e:/DATA/source/apwdnt/legacy/api/tests) (69 ca kiểm thử API & CSDL) |
| `npm run test:postgres` | `legacy/api` | **0** | **12 passed, 0 failed** | 1.22s | `{"databaseEngine":"PostgreSQL","checksPassed":12}` |
| `npm test` | `legacy/web` | **0** | **33 passed, 0 failed** | 2.41s | [legacy/web/tests](file:///e:/DATA/source/apwdnt/legacy/web/tests) (33 ca kiểm thử Frontend & Domain) |
| `npm run typecheck` | `legacy/web` | **0** | **0 errors (TypeScript sạch)** | 14.8s | `tsc --noEmit` hoàn tất không lỗi cú pháp hoặc kiểu |
| `npm run build` | `legacy/web` | **0** | **Build production thành công** | 25.18s | Vite 8: 5,202 modules transformed, `dist/index.html` (1.03 kB) |
| `node --check *.mjs` | `legacy/api` | **0** | **7 tệp JS cú pháp hợp lệ** | 0.85s | `index.mjs`, `db.mjs`, `crypto.mjs`, `logger.mjs`, `serializers.mjs`, `backups.mjs`, `document-files.mjs` |
| `Puppeteer Browser Routes` | Production Build | **0** | **246/246 routes Pass, 0 crash** | 142s | [outputs/legacy-progress-2026-10-26/browser-production.json](file:///e:/DATA/source/apwdnt/outputs/legacy-progress-2026-10-26/browser-production.json) |

**Tổng số ca kiểm thử tự động thực sự chạy thành công:** **114/114 ca kiểm thử đạt (100% Pass, 0 Fail, 0 Skip)**.

---

## II. CHI TIẾT KẾT QUẢ KIỂM THỬ API & BACKEND (`legacy/api`)

```text
> kiyodn-api@1.0.0 test
> node --test tests/*.test.mjs

✔ anonymous access is rejected (10.3508ms)
✔ legacy attendance mirrors migrate without removing source records (15.7318ms)
✔ collections support create, read, patch, replacement, delete and concurrent scopes (590.1544ms)
✔ task checklist is persisted before response, then task can be deleted (74.6367ms)
✔ canvas documents can be created simultaneously (147.026ms)
✔ budget API validates amounts and recomputes balances instead of trusting the browser (69.7174ms)
✔ canvas operation retries are idempotent and snapshots can be updated (149.3717ms)
✔ recruitment persists pipeline, rejects duplicate email and invalid transitions (280.5704ms)
✔ employee leave is visible to admins and approval cannot be forged or overwritten (287.1223ms)
✔ overtime hours and compensation derive from validated values (67.8664ms)
✔ shift approval swaps both assignments atomically (257.5776ms)
✔ check-in uses server identity and timestamps and rejects duplicate events (79.5201ms)
✔ employment history persists real employee identity and authoritative actors (76.877ms)
✔ contracts create, update and delete against the authoritative API (174.7822ms)
✔ Google settings persist on the server without a client secret and prevent password lockout (120.2433ms)
✔ logins issue unique persistent sessions with actual IP, agent, expiry and current-session marker (244.9228ms)
✔ successful API activity updates the persisted last-active timestamp (185.4416ms)
✔ session revoke immediately rejects the chosen token and keeps other sessions valid (132.329ms)
✔ logout revokes the current server session instead of only clearing browser data (144.7514ms)
✔ legacy JWTs remain compatible, are registered once under concurrent access, and can be revoked (88.5878ms)
✔ activation tokens and access tokens without a stored session cannot authorize API calls (5.6002ms)
✔ only administrators can inspect or revoke sessions and generic writes cannot resurrect tokens (143.0214ms)
✔ unverified Google payloads, tampered signatures and invalid claims cannot log in (33.2906ms)
✔ verified Google identity creates a real session and preserves signup without granting admin (614.9849ms)
✔ Google-only login requires a verified admin session and can safely return to password mode (280.6932ms)
✔ revocation survives API restart and configured Google Workspace domain is enforced (664.9557ms)
✔ an empty backup catalog has no fictional snapshots and exposes actual engine capabilities (12.0017ms)
✔ full backup contains a real consistent SQLite image, uploaded bytes and a verifiable manifest (218.4132ms)
✔ database-only and storage-only scopes contain exactly their intended physical data (144.3335ms)
✔ archive tampering is detected and download refuses mismatched bytes (110.4179ms)
✔ missing archives remain visible as missing and path traversal cannot access arbitrary server files (96.1125ms)
✔ invalid or failed snapshots never leave a successful catalog entry or partial archive (6.2808ms)
✔ PostgreSQL without a configured dump mechanism reports database backup unavailable but retains file backup (36.2555ms)
✔ PostgreSQL conversion casts stored JSON text and keeps literal question marks (2.6665ms)
✔ simultaneous transactions commit independently and support nested helpers (578.2301ms)
✔ rollback excludes unrelated writes and uncommitted reads (39.8799ms)
✔ archive accepts records without scans, allocates unique book numbers and rejects invalid input (281.1365ms)
✔ archive persists the exact original scan bytes and derives file metadata without asserting signature verification (225.8424ms)
✔ archive writes require an authenticated administrator (181.6774ms)
✔ generated DOCX is a deterministic valid ZIP with the required OpenXML package relationships (9.6288ms)
✔ DOCX preserves Unicode, leading spaces, paragraphs, tabs and explicit page breaks while escaping text (1.3568ms)
✔ DOCX accepts empty text, replaces forbidden XML characters and refuses non-text inputs (4.3854ms)
✔ ZIP stores full long document lengths and complete final paragraphs beyond 16-bit sizes (237.7822ms)
✔ all generated package XML parses in the existing browser XML parser with exact document content (1948.0843ms)
✔ enterprise register persists metadata and exact original / Word files without fabricated signature claims (285.7978ms)
✔ user administration preserves profile fields, paginates and retains an active administrator (414.4988ms)
✔ admin backup endpoints produce a physical ZIP and refuse forged generic snapshots or unsupported restore (352.1193ms)
✔ only authenticated administrators may read or record transfers (190.5956ms)
✔ invalid amounts, accounts, dates and overdrafts leave the ledger unchanged (167.9696ms)
✔ a transfer records balanced legs, actual fee, real actor and audit; retries do not duplicate it (129.5762ms)
✔ failure on the credit leg rolls back the debit, metadata and audit (149.8536ms)
✔ concurrent transfers cannot spend the same source balance twice (123.7588ms)
✔ simultaneous retries of the same request create one transfer (107.7662ms)
✔ canceling a transfer restores both balances and fee atomically and cannot cancel one leg (145.4034ms)
✔ canceling after destination funds are spent is rejected without partial changes (236.385ms)
✔ bank to cash and cash to bank entries use the existing petty cash ledger (154.4795ms)
✔ historical transfers stay readable; generic mutation cannot forge or erase linked entries (41.5923ms)
✔ onboarding persists real confirmations and completion and rejects forged progress, signature and actor (340.8235ms)
✔ recruitment persists jobs, actual CV bytes and candidate stages; rejects invalid writes (405.0152ms)
✔ rewards require a real recipient and valid nonnegative amounts while preserving zero-value recognition (70.25ms)
✔ rewards start pending, require approval before award and derive approval/presenter identity from the authenticated actor (117.3755ms)
✔ pending reward content is editable, approved financial content remains unchanged, and USER access is forbidden (215.9638ms)
✔ approved reward identity stays frozen after employee rename and approved/awarded records cannot be erased (265.1982ms)

ℹ tests 69 | suites 0 | pass 69 | fail 0 | cancelled 0 | skipped 0 | todo 0 | duration_ms 6955.2315
```

---

## III. CHI TIẾT KẾT QUẢ KIỂM THỬ FRONTEND (`legacy/web`)

```text
> kiyodn-web@0.1.0 test
> node --experimental-strip-types --test tests/*.test.mjs src/modules/attendance/attendanceRules.test.mts

✔ leave requests reject impossible dates, backwards dates and excess/invalid day counts (5.1841ms)
✔ overnight shifts and OT use elapsed clock time without accepting impossible clock values (2.0712ms)
✔ zero allowances remain zero and empty/NaN/negative amounts are never replaced with fabricated defaults (0.4062ms)
✔ leave funds support zero entitlement and reject balances that hide excessive usage (1.042ms)
✔ timesheet calendar and employee cells never invent attendance or credit OT as regular work (2.1814ms)
✔ backup UI starts empty, uses physical backup API and never fabricates successful creation, restore or download (121.5004ms)
✔ user roles, activation and MFA reflect server facts, with independent pending/locked filters (13.4302ms)
✔ users load all pages, persist CRUD before success, reset actual passwords and export current filter (46.5653ms)
✔ archive form preserves uploaded scans after record errors, downloads original bytes, exports real data and persists processing (99.3412ms)
✔ editor save awaits remote persistence before success and prevents concurrent repeated writes (10.5466ms)
✔ editor reports rejected persistence without success, preserves draft and unlocks a successful retry (3.3737ms)
✔ editor stops remote save after a rejected local draft write and always releases the lock (0.5957ms)
✔ actual draft storage waits for IndexedDB commit and propagates transaction abort (9.4277ms)
✔ actual draft storage rejects IndexedDB open failure instead of allowing false save success (2.877ms)
✔ employee history validates real identities and dates and filters all record details (18.016ms)
✔ history CRUD persists before UI success, includes former employees, exports current filter and preserves other views (73.6415ms)
✔ document metadata saves only after server confirmation, preserves original upload on retry and exports filtered actual records (60.4443ms)
✔ document Word editor loads persisted bytes before opening and saves true blobs with cleanup after record failure (23.0295ms)
✔ PDF preserves all lines across pages and never invents a signature (14.7867ms)
✔ PDF wraps long unbroken lines and supports an empty report (2.6595ms)
✔ XLSX is an OpenXML ZIP with real numbers, Unicode, escaping and no formula injection (3.365ms)
✔ TOTP matches RFC 6238 and rejects an empty secret (58.2807ms)
✔ required, email, URL and length rules block invalid values (5.4327ms)
✔ defaults, zero values, reset and unmounted fields behave correctly (1.2541ms)
✔ optional blank values, patterns and async validators are respected (1.06ms)
✔ modal footer submit calls the mounted form and unregisters on close (0.6439ms)
✔ onboarding progress requires actual canonical confirmations and never infers from legacy percentage (11.3936ms)
✔ onboarding persists each checkbox, handles failure, requires review before completion and opens real contract page (42.85ms)
✔ payslip confirmation persists by record key and does not claim success after API failure (642.2499ms)
✔ recruitment validates stages and dates and derives metrics from actual candidates (15.363ms)
✔ recruitment saves real candidate records, preserves logical keys, exports and reports API failure (110.776ms)
✔ rewards require an approved state before award and validate actual nonnegative amounts (13.2345ms)
✔ rewards await approval and award, preserve failure state, show authoritative actors and export real records (98.4548ms)

ℹ tests 33 | suites 0 | pass 33 | fail 0 | cancelled 0 | skipped 0 | todo 0 | duration_ms 2410.924
```

---

## IV. BẰNG CHỨNG XÂY DỰNG GIAO DIỆN PRODUCTION (VITE BUILD)

```text
> kiyodn-web@0.1.0 build
> vite build

vite v8.3.4 building client environment for production...
transforming...
✓ 5202 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                             1.03 kB │ gzip:     0.57 kB
dist/assets/signature_son-DEf_t0mZ.png      6.65 kB
dist/assets/index-CVlq012Z.css            136.46 kB │ gzip:    23.10 kB
dist/assets/index-f7Bwe62d.js           4,733.11 kB │ gzip: 1,103.41 kB

[plugin builtin:vite-reporter] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking
✓ built in 25.18s
```
