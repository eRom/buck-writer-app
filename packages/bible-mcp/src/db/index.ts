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

/**
 * Applique le schéma SQL (CREATE TABLE IF NOT EXISTS) sur une instance SQLite.
 * Idempotent — peut être appelé sur une DB existante sans effet.
 */
export function applySchema(sqlite: BetterSqlite3.Database): void {
  sqlite.exec(CREATE_TABLES_SQL);
}

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

  // Créer les tables si elles n'existent pas
  applySchema(sqlite);

  const db = drizzle(sqlite, { schema });

  // Initialiser FTS5 et triggers
  initFts(sqlite);

  return { sqlite, db };
}
