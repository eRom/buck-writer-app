// packages/api/src/services/memory/usageSync.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface EdgeUsageRecord {
  userId: string;
  kind: 'memory_consolidation' | 'memory_compaction' | 'memory_dedup';
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface SyncDeps {
  supabase: SupabaseClient;
  userId: string;
  sinceCursor: Date;
  insertUsage: (record: EdgeUsageRecord) => Promise<void>;
  saveCursor: (date: Date) => Promise<void>;
}

function mapKind(edgeKind: string): EdgeUsageRecord['kind'] {
  switch (edgeKind) {
    case 'consolidation': return 'memory_consolidation';
    case 'compaction':    return 'memory_compaction';
    case 'dedup':         return 'memory_dedup';
    default:              return 'memory_consolidation';
  }
}

export async function syncMemoryUsage(deps: SyncDeps): Promise<number> {
  const res = await deps.supabase
    .from('buck_memory_usage')
    .select('*')
    .eq('user_id', deps.userId)
    .gt('created_at', deps.sinceCursor.toISOString())
    .order('created_at', { ascending: true });

  if (res.error) throw new Error(`buck_memory_usage: ${res.error.message}`);
  const rows = (res.data ?? []) as Array<{
    id: string; user_id: string; kind: string; model: string;
    prompt_tok: number; completion_tok: number; cost_usd: string | number;
    metadata: Record<string, unknown>; created_at: string;
  }>;
  if (rows.length === 0) return 0;

  for (const row of rows) {
    await deps.insertUsage({
      userId: row.user_id,
      kind: mapKind(row.kind),
      model: row.model,
      promptTokens: row.prompt_tok,
      completionTokens: row.completion_tok,
      costUsd: typeof row.cost_usd === 'string' ? parseFloat(row.cost_usd) : row.cost_usd,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
    });
  }
  const lastRow = rows[rows.length - 1]!;
  const lastDate = new Date(lastRow.created_at);
  await deps.saveCursor(lastDate);
  return rows.length;
}
