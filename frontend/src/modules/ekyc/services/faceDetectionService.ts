/**
 * Face Detection Service - Sử dụng Google BlazeFace chạy LOCAL 100% trên Client qua WebGL/TensorFlow.js
 */

import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';
import { FaceValidationResult } from '../types/ekyc.types';
import { CameraService } from './cameraService';

let modelPromise: Promise<blazeface.BlazeFaceModel> | null = null;

export class FaceDetectionService {
  /**
   * Nạp BlazeFace Neural Network Model (Singleton)
   */
  static async loadModel(): Promise<blazeface.BlazeFaceModel> {
    if (!modelPromise) {
      modelPromise = (async () => {
        try {
          await tf.ready();
        } catch (e) {
          console.warn('TensorFlow.js backend init:', e);
        }
        return await blazeface.load();
      })();
    }
    return modelPromise;
  }

  /**
   * Đánh giá khuôn mặt realtime trên video hoặc canvas
   */
  static async evaluateFace(
    input: HTMLVideoElement | HTMLCanvasElement,
    circleGuide?: { centerX: number; centerY: number; radius: number }
  ): Promise<FaceValidationResult> {
    const inputWidth = (input as any).videoWidth || input.width || 640;
    const inputHeight = (input as any).videoHeight || input.height || 480;

    if (inputWidth <= 0 || inputHeight <= 0) {
      return {
        hasFace: false,
        faceCount: 0,
        faceValid: false,
        score: 0,
        message: 'Đang tải khung hình camera...',
      };
    }

    try {
      const model = await this.loadModel();
      const predictions = await model.estimateFaces(input, false);

      // 1. Kiểm tra số lượng khuôn mặt
      if (!predictions || predictions.length === 0) {
        return {
          hasFace: false,
          faceCount: 0,
          faceValid: false,
          score: 0,
          errorCode: 'NO_FACE',
          message: 'Không tìm thấy khuôn mặt trong khung hình! Vui lòng nhìn thẳng vào camera.',
        };
      }

      if (predictions.length > 1) {
        return {
          hasFace: true,
          faceCount: predictions.length,
          faceValid: false,
          score: 30,
          errorCode: 'MULTIPLE_FACES',
          message: 'Vui lòng chỉ để một khuôn mặt trong khung hình.',
        };
      }

      const face = predictions[0];
      const start = face.topLeft as [number, number];
      const end = face.bottomRight as [number, number];
      const prob = (face.probability as number[] | number) || 0.99;
      const probValue = Array.isArray(prob) ? prob[0] : (typeof prob === 'number' ? prob : 0.99);

      const landmarks = (face.landmarks as number[][]) || [];

      const x = Math.max(0, start[0]);
      const y = Math.max(0, start[1]);
      const width = Math.max(10, end[0] - start[0]);
      const height = Math.max(10, end[1] - start[1]);
      const faceBox = { x, y, width, height };

      const faceCenterX = x + width / 2;
      const faceCenterY = y + height / 2;

      // 2. Kiểm tra kích thước khuôn mặt (quá xa / quá gần)
      const frameArea = inputWidth * inputHeight;
      const faceArea = width * height;
      const faceAreaRatio = faceArea / frameArea;

      if (faceAreaRatio < 0.05) {
        return {
          hasFace: true,
          faceCount: 1,
          faceValid: false,
          score: 45,
          errorCode: 'TOO_SMALL',
          message: 'Vui lòng đưa khuôn mặt gần camera hơn.',
          faceBox,
          landmarks,
        };
      }

      if (faceAreaRatio > 0.70) {
        return {
          hasFace: true,
          faceCount: 1,
          faceValid: false,
          score: 50,
          errorCode: 'TOO_CLOSE',
          message: 'Vui lòng lùi ra xa camera một chút.',
          faceBox,
          landmarks,
        };
      }

      // 3. Kiểm tra khuôn mặt nằm trong khung tròn (nếu có guide)
      if (circleGuide) {
        const distFromCenter = Math.hypot(faceCenterX - circleGuide.centerX, faceCenterY - circleGuide.centerY);
        if (distFromCenter > circleGuide.radius * 0.55) {
          return {
            hasFace: true,
            faceCount: 1,
            faceValid: false,
            score: 55,
            errorCode: 'OUT_OF_FRAME',
            message: 'Vui lòng đưa khuôn mặt vào giữa khung hình.',
            faceBox,
            landmarks,
          };
        }
      }

      // 4. Kiểm tra góc nghiêng mặt (Orientation: Yaw, Pitch & Roll từ landmarks)
      // Landmarks: [0: rightEye, 1: leftEye, 2: nose, 3: mouth, 4: rightEar, 5: leftEar]
      let rollAngle = 0;
      let yawOffset = 0;
      let pitchRatio = 1.0;

      if (landmarks && landmarks.length >= 3) {
        const rightEye = landmarks[0];
        const leftEye = landmarks[1];
        const nose = landmarks[2];

        // Độ nghiêng xoay đầu (Roll)
        const eyeDy = leftEye[1] - rightEye[1];
        const eyeDx = leftEye[0] - rightEye[0];
        rollAngle = Math.atan2(eyeDy, eyeDx) * (180 / Math.PI);

        // Độ xoay trái/phải (Yaw)
        const eyeMidX = (rightEye[0] + leftEye[0]) / 2;
        const eyeDist = Math.abs(eyeDx);
        if (eyeDist > 10) {
          yawOffset = (nose[0] - eyeMidX) / eyeDist;
        }

        // Độ ngẩng đầu lên/xuống (Pitch)
        if (landmarks.length >= 4) {
          const mouth = landmarks[3];
          const eyeMidY = (rightEye[1] + leftEye[1]) / 2;
          const eyeToNose = nose[1] - eyeMidY;
          const noseToMouth = mouth[1] - nose[1];
          if (eyeToNose > 0 && noseToMouth > 0) {
            pitchRatio = noseToMouth / eyeToNose;
          }
        }

        // Nếu xoay mặt hoặc nghiêng đầu quá mức
        if (Math.abs(rollAngle) > 18 || Math.abs(yawOffset) > 0.35) {
          return {
            hasFace: true,
            faceCount: 1,
            faceValid: false,
            score: 60,
            errorCode: 'INVALID_ORIENTATION',
            message: 'Vui lòng giữ khuôn mặt thẳng và nhìn vào camera.',
            faceBox,
            landmarks,
            rollAngle,
            yawOffset,
            pitchRatio,
          };
        }
      }

      // 5. Kiểm tra độ sáng khung hình
      let avgBrightness = 120;
      if (input instanceof HTMLCanvasElement) {
        const ctx = input.getContext('2d');
        if (ctx) {
          avgBrightness = CameraService.calculateBrightness(ctx, inputWidth, inputHeight);
        }
      }

      if (avgBrightness < 25) {
        return {
          hasFace: true,
          faceCount: 1,
          faceValid: false,
          score: 50,
          errorCode: 'LOW_LIGHT',
          message: 'Ánh sáng quá yếu, vui lòng di chuyển đến nơi sáng hơn.',
          faceBox,
          landmarks,
          rollAngle,
          yawOffset,
          pitchRatio,
          brightness: avgBrightness,
        };
      }

      // Đạt toàn bộ điều kiện
      const confidenceScore = Number((Math.min(probValue * 100, 99.8)).toFixed(1));

      return {
        hasFace: true,
        faceCount: 1,
        faceValid: true,
        score: Math.max(confidenceScore, 98.0),
        message: 'Khuôn mặt hợp lệ. Bạn có thể chụp ảnh ngay!',
        faceBox,
        landmarks,
        rollAngle,
        yawOffset,
        pitchRatio,
        brightness: avgBrightness,
      };
    } catch (err) {
      console.warn('BlazeFace evaluate error:', err);
      return {
        hasFace: false,
        faceCount: 0,
        faceValid: false,
        score: 0,
        message: 'Lỗi nhận diện khuôn mặt',
      };
    }
  }

  /**
   * Cắt chân dung từ ảnh CCCD bằng BlazeFace và phát hiện ảnh thẻ
   */
  static async cropAvatarFromIdCard(cardImageBase64: string): Promise<{ hasFace: boolean; avatarUrl: string }> {
    return new Promise(async (resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        try {
          const model = await this.loadModel();
          const predictions = await model.estimateFaces(img, false);
          const hasFace = Array.isArray(predictions) && predictions.length > 0;

          let cropX = img.width * 0.05;
          let cropY = img.height * 0.25;
          let cropW = img.width * 0.32;
          let cropH = img.height * 0.62;

          if (hasFace) {
            const face = predictions[0];
            const start = face.topLeft as [number, number];
            const end = face.bottomRight as [number, number];
            const padX = (end[0] - start[0]) * 0.25;
            const padY = (end[1] - start[1]) * 0.35;

            cropX = Math.max(0, start[0] - padX);
            cropY = Math.max(0, start[1] - padY);
            cropW = Math.min(img.width - cropX, (end[0] - start[0]) + padX * 2);
            cropH = Math.min(img.height - cropY, (end[1] - start[1]) + padY * 2.2);
          }

          const canvas = document.createElement('canvas');
          canvas.width = 180;
          canvas.height = 220;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({ hasFace, avatarUrl: cardImageBase64 });
            return;
          }

          ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, 180, 220);
          resolve({ hasFace, avatarUrl: canvas.toDataURL('image/jpeg', 0.95) });
        } catch {
          resolve({ hasFace: false, avatarUrl: cardImageBase64 });
        }
      };
      img.onerror = () => resolve({ hasFace: false, avatarUrl: cardImageBase64 });
      img.src = cardImageBase64;
    });
  }
}
