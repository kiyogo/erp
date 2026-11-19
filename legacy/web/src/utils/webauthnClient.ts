import { passkeysApi, type PasskeyItem } from '../api/endpoints';
import {
  PasskeyCancelled, creationOptionsFromJson, explainPasskeyError, isPasskeySupported,
  requestOptionsFromJson, serializeAssertion, serializeAttestation,
} from './webauthnEncoding';

const requireSupport = () => {
  if (!isPasskeySupported()) throw new Error('Trình duyệt này không hỗ trợ khóa truy cập (passkey).');
};

/** Đăng ký một khóa truy cập mới cho tài khoản đang đăng nhập; máy chủ xác minh trước khi lưu. */
export async function registerPasskey(name: string): Promise<PasskeyItem> {
  requireSupport();
  try {
    const { data: options } = await passkeysApi.registrationOptions();
    const credential = await navigator.credentials.create({ publicKey: creationOptionsFromJson(options.publicKey) }) as PublicKeyCredential | null;
    if (!credential) throw new PasskeyCancelled('Đã hủy thao tác khóa truy cập.');
    const { data } = await passkeysApi.registrationVerify({ challengeId: options.challengeId, name, credential: serializeAttestation(credential) });
    return data.passkey;
  } catch (error) {
    throw explainPasskeyError(error);
  }
}

/** Đăng nhập không mật khẩu bằng khóa truy cập; trả về token và hồ sơ do máy chủ cấp sau khi xác minh chữ ký. */
export async function loginWithPasskeySession(): Promise<{ token: string; user: unknown }> {
  requireSupport();
  try {
    const { data: options } = await passkeysApi.loginOptions();
    const credential = await navigator.credentials.get({ publicKey: requestOptionsFromJson(options.publicKey) }) as PublicKeyCredential | null;
    if (!credential) throw new PasskeyCancelled('Đã hủy thao tác khóa truy cập.');
    const { data } = await passkeysApi.loginVerify({ challengeId: options.challengeId, credential: serializeAssertion(credential) });
    return { token: String(data.access_token || data.token || ''), user: data.user };
  } catch (error) {
    throw explainPasskeyError(error);
  }
}
