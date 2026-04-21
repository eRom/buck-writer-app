// packages/api/src/services/memory/bootstrap.ts
import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../../env.js';
import { getSupabase } from './supabaseClient.js';
import { embedText, type UsageRecord } from './embeddings.js';
import { buildMemoryContext } from './memoryOrchestrator.js';
import { createRememberService } from './remember.js';
import { createRecallService } from './recall.js';
import { createStateService, type CompactArgs } from './state.js';
import { syncMemoryUsage, type EdgeUsageRecord } from './usageSync.js';
import type { MemoryContext, RecallResult } from './types.js';

export interface MemoryServices {
  enabled: boolean;
  supabase: SupabaseClient | null;
  buildContext: (userId: string) => Promise<MemoryContext>;
  remember: ReturnType<typeof createRememberService>;
  recall: ReturnType<typeof createRecallService>;
  state: ReturnType<typeof createStateService>;
  syncUsage: () => Promise<number>;
  drainRetryBuffer: () => Promise<void>;
}

export interface BootstrapDeps {
  env: Env;
  insertUsageEvent: (r: UsageRecord | EdgeUsageRecord) => Promise<void>;
  readUsageCursor: () => Promise<Date>;
  writeUsageCursor: (d: Date) => Promise<void>;
  tokenCounter: (s: string) => number;
}

export function bootstrapMemory(deps: BootstrapDeps): MemoryServices {
  if (!deps.env.MEMORY_ENABLED) return makeDisabled();
  if (
    !deps.env.SUPABASE_URL
    || !deps.env.SUPABASE_SERVICE_ROLE_KEY
    || !deps.env.BUCK_USER_ID
    || !deps.env.OPENAI_API_KEY
  ) {
    return makeDisabled();
  }

  const supabase = getSupabase({
    SUPABASE_URL: deps.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: deps.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const openai = new OpenAI({ apiKey: deps.env.OPENAI_API_KEY });
  const userId = deps.env.BUCK_USER_ID;

  const embed = (text: string) => embedText(text, {
    openai,
    model: deps.env.OPENAI_EMBEDDING_MODEL,
    insertUsage: deps.insertUsageEvent,
    userId,
  });

  const remember = createRememberService({ supabase, embed, userId, bufferCap: 100 });
  const recall = createRecallService({
    supabase,
    embed,
    userId,
    threshold: deps.env.MEMORY_RECALL_THRESHOLD,
  });

  const compact = async (args: CompactArgs): Promise<string> => {
    const res = await fetch(`${deps.env.SUPABASE_URL}/functions/v1/compact-state`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deps.env.EDGE_INVOKE_KEY ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: args.userId,
        key: args.key,
        current_value: args.currentValue,
        token_budget: args.tokenBudget,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`compact-state ${res.status}`);
    const json = (await res.json()) as { compacted_value: string };
    return json.compacted_value;
  };

  const state = createStateService({ supabase, userId, compact, tokenCounter: deps.tokenCounter });

  return {
    enabled: true,
    supabase,
    buildContext: (uid: string) => buildMemoryContext(uid, { supabase, timeoutMs: 1500 }),
    remember,
    recall,
    state,
    syncUsage: async () => {
      const cursor = await deps.readUsageCursor();
      return syncMemoryUsage({
        supabase,
        userId,
        sinceCursor: cursor,
        insertUsage: deps.insertUsageEvent,
        saveCursor: deps.writeUsageCursor,
      });
    },
    drainRetryBuffer: () => remember.drain(),
  };
}

function makeDisabled(): MemoryServices {
  const noop = async () => {};
  return {
    enabled: false,
    supabase: null,
    buildContext: async () => ({ preferences: {}, activeContext: {}, degraded: false }),
    remember: {
      remember: async () => ({ ok: true as const }),
      drain: noop,
      bufferSize: () => 0,
      bufferSnapshot: () => [],
      __setClientForTest: () => {},
    } as unknown as ReturnType<typeof createRememberService>,
    recall: {
      recall: async (): Promise<RecallResult[]> => [],
    } as unknown as ReturnType<typeof createRecallService>,
    state: {
      set: noop,
    } as unknown as ReturnType<typeof createStateService>,
    syncUsage: async () => 0,
    drainRetryBuffer: noop,
  };
}
