import { useEffect, useState } from 'react';
import { systemApi, type CompanyIdentity } from '../api/endpoints';

// Tên, mã số thuế, địa chỉ, người đại diện của doanh nghiệp từ hồ sơ doanh nghiệp (mọi người đã đăng nhập đọc được), dùng cho tiêu đề biên bản,
// tem tài sản, Bên A của hợp đồng thay cho tên công ty viết cứng. Tải một lần mỗi phiên trang.
const EMPTY: CompanyIdentity = { companyName: '', taxCode: '', address: '', representative: '', representativeTitle: '' };
let pending: Promise<CompanyIdentity> | null = null;

export function loadCompanyIdentity(): Promise<CompanyIdentity> {
  pending ??= systemApi.getCompanyIdentity().then((response) => ({ ...EMPTY, ...response.data })).catch(() => { pending = null; return EMPTY; });
  return pending;
}

export function useCompanyIdentity(): CompanyIdentity {
  const [identity, setIdentity] = useState<CompanyIdentity>(EMPTY);
  useEffect(() => { let active = true; void loadCompanyIdentity().then((value) => { if (active) setIdentity(value); }); return () => { active = false; }; }, []);
  return identity;
}

export const companyHeading = (identity: CompanyIdentity) => (identity.companyName || 'Chưa khai báo tên doanh nghiệp').toUpperCase();
