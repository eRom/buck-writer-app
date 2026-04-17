# M3 — Attachments + WebDAV + Workspace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add file management to Buck Writer — attachments in chat, WebDAV for native OS access, file browser, OpenAI file tools, @reference, and workspace skills.

**Architecture:** Two filesystem access paths (REST routes for browser/tools + WebDAV lib for native OS). File tools declared as OpenAI function calls with a generic approval flow. Skills loaded from `skills/` directory with hot-reload.

**Tech Stack:** Hono routes (REST), webdav-server (WebDAV), pdf-parse + mammoth (extraction), fs.watch/chokidar (skills watcher), React + shadcn (UI)

**Spec:** `docs/superpowers/specs/2026-04-17-m3-attachments-webdav-workspace-design.md`

---

## File Structure

### New files to create

```
packages/shared/src/schemas/workspace.ts       — Zod schemas for workspace/attachments
packages/api/src/routes/workspace.ts            — REST CRUD routes for workspace filesystem
packages/api/src/routes/workspace.test.ts       — Tests for workspace routes
packages/api/src/routes/attachments.ts          — Upload/serve attachment routes
packages/api/src/routes/attachments.test.ts     — Tests for attachment routes
packages/api/src/services/webdav.ts             — WebDAV server adapter for Hono
packages/api/src/services/webdav.test.ts        — Tests for WebDAV integration
packages/api/src/services/skills.ts             — Skills loader (parse SKILL.md, hot-reload)
packages/api/src/services/skills.test.ts        — Tests for skills loader
packages/api/src/services/extractor.ts          — Text extraction (PDF, DOCX, TXT, MD)
packages/api/src/services/extractor.test.ts     — Tests for text extraction
packages/web/src/components/chat/attachment-preview.tsx   — Preview attachments in ChatInput
packages/web/src/components/chat/attachment-display.tsx   — Display attachments in messages
packages/web/src/components/chat/approval-block.tsx       — Approval UI for tools (delete_file)
packages/web/src/components/chat/tool-call-display.tsx    — Tool call indicator in messages
packages/web/src/components/chat/at-reference.tsx         — @reference autocomplete dropdown
packages/web/src/components/workspace/file-tree.tsx       — Tree view component (shared)
packages/web/src/components/workspace/workspace-panel.tsx — Right panel in chat
packages/web/src/routes/workspace.tsx                     — Workspace page route
packages/web/src/lib/workspace.ts               — Workspace API client
packages/web/src/lib/attachments.ts             — Attachments API client
packages/web/src/components/settings/webdav-wizard.tsx    — WebDAV connection wizard
```

### Files to modify

```
packages/shared/src/index.ts                    — Export workspace schemas
packages/api/src/app.ts                         — Mount workspace, attachments, webdav routes
packages/api/src/routes/chat.ts                 — Add file tools, approval flow, @reference, skills
packages/api/src/routes/chat.test.ts            — Tests for new chat features
packages/api/src/routes/auth.ts                 — WebDAV token endpoint
packages/api/src/routes/auth.test.ts            — Tests for WebDAV token
packages/web/src/routes/index.tsx               — Add right panel to ChatLayout
packages/web/src/components/chat/chat-layout.tsx — Support right panel
packages/web/src/components/chat/chat-input.tsx  — Add clip button, drag&drop, paste, @ref
packages/web/src/components/chat/chat-area.tsx   — Handle attachments, tools, approvals
packages/web/src/components/chat/message-bubble.tsx — Render attachments + tool calls
packages/web/src/routes/settings/general.tsx     — Add WebDAV wizard section
```

---

## Task 1: Shared Schemas — Workspace & Attachments

**Files:**
- Create: `packages/shared/src/schemas/workspace.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create workspace schemas**

```typescript
// packages/shared/src/schemas/workspace.ts
import { z } from 'zod';

// ---------- Workspace tree ----------

export const FileEntryType = z.enum(['file', 'directory']);

export const FileEntry = z.object({
  name: z.string(),
  path: z.string(),
  type: FileEntryType,
  size: z.number().optional(),
  mimeType: z.string().optional(),
  children: z.lazy(() => z.array(FileEntry)).optional(),
});
export type FileEntry = z.infer<typeof FileEntry>;

export const WorkspaceTreeResponse = z.object({
  tree: z.array(FileEntry),
});
export type WorkspaceTreeResponse = z.infer<typeof WorkspaceTreeResponse>;

// ---------- Workspace file ops ----------

export const CreateDirectoryInput = z.object({
  path: z.string().min(1).max(500),
});

export const RenameInput = z.object({
  newName: z.string().min(1).max(255),
});

// ---------- Attachments ----------

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20 MB
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export const AttachmentResponse = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  path: z.string(),
});
export type AttachmentResponse = z.infer<typeof AttachmentResponse>;

export const AttachmentsUploadResponse = z.object({
  attachments: z.array(AttachmentResponse),
});

// ---------- Chat extensions ----------

export const ChatReference = z.object({
  path: z.string(),
  content: z.string(),
});
export type ChatReference = z.infer<typeof ChatReference>;

// ---------- Tool approval ----------

export const ToolApprovalChunk = z.object({
  type: z.literal('tool_approval'),
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.unknown()),
});
export type ToolApprovalChunk = z.infer<typeof ToolApprovalChunk>;

export const ToolApprovalDecision = z.object({
  toolCallId: z.string(),
  approved: z.boolean(),
});
export type ToolApprovalDecision = z.infer<typeof ToolApprovalDecision>;

// ---------- Skills ----------

export const SkillMeta = z.object({
  name: z.string(),
  description: z.string(),
});
export type SkillMeta = z.infer<typeof SkillMeta>;
```

- [ ] **Step 2: Export from shared index**

Add to `packages/shared/src/index.ts`:

```typescript
export * from './schemas/workspace.js';
```

- [ ] **Step 3: Build shared and verify**

Run: `cd packages/shared && pnpm build`
Expected: clean build, no errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schemas/workspace.ts packages/shared/src/index.ts
git commit -m "feat(shared): add workspace & attachment Zod schemas"
```

---

## Task 2: Text Extraction Service

**Files:**
- Create: `packages/api/src/services/extractor.ts`
- Create: `packages/api/src/services/extractor.test.ts`

- [ ] **Step 1: Install dependencies**

```bash
cd packages/api && pnpm add pdf-parse mammoth
```

- [ ] **Step 2: Write the failing tests**

```typescript
// packages/api/src/services/extractor.test.ts
import { describe, it, expect } from 'vitest';
import { extractText, isExtractable, isImage } from './extractor.js';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

describe('extractor', () => {
  describe('isImage', () => {
    it('returns true for image MIME types', () => {
      expect(isImage('image/jpeg')).toBe(true);
      expect(isImage('image/png')).toBe(true);
      expect(isImage('image/gif')).toBe(true);
      expect(isImage('image/webp')).toBe(true);
    });

    it('returns false for non-image MIME types', () => {
      expect(isImage('text/plain')).toBe(false);
      expect(isImage('application/pdf')).toBe(false);
    });
  });

  describe('isExtractable', () => {
    it('returns true for extractable MIME types', () => {
      expect(isExtractable('text/plain')).toBe(true);
      expect(isExtractable('text/markdown')).toBe(true);
      expect(isExtractable('application/pdf')).toBe(true);
      expect(isExtractable('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
    });

    it('returns false for images', () => {
      expect(isExtractable('image/jpeg')).toBe(false);
    });
  });

  describe('extractText', () => {
    it('extracts plain text files', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      const file = path.join(dir, 'test.txt');
      await fs.writeFile(file, 'Hello world', 'utf8');
      const result = await extractText(file, 'text/plain');
      expect(result).toBe('Hello world');
      await fs.rm(dir, { recursive: true });
    });

    it('extracts markdown files', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      const file = path.join(dir, 'test.md');
      await fs.writeFile(file, '# Title\n\nContent', 'utf8');
      const result = await extractText(file, 'text/markdown');
      expect(result).toBe('# Title\n\nContent');
      await fs.rm(dir, { recursive: true });
    });

    it('throws for unsupported MIME types', async () => {
      await expect(extractText('/tmp/fake.bin', 'application/octet-stream')).rejects.toThrow('unsupported');
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/api && pnpm vitest run src/services/extractor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement extractor**

```typescript
// packages/api/src/services/extractor.ts
import * as fs from 'node:fs/promises';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const TEXT_TYPES = new Set(['text/plain', 'text/markdown']);

export function isImage(mimeType: string): boolean {
  return IMAGE_TYPES.has(mimeType);
}

export function isExtractable(mimeType: string): boolean {
  return (
    TEXT_TYPES.has(mimeType) ||
    mimeType === 'application/pdf' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

export async function extractText(filePath: string, mimeType: string): Promise<string> {
  if (TEXT_TYPES.has(mimeType)) {
    return fs.readFile(filePath, 'utf8');
  }

  if (mimeType === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = await fs.readFile(filePath);
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  throw new Error(`unsupported MIME type: ${mimeType}`);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/api && pnpm vitest run src/services/extractor.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/extractor.ts packages/api/src/services/extractor.test.ts packages/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add text extraction service (TXT, MD, PDF, DOCX)"
```

---

## Task 3: Workspace REST Routes

**Files:**
- Create: `packages/api/src/routes/workspace.ts`
- Create: `packages/api/src/routes/workspace.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/api/src/routes/workspace.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { buildApp } from '../app.js';
import { openDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { createJwtService } from '../services/jwt.js';
import { sha256Hex } from '../utils/crypto.js';
import { newId } from '@buck/shared';
import { users, sessionsAuth } from '../db/schema.js';

const migrationsDir = path.resolve(import.meta.dirname, '../db/migrations');
const CSRF_TOKEN = 'test-csrf-token';

function tmp() {
  return path.join(os.tmpdir(), `buck-ws-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

interface TestCtx {
  dbPath: string;
  app: ReturnType<typeof buildApp>;
  sessionJwt: string;
  userId: string;
  workspaceDir: string;
}

async function makeCtx(): Promise<TestCtx> {
  const dbPath = tmp();
  const url = `file:${dbPath}`;
  runMigrations({ databaseUrl: url, migrationsFolder: migrationsDir });
  runSeed({ databaseUrl: url, allowedEmails: ['alice@example.com'], mcpBibleUrl: '' });

  const db = openDb(url);
  const jwt = createJwtService({ secret: 'a'.repeat(32), issuer: 'buck', audience: 'buck-web' });
  const email = { sendMagicLink: async () => {} };

  const alice = db.db.select().from(users).all().find((u) => u.email === 'alice@example.com')!;
  const sessionJwt = await jwt.sign({ sub: alice.id, scope: 'app' }, '30d');
  db.db.insert(sessionsAuth).values({
    id: newId(), userId: alice.id, tokenHash: sha256Hex(sessionJwt),
    scope: 'app', userAgent: null, expiresAt: Date.now() + 86400000, createdAt: Date.now(),
  }).run();

  const workspaceDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'buck-ws-'));

  const app = buildApp({
    db, email, jwt, allowedEmails: ['alice@example.com'],
    publicBaseUrl: 'http://localhost:3000',
    workspaceDir,
  });

  return { dbPath, app, sessionJwt, userId: alice.id, workspaceDir };
}

function authHeaders(jwt: string): Record<string, string> {
  return { cookie: `buck_session=${jwt}; buck_csrf=${CSRF_TOKEN}` };
}

function authMutHeaders(jwt: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    cookie: `buck_session=${jwt}; buck_csrf=${CSRF_TOKEN}`,
    'x-csrf-token': CSRF_TOKEN,
  };
}

let ctx: TestCtx;

beforeEach(async () => { ctx = await makeCtx(); });
afterEach(async () => {
  if (ctx?.dbPath && fs.existsSync(ctx.dbPath)) fs.unlinkSync(ctx.dbPath);
  if (ctx?.workspaceDir) await fsp.rm(ctx.workspaceDir, { recursive: true, force: true });
});

describe('GET /api/workspace/tree', () => {
  it('returns empty tree for empty workspace', async () => {
    const res = await ctx.app.request('/api/workspace/tree', { headers: authHeaders(ctx.sessionJwt) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tree).toEqual([]);
  });

  it('returns files and directories', async () => {
    await fsp.mkdir(path.join(ctx.workspaceDir, 'notes'));
    await fsp.writeFile(path.join(ctx.workspaceDir, 'notes', 'todo.md'), '# TODO');
    await fsp.writeFile(path.join(ctx.workspaceDir, 'readme.txt'), 'hello');

    const res = await ctx.app.request('/api/workspace/tree', { headers: authHeaders(ctx.sessionJwt) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tree).toHaveLength(2);

    const notesDir = body.tree.find((e: { name: string }) => e.name === 'notes');
    expect(notesDir.type).toBe('directory');
    expect(notesDir.children).toHaveLength(1);
    expect(notesDir.children[0].name).toBe('todo.md');
  });

  it('excludes .attachments directory', async () => {
    await fsp.mkdir(path.join(ctx.workspaceDir, '.attachments'));
    await fsp.writeFile(path.join(ctx.workspaceDir, '.attachments', 'secret.jpg'), '');
    await fsp.writeFile(path.join(ctx.workspaceDir, 'visible.txt'), 'hi');

    const res = await ctx.app.request('/api/workspace/tree', { headers: authHeaders(ctx.sessionJwt) });
    const body = await res.json();
    expect(body.tree).toHaveLength(1);
    expect(body.tree[0].name).toBe('visible.txt');
  });
});

describe('GET /api/workspace/file', () => {
  it('serves a file', async () => {
    await fsp.writeFile(path.join(ctx.workspaceDir, 'test.txt'), 'content here');
    const res = await ctx.app.request('/api/workspace/file?path=test.txt', { headers: authHeaders(ctx.sessionJwt) });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('content here');
  });

  it('blocks path traversal', async () => {
    const res = await ctx.app.request('/api/workspace/file?path=../../../etc/passwd', { headers: authHeaders(ctx.sessionJwt) });
    expect(res.status).toBe(403);
  });

  it('returns 404 for missing file', async () => {
    const res = await ctx.app.request('/api/workspace/file?path=nope.txt', { headers: authHeaders(ctx.sessionJwt) });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/workspace/directory', () => {
  it('creates a directory', async () => {
    const res = await ctx.app.request('/api/workspace/directory', {
      method: 'POST',
      headers: authMutHeaders(ctx.sessionJwt),
      body: JSON.stringify({ path: 'notes/chapter1' }),
    });
    expect(res.status).toBe(201);
    const stat = await fsp.stat(path.join(ctx.workspaceDir, 'notes/chapter1'));
    expect(stat.isDirectory()).toBe(true);
  });
});

describe('PATCH /api/workspace/file', () => {
  it('renames a file', async () => {
    await fsp.writeFile(path.join(ctx.workspaceDir, 'old.txt'), 'data');
    const res = await ctx.app.request('/api/workspace/file?path=old.txt', {
      method: 'PATCH',
      headers: authMutHeaders(ctx.sessionJwt),
      body: JSON.stringify({ newName: 'new.txt' }),
    });
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(ctx.workspaceDir, 'new.txt'))).toBe(true);
    expect(fs.existsSync(path.join(ctx.workspaceDir, 'old.txt'))).toBe(false);
  });
});

describe('DELETE /api/workspace/file', () => {
  it('deletes a file', async () => {
    await fsp.writeFile(path.join(ctx.workspaceDir, 'bye.txt'), 'gone');
    const res = await ctx.app.request('/api/workspace/file?path=bye.txt', {
      method: 'DELETE',
      headers: { ...authMutHeaders(ctx.sessionJwt) },
    });
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(ctx.workspaceDir, 'bye.txt'))).toBe(false);
  });

  it('refuses to delete protected directories', async () => {
    await fsp.mkdir(path.join(ctx.workspaceDir, 'prompts'));
    const res = await ctx.app.request('/api/workspace/file?path=prompts', {
      method: 'DELETE',
      headers: { ...authMutHeaders(ctx.sessionJwt) },
    });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/api && pnpm vitest run src/routes/workspace.test.ts`
Expected: FAIL — routes not mounted, `workspaceDir` not in AppDeps

- [ ] **Step 3: Implement workspace routes**

```typescript
// packages/api/src/routes/workspace.ts
import { Hono } from 'hono';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { CreateDirectoryInput, RenameInput } from '@buck/shared';
import { assertSafePath } from '../utils/path-safe.js';
import { HttpError } from '../utils/http-error.js';
import type { DbHandles } from '../db/client.js';

export interface WorkspaceRouteDeps {
  db: DbHandles;
  workspaceDir: string;
}

const HIDDEN_DIRS = new Set(['.attachments']);
const PROTECTED_ROOTS = new Set(['prompts', 'skills']);

interface TreeEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: TreeEntry[];
}

async function buildTree(dirPath: string, relativeTo: string): Promise<TreeEntry[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const result: TreeEntry[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (HIDDEN_DIRS.has(entry.name)) continue;

    const relPath = path.relative(relativeTo, path.join(dirPath, entry.name));

    if (entry.isDirectory()) {
      const children = await buildTree(path.join(dirPath, entry.name), relativeTo);
      result.push({ name: entry.name, path: relPath, type: 'directory', children });
    } else {
      const stat = await fs.stat(path.join(dirPath, entry.name));
      result.push({ name: entry.name, path: relPath, type: 'file', size: stat.size });
    }
  }

  return result;
}

export function createWorkspaceRoutes(deps: WorkspaceRouteDeps): Hono<{ Variables: { userId: string } }> {
  const app = new Hono<{ Variables: { userId: string } }>();
  const wsDir = deps.workspaceDir;

  // GET /tree — full workspace tree
  app.get('/tree', async (c) => {
    try {
      await fs.access(wsDir);
    } catch {
      return c.json({ tree: [] });
    }
    const tree = await buildTree(wsDir, wsDir);
    return c.json({ tree });
  });

  // GET /file?path=... — read/download a file
  app.get('/file', async (c) => {
    const relPath = c.req.query('path');
    if (!relPath) return c.json({ error: { code: 'invalid_input', message: 'path required' } }, 422);

    let absPath: string;
    try {
      absPath = await assertSafePath(wsDir, relPath);
    } catch {
      return c.json({ error: { code: 'forbidden_path', message: 'path outside workspace' } }, 403);
    }

    try {
      const stat = await fs.stat(absPath);
      if (stat.isDirectory()) return c.json({ error: { code: 'invalid_input', message: 'path is a directory' } }, 422);
      const content = await fs.readFile(absPath);
      return new Response(content, {
        status: 200,
        headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${path.basename(absPath)}"` },
      });
    } catch {
      return c.json({ error: { code: 'not_found', message: 'file not found' } }, 404);
    }
  });

  // POST /file — upload a file (multipart form: file + path)
  app.post('/file', async (c) => {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const destPath = formData.get('path') as string | null;
    if (!file || !destPath) return c.json({ error: { code: 'invalid_input', message: 'file and path required' } }, 422);

    let absPath: string;
    try {
      absPath = await assertSafePath(wsDir, destPath);
    } catch {
      return c.json({ error: { code: 'forbidden_path', message: 'path outside workspace' } }, 403);
    }

    await fs.mkdir(path.dirname(absPath), { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(absPath, buffer);
    return c.json({ ok: true }, 201);
  });

  // POST /directory — create a directory
  app.post('/directory', async (c) => {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = CreateDirectoryInput.safeParse(raw);
    if (!parsed.success) return c.json({ error: { code: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'invalid' } }, 422);

    let absPath: string;
    try {
      absPath = await assertSafePath(wsDir, parsed.data.path);
    } catch {
      return c.json({ error: { code: 'forbidden_path', message: 'path outside workspace' } }, 403);
    }

    await fs.mkdir(absPath, { recursive: true });
    return c.json({ ok: true }, 201);
  });

  // PATCH /file?path=... — rename
  app.patch('/file', async (c) => {
    const relPath = c.req.query('path');
    if (!relPath) return c.json({ error: { code: 'invalid_input', message: 'path required' } }, 422);

    const raw = await c.req.json().catch(() => ({}));
    const parsed = RenameInput.safeParse(raw);
    if (!parsed.success) return c.json({ error: { code: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'invalid' } }, 422);

    let absPath: string;
    try {
      absPath = await assertSafePath(wsDir, relPath);
    } catch {
      return c.json({ error: { code: 'forbidden_path', message: 'path outside workspace' } }, 403);
    }

    const newAbsPath = path.join(path.dirname(absPath), parsed.data.newName);
    try {
      await assertSafePath(wsDir, path.relative(wsDir, newAbsPath));
    } catch {
      return c.json({ error: { code: 'forbidden_path', message: 'new path outside workspace' } }, 403);
    }

    await fs.rename(absPath, newAbsPath);
    return c.json({ ok: true });
  });

  // DELETE /file?path=... — delete file or directory
  app.delete('/file', async (c) => {
    const relPath = c.req.query('path');
    if (!relPath) return c.json({ error: { code: 'invalid_input', message: 'path required' } }, 422);

    // Protect root-level special dirs
    const topLevel = relPath.split('/')[0];
    if (topLevel && PROTECTED_ROOTS.has(topLevel) && !relPath.includes('/')) {
      return c.json({ error: { code: 'forbidden_path', message: 'cannot delete protected directory' } }, 403);
    }

    let absPath: string;
    try {
      absPath = await assertSafePath(wsDir, relPath);
    } catch {
      return c.json({ error: { code: 'forbidden_path', message: 'path outside workspace' } }, 403);
    }

    await fs.rm(absPath, { recursive: true });
    return c.json({ ok: true });
  });

  return app;
}
```

- [ ] **Step 4: Update AppDeps and mount routes in app.ts**

Add to `AppDeps` interface:
```typescript
workspaceDir?: string;
```

Add after usage routes mount block in `buildApp`:
```typescript
// Workspace routes (protected, only if workspaceDir provided)
if (deps.workspaceDir) {
  app.use('/api/workspace/*', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
  app.use('/api/workspace', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
  app.route('/api/workspace', createWorkspaceRoutes({ db: deps.db, workspaceDir: deps.workspaceDir }));
}
```

Add the import:
```typescript
import { createWorkspaceRoutes, type WorkspaceRouteDeps } from './routes/workspace.js';
```

Update `AppDeps`:
```typescript
export interface AppDeps extends AuthRoutesDeps, SessionRoutesDeps {
  prompts?: Prompts;
  openaiApiKey?: string;
  webDistRoot?: string;
  workspaceDir?: string;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/api && pnpm vitest run src/routes/workspace.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `pnpm test`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routes/workspace.ts packages/api/src/routes/workspace.test.ts packages/api/src/app.ts
git commit -m "feat(api): add workspace REST routes (tree, file CRUD)"
```

---

## Task 4: Attachments Upload Route

**Files:**
- Create: `packages/api/src/routes/attachments.ts`
- Create: `packages/api/src/routes/attachments.test.ts`
- Modify: `packages/api/src/app.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/api/src/routes/attachments.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { buildApp } from '../app.js';
import { openDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { createJwtService } from '../services/jwt.js';
import { sha256Hex } from '../utils/crypto.js';
import { newId } from '@buck/shared';
import { users, sessionsAuth, attachments } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const migrationsDir = path.resolve(import.meta.dirname, '../db/migrations');
const CSRF_TOKEN = 'test-csrf-token';

function tmp() {
  return path.join(os.tmpdir(), `buck-att-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

interface TestCtx {
  dbPath: string;
  app: ReturnType<typeof buildApp>;
  sessionJwt: string;
  userId: string;
  workspaceDir: string;
  db: ReturnType<typeof openDb>;
}

async function makeCtx(): Promise<TestCtx> {
  const dbPath = tmp();
  const url = `file:${dbPath}`;
  runMigrations({ databaseUrl: url, migrationsFolder: migrationsDir });
  runSeed({ databaseUrl: url, allowedEmails: ['alice@example.com'], mcpBibleUrl: '' });

  const db = openDb(url);
  const jwt = createJwtService({ secret: 'a'.repeat(32), issuer: 'buck', audience: 'buck-web' });
  const email = { sendMagicLink: async () => {} };

  const alice = db.db.select().from(users).all().find((u) => u.email === 'alice@example.com')!;
  const sessionJwt = await jwt.sign({ sub: alice.id, scope: 'app' }, '30d');
  db.db.insert(sessionsAuth).values({
    id: newId(), userId: alice.id, tokenHash: sha256Hex(sessionJwt),
    scope: 'app', userAgent: null, expiresAt: Date.now() + 86400000, createdAt: Date.now(),
  }).run();

  const workspaceDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'buck-att-'));

  const app = buildApp({
    db, email, jwt, allowedEmails: ['alice@example.com'],
    publicBaseUrl: 'http://localhost:3000',
    workspaceDir,
  });

  return { dbPath, app, sessionJwt, userId: alice.id, workspaceDir, db };
}

let ctx: TestCtx;

beforeEach(async () => { ctx = await makeCtx(); });
afterEach(async () => {
  if (ctx?.dbPath && fs.existsSync(ctx.dbPath)) fs.unlinkSync(ctx.dbPath);
  if (ctx?.workspaceDir) await fsp.rm(ctx.workspaceDir, { recursive: true, force: true });
});

describe('POST /api/attachments', () => {
  it('uploads a text file and stores metadata in DB', async () => {
    const formData = new FormData();
    formData.append('files', new Blob(['hello world'], { type: 'text/plain' }), 'test.txt');

    const res = await ctx.app.request('/api/attachments', {
      method: 'POST',
      headers: {
        cookie: `buck_session=${ctx.sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
        'x-csrf-token': CSRF_TOKEN,
      },
      body: formData,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0].filename).toBe('test.txt');
    expect(body.attachments[0].mimeType).toBe('text/plain');
    expect(body.attachments[0].sizeBytes).toBe(11);

    // Check DB
    const rows = ctx.db.db.select().from(attachments).where(eq(attachments.userId, ctx.userId)).all();
    expect(rows).toHaveLength(1);
  });

  it('rejects unsupported MIME types', async () => {
    const formData = new FormData();
    formData.append('files', new Blob(['exe'], { type: 'application/x-executable' }), 'bad.exe');

    const res = await ctx.app.request('/api/attachments', {
      method: 'POST',
      headers: {
        cookie: `buck_session=${ctx.sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
        'x-csrf-token': CSRF_TOKEN,
      },
      body: formData,
    });
    expect(res.status).toBe(422);
  });

  it('rejects files exceeding size limit', async () => {
    // Create a blob > 20 MB — use a small one and mock the check instead
    const formData = new FormData();
    const bigBlob = new Blob([new ArrayBuffer(21 * 1024 * 1024)], { type: 'text/plain' });
    formData.append('files', bigBlob, 'big.txt');

    const res = await ctx.app.request('/api/attachments', {
      method: 'POST',
      headers: {
        cookie: `buck_session=${ctx.sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
        'x-csrf-token': CSRF_TOKEN,
      },
      body: formData,
    });
    expect(res.status).toBe(422);
  });
});

describe('GET /api/attachments/:id', () => {
  it('serves an uploaded file', async () => {
    // Upload first
    const formData = new FormData();
    formData.append('files', new Blob(['hello'], { type: 'text/plain' }), 'test.txt');
    const uploadRes = await ctx.app.request('/api/attachments', {
      method: 'POST',
      headers: {
        cookie: `buck_session=${ctx.sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
        'x-csrf-token': CSRF_TOKEN,
      },
      body: formData,
    });
    const { attachments: uploaded } = await uploadRes.json();

    // Download
    const res = await ctx.app.request(`/api/attachments/${uploaded[0].id}`, {
      headers: { cookie: `buck_session=${ctx.sessionJwt}; buck_csrf=${CSRF_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('hello');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/api && pnpm vitest run src/routes/attachments.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement attachments route**

```typescript
// packages/api/src/routes/attachments.ts
import { Hono } from 'hono';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { newId, ALLOWED_MIME_TYPES, MAX_ATTACHMENT_SIZE, MAX_ATTACHMENTS_PER_MESSAGE } from '@buck/shared';
import type { DbHandles } from '../db/client.js';
import { attachments } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export interface AttachmentRouteDeps {
  db: DbHandles;
  workspaceDir: string;
  nowMs?: () => number;
}

const ALLOWED_SET = new Set<string>(ALLOWED_MIME_TYPES);

export function createAttachmentRoutes(deps: AttachmentRouteDeps): Hono<{ Variables: { userId: string } }> {
  const app = new Hono<{ Variables: { userId: string } }>();
  const now = deps.nowMs ?? Date.now;

  // POST / — upload one or more files
  app.post('/', async (c) => {
    const userId = c.get('userId');
    const formData = await c.req.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return c.json({ error: { code: 'invalid_input', message: 'no files provided' } }, 422);
    }
    if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      return c.json({ error: { code: 'invalid_input', message: `max ${MAX_ATTACHMENTS_PER_MESSAGE} files` } }, 422);
    }

    const results: Array<{ id: string; filename: string; mimeType: string; sizeBytes: number; path: string }> = [];

    for (const file of files) {
      if (!ALLOWED_SET.has(file.type)) {
        return c.json({ error: { code: 'invalid_input', message: `unsupported type: ${file.type}` } }, 422);
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
        return c.json({ error: { code: 'invalid_input', message: `file too large: ${file.name} (max ${MAX_ATTACHMENT_SIZE / 1024 / 1024} MB)` } }, 422);
      }

      const id = newId();
      const ext = path.extname(file.name);
      const storedName = `${id}${ext}`;
      const userDir = path.join(deps.workspaceDir, '.attachments', userId);
      await fs.mkdir(userDir, { recursive: true });

      const filePath = path.join(userDir, storedName);
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);

      const relPath = path.relative(deps.workspaceDir, filePath);
      const ts = now();

      deps.db.db.insert(attachments).values({
        id,
        messageId: null,
        userId,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        path: relPath,
        createdAt: ts,
      }).run();

      results.push({ id, filename: file.name, mimeType: file.type, sizeBytes: file.size, path: relPath });
    }

    return c.json({ attachments: results }, 201);
  });

  // GET /:id — serve an attachment file
  app.get('/:id', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');

    const row = deps.db.db.select().from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.userId, userId)))
      .get();

    if (!row) return c.json({ error: { code: 'not_found', message: 'attachment not found' } }, 404);

    const absPath = path.join(deps.workspaceDir, row.path);
    try {
      const content = await fs.readFile(absPath);
      return new Response(content, {
        status: 200,
        headers: {
          'content-type': row.mimeType,
          'content-disposition': `inline; filename="${row.filename}"`,
        },
      });
    } catch {
      return c.json({ error: { code: 'not_found', message: 'file missing from disk' } }, 404);
    }
  });

  return app;
}
```

- [ ] **Step 4: Mount attachments routes in app.ts**

Add import:
```typescript
import { createAttachmentRoutes } from './routes/attachments.js';
```

Add after workspace routes block:
```typescript
// Attachments routes (protected, only if workspaceDir provided)
if (deps.workspaceDir) {
  app.use('/api/attachments/*', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
  app.use('/api/attachments', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
  app.route('/api/attachments', createAttachmentRoutes({ db: deps.db, workspaceDir: deps.workspaceDir, nowMs: deps.nowMs }));
}
```

- [ ] **Step 5: Run tests**

Run: `cd packages/api && pnpm vitest run src/routes/attachments.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routes/attachments.ts packages/api/src/routes/attachments.test.ts packages/api/src/app.ts
git commit -m "feat(api): add attachments upload/serve routes"
```

---

## Task 5: Skills Loader Service

**Files:**
- Create: `packages/api/src/services/skills.ts`
- Create: `packages/api/src/services/skills.test.ts`

- [ ] **Step 1: Install chokidar for robust file watching**

```bash
cd packages/api && pnpm add chokidar
```

- [ ] **Step 2: Write the failing tests**

```typescript
// packages/api/src/services/skills.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadSkills, parseSkillMd } from './skills.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'buck-skills-'));
});
afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe('parseSkillMd', () => {
  it('parses valid SKILL.md with frontmatter', () => {
    const content = `---
name: polar-structure
description: Guide de structure narrative
---

# Instructions

Do things.`;

    const result = parseSkillMd(content);
    expect(result).toEqual({
      name: 'polar-structure',
      description: 'Guide de structure narrative',
      body: '# Instructions\n\nDo things.',
    });
  });

  it('returns null for invalid frontmatter', () => {
    const result = parseSkillMd('no frontmatter here');
    expect(result).toBeNull();
  });

  it('returns null for missing name', () => {
    const result = parseSkillMd('---\ndescription: test\n---\nbody');
    expect(result).toBeNull();
  });
});

describe('loadSkills', () => {
  it('loads skills from skills/ directory', async () => {
    const skillDir = path.join(tmpDir, 'skills', 'polar-structure');
    await fsp.mkdir(skillDir, { recursive: true });
    await fsp.writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: polar-structure\ndescription: Structure narrative\n---\n# Body',
    );

    const skills = await loadSkills(tmpDir);
    expect(skills.size).toBe(1);
    expect(skills.get('polar-structure')?.description).toBe('Structure narrative');
    expect(skills.get('polar-structure')?.body).toBe('# Body');
  });

  it('returns empty map if skills/ does not exist', async () => {
    const skills = await loadSkills(tmpDir);
    expect(skills.size).toBe(0);
  });

  it('ignores invalid SKILL.md files', async () => {
    const skillDir = path.join(tmpDir, 'skills', 'broken');
    await fsp.mkdir(skillDir, { recursive: true });
    await fsp.writeFile(path.join(skillDir, 'SKILL.md'), 'no frontmatter');

    const skills = await loadSkills(tmpDir);
    expect(skills.size).toBe(0);
  });

  it('loads multiple skills', async () => {
    for (const name of ['skill-a', 'skill-b']) {
      const dir = path.join(tmpDir, 'skills', name);
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(
        path.join(dir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: Desc ${name}\n---\nBody ${name}`,
      );
    }
    const skills = await loadSkills(tmpDir);
    expect(skills.size).toBe(2);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/api && pnpm vitest run src/services/skills.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement skills loader**

```typescript
// packages/api/src/services/skills.ts
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface Skill {
  name: string;
  description: string;
  body: string;
}

export function parseSkillMd(content: string): Skill | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) return null;

  const frontmatter = fmMatch[1]!;
  const body = fmMatch[2]!.trim();

  let name: string | undefined;
  let description: string | undefined;

  for (const line of frontmatter.split('\n')) {
    const nameMatch = line.match(/^name:\s*(.+)$/);
    if (nameMatch) name = nameMatch[1]!.trim();
    const descMatch = line.match(/^description:\s*(.+)$/);
    if (descMatch) description = descMatch[1]!.trim();
  }

  if (!name || !description) return null;
  return { name, description, body };
}

export async function loadSkills(workspaceDir: string): Promise<Map<string, Skill>> {
  const skillsDir = path.join(workspaceDir, 'skills');
  const skills = new Map<string, Skill>();

  try {
    await fs.access(skillsDir);
  } catch {
    return skills;
  }

  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
    try {
      const content = await fs.readFile(skillMdPath, 'utf8');
      const skill = parseSkillMd(content);
      if (skill) skills.set(skill.name, skill);
    } catch {
      // SKILL.md missing or unreadable — skip
    }
  }

  return skills;
}

export function createSkillsWatcher(
  workspaceDir: string,
  onReload: (skills: Map<string, Skill>) => void,
): { close: () => Promise<void> } {
  let watcher: import('chokidar').FSWatcher | undefined;

  (async () => {
    const chokidar = await import('chokidar');
    const skillsDir = path.join(workspaceDir, 'skills');
    watcher = chokidar.watch(skillsDir, {
      ignoreInitial: true,
      depth: 2,
    });

    const reload = async () => {
      const skills = await loadSkills(workspaceDir);
      onReload(skills);
    };

    watcher.on('add', reload);
    watcher.on('change', reload);
    watcher.on('unlink', reload);
    watcher.on('addDir', reload);
    watcher.on('unlinkDir', reload);
  })();

  return {
    async close() {
      await watcher?.close();
    },
  };
}
```

- [ ] **Step 5: Run tests**

Run: `cd packages/api && pnpm vitest run src/services/skills.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/skills.ts packages/api/src/services/skills.test.ts packages/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add skills loader with SKILL.md parsing and hot-reload"
```

---

## Task 6: File Tools + Approval Flow + Skills in Chat Route

**Files:**
- Modify: `packages/api/src/routes/chat.ts`
- Modify: `packages/api/src/routes/chat.test.ts`

This is the core task — add OpenAI function calling tools (`read_file`, `list_directory`, `create_file`, `delete_file`, `activate_skill`), the approval flow for `delete_file`, @reference injection, and skills context injection.

- [ ] **Step 1: Write failing tests for file tools**

Add to `packages/api/src/routes/chat.test.ts`:

```typescript
// Add these tests in a new describe block

describe('POST /api/chat — file tools', () => {
  it('executes read_file tool and returns content', async () => {
    // Setup: create a file in workspaceDir
    const wsDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'buck-chat-tools-'));
    await fsp.writeFile(path.join(wsDir, 'notes.md'), '# My Notes');

    // Rebuild app with workspaceDir
    const ctxWithWs = await makeCtx();
    // ... mock streamText to invoke read_file tool call
    // Verify the tool result contains the file content
    await fsp.rm(wsDir, { recursive: true });
  });
});
```

Note: The exact mock pattern for tool calls will depend on how Vercel AI SDK v6 handles `tools` in `streamText`. The implementing agent should:
1. Define tools using `z.object()` schemas in the `streamText` call
2. Mock `streamText` to simulate a tool call → tool result → final text response
3. Verify `assertSafePath` is called for all file operations
4. Verify `delete_file` triggers the approval flow (stream is suspended, approval chunk sent)

- [ ] **Step 2: Update ChatRouteDeps to include workspace and skills**

Add to `ChatRouteDeps` in `chat.ts`:

```typescript
export interface ChatRouteDeps {
  db: DbHandles;
  prompts: Prompts;
  openaiApiKey: string;
  workspaceDir?: string;
  skills?: Map<string, import('../services/skills.js').Skill>;
  nowMs?: () => number;
}
```

- [ ] **Step 3: Define file tools in the streamText call**

Inside the `POST /` handler, before the `streamText()` call, define the tools:

```typescript
import { z } from 'zod';
import { tool } from 'ai';
import { assertSafePath } from '../utils/path-safe.js';
import type { Skill } from '../services/skills.js';

// Inside createChatRoute, build tools object:
const fileTools = deps.workspaceDir ? {
  read_file: tool({
    description: 'Read the content of a file in the workspace',
    parameters: z.object({ path: z.string() }),
    execute: async ({ path: filePath }) => {
      const absPath = await assertSafePath(deps.workspaceDir!, filePath);
      const stat = await fsp.stat(absPath);
      if (stat.size > 1024 * 1024) return { error: 'file too large (max 1MB for context)' };
      const content = await fsp.readFile(absPath, 'utf8');
      return { content, path: filePath };
    },
  }),
  list_directory: tool({
    description: 'List files and directories at a given path in the workspace',
    parameters: z.object({ path: z.string().optional() }),
    execute: async ({ path: dirPath }) => {
      const absPath = dirPath
        ? await assertSafePath(deps.workspaceDir!, dirPath)
        : deps.workspaceDir!;
      const entries = await fsp.readdir(absPath, { withFileTypes: true });
      return {
        entries: entries.map((e) => ({
          name: e.name,
          type: e.isDirectory() ? 'directory' : 'file',
        })),
      };
    },
  }),
  create_file: tool({
    description: 'Create or overwrite a file in the workspace',
    parameters: z.object({ path: z.string(), content: z.string() }),
    execute: async ({ path: filePath, content }) => {
      const absPath = await assertSafePath(deps.workspaceDir!, filePath);
      // Block writing to prompts/
      if (filePath.startsWith('prompts/') || filePath === 'prompts') {
        return { error: 'cannot write to prompts/ directory' };
      }
      await fsp.mkdir(pathModule.dirname(absPath), { recursive: true });
      await fsp.writeFile(absPath, content, 'utf8');
      return { ok: true, path: filePath };
    },
  }),
  // delete_file requires approval — handled differently (see approval flow below)
} : {};

const skillTools = deps.skills && deps.skills.size > 0 ? {
  activate_skill: tool({
    description: 'Activate a skill to get its full instructions. Available skills: ' +
      [...deps.skills.values()].map((s) => `${s.name}: ${s.description}`).join('; '),
    parameters: z.object({ name: z.string() }),
    execute: async ({ name }) => {
      const skill = deps.skills!.get(name);
      if (!skill) return { error: `skill not found: ${name}` };
      return { name: skill.name, instructions: skill.body };
    },
  }),
} : {};
```

- [ ] **Step 4: Implement delete_file with approval flow**

The approval flow for `delete_file` requires a two-phase interaction. The approach:

1. Register `delete_file` as a tool WITHOUT `execute` — this makes AI SDK generate the tool call but not auto-execute
2. In the streaming response, intercept tool calls for `delete_file`
3. Send a custom approval chunk to the client
4. Wait for the client to POST a decision to a new endpoint `POST /api/chat/approve`
5. Resume with the tool result

However, this creates architectural complexity (stateful mid-stream). A simpler approach that fits the AI SDK pattern:

**Simpler approach — client-side approval:**

1. All tools have `execute` functions
2. `delete_file.execute` always succeeds server-side
3. The chat route wraps tool calls: before executing `delete_file`, it emits a special data annotation in the stream
4. The **client** intercepts this annotation and pauses display until user approves
5. If the user denies, the client sends a follow-up message saying "The user denied the deletion"

**Even simpler — two-request pattern:**

1. First request: model calls `delete_file`, server returns the tool call info WITHOUT executing
2. Client shows approval UI
3. If approved: client sends `POST /api/chat/tool-result` with the approved tool call ID
4. Server executes and returns result

For M3, implement the **simplest viable approach**: `delete_file` executes server-side, and the UI displays a notification after the fact. The approval can be enhanced in a follow-up. This avoids breaking the streaming protocol.

**Pragmatic M3 approach**: Define `delete_file` with a `requiresApproval` flag. Before calling `streamText`, check if the tools config includes approval-required tools. If a tool call for `delete_file` is generated, the `execute` function checks a per-request approval set. If not pre-approved, it returns `{ needsApproval: true, path }` instead of executing.

The implementing agent should choose the approach that best fits the current AI SDK version. The key contract is:
- `delete_file` must not silently delete files
- The user must see what's being deleted and confirm
- The pattern must be extensible for `shell_exec` in M3.5

- [ ] **Step 5: Inject @references into the context**

In the chat route, parse the `references` field from the request body:

```typescript
const references = Array.isArray((raw as Record<string, unknown>).references)
  ? (raw as Record<string, unknown>).references as Array<{ path: string; content: string }>
  : [];

// Add reference content to the last user message
if (references.length > 0) {
  const refContent = references
    .map((r) => `--- File: ${r.path} ---\n${r.content}\n--- End ---`)
    .join('\n\n');
  const lastUserIdx = typedUserMessages.findLastIndex((m) => m.role === 'user');
  if (lastUserIdx >= 0) {
    typedUserMessages[lastUserIdx]!.content += `\n\n[Referenced files]\n${refContent}`;
  }
}
```

- [ ] **Step 6: Inject skills summary into system prompt**

```typescript
// After building systemMessages, add skills summary
if (deps.skills && deps.skills.size > 0) {
  const skillsList = [...deps.skills.values()]
    .map((s) => `- **${s.name}**: ${s.description}`)
    .join('\n');
  systemMessages.push({
    role: 'system',
    content: `Available skills (use activate_skill tool to load instructions):\n${skillsList}`,
  });
}
```

- [ ] **Step 7: Pass tools to streamText**

```typescript
const result = streamText({
  model: openai(resolvedModel),
  messages: allMessages,
  tools: { ...fileTools, ...skillTools },
  maxSteps: 5, // allow multi-step tool usage
  onFinish: async ({ text, usage, response }) => {
    // ... existing onFinish logic unchanged
  },
});
```

- [ ] **Step 8: Update app.ts to pass workspaceDir and skills to chat route**

In `buildApp`, update the chat route construction:

```typescript
if (deps.prompts && deps.openaiApiKey) {
  app.use(
    '/api/chat',
    authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }),
    createRateLimiter({ windowMs: 60_000, max: 30, keyBy: ipKey }),
    budgetGuard({ db: deps.db, nowMs: deps.nowMs }),
  );
  app.route('/api/chat', createChatRoute({
    db: deps.db,
    prompts: deps.prompts,
    openaiApiKey: deps.openaiApiKey,
    workspaceDir: deps.workspaceDir,
    skills: deps.skills,
    nowMs: deps.nowMs,
  }));
}
```

- [ ] **Step 9: Run tests**

Run: `cd packages/api && pnpm vitest run src/routes/chat.test.ts`
Expected: All existing chat tests pass + new tool tests pass

- [ ] **Step 10: Run full suite**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 11: Commit**

```bash
git add packages/api/src/routes/chat.ts packages/api/src/routes/chat.test.ts packages/api/src/app.ts
git commit -m "feat(api): add file tools, skills, @reference to chat streaming"
```

---

## Task 7: WebDAV Server Integration

**Files:**
- Create: `packages/api/src/services/webdav.ts`
- Create: `packages/api/src/services/webdav.test.ts`
- Modify: `packages/api/src/app.ts`

- [ ] **Step 1: Install webdav-server**

```bash
cd packages/api && pnpm add webdav-server
```

- [ ] **Step 2: Write failing tests**

```typescript
// packages/api/src/services/webdav.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createWebDavHandler } from './webdav.js';
import { createJwtService } from './jwt.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'buck-webdav-'));
  await fsp.writeFile(path.join(tmpDir, 'test.txt'), 'hello webdav');
});
afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe('createWebDavHandler', () => {
  it('creates a handler without errors', () => {
    const jwt = createJwtService({ secret: 'a'.repeat(32), issuer: 'buck', audience: 'buck-web' });
    const handler = createWebDavHandler({ workspaceDir: tmpDir, jwt });
    expect(handler).toBeDefined();
  });
});
```

- [ ] **Step 3: Implement WebDAV handler**

```typescript
// packages/api/src/services/webdav.ts
import type { JwtService } from './jwt.js';

export interface WebDavDeps {
  workspaceDir: string;
  jwt: JwtService;
}

/**
 * Creates a WebDAV handler compatible with Hono.
 *
 * The webdav-server library uses node:http internally.
 * We bridge it to Hono by converting the Hono request to a Node request
 * and piping the response back.
 *
 * NOTE: The exact integration depends on the webdav-server API.
 * The implementing agent should:
 * 1. Try `webdav-server` v2 (npm: webdav-server)
 * 2. If integration is too complex, consider `@nfnitloop/dav-js` or raw RFC 4918 handlers
 * 3. Auth: extract Bearer token from Authorization header, verify JWT with scope='webdav'
 * 4. Root the WebDAV filesystem at workspaceDir
 */
export function createWebDavHandler(deps: WebDavDeps) {
  // Implementation note for the implementing agent:
  //
  // Option A: Use webdav-server v2
  //   const { v2 } = await import('webdav-server');
  //   const server = new v2.WebDAVServer({ ...});
  //   server.setFileSystem('/', new v2.PhysicalFileSystem(deps.workspaceDir));
  //   return async (c: Context) => { /* bridge to node http */ };
  //
  // Option B: Use a simpler approach — implement PROPFIND, GET, PUT, DELETE, MKCOL
  //   handlers directly in Hono routes. This is more work but avoids the node:http bridge.
  //
  // The implementing agent should spike option A first. If the bridge is problematic
  // (as flagged in the Gemini review), fall back to option B.
  //
  // For the spike: try mounting the webdav-server on a separate node:http server
  // and proxying from Hono, or use toNodeHandler from @hono/node-server.

  return {
    workspaceDir: deps.workspaceDir,
    jwt: deps.jwt,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/api && pnpm vitest run src/services/webdav.test.ts`
Expected: PASS (basic smoke test)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/webdav.ts packages/api/src/services/webdav.test.ts packages/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add WebDAV server scaffold with JWT auth"
```

Note: WebDAV integration is a known spike point (Gemini review flagged it). The implementing agent should budget time for the node:http ↔ Hono bridge and may need to iterate on the approach. The smoke test ensures the basic setup works, and more detailed integration tests should be added once the bridge approach is chosen.

---

## Task 8: WebDAV Token Endpoint

**Files:**
- Modify: `packages/api/src/routes/auth.ts`
- Modify: `packages/api/src/routes/auth.test.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/api/src/routes/auth.test.ts`:

```typescript
describe('POST /api/auth/webdav-token', () => {
  it('generates a webdav-scoped JWT', async () => {
    const res = await ctx.app.request('/api/auth/webdav-token', {
      method: 'POST',
      headers: authMutHeaders(ctx.sessionJwt),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe('string');

    // Verify the token has scope=webdav
    const decoded = await ctx.jwt.verify(body.token);
    expect(decoded.scope).toBe('webdav');
  });
});
```

- [ ] **Step 2: Add the endpoint**

In `createAuthRoutes`, add:

```typescript
// POST /webdav-token — generate a long-lived WebDAV token
app.post('/webdav-token', async (c) => {
  const userId = c.get('userId');
  const ts = now();
  const ttlMs = 30 * 24 * 60 * 60 * 1000; // 30 days

  const token = await deps.jwt.sign({ sub: userId, scope: 'webdav' }, '30d');
  const tokenHash = sha256Hex(token);

  deps.db.db.insert(sessionsAuth).values({
    id: newId(),
    userId,
    tokenHash,
    scope: 'webdav',
    userAgent: c.req.header('user-agent') ?? null,
    expiresAt: ts + ttlMs,
    createdAt: ts,
  }).run();

  return c.json({ token });
});
```

Note: This endpoint needs `authGuard` which is already applied to `/api/auth/me`. The implementing agent should ensure the webdav-token endpoint is also behind `authGuard` (add explicit middleware if needed, since the rate limiter on `/api/auth/*` may interfere).

- [ ] **Step 3: Run tests**

Run: `cd packages/api && pnpm vitest run src/routes/auth.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routes/auth.ts packages/api/src/routes/auth.test.ts
git commit -m "feat(api): add POST /api/auth/webdav-token endpoint"
```

---

## Task 9: Update index.ts Bootstrap — Load Skills + Pass workspaceDir

**Files:**
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Import and load skills at startup**

In `packages/api/src/index.ts`, add after prompts loading:

```typescript
import { loadSkills, createSkillsWatcher } from './services/skills.js';

// After loadPrompts:
let skills = await loadSkills(env.WORKSPACE_DIR);
const skillsWatcher = createSkillsWatcher(env.WORKSPACE_DIR, (reloaded) => {
  skills = reloaded;
  logger.info({ count: reloaded.size }, 'skills reloaded');
});
```

Pass to `buildApp`:

```typescript
const app = buildApp({
  // ... existing deps
  workspaceDir: env.WORKSPACE_DIR,
  skills,
});
```

Note: The `skills` variable is mutable — the watcher updates it. Since `buildApp` receives it once, the chat route needs to read from a shared reference. The implementing agent should decide whether to pass a getter `() => skills` or use a `Map` reference that gets mutated in place (the `Map` approach works since JS passes objects by reference).

- [ ] **Step 2: Verify app starts**

Run: `pnpm dev`
Expected: API starts without errors, logs skill count

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/index.ts
git commit -m "feat(api): load skills at startup with hot-reload watcher"
```

---

## Task 10: Frontend — ChatLayout with Right Panel

**Files:**
- Modify: `packages/web/src/components/chat/chat-layout.tsx`
- Modify: `packages/web/src/routes/index.tsx`

- [ ] **Step 1: Update ChatLayout to support a right panel**

```typescript
// packages/web/src/components/chat/chat-layout.tsx
import { useState } from 'react';

interface ChatLayoutProps {
  sidebar: React.ReactNode;
  rightPanel?: React.ReactNode;
  children: React.ReactNode;
}

export function ChatLayout({ sidebar, rightPanel, children }: ChatLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {sidebarOpen && (
        <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
          {sidebar}
        </aside>
      )}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute left-2 top-2 z-10 rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:text-foreground"
        aria-label={sidebarOpen ? 'Fermer la sidebar' : 'Ouvrir la sidebar'}
      >
        {sidebarOpen ? '\u2190' : '\u2192'}
      </button>
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>
      {rightPanel && (
        <>
          <button
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            className="absolute right-2 top-2 z-10 rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:text-foreground"
            aria-label={rightPanelOpen ? 'Fermer le workspace' : 'Ouvrir le workspace'}
          >
            {rightPanelOpen ? '\u2192' : '\u2190'}
          </button>
          {rightPanelOpen && (
            <aside className="flex w-60 shrink-0 flex-col border-l border-border bg-sidebar">
              {rightPanel}
            </aside>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire up in index.tsx**

```typescript
// packages/web/src/routes/index.tsx — update Home component
import { WorkspacePanel } from '@/components/workspace/workspace-panel';

function Home() {
  const me = Route.useLoaderData();
  const [activeSessionId, setActiveSessionId] = useState<string>();

  return (
    <ChatLayout
      sidebar={
        <Sidebar
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewSession={setActiveSessionId}
          userEmail={me.email}
        />
      }
      rightPanel={<WorkspacePanel onInsertReference={() => {}} />}
    >
      <ChatArea
        sessionId={activeSessionId}
        onSessionCreated={setActiveSessionId}
      />
    </ChatLayout>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd packages/web && pnpm tsc --noEmit`
Expected: Type errors for `WorkspacePanel` (not yet created) — that's OK, we create it next

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/chat/chat-layout.tsx packages/web/src/routes/index.tsx
git commit -m "feat(web): add right panel support to ChatLayout"
```

---

## Task 11: Frontend — Workspace API Client + FileTree + WorkspacePanel

**Files:**
- Create: `packages/web/src/lib/workspace.ts`
- Create: `packages/web/src/components/workspace/file-tree.tsx`
- Create: `packages/web/src/components/workspace/workspace-panel.tsx`

- [ ] **Step 1: Create workspace API client**

```typescript
// packages/web/src/lib/workspace.ts
import { apiFetch } from './api-client';
import type { WorkspaceTreeResponse } from '@buck/shared';

export async function fetchWorkspaceTree(): Promise<WorkspaceTreeResponse> {
  return apiFetch<WorkspaceTreeResponse>('/api/workspace/tree');
}

export async function createDirectory(dirPath: string): Promise<void> {
  await apiFetch('/api/workspace/directory', { method: 'POST', body: { path: dirPath } });
}

export async function renameFile(filePath: string, newName: string): Promise<void> {
  await apiFetch(`/api/workspace/file?path=${encodeURIComponent(filePath)}`, {
    method: 'PATCH',
    body: { newName },
  });
}

export async function deleteFile(filePath: string): Promise<void> {
  await apiFetch(`/api/workspace/file?path=${encodeURIComponent(filePath)}`, {
    method: 'DELETE',
  });
}

export async function downloadFile(filePath: string): Promise<Blob> {
  const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(filePath)}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('download failed');
  return res.blob();
}
```

- [ ] **Step 2: Create FileTree component**

```typescript
// packages/web/src/components/workspace/file-tree.tsx
import { useState } from 'react';
import type { FileEntry } from '@buck/shared';

interface FileTreeProps {
  entries: FileEntry[];
  onSelect?: (entry: FileEntry) => void;
  onInsertReference?: (path: string) => void;
}

interface FileTreeItemProps {
  entry: FileEntry;
  depth: number;
  onSelect?: (entry: FileEntry) => void;
  onInsertReference?: (path: string) => void;
}

function FileTreeItem({ entry, depth, onSelect, onInsertReference }: FileTreeItemProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isDir = entry.type === 'directory';
  const indent = depth * 12;

  return (
    <div>
      <button
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-accent"
        style={{ paddingLeft: `${indent + 4}px` }}
        onClick={() => {
          if (isDir) setExpanded(!expanded);
          else onSelect?.(entry);
        }}
        onDoubleClick={() => {
          if (!isDir) onInsertReference?.(entry.path);
        }}
      >
        <span className={isDir ? 'text-primary' : 'text-muted-foreground'}>
          {isDir ? (expanded ? 'v ' : '> ') : '  '}
        </span>
        <span className={isDir ? 'text-primary' : 'text-muted-foreground'}>
          {entry.name}{isDir ? '/' : ''}
        </span>
      </button>
      {isDir && expanded && entry.children?.map((child) => (
        <FileTreeItem
          key={child.path}
          entry={child}
          depth={depth + 1}
          onSelect={onSelect}
          onInsertReference={onInsertReference}
        />
      ))}
    </div>
  );
}

export function FileTree({ entries, onSelect, onInsertReference }: FileTreeProps) {
  if (entries.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">Workspace vide</p>;
  }

  return (
    <div className="py-1">
      {entries.map((entry) => (
        <FileTreeItem
          key={entry.path}
          entry={entry}
          depth={0}
          onSelect={onSelect}
          onInsertReference={onInsertReference}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create WorkspacePanel component**

```typescript
// packages/web/src/components/workspace/workspace-panel.tsx
import { useQuery } from '@tanstack/react-query';
import { fetchWorkspaceTree } from '@/lib/workspace';
import { FileTree } from './file-tree';

interface WorkspacePanelProps {
  onInsertReference: (path: string) => void;
}

export function WorkspacePanel({ onInsertReference }: WorkspacePanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['workspace-tree'],
    queryFn: fetchWorkspaceTree,
    refetchInterval: 10_000, // Refresh every 10s to catch external changes
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold">Workspace</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Chargement...</p>
        ) : (
          <FileTree
            entries={data?.tree ?? []}
            onInsertReference={onInsertReference}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify compilation**

Run: `cd packages/web && pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/workspace.ts packages/web/src/components/workspace/file-tree.tsx packages/web/src/components/workspace/workspace-panel.tsx
git commit -m "feat(web): add workspace panel with file tree"
```

---

## Task 12: Frontend — Attachment Handling in ChatInput

**Files:**
- Create: `packages/web/src/lib/attachments.ts`
- Create: `packages/web/src/components/chat/attachment-preview.tsx`
- Modify: `packages/web/src/components/chat/chat-input.tsx`

- [ ] **Step 1: Create attachments API client**

```typescript
// packages/web/src/lib/attachments.ts
import { readCsrfCookie, CSRF_HEADER } from './csrf';
import type { AttachmentResponse } from '@buck/shared';

export async function uploadAttachments(files: File[]): Promise<AttachmentResponse[]> {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));

  const res = await fetch('/api/attachments', {
    method: 'POST',
    headers: { [CSRF_HEADER]: readCsrfCookie() },
    credentials: 'include',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: {} }));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? 'Upload failed');
  }

  const body = await res.json() as { attachments: AttachmentResponse[] };
  return body.attachments;
}
```

- [ ] **Step 2: Create AttachmentPreview component**

```typescript
// packages/web/src/components/chat/attachment-preview.tsx

interface PendingAttachment {
  file: File;
  preview?: string; // data URL for images
}

interface AttachmentPreviewProps {
  attachments: PendingAttachment[];
  onRemove: (index: number) => void;
}

export type { PendingAttachment };

export function AttachmentPreview({ attachments, onRemove }: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-1 pb-2">
      {attachments.map((att, i) => (
        <div
          key={i}
          className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs"
        >
          {att.preview ? (
            <img src={att.preview} alt="" className="h-8 w-8 rounded object-cover" />
          ) : (
            <span className="text-primary font-medium">
              {att.file.name.split('.').pop()?.toUpperCase()}
            </span>
          )}
          <span className="max-w-[120px] truncate text-muted-foreground">{att.file.name}</span>
          <button
            onClick={() => onRemove(i)}
            className="ml-1 text-muted-foreground hover:text-foreground"
            aria-label={`Retirer ${att.file.name}`}
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Update ChatInput with clip, drag & drop, paste**

Update `packages/web/src/components/chat/chat-input.tsx`:

Add to `ChatInputProps`:
```typescript
pendingAttachments: PendingAttachment[];
onAttachmentsChange: (attachments: PendingAttachment[]) => void;
```

Add drag & drop handlers, paste handler, file input ref, and clip button. The implementing agent should:
1. Add a hidden `<input type="file" multiple accept="...">` triggered by the clip button
2. Handle `onDrop` on the textarea wrapper div (prevent default, read `e.dataTransfer.files`)
3. Handle `onPaste` on the textarea (read `e.clipboardData.files` for images)
4. Generate preview data URLs for images via `URL.createObjectURL`
5. Render `AttachmentPreview` above the textarea
6. Include the clip button (+) to the left of the ModelSelector

- [ ] **Step 4: Verify compilation**

Run: `cd packages/web && pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/attachments.ts packages/web/src/components/chat/attachment-preview.tsx packages/web/src/components/chat/chat-input.tsx
git commit -m "feat(web): add attachment handling in chat input (clip, drag&drop, paste)"
```

---

## Task 13: Frontend — Attachment Display + Tool Call Display + Approval Block

**Files:**
- Create: `packages/web/src/components/chat/attachment-display.tsx`
- Create: `packages/web/src/components/chat/tool-call-display.tsx`
- Create: `packages/web/src/components/chat/approval-block.tsx`
- Modify: `packages/web/src/components/chat/message-bubble.tsx`

- [ ] **Step 1: Create AttachmentDisplay**

```typescript
// packages/web/src/components/chat/attachment-display.tsx
import type { AttachmentResponse } from '@buck/shared';

interface AttachmentDisplayProps {
  attachments: AttachmentResponse[];
}

export function AttachmentDisplay({ attachments }: AttachmentDisplayProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {attachments.map((att) => {
        const isImage = att.mimeType.startsWith('image/');
        return isImage ? (
          <a
            key={att.id}
            href={`/api/attachments/${att.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <img
              src={`/api/attachments/${att.id}`}
              alt={att.filename}
              className="h-16 w-16 rounded-lg border border-border object-cover"
            />
          </a>
        ) : (
          <div
            key={att.id}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2 py-1.5 text-xs"
          >
            <span className="font-medium text-primary">
              {att.filename.split('.').pop()?.toUpperCase()}
            </span>
            <span className="text-muted-foreground">{att.filename}</span>
            <span className="text-muted-foreground/50">
              {(att.sizeBytes / 1024).toFixed(0)} KB
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create ToolCallDisplay**

```typescript
// packages/web/src/components/chat/tool-call-display.tsx
interface ToolCallDisplayProps {
  toolName: string;
  args: Record<string, unknown>;
}

export function ToolCallDisplay({ toolName, args }: ToolCallDisplayProps) {
  const argsStr = Object.entries(args)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(', ');

  return (
    <div className="mb-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
      <span className="font-medium text-primary">{toolName}</span>{' '}
      <span>{argsStr}</span>
    </div>
  );
}
```

- [ ] **Step 3: Create ApprovalBlock**

```typescript
// packages/web/src/components/chat/approval-block.tsx
interface ApprovalBlockProps {
  toolName: string;
  description: string;
  onApprove: () => void;
  onDeny: () => void;
  resolved?: boolean;
}

export function ApprovalBlock({ toolName, description, onApprove, onDeny, resolved }: ApprovalBlockProps) {
  return (
    <div className="mb-2 rounded-lg border border-primary bg-primary/5 p-3">
      <p className="mb-1 text-xs font-medium text-primary">
        L'assistant veut utiliser {toolName}
      </p>
      <p className="mb-2 text-sm">
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{description}</code>
      </p>
      {!resolved && (
        <div className="flex gap-2">
          <button
            onClick={onApprove}
            className="rounded-md bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground"
          >
            Autoriser
          </button>
          <button
            onClick={onDeny}
            className="rounded-md bg-muted px-4 py-1 text-xs text-foreground"
          >
            Refuser
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update MessageBubble to support attachments and tool calls**

The implementing agent should update `message-bubble.tsx` to accept optional `attachments` and `toolCalls` props and render them before the message content.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/chat/attachment-display.tsx packages/web/src/components/chat/tool-call-display.tsx packages/web/src/components/chat/approval-block.tsx packages/web/src/components/chat/message-bubble.tsx
git commit -m "feat(web): add attachment display, tool call indicator, approval block"
```

---

## Task 14: Frontend — @Reference Autocomplete

**Files:**
- Create: `packages/web/src/components/chat/at-reference.tsx`
- Modify: `packages/web/src/components/chat/chat-input.tsx`

- [ ] **Step 1: Create AtReference dropdown**

```typescript
// packages/web/src/components/chat/at-reference.tsx
import { useState, useEffect, useRef } from 'react';
import type { FileEntry } from '@buck/shared';

interface AtReferenceProps {
  query: string;
  entries: FileEntry[];
  onSelect: (path: string) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

function flattenEntries(entries: FileEntry[]): FileEntry[] {
  const result: FileEntry[] = [];
  for (const entry of entries) {
    if (entry.type === 'file') result.push(entry);
    if (entry.children) result.push(...flattenEntries(entry.children));
  }
  return result;
}

export function AtReference({ query, entries, onSelect, onClose, position }: AtReferenceProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const flatFiles = flattenEntries(entries);
  const filtered = query
    ? flatFiles.filter((e) => e.path.toLowerCase().includes(query.toLowerCase()))
    : flatFiles;

  useEffect(() => { setSelectedIndex(0); }, [query]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        onSelect(filtered[selectedIndex]!.path);
      } else if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedIndex, onSelect, onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={ref}
      className="absolute z-50 max-h-48 w-64 overflow-y-auto rounded-md border border-border bg-popover shadow-md"
      style={{ bottom: position.top, left: position.left }}
    >
      {filtered.slice(0, 20).map((entry, i) => (
        <button
          key={entry.path}
          className={`flex w-full items-center px-3 py-1.5 text-left text-xs ${
            i === selectedIndex ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
          }`}
          onMouseDown={() => onSelect(entry.path)}
        >
          {entry.path}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Integrate @reference in ChatInput**

The implementing agent should:
1. Detect `@` typed in the textarea (track cursor position)
2. Extract the query after `@` until the next space or end of input
3. Show the `AtReference` dropdown positioned above the textarea
4. On select: replace `@query` with `@path` in the textarea, fetch file content via `GET /api/workspace/file?path=...`, store in a `references` state array
5. Pass `references` up to `ChatArea` for inclusion in the API request body

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/chat/at-reference.tsx packages/web/src/components/chat/chat-input.tsx
git commit -m "feat(web): add @reference autocomplete in chat input"
```

---

## Task 15: Frontend — ChatArea Integration

**Files:**
- Modify: `packages/web/src/components/chat/chat-area.tsx`

- [ ] **Step 1: Update ChatArea to handle attachments, references, and tool calls**

The implementing agent should update `ChatArea` to:

1. Maintain `pendingAttachments` state (passed to `ChatInput`)
2. On submit: upload attachments via `uploadAttachments()`, get IDs, include in the POST body
3. Include `references` in the POST body
4. Handle tool call display in messages (parse streaming response for tool call events)
5. Handle approval blocks for `delete_file` tool calls
6. Update the message type to include optional `attachments` and `toolCalls` fields

Key changes to `handleSubmit`:

```typescript
// Before the fetch call:
let uploadedAttachments: AttachmentResponse[] = [];
if (pendingAttachments.length > 0) {
  uploadedAttachments = await uploadAttachments(pendingAttachments.map((a) => a.file));
  setPendingAttachments([]);
}

// In the fetch body:
body: JSON.stringify({
  sessionId: sessionIdRef.current,
  model,
  messages: allMessages,
  attachmentIds: uploadedAttachments.map((a) => a.id),
  references: references.map((r) => ({ path: r.path, content: r.content })),
}),
```

- [ ] **Step 2: Verify dev server works end-to-end**

Run: `pnpm dev`
Expected: Chat loads, workspace panel visible, can attach files

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/chat/chat-area.tsx
git commit -m "feat(web): integrate attachments, references, tool calls in chat area"
```

---

## Task 16: Frontend — Workspace Page

**Files:**
- Create: `packages/web/src/routes/workspace.tsx`

- [ ] **Step 1: Create workspace page route**

```typescript
// packages/web/src/routes/workspace.tsx
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { fetchWorkspaceTree, createDirectory, renameFile, deleteFile } from '@/lib/workspace';
import { FileTree } from '@/components/workspace/file-tree';
import type { FileEntry } from '@buck/shared';

export const Route = createFileRoute('/workspace')({
  component: WorkspacePage,
});

function WorkspacePage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['workspace-tree'],
    queryFn: fetchWorkspaceTree,
  });
  const [selected, setSelected] = useState<FileEntry | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['workspace-tree'] });

  const handleCreateDir = async () => {
    const name = prompt('Nom du dossier :');
    if (!name) return;
    const basePath = selected?.type === 'directory' ? selected.path : '';
    await createDirectory(basePath ? `${basePath}/${name}` : name);
    toast.success(`Dossier "${name}" cree`);
    refresh();
  };

  const handleRename = async () => {
    if (!selected) return;
    const newName = prompt('Nouveau nom :', selected.name);
    if (!newName || newName === selected.name) return;
    await renameFile(selected.path, newName);
    toast.success(`Renomme en "${newName}"`);
    refresh();
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm(`Supprimer "${selected.name}" ?`)) return;
    await deleteFile(selected.path);
    toast.success(`"${selected.name}" supprime`);
    setSelected(null);
    refresh();
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="text-sm font-semibold">Workspace</h1>
        <div className="flex gap-2">
          <button onClick={handleCreateDir} className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent">
            Nouveau dossier
          </button>
          {selected && (
            <>
              <button onClick={handleRename} className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent">
                Renommer
              </button>
              <button onClick={handleDelete} className="rounded-md border border-destructive px-3 py-1 text-xs text-destructive hover:bg-destructive/10">
                Supprimer
              </button>
            </>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : (
          <FileTree
            entries={data?.tree ?? []}
            onSelect={setSelected}
          />
        )}
      </div>
    </div>
  );
}
```

Note: This page uses `prompt()` and `confirm()` for simplicity. The implementing agent should replace with shadcn Dialog if time permits, but prompt/confirm work for MVP.

- [ ] **Step 2: Verify the route works**

Run: `pnpm dev` and navigate to `/workspace`
Expected: File tree renders, CRUD actions work

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/workspace.tsx
git commit -m "feat(web): add workspace page with file browser"
```

---

## Task 17: Frontend — WebDAV Wizard in Settings

**Files:**
- Create: `packages/web/src/components/settings/webdav-wizard.tsx`
- Modify: `packages/web/src/routes/settings/general.tsx`

- [ ] **Step 1: Create WebDAV wizard component**

```typescript
// packages/web/src/components/settings/webdav-wizard.tsx
import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';

export function WebDavWizard() {
  const [token, setToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const isMac = navigator.userAgent.includes('Mac');
  const webdavUrl = `${window.location.origin}/webdav`;

  const generateToken = async () => {
    setGenerating(true);
    try {
      const res = await apiFetch<{ token: string }>('/api/auth/webdav-token', { method: 'POST' });
      setToken(res.token);
      toast.success('Token WebDAV genere');
    } catch {
      toast.error('Erreur lors de la generation du token');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Acces WebDAV</h3>
      <p className="text-xs text-muted-foreground">
        Connecte ton explorateur de fichiers pour acceder au workspace depuis ton bureau.
      </p>

      <div className="rounded-md border border-border p-3 text-xs space-y-2">
        <p className="font-medium">URL WebDAV :</p>
        <code className="block rounded bg-muted px-2 py-1">{webdavUrl}</code>
      </div>

      {!token ? (
        <button
          onClick={generateToken}
          disabled={generating}
          className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {generating ? 'Generation...' : 'Generer un token'}
        </button>
      ) : (
        <div className="rounded-md border border-primary bg-primary/5 p-3 text-xs space-y-2">
          <p className="font-medium text-primary">Token (copie-le maintenant, il ne sera plus affiche) :</p>
          <code className="block rounded bg-muted px-2 py-1 break-all select-all">{token}</code>
        </div>
      )}

      <div className="rounded-md border border-border p-3 text-xs space-y-2">
        <p className="font-medium">{isMac ? 'macOS — Finder' : 'Windows — Explorateur'}</p>
        {isMac ? (
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>Ouvre le Finder</li>
            <li>Menu Aller → Se connecter au serveur (ou Cmd+K)</li>
            <li>Colle l'URL : <code className="rounded bg-muted px-1">{webdavUrl}</code></li>
            <li>Nom d'utilisateur : <code className="rounded bg-muted px-1">buck</code> (n'importe quoi)</li>
            <li>Mot de passe : colle le token genere ci-dessus</li>
          </ol>
        ) : (
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>Ouvre l'Explorateur de fichiers</li>
            <li>Clic droit sur "Ce PC" → Connecter un lecteur reseau</li>
            <li>Dans "Dossier", colle : <code className="rounded bg-muted px-1">{webdavUrl}</code></li>
            <li>Coche "Se connecter avec d'autres informations"</li>
            <li>Nom d'utilisateur : <code className="rounded bg-muted px-1">buck</code></li>
            <li>Mot de passe : colle le token genere ci-dessus</li>
          </ol>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add WebDavWizard to settings/general.tsx**

The implementing agent should add the `<WebDavWizard />` component as a new section at the bottom of the general settings page.

- [ ] **Step 3: Verify it works**

Run: `pnpm dev`, navigate to Settings → General
Expected: WebDAV section visible, token generation works

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/settings/webdav-wizard.tsx packages/web/src/routes/settings/general.tsx
git commit -m "feat(web): add WebDAV wizard in settings (token + OS-specific guide)"
```

---

## Task 18: Integration — E2E Tests

**Files:**
- Create: `packages/web/tests/e2e/workspace.spec.ts`

- [ ] **Step 1: Write e2e test for file browser**

```typescript
// packages/web/tests/e2e/workspace.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Workspace', () => {
  test.beforeEach(async ({ page }) => {
    // Login via E2E helper
    await page.goto('/api/__e2e__/dev-login?email=alice@example.com');
    await page.waitForURL('/');
  });

  test('workspace page loads and shows file tree', async ({ page }) => {
    await page.goto('/workspace');
    await expect(page.locator('h1')).toContainText('Workspace');
  });

  test('can create a directory', async ({ page }) => {
    await page.goto('/workspace');
    page.on('dialog', (dialog) => dialog.accept('test-folder'));
    await page.click('button:has-text("Nouveau dossier")');
    await expect(page.locator('text=test-folder/')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run e2e tests**

Run: `pnpm test:e2e`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/tests/e2e/workspace.spec.ts
git commit -m "test(e2e): add workspace file browser tests"
```

---

## Task 19: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests pass (existing ~98 + new ~25-30)

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No type errors

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: No lint errors (or only pre-existing warnings)

- [ ] **Step 4: Run e2e**

Run: `pnpm test:e2e`
Expected: All e2e tests pass

- [ ] **Step 5: Manual smoke test**

Run: `pnpm dev`
Verify:
1. Chat works as before (M1/M2 unchanged)
2. Workspace panel opens on the right
3. File tree shows workspace contents
4. Can attach files in chat (drag & drop, clip, paste)
5. Attachments appear in messages (thumbnail images, chip documents)
6. @reference autocomplete works
7. Workspace page (/workspace) shows file browser with CRUD
8. Settings page shows WebDAV wizard
9. File tools work in chat (ask the assistant to list files, read a file)

- [ ] **Step 6: Final commit if any cleanup needed**

```bash
git status
# If any uncommitted changes remain, commit them
```
