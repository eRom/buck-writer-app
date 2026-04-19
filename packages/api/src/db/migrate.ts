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
// NB: also gate on filename so the bundler (tsup) doesn't accidentally
// re-fire this block when the module is bundled INTO another entry like
// dist/index.js — without the suffix check, both index.js and the inlined
// CLI bootstrap would match `file://${process.argv[1]}` at app boot.
if (
  import.meta.url === `file://${process.argv[1]}` &&
  import.meta.url.endsWith('/migrate.js')
) {
  const { loadDotenv } = await import('../utils/find-up.js');
  loadDotenv();
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
