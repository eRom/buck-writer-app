import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildApp, type AppDeps } from '../app.js';
import { openDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { createJwtService } from '../services/jwt.js';
import { loadPrompts } from '../services/prompts.js';
import { newId } from '@buck/shared';
import { sha256Hex } from '../utils/crypto.js';
import { users, sessionsAuth, chatSessions } from '../db/schema.js';

// Mock OpenAI fetch — returns a minimal streaming SSE payload with a final
// chunk carrying usage + finish_reason. Non-streaming requests (title
// generation) return a plain JSON body.
const STREAM_SSE =
  'data: {"choices":[{"delta":{"content":"Hello! I am Buck."},"finish_reason":null}]}\n\n' +
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n' +
  'data: [DONE]\n\n';

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.includes('api.openai.com')) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    const body = typeof init?.body === 'string' ? init.body : '';
    let isStream = false;
    try {
      const parsed = JSON.parse(body);
      isStream = parsed.stream === true;
    } catch {
      // ignore
    }
    if (isStream) {
      return new Response(STREAM_SSE, {
        headers: { 'content-type': 'text/event-stream' },
      });
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: 'Test title' } }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CSRF_TOKEN = 'test-csrf-token-abc123';

function tmp() {
  return path.join(
    os.tmpdir(),
    `buck-chat-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );
}

function tmpPromptsDir() {
  const dir = path.join(
    os.tmpdir(),
    `buck-prompts-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SYSTEM.md'), 'You are Buck, a helpful assistant.');
  fs.writeFileSync(path.join(dir, 'RULES.md'), 'Be concise.');
  return dir;
}

interface TestCtx {
  dbPath: string;
  promptsDir: string;
  app: ReturnType<typeof buildApp>;
  sessionJwt: string;
  userId: string;
  db: ReturnType<typeof openDb>;
}

async function makeCtx(tsOverride?: number): Promise<TestCtx> {
  const dbPath = tmp();
  const promptsDirPath = tmpPromptsDir();
  const url = `file:${dbPath}`;
  runMigrations({ databaseUrl: url, migrationsFolder: migrationsDir });
  runSeed({
    databaseUrl: url,
    allowedEmails: ['alice@example.com'],
    mcpBibleUrl: 'http://bible-mcp:7801',
  });
  const db = openDb(url);
  const jwt = createJwtService({
    secret: 'a'.repeat(32),
    issuer: 'buck',
    audience: 'buck-web',
  });
  const email = { sendMagicLink: vi.fn(async () => {}) };

  // Find alice's userId
  const allUsers = db.db.select().from(users).all();
  const alice = allUsers.find((u) => u.email === 'alice@example.com');
  if (!alice) throw new Error('alice not found in seed');
  const userId = alice.id;

  // Create a JWT session directly
  const ts = tsOverride ?? Date.now();
  const sessionJwt = await jwt.sign({ sub: userId, scope: 'app' }, '30d');
  const sessionHash = sha256Hex(sessionJwt);
  db.db
    .insert(sessionsAuth)
    .values({
      id: newId(),
      userId,
      tokenHash: sessionHash,
      scope: 'app',
      expiresAt: ts + SESSION_TTL_MS,
      createdAt: ts,
    })
    .run();

  const prompts = loadPrompts(promptsDirPath);

  const deps: AppDeps = {
    db,
    email,
    jwt,
    allowedEmails: ['alice@example.com'],
    publicBaseUrl: 'https://buck.example.com',
    nowMs: () => ts,
    prompts: { current: prompts },
    openaiApiKey: 'sk-test-fake-key',
  };

  const app = buildApp(deps);
  return { dbPath, promptsDir: promptsDirPath, app, sessionJwt, userId, db };
}

// Helper: authenticated headers for POST (includes CSRF)
function authMutHeaders(sessionJwt: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    cookie: `buck_session=${sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
    'x-csrf-token': CSRF_TOKEN,
  };
}

describe('chat route', () => {
  let ctx: TestCtx;

  afterEach(() => {
    if (ctx?.dbPath && fs.existsSync(ctx.dbPath)) {
      fs.unlinkSync(ctx.dbPath);
    }
    if (ctx?.promptsDir && fs.existsSync(ctx.promptsDir)) {
      fs.rmSync(ctx.promptsDir, { recursive: true, force: true });
    }
  });

  describe('POST /api/chat', () => {
    it('returns streaming response (200, content-type: text/event-stream)', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/chat', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello!' }],
        }),
      });
      expect(res.status).toBe(200);
      const contentType = res.headers.get('content-type');
      expect(contentType).toContain('text/event-stream');
    });

    it('creates session implicitly when no sessionId (check x-session-id header)', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/chat', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello, start a new chat!' }],
        }),
      });
      expect(res.status).toBe(200);
      const sessionIdHeader = res.headers.get('x-session-id');
      expect(sessionIdHeader).toBeTruthy();
      expect(typeof sessionIdHeader).toBe('string');
    });

    it('returns 401 without auth', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `buck_csrf=${CSRF_TOKEN}`,
          'x-csrf-token': CSRF_TOKEN,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello!' }],
        }),
      });
      expect(res.status).toBe(401);
    });

    it('returns 422 when no messages provided', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/chat', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(422);
    });

    it('returns 404 for non-existent sessionId', async () => {
      ctx = await makeCtx();
      const fakeSessionId = '00000000-0000-0000-0000-000000000000';
      const res = await ctx.app.request('/api/chat', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({
          sessionId: fakeSessionId,
          messages: [{ role: 'user', content: 'Hello!' }],
        }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/chat — with references', () => {
    it('accepts references in request body without error', async () => {
      ctx = await makeCtx();
      const sessionId = newId();
      ctx.db.db.insert(chatSessions).values({
        id: sessionId, userId: ctx.userId, title: 'Test',
        model: 'gpt-5.4-mini', reasoningEffort: 'low', archived: 0,
        createdAt: Date.now(), updatedAt: Date.now(),
      }).run();

      const res = await ctx.app.request('/api/chat', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({
          sessionId,
          messages: [{ role: 'user', content: 'What does this file say?' }],
          references: [{ path: 'notes.md', content: '# My Notes\n\nHello' }],
        }),
      });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/chat — with attachmentIds', () => {
    it('accepts attachmentIds in request body without error', async () => {
      ctx = await makeCtx();
      const sessionId = newId();
      ctx.db.db.insert(chatSessions).values({
        id: sessionId, userId: ctx.userId, title: 'Test',
        model: 'gpt-5.4-mini', reasoningEffort: 'low', archived: 0,
        createdAt: Date.now(), updatedAt: Date.now(),
      }).run();

      const res = await ctx.app.request('/api/chat', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({
          sessionId,
          messages: [{ role: 'user', content: 'Check this file' }],
          attachmentIds: ['non-existent-id'],
        }),
      });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/chat — memory', () => {
    it('emits memory_status SSE event when memory context is degraded', async () => {
      ctx = await makeCtx();
      // Rebuild the app with a memory stub in degraded mode.
      const memoryStub = {
        enabled: true,
        supabase: null,
        buildContext: async () => ({ preferences: { lang: 'fr' }, activeContext: {}, degraded: true }),
        remember: { remember: async () => ({ ok: true as const }), drain: async () => {}, bufferSize: () => 0, bufferSnapshot: () => [], __setClientForTest: () => {} },
        recall: { recall: async () => [] },
        state: { set: async () => {} },
        syncUsage: async () => 0,
        drainRetryBuffer: async () => {},
      } as unknown as AppDeps['memory'];

      const prompts = loadPrompts(ctx.promptsDir);
      const appWithMemory = buildApp({
        db: ctx.db,
        email: { sendMagicLink: vi.fn(async () => {}) },
        jwt: createJwtService({ secret: 'a'.repeat(32), issuer: 'buck', audience: 'buck-web' }),
        allowedEmails: ['alice@example.com'],
        publicBaseUrl: 'https://buck.example.com',
        prompts: { current: prompts },
        openaiApiKey: 'sk-test-fake-key',
        memory: memoryStub,
      });

      const res = await appWithMemory.request('/api/chat', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello!' }],
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('event: memory_status');
      expect(body).toContain('"degraded":true');
    });
  });

  describe('POST /api/chat — tool approval flow', () => {
    it('passes toolApproval field through without error', async () => {
      ctx = await makeCtx();
      const sessionId = newId();
      ctx.db.db.insert(chatSessions).values({
        id: sessionId, userId: ctx.userId, title: 'Test',
        model: 'gpt-5.4-mini', reasoningEffort: 'low', archived: 0,
        createdAt: Date.now(), updatedAt: Date.now(),
      }).run();

      const res = await ctx.app.request('/api/chat', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({
          sessionId,
          messages: [{ role: 'user', content: 'Run ls' }],
          toolApproval: {
            toolCallId: 'call_123',
            toolName: 'shell_execute',
            args: { command: 'ls -la' },
            approved: true,
          },
        }),
      });
      expect(res.status).toBe(200);
    });
  });
});
