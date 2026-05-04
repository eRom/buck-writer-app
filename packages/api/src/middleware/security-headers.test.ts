import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { securityHeaders } from './security-headers.js';

describe('security-headers', () => {
  const mkApp = () => {
    const app = new Hono();
    app.use('*', securityHeaders());
    app.get('/', (c) => c.text('ok'));
    return app;
  };

  it('sets HSTS, XCTO, XFO, Referrer-Policy', async () => {
    const res = await mkApp().request('/');
    expect(res.headers.get('strict-transport-security')).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin',
    );
  });

  it('sets strict CSP allowing OpenAI', async () => {
    const res = await mkApp().request('/');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('https://api.openai.com');
  });

  it("CSP includes object-src 'none' and Trusted Types directive", async () => {
    const res = await mkApp().request('/');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("require-trusted-types-for 'script'");
  });

  it('sets Permissions-Policy locking down powerful features (microphone allowed)', async () => {
    const res = await mkApp().request('/');
    const pp = res.headers.get('permissions-policy') ?? '';
    expect(pp).toContain('microphone=(self)');
    expect(pp).toContain('camera=()');
    expect(pp).toContain('geolocation=()');
    expect(pp).toContain('payment=()');
    expect(pp).toContain('usb=()');
    expect(pp).toContain('magnetometer=()');
    expect(pp).toContain('gyroscope=()');
    expect(pp).toContain('accelerometer=()');
  });
});
