// packages/api/src/routes/mcp.ts
// Registry endpoints for remote MCP connectors.
//   GET  /api/mcp        → list all servers with enabled flag
//   PATCH /api/mcp/:id   → toggle enabled { enabled: boolean }
import { Hono } from 'hono';
import { z } from 'zod';
import type { DbHandles } from '../db/client.js';
import { listMcpServers, setMcpEnabled } from '../services/mcp-registry.js';

export interface McpRoutesDeps {
  db: DbHandles;
}

const PatchInput = z.object({ enabled: z.boolean() }).strict();

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
    const parsed = PatchInput.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: 'validation_error', message: parsed.error.message } },
        422,
      );
    }
    const exists = listMcpServers(deps.db).some((s) => s.id === id);
    if (!exists) {
      return c.json(
        { error: { code: 'not_found', message: `mcp server not found: ${id}` } },
        404,
      );
    }
    setMcpEnabled(deps.db, id, parsed.data.enabled);
    return c.json({ ok: true, id, enabled: parsed.data.enabled });
  });

  return app;
}
