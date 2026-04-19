import { describe, it, expect } from 'vitest';
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

  it('returns empty when nothing provided', () => {
    expect(buildToolDefinitions(undefined, undefined)).toEqual([]);
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

  it('returns empty when nothing provided', () => {
    expect(Object.keys(buildToolHandlers(undefined, undefined))).toEqual([]);
  });
});
