import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { UpdateSettingsInput } from '@buck/shared';
import type { DbHandles } from '../db/client.js';
import { userSettings } from '../db/schema.js';
import { getOrCreateSettings } from '../services/user-settings.js';

export interface SettingsRouteDeps {
  db: DbHandles;
}

type UserSettingsRow = typeof userSettings.$inferSelect;

function formatSettings(row: UserSettingsRow) {
  return {
    defaultModel: row.defaultModel,
    defaultReasoningEffort: row.defaultReasoningEffort,
    monthlyCostLimitUsd: row.monthlyCostLimitUsd,
    alertThresholds: JSON.parse(row.alertThresholdsJson) as number[],
    hardStop: row.hardStop === 1,
    billingResetDay: row.billingResetDay,
    realtimeDefaultVoice: row.realtimeDefaultVoice,
    realtimeTurnDetection: JSON.parse(row.realtimeTurnDetectionJson),
    realtimeSilenceTimeoutSec: row.realtimeSilenceTimeoutSec,
    realtimeTools: JSON.parse(row.realtimeToolsJson),
    chatTools: JSON.parse(row.chatToolsJson),
    vectorStoreId: row.vectorStoreId,
    vectorStoreLastSyncAt: row.vectorStoreLastSyncAt
      ? row.vectorStoreLastSyncAt.getTime()
      : null,
    ttsDefaultVoice: row.ttsDefaultVoice,
  };
}

export function createSettingsRoutes(
  deps: SettingsRouteDeps,
): Hono<{ Variables: { userId: string } }> {
  const app = new Hono<{ Variables: { userId: string } }>();

  // GET / — get user settings (upsert defaults if missing)
  app.get('/', (c) => {
    const userId = c.get('userId');
    const row = getOrCreateSettings(deps.db, userId);
    return c.json(formatSettings(row));
  });

  // PATCH / — update user settings
  app.patch('/', async (c) => {
    const userId = c.get('userId');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { error: { code: 'invalid_input', message: 'invalid JSON body' } },
        400,
      );
    }

    const parsed = UpdateSettingsInput.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'invalid_input',
            message: parsed.error.issues[0]?.message ?? 'invalid input',
          },
        },
        422,
      );
    }

    // Ensure row exists
    getOrCreateSettings(deps.db, userId);

    const data = parsed.data;
    const updates: Partial<UserSettingsRow> = {};

    if (data.monthlyCostLimitUsd !== undefined) {
      updates.monthlyCostLimitUsd = data.monthlyCostLimitUsd;
    }
    if (data.hardStop !== undefined) {
      updates.hardStop = data.hardStop ? 1 : 0;
    }
    if (data.billingResetDay !== undefined) {
      updates.billingResetDay = data.billingResetDay;
    }
    if (data.defaultModel !== undefined) {
      updates.defaultModel = data.defaultModel;
    }
    if (data.defaultReasoningEffort !== undefined) {
      updates.defaultReasoningEffort = data.defaultReasoningEffort;
    }
    if (data.realtimeDefaultVoice !== undefined) {
      updates.realtimeDefaultVoice = data.realtimeDefaultVoice;
    }
    if (data.realtimeTurnDetection !== undefined) {
      updates.realtimeTurnDetectionJson = JSON.stringify(data.realtimeTurnDetection);
    }
    if (data.realtimeSilenceTimeoutSec !== undefined) {
      updates.realtimeSilenceTimeoutSec = data.realtimeSilenceTimeoutSec;
    }
    if (data.realtimeTools !== undefined) {
      updates.realtimeToolsJson = JSON.stringify(data.realtimeTools);
    }
    if (data.chatTools !== undefined) {
      updates.chatToolsJson = JSON.stringify(data.chatTools);
    }
    if (data.ttsDefaultVoice !== undefined) {
      updates.ttsDefaultVoice = data.ttsDefaultVoice;
    }

    if (Object.keys(updates).length > 0) {
      deps.db.db
        .update(userSettings)
        .set(updates)
        .where(eq(userSettings.userId, userId))
        .run();
    }

    const updated = deps.db.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .get();

    if (!updated) {
      return c.json(
        { error: { code: 'internal', message: 'settings not found after update' } },
        500,
      );
    }

    return c.json(formatSettings(updated));
  });

  return app;
}
