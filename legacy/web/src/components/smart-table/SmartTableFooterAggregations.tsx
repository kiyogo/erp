import React, { useState, useRef, useEffect } from 'react';
import { AggregateOperation } from './types';
import { calculateAggregate } from './utils';
import { ChevronDown, Calculator } from 'lucide-react';

interface SmartTableFooterAggregationsProps {
  columns: any[];
  dataSource: any[];
  hasSelectionColumn: boolean;
  aggregations: Record<string, AggregateOperation>;
  onAggregateChange: (dataIndex: string, op: AggregateOperation) => void;
}

const AGGREGATE_OPTIONS: Array<{ key: AggregateOperation; label: string }> = [
  { key: 'SUM', label: 'Tổng cộng (SUM)' },
  { key: 'AVG', label: 'Trung bình (AVG)' },
  { key: 'COUNT', label: 'Tổng số dòng (COUNT)' },
  { key: 'COUNT_NOT_EMPTY', label: 'Có dữ liệu (NOT EMPTY)' },
  { key: 'COUNT_EMPTY', label: 'Ô trống (EMPTY)' },
  { key: 'MIN', label: 'Nhỏ nhất (MIN)' },
  { key: 'MAX', label: 'Lớn nhất (MAX)' },
];

export const SmartTableFooterAggregations: React.FC<SmartTableFooterAggregationsProps> = ({
  columns,
  dataSource,
  hasSelectionColumn,
  aggregations,
  onAggregateChange,
}) => {
  const [activeDropdownCol, setActiveDropdownCol] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveDropdownCol(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <tfoot
      style={{
        background: '#F8FAFC',
        borderTop: '2px solid #CBD5E1',
        fontWeight: 600,
        fontSize: 12,
        color: '#334155',
      }}
    >
      <tr>
        {hasSelectionColumn && (
          <td
            style={{
              padding: '6px 8px',
              textAlign: 'center',
              borderBottom: 'none',
              color: '#94A3B8',
              background: '#F1F5F9',
            }}
          >
            <Calculator size={13} style={{ display: 'inline-block' }} />
          </td>
        )}

        {columns.map((col, idx) => {
          const colKey = col.dataIndex || col.key || String(idx);
          const currentOp = aggregations[colKey];
          const hasDataIndex = !!col.dataIndex;

          const aggregateResult =
            hasDataIndex && currentOp
              ? calculateAggregate(dataSource, col.dataIndex, currentOp)
              : null;

          return (
            <td
              key={colKey}
              style={{
                padding: '6px 12px',
                borderBottom: 'none',
                position: 'relative',
                whiteSpace: 'nowrap',
                width: col.width,
                minWidth: col.width,
              }}
            >
              {hasDataIndex ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                    {currentOp && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#009688',
                          background: '#E0F2F1',
                          padding: '1px 4px',
                          borderRadius: 3,
                          textTransform: 'uppercase',
                        }}
                      >
                        {currentOp}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: aggregateResult ? '#0F172A' : '#94A3B8' }}>
                      {aggregateResult !== null ? aggregateResult : (idx === 0 ? `Tổng ${dataSource.length}` : '—')}
                    </span>
                  </div>

                  {/* Operation picker toggle */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveDropdownCol(activeDropdownCol === colKey ? null : colKey);
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: 2,
                      display: 'flex',
                      alignItems: 'center',
                      color: '#94A3B8',
                    }}
                    title="Đổi phép tính tổng hợp"
                  >
                    <ChevronDown size={12} />
                  </button>

                  {/* Dropdown Menu */}
                  {activeDropdownCol === colKey && (
                    <div
                      ref={dropdownRef}
                      style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: 0,
                        marginBottom: 4,
                        width: 190,
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: 6,
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        zIndex: 1100,
                        padding: '4px 0',
                      }}
                    >
                      <div style={{ padding: '4px 10px', fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>
                        Chọn phép tính cho {col.title || colKey}:
                      </div>
                      {AGGREGATE_OPTIONS.map((opt) => (
                        <div
                          key={opt.key}
                          onClick={() => {
                            onAggregateChange(colKey, opt.key);
                            setActiveDropdownCol(null);
                          }}
                          style={{
                            padding: '6px 12px',
                            fontSize: 12,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: currentOp === opt.key ? '#F0FDFA' : 'transparent',
                            color: currentOp === opt.key ? '#009688' : '#334155',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background =
                              currentOp === opt.key ? '#F0FDFA' : 'transparent')
                          }
                        >
                          <span>{opt.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <span>—</span>
              )}
            </td>
          );
        })}
      </tr>
    </tfoot>
  );
};
