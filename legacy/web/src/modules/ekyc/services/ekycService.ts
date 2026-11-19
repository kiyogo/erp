/**
 * eKYC Service - Điều phối xác thực và so khớp sinh trắc học
 */

import { BiometricMatchResult } from '../types/ekyc.types';

type FaceApi = typeof import('@vladmandic/face-api');

const MODEL_URL = '/models/face-api';
/** Ngưỡng khoảng cách vector đặc trưng; mặc định của face-api là 0,6, ở đây dùng 0,5 để chặt hơn. */
export const FACE_MATCH_DISTANCE_THRESHOLD = 0.5;

let faceApiPromise: Promise<FaceApi> | null = null;

const loadFaceApi = (): Promise<FaceApi> => {
  if (!faceApiPromise) {
    faceApiPromise = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      await (faceapi.tf as unknown as { ready: () => Promise<void> }).ready();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      return faceapi;
    })().catch((error) => { faceApiPromise = null; throw error; });
  }
  return faceApiPromise;
};

const loadImage = (source: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Không đọc được ảnh để so khớp khuôn mặt.'));
  image.src = source;
});

const referenceCode = (): string => {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return `EKYC-${Date.now().toString(36).toUpperCase()}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

const failure = (reason: string): BiometricMatchResult => ({
  matchScore: 0, isMatch: false, certId: '', verifiedAt: new Date().toISOString(), confidenceGrade: 'C', reason,
});

export class EkycService {
  /**
   * So khớp sinh trắc học giữa ảnh chân dung camera và ảnh thẻ CCCD bằng vector đặc trưng khuôn mặt
   * (mạng nhận diện khuôn mặt của face-api), không dùng so sánh điểm ảnh.
   */
  static async matchFaces(livePhotoBase64: string, cardAvatarBase64?: string): Promise<BiometricMatchResult> {
    if (!cardAvatarBase64) return failure('Chưa có ảnh chân dung trên thẻ để đối chiếu.');
    try {
      const faceapi = await loadFaceApi();
      const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 });
      const describe = async (source: string) => faceapi.detectSingleFace(await loadImage(source), options).withFaceLandmarks().withFaceDescriptor();
      const [live, card] = [await describe(livePhotoBase64), await describe(cardAvatarBase64)];
      if (!live) return failure('Không phát hiện khuôn mặt trong ảnh chụp trực tiếp.');
      if (!card) return failure('Không phát hiện khuôn mặt trên ảnh chân dung của thẻ.');
      const distance = Number(faceapi.euclideanDistance(live.descriptor, card.descriptor).toFixed(3));
      const isMatch = distance <= FACE_MATCH_DISTANCE_THRESHOLD;
      return {
        matchScore: Number((Math.max(0, 1 - distance) * 100).toFixed(1)),
        isMatch,
        certId: isMatch ? referenceCode() : '',
        verifiedAt: new Date().toISOString(),
        confidenceGrade: distance < 0.35 ? 'A+' : distance < 0.45 ? 'A' : distance <= FACE_MATCH_DISTANCE_THRESHOLD ? 'B' : 'C',
        distance,
        reason: isMatch ? undefined : 'Khuôn mặt chụp trực tiếp không khớp với ảnh trên thẻ.',
      };
    } catch (error: any) {
      return failure(error?.message || 'Không chạy được mô hình so khớp khuôn mặt.');
    }
  }

  /**
   * Sinh mã token ngẫu nhiên độ dài n bytes (mặc định 128 bytes = 256 ký tự hex)
   */
  static generateToken(bytesCount = 128): string {
    const array = new Uint8Array(bytesCount);
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(array);
    } else {
      for (let i = 0; i < bytesCount; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Kiểm tra thiết bị hiện tại có phải điện thoại / thiết bị di động hay không:
   * - Trên máy tính PC (kể cả khi mở F12, chia đôi màn hình hoặc thu nhỏ cửa sổ): Vẫn nhận diện là Máy tính (hiện mã QR).
   * - Khi trên điện thoại thật hoặc khi bật F12 chọn giả lập thiết bị di động (iPhone / Pixel / Galaxy / iPad): Nhận diện là Mobile.
   */
  static isMobileDevice(): boolean {
    if (typeof window === 'undefined') return false;

    // 1. Kiểm tra User Agent (Điện thoại thật hoặc F12 giả lập thiết bị di động)
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(ua);
    if (isMobileUA) {
      return true;
    }

    // 2. Nếu là máy tính thông thường (Windows NT, Macintosh, Desktop Linux)
    // Kể cả khi mở F12 hoặc thu nhỏ cửa sổ, vẫn giữ nguyên chế độ Máy tính.
    return false;
  }
}

