import Database from 'better-sqlite3';
import { newId } from '@buck/shared';

export interface SeedOptions {
  databaseUrl: string;
  allowedEmails: string[];
  mcpBibleUrl: string;
}

export interface SeedMcpOptions {
  databaseUrl: string;
  mcpBibleUrl: string;
}

/**
 * Re-seeds only the MCP servers table with the latest config payloads.
 * Called unconditionally on boot (idempotent upsert) so that changes to URLs,
 * require_approval, or auth_header_env propagate without a manual DB edit.
 * Users and user_settings are NOT touched — they live on `runSeed` first-run
 * only.
 */
export function runMcpSeed(opts: SeedMcpOptions): void {
  const filePath = opts.databaseUrl.replace(/^file:/, '');
  const sqlite = new Database(filePath);
  sqlite.pragma('foreign_keys = ON');
  seedMcpServers(sqlite, {
    databaseUrl: opts.databaseUrl,
    allowedEmails: [],
    mcpBibleUrl: opts.mcpBibleUrl,
  });
  sqlite.close();
}

/**
 * Seed the core MCP server definitions. Configs are stored as JSON and read
 * at request time by mcp-registry.ts. The `auth_header_env` field is the NAME
 * of the env var holding the shared Bearer secret (never the secret itself).
 *
 * bible : read tools = never approval, write tools = always approval.
 */
export function seedMcpServers(sqlite: Database.Database, opts: SeedOptions): void {
  const now = Date.now();

  const insertMcp = sqlite.prepare(`
    INSERT INTO mcp_servers (id, name, core, enabled, transport, config_json, created_at)
    VALUES (@id, @name, @core, @enabled, 'http-streamable', @config, @createdAt)
    ON CONFLICT(name) DO UPDATE SET
      config_json = excluded.config_json,
      core = excluded.core
  `);

  insertMcp.run({
    id: newId(),
    name: 'bible',
    core: 1,
    enabled: 1,
    config: JSON.stringify({
      url: `${opts.mcpBibleUrl}/mcp`,
      auth_header_env: 'MCP_SHARED_SECRET',
      server_description:
        "Buck's narrative bible: characters, locations, events, rules, notes.",
      // Solo-owned data → 'never' globally. The previous granular config
      // used generic tool names (list_entities, create_entity…) that don't
      // match bible-mcp's domain-specific tools (list_characters, etc.),
      // making OpenAI fall back to requesting approval for every call.
      // When the UI approval flow lands (M7.1), revisit with real tool names.
      require_approval: 'never',
    }),
    createdAt: now,
  });

}

export function runSeed(opts: SeedOptions): void {
  const filePath = opts.databaseUrl.replace(/^file:/, '');
  const sqlite = new Database(filePath);
  sqlite.pragma('foreign_keys = ON');
  const now = Date.now();

  seedMcpServers(sqlite, opts);

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
    runSeed({
      databaseUrl: url,
      allowedEmails: emails,
      mcpBibleUrl,
    });
    console.warn('[seed] done');
  } catch (err) {
    console.error('[seed] failed', err);
    process.exit(1);
  }
}
