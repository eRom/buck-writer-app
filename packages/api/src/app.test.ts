import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildApp, type AppDeps } from './app.js';
import { openDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { createJwtService } from './services/jwt.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', 'migrations');

interface TestDeps extends AppDeps {
  dbPath: string;
}

function mkDeps(): TestDeps {
  const dbPath = path.join(
    os.tmpdir(),
    `buck-app-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );
  runMigrations({
    databaseUrl: `file:${dbPath}`,
    migrationsFolder: migrationsDir,
  });
  const db = openDb(`file:${dbPath}`);
  const jwt = createJwtService({
    secret: 'a'.repeat(32),
    issuer: 'buck',
    audience: 'buck-web',
  });
  const email = { sendMagicLink: vi.fn(async () => {}) };
  return {
    db,
    email,
    jwt,
    allowedEmails: [],
    publicBaseUrl: 'https://buck.example.com',
    dbPath,
  };
}

let deps: TestDeps;
afterEach(() => {
  if (deps?.dbPath && fs.existsSync(deps.dbPath)) {
    fs.unlinkSync(deps.dbPath);
  }
});

describe('app', () => {
  it('GET /api/health returns ok', async () => {
    deps = mkDeps();
    const app = buildApp(deps);
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      uptime: number;
      version: string;
    };
    expect(body.ok).toBe(true);
    expect(typeof body.uptime).toBe('number');
  });

  it('GET /api/auth/me returns 401 without cookie', async () => {
    deps = mkDeps();
    const app = buildApp(deps);
    const res = await app.request('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('unknown route returns 404 JSON', async () => {
    deps = mkDeps();
    const app = buildApp(deps);
    const res = await app.request('/api/unknown');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });
});
