import { describe, it, expect } from 'vitest';
import { loadEnv } from './env.js';

const base = {
  NODE_ENV: 'test',
  PORT: '3000',
  AUTH_JWT_SECRET: 'a'.repeat(32),
  AUTH_ALLOWED_EMAILS: 'alice@example.com,bob@example.com',
  RESEND_API_KEY: 're_test_xxx',
  RESEND_FROM: 'noreply@romain-ecarnot.com',
  OPENAI_API_KEY: 'sk-test-xxx',
  PUBLIC_BASE_URL: 'https://buck.example.com',
  WORKSPACE_DIR: '/tmp/ws',
  DATABASE_URL: 'file:/tmp/buck.db',
  MCP_BIBLE_URL: 'http://bible-mcp:7801',
  LOG_LEVEL: 'info',
};

describe('env', () => {
  it('loads valid env', () => {
    const env = loadEnv(base);
    expect(env.AUTH_ALLOWED_EMAILS).toEqual(['alice@example.com', 'bob@example.com']);
    expect(env.PORT).toBe(3000);
  });

  it('throws on short JWT secret', () => {
    expect(() => loadEnv({ ...base, AUTH_JWT_SECRET: 'short' })).toThrow(/AUTH_JWT_SECRET/);
  });

  it('throws on bad PUBLIC_BASE_URL', () => {
    expect(() => loadEnv({ ...base, PUBLIC_BASE_URL: 'not a url' })).toThrow();
  });

  it('loads without optional keys (RESEND, OPENAI, MCP_BIBLE)', () => {
    const { RESEND_API_KEY, RESEND_FROM, OPENAI_API_KEY, MCP_BIBLE_URL, ...minimal } = base;
    const env = loadEnv(minimal);
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.MCP_BIBLE_URL).toBeUndefined();
  });

  it('normalises AUTH_ALLOWED_EMAILS to trimmed lowercase', () => {
    const env = loadEnv({ ...base, AUTH_ALLOWED_EMAILS: ' Alice@Example.com ,BOB@example.com' });
    expect(env.AUTH_ALLOWED_EMAILS).toEqual(['alice@example.com', 'bob@example.com']);
  });
});
