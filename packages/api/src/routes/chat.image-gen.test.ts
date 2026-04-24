import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { buildApp, type AppDeps } from '../app.js';
import { openDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { createJwtService } from '../services/jwt.js';
import { loadPrompts } from '../services/prompts.js';
import { newId } from '@buck/shared';
import { sha256Hex } from '../utils/crypto.js';
import {
  users,
  sessionsAuth,
  userSettings,
  messages,
  usageEvents,
} from '../db/schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CSRF_TOKEN = 'test-csrf-token-abc123';

function tmp() {
  return path.join(
    os.tmpdir(),
    `buck-chat-imgen-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );
}

function tmpPromptsDir() {
  const dir = path.join(
    os.tmpdir(),
    `buck-prompts-imgen-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SYSTEM.md'), 'You are Buck.');
  fs.writeFileSync(path.join(dir, 'RULES.md'), 'Be concise.');
  return dir;
}

// Fixture: streaming response with 2 partial images + 1 completed image.
function buildImageStreamSSE(): string {
  return [
    'event: response.created',
    'data: {"type":"response.created","response":{"id":"resp_img_1"}}',
    '',
    'event: response.output_item.added',
    'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"image_generation_call","id":"ig_abc123"}}',
    '',
    'event: response.image_generation_call.generating',
    'data: {"type":"response.image_generation_call.generating","output_index":0,"item_id":"ig_abc123","sequence_number":1}',
    '',
    'event: response.image_generation_call.partial_image',
    'data: {"type":"response.image_generation_call.partial_image","output_index":0,"item_id":"ig_abc123","partial_image_index":0,"partial_image_b64":"iVBORw0KGgoP1"}',
    '',
    'event: response.image_generation_call.partial_image',
    'data: {"type":"response.image_generation_call.partial_image","output_index":0,"item_id":"ig_abc123","partial_image_index":1,"partial_image_b64":"iVBORw0KGgoP2"}',
    '',
    'event: response.image_generation_call.completed',
    'data: {"type":"response.image_generation_call.completed","output_index":0,"item_id":"ig_abc123"}',
    '',
    'event: response.output_item.done',
    'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"image_generation_call","id":"ig_abc123","status":"completed","result":"iVBORw0KGgoFINAL","revised_prompt":"A red fox in the snow"}}',
    '',
    'event: response.completed',
    'data: {"type":"response.completed","response":{"id":"resp_img_1","status":"completed","output":[],"usage":{"input_tokens":50,"output_tokens":100,"total_tokens":150}}}',
    '',
  ].join('\n');
}

interface TestCtx {
  dbPath: string;
  promptsDir: string;
  app: ReturnType<typeof buildApp>;
  sessionJwt: string;
  userId: string;
  db: ReturnType<typeof openDb>;
  capturedBodies: string[];
}

async function makeCtx(
  chatToolsOverride: Record<string, boolean> = { imageGen: true },
  settingsOverride: Partial<{ imageQuality: string; imageSize: string }> = {},
): Promise<TestCtx> {
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

  const allUsers = db.db.select().from(users).all();
  const alice = allUsers.find((u) => u.email === 'alice@example.com');
  if (!alice) throw new Error('alice not found in seed');
  const userId = alice.id;

  // Set imageGen=true in user_settings + tune quality/size if requested.
  db.db
    .update(userSettings)
    .set({
      chatToolsJson: JSON.stringify(chatToolsOverride),
      imageQuality: settingsOverride.imageQuality ?? 'medium',
      imageSize: settingsOverride.imageSize ?? '1024x1024',
    })
    .where(eq(userSettings.userId, userId))
    .run();

  const jwt = createJwtService({
    secret: 'a'.repeat(32),
    issuer: 'buck',
    audience: 'buck-web',
  });
  const ts = Date.now();
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
    email: { sendMagicLink: vi.fn(async () => {}) },
    jwt,
    allowedEmails: ['alice@example.com'],
    publicBaseUrl: 'https://buck.example.com',
    nowMs: () => ts,
    prompts: { current: prompts },
    openaiApiKey: 'sk-test-fake-key',
  };

  const app = buildApp(deps);
  return {
    dbPath,
    promptsDir: promptsDirPath,
    app,
    sessionJwt,
    userId,
    db,
    capturedBodies: [],
  };
}

function authMutHeaders(sessionJwt: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    cookie: `buck_session=${sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
    'x-csrf-token': CSRF_TOKEN,
  };
}

describe('chat route — M8B image_generation', () => {
  let ctx: TestCtx;

  beforeEach(() => {
    ctx = undefined as unknown as TestCtx;
  });

  afterEach(() => {
    if (ctx?.dbPath && fs.existsSync(ctx.dbPath)) {
      fs.unlinkSync(ctx.dbPath);
    }
    if (ctx?.promptsDir && fs.existsSync(ctx.promptsDir)) {
      fs.rmSync(ctx.promptsDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  function mockOpenAI(capturedBodies: string[], streamSse: string): void {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (!url.includes('api.openai.com')) {
          throw new Error(`Unexpected fetch: ${url}`);
        }
        const body = typeof init?.body === 'string' ? init.body : '';
        capturedBodies.push(body);
        let isStream = false;
        try {
          isStream = (JSON.parse(body) as { stream?: boolean }).stream === true;
        } catch {
          // ignore
        }
        if (isStream) {
          return new Response(streamSse, {
            headers: { 'content-type': 'text/event-stream' },
          });
        }
        return new Response(
          JSON.stringify({
            id: 'resp_title_1',
            output_text: 'Renard roux',
            usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      },
    );
  }

  it('injects image_generation tool with settings quality/size when imageGen=true', async () => {
    ctx = await makeCtx({ imageGen: true }, { imageQuality: 'high', imageSize: '1536x1024' });
    mockOpenAI(ctx.capturedBodies, buildImageStreamSSE());

    const res = await ctx.app.request('/api/chat', {
      method: 'POST',
      headers: authMutHeaders(ctx.sessionJwt),
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Dessine un renard roux' }],
      }),
    });
    expect(res.status).toBe(200);
    await res.text(); // drain

    const streamBody = ctx.capturedBodies.find((b) => b.includes('"stream":true'));
    expect(streamBody).toBeTruthy();
    const parsed = JSON.parse(streamBody!) as {
      tools?: Array<Record<string, unknown>>;
    };
    const imgTool = parsed.tools?.find((t) => t.type === 'image_generation');
    expect(imgTool).toBeDefined();
    expect(imgTool?.quality).toBe('high');
    expect(imgTool?.size).toBe('1536x1024');
    expect(imgTool?.action).toBe('auto');
    expect(imgTool?.partial_images).toBe(2);
    expect(imgTool?.output_format).toBe('png');
    expect(imgTool?.moderation).toBe('low');
  });

  it('does NOT inject image_generation tool when imageGen is off', async () => {
    ctx = await makeCtx({ imageGen: false });
    mockOpenAI(ctx.capturedBodies, buildImageStreamSSE());

    const res = await ctx.app.request('/api/chat', {
      method: 'POST',
      headers: authMutHeaders(ctx.sessionJwt),
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });
    expect(res.status).toBe(200);
    await res.text();

    const streamBody = ctx.capturedBodies.find((b) => b.includes('"stream":true'));
    const parsed = JSON.parse(streamBody!) as {
      tools?: Array<Record<string, unknown>>;
    };
    const imgTool = parsed.tools?.find((t) => t.type === 'image_generation');
    expect(imgTool).toBeUndefined();
  });

  it('relays image_partial × 2 + image_done SSE events to the client', async () => {
    ctx = await makeCtx();
    mockOpenAI(ctx.capturedBodies, buildImageStreamSSE());

    const res = await ctx.app.request('/api/chat', {
      method: 'POST',
      headers: authMutHeaders(ctx.sessionJwt),
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Dessine un renard' }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();

    // tool_started for the image_generation call
    expect(body).toContain('event: tool_started');
    expect(body).toContain('"toolName":"image_generation"');

    // 2 partial image events
    const partialCount = (body.match(/event: image_partial/g) ?? []).length;
    expect(partialCount).toBe(2);
    expect(body).toContain('"index":0');
    expect(body).toContain('"index":1');
    expect(body).toContain('iVBORw0KGgoP1');
    expect(body).toContain('iVBORw0KGgoP2');

    // 1 image_done event with revised_prompt
    expect(body).toContain('event: image_done');
    expect(body).toContain('iVBORw0KGgoFINAL');
    expect(body).toContain('A red fox in the snow');
  });

  it('persists imagesJson on the assistant message', async () => {
    ctx = await makeCtx();
    mockOpenAI(ctx.capturedBodies, buildImageStreamSSE());

    const res = await ctx.app.request('/api/chat', {
      method: 'POST',
      headers: authMutHeaders(ctx.sessionJwt),
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Dessine' }],
      }),
    });
    await res.text();

    const assistantMsg = ctx.db.db
      .select()
      .from(messages)
      .where(eq(messages.role, 'assistant'))
      .all();
    expect(assistantMsg.length).toBe(1);
    const imagesJson = assistantMsg[0]!.imagesJson;
    expect(imagesJson).toBeTruthy();
    const parsed = JSON.parse(imagesJson!) as Array<{
      callId: string;
      b64: string;
      size: string;
      revisedPrompt?: string;
    }>;
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.callId).toBe('ig_abc123');
    expect(parsed[0]!.b64).toBe('iVBORw0KGgoFINAL');
    expect(parsed[0]!.size).toBe('1024x1024');
    expect(parsed[0]!.revisedPrompt).toBe('A red fox in the snow');
  });

  it('creates a usage_events row with kind=image and correct flat cost', async () => {
    ctx = await makeCtx({ imageGen: true }, { imageQuality: 'medium', imageSize: '1024x1024' });
    mockOpenAI(ctx.capturedBodies, buildImageStreamSSE());

    const res = await ctx.app.request('/api/chat', {
      method: 'POST',
      headers: authMutHeaders(ctx.sessionJwt),
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Dessine' }],
      }),
    });
    await res.text();

    const imageEvents = ctx.db.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.kind, 'image'))
      .all();
    expect(imageEvents.length).toBe(1);
    expect(imageEvents[0]!.model).toBe('gpt-image-2');
    expect(imageEvents[0]!.costUsd).toBeCloseTo(0.053, 6);
    expect(imageEvents[0]!.userId).toBe(ctx.userId);

    // The chat-kind usage row is still there too
    const chatEvents = ctx.db.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.kind, 'chat'))
      .all();
    expect(chatEvents.length).toBe(1);
  });

  it('uses flat landscape rate when size=1536x1024', async () => {
    ctx = await makeCtx({ imageGen: true }, { imageQuality: 'high', imageSize: '1536x1024' });
    mockOpenAI(ctx.capturedBodies, buildImageStreamSSE());

    const res = await ctx.app.request('/api/chat', {
      method: 'POST',
      headers: authMutHeaders(ctx.sessionJwt),
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Dessine' }],
      }),
    });
    await res.text();

    const imageEvents = ctx.db.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.kind, 'image'))
      .all();
    expect(imageEvents.length).toBe(1);
    expect(imageEvents[0]!.costUsd).toBeCloseTo(0.165, 6);
  });
});
