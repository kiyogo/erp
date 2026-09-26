'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/** Phát hiện mobile viewport */
export function useMobileDetect() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}

/** Auto-resize textarea theo nội dung */
export function useAutoSizeTextarea(inputRef: React.RefObject<HTMLTextAreaElement | null>) {
  const adjust = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '40px';
    el.style.height = `${Math.min(el.scrollHeight, 170)}px`;
    el.style.overflowY = el.scrollHeight > 170 ? 'auto' : 'hidden';
  }, [inputRef]);

  return adjust;
}

/** Typing indicator với timeout cleanup */
export function useTypingCleanup(
  socket: any,
  activeChannelId: string | null,
  deps: any[]
) {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (cleanupRef.current) cleanupRef.current();
      // Emit typing=false khi unmount
      if (socket && activeChannelId) {
        socket.emit('chat:typing', { channelId: String(activeChannelId), isTyping: false });
      }
    };
  }, [socket, activeChannelId, ...deps]);
}

/** Escape key handler */
export function useEscapeKey(handler: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler]);
}
