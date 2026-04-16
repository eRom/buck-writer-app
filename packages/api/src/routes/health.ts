import { Hono } from 'hono';

export const healthRoute = new Hono().get('/', (c) =>
  c.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    version: process.env.npm_package_version ?? '0.0.0',
  }),
);
