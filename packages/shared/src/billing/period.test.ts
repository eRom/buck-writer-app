import { describe, it, expect } from 'vitest';
import { getBillingPeriod } from './period.js';

describe('getBillingPeriod', () => {
  it('returns period starting on resetDay of current month when today >= resetDay', () => {
    const nowMs = new Date('2026-04-17T12:00:00Z').getTime();
    const result = getBillingPeriod(1, nowMs);
    expect(result.periodStart).toBe(new Date('2026-04-01T00:00:00Z').getTime());
    expect(result.periodEnd).toBe(new Date('2026-05-01T00:00:00Z').getTime());
  });

  it('returns period starting on resetDay of previous month when today < resetDay', () => {
    const nowMs = new Date('2026-04-05T12:00:00Z').getTime();
    const result = getBillingPeriod(15, nowMs);
    expect(result.periodStart).toBe(new Date('2026-03-15T00:00:00Z').getTime());
    expect(result.periodEnd).toBe(new Date('2026-04-15T00:00:00Z').getTime());
  });

  it('handles resetDay=28 in February', () => {
    const nowMs = new Date('2026-03-10T12:00:00Z').getTime();
    const result = getBillingPeriod(28, nowMs);
    expect(result.periodStart).toBe(new Date('2026-02-28T00:00:00Z').getTime());
    expect(result.periodEnd).toBe(new Date('2026-03-28T00:00:00Z').getTime());
  });

  it('computes daysRemaining correctly', () => {
    const nowMs = new Date('2026-04-17T12:00:00Z').getTime();
    const result = getBillingPeriod(1, nowMs);
    expect(result.daysRemaining).toBe(14);
  });
});
