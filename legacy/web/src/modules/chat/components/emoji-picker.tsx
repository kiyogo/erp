import React, { memo, useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Search, Gift, Sticker, Smile, Hash, BarChart3, LayoutGrid, Upload, Plus, X, Clock, Star, Flame, Heart, AlertCircle, Trophy, ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '../utils';
import { searchEmojis } from '../lib/emoji-search';
import { EMOJI_DATA } from '../lib/emoji-data';

// --- Types ---
export type PickerTab = 'gif' | 'sticker' | 'emoji';

interface EmojiPickerProps {
  onSelect: (emoji: any) => void;
  onClose: () => void;
  tab?: PickerTab;
  onTabChange?: (tab: PickerTab) => void;
  style?: React.CSSProperties;
  className?: string;
}

// --- Data ---
const EMOJI_CATEGORIES = [
  { id: 'recent', icon: <Clock className="size-4" />, label: 'Thường được sử dụng' },
  { id: 'smileys', icon: <Smile className="size-4" />, label: 'Mặt cười' },
  { id: 'gestures', icon: <Plus className="size-4 rotate-45" />, label: 'Cử chỉ' },
  { id: 'nature', icon: <Flame className="size-4" />, label: 'Thiên nhiên' },
  { id: 'food', icon: <Gift className="size-4" />, label: 'Đồ ăn' },
  { id: 'symbols', icon: <Heart className="size-4" />, label: 'Biểu tượng' },
];

const GIF_CATEGORIES = [
  { id: 'fav', label: 'Ưa thích', color: 'bg-blue-600/80', icon: <Heart className="size-5" /> },
  { id: 'trending', label: 'Các ảnh GIF đang là xu hướng', color: 'bg-emerald-600/80', icon: <Flame className="size-5" /> },
  { id: 'sleep', label: 'ngủ ngon', color: 'bg-slate-700/80' },
  { id: 'morning', label: 'chào buổi sáng', color: 'bg-rose-500/80' },
  { id: 'hesitate', label: 'phân vân', color: 'bg-stone-600/80' },
  { id: 'calm', label: 'bình tĩnh', color: 'bg-amber-700/80' },
];

// --- Categories derived from EMOJI_DATA ---
const FULL_EMOJI_DATA = {
  smileys: EMOJI_DATA.filter(e => e.category === 'smileys').map(e => e.emoji),
  gestures: EMOJI_DATA.filter(e => e.category === 'gestures').map(e => e.emoji),
  nature: EMOJI_DATA.filter(e => e.category === 'nature').map(e => e.emoji),
  food: EMOJI_DATA.filter(e => e.category === 'food').map(e => e.emoji),
  symbols: EMOJI_DATA.filter(e => e.category === 'symbols').map(e => e.emoji),
};

// --- Sub-components ---

const EmojiItem = memo(({ emoji, onSelect }: { emoji: string; onSelect: (e: string) => void }) => {
  return (
    <button 
      onClick={() => onSelect(emoji)}
      className="aspect-square flex items-center justify-center rounded-lg p-1 hover:bg-black/5 dark:hover:bg-white/10 transition-all hover:scale-115 active:scale-95 group"
      title={emoji}
    >
      <span className="text-[22px] drop-shadow-sm group-hover:drop-shadow-md">{emoji}</span>
    </button>
  );
});
EmojiItem.displayName = 'EmojiItem';

const CategoryHeader = memo(({ label, icon, isCollapsible = true }: { label: string; icon?: React.ReactNode; isCollapsible?: boolean }) => {
  return (
    <div className="flex items-center justify-between mb-1 mt-3 px-1 text-[12px] font-bold text-[var(--chat-text-main)] group cursor-pointer">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="truncate">{label}</span>
        {isCollapsible && <ChevronDown className="size-3.5 text-[var(--chat-text-muted)]" />}
      </div>
    </div>
  );
});

const CategorySection = memo(({ id, category, icon, emojis, onSelect }: { id?: string; category: string; icon?: React.ReactNode; emojis: string[]; onSelect: (e: string) => void }) => {
  if (emojis.length === 0) return null;
  return (
    <div className="mb-3" id={id}>
      <CategoryHeader label={category} icon={icon} />
      <div className="grid grid-cols-8 gap-0.5">
        {emojis.map((emoji, i) => (
          <EmojiItem key={`${emoji}-${i}`} emoji={emoji} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
});
CategorySection.displayName = 'CategorySection';

// --- Main Component ---

import { useChatUiPreferencesStore } from '../chat-ui-preferences';

const LOCAL_STORAGE_KEY = 'discord-recent-emojis';

export const EmojiPicker = memo(({ onSelect, onClose, tab = 'emoji', onTabChange, style, className }: EmojiPickerProps) => {
  const { theme } = useChatUiPreferencesStore();
  const [search, setSearch] = useState('');
  const [deferredSearch, setDeferredSearch] = useState('');
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        setRecentEmojis(JSON.parse(stored));
      } else {
        setRecentEmojis(['😀', '😂', '🔥', '❤️', '👍', '🙌', '✨', '🤡', '🤣', '✅']);
      }
    } catch {
      setRecentEmojis(['😀', '😂', '🔥', '❤️', '👍', '🙌', '✨', '🤡', '🤣', '✅']);
    }
  }, []);

  const handleSelect = useCallback((emoji: string) => {
    onSelect(emoji);
    setRecentEmojis(prev => {
      const newRecent = [emoji, ...prev.filter(e => e !== emoji)].slice(0, 30);
      try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newRecent)); } catch (e) {}
      return newRecent;
    });
  }, [onSelect]);

  const scrollToCategory = useCallback((id: string) => {
    if (!scrollRef.current) return;
    const element = scrollRef.current.querySelector(`#emoji-cat-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { setDeferredSearch(search); }, 150);
    return () => clearTimeout(timer);
  }, [search]);
  
  const filteredEmojis = useMemo(() => {
    if (!deferredSearch.trim()) return null;
    return searchEmojis(deferredSearch).map(e => e.emoji);
  }, [deferredSearch]);

  const content = useMemo(() => {
    if (tab === 'emoji') {
      if (search) {
        if (filteredEmojis && filteredEmojis.length > 0) {
          return (
            <CategorySection 
              category="Kết quả tìm kiếm" 
              emojis={filteredEmojis} 
              onSelect={handleSelect} 
            />
          );
        }
        return (
          <div className="flex flex-col items-center justify-center h-full py-10 text-[var(--chat-text-muted)]">
            <Smile className="size-10 opacity-10 mb-2" />
            <p className="text-[13px] font-medium text-[var(--chat-text-main)] text-center">Không tìm thấy emoji phù hợp</p>
          </div>
        );
      }
      return (
        <div className="pb-3">
          {recentEmojis.length > 0 && (
            <CategorySection id="emoji-cat-recent" category="Hay dùng" icon={<Clock className="size-3.5" />} emojis={recentEmojis} onSelect={handleSelect} />
          )}
          <CategorySection id="emoji-cat-smileys" category="Mặt cười" emojis={FULL_EMOJI_DATA.smileys} onSelect={handleSelect} />
          <CategorySection id="emoji-cat-gestures" category="Cử chỉ" emojis={FULL_EMOJI_DATA.gestures} onSelect={handleSelect} />
          <CategorySection id="emoji-cat-nature" category="Thiên nhiên" emojis={FULL_EMOJI_DATA.nature} onSelect={handleSelect} />
          <CategorySection id="emoji-cat-food" category="Đồ ăn" emojis={FULL_EMOJI_DATA.food} onSelect={handleSelect} />
          <CategorySection id="emoji-cat-symbols" category="Biểu tượng" emojis={FULL_EMOJI_DATA.symbols} onSelect={handleSelect} />
        </div>
      );
    }
    
    if (tab === 'gif') {
      return (
        <div className="grid grid-cols-2 gap-2 mt-2 pb-3">
          {GIF_CATEGORIES.map((cat) => (
            <div key={cat.id} className={cn("aspect-video relative overflow-hidden rounded-lg cursor-pointer group shadow-sm transition-transform active:scale-95", cat.color)}>
              <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
              <div className="absolute inset-0 flex flex-col items-center justify-center p-1.5 text-center">
                {cat.icon && React.cloneElement(cat.icon as React.ReactElement<{ className?: string }>, { className: 'size-4' })}
                <span className="text-[12px] font-bold text-white drop-shadow-md leading-tight mt-0.5">{cat.label}</span>
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-full py-10 text-[var(--chat-text-muted)]">
        <Sticker className="size-10 opacity-10 mb-2" />
        <p className="text-[13px] font-medium text-[var(--chat-text-main)]">Chưa có Sticker</p>
      </div>
    );
  }, [tab, search, filteredEmojis, handleSelect, recentEmojis]);

  return (
    <div 
      className={cn(
        "chat-theme-root chat-modal-box flex h-[420px] w-[340px] flex-col overflow-hidden bg-[var(--chat-panel)] border border-[var(--chat-border)] animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out",
        className
      )}
      style={{
        ...style,
        borderRadius: '16px',
        boxShadow: '0 20px 45px rgba(0, 0, 0, 0.45)',
      }}
      data-chat-theme={theme}
    >
      {/* Header Tabs */}
      <header className="flex shrink-0 items-center justify-between py-2 px-3 border-b border-[var(--chat-border)]">
        <div className="flex gap-2">
          {(['gif', 'sticker', 'emoji'] as const).map((t) => (
            <button 
              key={t}
              onClick={() => { onTabChange?.(t); setSearch(''); }}
              style={{ borderRadius: '8px', border: 'none', cursor: 'pointer' }}
              className={cn(
                "px-3.5 py-1.5 text-[14px] font-bold transition-all duration-200", 
                tab === t 
                  ? "bg-[var(--chat-selected)] text-[var(--chat-text-main)]" 
                  : "text-[var(--chat-text-secondary)] hover:bg-[var(--chat-hover)]"
              )}
            >
              {t === 'gif' ? 'Ảnh động' : t === 'sticker' ? 'Sticker' : 'Emoji'}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '6px', borderRadius: '50%' }}
          className="text-[var(--chat-text-secondary)] hover:bg-[var(--chat-hover)] transition-colors"
        >
          <X className="size-4" />
        </button>
      </header>

      {/* Search Bar */}
      <div className="py-2 px-3 border-b border-[var(--chat-border)]">
        <div className="relative group">
          <input 
            type="text" 
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'emoji' ? "Tìm emoji hợp lý nhất" : tab === 'gif' ? "Tìm kiếm trên Tenor" : "Tìm sticker phù hợp nhất"}
            style={{ borderRadius: '8px', border: 'none', outline: 'none' }}
            className="w-full bg-[var(--chat-sidebar-servers)] py-1.5 pl-3 pr-10 text-[13px] text-[var(--chat-text-main)] outline-none transition-all placeholder:text-[var(--chat-text-muted)]"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
             <Search className="size-4 text-[var(--chat-text-muted)]" />
             {tab === 'emoji' && <Sparkles className="size-4 text-amber-500 cursor-pointer hover:scale-110 transition-transform" />}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 scrollbar-discord scroll-smooth select-none custom-scrollbar"
      >
        {content}
      </div>

    </div>
  );
});

EmojiPicker.displayName = 'EmojiPicker';
