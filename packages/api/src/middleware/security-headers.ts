import type { MiddlewareHandler } from 'hono';

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://api.openai.com https://*.openai.com",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Content-Security-Policy', CSP);
    c.header('Cross-Origin-Opener-Policy', 'same-origin');
  };
}
