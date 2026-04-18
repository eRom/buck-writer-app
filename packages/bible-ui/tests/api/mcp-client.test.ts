import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callTool, listTools } from '@/api/mcp-client';

describe('mcp-client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('callTool POSTs JSON-RPC tools/call and returns parsed result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: '{"id":"abc","name":"Aragorn"}' }] },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await callTool('bible.characters.get', { id: 'abc' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/mcp',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.method).toBe('tools/call');
    expect(body.params).toEqual({ name: 'bible.characters.get', arguments: { id: 'abc' } });
    expect(result).toEqual({ id: 'abc', name: 'Aragorn' });
  });

  it('callTool throws on JSON-RPC error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -1, message: 'oops' } }),
      })
    );
    await expect(callTool('x')).rejects.toThrow('oops');
  });

  it('callTool throws on isError result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: { content: [{ type: 'text', text: 'tool failed' }], isError: true },
        }),
      })
    );
    await expect(callTool('x')).rejects.toThrow('tool failed');
  });

  it('listTools returns the tools array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: { tools: [{ name: 'bible.characters.list', description: '', inputSchema: {} }] },
        }),
      })
    );
    const tools = await listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('bible.characters.list');
  });
});
