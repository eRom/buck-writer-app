import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { initFts } from "./fts.js";
import fs from "node:fs";
import path from "node:path";

export type DbInstance = {
  sqlite: BetterSqlite3.Database;
  db: BetterSQLite3Database<typeof schema>;
};

export function getDb(dbPath: string): DbInstance {
  // Créer le dossier parent si nécessaire
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);

  // Activer WAL et foreign keys
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  // Initialiser FTS5 et triggers
  initFts(sqlite);

  return { sqlite, db };
}
