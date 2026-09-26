import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const MONTH_NAMES_VI = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
];

const WEEKDAYS_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export interface DatePickerProps {
  value?: string;
  onChange?: (dateStr: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
  format?: string; // 'YYYY-MM-DD' or 'MM/DD/YYYY'
  allowClear?: boolean;
  name?: string;
  id?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  placeholder = 'YYYY-MM-DD',
  disabled = false,
  style,
  className = '',
  format = 'YYYY-MM-DD',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'date' | 'month' | 'year'>('date');
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Parse initial date from value
  const parseDate = (val?: string) => {
    if (!val) return null;
    if (val.includes('-')) {
      const [y, m, d] = val.split('-').map(Number);
      if (y && m && d) return new Date(y, m - 1, d);
    }
    if (val.includes('/')) {
      const parts = val.split('/').map(Number);
      if (parts.length === 3) {
        if (parts[0] > 1900) return new Date(parts[0], parts[1] - 1, parts[2]); // YYYY/MM/DD
        return new Date(parts[2], parts[0] - 1, parts[1]); // MM/DD/YYYY
      }
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const selectedDate = parseDate(value);
  const today = new Date();

  const [viewYear, setViewYear] = useState(selectedDate ? selectedDate.getFullYear() : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate ? selectedDate.getMonth() : today.getMonth());
  const [yearPageStart, setYearPageStart] = useState(Math.floor((selectedDate ? selectedDate.getFullYear() : today.getFullYear()) / 12) * 12);

  useEffect(() => {
    if (value) {
      const d = parseDate(value);
      if (d) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
        setYearPageStart(Math.floor(d.getFullYear() / 12) * 12);
      }
    }
  }, [value]);

  // Calculate popup position with smart flip
  const updatePosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const popupHeight = 310;
    const popupWidth = 280;

    let top = rect.bottom + 4;
    let left = rect.left;

    // Flip upwards if not enough space below
    if (top + popupHeight > window.innerHeight && rect.top - popupHeight - 4 > 0) {
      top = rect.top - popupHeight - 4;
    }

    // Adjust left if overflowing right
    if (left + popupWidth > window.innerWidth) {
      left = Math.max(10, window.innerWidth - popupWidth - 10);
    }

    setPos({ top, left });
  };

  const handleOpen = () => {
    if (disabled) return;
    updatePosition();
    setOpen(!open);
    setMode('date');
  };

  // Outside click & scroll handler
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

    const handleWindowEvents = () => {
      if (open) updatePosition();
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

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const handlePrevYear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewYear(y => y - 1);
  };

  const handleNextYear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewYear(y => y + 1);
  };

  const formatDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    if (format === 'MM/DD/YYYY') {
      return `${m}/${day}/${y}`;
    }
    return `${y}-${m}-${day}`;
  };

  const handleSelectDay = (day: number, isCurrentMonth: boolean, monthOffset = 0) => {
    let targetMonth = viewMonth + monthOffset;
    let targetYear = viewYear;
    if (targetMonth < 0) {
      targetMonth = 11;
      targetYear -= 1;
    } else if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }

    const d = new Date(targetYear, targetMonth, day);
    const dateStr = formatDateStr(d);
    onChange && onChange(dateStr);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange && onChange('');
    setOpen(false);
  };

  const handleToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = new Date();
    onChange && onChange(formatDateStr(now));
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setOpen(false);
  };

  // Generate 42 calendar cells
  const getDaysGrid = () => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    let startDayOfWeek = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: { day: number; isCurrentMonth: boolean; monthOffset: number }[] = [];

    // Leading days from previous month
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      cells.push({ day: daysInPrevMonth - i, isCurrentMonth: false, monthOffset: -1 });
    }

    // Days in current month
    for (let i = 1; i <= daysInMonth; i++) {
      cells.push({ day: i, isCurrentMonth: true, monthOffset: 0 });
    }

    // Trailing days from next month to fill 42 cells (6 rows)
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      cells.push({ day: i, isCurrentMonth: false, monthOffset: 1 });
    }

    return cells;
  };

  const displayValue = value ? value : '';

  return (
    <div
      ref={containerRef}
      className={`kiyovn-datepicker-wrapper ${className}`}
      style={{ position: 'relative', display: 'inline-block', width: '100%', ...style }}
    >
      {/* Date Input Box */}
      <div
        onClick={handleOpen}
        className="ant-input kiyovn-datepicker-input"
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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </div>

      {/* Date Picker Dropdown Portal */}
      {open && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popupRef}
            className="kiyovn-datepicker-popup"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              zIndex: 100000,
              width: 280,
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
            {/* Header Navigation */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
                paddingBottom: 6,
                borderBottom: '1px solid #F1F5F9',
              }}
            >
              {/* Prev Month & Year */}
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={mode === 'year' ? () => setYearPageStart(y => y - 12) : handlePrevYear}
                  title={mode === 'year' ? 'Khoảng năm trước' : 'Năm trước'}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748B',
                    padding: '4px 6px',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = '#009688';
                    e.currentTarget.style.background = '#F1F5F9';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = '#64748B';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="11 17 6 12 11 7" />
                    <polyline points="18 17 13 12 18 7" />
                  </svg>
                </button>
                {mode === 'date' && (
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    title="Tháng trước"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#64748B',
                      padding: '4px 6px',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.color = '#009688';
                      e.currentTarget.style.background = '#F1F5F9';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.color = '#64748B';
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Month & Year Title Dropdown Triggers */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {mode === 'date' && (
                  <>
                    <span
                      onClick={() => setMode('month')}
                      style={{
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 13.5,
                        color: '#1E293B',
                        padding: '2px 4px',
                        borderRadius: 4,
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#009688')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#1E293B')}
                    >
                      {MONTH_NAMES_VI[viewMonth]}
                    </span>
                    <span
                      onClick={() => setMode('year')}
                      style={{
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 13.5,
                        color: '#1E293B',
                        padding: '2px 4px',
                        borderRadius: 4,
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#009688')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#1E293B')}
                    >
                      {viewYear}
                    </span>
                  </>
                )}
                {mode === 'month' && (
                  <span
                    onClick={() => setMode('year')}
                    style={{
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 14,
                      color: '#009688',
                      padding: '2px 4px',
                      borderRadius: 4,
                    }}
                  >
                    {viewYear}
                  </span>
                )}
                {mode === 'year' && (
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: '#009688',
                      padding: '2px 4px',
                    }}
                  >
                    {yearPageStart} - {yearPageStart + 11}
                  </span>
                )}
              </div>

              {/* Next Month & Year */}
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                {mode === 'date' && (
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    title="Tháng sau"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#64748B',
                      padding: '4px 6px',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.color = '#009688';
                      e.currentTarget.style.background = '#F1F5F9';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.color = '#64748B';
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={mode === 'year' ? () => setYearPageStart(y => y + 12) : handleNextYear}
                  title={mode === 'year' ? 'Khoảng năm sau' : 'Năm sau'}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748B',
                    padding: '4px 6px',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = '#009688';
                    e.currentTarget.style.background = '#F1F5F9';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = '#64748B';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="13 17 18 12 13 7" />
                    <polyline points="6 17 11 12 6 7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Mode 1: Month Quick Selector */}
            {mode === 'month' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '6px 0' }}>
                {MONTH_NAMES_VI.map((mName, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setViewMonth(idx);
                      setMode('date');
                    }}
                    style={{
                      padding: '8px 4px',
                      fontSize: 12.5,
                      borderRadius: 6,
                      border: viewMonth === idx ? '1px solid #009688' : '1px solid #E2E8F0',
                      background: viewMonth === idx ? '#009688' : '#FFFFFF',
                      color: viewMonth === idx ? '#FFFFFF' : '#1E293B',
                      cursor: 'pointer',
                      fontWeight: viewMonth === idx ? 600 : 400,
                      transition: 'all 0.1s',
                    }}
                    onMouseEnter={e => {
                      if (viewMonth !== idx) e.currentTarget.style.background = '#F1F5F9';
                    }}
                    onMouseLeave={e => {
                      if (viewMonth !== idx) e.currentTarget.style.background = '#FFFFFF';
                    }}
                  >
                    {mName}
                  </button>
                ))}
              </div>
            )}

            {/* Mode 2: Year Quick Selector */}
            {mode === 'year' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '6px 0' }}>
                {Array.from({ length: 12 }).map((_, idx) => {
                  const y = yearPageStart + idx;
                  const isSelected = y === viewYear;
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => {
                        setViewYear(y);
                        setMode('month');
                      }}
                      style={{
                        padding: '8px 4px',
                        fontSize: 12.5,
                        borderRadius: 6,
                        border: isSelected ? '1px solid #009688' : '1px solid #E2E8F0',
                        background: isSelected ? '#009688' : '#FFFFFF',
                        color: isSelected ? '#FFFFFF' : '#1E293B',
                        cursor: 'pointer',
                        fontWeight: isSelected ? 600 : 400,
                        transition: 'all 0.1s',
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) e.currentTarget.style.background = '#F1F5F9';
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) e.currentTarget.style.background = '#FFFFFF';
                      }}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Mode 3: Day Grid View */}
            {mode === 'date' && (
              <>
                {/* Weekdays Header: T2 T3 T4 T5 T6 T7 CN */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    textAlign: 'center',
                    marginBottom: 6,
                  }}
                >
                  {WEEKDAYS_VI.map((w, idx) => (
                    <div
                      key={idx}
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: idx >= 5 ? '#EF4444' : '#64748B',
                        padding: '4px 0',
                      }}
                    >
                      {w}
                    </div>
                  ))}
                </div>

                {/* Days Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    rowGap: 3,
                    columnGap: 2,
                    textAlign: 'center',
                  }}
                >
                  {getDaysGrid().map((cell, idx) => {
                    let isSelected = false;
                    if (selectedDate && cell.isCurrentMonth) {
                      isSelected =
                        selectedDate.getFullYear() === viewYear &&
                        selectedDate.getMonth() === viewMonth &&
                        selectedDate.getDate() === cell.day;
                    }

                    const isToday =
                      today.getFullYear() === viewYear &&
                      today.getMonth() === viewMonth + cell.monthOffset &&
                      today.getDate() === cell.day;

                    return (
                      <div
                        key={idx}
                        onClick={() => handleSelectDay(cell.day, cell.isCurrentMonth, cell.monthOffset)}
                        style={{
                          height: 28,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12.5,
                          fontWeight: isSelected ? 600 : isToday ? 600 : 400,
                          color: isSelected
                            ? '#FFFFFF'
                            : cell.isCurrentMonth
                            ? '#1E293B'
                            : '#CBD5E1',
                          background: isSelected ? '#009688' : isToday ? '#E0F2F1' : 'transparent',
                          borderRadius: 4,
                          cursor: 'pointer',
                          transition: 'all 0.1s ease',
                        }}
                        onMouseEnter={e => {
                          if (!isSelected) {
                            e.currentTarget.style.background = '#F1F5F9';
                          }
                        }}
                        onMouseLeave={e => {
                          if (!isSelected) {
                            e.currentTarget.style.background = isToday ? '#E0F2F1' : 'transparent';
                          }
                        }}
                      >
                        {cell.day}
                      </div>
                    );
                  })}
                </div>

                {/* Footer: Xóa | Hôm nay */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: '1px solid #F1F5F9',
                  }}
                >
                  <button
                    type="button"
                    onClick={handleClear}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#64748B',
                      fontSize: 12.5,
                      cursor: 'pointer',
                      padding: '2px 4px',
                      fontWeight: 500,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#64748B')}
                  >
                    Xóa
                  </button>
                  <button
                    type="button"
                    onClick={handleToday}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#009688',
                      fontSize: 12.5,
                      cursor: 'pointer',
                      padding: '2px 4px',
                      fontWeight: 600,
                    }}
                  >
                    Hôm nay
                  </button>
                </div>
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};
