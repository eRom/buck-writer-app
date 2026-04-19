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
import { users, sessionsAuth, usageEvents } from '../db/schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FIXED_NOW = new Date('2026-04-17T12:00:00Z').getTime();

function tmp() {
  return path.join(
    os.tmpdir(),
    `buck-usage-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );
}

interface TestCtx {
  dbPath: string;
  app: ReturnType<typeof buildApp>;
  sessionJwt: string;
  userId: string;
  db: ReturnType<typeof openDb>;
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
  const ts = FIXED_NOW;
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
    nowMs: () => FIXED_NOW,
  };

  const app = buildApp(deps);
  return { dbPath, app, sessionJwt, userId, db };
}

function authGetHeaders(sessionJwt: string): Record<string, string> {
  return {
    cookie: `buck_session=${sessionJwt}`,
  };
}

describe('usage routes', () => {
  let ctx: TestCtx;

  afterEach(() => {
    if (ctx?.dbPath && fs.existsSync(ctx.dbPath)) {
      fs.unlinkSync(ctx.dbPath);
    }
  });

  describe('GET /api/usage/current', () => {
    it('returns zero usage when no events', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/usage/current', {
        method: 'GET',
        headers: authGetHeaders(ctx.sessionJwt),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.totalUsd).toBe(0);
      expect(body.limitUsd).toBe(20);
      expect(body.percent).toBe(0);
      expect(body.resetDay).toBe(1);
      expect(typeof body.periodStart).toBe('number');
      expect(typeof body.periodEnd).toBe('number');
      expect(typeof body.daysRemaining).toBe('number');
      expect(Array.isArray(body.alerts)).toBe(true);
    });

    it('sums costUsd from usage events in current period', async () => {
      ctx = await makeCtx();
      // Insert a $5 event on April 10 (within the billing period starting April 1)
      const april10 = new Date('2026-04-10T10:00:00Z').getTime();
      ctx.db.db
        .insert(usageEvents)
        .values({
          id: newId(),
          userId: ctx.userId,
          createdAt: april10,
          model: 'gpt-4o',
          inputTokens: 100,
          outputTokens: 50,
          costUsd: 5,
        })
        .run();

      const res = await ctx.app.request('/api/usage/current', {
        method: 'GET',
        headers: authGetHeaders(ctx.sessionJwt),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.totalUsd).toBe(5);
      // limitUsd=20, so percent = round(5/20 * 100) = 25
      expect(body.percent).toBe(25);
    });

    it('excludes usage events from previous period', async () => {
      ctx = await makeCtx();
      // Insert a $10 event on March 15 (before April 1 billing reset)
      const march15 = new Date('2026-03-15T10:00:00Z').getTime();
      ctx.db.db
        .insert(usageEvents)
        .values({
          id: newId(),
          userId: ctx.userId,
          createdAt: march15,
          model: 'gpt-4o',
          inputTokens: 200,
          outputTokens: 100,
          costUsd: 10,
        })
        .run();

      const res = await ctx.app.request('/api/usage/current', {
        method: 'GET',
        headers: authGetHeaders(ctx.sessionJwt),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      // March 15 is before the April 1 period start, so it should be excluded
      expect(body.totalUsd).toBe(0);
      expect(body.percent).toBe(0);
    });

    it('returns 401 without auth', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/usage/current', {
        method: 'GET',
      });
      expect(res.status).toBe(401);
    });

    it('breakdown byKind: chat + realtime séparés', async () => {
      ctx = await makeCtx();
      const april10 = new Date('2026-04-10T10:00:00Z').getTime();

      // Insert a chat event
      ctx.db.db.insert(usageEvents).values({
        id: newId(),
        userId: ctx.userId,
        createdAt: april10,
        model: 'gpt-5.4-mini',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 3,
        kind: 'chat',
      }).run();

      // Insert a realtime event
      ctx.db.db.insert(usageEvents).values({
        id: newId(),
        userId: ctx.userId,
        createdAt: april10 + 1000,
        model: 'gpt-realtime-1.5',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 7,
        kind: 'realtime',
      }).run();

      const res = await ctx.app.request('/api/usage/current', {
        method: 'GET',
        headers: authGetHeaders(ctx.sessionJwt),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as {
        totalUsd: number;
        byKind: { chat: number; realtime: number };
      };
      expect(body.totalUsd).toBe(10);
      expect(body.byKind.chat).toBe(3);
      expect(body.byKind.realtime).toBe(7);
    });
  });
});
