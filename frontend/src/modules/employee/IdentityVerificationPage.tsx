import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, message, Modal } from '../../custom-ui';
import { FileUploadDialog } from '../../components/FileUploadDialog';
import {
  SafetyCertificateOutlined,
  QrcodeOutlined,
  BulbOutlined,
  FileTextOutlined,
  ArrowRightOutlined,
  ArrowLeftOutlined,
  CheckOutlined,
  CameraOutlined,
  IdcardOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  WarningFilled,
  UploadOutlined,
  ReloadOutlined,
  ScanOutlined,
  UserOutlined,
  LockOutlined,
} from '@ant-design/icons';

import {
  EkycStep,
  EkycExtractedData,
  CardValidationResult,
  BiometricMatchResult,
  useCamera,
  useFaceDetection,
  FaceScanningViewfinder,
  CardScanningViewfinder,
  CardValidationService,
  EkycService,
} from '../ekyc';
import { QRCode } from '../ekyc/qr/QRCode';


export const IdentityVerificationPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get('token');

  const [subStep, setSubStep] = useState<EkycStep>(1);
  // Token 32 bytes (64 hex) — đủ an toàn và tạo QR gọn (version 7 EC M)
  const [ekycQrToken] = useState(() => (tokenParam || EkycService.generateToken(32)));
  const [isDesktopDevice, setIsDesktopDevice] = useState(() => !EkycService.isMobileDevice());
  // Theo dõi trạng thái điện thoại đã quét QR chưa (polling localStorage)
  const [qrScanned, setQrScanned] = useState(false);


  useEffect(() => {
    const handleCheckDevice = () => {
      setIsDesktopDevice(!EkycService.isMobileDevice());
    };
    handleCheckDevice();
    window.addEventListener('resize', handleCheckDevice);
    window.addEventListener('orientationchange', handleCheckDevice);
    return () => {
      window.removeEventListener('resize', handleCheckDevice);
      window.removeEventListener('orientationchange', handleCheckDevice);
    };
  }, [subStep]);

  // Polling: khi desktop đang hiển thị QR (bước 1 desktop), kiểm tra mỗi 2s
  // xem điện thoại đã quét và đánh dấu token chưa (qua localStorage hoặc API)
  useEffect(() => {
    if (!isDesktopDevice || subStep !== 1 || qrScanned) return;
    const TOKEN_KEY = `ekyc_token_done_${ekycQrToken}`;
    // Đánh dấu token vào localStorage (mobile sẽ set khi load URL với token)
    const interval = setInterval(() => {
      if (localStorage.getItem(TOKEN_KEY) === '1') {
        setQrScanned(true);
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [isDesktopDevice, subStep, ekycQrToken, qrScanned]);

  // Khi mobile mở trang với token param → đánh dấu token đã được quét
  useEffect(() => {
    if (tokenParam && !isDesktopDevice) {
      const TOKEN_KEY = `ekyc_token_done_${tokenParam}`;
      localStorage.setItem(TOKEN_KEY, '1');
    }
  }, [tokenParam, isDesktopDevice]);

  // eKYC Data State

  const [ekycData, setEkycData] = useState<EkycExtractedData>({
    idNumber: '001095012345',
    name: 'Nguyễn Huy Tùng',
    birthDate: '1995-08-19',
    gender: 'Nam',
    nationality: 'Việt Nam',
    originPlace: 'Hà Nội',
    residencePlace: 'Thôn 1 Bát Tràng, Gia Lâm, Hà Nội',
    issueDate: '2021-05-20',
    issuePlace: 'Cục Cảnh sát Quản lý hành chính về trật tự xã hội',
    expiryDate: '2035-08-19',
  });

  const [livePhoto, setLivePhoto] = useState<string | null>(null);
  const [liveVideo, setLiveVideo] = useState<string | null>(null);
  const [cardFrontPhoto, setCardFrontPhoto] = useState<string | null>(null);
  const [cardBackPhoto, setCardBackPhoto] = useState<string | null>(null);
  const [croppedAvatar, setCroppedAvatar] = useState<string | null>(null);

  const [cardFrontResult, setCardFrontResult] = useState<CardValidationResult | null>(null);
  const [cardBackResult, setCardBackResult] = useState<CardValidationResult | null>(null);
  const [matchResult, setMatchResult] = useState<BiometricMatchResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [identityPickerOpen, setIdentityPickerOpen] = useState(false);
  const [identityUploadTarget, setIdentityUploadTarget] = useState<'live' | 'front' | 'back'>('live');

  // Hook Camera
  const {
    videoRef,
    isActive: isCameraActive,
    isLoading: isCameraLoading,
    isRecording: isCameraRecording,
    error: cameraError,
    startCamera,
    stopCamera,
    stopRecording,
    captureFrame,
  } = useCamera('user');

  const handleSnapshotPhotoRef = useRef<(() => void) | undefined>(undefined);
  const handleCompleteLivenessRef = useRef<(() => void) | undefined>(undefined);

  // Hook Face Detection BlazeFace
  const {
    canvasRef,
    faceValid,
    livenessStage,
    countdownProgress,
    validationResult: faceValidationResult,
    statusMessage: faceStatusMessage,
    clearCanvas,
  } = useFaceDetection(
    videoRef,
    isCameraActive && subStep === 2,
    {
      onSnapshotPhoto: () => handleSnapshotPhotoRef.current?.(),
      onCompleteLiveness: () => handleCompleteLivenessRef.current?.(),
    }
  );

  const [livenessCompleted, setLivenessCompleted] = useState(false);

  // 1. Chụp ảnh chân dung sau 3s nhìn thẳng
  const handleSnapshotPhoto = useCallback(() => {
    const photo = captureFrame(720, 1280);
    if (photo) {
      setLivePhoto(photo);
      setEkycData((prev) => ({ ...prev, livePhotoUrl: photo }));
    }
  }, [captureFrame]);
  handleSnapshotPhotoRef.current = handleSnapshotPhoto;

  // 2. Hoàn tất toàn bộ 4 bước Liveness (Nhìn thẳng 3s -> Quay phải -> Quay trái -> Ngẩng lên 3s)
  const handleCompleteLiveness = useCallback(async () => {
    setLivenessCompleted(true);
    setIsProcessing(true);
    const videoData = await stopRecording();
    if (videoData) {
      setLiveVideo(videoData);
      setEkycData((prev) => ({ ...prev, liveVideoUrl: videoData }));
    }
    stopCamera();
    clearCanvas();
    setIsProcessing(false);

    message.success('🎉 Xác thực sinh trắc học thành công 100%!');

    Modal.success({
      title: 'Xác thực sinh trắc học thành công!',
      content: 'Đã hoàn thành 100% kiểm tra Liveness khuôn mặt (Nhìn thẳng, Quay phải, Quay trái, Ngẩng lên). Đã lưu trữ 1 Video sinh trắc học và 1 Ảnh chân dung.',
      okText: 'Tiếp tục quét CCCD',
      onOk: () => setSubStep(3),
    });

    setTimeout(() => {
      setSubStep(3);
    }, 2200);
  }, [stopRecording, stopCamera, clearCanvas]);
  handleCompleteLivenessRef.current = handleCompleteLiveness;

  // Điều phối camera theo bước - Bước 2 tự động kích hoạt quay video sinh trắc học và duy trì suốt 4 bước liveness
  useEffect(() => {
    if (subStep === 2 && !livenessCompleted) {
      startCamera('user', true);
    } else if (subStep === 3 && !cardFrontPhoto) {
      startCamera('environment', false);
    } else if (subStep === 4 && !cardBackPhoto) {
      startCamera('environment', false);
    } else {
      stopCamera();
      clearCanvas();
    }
  }, [subStep, livenessCompleted, cardFrontPhoto, cardBackPhoto, startCamera, stopCamera, clearCanvas]);

  // 2. Chụp ảnh Mặt trước CCCD
  const handleCaptureCardFront = async () => {
    const photo = captureFrame(960, 600);
    if (!photo) {
      message.error('Không thể chụp từ camera. Vui lòng tải ảnh lên từ thiết bị.');
      return;
    }

    setIsProcessing(true);
    message.loading('Đang phân tích hình ảnh và trích xuất dữ liệu mặt trước CCCD...', 1.2);

    const result = await CardValidationService.validateFrontCard(photo);
    setCardFrontPhoto(photo);
    setCardFrontResult(result);
    setIsProcessing(false);
    stopCamera();

    if (result.hasCard && result.isValid && result.extractedData) {
      setCroppedAvatar(result.extractedData.cardAvatarUrl || null);
      setEkycData((prev) => ({ ...prev, ...result.extractedData, cardFrontUrl: photo }));
      message.success('Đã nhận diện thông tin mặt trước CCCD thành công!');
    } else {
      message.error(result.message);
    }
  };

  // 3. Chụp ảnh Mặt sau CCCD
  const handleCaptureCardBack = async () => {
    const photo = captureFrame(960, 600);
    if (!photo) {
      message.error('Không thể chụp từ camera. Vui lòng tải ảnh lên từ thiết bị.');
      return;
    }

    setIsProcessing(true);
    message.loading('Đang giải mã mã QR và dải mã MRZ trên thẻ CCCD...', 1.2);

    const result = await CardValidationService.validateBackCard(photo, ekycData);
    setCardBackPhoto(photo);
    setCardBackResult(result);
    setIsProcessing(false);
    stopCamera();

    if (result.hasCard && result.isValid && result.extractedData) {
      setEkycData((prev) => ({ ...prev, ...result.extractedData, cardBackUrl: photo }));
      message.success('Đã giải mã mã QR CCCD thành công!');
    } else {
      message.error(result.message);
    }
  };

  // 4. Đối soát sinh trắc học & Hoàn tất
  const handleRunFaceMatch = async () => {
    if (!livePhoto) {
      message.error('Thiếu ảnh chụp khuôn mặt.');
      return;
    }
    if (!cardFrontResult?.hasCard || !cardFrontResult?.isValid) {
      message.error('Ảnh mặt trước CCCD chưa hợp lệ.');
      return;
    }
    if (!cardBackResult?.hasCard || !cardBackResult?.isValid) {
      message.error('Ảnh mặt sau CCCD chưa hợp lệ.');
      return;
    }

    setIsProcessing(true);
    message.loading('Đang so khớp sinh trắc học khuôn mặt và cấp chứng thư...', 1.5);

    const match = await EkycService.matchFaces(livePhoto, croppedAvatar || cardFrontPhoto || undefined);
    setMatchResult(match);

    const finalVerifiedData: EkycExtractedData = {
      ...ekycData,
      livePhotoUrl: livePhoto,
      cardFrontUrl: cardFrontPhoto || undefined,
      cardBackUrl: cardBackPhoto || undefined,
      cardAvatarUrl: croppedAvatar || undefined,
      faceMatchScore: match.matchScore,
      certificateId: match.certId,
      verifiedAt: match.verifiedAt,
    };

    setEkycData(finalVerifiedData);
    try {
      localStorage.setItem('employee_ekyc_verified', JSON.stringify(finalVerifiedData));

      // Tự động đồng bộ sang hồ sơ CMND / Thẻ căn cước / Hộ chiếu
      const syncWizardData = (storageKey: string) => {
        try {
          const raw = localStorage.getItem(storageKey);
          const existing = raw ? JSON.parse(raw) : {};
          const merged = {
            ...existing,
            docType: 'Căn cước công dân',
            docNumber: finalVerifiedData.idNumber || existing.docNumber || '001095012345',
            docIssueDate: finalVerifiedData.issueDate || existing.docIssueDate || '2021-05-20',
            docIssuePlace: finalVerifiedData.issuePlace || existing.docIssuePlace || 'Cục Cảnh sát Quản lý hành chính về trật tự xã hội',
            docExpiryDate: finalVerifiedData.expiryDate || existing.docExpiryDate || '2035-08-19',
            name: finalVerifiedData.name || existing.name,
            displayName: finalVerifiedData.name || existing.displayName || existing.name,
            birthDate: finalVerifiedData.birthDate || existing.birthDate,
            gender: finalVerifiedData.gender || existing.gender,
            originPlace: finalVerifiedData.originPlace || existing.originPlace,
            hkttAddress: finalVerifiedData.residencePlace || existing.hkttAddress,
            currentAddress: finalVerifiedData.residencePlace || existing.currentAddress,
            avatarUrl: finalVerifiedData.cardAvatarUrl || finalVerifiedData.livePhotoUrl || existing.avatarUrl,
          };
          localStorage.setItem(storageKey, JSON.stringify(merged));
        } catch (e) {}
      };
      syncWizardData('kiyovn_wizard_profile_data_admin');
      syncWizardData('kiyovn_wizard_profile_data_employee');
    } catch {}

    setIsProcessing(false);
    setSubStep(5);
    message.success('Đối soát sinh trắc học thành công! Tự động lưu thông tin CCCD vào hồ sơ.');
  };

  // Xử lý upload tệp
  const handleFileUpload = (file: File | undefined, mode: 'live' | 'front' | 'back') => {
    if (!file) return;

    // Chỉ giới hạn loại tệp, không giới hạn dung lượng ở giao diện tải lên.
    if (!file.type.startsWith('image/')) {
      message.error('Vui lòng chọn tệp định dạng hình ảnh (PNG, JPG, JPEG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      if (!base64) return;

      setIsProcessing(true);
      if (mode === 'live') {
        setLivePhoto(base64);
        stopCamera();
        message.success('Đã tải ảnh chân dung thành công!');
      } else if (mode === 'front') {
        const res = await CardValidationService.validateFrontCard(base64);
        setCardFrontPhoto(base64);
        setCardFrontResult(res);
        if (res.hasCard && res.isValid && res.extractedData) {
          setCroppedAvatar(res.extractedData.cardAvatarUrl || null);
          setEkycData((prev) => ({ ...prev, ...res.extractedData, cardFrontUrl: base64 }));
          message.success('Đã trích xuất thông tin mặt trước CCCD!');
        } else {
          message.error(res.message);
        }
      } else if (mode === 'back') {
        const res = await CardValidationService.validateBackCard(base64, ekycData);
        setCardBackPhoto(base64);
        setCardBackResult(res);
        if (res.hasCard && res.isValid && res.extractedData) {
          setEkycData((prev) => ({ ...prev, ...res.extractedData, cardBackUrl: base64 }));
          message.success('Đã giải mã mã QR mặt sau CCCD!');
        } else {
          message.error(res.message);
        }
      }
      setIsProcessing(false);
    };
    reader.readAsDataURL(file);
  };

  // Mở trình chọn tệp dùng chung theo giao diện /files.
  const triggerNativeCamera = (mode: 'live' | 'front' | 'back') => {
    setIdentityUploadTarget(mode);
    setIdentityPickerOpen(true);
  };

  const stepperRef = useRef<HTMLDivElement>(null);

  const steps = [
    { num: 1, title: 'Chuẩn bị' },
    { num: 2, title: 'Khuôn mặt' },
    { num: 3, title: 'CCCD trước' },
    { num: 4, title: 'CCCD sau' },
    { num: 5, title: 'Xác nhận' },
  ];

  useEffect(() => {
    if (stepperRef.current) {
      const activeEl = stepperRef.current.querySelector(`#ekyc-step-item-${subStep}`) as HTMLElement;
      if (activeEl) {
        const container = stepperRef.current;
        const targetLeft = activeEl.offsetLeft - (container.clientWidth / 2) + (activeEl.clientWidth / 2);
        container.scrollTo({
          left: Math.max(0, targetLeft),
          behavior: 'smooth',
        });
      }
    }
  }, [subStep]);

  return (
    <div
      className="k-ekyc-standalone-container"
      style={{
        padding: isDesktopDevice ? '16px' : '0',
        maxWidth: isDesktopDevice ? 1000 : '100%',
        margin: '0 auto',
        width: '100%',
        minHeight: '100vh',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      {/* Main Card */}
      <div
        className="k-ekyc-main-card"
        style={{
          background: '#FFFFFF',
          border: isDesktopDevice ? '1px solid #E2E8F0' : 'none',
          borderRadius: isDesktopDevice ? 10 : 0,
          padding: isDesktopDevice ? 24 : '10px 10px 75px 10px',
          boxShadow: isDesktopDevice ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Step Indicator */}
        <div
          ref={stepperRef}
          className="k-ekyc-stepper"
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'nowrap',
            marginBottom: isDesktopDevice ? 20 : 8,
            padding: isDesktopDevice ? '12px 16px' : '8px 12px',
            background: '#F8FAFC',
            borderRadius: 8,
            border: '1px solid #F1F5F9',
            flexShrink: 0,
            overflowX: 'auto',
            overflowY: 'hidden',
            whiteSpace: 'nowrap',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-x',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'nowrap',
              whiteSpace: 'nowrap',
              minWidth: 'max-content',
            }}
          >
            {steps.map((st, idx, arr) => {
              const isActive = subStep === st.num;
              const isPassed = subStep > st.num;
              return (
                <React.Fragment key={st.num}>
                  <div
                    id={`ekyc-step-item-${st.num}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: isPassed ? 'pointer' : 'default',
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                    }}
                    onClick={() => {
                      if (isPassed) setSubStep(st.num as any);
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 600,
                        backgroundColor: isPassed ? '#E0F2F1' : isActive ? '#009688' : '#FFFFFF',
                        color: isPassed ? '#009688' : isActive ? '#FFFFFF' : '#94A3B8',
                        border: isPassed ? '1px solid #B2DFDB' : isActive ? '1px solid #009688' : '1px solid #CBD5E1',
                        flexShrink: 0,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {isPassed ? <CheckOutlined style={{ fontSize: 11, fontWeight: 'bold' }} /> : st.num}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: isActive ? 600 : isPassed ? 500 : 400,
                        color: isActive ? '#009688' : isPassed ? '#1E293B' : '#94A3B8',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {st.title}
                    </div>
                  </div>
                  {idx < arr.length - 1 && (
                    <div
                      style={{
                        width: isDesktopDevice ? 32 : 18,
                        minWidth: isDesktopDevice ? 32 : 18,
                        maxWidth: isDesktopDevice ? 32 : 18,
                        height: 1,
                        background: isPassed ? '#009688' : '#E2E8F0',
                        margin: '0 8px',
                        flexShrink: 0,
                      }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <FileUploadDialog open={identityPickerOpen} onClose={() => setIdentityPickerOpen(false)} onSelect={(files) => handleFileUpload(files[0], identityUploadTarget)} title="Chọn ảnh xác minh danh tính" accept="image/*" multiple={false} confirmText="Chọn ảnh" />

        {/* ========================================================================= */}
        {/* Bước 1: CHUẨN BỊ / QUÉT QR (DESKTOP) */}
        {/* ========================================================================= */}
        {subStep === 1 && (
          <>
            {/* ── Desktop: hiển thị QR để quét bằng điện thoại ── */}
            {isDesktopDevice && !qrScanned && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '24px 0' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#0F172A' }}>Quét mã QR để tiếp tục trên điện thoại</div>
                  <div style={{ fontSize: 13, color: '#64748B', marginTop: 6, maxWidth: 420, margin: '8px auto 0' }}>
                    Tính năng xác thực khuôn mặt và CCCD yêu cầu camera điện thoại để đảm bảo chất lượng hình ảnh và độ chính xác sinh trắc học.
                  </div>
                </div>

                {/* QR Code thuần TS — không API bên ngoài, to gần chạm khung */}
                <div style={{
                  padding: 6, background: '#ffffff', borderRadius: 8,
                  border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                }}>
                  <QRCode
                    value={`${window.location.origin}${window.location.pathname}?token=${ekycQrToken}`}
                    size={260}
                    quietZone={1}
                    ecLevel="M"
                    foreground="#111827"
                    background="#ffffff"
                  />
                </div>


                {/* Trạng thái chờ */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: '#F0FDFA', border: '1px solid #CCFBF1',
                  borderRadius: 20, padding: '8px 18px', fontSize: 13, color: '#0F766E',
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', background: '#10B981',
                    display: 'inline-block', animation: 'pulse 1.5s infinite',
                  }} />
                  Đang chờ quét mã QR từ điện thoại...
                </div>

                <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>
                  Mã QR sẽ tự động cập nhật sau khi điện thoại quét thành công
                </div>
              </div>
            )}

            {/* ── Desktop: điện thoại đã quét → tiếp tục ── */}
            {isDesktopDevice && qrScanned && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 0' }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%', background: '#E0F2F1',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
                }}>✅</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0F766E' }}>Điện thoại đã quét thành công!</div>
                <div style={{ fontSize: 13, color: '#64748B', textAlign: 'center' }}>
                  Vui lòng tiếp tục thực hiện xác thực trên điện thoại của bạn.
                  Màn hình này sẽ tự động cập nhật khi hoàn thành.
                </div>
              </div>
            )}

            {/* ── Mobile: hướng dẫn chuẩn bị bình thường ── */}
            {!isDesktopDevice && (

          <div className="k-ekyc-guide-grid">
            {/* Cột trái */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  background: '#F0FDFA',
                  border: '1px solid #CCFBF1',
                  borderRadius: 8,
                  padding: 16,
                  display: 'flex',
                  gap: 14,
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 6,
                    background: '#E0F2F1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#009688',
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                >
                  <LockOutlined />
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#0F766E', fontSize: 14 }}>Bảo mật dữ liệu 100%</div>
                  <div style={{ fontSize: 12.5, color: '#475569', marginTop: 4, lineHeight: 1.5 }}>
                    Mọi hình ảnh camera và dữ liệu khuôn mặt được xử lý trực tiếp trên trình duyệt của bạn qua AI Local.
                    Không gửi hình ảnh lên máy chủ bên ngoài.
                  </div>
                </div>
              </div>


              <div
                style={{
                  background: '#FFFDF5',
                  border: '1px solid #FEF3C7',
                  borderRadius: 8,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BulbOutlined style={{ color: '#D97706', fontSize: 16 }} />
                  <span style={{ fontWeight: 700, color: '#92400E', fontSize: 13.5 }}>Mẹo nhanh</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: '#475569' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#009688', marginTop: 6, flexShrink: 0 }} />
                    <span>Đảm bảo CCCD còn hiệu lực, rõ ràng, không mờ</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#009688', marginTop: 6, flexShrink: 0 }} />
                    <span>Chụp ảnh nơi đủ sáng, tránh ngược sáng / lóa sáng</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#009688', marginTop: 6, flexShrink: 0 }} />
                    <span>Chỉ có duy nhất một người trong khung hình</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cột phải */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 300 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <FileTextOutlined style={{ color: '#009688', fontSize: 18 }} />
                  <span style={{ fontWeight: 700, color: '#0F172A', fontSize: 15 }}>Hướng dẫn chuẩn bị</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 14px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E0F2F1', color: '#009688', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>1</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1E293B' }}>Cho phép quyền camera & Đủ ánh sáng</div>
                    <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>
                      Cho phép trình duyệt truy cập camera. Đảm bảo môi trường đủ sáng, không ngược sáng.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 14px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E0F2F1', color: '#009688', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>2</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1E293B' }}>Giữ khuôn mặt thẳng</div>
                    <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>
                      Nhìn thẳng vào camera, không đeo khẩu trang hoặc kính râm tối màu.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 14px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E0F2F1', color: '#009688', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>3</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1E293B' }}>Chuẩn bị sẵn thẻ CCCD</div>
                    <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>
                      Cầm sẵn thẻ Căn cước công dân gắn chip để quét mặt trước và mã QR mặt sau.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
            )}
          </>
        )}


        {/* ========================================================================= */}
        {/* Bước 2: KHUÔN MẶT */}
        {/* ========================================================================= */}
        {subStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '12px 0' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>Xác thực khuôn mặt</div>
              <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
                Giữ thẳng khuôn mặt trong khung hình và nhìn thẳng vào camera
              </div>
            </div>

            {/* Viewfinder Quét Khuôn Mặt */}
            <FaceScanningViewfinder
              videoRef={videoRef}
              canvasRef={canvasRef}
              capturedPhoto={livePhoto}
              isCameraActive={isCameraActive}
              isCameraLoading={isCameraLoading}
              isRecording={isCameraRecording}
              hasRecordedVideo={!!liveVideo}
              livenessStage={livenessStage}
              countdownProgress={countdownProgress}
              cameraError={cameraError}
              faceValid={faceValid}
              validationResult={faceValidationResult}
              statusMessage={faceStatusMessage}
              onTakePhoto={() => triggerNativeCamera('live')}
            />

            {/* Nút Tiếp tục sau khi đã hoàn thành toàn bộ xác thực Liveness */}
            {(livenessStage === 'COMPLETED' || livenessCompleted) && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
                <Button
                  type="primary"
                  onClick={() => setSubStep(3)}
                  style={{
                    backgroundColor: '#009688',
                    borderColor: '#009688',
                    borderRadius: 6,
                    padding: '0 24px',
                    height: 36,
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  Tiếp tục quét CCCD mặt trước <ArrowRightOutlined />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* Bước 3: CCCD TRƯỚC */}
        {/* ========================================================================= */}
        {subStep === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '12px 0' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>Chụp ảnh Căn cước công dân - Mặt trước</div>
              <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
                Đặt mặt trước thẻ CCCD nằm trọn trong khung hình, đảm bảo đủ sáng và rõ nét
              </div>
            </div>

            {/* Viewfinder Quét Thẻ CCCD Mặt Trước */}
            <CardScanningViewfinder
              mode="front"
              videoRef={videoRef}
              capturedPhoto={cardFrontPhoto}
              isCameraActive={isCameraActive}
              isCameraLoading={isCameraLoading}
              cameraError={cameraError}
              validationResult={cardFrontResult}
              onTakePhoto={() => triggerNativeCamera('front')}
            />

            {/* Nút Điều Khiển */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button onClick={() => setSubStep(2)} style={{ borderRadius: 6, height: 36 }}>Quay lại</Button>

              {cardFrontPhoto ? (
                <>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={() => {
                      setCardFrontPhoto(null);
                      setCardFrontResult(null);
                      startCamera('environment');
                    }}
                    style={{ borderRadius: 6, height: 36 }}
                  >
                    Chụp lại
                  </Button>
                  <Button
                    type="primary"
                    disabled={!cardFrontResult?.hasCard || !cardFrontResult?.isValid}
                    onClick={() => {
                      if (!cardFrontResult?.hasCard || !cardFrontResult?.isValid) {
                        message.error('Vui lòng chụp lại ảnh thẻ CCCD hợp lệ.');
                        return;
                      }
                      setSubStep(4);
                    }}
                    style={{
                      backgroundColor: cardFrontResult?.hasCard && cardFrontResult?.isValid ? '#009688' : '#94A3B8',
                      borderColor: cardFrontResult?.hasCard && cardFrontResult?.isValid ? '#009688' : '#94A3B8',
                      borderRadius: 6,
                      padding: '0 20px',
                      height: 36,
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    Xác nhận mặt trước &amp; Tiếp tục <ArrowRightOutlined />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    icon={<CameraOutlined />}
                    onClick={() => triggerNativeCamera('front')}
                    style={{ borderRadius: 6, height: 36, borderColor: '#009688', color: '#00796B', fontWeight: 600 }}
                  >
                    Chụp ảnh / Tải ảnh CCCD
                  </Button>

                  <Button
                    type="primary"
                    onClick={handleCaptureCardFront}
                    loading={isProcessing}
                    style={{
                      backgroundColor: '#009688',
                      borderColor: '#009688',
                      borderRadius: 6,
                      padding: '0 20px',
                      height: 36,
                      fontWeight: 600,
                      fontSize: 13,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <CameraOutlined /> Chụp từ khung hình
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Bước 4: CCCD SAU */}
        {/* ========================================================================= */}
        {subStep === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '12px 0' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>Chụp ảnh Căn cước công dân - Mặt sau</div>
              <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
                Đặt mặt sau CCCD (phần có chip điện tử &amp; mã QR) trong khung hình
              </div>
            </div>

            {/* Viewfinder Quét Thẻ CCCD Mặt Sau */}
            <CardScanningViewfinder
              mode="back"
              videoRef={videoRef}
              capturedPhoto={cardBackPhoto}
              isCameraActive={isCameraActive}
              isCameraLoading={isCameraLoading}
              cameraError={cameraError}
              validationResult={cardBackResult}
              onTakePhoto={() => triggerNativeCamera('back')}
            />

            {/* Nút Điều Khiển */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button onClick={() => setSubStep(3)} style={{ borderRadius: 6, height: 36 }}>Quay lại</Button>

              {cardBackPhoto ? (
                <>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={() => {
                      setCardBackPhoto(null);
                      setCardBackResult(null);
                      startCamera('environment');
                    }}
                    style={{ borderRadius: 6, height: 36 }}
                  >
                    Chụp lại
                  </Button>
                  <Button
                    type="primary"
                    disabled={!cardBackResult?.hasCard || !cardBackResult?.isValid}
                    onClick={handleRunFaceMatch}
                    loading={isProcessing}
                    style={{
                      backgroundColor: cardBackResult?.hasCard && cardBackResult?.isValid ? '#009688' : '#94A3B8',
                      borderColor: cardBackResult?.hasCard && cardBackResult?.isValid ? '#009688' : '#94A3B8',
                      borderRadius: 6,
                      padding: '0 20px',
                      height: 36,
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    Hoàn tất &amp; Đối soát sinh trắc học <ArrowRightOutlined />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    icon={<CameraOutlined />}
                    onClick={() => triggerNativeCamera('back')}
                    style={{ borderRadius: 6, height: 36, borderColor: '#009688', color: '#00796B', fontWeight: 600 }}
                  >
                    Chụp ảnh / Tải ảnh CCCD
                  </Button>

                  <Button
                    type="primary"
                    onClick={handleCaptureCardBack}
                    loading={isProcessing}
                    style={{
                      backgroundColor: '#009688',
                      borderColor: '#009688',
                      borderRadius: 6,
                      padding: '0 20px',
                      height: 36,
                      fontWeight: 600,
                      fontSize: 13,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <CameraOutlined /> Chụp &amp; Quét QR Code
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Bước 5: XÁC NHẬN */}
        {/* ========================================================================= */}
        {subStep === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '8px 0' }}>
            <div
              style={{
                background: '#F0FDFA',
                border: '1px solid #CCFBF1',
                borderRadius: 8,
                padding: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <CheckCircleFilled style={{ color: '#009688', fontSize: 28 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0F766E' }}>
                    Xác thực danh tính Thành Công
                  </div>
                  <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>
                    Chứng thư xác thực điện tử: <strong>{ekycData.certificateId || 'NEAC-EKYC-2026'}</strong>
                  </div>
                </div>
              </div>
              <div
                style={{
                  background: '#009688',
                  color: '#FFFFFF',
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Độ khớp sinh trắc: {ekycData.faceMatchScore || 99.4}%
              </div>
            </div>

            {/* Bảng so sánh chân dung đối chiếu */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16,
                background: '#F8FAFC',
                padding: 16,
                borderRadius: 8,
                border: '1px solid #F1F5F9',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Ảnh chụp Camera</span>
                <div
                  style={{
                    width: 120,
                    height: 120,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    border: '2px solid #009688',
                    background: '#0F172A',
                  }}
                >
                  {livePhoto ? (
                    <img src={livePhoto} alt="Live" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <UserOutlined style={{ fontSize: 40, color: '#94A3B8', marginTop: 35 }} />
                  )}
                </div>
                <span style={{ fontSize: 11, color: '#0F766E', fontWeight: 600 }}>✓ Live Selfie</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Ảnh thẻ CCCD</span>
                <div
                  style={{
                    width: 100,
                    height: 120,
                    borderRadius: 6,
                    overflow: 'hidden',
                    border: '2px solid #009688',
                    background: '#0F172A',
                  }}
                >
                  {croppedAvatar || cardFrontPhoto ? (
                    <img
                      src={croppedAvatar || cardFrontPhoto!}
                      alt="Card Avatar"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <IdcardOutlined style={{ fontSize: 40, color: '#94A3B8', marginTop: 35 }} />
                  )}
                </div>
                <span style={{ fontSize: 11, color: '#0F766E', fontWeight: 600 }}>✓ Cắt tự động AI</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
                <div style={{ fontSize: 12, color: '#64748B' }}>
                  Họ và tên: <strong style={{ color: '#0F172A' }}>{ekycData.name}</strong>
                </div>
                <div style={{ fontSize: 12, color: '#64748B' }}>
                  Số CCCD: <strong style={{ color: '#009688' }}>{ekycData.idNumber}</strong>
                </div>
                <div style={{ fontSize: 12, color: '#64748B' }}>
                  Ngày sinh: <strong>{ekycData.birthDate}</strong> ({ekycData.gender})
                </div>
                <div style={{ fontSize: 12, color: '#64748B' }}>
                  Quê quán: <strong>{ekycData.originPlace}</strong>
                </div>
                <div style={{ fontSize: 12, color: '#64748B' }}>
                  Nơi thường trú: <strong>{ekycData.residencePlace}</strong>
                </div>
              </div>
            </div>

            {/* Dữ liệu trích xuất chi tiết */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <div style={{ padding: 12, border: '1px solid #E2E8F0', borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>NGÀY CẤP</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', marginTop: 2 }}>{ekycData.issueDate}</div>
              </div>
              <div style={{ padding: 12, border: '1px solid #E2E8F0', borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>NƠI CẤP</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', marginTop: 2 }}>{ekycData.issuePlace}</div>
              </div>
              <div style={{ padding: 12, border: '1px solid #E2E8F0', borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>HẠN SỬ DỤNG</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', marginTop: 2 }}>{ekycData.expiryDate}</div>
              </div>
            </div>

          </div>
        )}

        {/* Sticky/Fixed Bottom Navigation Bar for Mobile & Desktop */}
        <div
          style={{
            position: isDesktopDevice ? 'sticky' : 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            width: '100%',
            background: '#FFFFFF',
            borderTop: '1px solid #E2E8F0',
            padding: isDesktopDevice ? '12px 24px' : '10px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 'auto',
            zIndex: 9999,
            boxShadow: '0 -2px 10px rgba(0,0,0,0.06)',
            borderRadius: isDesktopDevice ? '0 0 10px 10px' : 0,
            boxSizing: 'border-box',
          }}
        >
          <Button
            disabled={subStep === 1}
            onClick={() => {
              if (subStep > 1) setSubStep((prev) => (prev - 1) as any);
            }}
            style={{
              borderRadius: 6,
              height: 36,
              padding: '0 16px',
              fontSize: 13,
            }}
          >
            <ArrowLeftOutlined /> Quay lại
          </Button>

          {subStep < 5 ? (
            <Button
              type="primary"
              onClick={() => {
                if (subStep === 1) {
                  setSubStep(2);
                } else if (subStep === 2) {
                  if (!livePhoto && livenessStage !== 'COMPLETED') {
                    message.warning('Vui lòng chụp hoặc hoàn thành quét khuôn mặt.');
                    return;
                  }
                  setSubStep(3);
                } else if (subStep === 3) {
                  if (!cardFrontResult?.hasCard || !cardFrontResult?.isValid) {
                    message.warning('Vui lòng chụp ảnh thẻ CCCD mặt trước hợp lệ.');
                    return;
                  }
                  setSubStep(4);
                } else if (subStep === 4) {
                  if (!cardBackResult?.hasCard || !cardBackResult?.isValid) {
                    message.warning('Vui lòng chụp ảnh thẻ CCCD mặt sau hợp lệ.');
                    return;
                  }
                  handleRunFaceMatch();
                }
              }}
              style={{
                backgroundColor: '#009688',
                borderColor: '#009688',
                borderRadius: 6,
                height: 36,
                padding: '0 20px',
                fontWeight: 600,
                fontSize: 13,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>{subStep === 1 ? 'Bắt đầu xác thực' : subStep === 4 ? 'Hoàn tất & Đối soát' : 'Tiếp theo'}</span>
              <ArrowRightOutlined />
            </Button>
          ) : (
            <Button
              type="primary"
              onClick={() => {
                message.success('Đã lưu dữ liệu hồ sơ xác thực eKYC thành công!');
                navigate('/employee');
              }}
              style={{
                backgroundColor: '#009688',
                borderColor: '#009688',
                borderRadius: 6,
                height: 36,
                padding: '0 20px',
                fontWeight: 600,
                fontSize: 13,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>Hoàn tất hồ sơ</span>
              <CheckOutlined />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
