import { serve } from '@hono/node-server';
import { buildApp } from './app.js';
import { loadEnv } from './env.js';

const env = loadEnv();
const app = buildApp();

serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, (info) => {
  console.warn(`[api] listening on http://${info.address}:${info.port}`);
});
