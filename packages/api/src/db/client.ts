import Database from 'better-sqlite3';
import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import {
  drizzle,
  type BetterSQLite3Database,
} from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export interface DbHandles {
  sqlite: BetterSqlite3Database;
  db: BetterSQLite3Database<typeof schema>;
}

export function openDb(databaseUrl: string): DbHandles {
  const filePath = databaseUrl.replace(/^file:/, '');
  const sqlite = new Database(filePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
