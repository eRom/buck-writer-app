import { Hono } from 'hono';
import { eq, and, like, isNull, desc, asc, lte, gt } from 'drizzle-orm';
import {
  CreateSessionInput,
  UpdateSessionInput,
  SessionsQueryInput,
  MessagesQueryInput,
  newId,
} from '@buck/shared';
import type { DbHandles } from '../db/client.js';
import { chatSessions, messages } from '../db/schema.js';

export interface SessionRoutesDeps {
  db: DbHandles;
  nowMs?: () => number;
}

export function createSessionRoutes(
  deps: SessionRoutesDeps,
): Hono<{ Variables: { userId: string } }> {
  const now = deps.nowMs ?? Date.now;
  const app = new Hono<{ Variables: { userId: string } }>();

  // GET / — list sessions (paginated, searchable, filtered by archived)
  app.get('/', (c) => {
    const userId = c.get('userId');
    const raw = Object.fromEntries(
      Object.entries({
        q: c.req.query('q'),
        archived: c.req.query('archived'),
        limit: c.req.query('limit'),
        cursor: c.req.query('cursor'),
      }).filter(([, v]) => v !== undefined),
    );
    const parsed = SessionsQueryInput.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { error: { code: 'invalid_input', message: 'invalid query params' } },
        400,
      );
    }
    const { q, archived, limit, cursor } = parsed.data;
    const fetchLimit = limit + 1;

    const conditions = [
      eq(chatSessions.userId, userId),
      eq(chatSessions.archived, archived),
      isNull(chatSessions.deletedAt),
    ] as Parameters<typeof and>;

    if (q) {
      conditions.push(like(chatSessions.title, `%${q}%`));
    }
    if (cursor) {
      const cursorMs = parseInt(cursor, 10);
      if (!isNaN(cursorMs)) {
        conditions.push(lte(chatSessions.lastMessageAt, cursorMs));
      }
    }

    const rows = deps.db.db
      .select()
      .from(chatSessions)
      .where(and(...conditions))
      .orderBy(desc(chatSessions.lastMessageAt))
      .limit(fetchLimit)
      .all();

    let nextCursor: string | null = null;
    if (rows.length > limit) {
      rows.pop();
      const last = rows[rows.length - 1];
      if (last) {
        nextCursor = String(last.lastMessageAt ?? last.createdAt);
      }
    }

    return c.json({ sessions: rows, nextCursor });
  });

  // POST / — create session
  app.post('/', async (c) => {
    const userId = c.get('userId');
    const raw = await c.req.json().catch(() => ({}));
    const parsed = CreateSessionInput.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { error: { code: 'invalid_input', message: 'invalid body' } },
        400,
      );
    }
    const { title, model } = parsed.data;
    const ts = now();
    const id = newId();

    deps.db.db
      .insert(chatSessions)
      .values({
        id,
        userId,
        title: title ?? 'Nouvelle conversation',
        model: model ?? 'gpt-5.4-mini',
        reasoningEffort: 'low',
        archived: 0,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    const session = deps.db.db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, id))
      .get();

    return c.json(session, 201);
  });

  // GET /:id — get single session
  app.get('/:id', (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');

    const session = deps.db.db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.id, id),
          eq(chatSessions.userId, userId),
          isNull(chatSessions.deletedAt),
        ),
      )
      .get();

    if (!session) {
      return c.json(
        { error: { code: 'not_found', message: 'session not found' } },
        404,
      );
    }

    return c.json(session);
  });

  // PATCH /:id — update session
  app.patch('/:id', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');

    const existing = deps.db.db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.id, id),
          eq(chatSessions.userId, userId),
          isNull(chatSessions.deletedAt),
        ),
      )
      .get();

    if (!existing) {
      return c.json(
        { error: { code: 'not_found', message: 'session not found' } },
        404,
      );
    }

    const raw = await c.req.json().catch(() => ({}));
    const parsed = UpdateSessionInput.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { error: { code: 'invalid_input', message: 'invalid body' } },
        400,
      );
    }

    const { title, archived, model } = parsed.data;
    const updates: Record<string, unknown> = { updatedAt: now() };
    if (title !== undefined) updates.title = title;
    if (archived !== undefined) updates.archived = archived ? 1 : 0;
    if (model !== undefined) updates.model = model;

    deps.db.db
      .update(chatSessions)
      .set(updates)
      .where(eq(chatSessions.id, id))
      .run();

    const updated = deps.db.db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, id))
      .get();

    return c.json(updated);
  });

  // DELETE /:id — soft delete
  app.delete('/:id', (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');

    const existing = deps.db.db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.id, id),
          eq(chatSessions.userId, userId),
          isNull(chatSessions.deletedAt),
        ),
      )
      .get();

    if (!existing) {
      return c.json(
        { error: { code: 'not_found', message: 'session not found' } },
        404,
      );
    }

    const ts = now();
    deps.db.db
      .update(chatSessions)
      .set({ deletedAt: ts, updatedAt: ts })
      .where(eq(chatSessions.id, id))
      .run();

    return c.json({ ok: true });
  });

  // GET /:id/messages — get messages for session (ownership check, paginated)
  app.get('/:id/messages', (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');

    // Ownership check
    const session = deps.db.db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.id, id),
          eq(chatSessions.userId, userId),
          isNull(chatSessions.deletedAt),
        ),
      )
      .get();

    if (!session) {
      return c.json(
        { error: { code: 'not_found', message: 'session not found' } },
        404,
      );
    }

    const raw = Object.fromEntries(
      Object.entries({
        limit: c.req.query('limit'),
        cursor: c.req.query('cursor'),
      }).filter(([, v]) => v !== undefined),
    );
    const parsed = MessagesQueryInput.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { error: { code: 'invalid_input', message: 'invalid query params' } },
        400,
      );
    }
    const { limit, cursor } = parsed.data;
    const fetchLimit = limit + 1;

    const conditions = [eq(messages.sessionId, id)] as Parameters<typeof and>;
    if (cursor) {
      const cursorMs = parseInt(cursor, 10);
      if (!isNaN(cursorMs)) {
        conditions.push(gt(messages.createdAt, cursorMs));
      }
    }

    const rows = deps.db.db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(asc(messages.createdAt))
      .limit(fetchLimit)
      .all();

    let nextCursor: string | null = null;
    if (rows.length > limit) {
      rows.pop();
      const last = rows[rows.length - 1];
      if (last) {
        nextCursor = String(last.createdAt);
      }
    }

    return c.json({ messages: rows, nextCursor });
  });

  return app;
}
