// packages/api/src/services/memory/memoryOrchestrator.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryContext } from './types.js';

export interface BuildContextDeps {
  supabase: SupabaseClient;
  timeoutMs: number;
}

function kvFromRows(rows: Array<{ key: string; value: unknown }>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

async function loadTier(
  deps: BuildContextDeps,
  userId: string,
  tier: 'static' | 'context',
): Promise<Record<string, unknown>> {
  const signal = AbortSignal.timeout(deps.timeoutMs);
  const res = await deps.supabase
    .from('buck_state')
    .select('key, value')
    .eq('user_id', userId)
    .eq('tier', tier)
    .abortSignal(signal);
  if (res.error) throw new Error(`supabase buck_state[${tier}]: ${res.error.message}`);
  return kvFromRows((res.data ?? []) as Array<{ key: string; value: unknown }>);
}

export async function buildMemoryContext(
  userId: string,
  deps: BuildContextDeps,
): Promise<MemoryContext> {
  const [staticRes, contextRes] = await Promise.allSettled([
    loadTier(deps, userId, 'static'),
    loadTier(deps, userId, 'context'),
  ]);

  if (staticRes.status === 'rejected' || contextRes.status === 'rejected') {
    return { preferences: {}, activeContext: {}, degraded: true };
  }
  return {
    preferences: staticRes.value,
    activeContext: contextRes.value,
    degraded: false,
  };
}
