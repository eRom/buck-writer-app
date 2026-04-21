import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { newId, isTtsVoice, costOfTts, TTS_MODEL } from '@buck/shared';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { DbHandles } from '../db/client.js';
import {
  messages,
  chatSessions,
  ttsAudioCache,
  usageEvents,
  userSettings,
} from '../db/schema.js';
import { HttpError } from '../utils/http-error.js';
import { assertSafePath } from '../utils/path-safe.js';
import { messageToPlaintext } from '../services/tts/plaintext.js';
import { synthesize, type SynthesizeDeps } from '../services/tts/gemini-client.js';
import type { PromptsRef } from '../services/prompts.js';

export interface TtsRoutesDeps {
  db: DbHandles;
  workspaceDir: string;
  geminiApiKey: string;
  defaultVoice: string;
  maxChars: number;
  prompts?: PromptsRef;
  nowMs?: () => number;
  synthesizeDeps?: SynthesizeDeps;
}

interface PostResponse {
  url: string;
  voice: string;
  durationSec: number | null;
  cached: boolean;
  costUsd: number;
}

function resolveVoice(
  body: { voice?: unknown },
  userDefault: string | null | undefined,
  envDefault: string,
): string {
  const candidate =
    (typeof body.voice === 'string' && body.voice) ||
    userDefault ||
    envDefault;
  if (!isTtsVoice(candidate)) {
    throw new HttpError(
      422,
      'invalid_voice',
      `Unknown voice: ${candidate}`,
    );
  }
  return candidate;
}

function resolveOwnedMessage(
  db: DbHandles,
  messageId: string,
  userId: string,
): { id: string; contentJson: string; sessionId: string } {
  const row = db.db
    .select({
      id: messages.id,
      contentJson: messages.contentJson,
      sessionId: messages.sessionId,
      ownerUserId: chatSessions.userId,
    })
    .from(messages)
    .innerJoin(chatSessions, eq(chatSessions.id, messages.sessionId))
    .where(eq(messages.id, messageId))
    .get();

  if (!row || row.ownerUserId !== userId) {
    throw new HttpError(404, 'not_found', 'message not found');
  }
  return { id: row.id, contentJson: row.contentJson, sessionId: row.sessionId };
}

function relativeAudioPath(userId: string, messageId: string, voice: string): string {
  return `.tts_audio/${userId}/${messageId}_${voice}.wav`;
}

export function createTtsRoutes(
  deps: TtsRoutesDeps,
): Hono<{ Variables: { userId: string } }> {
  const app = new Hono<{ Variables: { userId: string } }>();
  const now = deps.nowMs ?? Date.now;

  app.post('/:messageId', async (c) => {
    const userId = c.get('userId');
    const messageId = c.req.param('messageId');

    const body = (await c.req
      .json()
      .catch(() => ({}))) as { voice?: string };

    const userSettingsRow = deps.db.db
      .select({ defaultVoice: userSettings.ttsDefaultVoice })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .get();

    const voice = resolveVoice(body, userSettingsRow?.defaultVoice, deps.defaultVoice);

    const message = resolveOwnedMessage(deps.db, messageId, userId);

    const cacheHit = deps.db.db
      .select()
      .from(ttsAudioCache)
      .where(
        and(
          eq(ttsAudioCache.messageId, messageId),
          eq(ttsAudioCache.voice, voice),
        ),
      )
      .get();

    if (cacheHit) {
      const resp: PostResponse = {
        url: `/api/tts/${messageId}/audio?voice=${voice}`,
        voice,
        durationSec: cacheHit.durationSec,
        cached: true,
        costUsd: 0,
      };
      return c.json(resp);
    }

    const text = messageToPlaintext(message.contentJson);
    if (!text) {
      throw new HttpError(422, 'empty_text', 'message has no text to read');
    }
    if (text.length > deps.maxChars) {
      throw new HttpError(
        413,
        'message_too_long',
        `message exceeds ${deps.maxChars} characters (${text.length})`,
      );
    }

    const result = await synthesize(
      {
        apiKey: deps.geminiApiKey,
        text,
        voice,
        systemPrompt: deps.prompts?.current.tts || undefined,
      },
      deps.synthesizeDeps,
    );

    const relPath = relativeAudioPath(userId, messageId, voice);
    const absPath = await assertSafePath(deps.workspaceDir, relPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, result.wavBuffer);

    const createdAt = now();
    deps.db.db
      .insert(ttsAudioCache)
      .values({
        id: newId(),
        messageId,
        userId,
        voice,
        model: result.model,
        audioPath: relPath,
        mimeType: 'audio/wav',
        sizeBytes: result.wavBuffer.length,
        durationSec: result.durationSec,
        createdAt,
      })
      .run();

    const costUsd = costOfTts({
      inputTextTokens: result.inputTextTokens,
      outputAudioTokens: result.outputAudioTokens,
    });

    deps.db.db
      .insert(usageEvents)
      .values({
        id: newId(),
        userId,
        sessionId: message.sessionId,
        createdAt,
        model: TTS_MODEL,
        inputTokens: result.inputTextTokens,
        outputTokens: result.outputAudioTokens,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        audioInputSeconds: 0,
        audioOutputSeconds: result.durationSec,
        costUsd,
        kind: 'tts',
      })
      .run();

    const resp: PostResponse = {
      url: `/api/tts/${messageId}/audio?voice=${voice}`,
      voice,
      durationSec: result.durationSec,
      cached: false,
      costUsd,
    };
    return c.json(resp);
  });

  app.get('/:messageId/audio', async (c) => {
    const userId = c.get('userId');
    const messageId = c.req.param('messageId');
    const rawVoice = c.req.query('voice');

    const userSettingsRow = deps.db.db
      .select({ defaultVoice: userSettings.ttsDefaultVoice })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .get();

    const voice = resolveVoice(
      { voice: rawVoice },
      userSettingsRow?.defaultVoice,
      deps.defaultVoice,
    );

    const row = deps.db.db
      .select()
      .from(ttsAudioCache)
      .where(
        and(
          eq(ttsAudioCache.messageId, messageId),
          eq(ttsAudioCache.voice, voice),
          eq(ttsAudioCache.userId, userId),
        ),
      )
      .get();

    if (!row) {
      throw new HttpError(404, 'not_found', 'audio not generated');
    }

    const absPath = await assertSafePath(deps.workspaceDir, row.audioPath);
    let content: Buffer;
    try {
      content = await fs.readFile(absPath);
    } catch {
      throw new HttpError(404, 'not_found', 'audio file missing on disk');
    }

    return new Response(new Uint8Array(content), {
      status: 200,
      headers: {
        'content-type': row.mimeType,
        'cache-control': 'private, max-age=86400',
        'content-length': String(content.length),
      },
    });
  });

  return app;
}
