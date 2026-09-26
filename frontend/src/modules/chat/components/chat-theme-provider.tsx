'use client';

import React, { useEffect, useRef } from 'react';
import { useChatUiPreferencesStore } from '../chat-ui-preferences';
import { cn } from '../utils';

interface ChatThemeProviderProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export function ChatThemeProvider({ children, className, id }: ChatThemeProviderProps) {
  const { theme, primaryColor, borderRadius } = useChatUiPreferencesStore();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;

    const root = rootRef.current;
    root.style.setProperty('--chat-primary', primaryColor);
    root.style.setProperty('--chat-radius', `${borderRadius}px`);
    root.setAttribute('data-chat-theme', theme);
  }, [theme, primaryColor, borderRadius]);

  return (
    <div 
      ref={rootRef}
      id={id}
      className={cn('chat-theme-root fixed inset-0 w-screen h-screen overflow-hidden', className)}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        zIndex: 100,
        backgroundColor: 'var(--chat-bg, #313338)',
      }}
      data-chat-theme={theme}
    >
      {children}
    </div>
  );
}
