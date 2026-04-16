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
    `buck-sessions-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );
}

interface TestCtx {
  dbPath: string;
  app: ReturnType<typeof buildApp>;
  sessionJwt: string;
  userId: string;
}

async function makeCtx(tsOverride?: number): Promise<TestCtx> {
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

// Helper: authenticated headers for GET
function authHeaders(sessionJwt: string): Record<string, string> {
  return {
    cookie: `buck_session=${sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
  };
}

// Helper: authenticated headers for POST/PATCH/DELETE (includes CSRF)
function authMutHeaders(sessionJwt: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    cookie: `buck_session=${sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
    'x-csrf-token': CSRF_TOKEN,
  };
}

describe('sessions routes', () => {
  let ctx: TestCtx;

  afterEach(() => {
    if (ctx?.dbPath && fs.existsSync(ctx.dbPath)) {
      fs.unlinkSync(ctx.dbPath);
    }
  });

  describe('POST /api/sessions', () => {
    it('creates a session with defaults (201)', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/sessions', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        id: string;
        title: string;
        model: string;
      };
      expect(body.id).toBeTruthy();
      expect(body.title).toBe('Nouvelle conversation');
      expect(body.model).toBe('gpt-5.4-mini');
    });

    it('creates a session with custom title', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/sessions', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ title: 'Mon histoire' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { title: string };
      expect(body.title).toBe('Mon histoire');
    });

    it('returns 401 without session', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/sessions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `buck_csrf=${CSRF_TOKEN}`,
          'x-csrf-token': CSRF_TOKEN,
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/sessions', () => {
    it('lists sessions (empty initially)', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/sessions', {
        headers: authHeaders(ctx.sessionJwt),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { sessions: unknown[] };
      expect(Array.isArray(body.sessions)).toBe(true);
      expect(body.sessions.length).toBe(0);
    });

    it('lists sessions after creating one', async () => {
      ctx = await makeCtx();
      await ctx.app.request('/api/sessions', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ title: 'Test session' }),
      });

      const res = await ctx.app.request('/api/sessions', {
        headers: authHeaders(ctx.sessionJwt),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { sessions: Array<{ title: string }> };
      expect(body.sessions.length).toBe(1);
      expect(body.sessions[0]!.title).toBe('Test session');
    });

    it('searches sessions by title with ?q=', async () => {
      ctx = await makeCtx();
      await ctx.app.request('/api/sessions', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ title: 'Histoire de dragons' }),
      });
      await ctx.app.request('/api/sessions', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ title: 'Recette de cuisine' }),
      });

      const res = await ctx.app.request('/api/sessions?q=dragons', {
        headers: authHeaders(ctx.sessionJwt),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { sessions: Array<{ title: string }> };
      expect(body.sessions.length).toBe(1);
      expect(body.sessions[0]!.title).toBe('Histoire de dragons');
    });
  });

  describe('PATCH /api/sessions/:id', () => {
    it('renames a session', async () => {
      ctx = await makeCtx();
      const createRes = await ctx.app.request('/api/sessions', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ title: 'Ancien titre' }),
      });
      const created = (await createRes.json()) as { id: string };

      const patchRes = await ctx.app.request(`/api/sessions/${created.id}`, {
        method: 'PATCH',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ title: 'Nouveau titre' }),
      });
      expect(patchRes.status).toBe(200);
      const body = (await patchRes.json()) as { title: string };
      expect(body.title).toBe('Nouveau titre');
    });

    it('returns 404 for non-existent session', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request(`/api/sessions/${newId()}`, {
        method: 'PATCH',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ title: 'X' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/sessions/:id', () => {
    it('soft-deletes a session (no longer in list)', async () => {
      ctx = await makeCtx();
      const createRes = await ctx.app.request('/api/sessions', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ title: 'A supprimer' }),
      });
      const created = (await createRes.json()) as { id: string };

      const delRes = await ctx.app.request(`/api/sessions/${created.id}`, {
        method: 'DELETE',
        headers: authMutHeaders(ctx.sessionJwt),
      });
      expect(delRes.status).toBe(200);
      const body = (await delRes.json()) as { ok: boolean };
      expect(body.ok).toBe(true);

      // Should no longer appear in list
      const listRes = await ctx.app.request('/api/sessions', {
        headers: authHeaders(ctx.sessionJwt),
      });
      const list = (await listRes.json()) as { sessions: unknown[] };
      expect(list.sessions.length).toBe(0);
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('returns 404 for non-existent session', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request(`/api/sessions/${newId()}`, {
        headers: authHeaders(ctx.sessionJwt),
      });
      expect(res.status).toBe(404);
    });

    it('returns the session for the owner', async () => {
      ctx = await makeCtx();
      const createRes = await ctx.app.request('/api/sessions', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ title: 'Ma session' }),
      });
      const created = (await createRes.json()) as { id: string; title: string };

      const res = await ctx.app.request(`/api/sessions/${created.id}`, {
        headers: authHeaders(ctx.sessionJwt),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string; title: string };
      expect(body.id).toBe(created.id);
      expect(body.title).toBe('Ma session');
    });
  });

  describe('GET /api/sessions/:id/messages', () => {
    it('returns empty messages for new session', async () => {
      ctx = await makeCtx();
      const createRes = await ctx.app.request('/api/sessions', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({}),
      });
      const created = (await createRes.json()) as { id: string };

      const res = await ctx.app.request(
        `/api/sessions/${created.id}/messages`,
        { headers: authHeaders(ctx.sessionJwt) },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        messages: unknown[];
        nextCursor: string | null;
      };
      expect(Array.isArray(body.messages)).toBe(true);
      expect(body.messages.length).toBe(0);
      expect(body.nextCursor).toBeNull();
    });

    it('returns 404 for messages of non-existent session', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request(
        `/api/sessions/${newId()}/messages`,
        { headers: authHeaders(ctx.sessionJwt) },
      );
      expect(res.status).toBe(404);
    });
  });

  describe('cross-user isolation', () => {
    it('user B cannot access user A session', async () => {
      // Create ctx with alice (seeds alice@example.com)
      ctx = await makeCtx();

      // Alice creates a session
      const createRes = await ctx.app.request('/api/sessions', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ title: 'Alice only' }),
      });
      const { id: aliceSessionId } = (await createRes.json()) as { id: string };

      // Create bob manually in same DB
      const bobId = newId();
      const jwt = createJwtService({
        secret: 'a'.repeat(32),
        issuer: 'buck',
        audience: 'buck-web',
      });
      // Insert bob user directly via the app's db
      // We use the same DB by re-opening it
      const bobDb = openDb(`file:${ctx.dbPath}`);
      bobDb.db.insert(users).values({
        id: bobId,
        email: 'bob@example.com',
        createdAt: Date.now(),
      }).run();
      const bobJwt = await jwt.sign({ sub: bobId, scope: 'app' }, '30d');
      bobDb.db.insert(sessionsAuth).values({
        id: newId(),
        userId: bobId,
        tokenHash: sha256Hex(bobJwt),
        scope: 'app',
        expiresAt: Date.now() + 86400000,
        createdAt: Date.now(),
      }).run();
      bobDb.sqlite.close();

      // Bob tries to GET alice's session → 404
      const getRes = await ctx.app.request(`/api/sessions/${aliceSessionId}`, {
        headers: authHeaders(bobJwt),
      });
      expect(getRes.status).toBe(404);

      // Bob tries to PATCH alice's session → 404
      const patchRes = await ctx.app.request(`/api/sessions/${aliceSessionId}`, {
        method: 'PATCH',
        headers: authMutHeaders(bobJwt),
        body: JSON.stringify({ title: 'Hacked' }),
      });
      expect(patchRes.status).toBe(404);

      // Bob tries to DELETE alice's session → 404
      const delRes = await ctx.app.request(`/api/sessions/${aliceSessionId}`, {
        method: 'DELETE',
        headers: authMutHeaders(bobJwt),
      });
      expect(delRes.status).toBe(404);
    });
  });
});
