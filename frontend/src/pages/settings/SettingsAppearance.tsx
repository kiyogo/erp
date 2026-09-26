import React, { useEffect, useMemo, useState } from 'react';
import {
  BgColorsOutlined,
  CheckOutlined,
  DesktopOutlined,
  GlobalOutlined,
  LayoutOutlined,
  MenuOutlined,
  MoonOutlined,
  SaveOutlined,
  SettingOutlined,
  SunOutlined,
  TableOutlined,
  TranslationOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { Button, message } from '../../custom-ui';
import { useLanguage } from '../../context/LanguageContext';
import { useAppearanceSettings } from '../../hooks/useAppearanceSettings';
import type { AppearanceSettings } from '../../types/menu';

interface OptionButtonProps {
  icon?: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
  dark: boolean;
}

const OptionButton: React.FC<OptionButtonProps> = ({ icon, label, selected, onClick, dark }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    style={{
      minWidth: 132,
      minHeight: 38,
      padding: '8px 14px',
      borderRadius: 6,
      border: selected ? '1px solid #009688' : `1px solid ${dark ? '#334155' : '#D8E0E8'}`,
      background: selected ? '#009688' : dark ? '#1E293B' : '#FFFFFF',
      color: selected ? '#FFFFFF' : dark ? '#E2E8F0' : '#1E293B',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      fontSize: 13,
      fontWeight: selected ? 600 : 500,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      boxShadow: selected ? '0 1px 3px rgba(0, 150, 136, 0.25)' : 'none',
    }}
    onMouseEnter={(event) => {
      if (!selected) {
        event.currentTarget.style.borderColor = '#009688';
        event.currentTarget.style.color = '#009688';
      }
    }}
    onMouseLeave={(event) => {
      if (!selected) {
        event.currentTarget.style.borderColor = dark ? '#334155' : '#D8E0E8';
        event.currentTarget.style.color = dark ? '#E2E8F0' : '#1E293B';
      }
    }}
  >
    {icon}
    <span>{label}</span>
    {selected && <CheckOutlined style={{ fontSize: 11 }} />}
  </button>
);

interface SettingCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  dark: boolean;
  children: React.ReactNode;
}

const SettingCard: React.FC<SettingCardProps> = ({ icon, title, description, dark, children }) => (
  <section
    style={{
      background: dark ? '#1E293B' : '#FFFFFF',
      border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
      borderRadius: 10,
      padding: 20,
      minWidth: 0,
      boxShadow: dark ? 'none' : '0 1px 3px rgba(0,0,0,0.03)',
      transition: 'all 0.2s ease',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 7,
          background: dark ? '#134E4A' : '#E0F2F1',
          color: '#009688',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 16,
        }}
      >
        {icon}
      </div>
      <div>
        <h2 style={{ margin: 0, color: dark ? '#F8FAFC' : '#1E293B', fontSize: 14, fontWeight: 700 }}>
          {title}
        </h2>
        <p style={{ margin: '4px 0 0', color: dark ? '#94A3B8' : '#64748B', fontSize: 12, lineHeight: 1.5 }}>
          {description}
        </p>
      </div>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{children}</div>
  </section>
);

export const SettingsAppearance: React.FC = () => {
  const { settings, saveSettings } = useAppearanceSettings();
  const { setLanguage: setApplicationLanguage } = useLanguage();
  const [draft, setDraft] = useState<AppearanceSettings>(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const hasUnsavedChanges = useMemo(
    () => (Object.keys(draft) as Array<keyof AppearanceSettings>).some((key) => draft[key] !== settings[key]),
    [draft, settings],
  );

  const changedCount = useMemo(
    () => (Object.keys(draft) as Array<keyof AppearanceSettings>).filter((key) => draft[key] !== settings[key]).length,
    [draft, settings],
  );

  const applySettingLive = (partial: Partial<AppearanceSettings>) => {
    setDraft((current) => ({ ...current, ...partial }));
  };

  const handleSave = () => {
    saveSettings(draft);
    setApplicationLanguage(draft.language);
    message.success('Đã lưu cấu hình giao diện.');
  };

  const handleResetToDefaults = () => {
    const defaultSettings: AppearanceSettings = {
      theme: 'light',
      language: 'vi',
      formDisplayMode: 'popup-form',
      sidebarMenuMode: 'flyout',
      hoverMode: 'off',
      inlineAccordionMode: 'off',
      workspaceTabMode: 'off',
    };
    setDraft(defaultSettings);
    saveSettings(defaultSettings);
    setApplicationLanguage('vi');
    message.info('Đã hoàn tác về cấu hình mặc định (Giao diện Sáng).');
  };

  const isDark = settings.theme === 'dark';
  const pageBackground = isDark ? '#0F172A' : '#F8FAFC';

  return (
    <div
      className="kiyovn-settings-appearance-page"
      style={{
        padding: 20,
        width: '100%',
        boxSizing: 'border-box',
        background: pageBackground,
        minHeight: '100%',
        transition: 'background 0.2s ease',
      }}
    >
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#009688', marginBottom: 5 }}>
              <SettingOutlined style={{ fontSize: 19 }} />
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.02em' }}>CÀI ĐẶT GIAO DIỆN</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 21, lineHeight: 1.3, color: isDark ? '#F8FAFC' : '#0F172A', fontWeight: 700 }}>
              Tùy chỉnh không gian làm việc
            </h1>
            <p style={{ margin: '5px 0 0', color: isDark ? '#94A3B8' : '#64748B', fontSize: 13 }}>
              Chọn các thiết lập phù hợp để đồng bộ trải nghiệm làm việc trên toàn hệ thống.
            </p>
          </div>
          <div
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              background: isDark ? '#134E4A' : '#ECFDF5',
              color: isDark ? '#5EEAD4' : '#047857',
              border: `1px solid ${isDark ? '#0D9488' : '#A7F3D0'}`,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
              {hasUnsavedChanges ? `${changedCount} thay đổi chưa lưu` : 'Cấu hình đang dùng'}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          
          {/* 1. Chủ đề hiển thị */}
          <SettingCard icon={<BgColorsOutlined />} title="Chủ đề hiển thị" description="Tùy chọn giao diện Sáng, Tối hoặc theo thiết lập hệ điều hành." dark={isDark}>
            <OptionButton icon={<SunOutlined />} label="Sáng" selected={draft.theme === 'light'} onClick={() => applySettingLive({ theme: 'light' })} dark={isDark} />
            <OptionButton icon={<MoonOutlined />} label="Tối" selected={draft.theme === 'dark'} onClick={() => applySettingLive({ theme: 'dark' })} dark={isDark} />
            <OptionButton icon={<DesktopOutlined />} label="Theo hệ thống" selected={draft.theme === 'system'} onClick={() => applySettingLive({ theme: 'system' })} dark={isDark} />
          </SettingCard>

          {/* 2. Ngôn ngữ hiển thị */}
          <SettingCard icon={<TranslationOutlined />} title="Ngôn ngữ hiển thị" description="Áp dụng chuyển đổi ngôn ngữ cho toàn bộ menu và các chức năng." dark={isDark}>
            <OptionButton icon={<GlobalOutlined />} label="Tiếng Việt" selected={draft.language === 'vi'} onClick={() => applySettingLive({ language: 'vi' })} dark={isDark} />
            <OptionButton icon={<GlobalOutlined />} label="English" selected={draft.language === 'en'} onClick={() => applySettingLive({ language: 'en' })} dark={isDark} />
          </SettingCard>

          {/* 3. Hiển thị biểu mẫu */}
          <SettingCard icon={<LayoutOutlined />} title="Hiển thị biểu mẫu" description="Chọn cách mở các biểu mẫu thao tác trong hệ thống." dark={isDark}>
            <OptionButton icon={<LayoutOutlined />} label="CRUD Modal" selected={draft.formDisplayMode === 'crud-modal'} onClick={() => applySettingLive({ formDisplayMode: 'crud-modal' })} dark={isDark} />
            <OptionButton icon={<DesktopOutlined />} label="Popup Form" selected={draft.formDisplayMode === 'popup-form'} onClick={() => applySettingLive({ formDisplayMode: 'popup-form' })} dark={isDark} />
          </SettingCard>

          {/* 4. Kiểu menu Sidebar */}
          <SettingCard icon={<MenuOutlined />} title="Kiểu menu Sidebar" description="Chuyển ngay giữa menu thả nổi (Flyout) và menu mở rộng (Accordion)." dark={isDark}>
            <OptionButton icon={<MenuOutlined />} label="Accordion" selected={draft.sidebarMenuMode === 'accordion'} onClick={() => applySettingLive({ sidebarMenuMode: 'accordion' })} dark={isDark} />
            <OptionButton icon={<MenuOutlined />} label="Flyout" selected={draft.sidebarMenuMode === 'flyout'} onClick={() => applySettingLive({ sidebarMenuMode: 'flyout' })} dark={isDark} />
          </SettingCard>

          {/* 5. Mở menu khi rê chuột */}
          <SettingCard icon={<DesktopOutlined />} title="Mở menu khi rê chuột" description="Tự động mở rộng danh mục khi di chuột qua kiểu Sidebar Flyout." dark={isDark}>
            <OptionButton label="Tắt" selected={draft.hoverMode === 'off'} onClick={() => applySettingLive({ hoverMode: 'off' })} dark={isDark} />
            <OptionButton label="Bật" selected={draft.hoverMode === 'on'} onClick={() => applySettingLive({ hoverMode: 'on' })} dark={isDark} />
          </SettingCard>

          {/* 6. Accordion theo nhóm hiện tại */}
          <SettingCard icon={<MenuOutlined />} title="Accordion theo nhóm hiện tại" description="Khi bật, Sidebar chỉ mở nhóm của trang đang xem." dark={isDark}>
            <OptionButton label="Tắt" selected={draft.inlineAccordionMode === 'off'} onClick={() => applySettingLive({ inlineAccordionMode: 'off' })} dark={isDark} />
            <OptionButton label="Theo nhóm đang xem" selected={draft.inlineAccordionMode === 'current-group'} onClick={() => applySettingLive({ inlineAccordionMode: 'current-group' })} dark={isDark} />
          </SettingCard>

          {/* 7. Tab không gian làm việc */}
          <SettingCard icon={<TableOutlined />} title="Tab không gian làm việc" description="Hiển thị hoặc ẩn hàng tab ở phía trên khu vực nội dung." dark={isDark}>
            <OptionButton icon={<TableOutlined />} label="Tắt tab" selected={draft.workspaceTabMode === 'off'} onClick={() => applySettingLive({ workspaceTabMode: 'off' })} dark={isDark} />
            <OptionButton icon={<TableOutlined />} label="Bật tab" selected={draft.workspaceTabMode === 'on'} onClick={() => applySettingLive({ workspaceTabMode: 'on' })} dark={isDark} />
          </SettingCard>
        </div>

        {/* Thanh tác vụ chân trang */}
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            marginTop: 20,
            padding: '14px 18px',
            borderRadius: 10,
            border: `1px solid ${isDark ? '#334155' : '#DCE6EE'}`,
            background: isDark ? 'rgba(30, 41, 59, 0.96)' : 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          <div>
            <div style={{ color: isDark ? '#F8FAFC' : '#1E293B', fontSize: 13.5, fontWeight: 700 }}>
              {hasUnsavedChanges ? `Có ${changedCount} thay đổi chưa lưu` : 'Cấu hình giao diện đã được lưu'}
            </div>
            <div style={{ marginTop: 2, color: isDark ? '#94A3B8' : '#64748B', fontSize: 12 }}>
              {hasUnsavedChanges ? 'Bấm Lưu cấu hình để áp dụng trên toàn bộ hệ thống.' : 'Cấu hình hiện tại sẽ được giữ nguyên sau khi tải lại trang.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button icon={<UndoOutlined />} onClick={handleResetToDefaults}>
              Khôi phục mặc định
            </Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu cấu hình
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsAppearance;
