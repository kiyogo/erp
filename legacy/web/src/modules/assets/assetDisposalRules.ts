const ASSET_DISPOSAL_METHODS = [
  'Bán đấu giá nội bộ CBNV',
  'Bán thanh lý cho đơn vị thu mua ngoài',
  'Tiêu hủy an toàn (Data Wiping / Shredding)',
  'Tặng / Quyên góp từ thiện',
  'Báo mất / Thất lạc do rủi ro',
] as const;

export function disposalMoney(value: unknown, label: string): number {
  const amount = Number(value);
  if (value == null || String(value).trim() === '' || !Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(`${label} phải là số nguyên không âm.`);
  }
  return amount;
}

export function assetDisposalSnapshot(asset: Record<string, any>) {
  if (!asset?.key || !asset.code || !['Đang sử dụng', 'Trong kho', 'Chờ thanh lý'].includes(asset.status)) {
    throw new Error('Chọn một tài sản đang sử dụng, trong kho hoặc đã được đưa vào diện chờ thanh lý.');
  }
  const originalCost = disposalMoney(asset.originalPrice, 'Nguyên giá');
  const accumulatedDepreciation = disposalMoney(asset.accumulatedDepreciation ?? 0, 'Khấu hao lũy kế');
  if (accumulatedDepreciation > originalCost) throw new Error('Khấu hao lũy kế không được vượt nguyên giá.');
  return {
    assetKey: String(asset.key),
    assetCode: String(asset.code),
    assetName: String(asset.name || '').trim(),
    category: String(asset.category || '').trim(),
    serialNo: String(asset.model || '').trim(),
    sourceAssetStatus: String(asset.status),
    originalCost,
    accumulatedDepreciation,
    netBookValue: originalCost - accumulatedDepreciation,
  };
}

export function calculateDisposalResult(originalCost: unknown, accumulatedDepreciation: unknown, actualPrice: unknown, disposalCost: unknown) {
  const original = disposalMoney(originalCost, 'Nguyên giá');
  const accumulated = disposalMoney(accumulatedDepreciation, 'Khấu hao lũy kế');
  const proceeds = disposalMoney(actualPrice, 'Số tiền thu về');
  const costs = disposalMoney(disposalCost, 'Chi phí xử lý');
  if (accumulated > original) throw new Error('Khấu hao lũy kế không được vượt nguyên giá.');
  const netBookValue = original - accumulated;
  return { originalCost: original, accumulatedDepreciation: accumulated, netBookValue, actualDisposalPrice: proceeds, disposalCost: costs, netGainLoss: proceeds - costs - netBookValue };
}

export function assetDisposalOutcome(method: string): 'Đã thanh lý & Hoàn tất sổ sách' | 'Đã tiêu hủy an toàn' | 'Đã xử lý mất' {
  if (!(ASSET_DISPOSAL_METHODS as readonly string[]).includes(method)) throw new Error('Hình thức xử lý không hợp lệ.');
  if (method.startsWith('Tiêu hủy')) return 'Đã tiêu hủy an toàn';
  if (method.startsWith('Báo mất')) return 'Đã xử lý mất';
  return 'Đã thanh lý & Hoàn tất sổ sách';
}

export function assetDisposalMethodLabel(method: string): string {
  if (method === 'Bán đấu giá nội bộ CBNV') return 'Đấu giá CBNV';
  if (method === 'Bán thanh lý cho đơn vị thu mua ngoài') return 'Bán thanh lý ngoài';
  if (method.startsWith('Tiêu hủy')) return 'Tiêu hủy';
  if (method.startsWith('Tặng')) return 'Tặng / Quyên góp';
  if (method.startsWith('Báo mất')) return 'Báo mất';
  return method;
}

export function disposalNeedsDataWipe(category: string, method: string): boolean {
  if (method.startsWith('Báo mất')) return false;
  return method.startsWith('Tiêu hủy') || ['Thiết bị IT', 'Máy chủ & Hạ tầng IDC'].includes(category);
}
