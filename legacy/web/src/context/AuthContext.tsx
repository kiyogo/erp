import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authApi } from '../api/endpoints';
import { dataService } from '../services/dataService';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  employeeCode?: string;
  code?: string;
  onboardingCompleted?: boolean;
}

interface AuthCtx {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (data?: any) => Promise<User>;
  establishSession: (token: string, user: unknown) => void;
  logout: () => void;
  isLoggedIn: boolean;
}

const TOKEN_KEY = 'minepanel_token';
const USER_KEY = 'minepanel_user';
const AuthContext = createContext<AuthCtx | null>(null);

const normalizeUser = (value: unknown): User | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const id = typeof candidate.id === 'string' || typeof candidate.id === 'number' ? String(candidate.id) : '';
  const email = typeof candidate.email === 'string' ? candidate.email.trim() : '';
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : typeof candidate.fullName === 'string' ? candidate.fullName.trim() : '';
  const role = typeof candidate.role === 'string' ? candidate.role.trim() : '';
  const employeeCode = typeof candidate.employeeCode === 'string' ? candidate.employeeCode.trim() : typeof candidate.code === 'string' ? candidate.code.trim() : undefined;
  const code = typeof candidate.code === 'string' ? candidate.code.trim() : typeof candidate.employeeCode === 'string' ? candidate.employeeCode.trim() : undefined;
  const onboardingCompleted = candidate.onboardingCompleted === true || candidate.onboardingDone === true;
  return id && email && name && role ? { id, email, name, role, employeeCode: employeeCode || code, code: code || employeeCode, onboardingCompleted } : null;
};

const readStoredSession = (): { token: string; user: User } | null => {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const rawUser = localStorage.getItem(USER_KEY);
    if (!token || !rawUser) return null;
    const user = normalizeUser(JSON.parse(rawUser));
    return user ? { token, user } : null;
  } catch {
    return null;
  }
};

const clearStoredSession = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    // Remove legacy demo values so they can never restore an authenticated session.
    localStorage.removeItem('kiyovn_token');
    localStorage.removeItem('kiyovn_user');
  } catch {
    // Storage can be unavailable in a private browser context; in-memory state is still cleared.
  }
};

const persistSession = (token: string, user: User) => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // An authenticated session still remains available until the tab is closed.
  }
};

const getResponseUser = (data: unknown): User | null => {
  if (!data || typeof data !== 'object') return null;
  const payload = data as Record<string, unknown>;
  return normalizeUser(payload.user ?? payload.profile ?? payload.data);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialSession = readStoredSession();
  const [user, setUser] = useState<User | null>(initialSession?.user ?? null);
  const [token, setToken] = useState<string | null>(initialSession?.token ?? null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const validateStoredSession = async () => {
      if (!initialSession) {
        if (active) setLoading(false);
        return;
      }

      try {
        const response = await authApi.getProfile();
        const verifiedUser = getResponseUser(response.data);
        if (!verifiedUser) throw new Error('Phản hồi hồ sơ đăng nhập không hợp lệ.');
        if (active) {
          setUser(verifiedUser);
          persistSession(initialSession.token, verifiedUser);
          void dataService.syncInitialData();
        }
      } catch (err: any) {
        const isOffline = err?.response?.status === 502 || err?.response?.status === 504 || !err?.response || err?.code === 'ERR_NETWORK';
        if (isOffline && initialSession?.user) {
          if (active) {
            setUser(initialSession.user);
            setToken(initialSession.token);
            void dataService.syncInitialData();
          }
        } else {
          clearStoredSession();
          if (active) {
            setUser(null);
            setToken(null);
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void validateStoredSession();
    return () => {
      active = false;
    };
  }, [initialSession?.token]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await authApi.login(email, password);
      const payload = response.data as Record<string, unknown> | undefined;
      const accessToken = typeof payload?.access_token === 'string'
        ? payload.access_token
        : typeof payload?.token === 'string'
          ? payload.token
          : '';
      const authenticatedUser = getResponseUser(payload);

      if (!accessToken || !authenticatedUser) {
        throw new Error('Máy chủ trả về phiên đăng nhập không hợp lệ.');
      }

      setToken(accessToken);
      setUser(authenticatedUser);
      persistSession(accessToken, authenticatedUser);
      void dataService.syncInitialData();
    } catch (err: any) {
      throw err;
    }
  }, []);

  const loginWithGoogle = useCallback(async (googleData?: any) => {
    try {
      const response = await authApi.loginGoogle(googleData || {});
      const payload = response.data as Record<string, unknown> | undefined;
      const accessToken = typeof payload?.access_token === 'string'
        ? payload.access_token
        : typeof payload?.token === 'string'
          ? payload.token
          : '';
      const authenticatedUser = getResponseUser(payload);

      if (!accessToken || !authenticatedUser) {
        throw new Error('Máy chủ trả về phiên đăng nhập Google không hợp lệ.');
      }

      setToken(accessToken);
      setUser(authenticatedUser);
      persistSession(accessToken, authenticatedUser);
      void dataService.syncInitialData();
      return authenticatedUser;
    } catch (err: any) {
      throw err;
    }
  }, []);

  const establishSession = useCallback((accessToken: string, candidate: unknown) => {
    const authenticatedUser = normalizeUser(candidate);
    if (!accessToken || !authenticatedUser) throw new Error('Phiên đăng nhập không hợp lệ.');
    setToken(accessToken);
    setUser(authenticatedUser);
    persistSession(accessToken, authenticatedUser);
    void dataService.syncInitialData();
  }, []);

  const logout = useCallback(() => {
    clearStoredSession();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, loginWithGoogle, establishSession, logout, isLoggedIn: Boolean(token && user) }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth phải dùng trong AuthProvider');
  return context;
};
