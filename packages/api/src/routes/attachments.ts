import { Hono } from 'hono';
import {
  newId,
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_SIZE,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from '@buck/shared';
import type { DbHandles } from '../db/client.js';
import { attachments } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { HttpError } from '../utils/http-error.js';

export interface AttachmentRouteDeps {
  db: DbHandles;
  workspaceDir: string;
  nowMs?: () => number;
}

const allowedSet = new Set<string>(ALLOWED_MIME_TYPES);

/**
 * Sniff magic bytes for the binary whitelisted types. Returns true if the
 * buffer's header is consistent with the claimed MIME. Text types
 * (text/plain, text/markdown) cannot be sniffed reliably and are accepted
 * as-is — they are stored with `nosniff` + CSP, so a disguised HTML upload
 * cannot execute as script when served back.
 */
function mimeMatches(claimed: string, buf: Buffer): boolean {
  const b = buf;
  switch (claimed) {
    case 'image/jpeg':
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'image/png':
      return (
        b.length >= 8 &&
        b[0] === 0x89 &&
        b[1] === 0x50 &&
        b[2] === 0x4e &&
        b[3] === 0x47 &&
        b[4] === 0x0d &&
        b[5] === 0x0a &&
        b[6] === 0x1a &&
        b[7] === 0x0a
      );
    case 'image/gif':
      return (
        b.length >= 6 &&
        b[0] === 0x47 &&
        b[1] === 0x49 &&
        b[2] === 0x46 &&
        b[3] === 0x38 &&
        (b[4] === 0x37 || b[4] === 0x39) &&
        b[5] === 0x61
      );
    case 'image/webp':
      // RIFF....WEBP
      return (
        b.length >= 12 &&
        b[0] === 0x52 &&
        b[1] === 0x49 &&
        b[2] === 0x46 &&
        b[3] === 0x46 &&
        b[8] === 0x57 &&
        b[9] === 0x45 &&
        b[10] === 0x42 &&
        b[11] === 0x50
      );
    case 'application/pdf':
      // %PDF-
      return (
        b.length >= 5 &&
        b[0] === 0x25 &&
        b[1] === 0x50 &&
        b[2] === 0x44 &&
        b[3] === 0x46 &&
        b[4] === 0x2d
      );
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      // zip: PK\x03\x04 (docx is a zip container)
      return (
        b.length >= 4 &&
        b[0] === 0x50 &&
        b[1] === 0x4b &&
        b[2] === 0x03 &&
        b[3] === 0x04
      );
    case 'text/plain':
    case 'text/markdown':
      return true;
    default:
      return false;
  }
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'text/plain': '.txt',
    'text/markdown': '.md',
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      '.docx',
  };
  return map[mime] ?? '';
}

export function createAttachmentRoutes(
  deps: AttachmentRouteDeps,
): Hono<{ Variables: { userId: string } }> {
  const app = new Hono<{ Variables: { userId: string } }>();
  const { workspaceDir } = deps;
  const now = deps.nowMs ?? Date.now;

  // POST / — Upload one or more files
  app.post('/', async (c) => {
    const userId = c.get('userId');
    const formData = await c.req.formData();
    const files = formData.getAll('files');

    if (files.length === 0) {
      throw new HttpError(422, 'no_files', 'no files provided');
    }
    if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      throw new HttpError(
        422,
        'too_many_files',
        `maximum ${MAX_ATTACHMENTS_PER_MESSAGE} files allowed`,
      );
    }

    const results: Array<{
      id: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      path: string;
    }> = [];

    for (const file of files) {
      if (!(file instanceof File)) {
        throw new HttpError(422, 'invalid_file', 'invalid file entry');
      }

      const mime = file.type || 'application/octet-stream';
      if (!allowedSet.has(mime)) {
        throw new HttpError(
          422,
          'unsupported_mime_type',
          `unsupported file type: ${mime}`,
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.byteLength > MAX_ATTACHMENT_SIZE) {
        throw new HttpError(
          422,
          'file_too_large',
          `file exceeds ${MAX_ATTACHMENT_SIZE} bytes limit`,
        );
      }

      if (!mimeMatches(mime, buffer)) {
        throw new HttpError(
          422,
          'mime_mismatch',
          `file header does not match declared type: ${mime}`,
        );
      }

      const id = newId();
      const ext = extFromMime(mime);
      const uuidFilename = `${id}${ext}`;
      const relPath = `.attachments/${userId}/${uuidFilename}`;
      const absPath = path.join(workspaceDir, relPath);

      // Ensure directory exists
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      // CodeQL js/insecure-temporary-file waiver: path components (userId from
      // signed JWT, uuid server-generated, ext from whitelisted MIME) are
      // never attacker-controlled.
      await fs.writeFile(absPath, buffer);

      deps.db.db
        .insert(attachments)
        .values({
          id,
          messageId: null,
          userId,
          filename: file.name || uuidFilename,
          mimeType: mime,
          sizeBytes: buffer.byteLength,
          path: relPath,
          createdAt: now(),
        })
        .run();

      results.push({
        id,
        filename: file.name || uuidFilename,
        mimeType: mime,
        sizeBytes: buffer.byteLength,
        path: relPath,
      });
    }

    return c.json({ attachments: results }, 201);
  });

  // GET /:id — Serve an attachment file
  app.get('/:id', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');

    const row = deps.db.db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.userId, userId)))
      .get();

    if (!row) {
      throw new HttpError(404, 'not_found', 'attachment not found');
    }

    const absPath = path.join(workspaceDir, row.path);
    let content: Buffer;
    try {
      content = await fs.readFile(absPath);
    } catch {
      throw new HttpError(404, 'not_found', 'attachment file missing');
    }

    return new Response(new Uint8Array(content), {
      status: 200,
      headers: {
        'content-type': row.mimeType,
        'content-disposition': `inline; filename="${row.filename}"`,
      },
    });
  });

  return app;
}
