import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { eq } from 'drizzle-orm';
import { createImagesRoutes } from './images.js';
import { runMigrations } from '../db/migrate.js';
import { openDb } from '../db/client.js';
import type { DbHandles } from '../db/client.js';
import {
  users,
  sessionsAuth,
  chatSessions,
  messages,
} from '../db/schema.js';
import { createJwtService } from '../services/jwt.js';
import { sha256Hex } from '../utils/crypto.js';
import { newId } from '@buck/shared';
import { authGuard } from '../middleware/auth.js';
import { HttpError } from '../utils/http-error.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');

const jwt = createJwtService({
  secret: 'a'.repeat(32),
  issuer: 'buck',
  audience: 'buck-web',
});

// 1x1 transparent PNG, base64 encoded — real PNG header so the write is sane.
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

interface Ctx {
  db: DbHandles;
  dbPath: string;
  workspaceDir: string;
  userId: string;
  otherUserId: string;
  sessionId: string;
  messageId: string;
  callId: string;
  token: string;
  otherToken: string;
  app: Hono;
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
});

async function makeCtx(): Promise<Ctx> {
  const dbPath = path.join(
    os.tmpdir(),
    `buck-images-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );
  runMigrations({
    databaseUrl: `file:${dbPath}`,
    migrationsFolder: migrationsDir,
  });
  const db = openDb(`file:${dbPath}`);

  const workspaceDir = path.join(
    os.tmpdir(),
    `buck-ws-img-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
  );
  fs.mkdirSync(workspaceDir, { recursive: true });

  const userId = newId();
  const otherUserId = newId();
  const ts = Date.now();
  db.db.insert(users).values([
    { id: userId, email: 'alice@test.com', createdAt: ts },
    { id: otherUserId, email: 'bob@test.com', createdAt: ts },
  ]).run();

  const token = await jwt.sign({ sub: userId, scope: 'app' }, '1h');
  const otherToken = await jwt.sign({ sub: otherUserId, scope: 'app' }, '1h');
  for (const [uid, tok] of [[userId, token], [otherUserId, otherToken]] as const) {
    db.db
      .insert(sessionsAuth)
      .values({
        id: newId(),
        userId: uid,
        tokenHash: sha256Hex(tok),
        scope: 'app',
        expiresAt: ts + 3_600_000,
        createdAt: ts,
      })
      .run();
  }

  const sessionId = newId();
  db.db.insert(chatSessions).values({
    id: sessionId,
    userId,
    title: 'Test',
    model: 'gpt-5.4-mini',
    reasoningEffort: 'low',
    archived: 0,
    createdAt: ts,
    updatedAt: ts,
  }).run();

  const callId = 'ig_abc123';
  const messageId = newId();
  const imagesJson = JSON.stringify([
    {
      callId,
      b64: TINY_PNG_B64,
      size: '1024x1024',
      revisedPrompt: 'A fox',
      createdAt: ts,
    },
  ]);
  db.db.insert(messages).values({
    id: messageId,
    sessionId,
    role: 'assistant',
    contentJson: JSON.stringify({ text: 'Voici ton image.' }),
    model: 'gpt-5.4-mini',
    imagesJson,
    createdAt: ts,
  }).run();

  const app = new Hono();
  app.use('*', authGuard({ db, jwt }));
  app.route('/', createImagesRoutes({ db, workspaceDir, nowMs: () => ts }));
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json(err.toJSON(), err.status as ContentfulStatusCode);
    }
    throw err;
  });

  cleanups.push(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(workspaceDir)) fs.rmSync(workspaceDir, { recursive: true });
  });

  return {
    db,
    dbPath,
    workspaceDir,
    userId,
    otherUserId,
    sessionId,
    messageId,
    callId,
    token,
    otherToken,
    app,
  };
}

function authHeaders(token: string): Record<string, string> {
  const csrf = 'test-csrf';
  return {
    'content-type': 'application/json',
    cookie: `buck_session=${token}; buck_csrf=${csrf}`,
    'x-csrf-token': csrf,
  };
}

describe('POST /api/images/save', () => {
  it('writes PNG into workspace and updates imagesJson.savedToWorkspace', async () => {
    const ctx = await makeCtx();
    const res = await ctx.app.request('/save', {
      method: 'POST',
      headers: authHeaders(ctx.token),
      body: JSON.stringify({
        messageId: ctx.messageId,
        callId: ctx.callId,
        path: 'covers/fox.png',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      path: string;
      sizeBytes: number;
    };
    expect(body.ok).toBe(true);
    expect(body.path).toBe('covers/fox.png');
    expect(body.sizeBytes).toBeGreaterThan(0);

    const abs = path.join(ctx.workspaceDir, 'covers/fox.png');
    expect(fs.existsSync(abs)).toBe(true);
    const bytes = fs.readFileSync(abs);
    expect(bytes.length).toBe(body.sizeBytes);

    // imagesJson updated
    const row = ctx.db.db
      .select()
      .from(messages)
      .where(eq(messages.id, ctx.messageId))
      .get();
    const entries = JSON.parse(row!.imagesJson!) as Array<{
      callId: string;
      savedToWorkspace?: string;
    }>;
    expect(entries[0]!.savedToWorkspace).toBe('covers/fox.png');
  });

  it('rejects path traversal with 403', async () => {
    const ctx = await makeCtx();
    const res = await ctx.app.request('/save', {
      method: 'POST',
      headers: authHeaders(ctx.token),
      body: JSON.stringify({
        messageId: ctx.messageId,
        callId: ctx.callId,
        path: '../secret.png',
      }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects non-.png extension with 422', async () => {
    const ctx = await makeCtx();
    const res = await ctx.app.request('/save', {
      method: 'POST',
      headers: authHeaders(ctx.token),
      body: JSON.stringify({
        messageId: ctx.messageId,
        callId: ctx.callId,
        path: 'covers/fox.jpg',
      }),
    });
    expect(res.status).toBe(422);
  });

  it('rejects unknown callId with 404', async () => {
    const ctx = await makeCtx();
    const res = await ctx.app.request('/save', {
      method: 'POST',
      headers: authHeaders(ctx.token),
      body: JSON.stringify({
        messageId: ctx.messageId,
        callId: 'ig_does_not_exist',
        path: 'covers/fox.png',
      }),
    });
    expect(res.status).toBe(404);
  });

  it('rejects unknown messageId with 404', async () => {
    const ctx = await makeCtx();
    const res = await ctx.app.request('/save', {
      method: 'POST',
      headers: authHeaders(ctx.token),
      body: JSON.stringify({
        messageId: 'msg_unknown',
        callId: ctx.callId,
        path: 'covers/fox.png',
      }),
    });
    expect(res.status).toBe(404);
  });

  it('rejects request from non-owner with 403', async () => {
    const ctx = await makeCtx();
    const res = await ctx.app.request('/save', {
      method: 'POST',
      headers: authHeaders(ctx.otherToken),
      body: JSON.stringify({
        messageId: ctx.messageId,
        callId: ctx.callId,
        path: 'covers/fox.png',
      }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects protected directories', async () => {
    const ctx = await makeCtx();
    const res = await ctx.app.request('/save', {
      method: 'POST',
      headers: authHeaders(ctx.token),
      body: JSON.stringify({
        messageId: ctx.messageId,
        callId: ctx.callId,
        path: 'prompts/hack.png',
      }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 422 for invalid body', async () => {
    const ctx = await makeCtx();
    const res = await ctx.app.request('/save', {
      method: 'POST',
      headers: authHeaders(ctx.token),
      body: JSON.stringify({ messageId: '', callId: '', path: '' }),
    });
    expect(res.status).toBe(422);
  });
});
