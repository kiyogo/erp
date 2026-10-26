'use client';

import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { PlusCircle, Smile, Send, X, FileText } from 'lucide-react';
import { cn } from '../utils';
import type { ChatMessage } from '../chat-types';
import { FileUploadDialog } from '../../../components/FileUploadDialog';

interface ChatInputBarProps {
  placeholder: string;
  onSendMessage: (content: string, attachments?: any[]) => void;
  replyingTo: ChatMessage | null;
  onCancelReply: () => void;
  onOpenEmojiPicker: (target: HTMLElement) => void;
  typingText?: string;
  pendingAttachments?: any[];
  onRemoveAttachment?: (id: string) => void;
  onAddAttachment?: (file: File) => void;
}

export function ChatInputBar({
  placeholder,
  onSendMessage,
  replyingTo,
  onCancelReply,
  onOpenEmojiPicker,
  typingText,
  pendingAttachments = [],
  onRemoveAttachment,
  onAddAttachment,
}: ChatInputBarProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [uploadPickerOpen, setUploadPickerOpen] = useState(false);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [content]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!content.trim() && pendingAttachments.length === 0) return;
    onSendMessage(content.trim(), pendingAttachments);
    setContent('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleFileChange = (files: File[]) => {
    if (!files.length) return;
    files.forEach(file => {
      onAddAttachment && onAddAttachment(file);
    });
  };

  const canSend = content.trim().length > 0 || (pendingAttachments && pendingAttachments.length > 0);

  return (
    <div
      style={{
        padding: '0 16px 16px 16px',
        backgroundColor: '#313338',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      {/* Replying Banner */}
      {replyingTo && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            backgroundColor: '#2b2d31',
            borderTopLeftRadius: '8px',
            borderTopRightRadius: '8px',
            fontSize: '12.5px',
            color: '#b5bac1',
            borderBottom: '1px solid #1f2023',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
            <span>Đang trả lời</span>
            <strong style={{ color: '#dbdee1' }}>{replyingTo.author?.name || 'Thành viên'}</strong>
            <span style={{ color: '#949ba4', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              "{replyingTo.content}"
            </span>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            title="Hủy trả lời"
            style={{
              padding: '4px',
              color: '#b5bac1',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <X style={{ width: '14px', height: '14px' }} />
          </button>
        </div>
      )}

      {/* Main Input Box */}
      <div
        style={{
          backgroundColor: '#383a40',
          borderRadius: replyingTo ? '0 0 8px 8px' : '8px',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        {/* Pending Attachments List */}
        {pendingAttachments && pendingAttachments.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '8px',
              overflowX: 'auto',
              paddingBottom: '8px',
              marginBottom: '8px',
              borderBottom: '1px solid rgba(78, 80, 88, 0.4)',
            }}
          >
            {pendingAttachments.map((att) => (
              <div
                key={att.id}
                style={{
                  position: 'relative',
                  backgroundColor: '#2b2d31',
                  border: '1px solid #1f2023',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: '8px',
                  maxWidth: '180px',
                  flexShrink: 0,
                }}
              >
                {att.type?.startsWith('image/') ? (
                  <img
                    src={att.url}
                    alt={att.name}
                    style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover' }}
                  />
                ) : (
                  <FileText style={{ width: '32px', height: '32px', color: '#5865f2' }} />
                )}
                <span
                  style={{
                    fontSize: '11px',
                    color: '#dbdee1',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {att.name}
                </span>
                {onRemoveAttachment && (
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(att.id)}
                    style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      width: '16px',
                      height: '16px',
                      backgroundColor: '#f23f43',
                      color: '#ffffff',
                      borderRadius: '99px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <X style={{ width: '12px', height: '12px' }} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Input Controls Row */}
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px' }}>
          {/* File Upload Button */}
          <FileUploadDialog open={uploadPickerOpen} onClose={() => setUploadPickerOpen(false)} onSelect={handleFileChange} title="Chọn tệp đính kèm" />
          <button
            type="button"
            onClick={() => setUploadPickerOpen(true)}
            title="Tải lên tệp đính kèm"
            style={{
              color: '#b5bac1',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <PlusCircle style={{ width: '24px', height: '24px' }} />
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              color: '#dbdee1',
              fontSize: '14px',
              lineHeight: '1.5',
              resize: 'none',
              border: 'none',
              outline: 'none',
              maxHeight: '160px',
              padding: '2px 0',
              fontFamily: 'inherit',
            }}
          />

          {/* Emoji Picker Button */}
          <button
            type="button"
            onClick={(e) => onOpenEmojiPicker(e.currentTarget)}
            title="Chọn Emoji"
            style={{
              color: '#b5bac1',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <Smile style={{ width: '24px', height: '24px' }} />
          </button>

          {/* Send Button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            title="Gửi tin nhắn"
            style={{
              padding: '6px',
              borderRadius: '99px',
              backgroundColor: canSend ? '#5865f2' : 'transparent',
              color: canSend ? '#ffffff' : '#4e5058',
              border: 'none',
              cursor: canSend ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background-color 0.15s ease',
            }}
          >
            <Send style={{ width: '16px', height: '16px' }} />
          </button>
        </div>
      </div>

      {/* Typing Users Footer */}
      {typingText && (
        <div style={{ height: '16px', fontSize: '11px', color: '#949ba4', padding: '4px 4px 0 4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '99px', backgroundColor: '#5865f2' }} />
          <span>{typingText}</span>
        </div>
      )}
    </div>
  );
}
