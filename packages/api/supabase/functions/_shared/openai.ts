// packages/api/supabase/functions/_shared/openai.ts
const OPENAI_BASE = 'https://api.openai.com/v1';

export interface ChatCall {
  apiKey: string;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  responseFormat?: 'text' | 'json_object';
  maxTokens?: number;
}

export interface ChatResult {
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
}

export async function chat(call: ChatCall): Promise<ChatResult> {
  const body: Record<string, unknown> = {
    model: call.model,
    messages: call.messages,
    max_tokens: call.maxTokens ?? 2048,
  };
  if (call.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' };
  }
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${call.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return {
    content: data.choices[0].message.content ?? '',
    usage: data.usage,
    model: data.model,
  };
}

export async function embed(apiKey: string, model: string, input: string): Promise<{ embedding: number[]; tokens: number }> {
  const res = await fetch(`${OPENAI_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) throw new Error(`openai embed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { embedding: data.data[0].embedding, tokens: data.usage.prompt_tokens };
}

export function chatCostUsd(model: string, usage: ChatResult['usage']): number {
  // gpt-4o-mini pricing: $0.15 / M input, $0.60 / M output
  if (model.startsWith('gpt-4o-mini')) {
    return (usage.prompt_tokens / 1e6) * 0.15 + (usage.completion_tokens / 1e6) * 0.60;
  }
  return 0;
}

export function embedCostUsd(model: string, tokens: number): number {
  // text-embedding-3-large: $0.13 / M
  if (model.includes('large')) return (tokens / 1e6) * 0.13;
  return 0;
}
