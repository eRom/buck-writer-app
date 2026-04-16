import path from 'node:path';
import fs from 'node:fs/promises';
import { HttpError } from './http-error.js';

export async function assertSafePath(
  rootDir: string,
  relative: string,
): Promise<string> {
  // Resolve symlinks on the root so comparisons against fs.realpath() of child paths work.
  let root: string;
  try {
    root = await fs.realpath(path.resolve(rootDir));
  } catch {
    root = path.resolve(rootDir);
  }
  const joined = path.resolve(root, relative);
  let real = joined;
  try {
    real = await fs.realpath(joined);
  } catch {
    // path doesn't exist yet (e.g. PUT a new file) — use resolved joined path
  }
  if (real !== root && !real.startsWith(root + path.sep)) {
    throw new HttpError(403, 'forbidden_path', 'path outside workspace');
  }
  return real;
}

export function createPathSafe(rootDir: string) {
  return (relative: string) => assertSafePath(rootDir, relative);
}
