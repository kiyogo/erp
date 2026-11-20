// Quy tắc tài sản cố định: phân loại, khung thời gian khấu hao, cấu thành nguyên giá, giới hạn khấu hao ô tô khi tính thuế TNDN.
// Căn cứ: Thông tư 45/2013/TT-BTC (Điều 3, 4, 9, 10, 11, 13 và Phụ lục I) sửa đổi bởi Thông tư 147/2016/TT-BTC, 28/2017/TT-BTC,
// văn bản hợp nhất 19/VBHN-BTC/2017; Luật Thuế TNDN 67/2025/QH15 và Nghị định 320/2025/NĐ-CP Điều 10 (khoản chi không được trừ).
// Thông tư 45/2013 vẫn là chế độ hiện hành, dự thảo thông tư thay thế dự kiến áp dụng từ 01/01/2027 chưa ban hành.
// Xác minh qua bài tổng hợp và hỏi đáp của Bộ Tài chính; chưa đối chiếu được Phụ lục I bản gốc.

export const TSCD_MIN_COST = 30_000_000;
export const CAR_TAX_COST_CAP = 1_600_000_000;
export const CAR_MAX_SEATS = 9;

export const ASSET_CLASSES = ['Tài sản cố định hữu hình', 'Tài sản cố định vô hình', 'Công cụ dụng cụ'];

// Khung thời gian trích khấu hao tối thiểu và tối đa (năm) theo Phụ lục I Thông tư 45/2013/TT-BTC.
export const ASSET_LIFE_GROUPS = {
  building_solid: { label: 'Nhà cửa, vật kiến trúc kiên cố', minYears: 25, maxYears: 50 },
  building_other: { label: 'Nhà cửa, vật kiến trúc khác', minYears: 6, maxYears: 25 },
  storage_road: { label: 'Kho tàng, bể chứa, cầu, đường, sân bãi', minYears: 5, maxYears: 20 },
  dam_canal: { label: 'Đê, đập, cống, kênh, mương', minYears: 6, maxYears: 30 },
  port: { label: 'Bến cảng, ụ nổi, triền đà', minYears: 10, maxYears: 40 },
  structure_other: { label: 'Vật kiến trúc khác', minYears: 5, maxYears: 10 },
  machinery_power: { label: 'Máy móc, thiết bị động lực', minYears: 6, maxYears: 15 },
  machinery_generator: { label: 'Máy phát điện', minYears: 7, maxYears: 20 },
  machinery_work: { label: 'Máy móc, thiết bị công tác khác', minYears: 5, maxYears: 12 },
  machinery_construction: { label: 'Máy xây dựng', minYears: 8, maxYears: 15 },
  machinery_telecom_it: { label: 'Thiết bị viễn thông, công nghệ thông tin, truyền dẫn', minYears: 3, maxYears: 15 },
  measuring: { label: 'Dụng cụ làm việc, đo lường, thí nghiệm', minYears: 5, maxYears: 10 },
  transport_road: { label: 'Phương tiện vận tải đường bộ', minYears: 6, maxYears: 10 },
  transport_rail_water: { label: 'Phương tiện vận tải đường sắt, đường thủy', minYears: 7, maxYears: 15 },
  transport_air: { label: 'Phương tiện vận tải hàng không', minYears: 8, maxYears: 20 },
  transport_other: { label: 'Phương tiện vận tải khác, thiết bị bốc xếp', minYears: 6, maxYears: 10 },
  management_it: { label: 'Máy vi tính, thiết bị điện tử, phần mềm quản lý', minYears: 3, maxYears: 8 },
  management_measuring: { label: 'Thiết bị đo lường, tính toán quản lý', minYears: 5, maxYears: 8 },
  management_other: { label: 'Dụng cụ quản lý khác (nội thất, bàn ghế)', minYears: 5, maxYears: 10 },
  perennial_plant: { label: 'Vườn cây lâu năm', minYears: 6, maxYears: 40 },
  livestock: { label: 'Súc vật làm việc, cho sản phẩm', minYears: 4, maxYears: 15 },
  tangible_other: { label: 'Tài sản cố định hữu hình khác', minYears: 4, maxYears: 25 },
  intangible: { label: 'Tài sản cố định vô hình', minYears: 2, maxYears: 20 },
};

export const assetLifeGroupOptions = () => Object.entries(ASSET_LIFE_GROUPS).map(([value, group]) => ({ value, label: `${group.label} (${group.minYears} đến ${group.maxYears} năm)` }));

// Thời gian khấu hao phải nằm trong khung; tài sản đã qua sử dụng tính theo tỷ lệ giá trị nên được dưới mức tối thiểu (Điều 10).
export function assetLifeProblem(groupKey, months, usedAsset = false) {
  if (!groupKey) return '';
  const group = ASSET_LIFE_GROUPS[groupKey];
  if (!group) return 'Nhóm tài sản theo khung khấu hao không hợp lệ.';
  if (!Number.isInteger(months)) return '';
  const min = usedAsset ? 1 : group.minYears * 12;
  const max = group.maxYears * 12;
  if (months >= min && months <= max) return '';
  return `Thời gian khấu hao ${months} tháng nằm ngoài khung ${usedAsset ? 1 : group.minYears * 12} đến ${max} tháng (${group.minYears} đến ${group.maxYears} năm) của nhóm "${group.label}" theo Thông tư 45/2013/TT-BTC.`;
}

// Tài sản cố định cần nguyên giá từ 30 triệu đồng, dưới mức đó ghi nhận là công cụ dụng cụ và phân bổ vào chi phí.
export function assetClassProblem(assetClass, originalPrice) {
  if (!assetClass) return '';
  if (!ASSET_CLASSES.includes(assetClass)) return 'Phân loại tài sản không hợp lệ.';
  if (assetClass !== 'Công cụ dụng cụ' && originalPrice < TSCD_MIN_COST) {
    return `Tài sản cố định cần nguyên giá từ ${TSCD_MIN_COST.toLocaleString('vi-VN')} đồng; dưới mức này ghi nhận là công cụ dụng cụ và phân bổ vào chi phí.`;
  }
  return '';
}

// Nguyên giá = giá mua + thuế không hoàn lại + chi phí vận chuyển, lắp đặt, chạy thử + chi phí khác (Điều 4).
export function costBreakdownProblem({ purchasePrice, nonRefundableTax, installCost, otherCost }, originalPrice) {
  const parts = [purchasePrice, nonRefundableTax, installCost, otherCost];
  if (parts.every(part => part === undefined)) return '';
  const total = parts.reduce((sum, part) => sum + (part || 0), 0);
  return total === originalPrice ? '' : `Giá mua, thuế không hoàn lại và chi phí liên quan cộng lại ${total.toLocaleString('vi-VN')} đồng, khác nguyên giá ${originalPrice.toLocaleString('vi-VN')} đồng.`;
}

// Khấu hao ô tô từ 9 chỗ trở xuống phần nguyên giá trên 1,6 tỷ đồng không được trừ khi tính thuế TNDN,
// trừ xe dùng kinh doanh vận tải hành khách, du lịch, khách sạn (Nghị định 320/2025/NĐ-CP Điều 10).
export function taxDeductibleCost({ originalPrice, vehicleSeats, transportBusiness, assetClass, lifeGroup }) {
  const isCar = lifeGroup === 'transport_road' && Number.isInteger(vehicleSeats) && vehicleSeats >= 1 && vehicleSeats <= CAR_MAX_SEATS;
  if (!isCar || transportBusiness || assetClass === 'Tài sản cố định vô hình') return originalPrice;
  return Math.min(originalPrice, CAR_TAX_COST_CAP);
}

// Các điểm khiến khấu hao không được trừ khi tính thuế; chỉ cảnh báo, không chặn lưu.
export function assetTaxWarnings({ originalPrice, taxCost, ownershipProof }) {
  const warnings = [];
  if (!ownershipProof) warnings.push('Chưa ghi chứng từ chứng minh quyền sở hữu: khấu hao tài sản không có chứng từ không được trừ khi tính thuế TNDN.');
  if (taxCost < originalPrice) warnings.push(`Ô tô từ 9 chỗ trở xuống: chỉ khấu hao trên ${taxCost.toLocaleString('vi-VN')} đồng được trừ khi tính thuế TNDN, phần nguyên giá vượt ${(originalPrice - taxCost).toLocaleString('vi-VN')} đồng không được trừ.`);
  return warnings;
}
