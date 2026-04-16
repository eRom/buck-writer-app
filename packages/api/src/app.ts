import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { healthRoute } from './routes/health.js';
import { HttpError } from './utils/http-error.js';

export function buildApp() {
  const app = new Hono();

  app.route('/api/health', healthRoute);

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json(err.toJSON(), err.status as ContentfulStatusCode);
    }
    console.error('[api] unhandled error', err);
    return c.json({ error: { code: 'internal', message: 'internal server error' } }, 500);
  });

  app.notFound((c) =>
    c.json({ error: { code: 'not_found', message: 'route not found' } }, 404),
  );

  return app;
}
