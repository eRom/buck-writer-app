// packages/api/src/services/memory/recall.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecallInput, RecallResult } from './types.js';

export interface RecallDeps {
  supabase: SupabaseClient;
  embed: (text: string) => Promise<{ embedding: number[]; tokens: number; model: string }>;
  userId: string;
  threshold: number;
}

export function createRecallService(deps: RecallDeps) {
  async function bumpAccess(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    // NB: uses PostgREST; access_count bumped by +1 via rpc or direct increment would need a DB function.
    // For simplicity here we set last_accessed_at; count bump can be deferred to a DB function later.
    try {
      await deps.supabase
        .from('buck_memories')
        .update({ last_accessed_at: now })
        .in('id', ids);
    } catch {
      // silent — non-critical
    }
  }

  async function recall(input: RecallInput): Promise<RecallResult[]> {
    try {
      const { embedding } = await deps.embed(input.query);
      const res = await deps.supabase.rpc('match_memories', {
        query_embedding: embedding,
        match_threshold: deps.threshold,
        match_count: input.count,
        filter_user_id: deps.userId,
        filter_type: input.type ?? null,
      });
      if (res.error || !res.data) return [];
      const rows = res.data as RecallResult[];
      // fire and forget
      void bumpAccess(rows.map((r) => r.id));
      return rows;
    } catch {
      return [];
    }
  }

  return { recall };
}
