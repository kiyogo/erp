import { useCompanyIdentity } from '../services/companyIdentity';

/** Tên doanh nghiệp theo hồ sơ công ty (qua thông tin công khai, nhân viên cũng đọc được); rỗng cho tới khi tải xong hoặc khi chưa khai báo. */
export const useCompanyName = (): string => useCompanyIdentity().companyName.normalize('NFC');
