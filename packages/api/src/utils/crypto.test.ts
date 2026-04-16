import { describe, it, expect } from 'vitest';
import { sha256Hex, randomTokenHex } from './crypto.js';

describe('crypto utils', () => {
  it('sha256Hex produces 64-char hex', () => {
    const h = sha256Hex('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('randomTokenHex returns 48 hex chars for 24 bytes', () => {
    const t = randomTokenHex(24);
    expect(t).toMatch(/^[0-9a-f]{48}$/);
  });
});
