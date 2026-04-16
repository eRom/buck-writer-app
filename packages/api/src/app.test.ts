import { describe, it, expect } from 'vitest';
import { buildApp } from './app.js';

describe('app', () => {
  it('GET /api/health returns ok', async () => {
    const app = buildApp();
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; uptime: number; version: string };
    expect(body.ok).toBe(true);
    expect(typeof body.uptime).toBe('number');
  });

  it('unknown route returns 404 JSON', async () => {
    const app = buildApp();
    const res = await app.request('/api/unknown');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });
});
