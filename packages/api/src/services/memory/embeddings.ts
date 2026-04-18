// packages/api/src/services/memory/embeddings.ts
import type OpenAI from 'openai';

const COST_PER_MILLION_TOKENS = 0.13; // text-embedding-3-large, USD

export interface UsageRecord {
  userId: string;
  kind: 'memory_embedding';
  model: string;
  promptTokens: number;
  costUsd: number;
  metadata?: Record<string, unknown>;
}

export interface EmbedDeps {
  openai: OpenAI;
  model: string;
  userId: string;
  insertUsage: (record: UsageRecord) => Promise<void>;
}

export interface EmbedResult {
  embedding: number[];
  tokens: number;
  model: string;
}

export async function embedText(text: string, deps: EmbedDeps): Promise<EmbedResult> {
  const response = await deps.openai.embeddings.create({
    model: deps.model,
    input: text,
  });
  const tokens = response.usage.prompt_tokens;
  const costUsd = (tokens / 1_000_000) * COST_PER_MILLION_TOKENS;
  await deps.insertUsage({
    userId: deps.userId,
    kind: 'memory_embedding',
    model: deps.model,
    promptTokens: tokens,
    costUsd,
  });
  const first = response.data[0]!;
  return {
    embedding: first.embedding,
    tokens,
    model: response.model,
  };
}
