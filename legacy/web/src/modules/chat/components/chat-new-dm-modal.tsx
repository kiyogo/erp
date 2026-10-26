'use client';

import React from 'react';
import { X, Check, Hash } from 'lucide-react';
import { cn } from '../utils';
import { createPortal } from 'react-dom';
import { Avatar } from './chat-components';
import type { ChatChannelSummary } from '../chat-types';

interface ChatNewDMModalProps {
  open: boolean;
  chatTheme: string;
  dmSearchQuery: string;
  dmSearchResults: any[];
  selectedUserIds: string[];
  directMessages: ChatChannelSummary[];
  onClose: () => void;
  onSearch: (q: string) => void;
  onToggleUser: (id: string) => void;
  onCreateDM: () => void;
}

export function ChatNewDMModal({
  open,
  chatTheme,
  dmSearchQuery,
  dmSearchResults,
  selectedUserIds,
  directMessages,
  onClose,
  onSearch,
  onToggleUser,
  onCreateDM,
}: ChatNewDMModalProps) {
  if (!open) return null;

  const isLight = chatTheme === 'light';

  return createPortal(
    <div
      className={cn(
        "chat-theme-root fixed inset-0 z-[9999] flex items-center justify-center p-4",
        `chat-theme-${chatTheme}`,
        (chatTheme === 'dark' || chatTheme === 'midnight') && "dark"
      )}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
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
          "chat-modal-box relative w-[460px] max-w-full min-h-[520px] max-h-[85vh] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200",
          `chat-theme-${chatTheme}`,
          (chatTheme === 'dark' || chatTheme === 'midnight') && "dark"
        )}
        style={{
          width: '460px',
          maxWidth: '100%',
          minHeight: '520px',
          maxHeight: '85vh',
          borderRadius: '16px',
          backgroundColor: isLight ? '#ffffff' : 'var(--chat-bg, #313338)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.55)',
          border: isLight ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px 14px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <h2
              style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 700,
                color: isLight ? '#060607' : 'var(--chat-text-main, #ffffff)',
                letterSpacing: '-0.02em',
              }}
            >
              Tin Nhắn Mới
            </h2>
            <span style={{ fontSize: '13px', color: 'var(--chat-text-muted, #80848e)' }}>
              Chọn người dùng để bắt đầu trò chuyện trực tiếp
            </span>
          </div>

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

        {/* Search Bar */}
        <div style={{ padding: '0 24px 14px 24px' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '10px',
              backgroundColor: isLight ? '#f2f3f5' : 'var(--chat-input-bg, #383a40)',
              border: isLight ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.08)',
              transition: 'border-color 0.15s ease',
            }}
          >
            {selectedUserIds.map(uid => {
              const u = dmSearchResults.find(res => res.id === uid) || directMessages.flatMap(d => d.members as any[]).find((m: any) => (m.userId || m.user_id) === uid)?.user;
              const name = u?.profile?.fullName || 'User';
              return (
                <div
                  key={uid}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: 'var(--chat-primary, #5865f2)',
                    color: '#ffffff',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                >
                  <span>{name}</span>
                  <button
                    type="button"
                    onClick={() => onToggleUser(uid)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#ffffff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: 0,
                    }}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              );
            })}
            <input
              style={{
                flex: 1,
                minWidth: '140px',
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                color: isLight ? '#060607' : 'var(--chat-text-main, #ffffff)',
                fontSize: '14px',
                padding: '4px 0',
                boxShadow: 'none',
              }}
              placeholder="Tìm bằng tên, email, mã NV hoặc SĐT..."
              value={dmSearchQuery}
              onChange={(e) => onSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* User Search Results List */}
        <div
          className="custom-scrollbar"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 16px',
            minHeight: '260px',
          }}
        >
          {dmSearchQuery && dmSearchResults.length === 0 && (
            <div
              style={{
                padding: '48px 16px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: isLight ? '#f2f3f5' : 'rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--chat-text-muted, #80848e)',
                }}
              >
                <Hash className="size-6" />
              </div>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--chat-text-muted, #80848e)' }}>
                Không tìm thấy kết quả phù hợp.
              </p>
            </div>
          )}

          {dmSearchResults.map((u: any) => {
            const isSelected = selectedUserIds.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => onToggleUser(u.id)}
                style={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: isSelected
                    ? (isLight ? 'rgba(88, 101, 242, 0.12)' : 'rgba(88, 101, 242, 0.2)')
                    : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  marginBottom: '4px',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = isLight ? 'rgba' : 'rgba';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Avatar name={u.fullName} color="var(--chat-primary, #5865f2)" src={u.avatarUrl} size="sm" />
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '14px',
                        color: isLight ? '#060607' : 'var(--chat-text-main, #ffffff)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {u.fullName}
                    </span>
                    <span
                      style={{
                        fontSize: '12px',
                        color: 'var(--chat-text-muted, #80848e)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      @{u.email?.split('@')[0]}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '6px',
                    border: isSelected ? '2px solid #5865f2' : (isLight ? '2px solid #d1d5db' : '2px solid #4b5563'),
                    backgroundColor: isSelected ? '#5865f2' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {isSelected && <Check className="size-3.5 text-white" style={{ strokeWidth: 3 }} />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px',
            backgroundColor: isLight ? '#f2f3f5' : 'var(--chat-user-bar, #2b2d31)',
            borderTop: isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: isLight ? '#4b5563' : 'var(--chat-text-main, #ffffff)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              padding: '9px 18px',
              borderRadius: '8px',
              opacity: 0.85,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.backgroundColor = isLight ? 'rgba' : 'rgba';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.85';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            Hủy bỏ
          </button>

          <button
            type="button"
            onClick={onCreateDM}
            disabled={selectedUserIds.length === 0}
            style={{
              height: '38px',
              padding: '0 24px',
              borderRadius: '8px',
              backgroundColor: selectedUserIds.length > 0 ? '#5865f2' : (isLight ? '#e5e7eb' : 'rgba(88, 101, 242, 0.35)'),
              color: selectedUserIds.length > 0 ? '#ffffff' : (isLight ? '#9ca3af' : 'rgba(255, 255, 255, 0.4)'),
              fontSize: '14px',
              fontWeight: 600,
              border: 'none',
              cursor: selectedUserIds.length > 0 ? 'pointer' : 'not-allowed',
              boxShadow: selectedUserIds.length > 0 ? '0 4px 14px rgba(88, 101, 242, 0.35)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            Tạo Tin Nhắn
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
