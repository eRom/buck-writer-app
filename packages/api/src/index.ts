import { serve } from '@hono/node-server';
import { Resend } from 'resend';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadEnv } from './env.js';
import { openDb } from './db/client.js';
import { createJwtService } from './services/jwt.js';
import {
  createEmailService,
  createE2EEmailService,
} from './services/email.js';
import { loadPrompts } from './services/prompts.js';

const env = loadEnv();

const promptsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', 'prompts',
);
const prompts = (() => {
  try { return loadPrompts(promptsDir); }
  catch { console.warn('[api] prompts/ not found, chat disabled'); return undefined; }
})();
const handles = openDb(env.DATABASE_URL);
const jwt = createJwtService({
  secret: env.AUTH_JWT_SECRET,
  issuer: 'buck',
  audience: 'buck-web',
});
const email =
  process.env.E2E === '1'
    ? createE2EEmailService(
        process.env.E2E_LAST_TOKEN_FILE ?? './data/e2e-last-token.json',
      )
    : env.RESEND_API_KEY && env.RESEND_FROM
      ? createEmailService({
          resendClient: new Resend(env.RESEND_API_KEY) as unknown as Parameters<
            typeof createEmailService
          >[0]['resendClient'],
          fromAddress: env.RESEND_FROM,
        })
      : createE2EEmailService('./data/e2e-last-token.json');

const app = buildApp({
  db: handles,
  email,
  jwt,
  allowedEmails: env.AUTH_ALLOWED_EMAILS,
  publicBaseUrl: env.PUBLIC_BASE_URL,
  webDistRoot: process.env.WEB_DIST_ROOT,
  prompts,
  openaiApiKey: env.OPENAI_API_KEY,
});

serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, (info) => {
  console.warn(`[api] listening on http://${info.address}:${info.port}`);
});
