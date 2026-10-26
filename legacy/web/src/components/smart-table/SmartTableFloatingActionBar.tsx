import React from 'react';
import { Download, Trash2, X, CheckSquare } from 'lucide-react';
import { BulkActionItem } from './types';

interface SmartTableFloatingActionBarProps<T = any> {
  selectedCount: number;
  onClearSelection: () => void;
  onExportSelected: () => void;
  onDeleteSelected?: () => void;
  bulkActions?: BulkActionItem<T>[];
  selectedKeys: (string | number)[];
  selectedRows: T[];
}

export function SmartTableFloatingActionBar<T = any>({
  selectedCount,
  onClearSelection,
  onExportSelected,
  onDeleteSelected,
  bulkActions = [],
  selectedKeys,
  selectedRows,
}: SmartTableFloatingActionBarProps<T>) {
  if (selectedCount === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1050,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 18px',
        background: '#1E293B',
        color: '#FFFFFF',
        borderRadius: 12,
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
        border: '1px solid #334155',
        animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translate(-50%, 20px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}</style>

      {/* Selected Counter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 8, borderRight: '1px solid #475569' }}>
        <CheckSquare size={16} color="#2DD4BF" />
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          Đã chọn <strong style={{ color: '#2DD4BF' }}>{selectedCount}</strong> bản ghi
        </span>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Export Selected */}
        <button
          type="button"
          onClick={onExportSelected}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            height: 30,
            padding: '0 12px',
            fontSize: 12,
            fontWeight: 500,
            color: '#F8FAFC',
            background: '#334155',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#475569')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#334155')}
        >
          <Download size={14} />
          <span>Xuất dữ liệu đã chọn</span>
        </button>

        {/* Custom bulk actions */}
        {bulkActions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => action.onClick(selectedKeys, selectedRows)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 30,
              padding: '0 12px',
              fontSize: 12,
              fontWeight: 500,
              color: action.danger ? '#FCA5A5' : '#F8FAFC',
              background: action.danger ? '#7F1D1D' : '#334155',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = action.danger ? '#991B1B' : '#475569')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = action.danger ? '#7F1D1D' : '#334155')
            }
          >
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}

        {/* Delete Selected (if onBulkDelete is passed) */}
        {onDeleteSelected && (
          <button
            type="button"
            onClick={onDeleteSelected}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 30,
              padding: '0 12px',
              fontSize: 12,
              fontWeight: 500,
              color: '#FCA5A5',
              background: '#7F1D1D',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#991B1B')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#7F1D1D')}
          >
            <Trash2 size={14} />
            <span>Xóa {selectedCount} mục</span>
          </button>
        )}

        {/* Deselect / Close */}
        <button
          type="button"
          onClick={onClearSelection}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            padding: 0,
            background: 'transparent',
            border: 'none',
            borderRadius: 6,
            color: '#94A3B8',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
          title="Bỏ chọn tất cả"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
