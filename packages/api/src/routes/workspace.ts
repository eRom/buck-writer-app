import { Hono } from 'hono';
import fs from 'node:fs/promises';
import type { Dirent, Stats } from 'node:fs';
import path from 'node:path';
import type { DbHandles } from '../db/client.js';
import { assertSafePath } from '../utils/path-safe.js';
import { HttpError } from '../utils/http-error.js';
import {
  CreateDirectoryInput,
  RenameInput,
  type FileEntry,
} from '@buck/shared';

export interface WorkspaceRouteDeps {
  db: DbHandles;
  workspaceDir: string;
}

/** Directories that cannot themselves be deleted (root-level protected dirs). */
const PROTECTED_ROOT_DIRS = ['prompts', 'skills'] as const;

function isProtectedPath(normalized: string): string | null {
  for (const dir of PROTECTED_ROOT_DIRS) {
    if (normalized === dir || normalized.startsWith(dir + '/')) return dir;
  }
  return null;
}

async function buildTree(
  dirPath: string,
  relativeTo: string,
): Promise<FileEntry[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  // Sort alphabetically
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const result: FileEntry[] = [];
  for (const entry of entries) {
    // Exclude .attachments directory
    if (entry.name === '.attachments') continue;

    const entryPath = path.join(dirPath, entry.name);
    const rel = path.relative(relativeTo, entryPath);

    if (entry.isDirectory()) {
      const children = await buildTree(entryPath, relativeTo);
      result.push({
        name: entry.name,
        path: rel,
        type: 'directory',
        children,
      });
    } else if (entry.isFile()) {
      const stat = await fs.stat(entryPath);
      result.push({
        name: entry.name,
        path: rel,
        type: 'file',
        size: stat.size,
      });
    }
  }
  return result;
}

export function createWorkspaceRoutes(
  deps: WorkspaceRouteDeps,
): Hono<{ Variables: { userId: string } }> {
  const app = new Hono<{ Variables: { userId: string } }>();
  const { workspaceDir } = deps;

  // GET /tree — full workspace tree
  app.get('/tree', async (c) => {
    const tree = await buildTree(workspaceDir, workspaceDir);
    return c.json({ tree });
  });

  // GET /file?path=... — read/download a file
  app.get('/file', async (c) => {
    const filePath = c.req.query('path');
    if (!filePath) {
      throw new HttpError(422, 'missing_path', 'path query parameter required');
    }

    const abs = await assertSafePath(workspaceDir, filePath);

    let stat: Stats;
    try {
      stat = await fs.stat(abs);
    } catch {
      throw new HttpError(404, 'not_found', 'file not found');
    }

    if (stat.isDirectory()) {
      throw new HttpError(422, 'is_directory', 'path is a directory');
    }

    const content = await fs.readFile(abs);
    // Attempt to derive a content-type
    const ext = path.extname(abs).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.html': 'text/html',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
    };
    const contentType = mimeMap[ext] ?? 'application/octet-stream';

    return new Response(content, {
      status: 200,
      headers: { 'content-type': contentType },
    });
  });

  // POST /file — upload a file (multipart: file + path)
  app.post('/file', async (c) => {
    const formData = await c.req.formData();
    const file = formData.get('file');
    const filePath = formData.get('path');

    if (!file || !(file instanceof File)) {
      throw new HttpError(422, 'missing_file', 'file field required');
    }
    if (!filePath || typeof filePath !== 'string') {
      throw new HttpError(422, 'missing_path', 'path field required');
    }

    const abs = await assertSafePath(workspaceDir, filePath);
    // Create parent dirs
    await fs.mkdir(path.dirname(abs), { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(abs, buffer);

    return c.json({ ok: true, path: filePath }, 201);
  });

  // POST /directory — create a directory
  app.post('/directory', async (c) => {
    const body = await c.req.json();
    const parsed = CreateDirectoryInput.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(422, 'validation_error', parsed.error.message);
    }

    const abs = await assertSafePath(workspaceDir, parsed.data.path);
    await fs.mkdir(abs, { recursive: true });

    return c.json({ ok: true, path: parsed.data.path }, 201);
  });

  // PATCH /file?path=... — rename
  app.patch('/file', async (c) => {
    const filePath = c.req.query('path');
    if (!filePath) {
      throw new HttpError(422, 'missing_path', 'path query parameter required');
    }

    const body = await c.req.json();
    const parsed = RenameInput.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(422, 'validation_error', parsed.error.message);
    }

    const absOld = await assertSafePath(workspaceDir, filePath);

    // Check old path exists
    try {
      await fs.stat(absOld);
    } catch {
      throw new HttpError(404, 'not_found', 'file not found');
    }

    // Build new path: same parent dir, new name
    const newRelative = path.join(path.dirname(filePath), parsed.data.newName);
    const absNew = await assertSafePath(workspaceDir, newRelative);

    await fs.rename(absOld, absNew);

    return c.json({ ok: true, path: newRelative });
  });

  // DELETE /file?path=... — delete file or directory
  app.delete('/file', async (c) => {
    const filePath = c.req.query('path');
    if (!filePath) {
      throw new HttpError(422, 'missing_path', 'path query parameter required');
    }

    const abs = await assertSafePath(workspaceDir, filePath);

    // Block deletion of any path inside a protected root (prompts/, skills/, …),
    // not just the root directories themselves.
    const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    const protectedDir = isProtectedPath(normalized);
    if (protectedDir) {
      throw new HttpError(403, 'protected_directory', `cannot delete inside protected directory: ${protectedDir}`);
    }

    // Check exists
    try {
      await fs.stat(abs);
    } catch {
      throw new HttpError(404, 'not_found', 'file not found');
    }

    await fs.rm(abs, { recursive: true });

    return c.json({ ok: true });
  });

  return app;
}
