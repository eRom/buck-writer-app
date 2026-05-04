import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { createAttachmentRoutes } from './attachments.js';
import { runMigrations } from '../db/migrate.js';
import { openDb } from '../db/client.js';
import type { DbHandles } from '../db/client.js';
import { users, sessionsAuth, attachments } from '../db/schema.js';
import { createJwtService } from '../services/jwt.js';
import { sha256Hex } from '../utils/crypto.js';
import { newId } from '@buck/shared';
import { authGuard } from '../middleware/auth.js';
import { HttpError } from '../utils/http-error.js';
import { eq } from 'drizzle-orm';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');

const jwt = createJwtService({
  secret: 'a'.repeat(32),
  issuer: 'buck',
  audience: 'buck-web',
});

interface Ctx {
  db: DbHandles;
  dbPath: string;
  workspaceDir: string;
  userId: string;
  token: string;
  csrfToken: string;
  app: Hono;
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
});

async function makeCtx(): Promise<Ctx> {
  const dbPath = path.join(
    os.tmpdir(),
    `buck-attach-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );
  runMigrations({
    databaseUrl: `file:${dbPath}`,
    migrationsFolder: migrationsDir,
  });
  const db = openDb(`file:${dbPath}`);

  const workspaceDir = path.join(
    os.tmpdir(),
    `buck-ws-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
  );
  fs.mkdirSync(workspaceDir, { recursive: true });

  const userId = newId();
  db.db
    .insert(users)
    .values({ id: userId, email: 'test@test.com', createdAt: Date.now() })
    .run();

  const token = await jwt.sign({ sub: userId, scope: 'app' }, '1h');
  db.db
    .insert(sessionsAuth)
    .values({
      id: newId(),
      userId,
      tokenHash: sha256Hex(token),
      scope: 'app',
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    })
    .run();

  const csrfToken = 'test-csrf-token';

  const app = new Hono();
  app.use('*', authGuard({ db, jwt }));
  app.route(
    '/',
    createAttachmentRoutes({ db, workspaceDir }),
  );
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json(err.toJSON(), err.status as ContentfulStatusCode);
    }
    throw err;
  });

  cleanups.push(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(workspaceDir))
      fs.rmSync(workspaceDir, { recursive: true });
  });

  return { db, dbPath, workspaceDir, userId, token, csrfToken, app };
}

function authHeaders(token: string, csrf: string): Record<string, string> {
  return {
    cookie: `buck_session=${token}; buck_csrf=${csrf}`,
    'x-csrf-token': csrf,
  };
}

describe('POST /api/attachments', () => {
  it('uploads a text file and stores metadata in DB', async () => {
    const ctx = await makeCtx();
    const form = new FormData();
    form.append(
      'files',
      new Blob(['hello world'], { type: 'text/plain' }),
      'hello.txt',
    );

    const res = await ctx.app.request('/', {
      method: 'POST',
      body: form,
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      attachments: Array<{
        id: string;
        filename: string;
        mimeType: string;
        sizeBytes: number;
        path: string;
      }>;
    };
    expect(body.attachments).toHaveLength(1);
    const att = body.attachments[0]!;
    expect(att.filename).toBe('hello.txt');
    expect(att.mimeType).toBe('text/plain');
    expect(att.sizeBytes).toBe(11);
    expect(att.path).toContain('.attachments/');

    // Verify DB row
    const row = ctx.db.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, att.id))
      .get();
    expect(row).toBeDefined();
    expect(row!.filename).toBe('hello.txt');
    expect(row!.userId).toBe(ctx.userId);

    // Verify file on disk
    const absPath = path.join(ctx.workspaceDir, att.path);
    expect(fs.existsSync(absPath)).toBe(true);
    expect(fs.readFileSync(absPath, 'utf8')).toBe('hello world');
  });

  it('rejects unsupported MIME types (422)', async () => {
    const ctx = await makeCtx();
    const form = new FormData();
    form.append(
      'files',
      new Blob(['<html></html>'], { type: 'text/html' }),
      'data.html',
    );

    const res = await ctx.app.request('/', {
      method: 'POST',
      body: form,
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('unsupported_mime_type');
  });

  it('rejects files whose magic bytes do not match declared MIME (image/png with HTML body)', async () => {
    const ctx = await makeCtx();
    const form = new FormData();
    form.append(
      'files',
      new Blob(['<html>not a png</html>'], { type: 'image/png' }),
      'fake.png',
    );

    const res = await ctx.app.request('/', {
      method: 'POST',
      body: form,
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('mime_mismatch');
  });

  it('accepts a PNG with correct magic bytes', async () => {
    const ctx = await makeCtx();
    // Minimal PNG signature
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    const form = new FormData();
    form.append(
      'files',
      new Blob([png], { type: 'image/png' }),
      'ok.png',
    );

    const res = await ctx.app.request('/', {
      method: 'POST',
      body: form,
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });
    expect(res.status).toBe(201);
  });

  it('rejects files exceeding 20MB size limit (422)', async () => {
    const ctx = await makeCtx();
    // Create a blob just over 20MB
    const bigContent = new Uint8Array(20 * 1024 * 1024 + 1);
    const form = new FormData();
    form.append(
      'files',
      new Blob([bigContent], { type: 'text/plain' }),
      'big.txt',
    );

    const res = await ctx.app.request('/', {
      method: 'POST',
      body: form,
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('file_too_large');
  });
});

describe('GET /api/attachments/:id', () => {
  it('serves an uploaded file', async () => {
    const ctx = await makeCtx();

    // Upload first
    const form = new FormData();
    form.append(
      'files',
      new Blob(['test content'], { type: 'text/plain' }),
      'test.txt',
    );
    const uploadRes = await ctx.app.request('/', {
      method: 'POST',
      body: form,
      headers: authHeaders(ctx.token, ctx.csrfToken),
    });
    expect(uploadRes.status).toBe(201);
    const uploadBody = (await uploadRes.json()) as {
      attachments: Array<{ id: string }>;
    };
    const attId = uploadBody.attachments[0]!.id;

    // Serve
    const res = await ctx.app.request(`/${attId}`, {
      headers: { cookie: `buck_session=${ctx.token}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain');
    expect(res.headers.get('content-disposition')).toContain('test.txt');
    const text = await res.text();
    expect(text).toBe('test content');
  });

  it('returns 404 for unknown ID', async () => {
    const ctx = await makeCtx();
    const res = await ctx.app.request(`/${newId()}`, {
      headers: { cookie: `buck_session=${ctx.token}` },
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  it('sanitizes Content-Disposition header against CRLF / quote injection (VULN-001)', async () => {
    const ctx = await makeCtx();

    // Drop the file on disk under the user-scoped attachments dir.
    const attId = newId();
    const relPath = `.attachments/${ctx.userId}/${attId}.txt`;
    const absPath = path.join(ctx.workspaceDir, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, 'payload');

    // Filename containing CRLF (header injection) + double-quote (filename
    // termination) + non-ASCII (Unicode) — must all be neutralised.
    const evilFilename =
      'evil"\r\nSet-Cookie: pwn=1\r\nX-Injected: yes\r\néclair.txt';

    ctx.db.db
      .insert(attachments)
      .values({
        id: attId,
        messageId: null,
        userId: ctx.userId,
        filename: evilFilename,
        mimeType: 'text/plain',
        sizeBytes: 7,
        path: relPath,
        createdAt: Date.now(),
        extractionStatus: 'ok',
      })
      .run();

    const res = await ctx.app.request(`/${attId}`, {
      headers: { cookie: `buck_session=${ctx.token}` },
    });
    expect(res.status).toBe(200);

    const cd = res.headers.get('content-disposition') ?? '';
    // No CRLF survives — would otherwise enable header injection.
    expect(cd).not.toContain('\r');
    expect(cd).not.toContain('\n');
    // No injected response header was emitted server-side.
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(res.headers.get('x-injected')).toBeNull();
    // ASCII fallback uses a single quoted filename — exactly two `"` (open
    // and close), the inner one having been replaced.
    const quoteCount = (cd.match(/"/g) ?? []).length;
    expect(quoteCount).toBe(2);
    // The full UTF-8 form is exposed via RFC 5987 filename*=UTF-8''…
    expect(cd).toMatch(/filename\*=UTF-8''/);
    // Non-ASCII char survives only inside the percent-encoded filename*.
    expect(cd).toContain('%C3%A9'); // 'é' percent-encoded
  });
});

describe('GET /api/attachments/:id/meta', () => {
  it('returns extraction metadata for an owned attachment', async () => {
    const ctx = await makeCtx();
    const attId = newId();
    const extractedText = 'hello world from extraction';
    ctx.db.db
      .insert(attachments)
      .values({
        id: attId,
        messageId: null,
        userId: ctx.userId,
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1234,
        path: `.attachments/${ctx.userId}/${attId}.pdf`,
        createdAt: Date.now(),
        extractedText,
        extractionStatus: 'ok',
        extractionSource: 'markitdown',
        extractedAt: 1_700_000_000,
      })
      .run();

    const res = await ctx.app.request(`/${attId}/meta`, {
      headers: { cookie: `buck_session=${ctx.token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: attId,
      filename: 'doc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1234,
      extractionStatus: 'ok',
      extractionSource: 'markitdown',
      extractionError: null,
      extractedChars: extractedText.length,
      extractedAt: 1_700_000_000,
    });
  });

  it('returns 404 for unknown ID', async () => {
    const ctx = await makeCtx();
    const res = await ctx.app.request(`/${newId()}/meta`, {
      headers: { cookie: `buck_session=${ctx.token}` },
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when attachment belongs to another user', async () => {
    const ctx = await makeCtx();
    const otherUserId = newId();
    ctx.db.db
      .insert(users)
      .values({ id: otherUserId, email: 'other@test.com', createdAt: Date.now() })
      .run();
    const attId = newId();
    ctx.db.db
      .insert(attachments)
      .values({
        id: attId,
        messageId: null,
        userId: otherUserId,
        filename: 'secret.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        path: `.attachments/${otherUserId}/${attId}.pdf`,
        createdAt: Date.now(),
        extractionStatus: 'ok',
      })
      .run();

    const res = await ctx.app.request(`/${attId}/meta`, {
      headers: { cookie: `buck_session=${ctx.token}` },
    });
    expect(res.status).toBe(404);
  });
});
