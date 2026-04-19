// packages/api/src/lib/openai.ts
//
// Low-level client + SSE parser for OpenAI Responses API (/v1/responses).
// Replaces the former Chat Completions helpers (streamChat/parseSSEChunks/
// accumulateToolCalls). See docs/superpowers/specs/2026-04-19-m7-responses-api-mcp.md.

const OPENAI_URL = 'https://api.openai.com/v1/responses';

// ---------- Request types ----------

/**
 * Classic message input item — string or structured parts (for images).
 */
export interface MessageInputItem {
  role: 'system' | 'user' | 'assistant' | 'developer';
  content:
    | string
    | Array<
        | { type: 'input_text'; text: string }
        | { type: 'input_image'; image_url: string; detail?: 'auto' | 'low' | 'high' }
        | { type: 'output_text'; text: string }
      >;
}

/**
 * Result of a function_call item — fed back to the model on the next turn.
 */
export interface FunctionCallOutputItem {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

/**
 * Response to an `mcp_approval_request` — set `approve` to proceed/deny.
 */
export interface McpApprovalResponseItem {
  type: 'mcp_approval_response';
  approve: boolean;
  approval_request_id: string;
}

export type ResponsesInputItem =
  | MessageInputItem
  | FunctionCallOutputItem
  | McpApprovalResponseItem;

/**
 * Function tool — internally-tagged (Responses shape).
 * strict=true is the Responses default; opt-out with strict: false for
 * schemas that aren't strict-compliant (optional fields without nullable etc.).
 */
export interface FunctionToolDef {
  type: 'function';
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

/**
 * Remote MCP connector tool. OpenAI discovers tools from the server and
 * performs calls directly; we only see mcp_* events in the stream.
 */
export interface McpToolDef {
  type: 'mcp';
  server_label: string;
  server_url: string;
  server_description?: string;
  headers?: Record<string, string>;
  require_approval?:
    | 'never'
    | 'always'
    | {
        never?: { tool_names: string[] };
        always?: { tool_names: string[] };
      };
  allowed_tools?: string[] | { tool_names: string[] };
}

/** Built-in tools — architecture supports them, no immediate wiring in M7. */
export interface WebSearchToolDef {
  type: 'web_search_preview' | 'web_search';
  search_context_size?: 'low' | 'medium' | 'high';
}
export interface ImageGenToolDef {
  type: 'image_generation';
  quality?: 'low' | 'medium' | 'high' | 'auto';
  size?: string;
}
export interface FileSearchToolDef {
  type: 'file_search';
  vector_store_ids: string[];
  max_num_results?: number;
}

export type ToolDef =
  | FunctionToolDef
  | McpToolDef
  | WebSearchToolDef
  | ImageGenToolDef
  | FileSearchToolDef;

export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; name: string }
  | { type: 'mcp'; server_label: string; name?: string };

export interface ResponsesRequestBody {
  model: string;
  /** Top-level system prompt. Preferred over adding a system message in input. */
  instructions?: string;
  /** Short user string OR array of input items (messages + outputs + approvals). */
  input: string | ResponsesInputItem[];
  tools?: ToolDef[];
  tool_choice?: ToolChoice;
  /** Chain with a previous response for stateful continuation. */
  previous_response_id?: string;
  /** Default true on OpenAI side; we default to true so previous_response_id chain works. */
  store?: boolean;
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
    summary?: 'auto' | 'concise' | 'detailed';
  };
  max_output_tokens?: number;
  /** Structured output (Responses shape, different from Chat Completions). */
  text?: {
    format:
      | { type: 'text' }
      | {
          type: 'json_schema';
          name: string;
          schema: Record<string, unknown>;
          strict?: boolean;
        };
  };
  metadata?: Record<string, string>;
}

// ---------- Response & event types ----------

export interface ResponsesUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

export interface CompletedResponse {
  id: string;
  status: 'completed' | 'incomplete' | 'failed';
  output: unknown[];
  usage: ResponsesUsage;
  model?: string;
  incomplete_details?: { reason: string };
  error?: { code: string; message: string };
}

/**
 * Parsed SSE event from /v1/responses stream. We keep discriminants aligned
 * with the OpenAI event type names so downstream switches read naturally.
 */
export type ResponsesEvent =
  | { type: 'response.created'; response: { id: string } }
  | { type: 'response.in_progress' }
  | { type: 'response.output_item.added'; output_index: number; item: OutputItem }
  | { type: 'response.output_item.done'; output_index: number; item: OutputItem }
  | { type: 'response.content_part.added'; output_index: number; item_id: string; part: unknown }
  | { type: 'response.content_part.done'; output_index: number; item_id: string; part: unknown }
  | { type: 'response.output_text.delta'; output_index: number; item_id: string; delta: string }
  | { type: 'response.output_text.done'; output_index: number; item_id: string; text: string }
  | { type: 'response.refusal.delta'; output_index: number; item_id: string; delta: string }
  | { type: 'response.refusal.done'; output_index: number; item_id: string; refusal: string }
  | { type: 'response.reasoning_summary_text.delta'; output_index: number; item_id: string; delta: string }
  | { type: 'response.reasoning_summary_text.done'; output_index: number; item_id: string; text: string }
  | { type: 'response.function_call_arguments.delta'; output_index: number; item_id: string; delta: string }
  | { type: 'response.function_call_arguments.done'; output_index: number; item_id: string; arguments: string }
  | { type: 'response.mcp_call_arguments.delta'; output_index: number; item_id: string; delta: string }
  | { type: 'response.mcp_call_arguments.done'; output_index: number; item_id: string; arguments: string }
  | { type: 'response.mcp_call.in_progress'; output_index: number; item_id: string }
  | { type: 'response.mcp_call.completed'; output_index: number; item_id: string }
  | { type: 'response.mcp_call.failed'; output_index: number; item_id: string; error?: string }
  | { type: 'response.mcp_list_tools.in_progress'; output_index: number; item_id: string }
  | { type: 'response.mcp_list_tools.completed'; output_index: number; item_id: string }
  | { type: 'response.mcp_list_tools.failed'; output_index: number; item_id: string }
  | { type: 'response.completed'; response: CompletedResponse }
  | { type: 'response.failed'; response: CompletedResponse }
  | { type: 'response.incomplete'; response: CompletedResponse }
  | { type: 'error'; message: string; code?: string }
  | { type: 'unknown'; raw: string; eventName?: string };

/**
 * Output items we care about. We only discriminate by type; payloads vary.
 */
export interface OutputItem {
  type:
    | 'message'
    | 'function_call'
    | 'mcp_call'
    | 'mcp_list_tools'
    | 'mcp_approval_request'
    | 'reasoning'
    | 'web_search_call'
    | 'image_generation_call'
    | 'file_search_call';
  id: string;
  // message
  role?: 'assistant';
  content?: Array<{ type: string; text?: string }>;
  status?: string;
  // function_call
  name?: string;
  call_id?: string;
  arguments?: string;
  // mcp_approval_request
  server_label?: string;
  // mcp_call
  server_url?: string;
  output?: unknown;
  error?: string;
}

// ---------- Error ----------

export class OpenAIError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: unknown,
  ) {
    const detail =
      typeof data === 'object' && data !== null && 'error' in data
        ? (data as { error?: { message?: string } }).error?.message ?? ''
        : typeof data === 'string'
          ? data
          : '';
    super(detail ? `OpenAI API error ${status}: ${detail}` : `OpenAI API error ${status}`);
  }
}

// ---------- HTTP ----------

export interface StreamResponsesOpts {
  apiKey: string;
  body: ResponsesRequestBody;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/** Open a streaming Responses API call. Throws OpenAIError on non-2xx. */
export async function streamResponses(opts: StreamResponsesOpts): Promise<Response> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ ...opts.body, stream: true }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new OpenAIError(res.status, err);
  }
  return res;
}

export interface RespondOpts {
  apiKey: string;
  body: Omit<ResponsesRequestBody, 'input'> & { input: ResponsesRequestBody['input'] };
  fetchImpl?: typeof fetch;
}

/** Non-streaming call — used for utility prompts (e.g. auto-title). */
export async function respond(
  opts: RespondOpts,
): Promise<{ text: string; usage: ResponsesUsage; responseId: string }> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...opts.body, stream: false }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new OpenAIError(res.status, err);
  }
  const data = (await res.json()) as {
    id: string;
    output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
    output_text?: string;
    usage?: ResponsesUsage;
  };
  let text = data.output_text ?? '';
  if (!text && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === 'message' && item.content) {
        for (const part of item.content) {
          if (part.type === 'output_text' && typeof part.text === 'string') text += part.text;
        }
      }
    }
  }
  return {
    text,
    usage: data.usage ?? { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    responseId: data.id,
  };
}

// ---------- SSE parsing ----------

/**
 * Parse one SSE block (terminated by blank line) into a typed event.
 * A block has the form:
 *   event: response.output_text.delta
 *   data: {...json...}
 *
 * Returns null for empty blocks / keepalives.
 */
export function parseResponsesEventBlock(block: string): ResponsesEvent | null {
  const trimmed = block.trim();
  if (!trimmed) return null;

  let eventName: string | undefined;
  const dataLines: string[] = [];
  for (const line of trimmed.split('\n')) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
    // Ignore ":" comments and "id:" lines.
  }
  if (dataLines.length === 0) return null;

  const dataStr = dataLines.join('\n');
  if (dataStr === '[DONE]') return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(dataStr);
  } catch {
    return { type: 'unknown', raw: dataStr, eventName };
  }

  const type = (payload.type as string | undefined) ?? eventName;
  if (!type) return { type: 'unknown', raw: dataStr, eventName };

  // Return with the payload fields spread; the discriminant is `type`.
  return { ...(payload as object), type } as ResponsesEvent;
}

/**
 * Iterator-friendly stream splitter: feed it decoded chunks, get complete
 * SSE events out. Buffers partial blocks between chunks.
 */
export function createSSEBuffer(): {
  push(chunk: string): ResponsesEvent[];
  flush(): ResponsesEvent[];
} {
  let buffer = '';
  function drain(force: boolean): ResponsesEvent[] {
    const events: ResponsesEvent[] = [];
    // Blocks are separated by \n\n. On force (stream end), we also drain the tail.
    while (true) {
      const idx = buffer.indexOf('\n\n');
      if (idx === -1) {
        if (force && buffer.trim()) {
          const ev = parseResponsesEventBlock(buffer);
          if (ev) events.push(ev);
          buffer = '';
        }
        return events;
      }
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const ev = parseResponsesEventBlock(block);
      if (ev) events.push(ev);
    }
  }
  return {
    push(chunk: string) {
      buffer += chunk;
      return drain(false);
    },
    flush() {
      return drain(true);
    },
  };
}
