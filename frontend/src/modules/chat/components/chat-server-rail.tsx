'use client';

import React from 'react';
import { Plus, Compass } from 'lucide-react';
import { cn } from '../utils';
import { HomeIcon, ServerIcon } from './chat-components';

interface ChatServerRailProps {
  servers: any[];
  activeServerId: string | null;
  onSelectServer: (serverId: string) => void;
  onOpenExplore?: () => void;
  onAddServer?: () => void;
  isMobile?: boolean;
  isOpenMobile?: boolean;
}

export function ChatServerRail({
  servers = [],
  activeServerId,
  onSelectServer,
  onOpenExplore,
  onAddServer,
  isMobile,
  isOpenMobile,
}: ChatServerRailProps) {
  return (
    <aside
      className="chat-server-rail select-none"
      style={{
        width: '72px',
        minWidth: '72px',
        maxWidth: '72px',
        backgroundColor: '#1e1f22',
        borderRight: '1px solid #1f2023',
        height: '100%',
        padding: '12px 0',
        display: isMobile && !isOpenMobile ? 'none' : 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxSizing: 'border-box',
        gap: '8px',
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      {/* Home / Direct Messages (@me) */}
      <HomeIcon
        active={activeServerId === 'home' || activeServerId === '@me'}
        onClick={() => onSelectServer('@me')}
      />

      {/* Separator */}
      <div
        style={{
          width: '32px',
          height: '2px',
          backgroundColor: '#35373c',
          borderRadius: '99px',
          margin: '4px 0',
          flexShrink: 0,
        }}
      />

      {/* Scrollable Server List */}
      <div
        className="no-scrollbar"
        style={{
          flex: 1,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          overflowY: 'auto',
          padding: '2px 0',
        }}
      >
        {(servers || []).map((server) => (
          <ServerIcon
            key={server.id}
            server={server}
            active={activeServerId === server.id}
            onClick={() => onSelectServer(server.id)}
          />
        ))}

        {/* Add Server Button */}
        <button
          type="button"
          onClick={onAddServer}
          title="Thêm máy chủ"
          style={{
            width: '48px',
            height: '48px',
            minWidth: '48px',
            minHeight: '48px',
            borderRadius: '24px',
            backgroundColor: '#313338',
            color: '#23a55a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderRadius = '16px';
            e.currentTarget.style.backgroundColor = '#23a55a';
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderRadius = '24px';
            e.currentTarget.style.backgroundColor = '#313338';
            e.currentTarget.style.color = '#23a55a';
          }}
        >
          <Plus style={{ width: '24px', height: '24px' }} />
        </button>

        {/* Explore Discoverable Servers */}
        <button
          type="button"
          onClick={onOpenExplore}
          title="Khám phá máy chủ công khai"
          style={{
            width: '48px',
            height: '48px',
            minWidth: '48px',
            minHeight: '48px',
            borderRadius: '24px',
            backgroundColor: '#313338',
            color: '#5865f2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderRadius = '16px';
            e.currentTarget.style.backgroundColor = '#5865f2';
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderRadius = '24px';
            e.currentTarget.style.backgroundColor = '#313338';
            e.currentTarget.style.color = '#5865f2';
          }}
        >
          <Compass style={{ width: '24px', height: '24px' }} />
        </button>
      </div>
    </aside>
  );
}
