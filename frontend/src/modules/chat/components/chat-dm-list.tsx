'use client';

import React from 'react';
import { Users, Plus, X, Search } from 'lucide-react';
import { cn } from '../utils';
import { Avatar } from './chat-components';
import { ChatUserBar } from './chat-user-bar';

interface ChatDmListProps {
  directMessages: any[];
  activeChannelId: string | null;
  onSelectDM: (channelId: string) => void;
  onOpenNewDM: () => void;
  onOpenSettings: () => void;
  onOpenProfile?: (e: React.MouseEvent) => void;
  onCloseDM?: (e: React.MouseEvent, channelId: string) => void;
  isMobile?: boolean;
}

export function ChatDmList({
  directMessages = [],
  activeChannelId,
  onSelectDM,
  onOpenNewDM,
  onOpenSettings,
  onOpenProfile,
  onCloseDM,
  isMobile,
}: ChatDmListProps) {
  return (
    <div
      className="chat-channel-sidebar select-none"
      style={{
        width: '240px',
        minWidth: '240px',
        maxWidth: '240px',
        backgroundColor: '#2b2d31',
        borderRight: '1px solid #1f2023',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      {/* Top Search Button */}
      <div
        style={{
          height: '48px',
          minHeight: '48px',
          maxHeight: '48px',
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid #1f2023',
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button"
          onClick={onOpenNewDM}
          style={{
            width: '100%',
            height: '28px',
            padding: '0 8px',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#1e1f22',
            color: '#949ba4',
            borderRadius: '4px',
            fontSize: '13px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Tìm hoặc bắt đầu trò chuyện
          </span>
          <Search style={{ width: '14px', height: '14px', flexShrink: 0 }} />
        </button>
      </div>

      {/* DM Scroll Area */}
      <div
        className="custom-scrollbar"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          boxSizing: 'border-box',
        }}
      >
        {/* Friends Tab */}
        <button
          type="button"
          onClick={() => onSelectDM('friends')}
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: 500,
            backgroundColor: activeChannelId === 'friends' || !activeChannelId ? '#404249' : 'transparent',
            color: activeChannelId === 'friends' || !activeChannelId ? '#ffffff' : '#949ba4',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            boxSizing: 'border-box',
          }}
        >
          <Users style={{ width: '20px', height: '20px', color: '#b5bac1' }} />
          <span>Bạn bè</span>
        </button>

        {/* DIRECT MESSAGES Category Header */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 8px 4px 8px',
            fontSize: '12px',
            fontWeight: 700,
            color: '#949ba4',
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
          }}
        >
          <span>Tin nhắn trực tiếp</span>
          <button
            type="button"
            onClick={onOpenNewDM}
            title="Tạo tin nhắn trực tiếp"
            style={{
              color: '#949ba4',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Plus style={{ width: '16px', height: '16px' }} />
          </button>
        </div>

        {/* DM Items List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {(directMessages || []).map((dm) => {
            const isActive = activeChannelId === dm.id;
            const userObj = dm.recipient || dm.user || {};
            const profile = userObj.profile || {};
            const recipientName = userObj.name || profile.fullName || dm.name || 'Thành viên';
            const recipientAvatar = userObj.avatarUrl || profile.avatarUrl || null;
            const recipientPresence = userObj.presence || 'online';

            return (
              <button
                key={dm.id}
                type="button"
                className="chat-member-row group"
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  backgroundColor: isActive ? '#404249' : 'transparent',
                  color: isActive ? '#ffffff' : '#949ba4',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  boxSizing: 'border-box',
                }}
                onClick={() => onSelectDM(dm.id)}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = '#35373c';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
                  <Avatar
                    name={recipientName}
                    src={recipientAvatar}
                    presence={recipientPresence}
                    size="sm"
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                    <span
                      style={{
                        fontSize: '13.5px',
                        fontWeight: 500,
                        color: isActive ? '#ffffff' : '#dbdee1',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {recipientName}
                    </span>
                    {dm.activityText && (
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#949ba4',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {dm.activityText}
                      </span>
                    )}
                  </div>
                </div>

                {onCloseDM && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseDM(e, dm.id);
                    }}
                    style={{
                      padding: '4px',
                      borderRadius: '4px',
                      color: '#949ba4',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title="Đóng cuộc trò chuyện"
                  >
                    <X style={{ width: '14px', height: '14px' }} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* User Status Bar at Bottom */}
      <ChatUserBar
        onOpenSettings={onOpenSettings}
        onOpenProfile={onOpenProfile}
      />
    </div>
  );
}
