/**
 * Root-level directories that hold LLM-controlling assets (system prompts,
 * skills, live-editable runtime files). Writes, renames, deletes and moves
 * into these paths must be rejected on every FS-mutating surface:
 * workspace route, WebDAV, chat LLM tools.
 *
 * Adding a new protected root? Update this list AND cover every surface
 * with a regression test.
 */
export const PROTECTED_ROOT_DIRS = ['prompts', 'skills', 'systems'] as const;

export type ProtectedDir = (typeof PROTECTED_ROOT_DIRS)[number];

function normalize(relPath: string): string {
  return relPath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/**
 * Returns the matching protected root if `relPath` is equal to or nested
 * inside one, otherwise null. Accepts backslashes, leading/trailing
 * slashes. Does NOT resolve symlinks — use together with `assertSafePath`.
 */
export function isProtectedPath(relPath: string): ProtectedDir | null {
  const n = normalize(relPath);
  for (const dir of PROTECTED_ROOT_DIRS) {
    if (n === dir || n.startsWith(dir + '/')) return dir;
  }
  return null;
}
