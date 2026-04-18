import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/db/schema.js";
import { initFts } from "../src/db/fts.js";
import { applySchema } from "../src/db/index.js";
import type { DbInstance } from "../src/db/index.js";

// ── Helpers ─────────────────────────────────────────────────────────────

export { applySchema };

export function createTestDb(): DbInstance {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  applySchema(sqlite);
  initFts(sqlite);
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

export function createFileDb(dbPath: string): DbInstance {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  applySchema(sqlite);
  initFts(sqlite);
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

// ── Tool runner ─────────────────────────────────────────────────────────

export type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

export type ToolRunner = (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;

/**
 * Crée un runner de tools en enregistrant les handlers via un fake MCP server.
 * Utilise un dynamic import pour que les vi.mock() du fichier de test soient appliqués.
 */
export async function createToolRunner(
  dbInstance: DbInstance,
  dbPath: string = ":memory:",
): Promise<ToolRunner> {
  const { registerAllTools } = await import("../src/tools/index.js");

  const handlers = new Map<string, Function>();

  const fakeServer = {
    tool: (...args: unknown[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as Function;
      handlers.set(name, handler);
    },
  };

  registerAllTools(fakeServer as unknown as Parameters<typeof registerAllTools>[0], dbInstance, dbPath);

  return async (name: string, args: Record<string, unknown> = {}): Promise<ToolResult> => {
    const handler = handlers.get(name);
    if (!handler) throw new Error(`Tool "${name}" not registered`);
    return (await handler(args)) as ToolResult;
  };
}

// ── Result parser ───────────────────────────────────────────────────────

export function parseResult(result: ToolResult): unknown {
  const text = result.content[0]?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
