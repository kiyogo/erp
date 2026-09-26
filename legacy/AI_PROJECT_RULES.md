# QUY TẮC BẮT BUỘC KHI LÀM VIỆC VỚI DỰ ÁN NÀY

Bạn đang làm việc trên một dự án lớn, đã tồn tại nhiều module, nhiều API, nhiều database table, nhiều component và nhiều dependency.
Bạn **KHÔNG** được xử lý dự án này như một project mới.

---

## 1. NGUYÊN TẮC QUAN TRỌNG NHẤT
Trước khi viết hoặc sửa bất kỳ code nào:
1. Đọc `AI_PROJECT_RULES.md`.
2. Đọc `ARCHITECTURE.md`.
3. Đọc `PROJECT_STRUCTURE.md`.
4. Đọc `CURRENT_STATE.md`.
5. Nếu liên quan database, đọc `DATABASE_SCHEMA.md`.
6. Nếu liên quan API, đọc `API_CONTRACT.md`.
7. Tìm toàn bộ code hiện tại liên quan đến chức năng cần sửa.
8. Xác định dependency của code đó.
9. Chỉ sau khi hiểu cấu trúc hiện tại mới được sửa code.
10. **KHÔNG** được tự suy đoán rằng một tính năng chưa tồn tại chỉ vì bạn chưa nhìn thấy nó.
11. **Phải SEARCH toàn project trước.**

---

## 2. CẤM TỰ Ý THAY ĐỔI KIẾN TRÚC
Không được:
- Tự tạo architecture mới;
- Tự thay đổi folder structure;
- Tự đổi tên module;
- Tự đổi tên API;
- Tự đổi database schema;
- Tự thêm framework khác;
- Tự thay state-management system;
- Tự tạo service mới nếu đã có service tương đương;
- Tự duplicate logic;
- Tự tạo component mới nếu component hiện tại có thể mở rộng;
- Tự viết lại toàn bộ một module chỉ để sửa một lỗi nhỏ.

*Nếu kiến trúc hiện tại có vấn đề, KHÔNG tự sửa. Hãy giữ nguyên kiến trúc hiện tại và sửa trong phạm vi task.*

---

## 3. LUÔN ƯU TIÊN CODE ĐÃ CÓ
Trước khi tạo: `function`, `class`, `component`, `service`, `repository`, `hook`, `helper`, `utility`, `API`, `model`, `database query` -> **phải tìm xem project đã có thứ tương đương chưa**.
- Nếu đã có thì sử dụng hoặc mở rộng nó.
- **KHÔNG duplicate.**

*Ví dụ sai*: `getUser()` đã tồn tại nhưng lại tạo thêm `fetchUserData()`, `loadUser()`, `getUserInfo()` chỉ để làm cùng một việc.

---

## 4. KHÔNG ĐƯỢC FAKE DATA
Toàn bộ dữ liệu thật phải lấy từ nguồn dữ liệu thật của hệ thống.
Không được:
- Hardcode user;
- Hardcode document;
- Hardcode notification;
- Hardcode statistics;
- Hardcode dashboard;
- Hardcode API response;
- Fake array;
- Mock data trong production;
- Random data;
- Placeholder data giả làm dữ liệu thật.

*Nếu API hoặc database chưa có dữ liệu: hiển thị empty state đúng nghĩa. KHÔNG tự tạo dữ liệu giả.*

---

## 5. KHÔNG ĐƯỢC PHÁ UI HIỆN TẠI
Nếu task không yêu cầu thay đổi giao diện: **KHÔNG được thay đổi giao diện.**
Không được tự ý đổi: `width`, `height`, `margin`, `padding`, `font`, `font-size`, `font-weight`, `border`, `radius`, `position`, `spacing`, `icon`, màu sắc, responsive breakpoint, `layout`, `animation`.

*Chỉ sửa đúng phần được yêu cầu.*

---

## 6. MỌI THAY ĐỔI PHẢI CÓ PHẠM VI
Trước khi sửa hãy xác định:
- **TASK**: Mục tiêu cần đạt.
- **FILES INVOLVED**: Những file thực sự liên quan.
- **DEPENDENCIES**: Những module phụ thuộc.
- **DO NOT TOUCH**: Những phần không được thay đổi.
- **EXPECTED RESULT**: Kết quả sau khi sửa.

*Sau đó mới bắt đầu sửa code.*

---

## 7. KHÔNG ĐƯỢC SỬA KIỂU CHỮA CHÁY
Không dùng workaround nếu có thể sửa nguyên nhân gốc.
*Ví dụ*: Nếu biến không tồn tại: không được thêm biến global ngẫu nhiên để hết error.
Phải tìm:
- Biến trước đây nằm ở đâu;
- State nào quản lý nó;
- Component nào sở hữu state;
- Function nào cần truyền nó;
- Commit/refactor nào làm mất nó.
*Sau đó sửa đúng root cause.*

---

## 8. PHẢI KIỂM TRA LUỒNG CODE
Khi sửa một chức năng, phải xem cả luồng:
```
UI ↓ state ↓ service ↓ API ↓ controller ↓ business logic ↓ repository ↓ database
```
- Không được chỉ nhìn UI rồi đoán backend.
- Không được chỉ nhìn backend rồi đoán frontend.

---

## 9. KHÔNG TỰ Ý XÓA CODE
Không xóa code chỉ vì nghĩ rằng: *"không dùng"*, *"legacy"*, *"redundant"*, *"có thể đơn giản hóa"*.
- Trước khi xóa phải search references toàn project.
- Nếu chưa chắc chắn thì giữ nguyên.

---

## 10. KHÔNG ĐƯỢC VIẾT LẠI FILE KHÔNG CẦN THIẾT
Nếu cần sửa 10 dòng: **không được rewrite file 2.000 dòng.**
- Ưu tiên patch nhỏ nhất có thể.
- Minimal change.
- Maximum compatibility.

---

## 11. GIỮ BACKWARD COMPATIBILITY
Code mới phải tương thích với:
- Dữ liệu cũ;
- API cũ;
- Database hiện tại;
- Cấu hình hiện tại;
- Module hiện tại;
- Client hiện tại;
*(trừ khi task nói rõ cần migration).*

---

## 12. PHẢI KIỂM TRA TRƯỚC KHI KẾT THÚC
Sau khi sửa, Search lại code để kiểm tra:
- Duplicate;
- Unresolved import;
- Undefined variable;
- Dead reference;
- Wrong API route;
- Wrong database field;
- Syntax error;
- Type error;
- Missing dependency.

Nếu project có build, lint, typecheck, test -> **hãy chạy chúng**.
*Không được nói "đã xong" nếu build đang lỗi.*

---

## 13. KHÔNG ĐƯỢC BỎ TÍNH NĂNG CŨ
Khi thêm tính năng mới: tất cả tính năng cũ phải tiếp tục hoạt động.
Không được giải quyết task bằng cách disable hoặc remove functionality khác.

---

## 14. GHI LẠI NHỮNG GÌ ĐÃ THAY ĐỔI
Sau mỗi task cập nhật: `CHANGELOG_AI.md`
Ghi rõ:
- Ngày;
- Task;
- File đã sửa;
- Lý do;
- Behavior trước;
- Behavior sau;
- Dependency liên quan.
*Sau đó cập nhật `CURRENT_STATE.md` nếu kiến thức về hệ thống thay đổi.*

---

## 15. CURRENT_STATE.md LÀ BỘ NHỚ CỦA DỰ ÁN
Không phụ thuộc vào memory của cuộc trò chuyện. Mọi thông tin quan trọng phải nằm trong project:
- Module hiện tại hoạt động như thế nào;
- API nào đang sử dụng;
- Database table nào liên quan;
- Những bug đã xử lý;
- Những quyết định kiến trúc;
- Những thứ tuyệt đối không được thay đổi;
- Những phần chưa hoàn thành.
*Một AI session mới phải có thể hiểu project chỉ bằng cách đọc các file này.*

---

## 16. NẾU KHÔNG CHẮC
- Không được tự bịa.
- Không được giả định.
- Search codebase.
- Đọc implementation hiện tại.
- Đọc type/interface/schema.
- Đọc call sites.
- Đọc API.
- Đọc database.
*Sau đó mới đưa ra quyết định.*

---

## 17. QUY TẮC CUỐI CÙNG
Mục tiêu không phải là: *"Làm cho task hiện tại chạy."*
Mục tiêu là: **"Làm cho task hiện tại chạy đúng trong kiến trúc hiện có mà không phá bất kỳ tính năng nào khác."**

Codebase hiện tại là nguồn sự thật. Conversation history **KHÔNG** phải nguồn sự thật.
Luôn: **SEARCH → READ → UNDERSTAND → PLAN → PATCH → VERIFY.**
