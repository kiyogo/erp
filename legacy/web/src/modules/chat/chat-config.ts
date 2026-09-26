'use client';

export type ChatServerChannelKind = 'TEXT' | 'VOICE' | 'ANNOUNCEMENT';

export type ChatServerChannel = {
  id: string;
  name: string;
  kind: ChatServerChannelKind;
  category: string;
  topic?: string;
  locked?: boolean;
  allowedUserIds?: string[];
};

export type ChatServerConfig = {
  id: string;
  name: string;
  shortName: string;
  color: string;
  description: string;
  icon?: string;
  channels: ChatServerChannel[];
  allowedUserIds?: string[];
};

export const CHAT_SERVER_STORAGE_KEY = 'enterprise-tax.discord-chat.servers.v2';
export const CHAT_SERVER_CHANGED_EVENT = 'enterprise-tax.discord-chat.servers.changed';

export const DEFAULT_SERVER_ID = '1327862641393143818';
export const DEFAULT_CHANNEL_ID = '1343452674535718912';

export const DEFAULT_CHAT_SERVERS: ChatServerConfig[] = [
  {
    id: DEFAULT_SERVER_ID,
    name: 'KiyoVN Enterprise',
    shortName: 'KV',
    color: '#5865f2',
    description: 'Máy chủ trao đổi nội bộ KiyoVN Enterprise.',
    icon: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100',
    channels: [
      {
        id: DEFAULT_CHANNEL_ID,
        name: 'chung',
        kind: 'TEXT',
        category: 'KÊNH VĂN BẢN',
        topic: 'Kênh trao đổi công việc và thảo luận chung toàn công ty'
      },
      {
        id: '1343452674535718913',
        name: 'thông-báo-chung',
        kind: 'ANNOUNCEMENT',
        category: 'THÔNG BÁO',
        topic: 'Kênh thông báo chính thức từ Ban Giám Đốc',
        locked: true
      },
      {
        id: '1343452674535718914',
        name: 'kỹ-thuật-dev',
        kind: 'TEXT',
        category: 'KÊNH VĂN BẢN',
        topic: 'Thảo luận kỹ thuật, kiến trúc hệ thống và phát triển phần mềm'
      },
      {
        id: '1343452674535718915',
        name: 'kinh-doanh-sale',
        kind: 'TEXT',
        category: 'KÊNH VĂN BẢN',
        topic: 'Kênh khối kinh doanh & chăm sóc khách hàng'
      },
      {
        id: '1343452674535718916',
        name: 'Phòng Họp Voice 1',
        kind: 'VOICE',
        category: 'KÊNH THOẠI',
        topic: 'Phòng họp trực tuyến 1'
      },
      {
        id: '1343452674535718917',
        name: 'Phòng Họp Voice 2',
        kind: 'VOICE',
        category: 'KÊNH THOẠI',
        topic: 'Phòng họp trực tuyến 2'
      }
    ]
  }
];

const cloneDefaults = () => JSON.parse(JSON.stringify(DEFAULT_CHAT_SERVERS)) as ChatServerConfig[];

const normalizeServer = (server: Partial<ChatServerConfig>, index: number): ChatServerConfig => {
  const fallback: ChatServerConfig = DEFAULT_CHAT_SERVERS[index % DEFAULT_CHAT_SERVERS.length] ?? {
    id: DEFAULT_SERVER_ID,
    name: 'KiyoVN Enterprise',
    shortName: 'KV',
    color: '#5865f2',
    description: 'Máy chủ trao đổi nội bộ KiyoVN Enterprise.',
    channels: []
  };
  const id = typeof server.id === 'string' && server.id.trim() ? server.id.trim() : `server-${Date.now()}-${index}`;
  const name = typeof server.name === 'string' && server.name.trim() ? server.name.trim() : fallback.name;
  const shortName = typeof server.shortName === 'string' && server.shortName.trim()
    ? server.shortName.trim().slice(0, 3).toUpperCase()
    : name.slice(0, 2).toUpperCase();

  const channels: ChatServerChannel[] = Array.isArray(server.channels) && server.channels.length > 0
    ? server.channels.map<ChatServerChannel>((channel, channelIndex) => ({
        id: typeof channel.id === 'string' && channel.id.trim() ? channel.id.trim() : `${id}-channel-${channelIndex}`,
        name: typeof channel.name === 'string' && channel.name.trim() ? channel.name.trim() : `kênh-${channelIndex + 1}`,
        kind: channel.kind === 'VOICE' || channel.kind === 'ANNOUNCEMENT' ? channel.kind : 'TEXT',
        category: typeof channel.category === 'string' && channel.category.trim() ? channel.category.trim() : 'KÊNH VĂN BẢN',
        topic: typeof channel.topic === 'string' ? channel.topic : '',
        locked: Boolean(channel.locked),
        allowedUserIds: Array.isArray(channel.allowedUserIds) ? channel.allowedUserIds : []
      }))
    : [...fallback.channels];

  return {
    id,
    name,
    shortName,
    color: typeof server.color === 'string' && server.color.trim() ? server.color : fallback.color,
    description: typeof server.description === 'string' ? server.description : fallback.description,
    icon: typeof server.icon === 'string' ? server.icon : undefined,
    channels,
    allowedUserIds: Array.isArray(server.allowedUserIds) ? server.allowedUserIds : []
  };
};

export const normalizeChatServers = (servers: unknown): ChatServerConfig[] => {
  if (!Array.isArray(servers) || servers.length === 0) {
    return cloneDefaults();
  }

  const normalized = servers.map((server, index) => normalizeServer(server as Partial<ChatServerConfig>, index));
  const seenIds = new Set<string>();
  const result = normalized.filter(server => {
    if (seenIds.has(server.id) || server.id === 'home' || server.id === '@me') {
      return false;
    }
    seenIds.add(server.id);
    return true;
  });

  if (result.length === 0) {
    return cloneDefaults();
  }
  return result;
};

export const readChatServers = () => {
  if (typeof window === 'undefined') {
    return cloneDefaults();
  }

  try {
    const raw = window.localStorage.getItem(CHAT_SERVER_STORAGE_KEY);
    if (!raw) {
      return cloneDefaults();
    }

    return normalizeChatServers(JSON.parse(raw));
  } catch {
    return cloneDefaults();
  }
};

export const writeChatServers = (servers: ChatServerConfig[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = normalizeChatServers(servers);
  window.localStorage.setItem(CHAT_SERVER_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(CHAT_SERVER_CHANGED_EVENT, { detail: normalized }));
};
