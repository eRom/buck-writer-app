import { describe, it, expect, vi } from 'vitest';
import { buildToolDefinitions, buildToolHandlers } from './chat-tools.js';
import type { McpClient } from '../services/mcp-client.js';
import type { McpTool } from '../services/mcp-client.js';

function fakeMcpClient(tools: McpTool[], healthy = true): McpClient {
  return {
    listTools: vi.fn().mockResolvedValue(tools),
    callTool: vi.fn().mockResolvedValue({ ok: true }),
    isHealthy: () => healthy,
    cachedTools: () => tools,
    onStatusChange: () => () => undefined,
    stop: () => undefined,
  };
}

describe('buildToolDefinitions with bible', () => {
  it('prefixes bible tools with bible_', () => {
    const mcp = fakeMcpClient([
      { name: 'search_fulltext', description: 'FTS', inputSchema: { type: 'object' } },
    ]);
    const defs = buildToolDefinitions(undefined, undefined, mcp);
    expect(defs.map((d) => d.function.name)).toContain('bible_search_fulltext');
  });

  it('skips bible tools if unhealthy', () => {
    const mcp = fakeMcpClient([{ name: 'x', description: 'y', inputSchema: {} }], false);
    const defs = buildToolDefinitions(undefined, undefined, mcp);
    expect(defs).toHaveLength(0);
  });

  it('returns empty when no workspace + no skills + no mcp', () => {
    const defs = buildToolDefinitions(undefined, undefined, undefined);
    expect(defs).toEqual([]);
  });
});

describe('buildToolHandlers with bible', () => {
  it('routes bible_X to mcpClient.callTool(X, args)', async () => {
    const mcp = fakeMcpClient([{ name: 'search_fulltext', description: '', inputSchema: {} }]);
    const handlers = buildToolHandlers(undefined, undefined, mcp);
    const result = await handlers['bible_search_fulltext']!({ query: 'bob' });
    expect(mcp.callTool).toHaveBeenCalledWith('search_fulltext', { query: 'bob' });
    expect(result).toEqual({ ok: true });
  });

  it('returns error shape when callTool throws', async () => {
    const mcp = fakeMcpClient([{ name: 'x', description: '', inputSchema: {} }]);
    (mcp.callTool as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    const handlers = buildToolHandlers(undefined, undefined, mcp);
    const result = await handlers['bible_x']!({});
    expect(result).toEqual({ error: expect.stringContaining('boom') });
  });
});
