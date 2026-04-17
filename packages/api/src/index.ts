import { serve } from '@hono/node-server';
import { Resend } from 'resend';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadEnv } from './env.js';
import { openDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { runSeed } from './db/seed.js';
import { createJwtService } from './services/jwt.js';
import {
  createEmailService,
  createE2EEmailService,
} from './services/email.js';
import { loadPrompts } from './services/prompts.js';

const env = loadEnv();

// Auto-create data dirs + run migrations in dev
const dbFilePath = env.DATABASE_URL.replace(/^file:/, '');
const dbDir = path.dirname(dbFilePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.warn(`[api] created ${dbDir}`);
}
try {
  const here = path.dirname(fileURLToPath(import.meta.url));
  runMigrations({
    databaseUrl: env.DATABASE_URL,
    migrationsFolder: path.resolve(here, '..', 'migrations'),
  });
  console.warn('[api] migrations applied');
  // Auto-seed if DB is empty (first run)
  const testDb = openDb(env.DATABASE_URL);
  const userCount = testDb.db.select().from((await import('./db/schema.js')).users).all().length;
  testDb.close();
  if (userCount === 0) {
    runSeed({
      databaseUrl: env.DATABASE_URL,
      allowedEmails: env.AUTH_ALLOWED_EMAILS,
      mcpBibleUrl: process.env.MCP_BIBLE_URL ?? 'http://bible-mcp:7801',
    });
    console.warn('[api] seed applied (first run)');
  }
} catch (err) {
  console.warn('[api] migration skipped:', (err as Error).message);
}

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
