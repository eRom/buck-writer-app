// packages/api/src/routes/mcp.ts
// Registry endpoints for remote MCP connectors.
//   GET  /api/mcp        → list all servers with enabled flag
//   PATCH /api/mcp/:id   → toggle enabled { enabled: boolean }
import { Hono } from 'hono';
import type { DbHandles } from '../db/client.js';
import { listMcpServers, setMcpEnabled } from '../services/mcp-registry.js';

export interface McpRoutesDeps {
  db: DbHandles;
}

export function createMcpRoutes(deps: McpRoutesDeps): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const servers = listMcpServers(deps.db).map((s) => ({
      id: s.id,
      name: s.name,
      core: s.core === 1,
      enabled: s.enabled === 1,
      transport: s.transport,
      url: s.config.url,
      description: s.config.server_description ?? null,
      createdAt: s.createdAt,
    }));
    return c.json({ servers });
  });

  app.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const enabled = Boolean((body as { enabled?: unknown }).enabled);
    setMcpEnabled(deps.db, id, enabled);
    return c.json({ ok: true, id, enabled });
  });

  return app;
}
