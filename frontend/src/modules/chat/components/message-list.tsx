'use client';

import { memo, useRef, useEffect, useMemo } from 'react';
import { FileTextOutlined } from '@ant-design/icons';
import { useChatStore } from '../chat-store';

interface ChatMessageListProps {
  channelId: string;
  onLoadMore: (channelId: string) => void;
  onMessageClick?: (message: any) => void;
}

export const ChatMessageList = memo(function ChatMessageList({
  channelId, onLoadMore
}: ChatMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesByChannelId = useChatStore(s => s.messagesByChannelId);
  const hasMoreByChannelId = useChatStore(s => s.hasMoreByChannelId);

  const messages = useMemo(() => {
    const msgs = messagesByChannelId[channelId] ?? [];
    return msgs;
  }, [messagesByChannelId, channelId]);

  const hasMore = hasMoreByChannelId[channelId] ?? false;

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages.length]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
      {hasMore ? (
        <div className="flex justify-center py-2">
          <button
            onClick={() => onLoadMore(channelId)}
            className="text-xs text-[var(--chat-text-muted)] hover:text-[var(--chat-primary)] transition-colors"
          >
            Tải tin nhắn cũ hơn
          </button>
        </div>
      ) : (
        <div className="text-center py-4 text-xs text-[var(--chat-text-muted)]">
          Đây là khởi đầu của kênh chat này
        </div>
      )}

      {messages.map((message, index) => (
        <div key={message.id || index} className="px-3 py-1.5 rounded-lg hover:bg-[var(--chat-hover)]/50 transition-colors group">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--chat-primary)] flex items-center justify-center text-white font-bold shrink-0 mt-0.5">
              {message.user?.profile?.fullName?.[0] || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-[var(--chat-text-main)] text-[15px]">
                  {message.user?.profile?.fullName || 'Người dùng'}
                </span>
                <span className="text-[12px] text-[var(--chat-text-muted)]">
                  {message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
              <div className="text-[15px] text-[var(--chat-text-main)] break-words whitespace-pre-wrap">
                {message.content}
              </div>
              {message.attachments?.map((file: any, i: number) => (
                <AttachmentRenderer key={i} file={file} messageId={channelId} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});

function AttachmentRenderer({ file, messageId }: { file: any; messageId: string }) {
  const url = file.url?.startsWith('/uploads/') ? file.url : file.url;
  const isVideo = file.type?.startsWith('video/') || file.url?.match(/\.(mp4|webm|mov)$/i);

  if (isVideo) {
    return (
      <div className="mt-2 max-w-[468px] rounded-[6px] overflow-hidden bg-[#1e1f22]"
        style={{
          aspectRatio: file.metadata?.videoWidth && file.metadata?.videoHeight
            ? `${file.metadata.videoWidth}/${file.metadata.videoHeight}`
            : '16 / 9'
        }}
      >
        <video
          src={url}
          className="w-full h-full object-contain block cursor-pointer"
          preload="metadata"
          controls
          playsInline
        />
      </div>
    );
  }

  if (file.type?.startsWith('image/')) {
    return (
      <div className="mt-2 max-w-[400px] rounded-md overflow-hidden">
        <img src={url} alt={file.name} className="max-h-[300px] w-auto object-contain cursor-pointer" loading="lazy" />
      </div>
    );
  }

  return (
    <div className="mt-2 h-16 w-80 rounded-md border border-[var(--chat-border)] bg-[var(--chat-panel)] flex items-center p-2 gap-3">
      <div className="size-10 rounded bg-[var(--chat-primary)] flex items-center justify-center text-white text-lg">
        <FileTextOutlined />
      </div>
      <span className="text-sm text-[var(--chat-text-main)] truncate">{file.name}</span>
    </div>
  );
}
