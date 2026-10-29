# 10. Ma trận 70 ca kiểm thử được yêu cầu

## Cách đọc trạng thái

70 ca dưới đây là phạm vi E2E bắt buộc trong prompt. Không có ca nào được chạy đầu-cuối với dữ liệu, kỳ và expected result độc lập; vì vậy toàn bộ ghi **NOT RUN E2E**, không đánh đồng với test unit tương tự. Các bộ test hiện có chạy riêng trên dữ liệu tạm: 155 web, 127 API, 189 Rust server và 436 UI Rust, tất cả PASS. Một số assertion hẹp có liên quan được ghi chú.

| ID | Nghiệp vụ | Trạng thái E2E | Ghi chú về bằng chứng |
|---|---|---|---|
| TC01 | Góp vốn bằng tiền mặt | NOT RUN | Chưa có bộ dữ liệu profile/tài khoản kỳ |
| TC02 | Góp vốn qua ngân hàng | NOT RUN | Không kiểm tra sổ/đối chiếu thật |
| TC03 | Thu tiền bán hàng | NOT RUN | API chứng từ/tiền không chứng minh GL |
| TC04 | Bán hàng chưa thu tiền | NOT RUN | Chưa kiểm tra công nợ và báo cáo |
| TC05 | Mua hàng trả ngay | NOT RUN | Chưa kiểm tra thuế/chi phí/tiền |
| TC06 | Mua hàng chưa thanh toán | NOT RUN | Chưa kiểm tra AP và kỳ |
| TC07 | Thanh toán một phần công nợ | NOT RUN | Chưa kiểm tra phân bổ thanh toán |
| TC08 | Thanh toán toàn bộ công nợ | NOT RUN | Chưa kiểm tra số dư sau thanh toán |
| TC09 | Khách hàng thanh toán thừa | NOT RUN | Chưa kiểm tra khoản trả thừa/hoàn/đối trừ |
| TC10 | Hoàn tiền cho khách | NOT RUN | Chưa kiểm tra reversal và liên kết gốc |
| TC11 | Hóa đơn GTGT có thuế | NOT RUN | Không có E2E thuế + hóa đơn + GL |
| TC12 | Hàng hóa không chịu thuế | NOT RUN | Không xác minh phân loại hàng hóa |
| TC13 | Hàng hóa thuế suất 0% | NOT RUN | Không xác minh điều kiện áp dụng |
| TC14 | Hàng hóa thuộc diện giảm thuế | NOT RUN | Không xác minh hàng, kỳ, văn bản giảm thuế |
| TC15 | Hóa đơn nhiều mức thuế suất | NOT RUN | Không test tính thuế theo từng dòng |
| TC16 | Hóa đơn điều chỉnh | NOT RUN | Không xác minh luồng CQT/provider |
| TC17 | Hóa đơn thay thế | NOT RUN | Không xác minh quan hệ hóa đơn gốc |
| TC18 | Hóa đơn xử lý sai sót | NOT RUN | Không xác minh báo sai/thay thế/hủy |
| TC19 | Kê khai GTGT theo kỳ | NOT RUN | Không có E2E tính và lập tờ khai |
| TC20 | Điều chỉnh dữ liệu kê khai | NOT RUN | Không kiểm tra lưu phiên bản |
| TC21 | Tính thuế TNDN | NOT RUN | Không có dữ liệu tax-adjustment chuẩn |
| TC22 | Giảm thuế TNDN khi đủ điều kiện | NOT RUN | Không xác minh điều kiện NQ 43 |
| TC23 | Không ưu đãi khi không đủ điều kiện | NOT RUN | Không có rule/negative test đủ |
| TC24 | Tính thuế TNCN | NOT RUN | Không kiểm tra Luật 109/NQ110 và payroll |
| TC25 | Quyết toán TNCN | NOT RUN | Không chạy quyết toán/tờ khai |
| TC26 | So sánh giao dịch 2025 và 2026 | NOT RUN | Không xác minh rule theo ngày hiệu lực |
| TC27 | Tính lương | NOT RUN | Có test API payroll hẹp, không phải E2E luật/lương |
| TC28 | Tạm ứng lương | NOT RUN | Không kiểm tra settlement payroll |
| TC29 | Tính/phân bổ bảo hiểm | NOT RUN | Không đối chiếu BHXH/BHYT/BHTN |
| TC30 | Nhân viên nghỉ việc | NOT RUN | Không kiểm tra chốt lương, bảo hiểm, PIT |
| TC31 | Mua tài sản cố định | NOT RUN | Không kiểm tra chứng từ và GL |
| TC32 | Tính khấu hao | NOT RUN | Không xác minh phương pháp/lịch khấu hao |
| TC33 | Điều chuyển tài sản | NOT RUN | Không kiểm tra owner/location/history |
| TC34 | Thanh lý tài sản | NOT RUN | Không kiểm tra giá trị còn lại/thuế |
| TC35 | Mua công cụ dụng cụ | NOT RUN | Không kiểm tra phân loại |
| TC36 | Phân bổ công cụ dụng cụ | NOT RUN | Không kiểm tra lịch và bút toán |
| TC37 | Kiểm kê tài sản | NOT RUN | Không đối chiếu thực tế |
| TC38 | Xử lý chênh lệch kiểm kê | NOT RUN | Không kiểm tra phê duyệt/định khoản |
| TC39 | Tạo bút toán cân đối | NOT RUN | Có unit test tổng hợp nhưng không tạo journal E2E |
| TC40 | Cố tình tạo bút toán mất cân đối | NOT RUN | Chưa có kiểm thử API chặn |
| TC41 | Định khoản tài khoản không tồn tại | NOT RUN | Chưa có chart of accounts validator |
| TC42 | Ghi sổ vào kỳ khóa | NOT RUN | Chưa xác minh period lock |
| TC43 | Điều chỉnh bút toán đã ghi sổ | NOT RUN | Chưa kiểm tra reversal/approval |
| TC44 | Kết chuyển doanh thu | NOT RUN | Có unit test số học hẹp |
| TC45 | Kết chuyển chi phí | NOT RUN | Có unit test số học hẹp |
| TC46 | Xác định kết quả kinh doanh | NOT RUN | Chưa có GL/report reconcile |
| TC47 | Khóa sổ cuối năm | NOT RUN | Chưa có E2E đóng kỳ nguyên tử |
| TC48 | Chuyển số dư đầu năm | NOT RUN | Không có kiểm tra bút toán opening |
| TC49 | Lập báo cáo tài chính | NOT RUN | B01/B02/B03 hiện không được chứng minh statutory |
| TC50 | Đối chiếu báo cáo với sổ cái | NOT RUN | Chưa có report reconciliation test |
| TC51 | Gửi request trùng liên tục | NOT RUN | Transfer API có idempotency test, hẹp hơn TC end-to-end |
| TC52 | Hai người cùng sửa chứng từ | NOT RUN | Chưa có optimistic locking/conflict E2E |
| TC53 | API mất kết nối giữa transaction | NOT RUN | Transfer test inject lỗi DB; không giả lập network mất kết nối toàn luồng |
| TC54 | Database rollback | NOT RUN | Transfer test rollback khi lỗi insert, chỉ một API |
| TC55 | Người dùng vượt quyền | NOT RUN | Có test quyền transfer; chưa bao phủ mọi module |
| TC56 | Sửa tiền trực tiếp qua API | NOT RUN | Không chạy negative test trên mọi route |
| TC57 | Xóa chứng từ đã liên kết | NOT RUN | Chưa kiểm tra referential integrity |
| TC58 | Giả mạo trạng thái duyệt | NOT RUN | Chưa kiểm tra server-side approval policy |
| TC59 | Truy cập dữ liệu công ty khác | NOT RUN | Chưa có tenant-isolation E2E |
| TC60 | Nhập số tiền cực lớn | NOT RUN | Transfer có boundary test; không toàn hệ thống |
| TC61 | Số âm không hợp lệ | NOT RUN | Transfer/cash validation có test hẹp |
| TC62 | Ngày sai | NOT RUN | Transfer validation có test hẹp |
| TC63 | Sai kỳ kế toán | NOT RUN | Không có period engine test |
| TC64 | Sai định dạng tiền | NOT RUN | Chưa test parser/locale toàn luồng |
| TC65 | Lỗi làm tròn | NOT RUN | Không có kiểm thử độc lập mọi phép tính |
| TC66 | Khôi phục dữ liệu | NOT RUN | Không truy cập backup/restore |
| TC67 | Audit log | NOT RUN | Transfer/payroll có event; chưa kiểm tra bao phủ/toàn vẹn tổng thể |
| TC68 | Xuất báo cáo sau điều chỉnh | NOT RUN | Không kiểm tra phiên bản hóa/rebuild report |
| TC69 | Bút toán tự động từ nghiệp vụ | NOT RUN | Cash side-effect tồn tại; không test GL mapping |
| TC70 | Toàn vẹn dữ liệu chạy đồng thời | NOT RUN | Transfer concurrency test hẹp; không liên phân hệ |

## Kết quả kiểm thử đã chạy

| Bộ kiểm thử | Kết quả |
|---|---:|
| legacy/web npm test | 155 passed, 0 failed |
| legacy/api npm test | 127 passed, 0 failed |
| cargo test --workspace | server 189 passed; UI 436 passed; các crate còn lại 0 test |
| Tổng test có assertions | 907 passed, 0 failed |
| legacy/web npm run typecheck | Exit 0 |
| legacy/web npm run build | Exit 0; có warning bundle lớn |

**Tỷ lệ test repository đạt:** 907/907 = 100% của các test đã chạy.
**Bao phủ 70 ca E2E:** 0/70 = 0% thực thi.
**Tỷ lệ pass 70 ca:** N/A vì chưa chạy; không được đổi thành 0% pass hoặc 100% pass.

Không chạy test PostgreSQL vì script đó đọc cấu hình môi trường .env; không chạy với database/credential không được cấp để xác nhận là môi trường thử nghiệm.
