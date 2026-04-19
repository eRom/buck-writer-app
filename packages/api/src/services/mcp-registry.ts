// packages/api/src/services/mcp-registry.ts
// Reads enabled MCP servers from the DB and produces ready-to-send McpToolDef
// entries for the Responses API tools[] array. The `auth_header_env` field
// holds the env var NAME to resolve at request time — the secret itself never
// lives in the DB.
import { eq } from 'drizzle-orm';
import type { DbHandles } from '../db/client.js';
import { mcpServers } from '../db/schema.js';
import type { McpToolDef } from '../lib/openai.js';

export interface McpServerConfig {
  url: string;
  auth_header_env?: string;
  server_description?: string;
  require_approval?: McpToolDef['require_approval'];
  allowed_tools?: McpToolDef['allowed_tools'];
}

export interface McpServerRow {
  id: string;
  name: string;
  core: number;
  enabled: number;
  transport: string;
  config: McpServerConfig;
  createdAt: number;
}

export function listMcpServers(db: DbHandles): McpServerRow[] {
  const rows = db.db.select().from(mcpServers).all();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    core: r.core,
    enabled: r.enabled,
    transport: r.transport,
    config: parseConfig(r.configJson),
    createdAt: r.createdAt,
  }));
}

export function setMcpEnabled(
  db: DbHandles,
  id: string,
  enabled: boolean,
): void {
  db.db
    .update(mcpServers)
    .set({ enabled: enabled ? 1 : 0 })
    .where(eq(mcpServers.id, id))
    .run();
}

export function buildMcpConnectorTools(
  db: DbHandles,
  env: NodeJS.ProcessEnv = process.env,
): McpToolDef[] {
  return listMcpServers(db)
    .filter((s) => s.enabled === 1)
    .map((s) => toolDefFromServer(s, env))
    .filter((t): t is McpToolDef => t !== null);
}

function toolDefFromServer(
  server: McpServerRow,
  env: NodeJS.ProcessEnv,
): McpToolDef | null {
  const cfg = server.config;
  if (!cfg.url) return null;

  const def: McpToolDef = {
    type: 'mcp',
    server_label: server.name,
    server_url: cfg.url,
  };
  if (cfg.server_description) def.server_description = cfg.server_description;
  if (cfg.auth_header_env) {
    const secret = env[cfg.auth_header_env];
    if (secret) def.headers = { Authorization: `Bearer ${secret}` };
  }
  if (cfg.require_approval) def.require_approval = cfg.require_approval;
  if (cfg.allowed_tools) def.allowed_tools = cfg.allowed_tools;
  return def;
}

function parseConfig(raw: string): McpServerConfig {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      url: typeof parsed.url === 'string' ? parsed.url : '',
      auth_header_env:
        typeof parsed.auth_header_env === 'string' ? parsed.auth_header_env : undefined,
      server_description:
        typeof parsed.server_description === 'string'
          ? parsed.server_description
          : undefined,
      require_approval: parsed.require_approval as McpServerConfig['require_approval'],
      allowed_tools: parsed.allowed_tools as McpServerConfig['allowed_tools'],
    };
  } catch {
    return { url: '' };
  }
}
