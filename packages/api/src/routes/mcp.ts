import { Hono } from 'hono';
import type { McpClient } from '../services/mcp-client.js';

export interface McpRoutesDeps {
  mcpClient?: McpClient;
}

export function createMcpRoutes(deps: McpRoutesDeps): Hono {
  const app = new Hono();
  app.get('/bible/status', (c) => {
    return c.json({
      healthy: deps.mcpClient?.isHealthy() ?? false,
      toolCount: deps.mcpClient?.cachedTools().length ?? 0,
    });
  });
  return app;
}
