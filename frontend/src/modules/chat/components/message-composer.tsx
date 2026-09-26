'use client';

import React, { memo, useState, useRef, KeyboardEvent } from 'react';
import { Send, Paperclip } from 'lucide-react';
import { cn } from '../utils';

interface MessageComposerProps {
  channelId: string;
  onSend: (channelId: string, content: string) => void;
  placeholder?: string;
}

export const MessageComposer = memo(function MessageComposer({
  channelId, onSend, placeholder
}: MessageComposerProps) {
  const [content, setContent] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const text = content.trim();
    if (!text) return;
    onSend(channelId, text);
    setContent('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="px-4 pb-6 pt-2">
      <div className="flex items-end gap-2 rounded-[var(--chat-radius)] bg-[var(--chat-input-bg)] px-4 py-2">
        <button className="text-[var(--chat-text-muted)] hover:text-[var(--chat-text-main)] transition-colors shrink-0 pb-1">
          <Paperclip className="size-5" />
        </button>
        <textarea
          ref={inputRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (inputRef.current) {
              inputRef.current.style.height = 'auto';
              inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px';
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || `Nhập tin nhắn...`}
          rows={1}
          className="flex-1 bg-transparent border-0 outline-none text-[15px] resize-none text-[var(--chat-text-main)] placeholder:text-[var(--chat-text-muted)] py-1 max-h-[200px]"
        />
        <button
          onClick={handleSend}
          disabled={!content.trim()}
          className={cn(
            "shrink-0 p-1.5 rounded-lg transition-all",
            content.trim()
              ? "bg-[var(--chat-primary)] text-white hover:opacity-90"
              : "text-[var(--chat-text-muted)]"
          )}
        >
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
});
