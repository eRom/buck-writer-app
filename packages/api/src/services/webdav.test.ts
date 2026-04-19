import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createWebDAVRoutes } from './webdav.js';
import { createJwtService } from './jwt.js';

const secret = 'a'.repeat(32);
const jwt = createJwtService({ secret, issuer: 'buck', audience: 'buck-web' });

let tmpDir: string;
let app: ReturnType<typeof createWebDAVRoutes>;

async function req(
  method: string,
  urlPath: string,
  opts: { headers?: Record<string, string>; body?: string | Buffer } = {},
) {
  const url = `http://localhost${urlPath}`;
  const init: RequestInit = {
    method,
    headers: opts.headers ?? {},
  };
  if (opts.body !== undefined) {
    init.body = opts.body;
  }
  return app.request(url, init);
}

async function authedReq(
  method: string,
  urlPath: string,
  opts: { headers?: Record<string, string>; body?: string | Buffer } = {},
) {
  const token = await jwt.sign({ sub: 'user-1', scope: 'webdav' }, '1h');
  return req(method, urlPath, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...opts.headers },
  });
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webdav-test-'));
  app = createWebDAVRoutes({ workspaceDir: tmpDir, jwt });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('WebDAV auth', () => {
  it('returns 401 without credentials', async () => {
    const res = await req('OPTIONS', '/webdav/');
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Basic realm="Buck Writer"');
  });

  it('returns 401 with invalid JWT', async () => {
    const res = await req('OPTIONS', '/webdav/', {
      headers: { Authorization: 'Bearer garbage.token.here' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong scope (app instead of webdav)', async () => {
    const token = await jwt.sign({ sub: 'user-1', scope: 'app' }, '1h');
    const res = await req('OPTIONS', '/webdav/', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it('accepts valid Bearer JWT with scope=webdav', async () => {
    const res = await authedReq('OPTIONS', '/webdav/');
    expect(res.status).toBe(200);
  });

  it('accepts Basic auth with JWT as password', async () => {
    const token = await jwt.sign({ sub: 'user-1', scope: 'webdav' }, '1h');
    const basic = btoa(`ignored:${token}`);
    const res = await req('OPTIONS', '/webdav/', {
      headers: { Authorization: `Basic ${basic}` },
    });
    expect(res.status).toBe(200);
  });

  // Defense-in-depth: WebDAV is excluded from the CSRF middleware, so a
  // session cookie (scope=app) must NEVER authenticate WebDAV requests —
  // otherwise a cross-origin browser could forge uploads/deletes via cookie.
  it('rejects requests authenticated only by buck_session cookie', async () => {
    const sessionJwt = await jwt.sign({ sub: 'user-1', scope: 'app' }, '1h');
    const res = await req('OPTIONS', '/webdav/', {
      headers: { cookie: `buck_session=${sessionJwt}` },
    });
    expect(res.status).toBe(401);
  });

  it('rejects even with a webdav-scoped JWT delivered as cookie (must be header)', async () => {
    const token = await jwt.sign({ sub: 'user-1', scope: 'webdav' }, '1h');
    const res = await req('OPTIONS', '/webdav/', {
      headers: { cookie: `buck_session=${token}` },
    });
    expect(res.status).toBe(401);
  });
});

describe('OPTIONS', () => {
  it('returns WebDAV headers', async () => {
    const res = await authedReq('OPTIONS', '/webdav/');
    expect(res.status).toBe(200);
    expect(res.headers.get('Allow')).toContain('PROPFIND');
    expect(res.headers.get('Allow')).toContain('GET');
    expect(res.headers.get('Allow')).toContain('PUT');
    expect(res.headers.get('Allow')).toContain('DELETE');
    expect(res.headers.get('Allow')).toContain('MKCOL');
    expect(res.headers.get('Allow')).toContain('MOVE');
    expect(res.headers.get('DAV')).toBe('1, 2');
  });
});

describe('PROPFIND', () => {
  it('lists empty workspace root', async () => {
    const res = await authedReq('PROPFIND', '/webdav/');
    expect(res.status).toBe(207);
    const xml = await res.text();
    expect(xml).toContain('multistatus');
    expect(xml).toContain('collection');
  });

  it('lists directory contents', async () => {
    await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'hello');
    await fs.mkdir(path.join(tmpDir, 'subdir'));

    const res = await authedReq('PROPFIND', '/webdav/');
    expect(res.status).toBe(207);
    const xml = await res.text();
    expect(xml).toContain('hello.txt');
    expect(xml).toContain('subdir');
  });

  it('hides .attachments directory', async () => {
    await fs.mkdir(path.join(tmpDir, '.attachments'));
    await fs.writeFile(path.join(tmpDir, '.attachments', 'secret.bin'), 'x');

    const res = await authedReq('PROPFIND', '/webdav/');
    const xml = await res.text();
    expect(xml).not.toContain('.attachments');
  });

  it('returns 404 for non-existent path', async () => {
    const res = await authedReq('PROPFIND', '/webdav/nope');
    expect(res.status).toBe(404);
  });

  it('depth 0 returns only self', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.txt'), 'a');
    const res = await authedReq('PROPFIND', '/webdav/', {
      headers: { Depth: '0' },
    });
    const xml = await res.text();
    expect(xml).not.toContain('a.txt');
    expect(xml).toContain('collection');
  });
});

describe('GET', () => {
  it('downloads a file', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.txt'), 'content here');
    const res = await authedReq('GET', '/webdav/test.txt');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('content here');
    expect(res.headers.get('Content-Type')).toBe('text/plain');
  });

  it('returns 404 for missing file', async () => {
    const res = await authedReq('GET', '/webdav/nope.txt');
    expect(res.status).toBe(404);
  });

  it('returns 405 for directory', async () => {
    await fs.mkdir(path.join(tmpDir, 'dir'));
    const res = await authedReq('GET', '/webdav/dir');
    expect(res.status).toBe(405);
  });
});

describe('PUT', () => {
  it('creates a new file', async () => {
    const res = await authedReq('PUT', '/webdav/new.txt', { body: 'hello world' });
    expect(res.status).toBe(201);
    const content = await fs.readFile(path.join(tmpDir, 'new.txt'), 'utf8');
    expect(content).toBe('hello world');
  });

  it('creates parent directories', async () => {
    const res = await authedReq('PUT', '/webdav/a/b/c.txt', { body: 'deep' });
    expect(res.status).toBe(201);
    const content = await fs.readFile(path.join(tmpDir, 'a', 'b', 'c.txt'), 'utf8');
    expect(content).toBe('deep');
  });
});

describe('MKCOL', () => {
  it('creates a directory', async () => {
    const res = await authedReq('MKCOL', '/webdav/newdir');
    expect(res.status).toBe(201);
    const stat = await fs.stat(path.join(tmpDir, 'newdir'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('returns 405 if already exists', async () => {
    await fs.mkdir(path.join(tmpDir, 'exists'));
    const res = await authedReq('MKCOL', '/webdav/exists');
    expect(res.status).toBe(405);
  });

  it('returns 409 if parent missing', async () => {
    const res = await authedReq('MKCOL', '/webdav/a/b/c');
    expect(res.status).toBe(409);
  });
});

describe('DELETE', () => {
  it('deletes a file', async () => {
    await fs.writeFile(path.join(tmpDir, 'bye.txt'), 'gone');
    const res = await authedReq('DELETE', '/webdav/bye.txt');
    expect(res.status).toBe(204);
    await expect(fs.stat(path.join(tmpDir, 'bye.txt'))).rejects.toThrow();
  });

  it('deletes a directory recursively', async () => {
    await fs.mkdir(path.join(tmpDir, 'dir'));
    await fs.writeFile(path.join(tmpDir, 'dir', 'file.txt'), 'x');
    const res = await authedReq('DELETE', '/webdav/dir');
    expect(res.status).toBe(204);
    await expect(fs.stat(path.join(tmpDir, 'dir'))).rejects.toThrow();
  });

  it('returns 404 for missing resource', async () => {
    const res = await authedReq('DELETE', '/webdav/nope');
    expect(res.status).toBe(404);
  });
});

describe('MOVE', () => {
  it('moves a file', async () => {
    await fs.writeFile(path.join(tmpDir, 'src.txt'), 'data');
    const res = await authedReq('MOVE', '/webdav/src.txt', {
      headers: { Destination: '/webdav/dest.txt' },
    });
    expect(res.status).toBe(201);
    await expect(fs.stat(path.join(tmpDir, 'src.txt'))).rejects.toThrow();
    const content = await fs.readFile(path.join(tmpDir, 'dest.txt'), 'utf8');
    expect(content).toBe('data');
  });

  it('returns 400 without Destination header', async () => {
    await fs.writeFile(path.join(tmpDir, 'src.txt'), 'data');
    const res = await authedReq('MOVE', '/webdav/src.txt');
    expect(res.status).toBe(400);
  });
});

describe('COPY', () => {
  it('copies a file', async () => {
    await fs.writeFile(path.join(tmpDir, 'orig.txt'), 'copy me');
    const res = await authedReq('COPY', '/webdav/orig.txt', {
      headers: { Destination: '/webdav/clone.txt' },
    });
    expect(res.status).toBe(201);
    // Original still exists
    expect(await fs.readFile(path.join(tmpDir, 'orig.txt'), 'utf8')).toBe('copy me');
    // Copy exists
    expect(await fs.readFile(path.join(tmpDir, 'clone.txt'), 'utf8')).toBe('copy me');
  });
});

describe('path traversal protection', () => {
  it('rejects path traversal', async () => {
    const res = await authedReq('GET', '/webdav/../../../etc/passwd');
    expect(res.status).toBe(403);
  });
});
