/**
 * FaceScanningViewfinder - Khung ngắm quét khuôn mặt AI BlazeFace với Thử thách Liveness 4 bước
 */

import React from 'react';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  CameraOutlined,
} from '@ant-design/icons';
import { FaceValidationResult, CameraError, LivenessActionStage } from '../types/ekyc.types';

interface FaceScanningViewfinderProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  capturedPhoto: string | null;
  isCameraActive: boolean;
  isCameraLoading: boolean;
  isRecording?: boolean;
  hasRecordedVideo?: boolean;
  livenessStage?: LivenessActionStage;
  countdownProgress?: number;
  cameraError: CameraError | null;
  faceValid: boolean;
  validationResult: FaceValidationResult | null;
  statusMessage: string;
  onTakePhoto?: () => void;
}

export const FaceScanningViewfinder: React.FC<FaceScanningViewfinderProps> = ({
  videoRef,
  canvasRef,
  capturedPhoto,
  isCameraActive,
  isCameraLoading,
  livenessStage = 'LOOK_STRAIGHT',
  countdownProgress = 0,
  cameraError,
  faceValid,
  statusMessage,
  onTakePhoto,
}) => {
  // Biểu tượng & mô tả từng bước Liveness
  const getStageInfo = () => {
    switch (livenessStage) {
      case 'LOOK_STRAIGHT':
        return {
          stepNum: 1,
          icon: '👀',
          title: 'Nhìn thẳng vào camera',
          color: '#2DD4BF',
        };
      case 'TURN_RIGHT':
        return {
          stepNum: 2,
          icon: '👉',
          title: 'Vui lòng quay mặt sang phải',
          color: '#38BDF8',
        };
      case 'TURN_LEFT':
        return {
          stepNum: 3,
          icon: '👈',
          title: 'Vui lòng quay mặt sang trái',
          color: '#818CF8',
        };
      case 'LOOK_UP':
        return {
          stepNum: 4,
          icon: '👆',
          title: 'Vui lòng ngẩng mặt lên trên',
          color: '#F59E0B',
        };
      case 'COMPLETED':
        return {
          stepNum: 4,
          icon: '🎉',
          title: 'Xác thực sinh trắc học thành công!',
          color: '#10B981',
        };
      default:
        return {
          stepNum: 1,
          icon: '👀',
          title: 'Nhìn thẳng vào camera',
          color: '#2DD4BF',
        };
    }
  };

  const stageInfo = getStageInfo();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        width: '100%',
      }}
    >
      {/* Khung Camera tỉ lệ 9:16 đồng bộ bo góc & màu sắc với hệ thống Web */}
      <div
        style={{
          width: '100%',
          maxWidth: 330,
          aspectRatio: '9 / 16',
          maxHeight: 'min(65vh, 540px)',
          borderRadius: 12,
          border: '1.2px solid #009688',
          background: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: 'none',
        }}
      >
        {capturedPhoto && livenessStage === 'COMPLETED' ? (
          <img
            src={capturedPhoto}
            alt="Captured Face"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <>
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
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                pointerEvents: 'none',
              }}
            />
          </>
        )}

        {/* Hướng dẫn hành động realtime hiển thị phía trên camera đồng bộ giao diện Web */}
        {isCameraActive && livenessStage !== 'COMPLETED' && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 14,
              right: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255, 255, 255, 0.95)',
              padding: '7px 14px',
              borderRadius: 20,
              border: '1px solid #009688',
              zIndex: 3,
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)',
              boxSizing: 'border-box',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', textAlign: 'center' }}>
              {stageInfo.title}
            </span>
          </div>
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
              zIndex: 2,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
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
            <span style={{ fontSize: 13, fontWeight: 700, color: '#34D399' }}>Chạm để chụp / tải ảnh</span>
            <span style={{ fontSize: 11, color: '#94A3B8' }}>Dùng Camera gốc điện thoại</span>
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
            }}
          >
            <LoadingOutlined style={{ fontSize: 24 }} />
            <span>Đang mở camera...</span>
          </div>
        )}
      </div>

      {/* Lỗi Camera nếu có */}
      {cameraError && (
        <div
          style={{
            width: '100%',
            maxWidth: 330,
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 12.5,
            color: '#DC2626',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CloseCircleFilled style={{ color: '#DC2626', fontSize: 16, flexShrink: 0 }} />
            <span>{cameraError.message}</span>
          </div>
          {onTakePhoto && (
            <button
              onClick={onTakePhoto}
              style={{
                marginTop: 2,
                background: '#009688',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 6,
                padding: '7px 12px',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <span>📷 Chọn ảnh hoặc chụp bằng Camera thiết bị</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
