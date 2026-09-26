import React, { useEffect, useState } from 'react';
import { LockOutlined } from '@ant-design/icons';
import { Alert } from '../custom-ui';
import { activationApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';

const ActivateAccount: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { establishSession } = useAuth();
  const [activationToken, setActivationToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = params.get('token') || '';
    if (!token) {
      setError('Đã hết hạn kích hoạt tài khoản');
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const response = await activationApi.authorize(token);
        setActivationToken(response.data.activation_token);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Đã hết hạn kích hoạt tài khoản');
      } finally {
        setLoading(false);
      }
    })();
  }, [params]);

  const submit = async () => {
    setError('');
    const targetPassword = password.trim();
    const targetConfirmation = confirmation.trim();

    if (!targetPassword) {
      setError('Vui lòng nhập mật khẩu.');
      return;
    }
    if (targetPassword.length < 6) {
      setError('Mật khẩu cần tối thiểu 6 ký tự.');
      return;
    }
    if (targetPassword !== targetConfirmation) {
      setError('Mật khẩu nhập lại chưa khớp.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await activationApi.setPassword(activationToken, targetPassword);
      establishSession(response.data.access_token, response.data.user);
      navigate('/employee/home', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Không thể kích hoạt tài khoản.');
    } finally {
      setSubmitting(false);
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
              background: '#009688',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>K</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#18181B', letterSpacing: '0.02em' }}>
            KIYOVN
          </div>
        </div>

        <div style={{ color: '#757575', fontSize: 13, display: 'block', marginBottom: 20 }}>
          Kích hoạt tài khoản nhân sự
        </div>

        {loading ? (
          <div style={{ color: '#757575', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
            Đang kiểm tra liên kết kích hoạt…
          </div>
        ) : error && !activationToken ? (
          <Alert message={error} type="error" showIcon style={{ marginBottom: 16, borderRadius: 5 }} />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            autoComplete="off"
          >
            {error && (
              <Alert message={error} type="error" showIcon style={{ marginBottom: 16, borderRadius: 5 }} />
            )}

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
                  placeholder="Mật khẩu mới"
                  autoComplete="new-password"
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

            <div style={{ marginBottom: 20 }}>
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
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="Nhập lại mật khẩu"
                  autoComplete="new-password"
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
              disabled={submitting}
              style={{
                width: '100%',
                height: 38,
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
              {submitting ? 'Đang kích hoạt...' : 'Xác nhận'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ActivateAccount;
