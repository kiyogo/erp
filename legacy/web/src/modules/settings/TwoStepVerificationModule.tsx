import React, { useState, useRef, useEffect } from 'react';
import QRCode from 'qrcode';
import {
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
  EditOutlined,
  DesktopOutlined,
  LaptopOutlined,
} from '@ant-design/icons';
import { Button, Input, Modal, message, Tag, Switch } from '../../custom-ui';
import { useNavigate, useLocation } from 'react-router-dom';
import { authApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import {
  getUser2FAState,
  saveUser2FAState,
  cleanupLegacyGlobal2FAKeys,
  TwoFactorPasskey,
  TwoFactorDevice,
} from '../../utils/twoFactorAuth';

export const TwoStepVerificationModule: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Get 100% Real Live User Session Profile
  const sessionUser = (() => {
    try {
      const u = localStorage.getItem('minepanel_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  })();
  const empProfile = dataService.getEmployeeProfile();
  const userKey = sessionUser?.id || sessionUser?.email || 'default_user';
  const realUserEmail = sessionUser?.email || empProfile?.email || '';
  const realUserPhone = sessionUser?.phone || sessionUser?.phoneNumber || empProfile?.phone || '';

  // Dọn dẹp các key dữ liệu giả (fake/mock) lưu trữ dùng chung từ trước
  useEffect(() => {
    cleanupLegacyGlobal2FAKeys();
  }, []);

  const [initialState] = useState(() => getUser2FAState(userKey, realUserPhone, realUserEmail));

  // Trạng thái 2FA của chính người dùng hiện tại (Mặc định khi tạo mới là TẮT)
  const [isEnabled, setIsEnabled] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [backupCodeCount, setBackupCodeCount] = useState(0);
  const [securityLoaded, setSecurityLoaded] = useState(false);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [passkeys, setPasskeys] = useState<TwoFactorPasskey[]>(initialState.passkeys);
  const [devices, setDevices] = useState<TwoFactorDevice[]>(initialState.devices);
  const [phoneNumber, setPhoneNumber] = useState<string>(initialState.phoneNumber);
  const [smsOtpEnabled, setSmsOtpEnabled] = useState<boolean>(initialState.smsOtpEnabled);
  const [emailOtpEnabled, setEmailOtpEnabled] = useState<boolean>(initialState.emailOtpEnabled);
  const [authenticatorConfigured, setAuthenticatorConfigured] = useState(false);

  const [setupStep, setSetupStep] = useState<1 | 2 | 3>(1);
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [tempPhone, setTempPhone] = useState(phoneNumber);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [newPasskeyName, setNewPasskeyName] = useState('');
  const [isAddPasskeyModalOpen, setIsAddPasskeyModalOpen] = useState(false);
  const [disableOtp, setDisableOtp] = useState('');
  const [recoveryOtp, setRecoveryOtp] = useState('');
  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false);

  const isEmployee = location.pathname.startsWith('/employee');
  const isAdminPath = location.pathname.startsWith('/admin');
  const backPath = isEmployee
    ? '/employee/settings/security'
    : isAdminPath
    ? '/admin/settings/security'
    : '/settings/security';

  // Base path resolution for sub-routing
  const basePath = location.pathname.includes('/twosv')
    ? location.pathname.split('/twosv')[0] + '/twosv'
    : isEmployee
    ? '/employee/settings/security/twosv'
    : isAdminPath
    ? '/admin/settings/security/twosv'
    : '/settings/security/twosv';

  const rawSubPath = location.pathname.substring(basePath.length).replace(/^\//, '').toLowerCase();
  const subRoute = rawSubPath === 'backup_codes' ? 'backup-codes' : rawSubPath;

  const emailAddress = realUserEmail;
  useEffect(() => {
    let active = true;
    setSecurityLoaded(false);
    authApi.getTwoFactor().then(({ data }) => {
      if (!active) return;
      setIsEnabled(data.enabled);
      setAuthenticatorConfigured(data.authenticatorConfigured);
      setBackupCodeCount(data.backupCodeCount);
      setSecurityLoaded(true);
    }).catch(() => {
      if (active) {
        setSecurityLoaded(true);
        message.error('Không tải được trạng thái xác minh hai bước từ máy chủ.');
      }
    });
    return () => { active = false; };
  }, [userKey, location.pathname]);

  useEffect(() => {
    if (!securityLoaded || isEnabled || subRoute !== 'authenticator' || secretKey) return;
    let active = true;
    setSecurityLoading(true);
    authApi.beginTwoFactorSetup().then(async ({ data }) => {
      const qr = await QRCode.toDataURL(data.otpauthUrl, { width: 180, margin: 1 });
      if (active) {
        setSecretKey(data.secret);
        setQrDataUrl(qr);
      }
    }).catch((error: any) => {
      if (active) message.error(error?.response?.data?.message || 'Không thể bắt đầu thiết lập ứng dụng xác thực.');
    }).finally(() => { if (active) setSecurityLoading(false); });
    return () => { active = false; };
  }, [securityLoaded, isEnabled, subRoute, secretKey]);

  const handleOtpDigitChange = (index: number, value: string) => {
    const char = value.slice(-1);
    if (char && !/^\d$/.test(char)) return;

    const newDigits = [...otpDigits];
    newDigits[index] = char;
    setOtpDigits(newDigits);
    setOtpError('');

    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'Enter') {
      void handleVerifyOtp();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      const digits = pasted.split('');
      const newDigits = ['', '', '', '', '', ''];
      digits.forEach((d, i) => {
        newDigits[i] = d;
      });
      setOtpDigits(newDigits);
      setOtpError('');
      const focusIndex = Math.min(digits.length, 5);
      inputRefs.current[focusIndex]?.focus();
    }
  };

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
    setRecoveryOtp('');
    setRecoveryDialogOpen(true);
  };

  const confirmRegenerateCodes = async () => {
    try {
      const { data } = await authApi.rotateRecoveryCodes(recoveryOtp.trim());
      setBackupCodes(data.backupCodes);
      setBackupCodeCount(data.backupCodes.length);
      setRecoveryDialogOpen(false);
      message.success('Đã tạo mã dự phòng mới. Hãy lưu lại vì mã chỉ hiển thị một lần.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tạo lại mã dự phòng.');
    }
  };

  const handleVerifyOtp = async () => {
    const cleanOtp = otpDigits.join('');
    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setOtpError('Vui lòng nhập đủ 6 chữ số hợp lệ từ ứng dụng Authenticator.');
      return;
    }

    setSecurityLoading(true);
    try {
      const { data } = await authApi.verifyTwoFactorSetup(cleanOtp);
      setOtpError('');
      setAuthenticatorConfigured(true);
      setIsEnabled(true);
      setBackupCodes(data.backupCodes);
      setBackupCodeCount(data.backupCodes.length);
      setSetupStep(3);
    } catch (error: any) {
      setOtpError(error?.response?.data?.message || 'Mã OTP không chính xác hoặc đã hết hiệu lực.');
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleCompleteSetup = () => {
    setSetupStep(1);
    setOtpDigits(['', '', '', '', '', '']);
    message.success('Đã kích hoạt ứng dụng Authenticator thành công!');
    navigate(basePath);
  };

  const handleToggle2FA = () => {
    navigate(`${basePath}/authenticator`);
  };

  const handleDisableTwoFactor = async () => {
    if (!/^\d{6}$/.test(disableOtp.trim())) {
      message.error('Vui lòng nhập mã gồm 6 chữ số từ ứng dụng xác thực.');
      return;
    }
    setSecurityLoading(true);
    try {
      await authApi.disableTwoFactor(disableOtp.trim());
      setIsEnabled(false);
      setAuthenticatorConfigured(false);
      setBackupCodeCount(0);
      setBackupCodes([]);
      setDisableOtp('');
      message.success('Đã tắt xác minh hai bước cho tài khoản.');
      navigate(basePath);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tắt xác minh hai bước.');
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleAddPasskey = () => {
    if (!newPasskeyName.trim()) {
      message.error('Vui lòng nhập tên khóa bảo mật!');
      return;
    }
    const newKey: TwoFactorPasskey = {
      id: String(Date.now()),
      name: newPasskeyName.trim(),
      addedAt: new Date().toLocaleDateString('vi-VN'),
    };
    const updated = [...passkeys, newKey];
    setPasskeys(updated);
    saveUser2FAState(userKey, { passkeys: updated });
    setNewPasskeyName('');
    setIsAddPasskeyModalOpen(false);
    message.success('Đã thêm khóa bảo mật mới thành công!');
  };

  const handleDeletePasskey = (keyItem: TwoFactorPasskey) => {
    Modal.confirm({
      title: 'Xóa Khóa Bảo Mật?',
      content: `Bạn có chắc chắn muốn xóa khóa bảo mật "${keyItem.name}" khỏi tài khoản không?`,
      okText: 'Xóa khóa',
      cancelText: 'Hủy',
      okButtonProps: { danger: true, style: { borderRadius: 8 } },
      cancelButtonProps: { style: { borderRadius: 8 } },
      onOk: () => {
        const updated = passkeys.filter((k) => k.id !== keyItem.id);
        setPasskeys(updated);
        saveUser2FAState(userKey, { passkeys: updated });
        message.success('Đã xóa khóa bảo mật.');
      },
    });
  };

  const handleRemoveDevice = (deviceItem: TwoFactorDevice) => {
    Modal.confirm({
      title: 'Đăng Xuất Thiết Bị?',
      content: `Bạn có chắc chắn muốn đăng xuất tài khoản khỏi thiết bị "${deviceItem.name}" không?`,
      okText: 'Đăng xuất',
      cancelText: 'Hủy',
      okButtonProps: { danger: true, style: { borderRadius: 8 } },
      cancelButtonProps: { style: { borderRadius: 8 } },
      onOk: () => {
        const updated = devices.filter((d) => d.id !== deviceItem.id);
        setDevices(updated);
        saveUser2FAState(userKey, { devices: updated });
        message.success('Đã đăng xuất khỏi thiết bị.');
      },
    });
  };

  const handleSavePhone = () => {
    const phoneVal = tempPhone.trim();
    if (!phoneVal) {
      message.error('Vui lòng nhập số điện thoại hợp lệ!');
      return;
    }
    setPhoneNumber(phoneVal);
    setSmsOtpEnabled(true);
    saveUser2FAState(userKey, { phoneNumber: phoneVal, smsOtpEnabled: true });
    setIsEditingPhone(false);
    message.success('Đã lưu số điện thoại và kích hoạt SMS OTP!');
  };

  const maskedEmail = (() => {
    if (!emailAddress) return 'Chưa cập nhật email';
    const parts = emailAddress.split('@');
    if (parts.length < 2) return emailAddress;
    const name = parts[0];
    const domain = parts[1];
    const prefix = name.length > 3 ? name.slice(0, 3) : name.slice(0, 1);
    return `${prefix}***@${domain}`;
  })();

  const securityItems = [
    {
      key: 'passkeys',
      icon: <KeyOutlined style={{ fontSize: 18, color: '#009688' }} />,
      title: 'Khoá truy cập và khoá bảo mật',
      status: passkeys.length > 0 ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#1E293B', fontWeight: 500, fontSize: 12.5 }}>
          <CheckCircleFilled style={{ color: '#16A34A', fontSize: 14 }} />
          <span>{passkeys.length} khoá</span>
        </span>
      ) : (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748B', fontWeight: 500, fontSize: 12.5 }}>
          <ExclamationCircleFilled style={{ color: '#94A3B8', fontSize: 14 }} />
          <span>Chưa có khoá</span>
        </span>
      ),
      path: `${basePath}/passkeys`,
    },
    {
      key: 'devices',
      icon: <MobileOutlined style={{ fontSize: 18, color: '#009688' }} />,
      title: 'Thiết bị tin cậy',
      status: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#1E293B', fontWeight: 500, fontSize: 12.5 }}>
          <CheckCircleFilled style={{ color: '#16A34A', fontSize: 14 }} />
          <span>{devices.length} thiết bị</span>
        </span>
      ),
      path: `${basePath}/devices`,
    },
    {
      key: 'authenticator',
      icon: <QrcodeOutlined style={{ fontSize: 18, color: '#009688' }} />,
      title: 'Authenticator App',
      status: authenticatorConfigured ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#1E293B', fontWeight: 500, fontSize: 12.5 }}>
          <CheckCircleFilled style={{ color: '#16A34A', fontSize: 14 }} />
          <span>Đã kích hoạt</span>
        </span>
      ) : (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#D97706', fontWeight: 500, fontSize: 12.5 }}>
          <ExclamationCircleFilled style={{ color: '#D97706', fontSize: 14 }} />
          <span>Chưa kích hoạt</span>
        </span>
      ),
      path: `${basePath}/authenticator`,
    },
    {
      key: 'phone',
      icon: <MessageOutlined style={{ fontSize: 18, color: '#009688' }} />,
      title: 'Số điện thoại SMS OTP',
      status: phoneNumber && smsOtpEnabled ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#1E293B', fontWeight: 500, fontSize: 12.5 }}>
          <CheckCircleFilled style={{ color: '#16A34A', fontSize: 14 }} />
          <span>{phoneNumber}</span>
        </span>
      ) : phoneNumber ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748B', fontWeight: 500, fontSize: 12.5 }}>
          <ExclamationCircleFilled style={{ color: '#64748B', fontSize: 14 }} />
          <span>Đã tắt ({phoneNumber})</span>
        </span>
      ) : (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748B', fontWeight: 500, fontSize: 12.5 }}>
          <ExclamationCircleFilled style={{ color: '#94A3B8', fontSize: 14 }} />
          <span>Chưa thiết lập</span>
        </span>
      ),
      path: `${basePath}/phone`,
    },
    {
      key: 'email',
      icon: <MailOutlined style={{ fontSize: 18, color: '#009688' }} />,
      title: 'Email OTP',
      status: emailOtpEnabled ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#1E293B', fontWeight: 500, fontSize: 12.5 }}>
          <CheckCircleFilled style={{ color: '#16A34A', fontSize: 14 }} />
          <span>{maskedEmail}</span>
        </span>
      ) : (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748B', fontWeight: 500, fontSize: 12.5 }}>
          <ExclamationCircleFilled style={{ color: '#64748B', fontSize: 14 }} />
          <span>Đã tắt</span>
        </span>
      ),
      path: `${basePath}/email`,
    },
    {
      key: 'backup-codes',
      icon: <NumberOutlined style={{ fontSize: 18, color: '#009688' }} />,
      title: 'Mã dự phòng',
      status: backupCodes.length > 0 ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#1E293B', fontWeight: 500, fontSize: 12.5 }}>
          <CheckCircleFilled style={{ color: '#16A34A', fontSize: 14 }} />
          <span>Còn {backupCodes.length} mã</span>
        </span>
      ) : (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748B', fontWeight: 500, fontSize: 12.5 }}>
          <ExclamationCircleFilled style={{ color: '#94A3B8', fontSize: 14 }} />
          <span>Chưa tạo mã</span>
        </span>
      ),
      path: `${basePath}/backup-codes`,
    },
  ];

  // Container Style (Left-aligned, spacious 680px width)
  const centeredContainerStyle: React.CSSProperties = {
    maxWidth: 680,
    width: '100%',
    margin: 0,
    padding: '16px 10px 40px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  };

  if (subRoute === 'authenticator' && isEnabled && setupStep !== 3) {
    return (
      <div style={centeredContainerStyle}>
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(basePath)} style={{ borderRadius: 8, fontWeight: 500 }}>Quay lại Bước thứ hai</Button>
        </div>
        <div style={{ width: '100%', maxWidth: 680, background: '#FFFFFF', borderRadius: 8, border: '1px solid #E2E8F0', padding: 24, boxSizing: 'border-box' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <QrcodeOutlined style={{ color: '#009688' }} /> Authenticator App đã bật
          </div>
          <p style={{ color: '#475569', fontSize: 13, lineHeight: 1.6 }}>Đăng nhập mật khẩu và Google đều cần mã từ ứng dụng xác thực. Nhập mã hiện tại để tắt tính năng này.</p>
          <Input value={disableOtp} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDisableOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="Mã xác minh 6 chữ số" />
          <Button danger loading={securityLoading} onClick={() => void handleDisableTwoFactor()} style={{ marginTop: 14 }}>Tắt xác minh hai bước</Button>
        </div>
      </div>
    );
  }

  // Render Sub-Route 1: Passkeys Page
  if (subRoute === 'passkeys') {
    return (
      <div style={centeredContainerStyle}>
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 12 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(basePath)}
            style={{ borderRadius: 8, fontWeight: 500 }}
          >
            Quay lại Bước thứ hai
          </Button>
        </div>

        <div
          style={{
            width: '100%',
            maxWidth: 680,
            background: '#FFFFFF',
            borderRadius: 8,
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            padding: 24,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 20, display: 'flex', alignItems: 'center' }}>
            <KeyOutlined style={{ color: '#009688', fontSize: 18, marginRight: 8 }} />
            Khoá Truy Cập & Khoá Bảo Mật
          </div>

          {passkeys.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', background: '#F8FAFC', borderRadius: 8, border: '1px dashed #CBD5E1', marginBottom: 20 }}>
              <KeyOutlined style={{ fontSize: 38, color: '#94A3B8', marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
                Chưa có khóa bảo mật nào
              </div>
              <div style={{ fontSize: 13, color: '#64748B', maxWidth: 440, margin: '0 auto 16px', lineHeight: 1.5 }}>
                Bạn có thể thêm khóa bảo mật phần cứng hoặc sinh trắc học thiết bị để xác thực nhanh chóng và an toàn.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 20 }}>
              {passkeys.map((k) => (
                <div
                  key={k.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '14px 0',
                    borderBottom: '1px solid #F1F5F9',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A' }}>{k.name}</div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Thêm ngày: {k.addedAt}</div>
                  </div>
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleDeletePasskey(k)}
                    style={{ borderRadius: 8 }}
                  />
                </div>
              ))}
            </div>
          )}

          <Button
            icon={<PlusOutlined />}
            onClick={() => {
              setNewPasskeyName('');
              setIsAddPasskeyModalOpen(true);
            }}
            style={{ borderRadius: 8, fontWeight: 500 }}
          >
            Thêm khóa bảo mật mới
          </Button>

          <Modal
            title="Thêm Khóa Bảo Mật Mới"
            open={isAddPasskeyModalOpen}
            onCancel={() => {
              setIsAddPasskeyModalOpen(false);
              setNewPasskeyName('');
            }}
            onOk={handleAddPasskey}
            okText="Thêm khóa"
            cancelText="Hủy"
            okButtonProps={{ style: { backgroundColor: '#009688', borderColor: '#009688', borderRadius: 8 } }}
            cancelButtonProps={{ style: { borderRadius: 8 } }}
            width={440}
          >
            <div style={{ padding: '12px 0' }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 6 }}>
                Tên khóa bảo mật
              </label>
              <Input
                placeholder="Nhập tên khóa..."
                value={newPasskeyName}
                onChange={(e) => setNewPasskeyName(e.target.value)}
                onPressEnter={handleAddPasskey}
                style={{ borderRadius: 8 }}
                autoFocus
              />
            </div>
          </Modal>
        </div>
      </div>
    );
  }

  // Render Sub-Route 2: Devices Page
  if (subRoute === 'devices') {
    return (
      <div style={centeredContainerStyle}>
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 12 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(basePath)}
            style={{ borderRadius: 8, fontWeight: 500 }}
          >
            Quay lại Bước thứ hai
          </Button>
        </div>

        <div
          style={{
            width: '100%',
            maxWidth: 680,
            background: '#FFFFFF',
            borderRadius: 8,
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            padding: 24,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 20, display: 'flex', alignItems: 'center' }}>
            <MobileOutlined style={{ color: '#009688', fontSize: 18, marginRight: 8 }} />
            Thiết Bị Tin Cậy
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {devices.map((d) => (
              <div
                key={d.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {d.iconType === 'mobile' ? (
                    <MobileOutlined style={{ fontSize: 20, color: '#009688' }} />
                  ) : d.iconType === 'laptop' ? (
                    <LaptopOutlined style={{ fontSize: 20, color: '#009688' }} />
                  ) : (
                    <DesktopOutlined style={{ fontSize: 20, color: '#009688' }} />
                  )}
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A' }}>{d.name}</div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                      {d.location} · <Tag color={d.status.includes('Đang') ? 'success' : 'default'} style={{ margin: 0, borderRadius: 4 }}>{d.status}</Tag>
                    </div>
                  </div>
                </div>
                <Button
                  size="small"
                  onClick={() => handleRemoveDevice(d)}
                  style={{ borderRadius: 8 }}
                >
                  Đăng xuất
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Render Sub-Route 3: Authenticator Setup Page
  if (subRoute === 'authenticator') {
    return (
      <div style={centeredContainerStyle}>
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 12 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(basePath)}
            style={{ borderRadius: 8, fontWeight: 500 }}
          >
            Quay lại Bước thứ hai
          </Button>
        </div>

        <div
          style={{
            width: '100%',
            maxWidth: 680,
            background: '#FFFFFF',
            borderRadius: 8,
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            padding: 24,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 16, display: 'flex', alignItems: 'center' }}>
            <QrcodeOutlined style={{ color: '#009688', fontSize: 18, marginRight: 8 }} />
            Authenticator App
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, padding: '10px 0' }}>
            {[
              { num: 1, label: '1. QR Code' },
              { num: 2, label: '2. Nhập OTP' },
              { num: 3, label: '3. Hoàn tất' },
            ].map((s) => (
              <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: setupStep >= s.num ? 1 : 0.4 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
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
                <span style={{ fontSize: 12.5, fontWeight: 600, color: setupStep >= s.num ? '#1E293B' : '#64748B' }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {setupStep === 1 && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '16px 0' }}>
                <div
                  style={{
                    padding: 8,
                    background: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    borderRadius: 8,
                  }}
                >
                  {qrDataUrl ? <img src={qrDataUrl} alt="Mã QR ứng dụng xác thực" style={{ width: 160, height: 160, display: 'block' }} /> : <div style={{ width: 160, height: 160, display: 'grid', placeItems: 'center', color: '#64748B', fontSize: 12, textAlign: 'center' }}>{securityLoading ? 'Đang tạo mã cấu hình...' : 'Chưa tạo được mã QR'}</div>}
                </div>
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>Nếu không thể quét mã, hãy nhập khóa bí mật:</div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#F8FAFC', padding: '4px 10px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                    <code style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', letterSpacing: '1px' }}>
                      {secretKey}
                    </code>
                    <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopy(secretKey, 'khóa bí mật')} style={{ borderRadius: 6 }} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <Button onClick={() => navigate(basePath)} style={{ borderRadius: 8 }}>Hủy</Button>
                <Button
                  type="primary"
                  onClick={() => {
                    setSetupStep(2);
                    setTimeout(() => inputRefs.current[0]?.focus(), 100);
                  }}
                  style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 8 }}
                >
                  Tiếp tục
                </Button>
              </div>
            </div>
          )}

          {setupStep === 2 && (
            <div>
              <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, marginBottom: 12 }}>
                Nhập mã OTP 6 số từ ứng dụng Authenticator:
              </div>

              {/* 6 Individual 1-Digit Input Boxes */}
              <div style={{ margin: '20px 0' }}>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => { inputRefs.current[idx] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      onPaste={handleOtpPaste}
                      style={{
                        width: 44,
                        height: 48,
                        fontSize: 20,
                        fontWeight: 700,
                        textAlign: 'center',
                        border: digit ? '2px solid #009688' : '1px solid #CBD5E1',
                        borderRadius: 8,
                        outline: 'none',
                        background: digit ? '#F0FDF4' : '#FFFFFF',
                        transition: 'all 0.15s ease',
                        boxSizing: 'border-box',
                      }}
                    />
                  ))}
                </div>
                {otpError && (
                  <div style={{ color: '#DC2626', fontSize: 12, marginTop: 8, textAlign: 'center' }}>
                    {otpError}
                  </div>
                )}
                <div style={{ fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 12, background: '#F0FDFA', border: '1px solid #CCFBF1', borderRadius: 6, padding: '6px 12px' }}>
                  <span>Quét mã bằng ứng dụng xác thực như Google Authenticator hoặc Authy. Mã OTP chỉ được máy chủ xác minh.</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
                <Button onClick={() => setSetupStep(1)} style={{ borderRadius: 8 }}>Quay lại</Button>
                <Button
                  type="primary"
                  onClick={handleVerifyOtp}
                  style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 8 }}
                >
                  Xác nhận
                </Button>
              </div>
            </div>
          )}

          {setupStep === 3 && (
            <div>
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <CheckCircleFilled style={{ fontSize: 44, color: '#16A34A', marginBottom: 10 }} />
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                  Kích Hoạt Authenticator Thành Công!
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <Button
                  type="primary"
                  onClick={handleCompleteSetup}
                  style={{ backgroundColor: '#009688', borderColor: '#009688', fontWeight: 600, borderRadius: 8 }}
                >
                  Hoàn tất
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render Sub-Route 4: Phone SMS OTP Page
  if (subRoute === 'phone') {
    return (
      <div style={centeredContainerStyle}>
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 12 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(basePath)}
            style={{ borderRadius: 8, fontWeight: 500 }}
          >
            Quay lại Bước thứ hai
          </Button>
        </div>

        <div
          style={{
            width: '100%',
            maxWidth: 680,
            background: '#FFFFFF',
            borderRadius: 8,
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            padding: 24,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 20, display: 'flex', alignItems: 'center' }}>
            <MessageOutlined style={{ color: '#009688', fontSize: 18, marginRight: 8 }} />
            SMS OTP
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #F1F5F9' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>Xác thực qua tin nhắn SMS OTP</div>
              <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>Nhận mã OTP 6 số bảo mật qua tin nhắn SMS đến điện thoại</div>
            </div>
            <Switch
              checked={smsOtpEnabled}
              disabled={!phoneNumber}
              onChange={(checked) => {
                if (checked && !phoneNumber) {
                  message.warning('Vui lòng thêm số điện thoại trước khi bật SMS OTP!');
                  setIsEditingPhone(true);
                  return;
                }
                setSmsOtpEnabled(checked);
                saveUser2FAState(userKey, { smsOtpEnabled: checked });
                message.success(checked ? 'Đã bật xác thực SMS OTP!' : 'Đã tắt xác thực SMS OTP.');
              }}
            />
          </div>

          <div
            style={{
              padding: '14px 0',
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 6 }}>Số điện thoại OTP:</div>
            {isEditingPhone || !phoneNumber ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  value={tempPhone}
                  onChange={(e) => setTempPhone(e.target.value)}
                  placeholder="Nhập số điện thoại..."
                  style={{ borderRadius: 8 }}
                />
                <Button type="primary" onClick={handleSavePhone} style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 8 }}>
                  Lưu số
                </Button>
                {phoneNumber && (
                  <Button onClick={() => { setIsEditingPhone(false); setTempPhone(phoneNumber); }} style={{ borderRadius: 8 }}>Hủy</Button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{phoneNumber}</div>
                <Button icon={<EditOutlined />} size="small" onClick={() => setIsEditingPhone(true)} style={{ borderRadius: 8 }}>
                  Thay đổi
                </Button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button
              icon={<SendOutlined />}
              disabled={!phoneNumber}
              onClick={() => {
                if (!phoneNumber) return;
                const testCode = String(Math.floor(100000 + Math.random() * 900000));
                message.success(`Đã gửi SMS thử nghiệm tới ${phoneNumber}! (Mã mô phỏng: ${testCode})`);
              }}
              style={{ borderRadius: 8 }}
            >
              Gửi SMS thử nghiệm
            </Button>
            <Button onClick={() => navigate(basePath)} style={{ borderRadius: 8 }}>Quay lại</Button>
          </div>
        </div>
      </div>
    );
  }

  // Render Sub-Route 5: Email OTP Page (Clean Switch without inner text & without gray box)
  if (subRoute === 'email') {
    return (
      <div style={centeredContainerStyle}>
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 12 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(basePath)}
            style={{ borderRadius: 8, fontWeight: 500 }}
          >
            Quay lại Bước thứ hai
          </Button>
        </div>

        <div
          style={{
            width: '100%',
            maxWidth: 680,
            background: '#FFFFFF',
            borderRadius: 8,
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            padding: 24,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 20, display: 'flex', alignItems: 'center' }}>
            <MailOutlined style={{ color: '#009688', fontSize: 18, marginRight: 8 }} />
            Email OTP
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 0',
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <MailOutlined style={{ fontSize: 22, color: '#009688' }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>
                Xác thực qua Email ({maskedEmail})
              </div>
            </div>

            <Switch
              checked={emailOtpEnabled}
              onChange={(checked) => {
                setEmailOtpEnabled(checked);
                saveUser2FAState(userKey, { emailOtpEnabled: checked });
                if (checked) {
                  message.success('Đã bật xác thực Email OTP!');
                } else {
                  message.info('Đã tắt xác thực Email OTP.');
                }
              }}
              style={{ minWidth: 45, height: 22 }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => navigate(basePath)} style={{ borderRadius: 8 }}>
              Quay lại
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Render Sub-Route 6: Backup Codes Page
  if (subRoute === 'backup-codes') {
    return (
      <div style={centeredContainerStyle}>
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 12 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(basePath)}
            style={{ borderRadius: 8, fontWeight: 500 }}
          >
            Quay lại Bước thứ hai
          </Button>
        </div>

        <div
          style={{
            width: '100%',
            maxWidth: 680,
            background: '#FFFFFF',
            borderRadius: 8,
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            padding: 24,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 20, display: 'flex', alignItems: 'center' }}>
            <NumberOutlined style={{ color: '#009688', fontSize: 18, marginRight: 8 }} />
            Mã Khôi Phục Dự Phòng
          </div>

          {backupCodes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', background: '#F8FAFC', borderRadius: 8, border: '1px dashed #CBD5E1', marginBottom: 20 }}>
              <NumberOutlined style={{ fontSize: 38, color: '#94A3B8', marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
                {backupCodeCount > 0 ? `Còn ${backupCodeCount} mã dự phòng` : 'Chưa có mã khôi phục dự phòng'}
              </div>
              <div style={{ fontSize: 13, color: '#64748B', maxWidth: 440, margin: '0 auto 16px', lineHeight: 1.5 }}>
                {backupCodeCount > 0 ? 'Máy chủ chỉ lưu bản băm nên không thể hiển thị lại các mã đã tạo. Bạn có thể tạo bộ mã mới; các mã cũ sẽ mất hiệu lực.' : 'Mã dự phòng dùng để đăng nhập khi bạn không thể truy cập ứng dụng Authenticator. Mỗi mã chỉ dùng được 1 lần.'}
              </div>
              <Button
                type="primary"
                onClick={handleRegenerateCodes}
                disabled={!isEnabled}
                style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 8, fontWeight: 600, padding: '0 20px' }}
              >
                {backupCodeCount > 0 ? 'Tạo bộ mã mới' : 'Tạo 10 mã dự phòng'}
              </Button>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                  gap: 10,
                  padding: '14px 0',
                  marginBottom: 20,
                }}
              >
                {backupCodes.map((code, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleCopy(code, `mã ${code}`)}
                    style={{
                      padding: '10px 12px',
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
                    }}
                    title="Nhấp để sao chép mã"
                  >
                    {code}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button icon={<DownloadOutlined />} onClick={handleDownloadBackupCodes} style={{ flex: 1, borderRadius: 8 }}>
                  Tải về file (.txt)
                </Button>
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => handleCopy(backupCodes.join('\n'), 'danh sách mã khôi phục')}
                  style={{ flex: 1, borderRadius: 8 }}
                >
                  Sao chép tất cả
                </Button>
                <Button icon={<RedoOutlined />} onClick={handleRegenerateCodes} style={{ flex: 1, borderRadius: 8 }}>
                  Tạo mã mới
                </Button>
              </div>
            </>
          )}
        </div>
        <Modal
          title="Tạo lại mã dự phòng"
          open={recoveryDialogOpen}
          onCancel={() => setRecoveryDialogOpen(false)}
          onOk={() => void confirmRegenerateCodes()}
          okText="Xác nhận và tạo mã"
          cancelText="Hủy"
        >
          <p>Nhập mã 6 chữ số từ ứng dụng xác thực. Các mã dự phòng hiện tại sẽ bị thu hồi.</p>
          <Input.Password value={recoveryOtp} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setRecoveryOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="Mã xác minh 6 chữ số" />
        </Modal>
      </div>
    );
  }

  // Default: Main 2FA Overview Page (Clean spacious layout)
  return (
    <div style={centeredContainerStyle}>
      <div style={{ width: '100%', maxWidth: 680, marginBottom: 12 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(backPath)}
          style={{ borderRadius: 8, fontWeight: 500 }}
        >
          Quay lại Cài đặt Bảo mật
        </Button>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: 680,
          background: '#FFFFFF',
          borderRadius: 8,
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 24px' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.2px' }}>
            Bước thứ hai
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {securityItems.map((item) => (
            <div
              key={item.key}
              onClick={() => navigate(item.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 24px',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {item.icon}
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>
                  {item.title}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {item.status}
                <RightOutlined style={{ fontSize: 12, color: '#94A3B8', marginLeft: 4 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, width: '100%', maxWidth: 680, display: 'flex', justifyContent: 'flex-start' }}>
        <Button
          onClick={handleToggle2FA}
          style={{
            borderRadius: 6,
            height: 38,
            padding: '0 16px',
            fontWeight: 500,
            fontSize: 13,
            border: isEnabled ? '1px solid #FF4D4F' : 'none',
            color: isEnabled ? '#FF4D4F' : '#FFFFFF',
            backgroundColor: isEnabled ? '#FFFFFF' : '#009688',
          }}
        >
          {isEnabled ? 'Tắt Xác minh 2 bước' : 'Bật Xác minh 2 bước'}
        </Button>
      </div>
    </div>
  );
};
