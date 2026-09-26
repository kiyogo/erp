import React, { useEffect, useState } from 'react';
import { CheckCircleOutlined, GoogleOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Input, message } from '../custom-ui';
import { activationApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';

const GoogleClientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID as string | undefined;

const readableGoogleEmail = (credential: string) => {
  try {
    const payload = credential.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).email || '';
  } catch { return ''; }
};

const loadGoogleScript = () => new Promise<void>((resolve, reject) => {
  if ((window as any).google?.accounts?.id) { resolve(); return; }
  const current = document.querySelector('script[data-google-identity]');
  if (current) { current.addEventListener('load', () => resolve(), { once: true }); return; }
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  script.dataset.googleIdentity = 'true';
  script.onload = () => resolve();
  script.onerror = () => reject(new Error('Không tải được dịch vụ Google.'));
  document.head.appendChild(script);
});

const ActivateAccount: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { establishSession } = useAuth();
  const [activationToken, setActivationToken] = useState('');
  const [person, setPerson] = useState<any>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [googleCredential, setGoogleCredential] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = params.get('token') || '';
    if (!token) { setError('Đã hết hạn kích hoạt tài khoản'); setLoading(false); return; }
    void (async () => {
      try {
        const response = await activationApi.authorize(token);
        setActivationToken(response.data.activation_token);
        setPerson(response.data.user);
      } catch (err: any) {
        setError(err?.response?.data?.message === 'Đã hết hạn kích hoạt tài khoản' ? 'Đã hết hạn kích hoạt tài khoản' : (err?.response?.data?.message || 'Đã hết hạn kích hoạt tài khoản'));
      } finally {
        setLoading(false);
      }
    })();
  }, [params]);

  const linkGoogle = async () => {
    if (!GoogleClientId) {
      message.info('Chưa cấu hình GOOGLE_CLIENT_ID. Quản trị viên cần khai báo ID ứng dụng Google để bật liên kết Google.');
      return;
    }
    try {
      await loadGoogleScript();
      (window as any).google.accounts.id.initialize({
        client_id: GoogleClientId,
        callback: (response: any) => {
          if (!response?.credential) return;
          setGoogleCredential(response.credential);
          message.success(`Đã chọn tài khoản Google ${readableGoogleEmail(response.credential) || ''}.`);
        },
      });
      (window as any).google.accounts.id.prompt();
    } catch (err: any) {
      message.error(err?.message || 'Không thể mở liên kết Google.');
    }
  };

  const submit = async () => {
    setError('');
    if (password !== confirmation) { setError('Mật khẩu nhập lại chưa khớp.'); return; }
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError('Mật khẩu cần tối thiểu 12 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await activationApi.setPassword(activationToken, password, googleCredential || undefined);
      establishSession(response.data.access_token, response.data.user);
      navigate('/employee/home', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Không thể kích hoạt tài khoản.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: 'linear-gradient(135deg, #F0FDFA, #EFF6FF)', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', border: '1px solid #DDE7EF', borderRadius: 14, padding: 28, boxShadow: '0 14px 40px rgba(15, 23, 42, .09)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <div style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 9, background: '#009688', color: '#fff', fontWeight: 800 }}>K</div>
          <div><div style={{ fontWeight: 800, color: '#0F172A' }}>KIYOVN Enterprise</div><div style={{ fontSize: 12, color: '#64748B' }}>Kích hoạt tài khoản nhân sự</div></div>
        </div>

        {loading ? <div style={{ color: '#64748B' }}>Đang kiểm tra liên kết kích hoạt…</div> : error && !activationToken ? <Alert type="error" showIcon message={error} /> : (
          <>
            <div style={{ fontSize: 12, color: '#009688', fontWeight: 700, marginBottom: 6 }}>BƯỚC 1 / 14 · AVATAR &amp; TÊN TÀI KHOẢN</div>
            <h1 style={{ margin: '0 0 8px', fontSize: 22, color: '#0F172A' }}>Đặt mật khẩu</h1>
            <p style={{ margin: '0 0 18px', color: '#64748B', fontSize: 13.5 }}>Xin chào <strong>{person?.name}</strong>. Tài khoản <strong>{person?.email}</strong> sẽ được đăng nhập ngay sau khi bạn đặt mật khẩu.</p>
            {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 14 }} />}
            <div style={{ display: 'grid', gap: 12 }}>
              <div><label style={{ display: 'block', fontSize: 12.5, marginBottom: 5, color: '#475569' }}><LockOutlined /> Mật khẩu</label><Input.Password value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></div>
              <div><label style={{ display: 'block', fontSize: 12.5, marginBottom: 5, color: '#475569' }}><LockOutlined /> Nhập lại mật khẩu</label><Input.Password value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" onPressEnter={() => void submit()} /></div>
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 7 }}>Tối thiểu 12 ký tự gồm chữ hoa, chữ thường, số và ký tự đặc biệt.</div>
            <Button icon={<GoogleOutlined />} block onClick={() => void linkGoogle()} style={{ marginTop: 16, borderColor: googleCredential ? '#10B981' : undefined, color: googleCredential ? '#047857' : undefined }}>
              {googleCredential ? `Đã liên kết Google ${readableGoogleEmail(googleCredential)}` : 'Liên kết tài khoản Google'}
            </Button>
            <Button type="primary" block icon={<CheckCircleOutlined />} loading={submitting} onClick={() => void submit()} style={{ marginTop: 10, background: '#009688', borderColor: '#009688' }}>Hoàn tất và vào cổng nhân viên</Button>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 7, color: '#64748B', fontSize: 12 }}><UserOutlined /> Liên kết này chỉ dùng trong 02 ngày; sau lần mở đầu tiên, thời gian còn lại là 30 phút.</div>
          </>
        )}
      </div>
    </div>
  );
};

export default ActivateAccount;
