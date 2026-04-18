import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
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
import { newId } from '@buck/shared';
import { sha256Hex } from '../utils/crypto.js';
import { users, sessionsAuth, userSettings, usageEvents } from '../db/schema.js';

const STREAM_SSE =
  'data: {"choices":[{"delta":{"content":"Hello!"},"finish_reason":null}]}\n\n' +
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n' +
  'data: [DONE]\n\n';

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.includes('api.openai.com')) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    const body = typeof init?.body === 'string' ? init.body : '';
    let isStream = false;
    try {
      isStream = JSON.parse(body).stream === true;
    } catch {
      // ignore
    }
    if (isStream) {
      return new Response(STREAM_SSE, { headers: { 'content-type': 'text/event-stream' } });
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: 'Test title' } }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  });
});

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CSRF_TOKEN = 'test-csrf-token-abc123';

function tmp() {
  return path.join(
    os.tmpdir(),
    `buck-budget-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );
}

function tmpPromptsDir() {
  const dir = path.join(
    os.tmpdir(),
    `buck-prompts-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SYSTEM.md'), 'You are Buck, a helpful assistant.');
  fs.writeFileSync(path.join(dir, 'RULES.md'), 'Be concise.');
  fs.writeFileSync(path.join(dir, 'USER.md'), '');
  return dir;
}

interface TestCtx {
  dbPath: string;
  promptsDir: string;
  app: ReturnType<typeof buildApp>;
  sessionJwt: string;
  userId: string;
  db: ReturnType<typeof openDb>;
}

async function makeCtx(tsOverride?: number): Promise<TestCtx> {
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
  const jwt = createJwtService({
    secret: 'a'.repeat(32),
    issuer: 'buck',
    audience: 'buck-web',
  });
  const email = { sendMagicLink: vi.fn(async () => {}) };

  // Find alice's userId
  const allUsers = db.db.select().from(users).all();
  const alice = allUsers.find((u) => u.email === 'alice@example.com');
  if (!alice) throw new Error('alice not found in seed');
  const userId = alice.id;

  // Create a JWT session directly
  const ts = tsOverride ?? Date.now();
  const sessionJwt = await jwt.sign({ sub: userId, scope: 'app' }, '30d');
  const sessionHash = sha256Hex(sessionJwt);
  db.db
    .insert(sessionsAuth)
    .values({
      id: newId(),
      userId,
      tokenHash: sessionHash,
      scope: 'app',
      expiresAt: ts + SESSION_TTL_MS,
      createdAt: ts,
    })
    .run();

  const prompts = loadPrompts(promptsDirPath);

  const deps: AppDeps = {
    db,
    email,
    jwt,
    allowedEmails: ['alice@example.com'],
    publicBaseUrl: 'https://buck.example.com',
    nowMs: () => ts,
    prompts,
    openaiApiKey: 'sk-test-fake-key',
  };

  const app = buildApp(deps);
  return { dbPath, promptsDir: promptsDirPath, app, sessionJwt, userId, db };
}

function authMutHeaders(sessionJwt: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    cookie: `buck_session=${sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
    'x-csrf-token': CSRF_TOKEN,
  };
}

describe('budget-guard middleware', () => {
  let ctx: TestCtx;

  afterEach(() => {
    if (ctx?.dbPath && fs.existsSync(ctx.dbPath)) {
      fs.unlinkSync(ctx.dbPath);
    }
    if (ctx?.promptsDir && fs.existsSync(ctx.promptsDir)) {
      fs.rmSync(ctx.promptsDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('allows chat when under budget (no settings row — defaults)', async () => {
    ctx = await makeCtx();
    // No userSettings inserted — middleware should pass through
    const res = await ctx.app.request('/api/chat', {
      method: 'POST',
      headers: authMutHeaders(ctx.sessionJwt),
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello!' }],
      }),
    });
    expect(res.status).toBe(200);
  });

  it('blocks chat with 429 when budget exceeded and hardStop=true', async () => {
    const ts = Date.now();
    ctx = await makeCtx(ts);
    const { db, userId } = ctx;

    // Upsert settings: $10 limit, hardStop enabled, reset day 1
    db.db
      .insert(userSettings)
      .values({
        userId,
        monthlyCostLimitUsd: 10,
        hardStop: 1,
        billingResetDay: 1,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { monthlyCostLimitUsd: 10, hardStop: 1, billingResetDay: 1 },
      })
      .run();

    // Insert a usage event of $15 within this month (ts is in current period)
    db.db
      .insert(usageEvents)
      .values({
        id: newId(),
        userId,
        sessionId: null,
        createdAt: ts,
        model: 'gpt-5.4-mini',
        inputTokens: 1000,
        outputTokens: 500,
        reasoningTokens: 0,
        audioInputSeconds: 0,
        audioOutputSeconds: 0,
        costUsd: 15,
      })
      .run();

    const res = await ctx.app.request('/api/chat', {
      method: 'POST',
      headers: authMutHeaders(ctx.sessionJwt),
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello!' }],
      }),
    });
    expect(res.status).toBe(429);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('budget_exceeded');
  });

  it('allows chat when budget exceeded but hardStop=false', async () => {
    const ts = Date.now();
    ctx = await makeCtx(ts);
    const { db, userId } = ctx;

    // Upsert settings: $10 limit, hardStop disabled
    db.db
      .insert(userSettings)
      .values({
        userId,
        monthlyCostLimitUsd: 10,
        hardStop: 0,
        billingResetDay: 1,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { monthlyCostLimitUsd: 10, hardStop: 0, billingResetDay: 1 },
      })
      .run();

    // Insert $15 usage — but hardStop is off, should still pass through
    db.db
      .insert(usageEvents)
      .values({
        id: newId(),
        userId,
        sessionId: null,
        createdAt: ts,
        model: 'gpt-5.4-mini',
        inputTokens: 1000,
        outputTokens: 500,
        reasoningTokens: 0,
        audioInputSeconds: 0,
        audioOutputSeconds: 0,
        costUsd: 15,
      })
      .run();

    const res = await ctx.app.request('/api/chat', {
      method: 'POST',
      headers: authMutHeaders(ctx.sessionJwt),
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello!' }],
      }),
    });
    expect(res.status).toBe(200);
  });

  it('uses correct billing period based on billingResetDay', async () => {
    // "now" is April 17 2026 (mid-month)
    // billingResetDay=20 → current period is March 20 – April 20
    // usage event created on March 25 is WITHIN the current period → 429
    const now = new Date('2026-04-17T12:00:00Z').getTime();
    ctx = await makeCtx(now);
    const { db, userId } = ctx;

    // Upsert settings: $10 limit, hardStop=1, resetDay=20
    db.db
      .insert(userSettings)
      .values({
        userId,
        monthlyCostLimitUsd: 10,
        hardStop: 1,
        billingResetDay: 20,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { monthlyCostLimitUsd: 10, hardStop: 1, billingResetDay: 20 },
      })
      .run();

    // March 25 is within March 20 – April 20 period
    const march25 = new Date('2026-03-25T00:00:00Z').getTime();
    db.db
      .insert(usageEvents)
      .values({
        id: newId(),
        userId,
        sessionId: null,
        createdAt: march25,
        model: 'gpt-5.4-mini',
        inputTokens: 1000,
        outputTokens: 500,
        reasoningTokens: 0,
        audioInputSeconds: 0,
        audioOutputSeconds: 0,
        costUsd: 15,
      })
      .run();

    const res = await ctx.app.request('/api/chat', {
      method: 'POST',
      headers: authMutHeaders(ctx.sessionJwt),
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello!' }],
      }),
    });
    expect(res.status).toBe(429);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('budget_exceeded');
  });
});
