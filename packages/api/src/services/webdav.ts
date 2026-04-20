import { Hono } from 'hono';
import fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';
import { assertSafePath } from '../utils/path-safe.js';
import { HttpError } from '../utils/http-error.js';
import { isProtectedPath } from '../utils/protected-paths.js';
import type { JwtService } from './jwt.js';

export interface WebDAVDeps {
  workspaceDir: string;
  jwt: JwtService;
}

// MIME type helper
const MIME_MAP: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml',
};

function guessMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] ?? 'application/octet-stream';
}

/** Extract relative path from the request URL, stripping the /webdav prefix. */
function extractRelativePath(requestPath: string): string {
  // Strip /webdav prefix, normalize
  const stripped = requestPath.replace(/^\/webdav\/?/, '');
  return decodeURIComponent(stripped) || '.';
}

/** Format a Date as RFC 1123 (e.g. "Thu, 01 Jan 2026 00:00:00 GMT"). */
function httpDate(d: Date): string {
  return d.toUTCString();
}

/** Build a PROPFIND XML response for a single resource. */
function propEntry(
  href: string,
  stat: Stats,
  isDirectory: boolean,
  displayName: string,
): string {
  const lastMod = httpDate(stat.mtime);
  const creationDate = stat.birthtime.toISOString();
  const resourceType = isDirectory ? '<D:collection/>' : '';
  const contentLength = isDirectory ? '' : `<D:getcontentlength>${stat.size}</D:getcontentlength>`;
  const contentType = isDirectory ? '' : `<D:getcontenttype>${guessMime(displayName)}</D:getcontenttype>`;

  return `<D:response>
<D:href>${encodeURI(href)}</D:href>
<D:propstat>
<D:prop>
<D:displayname>${escapeXml(displayName)}</D:displayname>
<D:resourcetype>${resourceType}</D:resourcetype>
<D:getlastmodified>${lastMod}</D:getlastmodified>
<D:creationdate>${creationDate}</D:creationdate>
${contentLength}
${contentType}
</D:prop>
<D:status>HTTP/1.1 200 OK</D:status>
</D:propstat>
</D:response>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function forbidProtected(relative: string): Response | null {
  const dir = isProtectedPath(relative);
  if (!dir) return null;
  return new Response(
    `Forbidden — cannot write inside protected directory: ${dir}`,
    { status: 403 },
  );
}

const DAV_METHODS = 'OPTIONS, PROPFIND, GET, HEAD, PUT, DELETE, MKCOL, MOVE, COPY';

/**
 * WebDAV auth middleware. Extracts JWT from:
 * - Bearer <token> header
 * - Basic auth (password = JWT, username ignored)
 * Verifies scope=webdav.
 *
 * SECURITY INVARIANT: this middleware MUST NOT read cookies. WebDAV is
 * excluded from the CSRF middleware, so authenticating via the browser
 * session cookie (buck_session) would expose every WebDAV mutation to CSRF
 * forgery from any cross-origin page. Authentication is header-only and
 * scope-restricted to webdav. Locked in by webdav.test.ts.
 */
async function webdavAuth(
  jwt: JwtService,
  authHeader: string | undefined,
): Promise<{ userId: string } | null> {
  if (!authHeader) return null;

  let token: string | null = null;

  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (authHeader.startsWith('Basic ')) {
    const decoded = atob(authHeader.slice(6).trim());
    // Basic auth format: username:password — we use password as the JWT
    const colonIdx = decoded.indexOf(':');
    token = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : decoded;
  }

  if (!token) return null;

  try {
    const payload = await jwt.verify(token);
    if (payload.scope !== 'webdav') return null;
    if (!payload.sub) return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

export function createWebDAVRoutes(deps: WebDAVDeps): Hono {
  const app = new Hono();
  const { workspaceDir, jwt } = deps;

  // Auth middleware for all WebDAV requests
  app.use('*', async (c, next) => {
    const auth = await webdavAuth(jwt, c.req.header('authorization'));
    if (!auth) {
      return new Response('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Buck Writer"',
        },
      });
    }
    await next();
  });

  // OPTIONS — advertise WebDAV capabilities
  app.on('OPTIONS', '*', (c) => {
    return new Response(null, {
      status: 200,
      headers: {
        Allow: DAV_METHODS,
        DAV: '1, 2',
        'Content-Length': '0',
      },
    });
  });

  // PROPFIND — list directory or file properties
  app.on('PROPFIND', '*', async (c) => {
    const relative = extractRelativePath(c.req.path);
    const abs = await assertSafePath(workspaceDir, relative);

    let stat: Stats;
    try {
      stat = await fs.stat(abs);
    } catch {
      return new Response('Not Found', { status: 404 });
    }

    // Depth header: 0 = just this resource, 1 = this + children
    const depth = c.req.header('depth') ?? '1';

    const entries: string[] = [];
    const basePath = c.req.path.endsWith('/') ? c.req.path : c.req.path + '/';

    if (stat.isDirectory()) {
      // Add the directory itself
      entries.push(propEntry(
        c.req.path.endsWith('/') ? c.req.path : c.req.path + '/',
        stat,
        true,
        path.basename(abs) || 'workspace',
      ));

      if (depth !== '0') {
        const dirEntries = await fs.readdir(abs, { withFileTypes: true });
        for (const entry of dirEntries) {
          // Hide .attachments
          if (entry.name === '.attachments') continue;

          const entryPath = path.join(abs, entry.name);
          try {
            const entryStat = await fs.stat(entryPath);
            const href = basePath + encodeURIComponent(entry.name) + (entry.isDirectory() ? '/' : '');
            entries.push(propEntry(href, entryStat, entry.isDirectory(), entry.name));
          } catch {
            // Skip entries we can't stat
          }
        }
      }
    } else {
      // Single file
      entries.push(propEntry(c.req.path, stat, false, path.basename(abs)));
    }

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
${entries.join('\n')}
</D:multistatus>`;

    return new Response(xml, {
      status: 207,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    });
  });

  // GET — download file (open+fstat+read on the same fd, no TOCTOU race)
  app.get('*', async (c) => {
    const relative = extractRelativePath(c.req.path);
    const abs = await assertSafePath(workspaceDir, relative);

    let fh;
    try {
      fh = await fs.open(abs, 'r');
    } catch {
      return new Response('Not Found', { status: 404 });
    }
    try {
      const stat = await fh.stat();
      if (stat.isDirectory()) {
        return new Response('Is a directory', { status: 405 });
      }
      const content = await fh.readFile();
      return new Response(content, {
        status: 200,
        headers: {
          'Content-Type': guessMime(abs),
          'Content-Length': String(stat.size),
          'Last-Modified': httpDate(stat.mtime),
        },
      });
    } finally {
      await fh.close();
    }
  });

  // HEAD — file metadata without body
  app.on('HEAD', '*', async (c) => {
    const relative = extractRelativePath(c.req.path);
    const abs = await assertSafePath(workspaceDir, relative);

    let stat: Stats;
    try {
      stat = await fs.stat(abs);
    } catch {
      return new Response(null, { status: 404 });
    }

    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': stat.isDirectory() ? 'httpd/unix-directory' : guessMime(abs),
        'Content-Length': String(stat.size),
        'Last-Modified': httpDate(stat.mtime),
      },
    });
  });

  // PUT — upload/create file
  app.put('*', async (c) => {
    const relative = extractRelativePath(c.req.path);
    const blocked = forbidProtected(relative);
    if (blocked) return blocked;
    const abs = await assertSafePath(workspaceDir, relative);

    // Create parent directories
    await fs.mkdir(path.dirname(abs), { recursive: true });

    const body = await c.req.arrayBuffer();
    await fs.writeFile(abs, Buffer.from(body));

    return new Response(null, { status: 201 });
  });

  // MKCOL — create directory
  app.on('MKCOL', '*', async (c) => {
    const relative = extractRelativePath(c.req.path);
    const blocked = forbidProtected(relative);
    if (blocked) return blocked;
    const abs = await assertSafePath(workspaceDir, relative);

    // Check parent exists
    const parent = path.dirname(abs);
    try {
      await fs.stat(parent);
    } catch {
      return new Response('Conflict — parent does not exist', { status: 409 });
    }

    // Check if already exists
    try {
      await fs.stat(abs);
      return new Response('Method Not Allowed — already exists', { status: 405 });
    } catch {
      // Good — doesn't exist yet
    }

    await fs.mkdir(abs);
    return new Response(null, { status: 201 });
  });

  // DELETE — delete file or directory
  app.delete('*', async (c) => {
    const relative = extractRelativePath(c.req.path);
    const blocked = forbidProtected(relative);
    if (blocked) return blocked;
    const abs = await assertSafePath(workspaceDir, relative);

    try {
      await fs.stat(abs);
    } catch {
      return new Response('Not Found', { status: 404 });
    }

    await fs.rm(abs, { recursive: true });
    return new Response(null, { status: 204 });
  });

  // MOVE — rename/move
  app.on('MOVE', '*', async (c) => {
    const relative = extractRelativePath(c.req.path);
    const blockedSrc = forbidProtected(relative);
    if (blockedSrc) return blockedSrc;
    const abs = await assertSafePath(workspaceDir, relative);

    const destination = c.req.header('destination');
    if (!destination) {
      return new Response('Bad Request — Destination header required', { status: 400 });
    }

    // Parse destination — can be absolute URL or relative path
    let destPath: string;
    try {
      const url = new URL(destination, `http://${c.req.header('host') ?? 'localhost'}`);
      destPath = extractRelativePath(url.pathname);
    } catch {
      destPath = extractRelativePath(destination);
    }

    const blockedDest = forbidProtected(destPath);
    if (blockedDest) return blockedDest;
    const destAbs = await assertSafePath(workspaceDir, destPath);

    // Check source exists
    try {
      await fs.stat(abs);
    } catch {
      return new Response('Not Found', { status: 404 });
    }

    // Check if destination already exists
    const overwrite = c.req.header('overwrite') !== 'F';
    try {
      await fs.stat(destAbs);
      if (!overwrite) {
        return new Response('Precondition Failed — destination exists', { status: 412 });
      }
      await fs.rm(destAbs, { recursive: true });
    } catch {
      // Destination doesn't exist — fine
    }

    // Ensure parent of destination exists
    await fs.mkdir(path.dirname(destAbs), { recursive: true });
    await fs.rename(abs, destAbs);

    return new Response(null, { status: 201 });
  });

  // COPY — copy file or directory
  app.on('COPY', '*', async (c) => {
    const relative = extractRelativePath(c.req.path);
    const abs = await assertSafePath(workspaceDir, relative);

    const destination = c.req.header('destination');
    if (!destination) {
      return new Response('Bad Request — Destination header required', { status: 400 });
    }

    let destPath: string;
    try {
      const url = new URL(destination, `http://${c.req.header('host') ?? 'localhost'}`);
      destPath = extractRelativePath(url.pathname);
    } catch {
      destPath = extractRelativePath(destination);
    }

    const blockedDest = forbidProtected(destPath);
    if (blockedDest) return blockedDest;
    const destAbs = await assertSafePath(workspaceDir, destPath);

    try {
      await fs.stat(abs);
    } catch {
      return new Response('Not Found', { status: 404 });
    }

    const overwrite = c.req.header('overwrite') !== 'F';
    try {
      await fs.stat(destAbs);
      if (!overwrite) {
        return new Response('Precondition Failed — destination exists', { status: 412 });
      }
      await fs.rm(destAbs, { recursive: true });
    } catch {
      // Destination doesn't exist — fine
    }

    await fs.mkdir(path.dirname(destAbs), { recursive: true });
    await fs.cp(abs, destAbs, { recursive: true });

    return new Response(null, { status: 201 });
  });

  // Error handler for HttpError (e.g. path traversal → 403)
  app.onError((err, _c) => {
    if (err instanceof HttpError) {
      return new Response(err.message, { status: err.status });
    }
    console.error('[webdav] unhandled error', err);
    return new Response('Internal Server Error', { status: 500 });
  });

  return app;
}
