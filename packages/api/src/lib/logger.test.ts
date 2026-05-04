import { describe, it, expect } from 'vitest';
import pino from 'pino';

// Replicate the redact config from `logger.ts` against a sink so we can
// assert the redaction contract without touching the global stdout.
function makeProbe() {
  const lines: string[] = [];
  const sink = pino(
    {
      level: 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-csrf-token"]',
          'req.headers["x-forwarded-authorization"]',
          'req.body.token',
          'req.body.password',
          'req.body.email',
          'res.headers["set-cookie"]',
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
    },
    {
      write: (chunk: string) => {
        lines.push(chunk);
      },
    } as unknown as NodeJS.WritableStream,
  );
  return { logger: sink, lines };
}

describe('logger redact (REC-06)', () => {
  it('redacts request-scoped Authorization and Cookie headers', () => {
    const { logger, lines } = makeProbe();
    logger.info({
      req: {
        headers: {
          authorization: 'Bearer sk-very-secret',
          cookie: 'buck_session=jwt-blob; buck_csrf=tok',
          'x-csrf-token': 'csrf-blob',
          'x-forwarded-authorization': 'Bearer mcp-secret',
        },
      },
    }, 'incoming');
    const out = lines.join('');
    expect(out).not.toContain('sk-very-secret');
    expect(out).not.toContain('jwt-blob');
    expect(out).not.toContain('csrf-blob');
    expect(out).not.toContain('mcp-secret');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts a top-level email field anywhere in the payload', () => {
    const { logger, lines } = makeProbe();
    logger.info({ user: { id: 'u-1', email: 'leak@example.com' } }, 'lookup');
    const out = lines.join('');
    expect(out).not.toContain('leak@example.com');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts known secret env names and free-floating tokens', () => {
    const { logger, lines } = makeProbe();
    logger.warn({
      env: {
        AUTH_JWT_SECRET: 'aaaaaaaa',
        OPENAI_API_KEY: 'sk-bbbbbb',
        RESEND_API_KEY: 're_cccccc',
      },
      ctx: { token: 'magic-link-tok', apiKey: 'sk-zzz' },
    }, 'config drift');
    const out = lines.join('');
    expect(out).not.toContain('aaaaaaaa');
    expect(out).not.toContain('sk-bbbbbb');
    expect(out).not.toContain('re_cccccc');
    expect(out).not.toContain('magic-link-tok');
    expect(out).not.toContain('sk-zzz');
  });

  it('preserves non-sensitive fields', () => {
    const { logger, lines } = makeProbe();
    logger.info({ stage: 'consolidate', count: 42, sessionId: 'sess-1' }, 'tick');
    const out = lines.join('');
    expect(out).toContain('"stage":"consolidate"');
    expect(out).toContain('"count":42');
    expect(out).toContain('"sessionId":"sess-1"');
  });
});
