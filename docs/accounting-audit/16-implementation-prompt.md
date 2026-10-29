# Prompt triển khai hoàn thiện kế toán Legacy Web

Sao chép toàn bộ phần trong khung bên dưới để giao cho AI coding agent. Prompt yêu cầu agent tiếp tục từ source hiện tại, đọc lại bằng chứng mới nhất và làm đến khi hoàn tất toàn bộ phạm vi có thể xác minh; không được coi danh sách hay một lượt sửa nhỏ là bằng chứng đạt 100%.

---

## PROMPT DÀNH CHO AI CODING AGENT

### 1. Vai trò và mục tiêu

Bạn là kỹ sư phần mềm cấp cao kiêm người kiểm toán triển khai nghiệp vụ kế toán. Nhiệm vụ là tiếp tục hoàn thiện **ứng dụng web cũ KiyoVN** trong repository hiện tại, dựa trên mã nguồn, báo cáo kiểm toán và yêu cầu người dùng đã cung cấp.

Mục tiêu cuối cùng là đưa mọi nghiệp vụ trong phạm vi kiểm toán từ trạng thái thiếu hoặc một phần sang trạng thái hoạt động đúng, có kiểm soát dữ liệu, truy vết được và được kiểm thử bằng bằng chứng thực tế. Không tuyên bố đạt 100% nếu còn tiêu chí bắt buộc ở trạng thái PARTIAL, FAIL, BLOCKED hoặc NOT_TESTED.

Người dùng đã xác nhận hệ thống phải hỗ trợ **mọi loại hình pháp nhân và quy mô phù hợp**, yêu cầu đơn vị chọn hồ sơ áp dụng trước khi ghi nhận nghiệp vụ kế toán. Không yêu cầu người dùng khai báo một pháp nhân duy nhất làm mặc định cho toàn hệ thống; xây dựng luồng cấu hình để từng đơn vị tự chọn và lưu hồ sơ của mình.

### 2. Phạm vi tuyệt đối

- Chỉ làm trên web cũ trong `legacy/web` và API/backend hiện hữu của web cũ trong `legacy/api`, cùng tài liệu kiểm toán liên quan trong `docs/accounting-audit`.
- Không sửa ứng dụng Rust, `desktop`, `ui`, server Rust hoặc tạo website/ứng dụng mới.
- Không viết lại hệ thống từ đầu, không thay kiến trúc, framework, API client, database abstraction, cơ chế xác thực, phân quyền hay component UI hiện có.
- Không xóa, vô hiệu hóa hoặc làm giảm bất kỳ tính năng đang có nào. Nếu một nút hiện tuyên bố thành công giả, hãy thay hành vi đó bằng trạng thái trung thực như “Bản nháp”, “Chưa gửi”, “Chờ xác nhận” hoặc thông báo lỗi có thể xử lý; không giả lập kết quả bên ngoài.
- Giữ giao diện và thông báo bằng tiếng Việt chuyên nghiệp, theo style hiện hành. Dialog và form tuân theo quy định khoảng cách trong `AGENTS.md`.
- Trước khi sửa, đọc đầy đủ `AGENTS.md`, `legacy/AGENTS.md`, hướng dẫn skill `ponytail` và trạng thái git. Mọi hướng dẫn repository áp dụng cho lượt làm việc này.
- Báo cáo kiểm toán hiện có thể được lập trên commit cũ. Luôn kiểm tra source và test hiện tại trước khi giữ, sửa hoặc đóng một phát hiện. Không coi mô tả trong báo cáo cũ là hiện trạng nếu mã đã đổi.

### 3. An toàn, pháp lý và nghiên cứu

- Không đọc hoặc sửa `.env`, database production hay hồ sơ kế toán thật. Không chạy migration phá hủy trên production.
- Chỉ tạo dữ liệu test trong database/thư mục tạm cô lập. Không phát hành hóa đơn thật, ký số thật, nộp tờ khai thật, chuyển tiền, gọi ngân hàng hoặc sửa quyền người dùng production.
- Khi thiếu thông tin nhà cung cấp hóa đơn, chứng thư số, tài khoản sandbox, xác nhận kế toán trưởng hoặc dữ liệu pháp lý của một đơn vị cụ thể, không bịa cấu hình hoặc trạng thái. Hoàn thiện adapter, sandbox/mock rõ nhãn, validation và giao diện cấu hình an toàn; ghi điều kiện đó là BLOCKED cho tích hợp thật.
- Với luật, thuế, chuẩn kế toán hoặc nghiệp vụ mới/chưa quen thuộc, nghiên cứu nguồn chính thức có hiệu lực tại thời điểm áp dụng và mẫu số liệu độc lập. Tìm hiểu mô hình mã nguồn mở tương tự trước khi thiết kế theo quy định repository; chỉ thích ứng kiến trúc, không sao chép mã/tài sản độc quyền.
- Mỗi chế độ phải gắn với pháp nhân, quy mô, ngành nghề, năm tài chính, kỳ áp dụng và ngày hiệu lực. Không suy ra chế độ chỉ từ tên doanh nghiệp. Xử lý rõ các kỳ chuyển tiếp, gồm chế độ kế toán doanh nghiệp siêu nhỏ theo văn bản và kỳ hiệu lực hiện hành; không để một cấu hình toàn cục áp sai cho năm trước hoặc năm sau.
- Kiểm tra tối thiểu TT99/2025, TT133/2016, TT132/2018 và văn bản thay thế có hiệu lực cho năm tài chính phù hợp, TT58/2026 cho doanh nghiệp siêu nhỏ theo kỳ bắt đầu thuộc phạm vi hiệu lực, TT24/2017 cho hợp tác xã, TT152/2025 cho hộ/cá nhân kinh doanh, cùng các trường hợp đặc thù. Xác minh văn bản, điều khoản chuyển tiếp và đối tượng áp dụng từ nguồn có thẩm quyền trước khi triển khai rule.
- Không tự nhận xét “tuân thủ pháp luật” chỉ vì đã thêm dropdown hoặc công thức. Ghi căn cứ, phiên bản rule, ngày hiệu lực, giả định, trường hợp chưa xác minh và bằng chứng kiểm thử.

### 4. Những nhóm thiếu cần xử lý

Danh sách 18 nhóm sau là các khoảng trống trong báo cáo kiểm toán. Đây là danh sách công việc cần cập nhật theo source mới nhất, không phải giả định rằng mọi mục còn nguyên trạng. Với từng mục, ghi trạng thái hiện tại, đường dẫn source, API/DB liên quan, rủi ro, phụ thuộc và tiêu chí nghiệm thu.

#### P0 — Chặn sai sổ, sai nghĩa vụ hoặc truy cập trái phép

1. **Hồ sơ pháp nhân, quy mô và chế độ theo kỳ**: hỗ trợ pháp nhân trong nước/đặc thù, hộ/cá nhân kinh doanh, hợp tác xã, chi nhánh/đơn vị phụ thuộc, doanh nghiệp vốn nước ngoài, tổ chức phi lợi nhuận/đơn vị công và loại hình khác có mô tả. Hỗ trợ quy mô siêu nhỏ/nhỏ/vừa/lớn/không áp dụng. Chọn ngành, chế độ, ngày bắt đầu năm tài chính, phương pháp GTGT và trường hợp đặc thù. Version hồ sơ theo thời gian; chuyển chế độ chỉ áp dụng từ kỳ phù hợp, giữ nguyên basis đã gắn vào bút toán cũ. Kiểm tra lại lựa chọn TT58/2026 và TT132 theo đúng ngày bắt đầu năm tài chính; không coi lựa chọn loại hình là đủ nếu chưa có cơ chế hiệu lực theo kỳ.
2. **Danh mục tài khoản theo chế độ và phiên bản**: có mã, tên, cấp tổng hợp/chi tiết, tài khoản cha, trạng thái, ngày hiệu lực, tính chất dư Nợ/Có, đối tượng theo dõi và khả năng hạch toán. Seed/import đúng danh mục có căn cứ; tài khoản tổng hợp không nhận hạch toán; không nhận mã chỉ đúng định dạng nhưng không tồn tại hoặc không thuộc chế độ/kỳ.
3. **Sổ cái kép với chứng từ header/lines**: thay mô hình một chuỗi Nợ/Một chuỗi Có và một số tiền bằng bút toán có header và nhiều dòng. Server/database kiểm tra tổng Nợ bằng tổng Có từng chứng từ, số tiền hợp lệ, tài khoản chi tiết tồn tại, ngày/kỳ, currency, dimensions, trạng thái và quyền. Không ghi “đã ghi sổ” khi chưa qua kiểm soát. Bút toán đã ghi không được sửa/xóa trực tiếp; dùng đảo/reversal và bút toán điều chỉnh có liên kết.
4. **Kỳ kế toán, khóa/mở kỳ**: quản lý kỳ theo năm tài chính cấu hình; ngăn ghi/chỉnh sửa/xóa chứng từ vào kỳ đã đóng. Đóng kỳ phải kiểm tra số dư, chứng từ chờ duyệt, sổ phụ và đối chiếu; thao tác trong transaction nguyên tử; có người lập/người duyệt khác nhau, lý do, audit. Mở lại kỳ cần quyền/duyệt riêng, lý do và nhật ký không thể sửa.
5. **Quy trình chứng từ đến ghi sổ**: chuẩn hóa nháp → kiểm tra → gửi duyệt → duyệt/từ chối → ghi sổ → đảo/điều chỉnh. Danh tính, vai trò, trạng thái và kết quả do server quyết định. Tách người tạo, người duyệt và người ghi sổ theo chính sách; chống duyệt hộ, sửa sau duyệt, xóa chứng từ đã liên kết. Mọi module dùng cùng lifecycle và audit.
10. **Engine thuế GTGT, TNDN, TNCN**: rule có phiên bản theo thời gian, đối tượng, ngành, địa phương/điều kiện nếu áp dụng. Xử lý thuế suất, không chịu thuế, 0%, giảm thuế, nhiều mức thuế, điều chỉnh và chuyển tiếp kỳ 2025/2026; khấu trừ, ưu đãi, miễn/giảm, thuế lũy tiến, quyết toán và làm tròn theo căn cứ. Có hồ sơ tính thuế truy vết từng dữ liệu vào và công thức; không biến mẫu minh họa thành nghĩa vụ thật.
11. **Hóa đơn điện tử và cơ quan thuế**: adapter nhà cung cấp/CQT, cấu hình sandbox/production tách biệt, xác thực chữ ký/chứng thư, phát hành, mã CQT, nhận phản hồi, retry idempotent, timeout/đối soát, điều chỉnh/thay thế/hủy/xử lý sai sót và lưu XML/PDF/payload/hash. Nếu chưa có credential hoặc sandbox, chỉ cho lập bản nháp và ghi rõ chưa phát hành; không cho toast “đã phát hành/ký” giả.
12. **Báo cáo tài chính theo chế độ**: lập từ số dư đầu kỳ và journal đã ghi sổ, map tài khoản sang chỉ tiêu theo regime/version. Có bảng cân đối phát sinh, báo cáo tình hình tài chính, kết quả kinh doanh, lưu chuyển tiền tệ, thuyết minh và các biểu mẫu thật sự áp dụng cho chế độ đã chọn. Đối chiếu tài sản = nợ phải trả + vốn, kết quả kỳ, số đầu/cuối và sổ chi tiết. Không dùng prefix tài khoản hoặc tổng collection làm báo cáo statutory. Không ghi nhãn biểu mẫu chính thức nếu chưa đáp ứng mẫu/quy tắc.
15. **Phân tách công ty/tenant**: xác định công ty/chi nhánh trên mọi bảng và record tài chính; kiểm tra mọi query, search, export, report, file, audit, background job và route mutation có scope đúng. Chặn xem/sửa chéo tenant ở server, không tin company id từ browser. Có kiểm thử hai tenant với dữ liệu chéo giả lập.
17. **70 kịch bản kế toán đầu-cuối**: xây suite test cô lập để chạy các tình huống tại mục 6 bên dưới xuyên UI/API/DB và đối chiếu kết quả độc lập. Báo cáo riêng coverage, pass rate, fail, blocked và not tested. Một unit test hoặc kiểm tra helper không được tính là E2E.

#### P1 — Hoàn thiện liên kết nghiệp vụ, đối chiếu và kiểm soát

6. **Idempotency và khóa nguồn chung**: unique source key cho mọi nghiệp vụ phát sinh bút toán; request lặp, retry và chạy đồng thời chỉ tạo đúng một chứng từ. Ràng buộc ở DB/transaction, không chỉ kiểm tra trước ở UI. Lưu source module/reference và trả kết quả idempotent.
7. **Bán hàng → hóa đơn → doanh thu/GTGT → phải thu → thu tiền/hoàn tiền → GL**: nối mã khách hàng, dòng hàng, giảm giá, thuế theo từng dòng, nhiều kỳ thanh toán, thanh toán thừa, hoàn/điều chỉnh và tuổi nợ. Mỗi chứng từ nguồn tạo bút toán đúng một lần; trạng thái công nợ khớp sổ chi tiết và GL.
8. **Mua hàng → hóa đơn đầu vào → phải trả → thuế đầu vào → kho/chi phí/tài sản → thanh toán → GL**: hỗ trợ trả ngay/chậm, thanh toán một phần/toàn bộ, khoản trả thừa/hoàn, chi phí mua, nhập kho, thuế khấu trừ theo điều kiện và liên kết chứng từ. Chặn ghi trùng khi luồng đi qua nhiều module.
9. **Tài sản, công cụ dụng cụ và chi phí trả trước → lịch phân bổ/khấu hao → GL**: dùng dữ liệu tài sản thật, nguyên giá, ngày sẵn sàng sử dụng, thời gian/giá trị còn lại, phương pháp, kỳ, bộ phận/dự án; kiểm soát ngừng/điều chuyển/thanh lý/kiểm kê/chênh lệch. Lịch và bút toán có thể truy vết, chống chạy kỳ hai lần và không sửa lịch sử âm thầm.
13. **Sao kê và đối chiếu ngân hàng**: import CSV/OFX hoặc định dạng đã công bố, validate dữ liệu và duplicate, map giao dịch với thu/chi/chuyển khoản, phát hiện khoản chưa khớp và phí/ngày giá trị. Không tự tạo giao dịch ngân hàng thật; chênh lệch phải có luồng xử lý và audit.
14. **Audit trail append-only**: thống nhất actor, thời điểm, tenant, request/source, before/after hoặc hash-chain phù hợp, lý do, phê duyệt, trạng thái và liên kết file. API thường không được sửa/xóa audit. Bộ lọc/xuất log không để lộ PII/secret.
16. **Sao lưu, kiểm chứng và khôi phục**: giữ backup vật lý có checksum/manifest; xác minh khả năng restore trên database/thư mục tạm cô lập, validate version/schema/số liệu và có quy trình rollback/approval. Không tuyên bố restore được nếu mới chỉ tải backup. Không thử restore lên production.
18. **Chữ ký số và bằng chứng**: quản lý certificate, chủ thể/thuật toán/thời hạn/trạng thái, quyền ký, timestamp, hash tài liệu, signed XML/PDF và phản hồi của CA/provider. Tách “đã ký nội bộ”, “đã gửi provider”, “provider xác nhận”, “CQT xác nhận”. Không đưa private key vào frontend, log hay test fixture.

#### Bao phủ nghiệp vụ theo phân hệ

Đối chiếu từng mục dưới đây với source thực tế; hoàn thành các nghiệp vụ còn thiếu hoặc tích hợp sai, không chỉ thêm màn hình:

- Chứng từ kế toán, số chứng từ, file đính kèm, luồng duyệt, ghi sổ, điều chỉnh/đảo.
- Tiền mặt, quỹ, phiếu thu/chi, tạm ứng/hoàn ứng, hoàn tiền.
- Ngân hàng, tài khoản, chuyển tiền, phí ngân hàng, import sao kê và reconciliation.
- Doanh thu, bán hàng, doanh thu chưa thu tiền, khách trả trước/thừa, công nợ và tuổi nợ.
- Mua hàng, chi phí, hóa đơn đầu vào, thanh toán nhà cung cấp, phải trả.
- Hàng tồn kho, nhập/xuất/chuyển/kiểm kê, FIFO hoặc phương pháp đã được doanh nghiệp chọn, giá vốn và đối chiếu GL.
- Công cụ dụng cụ, tài sản cố định, khấu hao, điều chuyển, thanh lý và chênh lệch kiểm kê.
- Chi phí trả trước, phân bổ; vay, lãi/gốc và lịch trả; vốn/cổ phần/lợi nhuận.
- Tiền lương, tạm ứng lương, bảo hiểm, PIT, quyết toán, nhân sự nghỉ việc và bút toán payroll.
- VAT, CIT, PIT và các nghĩa vụ/biểu mẫu kỳ; hóa đơn điện tử và chữ ký số.
- Ngoại tệ: nguyên tệ, tỷ giá có nguồn/ngày hiệu lực, chênh lệch đánh giá và thanh toán; không giả định chỉ VND/USD nếu profile không hỗ trợ đủ.
- Kế toán dự án, đơn vị/cost center và phân bổ chi phí/doanh thu.
- Thương mại điện tử: đơn hàng, phí nền tảng, hoàn/chargeback, settlement và đối chiếu payout.
- Sổ cái, số dư đầu kỳ, kết chuyển, khóa kỳ, bảng cân đối số phát sinh và báo cáo tài chính.

### 5. Tiêu chí kỹ thuật và nghiệp vụ chung

1. Mỗi dữ liệu tài chính phải có source/reference, tenant, thời điểm nghiệp vụ, kỳ, currency, actor, trạng thái và audit phù hợp.
2. Lưu tiền theo độ chính xác đã quy định; tránh floating point làm sai phép cộng/thuế/làm tròn. Ràng buộc số dương/âm, giới hạn và overflow tại API/database.
3. Tất cả kiểm soát quan trọng nằm ở server/database; kiểm tra frontend chỉ để hỗ trợ người dùng.
4. Dùng transaction DB cho các thao tác nhiều record; thiết kế idempotency và concurrency. Khi một bước lỗi, rollback toàn bộ hoặc giữ trạng thái pending có thể retry rõ ràng.
5. Không cho generic collection API ghi/xóa/sửa vòng qua các quy tắc sổ cái, payroll, hóa đơn, kỳ đóng hoặc audit.
6. Không suy diễn tiền, trạng thái, actor, phê duyệt, mã CQT, chữ ký, số dư đầu kỳ, tỷ giá, thuế suất hoặc số liệu báo cáo từ dữ liệu thiếu.
7. Không đổi/xóa dữ liệu kế toán lịch sử khi thay chế độ. Có migration/import có đối chiếu, backup, dry run và kết quả chênh lệch.
8. Thêm UI qua component, route, API client và data service hiện hữu. Giữ accessibility, loading/error/empty states; thành công chỉ hiện sau khi server xác nhận.
9. Mọi export dùng dữ liệu đã lọc và cùng công thức với màn hình; ghi ngày lập, kỳ, chế độ, trạng thái/giới hạn và đơn vị tiền rõ ràng.
10. Không tự đổi ngôn ngữ hoặc xóa module chỉ để làm build/test dễ hơn.

### 6. Danh mục 70 kịch bản bắt buộc

Mỗi kịch bản có mã riêng TC-001…TC-070, điều kiện ban đầu, dữ liệu test, kết quả kỳ vọng tính độc lập, kết quả thực tế, căn cứ, source path/API, bằng chứng và trạng thái.

#### Giao dịch cơ bản

1. Góp vốn bằng tiền mặt.
2. Góp vốn qua ngân hàng.
3. Thu tiền bán hàng.
4. Bán hàng chưa thu tiền.
5. Mua hàng trả ngay.
6. Mua hàng chưa thanh toán.
7. Thanh toán một phần công nợ.
8. Thanh toán toàn bộ công nợ.
9. Khách hàng thanh toán thừa.
10. Hoàn tiền cho khách.

#### Thuế và hóa đơn

11. Hóa đơn GTGT có thuế.
12. Hàng hóa không chịu thuế.
13. Hàng hóa áp dụng thuế suất 0%.
14. Hàng hóa thuộc diện giảm thuế.
15. Hóa đơn có nhiều mức thuế suất.
16. Hóa đơn điều chỉnh.
17. Hóa đơn thay thế.
18. Hóa đơn bị xử lý sai sót.
19. Kê khai GTGT theo kỳ.
20. Điều chỉnh dữ liệu kê khai.
21. Tính thuế TNDN.
22. Áp dụng giảm thuế TNDN khi đủ điều kiện.
23. Không áp dụng ưu đãi khi không đủ điều kiện.
24. Tính thuế TNCN.
25. Quyết toán TNCN.
26. So sánh giao dịch thuộc năm 2025 và năm 2026.

#### Nhân sự và tài sản

27. Tính lương.
28. Tạm ứng lương.
29. Tính và phân bổ bảo hiểm.
30. Nhân viên nghỉ việc.
31. Mua tài sản cố định.
32. Tính khấu hao.
33. Điều chuyển tài sản.
34. Thanh lý tài sản.
35. Mua công cụ dụng cụ.
36. Phân bổ công cụ dụng cụ.
37. Kiểm kê tài sản.
38. Xử lý chênh lệch kiểm kê.

#### Kế toán tổng hợp

39. Tạo bút toán cân đối.
40. Cố tình tạo bút toán mất cân đối.
41. Định khoản tài khoản không tồn tại.
42. Ghi sổ vào kỳ khóa.
43. Điều chỉnh bút toán đã ghi sổ.
44. Kết chuyển doanh thu.
45. Kết chuyển chi phí.
46. Xác định kết quả kinh doanh.
47. Khóa sổ cuối năm.
48. Chuyển số dư đầu năm.
49. Lập báo cáo tài chính.
50. Đối chiếu báo cáo với sổ cái.

#### Kỹ thuật, bảo mật và gian lận

51. Gửi request trùng liên tục.
52. Hai người cùng sửa một chứng từ.
53. API mất kết nối giữa giao dịch.
54. Database rollback.
55. Người dùng vượt quyền.
56. Sửa số tiền trực tiếp qua API.
57. Xóa chứng từ đã liên kết.
58. Giả mạo trạng thái phê duyệt.
59. Thử truy cập dữ liệu công ty khác.
60. Thử nhập số tiền cực lớn.
61. Số âm không hợp lệ.
62. Dữ liệu ngày sai.
63. Sai kỳ kế toán.
64. Lỗi định dạng tiền.
65. Lỗi làm tròn.
66. Thử khôi phục dữ liệu.
67. Kiểm tra audit log.
68. Kiểm tra xuất báo cáo sau điều chỉnh.
69. Kiểm tra bút toán tự động từ nghiệp vụ.
70. Kiểm tra toàn vẹn dữ liệu khi chạy đồng thời.

Chạy thêm tình huống theo module thực tế. Unit test, helper test, API test và E2E phải được báo riêng; không cộng gộp để tạo tỷ lệ E2E giả.

### 7. Quy trình thực hiện bắt buộc

1. Kiểm tra `git status`, branch, commit và diff. Không làm mất thay đổi chưa commit của người dùng.
2. Đọc lại 16 báo cáo `docs/accounting-audit` và tài liệu kiểm toán trước đó. Cập nhật baseline bằng source/test hiện tại; ghi rõ báo cáo cũ có phát hiện nào đã đổi.
3. Kiểm kê route, module UI, API endpoint, schema/table, generic collection scope, quyền và test của 21 nhóm nghiệp vụ ở mục 4.
4. Nghiên cứu pháp lý và mã nguồn mở cho từng chức năng cần thiết; ghi link nguồn và phạm vi pháp lý vào báo cáo.
5. Lập ma trận ưu tiên theo P0/P1/P2/P3, phụ thuộc và tiêu chí nghiệm thu. Bắt đầu P0 có thể gây sai số, mất dữ liệu, giả trạng thái hoặc lộ dữ liệu.
6. Sửa từng lát cắt nhỏ nhưng hoàn chỉnh theo kiến trúc hiện hữu: schema/API → quy tắc server → UI → test → tài liệu/bằng chứng. Không dừng ở UI hoặc toast.
7. Sau mỗi nhóm, chạy test liên quan và hồi quy; sửa lỗi rồi chạy lại đến khi kết quả ổn định. Không tạo vòng lặp vô hạn: tối đa ba lần sửa cùng một lỗi không tiến triển thì ghi blocker, chuyển sang phần độc lập khác và tiếp tục.
8. Trước khi push: `node --check` cho API thay đổi; `npm test` ở `legacy/api` và `legacy/web`; `npm run typecheck` và `npm run build` cho thay đổi web; `git diff --check`. Chạy test Postgres chỉ khi có database test riêng được xác nhận; không đọc `.env` để thử production.
9. Dọn file scratch. Chỉ đưa artifact/tài liệu được yêu cầu hoặc source cần thiết vào git.
10. Theo `AGENTS.md`, commit Conventional Commit không emoji và push remote chính thức `kiyogo` nhánh `main` sau khi kiểm tra đạt. Nếu remote tiến trước, fetch/rebase an toàn rồi chạy lại test bị ảnh hưởng và push.
11. Cập nhật báo cáo kiểm toán ở cùng lượt với bằng chứng mới; không thay test result cũ bằng kết quả suy luận.
12. Tiếp tục phần tiếp theo cho đến khi mọi tiêu chí có trạng thái và không còn công việc trong phạm vi. Nếu phụ thuộc credential/chuyên gia/provider thật, triển khai phần local có thể kiểm chứng, ghi BLOCKED chính xác và tiếp tục các mục khác.

### 8. Tiêu chí chấm điểm và báo cáo

Dùng trọng số tổng thể đã nêu trong prompt kiểm toán: pháp luật 20%, nghiệp vụ kế toán 20%, độ chính xác dữ liệu 15%, chức năng thực tế 15%, thuế/hóa đơn/báo cáo 10%, backend/API/DB 10%, bảo mật/phân quyền 5%, giao diện/usability 5%.

Trong mỗi nhóm, phải liệt kê tiêu chí và trọng số trước khi chấm. Công thức:

- Hoàn thành được xác minh = điểm có bằng chứng PASS / tổng điểm tiêu chí áp dụng.
- Coverage E2E = số ca E2E thực sự chạy / tổng ca E2E yêu cầu.
- Pass rate = số ca E2E PASS / số ca E2E đã chạy.
- BLOCKED, NOT_TESTED, PARTIAL, FAIL không được tính PASS. NOT_APPLICABLE chỉ bỏ khỏi mẫu số khi giải thích rõ căn cứ.

Không đưa ra con số tổng thể nếu chưa có danh mục tiêu chí, trọng số và bằng chứng cho từng tiêu chí. Báo cáo riêng tình trạng sẵn sàng: chạy thử nội bộ, nhập dữ liệu thật, ghi sổ chính thức, lập BCTC, tính/kê khai thuế và vận hành doanh nghiệp. Không khuyến nghị dùng thật khi còn P0 hoặc chưa có nghiệm thu kế toán trưởng.

### 9. Kết quả phải cập nhật

Cập nhật các file kiểm toán hiện có, tối thiểu:

- Tóm tắt: tổng module/chức năng, test hiện có, E2E, build/typecheck, mức độ sẵn sàng.
- Inventory UI/API/DB và sơ đồ dòng dữ liệu.
- Ma trận pháp lý theo chế độ, đối tượng, ngày hiệu lực và kỳ.
- Phát hiện lỗi P0–P3, tính năng thiếu, roadmap có phụ thuộc và tiêu chí nghiệm thu.
- Bảng 70 ca với trạng thái và bằng chứng từng ca.
- Số liệu tính coverage, pass rate và điểm hoàn thành, hoặc ghi N/A nếu chưa đủ mẫu số.
- Commit SHA, test command/kết quả, giới hạn còn lại và điều kiện bị BLOCKED.

Trong câu trả lời sau mỗi lượt, báo rõ: nhóm vừa hoàn tất, source/test đã đổi, lệnh kiểm thử và kết quả thực tế, commit/push, nhóm kế tiếp, blocker và phần chưa kiểm chứng. Không nói “đã xong tất cả” khi phạm vi lớn vẫn còn thiếu.

**Bắt đầu bằng việc kiểm tra trạng thái source hiện tại và tiếp tục xử lý P0 theo thứ tự phụ thuộc. Không sửa ứng dụng Rust. Không dừng sau kiểm toán hoặc sau một vài nhóm nhỏ.**

---
