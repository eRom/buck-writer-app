// packages/api/src/services/memory/state.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CompactArgs {
  userId: string;
  key: string;
  currentValue: string;
  tokenBudget: number;
}

export interface StateDeps {
  supabase: SupabaseClient;
  userId: string;
  compact: (args: CompactArgs) => Promise<string>;
  tokenCounter: (text: string) => number;
}

export interface SetOptions {
  tokenBudget?: number;
}

export function createStateService(deps: StateDeps) {
  async function upsert(tier: 'static' | 'context', key: string, value: unknown, tokenBudget: number | null): Promise<void> {
    const res = await deps.supabase.from('buck_state').upsert({
      user_id: deps.userId,
      tier,
      key,
      value,
      token_budget: tokenBudget,
      updated_at: new Date().toISOString(),
    });
    if (res.error) throw new Error(`upsert buck_state: ${res.error.message}`);
  }

  async function set(
    tier: 'static' | 'context',
    key: string,
    value: unknown,
    options: SetOptions = {},
  ): Promise<void> {
    if (tier === 'static') {
      await upsert('static', key, value, null);
      return;
    }

    const budget = options.tokenBudget ?? 300;
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    const tokens = deps.tokenCounter(serialized);

    if (tokens <= budget) {
      await upsert('context', key, value, budget);
      return;
    }

    let finalValue: string;
    try {
      finalValue = await deps.compact({
        userId: deps.userId,
        key,
        currentValue: serialized,
        tokenBudget: budget,
      });
    } catch {
      // hard truncate: keep first N tokens worth (char-based proxy)
      finalValue = serialized.slice(0, budget);
    }
    await upsert('context', key, finalValue, budget);
  }

  return { set };
}
