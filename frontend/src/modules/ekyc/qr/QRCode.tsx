/**
 * QRCode.tsx — React component sinh QR code thuần TypeScript (không thư viện bên ngoài)
 * Sử dụng: <QRCode value="https://..." size={256} ecLevel="M" />
 */
import React, { useRef, useEffect, useMemo } from "react";
import { encodeQR } from "./QREncoder";
import type { ECLevel } from "./QREncoder";
import { QRMatrix } from "./QRMatrix";
import { applyBestMask } from "./QRMask";
import { renderToCanvas } from "./QRCanvas";

export interface QRCodeProps {
  /** Nội dung cần mã hóa (URL, text, ...) */
  value: string;
  /** Kích thước pixel (default: 240) */
  size?: number;
  /** Error correction level: L / M / Q / H (default: M) */
  ecLevel?: ECLevel;
  /** Vùng đệm lề module trắng quanh QR (default: 1 để mã QR to tràn khung) */
  quietZone?: number;
  /** Màu module tối (default: #111827) */
  foreground?: string;
  /** Màu nền (default: #ffffff) */
  background?: string;
  /** URL logo hiển thị ở giữa (tùy chọn) */
  logo?: string;
  /** Tỉ lệ logo so với size (default: 0.2) */
  logoSizeRatio?: number;
  /** CSS class cho thẻ canvas */
  className?: string;
  /** CSS style cho thẻ canvas */
  style?: React.CSSProperties;
}

export const QRCode: React.FC<QRCodeProps> = ({
  value,
  size = 240,
  ecLevel = "M",
  quietZone = 1,
  foreground = "#111827",
  background = "#ffffff",
  logo,
  logoSizeRatio = 0.2,
  className,
  style,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Sinh ma trận QR (memoized — tái tính khi value/ecLevel thay đổi)
  const matrix = useMemo<number[][] | null>(() => {
    try {
      // 1. Encode text → codewords
      const encoded = encodeQR(value, ecLevel);

      // 2. Xây dựng ma trận modules
      const qr = new QRMatrix(encoded.version);
      qr.init();
      qr.placeData(encoded.data);

      // 3. Áp dụng mask tốt nhất + format info
      const { masked } = applyBestMask(qr, ecLevel);

      return masked.toArray();
    } catch (err) {
      console.error("[QRCode] Lỗi sinh mã QR:", err);
      return null;
    }
  }, [value, ecLevel]);

  // Render canvas mỗi khi matrix hoặc options thay đổi
  useEffect(() => {
    if (!canvasRef.current || !matrix) return;
    renderToCanvas(matrix, canvasRef.current, {
      size,
      foreground,
      background,
      quietZone,
      logo,
      logoSizeRatio,
    });
  }, [matrix, size, foreground, background, quietZone, logo, logoSizeRatio]);


  if (!matrix) {
    // Hiển thị placeholder khi lỗi
    return (
      <div
        style={{ width: size, height: size, background, display: "flex", alignItems: "center", justifyContent: "center", ...style }}
        className={className}
      >
        <span style={{ color: "#9CA3AF", fontSize: 12 }}>QR lỗi</span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      style={{ display: "block", ...style }}
      aria-label={`QR Code: ${value}`}
    />
  );
};

export default QRCode;
