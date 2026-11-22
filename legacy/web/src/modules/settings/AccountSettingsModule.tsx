import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  UserOutlined,
  SafetyCertificateOutlined,
  PrinterOutlined,
  FileTextOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { Button, Tag, message } from '../../custom-ui';
import { exportRecordToPdf } from '../../utils/fileExporter';
import { authApi, type AccountActivity, type AccountOverview, type AccountSessionInfo } from '../../api/endpoints';

interface AccountProfile {
  name?: string;
  email?: string;
  employeeCode?: string;
  phone?: string;
  department?: string;
  position?: string;
}

const formatTime = (iso?: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('vi-VN', { hour12: false });
};

const sessionNote = (session: AccountSessionInfo | null) => (session ? [session.ip && `IP ${session.ip}`, session.method === 'passkey' ? 'khóa truy cập' : session.mfaVerified ? 'có xác minh 2 bước' : ''].filter(Boolean).join(' · ') : '');

// Trang Cài đặt tài khoản dùng chung cho quản trị viên và nhân viên. Mọi số liệu lấy từ máy chủ (/auth/profile, /auth/account-overview, /auth/activity);
// trước đây trang hiện cấp bảo mật, vai trò, chứng thư số, lần đăng nhập và nhật ký cố định không đúng với tài khoản.
export const AccountSettingsModule: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const portal = location.pathname.startsWith('/employee') ? '/employee' : '/admin';
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [activity, setActivity] = useState<AccountActivity[]>([]);
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'activity'>('profile');

  useEffect(() => {
    Promise.all([authApi.getProfile(), authApi.getAccountOverview(), authApi.getActivity(10)])
      .then(([profileResponse, overviewResponse, activityResponse]) => {
        setProfile((profileResponse.data as any)?.user || null);
        setOverview(overviewResponse.data);
        setActivity(activityResponse.data.data);
      })
      .catch((error: any) => message.error(error?.response?.data?.message || 'Không tải được thông tin tài khoản.'));
  }, []);

  const layers = overview ? [overview.twoFactorEnabled && 'xác minh 2 bước', overview.passkeyCount > 0 && 'khóa truy cập', overview.securityPinConfigured && 'mã PIN bảo mật'].filter(Boolean) as string[] : [];
  const level = !overview ? 'Đang tải' : layers.length >= 2 ? 'Cao' : layers.length === 1 ? 'Trung bình' : 'Cơ bản';
  const roleTitle = !overview ? 'Đang tải' : overview.role === 'ADMIN' ? 'Quản trị viên' : 'Nhân viên';
  const profileRows: Array<[string, string]> = [
    ['Họ và tên', profile?.name || ''],
    ['Email đăng nhập', profile?.email || ''],
    ['Mã nhân viên', profile?.employeeCode || ''],
    ['Số điện thoại', profile?.phone || ''],
    ['Phòng ban', profile?.department || ''],
    ['Chức danh', profile?.position || ''],
  ];
  const securityRows = overview ? [
    { title: 'Xác minh 2 bước', note: 'Nhập mã từ ứng dụng xác thực khi đăng nhập', on: overview.twoFactorEnabled, path: `${portal}/settings/security/twosv` },
    { title: 'Khóa truy cập (passkey)', note: overview.passkeyCount ? `Đã đăng ký ${overview.passkeyCount} khóa, dùng đăng nhập và xác nhận chữ ký số` : 'Đăng nhập bằng vân tay, khuôn mặt hoặc khóa bảo mật của thiết bị', on: overview.passkeyCount > 0, path: `${portal}/settings/security` },
    { title: 'Mã PIN bảo mật', note: 'Xác nhận các thao tác nhạy cảm như ghi sổ, quyết toán thuế', on: overview.securityPinConfigured, path: `${portal}/settings/security` },
  ] : [];

  const card = (title: string, value: string, note: string, color: string) => (
    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
      <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11.5, color, marginTop: 2 }}>{note}</div>
    </div>
  );

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        {card('Mức bảo mật tài khoản', level, layers.length ? `Đã bật ${layers.join(', ')}` : overview ? 'Chỉ dùng mật khẩu' : '', layers.length >= 2 ? '#16A34A' : layers.length ? '#D97706' : '#DC2626')}
        {card('Vai trò trong hệ thống', roleTitle, overview?.roleName ? `Vai trò nghiệp vụ: ${overview.roleName}` : overview?.role === 'ADMIN' ? 'Toàn quyền quản trị' : overview ? 'Quyền của tài khoản nhân viên' : '', '#7C3AED')}
        {card('Phiên đăng nhập đang mở', overview ? `${overview.activeSessions} phiên` : 'Đang tải', overview?.currentSession ? `Phiên này từ ${formatTime(overview.currentSession.loginTime)}` : '', '#009688')}
        {card('Lần đăng nhập trước', overview ? (overview.previousLogin ? formatTime(overview.previousLogin.loginTime) : 'Chưa có') : 'Đang tải', sessionNote(overview?.previousLogin || null), '#1E40AF')}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'profile', label: 'Thông tin tài khoản', icon: <UserOutlined style={{ color: '#3B82F6' }} /> },
            { key: 'security', label: 'Bảo mật', icon: <SafetyCertificateOutlined style={{ color: '#10B981' }} /> },
            { key: 'activity', label: 'Hoạt động gần đây', icon: <FileTextOutlined style={{ color: '#3B82F6' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              icon={tab.icon}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              style={{
                backgroundColor: activeTab === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: activeTab === tab.key ? '#009688' : '#CBD5E1',
                color: activeTab === tab.key ? '#00796B' : '#475569',
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<PrinterOutlined />} disabled={!profile} onClick={() => exportRecordToPdf('Thong_tin_tai_khoan', 'THONG TIN TAI KHOAN', profileRows)}>
            In thông tin tài khoản
          </Button>
          {portal === '/employee' && (
            <Button type="primary" icon={<EditOutlined />} onClick={() => navigate('/employee/profile')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Sửa hồ sơ cá nhân
            </Button>
          )}
        </div>
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 24, maxWidth: 880 }}>
        {activeTab === 'profile' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {profileRows.map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 12.5, color: '#64748B', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 13.5, color: '#0F172A' }}>{value || 'Chưa có'}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 18 }}>
              {portal === '/employee'
                ? 'Họ tên, điện thoại và các thông tin cá nhân khác sửa ở Hồ sơ cá nhân; email đăng nhập, mã nhân viên, phòng ban, chức danh do quản trị viên cập nhật.'
                : 'Email đăng nhập, mã nhân viên, phòng ban, chức danh cập nhật ở Quản trị hệ thống, Quản lý người dùng.'}
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {securityRows.map((row) => (
              <div key={row.title} style={{ padding: 14, background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13.5, color: '#0F172A' }}>{row.title}</div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>{row.note}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Tag color={row.on ? 'success' : 'default'}>{row.on ? 'Đã bật' : 'Chưa bật'}</Tag>
                  <Button onClick={() => navigate(row.path)}>Thiết lập</Button>
                </div>
              </div>
            ))}
            <div style={{ padding: 14, background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13.5, color: '#0F172A' }}>Mật khẩu đăng nhập</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>Đổi mật khẩu ở trang Bảo mật</div>
              </div>
              <Button onClick={() => navigate(`${portal}/settings/security`)}>Đổi mật khẩu</Button>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!activity.length && <div style={{ fontSize: 12.5, color: '#64748B' }}>Chưa có hoạt động nào được ghi nhận.</div>}
            {activity.map((item) => (
              <div key={item.key} style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: 13, color: '#0F172A' }}>{item.action}</div>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>{[item.timestamp, item.module, item.detail].filter(Boolean).join(' · ')}</div>
              </div>
            ))}
            <div>
              <Button onClick={() => navigate(`${portal}/settings/logs`)}>Xem toàn bộ nhật ký</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
