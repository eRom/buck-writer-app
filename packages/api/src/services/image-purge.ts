import { isNotNull } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import type { ImageEntry } from '@buck/shared';
import type { DbHandles } from '../db/client.js';
import { messages } from '../db/schema.js';

export interface ImagePurgeOpts {
  db: DbHandles;
  /** Max age for images without savedToWorkspace, in ms. Default 30 days. */
  maxAgeMs?: number;
  /** Injected for tests. */
  nowMs?: () => number;
}

export interface ImagePurgeResult {
  scannedMessages: number;
  purgedImages: number;
  collapsedToNull: number;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Remove images that are older than `maxAgeMs` AND have no `savedToWorkspace`
 * from `messages.imagesJson`. Images the user chose to save are kept forever.
 * If a message has no image left after the sweep, `imagesJson` is set to NULL.
 *
 * Best-effort: malformed JSON rows are left untouched and counted as skipped
 * (they are not part of the scannedMessages delta). No exception is thrown
 * unless the DB itself errors.
 */
export function purgeOldImages(opts: ImagePurgeOpts): ImagePurgeResult {
  const now = opts.nowMs ? opts.nowMs() : Date.now();
  const cutoff = now - (opts.maxAgeMs ?? THIRTY_DAYS_MS);

  const rows = opts.db.db
    .select({ id: messages.id, imagesJson: messages.imagesJson })
    .from(messages)
    .where(isNotNull(messages.imagesJson))
    .all();

  let scannedMessages = 0;
  let purgedImages = 0;
  let collapsedToNull = 0;

  for (const row of rows) {
    if (!row.imagesJson) continue;
    scannedMessages += 1;
    let parsed: ImageEntry[];
    try {
      parsed = JSON.parse(row.imagesJson) as ImageEntry[];
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;

    const kept: ImageEntry[] = [];
    let removedHere = 0;
    for (const entry of parsed) {
      const expired =
        typeof entry.createdAt === 'number' &&
        entry.createdAt < cutoff &&
        !entry.savedToWorkspace;
      if (expired) {
        removedHere += 1;
      } else {
        kept.push(entry);
      }
    }
    if (removedHere === 0) continue;
    purgedImages += removedHere;

    if (kept.length === 0) {
      opts.db.db
        .update(messages)
        .set({ imagesJson: null })
        .where(eq(messages.id, row.id))
        .run();
      collapsedToNull += 1;
    } else {
      opts.db.db
        .update(messages)
        .set({ imagesJson: JSON.stringify(kept) })
        .where(eq(messages.id, row.id))
        .run();
    }
  }

  return { scannedMessages, purgedImages, collapsedToNull };
}
