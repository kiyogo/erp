/**
 * CardScanningViewfinder - Khung ngắm quét thẻ Căn cước công dân
 */

import React from 'react';
import {
  ScanOutlined,
  CloseCircleFilled,
  LoadingOutlined,
} from '@ant-design/icons';
import { CardValidationResult, CameraError } from '../types/ekyc.types';

interface CardScanningViewfinderProps {
  mode: 'front' | 'back';
  videoRef: React.RefObject<HTMLVideoElement>;
  capturedPhoto: string | null;
  isCameraActive: boolean;
  isCameraLoading: boolean;
  cameraError: CameraError | null;
  validationResult: CardValidationResult | null;
  onTakePhoto?: () => void;
}

export const CardScanningViewfinder: React.FC<CardScanningViewfinderProps> = ({
  mode,
  videoRef,
  capturedPhoto,
  isCameraActive,
  isCameraLoading,
  cameraError,
  validationResult,
  onTakePhoto,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        width: '100%',
      }}
    >
      {/* Khung Chữ Nhật Quét CCCD Chuẩn Tỉ Lệ Quốc Tế (85.6mm x 53.98mm) */}
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          aspectRatio: '85.6 / 54',
          borderRadius: 12,
          border: '2px solid #009688',
          background: '#0F172A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 8px 24px -4px rgba(0, 150, 136, 0.2), 0 4px 12px rgba(15, 23, 42, 0.1)',
        }}
      >
        {capturedPhoto ? (
          <img
            src={capturedPhoto}
            alt="Captured Card"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: isCameraActive ? 'block' : 'none',
            }}
          />
        )}

        {/* 4 Góc Nhắm Căn Cước Chuẩn (Corner Markers) */}
        {!capturedPhoto && (
          <>
            <div style={{ position: 'absolute', top: 8, left: 8, width: 20, height: 20, borderTop: '3px solid #2DD4BF', borderLeft: '3px solid #2DD4BF', borderTopLeftRadius: 4, zIndex: 2, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderTop: '3px solid #2DD4BF', borderRight: '3px solid #2DD4BF', borderTopRightRadius: 4, zIndex: 2, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: 8, left: 8, width: 20, height: 20, borderBottom: '3px solid #2DD4BF', borderLeft: '3px solid #2DD4BF', borderBottomLeftRadius: 4, zIndex: 2, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: 8, right: 8, width: 20, height: 20, borderBottom: '3px solid #2DD4BF', borderRight: '3px solid #2DD4BF', borderBottomRightRadius: 4, zIndex: 2, pointerEvents: 'none' }} />
          </>
        )}

        {/* Khi không mở được camera trực tiếp: Hiện nút chạm để chụp ảnh */}
        {!isCameraActive && !capturedPhoto && !isCameraLoading && (
          <div
            onClick={onTakePhoto}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: onTakePhoto ? 'pointer' : 'default',
              background: 'rgba(15, 23, 42, 0.95)',
              color: '#FFFFFF',
              gap: 8,
              padding: 16,
              textAlign: 'center',
              zIndex: 3,
            }}
          >
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 10,
                background: '#009688',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                boxShadow: '0 4px 12px rgba(0, 150, 136, 0.4)',
              }}
            >
              📷
            </div>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#34D399' }}>
              Chạm để chụp ảnh CCCD (Mặt {mode === 'front' ? 'trước' : 'sau'})
            </span>
            <span style={{ fontSize: 11.5, color: '#94A3B8' }}>Mở ứng dụng Camera của điện thoại</span>
          </div>
        )}

        {/* Loading Spinner */}
        {isCameraLoading && !capturedPhoto && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(15, 23, 42, 0.8)',
              color: '#38BDF8',
              gap: 8,
              fontSize: 12,
              zIndex: 3,
            }}
          >
            <LoadingOutlined style={{ fontSize: 24 }} />
            <span>Đang mở camera...</span>
          </div>
        )}

        {/* Guide Overlays */}
        {!capturedPhoto && (
          <div
            style={{
              position: 'absolute',
              inset: 8,
              border: '1.5px dashed rgba(255, 255, 255, 0.45)',
              borderRadius: 6,
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '8px 10px',
              zIndex: 1,
            }}
          >
            {mode === 'front' ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: 11,
                      color: '#FFFFFF',
                      background: 'rgba(0,0,0,0.5)',
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    MẶT TRƯỚC CCCD
                  </span>
                  <ScanOutlined style={{ color: '#009688', fontSize: 18 }} />
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                  <div
                    style={{
                      width: 50,
                      height: 65,
                      border: '1.5px dashed rgba(255,255,255,0.7)',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(0,0,0,0.2)',
                    }}
                  >
                    <span style={{ fontSize: 9, color: '#CBD5E1' }}>Ảnh thẻ</span>
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ height: 2, background: 'rgba(255,255,255,0.3)', width: '80%' }} />
                    <div style={{ height: 2, background: 'rgba(255,255,255,0.3)', width: '60%' }} />
                    <div style={{ height: 2, background: 'rgba(255,255,255,0.3)', width: '90%' }} />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: 11,
                      color: '#FFFFFF',
                      background: 'rgba(0,0,0,0.5)',
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    MẶT SAU
                  </span>
                  <ScanOutlined style={{ color: '#009688', fontSize: 18 }} />
                </div>
                <div style={{ borderBottom: '2px dashed rgba(255,255,255,0.4)', paddingBottom: 4 }}>
                  <span
                    style={{
                      fontSize: 10.5,
                      color: '#E2E8F0',
                      background: 'rgba(0,0,0,0.5)',
                      padding: '2px 4px',
                      borderRadius: 2,
                    }}
                  >
                    DẢI MÃ MRZ
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Lỗi Camera nếu có */}
      {cameraError && (
        <div
          style={{
            width: '100%',
            maxWidth: 480,
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 12.5,
            color: '#DC2626',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <CloseCircleFilled style={{ color: '#DC2626', fontSize: 16 }} />
          <span>{cameraError.message}</span>
        </div>
      )}

      {/* Hiển thị kết quả kiểm tra hoặc lỗi sau khi chụp */}
      {capturedPhoto && validationResult && (
        validationResult.hasCard && validationResult.isValid && validationResult.extractedData ? (
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              background: '#F0FDFA',
              border: '1px solid #CCFBF1',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 12.5,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ fontWeight: 700, color: '#0F766E', marginBottom: 2 }}>
              ✓ {mode === 'front' ? 'Đã trích xuất OCR mặt trước:' : 'Đã giải mã QR Code & MRZ mặt sau:'}
            </div>
            {mode === 'front' ? (
              <>
                {validationResult.extractedData.idNumber && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Số CCCD:</span>
                    <strong style={{ color: '#009688' }}>{validationResult.extractedData.idNumber}</strong>
                  </div>
                )}
                {validationResult.extractedData.name && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Họ và tên:</span>
                    <strong style={{ color: '#1E293B' }}>{validationResult.extractedData.name}</strong>
                  </div>
                )}
                {validationResult.extractedData.birthDate && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Ngày sinh:</span>
                    <span>{validationResult.extractedData.birthDate}</span>
                  </div>
                )}
                {validationResult.extractedData.gender && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Giới tính:</span>
                    <span>{validationResult.extractedData.gender}</span>
                  </div>
                )}
                {validationResult.extractedData.residencePlace && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Nơi thường trú:</span>
                    <span>{validationResult.extractedData.residencePlace}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Ngày cấp:</span>
                  <strong>{validationResult.extractedData.issueDate}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Nơi cấp:</span>
                  <span>{validationResult.extractedData.issuePlace}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Dải mã MRZ:</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#009688' }}>
                    {validationResult.extractedData.mrzCode?.split('\n')[0]}
                  </span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 12.5,
              color: '#DC2626',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <CloseCircleFilled style={{ color: '#DC2626', fontSize: 16 }} />
            <span>{validationResult.message}</span>
          </div>
        )
      )}
    </div>
  );
};
