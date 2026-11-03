export function getFiscalQuarterDates(period, startMonth = 1, startDay = 1) {
  const match = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!match || !Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12 || !Number.isInteger(startDay) || startDay < 1 || startDay > 31) return null;

  const fiscalYear = Number(match[1]);
  const quarter = Number(match[2]);
  const quarterBoundary = (offset) => {
    const monthIndex = startMonth - 1 + offset;
    const year = fiscalYear + Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    const finalDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(startDay, finalDay)));
  };
  const start = quarterBoundary((quarter - 1) * 3);
  const endExclusive = quarterBoundary(quarter * 3);
  const end = new Date(endExclusive.getTime() - 86_400_000);
  const toIso = (value) => value.toISOString().slice(0, 10);

  return {
    year: String(fiscalYear),
    quarter: String(quarter),
    startDate: toIso(start),
    endDate: toIso(end),
    endExclusive: toIso(endExclusive),
  };
}
