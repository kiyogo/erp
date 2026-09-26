export type ChatChannelType =
  | 'COMPANY'
  | 'BRANCH'
  | 'DEPARTMENT'
  | 'PROJECT'
  | 'PRIVATE'
  | 'SUPPORT'
  | 'DM'
  | 'GROUP_DM';

export type ChatChannelVisibility = 'PUBLIC' | 'PRIVATE';

export type ChatChannelStatus = 'ACTIVE' | 'ARCHIVED' | 'LOCKED';

export type ChatMemberRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';

export type ChatChannelMembership = {
  role: ChatMemberRole;
  isPinned: boolean;
  lastReadAt: string | null;
} | null;

export type ChatAttachment = {
  id?: string;
  name?: string;
  url?: string;
  type?: string;
  size?: number | string;
  thumbnail?: string;
  metadata?: {
    originalUrl?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type ChatMessageAuthor = {
  id: string;
  name?: string;
  avatarUrl?: string | null;
};

export type ChatDirectMember = {
  id?: string;
  userId?: string;
  user_id?: string;
  name?: string;
  email?: string;
  profile?: ChatUserLite['profile'];
  user?: ChatUserLite;
};

export type ChatChannelSummary = {
  id: string;
  companyId?: string;
  type?: ChatChannelType;
  visibility?: ChatChannelVisibility;
  name: string;
  description?: string | null;
  icon?: string | null;
  status?: ChatChannelStatus;
  createdById?: string;
  createdAt?: string;
  updatedAt?: string;
  kind?: 'TEXT' | 'VOICE' | 'ANNOUNCEMENT';
  category?: string;
  topic?: string;
  locked?: boolean;
  allowedUserIds?: string[];
  members?: ChatDirectMember[];

  membership?: ChatChannelMembership;
  unreadCount?: number;
  lastMessage?: {
    id: string;
    userId: string;
    content: string;
    createdAt: string;
  } | null;
};

export type ChatUserLite = {
  id: string;
  email: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  profile?: {
    fullName?: string | null;
    avatarUrl?: string | null;
    title?: string | null;
    themeColor?: string | null;
  } | null;
  employee?: {
    title?: string | null;
    department?: { name: string } | null;
    branch?: { name: string } | null;
  } | null;
};

export type ChatMessage = {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  replyToId: string | null;
  editedAt: string | null;
  recalledAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: ChatUserLite;
  author?: ChatMessageAuthor;
  attachments?: ChatAttachment[];
  reactions: Array<{ id: string; messageId: string; userId: string; emoji: string; createdAt: string }>;
};
