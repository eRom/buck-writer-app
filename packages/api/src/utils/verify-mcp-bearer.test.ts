import { describe, it, expect } from 'vitest';
import { verifyMcpBearer } from './verify-mcp-bearer.js';

describe('verifyMcpBearer (VULN-007)', () => {
  const secret = 'a'.repeat(48);

  it('accepts the exact expected Bearer header', () => {
    expect(verifyMcpBearer(`Bearer ${secret}`, secret)).toBe(true);
  });

  it('rejects a same-length header that differs by one byte', () => {
    const wrong = 'a'.repeat(47) + 'b';
    expect(verifyMcpBearer(`Bearer ${wrong}`, secret)).toBe(false);
  });

  it('rejects a shorter header without throwing', () => {
    expect(verifyMcpBearer('Bearer short', secret)).toBe(false);
  });

  it('rejects a longer header without throwing', () => {
    expect(verifyMcpBearer(`Bearer ${secret}xxx`, secret)).toBe(false);
  });

  it('rejects an empty header', () => {
    expect(verifyMcpBearer('', secret)).toBe(false);
  });

  it('rejects a header missing the Bearer prefix', () => {
    expect(verifyMcpBearer(secret, secret)).toBe(false);
  });
});
