import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { runMigrations } from './migrate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');
const tmp = () =>
  path.join(
    os.tmpdir(),
    `buck-migrate-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );

let dbPath: string;
afterEach(() => {
  if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe('runMigrations', () => {
  it('creates all expected tables from a fresh db', () => {
    dbPath = tmp();
    runMigrations({
      databaseUrl: `file:${dbPath}`,
      migrationsFolder: migrationsDir,
    });

    const sqlite = new Database(dbPath, { readonly: true });
    const rows = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    sqlite.close();

    const names = rows
      .map((r) => r.name)
      .filter((n) => !n.startsWith('__drizzle'));
    expect(names).toEqual(
      expect.arrayContaining([
        'users',
        'auth_tokens',
        'sessions_auth',
        'chat_sessions',
        'messages',
        'attachments',
        'usage_events',
        'alert_triggers',
        'user_settings',
        'mcp_servers',
      ]),
    );
  });

  it('is idempotent (second run does nothing)', () => {
    dbPath = tmp();
    runMigrations({
      databaseUrl: `file:${dbPath}`,
      migrationsFolder: migrationsDir,
    });
    expect(() =>
      runMigrations({
        databaseUrl: `file:${dbPath}`,
        migrationsFolder: migrationsDir,
      }),
    ).not.toThrow();
  });
});
