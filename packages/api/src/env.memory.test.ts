import { describe, it, expect } from 'vitest';
import { loadEnv } from './env.js';

describe('env memory variables', () => {
  const base = {
    NODE_ENV: 'test',
    AUTH_JWT_SECRET: 'x'.repeat(32),
    AUTH_ALLOWED_EMAILS: 'a@b.com',
    WORKSPACE_DIR: '/tmp',
    DATABASE_URL: ':memory:',
  };

  it('accepts memory env vars', () => {
    const env = loadEnv({
      ...base,
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      BUCK_USER_ID: '00000000-0000-0000-0000-000000000001',
      MEMORY_ENABLED: 'true',
      OPENAI_EMBEDDING_MODEL: 'text-embedding-3-large',
      EDGE_INVOKE_KEY: 'secret',
    });
    expect(env.MEMORY_ENABLED).toBe(true);
    expect(env.BUCK_USER_ID).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('MEMORY_ENABLED defaults to false', () => {
    const env = loadEnv(base);
    expect(env.MEMORY_ENABLED).toBe(false);
  });

  it('rejects invalid BUCK_USER_ID', () => {
    expect(() => loadEnv({ ...base, BUCK_USER_ID: 'not-a-uuid' })).toThrow();
  });
});
