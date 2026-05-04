import pino from 'pino';

/**
 * Project-wide structured logger (Pino).
 *
 * Use `logger.*` instead of `console.*` in any path that could surface
 * user data, tokens or secrets — `redact.paths` strips a fixed set of
 * known-sensitive fields before they are serialised.
 *
 * `console.warn` / `console.error` remain acceptable for purely
 * operational messages that carry no user data (boot lines, config
 * dumps without secrets, irrecoverable startup errors).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      // Request-scoped surfaces.
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'req.headers["x-forwarded-authorization"]',
      'req.body.token',
      'req.body.password',
      'req.body.email',
      'res.headers["set-cookie"]',
      // Free-floating fields anywhere in the log object.
      '*.token',
      '*.tokenHash',
      '*.password',
      '*.apiKey',
      '*.api_key',
      '*.secret',
      '*.cookie',
      '*.authorization',
      '*.email',
      '*.AUTH_JWT_SECRET',
      '*.RESEND_API_KEY',
      '*.OPENAI_API_KEY',
      '*.GEMINI_API_KEY',
      '*.MCP_SHARED_SECRET',
      '*.EDGE_INVOKE_KEY',
      '*.SUPABASE_SERVICE_ROLE_KEY',
    ],
    censor: '[REDACTED]',
  },
  // Stream pretty-printed lines to stdout in dev; ship structured JSON
  // in prod so a future log-shipper can consume it untouched.
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss' },
        },
});
