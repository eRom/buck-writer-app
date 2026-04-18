import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { serveStatic } from '@hono/node-server/serve-static';
import { eq } from 'drizzle-orm';
import { newId } from '@buck/shared';
import { healthRoute } from './routes/health.js';
import { HttpError } from './utils/http-error.js';
import { createAuthRoutes, type AuthRoutesDeps } from './routes/auth.js';
import {
  createSessionRoutes,
  type SessionRoutesDeps,
} from './routes/sessions.js';
import {
  createChatRoute,
  type ChatRouteDeps,
} from './routes/chat.js';
import type { McpClient } from './services/mcp-client.js';
import type { MemoryServices } from './services/memory/bootstrap.js';
import { createSettingsRoutes } from './routes/settings.js';
import { createUsageRoutes } from './routes/usage.js';
import { createMcpRoutes } from './routes/mcp.js';
import { createWorkspaceRoutes } from './routes/workspace.js';
import { createAttachmentRoutes } from './routes/attachments.js';
import { createWebDAVRoutes } from './services/webdav.js';
import type { PromptsRef } from './services/prompts.js';
import { authGuard } from './middleware/auth.js';
import { securityHeaders } from './middleware/security-headers.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { createRateLimiter, ipKey } from './middleware/rate-limit.js';
import { budgetGuard } from './middleware/budget-guard.js';
import { users, sessionsAuth } from './db/schema.js';
import { sha256Hex } from './utils/crypto.js';

export interface AppDeps extends AuthRoutesDeps, SessionRoutesDeps {
  prompts?: PromptsRef;
  openaiApiKey?: string;
  /**
   * Absolute path to the user workspace directory. When provided, workspace
   * file-management routes are mounted at /api/workspace.
   */
  workspaceDir?: string;
  /**
   * Loaded workspace skills. Passed to the chat route for tool integration.
   */
  skills?: Map<string, import('./services/skills.js').Skill>;
  /**
   * MCP client for the bible-mcp server. When provided and healthy, bible
   * tools are injected into the chat tool loop with a `bible_` prefix.
   */
  mcpClient?: McpClient;
  /**
   * Absolute path to the built SPA (Vite dist/). If provided, Hono serves
   * it as static and falls back to index.html for non-/api paths. Leave
   * undefined in dev + tests (Vite dev server handles the SPA on :5173).
   */
  webDistRoot?: string;
  /**
   * Memory services (Supabase-backed long-term memory). When absent the chat
   * route runs without preferences/activeContext injection and without
   * recall/remember tools.
   */
  memory?: MemoryServices;
  /**
   * Canonical buck user id used as the memory partition. Falls back to the
   * authenticated user id when omitted.
   */
  buckUserId?: string;
}

// Re-export ChatRouteDeps for consumers
export type { ChatRouteDeps };

export function buildApp(deps: AppDeps) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use('*', securityHeaders());
  app.use('*', csrfMiddleware());

  app.route('/api/health', healthRoute);

  // Protected route: /api/auth/me — mounted BEFORE rate limiter to avoid being throttled
  app.get(
    '/api/auth/me',
    authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }),
    (c) => {
      const userId = c.get('userId');
      const user = deps.db.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .get();
      if (!user) {
        return c.json(
          { error: { code: 'not_found', message: 'user gone' } },
          404,
        );
      }
      return c.json({ userId: user.id, email: user.email });
    },
  );

  // Protected route: /api/auth/webdav-token — mounted BEFORE rate limiter
  app.post(
    '/api/auth/webdav-token',
    authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }),
  );

  // Rate-limit auth mutation endpoints (5 req/min per IP) to prevent magic-link spam
  app.use(
    '/api/auth/*',
    createRateLimiter({ windowMs: 60_000, max: 5, keyBy: ipKey }),
  );
  app.route('/api/auth', createAuthRoutes(deps));

  // Sessions routes (protected)
  app.use(
    '/api/sessions/*',
    authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }),
  );
  app.use(
    '/api/sessions',
    authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }),
  );
  app.route(
    '/api/sessions',
    createSessionRoutes({ db: deps.db, nowMs: deps.nowMs }),
  );

  // Chat streaming route (protected, only if prompts + openaiApiKey provided)
  if (deps.prompts && deps.openaiApiKey) {
    app.use(
      '/api/chat',
      authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }),
      createRateLimiter({ windowMs: 60_000, max: 30, keyBy: ipKey }),
      budgetGuard({ db: deps.db, nowMs: deps.nowMs }),
    );
    app.route('/api/chat', createChatRoute({
      db: deps.db,
      prompts: deps.prompts,
      openaiApiKey: deps.openaiApiKey,
      workspaceDir: deps.workspaceDir,
      skills: deps.skills,
      mcpClient: deps.mcpClient,
      nowMs: deps.nowMs,
      memory: deps.memory,
      buckUserId: deps.buckUserId,
    }));
  }

  // Settings routes (protected)
  app.use('/api/settings', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
  app.route('/api/settings', createSettingsRoutes({ db: deps.db }));

  // Usage routes (protected)
  app.use('/api/usage/*', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
  app.route('/api/usage', createUsageRoutes({ db: deps.db, nowMs: deps.nowMs }));

  // MCP routes (protected)
  app.use('/api/mcp/*', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
  app.route('/api/mcp', createMcpRoutes({ mcpClient: deps.mcpClient }));

  // Workspace routes (protected, only if workspaceDir provided)
  if (deps.workspaceDir) {
    app.use('/api/workspace/*', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
    app.use('/api/workspace', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
    app.route('/api/workspace', createWorkspaceRoutes({ db: deps.db, workspaceDir: deps.workspaceDir }));

    // Attachment routes (protected, within workspace)
    app.use('/api/attachments/*', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
    app.use('/api/attachments', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
    app.route('/api/attachments', createAttachmentRoutes({ db: deps.db, workspaceDir: deps.workspaceDir, nowMs: deps.nowMs }));

    // WebDAV routes — own auth (Bearer/Basic JWT with scope=webdav), CSRF bypassed in csrf.ts
    app.route('/webdav', createWebDAVRoutes({ workspaceDir: deps.workspaceDir, jwt: deps.jwt }));
  }

  // E2E-only helpers. Gated behind E2E=1 to prevent leakage.
  if (process.env.E2E === '1' && process.env.NODE_ENV !== 'production') {
    const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
    const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

    // Dev login: instant session, no magic link needed
    // Usage: GET /api/__e2e__/dev-login?email=romain.ecarnot@gmail.com
    app.get('/api/__e2e__/dev-login', async (c) => {
      const email = c.req.query('email')?.toLowerCase();
      if (!email) {
        return c.json({ error: { code: 'missing', message: 'email required' } }, 400);
      }
      const user = deps.db.db.select().from(users).where(eq(users.email, email)).get();
      if (!user) {
        return c.json({ error: { code: 'not_found', message: 'user not found' } }, 404);
      }
      const ts = (deps.nowMs ?? Date.now)();
      const sessionJwt = await deps.jwt.sign({ sub: user.id, scope: 'app' }, '30d');
      deps.db.db.insert(sessionsAuth).values({
        id: newId(), userId: user.id, tokenHash: sha256Hex(sessionJwt),
        scope: 'app', userAgent: c.req.header('user-agent') ?? null,
        expiresAt: ts + SESSION_TTL_MS, createdAt: ts,
      }).run();
      const cookie = `buck_session=${sessionJwt}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
      c.header('Set-Cookie', cookie);
      return c.redirect('/');
    });
    app.get('/api/__e2e__/last-token', async (c) => {
      const email = c.req.query('email');
      if (!email) {
        return c.json(
          { error: { code: 'missing', message: 'email required' } },
          400,
        );
      }
      try {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const file = path.resolve(
          process.env.E2E_LAST_TOKEN_FILE ?? './data/e2e-last-token.json',
        );
        const raw = JSON.parse(await fs.readFile(file, 'utf8')) as {
          email: string;
          rawToken: string;
        };
        if (raw.email !== email) {
          return c.json(
            { error: { code: 'not_found', message: 'no token' } },
            404,
          );
        }
        return c.json({ rawToken: raw.rawToken });
      } catch {
        return c.json(
          { error: { code: 'not_found', message: 'no token file' } },
          404,
        );
      }
    });
  }

  // Static SPA + fallback (production only — activated when webDistRoot is set)
  if (deps.webDistRoot) {
    const root = deps.webDistRoot;
    app.use('/assets/*', serveStatic({ root }));
    app.use('/vite.svg', serveStatic({ root, path: 'vite.svg' }));
    app.get('*', async (c) => {
      if (c.req.path.startsWith('/api')) {
        return c.json(
          { error: { code: 'not_found', message: 'route not found' } },
          404,
        );
      }
      const fs = await import('node:fs/promises');
      const html = await fs.readFile(`${root}/index.html`, 'utf8');
      return c.html(html);
    });
  }

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json(err.toJSON(), err.status as ContentfulStatusCode);
    }
    console.error('[api] unhandled error', err);
    return c.json(
      { error: { code: 'internal', message: 'internal server error' } },
      500,
    );
  });

  app.notFound((c) =>
    c.json({ error: { code: 'not_found', message: 'route not found' } }, 404),
  );

  return app;
}
