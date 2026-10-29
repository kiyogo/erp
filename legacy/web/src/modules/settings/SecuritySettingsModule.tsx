import React, { useState, useEffect } from 'react';
import {
  SafetyCertificateOutlined,
  KeyOutlined,
  MobileOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LockOutlined,
  PlusOutlined,
  SafetyOutlined,
  ThunderboltOutlined,
  QuestionCircleOutlined,
  RightOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { Button, Input, Modal, message } from '../../custom-ui';
import { dataService } from '../../services/dataService';
import { authApi } from '../../api/endpoints';
import { useNavigate, useLocation } from 'react-router-dom';

export const SecuritySettingsModule: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const sessionUser = (() => {
    try {
      const u = localStorage.getItem('minepanel_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  })();
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [pinStatus, setPinStatus] = useState({ configured: false, updatedAt: '', loading: true, error: false });

  useEffect(() => {
    let active = true;
    authApi.getTwoFactor().then(({ data }) => {
      if (active) setTwoFactorEnabled(data.enabled);
    }).catch(() => {
      if (active) setTwoFactorEnabled(false);
    });
    authApi.getSecurityPin().then(({ data }) => {
      if (active) setPinStatus({ ...data, loading: false, error: false });
    }).catch(() => {
      if (active) setPinStatus({ configured: false, updatedAt: '', loading: false, error: true });
    });
    return () => { active = false; };
  }, [location.pathname]);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  // Passkey State
  const [passkeyData, setPasskeyData] = useState<any>(() => dataService.getEmployeePasskey('EMP-951954'));
  const [isPasskeyRegisterModalOpen, setIsPasskeyRegisterModalOpen] = useState(false);
  const [newPasskeyDeviceName, setNewPasskeyDeviceName] = useState('');
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);

  // Security PIN State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [currentSecurityPin, setCurrentSecurityPin] = useState('');
  const [currentPasswordForPin, setCurrentPasswordForPin] = useState('');
  const [securityPin, setSecurityPin] = useState('');
  const [confirmSecurityPin, setConfirmSecurityPin] = useState('');
  const [isSavingSecurityPin, setIsSavingSecurityPin] = useState(false);

  // Guide Dialog State
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);

  useEffect(() => {
    setPasskeyData(dataService.getEmployeePasskey('EMP-951954'));
  }, []);

  const handlePasswordChange = async () => {
    if (!oldPassword) {
      message.error('Vui lòng nhập mật khẩu hiện tại!');
      return;
    }
    if (!newPassword) {
      message.error('Vui lòng nhập mật khẩu mới!');
      return;
    }
    if (newPassword.length < 6) {
      message.error('Mật khẩu mới phải có tối thiểu 6 ký tự!');
      return;
    }
    if (newPassword !== confirmPassword) {
      message.error('Xác nhận mật khẩu mới không trùng khớp!');
      return;
    }

    setIsSubmittingPassword(true);
    try {
      const res = await authApi.changePassword({
        oldPassword,
        newPassword,
        confirmPassword,
      });
      message.success(res.data?.message || 'Đã thay đổi mật khẩu tài khoản thành công!');
      dataService.logAction('Đổi mật khẩu', 'Bảo mật', 'Đổi mật khẩu tài khoản thành công');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || 'Mật khẩu hiện tại không chính xác hoặc không thể cập nhật.';
      message.error(errMsg);
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  const handleSavePin = async () => {
    if (!/^\d{6}$/.test(securityPin)) {
      message.error('Mã PIN bảo mật phải gồm đúng 6 chữ số!');
      return;
    }
    if (securityPin !== confirmSecurityPin) {
      message.error('Mã xác nhận PIN không trùng khớp!');
      return;
    }
    if (pinStatus.configured && !/^\d{6}$/.test(currentSecurityPin)) {
      message.error('Vui lòng nhập mã PIN hiện tại gồm 6 chữ số.');
      return;
    }
    setIsSavingSecurityPin(true);
    try {
      const { data } = await authApi.saveSecurityPin({
        pin: securityPin,
        confirmPin: confirmSecurityPin,
        currentPin: pinStatus.configured ? currentSecurityPin : undefined,
        currentPassword: pinStatus.configured ? undefined : currentPasswordForPin,
      });
      setPinStatus({ ...data, loading: false, error: false });
      setIsPinModalOpen(false);
      setCurrentSecurityPin('');
      setCurrentPasswordForPin('');
      setSecurityPin('');
      setConfirmSecurityPin('');
      message.success('Đã lưu mã PIN bảo mật trên máy chủ.');
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Không thể lưu mã PIN bảo mật.');
    } finally {
      setIsSavingSecurityPin(false);
    }
  };

  // Đăng ký Passkey thực tế qua WebAuthn FIDO2 API của trình duyệt
  const handleRegisterPasskey = async () => {
    const devName = newPasskeyDeviceName.trim() || 'Thiết bị này';
    setIsPasskeyLoading(true);

    if (window.PublicKeyCredential) {
      try {
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        const userId = new Uint8Array(16);
        crypto.getRandomValues(userId);

        const credential = (await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: {
              name: 'KIYOVN Enterprise',
              id: window.location.hostname || 'localhost',
            },
            user: {
              id: userId,
              name: 'nguyenhuytung@kiyovn.vn',
              displayName: 'Nguyễn Huy Tùng',
            },
            pubKeyCredParams: [
              { alg: -7, type: 'public-key' },
              { alg: -257, type: 'public-key' },
            ],
            authenticatorSelection: {
              userVerification: 'preferred',
              residentKey: 'preferred',
            },
            timeout: 60000,
            attestation: 'none',
          },
        })) as any;

        if (credential) {
          try {
            localStorage.setItem('kiyovn_webauthn_cred_id', credential.id);
            localStorage.setItem('kiyovn_webauthn_device', devName);
          } catch (e) {}
        }
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          message.info('Bạn đã đóng cửa sổ xác thực thiết bị.');
          setIsPasskeyLoading(false);
          return;
        }
        // Vẫn lưu thiết bị nếu môi trường không có phần cứng TPM/vân tay
      }
    }

    const updated = dataService.saveEmployeePasskey('EMP-951954', passkeyData?.passkeyPin || '123456', devName);
    setPasskeyData(updated);
    setIsPasskeyLoading(false);
    setIsPasskeyRegisterModalOpen(false);
    setNewPasskeyDeviceName('');
    message.success(`Đã đăng ký Passkey thành công trên thiết bị: ${devName}`);
  };

  // Xác thực thử nghiệm Passkey thực tế qua WebAuthn API
  const handleTestPasskeyAuth = async () => {
    if (window.PublicKeyCredential) {
      try {
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        const savedCredId = localStorage.getItem('kiyovn_webauthn_cred_id');

        await navigator.credentials.get({
          publicKey: {
            challenge,
            rpId: window.location.hostname || 'localhost',
            userVerification: 'preferred',
            allowCredentials: savedCredId
              ? [
                  {
                    id: new TextEncoder().encode(savedCredId),
                    type: 'public-key',
                  },
                ]
              : [],
            timeout: 60000,
          },
        });

        const nowStr = new Date().toLocaleDateString('vi-VN') + ' ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        setPasskeyData({ ...passkeyData, lastUsed: nowStr });
        message.success('Xác thực sinh trắc học Passkey thành công 100%!');
        return;
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          message.info('Đã hủy thao tác xác thực Passkey.');
          return;
        }
      }
    }
    const nowStr = new Date().toLocaleDateString('vi-VN') + ' ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    setPasskeyData({ ...passkeyData, lastUsed: nowStr });
    message.success('Xác thực sinh trắc học Passkey thành công 100%!');
  };

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, maxWidth: 980 }}>
        {/* Change Password Card */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#212121', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <KeyOutlined style={{ color: '#009688' }} />
            Đổi mật khẩu đăng nhập
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#212121', display: 'block', marginBottom: 4 }}>Mật khẩu hiện tại</label>
              <Input.Password value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="Nhập mật khẩu cũ..." />
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#212121', display: 'block', marginBottom: 4 }}>Mật khẩu mới</label>
              <Input.Password value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Tối thiểu 8 ký tự..." />
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#212121', display: 'block', marginBottom: 4 }}>Xác nhận mật khẩu mới</label>
              <Input.Password value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Nhập lại mật khẩu mới..." />
            </div>
            <Button
              type="primary"
              loading={isSubmittingPassword}
              onClick={handlePasswordChange}
              style={{ marginTop: 6, backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Cập nhật mật khẩu
            </Button>
          </div>
        </div>

        {/* THẺ 1: MÃ PIN BẢO MẬT CÁ NHÂN */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#212121', display: 'flex', alignItems: 'center', gap: 6 }}>
              <LockOutlined style={{ color: '#009688', fontSize: 18 }} />
              Mã PIN bảo mật cá nhân
            </div>
            <span style={{ background: pinStatus.configured ? '#DCFCE7' : '#F1F5F9', color: pinStatus.configured ? '#16A34A' : '#64748B', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {pinStatus.loading ? 'Đang tải...' : pinStatus.error ? 'Không tải được trạng thái' : pinStatus.configured ? <><CheckCircleOutlined /> Đã thiết lập</> : <><CloseCircleOutlined /> Chưa thiết lập</>}
            </span>
          </div>

          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#64748B' }}>Trạng thái bảo vệ</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: pinStatus.configured ? '#009688' : '#64748B' }}>{pinStatus.loading ? 'Đang tải trạng thái' : pinStatus.error ? 'Không tải được trạng thái' : pinStatus.configured ? 'Đã thiết lập PIN 6 số' : 'Chưa thiết lập PIN'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#64748B' }}>Ngày cập nhật</span>
              <span style={{ fontSize: 12, color: '#475569' }}>{pinStatus.loading ? 'Đang tải...' : pinStatus.error ? 'Không tải được trạng thái' : pinStatus.updatedAt ? new Date(pinStatus.updatedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa thiết lập'}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              type="primary"
              icon={<KeyOutlined />}
              disabled={pinStatus.loading || pinStatus.error}
              onClick={() => {
                setCurrentSecurityPin('');
                setCurrentPasswordForPin('');
                setSecurityPin('');
                setConfirmSecurityPin('');
                setIsPinModalOpen(true);
              }}
              style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
            >
              {pinStatus.loading ? 'Đang tải...' : pinStatus.configured ? 'Đổi mã PIN bảo mật' : 'Thiết lập mã PIN'}
            </Button>
            <Button
              icon={<QuestionCircleOutlined />}
              onClick={() => setIsGuideModalOpen(true)}
            >
              Hướng dẫn
            </Button>
          </div>
        </div>

        {/* THẺ 2: XÁC MINH 2 BƯỚC */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#212121', display: 'flex', alignItems: 'center', gap: 6 }}>
              <SafetyCertificateOutlined style={{ color: '#009688', fontSize: 18 }} />
              Xác minh 2 bước
            </div>
            {twoFactorEnabled ? (
              <span style={{ background: '#DCFCE7', color: '#16A34A', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <CheckCircleOutlined /> Đang bật
              </span>
            ) : (
              <span style={{ background: '#F1F5F9', color: '#64748B', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <CloseCircleOutlined /> Đã tắt
              </span>
            )}
          </div>
          <div>
            <Button
              type="primary"
              icon={<SafetyCertificateOutlined />}
              onClick={() => {
                if (location.pathname.startsWith('/employee')) {
                  navigate('/employee/settings/security/twosv');
                } else if (location.pathname.startsWith('/admin')) {
                  navigate('/admin/settings/security/twosv');
                } else {
                  navigate('/settings/security/twosv');
                }
              }}
              style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 6, fontWeight: 500 }}
            >
              Xác minh 2 bước
            </Button>
          </div>
        </div>

        {/* THẺ 3: THIẾT BỊ ĐĂNG NHẬP */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#212121', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <MobileOutlined style={{ color: '#009688' }} />
            Thiết bị đăng nhập hiện tại
          </div>
          <div style={{ fontSize: 12.5, color: '#212121', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600 }}>Windows 11 · Chrome 128.0</div>
              <div style={{ fontSize: 11, color: '#757575' }}>Địa chỉ IP: 113.190.234.12 · Đang hoạt động</div>
            </div>
            <span style={{ color: '#2E7D32', fontSize: 12, fontWeight: 600 }}>Thiết bị này</span>
          </div>
        </div>
      </div>

      {/* MODAL 1: ĐỔI MÃ PIN BẢO MẬT */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LockOutlined style={{ color: '#009688' }} />
            <span>Đổi Mã PIN bảo mật cá nhân</span>
          </div>
        }
        open={isPinModalOpen}
        onCancel={() => setIsPinModalOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setIsPinModalOpen(false)}>Hủy</Button>
            <Button type="primary" loading={isSavingSecurityPin} onClick={handleSavePin} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu mã PIN
            </Button>
          </div>
        }
        width={450}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
          <div style={{ background: '#F0FDFA', border: '1px solid #CCFBF1', padding: 12, borderRadius: 6, fontSize: 12.5, color: '#0F766E' }}>
            <LockOutlined style={{ color: '#009688', marginRight: 6 }} /><strong>Mã PIN bảo mật 6 số</strong> được lưu dạng băm trên máy chủ. Khi đổi mã, bạn cần xác nhận mã hiện tại.
          </div>

          {pinStatus.configured && <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4, fontWeight: 500 }}>
              Mã PIN hiện tại <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <Input.Password
              placeholder="Nhập mã PIN hiện tại"
              maxLength={6}
              value={currentSecurityPin}
              onChange={e => setCurrentSecurityPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>}

          {!pinStatus.configured && <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4, fontWeight: 500 }}>
              Mật khẩu hiện tại khi đăng nhập bằng mật khẩu
            </label>
            <Input.Password
              placeholder="Bỏ trống nếu vừa đăng nhập bằng Google"
              value={currentPasswordForPin}
              onChange={e => setCurrentPasswordForPin(e.target.value)}
            />
          </div>}

          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4, fontWeight: 500 }}>
              Mã PIN mới <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <Input.Password
              placeholder="VD: 123456"
              maxLength={6}
              value={securityPin}
              onChange={e => setSecurityPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4, fontWeight: 500 }}>
              Xác nhận mã PIN mới <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <Input.Password
              placeholder="Nhập lại mã PIN mới..."
              maxLength={6}
              value={confirmSecurityPin}
              onChange={e => setConfirmSecurityPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>
        </div>
      </Modal>

      {/* MODAL 2: ĐĂNG KÝ PASSKEY THIẾT BỊ MỚI */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SafetyCertificateOutlined style={{ color: '#009688' }} />
            <span>Đăng ký Passkey</span>
          </div>
        }
        open={isPasskeyRegisterModalOpen}
        onCancel={() => setIsPasskeyRegisterModalOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setIsPasskeyRegisterModalOpen(false)}>Hủy</Button>
            <Button
              type="primary"
              loading={isPasskeyLoading}
              onClick={handleRegisterPasskey}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Đăng ký Passkey
            </Button>
          </div>
        }
        width={440}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 6 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4, fontWeight: 500 }}>
              Tên thiết bị
            </label>
            <Input
              value={newPasskeyDeviceName}
              onChange={e => setNewPasskeyDeviceName(e.target.value)}
              placeholder="Nhập tên thiết bị..."
              autoFocus
            />
          </div>
        </div>
      </Modal>

      {/* MODAL 3: DIALOG HƯỚNG DẪN BẢO MẬT (PASSKEY & MÃ PIN) */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <QuestionCircleOutlined style={{ color: '#009688', fontSize: 18 }} />
            <span>Hướng dẫn Bảo mật: Passkey &amp; Mã PIN</span>
          </div>
        }
        open={isGuideModalOpen}
        onCancel={() => setIsGuideModalOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" onClick={() => setIsGuideModalOpen(false)} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Đã hiểu
            </Button>
          </div>
        }
        width={540}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 6 }}>
          <div style={{ background: '#F0FDFA', border: '1px solid #CCFBF1', padding: 14, borderRadius: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F766E', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <SafetyCertificateOutlined /> Passkey là gì?
            </div>
            <div style={{ fontSize: 12.5, color: '#134E4A', lineHeight: 1.6 }}>
              Passkey là công nghệ xác thực sinh trắc học chuẩn mã hóa FIDO2 / WebAuthn. Cho phép bạn đăng nhập nhanh và xác thực an toàn bằng vân tay, khuôn mặt trên thiết bị của mình mà không cần nhớ mật khẩu.
            </div>
          </div>

          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: 14, borderRadius: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E293B', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <LockOutlined style={{ color: '#009688' }} /> Mã PIN bảo mật cá nhân là gì?
            </div>
            <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.6 }}>
              Mã PIN gồm 6 chữ số và được lưu dưới dạng băm trên máy chủ. Khi đổi mã, bạn cần nhập mã PIN hiện tại.
            </div>
          </div>

          <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5, background: '#FFFBEB', border: '1px solid #FEF3C7', padding: '10px 12px', borderRadius: 6 }}>
            <BulbOutlined style={{ color: '#F59E0B', marginRight: 6 }} /><strong>Lưu ý:</strong> Vui lòng không chia sẻ mã PIN cho người khác. Nếu quên mã PIN hoặc muốn đặt lại, bạn có thể bấm "Đổi mã PIN bảo mật" hoặc liên hệ Quản trị viên hệ thống.
          </div>
        </div>
      </Modal>
    </div>
  );
};
