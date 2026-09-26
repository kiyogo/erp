'use client';

import { create } from 'zustand';
import type { ChatChannelSummary, ChatMessage } from './chat-types';

type ChatState = {
  servers: any[];
  channels: ChatChannelSummary[];
  directMessages: ChatChannelSummary[];
  activeServerId: string | 'home' | null;
  activeChannelId: string | null;
  lastActiveChannelIdByServerId: Record<string, string | null>;
  loadingServers: boolean;
  loadingChannels: boolean;
  loadingMessages: boolean;
  messagesByChannelId: Record<string, ChatMessage[]>;
  channelMembers: any[];
  hasMoreByChannelId: Record<string, boolean>;
  cursorByChannelId: Record<string, string | null>;

  setServers: (servers: any[]) => void;
  setChannels: (channels: ChatChannelSummary[]) => void;
  setDirectMessages: (dms: ChatChannelSummary[]) => void;
  setChannelMembers: (members: any[]) => void;
  setActiveServer: (serverId: string | 'home' | null) => void;
  setActiveChannel: (channelId: string | null) => void;
  setLoadingServers: (value: boolean) => void;
  setLoadingChannels: (value: boolean) => void;
  setLoadingMessages: (value: boolean) => void;
  setMessages: (channelId: string, messages: ChatMessage[], options?: { appendOlder?: boolean; cursor?: string | null; hasMore?: boolean }) => void;
  pushMessage: (channelId: string, message: ChatMessage) => void;
  updateMessage: (channelId: string, message: ChatMessage) => void;
  bumpChannelActivity: (channelId: string, payload?: { lastMessage?: { id: string; userId: string; content: string; createdAt: string } }) => void;
  clear: () => void;
};

const dedupeMessages = (items: ChatMessage[]) => {
  const seen = new Set<string>();
  const result: ChatMessage[] = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    result.push(item);
  }
  result.sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (at !== bt) {
      return at - bt;
    }
    return String(a.id).localeCompare(String(b.id));
  });
  return result;
};

import { persist, createJSONStorage } from 'zustand/middleware';

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      servers: [],
      channels: [],
      directMessages: [],
      activeServerId: 'home',
      activeChannelId: null,
      lastActiveChannelIdByServerId: {},
      loadingServers: false,
      loadingChannels: false,
      loadingMessages: false,
      messagesByChannelId: {},
      channelMembers: [],
      hasMoreByChannelId: {},
      cursorByChannelId: {},

      setServers: (servers) => set({ servers }),
      setChannels: (channels) => set({ channels }),
      setDirectMessages: (directMessages) => set({ directMessages }),
      setChannelMembers: (channelMembers) => set({ channelMembers }),
      setActiveServer: (activeServerId) => {
        const state = get();
        if (state.activeServerId === activeServerId) return;

        const lastChannelId = activeServerId ? state.lastActiveChannelIdByServerId[activeServerId] : null;
        set({ 
          activeServerId, 
          activeChannelId: lastChannelId ?? null,
          channels: [] // Clear channels to avoid stale data from previous server
        });
      },
      setActiveChannel: (activeChannelId) => {
        set((state) => {
          const nextLastActive = state.activeServerId ? {
            ...state.lastActiveChannelIdByServerId,
            [state.activeServerId]: activeChannelId
          } : state.lastActiveChannelIdByServerId;
          
          return {
            activeChannelId,
            lastActiveChannelIdByServerId: nextLastActive
          };
        });
      },
      setLoadingServers: (value) => set({ loadingServers: value }),
      setLoadingChannels: (value) => set({ loadingChannels: value }),
      setLoadingMessages: (value) => set({ loadingMessages: value }),

      setMessages: (channelId, messages, options) => {
        set((state) => {
          const existing = state.messagesByChannelId[channelId] ?? [];
          const merged = options?.appendOlder ? dedupeMessages([...messages, ...existing]) : dedupeMessages(messages);

          return {
            messagesByChannelId: {
              ...state.messagesByChannelId,
              [channelId]: merged
            },
            cursorByChannelId: {
              ...state.cursorByChannelId,
              [channelId]: typeof options?.cursor === 'string' ? options.cursor : state.cursorByChannelId[channelId] ?? null
            },
            hasMoreByChannelId: {
              ...state.hasMoreByChannelId,
              [channelId]: typeof options?.hasMore === 'boolean' ? options.hasMore : state.hasMoreByChannelId[channelId] ?? true
            }
          };
        });
      },

      pushMessage: (channelId, message) => {
        set((state) => {
          const existing = state.messagesByChannelId[channelId] ?? [];
          const merged = dedupeMessages([...existing, message]);
          return {
            messagesByChannelId: {
              ...state.messagesByChannelId,
              [channelId]: merged
            }
          };
        });
      },

      updateMessage: (channelId, message) => {
        set((state) => {
          const existing = state.messagesByChannelId[channelId] ?? [];
          const index = existing.findIndex((m) => m.id === message.id);
          if (index === -1) {
            return state;
          }

          const current = existing[index];
          // Version check: only update if incoming message is newer or same age (to handle race conditions in reactions)
          if (message.updatedAt && current?.updatedAt) {
            const incomingTime = new Date(message.updatedAt).getTime();
            const currentTime = new Date(current.updatedAt).getTime();
            
            if (incomingTime < currentTime) {
              console.warn(`[ChatStore] Ignoring stale update for msg ${message.id}: incoming=${incomingTime}, current=${currentTime}`);
              return state;
            }
          }

          console.log(`[ChatStore] Updating msg ${message.id}, reactions count: ${message.reactions?.length ?? 0}`);

          const next = [...existing];
          next[index] = { ...current, ...message };

          return {
            messagesByChannelId: {
              ...state.messagesByChannelId,
              [channelId]: next
            }
          };
        });
      },

      bumpChannelActivity: (channelId, payload = {}) => {
        set((state) => {
          const nextChannels = (state.channels || []).map((channel) => {
            if (channel.id !== channelId) return channel;
            const nextUnread = channel.membership ? channel.unreadCount + 1 : channel.unreadCount;
            return {
              ...channel,
              unreadCount: state.activeChannelId === channelId ? 0 : nextUnread,
              lastMessage: payload.lastMessage ?? channel.lastMessage
            };
          });

          const nextDms = (state.directMessages || []).map((dm) => {
            if (dm.id !== channelId) return dm;
            return {
              ...dm,
              unreadCount: state.activeChannelId === channelId ? 0 : dm.unreadCount + 1,
              lastMessage: payload.lastMessage ?? dm.lastMessage
            };
          });

          return { channels: nextChannels, directMessages: nextDms };
        });
      },

      clear: () => set({ 
        servers: [], 
        channels: [], 
        directMessages: [],
        activeServerId: 'home', 
        activeChannelId: null, 
        lastActiveChannelIdByServerId: {},
        messagesByChannelId: {}, 
        hasMoreByChannelId: {}, 
        cursorByChannelId: {} 
      })
    }),
    {
      name: 'enterprise-tax.chat.v2',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        const { activeServerId, activeChannelId, lastActiveChannelIdByServerId, loadingServers, loadingChannels, loadingMessages, ...rest } = state;
        return rest;
      },
    }
  )
);
