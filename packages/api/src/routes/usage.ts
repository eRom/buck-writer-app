import { Hono } from 'hono';
import { sql, eq, and, gte, lt } from 'drizzle-orm';
import { getBillingPeriod } from '@buck/shared';
import type { DbHandles } from '../db/client.js';
import { usageEvents, alertTriggers } from '../db/schema.js';
import { getOrCreateSettings } from '../services/user-settings.js';

function sumByKind(
  db: DbHandles,
  userId: string,
  periodStart: number,
  periodEnd: number,
  kind: string,
): number {
  const result = db.db
    .select({ total: sql<number>`COALESCE(SUM(${usageEvents.costUsd}), 0)` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        eq(usageEvents.kind, kind),
        gte(usageEvents.createdAt, periodStart),
        lt(usageEvents.createdAt, periodEnd),
      ),
    )
    .get();
  return result?.total ?? 0;
}

export interface UsageRouteDeps {
  db: DbHandles;
  nowMs?: () => number;
}

export function createUsageRoutes(
  deps: UsageRouteDeps,
): Hono<{ Variables: { userId: string } }> {
  const app = new Hono<{ Variables: { userId: string } }>();

  // GET /current — returns usage summary for the current billing period
  app.get('/current', (c) => {
    const userId = c.get('userId');
    const now = deps.nowMs ? deps.nowMs() : Date.now();

    const settings = getOrCreateSettings(deps.db, userId);
    const period = getBillingPeriod(settings.billingResetDay, now);

    const result = deps.db.db
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

    const totalUsd = Math.round((result?.total ?? 0) * 100) / 100;
    const limitUsd = settings.monthlyCostLimitUsd;
    const percent = limitUsd > 0 ? Math.round((totalUsd / limitUsd) * 100) : 0;

    const yearMonth = new Date(period.periodStart).toISOString().slice(0, 7);

    const thresholds = JSON.parse(settings.alertThresholdsJson) as number[];

    const triggered = deps.db.db
      .select()
      .from(alertTriggers)
      .where(
        and(
          eq(alertTriggers.userId, userId),
          eq(alertTriggers.yearMonth, yearMonth),
        ),
      )
      .all();

    const triggeredMap = new Map(
      triggered.map((t) => [t.thresholdPercent, t.triggeredAt]),
    );

    const alerts = thresholds.map((pct) => ({
      percent: pct,
      triggeredAt: triggeredMap.get(pct) ?? null,
    }));

    const chatUsd = Math.round(sumByKind(deps.db, userId, period.periodStart, period.periodEnd, 'chat') * 100) / 100;
    const realtimeUsd = Math.round(sumByKind(deps.db, userId, period.periodStart, period.periodEnd, 'realtime') * 100) / 100;

    return c.json({
      totalUsd,
      limitUsd,
      percent,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      daysRemaining: period.daysRemaining,
      resetDay: settings.billingResetDay,
      alerts,
      byKind: { chat: chatUsd, realtime: realtimeUsd },
    });
  });

  return app;
}
