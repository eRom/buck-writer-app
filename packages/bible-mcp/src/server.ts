import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DbInstance } from "./db/index.js";
import { registerAllTools } from "./tools/index.js";

export function createServer(db: DbInstance, dbPath: string): McpServer {
  const pkg = { version: "0.1.0" };

  const server = new McpServer({
    name: "bible-ecrivain",
    version: pkg.version,
  });

  registerAllTools(server, db, dbPath);

  console.error(`[server] bible-ecrivain MCP v${pkg.version} prêt`);

  return server;
}
