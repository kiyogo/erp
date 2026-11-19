import axios from 'axios';
import { requestSecurityPin } from './securityPinPrompt';
import { requestWorkflowOtp } from './workflowOtpPrompt';
import { PasskeyCancelled, explainPasskeyError, isPasskeySupported, requestOptionsFromJson, serializeAssertion } from '../utils/webauthnEncoding';

type SecurityPinRetryConfig = NonNullable<Parameters<typeof axios.request>[0]> & {
  __securityPinPromptCount?: number;
};

type WorkflowOtpRetryConfig = NonNullable<Parameters<typeof axios.request>[0]> & {
  __workflowOtpPromptCount?: number;
};

// ===== Axios instance =====
const api = axios.create({
  baseURL: (import.meta as any).env.VITE_API_URL ?? '/api/v1',
  timeout: 10000,
});

// ===== Bằng chứng passkey =====
// Máy chủ yêu cầu bằng chứng vừa xác thực bằng khóa truy cập khi người dùng bật bảo vệ chữ ký số. Bằng chứng gắn với phiên và
// hết hạn sau vài phút nên được giữ trong bộ nhớ để một thao tác nhiều lần ghi chỉ hỏi khóa một lần.
let passkeyProof: { token: string; expiresAt: number } | null = null;
let passkeyProofPending: Promise<string> | null = null;

export const clearPasskeyProof = () => { passkeyProof = null; };

/** Xác thực bằng khóa truy cập đã đăng ký và nhận bằng chứng từ máy chủ. Ném PasskeyCancelled nếu người dùng hủy. */
export const requestPasskeyProof = (): Promise<string> => {
  if (passkeyProof && passkeyProof.expiresAt > Date.now() + 5_000) return Promise.resolve(passkeyProof.token);
  if (passkeyProofPending) return passkeyProofPending;
  passkeyProofPending = (async () => {
    if (!isPasskeySupported()) throw new Error('Trình duyệt này không hỗ trợ khóa truy cập (passkey).');
    try {
      const { data: options } = await api.post('/auth/passkeys/assertion/options', {});
      const credential = await navigator.credentials.get({ publicKey: requestOptionsFromJson(options.publicKey) }) as PublicKeyCredential | null;
      if (!credential) throw new PasskeyCancelled('Đã hủy thao tác khóa truy cập.');
      const { data } = await api.post('/auth/passkeys/assertion/verify', { challengeId: options.challengeId, credential: serializeAssertion(credential) });
      passkeyProof = { token: data.proof, expiresAt: Date.now() + Number(data.expiresInSeconds || 120) * 1000 };
      return data.proof as string;
    } catch (error) {
      throw explainPasskeyError(error);
    }
  })().finally(() => { passkeyProofPending = null; });
  return passkeyProofPending;
};

// ===== Request interceptor – tự gắn JWT =====
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('minepanel_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (passkeyProof && passkeyProof.expiresAt > Date.now() && !config.headers['X-Passkey-Proof']) config.headers['X-Passkey-Proof'] = passkeyProof.token;
  return config;
});

const isPublicPath = (pathname: string) => {
  const path = (pathname || '').toLowerCase();
  return (
    path === '/login' ||
    path.startsWith('/login') ||
    path === '/activate-account' ||
    path.startsWith('/activate-account') ||
    path === '/careers' ||
    path.startsWith('/careers/') ||
    path.includes('/employee/identity/verification') ||
    path.startsWith('/files/document')
  );
};

// ===== Response interceptor – handle 401 =====
api.interceptors.response.use(
  (res) => {
    if (typeof res.data === 'string' && String(res.headers['content-type'] ?? '').includes('text/html')) {
      return Promise.reject(new Error('Máy chủ API trả về dữ liệu không hợp lệ.'));
    }
    return res;
  },
  async (err) => {
    const securityCode = err.response?.data?.code;
    if (securityCode === 'WORKFLOW_OTP_REQUIRED' || securityCode === 'WORKFLOW_OTP_INVALID') {
      const config = err.config as WorkflowOtpRetryConfig | undefined;
      const promptCount = Number(config?.__workflowOtpPromptCount || 0);
      if (!config || promptCount >= 8) return Promise.reject(err);
      try {
        const code = await requestWorkflowOtp(securityCode === 'WORKFLOW_OTP_INVALID' ? err.response?.data?.message : '');
        config.headers = { ...config.headers, 'X-Workflow-Otp': code } as any;
        config.__workflowOtpPromptCount = promptCount + 1;
        return await api.request(config as any);
      } catch (promptError) {
        return Promise.reject(promptError);
      }
    }
    if (securityCode === 'PASSKEY_PROOF_REQUIRED') {
      const config = err.config as (SecurityPinRetryConfig & { __passkeyPromptCount?: number }) | undefined;
      const promptCount = Number(config?.__passkeyPromptCount || 0);
      if (!config || promptCount >= 2) return Promise.reject(err);
      try {
        clearPasskeyProof();
        const proof = await requestPasskeyProof();
        config.headers = { ...config.headers, 'X-Passkey-Proof': proof } as any;
        config.__passkeyPromptCount = promptCount + 1;
        return await api.request(config as any);
      } catch (promptError) {
        return Promise.reject(promptError);
      }
    }
    if (securityCode === 'SECURITY_PIN_REQUIRED' || securityCode === 'SECURITY_PIN_INVALID') {
      const config = err.config as SecurityPinRetryConfig | undefined;
      const promptCount = Number(config?.__securityPinPromptCount || 0);
      if (!config || promptCount >= 8) return Promise.reject(err);
      try {
        const pin = await requestSecurityPin(securityCode === 'SECURITY_PIN_INVALID' ? err.response?.data?.message : '');
        config.headers = { ...config.headers, 'X-Security-Pin': pin } as any;
        config.__securityPinPromptCount = promptCount + 1;
        return await api.request(config as any);
      } catch (promptError) {
        return Promise.reject(promptError);
      }
    }
    if (err.response?.status === 401) {
      const isPublic = isPublicPath(window.location.pathname);
      if (!isPublic) {
        localStorage.removeItem('minepanel_token');
        localStorage.removeItem('minepanel_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

export default api;
