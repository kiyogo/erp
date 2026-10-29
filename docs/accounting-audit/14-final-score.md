# 14. Điểm số, tỷ lệ và phương pháp

## Không gán phần trăm hoàn thành tổng thể

Không đủ dữ kiện để đưa ra % hoàn thành nghiệp vụ hoặc % tuân thủ pháp luật có ý nghĩa. Prompt cấm tỷ lệ do AI ước lượng; hồ sơ doanh nghiệp chưa có, nhiều hành vi chỉ được đọc mã, chưa có database/sample set được phê duyệt và 70 ca E2E chưa chạy. Nếu cộng trọng số tùy ý sẽ tạo ra con số giả.

## Các tỷ lệ có mẫu số rõ ràng

| Chỉ số | Công thức | Kết quả |
|---|---|---:|
| Test repository đã chạy thành công | 907 passed / 907 assertions/tests reported | 100% |
| E2E coverage của 70 ca yêu cầu | 0 ca chạy / 70 ca yêu cầu | 0% thực thi |
| E2E pass rate | Không có ca đã chạy | N/A |
| Build/typecheck web cũ | 2 lệnh / 2 lệnh kết thúc mã 0 | 100% của hai bước được chạy |
| Tuân thủ pháp luật | Không có mẫu số applicability và doanh nghiệp cụ thể | N/A |
| Hoàn thành nghiệp vụ | Không có nghiệm thu E2E và profile cấu hình | N/A |

907 test đạt chỉ phản ánh test có sẵn. Không thể gọi đây là 100% test kế toán: 70 tình huống bắt buộc chưa chạy đầu-cuối.

## Điểm theo tiêu chí sử dụng

| Tiêu chí | Kết quả |
|---|---|
| Có màn hình tài chính legacy | Có 26 module |
| Sổ cái kép có enforce server-side | Không đạt |
| Báo cáo tài chính statutory được đối chiếu | Không đạt |
| Tax/e-invoice thật được tích hợp và xác nhận | Không đạt |
| Quy tắc pháp lý đúng doanh nghiệp/kỳ | Chưa xác định |
| Kiểm thử API money transfer | Có, phạm vi hẹp và tốt |
| Kiểm thử 70 luồng kế toán | 0/70 đầu-cuối |
| Ghi sổ thật ngay | Không đạt |

## Số lượng lỗi/thiếu

- Phát hiện trong báo cáo: 10 mục, gồm 6 P1 và 4 P2; 0 P0 xác nhận trong source/test đã xem.
- Thiếu tính năng/kiểm soát được liệt kê: 18 mục; các mục ưu tiên P0 là điều kiện chặn sử dụng sổ thật.
- Vi phạm pháp luật doanh nghiệp được xác nhận: 0; không có dữ liệu doanh nghiệp để kết luận.
- Vấn đề tuân thủ/pháp lý chưa đủ bằng chứng: 5 nhóm trong báo cáo 02.

## Kết luận cuối

1. **Hoàn thành bao nhiêu phần trăm?** Không thể tính phần trăm đáng tin cậy; chức năng nghiệp vụ trọng yếu chưa đạt hoặc chưa kiểm chứng.
2. **Bao nhiêu phần trăm đã kiểm thử thực tế?** 0% của 70 ca E2E yêu cầu; 100% của 907 test hiện có đã chạy.
3. **Nghiệp vụ kế toán đúng không?** Chưa chứng minh; GL và báo cáo có thiếu kiểm soát cụ thể.
4. **Tuân thủ pháp luật tới 29/10/2026?** Chưa thể chứng nhận; thiếu profile và các engine/flow pháp lý được xác minh.
5. **Có thể ghi sổ doanh nghiệp thật ngay?** Không.
6. **Có thể lập báo cáo tài chính chính xác?** Chưa đủ bằng chứng; đầu ra hiện tại không đạt để dùng chính thức.
7. **Có thể tính/kê khai thuế?** Không đạt.
8. **Có nguy cơ sai số/mất tiền/mất dữ liệu/vi phạm?** Có nguy cơ sai số và bỏ sót nghĩa vụ nếu tin trạng thái giả; chưa có bằng chứng giao dịch tiền thật bị mất hoặc dữ liệu production bị hỏng. Khôi phục dữ liệu chưa được thử.
9. **Chức năng chưa hoạt động?** Ghi sổ kép tổng quát, thuế và hóa đơn điện tử thật, báo cáo statutory, kiểm soát kỳ, tài sản/khấu hao→GL, đối chiếu ngân hàng và nhiều tích hợp hiện chỉ một phần hoặc chưa chứng minh.
10. **Cần làm gì?** Theo thứ tự trong [13. Lộ trình](13-improvement-roadmap.md), bắt đầu từ chặn trạng thái thành công giả, xác định regime, xây sổ cái có kiểm soát, liên kết nghiệp vụ, tích hợp pháp lý và chạy 70 E2E.
