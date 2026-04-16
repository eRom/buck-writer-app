import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertSafePath, createPathSafe } from './path-safe.js';

let workspaceRoot: string;

beforeAll(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'buck-safe-'));
  await fs.mkdir(path.join(workspaceRoot, 'prompts'), { recursive: true });
  await fs.writeFile(
    path.join(workspaceRoot, 'prompts', 'SYSTEM.md'),
    '# system',
    'utf8',
  );
});

afterAll(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe('path-safe', () => {
  it('resolves existing file inside workspace', async () => {
    const resolved = await assertSafePath(workspaceRoot, 'prompts/SYSTEM.md');
    expect(resolved).toBe(
      await fs.realpath(path.resolve(workspaceRoot, 'prompts', 'SYSTEM.md')),
    );
  });

  it('resolves non-existing path that would stay inside', async () => {
    const resolved = await assertSafePath(workspaceRoot, 'new/file.md');
    expect(resolved.startsWith(await fs.realpath(workspaceRoot))).toBe(true);
  });

  it('throws on ../ traversal', async () => {
    await expect(
      assertSafePath(workspaceRoot, '../evil.md'),
    ).rejects.toThrow(/path outside/);
  });

  it('throws on absolute path outside', async () => {
    await expect(assertSafePath(workspaceRoot, '/etc/passwd')).rejects.toThrow(
      /path outside/,
    );
  });

  it('createPathSafe returns bound helper', async () => {
    const safe = createPathSafe(workspaceRoot);
    const resolved = await safe('prompts/SYSTEM.md');
    expect(resolved).toBe(
      await fs.realpath(path.resolve(workspaceRoot, 'prompts', 'SYSTEM.md')),
    );
  });
});
