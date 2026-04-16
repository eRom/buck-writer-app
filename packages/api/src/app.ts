import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { eq } from 'drizzle-orm';
import { healthRoute } from './routes/health.js';
import { HttpError } from './utils/http-error.js';
import { createAuthRoutes, type AuthRoutesDeps } from './routes/auth.js';
import { authGuard } from './middleware/auth.js';
import { securityHeaders } from './middleware/security-headers.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { users } from './db/schema.js';

export type AppDeps = AuthRoutesDeps;

export function buildApp(deps: AppDeps) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use('*', securityHeaders());
  app.use('*', csrfMiddleware());

  app.route('/api/health', healthRoute);
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
