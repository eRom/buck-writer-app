import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { newId } from '@buck/shared';
import { openDb, type DbHandles } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { users, attachments } from '../db/schema.js';
import {
  extractAttachment,
  truncateForPrompt,
  formatAttachmentBlock,
  PROMPT_TRUNCATION_LIMIT,
} from './attachmentExtractor.js';
import { MarkitdownError, type MarkitdownClient } from './markitdown.js';

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'migrations',
);

function mkClient(convert: MarkitdownClient['convert']): MarkitdownClient {
  return {
    convert,
    health: vi.fn(),
  };
}

interface Ctx {
  db: DbHandles;
  workspaceDir: string;
  userId: string;
  cleanup: () => void;
}

async function makeCtx(): Promise<Ctx> {
  const dbPath = path.join(
    os.tmpdir(),
    `buck-extract-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );
  runMigrations({ databaseUrl: `file:${dbPath}`, migrationsFolder: migrationsDir });
  const db = openDb(`file:${dbPath}`);

  const workspaceDir = path.join(
    os.tmpdir(),
    `buck-ws-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
  );
  fs.mkdirSync(workspaceDir, { recursive: true });

  const userId = newId();
  db.db
    .insert(users)
    .values({ id: userId, email: 't@t.com', createdAt: Date.now() })
    .run();

  return {
    db,
    workspaceDir,
    userId,
    cleanup: () => {
      db.sqlite.close();
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(workspaceDir)) fs.rmSync(workspaceDir, { recursive: true });
    },
  };
}

async function seedAttachment(
  ctx: Ctx,
  opts: {
    filename: string;
    mimeType: string;
    content: Buffer | string;
    relPath?: string;
  },
): Promise<{ id: string; relPath: string }> {
  const relPath = opts.relPath ?? `.attachments/${ctx.userId}/${newId()}-${opts.filename}`;
  const absPath = path.join(ctx.workspaceDir, relPath);
  await fsp.mkdir(path.dirname(absPath), { recursive: true });
  await fsp.writeFile(absPath, opts.content);

  const id = newId();
  ctx.db.db
    .insert(attachments)
    .values({
      id,
      messageId: null,
      userId: ctx.userId,
      filename: opts.filename,
      mimeType: opts.mimeType,
      sizeBytes: Buffer.byteLength(opts.content as never),
      path: relPath,
      createdAt: Date.now(),
    })
    .run();
  return { id, relPath };
}

async function getAtt(ctx: Ctx, id: string) {
  return ctx.db.db.select().from(attachments).where(eq(attachments.id, id)).get()!;
}

describe('extractAttachment', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await makeCtx();
  });
  afterEach(() => ctx.cleanup());

  it('extracts text/plain by reading the file', async () => {
    const { id } = await seedAttachment(ctx, {
      filename: 'notes.txt',
      mimeType: 'text/plain',
      content: 'hello world',
    });
    const row = await getAtt(ctx, id);
    const res = await extractAttachment(row as never, {
      db: ctx.db,
      workspaceDir: ctx.workspaceDir,
    });
    expect(res).toMatchObject({ status: 'ok', source: 'text_file', markdown: 'hello world' });
    const after = await getAtt(ctx, id);
    expect(after.extractionStatus).toBe('ok');
    expect(after.extractedText).toBe('hello world');
    expect(after.extractionSource).toBe('text_file');
  });

  it('extracts application/json as text', async () => {
    const { id } = await seedAttachment(ctx, {
      filename: 'data.json',
      mimeType: 'application/json',
      content: '{"a":1}',
    });
    const row = await getAtt(ctx, id);
    const res = await extractAttachment(row as never, {
      db: ctx.db,
      workspaceDir: ctx.workspaceDir,
    });
    expect(res.status).toBe('ok');
    expect(res.markdown).toBe('{"a":1}');
  });

  it('uses DB cache on second call (no re-extraction)', async () => {
    const { id } = await seedAttachment(ctx, {
      filename: 'doc.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('%PDF-1.4 fake'),
    });
    const convert = vi.fn().mockResolvedValue({
      markdown: '# cached',
      charCount: 8,
      filename: 'doc.pdf',
      ext: '.pdf',
      source: 'text',
    });
    const client = mkClient(convert);
    const deps = { db: ctx.db, workspaceDir: ctx.workspaceDir, markitdown: client };

    const r1 = await extractAttachment((await getAtt(ctx, id)) as never, deps);
    expect(r1.status).toBe('ok');
    expect(r1.cached).toBe(false);
    expect(convert).toHaveBeenCalledTimes(1);

    const r2 = await extractAttachment((await getAtt(ctx, id)) as never, deps);
    expect(r2.status).toBe('ok');
    expect(r2.cached).toBe(true);
    expect(r2.markdown).toBe('# cached');
    expect(convert).toHaveBeenCalledTimes(1);
  });

  it('calls markitdown for PDF and stores the result', async () => {
    const { id } = await seedAttachment(ctx, {
      filename: 'scan.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('%PDF-1.4 fake'),
    });
    const convert = vi.fn().mockResolvedValue({
      markdown: '# OCR',
      charCount: 5,
      filename: 'scan.pdf',
      ext: '.pdf',
      source: 'ocr',
    });
    const res = await extractAttachment((await getAtt(ctx, id)) as never, {
      db: ctx.db,
      workspaceDir: ctx.workspaceDir,
      markitdown: mkClient(convert),
    });
    expect(res).toMatchObject({ status: 'ok', source: 'ocr' });
    expect(convert).toHaveBeenCalledWith(expect.any(Buffer), 'scan.pdf', 'application/pdf');
    const after = await getAtt(ctx, id);
    expect(after.extractionSource).toBe('ocr');
  });

  it('returns skipped when markitdown client is missing', async () => {
    const { id } = await seedAttachment(ctx, {
      filename: 'x.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('%PDF-'),
    });
    const res = await extractAttachment((await getAtt(ctx, id)) as never, {
      db: ctx.db,
      workspaceDir: ctx.workspaceDir,
    });
    expect(res.status).toBe('skipped');
    expect(res.error).toMatch(/worker/);
    const after = await getAtt(ctx, id);
    expect(after.extractionStatus).toBe('skipped');
  });

  it('marks failed on MarkitdownError', async () => {
    const { id } = await seedAttachment(ctx, {
      filename: 'bad.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('%PDF-'),
    });
    const convert = vi.fn().mockRejectedValue(
      new MarkitdownError('worker_error', 'boom', { reason: 'corrupted' }),
    );
    const res = await extractAttachment((await getAtt(ctx, id)) as never, {
      db: ctx.db,
      workspaceDir: ctx.workspaceDir,
      markitdown: mkClient(convert),
    });
    expect(res.status).toBe('failed');
    expect(res.error).toContain('worker_error');
    expect(res.error).toContain('corrupted');
    const after = await getAtt(ctx, id);
    expect(after.extractionStatus).toBe('failed');
    expect(after.extractionError).toContain('worker_error');
  });

  it('skips unsupported mime types (e.g. image/gif)', async () => {
    const { id } = await seedAttachment(ctx, {
      filename: 'a.gif',
      mimeType: 'image/gif',
      content: Buffer.from('GIF89a'),
    });
    const res = await extractAttachment((await getAtt(ctx, id)) as never, {
      db: ctx.db,
      workspaceDir: ctx.workspaceDir,
      markitdown: mkClient(vi.fn()),
    });
    expect(res.status).toBe('skipped');
    expect(res.error).toMatch(/unsupported/);
  });
});

describe('truncateForPrompt', () => {
  it('passes through short content untouched', () => {
    expect(truncateForPrompt('short')).toBe('short');
  });

  it('truncates with head + tail + marker', () => {
    const big = 'x'.repeat(PROMPT_TRUNCATION_LIMIT + 5_000);
    const out = truncateForPrompt(big);
    expect(out).toContain('tronqué');
    expect(out.length).toBeLessThan(big.length);
    // head 18k + marker + tail 2k ≈ 20k + marker
    expect(out.length).toBeGreaterThan(18_000 + 2_000);
  });
});

describe('formatAttachmentBlock', () => {
  it('wraps ok result in <attachment>', () => {
    const block = formatAttachmentBlock('f.pdf', 'application/pdf', {
      markdown: 'hello',
      status: 'ok',
      source: 'text',
      cached: false,
    });
    expect(block).toContain('<attachment filename="f.pdf"');
    expect(block).toContain('mime="application/pdf"');
    expect(block).toContain('hello');
    expect(block).toContain('</attachment>');
  });

  it('returns empty string on non-ok status', () => {
    expect(
      formatAttachmentBlock('x.pdf', 'application/pdf', {
        markdown: '',
        status: 'failed',
        error: 'boom',
        cached: false,
      }),
    ).toBe('');
  });

  it('escapes quotes in filename', () => {
    const block = formatAttachmentBlock('"evil".pdf', 'application/pdf', {
      markdown: 'x',
      status: 'ok',
      cached: false,
    });
    expect(block).toContain('&quot;evil&quot;.pdf');
  });
});
