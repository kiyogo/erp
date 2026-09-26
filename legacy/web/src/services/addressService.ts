import { collectionsApi } from '../api/endpoints';

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

export const PROVINCE_OPTIONS: { label: string; value: string; code: number }[] = VIETNAM_PROVINCES.map((p) => ({
  label: p.name,
  value: p.name,
  code: p.code,
}));

let provincesLoaded = true;
let provincesCache: ProvinceItem[] = [...VIETNAM_PROVINCES];
const wardsCache = new Map<number, WardItem[]>();

const provinceMatches = (province: ProvinceItem, query: string | number) => {
  if (typeof query === 'number') return Number(province.code) === query;
  const q = String(query || '').trim().toLowerCase();
  const withoutPrefix = q.replace(/^(tỉnh|thành phố)\s+/i, '');
  return (
    province.name.toLowerCase() === q ||
    province.name.toLowerCase().replace(/^(tỉnh|thành phố)\s+/i, '') === withoutPrefix ||
    province.codename === q ||
    String(province.code) === q
  );
};

export const addressService = {
  async loadProvinces(): Promise<ProvinceItem[]> {
    if (provincesLoaded && provincesCache.length > 0) return provincesCache;
    try {
      const response = await collectionsApi.get<ProvinceItem>('address_provinces', { limit: 500, sort: 'code', order: 'asc' });
      const apiList = (response.data?.data || []).filter((item) => item?.name && item?.code);
      if (apiList.length > 0) {
        provincesCache = apiList;
      } else {
        provincesCache = [...VIETNAM_PROVINCES];
      }
    } catch {
      provincesCache = [...VIETNAM_PROVINCES];
    }
    provincesLoaded = true;
    return provincesCache;
  },

  getProvinces(): ProvinceItem[] {
    if (!provincesLoaded && typeof window !== 'undefined') void this.loadProvinces();
    return provincesCache.length > 0 ? provincesCache : VIETNAM_PROVINCES;
  },

  async getProvinceOptionsAsync(): Promise<{ label: string; value: string; code: number }[]> {
    const provinces = await this.loadProvinces();
    return provinces.map((p) => ({ label: p.name, value: p.name, code: p.code }));
  },

  getProvinceOptions(): { label: string; value: string; code: number }[] {
    return this.getProvinces().map((p) => ({ label: p.name, value: p.name, code: p.code }));
  },

  findProvince(query: string | number): ProvinceItem | undefined {
    if (!query) return undefined;
    return this.getProvinces().find((province) => provinceMatches(province, query));
  },

  async fetchWardsByProvinceCode(provinceCode: number): Promise<WardItem[]> {
    if (!provinceCode) return [];
    if (wardsCache.has(provinceCode)) return wardsCache.get(provinceCode)!;

    try {
      const response = await collectionsApi.get<WardItem>('address_wards', { limit: 500, q: String(provinceCode) });
      const wards = (response.data?.data || []).filter((item) => Number(item?.province_code) === Number(provinceCode));
      wardsCache.set(provinceCode, wards);
      return wards;
    } catch {
      wardsCache.set(provinceCode, []);
      return [];
    }
  },

  async getWardOptionsByProvince(provinceNameOrCode: string | number): Promise<{ label: string; value: string; code: number }[]> {
    if (!provincesLoaded) await this.loadProvinces();
    const province = this.findProvince(provinceNameOrCode);
    if (!province) return [];
    const wards = await this.fetchWardsByProvinceCode(province.code);
    return wards.map((w) => ({ label: w.name, value: w.name, code: w.code }));
  },
};
