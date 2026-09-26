'use client';

import React from 'react';
import { cn } from '../utils';
import { MessageCircle } from 'lucide-react';
import { getAttachmentUrl, getInitials, PRESENCE_STYLE } from '../chat-helpers';
import type { Presence } from '../chat-page-types';

export function Avatar({
  name,
  color,
  presence,
  src,
  size = 'md',
  className
}: {
  name: string;
  color?: string;
  presence?: Presence;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClass = size === 'lg' ? 'size-20 text-xl' : size === 'sm' ? 'size-8 text-xs' : size === 'xs' ? 'size-4 text-[8px]' : 'size-10 text-sm';
  
  // Tránh để màu trắng làm màu nền avatar trong dark mode (gây hiện tượng vòng tròn trắng xoá)
  const bgColor = (!color || color === 'var(--chat-text-main)' || color === '#ffffff' || color === 'white')
    ? '#5865f2'
    : color;

  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center rounded-full font-bold select-none overflow-visible', sizeClass, className)}
      style={{
        background: bgColor,
        color: bgColor === 'transparent' ? 'var(--chat-text-main)' : '#ffffff'
      }}
    >
      {src ? (
        <img
          src={getAttachmentUrl(src)}
          alt={name || 'Avatar'}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        getInitials(name || 'U')
      )}
      {presence ? (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full border-[2.5px] border-[var(--chat-panel)]',
            size === 'xs' ? 'size-2' : size === 'sm' ? 'size-3' : size === 'lg' ? 'size-5 border-[4px]' : 'size-3.5',
            PRESENCE_STYLE[presence]
          )}
        />
      ) : null}
    </span>
  );
}

export function HomeIcon({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      className="group relative flex h-12 w-full items-center justify-center focus:outline-none cursor-pointer border-none bg-transparent p-0 shrink-0"
      style={{ height: '48px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
      onClick={onClick}
      title="Tin nhắn riêng"
      type="button"
    >
      <span
        className={cn(
          'absolute left-0 w-1 rounded-r-full transition-all duration-300 ease-in-out top-1/2 -translate-y-1/2',
          active
            ? 'h-10 bg-[var(--chat-text-main)] translate-x-0 opacity-100'
            : 'h-5 bg-[var(--chat-text-main)] -translate-x-full group-hover:translate-x-0 opacity-80'
        )}
      />
      <span
        className={cn(
          'flex size-12 items-center justify-center transition-all duration-200 shadow-sm',
          active
            ? 'rounded-[14px] bg-[var(--chat-primary)] text-white'
            : 'rounded-[24px] bg-[var(--chat-panel)] text-[var(--chat-text-main)] group-hover:rounded-[14px] group-hover:bg-[var(--chat-primary)] group-hover:text-white'
        )}
        style={{
          width: '48px',
          height: '48px',
          minWidth: '48px',
          minHeight: '48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: active ? '14px' : '24px',
          backgroundColor: active ? 'var(--chat-primary, #5865f2)' : 'var(--chat-panel, #ffffff)',
          color: active ? '#ffffff' : 'var(--chat-text-main, #060607)'
        }}
      >
        <MessageCircle className="size-6" style={{ width: '24px', height: '24px' }} />
      </span>
    </button>
  );
}

export function ServerIcon({ server, active, onClick }: { server: any; active: boolean; onClick: () => void }) {
  return (
    <button
      className="group relative flex h-12 w-full items-center justify-center focus:outline-none cursor-pointer border-none bg-transparent p-0 shrink-0"
      style={{ height: '48px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
      onClick={onClick}
      title={server.name}
      type="button"
    >
      <span
        className={cn(
          'absolute left-0 w-1 rounded-r-full transition-all duration-300 ease-in-out top-1/2 -translate-y-1/2',
          active
            ? 'h-10 bg-[var(--chat-text-main)] translate-x-0 opacity-100'
            : 'h-5 bg-[var(--chat-text-main)] -translate-x-full group-hover:translate-x-0 opacity-80'
        )}
      />
      <span
        className={cn(
          'flex size-12 items-center justify-center overflow-hidden text-[15px] font-bold shadow-sm transition-all duration-200',
          active
            ? 'rounded-[14px] bg-[var(--chat-primary)] text-white'
            : 'rounded-[24px] bg-[var(--chat-hover)] text-[var(--chat-text-main)] group-hover:rounded-[14px] group-hover:bg-[var(--chat-primary)] group-hover:text-white'
        )}
        style={{
          width: '48px',
          height: '48px',
          minWidth: '48px',
          minHeight: '48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: active ? '14px' : '24px',
          background: server.icon ? undefined : active ? (server.color || 'var(--chat-primary, #5865f2)') : 'var(--chat-panel, #ffffff)',
          color: active ? '#ffffff' : 'var(--chat-text-main, #060607)',
          overflow: 'hidden'
        }}
      >
        {server.icon ? (
          <img src={server.icon} alt={server.name} className="h-full w-full object-cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          getInitials(server.name)
        )}
      </span>
    </button>
  );
}
