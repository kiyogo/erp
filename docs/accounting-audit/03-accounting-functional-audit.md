# 03. Kiểm toán chức năng kế toán

## Bảng phân hệ thực tế

Trạng thái “một phần” chỉ nói rằng có một phần đường đi của dữ liệu trong source/test; không xác nhận đúng chế độ kế toán hoặc đã nghiệm thu người dùng.

| Phân hệ | UI | API/DB | Hạch toán kép | Test nghiệp vụ riêng | Đánh giá |
|---|---|---|---|---|---|
| Tổng quan tài chính | Có | Tổng hợp từ các module | Không xác nhận | Không | Một phần |
| Thu/chi tiền mặt | Có | Có API và bảng chuyên biệt; trạng thái/chủ thể được kiểm tra | Không tự chứng minh đủ sổ cái | Có unit/API liên quan | Một phần |
| Quỹ tiền lẻ | Có | Có thao tác tạo/hủy tiền | Không xác nhận | Không đủ E2E | Một phần |
| Tài khoản ngân hàng | Có | Có API; số tài khoản được mã hóa tại rest trong Rust | Không | Có test tạo/quyền/mã hóa | Một phần |
| Chuyển tiền nội bộ | Có | Transaction nguyên tử, idempotency, kiểm soát số dư/đảo giao dịch | Chỉ chân cash; trạng thái legacy ghi ledger_only | Có test tốt cho API transfer | Một phần |
| Bán hàng/hóa đơn bán | Có | finance_documents và luồng thu tiền liên quan | Chưa có bút toán chuẩn tổng quát | Không đủ E2E | Một phần |
| Mua hàng/đề nghị mua | Có | Có lưu chứng từ; mức API tùy luồng | Chưa chứng minh AP/thuế/tồn kho→GL | Không đủ E2E | Một phần |
| Thanh toán/công nợ | Có | Một số API/chứng từ | Chưa chứng minh phân bổ công nợ, thanh toán thừa/hoàn tiền qua GL | Không đủ E2E | Một phần |
| Tồn kho/giá thành | Có | Có API chuyên biệt cho một số nghiệp vụ kho/giá thành | Chưa chứng minh giá vốn → sổ cái và báo cáo | Không đủ E2E | Một phần |
| Tiền lương | Có | API preview/post/adjust; lưu bút toán vào generic collection | Định khoản payroll riêng, chưa có GL core | Có test payroll hẹp | Một phần |
| Sổ cái | Có | finance_general_ledger trong collection JSON | Cân đối chỉ tổng collection; không chặn mất cân đối từng voucher | Có test phép tính nhỏ | Không đạt |
| Kết chuyển | Có | Tạo một số record riêng theo quý | Không atomically commit toàn bộ nhóm record | Unit test phép tính | Không đạt |
| Tài sản cố định | Có | Generic save | Chưa xác minh nguyên giá, khấu hao, điều chuyển, thanh lý→GL | Không | Chưa đủ bằng chứng |
| Chi phí trả trước | Có | Generic save | Chưa xác minh lịch phân bổ hoặc bút toán | Không | Chưa đủ bằng chứng |
| Vay/nợ/vốn | Có | Nhiều màn hình dùng dữ liệu chung | Chưa xác minh lãi, gốc, lịch trả và định khoản | Không | Chưa đủ bằng chứng |
| Ngân sách/dự báo dòng tiền | Có | Tổng hợp/collection | Kế toán quản trị, chưa có bằng chứng liên kết số đã ghi sổ | Không | Chưa đủ bằng chứng |
| Thuế | Có | Generic finance_tax | Không có engine/tờ khai đã kiểm chứng | Không | Không đạt |
| Hóa đơn điện tử | Có | Generic finance_einvoices | Không có phát hành thực/đối soát CQT | Không | Không đạt |
| Chữ ký số | Có | Lưu dữ liệu chung | Không có bằng chứng CA ký thật | Không | Không đạt |

## Sổ cái và định khoản

- Mỗi dòng UI chứa một tài khoản Nợ, một tài khoản Có và một số tiền. Không thấy kiểm soát danh mục tài khoản tồn tại hoặc tính hợp lệ theo chế độ.
- Cờ cân đối được tính ở frontend từ tổng các dòng có tài khoản trong toàn bộ collection; không đảm bảo tổng Nợ = tổng Có cho từng mã chứng từ.
- Tạo bút toán gửi payload generic. API collection không áp dụng kiểm tra hạch toán kép chuyên biệt cho finance_general_ledger.
- Mã chứng từ trùng được kiểm tra ở UI; không tương đương idempotency/unique constraint của journal API.
- Không thấy sổ kỳ khóa và quy trình mở lại kỳ có phê duyệt được kiểm chứng.
- Payroll có API chuyên biệt, transaction và chống trùng theo kỳ/nguồn; đó là kiểm soát riêng cho payroll, không thay thế sổ cái tổng hợp.

## Chu trình liên phân hệ

| Chu trình | Bằng chứng hiện có | Khoảng trống |
|---|---|---|
| Bán hàng → hóa đơn → doanh thu → công nợ → thu tiền → GL | finance_documents và có thể sinh cash transaction | Không chứng minh doanh thu/thuế/phải thu ghi vào journal và đối chiếu báo cáo |
| Mua hàng → hóa đơn đầu vào → công nợ → thanh toán → tồn kho/chi phí | Chứng từ mua và một số module mua/kho | Không có chuỗi end-to-end đã test; chưa rõ một chứng từ đi qua nhiều module có bị ghi trùng không |
| Chấm công → lương → BH/thuế → GL → thanh toán | Payroll preview/post/adjust tồn tại | Chưa xác minh công thức theo luật, bảo hiểm và payment settlement |
| TSCĐ → khấu hao → chi phí → GL | Màn hình tài sản có generic data | Không thấy engine khấu hao tạo journal và khóa/sửa lịch sử |
| Kho → xuất kho → giá vốn → P&L | Tồn kho/giá thành có API riêng | Không có bằng chứng tích hợp cost layer với GL/report |

## Phát hiện chi tiết và vị trí

- [GeneralLedgerModule.tsx](../../legacy/web/src/modules/finance/GeneralLedgerModule.tsx#L18-L117): dòng bút toán, tổng hợp cân đối và lưu generic record.
- [ledgerCalculations.ts](../../legacy/web/src/modules/finance/ledgerCalculations.ts#L12-L92): lọc quý và suy ra doanh thu/chi phí theo đầu số tài khoản.
- [API collection](../../legacy/api/index.mjs): normalization tổng quát không ràng buộc account/voucher của sổ cái.
- [Payroll routes](../../legacy/api/index.mjs#L9200-L9310): kiểm soát riêng cho ghi sổ lương.
