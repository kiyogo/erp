import axios from 'axios';

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
    path.includes('/employee/identity/verification') ||
    path.startsWith('/files/document')
  );
};

// ===== Response interceptor – handle 401 =====
api.interceptors.response.use(
  (res) => res,
  (err) => {
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
