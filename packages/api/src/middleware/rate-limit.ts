import type { Context, MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

// VULN-005 (P2, accepted residual risk). The bucket store is an
// in-process `Map`, which means a container restart (deploy, OOM,
// healthcheck-driven recreate) clears every counter and resets the
// window for any attacker who was being throttled. This is documented
// in SECURITY.md → "Accepted residual risks". The compensating
// controls are:
//   1. Caddy edge `caddy-rate-limit` plugin in front of buck-api on
//      the Hostinger VPS — buckets there survive Buck restarts.
//   2. fail2ban on the host catching the headline abuse patterns
//      (auth flood, 401 storms).
// Re-evaluate (move to SQLite-backed buckets or a Redis sidecar) when
// either the Caddy edge layer goes away or traffic volume makes the
// restart-window meaningfully exploitable.
interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyBy: (c: Context) => string;
}

export function createRateLimiter(opts: RateLimitOptions): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();
  return async (c, next) => {
    const key = opts.keyBy(c);
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    if (bucket.count >= opts.max) {
      return c.json(
        { error: { code: 'rate_limited', message: 'too many requests' } },
        429,
        { 'Retry-After': String(Math.ceil((bucket.resetAt - now) / 1000)) },
      );
    }
    bucket.count += 1;
    return next();
  };
}

function socketIp(c: Context): string {
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Build the IP key function used by the rate limiter.
 *
 * - trustProxy=false (default): use only the TCP socket peer address.
 *   Any X-Forwarded-For header sent by the client is ignored — this is the
 *   safe default when the API is exposed directly.
 * - trustProxy=true: use the LEFTMOST entry of X-Forwarded-For (the original
 *   client). Only enable this when the API sits behind a reverse proxy that
 *   strips/overwrites X-Forwarded-For with the real client IP (Caddy default).
 *   Falls back to the socket address when the header is missing.
 */
export function createIpKey(trustProxy: boolean): (c: Context) => string {
  if (!trustProxy) {
    return socketIp;
  }
  return (c) => {
    const fwd = c.req.header('x-forwarded-for');
    if (fwd) {
      const first = fwd.split(',')[0]?.trim();
      if (first) return first;
    }
    return socketIp(c);
  };
}
