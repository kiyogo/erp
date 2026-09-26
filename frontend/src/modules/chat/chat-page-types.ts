import type { CSSProperties } from 'react';
import type { ChatChannelSummary, ChatMessage } from './chat-types';
import type { ChatServerChannel } from './chat-config';

export type Presence = 'online' | 'idle' | 'dnd' | 'offline';

export type ChatMember = {
  id: string;
  userId?: string;
  name: string;
  username: string;
  email?: string;
  roleGroup: string;
  presence: Presence;
  status: string;
  color: string;
  avatarUrl?: string | null;
  badges: string[];
  roles: string[];
  permissions?: string[];
  bio?: string;
  pronoun?: string;
};

export type ViewChannel = {
  id: string;
  name: string;
  kind: ChatServerChannel['kind'];
  category: string;
  topic?: string | null;
  locked?: boolean;
  unreadCount?: number;
  apiChannel?: ChatChannelSummary;
};

export type ProfileAnchor = {
  member: ChatMember;
  style: CSSProperties;
};

export type ChatSettings = {
  theme: string;
  messageDisplay: 'cozy' | 'compact';
  saturation: number;
  reducedMotion: boolean;
  highContrast: boolean;
  inputVolume: number;
  emojiConversion: boolean;
  linkPreviews: boolean;
  stickerSuggestions: boolean;
  desktopNotifications: boolean;
  unreadBadge: boolean;
  sounds: {
    messages: boolean;
    join: boolean;
    leave: boolean;
    call: boolean;
  };
};

export type EditProfileState = {
  name: string;
  pronoun: string;
  bio: string;
  nameStyle: string;
  hasWidget: boolean;
  avatarUrl: string;
  decoration: string;
  nameplate: string;
  effect: string;
  bannerUrl: string;
  themePrimary: string;
  themeAccent: string;
};
