import type { MiddlewareHandler } from 'hono';
import crypto from 'node:crypto';
import { parseCookies } from '../utils/cookies.js';

export const CSRF_COOKIE = 'buck_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function randomToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

export interface CsrfOptions {
  /**
   * Expected Origin value for state-changing requests (defense-in-depth
   * against XSS-elevation-to-CSRF). When set, non-safe methods carrying an
   * Origin header that doesn't match are rejected. Missing Origin is
   * allowed because non-browser clients (curl, Caddy health probes) omit
   * it.
   */
  expectedOrigin?: string;
}

export function csrfMiddleware(opts: CsrfOptions = {}): MiddlewareHandler {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const expectedOrigin = opts.expectedOrigin?.replace(/\/+$/, '');
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

    // Origin check — closes the XSS→CSRF elevation path partially. An Origin
    // header set by a browser cannot be spoofed by attacker JS running on a
    // third-party origin. Missing Origin is tolerated (non-browser clients).
    if (expectedOrigin) {
      const origin = c.req.header('origin');
      if (origin && origin.replace(/\/+$/, '') !== expectedOrigin) {
        return c.json(
          { error: { code: 'bad_origin', message: 'unexpected origin' } },
          403,
        );
      }
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
