export interface SSEContentEvent {
  type: 'content';
  text: string;
}

export interface SSEToolCallDelta {
  type: 'tool_call_delta';
  index: number;
  id?: string;
  name?: string;
  argumentsDelta: string;
}

export interface SSEDoneEvent {
  type: 'done';
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export type SSEEvent = SSEContentEvent | SSEToolCallDelta | SSEDoneEvent;

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface StreamChatOpts {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
}

interface ChatOpts {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export function parseSSEChunks(line: string): SSEEvent[] {
  if (!line.startsWith('data: ')) return [];
  const data = line.slice(6).trim();
  if (data === '[DONE]') return [];

  try {
    const parsed = JSON.parse(data);
    const choice = parsed.choices?.[0];
    if (!choice) return [];

    const events: SSEEvent[] = [];
    const delta = choice.delta;

    if (delta?.content) {
      events.push({ type: 'content', text: delta.content });
    }

    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        events.push({
          type: 'tool_call_delta',
          index: tc.index,
          id: tc.id,
          name: tc.function?.name,
          argumentsDelta: tc.function?.arguments ?? '',
        });
      }
    }

    if (choice.finish_reason) {
      events.push({
        type: 'done',
        finishReason: choice.finish_reason,
        usage: parsed.usage,
      });
    }

    return events;
  } catch {
    return [];
  }
}

export function accumulateToolCalls() {
  const calls: Map<number, { id: string; name: string; args: string }> = new Map();

  return {
    push(delta: { index: number; id?: string; name?: string; argumentsDelta: string }) {
      const existing = calls.get(delta.index);
      if (existing) {
        if (delta.id) existing.id = delta.id;
        if (delta.name) existing.name = delta.name;
        existing.args += delta.argumentsDelta;
      } else {
        calls.set(delta.index, {
          id: delta.id ?? '',
          name: delta.name ?? '',
          args: delta.argumentsDelta,
        });
      }
    },
    finish(): ToolCall[] {
      return [...calls.values()].map((c) => ({
        id: c.id,
        type: 'function' as const,
        function: { name: c.name, arguments: c.args },
      }));
    },
    clear() {
      calls.clear();
    },
  };
}

export class OpenAIError extends Error {
  constructor(public status: number, public data: unknown) {
    const detail = typeof data === 'object' && data !== null && 'error' in data
      ? (data as { error?: { message?: string } }).error?.message ?? ''
      : '';
    super(detail ? `OpenAI API error ${status}: ${detail}` : `OpenAI API error ${status}`);
  }
}

export async function streamChat(opts: StreamChatOpts): Promise<Response> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = 'auto';
  }

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new OpenAIError(res.status, err);
  }

  return res;
}

export async function chat(opts: ChatOpts): Promise<{
  text: string;
  usage: { prompt_tokens: number; completion_tokens: number };
}> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
  };
  if (opts.maxTokens) body.max_completion_tokens = opts.maxTokens;

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new OpenAIError(res.status, err);
  }

  const data = await res.json();
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    usage: data.usage ?? { prompt_tokens: 0, completion_tokens: 0 },
  };
}
