'use client';

import React, { useState } from 'react';
import { Mic, MicOff, Headphones, Settings } from 'lucide-react';
import { cn } from '../utils';
import { Avatar } from './chat-components';
import { useAuthStore } from '../auth-store';

interface ChatUserBarProps {
  onOpenSettings: () => void;
  onOpenProfile?: (e: React.MouseEvent) => void;
}

export function ChatUserBar({ onOpenSettings, onOpenProfile }: ChatUserBarProps) {
  const { user } = useAuthStore();
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  const displayName = user?.fullName || 'Nguyễn Huy Tùng';
  const displayEmail = user?.email || 'tung.nh@kiyovn.enterprise';

  return (
    <div
      className="chat-user-bar select-none"
      style={{
        height: '52px',
        minHeight: '52px',
        maxHeight: '52px',
        width: '100%',
        backgroundColor: '#232428',
        padding: '0 8px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTop: '1px solid #1f2023',
        flexShrink: 0,
        boxSizing: 'border-box',
        zIndex: 10,
      }}
    >
      {/* User Profile Button */}
      <button
        type="button"
        onClick={onOpenProfile}
        title="Hồ sơ người dùng"
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '8px',
          padding: '4px',
          marginLeft: '-4px',
          borderRadius: '4px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          maxWidth: '124px',
          minWidth: 0,
          textAlign: 'left',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#35373c')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <Avatar
          name={displayName}
          src={user?.avatarUrl}
          presence="online"
          size="sm"
        />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#dbdee1',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'block',
              lineHeight: 1.2,
            }}
          >
            {displayName}
          </span>
          <span
            style={{
              fontSize: '11px',
              color: '#949ba4',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'block',
              lineHeight: 1.2,
            }}
          >
            {displayEmail}
          </span>
        </div>
      </button>

      {/* Action Buttons: Mic, Deafen, Settings */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '2px' }}>
        <button
          type="button"
          onClick={() => setIsMuted(!isMuted)}
          title={isMuted ? 'Bật mic' : 'Tắt mic'}
          style={{
            padding: '6px',
            borderRadius: '4px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: isMuted ? '#f23f43' : '#b5bac1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#35373c')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          {isMuted ? <MicOff style={{ width: '16px', height: '16px' }} /> : <Mic style={{ width: '16px', height: '16px' }} />}
        </button>

        <button
          type="button"
          onClick={() => setIsDeafened(!isDeafened)}
          title={isDeafened ? 'Bật âm thanh' : 'Tắt âm thanh'}
          style={{
            padding: '6px',
            borderRadius: '4px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: isDeafened ? '#f23f43' : '#b5bac1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#35373c')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <Headphones style={{ width: '16px', height: '16px' }} />
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          title="Cài đặt người dùng"
          style={{
            padding: '6px',
            borderRadius: '4px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#b5bac1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#35373c')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <Settings style={{ width: '16px', height: '16px' }} />
        </button>
      </div>
    </div>
  );
}
