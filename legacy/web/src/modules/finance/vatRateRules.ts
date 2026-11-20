// Thuế suất GTGT được chọn theo ngày lập hóa đơn. Giữ khớp với legacy/api/vatRules.mjs (căn cứ pháp lý ghi ở đó).
const REDUCED_8_PERCENT_PERIODS = [
  ['2022-02-01', '2022-12-31'],
  ['2023-07-01', '2023-12-31'],
  ['2024-01-01', '2024-06-30'],
  ['2024-07-01', '2024-12-31'],
  ['2025-01-01', '2025-06-30'],
  ['2025-07-01', '2026-12-31'],
] as const;

export function allowedVatRates(isoDate: string): number[] {
  const reduced = REDUCED_8_PERCENT_PERIODS.some(([from, to]) => isoDate >= from && isoDate <= to);
  return reduced ? [0, 5, 8, 10] : [0, 5, 10];
}

export const vatRateOptions = (isoDate: string) => allowedVatRates(isoDate).map(rate => ({ value: rate, label: `${rate}%` }));
