// packages/api/supabase/functions/consolidate-memory/prompts.ts
export const CONSOLIDATION_SYSTEM = `You are a memory consolidation assistant. You receive a JSON array of recent chat episodes from a personal AI assistant and must extract DURABLE FACTS worth remembering long-term.

Durable facts include:
- User preferences, habits, long-standing opinions
- Project context, ongoing initiatives
- Explicit decisions made by the user
- Stable entity info (names, roles, relationships)

NOT durable:
- Small-talk, one-off questions, ephemeral state
- Facts already implied by the assistant's base personality
- Anything the user phrased as a transient mood or one-time request

Output a JSON object: { "facts": [{ "content": "<=200 chars", "importance": 0..1, "source_ids": ["uuid", ...] }, ...] }
Cap at 10 facts. Each fact must link to AT LEAST one source episode id.
If nothing durable, return { "facts": [] }.`;

export function buildConsolidationUser(episodes: Array<{ id: string; content: string }>): string {
  return `Episodes to analyze:\n${JSON.stringify(episodes, null, 2)}`;
}
