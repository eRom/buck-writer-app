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
import { newId } from '@buck/shared';
import { sha256Hex } from '../utils/crypto.js';
import { users, sessionsAuth } from '../db/schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CSRF_TOKEN = 'test-csrf-token-abc123';

function tmp() {
  return path.join(
    os.tmpdir(),
    `buck-settings-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );
}

interface TestCtx {
  dbPath: string;
  app: ReturnType<typeof buildApp>;
  sessionJwt: string;
  userId: string;
}

async function makeCtx(): Promise<TestCtx> {
  const dbPath = tmp();
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
  const ts = Date.now();
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

  const deps: AppDeps = {
    db,
    email,
    jwt,
    allowedEmails: ['alice@example.com'],
    publicBaseUrl: 'https://buck.example.com',
    nowMs: () => ts,
  };

  const app = buildApp(deps);
  return { dbPath, app, sessionJwt, userId };
}

// Helper: authenticated GET headers
function authGetHeaders(sessionJwt: string): Record<string, string> {
  return {
    cookie: `buck_session=${sessionJwt}`,
  };
}

// Helper: authenticated mutation headers (includes CSRF)
function authMutHeaders(sessionJwt: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    cookie: `buck_session=${sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
    'x-csrf-token': CSRF_TOKEN,
  };
}

describe('settings routes', () => {
  let ctx: TestCtx;

  afterEach(() => {
    if (ctx?.dbPath && fs.existsSync(ctx.dbPath)) {
      fs.unlinkSync(ctx.dbPath);
    }
  });

  describe('GET /api/settings', () => {
    it('returns default settings', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/settings', {
        method: 'GET',
        headers: authGetHeaders(ctx.sessionJwt),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.monthlyCostLimitUsd).toBe(20);
      expect(body.hardStop).toBe(true);
      expect(body.billingResetDay).toBe(1);
      expect(body.alertThresholds).toEqual([80, 100]);
      expect(typeof body.defaultModel).toBe('string');
      expect(typeof body.defaultReasoningEffort).toBe('string');
    });

    it('returns 401 without auth', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/settings', {
        method: 'GET',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/settings', () => {
    it('updates monthlyCostLimitUsd', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/settings', {
        method: 'PATCH',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ monthlyCostLimitUsd: 50 }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.monthlyCostLimitUsd).toBe(50);
    });

    it('updates billingResetDay', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/settings', {
        method: 'PATCH',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ billingResetDay: 15 }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.billingResetDay).toBe(15);
    });

    it('rejects invalid billingResetDay (> 28) with 422', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/settings', {
        method: 'PATCH',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ billingResetDay: 31 }),
      });
      expect(res.status).toBe(422);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('invalid_input');
    });

    it('updates hardStop', async () => {
      ctx = await makeCtx();
      // First set to false
      const res1 = await ctx.app.request('/api/settings', {
        method: 'PATCH',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ hardStop: false }),
      });
      expect(res1.status).toBe(200);
      const body1 = await res1.json() as Record<string, unknown>;
      expect(body1.hardStop).toBe(false);

      // Then set back to true
      const res2 = await ctx.app.request('/api/settings', {
        method: 'PATCH',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ hardStop: true }),
      });
      expect(res2.status).toBe(200);
      const body2 = await res2.json() as Record<string, unknown>;
      expect(body2.hardStop).toBe(true);
    });

    it('updates realtimeDefaultVoice', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/settings', {
        method: 'PATCH',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ realtimeDefaultVoice: 'alloy' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.realtimeDefaultVoice).toBe('alloy');
    });

    it('round-trips realtimeTurnDetection JSON', async () => {
      ctx = await makeCtx();
      const td = {
        mode: 'semantic_vad',
        threshold: 0.7,
        prefix_padding_ms: 200,
        silence_duration_ms: 800,
        interrupt_response: false,
      };
      const res = await ctx.app.request('/api/settings', {
        method: 'PATCH',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ realtimeTurnDetection: td }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.realtimeTurnDetection).toEqual(td);
    });

    it('rejects realtimeSilenceTimeoutSec out of range with 422', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/settings', {
        method: 'PATCH',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ realtimeSilenceTimeoutSec: 5 }),
      });
      expect(res.status).toBe(422);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('invalid_input');
    });

    it('rejects realtimeSilenceTimeoutSec > 60 with 422', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/settings', {
        method: 'PATCH',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ realtimeSilenceTimeoutSec: 90 }),
      });
      expect(res.status).toBe(422);
    });

    it('round-trips realtimeTools JSON', async () => {
      ctx = await makeCtx();
      const tools = { bible: false, writingTools: true, webSearch: false };
      const res = await ctx.app.request('/api/settings', {
        method: 'PATCH',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ realtimeTools: tools }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.realtimeTools).toEqual(tools);
    });
  });

  describe('GET /api/settings — realtime defaults', () => {
    it('retourne les champs realtime avec les defaults', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/settings', {
        method: 'GET',
        headers: authGetHeaders(ctx.sessionJwt),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.realtimeDefaultVoice).toBe('coral');
      expect(body.realtimeSilenceTimeoutSec).toBe(30);
      expect(body.realtimeTurnDetection).toEqual({
        mode: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 500,
        silence_duration_ms: 500,
        interrupt_response: true,
      });
      expect(body.realtimeTools).toEqual({
        bible: true,
        writingTools: true,
        webSearch: true,
      });
      expect(body.chatTools).toEqual({ webSearch: false });
      expect(body.vectorStoreId).toBeNull();
      expect(body.vectorStoreLastSyncAt).toBeNull();
    });

    it('round-trips chatTools JSON', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/settings', {
        method: 'PATCH',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ chatTools: { webSearch: true } }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.chatTools).toEqual({ webSearch: true });
    });
  });

  describe('M8B image_generation settings', () => {
    it('returns image_generation defaults on GET', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/settings', {
        method: 'GET',
        headers: authGetHeaders(ctx.sessionJwt),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.imageQuality).toBe('medium');
      expect(body.imageSize).toBe('1024x1024');
    });

    it('PATCH imageQuality and imageSize round-trip', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/settings', {
        method: 'PATCH',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ imageQuality: 'high', imageSize: '1536x1024' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.imageQuality).toBe('high');
      expect(body.imageSize).toBe('1536x1024');
    });

    it('rejects invalid imageQuality with 422', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/settings', {
        method: 'PATCH',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ imageQuality: 'ultra' }),
      });
      expect(res.status).toBe(422);
    });

    it('rejects invalid imageSize with 422', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/settings', {
        method: 'PATCH',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ imageSize: '999x999' }),
      });
      expect(res.status).toBe(422);
    });

    it('accepts imageGen flag in chatTools', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/settings', {
        method: 'PATCH',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({
          chatTools: { webSearch: false, imageGen: true },
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        chatTools: Record<string, boolean>;
      };
      expect(body.chatTools.imageGen).toBe(true);
    });
  });
});
