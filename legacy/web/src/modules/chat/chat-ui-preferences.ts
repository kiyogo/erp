'use client';

import { create } from 'zustand';

export type ChatThemeValue = 'light' | 'dark' | 'midnight';
export type ChatPaletteMode = 'auto' | 'solid' | 'gradient' | 'balanced';

export interface ChatUiSettings {
  theme: ChatThemeValue;
  primaryColor: string;
  borderRadius: number;
  paletteMode: ChatPaletteMode;
  customPalette: string[];
}

interface ChatUiPreferencesState extends ChatUiSettings {
  setTheme: (theme: ChatThemeValue) => void;
  setPrimaryColor: (color: string) => void;
  setBorderRadius: (radius: number) => void;
  setPaletteMode: (mode: ChatPaletteMode) => void;
  setCustomPalette: (colors: string[]) => void;
  reset: () => void;
}

const STORAGE_KEY = 'chat-ui-settings';

const DEFAULT_CHAT_SETTINGS: ChatUiSettings = {
  theme: 'dark',
  primaryColor: '#5865f2', // Discord Brand Color
  borderRadius: 6,
  paletteMode: 'auto',
  customPalette: ['#5865f2']
};

const getInitialSettings = (): ChatUiSettings => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_CHAT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch {}
  return DEFAULT_CHAT_SETTINGS;
};

export const useChatUiPreferencesStore = create<ChatUiPreferencesState>((set) => ({
  ...getInitialSettings(),

  setTheme: (theme) => {
    set({ theme });
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, theme }));
    } catch {}
  },
  setPrimaryColor: (primaryColor) => {
    set({ primaryColor });
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, primaryColor }));
    } catch {}
  },
  setBorderRadius: (borderRadius) => {
    set({ borderRadius });
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, borderRadius }));
    } catch {}
  },
  setPaletteMode: (paletteMode) => {
    set({ paletteMode });
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, paletteMode }));
    } catch {}
  },
  setCustomPalette: (customPalette) => {
    set({ customPalette });
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, customPalette }));
    } catch {}
  },
  reset: () => {
    set(DEFAULT_CHAT_SETTINGS);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CHAT_SETTINGS));
    } catch {}
  }
}));

export const useChatUiPreferences = useChatUiPreferencesStore;

export const hexToHsl = (hex: string): string => {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex.charAt(1) + hex.charAt(1), 16);
    g = parseInt(hex.charAt(2) + hex.charAt(2), 16);
    b = parseInt(hex.charAt(3) + hex.charAt(3), 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

export const getContrastColor = (hexcolor: string) => {
  hexcolor = hexcolor.replace('#', '');
  const r = parseInt(hexcolor.substring(0, 2), 16);
  const g = parseInt(hexcolor.substring(2, 4), 16);
  const b = parseInt(hexcolor.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000000' : '#ffffff';
};
