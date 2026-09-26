/**
 * useCamera Hook - Quản lý vòng đời camera trên React Component
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { CameraFacingMode, CameraError } from '../types/ekyc.types';
import { CameraService } from '../services/cameraService';

export function useCamera(defaultFacingMode: CameraFacingMode = 'user') {
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<CameraError | null>(null);
  const [facingMode, setFacingMode] = useState<CameraFacingMode>(defaultFacingMode);

  const [isRecording, setIsRecording] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<{ stop: () => Promise<string | null> } | null>(null);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!recorderRef.current) return null;
    try {
      const videoData = await recorderRef.current.stop();
      recorderRef.current = null;
      setIsRecording(false);
      return videoData;
    } catch {
      recorderRef.current = null;
      setIsRecording(false);
      return null;
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    if (recorderRef.current) {
      recorderRef.current.stop().catch(() => {});
    }
    recorderRef.current = CameraService.startVideoRecording(streamRef.current);
    setIsRecording(true);
  }, []);

  const stopCamera = useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.stop().catch(() => {});
      recorderRef.current = null;
      setIsRecording(false);
    }
    if (streamRef.current) {
      CameraService.stopStream(streamRef.current);
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
    setIsLoading(false);
  }, []);

  const startCamera = useCallback(
    async (mode?: CameraFacingMode, autoRecordVideo = false) => {
      const targetMode = mode || facingMode;

      // Nếu camera đã đang chạy với đúng facingMode thì giữ nguyên luồng, không ngắt mở lại
      if (streamRef.current && streamRef.current.active && targetMode === facingMode && videoRef.current?.srcObject) {
        if (autoRecordVideo && !recorderRef.current) {
          recorderRef.current = CameraService.startVideoRecording(streamRef.current);
          setIsRecording(true);
        }
        setIsActive(true);
        setIsLoading(false);
        return true;
      }

      setFacingMode(targetMode);
      setIsLoading(true);
      setError(null);

      // Dừng camera cũ nếu đang chạy
      if (recorderRef.current) {
        recorderRef.current.stop().catch(() => {});
        recorderRef.current = null;
        setIsRecording(false);
      }
      if (streamRef.current) {
        CameraService.stopStream(streamRef.current);
        streamRef.current = null;
      }

      const { stream, error: camErr } = await CameraService.openCamera(targetMode);

      if (camErr || !stream) {
        setError(camErr || { code: 'UNKNOWN', message: 'Không thể mở camera' });
        setIsActive(false);
        setIsLoading(false);
        return false;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (e) {
          console.warn('Video play interrupted:', e);
        }
      }

      if (autoRecordVideo) {
        recorderRef.current = CameraService.startVideoRecording(stream);
        setIsRecording(true);
      }

      setIsActive(true);
      setIsLoading(false);
      return true;
    },
    [facingMode]
  );

  const captureFrame = useCallback(
    (width?: number, height?: number): string | null => {
      if (!videoRef.current) return null;
      return CameraService.captureFrame(videoRef.current, width, height);
    },
    []
  );

  // Tự động giải phóng camera khi component unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    streamRef,
    isActive,
    isLoading,
    isRecording,
    error,
    facingMode,
    startCamera,
    stopCamera,
    startRecording,
    stopRecording,
    captureFrame,
  };
}
