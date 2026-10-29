# 12. Tính năng còn thiếu hoặc chưa được chứng minh

| STT | Tính năng | Vì sao cần | Bằng chứng hiện trạng | Ưu tiên |
|---:|---|---|---|---|
| 1 | Hồ sơ pháp lý/kế toán doanh nghiệp và lựa chọn chế độ theo kỳ | Chọn đúng chart, biểu mẫu và rule | Chưa có profile đủ để xác định | P0 |
| 2 | Danh mục tài khoản theo chế độ, phiên bản và cấp tài khoản | Hạch toán có kiểm soát | GL nhận chuỗi account trong payload | P0 |
| 3 | Journal header/lines và kiểm tra cân đối từng bút toán | Ngăn sai sổ | GL generic JSON; cân đối frontend tổng collection | P0 |
| 4 | Period close/lock/reopen có phê duyệt và nhật ký | Chặn ghi sai kỳ | Chưa xác minh trong API | P0 |
| 5 | Quy trình chứng từ → duyệt → ghi sổ → reversal | Truy vết, segregation of duties | Nhiều nút chỉ lưu/toast | P0 |
| 6 | Idempotency và unique source key thống nhất cho mọi nguồn | Chống ghi trùng | Chỉ có ở một số workflow riêng | P1 |
| 7 | Mapping đơn hàng/hóa đơn/công nợ/thu tiền sang GL | Không bỏ sót doanh thu/công nợ | Chưa chứng minh tích hợp tổng quát | P1 |
| 8 | Mapping mua hàng/thuế đầu vào/tồn kho/chi phí/tài sản sang GL | Hạch toán chi phí/thuế đúng | Chưa có chuỗi E2E | P1 |
| 9 | Quản lý tài sản, khấu hao, thanh lý và lịch phân bổ | Tính giá trị/chi phí theo kỳ | Module UI/generic data | P1 |
| 10 | Engine thuế GTGT, TNDN, TNCN có luật/kỳ/đối tượng versioned | Tính thuế theo thời điểm | Không có kết quả được xác minh | P0 |
| 11 | E-invoice provider/CQT, ký số, phản hồi, thay thế/điều chỉnh/hủy | Trạng thái pháp lý thật | Generic save và toast | P0 |
| 12 | Báo cáo tài chính statutory theo regime và reconcile | Công bố/nộp báo cáo chính xác | Đầu ra heuristic | P0 |
| 13 | Bank statement import/reconcile và đối chiếu ngân hàng | Soát tiền thực tế | Một số thao tác file chưa chứng minh parse/reconcile | P1 |
| 14 | Audit trail thống nhất, append-only và export truy vết | Điều tra, kiểm soát nội bộ | Event tồn tại ở một số route | P1 |
| 15 | Tenant/company scoping chứng minh được trên mọi query | Không lộ/sửa dữ liệu chéo công ty | Chưa chạy isolation test | P0 |
| 16 | Backup/restore và DR được kiểm thử | Khôi phục dữ liệu sổ | Không có kiểm tra thực tế | P1 |
| 17 | E2E 70 tình huống trên test data cô lập | Chứng minh luồng dữ liệu và kết quả độc lập | 0/70 chạy end-to-end | P0 |
| 18 | Quản lý chứng thư số, quyền ký, lưu file XML/PDF có hash | Bằng chứng hóa đơn/chứng từ | Chưa có bằng chứng CA và retention | P1 |

Ưu tiên P0 ở đây là điều kiện chặn sử dụng sổ thật; không phải khẳng định có lỗi production cấp P0. Chi tiết thứ tự phụ thuộc tại [13. Lộ trình](13-improvement-roadmap.md).
