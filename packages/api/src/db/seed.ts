import Database from 'better-sqlite3';
import { newId } from '@buck/shared';

export interface SeedOptions {
  databaseUrl: string;
  allowedEmails: string[];
  mcpBibleUrl: string;
  mcpWritingToolsUrl?: string;
}

/**
 * Seed the core MCP server definitions. Configs are stored as JSON and read
 * at request time by mcp-registry.ts. The `auth_header_env` field is the NAME
 * of the env var holding the shared Bearer secret (never the secret itself).
 *
 * bible : read tools = never approval, write tools = always approval.
 * writing-tools : read-only, never approval.
 */
function seedMcpServers(sqlite: Database.Database, opts: SeedOptions): void {
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
      require_approval: {
        never: {
          tool_names: [
            'list_entities',
            'get_entity',
            'search',
            'semantic_search',
            'list_events',
            'get_stats',
            'get_timeline',
            'list_relations',
          ],
        },
        always: {
          tool_names: [
            'create_entity',
            'update_entity',
            'delete_entity',
            'create_event',
            'update_event',
            'delete_event',
            'create_relation',
            'delete_relation',
          ],
        },
      },
    }),
    createdAt: now,
  });

  insertMcp.run({
    id: newId(),
    name: 'writing-tools',
    core: 0,
    enabled: 0,
    config: JSON.stringify({
      url: `${opts.mcpWritingToolsUrl ?? 'http://writing-tools-mcp:7802'}/mcp`,
      auth_header_env: 'MCP_SHARED_SECRET',
      server_description:
        'Text analysis: word/char count, readability, passive voice, keyword density, perplexity, stylometric analysis.',
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
  const mcpWritingToolsUrl = process.env.MCP_WRITING_TOOLS_URL;
  if (!url || emails.length === 0) {
    console.error('[seed] DATABASE_URL + AUTH_ALLOWED_EMAILS required');
    process.exit(1);
  }
  try {
    runSeed({
      databaseUrl: url,
      allowedEmails: emails,
      mcpBibleUrl,
      mcpWritingToolsUrl,
    });
    console.warn('[seed] done');
  } catch (err) {
    console.error('[seed] failed', err);
    process.exit(1);
  }
}
