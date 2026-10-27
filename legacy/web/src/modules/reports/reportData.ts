export type ReportPeriod = `${number}-Q${1 | 2 | 3 | 4}` | `${number}-ALL`;

export type ReportSourceType =
  | 'Tài chính'
  | 'Nhân sự & Tiền lương'
  | 'Tài sản & IDC'
  | 'Kinh doanh & CRM'
  | 'Kế hoạch & OKR';

export const REPORT_SOURCE_CONFIG: Record<ReportSourceType, {
  scope: string;
  label: string;
  dateField: string;
  fields: string[];
}> = {
  'Tài chính': {
    scope: 'finance_general_ledger',
    label: 'Sổ Cái',
    dateField: 'entryDate',
    fields: ['voucherCode', 'entryDate', 'description', 'debitAccount', 'creditAccount', 'amount', 'status', 'sourceReference', 'sourceModule'],
  },
  'Nhân sự & Tiền lương': {
    scope: 'employees',
    label: 'Hồ sơ nhân viên',
    dateField: 'joinDate',
    fields: ['employeeCode', 'name', 'department', 'position', 'status', 'joinDate', 'isActive', 'activationStatus'],
  },
  'Tài sản & IDC': {
    scope: 'asset_items',
    label: 'Danh mục tài sản',
    dateField: 'purchaseDate',
    fields: ['code', 'name', 'category', 'model', 'purchaseDate', 'originalPrice', 'netBookValue', 'location', 'department', 'status', 'warrantyExpiry'],
  },
  'Kinh doanh & CRM': {
    scope: 'crm_contacts',
    label: 'Khách hàng, nhà cung cấp và đối tác',
    dateField: 'createdAt',
    fields: ['code', 'name', 'type', 'industry', 'creditLimit', 'totalValue', 'debtBalance', 'tier', 'accountManager', 'status', 'createdAt'],
  },
  'Kế hoạch & OKR': {
    scope: 'plan_items',
    label: 'Danh mục kế hoạch',
    dateField: 'startDate',
    fields: ['code', 'name', 'department', 'startDate', 'endDate', 'budget', 'manager', 'priority', 'status'],
  },
};

export const listReportPeriods = (today = new Date()) => {
  const year = today.getFullYear();
  const quarter = Math.floor(today.getMonth() / 3) + 1;
  const periods: { value: ReportPeriod; label: string }[] = [];
  for (let offset = 0; offset < 4; offset++) {
    const zeroBased = (quarter - 1) - offset;
    const periodYear = year + Math.floor(zeroBased / 4);
    const periodQuarter = ((zeroBased % 4) + 4) % 4 + 1;
    periods.push({
      value: `${periodYear}-Q${periodQuarter}` as ReportPeriod,
      label: `Quý ${periodQuarter} / ${periodYear}`,
    });
  }
  periods.push({ value: `${year}-ALL`, label: `Cả năm ${year}` });
  return periods;
};

export const reportPeriodLabel = (period: string): string => {
  const normalized = normalizeReportPeriod(period);
  const match = normalized && /^(\d{4})-Q([1-4])$/.exec(normalized);
  if (match) return `Quý ${match[2]} / ${match[1]}`;
  const yearMatch = normalized && /^(\d{4})-ALL$/.exec(normalized);
  return yearMatch ? `Cả năm ${yearMatch[1]}` : period;
};

export const normalizeReportPeriod = (period: string): ReportPeriod | null => {
  if (/^\d{4}-Q[1-4]$/.test(period) || /^\d{4}-ALL$/.test(period)) return period as ReportPeriod;
  const romanQuarter = /^(?:Quý\s*)?(IV|III|II|I|[1-4])\s*\/\s*(\d{4})$/i.exec(period.trim());
  if (romanQuarter) {
    const value = romanQuarter[1].toUpperCase();
    const quarter = ({ I: 1, II: 2, III: 3, IV: 4 } as Record<string, number>)[value] || Number(value);
    return `${romanQuarter[2]}-Q${quarter}` as ReportPeriod;
  }
  const year = /^(?:Cả năm\s+)?(\d{4})$/i.exec(period.trim());
  if (year) return `${year[1]}-ALL` as ReportPeriod;
  return null;
};

const periodBounds = (period: string): { start: string; endExclusive: string } | null => {
  const normalized = normalizeReportPeriod(period);
  const quarterMatch = normalized && /^(\d{4})-Q([1-4])$/.exec(normalized);
  if (quarterMatch) {
    const year = Number(quarterMatch[1]);
    const month = (Number(quarterMatch[2]) - 1) * 3;
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 3, 1));
    return { start: start.toISOString().slice(0, 10), endExclusive: end.toISOString().slice(0, 10) };
  }
  const yearMatch = normalized && /^(\d{4})-ALL$/.exec(normalized);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    return { start: `${year}-01-01`, endExclusive: `${year + 1}-01-01` };
  }
  return null;
};

export const selectReportPeriodRows = <T extends Record<string, any>>(
  records: T[],
  period: string,
  dateField: string,
): { rows: T[]; missingDateCount: number } => {
  const bounds = periodBounds(period);
  if (!bounds) throw new Error('Kỳ báo cáo không hợp lệ.');
  let missingDateCount = 0;
  const rows = records.filter((record) => {
    const date = String(record?.[dateField] ?? '').slice(0, 10);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      missingDateCount++;
      return false;
    }
    return date >= bounds.start && date < bounds.endExclusive;
  });
  return { rows, missingDateCount };
};

export const reportXlsxRows = (records: Record<string, any>[], fields: string[]): Array<Array<string | number | boolean | null>> => {
  const availableFields = fields.filter((field) => records.some((record) => Object.prototype.hasOwnProperty.call(record, field)));
  const columns = availableFields.length ? availableFields : fields;
  return [
    columns,
    ...records.map((record) => columns.map((field) => {
      const value = record[field];
      if (value === null || value === undefined) return null;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
      return JSON.stringify(value);
    })),
  ];
};

export const summarizeReportRows = (records: Record<string, any>[], dateField: string, missingDateCount: number) => {
  const statusCounts = new Map<string, number>();
  for (const record of records) {
    const status = String(record.status || '').trim();
    if (status) statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
  }
  const statusMetrics = [...statusCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'))
    .slice(0, 3)
    .map(([label, count]) => ({ label: `Trạng thái: ${label}`, value: String(count) }));
  return {
    summary: `${records.length} hồ sơ có ngày ${dateField} nằm trong kỳ. ${missingDateCount} hồ sơ thiếu hoặc sai ngày nên không được tính vào kỳ.`,
    metrics: [
      { label: 'Hồ sơ trong kỳ', value: String(records.length) },
      { label: 'Thiếu ngày hợp lệ', value: String(missingDateCount) },
      ...statusMetrics,
    ],
  };
};
