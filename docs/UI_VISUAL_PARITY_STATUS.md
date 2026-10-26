# Trạng thái tái tạo giao diện legacy

## Kết luận bàn giao

**CHƯA HOÀN TẤT.** Đợt UI thứ tư tiếp tục sửa lỗi mở sai chức năng, các trang tổng quan và bố cục. Lượt quét rộng checkpoint `revision4-admin-all` có **233 cặp ảnh, 0 PASS tuyệt đối**; đây là bản trước những thay đổi tích hợp cuối, không phải nghiệm thu bản cuối. Các con số từng đợt bên dưới là lịch sử, không phải phần trăm hoàn thành ứng dụng.

Phạm vi yêu cầu vẫn là toàn bộ giao diện. Báo cáo này lưu mốc tiếp tục, không thu nhỏ phạm vi xuống các màn hình đã sửa. Không thay dữ liệu thật bằng số liệu giả để làm ảnh giống nhau.

## Cập nhật 25/10/2026 — đợt UI thứ tư

Ponytail `full` và phân việc song song tiếp tục được áp dụng. Giữ nguyên Rust/egui, API và database hiện tại; legacy vẫn chỉ đọc. Không có thay đổi nguồn legacy trong đợt này.

### Thay đổi đã tích hợp

| Nhóm | Sửa cụ thể | Giới hạn phải giữ khi nghiệm thu |
| --- | --- | --- |
| Dashboard | Tải lại thống kê thật định kỳ; phân biệt chưa có dữ liệu/lỗi với số 0; KPI hàng lẻ có cùng độ rộng; tên thao tác dài và thời gian sự kiện không chồng chữ | Chưa khớp tuyệt đối hình học/font và chưa xác minh native; dữ liệu hai fixture có thể khác do legacy tự tạo hồ sơ nền |
| Tổng quan | Tách Tổng quan nhân sự khỏi danh sách nhân viên; Tổng quan tài sản khỏi danh sách; Sơ đồ doanh nghiệp khỏi danh sách đơn vị; Tổng quan tài liệu có renderer riêng | Không coi đúng URL là đúng chức năng; từng trạng thái dữ liệu vẫn cần kiểm tra |
| Tài liệu | Thư viện, chỉ đạo, văn thư, mẫu hợp đồng dùng đúng scope; lọc/tìm kiếm/phân trang/chi tiết/form; sửa `registryNumber` thành trường legacy `bookNumber`; lựa chọn danh mục và ngày được kiểm tra; trình soạn thảo giữ draft/phiên bản/chia sẻ thật | Hồ sơ metadata không đồng nghĩa đã tải tệp lên; không bịa PDF, chữ ký số, SHA-256 hoặc kết quả xác minh; thiết lập văn thư chưa đầy đủ |
| Tài sản | Các route cấu hình hệ thống không còn rơi vào danh sách tài sản; Việc cần làm có màn riêng | Các scope generic chưa có khóa revision server đồng nhất; không giả lập mã tự động, tệp xuất hay chứng từ ký số |
| Chat | Trang thường dùng shell tối toàn cửa sổ như ChatPage legacy; Quản trị chat vẫn riêng; giữ gửi/trả lời/react/DM/read-state/draft qua API thật | Voice, upload và presence realtime chưa được kết nối; vẫn cần đối chiếu tích hợp và kiểm tra native |
| Quản trị | Tổng quan, Vai trò, Phân quyền, Sao lưu, Menu thả, Cấu hình hệ thống được tách thành các màn riêng; dữ liệu tài khoản/health/log/danh mục lấy thật | Không báo lưu custom ACL, khôi phục backup, SMTP/SSO hoặc xuất tệp khi backend chưa có thao tác |
| Cài đặt | Giao diện có thẻ lựa chọn và lưu theme/Flyout/Accordion; khôi phục sau restart chỉ đọc preference, không phục hồi auth; Account/Logs/2SV không mở nhầm trang API storage | Tùy chọn chưa hỗ trợ bị disabled; không bịa FIDO2/OTP/HSM hoặc lịch sử đăng nhập; nhật ký ADMIN không được lộ cho USER |
| Nhân sự & sự cố | Giới hạn chiều cao toolbar lịch sử để không giãn trang; modal/footer dùng hàng hành động có giới hạn; sự cố có KPI, bộ lọc, bảng, form và drawer riêng | Các nghiệp vụ eKYC/ngân hàng chưa có API ghi không được hiển thị thành thao tác thành công |
| Nhân viên | Trang chủ mở hồ sơ cá nhân đúng dispatcher; bỏ thông báo mẫu viết cứng và nút dẫn USER sang trang admin | Wizard onboarding 14 bước legacy chưa được tái tạo đầy đủ; sửa đường dẫn không phải hoàn tất portal |
| Thu/Chi | Sửa đúng một lỗi SQL trong backend đang dùng: truy vấn không lọc không có placeholder nhưng truyền thừa tham số; giữ nguyên kiến trúc và schema | Không đổi số tiền hoặc mã do máy chủ cấp chỉ để khớp ảnh |

### Bằng chứng đã hoàn thành trước lượt ảnh tích hợp cuối

- Server: `cargo test -p kiyo-server --locked --quiet`: **189 đạt**. Regression Thu/Chi đã tái hiện 500 trước sửa rồi đạt; lọc bank/petty và không lọc đều được kiểm tra.
- Workspace: `cargo test --workspace --locked --quiet`: **189 server + 421 UI = 610 đạt**. Có 16 cảnh báo dead-code khi build thư viện thường; không gọi là sạch cảnh báo. 14 test Chat bao gồm Enter xuống dòng ở cửa sổ hẹp, Enter gửi ở desktop, focus sau gửi, draft khi đổi kênh và tương tác pointer/overflow.
- API thật: `functional.test.mjs`: **10 nhóm con + parent = 11 đạt**. Bao gồm 401, CRUD đơn vị, vòng đời ticket, stale revision/extras tài sản, CRM số 0/mã máy chủ, chống trùng/hủy phòng, tạo/hủy Thu/Chi, các collection tài liệu/dịch vụ riêng, Chat reply/react/DM privacy, create/patch/read lại cấu hình tài sản/nhiệm vụ/menu và chặn USER ghi. DM ngoài quyền trả 404 có chủ đích để không tiết lộ tồn tại; không đổi thành 403 cho vừa test. DB cuối: `build/visual-parity/runtime/revision3-functional-GNsZQJ`.
- 4 test Node so ảnh/geometry/dispatcher đạt; hai bộ sinh icon/menu `--check` đạt.
- Checkpoint ADMIN: `revision4-admin-all`, 232 route ứng viên/233 cặp, 0 lỗi thu thập/0 lệch URL, 0 pixel PASS. Có 401 ở **legacy** `/collections/employee_my_profile`; không có HTTP lỗi của app được ghi ở checkpoint này. Đúng URL hoặc không có HTTP lỗi không chứng minh chức năng/ảnh đã đúng.
- USER lượt đầu: `revision4-employee-responsive`, 13 route × 3 viewport = 39 cặp, 0 pixel PASS. Reference bị wizard onboarding chặn toàn bộ; kết quả giữ nguyên như bằng chứng thiếu onboarding, không diễn giải thành đã so sánh nội dung từng trang.
- Lượt USER tiếp theo dùng tài khoản USER thật được tạo qua API với số điện thoại trong hồ sơ. Điều kiện hồ sơ có sẵn được ghi rõ trong provenance; không giả token, không đổi ADMIN thành USER, không sửa cờ local để vượt onboarding.
- Nguồn và bundle được ghi hash; build từ chối nếu nguồn thay đổi khi đang build; capture từ chối bundle cũ. Không mask/tolerance/crop ảnh để nâng tỷ lệ.
- Sửa bộ thu lỗi ảnh: HTTP/console phát sinh trong thời gian chờ ổn định phải được lấy sau khi chụp, không lấy sớm rồi bỏ sót lỗi đến muộn. Lượt ảnh cuối dùng cách thu này; báo cáo cũ được giữ nguyên và không nâng lên thành bằng chứng không có lỗi tuyệt đối.

### Checkpoint tích hợp và phát hiện tiếp theo

- `revision4-integrated-responsive`: **126 cặp**, 0 pixel PASS; 3 timeout do chọn URL alias `/admin/notifications/system` không phải entry của menu native (entry đúng là `/admin/system/notifications`). Phải chạy lại entry đúng; không xóa hoặc gọi ba timeout là đạt.
- Bộ thu lỗi muộn đã ghi đúng crash **reference** `identityModalTitle is not defined` ở Lịch sử nhân sự tại cả ba kích thước. Native không crash đó; không sửa legacy hoặc tái tạo màn lỗi để làm ảnh giống nhau.
- Bộ thu cũng phát hiện lỗi **app** thật: Account ADMIN gọi `/employees/me` và nhận 404 vì ADMIN không có employee profile. Đang tách panel tài khoản ADMIN dùng thông tin phiên thật, không tạo hồ sơ nhân viên giả để tránh lỗi.
- `revision4-employee-populated`: **54 cặp/18 route**, 0 lỗi thu thập và 0 pixel PASS. Đây là USER có hồ sơ sẵn, không phải wizard onboarding. Legacy cố gọi ba API finance chỉ dành ADMIN trên các trang USER, bị 403; các lỗi bị giữ trong báo cáo. App không có lỗi HTTP/runtime được ghi ở checkpoint này, nhưng bố cục/nội dung nhiều trang còn khác.
- Đang cải thiện tiếp Trang chủ nhân viên (banner/thẻ thông tin thật) và Giao diện (geometry/icon/card/footer); các checkpoint trên là **trước** các thay đổi tiếp theo này.
- Rà luồng chi tiết Thu/Chi phát hiện nút Hủy ở cửa sổ chi tiết bỏ qua bước xác nhận. Đã chuyển sang drawer 580px và modal xác nhận dùng thành phần chung: mở xác nhận/đóng/chọn Không hủy không gửi yêu cầu; chỉ nhấp xác nhận mới trả intent cho API path. Hai regression test đạt, gồm nhấp thật trong egui tại 320/390/768/1440px và chứng từ đã hủy/không còn tồn tại. Chưa coi đây là kiểm thử native hoặc E2E dữ liệu thật.
- Bổ sung test bộ thu lỗi ảnh: ảnh pixel giống hoàn toàn vẫn phải FAIL nếu console lỗi đến trong thời gian settle; 5 test Node capture/so ảnh/dispatcher đạt.

### Mốc bàn giao bản dựng cuối của đợt 4

- Đã hoàn thiện thêm Home nhân viên (banner, 6 ô thông tin, 3 thẻ, ngày không in timestamp thô; chỉ đọc tài khoản nhận lương đã duyệt của đúng chủ và che số), Quản trị chat (3 KPI/7 cột/phân trang 10 dòng/không bịa E2EE hoặc chứng nhận ISO), và Appearance (max-width 1120, icon SVG Ant Design thật, thẻ cùng hàng cùng chiều cao, trạng thái draft, footer, save/reset). Onboarding 14 bước và full profile editor legacy vẫn chưa hoàn tất.
- Lỗi Account ADMIN đã sửa: tab hồ sơ gọi `render_admin_account` từ thông tin phiên thật, không gọi `/employees/me` hoặc tự tạo hồ sơ nhân viên. `revision4-final-refinement` tại 3 viewport không ghi lỗi HTTP/runtime của app; entry thông báo đúng `/admin/system/notifications` mở được. Phase này có **27 cặp, 0 pixel PASS**, và **1 lỗi đo** tên nút Phiếu có icon; không gọi toàn phase là đạt.
- `revision4-employee-refinement` chỉ thu được 8 cặp rồi lỗi proxy ECONNRESET lúc đổi viewport, **không phải một lượt hoàn tất**. Đã bắt và lưu lỗi forward/teardown thay vì unhandled rejection; token fixture trong log lỗi được che, giữ nguyên bằng chứng lỗi. `revision4-employee-refinement-retry` hoàn tất **12 cặp/3 viewport**, 0 lỗi thu thập/proxy, 0 HTTP/runtime lỗi app, **0 pixel PASS**.
- `revision4-cash-confirmation`: **9 cặp, 0 lỗi thu thập/proxy, 0 HTTP/runtime lỗi app, 0 pixel PASS**. Qua UI thực trên hai database riêng: trước/mở xác nhận/chọn Không hủy vẫn `Đã hoàn thành`; sau nhấp xác nhận, cả hai API trả thành công và readback là `Đã hủy`. Chứng cứ: `build/visual-parity/revision4-cash-confirmation/reports/cash-mutation-evidence.json`. Đây là E2E WASM/legacy 1440px với fixture; 320/390/768/1440px được kiểm tra pointer ở unit egui, không được suy ra native E2E.
- Kiểm tra cuối `cargo test --workspace --locked --quiet`: **189 server + 436 UI = 625 đạt**; HTTP thật: **11 đạt** (DB `build/visual-parity/runtime/revision3-functional-L1aAZ3`); 6 test Node gồm capture/so ảnh/dispatcher/redaction đạt; hai bộ sinh icon/menu `--check` đạt. Build thư viện thường có **17 cảnh báo** (16 dead-code có sẵn và 1 đối số chỉ dùng khi test), chưa dọn cảnh báo.
- Desktop release dựng thành công tại `target/release/kiyo-admin-desktop.exe`, 26.198.528 byte; SHA-256 `733af35a220a1aedc0737c7eabc92d9412aff69189cf72904ea777006197ff33`. Server có bản sửa Thu/Chi tại `target/codex-release/release/kiyo-server.exe`. WASM ghi build provenance `2026-10-25T02:50:21.401Z`; kiểm tra sau lượt ảnh không thấy nguồn UI/web/assets thay đổi so với manifest.
- **Chưa thay tiến trình đang chạy.** Desktop hiện tại dùng đường dẫn `target/codex-release/release/kiyo-admin-desktop.exe` cũ; backend đang chạy cũng không phải server release mới vừa kiểm tra. Không dừng tiến trình hay ghi đè executable đang mở, không đổi database/cấu hình/JWT và không tạo/reset tài khoản thật. Cần áp dụng hai bản dựng mới theo đúng cấu hình hiện hữu trước khi coi phiên app đang mở đã nhận bản sửa.

Yêu cầu toàn bộ ứng dụng vẫn **CHƯA HOÀN TẤT**. Không dùng số test, tỷ lệ nền trùng màu, đúng URL hoặc absence of HTTP errors để tuyên bố “100%/1000%”. Giao diện nhiều trang, hồ sơ/onboarding, những khả năng chưa có API, keyboard/theme/scroll/DPI/accessibility trên native vẫn còn phải kiểm tra và sửa tiếp.

Native visual/DPI/accessibility vẫn **NOT_VERIFIED**. Không mở hoặc tự thay file app đang chạy. Ảnh browser/WASM với font Windows chỉ là bằng chứng kiểm thử bản dùng chung, không phải ảnh cửa sổ desktop native. Những phần chưa có API, full onboarding, các thao tác với dữ liệu thật/keyboard/theme/breakpoint chưa bao phủ vẫn là việc còn lại trong phạm vi yêu cầu.

## Cập nhật 24/10/2026 — đợt UI thứ ba

Ponytail `full` tiếp tục được dùng. Người dùng đã cho phép chia việc song song; sáu tác nhân sửa các nhóm tệp riêng rồi dừng do giới hạn sử dụng. Phần mã đã có được giữ lại, tích hợp trực tiếp và kiểm tra lại; không coi việc tác nhân đã được giao việc là bằng chứng hoàn thành.

### Phần đã sửa thêm

| Nhóm | Thay đổi chính | Giới hạn còn lại |
| --- | --- | --- |
| Khung và thành phần chung | Cấu hình font/kích thước cho cả theme sáng và tối, tránh bị egui đổi về mặc định; thẻ KPI có phần lẻ CSS, bảng, chọn trang, nhãn/form/textarea, drawer desktop/mobile; chặn click mở form rơi vào ô nhập mới; cuộn riêng theo route; thanh mobile dạng fixed overlay | Raster font, toàn bộ theme và mọi trạng thái chưa đạt pixel parity; không suy ra native từ WASM |
| Tài sản | Danh sách 8 cột, tìm kiếm/bộ lọc/phân trang, form và drawer; tách trang báo cáo/usage khỏi danh sách; báo cáo gom dữ liệu thật, không thay giá trị thiếu bằng 0; usage đọc phiếu cấp phát/điều chuyển thật và phân trang | Phiếu nghiệp vụ là trạng thái hiện tại, không phải audit timeline đầy đủ; xuất tệp chưa tích hợp; các trang cấu hình tài sản còn phải làm |
| Nghiệp vụ tài sản | Bố cục cấp phát, điều chuyển, kiểm kê, khấu hao, thanh lý, bảo dưỡng, sửa chữa, vật tư; form/drawer dùng thành phần chung | Còn lệch geometry/nội dung; không xác nhận chứng từ hoặc sức khỏe thiết bị từ dữ liệu legacy chưa kiểm chứng |
| CRM, Hợp đồng, Công việc | Header/KPI/toolbar/bảng/form và lọc/phân trang; tách hợp đồng lao động với kho hợp đồng; giữ mã CRM do máy chủ cấp, validation tiền và dữ liệu mở rộng | Form/chi tiết hợp đồng, chi tiết task và các trạng thái có dữ liệu chưa hoàn tất; không dựng PKI/eKYC giả |
| Nhân sự | Tuyển dụng, hội nhập, lịch sử, đánh giá, định biên; đào tạo, chứng chỉ, khen thưởng, đồng phục, đề xuất, tài khoản ngân hàng | Nhiều hành động chưa có API phải disabled; chưa kiểm tra đủ hồ sơ thật, dữ liệu dài và vòng đời từng nghiệp vụ |
| Chấm công | Tổng quan dữ liệu thật, yêu cầu nghỉ/OT, ca/phân ca; thêm màn timesheet/raw/summary/cảnh báo/quỹ phép/kế hoạch với scope thật | Các màn collection chưa có hợp đồng ghi an toàn giữ chỉ đọc; không sinh công/FaceID/IoT hoặc số ngày phép giả |
| Phòng họp | Lưới thẻ, danh sách, lịch theo giờ, lịch sử 7 cột và khối thiết lập; giữ chống trùng lịch và hủy lịch thật | Không sao chép 3 lịch mẫu hay KPI 100%/78.5%; cấu hình và Meet/Teams chưa có API nên không báo đã kết nối/đã lưu |
| Tài chính, Kế hoạch, Quy trình | Các trang con, báo cáo, tài khoản ngân hàng, quỹ tiền mặt, milestone/OKR/tiến độ; blueprint/lịch sử/thiết lập và nghiệp vụ CRM | Nhiều trang vẫn chưa khớp; Thu/Chi còn lỗi backend 500 đã biết; không biến API lỗi thành số dư 0 |

### Kiểm tra và bằng chứng

- Kiểm tra cuối: `cargo test --workspace --locked --quiet` có **189 server + 353 UI = 542 đạt**, 0 thất bại. Test layout báo cáo Tài sản từng tái hiện tràn ngang ở tablet trước khi sửa hướng bố cục bên trong card; sau sửa đạt trên desktop/tablet/mobile. Không suy ra pixel parity hay toàn bộ E2E từ số test này. Build hiện còn 16 cảnh báo dead-code, không được diễn giải thành code đã sạch cảnh báo.
- 4 kiểm thử Node cho so ảnh/geometry và kiểm kê dispatcher đạt. Hai bộ sinh icon/menu `--check` đạt.
- HTTP thật: **6/7 nhóm đạt** (401, CRUD đơn vị, ticket, revision/extras tài sản, CRM mã máy chủ/giá trị 0/bộ lọc, đặt/hủy phòng và chống trùng). Nhóm Thu/Chi vẫn **FAIL 500**; create/cancel chưa chạy tiếp. Node tính thêm parent test fail, không phải hai lỗi nghiệp vụ riêng. DB chẩn đoán: `build/visual-parity/runtime/revision3-functional-nImIgU`; process 3424 của runner đã dừng.
- Các lượt WASM ghi hash nguồn/bundle, không thay reference hoặc dùng mask/tolerance. Cờ `--native-fonts` chỉ đưa font Windows đang cài vào browser kiểm thử riêng, có SHA-256; không phân phối font vào app/repo. Đây vẫn không phải ảnh cửa sổ native.
- Edge bị crash lúc mở page trong lần chụp mới. `revision3-integrated-all` thu **0 cặp** vì lỗi đó, không phải PASS. Chuyển sang Chrome cài sẵn cho cả hai phía; không diễn giải chênh lệch giữa hai browser thành cải thiện chỉ do code.

| Phase | Phạm vi checkpoint | Cặp ảnh | PASS tuyệt đối |
| --- | --- | ---: | ---: |
| `revision3-baseline-all` | Route ứng viên, 1440×900, trước bản sửa của đợt | 232 | 0 |
| `revision3-first-pass` | Một số danh sách/form, 3 viewport | 39 | 0 |
| `revision3-integration-start` | Trước tích hợp tác nhân, 3 viewport, font Windows | 39 | 0 |
| `revision3-integrated-chrome-smoke` | Login, Tài sản, CRM, lịch phòng; trước sửa cuộn/overlay cuối | 14 | 0 |
| `revision3-integrated-chrome-all` | 1440×900, checkpoint tích hợp, **trước** sửa modal/cuộn/overlay cuối | 232 | 0 |
| `revision3-final-responsive` | 15 route được chọn, form/menu, 3 viewport; có 2 timeout của phép đo menu sai key | 62 | 0 |
| `revision3-mobile-navigation-check` | Đo lại đúng `nav.hr`: mở bằng thanh dưới, đóng bằng backdrop, rồi mở từ header; tablet/mobile | 6 | 0 |
| `revision3-modal-replay-check` | Bản cuối, 3 route/form tại 390/768px, sau guard nhiều pass trong cùng frame; không lỗi thu thập | 12 | 0 |

Lượt quét 232 cặp có 0 lỗi thu thập và không lệch route, nhưng vẫn có HTTP 401 ở login legacy và 500 ở Thu/Chi thực tế. **Không** diễn giải “không lỗi thu thập” là “không lỗi ứng dụng”. 19 mục chưa thử là 18 route employee cần USER thật và activation một lần. Các route ứng viên/alias không đồng nghĩa 232 trang đã hoàn thiện.

Hai timeout của `revision3-final-responsive` là bộ đo chờ rect `sidebar` vốn chỉ ghi ở desktop; snapshot lúc timeout đã có các item `nav.*` của drawer đang mở. Đã sửa phép chờ theo `nav.hr`, kiểm tra lại 6 cặp không còn lỗi thu thập. Không sửa chức năng điều hướng chỉ để che lỗi đo. Các case còn FAIL pixel được giữ nguyên.

Ở 390px, vùng content hiện đo được `[0,48,390,796]` trùng nguồn, không còn bị thanh dưới trừ 56px. Form CRM đo được 370×746.46875 như nguồn; vị trí y vẫn lệch 0.234375px vì Area làm tròn, và vẫn còn sai khác chữ/trạng thái/focus/nền cuộn. Không gọi đây là form hoặc trang đã pixel-perfect. Chuyển route không mang offset của route trước; cuộn nền khi mở modal vẫn cần kiểm tra tiếp.

### Phần còn phải làm

Chưa nghiệm thu toàn ứng dụng: nhiều màn tài liệu, chat, cấu hình, hệ thống, chữ ký/bảo hiểm con và các nghiệp vụ phụ vẫn khác nhiều. Form/chi tiết/xóa, trạng thái có dữ liệu, lỗi, loading, phím Tab/keyboard, bảng ngang, scroll, mọi breakpoint/theme và USER thật chưa có ma trận kiểm chứng đầy đủ. Giữ nguyên yêu cầu toàn bộ giao diện, không thu hẹp sang các route đã có ảnh.

Binary debug đang được process khác sử dụng, build không ghi đè được (`Access is denied`); không dừng process hoặc thay file đang chạy. Bản release được dựng riêng, không tự mở cửa sổ native. Native visual/DPI/accessibility vẫn **NOT_VERIFIED** vì bước mở cửa sổ native trước đó bị môi trường chặn; không dùng browser để lách hay thay thế xác nhận đó.

### Bản app và kiểm tra nguồn cuối đợt

- `cargo build -p kiyo-admin-desktop --release --locked --quiet`: đạt. File [kiyo-admin-desktop.exe](E:/DATA/source/apwdnt/target/release/kiyo-admin-desktop.exe), **25.136.640 byte**, SHA-256 `71698231E83AFF509D84244E878FC356F98D259D3D6C9D1A6F71F8A314709534`. Đây là binary UI cần API đang chạy, không phải bộ cài đã gộp server. Không đổi endpoint mặc định theo cổng fixture kiểm thử.
- Bản WASM cuối đã dựng lại và ghi hash nguồn/bundle. 542 test Rust cuối, 4 test Node và kiểm tra icon/menu đều đạt; kiểm thử HTTP vẫn có lỗi Thu/Chi như trên.
- Đối chiếu lại **389 tệp nguồn/cấu hình legacy/server** với manifest đầu đợt: không đổi. Không suy rộng thành kiểm tra mọi tệp nhị phân/DB. Manifest thay đổi lưu ở `build/visual-parity/reports/revision3-change-manifest.json`.
- Ảnh cuối vẫn **0 PASS tuyệt đối**. Guard modal chỉ bảo đảm control không tương tác trong frame mở, kể cả sizing pass lặp; bằng chứng ảnh vẫn còn nền cuộn/hover khác nguồn. Không xem test guard là chứng minh đã sửa mọi vấn đề focus/scroll.

## Cập nhật 24/10/2026 — đợt UI thứ hai

Ponytail `full` tiếp tục được áp dụng: sửa tại thành phần dùng chung, giữ nguyên API/validation/quyền truy cập; không đổi framework, database hoặc sửa source legacy/server. Không cắt phạm vi yêu cầu toàn ứng dụng.

### Code đã thay đổi thêm

| Nhóm | Thực hiện | Phần chưa đạt |
| --- | --- | --- |
| `widgets.rs`, `app.rs` | Thẻ thống kê xuống dòng; viền/chiều cao bảng; tab nhỏ; footer chỉ chiếm một hàng; header/sidebar hết lệch 0.5px; chừa khoảng trống mobile như legacy | Font/raster, shadow, animation, mọi trạng thái/theme chưa nghiệm thu |
| `org_units.rs` | 4 thẻ thống kê, toolbar, bảng 7 cột, modal tạo/sửa; giữ kiểm tra cây đơn vị, dữ liệu thật và xóa | Drawer chi tiết, icon, cột/nội dung dài và modal còn lệch |
| `helpdesk_tickets.rs` | Thẻ, bộ lọc, bảng, phân trang và modal; giữ create/receive/complete | Không bịa MTTA/SLA 98.6% khi API chưa cung cấp; tương tác/bố cục còn sai khác |
| `finance.rs`, `cash_flow.rs` | Màn Thu/Chi, Dòng tiền và form theo source; giữ số tiền/ngày/trạng thái, báo lỗi tải thật | API danh sách trả 500; không biến lỗi thành số dư 0/bảng rỗng thành công |
| `date_picker.rs`, `lib.rs` | Lịch ngày/tháng/năm theo source, chọn/xóa/hôm nay, đặt popup trong viewport; nối vào nhân sự/đơn vị/Thu Chi | Hình học form cha, font và dropdown vẫn khác; không dùng compile để xác nhận pixel-perfect |
| `files.rs` | Nền trắng, thanh công cụ/địa chỉ, bảng 9 cột, menu và footer; giữ upload/download/replace/share/rename/delete, kiểm tra thư mục bảo vệ | Chưa có API copy/cut/paste/quota nên hiển thị thiếu dữ liệu hoặc disabled; grid/preview/drag-drop và form phụ chưa hoàn thiện |
| `settings.rs` | Bố cục 4 khối bảo mật, mắt hiện/ẩn mật khẩu, giữ chính sách mật khẩu và API thật | PIN/2FA/thiết bị/IP không có API; không sao chép trạng thái giả của legacy |
| `notifications.rs` | Header, tìm kiếm và khối rỗng đúng số đo tại 3 viewport | Danh sách có dữ liệu, menu và thao tác hàng loạt còn phải đối chiếu |
| `insurance.rs` | Sửa panic ở mobile/tablet do tạo 2 cột nhưng truy cập cột thứ 3/4; thống kê responsive và bỏ % đè lên progress | Các trang bảo hiểm con, bố cục/text/progress chưa khớp hoàn toàn |
| `signatures.rs` | Bỏ 3 tài liệu mẫu và khẳng định eKYC/PKI/ký thành công giả; bản vẽ chỉ giữ trong phiên, xóa khi đổi phiên/logout | Chưa có API ký/xác minh/chứng thư; UI verify/history chưa tái tạo, không gọi đây là ký số đã tích hợp |

`employees.rs`, `users.rs`, `workflow_requests.rs` cũng dùng footer một hàng; nhân sự dùng lịch mới. `dashboard.rs` chỉ có định dạng lại ngoài các sửa UI từ mốc trước. Icon lấy từ bộ SVG Ant Design mà legacy sử dụng, không tạo ảnh/icon thay thế bằng AI.

Hai lỗi có bằng chứng hồi quy:

- Bảo hiểm overview từng làm WASM panic trên viewport hẹp, khiến các route sau không render được. Test render 320/390/768/1440px đã thêm; các lượt chụp sau đi tiếp được qua bảo hiểm.
- Nút X bị lớp dialog che sau khi click vào form/lịch. Test pointer tái hiện thất bại trước sửa, đạt sau khi đưa nút đóng lên lớp cao hơn; lượt chụp lại đã mở ngày/tháng/năm rồi đóng dialog được trên desktop/tablet/mobile.

### Kiểm thử mới

- `cargo test --workspace --locked --quiet`: **189 server + 303 UI = 492 đạt**, 0 thất bại.
- `cargo build -p kiyo-admin-desktop --locked`: **đạt** trên source mới; binary debug tại `target/debug/kiyo-admin-desktop.exe`. Đây không phải bằng chứng ảnh native đã khớp; chưa kiểm tra release.
- Build WASM với feature kiểm tra và hash nguồn/bundle: đạt. Bản production không tự bật feature này.
- So ảnh/geometry và kiểm kê regex dispatcher: **4 kiểm thử Node đạt**. Sửa bộ kiểm kê từng gán nhầm các route bảo hiểm sang NotFound; không biến số route ứng viên thành số trang hoàn thiện.
- Bộ sinh icon và thứ tự menu `--check`: đạt.
- `functional.test.mjs`: **3/4 nhóm HTTP đạt** (anonymous bị chặn; tạo/sửa/xóa đơn vị; tạo/chuyển trạng thái ticket). Nhóm cash **FAIL HTTP 500**, chưa chạy tiếp create/cancel trong nhóm đó. Tổng Node báo thêm parent test fail, không diễn giải thành 2 lỗi nghiệp vụ khác nhau.
- Runner HTTP dùng process/database mới, port 3424; không ghi vào database tương tác 3412. Các database kiểm thử được giữ trong `build/visual-parity/runtime/revision2-functional-*` để chẩn đoán.
- So hash **389 tệp nguồn/cấu hình legacy/server** với baseline đầu đợt: **0 thay đổi**. Không suy rộng thành kiểm tra mọi tài nguyên nhị phân.

### Chẩn đoán Thu/Chi — chưa sửa backend

GET `/api/v1/finance/cash-transactions` không có `source` trả lỗi `Wrong number of parameters passed to query. Got 1, needed 0` cả trên DB kiểm thử mới. Tại `server/src/finance.rs:632`, nhánh không lọc tạo SQL không có placeholder nhưng vẫn truyền `params![query.source]`. Đây là lỗi backend đã xác định bằng HTTP thật và đọc source, không phải lỗi email/mật khẩu hay bảng UI. Source server được giữ nguyên; cần đưa bản sửa backend này vào phạm vi trước khi nghiệm thu luồng Thu/Chi/Dòng tiền.

### Chứng cứ so ảnh của đợt này

Tất cả so toàn viewport/RGBA, zero tolerance, không mask/crop/resize hoặc thay baseline. Browser Date được cố định khi chụp lịch; timer/server clock vẫn chạy. Lượt mới đợi 650ms để loading bar 500ms của legacy kết thúc; không quy mọi thay đổi điểm số so với lượt 400ms cũ thành mức cải thiện của code.

| Phase | Phạm vi / ghi chú | Cặp ảnh | PASS tuyệt đối |
| --- | --- | ---: | ---: |
| `revision2-before` | Baseline; lỗi panic bảo hiểm làm 4 trường hợp mobile không thu được ảnh | 12 | 0 |
| `revision2-shared-org-notifications` | Khối dùng chung, đơn vị/thông báo/nhân sự/tài khoản | 21 | 0 |
| `revision2-ticket-finance-mobile-recovery` | 8 route × 3 viewport và modal; đã đi qua bảo hiểm mobile | 33 | 0 |
| `revision2-complete-batch-check` | 13 route + trạng thái; còn 3 lỗi đóng dialog trước bản sửa layer | 76 | 0 |
| `revision2-modal-layer-and-files-final` | 14 route + trạng thái; đóng lịch/dialog được; 3 lỗi bộ chụp do nhãn “Tệp tin” khác “Tệp tin trống” | 82 | 0 |
| `revision2-files-menus-same-pointer` | Chụp lại 10 trường hợp Thư mục với selector và tọa độ click giống nhau; không lỗi thu thập | 10 | 0 |
| `revision2-current-verified` | Source/bundle cuối: Thư mục, Bảo mật, Thu/Chi, Dòng tiền, Bảo hiểm, Thông báo; 3 viewport + menu/focus/modal/lịch; không lỗi thu thập | 40 | 0 |

Các tên phase là mốc artifact, không phải tuyên bố toàn ứng dụng đã hoàn tất. Ảnh ở `references/`, `actual/`, `differences/`, `overlays/`; từng case JSON nằm trong `reports/`. Các đường dẫn `reference/`, `diff/`, `overlay/` ở phần lịch sử bên dưới không đúng với layout artifact hiện tại.

Lượt cuối có **80 screenshot / 40 phép so**, **6,349,764 / 32,646,696 pixel khác**; tỷ lệ pixel bằng nhau có trọng số là **80.550056%**. Đây chỉ là thống kê ảnh toàn viewport (có nhiều nền trống và dữ liệu API khác nhau), **không phải phần trăm hoàn thành hay mức tương đương nghiệp vụ**. Không có case đủ điều kiện PASS. Dữ liệu hai API chưa đồng bộ hoàn toàn, font/raster khác và còn sai hình học; không quy hết pixel khác cho font.

Pixel khác của trạng thái mặc định trong `revision2-current-verified`:

| Route | 1440×900 | 768×1024 | 390×844 | Chức năng đã kiểm trong đợt / phần còn thiếu |
| --- | ---: | ---: | ---: | --- |
| `/admin/files` | 48,572 | 41,053 | 23,135 | Unit search/sort/bảo vệ/lỗi xóa từng phần + render 320/390/768/1440; chưa submit CRUD qua UI |
| `/admin/settings/security` | 99,005 | 103,237 | 69,243 | Unit validation/reset bí mật + focus UI; chưa đổi mật khẩu thật qua UI |
| `/admin/finance/cash/expense` | 358,625 | 312,035 | 133,921 | Unit payload/validation + mở lịch ngày/tháng/năm/đóng form; HTTP danh sách FAIL 500 |
| `/admin/finance/cash/flow` | 322,740 | 265,037 | 101,467 | Unit tổng hợp, render/overflow và lỗi không giả số 0; dữ liệu thật bị chặn bởi HTTP 500 |
| `/admin/insurance/overview` | 436,098 | 298,509 | 112,255 | Unit responsive không panic + điều hướng/chụp thật; chưa nghiệm thu nghiệp vụ bảo hiểm |
| `/admin/notifications/my` | 46,275 | 29,778 | 22,900 | Unit tìm kiếm/link theo quyền + trạng thái rỗng; danh sách có dữ liệu và mutation UI chưa test đủ |

JSON/Markdown chi tiết: `build/visual-parity/revision2-current-verified/reports/summary.{json,md}`. Source/bundle được khóa bằng SHA-256; snapshot geometry là feature kiểm tra của cùng code Rust, không phải DOM giả của app native.

Đã đo khớp rect header/menu/sidebar-brand desktop và header/search/empty Thông báo trên cả 1440×900, 768×1024, 390×844; **không phải toàn ảnh khớp**. Bảng tệp và footer đã khớp rect tại 3 viewport sau sửa. Những rect khớp không loại bỏ các pixel khác do font, nội dung, hình học thành phần khác hoặc API thật khác dữ liệu.

### Phạm vi vẫn chưa nghiệm thu

Kiểm kê hiện có 334 ứng viên URL/prefix/redirect, 276 mục điều hướng và 18 tệp shared được nhận diện; không phải số trang/component đã tái tạo xong. Những route ngoài lượt chụp mới vẫn pending; 18 route USER và activation chưa có fixture hợp lệ để nghiệm thu. Native/DPI, release, dark mode, mọi breakpoint ±1px, cuộn/nhiều dòng/loading/error, submit CRUD qua UI, bàn phím và công nghệ hỗ trợ chưa kiểm chứng đầy đủ. Bộ HTTP không thay thế kiểm thử thao tác UI đầu-cuối.

Ảnh WASM dùng fallback Noto Sans; native Windows đọc Segoe UI/Arial được cài tại máy. Không đóng gói font hệ điều hành vào web để né quyền sử dụng. Không có chứng cứ ảnh native hợp lệ trong đợt này; không dùng screenshot của app cài sẵn khác để xác nhận binary vừa build.

Tiếp tục theo inventory và bảng sai lệch; không có cơ sở báo phần trăm hoàn thành toàn app hoặc “giống 100%”.

## Ponytail

- Đã cài skill gốc vào `C:/Users/sonng/.codex/skills/ponytail/SKILL.md`, từ repo DietrichGebert/ponytail, commit `09c434ab73ca43761c5d8b0c5d341926c2fba710`.
- Đã xác minh nội dung cài đặt bằng SHA-256 với tệp upstream tại commit đó.
- Quy tắc mặc định `full` lưu tại `C:/Users/sonng/.codex/AGENTS.md`; đã đọc và áp dụng ngay trong lượt sửa này. Đây là hướng dẫn làm code, không phải tiến trình chạy nền hay hook tự động.
- Dùng lại thành phần chung, sửa nguyên nhân tại chỗ dùng chung, giữ kiểm tra đầu vào, trạng thái bận và xử lý lỗi; bổ sung kiểm thử hồi quy cho modal dài và nhãn xuống dòng.

## Phần đã triển khai

| Nhóm | Tệp chính | Thay đổi |
| --- | --- | --- |
| Khung chung | `ui/src/app.rs`, `theme.rs`, `native_text.rs` | Màu/kích thước lấy từ legacy; sidebar, header, icon SVG, menu con, thứ tự menu; font native dùng font hệ điều hành với fallback |
| Thứ tự điều hướng | `ui/src/navigation_order.rs`, `tools/generate_navigation_order.mjs` | Sinh thứ tự từ nguồn legacy, giữ mục riêng của app ở sau, không đổi phân quyền |
| Thành phần dùng chung | `ui/src/widgets.rs` | Thẻ thống kê, toolbar, bảng/trạng thái rỗng, tag, form có nhãn xuống dòng, modal và nút đóng |
| Đăng nhập | `ui/src/views/login.rs` | Kích thước khung, font control, vị trí và đo hình học |
| Dashboard | `ui/src/views/dashboard.rs` | Thẻ KPI, banner, icon, khoảng cách, khối truy cập nhanh/lịch sử; sửa ảnh hưởng cursor lên bố cục |
| Nhân sự | `ui/src/views/employees.rs` | Thẻ thống kê, toolbar, bảng, modal, bố cục responsive; giữ CRUD và các thao tác hiện có |
| Tài khoản | `ui/src/views/users.rs` | Thống kê, toolbar, bảng 7 cột, form tạo tài khoản; giữ tìm kiếm, phân trang và điều kiện khóa thao tác |
| Đề nghị quy trình | `ui/src/views/workflow_requests.rs` | Thống kê, toolbar, bảng, modal tạo; giữ nguồn blueprint thật, validation và điều kiện chặn khi chưa cấu hình |
| Tài nguyên | `ui/assets/legacy-empty.svg`, `ui/assets/nav-icons/` | SVG trạng thái rỗng và icon; cập nhật bộ sinh icon hiện có |
| Đo kiểm | `ui/src/visual_test.rs`, `ui/src/lib.rs`, `ui/Cargo.toml`, `web/Cargo.toml` | Feature `visual-test` riêng, đo rect và điều hướng theo quyền sau đăng nhập thật; bản thường không bật feature này |
| Công cụ | `tools/visual-parity/` | Kiểm kê nguồn, build có hash chống bundle cũ, chụp/so ảnh tuyệt đối, báo cáo hình học và lỗi |

Lỗi modal vừa sửa tại thành phần chung: lớp phủ đúng opacity 48%; không còn giới hạn chiều cao Area mặc định 400px cắt form dài; nút footer cao tối thiểu 32px. Đã xem ảnh form Tài khoản desktop và mobile sau sửa, cả hai hiển thị đến nút lưu. Chưa kiểm thử submit CRUD đầu-cuối trong lượt chụp này.

## Chứng cứ và kiểm thử

Các đường dẫn dưới đây tính từ `E:/DATA/source/apwdnt/`. Artifact chụp nằm trong `build/` bị Git bỏ qua, không phải nguồn chuẩn để tự động thay ảnh legacy.

- `cargo test --workspace --locked --quiet`: **189 server + 285 UI = 474 đạt**, 0 thất bại.
- `node --test tools/visual-parity/compare.test.mjs`: **3 đạt**; so từng kênh RGBA, không tolerance, mask, resize hay crop che lỗi.
- Bộ sinh icon và thứ tự điều hướng: `--check` đạt.
- `node tools/visual-parity/build.mjs`: build WASM mới đạt, đã lưu hash nguồn/bundle và chờ toàn bộ Trunk kết thúc trước khi chụp.
- Native debug từng build đạt trước các chỉnh modal cuối; **chưa xác minh lại binary native sau chỉnh cuối**, chưa có ảnh native hợp lệ và chưa kiểm tra release.
- Kiểm tra bảo vệ **389 tệp nguồn/cấu hình** thuộc `legacy/` và `server/` so với baseline của lượt UI: **0 tệp thay đổi**. Không suy rộng kiểm tra này thành hash toàn bộ tài nguyên nhị phân. Có thay đổi sẵn trong worktree từ trước, được giữ nguyên.

| Lượt chụp | Phạm vi | Cặp ảnh | Giống tuyệt đối | Pixel khác / tổng |
| --- | --- | ---: | ---: | ---: |
| `verified-route-audit` | Baseline 232 cặp trên bản build cũ | 232 | 0 | 94,362,622 / 300,672,000 |
| `ponytail-ui-final-check` | Bản build cuối, 5 route, 3 viewport và trạng thái tương tác | 34 | 0 | 3,992,115 / 29,299,920 |

Không so tỷ lệ hai hàng như mức cải thiện toàn app: phạm vi và bản build khác nhau. Các lượt cũ không có build manifest không dùng làm chứng nhận nghiệm thu.

Lượt cuối chụp 68 ảnh tại 1440×900, 768×1024, 390×844 cho đăng nhập, dashboard, nhân sự, tài khoản, đề nghị quy trình. Có focus đăng nhập, flyout/nested flyout, thông báo, menu tài khoản, sidebar thu gọn/drawer và modal tạo. Không có lỗi thu thập trong `summary.errors`; từng case vẫn lưu HTTP/console riêng. Max sai lệch vị trí đo được 211px, kích thước 762px trong ma trận này: còn lỗi responsive/bảng phải xử lý.

Ví dụ hình học modal desktop sau sửa:

| Modal | Legacy W×H | App W×H | Chênh chiều cao |
| --- | --- | --- | ---: |
| Nhân sự | 600×357.1875 | 600×359 | +1.8125px |
| Tài khoản | 560×560.828125 | 560×574 | +13.171875px |
| Đề nghị quy trình | 760×410.1875 | 760×434 | +23.8125px |

Ảnh toàn màn hình vẫn khác vì cả bố cục, font/raster và dữ liệu thật giữa hai API. Ví dụ tên tài khoản bootstrap Rust khác tên fixture legacy, 2FA chưa có API, số bản ghi khác nhau. Không được diễn giải mọi pixel khác chỉ là lỗi font, cũng không được sửa dữ liệu để che khác biệt.

Chứng cứ:

- `build/visual-parity/ponytail-ui-final-check/reports/summary.json`: kết quả cuối và manifest build.
- Cùng thư mục phase có `actual/`, `reference/`, `diff/`, `overlay/` và JSON từng case trong `reports/`.
- `build/visual-parity/verified-route-audit/reports/summary.json`: baseline route cũ.
- `build/visual-parity/reports/inventory.json`: kiểm kê nguồn.
- `build/visual-parity/reports/task-change-manifest.json`: hash thay đổi và kiểm tra bảo vệ nguồn.
- `tools/visual-parity/README.md`: cách chạy lại và giới hạn.

Kiểm kê tìm được 334 ứng viên URL/prefix/redirect và 276 mục điều hướng app; **không phải 334 trang chức năng đã hoàn thiện**. Baseline có 19 trường hợp chưa kiểm tra: 18 route nhân viên và activation. Không dùng ADMIN giả làm tài khoản nhân viên.

## Lỗi API riêng còn tồn tại

Sau khi build lại server và chạy với DB kiểm thử riêng, hai route `/admin/finance/cash/expense` và `/admin/finance/cash/flow` vẫn nhận HTTP 500 từ `/api/v1/finance/cash-transactions`.

Chứng cứ: `build/visual-parity/current-api-diagnostics/reports/summary.json`. Không sửa backend ngoài phạm vi thay giao diện, không giấu lỗi thành bảng rỗng hay dữ liệu giả. Chưa kết luận nguyên nhân gốc của HTTP 500.

## Các khác biệt không được giả lập

- Không hiện 2FA/last-login như đã có dữ liệu khi API chưa cung cấp.
- Không đổi vai trò thực ADMIN/USER thành danh sách vai trò giả của legacy.
- Không tạo blueprint/người ký/ngân sách/tệp đính kèm giả, không báo PKI thành công khi chưa tích hợp.
- Không sao chép các tuyên bố tĩnh về bảo hiểm, ngân hàng, ngày trả lương, thử việc khi dữ liệu chưa xác nhận.
- Không thêm nút xuất Excel chỉ báo thành công mà không xuất thật.
- Giữ validation, quyền thao tác, lỗi API và tính năng app hiện có; những khác biệt cần API phải được xử lý như công việc tích hợp riêng.

## Việc còn lại và thứ tự tiếp tục

1. Chốt font/raster native và WASM bằng ảnh thực; không phân phối font hệ điều hành nếu chưa có quyền. Native visual hiện chưa kiểm chứng vì lệnh mở bản native bị môi trường chặn; không coi cửa sổ app cài sẵn khác là bằng chứng.
2. Sửa sai lệch dùng chung: viền/chiều cao bảng, header lệch nửa pixel, menu tài khoản, shadow/animation, modal và nhãn/overflow trên màn hình nhỏ. Giữ so ảnh zero tolerance.
3. Hoàn thiện tiếp từng nhóm trang trong inventory; đo trước/sau với cùng build manifest và dữ liệu được kiểm soát, không đánh dấu trang đã làm chỉ vì điều hướng tới được.
4. Bổ sung fixture USER kích hoạt thật và kiểm tra 18 route nhân viên/activation, mọi form/chế độ sửa/xóa, phân quyền và các trạng thái loading/error/empty/dữ liệu dài/nhiều dòng.
5. Kiểm tra cuộn/full-page, tất cả breakpoint và ±1px, dark mode, DPI native, bàn phím/focus và công nghệ hỗ trợ. Các phần này chưa được nghiệm thu.
6. Kiểm tra submit CRUD thật trên dữ liệu dùng một lần; xác minh payload/API với web cũ. Việc giữ lại handler không chứng minh mọi luồng API đã tương đương.
7. Chẩn đoán riêng lỗi cash-transactions khi được đưa vào phạm vi sửa backend; kiểm tra bản release và native mới nhất trước bàn giao cuối.

Chưa có cơ sở đưa ra tỷ lệ phần trăm hoàn thành toàn app hoặc tuyên bố giao diện/API đã giống legacy 100%.
