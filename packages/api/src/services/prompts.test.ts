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
  fs.writeFileSync(path.join(defaultsDir, 'RULES.md'), 'DEFAULT_RULES');
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(defaultsDir, { recursive: true, force: true });
});

describe('loadPrompts', () => {
  it('reads SYSTEM.md and RULES.md', () => {
    fs.writeFileSync(path.join(dir, 'SYSTEM.md'), 'You are Buck.');
    fs.writeFileSync(path.join(dir, 'RULES.md'), 'Be kind.');
    const p = loadPrompts(dir);
    expect(p.system).toBe('You are Buck.');
    expect(p.rules).toBe('Be kind.');
  });

  it('allows empty rules', () => {
    fs.writeFileSync(path.join(dir, 'SYSTEM.md'), 'S');
    const p = loadPrompts(dir);
    expect(p.rules).toBe('');
  });

  it('throws if SYSTEM.md missing', () => {
    expect(() => loadPrompts(dir)).toThrow(/SYSTEM\.md/);
  });
});

describe('bootstrapPrompts', () => {
  it('copies defaults if systems dir missing', () => {
    fs.rmSync(dir, { recursive: true });
    bootstrapPrompts(dir, defaultsDir);
    expect(fs.existsSync(path.join(dir, 'SYSTEM.md'))).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'SYSTEM.md'), 'utf8')).toBe('DEFAULT_SYSTEM');
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
