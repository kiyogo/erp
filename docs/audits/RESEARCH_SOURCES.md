# TÀI LIỆU NGHIÊN CỨU VÀ NGUỒN ĐỐI CHIẾU NGOÀI (RESEARCH SOURCES)

Tài liệu này lưu trữ toàn bộ các nguồn nghiên cứu độc lập trên Internet, các tiêu chuẩn ngành, đặc tả quốc tế và benchmark đối thủ được sử dụng để kiểm toán hệ thống KIYOVN Web Legacy.

---

## I. DANH MỤC NGUỒN TRA CỨU ĐÃ ĐƯỢC XÁC MINH

| STT | Nguồn tra cứu | Tổ chức / Tác giả | URL | Ngày công bố / Cập nhật | Phiên bản | Điểm liên quan trực tiếp đến dự án |
|:---:|---|---|---|:---:|:---:|---|
| 1 | **OWASP Top 10 API Security Risks (2023)** | OWASP Foundation | [https://owasp.org/API-Security/editions/2023/en/0x11-t10/](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) | 2023 | 2023 Final | Tiêu chuẩn BOLA (API1), BFLA (API5), Broken Authentication (API2), Rate Limiting (API4) áp dụng vào `legacy/api/index.mjs`. |
| 2 | **RFC 6238 - TOTP: Time-Based One-Time Password Algorithm** | Internet Engineering Task Force (IETF) | [https://datatracker.ietf.org/doc/html/rfc6238](https://datatracker.ietf.org/doc/html/rfc6238) | May 2011 | RFC Standard | Thuật toán mã hóa OTP thời gian thực, bước nhảy 30 giây, HMAC-SHA1/SHA256, dung sai trôi đồng hồ trong `twoFactorAuth.ts`. |
| 3 | **ISO/IEC 29500 - Office Open XML File Formats (WordprocessingML & Packaging)** | ISO / IEC JTC 1/SC 34 | [https://www.iso.org/standard/71691.html](https://www.iso.org/standard/71691.html) | 2021 Edition | ISO/IEC 29500-1:2016 | Cấu trúc gói ZIP Open Packaging Conventions (OPC), `[Content_Types].xml`, `_rels/.rels` và `document.xml` trong `document-files.mjs`. |
| 4 | **NIST SP 800-63B - Digital Identity Guidelines: Authentication and Lifecycle Management** | National Institute of Standards and Technology (NIST) | [https://csrc.nist.gov/pubs/sp/800/63/b/upd1/final](https://csrc.nist.gov/pubs/sp/800/63/b/upd1/final) | March 2020 | SP 800-63B | Tiêu chuẩn độ dài mật khẩu >= 8 ký tự, Scrypt/PBKDF2/Argon2 hashing, quản lý vòng đời phiên (Session Lifecycle), thu hồi phiên tức thì. |
| 5 | **Frappe Framework & ERPNext Architecture** | Frappe Technologies / ERPNext Community | [https://frappeframework.com/docs](https://frappeframework.com/docs) & [https://erpnext.com](https://erpnext.com) | 2026 | v15 / v16 | Kiến trúc Metadata-driven DocType, Double-Entry General Ledger, Quản lý tài sản và nhân sự tự lưu trữ (Self-Hosted ERP). |
| 6 | **Odoo Community vs Enterprise Architecture** | Odoo S.A. | [https://www.odoo.com/documentation/17.0/](https://www.odoo.com/documentation/17.0/) | 2024 - 2026 | v17 / v18 | Phân tầng Open Core, cơ chế OWL JavaScript component reactive, phân hệ chấm công Timesheet, Payroll rules engine và Invoicing. |
| 7 | **RFC 5869 - HMAC-based Extract-and-Expand Key Derivation Function (HKDF)** | IETF | [https://datatracker.ietf.org/doc/html/rfc5869](https://datatracker.ietf.org/doc/html/rfc5869) | May 2010 | RFC Standard | Cơ chế phân tách khóa miền (Domain-separated key derivation) AES-256-GCM trong `crypto.mjs`. |
| 8 | **Luật Giao dịch điện tử số 20/2023/QH15 & Nghị định 130/2018/NĐ-CP** | Quốc hội Việt Nam / Chính phủ VN | [https://neac.gov.vn](https://neac.gov.vn) | Có hiệu lực 01/07/2024 | Luật hiện hành | Quy chuẩn chữ ký số, chứng thư số công cộng, dịch vụ tin cậy và lưu trữ chứng từ điện tử tại Việt Nam. |
| 9 | **Quy định đóng Bảo hiểm Xã hội, Y tế, Thất nghiệp tại Việt Nam** | Bảo hiểm Xã hội Việt Nam (VSS) | [https://baohiemxahoi.gov.vn](https://baohiemxahoi.gov.vn) | Quyết định 595/QĐ-BHXH | Hiện hành | Tỷ lệ đóng BHXH 32% (25.5% BHXH, 4.5% BHYT, 2% BHTN; Người lao động 10.5%, Người sử dụng lao động 21.5%), biểu mẫu D02-TS, mẫu C12. |

---

## II. ĐỐI CHIẾU KHOẢNG CÁCH GIỮA DỰ ÁN VÀ CÁC NỀN TẢNG ERP HÀNG ĐẦU

| Nhóm chức năng | KIYOVN Web Legacy | ERPNext (Frappe) | Odoo (Community/Enterprise) | Đánh giá khoảng cách thực tế |
|---|---|---|---|---|
| **Kiến trúc công nghệ** | Node.js HTTP Native + React 18 / Vite / TS + Dual DB (SQLite/PG) | Python (WSGI/Gunicorn) + MariaDB + Server-side Frappe JS | Python + PostgreSQL + OWL Framework | KIYOVN nhẹ, ít phụ thuộc bên ngoài; nhưng thiếu ORM metadata tự động sinh bảng như Frappe DocType. |
| **Bảo mật & Mã hóa** | AES-256-GCM phong bì bảo mật cấp trường + Scrypt + Blind Index | Mã hóa mức đĩa / DB hoặc plugin bên thứ 3 | Mã hóa mức đĩa / PostgreSQL TDE | **KIYOVN vượt trội hơn** về cơ chế bảo vệ dữ liệu nhạy cảm cục bộ nhờ AES-256-GCM domain separation. |
| **Soạn thảo văn bản** | Dual-Layer Canvas 2D Engine tự xây dựng (tương tự Google Docs) | Trình soạn thảo văn bản phong phú HTML (Quill / TinyMCE) | Trình soạn thảo HTML / WYSIWYG Odoo Editor | **KIYOVN có lợi thế in ấn và ngắt trang toán học**, nhưng chi phí bảo trì và xử lý font nặng hơn HTML chuẩn. |
| **Chữ ký số & Pháp lý** | Bộ parser X.509 / ASN.1 / CMS trong trình duyệt; chưa nối Root CA | Hỗ trợ cắm module e-Sign bên ngoài (Dropbox Sign/DocuSign) | Module Odoo Sign (chỉ có trên bản trả phí Enterprise) | KIYOVN có giao diện chuyên sâu cho VN (USB Token/Cloud CA), nhưng còn thiếu tầng xác thực mật mã hàm băm byte-range. |
| **Thời gian thực (Realtime)** | MockChatSocket (Bộ phát sự kiện cục bộ trong tab trình duyệt) | Socketio (Node.js microservice tích hợp với Redis pub/sub) | Odoo Bus Longpolling / WebSocket server | **KIYOVN bị tụt hậu rõ rệt**: Chat và thông báo realtime giữa các người dùng chưa có máy chủ WebSocket thật. |
| **Kế toán kép (Double Entry)** | Sổ cái & Chuyển quỹ nội bộ 2 vế nguyên tử; Báo cáo tài chính cơ bản | Hệ thống kế toán kép toàn diện (Full Double-Entry Bookkeeping) | Kế toán nâng cao (bị khóa sau paywall Enterprise) | KIYOVN xử lý tốt luồng tiền mặt/ngân hàng nội bộ, nhưng chưa có hệ thống định khoản tự động Nợ/Có hoàn chỉnh cho mọi nghiệp vụ mua/bán. |
| **Chấm công & Sinh trắc học** | Điểm danh camera BlazeFace + Tesseract OCR CCCD tại Client | Check-in qua cổng Web / Tích hợp máy chấm công ZKTeco qua API | App Barcode / Kiosk mode / Ứng dụng điện thoại di động | KIYOVN có eKYC hiện đại chạy trên trình duyệt, nhưng thuật toán so khớp mặt còn ở mức heuristic so sánh pixel. |
