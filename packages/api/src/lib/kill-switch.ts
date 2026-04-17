const DESTRUCTIVE_PATTERNS: RegExp[] = [
  // rm targeting absolute system paths (NOT relative paths like workspace/...)
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/([^w\s]|$)/,
  /\brm\s+-rf\s+\/\*/,
  // Disk format / wipe
  /\bmkfs\b/,
  /\bdd\s+.*of=\/dev\//,
  /\bwipefs\b/,
  // Fork bombs
  /:\(\)\s*\{.*\|.*&\s*\}\s*;?\s*:/,
  // System permissions
  /\bchmod\s+(-R\s+)?[0-7]{3,4}\s+\/(etc|usr|bin|sbin|lib|var|boot|sys|proc|dev)\b/,
  /\bchown\s+-R\s+.*\s+\/(etc|usr|bin|sbin|lib|var|boot|sys|proc|dev)\b/,
  // Destructive redirections
  />\s*\/dev\/sd/,
  /\bmv\s+.*\s+\/dev\/null\b/,
  // System shutdown
  /\b(shutdown|reboot|halt|poweroff)\b/,
  /\binit\s+[06]\b/,
  // Kernel module manipulation
  /\binsmod\b/,
  /\brmmod\b/,
  /\bmodprobe\s+-r\b/,
  /\bsysctl\s+-w\b/,
];

export function isDestructiveCommand(command: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(command));
}
