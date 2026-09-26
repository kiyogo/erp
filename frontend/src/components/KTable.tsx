import React, { useState, useEffect, useRef } from 'react';
import { Table, Card, Empty } from '../custom-ui';
import type { TableProps } from '../custom-ui';

export interface KTableProps<T> extends TableProps<T> {
  viewKeyPrefix?: string;
  disableCache?: boolean;
}

export function KTable<T extends object>({
  viewKeyPrefix = 'table',
  disableCache = false,
  dataSource,
  pagination,
  ...rest
}: KTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialPageSize = typeof pagination === 'object' && pagination.pageSize ? pagination.pageSize : 10;
  const initialPage = typeof pagination === 'object' && pagination.current ? pagination.current : 1;

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const isPaginated = pagination !== false;

  // Sync state if pagination props change
  useEffect(() => {
    if (typeof pagination === 'object') {
      if (pagination.current !== undefined) {
        setCurrentPage(pagination.current);
      }
      if (pagination.pageSize !== undefined) {
        setPageSize(pagination.pageSize);
      }
    }
  }, [pagination]);

  // Click outside to deselect
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      // If clicked inside the table container, do nothing
      if (containerRef.current && containerRef.current.contains(target)) {
        return;
      }

      // If clicked inside interactive overlays (like dropdowns, modals, popovers, select options, etc.), do nothing
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
        target.closest('.win11-footer') // For files page footer
      ) {
        return;
      }

      // Trigger deselection if rowSelection is active
      if (rest.rowSelection && rest.rowSelection.onChange) {
        rest.rowSelection.onChange([], [], { type: 'all' });
      }
    };

    window.addEventListener('mousedown', handleGlobalClick);
    return () => window.removeEventListener('mousedown', handleGlobalClick);
  }, [rest.rowSelection]);

  const mergedPagination = pagination === false ? false : {
    ...(typeof pagination === 'object' ? pagination : {}),
    current: currentPage,
    pageSize: pageSize,
    total: dataSource?.length || 0,
    onChange: (page: number, size: number) => {
      React.startTransition(() => {
        setCurrentPage(page);
        setPageSize(size);
      });
      if (typeof pagination === 'object' && pagination.onChange) {
        pagination.onChange(page, size);
      }
    }
  };

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
        description={<span style={{ color: '#BFBFBF', fontSize: 14 }}>No data</span>}
      />
    )
  };

  return (
    <div ref={containerRef} className="kiyovn-data-table-shell" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      <Card style={{ margin: 0, width: '100%', maxWidth: '100%' }} styles={{ body: { padding: 0 } }} className="transparent-table-card kiyovn-data-table-card">
        <Table<T>
          scroll={rest.scroll || { x: 'max-content' }}
          {...rest}
          dataSource={dataSource}
          pagination={mergedPagination}
          locale={mergedLocale}
        />
      </Card>
    </div>
  );
}
