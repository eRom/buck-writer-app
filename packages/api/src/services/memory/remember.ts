// packages/api/src/services/memory/remember.ts
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RememberInput } from './types.js';

export interface RememberDeps {
  supabase: SupabaseClient;
  embed: (text: string) => Promise<{ embedding: number[]; tokens: number; model: string }>;
  userId: string;
  bufferCap: number;
  timeoutMs?: number;
}

export interface RememberResult {
  ok: true;
  id?: string;
  deferred?: boolean;
}

interface BufferedItem {
  id: string;
  payload: RememberInput;
  queuedAt: number;
}

export function createRememberService(deps: RememberDeps) {
  let client = deps.supabase;
  const buffer = new Map<string, BufferedItem>();
  const timeoutMs = deps.timeoutMs ?? 1500;

  async function persist(payload: RememberInput): Promise<string> {
    const { embedding } = await deps.embed(payload.content);
    const signal = AbortSignal.timeout(timeoutMs);
    const builder = client
      .from('buck_memories')
      .insert({
        user_id: deps.userId,
        memory_type: payload.type,
        content: payload.content,
        embedding,
        importance: payload.importance ?? 0.5,
        metadata: payload.metadata ?? {},
      })
      .select('id')
      .single() as unknown as { abortSignal: (s: AbortSignal) => Promise<{ data: unknown; error: { message: string } | null }> };
    const res = await builder.abortSignal(signal);
    if (res.error) throw new Error(res.error.message);
    return (res.data as { id: string }).id;
  }

  function enqueue(payload: RememberInput): void {
    if (buffer.size >= deps.bufferCap) {
      const firstKey = buffer.keys().next().value;
      if (firstKey) buffer.delete(firstKey);
    }
    const id = randomUUID();
    buffer.set(id, { id, payload, queuedAt: Date.now() });
  }

  async function remember(payload: RememberInput): Promise<RememberResult> {
    try {
      const id = await persist(payload);
      return { ok: true, id };
    } catch {
      enqueue(payload);
      return { ok: true, deferred: true };
    }
  }

  async function drain(): Promise<void> {
    const entries = Array.from(buffer.values());
    for (const item of entries) {
      try {
        await persist(item.payload);
        buffer.delete(item.id);
      } catch {
        // stop on first failure to avoid thundering herd
        break;
      }
    }
  }

  return {
    remember,
    drain,
    bufferSize: () => buffer.size,
    bufferSnapshot: () => Array.from(buffer.values()),
    __setClientForTest: (c: SupabaseClient) => { client = c; },
  };
}
