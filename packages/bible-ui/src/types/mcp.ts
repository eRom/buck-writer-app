// Types JSON-RPC pour le protocole MCP (Model Context Protocol).

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: {
    content?: Array<{ type: string; text: string }>;
    isError?: boolean;
    tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  } & Partial<T>;
  error?: { code: number; message: string };
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
