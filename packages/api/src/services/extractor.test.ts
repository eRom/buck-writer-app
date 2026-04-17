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
