/**
 * eKYC Module - Kiểu dữ liệu & Giao diện chuẩn
 */

export type EkycStep = 1 | 2 | 3 | 4 | 5;
// 1: Chuẩn bị
// 2: Khuôn mặt
// 3: CCCD trước
// 4: CCCD sau
// 5: Xác nhận

export type CameraFacingMode = 'user' | 'environment';

export type CameraErrorCode =
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'NOT_READABLE'
  | 'OVERCONSTRAINED'
  | 'UNSUPPORTED'
  | 'UNKNOWN';

export interface CameraError {
  code: CameraErrorCode;
  message: string;
  originalError?: any;
}

export type FaceValidationErrorCode =
  | 'NO_FACE'
  | 'MULTIPLE_FACES'
  | 'OUT_OF_FRAME'
  | 'TOO_SMALL'
  | 'TOO_CLOSE'
  | 'INVALID_ORIENTATION'
  | 'LOW_LIGHT'
  | 'GLARE'
  | 'BLURRY';

export type LivenessActionStage =
  | 'LOOK_STRAIGHT'
  | 'TURN_RIGHT'
  | 'TURN_LEFT'
  | 'LOOK_UP'
  | 'COMPLETED';

export interface FaceValidationResult {
  hasFace: boolean;
  faceCount: number;
  faceValid: boolean;
  score: number; // 0 - 100
  errorCode?: FaceValidationErrorCode;
  message: string;
  faceBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  landmarks?: number[][];
  rollAngle?: number;
  yawAngle?: number;
  yawOffset?: number;
  pitchAngle?: number;
  pitchRatio?: number;
  brightness?: number;
}

export interface CardValidationResult {
  hasCard: boolean;
  isValid: boolean;
  score: number;
  sharpnessScore: number;
  brightnessScore: number;
  message: string;
  errorCode?: string;
  extractedData?: Partial<EkycExtractedData>;
  rawQr?: string;
  rawOcrText?: string;
}

export interface EkycExtractedData {
  idNumber: string;
  oldIdNumber?: string;
  name: string;
  birthDate: string; // YYYY-MM-DD
  gender: string; // Nam / Nữ
  nationality: string;
  originPlace: string;
  residencePlace: string;
  issueDate: string;
  issuePlace: string;
  expiryDate: string;
  mrzCode?: string;
  qrRaw?: string;
  faceMatchScore?: number;
  livePhotoUrl?: string;
  liveVideoUrl?: string;
  cardFrontUrl?: string;
  cardBackUrl?: string;
  cardAvatarUrl?: string;
  verifiedAt?: string;
  certificateId?: string;
  rawOcrText?: string;
  ekycVerified?: boolean;
}

export interface LivenessResult {
  isLive: boolean;
  score: number;
  confidence: number;
  method: 'PASSIVE_TEXTURE' | 'ACTIVE_CHALLENGE' | 'BLAZEFACE_HEURISTIC' | 'LOCAL_MODEL';
  details?: string;
}

export interface BiometricMatchResult {
  matchScore: number;
  isMatch: boolean;
  certId: string;
  verifiedAt: string;
  confidenceGrade: 'A+' | 'A' | 'B' | 'C';
}
