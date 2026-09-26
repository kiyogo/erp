import React, { useState } from 'react';
import { Typography, Alert } from '../custom-ui';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, loginWithGoogle } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const targetEmail = email.trim();
    const targetPassword = password.trim();

    if (!targetEmail || !targetPassword) {
      setError('Vui lòng nhập đầy đủ tài khoản/email và mật khẩu');
      setLoading(false);
      return;
    }

    try {
      await login(targetEmail, targetPassword);
      const rawUser = localStorage.getItem('minepanel_user');
      let role = '';
      if (rawUser) {
        try {
          role = (JSON.parse(rawUser)?.role || '').toUpperCase();
        } catch {}
      }
      const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN' || role === 'SYSTEM_ADMIN' || role === 'HR_MANAGER' || role === 'MANAGER';
      if (isAdmin) {
        navigate('/admin/dashboard');
      } else {
        navigate('/employee/home');
      }
    } catch (err: any) {
      const serverMessage = err?.response?.data?.message || err?.message;
      setError(typeof serverMessage === 'string' && serverMessage.trim()
        ? serverMessage
        : 'Không thể đăng nhập. Vui lòng kiểm tra kết nối và thông tin tài khoản.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      let ssoConfig: any = null;
      try {
        const raw = localStorage.getItem('google_sso_config');
        if (raw) ssoConfig = JSON.parse(raw);
      } catch {}

      const user = await loginWithGoogle({
        clientKey: ssoConfig?.clientKey || undefined,
        allowedDomain: ssoConfig?.allowedDomain || undefined,
      });

      const role = (user?.role || '').toUpperCase();
      const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN' || role === 'SYSTEM_ADMIN' || role === 'HR_MANAGER' || role === 'MANAGER';
      if (isAdmin) {
        navigate('/admin/dashboard');
      } else {
        navigate('/employee/home');
      }
    } catch (err: any) {
      console.error('Google login error:', err);
      const serverMessage = err?.response?.data?.message || err?.message;
      setError(typeof serverMessage === 'string' && serverMessage.trim()
        ? serverMessage
        : 'Không thể đăng nhập bằng Google. Vui lòng thử lại hoặc liên hệ Quản trị viên.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F5F5F5',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          width: 360,
          background: '#FFFFFF',
          borderRadius: 8,
          padding: '40px 36px',
          border: '1px solid #E0E0E0',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 7,
              background: '#18181B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>K</span>
          </div>
          <Title level={4} style={{ margin: 0, fontWeight: 700, letterSpacing: '0.02em' }}>
            KIYOVN
          </Title>
        </div>

        <Text style={{ color: '#757575', fontSize: 13, display: 'block', marginBottom: 20 }}>
          Hệ thống Quản lý Doanh nghiệp KIYOVN
        </Text>

        {error && (
          <Alert message={error} type="error" showIcon style={{ marginBottom: 16, borderRadius: 5 }} />
        )}

        <form onSubmit={handleSubmit} autoComplete="off">
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                border: '1px solid #D9D9D9',
                borderRadius: 6,
                padding: '6px 12px',
                background: '#FFFFFF',
              }}
            >
              <UserOutlined style={{ color: '#9CA3AF', marginRight: 8, fontSize: 14 }} />
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email hoặc tên đăng nhập"
                autoComplete="username"
                maxLength={254}
                required
                style={{
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                  fontSize: 13.5,
                  color: '#111827',
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                border: '1px solid #D9D9D9',
                borderRadius: 6,
                padding: '6px 12px',
                background: '#FFFFFF',
              }}
            >
              <LockOutlined style={{ color: '#9CA3AF', marginRight: 8, fontSize: 14 }} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mật khẩu"
                autoComplete="current-password"
                minLength={6}
                maxLength={256}
                required
                style={{
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                  fontSize: 13.5,
                  color: '#111827',
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              height: 38,
              marginTop: 20,
              borderRadius: 6,
              background: '#009688',
              color: '#FFFFFF',
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#00796B')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#009688')}
          >
            {loading ? 'Đang xác thực...' : 'Đăng nhập hệ thống'}
          </button>
        </form>

        <div style={{ margin: '18px 0 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>Hoặc</span>
          <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          title="Đăng nhập bằng Google"
          style={{
            width: '100%',
            height: 40,
            borderRadius: 6,
            background: '#FFFFFF',
            border: '1px solid #D1D5DB',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#F9FAFB';
            e.currentTarget.style.borderColor = '#9CA3AF';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#FFFFFF';
            e.currentTarget.style.borderColor = '#D1D5DB';
          }}
        >
          <img src="/google.png" alt="Google" style={{ width: 18, height: 18, objectFit: 'contain' }} />
          <span style={{ fontSize: 13.5, fontWeight: 500, color: '#374151' }}>
            Đăng nhập bằng Google
          </span>
        </button>

        <Text style={{ display: 'block', textAlign: 'center', marginTop: 20, color: '#9CA3AF', fontSize: 12 }}>
          KIYOVN Enterprise v2.0 · © 2026
        </Text>
      </div>
    </div>
  );
};

export default Login;

