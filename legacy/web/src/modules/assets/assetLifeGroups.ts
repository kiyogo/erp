// Khung thời gian khấu hao theo Phụ lục I Thông tư 45/2013/TT-BTC, dùng để lọc ô chọn. Giữ khớp với legacy/api/assetRules.mjs
// (tests/asset-life-groups.test.mjs so sánh hai bản); căn cứ và độ tin cậy ghi ở file đó.
export const ASSET_LIFE_GROUPS: Record<string, { label: string; minYears: number; maxYears: number }> = {
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

export const ASSET_CLASS_OPTIONS = ['Tài sản cố định hữu hình', 'Tài sản cố định vô hình', 'Công cụ dụng cụ'].map(value => ({ label: value, value }));

export const assetLifeGroupOptions = Object.entries(ASSET_LIFE_GROUPS).map(([value, group]) => ({ value, label: `${group.label} (${group.minYears} đến ${group.maxYears} năm)` }));
