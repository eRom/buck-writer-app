import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface MigrateOptions {
  databaseUrl: string;
  migrationsFolder?: string;
}

export function runMigrations(opts: MigrateOptions): void {
  const filePath = opts.databaseUrl.replace(/^file:/, '');
  const sqlite = new Database(filePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite);
  const migrationsFolder =
    opts.migrationsFolder ??
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'migrations',
    );

  migrate(db, { migrationsFolder });
  sqlite.close();
}

// CLI entry: `node dist/db/migrate.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[migrate] DATABASE_URL is required');
    process.exit(1);
  }
  try {
    runMigrations({ databaseUrl: url });
    console.warn('[migrate] done');
  } catch (err) {
    console.error('[migrate] failed', err);
    process.exit(1);
  }
}
