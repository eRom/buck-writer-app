import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { createMcpRoutes } from './mcp.js';
import { openDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { mcpServers } from '../db/schema.js';
import { newId } from '@buck/shared';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');

function tmp(): string {
  return path.join(
    os.tmpdir(),
    `buck-mcp-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );
}

describe('MCP registry routes', () => {
  let dbPath: string;
  let db: ReturnType<typeof openDb>;

  beforeEach(() => {
    dbPath = tmp();
    const url = `file:${dbPath}`;
    runMigrations({ databaseUrl: url, migrationsFolder: migrationsDir });
    db = openDb(url);
    db.db
      .insert(mcpServers)
      .values([
        {
          id: newId(),
          name: 'bible',
          core: 1,
          enabled: 1,
          transport: 'http-streamable',
          configJson: JSON.stringify({ url: 'https://bible-mcp.example.com/mcp' }),
          createdAt: Date.now(),
        },
        {
          id: newId(),
          name: 'writing-tools',
          core: 0,
          enabled: 0,
          transport: 'http-streamable',
          configJson: JSON.stringify({ url: 'https://writing-mcp.example.com/mcp' }),
          createdAt: Date.now(),
        },
      ])
      .run();
  });

  afterEach(() => {
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('GET / returns the list of servers with enabled flag', async () => {
    const app = new Hono();
    app.route('/api/mcp', createMcpRoutes({ db }));
    const res = await app.request('/api/mcp');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      servers: Array<{ name: string; enabled: boolean; core: boolean }>;
    };
    expect(body.servers).toHaveLength(2);
    const bible = body.servers.find((s) => s.name === 'bible');
    const writing = body.servers.find((s) => s.name === 'writing-tools');
    expect(bible?.enabled).toBe(true);
    expect(bible?.core).toBe(true);
    expect(writing?.enabled).toBe(false);
  });

  it('PATCH /:id returns 404 for unknown id', async () => {
    const app = new Hono();
    app.route('/api/mcp', createMcpRoutes({ db }));
    const res = await app.request('/api/mcp/does-not-exist', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(404);
  });

  it('PATCH /:id returns 422 for malformed body', async () => {
    const app = new Hono();
    app.route('/api/mcp', createMcpRoutes({ db }));
    const writing = db.db
      .select()
      .from(mcpServers)
      .all()
      .find((s) => s.name === 'writing-tools')!;
    const res = await app.request(`/api/mcp/${writing.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: 'yes-please' }),
    });
    expect(res.status).toBe(422);
    // Row untouched
    const row = db.db.select().from(mcpServers).all().find((s) => s.id === writing.id);
    expect(row?.enabled).toBe(0);
  });

  it('PATCH /:id toggles the enabled flag', async () => {
    const app = new Hono();
    app.route('/api/mcp', createMcpRoutes({ db }));
    const writing = db.db
      .select()
      .from(mcpServers)
      .all()
      .find((s) => s.name === 'writing-tools')!;
    const res = await app.request(`/api/mcp/${writing.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(200);
    const row = db.db.select().from(mcpServers).all().find((s) => s.id === writing.id);
    expect(row?.enabled).toBe(1);
  });
});
