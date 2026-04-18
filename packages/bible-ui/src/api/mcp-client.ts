import type { JsonRpcResponse, McpTool } from '@/types/mcp';

let requestId = 0;

export async function callTool(
  name: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  const res = await fetch('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++requestId,
      method: 'tools/call',
      params: { name, arguments: params },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const json = (await res.json()) as JsonRpcResponse;
  if (json.error) throw new Error(json.error.message);
  const result = json.result;
  if (!result?.content?.length) return null;
  if (result.isError) throw new Error(result.content[0].text);
  return JSON.parse(result.content[0].text);
}

export async function listTools(): Promise<McpTool[]> {
  const res = await fetch('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method: 'tools/list' }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const json = (await res.json()) as JsonRpcResponse;
  if (json.error) throw new Error(json.error.message);
  return json.result?.tools ?? [];
}
