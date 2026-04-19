import { Hono } from 'hono';
import {
  newId,
  isRealtimeVoice,
  DEFAULT_VOICE,
  normalizeTurnDetection,
  REALTIME_MODEL,
  costOfRealtime,
} from '@buck/shared';
import { eq, and, isNull, desc } from 'drizzle-orm';
import type { DbHandles } from '../db/client.js';
import type { PromptsRef } from '../services/prompts.js';
import type { UsageTracker } from '../services/realtime/usage-tracker.js';
import { buildSessionConfig } from '../services/realtime/session-config.js';
import { buildSessionSnapshot } from '../services/realtime/snapshot.js';
import { buildMcpConnectorTools } from '../services/mcp-registry.js';
import { getMonthlyCostUsd } from '../services/billing/monthly-cost.js';
import { getOrCreateSettings } from '../services/user-settings.js';
import {
  mintRealtimeClientSecret,
  type MintedSecret,
} from '../lib/realtime.js';
import { chatSessions, messages, usageEvents } from '../db/schema.js';

export interface RealtimeRouteDeps {
  db: DbHandles;
  openaiApiKey: string;
  prompts: PromptsRef;
  usageTracker: UsageTracker;
  nowMs?: () => number;
  featureFlag?: boolean;
  mintFn?: typeof mintRealtimeClientSecret;
}

// Helper: parse contentJson into string
function parseContent(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'string') return parsed;
    if (Array.isArray(parsed)) {
      return parsed
        .map((p: unknown) => {
          if (typeof p === 'object' && p !== null && 'text' in p) {
            return String((p as { text: unknown }).text);
          }
          return '';
        })
        .filter(Boolean)
        .join(' ');
    }
    return '';
  } catch {
    return raw;
  }
}

// Helper: persist a realtime usage event to DB
function persistUsage(
  db: DbHandles,
  opts: {
    userId: string;
    sessionId: string | null;
    tracked: {
      audioInputTokens: number;
      audioOutputTokens: number;
      textInputTokens: number;
      textOutputTokens: number;
      cachedInputTokens: number;
      audioInputSeconds: number;
      audioOutputSeconds: number;
    };
    costUsd: number;
    now: number;
  },
): void {
  db.db
    .insert(usageEvents)
    .values({
      id: newId(),
      userId: opts.userId,
      sessionId: opts.sessionId,
      createdAt: opts.now,
      model: REALTIME_MODEL,
      inputTokens: opts.tracked.textInputTokens,
      outputTokens: opts.tracked.textOutputTokens,
      reasoningTokens: 0,
      cachedInputTokens: opts.tracked.cachedInputTokens,
      audioInputSeconds: opts.tracked.audioInputSeconds,
      audioOutputSeconds: opts.tracked.audioOutputSeconds,
      costUsd: opts.costUsd,
      kind: 'realtime',
    })
    .run();
}

export function createRealtimeRoute(
  deps: RealtimeRouteDeps,
): Hono<{ Variables: { userId: string } }> {
  const app = new Hono<{ Variables: { userId: string } }>();
  const getNow = deps.nowMs ?? Date.now;
  const mint = deps.mintFn ?? mintRealtimeClientSecret;

  // POST /session — mint a realtime client secret + build sessionConfig
  app.post('/session', async (c) => {
    if (!deps.featureFlag) {
      return c.json({ error: { code: 'not_enabled', message: 'Realtime is not enabled' } }, 404);
    }

    const userId = c.get('userId');
    const body = await c.req.json().catch(() => ({})) as {
      sessionId?: unknown;
      voice?: unknown;
      turnDetection?: unknown;
      tools?: { bible?: boolean; writingTools?: boolean; webSearch?: boolean };
    };

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
    if (!sessionId) {
      return c.json({ error: { code: 'missing_session_id', message: 'sessionId required' } }, 400);
    }

    // Verify chat session belongs to user
    const session = deps.db.db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.id, sessionId),
          eq(chatSessions.userId, userId),
          isNull(chatSessions.deletedAt),
        ),
      )
      .get();
    if (!session) {
      return c.json({ error: { code: 'not_found', message: 'session not found' } }, 404);
    }

    // Budget check
    const now = getNow();
    const settings = getOrCreateSettings(deps.db, userId);
    if (settings.hardStop === 1) {
      const monthlyCost = getMonthlyCostUsd(deps.db, userId, now);
      if (monthlyCost >= settings.monthlyCostLimitUsd) {
        return c.json({ error: { code: 'budget_exceeded', message: 'Monthly budget exceeded' } }, 429);
      }
    }

    // Snapshot: last 20 messages
    const rawMessages = deps.db.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(desc(messages.createdAt))
      .limit(20)
      .all();
    const snapshot = rawMessages
      .reverse()
      .map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: parseContent(m.contentJson),
      }));

    // MCP tools
    const mcpTools = buildMcpConnectorTools(deps.db);

    // Build session config
    const voice = isRealtimeVoice(body.voice) ? body.voice : DEFAULT_VOICE;
    const turnDetection = normalizeTurnDetection(
      (body.turnDetection as Partial<Parameters<typeof normalizeTurnDetection>[0]>) ?? {},
    );
    const tools = {
      bible: body.tools?.bible ?? true,
      writingTools: body.tools?.writingTools ?? true,
      webSearch: body.tools?.webSearch ?? true,
    };
    const systemPrompt = `${deps.prompts.current.system}\n\n${deps.prompts.current.rules}`;
    const livePrompt = deps.prompts.current.live;
    const sessionSnapshot = buildSessionSnapshot(snapshot, { maxMessages: 20 });

    const sessionConfig = buildSessionConfig({
      voice,
      turnDetection,
      tools,
      mcpTools,
      systemPrompt,
      livePrompt,
      sessionSnapshot,
    });

    // Mint client secret
    const minted: MintedSecret = await mint({
      apiKey: deps.openaiApiKey,
      session: {
        type: 'realtime',
        model: REALTIME_MODEL,
        voice,
        instructions: sessionConfig.session.instructions.slice(0, 2000),
      },
    });

    return c.json({
      clientSecret: minted,
      realtimeModel: REALTIME_MODEL,
      sessionConfig,
    });
  });

  // POST /usage — update monotone usage for an ongoing realtime session
  app.post('/usage', async (c) => {
    if (!deps.featureFlag) {
      return c.json({ error: { code: 'not_enabled', message: 'Realtime is not enabled' } }, 404);
    }

    const userId = c.get('userId');
    const body = await c.req.json().catch(() => ({})) as {
      sessionId?: string;
      realtimeSessionId?: string;
      audioInputTokens?: number;
      audioOutputTokens?: number;
      textInputTokens?: number;
      textOutputTokens?: number;
      cachedInputTokens?: number;
      audioInputSeconds?: number;
      audioOutputSeconds?: number;
    };

    const realtimeSessionId = body.realtimeSessionId ?? '';

    let tracked;
    try {
      tracked = deps.usageTracker.update(realtimeSessionId, {
        audioInputTokens: body.audioInputTokens ?? 0,
        audioOutputTokens: body.audioOutputTokens ?? 0,
        textInputTokens: body.textInputTokens ?? 0,
        textOutputTokens: body.textOutputTokens ?? 0,
        cachedInputTokens: body.cachedInputTokens ?? 0,
        audioInputSeconds: body.audioInputSeconds ?? 0,
        audioOutputSeconds: body.audioOutputSeconds ?? 0,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('non-monotonic')) {
        return c.json({ error: { code: 'non_monotonic', message: msg } }, 400);
      }
      throw err;
    }

    const now = getNow();
    const cost = costOfRealtime(tracked);
    const settings = getOrCreateSettings(deps.db, userId);

    if (settings.hardStop === 1) {
      const monthlyCost = getMonthlyCostUsd(deps.db, userId, now);
      if (monthlyCost + cost >= settings.monthlyCostLimitUsd) {
        deps.usageTracker.drop(realtimeSessionId);
        persistUsage(deps.db, {
          userId,
          sessionId: body.sessionId ?? null,
          tracked,
          costUsd: cost,
          now,
        });
        return c.json({ error: { code: 'budget_exceeded', message: 'Monthly budget exceeded' } }, 429);
      }
    }

    const monthlyCost = getMonthlyCostUsd(deps.db, userId, now);
    const budgetRemaining = Math.max(0, settings.monthlyCostLimitUsd - monthlyCost - cost);

    return c.json({ costUsd: cost, budgetRemaining });
  });

  // POST /transcript — idempotent voice transcript insertion
  app.post('/transcript', async (c) => {
    if (!deps.featureFlag) {
      return c.json({ error: { code: 'not_enabled', message: 'Realtime is not enabled' } }, 404);
    }

    const userId = c.get('userId');
    const body = await c.req.json().catch(() => ({})) as {
      sessionId?: string;
      items?: Array<{
        role?: string;
        text?: string;
        startedAt?: number;
        endedAt?: number;
        source?: string;
      }>;
    };

    const sessionId = body.sessionId ?? '';
    const items = body.items ?? [];

    // Verify session ownership
    const session = deps.db.db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.id, sessionId),
          eq(chatSessions.userId, userId),
          isNull(chatSessions.deletedAt),
        ),
      )
      .get();
    if (!session) {
      return c.json({ error: { code: 'not_found', message: 'session not found' } }, 404);
    }

    let inserted = 0;
    for (const item of items) {
      const { role = 'user', text = '', startedAt = Date.now() } = item;
      const toolMeta = `voice:${startedAt}:${role}`;

      // Idempotence: skip if already present
      const existing = deps.db.db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.sessionId, sessionId),
            eq(messages.toolMeta, toolMeta),
          ),
        )
        .get();
      if (existing) continue;

      deps.db.db
        .insert(messages)
        .values({
          id: newId(),
          sessionId,
          role,
          contentJson: JSON.stringify(text),
          model: REALTIME_MODEL,
          toolMeta,
          source: 'voice',
          createdAt: startedAt,
        })
        .run();
      inserted++;
    }

    return c.json({ inserted });
  });

  // POST /write-to-chat — persist a voice-injected assistant message
  app.post('/write-to-chat', async (c) => {
    const userId = c.get('userId');
    const body = (await c.req.json().catch(() => ({}))) as {
      sessionId?: string;
      content?: string;
    };
    const sessionId = String(body.sessionId ?? '');
    const content = String(body.content ?? '').trim();
    if (!sessionId || !content) {
      return c.json({ error: { code: 'invalid' } }, 400);
    }

    const session = deps.db.db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
      .get();
    if (!session) return c.json({ error: { code: 'not_found' } }, 404);

    const id = newId();
    const createdAt = getNow();
    deps.db.db
      .insert(messages)
      .values({
        id,
        sessionId,
        role: 'assistant',
        contentJson: JSON.stringify(content),
        model: REALTIME_MODEL,
        source: 'voice-injected',
        createdAt,
      })
      .run();

    return c.json({ id, createdAt });
  });

  // DELETE /session/:id — flush usage on session close
  app.delete('/session/:id', async (c) => {
    if (!deps.featureFlag) {
      return c.json({ error: { code: 'not_enabled', message: 'Realtime is not enabled' } }, 404);
    }

    const userId = c.get('userId');
    const realtimeSessionId = c.req.param('id');
    const sessionId = c.req.query('sessionId') ?? null;

    const tracked = deps.usageTracker.drop(realtimeSessionId);
    if (!tracked) {
      return c.json({ closed: true, costUsd: 0 });
    }

    const cost = costOfRealtime(tracked);
    const now = getNow();

    if (sessionId) {
      persistUsage(deps.db, {
        userId,
        sessionId,
        tracked,
        costUsd: cost,
        now,
      });
    }

    return c.json({ closed: true, costUsd: cost });
  });

  return app;
}
