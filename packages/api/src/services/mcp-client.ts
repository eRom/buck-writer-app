export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpClient {
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: unknown): Promise<unknown>;
  isHealthy(): boolean;
  cachedTools(): McpTool[];
  onStatusChange(cb: (healthy: boolean) => void): () => void;
  stop(): void;
}

interface McpClientOpts {
  url: string;
  timeoutMs?: number;
  healthPollMs?: number;
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

export function createMcpClient(opts: McpClientOpts): McpClient {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const pollMs = opts.healthPollMs ?? 30_000;
  let rpcId = 0;
  let tools: McpTool[] = [];
  let healthy = false;
  const statusListeners = new Set<(h: boolean) => void>();
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function setHealth(next: boolean) {
    if (next !== healthy) {
      healthy = next;
      for (const cb of statusListeners) cb(healthy);
    }
  }

  async function rpc<T>(method: string, params?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${opts.url}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);
      const body = (await res.json()) as JsonRpcResponse<T>;
      if (body.error) throw new Error(`MCP RPC ${body.error.code}: ${body.error.message}`);
      if (body.result === undefined) throw new Error('MCP empty result');
      return body.result;
    } finally {
      clearTimeout(timer);
    }
  }

  async function listTools(): Promise<McpTool[]> {
    try {
      const result = await rpc<{ tools: McpTool[] }>('tools/list');
      tools = result.tools;
      setHealth(true);
      startPolling();
      return tools;
    } catch (err) {
      setHealth(false);
      throw err;
    }
  }

  async function callTool(name: string, args: unknown): Promise<unknown> {
    return rpc<unknown>('tools/call', { name, arguments: args });
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      listTools().catch(() => undefined);
    }, pollMs);
  }

  return {
    listTools,
    callTool,
    isHealthy: () => healthy,
    cachedTools: () => tools,
    onStatusChange: (cb) => {
      statusListeners.add(cb);
      return () => { statusListeners.delete(cb); };
    },
    stop: () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      statusListeners.clear();
    },
  };
}
