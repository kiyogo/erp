'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../utils';
import { X, FileText, Link2, ExternalLink, Download } from 'lucide-react';
import { VideoRenderer } from './video-renderer';
import { toast } from '../toast';

interface ChatLightboxProps {
  image: string | null;
  thumbnail: string | null;
  type: 'image' | 'video' | 'text' | 'pdf' | 'office';
  metadata: any;
  text: string | null;
  fileName: string;
  fileSize: string;
  zoom: number;
  origin: string;
  offset: { x: number; y: number };
  isDragging: boolean;
  hasMoved: boolean;
  dragStart: { x: number; y: number };
  chatTheme: string;
  onClose: () => void;
  onZoomChange: (zoom: number) => void;
  onOffsetChange: (offset: { x: number; y: number } | ((current: { x: number; y: number }) => { x: number; y: number })) => void;
  onOriginChange: (origin: string) => void;
  onDraggingChange: (dragging: boolean) => void;
  onDragStartChange: (start: { x: number; y: number }) => void;
  onHasMovedChange: (moved: boolean) => void;
  onDownload: (url: string, filename: string) => void;
  textRef: React.RefObject<HTMLDivElement | null>;
  imgRef: React.RefObject<HTMLImageElement | null>;
}

export function ChatLightbox({
  image,
  thumbnail,
  type,
  metadata,
  text,
  fileName,
  fileSize,
  zoom,
  origin,
  offset,
  isDragging,
  hasMoved,
  dragStart,
  chatTheme,
  onClose,
  onZoomChange,
  onOffsetChange,
  onOriginChange,
  onDraggingChange,
  onDragStartChange,
  onHasMovedChange,
  onDownload,
  textRef,
  imgRef,
}: ChatLightboxProps) {
  return (
    <>
      {image && createPortal(
        <div
          className="chat-theme-root fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black/70 animate-in fade-in duration-200 overflow-hidden"
          onClick={() => { onClose(); onZoomChange(1); onOffsetChange({ x: 0, y: 0 }); onOriginChange('center center'); }}
          onMouseMove={(e) => {
            if (isDragging && zoom > 1 && imgRef.current) {
              const img = imgRef.current;
              const rect = img.getBoundingClientRect();

              // Calculate potential new offset
              const dx = e.clientX - dragStart.x;
              const dy = e.clientY - dragStart.y;

              if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                onHasMovedChange(true);
              }

              onOffsetChange(prev => {
                const newX = prev.x + dx;
                const newY = prev.y + dy;

                // Strict clamping logic: don't allow dragging past the image edges
                const maxX = Math.max(0, (rect.width - window.innerWidth) / 2);
                const maxY = Math.max(0, (rect.height - window.innerHeight) / 2);

                return {
                  x: Math.max(-maxX, Math.min(maxX, newX)),
                  y: Math.max(-maxY, Math.min(maxY, newY))
                };
              });
              onDragStartChange({ x: e.clientX, y: e.clientY });
            }
          }}
          onMouseUp={() => onDraggingChange(false)}
          onMouseLeave={() => onDraggingChange(false)}
        >
          {/* Close Button - Only show for images/videos where there's no header button */}
          {type !== 'text' && type !== 'pdf' && (
            <button
              className="absolute top-6 right-6 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-[10001]"
              onClick={() => { onClose(); onZoomChange(1); onOffsetChange({ x: 0, y: 0 }); onOriginChange('center center'); }}
            >
              <X className="size-8" />
            </button>
          )}

          <div
            className="relative w-full h-full flex items-center justify-center p-[100px]"
          >
            {type === 'text' ? (
              <div
                className={cn(
                  "w-full max-w-[900px] max-h-[85vh] rounded-lg shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95",
                  chatTheme === 'light' ? "bg-[#f2f3f5] text-[#2e3338]" : "bg-[#2b2d31] text-[#dbdee1]"
                )}
                onClick={e => e.stopPropagation()}
              >
                <div className={cn("px-4 py-3 border-b flex items-center justify-between", chatTheme === 'light' ? "bg-white border-black/5" : "bg-[#1e1f22] border-white/5")}>
                  <div className="flex items-center gap-3">
                    <div className="bg-[#5865f2]/10 p-2 rounded-lg">
                      <FileText className="size-5 text-[#5865f2]" />
                    </div>
                    <div>
                      <div className="font-bold text-sm truncate max-w-[600px]">{fileName}</div>
                      <div className="text-[11px] opacity-60 font-medium">{fileSize}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className="p-2 hover:bg-black/10 rounded-md transition-colors"
                      title="Sao chép liên kết"
                      onClick={() => {
                        const fullUrl = image!.startsWith('http') ? image! : (window.location.origin + image!);
                        navigator.clipboard.writeText(fullUrl);
                        toast.success('Đã sao chép liên kết');
                      }}
                    >
                      <Link2 className="size-5" />
                    </button>
                    <button
                      className="p-2 hover:bg-black/10 rounded-md transition-colors"
                      title="Mở trong tab mới"
                      onClick={() => window.open(image!, '_blank')}
                    >
                      <ExternalLink className="size-5" />
                    </button>
                    <button
                      className="p-2 hover:bg-black/10 rounded-md transition-colors"
                      title="Tải xuống"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDownload(image!, fileName);
                      }}
                    >
                      <Download className="size-5" />
                    </button>
                    <button
                      className="p-2 hover:bg-black/10 rounded-md transition-colors text-red-500 hover:text-red-600"
                      title="Đóng"
                      onClick={() => { onClose(); onZoomChange(1); onOffsetChange({ x: 0, y: 0 }); onOriginChange('center center'); }}
                    >
                      <X className="size-5" />
                    </button>
                  </div>
                </div>
                <div
                  ref={textRef}
                  tabIndex={0}
                  className="flex-1 overflow-auto p-4 font-mono text-[13px] leading-relaxed whitespace-pre select-text micro-scrollbar outline-none focus:ring-0"
                  onKeyDown={(e) => {
                    if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      if (textRef.current) {
                        const range = document.createRange();
                        range.selectNodeContents(textRef.current);
                        const selection = window.getSelection();
                        if (selection) {
                          selection.removeAllRanges();
                          selection.addRange(range);
                        }
                      }
                    }
                  }}
                >
                  {text || 'Đang tải nội dung...'}
                </div>
              </div>
            ) : type === 'pdf' ? (
              <div
                className={cn(
                  "w-[95vw] max-w-[1200px] h-[90vh] rounded-lg shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95",
                  chatTheme === 'light' ? "bg-[#f2f3f5] text-[#2e3338]" : "bg-[#2b2d31] text-[#dbdee1]"
                )}
                onClick={e => e.stopPropagation()}
              >
                <div className={cn("px-4 py-3 border-b flex items-center justify-between", chatTheme === 'light' ? "bg-white border-black/5" : "bg-[#1e1f22] border-white/5")}>
                  <div className="flex items-center gap-3">
                    <div className="bg-[#5865f2]/10 p-2 rounded-lg">
                      <FileText className="size-5 text-[#5865f2]" />
                    </div>
                    <div>
                      <div className="font-bold text-sm truncate max-w-[600px]">{fileName}</div>
                      <div className="text-[11px] opacity-60 font-medium">{fileSize}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className="p-2 hover:bg-black/10 rounded-md transition-colors"
                      title="Sao chép liên kết"
                      onClick={() => {
                        const fullUrl = image!.startsWith('http') ? image! : (window.location.origin + image!);
                        navigator.clipboard.writeText(fullUrl);
                        toast.success('Đã sao chép liên kết');
                      }}
                    >
                      <Link2 className="size-5" />
                    </button>
                    <button
                      className="p-2 hover:bg-black/10 rounded-md transition-colors"
                      title="Mở trong tab mới"
                      onClick={() => window.open(image!, '_blank')}
                    >
                      <ExternalLink className="size-5" />
                    </button>
                    <button
                      className="p-2 hover:bg-black/10 rounded-md transition-colors"
                      title="Tải xuống"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDownload(image!, fileName);
                      }}
                    >
                      <Download className="size-5" />
                    </button>
                    <button
                      className="p-2 hover:bg-black/10 rounded-md transition-colors text-red-500 hover:text-red-600"
                      title="Đóng"
                      onClick={() => { onClose(); onZoomChange(1); onOffsetChange({ x: 0, y: 0 }); onOriginChange('center center'); }}
                    >
                      <X className="size-5" />
                    </button>
                  </div>
                </div>
                <iframe src={image!} className="w-full flex-1 border-0 bg-white" title={fileName} />
              </div>
            ) : type === 'video' ? (
              <VideoRenderer
                src={image!}
                onClose={onClose}
                fileName={fileName}
                poster={thumbnail || undefined}
                metadata={metadata}
              />
            ) : (
              <img
                ref={imgRef}
                src={image!}
                alt="Preview"
                className={cn(
                  "max-w-full max-h-full object-contain shadow-2xl animate-in zoom-in-95",
                  zoom === 1 ? "cursor-zoom-in transition-transform duration-300 ease-out" : "cursor-zoom-out",
                  isDragging ? "transition-none" : "transition-transform duration-300 ease-out"
                )}
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                  transformOrigin: 'center center'
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onHasMovedChange(false);
                  if (zoom > 1) {
                    onDraggingChange(true);
                    onDragStartChange({ x: e.clientX, y: e.clientY });
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasMoved) return;

                  if (zoom === 1) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const xPercent = (e.clientX - rect.left) / rect.width;
                    const yPercent = (e.clientY - rect.top) / rect.height;

                    const scale = 2.5;
                    // Calculate offset to bring the clicked point to the center
                    const newX = (0.5 - xPercent) * (rect.width * scale);
                    const newY = (0.5 - yPercent) * (rect.height * scale);

                    onZoomChange(scale);

                    // Clamp initial offset
                    const maxX = Math.max(0, (rect.width * scale - window.innerWidth) / 2);
                    const maxY = Math.max(0, (rect.height * scale - window.innerHeight) / 2);

                    onOffsetChange({
                      x: Math.max(-maxX, Math.min(maxX, newX)),
                      y: Math.max(-maxY, Math.min(maxY, newY))
                    });
                  } else {
                    onZoomChange(1);
                    onOffsetChange({ x: 0, y: 0 });
                  }
                }}
              />
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
