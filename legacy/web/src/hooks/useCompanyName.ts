import { useEffect, useState } from 'react';
import { systemApi } from '../api/endpoints';

/** Tên doanh nghiệp theo hồ sơ công ty; rỗng cho tới khi tải xong hoặc khi chưa khai báo. */
export const useCompanyName = (): string => {
  const [name, setName] = useState('');
  useEffect(() => {
    let active = true;
    systemApi.getCompanyProfile()
      .then((response) => { if (active) setName(String(response.data.profile.companyName || '').normalize('NFC')); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  return name;
};
