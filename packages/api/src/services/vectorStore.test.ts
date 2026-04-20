import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb, type DbHandles } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { users, userSettings, workspaceVectorFiles } from '../db/schema.js';
import { getOrCreateSettings } from './user-settings.js';
import {
  syncKnowledgeToVectorStore,
  getVectorStoreStatus,
  getOrCreateVectorStore,
} from './vectorStore.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');

let db: DbHandles;
let dbPath: string;
let workspaceDir: string;
const userId = 'user-test-1';

beforeEach(() => {
  dbPath = path.join(
    os.tmpdir(),
    `buck-vs-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );
  runMigrations({ databaseUrl: `file:${dbPath}`, migrationsFolder: migrationsDir });
  db = openDb(`file:${dbPath}`);
  db.db.insert(users).values({
    id: userId,
    email: 'a@b.c',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }).run();
  getOrCreateSettings(db, userId);

  workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buck-vs-ws-'));
  fs.mkdirSync(path.join(workspaceDir, 'knowledge'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(dbPath, { force: true });
  fs.rmSync(workspaceDir, { recursive: true, force: true });
});

function mockFetch(handlers: Array<[RegExp, (init: RequestInit) => Response]>) {
  return vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = String(url);
    for (const [pattern, handler] of handlers) {
      if (pattern.test(u)) return handler(init);
    }
    throw new Error(`unhandled fetch ${u}`);
  }) as unknown as typeof fetch;
}

describe('getOrCreateVectorStore', () => {
  it('cree un VS a la premiere invocation et persiste son id', async () => {
    const fetchImpl = mockFetch([
      [/\/vector_stores$/, () =>
        new Response(JSON.stringify({ id: 'vs_123' }), { status: 200 })],
    ]);
    const id = await getOrCreateVectorStore(db, userId, 'sk-test', fetchImpl);
    expect(id).toBe('vs_123');
    const row = db.db.select().from(userSettings).all()[0];
    expect(row?.vectorStoreId).toBe('vs_123');
  });

  it('reutilise un VS deja persiste sans recreer', async () => {
    db.db
      .update(userSettings)
      .set({ vectorStoreId: 'vs_existing' })
      .run();
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const id = await getOrCreateVectorStore(db, userId, 'sk-test', fetchImpl);
    expect(id).toBe('vs_existing');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('syncKnowledgeToVectorStore', () => {
  it('upload les nouveaux fichiers, skip les inchanges, supprime les orphelins', async () => {
    // Seed : VS deja cree, 1 fichier deja synchronise (tracked mais sera orphelin), 1 nouveau
    db.db
      .update(userSettings)
      .set({ vectorStoreId: 'vs_abc' })
      .run();
    db.db.insert(workspaceVectorFiles).values({
      userId,
      workspacePath: 'knowledge/deleted.md',
      openaiFileId: 'file_old',
      mtimeMs: 1,
      sha256: 'sha_old',
      sizeBytes: 5,
      uploadedAt: 1,
    }).run();

    fs.writeFileSync(path.join(workspaceDir, 'knowledge', 'new.md'), '# new');
    fs.writeFileSync(path.join(workspaceDir, 'knowledge', 'binary.png'), 'PNG');

    let uploadCount = 0;
    let attachCount = 0;
    let deleteFileCount = 0;
    let deleteAttachCount = 0;

    const fetchImpl = mockFetch([
      [/\/vector_stores\/vs_abc\/files/, (init) => {
        if (init.method === 'DELETE') {
          deleteAttachCount++;
          return new Response('{}', { status: 200 });
        }
        attachCount++;
        return new Response('{}', { status: 200 });
      }],
      [/\/files/, (init) => {
        if (init.method === 'DELETE') {
          deleteFileCount++;
          return new Response('{}', { status: 200 });
        }
        uploadCount++;
        return new Response(JSON.stringify({ id: `file_new_${uploadCount}` }), {
          status: 200,
        });
      }],
    ]);

    const summary = await syncKnowledgeToVectorStore(
      db,
      userId,
      workspaceDir,
      'sk-test',
      () => 42,
      fetchImpl,
    );

    expect(summary.added).toBe(1);
    expect(summary.removed).toBe(1);
    expect(summary.unchanged).toBe(0);
    expect(summary.updated).toBe(0);
    expect(uploadCount).toBe(1); // only new.md (binary.png skipped)
    expect(attachCount).toBe(1);
    expect(deleteFileCount).toBe(1);
    expect(deleteAttachCount).toBe(1);

    const rows = db.db.select().from(workspaceVectorFiles).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.workspacePath).toBe('knowledge/new.md');

    const status = getVectorStoreStatus(db, userId);
    expect(status.vectorStoreId).toBe('vs_abc');
    expect(status.fileCount).toBe(1);
    expect(status.lastSyncAt).toBe(42);
  });

  it('detecte les modifications par sha256 et re-upload', async () => {
    db.db.update(userSettings).set({ vectorStoreId: 'vs_abc' }).run();
    fs.writeFileSync(path.join(workspaceDir, 'knowledge', 'doc.md'), 'v1');
    db.db.insert(workspaceVectorFiles).values({
      userId,
      workspacePath: 'knowledge/doc.md',
      openaiFileId: 'file_v1',
      mtimeMs: 1,
      sha256: 'different_sha',
      sizeBytes: 2,
      uploadedAt: 1,
    }).run();

    const fetchImpl = mockFetch([
      [/\/vector_stores\/vs_abc\/files/, () => new Response('{}', { status: 200 })],
      [/\/files/, (init) =>
        init.method === 'DELETE'
          ? new Response('{}', { status: 200 })
          : new Response(JSON.stringify({ id: 'file_v2' }), { status: 200 })],
    ]);

    const summary = await syncKnowledgeToVectorStore(
      db,
      userId,
      workspaceDir,
      'sk-test',
      () => 100,
      fetchImpl,
    );
    expect(summary.updated).toBe(1);
    const row = db.db.select().from(workspaceVectorFiles).all()[0];
    expect(row?.openaiFileId).toBe('file_v2');
  });
});
