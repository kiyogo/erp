/**
 * Camera Service - Quản lý camera phần cứng trên trình duyệt
 */

import { CameraFacingMode, CameraError } from '../types/ekyc.types';

export class CameraService {
  /**
   * Khởi chạy camera stream
   */
  static async openCamera(
    facingMode: CameraFacingMode = 'user',
    width = 1280,
    height = 720
  ): Promise<{ stream: MediaStream | null; error: CameraError | null }> {
    // 1. Polyfill mediaDevices nếu thiếu trên một số WebView/trình duyệt cũ
    if (typeof navigator !== 'undefined' && !navigator.mediaDevices) {
      (navigator as any).mediaDevices = {};
    }

    if (typeof navigator !== 'undefined' && !navigator.mediaDevices.getUserMedia) {
      const legacyGetUserMedia =
        (navigator as any).getUserMedia ||
        (navigator as any).webkitGetUserMedia ||
        (navigator as any).mozGetUserMedia ||
        (navigator as any).msGetUserMedia;

      if (legacyGetUserMedia) {
        navigator.mediaDevices.getUserMedia = function (constraints) {
          return new Promise((resolve, reject) => {
            legacyGetUserMedia.call(navigator, constraints, resolve, reject);
          });
        };
      }
    }

    // 2. Kiểm tra nếu trình duyệt không hỗ trợ getUserMedia (do HTTP hoặc WebView)
    if (!navigator?.mediaDevices?.getUserMedia) {
      const isHttpNetwork =
        typeof window !== 'undefined' &&
        window.location.protocol === 'http:' &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1';

      return {
        stream: null,
        error: {
          code: 'UNSUPPORTED',
          message: isHttpNetwork
            ? 'Trình duyệt yêu cầu kết nối HTTPS (hoặc localhost) để mở Camera trực tiếp. Vui lòng bấm nút "Tải ảnh lên / Chụp ảnh" bên dưới để sử dụng máy ảnh của điện thoại.'
            : 'Trình duyệt của bạn đang chặn mở camera trực tiếp. Vui lòng sử dụng tính năng chụp/tải ảnh bên dưới.',
        },
      };
    }

    // 3. Khởi tạo stream với các cấp độ constraint linh hoạt (chống lỗi Overconstrained trên mobile)
    const tryStream = async (c: MediaStreamConstraints) => {
      return await navigator.mediaDevices.getUserMedia(c);
    };

    let stream: MediaStream | null = null;
    let lastErr: any = null;

    // Lần 1: Thử với ideal facingMode và resolution
    try {
      stream = await tryStream({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: width },
          height: { ideal: height },
        },
        audio: false,
      });
    } catch (err1) {
      lastErr = err1;
      // Lần 2: Thử với facingMode đơn giản
      try {
        stream = await tryStream({
          video: {
            facingMode: facingMode,
          },
          audio: false,
        });
      } catch (err2) {
        lastErr = err2;
        // Lần 3: Thử với video mặc định bất kỳ
        try {
          stream = await tryStream({
            video: true,
            audio: false,
          });
        } catch (err3) {
          lastErr = err3;
        }
      }
    }

    if (stream) {
      return { stream, error: null };
    }

    // Xử lý thông báo lỗi chi tiết
    const err = lastErr || {};
    let code: CameraError['code'] = 'UNKNOWN';
    let message = 'Không thể kết nối đến camera thiết bị.';

    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      code = 'PERMISSION_DENIED';
      message = 'Quyền truy cập camera bị từ chối. Vui lòng nhấn Cho phép (Allow) quyền camera trên trình duyệt.';
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      code = 'NOT_FOUND';
      message = 'Không tìm thấy camera trên thiết bị của bạn. Vui lòng sử dụng nút chụp/tải ảnh.';
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      code = 'NOT_READABLE';
      message = 'Camera đang bị ứng dụng khác chiếm dụng. Vui lòng đóng bớt ứng dụng và thử lại.';
    } else if (err.name === 'OverconstrainedError') {
      code = 'OVERCONSTRAINED';
      message = 'Độ phân giải camera không phù hợp. Vui lòng sử dụng nút chụp/tải ảnh bên dưới.';
    }

    return {
      stream: null,
      error: {
        code,
        message,
        originalError: err,
      },
    };
  }

  /**
   * Tắt toàn bộ track camera
   */
  static stopStream(stream: MediaStream | null) {
    if (!stream) return;
    try {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
    } catch (e) {
      console.warn('Lỗi khi dừng track camera:', e);
    }
  }

  /**
   * Chụp khung hình từ video element với tỉ lệ chuẩn, không bị méo/kéo dãn hình ảnh
   */
  static captureFrame(video: HTMLVideoElement, targetWidth?: number, targetHeight?: number): string | null {
    if (!video || video.readyState < 2) return null;

    try {
      const vWidth = video.videoWidth || 640;
      const vHeight = video.videoHeight || 480;

      const width = targetWidth || vWidth;
      const height = targetHeight || vHeight;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Cắt ảnh theo tỉ lệ mục tiêu (Center Crop) để tránh bị kéo dài mặt (stretching)
      const targetAspect = width / height;
      const videoAspect = vWidth / vHeight;

      let sx = 0;
      let sy = 0;
      let sWidth = vWidth;
      let sHeight = vHeight;

      if (videoAspect > targetAspect) {
        // Video có tỉ lệ rộng hơn khung mục tiêu -> cắt 2 bên
        sWidth = vHeight * targetAspect;
        sx = (vWidth - sWidth) / 2;
      } else if (videoAspect < targetAspect) {
        // Video có tỉ lệ cao hơn khung mục tiêu -> cắt trên dưới
        sHeight = vWidth / targetAspect;
        sy = (vHeight - sHeight) / 2;
      }

      ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', 0.95);
    } catch (err) {
      console.error('Lỗi khi chụp khung hình:', err);
      return null;
    }
  }

  /**
   * Tự động quay video sinh trắc học realtime từ MediaStream
   */
  static startVideoRecording(stream: MediaStream): { stop: () => Promise<string | null> } {
    if (typeof MediaRecorder === 'undefined' || !stream) {
      return { stop: async () => null };
    }

    try {
      const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
      let selectedMime = '';
      for (const m of mimeTypes) {
        if (MediaRecorder.isTypeSupported(m)) {
          selectedMime = m;
          break;
        }
      }

      const options: MediaRecorderOptions = selectedMime ? { mimeType: selectedMime } : {};
      const recorder = new MediaRecorder(stream, options);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.start(100);

      const stop = (): Promise<string | null> => {
        return new Promise((resolve) => {
          if (recorder.state === 'inactive') {
            resolve(null);
            return;
          }

          recorder.onstop = () => {
            try {
              const blob = new Blob(chunks, { type: selectedMime || 'video/webm' });
              const reader = new FileReader();
              reader.onloadend = () => {
                resolve(reader.result as string);
              };
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(blob);
            } catch {
              resolve(null);
            }
          };

          try {
            recorder.stop();
          } catch {
            resolve(null);
          }
        });
      };

      return { stop };
    } catch (e) {
      console.warn('Lỗi khởi động MediaRecorder:', e);
      return { stop: async () => null };
    }
  }

  /**
   * Tính toán độ sáng trung bình của canvas/video (0 - 255)
   */
  static calculateBrightness(ctx: CanvasRenderingContext2D, width: number, height: number): number {
    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;
      let total = 0;
      const len = data.length;
      for (let i = 0; i < len; i += 4) {
        total += (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      return total / (len / 4);
    } catch {
      return 128;
    }
  }

  /**
   * Tính độ sắc nét (Laplacian variance) để kiểm tra ảnh mờ
   */
  static calculateSharpness(ctx: CanvasRenderingContext2D, width: number, height: number): number {
    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;
      let sum = 0;
      let sumSq = 0;
      let count = 0;

      for (let y = 1; y < height - 1; y += 2) {
        for (let x = 1; x < width - 1; x += 2) {
          const idx = (y * width + x) * 4;
          const center = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          const top = (data[((y - 1) * width + x) * 4] + data[((y - 1) * width + x) * 4 + 1] + data[((y - 1) * width + x) * 4 + 2]) / 3;
          const bottom = (data[((y + 1) * width + x) * 4] + data[((y + 1) * width + x) * 4 + 1] + data[((y + 1) * width + x) * 4 + 2]) / 3;
          const left = (data[(y * width + (x - 1)) * 4] + data[(y * width + (x - 1)) * 4 + 1] + data[(y * width + (x - 1)) * 4 + 2]) / 3;
          const right = (data[(y * width + (x + 1)) * 4] + data[(y * width + (x + 1)) * 4 + 1] + data[(y * width + (x + 1)) * 4 + 2]) / 3;

          const laplacian = 4 * center - top - bottom - left - right;
          sum += laplacian;
          sumSq += laplacian * laplacian;
          count++;
        }
      }

      if (count === 0) return 100;
      const mean = sum / count;
      const variance = sumSq / count - mean * mean;
      return Math.min(100, Math.max(0, variance / 5));
    } catch {
      return 85;
    }
  }
}
