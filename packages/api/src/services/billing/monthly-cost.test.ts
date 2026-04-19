import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../../db/client.js';
import { runMigrations } from '../../db/migrate.js';
import { runSeed } from '../../db/seed.js';
import { getMonthlyCostUsd } from './monthly-cost.js';
import { users, usageEvents, userSettings } from '../../db/schema.js';
import { newId } from '@buck/shared';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', '..', 'migrations');

// Fixed "now" = April 17 2026 (billing period April 1 – May 1)
const FIXED_NOW = new Date('2026-04-17T12:00:00Z').getTime();

function tmp() {
  return path.join(
    os.tmpdir(),
    `buck-monthly-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`,
  );
}

interface TestCtx {
  dbPath: string;
  db: ReturnType<typeof openDb>;
  userId: string;
}

function makeCtx(): TestCtx {
  const dbPath = tmp();
  const url = `file:${dbPath}`;
  runMigrations({ databaseUrl: url, migrationsFolder: migrationsDir });
  runSeed({
    databaseUrl: url,
    allowedEmails: ['alice@example.com'],
    mcpBibleUrl: 'http://bible-mcp:7801',
  });
  const db = openDb(url);
  const alice = db.db.select().from(users).all().find((u) => u.email === 'alice@example.com');
  if (!alice) throw new Error('alice not found');
  return { dbPath, db, userId: alice.id };
}

describe('getMonthlyCostUsd', () => {
  let ctx: TestCtx;

  afterEach(() => {
    if (ctx?.dbPath && fs.existsSync(ctx.dbPath)) {
      fs.unlinkSync(ctx.dbPath);
    }
  });

  it('retourne 0 si aucun event', () => {
    ctx = makeCtx();
    expect(getMonthlyCostUsd(ctx.db, ctx.userId, FIXED_NOW)).toBe(0);
  });

  it('somme les costUsd du mois en cours', () => {
    ctx = makeCtx();
    const april10 = new Date('2026-04-10T10:00:00Z').getTime();
    ctx.db.db.insert(usageEvents).values({
      id: newId(),
      userId: ctx.userId,
      createdAt: april10,
      model: 'gpt-4o',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 3.5,
    }).run();
    ctx.db.db.insert(usageEvents).values({
      id: newId(),
      userId: ctx.userId,
      createdAt: april10 + 1000,
      model: 'gpt-4o',
      inputTokens: 50,
      outputTokens: 20,
      costUsd: 1.5,
    }).run();
    expect(getMonthlyCostUsd(ctx.db, ctx.userId, FIXED_NOW)).toBe(5);
  });

  it('ignore les events hors période (mois précédent)', () => {
    ctx = makeCtx();
    const march15 = new Date('2026-03-15T10:00:00Z').getTime();
    ctx.db.db.insert(usageEvents).values({
      id: newId(),
      userId: ctx.userId,
      createdAt: march15,
      model: 'gpt-4o',
      inputTokens: 200,
      outputTokens: 100,
      costUsd: 10,
    }).run();
    expect(getMonthlyCostUsd(ctx.db, ctx.userId, FIXED_NOW)).toBe(0);
  });

  it('respecte le billingResetDay custom', () => {
    ctx = makeCtx();
    // resetDay=20 → period is March 20 – April 20
    ctx.db.db
      .insert(userSettings)
      .values({ userId: ctx.userId, billingResetDay: 20 })
      .onConflictDoUpdate({ target: userSettings.userId, set: { billingResetDay: 20 } })
      .run();

    const march25 = new Date('2026-03-25T00:00:00Z').getTime();
    ctx.db.db.insert(usageEvents).values({
      id: newId(),
      userId: ctx.userId,
      createdAt: march25,
      model: 'gpt-4o',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 7,
    }).run();
    // march25 is within March 20 – April 20 → should be included
    expect(getMonthlyCostUsd(ctx.db, ctx.userId, FIXED_NOW)).toBe(7);
  });
});
