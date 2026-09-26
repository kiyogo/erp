'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Avatar, HomeIcon, ServerIcon } from './components/chat-components';
import { MessageItem } from './components/chat-message-item';
import { ProfileCard } from './components/chat-profile-card';
import { ChatNewDMModal } from './components/chat-new-dm-modal';
import { ChatSettingsModal } from './components/chat-settings-modal';
import { ChatLightbox } from './components/chat-lightbox';
import { ChatMemberPanel } from './components/chat-member-panel';
import { ChatThemeProvider } from './components/chat-theme-provider';
import { EmojiPicker, type PickerTab } from './components/emoji-picker';
import { useChatUiPreferencesStore } from './chat-ui-preferences';
import {
  BellOff, Check, ChevronDown, Compass, Gift, Hash, Headphones, HelpCircle,
  Lock, MessageCircle, MessageSquare, Mic, Moon, MoreHorizontal, Pin, Plus,
  Send, Settings, Smile, Sticker, Sun, Users, UserPlus, X, Reply, Pencil,
  Building2, Upload, BarChart3, LayoutGrid, Leaf, ShoppingBag, Zap, Menu,
  File as FileIcon, FileText, Image as ImageIcon, Download, Eye, Trash2,
  ExternalLink, ZoomIn, ZoomOut, RotateCcw, FileArchive, Pause, Play, Volume2,
  VolumeX, Maximize, Link2
} from 'lucide-react';
import { toast } from './toast';
import { cn } from './utils';
import { useAuthStore } from './auth-store';
import {
  fetchChatMessages, markChatRead, sendChatMessage, fetchChatServers,
  fetchDirectMessages, fetchServerChannels, openDirectMessage, searchUsers,
  fetchChannelMembers, adminCreateChannel, fetchChatChannels,
  fetchChatServerConfig, fetchTikTokInfo, toggleMessageReaction
} from './chat-api';
import { getChatSocket } from './chat-socket';
import type { ChatChannelSummary, ChatMessage } from './chat-types';
import { useChatStore } from './chat-store';
import type { ChatMember, ViewChannel, ProfileAnchor, Presence } from './chat-page-types';
import { CHAT_SERVER_CHANGED_EVENT, readChatServers } from './chat-config';
import { VideoRenderer } from './components/video-renderer';
import {
  getAttachmentUrl, isViewable, getInitials, PRESENCE_STYLE,
  getVideoDim, setVideoDim, getVideoDimensions, formatFileSize
} from './chat-helpers';
import { useMobileDetect } from './chat-hooks';
import { FileUploadDialog } from '../../components/FileUploadDialog';
import './chat.css';

// --- Main Page ---

export function parseChatPath(pathname: string) {
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`;

  // Match /admin/chat/channels/:slug/:channelId or /admin/channels/:slug/:channelId or /chat/channels/:slug/:channelId or /channels/:slug/:channelId
  const match = p.match(/^(.*?(?:\/admin)?(?:\/chat)?\/channels)\/([^/]+)(?:\/([^/]+))?/);
  if (match) {
    return {
      basePrefix: match[1],
      parsedSlug: match[2],
      parsedChannelId: match[3],
    };
  }

  let basePrefix = '/channels';
  if (p.startsWith('/admin/chat')) {
    basePrefix = '/admin/chat/channels';
  } else if (p.startsWith('/admin/channels')) {
    basePrefix = '/admin/channels';
  } else if (p.startsWith('/chat')) {
    basePrefix = '/chat/channels';
  }

  return {
    basePrefix,
    parsedSlug: '@me',
    parsedChannelId: undefined,
  };
}

interface ChatPageProps {
  slug?: string;
  channelId?: string;
  immersive?: boolean;
}

export function ChatPage({ slug: propSlug, channelId: propChannelId, immersive: propImmersive }: ChatPageProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ slug?: string; channelId?: string; '*': string }>();
  const [searchParams] = useSearchParams();

  const parsed = useMemo(() => parseChatPath(location.pathname), [location.pathname]);
  const slug = params.slug || parsed.parsedSlug || propSlug || '@me';
  const channelId = params.channelId || parsed.parsedChannelId || propChannelId;

  const pathname = location.pathname;
  const isAdmin = pathname?.startsWith('/admin') ?? false;
  const authUser = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const userId = authUser?.userId ?? (authUser as any)?.id ?? 'me';

  const {
    theme: chatTheme,
    setTheme: setChatTheme,
    primaryColor: chatPrimaryColor,
    borderRadius: chatBorderRadius,
    setBorderRadius: setChatBorderRadius
  } = useChatUiPreferencesStore();

  const {
    servers = [],
    channels = [],
    directMessages = [],
    activeServerId,
    activeChannelId,
    loadingServers,
    loadingChannels,
    loadingMessages,
    messagesByChannelId = {},
    setServers,
    setChannels,
    setDirectMessages,
    setActiveServer,
    setActiveChannel,
    setLoadingServers,
    setLoadingChannels,
    setLoadingMessages,
    setMessages,
    pushMessage,
    updateMessage,
    bumpChannelActivity
  } = useChatStore();

  const [mounted, setMounted] = useState(false);
  const [messageDraft, setMessageDraft] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<PickerTab>('emoji');
  const [showMemberList, setShowMemberList] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState<ProfileAnchor | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showNewDMModal, setShowNewDMModal] = useState(false);
  const [emojiTargetMessageId, setEmojiTargetMessageId] = useState<string | null>(null);
  const [dmSearchQuery, setDmSearchQuery] = useState('');
  const [dmSearchResults, setDmSearchResults] = useState<any[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const dmSearchIdRef = useRef(0);

  const [channelMembers, setChannelMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, { fullName: string; timestamp: number }>>(new Map());
  const activeChannelIdRef = useRef<string>(activeChannelId || '');
  const userIdRef = useRef<string>(String(userId));
  useEffect(() => { activeChannelIdRef.current = activeChannelId || ''; }, [activeChannelId]);
  useEffect(() => {
    userIdRef.current = String(authUser?.userId || (authUser as any)?.id || userId || '');
  }, [authUser, userId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTypingUsers(prev => {
        if (prev.size === 0) return prev;
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        for (const [uid, info] of next.entries()) {
          if (now - info.timestamp > 4000) {
            next.delete(uid);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1500);
    return () => clearInterval(timer);
  }, []);
  const internalChannelUpdate = useRef(0);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [lightboxThumbnail, setLightboxThumbnail] = useState<string | null>(null);
  const [lightboxType, setLightboxType] = useState<'image' | 'video' | 'text' | 'pdf' | 'office'>('image');
  const [lightboxMetadata, setLightboxMetadata] = useState<any>(null);
  const [lightboxText, setLightboxText] = useState<string | null>(null);
  const [lightboxFileName, setLightboxFileName] = useState<string>('');
  const [lightboxFileSize, setLightboxFileSize] = useState<string>('');
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [lightboxOrigin, setLightboxOrigin] = useState('center center');
  const [lightboxOffset, setLightboxOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const dragCounterRef = useRef(0);
  const textCacheRef = useRef<Record<string, string>>({});
  const lightboxTextRef = useRef<HTMLDivElement>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const [uploadPickerOpen, setUploadPickerOpen] = useState(false);
  const lightboxImgRef = useRef<HTMLImageElement>(null);
  const [hasMoved, setHasMoved] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [loadingMore, setLoadingMore] = useState(false);

  const commands = [
    { name: '/tt', description: 'Tải video TikTok từ link', param: 'link', paramPlaceholder: 'Dán link TikTok vào đây...' },
  ];

  const filteredCommands = useMemo(() => {
    const query = commandQuery.startsWith('/') ? commandQuery : `/${commandQuery}`;
    return commands.filter(c => (c.name || '').toLowerCase().startsWith((query || '').toLowerCase()));
  }, [commandQuery]);

  const handleSelectCommand = (cmd: any) => {
    setActiveCommand(cmd.name);
    setMessageDraft('');
    setShowCommandMenu(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const [pickerStyle, setPickerStyle] = useState<React.CSSProperties>({ opacity: 0, visibility: 'hidden' });

  const updatePickerPosition = useCallback(() => {
    if (!emojiButtonRef.current || emojiTargetMessageId) return;
    const rect = emojiButtonRef.current.getBoundingClientRect();
    const isMobileView = window.innerWidth < 1024;

    if (isMobileView) {
      setPickerStyle({ opacity: 1, visibility: 'visible' });
    } else {
      setPickerStyle({
        position: 'fixed',
        bottom: `${window.innerHeight - rect.top + 18}px`,
        right: `${window.innerWidth - rect.right}px`,
        zIndex: 9999,
        opacity: 1,
        visibility: 'visible'
      });
    }
  }, [emojiTargetMessageId]);

  useEffect(() => {
    if (showEmojiPicker) {
      updatePickerPosition();
      window.addEventListener('resize', updatePickerPosition);
    } else {
      window.removeEventListener('resize', updatePickerPosition);
    }
    return () => window.removeEventListener('resize', updatePickerPosition);
  }, [showEmojiPicker, updatePickerPosition]);

  useEffect(() => {
    if (profileAnchor) {
      document.body.style.overflow = 'hidden';
      if (scrollRef.current) scrollRef.current.style.overflowY = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
      if (scrollRef.current) scrollRef.current.style.overflowY = 'auto';
    }
    return () => {
      document.body.style.overflow = 'unset';
      if (scrollRef.current) scrollRef.current.style.overflowY = 'auto';
    };
  }, [profileAnchor]);

  useEffect(() => {
    const handleGlobalDragEnd = () => setIsDraggingOver(false);
    const handleWindowBlur = () => setIsDraggingOver(false);

    window.addEventListener('dragend', handleGlobalDragEnd);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('dragend', handleGlobalDragEnd);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) {
        setIsSidebarOpen(false);
        setIsMembersOpen(false);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setIsSidebarOpen(false);
      setIsMembersOpen(false);
    }
  }, [activeChannelId, isMobile]);

  const isFullscreen = searchParams.get('fullscreen') === 'true';
  const autoImmersive = (
    pathname === '/chat' ||
    pathname.startsWith('/chat/') ||
    pathname === '/admin/chat' ||
    pathname.startsWith('/admin/chat/') ||
    pathname === '/admin/channels' ||
    pathname.startsWith('/admin/channels/') ||
    pathname === '/channels' ||
    pathname.startsWith('/channels/')
  ) || (isFullscreen && !isAdmin);
  const immersive = propImmersive !== undefined ? propImmersive : autoImmersive;

  const displayedMessages = useMemo(() => {
    if (!activeChannelId) return [];
    const msgs = messagesByChannelId[activeChannelId] ?? [];
    return [...msgs].reverse();
  }, [activeChannelId, messagesByChannelId]);

  // Sync URL → store SAU KHI loadInitialData hoàn tất
  const [initialSyncDone, setInitialSyncDone] = useState(false);
  const pendingSlugRef = useRef(slug);
  const pendingChannelRef = useRef(channelId);

  const doInitialSync = useCallback(() => {
    const s = pendingSlugRef.current;
    const c = pendingChannelRef.current;
    if (s === 'home' || s === '@me') {
      setActiveServer('home');
      if (c) setActiveChannel(c);
    } else if (s) {
      setActiveServer(s);
      const state = useChatStore.getState();
      const currentServer = (state.servers || []).find((srv: any) => srv.id === s);
      if (currentServer && currentServer.channels && currentServer.channels.length > 0) {
        setChannels(currentServer.channels);
        if (c) {
          setActiveChannel(c);
        } else {
          setActiveChannel(currentServer.channels[0].id);
        }
      } else if (c) {
        setActiveChannel(c);
      }
    }
  }, [setActiveServer, setActiveChannel, setChannels]);

  // Sync when route parameters change in browser
  useEffect(() => {
    pendingSlugRef.current = slug;
    pendingChannelRef.current = channelId;
    if (initialSyncDone) {
      if (slug === 'home' || slug === '@me') {
        if (activeServerId !== 'home') {
          setActiveServer('home');
        }
        if (channelId && channelId !== activeChannelId) {
          setActiveChannel(channelId);
        }
      } else if (slug) {
        if (activeServerId !== slug) {
          setActiveServer(slug);
          const curServers = useChatStore.getState().servers;
          const curServer = curServers.find((srv: any) => srv.id === slug);
          if (curServer?.channels?.length) {
            setChannels(curServer.channels);
          }
        }
        if (channelId && channelId !== activeChannelId) {
          setActiveChannel(channelId);
        }
      }
    }
  }, [slug, channelId, initialSyncDone, activeServerId, activeChannelId, setActiveServer, setActiveChannel, setChannels]);

  // Sync store → URL khi activeServerId/activeChannelId thay đổi
  useEffect(() => {
    if (!initialSyncDone) return;
    if (internalChannelUpdate.current > 0) {
      internalChannelUpdate.current--;
      return;
    }
    const server = activeServerId === 'home' ? '@me' : activeServerId;
    if (!server) return;

    const currentPath = window.location.pathname;
    const { basePrefix } = parseChatPath(currentPath);

    const path = activeChannelId
      ? `${basePrefix}/${server}/${activeChannelId}`
      : `${basePrefix}/${server}`;

    if (decodeURI(path) !== decodeURI(currentPath)) {
      window.history.replaceState(null, '', path);
    }
    if (activeServerId && activeServerId !== 'home') {
      const allServers = useChatStore.getState().servers;
      const currentServer = allServers.find(s => s.id === activeServerId);
      if (currentServer) {
        try {
          sessionStorage.setItem('chat_server_name', currentServer.name || '');
          if (activeChannelId) {
            const chIdx = (currentServer.channels || []).findIndex((c: any) => c.id === activeChannelId);
            if (chIdx >= 0) sessionStorage.setItem('chat_channel_idx', String(chIdx));
          }
        } catch {}
      }
    }
  }, [activeServerId, activeChannelId, initialSyncDone]);

  useEffect(() => {
    setMounted(true);
    loadInitialData();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSidebarOpen(false);
        setIsMembersOpen(false);
        setProfileAnchor(null);
        setShowEmojiPicker(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const socket = getChatSocket(accessToken);
    if (!socket) return;

    socket.on('chat:message:new', (data: { channelId: string; message: ChatMessage }) => {
      if (String(data.message?.userId || (data.message as any)?.user_id) === String(userIdRef.current)) return;
      pushMessage(data.channelId, data.message);
      bumpChannelActivity(data.channelId, { lastMessage: data.message });
      if (String(data.channelId) === String(activeChannelIdRef.current)) {
        setTimeout(() => scrollToBottom(true), 100);
      }
    });

    socket.on('chat:message:updated', (data: { channelId: string; message: ChatMessage }) => {
      updateMessage(data.channelId, data.message);
    });

    socket.on('chat:channel:activity', (data: { channelId: string; lastMessage: any }) => {
      bumpChannelActivity(data.channelId, { lastMessage: data.lastMessage });
    });

    socket.on('chat:typing', (data: { channelId: string; userId: string; fullName: string; isTyping: boolean }) => {
      if (String(data.channelId) !== String(activeChannelIdRef.current)) return;
      const myId = String(userIdRef.current);
      if (String(data.userId) === myId) return;
      if (authUser?.email && (data.userId === authUser.email || data.fullName === (authUser.profile?.fullName || authUser.fullName))) return;
      setTypingUsers(prev => {
        const next = new Map(prev);
        if (data.isTyping) {
          next.set(String(data.userId), { fullName: data.fullName, timestamp: Date.now() });
        } else {
          next.delete(String(data.userId));
        }
        return next;
      });
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      socket.off('chat:message:new');
      socket.off('chat:message:updated');
      socket.off('chat:channel:activity');
      socket.off('chat:typing');
    };
  }, [accessToken]);

  useEffect(() => {
    const handleServersChange = () => {
      const localServers = readChatServers();
      const filtered = localServers.filter(s => {
        if (!s.allowedUserIds || s.allowedUserIds.length === 0) return true;
        return s.allowedUserIds.includes(authUser?.userId || '');
      });
      setServers(filtered);

      if (activeServerId && activeServerId !== 'home') {
        const current = filtered.find(s => s.id === activeServerId);
        if (!current) {
          setActiveServer('home');
        } else {
          const filteredChannels = (current.channels || []).filter(c => {
            if (!c.allowedUserIds || c.allowedUserIds.length === 0) return true;
            return c.allowedUserIds.includes(authUser?.userId || '');
          });
          setChannels(filteredChannels);
        }
      }
    };

    window.addEventListener(CHAT_SERVER_CHANGED_EVENT, handleServersChange);
    return () => window.removeEventListener(CHAT_SERVER_CHANGED_EVENT, handleServersChange);
  }, [activeServerId, setServers, setChannels, setActiveServer, authUser?.userId]);

  const loadInitialData = async () => {
    setLoadingServers(true);
    try {
      const [serversRes, dmsRes] = await Promise.all([
        fetchChatServers(),
        fetchDirectMessages()
      ]);

      if (serversRes.success && serversRes.data && serversRes.data.length > 0) {
        const filtered = (serversRes.data as any[]).filter(s => {
          if (!s.allowedUserIds || s.allowedUserIds.length === 0) return true;
          return s.allowedUserIds.includes(String(authUser?.userId ?? ''));
        });
        setServers(filtered);
      } else {
        try {
          const configRes = await fetchChatServerConfig();
          if (configRes.success && configRes.data && configRes.data.length > 0) {
            const filtered = (configRes.data as any[]).filter(s => {
              if (!s.allowedUserIds || s.allowedUserIds.length === 0) return true;
              return s.allowedUserIds.includes(String(authUser?.userId ?? ''));
            });
            setServers(filtered);
          } else {
            throw new Error('No config');
          }
        } catch {
          const localServers = readChatServers();
          if (localServers && localServers.length > 0) {
            const filtered = localServers.filter(s => {
              if (!s.allowedUserIds || s.allowedUserIds.length === 0) return true;
              return s.allowedUserIds.includes(String(authUser?.userId ?? ''));
            });
            setServers(filtered);
          } else if (serversRes.success) {
            setServers([]);
          }
        }
      }

      if (dmsRes.success) {
        setDirectMessages(dmsRes.data || []);
      }
    } catch (e) {
      console.error('Failed to load chat data:', e);
    } finally {
      setLoadingServers(false);

      const state = useChatStore.getState();
      const s = pendingSlugRef.current;
      const c = pendingChannelRef.current;

      if (s === 'home' || s === '@me') {
        internalChannelUpdate.current++;
        state.setActiveServer('home');
        if (c) {
          state.setActiveChannel(c);
        }
      } else if (s && state.servers.length > 0) {
        const matchedServer = (state.servers as any[]).find(srv => srv.id === s);
        if (matchedServer) {
          internalChannelUpdate.current++;
          state.setActiveServer(matchedServer.id);
          if (matchedServer.channels && matchedServer.channels.length > 0) {
            state.setChannels(matchedServer.channels);
            if (c) {
              const matchedChannel = matchedServer.channels.find((ch: any) => ch.id === c);
              if (matchedChannel) {
                state.setActiveChannel(matchedChannel.id);
              } else {
                state.setActiveChannel(c);
              }
            } else {
              state.setActiveChannel(matchedServer.channels[0].id);
            }
          }
        } else {
          const firstServer = state.servers[0];
          if (firstServer) {
            internalChannelUpdate.current++;
            state.setActiveServer(firstServer.id);
            if (firstServer.channels?.length) {
              state.setChannels(firstServer.channels);
              state.setActiveChannel(firstServer.channels[0].id);
            }
          } else {
            state.setActiveServer('home');
          }
        }
      } else {
        try {
          const savedServerName = sessionStorage.getItem('chat_server_name');
          if (savedServerName && state.servers.length > 0) {
            const server = (state.servers as any[]).find(srv => srv.name === savedServerName);
            if (server) {
              internalChannelUpdate.current++;
              state.setActiveServer(server.id);
              if (server.channels) {
                state.setChannels(server.channels);
              }
              const savedIdx = sessionStorage.getItem('chat_channel_idx');
              if (savedIdx !== null && server.channels && server.channels.length > 0) {
                const idx = parseInt(savedIdx, 10);
                if (!isNaN(idx) && idx < server.channels.length) {
                  state.setActiveChannel(server.channels[idx].id);
                }
              }
            }
          } else {
            state.setActiveServer('home');
          }
        } catch {
          state.setActiveServer('home');
        }
      }

      setInitialSyncDone(true);
    }
  };

  useEffect(() => {
    if (activeServerId && activeServerId !== 'home') {
      loadServerChannels(activeServerId);
    }
  }, [activeServerId]);

  const loadServerChannels = async (serverId: string) => {
    const current = useChatStore.getState();
    if (current.channels.length > 0 && current.activeServerId === serverId) return;
    setLoadingChannels(true);
    const localServer = servers.find(s => s.id === serverId);
    if (localServer && localServer.channels && localServer.channels.length > 0) {
      const allRes = await fetchChatChannels();
      const realChannels = allRes.success ? allRes.data : [];

      const mappedChannels = localServer.channels.map(lc => {
        const match = realChannels.find(rc => (rc.name || '').toLowerCase() === (lc.name || '').toLowerCase());
        if (match) {
          if (activeChannelId === lc.id) { internalChannelUpdate.current++; setActiveChannel(match.id); }
          return { ...lc, id: match.id, realId: match.id };
        }
        return lc;
      });

      const filteredChannels = mappedChannels.filter(c => {
        if (!c.allowedUserIds || c.allowedUserIds.length === 0) return true;
        return c.allowedUserIds.includes(authUser?.userId || '');
      });

      setChannels(filteredChannels);
      setLoadingChannels(false);
      return;
    }

    try {
      const res = await fetchServerChannels(serverId);
      if (res.success) {
        const filtered = (res.data || []).filter(c => {
          if (!c.allowedUserIds || c.allowedUserIds.length === 0) return true;
          return c.allowedUserIds.includes(authUser?.userId || '');
        });
        setChannels(filtered);
      } else {
        const localServer = servers.find(s => s.id === serverId);
        if (localServer && localServer.channels) {
          const allRes = await fetchChatChannels();
          const realChannels = allRes.success ? allRes.data : [];

          const mappedChannels = localServer.channels.map(lc => {
            const match = realChannels.find(rc => (rc.name || '').toLowerCase() === (lc.name || '').toLowerCase());
            if (match) {
              if (activeChannelId === lc.id) { internalChannelUpdate.current++; setActiveChannel(match.id); }
              return { ...lc, id: match.id, realId: match.id };
            }
            return lc;
          });
          setChannels(mappedChannels);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingChannels(false);
    }
  };

  useEffect(() => {
    if (activeChannelId) {
      loadMessages(activeChannelId);
      markChatRead(activeChannelId);
    }
  }, [activeChannelId]);

  const loadMessages = async (channelId: any) => {
    if (!channelId) return;
    const strId = String(channelId);
    const isMockId = strId.startsWith('server-') || strId.startsWith('channel-') || strId.includes('kiyovn-');
    let effectiveId = channelId;

    if (isMockId) {
      try {
        const allRes = await fetchChatChannels();
        const realChannels = allRes.success ? allRes.data : [];

        const currentChannelObj = channels.find(c => c.id === channelId);
        if (currentChannelObj) {
          const match = realChannels.find(rc => (rc.name || '').toLowerCase() === (currentChannelObj.name || '').toLowerCase());
          if (match) {
            effectiveId = match.id;
            internalChannelUpdate.current++; setActiveChannel(match.id);
          } else {
            const createRes = await adminCreateChannel({
              name: currentChannelObj.name,
              type: 'COMPANY',
              visibility: 'PUBLIC',
              serverId: activeServerId && activeServerId !== 'home' ? activeServerId : undefined
            });
            if (createRes.success) {
              effectiveId = (createRes.data as any).id;
              const currentChannels = useChatStore.getState().channels || [];
              setChannels(currentChannels.map(c => c.id === channelId ? { ...c, id: effectiveId, realId: effectiveId } : c));
              internalChannelUpdate.current++; setActiveChannel(effectiveId);
              toast.success(`Đã khởi tạo kênh "${currentChannelObj.name}" trên hệ thống`);
              return;
            }
          }
        }
      } catch (e) {
        console.error('Self-healing failed:', e);
      }
    }

    const hasLoadedBefore = useChatStore.getState().messagesByChannelId[effectiveId] !== undefined;
    if (hasLoadedBefore) {
      try {
        const res = await fetchChatMessages(effectiveId, { limit: 100 });
        if (res.success) {
          setMessages(effectiveId, res.data || [], {
            hasMore: (res.data?.length ?? 0) >= 100,
            cursor: res.data && res.data.length > 0 ? res.data[res.data.length - 1]?.id : undefined
          });
        }
      } catch {}
      loadMembers(effectiveId);
      return;
    }
    setLoadingMessages(true);
    try {
      const res = await fetchChatMessages(effectiveId, { limit: 100 });
      if (res.success) {
        const oldestMsg = res.data && res.data.length > 0 ? res.data[res.data.length - 1] : null;
        setMessages(effectiveId, res.data || [], {
          hasMore: (res.data?.length ?? 0) >= 100,
          cursor: oldestMsg?.id
        });
      } else if (res.error?.code === 'NOT_FOUND') {
        if (!isMockId) {
          setMessages(channelId, []);
          setActiveChannel(null);
          toast.error('Kênh chat không tồn tại hoặc đã bị xóa');
        }
      }

      if (activeServerId !== 'home') {
        loadMembers(effectiveId);
      } else {
        setChannelMembers([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadMoreMessages = async () => {
    if (!activeChannelId || loadingMessages || loadingMore) return;

    const store = useChatStore.getState();
    const hasMore = store.hasMoreByChannelId[activeChannelId] ?? true;
    const cursor = store.cursorByChannelId[activeChannelId];

    if (!hasMore || !cursor) return;

    setLoadingMore(true);
    try {
      const res = await fetchChatMessages(activeChannelId, { cursor, limit: 100 });
      if (res.success) {
        const oldestMsg = res.data && res.data.length > 0 ? res.data[res.data.length - 1] : null;
        setMessages(activeChannelId, res.data || [], {
          appendOlder: true,
          hasMore: (res.data?.length ?? 0) >= 100,
          cursor: oldestMsg?.id
        });
      }
    } catch (e) {
      console.error('Failed to load more messages:', e);
    } finally {
      setLoadingMore(false);
    }
  };

  const loadMembers = async (channelId: string) => {
    setLoadingMembers(true);
    try {
      const res = await fetchChannelMembers(channelId);
      if (res.success) {
        const members = res.data || [];
        setChannelMembers(members);
      }
    } catch (e) {
      console.error('Failed to fetch members:', e);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!activeChannelId) return;

    const currentMsgs = messagesByChannelId[activeChannelId] || [];
    const msg = currentMsgs.find(m => m.id === messageId);
    if (msg) {
      const existingEmojiTypes = new Set(msg.reactions?.map(r => r.emoji));
      if (existingEmojiTypes.size >= 10 && !existingEmojiTypes.has(emoji)) {
        toast.error('Chỉ được thêm tối đa 10 loại biểu cảm khác nhau cho một tin nhắn');
        return;
      }
    }

    toggleMessageReaction(messageId, emoji)
      .then(response => {
        if (response.success) {
          updateMessage(activeChannelId, response.data);
        } else {
          toast.error(response.error?.message || 'Không thể thực hiện cảm xúc');
        }
      })
      .catch(err => {
        console.error('Reaction error:', err);
        toast.error('Lỗi khi thực hiện cảm xúc');
      });
  };

  const handleSendMessage = async (text?: string | any) => {
    const isTextString = typeof text === 'string';
    const rawDraft = (isTextString ? text : messageDraft) || '';
    if ((!rawDraft.trim() && pendingAttachments.length === 0 && !activeCommand) || !activeChannelId || !userId) return;

    let draft = rawDraft.trim();
    const attachments = [...pendingAttachments];
    const currentReplyToId = replyToId;

    if (activeCommand) {
      draft = `${activeCommand} ${draft}`.trim();
    }

    if (draft.startsWith('/tt ')) {
      const tiktokLink = draft.replace('/tt ', '').trim();
      if (tiktokLink) {
        const tempId = `temp-tt-${Date.now()}`;
        const tempMsg: ChatMessage = {
          id: tempId,
          userId: userId,
          content: 'Đang xử lý video TikTok...',
          createdAt: new Date().toISOString(),
          user: authUser ? {
            profile: {
              fullName: authUser.fullName,
              avatarUrl: authUser.avatarUrl
            },
            email: authUser.email
          } : undefined,
          attachments: []
        } as any;
        pushMessage(activeChannelId, tempMsg);

        setMessageDraft('');
        setPendingAttachments([]);
        setReplyToId(null);
        setActiveCommand(null);

        try {
          const result = await fetchTikTokInfo(tiktokLink);
          setMessages(activeChannelId, (messagesByChannelId[activeChannelId] || []).filter(m => m.id !== tempId));

          if (result.success && result.data) {
            const meta = result.data;
            setCommandHistory(prev => [tiktokLink, ...prev.filter(l => l !== tiktokLink)].slice(0, 50));
            setHistoryIndex(-1);

            const sendRes = await sendChatMessage(activeChannelId, {
              content: `[TikTok] ${meta.title}`,
              replyToId: currentReplyToId,
              attachments: [
                {
                  name: `${meta.id}.mp4`,
                  url: meta.playUrl,
                  type: 'video/mp4',
                  size: 0,
                  metadata: {
                    provider: 'tiktok',
                    originalUrl: tiktokLink,
                    author: meta.author,
                    title: meta.title,
                    duration: meta.duration,
                    videoWidth: meta.width,
                    videoHeight: meta.height
                  }
                }
              ]
            });

            if (sendRes.success) {
              pushMessage(activeChannelId, sendRes.data);
              setTimeout(() => scrollToBottom(true), 100);
            }
          } else {
            toast.error(result.error?.message || 'Không thể lấy video TikTok');
          }
        } catch {
          toast.error('Lỗi khi tải video TikTok');
        }
        return;
      }
    }

    let tempMsgId: string | null = null;

    try {
      tempMsgId = `optimistic-${Date.now()}`;
      const optimisticMessage: ChatMessage = {
        id: tempMsgId,
        userId: userId,
        content: draft || "",
        createdAt: new Date().toISOString(),
        user: authUser ? {
          profile: {
            fullName: authUser.fullName,
            avatarUrl: authUser.avatarUrl
          },
          email: authUser.email
        } : undefined,
        attachments: attachments,
        replyToId: currentReplyToId
      } as any;

      pushMessage(activeChannelId, optimisticMessage);

      setMessageDraft('');
      setPendingAttachments([]);
      setReplyToId(null);
      setActiveCommand(null);
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
      setTimeout(() => scrollToBottom(true), 100);

      const finalAttachments: any[] = [];
      const toUpload = attachments.filter(a => a.file);
      const alreadyUploaded = attachments.filter(a => !a.file);

      finalAttachments.push(...alreadyUploaded);

      if (toUpload.length > 0) {
        setIsUploading(true);
        try {
          for (const item of toUpload) {
            const uploaded: any = await performUpload(item.id, item.file, (percent) => {
              const currentMsgs = useChatStore.getState().messagesByChannelId[activeChannelId] || [];
              const msg = currentMsgs.find(m => m.id === tempMsgId);
              if (msg) {
                const updatedAttachments = msg.attachments?.map((a: any) =>
                  a.id === item.id ? { ...a, progress: percent, isUploading: true } : a
                );
                updateMessage(activeChannelId, { ...msg, attachments: updatedAttachments });
              }
            });
            finalAttachments.push({
              ...uploaded,
              metadata: item.metadata || uploaded.metadata
            });
          }
        } catch (err: any) {
          console.error('Sequence upload failed:', err);
          toast.error(err.message || 'Lỗi khi tải lên tệp tin');
          setMessages(activeChannelId, (useChatStore.getState().messagesByChannelId[activeChannelId] || []).filter(m => m.id !== tempMsgId));
          setIsUploading(false);
          return;
        }
        setIsUploading(false);
      }

      const response = await sendChatMessage(activeChannelId, {
        content: draft || "",
        replyToId: currentReplyToId,
        attachments: finalAttachments.length > 0 ? finalAttachments : undefined
      });

      if (response.success) {
        setMessages(activeChannelId, (useChatStore.getState().messagesByChannelId[activeChannelId] || []).map(m =>
          m.id === tempMsgId ? response.data : m
        ));
        bumpChannelActivity(activeChannelId);
      } else {
        setMessages(activeChannelId, (useChatStore.getState().messagesByChannelId[activeChannelId] || []).filter(m => m.id !== tempMsgId));
        toast.error(response.error?.message || 'Gửi tin nhắn thất bại');
      }
    } catch (e: any) {
      console.error('Send message error:', e);
      if (activeChannelId && tempMsgId) {
        setMessages(activeChannelId, (useChatStore.getState().messagesByChannelId[activeChannelId] || []).filter(m => m.id !== tempMsgId));
      }
      toast.error(e.message || 'Lỗi gửi tin nhắn');
    }
  };

  const performUpload = async (tempId: string, file: File, onProgress?: (percent: number) => void) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (onProgress) onProgress(100);
        resolve({
          name: file.name,
          url: URL.createObjectURL(file),
          type: file.type,
          size: file.size,
        });
      }, 300);
    });
  };

  const handleFileUpload = async (files: File[]) => {
    if (!files.length) return;
    const newAttachments = await Promise.all(files.map(async (file) => {
      let metadata: any = {};
      if (file.type.startsWith('video/')) {
        const dims = await getVideoDimensions(file);
        if (dims) {
          metadata.videoWidth = dims.width;
          metadata.videoHeight = dims.height;
        }
      }
      return {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        type: file.type,
        url: URL.createObjectURL(file),
        file: file,
        isUploading: false,
        progress: 0,
        metadata
      };
    }));
    setPendingAttachments(prev => [...prev, ...newAttachments.filter(Boolean)]);
  };

  const handlePaste = async (event: React.ClipboardEvent) => {
    const items = event.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length === 0) return;
    event.preventDefault();

    const newAttachments = await Promise.all(files.map(async (file) => {
      let metadata: any = {};
      if (file.type.startsWith('video/')) {
        const dims = await getVideoDimensions(file);
        if (dims) {
          metadata.videoWidth = dims.width;
          metadata.videoHeight = dims.height;
        }
      }
      return {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        type: file.type,
        url: URL.createObjectURL(file),
        file: file,
        isUploading: false,
        progress: 0,
        metadata
      };
    }));
    setPendingAttachments(prev => [...prev, ...newAttachments.filter(Boolean)]);
  };

  const handleOpenLightbox = async (url: string, type?: string, name?: string, size?: number, thumbnail?: string, metadata?: any) => {
    if (type?.startsWith('video/') || url.match(/\.(mp4|webm|mov|ogg)$/i) || metadata?.provider === 'tiktok') {
      setLightboxType('video');
      setLightboxImage(url);
      setLightboxFileName(name || 'Video');
      setLightboxFileSize(size ? formatFileSize(size) : '');
      setLightboxThumbnail(thumbnail || null);
      setLightboxMetadata(metadata || null);
      return;
    }
    if (type === 'application/pdf' || name?.match(/\.pdf$/i)) {
      setLightboxType('pdf');
      setLightboxImage(url);
      setLightboxFileName(name || 'Tài liệu PDF');
      setLightboxFileSize(size ? formatFileSize(size) : '');
      return;
    }
    if (type === 'text/plain' || type?.startsWith('text/') || name?.match(/\.(txt|md|js|ts|json|py|cpp|c|h|css|html|lua)$/i)) {
      setLightboxType('text');
      setLightboxImage(url);
      setLightboxFileName(name || 'Tệp văn bản');
      setLightboxFileSize(size ? formatFileSize(size) : '');
      if (textCacheRef.current[url]) {
        setLightboxText(textCacheRef.current[url]);
      } else {
        setLightboxText(null);
        try {
          const res = await fetch(url);
          const text = await res.text();
          textCacheRef.current[url] = text;
          setLightboxText(text);
        } catch {
          setLightboxText('Không thể đọc nội dung tệp.');
        }
      }
      return;
    }
    setLightboxType('image');
    setLightboxImage(url);
    setLightboxFileName(name || 'Hình ảnh');
    setLightboxFileSize(size ? formatFileSize(size) : '');
    setLightboxZoom(1);
    setLightboxOffset({ x: 0, y: 0 });
  };

  const handleDownload = useCallback(async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error('Download failed:', e);
      toast.error('Tải xuống thất bại');
    }
  }, []);

  function scrollToBottom(force = false) {
    if (!scrollRef.current) return;
    if (force) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  const searchIdRef = useRef(0);

  const handleUserSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) {
      setIsSearching(false);
      setSearchResults([]);
      return;
    }
    const searchId = ++searchIdRef.current;
    setIsSearching(true);
    try {
      const res = await searchUsers(q);
      if (searchId !== searchIdRef.current) return;
      if (res.success) {
        setSearchResults(res.data || []);
      } else {
        setSearchResults([]);
        setIsSearching(false);
      }
    } catch (e) {
      if (searchId !== searchIdRef.current) return;
      console.error(e);
      setSearchResults([]);
      setIsSearching(false);
    }
  };

  const handleOpenDM = async (targetUserId: string) => {
    try {
      const res = await openDirectMessage([targetUserId]);
      if (res.success) {
        setDirectMessages([res.data, ...directMessages.filter((d: any) => d.id !== res.data.id)]);
        setActiveServer('home');
        setActiveChannel(res.data.id);
        setIsSearching(false);
        setSearchQuery('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDmSearch = async (q: string) => {
    setDmSearchQuery(q);
    const trimmed = q.trim();
    if (!trimmed) {
      setDmSearchResults([]);
      return;
    }
    const searchId = ++dmSearchIdRef.current;
    try {
      const res = await searchUsers(trimmed);
      if (searchId !== dmSearchIdRef.current) return;
      if (res.success) {
        setDmSearchResults(res.data || []);
      } else {
        setDmSearchResults([]);
        console.warn('Search returned error:', res.error);
      }
    } catch (e) {
      if (searchId !== dmSearchIdRef.current) return;
      console.error('Search failed:', e);
      setDmSearchResults([]);
    }
  };

  const toggleUserSelection = (id: string) => {
    setSelectedUserIds(prev =>
      prev.includes(id) ? prev.filter(uid => uid !== id) : [...prev, id]
    );
  };

  const handleCreateDM = async () => {
    if (selectedUserIds.length === 0) return;
    try {
      const res = await openDirectMessage(selectedUserIds);
      if (res.success) {
        setDirectMessages([res.data, ...directMessages.filter((d: any) => d.id !== res.data.id)]);
        setActiveServer('home');
        setActiveChannel(res.data.id);
        setShowNewDMModal(false);
        setSelectedUserIds([]);
        setDmSearchQuery('');
      }
    } catch (e) {
      console.error(e);
      toast.error('Không thể tạo tin nhắn');
    }
  };

  const handleGlobalDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleGlobalDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      setIsDraggingOver(true);
    }
  };

  const handleGlobalDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
    }
  };

  const handleGlobalDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const newAttachments = await Promise.all(Array.from(files).map(async (file, i) => {
        let metadata: any = {};
        if (file.type.startsWith('video/')) {
          const dims = await getVideoDimensions(file);
          if (dims) {
            metadata.videoWidth = dims.width;
            metadata.videoHeight = dims.height;
          }
        }
        return {
          id: `temp-${Date.now()}-${i}-drop`,
          name: file.name,
          type: file.type,
          url: URL.createObjectURL(file),
          file: file,
          isUploading: false,
          progress: 0,
          metadata
        };
      }));

      setPendingAttachments(prev => [...prev, ...newAttachments.filter(Boolean)]);
    }
  };

  const selfMember = useMemo<ChatMember>(() => {
    const freshMember = channelMembers.find(m =>
      String((m.id || m.userId || m.user_id)) === String(authUser?.userId) ||
      String((m.id || m.userId || m.user_id)) === 'EMP-951954' ||
      (m.email && authUser?.email && String(m.email).toLowerCase() === String(authUser.email).toLowerCase())
    );
    const profile = freshMember?.user?.profile || freshMember?.profile || {};

    const name = freshMember?.name || freshMember?.fullName || profile.fullName || authUser?.fullName || 'Thành viên';
    const avatarUrl = freshMember?.avatarUrl || profile.avatarUrl || authUser?.avatarUrl || '';
    const email = freshMember?.email || authUser?.email || 'huytung.dev@kiyovn.com';
    const roleGroup = freshMember?.roleGroup || 'TRƯỞNG NHÓM & QUẢN LÝ';
    const roles = freshMember?.roles || ['Trưởng Nhóm Kỹ Thuật', 'Tech Lead'];
    const color = freshMember?.color || '#3B82F6';
    const status = freshMember?.status || 'Building next-gen systems 🚀';

    return {
      id: freshMember?.id || authUser?.userId || 'EMP-951954',
      name,
      username: email.split('@')[0],
      email,
      roleGroup,
      presence: 'online',
      color,
      avatarUrl,
      badges: freshMember?.badges || ['⚡', '🛡️'],
      roles,
      status
    };
  }, [authUser, userId, channelMembers]);

  if (!mounted) return null;

  return (
    <ChatThemeProvider className="w-full h-full">
      <div
        className={cn(
          "chat-layout-wrapper flex h-full w-full bg-[var(--chat-bg)] text-[var(--chat-text-main)] overflow-hidden outline-none font-sans",
          immersive ? "fixed inset-0 z-[100] h-[100dvh]" : "relative h-full"
        )}
        style={{
          display: 'flex',
          flexDirection: 'row',
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          backgroundColor: 'var(--chat-bg)'
        }}
        onDragOver={handleGlobalDragOver}
        onDragEnter={handleGlobalDragEnter}
        onDragLeave={handleGlobalDragLeave}
        onDrop={handleGlobalDrop}
      >
        {/* Drag Overlay */}
        {isDraggingOver && (
          <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-300 pointer-events-none">
            <div className="w-[320px] h-[220px] bg-[#5865f2] rounded-[12px] shadow-2xl flex flex-col items-center justify-center p-6 relative animate-in zoom-in-95 duration-200">
              <div className="absolute inset-3 border-[2px] border-dashed border-white/40 rounded-[8px] flex flex-col items-center justify-center gap-4">
                <div className="relative h-12 w-20 flex items-center justify-center">
                  <div className="absolute left-2 -rotate-12 bg-white/20 backdrop-blur-md rounded p-1.5 shadow-lg transform translate-x-[-12px]">
                    <FileText className="size-6 text-white/60" />
                  </div>
                  <div className="absolute z-10 bg-white rounded p-2.5 shadow-xl transform scale-110">
                    <ImageIcon className="size-6 text-[#5865f2]" />
                  </div>
                  <div className="absolute right-2 rotate-12 bg-white/20 backdrop-blur-md rounded p-1.5 shadow-lg transform translate-x-[12px]">
                    <FileIcon className="size-6 text-white/60" />
                  </div>
                </div>
                <div className="text-center px-2">
                  <h3 className="text-[20px] font-extrabold text-white m-0">
                    Tải lên # {(servers || []).find(s => s.id === activeServerId)?.name || 'máy-chủ'}
                  </h3>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Overlay */}
        {(isSidebarOpen || isMembersOpen) && isMobile && (
          <div
            className="fixed inset-0 bg-black/60 z-[110] transition-opacity duration-300"
            onClick={() => { setIsSidebarOpen(false); setIsMembersOpen(false); }}
          />
        )}

        {/* Server Rail */}
        <div
          className={cn(
            "chat-server-rail flex w-[72px] flex-col gap-2 bg-[var(--chat-sidebar-servers)] border-r border-[var(--chat-border)] py-3 shrink-0 transition-transform duration-300 z-[120]",
            isMobile ? "fixed inset-y-0 left-0 -translate-x-full h-full" : "relative translate-x-0 h-full",
            isSidebarOpen && isMobile && "translate-x-0"
          )}
          style={{
            width: '72px',
            minWidth: '72px',
            maxWidth: '72px',
            height: '100%',
            backgroundColor: 'var(--chat-sidebar-servers)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: '12px',
            paddingBottom: '12px',
            flexShrink: 0
          }}
        >
          <HomeIcon active={activeServerId === 'home'} onClick={() => setActiveServer('home')} />
          <div className="w-8 h-[2px] bg-[var(--chat-border)] rounded mx-auto my-0.5" style={{ width: '32px', height: '2px', backgroundColor: 'var(--chat-border)' }} />
          <div className="flex flex-1 flex-col gap-2 w-full overflow-y-auto no-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', overflowY: 'auto' }}>
            {(servers || []).map((server) => (
              <ServerIcon key={server.id} server={server} active={activeServerId === server.id} onClick={() => setActiveServer(server.id)} />
            ))}
            <div className="h-4 shrink-0" />
          </div>
          <div className="mt-auto flex flex-col items-center gap-2 pt-2 border-t border-[var(--chat-border)] w-full">
            <button
              onClick={() => navigate(isAdmin ? '/admin/dashboard' : '/employee/home')}
              title={isAdmin ? "Quay lại Bảng điều khiển Quản trị" : "Quay lại Trang chủ Nhân viên"}
              className="group relative flex size-12 items-center justify-center rounded-[24px] bg-[var(--chat-panel)] text-[var(--chat-text-muted)] transition-all duration-200 hover:rounded-[16px] hover:bg-[#009688] hover:text-white cursor-pointer border-none"
              style={{ width: '48px', height: '48px', borderRadius: '24px', backgroundColor: 'var(--chat-panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
            >
              <LayoutGrid className="size-5" />
            </button>
          </div>
        </div>

        {/* Channel Sidebar */}
        <div
          className={cn(
            "chat-channel-sidebar flex w-[290px] flex-col bg-[var(--chat-sidebar-channels)] shrink-0 border-r border-[var(--chat-border)] transition-transform duration-300 z-[120]",
            isMobile ? "fixed inset-y-0 left-[72px] -translate-x-[calc(100%+72px)] h-full" : "relative translate-x-0 h-full",
            isSidebarOpen && isMobile && "translate-x-0"
          )}
          style={{
            width: '290px',
            minWidth: '290px',
            maxWidth: '290px',
            height: '100%',
            backgroundColor: 'var(--chat-sidebar-channels)',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            borderRight: '1px solid var(--chat-border)'
          }}
        >
          <div className="flex h-12 items-center px-4 border-b border-[var(--chat-border)]" style={{ height: '48px', minHeight: '48px', display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--chat-border)' }}>
            {activeServerId === 'home' ? (
              <input
                className="h-7 w-full rounded bg-[var(--chat-sidebar-servers)] px-2 text-xs outline-none text-[var(--chat-text-main)] border-none"
                style={{ height: '28px', width: '100%', borderRadius: '4px', backgroundColor: 'var(--chat-sidebar-servers)', padding: '0 8px', fontSize: '12px', outline: 'none', border: 'none', color: 'var(--chat-text-main)' }}
                placeholder="Tìm cuộc hội thoại"
                value={searchQuery}
                onChange={(e) => handleUserSearch(e.target.value)}
              />
            ) : (
              <button className="flex w-full items-center justify-between font-bold hover:bg-white/5 px-2 py-1 rounded transition-colors truncate cursor-pointer text-[var(--chat-text-main)] border-none bg-transparent" style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', fontWeight: 'bold', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--chat-text-main)' }}>
                <span className="truncate">{(servers || []).find(s => s.id === activeServerId)?.name || 'Máy chủ'}</span>
                <ChevronDown className="size-4 shrink-0" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar pt-1 pb-3 px-2" style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 12px 8px' }}>
            {activeServerId === 'home' ? (
              <>
                <div className="mt-1 px-2 text-[11px] font-bold uppercase text-[var(--chat-text-muted)] flex items-center justify-between group" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--chat-text-muted)', padding: '4px 8px' }}>
                  <span>Tin nhắn trực tiếp</span>
                  <Plus className="size-3.5 cursor-pointer opacity-60 hover:opacity-100 transition-opacity" onClick={() => setShowNewDMModal(true)} />
                </div>
                <div className="mt-1 space-y-0.5" style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                  {isSearching ? (
                    <>
                      {(searchResults || []).length > 0 && (
                        <button className="chat-nav-btn flex w-full items-center gap-1 rounded-[var(--chat-radius)] px-2 py-1.5 hover:bg-[var(--chat-hover)] text-left mb-1 text-[var(--chat-primary)] font-medium cursor-pointer border-none bg-transparent" onClick={() => { setShowNewDMModal(true); setIsSearching(false); setSearchQuery(''); }}>
                          <MessageSquare className="size-4" />
                          <span className="text-sm truncate">Tin Nhắn Mới</span>
                        </button>
                      )}
                      {(searchResults || []).map(u => (
                        <button key={u.id} className="chat-nav-btn flex w-full items-center gap-2 rounded-[var(--chat-radius)] px-2 py-1.5 hover:bg-[var(--chat-hover)] text-left cursor-pointer border-none bg-transparent" onClick={() => handleOpenDM(u.id)}>
                          <Avatar name={u.fullName} color="var(--chat-primary)" src={u.avatarUrl} size="sm" />
                          <span className="text-sm font-medium truncate text-[var(--chat-text-secondary)]">{u.fullName}</span>
                        </button>
                      ))}
                      {(searchResults || []).length === 0 && (
                        <div className="py-4 text-center text-xs text-[var(--chat-text-muted)]">
                          <button className="chat-nav-btn flex w-full items-center gap-2 justify-center rounded-[var(--chat-radius)] px-2 py-2 hover:bg-[var(--chat-hover)] text-[var(--chat-primary)] font-medium cursor-pointer border-none bg-transparent" onClick={() => { setShowNewDMModal(true); setIsSearching(false); setSearchQuery(''); }}>
                            <Plus className="size-4" />
                            <span>Tạo Tin Nhắn Mới</span>
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    (directMessages || []).map((dm: any) => {
                      const other = (dm?.members || []).find((m: any) => String((m.userId || m.user_id)) !== String(userId));
                      const name = other?.user?.profile?.fullName || dm?.name || 'Tin nhắn riêng';
                      return (
                        <button
                          key={dm.id}
                          className={cn(
                            "chat-nav-btn group flex w-full items-center gap-2 rounded-[var(--chat-radius)] px-2 py-1.5 cursor-pointer text-left border-none bg-transparent",
                            activeChannelId === dm.id ? "active bg-[var(--chat-selected)] text-[var(--chat-text-main)] font-bold" : "text-[var(--chat-text-secondary)] hover:bg-[var(--chat-hover)] hover:text-[var(--chat-text-main)]"
                          )}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: 'var(--chat-radius, 6px)',
                            border: 'none',
                            backgroundColor: activeChannelId === dm.id ? 'var(--chat-selected)' : 'transparent',
                            color: activeChannelId === dm.id ? 'var(--chat-text-main)' : 'var(--chat-text-secondary)',
                            cursor: 'pointer',
                            textAlign: 'left'
                          }}
                          onClick={() => setActiveChannel(dm.id)}
                        >
                          <Avatar name={name} color="var(--chat-primary)" src={other?.user?.profile?.avatarUrl} size="sm" presence="online" />
                          <span className="truncate text-sm font-medium" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {(channels || []).map(c => (
                  <button
                    key={c.id}
                    className={cn(
                      "chat-nav-btn flex w-full items-center gap-2 rounded px-2.5 py-2 transition-colors cursor-pointer text-left border-none bg-transparent",
                      activeChannelId === c.id ? "active bg-[var(--chat-selected)] text-[var(--chat-text-main)] font-bold" : "text-[var(--chat-text-secondary)] hover:bg-[var(--chat-hover)] hover:text-[var(--chat-text-main)]"
                    )}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 'var(--chat-radius, 6px)',
                      border: 'none',
                      backgroundColor: activeChannelId === c.id ? 'var(--chat-selected)' : 'transparent',
                      color: activeChannelId === c.id ? 'var(--chat-text-main)' : 'var(--chat-text-secondary)',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                    onClick={() => setActiveChannel(c.id)}
                  >
                    <Hash className={cn("size-5 shrink-0", activeChannelId === c.id ? "opacity-100 text-[var(--chat-text-main)]" : "opacity-50 text-[var(--chat-text-muted)]")} style={{ width: '20px', height: '20px', flexShrink: 0 }} />
                    <span className="truncate text-[15px] font-medium min-w-0 flex-1" style={{ lineHeight: '1.4', paddingBottom: '2px' }}>{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* User bar */}
          <div className="px-2 pb-2 mt-auto" style={{ padding: '0 8px 8px 8px', marginTop: 'auto' }}>
            <div
              className="flex items-center gap-2 bg-[var(--chat-user-bar)] px-2 py-1.5 h-[52px] rounded-[var(--chat-radius)] cursor-pointer transition-colors hover:bg-[var(--chat-hover)]"
              style={{
                height: '52px',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--chat-user-bar)',
                borderRadius: 'var(--chat-radius, 6px)',
                padding: '0 8px',
                cursor: 'pointer'
              }}
              onClick={(e) => {
                if (isMobile) {
                  setProfileAnchor({ member: selfMember, style: {} });
                } else {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setProfileAnchor({
                    member: selfMember,
                    style: {
                      left: `${rect.left}px`,
                      bottom: `${window.innerHeight - rect.top + 8}px`,
                      width: '250px'
                    }
                  });
                }
              }}
            >
              <div className="relative shrink-0">
                <Avatar name={selfMember.name} color={selfMember.color} presence="online" src={selfMember.avatarUrl} size="sm" />
              </div>
              <div className="flex flex-col min-w-0 flex-1 overflow-hidden" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <span className="text-[14px] font-bold leading-tight truncate text-[var(--chat-text-main)]" style={{ fontSize: '14px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--chat-text-main)' }}>
                  {selfMember.name}
                </span>
                <span className="text-[11px] text-[var(--chat-text-muted)] leading-tight italic truncate max-w-full mt-0.5" style={{ fontSize: '11px', color: 'var(--chat-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selfMember.status || selfMember.email || selfMember.username}
                </span>
              </div>
              <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <button className="p-1 rounded text-[var(--chat-text-muted)] hover:text-[var(--chat-text-main)] hover:bg-[var(--chat-hover)] transition-colors cursor-pointer border-none bg-transparent" title="Cài đặt âm thanh">
                  <Mic className="size-4" />
                </button>
                <button className="p-1 rounded text-[var(--chat-text-muted)] hover:text-[var(--chat-text-main)] hover:bg-[var(--chat-hover)] transition-colors cursor-pointer border-none bg-transparent" onClick={(e) => { e.stopPropagation(); setShowSettings(true); }} title="Cài đặt giao diện">
                  <Settings className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div
          className="chat-main-area flex flex-1 flex-col min-w-0 overflow-hidden bg-[var(--chat-bg)] relative h-full"
          style={{
            flex: '1 1 0%',
            minWidth: 0,
            height: '100%',
            backgroundColor: 'var(--chat-bg)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {loadingServers || (activeServerId !== 'home' && loadingChannels && !channels.length) ? (
            <div className="flex flex-1 items-center justify-center bg-[var(--chat-bg)]" style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <div className="size-10 animate-spin rounded-full border-4 border-[var(--chat-primary)] border-t-transparent" />
            </div>
          ) : !activeChannelId ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-[var(--chat-bg)]" style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '32px' }}>
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-[var(--chat-radius)] bg-[var(--chat-panel)] text-[var(--chat-text-muted)]" style={{ width: '96px', height: '96px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px', backgroundColor: 'var(--chat-panel)', color: 'var(--chat-text-muted)', marginBottom: '24px' }}>
                <MessageSquare className="size-12" style={{ width: '48px', height: '48px' }} />
              </div>
              <h2 className="text-2xl font-bold text-[var(--chat-text-main)] mb-2" style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--chat-text-main)', marginBottom: '8px' }}>Chưa chọn kênh hội thoại</h2>
              <p className="text-[var(--chat-text-muted)] max-w-[320px] leading-relaxed m-0" style={{ color: 'var(--chat-text-muted)', maxWidth: '320px', lineHeight: '1.6', margin: 0 }}>
                Hãy chọn một kênh từ máy chủ hoặc tin nhắn trực tiếp ở danh sách bên trái để bắt đầu trò chuyện.
              </p>
            </div>
          ) : (
            <>
              <header className="flex flex-col shrink-0 bg-[var(--chat-header)] border-b border-[var(--chat-border)]" style={{ height: '54px', minHeight: '54px', backgroundColor: 'var(--chat-header)', borderBottom: '1px solid var(--chat-border)', display: 'flex', justifyContent: 'center' }}>
                <div className="flex h-[54px] items-center justify-between px-4" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
                  <div className="flex items-center gap-1.5 min-w-0" style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    {isMobile && (
                      <button
                        className="p-2 -ml-2 rounded-[var(--chat-radius)] hover:bg-[var(--chat-hover)] text-[var(--chat-text-muted)] cursor-pointer border-none bg-transparent"
                        onClick={() => setIsSidebarOpen(true)}
                      >
                        <Menu className="size-6" />
                      </button>
                    )}
                    <div className="flex items-center gap-2 min-w-0" style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <Hash className="size-5 text-[var(--chat-text-muted)] shrink-0" style={{ width: '20px', height: '20px', flexShrink: 0 }} />
                      <span
                        className="font-bold truncate text-[16px] text-[var(--chat-text-main)]"
                        style={{
                          fontSize: '16px',
                          fontWeight: 700,
                          color: 'var(--chat-text-main)',
                          lineHeight: '1.4',
                          paddingBottom: '3px',
                          display: 'inline-block',
                          verticalAlign: 'middle',
                        }}
                      >
                        {activeServerId === 'home' ? (() => {
                          const dm = (directMessages || []).find(d => d.id === activeChannelId);
                          const other = (dm?.members || []).find((m: any) => String((m.userId || m.user_id)) !== String(userId));
                          return dm?.name || other?.user?.profile?.fullName || other?.user?.email || 'Trò chuyện';
                        })() : (channels || []).find(c => c.id === activeChannelId)?.name || (loadingChannels ? 'Đang tải...' : 'Kênh')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[var(--chat-text-secondary)]" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button className="p-2 rounded-[var(--chat-radius)] hover:bg-[var(--chat-hover)] transition-colors hidden sm:flex items-center justify-center cursor-pointer border-none bg-transparent text-[var(--chat-text-muted)]" title="Thông báo">
                      <BellOff className="size-5" />
                    </button>
                    <button className="p-2 rounded-[var(--chat-radius)] hover:bg-[var(--chat-hover)] transition-colors hidden sm:flex items-center justify-center cursor-pointer border-none bg-transparent text-[var(--chat-text-muted)]" title="Tin nhắn đã ghim">
                      <Pin className="size-5" />
                    </button>
                    <button
                      className={cn(
                        "p-2 rounded-[var(--chat-radius)] hover:bg-[var(--chat-hover)] transition-colors flex items-center justify-center cursor-pointer border-none bg-transparent text-[var(--chat-text-muted)]",
                        (showMemberList || isMembersOpen) && "text-[var(--chat-text-main)] bg-[var(--chat-hover)]"
                      )}
                      onClick={() => isMobile ? setIsMembersOpen(true) : setShowMemberList(!showMemberList)}
                      title="Danh sách thành viên"
                    >
                      <Users className="size-5" />
                    </button>
                    <button className="p-2 rounded-[var(--chat-radius)] hover:bg-[var(--chat-hover)] transition-colors hidden sm:flex items-center justify-center cursor-pointer border-none bg-transparent text-[var(--chat-text-muted)]" title="Trợ giúp">
                      <HelpCircle className="size-5" />
                    </button>
                  </div>
                </div>
              </header>

              <div className="flex flex-1 overflow-hidden min-h-0" style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
                <div className="flex flex-1 flex-col overflow-hidden relative min-h-0" style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden', position: 'relative', minHeight: 0 }}>
                  {loadingMessages && displayedMessages.length > 0 && (
                    <div className="absolute top-2 right-2 z-20 flex items-center justify-center p-2 rounded-full bg-[var(--chat-bg)]/80 shadow-sm border border-[var(--chat-border)]">
                      <div className="size-4 animate-spin rounded-full border-2 border-[var(--chat-primary)] border-t-transparent" />
                    </div>
                  )}

                  <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto pb-3 space-y-0.5 custom-scrollbar min-h-0 flex flex-col-reverse"
                    style={{
                      flex: 1,
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column-reverse',
                      paddingBottom: '12px',
                      minHeight: 0
                    }}
                    onScroll={(e) => {
                      const target = e.currentTarget;
                      const threshold = 100;
                      if (target.scrollHeight - target.clientHeight - Math.abs(target.scrollTop) < threshold) {
                        loadMoreMessages();
                      }
                    }}
                  >
                    {loadingMessages && (!activeChannelId || messagesByChannelId[activeChannelId] === undefined) ? (
                      <div className="flex flex-col-reverse gap-4 p-4">
                        {[...Array(6)].map((_, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <div className="size-10 rounded-full bg-[var(--chat-hover)] animate-pulse shrink-0" />
                            <div className="flex-1 space-y-2">
                              <div className="h-4 w-32 bg-[var(--chat-hover)] animate-pulse rounded" />
                              <div className="h-4 w-full bg-[var(--chat-hover)] animate-pulse rounded" />
                              <div className="h-4 w-3/4 bg-[var(--chat-hover)] animate-pulse rounded" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                        {(displayedMessages || []).map((msg, i) => {
                          const sender = msg.user || (msg as any).sender;
                          const msgMember: ChatMember = {
                            id: msg.userId || (msg as any).user_id || sender?.id,
                            name: sender?.profile?.fullName || sender?.fullName || sender?.email || (msg.userId === userId ? authUser?.fullName || authUser?.email : 'Người dùng'),
                            username: sender?.email || msg.userId,
                            email: sender?.email,
                            roleGroup: sender?.role || 'member',
                            presence: 'online',
                            color: sender?.profile?.themeColor || 'var(--chat-primary)',
                            avatarUrl: sender?.profile?.avatarUrl,
                            badges: [],
                            roles: [],
                            permissions: [],
                            status: ''
                          };

                          const olderMsg = i < displayedMessages.length - 1 ? displayedMessages[i + 1] : null;
                          const currentDate = new Date(msg.createdAt || '').toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' });
                          const olderDate = olderMsg ? new Date(olderMsg.createdAt || '').toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
                          const showDateDivider = currentDate !== olderDate;
                          const olderTime = olderMsg ? new Date(olderMsg.createdAt || '').getTime() : 0;
                          const currentTime = new Date(msg.createdAt || '').getTime();
                          const diffMinutes = (currentTime - olderTime) / (1000 * 60);
                          const isLongGap = diffMinutes > 5;
                          const parentMessage = msg.replyToId ? (displayedMessages || []).find(m => m.id === msg.replyToId) : undefined;

                          return (
                            <React.Fragment key={msg.id}>
                              <MessageItem
                                message={msg}
                                parentMessage={parentMessage}
                                isEmojiPickerOpen={emojiTargetMessageId === msg.id}
                                compact={!showDateDivider && olderMsg?.userId === msg.userId && !isLongGap && !msg.replyToId}
                                member={msgMember}
                                index={i}
                                theme={chatTheme}
                                isMentioned={msg.content?.includes(`@${authUser?.fullName}`)}
                                onAttachmentClick={handleOpenLightbox}
                                onResend={(link) => {
                                  setActiveCommand('/tt');
                                  setMessageDraft(link);
                                  inputRef.current?.focus();
                                }}
                                onProfileOpen={(m, t) => {
                                  if (isMobile) {
                                    setProfileAnchor({ member: m, style: {} });
                                  } else {
                                    const rect = t.getBoundingClientRect();
                                    const popoverHeight = 350;
                                    const roomBelow = window.innerHeight - rect.top;

                                    if (roomBelow < popoverHeight && rect.top > popoverHeight) {
                                      setProfileAnchor({
                                        member: m,
                                        style: {
                                          left: `${rect.right + 10}px`,
                                          bottom: `${window.innerHeight - rect.bottom}px`
                                        }
                                      });
                                    } else {
                                      setProfileAnchor({
                                        member: m,
                                        style: {
                                          left: `${rect.right + 10}px`,
                                          top: `${rect.top - 10}px`
                                        }
                                      });
                                    }
                                  }
                                }}
                                onReply={(id) => {
                                  setReplyToId(id);
                                  inputRef.current?.focus();
                                }}
                                onEmoji={(id, t) => {
                                  if (typeof t === 'string') {
                                    handleToggleReaction(id, t);
                                    return;
                                  }
                                  const rect = t.getBoundingClientRect();
                                  const pickerHeight = 450;
                                  let right = window.innerWidth - rect.right;
                                  let top = rect.top - pickerHeight - 10;

                                  if (top < 20) {
                                    top = rect.bottom + 10;
                                  }

                                  setEmojiTargetMessageId(id);
                                  setPickerStyle({
                                    position: 'fixed',
                                    top: `${top}px`,
                                    right: `${right}px`,
                                    zIndex: 9999,
                                    opacity: 1,
                                    visibility: 'visible'
                                  });
                                  setShowEmojiPicker(true);
                                }}
                              />
                              {showDateDivider && (
                                <div className="relative flex items-center py-2 my-0 px-4" style={{ display: 'flex', alignItems: 'center', padding: '8px 16px' }}>
                                  <div className="flex-1 border-t border-[var(--chat-border)]" style={{ flex: 1, borderTop: '1px solid var(--chat-border)' }} />
                                  <span className="px-2 text-[12px] font-bold text-[var(--chat-text-muted)] bg-[var(--chat-bg)]" style={{ padding: '0 8px', fontSize: '12px', fontWeight: 'bold', color: 'var(--chat-text-muted)' }}>
                                    {currentDate}
                                  </span>
                                  <div className="flex-1 border-t border-[var(--chat-border)]" style={{ flex: 1, borderTop: '1px solid var(--chat-border)' }} />
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}
                        {loadingMore && (
                          <div className="flex flex-col gap-4 p-4">
                            {[...Array(3)].map((_, i) => (
                              <div key={i} className="flex items-start gap-3">
                                <div className="size-10 rounded-full bg-muted animate-pulse shrink-0" />
                                <div className="flex-1 space-y-2">
                                  <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                                  <div className="h-4 w-full bg-muted animate-pulse rounded" />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    <div className="flex flex-col px-4 pt-2 pb-2 mb-0" style={{ padding: '8px 16px' }}>
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--chat-hover)] text-[var(--chat-text-secondary)]" style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '9999px', backgroundColor: 'var(--chat-hover)', marginBottom: '16px' }}>
                        {activeServerId === 'home' ? (
                          <div className="size-16 flex items-center justify-center bg-[var(--chat-primary)] rounded-full text-white text-2xl font-bold" style={{ width: '64px', height: '64px', borderRadius: '9999px', backgroundColor: 'var(--chat-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: '24px', fontWeight: 'bold' }}>
                            {(() => {
                              const dm = (directMessages || []).find(d => d.id === activeChannelId);
                              const other = (dm?.members || []).find((m: any) => String((m.userId || m.user_id)) !== String(userId));
                              const targetName = dm?.name || other?.user?.profile?.fullName || other?.user?.email || 'Chat';
                              return getInitials(targetName);
                            })()}
                          </div>
                        ) : (
                          <Hash className="size-10" style={{ width: '40px', height: '40px' }} />
                        )}
                      </div>
                      <h1 className="mb-1 text-3xl font-bold text-[var(--chat-text-main)] m-0" style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--chat-text-main)', margin: 0 }}>
                        {activeServerId === 'home' ? (() => {
                          const dm = (directMessages || []).find(d => d.id === activeChannelId);
                          const other = (dm?.members || []).find((m: any) => String((m.userId || m.user_id)) !== String(userId));
                          const targetName = other?.user?.profile?.fullName || other?.user?.email || dm?.name || 'Trò chuyện';
                          return targetName;
                        })() : `#${(channels || []).find(c => c.id === activeChannelId)?.name || 'Kênh'}`}
                      </h1>
                      <p className="text-[var(--chat-text-muted)] text-sm m-0 mt-1" style={{ fontSize: '14px', color: 'var(--chat-text-muted)', margin: '4px 0 0 0' }}>
                        {activeServerId === 'home' ? (() => {
                          const dm = (directMessages || []).find(d => d.id === activeChannelId);
                          const other = (dm?.members || []).find((m: any) => String((m.userId || m.user_id)) !== String(userId));
                          const targetName = other?.user?.profile?.fullName || other?.user?.email || dm?.name || 'Trò chuyện';
                          return `Đây là tin nhắn trực tiếp giữa bạn với ${targetName}.`;
                        })() : `Đây là sự khởi đầu của kênh #${(channels || []).find(c => c.id === activeChannelId)?.name || 'Kênh'}.`}
                      </p>
                    </div>
                  </div>

                  <div className="px-3 pb-3 pt-0" style={{ padding: '0 12px 12px 12px' }}>
                    <div
                      className="relative flex flex-col items-stretch min-h-[54px] rounded-[var(--chat-radius)] bg-[var(--chat-input-bg)] transition-colors"
                      style={{
                        backgroundColor: 'var(--chat-input-bg)',
                        borderRadius: 'var(--chat-radius, 8px)',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: '44px',
                        width: '100%',
                        position: 'relative'
                      }}
                    >
                      {replyToId && (() => {
                        const msg = displayedMessages.find(m => m.id === replyToId);
                        if (!msg) return null;
                        return (
                          <div className="flex items-center justify-between px-3 py-1.5 bg-black/10 border-b border-[var(--chat-border)] text-sm animate-in slide-in-from-bottom-2 duration-200" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid var(--chat-border)' }}>
                            <div className="flex items-center gap-2 overflow-hidden" style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                              <span className="text-[var(--chat-text-muted)] shrink-0">Đang trả lời</span>
                              <span className="font-bold text-[var(--chat-text-main)] shrink-0">@{msg.user?.profile?.fullName || msg.user?.email || 'Người dùng'}</span>
                              <span className="text-[var(--chat-text-muted)] truncate italic">{msg.content}</span>
                            </div>
                            <button onClick={() => setReplyToId(null)} className="p-1 rounded-full hover:bg-[var(--chat-hover)] text-[var(--chat-text-muted)] transition-colors cursor-pointer border-none bg-transparent">
                              <X className="size-4" />
                            </button>
                          </div>
                        );
                      })()}

                      {pendingAttachments.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-3 px-3 pb-2" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '12px 12px 8px 12px' }}>
                          {pendingAttachments.map((file, i) => {
                            const isMedia = file.type?.startsWith('image/') || file.type?.startsWith('video/');

                            if (!isMedia) {
                              return (
                                <div key={i} className={cn("relative h-[64px] w-[320px] rounded-[4px] p-2 flex items-center shrink-0 shadow-sm border transition-colors", chatTheme === 'light' ? "bg-[#f2f3f5] border-black/5" : "bg-[#2b2d31] border-white/5")} style={{ height: '64px', width: '320px', display: 'flex', alignItems: 'center', padding: '8px' }}>
                                  <div className="flex items-center gap-3 w-full">
                                    <div className="bg-[#5865f2] rounded size-10 flex items-center justify-center shrink-0" style={{ width: '40px', height: '40px', backgroundColor: '#5865f2', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
                                      {file.name.match(/\.(zip|rar|7z|tar|gz)$/i) ? <FileArchive className="size-6 text-white" /> : <FileText className="size-6 text-white" />}
                                    </div>
                                    <div className="flex flex-col min-w-0 flex-1 justify-center overflow-hidden">
                                      <span className={cn("text-[13px] font-semibold truncate leading-tight", chatTheme === 'light' ? "text-black" : "text-white")}>{file.name}</span>
                                      <span className="text-[#949ba4] text-[11px] whitespace-nowrap leading-tight">{formatFileSize(file.file?.size || 0)}</span>
                                    </div>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      {isViewable(file.name, file.type) && (
                                        <button onClick={() => handleOpenLightbox(getAttachmentUrl(file.url), file.type, file.name, (file as any).size, (file as any).thumbnail)} className="p-1.5 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-main)] hover:bg-[var(--chat-hover)] rounded-md transition-colors cursor-pointer border-none bg-transparent" title="Xem"><Eye className="size-5" /></button>
                                      )}
                                      <button onClick={() => setPendingAttachments(prev => prev.filter((_, idx) => idx !== i))} className="p-1.5 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-main)] hover:bg-[var(--chat-hover)] rounded-md transition-colors cursor-pointer border-none bg-transparent" title="Gỡ bỏ"><X className="size-5" /></button>
                                    </div>
                                  </div>
                                  {file.progress > 0 && (
                                    <div className="absolute bottom-0 left-0 right-0 h-[4px] overflow-hidden rounded-b-[4px]">
                                      <div className={cn("absolute inset-0", chatTheme === 'light' ? "bg-black/10" : "bg-[#1e1f22]")} />
                                      <div className="absolute inset-y-0 left-0 bg-[#5865f2] transition-all duration-300 ease-out" style={{ width: `${file.progress}%` }} />
                                    </div>
                                  )}
                                </div>
                              );
                            }

                            return (
                              <div key={i} className={cn("relative group rounded-lg overflow-hidden border transition-all h-[180px] w-[180px] shrink-0", chatTheme === 'light' ? "bg-[#f2f3f5] border-black/5" : "bg-[#2b2d31] border-white/5")} style={{ width: '180px', height: '180px', position: 'relative', borderRadius: '8px', overflow: 'hidden' }}>
                                <div className="absolute top-2 right-2 flex items-center bg-[#111214]/80 rounded-[4px] opacity-0 group-hover:opacity-100 transition-opacity z-10 p-0.5 shadow-lg backdrop-blur-sm">
                                  <button onClick={() => handleOpenLightbox(getAttachmentUrl(file.url), file.type, file.name, (file as any).size, (file as any).thumbnail)} className="p-1.5 text-[#dbdee1] hover:text-white transition-colors cursor-pointer border-none bg-transparent" title="Xem"><Eye className="size-4" /></button>
                                  <button className="p-1.5 text-[#dbdee1] hover:text-white transition-colors cursor-pointer border-none bg-transparent" title="Chỉnh sửa"><Pencil className="size-4" /></button>
                                  <button onClick={() => setPendingAttachments(prev => prev.filter((_, idx) => idx !== i))} className="p-1.5 text-[#f23f43] hover:text-[#fa777a] transition-colors cursor-pointer border-none bg-transparent" title="Xóa"><Trash2 className="size-4" /></button>
                                </div>
                                {file.isUploading && (
                                  <div className="absolute bottom-0 left-0 right-0 z-[10]">
                                    <div className="h-1 w-full bg-black/20 overflow-hidden">
                                      <div className="bg-[#5865f2] h-full transition-all duration-300 ease-out shadow-[0_0_8px_#5865f2]" style={{ width: `${(file as any).progress || 0}%` }} />
                                    </div>
                                    <div className="absolute bottom-2 right-2 bg-black/40 px-1.5 py-0.5 rounded text-[10px] font-black text-white leading-none select-none backdrop-blur-sm">{(file as any).progress || 0}%</div>
                                  </div>
                                )}
                                <div className="h-full w-full cursor-pointer flex items-center justify-center p-0" onClick={() => handleOpenLightbox(getAttachmentUrl(file.url), file.type, file.name, (file as any).size, (file as any).thumbnail)}>
                                  {file.type?.startsWith('video/') ? (
                                    <VideoRenderer src={getAttachmentUrl(file.url)} compact={true} />
                                  ) : (
                                    <img
                                      src={getAttachmentUrl(file.url)} alt=""
                                      className="h-full w-full object-cover transition-transform group-hover:scale-[1.05]"
                                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex items-center gap-2 px-3 py-[7px]" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px' }}>
                        {showEmojiPicker && createPortal(
                          <div className={cn("chat-theme-root fixed inset-0 z-[9999]", `chat-theme-${chatTheme}`, isMobile ? "bg-black/60 flex flex-col justify-end p-4 animate-in fade-in duration-200" : "bg-transparent")}
                            data-chat-theme={chatTheme}
                            onClick={() => { setShowEmojiPicker(false); setEmojiTargetMessageId(null); }}
                          >
                            <div className="pointer-events-auto" onClick={e => e.stopPropagation()} style={pickerStyle}>
                              <EmojiPicker tab={pickerTab} onTabChange={setPickerTab}
                                onSelect={(emoji) => {
                                  const emojiChar = typeof emoji === 'string' ? emoji : emoji.native;
                                  if (emojiTargetMessageId) {
                                    handleToggleReaction(emojiTargetMessageId, emojiChar);
                                  } else {
                                    setMessageDraft(prev => prev + emojiChar);
                                    setShowEmojiPicker(false);
                                    setEmojiTargetMessageId(null);
                                    inputRef.current?.focus();
                                  }
                                }}
                                onClose={() => { setShowEmojiPicker(false); setEmojiTargetMessageId(null); }}
                                className={cn(!isMobile && "origin-bottom-right")}
                              />
                            </div>
                          </div>,
                          document.body
                        )}

                        <FileUploadDialog open={uploadPickerOpen} onClose={() => setUploadPickerOpen(false)} onSelect={handleFileUpload} title="Chọn tệp gửi vào trò chuyện" />
                        <div className="relative shrink-0" style={{ position: 'relative', flexShrink: 0 }}>
                          <button className={cn("p-1.5 rounded-[var(--chat-radius)] transition-colors group cursor-pointer border-none bg-transparent", isUploading ? "animate-pulse text-[var(--chat-primary)]" : "text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-main)] hover:bg-[var(--chat-hover)]", showPlusMenu && "bg-[var(--chat-hover)] text-[var(--chat-text-main)]")}
                            onClick={() => setShowPlusMenu(!showPlusMenu)} disabled={isUploading}
                          >
                            {isUploading ? <Zap className="size-5 animate-spin" /> : <Plus className="size-5" />}
                          </button>

                          {showPlusMenu && (
                            <>
                              <div className="fixed inset-0 z-[50]" onClick={() => setShowPlusMenu(false)} />
                              <div className="absolute bottom-full left-0 mb-2 w-56 rounded-[var(--chat-radius)] bg-[var(--chat-panel)] border border-[var(--chat-border)] shadow-xl z-[60] overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
                                <div className="p-1">
                                  <button className="flex w-full items-center gap-3 px-3 py-2 rounded-[calc(var(--chat-radius)-4px)] hover:bg-[var(--chat-hover)] text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-main)] transition-colors text-sm font-medium cursor-pointer border-none bg-transparent"
                                    onClick={() => { setShowPlusMenu(false); setUploadPickerOpen(true); }}
                                  ><Upload className="size-4" /> Tải tệp lên</button>
                                  <div className="h-px bg-[var(--chat-border)] my-1 mx-1" />
                                  <button className="flex w-full items-center gap-3 px-3 py-2 rounded-[calc(var(--chat-radius)-4px)] hover:bg-[var(--chat-hover)] text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-main)] transition-colors text-sm font-medium cursor-pointer border-none bg-transparent"
                                    onClick={() => { setShowPlusMenu(false); }}
                                  ><BarChart3 className="size-4" /> Tạo bình chọn</button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="relative flex-1" style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                          {showCommandMenu && filteredCommands.length > 0 && (
                            <div className="absolute bottom-full left-0 mb-2 w-full max-w-[400px] rounded-lg bg-[var(--chat-panel)] border border-[var(--chat-border)] shadow-2xl z-[100] overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
                              <div className="p-2 border-b border-[var(--chat-border)] bg-[var(--chat-bg)] flex items-center gap-2">
                                <div className="bg-[var(--chat-primary)]/10 p-1.5 rounded-md text-[var(--chat-primary)]"><ChevronDown className="size-4" /></div>
                                <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--chat-text-muted)]">Tích hợp</span>
                              </div>
                              <div className="max-h-[300px] overflow-y-auto no-scrollbar p-1">
                                {filteredCommands.map((cmd, idx) => (
                                  <button key={cmd.name}
                                    className={cn("w-full flex flex-col items-start px-3 py-2 rounded-md transition-all text-left group cursor-pointer border-none bg-transparent", selectedCommandIndex === idx ? "bg-[var(--chat-primary)] text-white" : "hover:bg-[var(--chat-hover)] text-[var(--chat-text-main)]")}
                                    onClick={() => handleSelectCommand(cmd)}
                                  >
                                    <span className={cn("font-bold text-[14px]", selectedCommandIndex === idx ? "text-white" : "text-[var(--chat-text-main)] group-hover:text-[var(--chat-primary)]")}>{cmd.name}</span>
                                    <span className={cn("text-[12px] mt-0.5", selectedCommandIndex === idx ? "text-white/80" : "text-[var(--chat-text-muted)]")}>{cmd.description}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className={cn("flex items-center w-full bg-transparent min-h-0 max-h-[170px]", activeCommand && "gap-2")} style={{ display: 'flex', alignItems: 'center', width: '100%', background: 'transparent' }}>
                            {activeCommand && (
                              <div className="flex items-center h-7 px-2 rounded-[4px] bg-[var(--chat-primary)]/10 text-[var(--chat-primary)] font-bold text-[14px] shrink-0">{activeCommand}</div>
                            )}
                            <textarea
                              ref={inputRef}
                              className={cn("flex-1 resize-none bg-transparent py-[8px] text-[15px] outline-none thin-scrollbar min-h-0 max-h-[170px] text-[var(--chat-text-main)] font-normal placeholder:text-[var(--chat-text-secondary)] placeholder:font-normal leading-[24px] overflow-hidden border-none shadow-none", replyToId && "rounded-tl-none rounded-tr-none")}
                              style={{
                                flex: 1,
                                width: '100%',
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                color: 'var(--chat-text-main)',
                                fontSize: '15px',
                                lineHeight: '24px',
                                resize: 'none',
                                padding: '8px 0',
                                boxShadow: 'none'
                              }}
                              rows={1}
                              onPaste={handlePaste}
                              placeholder={activeCommand ? (commands.find(c => c.name === activeCommand)?.paramPlaceholder || 'Nhập nội dung...') : activeServerId === 'home' ? (() => {
                                const dm = (directMessages || []).find(d => d.id === activeChannelId);
                                const other = (dm?.members || []).find((m: any) => String((m.userId || m.user_id)) !== String(userId));
                                const targetName = other?.user?.profile?.fullName || other?.user?.email || dm?.name || 'Chat';
                                return `Nhắn ${targetName}`;
                              })() : `Nhắn tin #${(channels || []).find(c => c.id === activeChannelId)?.name || 'Kênh'}`}
                              value={messageDraft}
                              onChange={(e) => {
                                const val = e.target.value;
                                setMessageDraft(val);

                                if (activeChannelId) {
                                  const sock = getChatSocket(accessToken);
                                  if (sock) {
                                    const now = Date.now();
                                    const lastTyping = (window as any).__lastTypingTs || 0;
                                    if (val && now - lastTyping > 2000) {
                                      (window as any).__lastTypingTs = now;
                                      sock.emit('chat:typing', { channelId: String(activeChannelId), isTyping: true });
                                    }
                                    if ((window as any).__stopTypingTimer) clearTimeout((window as any).__stopTypingTimer);
                                    if (!val) {
                                      sock.emit('chat:typing', { channelId: String(activeChannelId), isTyping: false });
                                    } else {
                                      (window as any).__stopTypingTimer = setTimeout(() => {
                                        sock.emit('chat:typing', { channelId: String(activeChannelId), isTyping: false });
                                      }, 3000);
                                    }
                                  }
                                }

                                if (activeCommand === '/tt') {
                                  const tiktokLinkRegex = /https?:\/\/(?:www\.|vm\.|vt\.|v\.)?tiktok\.com\/[a-zA-Z0-9._\-/]+/i;
                                  if (tiktokLinkRegex.test(val)) {
                                    handleSendMessage(val);
                                    return;
                                  }
                                }

                                if (!activeCommand) {
                                  if (val === '/') {
                                    setShowCommandMenu(true);
                                    setCommandQuery('');
                                    setSelectedCommandIndex(0);
                                  } else if (val.startsWith('/') && !val.includes(' ')) {
                                    setShowCommandMenu(true);
                                    setCommandQuery(val);
                                    setSelectedCommandIndex(0);
                                  } else {
                                    setShowCommandMenu(false);
                                  }
                                }

                                const target = e.target;
                                target.style.height = '40px';
                                const scHeight = target.scrollHeight;
                                if (scHeight > 42) {
                                  target.style.height = `${Math.min(scHeight, 170)}px`;
                                  target.style.overflowY = scHeight > 170 ? 'auto' : 'hidden';
                                } else {
                                  target.style.overflowY = 'hidden';
                                }
                              }}
                              onKeyDown={(e) => {
                                if (showCommandMenu) {
                                  if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedCommandIndex(prev => (prev + 1) % filteredCommands.length); }
                                  else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedCommandIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length); }
                                  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); handleSelectCommand(filteredCommands[selectedCommandIndex]); }
                                  else if (e.key === 'Escape') { setShowCommandMenu(false); }
                                } else {
                                  if (e.key === 'Backspace' && messageDraft === '' && activeCommand) {
                                    setActiveCommand(null); setMessageDraft(activeCommand); setShowCommandMenu(true); setCommandQuery(activeCommand);
                                  } else if (e.key === 'ArrowUp' && messageDraft === '' && !activeCommand) {
                                    if (commandHistory.length > 0) {
                                      const nextIndex = historyIndex + 1;
                                      if (nextIndex < commandHistory.length) { setHistoryIndex(nextIndex); setActiveCommand('/tt'); setMessageDraft(commandHistory[nextIndex]); }
                                    }
                                  } else if (e.key === 'ArrowDown' && activeCommand && messageDraft === commandHistory[historyIndex]) {
                                    const nextIndex = historyIndex - 1;
                                    if (nextIndex >= 0) { setHistoryIndex(nextIndex); setMessageDraft(commandHistory[nextIndex]); }
                                    else { setHistoryIndex(-1); setActiveCommand(null); setMessageDraft(''); }
                                  } else if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
                                    e.preventDefault(); handleSendMessage();
                                  }
                                }
                              }}
                              onFocus={() => setShowEmojiPicker(false)}
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          <button ref={emojiButtonRef}
                            className={cn("p-1 rounded-[var(--chat-radius)] transition-colors cursor-pointer border-none bg-transparent", showEmojiPicker ? "text-[var(--chat-primary)] bg-[var(--chat-hover)]" : "text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-main)] hover:bg-[var(--chat-hover)]")}
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)} type="button"
                          ><Smile className="size-6" /></button>
                          <button
                            className={cn("p-1.5 rounded-[var(--chat-radius)] transition-all cursor-pointer border-none bg-transparent", (messageDraft.trim() || pendingAttachments.length > 0) ? "bg-[var(--chat-primary)] text-white scale-110 shadow-lg" : "text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-main)] hover:bg-[var(--chat-hover)]")}
                            style={{
                              backgroundColor: (messageDraft.trim() || pendingAttachments.length > 0) ? 'var(--chat-primary)' : 'transparent',
                              color: (messageDraft.trim() || pendingAttachments.length > 0) ? '#ffffff' : 'var(--chat-text-secondary)',
                              borderRadius: 'var(--chat-radius, 6px)',
                              border: 'none',
                              padding: '6px'
                            }}
                            onClick={handleSendMessage}
                          ><Send className="size-5" /></button>
                        </div>
                      </div>
                    </div>

                    {/* Discord-style Typing Indicator Bar below Input Box */}
                    <div
                      className="flex items-center min-h-[22px] px-1 text-[12px] text-[var(--chat-text-muted)] select-none"
                      style={{ minHeight: '22px', display: 'flex', alignItems: 'center', padding: '2px 4px', fontSize: '12px', color: 'var(--chat-text-muted)' }}
                    >
                      {activeChannelId && typingUsers.size > 0 && (() => {
                        const currentUid = String(userIdRef.current);
                        const names = Array.from(typingUsers.entries())
                          .filter(([uid]) => uid !== currentUid)
                          .map(([, t]) => t.fullName);
                        if (names.length === 0) return null;
                        const display = names.length <= 3 ? names.join(', ') : names.slice(0, 3).join(', ') + '...';
                        return (
                          <div className="flex items-center gap-1.5 animate-in fade-in duration-150" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="flex gap-0.5 items-center" style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                              <span className="size-1.5 rounded-full bg-[var(--chat-text-muted)] animate-bounce" style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: 'var(--chat-text-muted)', animationDelay: '0ms' }} />
                              <span className="size-1.5 rounded-full bg-[var(--chat-text-muted)] animate-bounce" style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: 'var(--chat-text-muted)', animationDelay: '150ms' }} />
                              <span className="size-1.5 rounded-full bg-[var(--chat-text-muted)] animate-bounce" style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: 'var(--chat-text-muted)', animationDelay: '300ms' }} />
                            </span>
                            <span className="italic" style={{ fontStyle: 'italic' }}>
                              <strong className="font-semibold not-italic text-[var(--chat-text-main)]" style={{ fontStyle: 'normal', fontWeight: 600, color: 'var(--chat-text-main)' }}>{display}</strong> đang nhập...
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Member Panel */}
                <ChatMemberPanel
                  open={showMemberList || isMembersOpen}
                  isMobile={isMobile}
                  isMembersOpen={isMembersOpen}
                  activeServerId={activeServerId}
                  activeChannelId={activeChannelId}
                  channelMembers={channelMembers}
                  selfMember={selfMember}
                  directMessages={directMessages}
                  userId={userId}
                  chatTheme={chatTheme}
                  onProfileOpen={(member, target) => {
                    let style: any = {};
                    if (target instanceof HTMLElement) {
                      const rect = target.getBoundingClientRect();
                      style = { left: `${rect.left - 265}px`, top: `${rect.top}px`, width: '250px' };
                    } else {
                      style = { left: target.x, top: target.y, width: 250 };
                    }
                    setProfileAnchor({ member, style });
                  }}
                  onClose={() => setIsMembersOpen(false)}
                />
              </div>
            </>
          )}
        </div>

        {/* Profile Card */}
        {profileAnchor && (
          <ProfileCard
            anchor={profileAnchor}
            onClose={() => setProfileAnchor(null)}
            theme={chatTheme}
            isMobile={isMobile}
          />
        )}

        {/* Settings Modal */}
        <ChatSettingsModal
          open={showSettings}
          chatTheme={chatTheme}
          onClose={() => setShowSettings(false)}
          onThemeChange={(t) => setChatTheme(t as 'dark' | 'light' | 'midnight')}
        />

        {/* New DM Modal */}
        <ChatNewDMModal
          open={showNewDMModal}
          chatTheme={chatTheme}
          dmSearchQuery={dmSearchQuery}
          dmSearchResults={dmSearchResults}
          selectedUserIds={selectedUserIds}
          directMessages={directMessages}
          onClose={() => { setShowNewDMModal(false); setSelectedUserIds([]); setDmSearchQuery(''); }}
          onSearch={handleDmSearch}
          onToggleUser={toggleUserSelection}
          onCreateDM={handleCreateDM}
        />

        {/* Lightbox */}
        <ChatLightbox
          image={lightboxImage}
          thumbnail={lightboxThumbnail}
          type={lightboxType}
          metadata={lightboxMetadata}
          text={lightboxText}
          fileName={lightboxFileName}
          fileSize={lightboxFileSize}
          zoom={lightboxZoom}
          origin={lightboxOrigin}
          offset={lightboxOffset}
          isDragging={isDragging}
          hasMoved={hasMoved}
          dragStart={dragStart}
          chatTheme={chatTheme}
          onClose={() => { setLightboxImage(null); setLightboxZoom(1); setLightboxOffset({ x: 0, y: 0 }); setLightboxOrigin('center center'); }}
          onZoomChange={setLightboxZoom}
          onOffsetChange={setLightboxOffset}
          onOriginChange={setLightboxOrigin}
          onDraggingChange={setIsDragging}
          onDragStartChange={setDragStart}
          onHasMovedChange={setHasMoved}
          onDownload={handleDownload}
          textRef={lightboxTextRef}
          imgRef={lightboxImgRef}
        />
      </div>
    </ChatThemeProvider>
  );
}
