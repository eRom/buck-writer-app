import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import {
  newId,
  isTtsVoice,
  costOfTts,
  TTS_MODEL,
  type TtsPostResponse,
} from '@buck/shared';
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
import { synthesize } from '../services/tts/gemini-client.js';
import type { SynthesizeDeps } from '../services/tts/gemini-client.js';
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

// Whitelist matches the ID generator (ULID/UUID). Guards against a crafted
// `messageId` leaking path separators into relativeAudioPath.
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;

function assertSafeId(value: string, field: string): void {
  if (!SAFE_ID_RE.test(value)) {
    throw new HttpError(400, 'invalid_id', `${field} has invalid format`);
  }
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

// Guard against Gemini returning an empty/invalid PCM buffer — NaN or zero
// duration must not leak into NOT NULL columns.
function safeDuration(sec: number): number | null {
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return sec;
}

export function createTtsRoutes(
  deps: TtsRoutesDeps,
): Hono<{ Variables: { userId: string } }> {
  const app = new Hono<{ Variables: { userId: string } }>();
  const now = deps.nowMs ?? Date.now;

  app.post('/:messageId', async (c) => {
    const userId = c.get('userId');
    const messageId = c.req.param('messageId');
    assertSafeId(messageId, 'messageId');

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
      const resp: TtsPostResponse = {
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
    const durationSec = safeDuration(result.durationSec);
    const costUsd = costOfTts({
      inputTextTokens: result.inputTextTokens,
      outputAudioTokens: result.outputAudioTokens,
    });

    // Atomic cache write + usage recording. Concurrent POSTs race past the
    // cacheHit check above; the UNIQUE (message_id, voice) index is the only
    // real serializer. We use INSERT OR IGNORE so the loser of the race gets
    // a graceful cached-row response instead of a 500.
    const raceResolution = deps.db.sqlite.transaction(() => {
      const inserted = deps.db.db
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
          durationSec,
          createdAt,
        })
        .onConflictDoNothing({
          target: [ttsAudioCache.messageId, ttsAudioCache.voice],
        })
        .returning({ id: ttsAudioCache.id })
        .all();

      if (inserted.length === 0) {
        // Another concurrent request won — do not charge this one.
        return { won: false as const };
      }
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
          audioOutputSeconds: durationSec ?? 0,
          costUsd,
          kind: 'tts',
        })
        .run();
      return { won: true as const };
    })();

    if (!raceResolution.won) {
      // Best effort — clean up our orphaned file since the winner already
      // wrote its own.
      try {
        await fs.unlink(absPath);
      } catch {
        // noop
      }
      const existing = deps.db.db
        .select({ durationSec: ttsAudioCache.durationSec })
        .from(ttsAudioCache)
        .where(
          and(
            eq(ttsAudioCache.messageId, messageId),
            eq(ttsAudioCache.voice, voice),
          ),
        )
        .get();
      const resp: TtsPostResponse = {
        url: `/api/tts/${messageId}/audio?voice=${voice}`,
        voice,
        durationSec: existing?.durationSec ?? null,
        cached: true,
        costUsd: 0,
      };
      return c.json(resp);
    }

    const resp: TtsPostResponse = {
      url: `/api/tts/${messageId}/audio?voice=${voice}`,
      voice,
      durationSec,
      cached: false,
      costUsd,
    };
    return c.json(resp);
  });

  app.get('/:messageId/audio', async (c) => {
    const userId = c.get('userId');
    const messageId = c.req.param('messageId');
    assertSafeId(messageId, 'messageId');
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

// Deletes all TTS audio files + rows belonging to a user. Intended for
// cascade deletion when a session/message is permanently removed (the DB FK
// cascades the rows, but we must remove the WAVs from disk ourselves).
export async function purgeUserTtsByMessages(
  deps: { db: DbHandles; workspaceDir: string },
  messageIds: string[],
): Promise<void> {
  if (messageIds.length === 0) return;
  const rows = deps.db.db
    .select({ id: ttsAudioCache.id, audioPath: ttsAudioCache.audioPath })
    .from(ttsAudioCache)
    .where(sql`${ttsAudioCache.messageId} IN (${sql.join(messageIds.map((id) => sql`${id}`), sql`, `)})`)
    .all();
  for (const r of rows) {
    try {
      const abs = await assertSafePath(deps.workspaceDir, r.audioPath);
      await fs.unlink(abs);
    } catch {
      // best effort
    }
  }
  // DB rows are removed via FK cascade when the parent row disappears.
}
