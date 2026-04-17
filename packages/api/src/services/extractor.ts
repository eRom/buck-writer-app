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
