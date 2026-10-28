export function getEligibleDepreciationAssets(assets: any[], depreciationItems: any[]) {
  const registeredKeys = new Set(depreciationItems.map((item) => String(item.assetKey || '').trim()).filter(Boolean));
  const registeredCodes = new Set(depreciationItems.map((item) => String(item.assetCode || '').trim().toLocaleLowerCase()).filter(Boolean));
  return assets.filter((asset) => {
    const key = String(asset.key || asset.id || '').trim();
    const code = String(asset.code || asset.assetCode || '').trim();
    const cost = Number(asset.originalPrice);
    const accumulated = Number(asset.accumulatedDepreciation || 0);
    const bookValue = asset.netBookValue === undefined || asset.netBookValue === null || asset.netBookValue === ''
      ? undefined
      : Number(asset.netBookValue);
    const life = Number(asset.depreciationMonths);
    return key && code && ['Đang sử dụng', 'Trong kho'].includes(asset.status)
      && Number.isSafeInteger(cost) && cost > 0
      && Number.isSafeInteger(accumulated) && accumulated >= 0 && accumulated <= cost
      && (accumulated === 0 || (Number.isSafeInteger(bookValue) && bookValue === cost - accumulated))
      && Number.isSafeInteger(life) && life > 0 && life <= 120
      && !registeredKeys.has(key) && !registeredCodes.has(code.toLocaleLowerCase());
  });
}
