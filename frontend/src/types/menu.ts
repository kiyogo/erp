import React from 'react';

export type SidebarMenuMode = 'accordion' | 'flyout';
export type ThemeMode = 'light' | 'dark' | 'system';
export type LanguageMode = 'vi' | 'en';
export type FormDisplayMode = 'crud-modal' | 'popup-form';
export type HoverMode = 'off' | 'on';
export type InlineAccordionMode = 'off' | 'current-group';
export type WorkspaceTabMode = 'off' | 'on';

export interface MenuItem {
  id: string;
  title: string;
  icon?: React.ReactNode;
  path?: string;
  children?: MenuItem[];
  lockedName?: boolean;
  badge?: string | number;
  description?: string;
  permission?: string;
}

export interface AppearanceSettings {
  theme: ThemeMode;
  language: LanguageMode;
  formDisplayMode: FormDisplayMode;
  sidebarMenuMode: SidebarMenuMode;
  hoverMode: HoverMode;
  inlineAccordionMode: InlineAccordionMode;
  workspaceTabMode: WorkspaceTabMode;
}

export interface WorkspaceTab {
  id: string;
  title: string;
  path: string;
  closable?: boolean;
}
