import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { createMcpRoutes } from './mcp.js';
import type { McpClient, McpTool } from '../services/mcp-client.js';

function fakeClient(healthy: boolean, toolCount = 0): McpClient {
  const tools: McpTool[] = new Array(toolCount).fill({ name: '', description: '', inputSchema: {} });
  return {
    listTools: vi.fn(),
    callTool: vi.fn(),
    isHealthy: () => healthy,
    cachedTools: () => tools,
    onStatusChange: () => () => undefined,
    stop: () => undefined,
  };
}

describe('GET /api/mcp/bible/status', () => {
  it('returns healthy when client is up', async () => {
    const app = new Hono();
    app.route('/api/mcp', createMcpRoutes({ mcpClient: fakeClient(true, 48) }));
    const res = await app.request('/api/mcp/bible/status');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ healthy: true, toolCount: 48 });
  });

  it('returns unhealthy when client is down', async () => {
    const app = new Hono();
    app.route('/api/mcp', createMcpRoutes({ mcpClient: fakeClient(false) }));
    const res = await app.request('/api/mcp/bible/status');
    expect(await res.json()).toEqual({ healthy: false, toolCount: 0 });
  });

  it('returns unhealthy when no client', async () => {
    const app = new Hono();
    app.route('/api/mcp', createMcpRoutes({ mcpClient: undefined }));
    const res = await app.request('/api/mcp/bible/status');
    expect(await res.json()).toEqual({ healthy: false, toolCount: 0 });
  });
});
