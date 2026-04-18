// packages/api/src/services/memory/supabaseClient.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getSupabase, __resetSupabaseForTest } from './supabaseClient.js';

describe('supabaseClient', () => {
  beforeEach(() => __resetSupabaseForTest());

  it('throws if env incomplete', () => {
    expect(() => getSupabase({ SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined }))
      .toThrow(/SUPABASE_URL/);
  });

  it('returns singleton client when env complete', () => {
    const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    const a = getSupabase(env);
    const b = getSupabase(env);
    expect(a).toBe(b);
  });
});
