import type { FinancePurchaseRequest } from '../../api/endpoints';

export const PURCHASE_REQUEST_STATUSES: FinancePurchaseRequest['status'][] = [
  'Chờ xác định nhà cung cấp',
  'Đã xác định nhà cung cấp',
];

export type PurchaseRequestFilters = {
  query?: string;
  year?: string;
  status?: string;
};

export function filterPurchaseRequests(records: FinancePurchaseRequest[], filters: PurchaseRequestFilters = {}) {
  const query = String(filters.query || '').trim().toLocaleLowerCase();
  return records.filter((record) => {
    if (filters.year && filters.year !== 'all' && !record.requestDate.startsWith(`${filters.year}-`)) return false;
    if (filters.status && filters.status !== 'all' && record.status !== filters.status) return false;
    if (!query) return true;
    const searchable = [
      record.requestNumber,
      record.departmentName,
      record.requester,
      record.deliveryDeadline,
      record.purpose,
      record.status,
      record.supplierName,
      ...record.items.map((item) => item.itemName),
    ].join(' ').toLocaleLowerCase();
    return searchable.includes(query);
  });
}

export type PurchaseRequestAggregate = {
  itemName: string;
  unit: string;
  quantity: number;
  estimatedTotal: number;
  requestCount: number;
};

export function aggregatePendingPurchaseItems(records: FinancePurchaseRequest[]): PurchaseRequestAggregate[] {
  const items = new Map<string, PurchaseRequestAggregate>();
  for (const record of records) {
    if (record.status !== 'Chờ xác định nhà cung cấp') continue;
    const seenInRequest = new Set<string>();
    for (const line of record.items || []) {
      const itemName = String(line.itemName || '').trim();
      const unit = String(line.unit || '').trim();
      const key = `${itemName.toLocaleLowerCase()}\u0000${unit.toLocaleLowerCase()}`;
      if (!itemName || !unit) continue;
      const aggregate = items.get(key) || { itemName, unit, quantity: 0, estimatedTotal: 0, requestCount: 0 };
      aggregate.quantity += Number(line.quantity) || 0;
      aggregate.estimatedTotal += Number(line.lineTotal) || 0;
      if (!seenInRequest.has(key)) aggregate.requestCount += 1;
      seenInRequest.add(key);
      items.set(key, aggregate);
    }
  }
  return [...items.values()].sort((left, right) => left.itemName.localeCompare(right.itemName, 'vi'));
}
