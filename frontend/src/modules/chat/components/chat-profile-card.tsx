'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../utils';
import { Avatar } from './chat-components';
import { openDirectMessage, sendChatMessage } from '../chat-api';
import { toast } from '../toast';
import { useAuthStore } from '../auth-store';
import { Send } from 'lucide-react';
import type { ProfileAnchor, ChatMember } from '../chat-page-types';

export function ProfileCard({ anchor, onClose, theme, isMobile }: { anchor: ProfileAnchor; onClose: () => void; theme: string; isMobile?: boolean }) {
  const { member } = anchor;
  const authUser = useAuthStore((state) => state.user);
  const userId = authUser?.userId;
  const isSelf = String(member.id || (member as any).userId) === String(userId) || String(member.id) === 'EMP-951954';
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);

  if (typeof document === 'undefined') return null;

  const handleSend = async () => {
    if (!draft.trim() || isSending) return;
    setIsSending(true);
    try {
      const res = await openDirectMessage([String(member.id)]);
      if (res.success) {
        const channelId = res.data.id;
        await sendChatMessage(channelId, { content: draft.trim() });
        toast.success(`Đã gửi tin nhắn tới ${member.name}`);
        setDraft('');
        onClose();
        window.dispatchEvent(new CustomEvent('chat:open-dm', { detail: { channelId } }));
      }
    } catch (e) {
      console.error(e);
      toast.error('Không thể gửi tin nhắn');
    } finally {
      setIsSending(false);
    }
  };

  const bannerColor = member.color && member.color !== 'var(--chat-text-main)' && member.color !== '#ffffff'
    ? member.color
    : 'var(--chat-primary, #5865f2)';

  if (isMobile) {
    return createPortal(
      <div className={cn("chat-theme-root", `chat-theme-${theme}`)} data-chat-theme={theme}>
        <div className="fixed inset-0 bg-black/60 z-[9998] transition-opacity duration-300" onClick={onClose} />
        <div
          className={cn(
            "fixed bottom-0 left-0 right-0 z-[9999] rounded-t-[24px] shadow-2xl transition-transform duration-300 ease-out border-t border-white/10 overflow-hidden pb-safe animate-in slide-in-from-bottom",
            `chat-theme-${theme}`,
            (theme === 'dark' || theme === 'midnight') && "dark"
          )}
          style={{
            background: theme === 'light' ? '#ffffff' : '#232428',
            borderRadius: '24px 24px 0 0',
          }}
        >
          {/* Handle */}
          <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mt-3 mb-1" />

          {/* Banner */}
          <div className="h-[120px] w-full" style={{ background: bannerColor, opacity: 0.85 }} />

          <div className="relative px-6 pb-8">
            <div className="absolute -top-12">
              <Avatar
                name={member.name}
                color={member.color}
                src={member.avatarUrl}
                size="lg"
                className={cn(
                  "size-24 text-2xl",
                  theme === 'light' ? "ring-[6px] ring-white" : "ring-[6px] ring-[#232428]"
                )}
              />
            </div>

            <div className="pt-14 flex flex-col gap-1">
              <div className={cn("text-[24px] font-extrabold leading-tight", theme === 'light' ? "text-[#060607]" : "text-white")}>{member.name}</div>
              {member.roleGroup !== 'member' && (
                <div className="text-[14px] text-[#b5bac1]">
                  {member.roles?.[0] || (member.roleGroup === 'owner' ? 'Chủ sở hữu' : member.roleGroup === 'admin' ? 'Quản trị viên' : member.roleGroup)}
                </div>
              )}
            </div>

            {member.status && (
              <div className={cn("mt-4 text-[15px] italic py-2 px-3 rounded-[var(--chat-radius)] border", theme === 'light' ? "bg-[#f2f3f5] border-black/5 text-[#2e3338]" : "bg-white/5 border-white/5 text-[#dbdee1]")}>
                &ldquo;{member.status}&rdquo;
              </div>
            )}

            {!isSelf && (
              <div className={cn("mt-6 flex h-14 items-center gap-3 rounded-2xl px-4 text-[15px] border", theme === 'light' ? "bg-[#f2f3f5] border-black/5" : "bg-[#1e1f22] border-white/5")}>
                <input
                  className={cn("min-w-0 flex-1 bg-transparent outline-none border-none shadow-none focus:outline-none focus:ring-0", theme === 'light' ? "text-[#2e3338]" : "text-[#dbdee1]")}
                  style={{ border: 'none', outline: 'none', boxShadow: 'none' }}
                  placeholder={`Nhắn tin @${member.name}`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                  disabled={isSending}
                />
                <button
                  className={cn("p-2 rounded-full transition-colors border-none bg-transparent cursor-pointer", draft.trim() ? "text-[var(--chat-primary)]" : "text-[#b5bac1]")}
                  onClick={handleSend}
                  disabled={isSending || !draft.trim()}
                >
                  <Send className={cn("size-6", isSending && "animate-pulse")} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className={cn("chat-theme-root", `chat-theme-${theme}`)} data-chat-theme={theme}>
      <button className="fixed inset-0 cursor-default bg-transparent z-[9998] border-none" onClick={onClose} type="button" />
      <div
        className={cn(
          "chat-modal-box fixed overflow-hidden shadow-2xl z-[9999] border animate-in zoom-in-95 duration-200",
          `chat-theme-${theme}`,
          (theme === 'dark' || theme === 'midnight') && "dark"
        )}
        style={{
          ...anchor.style,
          position: 'fixed',
          width: (anchor.style as any).width || 260,
          borderRadius: '16px',
          background: theme === 'light' ? '#ffffff' : '#232428',
          border: theme === 'light' ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)',
        }}
      >
        {/* Banner */}
        <div className="h-[64px] w-full" style={{ background: bannerColor, opacity: 0.85 }} />
        {/* Avatar */}
        <div className="relative px-4 pb-4">
          <div className="absolute -top-7">
            <Avatar
              name={member.name}
              color={member.color}
              src={member.avatarUrl}
              size="md"
              className={cn(
                "size-14 text-base",
                theme === 'light' ? "ring-[4px] ring-white" : "ring-[4px] ring-[#232428]"
              )}
            />
          </div>
          <div className="pt-8 flex flex-col gap-0.5">
            <div className={cn("text-[16px] font-bold leading-snug truncate", theme === 'light' ? "text-[#060607]" : "text-white")}>{member.name}</div>
            <div className="flex items-center gap-2">
              <div className="text-[12px] text-[#b5bac1] truncate max-w-full">{member.email || member.username}</div>
              {member.roleGroup !== 'member' && (
                <div className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--chat-primary)] text-white font-bold uppercase tracking-wider shrink-0">
                  {member.roles?.[0] || (member.roleGroup === 'owner' ? 'Chủ sở hữu' : member.roleGroup === 'admin' ? 'Quản trị viên' : member.roleGroup)}
                </div>
              )}
            </div>
          </div>
          {member.status && (
            <div className={cn("mt-2 text-[13px] italic px-1 text-[var(--chat-text-muted)]")}>&ldquo;{member.status}&rdquo;</div>
          )}
          {!isSelf && (
            <div className={cn("mt-4 flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] border", theme === 'light' ? "bg-[#f2f3f5] border-black/5" : "bg-[#1e1f22] border-white/5")}>
              <input
                className={cn("min-w-0 flex-1 bg-transparent outline-none border-none shadow-none text-[var(--chat-text-main)] focus:outline-none focus:ring-0", theme === 'light' ? "text-[#2e3338]" : "text-[#dbdee1]")}
                style={{ border: 'none', outline: 'none', boxShadow: 'none', padding: 0 }}
                placeholder={`Nhắn tin @${member.name}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                disabled={isSending}
              />
              <Send
                className={cn(
                  "size-4 cursor-pointer transition-colors shrink-0",
                  draft.trim() ? "text-[var(--chat-primary)]" : "text-[#b5bac1] hover:text-[var(--chat-primary)]",
                  isSending && "animate-pulse"
                )}
                onClick={handleSend}
              />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
