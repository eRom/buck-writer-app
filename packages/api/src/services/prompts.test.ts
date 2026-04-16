import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { loadPrompts } from './prompts.js';

describe('loadPrompts', () => {
  const tmpDir = '/tmp/buck-prompts-test-' + Date.now();

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(`${tmpDir}/SYSTEM.md`, 'You are a test bot.');
    fs.writeFileSync(`${tmpDir}/RULES.md`, '- Be nice.');
    fs.writeFileSync(`${tmpDir}/USER.md`, '');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads all three prompt files', () => {
    const prompts = loadPrompts(tmpDir);
    expect(prompts.system).toBe('You are a test bot.');
    expect(prompts.rules).toBe('- Be nice.');
    expect(prompts.user).toBe('');
  });

  it('throws if SYSTEM.md is missing', () => {
    fs.unlinkSync(`${tmpDir}/SYSTEM.md`);
    expect(() => loadPrompts(tmpDir)).toThrow(/SYSTEM\.md/);
  });

  it('returns empty string for missing optional USER.md', () => {
    fs.unlinkSync(`${tmpDir}/USER.md`);
    const prompts = loadPrompts(tmpDir);
    expect(prompts.user).toBe('');
  });
});
