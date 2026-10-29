import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface TimeRangePreset {
  label: string;
  value: string;
  description?: string;
}

export interface TimeRangePickerProps {
  value?: string;
  onChange?: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
  allowClear?: boolean;
  presets?: TimeRangePreset[];
}

const DEFAULT_PRESETS: TimeRangePreset[] = [
  { label: 'Ca hành chính chuẩn', value: '08:00 - 17:30', description: '8 giờ làm việc' },
  { label: 'Ca hành chính 8 tiếng', value: '08:00 - 17:00', description: '8 giờ làm việc' },
  { label: 'Ca hành chính sớm', value: '07:30 - 16:30', description: '8 giờ làm việc' },
  { label: 'Ca làm việc linh hoạt', value: '08:30 - 18:00', description: '8 giờ làm việc' },
  { label: 'Ca sáng sản xuất', value: '06:00 - 14:00', description: '8 giờ làm việc' },
  { label: 'Ca chiều sản xuất', value: '14:00 - 22:00', description: '8 giờ làm việc' },
  { label: 'Ca đêm bảo trì', value: '22:00 - 06:00', description: '8 giờ làm việc' },
  { label: 'Ca sáng nửa ngày', value: '08:00 - 12:00', description: '4 giờ làm việc' },
  { label: 'Ca chiều nửa ngày', value: '13:30 - 17:30', description: '4 giờ làm việc' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export const TimeRangePicker: React.FC<TimeRangePickerProps> = ({
  value,
  onChange,
  placeholder = '08:00 - 17:30',
  disabled = false,
  style,
  className = '',
  id,
  name,
  'aria-label': ariaLabel,
  allowClear = false,
  presets = DEFAULT_PRESETS,
}) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'presets' | 'custom'>('presets');
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Parse start / end from value
  const parseRange = (val?: string) => {
    const match = /^(\d{2}):(\d{2})\s*[-–]\s*(\d{2}):(\d{2})$/.exec((val || '').trim());
    if (match) {
      return {
        startH: match[1],
        startM: match[2],
        endH: match[3],
        endM: match[4],
      };
    }
    return {
      startH: '08',
      startM: '00',
      endH: '17',
      endM: '30',
    };
  };

  const initialTimes = parseRange(value);
  const [startHour, setStartHour] = useState(initialTimes.startH);
  const [startMinute, setStartMinute] = useState(initialTimes.startM);
  const [endHour, setEndHour] = useState(initialTimes.endH);
  const [endMinute, setEndMinute] = useState(initialTimes.endM);

  useEffect(() => {
    if (value) {
      const parsed = parseRange(value);
      setStartHour(parsed.startH);
      setStartMinute(parsed.startM);
      setEndHour(parsed.endH);
      setEndMinute(parsed.endM);
    }
  }, [value]);

  const updatePosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if ((rect.width === 0 && rect.height === 0) || rect.bottom <= 10 || rect.top >= window.innerHeight - 10) {
      setOpen(false);
      return;
    }

    const popupHeight = 320;
    const popupWidth = 340;

    let top = rect.bottom + 4;
    let left = rect.left;

    // Flip upwards if overflowing below
    if (top + popupHeight > window.innerHeight && rect.top - popupHeight - 4 > 0) {
      top = rect.top - popupHeight - 4;
    }

    // Keep within right edge
    if (left + popupWidth > window.innerWidth) {
      left = Math.max(10, window.innerWidth - popupWidth - 10);
    }

    setPos({ top, left });
  };

  const handleToggle = () => {
    if (disabled) return;
    updatePosition();
    setOpen((prev) => !prev);
  };

  // Outside click & scroll detection
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        popupRef.current &&
        !popupRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleWindowEvents = (e?: Event) => {
      if (open) {
        if (e && e.type === 'scroll') {
          if (popupRef.current && (e.target === popupRef.current || popupRef.current.contains(e.target as Node))) {
            return;
          }
          setOpen(false);
          return;
        }
        updatePosition();
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('resize', handleWindowEvents);
      window.addEventListener('scroll', handleWindowEvents, true);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleWindowEvents);
      window.removeEventListener('scroll', handleWindowEvents, true);
    };
  }, [open]);

  const handleSelectPreset = (presetValue: string) => {
    onChange?.(presetValue);
    setOpen(false);
  };

  const handleApplyCustom = () => {
    const customRange = `${startHour}:${startMinute} - ${endHour}:${endMinute}`;
    onChange?.(customRange);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.('');
  };

  const displayValue = value || '';

  return (
    <div
      ref={containerRef}
      id={id}
      data-name={name}
      className={`kiyovn-timerangepicker-wrapper ${className}`}
      style={{ position: 'relative', display: 'inline-block', width: '100%', ...style }}
    >
      {/* Trigger Input Box */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel || 'Chọn khung giờ'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className="ant-input kiyovn-timerangepicker-input"
        style={{
          width: '100%',
          height: 32,
          padding: '4px 11px',
          fontSize: 13,
          color: displayValue ? '#1E293B' : '#94A3B8',
          background: disabled ? '#F5F5F5' : '#FFFFFF',
          border: open ? '1px solid #009688' : '1px solid #D9D9D9',
          borderRadius: 6,
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          boxShadow: open ? '0 0 0 2px rgba(0, 150, 136, 0.15)' : 'none',
          transition: 'all 0.15s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          userSelect: 'none',
          boxSizing: 'border-box',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayValue || placeholder}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {allowClear && displayValue && !disabled && (
            <span
              onClick={handleClear}
              style={{
                color: '#94A3B8',
                fontSize: 12,
                cursor: 'pointer',
                lineHeight: 1,
                padding: '2px',
              }}
              title="Xóa lựa chọn"
            >
              ✕
            </span>
          )}

          {/* Clock Icon matching system style */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke={open ? '#009688' : '#94A3B8'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: 'stroke 0.15s ease' }}
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
      </div>

      {/* Menu Dropdown Portal */}
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popupRef}
            role="dialog"
            aria-label="Menu chọn khung giờ"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              zIndex: 100000,
              width: 340,
              maxWidth: 'calc(100vw - 20px)',
              background: '#FFFFFF',
              borderRadius: 8,
              border: '1px solid #E2E8F0',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              padding: '12px 14px',
              userSelect: 'none',
              fontFamily: 'inherit',
              animation: 'flyoutFadeIn 0.15s ease-out',
            }}
          >
            {/* Header Tabs */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
                paddingBottom: 8,
                borderBottom: '1px solid #F1F5F9',
              }}
            >
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setTab('presets')}
                  style={{
                    background: tab === 'presets' ? '#E6F4F2' : 'transparent',
                    color: tab === 'presets' ? '#009688' : '#64748B',
                    border: 'none',
                    borderRadius: 4,
                    padding: '4px 8px',
                    fontSize: 12.5,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  Khung giờ mẫu
                </button>
                <button
                  type="button"
                  onClick={() => setTab('custom')}
                  style={{
                    background: tab === 'custom' ? '#E6F4F2' : 'transparent',
                    color: tab === 'custom' ? '#009688' : '#64748B',
                    border: 'none',
                    borderRadius: 4,
                    padding: '4px 8px',
                    fontSize: 12.5,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  Tùy chỉnh giờ
                </button>
              </div>

              {displayValue && (
                <span
                  style={{
                    fontSize: 11.5,
                    color: '#009688',
                    background: '#E6F4F2',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                >
                  {displayValue}
                </span>
              )}
            </div>

            {/* TAB 1: Presets Menu */}
            {tab === 'presets' && (
              <div
                style={{
                  maxHeight: 220,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  paddingRight: 2,
                }}
              >
                {presets.map((preset) => {
                  const isSelected = displayValue === preset.value;
                  return (
                    <div
                      key={preset.value || preset.label}
                      onClick={() => handleSelectPreset(preset.value)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 12.5,
                        background: isSelected ? '#E6F4F2' : 'transparent',
                        border: isSelected ? '1px solid #009688' : '1px solid transparent',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = '#F8FAFC';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ color: isSelected ? '#009688' : '#0F172A' }}>
                          {preset.label}
                        </span>
                        {preset.description && (
                          <span style={{ fontSize: 11, color: '#94A3B8' }}>{preset.description}</span>
                        )}
                      </div>

                      <span
                        style={{
                          fontSize: 12,
                          color: isSelected ? '#009688' : '#2563EB',
                          background: isSelected ? 'transparent' : '#EFF6FF',
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}
                      >
                        {preset.value || 'Trống'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB 2: Custom Time Range Picker */}
            {tab === 'custom' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 2px' }}>
                {/* Giờ bắt đầu */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12.5, color: '#334155' }}>Giờ bắt đầu:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <select
                      value={startHour}
                      onChange={(e) => setStartHour(e.target.value)}
                      style={{
                        height: 30,
                        padding: '2px 6px',
                        borderRadius: 4,
                        border: '1px solid #D9D9D9',
                        fontSize: 12.5,
                        outline: 'none',
                      }}
                    >
                      {HOURS.map((h) => (
                        <option key={`sh-${h}`} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <span style={{ color: '#64748B' }}>:</span>
                    <select
                      value={startMinute}
                      onChange={(e) => setStartMinute(e.target.value)}
                      style={{
                        height: 30,
                        padding: '2px 6px',
                        borderRadius: 4,
                        border: '1px solid #D9D9D9',
                        fontSize: 12.5,
                        outline: 'none',
                      }}
                    >
                      {MINUTES.map((m) => (
                        <option key={`sm-${m}`} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Giờ kết thúc */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12.5, color: '#334155' }}>Giờ kết thúc:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <select
                      value={endHour}
                      onChange={(e) => setEndHour(e.target.value)}
                      style={{
                        height: 30,
                        padding: '2px 6px',
                        borderRadius: 4,
                        border: '1px solid #D9D9D9',
                        fontSize: 12.5,
                        outline: 'none',
                      }}
                    >
                      {HOURS.map((h) => (
                        <option key={`eh-${h}`} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <span style={{ color: '#64748B' }}>:</span>
                    <select
                      value={endMinute}
                      onChange={(e) => setEndMinute(e.target.value)}
                      style={{
                        height: 30,
                        padding: '2px 6px',
                        borderRadius: 4,
                        border: '1px solid #D9D9D9',
                        fontSize: 12.5,
                        outline: 'none',
                      }}
                    >
                      {MINUTES.map((m) => (
                        <option key={`em-${m}`} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Preview and Action */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 4,
                    paddingTop: 8,
                    borderTop: '1px solid #F1F5F9',
                  }}
                >
                  <span style={{ fontSize: 12, color: '#009688' }}>
                    {startHour}:{startMinute} - {endHour}:{endMinute}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      style={{
                        background: '#F1F5F9',
                        border: 'none',
                        borderRadius: 4,
                        padding: '4px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                        color: '#475569',
                      }}
                    >
                      Đóng
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyCustom}
                      style={{
                        background: '#009688',
                        border: 'none',
                        borderRadius: 4,
                        padding: '4px 12px',
                        fontSize: 12,
                        cursor: 'pointer',
                        color: '#FFFFFF',
                      }}
                    >
                      Áp dụng
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};
