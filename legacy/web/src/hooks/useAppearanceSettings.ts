import { useState, useEffect, useCallback } from 'react';
import {
  AppearanceSettings,
  SidebarMenuMode,
  ThemeMode,
  LanguageMode,
  FormDisplayMode,
  HoverMode,
  InlineAccordionMode,
  WorkspaceTabMode,
} from '../types/menu';

const STORAGE_KEYS = {
  theme: 'kiyovn_theme',
  language: 'kiyovn_language',
  formDisplayMode: 'kiyovn_form_display_mode',
  sidebarMenuMode: 'kiyovn_sidebar_menu_mode',
  hoverMode: 'kiyovn_sidebar_hover_mode',
  inlineAccordionMode: 'kiyovn_inline_accordion_mode',
  workspaceTabMode: 'kiyovn_workspace_tab_mode',
};

const DEFAULT_SETTINGS: AppearanceSettings = {
  theme: 'light',
  language: 'vi',
  formDisplayMode: 'popup-form',
  sidebarMenuMode: 'flyout',
  hoverMode: 'off',
  inlineAccordionMode: 'off',
  workspaceTabMode: 'off',
};

const readStoredValue = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
};

const readStoredSettings = (): AppearanceSettings => {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  return {
    theme: readStoredValue(STORAGE_KEYS.theme, ['light', 'dark', 'system'] as const, DEFAULT_SETTINGS.theme),
    language: readStoredValue(STORAGE_KEYS.language, ['vi', 'en'] as const, DEFAULT_SETTINGS.language),
    formDisplayMode: readStoredValue(STORAGE_KEYS.formDisplayMode, ['crud-modal', 'popup-form'] as const, DEFAULT_SETTINGS.formDisplayMode),
    sidebarMenuMode: readStoredValue(STORAGE_KEYS.sidebarMenuMode, ['accordion', 'flyout'] as const, DEFAULT_SETTINGS.sidebarMenuMode),
    hoverMode: readStoredValue(STORAGE_KEYS.hoverMode, ['off', 'on'] as const, DEFAULT_SETTINGS.hoverMode),
    inlineAccordionMode: readStoredValue(STORAGE_KEYS.inlineAccordionMode, ['off', 'current-group'] as const, DEFAULT_SETTINGS.inlineAccordionMode),
    workspaceTabMode: readStoredValue(STORAGE_KEYS.workspaceTabMode, ['off', 'on'] as const, DEFAULT_SETTINGS.workspaceTabMode),
  };
};

export function useAppearanceSettings() {
  const [settings, setSettings] = useState<AppearanceSettings>(readStoredSettings);

  // Apply theme to document
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    root.dataset.appearanceTheme = settings.theme;
    root.dataset.formDisplayMode = settings.formDisplayMode;
    root.dataset.sidebarMenuMode = settings.sidebarMenuMode;
    root.dataset.hoverMode = settings.hoverMode;
    root.dataset.inlineAccordionMode = settings.inlineAccordionMode;
    root.dataset.workspaceTabMode = settings.workspaceTabMode;
    if (settings.theme === 'dark') {
      root.classList.add('theme-dark');
    } else if (settings.theme === 'light') {
      root.classList.add('theme-light');
    } else {
      // System
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.add(isDark ? 'theme-dark' : 'theme-light');
    }
  }, [settings]);

  // Update a single setting
  const updateSetting = useCallback(<K extends keyof AppearanceSettings>(key: K, value: AppearanceSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEYS[key], String(value));
        // Dispatch storage event so other components or tabs sync immediately
        window.dispatchEvent(new Event('kiyovn-settings-updated'));
      } catch (err) {
        console.error('Failed to save appearance settings to localStorage:', err);
      }
      return next;
    });
  }, []);

  const saveSettings = useCallback((next: AppearanceSettings) => {
    setSettings(next);
    try {
      (Object.keys(STORAGE_KEYS) as Array<keyof AppearanceSettings>).forEach((key) => {
        localStorage.setItem(STORAGE_KEYS[key], String(next[key]));
      });
      window.dispatchEvent(new Event('kiyovn-settings-updated'));
    } catch (err) {
      console.error('Failed to save appearance settings to localStorage:', err);
    }
  }, []);

  // Listen for cross-component updates
  useEffect(() => {
    const handleSync = () => {
      setSettings(readStoredSettings());
    };

    window.addEventListener('storage', handleSync);
    window.addEventListener('kiyovn-settings-updated', handleSync);
    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('kiyovn-settings-updated', handleSync);
    };
  }, []);

  return {
    settings,
    setTheme: (val: ThemeMode) => updateSetting('theme', val),
    setLanguage: (val: LanguageMode) => updateSetting('language', val),
    setFormDisplayMode: (val: FormDisplayMode) => updateSetting('formDisplayMode', val),
    setSidebarMenuMode: (val: SidebarMenuMode) => updateSetting('sidebarMenuMode', val),
    setHoverMode: (val: HoverMode) => updateSetting('hoverMode', val),
    setInlineAccordionMode: (val: InlineAccordionMode) => updateSetting('inlineAccordionMode', val),
    setWorkspaceTabMode: (val: WorkspaceTabMode) => updateSetting('workspaceTabMode', val),
    saveSettings,
  };
}
