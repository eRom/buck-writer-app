// packages/api/src/lib/prompts.ts
// System prompt composition helpers.

export interface BuildSystemPromptArgs {
  base: string;
  preferences: Record<string, unknown>;
  activeContext: Record<string, unknown>;
}

/**
 * Appends optional <preferences> and <active_context> XML-style blocks to the
 * base system prompt. Blocks are omitted when their payload is empty so the
 * disabled/degraded memory path produces an unchanged prompt.
 */
export function buildSystemPromptWithMemory(args: BuildSystemPromptArgs): string {
  const prefs = Object.keys(args.preferences).length > 0
    ? `\n<preferences>\n${JSON.stringify(args.preferences, null, 2)}\n</preferences>`
    : '';
  const ctx = Object.keys(args.activeContext).length > 0
    ? `\n<active_context>\n${JSON.stringify(args.activeContext, null, 2)}\n</active_context>`
    : '';
  return `${args.base}${prefs}${ctx}`;
}
