# M1 — Chat OpenAI Streaming + Sessions CRUD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a streaming chat interface connected to OpenAI via Vercel AI SDK, with full session CRUD and sidebar navigation.

**Architecture:** Vercel AI SDK (`streamText` server-side, `useChat` client-side) over Hono API with SQLite persistence. Three static prompt files (SYSTEM/USER/RULES) injected per call. Custom React UI with shadcn preset erom design system.

**Tech Stack:** Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/react`), Hono, Drizzle/SQLite, TanStack Router, react-markdown, rehype-highlight, remark-gfm, remark-math, rehype-katex, shadcn/ui components.

---

## File Map

### New files

```
packages/shared/src/schemas/chat.ts          — Zod schemas for chat API (session, message, chat request)
packages/api/src/routes/sessions.ts           — Sessions CRUD routes
packages/api/src/routes/sessions.test.ts      — Sessions route tests
packages/api/src/routes/chat.ts               — POST /api/chat streaming route
packages/api/src/routes/chat.test.ts          — Chat route tests
packages/api/src/services/prompts.ts          — Prompt file loader + cache
packages/api/src/services/prompts.test.ts     — Prompt loader tests
packages/api/migrations/0001_add_message_model.sql — Migration: add model column to messages
prompts/SYSTEM.md                             — System prompt
prompts/USER.md                               — User prompt template
prompts/RULES.md                              — Rules prompt
packages/web/src/components/chat/chat-layout.tsx     — Shell layout sidebar + chat
packages/web/src/components/chat/sidebar.tsx          — Sidebar with search + session list
packages/web/src/components/chat/session-list.tsx     — Grouped session list
packages/web/src/components/chat/chat-area.tsx        — Chat messages + input + useChat
packages/web/src/components/chat/message-bubble.tsx   — Single message with markdown
packages/web/src/components/chat/markdown-renderer.tsx — Markdown rendering config
packages/web/src/components/chat/model-selector.tsx   — Model dropdown
packages/web/src/components/chat/chat-input.tsx       — Textarea + submit + stop
packages/web/src/lib/sessions.ts                      — API client for sessions
packages/web/src/routes/index.tsx                     — Replace M0 shell with ChatLayout
packages/web/src/routes/chat.$sessionId.tsx           — Route for specific session
```

### Modified files

```
packages/shared/src/index.ts                  — Re-export chat schemas
packages/shared/src/pricing/models.ts         — (no change, already has PRICING)
packages/api/src/app.ts                       — Mount sessions + chat routes
packages/api/src/env.ts                       — (already has OPENAI_API_KEY optional)
packages/api/src/index.ts                     — Pass openaiApiKey to app deps
packages/api/package.json                     — Add ai, @ai-sdk/openai
packages/web/package.json                     — Add @ai-sdk/react, react-markdown, etc.
packages/web/src/routes/__root.tsx            — (no change needed)
```

---

## Task 1: Install dependencies

**Files:**
- Modify: `packages/api/package.json`
- Modify: `packages/web/package.json`

- [ ] **Step 1: Install API dependencies**

```bash
pnpm --filter @buck/api add ai @ai-sdk/openai
```

- [ ] **Step 2: Install web dependencies**

```bash
pnpm --filter @buck/web add @ai-sdk/react react-markdown rehype-highlight remark-gfm remark-math rehype-katex
```

- [ ] **Step 3: Install shadcn components needed for sidebar/chat**

```bash
pnpm --filter @buck/web dlx shadcn@latest add scroll-area dropdown-menu dialog input textarea
```

- [ ] **Step 4: Verify build**

```bash
pnpm -r typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/package.json packages/web/package.json pnpm-lock.yaml packages/web/src/components/ui/
git commit -m "chore: add M1 deps — AI SDK, react-markdown, rehype, shadcn components"
```

---

## Task 2: DB migration — add model column to messages

**Files:**
- Create: `packages/api/migrations/0001_add_message_model.sql`
- Modify: `packages/api/src/db/schema.ts`

- [ ] **Step 1: Create migration file**

Create `packages/api/migrations/0001_add_message_model.sql`:

```sql
ALTER TABLE messages ADD COLUMN model TEXT;
```

- [ ] **Step 2: Update schema.ts**

In `packages/api/src/db/schema.ts`, add `model` column to the `messages` table:

```typescript
// In the messages table definition, after contentJson:
model: text('model'),
```

- [ ] **Step 3: Run migration locally and verify**

```bash
DATABASE_URL=file:./packages/api/data/e2e-test.db pnpm --filter @buck/api exec tsx src/db/migrate.ts
```

Expected: `[migrate] done`

- [ ] **Step 4: Run existing tests to verify no regression**

```bash
pnpm -r test
```

Expected: all 58 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/api/migrations/0001_add_message_model.sql packages/api/src/db/schema.ts
git commit -m "feat(db): add model column to messages table"
```

---

## Task 3: Shared chat schemas

**Files:**
- Create: `packages/shared/src/schemas/chat.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create chat schemas**

Create `packages/shared/src/schemas/chat.ts`:

```typescript
import { z } from 'zod';

export const MODELS = ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-pro', 'gpt-5.4-nano'] as const;
export type Model = (typeof MODELS)[number];

export const CreateSessionInput = z.object({
  title: z.string().max(200).optional(),
  model: z.enum(MODELS).optional(),
});
export type CreateSessionInput = z.infer<typeof CreateSessionInput>;

export const UpdateSessionInput = z.object({
  title: z.string().max(200).optional(),
  archived: z.boolean().optional(),
  model: z.enum(MODELS).optional(),
});
export type UpdateSessionInput = z.infer<typeof UpdateSessionInput>;

export const SessionsQueryInput = z.object({
  q: z.string().max(200).optional(),
  archived: z.coerce.number().int().min(0).max(1).optional().default(0),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});
export type SessionsQueryInput = z.infer<typeof SessionsQueryInput>;

export const MessagesQueryInput = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});
export type MessagesQueryInput = z.infer<typeof MessagesQueryInput>;

export const ChatRequestInput = z.object({
  sessionId: z.string().uuid().optional(),
  model: z.enum(MODELS).optional(),
});
export type ChatRequestInput = z.infer<typeof ChatRequestInput>;
```

- [ ] **Step 2: Re-export from shared index**

In `packages/shared/src/index.ts`, add:

```typescript
export * from './schemas/chat.js';
```

- [ ] **Step 3: Build shared and typecheck**

```bash
pnpm --filter @buck/shared build && pnpm -r typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schemas/chat.ts packages/shared/src/index.ts
git commit -m "feat(shared): add chat Zod schemas (session, message, chat request)"
```

---

## Task 4: Prompt loader service

**Files:**
- Create: `packages/api/src/services/prompts.ts`
- Create: `packages/api/src/services/prompts.test.ts`
- Create: `prompts/SYSTEM.md`
- Create: `prompts/USER.md`
- Create: `prompts/RULES.md`

- [ ] **Step 1: Create prompt files**

Create `prompts/SYSTEM.md`:

```markdown
Tu es Buck, un assistant d'ecriture. Tu aides l'utilisateur a ecrire, reflechir, et explorer des idees. Tu reponds en francais par defaut, sauf si l'utilisateur ecrit dans une autre langue.
```

Create `prompts/USER.md` (empty for now — the user message is sent as-is):

```markdown
```

Create `prompts/RULES.md`:

```markdown
- Reponds de maniere concise et precise.
- Utilise le markdown pour structurer tes reponses quand c'est pertinent.
- Ne genere pas de contenu offensant ou nuisible.
- Si tu ne sais pas quelque chose, dis-le honnement.
```

- [ ] **Step 2: Write failing test for prompt loader**

Create `packages/api/src/services/prompts.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { loadPrompts, type Prompts } from './prompts.js';

describe('loadPrompts', () => {
  const tmpDir = '/tmp/buck-prompts-test-' + Date.now();

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(`${tmpDir}/SYSTEM.md`, 'You are a test bot.');
    fs.writeFileSync(`${tmpDir}/RULES.md`, '- Be nice.');
    fs.writeFileSync(`${tmpDir}/USER.md`, '');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads all three prompt files', () => {
    const prompts = loadPrompts(tmpDir);
    expect(prompts.system).toBe('You are a test bot.');
    expect(prompts.rules).toBe('- Be nice.');
    expect(prompts.user).toBe('');
  });

  it('throws if SYSTEM.md is missing', () => {
    fs.unlinkSync(`${tmpDir}/SYSTEM.md`);
    expect(() => loadPrompts(tmpDir)).toThrow(/SYSTEM\.md/);
  });

  it('returns empty string for missing optional USER.md', () => {
    fs.unlinkSync(`${tmpDir}/USER.md`);
    const prompts = loadPrompts(tmpDir);
    expect(prompts.user).toBe('');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @buck/api test -- src/services/prompts.test.ts
```

Expected: FAIL — module `./prompts.js` not found.

- [ ] **Step 4: Implement prompt loader**

Create `packages/api/src/services/prompts.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';

export interface Prompts {
  system: string;
  rules: string;
  user: string;
}

export function loadPrompts(promptsDir: string): Prompts {
  const systemPath = path.join(promptsDir, 'SYSTEM.md');
  if (!fs.existsSync(systemPath)) {
    throw new Error(`Prompt file missing: SYSTEM.md in ${promptsDir}`);
  }

  const system = fs.readFileSync(systemPath, 'utf8').trim();
  const rulesPath = path.join(promptsDir, 'RULES.md');
  const rules = fs.existsSync(rulesPath)
    ? fs.readFileSync(rulesPath, 'utf8').trim()
    : '';
  const userPath = path.join(promptsDir, 'USER.md');
  const user = fs.existsSync(userPath)
    ? fs.readFileSync(userPath, 'utf8').trim()
    : '';

  return { system, rules, user };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @buck/api test -- src/services/prompts.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add prompts/ packages/api/src/services/prompts.ts packages/api/src/services/prompts.test.ts
git commit -m "feat(api): prompt loader service + SYSTEM/USER/RULES files"
```

---

## Task 5: Sessions CRUD routes

**Files:**
- Create: `packages/api/src/routes/sessions.ts`
- Create: `packages/api/src/routes/sessions.test.ts`
- Modify: `packages/api/src/app.ts`

- [ ] **Step 1: Write failing tests for sessions routes**

Create `packages/api/src/routes/sessions.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../app.js';
import { openDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { createJwtService } from '../services/jwt.js';
import { createE2EEmailService } from '../services/email.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');
const tmp = () =>
  path.join(os.tmpdir(), `buck-sessions-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`);

interface Ctx {
  dbPath: string;
  app: ReturnType<typeof buildApp>;
  cookie: string;
}

async function setup(): Promise<Ctx> {
  const dbPath = tmp();
  const url = `file:${dbPath}`;
  runMigrations({ databaseUrl: url, migrationsFolder: migrationsDir });
  runSeed({ databaseUrl: url, allowedEmails: ['alice@example.com'], mcpBibleUrl: 'http://bible:7801' });
  const db = openDb(url);
  const jwt = createJwtService({ secret: 'a'.repeat(32), issuer: 'buck', audience: 'buck-web' });
  const email = createE2EEmailService('/dev/null');
  const app = buildApp({
    db,
    email,
    jwt,
    allowedEmails: ['alice@example.com'],
    publicBaseUrl: 'http://localhost:3000',
  });

  // Create a session cookie via auth flow
  const csrfRes = await app.request('/api/health');
  const setCookie = csrfRes.headers.get('set-cookie') ?? '';
  const csrfMatch = setCookie.match(/buck_csrf=([^;]+)/);
  const csrf = csrfMatch?.[1] ?? '';

  // Request magic link
  await app.request('/api/auth/request', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `buck_csrf=${csrf}`,
      'x-csrf-token': csrf,
    },
    body: JSON.stringify({ email: 'alice@example.com' }),
  });

  // Read token from e2e service — we use /dev/null so we need to get user+token from DB directly
  const { users, authTokens } = await import('../db/schema.js');
  const { eq } = await import('drizzle-orm');
  const user = db.db.select().from(users).where(eq(users.email, 'alice@example.com')).get()!;
  const token = await jwt.sign({ sub: user.id });
  const { sha256Hex } = await import('../utils/crypto.js');

  // Insert auth session directly
  const { sessionsAuth } = await import('../db/schema.js');
  const { newId } = await import('@buck/shared');
  db.db.insert(sessionsAuth).values({
    id: newId(),
    userId: user.id,
    tokenHash: sha256Hex(token),
    scope: 'app',
    expiresAt: Date.now() + 86400000,
    createdAt: Date.now(),
  }).run();

  return { dbPath, app, cookie: `buck_session=${token}; buck_csrf=${csrf}` };
}

function csrfHeader(cookie: string): Record<string, string> {
  const csrf = cookie.match(/buck_csrf=([^;]+)/)?.[1] ?? '';
  return { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' };
}

describe('sessions routes', () => {
  const ctxs: Ctx[] = [];

  async function getCtx(): Promise<Ctx> {
    const c = await setup();
    ctxs.push(c);
    return c;
  }

  afterEach(() => {
    for (const c of ctxs) {
      try { fs.unlinkSync(c.dbPath); } catch {}
    }
    ctxs.length = 0;
  });

  it('POST /api/sessions creates a session', async () => {
    const ctx = await getCtx();
    const res = await ctx.app.request('/api/sessions', {
      method: 'POST',
      headers: csrfHeader(ctx.cookie),
      body: JSON.stringify({ title: 'Test chat' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string; title: string };
    expect(body.title).toBe('Test chat');
    expect(body.id).toBeDefined();
  });

  it('GET /api/sessions lists sessions', async () => {
    const ctx = await getCtx();
    // Create two sessions
    await ctx.app.request('/api/sessions', {
      method: 'POST',
      headers: csrfHeader(ctx.cookie),
      body: JSON.stringify({ title: 'Session A' }),
    });
    await ctx.app.request('/api/sessions', {
      method: 'POST',
      headers: csrfHeader(ctx.cookie),
      body: JSON.stringify({ title: 'Session B' }),
    });
    const res = await ctx.app.request('/api/sessions', {
      headers: { cookie: ctx.cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { sessions: unknown[] };
    expect(body.sessions).toHaveLength(2);
  });

  it('GET /api/sessions?q= searches by title', async () => {
    const ctx = await getCtx();
    await ctx.app.request('/api/sessions', {
      method: 'POST',
      headers: csrfHeader(ctx.cookie),
      body: JSON.stringify({ title: 'Alpha quest' }),
    });
    await ctx.app.request('/api/sessions', {
      method: 'POST',
      headers: csrfHeader(ctx.cookie),
      body: JSON.stringify({ title: 'Beta quest' }),
    });
    const res = await ctx.app.request('/api/sessions?q=Alpha', {
      headers: { cookie: ctx.cookie },
    });
    const body = await res.json() as { sessions: Array<{ title: string }> };
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].title).toBe('Alpha quest');
  });

  it('PATCH /api/sessions/:id renames session', async () => {
    const ctx = await getCtx();
    const createRes = await ctx.app.request('/api/sessions', {
      method: 'POST',
      headers: csrfHeader(ctx.cookie),
      body: JSON.stringify({ title: 'Old title' }),
    });
    const { id } = await createRes.json() as { id: string };
    const patchRes = await ctx.app.request(`/api/sessions/${id}`, {
      method: 'PATCH',
      headers: csrfHeader(ctx.cookie),
      body: JSON.stringify({ title: 'New title' }),
    });
    expect(patchRes.status).toBe(200);
    const body = await patchRes.json() as { title: string };
    expect(body.title).toBe('New title');
  });

  it('DELETE /api/sessions/:id soft-deletes', async () => {
    const ctx = await getCtx();
    const createRes = await ctx.app.request('/api/sessions', {
      method: 'POST',
      headers: csrfHeader(ctx.cookie),
      body: JSON.stringify({ title: 'To delete' }),
    });
    const { id } = await createRes.json() as { id: string };
    const delRes = await ctx.app.request(`/api/sessions/${id}`, {
      method: 'DELETE',
      headers: csrfHeader(ctx.cookie),
    });
    expect(delRes.status).toBe(200);
    // Verify it no longer shows in list
    const listRes = await ctx.app.request('/api/sessions', {
      headers: { cookie: ctx.cookie },
    });
    const body = await listRes.json() as { sessions: unknown[] };
    expect(body.sessions).toHaveLength(0);
  });

  it('GET /api/sessions/:id returns 404 for other user session', async () => {
    const ctx = await getCtx();
    const res = await ctx.app.request('/api/sessions/00000000-0000-0000-0000-000000000000', {
      headers: { cookie: ctx.cookie },
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @buck/api test -- src/routes/sessions.test.ts
```

Expected: FAIL — routes not mounted.

- [ ] **Step 3: Implement sessions routes**

Create `packages/api/src/routes/sessions.ts`:

```typescript
import { Hono } from 'hono';
import { eq, and, like, isNull, desc, lte } from 'drizzle-orm';
import {
  newId,
  CreateSessionInput,
  UpdateSessionInput,
  SessionsQueryInput,
  MessagesQueryInput,
} from '@buck/shared';
import type { DbHandles } from '../db/client.js';
import { chatSessions, messages } from '../db/schema.js';

export interface SessionRoutesDeps {
  db: DbHandles;
  nowMs?: () => number;
}

export function createSessionRoutes(deps: SessionRoutesDeps): Hono<{ Variables: { userId: string } }> {
  const now = deps.nowMs ?? Date.now;
  const app = new Hono<{ Variables: { userId: string } }>();

  // GET /api/sessions — list
  app.get('/', async (c) => {
    const userId = c.get('userId');
    const query = SessionsQueryInput.parse(Object.fromEntries(new URL(c.req.url).searchParams));
    const conditions = [
      eq(chatSessions.userId, userId),
      query.archived ? undefined : eq(chatSessions.archived, 0),
      isNull(chatSessions.deletedAt),
      query.q ? like(chatSessions.title, `%${query.q}%`) : undefined,
      query.cursor ? lte(chatSessions.lastMessageAt, parseInt(query.cursor, 10)) : undefined,
    ].filter(Boolean);

    const rows = deps.db.db
      .select()
      .from(chatSessions)
      .where(and(...conditions))
      .orderBy(desc(chatSessions.lastMessageAt))
      .limit(query.limit + 1)
      .all();

    const hasMore = rows.length > query.limit;
    const sessions = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? String(sessions[sessions.length - 1].lastMessageAt) : undefined;

    return c.json({ sessions, nextCursor });
  });

  // POST /api/sessions — create
  app.post('/', async (c) => {
    const userId = c.get('userId');
    const input = CreateSessionInput.parse(await c.req.json());
    const ts = now();
    const id = newId();
    deps.db.db.insert(chatSessions).values({
      id,
      userId,
      title: input.title ?? 'Nouvelle conversation',
      model: input.model ?? 'gpt-5.4-mini',
      reasoningEffort: 'low',
      createdAt: ts,
      updatedAt: ts,
      lastMessageAt: ts,
    }).run();

    const session = deps.db.db
      .select().from(chatSessions)
      .where(eq(chatSessions.id, id)).get()!;

    return c.json(session, 201);
  });

  // GET /api/sessions/:id — detail
  app.get('/:id', async (c) => {
    const userId = c.get('userId');
    const session = deps.db.db
      .select().from(chatSessions)
      .where(and(
        eq(chatSessions.id, c.req.param('id')),
        eq(chatSessions.userId, userId),
        isNull(chatSessions.deletedAt),
      )).get();

    if (!session) {
      return c.json({ error: { code: 'not_found', message: 'session not found' } }, 404);
    }
    return c.json(session);
  });

  // PATCH /api/sessions/:id — update
  app.patch('/:id', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const existing = deps.db.db
      .select().from(chatSessions)
      .where(and(
        eq(chatSessions.id, id),
        eq(chatSessions.userId, userId),
        isNull(chatSessions.deletedAt),
      )).get();

    if (!existing) {
      return c.json({ error: { code: 'not_found', message: 'session not found' } }, 404);
    }

    const input = UpdateSessionInput.parse(await c.req.json());
    const updates: Record<string, unknown> = { updatedAt: now() };
    if (input.title !== undefined) updates.title = input.title;
    if (input.archived !== undefined) updates.archived = input.archived ? 1 : 0;
    if (input.model !== undefined) updates.model = input.model;

    deps.db.db.update(chatSessions)
      .set(updates)
      .where(eq(chatSessions.id, id))
      .run();

    const updated = deps.db.db
      .select().from(chatSessions)
      .where(eq(chatSessions.id, id)).get()!;

    return c.json(updated);
  });

  // DELETE /api/sessions/:id — soft delete
  app.delete('/:id', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const existing = deps.db.db
      .select().from(chatSessions)
      .where(and(
        eq(chatSessions.id, id),
        eq(chatSessions.userId, userId),
        isNull(chatSessions.deletedAt),
      )).get();

    if (!existing) {
      return c.json({ error: { code: 'not_found', message: 'session not found' } }, 404);
    }

    deps.db.db.update(chatSessions)
      .set({ deletedAt: now() })
      .where(eq(chatSessions.id, id))
      .run();

    return c.json({ ok: true });
  });

  // GET /api/sessions/:id/messages — message history
  app.get('/:id/messages', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');

    // Verify session ownership
    const session = deps.db.db
      .select().from(chatSessions)
      .where(and(
        eq(chatSessions.id, id),
        eq(chatSessions.userId, userId),
        isNull(chatSessions.deletedAt),
      )).get();

    if (!session) {
      return c.json({ error: { code: 'not_found', message: 'session not found' } }, 404);
    }

    const query = MessagesQueryInput.parse(Object.fromEntries(new URL(c.req.url).searchParams));
    const conditions = [
      eq(messages.sessionId, id),
      query.cursor ? lte(messages.createdAt, parseInt(query.cursor, 10)) : undefined,
    ].filter(Boolean);

    const rows = deps.db.db
      .select().from(messages)
      .where(and(...conditions))
      .orderBy(messages.createdAt)
      .limit(query.limit + 1)
      .all();

    const hasMore = rows.length > query.limit;
    const msgs = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? String(msgs[msgs.length - 1].createdAt) : undefined;

    return c.json({ messages: msgs, nextCursor });
  });

  return app;
}
```

- [ ] **Step 4: Mount sessions routes in app.ts**

In `packages/api/src/app.ts`, add the import and mount:

```typescript
import { createSessionRoutes, type SessionRoutesDeps } from './routes/sessions.js';
```

Update `AppDeps` to extend `SessionRoutesDeps` (it already has `db`).

After the auth routes block, add:

```typescript
// Sessions CRUD (protected)
app.use('/api/sessions/*', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
app.use('/api/sessions', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
app.route('/api/sessions', createSessionRoutes({ db: deps.db, nowMs: deps.nowMs }));
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @buck/api test -- src/routes/sessions.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 6: Run full test suite for regression**

```bash
pnpm -r test
```

Expected: all tests pass (58 existing + 6 new).

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routes/sessions.ts packages/api/src/routes/sessions.test.ts packages/api/src/app.ts
git commit -m "feat(api): sessions CRUD routes with ownership guard"
```

---

## Task 6: Chat streaming route

**Files:**
- Create: `packages/api/src/routes/chat.ts`
- Create: `packages/api/src/routes/chat.test.ts`
- Modify: `packages/api/src/app.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Write failing tests for chat route**

Create `packages/api/src/routes/chat.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../app.js';
import { openDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { createJwtService } from '../services/jwt.js';
import { createE2EEmailService } from '../services/email.js';
import { loadPrompts } from '../services/prompts.js';
import { chatSessions, messages as messagesTable } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Mock AI SDK streamText
vi.mock('ai', () => ({
  streamText: vi.fn().mockImplementation(({ onFinish }) => {
    // Simulate streaming completion
    const result = {
      text: 'Hello! I am Buck.',
      usage: { promptTokens: 10, completionTokens: 5 },
      response: { modelId: 'gpt-5.4-mini' },
    };
    if (onFinish) setTimeout(() => onFinish(result), 10);
    return {
      toDataStreamResponse: () => new Response('data: {"text":"Hello! I am Buck."}\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      }),
    };
  }),
}));

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', '..', 'migrations');
const tmp = () =>
  path.join(os.tmpdir(), `buck-chat-${Date.now()}-${Math.floor(Math.random() * 1e9)}.db`);

// Create temp prompts dir
const promptsDir = path.join(os.tmpdir(), `buck-prompts-${Date.now()}`);
fs.mkdirSync(promptsDir, { recursive: true });
fs.writeFileSync(path.join(promptsDir, 'SYSTEM.md'), 'You are Buck.');
fs.writeFileSync(path.join(promptsDir, 'RULES.md'), '- Be helpful.');
fs.writeFileSync(path.join(promptsDir, 'USER.md'), '');

interface Ctx {
  dbPath: string;
  app: ReturnType<typeof buildApp>;
  cookie: string;
}

async function setup(): Promise<Ctx> {
  const dbPath = tmp();
  const url = `file:${dbPath}`;
  runMigrations({ databaseUrl: url, migrationsFolder: migrationsDir });
  runSeed({ databaseUrl: url, allowedEmails: ['alice@example.com'], mcpBibleUrl: 'http://bible:7801' });
  const db = openDb(url);
  const jwt = createJwtService({ secret: 'a'.repeat(32), issuer: 'buck', audience: 'buck-web' });
  const email = createE2EEmailService('/dev/null');
  const prompts = loadPrompts(promptsDir);
  const app = buildApp({
    db,
    email,
    jwt,
    allowedEmails: ['alice@example.com'],
    publicBaseUrl: 'http://localhost:3000',
    prompts,
    openaiApiKey: 'sk-test',
  });

  // Create auth session directly
  const { users, sessionsAuth } = await import('../db/schema.js');
  const { newId } = await import('@buck/shared');
  const { sha256Hex } = await import('../utils/crypto.js');
  const user = db.db.select().from(users).where(eq(users.email, 'alice@example.com')).get()!;
  const token = await jwt.sign({ sub: user.id });
  db.db.insert(sessionsAuth).values({
    id: newId(),
    userId: user.id,
    tokenHash: sha256Hex(token),
    scope: 'app',
    expiresAt: Date.now() + 86400000,
    createdAt: Date.now(),
  }).run();

  return { dbPath, app, cookie: `buck_session=${token}; buck_csrf=test` };
}

describe('POST /api/chat', () => {
  const ctxs: Ctx[] = [];
  async function getCtx() {
    const c = await setup();
    ctxs.push(c);
    return c;
  }

  afterEach(() => {
    for (const c of ctxs) {
      try { fs.unlinkSync(c.dbPath); } catch {}
    }
    ctxs.length = 0;
  });

  it('returns a streaming response', async () => {
    const ctx = await getCtx();
    const res = await ctx.app.request('/api/chat', {
      method: 'POST',
      headers: {
        cookie: ctx.cookie,
        'x-csrf-token': 'test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
  });

  it('creates session implicitly when no sessionId', async () => {
    const ctx = await getCtx();
    const res = await ctx.app.request('/api/chat', {
      method: 'POST',
      headers: {
        cookie: ctx.cookie,
        'x-csrf-token': 'test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });
    const sessionId = res.headers.get('x-session-id');
    expect(sessionId).toBeDefined();
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns 401 without auth', async () => {
    const ctx = await getCtx();
    const res = await ctx.app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'test', cookie: 'buck_csrf=test' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] }),
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @buck/api test -- src/routes/chat.test.ts
```

Expected: FAIL — chat route not found / `prompts` not in AppDeps.

- [ ] **Step 3: Implement chat route**

Create `packages/api/src/routes/chat.ts`:

```typescript
import { Hono } from 'hono';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { eq, and, isNull } from 'drizzle-orm';
import { newId, ChatRequestInput, MODELS } from '@buck/shared';
import { costOf } from '@buck/shared';
import type { DbHandles } from '../db/client.js';
import type { Prompts } from '../services/prompts.js';
import { chatSessions, messages, usageEvents, userSettings } from '../db/schema.js';

export interface ChatRouteDeps {
  db: DbHandles;
  prompts: Prompts;
  openaiApiKey: string;
  nowMs?: () => number;
}

export function createChatRoute(deps: ChatRouteDeps): Hono<{ Variables: { userId: string } }> {
  const now = deps.nowMs ?? Date.now;
  const openai = createOpenAI({ apiKey: deps.openaiApiKey });
  const app = new Hono<{ Variables: { userId: string } }>();

  app.post('/', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json();
    const input = ChatRequestInput.parse(body);
    const userMessages: Array<{ role: string; content: string }> = body.messages ?? [];

    if (!userMessages.length) {
      return c.json({ error: { code: 'invalid_input', message: 'messages required' } }, 422);
    }

    // Resolve session
    let sessionId = input.sessionId;
    let isNewSession = false;

    if (sessionId) {
      // Verify ownership
      const session = deps.db.db.select().from(chatSessions)
        .where(and(
          eq(chatSessions.id, sessionId),
          eq(chatSessions.userId, userId),
          isNull(chatSessions.deletedAt),
        )).get();
      if (!session) {
        return c.json({ error: { code: 'not_found', message: 'session not found' } }, 404);
      }
    } else {
      // Create session implicitly
      sessionId = newId();
      isNewSession = true;
      const ts = now();
      deps.db.db.insert(chatSessions).values({
        id: sessionId,
        userId,
        title: 'Nouvelle conversation',
        model: input.model ?? 'gpt-5.4-mini',
        reasoningEffort: 'low',
        createdAt: ts,
        updatedAt: ts,
        lastMessageAt: ts,
      }).run();
    }

    // Resolve model: request > session > user settings
    let model = input.model;
    if (!model) {
      const session = deps.db.db.select().from(chatSessions)
        .where(eq(chatSessions.id, sessionId)).get();
      model = (session?.model as typeof MODELS[number]) ?? 'gpt-5.4-mini';
    }
    if (!model) {
      const settings = deps.db.db.select().from(userSettings)
        .where(eq(userSettings.userId, userId)).get();
      model = (settings?.defaultModel as typeof MODELS[number]) ?? 'gpt-5.4-mini';
    }

    // Build messages array with prompts
    const systemMessages = [
      { role: 'system' as const, content: deps.prompts.system },
      deps.prompts.rules ? { role: 'system' as const, content: deps.prompts.rules } : null,
    ].filter(Boolean);

    const allMessages = [
      ...systemMessages,
      ...userMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const result = streamText({
      model: openai(model),
      messages: allMessages,
      onFinish: async ({ text, usage, response }) => {
        const ts = now();
        const lastUserMsg = userMessages[userMessages.length - 1];

        // Persist user message
        deps.db.db.insert(messages).values({
          id: newId(),
          sessionId: sessionId!,
          role: 'user',
          contentJson: JSON.stringify({ text: lastUserMsg.content }),
          model: null,
          createdAt: ts,
        }).run();

        // Persist assistant message
        deps.db.db.insert(messages).values({
          id: newId(),
          sessionId: sessionId!,
          role: 'assistant',
          contentJson: JSON.stringify({ text }),
          model: model ?? null,
          createdAt: ts + 1,
        }).run();

        // Update session lastMessageAt
        deps.db.db.update(chatSessions)
          .set({ lastMessageAt: ts, updatedAt: ts })
          .where(eq(chatSessions.id, sessionId!))
          .run();

        // Insert usage event
        const inputTokens = usage?.promptTokens ?? 0;
        const outputTokens = usage?.completionTokens ?? 0;
        const cost = costOf(model ?? 'gpt-5.4-mini', inputTokens, outputTokens);
        deps.db.db.insert(usageEvents).values({
          id: newId(),
          userId,
          sessionId: sessionId!,
          createdAt: ts,
          model: model ?? 'gpt-5.4-mini',
          inputTokens,
          outputTokens,
          reasoningTokens: 0,
          costUsd: cost,
        }).run();

        // Auto-generate title for new sessions (fire-and-forget)
        if (isNewSession && lastUserMsg) {
          generateTitle(deps, openai, sessionId!, lastUserMsg.content).catch(() => {});
        }
      },
    });

    const response = result.toDataStreamResponse();
    // Add session ID header for implicit creation
    if (isNewSession) {
      const headers = new Headers(response.headers);
      headers.set('x-session-id', sessionId);
      return new Response(response.body, {
        status: response.status,
        headers,
      });
    }
    return response;
  });

  return app;
}

async function generateTitle(
  deps: ChatRouteDeps,
  openai: ReturnType<typeof createOpenAI>,
  sessionId: string,
  firstMessage: string,
): Promise<void> {
  const { text } = await import('ai').then((m) =>
    m.generateText({
      model: openai('gpt-5.4-nano'),
      messages: [
        {
          role: 'system',
          content: 'Generate a short title (5-6 words max, in the language of the user message) for a chat that starts with the following message. Return ONLY the title, nothing else.',
        },
        { role: 'user', content: firstMessage },
      ],
      maxTokens: 30,
    }),
  );

  if (text.trim()) {
    deps.db.db.update(chatSessions)
      .set({ title: text.trim().slice(0, 200) })
      .where(eq(chatSessions.id, sessionId))
      .run();
  }
}
```

- [ ] **Step 4: Update AppDeps and mount chat route in app.ts**

In `packages/api/src/app.ts`, add to imports:

```typescript
import { createChatRoute, type ChatRouteDeps } from './routes/chat.js';
import type { Prompts } from './services/prompts.js';
```

Update `AppDeps`:

```typescript
export interface AppDeps extends AuthRoutesDeps {
  webDistRoot?: string;
  prompts?: Prompts;
  openaiApiKey?: string;
}
```

After sessions route block, add:

```typescript
// Chat streaming (protected)
if (deps.prompts && deps.openaiApiKey) {
  app.use('/api/chat', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
  app.route('/api/chat', createChatRoute({
    db: deps.db,
    prompts: deps.prompts,
    openaiApiKey: deps.openaiApiKey,
    nowMs: deps.nowMs,
  }));
}
```

- [ ] **Step 5: Update index.ts to pass prompts and openaiApiKey**

In `packages/api/src/index.ts`, add:

```typescript
import { loadPrompts } from './services/prompts.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
```

Before `buildApp`, add:

```typescript
const promptsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', 'prompts',
);
const prompts = (() => {
  try { return loadPrompts(promptsDir); }
  catch { console.warn('[api] prompts/ not found, chat disabled'); return undefined; }
})();
```

Add to `buildApp` call:

```typescript
prompts,
openaiApiKey: env.OPENAI_API_KEY,
```

- [ ] **Step 6: Run chat tests**

```bash
pnpm --filter @buck/api test -- src/routes/chat.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 7: Run full test suite**

```bash
pnpm -r test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/routes/chat.ts packages/api/src/routes/chat.test.ts packages/api/src/app.ts packages/api/src/index.ts
git commit -m "feat(api): POST /api/chat streaming route with AI SDK + session persistence"
```

---

## Task 7: Web — sessions API client + ChatLayout shell

**Files:**
- Create: `packages/web/src/lib/sessions.ts`
- Create: `packages/web/src/components/chat/chat-layout.tsx`
- Modify: `packages/web/src/routes/index.tsx`

- [ ] **Step 1: Create sessions API client**

Create `packages/web/src/lib/sessions.ts`:

```typescript
import { apiFetch } from './api';

export interface Session {
  id: string;
  title: string;
  model: string;
  archived: number;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number | null;
}

export interface SessionsResponse {
  sessions: Session[];
  nextCursor?: string;
}

export async function fetchSessions(q?: string): Promise<SessionsResponse> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  return apiFetch<SessionsResponse>(`/api/sessions?${params}`);
}

export async function createSession(title?: string): Promise<Session> {
  return apiFetch<Session>('/api/sessions', {
    method: 'POST',
    body: { title },
  });
}

export async function updateSession(
  id: string,
  data: { title?: string; archived?: boolean },
): Promise<Session> {
  return apiFetch<Session>(`/api/sessions/${id}`, {
    method: 'PATCH',
    body: data,
  });
}

export async function deleteSession(id: string): Promise<void> {
  await apiFetch(`/api/sessions/${id}`, { method: 'DELETE' });
}

export interface Message {
  id: string;
  role: string;
  contentJson: string;
  model: string | null;
  createdAt: number;
}

export interface MessagesResponse {
  messages: Message[];
  nextCursor?: string;
}

export async function fetchMessages(sessionId: string): Promise<MessagesResponse> {
  return apiFetch<MessagesResponse>(`/api/sessions/${sessionId}/messages`);
}
```

- [ ] **Step 2: Create ChatLayout shell**

Create `packages/web/src/components/chat/chat-layout.tsx`:

```typescript
import { useState } from 'react';

interface ChatLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function ChatLayout({ sidebar, children }: ChatLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
          {sidebar}
        </aside>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute left-2 top-2 z-10 rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:text-foreground"
        aria-label={sidebarOpen ? 'Fermer la sidebar' : 'Ouvrir la sidebar'}
      >
        {sidebarOpen ? '\u2190' : '\u2192'}
      </button>

      {/* Main chat area */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Update index.tsx route to use ChatLayout**

Replace `packages/web/src/routes/index.tsx`:

```typescript
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { fetchMe, type MeResponse } from '@/lib/session';
import { ChatLayout } from '@/components/chat/chat-layout';

export const Route = createFileRoute('/')({
  loader: async (): Promise<MeResponse> => {
    const me = await fetchMe();
    if (!me) throw new Error('unauthenticated');
    return me;
  },
  component: Home,
});

function Home() {
  return (
    <ChatLayout
      sidebar={<div className="p-4 text-sm text-muted-foreground">Sidebar placeholder</div>}
    >
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Selectionne ou cree une conversation pour commencer.
      </div>
    </ChatLayout>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm -r typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/sessions.ts packages/web/src/components/chat/chat-layout.tsx packages/web/src/routes/index.tsx
git commit -m "feat(web): ChatLayout shell + sessions API client"
```

---

## Task 8: Web — Sidebar with session list

**Files:**
- Create: `packages/web/src/components/chat/sidebar.tsx`
- Create: `packages/web/src/components/chat/session-list.tsx`
- Modify: `packages/web/src/routes/index.tsx`

- [ ] **Step 1: Create SessionList component**

Create `packages/web/src/components/chat/session-list.tsx`:

```typescript
import { type Session } from '@/lib/sessions';

interface SessionListProps {
  sessions: Session[];
  activeId?: string;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
}

function groupByDate(sessions: Session[]): Record<string, Session[]> {
  const now = Date.now();
  const day = 86_400_000;
  const groups: Record<string, Session[]> = {
    "Aujourd'hui": [],
    '7 derniers jours': [],
    '30 derniers jours': [],
    'Plus ancien': [],
  };

  for (const s of sessions) {
    const age = now - (s.lastMessageAt ?? s.createdAt);
    if (age < day) groups["Aujourd'hui"].push(s);
    else if (age < 7 * day) groups['7 derniers jours'].push(s);
    else if (age < 30 * day) groups['30 derniers jours'].push(s);
    else groups['Plus ancien'].push(s);
  }

  return groups;
}

export function SessionList({
  sessions,
  activeId,
  onSelect,
  onRename,
  onDelete,
  onArchive,
}: SessionListProps) {
  const groups = groupByDate(sessions);

  return (
    <div className="flex-1 overflow-y-auto px-2 py-1">
      {Object.entries(groups).map(([label, items]) =>
        items.length === 0 ? null : (
          <div key={label} className="mb-3">
            <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">
              {label}
            </p>
            {items.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={`w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${
                  s.id === activeId
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-accent/50'
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>
        ),
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create Sidebar component**

Create `packages/web/src/components/chat/sidebar.tsx`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { fetchSessions, createSession, deleteSession, updateSession, type Session } from '@/lib/sessions';
import { SessionList } from './session-list';

interface SidebarProps {
  activeSessionId?: string;
  onSelectSession: (id: string) => void;
  onNewSession: (id: string) => void;
}

export function Sidebar({ activeSessionId, onSelectSession, onNewSession }: SidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [search, setSearch] = useState('');

  const loadSessions = useCallback(async () => {
    const res = await fetchSessions(search || undefined);
    setSessions(res.sessions);
  }, [search]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  async function handleNew() {
    const s = await createSession();
    setSessions((prev) => [s, ...prev]);
    onNewSession(s.id);
  }

  async function handleDelete(id: string) {
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleRename(id: string, title: string) {
    const updated = await updateSession(id, { title });
    setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }

  async function handleArchive(id: string) {
    await updateSession(id, { archived: true });
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border p-3">
        <button
          onClick={handleNew}
          className="flex-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/50"
        >
          + Nouveau chat
        </button>
      </div>
      <div className="px-3 py-2">
        <input
          type="text"
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-border bg-input px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>
      <SessionList
        sessions={sessions}
        activeId={activeSessionId}
        onSelect={onSelectSession}
        onRename={handleRename}
        onDelete={handleDelete}
        onArchive={handleArchive}
      />
    </>
  );
}
```

- [ ] **Step 3: Wire Sidebar into index.tsx**

Update `packages/web/src/routes/index.tsx`:

```typescript
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { fetchMe, type MeResponse } from '@/lib/session';
import { ChatLayout } from '@/components/chat/chat-layout';
import { Sidebar } from '@/components/chat/sidebar';
import { useState } from 'react';

export const Route = createFileRoute('/')({
  loader: async (): Promise<MeResponse> => {
    const me = await fetchMe();
    if (!me) throw new Error('unauthenticated');
    return me;
  },
  component: Home,
});

function Home() {
  const [activeSessionId, setActiveSessionId] = useState<string>();

  return (
    <ChatLayout
      sidebar={
        <Sidebar
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewSession={setActiveSessionId}
        />
      }
    >
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        {activeSessionId
          ? `Session ${activeSessionId} (chat a venir)`
          : 'Selectionne ou cree une conversation pour commencer.'}
      </div>
    </ChatLayout>
  );
}
```

- [ ] **Step 4: Typecheck + build**

```bash
pnpm -r typecheck && pnpm --filter @buck/web build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/chat/sidebar.tsx packages/web/src/components/chat/session-list.tsx packages/web/src/routes/index.tsx
git commit -m "feat(web): sidebar with session list, search, create, delete"
```

---

## Task 9: Web — Markdown renderer

**Files:**
- Create: `packages/web/src/components/chat/markdown-renderer.tsx`

- [ ] **Step 1: Create MarkdownRenderer**

Create `packages/web/src/components/chat/markdown-renderer.tsx`:

```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeHighlight, rehypeKatex]}
      className="prose prose-sm prose-invert max-w-none
        prose-pre:rounded-md prose-pre:border prose-pre:border-border prose-pre:bg-muted
        prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5
        prose-table:border-collapse prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-1
        prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-1
        prose-a:text-primary prose-a:underline"
    >
      {content}
    </ReactMarkdown>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm -r typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/chat/markdown-renderer.tsx
git commit -m "feat(web): MarkdownRenderer with GFM, syntax highlight, LaTeX"
```

---

## Task 10: Web — ChatInput + ModelSelector + MessageBubble

**Files:**
- Create: `packages/web/src/components/chat/chat-input.tsx`
- Create: `packages/web/src/components/chat/model-selector.tsx`
- Create: `packages/web/src/components/chat/message-bubble.tsx`

- [ ] **Step 1: Create ModelSelector**

Create `packages/web/src/components/chat/model-selector.tsx`:

```typescript
import { MODELS } from '@buck/shared';

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
}

const MODEL_LABELS: Record<string, string> = {
  'gpt-5.4': 'GPT-5.4',
  'gpt-5.4-mini': 'GPT-5.4 Mini',
  'gpt-5.4-pro': 'GPT-5.4 Pro',
  'gpt-5.4-nano': 'GPT-5.4 Nano',
};

export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="rounded-md border border-border bg-input px-2 py-1.5 text-sm text-foreground"
    >
      {MODELS.map((m) => (
        <option key={m} value={m}>
          {MODEL_LABELS[m] ?? m}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Create ChatInput**

Create `packages/web/src/components/chat/chat-input.tsx`:

```typescript
import { useRef, type KeyboardEvent } from 'react';
import { ModelSelector } from './model-selector';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isLoading: boolean;
  model: string;
  onModelChange: (model: string) => void;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isLoading,
  model,
  onModelChange,
}: ChatInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && value.trim()) onSubmit();
    }
  }

  return (
    <div className="border-t border-border p-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <ModelSelector value={model} onChange={onModelChange} disabled={isLoading} />
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ecris ton message..."
          rows={1}
          className="flex-1 resize-none rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          style={{ maxHeight: '200px' }}
        />
        {isLoading ? (
          <button
            onClick={onStop}
            className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={!value.trim()}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            Envoyer
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create MessageBubble**

Create `packages/web/src/components/chat/message-bubble.tsx`:

```typescript
import { MarkdownRenderer } from './markdown-renderer';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  model?: string | null;
}

export function MessageBubble({ role, content, model }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        ) : (
          <MarkdownRenderer content={content} />
        )}
        {!isUser && model && (
          <p className="mt-1 text-xs text-muted-foreground">{model}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm -r typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/chat/model-selector.tsx packages/web/src/components/chat/chat-input.tsx packages/web/src/components/chat/message-bubble.tsx
git commit -m "feat(web): ChatInput, ModelSelector, MessageBubble components"
```

---

## Task 11: Web — ChatArea with useChat integration

**Files:**
- Create: `packages/web/src/components/chat/chat-area.tsx`
- Modify: `packages/web/src/routes/index.tsx`

- [ ] **Step 1: Create ChatArea**

Create `packages/web/src/components/chat/chat-area.tsx`:

```typescript
import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { fetchMessages } from '@/lib/sessions';

interface ChatAreaProps {
  sessionId?: string;
  onSessionCreated?: (id: string) => void;
}

export function ChatArea({ sessionId, onSessionCreated }: ChatAreaProps) {
  const [model, setModel] = useState('gpt-5.4-mini');
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    input,
    setInput,
    append,
    isLoading,
    stop,
    setMessages,
  } = useChat({
    api: '/api/chat',
    body: { sessionId, model },
    headers: {
      'x-csrf-token': document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('buck_csrf='))
        ?.slice('buck_csrf='.length) ?? '',
    },
    onResponse: (response) => {
      const newSessionId = response.headers.get('x-session-id');
      if (newSessionId && onSessionCreated) {
        onSessionCreated(newSessionId);
      }
    },
  });

  // Load existing messages when switching sessions
  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    fetchMessages(sessionId).then((res) => {
      const loaded = res.messages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: JSON.parse(m.contentJson).text,
      }));
      setMessages(loaded);
    });
  }, [sessionId, setMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function handleSubmit() {
    if (!input.trim()) return;
    append({ role: 'user', content: input });
    setInput('');
  }

  return (
    <>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
          {messages.length === 0 && (
            <p className="text-center text-muted-foreground">
              Commence la conversation...
            </p>
          )}
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              role={m.role as 'user' | 'assistant'}
              content={m.content}
            />
          ))}
          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-muted px-4 py-2 text-sm text-muted-foreground">
                ...
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        onStop={stop}
        isLoading={isLoading}
        model={model}
        onModelChange={setModel}
      />
    </>
  );
}
```

- [ ] **Step 2: Wire ChatArea into index.tsx**

Update `packages/web/src/routes/index.tsx`:

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { fetchMe, type MeResponse } from '@/lib/session';
import { ChatLayout } from '@/components/chat/chat-layout';
import { Sidebar } from '@/components/chat/sidebar';
import { ChatArea } from '@/components/chat/chat-area';
import { useState } from 'react';

export const Route = createFileRoute('/')({
  loader: async (): Promise<MeResponse> => {
    const me = await fetchMe();
    if (!me) throw new Error('unauthenticated');
    return me;
  },
  component: Home,
});

function Home() {
  const [activeSessionId, setActiveSessionId] = useState<string>();

  return (
    <ChatLayout
      sidebar={
        <Sidebar
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewSession={setActiveSessionId}
        />
      }
    >
      <ChatArea
        sessionId={activeSessionId}
        onSessionCreated={setActiveSessionId}
      />
    </ChatLayout>
  );
}
```

- [ ] **Step 3: Typecheck + build**

```bash
pnpm -r typecheck && pnpm --filter @buck/web build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/chat/chat-area.tsx packages/web/src/routes/index.tsx
git commit -m "feat(web): ChatArea with useChat streaming + session auto-create"
```

---

## Task 12: Integration test — full flow manual smoke test

**Files:** None (manual verification)

- [ ] **Step 1: Build everything**

```bash
pnpm --filter @buck/shared build && pnpm -r typecheck && pnpm -r lint
```

- [ ] **Step 2: Run all unit tests**

```bash
pnpm -r test
```

Expected: all existing + new tests pass.

- [ ] **Step 3: Start API in dev mode with a real OPENAI_API_KEY**

```bash
OPENAI_API_KEY=<your-key> AUTH_JWT_SECRET=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa AUTH_ALLOWED_EMAILS=romain@example.com DATABASE_URL=file:/Users/recarnot/dev/buck-writer-app/packages/api/data/dev.db WORKSPACE_DIR=/Users/recarnot/dev/buck-writer-app/packages/api/data/workspace WEB_DIST_ROOT=/Users/recarnot/dev/buck-writer-app/packages/web/dist PORT=3000 pnpm --filter @buck/api dev
```

- [ ] **Step 4: Open browser, test the full flow**

1. Go to http://127.0.0.1:3000
2. Login via magic link
3. Click "Nouveau chat"
4. Send a message → see streaming response
5. Check sidebar shows the session with auto-generated title
6. Create another session, switch between them
7. Rename a session
8. Delete a session

- [ ] **Step 5: Verify DB persistence**

```bash
sqlite3 packages/api/data/dev.db "SELECT id, title, model FROM chat_sessions; SELECT id, role, model, substr(content_json, 1, 50) FROM messages;"
```

- [ ] **Step 6: Final commit if any adjustments were needed**

```bash
git add -A && git commit -m "fix: integration adjustments from smoke test"
```

---

## Task 13: Docker rebuild + push

**Files:**
- None (verification only)

- [ ] **Step 1: Docker build**

```bash
pnpm docker:build
```

Expected: image builds successfully.

- [ ] **Step 2: Docker compose up**

```bash
docker compose up -d && sleep 5 && docker compose ps
```

Expected: `buck-app` healthy.

- [ ] **Step 3: Docker compose down**

```bash
docker compose down
```

- [ ] **Step 4: Push all commits**

```bash
git push origin main
```
