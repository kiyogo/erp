import axios from 'axios';
import { requestSecurityPin } from './securityPinPrompt';
import { requestWorkflowOtp } from './workflowOtpPrompt';

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

// ===== Request interceptor – tự gắn JWT =====
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('minepanel_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
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
  (res) => res,
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
