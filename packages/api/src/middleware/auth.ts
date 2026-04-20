import type { MiddlewareHandler } from 'hono';
import { eq, and, gte } from 'drizzle-orm';
import type { DbHandles } from '../db/client.js';
import type { JwtService } from '../services/jwt.js';
import { sessionsAuth } from '../db/schema.js';
import { sha256Hex } from '../utils/crypto.js';
import { parseCookies } from '../utils/cookies.js';

export interface AuthGuardDeps {
  db: DbHandles;
  jwt: JwtService;
  nowMs?: () => number;
}

export function authGuard(deps: AuthGuardDeps): MiddlewareHandler {
  const now = deps.nowMs ?? Date.now;
  return async (c, next) => {
    const cookies = parseCookies(c.req.header('cookie'));
    const raw = cookies['buck_session'];
    if (!raw) {
      return c.json(
        { error: { code: 'unauthenticated', message: 'no session' } },
        401,
      );
    }
    try {
      const payload = await deps.jwt.verify(raw);
      const hash = sha256Hex(raw);
      const session = deps.db.db
        .select()
        .from(sessionsAuth)
        .where(
          and(
            eq(sessionsAuth.tokenHash, hash),
            gte(sessionsAuth.expiresAt, now()),
          ),
        )
        .get();
      if (!session || session.userId !== payload.sub) {
        return c.json(
          {
            error: { code: 'unauthenticated', message: 'session revoked' },
          },
          401,
        );
      }
      c.set('userId', payload.sub);
      await next();
      return;
    } catch {
      return c.json(
        { error: { code: 'unauthenticated', message: 'invalid token' } },
        401,
      );
    }
  };
}
