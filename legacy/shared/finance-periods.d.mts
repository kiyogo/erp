export function getFiscalQuarterDates(
  period: string,
  startMonth?: number,
  startDay?: number,
): { year: string; quarter: string; startDate: string; endDate: string; endExclusive: string } | null;
