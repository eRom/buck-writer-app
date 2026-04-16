import { describe, it, expect } from 'vitest';
import { createJwtService } from './jwt.js';

const secret = 'a'.repeat(32);

describe('jwt service', () => {
  const svc = createJwtService({
    secret,
    issuer: 'buck',
    audience: 'buck-web',
  });

  it('sign then verify returns payload', async () => {
    const token = await svc.sign({ sub: 'user-123', scope: 'app' }, '1h');
    const payload = await svc.verify(token);
    expect(payload.sub).toBe('user-123');
    expect((payload as { scope?: string }).scope).toBe('app');
  });

  it('verify throws for garbage', async () => {
    await expect(svc.verify('not.a.jwt')).rejects.toThrow();
  });

  it('verify throws when signed with different secret', async () => {
    const other = createJwtService({
      secret: 'b'.repeat(32),
      issuer: 'buck',
      audience: 'buck-web',
    });
    const token = await other.sign({ sub: 'x' }, '1h');
    await expect(svc.verify(token)).rejects.toThrow();
  });
});
