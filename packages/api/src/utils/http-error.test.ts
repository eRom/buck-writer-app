import { describe, it, expect } from 'vitest';
import { HttpError } from './http-error.js';

describe('HttpError', () => {
  it('captures status + code + message', () => {
    const err = new HttpError(403, 'forbidden', 'nope');
    expect(err.status).toBe(403);
    expect(err.code).toBe('forbidden');
    expect(err.message).toBe('nope');
    expect(err.toJSON()).toEqual({ error: { code: 'forbidden', message: 'nope' } });
  });
});
