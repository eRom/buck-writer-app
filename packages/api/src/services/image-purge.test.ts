import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import { openDb } from '../db/client.js';
import { users, chatSessions, messages } from '../db/schema.js';
import { newId } from '@buck/shared';
import { purgeOldImages } from './image-purge.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
});

function makeDb() {
  const dbPath = path.join(
    os.tmpdir(),
    `buck-purge-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );
  runMigrations({ databaseUrl: `file:${dbPath}`, migrationsFolder: migrationsDir });
  const db = openDb(`file:${dbPath}`);
  const userId = newId();
  const sessionId = newId();
  const ts = Date.now();
  db.db.insert(users).values({ id: userId, email: 't@t.t', createdAt: ts }).run();
  db.db.insert(chatSessions).values({
    id: sessionId,
    userId,
    title: 't',
    model: 'gpt-5.4-mini',
    reasoningEffort: 'low',
    archived: 0,
    createdAt: ts,
    updatedAt: ts,
  }).run();
  cleanups.push(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });
  return { db, sessionId };
}

function insertMessage(
  db: ReturnType<typeof openDb>,
  sessionId: string,
  imagesJson: string | null,
): string {
  const id = newId();
  db.db
    .insert(messages)
    .values({
      id,
      sessionId,
      role: 'assistant',
      contentJson: JSON.stringify({ text: '' }),
      imagesJson,
      createdAt: Date.now(),
    })
    .run();
  return id;
}

describe('purgeOldImages', () => {
  const NOW = 1_800_000_000_000; // fixed "now"
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

  it('keeps recent images', () => {
    const { db, sessionId } = makeDb();
    const msgId = insertMessage(
      db,
      sessionId,
      JSON.stringify([
        {
          callId: 'ig_fresh',
          b64: 'AAAA',
          size: '1024x1024',
          createdAt: NOW - 1_000,
        },
      ]),
    );
    const res = purgeOldImages({ db, nowMs: () => NOW });
    expect(res.purgedImages).toBe(0);
    const row = db.db.select().from(messages).where(eq(messages.id, msgId)).get();
    const arr = JSON.parse(row!.imagesJson!) as Array<{ callId: string }>;
    expect(arr).toHaveLength(1);
  });

  it('removes old images without savedToWorkspace', () => {
    const { db, sessionId } = makeDb();
    const msgId = insertMessage(
      db,
      sessionId,
      JSON.stringify([
        {
          callId: 'ig_old_unsaved',
          b64: 'AAAA',
          size: '1024x1024',
          createdAt: NOW - THIRTY_DAYS - 1,
        },
      ]),
    );
    const res = purgeOldImages({ db, nowMs: () => NOW });
    expect(res.purgedImages).toBe(1);
    expect(res.collapsedToNull).toBe(1);
    const row = db.db.select().from(messages).where(eq(messages.id, msgId)).get();
    expect(row!.imagesJson).toBeNull();
  });

  it('keeps old images that were saved to workspace', () => {
    const { db, sessionId } = makeDb();
    const msgId = insertMessage(
      db,
      sessionId,
      JSON.stringify([
        {
          callId: 'ig_old_saved',
          b64: 'AAAA',
          size: '1024x1024',
          createdAt: NOW - THIRTY_DAYS - 1,
          savedToWorkspace: 'covers/kept.png',
        },
      ]),
    );
    const res = purgeOldImages({ db, nowMs: () => NOW });
    expect(res.purgedImages).toBe(0);
    const row = db.db.select().from(messages).where(eq(messages.id, msgId)).get();
    const arr = JSON.parse(row!.imagesJson!) as Array<{ callId: string }>;
    expect(arr[0]!.callId).toBe('ig_old_saved');
  });

  it('partial purge keeps surviving entries', () => {
    const { db, sessionId } = makeDb();
    const msgId = insertMessage(
      db,
      sessionId,
      JSON.stringify([
        {
          callId: 'ig_old_unsaved',
          b64: 'A',
          size: '1024x1024',
          createdAt: NOW - THIRTY_DAYS - 1,
        },
        {
          callId: 'ig_fresh',
          b64: 'B',
          size: '1024x1024',
          createdAt: NOW - 1000,
        },
        {
          callId: 'ig_old_saved',
          b64: 'C',
          size: '1024x1024',
          createdAt: NOW - THIRTY_DAYS - 1,
          savedToWorkspace: 'covers/c.png',
        },
      ]),
    );
    const res = purgeOldImages({ db, nowMs: () => NOW });
    expect(res.purgedImages).toBe(1);
    expect(res.collapsedToNull).toBe(0);
    const row = db.db.select().from(messages).where(eq(messages.id, msgId)).get();
    const arr = JSON.parse(row!.imagesJson!) as Array<{ callId: string }>;
    expect(arr.map((a) => a.callId).sort()).toEqual(['ig_fresh', 'ig_old_saved']);
  });

  it('handles malformed JSON gracefully', () => {
    const { db, sessionId } = makeDb();
    insertMessage(db, sessionId, '{not:valid-json');
    const res = purgeOldImages({ db, nowMs: () => NOW });
    expect(res.purgedImages).toBe(0);
  });

  it('ignores messages with NULL imagesJson', () => {
    const { db, sessionId } = makeDb();
    insertMessage(db, sessionId, null);
    const res = purgeOldImages({ db, nowMs: () => NOW });
    expect(res.scannedMessages).toBe(0);
  });

  it('custom maxAgeMs overrides the 30d default', () => {
    const { db, sessionId } = makeDb();
    const msgId = insertMessage(
      db,
      sessionId,
      JSON.stringify([
        {
          callId: 'ig_recent_but_purged',
          b64: 'A',
          size: '1024x1024',
          createdAt: NOW - 60 * 1000, // 1 min old
        },
      ]),
    );
    const res = purgeOldImages({ db, nowMs: () => NOW, maxAgeMs: 10_000 });
    expect(res.purgedImages).toBe(1);
    const row = db.db.select().from(messages).where(eq(messages.id, msgId)).get();
    expect(row!.imagesJson).toBeNull();
  });
});
