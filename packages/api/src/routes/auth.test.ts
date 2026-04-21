import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { createAuthRoutes } from './auth.js';
import { authGuard } from '../middleware/auth.js';
import { openDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { createJwtService } from '../services/jwt.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');
const tmp = () =>
  path.join(
    os.tmpdir(),
    `buck-auth-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );

interface TestCtx {
  dbPath: string;
  app: Hono;
  emailsSent: Array<{ to: string; magicUrl: string }>;
  mockEmail: { sendMagicLink: ReturnType<typeof vi.fn> };
  jwt: ReturnType<typeof createJwtService>;
  handles: ReturnType<typeof openDb>;
}

function makeApp(
  allowed: string[] = ['alice@example.com'],
  nowMs?: () => number,
  seedEmails?: string[],
): TestCtx {
  const dbPath = tmp();
  const url = `file:${dbPath}`;
  runMigrations({ databaseUrl: url, migrationsFolder: migrationsDir });
  runSeed({
    databaseUrl: url,
    allowedEmails: seedEmails ?? allowed,
    mcpBibleUrl: 'http://bible-mcp:7801',
  });
  const handles = openDb(url);
  const emailsSent: Array<{ to: string; magicUrl: string }> = [];
  const mockEmail = {
    sendMagicLink: vi.fn(async (p: { to: string; magicUrl: string }) => {
      emailsSent.push(p);
    }),
  };
  const jwt = createJwtService({
    secret: 'a'.repeat(32),
    issuer: 'buck',
    audience: 'buck-web',
  });
  const effectiveNowMs = nowMs ?? (() => 1_700_000_000_000);
  const app = new Hono<{ Variables: { userId: string } }>();
  // Mount authGuard on webdav-token before the auth routes (mirrors app.ts)
  app.post(
    '/api/auth/webdav-token',
    authGuard({ db: handles, jwt, nowMs: effectiveNowMs }),
  );
  app.route(
    '/api/auth',
    createAuthRoutes({
      db: handles,
      email: mockEmail,
      jwt,
      allowedEmails: allowed,
      publicBaseUrl: 'https://buck.example.com',
      nowMs: effectiveNowMs,
      unknownEmailDelayMs: 0,
    }),
  );
  return { dbPath, app, emailsSent, mockEmail, jwt, handles };
}

describe('auth routes', () => {
  let ctx: TestCtx;
  afterEach(() => {
    if (ctx?.dbPath && fs.existsSync(ctx.dbPath)) fs.unlinkSync(ctx.dbPath);
  });

  describe('POST /api/auth/request', () => {
    it('returns 200 and sends email for whitelisted address', async () => {
      ctx = makeApp();
      const res = await ctx.app.request('/api/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { sent: boolean };
      expect(body.sent).toBe(true);
      expect(ctx.mockEmail.sendMagicLink).toHaveBeenCalledTimes(1);
    });

    it('returns 200 but does NOT send email for non-whitelisted address', async () => {
      ctx = makeApp();
      const res = await ctx.app.request('/api/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'stranger@example.com' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { sent: boolean };
      expect(body.sent).toBe(true);
      expect(ctx.mockEmail.sendMagicLink).not.toHaveBeenCalled();
    });

    it('auto-provisions whitelisted email absent from users table', async () => {
      ctx = makeApp(
        ['alice@example.com', 'newclient@example.com'],
        undefined,
        ['alice@example.com'],
      );
      const before = ctx.handles.db
        .select()
        .from(users)
        .where(eq(users.email, 'newclient@example.com'))
        .get();
      expect(before).toBeUndefined();

      const res = await ctx.app.request('/api/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'newclient@example.com' }),
      });
      expect(res.status).toBe(200);
      expect(ctx.mockEmail.sendMagicLink).toHaveBeenCalledTimes(1);
      expect(ctx.emailsSent[0]!.to).toBe('newclient@example.com');

      const after = ctx.handles.db
        .select()
        .from(users)
        .where(eq(users.email, 'newclient@example.com'))
        .get();
      expect(after).toBeDefined();
      expect(after?.email).toBe('newclient@example.com');
    });

    it('does NOT auto-provision when email is not whitelisted', async () => {
      ctx = makeApp(['alice@example.com']);
      const res = await ctx.app.request('/api/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'attacker@evil.com' }),
      });
      expect(res.status).toBe(200);
      expect(ctx.mockEmail.sendMagicLink).not.toHaveBeenCalled();

      const row = ctx.handles.db
        .select()
        .from(users)
        .where(eq(users.email, 'attacker@evil.com'))
        .get();
      expect(row).toBeUndefined();
    });

    it('returns 400 on invalid email', async () => {
      ctx = makeApp();
      const res = await ctx.app.request('/api/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/auth/callback', () => {
    it('creates session and sets cookie on valid token', async () => {
      ctx = makeApp();
      await ctx.app.request('/api/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com' }),
      });
      const captured = ctx.emailsSent[0]!;
      const url = new URL(captured.magicUrl);
      const rawToken = url.searchParams.get('token')!;
      const res = await ctx.app.request(
        `/api/auth/callback?token=${rawToken}`,
      );
      expect(res.status).toBe(302);
      const setCookie = res.headers.get('set-cookie') ?? '';
      expect(setCookie).toMatch(/buck_session=/);
      expect(setCookie).toMatch(/HttpOnly/i);
    });

    it('rejects used token on second call', async () => {
      ctx = makeApp();
      await ctx.app.request('/api/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com' }),
      });
      const url = new URL(ctx.emailsSent[0]!.magicUrl);
      const rawToken = url.searchParams.get('token')!;
      await ctx.app.request(`/api/auth/callback?token=${rawToken}`);
      const res = await ctx.app.request(
        `/api/auth/callback?token=${rawToken}`,
      );
      expect(res.status).toBe(400);
    });

    it('rejects expired token', async () => {
      let t = 1_700_000_000_000;
      ctx = makeApp(['alice@example.com'], () => t);
      await ctx.app.request('/api/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com' }),
      });
      const url = new URL(ctx.emailsSent[0]!.magicUrl);
      const rawToken = url.searchParams.get('token')!;
      t += 16 * 60 * 1000;
      const res = await ctx.app.request(
        `/api/auth/callback?token=${rawToken}`,
      );
      expect(res.status).toBe(400);
    });

    it('rejects missing token', async () => {
      ctx = makeApp();
      const res = await ctx.app.request('/api/auth/callback');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears cookie and returns ok', async () => {
      ctx = makeApp();
      await ctx.app.request('/api/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com' }),
      });
      const url = new URL(ctx.emailsSent[0]!.magicUrl);
      const rawToken = url.searchParams.get('token')!;
      const cbRes = await ctx.app.request(
        `/api/auth/callback?token=${rawToken}`,
      );
      const setCookie = cbRes.headers.get('set-cookie') ?? '';
      const sessionMatch = /buck_session=([^;]+)/.exec(setCookie)!;
      const sessionValue = sessionMatch[1]!;

      const logoutRes = await ctx.app.request('/api/auth/logout', {
        method: 'POST',
        headers: { cookie: `buck_session=${sessionValue}` },
      });
      expect(logoutRes.status).toBe(200);
      const clearCookie = logoutRes.headers.get('set-cookie') ?? '';
      expect(clearCookie).toMatch(/buck_session=;/);
      expect(clearCookie).toMatch(/Max-Age=0/);
    });
  });

  describe('POST /api/auth/webdav-token', () => {
    async function getSessionCookie(testCtx: TestCtx): Promise<string> {
      await testCtx.app.request('/api/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com' }),
      });
      const url = new URL(testCtx.emailsSent[0]!.magicUrl);
      const rawToken = url.searchParams.get('token')!;
      const cbRes = await testCtx.app.request(
        `/api/auth/callback?token=${rawToken}`,
      );
      const setCookie = cbRes.headers.get('set-cookie') ?? '';
      const match = /buck_session=([^;]+)/.exec(setCookie)!;
      return match[1]!;
    }

    it('generates a webdav-scoped JWT', async () => {
      ctx = makeApp();
      const sessionValue = await getSessionCookie(ctx);

      const res = await ctx.app.request('/api/auth/webdav-token', {
        method: 'POST',
        headers: { cookie: `buck_session=${sessionValue}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { token: string };
      expect(body.token).toBeDefined();
      expect(typeof body.token).toBe('string');

      // Verify the token has scope=webdav
      const payload = await ctx.jwt.verify(body.token);
      expect(payload.scope).toBe('webdav');
      expect(payload.sub).toBeDefined();
    });

    it('returns 401 without auth', async () => {
      ctx = makeApp();
      const res = await ctx.app.request('/api/auth/webdav-token', {
        method: 'POST',
      });
      expect(res.status).toBe(401);
    });
  });
});
