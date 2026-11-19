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
import { useAuth } from '../../context/AuthContext';
import { KTable } from '../../components/KTable';
import { FileUploadDialog } from '../../components/FileUploadDialog';
import { dataService } from '../../services/dataService';
import { passkeysApi } from '../../api/endpoints';
import { PasskeyCancelled } from '../../utils/webauthnEncoding';
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
      ctx.fillText(nameText || '', 280, 70);
      return canvas.toDataURL('image/png');
    }
  } catch (e) {}
  return '';
};

export const EmployeePersonalDigitalSignatureModule: React.FC = () => {
  const { user: authUser } = useAuth();
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
  const empCode = empProfile?.code || authUser?.employeeCode || '';
  const empName = sessionUser?.fullName || sessionUser?.name || empProfile?.name || '';

  const [digisigData, setDigisigData] = useState<any>(() => dataService.getEmployeeDigisig(empCode));
  const [signingLogs, setSigningLogs] = useState<any[]>(() => dataService.getEmployeeSigningLogs(empCode));
  const [historySearch, setHistorySearch] = useState('');

  // Yêu cầu khóa truy cập cho chữ ký số: máy chủ lưu thiết lập và chỉ nhận thao tác ghi khi có bằng chứng vừa xác thực.
  const [passkeyCount, setPasskeyCount] = useState(0);
  const [isPasskeyActive, setIsPasskeyActive] = useState(false);
  const [isActivatingPasskey, setIsActivatingPasskey] = useState(false);

  useEffect(() => {
    let active = true;
    passkeysApi.list()
      .then(({ data }) => { if (active) { setPasskeyCount(data.passkeys.length); setIsPasskeyActive(data.policy.requireForSigning); } })
      .catch(() => { if (active) message.warning('Không tải được thiết lập khóa truy cập của tài khoản.'); });
    return () => { active = false; };
  }, []);

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

  const handleTogglePasskey = async () => {
    if (!isPasskeyActive && passkeyCount === 0) {
      message.warning('Bạn cần đăng ký ít nhất một khóa truy cập trước khi bật yêu cầu này.');
      setTimeout(() => navigate(`${twosvPath}/passkeys`), 700);
      return;
    }
    setIsActivatingPasskey(true);
    try {
      // Tắt yêu cầu cũng cần xác thực bằng khóa: trình duyệt tự hỏi khi máy chủ đòi bằng chứng.
      const { data } = await passkeysApi.setSigningPolicy(!isPasskeyActive);
      setIsPasskeyActive(data.policy.requireForSigning);
      message.success(data.policy.requireForSigning ? 'Đã bật yêu cầu khóa truy cập cho chữ ký số.' : 'Đã tắt yêu cầu khóa truy cập cho chữ ký số.');
    } catch (error: any) {
      if (error instanceof PasskeyCancelled) message.info(error.message);
      else message.error(error?.response?.data?.message || error?.message || 'Không đổi được thiết lập khóa truy cập.');
    } finally {
      setIsActivatingPasskey(false);
    }
  };

  const handleSaveSignature = async () => {
    let finalImg = '';
    if (signTab === 'draw' && canvasRef.current) {
      finalImg = canvasRef.current.toDataURL('image/png');
    } else if (signTab === 'upload' && uploadedSignImage) {
      finalImg = uploadedSignImage;
    } else {
      const fontObj = SIGNATURE_FONTS[selectedFontIndex];
      finalImg = generateNameSignatureImage(signText || empName, fontObj ? fontObj.font : undefined);
    }
    try {
      // Máy chủ đòi bằng chứng khóa truy cập khi đã bật yêu cầu; hủy xác thực thì không lưu.
      const updated = await dataService.saveEmployeeSignatureVisual(empCode, finalImg, signTab, signText);
      setDigisigData({ ...digisigData, ...updated, signatureType: signTab, signatureText: signText, signatureImage: finalImg });
      try {
        localStorage.setItem('kiyovn_signature_position', signaturePosition);
        localStorage.setItem('kiyovn_signature_page', signaturePage);
      } catch (e) {}
      setIsSignModalOpen(false);
      message.success('Đã lưu mẫu chữ ký số cá nhân.');
    } catch (error: any) {
      if (error instanceof PasskeyCancelled) message.info(error.message);
      else message.error(error?.response?.data?.message || error?.message || 'Không lưu được mẫu chữ ký.');
    }
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
    message.warning(`Không thể ký "${docName}": hệ thống chưa được kết nối dịch vụ ký số có chứng thư và khóa riêng được xác thực.`);
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
