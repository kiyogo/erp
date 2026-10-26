'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Send } from 'lucide-react';
import { cn } from '../utils';
import { Avatar } from './chat-components';
import type { ProfileAnchor } from '../chat-page-types';
import { getInitials } from '../chat-helpers';

export function UserProfilePopover({
  anchor,
  onClose,
  theme,
  draft,
  isSending,
  error,
  canShowSettings,
  onDraftChange,
  onDraftKeyDown,
  onSend
}: {
  anchor: ProfileAnchor;
  onClose: () => void;
  theme: string;
  draft: string;
  isSending: boolean;
  error: string | null;
  canShowSettings: boolean;
  onDraftChange: (value: string) => void;
  onDraftKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
}) {
  const { member } = anchor;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div className="chat-floating-layer">
        <button className="fixed inset-0 cursor-default bg-transparent pointer-events-auto" type="button" onClick={onClose} />
        <div
          className={cn(
            'chat-theme-root chat-user-profile-popover border border-white/10',
            `chat-theme-${theme}`,
            (theme === 'dark' || theme === 'midnight') && 'dark'
          )}
          style={{
            ...anchor.style,
            background: theme === 'light' ? '#ffffff' : 'var(--chat-user-bar)'
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="relative h-[112px] w-full overflow-hidden bg-[var(--chat-sidebar-servers)]">
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle at top left, ${member.color || 'var(--chat-primary)'} 0%, rgba(17,18,20,0.35) 42%, rgba(17,18,20,0.9) 100%)`
              }}
            />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--chat-sidebar-servers)] to-transparent" />
          </div>

          <div className="relative px-5 pb-5">
            <div className="absolute -top-12 left-5">
              <Avatar
                name={member.name}
                color={member.color}
                presence={member.presence}
                src={member.avatarUrl}
                size="lg"
                className="size-24 text-2xl ring-[6px] ring-[var(--chat-user-bar)] shadow-[0_18px_42px_rgba(0,0,0,0.35)]"
              />
            </div>

            <div className="pt-16">
              <div className="flex flex-wrap items-center gap-2">
                <div className={cn("text-[24px] font-extrabold leading-none tracking-[-0.02em]", theme === 'light' ? "text-[#060607]" : "text-[var(--chat-text-main)]")}>{member.name}</div>
                {member.roleGroup ? (
                  <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]", theme === 'light' ? "bg-[#f2f3f5] border-black/10 text-[#4f5660]" : "bg-white/5 border-white/10 text-[var(--chat-text-muted)]")}>
                    #{member.roleGroup}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-[var(--chat-text-muted)]">
                <span className={cn("font-medium", theme === 'light' ? "text-[#4f5660]" : "text-[var(--chat-text-main)]")}>{getInitials(member.name)}</span>
                <span className={cn("truncate max-w-[150px]", theme === 'light' ? "text-[#6a7480]" : "text-[var(--chat-text-muted)]")}>{member.email || member.username}</span>
                {canShowSettings ? (
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
                    setting
                  </span>
                ) : null}
              </div>
            </div>

            {member.status ? (
              <div className={cn("mt-4 rounded-2xl border px-4 py-3 text-[13px]", theme === 'light' ? "bg-[#f2f3f5] border-black/5 text-[#2e3338]" : "bg-white/[0.03] border-white/6 text-[var(--chat-text-main)]")}>
                {member.status}
              </div>
            ) : null}

            <div className={cn("mt-4 rounded-[18px] border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]", theme === 'light' ? "bg-[#f2f3f5] border-black/5" : "bg-[var(--chat-sidebar-servers)] border-white/5")}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--chat-text-muted)]">Nhắn tin</span>
                <button
                  className="rounded-full p-2 text-[var(--chat-text-muted)] transition-colors hover:bg-white/8 hover:text-[var(--chat-text-main)] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={onSend}
                  type="button"
                  disabled={isSending || !draft.trim()}
                  title="Gửi tin nhắn"
                >
                  <Send className="size-4" />
                </button>
              </div>
              <textarea
                className="min-h-[84px] w-full resize-none rounded-2xl border border-white/5 bg-[var(--chat-user-bar)] px-4 py-3 text-[14px] text-[var(--chat-text-main)] outline-none transition-colors placeholder:text-[var(--chat-text-muted)] focus:border-white/10"
                placeholder={`Nhắn tin cho ${member.name}`}
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                onKeyDown={onDraftKeyDown}
                disabled={isSending}
              />
              {error ? <div className="mt-2 text-[12px] font-medium text-[#ff8d8d]">{error}</div> : null}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

export function ChatUserProfilePopover({
  user,
  targetElement,
  onClose,
}: {
  user: { name: string; email?: string; avatarUrl?: string; role?: string };
  targetElement: HTMLElement | null;
  onClose: () => void;
}) {
  if (!targetElement || typeof document === 'undefined') return null;
  const rect = targetElement.getBoundingClientRect();

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9990] bg-transparent" onClick={onClose} />
      <div
        className="fixed z-[9995] w-[280px] bg-[#232428] rounded-xl border border-[#1f2023] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-[#dbdee1]"
        style={{
          bottom: Math.max(10, window.innerHeight - rect.top + 8),
          left: Math.max(10, rect.left),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner */}
        <div className="h-16 w-full bg-[#5865f2]" />

        {/* Avatar & Content */}
        <div className="px-4 pb-4 relative">
          <div className="absolute -top-8 left-4">
            <Avatar name={user.name} src={user.avatarUrl} presence="online" size="md" />
          </div>

          <div className="pt-9">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-bold text-white leading-tight truncate">{user.name}</span>
              <span className="text-[10px] uppercase font-bold bg-[#5865f2]/20 text-[#5865f2] px-2 py-0.5 rounded-full border border-[#5865f2]/30">
                {user.role || 'Admin'}
              </span>
            </div>
            <span className="text-[12px] text-[#949ba4] block mt-0.5 truncate">{user.email}</span>

            <div className="mt-3 pt-3 border-t border-[#35373c]/50 text-[12px]">
              <div className="text-[10px] font-bold text-[#949ba4] uppercase mb-1">Trạng thái</div>
              <div className="flex items-center gap-1.5 text-[#23a55a]">
                <span className="w-2 h-2 rounded-full bg-[#23a55a]" />
                <span className="font-medium">Trực tuyến</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

