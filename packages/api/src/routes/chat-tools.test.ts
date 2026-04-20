import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildToolDefinitions, buildToolHandlers } from './chat-tools.js';

describe('buildToolDefinitions', () => {
  it('returns workspace tools when workspaceDir is set', () => {
    const defs = buildToolDefinitions('/tmp/ws', undefined);
    const names = defs.map((d) => d.name);
    expect(names).toContain('read_file');
    expect(names).toContain('list_directory');
    expect(names).toContain('create_file');
    expect(names).toContain('delete_file');
    expect(names).toContain('shell_execute');
  });

  it('uses Responses API shape (internally-tagged: type+name+parameters)', () => {
    const defs = buildToolDefinitions('/tmp/ws', undefined);
    for (const d of defs) {
      expect(d.type).toBe('function');
      expect(typeof d.name).toBe('string');
      expect(d.parameters).toBeTruthy();
      // chat.completions-style `function` wrapper should NOT exist
      expect((d as unknown as { function?: unknown }).function).toBeUndefined();
    }
  });

  it('adds activate_skill when skills are provided', () => {
    const skills = new Map([
      ['test', { name: 'test', description: 'X', body: 'Y', path: '' }],
    ]);
    const defs = buildToolDefinitions(undefined, skills);
    expect(defs.map((d) => d.name)).toContain('activate_skill');
  });

  it('always exposes todos tools', () => {
    const names = buildToolDefinitions(undefined, undefined).map((d) => d.name);
    expect(names).toContain('todos_list');
    expect(names).toContain('todos_create');
    expect(names).toContain('todos_update');
    expect(names).toContain('todos_delete');
  });

  it('marks strict where schemas are strict-compliant', () => {
    const defs = buildToolDefinitions('/tmp/ws', undefined);
    const readFile = defs.find((d) => d.name === 'read_file');
    expect(readFile?.strict).toBe(true);
    const shell = defs.find((d) => d.name === 'shell_execute');
    expect(shell?.strict).toBe(false);
  });
});

describe('buildToolHandlers', () => {
  it('returns workspace handlers when workspaceDir is set', () => {
    const handlers = buildToolHandlers('/tmp/ws', undefined);
    expect(typeof handlers.read_file).toBe('function');
    expect(typeof handlers.list_directory).toBe('function');
    expect(typeof handlers.create_file).toBe('function');
    expect(typeof handlers.delete_file).toBe('function');
    expect(typeof handlers.shell_execute).toBe('function');
  });

  it('returns empty when nothing provided and no todos ctx', () => {
    expect(Object.keys(buildToolHandlers(undefined, undefined))).toEqual([]);
  });
});

describe('workspace tools — protected directories', () => {
  function mkTmp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'buck-chat-tools-'));
  }

  for (const dir of ['prompts', 'skills', 'systems']) {
    it(`create_file refuses to write inside ${dir}/`, async () => {
      const wd = mkTmp();
      try {
        const handlers = buildToolHandlers(wd, undefined);
        const result = (await handlers.create_file!({
          path: `${dir}/pwn.md`,
          content: 'hijacked',
        })) as { error?: string; ok?: boolean };
        expect(result.error).toMatch(/protected directory/);
        expect(result.ok).toBeUndefined();
        expect(fs.existsSync(path.join(wd, dir, 'pwn.md'))).toBe(false);
      } finally {
        await fsp.rm(wd, { recursive: true, force: true });
      }
    });

    it(`delete_file refuses to remove anything inside ${dir}/`, async () => {
      const wd = mkTmp();
      try {
        await fsp.mkdir(path.join(wd, dir), { recursive: true });
        await fsp.writeFile(path.join(wd, dir, 'keep.md'), 'keep me');
        const handlers = buildToolHandlers(wd, undefined);
        const result = (await handlers.delete_file!({
          path: `${dir}/keep.md`,
        })) as { error?: string; ok?: boolean };
        expect(result.error).toMatch(/protected directory/);
        expect(result.ok).toBeUndefined();
        expect(fs.existsSync(path.join(wd, dir, 'keep.md'))).toBe(true);
      } finally {
        await fsp.rm(wd, { recursive: true, force: true });
      }
    });
  }

  it('delete_file still works on unprotected paths', async () => {
    const wd = mkTmp();
    try {
      await fsp.writeFile(path.join(wd, 'draft.md'), 'bye');
      const handlers = buildToolHandlers(wd, undefined);
      const result = (await handlers.delete_file!({ path: 'draft.md' })) as {
        ok?: boolean;
      };
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(wd, 'draft.md'))).toBe(false);
    } finally {
      await fsp.rm(wd, { recursive: true, force: true });
    }
  });
});
