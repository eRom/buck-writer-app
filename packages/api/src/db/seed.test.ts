import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { runMigrations } from './migrate.js';
import { runSeed } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');
const tmp = () =>
  path.join(
    os.tmpdir(),
    `buck-seed-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );

let dbPath: string;
afterEach(() => {
  if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe('runSeed', () => {
  it('inserts bible MCP core server', () => {
    dbPath = tmp();
    const url = `file:${dbPath}`;
    runMigrations({ databaseUrl: url, migrationsFolder: migrationsDir });
    runSeed({
      databaseUrl: url,
      allowedEmails: ['alice@example.com'],
      mcpBibleUrl: 'http://bible-mcp:7801',
    });

    const sqlite = new Database(dbPath, { readonly: true });
    const row = sqlite
      .prepare(
        'SELECT name, core, enabled, transport FROM mcp_servers WHERE name = ?',
      )
      .get('bible') as {
      name: string;
      core: number;
      enabled: number;
      transport: string;
    };
    sqlite.close();
    expect(row).toMatchObject({
      name: 'bible',
      core: 1,
      enabled: 1,
      transport: 'http-streamable',
    });
  });

  it('inserts whitelisted users with default settings', () => {
    dbPath = tmp();
    const url = `file:${dbPath}`;
    runMigrations({ databaseUrl: url, migrationsFolder: migrationsDir });
    runSeed({
      databaseUrl: url,
      allowedEmails: ['alice@example.com', 'bob@example.com'],
      mcpBibleUrl: 'http://bible-mcp:7801',
    });

    const sqlite = new Database(dbPath, { readonly: true });
    const users = sqlite
      .prepare('SELECT email FROM users ORDER BY email')
      .all() as Array<{ email: string }>;
    const settingsCount = sqlite
      .prepare('SELECT COUNT(*) AS n FROM user_settings')
      .get() as { n: number };
    sqlite.close();
    expect(users.map((u) => u.email)).toEqual([
      'alice@example.com',
      'bob@example.com',
    ]);
    expect(settingsCount.n).toBe(2);
  });

  it('is idempotent (second run does not duplicate)', () => {
    dbPath = tmp();
    const url = `file:${dbPath}`;
    runMigrations({ databaseUrl: url, migrationsFolder: migrationsDir });
    const args = {
      databaseUrl: url,
      allowedEmails: ['alice@example.com'],
      mcpBibleUrl: 'http://bible-mcp:7801',
    };
    runSeed(args);
    runSeed(args);

    const sqlite = new Database(dbPath, { readonly: true });
    const userCount = sqlite
      .prepare('SELECT COUNT(*) AS n FROM users')
      .get() as { n: number };
    const mcpCount = sqlite
      .prepare('SELECT COUNT(*) AS n FROM mcp_servers')
      .get() as { n: number };
    sqlite.close();
    expect(userCount.n).toBe(1);
    // Seed now inserts both bible + writing-tools rows.
    expect(mcpCount.n).toBe(2);
  });

  it('inserts writing-tools MCP disabled by default', () => {
    dbPath = tmp();
    const url = `file:${dbPath}`;
    runMigrations({ databaseUrl: url, migrationsFolder: migrationsDir });
    runSeed({
      databaseUrl: url,
      allowedEmails: ['alice@example.com'],
      mcpBibleUrl: 'http://bible-mcp:7801',
    });

    const sqlite = new Database(dbPath, { readonly: true });
    const row = sqlite
      .prepare('SELECT name, core, enabled FROM mcp_servers WHERE name = ?')
      .get('writing-tools') as
      | { name: string; core: number; enabled: number }
      | undefined;
    sqlite.close();
    expect(row).toMatchObject({ name: 'writing-tools', core: 0, enabled: 0 });
  });
});
