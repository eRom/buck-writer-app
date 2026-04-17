import type { MiddlewareHandler } from 'hono';
import crypto from 'node:crypto';

export const CSRF_COOKIE = 'buck_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function randomToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

function parseCookies(
  raw: string | null | undefined,
): Record<string, string> {
  if (!raw) return {};
  return Object.fromEntries(
    raw.split(';').map((p) => {
      const [k, ...v] = p.trim().split('=');
      return [k ?? '', decodeURIComponent((v.join('=') ?? '').trim())];
    }),
  );
}

export function csrfMiddleware(): MiddlewareHandler {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return async (c, next) => {
    const cookies = parseCookies(c.req.header('cookie'));
    const method = c.req.method.toUpperCase();

    // WebDAV clients cannot send CSRF tokens — bypass for /webdav/* paths
    if (c.req.path.startsWith('/webdav')) {
      return next();
    }

    if (SAFE_METHODS.has(method)) {
      if (!cookies[CSRF_COOKIE]) {
        const fresh = randomToken();
        c.header(
          'Set-Cookie',
          `${CSRF_COOKIE}=${fresh}; Path=/; SameSite=Lax${secure}; Max-Age=2592000`,
        );
      }
      return next();
    }

    const cookie = cookies[CSRF_COOKIE];
    const header = c.req.header(CSRF_HEADER);
    if (!cookie || !header) {
      return c.json(
        { error: { code: 'csrf_missing', message: 'CSRF token missing' } },
        403,
      );
    }
    if (cookie !== header) {
      return c.json(
        { error: { code: 'csrf_mismatch', message: 'CSRF token mismatch' } },
        403,
      );
    }
    return next();
  };
}
