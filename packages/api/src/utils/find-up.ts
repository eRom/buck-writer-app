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
 * Parse a .env file into process.env.
 * Does NOT override existing process.env values.
 */
function parseEnvFile(filePath: string): void {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

/**
 * Load env files with priority: .env.development (if not production) > .env
 * Walks up from cwd to find them. No external dependency.
 */
export function loadDotenv(): void {
  // .env.development first (higher priority, doesn't override process.env)
  if (process.env.NODE_ENV !== 'production') {
    const devPath = findUpSync('.env.development');
    if (devPath) parseEnvFile(devPath);
  }
  // .env second (fills in remaining vars)
  const envPath = findUpSync('.env');
  if (envPath) parseEnvFile(envPath);
}
