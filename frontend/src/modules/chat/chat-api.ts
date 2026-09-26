import type { ChatChannelSummary, ChatMessage, ChatUserLite } from './chat-types';
import { readChatServers, DEFAULT_SERVER_ID, DEFAULT_CHANNEL_ID } from './chat-config';
import { dataService } from '../../services/dataService';
import { usersApi, employeesApi, collectionsApi, type EnterpriseEmployee } from '../../api/endpoints';

type ChatApiError = { code?: string; message?: string };
type ChatApiResponse<T> = { success: boolean; data: T; error?: ChatApiError };

const CHAT_MESSAGES_STORAGE_KEY = 'kiyovn.chat.messages.v2';
const CHAT_DMS_STORAGE_KEY = 'kiyovn.chat.dms.v2';

let cachedUsers: Record<string, ChatUserLite> = {};

export async function getRealChatUsers(): Promise<Record<string, ChatUserLite>> {
  if (Object.keys(cachedUsers).length > 0) return cachedUsers;
  try {
    const [empRes, userRes] = await Promise.allSettled([
      employeesApi.getAll(),
      usersApi.getAll(),
    ]);

    const result: Record<string, ChatUserLite> = {};

    if (empRes.status === 'fulfilled' && empRes.value.data?.data) {
      empRes.value.data.data.forEach((e: EnterpriseEmployee) => {
        const id = e.employeeCode || e.code || e.id;
        result[id] = {
          id,
          email: e.email,
          profile: {
            fullName: e.name || e.fullName,
            avatarUrl: e.avatar || '',
            title: e.position || 'Nhân sự',
          },
          employee: {
            title: e.position || 'Nhân sự',
            department: { name: e.department || 'Doanh nghiệp' },
            branch: { name: 'Trụ sở' },
          },
        };
      });
    }

    if (userRes.status === 'fulfilled' && userRes.value.data?.users) {
      userRes.value.data.users.forEach((u: any) => {
        const id = u.employeeCode || u.id;
        if (!result[id]) {
          result[id] = {
            id,
            email: u.email,
            profile: {
              fullName: u.name || u.fullName,
              avatarUrl: '',
              title: u.role === 'ADMIN' ? 'Quản trị viên' : 'Nhân sự',
            },
            employee: {
              title: u.role === 'ADMIN' ? 'Quản trị viên' : 'Nhân sự',
              department: { name: u.department || 'Ban Điều Hành' },
              branch: { name: 'Trụ sở' },
            },
          };
        }
      });
    }

    cachedUsers = result;
    return result;
  } catch {
    return cachedUsers;
  }
}

const getStoredMessages = (): Record<string, ChatMessage[]> => {
  try {
    const raw = localStorage.getItem(CHAT_MESSAGES_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
};

const saveStoredMessages = (data: Record<string, ChatMessage[]>) => {
  try {
    localStorage.setItem(CHAT_MESSAGES_STORAGE_KEY, JSON.stringify(data));
  } catch {}
  collectionsApi.replace('chat_messages', Object.values(data).flat()).catch(() => {});
};

export async function fetchChatChannels(): Promise<ChatApiResponse<ChatChannelSummary[]>> {
  const servers = readChatServers();
  const currentServer = servers.find((s) => s.id === DEFAULT_SERVER_ID) || servers[0];
  const channels: ChatChannelSummary[] = (currentServer?.channels || []).map((ch) => ({
    id: ch.id,
    companyId: 'kiyovn',
    type: (ch.kind === 'VOICE' ? 'PRIVATE' : 'COMPANY') as any,
    visibility: 'PUBLIC',
    name: ch.name,
    description: ch.topic || null,
    icon: null,
    status: 'ACTIVE',
    createdById: 'system',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    membership: { role: 'MEMBER', isPinned: false, lastReadAt: null },
    unreadCount: 0,
    lastMessage: null,
  }));
  return { success: true, data: channels };
}

export async function fetchChatServers(): Promise<ChatApiResponse<any[]>> {
  const servers = readChatServers();
  return { success: true, data: servers };
}

export async function fetchServerChannels(serverId: string): Promise<ChatApiResponse<any[]>> {
  const servers = readChatServers();
  const found = servers.find((s) => s.id === serverId);
  const channels = found ? found.channels.map((c) => ({ ...c, server_id: serverId })) : [];
  return { success: true, data: channels };
}

export async function fetchChatMessages(
  channelId: string,
  options?: { cursor?: string | null; limit?: number }
): Promise<ChatApiResponse<ChatMessage[]>> {
  const all = getStoredMessages();
  const list = all[channelId] || [];
  return { success: true, data: list };
}

export const fetchChannelMessages = fetchChatMessages;

export async function sendChatMessage(
  channelId: string,
  payloadOrContent: string | { content: string; replyToId?: string | null; attachments?: any[] },
  attachments?: any[],
  replyToId?: string | null
): Promise<ChatApiResponse<ChatMessage>> {
  const all = getStoredMessages();
  const profile = dataService.getEmployeeProfile();
  const currentUser: ChatUserLite = {
    id: profile.code || 'EMP-1',
    email: profile.email || 'user@kiyovn.enterprise',
    profile: {
      fullName: profile.name || 'Người dùng',
      avatarUrl: profile.avatar || '',
      title: profile.title || 'Nhân sự',
    },
    employee: {
      title: profile.title || 'Nhân sự',
      department: { name: profile.department || 'Doanh nghiệp' },
      branch: { name: profile.unit || 'Trụ sở' },
    },
  };

  const content = typeof payloadOrContent === 'string' ? payloadOrContent : payloadOrContent.content;
  const finalReplyToId = typeof payloadOrContent === 'object' ? payloadOrContent.replyToId : replyToId;
  const finalAttachments = typeof payloadOrContent === 'object' ? payloadOrContent.attachments : attachments;

  const newMsg: ChatMessage = {
    id: `msg-${Date.now()}`,
    channelId,
    userId: currentUser.id,
    content,
    replyToId: finalReplyToId || null,
    attachments: finalAttachments || [],
    editedAt: null,
    recalledAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    user: currentUser,
    reactions: [],
  };

  const currentList = all[channelId] || [];
  all[channelId] = [...currentList, newMsg];
  saveStoredMessages(all);

  return { success: true, data: newMsg };
}

export async function toggleMessageReaction(
  channelIdOrMessageId: string,
  messageIdOrEmoji: string,
  optionalEmoji?: string
): Promise<ChatApiResponse<ChatMessage | null>> {
  const all = getStoredMessages();
  const profile = dataService.getEmployeeProfile();
  const currentUserId = profile.code || 'EMP-1';

  const targetMessageId = optionalEmoji ? messageIdOrEmoji : channelIdOrMessageId;
  const targetEmoji = optionalEmoji || messageIdOrEmoji;

  let foundMsg: ChatMessage | null = null;
  for (const chId in all) {
    const list = all[chId];
    const msg = list.find((m) => m.id === targetMessageId);
    if (msg) {
      if (!msg.reactions) msg.reactions = [];
      const idx = msg.reactions.findIndex((r) => r.userId === currentUserId && r.emoji === targetEmoji);
      if (idx >= 0) {
        msg.reactions.splice(idx, 1);
      } else {
        msg.reactions.push({
          id: `r-${Date.now()}`,
          messageId: targetMessageId,
          userId: currentUserId,
          emoji: targetEmoji,
          createdAt: new Date().toISOString(),
        });
      }
      foundMsg = { ...msg };
      break;
    }
  }
  saveStoredMessages(all);
  return { success: true, data: foundMsg };
}

export async function fetchDirectMessages(): Promise<ChatApiResponse<any[]>> {
  try {
    const raw = localStorage.getItem(CHAT_DMS_STORAGE_KEY);
    if (raw) {
      return { success: true, data: JSON.parse(raw) };
    }
  } catch {}
  return { success: true, data: [] };
}

export async function fetchChannelMembers(channelId: string): Promise<ChatApiResponse<any[]>> {
  const realUsers = await getRealChatUsers();
  const members = Object.values(realUsers).map((u) => ({
    id: u.id,
    name: u.profile?.fullName || u.email,
    username: u.email.split('@')[0],
    roleGroup: u.employee?.department?.name || 'THÀNH VIÊN',
    presence: 'online',
    status: u.profile?.title || 'Sẵn sàng trao đổi',
    color: '#009688',
    avatarUrl: u.profile?.avatarUrl || '',
    badges: [],
    roles: [u.profile?.title || 'Nhân sự'],
    bio: '',
  }));
  return { success: true, data: members };
}

export async function searchUsers(query: string): Promise<ChatApiResponse<any[]>> {
  const realUsers = await getRealChatUsers();
  const q = query.toLowerCase().trim();
  const all = Object.values(realUsers).filter(
    (u) =>
      u.profile?.fullName?.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
  );
  return { success: true, data: all };
}

export async function openDirectMessage(userIds: string[]): Promise<ChatApiResponse<any>> {
  const realUsers = await getRealChatUsers();
  const targetId = userIds[0] || '';
  const targetUser = realUsers[targetId] || {
    id: targetId,
    email: '',
    profile: { fullName: targetId, avatarUrl: '', title: '' },
  };
  const dmObj = {
    id: `dm-${targetId}`,
    name: targetUser.profile?.fullName || targetUser.email || targetId,
    user: targetUser,
    unreadCount: 0,
    lastMessage: null,
  };
  try {
    const dms = (await fetchDirectMessages()).data || [];
    if (!dms.some((d) => d.id === dmObj.id)) {
      localStorage.setItem(CHAT_DMS_STORAGE_KEY, JSON.stringify([dmObj, ...dms]));
    }
  } catch {}
  return { success: true, data: dmObj };
}

export async function startDm(payload: { userIds: string[]; name?: string | null }): Promise<ChatApiResponse<any>> {
  return openDirectMessage(payload.userIds);
}

export async function markChatRead(channelId: string): Promise<{ success: boolean }> {
  return { success: true };
}

export async function joinChatChannel(channelId: string): Promise<{ success: boolean }> {
  return { success: true };
}

export async function leaveChatChannel(channelId: string): Promise<{ success: boolean }> {
  return { success: true };
}

export async function fetchChatServerConfig(): Promise<ChatApiResponse<any>> {
  return { success: true, data: readChatServers() };
}

export async function saveChatServerConfig(config: any): Promise<{ success: boolean }> {
  return { success: true };
}

export async function adminFetchChannels(): Promise<ChatApiResponse<any[]>> {
  const res = await fetchChatChannels();
  return { success: true, data: res.data };
}

export async function adminCreateChannel(payload: any): Promise<ChatApiResponse<any>> {
  return { success: true, data: payload };
}

export async function adminAddChannelMembers(channelId: string, userIds: string[]): Promise<{ success: boolean }> {
  return { success: true };
}

export async function adminRemoveChannelMember(channelId: string, userId: string): Promise<{ success: boolean }> {
  return { success: true };
}

export async function lazyCreateChannel(name: string): Promise<ChatApiResponse<any>> {
  return { success: true, data: { id: `ch-${Date.now()}`, name } };
}

export async function fetchTikTokInfo(url: string): Promise<ChatApiResponse<any>> {
  return { success: true, data: { title: 'TikTok Video', url } };
}
