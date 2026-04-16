import { serve } from '@hono/node-server';
import { Resend } from 'resend';
import { buildApp } from './app.js';
import { loadEnv } from './env.js';
import { openDb } from './db/client.js';
import { createJwtService } from './services/jwt.js';
import { createEmailService } from './services/email.js';

const env = loadEnv();
const handles = openDb(env.DATABASE_URL);
const resend = new Resend(env.RESEND_API_KEY);
const jwt = createJwtService({
  secret: env.AUTH_JWT_SECRET,
  issuer: 'buck',
  audience: 'buck-web',
});
const email = createEmailService({
  resendClient: resend as unknown as Parameters<
    typeof createEmailService
  >[0]['resendClient'],
  fromAddress: env.RESEND_FROM,
});

const app = buildApp({
  db: handles,
  email,
  jwt,
  allowedEmails: env.AUTH_ALLOWED_EMAILS,
  publicBaseUrl: env.PUBLIC_BASE_URL,
});

serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, (info) => {
  console.warn(`[api] listening on http://${info.address}:${info.port}`);
});
