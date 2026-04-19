import { Hono } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import { newId } from '@buck/shared';
import type { DbHandles } from '../db/client.js';
import { todos } from '../db/schema.js';

export interface TodosRouteDeps {
  db: DbHandles;
  nowMs?: () => number;
}

type TodoRow = typeof todos.$inferSelect;

function format(row: TodoRow) {
  return {
    id: row.id,
    text: row.text,
    done: row.done === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listTodos(db: DbHandles, userId: string) {
  const rows = db.db
    .select()
    .from(todos)
    .where(eq(todos.userId, userId))
    .orderBy(asc(todos.createdAt))
    .all();
  return rows.map(format);
}

export function createTodo(
  db: DbHandles,
  userId: string,
  text: string,
  now: number,
) {
  const id = newId();
  db.db.insert(todos).values({
    id,
    userId,
    text,
    done: 0,
    createdAt: now,
    updatedAt: now,
  }).run();
  const row = db.db.select().from(todos).where(eq(todos.id, id)).get();
  return row ? format(row) : null;
}

export function updateTodo(
  db: DbHandles,
  userId: string,
  id: string,
  patch: { text?: string; done?: boolean },
  now: number,
) {
  const updates: Partial<TodoRow> = { updatedAt: now };
  if (patch.text !== undefined) updates.text = patch.text;
  if (patch.done !== undefined) updates.done = patch.done ? 1 : 0;
  const res = db.db
    .update(todos)
    .set(updates)
    .where(and(eq(todos.id, id), eq(todos.userId, userId)))
    .run();
  if (res.changes === 0) return null;
  const row = db.db.select().from(todos).where(eq(todos.id, id)).get();
  return row ? format(row) : null;
}

export function deleteTodo(db: DbHandles, userId: string, id: string) {
  const res = db.db
    .delete(todos)
    .where(and(eq(todos.id, id), eq(todos.userId, userId)))
    .run();
  return res.changes > 0;
}

export function createTodosRoutes(
  deps: TodosRouteDeps,
): Hono<{ Variables: { userId: string } }> {
  const now = deps.nowMs ?? Date.now;
  const app = new Hono<{ Variables: { userId: string } }>();

  app.get('/', (c) => {
    const userId = c.get('userId');
    return c.json({ todos: listTodos(deps.db, userId) });
  });

  app.post('/', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json().catch(() => ({}));
    const text = typeof (body as { text?: unknown }).text === 'string'
      ? (body as { text: string }).text.trim()
      : '';
    if (!text) {
      return c.json(
        { error: { code: 'invalid_input', message: 'text required' } },
        422,
      );
    }
    const todo = createTodo(deps.db, userId, text, now());
    return c.json({ todo }, 201);
  });

  app.patch('/:id', async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const rec = body as { text?: unknown; done?: unknown };
    const patch: { text?: string; done?: boolean } = {};
    if (typeof rec.text === 'string') patch.text = rec.text.trim();
    if (typeof rec.done === 'boolean') patch.done = rec.done;
    const todo = updateTodo(deps.db, userId, id, patch, now());
    if (!todo) {
      return c.json(
        { error: { code: 'not_found', message: 'todo not found' } },
        404,
      );
    }
    return c.json({ todo });
  });

  app.delete('/:id', (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const ok = deleteTodo(deps.db, userId, id);
    if (!ok) {
      return c.json(
        { error: { code: 'not_found', message: 'todo not found' } },
        404,
      );
    }
    return c.json({ ok: true });
  });

  return app;
}
