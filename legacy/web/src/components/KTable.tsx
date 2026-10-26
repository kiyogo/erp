import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Table, Empty } from '../custom-ui';
import type { TableProps } from '../custom-ui';
import { SmartTableFloatingActionBar } from './smart-table/SmartTableFloatingActionBar';
import { SmartTableFooterAggregations } from './smart-table/SmartTableFooterAggregations';
import { SmartTableCellEditor } from './smart-table/SmartTableCellEditor';
import { exportTableToCsv } from './smart-table/utils';
import { AggregateOperation, BulkActionItem } from './smart-table/types';

export interface KTableProps<T extends object = any> extends TableProps<T> {
  viewKeyPrefix?: string;
  disableCache?: boolean;

  // Enterprise Features (Tùy chọn, mặc định không can thiệp vào layout trang)
  enableToolbar?: boolean;
  enableColumnResizing?: boolean;
  enableColumnReordering?: boolean;
  enableAggregations?: boolean;
  defaultAggregations?: Record<string, AggregateOperation>;

  // Selection & Bulk Actions
  enableFloatingActionBar?: boolean;
  onBulkDelete?: (selectedKeys: (string | number)[], selectedRows: T[]) => void;
  bulkActions?: BulkActionItem<T>[];

  // Inline Editing & Keyboard Navigation
  enableInlineEditing?: boolean;
  enableKeyboardNavigation?: boolean;
  onCellChange?: (record: T, dataIndex: string, newValue: any, rowIndex: number) => void;

  // Export
  exportFileName?: string;
}

export function KTable<T extends object>({
  viewKeyPrefix = 'table',
  disableCache = false,
  dataSource,
  columns: rawColumns = [],
  pagination,
  rowSelection,

  // Feature flags: Mặc định sạch sẽ, đồng bộ 100% với layout của web
  enableToolbar = false,
  enableColumnResizing = true,
  enableColumnReordering = false,
  enableAggregations = false,
  defaultAggregations,
  enableFloatingActionBar = true,
  onBulkDelete,
  bulkActions,
  enableInlineEditing = false,
  enableKeyboardNavigation = false,
  onCellChange,
  exportFileName,

  ...rest
}: KTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceRows = dataSource || [];

  // ================= 1. PAGINATION & MOBILE =================
  const initialPageSize = typeof pagination === 'object' && pagination.pageSize ? pagination.pageSize : 10;
  const initialPage = typeof pagination === 'object' && pagination.current ? pagination.current : 1;

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [isMobileTable, setIsMobileTable] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 992);
  const [mobileVisibleCount, setMobileVisibleCount] = useState(10);
  const mobilePageSize = 10;

  useEffect(() => {
    if (typeof pagination === 'object') {
      if (pagination.current !== undefined) setCurrentPage(pagination.current);
      if (pagination.pageSize !== undefined) setPageSize(pagination.pageSize);
    }
  }, [pagination]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setIsMobileTable(window.innerWidth <= 992);
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setMobileVisibleCount(mobilePageSize);
  }, [sourceRows.length, isMobileTable]);

  useEffect(() => {
    if (!isMobileTable || pagination === false) return;
    const scrollRoot = containerRef.current?.closest('.kiyovn-main-content') || window;
    const loadMoreIfNeeded = () => {
      const totalRows = sourceRows.length;
      if (mobileVisibleCount >= totalRows) return;
      const remaining =
        scrollRoot === window
          ? document.documentElement.scrollHeight - window.scrollY - window.innerHeight
          : (scrollRoot as HTMLElement).scrollHeight - (scrollRoot as HTMLElement).scrollTop - (scrollRoot as HTMLElement).clientHeight;
      if (remaining <= 180) {
        setMobileVisibleCount((current) => Math.min(current + mobilePageSize, totalRows));
      }
    };
    scrollRoot.addEventListener('scroll', loadMoreIfNeeded, { passive: true });
    window.addEventListener('resize', loadMoreIfNeeded);
    loadMoreIfNeeded();
    return () => {
      scrollRoot.removeEventListener('scroll', loadMoreIfNeeded);
      window.removeEventListener('resize', loadMoreIfNeeded);
    };
  }, [isMobileTable, pagination, sourceRows.length, mobileVisibleCount]);

  // ================= 2. COLUMN RESIZING =================
  const storageKey = `kiyovn_table_${viewKeyPrefix}`;

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    if (disableCache) return {};
    try {
      const saved = localStorage.getItem(`${storageKey}_widths`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const saveWidths = useCallback((newWidths: Record<string, number>) => {
    setColumnWidths(newWidths);
    if (!disableCache) {
      try {
        localStorage.setItem(`${storageKey}_widths`, JSON.stringify(newWidths));
      } catch {}
    }
  }, [disableCache, storageKey]);

  const resizingColRef = useRef<{ colKey: string; startX: number; startWidth: number } | null>(null);

  const handleResizeStart = (e: React.MouseEvent, colKey: string, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizingColRef.current = { colKey, startX: e.clientX, startWidth: currentWidth || 120 };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingColRef.current) return;
      const delta = moveEvent.clientX - resizingColRef.current.startX;
      const newWidth = Math.max(60, resizingColRef.current.startWidth + delta);
      setColumnWidths((prev) => ({ ...prev, [resizingColRef.current!.colKey]: newWidth }));
    };

    const handleMouseUp = () => {
      if (resizingColRef.current) {
        saveWidths({
          ...columnWidths,
          [resizingColRef.current.colKey]: columnWidths[resizingColRef.current.colKey] || resizingColRef.current.startWidth,
        });
        resizingColRef.current = null;
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // ================= 3. INLINE EDITING & CELL FOCUS =================
  const [focusedCell, setFocusedCell] = useState<{ rowIdx: number; colKey: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colKey: string; val: any } | null>(null);

  // Click outside to deselect
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      if (containerRef.current && containerRef.current.contains(target)) return;
      if (
        target.closest('.ant-modal') ||
        target.closest('.ant-popover') ||
        target.closest('.ant-tooltip') ||
        target.closest('.ant-dropdown') ||
        target.closest('.ant-select') ||
        target.closest('.ant-select-dropdown') ||
        target.closest('.ant-checkbox-wrapper') ||
        target.closest('.ant-message') ||
        target.closest('.ant-notification') ||
        target.closest('.win11-footer')
      ) {
        return;
      }
      setFocusedCell(null);
      if (rowSelection && rowSelection.onChange) {
        rowSelection.onChange([], [], { type: 'all' });
      }
    };
    window.addEventListener('mousedown', handleGlobalClick);
    return () => window.removeEventListener('mousedown', handleGlobalClick);
  }, [rowSelection]);

  // Keyboard navigation
  useEffect(() => {
    if (!enableKeyboardNavigation) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingCell) return;
      if (!focusedCell) return;

      const currentColIdx = rawColumns.findIndex((c: any) => (c.key || c.dataIndex) === focusedCell.colKey);
      const totalPageRows = sourceRows.length;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedCell((prev) => prev ? { ...prev, rowIdx: Math.max(0, prev.rowIdx - 1) } : null);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedCell((prev) => prev ? { ...prev, rowIdx: Math.min(totalPageRows - 1, prev.rowIdx + 1) } : null);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentColIdx > 0) {
          const prevCol: any = rawColumns[currentColIdx - 1];
          setFocusedCell((prev) => prev ? { ...prev, colKey: prevCol.key || prevCol.dataIndex } : null);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentColIdx < rawColumns.length - 1) {
          const nextCol: any = rawColumns[currentColIdx + 1];
          setFocusedCell((prev) => prev ? { ...prev, colKey: nextCol.key || nextCol.dataIndex } : null);
        }
      } else if (e.key === 'Escape') {
        setFocusedCell(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboardNavigation, focusedCell, editingCell, rawColumns, sourceRows.length]);

  // ================= 4. ENHANCED COLUMNS (CLEAN NATIVE DESIGN) =================
  const enhancedColumns = useMemo(() => {
    return rawColumns.map((col: any, colIdx: number) => {
      const colKey = col.key || col.dataIndex || String(colIdx);
      const colWidth = columnWidths[colKey] || col.width;

      const originalRender = col.render;

      return {
        ...col,
        width: colWidth,
        render: (text: any, record: any, index: number) => {
          const isEditing = editingCell && editingCell.rowIdx === index && editingCell.colKey === colKey;
          const isFocused = focusedCell && focusedCell.rowIdx === index && focusedCell.colKey === colKey;

          if (isEditing) {
            return (
              <SmartTableCellEditor
                initialValue={text}
                inputType={typeof text === 'number' ? 'number' : 'text'}
                onSave={(newVal) => {
                  setEditingCell(null);
                  if (onCellChange) {
                    onCellChange(record, colKey, newVal, index);
                  } else {
                    record[colKey] = newVal;
                  }
                }}
                onCancel={() => setEditingCell(null)}
              />
            );
          }

          const renderedContent = originalRender ? originalRender(text, record, index) : text;

          // Nếu bật inline edit hoặc keyboard nav thì mới gắn event để tối ưu hiệu năng
          if (enableInlineEditing || enableKeyboardNavigation) {
            return (
              <div
                onClick={() => setFocusedCell({ rowIdx: index, colKey })}
                onDoubleClick={() => {
                  if (enableInlineEditing && col.dataIndex) {
                    setEditingCell({ rowIdx: index, colKey, val: text });
                  }
                }}
                style={{
                  outline: isFocused ? '1.5px solid var(--antd-primary, #009688)' : 'none',
                  outlineOffset: -1,
                  backgroundColor: isFocused ? 'rgba(0, 150, 136, 0.04)' : undefined,
                  borderRadius: 2,
                }}
              >
                {renderedContent}
              </div>
            );
          }

          return renderedContent;
        },
        title: (
          <div
            style={{
              position: 'relative',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span className="ant-table-header-cell-title">{col.title}</span>

            {/* Seamless Resize Handle: Vô hình, chỉ hiện con trỏ khi rê chuột giữa 2 cột */}
            {enableColumnResizing && (
              <div
                onMouseDown={(e) => handleResizeStart(e, colKey, Number(colWidth) || 120)}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  right: -8,
                  top: -8,
                  bottom: -8,
                  width: 12,
                  cursor: 'col-resize',
                  zIndex: 2,
                  userSelect: 'none',
                }}
                title="Kéo để chỉnh độ rộng cột"
              />
            )}
          </div>
        ),
      };
    });
  }, [
    rawColumns,
    columnWidths,
    editingCell,
    focusedCell,
    enableInlineEditing,
    enableKeyboardNavigation,
    enableColumnResizing,
    onCellChange,
  ]);

  // ================= 5. FOOTER AGGREGATIONS =================
  const [aggregations, setAggregations] = useState<Record<string, AggregateOperation>>(() => {
    if (defaultAggregations) return defaultAggregations;
    const auto: Record<string, AggregateOperation> = {};
    if (sourceRows.length > 0) {
      const sample = sourceRows[0];
      rawColumns.forEach((c: any) => {
        if (c.dataIndex && typeof sample[c.dataIndex] === 'number') {
          auto[c.dataIndex] = 'SUM';
        }
      });
    }
    return auto;
  });

  const handleAggregateChange = useCallback((dataIndex: string, op: AggregateOperation) => {
    setAggregations((prev) => ({ ...prev, [dataIndex]: op }));
  }, []);

  // ================= 6. EXPORT SELECTED =================
  const handleExportSelected = useCallback(() => {
    if (!rowSelection?.selectedRowKeys || rowSelection.selectedRowKeys.length === 0) return;
    const selectedRows = sourceRows.filter((r: any, idx: number) => {
      const key = (rest.rowKey && typeof rest.rowKey === 'function') ? rest.rowKey(r, idx) : (r.id || r.key || idx);
      return rowSelection.selectedRowKeys.includes(key);
    });
    exportTableToCsv(
      rawColumns,
      selectedRows,
      exportFileName || `${viewKeyPrefix}_selected.csv`
    );
  }, [rowSelection, sourceRows, rest.rowKey, rawColumns, exportFileName, viewKeyPrefix]);

  // ================= 7. PAGINATION MERGE =================
  const mergedPagination = pagination === false ? false : {
    ...(typeof pagination === 'object' ? pagination : {}),
    current: currentPage,
    pageSize: pageSize,
    total: sourceRows.length,
    onChange: (page: number, size: number) => {
      React.startTransition(() => {
        setCurrentPage(page);
        setPageSize(size);
      });
      if (typeof pagination === 'object' && pagination.onChange) {
        pagination.onChange(page, size);
      }
    },
  };

  const mobileInfiniteMode = isMobileTable && pagination !== false;
  const visibleDataSource = mobileInfiniteMode ? sourceRows.slice(0, mobileVisibleCount) : dataSource;
  const visiblePagination = mobileInfiniteMode ? false : mergedPagination;

  const mergedLocale = {
    triggerDesc: 'Nhấp để sắp xếp giảm dần',
    triggerAsc: 'Nhấp để sắp xếp tăng dần',
    cancelSort: 'Nhấp để hủy sắp xếp',
    ...rest.locale,
    emptyText: rest.locale?.emptyText !== undefined ? (
      typeof rest.locale.emptyText === 'string' ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span style={{ color: '#BFBFBF', fontSize: 14 }}>{rest.locale.emptyText}</span>}
        />
      ) : (
        rest.locale.emptyText
      )
    ) : (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<span style={{ color: '#BFBFBF', fontSize: 14 }}>Chưa có dữ liệu</span>}
      />
    ),
  };

  const selectedCount = rowSelection?.selectedRowKeys?.length || 0;

  return (
    <div
      ref={containerRef}
      className={`kiyovn-data-table-shell ${mobileInfiniteMode ? 'kiyovn-data-table-mobile-infinite' : ''}`}
      style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', position: 'relative' }}
    >
      {/* Table chuẩn 100% Native Ant Design / Kiyovn Custom UI */}
      <Table<T>
        scroll={rest.scroll || { x: 'max-content' }}
        {...rest}
        columns={enhancedColumns}
        dataSource={visibleDataSource}
        pagination={visiblePagination}
        locale={mergedLocale}
      />

      {/* Footer Aggregations: Chỉ hiển thị khi được bật */}
      {enableAggregations && sourceRows.length > 0 && (
        <div
          style={{
            marginTop: -1,
            border: '1px solid var(--antd-border, #E2E8F0)',
            borderRadius: '0 0 8px 8px',
            overflowX: 'auto',
            background: 'var(--color-bg-sub, #F8FAFC)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <SmartTableFooterAggregations
              columns={enhancedColumns}
              dataSource={sourceRows}
              hasSelectionColumn={!!rowSelection}
              aggregations={aggregations}
              onAggregateChange={handleAggregateChange}
            />
          </table>
        </div>
      )}

      {/* Floating Bulk Action Bar: Tự động trượt lên khi có ít nhất 1 dòng được chọn */}
      {enableFloatingActionBar && (
        <SmartTableFloatingActionBar
          selectedCount={selectedCount}
          onClearSelection={() => {
            if (rowSelection && rowSelection.onChange) {
              rowSelection.onChange([], [], { type: 'all' });
            }
          }}
          onExportSelected={handleExportSelected}
          onDeleteSelected={
            onBulkDelete && rowSelection
              ? () => {
                  const selKeys = rowSelection.selectedRowKeys || [];
                  const selRows = sourceRows.filter((r: any, idx: number) => {
                    const key = (rest.rowKey && typeof rest.rowKey === 'function') ? rest.rowKey(r, idx) : (r.id || r.key || idx);
                    return selKeys.includes(key);
                  });
                  onBulkDelete(selKeys, selRows);
                }
              : undefined
          }
          bulkActions={bulkActions}
          selectedKeys={rowSelection?.selectedRowKeys || []}
          selectedRows={
            rowSelection?.selectedRowKeys
              ? sourceRows.filter((r: any, idx: number) => {
                  const key = (rest.rowKey && typeof rest.rowKey === 'function') ? rest.rowKey(r, idx) : (r.id || r.key || idx);
                  return rowSelection.selectedRowKeys.includes(key);
                })
              : []
          }
        />
      )}
    </div>
  );
}
