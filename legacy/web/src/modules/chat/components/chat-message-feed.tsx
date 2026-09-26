'use client';

import React, { useRef, useEffect } from 'react';
import { Hash, AtSign } from 'lucide-react';
import { MessageItem } from './chat-message-item';
import type { ChatMessage } from '../chat-types';
import type { ChatMember } from '../chat-page-types';

interface ChatMessageFeedProps {
  messages: ChatMessage[];
  channelName: string;
  isDM?: boolean;
  topic?: string;
  members: ChatMember[];
  onProfileOpen: (member: ChatMember, target: HTMLElement | { x: number; y: number }) => void;
  onReply: (messageId: string) => void;
  onEmoji: (messageId: string, target: HTMLElement | string) => void;
  onAttachmentClick: (url: string, type: string, name: string, size?: number) => void;
  onResend?: (link: string) => void;
  updateMessage?: (msg: ChatMessage) => void;
  isLoading?: boolean;
}

export function ChatMessageFeed({
  messages = [],
  channelName,
  isDM,
  topic,
  members = [],
  onProfileOpen,
  onReply,
  onEmoji,
  onAttachmentClick,
  onResend,
  updateMessage,
  isLoading,
}: ChatMessageFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on message updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const memberMap = new Map<string, ChatMember>();
  const safeMembers = Array.isArray(members) ? members : [];
  safeMembers.forEach(m => memberMap.set(String(m.id || m.userId), m));

  const safeMessages = Array.isArray(messages) ? messages : [];

  return (
    <div
      ref={scrollRef}
      className="custom-scrollbar"
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        {/* Welcome Channel Banner */}
        <div style={{ marginBottom: '24px', paddingTop: '16px', paddingLeft: '8px', paddingRight: '8px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '9999px',
              backgroundColor: '#404249',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px',
            }}
          >
            {isDM ? (
              <AtSign style={{ width: '40px', height: '40px', color: '#ffffff' }} />
            ) : (
              <Hash style={{ width: '40px', height: '40px', color: '#ffffff' }} />
            )}
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff', margin: '0 0 8px 0', lineHeight: 1.2 }}>
            Chào mừng bạn đến với {isDM ? '' : '#'}{channelName}!
          </h1>
          <p style={{ fontSize: '14px', color: '#949ba4', margin: 0 }}>
            {topic || `Đây là khởi đầu của kênh ${isDM ? 'trò chuyện cùng' : '#'}${channelName}.`}
          </p>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#3f4147', marginTop: '20px' }} />
        </div>

        {/* Messages List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }}>
          {safeMessages.map((msg, index) => {
            const prevMsg = index > 0 ? safeMessages[index - 1] : null;
            const isCompact = Boolean(
              prevMsg &&
              (prevMsg.author?.id === msg.author?.id || prevMsg.userId === msg.userId) &&
              new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() < 5 * 60 * 1000
            );

            const msgAuthorId = String(msg.author?.id || msg.userId || '');
            const member = memberMap.get(msgAuthorId) || {
              id: msgAuthorId,
              name: msg.author?.name || 'Thành viên',
              avatarUrl: msg.author?.avatarUrl,
              roleGroup: 'member',
              presence: 'online',
              color: '#5865f2',
            };

            const parentMsg = msg.replyToId ? safeMessages.find(m => m.id === msg.replyToId) : undefined;

            return (
              <MessageItem
                key={msg.id || index}
                message={msg}
                compact={isCompact}
                member={member as any}
                index={index}
                onProfileOpen={onProfileOpen}
                onReply={onReply}
                onEmoji={onEmoji}
                onAttachmentClick={onAttachmentClick}
                onResend={onResend}
                updateMessage={updateMessage}
                parentMessage={parentMsg}
                theme="dark"
              />
            );
          })}
        </div>

        <div ref={bottomRef} style={{ height: '1px' }} />
      </div>
    </div>
  );
}
