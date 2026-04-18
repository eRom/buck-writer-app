import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMcpClient } from './mcp-client.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createMcpClient', () => {
  it('listTools sends JSON-RPC tools/list and caches result', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        jsonrpc: '2.0', id: 1,
        result: { tools: [{ name: 'search_fulltext', description: 'Search', inputSchema: { type: 'object' } }] },
      })),
    );
    const client = createMcpClient({ url: 'http://bible-mcp:7801' });
    const tools = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('search_fulltext');
    expect(client.cachedTools()).toEqual(tools);
    expect(client.isHealthy()).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://bible-mcp:7801/mcp',
      expect.objectContaining({ method: 'POST' }),
    );
    client.stop();
  });

  it('callTool sends JSON-RPC tools/call and returns result', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          jsonrpc: '2.0', id: 1, result: { tools: [] },
        })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          jsonrpc: '2.0', id: 2, result: { matches: ['Bob'] },
        })),
      );
    const client = createMcpClient({ url: 'http://bible-mcp:7801' });
    await client.listTools();
    const result = await client.callTool('search_fulltext', { query: 'Bob' });
    expect(result).toEqual({ matches: ['Bob'] });
    client.stop();
  });

  it('listTools timeout flips healthy=false', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) => new Promise((_, reject) => {
        const signal = (init as RequestInit | undefined)?.signal;
        if (signal) {
          signal.addEventListener('abort', () => reject(new DOMException('AbortError', 'AbortError')));
        }
        // Also set a long fallback so the promise doesn't leak
        setTimeout(() => reject(new Error('timeout')), 10_000);
      }),
    );
    const client = createMcpClient({ url: 'http://bible-mcp:7801', timeoutMs: 500 });
    const p = client.listTools().catch(() => undefined);
    await vi.advanceTimersByTimeAsync(600);
    await p;
    expect(client.isHealthy()).toBe(false);
    client.stop();
  });

  it('onStatusChange fires when health flips', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: [] } })),
    );
    const client = createMcpClient({ url: 'http://bible-mcp:7801' });
    const cb = vi.fn();
    client.onStatusChange(cb);
    await client.listTools();
    // Second poll fails
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await client.listTools().catch(() => undefined);
    expect(cb).toHaveBeenCalledWith(false);
    client.stop();
  });

  it('callTool throws when server returns JSON-RPC error', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          jsonrpc: '2.0', id: 1, result: { tools: [] },
        })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          jsonrpc: '2.0', id: 2, error: { code: -32601, message: 'Method not found' },
        })),
      );
    const client = createMcpClient({ url: 'http://bible-mcp:7801' });
    await client.listTools();
    await expect(client.callTool('unknown_tool', {})).rejects.toThrow(/Method not found/);
    client.stop();
  });
});
