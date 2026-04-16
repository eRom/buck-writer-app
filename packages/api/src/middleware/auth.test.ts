import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { authGuard } from './auth.js';
import { runMigrations } from '../db/migrate.js';
import { openDb } from '../db/client.js';
import { sessionsAuth, users } from '../db/schema.js';
import { createJwtService } from '../services/jwt.js';
import { sha256Hex } from '../utils/crypto.js';
import { newId } from '@buck/shared';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');
const tmp = () =>
  path.join(
    os.tmpdir(),
    `buck-mw-auth-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );
const jwt = createJwtService({
  secret: 'a'.repeat(32),
  issuer: 'buck',
  audience: 'buck-web',
});

let dbPath: string;
afterEach(() => {
  if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

async function setup() {
  dbPath = tmp();
  runMigrations({
    databaseUrl: `file:${dbPath}`,
    migrationsFolder: migrationsDir,
  });
  const handles = openDb(`file:${dbPath}`);
  const userId = newId();
  handles.db
    .insert(users)
    .values({ id: userId, email: 'a@b.c', createdAt: Date.now() })
    .run();
  const token = await jwt.sign({ sub: userId, scope: 'app' }, '1h');
  handles.db
    .insert(sessionsAuth)
    .values({
      id: newId(),
      userId,
      tokenHash: sha256Hex(token),
      scope: 'app',
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    })
    .run();
  return { handles, token, userId };
}

describe('authGuard middleware', () => {
  it('401 when no cookie', async () => {
    const { handles } = await setup();
    const app = new Hono();
    app.use('*', authGuard({ db: handles, jwt }));
    app.get('/', (c) => c.text('hi'));
    const res = await app.request('/');
    expect(res.status).toBe(401);
  });

  it('200 + sets userId in context when valid', async () => {
    const { handles, token, userId } = await setup();
    const app = new Hono<{ Variables: { userId: string } }>();
    app.use('*', authGuard({ db: handles, jwt }));
    app.get('/', (c) => c.json({ me: c.get('userId') }));
    const res = await app.request('/', {
      headers: { cookie: `buck_session=${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { me: string };
    expect(body.me).toBe(userId);
  });

  it('401 when cookie has unknown session', async () => {
    const { handles } = await setup();
    const rogue = await jwt.sign({ sub: 'other-user', scope: 'app' }, '1h');
    const app = new Hono();
    app.use('*', authGuard({ db: handles, jwt }));
    app.get('/', (c) => c.text('hi'));
    const res = await app.request('/', {
      headers: { cookie: `buck_session=${rogue}` },
    });
    expect(res.status).toBe(401);
  });
});
