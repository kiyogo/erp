export type WarehouseLocation = {
  key: string;
  warehouse: string;
  code: string;
  zone?: string;
  shelf?: string;
  capacityItems: number;
  pickOrder: number;
  status: 'Đang hoạt động' | 'Tạm ngưng';
};

export type WarehouseStorageAssignment = { warehouse: string; locationCode: string };

export type WarehouseLayoutItem = {
  key: string;
  sku: string;
  name: string;
  unit: string;
  warehouse: string;
  storageLocation?: string;
  storageAssignments?: WarehouseStorageAssignment[];
  stockQty: number;
  stockByWarehouse?: Array<{ warehouse: string; quantity: number }>;
};

export type WarehouseMovement = {
  type: string;
  transactionDate: string;
  lines: Array<{
    itemKey: string;
    quantity?: number;
    direction?: string;
    difference?: number;
    warehouse?: string;
  }>;
};

export type WarehouseStock<T extends WarehouseLayoutItem = WarehouseLayoutItem> = {
  item: T;
  warehouse: string;
  quantity: number;
  locationCode: string;
  pickCount: number;
  pickedQuantity: number;
};

export type WarehouseLocationSummary<T extends WarehouseLayoutItem = WarehouseLayoutItem> = WarehouseLocation & {
  items: WarehouseStock<T>[];
  occupiedItems: number;
  remainingSlots: number;
  occupancyPercent: number;
  quantity: number;
};

export type WarehousePlacementSuggestion<T extends WarehouseLayoutItem = WarehouseLayoutItem> = {
  item: T;
  warehouse: string;
  quantity: number;
  currentLocation: string;
  recommendedLocation: string;
  pickCount: number;
  pickedQuantity: number;
};

export type WarehouseLayout<T extends WarehouseLayoutItem = WarehouseLayoutItem> = {
  locations: WarehouseLocationSummary<T>[];
  unlocatedItems: WarehouseStock<T>[];
  suggestions: WarehousePlacementSuggestion<T>[];
  itemsWithoutCapacity: WarehouseStock<T>[];
  totalSlots: number;
  occupiedSlots: number;
};

function normalized(value: unknown): string {
  return String(value || '').trim().toLocaleUpperCase('vi-VN');
}

function quantityInWarehouse(item: WarehouseLayoutItem, warehouse: string): number {
  if (Array.isArray(item.stockByWarehouse) && item.stockByWarehouse.length) {
    return Math.max(0, Number(item.stockByWarehouse.find(entry => normalized(entry.warehouse) === normalized(warehouse))?.quantity) || 0);
  }
  return normalized(item.warehouse) === normalized(warehouse) ? Math.max(0, Number(item.stockQty) || 0) : 0;
}

function locationFor(item: WarehouseLayoutItem, warehouse: string): string {
  const assignment = item.storageAssignments?.find(entry => normalized(entry.warehouse) === normalized(warehouse));
  if (assignment) return String(assignment.locationCode || '').trim();
  return normalized(item.warehouse) === normalized(warehouse) ? String(item.storageLocation || '').trim() : '';
}

function movementCutoff(asOfDate: string): string {
  const [year, month, day] = asOfDate.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  date.setUTCDate(date.getUTCDate() - 365);
  return date.toISOString().slice(0, 10);
}

function movementIsOutbound(movement: WarehouseMovement, line: WarehouseMovement['lines'][number]): { count: boolean; quantity: number } {
  if (movement.type === 'Kiểm kê' && Number(line.difference || 0) < 0) return { count: true, quantity: Math.abs(Number(line.difference) || 0) };
  const outbound = ['Xuất kho', 'Giao hàng'].includes(movement.type)
    || movement.type === 'Lắp ráp' && line.direction === 'Thành phần'
    || movement.type === 'Tháo dỡ' && line.direction === 'Thành phẩm';
  return outbound ? { count: true, quantity: Math.max(0, Number(line.quantity) || 0) } : { count: false, quantity: 0 };
}

export function buildWarehouseLayout<T extends WarehouseLayoutItem>(
  locations: WarehouseLocation[],
  items: T[],
  movements: WarehouseMovement[],
  asOfDate: string,
): WarehouseLayout<T> {
  const stockRows: WarehouseStock<T>[] = [];
  const pickStats = new Map<string, { count: number; quantity: number }>();
  const cutoff = movementCutoff(asOfDate);
  if (cutoff) {
    for (const movement of movements) {
      const date = String(movement.transactionDate || '').slice(0, 10);
      if (date < cutoff || date > asOfDate.slice(0, 10)) continue;
      for (const line of movement.lines || []) {
        const outbound = movementIsOutbound(movement, line);
        if (!outbound.count) continue;
        const key = `${line.itemKey}\u0000${normalized(line.warehouse || '')}`;
        const current = pickStats.get(key) || { count: 0, quantity: 0 };
        current.count += 1;
        current.quantity += outbound.quantity;
        pickStats.set(key, current);
      }
    }
  }

  for (const item of items) {
    const warehouseQuantities = Array.isArray(item.stockByWarehouse) && item.stockByWarehouse.length
      ? item.stockByWarehouse
      : [{ warehouse: item.warehouse || 'Kho chính', quantity: item.stockQty }];
    for (const stock of warehouseQuantities) {
      const warehouse = String(stock.warehouse || '').trim();
      const quantity = Math.max(0, Number(stock.quantity) || 0);
      if (!warehouse || quantity <= 0) continue;
      const stats = pickStats.get(`${item.key}\u0000${normalized(warehouse)}`) || { count: 0, quantity: 0 };
      stockRows.push({ item, warehouse, quantity, locationCode: locationFor(item, warehouse), pickCount: stats.count, pickedQuantity: stats.quantity });
    }
  }

  const summaries = locations.map(location => {
    const assigned = stockRows.filter(row => normalized(row.warehouse) === normalized(location.warehouse)
      && normalized(row.locationCode) === normalized(location.code));
    const capacityItems = Math.max(0, Math.floor(Number(location.capacityItems) || 0));
    return {
      ...location,
      items: assigned,
      occupiedItems: assigned.length,
      remainingSlots: Math.max(0, capacityItems - assigned.length),
      occupancyPercent: capacityItems ? Math.round(assigned.length / capacityItems * 100) : 0,
      quantity: assigned.reduce((sum, row) => sum + row.quantity, 0),
    };
  });
  const unlocatedItems = stockRows.filter(row => !row.locationCode
    || !locations.some(location => normalized(location.warehouse) === normalized(row.warehouse)
      && normalized(location.code) === normalized(row.locationCode)));

  const activeLocations = summaries.filter(location => location.status === 'Đang hoạt động')
    .sort((left, right) => left.pickOrder - right.pickOrder || left.code.localeCompare(right.code, 'vi'));
  const byWarehouse = new Map<string, WarehouseStock<T>[]>();
  for (const row of stockRows) {
    const rows = byWarehouse.get(normalized(row.warehouse)) || [];
    rows.push(row);
    byWarehouse.set(normalized(row.warehouse), rows);
  }
  const suggestions: WarehousePlacementSuggestion<T>[] = [];
  const itemsWithoutCapacity: WarehouseStock<T>[] = [];
  for (const [normalizedWarehouse, warehouseRows] of byWarehouse) {
    const warehouseLocations = activeLocations.filter(location => normalized(location.warehouse) === normalizedWarehouse);
    const sortedItems = [...warehouseRows].sort((left, right) => right.pickCount - left.pickCount
      || right.pickedQuantity - left.pickedQuantity
      || left.item.sku.localeCompare(right.item.sku, 'vi'));
    let locationIndex = 0;
    let occupied = 0;
    for (const row of sortedItems) {
      while (locationIndex < warehouseLocations.length && occupied >= warehouseLocations[locationIndex].capacityItems) {
        locationIndex += 1;
        occupied = 0;
      }
      const destination = warehouseLocations[locationIndex];
      if (!destination) {
        itemsWithoutCapacity.push(row);
        continue;
      }
      occupied += 1;
      if (normalized(row.locationCode) !== normalized(destination.code)) {
        suggestions.push({
          item: row.item,
          warehouse: row.warehouse,
          quantity: row.quantity,
          currentLocation: row.locationCode,
          recommendedLocation: destination.code,
          pickCount: row.pickCount,
          pickedQuantity: row.pickedQuantity,
        });
      }
    }
  }

  return {
    locations: summaries,
    unlocatedItems,
    suggestions: suggestions.sort((left, right) => right.pickCount - left.pickCount
      || right.pickedQuantity - left.pickedQuantity
      || left.item.sku.localeCompare(right.item.sku, 'vi')),
    itemsWithoutCapacity,
    totalSlots: summaries.filter(location => location.status === 'Đang hoạt động')
      .reduce((sum, location) => sum + Math.max(0, Number(location.capacityItems) || 0), 0),
    occupiedSlots: summaries.filter(location => location.status === 'Đang hoạt động')
      .reduce((sum, location) => sum + location.occupiedItems, 0),
  };
}
