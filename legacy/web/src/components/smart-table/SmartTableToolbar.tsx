import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  SlidersHorizontal,
  Download,
  Calculator,
  RotateCcw,
  Check,
  X,
  Layers,
  Eye,
  EyeOff,
} from 'lucide-react';

interface SmartTableToolbarProps {
  searchText: string;
  onSearchChange: (text: string) => void;
  searchPlaceholder?: string;
  totalRecords: number;
  filteredCount: number;
  
  // Columns
  allColumns: any[];
  columnVisibility: Record<string, boolean>;
  onToggleColumnVisibility: (colKey: string) => void;
  onResetColumns: () => void;
  
  // Footer Aggregations
  showAggregations: boolean;
  onToggleAggregations: () => void;
  
  // Grouping
  groupByField: string | null;
  onGroupByChange: (field: string | null) => void;
  availableGroupFields: Array<{ key: string; title: string }>;
  
  // Export
  onExport: () => void;
}

export const SmartTableToolbar: React.FC<SmartTableToolbarProps> = ({
  searchText,
  onSearchChange,
  searchPlaceholder = 'Tìm kiếm dữ liệu trong bảng...',
  totalRecords,
  filteredCount,
  allColumns,
  columnVisibility,
  onToggleColumnVisibility,
  onResetColumns,
  showAggregations,
  onToggleAggregations,
  groupByField,
  onGroupByChange,
  availableGroupFields,
  onExport,
}) => {
  const [columnsDropdownOpen, setColumnsDropdownOpen] = useState(false);
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setColumnsDropdownOpen(false);
      }
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) {
        setGroupDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const visibleCount = allColumns.filter(
    (c) => columnVisibility[c.key || c.dataIndex] !== false
  ).length;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
        padding: '10px 14px',
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '8px 8px 0 0',
        borderBottom: 'none',
      }}
    >
      {/* Left: Quick Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            maxWidth: 360,
          }}
        >
          <Search
            size={15}
            style={{ position: 'absolute', left: 10, color: '#94A3B8', pointerEvents: 'none' }}
          />
          <input
            type="text"
            value={searchText}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            style={{
              width: '100%',
              height: 32,
              padding: '4px 28px 4px 32px',
              fontSize: 13,
              borderRadius: 6,
              border: '1px solid #CBD5E1',
              outline: 'none',
              background: '#F8FAFC',
              transition: 'border-color 0.2s, background 0.2s',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#009688';
              e.currentTarget.style.background = '#FFFFFF';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#CBD5E1';
              e.currentTarget.style.background = '#F8FAFC';
            }}
          />
          {searchText && (
            <button
              onClick={() => onSearchChange('')}
              style={{
                position: 'absolute',
                right: 8,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#94A3B8',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Counter Badge */}
        <div
          style={{
            fontSize: 12,
            color: '#64748B',
            whiteSpace: 'nowrap',
          }}
        >
          {filteredCount !== totalRecords ? (
            <span>
              Tìm thấy <strong style={{ color: '#009688' }}>{filteredCount}</strong> / {totalRecords} dòng
            </span>
          ) : (
            <span>Tổng: <strong>{totalRecords}</strong> dòng</span>
          )}
        </div>
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Group By selector */}
        {availableGroupFields.length > 0 && (
          <div ref={groupRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setGroupDropdownOpen(!groupDropdownOpen)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                height: 32,
                padding: '0 10px',
                fontSize: 12,
                fontWeight: 500,
                color: groupByField ? '#009688' : '#475569',
                background: groupByField ? '#E0F2F1' : '#F8FAFC',
                border: `1px solid ${groupByField ? '#80CBC4' : '#CBD5E1'}`,
                borderRadius: 6,
                cursor: 'pointer',
              }}
              title="Phân nhóm dữ liệu"
            >
              <Layers size={14} />
              <span>{groupByField ? `Nhóm: ${availableGroupFields.find(f => f.key === groupByField)?.title || groupByField}` : 'Gom nhóm'}</span>
            </button>

            {groupDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 4,
                  width: 200,
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: 8,
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                  zIndex: 1000,
                  padding: '6px 0',
                }}
              >
                <div style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>
                  Chọn cột gom nhóm
                </div>
                <div
                  onClick={() => {
                    onGroupByChange(null);
                    setGroupDropdownOpen(false);
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    color: !groupByField ? '#009688' : '#334155',
                    background: !groupByField ? '#F0FDFA' : 'transparent',
                  }}
                >
                  <span>Không gom nhóm</span>
                  {!groupByField && <Check size={14} color="#009688" />}
                </div>
                {availableGroupFields.map((field) => (
                  <div
                    key={field.key}
                    onClick={() => {
                      onGroupByChange(field.key);
                      setGroupDropdownOpen(false);
                    }}
                    style={{
                      padding: '6px 12px',
                      fontSize: 13,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      color: groupByField === field.key ? '#009688' : '#334155',
                      background: groupByField === field.key ? '#F0FDFA' : 'transparent',
                    }}
                  >
                    <span>{field.title}</span>
                    {groupByField === field.key && <Check size={14} color="#009688" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Aggregations Toggle */}
        <button
          type="button"
          onClick={onToggleAggregations}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 32,
            padding: '0 10px',
            fontSize: 12,
            fontWeight: 500,
            color: showAggregations ? '#009688' : '#475569',
            background: showAggregations ? '#E0F2F1' : '#F8FAFC',
            border: `1px solid ${showAggregations ? '#80CBC4' : '#CBD5E1'}`,
            borderRadius: 6,
            cursor: 'pointer',
          }}
          title="Bật/Tắt dòng tính toán tổng hợp chân bảng"
        >
          <Calculator size={14} />
          <span>Tổng hợp</span>
        </button>

        {/* Columns Settings Dropdown */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setColumnsDropdownOpen(!columnsDropdownOpen)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: 32,
              padding: '0 10px',
              fontSize: 12,
              fontWeight: 500,
              color: '#475569',
              background: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: 6,
              cursor: 'pointer',
            }}
            title="Tùy chỉnh ẩn/hiện cột"
          >
            <SlidersHorizontal size={14} />
            <span>Cột ({visibleCount}/{allColumns.length})</span>
          </button>

          {columnsDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                width: 240,
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 8,
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                zIndex: 1000,
                padding: '8px 0',
                maxHeight: 320,
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 12px 8px',
                  borderBottom: '1px solid #F1F5F9',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#475569',
                }}
              >
                <span>Hiển thị cột ({visibleCount})</span>
                <button
                  type="button"
                  onClick={onResetColumns}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#009688',
                    cursor: 'pointer',
                    fontSize: 11,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <RotateCcw size={11} /> Mặc định
                </button>
              </div>

              <div style={{ padding: '4px 0' }}>
                {allColumns.map((col) => {
                  const colKey = col.key || col.dataIndex || col.title;
                  const isVisible = columnVisibility[colKey] !== false;
                  return (
                    <div
                      key={colKey}
                      onClick={() => onToggleColumnVisibility(colKey)}
                      style={{
                        padding: '6px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        fontSize: 13,
                        color: isVisible ? '#1E293B' : '#94A3B8',
                        userSelect: 'none',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {col.title || colKey}
                      </span>
                      {isVisible ? (
                        <Eye size={15} color="#009688" />
                      ) : (
                        <EyeOff size={15} color="#CBD5E1" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Export Button */}
        <button
          type="button"
          onClick={onExport}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 32,
            padding: '0 10px',
            fontSize: 12,
            fontWeight: 500,
            color: '#FFFFFF',
            background: '#009688',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#00796B')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#009688')}
          title="Xuất bảng ra tệp CSV / Excel"
        >
          <Download size={14} />
          <span>Xuất Excel</span>
        </button>
      </div>
    </div>
  );
};
