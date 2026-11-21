// Mã hóa các trường nhạy cảm trong `employee_profiles.details_json` bằng AES-256-GCM của crypto.mjs (mỗi nhóm một khóa con riêng):
// số giấy tờ, tài khoản ngân hàng, mã số thuế, địa chỉ thường trú dùng khóa `profile`; ảnh khuôn mặt, video và ảnh giấy tờ của eKYC
// (dữ liệu sinh trắc học, Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15) dùng khóa `biometric`. Ghi hồ sơ thì gọi encrypt, trả hồ sơ cho người
// được xem thì gọi decrypt; giá trị đã mã hóa không mã hóa lại, giá trị cũ chưa mã hóa vẫn đọc được.
import { decryptField, encryptField, isEncrypted } from './crypto.mjs';

export const PROFILE_SENSITIVE_FIELDS = ['idNumber', 'docNumber', 'bankAccount', 'taxCode', 'resAddress'];
export const BIOMETRIC_IMAGE_FIELDS = ['livePhotoUrl', 'liveVideoUrl', 'cardFrontUrl', 'cardBackUrl', 'cardAvatarUrl'];
const DOMAIN_OF = Object.fromEntries([...PROFILE_SENSITIVE_FIELDS.map((field) => [field, 'profile']), ...BIOMETRIC_IMAGE_FIELDS.map((field) => [field, 'biometric'])]);

export function encryptProfileDetails(details) {
  const result = { ...details };
  for (const [field, domain] of Object.entries(DOMAIN_OF)) {
    if (result[field] && typeof result[field] === 'string' && !isEncrypted(result[field])) result[field] = encryptField(result[field], domain);
  }
  return result;
}

export function decryptProfileDetails(details) {
  const result = { ...details };
  for (const [field, domain] of Object.entries(DOMAIN_OF)) if (result[field]) result[field] = decryptField(result[field], domain);
  return result;
}

// Hồ sơ đăng nhập (/auth/profile) không cần ảnh sinh trắc học: bỏ hẳn để không gửi kèm mọi lần tải trang.
export function withoutBiometricImages(details) {
  return Object.fromEntries(Object.entries(details).filter(([field]) => !BIOMETRIC_IMAGE_FIELDS.includes(field)));
}
