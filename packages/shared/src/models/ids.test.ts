import { describe, it, expect } from 'vitest';
import { newId, isUuid } from './ids.js';

describe('ids', () => {
  it('newId returns a v4 UUID', () => {
    const id = newId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('isUuid true for valid v4 uuid', () => {
    expect(isUuid('6b70e40c-cb2b-4c3a-bba4-7f96c2d0f2de')).toBe(true);
  });

  it('isUuid false for garbage', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});
