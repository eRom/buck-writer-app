import * as fs from 'node:fs/promises';
import * as pathModule from 'node:path';
import { eq } from 'drizzle-orm';
import { attachments } from '../db/schema.js';
import type { DbHandles } from '../db/client.js';
import {
  MarkitdownError,
  type MarkitdownClient,
  type MarkitdownSource,
} from './markitdown.js';

export const PROMPT_TRUNCATION_LIMIT = 20_000;
const TRUNCATION_HEAD = 18_000;
const TRUNCATION_TAIL = 2_000;

export type ExtractionStatus = 'ok' | 'failed' | 'skipped';

export type ExtractionSource = MarkitdownSource | 'text_file';

const TEXT_MIMES = new Set(['text/plain', 'text/markdown', 'application/json']);
const MARKITDOWN_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export interface AttachmentRow {
  id: string;
  userId: string;
  filename: string;
  mimeType: string;
  path: string;
  extractedText: string | null;
  extractionStatus: string;
}

export interface ExtractionResult {
  markdown: string;
  status: ExtractionStatus;
  source?: ExtractionSource;
  error?: string;
  /** True when the result came from the DB cache (no re-extraction). */
  cached: boolean;
}

export interface ExtractAttachmentDeps {
  db: DbHandles;
  workspaceDir: string;
  markitdown?: MarkitdownClient;
  now?: () => number;
}

/**
 * Extract an attachment to markdown, using the DB cache when possible.
 * Persists status + text on the attachments row. Never throws — returns a
 * structured result so the caller can decide how to surface the failure.
 */
export async function extractAttachment(
  attachment: AttachmentRow,
  deps: ExtractAttachmentDeps,
): Promise<ExtractionResult> {
  if (
    attachment.extractionStatus === 'ok' &&
    typeof attachment.extractedText === 'string'
  ) {
    return {
      markdown: attachment.extractedText,
      status: 'ok',
      cached: true,
    };
  }

  const mime = attachment.mimeType;
  const absPath = pathModule.join(deps.workspaceDir, attachment.path);

  let result: ExtractionResult;
  if (TEXT_MIMES.has(mime)) {
    result = await extractTextFile(absPath);
  } else if (MARKITDOWN_MIMES.has(mime)) {
    if (!deps.markitdown) {
      result = {
        markdown: '',
        status: 'skipped',
        error: 'markitdown worker not configured',
        cached: false,
      };
    } else {
      result = await extractViaMarkitdown(
        absPath,
        attachment.filename,
        mime,
        deps.markitdown,
      );
    }
  } else {
    result = {
      markdown: '',
      status: 'skipped',
      error: `unsupported mime type: ${mime}`,
      cached: false,
    };
  }

  await persistResult(deps.db, attachment.id, result, deps.now ?? Date.now);
  return result;
}

async function extractTextFile(absPath: string): Promise<ExtractionResult> {
  try {
    const content = await fs.readFile(absPath, 'utf8');
    return {
      markdown: content,
      status: 'ok',
      source: 'text_file',
      cached: false,
    };
  } catch (err) {
    return {
      markdown: '',
      status: 'failed',
      error: `read failed: ${(err as Error).message}`,
      cached: false,
    };
  }
}

async function extractViaMarkitdown(
  absPath: string,
  filename: string,
  mime: string,
  client: MarkitdownClient,
): Promise<ExtractionResult> {
  try {
    const buf = await fs.readFile(absPath);
    const res = await client.convert(buf, filename, mime);
    return {
      markdown: res.markdown,
      status: 'ok',
      source: res.source,
      cached: false,
    };
  } catch (err) {
    if (err instanceof MarkitdownError) {
      return {
        markdown: '',
        status: 'failed',
        error: `markitdown ${err.code}: ${err.reason ?? err.message}`,
        cached: false,
      };
    }
    return {
      markdown: '',
      status: 'failed',
      error: `unexpected: ${(err as Error).message}`,
      cached: false,
    };
  }
}

async function persistResult(
  db: DbHandles,
  attachmentId: string,
  result: ExtractionResult,
  now: () => number,
): Promise<void> {
  db.db
    .update(attachments)
    .set({
      extractedText: result.status === 'ok' ? result.markdown : null,
      extractionStatus: result.status,
      extractionError: result.error ?? null,
      extractionSource: result.source ?? null,
      extractedAt: now(),
    })
    .where(eq(attachments.id, attachmentId))
    .run();
}

/**
 * Trim a markdown blob for safe inclusion in an LLM prompt.
 * Keeps head + tail with a marker so the LLM knows content was removed.
 */
export function truncateForPrompt(
  markdown: string,
  limit = PROMPT_TRUNCATION_LIMIT,
): string {
  if (markdown.length <= limit) return markdown;
  const omitted = markdown.length - TRUNCATION_HEAD - TRUNCATION_TAIL;
  const head = markdown.slice(0, TRUNCATION_HEAD);
  const tail = markdown.slice(markdown.length - TRUNCATION_TAIL);
  return `${head}\n\n...[tronqué, ${omitted} caractères omis]...\n\n${tail}`;
}

/**
 * Serialize an extracted attachment as a block for the prompt. Empty on skip.
 */
export function formatAttachmentBlock(
  filename: string,
  mimeType: string,
  result: ExtractionResult,
): string {
  if (result.status !== 'ok' || !result.markdown) {
    return '';
  }
  const body = truncateForPrompt(result.markdown);
  return `<attachment filename="${escapeAttr(filename)}" mime="${escapeAttr(mimeType)}">\n${body}\n</attachment>`;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
