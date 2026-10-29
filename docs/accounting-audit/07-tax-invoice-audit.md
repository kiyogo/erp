# 07. Thuế và hóa đơn điện tử

## Thuế

[TaxModule.tsx](../../legacy/web/src/modules/finance/TaxModule.tsx#L35-L90) tải và lưu finance_tax trong generic collection. Tạo hồ sơ được ghi như dữ liệu ứng dụng. handlePayTax chỉ đổi state tại component và đưa thông báo thành công; không thấy gửi giao dịch hoặc cập nhật trạng thái server. Các nút đăng ký sắc thuế, xuất biểu mẫu, đồng bộ lịch và tạo lệnh nộp có thông báo/info nhưng không có lời gọi integration tương ứng trong luồng đã đọc.

Màn hình chứa kỳ, mã, mức và tình trạng mẫu tĩnh. Không thấy rule engine theo version pháp luật/kỳ, tính GTGT đầu vào/ra, chuyển tiếp, quyết toán TNDN/TNCN hoặc payload khai nộp có thể gửi cơ quan thuế. Vì vậy không dùng số liệu UI làm căn cứ khai thuế.

## Hóa đơn điện tử

[EInvoiceModule.tsx](../../legacy/web/src/modules/finance/EInvoiceModule.tsx#L38-L82) tải và lưu finance_einvoices ở collection chung. Luồng tạo có thể hiển thị trạng thái đã phát hành/ký dù trong handler chỉ thêm dữ liệu nội bộ. Các thao tác ký/hủy, mẫu, tra cứu CQT, export và PDF có nhiều nút toast/preview không chứng minh đã gọi provider hoặc CQT.

Chưa xác minh:

- cấu hình người bán, mẫu/ký hiệu và mã CQT thật;
- ký bằng chứng thư số/CA, timestamp, chuỗi truyền nhận;
- phát hành, nhận kết quả, retry/idempotency, điều chỉnh/thay thế/hủy;
- lưu XML/PDF gốc, payload, chữ ký, response và chứng từ liên quan;
- đối soát trạng thái pháp lý và xử lý lỗi nhà cung cấp.

## Pháp luật có liên quan tại ngày chốt

Luật Quản lý thuế 108/2025/QH15, NĐ 252/2026/NĐ-CP, TT 89/2026/TT-BTC cùng văn bản đính chính 2551/QĐ-BTC có hiệu lực trong bộ nguồn rà soát. Hóa đơn/chứng từ điện tử năm 2026 cần kiểm tra theo NĐ 254/2026/NĐ-CP và TT 91/2026/TT-BTC; không giả định quy trình NĐ123/2020 và sửa đổi 70/2025 là đủ cho mọi giao dịch 2026.

GTGT/TNDN/TNCN có thay đổi 2025–2026; thuế suất/ưu đãi phụ thuộc loại giao dịch, thời điểm, người nộp thuế, điều kiện và chuyển tiếp. Cấu hình doanh nghiệp và chứng từ chưa được cung cấp; kết luận từng tờ khai cụ thể là chưa thể xác định.

## Kết luận

**Không đạt để tính, ký, phát hành, nộp hoặc quyết toán thuế/hóa đơn thực tế.** Chỉ có thể đánh giá giao diện/dữ liệu minh họa. Không phát hành hóa đơn hoặc gửi dữ liệu lên CQT trong cuộc kiểm toán.
