export interface ProvinceItem {
  name: string;
  code: number;
  division_type: string;
  codename: string;
  phone_code: number;
  wards?: WardItem[];
}

export interface WardItem {
  name: string;
  code: number;
  division_type: string;
  codename: string;
  province_code: number;
}

export const VIETNAM_PROVINCES: ProvinceItem[] = [
  { name: 'Thành phố Hà Nội', code: 1, division_type: 'thành phố trung ương', codename: 'ha_noi', phone_code: 24, wards: [] },
  { name: 'Tỉnh Cao Bằng', code: 4, division_type: 'tỉnh', codename: 'cao_bang', phone_code: 206, wards: [] },
  { name: 'Tỉnh Tuyên Quang', code: 8, division_type: 'tỉnh', codename: 'tuyen_quang', phone_code: 207, wards: [] },
  { name: 'Tỉnh Điện Biên', code: 11, division_type: 'tỉnh', codename: 'dien_bien', phone_code: 215, wards: [] },
  { name: 'Tỉnh Lai Châu', code: 12, division_type: 'tỉnh', codename: 'lai_chau', phone_code: 213, wards: [] },
  { name: 'Tỉnh Sơn La', code: 14, division_type: 'tỉnh', codename: 'son_la', phone_code: 212, wards: [] },
  { name: 'Tỉnh Lào Cai', code: 15, division_type: 'tỉnh', codename: 'lao_cai', phone_code: 214, wards: [] },
  { name: 'Tỉnh Thái Nguyên', code: 19, division_type: 'tỉnh', codename: 'thai_nguyen', phone_code: 208, wards: [] },
  { name: 'Tỉnh Lạng Sơn', code: 20, division_type: 'tỉnh', codename: 'lang_son', phone_code: 205, wards: [] },
  { name: 'Tỉnh Quảng Ninh', code: 22, division_type: 'tỉnh', codename: 'quang_ninh', phone_code: 203, wards: [] },
  { name: 'Tỉnh Bắc Ninh', code: 24, division_type: 'tỉnh', codename: 'bac_ninh', phone_code: 222, wards: [] },
  { name: 'Tỉnh Phú Thọ', code: 25, division_type: 'tỉnh', codename: 'phu_tho', phone_code: 210, wards: [] },
  { name: 'Thành phố Hải Phòng', code: 31, division_type: 'thành phố trung ương', codename: 'hai_phong', phone_code: 225, wards: [] },
  { name: 'Tỉnh Hưng Yên', code: 33, division_type: 'tỉnh', codename: 'hung_yen', phone_code: 221, wards: [] },
  { name: 'Tỉnh Ninh Bình', code: 37, division_type: 'tỉnh', codename: 'ninh_binh', phone_code: 229, wards: [] },
  { name: 'Tỉnh Thanh Hóa', code: 38, division_type: 'tỉnh', codename: 'thanh_hoa', phone_code: 237, wards: [] },
  { name: 'Tỉnh Nghệ An', code: 40, division_type: 'tỉnh', codename: 'nghe_an', phone_code: 238, wards: [] },
  { name: 'Tỉnh Hà Tĩnh', code: 42, division_type: 'tỉnh', codename: 'ha_tinh', phone_code: 239, wards: [] },
  { name: 'Tỉnh Quảng Trị', code: 44, division_type: 'tỉnh', codename: 'quang_tri', phone_code: 233, wards: [] },
  { name: 'Thành phố Huế', code: 46, division_type: 'thành phố trung ương', codename: 'hue', phone_code: 234, wards: [] },
  { name: 'Thành phố Đà Nẵng', code: 48, division_type: 'thành phố trung ương', codename: 'da_nang', phone_code: 236, wards: [] },
  { name: 'Tỉnh Quảng Ngãi', code: 51, division_type: 'tỉnh', codename: 'quang_ngai', phone_code: 255, wards: [] },
  { name: 'Tỉnh Gia Lai', code: 52, division_type: 'tỉnh', codename: 'gia_lai', phone_code: 269, wards: [] },
  { name: 'Tỉnh Khánh Hòa', code: 56, division_type: 'tỉnh', codename: 'khanh_hoa', phone_code: 258, wards: [] },
  { name: 'Tỉnh Đắk Lắk', code: 66, division_type: 'tỉnh', codename: 'dak_lak', phone_code: 262, wards: [] },
  { name: 'Tỉnh Lâm Đồng', code: 68, division_type: 'tỉnh', codename: 'lam_dong', phone_code: 263, wards: [] },
  { name: 'Tỉnh Đồng Nai', code: 75, division_type: 'tỉnh', codename: 'dong_nai', phone_code: 251, wards: [] },
  { name: 'Thành phố Hồ Chí Minh', code: 79, division_type: 'thành phố trung ương', codename: 'ho_chi_minh', phone_code: 28, wards: [] },
  { name: 'Tỉnh Tây Ninh', code: 80, division_type: 'tỉnh', codename: 'tay_ninh', phone_code: 276, wards: [] },
  { name: 'Tỉnh Đồng Tháp', code: 82, division_type: 'tỉnh', codename: 'dong_thap', phone_code: 277, wards: [] },
  { name: 'Tỉnh Vĩnh Long', code: 86, division_type: 'tỉnh', codename: 'vinh_long', phone_code: 270, wards: [] },
  { name: 'Tỉnh An Giang', code: 91, division_type: 'tỉnh', codename: 'an_giang', phone_code: 296, wards: [] },
  { name: 'Thành phố Cần Thơ', code: 92, division_type: 'thành phố trung ương', codename: 'can_tho', phone_code: 292, wards: [] },
  { name: 'Tỉnh Cà Mau', code: 96, division_type: 'tỉnh', codename: 'ca_mau', phone_code: 290, wards: [] },
];

export const PROVINCE_OPTIONS = VIETNAM_PROVINCES.map((p) => ({
  label: p.name,
  value: p.name,
  code: p.code,
}));

// In-memory cache for loaded wards
const wardsCache = new Map<number, WardItem[]>();

// Fallback wards for province 4 (Cao Bằng) as specified by user
const INITIAL_CAO_BANG_WARDS: WardItem[] = [
  { name: 'Phường Thục Phán', code: 1273, division_type: 'phường', codename: 'phuong_thuc_phan', province_code: 4 },
  { name: 'Phường Nùng Trí Cao', code: 1279, division_type: 'phường', codename: 'phuong_nung_tri_cao', province_code: 4 },
  { name: 'Phường Tân Giang', code: 1288, division_type: 'phường', codename: 'phuong_tan_giang', province_code: 4 },
  { name: 'Xã Bảo Lâm', code: 1290, division_type: 'xã', codename: 'xa_bao_lam', province_code: 4 },
  { name: 'Xã Lý Bôn', code: 1294, division_type: 'xã', codename: 'xa_ly_bon', province_code: 4 },
  { name: 'Xã Nam Quang', code: 1297, division_type: 'xã', codename: 'xa_nam_quang', province_code: 4 },
  { name: 'Xã Quảng Lâm', code: 1304, division_type: 'xã', codename: 'xa_quang_lam', province_code: 4 },
  { name: 'Xã Yên Thổ', code: 1318, division_type: 'xã', codename: 'xa_yen_tho', province_code: 4 },
  { name: 'Xã Bảo Lạc', code: 1321, division_type: 'xã', codename: 'xa_bao_lac', province_code: 4 },
  { name: 'Xã Cốc Pàng', code: 1324, division_type: 'xã', codename: 'xa_coc_pang', province_code: 4 },
  { name: 'Xã Cô Ba', code: 1327, division_type: 'xã', codename: 'xa_co_ba', province_code: 4 },
  { name: 'Xã Khánh Xuân', code: 1336, division_type: 'xã', codename: 'xa_khanh_xuan', province_code: 4 },
  { name: 'Xã Xuân Trường', code: 1339, division_type: 'xã', codename: 'xa_xuan_truong', province_code: 4 },
  { name: 'Xã Hưng Đạo', code: 1351, division_type: 'xã', codename: 'xa_hung_dao', province_code: 4 },
  { name: 'Xã Huy Giáp', code: 1354, division_type: 'xã', codename: 'xa_huy_giap', province_code: 4 },
  { name: 'Xã Sơn Lộ', code: 1360, division_type: 'xã', codename: 'xa_son_lo', province_code: 4 },
  { name: 'Xã Thông Nông', code: 1363, division_type: 'xã', codename: 'xa_thong_nong', province_code: 4 },
  { name: 'Xã Cần Yên', code: 1366, division_type: 'xã', codename: 'xa_can_yen', province_code: 4 },
  { name: 'Xã Thanh Long', code: 1387, division_type: 'xã', codename: 'xa_thanh_long', province_code: 4 },
  { name: 'Xã Trường Hà', code: 1392, division_type: 'xã', codename: 'xa_truong_ha', province_code: 4 },
  { name: 'Xã Lũng Nặm', code: 1393, division_type: 'xã', codename: 'xa_lung_nam', province_code: 4 },
  { name: 'Xã Tổng Cọt', code: 1414, division_type: 'xã', codename: 'xa_tong_cot', province_code: 4 },
  { name: 'Xã Hà Quảng', code: 1438, division_type: 'xã', codename: 'xa_ha_quang', province_code: 4 },
  { name: 'Xã Trà Lĩnh', code: 1447, division_type: 'xã', codename: 'xa_tra_linh', province_code: 4 },
  { name: 'Xã Quang Hán', code: 1456, division_type: 'xã', codename: 'xa_quang_han', province_code: 4 },
  { name: 'Xã Quang Trung', code: 1465, division_type: 'xã', codename: 'xa_quang_trung', province_code: 4 },
  { name: 'Xã Trùng Khánh', code: 1477, division_type: 'xã', codename: 'xa_trung_khanh', province_code: 4 },
  { name: 'Xã Đình Phong', code: 1489, division_type: 'xã', codename: 'xa_dinh_phong', province_code: 4 },
  { name: 'Xã Đàm Thủy', code: 1501, division_type: 'xã', codename: 'xa_dam_thuy', province_code: 4 },
  { name: 'Xã Đoài Dương', code: 1525, division_type: 'xã', codename: 'xa_doai_duong', province_code: 4 },
  { name: 'Xã Lý Quốc', code: 1537, division_type: 'xã', codename: 'xa_ly_quoc', province_code: 4 },
  { name: 'Xã Quang Long', code: 1552, division_type: 'xã', codename: 'xa_quang_long', province_code: 4 },
  { name: 'Xã Hạ Lang', code: 1558, division_type: 'xã', codename: 'xa_ha_lang', province_code: 4 },
  { name: 'Xã Vinh Quý', code: 1561, division_type: 'xã', codename: 'xa_vinh_quy', province_code: 4 },
  { name: 'Xã Quảng Uyên', code: 1576, division_type: 'xã', codename: 'xa_quang_uyen', province_code: 4 },
  { name: 'Xã Độc Lập', code: 1594, division_type: 'xã', codename: 'xa_doc_lap', province_code: 4 },
  { name: 'Xã Hạnh Phúc', code: 1618, division_type: 'xã', codename: 'xa_hanh_phuc', province_code: 4 },
  { name: 'Xã Bế Văn Đàn', code: 1636, division_type: 'xã', codename: 'xa_be_van_dan', province_code: 4 },
  { name: 'Xã Phục Hòa', code: 1648, division_type: 'xã', codename: 'xa_phuc_hoa', province_code: 4 },
  { name: 'Xã Hòa An', code: 1654, division_type: 'xã', codename: 'xa_hoa_an', province_code: 4 },
  { name: 'Xã Nam Tuấn', code: 1660, division_type: 'xã', codename: 'xa_nam_tuan', province_code: 4 },
  { name: 'Xã Nguyễn Huệ', code: 1699, division_type: 'xã', codename: 'xa_nguyen_hue', province_code: 4 },
  { name: 'Xã Bạch Đằng', code: 1708, division_type: 'xã', codename: 'xa_bach_dang', province_code: 4 },
  { name: 'Xã Nguyên Bình', code: 1726, division_type: 'xã', codename: 'xa_nguyen_binh', province_code: 4 },
  { name: 'Xã Tĩnh Túc', code: 1729, division_type: 'xã', codename: 'xa_tinh_tuc', province_code: 4 },
  { name: 'Xã Ca Thành', code: 1738, division_type: 'xã', codename: 'xa_ca_thanh', province_code: 4 },
  { name: 'Xã Minh Tâm', code: 1747, division_type: 'xã', codename: 'xa_minh_tam', province_code: 4 },
  { name: 'Xã Phan Thanh', code: 1768, division_type: 'xã', codename: 'xa_phan_thanh', province_code: 4 },
  { name: 'Xã Tam Kim', code: 1774, division_type: 'xã', codename: 'xa_tam_kim', province_code: 4 },
  { name: 'Xã Thành Công', code: 1777, division_type: 'xã', codename: 'xa_thanh_cong', province_code: 4 },
  { name: 'Xã Đông Khê', code: 1786, division_type: 'xã', codename: 'xa_dong_khe', province_code: 4 },
  { name: 'Xã Canh Tân', code: 1789, division_type: 'xã', codename: 'xa_canh_tan', province_code: 4 },
  { name: 'Xã Kim Đồng', code: 1792, division_type: 'xã', codename: 'xa_kim_dong', province_code: 4 },
  { name: 'Xã Minh Khai', code: 1795, division_type: 'xã', codename: 'xa_minh_khai', province_code: 4 },
  { name: 'Xã Thạch An', code: 1807, division_type: 'xã', codename: 'xa_thach_an', province_code: 4 },
  { name: 'Xã Đức Long', code: 1822, division_type: 'xã', codename: 'xa_duc_long', province_code: 4 },
];

wardsCache.set(4, INITIAL_CAO_BANG_WARDS);

export const addressService = {
  getProvinces(): ProvinceItem[] {
    return VIETNAM_PROVINCES;
  },

  getProvinceOptions() {
    return PROVINCE_OPTIONS;
  },

  findProvince(query: string | number): ProvinceItem | undefined {
    if (!query) return undefined;
    if (typeof query === 'number') {
      return VIETNAM_PROVINCES.find((p) => p.code === query);
    }
    const q = String(query).trim().toLowerCase();
    return VIETNAM_PROVINCES.find(
      (p) =>
        p.name.toLowerCase() === q ||
        p.name.toLowerCase().replace(/^(tỉnh|thành phố)\s+/i, '') === q.replace(/^(tỉnh|thành phố)\s+/i, '') ||
        p.codename === q ||
        String(p.code) === q
    );
  },

  async fetchWardsByProvinceCode(provinceCode: number): Promise<WardItem[]> {
    if (!provinceCode) return [];
    if (wardsCache.has(provinceCode)) {
      return wardsCache.get(provinceCode)!;
    }

    // Try reading localStorage cache
    try {
      const stored = localStorage.getItem(`vn_wards_${provinceCode}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          wardsCache.set(provinceCode, parsed);
          return parsed;
        }
      }
    } catch {}

    // Fetch from open-api
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`https://provinces.open-api.vn/api/v2/p/${provinceCode}?depth=2`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        const wards: WardItem[] = Array.isArray(data.wards) ? data.wards : [];
        wardsCache.set(provinceCode, wards);
        try {
          localStorage.setItem(`vn_wards_${provinceCode}`, JSON.stringify(wards));
        } catch {}
        return wards;
      }
    } catch (e) {
      console.warn(`[addressService] Failed to fetch wards for province ${provinceCode}`, e);
    }

    // Fallback if province is 4
    if (provinceCode === 4) return INITIAL_CAO_BANG_WARDS;
    return [];
  },

  async getWardOptionsByProvince(provinceNameOrCode: string | number): Promise<{ label: string; value: string; code: number }[]> {
    const province = this.findProvince(provinceNameOrCode);
    if (!province) return [];
    const wards = await this.fetchWardsByProvinceCode(province.code);
    return wards.map((w) => ({
      label: w.name,
      value: w.name,
      code: w.code,
    }));
  },
};
