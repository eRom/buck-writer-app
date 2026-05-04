import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { AuthRequestInput, newId } from '@buck/shared';
import type { DbHandles } from '../db/client.js';
import type { EmailService } from '../services/email.js';
import type { JwtService } from '../services/jwt.js';
import { authTokens, sessionsAuth, users } from '../db/schema.js';
import { sha256Hex, randomTokenHex } from '../utils/crypto.js';

export interface AuthRoutesDeps {
  db: DbHandles;
  email: EmailService;
  jwt: JwtService;
  allowedEmails: string[];
  publicBaseUrl: string;
  nowMs?: () => number;
  /**
   * Floor on the response time of `POST /api/auth/request` for both the
   * whitelisted and non-whitelisted branches (anti-enumeration, VULN-008).
   * The actual handler work runs first; if it completes earlier, we sleep
   * the remaining delta. Default 600ms. Set to 0 to disable in tests.
   */
  minResponseMs?: number;
  /**
   * Optional Domain attribute appended to buck_session cookies. Set to
   * ".romain-ecarnot.com" to share the cookie with bible.buck.* (SSO via
   * Caddy forward_auth). Undefined = host-only cookie.
   */
  cookieDomain?: string;
}

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

/**
 * Sleeps until at least `minMs` milliseconds have elapsed since `t0`.
 * Used by `/api/auth/request` to enforce a uniform response-time floor on
 * both anti-enumeration branches so an attacker cannot infer whitelist
 * membership from response timing (CWE-208 / VULN-008).
 */
export async function enforceFloor(t0: number, minMs: number): Promise<void> {
  if (minMs <= 0) return;
  const elapsed = Date.now() - t0;
  const remaining = minMs - elapsed;
  if (remaining > 0) {
    await new Promise((r) => setTimeout(r, remaining));
  }
}

export function createAuthRoutes(deps: AuthRoutesDeps): Hono {
  const now = deps.nowMs ?? Date.now;
  const whitelist = new Set(deps.allowedEmails.map((e) => e.toLowerCase()));
  const minResponseMs = deps.minResponseMs ?? 600;
  const app = new Hono();
  const domainAttr = deps.cookieDomain ? `; Domain=${deps.cookieDomain}` : '';

  app.post('/request', async (c) => {
    const t0 = Date.now();
    const raw = await c.req.json().catch(() => ({}));
    const parsed = AuthRequestInput.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { error: { code: 'invalid_input', message: 'invalid email' } },
        400,
      );
    }
    const email = parsed.data.email.toLowerCase();
    const ts = now();

    // Anti-enumeration: both the whitelisted and non-whitelisted branches
    // run to completion first, then we floor the response time uniformly
    // via enforceFloor(t0, minResponseMs).
    if (!whitelist.has(email)) {
      await enforceFloor(t0, minResponseMs);
      return c.json({ sent: true });
    }

    let existing = deps.db.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();
    if (!existing) {
      // Whitelisted but absent from users table — auto-provision.
      // Security: this branch is unreachable unless whitelist.has(email).
      const id = newId();
      deps.db.db
        .insert(users)
        .values({ id, email, createdAt: ts })
        .run();
      console.warn(`[auth] auto-provisioned user ${id} (whitelist hit, DB miss)`);
      existing = { id, email, createdAt: ts, lastLoginAt: null };
    }

    const token = randomTokenHex(32);
    const tokenHash = sha256Hex(token);
    deps.db.db
      .insert(authTokens)
      .values({
        id: newId(),
        userId: existing.id,
        tokenHash,
        expiresAt: ts + MAGIC_LINK_TTL_MS,
        createdAt: ts,
      })
      .run();

    const magicUrl = `${deps.publicBaseUrl}/api/auth/callback?token=${token}`;
    await deps.email.sendMagicLink({ to: email, magicUrl });

    await enforceFloor(t0, minResponseMs);
    return c.json({ sent: true });
  });

  app.get('/callback', async (c) => {
    const token = c.req.query('token');
    if (!token) {
      return c.json(
        { error: { code: 'invalid_input', message: 'token required' } },
        400,
      );
    }
    const tokenHash = sha256Hex(token);
    const ts = now();

    const row = deps.db.db
      .select()
      .from(authTokens)
      .where(eq(authTokens.tokenHash, tokenHash))
      .get();

    if (!row || row.usedAt !== null || row.expiresAt < ts) {
      return c.json(
        {
          error: {
            code: 'invalid_token',
            message: 'token invalid, used, or expired',
          },
        },
        400,
      );
    }

    deps.db.db
      .update(authTokens)
      .set({ usedAt: ts })
      .where(eq(authTokens.id, row.id))
      .run();

    deps.db.db
      .update(users)
      .set({ lastLoginAt: ts })
      .where(eq(users.id, row.userId))
      .run();

    const sessionJwt = await deps.jwt.sign(
      { sub: row.userId, scope: 'app' },
      '30d',
    );
    const sessionHash = sha256Hex(sessionJwt);
    deps.db.db
      .insert(sessionsAuth)
      .values({
        id: newId(),
        userId: row.userId,
        tokenHash: sessionHash,
        scope: 'app',
        userAgent: c.req.header('user-agent') ?? null,
        expiresAt: ts + SESSION_TTL_MS,
        createdAt: ts,
      })
      .run();

    const cookie = `buck_session=${sessionJwt}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${domainAttr}`;
    c.header('Set-Cookie', cookie);
    return c.redirect('/');
  });

  // WebDAV token — protected by authGuard (mounted in app.ts)
  app.post('/webdav-token', async (c) => {
    const userId = c.get('userId' as never) as string | undefined;
    if (!userId) {
      return c.json(
        { error: { code: 'unauthenticated', message: 'login required' } },
        401,
      );
    }
    const ts = now();
    const WEBDAV_TTL_SECONDS = 30 * 24 * 60 * 60;
    const WEBDAV_TTL_MS = WEBDAV_TTL_SECONDS * 1000;

    const token = await deps.jwt.sign({ sub: userId, scope: 'webdav' as const }, '30d');
    const tokenHash = sha256Hex(token);
    deps.db.db
      .insert(sessionsAuth)
      .values({
        id: newId(),
        userId,
        tokenHash,
        scope: 'webdav',
        userAgent: c.req.header('user-agent') ?? null,
        expiresAt: ts + WEBDAV_TTL_MS,
        createdAt: ts,
      })
      .run();

    return c.json({ token });
  });

  app.post('/logout', (c) => {
    const cookies = c.req.header('cookie') ?? '';
    const match = /buck_session=([^;]+)/.exec(cookies);
    if (match) {
      const hash = sha256Hex(decodeURIComponent(match[1]!));
      deps.db.db
        .delete(sessionsAuth)
        .where(eq(sessionsAuth.tokenHash, hash))
        .run();
    }
    c.header(
      'Set-Cookie',
      `buck_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0${domainAttr}`,
    );
    return c.json({ ok: true });
  });

  return app;
}
