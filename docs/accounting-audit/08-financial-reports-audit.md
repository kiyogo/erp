# 08. Kiểm toán báo cáo tài chính

## Các đầu ra tìm thấy

[GeneralLedgerModule.tsx](../../legacy/web/src/modules/finance/GeneralLedgerModule.tsx#L143-L153) tạo ba kiểu đầu ra có tên B01, B02 và B03:

| Mã hiển thị | Công thức quan sát được | Đánh giá |
|---|---|---|
| B01 | Tổng hợp biến động theo tài khoản | Không thấy map chỉ tiêu và số đầu kỳ/cuối kỳ theo mẫu báo cáo của chế độ áp dụng |
| B02 | Ước tính doanh thu/chi phí theo tiền tố tài khoản; helper cộng nhóm tài khoản đầu 5/7 và 6/8 | Heuristic, không thay cho báo cáo kết quả hoạt động kinh doanh |
| B03 | Tổng hợp tài khoản tiền | Không chứng minh là lưu chuyển tiền tệ theo phương pháp/biểu mẫu quy định |

Kết chuyển quý cũng dựa vào helper [ledgerCalculations.ts](../../legacy/web/src/modules/finance/ledgerCalculations.ts#L12-L92), chọn quý dương lịch và tạo dòng kết chuyển theo quy tắc prefix. Không có danh mục tài khoản theo chế độ hoặc test đối chiếu báo cáo chuẩn với bảng cân đối phát sinh.

## Kiểm tra bắt buộc còn thiếu

- Báo cáo tình hình tài chính/bảng cân đối, kết quả hoạt động, lưu chuyển tiền tệ, thuyết minh đúng mẫu/chế độ.
- Số đầu kỳ, phát sinh kỳ, số cuối kỳ và bảng cân đối phát sinh phải đối chiếu từng tài khoản.
- Thuyết minh, phân loại ngắn/dài hạn, thuế hiện hành/hoãn lại, ngoại tệ và giao dịch liên quan nếu áp dụng.
- Kết chuyển doanh thu/chi phí và khóa kỳ phải có bút toán có thể truy vết, phê duyệt và rollback nguyên tử.
- So sánh số báo cáo với sổ chi tiết, công nợ, ngân hàng, tồn kho, tài sản và payroll.
- Kiểm thử sửa chứng từ sau khi báo cáo lập; báo cáo mới phải tái lập và lưu phiên bản.

## Kết luận

**Không đạt để phát hành báo cáo tài chính chính thức.** Số liệu hiện có thể chỉ dùng như dashboard nội bộ sau khi được xác nhận nguồn và thuật toán. Không có bộ dữ liệu kế toán chuẩn để chạy tính toán độc lập nên không đưa kết luận về sai lệch số tiền thực.
