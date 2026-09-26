'use client';

import type { Presence } from './chat-page-types';

export const getAttachmentUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('blob:')) return url;
  if (url.includes('tiktokcdn') || url.includes('tiktok.com')) {
    return `/api/proxy-image?url=${encodeURIComponent(url)}`;
  }
  if (url.startsWith('http')) return url;
  return url;
};

export const isViewable = (name: string, type?: string) => {
  const checkName = name.toLowerCase();
  const isVideo = type?.startsWith('video/') || checkName.match(/\.(mp4|webm|mov|ogg)$/i);
  const isImage = type?.startsWith('image/') || checkName.match(/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i);
  const isPdf = type === 'application/pdf' || checkName.match(/\.pdf$/i);
  const isText = type === 'text/plain' || type?.startsWith('text/') || checkName.match(/\.(txt|md|js|ts|jsx|tsx|json|py|cpp|c|h|hpp|css|html|lua|java|go|rb|php|sql|xml|sh|yaml|yml|ini|env|log|csv|rs|swift|kt|dart|cs|bat|ps1|vbs|properties|conf|cfg|vue|svelte|scss|less)$/i);
  return isVideo || isImage || isPdf || isText;
};

export const getInitials = (value: string) => {
  if (!value) return 'U';
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'U';
  const first = words[0] ?? 'U';
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  const last = words[words.length - 1] ?? first;
  return `${first[0] ?? 'U'}${last[0] ?? ''}`.toUpperCase();
};

export const PRESENCE_STYLE: Record<Presence, string> = {
  online: 'bg-[#23a55a]',
  idle: 'bg-[#f0b232]',
  dnd: 'bg-[#f23f43]',
  offline: 'bg-[#80848e]'
};

export function getVideoDim(url: string): { w: number; h: number } | null {
  try {
    const data = JSON.parse(localStorage.getItem('chat-video-dims') || '{}');
    return data[url] || null;
  } catch { return null; }
}

export function setVideoDim(url: string, w: number, h: number) {
  try {
    const data = JSON.parse(localStorage.getItem('chat-video-dims') || '{}');
    data[url] = { w, h };
    localStorage.setItem('chat-video-dims', JSON.stringify(data));
  } catch {}
}

export function getVideoDimensions(file: File): Promise<{ width: number; height: number } | null> {
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

export function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
