// packages/api/src/services/vectorStore.ts
//
// M8A — Sync `workspace/knowledge/` → OpenAI vector store pour tool `file_search`.
// Sync differentielle basee sur (path, sha256). Solo-user : un seul VS par user.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import type { DbHandles } from '../db/client.js';
import { userSettings, workspaceVectorFiles } from '../db/schema.js';

const OPENAI_BASE = 'https://api.openai.com/v1';
const ALLOWED_EXTS = new Set(['.md', '.txt']);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB par fichier

export interface SyncSummary {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  skipped: number;
  vectorStoreId: string;
}

export interface VectorStoreStatus {
  vectorStoreId: string | null;
  fileCount: number;
  lastSyncAt: number | null;
}

interface OpenAIFetchOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

async function openaiFetch(
  apiKey: string,
  url: string,
  fetchImpl: typeof fetch,
  opts: OpenAIFetchOptions = {},
): Promise<Response> {
  const res = await fetchImpl(url, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI ${res.status} ${url}: ${text.slice(0, 200)}`);
  }
  return res;
}

/**
 * Cree (si besoin) et retourne le vector_store_id de l'utilisateur.
 * Idempotent : si `user_settings.vector_store_id` existe, le renvoie.
 */
export async function getOrCreateVectorStore(
  db: DbHandles,
  userId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const row = db.db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();
  if (row?.vectorStoreId) return row.vectorStoreId;

  const res = await fetchImpl(`${OPENAI_BASE}/vector_stores`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: `buck-workspace-${userId}` }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`create vector_store ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { id: string };
  db.db
    .update(userSettings)
    .set({ vectorStoreId: json.id })
    .where(eq(userSettings.userId, userId))
    .run();
  return json.id;
}

async function sha256File(absPath: string): Promise<string> {
  const buf = await fsp.readFile(absPath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Liste recursive des fichiers indexables sous `dir`. Retourne des chemins
 * relatifs au workspace root (ex: "knowledge/synopsis.md").
 */
async function scanKnowledge(
  workspaceDir: string,
): Promise<Array<{ relPath: string; absPath: string; mtimeMs: number; sizeBytes: number }>> {
  const root = path.join(workspaceDir, 'knowledge');
  if (!fs.existsSync(root)) return [];

  const out: Array<{ relPath: string; absPath: string; mtimeMs: number; sizeBytes: number }> = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) continue;
      const stat = await fsp.stat(abs);
      if (stat.size > MAX_FILE_BYTES) continue;
      const relPath = path.relative(workspaceDir, abs);
      out.push({ relPath, absPath: abs, mtimeMs: stat.mtimeMs, sizeBytes: stat.size });
    }
  }
  await walk(root);
  return out;
}

/**
 * Upload un fichier local vers /v1/files (purpose=assistants) puis l'attache
 * au vector store. Retourne le file id OpenAI.
 */
async function uploadFileToVs(
  apiKey: string,
  vectorStoreId: string,
  absPath: string,
  relPath: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const buf = await fsp.readFile(absPath);
  const form = new FormData();
  form.append('purpose', 'assistants');
  form.append('file', new Blob([buf]), path.basename(relPath));

  const upRes = await fetchImpl(`${OPENAI_BASE}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!upRes.ok) {
    const text = await upRes.text().catch(() => '');
    throw new Error(`upload ${relPath} ${upRes.status}: ${text.slice(0, 200)}`);
  }
  const upJson = (await upRes.json()) as { id: string };

  await openaiFetch(apiKey, `${OPENAI_BASE}/vector_stores/${vectorStoreId}/files`, fetchImpl, {
    method: 'POST',
    body: { file_id: upJson.id },
  });
  return upJson.id;
}

async function detachAndDeleteFile(
  apiKey: string,
  vectorStoreId: string,
  fileId: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  // Detach du VS (ignore 404 — peut deja etre detache cote OpenAI)
  await fetchImpl(`${OPENAI_BASE}/vector_stores/${vectorStoreId}/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch(() => {});
  // Delete le file
  await fetchImpl(`${OPENAI_BASE}/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch(() => {});
}

/**
 * Sync differentielle `workspace/knowledge/` -> vector store OpenAI.
 */
export async function syncKnowledgeToVectorStore(
  db: DbHandles,
  userId: string,
  workspaceDir: string,
  apiKey: string,
  nowMs: () => number = Date.now,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncSummary> {
  const vectorStoreId = await getOrCreateVectorStore(db, userId, apiKey, fetchImpl);

  const local = await scanKnowledge(workspaceDir);
  const tracked = db.db
    .select()
    .from(workspaceVectorFiles)
    .where(eq(workspaceVectorFiles.userId, userId))
    .all();
  const trackedByPath = new Map(tracked.map((r) => [r.workspacePath, r]));
  const localByPath = new Map(local.map((f) => [f.relPath, f]));

  const summary: SyncSummary = {
    added: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
    skipped: 0,
    vectorStoreId,
  };
  const now = nowMs();

  for (const file of local) {
    const existing = trackedByPath.get(file.relPath);
    const sha = await sha256File(file.absPath);

    if (!existing) {
      try {
        const fileId = await uploadFileToVs(apiKey, vectorStoreId, file.absPath, file.relPath, fetchImpl);
        db.db.insert(workspaceVectorFiles).values({
          userId,
          workspacePath: file.relPath,
          openaiFileId: fileId,
          mtimeMs: file.mtimeMs,
          sha256: sha,
          sizeBytes: file.sizeBytes,
          uploadedAt: now,
        }).run();
        summary.added++;
      } catch {
        summary.skipped++;
      }
      continue;
    }

    if (existing.sha256 === sha) {
      summary.unchanged++;
      continue;
    }

    try {
      await detachAndDeleteFile(apiKey, vectorStoreId, existing.openaiFileId, fetchImpl);
      const fileId = await uploadFileToVs(apiKey, vectorStoreId, file.absPath, file.relPath, fetchImpl);
      db.db
        .update(workspaceVectorFiles)
        .set({
          openaiFileId: fileId,
          mtimeMs: file.mtimeMs,
          sha256: sha,
          sizeBytes: file.sizeBytes,
          uploadedAt: now,
        })
        .where(
          and(
            eq(workspaceVectorFiles.userId, userId),
            eq(workspaceVectorFiles.workspacePath, file.relPath),
          ),
        )
        .run();
      summary.updated++;
    } catch {
      summary.skipped++;
    }
  }

  for (const row of tracked) {
    if (localByPath.has(row.workspacePath)) continue;
    try {
      await detachAndDeleteFile(apiKey, vectorStoreId, row.openaiFileId, fetchImpl);
    } catch {
      // best-effort, on retire quand meme la ligne DB
    }
    db.db
      .delete(workspaceVectorFiles)
      .where(
        and(
          eq(workspaceVectorFiles.userId, userId),
          eq(workspaceVectorFiles.workspacePath, row.workspacePath),
        ),
      )
      .run();
    summary.removed++;
  }

  db.db
    .update(userSettings)
    .set({ vectorStoreLastSyncAt: new Date(now) })
    .where(eq(userSettings.userId, userId))
    .run();

  return summary;
}

export function getVectorStoreStatus(db: DbHandles, userId: string): VectorStoreStatus {
  const settings = db.db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();
  const count = db.db
    .select()
    .from(workspaceVectorFiles)
    .where(eq(workspaceVectorFiles.userId, userId))
    .all().length;
  return {
    vectorStoreId: settings?.vectorStoreId ?? null,
    fileCount: count,
    lastSyncAt: settings?.vectorStoreLastSyncAt
      ? settings.vectorStoreLastSyncAt.getTime()
      : null,
  };
}
