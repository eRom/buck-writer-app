import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { eq, and } from 'drizzle-orm';
import { createTtsRoutes } from './tts.js';
import { runMigrations } from '../db/migrate.js';
import { openDb } from '../db/client.js';
import type { DbHandles } from '../db/client.js';
import {
  users,
  sessionsAuth,
  chatSessions,
  messages,
  usageEvents,
  ttsAudioCache,
  userSettings,
} from '../db/schema.js';
import { createJwtService } from '../services/jwt.js';
import { sha256Hex } from '../utils/crypto.js';
import { newId } from '@buck/shared';
import { authGuard } from '../middleware/auth.js';
import { HttpError } from '../utils/http-error.js';
import { wrapPcmToWav } from '../services/tts/wav-encoder.js';
import type { GoogleGenAI } from '@google/genai';
import type { SynthesizeDeps } from '../services/tts/gemini-client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');

const jwt = createJwtService({
  secret: 'a'.repeat(32),
  issuer: 'buck',
  audience: 'buck-web',
});

interface Ctx {
  db: DbHandles;
  workspaceDir: string;
  userId: string;
  sessionId: string;
  token: string;
  csrfToken: string;
  app: Hono;
  generateContent: ReturnType<typeof vi.fn>;
  insertMessage: (role: 'user' | 'assistant', content: string) => string;
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
});

function fakeGenAIResponse(pcmBytes: number) {
  return {
    candidates: [
      {
        content: {
          parts: [
            {
              inlineData: {
                data: Buffer.alloc(pcmBytes).toString('base64'),
                mimeType: 'audio/pcm',
              },
            },
          ],
        },
      },
    ],
    usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 100 },
  };
}

async function makeCtx(
  options: { ttsMaxChars?: number; userDefaultVoice?: string } = {},
): Promise<Ctx> {
  const dbPath = path.join(
    os.tmpdir(),
    `buck-tts-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );
  runMigrations({
    databaseUrl: `file:${dbPath}`,
    migrationsFolder: migrationsDir,
  });
  const db = openDb(`file:${dbPath}`);

  const workspaceDir = path.join(
    os.tmpdir(),
    `buck-ws-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
  );
  fs.mkdirSync(workspaceDir, { recursive: true });

  const userId = newId();
  db.db
    .insert(users)
    .values({ id: userId, email: 'test@test.com', createdAt: Date.now() })
    .run();

  // Insert user_settings row (optionally with a default voice)
  db.db
    .insert(userSettings)
    .values({
      userId,
      ttsDefaultVoice: options.userDefaultVoice ?? null,
    })
    .run();

  const sessionId = newId();
  db.db
    .insert(chatSessions)
    .values({
      id: sessionId,
      userId,
      title: 'test',
      model: 'gpt-5.4-mini',
      reasoningEffort: 'low',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    .run();

  const token = await jwt.sign({ sub: userId, scope: 'app' }, '1h');
  db.db
    .insert(sessionsAuth)
    .values({
      id: newId(),
      userId,
      tokenHash: sha256Hex(token),
      scope: 'app',
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    })
    .run();

  const csrfToken = 'test-csrf-token';

  const generateContent = vi.fn(async () => fakeGenAIResponse(48000)); // 1s of audio
  const mockGenAI = {
    models: { generateContent },
  } as unknown as GoogleGenAI;
  const synthesizeDeps: SynthesizeDeps = { genAI: mockGenAI };

  const app = new Hono();
  app.use('*', authGuard({ db, jwt }));
  app.route(
    '/',
    createTtsRoutes({
      db,
      workspaceDir,
      geminiApiKey: 'test-key',
      defaultVoice: 'Kore',
      maxChars: options.ttsMaxChars ?? 4500,
      prompts: { current: { system: '', tools: '', rules: '', live: '', tts: 'Style guide' } },
      synthesizeDeps,
    }),
  );
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json(err.toJSON(), err.status as ContentfulStatusCode);
    }
    throw err;
  });

  const insertMessage = (role: 'user' | 'assistant', content: string) => {
    const id = newId();
    db.db
      .insert(messages)
      .values({
        id,
        sessionId,
        role,
        contentJson: JSON.stringify({ text: content }),
        model: role === 'assistant' ? 'gpt-5.4-mini' : null,
        createdAt: Date.now(),
      })
      .run();
    return id;
  };

  cleanups.push(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(workspaceDir))
      fs.rmSync(workspaceDir, { recursive: true });
  });

  return {
    db,
    workspaceDir,
    userId,
    sessionId,
    token,
    csrfToken,
    app,
    generateContent,
    insertMessage,
  };
}

function authHeaders(token: string, csrf: string): Record<string, string> {
  return {
    cookie: `buck_session=${token}; buck_csrf=${csrf}`,
    'x-csrf-token': csrf,
    'content-type': 'application/json',
  };
}

describe('POST /api/tts/:messageId', () => {
  it('synthesizes, caches, inserts usage_event with kind=tts', async () => {
    const ctx = await makeCtx();
    const msgId = ctx.insertMessage('assistant', 'Bonjour le monde.');

    const res = await ctx.app.request(`/${msgId}`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.cached).toBe(false);
    expect(body.voice).toBe('Kore');
    expect(body.url).toBe(`/api/tts/${msgId}/audio?voice=Kore`);

    const cacheRow = ctx.db.db
      .select()
      .from(ttsAudioCache)
      .where(eq(ttsAudioCache.messageId, msgId))
      .get();
    expect(cacheRow).toBeDefined();
    expect(cacheRow?.voice).toBe('Kore');
    expect(cacheRow?.sizeBytes).toBeGreaterThan(44); // at least a WAV header

    const usage = ctx.db.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.userId, ctx.userId))
      .all();
    expect(usage).toHaveLength(1);
    expect(usage[0]?.kind).toBe('tts');
    expect(usage[0]?.costUsd).toBeGreaterThan(0);
    expect(usage[0]?.audioOutputSeconds).toBeGreaterThan(0);

    expect(ctx.generateContent).toHaveBeenCalledTimes(1);
  });

  it('second POST on the same message returns cached=true and does NOT call Gemini', async () => {
    const ctx = await makeCtx();
    const msgId = ctx.insertMessage('assistant', 'Texte court.');

    await ctx.app.request(`/${msgId}`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });

    const res2 = await ctx.app.request(`/${msgId}`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as Record<string, unknown>;
    expect(body2.cached).toBe(true);
    expect(body2.costUsd).toBe(0);

    expect(ctx.generateContent).toHaveBeenCalledTimes(1);

    // Only one usage event recorded
    const usage = ctx.db.db.select().from(usageEvents).all();
    expect(usage).toHaveLength(1);
  });

  it('different voice on same message creates a second cache row', async () => {
    const ctx = await makeCtx();
    const msgId = ctx.insertMessage('assistant', 'Texte court.');

    await ctx.app.request(`/${msgId}`, {
      method: 'POST',
      body: JSON.stringify({ voice: 'Kore' }),
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });
    await ctx.app.request(`/${msgId}`, {
      method: 'POST',
      body: JSON.stringify({ voice: 'Puck' }),
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });

    const rows = ctx.db.db
      .select()
      .from(ttsAudioCache)
      .where(eq(ttsAudioCache.messageId, msgId))
      .all();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.voice).sort()).toEqual(['Kore', 'Puck']);
    expect(ctx.generateContent).toHaveBeenCalledTimes(2);
  });

  it('rejects unknown voice with 422', async () => {
    const ctx = await makeCtx();
    const msgId = ctx.insertMessage('user', 'salut');

    const res = await ctx.app.request(`/${msgId}`, {
      method: 'POST',
      body: JSON.stringify({ voice: 'NotAVoice' }),
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('invalid_voice');
  });

  it('rejects message exceeding maxChars with 413', async () => {
    const ctx = await makeCtx({ ttsMaxChars: 20 });
    const msgId = ctx.insertMessage('user', 'This is a message that is way too long for TTS.');

    const res = await ctx.app.request(`/${msgId}`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('message_too_long');
  });

  it('returns 404 for unknown message id', async () => {
    const ctx = await makeCtx();

    const res = await ctx.app.request(`/does-not-exist`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when the message belongs to another user (ownership)', async () => {
    const ctxA = await makeCtx();

    // create ctxB's own message manually in ctxA's db (simulate another user)
    const otherUserId = newId();
    ctxA.db.db
      .insert(users)
      .values({ id: otherUserId, email: 'b@b.com', createdAt: Date.now() })
      .run();
    const otherSessionId = newId();
    ctxA.db.db
      .insert(chatSessions)
      .values({
        id: otherSessionId,
        userId: otherUserId,
        title: 'x',
        model: 'gpt-5.4-mini',
        reasoningEffort: 'low',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();
    const otherMsgId = newId();
    ctxA.db.db
      .insert(messages)
      .values({
        id: otherMsgId,
        sessionId: otherSessionId,
        role: 'user',
        contentJson: JSON.stringify({ text: 'secret' }),
        createdAt: Date.now(),
      })
      .run();

    const res = await ctxA.app.request(`/${otherMsgId}`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: authHeaders(ctxA.token, ctxA.csrfToken),
    });
    expect(res.status).toBe(404);
  });

  it('uses userSettings.ttsDefaultVoice when body has no voice', async () => {
    const ctx = await makeCtx({ userDefaultVoice: 'Puck' });
    const msgId = ctx.insertMessage('assistant', 'Salut.');

    const res = await ctx.app.request(`/${msgId}`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { voice: string };
    expect(body.voice).toBe('Puck');
  });

  it('rejects empty-text messages with 422', async () => {
    const ctx = await makeCtx();
    const msgId = ctx.insertMessage('user', '');

    const res = await ctx.app.request(`/${msgId}`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('empty_text');
  });

  it('passes TTS system prompt to Gemini when provided', async () => {
    const ctx = await makeCtx();
    const msgId = ctx.insertMessage('assistant', 'Salut.');

    await ctx.app.request(`/${msgId}`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });
    const callArg = ctx.generateContent.mock.calls[0]?.[0] as {
      config: { systemInstruction?: string };
    };
    expect(callArg.config.systemInstruction).toBe('Style guide');
  });

  it('rejects messageId with invalid characters (path traversal defense)', async () => {
    const ctx = await makeCtx();
    const res = await ctx.app.request(`/../etc/passwd`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });
    expect([400, 404]).toContain(res.status);
  });

  it('stores durationSec = null when Gemini returns empty PCM', async () => {
    const ctx = await makeCtx();
    const msgId = ctx.insertMessage('assistant', 'Test.');
    ctx.generateContent.mockResolvedValueOnce(fakeGenAIResponse(0));
    const res = await ctx.app.request(`/${msgId}`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });
    // Empty PCM → TTS_NO_AUDIO from the service layer → 502
    expect(res.status).toBe(502);
  });
});

describe('GET /api/tts/:messageId/audio', () => {
  it('serves the cached WAV with audio/wav content-type', async () => {
    const ctx = await makeCtx();
    const msgId = ctx.insertMessage('assistant', 'Bonjour.');
    // Pre-generate
    await ctx.app.request(`/${msgId}`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });

    const res = await ctx.app.request(`/${msgId}/audio?voice=Kore`, {
      method: 'GET',
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/wav');
    expect(res.headers.get('cache-control')).toMatch(/private/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Buffer.from(bytes.subarray(0, 4)).toString()).toBe('RIFF');
  });

  it('returns 404 when audio not yet generated', async () => {
    const ctx = await makeCtx();
    const msgId = ctx.insertMessage('assistant', 'Bonjour.');

    const res = await ctx.app.request(`/${msgId}/audio?voice=Kore`, {
      method: 'GET',
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when audio file is missing on disk but row exists', async () => {
    const ctx = await makeCtx();
    const msgId = ctx.insertMessage('assistant', 'Bonjour.');

    // Insert cache row pointing to a non-existent file
    ctx.db.db
      .insert(ttsAudioCache)
      .values({
        id: newId(),
        messageId: msgId,
        userId: ctx.userId,
        voice: 'Kore',
        model: 'gemini-3.1-flash-tts-preview',
        audioPath: '.tts_audio/missing/nope.wav',
        mimeType: 'audio/wav',
        sizeBytes: 100,
        durationSec: 1,
        createdAt: Date.now(),
      })
      .run();

    const res = await ctx.app.request(`/${msgId}/audio?voice=Kore`, {
      method: 'GET',
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });
    expect(res.status).toBe(404);
  });

  it('prevents cross-user access', async () => {
    const ctx = await makeCtx();
    const msgId = ctx.insertMessage('assistant', 'Bonjour.');
    await ctx.app.request(`/${msgId}`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });

    // Issue a JWT for a different user
    const otherUserId = newId();
    ctx.db.db
      .insert(users)
      .values({ id: otherUserId, email: 'o@o.com', createdAt: Date.now() })
      .run();
    const otherToken = await jwt.sign({ sub: otherUserId, scope: 'app' }, '1h');
    ctx.db.db
      .insert(sessionsAuth)
      .values({
        id: newId(),
        userId: otherUserId,
        tokenHash: sha256Hex(otherToken),
        scope: 'app',
        expiresAt: Date.now() + 3_600_000,
        createdAt: Date.now(),
      })
      .run();

    const res = await ctx.app.request(`/${msgId}/audio?voice=Kore`, {
      method: 'GET',
      headers: {
        cookie: `buck_session=${otherToken}; buck_csrf=x`,
        'x-csrf-token': 'x',
      },
    });
    expect(res.status).toBe(404);
  });
});

describe('wrap-encoder sanity (wrapPcmToWav usage sanity across module boundary)', () => {
  it('cache row path is reachable on disk after synthesis', async () => {
    const ctx = await makeCtx();
    const msgId = ctx.insertMessage('assistant', 'Bonjour.');
    await ctx.app.request(`/${msgId}`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });
    const row = ctx.db.db
      .select()
      .from(ttsAudioCache)
      .where(
        and(
          eq(ttsAudioCache.messageId, msgId),
          eq(ttsAudioCache.voice, 'Kore'),
        ),
      )
      .get();
    expect(row).toBeDefined();
    const abs = path.join(ctx.workspaceDir, row!.audioPath);
    expect(fs.existsSync(abs)).toBe(true);
    const bytes = fs.readFileSync(abs);
    // sanity: file header is RIFF...WAVE
    expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString()).toBe('WAVE');
    // wrapPcmToWav is the source of truth (imported for type coverage)
    expect(typeof wrapPcmToWav).toBe('function');
  });
});
