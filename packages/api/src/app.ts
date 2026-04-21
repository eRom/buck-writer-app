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
import type { MemoryServices } from './services/memory/bootstrap.js';
import { createSettingsRoutes } from './routes/settings.js';
import { createUsageRoutes } from './routes/usage.js';
import { createMcpRoutes } from './routes/mcp.js';
import { createTodosRoutes } from './routes/todos.js';
import { createWorkspaceRoutes } from './routes/workspace.js';
import { createVectorStoreRoutes } from './routes/vector-store.js';
import { createAttachmentRoutes } from './routes/attachments.js';
import { createWebDAVRoutes } from './services/webdav.js';
import type { PromptsRef } from './services/prompts.js';
import { createRealtimeRoute } from './routes/realtime.js';
import { createTtsRoutes } from './routes/tts.js';
import type { UsageTracker } from './services/realtime/usage-tracker.js';
import type { mintRealtimeClientSecret } from './lib/realtime.js';
import { authGuard } from './middleware/auth.js';
import { securityHeaders } from './middleware/security-headers.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { createRateLimiter, createIpKey } from './middleware/rate-limit.js';
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
  /**
   * Whether realtime voice routes are enabled. Set via REALTIME_ENABLED=1.
   */
  realtimeEnabled?: boolean;
  /**
   * In-memory usage tracker for realtime sessions.
   */
  usageTracker?: UsageTracker;
  /**
   * Override mint function (tests injection).
   */
  mintFn?: typeof mintRealtimeClientSecret;
  /**
   * Whether the API runs behind a trusted reverse proxy that rewrites
   * X-Forwarded-For. Defaults to false (safe). See env.TRUST_PROXY.
   */
  trustProxy?: boolean;
  /**
   * Optional Domain attribute appended to buck_session cookies. See
   * AuthRoutesDeps.cookieDomain for details.
   */
  cookieDomain?: string;
  /**
   * Whether TTS (Gemini) is feature-enabled. Effective activation additionally
   * requires geminiApiKey to be non-empty. Set via TTS_ENABLED.
   */
  ttsEnabled?: boolean;
  /**
   * Default voice name when the user has not picked one in settings.
   */
  ttsDefaultVoice?: string;
  /**
   * Hard cap on message length (characters) accepted by /api/tts/:messageId.
   */
  ttsMaxChars?: number;
  /**
   * Gemini API key used by the TTS route.
   */
  geminiApiKey?: string;
}

// Re-export ChatRouteDeps for consumers
export type { ChatRouteDeps };

export function buildApp(deps: AppDeps) {
  const app = new Hono<{ Variables: { userId: string } }>();
  const ipKey = createIpKey(deps.trustProxy ?? false);
  app.use('*', securityHeaders());
  app.use('*', csrfMiddleware({ expectedOrigin: deps.publicBaseUrl }));

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
      return c.json({
        userId: user.id,
        email: user.email,
        features: {
          tts: Boolean(deps.ttsEnabled && deps.geminiApiKey),
        },
      });
    },
  );

  // Protected route: /api/auth/webdav-token — mounted BEFORE rate limiter
  app.post(
    '/api/auth/webdav-token',
    authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }),
  );

  // SSO endpoint for Caddy forward_auth — mounted BEFORE the /api/auth/*
  // magic-link rate limiter (bible-ui fires one request per asset). High
  // per-IP ceiling (60/min) gates unauthed floods that would force a
  // jose.jwtVerify + DB lookup on every hit.
  app.use(
    '/api/auth/verify-session',
    createRateLimiter({ windowMs: 60_000, max: 60, keyBy: ipKey }),
  );
  app.get(
    '/api/auth/verify-session',
    authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }),
    (c) => {
      c.header('X-User-Id', c.get('userId'));
      return c.body(null, 204);
    },
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
      nowMs: deps.nowMs,
      memory: deps.memory,
      buckUserId: deps.buckUserId,
    }));
  }

  // Realtime routes (protected, only if openaiApiKey + prompts available)
  if (deps.prompts && deps.openaiApiKey && deps.usageTracker) {
    app.use(
      '/api/realtime/*',
      authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }),
    );
    app.route('/api/realtime', createRealtimeRoute({
      db: deps.db,
      openaiApiKey: deps.openaiApiKey,
      prompts: deps.prompts,
      usageTracker: deps.usageTracker,
      nowMs: deps.nowMs,
      featureFlag: deps.realtimeEnabled ?? false,
      mintFn: deps.mintFn,
    }));
  }

  // TTS routes (protected, only if enabled + API key + workspace + prompts)
  if (
    deps.ttsEnabled &&
    deps.geminiApiKey &&
    deps.workspaceDir &&
    deps.prompts
  ) {
    app.use(
      '/api/tts/*',
      authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }),
    );
    // Rate-limit + budget guard apply to synthesis only (POST). The GET audio
    // endpoint streams a cached file — it must keep working even when the
    // budget is exhausted, and we don't want cache replay to eat the quota.
    const ttsRateLimiter = createRateLimiter({
      windowMs: 60_000,
      max: 10,
      keyBy: (c) => c.get('userId') ?? ipKey(c),
    });
    const ttsBudgetGuard = budgetGuard({ db: deps.db, nowMs: deps.nowMs });
    const postOnly =
      (mw: ReturnType<typeof createRateLimiter>): ReturnType<typeof createRateLimiter> =>
      async (c, next) => {
        if (c.req.method !== 'POST') return next();
        return mw(c, next);
      };
    app.use('/api/tts/:messageId', postOnly(ttsRateLimiter));
    app.use('/api/tts/:messageId', postOnly(ttsBudgetGuard));
    app.route(
      '/api/tts',
      createTtsRoutes({
        db: deps.db,
        workspaceDir: deps.workspaceDir,
        geminiApiKey: deps.geminiApiKey,
        defaultVoice: deps.ttsDefaultVoice ?? 'Kore',
        maxChars: deps.ttsMaxChars ?? 4500,
        nowMs: deps.nowMs,
      }),
    );
  }

  // Settings routes (protected)
  app.use('/api/settings', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
  app.route('/api/settings', createSettingsRoutes({ db: deps.db }));

  // Usage routes (protected)
  app.use('/api/usage/*', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
  app.route('/api/usage', createUsageRoutes({ db: deps.db, nowMs: deps.nowMs }));

  // Todos routes (protected)
  app.use('/api/todos/*', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
  app.use('/api/todos', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
  app.route('/api/todos', createTodosRoutes({ db: deps.db, nowMs: deps.nowMs }));

  // MCP routes (protected) — registry of remote MCP connectors.
  app.use('/api/mcp/*', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
  app.use('/api/mcp', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
  app.route('/api/mcp', createMcpRoutes({ db: deps.db }));

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

    // Vector store routes (M8A file_search) — need openaiApiKey
    if (deps.openaiApiKey) {
      app.use('/api/vector-store/*', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
      app.use('/api/vector-store', authGuard({ db: deps.db, jwt: deps.jwt, nowMs: deps.nowMs }));
      app.route(
        '/api/vector-store',
        createVectorStoreRoutes({
          db: deps.db,
          workspaceDir: deps.workspaceDir,
          openaiApiKey: deps.openaiApiKey,
          nowMs: deps.nowMs,
        }),
      );
    }
  }

  // E2E-only helpers. Triple-gated: E2E=1 AND NODE_ENV !== 'production' AND
  // an explicit fail-fast above makes it impossible to mount these routes in
  // a production build even if both flags get set by accident.
  if (process.env.E2E === '1' && process.env.NODE_ENV === 'production') {
    throw new Error(
      '[fatal] refusing to start: E2E=1 is incompatible with NODE_ENV=production. ' +
      'These routes provide passwordless session issuance and must NEVER be mounted in production.',
    );
  }
  if (process.env.E2E === '1' && process.env.NODE_ENV !== 'production') {
    console.warn('[api] /!\\ E2E routes mounted (/api/__e2e__/*) — passwordless dev-login enabled. DO NOT USE IN PRODUCTION.');
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
      const domainAttr = deps.cookieDomain ? `; Domain=${deps.cookieDomain}` : '';
      const secureAttr = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      const cookie = `buck_session=${sessionJwt}; Path=/; HttpOnly; SameSite=Lax${secureAttr}; Max-Age=${SESSION_TTL_SECONDS}${domainAttr}`;
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
