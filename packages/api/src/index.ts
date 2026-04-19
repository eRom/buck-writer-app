import { serve } from '@hono/node-server';
import { Resend } from 'resend';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadEnv } from './env.js';
import { openDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { runSeed, runMcpSeed } from './db/seed.js';
import { users } from './db/schema.js';
import { createJwtService } from './services/jwt.js';
import {
  createEmailService,
  createE2EEmailService,
} from './services/email.js';
import { loadPrompts, bootstrapPrompts, createPromptsWatcher, type PromptsRef } from './services/prompts.js';
import { loadSkills, createSkillsWatcher } from './services/skills.js';
import { applyMcpToolClassifications } from './services/mcp-classifier.js';
import { createUsageTracker } from './services/realtime/usage-tracker.js';
import { bootstrapMemory } from './services/memory/bootstrap.js';
import { usageEvents, userSettings } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { newId } from '@buck/shared';


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
  const userCount = testDb.db.select().from(users).all().length;
  testDb.sqlite.close();
  if (userCount === 0) {
    runSeed({
      databaseUrl: env.DATABASE_URL,
      allowedEmails: env.AUTH_ALLOWED_EMAILS,
      mcpBibleUrl: process.env.MCP_BIBLE_URL ?? 'http://bible-mcp:7801',
      mcpWritingToolsUrl: process.env.MCP_WRITING_TOOLS_URL,
    });
    console.warn('[api] seed applied (first run)');
  } else {
    // Refresh MCP servers config on every boot (idempotent upsert). Lets
    // URL / require_approval / auth_header_env changes propagate without
    // a manual DB edit.
    runMcpSeed({
      databaseUrl: env.DATABASE_URL,
      mcpBibleUrl: process.env.MCP_BIBLE_URL ?? 'http://bible-mcp:7801',
      mcpWritingToolsUrl: process.env.MCP_WRITING_TOOLS_URL,
    });
    console.warn('[api] mcp_servers refreshed');
  }
} catch (err) {
  console.warn('[api] migration skipped:', (err as Error).message);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const systemsDir = path.resolve(env.WORKSPACE_DIR, 'systems');
const defaultsDir = path.resolve(here, 'defaults', 'systems');

bootstrapPrompts(systemsDir, defaultsDir);

let promptsData;
try {
  promptsData = loadPrompts(systemsDir);
} catch (err) {
  console.error('[api] failed to load prompts:', (err as Error).message);
  process.exit(1);
}

const promptsRef: PromptsRef = { current: promptsData };
// Load workspace skills (hot-reloaded via chokidar watcher)
const skills = await loadSkills(env.WORKSPACE_DIR);
console.warn(`[api] skills loaded (${skills.size})`);

// MCP servers are now remote connectors declared via tools[] in each
// Responses API request (see packages/api/src/services/mcp-registry.ts).
// No startup health check — OpenAI handles the roundtrip and propagates
// mcp_call.failed events back if a server is unreachable.

if (process.env.NODE_ENV !== 'test') {
  const skillsWatcher = createSkillsWatcher(env.WORKSPACE_DIR, (reloaded) => {
    skills.clear();
    for (const [k, v] of reloaded) skills.set(k, v);
    console.warn(`[api] skills reloaded (${skills.size})`);
  });

  const stopPromptsWatcher = createPromptsWatcher(systemsDir, (p) => {
    console.warn('[api] prompts reloaded');
    promptsRef.current = p;
  });

  const shutdown = (): void => {
    skillsWatcher.close().catch(() => {});
    stopPromptsWatcher();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const handles = openDb(env.DATABASE_URL);

// Realtime usage tracker + periodic GC
const usageTracker = createUsageTracker({ nowMs: Date.now, staleMs: 120_000 });
const realtimeGc = setInterval(() => {
  const dropped = usageTracker.gc();
  if (dropped.length) console.warn('[api] realtime.usage.gc', { dropped });
}, 60_000);
realtimeGc.unref?.();

// Classify core MCP tools (read vs write) — patches require_approval so OpenAI
// only asks approval for write tools. Runs best-effort; falls back to seed
// default on failure. Don't block boot.
void applyMcpToolClassifications(handles).catch((err: unknown) => {
  console.warn('[api] mcp classification skipped:', (err as Error).message);
});

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

const memory = bootstrapMemory({
  env,
  insertUsageEvent: async (r) => {
    const promptTokens = 'promptTokens' in r ? r.promptTokens : 0;
    const completionTokens = 'completionTokens' in r ? r.completionTokens : 0;
    // Map memory userId (BUCK_USER_ID Supabase) → real SQLite user_id (FK constraint).
    // Solo-per-instance: use the first/only user row.
    const row = handles.db.select({ id: users.id }).from(users).limit(1).get();
    if (!row) {
      console.warn('[memory:usage] no SQLite user found, skipping usage_events insert');
      return;
    }
    handles.db
      .insert(usageEvents)
      .values({
        id: newId(),
        userId: row.id,
        sessionId: null,
        createdAt: Date.now(),
        model: r.model,
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        reasoningTokens: 0,
        audioInputSeconds: 0,
        audioOutputSeconds: 0,
        costUsd: r.costUsd,
      })
      .run();
  },
  readUsageCursor: async () => {
    if (!env.BUCK_USER_ID) return new Date(0);
    const row = handles.db
      .select({ cursor: userSettings.memoryUsageSyncCursor })
      .from(userSettings)
      .where(eq(userSettings.userId, env.BUCK_USER_ID))
      .get();
    return row?.cursor ?? new Date(0);
  },
  writeUsageCursor: async (d) => {
    if (!env.BUCK_USER_ID) return;
    handles.db
      .update(userSettings)
      .set({ memoryUsageSyncCursor: d })
      .where(eq(userSettings.userId, env.BUCK_USER_ID))
      .run();
  },
  tokenCounter: (s: string) => Math.ceil(s.length / 4),
});

if (memory.enabled && process.env.NODE_ENV !== 'test') {
  setInterval(() => { memory.drainRetryBuffer().catch(() => {}); }, 30_000);
  setInterval(() => { memory.syncUsage().catch(() => {}); }, 6 * 60 * 60 * 1000);
  console.warn('[api] memory enabled (Supabase)');
}

const app = buildApp({
  db: handles,
  email,
  jwt,
  allowedEmails: env.AUTH_ALLOWED_EMAILS,
  publicBaseUrl: env.PUBLIC_BASE_URL,
  webDistRoot: process.env.WEB_DIST_ROOT,
  prompts: promptsRef,
  openaiApiKey: env.OPENAI_API_KEY,
  workspaceDir: env.WORKSPACE_DIR,
  skills,
  memory,
  buckUserId: env.BUCK_USER_ID,
  trustProxy: env.TRUST_PROXY,
  cookieDomain: env.COOKIE_DOMAIN,
  realtimeEnabled: process.env.REALTIME_ENABLED === '1',
  usageTracker,
});

serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, (info) => {
  console.warn(`[api] listening on http://${info.address}:${info.port}`);
});
