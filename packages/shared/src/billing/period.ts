export interface BillingPeriod {
  periodStart: number;
  periodEnd: number;
  daysRemaining: number;
}

export function getBillingPeriod(resetDay: number, nowMs: number): BillingPeriod {
  const now = new Date(nowMs);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();

  let startYear: number;
  let startMonth: number;

  if (day >= resetDay) {
    startYear = year;
    startMonth = month;
  } else {
    if (month === 0) {
      startYear = year - 1;
      startMonth = 11;
    } else {
      startYear = year;
      startMonth = month - 1;
    }
  }

  const daysInStartMonth = new Date(startYear, startMonth + 1, 0).getDate();
  const clampedStartDay = Math.min(resetDay, daysInStartMonth);
  const periodStart = Date.UTC(startYear, startMonth, clampedStartDay);

  let endMonth = startMonth + 1;
  let endYear = startYear;
  if (endMonth > 11) {
    endMonth = 0;
    endYear += 1;
  }
  const daysInEndMonth = new Date(endYear, endMonth + 1, 0).getDate();
  const clampedEndDay = Math.min(resetDay, daysInEndMonth);
  const periodEnd = Date.UTC(endYear, endMonth, clampedEndDay);

  const daysRemaining = Math.ceil((periodEnd - nowMs) / (1000 * 60 * 60 * 24));

  return { periodStart, periodEnd, daysRemaining };
}
