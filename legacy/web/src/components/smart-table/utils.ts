import { AggregateOperation } from './types';

export function formatAggregateValue(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return val.toLocaleString('vi-VN');
    }
    return Number(val.toFixed(2)).toLocaleString('vi-VN');
  }
  return String(val);
}

export function calculateAggregate(
  data: any[],
  dataIndex: string,
  op: AggregateOperation
): string {
  if (!data || data.length === 0) return '0';

  const values = data.map((item) => {
    if (!item) return undefined;
    return item[dataIndex];
  });

  switch (op) {
    case 'COUNT':
      return `${data.length}`;

    case 'COUNT_NOT_EMPTY': {
      const count = values.filter((v) => v !== undefined && v !== null && v !== '').length;
      return `${count}`;
    }

    case 'COUNT_EMPTY': {
      const count = values.filter((v) => v === undefined || v === null || v === '').length;
      return `${count}`;
    }

    case 'SUM': {
      const numericVals = values
        .map((v) => {
          if (typeof v === 'number') return v;
          if (typeof v === 'string') {
            const clean = v.replace(/[^0-9.-]/g, '');
            const parsed = parseFloat(clean);
            return isNaN(parsed) ? null : parsed;
          }
          return null;
        })
        .filter((v): v is number => v !== null);

      if (numericVals.length === 0) return '—';
      const sum = numericVals.reduce((acc, cur) => acc + cur, 0);
      return formatAggregateValue(sum);
    }

    case 'AVG': {
      const numericVals = values
        .map((v) => {
          if (typeof v === 'number') return v;
          if (typeof v === 'string') {
            const clean = v.replace(/[^0-9.-]/g, '');
            const parsed = parseFloat(clean);
            return isNaN(parsed) ? null : parsed;
          }
          return null;
        })
        .filter((v): v is number => v !== null);

      if (numericVals.length === 0) return '—';
      const avg = numericVals.reduce((acc, cur) => acc + cur, 0) / numericVals.length;
      return formatAggregateValue(avg);
    }

    case 'MIN': {
      const numericVals = values
        .map((v) => {
          if (typeof v === 'number') return v;
          if (typeof v === 'string') {
            const clean = v.replace(/[^0-9.-]/g, '');
            const parsed = parseFloat(clean);
            return isNaN(parsed) ? null : parsed;
          }
          return null;
        })
        .filter((v): v is number => v !== null);

      if (numericVals.length === 0) return '—';
      return formatAggregateValue(Math.min(...numericVals));
    }

    case 'MAX': {
      const numericVals = values
        .map((v) => {
          if (typeof v === 'number') return v;
          if (typeof v === 'string') {
            const clean = v.replace(/[^0-9.-]/g, '');
            const parsed = parseFloat(clean);
            return isNaN(parsed) ? null : parsed;
          }
          return null;
        })
        .filter((v): v is number => v !== null);

      if (numericVals.length === 0) return '—';
      return formatAggregateValue(Math.max(...numericVals));
    }

    default:
      return `${data.length}`;
  }
}

export function exportTableToCsv(
  columns: any[],
  data: any[],
  fileName = 'kiyovn_export_data.csv'
) {
  if (!columns || columns.length === 0 || !data) return;

  const exportCols = columns.filter((col) => col.dataIndex && col.title);
  const headers = exportCols.map((c) => `"${String(c.title || '').replace(/"/g, '""')}"`);

  const rows = data.map((item) => {
    return exportCols
      .map((c) => {
        const rawVal = item[c.dataIndex];
        let strVal = '';
        if (rawVal === null || rawVal === undefined) {
          strVal = '';
        } else if (typeof rawVal === 'object') {
          strVal = JSON.stringify(rawVal);
        } else {
          strVal = String(rawVal);
        }
        return `"${strVal.replace(/"/g, '""')}"`;
      })
      .join(',');
  });

  // UTF-8 BOM \uFEFF ensures Vietnamese text renders flawlessly in Excel
  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName.endsWith('.csv') ? fileName : `${fileName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
