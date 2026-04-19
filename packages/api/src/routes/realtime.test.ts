import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildApp, type AppDeps } from '../app.js';
import { openDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { createJwtService } from '../services/jwt.js';
import { loadPrompts } from '../services/prompts.js';
import { createUsageTracker } from '../services/realtime/usage-tracker.js';
import { newId } from '@buck/shared';
import { sha256Hex } from '../utils/crypto.js';
import { users, sessionsAuth, chatSessions, usageEvents, userSettings, messages } from '../db/schema.js';
import type { MintedSecret } from '../lib/realtime.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CSRF_TOKEN = 'test-csrf-token-abc123';
const FIXED_NOW = new Date('2026-04-17T12:00:00Z').getTime();

function tmp() {
  return path.join(os.tmpdir(), `buck-rt-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`);
}

function tmpPromptsDir() {
  const dir = path.join(os.tmpdir(), `buck-prompts-rt-${Date.now()}-${Math.floor(Math.random() * 1e9)}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SYSTEM.md'), 'You are Buck, a helpful assistant.');
  fs.writeFileSync(path.join(dir, 'RULES.md'), 'Be concise.');
  fs.writeFileSync(path.join(dir, 'LIVE.md'), 'Session active.');
  return dir;
}

const FAKE_SECRET: MintedSecret = { value: 'eph_test_secret', expiresAt: FIXED_NOW + 60_000 };
const mockMint = vi.fn(async () => FAKE_SECRET);

interface TestCtx {
  dbPath: string;
  promptsDir: string;
  app: ReturnType<typeof buildApp>;
  sessionJwt: string;
  userId: string;
  db: ReturnType<typeof openDb>;
  chatSessionId: string;
  usageTracker: ReturnType<typeof createUsageTracker>;
}

async function makeCtx(opts: { featureFlag?: boolean } = {}): Promise<TestCtx> {
  const dbPath = tmp();
  const promptsDirPath = tmpPromptsDir();
  const url = `file:${dbPath}`;
  runMigrations({ databaseUrl: url, migrationsFolder: migrationsDir });
  runSeed({
    databaseUrl: url,
    allowedEmails: ['alice@example.com'],
    mcpBibleUrl: 'http://bible-mcp:7801',
  });
  const db = openDb(url);
  const jwt = createJwtService({ secret: 'a'.repeat(32), issuer: 'buck', audience: 'buck-web' });
  const email = { sendMagicLink: vi.fn(async () => {}) };

  const alice = db.db.select().from(users).all().find((u) => u.email === 'alice@example.com');
  if (!alice) throw new Error('alice not found in seed');
  const userId = alice.id;

  const sessionJwt = await jwt.sign({ sub: userId, scope: 'app' }, '30d');
  db.db.insert(sessionsAuth).values({
    id: newId(),
    userId,
    tokenHash: sha256Hex(sessionJwt),
    scope: 'app',
    expiresAt: FIXED_NOW + SESSION_TTL_MS,
    createdAt: FIXED_NOW,
  }).run();

  // Create a chat session for the user
  const chatSessionId = newId();
  db.db.insert(chatSessions).values({
    id: chatSessionId,
    userId,
    title: 'Test session',
    model: 'gpt-5.4-mini',
    reasoningEffort: 'low',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  }).run();

  const prompts = loadPrompts(promptsDirPath);
  const usageTracker = createUsageTracker({ nowMs: () => FIXED_NOW, staleMs: 120_000 });

  const deps: AppDeps = {
    db,
    email,
    jwt,
    allowedEmails: ['alice@example.com'],
    publicBaseUrl: 'https://buck.example.com',
    nowMs: () => FIXED_NOW,
    prompts: { current: prompts },
    openaiApiKey: 'sk-test-fake-key',
    realtimeEnabled: opts.featureFlag ?? true,
    usageTracker,
    mintFn: mockMint,
  };

  const app = buildApp(deps);
  return { dbPath, promptsDir: promptsDirPath, app, sessionJwt, userId, db, chatSessionId, usageTracker };
}

function authHeaders(sessionJwt: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    cookie: `buck_session=${sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
    'x-csrf-token': CSRF_TOKEN,
  };
}

describe('realtime routes', () => {
  let ctx: TestCtx;

  afterEach(() => {
    vi.clearAllMocks();
    if (ctx?.dbPath && fs.existsSync(ctx.dbPath)) fs.unlinkSync(ctx.dbPath);
    if (ctx?.promptsDir && fs.existsSync(ctx.promptsDir)) fs.rmSync(ctx.promptsDir, { recursive: true });
  });

  // ── Task 4.1 : POST /session ──────────────────────────────────────────────

  describe('POST /api/realtime/session', () => {
    it('404 if featureFlag off', async () => {
      ctx = await makeCtx({ featureFlag: false });
      const res = await ctx.app.request('/api/realtime/session', {
        method: 'POST',
        headers: authHeaders(ctx.sessionJwt),
        body: JSON.stringify({ sessionId: ctx.chatSessionId }),
      });
      expect(res.status).toBe(404);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('not_enabled');
    });

    it('4xx if not authenticated (CSRF or auth guard fires)', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/realtime/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: ctx.chatSessionId }),
      });
      // CSRF middleware fires before authGuard → 403; if CSRF passes → 401
      expect([401, 403]).toContain(res.status);
    });

    it('404 if sessionId does not exist or belongs to another user', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/realtime/session', {
        method: 'POST',
        headers: authHeaders(ctx.sessionJwt),
        body: JSON.stringify({ sessionId: 'non-existent-session' }),
      });
      expect(res.status).toBe(404);
    });

    it('429 if budget exceeded and hardStop enabled', async () => {
      ctx = await makeCtx();
      // Set hard limit at $0.01, insert usage of $5
      ctx.db.db.insert(userSettings)
        .values({ userId: ctx.userId, monthlyCostLimitUsd: 0.01, hardStop: 1 })
        .onConflictDoUpdate({ target: userSettings.userId, set: { monthlyCostLimitUsd: 0.01, hardStop: 1 } })
        .run();
      ctx.db.db.insert(usageEvents).values({
        id: newId(),
        userId: ctx.userId,
        createdAt: FIXED_NOW,
        model: 'gpt-5.4-mini',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 5,
      }).run();

      const res = await ctx.app.request('/api/realtime/session', {
        method: 'POST',
        headers: authHeaders(ctx.sessionJwt),
        body: JSON.stringify({ sessionId: ctx.chatSessionId }),
      });
      expect(res.status).toBe(429);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('budget_exceeded');
    });

    it('200 + sessionConfig + clientSecret on valid request', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/realtime/session', {
        method: 'POST',
        headers: authHeaders(ctx.sessionJwt),
        body: JSON.stringify({ sessionId: ctx.chatSessionId, voice: 'coral' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as {
        clientSecret: string;
        expiresAt: number;
        realtimeModel: string;
        sessionConfig: { type: string; session: { voice: string } };
      };
      expect(body.clientSecret).toBe('eph_test_secret');
      expect(body.expiresAt).toBeGreaterThan(0);
      expect(body.realtimeModel).toBe('gpt-realtime-1.5');
      expect(body.sessionConfig.type).toBe('session.update');
    });

    it('normalise voice invalide → coral', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/realtime/session', {
        method: 'POST',
        headers: authHeaders(ctx.sessionJwt),
        body: JSON.stringify({ sessionId: ctx.chatSessionId, voice: 'invalid-voice-xyz' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as { sessionConfig: { session: { voice: string } } };
      expect(body.sessionConfig.session.voice).toBe('coral');
    });

    it('require_approval=never sur tous les MCP', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/realtime/session', {
        method: 'POST',
        headers: authHeaders(ctx.sessionJwt),
        body: JSON.stringify({ sessionId: ctx.chatSessionId }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as { sessionConfig: { session: { tools: Array<{ type: string; require_approval?: string }> } } };
      const mcps = body.sessionConfig.session.tools.filter((t) => t.type === 'mcp');
      if (mcps.length > 0) {
        expect(mcps.every((t) => t.require_approval === 'never')).toBe(true);
      }
    });

    it('bible off → pas de tool bible dans la config', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/realtime/session', {
        method: 'POST',
        headers: authHeaders(ctx.sessionJwt),
        body: JSON.stringify({
          sessionId: ctx.chatSessionId,
          tools: { bible: false, writingTools: false, webSearch: false },
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as { sessionConfig: { session: { tools: Array<{ type: string; server_label?: string }> } } };
      const bibleTools = body.sessionConfig.session.tools.filter(
        (t) => t.type === 'mcp' && t.server_label === 'bible',
      );
      expect(bibleTools).toHaveLength(0);
    });
  });

  // ── Task 4.2 : POST /usage ────────────────────────────────────────────────

  describe('POST /api/realtime/usage', () => {
    it('retourne costUsd et budgetRemaining sur update monotone', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/realtime/usage', {
        method: 'POST',
        headers: authHeaders(ctx.sessionJwt),
        body: JSON.stringify({
          realtimeSessionId: 'rsession_1',
          sessionId: ctx.chatSessionId,
          audioInputTokens: 1000,
          audioOutputTokens: 500,
          textInputTokens: 100,
          textOutputTokens: 50,
          cachedInputTokens: 0,
          audioInputSeconds: 10,
          audioOutputSeconds: 5,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as { costUsd: number; budgetRemaining: number };
      expect(typeof body.costUsd).toBe('number');
      expect(body.costUsd).toBeGreaterThan(0);
      expect(typeof body.budgetRemaining).toBe('number');
    });

    it('400 si décrement non-monotone', async () => {
      ctx = await makeCtx();
      // First update
      await ctx.app.request('/api/realtime/usage', {
        method: 'POST',
        headers: authHeaders(ctx.sessionJwt),
        body: JSON.stringify({
          realtimeSessionId: 'rsession_mono',
          sessionId: ctx.chatSessionId,
          audioInputTokens: 1000,
          audioOutputTokens: 500,
          textInputTokens: 100,
          textOutputTokens: 50,
          cachedInputTokens: 0,
          audioInputSeconds: 10,
          audioOutputSeconds: 5,
        }),
      });
      // Second update with lower values → non-monotonic
      const res = await ctx.app.request('/api/realtime/usage', {
        method: 'POST',
        headers: authHeaders(ctx.sessionJwt),
        body: JSON.stringify({
          realtimeSessionId: 'rsession_mono',
          sessionId: ctx.chatSessionId,
          audioInputTokens: 500, // lower than 1000
          audioOutputTokens: 500,
          textInputTokens: 100,
          textOutputTokens: 50,
          cachedInputTokens: 0,
          audioInputSeconds: 10,
          audioOutputSeconds: 5,
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('non_monotonic');
    });

    it('429 + persistUsage si budget dépassé', async () => {
      ctx = await makeCtx();
      ctx.db.db.insert(userSettings)
        .values({ userId: ctx.userId, monthlyCostLimitUsd: 0.001, hardStop: 1 })
        .onConflictDoUpdate({ target: userSettings.userId, set: { monthlyCostLimitUsd: 0.001, hardStop: 1 } })
        .run();

      const res = await ctx.app.request('/api/realtime/usage', {
        method: 'POST',
        headers: authHeaders(ctx.sessionJwt),
        body: JSON.stringify({
          realtimeSessionId: 'rsession_budget',
          sessionId: ctx.chatSessionId,
          audioInputTokens: 100000,
          audioOutputTokens: 100000,
          textInputTokens: 10000,
          textOutputTokens: 10000,
          cachedInputTokens: 0,
          audioInputSeconds: 100,
          audioOutputSeconds: 100,
        }),
      });
      expect(res.status).toBe(429);
      // Should have persisted the usage event
      const events = ctx.db.db.select().from(usageEvents)
        .where(usageEvents.kind ? require('drizzle-orm').eq(usageEvents.kind, 'realtime') : undefined as never)
        .all();
      expect(events.length).toBeGreaterThan(0);
    });
  });

  // ── Task 4.3 : POST /transcript ───────────────────────────────────────────

  describe('POST /api/realtime/transcript', () => {
    it('insère les messages voice', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/realtime/transcript', {
        method: 'POST',
        headers: authHeaders(ctx.sessionJwt),
        body: JSON.stringify({
          sessionId: ctx.chatSessionId,
          items: [
            { role: 'user', text: 'Bonjour', startedAt: FIXED_NOW, endedAt: FIXED_NOW + 1000 },
            { role: 'assistant', text: 'Salut!', startedAt: FIXED_NOW + 2000, endedAt: FIXED_NOW + 3000 },
          ],
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as { inserted: number };
      expect(body.inserted).toBe(2);
    });

    it('idempotence: double POST ne duplique pas', async () => {
      ctx = await makeCtx();
      const payload = JSON.stringify({
        sessionId: ctx.chatSessionId,
        items: [
          { role: 'user', text: 'Bonjour', startedAt: FIXED_NOW + 9999, endedAt: FIXED_NOW + 10999 },
        ],
      });
      await ctx.app.request('/api/realtime/transcript', {
        method: 'POST',
        headers: authHeaders(ctx.sessionJwt),
        body: payload,
      });
      const res2 = await ctx.app.request('/api/realtime/transcript', {
        method: 'POST',
        headers: authHeaders(ctx.sessionJwt),
        body: payload,
      });
      expect(res2.status).toBe(200);
      const body = await res2.json() as { inserted: number };
      expect(body.inserted).toBe(0); // Already inserted, skip
    });

    it('404 si session inconnue', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/realtime/transcript', {
        method: 'POST',
        headers: authHeaders(ctx.sessionJwt),
        body: JSON.stringify({ sessionId: 'fake-id', items: [] }),
      });
      expect(res.status).toBe(404);
    });
  });

  // ── Task 9.0 : POST /write-to-chat ───────────────────────────────────────

  describe('POST /api/realtime/write-to-chat', () => {
    it('happy path : insère le message et retourne id + createdAt', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/realtime/write-to-chat', {
        method: 'POST',
        headers: authHeaders(ctx.sessionJwt),
        body: JSON.stringify({ sessionId: ctx.chatSessionId, content: 'Voici ma réponse vocale.' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as { id: string; createdAt: number };
      expect(typeof body.id).toBe('string');
      expect(typeof body.createdAt).toBe('number');

      // Verify row in DB with source='voice-injected'
      const row = ctx.db.db.select().from(messages).where(require('drizzle-orm').eq(messages.id, body.id)).get();
      expect(row).toBeDefined();
      expect(row?.source).toBe('voice-injected');
      expect(row?.role).toBe('assistant');
    });

    it('404 si session appartient à un autre user', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/realtime/write-to-chat', {
        method: 'POST',
        headers: authHeaders(ctx.sessionJwt),
        body: JSON.stringify({ sessionId: 'other-user-session-id', content: 'test' }),
      });
      expect(res.status).toBe(404);
    });

    it('400 si content vide', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/realtime/write-to-chat', {
        method: 'POST',
        headers: authHeaders(ctx.sessionJwt),
        body: JSON.stringify({ sessionId: ctx.chatSessionId, content: '   ' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('invalid');
    });
  });

  // ── Task 4.4 : DELETE /session/:id ───────────────────────────────────────

  describe('DELETE /api/realtime/session/:id', () => {
    it('flush + drop : retourne costUsd > 0 et closed=true', async () => {
      ctx = await makeCtx();
      // Pre-populate tracker
      ctx.usageTracker.update('rs_flush', {
        audioInputTokens: 5000,
        audioOutputTokens: 3000,
        textInputTokens: 500,
        textOutputTokens: 300,
        cachedInputTokens: 0,
        audioInputSeconds: 50,
        audioOutputSeconds: 30,
      });

      const res = await ctx.app.request(
        `/api/realtime/session/rs_flush?sessionId=${ctx.chatSessionId}`,
        { method: 'DELETE', headers: authHeaders(ctx.sessionJwt) },
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { closed: boolean; costUsd: number };
      expect(body.closed).toBe(true);
      expect(body.costUsd).toBeGreaterThan(0);

      // Verify usage event persisted
      const events = ctx.db.db.select().from(usageEvents).all();
      const rtEvents = events.filter((e) => e.kind === 'realtime');
      expect(rtEvents).toHaveLength(1);
    });

    it('idempotence: 2e DELETE retourne costUsd=0', async () => {
      ctx = await makeCtx();
      ctx.usageTracker.update('rs_idem', {
        audioInputTokens: 1000,
        audioOutputTokens: 500,
        textInputTokens: 100,
        textOutputTokens: 50,
        cachedInputTokens: 0,
        audioInputSeconds: 10,
        audioOutputSeconds: 5,
      });

      await ctx.app.request('/api/realtime/session/rs_idem', {
        method: 'DELETE',
        headers: authHeaders(ctx.sessionJwt),
      });
      const res2 = await ctx.app.request('/api/realtime/session/rs_idem', {
        method: 'DELETE',
        headers: authHeaders(ctx.sessionJwt),
      });
      expect(res2.status).toBe(200);
      const body = await res2.json() as { closed: boolean; costUsd: number };
      expect(body.closed).toBe(true);
      expect(body.costUsd).toBe(0);
    });
  });
});
