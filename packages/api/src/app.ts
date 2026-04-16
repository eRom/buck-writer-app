import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { serveStatic } from '@hono/node-server/serve-static';
import { eq } from 'drizzle-orm';
import { healthRoute } from './routes/health.js';
import { HttpError } from './utils/http-error.js';
import { createAuthRoutes, type AuthRoutesDeps } from './routes/auth.js';
import {
  createSessionRoutes,
  type SessionRoutesDeps,
} from './routes/sessions.js';
import { authGuard } from './middleware/auth.js';
import { securityHeaders } from './middleware/security-headers.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { createRateLimiter, ipKey } from './middleware/rate-limit.js';
import { users } from './db/schema.js';

export interface AppDeps extends AuthRoutesDeps, SessionRoutesDeps {
  /**
   * Absolute path to the built SPA (Vite dist/). If provided, Hono serves
   * it as static and falls back to index.html for non-/api paths. Leave
   * undefined in dev + tests (Vite dev server handles the SPA on :5173).
   */
  webDistRoot?: string;
}

export function buildApp(deps: AppDeps) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use('*', securityHeaders());
  app.use('*', csrfMiddleware());

  app.route('/api/health', healthRoute);

  // Rate-limit auth endpoints (5 req/min per IP) to prevent magic-link spam
  app.use(
    '/api/auth/*',
    createRateLimiter({ windowMs: 60_000, max: 5, keyBy: ipKey }),
  );
  app.route('/api/auth', createAuthRoutes(deps));

  // Protected route: /api/auth/me (guarded individually to avoid swallowing 404s)
  app.get(
    '/api/auth/me',
    authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }),
    (c) => {
      const userId = c.get('userId');
      const user = deps.db.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .get();
      if (!user) {
        return c.json(
          { error: { code: 'not_found', message: 'user gone' } },
          404,
        );
      }
      return c.json({ userId: user.id, email: user.email });
    },
  );

  // Sessions routes (protected)
  app.use(
    '/api/sessions/*',
    authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }),
  );
  app.use(
    '/api/sessions',
    authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }),
  );
  app.route(
    '/api/sessions',
    createSessionRoutes({ db: deps.db, nowMs: deps.nowMs }),
  );

  // E2E-only test helper: exposes the latest magic-link raw token written by
  // createE2EEmailService. Gated behind E2E=1 to prevent leakage.
  if (process.env.E2E === '1' && process.env.NODE_ENV !== 'production') {
    app.get('/api/__e2e__/last-token', async (c) => {
      const email = c.req.query('email');
      if (!email) {
        return c.json(
          { error: { code: 'missing', message: 'email required' } },
          400,
        );
      }
      try {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const file = path.resolve(
          process.env.E2E_LAST_TOKEN_FILE ?? './data/e2e-last-token.json',
        );
        const raw = JSON.parse(await fs.readFile(file, 'utf8')) as {
          email: string;
          rawToken: string;
        };
        if (raw.email !== email) {
          return c.json(
            { error: { code: 'not_found', message: 'no token' } },
            404,
          );
        }
        return c.json({ rawToken: raw.rawToken });
      } catch {
        return c.json(
          { error: { code: 'not_found', message: 'no token file' } },
          404,
        );
      }
    });
  }

  // Static SPA + fallback (production only — activated when webDistRoot is set)
  if (deps.webDistRoot) {
    const root = deps.webDistRoot;
    app.use('/assets/*', serveStatic({ root }));
    app.use('/vite.svg', serveStatic({ root, path: 'vite.svg' }));
    app.get('*', async (c) => {
      if (c.req.path.startsWith('/api')) {
        return c.json(
          { error: { code: 'not_found', message: 'route not found' } },
          404,
        );
      }
      const fs = await import('node:fs/promises');
      const html = await fs.readFile(`${root}/index.html`, 'utf8');
      return c.html(html);
    });
  }

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json(err.toJSON(), err.status as ContentfulStatusCode);
    }
    console.error('[api] unhandled error', err);
    return c.json(
      { error: { code: 'internal', message: 'internal server error' } },
      500,
    );
  });

  app.notFound((c) =>
    c.json({ error: { code: 'not_found', message: 'route not found' } }, 404),
  );

  return app;
}
