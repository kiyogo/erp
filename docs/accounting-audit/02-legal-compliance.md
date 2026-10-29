# 02. Đối chiếu pháp luật Việt Nam

**Mốc rà soát:** 29/10/2026. Nguồn ưu tiên là Cổng văn bản Chính phủ, Công báo và Bộ Tài chính. Đây là rà soát yêu cầu và dấu vết mã nguồn; không phải ý kiến pháp lý cho một doanh nghiệp cụ thể.

## Ma trận quy định và khả năng xác minh

| Nhóm | Văn bản chính đã rà | Kết quả đối chiếu mã nguồn |
|---|---|---|
| Kế toán | Luật Kế toán 88/2015/QH13, Luật 56/2024/QH15 | Có lưu trữ chứng từ và một số audit log, nhưng không có bằng chứng hệ thống sổ cái đáp ứng đầy đủ kiểm soát ghi sổ, kỳ khóa, truy vết và báo cáo. |
| Chế độ kế toán doanh nghiệp | TT 99/2025/TT-BTC; TT 133/2016/TT-BTC; TT 58/2026/TT-BTC | Không xác định được doanh nghiệp thuộc nhóm nào. Không tìm thấy bộ rule/versioned forms đủ để chứng minh tuân thủ một chế độ cụ thể. |
| Quản lý thuế | Luật 108/2025/QH15, NĐ 252/2026/NĐ-CP, TT 89/2026/TT-BTC và Quyết định 2551/QĐ-BTC đính chính TT89 | Màn hình thuế không chứng minh đăng ký, kê khai, nộp, hoàn, quyết toán hay audit trail gửi cơ quan thuế. |
| GTGT | Luật 48/2024/QH15, Luật 149/2025/QH15, Luật 09/2026/QH16; NĐ 181/2025, 359/2025, 144/2026; TT 69/2025 | Chưa kiểm chứng phân loại hàng hóa, thuế suất theo thời điểm, khấu trừ/hoàn, hóa đơn nhiều mức thuế hoặc kê khai; màn hình có dữ liệu minh họa cố định. |
| TNDN | Luật 67/2025/QH15, NĐ 320/2025/NĐ-CP, TT 20/2026/TT-BTC, Luật 09/2026/QH16 và NQ 43/2026/QH16 | Không thấy engine tính thuế/điều kiện ưu đãi được kiểm chứng. Nghị quyết 43 có hiệu lực từ 24/08/2026; mã nguồn không chứng minh điều kiện, ngoại lệ, thứ tự áp dụng hay mức giảm đúng cho từng doanh nghiệp. |
| TNCN | Luật 109/2025/QH15, NĐ 253/2026/NĐ-CP, TT 87/2026/TT-BTC, NQ 110/2025/UBTVQH15 | Mức giảm trừ 15,5 triệu/tháng và 6,2 triệu/người phụ thuộc áp dụng kỳ tính thuế 2026; không xác minh được công thức hoặc áp dụng chuyển tiếp trong phần thuế/lương. |
| Hóa đơn điện tử | Luật 108/2025/QH15, NĐ 254/2026/NĐ-CP, TT 91/2026/TT-BTC | Không thấy tích hợp phát hành, ký số, mã CQT, nhận trạng thái, điều chỉnh/thay thế/hủy và lưu trữ từ nhà cung cấp/CQT trong luồng đang đánh giá. |
| Lao động/bảo hiểm | Luật BHXH 41/2024/QH15, Luật BHYT 51/2024/QH15, NĐ 293/2025/NĐ-CP về lương tối thiểu | Payroll có API ghi sổ riêng nhưng chưa đủ test tính lương, bảo hiểm, PIT theo hồ sơ lao động và kỳ pháp lý thực. |
| Bảo vệ dữ liệu cá nhân | Luật 91/2025/QH15, NĐ 356/2025/NĐ-CP | Chưa có đánh giá DPIA, chính sách retention/consent, yêu cầu dữ liệu chủ thể, chuyển dữ liệu xuyên biên giới hoặc cấu hình production. |
| Giao dịch điện tử | Luật 20/2023/QH15 | Module chữ ký số chưa chứng minh CA, chứng thư, dấu thời gian, xác thực ký và lưu bằng chứng ký. |

## Bảng vấn đề pháp lý

| ID | Yêu cầu | Hiện trạng/bằng chứng | Kết quả |
|---|---|---|---|
| L-01 | Chọn chế độ kế toán theo loại hình/quy mô/ngành và năm tài chính | Không có hồ sơ pháp lý doanh nghiệp hoặc cấu hình được kiểm chứng | Chưa thể xác định chế độ áp dụng |
| L-02 | Có tài khoản, chứng từ, sổ và báo cáo khớp chế độ áp dụng | Không có bằng chứng chart of accounts versioned, journal engine và statutory statement mapping | Chưa đáp ứng/không đủ bằng chứng |
| L-03 | Công thức thuế thay đổi theo kỳ và đối tượng | UI chứa dữ liệu mẫu; không có bộ luật thuế phiên bản hóa được xác minh | Không đủ bằng chứng tuân thủ |
| L-04 | Hóa đơn điện tử phải có giao dịch và trạng thái pháp lý thực | UI hiện có thể báo đã phát hành/ký nhưng lưu payload nội bộ | Rủi ro trình bày sai trạng thái pháp lý |
| L-05 | Chữ ký chứng từ và dữ liệu cá nhân phải kiểm soát | Chỉ có module UI; chưa xác minh CA/consent/retention/kiểm soát dữ liệu thực | Chưa đủ bằng chứng |

Không ghi nhận vi phạm điều khoản cụ thể của doanh nghiệp vì không có profile, chứng từ hay dữ liệu thật để so sánh. Các mục trên là thiếu bằng chứng hoặc thiếu năng lực được chứng minh trong mã nguồn, không được diễn giải thành kết luận doanh nghiệp đã vi phạm pháp luật.

## Các điểm áp dụng phải giữ điều kiện

- TT 99/2025/TT-BTC có hiệu lực 01/01/2026 và áp dụng cho năm tài chính bắt đầu từ hoặc sau 01/01/2026; TT99 thay TT200 trong phạm vi/ngoại lệ điều khoản thi hành. Không tự động kết luận TT133 bị thay thế.
- TT 58/2026/TT-BTC có hiệu lực 01/07/2026 cho doanh nghiệp siêu nhỏ theo phạm vi và chuyển tiếp của thông tư.
- NQ 110 áp dụng mức giảm trừ mới từ kỳ tính thuế 2026; kỳ 2025 không được hồi tố chỉ vì ứng dụng chạy năm 2026.
- Nghị quyết giảm thuế GTGT theo nhóm hàng/kỳ chỉ áp dụng khi điều kiện cụ thể thỏa mãn; không áp mức cố định cho mọi giao dịch.
- NQ 43/2026/QH16 và các thay đổi thuế năm 2026 phải đối chiếu đúng đối tượng, kỳ tính thuế, ngoại lệ, hiệu lực. Không tự động bật ưu đãi theo doanh thu đơn lẻ.

Nguồn và ngày hiệu lực chi tiết được liệt kê tại [15. Nguồn pháp luật](15-legal-sources.md).
