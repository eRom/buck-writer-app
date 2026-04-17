import Database from 'better-sqlite3';
import { newId } from '@buck/shared';

export interface SeedOptions {
  databaseUrl: string;
  allowedEmails: string[];
  mcpBibleUrl: string;
}

export function runSeed(opts: SeedOptions): void {
  const filePath = opts.databaseUrl.replace(/^file:/, '');
  const sqlite = new Database(filePath);
  sqlite.pragma('foreign_keys = ON');
  const now = Date.now();

  // 1. MCP Bible core
  const insertMcp = sqlite.prepare(`
    INSERT INTO mcp_servers (id, name, core, enabled, transport, config_json, created_at)
    VALUES (@id, 'bible', 1, 1, 'http-streamable', @config, @createdAt)
    ON CONFLICT(name) DO UPDATE SET
      config_json = excluded.config_json,
      core = 1
  `);
  insertMcp.run({
    id: newId(),
    config: JSON.stringify({ url: `${opts.mcpBibleUrl}/mcp` }),
    createdAt: now,
  });

  // 2. Users whitelistés + user_settings
  const insertUser = sqlite.prepare(`
    INSERT INTO users (id, email, created_at)
    VALUES (@id, @email, @createdAt)
    ON CONFLICT(email) DO NOTHING
  `);
  const insertSettings = sqlite.prepare(`
    INSERT INTO user_settings (user_id)
    VALUES (@userId)
    ON CONFLICT(user_id) DO NOTHING
  `);
  const selectUser = sqlite.prepare('SELECT id FROM users WHERE email = ?');

  for (const email of opts.allowedEmails) {
    const id = newId();
    insertUser.run({ id, email, createdAt: now });
    const user = selectUser.get(email) as { id: string } | undefined;
    if (user) insertSettings.run({ userId: user.id });
  }

  sqlite.close();
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const { loadDotenv } = await import('../utils/find-up.js');
  loadDotenv();
  const url = process.env.DATABASE_URL;
  const emails = (process.env.AUTH_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const mcpBibleUrl = process.env.MCP_BIBLE_URL ?? 'http://bible-mcp:7801';
  if (!url || emails.length === 0) {
    console.error('[seed] DATABASE_URL + AUTH_ALLOWED_EMAILS required');
    process.exit(1);
  }
  try {
    runSeed({ databaseUrl: url, allowedEmails: emails, mcpBibleUrl });
    console.warn('[seed] done');
  } catch (err) {
    console.error('[seed] failed', err);
    process.exit(1);
  }
}
