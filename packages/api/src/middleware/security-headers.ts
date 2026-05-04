import type { MiddlewareHandler } from 'hono';

// REC-11 (P3, residual risk). `style-src 'unsafe-inline'` is intentional
// and accepted for now. The web SPA uses React + shadcn + Tailwind v4
// which produce many inline `style="..."` attributes (Radix positioning,
// shadcn portals, Tailwind variant generation). Removing 'unsafe-inline'
// requires either:
//   (a) per-request nonces, which need SSR — Buck is a Vite SPA today, no SSR
//   (b) a build-time hash list for every inline style — Tailwind v4.2 does
//       not yet expose a stable `csp.hashes` build output (re-evaluate when
//       Tailwind 4.x ships it or we move to SSR)
// `script-src` already excludes 'unsafe-inline', which is the high-impact
// half of the protection. Stored XSS via inline <style> remains theoretical
// (the CSP `object-src 'none'` + `frame-ancestors 'none'` close the worst
// CSS-based exfil paths), and React's text-content escaping makes the
// injection vector itself unlikely.
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://api.openai.com https://*.openai.com",
  "font-src 'self' data:",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Chromium-only; graceful degradation elsewhere.
  "require-trusted-types-for 'script'",
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
    // Permissions-Policy: only microphone is needed (Realtime voice). All
    // other powerful features are disabled site-wide.
    c.header(
      'Permissions-Policy',
      'microphone=(self), camera=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
    );
  };
}
