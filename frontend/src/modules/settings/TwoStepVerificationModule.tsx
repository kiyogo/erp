import React, { useState } from 'react';
import {
  SafetyCertificateOutlined,
  KeyOutlined,
  MobileOutlined,
  QrcodeOutlined,
  MessageOutlined,
  MailOutlined,
  NumberOutlined,
  CheckCircleFilled,
  ExclamationCircleFilled,
  RightOutlined,
  ArrowLeftOutlined,
  CopyOutlined,
  DownloadOutlined,
  RedoOutlined,
  PlusOutlined,
  DeleteOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { Button, Card, Input, Modal, message, Tag } from '../../custom-ui';
import { useNavigate, useLocation } from 'react-router-dom';

const DEFAULT_SECRET = 'KIYO7X9A8821M7QP9901';

const INITIAL_BACKUP_CODES = [
  '8492-1029',
  '7301-9923',
  '5512-8830',
  '4920-1174',
  '9182-4011',
  '3391-7281',
  '6201-5582',
  '1948-3829',
  '8820-4192',
  '3059-7164',
];

const INITIAL_PASSKEYS = [
  { id: '1', name: 'Touch ID / Windows Hello (Thiết bị này)', addedAt: '15/08/2026' },
  { id: '2', name: 'YubiKey 5C NFC (Khóa bảo mật phần cứng)', addedAt: '20/08/2026' },
  { id: '3', name: 'iPhone Passkey (Chuỗi khóa iCloud)', addedAt: '25/08/2026' },
];

const INITIAL_DEVICES = [
  { id: '1', name: 'iPhone 15 Pro Max', location: 'Hà Nội, Việt Nam', status: 'Đang hoạt động', icon: '📱' },
  { id: '2', name: 'MacBook Pro 14 M2', location: 'Hà Nội, Việt Nam', status: '2 giờ trước', icon: '💻' },
  { id: '3', name: 'Windows PC (Chrome)', location: 'Hà Nội, Việt Nam', status: 'Hôm qua', icon: '🖥️' },
];

export const TwoStepVerificationModule: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('two_factor_auth_enabled');
    return saved !== null ? saved === 'true' : true;
  });

  const [secretKey] = useState<string>(() => {
    return localStorage.getItem('two_factor_secret') || DEFAULT_SECRET;
  });

  const [backupCodes, setBackupCodes] = useState<string[]>(() => {
    const saved = localStorage.getItem('two_factor_backup_codes');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return INITIAL_BACKUP_CODES;
  });

  const [passkeys, setPasskeys] = useState(INITIAL_PASSKEYS);
  const [devices, setDevices] = useState(INITIAL_DEVICES);
  const [phoneNumber, setPhoneNumber] = useState('0369 575 506');
  const [emailAddress, setEmailAddress] = useState('son@kiyovn.com');
  const [authenticatorConfigured, setAuthenticatorConfigured] = useState<boolean>(() => {
    return localStorage.getItem('two_factor_authenticator_configured') !== 'false';
  });

  const [activeModal, setActiveModal] = useState<
    'passkeys' | 'devices' | 'authenticator' | 'phone' | 'email' | 'backup_codes' | null
  >(null);

  const [setupStep, setSetupStep] = useState<1 | 2 | 3>(1);
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');

  const [tempPhone, setTempPhone] = useState(phoneNumber);
  const [tempEmail, setTempEmail] = useState(emailAddress);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newPasskeyName, setNewPasskeyName] = useState('');
  const [isAddingPasskey, setIsAddingPasskey] = useState(false);

  const isEmployee = location.pathname.startsWith('/employee');
  const backPath = isEmployee ? '/employee/settings/security' : '/admin/settings/security';

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
    `otpauth://totp/KIYO%20Enterprise:${encodeURIComponent(emailAddress)}?secret=${secretKey}&issuer=KIYO%20Enterprise`
  )}`;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    message.success(`Đã sao chép ${label}!`);
  };

  const handleDownloadBackupCodes = () => {
    const content = `MÃ KHÔI PHỤC DỰ PHÒNG XÁC THỰC 2 BƯỚC (2FA)\nTài khoản: ${emailAddress}\nNgày tạo: ${new Date().toLocaleString(
      'vi-VN'
    )}\n\n${backupCodes.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nLưu ý: Mỗi mã chỉ sử dụng được 1 lần khi không thể truy cập ứng dụng xác thực.`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_codes_2fa_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('Đã tải tệp mã khôi phục dự phòng (.txt) về máy!');
  };

  const handleRegenerateCodes = () => {
    const newCodes = Array.from({ length: 10 }).map(() => {
      const rand = Math.floor(10000000 + Math.random() * 90000000).toString();
      return `${rand.slice(0, 4)}-${rand.slice(4)}`;
    });
    setBackupCodes(newCodes);
    localStorage.setItem('two_factor_backup_codes', JSON.stringify(newCodes));
    message.success('Đã tạo 10 mã khôi phục dự phòng mới thành công!');
  };

  const handleVerifyOtp = () => {
    const cleanOtp = otpInput.replace(/\s+/g, '');
    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setOtpError('Mã OTP phải gồm 6 chữ số hợp lệ từ ứng dụng Authenticator.');
      return;
    }
    setOtpError('');
    setSetupStep(3);
  };

  const handleCompleteSetup = () => {
    setIsEnabled(true);
    setAuthenticatorConfigured(true);
    localStorage.setItem('two_factor_auth_enabled', 'true');
    localStorage.setItem('two_factor_authenticator_configured', 'true');
    localStorage.setItem('two_factor_secret', secretKey);
    localStorage.setItem('two_factor_backup_codes', JSON.stringify(backupCodes));
    setActiveModal(null);
    setSetupStep(1);
    setOtpInput('');
    message.success('Đã kích hoạt ứng dụng Authenticator thành công!');
  };

  const handleToggle2FA = () => {
    if (isEnabled) {
      Modal.confirm({
        title: 'Tắt Xác minh 2 bước?',
        content:
          'Tài khoản của bạn sẽ chỉ được bảo vệ bằng mật khẩu. Bạn có chắc chắn muốn tắt tính năng bảo mật hai lớp này không?',
        okText: 'Tắt xác minh',
        cancelText: 'Hủy',
        okButtonProps: { danger: true },
        onOk: () => {
          setIsEnabled(false);
          localStorage.setItem('two_factor_auth_enabled', 'false');
          message.info('Đã tắt Xác minh 2 bước.');
        },
      });
    } else {
      setIsEnabled(true);
      localStorage.setItem('two_factor_auth_enabled', 'true');
      message.success('Đã bật Xác minh 2 bước cho tài khoản.');
    }
  };

  const handleAddPasskey = () => {
    if (!newPasskeyName.trim()) {
      message.error('Vui lòng nhập tên khóa bảo mật!');
      return;
    }
    const newKey = {
      id: String(Date.now()),
      name: newPasskeyName.trim(),
      addedAt: new Date().toLocaleDateString('vi-VN'),
    };
    setPasskeys((prev) => [...prev, newKey]);
    setNewPasskeyName('');
    setIsAddingPasskey(false);
    message.success('Đã thêm khóa bảo mật mới thành công!');
  };

  const handleDeletePasskey = (id: string) => {
    setPasskeys((prev) => prev.filter((k) => k.id !== id));
    message.success('Đã xóa khóa bảo mật.');
  };

  const handleRemoveDevice = (id: string) => {
    setDevices((prev) => prev.filter((d) => d.id !== id));
    message.success('Đã đăng xuất khỏi thiết bị.');
  };

  const handleSavePhone = () => {
    if (!tempPhone.trim()) {
      message.error('Vui lòng nhập số điện thoại hợp lệ!');
      return;
    }
    setPhoneNumber(tempPhone.trim());
    setIsEditingPhone(false);
    message.success('Đã cập nhật số điện thoại xác thực OTP!');
  };

  const handleSaveEmail = () => {
    if (!tempEmail.trim() || !tempEmail.includes('@')) {
      message.error('Vui lòng nhập địa chỉ email hợp lệ!');
      return;
    }
    setEmailAddress(tempEmail.trim());
    setIsEditingEmail(false);
    message.success('Đã cập nhật email nhận mã OTP!');
  };

  const maskedEmail = (() => {
    const parts = emailAddress.split('@');
    if (parts.length < 2) return emailAddress;
    const name = parts[0];
    const domain = parts[1];
    const prefix = name.slice(0, 3);
    return `${prefix}***@${domain}`;
  })();

  const securityItems = [
    {
      key: 'passkeys',
      icon: <KeyOutlined style={{ fontSize: 18, color: '#009688' }} />,
      title: 'Khoá truy cập và khoá bảo mật',
      status: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1E293B', fontWeight: 500, fontSize: 13.5 }}>
          <CheckCircleFilled style={{ color: '#16A34A', fontSize: 16 }} />
          <span>{passkeys.length} khoá truy cập</span>
        </span>
      ),
      onClick: () => setActiveModal('passkeys'),
    },
    {
      key: 'devices',
      icon: <MobileOutlined style={{ fontSize: 18, color: '#009688' }} />,
      title: 'Lời nhắc của Google / Thiết bị tin cậy',
      status: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1E293B', fontWeight: 500, fontSize: 13.5 }}>
          <CheckCircleFilled style={{ color: '#16A34A', fontSize: 16 }} />
          <span>{devices.length} thiết bị</span>
        </span>
      ),
      onClick: () => setActiveModal('devices'),
    },
    {
      key: 'authenticator',
      icon: <QrcodeOutlined style={{ fontSize: 18, color: '#009688' }} />,
      title: 'Authenticator',
      status: authenticatorConfigured ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1E293B', fontWeight: 500, fontSize: 13.5 }}>
          <CheckCircleFilled style={{ color: '#16A34A', fontSize: 16 }} />
          <span>Đã kích hoạt</span>
        </span>
      ) : (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#D97706', fontWeight: 500, fontSize: 13.5 }}>
          <ExclamationCircleFilled style={{ color: '#D97706', fontSize: 16 }} />
          <span>Thêm ứng dụng xác thực</span>
        </span>
      ),
      onClick: () => {
        setSetupStep(1);
        setActiveModal('authenticator');
      },
    },
    {
      key: 'phone',
      icon: <MessageOutlined style={{ fontSize: 18, color: '#009688' }} />,
      title: 'Số điện thoại',
      status: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1E293B', fontWeight: 500, fontSize: 13.5 }}>
          <CheckCircleFilled style={{ color: '#16A34A', fontSize: 16 }} />
          <span>{phoneNumber}</span>
        </span>
      ),
      onClick: () => {
        setTempPhone(phoneNumber);
        setIsEditingPhone(false);
        setActiveModal('phone');
      },
    },
    {
      key: 'email',
      icon: <MailOutlined style={{ fontSize: 18, color: '#009688' }} />,
      title: 'Email OTP',
      status: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1E293B', fontWeight: 500, fontSize: 13.5 }}>
          <CheckCircleFilled style={{ color: '#16A34A', fontSize: 16 }} />
          <span>{maskedEmail}</span>
        </span>
      ),
      onClick: () => {
        setTempEmail(emailAddress);
        setIsEditingEmail(false);
        setActiveModal('email');
      },
    },
    {
      key: 'backup_codes',
      icon: <NumberOutlined style={{ fontSize: 18, color: '#009688' }} />,
      title: 'Mã dự phòng',
      status: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1E293B', fontWeight: 500, fontSize: 13.5 }}>
          <CheckCircleFilled style={{ color: '#16A34A', fontSize: 16 }} />
          <span>Còn {backupCodes.length} mã</span>
        </span>
      ),
      onClick: () => setActiveModal('backup_codes'),
    },
  ];

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '20px 16px 40px', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 16 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(backPath)}
          style={{ borderRadius: 6, fontWeight: 500 }}
        >
          Quay lại Cài đặt Bảo mật
        </Button>
      </div>

      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 12,
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.2px' }}>
            Bước thứ hai
          </div>
          <div style={{ fontSize: 13.5, color: '#64748B', marginTop: 6, lineHeight: 1.5 }}>
            Hãy đảm bảo bạn có thể truy cập vào Tài khoản KiyoVN của mình bằng cách luôn cập nhật thông tin này và thêm các lựa chọn đăng nhập khác
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {securityItems.map((item, index) => (
            <div
              key={item.key}
              onClick={item.onClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 24px',
                borderBottom: index < securityItems.length - 1 ? '1px solid #F1F5F9' : 'none',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
                userSelect: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F8FAFC';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#FFFFFF';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: '#F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {item.icon}
                </div>
                <span style={{ fontSize: 14.5, fontWeight: 600, color: '#0F172A' }}>
                  {item.title}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {item.status}
                <RightOutlined style={{ fontSize: 12, color: '#94A3B8', marginLeft: 6 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-start' }}>
        <button
          onClick={handleToggle2FA}
          style={{
            background: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: 20,
            padding: '8px 22px',
            fontSize: 13.5,
            fontWeight: 600,
            color: isEnabled ? '#0F172A' : '#009688',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#F8FAFC';
            e.currentTarget.style.borderColor = '#94A3B8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#FFFFFF';
            e.currentTarget.style.borderColor = '#CBD5E1';
          }}
        >
          {isEnabled ? 'Tắt Xác minh 2 bước' : 'Bật Xác minh 2 bước'}
        </button>
      </div>

      <Modal
        title="Khoá Truy Cập & Khoá Bảo Mật (Passkeys)"
        open={activeModal === 'passkeys'}
        onCancel={() => setActiveModal(null)}
        footer={null}
        width={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: '#64748B' }}>
            Khóa truy cập cho phép bạn đăng nhập an toàn bằng sinh trắc học (vân tay, khuôn mặt) hoặc khóa bảo mật phần cứng USB/NFC mà không cần mật khẩu.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {passkeys.map((k) => (
              <div
                key={k.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 14px',
                  background: '#F8FAFC',
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                }}
              >
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A' }}>{k.name}</div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Đã thêm ngày: {k.addedAt}</div>
                </div>
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDeletePasskey(k.id)}
                  title="Xóa khóa này"
                />
              </div>
            ))}
          </div>

          {isAddingPasskey ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <Input
                placeholder="Tên khóa (ví dụ: YubiKey cá nhân)..."
                value={newPasskeyName}
                onChange={(e) => setNewPasskeyName(e.target.value)}
                onPressEnter={handleAddPasskey}
              />
              <Button type="primary" onClick={handleAddPasskey} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                Lưu
              </Button>
              <Button onClick={() => setIsAddingPasskey(false)}>Hủy</Button>
            </div>
          ) : (
            <Button
              icon={<PlusOutlined />}
              onClick={() => setIsAddingPasskey(true)}
              style={{ borderRadius: 6, fontWeight: 500 }}
            >
              Thêm khóa bảo mật mới
            </Button>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <Button onClick={() => setActiveModal(null)}>Đóng</Button>
          </div>
        </div>
      </Modal>

      <Modal
        title="Lời Nhắc Thiết Bị / Thiết Bị Đã Xác Minh"
        open={activeModal === 'devices'}
        onCancel={() => setActiveModal(null)}
        footer={null}
        width={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: '#64748B' }}>
            Khi bạn đăng nhập trên thiết bị mới, hệ thống sẽ gửi thông báo lời nhắc đến các thiết bị tin cậy này để bạn chạm xác nhận.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {devices.map((d) => (
              <div
                key={d.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 14px',
                  background: '#F8FAFC',
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{d.icon}</span>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A' }}>{d.name}</div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                      {d.location} · <Tag color={d.status.includes('Đang') ? 'success' : 'default'} style={{ margin: 0 }}>{d.status}</Tag>
                    </div>
                  </div>
                </div>
                <Button
                  size="small"
                  onClick={() => handleRemoveDevice(d.id)}
                  title="Đăng xuất khỏi thiết bị này"
                >
                  Đăng xuất
                </Button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <Button onClick={() => setActiveModal(null)}>Đóng</Button>
          </div>
        </div>
      </Modal>

      <Modal
        title="Ứng Dụng Xác Thực (Authenticator App)"
        open={activeModal === 'authenticator'}
        onCancel={() => setActiveModal(null)}
        footer={null}
        width={560}
      >
        <div style={{ padding: '8px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            {[
              { num: 1, label: 'Quét mã QR' },
              { num: 2, label: 'Xác nhận OTP' },
              { num: 3, label: 'Hoàn tất' },
            ].map((s) => (
              <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: setupStep >= s.num ? 1 : 0.4 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: setupStep >= s.num ? '#009688' : '#CBD5E1',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {setupStep > s.num ? '✓' : s.num}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: setupStep >= s.num ? '#1E293B' : '#64748B' }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {setupStep === 1 && (
            <div>
              <div style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.6, marginBottom: 14 }}>
                Mở ứng dụng <strong>Authenticator</strong> trên điện thoại và quét mã QR bên dưới:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, margin: '16px 0' }}>
                <div
                  style={{
                    padding: 8,
                    background: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    borderRadius: 8,
                  }}
                >
                  <img src={qrUrl} alt="2FA QR Code" style={{ width: 170, height: 170, display: 'block' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <Button onClick={() => setActiveModal(null)}>Hủy</Button>
                <Button
                  type="primary"
                  onClick={() => setSetupStep(2)}
                  style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                >
                  Tiếp tục: Nhập mã xác nhận
                </Button>
              </div>
            </div>
          )}

          {setupStep === 2 && (
            <div>
              <div style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.6, marginBottom: 14 }}>
                Nhập mã 6 chữ số đang hiển thị trong ứng dụng Authenticator của bạn để hoàn tất xác thực liên kết:
              </div>
              <div style={{ maxWidth: 260, margin: '20px auto' }}>
                <Input
                  placeholder="000 000"
                  maxLength={6}
                  value={otpInput}
                  onChange={(e) => {
                    setOtpInput(e.target.value);
                    setOtpError('');
                  }}
                  onPressEnter={handleVerifyOtp}
                  style={{
                    fontSize: 22,
                    letterSpacing: '8px',
                    textAlign: 'center',
                    fontWeight: 700,
                    height: 48,
                    borderRadius: 8,
                  }}
                />
                {otpError && (
                  <div style={{ color: '#DC2626', fontSize: 12, marginTop: 6, textAlign: 'center' }}>
                    {otpError}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 20 }}>
                <Button onClick={() => setSetupStep(1)}>Quay lại</Button>
                <Button
                  type="primary"
                  onClick={handleVerifyOtp}
                  style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                >
                  Xác nhận mã OTP
                </Button>
              </div>
            </div>
          )}

          {setupStep === 3 && (
            <div>
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <CheckCircleFilled style={{ fontSize: 48, color: '#16A34A', marginBottom: 12 }} />
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                  Liên Kết Ứng Dụng Xác Thực Thành Công!
                </div>
                <div style={{ fontSize: 13, color: '#64748B', marginTop: 6 }}>
                  Ứng dụng Authenticator hiện đã sẵn sàng để tạo mã đăng nhập an toàn 6 số cho tài khoản của bạn.
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <Button
                  type="primary"
                  onClick={handleCompleteSetup}
                  style={{ backgroundColor: '#009688', borderColor: '#009688', fontWeight: 600 }}
                >
                  Hoàn tất kích hoạt 2FA
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ================= MODAL 4: PHONE NUMBER ================= */}
      <Modal
        title="Xác Thực Qua Số Điện Thoại (SMS OTP)"
        open={activeModal === 'phone'}
        onCancel={() => setActiveModal(null)}
        footer={null}
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13, color: '#64748B' }}>
            Mã OTP 6 số sẽ được gửi qua tin nhắn SMS đến số điện thoại này mỗi khi bạn đăng nhập từ thiết bị lạ.
          </div>

          <div
            style={{
              padding: 16,
              background: '#F8FAFC',
              borderRadius: 8,
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 6 }}>Số điện thoại hiện tại:</div>
            {isEditingPhone ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  value={tempPhone}
                  onChange={(e) => setTempPhone(e.target.value)}
                  placeholder="Nhập số điện thoại mới..."
                />
                <Button type="primary" onClick={handleSavePhone} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                  Lưu
                </Button>
                <Button onClick={() => setIsEditingPhone(false)}>Hủy</Button>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{phoneNumber}</div>
                <Button size="small" onClick={() => setIsEditingPhone(true)}>
                  Thay đổi số
                </Button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Button
              icon={<SendOutlined />}
              onClick={() => message.success(`Đã gửi tin nhắn mã thử nghiệm tới ${phoneNumber}!`)}
            >
              Gửi mã SMS thử nghiệm
            </Button>
            <Button onClick={() => setActiveModal(null)}>Đóng</Button>
          </div>
        </div>
      </Modal>

      {/* ================= MODAL 5: EMAIL OTP ================= */}
      <Modal
        title="Xác Thực Qua Email (Email OTP)"
        open={activeModal === 'email'}
        onCancel={() => setActiveModal(null)}
        footer={null}
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13, color: '#64748B' }}>
            Mã OTP 6 số sẽ được gửi trực tiếp đến hòm thư điện tử này làm phương thức dự phòng khi bạn không mang theo điện thoại.
          </div>

          <div
            style={{
              padding: 16,
              background: '#F8FAFC',
              borderRadius: 8,
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 6 }}>Email nhận mã OTP:</div>
            {isEditingEmail ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  value={tempEmail}
                  onChange={(e) => setTempEmail(e.target.value)}
                  placeholder="Nhập địa chỉ email mới..."
                />
                <Button type="primary" onClick={handleSaveEmail} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                  Lưu
                </Button>
                <Button onClick={() => setIsEditingEmail(false)}>Hủy</Button>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{emailAddress}</div>
                <Button size="small" onClick={() => setIsEditingEmail(true)}>
                  Thay đổi email
                </Button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Button
              icon={<SendOutlined />}
              onClick={() => message.success(`Đã gửi email chứa mã OTP thử nghiệm tới ${emailAddress}!`)}
            >
              Gửi email thử nghiệm
            </Button>
            <Button onClick={() => setActiveModal(null)}>Đóng</Button>
          </div>
        </div>
      </Modal>

      {/* ================= MODAL 6: BACKUP CODES ================= */}
      <Modal
        title="Mã Khôi Phục Dự Phòng (Backup Codes)"
        open={activeModal === 'backup_codes'}
        onCancel={() => setActiveModal(null)}
        footer={null}
        width={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13, color: '#64748B' }}>
            Mỗi mã khôi phục chỉ sử dụng được <strong>1 lần</strong> khi bạn không thể truy cập điện thoại hoặc ứng dụng xác thực. Hãy lưu lại ở nơi an toàn.
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: 10,
              background: '#F8FAFC',
              padding: 16,
              borderRadius: 8,
              border: '1px solid #E2E8F0',
            }}
          >
            {backupCodes.map((code, idx) => (
              <div
                key={idx}
                onClick={() => handleCopy(code, `mã ${code}`)}
                style={{
                  padding: '8px 10px',
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: 6,
                  fontFamily: 'monospace',
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: '#0F172A',
                  textAlign: 'center',
                  cursor: 'pointer',
                  userSelect: 'all',
                  transition: 'all 0.15s ease',
                }}
                title="Nhấp để sao chép mã"
              >
                {code}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<DownloadOutlined />} onClick={handleDownloadBackupCodes} style={{ flex: 1 }}>
              Tải về file (.txt)
            </Button>
            <Button
              icon={<CopyOutlined />}
              onClick={() => handleCopy(backupCodes.join('\n'), 'danh sách mã khôi phục')}
              style={{ flex: 1 }}
            >
              Sao chép tất cả
            </Button>
            <Button icon={<RedoOutlined />} onClick={handleRegenerateCodes} style={{ flex: 1 }}>
              Tạo mã mới
            </Button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="primary" onClick={() => setActiveModal(null)} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Đã hiểu & Đóng
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
