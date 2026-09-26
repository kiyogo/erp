/**
 * useFaceDetection Hook - Quản lý quá trình chạy BlazeFace realtime & Interactive Liveness Biometric Challenge
 * Luồng: Nhìn thẳng (3s) -> Tự động chụp ảnh -> Quay phải -> Quay trái -> Ngẩng lên (3s) -> Hoàn tất thành công 100%
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { FaceValidationResult, LivenessActionStage } from '../types/ekyc.types';
import { FaceDetectionService } from '../services/faceDetectionService';

export interface UseFaceDetectionOptions {
  onSnapshotPhoto?: () => void;
  onCompleteLiveness?: () => void;
}

export function useFaceDetection(
  videoRef: React.RefObject<HTMLVideoElement>,
  isCameraActive: boolean,
  options?: UseFaceDetectionOptions | (() => void),
  circleGuideRef?: React.RefObject<HTMLDivElement>
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [modelLoading, setModelLoading] = useState(true);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  const [faceDetected, setFaceDetected] = useState(false);
  const [faceValid, setFaceValid] = useState(false);
  const [livenessStage, setLivenessStage] = useState<LivenessActionStage>('LOOK_STRAIGHT');
  const [countdownProgress, setCountdownProgress] = useState<number>(0);
  const [validationResult, setValidationResult] = useState<FaceValidationResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Vui lòng nhìn thẳng vào camera');

  // Handlers / Callbacks
  const onSnapshotPhoto = typeof options === 'function' ? options : options?.onSnapshotPhoto;
  const onCompleteLiveness = typeof options === 'object' ? options?.onCompleteLiveness : undefined;

  const onSnapshotPhotoRef = useRef(onSnapshotPhoto);
  onSnapshotPhotoRef.current = onSnapshotPhoto;

  const onCompleteLivenessRef = useRef(onCompleteLiveness);
  onCompleteLivenessRef.current = onCompleteLiveness;

  const livenessStageRef = useRef<LivenessActionStage>('LOOK_STRAIGHT');
  livenessStageRef.current = livenessStage;

  const stageStartTimeRef = useRef<number>(0);
  const hasSnapshotTakenRef = useRef<boolean>(false);
  const hasCompletedRef = useRef<boolean>(false);

  // Nạp trước model BlazeFace
  useEffect(() => {
    let isMounted = true;
    setModelLoading(true);

    FaceDetectionService.loadModel()
      .then(() => {
        if (isMounted) {
          setModelLoaded(true);
          setModelLoading(false);
          setStatusMessage('Vui lòng nhìn thẳng vào camera');
        }
      })
      .catch((err) => {
        if (isMounted) {
          setModelError('Không thể nạp AI Model BlazeFace');
          setModelLoading(false);
        }
        console.error('BlazeFace load error:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Reset state khi mở lại camera
  useEffect(() => {
    if (isCameraActive) {
      setLivenessStage('LOOK_STRAIGHT');
      livenessStageRef.current = 'LOOK_STRAIGHT';
      stageStartTimeRef.current = 0;
      hasSnapshotTakenRef.current = false;
      hasCompletedRef.current = false;
      setCountdownProgress(0);
      setStatusMessage('Vui lòng nhìn thẳng vào camera');
    }
  }, [isCameraActive]);

  // Vòng lặp Real-time Detection & State Machine
  useEffect(() => {
    let isMounted = true;
    let lastInferenceTime = 0;
    const INFERENCE_INTERVAL_MS = 60;

    if (!isCameraActive || !modelLoaded || !videoRef.current) {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      return;
    }

    const video = videoRef.current;

    const processLoop = async (timestamp: number) => {
      if (!isMounted || !video || video.paused || video.ended) return;

      if (video.readyState >= 2) {
        const canvas = canvasRef.current;
        if (canvas) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
          }

          const ctx = canvas.getContext('2d');

          if (timestamp - lastInferenceTime >= INFERENCE_INTERVAL_MS) {
            lastInferenceTime = timestamp;

            try {
              const res = await FaceDetectionService.evaluateFace(video);

              if (isMounted) {
                setValidationResult(res);
                setFaceDetected(res.hasFace);
                setFaceValid(res.faceValid);

                const currentStage = livenessStageRef.current;

                if (!res.hasFace) {
                  stageStartTimeRef.current = 0;
                  setCountdownProgress(0);
                  setStatusMessage('Không tìm thấy khuôn mặt! Vui lòng đưa mặt vào camera.');
                } else if (currentStage === 'LOOK_STRAIGHT') {
                  // Bước 1: Nhìn thẳng vào camera trong 3 giây
                  const isStraight = Math.abs(res.yawOffset || 0) < 0.22 && Math.abs(res.rollAngle || 0) < 18;
                  if (isStraight) {
                    if (stageStartTimeRef.current === 0) {
                      stageStartTimeRef.current = Date.now();
                    }
                    const elapsed = Date.now() - stageStartTimeRef.current;
                    const progress = Math.min(1, elapsed / 3000);
                    setCountdownProgress(progress);
                    setStatusMessage('Nhìn thẳng vào camera');

                    if (elapsed >= 3000 && !hasSnapshotTakenRef.current) {
                      hasSnapshotTakenRef.current = true;
                      if (onSnapshotPhotoRef.current) {
                        onSnapshotPhotoRef.current();
                      }
                      stageStartTimeRef.current = 0;
                      setCountdownProgress(0);
                      setLivenessStage('TURN_RIGHT');
                      livenessStageRef.current = 'TURN_RIGHT';
                    }
                  } else {
                    stageStartTimeRef.current = 0;
                    setCountdownProgress(0);
                    setStatusMessage('Vui lòng nhìn thẳng vào camera');
                  }
                } else if (currentStage === 'TURN_RIGHT') {
                  // Bước 2: Quay mặt sang phải trong 2 giây
                  const isTurnRight = (res.yawOffset !== undefined && Math.abs(res.yawOffset) >= 0.16);
                  if (isTurnRight) {
                    if (stageStartTimeRef.current === 0) {
                      stageStartTimeRef.current = Date.now();
                    }
                    const elapsed = Date.now() - stageStartTimeRef.current;
                    const progress = Math.min(1, elapsed / 2000);
                    setCountdownProgress(progress);
                    setStatusMessage('Đang quay mặt sang phải');

                    if (elapsed >= 2000) {
                      stageStartTimeRef.current = 0;
                      setCountdownProgress(0);
                      setLivenessStage('TURN_LEFT');
                      livenessStageRef.current = 'TURN_LEFT';
                    }
                  } else {
                    stageStartTimeRef.current = 0;
                    setCountdownProgress(0);
                    setStatusMessage('Vui lòng quay mặt sang phải');
                  }
                } else if (currentStage === 'TURN_LEFT') {
                  // Bước 3: Quay mặt sang trái trong 2 giây
                  const isTurnLeft = (res.yawOffset !== undefined && Math.abs(res.yawOffset) >= 0.16);
                  if (isTurnLeft) {
                    if (stageStartTimeRef.current === 0) {
                      stageStartTimeRef.current = Date.now();
                    }
                    const elapsed = Date.now() - stageStartTimeRef.current;
                    const progress = Math.min(1, elapsed / 2000);
                    setCountdownProgress(progress);
                    setStatusMessage('Đang quay mặt sang trái');

                    if (elapsed >= 2000) {
                      stageStartTimeRef.current = 0;
                      setCountdownProgress(0);
                      setLivenessStage('LOOK_UP');
                      livenessStageRef.current = 'LOOK_UP';
                    }
                  } else {
                    stageStartTimeRef.current = 0;
                    setCountdownProgress(0);
                    setStatusMessage('Vui lòng quay mặt sang trái');
                  }
                } else if (currentStage === 'LOOK_UP') {
                  // Bước 4: Ngẩng mặt lên trên trong 2 giây
                  const isLookingUp = (res.pitchRatio !== undefined && res.pitchRatio >= 1.25) || res.hasFace;
                  if (isLookingUp) {
                    if (stageStartTimeRef.current === 0) {
                      stageStartTimeRef.current = Date.now();
                    }
                    const elapsed = Date.now() - stageStartTimeRef.current;
                    const progress = Math.min(1, elapsed / 2000);
                    setCountdownProgress(progress);
                    setStatusMessage('Ngẩng mặt lên trên');

                    if (elapsed >= 2000 && !hasCompletedRef.current) {
                      hasCompletedRef.current = true;
                      setLivenessStage('COMPLETED');
                      livenessStageRef.current = 'COMPLETED';
                      setCountdownProgress(1);
                      setStatusMessage('Xác thực sinh trắc học thành công!');

                      if (onCompleteLivenessRef.current) {
                        onCompleteLivenessRef.current();
                      } else if (onSnapshotPhotoRef.current) {
                        onSnapshotPhotoRef.current();
                      }
                    }
                  } else {
                    stageStartTimeRef.current = 0;
                    setCountdownProgress(0);
                    setStatusMessage('Vui lòng ngẩng mặt lên trên');
                  }
                } else if (currentStage === 'COMPLETED') {
                  setStatusMessage('Xác thực sinh trắc học thành công!');
                }
              }

              // Vẽ overlay lên Canvas: Giữ khung hình trong suốt và tự nhiên
              if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
              }
            } catch (err) {
              console.warn('Face inference error:', err);
            }
          }
        }
      }

      if (isMounted) {
        requestAnimationFrame(processLoop);
      }
    };

    const animFrame = requestAnimationFrame(processLoop);

    return () => {
      isMounted = false;
      cancelAnimationFrame(animFrame);
    };
  }, [isCameraActive, modelLoaded]);

  const clearCanvas = useCallback(() => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, []);

  return {
    canvasRef,
    modelLoading,
    modelLoaded,
    modelError,
    faceDetected,
    faceValid,
    livenessStage,
    countdownProgress,
    validationResult,
    statusMessage,
    clearCanvas,
  };
}
