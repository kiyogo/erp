'use client';

import React, { memo, useMemo } from 'react';
import { cn } from '../utils';
import { Check, Download, Eye, FileArchive, FileText, MoreHorizontal, Reply, RotateCcw, Smile } from 'lucide-react';
import { getAttachmentUrl, isViewable, getInitials } from '../chat-helpers';
import { Avatar } from './chat-components';
import { VideoRenderer } from './video-renderer';
import type { ChatMember } from '../chat-page-types';
import type { ChatMessage } from '../chat-types';

export const MessageItem = memo(({
  message,
  compact,
  member,
  index,
  onProfileOpen,
  onReply,
  onEmoji,
  isMentioned,
  onAttachmentClick,
  onResend,
  updateMessage,
  parentMessage,
  isEmojiPickerOpen,
  theme,
  userId
}: {
  message: ChatMessage;
  compact: boolean;
  member: ChatMember;
  index: number;
  onProfileOpen: (member: ChatMember, target: HTMLElement) => void;
  onReply?: (messageId: string) => void;
  onEmoji?: (messageId: string, target: HTMLElement | string) => void;
  isMentioned?: boolean;
  onAttachmentClick?: (url: string, type?: string, name?: string, size?: number, thumbnail?: string, metadata?: any) => void;
  onResend?: (link: string) => void;
  updateMessage?: (message: ChatMessage) => void;
  parentMessage?: ChatMessage;
  isEmojiPickerOpen?: boolean;
  theme: string;
  userId?: string;
}) => {
  const tiktokLink = message.attachments?.[0]?.metadata?.originalUrl;
  const parentName = parentMessage?.user?.profile?.fullName || parentMessage?.user?.fullName || parentMessage?.user?.email || '...';

  const groupedReactions = useMemo(() => {
    const groups: Record<string, { count: number; me: boolean; users: string[] }> = {};
    (message.reactions || []).forEach(r => {
      if (!groups[r.emoji]) {
        groups[r.emoji] = { count: 0, me: false, users: [] };
      }
      groups[r.emoji].count++;
      groups[r.emoji].users.push(r.userId);
      if (r.userId === userId) {
        groups[r.emoji].me = true;
      }
    });
    return Object.entries(groups).slice(0, 10);
  }, [message.reactions, userId]);

  const parentMember: ChatMember | null = parentMessage ? {
    id: parentMessage.userId,
    name: parentName,
    username: parentMessage.user?.email || parentMessage.userId,
    email: parentMessage.user?.email,
    roleGroup: 'member',
    presence: 'online',
    color: parentMessage.user?.profile?.themeColor || 'var(--chat-primary, #5865f2)',
    avatarUrl: parentMessage.user?.profile?.avatarUrl,
    badges: [],
    roles: [],
    permissions: [],
    status: ''
  } : null;

  return (
    <div
      className={cn(
        'group relative flex flex-col w-full transition-colors hover:bg-[var(--chat-hover)]',
        compact ? '' : 'mt-[14px]',
        isMentioned && 'bg-[#40351f] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-[#f0b232]',
        isEmojiPickerOpen && 'bg-[var(--chat-hover)]'
      )}
      style={{ paddingTop: compact ? '1px' : '2px', paddingBottom: compact ? '1px' : '2px' }}
    >
      {parentMessage && (
        <div className="flex items-center gap-1 ml-[52px] mb-0.5 relative group/reply cursor-pointer select-none h-[22px]">
          {/* Connecting line */}
          <div
            className="absolute -left-[22px] top-[10px] w-[22px] h-[10px] border-l-2 border-t-2 border-[#4e5058] dark:border-[#4e5058] rounded-tl-[6px] pointer-events-none opacity-40"
          />

          <Avatar
            name={parentName}
            color={parentMessage.user?.profile?.themeColor || '#5865f2'}
            src={parentMessage.user?.profile?.avatarUrl}
            size="xs"
          />

          <span
            className="text-[14px] font-semibold text-[var(--chat-text-muted)] hover:text-[var(--chat-text-main)] hover:underline shrink-0 flex items-center cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (parentMember) onProfileOpen(parentMember, e.currentTarget);
            }}
          >
            @{parentName}
          </span>

          <span className="text-[14px] text-[var(--chat-text-muted)] truncate max-w-[400px] ml-0.5">
            {parentMessage.content || (parentMessage.attachments?.length ? 'Tệp đính kèm' : '...')}
          </span>
        </div>
      )}

      <div className="flex items-start gap-3 px-3 w-full relative">
        {/* Hover Actions Bar */}
        <div
          className={cn(
            "absolute -top-4 right-4 z-20 items-center rounded-[6px] shadow-sm px-1 py-0.5 border",
            theme === 'light'
              ? "bg-white border-black/10 shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
              : "bg-[#313338] border-black/20 shadow-[0_2px_8px_rgba(0,0,0,0.4)]",
            isEmojiPickerOpen ? "flex" : "hidden group-hover:flex"
          )}
          style={{
            display: isEmojiPickerOpen ? 'flex' : undefined,
            alignItems: 'center',
            gap: '2px'
          }}
        >
          {tiktokLink && (
            <button
              className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded transition-colors text-[var(--chat-primary)] cursor-pointer border-none bg-transparent"
              onClick={() => onResend?.(tiktokLink)}
              title="Gửi lại video này"
              type="button"
            >
              <RotateCcw className="size-4" />
            </button>
          )}
          <button
            className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded transition-colors text-[var(--chat-text-muted)] hover:text-[var(--chat-text-main)] cursor-pointer border-none bg-transparent"
            onClick={(e) => onEmoji?.(message.id, e.currentTarget)}
            title="Thêm biểu cảm"
            type="button"
          >
            <Smile className="size-4" />
          </button>
          <button
            className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded transition-colors text-[var(--chat-text-muted)] hover:text-[var(--chat-text-main)] cursor-pointer border-none bg-transparent"
            onClick={() => onReply?.(message.id)}
            title="Trả lời"
            type="button"
          >
            <Reply className="size-4" />
          </button>
          <button
            className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded transition-colors text-[var(--chat-text-muted)] hover:text-[var(--chat-text-main)] cursor-pointer border-none bg-transparent"
            title="Thêm"
            type="button"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </div>

        <div className="flex w-10 shrink-0 flex-col items-center justify-start pt-[1px]">
          {!compact ? (
            <div className="cursor-pointer transition-transform hover:scale-105" onClick={(e) => { e.stopPropagation(); onProfileOpen(member, e.currentTarget); }}>
              <Avatar name={member.name} color={member.color} presence={member.presence} src={member.avatarUrl} size="md" />
            </div>
          ) : (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity w-full text-center">
              <span className="text-[10px] text-[var(--chat-text-muted)] font-medium leading-none">
                {message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden min-w-0">
          {!compact && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <div className="flex items-center gap-1.5 overflow-hidden">
                <span
                  className="text-[15px] font-semibold leading-[18px] hover:underline cursor-pointer truncate shrink-0 text-[var(--chat-text-main)]"
                  style={{ color: member.color || 'var(--chat-text-main)' }}
                  onClick={(e) => { e.stopPropagation(); onProfileOpen(member, e.currentTarget); }}
                >
                  {member.name}
                </span>
                {member.id === 'system' && (
                  <span className="px-1 rounded bg-[#5865f2] text-[10px] font-bold text-white flex items-center gap-0.5 h-4 shrink-0 uppercase">
                    <Check className="size-2.5" /> APP
                  </span>
                )}
              </div>
              <span className="text-[12px] font-medium text-[var(--chat-text-muted)] shrink-0">
                {message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}
              </span>
            </div>
          )}
          <div className="text-[15px] leading-relaxed text-[var(--chat-text-main)] break-words whitespace-pre-wrap">
            {message.content?.startsWith('[TikTok]') ? (
              <>
                <span className="inline-flex items-center px-1 py-0 rounded-[3px] bg-black text-white text-[8px] font-bold mr-1.5 tracking-tighter shadow-sm select-none align-middle">
                  TIKTOK
                </span>
                {message.content.replace('[TikTok]', '').split('\n👤')[0].trim()}
              </>
            ) : message.content}
          </div>

          {/* Attachments rendering */}
          {message.attachments && Array.isArray(message.attachments) && message.attachments.length > 0 && (
            (() => {
              const imageAttachments = message.attachments.filter((f: any) => {
                const u = getAttachmentUrl(f.url);
                return f.type?.startsWith('image/') || u.match(/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i);
              });
              const multiImage = imageAttachments.length >= 2;
              return (
                <div className={cn("mt-2", multiImage ? "grid grid-cols-2 gap-1.5 max-w-[400px]" : "flex flex-row flex-wrap gap-1.5")}>
                  {message.attachments.map((file: any, i: number) => {
                    const url = getAttachmentUrl(file.url);
                    const isImage = file.type?.startsWith('image/') || url.match(/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i);
                    const isVideo = file.type?.startsWith('video') || url.match(/\.(mp4|webm|mov|ogg)$/i) || file.metadata?.provider === 'tiktok';
                    const isText = file.type === 'text/plain' || url.match(/\.(txt|md|js|ts|json|py|cpp|c|h|css|html|lua)$/i);

                    if (isImage) {
                      return (
                        <div key={i} className={cn("relative group overflow-hidden rounded-md border border-[var(--chat-border)] bg-[var(--chat-panel)]", multiImage ? "aspect-[1/1] w-full" : "w-fit max-w-[400px] shadow-sm mb-[5px]")}>
                          <div className="img-skeleton absolute inset-0 bg-[#2b2d31] animate-pulse z-10" />
                          <img
                            src={url}
                            alt={file.name}
                            className={cn("cursor-pointer hover:brightness-95 transition-opacity opacity-0", multiImage ? "w-full h-full object-cover" : "max-h-[300px] w-auto object-contain")}
                            onLoad={(e) => {
                              e.currentTarget.classList.remove('opacity-0');
                              const skeleton = e.currentTarget.previousElementSibling;
                              if (skeleton) skeleton.remove();
                            }}
                            onError={(e) => {
                              const img = e.currentTarget;
                              img.style.display = 'none';
                              const skeleton = img.previousElementSibling;
                              if (skeleton) skeleton.remove();
                            }}
                            onClick={() => onAttachmentClick?.(url, file.type, file.name, file.size, file.thumbnail, file.metadata)}
                          />
                          {file.progress !== undefined && file.progress < 100 && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20 z-10">
                              <div
                                className="h-full bg-[#5865f2] transition-all duration-300"
                                style={{ width: `${file.progress}%` }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    }
                    if (isVideo) {
                      return (
                        <div key={i} className="mb-[5px]">
                          <VideoRenderer
                            src={getAttachmentUrl(file.url)}
                            poster={file.thumbnail ? getAttachmentUrl(file.thumbnail) : undefined}
                            compact={true}
                            metadata={{ ...file.metadata, messageId: message?.id, attachmentIndex: i }}
                            onClose={() => onAttachmentClick?.(getAttachmentUrl(file.url), file.type, file.name, file.size, file.thumbnail, file.metadata)}
                          />
                        </div>
                      );
                    }

                    return (
                      <div key={i} className={cn(
                        "relative h-[64px] w-[320px] rounded-[4px] p-2 flex items-center shrink-0 shadow-sm border mb-[5px] group/file transition-colors",
                        theme === 'light' ? "bg-[#f2f3f5] border-black/5" : "bg-[#2b2d31] border-white/5"
                      )}>
                        <div className="flex items-center gap-3 w-full">
                          <div className="bg-[#5865f2] rounded size-10 flex items-center justify-center shrink-0">
                            {file.name.match(/\.(zip|rar|7z|tar|gz)$/i) ? (
                              <FileArchive className="size-6 text-white" />
                            ) : (
                              <FileText className="size-6 text-white" />
                            )}
                          </div>
                          <div className="flex flex-col min-w-0 flex-1 justify-center overflow-hidden">
                            <span className={cn(
                              "text-[13px] font-semibold truncate leading-tight",
                              theme === 'light' ? "text-black" : "text-white"
                            )}>
                              {file.name}
                            </span>
                            <span className="text-[#949ba4] text-[11px] whitespace-nowrap leading-tight">
                              {file.size ? (file.size / 1024 < 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`) : '...'}
                            </span>
                          </div>

                          <div className="flex items-center gap-0.5 opacity-0 group-hover/file:opacity-100 transition-opacity shrink-0">
                            {isViewable(file.name, file.type) && (
                              <button
                                onClick={() => onAttachmentClick?.(url, file.type, file.name, file.size, file.thumbnail, file.metadata)}
                                className="p-1.5 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-main)] hover:bg-[var(--chat-hover)] rounded-md transition-colors cursor-pointer border-none bg-transparent"
                                title="Xem"
                                type="button"
                              >
                                <Eye className="size-5" />
                              </button>
                            )}
                            <a
                              href={url}
                              download={file.name}
                              className="p-1.5 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-main)] hover:bg-[var(--chat-hover)] rounded-md transition-colors"
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Tải xuống"
                            >
                              <Download className="size-5" />
                            </a>
                          </div>
                        </div>

                        {file.progress !== undefined && file.progress < 100 && (
                          <div className="absolute bottom-0 left-0 right-0 h-[4px] overflow-hidden rounded-b-[4px]">
                            <div className={cn("absolute inset-0", theme === 'light' ? "bg-black/10" : "bg-[#1e1f22]")} />
                            <div
                              className="absolute inset-y-0 left-0 bg-[#5865f2] transition-all duration-300 ease-out"
                              style={{ width: `${file.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}

          {/* Reactions */}
          {groupedReactions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
              {groupedReactions.map(([emoji, data]) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onEmoji?.(message.id, emoji)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-0.5 rounded-[8px] border transition-all text-[13px] font-bold group/reaction relative h-[24px] cursor-pointer",
                    data.me
                      ? (theme === 'light' ? "bg-[#e3e5e8] border-[#5865f2] text-[#5865f2]" : "bg-[rgba(88,101,242,0.15)] border-[#5865f2] text-[#5865f2]")
                      : (theme === 'light' ? "bg-[#f2f3f5] border-transparent hover:border-black/10 text-[#2e3338]" : "bg-[#2b2d31] border-transparent hover:border-[#4e5058] text-[#b5bac1]")
                  )}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '2px 8px',
                    borderRadius: '8px',
                    height: '24px',
                    border: data.me ? '1px solid #5865f2' : '1px solid transparent',
                    backgroundColor: data.me ? (theme === 'light' ? '#e3e5e8' : 'rgba(88,101,242,0.15)') : (theme === 'light' ? '#f2f3f5' : '#2b2d31'),
                    color: data.me ? '#5865f2' : (theme === 'light' ? '#2e3338' : '#b5bac1'),
                    cursor: 'pointer'
                  }}
                >
                  <span className="text-[14px]">{emoji}</span>
                  <span className={cn("text-[12px]", data.me ? "text-[#5865f2]" : "text-[#949ba4]")}>{data.count}</span>
                </button>
              ))}

              <button
                type="button"
                onClick={(e) => onEmoji?.(message.id, e.currentTarget)}
                className={cn(
                  "flex items-center justify-center h-[24px] w-[32px] rounded-[8px] transition-all border border-transparent cursor-pointer",
                  theme === 'light' ? "bg-[#f2f3f5] hover:border-black/10 text-[#2e3338]" : "bg-[#2b2d31] hover:border-[#4e5058] text-[#b5bac1]"
                )}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '24px',
                  width: '32px',
                  borderRadius: '8px',
                  border: '1px solid transparent',
                  backgroundColor: theme === 'light' ? '#f2f3f5' : '#2b2d31',
                  color: theme === 'light' ? '#2e3338' : '#b5bac1',
                  cursor: 'pointer'
                }}
                title="Thêm biểu cảm"
              >
                <Smile className="size-[15px]" style={{ width: '15px', height: '15px' }} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
MessageItem.displayName = 'MessageItem';
