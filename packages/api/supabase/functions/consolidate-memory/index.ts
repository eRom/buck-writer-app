// packages/api/supabase/functions/consolidate-memory/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireBearer } from '../_shared/auth.ts';
import { chat, embed, chatCostUsd } from '../_shared/openai.ts';
import { CONSOLIDATION_SYSTEM, buildConsolidationUser } from './prompts.ts';

const DEDUP_THRESHOLD = 0.92;
const LOOKBACK_DAYS = 7;

interface Fact { content: string; importance: number; source_ids: string[] }

Deno.serve(async (req) => {
  const auth = requireBearer(req, Deno.env.get('EDGE_INVOKE_KEY'));
  if (auth) return auth;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const openaiKey = Deno.env.get('OPENAI_API_KEY')!;
  const embedModel = Deno.env.get('OPENAI_EMBEDDING_MODEL') ?? 'text-embedding-3-large';
  const userId = Deno.env.get('BUCK_USER_ID')!;

  // 1. Fetch recent unconsolidated episodes
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400 * 1000).toISOString();
  const { data: episodesRaw, error: fetchErr } = await supabase
    .from('buck_memories')
    .select('id, content')
    .eq('user_id', userId)
    .eq('memory_type', 'episodic')
    .gte('created_at', since)
    .order('created_at', { ascending: true });
  if (fetchErr) return new Response(`fetch failed: ${fetchErr.message}`, { status: 500 });
  const episodes = episodesRaw ?? [];
  if (episodes.length < 3) return new Response(`skipped: only ${episodes.length} episodes`, { status: 200 });

  // 2. LLM extract
  const chatRes = await chat({
    apiKey: openaiKey,
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: CONSOLIDATION_SYSTEM },
      { role: 'user', content: buildConsolidationUser(episodes) },
    ],
    responseFormat: 'json_object',
  });
  const parsed = JSON.parse(chatRes.content) as { facts: Fact[] };
  const facts = parsed.facts ?? [];

  // 3. Log LLM usage
  await supabase.from('buck_memory_usage').insert({
    user_id: userId,
    kind: 'consolidation',
    model: chatRes.model,
    prompt_tok: chatRes.usage.prompt_tokens,
    completion_tok: chatRes.usage.completion_tokens,
    cost_usd: chatCostUsd(chatRes.model, chatRes.usage),
    metadata: { episodes_count: episodes.length, facts_extracted: facts.length },
  });

  // 4. Dedup + upsert facts
  let inserted = 0;
  let merged = 0;
  for (const fact of facts) {
    const { embedding } = await embed(openaiKey, embedModel, fact.content);
    const { data: matches } = await supabase.rpc('match_memories', {
      query_embedding: embedding,
      match_threshold: DEDUP_THRESHOLD,
      match_count: 1,
      filter_user_id: userId,
      filter_type: 'semantic',
    });

    if (matches && matches.length > 0) {
      const existing = matches[0];
      const { data: existingRow } = await supabase
        .from('buck_memories').select('source_ids, importance').eq('id', existing.id).single();
      const newSources = Array.from(new Set([...(existingRow?.source_ids ?? []), ...fact.source_ids]));
      const newImportance = Math.min(1, (existingRow?.importance ?? 0.5) + 0.05);
      await supabase.from('buck_memories').update({
        source_ids: newSources,
        importance: newImportance,
      }).eq('id', existing.id);
      merged += 1;
    } else {
      await supabase.from('buck_memories').insert({
        user_id: userId,
        memory_type: 'semantic',
        content: fact.content,
        embedding,
        importance: Math.max(0, Math.min(1, fact.importance)),
        source_ids: fact.source_ids,
      });
      inserted += 1;
    }
  }

  return new Response(JSON.stringify({
    ok: true, episodes: episodes.length, inserted, merged,
  }), { headers: { 'Content-Type': 'application/json' } });
});
