// Thuế suất giá trị gia tăng được phép ghi trên hóa đơn và chứng từ, theo ngày lập.
// Mỗi giai đoạn nêu căn cứ pháp lý. Khi luật đổi chỉ thêm giai đoạn mới, không sửa giai đoạn cũ.
// Thuế suất 8% là mức giảm 2 điểm phần trăm của thuế suất 10%, chỉ áp dụng trong các giai đoạn dưới đây.
// Các mốc ngày xác minh qua bài đăng tổng hợp văn bản (luatvietnam.vn, kpmg.com, nghean.gov.vn),
// chưa đối chiếu được văn bản gốc; nhóm hàng loại trừ (viễn thông, tài chính, ngân hàng, chứng khoán,
// bảo hiểm, bất động sản, kim loại, sản phẩm khai khoáng, hàng chịu thuế tiêu thụ đặc biệt) do người
// lập hóa đơn tự áp dụng, hệ thống chưa phân loại được từng mặt hàng.

const BASE_RATES = [0, 5, 10];

const REDUCED_8_PERCENT_PERIODS = [
  { from: '2022-02-01', to: '2022-12-31', basis: 'Nghị quyết 43/2022/QH15, Nghị định 15/2022/NĐ-CP' },
  { from: '2023-07-01', to: '2023-12-31', basis: 'Nghị quyết 101/2023/QH15, Nghị định 44/2023/NĐ-CP' },
  { from: '2024-01-01', to: '2024-06-30', basis: 'Nghị quyết 110/2023/QH15, Nghị định 94/2023/NĐ-CP' },
  { from: '2024-07-01', to: '2024-12-31', basis: 'Nghị quyết 142/2024/QH15, Nghị định 72/2024/NĐ-CP' },
  { from: '2025-01-01', to: '2025-06-30', basis: 'Nghị quyết 174/2024/QH15, Nghị định 180/2024/NĐ-CP' },
  { from: '2025-07-01', to: '2026-12-31', basis: 'Nghị quyết 204/2025/QH15, Nghị định 174/2025/NĐ-CP' },
];

// Luật Thuế GTGT 48/2024/QH15 Điều 9 (từ 01/07/2025) và Luật 13/2008/QH12 Điều 8 trước đó đều có 0%, 5%, 10%.
export function allowedVatRates(isoDate) {
  const reduced = REDUCED_8_PERCENT_PERIODS.some(period => isoDate >= period.from && isoDate <= period.to);
  return reduced ? [...BASE_RATES, 8] : [...BASE_RATES];
}

export function isAllowedVatRate(rate, isoDate) {
  return Number.isFinite(rate) && allowedVatRates(isoDate).includes(rate);
}

// Trả về thông báo lỗi tiếng Việt hoặc chuỗi rỗng khi hợp lệ.
export function vatRateProblem(rate, isoDate, label = 'Thuế suất GTGT') {
  if (isAllowedVatRate(rate, isoDate)) return '';
  const allowed = allowedVatRates(isoDate).map(value => `${value}%`).join(', ');
  return `${label} ${Number.isFinite(rate) ? `${rate}%` : 'không hợp lệ'} không được áp dụng cho ngày ${isoDate}; các mức hợp lệ: ${allowed}.`;
}
