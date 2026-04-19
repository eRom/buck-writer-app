import type { JsonRpcResponse, McpTool } from '@/types/mcp';

let requestId = 0;

// MCP Streamable HTTP requires BOTH types in Accept.
const MCP_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};

/**
 * The server may respond in plain JSON or as a single SSE event block. Parse
 * both shapes to a JSON-RPC response.
 */
async function readJsonRpc(res: Response): Promise<JsonRpcResponse> {
  const ct = res.headers.get('content-type') ?? '';
  if (ct.startsWith('application/json')) {
    return (await res.json()) as JsonRpcResponse;
  }
  const text = await res.text();
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      return JSON.parse(line.slice(6)) as JsonRpcResponse;
    }
  }
  throw new Error('Unexpected MCP response body');
}

export async function callTool(
  name: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  const res = await fetch('/mcp', {
    method: 'POST',
    headers: MCP_HEADERS,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++requestId,
      method: 'tools/call',
      params: { name, arguments: params },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const json = await readJsonRpc(res);
  if (json.error) throw new Error(json.error.message);
  const result = json.result;
  const first = result?.content?.[0];
  if (!first) return null;
  if (result?.isError) throw new Error(first.text);
  try {
    return JSON.parse(first.text);
  } catch {
    return first.text;
  }
}

export async function listTools(): Promise<McpTool[]> {
  const res = await fetch('/mcp', {
    method: 'POST',
    headers: MCP_HEADERS,
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method: 'tools/list' }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const json = await readJsonRpc(res);
  if (json.error) throw new Error(json.error.message);
  return json.result?.tools ?? [];
}
