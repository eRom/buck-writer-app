import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildApp, type AppDeps } from './app.js';
import { openDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { runSeed } from './db/seed.js';
import { createJwtService } from './services/jwt.js';
import { newId } from '@buck/shared';
import { sessionsAuth, users } from './db/schema.js';
import { sha256Hex } from './utils/crypto.js';
import { eq } from 'drizzle-orm';

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

  it('GET /api/auth/verify-session returns 401 without cookie', async () => {
    deps = mkDeps();
    const app = buildApp(deps);
    const res = await app.request('/api/auth/verify-session');
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/verify-session returns 204 + X-User-Id with valid session', async () => {
    deps = mkDeps();
    runSeed({
      databaseUrl: `file:${deps.dbPath}`,
      allowedEmails: ['alice@example.com'],
      mcpBibleUrl: 'http://bible-mcp:7801',
    });
    const user = deps.db.db
      .select()
      .from(users)
      .where(eq(users.email, 'alice@example.com'))
      .get()!;
    const jwt = await deps.jwt.sign({ sub: user.id, scope: 'app' }, '30d');
    deps.db.db
      .insert(sessionsAuth)
      .values({
        id: newId(),
        userId: user.id,
        tokenHash: sha256Hex(jwt),
        scope: 'app',
        userAgent: null,
        expiresAt: Date.now() + 86_400_000,
        createdAt: Date.now(),
      })
      .run();
    const app = buildApp(deps);
    const res = await app.request('/api/auth/verify-session', {
      headers: { cookie: `buck_session=${jwt}` },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('x-user-id')).toBe(user.id);
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
