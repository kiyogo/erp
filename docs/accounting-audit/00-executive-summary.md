# Kết quả kiểm toán hệ thống kế toán

**Ngày chốt pháp luật:** 29/10/2026
**Repository:** apwdnt, nhánh main
**Commit nền khi kiểm toán:** 8c2355f9028b79ff89cfc51110d1a77d008f1505
**Phạm vi:** toàn repository, trọng tâm nghiệp vụ tài chính/kế toán của web cũ và ứng dụng Rust hiện tại.
**Kết luận:** **CHƯA ĐỦ BẰNG CHỨNG để sử dụng ghi sổ doanh nghiệp thật; các luồng sổ cái, báo cáo, thuế và hóa đơn điện tử hiện không đạt yêu cầu kiểm toán nghiệp vụ.**

## Kết quả định lượng có thể kiểm chứng

| Chỉ số | Kết quả | Cách hiểu |
|---|---:|---|
| Màn hình tài chính web cũ tìm thấy | 26 | Sự hiện diện của màn hình không đồng nghĩa nghiệp vụ hoàn tất. |
| Test tự động repository chạy thành công | 907/907 | Web cũ 155, API cũ 127, Rust server 189, UI Rust 436. Đây không phải 907 ca kế toán đầu-cuối. |
| Typecheck web cũ | Đạt | npm run typecheck kết thúc mã 0. |
| Build production web cũ | Đạt | npm run build kết thúc mã 0; Vite cảnh báo bundle lớn. |
| 70 kịch bản đầu-cuối bắt buộc trong yêu cầu | 0/70 chạy đầu-cuối | Tỷ lệ thực thi bộ kịch bản này là 0%; 70 ca chưa có kết quả PASS/FAIL. |
| Tỷ lệ thành công của 70 ca | Chưa tính được | Chưa chạy ca nào; không diễn giải thành 0% lỗi hay 100% đạt. |
| Điểm hoàn thành nghiệp vụ kế toán tổng thể | Không chấm phần trăm | Thiếu hồ sơ doanh nghiệp, tiêu chí áp dụng, dữ liệu đối chiếu và E2E. |
| Điểm tuân thủ pháp luật | Không chấm phần trăm | Chưa xác định chế độ, đối tượng, kỳ tài chính và dữ liệu thật; không thể suy ra từ mã nguồn. |

## Bảng tổng quan phân hệ

| Nhóm | Hiện trạng đã xác minh | Đánh giá |
|---|---|---|
| Thu/chi, tài khoản ngân hàng, chuyển khoản nội bộ | Có một số API và bảng chuyên biệt; chuyển khoản có giao dịch nguyên tử, chống gửi lặp, audit và test. Trạng thái chuyển khoản được ghi là ledger_only. | Một phần |
| Bán hàng, mua hàng, chứng từ thanh toán | Có luồng chứng từ và một số tự động tạo giao dịch tiền; chưa thấy liên kết chuẩn từ mọi nghiệp vụ sang sổ cái kép. | Một phần |
| Sổ cái | Ghi qua collection JSON; UI lưu mỗi dòng Nợ/Có và kiểm tra cân đối trên tổng toàn collection, không ràng buộc từng bút toán. | Không đạt |
| Kết chuyển và báo cáo tài chính | Kết chuyển tạo nhiều bản ghi riêng; báo cáo B01/B02/B03 là tổng hợp/heuristic trên dòng dữ liệu, không phải bộ báo cáo chuẩn đã đối chiếu sổ. | Không đạt |
| Thuế | Có màn hình/biểu mẫu minh họa và lưu bản ghi chung; nút “đã nộp” chỉ đổi state trên UI. | Không đạt |
| Hóa đơn điện tử | Tạo dữ liệu trong collection nhưng UI thông báo đã phát hành/ký; không thấy giao tiếp nhà cung cấp/CQT trong luồng này. | Không đạt |
| Tài sản, chi phí trả trước, vay, vốn, dự toán và dự báo | Có màn hình; nhiều luồng lưu dữ liệu chung hoặc chỉ thông báo thành công. Chưa chứng minh được tính toán và định khoản kế toán. | Một phần/không đủ bằng chứng |
| Ứng dụng Rust | Có API có cấu trúc cho tiền mặt, tài khoản ngân hàng, chuyển khoản; nhiều trang thuế, sổ cái, hóa đơn và báo cáo chỉ là trang tĩnh/chưa có API nghiệp vụ. | Một phần |

## Kết luận sử dụng

| Mục tiêu | Kết luận |
|---|---|
| Chạy thử giao diện nội bộ bằng dữ liệu giả | **CHƯA ĐỦ BẰNG CHỨNG**: chưa kiểm tra ứng dụng đang triển khai trên môi trường của doanh nghiệp. |
| Nhập dữ liệu kế toán thật | **KHÔNG ĐẠT**: thiếu sổ cái có kiểm soát và chưa xác minh tính toàn vẹn đầu-cuối. |
| Ghi sổ kế toán chính thức | **KHÔNG ĐẠT**: không có bằng chứng về danh mục tài khoản/kỳ khóa/định khoản cân bằng theo từng chứng từ. |
| Lập báo cáo tài chính chính xác | **KHÔNG ĐẠT**: đầu ra hiện có không được chứng minh là báo cáo theo chế độ áp dụng và không đối chiếu sổ. |
| Tính, nộp và quyết toán thuế | **KHÔNG ĐẠT**: không có bộ quy tắc đã xác minh cho kỳ 2026 và không có tích hợp thực tế được kiểm tra. |
| Vận hành doanh nghiệp | **CHƯA ĐỦ BẰNG CHỨNG**: chưa có nghiệm thu người dùng, bảo mật, sao lưu/khôi phục hoặc chạy thử môi trường thật. |

Không phát hiện bằng chứng về một giao dịch tiền thật bị thực hiện trong cuộc kiểm toán. Nguy cơ được xác định là người dùng có thể tin vào trạng thái thành công giả, báo cáo sai hoặc dữ liệu kế toán không truy vết được. Không truy cập database production, không phát hành hóa đơn, không gửi tờ khai và không thực hiện giao dịch ngân hàng.

## Các báo cáo

- [01. Kiểm kê hệ thống](01-system-inventory.md)
- [02. Tuân thủ pháp luật](02-legal-compliance.md)
- [03. Kiểm toán chức năng kế toán](03-accounting-functional-audit.md)
- [04. Kiểm toán frontend](04-frontend-audit.md)
- [05. Kiểm toán backend/API](05-backend-api-audit.md)
- [06. Toàn vẹn dữ liệu](06-database-integrity.md)
- [07. Thuế và hóa đơn](07-tax-invoice-audit.md)
- [08. Báo cáo tài chính](08-financial-reports-audit.md)
- [09. Bảo mật và phân quyền](09-security-permissions.md)
- [10. Danh mục 70 ca kiểm thử](10-test-cases.md)
- [11. Danh sách phát hiện](11-defects.md)
- [12. Tính năng còn thiếu](12-missing-features.md)
- [13. Lộ trình khắc phục](13-improvement-roadmap.md)
- [14. Điểm số và phương pháp tính](14-final-score.md)
- [15. Nguồn pháp luật](15-legal-sources.md)
