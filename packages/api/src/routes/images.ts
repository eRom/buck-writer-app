import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { ImageEntry } from '@buck/shared';
import type { DbHandles } from '../db/client.js';
import { chatSessions, messages } from '../db/schema.js';
import { assertSafePath } from '../utils/path-safe.js';
import { isProtectedPath } from '../utils/protected-paths.js';
import { HttpError } from '../utils/http-error.js';

export interface ImagesRouteDeps {
  db: DbHandles;
  workspaceDir: string;
  nowMs?: () => number;
}

const SaveImageInput = z.object({
  messageId: z.string().min(1),
  callId: z.string().min(1),
  path: z.string().min(1),
});

export function createImagesRoutes(
  deps: ImagesRouteDeps,
): Hono<{ Variables: { userId: string } }> {
  const app = new Hono<{ Variables: { userId: string } }>();
  const now = deps.nowMs ?? Date.now;

  app.post('/save', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json().catch(() => null);
    const parsed = SaveImageInput.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        422,
        'invalid_input',
        parsed.error.issues[0]?.message ?? 'invalid body',
      );
    }
    const { messageId, callId, path: relPath } = parsed.data;

    if (!relPath.toLowerCase().endsWith('.png')) {
      throw new HttpError(422, 'invalid_extension', 'path must end with .png');
    }
    const protectedDir = isProtectedPath(relPath);
    if (protectedDir) {
      throw new HttpError(
        403,
        'protected_directory',
        `cannot write inside protected directory: ${protectedDir}`,
      );
    }

    // Ownership check : join messages → chat_sessions → userId
    const row = deps.db.db
      .select({
        id: messages.id,
        imagesJson: messages.imagesJson,
        sessionUserId: chatSessions.userId,
      })
      .from(messages)
      .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
      .where(and(eq(messages.id, messageId)))
      .get();

    if (!row) {
      throw new HttpError(404, 'not_found', 'message not found');
    }
    if (row.sessionUserId !== userId) {
      throw new HttpError(403, 'forbidden', 'not message owner');
    }
    if (!row.imagesJson) {
      throw new HttpError(404, 'no_images', 'message has no images');
    }

    let entries: ImageEntry[];
    try {
      entries = JSON.parse(row.imagesJson) as ImageEntry[];
    } catch {
      throw new HttpError(500, 'invalid_state', 'malformed imagesJson');
    }
    const idx = entries.findIndex((e) => e.callId === callId);
    if (idx === -1) {
      throw new HttpError(404, 'not_found', 'callId not found in message');
    }
    const entry = entries[idx]!;
    if (!entry.b64) {
      throw new HttpError(410, 'image_expired', 'image payload no longer available');
    }

    // Path safety (throws 403 if traversal / outside workspace).
    const abs = await assertSafePath(deps.workspaceDir, relPath);

    // Ensure parent dir exists.
    await fs.mkdir(path.dirname(abs), { recursive: true });

    const buffer = Buffer.from(entry.b64, 'base64');
    await fs.writeFile(abs, buffer);

    // Update entry with savedToWorkspace + persist.
    entries[idx] = {
      ...entry,
      savedToWorkspace: relPath,
    };
    deps.db.db
      .update(messages)
      .set({ imagesJson: JSON.stringify(entries) })
      .where(eq(messages.id, messageId))
      .run();

    return c.json({
      ok: true,
      path: relPath,
      absPath: abs,
      sizeBytes: buffer.byteLength,
      savedAt: now(),
    });
  });

  return app;
}
