'use client';

import React from 'react';
import { Hash, AtSign, Bell, BellOff, Pin, Users, Search, Menu, Inbox } from 'lucide-react';
import { cn } from '../utils';

interface ChatHeaderProps {
  channelName: string;
  isDM?: boolean;
  topic?: string;
  isMuted?: boolean;
  onToggleMute?: () => void;
  isMembersOpen: boolean;
  onToggleMembers: () => void;
  onToggleSidebarMobile?: () => void;
  isMobile?: boolean;
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
}

export function ChatHeader({
  channelName,
  isDM,
  topic,
  isMuted,
  onToggleMute,
  isMembersOpen,
  onToggleMembers,
  onToggleSidebarMobile,
  isMobile,
  searchQuery = '',
  onSearchChange,
}: ChatHeaderProps) {
  return (
    <header
      className="chat-header-bar select-none"
      style={{
        height: '48px',
        minHeight: '48px',
        maxHeight: '48px',
        padding: '0 16px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #1f2023',
        backgroundColor: '#313338',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        boxSizing: 'border-box',
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* Left: Channel Title & Topic */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
        {isMobile && (
          <button
            type="button"
            onClick={onToggleSidebarMobile}
            title="Mở menu"
            style={{
              padding: '4px',
              color: '#b5bac1',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Menu style={{ width: '20px', height: '20px' }} />
          </button>
        )}

        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
          {isDM ? (
            <AtSign style={{ width: '20px', height: '20px', color: '#80848e', flexShrink: 0 }} />
          ) : (
            <Hash style={{ width: '20px', height: '20px', color: '#80848e', flexShrink: 0 }} />
          )}
          <h2
            style={{
              fontWeight: 700,
              fontSize: '15px',
              color: '#f2f3f5',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.2,
            }}
          >
            {channelName}
          </h2>
        </div>

        {topic && (
          <>
            <div style={{ width: '1px', height: '16px', backgroundColor: '#3f4147', margin: '0 8px', flexShrink: 0 }} />
            <span
              style={{
                fontSize: '12.5px',
                color: '#949ba4',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {topic}
            </span>
          </>
        )}
      </div>

      {/* Right: Header Icons & Search */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <button
          type="button"
          onClick={onToggleMute}
          title={isMuted ? 'Bật thông báo' : 'Tắt thông báo'}
          style={{
            color: isMuted ? '#f23f43' : '#b5bac1',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {isMuted ? <BellOff style={{ width: '20px', height: '20px' }} /> : <Bell style={{ width: '20px', height: '20px' }} />}
        </button>

        <button
          type="button"
          title="Tin nhắn đã ghim"
          style={{
            color: '#b5bac1',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Pin style={{ width: '20px', height: '20px' }} />
        </button>

        <button
          type="button"
          onClick={onToggleMembers}
          title="Danh sách thành viên"
          style={{
            color: isMembersOpen ? '#5865f2' : '#b5bac1',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Users style={{ width: '20px', height: '20px' }} />
        </button>

        {/* Quick Search */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Tìm kiếm"
            value={searchQuery}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
            style={{
              width: '144px',
              height: '24px',
              padding: '0 24px 0 8px',
              backgroundColor: '#1e1f22',
              fontSize: '13px',
              color: '#dbdee1',
              borderRadius: '4px',
              border: 'none',
              outline: 'none',
            }}
          />
          <Search style={{ width: '14px', height: '14px', color: '#949ba4', position: 'absolute', right: '6px', pointerEvents: 'none' }} />
        </div>

        <button
          type="button"
          title="Hộp thư"
          style={{
            color: '#b5bac1',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Inbox style={{ width: '20px', height: '20px' }} />
        </button>
      </div>
    </header>
  );
}
