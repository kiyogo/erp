'use client';

import React, { memo, useEffect, useState } from 'react';
import { Home, ChevronDown, Plus, Search } from 'lucide-react';
import { cn } from '../utils';
import { useChatStore } from '../chat-store';
import { fetchChatChannels, fetchChatServers, fetchDirectMessages, fetchChatServerConfig } from '../chat-api';

interface ChatSidebarProps {
  activeServerId: string | null;
  activeChannelId: string | null;
  onServerClick: (id: string) => void;
  onChannelClick: (id: string) => void;
}

export const ChatSidebar = memo(function ChatSidebar({
  activeServerId, activeChannelId, onServerClick, onChannelClick
}: ChatSidebarProps) {
  const [servers, setServers] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [dms, setDms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Load servers + channels + DMs một lần duy nhất
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sRes, dRes] = await Promise.all([fetchChatServers(), fetchDirectMessages()]);
        if (cancelled) return;
        if (sRes.success) setServers(sRes.data || []);
        if (dRes.success) setDms(dRes.data || []);
      } catch {}
      try {
        const cRes = await fetchChatChannels();
        if (!cancelled && cRes.success) setChannels(cRes.data || []);
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // servers + channels từ config fallback
  useEffect(() => {
    if (!loading && servers.length === 0) {
      fetchChatServerConfig().then(r => {
        if (r.success && r.data) setServers(r.data);
      }).catch(() => {});
    }
  }, [loading, servers.length]);

  return (
    <>
      {/* Server Sidebar */}
      <div className="flex w-[72px] flex-col gap-2 bg-[var(--chat-sidebar-servers)] border-r border-[var(--chat-border)] py-3 shrink-0 overflow-y-auto">
        <ServerIcon
          active={activeServerId === 'home'}
          onClick={() => onServerClick('home')}
        />
        {servers.map(server => (
          <ServerIcon
            key={server.id}
            server={server}
            active={activeServerId === server.id}
            onClick={() => onServerClick(server.id)}
          />
        ))}
      </div>

      {/* Channel Sidebar */}
      <div className="flex w-[290px] flex-col bg-[var(--chat-sidebar-channels)] shrink-0 border-r border-[var(--chat-border)] overflow-y-auto">
        <div className="flex h-12 items-center px-4 border-b border-[var(--chat-border)]">
          {activeServerId === 'home' ? (
            <Search className="size-4 text-[var(--chat-text-muted)]" />
          ) : (
            <span className="font-bold truncate text-[var(--chat-text-main)]">
              {servers.find(s => s.id === activeServerId)?.name || 'Máy chủ'}
            </span>
          )}
        </div>

        {activeServerId === 'home' ? (
          // DM List
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {dms.map((dm: any) => {
              const name = dm?.name || 'Tin nhắn riêng';
              return (
                <button
                  key={dm.id}
                  onClick={() => onChannelClick(dm.id)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded text-sm truncate",
                    activeChannelId === dm.id
                      ? "bg-[var(--chat-selected)] text-[var(--chat-text-main)] font-bold"
                      : "text-[var(--chat-text-secondary)] hover:bg-[var(--chat-hover)]"
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        ) : (
          // Guild Channels
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {channels
              .filter(c => c.server_id === activeServerId)
              .map(ch => (
                <button
                  key={ch.id}
                  onClick={() => onChannelClick(ch.id)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded text-sm truncate",
                    activeChannelId === ch.id
                      ? "bg-[var(--chat-selected)] text-[var(--chat-text-main)] font-bold"
                      : "text-[var(--chat-text-secondary)] hover:bg-[var(--chat-hover)]"
                  )}
                >
                  # {ch.name}
                </button>
              ))}
          </div>
        )}
      </div>
    </>
  );
});

function ServerIcon({ server, active, onClick }: { server?: any; active: boolean; onClick: () => void }) {
  const name = server?.name || 'Home';
  const shortName = server?.shortName || name?.slice(0, 2).toUpperCase() || 'HM';
  const color = server?.color || '#5865f2';

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative group flex items-center justify-center mx-auto w-12 h-12 rounded-2xl transition-all duration-200 hover:rounded-xl",
        active ? "rounded-xl" : "hover:rounded-xl"
      )}
      style={{ backgroundColor: active ? color : 'transparent' }}
      title={name}
    >
      {active && <span className="absolute -left-3 w-1 h-10 rounded-r-full bg-white" />}
      <span className="text-white font-bold text-lg">{shortName}</span>
    </button>
  );
}
