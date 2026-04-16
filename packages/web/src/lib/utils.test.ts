import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('merges tailwind classes', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('filters falsy values', () => {
    const maybe: string | false = false;
    expect(cn('foo', maybe, undefined, null, 'baz')).toBe('foo baz');
  });
});
