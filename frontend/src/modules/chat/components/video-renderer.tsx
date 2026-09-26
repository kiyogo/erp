'use client';

import React, { memo, useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Download } from 'lucide-react';
import { cn } from '../utils';
const API_URL = '';

// --- Helpers ---
function getVideoDim(url: string): { w: number; h: number } | null {
  try {
    const data = JSON.parse(localStorage.getItem('chat-video-dims') || '{}');
    return data[url] || null;
  } catch { return null; }
}

function setVideoDim(url: string, w: number, h: number) {
  try {
    const data = JSON.parse(localStorage.getItem('chat-video-dims') || '{}');
    data[url] = { w, h };
    localStorage.setItem('chat-video-dims', JSON.stringify(data));
  } catch {}
}

function getVideoDimensionsFromFile(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('video/')) { resolve(null); return; }
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const dims = { width: video.videoWidth, height: video.videoHeight };
      URL.revokeObjectURL(video.src);
      resolve(dims);
    };
    video.onerror = () => resolve(null);
    video.src = URL.createObjectURL(file);
  });
}

function getValidDuration(video: HTMLVideoElement | null): number {
  const d = video?.duration;
  return (typeof d === 'number' && isFinite(d) && d > 0) ? d : 0;
}

// --- Props ---
export interface VideoRendererProps {
  src: string;
  onClose?: () => void;
  fileName?: string;
  compact?: boolean;
  poster?: string;
  metadata?: any;
}

// --- Component ---
export const VideoRenderer = memo(function VideoRenderer({
  src, onClose, fileName, compact, poster, metadata
}: VideoRendererProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState(0);
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);
  // Browser-reported dimensions (override metadata khi đã load)
  const [browserW, setBrowserW] = useState(0);
  const [browserH, setBrowserH] = useState(0);

  // Lấy dimensions từ metadata + localStorage + browser
  const rawW = metadata?.videoWidth || metadata?.width || 0;
  const rawH = metadata?.videoHeight || metadata?.height || 0;
  const dimW = browserW || rawW;
  const dimH = browserH || rawH;
  const hasDim = dimW > 0 && dimH > 0;
  const isLandscape = hasDim && dimW >= dimH;

  // Container style — aspect ratio từ metadata ngay render đầu
  const containerStyle: React.CSSProperties = compact
    ? {
        flexShrink: 0,
        overflow: "hidden",
        ...(hasDim
          ? isLandscape
            ? { width: "100%", maxWidth: 550, height: Math.round(550 * dimH / dimW) }
            : { maxWidth: 280, width: 280, height: Math.min(Math.round(280 * dimH / dimW), 450) }
          : { width: "100%", maxWidth: 550, height: Math.round(550 * 9 / 16), minHeight: 200 }
        )
      }
    : {};
  // Sync duration DB khi có metadata từ browser
  const onLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const dur = getValidDuration(video);
    if (dur > 0) setDuration(dur);
    const { videoWidth: w, videoHeight: h } = video;
    if (w > 0 && h > 0) {
      // Cập nhật container style với dimensions thật từ browser
      if (w !== browserW || h !== browserH) {
        setBrowserW(w);
        setBrowserH(h);
      }
      // Sync DB nếu metadata gốc sai
      if (!rawW || !rawH || rawW !== w || rawH !== h) {
        fetch(`${API_URL.replace(/\/api\/?$/, "")}/api/chat/video-dimensions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ messageId: metadata?.messageId, attachmentIndex: metadata?.attachmentIndex, width: w, height: h })
        }).catch(() => {});
      }
    }
  }, [rawW, rawH, browserW, browserH, metadata?.messageId, metadata?.attachmentIndex]);

  // Duration change handler
  const onDurationChange = useCallback(() => {
    const dur = getValidDuration(videoRef.current);
    if (dur > 0) setDuration(dur);
  }, []);

  // Lấy metadata từ browser ngay khi mount — preload="metadata" tự động load
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Nếu video đã load metadata sẵn (từ cache/preload), xử lý ngay
    if (video.readyState >= 1) {
      onLoadedMetadata();
    }
  }, [src]);

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [isPlaying]);

  const formatTime = (time: number) => {
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative group overflow-hidden rounded-[6px] bg-[#1e1f22]",
        !compact && "flex items-center justify-center w-full h-full max-w-[98vw] max-h-[98vh] shadow-2xl border border-white/5"
      )}
      style={containerStyle}
      onClick={togglePlay}
      onMouseEnter={() => !compact && isPlaying && setShowControls(true)}
      onMouseLeave={() => { if (!isDragging) setShowControls(false); }}
      onMouseMove={() => {
        setShowControls(true);
        clearTimeout(controlsTimeout.current);
        if (isPlaying && !isDragging) {
          controlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
        }
      }}
    >
      {!hasDim && (
        <div className="absolute inset-0 bg-[#2b2d31] animate-pulse z-10 flex items-center justify-center">
          <div className="size-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <Play className="size-6 text-white/20 fill-current" />
          </div>
        </div>
      )}

      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="w-full h-full object-contain block cursor-pointer"
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onLoadedData={onLoadedMetadata}
        onCanPlay={onLoadedMetadata}
        onDurationChange={onDurationChange}
        onPlay={onLoadedMetadata}
        onClick={togglePlay}
        onEnded={() => {
          setIsPlaying(false);
          if (videoRef.current) { videoRef.current.currentTime = 0; setCurrentTime(0); }
        }}
        onTimeUpdate={() => {
          if (videoRef.current && !isDragging) {
            setCurrentTime(videoRef.current.currentTime);
            if (duration === 0) {
              const d = getValidDuration(videoRef.current);
              if (d > 0) setDuration(d);
            }
          }
        }}
        muted={isMuted || (compact && !isPlaying)}
        playsInline
      />

      {/* Center Play Overlay */}
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer z-10 hover:bg-black/30 transition-all">
          <div className="size-12 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-white shadow-2xl hover:scale-110 transition-transform">
            <Play className="size-6 fill-current translate-x-0.5" />
          </div>
        </div>
      )}

      {/* Top Actions */}
      {!compact && (
        <div className={cn(
          "absolute top-4 right-4 z-20 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0"
        )}>
          <button className="p-2.5 bg-black/60 hover:bg-black/80 text-white rounded-lg shadow-lg backdrop-blur-md border border-white/10"
            onClick={(e) => {
              e.stopPropagation();
              const a = document.createElement('a');
              a.href = src; a.download = fileName || 'video.mp4'; a.click();
            }}
          >
            <Download className="size-6" />
          </button>
        </div>
      )}

      {/* Controls */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 px-4 pt-12 pb-3 bg-gradient-to-t from-black/95 via-black/40 to-transparent z-20 transition-all",
        showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      )}>
        <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
          {/* Seek Bar */}
          <div className="relative group/seek px-0.5 cursor-pointer" onMouseMove={(e) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const p = Math.min(Math.max(0, (e.clientX - rect.left) / rect.width), 1);
            setHoverPos(p * 100);
            setHoverTime(p * duration);
          }} onMouseLeave={() => setHoverTime(null)}>
            {hoverTime !== null && !isDragging && (
              <div className="absolute bottom-[calc(100%+12px)] px-2 py-1 bg-black/90 text-white text-[11px] font-bold rounded shadow border border-white/10 pointer-events-none z-30"
                style={{ left: `${hoverPos}%`, transform: 'translateX(-50%)' }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
            <div className="relative w-full overflow-visible h-1.5">
              <input type="range" min={0} max={duration || 100} value={currentTime}
                onChange={(e) => {
                  const t = parseFloat(e.target.value);
                  setCurrentTime(t);
                  if (videoRef.current) videoRef.current.currentTime = t;
                }}
                onMouseDown={() => setIsDragging(true)}
                onMouseUp={() => setIsDragging(false)}
                className="absolute inset-0 w-full h-full opacity-0 z-50 cursor-grab"
              />
              <div className="absolute inset-0 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-[#5865f2] transition-all"
                  style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                />
              </div>
              <div className="absolute top-1/2 -translate-y-1/2 size-3.5 bg-[#5865f2] border-2 border-white rounded-full shadow-lg z-20 pointer-events-none"
                style={{ left: `calc(${(currentTime / (duration || 1)) * 100}% - 7px)` }}
              />
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="flex items-center justify-between px-1">
            <button className="text-white hover:text-[#5865f2] transition-all" onClick={togglePlay}>
              {isPlaying ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current" />}
            </button>
            <div className="flex items-center gap-3">
              <button className="text-white hover:text-[#5865f2]" onClick={() => setIsMuted(!isMuted)}>
                {isMuted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </button>
              <button className="text-white hover:text-[#5865f2]" onClick={(e) => {
                e.stopPropagation();
                if (!document.fullscreenElement) {
                  containerRef.current?.requestFullscreen();
                } else {
                  document.exitFullscreen();
                }
              }}>
                <Maximize className="size-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

VideoRenderer.displayName = 'VideoRenderer';
