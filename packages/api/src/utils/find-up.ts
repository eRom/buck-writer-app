import fs from 'node:fs';
import path from 'node:path';

/**
 * Walk up from cwd looking for a file by name.
 * Returns the absolute path if found, undefined otherwise.
 */
export function findUpSync(filename: string): string | undefined {
  let dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Minimal .env loader — no external dependency.
 * Parses KEY=VALUE lines, ignores comments and empty lines.
 * Does NOT override existing process.env values.
 */
export function loadDotenv(): void {
  const envPath = findUpSync('.env');
  if (!envPath) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
