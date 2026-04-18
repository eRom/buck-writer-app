import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/db/schema.js";
import { initFts } from "../src/db/fts.js";
import type { DbInstance } from "../src/db/index.js";

// ── SQL schema ──────────────────────────────────────────────────────────
const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  traits TEXT,
  background TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  atmosphere TEXT,
  geography TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  chapter TEXT,
  sort_order INTEGER,
  location_id TEXT REFERENCES locations(id),
  characters TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS interactions (
  id TEXT PRIMARY KEY NOT NULL,
  description TEXT NOT NULL,
  nature TEXT,
  characters TEXT NOT NULL,
  chapter TEXT,
  sort_order INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS world_rules (
  id TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS research (
  id TEXT PRIMARY KEY NOT NULL,
  topic TEXT NOT NULL,
  content TEXT NOT NULL,
  sources TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY NOT NULL,
  content TEXT NOT NULL,
  tags TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  embedding BLOB NOT NULL,
  content_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS embeddings_entity_type_entity_id_unique
  ON embeddings(entity_type, entity_id);
`;

// ── Helpers ─────────────────────────────────────────────────────────────

export function applySchema(sqlite: BetterSqlite3.Database): void {
  sqlite.exec(CREATE_TABLES_SQL);
}

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
