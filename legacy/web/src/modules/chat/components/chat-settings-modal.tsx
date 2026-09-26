'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import { cn } from '../utils';

interface ChatSettingsModalProps {
  open: boolean;
  chatTheme: string;
  onClose: () => void;
  onThemeChange: (theme: string) => void;
}

export function ChatSettingsModal({ open, chatTheme, onClose, onThemeChange }: ChatSettingsModalProps) {
  if (!open || typeof document === 'undefined') return null;

  const isLight = chatTheme === 'light';

  return createPortal(
    <div
      className={cn(
        "chat-theme-root fixed inset-0 z-[99999] flex items-center justify-center p-4 animate-in fade-in",
        `chat-theme-${chatTheme}`,
        (chatTheme === 'dark' || chatTheme === 'midnight') && 'dark'
      )}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(6px)',
        padding: '16px',
      }}
      data-chat-theme={chatTheme}
      onClick={onClose}
    >
      <div
        className={cn(
          "chat-modal-box relative w-[720px] max-w-[95vw] h-[480px] max-h-[90vh] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95",
          `chat-theme-${chatTheme}`,
          (chatTheme === 'dark' || chatTheme === 'midnight') && 'dark'
        )}
        style={{
          width: '720px',
          maxWidth: '95vw',
          height: '480px',
          maxHeight: '90vh',
          borderRadius: '16px',
          backgroundColor: isLight ? '#ffffff' : 'var(--chat-panel, #2b2d31)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.55)',
          border: isLight ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '18px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: isLight ? '#f2f3f5' : 'var(--chat-header, #313338)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: isLight ? '#060607' : 'var(--chat-text-main, #ffffff)' }}>
            Cài đặt giao diện Chat
          </h2>
          <button
            type="button"
            style={{
              border: 'none',
              backgroundColor: isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.08)',
              cursor: 'pointer',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--chat-text-muted, #80848e)',
              transition: 'all 0.15s ease',
              padding: 0,
            }}
            onClick={onClose}
            title="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--chat-text-muted, #80848e)',
                marginBottom: '16px',
              }}
            >
              Chủ đề giao diện
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {(['dark', 'light', 'midnight'] as const).map((t) => {
                const isActive = chatTheme === t;
                return (
                  <button
                    key={t}
                    type="button"
                    style={{
                      position: 'relative',
                      height: '96px',
                      borderRadius: '12px',
                      border: isActive ? '2px solid #5865f2' : (isLight ? '2px solid rgba(0,0,0,0.1)' : '2px solid rgba(255,255,255,0.1)'),
                      outline: isActive ? '2px solid rgba(88, 101, 242, 0.3)' : 'none',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                      padding: 0,
                      transition: 'all 0.2s ease',
                    }}
                    onClick={() => onThemeChange(t)}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        textTransform: 'capitalize',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '15px',
                        backgroundColor: t === 'light' ? '#ffffff' : t === 'midnight' ? '#000000' : '#313338',
                        color: t === 'light' ? '#060607' : '#ffffff',
                      }}
                    >
                      {t}
                    </div>
                    {isActive && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: '#5865f2',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                        }}
                      >
                        <Check className="size-3 text-white" style={{ strokeWidth: 3 }} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
