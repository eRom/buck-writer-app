import type { Context, MiddlewareHandler } from 'hono';

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

export const ipKey = (c: Context): string => {
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return c.req.header('cf-connecting-ip') ?? 'unknown';
};
