import { describe, it, expect } from 'vitest';
import { isProtectedPath, PROTECTED_ROOT_DIRS } from './protected-paths.js';

describe('isProtectedPath', () => {
  it('includes prompts, skills, systems', () => {
    expect([...PROTECTED_ROOT_DIRS]).toEqual(['prompts', 'skills', 'systems']);
  });

  for (const dir of PROTECTED_ROOT_DIRS) {
    it(`matches bare "${dir}"`, () => {
      expect(isProtectedPath(dir)).toBe(dir);
    });
    it(`matches nested path inside ${dir}`, () => {
      expect(isProtectedPath(`${dir}/a/b.md`)).toBe(dir);
    });
    it(`normalizes leading slash for ${dir}`, () => {
      expect(isProtectedPath(`/${dir}/a.md`)).toBe(dir);
    });
    it(`normalizes backslashes for ${dir}`, () => {
      expect(isProtectedPath(`${dir}\\nested\\file.md`)).toBe(dir);
    });
  }

  it('returns null for unrelated paths', () => {
    expect(isProtectedPath('notes/foo.md')).toBeNull();
    expect(isProtectedPath('prompting.md')).toBeNull(); // prefix but not path segment
    expect(isProtectedPath('my-skills/x.md')).toBeNull();
  });
});
