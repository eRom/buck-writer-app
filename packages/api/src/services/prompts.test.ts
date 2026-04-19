import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadPrompts, bootstrapPrompts } from './prompts.js';

let dir: string;
let defaultsDir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buck-systems-'));
  defaultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buck-defaults-'));
  fs.writeFileSync(path.join(defaultsDir, 'SYSTEM.md'), 'DEFAULT_SYSTEM');
  fs.writeFileSync(path.join(defaultsDir, 'MEMORY.md'), 'DEFAULT_MEMORY');
  fs.writeFileSync(path.join(defaultsDir, 'TOOLS.md'), 'DEFAULT_TOOLS');
  fs.writeFileSync(path.join(defaultsDir, 'RULES.md'), 'DEFAULT_RULES');
  fs.writeFileSync(path.join(defaultsDir, 'LIVE.md'), 'DEFAULT_LIVE');
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(defaultsDir, { recursive: true, force: true });
});

describe('loadPrompts', () => {
  it('reads SYSTEM.md, MEMORY.md, TOOLS.md, RULES.md and LIVE.md', () => {
    fs.writeFileSync(path.join(dir, 'SYSTEM.md'), 'You are Buck.');
    fs.writeFileSync(path.join(dir, 'MEMORY.md'), 'Memory guide.');
    fs.writeFileSync(path.join(dir, 'TOOLS.md'), 'Tools guide.');
    fs.writeFileSync(path.join(dir, 'RULES.md'), 'Be kind.');
    fs.writeFileSync(path.join(dir, 'LIVE.md'), 'Parle naturellement.');
    const p = loadPrompts(dir);
    expect(p.system).toBe('You are Buck.');
    expect(p.memory).toBe('Memory guide.');
    expect(p.tools).toBe('Tools guide.');
    expect(p.rules).toBe('Be kind.');
    expect(p.live).toBe('Parle naturellement.');
  });

  it('returns memory="" and tools="" if absent', () => {
    fs.writeFileSync(path.join(dir, 'SYSTEM.md'), 'S');
    const p = loadPrompts(dir);
    expect(p.memory).toBe('');
    expect(p.tools).toBe('');
  });

  it('allows empty rules', () => {
    fs.writeFileSync(path.join(dir, 'SYSTEM.md'), 'S');
    const p = loadPrompts(dir);
    expect(p.rules).toBe('');
  });

  it('returns live="" if LIVE.md absent', () => {
    fs.writeFileSync(path.join(dir, 'SYSTEM.md'), 'S');
    const p = loadPrompts(dir);
    expect(p.live).toBe('');
  });

  it('throws if SYSTEM.md missing', () => {
    expect(() => loadPrompts(dir)).toThrow(/SYSTEM\.md/);
  });
});

describe('bootstrapPrompts', () => {
  it('copies defaults if systems dir missing', () => {
    fs.rmSync(dir, { recursive: true });
    bootstrapPrompts(dir, defaultsDir);
    expect(fs.readFileSync(path.join(dir, 'SYSTEM.md'), 'utf8')).toBe('DEFAULT_SYSTEM');
    expect(fs.readFileSync(path.join(dir, 'MEMORY.md'), 'utf8')).toBe('DEFAULT_MEMORY');
    expect(fs.readFileSync(path.join(dir, 'TOOLS.md'), 'utf8')).toBe('DEFAULT_TOOLS');
    expect(fs.readFileSync(path.join(dir, 'RULES.md'), 'utf8')).toBe('DEFAULT_RULES');
    expect(fs.readFileSync(path.join(dir, 'LIVE.md'), 'utf8')).toBe('DEFAULT_LIVE');
  });

  it('copies defaults if SYSTEM.md absent but other files present', () => {
    fs.writeFileSync(path.join(dir, 'OTHER.md'), 'x');
    bootstrapPrompts(dir, defaultsDir);
    expect(fs.existsSync(path.join(dir, 'SYSTEM.md'))).toBe(true);
  });

  it('does not overwrite existing SYSTEM.md', () => {
    fs.writeFileSync(path.join(dir, 'SYSTEM.md'), 'CUSTOM');
    bootstrapPrompts(dir, defaultsDir);
    expect(fs.readFileSync(path.join(dir, 'SYSTEM.md'), 'utf8')).toBe('CUSTOM');
  });
});
