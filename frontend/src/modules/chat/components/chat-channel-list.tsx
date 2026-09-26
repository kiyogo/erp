'use client';

import React, { useState } from 'react';
import { ChevronDown, Hash, Volume2, Plus, ShieldCheck, ChevronRight } from 'lucide-react';
import { cn } from '../utils';
import { ChatUserBar } from './chat-user-bar';

interface ChatChannelListProps {
  server: any;
  channels: any[];
  activeChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  onOpenSettings: () => void;
  onOpenProfile?: (e: React.MouseEvent) => void;
  onOpenServerSettings?: () => void;
  isMobile?: boolean;
}

export function ChatChannelList({
  server,
  channels = [],
  activeChannelId,
  onSelectChannel,
  onOpenSettings,
  onOpenProfile,
  onOpenServerSettings,
  isMobile,
}: ChatChannelListProps) {
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const textChannels = (channels || []).filter(c => c.kind !== 'VOICE' && c.type !== 'voice');
  const voiceChannels = (channels || []).filter(c => c.kind === 'VOICE' || c.type === 'voice');

  const serverName = server?.name || 'KiyoVN Enterprise';

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
      {/* Server Header Dropdown */}
      <div
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
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
          boxSizing: 'border-box',
        }}
        onClick={onOpenServerSettings}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#35373c')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <ShieldCheck style={{ width: '16px', height: '16px', color: '#5865f2', flexShrink: 0 }} />
          <span
            style={{
              fontWeight: 700,
              fontSize: '15px',
              color: '#f2f3f5',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {serverName}
          </span>
        </div>
        <ChevronDown style={{ width: '16px', height: '16px', color: '#949ba4', flexShrink: 0 }} />
      </div>

      {/* Server Banner (if available) */}
      {server?.banner && (
        <div style={{ height: '100px', width: '100%', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
          <img
            src={server.banner}
            alt="Banner"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      )}

      {/* Channel Tree Scroll Area */}
      <div
        className="custom-scrollbar"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxSizing: 'border-box',
        }}
      >
        {/* 1. TEXT CHANNELS CATEGORY */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div
            onClick={() => toggleCategory('text')}
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 8px',
              fontSize: '12px',
              fontWeight: 700,
              color: '#949ba4',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {collapsedCategories['text'] ? (
                <ChevronRight style={{ width: '12px', height: '12px' }} />
              ) : (
                <ChevronDown style={{ width: '12px', height: '12px' }} />
              )}
              <span>Kênh Chat Nội Bộ</span>
            </div>
            <Plus style={{ width: '14px', height: '14px', opacity: 0.6 }} />
          </div>

          {!collapsedCategories['text'] && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
              {textChannels.map((channel) => {
                const isActive = activeChannelId === channel.id;
                return (
                  <button
                    key={channel.id}
                    type="button"
                    className={cn("chat-channel-row", isActive && "is-active")}
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      fontSize: '14px',
                      fontWeight: 500,
                      background: isActive ? '#404249' : 'transparent',
                      color: isActive ? '#ffffff' : '#949ba4',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      boxSizing: 'border-box',
                    }}
                    onClick={() => onSelectChannel(channel.id)}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = '#35373c';
                        e.currentTarget.style.color = '#dbdee1';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = '#949ba4';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                      <Hash style={{ width: '16px', height: '16px', color: isActive ? '#ffffff' : '#80848e', flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {channel.name}
                      </span>
                    </div>
                    {channel.unreadCount ? (
                      <span
                        style={{
                          backgroundColor: '#f23f43',
                          color: '#ffffff',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          padding: '1px 6px',
                          borderRadius: '9999px',
                        }}
                      >
                        {channel.unreadCount}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. VOICE CHANNELS CATEGORY */}
        {voiceChannels.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div
              onClick={() => toggleCategory('voice')}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 8px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#949ba4',
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {collapsedCategories['voice'] ? (
                  <ChevronRight style={{ width: '12px', height: '12px' }} />
                ) : (
                  <ChevronDown style={{ width: '12px', height: '12px' }} />
                )}
                <span>Kênh Đàm Thoại</span>
              </div>
              <Plus style={{ width: '14px', height: '14px', opacity: 0.6 }} />
            </div>

            {!collapsedCategories['voice'] && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                {voiceChannels.map((channel) => {
                  const isActive = activeChannelId === channel.id;
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      className={cn("chat-channel-row", isActive && "is-active")}
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        fontSize: '14px',
                        fontWeight: 500,
                        background: isActive ? '#404249' : 'transparent',
                        color: isActive ? '#ffffff' : '#949ba4',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        boxSizing: 'border-box',
                      }}
                      onClick={() => onSelectChannel(channel.id)}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = '#35373c';
                          e.currentTarget.style.color = '#dbdee1';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = '#949ba4';
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                        <Volume2 style={{ width: '16px', height: '16px', color: isActive ? '#ffffff' : '#80848e', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {channel.name}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* User Status Bar at Bottom */}
      <ChatUserBar
        onOpenSettings={onOpenSettings}
        onOpenProfile={onOpenProfile}
      />
    </div>
  );
}
