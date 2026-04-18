// packages/api/src/services/memory/supabaseClient.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export interface MinimalEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export function getSupabase(env: MinimalEnv): SupabaseClient {
  if (cached) return cached;
  if (!env.SUPABASE_URL) throw new Error('SUPABASE_URL missing');
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function __resetSupabaseForTest(): void {
  cached = null;
}
