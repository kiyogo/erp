import axios from 'axios';
import { resolveApiBaseUrl } from '../config/runtimeApiConfig';

// ===== Axios instance =====
const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 10000,
});

export function refreshApiBaseUrl() {
  api.defaults.baseURL = resolveApiBaseUrl();
}

window.addEventListener('kiyo-runtime-config', refreshApiBaseUrl);

// ===== Request interceptor – tự gắn JWT =====
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('minepanel_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ===== Response interceptor – handle 401 =====
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (
      err.response?.status === 401 &&
      window.location.pathname !== '/login' &&
      !window.location.pathname.toLowerCase().includes('/employee/identity/verification')
    ) {
      localStorage.removeItem('minepanel_token');
      localStorage.removeItem('minepanel_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export default api;
