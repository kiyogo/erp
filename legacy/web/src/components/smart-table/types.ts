import React from 'react';
import type { TableProps } from '../../custom-ui';

export type AggregateOperation =
  | 'SUM'
  | 'AVG'
  | 'COUNT'
  | 'COUNT_NOT_EMPTY'
  | 'COUNT_EMPTY'
  | 'MIN'
  | 'MAX';

export interface ColumnSettings {
  key: string;
  title: string;
  visible: boolean;
  width?: number;
  pinned?: 'left' | 'right' | false;
  order: number;
}

export interface BulkActionItem<T = any> {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onClick: (selectedKeys: (string | number)[], selectedRows: T[]) => void;
}

export interface SmartTableProps<T extends object> extends TableProps<T> {
  viewKeyPrefix?: string;
  disableCache?: boolean;
  
  // Enterprise Toolbar & Search
  enableToolbar?: boolean;
  enableSearch?: boolean;
  searchPlaceholder?: string;
  
  // Column Management & Layout
  enableColumnResizing?: boolean;
  enableColumnReordering?: boolean;
  enableColumnVisibility?: boolean;
  enableColumnPinning?: boolean;
  
  // Footer & Aggregations
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
  
  // Grouping
  enableGrouping?: boolean;
  defaultGroupBy?: string;
  
  // Export
  enableExport?: boolean;
  exportFileName?: string;
}
