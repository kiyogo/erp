// =========================================================================
// Real Two-Factor Authentication (2FA / 2SV) Helper & Storage Utility
// RFC 6238 TOTP, Backup Codes, Device Detection & User-Scoped Persistence
// =========================================================================

export interface TwoFactorPasskey {
  id: string;
  name: string;
  addedAt: string;
}

export interface TwoFactorDevice {
  id: string;
  name: string;
  location: string;
  status: string;
  iconType: 'desktop' | 'laptop' | 'mobile';
}

export interface User2FAState {
  isEnabled: boolean;
  authenticatorConfigured: boolean;
  secretKey: string;
  backupCodes: string[];
  passkeys: TwoFactorPasskey[];
  devices: TwoFactorDevice[];
  phoneNumber: string;
  smsOtpEnabled: boolean;
  emailOtpEnabled: boolean;
}

// Chuyển đổi chuỗi Base32 sang Uint8Array
export function base32ToBytes(base32: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  const clean = (base32 || '').toUpperCase().replace(/=+$/, '');
  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean.charAt(i));
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

// Sinh mã bí mật Base32 ngẫu nhiên an toàn chuẩn RFC
export function generateBase32Secret(length = 20): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const randomBytes = new Uint8Array(length);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < length; i++) randomBytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(randomBytes).map((b) => alphabet[b % alphabet.length]).join('');
}

// Sinh mã TOTP 6 số chuẩn RFC 6238 dựa trên Web Crypto API
export async function generateTOTP(secret: string, timeStepOffset = 0): Promise<string> {
  try {
    const keyBytes = base32ToBytes(secret);
    if (!keyBytes || keyBytes.length === 0) return '';

    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      new Uint8Array(keyBytes).buffer,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );

    const epoch = Math.floor(Date.now() / 1000 / 30) + timeStepOffset;
    const timeBuffer = new ArrayBuffer(8);
    const timeView = new DataView(timeBuffer);
    timeView.setBigUint64(0, BigInt(epoch));

    const hmac = await window.crypto.subtle.sign('HMAC', cryptoKey, timeBuffer);
    const hmacBytes = new Uint8Array(hmac);
    const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
    const code =
      ((hmacBytes[offset] & 0x7f) << 24) |
      ((hmacBytes[offset + 1] & 0xff) << 16) |
      ((hmacBytes[offset + 2] & 0xff) << 8) |
      (hmacBytes[offset + 3] & 0xff);

    return String(code % 1000000).padStart(6, '0');
  } catch (error) {
    console.error('[2FA] Error calculating TOTP:', error);
    return '';
  }
}

// Xác thực mã OTP người dùng nhập (hỗ trợ bù trừ lệch giờ -1, 0, +1 chu kỳ 30s)
export async function verifyTOTP(secret: string, enteredCode: string): Promise<boolean> {
  const clean = (enteredCode || '').trim();
  if (!/^\d{6}$/.test(clean)) return false;

  for (const offset of [0, -1, 1]) {
    const expected = await generateTOTP(secret, offset);
    if (expected && expected === clean) {
      return true;
    }
  }
  return false;
}

// Sinh 10 mã khôi phục dự phòng định dạng XXXX-XXXX ngẫu nhiên
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const arr = new Uint32Array(1);
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(arr);
    } else {
      arr[0] = Math.floor(Math.random() * 90000000) + 10000000;
    }
    const num = String(10000000 + (arr[0] % 90000000));
    codes.push(`${num.slice(0, 4)}-${num.slice(4)}`);
  }
  return codes;
}

// Lấy thông tin thiết bị thực tế đang truy cập
export function getLiveCurrentDevice(): TwoFactorDevice {
  if (typeof navigator === 'undefined') {
    return {
      id: 'current-device',
      name: 'Trình duyệt Web',
      location: 'Việt Nam',
      status: 'Đang hoạt động',
      iconType: 'desktop',
    };
  }

  const ua = navigator.userAgent;
  let browser = 'Chrome';
  if (ua.includes('Edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('Firefox/')) browser = 'Mozilla Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Apple Safari';
  else if (ua.includes('Opera') || ua.includes('OPR/')) browser = 'Opera';

  let os = 'Windows PC';
  let iconType: 'desktop' | 'laptop' | 'mobile' = 'desktop';

  if (ua.includes('Macintosh') || ua.includes('Mac OS')) {
    os = 'macOS';
    iconType = 'laptop';
  } else if (ua.includes('iPhone')) {
    os = 'iPhone';
    iconType = 'mobile';
  } else if (ua.includes('iPad')) {
    os = 'iPad';
    iconType = 'mobile';
  } else if (ua.includes('Android')) {
    os = 'Android';
    iconType = 'mobile';
  } else if (ua.includes('Linux')) {
    os = 'Linux';
    iconType = 'desktop';
  }

  return {
    id: 'current-session-dev',
    name: `${os} (${browser}) - Thiết bị này`,
    location: 'Việt Nam',
    status: 'Đang hoạt động',
    iconType,
  };
}

// Xóa bỏ triệt để các dữ liệu giả (fake/mock) lưu trữ dùng chung trước đây
export function cleanupLegacyGlobal2FAKeys(): void {
  if (typeof localStorage === 'undefined') return;
  const legacyGlobalKeys = [
    'two_factor_auth_enabled',
    'two_factor_authenticator_configured',
    'two_factor_backup_codes',
    'two_factor_passkeys',
    'two_factor_devices',
    'two_factor_phone',
    'two_factor_secret',
    'two_factor_email_otp_enabled',
  ];
  for (const k of legacyGlobalKeys) {
    localStorage.removeItem(k);
  }
}

// Lấy tiền tố lưu trữ riêng cho từng người dùng
export function getUser2FAScopeKey(userKey?: string): string {
  const key = (userKey || '').trim() || 'default_user';
  return `2fa_${key}`;
}

// Đọc toàn bộ trạng thái 2FA của người dùng hiện tại
export function getUser2FAState(userKey: string, fallbackPhone = '', _fallbackEmail = ''): User2FAState {
  const scope = getUser2FAScopeKey(userKey);

  // Mặc định hoàn toàn TẮT (false) đối với tài khoản mới tạo!
  const isEnabled = localStorage.getItem(`${scope}_enabled`) === 'true';
  const authenticatorConfigured = localStorage.getItem(`${scope}_auth_configured`) === 'true';

  let secretKey = localStorage.getItem(`${scope}_secret`);
  if (!secretKey) {
    secretKey = generateBase32Secret();
    try {
      localStorage.setItem(`${scope}_secret`, secretKey);
    } catch {}
  }

  let backupCodes: string[] = [];
  const rawBackupCodes = localStorage.getItem(`${scope}_backup_codes`);
  if (rawBackupCodes) {
    try {
      const parsed = JSON.parse(rawBackupCodes);
      if (Array.isArray(parsed)) backupCodes = parsed;
    } catch {}
  }

  let passkeys: TwoFactorPasskey[] = [];
  const rawPasskeys = localStorage.getItem(`${scope}_passkeys`);
  if (rawPasskeys) {
    try {
      const parsed = JSON.parse(rawPasskeys);
      if (Array.isArray(parsed)) passkeys = parsed;
    } catch {}
  }

  let devices: TwoFactorDevice[] = [getLiveCurrentDevice()];
  const rawDevices = localStorage.getItem(`${scope}_devices`);
  if (rawDevices) {
    try {
      const parsed = JSON.parse(rawDevices);
      if (Array.isArray(parsed) && parsed.length > 0) devices = parsed;
    } catch {}
  }

  const phoneNumber = localStorage.getItem(`${scope}_phone`) || fallbackPhone || '';
  const smsOtpEnabled = localStorage.getItem(`${scope}_sms_enabled`) === 'true';
  const emailOtpEnabled = localStorage.getItem(`${scope}_email_enabled`) === 'true';

  return {
    isEnabled,
    authenticatorConfigured,
    secretKey,
    backupCodes,
    passkeys,
    devices,
    phoneNumber,
    smsOtpEnabled,
    emailOtpEnabled,
  };
}

// Lưu trạng thái 2FA của người dùng
export function saveUser2FAState(userKey: string, patch: Partial<User2FAState>): void {
  if (typeof localStorage === 'undefined') return;
  const scope = getUser2FAScopeKey(userKey);

  if (patch.isEnabled !== undefined) {
    localStorage.setItem(`${scope}_enabled`, String(patch.isEnabled));
    localStorage.setItem('kiyovn_2sv_enabled', String(patch.isEnabled));
  }

  if (patch.authenticatorConfigured !== undefined) {
    localStorage.setItem(`${scope}_auth_configured`, String(patch.authenticatorConfigured));
    localStorage.setItem('kiyovn_2sv_auth_linked', String(patch.authenticatorConfigured));
  }

  if (patch.secretKey !== undefined) {
    localStorage.setItem(`${scope}_secret`, patch.secretKey);
  }

  if (patch.backupCodes !== undefined) {
    localStorage.setItem(`${scope}_backup_codes`, JSON.stringify(patch.backupCodes));
    localStorage.setItem('kiyovn_2sv_has_backup_codes', String(patch.backupCodes.length > 0));
  }

  if (patch.passkeys !== undefined) {
    localStorage.setItem(`${scope}_passkeys`, JSON.stringify(patch.passkeys));
    localStorage.setItem('kiyovn_2sv_passkeys', JSON.stringify(patch.passkeys));
  }

  if (patch.devices !== undefined) {
    localStorage.setItem(`${scope}_devices`, JSON.stringify(patch.devices));
  }

  if (patch.phoneNumber !== undefined) {
    localStorage.setItem(`${scope}_phone`, patch.phoneNumber);
  }

  if (patch.smsOtpEnabled !== undefined) {
    localStorage.setItem(`${scope}_sms_enabled`, String(patch.smsOtpEnabled));
    localStorage.setItem('kiyovn_2sv_phone_linked', String(patch.smsOtpEnabled));
  }

  if (patch.emailOtpEnabled !== undefined) {
    localStorage.setItem(`${scope}_email_enabled`, String(patch.emailOtpEnabled));
    localStorage.setItem('kiyovn_2sv_email_linked', String(patch.emailOtpEnabled));
  }
}
