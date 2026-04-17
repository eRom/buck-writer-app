import { Hono } from 'hono';
import { sql, eq, and, gte } from 'drizzle-orm';
import { getBillingPeriod } from '@buck/shared';
import type { DbHandles } from '../db/client.js';
import { usageEvents, userSettings, alertTriggers } from '../db/schema.js';

export interface UsageRouteDeps {
  db: DbHandles;
  nowMs?: () => number;
}

function getOrCreateSettings(
  db: DbHandles,
  userId: string,
): typeof userSettings.$inferSelect {
  const existing = db.db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (existing) return existing;

  db.db.insert(userSettings).values({ userId }).run();

  const created = db.db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!created) throw new Error('Failed to create user settings');
  return created;
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

    return c.json({
      totalUsd,
      limitUsd,
      percent,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      daysRemaining: period.daysRemaining,
      resetDay: settings.billingResetDay,
      alerts,
    });
  });

  return app;
}
