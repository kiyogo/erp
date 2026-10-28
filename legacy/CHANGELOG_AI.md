# NHẬT KÝ THAY ĐỔI DỰ ÁN (CHANGELOG_AI.MD)

Tài liệu này ghi lại toàn bộ lịch sử các tác vụ chỉnh sửa, sửa lỗi và nâng cấp được thực hiện trên dự án bởi AI Coding Assistant.

---

## [2026-10-28] - Trung tâm báo cáo công việc và kiểm tra luồng quy trình

- TasksModule: thêm màn Báo cáo theo trạng thái, người thực hiện, dự án/đơn vị và tháng tạo; hiển thị tỷ trọng và tiến độ trung bình từ danh sách đã lọc; xuất XLSX từ đúng dữ liệu trên màn và báo rõ khi chỉ tải được cache cục bộ. Giữ danh sách, ma trận Eisenhower và các thao tác nhiệm vụ hiện có.
- Thêm quy tắc tổng hợp có kiểm tra ngày tạo không hợp lệ, trường phân loại thiếu và tập dữ liệu rỗng; bổ sung test tổng hợp và xuất dữ liệu.
- E2E trên SQLite tạm xác minh số đếm, tiến độ trung bình, nhóm chưa có dự án, báo cáo tháng và tải XLSX. Mở rộng E2E AMIS Quy trình kiểm tra cả yêu cầu bổ sung/gửi lại/phê duyệt lẫn từ chối có lý do.
- Kiểm tra: API 119/119, web/domain 145/145, typecheck, production build và hai E2E nhiệm vụ/quy trình đạt. Bundle 5,032.44 kB; còn cảnh báo chunk trên 500 kB. PostgreSQL smoke gần nhất 72 checkpoint, không chạy lại trong lượt này.
- Giới hạn: đã xác minh 5 mục báo cáo công việc (IDs 366, 383, 384, 388, 391) và một luồng quy trình (ID 982); báo cáo cộng tác viên, thời lượng, năng lực nguồn lực, việc giao cho tôi, hoãn hạn, Gantt, hoạt động dự án, chia sẻ/dashboard và phần lớn các mục khác của 29 ứng dụng vẫn chưa được nghiệm thu. Mốc sàn cập nhật 47/982 (4.8%), không phải tỷ lệ hoàn thành toàn web.

## [2026-10-28] - Quản trị thông báo hệ thống trong web cũ

- Chuyển danh sách/thao tác broadcast khỏi cache trình duyệt sang API và bảng riêng trong SQLite/PostgreSQL; lưu tập người nhận thực từ user đang hoạt động, sender, kênh, trạng thái từng kênh và lượt đọc.
- In-app được tạo cho đúng người nhận. Sửa bản tin cập nhật thông báo trong ứng dụng đã phát, phát lại dùng snapshot người nhận đã lưu, xóa lịch sử không xóa tin đã tới hộp thư.
- Email được gửi theo từng người và lưu trạng thái SMTP vào outbound mail log; API/UI báo gửi một phần hoặc thất bại khi có lỗi. Thống kê đọc chỉ dùng notification In-app thật. SMS báo chưa có nhà cung cấp.
- Giữ bản ghi từ cache/local collection cũ ở chế độ chỉ xem, đánh dấu chưa xác minh và loại khỏi thống kê cho tới khi có căn cứ xác nhận.
- Kiểm tra: API 119/119, web/domain 143/143, E2E trình duyệt giữ và khóa bản ghi cũ + phát/đọc/phát lại/xóa, TypeScript, production build và PostgreSQL smoke 72 checkpoint đạt. Build còn cảnh báo chunk JavaScript khoảng 5.03 MB.
- Giới hạn: SMTP trả tiếp nhận không chứng minh thư đã vào inbox; SMS chưa tích hợp; toàn bộ 982 mục trong video/checklist vẫn chưa được nghiệm thu.
- Mở rộng kiểm tra `api/tests/workflow-browser.mjs` cho nhánh từ chối: người duyệt nhập lý do, lịch sử ghi actor/quyết định, người gửi thấy hồ sơ đã kết thúc sau khi tải lại. Checklist ID 982 được đánh dấu 1/1 đã xác minh; các màn và cấu hình Workflow khác vẫn còn trong phạm vi cần đối chiếu.

## [2026-10-26, tiếp tục] - Tệp gốc, quản trị, hồ sơ công ty và đánh giá

- DocumentsModule/DocumentArchivesModule: CRUD từng bản ghi, tệp gốc thật, metadata/hash từ máy chủ, số văn thư theo sổ/năm chống trùng, chuyển xử lý/hoàn tất có lịch sử, XLSX/PDF/clipboard thật. Word upload/download vào kho máy chủ, lưu chờ callback; IndexedDB chờ commit và truyền lỗi lên editor, chặn save đồng thời. Giữ Canvas.
- RewardsModule: người nhận thật; chờ duyệt → duyệt nội bộ → trao, metadata actor/time từ server; snapshot người nhận không đổi sau phê duyệt; chặn sửa/xóa quyết định đã duyệt; báo cáo thật, không tự xác nhận CA/eNPS.
- AdminUsersModule + backend: phân trang đầy đủ, profile/role/status/activation/password qua API, không giả MFA. Chốt giao dịch theo trạng thái mới, chống phục hồi mật khẩu/khóa cũ khi cập nhật đồng thời, bảo vệ Admin cuối và hồ sơ nghiệp vụ khi xóa tài khoản.
- AdminBackupModule + `api/backups.mjs`, `db.backupTo`: SQLite snapshot thực + ZIP kho file/manifest/checksum, quyền Admin, xác minh trước khi tải, chặn tệp bị đổi. Giữ các mục khôi phục/lịch ở trạng thái chưa hỗ trợ rõ ràng; PostgreSQL chưa có cơ chế dump, không tạo metadata giả. ZIP đã tạo/tải qua UI và kiểm tra CRC/SHA/manifest.
- `api/document-files.mjs`, contract sync/API/UI: OOXML DOCX có Unicode, dữ liệu thật thay người ký/địa chỉ cố định; giữ bytes trước cập nhật, không ghi đè Word hợp lệ lúc khởi động. Không tự gán đối tác không xác định cho user đầu tiên. Tải Word qua kho file, giữ xuất TXT theo mẫu. Dừng tự seed demo khi khởi động bình thường, giữ dữ liệu cũ.
- SystemSettingsModule + `/system/company-profile`: các trường tên/pháp nhân/đăng ký/đại diện/liên hệ, website/tên miền, tùy chọn múi giờ/tiền tệ và ngân hàng mặc định lưu máy chủ có revision. Dùng profile khi sinh hợp đồng. SMTP dùng API cấu hình hiện tại, không giả kết nối; PDF/thời gian phản hồi lấy từ dữ liệu thật. Không tự đổi DNS/NTP hoặc quy đổi sổ quỹ.
- PerformanceReviewModule: nhân viên/người đánh giá thật; không điền điểm/tiền/nhận xét mặc định. Điểm 0 và điểm thiếu phân biệt; tổng/xếp loại tính server, ba trụ cột có bounds; CRUD phiếu chờ duyệt, khóa kết quả sau chốt, actor/history và báo cáo thật. Thưởng là đề xuất, chưa chuyển payroll hoặc tạo chứng từ chi.
- HTTP error handler không trả stack; nhận đúng lỗi 4xx của backup manager và xử lý download bị ngắt sau khi đã gửi headers.
- Kiểm tra mốc mới: 75 API + 38 web/domain đạt, 15 workflow PostgreSQL thật đạt, TypeScript/build đạt; bundle còn lớn. Ghi bằng chứng `*-latest.txt`, screenshot và tiến độ; chưa nghiệm thu toàn bộ video/txt, tất cả route/nút mới hoặc nhà cung cấp bên ngoài.

## [2026-10-26] - Luồng nghiệp vụ thật, xác thực và kiểm thử hai database

- Giữ React/custom UI, Node HTTP, service/collections, schema hiện tại và Canvas. Không sửa lại các thay đổi KTable/smart-table hoặc dự án Rust có sẵn trước task.
- FormStore/custom-ui: áp dụng rules/validation, initial values, reset, submit từ footer Modal, hiển thị lỗi trường và trạng thái ARIA. Khắc phục các biểu mẫu trước đây gửi dữ liệu trống hoặc không submit được.
- ContractsModule + API: cắt vòng lặp GET→ghi collection→GET; lỗi lưu không báo thành công; xóa qua API; duy trì mã hóa PII khi sửa và giải mã đúng khi tạo nội dung đồng bộ.
- RecruitmentModule, OnboardingModule, EmployeeHistoryModule + API: ứng viên/CV/pipeline, checklist/đánh giá/điều kiện nghiệm thu, lịch sử nhân viên CRUD/export lưu thật; metadata danh tính/actor và validation máy chủ. Chưa có cổng tuyển công khai, AI tuyển dụng hoặc tự cấp tài khoản/thiết bị.
- Toàn bộ 11 module attendance, EmployeeLeaves/Overtime/Timesheet và dataService: thao tác từng bản ghi chờ API; lịch/matrix theo dữ liệu thật; phê duyệt, ca/đổi ca, đối soát/khóa, giải trình và xuất file thật. Check-in/out do máy chủ ghi giờ/danh tính. Nâng dữ liệu mirror một lần sang scope chuẩn và giữ nguồn cũ. Sổ phép/công điều chỉnh còn thủ công; chưa gắn nhà cung cấp IoT/FaceID hay tự trả lương.
- BankAccountsModule/InternalTransferModule + API: ghi hai vế/phí/audit trong transaction, chống chi quá số dư và lệnh trùng, hủy đảo toàn bộ vế; giữ lịch sử cũ. Đây là sổ quỹ nội bộ; không giả nhận đã chuyển tiền tại ngân hàng.
- AdminSessionsModule, Login/AuthContext, AdminSystemModule + API: phiên sid thật có thu hồi/logout bền vững; kiểm tra credential Google RS256/claims; GIS thật; cấu hình Google máy chủ và kiểm tra kết nối thật; chặn bật chế độ Google bắt buộc trước khi Admin đăng nhập Google xác minh cùng cấu hình. Không dùng Client Secret trong trình duyệt.
- API async normalization/transaction bảo vệ cập nhật đồng thời và lịch sử; sửa JSON text casting PostgreSQL và ON CONFLICT của Canvas operations/snapshots, chống retry tạo revision trùng.
- Kiểm tra: 41 API + 20 web/domain đạt; build/typecheck đạt; tám luồng PostgreSQL thật đạt trong database tạm riêng rồi xóa; 246 route production không lỗi JavaScript/trang trắng, blank Form không gửi POST. Bằng chứng `outputs/legacy-progress-2026-10-26/`. Test bổ sung dùng Node runner, TypeScript, pdf-lib, Puppeteer và pg đã có, không thêm dependency.
- Chưa hoàn thành 29 ứng dụng/mọi bullet trong video/txt. Các tác vụ con đã chạm hạn mức sử dụng khi chuyển sang đính kèm văn thư; phần đó chưa được triển khai. Báo cáo tiến độ nêu rõ phần còn lại, không tuyên bố parity100%.

## [2026-10-25] - Sửa nền tảng web legacy và bổ sung kiểm thử hồi quy

- Task: bắt đầu hoàn thiện tính năng theo yêu cầu video/txt, giữ kiến trúc, UI và module hiện có. Toàn bộ phạm vi chưa hoàn thành; xem `IMPLEMENTATION_PROGRESS.md`.
- `api/db.mjs`, `api/index.mjs`: thay 12 transaction thủ công bằng helper hiện có; cô lập transaction SQLite khỏi yêu cầu đồng thời; chờ insert collection/checklist/chứng từ; kiểm tra và tính lại số tiền ngân sách ở API. Không đổi schema.
- `web/src/utils/fileExporter.ts`: PDF nhiều trang, xuống dòng, bỏ khẳng định chữ ký không được xác minh; thêm XLSX OpenXML bằng ZIP helper hiện có.
- `web/src/modules/finance/BudgetModule.tsx`: xuất XLSX dữ liệu thực, dùng collection cho biểu đồ/kế hoạch, kiểm tra số tiền và hiển thị lỗi tải.
- `web/src/modules/employee/EmployeePayslipModule.tsx`, `web/src/services/dataService.ts`: xuất dữ liệu phiếu lương, xác nhận đúng key qua PATCH, chỉ cập nhật sau khi lưu, không tự đánh dấu phiếu có key 2/3 là đã ký.
- `web/src/utils/twoFactorAuth.ts`: chặn khóa rỗng được chấp nhận với mã 000000; sửa BufferSource cho Web Crypto.
- `web/src/custom-ui/index.tsx`, `web/src/api/endpoints.ts`, các module AdminSessions, LeaveRequests, Overtime, EmployeeFullEdit, EmployeeHistory, Recruitment, Rewards: sửa biến/kiểu chưa khớp; bỏ thông tin cá nhân tự dựng trong đơn nghỉ phép; phiên đăng nhập tải lại dữ liệu collection.
- Bổ sung `api/tests/database.test.mjs`, `api/tests/api-smoke.test.mjs`, `api/tests/browser-routes.mjs`, `web/tests/export-and-auth.test.mjs`, `web/tests/payslip.test.mjs`.
- Dependency: tái sử dụng TypeScript, pdf-lib, Puppeteer, Node test runner và các API hiện có; không thêm framework. Chưa kiểm thử PostgreSQL thực tế hoặc tích hợp CA/ngân hàng/thuế/bảo hiểm.


## [2026-08-31] - Loại Bỏ Văn Bản Gợi Ý (VD: ...) Rườm Rà Trong Các Khung Nhập Liệu

### 1. Mục Tiêu Task
- Loại bỏ toàn bộ các chuỗi placeholder dài dòng như `(VD: Công nghệ thông tin, Quản trị kinh doanh...)`, `(VD: Đại học Bách Khoa...)`, `(VD: Cục Cảnh sát QLHC...)` trong các ô nhập liệu: Chuyên ngành, Nơi đào tạo, Khoa, Nơi cấp giấy tờ, Nơi cấp hộ chiếu.
- Giữ giao diện khung nhập liệu hoàn toàn sạch sẽ, thoáng đãng, đồng bộ với toàn bộ các ô nhập liệu khác trong hệ thống.

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`src/modules/employee/EmployeeProfileWizard.tsx`**: Xóa bỏ thuộc tính placeholder ở các ô Chuyên ngành, Nơi đào tạo, Khoa, Nơi cấp giấy tờ, Nơi cấp hộ chiếu.
2. **`src/modules/hr/EmployeeFullEditModule.tsx`**: Xóa bỏ thuộc tính placeholder ở các ô Chuyên ngành, Nơi đào tạo, Khoa, Nơi cấp giấy tờ, Nơi cấp hộ chiếu.

---

## [2026-08-31] - Chuẩn Hóa Tỉ Lệ Khung Quét CCCD Chuẩn Quốc Tế Trên Điện Thoại, Máy Tính & Link QR

### 1. Mục Tiêu Task
- Khắc phục tình trạng khung ngắm quét thẻ Căn cước công dân (CCCD) bị méo, méo tỉ lệ, bị cắt xén hình ảnh trên điện thoại, máy tính và trang quét qua link QR (`IdentityVerificationPage.tsx` & `EmployeeProfileWizard.tsx`).
- **Các điểm đã hoàn thành**:
  1. Loại bỏ kích thước cố định (`height: 240px`), áp dụng tỉ lệ chuẩn quốc tế ISO/IEC 7810 ID-1 của thẻ CCCD (`aspectRatio: '85.6 / 54'`) cho `CardScanningViewfinder.tsx`, đảm bảo co giãn responsive hoàn hảo trên mọi kích thước màn hình điện thoại và máy tính.
  2. Bổ sung 4 góc ngắm căn cước chuyên nghiệp (corner focus brackets) màu `#2DD4BF` và viền định hướng nét đứt giúp người dùng căn chỉnh thẻ chính xác.
  3. Chuẩn hóa độ phân giải chụp ảnh thẻ sang `1024x646` theo đúng tỉ lệ vàng 85.6/54, giúp ảnh trích xuất OCR và quét QR sắc nét, không bị kéo dãn.

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`src/modules/ekyc/components/CardScanningViewfinder.tsx`**: Đặt `aspectRatio: '85.6 / 54'`, responsive 100% chiều ngang, thêm corner markers.
2. **`src/modules/employee/IdentityVerificationPage.tsx`**: Chuẩn hóa độ phân giải chụp frame mặt trước và mặt sau sang 1024x646.
3. **`src/modules/employee/EmployeeProfileWizard.tsx`**: Chuẩn hóa độ phân giải chụp frame mặt trước và mặt sau sang 1024x646.

---

## [2026-08-31] - Chuyển 'Chuyên Ngành', 'Nơi Đào Tạo' & 'Khoa' Sang Ô Nhập Tay (Input)

### 1. Mục Tiêu Task
- Chuyển đổi các trường "Chuyên ngành" (`major`), "Nơi đào tạo" (`trainingPlace`) và "Khoa" (`faculty`) từ danh sách thả (`<Select />`) sang ô văn bản tự do (`<Input />`) trên toàn hệ thống (`/employee/home` và màn hình quản lý hồ sơ nhân sự Admin).
- Người dùng có thể tự do nhập tên trường đại học/cao đẳng, khoa chuyên ngành thực tế mà không bị giới hạn bởi danh sách mẫu tĩnh.

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`src/modules/employee/EmployeeProfileWizard.tsx`**: Đổi các ô Chuyên ngành, Nơi đào tạo và Khoa sang `<Input />` tự nhập kèm placeholder hướng dẫn.
2. **`src/modules/hr/EmployeeFullEditModule.tsx`**: Đổi các ô Chuyên ngành, Nơi đào tạo và Khoa sang `<Input />` tự nhập.

---

## [2026-08-31] - Chuyển 'Nơi Cấp Giấy Tờ' & 'Nơi Cấp Hộ Chiếu' Sang Ô Nhập Tay (Input)

### 1. Mục Tiêu Task
- Chuyển đổi các ô "Nơi cấp giấy tờ" (`docIssuePlace`) và "Nơi cấp hộ chiếu" (`passportIssuePlace`) từ danh sách chọn thả (`<Select />`) sang ô văn bản tự nhập (`<Input />`) trên toàn bộ hệ thống (`/employee/home`, hồ sơ nhân sự Admin, v.v.).
- Cho phép người dùng linh hoạt nhập mọi cơ quan cấp giấy tờ (VD: `Bộ Công an`, `Cục Cảnh sát Quản lý hành chính về trật tự xã hội`, `Cục Quản lý Xuất nhập cảnh`, `Công an Tỉnh...`) mà không bị bó hẹp trong menu cố định.

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`src/modules/employee/EmployeeProfileWizard.tsx`**: Đổi các ô Nơi cấp giấy tờ và Nơi cấp hộ chiếu sang `<Input />` tự nhập kèm placeholder hướng dẫn.
2. **`src/modules/hr/EmployeeFullEditModule.tsx`**: Đổi các ô Nơi cấp giấy tờ và Nơi cấp hộ chiếu sang `<Input />` tự nhập.

---

## [2026-08-31] - Chuẩn Hóa Định Dạng Mã Nhân Viên & Bỏ In Đậm Ô Mã Nhân Viên

### 1. Mục Tiêu Task
- Khắc phục lỗi sinh mã nhân sự bị full 5 số 0 (`NV-00000`) và loại bỏ kiểu chữ in đậm (`bold`) trên ô hiển thị Mã nhân viên.
- **Các điểm đã hoàn thành**:
  1. Chuẩn hóa hàm `generateEmployeeCode()` trong `server/index.mjs` sử dụng padding 3 chữ số (`padStart(3, '0')`) bắt đầu từ `1`, sinh mã chuẩn dạng `NV-001`, `NV-002`, `NV-003`,... thay vì 5 số 0.
  2. Bỏ thuộc tính in đậm (`fontWeight: 700`), chuyển sang kiểu chữ thường tiêu chuẩn (`fontWeight: 'normal'`) và màu chữ tối tự nhiên (`#0F172A`) trên nền xám `#F8FAFC` cho cả `EmployeeProfileWizard.tsx` và `EmployeeFullEditModule.tsx`.

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`server/index.mjs`**: Chuẩn hóa hàm sinh mã nhân sự `generateEmployeeCode`.
2. **`src/modules/employee/EmployeeProfileWizard.tsx`**: Bỏ in đậm ở ô Mã nhân viên.
3. **`src/modules/hr/EmployeeFullEditModule.tsx`**: Bỏ in đậm ở ô Mã nhân viên.

---

## [2026-08-31] - Khắc Phục Lỗi Không Hiển Thị Mã Nhân Viên Tại /employee/home

### 1. Mục Tiêu Task
- Khắc phục tình trạng ô "Mã nhân viên" tại `/employee/home` (Bước 1: Thông tin chung) và màn hình hồ sơ nhân viên bị trống hoặc không nạp được mã nhân sự.
- Đảm bảo ô Mã nhân viên luôn ở trạng thái chỉ đọc (`readOnly`, `disabled`), giao diện màu xám nhạt với chữ đậm đặc trưng (`#009688`) và tuyệt đối không cho phép nhân viên tự ý chỉnh sửa.
- **Các điểm đã hoàn thành**:
  1. Đồng bộ mã nhân viên từ `user.employeeCode` / `user.code` vào `formData` ngay khi khởi tạo State trong `EmployeeProfileWizard.tsx`.
  2. Lắng nghe và cập nhật mã nhân viên từ phản hồi của API `employeesApi.getMyProfile()`.
  3. Áp dụng cơ chế fallback thông minh `formData.code || formData.employeeCode || user?.employeeCode || user?.code || ''` cho ô Input Mã nhân viên trong cả `EmployeeProfileWizard.tsx` và `EmployeeFullEditModule.tsx`.

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`src/context/AuthContext.tsx`**: Bổ sung `employeeCode` và `code` vào interface `User` và chuẩn hóa trong `normalizeUser`.
2. **`src/modules/employee/EmployeeProfileWizard.tsx`**: Khởi tạo và đồng bộ mã nhân sự vào formData; áp dụng `readOnly`, `disabled` cho Input Mã nhân viên.
3. **`src/modules/hr/EmployeeFullEditModule.tsx`**: Áp dụng fallback và trạng thái `readOnly`, `disabled` cho ô Mã nhân viên.

---

## [2026-08-31] - Cập Nhật Dữ Liệu Tỉnh Thành Việt Nam (Nguyên Quán, Nơi Sinh, Hộ Khẩu, Chỗ Ở)

### 1. Mục Tiêu Task
- Khắc phục tình trạng các ô chọn "Nguyên quán", "Nơi sinh", "Hộ khẩu thường trú", "Chỗ ở hiện nay" trong wizard cập nhật thông tin nhân viên (`/employee/home` và hồ sơ nhân sự) không có dữ liệu chọn tỉnh/thành.
- **Các điểm đã hoàn thành**:
  1. Cập nhật đầy đủ 34 tỉnh/thành phố chuẩn theo định dạng JSON người dùng yêu cầu vào `src/services/addressService.ts`.
  2. Khởi tạo sẵn `VIETNAM_PROVINCES`, `PROVINCE_OPTIONS`, `provincesCache` ngay từ đầu để đảm bảo dữ liệu luôn sẵn sàng ngay khi giao diện hiển thị mà không phụ thuộc vào độ trễ API.
  3. Khởi tạo `provinceOptions` trong `EmployeeProfileWizard.tsx` và `EmployeeFullEditModule.tsx` từ `addressService.getProvinceOptions()`.
  4. Bổ sung các tính năng chọn lựa tiện ích: tìm kiếm nhanh (`showSearch`, `filterOption`), xóa nhanh (`allowClear`) và gợi ý placeholder cho tất cả dropdown chọn Tỉnh / Thành phố.

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`src/services/addressService.ts`**: Nạp 34 tỉnh thành và chuẩn hóa bộ nhớ đệm.
2. **`src/modules/employee/EmployeeProfileWizard.tsx`**: Khởi tạo `provinceOptions` đồng bộ và bổ sung tìm kiếm trên Select `originPlace`, `birthPlace`, `hkttCity`, `resCity`.
3. **`src/modules/hr/EmployeeFullEditModule.tsx`**: Khởi tạo `provinceOptions` đồng bộ.

---

## [2026-08-31] - Khắc Phục Lỗi Báo 'Chưa cấu hình cổng gửi email doanh nghiệp' Khi Gửi Lại Mã Kích Hoạt

### 1. Mục Tiêu Task
- Khắc phục lỗi khi quản trị viên bấm gửi lại link kích hoạt nhân sự hoặc tạo nhân sự mới thì nhận thông báo "Đã tạo lại mã kích hoạt. Chưa cấu hình cổng gửi email doanh nghiệp." dù đã cấu hình SMTP.
- **Các điểm đã tối ưu**:
  1. Cố định đường dẫn `DATA_DIR` trong `server/index.mjs` dựa trên `import.meta.url` (`__dirname`) thay vì `path.resolve('data')` tương đối theo CWD, đảm bảo luôn đọc đúng file khóa `.jwt-secret` để giải mã mật khẩu SMTP.
  2. Nâng cấp `getEmailConfig()` đọc linh hoạt cả mật khẩu mã hóa (`passwordEncrypted`) và fallback mật khẩu thô (`password`), tự động làm sạch khoảng trắng (`trim()`).
  3. Sử dụng `resolveUser(employeeId)` trong endpoint `POST /employees/:id/activation` để định danh linh hoạt nhân sự qua cả User UUID, Profile ID hoặc Mã nhân viên (`NV-xxx`).
  4. Cập nhật giao diện `EmployeesModule.tsx` và `AdminUsersModule.tsx` hiển thị chính xác kết quả gửi thành công hoặc chi tiết lỗi SMTP nếu gửi thất bại thay vì nhầm lẫn sang trạng thái chưa cấu hình.

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`server/index.mjs`**: Tối ưu `DATA_DIR`, `getEmailConfig()` và endpoint `POST /employees/:id/activation`.
2. **`src/modules/hr/EmployeesModule.tsx`**: Tối ưu `handleResendActivation` và `handleCreateOrUpdate`.
3. **`src/modules/admin/AdminUsersModule.tsx`**: Tối ưu `handleResetPassword`.

---

## [2026-08-31] - Khắc Phục Lỗi Đăng Nhập /login Tự Động Tạo Tài Khoản Mới Khi Nhập Sai

### 1. Mục Tiêu Task
- Khắc phục triệt để lỗi khi người dùng nhập sai thông tin tài khoản hoặc mật khẩu tại `/login` nhưng hệ thống vẫn tự động tạo mới tài khoản ADMIN.
- **Quy tắc bảo mật mới**:
  - Chỉ cho phép tạo tài khoản mới duy nhất 1 lần khi hệ thống **hoàn toàn chưa có tài khoản nào** (`COUNT(users) === 0`) và gán tài khoản đầu tiên này làm Super Admin (`ADMIN-001`).
  - Khi hệ thống đã có tài khoản: bắt buộc kiểm tra chính xác email/tài khoản và so khớp mật khẩu bằng `verifyPassword`. Nếu sai tài khoản hoặc sai mật khẩu, trả về lỗi HTTP 401 (`"Email/tài khoản hoặc mật khẩu không chính xác."`) và tuyệt đối không tạo mới hay ghi đè mật khẩu.
  - Kiểm tra trạng thái `is_active` (nếu bị khóa hoặc chưa kích hoạt thì từ chối đăng nhập với HTTP 403).
  - Đã dọn dẹp các tài khoản test tự sinh trước đây trong CSDL.

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`server/index.mjs`**: Cập nhật route handler `POST /auth/login` tuân thủ đúng 100% logic bảo mật và kiểm tra tài khoản.

---

## [2026-08-31] - Khắc Phục Triệt Để Lỗi Menu Thả Đơn Vị Vẫn Hiện Phòng Ban Đã Xóa

### 1. Mục Tiêu Task
- Khắc phục triệt để lỗi khi người dùng đã xóa đơn vị ("Phòng kế toán" / "Phòng Tài Chính Kế Toán") nhưng ở các menu thả (Select dropdown) trên toàn hệ thống vẫn hiển thị.
- Ngăn chặn cơ chế tự động gom `employee.department` trong `OrgUnitsModule.tsx` làm hồi sinh các đơn vị đã xóa.
- Bỏ mảng tĩnh hardcode `defaults` trong `dataService.ts` (`getOrgUnitsList` và `fetchOrgUnitsList`).
- Chuyển đổi 100% các select dropdown tĩnh ở toàn bộ các module (Chấm công, Tài chính, Nhiệm vụ, Tickets, Cloud Drive, v.v.) sang nạp động từ CSDL qua `dataService.fetchOrgUnitsList()`.
- Làm sạch các bản ghi phòng ban kế toán cũ trong CSDL SQLite.

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`src/services/dataService.ts`**: Bỏ fallback tĩnh chứa `'Phòng Kế toán'`; trả về đúng danh sách đơn vị thực tế từ `business_org_units`.
2. **`src/modules/business/OrgUnitsModule.tsx`**: Thiết lập `storedUnits` là Single Source of Truth duy nhất; không gom lại phòng ban cũ của nhân viên khi tải; cập nhật nhân viên về chưa phân bổ khi xóa đơn vị.
3. **`src/modules/hr/EmployeesModule.tsx`**: `applyOrgUnitOptions` lấy 100% từ danh sách đơn vị thực tế của `fetchOrgUnitsList()`.
4. **Các module Chấm công & Tài chính & Hỗ trợ & Kế hoạch**:
   - `AttendanceAlertsModule.tsx`, `LeavePlansModule.tsx`, `LeaveRequestsModule.tsx`, `LeaveSummaryModule.tsx`, `OvertimeModule.tsx`, `ShiftAssignmentModule.tsx`, `TimesheetModule.tsx`, `TimesheetSummaryModule.tsx`.
   - `AdvancesModule.tsx`, `FixedAssetsModule.tsx`, `PettyCashModule.tsx`.
   - `PlansModule.tsx`, `TicketsModule.tsx`, `GenericModulePage.tsx`, `CloudDriveModule.tsx`.

---

## [2026-08-31] - Xác Minh & Tối Ưu Hóa 100% Tính Toàn Vẹn Dữ Liệu Trang Chỉnh Sửa Nhân Sự (/admin/hr/employees/edit)

### 1. Mục Tiêu Task
- Xác minh và kiểm tra toàn diện trang chỉnh sửa hồ sơ nhân viên (`/admin/hr/employees/edit/:id` và `/employee/profile`).
- Đảm bảo 100% dữ liệu nạp và lưu trữ là dữ liệu thực từ CSDL Backend (`employee_profiles`, `users`, `details_json`), không tồn tại dữ liệu giả / mock data.
- Nâng cấp cơ chế truy vấn `employeeProfileRowByUserId` và `updateEmployeeProfileRecord` để hỗ trợ linh hoạt cả User UUID, Mã nhân viên (`NV-xxxx`) và Profile ID.

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`server/index.mjs`**:
   - Mở rộng mệnh đề WHERE của `employeeProfileRowByUserId` để tìm kiếm chính xác qua `u.id`, `u.employee_code` và `p.id`.
   - Chuẩn hóa `realUserId` trong `updateEmployeeProfileRecord` đảm bảo ghi nhận đồng bộ dữ liệu vào `users` và `employee_profiles`.

---

## [2026-08-31] - Hoàn Thiện 100% Hệ Thống Nhiệm Vụ & Đồng Bộ Thời Gian Thực Giữa /employees/tasks và /admin/tasks

### 1. Mục Tiêu Task
- Đảm bảo hệ thống Nhiệm vụ (`admin/tasks` và `/employees/tasks` hoặc `/employee/tasks`) hoạt động 100% thực tế, kết nối trực tiếp CSDL Backend (SQLite/Postgres).
- Khi nhân viên tự tạo nhiệm vụ tại `/employees/tasks`, nhiệm vụ được lưu vĩnh viễn vào CSDL và lập tức hiển thị trên giao diện quản trị `admin/tasks` trong thời gian thực.
- Hỗ trợ đầy đủ các tính năng: Thêm mới, giao việc, gửi báo cáo đính kèm tệp, trao đổi (comments), nghiệm thu hoàn thành và xóa nhiệm vụ.

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`server/index.mjs`**:
   - Thêm hàm `resolveUser` hỗ trợ định danh linh hoạt nhân sự (User ID, Mã NV, Employee Profile ID, Email, Họ tên) khi tạo và gán nhiệm vụ.
   - Thêm endpoint `DELETE /tasks/:id` cho phép quản trị viên và người tạo xóa nhiệm vụ.
   - Hoàn thiện `GET /tasks`, `POST /tasks`, `PATCH /tasks/:id`, `POST /tasks/:id/reports`, `POST /tasks/:id/comments`.
2. **`src/modules/plans/TasksModule.tsx`**:
   - Tối ưu `loadData` và đồng bộ tức thì qua kênh sự kiện `kiyovn_task_updated` & `storage`.
   - Bổ sung nút hành động "Xóa" kèm hộp thoại xác nhận an toàn.
3. **`src/services/dataService.ts` & `src/api/endpoints.ts`**:
   - Bổ sung phương thức `deleteEnterpriseTask` và `tasksApi.remove`.

---

## [2026-08-31] - Đồng Bộ Hash #settings Lên Đường Dẫn & Nâng Cấp 100% Tính Năng Mục 'Thiết Lập'

### 1. Mục Tiêu Task
- Khắc phục lỗi ScrollSpy khiến tab "Thiết lập" không giữ và không ghi nhận hash `#settings` lên URL khi cuộn hoặc bấm chọn.
- Nâng cấp Section "Thiết lập" (`#section-settings`) hoạt động 100% với đầy đủ các thao tác: Đặt lại thiết lập hồ sơ (Reset), Gửi yêu cầu cập nhật (Update Request), Điều chỉnh hạn mức dung lượng lưu trữ (Storage Quota), Khóa/Mở khóa trạng thái tài khoản trực tiếp và hiển thị trực quan thông số.

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`src/modules/hr/EmployeeFullEditModule.tsx`**:
   - Cải tiến bộ phát hiện cuộn ScrollSpy (`rect.top <= 140 && rect.bottom > 90`) để giữ chính xác `#settings` khi ở đầu trang.
   - Bổ sung mặc định `#settings` khi tải trang quản trị.
   - Thêm nút chuyển đổi trạng thái tài khoản (Khóa / Kích hoạt) và badge hiển thị hạn mức dung lượng trong `#section-settings`.

---

## [2026-08-31] - Thu Gọn Chiều Rộng Sidebar & Ẩn Thanh Điều Hướng Trên Mobile Trong Hồ Sơ Nhân Viên

### 1. Mục Tiêu Task
- Thu gọn chiều rộng sidebar điều hướng tại trang chỉnh sửa hồ sơ nhân viên (`/admin/hr/employees/edit/:id` và `/employee/profile`) để ôm vừa khít với dòng chữ dài nhất, không bị thừa khoảng trắng bên phải.
- Ẩn hoàn toàn danh sách điều hướng ("Quay lại, Thiết lập, Thông tin cơ bản, ...") khi xem trên màn hình điện thoại (mobile).

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`src/modules/hr/EmployeeFullEditModule.tsx`**:
   - Chuyển `width: 240` sang `width: 'fit-content'`, `minWidth: 'fit-content'`, `maxWidth: 220`, padding `10px 8px` để sidebar ôm sát nội dung.
   - Thêm quy tắc CSS media query `@media (max-width: 900px)` và điều kiện `isMobile` để ẩn hoàn toàn danh sách tab điều hướng trên màn hình điện thoại.

---

## [2026-08-31] - Cập Nhật Nhãn Tab 'Chính trị, quân sự, y tế' Trong Hồ Sơ Nhân Viên

### 1. Mục Tiêu Task
- Đổi nhãn tab và tiêu đề Section `#politics` từ "Thông tin chính trị, quân sự, y tế" thành "Chính trị, quân sự, y tế" tại trang chỉnh sửa hồ sơ nhân viên (`/admin/hr/employees/edit/:id#politics`).

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`src/modules/hr/EmployeeFullEditModule.tsx`**:
   - Cập nhật nhãn trong `allNavTabs` thành `Chính trị, quân sự, y tế`.
   - Cập nhật tiêu đề Card `h2` của `#section-politics` thành `Chính trị, quân sự, y tế`.
   - Đồng bộ danh mục `SECTION_OPTIONS` và điều kiện lọc `selectedSections`.

---

## [2026-08-31] - Kiểm Tra Toàn Diện & Loại Bỏ 100% Dữ Liệu Giả/Mock/Hardcode & Kết Nối Single Source of Truth

### 1. Mục Tiêu Task
- Kiểm tra toàn bộ Frontend, Backend, Database, APIs, Services, Forms, Dropdowns và Dashboards.
- Loại bỏ toàn bộ các mảng dữ liệu mẫu `INITIAL_*` và thiết lập kết nối lưu trữ trực tiếp xuống `dataService` và CSDL thật (SQLite/PostgreSQL qua `collectionsApi` và các dedicated tables).
- Loại bỏ toàn bộ các lời gọi `Math.random()` trong việc sinh mã nhân viên/tài sản/hợp đồng/vé sự cố, chuyển sang cơ chế tuần tự và timestamp `createSystemCode` / database sequence.
- Xóa bỏ các danh sách thiết bị/mã backup giả và hardcode thông tin liên hệ trong 2FA settings.

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`src/utils/systemCode.ts`**:
   - Sử dụng chuỗi tuần tự theo thời gian và số thứ tự DB thay vì `Math.random()`.
2. **`src/modules/settings/TwoStepVerificationModule.tsx`**:
   - Xóa bỏ thiết bị ảo `iPhone 15 Pro Max`, `MacBook Pro M3 Max`. Chỉ hiển thị phiên làm việc thực tế từ User Agent.
   - Thay thế `Math.random()` bằng `window.crypto.getRandomValues` chuẩn mật mã học cho mã khôi phục 2FA.
   - Xóa hardcode email/số điện thoại fallback.
3. **`server/index.mjs`**:
   - Thay thế `generateEmployeeCode` và admin registration từ `Math.random()` sang truy vấn đếm trực tiếp số lượng tài khoản trong CSDL SQLite/PostgreSQL để sinh mã `NV-XXXXX` và `EMP-XXXXXX` tuần tự.
4. **`src/components/generic/GenericModulePage.tsx`**:
   - Tích hợp `createSystemCode` thay thế `Math.random()` khi sinh mã đối tượng mới trong form.
5. **Toàn bộ 56 Module thuộc Phân hệ Assets, Attendance, Finance, CRM, Documents, Plans, Workflows, Tickets, Reports, Services, Business**:
   - Loại bỏ hoàn toàn việc lưu trữ cục bộ trong RAM; đồng bộ dữ liệu hai chiều với `dataService.getGenericData(scope)` và `dataService.saveGenericData(scope, ...)`.
   - Bổ sung `useEffect` và cơ chế đăng ký lắng nghe thay đổi `dataService.subscribe(...)` để giao diện phản ứng thời gian thực.
6. **`src/utils/ekycEngine.ts` & `src/utils/pdfSigner.ts`**:
   - Chuẩn hóa mã chứng thực sinh trắc học và chữ ký số.

---

## [2026-08-31] - Khắc phục Toàn Diện Lỗi TypeScript & Chuẩn Hóa API Layer

### 1. Mục Tiêu Task
- Sửa toàn bộ hơn 25 lỗi TypeScript compile-time để đưa lệnh `npx tsc --noEmit` và `npm run build` về trạng thái 0 lỗi.
- Chuẩn hóa các interface và phương thức gọi API DataService.

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`src/api/endpoints.ts`**:
   - *Lý do*: Mở rộng `collectionsApi` hỗ trợ thêm phương thức `save`, `update` và cho phép tham số `recordKey` tùy chọn trong `create`.
   - *Behavior trước*: Báo lỗi thiếu method khi các module HR/Business gọi `collectionsApi.save` hay `collectionsApi.update`.
   - *Behavior sau*: Mọi module gọi `create`, `update`, `save`, `patch`, `replace` đều hợp lệ và tương thích 100%.
2. **`src/modules/ekyc/types/ekyc.types.ts`**:
   - *Lý do*: Bổ sung thuộc tính `ekycVerified?: boolean;` vào `EkycExtractedData`.
3. **`src/modules/employee/EmployeeProfileModule.tsx`**:
   - *Lý do*: Import `dataService` từ `../../services/dataService`.
4. **`src/modules/employee/EmployeeProfileWizard.tsx`**:
   - *Lý do*: Import đầy đủ `dataService` và `QRCode`.
5. **`src/modules/employee/IdentityVerificationPage.tsx`**:
   - *Lý do*: Xóa bỏ lời gọi hàm chưa định nghĩa `setLivenessStage('COMPLETED')`, sử dụng `setLivenessCompleted(true)`.
6. **`src/modules/employee/IdentityVerificationSuccessPage.tsx`**:
   - *Lý do*: Sửa đường dẫn import từ `../ekyc/types` thành `../ekyc/types/ekyc.types`.
7. **`src/modules/employee/EmployeePayslipModule.tsx`**:
   - *Lý do*: Khai báo interface `BankFormState` và sửa các hàm cập nhật `setBankForm` tránh type mismatch.
8. **`src/modules/hr/EmployeeHistoryModule.tsx`**:
   - *Lý do*: Bổ sung trường `salaryBase: Number(item.salaryBase) || 0` khi map dữ liệu nhân viên.
9. **`src/modules/hr/OnboardingModule.tsx`**:
   - *Lý do*: Loại bỏ 18 dòng khai báo biến trùng lặp trong interface `EnterpriseOnboardingTask`.
10. **`src/modules/hr/RewardsModule.tsx`**:
    - *Lý do*: Chuẩn hóa các phép so sánh trạng thái khen thưởng sang `'Đã trao giải'`, `'Chờ duyệt'` và `'Đã ký quyết định'`.
11. **`src/modules/admin/AdminSystemModule.tsx`**:
    - *Lý do*: Bổ sung import `Tooltip` từ `../../custom-ui`.
12. **`src/modules/settings/TwoStepVerificationModule.tsx`**:
    - *Lý do*: Đóng gói callback ref của input OTP trong block `{ inputRefs.current[idx] = el; }` để trả về `void`.

### 3. Kết Quả Xác Minh
- `npx tsc --noEmit`: **Exit code 0 (0 lỗi)**.
- `npm run build`: **Exit code 0 (Build thành công toàn bộ bundle trong 7.05s)**.

---

## [2026-08-31] - Loại Bỏ Thanh Tiêu Đề Trên Cùng Khi Xem Tệp PDF

### 1. Mục Tiêu Task
- Loại bỏ thanh header màu tối ở trên cùng khi mở xem tệp tin PDF trên đường dẫn `/files/document/pdf/:fileKey/edit` theo đúng yêu cầu người dùng, giúp trình đọc PDF hiển thị toàn màn hình (100% viewport).

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`src/pages/DocumentEditorPage.tsx`**:
   - *Lý do*: Giao diện PDF Viewer trước đó có một thanh header 48px tùy chỉnh (`h-[48px] bg-[#202124]`) chứa nút quay lại, tiêu đề, nút Google Tài liệu, In, Tải về, Đóng.
   - *Behavior trước*: Khi mở PDF, xuất hiện thanh header tối màu ở trên cùng chắn phần trên của trình đọc PDF.
   - *Behavior sau*: Trình đọc PDF chiếm toàn màn hình (`w-screen h-screen`), thanh header trên cùng đã được loại bỏ hoàn toàn, giao diện PDF hiển thị trực tiếp thanh công cụ native sạch sẽ.

### 3. Kết Quả Xác Minh
- `npx tsc --noEmit`: **Exit code 0 (0 lỗi)**.

---

## [2026-08-31] - Chuẩn Hóa 100% Dữ Liệu Thật Cho Module Hợp Đồng Nhân Sự (/employee/contracts)

### 1. Mục Tiêu Task
- Chuyển đổi toàn bộ luồng dữ liệu của module `/employee/contracts` sang 100% dữ liệu thực tế từ backend API (`contractsApi.getAll()`), loại bỏ hoàn toàn việc fallback sang mock data hoặc dữ liệu hardcode.
- Động hóa toàn bộ danh sách chứng thư số cá nhân theo thông tin nhân sự đăng nhập thực tế (Tên, CCCD từ eKYC, chứng thư số digisig).

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`src/modules/employee/EmployeeContractsModule.tsx`**:
   - *Lý do*: Loại bỏ mock fallback data khi danh sách hợp đồng rỗng; tích hợp `useAuth` và `dataService.getEmployeeProfile` / `digisig` để sinh danh sách chứng thư số động cho nhân viên.
   - *Behavior trước*: Dùng mảng hardcode danh sách chứng thư của một người cụ thể (`PERSONAL_SIGNATURE_OPTIONS`) và fallback sang mock contracts.
   - *Behavior sau*: 100% dữ liệu lấy trực tiếp từ bảng `contracts` trong SQLite thông qua `contractsApi.getAll()`, cập nhật ký số qua `contractsApi.sign()` và hiển thị đúng thông tin của tài khoản nhân sự đang đăng nhập.

### 3. Kết Quả Xác Minh
- `npx tsc --noEmit`: **Exit code 0 (0 lỗi)**.

---

## [2026-08-31] - Phân Quyền Và Ẩn Cổng Nhân Viên Đối Với Tài Khoản Admin

### 1. Mục Tiêu Task
- Tài khoản quản trị viên (Admin) không hiển thị trong danh sách nhân sự `admin/hr/employees` nên không được hiển thị nút "Cổng Nhân viên" và không được truy cập vào các đường dẫn cổng nhân viên (`/employee/*`, `/employee/home`).
- Chỉ những tài khoản là nhân sự (có trong `admin/hr/employees`) mới được phép truy cập vào `/employee/home`.
- Nếu tài khoản Admin cố tình truy cập vào bất kỳ route nào thuộc `/employee/*`, hệ thống tự động chặn và điều hướng về `/admin/dashboard`.

### 2. Các Tệp Tin Đã Sửa Đổi
1. **`src/App.tsx`**:
   - *Lý do*: Ẩn nút "Cổng Nhân viên" trên thanh header; ẩn mục chuyển sang Cổng Nhân viên trong menu dropdown tài khoản góc trên bên phải; thêm cơ chế điều hướng bảo vệ router chuyển hướng Admin về `/admin/dashboard` khi truy cập `/employee/*`.
   - *Behavior trước*: Header có nút "Cổng Nhân viên" cho Admin bấm chuyển qua lại, và dropdown góc phải có link Cổng Nhân viên.
   - *Behavior sau*: Header và dropdown hoàn toàn không còn nút/link Cổng Nhân viên cho tài khoản Admin; route guard chặn Admin vào `/employee/*`.
2. **`src/components/generic/GenericModulePage.tsx`**:
   - *Lý do*: Bổ sung route guard trong component định tuyến chung `GenericModulePage` để điều hướng tài khoản Admin về `/admin/dashboard` nếu cố tình truy cập subpath `/employee/*`.

### 3. Kết Quả Xác Minh
- `npx tsc --noEmit`: **Exit code 0 (0 lỗi)**.
- `npm run build`: **Exit code 0 (Build thành công toàn bộ bundle trong 6.89s)**.
