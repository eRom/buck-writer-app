// Whitelist-based shell validator. Approach: parse the command into argv,
// reject any shell metacharacters, and require argv[0] to be in ALLOWED_BINS.
// Execution must happen via execFile(argv[0], argv.slice(1)) — never /bin/sh -c.

const ALLOWED_BINS = new Set<string>([
  // read / inspect
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'find', 'echo', 'pwd', 'date',
  'file', 'stat', 'du', 'df', 'tree', 'sort', 'uniq', 'cut', 'awk', 'sed',
  'diff', 'jq', 'which', 'env', 'basename', 'dirname', 'realpath', 'readlink',
  'true', 'false',
  // write / move (no destruction primitives — use delete_file tool instead)
  'mkdir', 'touch', 'cp', 'mv', 'ln',
  // dev toolchain
  'node', 'python', 'python3', 'bun', 'pnpm', 'npm', 'npx', 'git', 'make', 'tsc',
]);

const FORBIDDEN_CHARS = new Set(['|', '&', ';', '<', '>', '(', ')', '{', '}', '`', '$', '\\', '\n', '\r']);

export type ValidationResult =
  | { ok: true; argv: [string, ...string[]] }
  | { ok: false; error: string };

export function validateShellCommand(input: string): ValidationResult {
  const argv = tokenize(input);
  if (argv === null) {
    return { ok: false, error: 'Commande rejetée : caractère shell interdit (|, &, ;, $, `, >, <, \\, …)' };
  }
  const [bin, ...rest] = argv;
  if (bin === undefined) {
    return { ok: false, error: 'Commande vide' };
  }
  if (!ALLOWED_BINS.has(bin)) {
    return { ok: false, error: `Commande rejetée : "${bin}" n'est pas dans la liste blanche` };
  }
  return { ok: true, argv: [bin, ...rest] };
}

export function listAllowedBins(): string[] {
  return [...ALLOWED_BINS].sort();
}

function tokenize(input: string): string[] | null {
  const tokens: string[] = [];
  let cur = '';
  let hasCur = false;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === undefined) break;

    if (quote === "'") {
      if (c === "'") quote = null;
      else { cur += c; hasCur = true; }
      continue;
    }

    if (quote === '"') {
      if (c === '"') quote = null;
      else if (FORBIDDEN_CHARS.has(c)) return null;
      else { cur += c; hasCur = true; }
      continue;
    }

    if (c === "'" || c === '"') {
      quote = c;
      hasCur = true;
      continue;
    }

    if (c === ' ' || c === '\t') {
      if (hasCur) { tokens.push(cur); cur = ''; hasCur = false; }
      continue;
    }

    if (FORBIDDEN_CHARS.has(c)) return null;

    cur += c;
    hasCur = true;
  }

  if (quote !== null) return null;
  if (hasCur) tokens.push(cur);
  return tokens;
}
