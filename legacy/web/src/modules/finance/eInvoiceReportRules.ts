export interface EInvoiceReportRecord {
  issueDate?: string;
  status?: string;
  externalStatus?: string;
  buyerName?: string;
  buyerTaxCode?: string;
}

export interface EInvoiceReportFilters {
  period: string;
  status: string;
  externalStatus: string;
  buyerSearch: string;
}

export function filterEInvoiceReport<T extends EInvoiceReportRecord>(records: T[], filters: EInvoiceReportFilters): T[] {
  const buyerSearch = filters.buyerSearch.trim().toLocaleLowerCase('vi-VN');
  return records.filter(record =>
    (filters.period === 'all' || Boolean(record.issueDate?.startsWith(filters.period))) &&
    (filters.status === 'all' || record.status === filters.status) &&
    (filters.externalStatus === 'all' || (record.externalStatus || 'Chưa xác minh') === filters.externalStatus) &&
    (!buyerSearch || `${record.buyerName || ''} ${record.buyerTaxCode || ''}`.toLocaleLowerCase('vi-VN').includes(buyerSearch))
  );
}
