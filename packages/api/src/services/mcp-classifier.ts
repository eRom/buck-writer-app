// packages/api/src/services/mcp-classifier.ts
//
// At boot, queries each core MCP server's tools/list and tags each tool as
// 'write' (requires approval) or 'read' (auto). The resulting
// require_approval object is patched into mcp_servers.config_json so the
// Responses API asks approval only for writes.
//
// Falls back silently to 'never' globally if the server is unreachable —
// preserves the current behavior.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { eq } from 'drizzle-orm';
import type { DbHandles } from '../db/client.js';
import { mcpServers } from '../db/schema.js';

const WRITE_PREFIXES = [
  'create_',
  'update_',
  'delete_',
  'import_',
  'restore_',
  'reindex_',
  'backup_',
];

function isWriteTool(name: string): boolean {
  return WRITE_PREFIXES.some((p) => name.startsWith(p));
}

export interface McpClassification {
  never: string[];
  always: string[];
}

export async function fetchMcpTools(
  url: string,
  authHeader: string | undefined,
): Promise<string[]> {
  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers },
  });
  const client = new Client({ name: 'buck-api-classifier', version: '1.0.0' });
  try {
    await client.connect(transport);
    const res = await client.listTools();
    return res.tools.map((t) => t.name);
  } finally {
    await client.close().catch(() => {});
  }
}

export function classifyToolNames(names: string[]): McpClassification {
  const never: string[] = [];
  const always: string[] = [];
  for (const n of names) {
    if (isWriteTool(n)) always.push(n);
    else never.push(n);
  }
  return { never, always };
}

/**
 * Iterates over enabled MCP servers with core=1. For each, calls tools/list,
 * classifies, and patches config_json.require_approval in-place.
 *
 * Non-core servers (e.g. writing-tools) keep whatever require_approval was
 * seeded — typically 'never' for read-only helpers.
 */
export async function applyMcpToolClassifications(
  db: DbHandles,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const rows = db.db.select().from(mcpServers).all();
  for (const row of rows) {
    if (row.core !== 1 || row.enabled !== 1) continue;
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(row.configJson) as Record<string, unknown>;
    } catch {
      continue;
    }
    const url = typeof config.url === 'string' ? config.url : null;
    if (!url) continue;

    const authEnvName =
      typeof config.auth_header_env === 'string' ? config.auth_header_env : undefined;
    const secret = authEnvName ? env[authEnvName] : undefined;
    const authHeader = secret ? `Bearer ${secret}` : undefined;

    try {
      const tools = await fetchMcpTools(url, authHeader);
      if (tools.length === 0) {
        console.warn(`[mcp-classifier] ${row.name}: empty tools list, keeping existing require_approval`);
        continue;
      }
      const { never, always } = classifyToolNames(tools);
      config.require_approval = {
        ...(never.length > 0 ? { never: { tool_names: never } } : {}),
        ...(always.length > 0 ? { always: { tool_names: always } } : {}),
      };
      db.db
        .update(mcpServers)
        .set({ configJson: JSON.stringify(config) })
        .where(eq(mcpServers.id, row.id))
        .run();
      console.warn(
        `[mcp-classifier] ${row.name}: ${never.length} read, ${always.length} write`,
      );
    } catch (err) {
      console.warn(
        `[mcp-classifier] ${row.name}: tools/list failed, keeping seed default —`,
        (err as Error).message,
      );
    }
  }
}
