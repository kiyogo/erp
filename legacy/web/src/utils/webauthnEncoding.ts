// Chuyển đổi giữa JSON của máy chủ và đối tượng WebAuthn của trình duyệt. Không gọi mạng, không giữ trạng thái.

export class PasskeyCancelled extends Error {}

export const isPasskeySupported = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.PublicKeyCredential && navigator.credentials);

export const bufferToBase64Url = (buffer: ArrayBuffer): string => {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const base64UrlToBuffer = (value: string): ArrayBuffer => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
};

type JsonDescriptor = { type: 'public-key'; id: string; transports?: string[] };

export const creationOptionsFromJson = (json: any): PublicKeyCredentialCreationOptions => ({
  ...json,
  challenge: base64UrlToBuffer(json.challenge),
  user: { ...json.user, id: base64UrlToBuffer(json.user.id) },
  excludeCredentials: (json.excludeCredentials || []).map((item: JsonDescriptor) => ({ ...item, id: base64UrlToBuffer(item.id) })),
});

export const requestOptionsFromJson = (json: any): PublicKeyCredentialRequestOptions => ({
  ...json,
  challenge: base64UrlToBuffer(json.challenge),
  allowCredentials: (json.allowCredentials || []).map((item: JsonDescriptor) => ({ ...item, id: base64UrlToBuffer(item.id) })),
});

export const serializeAttestation = (credential: PublicKeyCredential) => {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id, rawId: bufferToBase64Url(credential.rawId), type: credential.type,
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      attestationObject: bufferToBase64Url(response.attestationObject),
      transports: typeof response.getTransports === 'function' ? response.getTransports() : [],
    },
  };
};

export const serializeAssertion = (credential: PublicKeyCredential) => {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id, rawId: bufferToBase64Url(credential.rawId), type: credential.type,
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      signature: bufferToBase64Url(response.signature),
      userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : undefined,
    },
  };
};

/** Đổi lỗi của trình duyệt hoặc máy chủ thành thông báo tiếng Việt; hủy bỏ được tách riêng bằng PasskeyCancelled. */
export const explainPasskeyError = (error: any): Error => {
  if (error instanceof PasskeyCancelled) return error;
  if (error?.name === 'NotAllowedError' || error?.name === 'AbortError') return new PasskeyCancelled('Đã hủy thao tác khóa truy cập.');
  if (error?.name === 'InvalidStateError') return new Error('Khóa này đã được đăng ký trên thiết bị.');
  if (error?.name === 'SecurityError') return new Error('Địa chỉ trang hiện tại không được phép dùng khóa truy cập.');
  const serverMessage = error?.response?.data?.message;
  if (serverMessage) return new Error(serverMessage);
  return error instanceof Error ? error : new Error('Không thực hiện được thao tác khóa truy cập.');
};
