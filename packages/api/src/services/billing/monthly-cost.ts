import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { getBillingPeriod } from '@buck/shared';
import type { DbHandles } from '../../db/client.js';
import { usageEvents } from '../../db/schema.js';
import { getOrCreateSettings } from '../user-settings.js';

export function getMonthlyCostUsd(
  db: DbHandles,
  userId: string,
  nowMs: number,
): number {
  const settings = getOrCreateSettings(db, userId);
  const period = getBillingPeriod(settings.billingResetDay, nowMs);
  const result = db.db
    .select({ total: sql<number>`COALESCE(SUM(${usageEvents.costUsd}), 0)` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        gte(usageEvents.createdAt, period.periodStart),
        lt(usageEvents.createdAt, period.periodEnd),
      ),
    )
    .get();
  return result?.total ?? 0;
}
