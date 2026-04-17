import type { Context, Next } from 'hono';
import { and, eq, gte, lt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getBillingPeriod } from '@buck/shared';
import type { DbHandles } from '../db/client.js';
import { usageEvents } from '../db/schema.js';
import { getOrCreateSettings } from '../services/user-settings.js';

export interface BudgetGuardDeps {
  db: DbHandles;
  nowMs?: () => number;
}

export function budgetGuard(deps: BudgetGuardDeps) {
  const now = deps.nowMs ?? Date.now;

  return async (c: Context<{ Variables: { userId: string } }>, next: Next) => {
    const userId = c.get('userId');
    const nowMs = now();

    const settings = getOrCreateSettings(deps.db, userId);

    // If hard stop disabled, pass through
    if (settings.hardStop === 0) {
      await next();
      return;
    }

    const period = getBillingPeriod(settings.billingResetDay, nowMs);

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

    const totalUsd = result?.total ?? 0;
    const limitUsd = settings.monthlyCostLimitUsd;

    if (totalUsd >= limitUsd) {
      return c.json(
        {
          error: {
            code: 'budget_exceeded',
            message: 'Monthly budget exceeded',
            usage: {
              totalUsd: Math.round(totalUsd * 100) / 100,
              limitUsd,
              resetDate: new Date(period.periodEnd).toISOString(),
            },
          },
        },
        429,
      );
    }

    await next();
  };
}
