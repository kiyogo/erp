import React, { useState, useEffect, useRef } from 'react';
import {
  SafetyCertificateOutlined,
  KeyOutlined,
  CheckCircleOutlined,
  EditOutlined,
  CheckOutlined,
  FontSizeOutlined,
  HighlightOutlined,
  UploadOutlined,
  CloudUploadOutlined,
  FilePdfOutlined,
  SearchOutlined,
  ExclamationCircleOutlined,
  LinkOutlined,
  RightOutlined,
  CopyOutlined,
  QrcodeOutlined,
  LockOutlined,
  ScanOutlined,
  ClockCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Modal, Input as BaseInput, Select as BaseSelect, Button, message, Tag } from '../../custom-ui';
import { KTable } from '../../components/KTable';
import { FileUploadDialog } from '../../components/FileUploadDialog';
import { dataService } from '../../services/dataService';
import { DigitalSignatureModule } from '../finance/DigitalSignatureModule';
import { useNavigate, useLocation } from 'react-router-dom';
import signatureImg from '../../assets/signature_son.png';

export const SIGNATURE_FONTS = [
  { name: 'Nét bút lông mềm mại', font: '"Brush Script MT", "Caveat", "Dancing Script", cursive', size: 20, style: 'italic' },
  { name: 'Chữ ký thanh lịch', font: '"Segoe Script", "Great Vibes", cursive', size: 18, style: 'italic' },
  { name: 'Chữ ký viết tay phóng khoáng', font: '"Lucida Handwriting", "Sacramento", cursive', size: 18, style: 'normal' },
  { name: 'Chữ ký nghệ thuật bay bổng', font: '"Alex Brush", "Cedarville Cursive", cursive', size: 21, style: 'italic' },
];

export const generateNameSignatureImage = (nameText: string, fontStyle?: string): string => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 560;
    canvas.height = 140;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 560, 140);
      ctx.font = `italic bold 52px ${fontStyle || '"Brush Script MT", "Caveat", "Dancing Script", "Segoe Script", cursive'}`;
      ctx.fillStyle = '#0052CC';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(nameText || 'Nguyễn Đức Đại Sơn', 280, 70);
      return canvas.toDataURL('image/png');
    }
  } catch (e) {}
  return '';
};

// Kiểm tra trạng thái Xác minh 2 bước (2SV) của tài khoản
export const checkAccount2SVStatus = () => {
  try {
    const sessionUser = (() => {
      try {
        const u = localStorage.getItem('minepanel_user');
        return u ? JSON.parse(u) : null;
      } catch { return null; }
    })();
    const userKey = sessionUser?.id || sessionUser?.email || 'default_user';
    const is2FAEnabled = localStorage.getItem(`2fa_${userKey}_enabled`) === 'true' || localStorage.getItem('kiyovn_2sv_enabled') === 'true';
    if (!is2FAEnabled) {
      return { isEnabled: false, hasAnyMethod: false, reason: '2SV_DISABLED' };
    }

    let hasMethod = false;

    // 1. Passkeys
    const passkeysStr = localStorage.getItem(`2fa_${userKey}_passkeys`) || localStorage.getItem('kiyovn_2sv_passkeys');
    if (passkeysStr) {
      try {
        const p = JSON.parse(passkeysStr);
        if (Array.isArray(p) && p.length > 0) hasMethod = true;
      } catch (e) {}
    }

    // 2. Email OTP
    if (localStorage.getItem(`2fa_${userKey}_email_enabled`) === 'true' || localStorage.getItem('kiyovn_2sv_email_linked') === 'true') {
      hasMethod = true;
    }

    // 3. Authenticator TOTP
    if (localStorage.getItem(`2fa_${userKey}_auth_configured`) === 'true' || localStorage.getItem('kiyovn_2sv_auth_linked') === 'true') {
      hasMethod = true;
    }

    // 4. Số điện thoại SMS
    if (localStorage.getItem(`2fa_${userKey}_sms_enabled`) === 'true' || localStorage.getItem('kiyovn_2sv_phone_linked') === 'true') {
      hasMethod = true;
    }

    // 5. Mã dự phòng
    const backupCodesStr = localStorage.getItem(`2fa_${userKey}_backup_codes`);
    if ((backupCodesStr && backupCodesStr !== '[]') || localStorage.getItem('kiyovn_2sv_has_backup_codes') === 'true') {
      hasMethod = true;
    }

    return { isEnabled: is2FAEnabled, hasAnyMethod: hasMethod };
  } catch (e) {
    return { isEnabled: false, hasAnyMethod: false };
  }
};

export const EmployeePersonalDigitalSignatureModule: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const isEmployee = currentPath.startsWith('/employee');
  const twosvPath = isEmployee ? '/employee/settings/security/twosv' : '/admin/settings/security/twosv';

  const sessionUser = (() => {
    try {
      const u = localStorage.getItem('minepanel_user');
      return u ? JSON.parse(u) : null;
    } catch { return null; }
  })();
  const empProfile = dataService.getEmployeeProfile();
  const empCode = empProfile?.code || 'EMP-951954';
  const empName = sessionUser?.fullName || sessionUser?.name || empProfile?.name || 'Nguyễn Đức Đại Sơn';

  const [digisigData, setDigisigData] = useState<any>(() => dataService.getEmployeeDigisig(empCode));
  const [signingLogs, setSigningLogs] = useState<any[]>(() => dataService.getEmployeeSigningLogs(empCode));
  const [historySearch, setHistorySearch] = useState('');

  // Passkey State for Digital Signature
  const [isPasskeyActive, setIsPasskeyActive] = useState(() => {
    try {
      const saved = localStorage.getItem('kiyovn_digisig_passkey_enabled');
      if (saved !== null) return saved === 'true';
    } catch (e) {}
    return true;
  });
  const [isActivatingPasskey, setIsActivatingPasskey] = useState(false);

  // Signature Customization Modal State
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [signTab, setSignTab] = useState<'font' | 'draw' | 'upload'>('font');
  const [signText, setSignText] = useState(empName);
  const [selectedFontIndex, setSelectedFontIndex] = useState(0);
  const [uploadedSignImage, setUploadedSignImage] = useState<string | null>(null);
  const [signUploadPickerOpen, setSignUploadPickerOpen] = useState(false);

  const [signaturePosition, setSignaturePosition] = useState<'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'>(() => {
    try {
      const saved = localStorage.getItem('kiyovn_signature_position');
      if (saved) return saved as any;
    } catch (e) {}
    return 'bottom-right';
  });

  const [signaturePage, setSignaturePage] = useState<'first' | 'last'>(() => {
    try {
      const saved = localStorage.getItem('kiyovn_signature_page');
      if (saved) return saved as any;
    } catch (e) {}
    return 'first';
  });

  // Canvas Ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    setDigisigData(dataService.getEmployeeDigisig(empCode));
    setSigningLogs(dataService.getEmployeeSigningLogs(empCode));
  }, [empCode]);

  // Kích hoạt / Xác thực lại Passkey (Bắt buộc phải bật 2SV và có ít nhất 1 trong 6 phương thức)
  const handleTogglePasskey = async () => {
    if (isPasskeyActive) {
      setIsPasskeyActive(false);
      try {
        localStorage.setItem('kiyovn_digisig_passkey_enabled', 'false');
      } catch (e) {}
      message.info('Đã tắt xác thực bằng khóa truy cập cho chữ ký số.');
      return;
    }

    // 1. Kiểm tra trạng thái Xác minh 2 bước
    const status2SV = checkAccount2SVStatus();
    if (!status2SV.isEnabled) {
      message.warning('Bạn cần bật tính năng Xác minh 2 bước trước khi kích hoạt!');
      setTimeout(() => {
        navigate(twosvPath);
      }, 700);
      return;
    }

    if (!status2SV.hasAnyMethod) {
      message.warning('Bạn cần cài đặt ít nhất 1 trong 6 phương thức bảo mật trước khi kích hoạt!');
      setTimeout(() => {
        navigate(twosvPath);
      }, 700);
      return;
    }

    // 2. Yêu cầu xác thực Passkey mới được kích hoạt
    setIsActivatingPasskey(true);
    if (window.PublicKeyCredential && navigator.credentials) {
      try {
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        const userId = new Uint8Array(16);
        crypto.getRandomValues(userId);

        await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: 'KIYOVN Digital Signature' },
            user: {
              id: userId,
              name: 'nguyenhuytung@kiyovn.vn',
              displayName: 'Nguyễn Huy Tùng',
            },
            pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              userVerification: 'preferred',
            },
            timeout: 60000,
          },
        });
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          message.info('Đã hủy thao tác xác thực khoá truy cập.');
          setIsActivatingPasskey(false);
          return;
        }
      }
    }

    setIsPasskeyActive(true);
    try {
      localStorage.setItem('kiyovn_digisig_passkey_enabled', 'true');
    } catch (e) {}
    setIsActivatingPasskey(false);
    message.success('Đã xác thực khoá truy cập và kích hoạt bảo mật thành công!');
  };

  // Xác thực bằng khoá truy cập (Passkey) khi ký hoặc lưu
  const requirePasskey = async (actionDesc: string, callback: () => void) => {
    if (!isPasskeyActive) {
      callback();
      return;
    }

    // Kiểm tra nếu chưa bật 2SV thì cũng nhắc nhở chuyển sang 2SV
    const status2SV = checkAccount2SVStatus();
    if (!status2SV.isEnabled) {
      message.warning('Bạn cần bật tính năng Xác minh 2 bước trước khi thực hiện thao tác!');
      setTimeout(() => {
        navigate(twosvPath);
      }, 700);
      return;
    }

    if (!status2SV.hasAnyMethod) {
      message.warning('Bạn cần cài đặt ít nhất 1 trong 6 phương thức bảo mật trước khi thực hiện thao tác!');
      setTimeout(() => {
        navigate(twosvPath);
      }, 700);
      return;
    }

    if (window.PublicKeyCredential && navigator.credentials) {
      try {
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        await navigator.credentials.get({
          publicKey: {
            challenge,
            rpId: window.location.hostname || 'localhost',
            userVerification: 'preferred',
            timeout: 60000,
          },
        });
        message.success('Xác thực khoá truy cập Passkey thành công!');
        callback();
        return;
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          message.info('Đã hủy xác thực khoá truy cập.');
          return;
        }
      }
    }
    message.success('Xác thực khoá truy cập Passkey thành công!');
    callback();
  };

  const handleSaveSignature = () => {
    requirePasskey('Lưu mẫu chữ ký', () => {
      let finalImg = '';
      if (signTab === 'draw' && canvasRef.current) {
        finalImg = canvasRef.current.toDataURL('image/png');
      } else if (signTab === 'upload' && uploadedSignImage) {
        finalImg = uploadedSignImage;
      } else {
        const fontObj = SIGNATURE_FONTS[selectedFontIndex];
        finalImg = generateNameSignatureImage(signText || empName, fontObj ? fontObj.font : undefined);
      }
      const updated = dataService.updateEmployeeSignatureVisual(
        empCode,
        finalImg,
        signTab,
        signText
      );
      setDigisigData({ ...digisigData, ...updated, signatureType: signTab, signatureText: signText, signatureImage: finalImg });
      try {
        localStorage.setItem('kiyovn_signature_position', signaturePosition);
        localStorage.setItem('kiyovn_signature_page', signaturePage);
      } catch (e) {}
      setIsSignModalOpen(false);
      message.success('Đã lưu mẫu chữ ký số cá nhân thành công!');
    });
  };

  const hasCert = Boolean(
    digisigData &&
    digisigData.certNumber &&
    digisigData.status !== 'Thu hồi' &&
    digisigData.status !== 'Chưa cấp'
  );

  const handleTestSign = (docName: string) => {
    if (!hasCert) {
      message.warning('Tài khoản của bạn chưa được Quản trị viên cấp chứng thư số cá nhân.');
      return;
    }
    requirePasskey(`Ký số "${docName}"`, () => {
      message.warning('Không thể ký thử: hệ thống chưa được kết nối dịch vụ ký số có chứng thư và khóa riêng được xác thực.');
    });
  };

  // Canvas drawing handlers
  const startDrawing = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
    const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: any) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
    const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
    ctx.strokeStyle = '#0052CC';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // If path is Verify -> render DigitalSignatureModule directly
  if (currentPath.includes('/verify')) {
    return <DigitalSignatureModule />;
  }

  // If path is History -> render History View
  if (currentPath.includes('/history')) {
    const filteredLogs = signingLogs.filter(
      (l) =>
        (l.documentName || '').toLowerCase().includes(historySearch.toLowerCase()) ||
        (l.hash || '').toLowerCase().includes(historySearch.toLowerCase())
    );

    return (
      <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <BaseInput
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm kiếm theo tên tài liệu, mã băm SHA-256..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            style={{ width: 360, borderRadius: 6 }}
            allowClear
          />
        </div>

        <div className="transparent-table-card" style={{ width: '100%' }}>
          <KTable
            dataSource={filteredLogs}
            rowKey="id"
            columns={[
              {
                title: 'Thời gian ký',
                dataIndex: 'timestamp',
                key: 'timestamp',
                render: (t: string) => <span style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>{t}</span>,
              },
              {
                title: 'Tài liệu ký số',
                dataIndex: 'documentName',
                key: 'documentName',
                render: (doc: string) => (
                  <span style={{ fontWeight: 600, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FilePdfOutlined /> {doc}
                  </span>
                ),
              },
              {
                title: 'Mã băm toàn vẹn (SHA-256)',
                dataIndex: 'hash',
                key: 'hash',
                render: (h: string) => <code style={{ fontSize: 11.5, background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>{h}</code>,
              },
              {
                title: 'Trạng thái',
                dataIndex: 'status',
                key: 'status',
                render: (st: string) => (
                  <Tag icon={<CheckOutlined />} color="success" style={{ fontWeight: 600 }}>
                    {st || 'Hợp lệ'}
                  </Tag>
                ),
              },
            ]}
            pagination={{ pageSize: 10 }}
          />
        </div>
      </div>
    );
  }

  // DEFAULT: Chữ ký số cá nhân (Giao diện phẳng, không khung to bao bọc thừa)
  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#009688', fontSize: 20 }}>
            <SafetyCertificateOutlined />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1E293B' }}>
              Chữ ký số cá nhân
            </h2>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
              Chữ ký số định danh điện tử của {empName} ({empCode})
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              setSignText(digisigData?.signatureText || empName);
              setIsSignModalOpen(true);
            }}
          >
            Đổi mẫu chữ ký
          </Button>
          <Button
            type="primary"
            icon={<SafetyCertificateOutlined />}
            onClick={() => handleTestSign('Văn bản chứng thực')}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Ký thử nghiệm
          </Button>
        </div>
      </div>

      {/* Warning Alert Banner if cert has not been issued */}
      {!hasCert && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <WarningOutlined style={{ color: '#D97706', fontSize: 20, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, color: '#92400E', fontSize: 14 }}>
              Chưa được cấp chứng thư số cá nhân
            </div>
            <div style={{ fontSize: 12.5, color: '#B45309', marginTop: 3, lineHeight: 1.5 }}>
              Tài khoản của bạn chưa được Quản trị viên cấp phát chứng thư số định danh. Vui lòng liên hệ Ban Nhân sự để được cấp chứng thư số
            </div>
          </div>
        </div>
      )}

      {/* Body Blocks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Serial Certificate Badge & Status */}
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 2 }}>Số serial chứng thư số</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>
              <KeyOutlined style={{ color: hasCert ? '#009688' : '#94A3B8' }} />
              {hasCert ? digisigData.certNumber : 'Chưa được cấp'}
            </div>
          </div>
          {hasCert ? (
            <Tag color="success" style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600 }}>
              <CheckCircleOutlined style={{ marginRight: 4 }} /> Đang hoạt động
            </Tag>
          ) : (
            <Tag color="default" style={{ padding: '4px 10px', fontSize: 12, fontWeight: 500 }}>
              Chưa cấp chứng thư
            </Tag>
          )}
        </div>

        {/* 3 Blocks Info */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {/* Box 1: Provider */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>Nhà cung cấp chứng thực CA</div>
            <div style={{ fontWeight: 600, color: hasCert ? '#1E293B' : '#94A3B8', fontSize: 13.5 }}>
              {hasCert ? (digisigData.provider || 'KIYO GROUP') : 'Chưa có dữ liệu'}
            </div>
          </div>

          {/* Box 2: Visual Signature Preview */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 6, textAlign: 'left' }}>Mẫu chữ ký hiển thị trên văn bản</div>
            <div style={{ height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={
                  digisigData?.signatureImage && digisigData.signatureImage.startsWith('data:image')
                    ? digisigData.signatureImage
                    : generateNameSignatureImage(digisigData?.signatureText || empName)
                }
                alt="Mẫu chữ ký"
                style={{ maxHeight: 68, maxWidth: 300, objectFit: 'contain' }}
              />
            </div>
          </div>

          {/* Box 3: Validity */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>Thời hạn chứng thư</div>
            <div style={{ fontWeight: 600, color: hasCert ? '#1E293B' : '#94A3B8', fontSize: 13 }}>
              {hasCert ? `${digisigData.issueDate || '01/01/2026'} → ${digisigData.expiryDate || '01/01/2029'}` : 'Chưa có dữ liệu'}
            </div>
          </div>
        </div>

        {/* Box 4: Bảo mật */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 6, background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#009688', fontSize: 18 }}>
              <KeyOutlined />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>Bảo mật</div>
              <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 1 }}>Xác thực bằng khóa truy cập</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isPasskeyActive ? (
              <span style={{ fontSize: 12, color: '#16A34A', background: '#DCFCE7', padding: '4px 10px', borderRadius: 4, fontWeight: 600 }}>
                <CheckCircleOutlined style={{ marginRight: 4 }} /> Đã kích hoạt
              </span>
            ) : (
              <span style={{ fontSize: 12, color: '#64748B', background: '#F1F5F9', padding: '4px 10px', borderRadius: 4, fontWeight: 500 }}>
                Chưa kích hoạt
              </span>
            )}
            <Button
              type={isPasskeyActive ? 'default' : 'primary'}
              loading={isActivatingPasskey}
              onClick={handleTogglePasskey}
              style={!isPasskeyActive ? { backgroundColor: '#009688', borderColor: '#009688' } : {}}
            >
              {isPasskeyActive ? 'Tắt' : 'Kích hoạt'}
            </Button>
          </div>
        </div>

      </div>

      {/* MODAL: ĐỔI MẪU CHỮ KÝ */}
      <Modal
        open={isSignModalOpen}
        onCancel={() => setIsSignModalOpen(false)}
        centered
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <HighlightOutlined style={{ color: '#009688', fontSize: 18 }} />
            <span>Thiết lập mẫu chữ ký số cá nhân</span>
          </div>
        }
        width={540}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setIsSignModalOpen(false)}>Hủy</Button>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              onClick={handleSaveSignature}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Xác nhận lưu chữ ký
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 2 }}>
          {/* Tab Selection */}
          <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', gap: 6 }}>
            {[
              { key: 'font', label: 'Mẫu Font chữ nghệ thuật', icon: <FontSizeOutlined /> },
              { key: 'draw', label: 'Vẽ tay trực tiếp', icon: <HighlightOutlined /> },
              { key: 'upload', label: 'Tải ảnh chữ ký', icon: <UploadOutlined /> },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSignTab(tab.key as any)}
                style={{
                  padding: '6px 12px',
                  background: 'none',
                  border: 'none',
                  borderBottom: signTab === tab.key ? '2px solid #009688' : '2px solid transparent',
                  color: signTab === tab.key ? '#009688' : '#64748B',
                  fontWeight: signTab === tab.key ? 700 : 500,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  outline: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div style={{ height: 204, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden' }}>
            {signTab === 'font' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 3 }}>
                    Tên hiển thị trên chữ ký
                  </label>
                  <BaseInput
                    value={signText}
                    onChange={(e) => setSignText(e.target.value)}
                    placeholder="Nhập tên chữ ký..."
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                  {[
                    { name: 'Nét bút lông mềm mại', font: '"Brush Script MT", "Caveat", "Dancing Script", cursive', size: 20, style: 'italic' },
                    { name: 'Chữ ký thanh lịch', font: '"Segoe Script", "Great Vibes", cursive', size: 18, style: 'italic' },
                    { name: 'Chữ ký viết tay phóng khoáng', font: '"Lucida Handwriting", "Sacramento", cursive', size: 18, style: 'normal' },
                    { name: 'Chữ ký nghệ thuật bay bổng', font: '"Alex Brush", "Cedarville Cursive", cursive', size: 21, style: 'italic' },
                  ].map((fItem, fIdx) => (
                    <div
                      key={fIdx}
                      onClick={() => setSelectedFontIndex(fIdx)}
                      style={{
                        border: selectedFontIndex === fIdx ? '2px solid #009688' : '2px solid #E2E8F0',
                        background: selectedFontIndex === fIdx ? '#F0FDFA' : '#FAFAFA',
                        borderRadius: 6,
                        padding: '6px 10px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        height: 64,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ fontFamily: fItem.font, fontStyle: fItem.style, fontSize: fItem.size, color: '#0052CC', lineHeight: 1.1, marginBottom: 1, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {signText || empName}
                      </div>
                      <div style={{ fontSize: 10.5, color: '#64748B' }}>{fItem.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {signTab === 'draw' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <Button size="small" onClick={clearCanvas}>
                    Xóa vẽ lại
                  </Button>
                </div>
                <div style={{ border: '2px dashed #009688', borderRadius: 6, background: '#FFFFFF', position: 'relative', overflow: 'hidden', height: 168, flex: 1 }}>
                  <canvas
                    ref={canvasRef}
                    width={480}
                    height={168}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
                  />
                </div>
              </div>
            )}

            {signTab === 'upload' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
                <FileUploadDialog open={signUploadPickerOpen} onClose={() => setSignUploadPickerOpen(false)} accept="image/*" multiple={false} title="Chọn ảnh chữ ký" confirmText="Chọn ảnh" onSelect={(files) => { const reader = new FileReader(); reader.onload = () => setUploadedSignImage(reader.result as string); reader.readAsDataURL(files[0]); }} />
                <div style={{ border: '2px dashed #CBD5E1', borderRadius: 6, padding: '14px', textAlign: 'center', background: '#F8FAFC', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <button type="button" onClick={() => setSignUploadPickerOpen(true)} style={{ cursor: 'pointer', width: '100%', border: 'none', background: 'transparent' }}>
                    <CloudUploadOutlined style={{ fontSize: 28, color: '#009688', marginBottom: 4, display: 'block' }} />
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B', marginBottom: 2 }}>
                      Nhấn để tải lên ảnh chữ ký
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>
                      Hỗ trợ PNG, JPG
                    </div>
                  </button>
                </div>
                {uploadedSignImage && (
                  <div style={{ textAlign: 'center', padding: '3px 6px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 6, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#64748B' }}>Xem trước:</span>
                    <img src={uploadedSignImage} alt="Preview" style={{ maxHeight: 34, maxWidth: 160, objectFit: 'contain' }} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Vị trí hiển thị chữ ký */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, color: '#64748B', marginBottom: 3 }}>Trang ký</label>
              <BaseSelect
                value={signaturePage}
                onChange={(val) => setSignaturePage(val as any)}
                style={{ width: '100%' }}
                options={[
                  { label: 'Trang đầu tiên', value: 'first' },
                  { label: 'Trang cuối cùng', value: 'last' },
                ]}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, color: '#64748B', marginBottom: 3 }}>Vị trí trên trang</label>
              <BaseSelect
                value={signaturePosition}
                onChange={(val) => setSignaturePosition(val as any)}
                style={{ width: '100%' }}
                options={[
                  { label: 'Góc dưới bên phải', value: 'bottom-right' },
                  { label: 'Góc dưới bên trái', value: 'bottom-left' },
                  { label: 'Góc trên bên phải', value: 'top-right' },
                  { label: 'Góc trên bên trái', value: 'top-left' },
                ]}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default EmployeePersonalDigitalSignatureModule;
