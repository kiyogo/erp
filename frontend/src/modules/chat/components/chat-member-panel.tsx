'use client';

import React from 'react';
import { cn } from '../utils';
import { Avatar } from './chat-components';
import type { ChatMember, Presence } from '../chat-page-types';
import { X } from 'lucide-react';

interface ChatMemberPanelProps {
  open: boolean;
  isMobile: boolean;
  isMembersOpen: boolean;
  activeServerId: string | null;
  activeChannelId: string | null;
  channelMembers: any[];
  selfMember: ChatMember;
  directMessages: any[];
  userId: string;
  chatTheme: string;
  onProfileOpen: (member: ChatMember, target: HTMLElement | { x: number; y: number }) => void;
  onClose: () => void;
}

export function ChatMemberPanel({
  open,
  isMobile,
  isMembersOpen,
  activeServerId,
  activeChannelId,
  channelMembers,
  selfMember,
  directMessages,
  userId,
  chatTheme,
  onProfileOpen,
  onClose,
}: ChatMemberPanelProps) {
  if (!(open || (isMobile && isMembersOpen))) return null;

  return (
    <div
      className={cn(
        "chat-member-sidebar w-[255px] overflow-y-auto no-scrollbar border-l border-[var(--chat-border)] bg-[var(--chat-panel)] transition-transform duration-300 z-[120] shrink-0",
        isMobile ? "fixed inset-y-0 right-0 translate-x-full h-full shadow-2xl" : "relative translate-x-0 h-full",
        isMobile && isMembersOpen && "translate-x-0"
      )}
    >
      {activeServerId === 'home' ? (() => {
        const dm = (directMessages || []).find(d => d.id === activeChannelId);
        const other = (dm?.members || []).find((m: any) => String((m.userId || m.user_id || m.id)) !== String(userId));
        if (!other) return null;
        const profile = other.user?.profile || other.profile || {};
        const name = profile.fullName || other.name || other.user?.fullName || other.user?.email || 'Người dùng';
        const email = other.email || other.user?.email || '';
        const color = other.color || 'var(--chat-primary, #5865f2)';
        const avatarUrl = profile.avatarUrl || other.avatarUrl || other.user?.avatarUrl;

        return (
          <div className="flex flex-col h-full">
            {/* Banner */}
            <div className="h-[120px] w-full shrink-0" style={{ background: color, opacity: 0.85 }} />

            <div className="relative px-4 pb-8 flex-1">
              {/* Avatar */}
              <div className="absolute -top-10 left-4">
                <Avatar
                  name={name}
                  color={color}
                  src={avatarUrl}
                  size="lg"
                  className="size-20 ring-[4px] ring-[var(--chat-panel)]"
                />
              </div>

              <div className="pt-12">
                <h3 className="text-[20px] font-bold text-[var(--chat-text-main)] leading-tight m-0">{name}</h3>
                <p className="text-[14px] text-[var(--chat-text-muted)] truncate m-0 mt-0.5">{email}</p>
              </div>

              <div className="mt-4 space-y-3">
                {/* Bio */}
                {(profile.bio || other.bio) && (
                  <div className="p-3 rounded-xl bg-[var(--chat-bg)] border border-[var(--chat-border)]">
                    <h4 className="text-[11px] font-bold uppercase text-[var(--chat-text-muted)] mb-1 m-0">Tiểu sử</h4>
                    <p className="text-[13px] text-[var(--chat-text-secondary)] whitespace-pre-wrap leading-relaxed m-0">
                      {profile.bio || other.bio}
                    </p>
                  </div>
                )}

                {/* Join Date */}
                <div className="p-3 rounded-xl bg-[var(--chat-bg)] border border-[var(--chat-border)]">
                  <h4 className="text-[11px] font-bold uppercase text-[var(--chat-text-muted)] mb-1 m-0">Gia Nhập Từ</h4>
                  <p className="text-[13px] text-[var(--chat-text-secondary)] m-0">
                    {other.user?.createdAt ? new Date(other.user.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Tháng 8, 2026'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })() : (
        <div className="py-3 px-3">
          <div className="space-y-0.5">
            {isMobile && (
              <div className="flex items-center justify-between px-2 mb-4">
                <span className="font-bold text-lg text-[var(--chat-text-main)]">Thành viên</span>
                <button className="p-2 hover:bg-[var(--chat-hover)] rounded-full cursor-pointer border-none bg-transparent" onClick={onClose}>
                  <X className="size-6 text-[var(--chat-text-secondary)]" />
                </button>
              </div>
            )}
            <div className="text-[12px] font-bold uppercase text-[var(--chat-text-muted)] px-2 mb-1 flex items-center justify-between">
              <span>Trực tuyến — {channelMembers.filter(m => String((m.id || m.userId || m.user_id)) !== String(selfMember.id)).length + 1}</span>
            </div>

            {/* Always show self first */}
            <button
              type="button"
              className="chat-nav-btn flex w-full items-center gap-3 rounded px-2 py-1.5 hover:bg-[var(--chat-hover)] text-left group cursor-pointer border-none bg-transparent"
              onClick={(e) => {
                if (isMobile) {
                  onProfileOpen(selfMember, { x: 0, y: 0 });
                } else {
                  onProfileOpen(selfMember, e.currentTarget);
                }
              }}
            >
              <div className="relative">
                <Avatar name={selfMember.name} color={selfMember.color} src={selfMember.avatarUrl} size="sm" presence="online" />
              </div>
              <div className="flex flex-col w-full justify-center overflow-hidden">
                <span className="text-[14px] font-bold truncate text-[var(--chat-text-main)] tracking-tight" style={{ color: selfMember.color, lineHeight: '1.35', paddingBottom: '2px' }}>
                  {selfMember.name}
                </span>
                {selfMember.roleGroup !== 'member' && (
                  <span className="text-[11px] text-[var(--chat-text-muted)] truncate capitalize font-medium opacity-80" style={{ lineHeight: '1.25', paddingBottom: '1px' }}>
                    {selfMember.roles?.[0] || (selfMember.roleGroup === 'owner' ? 'Chủ sở hữu' : 'Quản trị viên')}
                  </span>
                )}
              </div>
            </button>

            {/* Show others */}
            {channelMembers.filter(m => String((m.id || m.userId || m.user_id)) !== String(selfMember.id) && String((m.id || m.userId || m.user_id)) !== String(userId)).map((member) => {
              const memberId = member.id || member.userId || member.user_id;
              const profile = member.user?.profile || member.profile || {};
              const name = member.name || member.fullName || profile.fullName || member.user?.fullName || member.user?.email || 'Thành viên';
              const avatarUrl = member.avatarUrl || profile.avatarUrl || member.user?.avatarUrl;
              const roleGroup = member.roleGroup || (member.user?.role === 'owner' ? 'BAN ĐIỀU HÀNH' : member.user?.role === 'admin' ? 'QUẢN TRỊ VIÊN' : 'THÀNH VIÊN');
              const role = member.user?.role || (roleGroup === 'BAN ĐIỀU HÀNH' ? 'owner' : roleGroup === 'TRƯỞNG NHÓM & QUẢN LÝ' ? 'admin' : 'member');
              const color = member.color || (role === 'admin' || role === 'owner' || roleGroup === 'BAN ĐIỀU HÀNH' ? '#3B82F6' : '#5865f2');
              const status = member.status || '';
              const email = member.email || member.user?.email || '';
              const username = member.username || member.user?.email?.split('@')[0] || name;
              const presence = (member.presence as Presence) || 'online';
              const roles = member.roles || (role === 'owner' ? ['Chủ sở hữu'] : role === 'admin' ? ['Quản trị viên'] : ['Thành viên']);
              const bio = member.bio || profile.bio || '';

              const memberData: ChatMember = {
                id: memberId,
                name,
                username,
                email,
                roleGroup,
                presence,
                color,
                avatarUrl,
                badges: member.badges || [],
                roles,
                status,
                bio
              };

              const roleLabel = roles?.[0] || (role === 'owner' ? 'Chủ sở hữu' : role === 'admin' ? 'Quản trị viên' : undefined);

              return (
                <button
                  key={memberId}
                  type="button"
                  className="chat-nav-btn flex w-full items-center gap-3 rounded px-2 py-1.5 hover:bg-[var(--chat-hover)] text-left group cursor-pointer border-none bg-transparent"
                  onClick={(e) => {
                    if (isMobile) {
                      onProfileOpen(memberData, { x: 0, y: 0 });
                    } else {
                      onProfileOpen(memberData, e.currentTarget);
                    }
                  }}
                >
                  <div className="relative">
                    <Avatar name={name} color={color} src={avatarUrl} size="sm" presence={presence} />
                  </div>
                  <div className={cn(
                    "flex flex-1 min-w-0 font-sans items-center",
                    roleLabel ? "flex-col justify-center h-9" : "h-8"
                  )}>
                    <div className="flex flex-col w-full justify-center overflow-hidden">
                      <span className="text-[14px] font-bold truncate text-[var(--chat-text-main)] tracking-tight" style={{ color, lineHeight: '1.35', paddingBottom: '2px' }}>
                        {name}
                      </span>
                      {roleLabel && (
                        <span className="text-[11px] text-[var(--chat-text-muted)] truncate capitalize font-medium opacity-80" style={{ lineHeight: '1.25', paddingBottom: '1px' }}>
                          {roleLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
